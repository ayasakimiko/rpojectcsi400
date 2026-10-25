import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { getPool } from "../Database/connection.js";
import { isPositiveId, validateText } from "../middleware/validation.js";
import {
  CONTRACT_IMAGE_TYPES,
  HttpError,
  MARKET_CONTRACT_DIR,
  MAX_CONTRACT_IMAGES,
  MAX_CONTRACT_IMAGE_BYTES,
  fromCents,
  handleRouteError,
  invoiceDueDate,
  isRealContractImage,
  loadMarketConfig,
  recordMarketAudit,
  refreshStallStatus,
  toCents,
  todayString,
} from "./marketShared.js";

const MAX_NOTE_LENGTH = 500;
const MAX_METER_UNITS = 1_000_000;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const END_TYPES = new Set(["ended", "terminated"]);
const SETTLE_ACTIONS = new Set(["refund", "forfeit"]);

const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: `รูปสัญญาต้องมีขนาดไม่เกิน ${MAX_CONTRACT_IMAGE_BYTES / 1024 / 1024} MB ต่อรูป`,
  LIMIT_FILE_COUNT: `แนบรูปสัญญาได้ไม่เกิน ${MAX_CONTRACT_IMAGES} รูปต่อครั้ง`,
  LIMIT_UNEXPECTED_FILE: `แนบรูปสัญญาได้ไม่เกิน ${MAX_CONTRACT_IMAGES} รูปต่อครั้ง`,
};

const router = Router();

function fail(message, status = 400) {
  throw new HttpError(status, message);
}

function contractFolder(contractId) {
  return path.join(MARKET_CONTRACT_DIR, `contract-${contractId}`);
}

function contractUpload(contractId) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        const folder = contractFolder(contractId);
        fs.promises.mkdir(folder, { recursive: true }).then(() => callback(null, folder), callback);
      },
      filename: (_req, file, callback) => callback(null, `${randomUUID()}${CONTRACT_IMAGE_TYPES[file.mimetype].ext}`),
    }),
    limits: { fileSize: MAX_CONTRACT_IMAGE_BYTES, files: MAX_CONTRACT_IMAGES, fields: 5 },
    fileFilter: (_req, file, callback) => {
      if (Object.hasOwn(CONTRACT_IMAGE_TYPES, file.mimetype)) return callback(null, true);
      return callback(new HttpError(400, "แนบได้เฉพาะไฟล์ JPG, PNG หรือ WebP"));
    },
  }).array("contract_images", MAX_CONTRACT_IMAGES);
}

function receiveImages(req, res, contractId) {
  return new Promise((resolve, reject) => {
    contractUpload(contractId)(req, res, (error) => {
      if (!error) return resolve(req.files ?? []);
      if (error instanceof HttpError) return reject(error);
      return reject(new HttpError(400, UPLOAD_ERRORS[error.code] ?? "อัปโหลดรูปสัญญาไม่สำเร็จ"));
    });
  });
}

async function removeFiles(files) {
  await Promise.all(files.map((file) => fs.promises.rm(file.path, { force: true })));
}

function contractView(row) {
  return {
    id: row.id,
    contract_no: row.contract_no,
    contract_type: row.contract_type,
    booking_id: row.booking_id,
    stall_id: row.stall_id,
    stall_code: row.stall_code,
    zone: row.zone,
    vendor_id: row.vendor_id,
    vendor_name: row.vendor_name,
    contact_name: row.contact_name,
    phone: row.phone,
    category_name: row.category_name,
    start_date: row.start_date,
    end_date: row.end_date,
    lease_months: row.lease_months,
    rent_price: Number(row.rent_price),
    deposit_months: row.deposit_months,
    deposit_amount: Number(row.deposit_amount),
    electricity_mode: row.electricity_mode,
    water_mode: row.water_mode,
    terms: row.terms,
    status: row.status,
    signed_at: row.signed_at,
    ended_at: row.ended_at,
    end_reason: row.end_reason,
    deposit_status: row.deposit_status,
    deposit_deduction: row.deposit_deduction == null ? null : Number(row.deposit_deduction),
    deposit_refunded: row.deposit_refunded == null ? null : Number(row.deposit_refunded),
    deposit_note: row.deposit_note,
    deposit_settled_by: row.deposit_settled_by,
    deposit_settled_at: row.deposit_settled_at,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    image_count: Number(row.image_count ?? 0),
    unpaid_count: Number(row.unpaid_count ?? 0),
    unpaid_total: Number(row.unpaid_total ?? 0),
  };
}

