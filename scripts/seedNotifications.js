// Sample bell notifications for trying out the notification panel (read / soft delete).
//   node --env-file=.env scripts/seedNotifications.js seed    add samples (safe to re-run)
//   node --env-file=.env scripts/seedNotifications.js clean   remove only these samples
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("owner");

const KEY_PREFIX = "demo-notif-";
const STAFF_SIDE = "Staff,Admin,Owner";

// minutesAgo keeps every sample inside the 30-day feed window, newest first.
const STAFF_SAMPLES = [
  { audience: STAFF_SIDE, type: "slip_submitted", tone: "pending", target: "slips", title: "มีสลิปค่าเช่ารอตรวจ", message: "ผู้เช่าห้อง 204 ส่งสลิปค่าเช่าเดือนนี้ ฿4,500", detail: "โอนผ่านธนาคารกสิกรไทย เวลา 09:12 น.", actor: ["Customer", "สมชาย ใจดี"], minutesAgo: 5 },
  { audience: STAFF_SIDE, type: "maintenance_reported", tone: "pending", target: "maintenance", title: "แจ้งซ่อมใหม่ ห้อง 312", message: "แอร์ไม่เย็น มีน้ำหยด", detail: "สะดวกให้เข้าซ่อมช่วงเย็นหลัง 17:00 น.", actor: ["Customer", "วรรณา ศรีสุข"], minutesAgo: 25 },
  { audience: STAFF_SIDE, type: "safety_reported", tone: "danger", target: "safety", title: "แจ้งเหตุด่วน: กลิ่นไหม้ชั้น 3", message: "ผู้เช่าแจ้งได้กลิ่นไหม้บริเวณทางเดินชั้น 3", detail: "ใกล้ตู้ไฟหน้าห้อง 305", actor: ["Customer", "ธนพล แก้วมณี"], minutesAgo: 60 },
  { audience: STAFF_SIDE, type: "visit_requested", tone: "pending", target: "visits", title: "ขอพาผู้มาเยือนค้างคืน", message: "ห้อง 108 ขอพาญาติเข้าพัก 2 คืน", detail: "วันที่ 22–23 พ.ย.", actor: ["Customer", "ปิยะดา บุญมา"], minutesAgo: 180 },
  { audience: STAFF_SIDE, type: "tenant_registered", tone: "info", target: "rooms", title: "ผู้เช่าใหม่ลงทะเบียน", message: "ลงทะเบียนเข้าห้อง 115 เรียบร้อย", actor: ["Staff", "เจ้าหน้าที่ทดสอบ"], minutesAgo: 60 * 8 },
  { audience: STAFF_SIDE, type: "payment_collected", tone: "success", target: "history", title: "บันทึกรับชำระเงินแล้ว", message: "รับชำระค่าน้ำ-ค่าไฟห้อง 220 ฿1,280", actor: ["Staff", "เจ้าหน้าที่ทดสอบ"], minutesAgo: 60 * 26 },
  { audience: STAFF_SIDE, type: "waiting_list_added", tone: "info", target: "waiting-list", title: "มีผู้สนใจเข้าคิวรอห้อง", message: "เพิ่มรายชื่อในคิวรอห้องเดี่ยว 1 คน", minutesAgo: 60 * 50 },
  { audience: "Admin,Owner", type: "staff_updated", tone: "info", target: "staff", title: "แก้ไขข้อมูลพนักงาน", message: "อัปเดตเบอร์โทรของพนักงานกะดึก", actor: ["Owner", "เจ้าของหอ"], minutesAgo: 60 * 72 },
  { audience: "Owner", type: "expense_recorded", tone: "info", target: "expenses", title: "บันทึกรายจ่ายใหม่", message: "ค่าซ่อมปั๊มน้ำ ฿3,200", detail: "ร้านช่างประปาหน้าหอ", actor: ["Staff", "เจ้าหน้าที่ทดสอบ"], minutesAgo: 60 * 96 },
  { audience: STAFF_SIDE, type: "dorm_rules_changed", tone: "pending", target: "dorm-info", title: "กฎหอพักมีการแก้ไข", message: "ปรับเวลาปิดประตูหน้าเป็น 23:30 น.", actor: ["Admin", "แอดมินทดสอบ"], minutesAgo: 60 * 24 * 7 },
];

