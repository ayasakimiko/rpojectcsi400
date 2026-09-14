import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export const STAFF_ROLES = new Set(["Staff", "Admin", "Owner"]);
export const ADMIN_ROLES = new Set(["Admin", "Owner"]);

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
  }

  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
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
