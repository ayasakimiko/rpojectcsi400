import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { DB_CONFIG, serviceCredentials, serviceDatabaseName } from "../Database/connection.js";
import { MARKET_CONTRACT_DIR } from "../router/marketShared.js";

const API = process.env.MARKET_TEST_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TAG = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const MARKET_DB = serviceDatabaseName(DB_CONFIG.database, "market");
const AUTH_DB = serviceDatabaseName(DB_CONFIG.database, "auth");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const ORIGIN_A = `https://shop-${TAG.toLowerCase()}.example.com`;
const ORIGIN_B = `https://other-${TAG.toLowerCase()}.example.com`;
const fx = { stalls: {}, keys: {}, clients: {}, origins: {} };
let root;

async function call(method, url, { token, key, origin, body, headers = {} } = {}) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "X-Market-Api-Key": key } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, data: await response.json().catch(() => ({})) };
}

const admin = (method, url, body) => call(method, `/api/admin/market${url}`, { token: fx.adminToken, body });
const api = (method, url, key, options = {}) => call(method, `/api/market/v1${url}`, { key, ...options });

async function ok(promise, status = 200) {
  const result = await promise;
  assert.equal(result.status, status, JSON.stringify(result.data));
  return result.data;
}

async function tokenFor(role) {
  const [[row]] = await root.query(`SELECT id FROM \`${AUTH_DB}\`.\`${role}\` WHERE is_suspended = FALSE LIMIT 1`);
  return row ? jwt.sign({ id: row.id, role }, SECRET, { expiresIn: "15m" }) : null;
}

async function createStall(code, extra) {
  const data = await ok(admin("POST", "/stalls", {
    code, zone: "ทดสอบ", map_row: 40, width_m: 4, depth_m: 8, power_amp: 15,
    electricity_mode: "meter", water_mode: "meter", ...extra,
  }), 201);
  return data.stall;
}

async function createKey(name, body) {
  const data = await ok(admin("POST", "/api-clients", {
    name, project_name: `เทสต์ ${TAG}`, contact_email: "test@example.com", ...body,
  }), 201);
  fx.clients[name] = data.client_id;
  return data.api_key;
}

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

