import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const {
  applyRoomTransfer,
  buildRoomTransferPlan,
  claimRoomsForPaidTransfers,
  roomHeldForTransfer,
  loadCustomerContracts,
  syncRoomTransferCharge,
  validateInspectionDamage,
} = await import("../router/rentalContracts.js");
const { computeProratedRent } = await import("../router/roomTransferFinance.js");

const cents = (value) => Math.round(Number(value) * 100);
const contractImages = () => Array.from({ length: 5 }, (_, index) => ({ name: `test-${index}`, url: `/uploads/contracts/test-${randomUUID()}.jpg` }));

after(async () => {
  await getPool().end();
});

async function freeRoomNumbers(connection, count) {
  const [rows] = await connection.query(`SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999`);
  const used = new Set(rows.map((row) => Number(row.room_number)));
  const free = [];
  for (let number = 999; number >= 900 && free.length < count; number -= 1) if (!used.has(number)) free.push(number);
  return free;
}

async function setupTenant(connection, { oldPrice, newPrice, daysIntoPeriod = 15, damage = null }) {
  const [sourceNumber, targetNumber] = await freeRoomNumbers(connection, 2);
  const deposit = oldPrice * 2;
  const [sourceResult] = await connection.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date, billing_start_date)
     VALUES (?, TRUE, ?, 6, DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY),
             DATE_ADD(DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY), INTERVAL 6 MONTH),
             DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY))`,
    [sourceNumber, oldPrice, daysIntoPeriod, daysIntoPeriod, daysIntoPeriod],
  );
  await connection.query(`INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, ?)`, [targetNumber, newPrice]);
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const [customerResult] = await connection.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount)
     VALUES (?, 'x', ?, 'ทดสอบ', 'ย้ายห้อง', 30, ?, ?)`,
    [`T${tag}`, `09${tag.slice(0, 8)}`, sourceNumber, deposit],
  );
  const customerId = customerResult.insertId;
  const [[sourceRoom]] = await connection.query(`SELECT * FROM Room WHERE id = ?`, [sourceResult.insertId]);
  const [bookingResult] = await connection.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, deposit_amount, contract_duration_months)
     VALUES (?, ?, ?, ?, ?, ?, 6)`,
    [customerId, sourceRoom.id, sourceRoom.rental_start_date, sourceRoom.rental_end_date, sourceRoom.rental_start_date, deposit],
  );
  const bookingId = bookingResult.insertId;
  await connection.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type) VALUES (?, ?, DATE(?), 'paid', 'rent'), (?, ?, DATE(?), 'paid', 'deposit')`,
    [bookingId, oldPrice, sourceRoom.rental_start_date, bookingId, deposit, sourceRoom.rental_start_date],
  );
  const [requestResult] = await connection.query(
    `INSERT INTO TenantRequest (customer_id, room_number, target_room_number, type, status, move_reason, preferred_move_date)
     VALUES (?, ?, ?, 'move_room', 'in_progress', 'other', CURDATE())`,
    [customerId, sourceNumber, targetNumber],
  );
  const requestId = requestResult.insertId;
  if (damage !== null) {
    await connection.query(
      `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, checklist, damage_note, damage_cost, photos, status)
       VALUES (?, ?, 'ทดสอบ ย้ายห้อง', '{}', ?, ?, '[]', 'reviewed')`,
      [sourceNumber, requestId, damage > 0 ? "ผนังเป็นรู" : null, damage],
    );
  }
  return { customerId, bookingId, requestId, sourceNumber, targetNumber, sourceRoom, deposit };
}

