import { Router } from "express";
import dormInfoRouter from "./DormInfoRouter.js";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { authenticate, requireCustomerRole } from "../middleware/authMiddleware.js";
import { requireActiveCustomer } from "../middleware/accounts.js";
import {
  deletePublicImages,
  parseStoredPhotos,
  PUBLIC_UPLOAD_DIR,
  savePublicImages,
  withIncidentPhotos,
} from "../middleware/publicUploads.js";
import { listAnnouncements } from "./AnnouncementRouter.js";
import {
  isPositiveId,
  isValidPassword,
  parseMaintenanceInput,
  parsePhotoList,
  parseTenantRequestInput,
  validatePersonUpdateInput,
} from "../middleware/validation.js";
import {
  DEMO_PAYMENT_CHANNELS,
  TEST_PAYMENT_MARK,
  inquireSlip,
  normalizeSlipPayload,
  SlipVerificationError,
  slipPartyName,
  slipReceiverMatches,
  slipTransactionTime,
} from "../middleware/slipVerification.js";
import { attachParcelPhotos } from "./ParcelRouter.js";
import { PARKING_EXPIRED_BY, expireParkedVehicles } from "./residentVisitReview.js";
import { loadCustomerContracts } from "./rentalContracts.js";

const router = Router();
const CUSTOMER_VEHICLE_MAX_PHOTOS = 6;
const SAFETY_INCIDENT_MAX_PHOTOS = 4;
const CUSTOMER_OPEN_REPORT_LIMIT = 10;
const SAFETY_REPORTER_TABLE = { Customer: "Customer", Staff: "Staff", Admin: "Admin", Owner: "Owner" };
const AFTER_HISTORY_RESET = "> COALESCE((SELECT history_reset_at FROM Customer WHERE id = ?), '1000-01-01')";
const URGENT_INCIDENT_TYPES = new Set(["fire", "medical", "accident"]);
const URGENT_INCIDENT_KEYWORDS = [
  "ด่วน", "ช่วยด้วย", "ฉุกเฉิน", "ไฟไหม้", "ควัน", "ระเบิด", "แก๊สรั่ว", "ก๊าซรั่ว", "ไฟช็อต", "ไฟดูด",
  "บาดเจ็บ", "เลือด", "หมดสติ", "ไม่หายใจ", "ชัก", "หัวใจ", "ล้ม", "ตกบันได",
  "บุกรุก", "ขโมย", "งัด", "ปล้น", "อาวุธ", "มีด", "ปืน", "ทำร้าย", "ทะเลาะ", "ข่มขู่",
  "น้ำท่วม", "ท่อแตก", "ติดลิฟต์",
];

export function withVehiclePhotos(requests) {
  return requests.map((request) => ({ ...request, vehicle_photos: parseStoredPhotos(request.vehicle_photos) }));
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
    `SELECT maintenance_request_id, name, url FROM MaintenancePhoto
     WHERE maintenance_request_id IN (?) AND url IS NOT NULL ORDER BY id ASC`,
    [requests.map((request) => request.id)],
  );
  const photosByRequestId = new Map();
  for (const photo of photos) {
    const list = photosByRequestId.get(photo.maintenance_request_id) || [];
    list.push({ name: photo.name, url: photo.url });
    photosByRequestId.set(photo.maintenance_request_id, list);
  }
  return requests.map((request) => ({ ...request, photos: photosByRequestId.get(request.id) || [] }));
}


