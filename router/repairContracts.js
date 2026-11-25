import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { REPAIR_UPLOAD_DIR } from "../middleware/repairUploads.js";
import { actorOf } from "../middleware/notifications.js";
import { fail, postVendorWebhook } from "./repairVendorShared.js";
import { repairContractChanged } from "./repairNotifications.js";

// Repair contracts: after inspecting the job a vendor submits a quote (labour + materials +
// schedule + installments + attachments). Staff or the owner approve or reject it.

export const CONTRACT_STATUSES = ["pending", "approved", "rejected", "cancelled"];
export const CONTRACT_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
export const CLOSED_JOB_STATUSES = ["cancelled", "rejected", "done"];
export const CONTRACT_MAX_FILES = 5;
export const CONTRACT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const CONTRACT_JSON_LIMIT = "16mb";
const MAX_ITEMS = 100;
const MAX_INSTALLMENTS = 24;
const MAX_MONEY = 9_999_999_999.99;
const LIST_LIMIT = 200;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const CONTRACT_FILE_DIR = path.join(REPAIR_UPLOAD_DIR, "job-contracts");
fs.mkdirSync(CONTRACT_FILE_DIR, { recursive: true });
const STORED_NAME = /^[0-9a-f-]{36}\.(?:pdf|png|jpg)$/;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const CONTRACT_FILE_TYPES = {
  "application/pdf": { ext: ".pdf", matches: (head) => head.subarray(0, 5).toString("latin1") === "%PDF-" },
  "image/png": { ext: ".png", matches: (head) => head.subarray(0, 8).equals(PNG_SIGNATURE) },
  "image/jpeg": { ext: ".jpg", matches: (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff },
};

// ---------- validation ----------

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const sameMoney = (a, b) => Math.abs(round2(a) - round2(b)) < 0.005;
const baht = (value) => round2(value).toFixed(2);

function requireObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("รูปแบบข้อมูลไม่ถูกต้อง");
  return body;
}

function number(value, field, { min = 0, exclusiveMin = false, integer = false } = {}) {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) throw fail(`${field} ต้องเป็นตัวเลข`);
  if (integer && !Number.isInteger(parsed)) throw fail(`${field} ต้องเป็นจำนวนเต็ม`);
  if (exclusiveMin ? parsed <= min : parsed < min) throw fail(`${field} ต้อง${exclusiveMin ? "มากกว่า" : "ไม่น้อยกว่า"} ${min}`);
  if (parsed > MAX_MONEY) throw fail(`${field} มากเกินไป`);
  return integer ? parsed : round2(parsed);
}

function text(value, field, maxLength, { required = true } = {}) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (required) throw fail(`กรุณาระบุ ${field}`);
    return null;
  }
  if (typeof value !== "string") throw fail(`${field} ต้องเป็นข้อความ`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw fail(`${field} ต้องไม่เกิน ${maxLength} ตัวอักษร`);
  return trimmed;
}

