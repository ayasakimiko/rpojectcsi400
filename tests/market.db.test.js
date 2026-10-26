import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { DB_CONFIG, serviceDatabaseName } from "../Database/connection.js";
import { LEASE_MIN_IMAGES, removeLeaseFiles } from "../middleware/marketUploads.js";
import { leaseMaxEndKey } from "../router/marketShared.js";
import { addContractMonths } from "../src/utils/rentalContract.js";

const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDaysKey = (key, days) => dateKey(new Date(new Date(`${key}T00:00:00`).getTime() + days * 86400000));
// Leases may run at most 12 months, so the fixture starts today and uses the full allowed term.
const LEASE_START = dateKey(new Date());
const LEASE_END = leaseMaxEndKey(LEASE_START);
const RENEWED_END = dateKey(addContractMonths(new Date(`${LEASE_END}T00:00:00`), 6));

const API = process.env.MARKET_TEST_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TAG = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const MARKET_DB = serviceDatabaseName(DB_CONFIG.database, "market");
const AUTH_DB = serviceDatabaseName(DB_CONFIG.database, "auth");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const fx = {};
let root;

async function call(method, url, { token, key, body } = {}) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "X-Market-Api-Key": key } : {}),
      ...(body === undefined || body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

const as = (role) => (method, url, body) => call(method, `/api/market${url}`, { token: fx[role], body });
const api = (method, url, key, body) => call(method, `/api/market/v1${url}`, { key, body });

async function expectStatus(promise, status) {
  const result = await promise;
  assert.equal(result.status, status, JSON.stringify(result.data));
  return result.data;
}

async function tokenFor(role) {
  const [[row]] = await root.query("SELECT id FROM ??.?? WHERE is_suspended = FALSE LIMIT 1", [AUTH_DB, role]);
  return row ? jwt.sign({ id: row.id, role }, SECRET, { expiresIn: "15m" }) : null;
}

function leaseForm(fields, imageCount = LEASE_MIN_IMAGES) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  for (let index = 0; index < imageCount; index += 1) form.append("contract_images", new Blob([PNG], { type: "image/png" }), `contract-${index}.png`);
  return form;
}

const leaseBody = (shopId, extra = {}) => ({
  shop_id: shopId,
  tenant_name: `ผู้เช่าทดสอบ ${TAG}`,
  tenant_phone: "0899999999",
  tenant_idcard: "1234567890123",
  business_name: `ร้านทดสอบ ${TAG}`,
  start_date: LEASE_START,
  end_date: LEASE_END,
  monthly_rent: 5000,
  deposit: 10000,
  ...extra,
});

before(async () => {
  root = await mysql.createConnection(DB_CONFIG);
  for (const role of ["Staff", "Admin", "Owner"]) fx[role] = await tokenFor(role);
});

after(async () => {
  if (fx.shopIds?.length) {
    const [images] = await root.query("SELECT i.file_name FROM ??.ShopLeaseImage i JOIN ??.ShopLease l ON l.id = i.lease_id WHERE l.shop_id IN (?)", [MARKET_DB, MARKET_DB, fx.shopIds]);
    await removeLeaseFiles(images.map((image) => image.file_name));
    await root.query("DELETE k FROM ??.ShopApiKey k JOIN ??.ShopLease l ON l.id = k.lease_id WHERE l.shop_id IN (?)", [MARKET_DB, MARKET_DB, fx.shopIds]);
    await root.query("DELETE FROM ??.ShopLease WHERE shop_id IN (?)", [MARKET_DB, fx.shopIds]);
    await root.query("DELETE FROM ??.Shop WHERE id IN (?)", [MARKET_DB, fx.shopIds]);
  }
  await root?.end();
});

