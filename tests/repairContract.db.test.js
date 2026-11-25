import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { DB_CONFIG, serviceDatabaseName } from "../Database/connection.js";
import { removeVendorFiles } from "../middleware/repairUploads.js";
import { removeContractFiles } from "../router/repairContracts.js";

// Repair contracts end to end through the gateway: vendors submit quotes with X-API-Key,
// staff / the owner approve them, vendors poll the result. Needs the stack on REPAIR_TEST_API_URL.
const API = process.env.REPAIR_TEST_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const WEBHOOK_HOST = process.env.REPAIR_TEST_WEBHOOK_HOST || "host.docker.internal";
const TAG = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const MAINTENANCE_DB = serviceDatabaseName(DB_CONFIG.database, "maintenance");
const AUTH_DB = serviceDatabaseName(DB_CONFIG.database, "auth");
const ROOM_DB = serviceDatabaseName(DB_CONFIG.database, "room");
const OWNER_DB = serviceDatabaseName(DB_CONFIG.database, "owner");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n% repair contract test\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n");
const fx = { vendorIds: [], jobIds: [] };
let root;

async function call(method, url, { token, key, body: input, raw, form: formInput, headers = {} } = {}) {
  const form = formInput ?? (input instanceof FormData ? input : undefined);
  const body = input instanceof FormData ? undefined : input;
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "X-API-Key": key } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: form ?? raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("json") ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, data, type };
}

async function expectStatus(promise, status) {
  const result = await promise;
  assert.equal(result.status, status, JSON.stringify(Buffer.isBuffer(result.data) ? result.type : result.data));
  return result.data;
}

const staff = (method, url, body, token = fx.staff) => call(method, `/api/staff/repair-vendors${url}`, { token, body });
const api = (method, url, key, body) => call(method, `/api/repair/v1${url}`, { key, body });

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
    vendor_id: vendorId, room_number: fx.room, category: "other", urgency: "normal",
    description: `กระเบื้องแตก ${TAG}`, contact_phone: "0822222222", preferred_time: "anytime",
  }), 201);
  fx.jobIds.push(job.id);
  return job;
}

const contractBody = (extra = {}) => ({
  contract_type: "main",
  parent_contract_no: null,
  billing_type: "daily",
  rate: 500,
  period_qty: 1,
  start_date: "2026-11-30",
  end_date: "2026-11-30",
  labor_amount: 500,
  material_amount: 85,
  total_amount: 585,
  terms: "รับประกันงาน 30 วัน",
  items: [{ description: "กระเบื้องพื้น 60x60 ซม.", qty: 1, unit: "แผ่น", unit_price: 85 }],
  installments: [
    { no: 1, description: "มัดจำ 30%", due_date: "2026-11-30", amount: 175.5 },
    { no: 2, description: "ส่วนที่เหลือเมื่อเสร็จงาน", due_date: "2026-11-30", amount: 409.5 },
  ],
  ...extra,
});

const pdfFile = (name = "CT.pdf", bytes = PDF) => ({ file_name: name, mime_type: "application/pdf", data_base64: bytes.toString("base64") });
const contractUrl = (jobId, no) => `/jobs/${jobId}/contracts/${no}`;

before(async () => {
  root = await mysql.createConnection({ ...DB_CONFIG, database: undefined });
  const [[staffRow]] = await root.query("SELECT id FROM ??.Staff WHERE is_suspended = FALSE LIMIT 1", [AUTH_DB]);
  assert.ok(staffRow, "need an active Staff account");
  fx.staff = jwt.sign({ id: staffRow.id, role: "Staff" }, SECRET, { expiresIn: "15m" });
  const [[owner]] = await root.query("SELECT id FROM ??.Owner WHERE is_suspended = FALSE ORDER BY id LIMIT 1", [AUTH_DB]);
  fx.owner = owner && jwt.sign({ id: owner.id, role: "Owner" }, SECRET, { expiresIn: "15m" });
  const [[customer]] = await root.query("SELECT id FROM ??.Customer WHERE is_suspended = FALSE LIMIT 1", [AUTH_DB]);
  fx.customer = customer && jwt.sign({ id: customer.id, role: "Customer" }, SECRET, { expiresIn: "15m" });
  const [[room]] = await root.query("SELECT room_number FROM ??.Room LIMIT 1", [ROOM_DB]);
  fx.room = Number(room.room_number);
  fx.a = await createVendorWithKey("RenoCare สัญญา");
  fx.b = await createVendorWithKey("ช่างอื่น สัญญา");
  fx.jobA = await createJob(fx.a.vendor.id);
  fx.jobB = await createJob(fx.b.vendor.id);
});

