import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { DB_CONFIG, serviceDatabaseName } from "../Database/connection.js";
import { removeVendorFiles } from "../middleware/repairUploads.js";

const API = process.env.REPAIR_TEST_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TAG = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const MAINTENANCE_DB = serviceDatabaseName(DB_CONFIG.database, "maintenance");
const AUTH_DB = serviceDatabaseName(DB_CONFIG.database, "auth");
const ROOM_DB = serviceDatabaseName(DB_CONFIG.database, "room");
const OWNER_DB = serviceDatabaseName(DB_CONFIG.database, "owner");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const fx = { vendorIds: [], jobIds: [], requestIds: [] };
let root;

async function call(method, url, { token, key, body } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "X-Repair-Api-Key": key } : {}),
      ...(body === undefined || form ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined || form ? body : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function vendorForm(payload, imageCount = 5, type = "image/png") {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  for (let index = 0; index < imageCount; index += 1) form.append("contract_images", new Blob([PNG], { type }), `contract-${index}.png`);
  return form;
}

function imagesForm(count) {
  const form = new FormData();
  for (let index = 0; index < count; index += 1) form.append("contract_images", new Blob([PNG], { type: "image/png" }), `extra-${index}.png`);
  return form;
}

const staff = (method, url, body) => call(method, `/api/staff/repair-vendors${url}`, { token: fx.staff, body });
const api = (method, url, key, body) => call(method, `/api/repair/v1${url}`, { key, body });

async function expectStatus(promise, status) {
  const result = await promise;
  assert.equal(result.status, status, JSON.stringify(result.data));
  return result.data;
}

const dateKey = (offsetDays) => {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const vendorBody = (name, extra = {}) => ({
  name: `${name} ${TAG}`,
  contact_name: "ผู้ติดต่อทดสอบ",
  phone: "0811111111",
  specialties: ["aircon", "electrical"],
  contract_type: "yearly",
  contract_start: dateKey(-1),
  contract_end: dateKey(364),
  contract_fee: 12000,
  ...extra,
});

async function createVendorWithKey(name) {
  const { vendor } = await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody(name))), 201);
  fx.vendorIds.push(vendor.id);
  const { api_key: key, api_keys: keys } = await expectStatus(staff("POST", `/vendors/${vendor.id}/api-keys`, { label: "ระบบทดสอบ" }), 201);
  return { vendor, key, keyId: keys[0].id };
}

async function createJob(vendorId, extra = {}) {
  const { job } = await expectStatus(staff("POST", "/jobs", {
    vendor_id: vendorId, room_number: fx.room, category: "aircon", urgency: "urgent",
    description: `แอร์ไม่เย็น ${TAG}`, contact_phone: "0822222222", preferred_time: "afternoon", ...extra,
  }), 201);
  fx.jobIds.push(job.id);
  return job;
}

before(async () => {
  root = await mysql.createConnection(DB_CONFIG);
  const [[staffRow]] = await root.query("SELECT id FROM ??.Staff WHERE is_suspended = FALSE LIMIT 1", [AUTH_DB]);
  assert.ok(staffRow, "need an active Staff account");
  fx.staff = jwt.sign({ id: staffRow.id, role: "Staff" }, SECRET, { expiresIn: "15m" });
  const [[customer]] = await root.query(
    "SELECT id, room_number FROM ??.Customer WHERE is_suspended = FALSE AND room_number IS NOT NULL LIMIT 1",
    [AUTH_DB],
  );
  if (customer) {
    fx.customer = customer;
    fx.room = Number(customer.room_number);
  } else {
    const [[room]] = await root.query("SELECT room_number FROM ??.Room LIMIT 1", [ROOM_DB]);
    fx.room = Number(room.room_number);
  }
  fx.a = await createVendorWithKey("ช่างแอร์ A");
  fx.b = await createVendorWithKey("ช่างไฟ B");
});

