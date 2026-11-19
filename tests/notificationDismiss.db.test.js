import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const API = process.env.NOTIFICATION_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TAG = randomUUID().replace(/-/g, "").slice(0, 8);
const fx = { notificationIds: [], customers: [], rooms: [] };

const token = (role, id) => jwt.sign({ id, role }, SECRET, { expiresIn: "15m" });

async function call(method, path, auth, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function feed(auth, role) {
  const { status, data } = await call("GET", `/api/${role}/notifications`, auth);
  assert.equal(status, 200, JSON.stringify(data));
  return data;
}

async function freeRooms(db, count) {
  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  const free = [];
  for (let number = 999; number >= 900 && free.length < count; number -= 1) if (!used.has(number)) free.push(number);
  return free;
}

async function createCustomer(db, roomNumber, suffix) {
  const [room] = await db.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, TRUE, 3000)", [roomNumber]);
  fx.rooms.push(room.insertId);
  const [customer] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount, is_suspended)
     VALUES (?, 'x', ?, 'ทดสอบ', ?, 30, ?, 0, FALSE)`,
    [`D${TAG}${suffix}`.slice(0, 13), `09${String(Date.now() + suffix.charCodeAt(0)).slice(-8)}`, `ลบแจ้งเตือน${suffix}`, roomNumber],
  );
  fx.customers.push(customer.insertId);
  return { id: customer.insertId, token: token("Customer", customer.insertId) };
}

async function insertNotification(db, customerId, title) {
  const [result] = await db.query(
    `INSERT INTO Notification (audience, recipient_id, type, tone, title, message)
     VALUES ('Customer', ?, 'test_dismiss', 'info', ?, 'ทดสอบลบแจ้งเตือน')`,
    [customerId, title],
  );
  fx.notificationIds.push(result.insertId);
  return result.insertId;
}

before(async () => {
  const db = getPool();
  const staff = await db.query("SELECT id FROM Staff WHERE is_suspended = FALSE ORDER BY id LIMIT 2");
  assert.ok(staff[0].length >= 1, "ต้องมีบัญชี Staff อย่างน้อย 1 บัญชี");
  const [[admin]] = await db.query("SELECT id FROM Admin WHERE is_suspended = FALSE ORDER BY id LIMIT 1");
  assert.ok(admin, "ต้องมีบัญชี Admin อย่างน้อย 1 บัญชี");
  fx.staff = { id: staff[0][0].id, token: token("Staff", staff[0][0].id) };
  fx.admin = { id: admin.id, token: token("Admin", admin.id) };
  const [roomA, roomB] = await freeRooms(db, 2);
  fx.custA = await createCustomer(db, roomA, "A");
  fx.custB = await createCustomer(db, roomB, "B");
});

after(async () => {
  const db = getPool();
  try {
    await db.query("DELETE FROM NotificationDismiss WHERE item_key LIKE ?", [`%${TAG}%`]);
    if (fx.notificationIds.length) {
      await db.query("DELETE FROM NotificationDismiss WHERE item_key IN (?)", [fx.notificationIds.map((id) => `server-${id}`)]);
      await db.query("DELETE FROM NotificationRead WHERE notification_id IN (?)", [fx.notificationIds]);
      await db.query("DELETE FROM Notification WHERE id IN (?)", [fx.notificationIds]);
    }
    if (fx.customers.length) {
      await db.query("DELETE FROM NotificationDismiss WHERE user_role = 'Customer' AND user_id IN (?)", [fx.customers]);
      await db.query("DELETE FROM Customer WHERE id IN (?)", [fx.customers]);
    }
    if (fx.rooms.length) await db.query("DELETE FROM Room WHERE id IN (?)", [fx.rooms]);
  } finally {
    await db.end();
  }
});

test("1. GET /notifications ส่งรายการ dismissed กลับมาทุกบทบาท", async () => {
  for (const [role, who] of [["customer", fx.custA], ["staff", fx.staff], ["admin", fx.admin]]) {
    const data = await feed(who.token, role);
    assert.ok(Array.isArray(data.dismissed), `${role} ต้องได้ dismissed เป็น array`);
  }
});

test("2. ลบแจ้งเตือนทีละรายการเป็น soft delete: หายจากหน้าผู้ใช้ แต่แถวใน Notification ยังอยู่", async () => {
  const db = getPool();
  const id = await insertNotification(db, fx.custA.id, `ลบได้ ${TAG}`);
  const key = `server-${id}`;
  assert.ok((await feed(fx.custA.token, "customer")).notifications.some((row) => row.id === id), "ต้องเห็นแจ้งเตือนก่อนลบ");

  const dismiss = await call("POST", "/api/customer/notifications/dismiss", fx.custA.token, { keys: [key] });
  assert.equal(dismiss.status, 200, JSON.stringify(dismiss.data));
  assert.deepEqual(dismiss.data.keys, [key]);

  assert.ok((await feed(fx.custA.token, "customer")).dismissed.includes(key), "key ต้องอยู่ใน dismissed");
  const [[row]] = await db.query("SELECT id FROM Notification WHERE id = ?", [id]);
  assert.ok(row, "แถวใน Notification ต้องไม่ถูกลบจริง");
  const [[mark]] = await db.query(
    "SELECT dismissed_at FROM NotificationDismiss WHERE user_role = 'Customer' AND user_id = ? AND item_key = ?",
    [fx.custA.id, key],
  );
  assert.ok(mark?.dismissed_at, "ต้องบันทึกเวลาที่ลบไว้ใน NotificationDismiss");
});

test("3. การลบเป็นของแต่ละบัญชี: คนอื่นไม่ถูกลบตาม", async () => {
  const key = `pending-move-in-${TAG}`;
  assert.equal((await call("POST", "/api/staff/notifications/dismiss", fx.staff.token, { keys: [key] })).status, 200);
  assert.ok((await feed(fx.staff.token, "staff")).dismissed.includes(key), "Staff ที่ลบต้องเห็นว่าลบแล้ว");
  assert.ok(!(await feed(fx.admin.token, "admin")).dismissed.includes(key), "Admin ต้องไม่ถูกลบตาม");
  assert.ok(!(await feed(fx.custB.token, "customer")).dismissed.includes(key), "ผู้เช่าต้องไม่ถูกลบตาม");
});

test("4. ลบซ้ำได้ไม่ error และไม่เกิดแถวซ้ำ", async () => {
  const key = `pending-repeat-${TAG}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal((await call("POST", "/api/admin/notifications/dismiss", fx.admin.token, { keys: [key, key] })).status, 200);
  }
  const [[{ total }]] = await getPool().query(
    "SELECT COUNT(*) AS total FROM NotificationDismiss WHERE user_role = 'Admin' AND user_id = ? AND item_key = ?",
    [fx.admin.id, key],
  );
  assert.equal(Number(total), 1);
});