const CUSTOMER_SAMPLES = [
  { type: "slip_approved", tone: "success", target: "slips", title: "สลิปค่าเช่าผ่านการตรวจแล้ว", message: "ยืนยันการชำระค่าเช่า ฿4,500 เรียบร้อย", actor: ["Staff", "เจ้าหน้าที่ทดสอบ"], minutesAgo: 10 },
  { type: "maintenance_accepted", tone: "info", target: "maintenance", title: "ช่างรับงานแจ้งซ่อมแล้ว", message: "ช่างจะเข้าตรวจแอร์ภายในวันนี้", actor: ["Staff", "เจ้าหน้าที่ทดสอบ"], minutesAgo: 45 },
  { type: "parcel_arrived", tone: "pending", target: "parcels", title: "มีพัสดุมาส่ง", message: "พัสดุ 1 ชิ้นรอรับที่ห้องนิติ", detail: "Kerry Express", minutesAgo: 120 },
  { type: "first_payment_due", tone: "danger", target: "due", title: "ใกล้ครบกำหนดชำระ", message: "กรุณาชำระค่าน้ำ-ค่าไฟ ฿1,150 ภายใน 3 วัน", minutesAgo: 60 * 20 },
  { type: "dorm_rules_changed", tone: "pending", target: "dorm-info", title: "กฎหอพักมีการแก้ไข", message: "ปรับเวลาปิดประตูหน้าเป็น 23:30 น.", actor: ["Admin", "แอดมินทดสอบ"], minutesAgo: 60 * 24 * 7 },
];

function row(sample, key, recipientId = null) {
  const [actorRole, actorName] = sample.actor || [null, null];
  return [
    sample.audience || "Customer", recipientId, sample.type, sample.tone, null, null, sample.target,
    sample.title, sample.message, sample.detail || null, actorRole, null, actorName, key,
    new Date(Date.now() - sample.minutesAgo * 60000),
  ];
}

async function seed(db) {
  const [customers] = await db.query("SELECT id FROM Customer ORDER BY id LIMIT 5");
  const rows = STAFF_SAMPLES.map((sample, index) => row(sample, `${KEY_PREFIX}staff-${index}`));
  for (const { id } of customers) {
    CUSTOMER_SAMPLES.forEach((sample, index) => rows.push(row(sample, `${KEY_PREFIX}c${id}-${index}`, id)));
  }
  const [result] = await db.query(
    `INSERT IGNORE INTO Notification
       (audience, recipient_id, type, tone, ref_table, ref_id, target, title, message, detail,
        actor_role, actor_id, actor_name, dedupe_key, created_at)
     VALUES ?`,
    [rows],
  );
  console.log(`เพิ่มการแจ้งเตือนตัวอย่าง ${result.affectedRows} รายการ (ฝั่งพนักงาน ${STAFF_SAMPLES.length}, ผู้เช่า ${customers.length} คน × ${CUSTOMER_SAMPLES.length})`);
  if (result.affectedRows < rows.length) console.log(`ข้าม ${rows.length - result.affectedRows} รายการที่มีอยู่แล้ว`);
}

async function clean(db) {
  const like = `${KEY_PREFIX}%`;
  for (const table of ["NotificationRead", "NotificationHidden"]) {
    try {
      await db.query(`DELETE x FROM ${table} x JOIN Notification n ON n.id = x.notification_id WHERE n.dedupe_key LIKE ?`, [like]);
    } catch (error) {
      if (error.code !== "ER_NO_SUCH_TABLE") throw error;
    }
  }
  const [result] = await db.query("DELETE FROM Notification WHERE dedupe_key LIKE ?", [like]);
  console.log(`ลบการแจ้งเตือนตัวอย่าง ${result.affectedRows} รายการ`);
}

const command = process.argv[2];
const db = getPool();
try {
  if (command === "seed") await seed(db);
  else if (command === "clean") await clean(db);
  else console.log("ใช้: node --env-file=.env scripts/seedNotifications.js seed | clean");
} finally {
  await db.end();
}
