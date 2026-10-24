import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const { loadCustomerContracts } = await import("../router/rentalContracts.js");
const { parseMoveOutInspectionInput, parseDepositSettlementInput } = await import("../middleware/validation.js");

const STAFF_URL = `http://localhost:${process.env.STAFF_PORT || 4004}/api/staff`;
const goodChecklist = { walls: "good", floor: "good", ceiling: "good", doors: "good", windows: "good", electrical: "good", bathroom: "good", furniture: "good" };
const photo = { name: "wall.jpg", dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==" };

after(async () => {
  await getPool().end();
});

async function freeRoomNumber(db) {
  const [rows] = await db.query(`SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999`);
  const used = new Set(rows.map((row) => Number(row.room_number)));
  for (let number = 999; number >= 900; number -= 1) if (!used.has(number)) return number;
  throw new Error("no free test room");
}

async function setupMovedOutTenant(db, { price = 3000, endOffsetDays = -1, damage = 1500 } = {}) {
  const roomNumber = await freeRoomNumber(db);
  const deposit = price * 2;
  const [roomResult] = await db.query(`INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, ?)`, [roomNumber, price]);
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const [customerResult] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount, is_suspended, suspended_at)
     VALUES (?, 'x', ?, 'ทดสอบ', 'คืนมัดจำ', 30, NULL, ?, TRUE, NOW())`,
    [`D${tag}`, `08${tag.slice(0, 8)}`, deposit],
  );
  const customerId = customerResult.insertId;
  const [bookingResult] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, deposit_amount, contract_duration_months, created_at)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), DATE_ADD(CURDATE(), INTERVAL ? DAY), DATE_SUB(CURDATE(), INTERVAL 6 MONTH), ?, 6, DATE_SUB(NOW(), INTERVAL 6 MONTH))`,
    [customerId, roomResult.insertId, endOffsetDays, deposit],
  );
  const bookingId = bookingResult.insertId;
  await db.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), 'paid', 'rent'), (?, ?, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), 'paid', 'deposit')`,
    [bookingId, price, bookingId, deposit],
  );
  const [requestResult] = await db.query(
    `INSERT INTO TenantRequest (customer_id, room_number, type, status, preferred_move_date, completed_at)
     VALUES (?, ?, 'moveout', 'approved', CURDATE(), NOW())`,
    [customerId, roomNumber],
  );
  await db.query(
    `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, checklist, damage_note, damage_cost, photos, status)
     VALUES (?, ?, 'ทดสอบ คืนมัดจำ', ?, ?, ?, '[]', 'reviewed')`,
    [roomNumber, requestResult.insertId, JSON.stringify({ ...goodChecklist, walls: "damaged" }), damage > 0 ? "ผนังเป็นรู 1 จุด" : null, damage],
  );
  return { customerId, bookingId, roomNumber, roomId: roomResult.insertId, requestId: requestResult.insertId, deposit };
}

async function removeTenant(db, tenant) {
  await db.query(`DELETE FROM DepositSettlementLog WHERE booking_id = ?`, [tenant.bookingId]);
  await db.query(`DELETE FROM MoveOutInspection WHERE tenant_request_id = ?`, [tenant.requestId]);
  await db.query(`DELETE FROM TenantRequest WHERE customer_id = ?`, [tenant.customerId]);
  await db.query(`DELETE FROM Payment WHERE booking_id = ?`, [tenant.bookingId]);
  await db.query(`DELETE FROM Booking WHERE id = ?`, [tenant.bookingId]);
  await db.query(`DELETE FROM Customer WHERE id = ?`, [tenant.customerId]);
  await db.query(`DELETE FROM Room WHERE id = ?`, [tenant.roomId]);
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

async function staffToken() {
  const [rows] = await getPool().query(`SELECT * FROM Staff LIMIT 1`);
  assert.ok(rows[0], "ต้องมีบัญชี Staff อย่างน้อย 1 บัญชีในฐานข้อมูล");
  return jwt.sign({ id: rows[0].id, role: "Staff" }, process.env.JWT_SECRET || "dev-secret-change-me", { expiresIn: "5m" });
}

async function settle(token, bookingId, body) {
  const response = await fetch(`${STAFF_URL}/contracts/${bookingId}/deposit-settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test("move-out inspection damage is the sum of checklist item costs and asset costs", () => {
  const { value, error } = parseMoveOutInspectionInput({
    room_number: 901,
    checklist: { ...goodChecklist, walls: "damaged", floor: "wear" },
    item_costs: { walls: 800, floor: 200, ceiling: 999 },
    assets: [
      { name: "ตู้เย็น", price: 5000, result: "missing", cost: 4500 },
      { name: "โต๊ะทำงาน", price: 2300, result: "good", cost: 500 },
    ],
    damage_note: "ผนังเป็นรู พื้นมีรอย ตู้เย็นหาย",
    photos: [photo],
  });
  assert.equal(error, undefined);
  assert.equal(value.damageCostCents, 550000);
  assert.deepEqual(value.itemCosts, { walls: 800, floor: 200 });
  assert.equal(value.assets.find((asset) => asset.name === "โต๊ะทำงาน").cost, undefined);
});

test("move-out inspection rejects damage without a note or photos", () => {
  const damaged = { room_number: 901, checklist: { ...goodChecklist, walls: "damaged" }, item_costs: { walls: 800 } };
  assert.match(parseMoveOutInspectionInput(damaged).error, /ระบุรายการ/);
  assert.match(parseMoveOutInspectionInput({ ...damaged, damage_note: "ผนังเป็นรู" }).error, /แนบภาพ/);
  assert.match(parseMoveOutInspectionInput({ room_number: 901, checklist: goodChecklist, damage_cost: 300 }).error, /ระบุรายการความเสียหาย/);
  assert.match(parseMoveOutInspectionInput({ room_number: 901, checklist: goodChecklist, damage_cost: "12.345" }).error, /ทศนิยม/);
});

