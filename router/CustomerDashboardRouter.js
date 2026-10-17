import { Router } from "express";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { authenticate, requireCustomerRole } from "../middleware/authMiddleware.js";
import { deletePublicImages, PUBLIC_UPLOAD_DIR, savePublicImages } from "../middleware/publicUploads.js";
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
const CUSTOMER_VEHICLE_MAX_PHOTOS = 6;
const SAFETY_REPORTER_TABLE = { Customer: "Customer", Staff: "Staff", Admin: "Admin", Owner: "Owner" };
const URGENT_INCIDENT_TYPES = new Set(["fire", "medical", "accident"]);
const URGENT_INCIDENT_KEYWORDS = [
  "ด่วน", "ช่วยด้วย", "ฉุกเฉิน", "ไฟไหม้", "ควัน", "ระเบิด", "แก๊สรั่ว", "ก๊าซรั่ว", "ไฟช็อต", "ไฟดูด",
  "บาดเจ็บ", "เลือด", "หมดสติ", "ไม่หายใจ", "ชัก", "หัวใจ", "ล้ม", "ตกบันได",
  "บุกรุก", "ขโมย", "งัด", "ปล้น", "อาวุธ", "มีด", "ปืน", "ทำร้าย", "ทะเลาะ", "ข่มขู่",
  "น้ำท่วม", "ท่อแตก", "ติดลิฟต์",
];

export function withVehiclePhotos(requests) {
  return requests.map((request) => {
    let photos = request.vehicle_photos;
    if (typeof photos === "string") {
      try {
        photos = JSON.parse(photos);
      } catch {
        photos = [];
      }
    }
    const vehiclePhotos = Array.isArray(photos) ? photos.flatMap((photo) => {
      const url = typeof photo === "string" ? photo : photo?.url || photo?.dataUrl;
      if (typeof url !== "string" || !url.trim()) return [];
      const name = typeof photo?.name === "string" ? photo.name : "";
      return [{ name, url: url.trim() }];
    }) : [];
    return { ...request, vehicle_photos: vehiclePhotos };
  });
}

export async function isPlateRegisteredByOther(pool, customerId, plate) {
  const [owners] = await pool.query(
    `SELECT 1 FROM ResidentVisitRequest
     WHERE request_type = 'vehicle' AND NOT (customer_id <=> ?) AND status IN ('pending', 'approved') AND (end_at IS NULL OR end_at > NOW())
       AND REPLACE(UPPER(vehicle_plate), ' ', '') = REPLACE(UPPER(?), ' ', '')
     LIMIT 1`,
    [customerId, String(plate).trim()],
  );
  return owners.length > 0;
}

export function classifySafetySeverity(incidentType, description) {
  if (URGENT_INCIDENT_TYPES.has(incidentType)) return "urgent";
  const text = String(description ?? "").toLowerCase();
  return URGENT_INCIDENT_KEYWORDS.some((keyword) => text.includes(keyword)) ? "urgent" : "normal";
}
const PAYMENT_SLIP_FOLDER = "payment-slips";
const PAYMENT_SLIP_EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const PAYMENT_SLIP_DIR = path.join(PUBLIC_UPLOAD_DIR, PAYMENT_SLIP_FOLDER);
fs.mkdirSync(PAYMENT_SLIP_DIR, { recursive: true });

const slipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, PAYMENT_SLIP_DIR),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${PAYMENT_SLIP_EXTENSIONS[file.mimetype]}`),
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

export async function createSafetyIncident(req, res) {
  try {
    const { incidentType, description, roomNumber } = req.body ?? {};
    if (!String(incidentType ?? "").trim() || !String(description ?? "").trim()) {
      return res.status(400).json({ message: "กรุณาระบุประเภทเหตุและรายละเอียด" });
    }
    if (String(description).length > 1000) return res.status(400).json({ message: "รายละเอียดต้องไม่เกิน 1,000 ตัวอักษร" });

    const table = SAFETY_REPORTER_TABLE[req.user?.role];
    if (!table) return res.status(403).json({ message: "ไม่มีสิทธิ์รายงานเหตุ" });
    const isCustomer = req.user.role === "Customer";
    const pool = getPool();
    const [users] = await pool.query(
      `SELECT first_name, last_name, ${isCustomer ? "room_number" : "NULL AS room_number"} FROM ${table} WHERE id = ?`,
      [req.user.id],
    );
    const user = users[0];
    if (!user) return res.status(404).json({ message: "ไม่พบข้อมูลผู้รายงาน" });
    const name = `${user.first_name} ${user.last_name}`.trim();
    const requestedRoom = Number(roomNumber);
    const safeRoom = isCustomer ? user.room_number : Number.isInteger(requestedRoom) && requestedRoom > 0 ? requestedRoom : null;
    const severity = classifySafetySeverity(String(incidentType).trim(), description);
    await pool.query(
      `INSERT INTO SafetyIncident (reporter_role, reporter_id, reporter_name, room_number, incident_type, severity, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.role, req.user.id, name, safeRoom, String(incidentType).trim().slice(0, 80), severity, String(description).trim()],
    );
    return res.status(201).json({ message: "ส่งรายงานเหตุให้เจ้าหน้าที่แล้ว", severity });
  } catch (error) {
    console.error("Create safety incident error:", error);
    return res.status(500).json({ message: "ไม่สามารถส่งรายงานเหตุได้" });
  }
}

router.use(authenticate, requireCustomerRole, requireActiveCustomer);

