import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

process.env.DB_NAME = "projectcsi400_rtest";

const { configureDatabaseService, DB_CONFIG, getPool, SCHEMA_SERVICES, serviceDatabaseName } = await import("../Database/connection.js");
const { computeRentCoverage, loadMoveOutBalance } = await import("../router/CustomerDashboardRouter.js");
const {
  applyRoomTransfer,
  buildRoomTransferPlan,
  computeRoomTransferSettlement,
  contractImagesParser,
  loadCustomerContracts,
  removeContractFiles,
  ROOM_TRANSFER_MIN_CONTRACT_IMAGES,
} = await import("../router/rentalContracts.js");
const { default: express } = await import("express");

const settle = (sourcePrice, targetPrice, depositRemaining, chargeablePeriods = 1) =>
  computeRoomTransferSettlement({
    sourcePriceCents: sourcePrice * 100,
    targetPriceCents: targetPrice * 100,
    chargeablePeriods,
    depositRemainingCents: depositRemaining * 100,
  });

describe("computeRoomTransferSettlement", () => {
  test("sufficient deposit covers the whole difference", () => {
    const result = settle(3000, 3500, 6000);
    assert.equal(result.totalDifferenceCents, 50000);
    assert.equal(result.depositDeductedCents, 50000);
    assert.equal(result.additionalChargeCents, 0);
    assert.equal(result.depositRemainingAfterCents, 550000);
  });

  test("insufficient deposit charges the uncovered amount", () => {
    const result = settle(3000, 3500, 300);
    assert.equal(result.depositDeductedCents, 30000);
    assert.equal(result.additionalChargeCents, 20000);
    assert.equal(result.depositRemainingAfterCents, 0);
  });

  test("no deposit charges the whole difference", () => {
    const result = settle(3000, 3500, 0);
    assert.equal(result.depositDeductedCents, 0);
    assert.equal(result.additionalChargeCents, 50000);
  });

  test("equal price neither deducts nor charges", () => {
    const result = settle(3000, 3000, 6000);
    assert.equal(result.totalDifferenceCents, 0);
    assert.equal(result.depositDeductedCents, 0);
    assert.equal(result.additionalChargeCents, 0);
  });

  test("lower price neither deducts nor charges", () => {
    const result = settle(3500, 3000, 6000);
    assert.equal(result.priceDifferenceCents, -50000);
    assert.equal(result.chargeablePeriods, 0);
    assert.equal(result.depositDeductedCents, 0);
    assert.equal(result.additionalChargeCents, 0);
  });

  test("already prepaid periods are each upgraded once", () => {
    const result = settle(3000, 3500, 600, 3);
    assert.equal(result.totalDifferenceCents, 150000);
    assert.equal(result.depositDeductedCents, 60000);
    assert.equal(result.additionalChargeCents, 90000);
  });

  test("nothing paid yet means no difference to settle", () => {
    const result = settle(3000, 3500, 6000, 0);
    assert.equal(result.totalDifferenceCents, 0);
  });
});

describe("computeRentCoverage", () => {
  const start = new Date(2026, 0, 15, 12, 0, 0);
  const room = { price: 3000, rental_start_date: start, rental_end_date: new Date(2026, 6, 15, 12, 0, 0), prepaid_until: null };

  test("one paid month covers the current period only", () => {
    const coverage = computeRentCoverage(room, [{ type: "rent", status: "paid", amount: 3000, payment_date: start }], new Date(2026, 0, 20));
    assert.equal(coverage.currentIndex, 0);
    assert.equal(coverage.coveredThroughIndex, 0);
    assert.equal(coverage.paidPeriodsFromCurrent, 1);
    assert.deepEqual(coverage.paidThrough, new Date(2026, 1, 15, 12, 0, 0));
  });

  test("room transfer and utility charges never count as rent", () => {
    const coverage = computeRentCoverage(room, [
      { type: "room_transfer", status: "paid", amount: 3000, payment_date: start },
      { type: "electricity", status: "paid", amount: 3000, payment_date: start },
    ], new Date(2026, 0, 20));
    assert.equal(coverage.coveredThroughIndex, -1);
    assert.equal(coverage.paidPeriodsFromCurrent, 0);
  });
});

