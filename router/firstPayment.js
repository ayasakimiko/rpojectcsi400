import { getPool } from "../Database/connection.js";
import { notifyCustomer, notifyStaffSide } from "../middleware/notifications.js";
import { suspendCustomerTenancy, vacateCustomerRoom } from "./contractExpiry.js";
import { loadCustomerContracts } from "./rentalContracts.js";

export const FIRST_PAYMENT_GRACE_DAYS = 7;
export const FIRST_PAYMENT_REMINDER_DAYS = [7, 15];
export const FIRST_PAYMENT_UNPAID_CODE = "FIRST_PAYMENT_UNPAID";
export const FIRST_PAYMENT_VOIDED_CODE = "FIRST_PAYMENT_VOIDED";
export const FIRST_PAYMENT_VOID_ACTOR = "ระบบ (ไม่ชำระงวดแรก)";
export const FIRST_PAYMENT_VOIDED_MESSAGE =
  `สัญญาเช่าถูกยกเลิกเนื่องจากไม่ได้ชำระงวดแรกภายใน ${FIRST_PAYMENT_GRACE_DAYS} วันหลังวันเริ่มสัญญา กรุณาติดต่อเจ้าหน้าที่`;

export const firstPaymentDueDateSql = (startExpression) =>
  `DATE_ADD(GREATEST(DATE(${startExpression}), CURDATE()), INTERVAL ${FIRST_PAYMENT_GRACE_DAYS} DAY)`;

