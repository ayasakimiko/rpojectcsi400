import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

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
