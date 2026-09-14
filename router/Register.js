import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../Database/connection.js";

const router = Router();

function isValidDateTimeString(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function toMysqlDateTime(value) {
  return value.replace("T", " ");
}

function validateRegisterInput({
  idcard,
  password,
  phone,
  first_name,
  last_name,
  age,
  room_number,
  rental_start_date,
  rental_end_date,
  deposit_amount,
}) {
  if (
    typeof idcard !== "string" ||
    typeof password !== "string" ||
    typeof phone !== "string" ||
    typeof first_name !== "string" ||
    typeof last_name !== "string"
  ) {
    return "รูปแบบข้อมูลไม่ถูกต้อง";
  }
  if (
    !idcard.trim() ||
    !password ||
    !phone.trim() ||
    !first_name.trim() ||
    !last_name.trim() ||
    !age ||
    !room_number ||
    !rental_start_date ||
    !rental_end_date
  ) {
    return "กรุณากรอกข้อมูลให้ครบทุกช่อง";
  }
  if (!/^\d{13}$/.test(idcard.trim())) {
    return "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
  }
  if (!/^0\d{8,9}$/.test(phone.trim())) {
    return "เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก";
  }
  if (password.length < 6 || password.length > 128) {
    return "รหัสผ่านต้องมีความยาว 6-128 ตัวอักษร";
  }
  const ageNumber = Number(age);
  if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
    return "อายุไม่ถูกต้อง";
  }
  const roomNumberValue = Number(room_number);
  if (!Number.isInteger(roomNumberValue) || roomNumberValue < 1) {
    return "เลขห้องไม่ถูกต้อง";
  }
  if (!isValidDateTimeString(rental_start_date) || !isValidDateTimeString(rental_end_date)) {
    return "วันเวลาที่เริ่มเช่าหรือวันเวลาที่สิ้นสุดสัญญาไม่ถูกต้อง";
  }
  const startDate = new Date(rental_start_date);
  const endDate = new Date(rental_end_date);
  if (endDate <= startDate) {
    return "วันเวลาที่สิ้นสุดสัญญาต้องอยู่หลังวันเวลาที่เริ่มเช่า";
  }
  if (deposit_amount !== undefined && deposit_amount !== null && deposit_amount !== "") {
    const depositValue = Number(deposit_amount);
    if (!Number.isFinite(depositValue) || depositValue < 0) {
      return "จำนวนเงินมัดจำไม่ถูกต้อง";
    }
  }
  return null;
}

router.post("/register", async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const {
      idcard,
      password,
      phone,
      first_name,
      last_name,
      age,
      room_number,
      rental_start_date,
      rental_end_date,
      deposit_amount,
    } = req.body ?? {};

    const validationError = validateRegisterInput({
      idcard,
      password,
      phone,
      first_name,
      last_name,
      age,
      room_number,
      rental_start_date,
      rental_end_date,
      deposit_amount,
    });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const normalizedIdcard = idcard.trim();
    const normalizedRoomNumber = Number(room_number);
    const normalizedDepositAmount =
      deposit_amount !== undefined && deposit_amount !== null && deposit_amount !== ""
        ? Number(deposit_amount)
        : null;

    await connection.beginTransaction();

    const [existingRows] = await connection.query(`SELECT id FROM Customer WHERE idcard = ?`, [normalizedIdcard]);
    if (existingRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: "เลขบัตรประชาชนนี้ถูกใช้สมัครสมาชิกแล้ว" });
    }

    const [roomRows] = await connection.query(
      `SELECT id, is_booked FROM Room WHERE room_number = ? FOR UPDATE`,
      [normalizedRoomNumber],
    );

    const room = roomRows[0];
    if (!room) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    }
    if (room.is_booked) {
      await connection.rollback();
      return res.status(409).json({ message: "ห้องพักนี้ถูกจองแล้ว" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [customerResult] = await connection.query(
      `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedIdcard,
        hashedPassword,
        phone.trim(),
        first_name.trim(),
        last_name.trim(),
        Number(age),
        normalizedRoomNumber,
        normalizedDepositAmount,
      ],
    );

    const [bookingResult] = await connection.query(`INSERT INTO Booking (customer_id, room_id) VALUES (?, ?)`, [
      customerResult.insertId,
      room.id,
    ]);

    if (normalizedDepositAmount && normalizedDepositAmount > 0) {
      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'paid', 'deposit', 'เงินมัดจำ (จ่ายหน้าเคาน์เตอร์)')`,
        [bookingResult.insertId, normalizedDepositAmount],
      );
    }

    const mysqlStartDateTime = toMysqlDateTime(rental_start_date);
    const mysqlEndDateTime = toMysqlDateTime(rental_end_date);

    await connection.query(
      `UPDATE Room SET
         is_booked = TRUE,
         rental_duration_months = TIMESTAMPDIFF(MONTH, ?, ?),
         rental_start_date = ?,
         rental_end_date = ?
       WHERE id = ?`,
      [mysqlStartDateTime, mysqlEndDateTime, mysqlStartDateTime, mysqlEndDateTime, room.id],
    );

    await connection.commit();

    return res.status(201).json({ message: "สมัครสมาชิกสำเร็จ" });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      if (error.sqlMessage?.includes("idcard")) {
        return res.status(409).json({ message: "เลขบัตรประชาชนนี้ถูกใช้สมัครสมาชิกแล้ว" });
      }
      if (error.sqlMessage?.includes("phone")) {
        return res.status(409).json({ message: "เบอร์โทรศัพท์นี้ถูกใช้สมัครสมาชิกแล้ว" });
      }
    }
    console.error("Register error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection.release();
  }
});

export default router;
