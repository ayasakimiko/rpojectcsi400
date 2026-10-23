import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

process.env.DB_NAME = "projectcsi400_rtest";

const { configureDatabaseService, DB_CONFIG, getPool, SCHEMA_SERVICES, serviceDatabaseName } = await import("../Database/connection.js");
const { loadMoveOutBalance } = await import("../router/CustomerDashboardRouter.js");
const {
  applyRoomTransfer,
  buildRoomTransferPlan,
  cancelTransfersIntoBookedRooms,
  expireRoomTransferCharges,
  loadHeldTransferRooms,
  loadRoomTransferPreview,
  requestRoomTransferCharge,
  ROOM_TRANSFER_CHARGE_DAYS,
  roomHeldForTransfer,
  roomTransferNeedsPayment,
} = await import("../router/rentalContracts.js");
const { default: express } = await import("express");
const { default: jwt } = await import("jsonwebtoken");
const { default: registerRouter } = await import("../router/Register.js");
const { default: roomRouter } = await import("../router/RoomRouter.js");

const databases = SCHEMA_SERVICES.map((service) => serviceDatabaseName(DB_CONFIG.database, service));
let admin = null;
let pool = null;
let roomCounter = 900;
let skipReason = null;

async function dropTestDatabases() {
  await admin.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const database of databases) await admin.query("DROP DATABASE IF EXISTS ??", [database]);
  await admin.query("SET FOREIGN_KEY_CHECKS = 1");
}

before(async () => {
  try {
    const { database: _database, ...serverConfig } = DB_CONFIG;
    admin = await mysql.createConnection(serverConfig);
  } catch (error) {
    skipReason = `MySQL not reachable (${error.code || error.message})`;
    return;
  }
  await dropTestDatabases();
  const migrate = spawnSync(process.execPath, [fileURLToPath(new URL("../Database/migrate.js", import.meta.url))], {
    env: { ...process.env, DB_NAME: DB_CONFIG.database },
    encoding: "utf8",
  });
  if (migrate.status !== 0) throw new Error(`Migration failed: ${migrate.stderr || migrate.stdout}`);
  configureDatabaseService("staff");
  pool = getPool();
});

after(async () => {
  await pool?.end();
  if (admin) {
    await dropTestDatabases();
    await admin.end();
  }
});