function dateKey(value, field, { required = true } = {}) {
  if ((value === undefined || value === null || value === "") && !required) return null;
  if (typeof value !== "string" || !DATE_KEY.test(value)) throw fail(`${field} ต้องเป็นรูปแบบ YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw fail(`${field} ไม่ใช่วันที่ที่มีอยู่จริง`);
  return value;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw fail(`${field} ต้องเป็นหนึ่งใน ${allowed.join(", ")}`);
  return value;
}

export function parseContractNo(value) {
  if (typeof value !== "string" || !CONTRACT_NO_PATTERN.test(value)) {
    throw fail("contract_no ต้องเป็น A-Z, 0-9, จุด, ขีด หรือขีดล่าง ยาวไม่เกิน 20 ตัว");
  }
  return value;
}

function decodeFile(file, index) {
  const field = `files[${index}]`;
  requireObject(file);
  const fileName = text(file.file_name, `${field}.file_name`, 255);
  const mimeType = oneOf(file.mime_type, Object.keys(CONTRACT_FILE_TYPES), `${field}.mime_type`);
  if (typeof file.data_base64 !== "string" || !file.data_base64) throw fail(`กรุณาระบุ ${field}.data_base64`);
  const data = file.data_base64.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) throw fail(`${field}.data_base64 ไม่ใช่ base64 ที่ถูกต้อง`);
  if (Math.floor((data.length * 3) / 4) > CONTRACT_MAX_FILE_BYTES + 3) throw fail(`${field} ต้องมีขนาดไม่เกิน 5 MB`);
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0) throw fail(`${field} เป็นไฟล์ว่าง`);
  if (buffer.length > CONTRACT_MAX_FILE_BYTES) throw fail(`${field} ต้องมีขนาดไม่เกิน 5 MB`);
  if (!CONTRACT_FILE_TYPES[mimeType].matches(buffer.subarray(0, 8))) throw fail(`${field} เนื้อไฟล์ไม่ตรงกับ mime_type ${mimeType}`);
  return { file_name: fileName, mime_type: mimeType, buffer };
}

/** validates the PUT body; money must add up exactly (2 decimals) */
export function parseContractInput(body) {
  requireObject(body);
  const contractType = oneOf(body.contract_type ?? "main", ["main", "addendum"], "contract_type");
  const parentNo = body.parent_contract_no ?? null;
  if (contractType === "addendum") {
    if (parentNo === null || parentNo === "") throw fail("สัญญา addendum ต้องระบุ parent_contract_no");
    parseContractNo(parentNo);
  }
  const billingType = oneOf(body.billing_type, ["daily", "monthly"], "billing_type");
  const rate = number(body.rate, "rate");
  const periodQty = number(body.period_qty, "period_qty", { min: 0, exclusiveMin: true, integer: true });
  const startDate = dateKey(body.start_date, "start_date");
  const endDate = dateKey(body.end_date, "end_date");
  if (endDate < startDate) throw fail("end_date ต้องไม่ก่อน start_date");

  const rawItems = body.items ?? [];
  if (!Array.isArray(rawItems) || rawItems.length > MAX_ITEMS) throw fail(`items ต้องเป็น array ไม่เกิน ${MAX_ITEMS} รายการ`);
  const items = rawItems.map((item, index) => {
    requireObject(item);
    const qty = number(item.qty, `items[${index}].qty`, { min: 0, exclusiveMin: true });
    const unitPrice = number(item.unit_price, `items[${index}].unit_price`);
    return {
      description: text(item.description, `items[${index}].description`, 200),
      qty,
      unit: text(item.unit, `items[${index}].unit`, 20),
      unit_price: unitPrice,
      line_total: round2(qty * unitPrice),
    };
  });

  const rawInstallments = body.installments ?? [];
  if (!Array.isArray(rawInstallments) || rawInstallments.length > MAX_INSTALLMENTS) {
    throw fail(`installments ต้องเป็น array ไม่เกิน ${MAX_INSTALLMENTS} งวด`);
  }
  const installments = rawInstallments.map((row, index) => {
    requireObject(row);
    return {
      no: row.no === undefined ? index + 1 : number(row.no, `installments[${index}].no`, { min: 0, exclusiveMin: true, integer: true }),
      description: text(row.description, `installments[${index}].description`, 200),
      due_date: dateKey(row.due_date, `installments[${index}].due_date`, { required: false }),
      amount: number(row.amount, `installments[${index}].amount`),
    };
  });

  const laborAmount = number(body.labor_amount, "labor_amount");
  const materialAmount = number(body.material_amount, "material_amount");
  const totalAmount = number(body.total_amount, "total_amount");
  const expectedLabor = round2(rate * periodQty);
  if (!sameMoney(laborAmount, expectedLabor)) throw fail(`labor_amount ต้องเท่ากับ rate × period_qty (${baht(expectedLabor)})`);
  const expectedMaterial = round2(items.reduce((sum, item) => sum + item.line_total, 0));
  if (!sameMoney(materialAmount, expectedMaterial)) throw fail(`material_amount ต้องเท่ากับผลรวม qty × unit_price ของ items (${baht(expectedMaterial)})`);
  const expectedTotal = round2(laborAmount + materialAmount);
  if (!sameMoney(totalAmount, expectedTotal)) throw fail(`total_amount ต้องเท่ากับ labor_amount + material_amount (${baht(expectedTotal)})`);
  if (installments.length > 0) {
    const sum = round2(installments.reduce((total, row) => total + row.amount, 0));
    if (!sameMoney(sum, totalAmount)) throw fail(`ผลรวม installments.amount (${baht(sum)}) ต้องเท่ากับ total_amount (${baht(totalAmount)})`);
  }

  let files;
  if (body.files !== undefined && body.files !== null) {
    if (!Array.isArray(body.files) || body.files.length > CONTRACT_MAX_FILES) throw fail(`files ต้องเป็น array ไม่เกิน ${CONTRACT_MAX_FILES} ไฟล์`);
    files = body.files.map(decodeFile);
  }

  return {
    contract: {
      contract_type: contractType,
      parent_contract_no: contractType === "addendum" ? parentNo : null,
      billing_type: billingType,
      rate,
      period_qty: periodQty,
      start_date: startDate,
      end_date: endDate,
      labor_amount: laborAmount,
      material_amount: materialAmount,
      total_amount: totalAmount,
      terms: text(body.terms, "terms", 2000, { required: false }),
    },
    items,
    installments,
    files,
  };
}

// ---------- files on disk ----------

export function contractFilePath(storedName) {
  return STORED_NAME.test(storedName) ? path.join(CONTRACT_FILE_DIR, storedName) : null;
}

export async function removeContractFiles(storedNames) {
  await Promise.all((storedNames ?? []).map((name) => contractFilePath(name))
    .filter(Boolean)
    .map((file) => fs.promises.unlink(file).catch(() => {})));
}

async function writeDecodedFiles(files) {
  const saved = [];
  try {
    for (const file of files) {
      const storedName = `${randomUUID()}${CONTRACT_FILE_TYPES[file.mime_type].ext}`;
      await fs.promises.writeFile(path.join(CONTRACT_FILE_DIR, storedName), file.buffer, { flag: "wx" });
      saved.push({ file_name: file.file_name, stored_name: storedName, mime_type: file.mime_type, size_bytes: file.buffer.length });
    }
    return saved;
  } catch (error) {
    await removeContractFiles(saved.map((file) => file.stored_name));
    throw error;
  }
}

const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: "ไฟล์แนบต้องมีขนาดไม่เกิน 5 MB ต่อไฟล์",
  LIMIT_FILE_COUNT: `แนบไฟล์ได้ไม่เกิน ${CONTRACT_MAX_FILES} ไฟล์ต่อสัญญา`,
  LIMIT_UNEXPECTED_FILE: `ส่งไฟล์ใน field ชื่อ files ได้ไม่เกิน ${CONTRACT_MAX_FILES} ไฟล์`,
};

const multipart = multer({
  storage: multer.diskStorage({
    destination: CONTRACT_FILE_DIR,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${CONTRACT_FILE_TYPES[file.mimetype].ext}`),
  }),
  limits: { fileSize: CONTRACT_MAX_FILE_BYTES, files: CONTRACT_MAX_FILES, fields: 5, fieldSize: 1024 },
  fileFilter: (_req, file, callback) => {
    if (Object.hasOwn(CONTRACT_FILE_TYPES, file.mimetype)) return callback(null, true);
    return callback(fail("ไฟล์แนบต้องเป็น application/pdf, image/png หรือ image/jpeg"));
  },
}).array("files", CONTRACT_MAX_FILES);

