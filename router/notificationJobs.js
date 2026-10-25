import { getPool } from "../Database/connection.js";
import { baht, notify, notifyCustomer, notifyStaffSide } from "../middleware/notifications.js";

// Time-based notifications. Every row carries a dedupe_key, so the job can run as often as
// we like (and from several processes) without notifying anyone twice.

const EXPIRY_THRESHOLDS = [1, 7, 30];
const RETENTION_DAYS = 90;
const JOB_INTERVAL_MS = 60 * 60 * 1000;
const TRANSFER_CHARGE_WARNING_HOURS = 24;

const dateKey = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const thaiDate = (value) => new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

async function contractStarts(db) {
  const [rows] = await db.query(
    `SELECT r.room_number, r.rental_start_date, r.rental_end_date, c.id AS customer_id, c.first_name, c.last_name
     FROM Room r JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
     WHERE r.is_booked = TRUE AND r.rental_start_date IS NOT NULL
       AND DATE(r.rental_start_date) BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND CURDATE()`,
  );
  return rows.flatMap((row) => {
    const key = `${row.customer_id}-${row.room_number}-${dateKey(row.rental_start_date)}`;
    return [
      notifyCustomer(row.customer_id, {
        type: "contract_start", tone: "success", target: "contract", refTable: "Room", refId: row.room_number,
        title: "สัญญาเช่าเริ่มแล้ว", message: `ห้อง ${row.room_number} เริ่มสัญญาวันที่ ${thaiDate(row.rental_start_date)}`,
        detail: row.rental_end_date ? `สิ้นสุดสัญญา ${thaiDate(row.rental_end_date)}` : null,
        dedupeKey: `contract-start-${key}`,
      }),
      notifyStaffSide({
        type: "contract_start", tone: "info", target: "rooms", refTable: "Room", refId: row.room_number,
        title: `ผู้เช่าเริ่มสัญญา ห้อง ${row.room_number}`, message: `${row.first_name} ${row.last_name} เริ่มเข้าอยู่วันที่ ${thaiDate(row.rental_start_date)}`,
        dedupeKey: `contract-start-staff-${key}`,
      }),
    ];
  });
}

async function contractEnds(db) {
  const [rows] = await db.query(
    `SELECT r.room_number, r.rental_end_date, DATEDIFF(DATE(r.rental_end_date), CURDATE()) AS days_left, c.id AS customer_id,
            EXISTS (SELECT 1 FROM TenantRequest tr WHERE tr.customer_id = c.id AND tr.type IN ('renew', 'moveout')
                      AND tr.status IN ('pending', 'in_progress')) AS has_request
     FROM Room r JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
     WHERE r.is_booked = TRUE AND r.rental_end_date IS NOT NULL AND r.rental_start_date <= NOW()
       AND DATEDIFF(DATE(r.rental_end_date), CURDATE()) <= ?`,
    [Math.max(...EXPIRY_THRESHOLDS)],
  );
  return rows.filter((row) => !row.has_request).map((row) => {
    const daysLeft = Number(row.days_left);
    const base = `${row.customer_id}-${row.room_number}-${dateKey(row.rental_end_date)}`;
    if (daysLeft < 0) {
      return notifyCustomer(row.customer_id, {
        type: "contract_expired", tone: "danger", target: "renew", refTable: "Room", refId: row.room_number,
        title: "สัญญาเช่าหมดแล้ว", message: `สัญญาห้อง ${row.room_number} หมดเมื่อ ${thaiDate(row.rental_end_date)} กรุณาต่อสัญญาหรือแจ้งย้ายออก`,
        dedupeKey: `contract-expired-${base}`,
      });
    }
    // Only the nearest threshold, so a short contract does not get the 30- and 7-day notice at once.
    const threshold = EXPIRY_THRESHOLDS.find((days) => daysLeft <= days);
    return notifyCustomer(row.customer_id, {
      type: "contract_expiring", tone: "pending", target: "renew", refTable: "Room", refId: row.room_number,
      title: "สัญญาเช่าใกล้หมด",
      message: daysLeft === 0 ? `สัญญาห้อง ${row.room_number} หมดวันนี้` : `สัญญาห้อง ${row.room_number} เหลืออีก ${daysLeft} วัน (หมด ${thaiDate(row.rental_end_date)})`,
      detail: "ต้องการพักต่อ กดส่งคำขอต่อสัญญาได้ที่หน้าแรก",
      dedupeKey: `contract-expiring-${base}-${threshold}`,
    });
  });
}

async function transferChargeDeadlines(db) {
  const [rows] = await db.query(
    `SELECT tr.id, tr.customer_id, tr.room_number, tr.target_room_number, tr.transfer_charge_due_at, p.amount
     FROM TenantRequest tr JOIN Payment p ON p.id = tr.transfer_charge_payment_id
     WHERE tr.type = 'move_room' AND tr.status IN ('pending', 'in_progress')
       AND p.status = 'pending' AND p.slip_path IS NULL
       AND tr.transfer_charge_due_at > NOW() AND tr.transfer_charge_due_at <= DATE_ADD(NOW(), INTERVAL ? HOUR)`,
    [TRANSFER_CHARGE_WARNING_HOURS],
  );
  return rows.map((row) => notifyCustomer(row.customer_id, {
    type: "transfer_charge_due", tone: "danger", target: "due", refTable: "TenantRequest", refId: row.id,
    title: "ยอดชำระย้ายห้องใกล้หมดเวลา",
    message: `ชำระ ${baht(row.amount)} ภายใน ${new Date(row.transfer_charge_due_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} ไม่เช่นนั้นคำขอย้ายห้องจะถูกยกเลิก`,
    detail: `ย้ายจากห้อง ${row.room_number} ไปห้อง ${row.target_room_number}`,
    dedupeKey: `transfer-charge-due-${row.id}`,
  }));
}

export async function runNotificationJobs(db = getPool()) {
  for (const job of [contractStarts, contractEnds, transferChargeDeadlines]) {
    try {
      await notify(await job(db), db);
    } catch (error) {
      console.error(`Notification job ${job.name} error:`, error);
    }
  }
  try {
    await db.query("DELETE FROM NotificationRead WHERE read_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [RETENTION_DAYS]);
    await db.query("DELETE FROM Notification WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [RETENTION_DAYS]);
  } catch (error) {
    console.error("Notification cleanup error:", error);
  }
}

export function startNotificationJobs() {
  const run = () => runNotificationJobs().catch((error) => console.error("Notification jobs error:", error));
  setTimeout(run, 10000).unref();
  setInterval(run, JOB_INTERVAL_MS).unref();
}

