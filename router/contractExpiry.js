import { getPool } from "../Database/connection.js";
import { notifyStaffSide } from "../middleware/notifications.js";
import { RENEW_DURATION_MONTHS } from "../middleware/validation.js";
import { loadCustomerOutstanding, RENEW_OUTSTANDING_MESSAGE } from "./CustomerDashboardRouter.js";
import { cancelCustomerVisitRequests } from "./parking.js";
import { resetCustomerHistory } from "./rentalContracts.js";

export const CONTRACT_GRACE_DAYS = 15;
export const CONTRACT_EXPIRED_CODE = "CONTRACT_EXPIRED";
export const CONTRACT_SUSPENDED_CODE = "CONTRACT_EXPIRED_SUSPENDED";
export const CONTRACT_AUTO_SUSPEND_ACTOR = "ระบบ (สัญญาเช่าหมดอายุ)";
export const CONTRACT_EXPIRED_MESSAGE = "สัญญาเช่าหมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อต่อสัญญา";
export const CONTRACT_SUSPENDED_MESSAGE = `บัญชีถูกระงับเนื่องจากสัญญาเช่าหมดอายุเกิน ${CONTRACT_GRACE_DAYS} วันโดยไม่ได้ต่อสัญญา กรุณาติดต่อเจ้าหน้าที่`;

const EXPIRY_COLUMNS_SQL = `r.rental_end_date,
       DATEDIFF(CURDATE(), DATE(r.rental_end_date)) AS days_expired,
       DATE_ADD(DATE(r.rental_end_date), INTERVAL ${CONTRACT_GRACE_DAYS + 1} DAY) AS suspend_on`;

const EXPIRED_ROOM_JOIN_SQL = `LEFT JOIN Room r ON r.room_number = c.room_number AND r.is_booked = TRUE
       AND r.rental_end_date IS NOT NULL AND r.rental_start_date <= NOW()`;

export function contractExpiryView(row) {
  const daysExpired = row?.rental_end_date == null || row.days_expired == null ? null : Number(row.days_expired);
  const expired = daysExpired != null && daysExpired > 0;
  return {
    expired,
    overdue: expired && daysExpired > CONTRACT_GRACE_DAYS,
    rentalEndDate: expired ? row.rental_end_date : null,
    daysExpired: expired ? daysExpired : 0,
    graceDays: CONTRACT_GRACE_DAYS,
    graceDaysLeft: expired ? Math.max(0, CONTRACT_GRACE_DAYS - daysExpired) : null,
    suspendOn: expired ? row.suspend_on : null,
  };
}

export async function loadCustomerAccess(db, customerId) {
  const [rows] = await db.query(
    `SELECT c.is_suspended, c.room_number, ${EXPIRY_COLUMNS_SQL}
     FROM Customer c ${EXPIRED_ROOM_JOIN_SQL}
     WHERE c.id = ?`,
    [customerId],
  );
  const row = rows[0];
  if (!row) return null;
  return { isSuspended: Boolean(row.is_suspended), roomNumber: row.room_number, contract: contractExpiryView(row) };
}