const CONTRACT_SELECT = `
  SELECT lc.*, DATE_FORMAT(lc.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(lc.end_date, '%Y-%m-%d') AS end_date,
         s.code AS stall_code, s.zone, v.vendor_name, v.contact_name, v.phone, c.name AS category_name,
         (SELECT COUNT(*) FROM MarketContractImage ci WHERE ci.contract_id = lc.id) AS image_count,
         (SELECT COUNT(*) FROM MarketInvoice i WHERE i.contract_id = lc.id AND i.status = 'unpaid') AS unpaid_count,
         (SELECT COALESCE(SUM(i.total_amount), 0) FROM MarketInvoice i WHERE i.contract_id = lc.id AND i.status = 'unpaid') AS unpaid_total
  FROM MarketLeaseContract lc
  JOIN MarketStall s ON s.id = lc.stall_id
  JOIN MarketVendor v ON v.id = lc.vendor_id
  JOIN MarketBooking b ON b.id = lc.booking_id
  JOIN MarketCategory c ON c.id = b.category_id`;

async function loadContract(db, contractId) {
  const [[row]] = await db.query(`${CONTRACT_SELECT} WHERE lc.id = ?`, [contractId]);
  if (!row) fail("ไม่พบสัญญานี้", 404);
  return contractView(row);
}

async function loadContractDetail(db, contractId) {
  const contract = await loadContract(db, contractId);
  const [images] = await db.query(
    "SELECT id, mime_type, uploaded_by_name, created_at FROM MarketContractImage WHERE contract_id = ? ORDER BY id ASC",
    [contractId],
  );
  const [invoices] = await db.query(
    "SELECT *, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date FROM MarketInvoice WHERE contract_id = ? ORDER BY period_month DESC",
    [contractId],
  );
  return {
    ...contract,
    images,
    invoices: invoices.map((row) => ({
      ...row,
      rent_amount: Number(row.rent_amount),
      electricity_units: row.electricity_units == null ? null : Number(row.electricity_units),
      electricity_total: Number(row.electricity_total),
      water_units: row.water_units == null ? null : Number(row.water_units),
      water_total: Number(row.water_total),
      total_amount: Number(row.total_amount),
    })),
  };
}

function readContractId(value) {
  if (!isPositiveId(value)) fail("สัญญาไม่ถูกต้อง");
  return Number(value);
}

function readUnits(value, label) {
  const number = Number(value);
  if (value === null || value === "" || typeof value === "boolean" || !Number.isFinite(number) || number < 0 || number > MAX_METER_UNITS) {
    fail(`${label}ต้องเป็นตัวเลขตั้งแต่ 0 ถึง ${MAX_METER_UNITS}`);
  }
  return Math.round(number * 100) / 100;
}

function utilityCharge(mode, units, unitPrice, flatPrice, label) {
  if (mode === "meter") {
    const used = readUnits(units, `หน่วย${label}`);
    return { units: used, total: fromCents(Math.round(used * toCents(unitPrice))) };
  }
  return { units: null, total: mode === "flat" ? Number(flatPrice) : 0 };
}

router.get("/", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" && req.query.status ? req.query.status : null;
    const [rows] = await getPool().query(
      `${CONTRACT_SELECT} ${status ? "WHERE lc.status = ?" : ""}
       ORDER BY FIELD(lc.status, 'awaiting_signature', 'active', 'ended', 'terminated'), lc.start_date DESC`,
      status ? [status] : [],
    );
    return res.json({ contracts: rows.map(contractView) });
  } catch (error) {
    return handleRouteError(res, error, "Market leases load error");
  }
});