router.patch("/profile", async (req, res) => {
  try {
    const body = req.body ?? {};
    if (["first_name", "last_name"].some((field) => Object.hasOwn(body, field))) {
      return res.status(400).json({ message: "ไม่สามารถแก้ไขชื่อและนามสกุลได้ กรุณาใช้ข้อมูลที่ลงทะเบียนไว้" });
    }
    const hasProfileFields = Object.hasOwn(body, "phone");
    const hasPasswordChange = body.new_password !== undefined;
    if (!hasProfileFields && !hasPasswordChange) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }
    if (hasProfileFields) {
      const validationError = validatePersonUpdateInput({ phone: body.phone });
      if (validationError) return res.status(400).json({ message: validationError });
    }
    if (hasPasswordChange && (!isValidPassword(body.new_password) || typeof body.current_password !== "string")) {
      return res.status(400).json({ message: "รหัสผ่านใหม่ต้องมีความยาว 6-128 ตัวอักษร และกรุณาระบุรหัสผ่านปัจจุบัน" });
    }

    const pool = getPool();
    const [rows] = await pool.query(`SELECT password, phone FROM Customer WHERE id = ?`, [req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: "ไม่พบข้อมูลผู้เช่า" });
    if (hasPasswordChange) {
      const isPhoneAsPassword = Boolean(rows[0].phone) && body.current_password === rows[0].phone;
      const passwordMatches = isPhoneAsPassword || (await bcrypt.compare(body.current_password, rows[0].password));
      if (!passwordMatches) {
        return res.status(400).json({ message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
      }
    }

    const columns = [];
    const values = [];
    if (hasProfileFields) {
      columns.push("phone = ?");
      values.push(body.phone.trim());
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
  const priceCents = Math.round(Number(room.price) * 100);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !Number.isSafeInteger(priceCents) || priceCents <= 0) return null;
  if (now < start || now > end) return null;

  // Anchor each anniversary to the original day, including contracts starting on the 29th–31st.
  const periodAt = (offset) => {
    const date = new Date(start.getFullYear(), start.getMonth() + offset, 1, start.getHours(), start.getMinutes(), start.getSeconds());
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(start.getDate(), lastDay));
    return date;
  };
  const rentPayments = paymentsForBooking.filter((payment) => !["deposit", "water", "electricity"].includes(payment.type));
  const paidRentCents = Math.max(0, rentPayments.reduce((total, payment) => {
    const amount = Math.round(Number(payment.amount) * 100);
    return payment.status === "paid" && Number.isSafeInteger(amount) ? total + amount : total;
  }, 0));
  const depositCents = Math.min(priceCents, Math.max(0, Math.round((Number(depositAmount) || 0) * 100)));
  const periods = [];
  for (let offset = 0; ; offset += 1) {
    const periodStart = periodAt(offset);
    if (periodStart > now || periodStart >= end) break;
    periods.push({ periodStart, periodEnd: periodAt(offset + 1), index: offset });
  }
  if (periods.length === 0) return null;

  // Prepaid dates also cover legacy records where advance payments were not itemized.
  const prepaidUntil = room.prepaid_until ? new Date(room.prepaid_until) : null;
  const prepaidCents = prepaidUntil && !Number.isNaN(prepaidUntil.getTime())
    ? periods.filter((period) => period.periodEnd <= prepaidUntil).length * priceCents : 0;
  // New receipts after a legacy prepaid boundary add credit instead of being absorbed by its floor.
  let receiptsAfterPrepaidCents = 0;
  if (prepaidUntil && !Number.isNaN(prepaidUntil.getTime())) {
    const cutoffDay = new Date(prepaidUntil.getFullYear(), prepaidUntil.getMonth(), prepaidUntil.getDate());
    receiptsAfterPrepaidCents = rentPayments.reduce((total, payment) => {
      const date = new Date(payment.payment_date);
      const amount = Math.round(Number(payment.amount) * 100);
      const paymentDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      return payment.status === "paid" && Number.isSafeInteger(amount) && paymentDay >= cutoffDay ? total + amount : total;
    }, 0);
  }
  let creditCents = Math.max(0, Math.max(paidRentCents - receiptsAfterPrepaidCents + depositCents, prepaidCents) + receiptsAfterPrepaidCents);
  const unpaidPeriods = [];
  for (const period of periods) {
    const applied = Math.min(priceCents, creditCents);
    creditCents -= applied;
    const outstandingCents = priceCents - applied;
    if (outstandingCents > 0) unpaidPeriods.push({ ...period, outstandingCents });
  }
  const currentPeriod = periods[periods.length - 1];
  if (unpaidPeriods.length === 0) {
    return { amount: 0, depositApplied: 0, lumpSumMonths: null, overdueMonths: 0,
      periodStart: currentPeriod.periodStart, periodEnd: currentPeriod.periodEnd, dueDate: null, status: "paid" };
  }
  const earliestUnpaid = unpaidPeriods[0];
  const latestUnpaid = unpaidPeriods[unpaidPeriods.length - 1];
  const dueDate = new Date(earliestUnpaid.periodStart);
  dueDate.setDate(dueDate.getDate() + GRACE_DAYS);
  const pendingSlip = rentPayments.some((payment) => payment.status === "pending" && Number(payment.amount) > 0);
  const status = pendingSlip ? "pending" : now > dueDate ? "overdue" : "due";
  const lumpSumMonths = Number(room.pending_lump_sum_months) > 1 ? Number(room.pending_lump_sum_months) : null;
  const outstandingCents = unpaidPeriods.reduce((total, period) => total + period.outstandingCents, 0)
    + priceCents * ((lumpSumMonths || 1) - 1);
  return {
    amount: outstandingCents / 100,
    depositApplied: earliestUnpaid.index === 0 ? depositCents / 100 : 0,
    lumpSumMonths,
    overdueMonths: unpaidPeriods.length - 1,
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
      `SELECT room_number, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_price
       FROM Room WHERE is_booked = FALSE ORDER BY room_number ASC`,
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
      `SELECT id, description, category, contact_phone, preferred_time, status, accepted_at, accepted_by_name, completed_at, completed_by_name, created_at
       FROM MaintenanceRequest WHERE customer_id = ? ORDER BY created_at DESC`,
      [customer.id],
    );

    const [tenantRequests] = await pool.query(
      `SELECT tr.id, tr.type, tr.note, tr.room_number, tr.target_room_number, tr.renew_duration_months, tr.renew_payment_type,
              tr.move_reason, DATE_FORMAT(tr.preferred_move_date, '%Y-%m-%d') AS preferred_move_date,
              tr.status, tr.accepted_at, tr.accepted_by_name, tr.completed_at, tr.completed_by_name, tr.created_at,
              sr.price AS source_room_price, tg.price AS target_room_price,
              (moi.id IS NOT NULL) AS room_inspected
       FROM TenantRequest tr
       LEFT JOIN Room sr ON sr.room_number = tr.room_number
       LEFT JOIN Room tg ON tg.room_number = tr.target_room_number
       LEFT JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
       WHERE tr.customer_id = ? ORDER BY tr.created_at DESC, tr.id DESC`,
      [customer.id],
    );

    const [acknowledgedRows] = await pool.query(
      `SELECT announcement_id FROM AnnouncementAcknowledgement WHERE customer_id = ?`,
      [customer.id],
    );
    const acknowledgedIds = new Set(acknowledgedRows.map((row) => row.announcement_id));
    const announcements = (await listAnnouncements(pool)).map((announcement) => ({
      ...announcement,
      acknowledged: acknowledgedIds.has(announcement.id),
    }));

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

    const [result] = await pool.query(
      `UPDATE MaintenanceRequest SET status = 'cancelled', completed_at = NOW()
       WHERE id = ? AND customer_id = ? AND status = 'pending'`,
      [maintenanceRequest.id, customer.id],
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ message: "ไม่สามารถยกเลิกได้ เนื่องจากเจ้าหน้าที่รับเรื่องหรือรายการเปลี่ยนแปลงแล้ว" });
    }

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
    const { type, note, targetRoomNumber, renewDurationMonths, renewPaymentType, moveReason, preferredMoveDate } = value;

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
      `INSERT INTO TenantRequest (customer_id, room_number, target_room_number, type, note, renew_duration_months, renew_payment_type,
                                  move_reason, preferred_move_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer.id, customer.room_number, targetRoomNumber, type, note, renewDurationMonths, renewPaymentType,
        moveReason, preferredMoveDate,
      ],
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

router.post("/announcements/:id/acknowledge", async (req, res) => {
  try {
    const announcementId = Number(req.params.id);
    if (!isPositiveId(announcementId)) {
      return res.status(400).json({ message: "รหัสประกาศไม่ถูกต้อง" });
    }
    const pool = getPool();
    const [rows] = await pool.query(`SELECT id FROM Announcement WHERE id = ?`, [announcementId]);
    if (!rows[0]) {
      return res.status(404).json({ message: "ไม่พบประกาศ" });
    }
    await pool.query(
      `INSERT IGNORE INTO AnnouncementAcknowledgement (announcement_id, customer_id) VALUES (?, ?)`,
      [announcementId, req.user.id],
    );
    return res.json({ message: "รับทราบประกาศแล้ว" });
  } catch (error) {
    console.error("Acknowledge announcement error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/parked-vehicles", async (req, res) => {
  try {
    const pool = getPool();
    const [customers] = await pool.query("SELECT room_number FROM Customer WHERE id = ?", [req.user.id]);
    const roomNumber = customers[0]?.room_number;
    if (!roomNumber) return res.json({ roomNumber: null, vehicles: [] });
    const [vehicles] = await pool.query(
      `SELECT id, room_number, vehicle_plate, vehicle_model, vehicle_photos, guest_name, guest_phone, start_at, end_at, note,
              status, reviewed_by_name, reviewed_at, admin_reviewed_by_name, admin_reviewed_at, updated_by_name, updated_at, created_at
       FROM ResidentVisitRequest
       WHERE customer_id = ? AND room_number = ? AND request_type = 'vehicle' AND status = 'approved'
         AND (end_at IS NULL OR end_at > NOW())
       ORDER BY (start_at <= NOW()) DESC, start_at ASC`,
      [req.user.id, roomNumber],
    );
    return res.json({ roomNumber, vehicles: withVehiclePhotos(vehicles) });
  } catch (error) {
    console.error("Fetch parked vehicles error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดข้อมูลรถได้" });
  }
});

router.get("/resident-visit-requests", async (req, res) => {
  try {
    const [requests] = await getPool().query("SELECT * FROM ResidentVisitRequest WHERE customer_id = ? ORDER BY created_at DESC", [req.user.id]);
    return res.json({ requests: withVehiclePhotos(requests) });
  } catch (error) {
    console.error("Fetch resident visit requests error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดคำขอได้" });
  }
});

router.post("/resident-visit-requests", async (req, res) => {
  let savedPhotos = [];
  try {
    const { requestType, vehiclePlate, vehicleModel, guestName, guestPhone, startAt, endAt, note, isSpecial, specialReason, photos } = req.body ?? {};
    const startTime = typeof startAt === "string" ? Date.parse(startAt) : NaN;
    const openEnded = requestType === "vehicle" && (endAt === null || endAt === "");
    const endTime = openEnded ? null : typeof endAt === "string" ? Date.parse(endAt) : NaN;
    if (
      !["vehicle", "overnight_guest"].includes(requestType) ||
      !Number.isFinite(startTime) ||
      (!openEnded && (!Number.isFinite(endTime) || endTime <= startTime))
    ) {
      return res.status(400).json({ message: "กรุณากรอกประเภทคำขอและช่วงเวลาให้ถูกต้อง" });
    }
    const parsedPhotos = parsePhotoList(requestType === "vehicle" ? photos : undefined, CUSTOMER_VEHICLE_MAX_PHOTOS);
    if (parsedPhotos.error) return res.status(400).json({ message: parsedPhotos.error });
    const textFields = [[vehiclePlate, 20], [vehicleModel, 100], [guestName, 255], [guestPhone, 20], [note, 500], [specialReason, 500]];
    if (textFields.some(([value, maxLength]) => value != null && (typeof value !== "string" || value.trim().length > maxLength))) {
      return res.status(400).json({ message: "ข้อมูลข้อความไม่ถูกต้องหรือยาวเกินที่กำหนด" });
    }
    if (isSpecial !== undefined && typeof isSpecial !== "boolean") {
      return res.status(400).json({ message: "กรุณาระบุประเภทคำขอพิเศษให้ถูกต้อง" });
    }
    if (requestType === "vehicle" && !String(vehiclePlate ?? "").trim()) {
      return res.status(400).json({ message: "กรุณาระบุทะเบียนรถ" });
    }
    if (requestType === "overnight_guest" && !String(guestName ?? "").trim()) {
      return res.status(400).json({ message: "กรุณาระบุชื่อแขก" });
    }
    if (isSpecial && !String(specialReason ?? "").trim()) {
      return res.status(400).json({ message: "กรุณาระบุเหตุผลที่ขออนุมัติพิเศษ" });
    }
    const pool = getPool();
    const [customers] = await pool.query("SELECT room_number FROM Customer WHERE id = ?", [req.user.id]);
    if (!customers[0]?.room_number) return res.status(400).json({ message: "ไม่พบห้องพักที่ผูกกับบัญชีนี้" });
    if (requestType === "vehicle" && (await isPlateRegisteredByOther(pool, req.user.id, vehiclePlate))) {
      return res.status(409).json({ message: "ทะเบียนรถนี้ถูกลงทะเบียนโดยผู้พักอาศัยท่านอื่นแล้ว ลงทะเบียนได้เฉพาะรถของคุณเท่านั้น" });
    }
    savedPhotos = await savePublicImages("vehicles", parsedPhotos.value);
    const [result] = await pool.query(
      `INSERT INTO ResidentVisitRequest (customer_id, room_number, request_type, vehicle_plate, vehicle_model, vehicle_photos, guest_name, guest_phone, start_at, end_at, note, is_special, special_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        customers[0].room_number,
        requestType,
        vehiclePlate?.trim() || null,
        vehicleModel?.trim() || null,
        savedPhotos.length ? JSON.stringify(savedPhotos) : null,
        guestName?.trim() || null,
        guestPhone?.trim() || null,
        startAt,
        openEnded ? null : endAt,
        note?.trim() || null,
        Boolean(isSpecial),
        isSpecial ? specialReason.trim() : null,
      ],
    );
    return res.status(201).json({ id: result.insertId, message: "ส่งคำขอให้เจ้าหน้าที่แล้ว" });
  } catch (error) {
    if (savedPhotos.length) await deletePublicImages(savedPhotos.map((photo) => photo.url)).catch(() => {});
    console.error("Create resident visit request error:", error);
    return res.status(500).json({ message: "ไม่สามารถส่งคำขอได้" });
  }
});

router.get("/safety-incidents", async (req, res) => {
  try {
    const [incidents] = await getPool().query(
      `SELECT id, room_number, incident_type, severity, description, status, reviewed_by_name, reviewed_at, review_note, created_at
       FROM SafetyIncident WHERE reporter_role = 'Customer' AND reporter_id = ? ORDER BY created_at DESC`,
      [req.user.id],
    );
    return res.json({ incidents });
  } catch (error) {
    console.error("Fetch own safety incidents error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดประวัติการแจ้งเหตุได้" });
  }
});

router.post("/safety-incidents", createSafetyIncident);

export default router;