/** multipart/form-data upload (field "files"), streamed to disk so large PDFs never sit in memory */
export function parseContractUpload(req, res, next) {
  multipart(req, res, async (error) => {
    const files = req.files ?? [];
    const names = files.map((file) => file.filename);
    try {
      if (error) throw error.status ? error : fail(UPLOAD_ERRORS[error.code] ?? "อัปโหลดไฟล์ไม่สำเร็จ");
      if (files.length === 0) throw fail("กรุณาแนบไฟล์อย่างน้อย 1 ไฟล์ใน field ชื่อ files");
      for (const file of files) {
        const handle = await fs.promises.open(file.path, "r");
        try {
          const { buffer } = await handle.read(Buffer.alloc(8), 0, 8, 0);
          if (!CONTRACT_FILE_TYPES[file.mimetype].matches(buffer)) throw fail(`ไฟล์ ${file.originalname} เนื้อไฟล์ไม่ตรงกับชนิด ${file.mimetype}`);
        } finally {
          await handle.close();
        }
      }
      req.contractFiles = files.map((file) => ({
        file_name: (file.originalname || file.filename).slice(0, 255),
        stored_name: file.filename,
        mime_type: file.mimetype,
        size_bytes: file.size,
      }));
      return next();
    } catch (checkError) {
      await removeContractFiles(names);
      return next(checkError);
    }
  });
}

