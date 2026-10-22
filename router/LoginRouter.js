import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool } from "../Database/connection.js";
import { validateLoginInput } from "../middleware/validation.js";

// ตั้งค่า Router อายุโทเคน และข้อมูลผู้ใช้ที่ส่งกลับหลังเข้าสู่ระบบ
const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";

function toPublicUser({ id, role, idcard, first_name, last_name }) {
  return { id, role, idcard, first_name, last_name };
}

// ตรวจสอบบัญชีและรหัสผ่าน เลือกบทบาทผู้ใช้ และออกโทเคนเข้าสู่ระบบ
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
          `SELECT id, idcard, password, phone, first_name, last_name, is_suspended${table === "Customer" ? ", room_number" : ""}
           FROM ${table} WHERE idcard = ?`,
          [normalizedUsername],
        );
        if (!rows[0] || rows[0].is_suspended) continue;
        candidates.push({ ...rows[0], role: table });
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

    if (candidates.length === 0) {
      return res.status(404).json({ message: "ไม่พบบัญชีผู้ใช้นี้" });
    }

    const matches = [];
    for (const candidate of candidates) {
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

    // บันทึกการเข้าสู่ระบบลงประวัติการใช้งาน หากบันทึกไม่สำเร็จจะไม่กระทบการเข้าสู่ระบบ
    const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim().slice(0, 45);
    pool.query(
      `INSERT INTO AuditLog (actor_id, actor_role, method, endpoint, status_code, ip_address)
       VALUES (?, ?, 'POST', '/api/auth/login', 200, ?)`,
      [user.id, user.role, ipAddress || null],
    ).catch((error) => console.error("Login audit log write error:", error));

    return res.json({ message: "เข้าสู่ระบบสำเร็จ", token, user: toPublicUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
