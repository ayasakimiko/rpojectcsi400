import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import http from "node:http";
import { encryptApiKey } from "../middleware/marketApiKey.js";
import { normalizePartnerPayload, verifySignature } from "../router/RepairPartnerWebhook.js";
import { deliverWebhook, normalizePhone, signWebhookBody } from "../router/repairVendorShared.js";

const SECRET = "whsec_test_1234567890";
const sign = (body, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

test("signWebhookBody matches sha256=HMAC(secret, body)", () => {
  const body = JSON.stringify({ job_id: 1, status: "done" });
  assert.equal(signWebhookBody(SECRET, body), sign(body));
});

test("verifySignature accepts only the exact body and secret", () => {
  const body = Buffer.from('{"job_id":1,"status":"done"}');
  assert.equal(verifySignature(SECRET, body, sign(body)), true);
  assert.equal(verifySignature(SECRET, body, sign(body).toUpperCase().replace("SHA256=", "sha256=")), true, "hex case does not matter");
  assert.equal(verifySignature(SECRET, body, ` ${sign(body)} `), true, "surrounding spaces are ignored");
  assert.equal(verifySignature(SECRET, Buffer.from('{"job_id":1, "status":"done"}'), sign(body)), false, "re-serialised body");
  assert.equal(verifySignature(SECRET, body, sign(body, "other-secret")), false, "wrong secret");
  assert.equal(verifySignature(SECRET, body, sign(body).slice("sha256=".length)), false, "missing sha256= prefix");
  assert.equal(verifySignature(SECRET, body, undefined), false);
  assert.equal(verifySignature(SECRET, body, "sha256=xyz"), false);
});

test("normalizePartnerPayload reads snake_case, camelCase and nested technician", () => {
  assert.deepEqual(
    normalizePartnerPayload({ job_id: 12, status: "in_progress", technician: { name: "สมชาย", phone: "081-234-5678" }, event_id: "evt_1" }),
    { eventId: "evt_1", jobId: 12, externalRef: undefined, status: "in_progress", note: undefined, technician_name: "สมชาย", technician_phone: "081-234-5678", scheduled_at: undefined },
  );
  const camel = normalizePartnerPayload({ jobId: "7", status: "Completed", technicianName: "A", technicianPhone: 812345678, externalRef: "RC-9" });
  assert.equal(camel.jobId, 7);
  assert.equal(camel.status, "done");
  assert.equal(camel.technician_phone, "812345678");
  assert.equal(camel.externalRef, "RC-9");
  assert.equal(normalizePartnerPayload({ job: { id: 3, status: "assigned" } }).status, "accepted");
  assert.equal(normalizePartnerPayload({ external_ref: "RC-1", status: "declined" }).status, "rejected");
  assert.equal(normalizePartnerPayload({ job_id: 1 }).status, undefined, "status is optional");
});

test("normalizePartnerPayload rejects unusable payloads", () => {
  assert.throws(() => normalizePartnerPayload([]), /รูปแบบข้อมูล/);
  assert.throws(() => normalizePartnerPayload({ status: "done" }), /job_id/);
  assert.throws(() => normalizePartnerPayload({ job_id: "abc", status: "done" }), /job_id/);
  assert.throws(() => normalizePartnerPayload({ job_id: 1, status: "teleported" }), /ไม่รู้จักสถานะ/);
  assert.throws(() => normalizePartnerPayload({ external_ref: "x".repeat(101) }), /external_ref/);
});

test("normalizePhone accepts common Thai formats", () => {
  assert.equal(normalizePhone("081-234-5678"), "0812345678");
  assert.equal(normalizePhone("+66 81 234 5678"), "0812345678");
  assert.equal(normalizePhone("02 123 4567"), "021234567");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(undefined), undefined);
  assert.throws(() => normalizePhone("12345"), /technician_phone/);
});

async function captureWebhook(run) {
  let received;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received = { headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      res.end("ok");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/hook`);
  } finally {
    server.close();
  }
  return received;
}

function fakeDb(integrationRow) {
  const updates = [];
  return {
    updates,
    async query(sql, params) {
      if (sql.includes("FROM RepairVendorIntegration")) return [[integrationRow].filter(Boolean)];
      updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
}

const JOB = { id: 55, room_number: 101, category: "aircon", urgency: "normal", description: "แอร์ไม่เย็น", status: "sent", created_at: "2026-11-25T00:00:00Z" };

test("outbound webhook is signed and carries the partner apiKey when an integration is set", async () => {
  const db = fakeDb({ partner_api_key_cipher: encryptApiKey("partner-key-abc"), webhook_secret_cipher: encryptApiKey(SECRET) });
  const received = await captureWebhook((url) => deliverWebhook(db, { id: 9, webhook_url: url }, "job.created", JOB));
  assert.equal(received.headers["x-signature"], sign(received.body), "signature covers the exact bytes sent");
  assert.equal(received.headers["x-api-key"], "partner-key-abc");
  assert.equal(received.headers["x-repair-event"], "job.created");
  const payload = JSON.parse(received.body);
  assert.equal(payload.job.id, 55);
  assert.ok("technician_phone" in payload.job && "external_ref" in payload.job);
  assert.deepEqual(db.updates.at(-1).params, ["delivered", 55]);
});

test("outbound webhook stays unsigned for vendors without an integration", async () => {
  const db = fakeDb(null);
  const received = await captureWebhook((url) => deliverWebhook(db, { id: 9, webhook_url: url }, "job.updated", JOB));
  assert.equal(received.headers["x-signature"], undefined);
  assert.equal(received.headers["x-api-key"], undefined);
});
