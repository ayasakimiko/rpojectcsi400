import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { configureDatabaseService, getPool } from "../Database/connection.js";
import { effectiveVerifyMode, paymentChannelsConfigured } from "../middleware/slipVerification.js";

configureDatabaseService("staff");

const API = process.env.PAYMENT_TEST_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const fx = {};

const headers = () => ({ Cookie: `auth_token=${fx.token}`, "X-Requested-With": "XMLHttpRequest" });

async function sendSlip() {
  const form = new FormData();
  form.append("payment_method", "promptpay");
  form.append("slip", new Blob([PNG], { type: "image/png" }), "slip.png");
  const response = await fetch(`${API}/api/customer/payments/confirm`, { method: "POST", headers: headers(), body: form });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  const db = getPool();
  const [[config]] = await db.query(
    "SELECT promptpay_id, bank_name, bank_account_no, payment_test_mode, slip_verify_mode FROM DormConfig WHERE id = 1",
  );
  fx.config = config;
  await db.query(
    "UPDATE DormConfig SET promptpay_id = NULL, bank_name = NULL, bank_account_no = NULL, payment_test_mode = FALSE, slip_verify_mode = 'auto' WHERE id = 1",
  );
  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  let roomNumber = 993;
  while (used.has(roomNumber)) roomNumber -= 1;
  const [room] = await db.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date, billing_start_date)
     VALUES (?, TRUE, 3000, 6, DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL 5 DAY), DATE_ADD(CURDATE(), INTERVAL 6 MONTH),
             DATE_SUB(CURDATE() + INTERVAL 10 HOUR, INTERVAL 5 DAY))`,
    [roomNumber],
  );
  fx.roomId = room.insertId;
  const stamp = String(Date.now());
  const [customer] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount)
     VALUES (?, 'x', ?, 'ทดสอบ', 'ชำระเงิน', 30, ?, 0)`,
    [`Q${stamp}`.slice(0, 13), `08${stamp.slice(-8)}`, roomNumber],
  );
  fx.customerId = customer.insertId;
  const [[saved]] = await db.query("SELECT rental_start_date, rental_end_date FROM Room WHERE id = ?", [fx.roomId]);
  const [booking] = await db.query(
    "INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at) VALUES (?, ?, ?, ?, ?)",
    [fx.customerId, fx.roomId, saved.rental_start_date, saved.rental_end_date, saved.rental_start_date],
  );
  fx.bookingId = booking.insertId;
  fx.token = jwt.sign({ id: fx.customerId, role: "Customer" }, SECRET, { expiresIn: "15m" });
});

after(async () => {
  const db = getPool();
  const { promptpay_id, bank_name, bank_account_no, payment_test_mode, slip_verify_mode } = fx.config;
  await db.query(
    "UPDATE DormConfig SET promptpay_id = ?, bank_name = ?, bank_account_no = ?, payment_test_mode = ?, slip_verify_mode = ? WHERE id = 1",
    [promptpay_id, bank_name, bank_account_no, payment_test_mode, slip_verify_mode],
  );
  await db.query("DELETE FROM PaymentSlipRejection WHERE customer_id = ?", [fx.customerId]);
  await db.query("DELETE FROM PaymentSlip WHERE customer_id = ?", [fx.customerId]);
  await db.query("DELETE FROM Payment WHERE booking_id = ?", [fx.bookingId]);
  await db.query("DELETE FROM Booking WHERE id = ?", [fx.bookingId]);
  await db.query("DELETE FROM Customer WHERE id = ?", [fx.customerId]);
  await db.query("DELETE FROM Room WHERE id = ?", [fx.roomId]);
  await db.end();
});

test("slips go to staff review when the dorm has no PromptPay or bank account", () => {
  assert.equal(paymentChannelsConfigured({}), false);
  assert.equal(paymentChannelsConfigured({ promptpay_id: "  " }), false);
  assert.equal(paymentChannelsConfigured({ bank_account_no: "123-4-56789-0" }), true);
  assert.equal(effectiveVerifyMode({ slip_verify_mode: "auto" }), "manual");
  assert.equal(effectiveVerifyMode({ slip_verify_mode: "auto", promptpay_id: "0812345678" }), "auto");
  assert.equal(effectiveVerifyMode({ slip_verify_mode: "manual", promptpay_id: "0812345678" }), "manual");
  assert.equal(effectiveVerifyMode({ slip_verify_mode: "auto", payment_test_mode: 1 }), "auto");
});

test("unconfigured payment channels report manual review to the tenant", async () => {
  const response = await fetch(`${API}/api/customer/payment-channels`, { headers: headers() });
  assert.equal(response.status, 200);
  const { channels } = await response.json();
  assert.equal(channels.promptpay_id, "");
  assert.equal(channels.bank_account_no, "");
  assert.equal(channels.verify_mode, "manual");
});

test("tenant can send a slip without configured channels and it waits for staff review", async () => {
  const { status, body } = await sendSlip();
  assert.equal(status, 201, JSON.stringify(body));
  const [payments] = await getPool().query("SELECT status, slip_path FROM Payment WHERE booking_id = ?", [fx.bookingId]);
  assert.ok(payments.some((payment) => payment.status === "pending" && payment.slip_path));

  const me = await (await fetch(`${API}/api/customer/me`, { headers: headers() })).json();
  assert.ok(me.rentalHistory[0].payments.some((payment) => payment.status === "pending" && payment.slip_path));
});

test("a second slip is refused while the first one is under review", async () => {
  const { status, body } = await sendSlip();
  assert.equal(status, 409);
  assert.equal(body.message, "มีสลิปที่รอตรวจสอบอยู่แล้ว");
});

test("staff slip history switches to manual review mode", async () => {
  const [[staff]] = await getPool().query("SELECT id FROM Staff WHERE is_suspended = FALSE ORDER BY id LIMIT 1");
  const staffToken = jwt.sign({ id: staff.id, role: "Staff" }, SECRET, { expiresIn: "15m" });
  const response = await fetch(`${API}/api/staff/payment-slips`, { headers: { Authorization: `Bearer ${staffToken}` } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, "manual");
});
