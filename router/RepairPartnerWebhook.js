import { createHash, timingSafeEqual } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { decryptApiKey, sendApiError } from "../middleware/marketApiKey.js";
import {
  RepairError,
  applyVendorStatus,
  fail,
  loadJob,
  signWebhookBody,
  validateStatusInput,
} from "./repairVendorShared.js";

// Partner systems (RenoCare) push technician / status updates here instead of calling
// PATCH /api/repair/v1/jobs/:id/status. Each request is signed with the webhookSecret
// the partner gave us: X-Signature: sha256=<hex HMAC-SHA256(secret, raw body)>.

export const BUILDING_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;
const SIGNATURE_PATTERN = /^sha256=[0-9a-f]{64}$/i;
const FINAL_STATUSES = ["done", "rejected", "cancelled"];

// partner wording -> our VENDOR_TRANSITIONS keys
const STATUS_ALIASES = {
  accepted: "accepted", accept: "accepted", assigned: "accepted", confirmed: "accepted", scheduled: "accepted",
  in_progress: "in_progress", "in-progress": "in_progress", inprogress: "in_progress", started: "in_progress", working: "in_progress", on_site: "in_progress",
  done: "done", completed: "done", complete: "done", finished: "done", resolved: "done",
  rejected: "rejected", reject: "rejected", declined: "rejected", cancelled: "rejected", canceled: "rejected",
};

export function verifySignature(secret, rawBody, header) {
  if (typeof header !== "string" || !SIGNATURE_PATTERN.test(header.trim())) return false;
  const expected = Buffer.from(signWebhookBody(secret, rawBody));
  const actual = Buffer.from(header.trim().toLowerCase());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const pick = (...values) => values.find((value) => value !== undefined);

function text(value) {
  if (value === undefined || value === null) return value;
  return typeof value === "number" ? String(value) : value;
}

/** turns the partner payload (snake_case, camelCase or nested technician) into our field names */
export function normalizePartnerPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("รูปแบบข้อมูลไม่ถูกต้อง");
  const job = body.job && typeof body.job === "object" ? body.job : {};
  const tech = body.technician && typeof body.technician === "object" ? body.technician : {};
  const rawStatus = pick(body.status, job.status);
  let status;
  if (rawStatus !== undefined && rawStatus !== null && rawStatus !== "") {
    status = STATUS_ALIASES[String(rawStatus).trim().toLowerCase()];
    if (!status) throw fail(`ไม่รู้จักสถานะ "${rawStatus}" (ใช้ได้: accepted, in_progress, done, rejected)`);
  }
  const rawJobId = pick(body.job_id, body.jobId, job.id, body.reference);
  let jobId = null;
  if (rawJobId !== undefined && rawJobId !== null && rawJobId !== "") {
    jobId = Number(rawJobId);
    if (!Number.isSafeInteger(jobId) || jobId < 1) throw fail("job_id ไม่ถูกต้อง");
  }
  const externalRef = text(pick(body.external_ref, body.externalRef, body.partner_job_id, body.ticket_id, job.external_ref));
  if (externalRef !== undefined && externalRef !== null && (typeof externalRef !== "string" || externalRef.length > 100)) {
    throw fail("external_ref ต้องเป็นข้อความไม่เกิน 100 ตัวอักษร");
  }
  if (!jobId && !externalRef) throw fail("กรุณาส่ง job_id (เลขงานที่เราส่งไป) หรือ external_ref");
  const eventId = text(pick(body.event_id, body.eventId));
  return {
    eventId: typeof eventId === "string" && eventId.trim() ? eventId.trim().slice(0, 200) : null,
    jobId,
    externalRef: externalRef?.trim() || undefined,
    status,
    note: pick(body.note, body.message, body.reason),
    technician_name: pick(tech.name, body.technician_name, body.technicianName),
    technician_phone: text(pick(tech.phone, body.technician_phone, body.technicianPhone)),
    scheduled_at: pick(body.scheduled_at, body.scheduledAt, body.appointment_at),
  };
}

async function loadIntegration(db, ref) {
  const [[row]] = await db.query(
    `SELECT i.vendor_id, i.webhook_secret_cipher, v.name
     FROM RepairVendorIntegration i
     JOIN RepairVendor v ON v.id = i.vendor_id
     WHERE i.building_ref = ? AND v.is_active = TRUE
       AND v.contract_start <= CURDATE() AND v.contract_end >= CURDATE()`,
    [ref],
  );
  return row ?? null;
}

