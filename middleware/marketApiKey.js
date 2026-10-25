import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getPool } from "../Database/connection.js";

export const MARKET_API_KEY_HEADER = "x-market-api-key";

const KEY_PATTERN = /^shk_[A-Za-z0-9]{10}_[A-Za-z0-9]{32}$/;
const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const RATE_LIMIT_PER_MIN = Number(process.env.MARKET_API_RATE_LIMIT) || 120;
const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

const rateWindows = new Map();

export function sendApiError(res, status, code, message) {
  return res.status(status).json({ code, message });
}

function randomText(length) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => KEY_ALPHABET[byte % KEY_ALPHABET.length]).join("");
}

export function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

const CIPHER_KEY = createHash("sha256")
  .update(process.env.MARKET_KEY_SECRET || `${process.env.JWT_SECRET || "dev-secret-change-me"}:market-api-key`)
  .digest();

export function encryptApiKey(key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", CIPHER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptApiKey(value) {
  const data = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", CIPHER_KEY, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

export function generateApiKey() {
  const prefix = `shk_${randomText(10)}`;
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
    allowed: window.count <= RATE_LIMIT_PER_MIN,
    remaining: Math.max(0, RATE_LIMIT_PER_MIN - window.count),
    retryAfter: Math.max(1, Math.ceil((window.startedAt + RATE_WINDOW_MS - now) / 1000)),
  };
}

export function marketApiCors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Market-Api-Key");
  res.setHeader("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
}

export async function authenticateApiKey(req, res, next) {
  if (req.headers.authorization) {
    return sendApiError(res, 401, "INVALID_API_KEY", "API ร้านค้าใช้ได้เฉพาะ X-Market-Api-Key ห้ามส่ง Authorization");
  }
  const key = req.headers[MARKET_API_KEY_HEADER];
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    return sendApiError(res, 401, "INVALID_API_KEY", "กรุณาส่ง API key ที่ถูกต้องใน header X-Market-Api-Key");
  }
  try {
    const db = getPool();
    const [[row]] = await db.query(
      `SELECT k.id, k.key_hash, k.label, k.lease_id, l.shop_id
       FROM ShopApiKey k
       JOIN ShopLease l ON l.id = k.lease_id
       JOIN Shop s ON s.id = l.shop_id
       WHERE k.key_prefix = ? AND k.revoked_at IS NULL AND l.status = 'active'
         AND l.end_date >= CURDATE() AND s.is_active = TRUE`,
      [key.slice(0, 14)],
    );
    if (!row || !sameHash(row.key_hash, hashApiKey(key))) {
      return sendApiError(res, 401, "INVALID_API_KEY", "API key ไม่ถูกต้อง ถูกยกเลิก หรือสัญญาเช่าสิ้นสุดแล้ว");
    }
    const slot = takeRateSlot(row.id);
    res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_PER_MIN));
    res.setHeader("X-RateLimit-Remaining", String(slot.remaining));
    if (!slot.allowed) {
      res.setHeader("Retry-After", String(slot.retryAfter));
      return sendApiError(res, 429, "RATE_LIMITED", "เรียกใช้งานเกินจำนวนที่กำหนดต่อนาที");
    }
    req.tenant = { keyId: row.id, label: row.label, leaseId: row.lease_id, shopId: row.shop_id };
    db.query("UPDATE ShopApiKey SET last_used_at = NOW() WHERE id = ?", [row.id])
      .catch((error) => console.error("Market API last_used_at error:", error.message));
    return next();
  } catch (error) {
    console.error("Market API key check error:", error);
    return sendApiError(res, 500, "SERVER_ERROR", "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง");
  }
}
