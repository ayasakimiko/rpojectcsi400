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

export async function endCustomerContracts(connection, customerId) {
  const [customers] = await connection.query(`SELECT deposit_amount FROM Customer WHERE id = ?`, [customerId]);
  await connection.query(
    `UPDATE Booking SET ended_at = NOW(), deposit_amount = COALESCE(deposit_amount, ?)
     WHERE customer_id = ? AND ended_at IS NULL`,
    [customers[0]?.deposit_amount ?? null, customerId],
  );
}

export async function closeCustomerTenancy(connection, customerId) {
  await endCustomerContracts(connection, customerId);
  await connection.query(`UPDATE Parcel SET status = 'cancelled' WHERE customer_id = ? AND status = 'pending'`, [customerId]);
}

export async function resetCustomerHistory(connection, customerId) {
  await closeCustomerTenancy(connection, customerId);
  await connection.query(
    `UPDATE Customer SET history_reset_at = NOW() WHERE id = ?`,
    [customerId],
  );
}

export function contractImageName(file, index) {
  const decoded = Buffer.from(String(file.originalname ?? ""), "latin1").toString("utf8").trim();
  return (decoded || `สัญญาเช่า ${index + 1}`).slice(0, 255);
}

const dayKey = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
};

function effectiveEndDate(contract) {
  const ends = [contract.current_end_date, contract.latest_end_date, contract.rental_end_date]
    .map((value) => (value ? new Date(value) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()));
  return ends.length ? new Date(Math.max(...ends.map((date) => date.getTime()))) : null;
}

function movedOutEarly(contract, now) {
  const movedOut = dayKey(contract.moved_out_at ?? now);
  const endDate = effectiveEndDate(contract);
  const end = endDate ? dayKey(endDate) : null;
  return movedOut !== null && end !== null && movedOut < end;
}

function depositRefund(status, depositPaidCents, settlement) {
  if (settlement === "refunded") return "refund";
  if (settlement === "forfeited") return "forfeit";
  if (depositPaidCents <= 0) return null;
  if (status === "ended_early") return "forfeit";
  if (status === "ended" || status === "expired") return "refund";
  return null;
}

function isArchivedContract(contract) {
  return Boolean(contract.ended_at || contract.next_contract_id || contract.is_suspended || contract.room_number_current == null);
}

