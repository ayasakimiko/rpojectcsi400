import { validateText, isValidPhone } from "../src/utils/validators.js";
import { MAINTENANCE_CATEGORY_KEYS, MAINTENANCE_TIME_KEYS } from "../src/utils/maintenanceCategories.js";
import { actorOf } from "../middleware/notifications.js";
import { repairVendorStatusChanged } from "./repairNotifications.js";

export class RepairError extends Error {
  constructor(status, message, code = "VALIDATION_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const fail = (message, status = 400, code) => new RepairError(status, message, code);

export const REPAIR_CATEGORIES = MAINTENANCE_CATEGORY_KEYS;
export const REPAIR_TIMES = MAINTENANCE_TIME_KEYS;
export const REPAIR_URGENCY = ["normal", "urgent"];
export const CONTRACT_TYPES = ["monthly", "yearly"];
export const JOB_STATUSES = ["sent", "accepted", "in_progress", "done", "rejected", "cancelled"];
export const OPEN_JOB_STATUSES = ["sent", "accepted", "in_progress"];

export const VENDOR_TRANSITIONS = {
  accepted: { from: ["sent", "accepted"], label: "รับงานแล้ว", tone: "info" },
  rejected: { from: ["sent"], label: "ปฏิเสธงาน", tone: "danger" },
  in_progress: { from: ["accepted", "in_progress"], label: "เริ่มซ่อมแล้ว", tone: "info" },
  done: { from: ["accepted", "in_progress"], label: "ซ่อมเสร็จแล้ว", tone: "success" },
};

const STATUS_FIELDS = ["status", "note", "technician_name", "scheduled_at"];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FEE = 99_999_999.99;

export function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== String(value)) throw fail("ไม่พบข้อมูล", 404, "NOT_FOUND");
  return id;
}

function requireObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("รูปแบบข้อมูลไม่ถูกต้อง");
  return body;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  const error = validateText(value, label, { maxLength });
  if (error) throw fail(error);
  return value.trim();
}

function requiredText(value, label, maxLength) {
  const error = validateText(value, label, { maxLength });
  if (error) throw fail(error);
  return value.trim();
}

function oneOf(value, allowed, label, fallback) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw fail(`กรุณาระบุ${label}`);
  }
  if (!allowed.includes(value)) throw fail(`${label}ไม่ถูกต้อง`);
  return value;
}

function parseDateKey(value, label) {
  if (typeof value !== "string" || !DATE_KEY.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw fail(`${label}ต้องเป็นรูปแบบ YYYY-MM-DD`);
  }
  return value;
}

function parseWebhookUrl(value) {
  const text = optionalText(value, "Webhook URL", 500);
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw fail("Webhook URL ไม่ถูกต้อง");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw fail("Webhook URL ต้องขึ้นต้นด้วย http:// หรือ https://");
  return url.toString();
}

export function validateVendorInput(body) {
  requireObject(body);
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!isValidPhone(phone)) throw fail("เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก");
  const email = optionalText(body.email, "อีเมล", 255);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("รูปแบบอีเมลไม่ถูกต้อง");
  const specialties = Array.isArray(body.specialties) ? [...new Set(body.specialties)] : [];
  if (specialties.length === 0) throw fail("กรุณาเลือกประเภทงานที่ช่างรับซ่อมอย่างน้อย 1 อย่าง");
  if (specialties.some((item) => !REPAIR_CATEGORIES.includes(item))) throw fail("ประเภทงานซ่อมไม่ถูกต้อง");
  const contractStart = parseDateKey(body.contract_start, "วันเริ่มสัญญา");
  const contractEnd = parseDateKey(body.contract_end, "วันสิ้นสุดสัญญา");
  if (contractEnd < contractStart) throw fail("วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่มสัญญา");
  let fee = null;
  if (body.contract_fee !== undefined && body.contract_fee !== null && body.contract_fee !== "") {
    fee = Number(body.contract_fee);
    if (!Number.isFinite(fee) || fee < 0 || fee > MAX_FEE || Math.round(fee * 100) !== fee * 100) throw fail("ค่าสัญญาไม่ถูกต้อง");
  }
  return {
    name: requiredText(body.name, "ชื่อร้าน/บริษัทช่าง", 150),
    contact_name: optionalText(body.contact_name, "ชื่อผู้ติดต่อ", 150),
    phone,
    email,
    specialties: specialties.join(","),
    specialty_other: specialties.includes("other") ? requiredText(body.specialty_other, "รายละเอียดงานประเภทอื่นๆ", 150) : null,
    contract_type: oneOf(body.contract_type, CONTRACT_TYPES, "รูปแบบสัญญา"),
    contract_start: contractStart,
    contract_end: contractEnd,
    contract_fee: fee,
    webhook_url: parseWebhookUrl(body.webhook_url),
    note: optionalText(body.note, "หมายเหตุ", 500),
    is_active: body.is_active === undefined ? true : body.is_active === true,
  };
}

