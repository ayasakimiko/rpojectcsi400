import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { configureDatabaseService, getPool } from "../Database/connection.js";
import { PAYMENT_CHANNELS_MISSING_MESSAGE, paymentChannelsConfigured } from "../middleware/slipVerification.js";

configureDatabaseService("staff");

const API = process.env.PAYMENT_TEST_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const fx = {};

const headers = () => ({ Cookie: `auth_token_customer=${fx.token}`, "X-Auth-Role": "Customer", "X-Requested-With": "XMLHttpRequest" });

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

const setConfig = (fields) => getPool().query("UPDATE DormConfig SET ? WHERE id = 1", [fields]);
const paymentRows = async () => (await getPool().query("SELECT status, slip_path FROM Payment WHERE booking_id = ?", [fx.bookingId]))[0];

test("payment channels count as configured with a PromptPay id, a bank account, or test mode", () => {
  assert.equal(paymentChannelsConfigured({}), false);
  assert.equal(paymentChannelsConfigured({ promptpay_id: "  ", bank_name: "กสิกร" }), false);
  assert.equal(paymentChannelsConfigured({ payment_test_mode: 0 }), false);
  assert.equal(paymentChannelsConfigured({ promptpay_id: "0812345678" }), true);
  assert.equal(paymentChannelsConfigured({ bank_account_no: "123-4-56789-0" }), true);
  assert.equal(paymentChannelsConfigured({ payment_test_mode: 1 }), true);
});

test("the tenant is told the dorm has no transfer channel yet", async () => {
  const response = await fetch(`${API}/api/customer/payment-channels`, { headers: headers() });
  assert.equal(response.status, 200);
  const { channels } = await response.json();
  assert.equal(channels.configured, false);
});

test("a slip is refused when no transfer channel is configured", async () => {
  const { status, body } = await sendSlip();
  assert.equal(status, 400);
  assert.equal(body.message, PAYMENT_CHANNELS_MISSING_MESSAGE);
  assert.equal((await paymentRows()).length, 0);
});

test("test mode uses the demo channels without a real transfer channel", async () => {
  await setConfig({ payment_test_mode: true });
  const channels = (await (await fetch(`${API}/api/customer/payment-channels`, { headers: headers() })).json()).channels;
  assert.equal(channels.test_mode, true);
  assert.equal(channels.configured, true);
  assert.equal(channels.promptpay_id, "0000000000");
  const { status, body } = await sendSlip();
  assert.ok(status < 300, body.message);
  assert.notEqual(body.message, PAYMENT_CHANNELS_MISSING_MESSAGE);
  await getPool().query("DELETE FROM PaymentSlipRejection WHERE customer_id = ?", [fx.customerId]);
  await getPool().query("DELETE FROM PaymentSlip WHERE customer_id = ?", [fx.customerId]);
  await getPool().query("DELETE FROM Payment WHERE booking_id = ?", [fx.bookingId]);
});

test("manual review mode also refuses slips without a transfer channel", async () => {
  await setConfig({ payment_test_mode: false, slip_verify_mode: "manual" });
  const { status } = await sendSlip();
  assert.equal(status, 400);
  assert.equal((await paymentRows()).length, 0);
});

test("once a PromptPay id is set the slip goes through and further slips wait for review", async () => {
  await setConfig({ promptpay_id: "0812345678", payment_test_mode: false, slip_verify_mode: "manual" });
  const channels = (await (await fetch(`${API}/api/customer/payment-channels`, { headers: headers() })).json()).channels;
  assert.equal(channels.configured, true);
  const first = await sendSlip();
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.ok((await paymentRows()).some((payment) => payment.status === "pending" && payment.slip_path));
  const second = await sendSlip();
  assert.equal(second.status, 409);
  assert.equal(second.body.message, "มีสลิปที่รอตรวจสอบอยู่แล้ว");
});

test("parking fine and market channels report the same configured flag", async () => {
  await setConfig({ promptpay_id: null, bank_account_no: null });
  const [[staff]] = await getPool().query("SELECT id FROM Staff WHERE is_suspended = FALSE ORDER BY id LIMIT 1");
  const staffToken = jwt.sign({ id: staff.id, role: "Staff" }, SECRET, { expiresIn: "15m" });
  const response = await fetch(`${API}/api/payment/channels`, { headers: { Authorization: `Bearer ${staffToken}` } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).channels.configured, false);
  const parking = await fetch(`${API}/api/customer/resident-visit-requests`, { headers: headers() });
  assert.equal(parking.status, 200);
  const settings = (await parking.json()).settings;
  assert.equal(settings.paymentChannels.configured, false);
});
