import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { PUBLIC_UPLOAD_DIR, deletePublicImages } from "../middleware/publicUploads.js";
import { IMAGE_TYPES, isRealImage } from "./ParcelRouter.js";

export const CONTRACT_IMAGE_FOLDER = "contracts";
export const CONTRACT_MIN_IMAGES = 3;
export const CONTRACT_MAX_IMAGES = 10;
const CONTRACT_UPLOAD_DIR = path.join(PUBLIC_UPLOAD_DIR, CONTRACT_IMAGE_FOLDER);

fs.mkdirSync(CONTRACT_UPLOAD_DIR, { recursive: true });

const contractUpload = multer({
  storage: multer.diskStorage({
    destination: CONTRACT_UPLOAD_DIR,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype].ext}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: CONTRACT_MAX_IMAGES, fields: 30, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (Object.hasOwn(IMAGE_TYPES, file.mimetype)) return callback(null, true);
    return callback(Object.assign(new Error("แนบรูปสัญญาได้เฉพาะไฟล์ JPG, JPEG, PNG หรือ WebP"), { status: 400 }));
  },
}).array("contract_images", CONTRACT_MAX_IMAGES);

const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: "รูปสัญญาต้องมีขนาดไม่เกิน 5 MB ต่อรูป",
  LIMIT_FILE_COUNT: `แนบรูปสัญญาได้ไม่เกิน ${CONTRACT_MAX_IMAGES} รูป`,
  LIMIT_UNEXPECTED_FILE: `แนบรูปสัญญาได้ไม่เกิน ${CONTRACT_MAX_IMAGES} รูป`,
};

export const contractImageUrl = (file) => `/uploads/${CONTRACT_IMAGE_FOLDER}/${file.filename}`;

export async function removeContractFiles(files) {
  try {
    await deletePublicImages((files ?? []).map(contractImageUrl));
  } catch (error) {
    console.error("Remove contract images error:", error);
  }
}

export function parseContractImages(req, res, next) {
  contractUpload(req, res, async (error) => {
    if (error) {
      await removeContractFiles(req.files);
      return res.status(400).json({ message: error.status ? error.message : UPLOAD_ERRORS[error.code] ?? "อัปโหลดรูปสัญญาไม่สำเร็จ" });
    }
    const files = req.files ?? [];
    try {
      if (files.length < CONTRACT_MIN_IMAGES) {
        await removeContractFiles(files);
        return res.status(400).json({ message: `กรุณาแนบรูปสัญญาเช่าอย่างน้อย ${CONTRACT_MIN_IMAGES} รูป` });
      }
      for (const file of files) {
        if (!(await isRealImage(file))) {
          await removeContractFiles(files);
          return res.status(400).json({ message: "ไฟล์รูปสัญญาไม่ถูกต้อง กรุณาเลือกไฟล์รูปภาพจริง" });
        }
      }
      return next();
    } catch (checkError) {
      await removeContractFiles(files);
      console.error("Check contract images error:", checkError);
      return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
    }
  });
}

export function contractImageName(file, index) {
  const decoded = Buffer.from(String(file.originalname ?? ""), "latin1").toString("utf8").trim();
  return (decoded || `สัญญาเช่า ${index + 1}`).slice(0, 255);
}

const dayKey = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
};

function movedOutEarly(contract, now) {
  const movedOut = dayKey(contract.moved_out_at ?? now);
  const end = contract.rental_end_date ? dayKey(contract.rental_end_date) : null;
  return movedOut !== null && end !== null && movedOut < end;
}

function depositRefund(status, depositPaidCents) {
  if (depositPaidCents <= 0) return null;
  if (status === "ended_early") return "forfeit";
  if (status === "ended" || status === "expired") return "refund";
  return null;
}

