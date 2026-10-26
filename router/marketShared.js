import {
  MAX_MONEY,
  isValidDateString,
  isValidIdcard,
  isValidPhone,
  validateText,
} from "../src/utils/validators.js";
import { addContractMonths } from "../src/utils/rentalContract.js";

export const LEASE_MAX_MONTHS = 12;

// Last allowed end date (inclusive) for a lease starting on startKey, e.g. 2026-01-15 → 2027-01-14.
export function leaseMaxEndKey(startKey) {
  const end = addContractMonths(new Date(`${startKey}T00:00:00`), LEASE_MAX_MONTHS);
  end.setDate(end.getDate() - 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

export const PRODUCT_FIELDS = ["sku", "name", "category", "price", "stock", "unit", "description", "is_available"];

const MAX_STOCK = 1_000_000;
const MAX_PRICE = 1_000_000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const SELECT_PRODUCTS = `SELECT id, shop_id, sku, name, category, price, stock, unit, description, is_available, updated_by, created_at, updated_at
  FROM ShopProduct WHERE shop_id = ? ORDER BY category, name, id`;
const SELECT_PRODUCT = `SELECT id, shop_id, sku, name, category, price, stock, unit, description, is_available, updated_by, created_at, updated_at
  FROM ShopProduct WHERE id = ? AND shop_id = ?`;
const INSERT_PRODUCT = `INSERT INTO ShopProduct (shop_id, sku, name, category, price, stock, unit, description, is_available, updated_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const UPDATE_PRODUCT = `UPDATE ShopProduct SET
    sku = IF(?, ?, sku),
    name = IF(?, ?, name),
    category = IF(?, ?, category),
    price = IF(?, ?, price),
    stock = IF(?, ?, stock),
    unit = IF(?, ?, unit),
    description = IF(?, ?, description),
    is_available = IF(?, ?, is_available),
    updated_by = ?
  WHERE id = ? AND shop_id = ?`;
const DELETE_PRODUCT = "DELETE FROM ShopProduct WHERE id = ? AND shop_id = ?";

export class MarketError extends Error {
  constructor(status, message, code = "VALIDATION_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const fail = (message, status = 400, code) => new MarketError(status, message, code);

export function serializeShop(row) {
  return {
    ...row,
    area_sqm: Number(row.area_sqm),
    monthly_rent: Number(row.monthly_rent),
  };
}

export function serializeLease(row) {
  return {
    ...row,
    monthly_rent: Number(row.monthly_rent),
    deposit: Number(row.deposit),
    active_keys: Number(row.active_keys || 0),
  };
}

export function serializeProduct(row) {
  return {
    ...row,
    price: Number(row.price),
    stock: Number(row.stock),
    is_available: Boolean(row.is_available),
  };
}

export function maskIdcard(value) {
  return typeof value === "string" && value.length === 13 ? `${value.slice(0, 1)}-XXXX-XXXXX-${value.slice(10, 12)}-${value.slice(12)}` : value;
}

function text(body, field, label, maxLength, { required = true } = {}) {
  const error = validateText(body[field], label, { maxLength, required });
  if (error) throw fail(error);
  const value = typeof body[field] === "string" ? body[field].trim() : "";
  return value || null;
}

function money(value, label, { max = MAX_MONEY, allowZero = true } = {}) {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0) || amount > max
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    throw fail(`${label}ไม่ถูกต้อง`);
  }
  return Math.round(amount * 100) / 100;
}

function integer(value, label, min, max) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) throw fail(`${label}ต้องเป็นจำนวนเต็ม ${min}-${max.toLocaleString("en-US")}`);
  return number;
}

function time(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) throw fail(`${label}ต้องอยู่ในรูปแบบ HH:MM`);
  return value;
}

export function validateShopInput(body = {}) {
  const shop = {
    code: text(body, "code", "รหัสร้าน", 20),
    name: text(body, "name", "ชื่อร้าน", 150),
    shop_type: text(body, "shop_type", "ประเภทร้าน", 100),
    location: text(body, "location", "ตำแหน่งร้าน", 255),
    area_sqm: money(body.area_sqm ?? 0, "ขนาดพื้นที่", { max: 10_000 }),
    monthly_rent: money(body.monthly_rent, "ค่าเช่าต่อเดือน", { allowZero: false }),
    open_time: time(body.open_time, "เวลาเปิด"),
    close_time: time(body.close_time, "เวลาปิด"),
    description: text(body, "description", "รายละเอียดร้าน", 1000, { required: false }),
    caretaker_staff_id: body.caretaker_staff_id === undefined || body.caretaker_staff_id === null || body.caretaker_staff_id === ""
      ? null
      : integer(body.caretaker_staff_id, "พนักงานผู้ดูแล", 1, 2_147_483_647),
  };
  if (!/^[A-Za-z0-9-]+$/.test(shop.code)) throw fail("รหัสร้านใช้ได้เฉพาะ A-Z, 0-9 และ -");
  shop.code = shop.code.toUpperCase();
  if ((shop.open_time === null) !== (shop.close_time === null)) throw fail("กรุณาระบุเวลาเปิดและเวลาปิดให้ครบ");
  return shop;
}

export function validateLeaseInput(body = {}) {
  const lease = {
    shop_id: integer(body.shop_id, "ร้านค้า", 1, 2_147_483_647),
    tenant_name: text(body, "tenant_name", "ชื่อผู้เช่า", 255),
    tenant_phone: typeof body.tenant_phone === "string" ? body.tenant_phone.trim() : "",
    tenant_idcard: typeof body.tenant_idcard === "string" ? body.tenant_idcard.trim() : "",
    tenant_email: text(body, "tenant_email", "อีเมล", 255, { required: false }),
    business_name: text(body, "business_name", "ชื่อกิจการ", 150, { required: false }),
    start_date: body.start_date,
    end_date: body.end_date,
    monthly_rent: money(body.monthly_rent, "ค่าเช่าต่อเดือน", { allowZero: false }),
    deposit: money(body.deposit ?? 0, "เงินมัดจำ"),
    payment_due_day: integer(body.payment_due_day ?? 5, "วันครบกำหนดชำระ", 1, 28),
    terms: text(body, "terms", "เงื่อนไขสัญญา", 2000, { required: false }),
  };
  if (!isValidPhone(lease.tenant_phone)) throw fail("เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก");
  if (!isValidIdcard(lease.tenant_idcard)) throw fail("เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก");
  if (lease.tenant_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lease.tenant_email)) throw fail("รูปแบบอีเมลไม่ถูกต้อง");
  if (!isValidDateString(lease.start_date) || !isValidDateString(lease.end_date)) throw fail("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
  if (lease.end_date <= lease.start_date) throw fail("วันสิ้นสุดสัญญาต้องอยู่หลังวันเริ่มสัญญา");
  if (lease.end_date > leaseMaxEndKey(lease.start_date)) throw fail(`สัญญาเช่าร้านค้ายาวได้ไม่เกิน ${LEASE_MAX_MONTHS} เดือน`);
  return lease;
}

export function validateProductInput(body = {}, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("รูปแบบข้อมูลไม่ถูกต้อง");
  const unknown = Object.keys(body).filter((field) => !PRODUCT_FIELDS.includes(field));
  if (unknown.length > 0) throw fail(`แก้ไขฟิลด์นี้ไม่ได้: ${unknown.join(", ")}`, 400, "FIELD_NOT_ALLOWED");
  const has = (field) => !partial || Object.hasOwn(body, field);
  const product = {};
  if (has("name")) product.name = text(body, "name", "ชื่อสินค้า", 150);
  if (has("category")) product.category = text(body, "category", "ประเภทสินค้า", 100);
  if (has("price")) product.price = money(body.price, "ราคาสินค้า", { max: MAX_PRICE });
  if (has("stock")) product.stock = integer(body.stock ?? 0, "จำนวนคงเหลือ", 0, MAX_STOCK);
  if (has("unit")) product.unit = text(body, "unit", "หน่วยนับ", 30, { required: false }) || "ชิ้น";
  if (has("sku")) product.sku = text(body, "sku", "รหัสสินค้า (SKU)", 40, { required: false });
  if (has("description")) product.description = text(body, "description", "รายละเอียดสินค้า", 500, { required: false });
  if (has("is_available")) {
    if (body.is_available !== undefined && typeof body.is_available !== "boolean") throw fail("is_available ต้องเป็น true หรือ false");
    product.is_available = body.is_available ?? true;
  }
  if (partial && Object.keys(product).length === 0) throw fail("ไม่มีข้อมูลที่ต้องแก้ไข");
  return product;
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== String(value)) throw fail("ไม่พบข้อมูล", 404, "NOT_FOUND");
  return id;
}

function isDuplicateSku(error) {
  return error?.code === "ER_DUP_ENTRY" && /uq_shop_product_sku/.test(error.message);
}

export async function listProducts(db, shopId) {
  const [rows] = await db.query(SELECT_PRODUCTS, [shopId]);
  return rows.map(serializeProduct);
}

export async function getProduct(db, shopId, productId) {
  const [[row]] = await db.query(SELECT_PRODUCT, [productId, shopId]);
  if (!row) throw fail("ไม่พบสินค้านี้ในร้าน", 404, "NOT_FOUND");
  return serializeProduct(row);
}

export async function createProduct(db, shopId, input, actorName) {
  try {
    const [result] = await db.query(INSERT_PRODUCT, [
      shopId, input.sku ?? null, input.name, input.category, input.price, input.stock ?? 0, input.unit ?? "ชิ้น",
      input.description ?? null, input.is_available ?? true, actorName,
    ]);
    return getProduct(db, shopId, result.insertId);
  } catch (error) {
    if (isDuplicateSku(error)) throw fail("รหัสสินค้า (SKU) นี้มีอยู่แล้วในร้าน", 409, "CONFLICT");
    throw error;
  }
}

export async function updateProduct(db, shopId, productId, input, actorName) {
  await getProduct(db, shopId, productId);
  const values = PRODUCT_FIELDS.flatMap((field) => [Object.hasOwn(input, field), input[field] ?? null]);
  try {
    await db.query(UPDATE_PRODUCT, [...values, actorName, productId, shopId]);
  } catch (error) {
    if (isDuplicateSku(error)) throw fail("รหัสสินค้า (SKU) นี้มีอยู่แล้วในร้าน", 409, "CONFLICT");
    throw error;
  }
  return getProduct(db, shopId, productId);
}

export async function deleteProduct(db, shopId, productId) {
  const [result] = await db.query(DELETE_PRODUCT, [productId, shopId]);
  if (result.affectedRows === 0) throw fail("ไม่พบสินค้านี้ในร้าน", 404, "NOT_FOUND");
}