async function seedScenario({ sourcePrice = 3000, targetPrice = 3500, deposit, depositPaid = deposit, targetNumber = null }) {
  const sourceNumber = roomCounter++;
  const target = targetNumber ?? roomCounter++;
  const start = new Date();
  start.setDate(start.getDate() - 20);
  start.setMilliseconds(0);
  const end = new Date(start.getFullYear(), start.getMonth() + 6, start.getDate(), start.getHours(), start.getMinutes(), start.getSeconds());
  const [sourceResult] = await pool.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date)
     VALUES (?, TRUE, ?, 6, ?, ?)`,
    [sourceNumber, sourcePrice, start, end],
  );
  if (!targetNumber) await pool.query(`INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, ?)`, [target, targetPrice]);
  const [customerResult] = await pool.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount)
     VALUES (?, 'x', ?, 'ทดสอบ', ?, 25, ?, ?)`,
    [`T${sourceNumber}`, `09${sourceNumber}0000`, `ห้อง${sourceNumber}`, sourceNumber, deposit],
  );
  const customerId = customerResult.insertId;
  const [bookingResult] = await pool.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_duration_months, contract_completed_at, deposit_amount)
     VALUES (?, ?, ?, ?, 6, NOW(), ?)`,
    [customerId, sourceResult.insertId, start, end, deposit],
  );
  const bookingId = bookingResult.insertId;
  await pool.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type) VALUES (?, ?, ?, 'paid', 'rent')`,
    [bookingId, sourcePrice, start],
  );
  if (depositPaid > 0) {
    await pool.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type) VALUES (?, ?, ?, 'paid', 'deposit')`,
      [bookingId, depositPaid, start],
    );
  }
  const [requestResult] = await pool.query(
    `INSERT INTO TenantRequest (customer_id, room_number, target_room_number, type, move_reason, status)
     VALUES (?, ?, ?, 'move_room', 'price', 'in_progress')`,
    [customerId, sourceNumber, target],
  );
  const requestId = requestResult.insertId;
  await pool.query(
    `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, checklist, photos, status, reviewed_at)
     VALUES (?, ?, 'ทดสอบ', '{}', '[]', 'reviewed', NOW())`,
    [sourceNumber, requestId],
  );
  return { sourceNumber, targetNumber: target, customerId, bookingId, requestId };
}

let imageCounter = 0;
const newContractImages = () =>
  Array.from({ length: 5 }, () => {
    imageCounter += 1;
    return { name: `สัญญาใหม่ ${imageCounter}`, url: `/uploads/contracts/test-charge-${process.pid}-${imageCounter}.png` };
  });

async function inTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const sendCharge = (requestId) =>
  inTransaction(async (connection) => {
    const plan = await buildRoomTransferPlan(connection, requestId, { lock: true });
    return requestRoomTransferCharge(connection, plan, "เจ้าหน้าที่ทดสอบ");
  });

const approve = (requestId) =>
  inTransaction(async (connection) => {
    const plan = await buildRoomTransferPlan(connection, requestId, { lock: true });
    assert.deepEqual(plan.blockers, []);
    await applyRoomTransfer(connection, plan, "เจ้าหน้าที่ทดสอบ", newContractImages());
    await connection.query(`UPDATE TenantRequest SET status = 'approved', completed_at = NOW() WHERE id = ?`, [requestId]);
    return plan;
  });

async function snapshot(scenario) {
  const [[customer]] = await pool.query(`SELECT room_number FROM Customer WHERE id = ?`, [scenario.customerId]);
  const [[request]] = await pool.query(
    `SELECT status, reject_reason, transfer_charge_payment_id, transfer_charge_due_at FROM TenantRequest WHERE id = ?`,
    [scenario.requestId],
  );
  const [charges] = await pool.query(
    `SELECT p.* FROM Payment p JOIN Booking b ON b.id = p.booking_id WHERE b.customer_id = ? AND p.type = 'room_transfer' ORDER BY p.id`,
    [scenario.customerId],
  );
  const [transfers] = await pool.query(`SELECT * FROM RoomTransfer WHERE customer_id = ?`, [scenario.customerId]);
  const [[target]] = await pool.query(`SELECT is_booked FROM Room WHERE room_number = ?`, [scenario.targetNumber]);
  return { customer, request, charges, transfers, targetBooked: Boolean(target.is_booked) };
}

const integration = (name, fn) => test(name, async (t) => {
  if (skipReason) return t.skip(skipReason);
  await fn(t);
});

describe("room transfer with insufficient deposit (MySQL)", () => {
  integration("cannot sign the transfer before the difference is sent and paid", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    const plan = await buildRoomTransferPlan(pool, scenario.requestId);
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.transferCharge.required, true);
    assert.equal(plan.transferCharge.status, "not_sent");
    assert.equal(roomTransferNeedsPayment(plan), true);

    const preview = await loadRoomTransferPreview(pool, scenario.requestId);
    assert.equal(preview.can_approve, false);
    assert.equal(preview.can_request_charge, true);
    assert.equal(preview.transfer_charge.amount, 200);

    await assert.rejects(
      inTransaction((connection) => applyRoomTransfer(connection, plan, "เจ้าหน้าที่ทดสอบ", newContractImages())),
      { code: "TRANSFER_CHARGE_UNPAID" },
    );
    const state = await snapshot(scenario);
    assert.equal(state.customer.room_number, scenario.sourceNumber);
    assert.equal(state.transfers.length, 0);
    assert.equal(state.charges.length, 0);
  });

  integration("sending the charge bills the customer with a 3-day deadline but does not move them", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    const paymentId = await sendCharge(scenario.requestId);

    const state = await snapshot(scenario);
    assert.equal(state.customer.room_number, scenario.sourceNumber);
    assert.equal(state.targetBooked, false);
    assert.equal(state.request.status, "in_progress");
    assert.equal(state.request.transfer_charge_payment_id, paymentId);
    const hoursLeft = (new Date(state.request.transfer_charge_due_at) - Date.now()) / 3600000;
    assert.ok(hoursLeft > ROOM_TRANSFER_CHARGE_DAYS * 24 - 1 && hoursLeft <= ROOM_TRANSFER_CHARGE_DAYS * 24);
    assert.equal(state.charges.length, 1);
    assert.equal(state.charges[0].status, "pending");
    assert.equal(Number(state.charges[0].amount), 200);
    assert.equal(state.charges[0].booking_id, scenario.bookingId);

    const balance = await loadMoveOutBalance(pool, scenario.customerId);
    assert.deepEqual(balance.items.map((item) => [item.type, item.amount]), [["room_transfer", 200]]);

    const plan = await buildRoomTransferPlan(pool, scenario.requestId);
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.transferCharge.status, "unpaid");
    const preview = await loadRoomTransferPreview(pool, scenario.requestId);
    assert.equal(preview.can_approve, false);
    assert.equal(preview.can_request_charge, false);
  });

  integration("after the customer pays, staff can sign and the paid charge is reused", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    const paymentId = await sendCharge(scenario.requestId);

    await pool.query(`UPDATE Payment SET slip_path = '/uploads/slips/test.png' WHERE id = ?`, [paymentId]);
    assert.equal((await buildRoomTransferPlan(pool, scenario.requestId)).transferCharge.status, "verifying");
    assert.equal((await loadRoomTransferPreview(pool, scenario.requestId)).can_approve, false);

    await pool.query(`UPDATE Payment SET status = 'paid' WHERE id = ?`, [paymentId]);
    assert.equal((await loadRoomTransferPreview(pool, scenario.requestId)).can_approve, true);
    await approve(scenario.requestId);

    const state = await snapshot(scenario);
    assert.equal(state.customer.room_number, scenario.targetNumber);
    assert.equal(state.targetBooked, true);
    assert.equal(state.transfers.length, 1);
    assert.equal(Number(state.transfers[0].deposit_deducted), 300);
    assert.equal(Number(state.transfers[0].amount_charged), 200);
    assert.equal(state.transfers[0].charge_payment_id, paymentId);
    assert.equal(state.charges.length, 1);
    assert.deepEqual((await loadMoveOutBalance(pool, scenario.customerId)).items, []);
  });

  integration("unpaid after 3 days cancels the transfer request and the charge", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    const paymentId = await sendCharge(scenario.requestId);
    await pool.query(`UPDATE TenantRequest SET transfer_charge_due_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?`, [scenario.requestId]);

    assert.equal(await expireRoomTransferCharges(pool), 1);

    const state = await snapshot(scenario);
    assert.equal(state.request.status, "cancelled");
    assert.match(state.request.reject_reason, /3 วัน/);
    assert.equal(state.charges[0].id, paymentId);
    assert.equal(state.charges[0].status, "cancelled");
    assert.equal(state.customer.room_number, scenario.sourceNumber);
    assert.equal(state.transfers.length, 0);
    assert.deepEqual((await loadMoveOutBalance(pool, scenario.customerId)).items, []);
  });

  integration("not expired yet keeps the request waiting", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    await sendCharge(scenario.requestId);
    await expireRoomTransferCharges(pool);
    const state = await snapshot(scenario);
    assert.equal(state.request.status, "in_progress");
    assert.equal(state.charges[0].status, "pending");
  });

  integration("a slip sent before the deadline is not cancelled while waiting for review", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    const paymentId = await sendCharge(scenario.requestId);
    await pool.query(`UPDATE Payment SET slip_path = '/uploads/slips/test.png' WHERE id = ?`, [paymentId]);
    await pool.query(`UPDATE TenantRequest SET transfer_charge_due_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?`, [scenario.requestId]);

    await expireRoomTransferCharges(pool);
    const state = await snapshot(scenario);
    assert.equal(state.request.status, "in_progress");
    assert.equal(state.charges[0].status, "pending");

    await pool.query(`UPDATE Payment SET slip_path = NULL WHERE id = ?`, [paymentId]);
    await expireRoomTransferCharges(pool);
    assert.equal((await snapshot(scenario)).request.status, "cancelled");
  });

  integration("a rejected request has its unpaid charge cancelled", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    await sendCharge(scenario.requestId);
    await pool.query(`UPDATE TenantRequest SET status = 'rejected' WHERE id = ?`, [scenario.requestId]);
    await expireRoomTransferCharges(pool);
    assert.equal((await snapshot(scenario)).charges[0].status, "cancelled");
  });

  integration("the target room is held for the customer who is paying", async () => {
    const first = await seedScenario({ deposit: 300 });
    const second = await seedScenario({ deposit: 6000, targetNumber: first.targetNumber });
    await sendCharge(first.requestId);
    const plan = await buildRoomTransferPlan(pool, second.requestId);
    assert.ok(plan.blockers.some((message) => message.includes("จองไว้ระหว่างรอชำระส่วนต่าง")));
  });

  integration("a held room is reported as held to everyone except the paying customer", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    assert.equal(await roomHeldForTransfer(pool, scenario.targetNumber), false);
    await sendCharge(scenario.requestId);
    assert.equal(await roomHeldForTransfer(pool, scenario.targetNumber), true);
    assert.equal(await roomHeldForTransfer(pool, scenario.targetNumber, { exceptCustomerId: scenario.customerId }), false);
    assert.equal((await loadHeldTransferRooms(pool)).has(scenario.targetNumber), true);
    assert.equal((await loadHeldTransferRooms(pool, { exceptCustomerId: scenario.customerId })).has(scenario.targetNumber), false);
  });

  integration("someone else moving into the target room cancels the waiting request and its charge", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    await sendCharge(scenario.requestId);
    await pool.query(`UPDATE Room SET is_booked = TRUE WHERE room_number = ?`, [scenario.targetNumber]);

    await expireRoomTransferCharges(pool);

    const state = await snapshot(scenario);
    assert.equal(state.request.status, "cancelled");
    assert.match(state.request.reject_reason, new RegExp(`ห้อง ${scenario.targetNumber} มีผู้เช่าเข้าพักแล้ว`));
    assert.equal(state.charges[0].status, "cancelled");
    assert.equal(state.customer.room_number, scenario.sourceNumber);
  });

  integration("approving one transfer cancels other requests for the same room", async () => {
    const first = await seedScenario({ deposit: 6000 });
    const second = await seedScenario({ deposit: 6000, targetNumber: first.targetNumber });
    await inTransaction(async (connection) => {
      const plan = await buildRoomTransferPlan(connection, first.requestId, { lock: true });
      await applyRoomTransfer(connection, plan, "เจ้าหน้าที่ทดสอบ", newContractImages());
      await connection.query(`UPDATE TenantRequest SET status = 'approved', completed_at = NOW() WHERE id = ?`, [first.requestId]);
      await cancelTransfersIntoBookedRooms(connection, first.targetNumber);
    });
    assert.equal((await snapshot(first)).request.status, "approved");
    const other = await snapshot(second);
    assert.equal(other.request.status, "cancelled");
    assert.match(other.request.reject_reason, /มีผู้เช่าเข้าพักแล้ว/);
  });

  integration("an unpaid deposit counts as outstanding and blocks the transfer", async () => {
    const scenario = await seedScenario({ deposit: 6000, depositPaid: 0 });
    const balance = await loadMoveOutBalance(pool, scenario.customerId);
    assert.deepEqual(balance.items.map((item) => [item.type, item.amount]), [["deposit", 6000]]);
    assert.equal(balance.amount, 6000);
    const plan = await buildRoomTransferPlan(pool, scenario.requestId);
    assert.ok(plan.blockers.some((message) => message.includes("ยอดค้างชำระ") && message.includes("เงินมัดจำ")));

    await pool.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type) VALUES (?, 6000, CURDATE(), 'paid', 'deposit')`,
      [scenario.bookingId],
    );
    assert.deepEqual((await loadMoveOutBalance(pool, scenario.customerId)).items, []);
  });

  integration("enough deposit needs no payment step", async () => {
    const scenario = await seedScenario({ deposit: 6000 });
    const preview = await loadRoomTransferPreview(pool, scenario.requestId);
    assert.equal(preview.transfer_charge.required, false);
    assert.equal(preview.can_approve, true);
    assert.equal(preview.can_request_charge, false);
    await approve(scenario.requestId);
    const state = await snapshot(scenario);
    assert.equal(state.customer.room_number, scenario.targetNumber);
    assert.equal(Number(state.transfers[0].deposit_deducted), 500);
    assert.equal(state.transfers[0].charge_payment_id, null);
    assert.equal(state.charges.length, 0);
  });
});