// ---------- reading ----------

const iso = (ms) => (ms == null ? null : new Date(Number(ms)).toISOString());
const money = (value) => (value == null ? null : Number(value));

const CONTRACT_COLUMNS = `
  c.id, c.job_id, c.vendor_id, c.contract_no, c.contract_type, c.parent_contract_no, c.status, c.billing_type,
  c.rate, c.period_qty, DATE_FORMAT(c.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(c.end_date, '%Y-%m-%d') AS end_date,
  c.labor_amount, c.material_amount, c.total_amount, c.terms, c.revision,
  UNIX_TIMESTAMP(c.submitted_at) * 1000 AS submitted_ms, UNIX_TIMESTAMP(c.updated_at) * 1000 AS updated_ms,
  UNIX_TIMESTAMP(c.decided_at) * 1000 AS decided_ms, c.decided_by_name, c.decision_note,
  UNIX_TIMESTAMP(c.cancelled_at) * 1000 AS cancelled_ms, c.cancel_reason`;

async function hydrate(db, rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [[items], [installments], [files]] = await Promise.all([
    db.query("SELECT contract_id, description, qty, unit, unit_price, line_total FROM RepairContractItem WHERE contract_id IN (?) ORDER BY contract_id, line_no", [ids]),
    db.query(
      `SELECT contract_id, installment_no, description, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, amount
       FROM RepairContractInstallment WHERE contract_id IN (?) ORDER BY contract_id, installment_no, id`,
      [ids],
    ),
    db.query("SELECT id, contract_id, file_name, mime_type, size_bytes FROM RepairContractFile WHERE contract_id IN (?) ORDER BY id", [ids]),
  ]);
  const group = (list) => list.reduce((map, row) => map.set(row.contract_id, [...(map.get(row.contract_id) || []), row]), new Map());
  const itemsBy = group(items);
  const installmentsBy = group(installments);
  const filesBy = group(files);
  return rows.map((row) => ({
    id: row.id,
    job_id: row.job_id,
    contract_no: row.contract_no,
    contract_type: row.contract_type,
    parent_contract_no: row.parent_contract_no,
    status: row.status,
    billing_type: row.billing_type,
    rate: money(row.rate),
    period_qty: Number(row.period_qty),
    start_date: row.start_date,
    end_date: row.end_date,
    labor_amount: money(row.labor_amount),
    material_amount: money(row.material_amount),
    total_amount: money(row.total_amount),
    terms: row.terms,
    items: (itemsBy.get(row.id) || []).map((item) => ({
      description: item.description, qty: money(item.qty), unit: item.unit, unit_price: money(item.unit_price), line_total: money(item.line_total),
    })),
    installments: (installmentsBy.get(row.id) || []).map((item) => ({
      no: Number(item.installment_no), description: item.description, due_date: item.due_date, amount: money(item.amount),
    })),
    files: (filesBy.get(row.id) || []).map((file) => ({
      file_id: file.id, file_name: file.file_name, mime_type: file.mime_type, size_bytes: Number(file.size_bytes),
    })),
    revision: Number(row.revision),
    submitted_at: iso(row.submitted_ms),
    updated_at: iso(row.updated_ms),
    decided_at: iso(row.decided_ms),
    decided_by_name: row.decided_by_name,
    decision_note: row.decision_note,
    cancelled_at: iso(row.cancelled_ms),
    cancel_reason: row.cancel_reason,
  }));
}

/** vendor-facing shape: drops our internal row id */
export function publicContract(contract) {
  const copy = { ...contract };
  delete copy.id;
  return copy;
}

export async function listContracts(db, { jobId, vendorId, contractId, contractNo, status, updatedSinceMs, limit = LIST_LIMIT } = {}) {
  const where = [];
  const params = [];
  if (jobId) { where.push("c.job_id = ?"); params.push(jobId); }
  if (vendorId) { where.push("c.vendor_id = ?"); params.push(vendorId); }
  if (contractId) { where.push("c.id = ?"); params.push(contractId); }
  if (contractNo) { where.push("c.contract_no = ?"); params.push(contractNo); }
  if (status) { where.push("c.status = ?"); params.push(status); }
  if (updatedSinceMs != null) { where.push("c.updated_at >= FROM_UNIXTIME(?)"); params.push(Math.floor(updatedSinceMs / 1000)); }
  const [rows] = await db.query(
    `SELECT ${CONTRACT_COLUMNS} FROM RepairContract c
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${updatedSinceMs != null ? "c.updated_at, c.id" : "c.submitted_at, c.id"}
     LIMIT ?`,
    [...params, limit],
  );
  return hydrate(db, rows);
}