function expectedProration(sourceRoom, oldPrice, newPrice) {
  const anchor = new Date(sourceRoom.billing_start_date);
  const paidThrough = new Date(anchor.getFullYear(), anchor.getMonth() + 1, anchor.getDate(), anchor.getHours());
  const today = new Date();
  return computeProratedRent({
    anchor,
    paidThrough,
    moveDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    sourcePriceCents: cents(oldPrice),
    targetPriceCents: cents(newPrice),
  });
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

test("cheaper room with lower deposit: no charge, surplus and rent credit retained as deposit, no double transfer", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { oldPrice: 5000, newPrice: 4000, damage: 0 });
    const plan = await buildRoomTransferPlan(connection, tenant.requestId, { lock: true });
    assert.deepEqual(plan.blockers, []);
    const expected = expectedProration(tenant.sourceRoom, 5000, 4000);
    const { settlement } = plan;
    assert.equal(settlement.depositBeforeCents, cents(10000));
    assert.equal(settlement.requiredCents, cents(8000));
    assert.equal(settlement.surplusCents, cents(2000));
    assert.equal(settlement.oldUnusedCents, expected.oldUnusedCents);
    assert.equal(settlement.rentCreditCents, expected.oldUnusedCents - expected.newProratedCents);
    assert.equal(settlement.rentChargeCents, 0);
    assert.equal(settlement.additionalChargeCents, 0);
    assert.equal(plan.transferCharge.required, false);

    assert.equal(await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ"), 0);
    await applyRoomTransfer(connection, plan, "ทดสอบ", contractImages());

    const [[row]] = await connection.query(`SELECT * FROM RoomTransfer WHERE tenant_request_id = ?`, [tenant.requestId]);
    assert.equal(cents(row.deposit_deducted), 0);
    assert.equal(cents(row.deposit_surplus_credit), cents(2000));
    assert.equal(cents(row.rent_credit_to_deposit), settlement.rentCreditCents);
    assert.equal(cents(row.deposit_after), cents(10000) + settlement.rentCreditCents);
    assert.equal(cents(row.price_difference_total), -settlement.rentCreditCents);
    assert.equal(Number(row.remaining_days), expected.remainingDays);

    const [[targetRoom]] = await connection.query(`SELECT is_booked, billing_start_date FROM Room WHERE room_number = ?`, [tenant.targetNumber]);
    assert.equal(Boolean(targetRoom.is_booked), true);
    assert.equal(new Date(targetRoom.billing_start_date).getTime(), new Date(plan.newPriceFrom).getTime());

    const contract = (await loadCustomerContracts(connection, [tenant.customerId])).get(tenant.customerId);
    assert.equal(cents(contract.deposit_remaining), cents(row.deposit_after));
    assert.equal(contract.deposit_transfer_adjusted, true);
    assert.equal(contract.status, "active");
    assert.equal(contract.room_transfers[0].finance.deposit_after, Number(row.deposit_after));

    const again = await buildRoomTransferPlan(connection, tenant.requestId, { lock: true });
    assert.ok(again.blockers.includes("คำขอนี้ถูกดำเนินการไปแล้ว"));
    await assert.rejects(applyRoomTransfer(connection, plan, "ทดสอบ", contractImages()), { code: "ER_DUP_ENTRY" });
  }));

test("more expensive room with damage: deposit top-up before the move, rent difference billed after it", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { oldPrice: 3500, newPrice: 4500, damage: 500 });
    const expected = expectedProration(tenant.sourceRoom, 3500, 4500);

    assert.match(await validateInspectionDamage(connection, tenant.requestId, cents(8000)), /ไม่เกินเงินมัดจำคงเหลือ/);
    assert.equal(await validateInspectionDamage(connection, tenant.requestId, cents(500)), null);

    const sent = await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ");
    const rentCharge = expected.newProratedCents - expected.oldUnusedCents;
    assert.equal(sent, cents(9000 - 6500));
    assert.equal(await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ"), 0);
    const [[firstRequest]] = await connection.query(`SELECT transfer_charge_payment_id, transfer_calc_date FROM TenantRequest WHERE id = ?`, [tenant.requestId]);
    assert.ok(firstRequest.transfer_calc_date);

    await connection.query(`UPDATE MoveOutInspection SET damage_cost = 0 WHERE tenant_request_id = ?`, [tenant.requestId]);
    const resent = await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ");
    assert.equal(resent, cents(9000 - 7000));
    const [[oldPayment]] = await connection.query(`SELECT status FROM Payment WHERE id = ?`, [firstRequest.transfer_charge_payment_id]);
    assert.equal(oldPayment.status, "cancelled");

    await connection.query(`UPDATE MoveOutInspection SET damage_cost = 500 WHERE tenant_request_id = ?`, [tenant.requestId]);
    await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ");
    const [[request]] = await connection.query(`SELECT transfer_charge_payment_id FROM TenantRequest WHERE id = ?`, [tenant.requestId]);
    const unpaid = await buildRoomTransferPlan(connection, tenant.requestId, { lock: true });
    await assert.rejects(applyRoomTransfer(connection, unpaid, "ทดสอบ", contractImages()), { code: "TRANSFER_CHARGE_UNPAID" });

    await connection.query(`UPDATE Payment SET status = 'paid', slip_path = 'test.jpg' WHERE id = ?`, [request.transfer_charge_payment_id]);
    assert.match(await validateInspectionDamage(connection, tenant.requestId, 0), /แก้ไขค่าเสียหายไม่ได้/);
    const plan = await buildRoomTransferPlan(connection, tenant.requestId, { lock: true });
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.settlement.damageDeductionCents, cents(500));
    assert.equal(plan.settlement.transferableCents, cents(6500));
    assert.equal(plan.settlement.topupCents, cents(2500));
    assert.equal(plan.settlement.rentChargeCents, rentCharge);
    await applyRoomTransfer(connection, plan, "ทดสอบ", contractImages());

    const [[row]] = await connection.query(`SELECT * FROM RoomTransfer WHERE tenant_request_id = ?`, [tenant.requestId]);
    assert.equal(cents(row.damage_deduction), cents(500));
    assert.equal(cents(row.deposit_topup), cents(2500));
    assert.equal(cents(row.rent_charge), rentCharge);
    assert.equal(cents(row.amount_charged), cents(2500));
    assert.equal(cents(row.deposit_after), cents(9000));
    assert.equal(Number(row.charge_payment_id), Number(request.transfer_charge_payment_id));
    assert.ok(row.rent_charge_payment_id);

    const [[rentBill]] = await connection.query(`SELECT booking_id, amount, status, type FROM Payment WHERE id = ?`, [row.rent_charge_payment_id]);
    assert.equal(Number(rentBill.booking_id), Number(row.to_booking_id));
    assert.equal(cents(rentBill.amount), rentCharge);
    assert.equal(rentBill.status, "pending");
    assert.equal(rentBill.type, "room_transfer");

    const contract = (await loadCustomerContracts(connection, [tenant.customerId])).get(tenant.customerId);
    assert.equal(cents(contract.deposit_remaining), cents(9000));
    assert.equal(cents(contract.deposit_transfer_deducted), cents(500));
    const unpaidRent = cents(contract.rent_paid);
    await connection.query(`UPDATE Payment SET status = 'paid' WHERE id = ?`, [row.rent_charge_payment_id]);
    const paidContract = (await loadCustomerContracts(connection, [tenant.customerId])).get(tenant.customerId);
    assert.equal(cents(paidContract.rent_paid), unpaidRent + rentCharge);
  }));