export function validateJobInput(body) {
  requireObject(body);
  const room = Number(body.room_number);
  if (!Number.isSafeInteger(room) || room < 1) throw fail("กรุณาเลือกห้องที่ต้องการซ่อม");
  const vendorId = Number(body.vendor_id);
  if (!Number.isSafeInteger(vendorId) || vendorId < 1) throw fail("กรุณาเลือกช่างที่ต้องการติดต่อ");
  let requestId = null;
  if (body.maintenance_request_id !== undefined && body.maintenance_request_id !== null && body.maintenance_request_id !== "") {
    requestId = Number(body.maintenance_request_id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) throw fail("รายการแจ้งซ่อมไม่ถูกต้อง");
  }
  const phone = typeof body.contact_phone === "string" ? body.contact_phone.trim() : "";
  if (phone && !isValidPhone(phone)) throw fail("เบอร์ติดต่อต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก");
  return {
    vendor_id: vendorId,
    maintenance_request_id: requestId,
    room_number: room,
    category: oneOf(body.category, REPAIR_CATEGORIES, "ประเภทงานซ่อม", "other"),
    urgency: oneOf(body.urgency, REPAIR_URGENCY, "ความเร่งด่วน", "normal"),
    description: requiredText(body.description, "รายละเอียดความเสียหาย", 1000),
    contact_phone: phone || null,
    preferred_time: oneOf(body.preferred_time, REPAIR_TIMES, "ช่วงเวลาที่สะดวก", "anytime"),
  };
}

export function validateJobUpdate(body) {
  requireObject(body);
  const phone = typeof body.contact_phone === "string" ? body.contact_phone.trim() : "";
  if (phone && !isValidPhone(phone)) throw fail("เบอร์ติดต่อต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก");
  return {
    category: oneOf(body.category, REPAIR_CATEGORIES, "ประเภทงานซ่อม"),
    urgency: oneOf(body.urgency, REPAIR_URGENCY, "ความเร่งด่วน"),
    description: requiredText(body.description, "รายละเอียดความเสียหาย", 1000),
    contact_phone: phone || null,
    preferred_time: oneOf(body.preferred_time, REPAIR_TIMES, "ช่วงเวลาที่สะดวก"),
  };
}

function parseSchedule(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
    throw fail("scheduled_at ต้องเป็นรูปแบบ YYYY-MM-DDTHH:mm");
  }
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) throw fail("scheduled_at ไม่ถูกต้อง");
  return date;
}

export function validateStatusInput(body) {
  requireObject(body);
  const unknown = Object.keys(body).filter((field) => !STATUS_FIELDS.includes(field));
  if (unknown.length > 0) {
    throw fail(`แก้ไขฟิลด์นี้ไม่ได้: ${unknown.join(", ")} (ส่งได้เฉพาะ ${STATUS_FIELDS.join(", ")})`, 400, "FIELD_NOT_ALLOWED");
  }
  if (!Object.hasOwn(VENDOR_TRANSITIONS, body.status)) {
    throw fail(`status ต้องเป็นหนึ่งใน ${Object.keys(VENDOR_TRANSITIONS).join(", ")}`);
  }
  const note = optionalText(body.note, "note", 500);
  if (body.status === "rejected" && !note) throw fail("กรุณาระบุเหตุผลที่ปฏิเสธงานใน note");
  return {
    status: body.status,
    note,
    technician_name: body.technician_name === undefined ? undefined : optionalText(body.technician_name, "technician_name", 150),
    scheduled_at: parseSchedule(body.scheduled_at),
  };
}

export function serializeVendor(row) {
  return {
    ...row,
    specialties: row.specialties ? row.specialties.split(",").filter(Boolean) : [],
    contract_fee: row.contract_fee == null ? null : Number(row.contract_fee),
    is_active: Boolean(row.is_active),
    active_keys: Number(row.active_keys || 0),
    open_jobs: Number(row.open_jobs || 0),
    total_jobs: Number(row.total_jobs || 0),
    image_count: Number(row.image_count || 0),
  };
}

export function publicJob(row) {
  return {
    id: row.id,
    room_number: row.room_number,
    category: row.category,
    urgency: row.urgency,
    description: row.description,
    contact_phone: row.contact_phone,
    preferred_time: row.preferred_time,
    status: row.status,
    technician_name: row.technician_name,
    scheduled_at: row.scheduled_at,
    vendor_note: row.vendor_note,
    cancel_reason: row.cancel_reason,
    sent_by_name: row.sent_by_name,
    created_at: row.created_at,
    accepted_at: row.accepted_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    status_updated_at: row.status_updated_at,
    details_updated_at: row.details_updated_at,
  };
}