function contractStatus(contract, now, firstPayment) {
  if (isArchivedContract(contract)) return movedOutEarly(contract, now) ? "ended_early" : "ended";
  const start = contract.rental_start_date ? new Date(contract.rental_start_date) : null;
  const end = effectiveEndDate(contract);
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

function withDepositBreakdown(sourceRow, now, rentPaidCents, deposit = { paidCents: 0, pending: false }, rentPending = false) {
  const archived = isArchivedContract(sourceRow);
  const row = archived ? { ...sourceRow, current_end_date: null } : sourceRow;
  const priceCents = Math.max(0, Math.round(Number(row.monthly_price) * 100) || 0);
  const depositRaw = row.deposit_amount == null ? null : Number(row.deposit_amount);
  const depositCents = Math.max(0, Math.round((depositRaw || 0) * 100));
  const endDate = effectiveEndDate(row);
  const totalPeriods = countBillingPeriods(row.rental_start_date, endDate);
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
  delete contract.latest_end_date;
  delete contract.prev_contract_id;
  return {
    ...contract,
    current_room_number: archived ? null : room_number_current,
    is_archived: archived,
    has_newer_contract: Boolean(contract.next_contract_id),
    effective_end_date: endDate,
    contract_duration_months: contract.contract_duration_months == null ? null : Number(contract.contract_duration_months),
    monthly_price: priceCents / 100,
    deposit_amount: depositRaw,
    deposit_months: priceCents > 0 ? Math.round((depositCents / priceCents) * 100) / 100 : 0,
    first_month_amount: priceCents / 100,
    first_month_total: (priceCents + depositCents) / 100,
    deposit_paid: depositPaidCents / 100,
    deposit_refund: depositRefund(status, depositPaidCents, contract.deposit_settlement),
    deposit_deduction: contract.deposit_deduction == null ? null : Number(contract.deposit_deduction),
    deposit_refunded_amount: contract.deposit_refunded_amount == null ? null : Number(contract.deposit_refunded_amount),
    can_settle_deposit: archived && depositPaidCents > 0 && !contract.deposit_settlement,
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
  COALESCE(b.deposit_amount, c.deposit_amount) AS deposit_amount, b.contract_completed_at, b.created_at, b.ended_at,
  b.deposit_settlement, b.deposit_deduction, b.deposit_refunded_amount, b.deposit_settlement_note,
  b.deposit_settled_at, b.deposit_settled_by_name,
  (SELECT moi.damage_note FROM MoveOutInspection moi
    JOIN TenantRequest itr ON itr.id = moi.tenant_request_id
    WHERE itr.customer_id = b.customer_id AND itr.type = 'moveout' AND itr.status = 'approved'
      AND itr.completed_at >= b.created_at AND moi.hidden_at IS NULL
    ORDER BY moi.id DESC LIMIT 1) AS moveout_damage_note,
  (SELECT MIN(nb.id) FROM Booking nb
    WHERE nb.customer_id = b.customer_id AND nb.contract_completed_at IS NOT NULL AND nb.id > b.id) AS next_contract_id,
  (SELECT MAX(pb.id) FROM Booking pb
    WHERE pb.customer_id = b.customer_id AND pb.contract_completed_at IS NOT NULL AND pb.id < b.id) AS prev_contract_id,
  COALESCE((SELECT MAX(tr.completed_at) FROM TenantRequest tr
    WHERE tr.customer_id = b.customer_id AND tr.type = 'moveout' AND tr.status = 'approved' AND tr.completed_at >= b.created_at
      AND NOT EXISTS (SELECT 1 FROM Booking nb3
        WHERE nb3.customer_id = b.customer_id AND nb3.contract_completed_at IS NOT NULL AND nb3.id > b.id AND nb3.created_at <= tr.completed_at)
  ), b.ended_at) AS moved_out_at,
  (SELECT MAX(b2.rental_end_date) FROM Booking b2
    WHERE b2.customer_id = b.customer_id AND b2.id >= b.id
      AND NOT EXISTS (SELECT 1 FROM Booking nb2
        WHERE nb2.customer_id = b.customer_id AND nb2.contract_completed_at IS NOT NULL AND nb2.id > b.id AND nb2.id <= b2.id)) AS latest_end_date`;

const inContractBookings = (contract, bookingId) =>
  (contract.prev_contract_id == null || bookingId >= contract.booking_id) &&
  (contract.next_contract_id == null || bookingId < contract.next_contract_id);

const CONTRACT_JOINS = `
  FROM Booking b
  JOIN Customer c ON c.id = b.customer_id
  LEFT JOIN Room r ON r.id = b.room_id
  LEFT JOIN Room cr ON cr.room_number = c.room_number`;

async function attachContractImages(pool, contracts, now) {
  if (contracts.length === 0) return [];
  const bookingIds = contracts.map((contract) => contract.booking_id);
  const customerIds = [...new Set(contracts.map((contract) => contract.customer_id))];
  const [[images], [paymentRows]] = await Promise.all([
    pool.query(`SELECT booking_id, name, url FROM ContractImage WHERE booking_id IN (?) ORDER BY id ASC`, [bookingIds]),
    pool.query(
      `SELECT pb.customer_id, p.booking_id, p.amount, p.status, p.type = 'deposit' AS is_deposit FROM Payment p
       JOIN Booking pb ON pb.id = p.booking_id
       WHERE pb.customer_id IN (?) AND p.status IN ('paid', 'pending')
         AND (p.type IS NULL OR p.type NOT IN ('water', 'electricity'))`,
      [customerIds],
    ),
  ]);
  const paymentsByCustomer = new Map();
  for (const payment of paymentRows) {
    paymentsByCustomer.set(payment.customer_id, [...(paymentsByCustomer.get(payment.customer_id) ?? []), payment]);
  }
  const imagesByBooking = new Map();
  for (const { booking_id, name, url } of images) {
    imagesByBooking.set(booking_id, [...(imagesByBooking.get(booking_id) ?? []), { name, url }]);
  }
  return contracts.map((row) => {
    const deposit = { paidCents: 0, pending: false };
    let rentPaidCents = 0;
    let rentPending = false;
    for (const { booking_id, amount, status, is_deposit } of paymentsByCustomer.get(row.customer_id) ?? []) {
      if (!inContractBookings(row, booking_id)) continue;
      const cents = Math.round(Number(amount) * 100);
      if (is_deposit) {
        if (status === "paid" && Number.isSafeInteger(cents)) deposit.paidCents += cents;
        if (status === "pending" && cents > 0) deposit.pending = true;
      } else if (status === "pending") {
        if (cents > 0) rentPending = true;
      } else if (Number.isSafeInteger(cents)) {
        rentPaidCents += cents;
      }
    }
    const contract = withDepositBreakdown(row, now, rentPaidCents, deposit, rentPending);
    const contractImages = imagesByBooking.get(row.booking_id) ?? [];
    return { ...contract, duration_selected: Boolean(row.duration_selected), images: contractImages, image_count: contractImages.length };
  });
}

export async function loadCustomerContracts(pool, customerIds, { currentOnly = false } = {}) {
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
         ${currentOnly ? "AND (c.is_suspended = TRUE OR b.created_at > COALESCE(c.history_reset_at, '1000-01-01'))" : ""}
     ) ranked
     WHERE contract_rank = 1`,
    [ids],
  );
  rows.forEach((row) => delete row.contract_rank);
  const contracts = await attachContractImages(pool, rows, new Date());
  return new Map(contracts.map((contract) => [contract.customer_id, contract]));
}

export async function loadContractByBooking(pool, bookingId) {
  const [rows] = await pool.query(
    `SELECT ${CONTRACT_COLUMNS}
     ${CONTRACT_JOINS}
     WHERE b.id = ? AND b.contract_completed_at IS NOT NULL`,
    [bookingId],
  );
  return (await attachContractImages(pool, rows, new Date()))[0] ?? null;
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
