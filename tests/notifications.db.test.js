import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const { runNotificationJobs } = await import("../router/notificationJobs.js");

// End-to-end checks for the notification bell (checklist T01–T08). Runs against a live
// gateway, like the other *.db tests: NOTIFICATION_API_URL (default http://localhost:4000).
const API = process.env.NOTIFICATION_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TAG = randomUUID().replace(/-/g, "").slice(0, 6);
const fx = {};
const cleanup = { expenses: [], dormConfig: null, acks: [] };

const token = (role, id) => jwt.sign({ id, role }, SECRET, { expiresIn: "15m" });

async function call(method, path, auth, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function feed(auth, role, pending = "") {
  const { status, data } = await call("GET", `/api/${role}/notifications${pending ? `?pending=${pending}` : ""}`, auth);
  assert.equal(status, 200, JSON.stringify(data));
  return data;
}

// Only events created by this run, so other data in the database does not interfere.
const ours = (data) => data.notifications.filter((row) => row.id > fx.startId);

// The pending list is cached for 15 s per service, so wait for it to catch up.
async function eventually(check, timeoutMs = 25000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

function sqlDate(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 12:00:00`;
}

async function freeRooms(db, count) {
  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  const free = [];
  for (let number = 997; number >= 900 && free.length < count; number -= 1) if (!used.has(number)) free.push(number);
  return free;
}

async function createCustomer(db, roomNumber, suffix) {
  const [room] = await db.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, TRUE, 3000)", [roomNumber]);
  const [customer] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount, is_suspended)
     VALUES (?, 'x', ?, 'ทดสอบ', ?, 30, ?, 0, FALSE)`,
    [`N${TAG}${suffix}${Date.now()}`.slice(0, 13), `08${String(Date.now() + suffix.charCodeAt(0)).slice(-8)}`, `แจ้งเตือน${suffix}`, roomNumber],
  );
  return { roomId: room.insertId, roomNumber, id: customer.insertId, token: token("Customer", customer.insertId) };
}

before(async () => {
  const db = getPool();
  const [[{ startId }]] = await db.query("SELECT COALESCE(MAX(id), 0) AS startId FROM Notification");
  fx.startId = Number(startId);
  const [[staffA]] = await db.query("SELECT id FROM Staff WHERE is_suspended = FALSE ORDER BY id LIMIT 1");
  const [[admin]] = await db.query("SELECT id FROM Admin WHERE is_suspended = FALSE ORDER BY id LIMIT 1");
  const [[owner]] = await db.query("SELECT id FROM Owner WHERE is_suspended = FALSE ORDER BY id LIMIT 1");
  assert.ok(staffA && admin && owner, "ต้องมีบัญชี Staff, Admin และ Owner อย่างละ 1 บัญชี");
  const [staffB] = await db.query(
    "INSERT INTO Staff (idcard, password, phone, first_name, last_name, age) VALUES (?, 'x', ?, 'สตาฟ', 'บีทดสอบ', 30)",
    [`S${TAG}${Date.now()}`.slice(0, 13), `07${String(Date.now()).slice(-8)}`],
  );
  fx.staffA = { id: staffA.id, token: token("Staff", staffA.id) };
  fx.staffB = { id: staffB.insertId, token: token("Staff", staffB.insertId) };
  fx.admin = { id: admin.id, token: token("Admin", admin.id) };
  fx.owner = { id: owner.id, token: token("Owner", owner.id) };
  const [roomA, roomB] = await freeRooms(db, 2);
  fx.custA = await createCustomer(db, roomA, "A");
  fx.custB = await createCustomer(db, roomB, "B");
  const [booking] = await db.query(
    "INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date) VALUES (?, ?, ?, ?)",
    [fx.custB.id, fx.custB.roomId, sqlDate(-30), sqlDate(335)],
  );
  fx.custB.bookingId = booking.insertId;
});

after(async () => {
  const db = getPool();
  try {
    await db.query("DELETE FROM NotificationRead WHERE notification_id > ?", [fx.startId]);
    await db.query("DELETE FROM Notification WHERE id > ?", [fx.startId]);
    if (cleanup.dormConfig?.existed) {
      await db.query("UPDATE DormConfig SET contract_rules = ? WHERE id = 1", [cleanup.dormConfig.contract_rules]);
    } else if (cleanup.dormConfig) {
      await db.query("DELETE FROM DormConfig WHERE id = 1");
    }
    for (const row of cleanup.acks) {
      await db.query("UPDATE Customer SET dorm_info_acknowledged_at = ? WHERE id = ?", [row.dorm_info_acknowledged_at, row.id]);
    }
    if (cleanup.expenses.length) await db.query("DELETE FROM Expense WHERE id IN (?)", [cleanup.expenses]);
    const customerIds = [fx.custA?.id, fx.custB?.id].filter(Boolean);
    if (customerIds.length) {
      await db.query("DELETE FROM TenantRequest WHERE customer_id IN (?)", [customerIds]);
      await db.query("DELETE FROM MaintenanceRequest WHERE customer_id IN (?)", [customerIds]);
      await db.query("DELETE FROM ResidentVisitRequest WHERE customer_id IN (?)", [customerIds]);
      await db.query("DELETE FROM SafetyIncident WHERE reporter_role = 'Customer' AND reporter_id IN (?)", [customerIds]);
      await db.query("DELETE FROM PaymentSlipRejection WHERE customer_id IN (?)", [customerIds]);
      if (fx.custB?.bookingId) {
        await db.query("DELETE FROM Payment WHERE booking_id = ?", [fx.custB.bookingId]);
        await db.query("DELETE FROM Booking WHERE id = ?", [fx.custB.bookingId]);
      }
      await db.query("DELETE FROM Customer WHERE id IN (?)", [customerIds]);
    }
    const roomIds = [fx.custA?.roomId, fx.custB?.roomId].filter(Boolean);
    if (roomIds.length) await db.query("DELETE FROM Room WHERE id IN (?)", [roomIds]);
    if (fx.staffB) await db.query("DELETE FROM Staff WHERE id = ?", [fx.staffB.id]);
  } finally {
    await db.end();
  }
});

test("1. ทุกบทบาทเรียก /notifications ได้ และ role อื่นใช้ endpoint ของกันไม่ได้", async () => {
  for (const [role, who] of [["customer", fx.custA], ["staff", fx.staffA], ["admin", fx.admin], ["owner", fx.owner]]) {
    const data = await feed(who.token, role);
    assert.ok(Array.isArray(data.notifications));
    assert.ok(Array.isArray(data.pending));
  }
  assert.equal((await call("GET", "/api/admin/notifications", fx.staffA.token)).status, 403);
  assert.equal((await call("GET", "/api/staff/notifications", fx.custA.token)).status, 403);
  const customerPending = await feed(fx.custA.token, "customer", "slip,visit");
  assert.deepEqual(customerPending.pending, [], "ผู้เช่าต้องไม่เห็นงานรออนุมัติของเจ้าหน้าที่");
});

test("2. T01 คำขอต่อสัญญา: Staff A รับเรื่อง/อนุมัติ → Staff B, Admin, Owner เห็น 'โดย Staff A' / ผู้เช่าเห็นวันสิ้นสุดใหม่", async () => {
  const db = getPool();
  await db.query("UPDATE Room SET rental_start_date = ?, rental_end_date = ? WHERE id = ?", [sqlDate(-300), sqlDate(20), fx.custA.roomId]);
  const [request] = await db.query(
    "INSERT INTO TenantRequest (customer_id, room_number, type, renew_duration_months, renew_payment_type) VALUES (?, ?, 'renew', 6, 'monthly')",
    [fx.custA.id, fx.custA.roomNumber],
  );
  const key = `tenant-${request.insertId}-pending`;
  await eventually(async () => {
    assert.ok((await feed(fx.owner.token, "owner", "tenant")).pending.some((item) => item.key === key), "Owner ต้องเห็นคำขอที่รอ");
  });

  assert.equal((await call("POST", `/api/staff/requests/${request.insertId}/acknowledge`, fx.staffA.token)).status, 200);
  const approve = await call("POST", `/api/staff/requests/${request.insertId}/approve`, fx.staffA.token);
  assert.equal(approve.status, 200, JSON.stringify(approve.data));

  for (const [who, role] of [[fx.staffB, "staff"], [fx.admin, "admin"], [fx.owner, "owner"]]) {
    const types = ours(await feed(who.token, role)).filter((row) => row.ref_id === request.insertId).map((row) => row.type);
    assert.ok(types.includes("tenant_request_acknowledged"), `${role} ต้องเห็นรับเรื่องแล้ว`);
    assert.ok(types.includes("tenant_request_approved"), `${role} ต้องเห็นอนุมัติแล้ว`);
  }
  const approved = ours(await feed(fx.owner.token, "owner")).find((row) => row.type === "tenant_request_approved" && row.ref_id === request.insertId);
  assert.match(approved.message, /อนุมัติแล้ว โดย .+ \(เจ้าหน้าที่\)/);
  assert.equal(ours(await feed(fx.staffA.token, "staff")).filter((row) => row.ref_id === request.insertId).length, 0, "คนที่กดเองต้องไม่เห็นแจ้งของตัวเอง");

  const renew = ours(await feed(fx.custA.token, "customer")).find((row) => row.type === "renew_approved");
  assert.ok(renew, "ผู้เช่าต้องได้แจ้งต่อสัญญาสำเร็จ");
  assert.match(renew.message, /ต่อสัญญาอีก 6 เดือน สิ้นสุดสัญญาใหม่/);
  await eventually(async () => {
    assert.ok(!(await feed(fx.owner.token, "owner", "tenant")).pending.some((item) => item.key === key), "รายการรอต้องหายเมื่ออนุมัติแล้ว");
  });
});

test("3. T02 Staff ปฏิเสธสลิป → ผู้เช่าเห็นเหตุผล / Staff คนอื่นเห็น 'ปฏิเสธโดย X'", async () => {
  const db = getPool();
  const [payment] = await db.query(
    "INSERT INTO Payment (booking_id, amount, payment_date, status, type, note, slip_path) VALUES (?, 250, CURDATE(), 'pending', 'water', 'ทดสอบ', ?)",
    [fx.custB.bookingId, `/uploads/test-notif-${TAG}.jpg`],
  );
  await eventually(async () => {
    const pending = (await feed(fx.owner.token, "owner", "slip")).pending;
    assert.ok(pending.some((item) => item.ref_id === payment.insertId && item.target === "slips"), "Owner ต้องเห็นสลิปรอตรวจ");
  });
  const review = await call("PATCH", `/api/staff/payment-verifications/${payment.insertId}`, fx.staffA.token, { decision: "rejected" });
  assert.equal(review.status, 200, JSON.stringify(review.data));

  const customer = ours(await feed(fx.custB.token, "customer")).find((row) => row.type === "slip_rejected");
  assert.ok(customer, "ผู้เช่าต้องได้แจ้งสลิปไม่ผ่าน");
  assert.match(customer.detail, /เหตุผล: /);
  const peer = ours(await feed(fx.staffB.token, "staff")).find((row) => row.type === "slip_rejected");
  assert.match(peer.message, /ปฏิเสธสลิป ฿250 โดย/);
});

test("4. T03/T04 job สัญญา: เหลือ 7 วันแจ้งครั้งเดียว (รันซ้ำไม่ซ้ำ) / หมดแล้วแจ้งผู้เช่า + Staff เห็นรายการต้องจัดการ", async () => {
  const db = getPool();
  await db.query("UPDATE Room SET rental_start_date = ?, rental_end_date = ? WHERE id = ?", [sqlDate(-200), sqlDate(7), fx.custA.roomId]);
  await runNotificationJobs(db);
  await runNotificationJobs(db);
  const expiring = ours(await feed(fx.custA.token, "customer")).filter((row) => row.type === "contract_expiring");
  assert.equal(expiring.length, 1, "ต้องแจ้งใกล้หมดครั้งเดียว");
  assert.match(expiring[0].message, /เหลืออีก 7 วัน/);
  await eventually(async () => {
    const pending = (await feed(fx.admin.token, "admin", "contract_expiry")).pending;
    assert.ok(pending.some((item) => item.ref_id === fx.custA.roomNumber && /ใกล้หมด/.test(item.title)), "Admin ต้องเห็นสัญญาใกล้หมด");
  });

  await db.query("UPDATE Room SET rental_end_date = ? WHERE id = ?", [sqlDate(-1), fx.custA.roomId]);
  await runNotificationJobs(db);
  await runNotificationJobs(db);
  const expired = ours(await feed(fx.custA.token, "customer")).filter((row) => row.type === "contract_expired");
  assert.equal(expired.length, 1, "ต้องแจ้งสัญญาหมดครั้งเดียว");
  await eventually(async () => {
    const pending = (await feed(fx.staffA.token, "staff", "contract_expiry")).pending;
    assert.ok(pending.some((item) => item.ref_id === fx.custA.roomNumber && /หมดแล้ว/.test(item.title)), "Staff ต้องเห็นสัญญาหมดแล้ว");
  });
  await db.query("UPDATE Room SET rental_end_date = ? WHERE id = ?", [sqlDate(300), fx.custA.roomId]);
});

test("5. T05 คำขอผู้มาพัก: ผู้เช่าส่ง → Owner เห็นรออนุมัติ → Admin อนุมัติ → ผู้เช่าเห็นผล / Staff เห็น 'โดย Admin'", async () => {
  const created = await call("POST", "/api/customer/resident-visit-requests", fx.custA.token, {
    requestType: "overnight_guest", guestName: `แขก${TAG}`, guestPhone: "0812345678",
    startAt: sqlDate(1), endAt: sqlDate(2),
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const key = `visit-${created.data.id}`;
  await eventually(async () => {
    assert.ok((await feed(fx.owner.token, "owner", "visit")).pending.some((item) => item.key === key));
  });
  const review = await call("POST", `/api/admin/resident-visit-requests/${created.data.id}/approve`, fx.admin.token);
  assert.equal(review.status, 200, JSON.stringify(review.data));
  assert.ok(ours(await feed(fx.custA.token, "customer")).some((row) => row.type === "visit_approved"), "ผู้เช่าต้องได้ผลอนุมัติ");
  const peer = ours(await feed(fx.staffA.token, "staff")).find((row) => row.type === "visit_approved");
  assert.match(peer.message, /อนุมัติแล้ว โดย .+ \(แอดมิน\)/);
  await eventually(async () => {
    assert.ok(!(await feed(fx.owner.token, "owner", "visit")).pending.some((item) => item.key === key));
  });
});

test("6. แจ้งเหตุ: ผู้เช่าแจ้ง → Owner เห็น (O12) → Admin รับเรื่อง → ผู้เช่าเห็นว่ารับเรื่องแล้ว", async () => {
  const created = await call("POST", "/api/customer/safety-incidents", fx.custA.token, { incidentType: "อื่นๆ", description: `ทดสอบแจ้งเหตุ ${TAG}` });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const [[incident]] = await getPool().query("SELECT id FROM SafetyIncident WHERE reporter_id = ? ORDER BY id DESC LIMIT 1", [fx.custA.id]);
  await eventually(async () => {
    assert.ok((await feed(fx.owner.token, "owner", "safety")).pending.some((item) => item.key === `safety-${incident.id}`));
  });
  const review = await call("PATCH", `/api/admin/safety-incidents/${incident.id}/review`, fx.admin.token, { reviewNote: "ตรวจสอบแล้ว" });
  assert.equal(review.status, 200, JSON.stringify(review.data));
  const customer = ours(await feed(fx.custA.token, "customer")).find((row) => row.type === "safety_reviewed");
  assert.equal(customer?.detail, "ตรวจสอบแล้ว");
  assert.ok(ours(await feed(fx.staffB.token, "staff")).some((row) => row.type === "safety_reviewed"));
});

test("7. T06 แจ้งซ่อม: Staff รับงาน → Admin เห็น 'โดย X' / ผู้เช่ายกเลิกเอง → Staff เห็นว่าผู้เช่ายกเลิก", async () => {
  const db = getPool();
  const insert = (text) => db.query("INSERT INTO MaintenanceRequest (customer_id, room_number, description) VALUES (?, ?, ?)", [fx.custA.id, fx.custA.roomNumber, text]);
  const [accepted] = await insert(`ไฟดับ ${TAG}`);
  const [cancelled] = await insert(`ก๊อกน้ำรั่ว ${TAG}`);
  assert.equal((await call("POST", `/api/staff/maintenance/${accepted.insertId}/accept`, fx.staffA.token)).status, 200);
  const peer = ours(await feed(fx.admin.token, "admin")).find((row) => row.type === "maintenance_accept");
  assert.match(peer.message, /รับงานแจ้งซ่อม โดย/);

  const cancel = await call("POST", `/api/customer/maintenance/${cancelled.insertId}/cancel`, fx.custA.token);
  assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
  const staff = ours(await feed(fx.staffA.token, "staff")).find((row) => row.type === "maintenance_cancelled");
  assert.equal(staff?.message, "ผู้เช่ายกเลิกแจ้งซ่อมแล้ว");
});

test("8. T07 อ่านในเครื่องหนึ่ง → เข้าอีกเครื่อง (token ใหม่) ไม่ขึ้นเป็นรายการใหม่", async () => {
  const deviceOne = fx.custA.token;
  const deviceTwo = token("Customer", fx.custA.id);
  assert.ok(ours(await feed(deviceTwo, "customer")).some((row) => !row.is_read), "ต้องมีรายการยังไม่อ่านก่อน");
  assert.equal((await call("POST", "/api/customer/notifications/read", deviceOne, { all: true })).status, 200);
  assert.ok(ours(await feed(deviceTwo, "customer")).every((row) => row.is_read), "อีกเครื่องต้องเห็นว่าอ่านแล้ว");
  assert.ok(ours(await feed(fx.custB.token, "customer")).some((row) => !row.is_read), "ผู้เช่าคนอื่นต้องไม่ถูกทำเครื่องหมายอ่านไปด้วย");
  assert.equal((await call("POST", "/api/customer/notifications/read", deviceOne, { ids: [] })).status, 400);
});

test("9. บัญชีพนักงาน / รายจ่าย: Owner แก้พนักงาน → Admin เห็น (A32) / Staff บันทึกรายจ่าย → Owner เห็น (O16)", async () => {
  const update = await call("PUT", `/api/owner/staff/Staff/${fx.staffB.id}`, fx.owner.token, { first_name: "สตาฟ" });
  assert.equal(update.status, 200, JSON.stringify(update.data));
  const admin = ours(await feed(fx.admin.token, "admin")).find((row) => row.type === "staff_updated" && row.ref_id === fx.staffB.id);
  assert.match(admin.message, /แก้ไขข้อมูล \(Staff\) โดย .+ \(เจ้าของหอ\)/);
  assert.ok(!ours(await feed(fx.staffA.token, "staff")).some((row) => row.type === "staff_updated"), "Staff ต้องไม่เห็นเรื่องบัญชีพนักงาน");

  const expense = await call("POST", "/api/staff/expenses", fx.staffA.token, {
    category: "repair", description: `ทดสอบรายจ่าย ${TAG}`, amount: 150, expense_date: sqlDate(0).slice(0, 10),
  });
  assert.equal(expense.status, 201, JSON.stringify(expense.data));
  cleanup.expenses.push(expense.data.expenseId);
  const owner = ours(await feed(fx.owner.token, "owner")).find((row) => row.type === "expense_recorded");
  assert.match(owner.message, /ทดสอบรายจ่าย .+ ฿150/);
  assert.ok(!ours(await feed(fx.admin.token, "admin")).some((row) => row.type === "expense_recorded"));
});

test("10. C25 แก้กฎหอพัก → ผู้เช่าต้องกดรับทราบใหม่ และได้แจ้งเตือน", async () => {
  const db = getPool();
  const [[config]] = await db.query("SELECT contract_rules FROM DormConfig WHERE id = 1");
  cleanup.dormConfig = { existed: Boolean(config), contract_rules: config?.contract_rules ?? null };
  [cleanup.acks] = await db.query("SELECT id, dorm_info_acknowledged_at FROM Customer");
  await db.query("UPDATE Customer SET dorm_info_acknowledged_at = NOW() WHERE id = ?", [fx.custA.id]);
  const current = await call("GET", "/api/admin/dorm-info", fx.admin.token);
  const { contract_system: _system, ...fields } = current.data.config;
  const save = await call("PUT", "/api/admin/dorm-info", fx.admin.token, { ...fields, contract_rules: `${fields.contract_rules || ""}\nทดสอบ ${TAG}`.trim() });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  const [[customer]] = await db.query("SELECT dorm_info_acknowledged_at FROM Customer WHERE id = ?", [fx.custA.id]);
  assert.equal(customer.dorm_info_acknowledged_at, null, "ต้องรีเซ็ตการรับทราบ");
  assert.ok(ours(await feed(fx.custA.token, "customer")).some((row) => row.type === "dorm_rules_changed"));
  const unchanged = await call("PUT", "/api/admin/dorm-info", fx.admin.token, { ...fields, contract_rules: `${fields.contract_rules || ""}\nทดสอบ ${TAG}`.trim() });
  assert.equal(unchanged.status, 200);
  assert.equal(ours(await feed(fx.custA.token, "customer")).filter((row) => row.type === "dorm_rules_changed").length, 1, "บันทึกซ้ำโดยไม่แก้กฎต้องไม่แจ้งอีก");
});

test("11. T08 ทุกแจ้งเตือนของ Owner มีปลายทางที่หน้าเว็บพาไปได้", async () => {
  const known = new Set([
    "slips", "requests", "maintenance", "transfer-contracts", "visits", "move-in", "inspections", "waiting-list", "parcels",
    "safety", "contracts", "rooms", "staff", "expenses",
  ]);
  const data = await feed(fx.owner.token, "owner", "slip,visit,safety,tenant,maintenance,fine_review,fine_unpaid,deposit,transfer_contract,transfer_charge,move_in,contract_expiry,rent_overdue,waiting_list,parcel_stale");
  const targets = [...ours(data), ...data.pending].map((item) => (item.target || "").split(":")[0]);
  assert.ok(targets.length > 0);
  assert.deepEqual(targets.filter((target) => !known.has(target)), [], "ปลายทางที่หน้า Owner ไม่รู้จัก");
});
