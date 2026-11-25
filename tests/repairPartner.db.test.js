import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { DB_CONFIG, serviceDatabaseName } from "../Database/connection.js";
import { removeVendorFiles } from "../middleware/repairUploads.js";

// End-to-end: RenoCare-style partner reads the owner contact with X-API-Key and pushes
// signed webhooks to /api/repair/webhooks/renocare/:ref. Needs the stack on REPAIR_TEST_API_URL.
const API = process.env.REPAIR_TEST_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TAG = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const REF = `T-${TAG}`;
const WEBHOOK_SECRET = `whsec_${TAG}_secret`;
const MAINTENANCE_DB = serviceDatabaseName(DB_CONFIG.database, "maintenance");
const AUTH_DB = serviceDatabaseName(DB_CONFIG.database, "auth");
const ROOM_DB = serviceDatabaseName(DB_CONFIG.database, "room");
const OWNER_DB = serviceDatabaseName(DB_CONFIG.database, "owner");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const fx = { vendorIds: [], jobIds: [] };
let root;

async function call(method, url, { token, headers = {}, body, raw } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined || form ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: raw ?? (body === undefined || form ? body : JSON.stringify(body)),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function expectStatus(promise, status) {
  const result = await promise;
  assert.equal(result.status, status, JSON.stringify(result.data));
  return result.data;
}

const staff = (method, url, body) => call(method, `/api/staff/repair-vendors${url}`, { token: fx.staff, body });
const sign = (raw, secret = WEBHOOK_SECRET) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

function hook(payload, { ref = REF, secret = WEBHOOK_SECRET, signature } = {}) {
  const raw = JSON.stringify(payload);
  return call("POST", `/api/repair/webhooks/renocare/${ref}`, {
    raw,
    headers: { "Content-Type": "application/json", "X-Signature": signature ?? sign(raw, secret) },
  });
}

const dateKey = (offsetDays) => {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function vendorForm(name) {
  const form = new FormData();
  form.append("payload", JSON.stringify({
    name: `${name} ${TAG}`, contact_name: "ผู้ติดต่อ", phone: "0811111111", specialties: ["aircon"],
    contract_type: "yearly", contract_start: dateKey(-1), contract_end: dateKey(364), contract_fee: 1000,
  }));
  for (let index = 0; index < 5; index += 1) form.append("contract_images", new Blob([PNG], { type: "image/png" }), `c-${index}.png`);
  return form;
}

async function createVendorWithKey(name) {
  const { vendor } = await expectStatus(staff("POST", "/vendors", vendorForm(name)), 201);
  fx.vendorIds.push(vendor.id);
  const { api_key: key } = await expectStatus(staff("POST", `/vendors/${vendor.id}/api-keys`, { label: "RenoCare" }), 201);
  return { vendor, key };
}

async function createJob(vendorId) {
  const { job } = await expectStatus(staff("POST", "/jobs", {
    vendor_id: vendorId, room_number: fx.room, category: "aircon", urgency: "normal",
    description: `แอร์ไม่เย็น ${TAG}`, contact_phone: "0822222222", preferred_time: "anytime",
  }), 201);
  fx.jobIds.push(job.id);
  return job;
}

async function jobRow(id) {
  const [[row]] = await root.query("SELECT * FROM ??.RepairJob WHERE id = ?", [MAINTENANCE_DB, id]);
  return row;
}

before(async () => {
  root = await mysql.createConnection({ ...DB_CONFIG, database: undefined });
  const [[staffRow]] = await root.query("SELECT id FROM ??.Staff WHERE is_suspended = FALSE LIMIT 1", [AUTH_DB]);
  assert.ok(staffRow, "need an active Staff account");
  fx.staff = jwt.sign({ id: staffRow.id, role: "Staff" }, SECRET, { expiresIn: "15m" });
  const [[room]] = await root.query("SELECT room_number FROM ??.Room LIMIT 1", [ROOM_DB]);
  fx.room = Number(room.room_number);
  const [[owner]] = await root.query(
    "SELECT first_name, last_name, phone FROM ??.Owner WHERE is_suspended = FALSE ORDER BY id LIMIT 1",
    [AUTH_DB],
  );
  fx.owner = owner;
  fx.partner = await createVendorWithKey("RenoCare");
  fx.other = await createVendorWithKey("ช่างอื่น");
});

after(async () => {
  if (!root) return;
  if (fx.jobIds.length) {
    await root.query("DELETE FROM ??.Notification WHERE ref_table = 'RepairJob' AND ref_id IN (?)", [OWNER_DB, fx.jobIds]);
    await root.query("DELETE FROM ??.RepairJob WHERE id IN (?)", [MAINTENANCE_DB, fx.jobIds]);
  }
  if (fx.vendorIds.length) {
    await root.query("DELETE FROM ??.Notification WHERE ref_table = 'RepairVendor' AND ref_id IN (?)", [OWNER_DB, fx.vendorIds]);
    const [files] = await root.query("SELECT file_name FROM ??.RepairVendorImage WHERE vendor_id IN (?)", [MAINTENANCE_DB, fx.vendorIds]);
    await root.query("DELETE FROM ??.RepairVendor WHERE id IN (?)", [MAINTENANCE_DB, fx.vendorIds]);
    await removeVendorFiles(files.map((row) => row.file_name));
  }
  await root.end();
});

test("staff can configure the integration; secrets are stored encrypted and never returned", async () => {
  const id = fx.partner.vendor.id;
  assert.deepEqual((await expectStatus(staff("GET", `/vendors/${id}/integration`), 200)).integration, null);
  await expectStatus(staff("PUT", `/vendors/${id}/integration`, { building_ref: "bad ref!", webhook_secret: WEBHOOK_SECRET }), 400);
  await expectStatus(staff("PUT", `/vendors/${id}/integration`, { building_ref: REF, owner_email: "not-an-email" }), 400);
  await expectStatus(staff("PUT", `/vendors/${id}/integration`, { building_ref: REF, webhook_secret: "short" }), 400);

  const saved = await expectStatus(staff("PUT", `/vendors/${id}/integration`, {
    building_ref: REF, owner_email: "owner@example.com", webhook_secret: WEBHOOK_SECRET, partner_api_key: "rc_partner_key_0001",
  }), 200);
  assert.equal(saved.integration.building_ref, REF);
  assert.equal(saved.integration.webhook_secret_hint, `••••${WEBHOOK_SECRET.slice(-4)}`);
  assert.equal(saved.integration.partner_api_key_hint, "••••0001");
  assert.equal(saved.integration.webhook_path, `/api/repair/webhooks/renocare/${REF}`);
  assert.ok(!JSON.stringify(saved).includes(WEBHOOK_SECRET), "secret must not be echoed back");

  const [[row]] = await root.query("SELECT * FROM ??.RepairVendorIntegration WHERE vendor_id = ?", [MAINTENANCE_DB, id]);
  assert.ok(row.webhook_secret_cipher && !row.webhook_secret_cipher.includes(WEBHOOK_SECRET), "stored encrypted");

  // blank secret on a later save keeps the stored one
  const kept = await expectStatus(staff("PUT", `/vendors/${id}/integration`, { building_ref: REF, owner_email: "owner@example.com" }), 200);
  assert.equal(kept.integration.webhook_secret_hint, saved.integration.webhook_secret_hint);
  assert.equal(kept.integration.partner_api_key_hint, "••••0001");

  // the same building ref cannot be bound to a second vendor
  await expectStatus(staff("PUT", `/vendors/${fx.other.vendor.id}/integration`, { building_ref: REF, webhook_secret: WEBHOOK_SECRET }), 409);
});

test("GET /buildings/:ref/owner returns the owner contact for the bound ref only", async () => {
  const path = `/api/repair/v1/buildings/${REF}/owner`;
  await expectStatus(call("GET", path), 401);
  const viaPartnerHeader = await expectStatus(call("GET", path, { headers: { "X-API-Key": fx.partner.key } }), 200);
  if (fx.owner) {
    assert.deepEqual(viaPartnerHeader, {
      name: `${fx.owner.first_name} ${fx.owner.last_name}`.trim(),
      phone: fx.owner.phone,
      email: "owner@example.com",
    });
  }
  await expectStatus(call("GET", path, { headers: { "X-Repair-Api-Key": fx.partner.key } }), 200);
  await expectStatus(call("GET", "/api/repair/v1/buildings/OTHER-REF/owner", { headers: { "X-API-Key": fx.partner.key } }), 404);
  // another vendor's valid key cannot read this building
  await expectStatus(call("GET", path, { headers: { "X-API-Key": fx.other.key } }), 404);
  await expectStatus(call("POST", path, { headers: { "X-API-Key": fx.partner.key }, body: {} }), 403);
});

test("webhook rejects bad signatures, unknown refs and other vendors' jobs", async () => {
  const job = await createJob(fx.partner.vendor.id);
  const payload = { job_id: job.id, status: "accepted" };
  assert.equal((await expectStatus(hook(payload, { secret: "wrong-secret-123" }), 401)).code, "INVALID_SIGNATURE");
  await expectStatus(hook(payload, { signature: "" }), 401);
  await expectStatus(hook(payload, { signature: "sha256=deadbeef" }), 401);
  await expectStatus(hook(payload, { ref: "NOPE-REF" }), 404);
  assert.equal((await jobRow(job.id)).status, "sent", "nothing changed");

  const otherJob = await createJob(fx.other.vendor.id);
  await expectStatus(hook({ job_id: otherJob.id, status: "accepted" }), 404);
  assert.equal((await jobRow(otherJob.id)).status, "sent");

  assert.equal((await expectStatus(hook({ job_id: job.id, status: "teleported" }), 400)).code, "VALIDATION_ERROR");
  await expectStatus(hook({ job_id: job.id, status: "accepted", technician_phone: "12345" }), 400);
  const raw = "{not json";
  await expectStatus(call("POST", `/api/repair/webhooks/renocare/${REF}`, { raw, headers: { "X-Signature": sign(raw) } }), 400);
});

test("webhook applies technician + status, skips through accepted, and is idempotent", async () => {
  const job = await createJob(fx.partner.vendor.id);
  const started = {
    event_id: `evt-${TAG}-1`, job_id: job.id, external_ref: `RC-${TAG}`, status: "in_progress",
    technician: { name: "ช่างสมชาย", phone: "+66 81 234 5678" }, scheduled_at: "2026-11-26T10:00",
  };
  const first = await expectStatus(hook(started), 200);
  assert.deepEqual(first, { received: true, job_id: job.id, status: "in_progress", changed: true });
  let row = await jobRow(job.id);
  assert.equal(row.status, "in_progress");
  assert.ok(row.accepted_at && row.started_at, "accepted step was recorded on the way");
  assert.equal(row.technician_name, "ช่างสมชาย");
  assert.equal(row.technician_phone, "0812345678");
  assert.equal(row.external_ref, `RC-${TAG}`);
  assert.equal(row.status_updated_by, `API: Webhook ${REF}`);

  const replay = await expectStatus(hook(started), 200);
  assert.deepEqual(replay, { received: true, duplicate: true });

  // partners may identify the job by their own ref only
  const done = await expectStatus(hook({ event_id: `evt-${TAG}-2`, external_ref: `RC-${TAG}`, status: "completed", note: "เปลี่ยนคาปาซิเตอร์" }), 200);
  assert.equal(done.status, "done");
  row = await jobRow(job.id);
  assert.equal(row.status, "done");
  assert.equal(row.vendor_note, "เปลี่ยนคาปาซิเตอร์");

  const again = await expectStatus(hook({ event_id: `evt-${TAG}-3`, job_id: job.id, status: "done" }), 200);
  assert.equal(again.changed, false);
  assert.equal((await expectStatus(hook({ event_id: `evt-${TAG}-4`, job_id: job.id, status: "rejected" }), 409)).code, "INVALID_TRANSITION");

  const [events] = await root.query(
    "SELECT result FROM ??.RepairWebhookEvent WHERE vendor_id = ? AND job_id = ? ORDER BY id",
    [MAINTENANCE_DB, fx.partner.vendor.id, job.id],
  );
  assert.deepEqual(events.map((event) => event.result), ["applied", "applied", "ignored"], "failed events are not kept so they can be retried");

  const { events: shown } = await expectStatus(staff("GET", `/vendors/${fx.partner.vendor.id}/integration`), 200);
  assert.ok(shown.some((event) => event.job_id === job.id && event.result === "applied"));
});

test("technician info alone accepts a sent job; rejection without a note still works", async () => {
  const job = await createJob(fx.partner.vendor.id);
  const assigned = await expectStatus(hook({ event_id: `evt-${TAG}-a`, job_id: job.id, technician_name: "ช่างเอ", technician_phone: "0899999999" }), 200);
  assert.equal(assigned.status, "accepted");
  assert.equal((await jobRow(job.id)).technician_phone, "0899999999");

  const other = await createJob(fx.partner.vendor.id);
  await expectStatus(hook({ event_id: `evt-${TAG}-r`, job_id: other.id, status: "declined" }), 200);
  const row = await jobRow(other.id);
  assert.equal(row.status, "rejected");
  assert.ok(row.vendor_note);
});

test("the pull API also accepts technician_phone and returns the new fields", async () => {
  const job = await createJob(fx.partner.vendor.id);
  const { job: updated } = await expectStatus(call("PATCH", `/api/repair/v1/jobs/${job.id}/status`, {
    headers: { "X-API-Key": fx.partner.key },
    body: { status: "accepted", technician_name: "ช่างบี", technician_phone: "089-111-2222" },
  }), 200);
  assert.equal(updated.technician_phone, "0891112222");
  assert.ok("external_ref" in updated);
});

test("removing the integration turns off the owner endpoint and the webhook", async () => {
  await expectStatus(staff("DELETE", `/vendors/${fx.partner.vendor.id}/integration`), 200);
  await expectStatus(call("GET", `/api/repair/v1/buildings/${REF}/owner`, { headers: { "X-API-Key": fx.partner.key } }), 404);
  const job = await createJob(fx.partner.vendor.id);
  await expectStatus(hook({ job_id: job.id, status: "accepted" }), 404);
});