export async function loadContract(db, filter) {
  const [contract] = await listContracts(db, { ...filter, limit: 1 });
  if (!contract) throw fail("ไม่พบสัญญานี้", 404, "NOT_FOUND");
  return contract;
}

// ---------- writing ----------

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

async function lockJob(connection, jobId, vendorId) {
  const [[job]] = await connection.query(
    "SELECT id, status, room_number, vendor_id FROM RepairJob WHERE id = ? AND vendor_id = ? FOR UPDATE",
    [jobId, vendorId],
  );
  if (!job) throw fail("ไม่พบงานซ่อมนี้", 404, "NOT_FOUND");
  return job;
}

function requireOpenJob(job) {
  if (CLOSED_JOB_STATUSES.includes(job.status)) {
    throw fail(`งานซ่อมนี้ปิดแล้ว (สถานะ ${job.status}) ส่งหรือแก้สัญญาไม่ได้`, 409, "INVALID_JOB_STATUS");
  }
}

function requirePending(contract) {
  if (contract.status !== "pending") {
    throw fail(`สัญญานี้${CONTRACT_STATUS_LABEL[contract.status] || contract.status}แล้ว แก้ไขหรือยกเลิกไม่ได้`, 409, "CONTRACT_LOCKED");
  }
}

export const CONTRACT_STATUS_LABEL = { pending: "รออนุมัติ", approved: "อนุมัติ", rejected: "ไม่อนุมัติ", cancelled: "ยกเลิก" };

async function replaceLines(connection, contractId, items, installments) {
  await connection.query("DELETE FROM RepairContractItem WHERE contract_id = ?", [contractId]);
  await connection.query("DELETE FROM RepairContractInstallment WHERE contract_id = ?", [contractId]);
  if (items.length) {
    await connection.query(
      "INSERT INTO RepairContractItem (contract_id, line_no, description, qty, unit, unit_price, line_total) VALUES ?",
      [items.map((item, index) => [contractId, index + 1, item.description, item.qty, item.unit, item.unit_price, item.line_total])],
    );
  }
  if (installments.length) {
    await connection.query(
      "INSERT INTO RepairContractInstallment (contract_id, installment_no, description, due_date, amount) VALUES ?",
      [installments.map((row) => [contractId, row.no, row.description, row.due_date, row.amount])],
    );
  }
}

async function insertFiles(connection, contractId, files) {
  if (!files.length) return;
  await connection.query(
    "INSERT INTO RepairContractFile (contract_id, file_name, stored_name, mime_type, size_bytes) VALUES ?",
    [files.map((file) => [contractId, file.file_name, file.stored_name, file.mime_type, file.size_bytes])],
  );
}

const vendorActor = (vendor) => actorOf(null, `ช่าง ${vendor.name}`);

async function jobForNotice(db, jobId) {
  const [[job]] = await db.query(
    "SELECT j.id, j.room_number, j.category, v.name AS vendor_name FROM RepairJob j JOIN RepairVendor v ON v.id = j.vendor_id WHERE j.id = ?",
    [jobId],
  );
  return job;
}

