import { Router } from "express";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { authenticate, requireCustomerRole } from "../middleware/authMiddleware.js";
import { PUBLIC_UPLOAD_DIR } from "../middleware/publicUploads.js";
import { listAnnouncements } from "./AnnouncementRouter.js";
import {
  isPositiveId,
  isValidPassword,
  parseMaintenanceInput,
  parsePhotoList,
  parseTenantRequestInput,
  validatePersonUpdateInput,
} from "../middleware/validation.js";
import { attachParcelPhotos } from "./ParcelRouter.js";

const router = Router();
const PAYMENT_SLIP_FOLDER = "payment-slips";
const PAYMENT_SLIP_DIR = path.join(PUBLIC_UPLOAD_DIR, PAYMENT_SLIP_FOLDER);
fs.mkdirSync(PAYMENT_SLIP_DIR, { recursive: true });

const slipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, PAYMENT_SLIP_DIR),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return callback(null, true);
    return callback(new Error("แนบได้เฉพาะไฟล์ JPG, PNG หรือ WebP"));
  },
});

function parsePaymentSlip(req, res, next) {
  slipUpload.single("slip")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB" });
    return res.status(400).json({ message: error.message || "อัปโหลดสลิปไม่สำเร็จ" });
  });
}

export async function attachMaintenancePhotos(pool, requests) {
  if (requests.length === 0) return requests;
  const [photos] = await pool.query(
    `SELECT maintenance_request_id, name, data_url FROM MaintenancePhoto
     WHERE maintenance_request_id IN (?) ORDER BY id ASC`,
    [requests.map((request) => request.id)],
  );
  const photosByRequestId = new Map();
  for (const photo of photos) {
    const list = photosByRequestId.get(photo.maintenance_request_id) || [];
    list.push({ name: photo.name, dataUrl: photo.data_url });
    photosByRequestId.set(photo.maintenance_request_id, list);
  }
  return requests.map((request) => ({ ...request, photos: photosByRequestId.get(request.id) || [] }));
}

