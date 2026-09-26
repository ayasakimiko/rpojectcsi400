import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool } from "../Database/connection.js";
import { validateLoginInput } from "../middleware/validation.js";

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
    const { username, password } = req.body ?? {};

    const validationError = validateLoginInput({ username, password });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const normalizedUsername = username.trim();
    const isIdcard = /^\d{13}$/.test(normalizedUsername);

    const pool = getPool();
    let user;
    if (isIdcard) {
      for (const table of ["Customer", "Staff", "Admin", "Owner"]) {
        const [rows] = await pool.query(`SELECT * FROM ${table} WHERE idcard = ?`, [normalizedUsername]);
        if (rows[0]) {
          user = rows[0];
          break;
        }
      }
    } else {
      const [rows] = await pool.query(
        `SELECT c.* FROM Customer c
         JOIN Booking b ON b.customer_id = c.id
         JOIN Room r ON r.id = b.room_id
         WHERE r.room_number = ?
         ORDER BY b.created_at DESC
         LIMIT 1`,
        [normalizedUsername],
      );
      user = rows[0];
    }

    if (!user) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้ หรือรหัสผ่านไม่ถูกต้อง" });
    }
    if (user.is_suspended) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้ หรือรหัสผ่านไม่ถูกต้อง" });
    }

    const isPhoneAsPassword = Boolean(user.phone) && password === user.phone;
    const passwordMatches = isPhoneAsPassword || (await bcrypt.compare(password, user.password));
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