describe("new tenant registration respects a held room (HTTP)", () => {
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  let server = null;
  let baseUrl = "";
  let staffToken = "";
  let idcardCounter = 0;

  before(async () => {
    if (skipReason) return;
    const [staffResult] = await pool.query(
      `INSERT INTO Staff (idcard, password, phone, first_name, last_name, age) VALUES ('9999999999990', 'x', '0999999990', 'พนักงาน', 'ทดสอบ', 30)`,
    );
    staffToken = jwt.sign({ id: staffResult.insertId, role: "Staff" }, process.env.JWT_SECRET || "dev-secret-change-me");
    const app = express();
    app.use(express.json());
    app.use("/api/auth", registerRouter);
    app.use("/api/rooms", roomRouter);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  const availableRoom = async (roomNumber) => {
    const response = await fetch(`${baseUrl}/api/rooms/available`);
    assert.equal(response.status, 200);
    return (await response.json()).rooms.find((room) => Number(room.room_number) === roomNumber);
  };

  const register = (roomNumber) => {
    idcardCounter += 1;
    const body = new FormData();
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const pad = (value) => String(value).padStart(2, "0");
    const fields = {
      idcard: `88888888${String(idcardCounter).padStart(5, "0")}`,
      password: "secret123",
      phone: `08${String(idcardCounter).padStart(8, "0")}`,
      first_name: "ผู้เช่าใหม่",
      last_name: "ทดสอบ",
      age: "25",
      room_number: String(roomNumber),
      rental_start_date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T12:00`,
      contract_duration_months: "3",
      deposit_months: "2",
    };
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    for (let index = 0; index < 3; index += 1) {
      body.append("contract_images", new Blob([PNG_1X1], { type: "image/png" }), `contract-${index}.png`);
    }
    return fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${staffToken}` },
      body,
    }).then(async (response) => ({ status: response.status, body: await response.json(), idcard: fields.idcard }));
  };

  integration("a room waiting for a transfer payment is still offered at registration, flagged", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    assert.equal((await availableRoom(scenario.targetNumber)).held_for_transfer, false);
    await sendCharge(scenario.requestId);
    const room = await availableRoom(scenario.targetNumber);
    assert.ok(room);
    assert.equal(room.held_for_transfer, true);
  });

  integration("registering into a room waiting for a transfer payment cancels that transfer and its charge", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    await sendCharge(scenario.requestId);

    const result = await register(scenario.targetNumber);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.cancelled_transfers, 1);
    assert.match(result.body.message, /ยกเลิกคำขอย้ายเข้าห้อง/);

    const [customers] = await pool.query(`SELECT room_number FROM Customer WHERE idcard = ?`, [result.idcard]);
    assert.equal(customers[0].room_number, scenario.targetNumber);
    const state = await snapshot(scenario);
    assert.equal(state.targetBooked, true);
    assert.equal(state.request.status, "cancelled");
    assert.match(state.request.reject_reason, /มีผู้เช่าเข้าพักแล้ว/);
    assert.equal(state.charges[0].status, "cancelled");
    assert.equal(state.customer.room_number, scenario.sourceNumber);
    assert.equal(state.transfers.length, 0);
    assert.deepEqual((await loadMoveOutBalance(pool, scenario.customerId)).items, []);
    assert.equal(await availableRoom(scenario.targetNumber), undefined);
  });

  integration("after the hold expires the room can be registered again", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    await sendCharge(scenario.requestId);
    await pool.query(`UPDATE TenantRequest SET transfer_charge_due_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?`, [scenario.requestId]);

    assert.equal((await availableRoom(scenario.targetNumber)).held_for_transfer, false);
    const result = await register(scenario.targetNumber);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const [[room]] = await pool.query(`SELECT is_booked FROM Room WHERE room_number = ?`, [scenario.targetNumber]);
    assert.equal(Boolean(room.is_booked), true);
    assert.equal((await snapshot(scenario)).request.status, "cancelled");
  });

  integration("registering a tenant into a requested room cancels the pending transfer request", async () => {
    const scenario = await seedScenario({ deposit: 6000 });
    const result = await register(scenario.targetNumber);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const state = await snapshot(scenario);
    assert.equal(state.request.status, "cancelled");
    assert.match(state.request.reject_reason, /มีผู้เช่าเข้าพักแล้ว/);
    assert.equal(state.customer.room_number, scenario.sourceNumber);
  });

  integration("other free rooms can still be registered while one is held", async () => {
    const scenario = await seedScenario({ deposit: 300 });
    await sendCharge(scenario.requestId);
    const freeRoom = roomCounter++;
    await pool.query(`INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, 3000)`, [freeRoom]);
    const result = await register(freeRoom);
    assert.equal(result.status, 201, JSON.stringify(result.body));
  });
});