after(async () => {
  if (!root) return;
  if (fx.jobIds.length) {
    await root.query("DELETE FROM ??.Notification WHERE ref_table = 'RepairJob' AND ref_id IN (?)", [OWNER_DB, fx.jobIds]);
    await root.query("DELETE FROM ??.RepairJob WHERE id IN (?)", [MAINTENANCE_DB, fx.jobIds]);
  }
  if (fx.requestIds.length) {
    await root.query("DELETE FROM ??.Notification WHERE ref_table = 'MaintenanceRequest' AND ref_id IN (?)", [OWNER_DB, fx.requestIds]);
    await root.query("DELETE FROM ??.MaintenanceRequest WHERE id IN (?)", [MAINTENANCE_DB, fx.requestIds]);
  }
  if (fx.vendorIds.length) {
    const [files] = await root.query("SELECT file_name FROM ??.RepairVendorImage WHERE vendor_id IN (?)", [MAINTENANCE_DB, fx.vendorIds]);
    await root.query("DELETE FROM ??.RepairVendor WHERE id IN (?)", [MAINTENANCE_DB, fx.vendorIds]);
    await removeVendorFiles(files.map((row) => row.file_name));
  }
  await root.end();
});

test("vendor API rejects missing, malformed and bearer credentials", async () => {
  assert.equal((await api("GET", "/vendor")).data.code, "INVALID_API_KEY");
  assert.equal((await api("GET", "/vendor", "rpk_bad")).status, 401);
  const withBearer = await call("GET", "/api/repair/v1/vendor", { token: fx.staff, key: fx.a.key });
  assert.equal(withBearer.status, 401);
});

test("a vendor key cannot reach any other part of the system", async () => {
  const key = fx.a.key;
  for (const url of [
    "/api/staff/repair-vendors/overview",
    "/api/staff/maintenance/history",
    "/api/staff/rooms",
    "/api/customer/maintenance",
    "/api/admin/logs/maintenance",
    "/api/owner/income",
    "/api/market/overview",
    "/api/market/v1/shop",
  ]) {
    const result = await call("GET", url, { key });
    assert.ok([401, 403].includes(result.status), `${url} returned ${result.status}`);
  }
  const asHeader = await fetch(`${API}/api/staff/repair-vendors/overview`, { headers: { "X-Market-Api-Key": key, Authorization: `Bearer ${key}` } });
  assert.ok([401, 403].includes(asHeader.status));
  assert.equal((await api("GET", "/../../staff/repair-vendors/overview", key)).status === 200, false);
  assert.equal((await api("DELETE", "/jobs/1", key)).status === 200, false);
  assert.equal((await api("POST", "/jobs", key, { room_number: fx.room, description: "x" })).status === 200, false);
  const preflight = await fetch(`${API}/api/repair/v1/jobs`, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
  assert.equal(preflight.headers.get("access-control-allow-credentials"), null);
  const staffPreflight = await fetch(`${API}/api/staff/repair-vendors/overview`, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
  assert.notEqual(staffPreflight.headers.get("access-control-allow-origin"), "https://evil.example");
  assert.notEqual(staffPreflight.headers.get("access-control-allow-origin"), "*");
  const jobs = await expectStatus(api("GET", "/jobs", key), 200);
  for (const job of jobs.jobs) {
    for (const field of ["vendor_id", "maintenance_request_id", "tenant_name", "tenant_phone", "webhook_status", "sent_by_name_internal"]) {
      assert.equal(field in job, false, `job exposes ${field}`);
    }
  }
});

test("vendor sees its own profile and the staff overview lists it", async () => {
  const data = await expectStatus(api("GET", "/vendor", fx.a.key), 200);
  assert.equal(data.vendor.name, `ช่างแอร์ A ${TAG}`);
  assert.equal(data.vendor.contract_type, "yearly");
  assert.equal("webhook_url" in data.vendor, false);
  await expectStatus(api("PATCH", "/vendor", fx.a.key, { name: "x" }), 403);
  const overview = await expectStatus(staff("GET", "/overview"), 200);
  assert.ok(overview.vendors.some((vendor) => vendor.id === fx.a.vendor.id && vendor.is_usable && vendor.active_keys === 1));
});

test("staff validation blocks bad vendor and job input", async () => {
  await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("x", { phone: "123" }))), 400);
  await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("x", { specialties: [] }))), 400);
  await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("x", { contract_end: dateKey(-10) }))), 400);
  await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("x", { webhook_url: "ftp://example.com" }))), 400);
  await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("x", { specialties: ["other"] }))), 400);
  const { vendor: other } = await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("ช่างอื่นๆ", { specialties: ["other", "plumbing"], specialty_other: "ปั๊มน้ำ, กล้องวงจรปิด" }))), 201);
  fx.vendorIds.push(other.id);
  assert.equal(other.specialty_other, "ปั๊มน้ำ, กล้องวงจรปิด");
  const { vendor: cleared } = await expectStatus(staff("PUT", `/vendors/${other.id}`, vendorBody("ช่างอื่นๆ", { specialties: ["plumbing"], specialty_other: "ทิ้ง" })), 200);
  assert.equal(cleared.specialty_other, null);
  const [[{ before }]] = await root.query("SELECT COUNT(*) AS `before` FROM ??.RepairVendor", [MAINTENANCE_DB]);
  assert.match((await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("x"), 4)), 400)).message, /อย่างน้อย 5 รูป/);
  await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("x"), 11)), 400);
  await expectStatus(staff("POST", "/vendors", vendorForm(vendorBody("x"), 5, "text/plain")), 400);
  const [[{ after: count }]] = await root.query("SELECT COUNT(*) AS `after` FROM ??.RepairVendor", [MAINTENANCE_DB]);
  assert.equal(count, before);
  await expectStatus(staff("POST", "/jobs", { vendor_id: fx.a.vendor.id, room_number: fx.room, description: "" }), 400);
  await expectStatus(staff("POST", "/jobs", { vendor_id: fx.a.vendor.id, room_number: 999999, description: "x" }), 400);
});