test("market roles, leases and tenant API key permissions", async (t) => {
  if (!fx.Staff || !fx.Admin || !fx.Owner) return t.skip("ต้องมีบัญชี Staff, Admin และ Owner ในฐานข้อมูล");
  fx.shopIds = [];

  const shopBody = (code) => ({
    code, name: `ร้านทดสอบ ${code}`, shop_type: "มินิมาร์ท", location: "ทดสอบ", area_sqm: 10, monthly_rent: 5000,
    open_time: "08:00", close_time: "20:00",
  });

  await expectStatus(as("Staff")("POST", "/shops", shopBody(`T${TAG}S`)), 403);
  const { shop } = await expectStatus(as("Owner")("POST", "/shops", shopBody(`T${TAG}A`)), 201);
  fx.shopIds.push(shop.id);
  const { shop: other } = await expectStatus(as("Admin")("POST", "/shops", shopBody(`T${TAG}B`)), 201);
  fx.shopIds.push(other.id);
  await expectStatus(as("Admin")("POST", "/shops", shopBody(`T${TAG}A`)), 409);

  await expectStatus(as("Owner")("POST", `/shops/${shop.id}/products`, { name: "น้ำ", category: "เครื่องดื่ม", price: 10 }), 403);
  await expectStatus(as("Staff")("POST", `/shops/${shop.id}/products`, { name: "น้ำ", category: "เครื่องดื่ม", price: 10, stock: 5, sku: "W1" }), 201);
  const { product: otherProduct } = await expectStatus(as("Staff")("POST", `/shops/${other.id}/products`, { name: "ขนม", category: "ขนม", price: 20 }), 201);

  const paid = (extra = {}) => leaseBody(shop.id, { payment_method: "counter", ...extra });
  await expectStatus(as("Owner")("POST", "/leases", leaseForm(paid())), 403);
  await expectStatus(as("Staff")("POST", "/leases", leaseForm(paid(), LEASE_MIN_IMAGES - 1)), 400);
  await expectStatus(as("Staff")("POST", "/leases", leaseForm(leaseBody(shop.id))), 400);
  await expectStatus(as("Staff")("POST", "/leases", leaseForm(leaseBody(shop.id, { payment_method: "promptpay" }))), 400);
  const before = await expectStatus(as("Owner")("GET", "/leases"), 200);
  assert.equal(before.leases.filter((item) => item.shop_id === shop.id).length, 0);
  const { lease } = await expectStatus(as("Staff")("POST", "/leases", leaseForm(paid())), 201);
  assert.match(lease.contract_no, /^SL-\d{4}-\d{4,}$/);
  assert.equal(lease.status, "active");
  await expectStatus(as("Admin")("POST", "/leases", leaseForm(paid({ end_date: addDaysKey(LEASE_END, 1) }))), 400);
  await expectStatus(as("Admin")("POST", "/leases", leaseForm(paid())), 409);
  const detail = await expectStatus(as("Owner")("GET", `/leases/${lease.id}`), 200);
  assert.equal(detail.images.length, LEASE_MIN_IMAGES);
  assert.equal(detail.payments.length, 1);
  assert.equal(detail.payments[0].amount, 15000);
  assert.equal(detail.payments[0].method, "counter");

  const renewForm = (fields, imageCount = LEASE_MIN_IMAGES) => leaseForm(fields, imageCount);
  const beforeRenew = await expectStatus(as("Owner")("GET", `/leases/${lease.id}`), 200);
  await expectStatus(as("Staff")("POST", `/leases/${lease.id}/renew`, renewForm({ months: 6, renew_plan: "monthly", payment_method: "counter" }, LEASE_MIN_IMAGES - 1)), 400);
  await expectStatus(as("Owner")("POST", `/leases/${lease.id}/renew`, renewForm({ months: 6, renew_plan: "monthly", payment_method: "counter" })), 403);
  await expectStatus(as("Staff")("POST", `/leases/${lease.id}/renew`, renewForm({ months: 0, renew_plan: "monthly", payment_method: "counter" })), 400);
  await expectStatus(as("Staff")("POST", `/leases/${lease.id}/renew`, renewForm({ months: 6, renew_plan: "monthly" })), 400);
  await expectStatus(as("Staff")("POST", `/leases/${lease.id}/renew`, renewForm({ months: 6, renew_plan: "lump_sum", payment_method: "bank" })), 400);
  const unchanged = await expectStatus(as("Owner")("GET", `/leases/${lease.id}`), 200);
  assert.equal(unchanged.lease.end_date, LEASE_END);
  const renewed = await expectStatus(as("Staff")("POST", `/leases/${lease.id}/renew`, renewForm({ months: 6, renew_plan: "lump_sum", payment_method: "counter" })), 200);
  assert.equal(renewed.lease.end_date, RENEWED_END);
  const afterRenew = await expectStatus(as("Owner")("GET", `/leases/${lease.id}`), 200);
  const renewal = afterRenew.payments.find((item) => item.payment_type === "renewal");
  assert.equal(renewal.amount, 30000);
  assert.equal(renewal.renew_months, 6);
  assert.equal(renewal.renew_plan, "lump_sum");
  assert.equal(afterRenew.images.length, LEASE_MIN_IMAGES);
  assert.equal(afterRenew.image_history.length, 1);
  assert.equal(afterRenew.image_history[0].prev_start, "2026-01-01");
  assert.equal(afterRenew.image_history[0].prev_end, LEASE_END);
  assert.equal(afterRenew.image_history[0].new_end, RENEWED_END);
  assert.equal(afterRenew.image_history[0].months, 6);
  assert.equal(afterRenew.image_history[0].images.length, beforeRenew.images.length);
  assert.ok(afterRenew.images.every((image) => !beforeRenew.images.some((old) => old.id === image.id)));
  const archivedResponse = await fetch(`${API}${afterRenew.image_history[0].images[0].url}`, { headers: { Authorization: `Bearer ${fx.Owner}` } });
  assert.equal(archivedResponse.status, 200);
  const imageResponse = await fetch(`${API}${detail.images[0].url}`, { headers: { Authorization: `Bearer ${fx.Owner}` } });
  assert.equal(imageResponse.status, 200);
  assert.equal((await fetch(`${API}${detail.images[0].url}`)).status, 401);
  const added = await expectStatus(as("Staff")("POST", `/leases/${lease.id}/images`, leaseForm({}, 1)), 201);
  assert.equal(added.images.length, LEASE_MIN_IMAGES + 1);

  const overview = await expectStatus(as("Owner")("GET", "/overview"), 200);
  assert.equal(overview.permissions.operate, false);
  assert.equal(overview.shops.find((item) => item.id === shop.id).current_lease.contract_no, lease.contract_no);

  await expectStatus(as("Owner")("POST", `/leases/${lease.id}/api-keys`, { label: "POS" }), 403);
  const { api_key: key } = await expectStatus(as("Staff")("POST", `/leases/${lease.id}/api-keys`, { label: "POS" }), 201);
  assert.match(key, /^shk_/);
  const keyDetail = await expectStatus(as("Owner")("GET", `/leases/${lease.id}`), 200);
  const keyRow = keyDetail.api_keys.find((item) => key.startsWith(item.key_prefix));
  assert.equal(keyRow.can_reveal, true);
  await expectStatus(as("Owner")("GET", `/api-keys/${keyRow.id}/reveal`), 403);
  const revealed = await expectStatus(as("Staff")("GET", `/api-keys/${keyRow.id}/reveal`), 200);
  assert.equal(revealed.api_key, key);
  await root.query("UPDATE ??.ShopApiKey SET key_cipher = NULL WHERE id = ?", [MARKET_DB, keyRow.id]);
  await expectStatus(as("Staff")("GET", `/api-keys/${keyRow.id}/reveal`), 409);
  await expectStatus(as("Owner")("POST", `/api-keys/${keyRow.id}/rotate`), 403);
  const rotated = await expectStatus(as("Staff")("POST", `/api-keys/${keyRow.id}/rotate`), 201);
  assert.notEqual(rotated.api_key, key);
  await expectStatus(api("GET", "/shop", key), 401);
  const rotatedRow = rotated.api_keys.find((item) => !item.revoked_at);
  assert.equal(rotatedRow.can_reveal, true);
  const rotatedKey = rotated.api_key;

  await expectStatus(api("GET", "/shop", "shk_invalid"), 401);
  const shopInfo = await expectStatus(api("GET", "/shop", rotatedKey), 200);
  assert.equal(shopInfo.shop.code, shop.code);
  const { contract } = await expectStatus(api("GET", "/contract", rotatedKey), 200);
  assert.equal(contract.contract_no, lease.contract_no);
  assert.notEqual(contract.tenant_idcard, "1234567890123");
  const readOnly = await expectStatus(api("PUT", "/contract", rotatedKey, { monthly_rent: 1 }), 403);
  assert.equal(readOnly.code, "READ_ONLY");
  const renamed = await expectStatus(api("PATCH", "/shop", rotatedKey, { name: `ร้านใหม่ ${TAG}`, shop_type: "ร้านเครื่องดื่ม" }), 200);
  assert.equal(renamed.shop.name, `ร้านใหม่ ${TAG}`);
  assert.equal(renamed.shop.shop_type, "ร้านเครื่องดื่ม");
  const typeOnly = await expectStatus(api("PUT", "/shop", rotatedKey, { shop_type: "มินิมาร์ท" }), 200);
  assert.equal(typeOnly.shop.name, `ร้านใหม่ ${TAG}`);
  const shopFieldBlocked = await expectStatus(api("PATCH", "/shop", rotatedKey, { location: "ที่อื่น" }), 400);
  assert.equal(shopFieldBlocked.code, "FIELD_NOT_ALLOWED");
  await expectStatus(api("PATCH", "/shop", rotatedKey, { name: "   " }), 400);
  await expectStatus(api("POST", "/shop", rotatedKey, { name: "x" }), 403);
  const internalShop = await expectStatus(as("Owner")("GET", `/shops/${shop.id}`), 200);
  assert.equal(internalShop.shop.updated_by_name, "API: POS");

  const { products } = await expectStatus(api("GET", "/products", rotatedKey), 200);
  assert.equal(products.length, 1);
  const { product } = await expectStatus(api("POST", "/products", rotatedKey, { name: "กาแฟ", category: "เครื่องดื่ม", price: 35.5, stock: 3 }), 201);
  assert.equal(product.updated_by, "API: POS");
  const updated = await expectStatus(api("PATCH", `/products/${product.id}`, rotatedKey, { price: 40, is_available: false }), 200);
  assert.equal(updated.product.price, 40);
  assert.equal(updated.product.is_available, false);
  const notAllowed = await expectStatus(api("PATCH", `/products/${product.id}`, rotatedKey, { shop_id: other.id }), 400);
  assert.equal(notAllowed.code, "FIELD_NOT_ALLOWED");
  await expectStatus(api("POST", "/products", rotatedKey, { name: "ซ้ำ", category: "x", price: 1, sku: "W1" }), 409);
  await expectStatus(api("PATCH", `/products/${otherProduct.id}`, rotatedKey, { price: 1 }), 404);
  await expectStatus(api("DELETE", `/products/${otherProduct.id}`, rotatedKey), 404);
  await expectStatus(api("DELETE", `/products/${product.id}`, rotatedKey), 200);

  await expectStatus(as("Owner")("DELETE", `/shops/${shop.id}`), 409);
  await expectStatus(as("Staff")("POST", `/leases/${lease.id}/terminate`, { reason: "ทดสอบ" }), 200);
  await expectStatus(api("GET", "/shop", rotatedKey), 401);
  await expectStatus(as("Owner")("DELETE", `/shops/${shop.id}`), 200);
});