test("5. ข้อมูลไม่ถูกต้องต้องตอบ 400", async () => {
  const path = "/api/customer/notifications/dismiss";
  for (const body of [{}, { keys: [] }, { keys: "server-1" }, { keys: [123, null] }, { keys: ["   "] }, { keys: ["x".repeat(256)] }]) {
    const response = await call("POST", path, fx.custA.token, body);
    assert.equal(response.status, 400, `body ${JSON.stringify(body).slice(0, 40)} ต้องได้ 400`);
  }
});

test("6. ส่ง key เกิน 200 รายการ ระบบรับแค่ 200", async () => {
  const keys = Array.from({ length: 205 }, (_, index) => `pending-bulk-${TAG}-${index}`);
  const response = await call("POST", "/api/customer/notifications/dismiss", fx.custB.token, { keys });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.keys.length, 200);
});

test("7. บทบาทอื่นเรียก dismiss ของกันไม่ได้", async () => {
  assert.equal((await call("POST", "/api/staff/notifications/dismiss", fx.custA.token, { keys: [`pending-x-${TAG}`] })).status, 403);
  assert.equal((await call("POST", "/api/admin/notifications/dismiss", fx.staff.token, { keys: [`pending-x-${TAG}`] })).status, 403);
});

test("8. อ่านทั้งหมด: กดครั้งเดียวอ่านทุกรายการของตัวเอง แต่ไม่ไปอ่านของคนอื่น", async () => {
  const db = getPool();
  const ids = [
    await insertNotification(db, fx.custA.id, `อ่านทั้งหมด 1 ${TAG}`),
    await insertNotification(db, fx.custA.id, `อ่านทั้งหมด 2 ${TAG}`),
  ];
  const otherId = await insertNotification(db, fx.custB.id, `ของคนอื่น ${TAG}`);
  const unreadBefore = (await feed(fx.custA.token, "customer")).notifications.filter((row) => ids.includes(row.id) && !row.is_read);
  assert.equal(unreadBefore.length, 2, "ต้องยังไม่อ่านก่อนกด");

  assert.equal((await call("POST", "/api/customer/notifications/read", fx.custA.token, { all: true })).status, 200);

  const afterRead = (await feed(fx.custA.token, "customer")).notifications.filter((row) => ids.includes(row.id));
  assert.equal(afterRead.length, 2);
  assert.ok(afterRead.every((row) => row.is_read), "ทุกรายการต้องเป็นอ่านแล้ว");
  const other = (await feed(fx.custB.token, "customer")).notifications.find((row) => row.id === otherId);
  assert.equal(other?.is_read, false, "ของผู้เช่าคนอื่นต้องยังไม่อ่าน");
});
