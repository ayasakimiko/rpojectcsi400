import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const {
  FIRST_PAYMENT_GRACE_DAYS,
  FIRST_PAYMENT_UNPAID_CODE,
  FIRST_PAYMENT_VOIDED_CODE,
  firstPaymentReminderNotices,
  loadFirstPaymentGate,
  voidUnpaidContract,
} = await import("../router/firstPayment.js");
const { loadContractByBooking } = await import("../router/rentalContracts.js");
const { requireActiveCustomer } = await import("../middleware/accounts.js");

after(async () => {
  await getPool().end();
});

async function freeRoomNumber(db) {
  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  for (let number = 999; number >= 900; number -= 1) if (!used.has(number)) return number;
  throw new Error("ไม่มีเลขห้องว่างสำหรับทดสอบ");
}

async function setupTenant(db, { startInDays, dueInDays = startInDays + FIRST_PAYMENT_GRACE_DAYS, gated = true }) {
  const roomNumber = await freeRoomNumber(db);
  const [roomResult] = await db.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date)
     VALUES (?, TRUE, 3500, 6, DATE_ADD(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY),
             DATE_ADD(DATE_ADD(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY), INTERVAL 6 MONTH))`,
    [roomNumber, startInDays, startInDays],
  );
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const [customerResult] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount)
     VALUES (?, 'x', ?, 'ทดสอบ', 'งวดแรก', 30, ?, 7000)`,
    [`F${tag}`, `08${tag.slice(0, 8)}`, roomNumber],
  );
  const customerId = customerResult.insertId;
  const [[room]] = await db.query("SELECT * FROM Room WHERE id = ?", [roomResult.insertId]);
  const [bookingResult] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at,
                          contract_duration_months, deposit_amount, first_payment_due_date)
     VALUES (?, ?, ?, ?, NOW(), 6, 7000, IF(?, DATE_ADD(CURDATE(), INTERVAL ? DAY), NULL))`,
    [customerId, room.id, room.rental_start_date, room.rental_end_date, gated, dueInDays],
  );
  return { customerId, roomNumber, roomId: room.id, bookingId: bookingResult.insertId };
}

async function addPayment(db, tenant, { amount, type, status = "paid", slip = null }) {
  await db.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note, slip_path) VALUES (?, ?, CURDATE(), ?, ?, 'test', ?)`,
    [tenant.bookingId, amount, status, type, slip],
  );
}

async function removeTenant(db, tenant) {
  await db.query("DELETE FROM TenantRequest WHERE customer_id = ?", [tenant.customerId]);
  await db.query("DELETE FROM MaintenanceRequest WHERE customer_id = ?", [tenant.customerId]);
  await db.query("DELETE FROM Payment WHERE booking_id = ?", [tenant.bookingId]);
  await db.query("DELETE FROM Booking WHERE customer_id = ?", [tenant.customerId]);
  await db.query("DELETE FROM Customer WHERE id = ?", [tenant.customerId]);
  await db.query("DELETE FROM Room WHERE id = ?", [tenant.roomId]);
}

