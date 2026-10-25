import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { getPool } from "../Database/connection.js";
import { MARKET_API_KEY_HEADER } from "../src/config/serviceRoutes.js";
import { API_KEY_MODE, MARKET_SCOPES } from "../src/utils/marketStatus.js";

export const MARKET_ERRORS = {
  VALIDATION_ERROR: [400, "ข้อมูลไม่ถูกต้อง"],
  FIELD_NOT_ALLOWED: [400, "มีฟิลด์ที่แก้ไขไม่ได้"],
  QUANTITY_OUT_OF_RANGE: [400, "จำนวนเกินขอบเขตที่กำหนด"],
  INVALID_API_KEY: [401, "API key ไม่ถูกต้อง ถูกระงับ หรือหมดอายุ"],
  SCOPE_REQUIRED: [403, "API key นี้ไม่มีสิทธิ์ทำรายการนี้"],
  FORBIDDEN: [403, "ไม่อนุญาตให้เข้าถึง"],
  NOT_FOUND: [404, "ไม่พบข้อมูล"],
  CONFLICT: [409, "ข้อมูลถูกแก้ไขไปแล้ว กรุณาอ่านค่าล่าสุด"],
  RATE_LIMITED: [429, "เรียกใช้งานเกินจำนวนที่กำหนดต่อนาที"],
  SERVER_ERROR: [500, "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง"],
};

const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY_ID_LENGTH = 8;
const KEY_SECRET_LENGTH = 32;
const KEY_PATTERN = /^mk_(live|test)_[A-Za-z0-9]{40}$/;
const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 10_000;

const rateWindows = new Map();

export function sendMarketError(res, code, message = MARKET_ERRORS[code][1]) {
  return res.status(MARKET_ERRORS[code][0]).json({ code, message });
}

function randomText(length) {
  return Array.from({ length }, () => KEY_ALPHABET[randomInt(KEY_ALPHABET.length)]).join("");
}

export function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(mode) {
  const prefix = `${API_KEY_MODE[mode].prefix}${randomText(KEY_ID_LENGTH)}`;
  const key = `${prefix}${randomText(KEY_SECRET_LENGTH)}`;
  return { key, prefix, hash: hashApiKey(key) };
}

function sameHash(hexA, hexB) {
  if (typeof hexA !== "string" || typeof hexB !== "string" || hexA.length !== hexB.length) return false;
  return timingSafeEqual(Buffer.from(hexA, "hex"), Buffer.from(hexB, "hex"));
}

export function parseJsonList(text) {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function parseScopes(text) {
  return parseJsonList(text).filter((scope) => Object.hasOwn(MARKET_SCOPES, scope));
}

export function normalizeIp(value) {
  if (typeof value !== "string") return null;
  const ip = value.trim().replace(/^::ffff:/i, "");
  return isIP(ip) ? ip : null;
}

export function parseIpList(text) {
  return parseJsonList(text).map(normalizeIp).filter(Boolean);
}

export function normalizeOrigin(value) {
  if (typeof value !== "string" || value.includes("*")) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" || value.trim().replace(/\/$/, "") !== url.origin) return null;
  return url.origin;
}

function takeRateSlot(clientId, limit) {
  const now = Date.now();
  let window = rateWindows.get(clientId);
  if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
    if (rateWindows.size >= MAX_TRACKED_CLIENTS) rateWindows.clear();
    window = { startedAt: now, count: 0 };
    rateWindows.set(clientId, window);
  }
  window.count += 1;
  return {
    allowed: window.count <= limit,
    remaining: Math.max(0, limit - window.count),
    retryAfter: Math.max(1, Math.ceil((window.startedAt + RATE_WINDOW_MS - now) / 1000)),
  };
}

