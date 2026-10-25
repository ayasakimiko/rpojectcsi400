import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const API = process.env.AUTH_COOKIE_API_URL || "http://localhost:4000";
const PASSWORD = "cookie-test-123";
const fx = {};

async function login(idcard, role) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: idcard, password: PASSWORD, role }),
  });
  return { response, body: await response.json() };
}

function authCookie(response, name) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  assert.ok(header, `response must set the ${name} cookie`);
  return header;
}

const cookiePair = (header) => header.split(";")[0];
const staffHeaders = (extra = {}) => ({ Cookie: fx.cookies, "X-Auth-Role": "Staff", ...extra });
const customerHeaders = (extra = {}) => ({ Cookie: fx.cookies, "X-Auth-Role": "Customer", ...extra });

before(async () => {
  const db = getPool();
  const stamp = String(Date.now());
  const hash = await bcrypt.hash(PASSWORD, 10);
  fx.staffIdcard = `7${stamp}`.slice(0, 13).padEnd(13, "0");
  const [staff] = await db.query(
    "INSERT INTO Staff (idcard, password, phone, first_name, last_name, age) VALUES (?, ?, ?, 'คุกกี้', 'ทดสอบ', 30)",
    [fx.staffIdcard, hash, `06${stamp.slice(-8)}`],
  );
  fx.staffId = staff.insertId;

  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  let roomNumber = 992;
  while (used.has(roomNumber)) roomNumber -= 1;
  const [room] = await db.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, TRUE, 3000)", [roomNumber]);
  fx.roomId = room.insertId;
  fx.customerIdcard = `6${stamp}`.slice(0, 13).padEnd(13, "0");
  const [customer] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount)
     VALUES (?, ?, ?, 'คุกกี้', 'ผู้เช่า', 30, ?, 0)`,
    [fx.customerIdcard, hash, `05${stamp.slice(-8)}`, roomNumber],
  );
  fx.customerId = customer.insertId;
});

after(async () => {
  const db = getPool();
  await db.query("DELETE FROM NotificationRead WHERE user_role = 'Staff' AND user_id = ?", [fx.staffId]);
  await db.query("DELETE FROM AuditLog WHERE (actor_role = 'Staff' AND actor_id = ?) OR (actor_role = 'Customer' AND actor_id = ?)", [fx.staffId, fx.customerId]);
  await db.query("DELETE FROM Staff WHERE id = ?", [fx.staffId]);
  await db.query("DELETE FROM Customer WHERE id = ?", [fx.customerId]);
  await db.query("DELETE FROM Room WHERE id = ?", [fx.roomId]);
  await db.end();
});

test("login puts the JWT in an HttpOnly cookie named after the role and not in the response body", async () => {
  const { response, body } = await login(fx.staffIdcard, "Staff");
  assert.equal(response.status, 200);
  assert.equal(body.token, undefined);
  assert.equal(body.user.role, "Staff");
  assert.deepEqual(Object.keys(body.user).sort(), ["first_name", "id", "last_name", "role"]);
  const header = authCookie(response, "auth_token_staff");
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Lax/i);
  assert.match(header, /Path=\//i);
  fx.staffCookie = cookiePair(header);
  fx.cookies = fx.staffCookie;
});

test("the cookie alone authenticates requests", async () => {
  const response = await fetch(`${API}/api/auth/account`, { headers: staffHeaders() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, fx.staffId);
  assert.equal(body.role, "Staff");
});

test("a tenant can log in in another tab without kicking out the staff tab", async () => {
  const { response } = await login(fx.customerIdcard, "Customer");
  assert.equal(response.status, 200);
  fx.cookies = `${fx.staffCookie}; ${cookiePair(authCookie(response, "auth_token_customer"))}`;

  const staffRooms = await fetch(`${API}/api/staff/rooms`, { headers: staffHeaders() });
  assert.equal(staffRooms.status, 200);
  const customerMe = await fetch(`${API}/api/customer/me`, { headers: customerHeaders() });
  assert.equal(customerMe.status, 200);
  assert.equal((await customerMe.json()).customer.id, fx.customerId);
  const staffAsCustomer = await fetch(`${API}/api/customer/me`, { headers: staffHeaders() });
  assert.equal(staffAsCustomer.status, 403);
});

test("requests without the cookie or a token are rejected", async () => {
  const response = await fetch(`${API}/api/staff/rooms`);
  assert.equal(response.status, 401);
  const wrongRole = await fetch(`${API}/api/staff/rooms`, { headers: { Cookie: fx.cookies, "X-Auth-Role": "Owner" } });
  assert.equal(wrongRole.status, 401);
});

test("a cookie whose JWT belongs to another role is refused", async () => {
  const forged = fx.staffCookie.replace("auth_token_staff=", "auth_token_owner=");
  const response = await fetch(`${API}/api/owner/overview`, { headers: { Cookie: forged, "X-Auth-Role": "Owner" } });
  assert.equal(response.status, 401);
});

test("cookie-authenticated writes need the X-Requested-With header", async () => {
  const send = (headers) => fetch(`${API}/api/staff/notifications/read`, {
    method: "POST",
    headers: staffHeaders({ "Content-Type": "application/json", ...headers }),
    body: JSON.stringify({ all: true }),
  });
  assert.equal((await send({})).status, 403);
  assert.equal((await send({ "X-Requested-With": "XMLHttpRequest" })).status, 200);
});

test("market service forwards the cookie session to the auth service", async () => {
  const response = await fetch(`${API}/api/market/overview`, { headers: staffHeaders() });
  assert.equal(response.status, 200);
});

test("logout clears only the cookie of the role that logged out", async () => {
  const response = await fetch(`${API}/api/auth/logout`, { method: "POST", headers: customerHeaders() });
  assert.equal(response.status, 200);
  const cleared = response.headers.getSetCookie();
  assert.ok(cleared.some((value) => /^auth_token_customer=;/.test(value) && /Expires=Thu, 01 Jan 1970/i.test(value)));
  assert.ok(!cleared.some((value) => value.startsWith("auth_token_staff=")));
});