router.post("/invoices/:invoiceId/pay", async (req, res) => {
  try {
    if (!isPositiveId(req.params.invoiceId)) fail("รายการไม่ถูกต้อง");
    const invoiceId = Number(req.params.invoiceId);
    const note = req.body?.note;
    const noteError = validateText(note, "หมายเหตุ", { maxLength: 255, required: false });
    if (noteError) fail(noteError);
    const db = getPool();
    const [[invoice]] = await db.query("SELECT contract_id, period_month FROM MarketInvoice WHERE id = ?", [invoiceId]);
    if (!invoice) fail("ไม่พบรายการนี้", 404);
    const [result] = await db.query(
      "UPDATE MarketInvoice SET status = 'paid', paid_at = NOW(), paid_note = ? WHERE id = ? AND status = 'unpaid'",
      [typeof note === "string" && note.trim() ? note.trim() : null, invoiceId],
    );
    if (result.affectedRows === 0) fail("รายการนี้ชำระแล้ว", 409);
    await recordMarketAudit(db, req.actor, "invoice.pay", `invoice:${invoiceId}`, { period_month: invoice.period_month });
    return res.json({ message: `บันทึกชำระเดือน ${invoice.period_month} แล้ว`, contract: await loadContractDetail(db, invoice.contract_id) });
  } catch (error) {
    return handleRouteError(res, error, "Market invoice pay error");
  }
});

router.get("/:id", async (req, res) => {
  try {
    return res.json({ contract: await loadContractDetail(getPool(), readContractId(req.params.id)) });
  } catch (error) {
    return handleRouteError(res, error, "Market lease load error");
  }
});

router.post("/:id/images", async (req, res) => {
  let files = [];
  try {
    const contractId = readContractId(req.params.id);
    const db = getPool();
    const contract = await loadContract(db, contractId);
    if (!["awaiting_signature", "active"].includes(contract.status)) fail("แนบรูปได้เฉพาะสัญญาที่รอเซ็นหรือมีผลอยู่", 409);
    files = await receiveImages(req, res, contractId);
    if (files.length === 0) fail("กรุณาแนบรูปสัญญาอย่างน้อย 1 รูป");
    if (contract.image_count + files.length > MAX_CONTRACT_IMAGES) fail(`สัญญาหนึ่งฉบับแนบรูปได้ไม่เกิน ${MAX_CONTRACT_IMAGES} รูป`);
    for (const file of files) {
      if (!(await isRealContractImage(file.path, file.mimetype))) fail("ไฟล์ไม่ใช่รูปภาพจริง");
    }
    await db.query(
      "INSERT INTO MarketContractImage (contract_id, file_name, mime_type, uploaded_by_name) VALUES ?",
      [files.map((file) => [contractId, file.filename, file.mimetype, req.actor.name])],
    );
    await recordMarketAudit(db, req.actor, "lease.images.add", contract.contract_no, { count: files.length });
    return res.status(201).json({ message: `แนบรูปสัญญา ${files.length} รูปแล้ว`, contract: await loadContractDetail(db, contractId) });
  } catch (error) {
    await removeFiles(files);
    return handleRouteError(res, error, "Market lease image upload error");
  }
});

router.get("/:id/images/:imageId", async (req, res) => {
  try {
    const contractId = readContractId(req.params.id);
    if (!isPositiveId(req.params.imageId)) fail("รูปไม่ถูกต้อง");
    const [[image]] = await getPool().query(
      "SELECT file_name, mime_type FROM MarketContractImage WHERE id = ? AND contract_id = ?",
      [Number(req.params.imageId), contractId],
    );
    if (!image) fail("ไม่พบรูปนี้", 404);
    res.setHeader("Cache-Control", "private, no-store");
    res.type(image.mime_type);
    return res.sendFile(path.join(contractFolder(contractId), path.basename(image.file_name)), (error) => {
      if (error && !res.headersSent) res.status(404).json({ message: "ไม่พบไฟล์รูป" });
    });
  } catch (error) {
    return handleRouteError(res, error, "Market lease image read error");
  }
});

