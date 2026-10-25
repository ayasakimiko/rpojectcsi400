import { authenticate, requireAdminRole } from "./authMiddleware.js";

const ACCOUNT_CHECK_URL = process.env.MARKET_ACCOUNT_CHECK_URL
  || `http://localhost:${process.env.AUTH_PORT || 4001}/api/auth/account`;
const ACCOUNT_CACHE_MS = 30_000;
const ACCOUNT_TIMEOUT_MS = 5_000;
const MAX_CACHED_ACCOUNTS = 500;

const accountCache = new Map();

async function fetchAccount(authorization) {
  const cached = accountCache.get(authorization);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const response = await fetch(ACCOUNT_CHECK_URL, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(ACCOUNT_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  const result = { status: response.status, body };
  if (response.status === 200 || response.status === 401) {
    if (accountCache.size >= MAX_CACHED_ACCOUNTS) accountCache.clear();
    accountCache.set(authorization, { result, expiresAt: Date.now() + ACCOUNT_CACHE_MS });
  }
  return result;
}

export async function requireMarketActor(req, res, next) {
  try {
    const { status, body } = await fetchAccount(req.headers.authorization);
    if (status === 401) return res.status(401).json({ message: body.message || "กรุณาเข้าสู่ระบบใหม่" });
    if (status !== 200 || body.id !== req.user.id || body.role !== req.user.role) {
      return res.status(503).json({ message: "ตรวจสอบบัญชีไม่ได้ กรุณาลองใหม่อีกครั้ง" });
    }
    req.actor = { id: body.id, role: body.role, name: body.name };
    return next();
  } catch (error) {
    console.error("Market account check error:", error.message);
    return res.status(503).json({ message: "ตรวจสอบบัญชีไม่ได้ กรุณาลองใหม่อีกครั้ง" });
  }
}

export const requireMarketAdmin = [authenticate, requireAdminRole, requireMarketActor];
