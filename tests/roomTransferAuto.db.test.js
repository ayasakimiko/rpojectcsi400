import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const {
  AUTO_TRANSFER_ACTOR,
  attachTransferContractImages,
  autoApplyPaidTransfers,
  listPendingTransferContracts,
  syncRoomTransferCharge,
} = await import("../router/rentalContracts.js");
const { ACTIVE_VEHICLE_SQL, cancelCustomerVisitRequests } = await import("../router/parking.js");

const contractImages = () => Array.from({ length: 5 }, (_, index) => ({ name: `auto-${index}`, url: `/uploads/contracts/auto-${randomUUID()}.jpg` }));

after(async () => {
  await getPool().end();
});

async function freeRoomNumbers(connection, count) {
  const [rows] = await connection.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  const free = [];
  for (let number = 999; number >= 900 && free.length < count; number -= 1) if (!used.has(number)) free.push(number);
  return free;
}

async function setupTenant(connection, { oldPrice = 3500, newPrice = 4500 } = {}) {
  const [sourceNumber, targetNumber] = await freeRoomNumbers(connection, 2);
  const deposit = oldPrice * 2;
  const [sourceResult] = await connection.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date, billing_start_date)
     VALUES (?, TRUE, ?, 6, DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL 15 DAY),
             DATE_ADD(DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL 15 DAY), INTERVAL 6 MONTH),
             DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL 15 DAY))`,
    [sourceNumber, oldPrice],
  );
  await connection.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, ?)", [targetNumber, newPrice]);
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const [customerResult] = await connection.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount)
     VALUES (?, 'x', ?, 'ทดสอบ', 'ย้ายอัตโนมัติ', 30, ?, ?)`,
    [`A${tag}`, `09${tag.slice(0, 8)}`, sourceNumber, deposit],
  );
  const customerId = customerResult.insertId;
  const [[sourceRoom]] = await connection.query("SELECT * FROM Room WHERE id = ?", [sourceResult.insertId]);
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
  await connection.query(
    `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, checklist, damage_note, damage_cost, photos, status)
     VALUES (?, ?, 'ทดสอบ ย้ายอัตโนมัติ', '{}', NULL, 0, '[]', 'reviewed')`,
    [sourceNumber, requestId],
  );
  return { customerId, bookingId, requestId, sourceNumber, targetNumber };
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

async function payTransferCharge(connection, requestId) {
  await connection.query(
    `UPDATE Payment p JOIN TenantRequest tr ON tr.transfer_charge_payment_id = p.id
     SET p.status = 'paid', p.slip_path = 'auto-test.jpg' WHERE tr.id = ?`,
    [requestId],
  );
}

test("unpaid transfer charge is not moved automatically", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection);
    assert.ok((await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ")) > 0);
    assert.deepEqual(await autoApplyPaidTransfers(connection), []);
    const [[customer]] = await connection.query("SELECT room_number FROM Customer WHERE id = ?", [tenant.customerId]);
    assert.equal(Number(customer.room_number), tenant.sourceNumber);
  }));

test("paid transfer charge moves the tenant automatically and waits for the new contract", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection);
    await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ");
    await payTransferCharge(connection, tenant.requestId);

    const applied = await autoApplyPaidTransfers(connection);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].requestId, tenant.requestId);
    assert.deepEqual(await autoApplyPaidTransfers(connection), []);

    const [[customer]] = await connection.query("SELECT room_number FROM Customer WHERE id = ?", [tenant.customerId]);
    assert.equal(Number(customer.room_number), tenant.targetNumber);
    const [[request]] = await connection.query("SELECT status, completed_by_name FROM TenantRequest WHERE id = ?", [tenant.requestId]);
    assert.equal(request.status, "approved");
    assert.equal(request.completed_by_name, AUTO_TRANSFER_ACTOR);
    const [[source]] = await connection.query("SELECT is_booked FROM Room WHERE room_number = ?", [tenant.sourceNumber]);
    const [[target]] = await connection.query("SELECT is_booked FROM Room WHERE room_number = ?", [tenant.targetNumber]);
    assert.equal(Boolean(source.is_booked), false);
    assert.equal(Boolean(target.is_booked), true);

    const pending = await listPendingTransferContracts(connection);
    const transfer = pending.find((row) => row.tenant_request_id === tenant.requestId);
    assert.ok(transfer, "ต้องอยู่ในรายการรอแนบสัญญาใหม่");
    const [[{ initial }]] = await connection.query("SELECT COUNT(*) AS initial FROM ContractImage WHERE room_transfer_id = ?", [transfer.id]);
    assert.equal(Number(initial), 0);

    await attachTransferContractImages(connection, transfer.id, contractImages());
    const [[{ attached }]] = await connection.query("SELECT COUNT(*) AS attached FROM ContractImage WHERE room_transfer_id = ?", [transfer.id]);
    assert.equal(Number(attached), 5);
    assert.ok(!(await listPendingTransferContracts(connection)).some((row) => row.id === transfer.id));
    await assert.rejects(attachTransferContractImages(connection, transfer.id, contractImages()), { status: 409 });
  }));

