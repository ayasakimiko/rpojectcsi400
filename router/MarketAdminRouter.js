import { Router } from "express";
import { getPool } from "../Database/connection.js";
import {
  MAX_MONEY,
  MAX_NAME_LENGTH,
  isPositiveId,
  isValidDateString,
  isValidMoney,
  isValidPhone,
  parsePage,
  parseSearch,
  validateName,
  validateText,
} from "../middleware/validation.js";
import { generateApiKey, normalizeIp, normalizeOrigin, parseIpList, parseScopes } from "../middleware/marketApiKey.js";
import { invalidateOriginCache } from "../middleware/marketCors.js";
import { MARKET_CONFIG_FIELDS, parseMarketConfigValue } from "../src/utils/marketConfigFields.js";
import { API_KEY_MODE, MARKET_SCOPES, STALL_KIND, UTILITY_MODE, VENDOR_STATUS } from "../src/utils/marketStatus.js";
import {
  HttpError,
  addDaysToDate,
  addMonthsToDate,
  fromCents,
  handleRouteError,
  isBooleanInput,
  loadMarketConfig,
  maskTaxId,
  recordMarketAudit,
  refreshStallStatus,
  toCents,
  todayString,
} from "./marketShared.js";

const PAGE_SIZE = 50;
const MAX_LEASE_MONTHS = 60;
const MAX_MAP_INDEX = 50;
const MAX_STALL_METERS = 999;
const MAX_POWER_AMP = 400;
const MAX_QUANTITY = 1_000_000;
const MAX_ALLOWED_IPS = 20;
const MAX_NOTE_LENGTH = 500;
const STALL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,19}$/;
const TAX_ID_PATTERN = /^\d{13}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = Router();

function fail(message, status = 400) {
  throw new HttpError(status, message);
}

function check(error) {
  if (error) fail(error);
}

function readId(value, label) {
  if (!isPositiveId(value)) fail(`${label}ไม่ถูกต้อง`);
  return Number(value);
}

function readInt(value, label, min, max) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) fail(`${label}ต้องเป็นจำนวนเต็ม ${min}–${max}`);
  return number;
}

function readMoney(value, label, { allowZero = true } = {}) {
  if (!isValidMoney(value, { allowZero })) fail(`${label}ต้องเป็นจำนวนเงิน${allowZero ? "ตั้งแต่ 0" : "มากกว่า 0"}`);
  const cents = Number(value) * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) fail(`${label}มีทศนิยมได้ไม่เกิน 2 ตำแหน่ง`);
  return Math.round(cents) / 100;
}

function readDecimal(value, label, max) {
  const number = Number(value);
  if (value === null || value === "" || typeof value === "boolean" || !Number.isFinite(number) || number <= 0 || number > max) {
    fail(`${label}ต้องมากกว่า 0 และไม่เกิน ${max}`);
  }
  return Math.round(number * 100) / 100;
}

function readEnum(value, map, label) {
  if (typeof value !== "string" || !Object.hasOwn(map, value)) fail(`${label}ไม่ถูกต้อง`);
  return value;
}

function readBool(value, label) {
  if (!isBooleanInput(value)) fail(`${label}ต้องเป็นจริงหรือเท็จ`);
  return value;
}

function readOptionalBool(value, label) {
  return value === undefined || value === null ? false : readBool(value, label);
}

