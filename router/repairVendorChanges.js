import { validateText } from "../src/utils/validators.js";
import { VENDOR_CHANGE_FIELDS } from "../src/utils/repairVendorChanges.js";
import { actorOf } from "../middleware/notifications.js";
import { fail, postVendorWebhook, validateVendorInput } from "./repairVendorShared.js";
import { repairVendorChangeNotice } from "./repairNotifications.js";

// A vendor asks to change its own details / contract terms through the Repair API.
// The request waits as "pending" until staff or the owner approve (applied to RepairVendor) or reject it.
export const CHANGE_STATUSES = ["pending", "approved", "rejected", "cancelled"];
const LIST_LIMIT = 200;
const TOP_FIELDS = ["changes", "reason"];

const VENDOR_COLUMNS = `id, name, contact_name, phone, email, specialties, specialty_other, contract_type,
  DATE_FORMAT(contract_start, '%Y-%m-%d') AS contract_start, DATE_FORMAT(contract_end, '%Y-%m-%d') AS contract_end,
  contract_fee, webhook_url, note, is_active`;

const CHANGE_COLUMNS = `id, vendor_id, status, changes, previous, reason, requested_by, created_at, updated_at,
  decided_at, decided_by_name, decision_note, cancelled_at, cancel_reason`;

/** the vendor row in the same shape the API exposes (specialties as an array, fee as a number) */
export function editableOf(row) {
  return {
    name: row.name,
    contact_name: row.contact_name ?? null,
    phone: row.phone,
    email: row.email ?? null,
    specialties: typeof row.specialties === "string" ? row.specialties.split(",").filter(Boolean) : [...(row.specialties || [])],
    specialty_other: row.specialty_other ?? null,
    contract_type: row.contract_type,
    contract_start: row.contract_start,
    contract_end: row.contract_end,
    contract_fee: row.contract_fee == null ? null : Number(row.contract_fee),
  };
}

const keepDormFields = (row) => ({ webhook_url: row.webhook_url ?? null, note: row.note ?? null, is_active: Boolean(row.is_active) });

function sameValue(field, a, b) {
  if (field === "specialties") return [...(a || [])].sort().join(",") === [...(b || [])].sort().join(",");
  if (field === "contract_fee") return (a == null && b == null) || Number(a) === Number(b);
  return String(a ?? "") === String(b ?? "");
}

function optionalReason(value, label) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  const error = validateText(value, label, { maxLength: 500 });
  if (error) throw fail(error);
  return value.trim();
}

/**
 * Validates a change request against the vendor's current row. Pure: no DB.
 * Returns only the fields that actually change, with their new and current values.
 */
export function buildVendorChange(row, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("รูปแบบข้อมูลไม่ถูกต้อง");
  const unknownTop = Object.keys(body).filter((key) => !TOP_FIELDS.includes(key));
  if (unknownTop.length) throw fail(`ส่งได้เฉพาะ changes และ reason (พบ ${unknownTop.join(", ")})`, 400, "FIELD_NOT_ALLOWED");
  const requested = body.changes;
  if (!requested || typeof requested !== "object" || Array.isArray(requested)) {
    throw fail("กรุณาส่ง changes เป็น object ของฟิลด์ที่ต้องการแก้ เช่น { \"changes\": { \"phone\": \"0812345678\" } }");
  }
  const unknown = Object.keys(requested).filter((key) => !VENDOR_CHANGE_FIELDS.includes(key));
  if (unknown.length) {
    throw fail(`ขอแก้ฟิลด์นี้ไม่ได้: ${unknown.join(", ")} (ขอแก้ได้เฉพาะ ${VENDOR_CHANGE_FIELDS.join(", ")})`, 400, "FIELD_NOT_ALLOWED");
  }
  if (Object.keys(requested).length === 0) throw fail("กรุณาระบุอย่างน้อย 1 ฟิลด์ใน changes");
  const current = editableOf(row);
  const next = editableOf(validateVendorInput({ ...current, ...keepDormFields(row), ...requested }));
  const changes = {};
  const previous = {};
  for (const field of VENDOR_CHANGE_FIELDS) {
    if (sameValue(field, next[field], current[field])) continue;
    changes[field] = next[field];
    previous[field] = current[field];
  }
  if (Object.keys(changes).length === 0) throw fail("ข้อมูลที่ขอแก้ตรงกับข้อมูลปัจจุบันอยู่แล้ว", 400, "NO_CHANGES");
  return { changes, previous, reason: optionalReason(body.reason, "เหตุผลที่ขอแก้ไข") };
}

