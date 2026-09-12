import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool } from "../Database/connection.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";

function toPublicUser(row) {
  const publicUser = { ...row };
  delete publicUser.password;
  return publicUser;
}

router.post("/login", async (req, res) => {
  try {
    const { idcard, password } = req.body;

    if (!idcard || !password) {
      return res.status(400).json({ message: "กรุณากรอกเลขบัตรประชาชนและรหัสผ่าน" });
    }

    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM Customer WHERE idcard = ?`, [idcard]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้ หรือรหัสผ่านไม่ถูกต้อง" });
    }
    if (user.is_suspended) {
      return res.status(403).json({ message: "บัญชีนี้ถูกระงับการใช้งาน" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้ หรือรหัสผ่านไม่ถูกต้อง" });
    }

    const token = jwt.sign({ id: user.id, role: user.role, idcard: user.idcard }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.json({ message: "เข้าสู่ระบบสำเร็จ", token, user: toPublicUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