function contractStatus(contract, now, firstPayment) {
  if (contract.is_suspended || contract.room_number_current == null) return movedOutEarly(contract, now) ? "ended_early" : "ended";
  const start = contract.rental_start_date ? new Date(contract.rental_start_date) : null;
  const endValue = contract.current_end_date ?? contract.rental_end_date;
  const end = endValue ? new Date(endValue) : null;
  if (end && end < now) return "expired";
  if (firstPayment === "pending") return "payment_review";
  if (firstPayment === "due") return "awaiting_payment";
  if (start && start > now) return "upcoming";
  return "active";
}

function countBillingPeriods(startValue, endValue) {
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  let count = 0;
  for (let offset = 0; offset < 600; offset += 1) {
    const period = new Date(start.getFullYear(), start.getMonth() + offset, 1, start.getHours(), start.getMinutes(), start.getSeconds());
    const lastDay = new Date(period.getFullYear(), period.getMonth() + 1, 0).getDate();
    period.setDate(Math.min(start.getDate(), lastDay));
    if (period >= end) break;
    count += 1;
  }
  return count;
}

function depositStatus(depositCents, deposit) {
  if (depositCents <= 0) return "none";
  if (deposit.paidCents >= depositCents) return "paid";
  return deposit.pending ? "pending" : "due";
}

function withDepositBreakdown(row, now, rentPaidCents, deposit = { paidCents: 0, pending: false }, rentPending = false) {
  const priceCents = Math.max(0, Math.round(Number(row.monthly_price) * 100) || 0);
  const depositRaw = row.deposit_amount == null ? null : Number(row.deposit_amount);
  const depositCents = Math.max(0, Math.round((depositRaw || 0) * 100));
  const totalPeriods = countBillingPeriods(row.rental_start_date, row.rental_end_date);
  const contractTotalCents = priceCents * totalPeriods;
  const paidCents = Math.max(0, rentPaidCents || 0);
  const depositState = depositStatus(depositCents, deposit);
  const firstRentPaid = priceCents === 0 || paidCents >= priceCents;
  const firstPayment = firstRentPaid && ["none", "paid"].includes(depositState)
    ? "paid"
    : rentPending || depositState === "pending" ? "pending" : "due";
  const status = contractStatus(row, now, firstPayment);
  const depositPaidCents = Math.min(depositCents, deposit.paidCents);
  const { room_number_current, ...contract } = row;
  return {
    ...contract,
    current_room_number: room_number_current,
    contract_duration_months: contract.contract_duration_months == null ? null : Number(contract.contract_duration_months),
    monthly_price: priceCents / 100,
    deposit_amount: depositRaw,
    deposit_months: priceCents > 0 ? Math.round((depositCents / priceCents) * 100) / 100 : 0,
    first_month_amount: priceCents / 100,
    first_month_total: (priceCents + depositCents) / 100,
    deposit_paid: depositPaidCents / 100,
    deposit_refund: depositRefund(status, depositPaidCents),
    deposit_status: depositState,
    first_payment_status: firstPayment,
    billing_periods: totalPeriods,
    contract_total: contractTotalCents / 100,
    rent_paid: paidCents / 100,
    contract_remaining: Math.max(0, contractTotalCents - paidCents) / 100,
    status,
  };
}

const CONTRACT_COLUMNS = `
  b.id AS booking_id, b.customer_id, c.first_name, c.last_name, c.phone, c.is_suspended,
  r.room_number, c.room_number AS room_number_current, r.price AS monthly_price,
  b.rental_start_date, b.rental_end_date, cr.rental_end_date AS current_end_date,
  COALESCE(b.contract_duration_months, TIMESTAMPDIFF(MONTH, b.rental_start_date, b.rental_end_date)) AS contract_duration_months,
  b.contract_duration_months IS NOT NULL AS duration_selected,
  c.deposit_amount, b.contract_completed_at, b.created_at,
  (SELECT MAX(tr.completed_at) FROM TenantRequest tr
    WHERE tr.customer_id = b.customer_id AND tr.type = 'moveout' AND tr.status = 'approved') AS moved_out_at`;

