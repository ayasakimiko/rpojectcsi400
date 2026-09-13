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

function validateLoginInput({ idcard, password }) {
  if (typeof idcard !== "string" || typeof password !== "string") {
    return "รูปแบบข้อมูลไม่ถูกต้อง";
  }
  if (!idcard.trim() || !password) {
    return "กรุณากรอกเลขบัตรประชาชนและรหัสผ่าน";
  }
  if (!/^\d{13}$/.test(idcard.trim())) {
    return "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
  }
  if (password.length < 6 || password.length > 128) {
    return "เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง";
  }
  return null;
}

router.post("/login", async (req, res) => {
  try {
    const { idcard, password } = req.body ?? {};

    const validationError = validateLoginInput({ idcard, password });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const normalizedIdcard = idcard.trim();

    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM Customer WHERE idcard = ?`, [normalizedIdcard]);
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