describe("contract image upload for room transfer", () => {
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  let server;
  let baseUrl;
  const received = [];

  before(async () => {
    const app = express();
    app.post("/upload", contractImagesParser({ min: ROOM_TRANSFER_MIN_CONTRACT_IMAGES }), async (req, res) => {
      received.push(...req.files);
      res.json({ count: req.files.length });
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await removeContractFiles(received);
    await new Promise((resolve) => server.close(resolve));
  });

  const upload = (files) => {
    const body = new FormData();
    files.forEach((content, index) => body.append("contract_images", new Blob([content], { type: "image/png" }), `contract-${index}.png`));
    return fetch(`${baseUrl}/upload`, { method: "POST", body });
  };

  test("rejects fewer than 5 images", async () => {
    const response = await upload(Array(4).fill(PNG_1X1));
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /อย่างน้อย 5 รูป/);
  });

  test("rejects a file that is not a real image", async () => {
    const response = await upload([...Array(4).fill(PNG_1X1), Buffer.from("not an image")]);
    assert.equal(response.status, 400);
  });

  test("accepts 5 real images", async () => {
    const response = await upload(Array(5).fill(PNG_1X1));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).count, 5);
  });
});

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

async function seedScenario({ sourcePrice, targetPrice, deposit, depositPaid, rentPaid = sourcePrice, withInspection = true }) {
  const sourceNumber = roomCounter++;
  const targetNumber = roomCounter++;
  const start = new Date();
  start.setDate(start.getDate() - 10);
  start.setMilliseconds(0);
  const end = new Date(start.getFullYear(), start.getMonth() + 6, start.getDate(), start.getHours(), start.getMinutes(), start.getSeconds());
  const [sourceResult] = await pool.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date)
     VALUES (?, TRUE, ?, 6, ?, ?)`,
    [sourceNumber, sourcePrice, start, end],
  );
  await pool.query(`INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, ?)`, [targetNumber, targetPrice]);
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
    `INSERT INTO ContractImage (booking_id, customer_id, name, url) VALUES ?`,
    [[1, 2, 3].map((index) => [bookingId, customerId, `สัญญาเดิม ${index}`, `/uploads/contracts/test-old-${bookingId}-${index}.png`])],
  );
  if (rentPaid > 0) {
    await pool.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type) VALUES (?, ?, ?, 'paid', 'rent')`,
      [bookingId, rentPaid, start],
    );
  }
  if (depositPaid > 0) {
    await pool.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type) VALUES (?, ?, ?, 'paid', 'deposit')`,
      [bookingId, depositPaid, start],
    );
  }
  const [requestResult] = await pool.query(
    `INSERT INTO TenantRequest (customer_id, room_number, target_room_number, type, move_reason, status)
     VALUES (?, ?, ?, 'move_room', 'price', 'in_progress')`,
    [customerId, sourceNumber, targetNumber],
  );
  const requestId = requestResult.insertId;
  if (withInspection) {
    await pool.query(
      `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, checklist, photos, status, reviewed_at)
       VALUES (?, ?, 'ทดสอบ', '{}', '[]', 'reviewed', NOW())`,
      [sourceNumber, requestId],
    );
  }
  return { sourceNumber, targetNumber, customerId, bookingId, requestId, start, end };
}

let imageCounter = 0;
const newContractImages = (count = 5) =>
  Array.from({ length: count }, () => {
    imageCounter += 1;
    return { name: `สัญญาใหม่ ${imageCounter}`, url: `/uploads/contracts/test-new-${process.pid}-${imageCounter}.png` };
  });

async function approve(requestId, wrapConnection = (connection) => connection, images = newContractImages()) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const db = wrapConnection(connection);
    const plan = await buildRoomTransferPlan(db, requestId, { lock: true });
    if (plan.blockers.length > 0 || plan.stale) {
      await connection.rollback();
      return { plan, approved: false };
    }
    await applyRoomTransfer(db, plan, "เจ้าหน้าที่ทดสอบ", images);
    await db.query(`UPDATE TenantRequest SET status = 'approved', completed_at = NOW() WHERE id = ?`, [requestId]);
    await connection.commit();
    return { plan, approved: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function snapshot(scenario) {
  const [[customer]] = await pool.query(`SELECT room_number FROM Customer WHERE id = ?`, [scenario.customerId]);
  const [rooms] = await pool.query(
    `SELECT room_number, is_booked, prepaid_until FROM Room WHERE room_number IN (?, ?) ORDER BY room_number`,
    [scenario.sourceNumber, scenario.targetNumber],
  );
  const [bookings] = await pool.query(`SELECT id, room_id FROM Booking WHERE customer_id = ? ORDER BY id`, [scenario.customerId]);
  const [transfers] = await pool.query(`SELECT * FROM RoomTransfer WHERE customer_id = ?`, [scenario.customerId]);
  const [charges] = await pool.query(
    `SELECT p.* FROM Payment p JOIN Booking b ON b.id = p.booking_id WHERE b.customer_id = ? AND p.type = 'room_transfer'`,
    [scenario.customerId],
  );
  const [[request]] = await pool.query(`SELECT status FROM TenantRequest WHERE id = ?`, [scenario.requestId]);
  const [images] = await pool.query(
    `SELECT url, replaced_at IS NOT NULL AS replaced, replaced_by_transfer_id, room_transfer_id
     FROM ContractImage WHERE customer_id = ? ORDER BY id`,
    [scenario.customerId],
  );
  return { customer, rooms, bookings, transfers, charges, request, images };
}

const integration = (name, fn) => test(name, async (t) => {
  if (skipReason) return t.skip(skipReason);
  await fn(t);
});

describe("room transfer approval (MySQL)", () => {
  integration("sufficient deposit: deducts from deposit, no extra charge, contract shows new room", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 6000, depositPaid: 6000 });
    const { approved } = await approve(scenario.requestId);
    assert.equal(approved, true);

    const state = await snapshot(scenario);
    assert.equal(state.customer.room_number, scenario.targetNumber);
    assert.deepEqual(state.rooms.map((room) => Boolean(room.is_booked)), [false, true]);
    assert.equal(state.bookings.length, 2);
    assert.equal(state.transfers.length, 1);
    assert.equal(Number(state.transfers[0].deposit_deducted), 500);
    assert.equal(Number(state.transfers[0].amount_charged), 0);
    assert.equal(state.charges.length, 0);
    assert.equal(state.request.status, "approved");

    const contract = (await loadCustomerContracts(pool, [scenario.customerId], { currentOnly: true })).get(scenario.customerId);
    assert.equal(contract.room_number, scenario.targetNumber);
    assert.equal(contract.original_room_number, scenario.sourceNumber);
    assert.equal(contract.monthly_price, 3500);
    assert.equal(contract.original_monthly_price, 3000);
    assert.equal(contract.deposit_paid, 6000);
    assert.equal(contract.deposit_transfer_deducted, 500);
    assert.equal(contract.deposit_remaining, 5500);
    assert.equal(contract.room_transfers.length, 1);
    assert.equal(contract.contract_total, 3000 + 3500 * 5 + 500);
    assert.equal(contract.rent_paid, 3000 + 500);

    const balance = await loadMoveOutBalance(pool, scenario.customerId);
    assert.deepEqual(balance.items, []);
  });

  integration("insufficient deposit: deducts what is left and adds the rest to amount due once", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 300, depositPaid: 300 });
    assert.equal((await approve(scenario.requestId)).approved, true);

    const state = await snapshot(scenario);
    assert.equal(Number(state.transfers[0].deposit_deducted), 300);
    assert.equal(Number(state.transfers[0].amount_charged), 200);
    assert.equal(state.charges.length, 1);
    assert.equal(state.charges[0].status, "pending");
    assert.equal(state.charges[0].booking_id, state.bookings.at(-1).id);

    const balance = await loadMoveOutBalance(pool, scenario.customerId);
    assert.deepEqual(balance.items.map((item) => [item.type, item.amount]), [["room_transfer", 200]]);

    await pool.query(`UPDATE Payment SET status = 'paid' WHERE id = ?`, [state.charges[0].id]);
    assert.deepEqual((await loadMoveOutBalance(pool, scenario.customerId)).items, []);

    const [[targetRoom]] = await pool.query(`SELECT * FROM Room WHERE room_number = ?`, [scenario.targetNumber]);
    const [newBookingPayments] = await pool.query(`SELECT * FROM Payment WHERE booking_id = ?`, [state.bookings.at(-1).id]);
    const nextMonth = new Date(scenario.start.getFullYear(), scenario.start.getMonth() + 1, scenario.start.getDate() + 1);
    const coverage = computeRentCoverage(targetRoom, newBookingPayments, nextMonth);
    assert.equal(coverage.priceCents, 350000);
    assert.equal(coverage.currentIndex, 0);
    assert.equal(coverage.coveredThroughIndex, -1);

    const contract = (await loadCustomerContracts(pool, [scenario.customerId])).get(scenario.customerId);
    assert.equal(contract.rent_paid, 3000 + 300 + 200);
    assert.equal(contract.deposit_remaining, 0);
  });

  integration("equal price: no deduction, no charge", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3000, deposit: 6000, depositPaid: 6000 });
    assert.equal((await approve(scenario.requestId)).approved, true);
    const state = await snapshot(scenario);
    assert.equal(Number(state.transfers[0].deposit_deducted), 0);
    assert.equal(Number(state.transfers[0].amount_charged), 0);
    assert.equal(state.charges.length, 0);
  });

  integration("lower price: no deduction, no charge, contract price drops for future months", async () => {
    const scenario = await seedScenario({ sourcePrice: 3500, targetPrice: 3000, deposit: 7000, depositPaid: 7000 });
    assert.equal((await approve(scenario.requestId)).approved, true);
    const state = await snapshot(scenario);
    assert.equal(Number(state.transfers[0].deposit_deducted), 0);
    assert.equal(state.charges.length, 0);
    const contract = (await loadCustomerContracts(pool, [scenario.customerId])).get(scenario.customerId);
    assert.equal(contract.monthly_price, 3000);
    assert.equal(contract.deposit_remaining, 7000);
    assert.equal(contract.contract_total, 3500 + 3000 * 5);
  });

  integration("duplicate approval is rejected and deducts only once", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 6000, depositPaid: 6000 });
    const first = await approve(scenario.requestId);
    assert.equal(first.approved, true);

    const second = await approve(scenario.requestId);
    assert.equal(second.approved, false);
    assert.ok(second.plan.blockers.includes("คำขอนี้ถูกดำเนินการไปแล้ว") || second.plan.stale);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await assert.rejects(applyRoomTransfer(connection, first.plan, "ซ้ำ", newContractImages()), { code: "ER_DUP_ENTRY" });
      await connection.rollback();
    } finally {
      connection.release();
    }

    const state = await snapshot(scenario);
    assert.equal(state.transfers.length, 1);
    assert.equal(state.bookings.length, 2);
    const contract = (await loadCustomerContracts(pool, [scenario.customerId])).get(scenario.customerId);
    assert.equal(contract.deposit_remaining, 5500);
  });

  integration("failure partway through approval rolls everything back", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 300, depositPaid: 300 });
    const before = await snapshot(scenario);
    for (const failingStatement of ["INSERT INTO RoomTransfer", "INSERT INTO ContractImage"]) {
      const failOn = (connection) => ({
        query: (sql, params) => {
          if (String(sql).includes(failingStatement)) return Promise.reject(new Error("simulated failure"));
          return connection.query(sql, params);
        },
      });
      await assert.rejects(approve(scenario.requestId, failOn), /simulated failure/);
      const afterFailure = await snapshot(scenario);
      assert.deepEqual(afterFailure, before);
      assert.equal(afterFailure.request.status, "in_progress");
      assert.ok(afterFailure.images.every((image) => !image.replaced));
    }

    assert.equal((await approve(scenario.requestId)).approved, true);
    assert.equal((await snapshot(scenario)).transfers.length, 1);
  });

  integration("target room taken after the request blocks approval", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 6000, depositPaid: 6000 });
    await pool.query(`UPDATE Room SET is_booked = TRUE WHERE room_number = ?`, [scenario.targetNumber]);
    const result = await approve(scenario.requestId);
    assert.equal(result.approved, false);
    assert.ok(result.plan.blockers.some((message) => message.includes("มีผู้เช่าแล้ว")));
    assert.equal((await snapshot(scenario)).transfers.length, 0);
  });

  integration("new contract images replace the current ones and old images stay as history", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 6000, depositPaid: 6000 });
    const images = newContractImages(5);
    assert.equal((await approve(scenario.requestId, undefined, images)).approved, true);

    const state = await snapshot(scenario);
    const transferId = state.transfers[0].id;
    const current = state.images.filter((image) => !image.replaced);
    const archived = state.images.filter((image) => image.replaced);
    assert.deepEqual(current.map((image) => image.url), images.map((image) => image.url));
    assert.ok(current.every((image) => image.room_transfer_id === transferId));
    assert.equal(archived.length, 3);
    assert.ok(archived.every((image) => image.replaced_by_transfer_id === transferId));
    assert.equal(state.transfers[0].contract_booking_id, scenario.bookingId);

    const contract = (await loadCustomerContracts(pool, [scenario.customerId])).get(scenario.customerId);
    assert.equal(contract.booking_id, scenario.bookingId);
    assert.deepEqual(contract.images.map((image) => image.url), images.map((image) => image.url));
    assert.equal(contract.image_count, 5);
    assert.equal(contract.room_transfers[0].previous_images.length, 3);
    assert.equal(contract.room_transfers[0].new_images.length, 5);
  });

  integration("approval needs at least 5 new contract images and changes nothing without them", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 6000, depositPaid: 6000 });
    const before = await snapshot(scenario);
    for (const count of [0, 4]) {
      await assert.rejects(approve(scenario.requestId, undefined, newContractImages(count)), { code: "CONTRACT_IMAGES_REQUIRED" });
      assert.deepEqual(await snapshot(scenario), before);
    }
    assert.equal((await approve(scenario.requestId, undefined, newContractImages(5))).approved, true);
  });

  integration("billing continues on the normal monthly cycle without a prepaid marker", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 6000, depositPaid: 6000 });
    const { plan } = await approve(scenario.requestId);
    const [[targetRoom]] = await pool.query(`SELECT * FROM Room WHERE room_number = ?`, [scenario.targetNumber]);
    assert.equal(targetRoom.prepaid_until, null);
    assert.equal(targetRoom.rental_start_date.getTime(), scenario.start.getTime());
    assert.equal(targetRoom.rental_end_date.getTime(), scenario.end.getTime());
    assert.equal(targetRoom.billing_start_date.getTime(), plan.coverage.paidThrough.getTime());

    assert.deepEqual((await loadMoveOutBalance(pool, scenario.customerId)).items, []);

    const [bookings] = await pool.query(`SELECT id FROM Booking WHERE customer_id = ? ORDER BY id DESC LIMIT 1`, [scenario.customerId]);
    const [payments] = await pool.query(`SELECT * FROM Payment WHERE booking_id = ?`, [bookings[0].id]);
    const dueDay = new Date(plan.coverage.paidThrough.getTime() + 86400000);
    const nextCycle = computeRentCoverage(targetRoom, payments, dueDay);
    assert.equal(nextCycle.currentIndex, 0);
    assert.equal(nextCycle.coveredThroughIndex, -1);
    assert.equal(nextCycle.priceCents, 350000);

    await pool.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type) VALUES (?, 3500, ?, 'paid', 'rent')`,
      [bookings[0].id, dueDay],
    );
    const [paidPayments] = await pool.query(`SELECT * FROM Payment WHERE booking_id = ?`, [bookings[0].id]);
    const afterPaying = computeRentCoverage(targetRoom, paidPayments, dueDay);
    assert.equal(afterPaying.coveredThroughIndex, 0);
    assert.equal(afterPaying.paidPeriodsFromCurrent, 1);
  });

  integration("unpaid rent on the current room blocks approval", async () => {
    const scenario = await seedScenario({ sourcePrice: 3000, targetPrice: 3500, deposit: 6000, depositPaid: 6000, rentPaid: 0 });
    const result = await approve(scenario.requestId);
    assert.equal(result.approved, false);
    assert.ok(result.plan.blockers.some((message) => message.includes("ยอดค้างชำระ")));
  });
});