before(async () => {
  const { database: _database, ...server } = DB_CONFIG;
  root = await mysql.createConnection(server);
  fx.adminToken = await tokenFor("Admin");
  assert.ok(fx.adminToken, "ต้องมีบัญชี Admin อย่างน้อย 1 บัญชี");
  fx.staffToken = await tokenFor("Staff");
  fx.customerToken = await tokenFor("Customer");

  const { categories } = await ok(admin("GET", "/categories"));
  fx.food = categories.find((category) => category.requires_water).id;
  fx.grocery = categories.find((category) => !category.requires_water).id;

  fx.stalls.a = await createStall(`TA${TAG}`, { map_col: 1, has_water: true, rent_price: 10000, category_ids: [fx.food, fx.grocery] });
  fx.stalls.b = await createStall(`TB${TAG}`, { map_col: 2, rent_price: 8000, category_ids: [fx.grocery] });
  fx.stalls.c = await createStall(`TC${TAG}`, { map_col: 3, rent_price: 0, category_ids: [fx.grocery] });
  fx.stalls.s = await createStall(`TS${TAG}`, { map_col: 1, is_sandbox: true, category_ids: [fx.grocery] });
  await ok(admin("PATCH", `/stalls/${fx.stalls.a.id}/status`, { status: "available" }));
  await ok(admin("PATCH", `/stalls/${fx.stalls.b.id}/status`, { status: "available" }));

  const taxId = `9${Date.now()}`.slice(0, 13).padEnd(13, "0");
  const { vendors } = await ok(admin("POST", "/vendors", {
    vendor_name: `ร้านทดสอบ ${TAG}`, contact_name: "ผู้ทดสอบ", phone: "0812345678", id_card_or_tax_id: taxId,
  }), 201);
  fx.vendor = vendors.find((vendor) => vendor.vendor_name === `ร้านทดสอบ ${TAG}`).id;

  const config = await ok(admin("GET", "/config"));
  fx.config = config;
  const today = new Date().toISOString().slice(0, 10);
  fx.today = today;
  const { bookings } = await ok(admin("POST", "/bookings", {
    stall_id: fx.stalls.a.id, vendor_id: fx.vendor, category_id: fx.food, start_date: today, lease_months: config.min_lease_months,
  }), 201);
  fx.booking = bookings.find((booking) => booking.stall_id === fx.stalls.a.id && booking.status === "pending").id;
  const approved = await ok(admin("POST", `/bookings/${fx.booking}/approve`));
  fx.contract = approved.bookings.find((booking) => booking.id === fx.booking).contract_id;
  const form = new FormData();
  for (let index = 0; index < config.contract_min_images; index += 1) {
    form.append("contract_images", new Blob([PNG], { type: "image/png" }), `signed-${index}.png`);
  }
  await ok(call("POST", `/api/admin/market/leases/${fx.contract}/images`, { token: fx.adminToken, body: form }), 201);
  await ok(admin("POST", `/leases/${fx.contract}/activate`));

  const productA = await ok(admin("POST", `/stalls/${fx.stalls.a.id}/products`, {
    category_id: fx.grocery, name: "น้ำดื่ม", unit: "ขวด", price: 45, quantity: 10, quantity_limit: 40,
  }), 201);
  fx.productA = productA.products[0].id;
  const productB = await ok(admin("POST", `/stalls/${fx.stalls.b.id}/products`, {
    category_id: fx.grocery, name: "ขนม", unit: "ห่อ", price: 20, quantity: 5, quantity_limit: 10,
  }), 201);
  fx.productB = productB.products[0].id;
  const productS = await ok(admin("POST", `/stalls/${fx.stalls.s.id}/products`, {
    category_id: fx.grocery, name: "สินค้าทดลอง", unit: "ชิ้น", price: 1, quantity: 1, quantity_limit: 5,
  }), 201);
  fx.productS = productS.products[0].id;

  for (const [name, origin] of [["a", ORIGIN_A], ["b", ORIGIN_B]]) {
    const { origins } = await ok(admin("POST", "/allowed-origins", { origin }), 201);
    fx.origins[name] = origins.find((item) => item.origin === origin).id;
  }
  const allScopes = ["stalls:read", "stalls:write", "products:read", "products:write"];
  fx.keys.live = await createKey(`live-${TAG}`, { mode: "live", scopes: allScopes, stall_ids: [fx.stalls.a.id], origin_ids: [fx.origins.a] });
  fx.keys.read = await createKey(`read-${TAG}`, { mode: "live", scopes: ["stalls:read", "products:read"], stall_ids: [fx.stalls.a.id] });
  fx.keys.b = await createKey(`b-${TAG}`, { mode: "live", scopes: allScopes, stall_ids: [fx.stalls.b.id], origin_ids: [fx.origins.b] });
  fx.keys.test = await createKey(`test-${TAG}`, { mode: "test", scopes: allScopes, stall_ids: [fx.stalls.s.id] });
  fx.keys.slow = await createKey(`slow-${TAG}`, { mode: "live", scopes: ["stalls:read"], stall_ids: [fx.stalls.a.id], rate_limit_per_min: 2 });
});

after(async () => {
  if (!root) return;
  try {
    const ids = Object.values(fx.stalls).map((stall) => stall.id);
    const clientIds = Object.values(fx.clients);
    const db = `\`${MARKET_DB}\``;
    if (clientIds.length) await root.query(`DELETE FROM ${db}.MarketApiLog WHERE client_id IN (?)`, [clientIds]);
    if (clientIds.length) await root.query(`DELETE FROM ${db}.MarketApiClient WHERE id IN (?)`, [clientIds]);
    await root.query(`DELETE FROM ${db}.MarketAllowedOrigin WHERE origin IN (?, ?)`, [ORIGIN_A, ORIGIN_B]);
    if (ids.length) {
      const [contracts] = await root.query(`SELECT id FROM ${db}.MarketLeaseContract WHERE stall_id IN (?)`, [ids]);
      for (const contract of contracts) {
        await fs.rm(path.join(MARKET_CONTRACT_DIR, `contract-${contract.id}`), { recursive: true, force: true });
      }
      await root.query(`DELETE FROM ${db}.MarketLeaseContract WHERE stall_id IN (?)`, [ids]);
      await root.query(`DELETE FROM ${db}.MarketBooking WHERE stall_id IN (?)`, [ids]);
      await root.query(`DELETE FROM ${db}.MarketStall WHERE id IN (?)`, [ids]);
    }
    if (fx.vendor) await root.query(`DELETE FROM ${db}.MarketVendor WHERE id = ?`, [fx.vendor]);
    await root.query(`DELETE FROM ${db}.MarketAuditLog WHERE target LIKE ? OR target LIKE ?`, [`%${TAG}%`, `%${TAG.toLowerCase()}%`]);
  } finally {
    await root.end();
  }
});