test("a failing automatic transfer does not undo the payment", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection);
    await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ");
    await payTransferCharge(connection, tenant.requestId);
    await connection.query("UPDATE Room SET is_booked = TRUE WHERE room_number = ?", [tenant.targetNumber]);

    assert.deepEqual(await autoApplyPaidTransfers(connection), []);
    const [[request]] = await connection.query(
      `SELECT tr.status, p.status AS payment_status FROM TenantRequest tr JOIN Payment p ON p.id = tr.transfer_charge_payment_id WHERE tr.id = ?`,
      [tenant.requestId],
    );
    assert.equal(request.status, "in_progress");
    assert.equal(request.payment_status, "paid");
  }));

async function addVehicle(connection, { customerId, roomNumber, plate, type = "car", status = "approved", endOffsetDays = 30, parkedAt = null, checkedOutAt = null }) {
  const [result] = await connection.query(
    `INSERT INTO ResidentVisitRequest (customer_id, room_number, request_type, user_category, vehicle_type, vehicle_plate, start_at, end_at, status, parked_at, checked_out_at)
     VALUES (?, ?, 'vehicle', 'resident', ?, ?, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?, ?)`,
    [customerId, roomNumber, type, plate, endOffsetDays, status, parkedAt, checkedOutAt],
  );
  return result.insertId;
}

async function vehicleRow(connection, id) {
  const [[row]] = await connection.query("SELECT room_number, status, cancelled_by_name FROM ResidentVisitRequest WHERE id = ?", [id]);
  return { ...row, room_number: Number(row.room_number) };
}

test("room transfer moves the tenant's active vehicles to the new room and leaves the old room clear", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection);
    const owner = { customerId: tenant.customerId, roomNumber: tenant.sourceNumber };
    const car = await addVehicle(connection, { ...owner, plate: "ทส 1001" });
    const pendingBike = await addVehicle(connection, { ...owner, plate: "ทส 1002", type: "motorcycle", status: "pending" });
    const parkedPastEnd = await addVehicle(connection, { ...owner, plate: "ทส 1003", endOffsetDays: -1, parkedAt: new Date(Date.now() - 2 * 86400000) });
    const expired = await addVehicle(connection, { ...owner, plate: "ทส 1004", endOffsetDays: -1 });
    const checkedOut = await addVehicle(connection, { ...owner, plate: "ทส 1005", parkedAt: new Date(Date.now() - 86400000), checkedOutAt: new Date() });

    await syncRoomTransferCharge(connection, tenant.requestId, "ทดสอบ");
    await payTransferCharge(connection, tenant.requestId);
    assert.equal((await autoApplyPaidTransfers(connection)).length, 1);

    for (const id of [car, pendingBike, parkedPastEnd]) {
      const row = await vehicleRow(connection, id);
      assert.equal(row.room_number, tenant.targetNumber);
      assert.notEqual(row.status, "cancelled");
    }
    for (const id of [expired, checkedOut]) assert.equal((await vehicleRow(connection, id)).room_number, tenant.sourceNumber);

    const [[{ left }]] = await connection.query(
      `SELECT COUNT(*) AS \`left\` FROM ResidentVisitRequest r
       WHERE r.room_number = ? AND ${ACTIVE_VEHICLE_SQL}`,
      [tenant.sourceNumber],
    );
    assert.equal(Number(left), 0);
  }));

test("move-out and suspension cancel every vehicle the tenant still holds, including one parked past its end", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection);
    const owner = { customerId: tenant.customerId, roomNumber: tenant.sourceNumber };
    const car = await addVehicle(connection, { ...owner, plate: "ทส 2001" });
    const pendingBike = await addVehicle(connection, { ...owner, plate: "ทส 2002", type: "motorcycle", status: "pending" });
    const parkedPastEnd = await addVehicle(connection, { ...owner, plate: "ทส 2003", endOffsetDays: -1, parkedAt: new Date(Date.now() - 2 * 86400000) });
    const checkedOut = await addVehicle(connection, { ...owner, plate: "ทส 2004", parkedAt: new Date(Date.now() - 86400000), checkedOutAt: new Date() });

    await cancelCustomerVisitRequests(connection, tenant.customerId, "ระบบ (ผู้เช่าย้ายออก)");

    for (const id of [car, pendingBike, parkedPastEnd]) {
      const row = await vehicleRow(connection, id);
      assert.equal(row.status, "cancelled");
      assert.equal(row.cancelled_by_name, "ระบบ (ผู้เช่าย้ายออก)");
    }
    assert.equal((await vehicleRow(connection, checkedOut)).status, "approved");
    const [[{ active }]] = await connection.query(
      `SELECT COUNT(*) AS active FROM ResidentVisitRequest r WHERE r.customer_id = ? AND ${ACTIVE_VEHICLE_SQL}`,
      [tenant.customerId],
    );
    assert.equal(Number(active), 0);
  }));
