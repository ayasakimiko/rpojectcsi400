import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const {
  CONTRACT_AUTO_SUSPEND_ACTOR,
  CONTRACT_EXPIRED_CODE,
  CONTRACT_GRACE_DAYS,
  CONTRACT_SUSPENDED_CODE,
  ContractRenewError,
  contractExpiryView,
  findOverdueCustomerIds,
  loadCustomerAccess,
  renewContractByStaff,
  suspendExpiredCustomer,
} = await import("../router/contractExpiry.js");
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

async function setupTenant(db, { daysExpired }) {
  const roomNumber = await freeRoomNumber(db);
  const [roomResult] = await db.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date)
     VALUES (?, TRUE, 3500, 6,
             DATE_SUB(DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY), INTERVAL 6 MONTH),
             DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY))`,
    [roomNumber, daysExpired, daysExpired],
  );
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const [customerResult] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number)
     VALUES (?, 'x', ?, 'ทดสอบ', 'สัญญาหมด', 30, ?)`,
    [`E${tag}`, `08${tag.slice(0, 8)}`, roomNumber],
  );
  const customerId = customerResult.insertId;
  const [[room]] = await db.query("SELECT * FROM Room WHERE id = ?", [roomResult.insertId]);
  const [bookingResult] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, contract_duration_months)
     VALUES (?, ?, ?, ?, ?, 6)`,
    [customerId, room.id, room.rental_start_date, room.rental_end_date, room.rental_start_date],
  );
  return { customerId, roomNumber, roomId: room.id, bookingId: bookingResult.insertId };
}

async function removeTenant(db, tenant) {
  await db.query("DELETE FROM TenantRequest WHERE customer_id = ?", [tenant.customerId]);
  await db.query("DELETE FROM MaintenanceRequest WHERE customer_id = ?", [tenant.customerId]);
  await db.query("DELETE FROM Payment WHERE booking_id = ?", [tenant.bookingId]);
  await db.query("DELETE FROM Booking WHERE customer_id = ?", [tenant.customerId]);
  await db.query("DELETE FROM Customer WHERE id = ?", [tenant.customerId]);
  await db.query("DELETE FROM Room WHERE id = ?", [tenant.roomId]);
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

async function withCommittedTenant(options, run) {
  const pool = getPool();
  const tenant = await setupTenant(pool, options);
  try {
    await run(tenant);
  } finally {
    await removeTenant(pool, tenant);
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

async function runGuard(customerId, method) {
  const req = { user: { id: customerId, role: "Customer" }, method };
  const res = fakeResponse();
  let nextCalled = false;
  await requireActiveCustomer(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

test("contractExpiryView นับวันผ่อนผัน 15 วันหลังสัญญาหมด", () => {
  assert.equal(CONTRACT_GRACE_DAYS, 15);
  assert.deepEqual(contractExpiryView(null).expired, false);
  assert.equal(contractExpiryView({ rental_end_date: "2026-11-01", days_expired: 0 }).expired, false);
  assert.equal(contractExpiryView({ rental_end_date: "2026-11-01", days_expired: -3 }).expired, false);

  const firstDay = contractExpiryView({ rental_end_date: "2026-10-31", days_expired: 1, suspend_on: "2026-11-16" });
  assert.equal(firstDay.expired, true);
  assert.equal(firstDay.overdue, false);
  assert.equal(firstDay.graceDaysLeft, 14);
  assert.equal(firstDay.suspendOn, "2026-11-16");

  const lastDay = contractExpiryView({ rental_end_date: "2026-10-17", days_expired: 15 });
  assert.equal(lastDay.overdue, false);
  assert.equal(lastDay.graceDaysLeft, 0);

  const overdue = contractExpiryView({ rental_end_date: "2026-10-16", days_expired: 16 });
  assert.equal(overdue.overdue, true);
  assert.equal(overdue.graceDaysLeft, 0);
});

test("สัญญายังไม่หมด ไม่ถือว่าหมดอายุ", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { daysExpired: -10 });
    const access = await loadCustomerAccess(connection, tenant.customerId);
    assert.equal(access.contract.expired, false);
    assert.equal(access.contract.overdue, false);
  }));

test("สัญญาหมดแต่ยังอยู่ในช่วง 15 วัน ยังไม่ถูกระงับ", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { daysExpired: 10 });
    const access = await loadCustomerAccess(connection, tenant.customerId);
    assert.equal(access.contract.expired, true);
    assert.equal(access.contract.overdue, false);
    assert.equal(access.contract.daysExpired, 10);
    assert.equal(access.contract.graceDaysLeft, 5);

    assert.equal(await suspendExpiredCustomer(connection, tenant.customerId), null);
    assert.ok(!(await findOverdueCustomerIds(connection)).includes(tenant.customerId));
    const [[customer]] = await connection.query("SELECT is_suspended, room_number FROM Customer WHERE id = ?", [tenant.customerId]);
    assert.equal(Boolean(customer.is_suspended), false);
    assert.equal(Number(customer.room_number), tenant.roomNumber);
  }));

test("วันที่ 15 หลังสัญญาหมดยังไม่ระงับ", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { daysExpired: CONTRACT_GRACE_DAYS });
    assert.equal(await suspendExpiredCustomer(connection, tenant.customerId), null);
  }));

test("ไม่ต่อสัญญาเกิน 15 วัน ระบบระงับบัญชีและนำออกจากห้องอัตโนมัติ", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { daysExpired: CONTRACT_GRACE_DAYS + 1 });
    await connection.query(
      `INSERT INTO TenantRequest (customer_id, room_number, type, renew_duration_months, renew_payment_type, status)
       VALUES (?, ?, 'renew', 6, 'monthly', 'pending')`,
      [tenant.customerId, tenant.roomNumber],
    );
    await connection.query(
      `INSERT INTO MaintenanceRequest (customer_id, room_number, description, status) VALUES (?, ?, 'ทดสอบ', 'pending')`,
      [tenant.customerId, tenant.roomNumber],
    );
    assert.ok((await findOverdueCustomerIds(connection)).includes(tenant.customerId));

    const result = await suspendExpiredCustomer(connection, tenant.customerId);
    assert.equal(result.customerId, tenant.customerId);
    assert.equal(result.roomNumber, tenant.roomNumber);
    assert.equal(result.roomVacated, true);

    const [[customer]] = await connection.query(
      "SELECT is_suspended, suspended_at, room_number FROM Customer WHERE id = ?",
      [tenant.customerId],
    );
    assert.equal(Boolean(customer.is_suspended), true);
    assert.ok(customer.suspended_at);
    assert.equal(customer.room_number, null);

    const [[room]] = await connection.query("SELECT is_booked, rental_end_date FROM Room WHERE id = ?", [tenant.roomId]);
    assert.equal(Boolean(room.is_booked), false);
    assert.equal(room.rental_end_date, null);

    const [[booking]] = await connection.query("SELECT ended_at, rental_end_date FROM Booking WHERE id = ?", [tenant.bookingId]);
    assert.ok(booking.ended_at);
    assert.ok(booking.rental_end_date);

    const [[request]] = await connection.query("SELECT status, completed_by_name FROM TenantRequest WHERE customer_id = ?", [tenant.customerId]);
    assert.equal(request.status, "cancelled");
    assert.equal(request.completed_by_name, CONTRACT_AUTO_SUSPEND_ACTOR);
    const [[maintenance]] = await connection.query("SELECT status FROM MaintenanceRequest WHERE customer_id = ?", [tenant.customerId]);
    assert.equal(maintenance.status, "cancelled");

    assert.equal(await suspendExpiredCustomer(connection, tenant.customerId), null);
    assert.ok(!(await findOverdueCustomerIds(connection)).includes(tenant.customerId));
  }));

test("staff ต่อสัญญาให้แล้ว ผู้เช่ากลับมาใช้งานได้", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { daysExpired: 5 });
    const [[before]] = await connection.query("SELECT rental_end_date FROM Room WHERE id = ?", [tenant.roomId]);

    const renewed = await renewContractByStaff(connection, tenant.roomNumber, 3, "เจ้าหน้าที่ทดสอบ");
    assert.equal(renewed.customerId, tenant.customerId);

    const [[after]] = await connection.query(
      "SELECT rental_end_date, DATE_ADD(?, INTERVAL 3 MONTH) AS expected FROM Room WHERE id = ?",
      [before.rental_end_date, tenant.roomId],
    );
    assert.equal(new Date(after.rental_end_date).getTime(), new Date(after.expected).getTime());

    const [[request]] = await connection.query("SELECT * FROM TenantRequest WHERE id = ?", [renewed.requestId]);
    assert.equal(request.type, "renew");
    assert.equal(request.status, "approved");
    assert.equal(Number(request.renew_duration_months), 3);
    assert.equal(request.completed_by_name, "เจ้าหน้าที่ทดสอบ");

    const access = await loadCustomerAccess(connection, tenant.customerId);
    assert.equal(access.contract.expired, false);
  }));

test("staff ต่อสัญญาไม่ได้เมื่อระยะเวลาไม่ถูกต้องหรือยังมียอดค้าง", () =>
  withRollback(async (connection) => {
    const tenant = await setupTenant(connection, { daysExpired: 3 });
    await assert.rejects(renewContractByStaff(connection, tenant.roomNumber, 5, "เจ้าหน้าที่ทดสอบ"), (error) => {
      assert.ok(error instanceof ContractRenewError);
      assert.equal(error.status, 400);
      return true;
    });

    await connection.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type) VALUES (?, 250, CURDATE(), 'pending', 'electricity')`,
      [tenant.bookingId],
    );
    await assert.rejects(renewContractByStaff(connection, tenant.roomNumber, 3, "เจ้าหน้าที่ทดสอบ"), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.extra.code, "RENEW_OUTSTANDING");
      return true;
    });
    const [[room]] = await connection.query(
      "SELECT DATEDIFF(CURDATE(), DATE(rental_end_date)) AS days_expired FROM Room WHERE id = ?",
      [tenant.roomId],
    );
    assert.equal(Number(room.days_expired), 3);
  }));

