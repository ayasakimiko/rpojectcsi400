import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const API = process.env.AUTH_COOKIE_API_URL || "http://localhost:4000";
const PASSWORD = "cookie-test-123";
const fx = {};

async function login() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: fx.idcard, password: PASSWORD, role: "Staff" }),
  });
  return { response, body: await response.json() };
}

function authCookie(response) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith("auth_token="));
  assert.ok(header, "login must set the auth_token cookie");
  return header;
}

const cookiePair = (header) => header.split(";")[0];

before(async () => {
  const stamp = String(Date.now());
  fx.idcard = `7${stamp}`.slice(0, 13).padEnd(13, "0");
  const [result] = await getPool().query(
    "INSERT INTO Staff (idcard, password, phone, first_name, last_name, age) VALUES (?, ?, ?, 'คุกกี้', 'ทดสอบ', 30)",
    [fx.idcard, await bcrypt.hash(PASSWORD, 10), `06${stamp.slice(-8)}`],
  );
  fx.staffId = result.insertId;
});

after(async () => {
  const db = getPool();
  await db.query("DELETE FROM NotificationRead WHERE user_role = 'Staff' AND user_id = ?", [fx.staffId]);
  await db.query("DELETE FROM AuditLog WHERE actor_role = 'Staff' AND actor_id = ?", [fx.staffId]);
  await db.query("DELETE FROM Staff WHERE id = ?", [fx.staffId]);
  await db.end();
});

test("login puts the JWT in an HttpOnly cookie and not in the response body", async () => {
  const { response, body } = await login();
  assert.equal(response.status, 200);
  assert.equal(body.token, undefined);
  assert.equal(body.user.role, "Staff");
  assert.deepEqual(Object.keys(body.user).sort(), ["first_name", "id", "last_name", "role"]);
  const header = authCookie(response);
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Lax/i);
  assert.match(header, /Path=\//i);
  fx.cookie = cookiePair(header);
});

test("the cookie alone authenticates requests", async () => {
  const response = await fetch(`${API}/api/auth/account`, { headers: { Cookie: fx.cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, fx.staffId);
  assert.equal(body.role, "Staff");
});

test("requests without the cookie or a token are rejected", async () => {
  const response = await fetch(`${API}/api/staff/rooms`);
  assert.equal(response.status, 401);
});

test("cookie-authenticated writes need the X-Requested-With header", async () => {
  const send = (headers) => fetch(`${API}/api/staff/notifications/read`, {
    method: "POST",
    headers: { Cookie: fx.cookie, "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ all: true }),
  });
  assert.equal((await send({})).status, 403);
  assert.equal((await send({ "X-Requested-With": "XMLHttpRequest" })).status, 200);
});

test("market service forwards the cookie session to the auth service", async () => {
  const response = await fetch(`${API}/api/market/overview`, { headers: { Cookie: fx.cookie } });
  assert.equal(response.status, 200);
});

test("logout clears the cookie", async () => {
  const response = await fetch(`${API}/api/auth/logout`, { method: "POST", headers: { Cookie: fx.cookie } });
  assert.equal(response.status, 200);
  const header = authCookie(response);
  assert.match(header, /^auth_token=;/);
  assert.match(header, /Expires=Thu, 01 Jan 1970/i);
});