test("T01 key ถูกต้อง อ่านล็อกและสินค้าได้ เห็นแค่ฟิลด์ที่กำหนด", async () => {
  const stalls = await ok(api("GET", "/stalls", fx.keys.live));
  assert.deepEqual(stalls.stalls.map((stall) => stall.id), [fx.stalls.a.id]);
  assert.deepEqual(Object.keys(stalls.stalls[0]).sort(), ["code", "id", "shop_name", "zone"]);
  const products = await ok(api("GET", `/stalls/${fx.stalls.a.id}/products`, fx.keys.live));
  assert.deepEqual(Object.keys(products.products[0]).sort(), ["id", "name", "price", "quantity", "quantity_limit", "stall_id", "unit", "updated_at", "version"]);
  const single = await api("GET", `/products/${fx.productA}`, fx.keys.live);
  assert.equal(single.status, 200);
  assert.ok(single.headers.get("x-request-id"));
  assert.ok(single.headers.get("etag"));
});

test("T02 key เรียก path อื่นของเว็บ → 403", async () => {
  for (const url of ["/api/admin/market/stalls", "/api/admin/rooms", "/api/staff/rooms", "/api/customer/profile", "/api/owner/staff", "/api/files/x"]) {
    const result = await call("GET", url, { key: fx.keys.live });
    assert.equal(result.status, 403, url);
  }
});

test("T03 PATCH ฟิลด์ที่แก้ไม่ได้ → 400 และค่าไม่เปลี่ยน", async () => {
  for (const body of [{ quantity_limit: 99 }, { unit: "ลัง" }, { stall_id: fx.stalls.b.id, name: "x" }]) {
    const result = await api("PATCH", `/products/${fx.productA}`, fx.keys.live, { body });
    assert.equal(result.status, 400);
    assert.equal(result.data.code, "FIELD_NOT_ALLOWED");
  }
  const [[row]] = await root.query(`SELECT quantity_limit, unit, stall_id FROM \`${MARKET_DB}\`.MarketProduct WHERE id = ?`, [fx.productA]);
  assert.deepEqual([Number(row.quantity_limit), row.unit, row.stall_id], [40, "ขวด", fx.stalls.a.id]);
});

test("T03A แก้ราคาได้และ log เก็บราคาเดิม → ใหม่; ราคาผิดรูปแบบ → 400", async () => {
  const saved = await ok(api("PATCH", `/products/${fx.productA}`, fx.keys.live, { body: { price: 50 } }));
  assert.equal(saved.price, 50);
  const [[log]] = await root.query(
    `SELECT changes FROM \`${MARKET_DB}\`.MarketApiLog WHERE client_id = ? AND method = 'PATCH' AND status_code = 200 ORDER BY id DESC LIMIT 1`,
    [fx.clients[`live-${TAG}`]],
  );
  assert.deepEqual(JSON.parse(log.changes).price, [45, 50]);
  for (const price of [-1, "50", 45.555, null]) {
    const result = await api("PATCH", `/products/${fx.productA}`, fx.keys.live, { body: { price } });
    assert.equal(result.status, 400, String(price));
    assert.equal(result.data.code, "VALIDATION_ERROR");
  }
});

test("T04 จำนวนเกิน limit หรือติดลบ → 400", async () => {
  for (const quantity of [41, -1, 1.5]) {
    const result = await api("PATCH", `/products/${fx.productA}`, fx.keys.live, { body: { quantity } });
    assert.equal(result.status, 400);
    assert.equal(result.data.code, "QUANTITY_OUT_OF_RANGE");
  }
});

test("T05 key ของล็อก A แก้ล็อก B → 404", async () => {
  assert.equal((await api("PATCH", `/products/${fx.productB}`, fx.keys.live, { body: { quantity: 1 } })).status, 404);
  assert.equal((await api("GET", `/stalls/${fx.stalls.b.id}/products`, fx.keys.live)).status, 404);
  assert.equal((await api("PATCH", `/stalls/${fx.stalls.a.id}`, fx.keys.b, { body: { shop_name: "x" } })).status, 404);
});