export async function createSafetyIncident(req, res) {
  let savedPhotos = [];
  try {
    const { incidentType, description, roomNumber, photos } = req.body ?? {};
    if (!String(incidentType ?? "").trim() || !String(description ?? "").trim()) {
      return res.status(400).json({ message: "กรุณาระบุประเภทเหตุและรายละเอียด" });
    }
    if (String(description).length > 1000) return res.status(400).json({ message: "รายละเอียดต้องไม่เกิน 1,000 ตัวอักษร" });
    const parsedPhotos = parsePhotoList(photos, SAFETY_INCIDENT_MAX_PHOTOS);
    if (parsedPhotos.error) return res.status(400).json({ message: parsedPhotos.error });

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
    if (isCustomer) {
      const [[{ openCount }]] = await pool.query(
        "SELECT COUNT(*) AS openCount FROM SafetyIncident WHERE reporter_role = 'Customer' AND reporter_id = ? AND status = 'pending'",
        [req.user.id],
      );
      if (openCount >= CUSTOMER_OPEN_REPORT_LIMIT) {
        return res.status(409).json({ message: `มีรายงานเหตุที่รอตรวจสอบครบ ${CUSTOMER_OPEN_REPORT_LIMIT} รายการแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบก่อนแจ้งเพิ่ม` });
      }
    }
    const name = `${user.first_name} ${user.last_name}`.trim();
    const requestedRoom = Number(roomNumber);
    const safeRoom = isCustomer ? user.room_number : Number.isInteger(requestedRoom) && requestedRoom > 0 ? requestedRoom : null;
    const severity = classifySafetySeverity(String(incidentType).trim(), description);
    savedPhotos = await savePublicImages("incidents", parsedPhotos.value);
    await pool.query(
      `INSERT INTO SafetyIncident (reporter_role, reporter_id, reporter_name, room_number, incident_type, severity, description, photos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.role,
        req.user.id,
        name,
        safeRoom,
        String(incidentType).trim().slice(0, 80),
        severity,
        String(description).trim(),
        savedPhotos.length ? JSON.stringify(savedPhotos) : null,
      ],
    );
    return res.status(201).json({ message: "ส่งรายงานเหตุให้เจ้าหน้าที่แล้ว", severity });
  } catch (error) {
    if (savedPhotos.length) await deletePublicImages(savedPhotos.map((photo) => photo.url)).catch(() => {});
    console.error("Create safety incident error:", error);
    return res.status(500).json({ message: "ไม่สามารถส่งรายงานเหตุได้" });
  }
}

router.use(authenticate, requireCustomerRole, requireActiveCustomer);
router.post("/dorm-info/acknowledge", async (req, res) => {
  try {
    await getPool().query(
      `UPDATE Customer SET dorm_info_acknowledged_at = COALESCE(dorm_info_acknowledged_at, NOW()) WHERE id = ?`,
      [req.user.id],
    );
    return res.json({ message: "รับทราบกฎระเบียบและเบอร์ติดต่อแล้ว" });
  } catch (error) {
    console.error("Acknowledge dorm information error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});
router.use("/dorm-info", dormInfoRouter);

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
      if (!(await bcrypt.compare(body.current_password, rows[0].password))) {
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

export async function loadDepositPayments(db, customerIds) {
  const ids = [...new Set(customerIds)].filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0);
  const byCustomer = new Map();
  if (ids.length === 0) return byCustomer;
  const [rows] = await db.query(
    `SELECT b.customer_id, p.amount, p.status, p.type FROM Payment p
     JOIN Booking b ON b.id = p.booking_id
     WHERE b.customer_id IN (?) AND p.type = 'deposit'
       AND b.id >= COALESCE((
         SELECT MAX(lb.id) FROM Booking lb
         WHERE lb.customer_id = b.customer_id AND lb.contract_completed_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM Booking eb
             WHERE eb.customer_id = lb.customer_id AND eb.contract_completed_at IS NOT NULL AND eb.id < lb.id)
       ), 0)`,
    [ids],
  );
  for (const row of rows) byCustomer.set(row.customer_id, [...(byCustomer.get(row.customer_id) ?? []), row]);
  return byCustomer;
}

export function computeDepositDue(paymentsForBooking, depositAmount) {
  const depositCents = Math.max(0, Math.round((Number(depositAmount) || 0) * 100));
  if (depositCents === 0) return { amount: 0, total: 0, status: "none" };
  const depositPayments = paymentsForBooking.filter((payment) => payment.type === "deposit");
  const paidCents = depositPayments.reduce((total, payment) => {
    const amount = Math.round(Number(payment.amount) * 100);
    return payment.status === "paid" && Number.isSafeInteger(amount) ? total + amount : total;
  }, 0);
  const outstandingCents = Math.max(0, depositCents - paidCents);
  const pending = depositPayments.some((payment) => payment.status === "pending" && Number(payment.amount) > 0);
  return {
    amount: outstandingCents / 100,
    total: depositCents / 100,
    status: outstandingCents === 0 ? "paid" : pending ? "pending" : "due",
  };
}

function computeRentDue(room, paymentsForBooking) {
  if (!room || !room.is_booked || !room.rental_start_date || !room.rental_end_date) return null;
  const start = new Date(room.rental_start_date);
  const end = new Date(room.rental_end_date);
  const now = new Date();
  const priceCents = Math.round(Number(room.price) * 100);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !Number.isSafeInteger(priceCents) || priceCents <= 0) return null;
  if (now < start || now > end) return null;

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
  const periods = [];
  for (let offset = 0; ; offset += 1) {
    const periodStart = periodAt(offset);
    if (periodStart > now || periodStart >= end) break;
    periods.push({ periodStart, periodEnd: periodAt(offset + 1), index: offset });
  }
  if (periods.length === 0) return null;

  const prepaidUntil = room.prepaid_until ? new Date(room.prepaid_until) : null;
  const prepaidCents = prepaidUntil && !Number.isNaN(prepaidUntil.getTime())
    ? periods.filter((period) => period.periodEnd <= prepaidUntil).length * priceCents : 0;
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
  let creditCents = Math.max(0, Math.max(paidRentCents - receiptsAfterPrepaidCents, prepaidCents) + receiptsAfterPrepaidCents);
  const unpaidPeriods = [];
  for (const period of periods) {
    const applied = Math.min(priceCents, creditCents);
    creditCents -= applied;
    const outstandingCents = priceCents - applied;
    if (outstandingCents > 0) unpaidPeriods.push({ ...period, outstandingCents });
  }
  const currentPeriod = periods[periods.length - 1];
  if (unpaidPeriods.length === 0) {
    return { amount: 0, firstPeriod: false, monthlyPrice: priceCents / 100, lumpSumMonths: null, overdueMonths: 0,
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
    firstPeriod: earliestUnpaid.index === 0,
    monthlyPrice: priceCents / 100,
    lumpSumMonths,
    overdueMonths: unpaidPeriods.length - 1,
    periodStart: earliestUnpaid.periodStart,
    periodEnd: latestUnpaid.periodEnd,
    dueDate,
    status,
  };
}

const UTILITY_LABEL = { water: "ค่าน้ำ", electricity: "ค่าไฟฟ้า" };

export function computeCurrentDue(room, paymentsForBooking, depositAmount, depositPayments = paymentsForBooking) {
  const rentDue = computeRentDue(room, paymentsForBooking);
  const rentUnpaid = rentDue && rentDue.status !== "paid";
  const depositDue = room?.is_booked ? computeDepositDue(depositPayments, depositAmount) : { amount: 0, status: "none" };
  const depositUnpaid = depositDue.status === "due" || depositDue.status === "pending";

  const utilityCharges = paymentsForBooking.filter(
    (p) => (p.type === "water" || p.type === "electricity") && p.status === "pending",
  );

  const items = [];
  if (depositUnpaid) {
    const depositMonths = Number(room.price) > 0 ? depositDue.total / Number(room.price) : 0;
    items.push({
      type: "deposit",
      label: Number.isInteger(depositMonths) && depositMonths > 0
        ? `เงินมัดจำ ${depositMonths} เดือน (฿${Number(room.price).toLocaleString("th-TH")} × ${depositMonths})`
        : "เงินมัดจำ",
      amount: depositDue.amount,
      status: depositDue.status,
    });
  }
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
  const depositAmountDue = depositUnpaid ? depositDue.amount : 0;
  const utilityAmount = utilityCharges.reduce((sum, charge) => sum + Number(charge.amount), 0);

  return {
    amount: rentAmount + depositAmountDue + utilityAmount,
    rentAmount,
    depositAmount: depositAmountDue,
    depositStatus: depositDue.status,
    items,
    firstPeriod: Boolean(rentUnpaid && rentDue.firstPeriod),
    monthlyPrice: rentDue?.monthlyPrice ?? null,
    lumpSumMonths: rentDue?.lumpSumMonths || null,
    overdueMonths: rentUnpaid ? rentDue.overdueMonths || 0 : 0,
    periodStart: rentDue?.periodStart || null,
    periodEnd: rentDue?.periodEnd || null,
    dueDate: rentDue?.dueDate || null,
    status: rentUnpaid ? rentDue.status : depositDue.status === "pending" ? "pending" : "due",
  };
}

export function outstandingFromDue(currentDue) {
  const items = (currentDue?.items ?? []).filter(
    (item) => item.status !== "pending" && !(item.type === "rent" && item.status === "due"),
  );
  const amount = items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) / 100;
  return { amount, items: items.map(({ type, label, amount: itemAmount, status }) => ({ type, label, amount: itemAmount, status })) };
}

export function moveOutBalanceFromDue(currentDue) {
  const items = (currentDue?.items ?? []).filter((item) => item.type !== "deposit");
  const amount = items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) / 100;
  return {
    amount,
    pendingReview: items.some((item) => item.status === "pending"),
    items: items.map(({ type, label, amount: itemAmount, status }) => ({ type, label, amount: itemAmount, status })),
  };
}

export const MOVEOUT_OUTSTANDING_MESSAGE = (balance) =>
  balance.items.every((item) => item.status === "pending")
    ? "ผู้เช่ามีสลิปที่รอตรวจสอบ กรุณาตรวจสลิปให้เรียบร้อยก่อนอนุมัติการย้ายออก"
    : `ผู้เช่ามียอดค้างชำระ ฿${balance.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (${balance.items
      .map((item) => item.label)
      .join(", ")}) กรุณาเก็บเงินให้ครบก่อนอนุมัติการย้ายออก`;

export async function loadMoveOutBalance(db, customerId) {
  return moveOutBalanceFromDue(await loadCustomerCurrentDue(db, customerId));
}

export async function loadCustomerOutstanding(db, customerId) {
  return outstandingFromDue(await loadCustomerCurrentDue(db, customerId));
}

async function loadCustomerCurrentDue(db, customerId) {
  const [customerRows] = await db.query(`SELECT id, room_number, deposit_amount FROM Customer WHERE id = ?`, [customerId]);
  const customer = customerRows[0];
  if (!customer?.room_number) return null;
  const [[roomRows], [bookingRows]] = await Promise.all([
    db.query(
      `SELECT price, is_booked, rental_start_date, rental_end_date, prepaid_until, pending_lump_sum_months FROM Room WHERE room_number = ?`,
      [customer.room_number],
    ),
    db.query(`SELECT id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`, [customer.id]),
  ]);
  if (!bookingRows[0]) return null;
  const [[payments], depositPayments] = await Promise.all([
    db.query(`SELECT id, amount, status, type, note, payment_date, slip_path FROM Payment WHERE booking_id = ?`, [bookingRows[0].id]),
    loadDepositPayments(db, [customer.id]),
  ]);
  return computeCurrentDue(roomRows[0], payments, customer.deposit_amount, depositPayments.get(customer.id) ?? []);
}

export const RENEW_OUTSTANDING_MESSAGE = (amount) =>
  `มียอดค้างชำระ ฿${amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} กรุณาชำระยอดค้างให้เรียบร้อยก่อนต่อสัญญา`;

router.get("/me", async (req, res) => {
  try {
    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id, idcard, first_name, last_name, phone, age, room_number, deposit_amount, created_at AS registered_at,
              dorm_info_acknowledged_at IS NOT NULL AS dorm_info_acknowledged
       FROM Customer WHERE id = ?`,
      [req.user.id],
    );

    const customerRow = customerRows[0];
    if (!customerRow) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }
    const customer = { ...customerRow, dorm_info_acknowledged: Boolean(customerRow.dorm_info_acknowledged) };
    const depositAmount = customerRow.deposit_amount;

    const [
      [roomRows],
      [availableRooms],
      [bookings],
      [maintenanceRequests],
      [tenantRequests],
      [acknowledgedRows],
      announcementList,
      [parcels],
    ] = await Promise.all([
      pool.query(
        `SELECT room_number, is_booked, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_unit_price, water_price, rental_start_date, rental_end_date, prepaid_until, pending_lump_sum_months
         FROM Room WHERE room_number = ?`,
        [customer.room_number],
      ),
      pool.query(
        `SELECT room_number, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_unit_price, water_price
         FROM Room WHERE is_booked = FALSE ORDER BY room_number ASC`,
      ),
      pool.query(
        `SELECT b.id AS booking_id, r.room_number, r.water_unit_price, b.created_at,
                COALESCE(b.rental_start_date, r.rental_start_date) AS rental_start_date,
                COALESCE(b.rental_end_date, r.rental_end_date) AS rental_end_date
         FROM Booking b
         JOIN Room r ON r.id = b.room_id
         WHERE b.customer_id = ?
         ORDER BY b.created_at DESC, b.id DESC`,
        [customer.id],
      ),
      pool.query(
        `SELECT id, description, category, contact_phone, preferred_time, status, accepted_at, accepted_by_name, completed_at, completed_by_name, created_at
         FROM MaintenanceRequest WHERE customer_id = ? AND created_at ${AFTER_HISTORY_RESET} ORDER BY created_at DESC`,
        [customer.id, customer.id],
      ),
      pool.query(
        `SELECT tr.id, tr.type, tr.note, tr.room_number, tr.target_room_number, tr.renew_duration_months, tr.renew_payment_type,
                tr.move_reason, DATE_FORMAT(tr.preferred_move_date, '%Y-%m-%d') AS preferred_move_date,
                tr.status, tr.accepted_at, tr.accepted_by_name, tr.completed_at, tr.completed_by_name, tr.created_at, tr.reject_reason,
                sr.price AS source_room_price, tg.price AS target_room_price,
                sr.rental_end_date AS source_rental_end_date,
                (SELECT cu.deposit_amount FROM Customer cu WHERE cu.id = tr.customer_id) AS deposit_amount,
                (moi.id IS NOT NULL) AS room_inspected
         FROM TenantRequest tr
         LEFT JOIN Room sr ON sr.room_number = tr.room_number
         LEFT JOIN Room tg ON tg.room_number = tr.target_room_number
         LEFT JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
         WHERE tr.customer_id = ? AND tr.created_at ${AFTER_HISTORY_RESET}
         ORDER BY tr.created_at DESC, tr.id DESC`,
        [customer.id, customer.id],
      ),
      pool.query(`SELECT announcement_id FROM AnnouncementAcknowledgement WHERE customer_id = ?`, [customer.id]),
      listAnnouncements(pool),
      pool.query(
        `SELECT id, tracking_number, sender_name, description, status, staff_name, received_at, created_at
         FROM Parcel WHERE customer_id = ? AND room_number = ? AND created_at ${AFTER_HISTORY_RESET}
         ORDER BY created_at DESC`,
        [customer.id, customer.room_number, customer.id],
      ),
    ]);

    const bookingIds = bookings.map((booking) => booking.booking_id);
    const [[payments], maintenanceWithPhotos, parcelsWithPhotos, depositPaymentsByCustomer] = await Promise.all([
      bookingIds.length > 0
        ? pool.query(
            `SELECT id, booking_id, amount, payment_date, status, type, electricity_units, water_units, note, slip_path, created_at
             FROM Payment
             WHERE booking_id IN (?)
             ORDER BY payment_date DESC, created_at DESC`,
            [bookingIds],
          )
        : [[]],
      attachMaintenancePhotos(pool, maintenanceRequests),
      attachParcelPhotos(pool, parcels),
      loadDepositPayments(pool, [customer.id]),
    ]);

    const paymentsByBooking = new Map();
    for (const payment of payments) {
      const list = paymentsByBooking.get(payment.booking_id) || [];
      list.push(payment);
      paymentsByBooking.set(payment.booking_id, list);
    }
    const rentalHistory = bookings.map((booking) => ({
      ...booking,
      payments: paymentsByBooking.get(booking.booking_id) || [],
    }));

    const acknowledgedIds = new Set(acknowledgedRows.map((row) => row.announcement_id));
    const announcements = announcementList.map((announcement) => ({
      ...announcement,
      acknowledged: acknowledgedIds.has(announcement.id),
    }));

    const currentRoom = roomRows[0] || null;
    const paymentsForCurrentBooking = paymentsByBooking.get(bookings[0]?.booking_id) || [];
    const currentDue = computeCurrentDue(
      currentRoom,
      paymentsForCurrentBooking,
      depositAmount,
      depositPaymentsByCustomer.get(customer.id) ?? [],
    );
    const room = currentRoom ? { ...currentRoom } : null;
    if (room) delete room.pending_lump_sum_months;

    return res.json({
      customer,
      room,
      availableRooms,
      rentalHistory,
      maintenanceRequests: maintenanceWithPhotos,
      tenantRequests,
      announcements,
      currentDue,
      outstanding: outstandingFromDue(currentDue),
      moveOutBalance: moveOutBalanceFromDue(currentDue),
      depositPaid: (depositPaymentsByCustomer.get(customer.id) ?? []).reduce((total, payment) => {
        const cents = Math.round(Number(payment.amount) * 100);
        return payment.status === "paid" && Number.isSafeInteger(cents) ? total + cents : total;
      }, 0) / 100,
      parcels: parcelsWithPhotos,
    });
  } catch (error) {
    console.error("Customer dashboard error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export async function withThisMonthRent(pool, contracts) {
  const active = contracts.filter((contract) => !["ended", "ended_early"].includes(contract.status) && contract.current_room_number != null);
  if (active.length === 0) return contracts.map((contract) => ({ ...contract, this_month: null }));
  const customerIds = [...new Set(active.map((contract) => contract.customer_id))];
  const [[customers], [rooms], [bookings]] = await Promise.all([
    pool.query(`SELECT id, room_number, deposit_amount FROM Customer WHERE id IN (?)`, [customerIds]),
    pool.query(
      `SELECT room_number, is_booked, price, rental_start_date, rental_end_date, prepaid_until, pending_lump_sum_months
       FROM Room WHERE room_number IN (?)`,
      [[...new Set(active.map((contract) => contract.current_room_number))]],
    ),
    pool.query(
      `SELECT customer_id, id FROM (
         SELECT customer_id, id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC, id DESC) AS booking_rank
         FROM Booking WHERE customer_id IN (?)
       ) ranked WHERE booking_rank = 1`,
      [customerIds],
    ),
  ]);
  const bookingIds = bookings.map((booking) => booking.id);
  const [payments] = bookingIds.length
    ? await pool.query(
        `SELECT id, booking_id, amount, payment_date, status, type, slip_path, created_at FROM Payment WHERE booking_id IN (?)`,
        [bookingIds],
      )
    : [[]];
  const depositPaymentsByCustomer = await loadDepositPayments(pool, customerIds);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const roomByNumber = new Map(rooms.map((room) => [room.room_number, room]));
  const bookingByCustomer = new Map(bookings.map((booking) => [booking.customer_id, booking.id]));
  return contracts.map((contract) => {
    const customer = customerById.get(contract.customer_id);
    const room = customer ? roomByNumber.get(customer.room_number) : null;
    if (!active.includes(contract) || !room) return { ...contract, this_month: null };
    const bookingId = bookingByCustomer.get(contract.customer_id);
    const bookingPayments = payments.filter((payment) => payment.booking_id === bookingId);
    const rentDue = computeRentDue(room, bookingPayments);
    const depositDue = computeDepositDue(depositPaymentsByCustomer.get(customer.id) ?? [], customer.deposit_amount);
    const lastRentPayment = bookingPayments
      .filter((payment) => !["deposit", "water", "electricity"].includes(payment.type) && ["paid", "pending"].includes(payment.status))
      .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date) || new Date(b.created_at) - new Date(a.created_at) || b.id - a.id)[0];
    return {
      ...contract,
      this_month: rentDue
        ? {
            last_payment: lastRentPayment
              ? {
                  amount: Number(lastRentPayment.amount),
                  status: lastRentPayment.status,
                  payment_date: lastRentPayment.payment_date,
                  slip_path: lastRentPayment.slip_path || null,
                }
              : null,
            status: rentDue.status,
            amount: rentDue.amount,
            overdue_months: rentDue.overdueMonths,
            deposit_due: depositDue.amount,
            deposit_status: depositDue.status,
            period_start: rentDue.periodStart,
            period_end: rentDue.periodEnd,
            due_date: rentDue.dueDate,
          }
        : null,
    };
  });
}

