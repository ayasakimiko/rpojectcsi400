import { randomBytes, timingSafeEqual } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { encryptApiKey, hashApiKey, sendApiError } from "./marketApiKey.js";

export const REPAIR_API_KEY_HEADER = "x-repair-api-key";

const KEY_PATTERN = /^rpk_[A-Za-z0-9]{10}_[A-Za-z0-9]{32}$/;
const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const REPAIR_RATE_LIMIT_PER_MIN = Number(process.env.REPAIR_API_RATE_LIMIT) || 120;
const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

const rateWindows = new Map();

function randomText(length) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => KEY_ALPHABET[byte % KEY_ALPHABET.length]).join("");
}

export function generateRepairApiKey() {
  const prefix = `rpk_${randomText(10)}`;
  const key = `${prefix}_${randomText(32)}`;
  return { key, prefix, hash: hashApiKey(key), cipher: encryptApiKey(key) };
}

function sameHash(a, b) {
  return typeof a === "string" && typeof b === "string" && a.length === b.length
    && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function takeRateSlot(keyId) {
  const now = Date.now();
  let window = rateWindows.get(keyId);
  if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
    if (rateWindows.size >= MAX_TRACKED_KEYS) rateWindows.clear();
    window = { startedAt: now, count: 0 };
    rateWindows.set(keyId, window);
  }
  window.count += 1;
  return {
    allowed: window.count <= REPAIR_RATE_LIMIT_PER_MIN,
    remaining: Math.max(0, REPAIR_RATE_LIMIT_PER_MIN - window.count),
    retryAfter: Math.max(1, Math.ceil((window.startedAt + RATE_WINDOW_MS - now) / 1000)),
  };
}

export function repairApiCors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Repair-Api-Key");
  res.setHeader("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
}

export async function authenticateRepairApiKey(req, res, next) {
  if (req.headers.authorization) {
    return sendApiError(res, 401, "INVALID_API_KEY", "API ช่างซ่อมใช้ได้เฉพาะ X-Repair-Api-Key ห้ามส่ง Authorization");
  }
  const key = req.headers[REPAIR_API_KEY_HEADER];
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    return sendApiError(res, 401, "INVALID_API_KEY", "กรุณาส่ง API key ที่ถูกต้องใน header X-Repair-Api-Key");
  }
  try {
    const db = getPool();
    const [[row]] = await db.query(
      `SELECT k.id, k.key_hash, k.label, k.vendor_id, v.name AS vendor_name
       FROM RepairVendorApiKey k
       JOIN RepairVendor v ON v.id = k.vendor_id
       WHERE k.key_prefix = ? AND k.revoked_at IS NULL AND v.is_active = TRUE
         AND v.contract_start <= CURDATE() AND v.contract_end >= CURDATE()`,
      [key.slice(0, 14)],
    );
    if (!row || !sameHash(row.key_hash, hashApiKey(key))) {
      return sendApiError(res, 401, "INVALID_API_KEY", "API key ไม่ถูกต้อง ถูกยกเลิก หรือสัญญาซ่อมไม่อยู่ในช่วงที่ใช้งานได้");
    }
    const slot = takeRateSlot(row.id);
    res.setHeader("X-RateLimit-Limit", String(REPAIR_RATE_LIMIT_PER_MIN));
    res.setHeader("X-RateLimit-Remaining", String(slot.remaining));
    if (!slot.allowed) {
      res.setHeader("Retry-After", String(slot.retryAfter));
      return sendApiError(res, 429, "RATE_LIMITED", "เรียกใช้งานเกินจำนวนที่กำหนดต่อนาที");
    }
    req.vendor = { keyId: row.id, label: row.label, vendorId: row.vendor_id, name: row.vendor_name };
    db.query("UPDATE RepairVendorApiKey SET last_used_at = NOW() WHERE id = ?", [row.id])
      .catch((error) => console.error("Repair API last_used_at error:", error.message));
    return next();
  } catch (error) {
    console.error("Repair API key check error:", error);
    return sendApiError(res, 500, "SERVER_ERROR", "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง");
  }
}
