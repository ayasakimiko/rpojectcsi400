import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { PUBLIC_UPLOAD_DIR, deletePublicImages } from "../middleware/publicUploads.js";
import { IMAGE_TYPES, isRealImage } from "./ParcelRouter.js";
import { CONTRACT_MIN_IMAGES, ROOM_TRANSFER_MIN_CONTRACT_IMAGES } from "../middleware/validation.js";
import {
  computeRentCoverage,
  loadDepositPayments,
  loadMoveOutBalance,
  loadTransferDepositLedger,
  paidDepositCents,
  ROOM_TRANSFER_PAYMENT_TYPE,
} from "./CustomerDashboardRouter.js";
import {
  computeProratedRent,
  computeRoomTransferSettlement,
  depositBalanceAfterTransfers,
  settlementView,
  signedCents,
  toCents,
  transferDepositDeductedCents,
  transferFinanceView,
  transferRentPaidCents,
} from "./roomTransferFinance.js";

export const CONTRACT_IMAGE_FOLDER = "contracts";
export { CONTRACT_MIN_IMAGES, ROOM_TRANSFER_MIN_CONTRACT_IMAGES };
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

export const contractImagesParser = ({ min }) => (req, res, next) => {
  contractUpload(req, res, async (error) => {
    if (error) {
      await removeContractFiles(req.files);
      return res.status(400).json({ message: error.status ? error.message : UPLOAD_ERRORS[error.code] ?? "อัปโหลดรูปสัญญาไม่สำเร็จ" });
    }
    const files = req.files ?? [];
    try {
      if (files.length < min) {
        await removeContractFiles(files);
        return res.status(400).json({ message: `กรุณาแนบรูปสัญญาเช่าอย่างน้อย ${min} รูป` });
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
};

export const parseContractImages = contractImagesParser({ min: CONTRACT_MIN_IMAGES });
export const parseOptionalContractImages = contractImagesParser({ min: 0 });

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

function billingPeriodStarts(startValue, endValue) {
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
  const starts = [];
  for (let offset = 0; offset < 600; offset += 1) {
    const period = new Date(start.getFullYear(), start.getMonth() + offset, 1, start.getHours(), start.getMinutes(), start.getSeconds());
    const lastDay = new Date(period.getFullYear(), period.getMonth() + 1, 0).getDate();
    period.setDate(Math.min(start.getDate(), lastDay));
    if (period >= end) break;
    starts.push(period);
  }
  return starts;
}

function contractRentTotalCents(periodStarts, basePriceCents, transfers) {
  let total = 0;
  for (const periodStart of periodStarts) {
    let priceCents = basePriceCents;
    for (const transfer of transfers) {
      const from = transfer.new_price_from ? new Date(transfer.new_price_from) : null;
      if (!from || periodStart >= from) priceCents = toCents(transfer.to_price);
    }
    total += priceCents;
  }
  return Math.max(0, total + transfers.reduce((sum, transfer) => sum + signedCents(transfer.price_difference_total), 0));
}

function contractRentBreakdown(periodStarts, basePriceCents, baseRoom, transfers, endDate) {
  const periods = periodStarts.map((start) => ({ start, priceCents: basePriceCents, room: baseRoom }));
  const leftovers = [];
  for (const transfer of transfers) {
    const from = transfer.new_price_from ? new Date(transfer.new_price_from) : null;
    for (const period of periods) {
      if (!from || period.start >= from) {
        period.priceCents = toCents(transfer.to_price);
        period.room = transfer.to_room_number;
      }
    }
    const diffCents = signedCents(transfer.price_difference_total);
    const chargeable = Number(transfer.chargeable_periods) || 0;
    const covered = from && chargeable > 0 ? periods.filter((period) => period.start < from).slice(-chargeable) : [];
    if (diffCents !== 0 && covered.length > 0) {
      const each = Math.floor(diffCents / covered.length);
      covered.forEach((period, index) => {
        period.priceCents += each + (index === 0 ? diffCents - each * covered.length : 0);
        period.room = transfer.to_room_number;
      });
    } else if (diffCents !== 0) {
      leftovers.push({ kind: "difference", from_room_number: transfer.from_room_number, room_number: transfer.to_room_number, price_cents: diffCents });
    }
  }
  const lines = [];
  periods.forEach((period, index) => {
    const last = lines.at(-1);
    if (last && last.room_number === period.room && last.price_cents === period.priceCents) {
      last.periods += 1;
      last.to_month = index + 1;
    } else {
      lines.push({ kind: "rent", room_number: period.room, price_cents: period.priceCents, periods: 1, from_month: index + 1, to_month: index + 1 });
    }
  });
  return [...lines, ...leftovers].map(({ price_cents, ...line }) => ({
    ...line,
    ...(line.kind === "rent"
      ? { from_date: periodStarts[line.from_month - 1], to_date: periodStarts[line.to_month] ?? endDate ?? null }
      : {}),
    price: price_cents / 100,
    amount: (line.kind === "rent" ? price_cents * line.periods : price_cents) / 100,
  }));
}

function transferSummary(transfer) {
  return {
    id: transfer.id,
    from_room_number: transfer.from_room_number,
    to_room_number: transfer.to_room_number,
    from_price: Number(transfer.from_price),
    to_price: Number(transfer.to_price),
    chargeable_periods: Number(transfer.chargeable_periods),
    price_difference_total: Number(transfer.price_difference_total),
    deposit_before: Number(transfer.deposit_before),
    deposit_deducted: Number(transfer.deposit_deducted),
    damage_deduction: Number(transfer.damage_deduction) || 0,
    deposit_after: transfer.deposit_after == null
      ? Math.max(0, Number(transfer.deposit_before) - Number(transfer.deposit_deducted))
      : Number(transfer.deposit_after),
    amount_charged: Number(transfer.amount_charged),
    charge_status: Number(transfer.amount_charged) > 0 ? transfer.charge_status ?? "pending" : null,
    finance: transferFinanceView(transfer),
    new_price_from: transfer.new_price_from,
    approved_by_name: transfer.approved_by_name,
    transferred_at: transfer.transferred_at,
    previous_images: transfer.previous_images ?? [],
    new_images: transfer.new_images ?? [],
  };
}

function depositStatus(depositCents, deposit) {
  if (depositCents <= 0) return "none";
  if (deposit.paidCents >= depositCents) return "paid";
  return deposit.pending ? "pending" : "due";
}

function withDepositBreakdown(sourceRow, now, rentPaidCents, deposit = { paidCents: 0, pending: false }, rentPending = false, transfers = []) {
  const archived = isArchivedContract(sourceRow);
  const row = archived ? { ...sourceRow, current_end_date: null } : sourceRow;
  const lastTransfer = transfers.at(-1);
  const priceCents = transfers.length ? toCents(transfers[0].from_price) : toCents(row.monthly_price);
  const currentPriceCents = lastTransfer ? toCents(lastTransfer.to_price) : priceCents;
  const depositRaw = row.deposit_amount == null ? null : Number(row.deposit_amount);
  const depositCents = Math.max(0, Math.round((depositRaw || 0) * 100));
  const endDate = effectiveEndDate(row);
  const periodStarts = billingPeriodStarts(row.rental_start_date, endDate);
  const totalPeriods = periodStarts.length;
  const contractTotalCents = contractRentTotalCents(periodStarts, priceCents, transfers);
  const transferDeductedCents = transferDepositDeductedCents(transfers);
  const transferPaidCents = transfers.reduce((sum, transfer) => sum + transferRentPaidCents(transfer), 0);
  const paidCents = Math.max(0, Math.max(0, rentPaidCents || 0) + transferPaidCents);
  const depositState = depositStatus(depositCents, deposit);
  const firstRentPaid = priceCents === 0 || Math.max(0, rentPaidCents || 0) >= priceCents || paidCents >= priceCents;
  const firstPayment = firstRentPaid && ["none", "paid"].includes(depositState)
    ? "paid"
    : rentPending || depositState === "pending" ? "pending" : "due";
  const status = contractStatus(row, now, firstPayment);
  const depositPaidCents = Math.min(depositCents, deposit.paidCents);
  const depositRemainingCents = depositBalanceAfterTransfers(depositPaidCents, transfers);
  const { room_number_current, ...contract } = row;
  delete contract.latest_end_date;
  delete contract.prev_contract_id;
  return {
    ...contract,
    room_number: lastTransfer ? lastTransfer.to_room_number : contract.room_number,
    original_room_number: contract.room_number,
    current_room_number: archived ? null : room_number_current,
    is_archived: archived,
    has_newer_contract: Boolean(contract.next_contract_id),
    effective_end_date: endDate,
    contract_duration_months: contract.contract_duration_months == null ? null : Number(contract.contract_duration_months),
    monthly_price: currentPriceCents / 100,
    original_monthly_price: priceCents / 100,
    room_transfers: transfers.map(transferSummary),
    deposit_amount: depositRaw,
    deposit_months: priceCents > 0 ? Math.round((depositCents / priceCents) * 100) / 100 : 0,
    first_month_amount: priceCents / 100,
    first_month_total: (priceCents + depositCents) / 100,
    deposit_paid: depositPaidCents / 100,
    deposit_transfer_deducted: transferDeductedCents / 100,
    deposit_transfer_adjusted: depositRemainingCents !== depositPaidCents || transferDeductedCents > 0,
    deposit_remaining: depositRemainingCents / 100,
    deposit_refund: depositRefund(status, depositRemainingCents, contract.deposit_settlement),
    deposit_deduction: contract.deposit_deduction == null ? null : Number(contract.deposit_deduction),
    deposit_refunded_amount: contract.deposit_refunded_amount == null ? null : Number(contract.deposit_refunded_amount),
    can_settle_deposit: archived && depositRemainingCents > 0 && !contract.deposit_settlement,
    deposit_status: depositState,
    first_payment_status: firstPayment,
    billing_periods: totalPeriods,
    contract_total: contractTotalCents / 100,
    rent_breakdown: contractRentBreakdown(periodStarts, priceCents, contract.room_number, transfers, endDate),
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
  (SELECT moi2.damage_cost FROM MoveOutInspection moi2
    JOIN TenantRequest itr2 ON itr2.id = moi2.tenant_request_id
    WHERE itr2.customer_id = b.customer_id AND itr2.type = 'moveout' AND itr2.status = 'approved'
      AND itr2.completed_at >= b.created_at AND moi2.hidden_at IS NULL
    ORDER BY moi2.id DESC LIMIT 1) AS moveout_damage_cost,
  (SELECT MIN(nb.id) FROM Booking nb
    WHERE nb.customer_id = b.customer_id AND nb.contract_completed_at IS NOT NULL AND nb.id > b.id) AS next_contract_id,
  (SELECT MAX(pb.id) FROM Booking pb
    WHERE pb.customer_id = b.customer_id AND pb.contract_completed_at IS NOT NULL AND pb.id < b.id) AS prev_contract_id,
  (SELECT MIN(nb4.created_at) FROM Booking nb4
    WHERE nb4.customer_id = b.customer_id AND nb4.contract_completed_at IS NOT NULL AND nb4.id > b.id) AS next_contract_at,
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
  const [[images], [paymentRows], [transferRows]] = await Promise.all([
    pool.query(
      `SELECT booking_id, name, url, replaced_at, replaced_by_transfer_id, room_transfer_id
       FROM ContractImage WHERE booking_id IN (?) ORDER BY id ASC`,
      [bookingIds],
    ),
    pool.query(
      `SELECT pb.customer_id, p.booking_id, p.amount, p.status, p.type = 'deposit' AS is_deposit FROM Payment p
       JOIN Booking pb ON pb.id = p.booking_id
       WHERE pb.customer_id IN (?) AND p.status IN ('paid', 'pending')
         AND (p.type IS NULL OR p.type NOT IN ('water', 'electricity', 'room_transfer'))`,
      [customerIds],
    ),
    pool.query(
      `SELECT rt.*, cp.status AS charge_status, rp.status AS rent_charge_status FROM RoomTransfer rt
       LEFT JOIN Payment cp ON cp.id = rt.charge_payment_id
       LEFT JOIN Payment rp ON rp.id = rt.rent_charge_payment_id
       WHERE rt.customer_id IN (?) ORDER BY rt.id ASC`,
      [customerIds],
    ),
  ]);
  const paymentsByCustomer = new Map();
  for (const payment of paymentRows) {
    paymentsByCustomer.set(payment.customer_id, [...(paymentsByCustomer.get(payment.customer_id) ?? []), payment]);
  }
  const transfersByCustomer = new Map();
  for (const transfer of transferRows) {
    transfersByCustomer.set(transfer.customer_id, [...(transfersByCustomer.get(transfer.customer_id) ?? []), transfer]);
  }
  const imagesByBooking = new Map();
  const replacedImagesByTransfer = new Map();
  const newImagesByTransfer = new Map();
  const pushTo = (map, key, value) => map.set(key, [...(map.get(key) ?? []), value]);
  for (const { booking_id, name, url, replaced_at, replaced_by_transfer_id, room_transfer_id } of images) {
    if (!replaced_at) pushTo(imagesByBooking, booking_id, { name, url });
    if (replaced_by_transfer_id) pushTo(replacedImagesByTransfer, replaced_by_transfer_id, { name, url });
    if (room_transfer_id) pushTo(newImagesByTransfer, room_transfer_id, { name, url });
  }
  for (const transfer of transferRows) {
    transfer.previous_images = replacedImagesByTransfer.get(transfer.id) ?? [];
    transfer.new_images = newImagesByTransfer.get(transfer.id) ?? [];
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
    const transfers = (transfersByCustomer.get(row.customer_id) ?? []).filter((transfer) => inContractBookings(row, transfer.from_booking_id));
    const contract = withDepositBreakdown(row, now, rentPaidCents, deposit, rentPending, transfers);
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
         ${currentOnly ? "AND (c.is_suspended = TRUE OR b.created_at >= COALESCE(c.history_reset_at, '1000-01-01'))" : ""}
     ) ranked
     WHERE contract_rank = 1`,
    [ids],
  );
  rows.forEach((row) => delete row.contract_rank);
  const contracts = await attachContractImages(pool, rows, new Date());
  return new Map(contracts.map((contract) => [contract.customer_id, contract]));
}

export async function loadUnsettledDeposit(db, customerId) {
  const contract = (await loadCustomerContracts(db, [customerId])).get(customerId);
  return contract?.can_settle_deposit
    ? { booking_id: contract.booking_id, room_number: contract.room_number, amount: Number(contract.deposit_remaining ?? contract.deposit_paid) || 0, action: contract.deposit_refund, contract }
    : null;
}

export const UNSETTLED_DEPOSIT_MESSAGE = (deposit) =>
  `ผู้เช่าคนนี้ยังมีเงินมัดจำ ฿${deposit.amount.toLocaleString("th-TH")} จากสัญญาห้อง ${deposit.room_number} ที่ยังไม่ได้บันทึก${
    deposit.action === "forfeit" ? "การริบ" : "การคืน"
  } กรุณาจัดการเงินมัดจำในเมนูสัญญาที่เสร็จสมบูรณ์ก่อนทำสัญญาใหม่`;

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

const ROOM_COLUMNS = `id, room_number, is_booked, price, room_size, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, custom_amenities,
  electricity_unit_price, water_price, rental_duration_months, rental_start_date, rental_end_date, prepaid_until,
  billing_start_date, pending_lump_sum_months, rent_credit, (rental_end_date IS NULL OR rental_end_date > NOW()) AS contract_active`;

const formatBaht = (cents) => `฿${(cents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

function parseDateOnly(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function roomSummary(room) {
  if (!room) return null;
  const summary = { ...room, is_booked: Boolean(room.is_booked), price: Number(room.price) };
  delete summary.id;
  delete summary.contract_active;
  delete summary.pending_lump_sum_months;
  return summary;
}

export async function buildRoomTransferPlan(db, requestId, { lock = false, now = new Date(), damageCents = null } = {}) {
  const forUpdate = lock ? " FOR UPDATE" : "";
  const [requestRows] = await db.query(
    `SELECT id, customer_id, room_number, target_room_number, type, status, note, move_reason,
            DATE_FORMAT(preferred_move_date, '%Y-%m-%d') AS preferred_move_date, created_at,
            transfer_charge_payment_id, transfer_charge_due_at, transfer_charge_periods,
            DATE_FORMAT(transfer_calc_date, '%Y-%m-%d') AS transfer_calc_date
     FROM TenantRequest WHERE id = ?${forUpdate}`,
    [requestId],
  );
  const request = requestRows[0];
  if (!request || request.type !== "move_room") return null;
  const [chargeRows] = request.transfer_charge_payment_id
    ? await db.query(`SELECT id, amount, status, slip_path FROM Payment WHERE id = ?${forUpdate}`, [request.transfer_charge_payment_id])
    : [[]];
  const chargePayment = chargeRows[0] ?? null;

  const blockers = [];
  const [existingTransfers] = await db.query(`SELECT id FROM RoomTransfer WHERE tenant_request_id = ?${forUpdate}`, [request.id]);
  if (existingTransfers.length > 0 || !["pending", "in_progress"].includes(request.status)) {
    blockers.push("คำขอนี้ถูกดำเนินการไปแล้ว");
  }
  if (!request.target_room_number || request.room_number === request.target_room_number) {
    blockers.push("ข้อมูลห้องที่ต้องการย้ายไม่ถูกต้อง");
  }

  const [customerRows] = await db.query(
    `SELECT id, first_name, last_name, phone, room_number, deposit_amount FROM Customer WHERE id = ?${forUpdate}`,
    [request.customer_id],
  );
  const customer = customerRows[0];
  if (!customer) {
    blockers.push("ไม่พบผู้เช่า");
    return { request, customer: null, blockers, stale: false };
  }
  const stale = customer.room_number !== request.room_number;

  const [inspectionRows] = await db.query(
    `SELECT id, damage_cost FROM MoveOutInspection WHERE tenant_request_id = ?${forUpdate}`,
    [request.id],
  );
  const inspection = inspectionRows[0] ?? null;
  if (!inspection) blockers.push("กรุณาตรวจห้องก่อนอนุมัติย้ายห้อง");

  const [rooms] = await db.query(
    `SELECT ${ROOM_COLUMNS} FROM Room WHERE room_number IN (?, ?) ORDER BY room_number${forUpdate}`,
    [request.room_number, request.target_room_number ?? request.room_number],
  );
  const sourceRoom = rooms.find((room) => room.room_number === request.room_number) ?? null;
  const targetRoom = rooms.find((room) => room.room_number === request.target_room_number) ?? null;
  if (!targetRoom) blockers.push("ไม่พบห้องปลายทาง");
  else if (targetRoom.is_booked) blockers.push(`ห้อง ${targetRoom.room_number} มีผู้เช่าแล้ว ไม่สามารถย้ายเข้าได้`);
  else if (await roomHeldForTransfer(db, targetRoom.room_number, { exceptRequestId: request.id })) {
    blockers.push(`ห้อง ${targetRoom.room_number} มีผู้เช่าคนอื่นจองไว้ระหว่างรอชำระส่วนต่าง`);
  }
  if (!sourceRoom || !sourceRoom.is_booked) blockers.push("ห้องต้นทางเปลี่ยนแปลงแล้ว กรุณาตรวจสอบสถานะห้อง");
  else if (!sourceRoom.contract_active) blockers.push("สัญญาเช่าหมดอายุแล้ว ไม่สามารถย้ายห้องได้");

  const [bookingRows] = await db.query(
    `SELECT id, room_id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1${forUpdate}`,
    [customer.id],
  );
  const booking = bookingRows[0] ?? null;
  if (!stale && (!booking || !sourceRoom || booking.room_id !== sourceRoom.id)) blockers.push("ไม่พบสัญญาเช่าปัจจุบันของผู้เช่า");

  const [payments] = booking
    ? await db.query(`SELECT id, amount, status, type, payment_date FROM Payment WHERE booking_id = ?${forUpdate}`, [booking.id])
    : [[]];
  const coverage = sourceRoom ? computeRentCoverage(sourceRoom, payments, now) : null;

  const balance = stale
    ? { amount: 0, items: [] }
    : await loadMoveOutBalance(db, customer.id, { excludePaymentIds: chargePayment ? [chargePayment.id] : [] });
  if (balance.items.length > 0) {
    blockers.push(
      balance.items.every((item) => item.status === "pending")
        ? "ผู้เช่ามีสลิปที่รอตรวจสอบ กรุณาตรวจสลิปให้เรียบร้อยก่อนอนุมัติย้ายห้อง"
        : `ผู้เช่ามียอดค้างชำระ ${formatBaht(toCents(balance.amount))} (${balance.items.map((item) => item.label).join(", ")}) กรุณาเก็บเงินให้ครบก่อนอนุมัติย้ายห้อง`,
    );
  }

  const [depositPayments, ledger] = await Promise.all([
    loadDepositPayments(db, [customer.id]),
    loadTransferDepositLedger(db, [customer.id]),
  ]);
  const priorTransfers = ledger.get(customer.id) ?? [];
  const depositAmountCents = Math.max(0, toCents(customer.deposit_amount));
  const depositPaidCents = Math.min(depositAmountCents, paidDepositCents(depositPayments.get(customer.id)));
  const deductedBeforeCents = transferDepositDeductedCents(priorTransfers);
  const depositRemainingCents = depositBalanceAfterTransfers(depositPaidCents, priorTransfers);

  const inspectionDamageCents = toCents(inspection?.damage_cost);
  const appliedDamageCents = damageCents ?? inspectionDamageCents;
  if (appliedDamageCents > depositRemainingCents) {
    blockers.push(
      `ค่าเสียหาย ${formatBaht(appliedDamageCents)} เกินเงินมัดจำคงเหลือ ${formatBaht(depositRemainingCents)} กรุณาแก้ไขผลตรวจห้อง`,
    );
  }

  const sourcePriceCents = toCents(sourceRoom?.price);
  const targetPriceCents = toCents(targetRoom?.price);
  const paidThrough = coverage?.paidThrough ?? sourceRoom?.billing_start_date ?? sourceRoom?.rental_start_date ?? null;
  const moveDate = (request.transfer_calc_date && parseDateOnly(request.transfer_calc_date)) || startOfDay(now);
  const proration = computeProratedRent({
    anchor: sourceRoom?.billing_start_date ?? sourceRoom?.rental_start_date,
    paidThrough,
    moveDate,
    sourcePriceCents,
    targetPriceCents,
  });
  const settlement = computeRoomTransferSettlement({
    sourcePriceCents,
    targetPriceCents,
    depositBalanceCents: depositRemainingCents,
    damageCents: appliedDamageCents,
    proration,
  });
  const newPriceFrom = proration.nextPeriodStart ?? paidThrough;

  const transferCharge = {
    required: settlement.additionalChargeCents > 0,
    payment: chargePayment,
    status: !chargePayment
      ? "not_sent"
      : chargePayment.status === "paid"
        ? "paid"
        : chargePayment.slip_path ? "verifying" : "unpaid",
    dueAt: request.transfer_charge_due_at,
  };
  if (chargePayment && toCents(chargePayment.amount) !== settlement.additionalChargeCents) {
    blockers.push(
      `ยอดชำระย้ายห้องเปลี่ยนจาก ${formatBaht(toCents(chargePayment.amount))} เป็น ${formatBaht(settlement.additionalChargeCents)} กรุณาปฏิเสธคำขอแล้วให้ผู้เช่าส่งคำขอใหม่`,
    );
  }

  return {
    request,
    customer,
    sourceRoom,
    targetRoom,
    booking,
    coverage,
    balance,
    inspection,
    damage: { inspectionCents: inspectionDamageCents, appliedCents: appliedDamageCents },
    deposit: { amountCents: depositAmountCents, paidCents: depositPaidCents, deductedBeforeCents, remainingCents: depositRemainingCents },
    settlement,
    transferCharge,
    newPriceFrom,
    blockers,
    stale,
  };
}

export async function validateInspectionDamage(db, requestId, damageCents) {
  const plan = await buildRoomTransferPlan(db, requestId, { damageCents });
  if (!plan?.customer || plan.stale) return null;
  if (damageCents > plan.deposit.remainingCents) {
    return `ค่าเสียหายต้องไม่เกินเงินมัดจำคงเหลือ ${formatBaht(plan.deposit.remainingCents)}`;
  }
  const payment = plan.transferCharge.payment;
  if (payment && (payment.status === "paid" || payment.slip_path) && damageCents !== plan.damage.inspectionCents) {
    return "ผู้เช่าชำระหรือส่งสลิปยอดย้ายห้องแล้ว จึงแก้ไขค่าเสียหายไม่ได้ กรุณาปฏิเสธคำขอแล้วให้ผู้เช่าส่งคำขอใหม่";
  }
  return null;
}

export const ROOM_TRANSFER_CHARGE_DAYS = 3;

export async function loadHeldTransferRooms(db, { exceptCustomerId = 0 } = {}) {
  const [rows] = await db.query(
    `SELECT DISTINCT target_room_number FROM TenantRequest
     WHERE type = 'move_room' AND status IN ('pending', 'in_progress')
       AND transfer_charge_payment_id IS NOT NULL AND target_room_number IS NOT NULL AND customer_id <> ?`,
    [exceptCustomerId],
  );
  return new Set(rows.map((row) => Number(row.target_room_number)));
}

export async function roomHeldForTransfer(db, roomNumber, { exceptRequestId = 0, exceptCustomerId = 0 } = {}) {
  const [rows] = await db.query(
    `SELECT id FROM TenantRequest
     WHERE type = 'move_room' AND status IN ('pending', 'in_progress') AND transfer_charge_payment_id IS NOT NULL
       AND target_room_number = ? AND id <> ? AND customer_id <> ?
     LIMIT 1`,
    [roomNumber, exceptRequestId, exceptCustomerId],
  );
  return rows.length > 0;
}

export const roomTransferNeedsPayment = (plan) => plan.transferCharge.required && plan.transferCharge.status !== "paid";

export async function requestRoomTransferCharge(connection, plan, staffName) {
  const { request, sourceRoom, targetRoom, booking, settlement } = plan;
  const parts = [`มัดจำเพิ่ม ${formatBaht(settlement.topupCents)}`];
  const [chargeResult] = await connection.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'pending', ?, ?)`,
    [
      booking.id,
      settlement.additionalChargeCents / 100,
      ROOM_TRANSFER_PAYMENT_TYPE,
      `ย้ายห้อง ${sourceRoom.room_number} → ${targetRoom.room_number}: ${parts.join(" + ")} ชำระภายใน ${ROOM_TRANSFER_CHARGE_DAYS} วัน`.slice(0, 255),
    ],
  );
  await connection.query(
    `UPDATE TenantRequest
     SET status = 'in_progress',
         accepted_at = COALESCE(accepted_at, NOW()),
         accepted_by_name = COALESCE(accepted_by_name, ?),
         transfer_charge_payment_id = ?,
         transfer_charge_due_at = DATE_ADD(NOW(), INTERVAL ? DAY),
         transfer_charge_periods = ?,
         transfer_calc_date = ?
     WHERE id = ?`,
    [
      staffName || null,
      chargeResult.insertId,
      ROOM_TRANSFER_CHARGE_DAYS,
      settlement.chargeablePeriods,
      settlement.moveDate,
      request.id,
    ],
  );
  return chargeResult.insertId;
}

export async function syncRoomTransferCharge(connection, requestId, staffName) {
  let plan = await buildRoomTransferPlan(connection, requestId, { lock: true });
  if (!plan?.customer || plan.stale) return 0;
  const payment = plan.transferCharge.payment;
  if (
    payment && payment.status === "pending" && !payment.slip_path
    && toCents(payment.amount) !== plan.settlement.additionalChargeCents
  ) {
    await connection.query(
      `UPDATE Payment SET status = 'cancelled', note = LEFT(CONCAT(COALESCE(note, ''), ' (ยกเลิก: แก้ไขผลตรวจห้อง คำนวณยอดใหม่)'), 255)
       WHERE id = ? AND status = 'pending' AND slip_path IS NULL`,
      [payment.id],
    );
    await connection.query(
      `UPDATE TenantRequest
       SET transfer_charge_payment_id = NULL, transfer_charge_due_at = NULL, transfer_charge_periods = NULL, transfer_calc_date = NULL
       WHERE id = ?`,
      [requestId],
    );
    plan = await buildRoomTransferPlan(connection, requestId, { lock: true });
  }
  if (plan.blockers.length === 0 && plan.transferCharge.required && plan.transferCharge.status === "not_sent") {
    await requestRoomTransferCharge(connection, plan, staffName);
    return plan.settlement.additionalChargeCents;
  }
  return 0;
}

export async function cancelTransfersIntoBookedRooms(db, roomNumber = null) {
  const [rows] = await db.query(
    `SELECT tr.id, tr.target_room_number, tr.transfer_charge_payment_id
     FROM TenantRequest tr
     JOIN Room r ON r.room_number = tr.target_room_number
     WHERE tr.type = 'move_room' AND tr.status IN ('pending', 'in_progress') AND r.is_booked = TRUE
       AND (? IS NULL OR tr.target_room_number = ?)`,
    [roomNumber, roomNumber],
  );
  for (const row of rows) {
    await db.query(
      `UPDATE TenantRequest
       SET status = 'cancelled', completed_at = NOW(), completed_by_name = 'ระบบ (ห้องปลายทางมีผู้เช่าแล้ว)', reject_reason = ?
       WHERE id = ? AND status IN ('pending', 'in_progress')`,
      [`ห้อง ${row.target_room_number} มีผู้เช่าเข้าพักแล้ว ระบบยกเลิกคำขอย้ายห้องและการทำสัญญาใหม่ กรุณาเลือกห้องอื่น`, row.id],
    );
    if (row.transfer_charge_payment_id) {
      await db.query(
        `UPDATE Payment SET status = 'cancelled', note = LEFT(CONCAT(COALESCE(note, ''), ' (ยกเลิก: ห้องปลายทางมีผู้เช่าแล้ว)'), 255)
         WHERE id = ? AND status = 'pending' AND slip_path IS NULL`,
        [row.transfer_charge_payment_id],
      );
    }
  }
  return rows.length;
}

export async function expireRoomTransferCharges(db) {
  await cancelTransfersIntoBookedRooms(db);
  const [rows] = await db.query(
    `SELECT tr.id, tr.transfer_charge_payment_id
     FROM TenantRequest tr
     LEFT JOIN Payment p ON p.id = tr.transfer_charge_payment_id
     WHERE tr.type = 'move_room' AND tr.status IN ('pending', 'in_progress')
       AND tr.transfer_charge_due_at IS NOT NULL AND tr.transfer_charge_due_at <= NOW()
       AND (p.id IS NULL OR (p.status = 'pending' AND p.slip_path IS NULL))`,
  );
  for (const row of rows) {
    const [paymentResult] = await db.query(
      `UPDATE Payment SET status = 'cancelled', note = LEFT(CONCAT(COALESCE(note, ''), ' (ยกเลิก: ไม่ชำระภายในกำหนด)'), 255)
       WHERE id = ? AND status = 'pending' AND slip_path IS NULL`,
      [row.transfer_charge_payment_id],
    );
    if (row.transfer_charge_payment_id && paymentResult.affectedRows === 0) continue;
    await db.query(
      `UPDATE TenantRequest
       SET status = 'cancelled', completed_at = NOW(), completed_by_name = 'ระบบ (ไม่ชำระส่วนต่าง)', reject_reason = ?
       WHERE id = ? AND status IN ('pending', 'in_progress')`,
      [`ไม่ได้ชำระยอดย้ายห้อง (ค่าเช่า/มัดจำเพิ่ม) ภายใน ${ROOM_TRANSFER_CHARGE_DAYS} วัน ระบบยกเลิกการย้ายห้องและการทำสัญญาใหม่แล้ว`, row.id],
    );
  }
  const [orphanRows] = await db.query(
    `SELECT p.id FROM TenantRequest tr
     JOIN Payment p ON p.id = tr.transfer_charge_payment_id
     WHERE tr.type = 'move_room' AND tr.status IN ('rejected', 'cancelled') AND p.status = 'pending' AND p.slip_path IS NULL`,
  );
  if (orphanRows.length > 0) {
    await db.query(
      `UPDATE Payment SET status = 'cancelled', note = LEFT(CONCAT(COALESCE(note, ''), ' (ยกเลิก: คำขอย้ายห้องถูกยกเลิก)'), 255)
       WHERE id IN (?) AND status = 'pending' AND slip_path IS NULL`,
      [orphanRows.map((row) => row.id)],
    );
  }
  return rows.length;
}

export async function loadRoomTransferPreview(db, requestId, { damageCents = null } = {}) {
  const plan = await buildRoomTransferPlan(db, requestId, { damageCents });
  if (!plan) return null;
  const contracts = plan.customer ? await loadCustomerContracts(db, [plan.customer.id], { currentOnly: true }) : new Map();
  const { request, customer, sourceRoom, targetRoom, coverage, balance, deposit, settlement } = plan;
  return {
    request,
    customer: customer && { id: customer.id, first_name: customer.first_name, last_name: customer.last_name, phone: customer.phone },
    source_room: roomSummary(sourceRoom),
    target_room: roomSummary(targetRoom),
    contract: (customer && contracts.get(customer.id)) ?? null,
    coverage: coverage && { paid_through: coverage.paidThrough, paid_periods_from_current: coverage.paidPeriodsFromCurrent },
    outstanding: balance,
    deposit: {
      amount: deposit.amountCents / 100,
      paid: deposit.paidCents / 100,
      deducted_before: deposit.deductedBeforeCents / 100,
      remaining: deposit.remainingCents / 100,
    },
    damage: {
      inspection_id: plan.inspection?.id ?? null,
      recorded: plan.damage.inspectionCents / 100,
      applied: plan.damage.appliedCents / 100,
    },
    settlement: settlementView(settlement),
    new_price_from: plan.newPriceFrom,
    transfer_charge: {
      required: plan.transferCharge.required,
      status: plan.transferCharge.status,
      payment_id: plan.transferCharge.payment?.id ?? null,
      amount: plan.transferCharge.payment ? Number(plan.transferCharge.payment.amount) : settlement.additionalChargeCents / 100,
      deposit_topup: settlement.topupCents / 100,
      due_at: plan.transferCharge.dueAt,
      days: ROOM_TRANSFER_CHARGE_DAYS,
    },
    blockers: plan.stale ? ["ผู้เช่าเปลี่ยนห้องไปแล้ว คำขอนี้จะถูกนำออกจากรายการ"] : plan.blockers,
    can_request_charge: !plan.stale && plan.blockers.length === 0 && plan.transferCharge.status === "not_sent" && plan.transferCharge.required,
    can_approve: !plan.stale && plan.blockers.length === 0 && !roomTransferNeedsPayment(plan),
  };
}

export async function applyRoomTransfer(connection, plan, staffName, contractImages = []) {
  const { request, customer, sourceRoom, targetRoom, booking, settlement } = plan;
  if (roomTransferNeedsPayment(plan)) {
    throw Object.assign(new Error("ผู้เช่ายังไม่ได้ชำระยอดย้ายห้อง"), { code: "TRANSFER_CHARGE_UNPAID" });
  }
  if (contractImages.length < ROOM_TRANSFER_MIN_CONTRACT_IMAGES) {
    throw Object.assign(new Error(`กรุณาแนบรูปสัญญาใหม่อย่างน้อย ${ROOM_TRANSFER_MIN_CONTRACT_IMAGES} รูป`), {
      code: "CONTRACT_IMAGES_REQUIRED",
    });
  }
  const [contractRows] = await connection.query(
    `SELECT MAX(id) AS id FROM Booking WHERE customer_id = ? AND contract_completed_at IS NOT NULL AND id <= ?`,
    [customer.id, booking.id],
  );
  const contractBookingId = contractRows[0]?.id ?? booking.id;
  await connection.query(
    `UPDATE Booking SET rental_start_date = ?, rental_end_date = ? WHERE id = ?`,
    [sourceRoom.rental_start_date, sourceRoom.rental_end_date, booking.id],
  );
  await connection.query(
    `UPDATE Room
     SET is_booked = FALSE, rental_duration_months = NULL, rental_start_date = NULL, rental_end_date = NULL,
         prepaid_until = NULL, billing_start_date = NULL, pending_lump_sum_months = NULL, rent_credit = NULL
     WHERE id = ?`,
    [sourceRoom.id],
  );
  await connection.query(
    `UPDATE Room
     SET is_booked = TRUE, rental_duration_months = ?, rental_start_date = ?, rental_end_date = ?,
         prepaid_until = NULL, billing_start_date = ?, pending_lump_sum_months = ?, rent_credit = ?
     WHERE id = ?`,
    [
      sourceRoom.rental_duration_months,
      sourceRoom.rental_start_date,
      sourceRoom.rental_end_date,
      plan.newPriceFrom,
      sourceRoom.pending_lump_sum_months,
      settlement.rentCarryCents > 0 ? settlement.rentCarryCents / 100 : null,
      targetRoom.id,
    ],
  );
  await connection.query(`UPDATE Customer SET room_number = ? WHERE id = ?`, [targetRoom.room_number, customer.id]);
  const [bookingResult] = await connection.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date) VALUES (?, ?, NOW(), ?)`,
    [customer.id, targetRoom.id, sourceRoom.rental_end_date],
  );
  const toBookingId = bookingResult.insertId;

  const chargePaymentId = settlement.additionalChargeCents > 0 ? plan.transferCharge.payment.id : null;
  let rentChargePaymentId = null;
  if (settlement.rentChargeCents > 0) {
    const [rentChargeResult] = await connection.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'pending', ?, ?)`,
      [
        toBookingId,
        settlement.rentChargeCents / 100,
        ROOM_TRANSFER_PAYMENT_TYPE,
        `ส่วนต่างค่าเช่าเดือนที่ย้ายเข้า ห้อง ${sourceRoom.room_number} → ${targetRoom.room_number}`,
      ],
    );
    rentChargePaymentId = rentChargeResult.insertId;
  }
  const hasMoveMonth = settlement.chargeablePeriods > 0;

  const money = (cents) => cents / 100;
  const [transferResult] = await connection.query(
    `INSERT INTO RoomTransfer (tenant_request_id, customer_id, from_booking_id, to_booking_id, from_room_number, to_room_number,
                               from_price, to_price, chargeable_periods, price_difference_total, deposit_before, deposit_deducted,
                               amount_charged, charge_payment_id, new_price_from, approved_by_name, contract_booking_id,
                               inspection_id, move_date, paid_through, remaining_days, period_days, old_unused_rent,
                               new_prorated_rent, rent_charge, rent_credit_to_deposit, damage_deduction, transferable_deposit,
                               required_deposit, deposit_applied, deposit_topup, deposit_surplus_credit, deposit_limit,
                               deposit_excess_refund, deposit_after, rent_carry_credit, rent_charge_payment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      request.id,
      customer.id,
      booking.id,
      toBookingId,
      sourceRoom.room_number,
      targetRoom.room_number,
      sourceRoom.price,
      targetRoom.price,
      hasMoveMonth ? 1 : 0,
      money(settlement.moveMonthDifferenceCents),
      money(settlement.depositBeforeCents),
      money(settlement.additionalChargeCents),
      chargePaymentId,
      plan.newPriceFrom,
      staffName || null,
      contractBookingId,
      plan.inspection?.id ?? null,
      settlement.moveDate,
      settlement.paidThrough,
      settlement.remainingDays,
      settlement.periodDays,
      money(settlement.oldUnusedCents),
      money(settlement.newProratedCents),
      money(settlement.rentChargeCents),
      money(settlement.rentCreditCents),
      money(settlement.damageDeductionCents),
      money(settlement.transferableCents),
      money(settlement.requiredCents),
      money(settlement.appliedCents),
      money(settlement.topupCents),
      money(settlement.surplusCents),
      money(settlement.limitCents),
      money(settlement.excessRefundCents),
      money(settlement.depositAfterCents),
      money(settlement.rentCarryCents),
      rentChargePaymentId,
    ],
  );
  const transferId = transferResult.insertId;
  await connection.query(
    `UPDATE ContractImage SET replaced_at = NOW(), replaced_by_transfer_id = ? WHERE booking_id = ? AND replaced_at IS NULL`,
    [transferId, contractBookingId],
  );
  await connection.query(
    `INSERT INTO ContractImage (booking_id, customer_id, name, url, room_transfer_id) VALUES ?`,
    [contractImages.map((image) => [contractBookingId, customer.id, image.name, image.url, transferId])],
  );
  return { toBookingId, chargePaymentId, rentChargePaymentId, transferId, contractBookingId };
}

export function roomTransferApprovalMessage(plan) {
  const { settlement, sourceRoom, targetRoom } = plan;
  const parts = [`อนุมัติย้ายห้อง ${sourceRoom.room_number} → ${targetRoom.room_number} สำเร็จ`];
  if (settlement.damageDeductionCents > 0) parts.push(`หักค่าเสียหายจากเงินมัดจำ ${formatBaht(settlement.damageDeductionCents)}`);
  if (settlement.additionalChargeCents > 0) parts.push(`ผู้เช่าชำระมัดจำเพิ่มแล้ว ${formatBaht(settlement.additionalChargeCents)}`);
  if (settlement.rentChargeCents > 0) parts.push(`ส่งบิลส่วนต่างค่าเช่าเดือนที่ย้ายเข้า ${formatBaht(settlement.rentChargeCents)} ให้ผู้เช่าแล้ว`);
  if (settlement.rentCarryCents > 0) parts.push(`ค่าเช่าห้องเดิมที่จ่ายล่วงหน้า ${formatBaht(settlement.rentCarryCents)} นำไปหักบิลค่าเช่ารอบถัดไป`);
  if (settlement.surplusCents + settlement.rentCreditCents > 0) {
    parts.push(`เพิ่มเป็นเงินมัดจำที่คืนได้ ${formatBaht(settlement.surplusCents + settlement.rentCreditCents - settlement.excessRefundCents)}`);
  }
  if (settlement.excessRefundCents > 0) parts.push(`ต้องคืนเงินส่วนเกินเพดานมัดจำให้ผู้เช่า ${formatBaht(settlement.excessRefundCents)}`);
  parts.push(`เงินมัดจำห้องใหม่ ${formatBaht(settlement.depositAfterCents)}`);
  return parts.join(" · ");
}
