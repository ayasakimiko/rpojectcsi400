import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export const STAFF_ROLES = new Set(["Staff", "Admin", "Owner"]);
export const ADMIN_ROLES = new Set(["Admin", "Owner"]);

export const AUTH_COOKIE = "auth_token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAME_SITE_VALUES = new Set(["strict", "lax", "none"]);

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function readAuthToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return { token: header.slice(7), fromCookie: false };
  const cookie = readCookie(req, AUTH_COOKIE);
  return cookie ? { token: cookie, fromCookie: true } : null;
}

export function authCookieOptions() {
  const configured = String(process.env.COOKIE_SAMESITE || "").toLowerCase();
  const sameSite = SAME_SITE_VALUES.has(configured) ? configured : "lax";
  return { httpOnly: true, sameSite, secure: sameSite === "none" || process.env.COOKIE_SECURE === "true", path: "/" };
}

export function authenticate(req, res, next) {
  const auth = readAuthToken(req);
  if (!auth) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
  }
  if (auth.fromCookie && !SAFE_METHODS.has(req.method) && req.get("x-requested-with") !== "XMLHttpRequest") {
    return res.status(403).json({ message: "คำขอไม่ถูกต้อง กรุณาโหลดหน้าเว็บใหม่" });
  }

  try {
    req.user = jwt.verify(auth.token, JWT_SECRET);
    req.authorization = `Bearer ${auth.token}`;
    return next();
  } catch {
    return res.status(401).json({ message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
  }
}

export function requireStaffRole(req, res, next) {
  if (!STAFF_ROLES.has(req.user?.role)) {
    return res.status(403).json({ message: "ไม่ได้รับอนุญาต (ต้องเป็นเจ้าหน้าที่)" });
  }
  next();
}

export function requireAdminRole(req, res, next) {
  if (!ADMIN_ROLES.has(req.user?.role)) {
    return res.status(403).json({ message: "ไม่ได้รับอนุญาต (ต้องเป็นผู้ดูแลระบบ)" });
  }
  next();
}

export function requireOwnerRole(req, res, next) {
  if (req.user?.role !== "Owner") {
    return res.status(403).json({ message: "ไม่ได้รับอนุญาต (ต้องเป็นเจ้าของ)" });
  }
  next();
}

export function requireCustomerRole(req, res, next) {
  if (req.user?.role !== "Customer") {
    return res.status(403).json({ message: "ไม่ได้รับอนุญาต (ต้องเป็นลูกค้า)" });
  }
  next();
}

const ACCOUNT_TABLES = { Customer: "Customer", Staff: "Staff", Admin: "Admin", Owner: "Owner" };

export function createRequireActiveAccount(getPool) {
  return async function requireActiveAccount(req, res, next) {
    const { role, id } = req.user || {};
    if (!Object.hasOwn(ACCOUNT_TABLES, role) || !Number.isSafeInteger(id) || id <= 0) {
      return res.status(401).json({ message: "กรุณาเข้าสู่ระบบใหม่" });
    }
    try {
      const [rows] = await getPool().query(
        `SELECT is_suspended FROM ${ACCOUNT_TABLES[role]} WHERE id = ?`,
        [id],
      );
      if (!rows[0] || rows[0].is_suspended) {
        return res.status(401).json({ message: "บัญชีนี้ถูกระงับหรือไม่มีอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบ" });
      }
      return next();
    } catch (error) {
      console.error("Check account status error:", error);
      return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
    }
  };
}
