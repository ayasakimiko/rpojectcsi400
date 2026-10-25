import fs from "node:fs";
import path from "node:path";
import { PUBLIC_UPLOAD_DIR } from "../middleware/publicUploads.js";

export const SERVER_ERROR = "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง";
export const MARKET_CONTRACT_DIR = path.join(PUBLIC_UPLOAD_DIR, "contracts", "market-leases");
export const MAX_CONTRACT_IMAGES = 10;
export const MAX_CONTRACT_IMAGE_BYTES = 5 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const CONTRACT_IMAGE_TYPES = {
  "image/jpeg": { ext: ".jpg", matches: (header) => header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff },
  "image/png": { ext: ".png", matches: (header) => header.subarray(0, 8).equals(PNG_SIGNATURE) },
  "image/webp": {
    ext: ".webp",
    matches: (header) => header.toString("latin1", 0, 4) === "RIFF" && header.toString("latin1", 8, 12) === "WEBP",
  },
};

export class HttpError extends Error {
  constructor(status, message, data = undefined) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export function handleRouteError(res, error, context) {
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, ...error.data });
  if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว" });
  console.error(`${context}:`, error);
  return res.status(500).json({ message: SERVER_ERROR });
}

const CONFIG_NUMBER_FIELDS = [
  "electricity_unit_price", "electricity_flat_price", "water_unit_price", "water_flat_price",
  "default_deposit_months", "min_lease_months", "contract_min_images", "default_rate_limit_per_min",
  "key_default_expiry_days", "key_rotation_grace_hours", "log_retention_days", "low_stock_percent",
  "key_expiry_warning_days", "price_change_notice_days", "invoice_due_day", "lease_expiry_warning_days",
];

export async function loadMarketConfig(db) {
  const [[row]] = await db.query(
    `SELECT site_name, currency, TIME_FORMAT(open_time, '%H:%i') AS open_time, TIME_FORMAT(close_time, '%H:%i') AS close_time,
            electricity_unit_price, electricity_flat_price, water_unit_price, water_flat_price, default_deposit_months,
            min_lease_months, contract_min_images, contract_terms, default_rate_limit_per_min, key_default_expiry_days,
            key_rotation_grace_hours, log_retention_days, low_stock_percent, max_price_change_percent,
            key_expiry_warning_days, price_change_notice_days, invoice_due_day, lease_expiry_warning_days, updated_at
     FROM MarketConfig WHERE id = 1`,
  );
  if (!row) throw new Error("MarketConfig row is missing; run npm run db:migrate");
  const config = { ...row };
  for (const field of CONFIG_NUMBER_FIELDS) config[field] = Number(row[field]);
  config.max_price_change_percent = row.max_price_change_percent == null ? null : Number(row.max_price_change_percent);
  return config;
}

export async function recordMarketAudit(db, actor, action, target, details = null) {
  try {
    await db.query(
      `INSERT INTO MarketAuditLog (actor_role, actor_id, actor_name, action, target, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actor.role, actor.id ?? null, actor.name ?? null, action, target == null ? null : String(target).slice(0, 100),
        details == null ? null : JSON.stringify(details)],
    );
  } catch (error) {
    console.error("Market audit log write error:", error);
  }
}

export function toCents(value) {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents) {
  return cents / 100;
}

export function addMonthsToDate(dateString, months) {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function addDaysToDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayString() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isBooleanInput(value) {
  return typeof value === "boolean";
}

export function maskTaxId(value) {
  const text = String(value ?? "");
  return text.length > 4 ? `${"•".repeat(text.length - 4)}${text.slice(-4)}` : text;
}

export async function isRealContractImage(filePath, mimeType) {
  const type = CONTRACT_IMAGE_TYPES[mimeType];
  if (!type) return false;
  const handle = await fs.promises.open(filePath, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    return type.matches(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export async function refreshStallStatus(db, stallId) {
  const [[stall]] = await db.query("SELECT status, is_sandbox, unit_kind FROM MarketStall WHERE id = ?", [stallId]);
  if (!stall || stall.is_sandbox || stall.unit_kind !== "rentable" || stall.status === "closed") return;
  const today = todayString();
  const [[current]] = await db.query(
    `SELECT
       SUM(lc.status = 'active' AND lc.start_date <= ? AND lc.end_date > ?) AS occupied,
       SUM(lc.status = 'awaiting_signature' OR (lc.status = 'active' AND lc.start_date > ?)) AS reserved
     FROM MarketLeaseContract lc WHERE lc.stall_id = ?`,
    [today, today, today, stallId],
  );
  const status = Number(current.occupied) > 0 ? "occupied" : Number(current.reserved) > 0 ? "reserved" : "available";
  const [[tenant]] = await db.query(
    `SELECT v.vendor_name FROM MarketLeaseContract lc JOIN MarketVendor v ON v.id = lc.vendor_id
     WHERE lc.stall_id = ? AND lc.status = 'active' AND lc.start_date <= ? AND lc.end_date > ?
     ORDER BY lc.id DESC LIMIT 1`,
    [stallId, today, today],
  );
  await db.query(
    `UPDATE MarketStall SET status = ?, shop_name = IF(? = 'occupied', COALESCE(shop_name, ?), NULL), updated_at = NOW()
     WHERE id = ?`,
    [status, status, tenant?.vendor_name ?? null, stallId],
  );
}

export async function refreshAllStallStatuses(db) {
  const [stalls] = await db.query(
    "SELECT id FROM MarketStall WHERE is_sandbox = FALSE AND unit_kind = 'rentable' AND status <> 'closed'",
  );
  for (const stall of stalls) await refreshStallStatus(db, stall.id);
  return stalls.length;
}

export function invoiceDueDate(periodMonth, dueDay) {
  const [year, month] = periodMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${periodMonth}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
}
