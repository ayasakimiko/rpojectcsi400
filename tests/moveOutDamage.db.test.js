import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const { syncMoveOutDamageCharge, validateMoveOutDamage } = await import("../router/moveOutDamage.js");
const { loadMoveOutBalance } = await import("../router/CustomerDashboardRouter.js");
const { expireRoomTransferCharges, loadCustomerContracts } = await import("../router/rentalContracts.js");

after(async () => {
  await getPool().end();
});

async function freeRoomNumber(db) {
  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  for (let number = 999; number >= 900; number -= 1) if (!used.has(number)) return number;
  throw new Error("ไม่มีเลขห้องว่างสำหรับทดสอบ");
}

async function setupMovingOutTenant(db, { damage }) {
  const roomNumber = await freeRoomNumber(db);
  const [roomResult] = await db.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date, prepaid_until)
     VALUES (?, TRUE, 3000, 6, DATE_SUB(CURDATE(), INTERVAL 1 MONTH), DATE_ADD(CURDATE(), INTERVAL 5 MONTH), DATE_ADD(CURDATE(), INTERVAL 5 MONTH))`,
    [roomNumber],
  );
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const [customerResult] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount)
     VALUES (?, 'x', ?, 'ทดสอบ', 'ค่าเสียหายเกิน', 30, ?, 6000)`,
    [`M${tag}`, `08${tag.slice(0, 8)}`, roomNumber],
  );
  const customerId = customerResult.insertId;
  const [[room]] = await db.query("SELECT * FROM Room WHERE id = ?", [roomResult.insertId]);
  const [bookingResult] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, contract_duration_months, deposit_amount)
     VALUES (?, ?, ?, ?, NOW(), 6, 6000)`,
    [customerId, room.id, room.rental_start_date, room.rental_end_date],
  );
  const bookingId = bookingResult.insertId;
  await db.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type)
     VALUES (?, 18000, CURDATE(), 'paid', 'rent'), (?, 6000, CURDATE(), 'paid', 'deposit')`,
    [bookingId, bookingId],
  );
  const [requestResult] = await db.query(
    `INSERT INTO TenantRequest (customer_id, room_number, type, status, preferred_move_date)
     VALUES (?, ?, 'moveout', 'in_progress', CURDATE())`,
    [customerId, roomNumber],
  );
  await db.query(
    `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, checklist, damage_note, damage_cost, photos, status)
     VALUES (?, ?, 'ทดสอบ', '{}', ?, ?, '[]', 'reviewed')`,
    [roomNumber, requestResult.insertId, damage > 0 ? "ห้องเสียหาย" : null, damage],
  );
  return { customerId, bookingId, roomId: room.id, requestId: requestResult.insertId };
}

async function withRollback(run) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await run(connection);
  } finally {
    await connection.rollback();
    connection.release();
  }
}

async function setDamage(db, tenant, damage) {
  await db.query("UPDATE MoveOutInspection SET damage_cost = ? WHERE tenant_request_id = ?", [damage, tenant.requestId]);
}

async function damageCharges(db, tenant) {
  const [rows] = await db.query("SELECT id, amount, status FROM Payment WHERE booking_id = ? AND type = 'damage' ORDER BY id", [tenant.bookingId]);
  return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

test("ค่าเสียหายไม่เกินมัดจำ ไม่สร้างบิลส่วนเกิน", () =>
  withRollback(async (db) => {
    const tenant = await setupMovingOutTenant(db, { damage: 4000 });
    const result = await syncMoveOutDamageCharge(db, tenant.requestId);
    assert.equal(result.sentCents, 0);
    assert.deepEqual(await damageCharges(db, tenant), []);
  }));

test("ค่าเสียหายเกินมัดจำ สร้างบิลส่วนเกินและต้องจ่ายก่อนย้ายออก", () =>
  withRollback(async (db) => {
    const tenant = await setupMovingOutTenant(db, { damage: 8000 });
    const result = await syncMoveOutDamageCharge(db, tenant.requestId);
    assert.equal(result.sentCents, 200000);
    const charges = await damageCharges(db, tenant);
    assert.equal(charges.length, 1);
    assert.equal(charges[0].amount, 2000);
    assert.equal(charges[0].status, "pending");

    const balance = await loadMoveOutBalance(db, tenant.customerId);
    assert.ok(balance.items.some((item) => item.type === "damage" && item.amount === 2000));

    assert.equal((await syncMoveOutDamageCharge(db, tenant.requestId)).sentCents, 0);
    assert.equal((await damageCharges(db, tenant)).length, 1);

    await db.query("UPDATE Payment SET status = 'paid' WHERE booking_id = ? AND type = 'damage'", [tenant.bookingId]);
    await db.query("UPDATE TenantRequest SET status = 'approved', completed_at = NOW() WHERE id = ?", [tenant.requestId]);
    const contract = (await loadCustomerContracts(db, [tenant.customerId])).get(tenant.customerId);
    assert.equal(contract.rent_paid, 18000);
    assert.equal(contract.deposit_remaining, 6000);
    assert.equal(contract.damage_excess, 2000);
    assert.deepEqual(contract.damage_charge, { amount: 2000, paid: 2000, status: "paid" });
  }));

test("แก้ผลตรวจห้อง บิลส่วนเกินคำนวณใหม่ และยกเลิกเมื่อไม่เกินแล้ว", () =>
  withRollback(async (db) => {
    const tenant = await setupMovingOutTenant(db, { damage: 8000 });
    await syncMoveOutDamageCharge(db, tenant.requestId);

    await setDamage(db, tenant, 6500);
    assert.equal((await syncMoveOutDamageCharge(db, tenant.requestId)).sentCents, 50000);
    let charges = await damageCharges(db, tenant);
    assert.deepEqual(charges.map((row) => [row.amount, row.status]), [[2000, "cancelled"], [500, "pending"]]);

    await setDamage(db, tenant, 3000);
    assert.equal((await syncMoveOutDamageCharge(db, tenant.requestId)).sentCents, 0);
    charges = await damageCharges(db, tenant);
    assert.ok(charges.every((row) => row.status === "cancelled"));
    const [[request]] = await db.query("SELECT damage_charge_payment_id FROM TenantRequest WHERE id = ?", [tenant.requestId]);
    assert.equal(request.damage_charge_payment_id, null);
  }));

test("ผู้เช่าส่งสลิปส่วนเกินแล้ว แก้ค่าเสียหายไม่ได้", () =>
  withRollback(async (db) => {
    const tenant = await setupMovingOutTenant(db, { damage: 8000 });
    await syncMoveOutDamageCharge(db, tenant.requestId);
    await db.query("UPDATE Payment SET slip_path = '/uploads/slip.png' WHERE booking_id = ? AND type = 'damage'", [tenant.bookingId]);
    assert.equal(await validateMoveOutDamage(db, tenant.requestId, 800000), null);
    assert.match(await validateMoveOutDamage(db, tenant.requestId, 700000), /แก้ไขค่าเสียหายไม่ได้/);
  }));

test("คำขอย้ายออกถูกยกเลิก บิลส่วนเกินที่ยังไม่จ่ายถูกยกเลิกตาม", () =>
  withRollback(async (db) => {
    const tenant = await setupMovingOutTenant(db, { damage: 8000 });
    await syncMoveOutDamageCharge(db, tenant.requestId);
    await db.query("UPDATE TenantRequest SET status = 'rejected' WHERE id = ?", [tenant.requestId]);
    await expireRoomTransferCharges(db);
    const charges = await damageCharges(db, tenant);
    assert.equal(charges[0].status, "cancelled");
  }));