async function withTenant(options, run) {
  const pool = getPool();
  const tenant = await setupTenant(pool, options);
  try {
    await run(tenant, pool);
  } finally {
    await removeTenant(pool, tenant);
  }
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

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function runGuard(customerId, method, url) {
  const req = { user: { id: customerId, role: "Customer" }, method, originalUrl: url };
  const res = fakeResponse();
  let nextCalled = false;
  await requireActiveCustomer(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

const gateFor = (overrides) => ({
  booking_id: 1, customer_id: 2, room_number: 901, first_name: "ก", last_name: "ข",
  rental_start_date: "2026-12-01T03:00:00.000Z", due_date: "2026-12-08",
  status: "due", expired: false, amount: 10500, days_to_start: 10, days_to_due: 17, ...overrides,
});

test("เตือนก่อนเริ่มสัญญา 15 วันและ 7 วัน แล้วเตือนวันเริ่มสัญญาทั้งผู้เช่าและเจ้าหน้าที่", () => {
  assert.equal(FIRST_PAYMENT_GRACE_DAYS, 7);
  assert.deepEqual(firstPaymentReminderNotices(gateFor({ days_to_start: 20 })), []);
  assert.equal(firstPaymentReminderNotices(gateFor({ days_to_start: 15 }))[0].dedupeKey, "first-payment-1-15");
  assert.equal(firstPaymentReminderNotices(gateFor({ days_to_start: 8 }))[0].dedupeKey, "first-payment-1-15");
  assert.equal(firstPaymentReminderNotices(gateFor({ days_to_start: 7 }))[0].dedupeKey, "first-payment-1-7");
  assert.equal(firstPaymentReminderNotices(gateFor({ days_to_start: 2 }))[0].dedupeKey, "first-payment-1-7");

  const startDay = firstPaymentReminderNotices(gateFor({ days_to_start: 0, days_to_due: 7 }));
  assert.equal(startDay.length, 2);
  assert.equal(startDay[0].audience, "Customer");
  assert.match(startDay[0].message, /เหลืออีก 7 วัน/);
  assert.equal(startDay[1].dedupeKey, "first-payment-start-staff-1");

  assert.match(firstPaymentReminderNotices(gateFor({ days_to_start: -7, days_to_due: 0 }))[0].message, /วันนี้วันสุดท้าย/);
  assert.deepEqual(firstPaymentReminderNotices(gateFor({ status: "pending", days_to_start: 0 })), []);
  assert.deepEqual(firstPaymentReminderNotices(gateFor({ expired: true, days_to_start: -8, days_to_due: -1 })), []);
});

test("ยังไม่จ่ายงวดแรก: สัญญายังไม่มีผล ใช้งานได้แค่ดูข้อมูลและจ่ายเงิน", async () => {
  await withTenant({ startInDays: 10 }, async (tenant, pool) => {
    const gate = await loadFirstPaymentGate(pool, tenant.customerId);
    assert.equal(gate.status, "due");
    assert.equal(gate.expired, false);
    assert.equal(gate.amount, 10500);

    const contract = await loadContractByBooking(pool, tenant.bookingId);
    assert.equal(contract.status, "awaiting_payment");
    assert.ok(contract.first_payment_due_date);

    const blocked = await runGuard(tenant.customerId, "POST", "/api/customer/maintenance");
    assert.equal(blocked.nextCalled, false);
    assert.equal(blocked.res.statusCode, 403);
    assert.equal(blocked.res.body.code, FIRST_PAYMENT_UNPAID_CODE);

    assert.equal((await runGuard(tenant.customerId, "POST", "/api/customer/payments/confirm")).nextCalled, true);
    assert.equal((await runGuard(tenant.customerId, "GET", "/api/customer/contract")).nextCalled, true);
  });
});

test("จ่ายงวดแรกครบแล้ว ระบบปลดล็อกและล้างกำหนดชำระ", async () => {
  await withTenant({ startInDays: -3 }, async (tenant, pool) => {
    await addPayment(pool, tenant, { amount: 3500, type: "rent" });
    await addPayment(pool, tenant, { amount: 7000, type: "deposit" });
    assert.equal(await loadFirstPaymentGate(pool, tenant.customerId), null);
    const [[booking]] = await pool.query("SELECT first_payment_due_date FROM Booking WHERE id = ?", [tenant.bookingId]);
    assert.equal(booking.first_payment_due_date, null);
    assert.equal((await runGuard(tenant.customerId, "POST", "/api/customer/maintenance")).nextCalled, true);
  });
});

test("สัญญาเก่าที่ไม่มีกำหนดชำระงวดแรกไม่ถูกล็อกหรือยกเลิก", async () => {
  await withTenant({ startInDays: -30, gated: false }, async (tenant, pool) => {
    assert.equal(await loadFirstPaymentGate(pool, tenant.customerId), null);
    assert.equal((await runGuard(tenant.customerId, "POST", "/api/customer/maintenance")).nextCalled, true);
  });
});

test("ส่งสลิปแล้วรอตรวจ ไม่ถูกยกเลิกแม้เลยกำหนด", async () => {
  await withTenant({ startInDays: -9, dueInDays: -2 }, async (tenant, pool) => {
    await addPayment(pool, tenant, { amount: 3500, type: "rent", status: "pending", slip: "/uploads/test-slip.png" });
    await addPayment(pool, tenant, { amount: 7000, type: "deposit", status: "pending", slip: "/uploads/test-slip.png" });
    const gate = await loadFirstPaymentGate(pool, tenant.customerId);
    assert.equal(gate.status, "pending");
    assert.equal(gate.expired, false);
    await withRollback(async (connection) => {
      assert.equal(await voidUnpaidContract(connection, tenant.customerId), null);
    });
  });
});

test("ไม่จ่ายภายใน 7 วันหลังวันเริ่มสัญญา ระบบยกเลิกสัญญาและปล่อยห้อง", async () => {
  await withTenant({ startInDays: -8, dueInDays: -1 }, async (tenant) => {
    await withRollback(async (connection) => {
      await addPayment(connection, tenant, { amount: 3500, type: "rent" });
      const result = await voidUnpaidContract(connection, tenant.customerId);
      assert.equal(result.bookingId, tenant.bookingId);
      assert.equal(result.roomVacated, true);
      assert.equal(result.paid, 3500);

      const [[room]] = await connection.query("SELECT is_booked FROM Room WHERE id = ?", [tenant.roomId]);
      assert.equal(Boolean(room.is_booked), false);
      const [[customer]] = await connection.query("SELECT is_suspended, room_number FROM Customer WHERE id = ?", [tenant.customerId]);
      assert.equal(Boolean(customer.is_suspended), true);
      assert.equal(customer.room_number, null);

      const contract = await loadContractByBooking(connection, tenant.bookingId);
      assert.equal(contract.status, "voided");
      assert.equal(await voidUnpaidContract(connection, tenant.customerId), null);
    });
  });
});

test("เลยกำหนดแล้วเรียก API ระบบยกเลิกสัญญาทันทีและออกจากระบบ", async () => {
  await withTenant({ startInDays: -8, dueInDays: -1 }, async (tenant, pool) => {
    const { res, nextCalled } = await runGuard(tenant.customerId, "GET", "/api/customer/contract");
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, FIRST_PAYMENT_VOIDED_CODE);
    const [[booking]] = await pool.query("SELECT first_payment_voided_at, ended_at FROM Booking WHERE id = ?", [tenant.bookingId]);
    assert.ok(booking.first_payment_voided_at);
    assert.ok(booking.ended_at);
  });
});