router.get("/contract", async (req, res) => {
  try {
    const pool = getPool();
    const contracts = await loadCustomerContracts(pool, [req.user.id], { currentOnly: true });
    const contract = contracts.get(req.user.id) ?? null;
    if (!contract) return res.json({ contract: null });
    const [withMonth] = await withThisMonthRent(pool, [contract]);
    return res.json({ contract: withMonth });
  } catch (error) {
    console.error("Fetch customer contract error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดข้อมูลสัญญาเช่าได้" });
  }
});

const PAYMENT_METHOD_LABELS = { promptpay: "ผ่าน PromptPay", bank: "โอนเข้าบัญชีธนาคาร" };

router.get("/payment-channels", async (_req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const [rows] = await getPool().query(
      "SELECT dorm_name, promptpay_id, bank_name, bank_account_no, payment_test_mode, slip_verify_mode FROM DormConfig WHERE id = 1",
    );
    const config = rows[0] || {};
    const testMode = Boolean(config.payment_test_mode);
    const source = testMode ? DEMO_PAYMENT_CHANNELS : config;
    return res.json({
      channels: {
        dorm_name: config.dorm_name || "",
        promptpay_id: source.promptpay_id || "",
        bank_name: source.bank_name || "",
        bank_account_no: source.bank_account_no || "",
        test_mode: testMode,
        verify_mode: config.slip_verify_mode === "manual" ? "manual" : "auto",
      },
    });
  } catch (error) {
    console.error("Fetch payment channels error:", error.code);
    return res.status(500).json({ message: "ไม่สามารถโหลดช่องทางชำระเงินได้" });
  }
});