test("job flows sent -> accepted -> in_progress -> done and staff sees each status", async () => {
  const job = await createJob(fx.a.vendor.id);
  assert.equal(job.status, "sent");

  const list = await expectStatus(api("GET", "/jobs?status=sent", fx.a.key), 200);
  const listed = list.jobs.find((item) => item.id === job.id);
  assert.equal(listed.room_number, fx.room);
  assert.equal(listed.description, `แอร์ไม่เย็น ${TAG}`);
  assert.equal("vendor_id" in listed, false);

  await expectStatus(api("GET", `/jobs/${job.id}`, fx.b.key), 404);
  await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.b.key, { status: "accepted" }), 404);
  await expectStatus(api("PUT", `/jobs/${job.id}`, fx.a.key, { description: "x" }), 403);

  const skip = await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, { status: "done" }), 409);
  assert.equal(skip.code, "INVALID_TRANSITION");
  const extra = await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, { status: "accepted", room_number: 1 }), 400);
  assert.equal(extra.code, "FIELD_NOT_ALLOWED");
  await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, { status: "rejected" }), 400);

  const accepted = await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, {
    status: "accepted", technician_name: "ช่างเอ", scheduled_at: "2026-12-01T13:00", note: "นำน้ำยาไปด้วย",
  }), 200);
  assert.equal(accepted.job.status, "accepted");
  assert.equal(accepted.job.technician_name, "ช่างเอ");
  assert.ok(accepted.job.accepted_at);
  assert.ok(accepted.job.scheduled_at);

  const rescheduled = await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, { status: "accepted", scheduled_at: null }), 200);
  assert.equal(rescheduled.job.scheduled_at, null);
  assert.equal(rescheduled.job.technician_name, "ช่างเอ");
  assert.equal(rescheduled.job.accepted_at, accepted.job.accepted_at);

  let overview = await expectStatus(staff("GET", "/overview"), 200);
  assert.equal(overview.jobs.find((item) => item.id === job.id).status, "accepted");

  await expectStatus(api("PUT", `/jobs/${job.id}/status`, fx.a.key, { status: "in_progress" }), 200);
  const done = await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, { status: "done", note: "เติมน้ำยาแล้ว" }), 200);
  assert.equal(done.job.status, "done");
  assert.equal(done.job.vendor_note, "เติมน้ำยาแล้ว");
  assert.ok(done.job.started_at && done.job.completed_at);

  overview = await expectStatus(staff("GET", "/overview"), 200);
  const staffJob = overview.jobs.find((item) => item.id === job.id);
  assert.equal(staffJob.status, "done");
  assert.equal(staffJob.status_updated_by, "API: ระบบทดสอบ");

  await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, { status: "in_progress" }), 409);
  await expectStatus(staff("POST", `/jobs/${job.id}/cancel`, { reason: "ทดสอบ" }), 409);

  const [[notification]] = await root.query(
    "SELECT message FROM ??.Notification WHERE ref_table = 'RepairJob' AND ref_id = ? AND type = 'repair_job_done'",
    [OWNER_DB, job.id],
  );
  assert.match(notification.message, /ซ่อมเสร็จแล้ว/);
});