const CONTRACT_JOINS = `
  FROM Booking b
  JOIN Customer c ON c.id = b.customer_id
  LEFT JOIN Room r ON r.id = b.room_id
  LEFT JOIN Room cr ON cr.room_number = c.room_number`;

async function attachContractImages(pool, contracts, now) {
  if (contracts.length === 0) return [];
  const bookingIds = contracts.map((contract) => contract.booking_id);
  const [[images], [paidRows], [depositRows]] = await Promise.all([
    pool.query(`SELECT booking_id, name, url FROM ContractImage WHERE booking_id IN (?) ORDER BY id ASC`, [bookingIds]),
    pool.query(
      `SELECT booking_id, amount, status FROM Payment
       WHERE booking_id IN (?) AND status IN ('paid', 'pending') AND (type IS NULL OR type NOT IN ('deposit', 'water', 'electricity'))`,
      [bookingIds],
    ),
    pool.query(
      `SELECT booking_id, amount, status FROM Payment
       WHERE booking_id IN (?) AND type = 'deposit' AND status IN ('paid', 'pending')`,
      [bookingIds],
    ),
  ]);
  const depositByBooking = new Map();
  for (const { booking_id, amount, status } of depositRows) {
    const entry = depositByBooking.get(booking_id) ?? { paidCents: 0, pending: false };
    const cents = Math.round(Number(amount) * 100);
    if (status === "paid" && Number.isSafeInteger(cents)) entry.paidCents += cents;
    if (status === "pending" && cents > 0) entry.pending = true;
    depositByBooking.set(booking_id, entry);
  }
  const imagesByBooking = new Map();
  for (const { booking_id, name, url } of images) {
    imagesByBooking.set(booking_id, [...(imagesByBooking.get(booking_id) ?? []), { name, url }]);
  }
  const paidByBooking = new Map();
  const rentPendingBookings = new Set();
  for (const { booking_id, amount, status } of paidRows) {
    const cents = Math.round(Number(amount) * 100);
    if (status === "pending") {
      if (cents > 0) rentPendingBookings.add(booking_id);
      continue;
    }
    if (Number.isSafeInteger(cents)) paidByBooking.set(booking_id, (paidByBooking.get(booking_id) ?? 0) + cents);
  }
  return contracts.map((row) => {
    const contract = withDepositBreakdown(
      row,
      now,
      paidByBooking.get(row.booking_id) ?? 0,
      depositByBooking.get(row.booking_id),
      rentPendingBookings.has(row.booking_id),
    );
    const contractImages = imagesByBooking.get(row.booking_id) ?? [];
    return { ...contract, duration_selected: Boolean(row.duration_selected), images: contractImages, image_count: contractImages.length };
  });
}

export async function loadCustomerContracts(pool, customerIds) {
  const ids = [...new Set(customerIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (ids.length === 0) return new Map();
  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT ${CONTRACT_COLUMNS},
              ROW_NUMBER() OVER (
                PARTITION BY b.customer_id
                ORDER BY b.contract_completed_at IS NULL, b.created_at DESC, b.id DESC
              ) AS contract_rank
       ${CONTRACT_JOINS}
       WHERE b.customer_id IN (?)
     ) ranked
     WHERE contract_rank = 1`,
    [ids],
  );
  rows.forEach((row) => delete row.contract_rank);
  const contracts = await attachContractImages(pool, rows, new Date());
  return new Map(contracts.map((contract) => [contract.customer_id, contract]));
}

export async function loadCompletedContracts(pool) {
  const [rows] = await pool.query(
    `SELECT ${CONTRACT_COLUMNS}
     ${CONTRACT_JOINS}
     WHERE b.contract_completed_at IS NOT NULL
     ORDER BY b.contract_completed_at DESC, b.id DESC
     LIMIT 1000`,
  );
  return attachContractImages(pool, rows, new Date());
}