const SLIP_USED_MESSAGE = "สลิปนี้ถูกใช้ชำระเงินไปแล้ว ไม่สามารถใช้ซ้ำได้";

async function findUsedSlip(pool, column, value) {
  const [rows] = await pool.query(
    `SELECT trans_ref, amount, DATE_FORMAT(trans_at, '%Y-%m-%d %H:%i:%s') AS trans_at, sending_bank, receiving_bank,
            sender_name, receiver_name
     FROM PaymentSlip WHERE ${column} = ? LIMIT 1`,
    [value],
  );
  return rows[0] || null;
}

function rejectionDetails(attempt) {
  const slip = attempt.slip;
  if (slip) {
    const amount = Math.round(Number(slip.amount) * 100);
    return {
      transRef: String(slip.transRef ?? "").replace(/[^\x21-\x7e]/g, "").slice(0, 64) || null,
      amount: Number.isSafeInteger(amount) ? amount / 100 : null,
      transAt: slipTransactionTime(slip),
      sendingBank: String(slip.sendingBank ?? "").slice(0, 10) || null,
      receivingBank: String(slip.receivingBank ?? "").slice(0, 10) || null,
      senderName: slipPartyName(slip.sender),
      receiverName: slipPartyName(slip.receiver),
    };
  }
  const used = attempt.used || {};
  return {
    transRef: used.trans_ref || null,
    amount: used.amount ?? null,
    transAt: used.trans_at || null,
    sendingBank: used.sending_bank || null,
    receivingBank: used.receiving_bank || null,
    senderName: used.sender_name || null,
    receiverName: used.receiver_name || null,
  };
}