export async function loadJob(db, jobId, vendorId = null) {
  const [[row]] = await db.query(
    `SELECT j.*, v.name AS vendor_name, v.phone AS vendor_phone, v.contract_type AS vendor_contract_type, v.webhook_url IS NOT NULL AS vendor_has_webhook,
            mr.status AS request_status, mr.created_at AS request_created_at, mr.category AS request_category,
            (SELECT CONCAT(c.first_name, ' ', c.last_name) FROM Customer c WHERE c.room_number = j.room_number AND c.is_suspended = FALSE ORDER BY c.id DESC LIMIT 1) AS tenant_name,
            (SELECT c.phone FROM Customer c WHERE c.room_number = j.room_number AND c.is_suspended = FALSE ORDER BY c.id DESC LIMIT 1) AS tenant_phone
     FROM RepairJob j
     JOIN RepairVendor v ON v.id = j.vendor_id
     LEFT JOIN MaintenanceRequest mr ON mr.id = j.maintenance_request_id
     WHERE j.id = ? AND (? IS NULL OR j.vendor_id = ?)`,
    [jobId, vendorId, vendorId],
  );
  if (!row) throw fail("ไม่พบงานซ่อมนี้", 404, "NOT_FOUND");
  return row;
}

const WEBHOOK_TIMEOUT_MS = 5000;

export async function deliverWebhook(db, vendor, event, job) {
  if (!vendor.webhook_url) return;
  let status = "failed";
  try {
    const response = await fetch(vendor.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Repair-Event": event, "User-Agent": "DormRepairWebhook/1" },
      body: JSON.stringify({ event, sent_at: new Date().toISOString(), job: publicJob(job) }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      redirect: "manual",
    });
    status = response.ok ? "delivered" : "failed";
  } catch (error) {
    console.error(`Repair webhook ${event} job ${job.id} error:`, error.message);
  }
  await db.query("UPDATE RepairJob SET webhook_status = ?, webhook_at = NOW() WHERE id = ?", [status, job.id])
    .catch((error) => console.error("Repair webhook status error:", error.message));
}

async function syncMaintenanceRequest(db, job, status, actor) {
  if (!job.maintenance_request_id || !["accepted", "in_progress", "done"].includes(status)) return;
  const name = actor.actor_name;
  if (status === "done") {
    await db.query(
      `UPDATE MaintenanceRequest
       SET status = 'done', completed_at = NOW(), completed_by_name = ?,
           accepted_at = COALESCE(accepted_at, NOW()), accepted_by_name = COALESCE(accepted_by_name, ?)
       WHERE id = ? AND status IN ('pending', 'in_progress')`,
      [name, name, job.maintenance_request_id],
    );
    return;
  }
  await db.query(
    `UPDATE MaintenanceRequest
     SET status = 'in_progress', accepted_at = COALESCE(accepted_at, NOW()), accepted_by_name = COALESCE(accepted_by_name, ?)
     WHERE id = ? AND status = 'pending'`,
    [name, job.maintenance_request_id],
  );
}

export async function applyVendorStatus(db, job, input, vendor) {
  const transition = VENDOR_TRANSITIONS[input.status];
  if (!transition.from.includes(job.status)) {
    throw fail(`เปลี่ยนสถานะจาก ${job.status} เป็น ${input.status} ไม่ได้`, 409, "INVALID_TRANSITION");
  }
  const actorName = `ช่าง ${vendor.name}`;
  const [result] = await db.query(
    `UPDATE RepairJob
     SET status = ?,
         status_updated_at = NOW(),
         status_updated_by = ?,
         accepted_at = IF(? IN ('accepted', 'done'), COALESCE(accepted_at, NOW()), accepted_at),
         started_at = IF(? = 'in_progress', COALESCE(started_at, NOW()), started_at),
         completed_at = IF(? IN ('done', 'rejected'), COALESCE(completed_at, NOW()), completed_at),
         vendor_note = COALESCE(?, vendor_note),
         technician_name = IF(?, ?, technician_name),
         scheduled_at = IF(?, ?, scheduled_at)
     WHERE id = ? AND vendor_id = ? AND status = ?`,
    [
      input.status, `API: ${vendor.label}`,
      input.status, input.status, input.status,
      input.note,
      input.technician_name !== undefined, input.technician_name ?? null,
      input.scheduled_at !== undefined, input.scheduled_at ?? null,
      job.id, vendor.vendorId, job.status,
    ],
  );
  if (result.affectedRows === 0) throw fail("สถานะงานถูกเปลี่ยนไปแล้ว กรุณาดึงข้อมูลล่าสุด", 409, "CONFLICT");
  const updated = await loadJob(db, job.id, vendor.vendorId);
  const actor = actorOf(null, actorName);
  if (input.status !== job.status) await syncMaintenanceRequest(db, updated, input.status, actor);
  const scheduleChanged = String(updated.scheduled_at ?? "") !== String(job.scheduled_at ?? "")
    || (updated.technician_name ?? "") !== (job.technician_name ?? "");
  await repairVendorStatusChanged(db, updated, actor, { previousStatus: job.status, note: input.note, scheduleChanged });
  return updated;
}