/** PUT /jobs/:id/contracts/:contract_no — create, or revise while still pending */
export async function upsertContract(db, { jobId, vendor, contractNo, input }) {
  const newFiles = input.files ? await writeDecodedFiles(input.files) : null;
  let replacedFiles = [];
  try {
    const result = await withTransaction(db, async (connection) => {
      const job = await lockJob(connection, jobId, vendor.vendorId);
      requireOpenJob(job);
      const [[existing]] = await connection.query(
        "SELECT id, status FROM RepairContract WHERE job_id = ? AND contract_no = ? FOR UPDATE",
        [jobId, contractNo],
      );
      if (existing) requirePending(existing);
      if (input.contract.contract_type === "addendum") {
        if (input.contract.parent_contract_no === contractNo) throw fail("parent_contract_no ต้องเป็นสัญญาอื่น");
        const [[parent]] = await connection.query(
          "SELECT status FROM RepairContract WHERE job_id = ? AND contract_no = ?",
          [jobId, input.contract.parent_contract_no],
        );
        if (!parent || parent.status !== "approved") {
          throw fail("parent_contract_no ต้องเป็นสัญญาหลักของงานนี้ที่อนุมัติแล้ว");
        }
      }
      const fields = input.contract;
      let contractId;
      if (existing) {
        contractId = existing.id;
        await connection.query(
          `UPDATE RepairContract SET contract_type = ?, parent_contract_no = ?, billing_type = ?, rate = ?, period_qty = ?,
             start_date = ?, end_date = ?, labor_amount = ?, material_amount = ?, total_amount = ?, terms = ?,
             revision = revision + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [fields.contract_type, fields.parent_contract_no, fields.billing_type, fields.rate, fields.period_qty,
            fields.start_date, fields.end_date, fields.labor_amount, fields.material_amount, fields.total_amount, fields.terms, contractId],
        );
      } else {
        const [inserted] = await connection.query(
          `INSERT INTO RepairContract (job_id, vendor_id, contract_no, contract_type, parent_contract_no, billing_type, rate, period_qty,
             start_date, end_date, labor_amount, material_amount, total_amount, terms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [jobId, vendor.vendorId, contractNo, fields.contract_type, fields.parent_contract_no, fields.billing_type, fields.rate,
            fields.period_qty, fields.start_date, fields.end_date, fields.labor_amount, fields.material_amount, fields.total_amount, fields.terms],
        );
        contractId = inserted.insertId;
      }
      await replaceLines(connection, contractId, input.items, input.installments);
      if (newFiles) {
        const [old] = await connection.query("SELECT stored_name FROM RepairContractFile WHERE contract_id = ?", [contractId]);
        replacedFiles = old.map((row) => row.stored_name);
        await connection.query("DELETE FROM RepairContractFile WHERE contract_id = ?", [contractId]);
        await insertFiles(connection, contractId, newFiles);
      }
      return { contractId, created: !existing };
    });
    await removeContractFiles(replacedFiles);
    const contract = await loadContract(db, { contractId: result.contractId });
    await repairContractChanged(db, await jobForNotice(db, jobId), contract, vendorActor(vendor), result.created ? "submitted" : "revised");
    return { contract, created: result.created };
  } catch (error) {
    if (newFiles) await removeContractFiles(newFiles.map((file) => file.stored_name));
    if (error?.code === "ER_DUP_ENTRY") throw fail("มีการส่งสัญญาเลขนี้พร้อมกัน กรุณาลองใหม่", 409, "CONFLICT");
    throw error;
  }
}

/** POST /jobs/:id/contracts/:contract_no/files — adds multipart files to a pending contract */
export async function addContractFiles(db, { jobId, vendor, contractNo, files }) {
  try {
    const contractId = await withTransaction(db, async (connection) => {
      const job = await lockJob(connection, jobId, vendor.vendorId);
      requireOpenJob(job);
      const [[contract]] = await connection.query(
        "SELECT id, status FROM RepairContract WHERE job_id = ? AND contract_no = ? FOR UPDATE",
        [jobId, contractNo],
      );
      if (!contract) throw fail("ไม่พบสัญญานี้ ส่งข้อมูลสัญญาด้วย PUT ก่อนแนบไฟล์", 404, "NOT_FOUND");
      requirePending(contract);
      const [[{ count }]] = await connection.query("SELECT COUNT(*) AS count FROM RepairContractFile WHERE contract_id = ?", [contract.id]);
      if (Number(count) + files.length > CONTRACT_MAX_FILES) {
        throw fail(`สัญญาหนึ่งฉบับแนบไฟล์ได้ไม่เกิน ${CONTRACT_MAX_FILES} ไฟล์ (มีอยู่แล้ว ${count} ไฟล์)`);
      }
      await insertFiles(connection, contract.id, files);
      await connection.query("UPDATE RepairContract SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [contract.id]);
      return contract.id;
    });
    return loadContract(db, { contractId });
  } catch (error) {
    await removeContractFiles(files.map((file) => file.stored_name));
    throw error;
  }
}

export async function cancelContract(db, { jobId, vendor, contractNo, reason }) {
  const cancelReason = text(reason, "reason", 500);
  const contractId = await withTransaction(db, async (connection) => {
    await lockJob(connection, jobId, vendor.vendorId);
    const [[contract]] = await connection.query(
      "SELECT id, status FROM RepairContract WHERE job_id = ? AND contract_no = ? FOR UPDATE",
      [jobId, contractNo],
    );
    if (!contract) throw fail("ไม่พบสัญญานี้", 404, "NOT_FOUND");
    requirePending(contract);
    await connection.query(
      "UPDATE RepairContract SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ? WHERE id = ?",
      [cancelReason, contract.id],
    );
    return contract.id;
  });
  const contract = await loadContract(db, { contractId });
  await repairContractChanged(db, await jobForNotice(db, jobId), contract, vendorActor(vendor), "cancelled");
  return contract;
}

/** staff / owner approve or reject a pending contract */
export async function decideContract(db, { contractId, decision, note, actor }) {
  oneOf(decision, ["approved", "rejected"], "decision");
  const decisionNote = text(note, "เหตุผล", 500, { required: decision === "rejected" });
  const jobId = await withTransaction(db, async (connection) => {
    const [[contract]] = await connection.query(
      `SELECT c.id, c.status, c.job_id, j.status AS job_status
       FROM RepairContract c JOIN RepairJob j ON j.id = c.job_id
       WHERE c.id = ? FOR UPDATE`,
      [contractId],
    );
    if (!contract) throw fail("ไม่พบสัญญานี้", 404, "NOT_FOUND");
    requirePending(contract);
    if (["cancelled", "rejected"].includes(contract.job_status)) {
      throw fail("งานซ่อมนี้ถูกยกเลิกหรือช่างปฏิเสธไปแล้ว อนุมัติสัญญาไม่ได้", 409, "INVALID_JOB_STATUS");
    }
    await connection.query(
      "UPDATE RepairContract SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by_name = ?, decision_note = ? WHERE id = ?",
      [decision, actor.actor_name, decisionNote, contractId],
    );
    return contract.job_id;
  });
  const contract = await loadContract(db, { contractId });
  await repairContractChanged(db, await jobForNotice(db, jobId), contract, actor, decision);
  const [[vendor]] = await db.query(
    "SELECT v.id, v.name, v.webhook_url FROM RepairVendor v JOIN RepairJob j ON j.vendor_id = v.id WHERE j.id = ?",
    [jobId],
  );
  if (vendor) {
    await postVendorWebhook(db, vendor, "contract.decided", {
      job_id: jobId,
      contract: {
        contract_no: contract.contract_no, status: contract.status, decided_at: contract.decided_at,
        decided_by_name: contract.decided_by_name, decision_note: contract.decision_note,
      },
    });
  }
  return contract;
}

export async function loadContractFile(db, fileId, { vendorId, jobId, contractNo } = {}) {
  const [[file]] = await db.query(
    `SELECT f.file_name, f.stored_name, f.mime_type, f.size_bytes
     FROM RepairContractFile f JOIN RepairContract c ON c.id = f.contract_id
     WHERE f.id = ? AND (? IS NULL OR c.vendor_id = ?) AND (? IS NULL OR c.job_id = ?) AND (? IS NULL OR c.contract_no = ?)`,
    [fileId, vendorId ?? null, vendorId ?? null, jobId ?? null, jobId ?? null, contractNo ?? null, contractNo ?? null],
  );
  const filePath = file && contractFilePath(file.stored_name);
  if (!filePath) throw fail("ไม่พบไฟล์นี้", 404, "NOT_FOUND");
  return { ...file, path: filePath };
}

export function sendContractFile(res, file) {
  res.setHeader("Content-Type", file.mime_type);
  res.setHeader("Content-Length", String(file.size_bytes));
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(file.path)
    .on("error", () => (res.headersSent ? res.destroy() : res.status(404).json({ code: "NOT_FOUND", message: "ไม่พบไฟล์นี้" })))
    .pipe(res);
}

/** ?updated_since accepts ISO date-time or unix milliseconds */
export function parseUpdatedSince(value) {
  if (value === undefined || value === "") return null;
  const ms = /^\d+$/.test(String(value)) ? Number(value) : Date.parse(String(value));
  if (!Number.isFinite(ms)) throw fail("updated_since ต้องเป็น ISO date-time เช่น 2026-11-26T03:50:00Z");
  return ms;
}