test("T06 key ผิด ไม่มี key ถูกระงับ หรือหมดอายุ → 401", async () => {
  assert.equal((await api("GET", "/stalls", undefined)).status, 401);
  assert.equal((await api("GET", "/stalls", `mk_live_${"A".repeat(40)}`)).status, 401);
  const key = await createKey(`suspend-${TAG}`, { mode: "live", scopes: ["stalls:read"], stall_ids: [fx.stalls.a.id] });
  assert.equal((await api("GET", "/stalls", key)).status, 200);
  await ok(admin("PATCH", `/api-clients/${fx.clients[`suspend-${TAG}`]}`, { is_active: false }));
  assert.equal((await api("GET", "/stalls", key)).status, 401);
  await root.query(`UPDATE \`${MARKET_DB}\`.MarketApiClient SET is_active = TRUE, expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?`, [fx.clients[`suspend-${TAG}`]]);
  assert.equal((await api("GET", "/stalls", key)).status, 401);
});

test("T07 JWT ของ Admin เรียก /api/market/v1 → 401", async () => {
  assert.equal((await call("GET", "/api/market/v1/stalls", { token: fx.adminToken })).status, 401);
  assert.equal((await call("GET", "/api/market/v1/stalls", { token: fx.adminToken, key: fx.keys.live })).status, 401);
});

test("T08 Staff และ Customer เรียก /api/admin/market/* → 403", async (t) => {
  if (!fx.staffToken && !fx.customerToken) return t.skip("ไม่มีบัญชี Staff/Customer");
  for (const token of [fx.staffToken, fx.customerToken].filter(Boolean)) {
    assert.equal((await call("GET", "/api/admin/market/stalls", { token })).status, 403);
  }
});

test("T09 จองช่วงวันซ้อนกันในล็อกเดียว → 409", async () => {
  const result = await admin("POST", "/bookings", {
    stall_id: fx.stalls.a.id, vendor_id: fx.vendor, category_id: fx.grocery, start_date: fx.today, lease_months: fx.config.min_lease_months,
  });
  assert.equal(result.status, 409);
});

test("T10 เรียกเกิน rate limit → 429 พร้อม Retry-After", async () => {
  await ok(api("GET", "/stalls", fx.keys.slow));
  await ok(api("GET", "/stalls", fx.keys.slow));
  const limited = await api("GET", "/stalls", fx.keys.slow);
  assert.equal(limited.status, 429);
  assert.equal(limited.data.code, "RATE_LIMITED");
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  assert.equal(limited.headers.get("x-ratelimit-remaining"), "0");
});

test("T12 T18 preflight ผ่าน gateway: origin ที่อนุญาตได้ header, origin อื่นไม่ได้", async () => {
  const preflight = (origin) => fetch(`${API}/api/market/v1/stalls`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-market-api-key" },
  });
  const allowed = await preflight(ORIGIN_A);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), ORIGIN_A);
  const denied = await preflight("https://evil.example.com");
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("T13 origin ภายนอกเรียก /api/admin/* จากเบราว์เซอร์ → CORS เว็บหลักปฏิเสธ", async () => {
  const result = await call("GET", "/api/admin/market/stalls", { token: fx.adminToken, origin: ORIGIN_A });
  assert.ok(result.status >= 400);
  assert.equal(result.headers.get("access-control-allow-origin"), null);
});

test("T14 ไม่มี Origin และไม่มี key → 401", async () => {
  const result = await api("GET", "/stalls", undefined);
  assert.equal(result.status, 401);
  assert.equal(result.data.code, "INVALID_API_KEY");
});

test("T15 ปิด domain แล้วถูก CORS ปฏิเสธทันที", async () => {
  await ok(admin("PATCH", `/allowed-origins/${fx.origins.a}`, { is_active: false }));
  const denied = await api("GET", "/stalls", fx.keys.live, { origin: ORIGIN_A });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  assert.equal(denied.status, 403);
  await ok(admin("PATCH", `/allowed-origins/${fx.origins.a}`, { is_active: true }));
  const allowed = await api("GET", "/stalls", fx.keys.live, { origin: ORIGIN_A });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), ORIGIN_A);
});

