import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../Database/connection.js";
import { authenticate, createRequireActiveAccount, requireStaffRole } from "../middleware/authMiddleware.js";
import { CONTRACT_DURATION_MONTHS, DEPOSIT_MONTHS, isValidDateTimeString, validateRegisterInput } from "../middleware/validation.js";
import {
  contractImageName,
  contractImageUrl,
  cancelTransfersIntoBookedRooms,
  expireRoomTransferCharges,
  loadCustomerContracts,
  loadUnsettledDeposit,
  parseContractImages,
  removeContractFiles,
  resetCustomerHistory,
  UNSETTLED_DEPOSIT_MESSAGE,
} from "./rentalContracts.js";

const router = Router();

function toMysqlDateTime(value) {
  return value.replace("T", " ");
}

export function addContractMonths(value, months) {
  const [, year, month, day, time] = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2})?)$/.exec(value);
  const target = new Date(Date.UTC(Number(year), Number(month) - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const pad = (number) => String(number).padStart(2, "0");
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(Number(day), lastDay))}${time}`;
}

router.get("/register/suggest", authenticate, requireStaffRole, createRequireActiveAccount(getPool), async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, idcard, first_name, last_name, phone FROM Customer
       WHERE is_suspended = FALSE AND room_number IS NULL
       ORDER BY idcard ASC LIMIT 2000`,
    );
    const contracts = rows.length ? await loadCustomerContracts(pool, rows.map((row) => row.id)) : new Map();
    const customers = rows
      .filter((row) => !contracts.get(row.id)?.can_settle_deposit)
      .map(({ idcard: rowIdcard, first_name: firstName, last_name: lastName, phone }) => ({
        idcard: rowIdcard,
        first_name: firstName ?? "",
        last_name: lastName ?? "",
        phone: phone ?? "",
      }));
    return res.json({ customers });
  } catch (error) {
    console.error("Register suggest error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/register/lookup/:idcard", authenticate, requireStaffRole, createRequireActiveAccount(getPool), async (req, res) => {
  const idcard = String(req.params.idcard ?? "").trim();
  if (!/^\d{13}$/.test(idcard)) {
    return res.status(400).json({ message: "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก" });
  }
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, phone, age, room_number FROM Customer WHERE idcard = ? LIMIT 1`,
      [idcard],
    );
    const customer = rows[0];
    if (!customer) return res.json({ found: false });
    const unsettledDeposit = customer.room_number == null ? await loadUnsettledDeposit(pool, customer.id) : null;
    return res.json({
      found: true,
      customer: {
        first_name: customer.first_name ?? "",
        last_name: customer.last_name ?? "",
        phone: customer.phone ?? "",
        age: customer.age ?? "",
        room_number: customer.room_number,
      },
      unsettled_deposit_contract: unsettledDeposit?.contract ?? null,
      unsettled_deposit_message: unsettledDeposit ? UNSETTLED_DEPOSIT_MESSAGE(unsettledDeposit) : null,
    });
  } catch (error) {
    console.error("Register lookup error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/register", authenticate, requireStaffRole, createRequireActiveAccount(getPool), parseContractImages, async (req, res) => {
  const files = req.files ?? [];
  let connection;
  let committed = false;
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
      contract_duration_months,
      deposit_months,
    } = req.body ?? {};

    const durationMonths = Number(contract_duration_months);
    if (!CONTRACT_DURATION_MONTHS.has(durationMonths)) {
      await removeContractFiles(files);
      return res.status(400).json({ message: "ระยะเวลาสัญญาเช่าขั้นต่ำ 3 เดือน กรุณาเลือก 3, 6 หรือ 12 เดือน" });
    }
    if (Number(deposit_months) !== DEPOSIT_MONTHS) {
      await removeContractFiles(files);
      return res.status(400).json({ message: `เงินมัดจำต้องเป็น ${DEPOSIT_MONTHS} เดือน` });
    }
    const rental_end_date = isValidDateTimeString(rental_start_date)
      ? addContractMonths(rental_start_date, durationMonths)
      : undefined;

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
    });
    if (validationError) {
      await removeContractFiles(files);
      return res.status(400).json({ message: validationError });
    }

    const normalizedIdcard = idcard.trim();
    const normalizedRoomNumber = Number(room_number);

    await expireRoomTransferCharges(getPool());
    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT id, room_number FROM Customer WHERE idcard = ? FOR UPDATE`,
      [normalizedIdcard],
    );
    const returningCustomer = existingRows[0] ?? null;
    if (returningCustomer && returningCustomer.room_number != null) {
      await connection.rollback();
      await removeContractFiles(files);
      return res.status(409).json({ message: `เลขบัตรประชาชนนี้มีสัญญาเช่าห้อง ${returningCustomer.room_number} อยู่แล้ว` });
    }
    const unsettledDeposit = returningCustomer ? await loadUnsettledDeposit(connection, returningCustomer.id) : null;
    if (unsettledDeposit) {
      await connection.rollback();
      await removeContractFiles(files);
      return res.status(409).json({ code: "DEPOSIT_UNSETTLED", message: UNSETTLED_DEPOSIT_MESSAGE(unsettledDeposit) });
    }

    const [roomRows] = await connection.query(
      `SELECT id, is_booked, price FROM Room WHERE room_number = ? FOR UPDATE`,
      [normalizedRoomNumber],
    );

    const room = roomRows[0];
    if (!room) {
      await connection.rollback();
      await removeContractFiles(files);
      return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    }
    if (room.is_booked) {
      await connection.rollback();
      await removeContractFiles(files);
      return res.status(409).json({ message: "ห้องพักนี้ถูกจองแล้ว" });
    }
    const normalizedDepositAmount = Math.round(Number(room.price) * DEPOSIT_MONTHS * 100) / 100;

    const hashedPassword = await bcrypt.hash(password, 10);

    let customerId;
    if (returningCustomer) {
      customerId = returningCustomer.id;
      await resetCustomerHistory(connection, customerId);
      await connection.query(
        `UPDATE Customer SET password = ?, phone = ?, first_name = ?, last_name = ?, age = ?, room_number = ?,
                             deposit_amount = ?, is_suspended = FALSE, dorm_info_acknowledged_at = NULL
         WHERE id = ?`,
        [hashedPassword, phone.trim(), first_name.trim(), last_name.trim(), Number(age), normalizedRoomNumber, normalizedDepositAmount, customerId],
      );
    } else {
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
      customerId = customerResult.insertId;
    }

    const mysqlStartDateTime = toMysqlDateTime(rental_start_date);
    const mysqlEndDateTime = toMysqlDateTime(rental_end_date);

    const [bookingResult] = await connection.query(
      `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_duration_months, contract_completed_at, deposit_amount)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [customerId, room.id, mysqlStartDateTime, mysqlEndDateTime, durationMonths, normalizedDepositAmount],
    );

    await connection.query(
      `INSERT INTO ContractImage (booking_id, customer_id, name, url) VALUES ?`,
      [files.map((file, index) => [bookingResult.insertId, customerId, contractImageName(file, index), contractImageUrl(file)])],
    );

    await connection.query(
      `UPDATE Room SET
         is_booked = TRUE,
         rental_duration_months = ?,
         rental_start_date = ?,
         rental_end_date = ?,
         prepaid_until = NULL,
         billing_start_date = NULL,
         pending_lump_sum_months = NULL,
         rent_credit = NULL
       WHERE id = ?`,
      [durationMonths, mysqlStartDateTime, mysqlEndDateTime, room.id],
    );
    const cancelledTransfers = await cancelTransfersIntoBookedRooms(connection, normalizedRoomNumber);

    await connection.commit();
    committed = true;

    return res.status(201).json({
      message: `${returningCustomer ? "ทำสัญญาใหม่ให้ผู้เช่าเดิมสำเร็จ ประวัติสัญญาเก่ายังเก็บไว้" : "สมัครสมาชิกสำเร็จ"}${
        cancelledTransfers > 0 ? ` · ยกเลิกคำขอย้ายเข้าห้อง ${normalizedRoomNumber} ของผู้เช่าเดิม ${cancelledTransfers} รายการแล้ว` : ""
      }`,
      returning_customer: Boolean(returningCustomer),
      cancelled_transfers: cancelledTransfers,
      contract: {
        booking_id: bookingResult.insertId,
        contract_duration_months: durationMonths,
        rental_start_date: mysqlStartDateTime,
        rental_end_date: mysqlEndDateTime,
        image_count: files.length,
      },
    });
  } catch (error) {
    if (connection && !committed) await connection.rollback().catch(() => {});
    if (!committed) await removeContractFiles(files);
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
    connection?.release();
  }
});

export default router;