function readOptionalText(value, label, maxLength) {
  check(validateText(value, label, { maxLength, required: false }));
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readIdList(value, label) {
  if (!Array.isArray(value) || !value.every(isPositiveId)) fail(`${label}ต้องเป็นรายการ id`);
  return [...new Set(value.map(Number))];
}

function stallView(row) {
  return {
    id: row.id,
    code: row.code,
    unit_kind: row.unit_kind,
    zone: row.zone,
    shop_name: row.shop_name,
    map_row: row.map_row,
    map_col: row.map_col,
    width_m: Number(row.width_m),
    depth_m: Number(row.depth_m),
    has_water: Boolean(row.has_water),
    has_grease_trap: Boolean(row.has_grease_trap),
    has_exhaust: Boolean(row.has_exhaust),
    power_amp: row.power_amp,
    electricity_mode: row.electricity_mode,
    water_mode: row.water_mode,
    rent_price: Number(row.rent_price),
    status: row.status,
    is_sandbox: Boolean(row.is_sandbox),
    note: row.note,
    updated_at: row.updated_at,
  };
}

function productView(row) {
  return {
    id: row.id,
    stall_id: row.stall_id,
    category_id: row.category_id,
    category_name: row.category_name,
    name: row.name,
    unit: row.unit,
    price: Number(row.price),
    quantity: Number(row.quantity),
    quantity_limit: Number(row.quantity_limit),
    version: Number(row.version),
    updated_by_role: row.updated_by_role,
    updated_by_name: row.updated_by_name,
    updated_by_client_name: row.client_name ?? null,
    updated_at: row.updated_at,
  };
}

async function inTransaction(work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function loadCategories(db, ids) {
  if (ids.length === 0) return [];
  const [rows] = await db.query("SELECT id, name, requires_water, is_active FROM MarketCategory WHERE id IN (?)", [ids]);
  if (rows.length !== ids.length) fail("มีประเภทสินค้าที่ไม่มีอยู่ในระบบ");
  return rows;
}

function assertWaterForCategories(stall, categories) {
  const needsWater = categories.filter((category) => category.requires_water);
  if (needsWater.length > 0 && !stall.has_water) {
    fail(`ประเภท ${needsWater.map((category) => category.name).join(", ")} ต้องใช้ล็อกที่มีน้ำ`);
  }
}


router.get("/config", async (req, res) => {
  try {
    return res.json(await loadMarketConfig(getPool()));
  } catch (error) {
    return handleRouteError(res, error, "Market config load error");
  }
});

router.put("/config", async (req, res) => {
  try {
    const body = req.body ?? {};
    const updates = {};
    for (const [field, value] of Object.entries(body)) {
      if (!Object.hasOwn(MARKET_CONFIG_FIELDS, field)) fail(`ไม่รู้จักการตั้งค่า ${field}`);
      const parsed = parseMarketConfigValue(field, value);
      check(parsed.error);
      updates[field] = parsed.value;
    }
    if (Object.keys(updates).length === 0) fail("ไม่มีข้อมูลที่ต้องบันทึก");
    const db = getPool();
    const current = await loadMarketConfig(db);
    const openTime = updates.open_time ?? current.open_time;
    const closeTime = updates.close_time ?? current.close_time;
    if (openTime >= closeTime) fail("เวลาปิดต้องหลังเวลาเปิด");
    const fields = Object.keys(updates);
    await db.query(
      `UPDATE MarketConfig SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = NOW() WHERE id = 1`,
      fields.map((field) => updates[field]),
    );
    await recordMarketAudit(db, req.actor, "config.update", "MarketConfig", updates);
    return res.json(await loadMarketConfig(db));
  } catch (error) {
    return handleRouteError(res, error, "Market config save error");
  }
});


async function loadStalls(db, stallId = null) {
  const config = await loadMarketConfig(db);
  const where = stallId == null ? "" : "WHERE s.id = ?";
  const [rows] = await db.query(
    `SELECT s.*,
            (SELECT COUNT(*) FROM MarketProduct p WHERE p.stall_id = s.id) AS product_count,
            (SELECT COUNT(*) FROM MarketProduct p WHERE p.stall_id = s.id AND p.quantity * 100 <= p.quantity_limit * ?) AS low_stock_count,
            (SELECT COUNT(*) FROM MarketBooking b WHERE b.stall_id = s.id AND b.status = 'pending') AS pending_bookings
     FROM MarketStall s ${where}
     ORDER BY s.is_sandbox ASC, s.map_row ASC, s.map_col ASC`,
    stallId == null ? [config.low_stock_percent] : [config.low_stock_percent, stallId],
  );
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [categories] = await db.query("SELECT stall_id, category_id FROM MarketStallCategory WHERE stall_id IN (?)", [ids]);
  const [leases] = await db.query(
    `SELECT lc.id, lc.stall_id, lc.contract_no, lc.contract_type, lc.status,
            DATE_FORMAT(lc.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(lc.end_date, '%Y-%m-%d') AS end_date,
            v.vendor_name, v.contact_name, v.phone
     FROM MarketLeaseContract lc JOIN MarketVendor v ON v.id = lc.vendor_id
     WHERE lc.stall_id IN (?) AND lc.status IN ('awaiting_signature', 'active')
     ORDER BY lc.start_date ASC`,
    [ids],
  );
  return rows.map((row) => ({
    ...stallView(row),
    category_ids: categories.filter((item) => item.stall_id === row.id).map((item) => item.category_id),
    product_count: Number(row.product_count),
    low_stock_count: Number(row.low_stock_count),
    pending_bookings: Number(row.pending_bookings),
    leases: leases.filter((lease) => lease.stall_id === row.id),
  }));
}

async function normalizeStall(db, input, existing = null) {
  const merged = { ...(existing ?? {}), ...input };
  const code = typeof merged.code === "string" ? merged.code.trim().toUpperCase() : "";
  if (!STALL_CODE_PATTERN.test(code)) fail("รหัสล็อกใช้ได้เฉพาะ A-Z 0-9 และ - ยาวไม่เกิน 20 ตัว");
  const unitKind = readEnum(merged.unit_kind ?? "rentable", STALL_KIND, "ชนิดช่อง");
  const values = {
    code,
    unit_kind: unitKind,
    zone: readOptionalText(merged.zone, "โซน", MAX_NAME_LENGTH),
    shop_name: readOptionalText(merged.shop_name, "ชื่อร้าน", MAX_NAME_LENGTH),
    map_row: readInt(merged.map_row, "แถวบนผัง", 1, MAX_MAP_INDEX),
    map_col: readInt(merged.map_col, "ช่องบนผัง", 1, MAX_MAP_INDEX),
    width_m: readDecimal(merged.width_m, "หน้ากว้าง (ม.)", MAX_STALL_METERS),
    depth_m: readDecimal(merged.depth_m, "ความลึก (ม.)", MAX_STALL_METERS),
    has_water: readOptionalBool(merged.has_water, "มีน้ำ"),
    has_grease_trap: readOptionalBool(merged.has_grease_trap, "บ่อดักไขมัน"),
    has_exhaust: readOptionalBool(merged.has_exhaust, "ท่อดูดควัน"),
    power_amp: readInt(merged.power_amp ?? 15, "ขนาดมิเตอร์ไฟ (A)", 1, MAX_POWER_AMP),
    electricity_mode: readEnum(merged.electricity_mode ?? "meter", UTILITY_MODE, "วิธีคิดค่าไฟ"),
    water_mode: readEnum(merged.water_mode ?? "meter", UTILITY_MODE, "วิธีคิดค่าน้ำ"),
    rent_price: unitKind === "common" ? 0 : readMoney(merged.rent_price ?? 0, "ค่าเช่าต่อเดือน"),
    note: readOptionalText(merged.note, "หมายเหตุ", MAX_NOTE_LENGTH),
  };
  const categoryIds = unitKind === "common" ? [] : readIdList(merged.category_ids ?? [], "ประเภทสินค้า");
  assertWaterForCategories(values, await loadCategories(db, categoryIds));
  return { values, categoryIds };
}

async function saveStallCategories(connection, stallId, categoryIds) {
  await connection.query("DELETE FROM MarketStallCategory WHERE stall_id = ?", [stallId]);
  if (categoryIds.length > 0) {
    await connection.query(
      "INSERT INTO MarketStallCategory (stall_id, category_id) VALUES ?",
      [categoryIds.map((categoryId) => [stallId, categoryId])],
    );
  }
}

function positionConflict(error) {
  if (error?.code !== "ER_DUP_ENTRY") return error;
  return new HttpError(409, String(error.message).includes("position") ? "ตำแหน่งบนผังซ้ำกับล็อกอื่น" : "รหัสล็อกซ้ำกับล็อกอื่น");
}

router.get("/stalls", async (req, res) => {
  try {
    return res.json({ stalls: await loadStalls(getPool()) });
  } catch (error) {
    return handleRouteError(res, error, "Market stalls load error");
  }
});

router.post("/stalls", async (req, res) => {
  try {
    const db = getPool();
    const { values, categoryIds } = await normalizeStall(db, req.body ?? {});
    const isSandbox = req.body?.is_sandbox === undefined ? false : readBool(req.body.is_sandbox, "ล็อกทดลอง");
    const stallId = await inTransaction(async (connection) => {
      const fields = Object.keys(values);
      const [result] = await connection.query(
        `INSERT INTO MarketStall (${fields.join(", ")}, is_sandbox, status, created_by_role, created_by_id, updated_at)
         VALUES (${fields.map(() => "?").join(", ")}, ?, ?, ?, ?, NOW())`,
        [...fields.map((field) => values[field]), isSandbox, isSandbox ? "occupied" : "closed", req.actor.role, req.actor.id],
      ).catch((error) => { throw positionConflict(error); });
      await saveStallCategories(connection, result.insertId, categoryIds);
      return result.insertId;
    });
    await recordMarketAudit(db, req.actor, "stall.create", values.code, { ...values, category_ids: categoryIds });
    const [stall] = await loadStalls(db, stallId);
    return res.status(201).json({ message: `เพิ่มล็อก ${values.code} แล้ว`, stall });
  } catch (error) {
    return handleRouteError(res, error, "Market stall create error");
  }
});

router.put("/stalls/:id", async (req, res) => {
  try {
    const stallId = readId(req.params.id, "ล็อก");
    const db = getPool();
    const [[existing]] = await db.query("SELECT * FROM MarketStall WHERE id = ?", [stallId]);
    if (!existing) fail("ไม่พบล็อกนี้", 404);
    const [currentCategories] = await db.query("SELECT category_id FROM MarketStallCategory WHERE stall_id = ?", [stallId]);
    const { values, categoryIds } = await normalizeStall(db, req.body ?? {}, {
      ...stallView(existing),
      category_ids: currentCategories.map((row) => row.category_id),
    });
    const [[active]] = await db.query(
      "SELECT COUNT(*) AS count FROM MarketLeaseContract WHERE stall_id = ? AND status IN ('awaiting_signature', 'active')",
      [stallId],
    );
    if (values.unit_kind !== existing.unit_kind && Number(active.count) > 0) fail("ล็อกนี้มีสัญญาอยู่ เปลี่ยนชนิดช่องไม่ได้", 409);
    if (values.rent_price === 0 && values.unit_kind === "rentable" && existing.status === "available") {
      fail("ล็อกที่เปิดให้เช่าอยู่ต้องมีค่าเช่ามากกว่า 0");
    }
    await inTransaction(async (connection) => {
      const fields = Object.keys(values);
      await connection.query(
        `UPDATE MarketStall SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = NOW() WHERE id = ?`,
        [...fields.map((field) => values[field]), stallId],
      ).catch((error) => { throw positionConflict(error); });
      if (values.unit_kind === "common") {
        await connection.query("UPDATE MarketStall SET status = 'closed' WHERE id = ?", [stallId]);
      }
      await saveStallCategories(connection, stallId, categoryIds);
    });
    await recordMarketAudit(db, req.actor, "stall.update", values.code, { ...values, category_ids: categoryIds });
    const [stall] = await loadStalls(db, stallId);
    return res.json({ message: `บันทึกล็อก ${values.code} แล้ว`, stall });
  } catch (error) {
    return handleRouteError(res, error, "Market stall update error");
  }
});

router.patch("/stalls/:id/status", async (req, res) => {
  try {
    const stallId = readId(req.params.id, "ล็อก");
    const target = req.body?.status;
    if (!["available", "closed"].includes(target)) fail("เปลี่ยนได้เฉพาะเปิดให้เช่า (available) หรือปิด (closed)");
    const db = getPool();
    const [[stall]] = await db.query("SELECT * FROM MarketStall WHERE id = ?", [stallId]);
    if (!stall) fail("ไม่พบล็อกนี้", 404);
    if (stall.is_sandbox) fail("ล็อกทดลองเปลี่ยนสถานะไม่ได้");
    if (target === "available") {
      if (stall.unit_kind !== "rentable") fail("ช่องส่วนกลางเปิดให้เช่าไม่ได้");
      if (Number(stall.rent_price) <= 0) fail("ตั้งค่าเช่าก่อนเปิดล็อก");
      await db.query("UPDATE MarketStall SET status = 'available', updated_at = NOW() WHERE id = ?", [stallId]);
      await refreshStallStatus(db, stallId);
    } else {
      const [[active]] = await db.query(
        "SELECT COUNT(*) AS count FROM MarketLeaseContract WHERE stall_id = ? AND status IN ('awaiting_signature', 'active')",
        [stallId],
      );
      if (Number(active.count) > 0) fail("ล็อกนี้มีสัญญาอยู่ ต้องสิ้นสุดสัญญาก่อนปิดล็อก", 409);
      await db.query("UPDATE MarketStall SET status = 'closed', updated_at = NOW() WHERE id = ?", [stallId]);
    }
    await recordMarketAudit(db, req.actor, `stall.${target === "closed" ? "close" : "open"}`, stall.code);
    const [updated] = await loadStalls(db, stallId);
    return res.json({ message: target === "closed" ? `ปิดล็อก ${stall.code} แล้ว` : `เปิดล็อก ${stall.code} ให้เช่าแล้ว`, stall: updated });
  } catch (error) {
    return handleRouteError(res, error, "Market stall status error");
  }
});

router.delete("/stalls/:id", async (req, res) => {
  try {
    const stallId = readId(req.params.id, "ล็อก");
    const db = getPool();
    const [[stall]] = await db.query("SELECT code FROM MarketStall WHERE id = ?", [stallId]);
    if (!stall) fail("ไม่พบล็อกนี้", 404);
    const [[history]] = await db.query("SELECT COUNT(*) AS count FROM MarketBooking WHERE stall_id = ?", [stallId]);
    if (Number(history.count) > 0) fail("ล็อกนี้มีประวัติการจองแล้ว ให้ปิดล็อกแทนการลบ", 409);
    await db.query("DELETE FROM MarketStall WHERE id = ?", [stallId]);
    await recordMarketAudit(db, req.actor, "stall.delete", stall.code);
    return res.json({ message: `ลบล็อก ${stall.code} แล้ว` });
  } catch (error) {
    return handleRouteError(res, error, "Market stall delete error");
  }
});


async function loadStallForProducts(db, stallId) {
  const [[stall]] = await db.query("SELECT id, code, unit_kind FROM MarketStall WHERE id = ?", [stallId]);
  if (!stall) fail("ไม่พบล็อกนี้", 404);
  if (stall.unit_kind !== "rentable") fail("ช่องส่วนกลางไม่มีสินค้า");
  return stall;
}

async function loadProducts(db, stallId) {
  const [rows] = await db.query(
    `SELECT p.*, c.name AS category_name, ac.name AS client_name
     FROM MarketProduct p
     JOIN MarketCategory c ON c.id = p.category_id
     LEFT JOIN MarketApiClient ac ON ac.id = p.updated_by_client_id
     WHERE p.stall_id = ? ORDER BY p.id ASC`,
    [stallId],
  );
  return rows.map(productView);
}

async function normalizeProduct(db, stallId, input, existing = null) {
  const merged = { ...(existing ?? {}), ...input };
  check(validateName(merged.name, "ชื่อสินค้า"));
  check(validateText(merged.unit, "หน่วย", { maxLength: 30 }));
  const categoryId = readId(merged.category_id, "ประเภทสินค้า");
  const [[allowed]] = await db.query(
    "SELECT 1 AS ok FROM MarketStallCategory WHERE stall_id = ? AND category_id = ?",
    [stallId, categoryId],
  );
  if (!allowed) fail("ประเภทสินค้านี้ไม่อยู่ในประเภทที่ล็อกอนุญาต");
  const quantityLimit = readInt(merged.quantity_limit, "จำนวนสูงสุด (limit)", 0, MAX_QUANTITY);
  const quantity = readInt(merged.quantity ?? 0, "จำนวน", 0, MAX_QUANTITY);
  if (quantity > quantityLimit) fail(`จำนวนต้องไม่เกินจำนวนสูงสุด (${quantityLimit})`);
  return {
    name: merged.name.trim(),
    unit: merged.unit.trim(),
    category_id: categoryId,
    price: readMoney(merged.price, "ราคา"),
    quantity,
    quantity_limit: quantityLimit,
  };
}

router.get("/stalls/:id/products", async (req, res) => {
  try {
    const stallId = readId(req.params.id, "ล็อก");
    const db = getPool();
    await loadStallForProducts(db, stallId);
    return res.json({ products: await loadProducts(db, stallId) });
  } catch (error) {
    return handleRouteError(res, error, "Market products load error");
  }
});

router.post("/stalls/:id/products", async (req, res) => {
  try {
    const stallId = readId(req.params.id, "ล็อก");
    const db = getPool();
    const stall = await loadStallForProducts(db, stallId);
    const values = await normalizeProduct(db, stallId, req.body ?? {});
    await db.query(
      `INSERT INTO MarketProduct (stall_id, category_id, name, unit, price, quantity, quantity_limit, updated_by_role, updated_by_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [stallId, values.category_id, values.name, values.unit, values.price, values.quantity, values.quantity_limit, req.actor.role, req.actor.name],
    );
    await recordMarketAudit(db, req.actor, "product.create", stall.code, values);
    return res.status(201).json({ message: `เพิ่ม ${values.name} แล้ว`, products: await loadProducts(db, stallId) });
  } catch (error) {
    return handleRouteError(res, error, "Market product create error");
  }
});

router.put("/stalls/:id/products/:productId", async (req, res) => {
  try {
    const stallId = readId(req.params.id, "ล็อก");
    const productId = readId(req.params.productId, "สินค้า");
    const db = getPool();
    const stall = await loadStallForProducts(db, stallId);
    const [[existing]] = await db.query("SELECT * FROM MarketProduct WHERE id = ? AND stall_id = ?", [productId, stallId]);
    if (!existing) fail("ไม่พบสินค้านี้", 404);
    const values = await normalizeProduct(db, stallId, req.body ?? {}, {
      ...existing,
      price: Number(existing.price),
      quantity: Number(existing.quantity),
      quantity_limit: Number(existing.quantity_limit),
    });
    await db.query(
      `UPDATE MarketProduct
       SET category_id = ?, name = ?, unit = ?, price = ?, quantity = ?, quantity_limit = ?, version = version + 1,
           updated_by_role = ?, updated_by_name = ?, updated_by_client_id = NULL, updated_at = NOW()
       WHERE id = ?`,
      [values.category_id, values.name, values.unit, values.price, values.quantity, values.quantity_limit, req.actor.role, req.actor.name, productId],
    );
    await recordMarketAudit(db, req.actor, "product.update", stall.code, {
      product_id: productId,
      before: { price: Number(existing.price), quantity: Number(existing.quantity), quantity_limit: Number(existing.quantity_limit) },
      after: values,
    });
    return res.json({ message: `บันทึก ${values.name} แล้ว`, products: await loadProducts(db, stallId) });
  } catch (error) {
    return handleRouteError(res, error, "Market product update error");
  }
});

router.delete("/stalls/:id/products/:productId", async (req, res) => {
  try {
    const stallId = readId(req.params.id, "ล็อก");
    const productId = readId(req.params.productId, "สินค้า");
    const db = getPool();
    const stall = await loadStallForProducts(db, stallId);
    const [result] = await db.query("DELETE FROM MarketProduct WHERE id = ? AND stall_id = ?", [productId, stallId]);
    if (result.affectedRows === 0) fail("ไม่พบสินค้านี้", 404);
    await recordMarketAudit(db, req.actor, "product.delete", stall.code, { product_id: productId });
    return res.json({ message: "ลบสินค้าแล้ว", products: await loadProducts(db, stallId) });
  } catch (error) {
    return handleRouteError(res, error, "Market product delete error");
  }
});


async function loadCategoryList(db) {
  const [rows] = await db.query(
    `SELECT c.id, c.name, c.requires_water, c.is_active,
            (SELECT COUNT(*) FROM MarketProduct p WHERE p.category_id = c.id) AS product_count
     FROM MarketCategory c ORDER BY c.is_active DESC, c.name ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    requires_water: Boolean(row.requires_water),
    is_active: Boolean(row.is_active),
    product_count: Number(row.product_count),
  }));
}

router.get("/categories", async (req, res) => {
  try {
    return res.json({ categories: await loadCategoryList(getPool()) });
  } catch (error) {
    return handleRouteError(res, error, "Market categories load error");
  }
});

router.post("/categories", async (req, res) => {
  try {
    const body = req.body ?? {};
    check(validateName(body.name, "ชื่อประเภท"));
    const requiresWater = body.requires_water === undefined ? false : readBool(body.requires_water, "ต้องใช้น้ำ");
    const db = getPool();
    await db.query("INSERT INTO MarketCategory (name, requires_water) VALUES (?, ?)", [body.name.trim(), requiresWater]);
    await recordMarketAudit(db, req.actor, "category.create", body.name.trim(), { requires_water: requiresWater });
    return res.status(201).json({ message: "เพิ่มประเภทสินค้าแล้ว", categories: await loadCategoryList(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market category create error");
  }
});

router.put("/categories/:id", async (req, res) => {
  try {
    const categoryId = readId(req.params.id, "ประเภทสินค้า");
    const body = req.body ?? {};
    const db = getPool();
    const [[existing]] = await db.query("SELECT * FROM MarketCategory WHERE id = ?", [categoryId]);
    if (!existing) fail("ไม่พบประเภทสินค้านี้", 404);
    const name = body.name === undefined ? existing.name : body.name;
    check(validateName(name, "ชื่อประเภท"));
    const requiresWater = body.requires_water === undefined ? Boolean(existing.requires_water) : readBool(body.requires_water, "ต้องใช้น้ำ");
    const isActive = body.is_active === undefined ? Boolean(existing.is_active) : readBool(body.is_active, "ใช้งาน");
    if (requiresWater && !existing.requires_water) {
      const [[dry]] = await db.query(
        `SELECT GROUP_CONCAT(s.code ORDER BY s.code) AS codes FROM MarketStallCategory sc
         JOIN MarketStall s ON s.id = sc.stall_id WHERE sc.category_id = ? AND s.has_water = FALSE`,
        [categoryId],
      );
      if (dry.codes) fail(`ล็อก ${dry.codes} ไม่มีน้ำ ให้เอาประเภทนี้ออกจากล็อกก่อน`, 409);
    }
    await db.query(
      "UPDATE MarketCategory SET name = ?, requires_water = ?, is_active = ? WHERE id = ?",
      [name.trim(), requiresWater, isActive, categoryId],
    );
    await recordMarketAudit(db, req.actor, "category.update", name.trim(), { requires_water: requiresWater, is_active: isActive });
    return res.json({ message: "บันทึกประเภทสินค้าแล้ว", categories: await loadCategoryList(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market category update error");
  }
});


function vendorView(row, { full = false } = {}) {
  return {
    id: row.id,
    vendor_name: row.vendor_name,
    contact_name: row.contact_name,
    phone: row.phone,
    email: row.email,
    id_card_or_tax_id: full ? row.id_card_or_tax_id : maskTaxId(row.id_card_or_tax_id),
    address: row.address,
    status: row.status,
    created_at: row.created_at,
    active_leases: row.active_leases == null ? undefined : Number(row.active_leases),
  };
}

function normalizeVendor(input, existing = null) {
  const merged = { ...(existing ?? {}), ...input };
  check(validateName(merged.vendor_name, "ชื่อร้าน/ผู้ค้า"));
  check(validateName(merged.contact_name, "ชื่อผู้ติดต่อ"));
  if (!isValidPhone(merged.phone)) fail("เบอร์โทรไม่ถูกต้อง");
  const email = readOptionalText(merged.email, "อีเมล", 255);
  if (email && !EMAIL_PATTERN.test(email)) fail("อีเมลไม่ถูกต้อง");
  const taxId = String(merged.id_card_or_tax_id ?? "").trim();
  if (!TAX_ID_PATTERN.test(taxId)) fail("เลขบัตรประชาชน/เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  return {
    vendor_name: merged.vendor_name.trim(),
    contact_name: merged.contact_name.trim(),
    phone: merged.phone.trim(),
    email,
    id_card_or_tax_id: taxId,
    address: readOptionalText(merged.address, "ที่อยู่", MAX_NOTE_LENGTH),
    status: readEnum(merged.status ?? "active", VENDOR_STATUS, "สถานะผู้ค้า"),
  };
}

async function loadVendors(db) {
  const [rows] = await db.query(
    `SELECT v.*, (SELECT COUNT(*) FROM MarketLeaseContract lc WHERE lc.vendor_id = v.id AND lc.status IN ('awaiting_signature', 'active')) AS active_leases
     FROM MarketVendor v ORDER BY v.status ASC, v.vendor_name ASC`,
  );
  return rows.map((row) => vendorView(row));
}

router.get("/vendors", async (req, res) => {
  try {
    return res.json({ vendors: await loadVendors(getPool()) });
  } catch (error) {
    return handleRouteError(res, error, "Market vendors load error");
  }
});

router.get("/vendors/:id", async (req, res) => {
  try {
    const vendorId = readId(req.params.id, "ผู้ค้า");
    const [[vendor]] = await getPool().query("SELECT * FROM MarketVendor WHERE id = ?", [vendorId]);
    if (!vendor) fail("ไม่พบผู้ค้านี้", 404);
    return res.json({ vendor: vendorView(vendor, { full: true }) });
  } catch (error) {
    return handleRouteError(res, error, "Market vendor load error");
  }
});

router.post("/vendors", async (req, res) => {
  try {
    const values = normalizeVendor(req.body ?? {});
    const db = getPool();
    const fields = Object.keys(values);
    await db.query(
      `INSERT INTO MarketVendor (${fields.join(", ")}, updated_at) VALUES (${fields.map(() => "?").join(", ")}, NOW())`,
      fields.map((field) => values[field]),
    );
    await recordMarketAudit(db, req.actor, "vendor.create", values.vendor_name, { ...values, id_card_or_tax_id: maskTaxId(values.id_card_or_tax_id) });
    return res.status(201).json({ message: `เพิ่มผู้ค้า ${values.vendor_name} แล้ว`, vendors: await loadVendors(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market vendor create error");
  }
});

router.put("/vendors/:id", async (req, res) => {
  try {
    const vendorId = readId(req.params.id, "ผู้ค้า");
    const db = getPool();
    const [[existing]] = await db.query("SELECT * FROM MarketVendor WHERE id = ?", [vendorId]);
    if (!existing) fail("ไม่พบผู้ค้านี้", 404);
    const values = normalizeVendor(req.body ?? {}, existing);
    const fields = Object.keys(values);
    await db.query(
      `UPDATE MarketVendor SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = NOW() WHERE id = ?`,
      [...fields.map((field) => values[field]), vendorId],
    );
    await recordMarketAudit(db, req.actor, "vendor.update", values.vendor_name, { ...values, id_card_or_tax_id: maskTaxId(values.id_card_or_tax_id) });
    return res.json({ message: `บันทึกผู้ค้า ${values.vendor_name} แล้ว`, vendors: await loadVendors(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market vendor update error");
  }
});


async function loadBookings(db, status = null) {
  const [rows] = await db.query(
    `SELECT b.id, b.stall_id, b.vendor_id, b.category_id, b.lease_months, b.rent_price, b.rent_total, b.deposit_months,
            b.deposit_amount, b.total_price, b.note, b.status, b.created_by_name, b.reviewed_by_role, b.reviewed_by_name,
            b.reviewed_at, b.reject_reason, b.created_at,
            DATE_FORMAT(b.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(b.end_date, '%Y-%m-%d') AS end_date,
            s.code AS stall_code, s.zone, v.vendor_name, v.contact_name, v.phone, c.name AS category_name,
            lc.id AS contract_id, lc.contract_no, lc.status AS contract_status
     FROM MarketBooking b
     JOIN MarketStall s ON s.id = b.stall_id
     JOIN MarketVendor v ON v.id = b.vendor_id
     JOIN MarketCategory c ON c.id = b.category_id
     LEFT JOIN MarketLeaseContract lc ON lc.booking_id = b.id
     ${status ? "WHERE b.status = ?" : ""}
     ORDER BY b.status = 'pending' DESC, b.id DESC`,
    status ? [status] : [],
  );
  return rows.map((row) => ({
    ...row,
    rent_price: Number(row.rent_price),
    rent_total: Number(row.rent_total),
    deposit_amount: Number(row.deposit_amount),
    total_price: Number(row.total_price),
  }));
}

async function assertNoOverlap(connection, stallId, startDate, endDate, excludeId = null) {
  const [rows] = await connection.query(
    `SELECT id, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
     FROM MarketBooking
     WHERE stall_id = ? AND status IN ('pending', 'approved') AND start_date < ? AND end_date > ? AND id <> ?
     LIMIT 1`,
    [stallId, endDate, startDate, excludeId ?? 0],
  );
  if (rows[0]) {
    fail(`ช่วงวันชนกับการจอง #${rows[0].id} (${rows[0].start_date} ถึง ${rows[0].end_date})`, 409);
  }
}

router.get("/bookings", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" && req.query.status ? req.query.status : null;
    return res.json({ bookings: await loadBookings(getPool(), status) });
  } catch (error) {
    return handleRouteError(res, error, "Market bookings load error");
  }
});

router.post("/bookings", async (req, res) => {
  try {
    const body = req.body ?? {};
    const stallId = readId(body.stall_id, "ล็อก");
    const vendorId = readId(body.vendor_id, "ผู้ค้า");
    const categoryId = readId(body.category_id, "ประเภทสินค้า");
    if (!isValidDateString(body.start_date)) fail("วันเริ่มเช่าต้องเป็น YYYY-MM-DD");
    const db = getPool();
    const config = await loadMarketConfig(db);
    const leaseMonths = readInt(body.lease_months, "ระยะสัญญา (เดือน)", 1, MAX_LEASE_MONTHS);
    if (leaseMonths < config.min_lease_months) fail(`สัญญาต้องยาวอย่างน้อย ${config.min_lease_months} เดือน`);
    const depositMonths = body.deposit_months === undefined || body.deposit_months === ""
      ? config.default_deposit_months
      : readInt(body.deposit_months, "เงินประกัน (เดือน)", 0, MARKET_CONFIG_FIELDS.default_deposit_months.max);
    const note = readOptionalText(body.note, "หมายเหตุ", MAX_NOTE_LENGTH);
    const endDate = addMonthsToDate(body.start_date, leaseMonths);

    const bookingId = await inTransaction(async (connection) => {
      const [[stall]] = await connection.query("SELECT * FROM MarketStall WHERE id = ? FOR UPDATE", [stallId]);
      if (!stall) fail("ไม่พบล็อกนี้", 404);
      if (stall.is_sandbox || stall.unit_kind !== "rentable") fail("ล็อกนี้จองไม่ได้");
      if (stall.status === "closed") fail("ล็อกนี้ปิดอยู่ ต้องเปิดให้เช่าก่อน");
      const rentPrice = body.rent_price === undefined || body.rent_price === ""
        ? Number(stall.rent_price)
        : readMoney(body.rent_price, "ค่าเช่าต่อเดือน", { allowZero: false });
      if (rentPrice <= 0) fail("ล็อกนี้ยังไม่ได้ตั้งค่าเช่า");
      const [[vendor]] = await connection.query("SELECT status FROM MarketVendor WHERE id = ?", [vendorId]);
      if (!vendor) fail("ไม่พบผู้ค้านี้", 404);
      if (vendor.status !== "active") fail("ผู้ค้านี้ถูกระงับ");
      const [[category]] = await connection.query(
        `SELECT c.name, c.requires_water, c.is_active, sc.stall_id IS NOT NULL AS allowed
         FROM MarketCategory c LEFT JOIN MarketStallCategory sc ON sc.category_id = c.id AND sc.stall_id = ?
         WHERE c.id = ?`,
        [stallId, categoryId],
      );
      if (!category || !category.is_active) fail("ไม่พบประเภทสินค้านี้");
      if (!Number(category.allowed)) fail(`ล็อก ${stall.code} ไม่อนุญาตให้ขาย${category.name}`);
      assertWaterForCategories(stall, [category]);
      await assertNoOverlap(connection, stallId, body.start_date, endDate);
      const rentTotal = fromCents(toCents(rentPrice) * leaseMonths);
      const depositAmount = fromCents(toCents(rentPrice) * depositMonths);
      const totalPrice = fromCents(toCents(rentTotal) + toCents(depositAmount));
      if (totalPrice > MAX_MONEY) fail("ยอดรวมสูงเกินไป");
      const [result] = await connection.query(
        `INSERT INTO MarketBooking (stall_id, vendor_id, category_id, start_date, end_date, lease_months, rent_price, rent_total,
                                    deposit_months, deposit_amount, total_price, note, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [stallId, vendorId, categoryId, body.start_date, endDate, leaseMonths, rentPrice, rentTotal, depositMonths,
          depositAmount, totalPrice, note, req.actor.name],
      );
      return result.insertId;
    });
    await recordMarketAudit(db, req.actor, "booking.create", `booking:${bookingId}`, { stall_id: stallId, vendor_id: vendorId, start_date: body.start_date, lease_months: leaseMonths });
    return res.status(201).json({ message: "บันทึกการจองแล้ว รออนุมัติ", bookings: await loadBookings(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market booking create error");
  }
});

router.post("/bookings/:id/approve", async (req, res) => {
  try {
    const bookingId = readId(req.params.id, "การจอง");
    const db = getPool();
    const config = await loadMarketConfig(db);
    const contractNo = await inTransaction(async (connection) => {
      const [[booking]] = await connection.query(
        `SELECT b.*, DATE_FORMAT(b.start_date, '%Y-%m-%d') AS start_text, DATE_FORMAT(b.end_date, '%Y-%m-%d') AS end_text
         FROM MarketBooking b WHERE b.id = ? FOR UPDATE`,
        [bookingId],
      );
      if (!booking) fail("ไม่พบการจองนี้", 404);
      if (booking.status !== "pending") fail("อนุมัติได้เฉพาะการจองที่รออนุมัติ", 409);
      const [[stall]] = await connection.query("SELECT * FROM MarketStall WHERE id = ? FOR UPDATE", [booking.stall_id]);
      if (stall.status === "closed") fail("ล็อกนี้ปิดอยู่ ต้องเปิดก่อนอนุมัติ", 409);
      const [[vendor]] = await connection.query("SELECT status FROM MarketVendor WHERE id = ?", [booking.vendor_id]);
      if (vendor.status !== "active") fail("ผู้ค้านี้ถูกระงับ", 409);
      const [[approved]] = await connection.query(
        `SELECT id FROM MarketBooking WHERE stall_id = ? AND status = 'approved' AND start_date < ? AND end_date > ? LIMIT 1`,
        [booking.stall_id, booking.end_text, booking.start_text],
      );
      if (approved) fail(`ช่วงวันชนกับการจองที่อนุมัติแล้ว #${approved.id}`, 409);
      const [[category]] = await connection.query("SELECT requires_water FROM MarketCategory WHERE id = ?", [booking.category_id]);
      const number = `ML-${booking.start_text.slice(0, 4)}-${String(booking.id).padStart(4, "0")}`;
      await connection.query(
        `UPDATE MarketBooking SET status = 'approved', reviewed_by_role = ?, reviewed_by_name = ?, reviewed_at = NOW() WHERE id = ?`,
        [req.actor.role, req.actor.name, bookingId],
      );
      await connection.query(
        `INSERT INTO MarketLeaseContract (contract_no, contract_type, booking_id, stall_id, vendor_id, start_date, end_date,
                                          lease_months, rent_price, deposit_months, deposit_amount, electricity_mode,
                                          water_mode, terms, created_by_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [number, category.requires_water ? "restaurant" : "retail", booking.id, booking.stall_id, booking.vendor_id,
          booking.start_text, booking.end_text, booking.lease_months, booking.rent_price, booking.deposit_months,
          booking.deposit_amount, stall.electricity_mode, stall.water_mode, config.contract_terms, req.actor.name],
      );
      await refreshStallStatus(connection, booking.stall_id);
      return number;
    });
    await recordMarketAudit(db, req.actor, "booking.approve", `booking:${bookingId}`, { contract_no: contractNo });
    return res.json({ message: `อนุมัติแล้ว ออกสัญญา ${contractNo} รอแนบสัญญาที่เซ็นแล้ว`, bookings: await loadBookings(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market booking approve error");
  }
});

router.post("/bookings/:id/reject", async (req, res) => {
  try {
    const bookingId = readId(req.params.id, "การจอง");
    check(validateText(req.body?.reason, "เหตุผลที่ปฏิเสธ", { maxLength: MAX_NOTE_LENGTH }));
    const db = getPool();
    const [result] = await db.query(
      `UPDATE MarketBooking SET status = 'rejected', reject_reason = ?, reviewed_by_role = ?, reviewed_by_name = ?, reviewed_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [req.body.reason.trim(), req.actor.role, req.actor.name, bookingId],
    );
    if (result.affectedRows === 0) fail("ปฏิเสธได้เฉพาะการจองที่รออนุมัติ", 409);
    await recordMarketAudit(db, req.actor, "booking.reject", `booking:${bookingId}`, { reason: req.body.reason.trim() });
    return res.json({ message: "ปฏิเสธการจองแล้ว", bookings: await loadBookings(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market booking reject error");
  }
});

router.post("/bookings/:id/cancel", async (req, res) => {
  try {
    const bookingId = readId(req.params.id, "การจอง");
    const reason = readOptionalText(req.body?.reason, "เหตุผล", MAX_NOTE_LENGTH);
    const db = getPool();
    await inTransaction(async (connection) => {
      const [[booking]] = await connection.query("SELECT * FROM MarketBooking WHERE id = ? FOR UPDATE", [bookingId]);
      if (!booking) fail("ไม่พบการจองนี้", 404);
      const [[contract]] = await connection.query("SELECT id, status FROM MarketLeaseContract WHERE booking_id = ? FOR UPDATE", [bookingId]);
      if (booking.status === "approved" && contract?.status !== "awaiting_signature") {
        fail("สัญญามีผลแล้ว ให้สิ้นสุดสัญญาจากแท็บสัญญาแทน", 409);
      }
      if (!["pending", "approved"].includes(booking.status)) fail("ยกเลิกได้เฉพาะการจองที่รออนุมัติหรือรอเซ็นสัญญา", 409);
      await connection.query(
        "UPDATE MarketBooking SET status = 'cancelled', reject_reason = ?, reviewed_by_role = ?, reviewed_by_name = ?, reviewed_at = NOW() WHERE id = ?",
        [reason, req.actor.role, req.actor.name, bookingId],
      );
      if (contract) {
        await connection.query(
          "UPDATE MarketLeaseContract SET status = 'terminated', ended_at = NOW(), end_reason = ?, updated_at = NOW() WHERE id = ?",
          [reason ?? "ยกเลิกก่อนเซ็นสัญญา", contract.id],
        );
      }
      await refreshStallStatus(connection, booking.stall_id);
    });
    await recordMarketAudit(db, req.actor, "booking.cancel", `booking:${bookingId}`, { reason });
    return res.json({ message: "ยกเลิกการจองแล้ว", bookings: await loadBookings(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market booking cancel error");
  }
});


async function loadApiClients(db) {
  const [rows] = await db.query(
    `SELECT id, name, project_name, contact_email, mode, scopes, key_prefix, allowed_ips, rate_limit_per_min, is_active,
            DATE_FORMAT(expires_at, '%Y-%m-%d') AS expires_at, expires_at IS NOT NULL AND expires_at <= NOW() AS expired,
            previous_key_expires_at, last_used_at, created_by_name, created_at
     FROM MarketApiClient ORDER BY is_active DESC, id DESC`,
  );
  const [stalls] = await db.query("SELECT client_id, stall_id FROM MarketApiClientStall");
  const [origins] = await db.query("SELECT client_id, origin_id FROM MarketApiClientOrigin");
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    project_name: row.project_name,
    contact_email: row.contact_email,
    mode: row.mode,
    scopes: parseScopes(row.scopes),
    key_hint: `${row.key_prefix}••••`,
    allowed_ips: parseIpList(row.allowed_ips),
    rate_limit_per_min: Number(row.rate_limit_per_min),
    is_active: Boolean(row.is_active),
    expired: Number(row.expired) === 1,
    expires_at: row.expires_at,
    previous_key_expires_at: row.previous_key_expires_at,
    last_used_at: row.last_used_at,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    stall_ids: stalls.filter((item) => item.client_id === row.id).map((item) => item.stall_id),
    origin_ids: origins.filter((item) => item.client_id === row.id).map((item) => item.origin_id),
  }));
}

async function normalizeApiClient(db, input, existing = null) {
  const merged = { ...(existing ?? {}), ...input };
  check(validateName(merged.name, "ชื่อระบบ"));
  check(validateName(merged.project_name, "ชื่อโปรเจกต์"));
  if (typeof merged.contact_email !== "string" || !EMAIL_PATTERN.test(merged.contact_email.trim())) fail("อีเมลผู้ติดต่อไม่ถูกต้อง");
  const mode = existing ? existing.mode : readEnum(merged.mode, API_KEY_MODE, "ชนิด key");
  if (!Array.isArray(merged.scopes) || merged.scopes.length === 0 || !merged.scopes.every((scope) => Object.hasOwn(MARKET_SCOPES, scope))) {
    fail("เลือกสิทธิ์ (scope) อย่างน้อยหนึ่งรายการ");
  }
  const stallIds = readIdList(merged.stall_ids ?? [], "ล็อก");
  if (stallIds.length === 0) fail("เลือกล็อกที่ key นี้เข้าถึงได้อย่างน้อยหนึ่งล็อก");
  const [stalls] = await db.query(
    "SELECT id FROM MarketStall WHERE id IN (?) AND unit_kind = 'rentable' AND is_sandbox = ?",
    [stallIds, mode === "test"],
  );
  if (stalls.length !== stallIds.length) fail(mode === "test" ? "key แบบ test เลือกได้เฉพาะล็อกทดลอง" : "key แบบ live เลือกได้เฉพาะล็อกจริง");
  const originIds = readIdList(merged.origin_ids ?? [], "domain");
  if (originIds.length > 0) {
    const [origins] = await db.query("SELECT id FROM MarketAllowedOrigin WHERE id IN (?)", [originIds]);
    if (origins.length !== originIds.length) fail("มี domain ที่ไม่อยู่ในรายการที่อนุญาต");
  }
  const ipInput = merged.allowed_ips ?? [];
  if (!Array.isArray(ipInput) || ipInput.length > MAX_ALLOWED_IPS) fail(`IP ต้องเป็นรายการ ไม่เกิน ${MAX_ALLOWED_IPS} รายการ`);
  const allowedIps = ipInput.map(normalizeIp);
  if (allowedIps.some((ip) => !ip)) fail("มี IP ที่รูปแบบไม่ถูกต้อง");
  const config = await loadMarketConfig(db);
  const rateLimit = merged.rate_limit_per_min === undefined || merged.rate_limit_per_min === ""
    ? config.default_rate_limit_per_min
    : readInt(merged.rate_limit_per_min, "จำกัดต่อนาที", MARKET_CONFIG_FIELDS.default_rate_limit_per_min.min, MARKET_CONFIG_FIELDS.default_rate_limit_per_min.max);
  let expiresAt = input.expires_at;
  if (expiresAt === undefined) {
    expiresAt = existing ? existing.expires_at : addDaysToDate(todayString(), config.key_default_expiry_days);
  } else if (expiresAt === "") {
    expiresAt = null;
  } else if (expiresAt !== null) {
    if (!isValidDateString(expiresAt)) fail("วันหมดอายุต้องเป็น YYYY-MM-DD");
    if (expiresAt <= todayString()) fail("วันหมดอายุต้องเป็นวันในอนาคต");
  }
  return {
    values: {
      name: merged.name.trim(),
      project_name: merged.project_name.trim(),
      contact_email: merged.contact_email.trim(),
      scopes: JSON.stringify([...new Set(merged.scopes)]),
      allowed_ips: allowedIps.length > 0 ? JSON.stringify([...new Set(allowedIps)]) : null,
      rate_limit_per_min: rateLimit,
      expires_at: expiresAt,
    },
    mode,
    stallIds,
    originIds,
  };
}

async function saveClientLinks(connection, clientId, stallIds, originIds) {
  await connection.query("DELETE FROM MarketApiClientStall WHERE client_id = ?", [clientId]);
  await connection.query("INSERT INTO MarketApiClientStall (client_id, stall_id) VALUES ?", [stallIds.map((id) => [clientId, id])]);
  await connection.query("DELETE FROM MarketApiClientOrigin WHERE client_id = ?", [clientId]);
  if (originIds.length > 0) {
    await connection.query("INSERT INTO MarketApiClientOrigin (client_id, origin_id) VALUES ?", [originIds.map((id) => [clientId, id])]);
  }
}

router.get("/api-clients", async (req, res) => {
  try {
    return res.json({ clients: await loadApiClients(getPool()) });
  } catch (error) {
    return handleRouteError(res, error, "Market API clients load error");
  }
});

router.post("/api-clients", async (req, res) => {
  try {
    const db = getPool();
    const { values, mode, stallIds, originIds } = await normalizeApiClient(db, req.body ?? {});
    const generated = generateApiKey(mode);
    const clientId = await inTransaction(async (connection) => {
      const [result] = await connection.query(
        `INSERT INTO MarketApiClient (name, project_name, contact_email, mode, scopes, key_prefix, key_hash, allowed_ips,
                                      rate_limit_per_min, expires_at, created_by_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [values.name, values.project_name, values.contact_email, mode, values.scopes, generated.prefix, generated.hash,
          values.allowed_ips, values.rate_limit_per_min, values.expires_at, req.actor.name],
      );
      await saveClientLinks(connection, result.insertId, stallIds, originIds);
      return result.insertId;
    });
    await recordMarketAudit(db, req.actor, "api_client.create", values.name, { mode, key_prefix: generated.prefix, stall_ids: stallIds, origin_ids: originIds });
    return res.status(201).json({
      message: "สร้าง API key แล้ว คัดลอกเก็บไว้ตอนนี้ ระบบจะไม่แสดงอีก",
      api_key: generated.key,
      client_id: clientId,
      clients: await loadApiClients(db),
    });
  } catch (error) {
    return handleRouteError(res, error, "Market API client create error");
  }
});

router.patch("/api-clients/:id", async (req, res) => {
  try {
    const clientId = readId(req.params.id, "API key");
    const db = getPool();
    const [current] = (await loadApiClients(db)).filter((client) => client.id === clientId);
    if (!current) fail("ไม่พบ API key นี้", 404);
    const body = req.body ?? {};
    const { values, stallIds, originIds } = await normalizeApiClient(db, body, current);
    const isActive = body.is_active === undefined ? current.is_active : readBool(body.is_active, "เปิดใช้งาน");
    await inTransaction(async (connection) => {
      await connection.query(
        `UPDATE MarketApiClient SET name = ?, project_name = ?, contact_email = ?, scopes = ?, allowed_ips = ?,
                                    rate_limit_per_min = ?, expires_at = ?, is_active = ?, updated_at = NOW()
         WHERE id = ?`,
        [values.name, values.project_name, values.contact_email, values.scopes, values.allowed_ips, values.rate_limit_per_min,
          values.expires_at, isActive, clientId],
      );
      await saveClientLinks(connection, clientId, stallIds, originIds);
    });
    await recordMarketAudit(db, req.actor, isActive === current.is_active ? "api_client.update" : isActive ? "api_client.enable" : "api_client.suspend", values.name, {
      scopes: JSON.parse(values.scopes), stall_ids: stallIds, origin_ids: originIds, is_active: isActive,
    });
    return res.json({ message: isActive ? "บันทึก API key แล้ว" : "ระงับ API key แล้ว", clients: await loadApiClients(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market API client update error");
  }
});

router.post("/api-clients/:id/rotate", async (req, res) => {
  try {
    const clientId = readId(req.params.id, "API key");
    const db = getPool();
    const config = await loadMarketConfig(db);
    const [[client]] = await db.query("SELECT id, name, mode, key_prefix, key_hash FROM MarketApiClient WHERE id = ?", [clientId]);
    if (!client) fail("ไม่พบ API key นี้", 404);
    const generated = generateApiKey(client.mode);
    await db.query(
      `UPDATE MarketApiClient
       SET previous_key_prefix = key_prefix, previous_key_hash = key_hash,
           previous_key_expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR),
           key_prefix = ?, key_hash = ?, updated_at = NOW()
       WHERE id = ?`,
      [config.key_rotation_grace_hours, generated.prefix, generated.hash, clientId],
    );
    await recordMarketAudit(db, req.actor, "api_client.rotate", client.name, { old_prefix: client.key_prefix, new_prefix: generated.prefix });
    return res.json({
      message: `หมุน key แล้ว key เก่าใช้ต่อได้อีก ${config.key_rotation_grace_hours} ชั่วโมง`,
      api_key: generated.key,
      clients: await loadApiClients(db),
    });
  } catch (error) {
    return handleRouteError(res, error, "Market API client rotate error");
  }
});


async function loadOrigins(db) {
  const [rows] = await db.query(
    `SELECT o.*, (SELECT COUNT(*) FROM MarketApiClientOrigin co WHERE co.origin_id = o.id) AS client_count
     FROM MarketAllowedOrigin o ORDER BY o.is_active DESC, o.origin ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    origin: row.origin,
    note: row.note,
    is_active: Boolean(row.is_active),
    client_count: Number(row.client_count),
    created_by_name: row.created_by_name,
    created_at: row.created_at,
  }));
}

router.get("/allowed-origins", async (req, res) => {
  try {
    return res.json({ origins: await loadOrigins(getPool()) });
  } catch (error) {
    return handleRouteError(res, error, "Market origins load error");
  }
});

router.post("/allowed-origins", async (req, res) => {
  try {
    const origin = normalizeOrigin(req.body?.origin);
    if (!origin) fail("domain ต้องเป็น https://host เท่านั้น ไม่มี path และห้ามใช้ *");
    const note = readOptionalText(req.body?.note, "หมายเหตุ", 255);
    const db = getPool();
    await db.query(
      "INSERT INTO MarketAllowedOrigin (origin, note, created_by_role, created_by_name, updated_at) VALUES (?, ?, ?, ?, NOW())",
      [origin, note, req.actor.role, req.actor.name],
    );
    invalidateOriginCache();
    await recordMarketAudit(db, req.actor, "origin.create", origin, { note });
    return res.status(201).json({ message: `เพิ่ม ${origin} แล้ว`, origins: await loadOrigins(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market origin create error");
  }
});

router.patch("/allowed-origins/:id", async (req, res) => {
  try {
    const originId = readId(req.params.id, "domain");
    const db = getPool();
    const [[existing]] = await db.query("SELECT * FROM MarketAllowedOrigin WHERE id = ?", [originId]);
    if (!existing) fail("ไม่พบ domain นี้", 404);
    const isActive = req.body?.is_active === undefined ? Boolean(existing.is_active) : readBool(req.body.is_active, "เปิดใช้งาน");
    const note = req.body?.note === undefined ? existing.note : readOptionalText(req.body.note, "หมายเหตุ", 255);
    await db.query("UPDATE MarketAllowedOrigin SET is_active = ?, note = ?, updated_at = NOW() WHERE id = ?", [isActive, note, originId]);
    invalidateOriginCache();
    await recordMarketAudit(db, req.actor, isActive ? "origin.enable" : "origin.disable", existing.origin, { note });
    return res.json({ message: isActive ? `เปิดใช้ ${existing.origin} แล้ว` : `ปิด ${existing.origin} แล้ว`, origins: await loadOrigins(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market origin update error");
  }
});

router.delete("/allowed-origins/:id", async (req, res) => {
  try {
    const originId = readId(req.params.id, "domain");
    const db = getPool();
    const [[existing]] = await db.query("SELECT origin FROM MarketAllowedOrigin WHERE id = ?", [originId]);
    if (!existing) fail("ไม่พบ domain นี้", 404);
    await db.query("DELETE FROM MarketAllowedOrigin WHERE id = ?", [originId]);
    invalidateOriginCache();
    await recordMarketAudit(db, req.actor, "origin.delete", existing.origin);
    return res.json({ message: `ลบ ${existing.origin} แล้ว`, origins: await loadOrigins(db) });
  } catch (error) {
    return handleRouteError(res, error, "Market origin delete error");
  }
});


router.get("/api-logs", async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const conditions = [];
    const params = [];
    if (isPositiveId(req.query.client_id)) {
      conditions.push("l.client_id = ?");
      params.push(Number(req.query.client_id));
    }
    if (req.query.result === "success") conditions.push("l.status_code < 400");
    if (req.query.result === "error") conditions.push("l.status_code >= 400");
    if (isValidDateString(req.query.from)) {
      conditions.push("l.created_at >= ?");
      params.push(req.query.from);
    }
    if (isValidDateString(req.query.to)) {
      conditions.push("l.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
      params.push(req.query.to);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const db = getPool();
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM MarketApiLog l ${where}`, params);
    const [rows] = await db.query(
      `SELECT l.id, l.client_id, c.name AS client_name, l.request_id, l.method, l.path, l.status_code, l.ip, l.changes, l.created_at
       FROM MarketApiLog l LEFT JOIN MarketApiClient c ON c.id = l.client_id
       ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );
    return res.json({
      logs: rows.map((row) => ({ ...row, changes: row.changes ? JSON.parse(row.changes) : null })),
      page,
      total_pages: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)),
    });
  } catch (error) {
    return handleRouteError(res, error, "Market API logs load error");
  }
});

router.get("/audit-logs", async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const conditions = [];
    const params = [];
    if (typeof req.query.role === "string" && /^(Admin|Owner)$/.test(req.query.role)) {
      conditions.push("actor_role = ?");
      params.push(req.query.role);
    }
    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push("(actor_name LIKE ? OR target LIKE ? OR action LIKE ? OR details LIKE ?)");
      params.push(...Array(4).fill(`%${search}%`));
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const db = getPool();
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM MarketAuditLog ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM MarketAuditLog ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );
    return res.json({
      logs: rows.map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null })),
      page,
      pageSize: PAGE_SIZE,
      total: Number(total),
      total_pages: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)),
    });
  } catch (error) {
    return handleRouteError(res, error, "Market audit logs load error");
  }
});


function settledRange(column, from, to) {
  const conditions = [];
  const params = [];
  if (from) {
    conditions.push(`${column} >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(to);
  }
  return { sql: conditions.map((condition) => ` AND ${condition}`).join(""), params };
}

router.get("/income", async (req, res) => {
  try {
    const from = isValidDateString(req.query.from) ? req.query.from : null;
    const to = isValidDateString(req.query.to) ? req.query.to : null;
    if (from && to && from > to) fail("วันเริ่มต้องไม่หลังวันสิ้นสุด");
    const paid = settledRange("i.paid_at", from, to);
    const settled = settledRange("deposit_settled_at", from, to);
    const db = getPool();
    const [months] = await db.query(
      `SELECT DATE_FORMAT(i.paid_at, '%Y-%m') AS month, COUNT(*) AS invoice_count,
              SUM(i.rent_amount) AS rent, SUM(i.electricity_total) AS electricity, SUM(i.water_total) AS water,
              SUM(i.total_amount) AS total
       FROM MarketInvoice i WHERE i.status = 'paid'${paid.sql}
       GROUP BY month ORDER BY month ASC`,
      paid.params,
    );
    const [[deposit]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN deposit_status = 'forfeited' THEN deposit_amount ELSE deposit_deduction END), 0) AS income
       FROM MarketLeaseContract WHERE deposit_status IN ('forfeited', 'refunded')${settled.sql}`,
      settled.params,
    );
    const [[outstanding]] = await db.query(
      `SELECT COUNT(*) AS unpaid_count, COALESCE(SUM(total_amount), 0) AS unpaid_total,
              COALESCE(SUM(due_date < CURDATE()), 0) AS overdue_count
       FROM MarketInvoice WHERE status = 'unpaid'`,
    );
    const [[held]] = await db.query(
      "SELECT COALESCE(SUM(deposit_amount), 0) AS deposits_held FROM MarketLeaseContract WHERE deposit_status = 'held' AND status IN ('active', 'ended', 'terminated')",
    );
    const sum = (key) => fromCents(months.reduce((total, row) => total + toCents(row[key]), 0));
    return res.json({
      range: { from, to },
      months: months.map((row) => ({
        month: row.month,
        invoice_count: Number(row.invoice_count),
        rent: Number(row.rent),
        electricity: Number(row.electricity),
        water: Number(row.water),
        total: Number(row.total),
      })),
      totals: {
        rent: sum("rent"),
        electricity: sum("electricity"),
        water: sum("water"),
        invoices: sum("total"),
        deposit_income: Number(deposit.income),
      },
      outstanding: {
        unpaid_count: Number(outstanding.unpaid_count),
        unpaid_total: Number(outstanding.unpaid_total),
        overdue_count: Number(outstanding.overdue_count),
      },
      deposits_held: Number(held.deposits_held),
    });
  } catch (error) {
    return handleRouteError(res, error, "Market income error");
  }
});

router.get("/notifications", async (req, res) => {
  try {
    const db = getPool();
    const config = await loadMarketConfig(db);
    const items = [];
    const [pending] = await db.query(
      `SELECT b.id, b.created_at, s.code, v.vendor_name FROM MarketBooking b
       JOIN MarketStall s ON s.id = b.stall_id JOIN MarketVendor v ON v.id = b.vendor_id
       WHERE b.status = 'pending' ORDER BY b.id DESC`,
    );
    for (const row of pending) {
      items.push({ key: `market-booking-${row.id}`, type: "booking_pending", tone: "warning", section: "bookings", date: row.created_at,
        title: `การจองใหม่ ${row.code} รออนุมัติ`, detail: row.vendor_name });
    }
    const [approved] = await db.query(
      `SELECT b.id, b.reviewed_at, b.reviewed_by_name, s.code, v.vendor_name FROM MarketBooking b
       JOIN MarketStall s ON s.id = b.stall_id JOIN MarketVendor v ON v.id = b.vendor_id
       WHERE b.status = 'approved' AND b.reviewed_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ORDER BY b.id DESC`,
      [config.price_change_notice_days],
    );
    for (const row of approved) {
      items.push({ key: `market-booking-approved-${row.id}`, type: "booking_approved", tone: "success", section: "leases", date: row.reviewed_at,
        title: `การจอง ${row.code} ถูกอนุมัติโดย ${row.reviewed_by_name || "-"}`, detail: row.vendor_name });
    }
    const [lowStock] = await db.query(
      `SELECT p.id, p.name, p.quantity, p.quantity_limit, p.updated_at, s.code FROM MarketProduct p
       JOIN MarketStall s ON s.id = p.stall_id
       WHERE s.is_sandbox = FALSE AND p.quantity * 100 <= p.quantity_limit * ? ORDER BY p.quantity ASC LIMIT 50`,
      [config.low_stock_percent],
    );
    for (const row of lowStock) {
      items.push({ key: `market-low-${row.id}-${row.quantity}`, type: "low_stock", tone: "warning", section: "stalls", date: row.updated_at,
        title: `${row.name} (${row.code}) ใกล้หมด`, detail: `เหลือ ${row.quantity}/${row.quantity_limit}` });
    }
    const [expiring] = await db.query(
      `SELECT id, name, expires_at FROM MarketApiClient
       WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY) ORDER BY expires_at ASC`,
      [config.key_expiry_warning_days],
    );
    for (const row of expiring) {
      items.push({ key: `market-key-${row.id}-${new Date(row.expires_at).toISOString().slice(0, 10)}`, type: "key_expiring", tone: "danger", section: "api",
        date: row.expires_at, title: `API key ${row.name} ใกล้หมดอายุ`, detail: `หมดอายุ ${new Date(row.expires_at).toLocaleDateString("th-TH")}` });
    }
    const [priceLogs] = await db.query(
      `SELECT l.id, l.created_at, l.changes, c.name AS client_name FROM MarketApiLog l
       JOIN MarketApiClient c ON c.id = l.client_id
       WHERE l.method = 'PATCH' AND l.status_code = 200 AND l.changes LIKE '%"price"%'
         AND l.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY l.id DESC LIMIT 50`,
      [config.price_change_notice_days],
    );
    const productIds = priceLogs.map((row) => Number(JSON.parse(row.changes).target?.split(":")[1])).filter(Number.isSafeInteger);
    const [products] = productIds.length > 0
      ? await db.query("SELECT p.id, p.name, s.code FROM MarketProduct p JOIN MarketStall s ON s.id = p.stall_id WHERE p.id IN (?)", [productIds])
      : [[]];
    for (const row of priceLogs) {
      const changes = JSON.parse(row.changes);
      const product = products.find((item) => `product:${item.id}` === changes.target);
      const [before, after] = changes.price;
      items.push({ key: `market-price-${row.id}`, type: "price_changed", tone: "info", section: "stalls", date: row.created_at,
        title: `ราคา ${product ? `${product.name} (${product.code})` : changes.target} ถูกแก้ผ่าน API`, detail: `${before} → ${after} บาท โดย ${row.client_name}` });
    }
    const [unpaid] = await db.query(
      `SELECT i.id, i.period_month, i.total_amount, i.created_at, DATE_FORMAT(i.due_date, '%Y-%m-%d') AS due_date,
              i.due_date < CURDATE() AS overdue, lc.contract_no, s.code FROM MarketInvoice i
       JOIN MarketLeaseContract lc ON lc.id = i.contract_id JOIN MarketStall s ON s.id = lc.stall_id
       WHERE i.status = 'unpaid' ORDER BY i.period_month ASC LIMIT 50`,
    );
    for (const row of unpaid) {
      const overdue = Number(row.overdue) === 1;
      items.push({ key: `market-invoice-${row.id}-${overdue ? "overdue" : "due"}`, type: "invoice_unpaid", tone: overdue ? "danger" : "info",
        section: "leases", date: row.created_at, title: `ค่าเช่า ${row.code} เดือน ${row.period_month} ${overdue ? "เกินกำหนดชำระ" : "รอชำระ"}`,
        detail: `${Number(row.total_amount).toLocaleString("th-TH")} บาท · ครบกำหนด ${row.due_date || "-"} · ${row.contract_no}` });
    }
    const [expiringLeases] = await db.query(
      `SELECT lc.id, lc.contract_no, DATE_FORMAT(lc.end_date, '%Y-%m-%d') AS end_date, lc.end_date <= CURDATE() AS ended,
              s.code, v.vendor_name
       FROM MarketLeaseContract lc JOIN MarketStall s ON s.id = lc.stall_id JOIN MarketVendor v ON v.id = lc.vendor_id
       WHERE lc.status = 'active' AND lc.end_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY lc.end_date ASC`,
      [config.lease_expiry_warning_days],
    );
    for (const row of expiringLeases) {
      const ended = Number(row.ended) === 1;
      items.push({ key: `market-lease-end-${row.id}-${ended ? "past" : "soon"}`, type: "lease_expiring", tone: ended ? "danger" : "warning",
        section: "leases", date: row.end_date, title: ended ? `สัญญา ${row.code} ถึงวันสิ้นสุดแล้ว` : `สัญญา ${row.code} ใกล้หมด`,
        detail: `${row.vendor_name} · สิ้นสุด ${row.end_date} · ${row.contract_no}` });
    }
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.json({ notifications: items });
  } catch (error) {
    return handleRouteError(res, error, "Market notifications error");
  }
});

export default router;