router.delete("/:id/images/:imageId", async (req, res) => {
  try {
    const contractId = readContractId(req.params.id);
    if (!isPositiveId(req.params.imageId)) fail("รูปไม่ถูกต้อง");
    const db = getPool();
    const contract = await loadContract(db, contractId);
    if (contract.status !== "awaiting_signature") fail("ลบรูปได้เฉพาะสัญญาที่ยังรอเซ็น", 409);
    const [[image]] = await db.query(
      "SELECT id, file_name FROM MarketContractImage WHERE id = ? AND contract_id = ?",
      [Number(req.params.imageId), contractId],
    );
    if (!image) fail("ไม่พบรูปนี้", 404);
    await db.query("DELETE FROM MarketContractImage WHERE id = ?", [image.id]);
    await fs.promises.rm(path.join(contractFolder(contractId), path.basename(image.file_name)), { force: true });
    await recordMarketAudit(db, req.actor, "lease.images.delete", contract.contract_no, { image_id: image.id });
    return res.json({ message: "ลบรูปแล้ว", contract: await loadContractDetail(db, contractId) });
  } catch (error) {
    return handleRouteError(res, error, "Market lease image delete error");
  }
});

router.post("/:id/activate", async (req, res) => {
  try {
    const contractId = readContractId(req.params.id);
    const db = getPool();
    const config = await loadMarketConfig(db);
    const contract = await loadContract(db, contractId);
    if (contract.status !== "awaiting_signature") fail("สัญญานี้ไม่ได้อยู่ในสถานะรอเซ็น", 409);
    if (contract.image_count < config.contract_min_images) {
      fail(`ต้องแนบรูปสัญญาที่เซ็นแล้วอย่างน้อย ${config.contract_min_images} รูป (ตอนนี้ ${contract.image_count} รูป)`);
    }
    await db.query(
      "UPDATE MarketLeaseContract SET status = 'active', signed_at = NOW(), updated_at = NOW() WHERE id = ? AND status = 'awaiting_signature'",
      [contractId],
    );
    await refreshStallStatus(db, contract.stall_id);
    await recordMarketAudit(db, req.actor, "lease.activate", contract.contract_no);
    return res.json({ message: `สัญญา ${contract.contract_no} มีผลแล้ว`, contract: await loadContractDetail(db, contractId) });
  } catch (error) {
    return handleRouteError(res, error, "Market lease activate error");
  }
});

router.post("/:id/end", async (req, res) => {
  try {
    const contractId = readContractId(req.params.id);
    const type = req.body?.type;
    if (!END_TYPES.has(type)) fail("เลือกสิ้นสุดตามสัญญา (ended) หรือยกเลิกก่อนกำหนด (terminated)");
    const reasonError = validateText(req.body?.reason, "เหตุผล", { maxLength: MAX_NOTE_LENGTH, required: type === "terminated" });
    if (reasonError) fail(reasonError);
    const reason = typeof req.body.reason === "string" && req.body.reason.trim() ? req.body.reason.trim() : null;
    const db = getPool();
    const contract = await loadContract(db, contractId);
    if (contract.status !== "active") fail("สิ้นสุดได้เฉพาะสัญญาที่มีผลอยู่ (สัญญาที่ยังไม่เซ็นให้ยกเลิกการจอง)", 409);
    if (type === "ended" && contract.end_date > todayString()) fail(`ยังไม่ถึงวันสิ้นสุดสัญญา (${contract.end_date}) ถ้าจะออกก่อนให้เลือกยกเลิกก่อนกำหนด`);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        "UPDATE MarketLeaseContract SET status = ?, ended_at = NOW(), end_reason = ?, updated_at = NOW() WHERE id = ?",
        [type, reason, contractId],
      );
      await connection.query("UPDATE MarketBooking SET status = 'ended' WHERE id = ?", [contract.booking_id]);
      await refreshStallStatus(connection, contract.stall_id);
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
    await recordMarketAudit(db, req.actor, `lease.${type}`, contract.contract_no, { reason });
    return res.json({ message: `สิ้นสุดสัญญา ${contract.contract_no} แล้ว จัดการเงินประกันต่อได้`, contract: await loadContractDetail(db, contractId) });
  } catch (error) {
    return handleRouteError(res, error, "Market lease end error");
  }
});