test("two tenants can ask for the same room and whoever pays the deposit top-up first gets it", () =>
  withRollback(async (connection) => {
    const first = await setupTenant(connection, { oldPrice: 3500, newPrice: 4500, damage: 0 });
    const second = await setupTenant(connection, { oldPrice: 3500, newPrice: 4500, damage: 0 });
    await connection.query(`UPDATE TenantRequest SET target_room_number = ? WHERE id = ?`, [first.targetNumber, second.requestId]);

    assert.ok(await syncRoomTransferCharge(connection, first.requestId, "ทดสอบ") > 0);
    assert.ok(await syncRoomTransferCharge(connection, second.requestId, "ทดสอบ") > 0);
    assert.equal(await roomHeldForTransfer(connection, first.targetNumber, { exceptRequestId: second.requestId }), false);

    const [[firstRequest]] = await connection.query(`SELECT transfer_charge_payment_id FROM TenantRequest WHERE id = ?`, [first.requestId]);
    const [[secondRequest]] = await connection.query(`SELECT transfer_charge_payment_id FROM TenantRequest WHERE id = ?`, [second.requestId]);
    await connection.query(`UPDATE Payment SET status = 'paid', slip_path = 'test.jpg' WHERE id = ?`, [firstRequest.transfer_charge_payment_id]);
    assert.equal(await claimRoomsForPaidTransfers(connection), 1);

    const [[loser]] = await connection.query(`SELECT status, reject_reason FROM TenantRequest WHERE id = ?`, [second.requestId]);
    assert.equal(loser.status, "cancelled");
    assert.match(loser.reject_reason, /ชำระเงินย้ายเข้าห้อง .* ก่อนแล้ว/);
    const [[loserCharge]] = await connection.query(`SELECT status FROM Payment WHERE id = ?`, [secondRequest.transfer_charge_payment_id]);
    assert.equal(loserCharge.status, "cancelled");

    const [[winner]] = await connection.query(`SELECT status FROM TenantRequest WHERE id = ?`, [first.requestId]);
    assert.equal(winner.status, "in_progress");
    assert.equal(await roomHeldForTransfer(connection, first.targetNumber, { exceptCustomerId: second.customerId }), true);
    const plan = await buildRoomTransferPlan(connection, first.requestId, { lock: true });
    assert.deepEqual(plan.blockers, []);
  }));

test("unpaid current rent blocks the transfer and never creates credit", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { oldPrice: 5000, newPrice: 3500, daysIntoPeriod: 40, damage: 0 });
    const plan = await buildRoomTransferPlan(connection, tenant.requestId, { lock: true });
    assert.ok(plan.blockers.some((message) => message.includes("ยอดค้างชำระ")));
    assert.equal(plan.settlement.rentCreditCents, 0);
    assert.equal(plan.settlement.oldUnusedCents, 0);
    assert.equal(await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ"), 0);
  }));