test("staff edits an open job and the vendor sees the new details", async () => {
  const job = await createJob(fx.a.vendor.id);
  const edit = { category: "plumbing", urgency: "normal", description: `ท่อรั่วใต้ซิงก์ ${TAG}`, contact_phone: "0833333333", preferred_time: "weekend" };
  await expectStatus(staff("PUT", `/jobs/${job.id}`, { ...edit, category: "spaceship" }), 400);
  const { job: updated } = await expectStatus(staff("PUT", `/jobs/${job.id}`, edit), 200);
  assert.equal(updated.description, edit.description);
  assert.ok(updated.details_updated_at);
  const seen = await expectStatus(api("GET", `/jobs/${job.id}`, fx.a.key), 200);
  assert.equal(seen.job.category, "plumbing");
  assert.equal(seen.job.preferred_time, "weekend");
  assert.equal(seen.job.contact_phone, "0833333333");
  assert.ok(seen.job.details_updated_at);
  await expectStatus(staff("POST", `/jobs/${job.id}/cancel`, { reason: "ทดสอบ" }), 200);
  await expectStatus(staff("PUT", `/jobs/${job.id}`, edit), 409);
});

test("vendor rejects with a note and staff cancel blocks further updates", async () => {
  const rejected = await createJob(fx.a.vendor.id);
  const data = await expectStatus(api("PATCH", `/jobs/${rejected.id}/status`, fx.a.key, { status: "rejected", note: "คิวเต็ม" }), 200);
  assert.equal(data.job.status, "rejected");

  const cancelled = await createJob(fx.a.vendor.id);
  await expectStatus(staff("POST", `/jobs/${cancelled.id}/cancel`, {}), 400);
  await expectStatus(staff("POST", `/jobs/${cancelled.id}/cancel`, { reason: "ผู้เช่าซ่อมเอง" }), 200);
  const after = await expectStatus(api("GET", `/jobs/${cancelled.id}`, fx.a.key), 200);
  assert.equal(after.job.status, "cancelled");
  assert.equal(after.job.cancel_reason, "ผู้เช่าซ่อมเอง");
  await expectStatus(api("PATCH", `/jobs/${cancelled.id}/status`, fx.a.key, { status: "accepted" }), 409);
});

test("a job linked to a tenant maintenance request closes that request when done", async (t) => {
  if (!fx.customer) return t.skip("no tenant with a room");
  const [inserted] = await root.query(
    "INSERT INTO ??.MaintenanceRequest (customer_id, room_number, description, category) VALUES (?, ?, ?, 'aircon')",
    [MAINTENANCE_DB, fx.customer.id, fx.room, `แจ้งซ่อมทดสอบ ${TAG}`],
  );
  fx.requestIds.push(inserted.insertId);
  const overview = await expectStatus(staff("GET", "/overview"), 200);
  assert.ok(overview.open_requests.some((request) => request.id === inserted.insertId));

  await expectStatus(staff("POST", "/jobs", {
    vendor_id: fx.a.vendor.id, room_number: fx.room === 101 ? 102 : 101, description: "x", maintenance_request_id: inserted.insertId,
  }), 400);
  const job = await createJob(fx.a.vendor.id, { maintenance_request_id: inserted.insertId });
  await expectStatus(staff("POST", "/jobs", { vendor_id: fx.b.vendor.id, room_number: fx.room, description: "x", maintenance_request_id: inserted.insertId }), 409);

  await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, { status: "accepted" }), 200);
  let [[request]] = await root.query("SELECT status, accepted_by_name FROM ??.MaintenanceRequest WHERE id = ?", [MAINTENANCE_DB, inserted.insertId]);
  assert.equal(request.status, "in_progress");
  assert.equal(request.accepted_by_name, `ช่าง ช่างแอร์ A ${TAG}`);

  await expectStatus(api("PATCH", `/jobs/${job.id}/status`, fx.a.key, { status: "done" }), 200);
  [[request]] = await root.query("SELECT status, completed_by_name FROM ??.MaintenanceRequest WHERE id = ?", [MAINTENANCE_DB, inserted.insertId]);
  assert.equal(request.status, "done");
  assert.equal(request.completed_by_name, `ช่าง ช่างแอร์ A ${TAG}`);

  const [notes] = await root.query(
    "SELECT audience, recipient_id, type FROM ??.Notification WHERE ref_table = 'RepairJob' AND ref_id = ? ORDER BY id",
    [OWNER_DB, job.id],
  );
  const has = (audience, type, recipient = null) => notes.some((note) => note.audience === audience && note.type === type && (recipient === null || note.recipient_id === recipient));
  assert.ok(has("Staff,Admin", "repair_job_sent"), "operators told about sent job");
  assert.ok(has("Owner", "repair_job_sent"), "owner told about sent job");
  assert.ok(has("Customer", "repair_job_sent", fx.customer.id), "tenant told a technician is coming");
  assert.ok(has("Customer", "repair_job_accepted", fx.customer.id), "tenant told the job was accepted");
  assert.ok(has("Staff,Admin", "repair_job_done"));
  assert.ok(has("Owner", "repair_job_done"), "owner told about completion");
  assert.equal(has("Owner", "repair_job_accepted"), false, "owner is not told every step");
});