test("deposit settlement input: refund minus damage, deduction capped at the deposit, forfeit keeps everything", () => {
  assert.deepEqual(parseDepositSettlementInput({ action: "refund", deduction: 1500, note: "ผนังเป็นรู" }, 6000).value, {
    action: "refund", deductionCents: 150000, refundCents: 450000, note: "ผนังเป็นรู",
  });
  assert.equal(parseDepositSettlementInput({ action: "refund" }, 6000).value.refundCents, 600000);
  assert.equal(parseDepositSettlementInput({ action: "refund", deduction: 6000, note: "เสียหายทั้งห้อง" }, 6000).value.refundCents, 0);
  assert.match(parseDepositSettlementInput({ action: "refund", deduction: 6000.01, note: "x" }, 6000).error, /ไม่เกินเงินมัดจำ/);
  assert.match(parseDepositSettlementInput({ action: "refund", deduction: -1, note: "x" }, 6000).error, /ตั้งแต่ 0/);
  assert.match(parseDepositSettlementInput({ action: "refund", deduction: 100 }, 6000).error, /รายการค่าเสียหาย/);
  assert.match(parseDepositSettlementInput({ action: "forfeit" }, 6000).error, /เหตุผล/);
  assert.deepEqual(parseDepositSettlementInput({ action: "forfeit", note: "ออกก่อนครบสัญญา" }, 6000).value, {
    action: "forfeit", deductionCents: 600000, refundCents: 0, note: "ออกก่อนครบสัญญา",
  });
});

test("tenant who stayed the full contract gets a refund with the inspection damage ready to deduct", () =>
  withRollback(async (connection) => {
    const tenant = await setupMovedOutTenant(connection, { endOffsetDays: -1, damage: 1500 });
    const contract = (await loadCustomerContracts(connection, [tenant.customerId])).get(tenant.customerId);
    assert.equal(contract.status, "ended");
    assert.equal(contract.deposit_refund, "refund");
    assert.equal(contract.can_settle_deposit, true);
    assert.equal(contract.deposit_remaining, 6000);
    assert.equal(Number(contract.moveout_damage_cost), 1500);
    assert.equal(contract.moveout_damage_note, "ผนังเป็นรู 1 จุด");
  }));

test("tenant who moved out before the contract end forfeits the deposit", () =>
  withRollback(async (connection) => {
    const tenant = await setupMovedOutTenant(connection, { endOffsetDays: 30, damage: 1500 });
    const contract = (await loadCustomerContracts(connection, [tenant.customerId])).get(tenant.customerId);
    assert.equal(contract.status, "ended_early");
    assert.equal(contract.deposit_refund, "forfeit");
    assert.equal(contract.can_settle_deposit, true);
  }));

test("staff API refunds the deposit minus damage once and logs it", async () => {
  const pool = getPool();
  const tenant = await setupMovedOutTenant(pool, { endOffsetDays: -1, damage: 1500 });
  try {
    const token = await staffToken();

    const tooMuch = await settle(token, tenant.bookingId, { action: "refund", deduction: 6500, note: "เกิน" });
    assert.equal(tooMuch.status, 400);
    const wrongAction = await settle(token, tenant.bookingId, { action: "forfeit", note: "ลองริบ" });
    assert.equal(wrongAction.status, 409);

    const ok = await settle(token, tenant.bookingId, { action: "refund", deduction: 1500, note: "ผนังเป็นรู 1 จุด" });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.contract.deposit_settlement, "refunded");
    assert.equal(ok.data.contract.deposit_deduction, 1500);
    assert.equal(ok.data.contract.deposit_refunded_amount, 4500);
    assert.equal(ok.data.contract.can_settle_deposit, false);

    const [[log]] = await pool.query(`SELECT * FROM DepositSettlementLog WHERE booking_id = ?`, [tenant.bookingId]);
    assert.equal(log.action, "refunded");
    assert.equal(Number(log.deposit_amount), 6000);
    assert.equal(Number(log.deduction), 1500);
    assert.equal(Number(log.refunded_amount), 4500);
    assert.equal(Number(log.forfeited_amount), 0);
    assert.ok(log.settled_by_name);

    const again = await settle(token, tenant.bookingId, { action: "refund", deduction: 0 });
    assert.equal(again.status, 409);
    const [logs] = await pool.query(`SELECT id FROM DepositSettlementLog WHERE booking_id = ?`, [tenant.bookingId]);
    assert.equal(logs.length, 1);
  } finally {
    await removeTenant(pool, tenant);
  }
});

test("staff API forfeits the whole deposit when the tenant left early", async () => {
  const pool = getPool();
  const tenant = await setupMovedOutTenant(pool, { endOffsetDays: 30, damage: 1500 });
  try {
    const token = await staffToken();
    const refund = await settle(token, tenant.bookingId, { action: "refund", deduction: 1500, note: "ผนังเป็นรู" });
    assert.equal(refund.status, 409);
    const ok = await settle(token, tenant.bookingId, { action: "forfeit", note: "ย้ายออกก่อนครบสัญญา" });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const [[log]] = await pool.query(`SELECT * FROM DepositSettlementLog WHERE booking_id = ?`, [tenant.bookingId]);
    assert.equal(log.action, "forfeited");
    assert.equal(Number(log.forfeited_amount), 6000);
    assert.equal(Number(log.refunded_amount), 0);
  } finally {
    await removeTenant(pool, tenant);
  }
});