test("T16 key ของ domain B ส่งมาจาก domain A → ถูกปฏิเสธ", async () => {
  const result = await api("GET", "/stalls", fx.keys.b, { origin: ORIGIN_A });
  assert.equal(result.status, 403);
  assert.equal(result.data.code, "FORBIDDEN");
});

test("T17 Staff, Customer, API key เรียก allowed-origins → 403", async () => {
  for (const token of [fx.staffToken, fx.customerToken].filter(Boolean)) {
    assert.equal((await call("GET", "/api/admin/market/allowed-origins", { token })).status, 403);
  }
  assert.equal((await call("GET", "/api/admin/market/allowed-origins", { key: fx.keys.live })).status, 403);
  assert.equal((await call("POST", "/api/market/v1/allowed-origins", { key: fx.keys.live, body: { origin: "https://x.example.com" } })).status, 404);
});

test("T19 DB user ของ market อ่านตาราง Customer ไม่ได้", async (t) => {
  const credentials = serviceCredentials("market");
  if (!credentials) return t.skip("ยังไม่ได้ตั้ง MARKET_DB_USER / MARKET_DB_PASSWORD");
  const { database: _database, ...server } = DB_CONFIG;
  const connection = await mysql.createConnection({ ...server, ...credentials });
  try {
    await assert.rejects(connection.query(`SELECT * FROM \`${AUTH_DB}\`.Customer LIMIT 1`), /denied/i);
    const [views] = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW'",
      [MARKET_DB],
    );
    assert.deepEqual(views, []);
  } finally {
    await connection.end();
  }
});

test("T20 key test เห็นแค่ล็อกทดลองและแก้ล็อกจริงไม่ได้", async () => {
  const stalls = await ok(api("GET", "/stalls", fx.keys.test));
  assert.deepEqual(stalls.stalls.map((stall) => stall.id), [fx.stalls.s.id]);
  assert.equal((await api("PATCH", `/products/${fx.productA}`, fx.keys.test, { body: { quantity: 1 } })).status, 404);
  await ok(api("PATCH", `/products/${fx.productS}`, fx.keys.test, { body: { quantity: 2 } }));
});

test("T21 key เก่าหลังหมุนใช้ได้ในช่วงที่กำหนด หลังจากนั้น 401", async () => {
  const oldKey = await createKey(`rotate-${TAG}`, { mode: "live", scopes: ["stalls:read"], stall_ids: [fx.stalls.a.id] });
  const rotated = await ok(admin("POST", `/api-clients/${fx.clients[`rotate-${TAG}`]}/rotate`));
  assert.notEqual(rotated.api_key, oldKey);
  await ok(api("GET", "/stalls", rotated.api_key));
  await ok(api("GET", "/stalls", oldKey));
  await root.query(
    `UPDATE \`${MARKET_DB}\`.MarketApiClient SET previous_key_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?`,
    [fx.clients[`rotate-${TAG}`]],
  );
  assert.equal((await api("GET", "/stalls", oldKey)).status, 401);
  await ok(api("GET", "/stalls", rotated.api_key));
});