export async function suspendExpiredCustomer(connection, customerId) {
  const [customers] = await connection.query(
    `SELECT c.id, c.first_name, c.last_name, c.room_number, c.is_suspended, ${EXPIRY_COLUMNS_SQL}
     FROM Customer c ${EXPIRED_ROOM_JOIN_SQL}
     WHERE c.id = ? FOR UPDATE`,
    [customerId],
  );
  const customer = customers[0];
  if (!customer || customer.is_suspended || customer.room_number == null) return null;
  const contract = contractExpiryView(customer);
  if (!contract.overdue) return null;

  const roomNumber = customer.room_number;
  const [rooms] = await connection.query(
    `SELECT id, rental_start_date, rental_end_date FROM Room WHERE room_number = ? FOR UPDATE`,
    [roomNumber],
  );
  const [otherTenants] = await connection.query(
    `SELECT id FROM Customer WHERE room_number = ? AND id <> ? AND is_suspended = FALSE LIMIT 1 FOR UPDATE`,
    [roomNumber, customerId],
  );
  let roomVacated = false;
  if (!otherTenants.length && rooms.length) {
    const [bookings] = await connection.query(
      `SELECT id, room_id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [customerId],
    );
    if (bookings[0]?.room_id === rooms[0].id) {
      await connection.query(
        `UPDATE Booking SET rental_start_date = COALESCE(?, rental_start_date),
                            rental_end_date = COALESCE(?, rental_end_date) WHERE id = ?`,
        [rooms[0].rental_start_date, rooms[0].rental_end_date, bookings[0].id],
      );
    }
    const [roomUpdate] = await connection.query(
      `UPDATE Room SET is_booked = FALSE, rental_start_date = NULL, rental_end_date = NULL,
                       rental_duration_months = NULL, prepaid_until = NULL, billing_start_date = NULL,
                       pending_lump_sum_months = NULL, rent_credit = NULL
       WHERE room_number = ?`,
      [roomNumber],
    );
    roomVacated = roomUpdate.affectedRows > 0;
  }

  await resetCustomerHistory(connection, customerId);
  await connection.query(
    `UPDATE Customer SET is_suspended = TRUE, suspended_at = COALESCE(suspended_at, NOW()), room_number = NULL WHERE id = ?`,
    [customerId],
  );
  await connection.query(
    `UPDATE TenantRequest SET status = 'cancelled', completed_at = NOW(), completed_by_name = ?
     WHERE customer_id = ? AND status IN ('pending', 'in_progress')`,
    [CONTRACT_AUTO_SUSPEND_ACTOR, customerId],
  );
  await cancelCustomerVisitRequests(connection, customerId, CONTRACT_AUTO_SUSPEND_ACTOR);
  await connection.query(
    `UPDATE SafetyIncident
     SET status = 'cancelled', cancelled_by_name = ?, cancelled_at = NOW(), cancel_reason = 'ผู้แจ้งเหตุถูกระงับการใช้งาน'
     WHERE reporter_role = 'Customer' AND reporter_id = ? AND status = 'pending'`,
    [CONTRACT_AUTO_SUSPEND_ACTOR, customerId],
  );
  await connection.query(
    `UPDATE MaintenanceRequest SET status = 'cancelled', completed_at = NOW(), completed_by_name = ?
     WHERE customer_id = ? AND status IN ('pending', 'in_progress')`,
    [CONTRACT_AUTO_SUSPEND_ACTOR, customerId],
  );

  return {
    customerId,
    name: `${customer.first_name} ${customer.last_name}`,
    roomNumber,
    rentalEndDate: customer.rental_end_date,
    roomVacated,
  };
}

export async function suspendExpiredCustomerNow(customerId, db = getPool()) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const suspended = await suspendExpiredCustomer(connection, customerId);
    await connection.commit();
    return suspended;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function findOverdueCustomerIds(db) {
  const [rows] = await db.query(
    `SELECT c.id
     FROM Customer c
     JOIN Room r ON r.room_number = c.room_number AND r.is_booked = TRUE
       AND r.rental_end_date IS NOT NULL AND r.rental_start_date <= NOW()
     WHERE c.is_suspended = FALSE
       AND DATEDIFF(CURDATE(), DATE(r.rental_end_date)) > ?
     ORDER BY c.id`,
    [CONTRACT_GRACE_DAYS],
  );
  return rows.map((row) => row.id);
}

export class ContractRenewError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export async function renewContractByStaff(connection, roomNumber, months, staffName) {
  if (!RENEW_DURATION_MONTHS.has(months)) {
    throw new ContractRenewError(400, `ระยะเวลาต่อสัญญาต้องเป็น ${[...RENEW_DURATION_MONTHS].join(", ")} เดือน`);
  }
  const [customers] = await connection.query(
    `SELECT id FROM Customer WHERE room_number = ? AND is_suspended = FALSE ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [roomNumber],
  );
  const customer = customers[0];
  if (!customer) throw new ContractRenewError(404, "ไม่พบผู้เช่าในห้องนี้");
  const [rooms] = await connection.query(
    `SELECT rental_end_date FROM Room WHERE room_number = ? AND is_booked = TRUE FOR UPDATE`,
    [roomNumber],
  );
  if (!rooms[0]?.rental_end_date) throw new ContractRenewError(409, "ห้องนี้ไม่มีสัญญาเช่าที่ต่อได้");

  const outstanding = await loadCustomerOutstanding(connection, customer.id);
  if (outstanding.amount > 0) {
    throw new ContractRenewError(409, RENEW_OUTSTANDING_MESSAGE(outstanding.amount), { code: "RENEW_OUTSTANDING", outstanding });
  }

  await connection.query(
    `UPDATE Room
     SET rental_end_date = DATE_ADD(rental_end_date, INTERVAL ? MONTH),
         rental_duration_months = TIMESTAMPDIFF(MONTH, rental_start_date, rental_end_date)
     WHERE room_number = ?`,
    [months, roomNumber],
  );
  await connection.query(
    `UPDATE TenantRequest SET status = 'cancelled', completed_at = NOW(), completed_by_name = ?
     WHERE customer_id = ? AND type = 'renew' AND status IN ('pending', 'in_progress')`,
    [staffName, customer.id],
  );
  const [created] = await connection.query(
    `INSERT INTO TenantRequest (customer_id, room_number, type, note, renew_duration_months, renew_payment_type, status,
                                accepted_at, accepted_by_name, completed_at, completed_by_name)
     VALUES (?, ?, 'renew', 'ต่อสัญญาโดยเจ้าหน้าที่', ?, 'monthly', 'approved', NOW(), ?, NOW(), ?)`,
    [customer.id, roomNumber, months, staffName, staffName],
  );
  const [[room]] = await connection.query(`SELECT rental_end_date FROM Room WHERE room_number = ?`, [roomNumber]);
  return { requestId: created.insertId, customerId: customer.id, rentalEndDate: room.rental_end_date };
}

const thaiDate = (value) => new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

export async function suspendExpiredContracts(db = getPool()) {
  const suspended = [];
  for (const customerId of await findOverdueCustomerIds(db)) {
    try {
      const result = await suspendExpiredCustomerNow(customerId, db);
      if (result) suspended.push(result);
    } catch (error) {
      console.error(`Auto suspend expired contract ${customerId} error:`, error);
    }
  }
  return suspended;
}

export function expiredContractSuspensionNotice(result) {
  return notifyStaffSide({
    type: "contract_auto_suspended", tone: "danger", target: "rooms", refTable: "Customer", refId: result.customerId,
    title: `ระงับผู้เช่าอัตโนมัติ ห้อง ${result.roomNumber}`,
    message: `${result.name} ไม่ต่อสัญญาภายใน ${CONTRACT_GRACE_DAYS} วันหลังสัญญาหมด (${thaiDate(result.rentalEndDate)})`,
    detail: result.roomVacated ? `ปล่อยห้อง ${result.roomNumber} เป็นห้องว่างแล้ว` : null,
    dedupeKey: `contract-auto-suspended-${result.customerId}-${result.roomNumber}`,
  });
}
