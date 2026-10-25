import { authenticate } from "./authMiddleware.js";

const AUTH_SERVICE_URL = (process.env.AUTH_SERVICE_URL || `http://localhost:${process.env.AUTH_PORT || 4001}`).replace(/\/$/, "");
const MARKET_ROLES = new Set(["Staff", "Admin", "Owner"]);
const ACCOUNT_CACHE_MS = 30_000;
const AUTH_TIMEOUT_MS = 5_000;
const MAX_CACHED_ACCOUNTS = 500;

const accountCache = new Map();

export async function fetchAuthService(path, authorization) {
  const response = await fetch(`${AUTH_SERVICE_URL}${path}`, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function fetchAccount(authorization) {
  const cached = accountCache.get(authorization);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const result = await fetchAuthService("/api/auth/account", authorization);
  if (result.status === 200 || result.status === 401) {
    if (accountCache.size >= MAX_CACHED_ACCOUNTS) accountCache.clear();
    accountCache.set(authorization, { result, expiresAt: Date.now() + ACCOUNT_CACHE_MS });
  }
  return result;
}

async function requireMarketActor(req, res, next) {
  if (!MARKET_ROLES.has(req.user?.role)) {
    return res.status(403).json({ message: "ไม่ได้รับอนุญาต (เฉพาะพนักงาน ผู้ดูแลระบบ และเจ้าของ)" });
  }
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

export const requireMarketAccount = [authenticate, requireMarketActor];

export function allowRoles(roles, message) {
  const allowed = new Set(roles);
  return function requireMarketRole(req, res, next) {
    if (!allowed.has(req.actor?.role)) return res.status(403).json({ message });
    return next();
  };
}

export const canManageShops = allowRoles(["Admin", "Owner"], "เฉพาะผู้ดูแลระบบและเจ้าของเท่านั้นที่สร้างหรือแก้ไขร้านค้าได้");
export const canOperateMarket = allowRoles(["Staff", "Admin"], "เฉพาะพนักงานและผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้ (เจ้าของดูได้อย่างเดียว)");