test("key reveal, rotate and revoke control vendor access", async () => {
  const reveal = await expectStatus(staff("GET", `/api-keys/${fx.b.keyId}/reveal`), 200);
  assert.equal(reveal.api_key, fx.b.key);
  const rotated = await expectStatus(staff("POST", `/api-keys/${fx.b.keyId}/rotate`, {}), 201);
  await expectStatus(api("GET", "/vendor", fx.b.key), 401);
  await expectStatus(api("GET", "/vendor", rotated.api_key), 200);
  const newKeyId = rotated.api_keys.find((key) => !key.revoked_at).id;
  await expectStatus(staff("POST", `/api-keys/${newKeyId}/revoke`, {}), 200);
  await expectStatus(api("GET", "/vendor", rotated.api_key), 401);
});

test("contract images are served, capped at 10 and never drop below 5", async () => {
  const detail = await expectStatus(staff("GET", `/vendors/${fx.b.vendor.id}`), 200);
  assert.equal(detail.images.length, 5);
  assert.equal(detail.vendor.image_count, 5);
  const file = await fetch(`${API}/api/staff/repair-vendors/vendor-images/${detail.images[0].id}`, { headers: { Authorization: `Bearer ${fx.staff}` } });
  assert.equal(file.status, 200);
  assert.ok(Buffer.from(await file.arrayBuffer()).equals(PNG));
  assert.equal((await fetch(`${API}/api/staff/repair-vendors/vendor-images/${detail.images[0].id}`)).status, 401);

  assert.equal((await expectStatus(staff("DELETE", `/vendor-images/${detail.images[0].id}`), 409)).code, "CONFLICT");
  await expectStatus(staff("POST", `/vendors/${fx.b.vendor.id}/images`, imagesForm(6)), 409);
  const added = await expectStatus(staff("POST", `/vendors/${fx.b.vendor.id}/images`, imagesForm(2)), 201);
  assert.equal(added.images.length, 7);
  const removed = await expectStatus(staff("DELETE", `/vendor-images/${added.images[6].id}`), 200);
  assert.equal(removed.images.length, 6);
});

test("owner can view repair data but cannot change it", async () => {
  const [[owner]] = await root.query("SELECT id FROM ??.Owner WHERE is_suspended = FALSE LIMIT 1", [AUTH_DB]);
  if (!owner) return;
  const token = jwt.sign({ id: owner.id, role: "Owner" }, SECRET, { expiresIn: "15m" });
  const asOwner = (method, url, body) => call(method, `/api/staff/repair-vendors${url}`, { token, body });
  await expectStatus(asOwner("GET", "/overview"), 200);
  await expectStatus(asOwner("GET", `/vendors/${fx.a.vendor.id}`), 200);
  assert.equal((await expectStatus(asOwner("POST", "/jobs", { vendor_id: fx.a.vendor.id, room_number: fx.room, description: "x" }), 403)).code, "READ_ONLY");
  await expectStatus(asOwner("PUT", `/vendors/${fx.a.vendor.id}`, vendorBody("x")), 403);
  await expectStatus(asOwner("GET", `/api-keys/${fx.a.keyId}/reveal`), 403);
  await expectStatus(asOwner("POST", `/api-keys/${fx.a.keyId}/revoke`, {}), 403);
});

test("deactivating a vendor blocks its key and new jobs", async () => {
  await expectStatus(staff("PUT", `/vendors/${fx.a.vendor.id}`, vendorBody("ช่างแอร์ A", { is_active: false })), 200);
  await expectStatus(api("GET", "/jobs", fx.a.key), 401);
  await expectStatus(staff("POST", "/jobs", { vendor_id: fx.a.vendor.id, room_number: fx.room, description: "x" }), 409);
});
