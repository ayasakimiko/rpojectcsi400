import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool } from "../Database/connection.js";
import { validateLoginInput } from "../middleware/validation.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";

function toPublicUser({ id, role, idcard, first_name, last_name }) {
  return { id, role, idcard, first_name, last_name };
}

router.post("/login", async (req, res) => {
  try {
    const { username, password, role: selectedRole } = req.body ?? {};

    const validationError = validateLoginInput({ username, password });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const normalizedUsername = username.trim();
    const isIdcard = /^\d{13}$/.test(normalizedUsername);

    const roles = ["Customer", "Staff", "Admin", "Owner"];
    if (selectedRole !== undefined && selectedRole !== "" && !roles.includes(selectedRole)) {
      return res.status(400).json({ message: "สิทธิ์ผู้ใช้งานไม่ถูกต้อง" });
    }
    const pool = getPool();
    const candidates = [];
    if (isIdcard) {
      for (const table of selectedRole ? [selectedRole] : roles) {
        const [rows] = await pool.query(
          `SELECT id, idcard, password, phone, first_name, last_name, is_suspended FROM ${table} WHERE idcard = ?`,
          [normalizedUsername],
        );
        if (rows[0]) candidates.push({ ...rows[0], role: table });
      }
    } else {
      const [rows] = await pool.query(
        `SELECT id, idcard, password, phone, first_name, last_name FROM Customer
         WHERE room_number = ? AND is_suspended = FALSE
         ORDER BY id DESC
         LIMIT 1`,
        [normalizedUsername],
      );
      if (rows[0] && (!selectedRole || selectedRole === "Customer")) candidates.push({ ...rows[0], role: "Customer" });
    }

    const matches = [];
    for (const candidate of candidates) {
      if (candidate.is_suspended) continue;
      const isPhoneAsPassword = Boolean(candidate.phone) && password === candidate.phone;
      if (isPhoneAsPassword || await bcrypt.compare(password, candidate.password)) matches.push(candidate);
    }
    if (matches.length === 0) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้ หรือรหัสผ่านไม่ถูกต้อง" });
    }
    if (matches.length > 1) {
      return res.status(409).json({ code: "LOGIN_ROLE_REQUIRED", roles: matches.map((candidate) => candidate.role),
        message: "พบหลายบัญชี กรุณาเลือกสิทธิ์ที่ต้องการเข้าสู่ระบบ" });
    }
    const user = matches[0];

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