export async function requireActiveCustomer(req, res, next) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT is_suspended FROM Customer WHERE id = ?`, [req.user.id]);
    if (!rows[0] || rows[0].is_suspended) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้" });
    }
    next();
  } catch (error) {
    console.error("Check customer suspension error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
}

router.use(authenticate, requireCustomerRole, requireActiveCustomer);

router.patch("/profile", async (req, res) => {
  try {
    const body = req.body ?? {};
    const updateFields = Object.fromEntries(
      ["first_name", "last_name", "phone"].filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]),
    );
    const hasProfileFields = ["first_name", "last_name", "phone"].some((field) => Object.hasOwn(body, field));
    const hasPasswordChange = body.new_password !== undefined;
    if (!hasProfileFields && !hasPasswordChange) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }
    if (hasProfileFields) {
      const validationError = validatePersonUpdateInput(updateFields);
      if (validationError) return res.status(400).json({ message: validationError });
    }
    if (hasPasswordChange && (!isValidPassword(body.new_password) || typeof body.current_password !== "string")) {
      return res.status(400).json({ message: "รหัสผ่านใหม่ต้องมีความยาว 6-128 ตัวอักษร และกรุณาระบุรหัสผ่านปัจจุบัน" });
    }

    const pool = getPool();
    const [rows] = await pool.query(`SELECT password FROM Customer WHERE id = ?`, [req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: "ไม่พบข้อมูลผู้เช่า" });
    if (hasPasswordChange && !(await bcrypt.compare(body.current_password, rows[0].password))) {
      return res.status(400).json({ message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
    }

    const columns = [];
    const values = [];
    for (const field of ["first_name", "last_name", "phone"]) {
      if (Object.hasOwn(body, field)) {
        columns.push(`${field} = ?`);
        values.push(body[field].trim());
      }
    }
    if (hasPasswordChange) {
      columns.push("password = ?");
      values.push(await bcrypt.hash(body.new_password, 10));
    }
    await pool.query(`UPDATE Customer SET ${columns.join(", ")} WHERE id = ?`, [...values, req.user.id]);

    const [customerRows] = await pool.query(
      `SELECT id, first_name, last_name, phone, room_number FROM Customer WHERE id = ?`,
      [req.user.id],
    );
    return res.json({ message: "บันทึกข้อมูลโปรไฟล์สำเร็จ", customer: customerRows[0] });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "เบอร์โทรศัพท์นี้ถูกใช้แล้ว" });
    console.error("Update customer profile error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const GRACE_DAYS = 3;

function computeRentDue(room, paymentsForBooking, depositAmount) {
  if (!room || !room.is_booked || !room.rental_start_date || !room.rental_end_date) return null;

  const start = new Date(room.rental_start_date);
  const end = new Date(room.rental_end_date);
  const now = new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  if (now < start || now > end) return null;

  const billingDay = start.getDate();
  let periodStart = new Date(now.getFullYear(), now.getMonth(), billingDay, start.getHours(), start.getMinutes());
  if (periodStart > now) {
    periodStart = new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, billingDay, start.getHours(), start.getMinutes());
  }
  if (periodStart < start) periodStart = start;

  let earliestPeriodStart = start;
  if (room.prepaid_until) {
    const prepaidUntil = new Date(room.prepaid_until);
    if (!Number.isNaN(prepaidUntil.getTime())) {
      if (periodStart < prepaidUntil) return null;
      if (prepaidUntil > earliestPeriodStart) earliestPeriodStart = prepaidUntil;
    }
  }

  const isWithinPeriod = (value, periodStartDate, periodEndDate) => {
    const periodStartDay = new Date(periodStartDate.getFullYear(), periodStartDate.getMonth(), periodStartDate.getDate());
    const periodEndDay = new Date(periodEndDate.getFullYear(), periodEndDate.getMonth(), periodEndDate.getDate());
    const d = new Date(value);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return day >= periodStartDay && day < periodEndDay;
  };

  const rentPayments = paymentsForBooking.filter(
    (p) => p.type !== "deposit" && p.type !== "water" && p.type !== "electricity",
  );

  const unpaidPeriods = [];
  let cursor = new Date(earliestPeriodStart);
  while (cursor <= periodStart) {
    const cursorEnd = new Date(cursor);
    cursorEnd.setMonth(cursorEnd.getMonth() + 1);
    const paid = rentPayments.some((p) => p.status === "paid" && isWithinPeriod(p.payment_date, cursor, cursorEnd));
    if (!paid) {
      unpaidPeriods.push({
        periodStart: new Date(cursor),
        periodEnd: new Date(cursorEnd),
        isFirstPeriodEver: cursor.getTime() === start.getTime(),
      });
    }
    cursor = cursorEnd;
  }

  const currentPeriodEnd = new Date(periodStart);
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  if (unpaidPeriods.length === 0) {
    return {
      amount: 0,
      depositApplied: 0,
      lumpSumMonths: null,
      overdueMonths: 0,
      periodStart,
      periodEnd: currentPeriodEnd,
      dueDate: null,
      status: "paid",
    };
  }

  const earliestUnpaid = unpaidPeriods[0];
  const latestUnpaid = unpaidPeriods[unpaidPeriods.length - 1];

  const notifiedThisPeriod = rentPayments.some(
    (p) => p.status === "pending" && isWithinPeriod(p.payment_date, periodStart, currentPeriodEnd),
  );

  const dueDate = new Date(earliestUnpaid.periodStart);
  dueDate.setDate(dueDate.getDate() + GRACE_DAYS);

  const status = notifiedThisPeriod ? "pending" : now > dueDate ? "overdue" : "due";

  const basePrice = Number(room.price);
  const depositApplied = unpaidPeriods.some((p) => p.isFirstPeriodEver)
    ? Math.min(Number(depositAmount) || 0, basePrice)
    : 0;

  const overdueMonths = unpaidPeriods.length - 1;
  const lumpSumMonths =
    status !== "paid" && Number(room.pending_lump_sum_months) > 1 ? Number(room.pending_lump_sum_months) : null;
  const currentCycleMonths = lumpSumMonths || 1;
  const amount = basePrice * (overdueMonths + currentCycleMonths) - depositApplied;

  return {
    amount,
    depositApplied,
    lumpSumMonths,
    overdueMonths,
    periodStart: earliestUnpaid.periodStart,
    periodEnd: latestUnpaid.periodEnd,
    dueDate,
    status,
  };
}

const UTILITY_LABEL = { water: "ค่าน้ำ", electricity: "ค่าไฟฟ้า" };

export function computeCurrentDue(room, paymentsForBooking, depositAmount) {
  const rentDue = computeRentDue(room, paymentsForBooking, depositAmount);
  const rentUnpaid = rentDue && rentDue.status !== "paid";

  const utilityCharges = paymentsForBooking.filter(
    (p) => (p.type === "water" || p.type === "electricity") && p.status === "pending",
  );

  const items = [];
  if (rentUnpaid) {
    items.push({
      type: "rent",
      label: rentDue.overdueMonths > 0 ? `ค่าเช่าห้อง (ค้างสะสม ${rentDue.overdueMonths + 1} เดือน)` : "ค่าเช่าห้อง",
      amount: rentDue.amount,
      status: rentDue.status,
    });
  }
  for (const charge of utilityCharges) {
    items.push({
      id: charge.id,
      type: charge.type,
      label: UTILITY_LABEL[charge.type] || charge.type,
      amount: Number(charge.amount),
      status: "due",
      note: charge.note || null,
      payment_date: charge.payment_date,
    });
  }

  if (items.length === 0) return null;

  const rentAmount = rentUnpaid ? rentDue.amount : 0;
  const utilityAmount = utilityCharges.reduce((sum, charge) => sum + Number(charge.amount), 0);

  return {
    amount: rentAmount + utilityAmount,
    rentAmount,
    items,
    depositApplied: rentDue?.depositApplied || 0,
    lumpSumMonths: rentDue?.lumpSumMonths || null,
    overdueMonths: rentUnpaid ? rentDue.overdueMonths || 0 : 0,
    periodStart: rentDue?.periodStart || null,
    periodEnd: rentDue?.periodEnd || null,
    dueDate: rentDue?.dueDate || null,
    status: rentUnpaid ? rentDue.status : "due",
  };
}

router.get("/me", async (req, res) => {
  try {
    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id, idcard, first_name, last_name, phone, age, room_number, deposit_amount
       FROM Customer WHERE id = ?`,
      [req.user.id],
    );
    
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const [roomRows] = await pool.query(
      `SELECT room_number, is_booked, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_price, rental_duration_months, rental_start_date, rental_end_date, prepaid_until, pending_lump_sum_months
       FROM Room WHERE room_number = ?`,
      [customer.room_number],
    );
    const [availableRooms] = await pool.query(
      `SELECT room_number, price FROM Room WHERE is_booked = FALSE ORDER BY room_number ASC`,
    );

    const [bookings] = await pool.query(
      `SELECT b.id AS booking_id, r.room_number, b.created_at,
              COALESCE(b.rental_start_date, r.rental_start_date) AS rental_start_date,
              COALESCE(b.rental_end_date, r.rental_end_date) AS rental_end_date
       FROM Booking b
       JOIN Room r ON r.id = b.room_id
       WHERE b.customer_id = ?
       ORDER BY b.created_at DESC, b.id DESC`,
      [customer.id],
    );

    const bookingIds = bookings.map((booking) => booking.booking_id);
    let payments = [];
    if (bookingIds.length > 0) {
      [payments] = await pool.query(
        `SELECT id, booking_id, amount, payment_date, status, type, note, slip_path, created_at
         FROM Payment
         WHERE booking_id IN (?)
         ORDER BY payment_date DESC, created_at DESC`,
        [bookingIds],
      );
    }

    const rentalHistory = bookings.map((booking) => ({
      ...booking,
      payments: payments.filter((payment) => payment.booking_id === booking.booking_id),
    }));

    const [maintenanceRequests] = await pool.query(
      `SELECT id, description, category, contact_phone, preferred_time, status, accepted_at, completed_at, completed_by_name, created_at
       FROM MaintenanceRequest WHERE customer_id = ? ORDER BY created_at DESC`,
      [customer.id],
    );

    const [tenantRequests] = await pool.query(
      `SELECT id, type, note, room_number, target_room_number, renew_duration_months, renew_payment_type, status, accepted_at, completed_at, created_at
       FROM TenantRequest WHERE customer_id = ? ORDER BY created_at DESC, id DESC`,
      [customer.id],
    );

    const announcements = await listAnnouncements(pool);

    const latestBookingId = bookings[0]?.booking_id;
    const paymentsForCurrentBooking = payments.filter((payment) => payment.booking_id === latestBookingId);
    const currentDue = computeCurrentDue(roomRows[0], paymentsForCurrentBooking, customer.deposit_amount);
    const [parcels] = await pool.query(
      `SELECT id, tracking_number, sender_name, description, status, staff_name, received_at, created_at
       FROM Parcel WHERE customer_id = ? AND room_number = ? ORDER BY created_at DESC`,
      [customer.id, customer.room_number],
    );

    return res.json({
      customer,
      room: roomRows[0] || null,
      availableRooms,
      rentalHistory,
      maintenanceRequests: await attachMaintenancePhotos(pool, maintenanceRequests),
      tenantRequests,
      announcements,
      currentDue,
      parcels: await attachParcelPhotos(pool, parcels),
    });
  } catch (error) {
    console.error("Customer dashboard error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/payments/confirm", parsePaymentSlip, async (req, res) => {
  let connection;
  try {
    if (!req.file) return res.status(400).json({ message: "กรุณาแนบสลิปการโอนเงิน" });
    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id, room_number, deposit_amount FROM Customer WHERE id = ?`,
      [req.user.id],
    );
    const customer = customerRows[0];
    if (!customer) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const [roomRows] = await pool.query(
      `SELECT price, is_booked, rental_start_date, rental_end_date, prepaid_until, pending_lump_sum_months FROM Room WHERE room_number = ?`,
      [customer.room_number],
    );
    const room = roomRows[0];

    const [bookingRows] = await pool.query(
      `SELECT id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      [customer.id],
    );
    const booking = bookingRows[0];
    if (!booking) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "ไม่พบสัญญาเช่าของคุณ" });
    }

    const [paymentsForBooking] = await pool.query(
      `SELECT id, amount, status, type, note, payment_date, slip_path FROM Payment WHERE booking_id = ?`,
      [booking.id],
    );

    const currentDue = computeCurrentDue(room, paymentsForBooking, customer.deposit_amount);
    if (!currentDue) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "ไม่มียอดค่าเช่าที่ต้องชำระในขณะนี้" });
    }

    if (paymentsForBooking.some((payment) => payment.status === "pending" && payment.slip_path)) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ message: "มีสลิปที่รอตรวจสอบอยู่แล้ว" });
    }

    const slipPath = `/uploads/${PAYMENT_SLIP_FOLDER}/${path.basename(req.file.filename)}`;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (currentDue.rentAmount > 0) {
      const note = currentDue.lumpSumMonths
        ? `รอตรวจสอบสลิป - ค่าเช่าล่วงหน้า ${currentDue.lumpSumMonths} เดือน`
        : "รอตรวจสอบสลิปค่าเช่า";

      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note, slip_path) VALUES (?, ?, CURDATE(), 'pending', 'rent', ?, ?)`,
        [booking.id, currentDue.rentAmount, note, slipPath],
      );
    }

    const utilityPaymentIds = currentDue.items.filter((item) => item.id).map((item) => item.id);
    if (utilityPaymentIds.length > 0) {
      await connection.query(
        `UPDATE Payment SET slip_path = ?, note = CONCAT(COALESCE(note, ''), ' (รอตรวจสอบสลิป)') WHERE id IN (?) AND status = 'pending'`,
        [slipPath, utilityPaymentIds],
      );
    }

    await connection.commit();
    return res.status(201).json({ message: "ส่งสลิปสำเร็จ กรุณารอเจ้าหน้าที่ตรวจสอบ" });
  } catch (error) {
    if (connection) await connection.rollback();
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("Confirm payment error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection?.release();
  }
});

router.post("/maintenance", async (req, res) => {
  try {
    const pool = getPool();

    const [customerRows] = await pool.query(`SELECT id, room_number FROM Customer WHERE id = ?`, [req.user.id]);
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const { error, value } = parseMaintenanceInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }
    const { description, category, preferredTime, contactPhone } = value;

    const photos = parsePhotoList(req.body?.photos);
    if (photos.error) {
      return res.status(400).json({ message: photos.error });
    }
    if (photos.value.length === 0) {
      return res.status(400).json({ message: "กรุณาแนบรูปปัญหาอย่างน้อย 1 รูป" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO MaintenanceRequest (customer_id, room_number, description, category, contact_phone, preferred_time)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customer.id, customer.room_number, description, category, contactPhone, preferredTime],
      );
      if (photos.value.length > 0) {
        await connection.query(`INSERT INTO MaintenancePhoto (maintenance_request_id, name, data_url) VALUES ?`, [
          photos.value.map((photo) => [result.insertId, photo.name, photo.dataUrl]),
        ]);
      }
      await connection.commit();
      return res.status(201).json({ message: "แจ้งซ่อมสำเร็จ ทางผู้ดูแลจะดำเนินการโดยเร็วที่สุด", maintenanceId: result.insertId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Create maintenance request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/maintenance/:id/cancel", async (req, res) => {
  try {
    if (!isPositiveId(req.params.id)) {
      return res.status(400).json({ message: "รหัสรายการแจ้งซ่อมไม่ถูกต้อง" });
    }

    const pool = getPool();

    const [customerRows] = await pool.query(`SELECT id FROM Customer WHERE id = ?`, [req.user.id]);
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const [maintenanceRows] = await pool.query(
      `SELECT id, status FROM MaintenanceRequest WHERE id = ? AND customer_id = ?`,
      [req.params.id, customer.id],
    );
    const maintenanceRequest = maintenanceRows[0];
    if (!maintenanceRequest) {
      return res.status(404).json({ message: "ไม่พบรายการแจ้งซ่อม" });
    }
    if (maintenanceRequest.status !== "pending") {
      return res.status(400).json({ message: "ไม่สามารถยกเลิกได้ เนื่องจากเจ้าหน้าที่รับเรื่องแล้ว" });
    }

    await pool.query(`UPDATE MaintenanceRequest SET status = 'cancelled', completed_at = NOW() WHERE id = ?`, [
      maintenanceRequest.id,
    ]);

    return res.json({ message: "ยกเลิกรายการแจ้งซ่อมสำเร็จ" });
  } catch (error) {
    console.error("Cancel maintenance request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/requests", async (req, res) => {
  let connection;
  try {
    const pool = getPool();
    const { error, value } = parseTenantRequestInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }
    const { type, note, targetRoomNumber, renewDurationMonths, renewPaymentType } = value;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [customerRows] = await connection.query(
      `SELECT id, room_number FROM Customer WHERE id = ? FOR UPDATE`,
      [req.user.id],
    );
    const customer = customerRows[0];
    if (!customer) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const [activeRequests] = await connection.query(
      `SELECT type FROM TenantRequest WHERE customer_id = ? AND status IN ('pending', 'in_progress')`,
      [customer.id],
    );
    if (activeRequests.some((request) => request.type === type)) {
      await connection.rollback();
      return res.status(409).json({ message: "คุณมีคำขอประเภทนี้ที่รอดำเนินการอยู่แล้ว" });
    }
    if (
      (type === "move_room" && activeRequests.some((request) => request.type !== "move_room"))
      || (type !== "move_room" && activeRequests.some((request) => request.type === "move_room"))
    ) {
      await connection.rollback();
      return res.status(409).json({ message: "กรุณารอให้คำขอเกี่ยวกับการเปลี่ยนห้องดำเนินการเสร็จก่อน" });
    }

    if (type === "move_room") {
      if (!customer.room_number || customer.room_number === targetRoomNumber) {
        await connection.rollback();
        return res.status(400).json({ message: "ไม่สามารถเลือกห้องปัจจุบันเป็นห้องปลายทางได้" });
      }

      const [targetRooms] = await connection.query(
        `SELECT room_number, is_booked FROM Room WHERE room_number = ? FOR UPDATE`,
        [targetRoomNumber],
      );
      if (!targetRooms[0] || targetRooms[0].is_booked) {
        await connection.rollback();
        return res.status(409).json({ message: "ห้องที่เลือกไม่ว่างแล้ว กรุณาเลือกห้องอื่น" });
      }
    }

    await connection.query(
      `INSERT INTO TenantRequest (customer_id, room_number, target_room_number, type, note, renew_duration_months, renew_payment_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, customer.room_number, targetRoomNumber, type, note, renewDurationMonths, renewPaymentType],
    );

    await connection.commit();

    return res.status(201).json({ message: "ส่งคำขอสำเร็จ ทางผู้ดูแลจะติดต่อกลับโดยเร็วที่สุด" });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Create tenant request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection?.release();
  }
});

export default router;