router.post("/:id/deposit-settlement", async (req, res) => {
  try {
    const contractId = readContractId(req.params.id);
    const action = req.body?.action;
    if (!SETTLE_ACTIONS.has(action)) fail("เลือกคืนเงินประกัน (refund) หรือริบ (forfeit)");
    const noteError = validateText(req.body?.note, "หมายเหตุ", { maxLength: MAX_NOTE_LENGTH, required: action === "forfeit" });
    if (noteError) fail(noteError);
    const note = typeof req.body.note === "string" && req.body.note.trim() ? req.body.note.trim() : null;
    const db = getPool();
    const contract = await loadContract(db, contractId);
    if (!["ended", "terminated"].includes(contract.status)) fail("จัดการเงินประกันได้หลังสิ้นสุดสัญญา", 409);
    if (contract.deposit_status !== "held") fail("จัดการเงินประกันของสัญญานี้แล้ว", 409);
    const depositCents = toCents(contract.deposit_amount);
    let deductionCents = depositCents;
    if (action === "refund") {
      const deduction = Number(req.body.deduction ?? 0);
      if (!Number.isFinite(deduction) || deduction < 0) fail("ยอดหักต้องเป็นตัวเลขตั้งแต่ 0");
      deductionCents = toCents(deduction);
      if (deductionCents > depositCents) fail("ยอดหักต้องไม่เกินเงินประกัน");
      if (deductionCents > 0 && !note) fail("กรุณาระบุเหตุผลที่หักเงินประกัน");
    }
    await db.query(
      `UPDATE MarketLeaseContract
       SET deposit_status = ?, deposit_deduction = ?, deposit_refunded = ?, deposit_note = ?, deposit_settled_by = ?,
           deposit_settled_at = NOW(), updated_at = NOW()
       WHERE id = ? AND deposit_status = 'held'`,
      [action === "refund" ? "refunded" : "forfeited", fromCents(deductionCents), fromCents(depositCents - deductionCents), note, req.actor.name, contractId],
    );
    await recordMarketAudit(db, req.actor, `lease.deposit.${action}`, contract.contract_no, {
      deposit: contract.deposit_amount, deduction: fromCents(deductionCents), refunded: fromCents(depositCents - deductionCents), note,
    });
    return res.json({ message: action === "refund" ? "บันทึกคืนเงินประกันแล้ว" : "บันทึกริบเงินประกันแล้ว", contract: await loadContractDetail(db, contractId) });
  } catch (error) {
    return handleRouteError(res, error, "Market lease deposit error");
  }
});

router.post("/:id/invoices", async (req, res) => {
  try {
    const contractId = readContractId(req.params.id);
    const period = req.body?.period_month;
    if (typeof period !== "string" || !PERIOD_PATTERN.test(period)) fail("เดือนต้องเป็น YYYY-MM");
    const db = getPool();
    const config = await loadMarketConfig(db);
    const contract = await loadContract(db, contractId);
    if (contract.status !== "active") fail("ออกบิลได้เฉพาะสัญญาที่มีผลอยู่", 409);
    if (period < contract.start_date.slice(0, 7) || `${period}-01` >= contract.end_date) {
      fail(`เดือนต้องอยู่ในช่วงสัญญา ${contract.start_date} ถึง ${contract.end_date}`);
    }
    const electricity = utilityCharge(contract.electricity_mode, req.body.electricity_units, config.electricity_unit_price, config.electricity_flat_price, "ไฟ");
    const water = utilityCharge(contract.water_mode, req.body.water_units, config.water_unit_price, config.water_flat_price, "น้ำ");
    const total = fromCents(toCents(contract.rent_price) + toCents(electricity.total) + toCents(water.total));
    await db.query(
      `INSERT INTO MarketInvoice (contract_id, period_month, rent_amount, electricity_units, electricity_total, water_units,
                                  water_total, total_amount, due_date, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [contractId, period, contract.rent_price, electricity.units, electricity.total, water.units, water.total, total,
        invoiceDueDate(period, config.invoice_due_day), req.actor.name],
    ).catch((error) => {
      if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, `ออกบิลเดือน ${period} ของสัญญานี้ไปแล้ว`);
      throw error;
    });
    await recordMarketAudit(db, req.actor, "invoice.create", contract.contract_no, { period_month: period, total });
    return res.status(201).json({ message: `ออกบิลเดือน ${period} แล้ว ยอด ${total.toLocaleString("th-TH")} บาท`, contract: await loadContractDetail(db, contractId) });
  } catch (error) {
    return handleRouteError(res, error, "Market invoice create error");
  }
});

export default router;