async function findJob(db, vendorId, payload) {
  if (payload.jobId) return loadJob(db, payload.jobId, vendorId);
  const [[row]] = await db.query(
    "SELECT id FROM RepairJob WHERE vendor_id = ? AND external_ref = ? ORDER BY id DESC LIMIT 1",
    [vendorId, payload.externalRef],
  );
  if (!row) throw fail("ไม่พบงานซ่อมที่ตรงกับ external_ref นี้", 404, "NOT_FOUND");
  return loadJob(db, row.id, vendorId);
}

function targetStatus(job, payload) {
  if (payload.status) return payload.status;
  const hasTechnician = payload.technician_name !== undefined || payload.technician_phone !== undefined;
  if (job.status === "sent" && hasTechnician) return "accepted";
  if (["accepted", "in_progress"].includes(job.status)) return job.status;
  throw fail("กรุณาส่ง status ของงาน", 400);
}

function statusBody(payload, status) {
  const body = { status };
  for (const field of ["note", "technician_name", "technician_phone", "scheduled_at"]) {
    if (payload[field] !== undefined) body[field] = payload[field];
  }
  if (status === "rejected" && !body.note) body.note = "ช่างปฏิเสธงานผ่านระบบของผู้รับเหมา";
  return body;
}

async function applyPartnerUpdate(db, vendor, job, payload) {
  const target = targetStatus(job, payload);
  if (FINAL_STATUSES.includes(job.status)) {
    if (job.status === target) return { job, changed: false };
    throw fail(`งานนี้ปิดไปแล้ว (สถานะ ${job.status}) เปลี่ยนเป็น ${target} ไม่ได้`, 409, "INVALID_TRANSITION");
  }
  const input = { ...validateStatusInput(statusBody(payload, target)), external_ref: payload.externalRef };
  let current = job;
  // partners often skip "accepted"; walk through it so timestamps and notifications stay complete
  if (current.status === "sent" && ["in_progress", "done"].includes(target)) {
    current = await applyVendorStatus(db, current, { ...input, status: "accepted", note: null }, vendor);
  }
  current = await applyVendorStatus(db, current, input, vendor);
  return { job: current, changed: true };
}

export async function repairPartnerWebhook(req, res) {
  const db = getPool();
  const ref = req.params.ref;
  if (!BUILDING_REF_PATTERN.test(ref)) return sendApiError(res, 404, "NOT_FOUND", "ไม่พบอาคารนี้");
  const integration = await loadIntegration(db, ref);
  if (!integration) return sendApiError(res, 404, "NOT_FOUND", "ไม่พบอาคารนี้ หรือสัญญาช่างไม่อยู่ในช่วงที่ใช้งานได้");
  let secret;
  try {
    secret = integration.webhook_secret_cipher ? decryptApiKey(integration.webhook_secret_cipher) : null;
  } catch {
    secret = null;
  }
  if (!secret) return sendApiError(res, 409, "NOT_CONFIGURED", "หอพักยังไม่ได้ตั้งค่า webhookSecret สำหรับอาคารนี้");

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySignature(secret, raw, req.headers["x-signature"])) {
    return sendApiError(res, 401, "INVALID_SIGNATURE", "X-Signature ไม่ถูกต้อง");
  }

  let payload;
  try {
    payload = normalizePartnerPayload(JSON.parse(raw.toString("utf8")));
  } catch (error) {
    if (error instanceof RepairError) throw error;
    throw fail("รูปแบบ JSON ไม่ถูกต้อง");
  }

  const eventId = payload.eventId ?? req.headers["x-event-id"];
  const eventKey = createHash("sha256")
    .update(typeof eventId === "string" && eventId ? `id:${eventId}` : raw)
    .digest("hex");
  const [claim] = await db.query(
    "INSERT IGNORE INTO RepairWebhookEvent (vendor_id, event_key) VALUES (?, ?)",
    [integration.vendor_id, eventKey],
  );
  if (claim.affectedRows === 0) return res.json({ received: true, duplicate: true });

  try {
    const job = await findJob(db, integration.vendor_id, payload);
    const vendor = { vendorId: integration.vendor_id, name: integration.name, label: `Webhook ${ref}` };
    const result = await applyPartnerUpdate(db, vendor, job, payload);
    await db.query(
      "UPDATE RepairWebhookEvent SET job_id = ?, status = ?, result = ? WHERE id = ?",
      [result.job.id, result.job.status, result.changed ? "applied" : "ignored", claim.insertId],
    );
    return res.json({ received: true, job_id: result.job.id, status: result.job.status, changed: result.changed });
  } catch (error) {
    // let the partner retry the same event after a fix
    await db.query("DELETE FROM RepairWebhookEvent WHERE id = ?", [claim.insertId]).catch(() => {});
    throw error;
  }
}