async function recordSlipRejection(pool, attempt, file, reason) {
  const details = rejectionDetails(attempt);
  await pool.query(
    `INSERT INTO PaymentSlipRejection (booking_id, customer_id, slip_path, qr_payload, trans_ref, amount, trans_at,
                                       sending_bank, receiving_bank, sender_name, receiver_name, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attempt.bookingId,
      attempt.customerId,
      `/uploads/${PAYMENT_SLIP_FOLDER}/${path.basename(file.filename)}`,
      attempt.qrPayload || null,
      details.transRef,
      details.amount,
      details.transAt,
      details.sendingBank,
      details.receivingBank,
      details.senderName,
      details.receiverName,
      String(reason).slice(0, 255),
    ],
  );
}

router.post("/payments/confirm", parsePaymentSlip, async (req, res) => {
  let connection;
  let attempt = null;
  try {
    if (!req.file) return res.status(400).json({ message: "กรุณาแนบสลิปการโอนเงิน" });
    const paymentMethod = req.body?.payment_method;
    if (!PAYMENT_METHOD_LABELS[paymentMethod]) {
      throw new SlipVerificationError(400, "กรุณาเลือกช่องทางการชำระเงิน");
    }
    const methodLabel = PAYMENT_METHOD_LABELS[paymentMethod];
    const qrPayload = normalizeSlipPayload(req.body?.qr_payload);
    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id, room_number, deposit_amount FROM Customer WHERE id = ?`,
      [req.user.id],
    );
    const customer = customerRows[0];
    if (!customer) throw new SlipVerificationError(404, "ไม่พบข้อมูลผู้ใช้");

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
    if (!booking) throw new SlipVerificationError(404, "ไม่พบสัญญาเช่าของคุณ");

    const [paymentsForBooking] = await pool.query(
      `SELECT id, amount, status, type, note, payment_date, slip_path FROM Payment WHERE booking_id = ?`,
      [booking.id],
    );

    const depositPayments = (await loadDepositPayments(pool, [customer.id])).get(customer.id) ?? [];
    const currentDue = computeCurrentDue(room, paymentsForBooking, customer.deposit_amount, depositPayments);
    if (!currentDue) throw new SlipVerificationError(400, "ไม่มียอดค่าเช่าที่ต้องชำระในขณะนี้");

    if (paymentsForBooking.some((payment) => payment.status === "pending" && payment.slip_path)) {
      throw new SlipVerificationError(409, "มีสลิปที่รอตรวจสอบอยู่แล้ว");
    }

    const [configRows] = await pool.query(
      "SELECT promptpay_id, bank_account_no, payment_test_mode, slip_verify_mode FROM DormConfig WHERE id = 1",
    );
    const config = configRows[0] || {};
    const testMode = Boolean(config.payment_test_mode);

    if (config.slip_verify_mode === "manual") {
      const used = !testMode && qrPayload ? await findUsedSlip(pool, "qr_payload", qrPayload) : null;
      if (used) {
        attempt = { bookingId: booking.id, customerId: customer.id, qrPayload, slip: null, used };
        throw new SlipVerificationError(409, SLIP_USED_MESSAGE);
      }
      const manualSlipPath = `/uploads/${PAYMENT_SLIP_FOLDER}/${path.basename(req.file.filename)}`;
      const manualLabel = testMode ? `${methodLabel} · ${TEST_PAYMENT_MARK}` : methodLabel;
      connection = await pool.getConnection();
      await connection.beginTransaction();
      if (currentDue.rentAmount > 0) {
        const note = currentDue.lumpSumMonths
          ? `รอตรวจสอบสลิป - ค่าเช่าล่วงหน้า ${currentDue.lumpSumMonths} เดือน · ${manualLabel}`
          : `รอตรวจสอบสลิปค่าเช่า · ${manualLabel}`;
        await connection.query(
          `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note, slip_path) VALUES (?, ?, CURDATE(), 'pending', 'rent', ?, ?)`,
          [booking.id, currentDue.rentAmount, note, manualSlipPath],
        );
      }
      if (currentDue.depositAmount > 0 && currentDue.depositStatus === "due") {
        await connection.query(
          `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note, slip_path) VALUES (?, ?, CURDATE(), 'pending', 'deposit', ?, ?)`,
          [booking.id, currentDue.depositAmount, `รอตรวจสอบสลิปเงินมัดจำ · ${manualLabel}`, manualSlipPath],
        );
      }
      const manualUtilityIds = currentDue.items.filter((item) => item.id).map((item) => item.id);
      if (manualUtilityIds.length > 0) {
        await connection.query(
          `UPDATE Payment SET slip_path = ?, note = LEFT(CONCAT(COALESCE(note, ''), ' (รอตรวจสอบสลิป · ', ?, ')'), 255)
           WHERE id IN (?) AND status = 'pending'`,
          [manualSlipPath, manualLabel, manualUtilityIds],
        );
      }
      await connection.commit();
      return res.status(201).json({
        message: testMode ? "ส่งสลิปแล้ว (โหมดทดลอง) กรุณารอเจ้าหน้าที่ตรวจสอบ" : "ส่งสลิปแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบ",
      });
    }

    const dueCents = Math.round(Number(currentDue.amount) * 100);
    let slip;
    let transRef;
    let slipAmountCents;

    if (testMode) {
      slip = { sender: { displayName: "โหมดทดลอง" }, receiver: { displayName: DEMO_PAYMENT_CHANNELS.bank_name } };
      transRef = `TEST-${randomUUID()}`;
      slipAmountCents = dueCents;
    } else {
      attempt = { bookingId: booking.id, customerId: customer.id, qrPayload, slip: null, used: null };
      attempt.used = qrPayload ? await findUsedSlip(pool, "qr_payload", qrPayload) : null;
      if (attempt.used) throw new SlipVerificationError(409, SLIP_USED_MESSAGE);
      slip = await inquireSlip({ payload: qrPayload, file: req.file });
      attempt.slip = slip;
      transRef = String(slip.transRef).replace(/[^\x21-\x7e]/g, "").slice(0, 64);
      if (!transRef) throw new SlipVerificationError(400, "สลิปไม่ถูกต้อง หรือไม่พบรายการโอนนี้ในระบบธนาคาร");
      if (await findUsedSlip(pool, "trans_ref", transRef)) throw new SlipVerificationError(409, SLIP_USED_MESSAGE);

      slipAmountCents = Math.round(Number(slip.amount) * 100);
      if (!Number.isSafeInteger(slipAmountCents) || slipAmountCents < dueCents) {
        throw new SlipVerificationError(
          400,
          `ยอดเงินในสลิป (฿${(Number(slip.amount) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}) น้อยกว่ายอดที่ต้องชำระ (฿${currentDue.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })})`,
        );
      }

      if (!slipReceiverMatches(slip, [config.promptpay_id, config.bank_account_no])) {
        throw new SlipVerificationError(400, "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีของหอพัก กรุณาตรวจสอบสลิปอีกครั้ง");
      }
    }
    const verifyLabel = testMode ? TEST_PAYMENT_MARK : "ตรวจสลิปอัตโนมัติ";

    attempt = null;
    const slipPath = `/uploads/${PAYMENT_SLIP_FOLDER}/${path.basename(req.file.filename)}`;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.query(`SELECT id FROM Booking WHERE id = ? FOR UPDATE`, [booking.id]);
    const [lockedPayments] = await connection.query(
      `SELECT id, amount, status, type, note, payment_date, slip_path FROM Payment WHERE booking_id = ? FOR UPDATE`,
      [booking.id],
    );
    const lockedDepositPayments = (await loadDepositPayments(connection, [customer.id])).get(customer.id) ?? [];
    const lockedDue = computeCurrentDue(room, lockedPayments, customer.deposit_amount, lockedDepositPayments);
    if (!lockedDue || Math.round(Number(lockedDue.amount) * 100) !== dueCents) {
      throw new SlipVerificationError(409, "ยอดที่ต้องชำระเปลี่ยนแปลงระหว่างตรวจสอบสลิป กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
    }

    if (currentDue.rentAmount > 0) {
      const note = currentDue.lumpSumMonths
        ? `ชำระค่าเช่าล่วงหน้า ${currentDue.lumpSumMonths} เดือน · ${methodLabel} · ${verifyLabel}`
        : `ชำระค่าเช่า · ${methodLabel} · ${verifyLabel}`;

      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note, slip_path) VALUES (?, ?, CURDATE(), 'paid', 'rent', ?, ?)`,
        [booking.id, currentDue.rentAmount, note, slipPath],
      );
    }

    if (currentDue.depositAmount > 0 && currentDue.depositStatus === "due") {
      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note, slip_path) VALUES (?, ?, CURDATE(), 'paid', 'deposit', ?, ?)`,
        [booking.id, currentDue.depositAmount, `ชำระเงินมัดจำ · ${methodLabel} · ${verifyLabel}`, slipPath],
      );
    }

    const utilityPaymentIds = currentDue.items.filter((item) => item.id).map((item) => item.id);
    if (utilityPaymentIds.length > 0) {
      await connection.query(
        `UPDATE Payment SET status = 'paid', payment_date = CURDATE(), slip_path = ?,
                note = LEFT(CONCAT(COALESCE(note, ''), ' (ชำระแล้ว · ', ?, ' · ', ?, ')'), 255)
         WHERE id IN (?) AND status = 'pending'`,
        [slipPath, methodLabel, verifyLabel, utilityPaymentIds],
      );
    }

    if (currentDue.rentAmount > 0 && currentDue.lumpSumMonths) {
      await connection.query(
        `UPDATE Room SET prepaid_until = DATE_ADD(?, INTERVAL ? MONTH), pending_lump_sum_months = NULL
         WHERE room_number = ?`,
        [currentDue.periodEnd, currentDue.lumpSumMonths - 1, customer.room_number],
      );
    }

    await connection.query(
      `INSERT INTO PaymentSlip (trans_ref, qr_payload, booking_id, customer_id, slip_path, amount, trans_at,
                                sending_bank, receiving_bank, sender_name, receiver_name, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transRef,
        testMode ? null : qrPayload || null,
        booking.id,
        customer.id,
        slipPath,
        slipAmountCents / 100,
        slipTransactionTime(slip),
        String(slip.sendingBank ?? "").slice(0, 10) || null,
        String(slip.receivingBank ?? "").slice(0, 10) || null,
        slipPartyName(slip.sender),
        slipPartyName(slip.receiver),
        testMode,
      ],
    );

    await connection.commit();
    return res.status(201).json({
      message: testMode ? "ชำระเงินในโหมดทดลองเรียบร้อย (ไม่ได้ตรวจสลิปกับธนาคาร)" : "ตรวจสอบสลิปผ่านแล้ว ชำระเงินเรียบร้อย",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    let keepFile = false;
    if (attempt && req.file && error instanceof SlipVerificationError && error.status < 500) {
      keepFile = await recordSlipRejection(getPool(), attempt, req.file, error.message)
        .then(() => true)
        .catch((recordError) => {
          console.error("Record slip rejection error:", recordError);
          return false;
        });
    }
    if (!keepFile && req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (error instanceof SlipVerificationError) return res.status(error.status).json({ message: error.message });
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: SLIP_USED_MESSAGE });
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

    const savedPhotos = await savePublicImages("maintenance", photos.value);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO MaintenanceRequest (customer_id, room_number, description, category, contact_phone, preferred_time)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customer.id, customer.room_number, description, category, contactPhone, preferredTime],
      );
      await connection.query(`INSERT INTO MaintenancePhoto (maintenance_request_id, name, url) VALUES ?`, [
        savedPhotos.map((photo) => [result.insertId, photo.name, photo.url]),
      ]);
      await connection.commit();
      return res.status(201).json({ message: "แจ้งซ่อมสำเร็จ ทางผู้ดูแลจะดำเนินการโดยเร็วที่สุด", maintenanceId: result.insertId });
    } catch (error) {
      await connection.rollback();
      await deletePublicImages(savedPhotos.map((photo) => photo.url)).catch(() => {});
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
      return res.status(409).json({ code: "TENANT_REQUEST_ACTIVE", message: "คุณมีคำขอประเภทนี้ที่รอดำเนินการอยู่แล้ว" });
    }

    if (type === "renew") {
      const outstanding = await loadCustomerOutstanding(connection, customer.id);
      if (outstanding.amount > 0) {
        await connection.rollback();
        return res.status(409).json({
          code: "RENEW_OUTSTANDING",
          message: RENEW_OUTSTANDING_MESSAGE(outstanding.amount),
          outstanding,
        });
      }
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
    await expireParkedVehicles(pool);
    const [expired] = await pool.query(
      `SELECT id, vehicle_plate, vehicle_model, guest_name, start_at, end_at, cancelled_at
       FROM ResidentVisitRequest
       WHERE customer_id = ? AND request_type = 'vehicle' AND status = 'cancelled' AND cancelled_by_name = ?
         AND cancelled_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND created_at ${AFTER_HISTORY_RESET}
       ORDER BY cancelled_at DESC`,
      [req.user.id, PARKING_EXPIRED_BY, req.user.id],
    );
    const [customers] = await pool.query("SELECT room_number FROM Customer WHERE id = ?", [req.user.id]);
    const roomNumber = customers[0]?.room_number;
    if (!roomNumber) return res.json({ roomNumber: null, vehicles: [], expired });
    const [vehicles] = await pool.query(
      `SELECT id, room_number, vehicle_plate, vehicle_model, vehicle_photos, guest_name, guest_phone, start_at, end_at, note,
              status, reviewed_by_name, reviewed_at, admin_reviewed_by_name, admin_reviewed_at, updated_by_name, updated_at, created_at
       FROM ResidentVisitRequest
       WHERE customer_id = ? AND room_number = ? AND request_type = 'vehicle' AND status = 'approved'
         AND (end_at IS NULL OR end_at > NOW())
       ORDER BY (start_at <= NOW()) DESC, start_at ASC`,
      [req.user.id, roomNumber],
    );
    return res.json({ roomNumber, vehicles: withVehiclePhotos(vehicles), expired });
  } catch (error) {
    console.error("Fetch parked vehicles error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดข้อมูลรถได้" });
  }
});

router.get("/resident-visit-requests", async (req, res) => {
  try {
    await expireParkedVehicles(getPool());
    const [requests] = await getPool().query(
      `SELECT id, room_number, request_type, vehicle_plate, vehicle_model, vehicle_photos, guest_name, guest_phone,
              start_at, end_at, note, status, reviewed_by_name, reviewed_at, admin_reviewed_by_name, admin_reviewed_at,
              updated_by_name, updated_at, cancelled_by_name, cancelled_at, created_at
       FROM ResidentVisitRequest WHERE customer_id = ? AND created_at ${AFTER_HISTORY_RESET} ORDER BY created_at DESC`,
      [req.user.id, req.user.id],
    );
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
    const [[{ openCount }]] = await pool.query(
      "SELECT COUNT(*) AS openCount FROM ResidentVisitRequest WHERE customer_id = ? AND status = 'pending'",
      [req.user.id],
    );
    if (openCount >= CUSTOMER_OPEN_REPORT_LIMIT) {
      return res.status(409).json({ message: `มีคำขอที่รออนุมัติครบ ${CUSTOMER_OPEN_REPORT_LIMIT} รายการแล้ว กรุณารอเจ้าหน้าที่พิจารณาก่อนส่งเพิ่ม` });
    }
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
      `SELECT id, room_number, incident_type, severity, description, photos, status, reviewed_by_name, reviewed_at, review_note,
              cancelled_by_name, cancelled_at, cancel_reason, created_at
       FROM SafetyIncident WHERE reporter_role = 'Customer' AND reporter_id = ? AND created_at ${AFTER_HISTORY_RESET}
       ORDER BY created_at DESC`,
      [req.user.id, req.user.id],
    );
    return res.json({ incidents: withIncidentPhotos(incidents) });
  } catch (error) {
    console.error("Fetch own safety incidents error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดประวัติการแจ้งเหตุได้" });
  }
});

router.post("/safety-incidents", createSafetyIncident);

export default router;