/** the vendor row after applying an approved request; re-validated because the row may have changed since */
export function applyVendorChange(row, changes) {
  const known = Object.fromEntries(Object.entries(changes).filter(([field]) => VENDOR_CHANGE_FIELDS.includes(field)));
  return validateVendorInput({ ...editableOf(row), ...keepDormFields(row), ...known });
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

export function publicChange(row) {
  return {
    id: row.id,
    status: row.status,
    changes: parseJson(row.changes),
    previous: parseJson(row.previous),
    reason: row.reason,
    requested_by: row.requested_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    decided_at: row.decided_at,
    decided_by_name: row.decided_by_name,
    decision_note: row.decision_note,
    cancelled_at: row.cancelled_at,
    cancel_reason: row.cancel_reason,
  };
}

async function withTransaction(db, run) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function lockVendor(connection, vendorId) {
  const [[row]] = await connection.query(`SELECT ${VENDOR_COLUMNS} FROM RepairVendor WHERE id = ? FOR UPDATE`, [vendorId]);
  if (!row) throw fail("ไม่พบช่างรายนี้", 404, "NOT_FOUND");
  return row;
}

function requirePending(request) {
  if (request.status !== "pending") {
    const label = { approved: "อนุมัติไปแล้ว", rejected: "ไม่อนุมัติไปแล้ว", cancelled: "ถูกยกเลิกไปแล้ว" }[request.status] || request.status;
    throw fail(`คำขอนี้${label} เปลี่ยนแปลงไม่ได้`, 409, "CHANGE_LOCKED");
  }
}

export async function listVendorChanges(db, { vendorId, status, updatedSinceMs, limit = LIST_LIMIT } = {}) {
  const where = [];
  const params = [];
  if (vendorId) { where.push("vendor_id = ?"); params.push(vendorId); }
  if (status) { where.push("status = ?"); params.push(status); }
  if (updatedSinceMs != null) { where.push("updated_at >= FROM_UNIXTIME(?)"); params.push(Math.floor(updatedSinceMs / 1000)); }
  const [rows] = await db.query(
    `SELECT ${CHANGE_COLUMNS} FROM RepairVendorChangeRequest
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${updatedSinceMs != null ? "updated_at, id" : "id DESC"}
     LIMIT ?`,
    [...params, limit],
  );
  return rows.map(publicChange);
}

export async function loadVendorChange(db, requestId, vendorId = null) {
  const [[row]] = await db.query(
    `SELECT ${CHANGE_COLUMNS} FROM RepairVendorChangeRequest WHERE id = ? AND (? IS NULL OR vendor_id = ?)`,
    [requestId, vendorId, vendorId],
  );
  if (!row) throw fail("ไม่พบคำขอแก้ไขนี้", 404, "NOT_FOUND");
  return publicChange(row);
}

const vendorActor = (vendor) => actorOf(null, `ช่าง ${vendor.name}`);

/** vendor side (API key): one pending request per vendor at a time */
export async function createVendorChange(db, { vendor, body }) {
  const { requestId, vendorRow } = await withTransaction(db, async (connection) => {
    const row = await lockVendor(connection, vendor.vendorId);
    const [[pending]] = await connection.query(
      "SELECT id FROM RepairVendorChangeRequest WHERE vendor_id = ? AND status = 'pending' LIMIT 1",
      [vendor.vendorId],
    );
    if (pending) {
      throw fail(`มีคำขอแก้ไข #${pending.id} รอหอพักอนุมัติอยู่ ยกเลิกคำขอเดิมก่อนหรือรอผล`, 409, "CHANGE_REQUEST_PENDING");
    }
    const input = buildVendorChange(row, body);
    const [result] = await connection.query(
      "INSERT INTO RepairVendorChangeRequest (vendor_id, changes, previous, reason, requested_by) VALUES (?, ?, ?, ?, ?)",
      [vendor.vendorId, JSON.stringify(input.changes), JSON.stringify(input.previous), input.reason, `API: ${vendor.label}`],
    );
    return { requestId: result.insertId, vendorRow: row };
  });
  const request = await loadVendorChange(db, requestId);
  await repairVendorChangeNotice(db, vendorRow, request, vendorActor(vendorRow), "requested");
  return request;
}

export async function cancelVendorChange(db, { vendor, requestId, reason }) {
  const cancelReason = optionalReason(reason, "เหตุผลที่ยกเลิก");
  const [result] = await db.query(
    `UPDATE RepairVendorChangeRequest SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ?
     WHERE id = ? AND vendor_id = ? AND status = 'pending'`,
    [cancelReason, requestId, vendor.vendorId],
  );
  const request = await loadVendorChange(db, requestId, vendor.vendorId);
  if (result.affectedRows === 0) requirePending(request);
  const [[row]] = await db.query(`SELECT ${VENDOR_COLUMNS} FROM RepairVendor WHERE id = ?`, [vendor.vendorId]);
  await repairVendorChangeNotice(db, row, request, vendorActor(row), "cancelled");
  return request;
}

/** dorm side (staff / owner): approving writes the requested fields to RepairVendor */
export async function decideVendorChange(db, { requestId, decision, note, actor }) {
  if (!["approved", "rejected"].includes(decision)) throw fail("decision ต้องเป็น approved หรือ rejected");
  const decisionNote = decision === "rejected"
    ? (() => {
      const error = validateText(note, "เหตุผลที่ไม่อนุมัติ", { maxLength: 500 });
      if (error) throw fail(error);
      return note.trim();
    })()
    : optionalReason(note, "หมายเหตุ");
  const vendorId = await withTransaction(db, async (connection) => {
    const [[request]] = await connection.query(
      "SELECT id, vendor_id, status, changes FROM RepairVendorChangeRequest WHERE id = ? FOR UPDATE",
      [requestId],
    );
    if (!request) throw fail("ไม่พบคำขอแก้ไขนี้", 404, "NOT_FOUND");
    requirePending(request);
    if (decision === "approved") {
      const next = applyVendorChange(await lockVendor(connection, request.vendor_id), parseJson(request.changes));
      await connection.query(
        `UPDATE RepairVendor
         SET name = ?, contact_name = ?, phone = ?, email = ?, specialties = ?, specialty_other = ?, contract_type = ?,
             contract_start = ?, contract_end = ?, contract_fee = ?, updated_by_name = ?
         WHERE id = ?`,
        [next.name, next.contact_name, next.phone, next.email, next.specialties, next.specialty_other, next.contract_type,
          next.contract_start, next.contract_end, next.contract_fee, actor.actor_name, request.vendor_id],
      );
    }
    await connection.query(
      "UPDATE RepairVendorChangeRequest SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by_name = ?, decision_note = ? WHERE id = ?",
      [decision, actor.actor_name, decisionNote, requestId],
    );
    return request.vendor_id;
  });
  const request = await loadVendorChange(db, requestId);
  const [[vendor]] = await db.query(`SELECT ${VENDOR_COLUMNS} FROM RepairVendor WHERE id = ?`, [vendorId]);
  await repairVendorChangeNotice(db, vendor, request, actor, decision);
  await postVendorWebhook(db, vendor, "vendor.change_decided", { change_request: request });
  return request;
}