after(async () => {
  if (!root) return;
  if (fx.jobIds.length) {
    const [files] = await root.query(
      "SELECT f.stored_name FROM ??.RepairContractFile f JOIN ??.RepairContract c ON c.id = f.contract_id WHERE c.job_id IN (?)",
      [MAINTENANCE_DB, MAINTENANCE_DB, fx.jobIds],
    );
    await removeContractFiles(files.map((row) => row.stored_name));
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

test("a vendor submits a new contract (201) with computed lines and a downloadable file", async () => {
  const no = `CT${TAG}-1`;
  const created = await expectStatus(api("PUT", contractUrl(fx.jobA.id, no), fx.a.key, contractBody({ files: [pdfFile(`${no}.pdf`)] })), 201);
  assert.equal(created.contract_no, no);
  assert.equal(created.status, "pending");
  assert.equal(created.total_amount, 585);
  assert.deepEqual(created.items, [{ description: "กระเบื้องพื้น 60x60 ซม.", qty: 1, unit: "แผ่น", unit_price: 85, line_total: 85 }]);
  assert.deepEqual(created.installments.map((row) => row.amount), [175.5, 409.5]);
  assert.equal(created.start_date, "2026-11-30");
  assert.equal(created.files.length, 1);
  assert.equal(created.files[0].size_bytes, PDF.length);
  assert.ok(!("id" in created), "internal id is not exposed to vendors");
  assert.ok(created.submitted_at && created.updated_at && created.decided_at === null);

  const file = await call("GET", `/api/repair/v1${contractUrl(fx.jobA.id, no)}/files/${created.files[0].file_id}`, { key: fx.a.key });
  assert.equal(file.status, 200);
  assert.ok(file.type.startsWith("application/pdf"));
  assert.ok(Buffer.from(file.data).equals(PDF), "file bytes round-trip unchanged");
  fx.main = created;
});

test("revising a pending contract returns 200, bumps the revision and keeps files when none are sent", async () => {
  const no = fx.main.contract_no;
  const revised = await expectStatus(api("PUT", contractUrl(fx.jobA.id, no), fx.a.key, contractBody({
    period_qty: 2, labor_amount: 1000, total_amount: 1085,
    installments: [{ no: 1, description: "จ่ายครั้งเดียว", due_date: null, amount: 1085 }],
  })), 200);
  assert.equal(revised.revision, 2);
  assert.equal(revised.total_amount, 1085);
  assert.equal(revised.installments.length, 1);
  assert.equal(revised.files.length, 1, "files kept when the field is omitted");
  const [notices] = await root.query(
    "SELECT audience, type FROM ??.Notification WHERE ref_table = 'RepairJob' AND ref_id = ? AND type LIKE 'repair_contract_%'",
    [OWNER_DB, fx.jobA.id],
  );
  assert.ok(notices.some((row) => row.type === "repair_contract_submitted"));
  assert.ok(notices.some((row) => row.type === "repair_contract_revised"));
  assert.ok(notices.every((row) => row.audience !== "customer"), "tenants are never notified about contract prices");
});

test("money that does not add up is rejected with the offending field", async () => {
  const url = contractUrl(fx.jobA.id, `CT${TAG}-BAD`);
  const cases = [
    [{ labor_amount: 499 }, /labor_amount/],
    [{ material_amount: 80, total_amount: 580 }, /material_amount/],
    [{ total_amount: 600 }, /total_amount/],
    [{ installments: [{ no: 1, description: "งวดเดียว", amount: 100 }] }, /installments/],
    [{ end_date: "2026-11-29" }, /end_date/],
    [{ billing_type: "hourly" }, /billing_type/],
    [{ period_qty: 1.5 }, /period_qty/],
    [{ start_date: "2026-02-30" }, /start_date/],
  ];
  for (const [patch, field] of cases) {
    const body = await expectStatus(api("PUT", url, fx.a.key, contractBody(patch)), 400);
    assert.equal(body.code, "VALIDATION_ERROR");
    assert.match(body.message, field);
  }
  await expectStatus(api("PUT", contractUrl(fx.jobA.id, "bad/no"), fx.a.key, contractBody()), 404);
  await expectStatus(api("PUT", contractUrl(fx.jobA.id, "x".repeat(21)), fx.a.key, contractBody()), 400);
  // floating point: 3 × 33.33 = 99.99 must pass
  const precise = await expectStatus(api("PUT", contractUrl(fx.jobA.id, `CT${TAG}-FP`), fx.a.key, contractBody({
    rate: 33.33, period_qty: 3, labor_amount: 99.99, material_amount: 0.3, total_amount: 100.29,
    items: [{ description: "น็อต", qty: 3, unit: "ตัว", unit_price: 0.1 }], installments: [],
  })), 201);
  assert.equal(precise.total_amount, 100.29);
});

test("files are checked for size, type and real content", async () => {
  const url = contractUrl(fx.jobA.id, `CT${TAG}-FILE`);
  const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
  assert.match((await expectStatus(api("PUT", url, fx.a.key, contractBody({ files: [pdfFile("big.pdf", big)] })), 400)).message, /5 MB/);
  assert.match((await expectStatus(api("PUT", url, fx.a.key, contractBody({ files: [{ ...pdfFile(), mime_type: "text/html" }] })), 400)).message, /mime_type/);
  assert.match((await expectStatus(api("PUT", url, fx.a.key, contractBody({ files: [pdfFile("fake.pdf", PNG)] })), 400)).message, /ไม่ตรง/);
  assert.match((await expectStatus(api("PUT", url, fx.a.key, contractBody({ files: [{ ...pdfFile(), data_base64: "@@@" }] })), 400)).message, /base64/);
  const six = Array.from({ length: 6 }, (_, index) => pdfFile(`f${index}.pdf`));
  await expectStatus(api("PUT", url, fx.a.key, contractBody({ files: six })), 400);
  const [[{ count }]] = await root.query("SELECT COUNT(*) AS count FROM ??.RepairContract WHERE job_id = ? AND contract_no = ?", [MAINTENANCE_DB, fx.jobA.id, `CT${TAG}-FILE`]);
  assert.equal(Number(count), 0, "nothing is saved when validation fails");
});

test("a body over the limit is refused with 413 PAYLOAD_TOO_LARGE", async () => {
  const huge = { ...contractBody(), files: [{ file_name: "huge.pdf", mime_type: "application/pdf", data_base64: "A".repeat(17 * 1024 * 1024) }] };
  const body = await expectStatus(api("PUT", contractUrl(fx.jobA.id, `CT${TAG}-HUGE`), fx.a.key, huge), 413);
  assert.equal(body.code, "PAYLOAD_TOO_LARGE");
  // without a valid key the large body is never read
  assert.equal((await api("PUT", contractUrl(fx.jobA.id, `CT${TAG}-HUGE`), "rpk_bad", huge)).status, 401);
});

test("large files can be added separately as multipart, up to 5 per contract", async () => {
  const no = fx.main.contract_no;
  const form = new FormData();
  form.append("files", new Blob([PDF], { type: "application/pdf" }), "quote-page2.pdf");
  form.append("files", new Blob([PNG], { type: "image/png" }), "site.png");
  const added = await expectStatus(call("POST", `/api/repair/v1${contractUrl(fx.jobA.id, no)}/files`, { key: fx.a.key, form }), 201);
  assert.equal(added.files.length, 3);
  assert.deepEqual(added.files.map((file) => file.mime_type).sort(), ["application/pdf", "application/pdf", "image/png"]);

  const tooMany = new FormData();
  for (let index = 0; index < 3; index += 1) tooMany.append("files", new Blob([PDF], { type: "application/pdf" }), `x${index}.pdf`);
  assert.match((await expectStatus(call("POST", `/api/repair/v1${contractUrl(fx.jobA.id, no)}/files`, { key: fx.a.key, form: tooMany }), 400)).message, /ไม่เกิน 5/);

  const fake = new FormData();
  fake.append("files", new Blob([PNG], { type: "application/pdf" }), "fake.pdf");
  await expectStatus(call("POST", `/api/repair/v1${contractUrl(fx.jobA.id, no)}/files`, { key: fx.a.key, form: fake }), 400);
  const word = new FormData();
  word.append("files", new Blob(["hello"], { type: "application/msword" }), "a.doc");
  await expectStatus(call("POST", `/api/repair/v1${contractUrl(fx.jobA.id, no)}/files`, { key: fx.a.key, form: word }), 400);
});

test("a vendor cannot see or touch another vendor's job or contract files (404)", async () => {
  await expectStatus(api("PUT", contractUrl(fx.jobB.id, `CT${TAG}-X`), fx.a.key, contractBody()), 404);
  await expectStatus(api("GET", `/jobs/${fx.jobA.id}/contracts`, fx.b.key), 404);
  await expectStatus(api("GET", `${contractUrl(fx.jobA.id, fx.main.contract_no)}/files/${fx.main.files[0].file_id}`, fx.b.key), 404);
  await expectStatus(api("POST", `${contractUrl(fx.jobA.id, fx.main.contract_no)}/cancel`, fx.b.key, { reason: "x" }), 404);
  const { contracts } = await expectStatus(api("GET", "/contracts", fx.b.key), 200);
  assert.ok(contracts.every((contract) => contract.job_id !== fx.jobA.id), "list is scoped to the calling vendor");
});

test("staff see contracts; tenants cannot reach them", async () => {
  const { contracts } = await expectStatus(staff("GET", `/jobs/${fx.jobA.id}/contracts`), 200);
  const main = contracts.find((contract) => contract.contract_no === fx.main.contract_no);
  assert.ok(main && main.id, "staff get the internal id to decide on");
  fx.mainId = main.id;
  const file = await call("GET", `/api/staff/repair-vendors/contract-files/${main.files[0].file_id}`, { token: fx.staff });
  assert.equal(file.status, 200);
  const { jobs } = await expectStatus(staff("GET", "/overview"), 200);
  assert.ok(Number(jobs.find((job) => job.id === fx.jobA.id).pending_contracts) >= 1);
  if (fx.customer) {
    const denied = await call("GET", `/api/staff/repair-vendors/jobs/${fx.jobA.id}/contracts`, { token: fx.customer });
    assert.ok([401, 403].includes(denied.status), `tenant got ${denied.status}`);
  }
});

test("approving locks the contract (409) and the vendor sees the decision; webhook is signed", async () => {
  // capture contract.decided on a local server the maintenance container can reach
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.end("ok");
    });
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  const secret = `whsec_${TAG}_contract`;
  await expectStatus(staff("PUT", `/vendors/${fx.a.vendor.id}/integration`, { building_ref: `C-${TAG}`, webhook_secret: secret }), 200);
  await root.query("UPDATE ??.RepairVendor SET webhook_url = ? WHERE id = ?", [MAINTENANCE_DB, `http://${WEBHOOK_HOST}:${server.address().port}/hook`, fx.a.vendor.id]);
  const since = new Date(Date.now() - 1000).toISOString();
  try {
    const decided = await expectStatus(staff("POST", `/contracts/${fx.mainId}/decision`, { decision: "approved" }), 200);
    assert.equal(decided.contract.status, "approved");
    assert.ok(decided.contract.decided_by_name);
  } finally {
    await root.query("UPDATE ??.RepairVendor SET webhook_url = NULL WHERE id = ?", [MAINTENANCE_DB, fx.a.vendor.id]);
    server.close();
  }
  const hook = received.find((item) => item.headers["x-repair-event"] === "contract.decided");
  if (hook) {
    assert.equal(hook.headers["x-signature"], `sha256=${createHmac("sha256", secret).update(hook.body).digest("hex")}`);
    const payload = JSON.parse(hook.body);
    assert.equal(payload.job_id, fx.jobA.id);
    assert.equal(payload.contract.status, "approved");
  } else {
    console.warn(`contract.decided webhook not received (is ${WEBHOOK_HOST} reachable from the container?)`);
  }

  const { contracts } = await expectStatus(api("GET", `/jobs/${fx.jobA.id}/contracts`, fx.a.key), 200);
  assert.equal(contracts.find((contract) => contract.contract_no === fx.main.contract_no).status, "approved");
  const polled = await expectStatus(api("GET", `/contracts?updated_since=${encodeURIComponent(since)}`, fx.a.key), 200);
  assert.ok(polled.server_time);
  assert.ok(polled.contracts.some((contract) => contract.contract_no === fx.main.contract_no && contract.status === "approved"));

  const locked = await expectStatus(api("PUT", contractUrl(fx.jobA.id, fx.main.contract_no), fx.a.key, contractBody()), 409);
  assert.equal(locked.code, "CONTRACT_LOCKED");
  assert.equal((await expectStatus(api("POST", `${contractUrl(fx.jobA.id, fx.main.contract_no)}/cancel`, fx.a.key, { reason: "x" }), 409)).code, "CONTRACT_LOCKED");
  await expectStatus(staff("POST", `/contracts/${fx.mainId}/decision`, { decision: "rejected", note: "ช้าไป" }), 409);
  const form = new FormData();
  form.append("files", new Blob([PDF], { type: "application/pdf" }), "late.pdf");
  await expectStatus(call("POST", `/api/repair/v1${contractUrl(fx.jobA.id, fx.main.contract_no)}/files`, { key: fx.a.key, form }), 409);
});

test("an addendum needs an approved parent contract", async () => {
  const addendum = contractBody({ contract_type: "addendum", parent_contract_no: `CT${TAG}-FP` });
  assert.match((await expectStatus(api("PUT", contractUrl(fx.jobA.id, `CT${TAG}-AD`), fx.a.key, addendum), 400)).message, /parent_contract_no/);
  await expectStatus(api("PUT", contractUrl(fx.jobA.id, `CT${TAG}-AD`), fx.a.key, contractBody({ contract_type: "addendum" })), 400);
  const ok = await expectStatus(api("PUT", contractUrl(fx.jobA.id, `CT${TAG}-AD`), fx.a.key, contractBody({ contract_type: "addendum", parent_contract_no: fx.main.contract_no })), 201);
  assert.equal(ok.parent_contract_no, fx.main.contract_no);
});

test("rejecting needs a reason; the owner may decide but still cannot run other staff actions", async () => {
  const { contracts } = await expectStatus(staff("GET", `/jobs/${fx.jobA.id}/contracts`), 200);
  const fp = contracts.find((contract) => contract.contract_no === `CT${TAG}-FP`);
  await expectStatus(staff("POST", `/contracts/${fp.id}/decision`, { decision: "rejected" }), 400);
  await expectStatus(staff("POST", `/contracts/${fp.id}/decision`, { decision: "maybe" }), 400);
  if (!fx.owner) return;
  const rejected = await expectStatus(staff("POST", `/contracts/${fp.id}/decision`, { decision: "rejected", note: "ราคาสูงเกินไป" }, fx.owner), 200);
  assert.equal(rejected.contract.status, "rejected");
  assert.equal(rejected.contract.decision_note, "ราคาสูงเกินไป");
  const ownerJob = await staff("POST", "/jobs", { vendor_id: fx.a.vendor.id, room_number: fx.room, description: "x" }, fx.owner);
  assert.equal(ownerJob.status, 403);
  const vendorView = await expectStatus(api("GET", `/contracts?status=rejected&job_id=${fx.jobA.id}`, fx.a.key), 200);
  assert.deepEqual(vendorView.contracts.map((contract) => contract.contract_no), [`CT${TAG}-FP`]);
});

test("a vendor cancels a pending contract (200) but not twice", async () => {
  const no = `CT${TAG}-AD`;
  await expectStatus(api("POST", `${contractUrl(fx.jobA.id, no)}/cancel`, fx.a.key, {}), 400);
  const cancelled = await expectStatus(api("POST", `${contractUrl(fx.jobA.id, no)}/cancel`, fx.a.key, { reason: "ออกสัญญาใหม่แทน" }), 200);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancel_reason, "ออกสัญญาใหม่แทน");
  await expectStatus(api("POST", `${contractUrl(fx.jobA.id, no)}/cancel`, fx.a.key, { reason: "อีกครั้ง" }), 409);
  await expectStatus(api("POST", `${contractUrl(fx.jobA.id, "NOPE")}/cancel`, fx.a.key, { reason: "x" }), 404);
});

test("no new contracts once the job is closed (409 INVALID_JOB_STATUS)", async () => {
  const job = await createJob(fx.a.vendor.id);
  await expectStatus(api("PUT", contractUrl(job.id, `CT${TAG}-P`), fx.a.key, contractBody()), 201);
  await expectStatus(staff("POST", `/jobs/${job.id}/cancel`, { reason: "ผู้เช่าย้ายออก" }), 200);
  assert.equal((await expectStatus(api("PUT", contractUrl(job.id, `CT${TAG}-Q`), fx.a.key, contractBody()), 409)).code, "INVALID_JOB_STATUS");
  const { contracts } = await expectStatus(staff("GET", `/jobs/${job.id}/contracts`), 200);
  assert.equal((await expectStatus(staff("POST", `/contracts/${contracts[0].id}/decision`, { decision: "approved" }), 409)).code, "INVALID_JOB_STATUS");
});