test("T22 adjust พร้อมกัน ยอดถูกและไม่ติดลบ", async () => {
  await ok(api("PATCH", `/products/${fx.productA}`, fx.keys.live, { body: { quantity: 1 } }));
  const results = await Promise.all([1, 2].map(() => api("POST", `/products/${fx.productA}/adjust`, fx.keys.live, { body: { delta: -1 } })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  const product = await ok(api("GET", `/products/${fx.productA}`, fx.keys.live));
  assert.equal(product.quantity, 0);
});

test("T23 ขาด scope → 403 SCOPE_REQUIRED; If-Match ไม่ตรง → 409", async () => {
  const denied = await api("PATCH", `/products/${fx.productA}`, fx.keys.read, { body: { quantity: 2 } });
  assert.equal(denied.status, 403);
  assert.equal(denied.data.code, "SCOPE_REQUIRED");
  const product = await ok(api("GET", `/products/${fx.productA}`, fx.keys.live));
  const stale = await api("PATCH", `/products/${fx.productA}`, fx.keys.live, { body: { quantity: 2 }, headers: { "If-Match": `"${product.version - 1}"` } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, "CONFLICT");
  await ok(api("PATCH", `/products/${fx.productA}`, fx.keys.live, { body: { quantity: 2 }, headers: { "If-Match": `"${product.version}"` } }));
});

test("D04 แก้ชื่อร้านได้เฉพาะล็อกที่มีสัญญามีผล", async () => {
  const renamed = await ok(api("PATCH", `/stalls/${fx.stalls.a.id}`, fx.keys.live, { body: { shop_name: "ร้านใหม่" } }));
  assert.equal(renamed.shop_name, "ร้านใหม่");
  const blocked = await api("PATCH", `/stalls/${fx.stalls.b.id}`, fx.keys.b, { body: { shop_name: "ร้านใหม่" } });
  assert.equal(blocked.status, 403);
});

test("T31 จองอาหารลงล็อกไม่มีน้ำ, จองสั้นกว่าสัญญาขั้นต่ำ, เปิดล็อกราคา 0 → 400", async () => {
  const later = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  const noWater = await admin("POST", "/bookings", {
    stall_id: fx.stalls.b.id, vendor_id: fx.vendor, category_id: fx.food, start_date: later, lease_months: fx.config.min_lease_months,
  });
  assert.equal(noWater.status, 400);
  if (fx.config.min_lease_months > 1) {
    const short = await admin("POST", "/bookings", {
      stall_id: fx.stalls.b.id, vendor_id: fx.vendor, category_id: fx.grocery, start_date: later, lease_months: fx.config.min_lease_months - 1,
    });
    assert.equal(short.status, 400);
  }
  assert.equal((await admin("PATCH", `/stalls/${fx.stalls.c.id}/status`, { status: "available" })).status, 400);
});

test("สัญญาเช่าร้าน: ออกบิล ชำระ สิ้นสุดก่อนกำหนด และคืนเงินประกัน", async () => {
  const { contract } = await ok(admin("GET", `/leases/${fx.contract}`));
  assert.equal(contract.status, "active");
  assert.equal(contract.contract_type, "restaurant");
  assert.ok(contract.contract_no.startsWith("ML-"));
  const period = fx.today.slice(0, 7);
  const billed = await ok(admin("POST", `/leases/${fx.contract}/invoices`, { period_month: period, electricity_units: 100, water_units: 10 }), 201);
  const invoice = billed.contract.invoices.find((item) => item.period_month === period);
  const expected = 10000 + 100 * fx.config.electricity_unit_price + 10 * fx.config.water_unit_price;
  assert.equal(invoice.total_amount, Math.round(expected * 100) / 100);
  assert.equal((await admin("POST", `/leases/${fx.contract}/invoices`, { period_month: period, electricity_units: 1, water_units: 1 })).status, 409);
  await ok(admin("POST", `/leases/invoices/${invoice.id}/pay`, { note: "เงินสด" }));
  assert.equal((await admin("POST", `/leases/${fx.contract}/end`, { type: "terminated" })).status, 400);
  await ok(admin("POST", `/leases/${fx.contract}/end`, { type: "terminated", reason: "ผู้เช่าขอออก" }));
  const { stalls } = await ok(admin("GET", "/stalls"));
  assert.equal(stalls.find((stall) => stall.id === fx.stalls.a.id).status, "available");
  const settled = await ok(admin("POST", `/leases/${fx.contract}/deposit-settlement`, { action: "refund", deduction: 1000, note: "ค่าทำความสะอาด" }));
  assert.equal(settled.contract.deposit_status, "refunded");
  assert.equal(settled.contract.deposit_refunded, contract.deposit_amount - 1000);
});

test("T30 migrate ซ้ำไม่ seed ล็อกกลับมา", async () => {
  const [[before]] = await root.query(`SELECT COUNT(*) AS count FROM \`${MARKET_DB}\`.MarketStall`);
  const code = await runNode(["Database/migrate.js"], {});
  assert.equal(code, 0);
  const [[afterRun]] = await root.query(`SELECT COUNT(*) AS count FROM \`${MARKET_DB}\`.MarketStall`);
  assert.equal(Number(afterRun.count), Number(before.count));
});

test("T42 ไม่ตั้ง MARKET_DB_PASSWORD → service ไม่ start", async () => {
  const code = await runNode(["services/marketService.js"], { MARKET_DB_PASSWORD: "", MARKET_PORT: "0" });
  assert.equal(code, 1);
});