function recordApiCall(req, res) {
  const changes = res.locals.marketChanges;
  const clientId = req.marketClient?.id ?? null;
  const path = (req.originalUrl || "").split("?")[0].slice(0, 255);
  const db = getPool();
  db.query(
    `INSERT INTO MarketApiLog (client_id, request_id, method, path, status_code, ip, changes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [clientId, req.marketRequestId, req.method.slice(0, 10), path, res.statusCode, (req.ip || "").slice(0, 45) || null,
      changes ? JSON.stringify(changes) : null],
  ).catch((error) => console.error("Market API log write error:", error));
  if (clientId) {
    db.query("UPDATE MarketApiClient SET last_used_at = NOW() WHERE id = ?", [clientId])
      .catch((error) => console.error("Market API last_used_at error:", error));
  }
}

async function findClient(db, key) {
  const prefix = key.slice(0, 16);
  const [rows] = await db.query(
    `SELECT id, mode, scopes, key_prefix, key_hash, previous_key_prefix, previous_key_hash,
            previous_key_expires_at > NOW() AS previous_valid, allowed_ips, rate_limit_per_min, is_active,
            expires_at IS NOT NULL AND expires_at <= NOW() AS expired
     FROM MarketApiClient WHERE key_prefix = ? OR previous_key_prefix = ? LIMIT 2`,
    [prefix, prefix],
  );
  const hash = hashApiKey(key);
  return rows.find((row) => (
    (row.key_prefix === prefix && sameHash(row.key_hash, hash))
    || (row.previous_key_prefix === prefix && Number(row.previous_valid) === 1 && sameHash(row.previous_key_hash, hash))
  )) || null;
}

export async function authenticateMarketKey(req, res, next) {
  req.marketRequestId = randomUUID();
  res.setHeader("X-Request-Id", req.marketRequestId);
  res.on("finish", () => recordApiCall(req, res));
  try {
    if (req.headers.authorization) {
      return sendMarketError(res, "INVALID_API_KEY", "API นี้ใช้ได้เฉพาะ X-Market-Api-Key ห้ามส่ง Authorization");
    }
    const key = req.headers[MARKET_API_KEY_HEADER];
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) return sendMarketError(res, "INVALID_API_KEY");
    const db = getPool();
    const client = await findClient(db, key);
    if (!client || !client.is_active || Number(client.expired) === 1) return sendMarketError(res, "INVALID_API_KEY");

    const allowedIps = parseIpList(client.allowed_ips);
    if (allowedIps.length > 0 && !allowedIps.includes(normalizeIp(req.ip))) {
      return sendMarketError(res, "FORBIDDEN", "IP นี้ไม่ได้รับอนุญาตให้ใช้ API key นี้");
    }

    const origin = req.headers.origin;
    if (origin) {
      const [[linked]] = await db.query(
        `SELECT 1 AS ok FROM MarketApiClientOrigin co
         JOIN MarketAllowedOrigin o ON o.id = co.origin_id
         WHERE co.client_id = ? AND o.origin = ? AND o.is_active = TRUE`,
        [client.id, origin],
      );
      if (!linked) return sendMarketError(res, "FORBIDDEN", "domain นี้ไม่ได้ผูกกับ API key นี้");
    }

    const limit = Number(client.rate_limit_per_min);
    const slot = takeRateSlot(client.id, limit);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(slot.remaining));
    req.marketClient = { id: client.id, mode: client.mode, scopes: new Set(parseScopes(client.scopes)) };
    if (!slot.allowed) {
      res.setHeader("Retry-After", String(slot.retryAfter));
      return sendMarketError(res, "RATE_LIMITED");
    }

    const [stalls] = await db.query(
      `SELECT cs.stall_id FROM MarketApiClientStall cs
       JOIN MarketStall s ON s.id = cs.stall_id
       WHERE cs.client_id = ? AND s.unit_kind = 'rentable' AND s.is_sandbox = ?`,
      [client.id, client.mode === "test"],
    );
    req.marketClient.stallIds = stalls.map((row) => row.stall_id);
    return next();
  } catch (error) {
    console.error("Market API key check error:", error);
    return sendMarketError(res, "SERVER_ERROR");
  }
}

export function requireScope(scope) {
  return function requireMarketScope(req, res, next) {
    if (!req.marketClient?.scopes.has(scope)) return sendMarketError(res, "SCOPE_REQUIRED");
    return next();
  };
}