const thaiDate = (value) => new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
const baht = (value) => `฿${Number(value).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

const GATED_BOOKINGS_SQL = `
  SELECT b.id AS booking_id, b.customer_id, b.rental_start_date,
         DATE_FORMAT(b.first_payment_due_date, '%Y-%m-%d') AS due_date,
         DATEDIFF(DATE(b.rental_start_date), CURDATE()) AS days_to_start,
         DATEDIFF(b.first_payment_due_date, CURDATE()) AS days_to_due,
         c.room_number, c.first_name, c.last_name
  FROM Booking b
  JOIN Customer c ON c.id = b.customer_id AND c.is_suspended = FALSE AND c.room_number IS NOT NULL
  WHERE b.first_payment_due_date IS NOT NULL AND b.first_payment_voided_at IS NULL
    AND b.ended_at IS NULL AND b.contract_completed_at IS NOT NULL`;

function outstandingFirstPayment(contract) {
  const rent = Math.max(0, Number(contract.first_month_amount) - Number(contract.rent_paid));
  const deposit = Math.max(0, Number(contract.deposit_amount || 0) - Number(contract.deposit_paid));
  return Math.round((rent + deposit) * 100) / 100;
}

async function resolveGates(db, rows) {
  if (rows.length === 0) return [];
  const contracts = await loadCustomerContracts(db, rows.map((row) => row.customer_id), { currentOnly: true });
  const cleared = [];
  const gates = [];
  for (const row of rows) {
    const contract = contracts.get(row.customer_id);
    if (!contract || contract.booking_id !== row.booking_id || contract.first_payment_status === "paid") {
      cleared.push(row.booking_id);
      continue;
    }
    gates.push({
      ...row,
      days_to_start: Number(row.days_to_start),
      days_to_due: Number(row.days_to_due),
      status: contract.first_payment_status,
      amount: outstandingFirstPayment(contract),
      paid: Math.round((Number(contract.rent_paid) + Number(contract.deposit_paid)) * 100) / 100,
      expired: Number(row.days_to_due) < 0 && contract.first_payment_status === "due",
    });
  }
  if (cleared.length > 0) {
    await db.query("UPDATE Booking SET first_payment_due_date = NULL WHERE id IN (?) AND first_payment_voided_at IS NULL", [cleared]);
  }
  return gates;
}

export async function loadFirstPaymentGate(db, customerId) {
  const [rows] = await db.query(`${GATED_BOOKINGS_SQL} AND b.customer_id = ? ORDER BY b.id DESC LIMIT 1`, [customerId]);
  return (await resolveGates(db, rows))[0] ?? null;
}

export async function loadFirstPaymentGates(db) {
  const [rows] = await db.query(`${GATED_BOOKINGS_SQL} ORDER BY b.id`);
  return resolveGates(db, rows);
}

export async function voidUnpaidContract(connection, customerId) {
  await connection.query("SELECT id FROM Customer WHERE id = ? FOR UPDATE", [customerId]);
  const gate = await loadFirstPaymentGate(connection, customerId);
  if (!gate?.expired) return null;
  await connection.query(
    `UPDATE Payment SET status = 'cancelled', note = LEFT(CONCAT(COALESCE(note, ''), ' (ยกเลิก: ไม่ชำระงวดแรกภายในกำหนด)'), 255)
     WHERE booking_id = ? AND status = 'pending' AND slip_path IS NULL`,
    [gate.booking_id],
  );
  const roomVacated = await vacateCustomerRoom(connection, customerId, gate.room_number);
  await connection.query("UPDATE Booking SET first_payment_voided_at = NOW() WHERE id = ?", [gate.booking_id]);
  await suspendCustomerTenancy(connection, customerId, FIRST_PAYMENT_VOID_ACTOR);
  return {
    customerId,
    bookingId: gate.booking_id,
    name: `${gate.first_name} ${gate.last_name}`,
    roomNumber: gate.room_number,
    startDate: gate.rental_start_date,
    dueDate: gate.due_date,
    paid: gate.paid,
    roomVacated,
  };
}

export async function voidUnpaidContractNow(customerId, db = getPool()) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const voided = await voidUnpaidContract(connection, customerId);
    await connection.commit();
    return voided;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function voidUnpaidContracts(db = getPool()) {
  const voided = [];
  for (const gate of (await loadFirstPaymentGates(db)).filter((item) => item.expired)) {
    try {
      const result = await voidUnpaidContractNow(gate.customer_id, db);
      if (result) voided.push(result);
    } catch (error) {
      console.error(`Void unpaid contract ${gate.customer_id} error:`, error);
    }
  }
  return voided;
}

export function voidedContractNotices(result) {
  return [
    notifyStaffSide({
      type: "contract_voided", tone: "danger", target: "rooms", refTable: "Booking", refId: result.bookingId,
      title: `ยกเลิกสัญญาอัตโนมัติ ห้อง ${result.roomNumber}`,
      message: `${result.name} ไม่ชำระงวดแรกภายใน ${thaiDate(result.dueDate)}`,
      detail: [
        result.roomVacated ? `ปล่อยห้อง ${result.roomNumber} เป็นห้องว่างแล้ว` : null,
        result.paid > 0 ? `ผู้เช่าชำระมาแล้วบางส่วน ${baht(result.paid)} ต้องคืนเงินให้ผู้เช่า` : null,
      ].filter(Boolean).join(" · ") || null,
      dedupeKey: `contract-voided-${result.bookingId}`,
    }),
    notifyCustomer(result.customerId, {
      type: "contract_voided", tone: "danger", target: "contract", refTable: "Booking", refId: result.bookingId,
      title: "สัญญาเช่าถูกยกเลิก",
      message: `สัญญาห้อง ${result.roomNumber} ถูกยกเลิกเนื่องจากไม่ได้ชำระงวดแรกภายใน ${thaiDate(result.dueDate)}`,
      detail: result.paid > 0 ? `เจ้าหน้าที่จะติดต่อคืนเงินที่ชำระไว้ ${baht(result.paid)}` : null,
      dedupeKey: `contract-voided-customer-${result.bookingId}`,
    }),
  ];
}

export function firstPaymentReminderNotices(gate) {
  if (gate.status !== "due" || gate.expired) return [];
  const due = thaiDate(gate.due_date);
  if (gate.days_to_start > 0) {
    const threshold = FIRST_PAYMENT_REMINDER_DAYS.find((days) => gate.days_to_start <= days);
    if (!threshold) return [];
    return [notifyCustomer(gate.customer_id, {
      type: "first_payment_due", tone: "pending", target: "due", refTable: "Booking", refId: gate.booking_id,
      title: "กรุณาชำระงวดแรกก่อนเริ่มสัญญา",
      message: `ห้อง ${gate.room_number} เริ่มสัญญา ${thaiDate(gate.rental_start_date)} (อีก ${gate.days_to_start} วัน) ยอดงวดแรก ${baht(gate.amount)}`,
      detail: `สัญญาจะมีผลเมื่อชำระแล้ว หากยังไม่ชำระ ต้องชำระภายใน ${due} ไม่เช่นนั้นสัญญาจะถูกยกเลิก`,
      dedupeKey: `first-payment-${gate.booking_id}-${threshold}`,
    })];
  }
  const daysLeft = gate.days_to_due;
  return [
    notifyCustomer(gate.customer_id, {
      type: "first_payment_due", tone: "danger", target: "due", refTable: "Booking", refId: gate.booking_id,
      title: "ถึงวันเริ่มสัญญาแล้ว แต่ยังไม่ได้ชำระงวดแรก",
      message: `ชำระงวดแรก ${baht(gate.amount)} ภายใน ${due} (${daysLeft === 0 ? "วันนี้วันสุดท้าย" : `เหลืออีก ${daysLeft} วัน`}) ไม่เช่นนั้นสัญญาจะถูกยกเลิก`,
      detail: "สัญญาจะยังไม่มีผลและยังเข้าพักไม่ได้จนกว่าจะชำระ",
      dedupeKey: `first-payment-start-${gate.booking_id}`,
    }),
    notifyStaffSide({
      type: "first_payment_due", tone: "pending", target: "rooms", refTable: "Booking", refId: gate.booking_id,
      title: `ถึงวันเริ่มสัญญาแต่ยังไม่ชำระงวดแรก ห้อง ${gate.room_number}`,
      message: `${gate.first_name} ${gate.last_name} ค้างงวดแรก ${baht(gate.amount)} ระบบจะยกเลิกสัญญาหากไม่ชำระภายใน ${due}`,
      dedupeKey: `first-payment-start-staff-${gate.booking_id}`,
    }),
  ];
}