test("staff ต่อสัญญาห้องที่ไม่มีผู้เช่าไม่ได้", () =>
  withRollback(async (connection) => {
    const roomNumber = await freeRoomNumber(connection);
    await connection.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, 3000)", [roomNumber]);
    await assert.rejects(renewContractByStaff(connection, roomNumber, 1, "เจ้าหน้าที่ทดสอบ"), { status: 404 });
  }));

test("หน้า customer: สัญญาหมดดูข้อมูลได้แต่ทำรายการไม่ได้", () =>
  withCommittedTenant({ daysExpired: 2 }, async (tenant) => {
    const read = await runGuard(tenant.customerId, "GET");
    assert.equal(read.nextCalled, true);
    assert.equal(read.req.contractExpiry.expired, true);
    assert.equal(read.req.contractExpiry.graceDaysLeft, CONTRACT_GRACE_DAYS - 2);

    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const write = await runGuard(tenant.customerId, method);
      assert.equal(write.nextCalled, false, method);
      assert.equal(write.res.statusCode, 403, method);
      assert.equal(write.res.body.code, CONTRACT_EXPIRED_CODE, method);
    }
  }));

test("หน้า customer: สัญญายังไม่หมดใช้งานได้ปกติ", () =>
  withCommittedTenant({ daysExpired: -30 }, async (tenant) => {
    const write = await runGuard(tenant.customerId, "POST");
    assert.equal(write.nextCalled, true);
    assert.equal(write.req.contractExpiry.expired, false);
  }));

test("หน้า customer: เกิน 15 วันถูกระงับทันทีเมื่อเรียก API", () =>
  withCommittedTenant({ daysExpired: CONTRACT_GRACE_DAYS + 3 }, async (tenant) => {
    const first = await runGuard(tenant.customerId, "GET");
    assert.equal(first.nextCalled, false);
    assert.equal(first.res.statusCode, 401);
    assert.equal(first.res.body.code, CONTRACT_SUSPENDED_CODE);

    const [[customer]] = await getPool().query("SELECT is_suspended, room_number FROM Customer WHERE id = ?", [tenant.customerId]);
    assert.equal(Boolean(customer.is_suspended), true);
    assert.equal(customer.room_number, null);

    const second = await runGuard(tenant.customerId, "GET");
    assert.equal(second.res.statusCode, 401);
  }));
