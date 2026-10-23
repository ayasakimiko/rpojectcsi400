import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { isValidPassword } from "../middleware/validation.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_PURPOSE = "password-reset";
const otpStore = new Map();

function isIdcard(value) {
  return typeof value === "string" && /^\d{13}$/.test(value.trim());
}

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)}-xxx-${phone.slice(-4)}` : "";
}

async function findCustomer(idcard) {
  const [rows] = await getPool().query(
    `SELECT id, idcard, phone, first_name, last_name, room_number FROM Customer
     WHERE idcard = ? AND is_suspended = FALSE AND room_number IS NOT NULL LIMIT 1`,
    [idcard],
  );
  return rows[0] || null;
}

router.post("/forgot-password/lookup", async (req, res) => {
  try {
    const { idcard } = req.body ?? {};
    if (!isIdcard(idcard)) {
      return res.status(400).json({ message: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง" });
    }
    const customer = await findCustomer(idcard.trim());
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบผู้เช่าที่ใช้เลขบัตรประชาชนนี้" });
    }

    const existing = otpStore.get(customer.idcard);
    const now = Date.now();
    if (existing && now - existing.sentAt < OTP_RESEND_MS) {
      return res.status(429).json({
        message: `กรุณารอ ${Math.ceil((OTP_RESEND_MS - (now - existing.sentAt)) / 1000)} วินาทีก่อนขอ OTP ใหม่`,
      });
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    otpStore.set(customer.idcard, { otp, sentAt: now, expiresAt: now + OTP_TTL_MS, attempts: 0 });
    console.log(`[OTP จำลอง] ส่ง SMS ไปยังเบอร์ ${customer.phone} (เลขบัตร ${customer.idcard}) รหัส OTP: ${otp} หมดอายุใน 5 นาที`);

    return res.json({
      message: `ส่งรหัส OTP ไปยังเบอร์ ${maskPhone(customer.phone)} แล้ว`,
      customer: {
        first_name: customer.first_name,
        last_name: customer.last_name,
        room_number: customer.room_number,
        phone: maskPhone(customer.phone),
      },
      expires_in: OTP_TTL_MS / 1000,
    });
  } catch (error) {
    console.error("Forgot password lookup error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const { idcard, otp } = req.body ?? {};
    if (!isIdcard(idcard) || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
      return res.status(400).json({ message: "กรุณากรอกรหัส OTP 6 หลักให้ถูกต้อง" });
    }
    const key = idcard.trim();
    const entry = otpStore.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ message: "รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่" });
    }
    if (entry.otp !== otp.trim()) {
      entry.attempts += 1;
      if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        otpStore.delete(key);
        return res.status(400).json({ message: "กรอก OTP ผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่" });
      }
      return res.status(400).json({ message: `รหัส OTP ไม่ถูกต้อง (เหลืออีก ${OTP_MAX_ATTEMPTS - entry.attempts} ครั้ง)` });
    }
    otpStore.delete(key);

    const customer = await findCustomer(key);
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบผู้เช่าที่ใช้เลขบัตรประชาชนนี้" });
    }
    const resetToken = jwt.sign({ id: customer.id, purpose: RESET_PURPOSE }, JWT_SECRET, { expiresIn: "10m" });
    return res.json({ message: "ยืนยัน OTP สำเร็จ กรุณาตั้งรหัสผ่านใหม่", reset_token: resetToken });
  } catch (error) {
    console.error("Forgot password verify error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { reset_token: resetToken, new_password: newPassword } = req.body ?? {};
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ message: "รหัสผ่านต้องมีความยาว 6-128 ตัวอักษร" });
    }
    let payload;
    try {
      payload = jwt.verify(typeof resetToken === "string" ? resetToken : "", JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "ลิงก์ตั้งรหัสผ่านหมดอายุ กรุณาทำรายการใหม่" });
    }
    if (payload.purpose !== RESET_PURPOSE) {
      return res.status(401).json({ message: "ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง กรุณาทำรายการใหม่" });
    }
    const [result] = await getPool().query(
      `UPDATE Customer SET password = ? WHERE id = ? AND is_suspended = FALSE AND room_number IS NOT NULL`,
      [await bcrypt.hash(newPassword, 10), payload.id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบบัญชีผู้เช่า" });
    }
    return res.json({ message: "ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง" });
  } catch (error) {
    console.error("Forgot password reset error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
