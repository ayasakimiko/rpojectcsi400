import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { isPositiveId } from "../middleware/validation.js";
import { PUBLIC_UPLOAD_DIR, customerUploadFolder, moveUploadedFiles } from "../middleware/publicUploads.js";
import {
  DEMO_PAYMENT_CHANNELS,
  TEST_PAYMENT_MARK,
  inquireSlip,
  normalizeSlipPayload,
  SlipVerificationError,
  slipReceiverMatches,
} from "../middleware/slipVerification.js";

export const VISITOR_MAX_HOURS = 3;
export const DEFAULT_FINE_PER_HOUR = 20;
export const MAX_FINE_PER_HOUR = 10000;
export const MAX_SPACES_PER_TYPE = 200;
export const VEHICLE_TYPES = new Set(["car", "motorcycle"]);
export const USER_CATEGORIES = new Set(["resident", "visitor"]);
export const VEHICLE_TYPE_LABELS = { car: "รถยนต์", motorcycle: "รถจักรยานยนต์" };
export const SPACE_PREFIX = { car: "C", motorcycle: "M" };
const SPACE_ZONE = { car: "ลานจอดรถยนต์", motorcycle: "ลานจอดรถจักรยานยนต์" };
const LOCK_NAME = "parking_registration";
const HOUR_MS = 60 * 60 * 1000;
const FINE_SLIP_FOLDER = "payment-slips";
const FINE_SLIP_EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const FINE_SLIP_DIR = path.join(PUBLIC_UPLOAD_DIR, FINE_SLIP_FOLDER);
const FINE_METHOD_LABELS = { promptpay: "PromptPay", bank: "โอนเข้าบัญชีธนาคาร", counter: "รับชำระที่เคาน์เตอร์" };
const SLIP_USED_MESSAGE = "สลิปนี้ถูกใช้ชำระเงินไปแล้ว ไม่สามารถใช้ซ้ำได้";

export const ACTIVE_VEHICLE_SQL = `r.request_type = 'vehicle' AND r.status IN ('pending', 'approved') AND r.checked_out_at IS NULL
  AND (r.end_at IS NULL OR r.end_at > NOW() OR r.parked_at IS NOT NULL)`;

export const PARKING_SELECT_SQL = `r.user_category, r.vehicle_type, r.parking_space_id, ps.code AS parking_space_code, ps.zone AS parking_space_zone,
  r.parked_at, r.checked_out_at, DATE_ADD(r.parked_at, INTERVAL ${VISITOR_MAX_HOURS} HOUR) AS allowed_until,
  TIMESTAMPDIFF(SECOND, r.parked_at, COALESCE(r.checked_out_at, NOW())) AS parked_seconds,
  r.fine_hours, r.fine_rate, r.fine_amount, r.fine_status, r.fine_payment_method, r.fine_slip_path, r.fine_paid_at, r.fine_paid_by_name`;

export const PARKING_JOIN_SQL = "LEFT JOIN ParkingSpace ps ON ps.id = r.parking_space_id";

export class ParkingError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function fineForElapsed(elapsedSeconds, ratePerHour, maxHours = VISITOR_MAX_HOURS) {
  const seconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const overSeconds = seconds - maxHours * 3600;
  const overtimeHours = overSeconds > 0 ? Math.ceil(overSeconds / 3600) : 0;
  const rateCents = Math.round(Number(ratePerHour) * 100);
  const safeRate = Number.isSafeInteger(rateCents) && rateCents > 0 ? rateCents : 0;
  return { overtimeHours, amount: (overtimeHours * safeRate) / 100 };
}

export function calculateParkingFine(parkedAt, endedAt, ratePerHour, maxHours = VISITOR_MAX_HOURS) {
  return fineForElapsed((new Date(endedAt).getTime() - new Date(parkedAt).getTime()) / 1000, ratePerHour, maxHours);
}

export function toSqlDateTime(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function visitorKey(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

export function parseParkingInput(body) {
  const { userCategory, vehicleType, parkingSpaceId, startAt, endAt } = body ?? {};
  if (!USER_CATEGORIES.has(userCategory)) return { error: "กรุณาเลือกประเภทผู้ใช้ (ผู้พักอาศัย / ผู้มาติดต่อ)" };
  if (!VEHICLE_TYPES.has(vehicleType)) return { error: "กรุณาเลือกประเภทรถ (รถยนต์ / รถจักรยานยนต์)" };
  const spaceId = Number(parkingSpaceId);
  if (!isPositiveId(spaceId)) return { error: "กรุณาเลือกช่องจอดที่ว่าง" };
  const startTime = typeof startAt === "string" ? Date.parse(startAt) : NaN;
  if (!Number.isFinite(startTime)) return { error: "กรุณาระบุวันเวลาเริ่มจอดให้ถูกต้อง" };
  const start = toSqlDateTime(new Date(startTime));
  if (userCategory === "visitor") {
    return {
      value: { userCategory, vehicleType, spaceId, startAt: start, endAt: toSqlDateTime(new Date(startTime + VISITOR_MAX_HOURS * HOUR_MS)) },
    };
  }
  const openEnded = endAt === null || endAt === undefined || endAt === "";
  const endTime = openEnded ? null : typeof endAt === "string" ? Date.parse(endAt) : NaN;
  if (!openEnded && (!Number.isFinite(endTime) || endTime <= startTime)) {
    return { error: "วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่ม" };
  }
  return { value: { userCategory, vehicleType, spaceId, startAt: start, endAt: openEnded ? null : toSqlDateTime(new Date(endTime)) } };
}

export function validateVisitorContact(guestName, guestPhone) {
  if (!String(guestName ?? "").trim()) return "กรุณาระบุชื่อผู้มาติดต่อ";
  const digits = visitorKey(guestPhone);
  if (digits.length < 9 || digits.length > 10) return "กรุณาระบุเบอร์โทรผู้มาติดต่อให้ถูกต้อง (9-10 หลัก) เพื่อใช้ติดต่อเรื่องเวลาจอดและค่าปรับ";
  return null;
}

export async function findSpaceConflict(db, spaceId, startAt, endAt, excludeId = 0) {
  const [rows] = await db.query(
    `SELECT r.id, r.vehicle_plate FROM ResidentVisitRequest r
     WHERE r.parking_space_id = ? AND ${ACTIVE_VEHICLE_SQL} AND r.id <> ?
       AND (r.parked_at IS NOT NULL OR r.end_at IS NULL OR r.end_at > ?)
       AND (? IS NULL OR COALESCE(r.parked_at, r.start_at) < ?)
     LIMIT 1`,
    [spaceId, excludeId || 0, startAt, endAt, endAt],
  );
  return rows[0] || null;
}

export async function countActiveVehicles(db, { userCategory, customerId, guestPhone, vehicleType, excludeId = 0 }) {
  if (userCategory === "resident") {
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM ResidentVisitRequest r
       WHERE ${ACTIVE_VEHICLE_SQL} AND r.user_category = 'resident' AND r.customer_id = ? AND r.vehicle_type = ? AND r.id <> ?`,
      [customerId, vehicleType, excludeId || 0],
    );
    return Number(total);
  }
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM ResidentVisitRequest r
     WHERE ${ACTIVE_VEHICLE_SQL} AND r.user_category = 'visitor' AND r.vehicle_type = ? AND r.id <> ?
       AND REGEXP_REPLACE(COALESCE(r.guest_phone, ''), '[^0-9]', '') = ?`,
    [vehicleType, excludeId || 0, visitorKey(guestPhone)],
  );
  return Number(total);
}

export async function hasUnpaidFine(db, { customerId, guestPhone }) {
  const key = visitorKey(guestPhone);
  const [rows] = await db.query(
    `SELECT 1 FROM ResidentVisitRequest
     WHERE fine_status = 'unpaid' AND ((? IS NOT NULL AND customer_id = ?)
       OR (? <> '' AND REGEXP_REPLACE(COALESCE(guest_phone, ''), '[^0-9]', '') = ?))
     LIMIT 1`,
    [customerId ?? null, customerId ?? null, key, key],
  );
  return rows.length > 0;
}

export async function assertParkingAllowed(db, input) {
  const { userCategory, vehicleType, spaceId, startAt, endAt, customerId, guestPhone, excludeId = 0 } = input;
  const [spaces] = await db.query("SELECT id, code, vehicle_type, is_active FROM ParkingSpace WHERE id = ? FOR UPDATE", [spaceId]);
  const space = spaces[0];
  if (!space || !space.is_active) throw new ParkingError(400, "ไม่พบช่องจอดที่เลือก หรือช่องจอดถูกปิดใช้งาน");
  if (space.vehicle_type !== vehicleType) {
    throw new ParkingError(400, `ช่อง ${space.code} สำหรับ${VEHICLE_TYPE_LABELS[space.vehicle_type]}เท่านั้น`);
  }
  if (userCategory === "resident" && !customerId) throw new ParkingError(400, "ผู้พักอาศัยต้องผูกกับห้องที่มีผู้เช่า");
  const active = await countActiveVehicles(db, { userCategory, customerId, guestPhone, vehicleType, excludeId });
  if (active >= 1) {
    throw new ParkingError(
      409,
      userCategory === "resident"
        ? `ผู้พักอาศัยลงทะเบียน${VEHICLE_TYPE_LABELS[vehicleType]}ได้สูงสุด 1 คัน (มีรายการที่ใช้งานอยู่แล้ว)`
        : `ผู้มาติดต่อลงทะเบียน${VEHICLE_TYPE_LABELS[vehicleType]}ได้สูงสุด 1 คันต่อครั้ง (เบอร์นี้มีรายการที่ใช้งานอยู่แล้ว)`,
      "PARKING_VEHICLE_LIMIT",
    );
  }
  if (!excludeId && (await hasUnpaidFine(db, { customerId, guestPhone: userCategory === "visitor" ? guestPhone : "" }))) {
    throw new ParkingError(409, "มีค่าปรับจอดเกินเวลาที่ยังไม่ได้ชำระ กรุณาชำระค่าปรับก่อนลงทะเบียนรถคันใหม่", "PARKING_UNPAID_FINE");
  }
  const conflict = await findSpaceConflict(db, spaceId, startAt, endAt, excludeId);
  if (conflict) {
    throw new ParkingError(409, `ช่องจอด ${space.code} ถูกจองแล้วในช่วงเวลานี้ กรุณาเลือกช่องอื่น`, "PARKING_SPACE_TAKEN");
  }
  return space;
}

export async function withParkingLock(pool, run) {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [[{ acquired }]] = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [LOCK_NAME]);
    if (acquired !== 1) throw new ParkingError(503, "ระบบที่จอดรถกำลังมีผู้ใช้งานจำนวนมาก กรุณาลองใหม่อีกครั้ง");
    locked = true;
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]).catch(() => {});
    connection.release();
  }
}

export async function loadParkingSettings(db) {
  const [rows] = await db.query(
    "SELECT dorm_name, promptpay_id, bank_name, bank_account_no, payment_test_mode, slip_verify_mode, parking_fine_per_hour FROM DormConfig WHERE id = 1",
  );
  const config = rows[0] || {};
  const testMode = Boolean(config.payment_test_mode);
  const source = testMode ? DEMO_PAYMENT_CHANNELS : config;
  const rate = Number(config.parking_fine_per_hour);
  return {
    finePerHour: Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_FINE_PER_HOUR,
    visitorMaxHours: VISITOR_MAX_HOURS,
    paymentChannels: {
      dorm_name: config.dorm_name || "",
      promptpay_id: source.promptpay_id || "",
      bank_name: source.bank_name || "",
      bank_account_no: source.bank_account_no || "",
      test_mode: testMode,
      verify_mode: config.slip_verify_mode === "manual" ? "manual" : "auto",
    },
  };
}

export function withParkingState(rows, finePerHour) {
  return rows.map((row) => {
    const fineAmount = Number(row.fine_amount) || 0;
    const parkedSeconds = row.parked_seconds == null ? null : Number(row.parked_seconds);
    const live =
      row.user_category === "visitor" && row.parked_at && !row.checked_out_at
        ? fineForElapsed(parkedSeconds, finePerHour)
        : { overtimeHours: Number(row.fine_hours) || 0, amount: fineAmount };
    return {
      ...row,
      fine_amount: fineAmount,
      fine_rate: row.fine_rate == null ? null : Number(row.fine_rate),
      parked_seconds: parkedSeconds,
      live_fine_hours: live.overtimeHours,
      live_fine_amount: live.amount,
    };
  });
}

export async function loadParkingSpaces(db, { startAt, endAt, excludeId = 0, withOccupant = false } = {}) {
  const now = new Date();
  const start = startAt || toSqlDateTime(now);
  const end = startAt ? endAt ?? null : toSqlDateTime(new Date(now.getTime() + 1000));
  const occupantSql = `FROM ResidentVisitRequest r
    WHERE r.parking_space_id = s.id AND ${ACTIVE_VEHICLE_SQL} AND r.id <> ?
      AND (r.parked_at IS NOT NULL OR r.end_at IS NULL OR r.end_at > ?)
      AND (? IS NULL OR COALESCE(r.parked_at, r.start_at) < ?)
    ORDER BY COALESCE(r.parked_at, r.start_at) LIMIT 1`;
  const [spaces] = await db.query(
    `SELECT s.id, s.code, s.vehicle_type, s.zone,
            (SELECT r.id ${occupantSql}) AS occupied_request_id,
            (SELECT r.vehicle_plate ${occupantSql}) AS occupied_plate
     FROM ParkingSpace s WHERE s.is_active = TRUE ORDER BY s.vehicle_type, s.code`,
    [excludeId || 0, start, end, end, excludeId || 0, start, end, end],
  );
  return spaces.map((space) => ({
    id: space.id,
    code: space.code,
    vehicle_type: space.vehicle_type,
    zone: space.zone,
    available: !space.occupied_request_id,
    ...(withOccupant ? { occupied_plate: space.occupied_plate || null } : {}),
  }));
}

export async function loadRoomParkingWindow(db, roomNumber, startAt = null) {
  const [rows] = await db.query("SELECT rental_end_date FROM Room WHERE room_number = ?", [roomNumber]);
  const now = new Date();
  now.setSeconds(0, 0);
  const contractEnd = rows[0]?.rental_end_date ? new Date(rows[0].rental_end_date) : null;
  return {
    startAt: startAt || toSqlDateTime(now),
    endAt: contractEnd ? toSqlDateTime(contractEnd) : null,
    expired: Boolean(contractEnd && contractEnd <= now),
  };
}

export async function loadResidentParkingWindow(db, customerId) {
  const [rows] = await db.query(
    `SELECT r.rental_end_date FROM Customer c JOIN Room r ON r.room_number = c.room_number WHERE c.id = ?`,
    [customerId],
  );
  const now = new Date();
  now.setSeconds(0, 0);
  const contractEnd = rows[0]?.rental_end_date ? new Date(rows[0].rental_end_date) : null;
  return {
    startAt: toSqlDateTime(now),
    endAt: contractEnd ? toSqlDateTime(contractEnd) : null,
    expired: Boolean(contractEnd && contractEnd <= now),
  };
}

export function createParkingOptionsHandler({ withOccupant = false, customerScoped = false } = {}) {
  return async function parkingOptions(req, res) {
    try {
      const pool = getPool();
      const { startAt, endAt, excludeId, userCategory } = req.query ?? {};
      const startTime = typeof startAt === "string" && startAt ? Date.parse(startAt) : NaN;
      let start = null;
      let end = null;
      const roomNumber = Number(req.query?.roomNumber);
      const residentWindow = customerScoped
        ? await loadResidentParkingWindow(pool, req.user.id)
        : userCategory === "resident" && isPositiveId(roomNumber)
          ? await loadRoomParkingWindow(pool, roomNumber, Number.isFinite(startTime) ? toSqlDateTime(new Date(startTime)) : null)
          : null;
      if (residentWindow) {
        start = residentWindow.startAt;
        end = residentWindow.endAt;
      } else if (Number.isFinite(startTime)) {
        start = toSqlDateTime(new Date(startTime));
        if (userCategory === "visitor") end = toSqlDateTime(new Date(startTime + VISITOR_MAX_HOURS * HOUR_MS));
        else if (typeof endAt === "string" && endAt && Number.isFinite(Date.parse(endAt))) end = toSqlDateTime(new Date(Date.parse(endAt)));
      }
      const exclude = Number(excludeId);
      const [spaces, settings] = await Promise.all([
        loadParkingSpaces(pool, { startAt: start, endAt: end, excludeId: isPositiveId(exclude) ? exclude : 0, withOccupant }),
        loadParkingSettings(pool),
      ]);
      const response = { spaces, settings, ...(residentWindow ? { residentWindow } : {}) };
      if (customerScoped) {
        const [usageRows] = await pool.query(
          `SELECT r.user_category, r.vehicle_type, COUNT(*) AS total FROM ResidentVisitRequest r
           WHERE ${ACTIVE_VEHICLE_SQL} AND r.customer_id = ? GROUP BY r.user_category, r.vehicle_type`,
          [req.user.id],
        );
        const usage = { resident: { car: 0, motorcycle: 0 }, visitor: { car: 0, motorcycle: 0 } };
        for (const row of usageRows) {
          if (usage[row.user_category] && row.vehicle_type in usage[row.user_category]) usage[row.user_category][row.vehicle_type] = Number(row.total);
        }
        response.usage = usage;
        response.hasUnpaidFine = await hasUnpaidFine(pool, { customerId: req.user.id, guestPhone: "" });
      }
      return res.json(response);
    } catch (error) {
      console.error("Load parking options error:", error);
      return res.status(500).json({ message: "ไม่สามารถโหลดข้อมูลช่องจอดได้" });
    }
  };
}

export function createCheckInHandler(getActingName) {
  return async function checkInVisitor(req, res) {
    try {
      const id = Number(req.params.id);
      if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
      const pool = getPool();
      const actorName = await getActingName(pool, req.user);
      await withParkingLock(pool, async (connection) => {
        const [rows] = await connection.query(
          "SELECT id, request_type, user_category, status, parked_at, parking_space_id FROM ResidentVisitRequest WHERE id = ? FOR UPDATE",
          [id],
        );
        const request = rows[0];
        if (!request || request.request_type !== "vehicle") throw new ParkingError(404, "ไม่พบรายการรถนี้");
        if (request.user_category !== "visitor") throw new ParkingError(400, "เช็คอินได้เฉพาะรถของผู้มาติดต่อ");
        if (request.status !== "approved") throw new ParkingError(409, "ต้องอนุมัติคำขอก่อนเช็คอินเข้าจอด");
        if (request.parked_at) throw new ParkingError(409, "รถคันนี้เช็คอินเข้าจอดแล้ว");
        if (request.parking_space_id) {
          const now = new Date();
          const conflict = await findSpaceConflict(
            connection,
            request.parking_space_id,
            toSqlDateTime(now),
            toSqlDateTime(new Date(now.getTime() + VISITOR_MAX_HOURS * HOUR_MS)),
            id,
          );
          if (conflict) throw new ParkingError(409, `ช่องจอดนี้ยังมีรถทะเบียน ${conflict.vehicle_plate || "-"} ใช้งานอยู่ กรุณาแก้ไขช่องจอดก่อนเช็คอิน`);
        }
        await connection.query(
          `UPDATE ResidentVisitRequest
           SET parked_at = NOW(), end_at = DATE_ADD(NOW(), INTERVAL ${VISITOR_MAX_HOURS} HOUR), updated_by_name = ?, updated_at = NOW()
           WHERE id = ?`,
          [actorName, id],
        );
      });
      return res.json({ message: `เช็คอินเข้าจอดแล้ว จอดได้ ${VISITOR_MAX_HOURS} ชั่วโมงนับจากตอนนี้` });
    } catch (error) {
      if (error instanceof ParkingError) return res.status(error.status).json({ message: error.message, code: error.code });
      console.error("Parking check-in error:", error);
      return res.status(500).json({ message: "ไม่สามารถเช็คอินได้" });
    }
  };
}

export async function endParkingSession(pool, id, actorName) {
  return withParkingLock(pool, async (connection) => {
    const [rows] = await connection.query(
      `SELECT id, request_type, user_category, status, parked_at, checked_out_at,
              TIMESTAMPDIFF(SECOND, parked_at, NOW()) AS parked_seconds
       FROM ResidentVisitRequest WHERE id = ? FOR UPDATE`,
      [id],
    );
    const request = rows[0];
    if (!request) throw new ParkingError(404, "ไม่พบคำขอนี้");
    if (!["pending", "approved"].includes(request.status)) throw new ParkingError(409, "คำขอนี้ถูกปิดแล้ว");
    if (request.user_category === "visitor" && request.parked_at && !request.checked_out_at) {
      const settings = await loadParkingSettings(connection);
      const fine = fineForElapsed(request.parked_seconds, settings.finePerHour);
      await connection.query(
        `UPDATE ResidentVisitRequest
         SET status = 'cancelled', cancelled_by_name = ?, cancelled_at = NOW(), checked_out_at = NOW(),
             fine_hours = ?, fine_rate = ?, fine_amount = ?, fine_status = ?
         WHERE id = ?`,
        [actorName, fine.overtimeHours, settings.finePerHour, fine.amount, fine.amount > 0 ? "unpaid" : "none", id],
      );
      return { checkedOut: true, ...fine };
    }
    await connection.query(
      "UPDATE ResidentVisitRequest SET status = 'cancelled', cancelled_by_name = ?, cancelled_at = NOW() WHERE id = ?",
      [actorName, id],
    );
    return { checkedOut: false, overtimeHours: 0, amount: 0 };
  });
}

fs.mkdirSync(FINE_SLIP_DIR, { recursive: true });

const fineSlipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, FINE_SLIP_DIR),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${FINE_SLIP_EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (FINE_SLIP_EXTENSIONS[file.mimetype]) return callback(null, true);
    return callback(new Error("แนบได้เฉพาะไฟล์ JPG, PNG หรือ WebP"));
  },
});

export function parseFineSlip(req, res, next) {
  fineSlipUpload.single("slip")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB" });
    return res.status(400).json({ message: error.message || "อัปโหลดสลิปไม่สำเร็จ" });
  });
}

async function isSlipUsed(db, { transRef, qrPayload }) {
  if (qrPayload) {
    const [[paymentUse]] = await db.query("SELECT COUNT(*) AS total FROM PaymentSlip WHERE qr_payload = ?", [qrPayload]);
    const [[fineUse]] = await db.query("SELECT COUNT(*) AS total FROM ResidentVisitRequest WHERE fine_qr_payload = ?", [qrPayload]);
    if (Number(paymentUse.total) + Number(fineUse.total) > 0) return true;
  }
  if (transRef) {
    const [[paymentUse]] = await db.query("SELECT COUNT(*) AS total FROM PaymentSlip WHERE trans_ref = ?", [transRef]);
    const [[fineUse]] = await db.query("SELECT COUNT(*) AS total FROM ResidentVisitRequest WHERE fine_trans_ref = ?", [transRef]);
    if (Number(paymentUse.total) + Number(fineUse.total) > 0) return true;
  }
  return false;
}

export function createFinePaymentHandler({ getActingName, scopeCustomerId = () => null }) {
  return async function payParkingFine(req, res) {
    try {
      if (!req.file) throw new SlipVerificationError(400, "กรุณาแนบสลิปการโอนเงินค่าปรับ");
      const id = Number(req.params.id);
      if (!isPositiveId(id)) throw new SlipVerificationError(400, "รหัสคำขอไม่ถูกต้อง");
      const method = req.body?.payment_method;
      if (!["promptpay", "bank"].includes(method)) throw new SlipVerificationError(400, "กรุณาเลือกช่องทางการชำระเงิน");
      const qrPayload = normalizeSlipPayload(req.body?.qr_payload);
      const pool = getPool();
      const customerId = scopeCustomerId(req);
      const [rows] = await pool.query(
        "SELECT id, customer_id, fine_status, fine_amount FROM ResidentVisitRequest WHERE id = ? AND request_type = 'vehicle'",
        [id],
      );
      const request = rows[0];
      if (!request || (customerId && request.customer_id !== customerId)) throw new SlipVerificationError(404, "ไม่พบรายการค่าปรับนี้");
      if (request.fine_status === "paid") throw new SlipVerificationError(409, "ค่าปรับรายการนี้ชำระแล้ว");
      if (request.fine_status === "pending_review") throw new SlipVerificationError(409, "มีสลิปค่าปรับที่รอตรวจสอบอยู่แล้ว");
      if (request.fine_status !== "unpaid") throw new SlipVerificationError(400, "รายการนี้ไม่มีค่าปรับที่ต้องชำระ");
      const dueCents = Math.round(Number(request.fine_amount) * 100);
      const [configRows] = await pool.query(
        "SELECT promptpay_id, bank_account_no, payment_test_mode, slip_verify_mode FROM DormConfig WHERE id = 1",
      );
      const config = configRows[0] || {};
      const testMode = Boolean(config.payment_test_mode);
      const [slipPath] = await moveUploadedFiles([req.file], customerUploadFolder(FINE_SLIP_FOLDER, request.customer_id));
      const actorName = await getActingName(pool, req.user);
      const methodLabel = FINE_METHOD_LABELS[method];
      let nextStatus = "paid";
      let transRef = null;
      let message;
      if (config.slip_verify_mode === "manual") {
        if (!testMode && qrPayload && (await isSlipUsed(pool, { qrPayload }))) throw new SlipVerificationError(409, SLIP_USED_MESSAGE);
        nextStatus = "pending_review";
        message = "ส่งสลิปค่าปรับแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบ";
      } else if (testMode) {
        transRef = `TEST-${randomUUID()}`;
        message = `ชำระค่าปรับในโหมดทดลองเรียบร้อย (${TEST_PAYMENT_MARK})`;
      } else {
        if (qrPayload && (await isSlipUsed(pool, { qrPayload }))) throw new SlipVerificationError(409, SLIP_USED_MESSAGE);
        const slip = await inquireSlip({ payload: qrPayload, file: req.file });
        transRef = String(slip.transRef ?? "").replace(/[^\x21-\x7e]/g, "").slice(0, 64);
        if (!transRef) throw new SlipVerificationError(400, "สลิปไม่ถูกต้อง หรือไม่พบรายการโอนนี้ในระบบธนาคาร");
        if (await isSlipUsed(pool, { transRef })) throw new SlipVerificationError(409, SLIP_USED_MESSAGE);
        const slipCents = Math.round(Number(slip.amount) * 100);
        if (!Number.isSafeInteger(slipCents) || slipCents < dueCents) {
          throw new SlipVerificationError(
            400,
            `ยอดเงินในสลิป (฿${(Number(slip.amount) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}) น้อยกว่าค่าปรับ (฿${(dueCents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })})`,
          );
        }
        if (!slipReceiverMatches(slip, [config.promptpay_id, config.bank_account_no])) {
          throw new SlipVerificationError(400, "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีของหอพัก กรุณาตรวจสอบสลิปอีกครั้ง");
        }
        message = "ตรวจสอบสลิปผ่านแล้ว ชำระค่าปรับเรียบร้อย";
      }
      const [result] = await pool.query(
        `UPDATE ResidentVisitRequest
         SET fine_status = ?, fine_payment_method = ?, fine_slip_path = ?, fine_qr_payload = ?, fine_trans_ref = ?,
             fine_paid_at = IF(? = 'paid', NOW(), NULL), fine_paid_by_name = IF(? = 'paid', ?, NULL)
         WHERE id = ? AND fine_status = 'unpaid'`,
        [
          nextStatus,
          method,
          slipPath,
          testMode ? null : qrPayload || null,
          transRef,
          nextStatus,
          nextStatus,
          `${actorName} · ${methodLabel}${testMode ? ` · ${TEST_PAYMENT_MARK}` : ""}`,
          id,
        ],
      );
      if (!result.affectedRows) throw new SlipVerificationError(409, "สถานะค่าปรับเปลี่ยนแปลงระหว่างตรวจสอบ กรุณาโหลดหน้าใหม่");
      return res.status(201).json({ message, fineStatus: nextStatus });
    } catch (error) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      if (error instanceof SlipVerificationError) return res.status(error.status).json({ message: error.message });
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: SLIP_USED_MESSAGE });
      console.error("Parking fine payment error:", error);
      return res.status(500).json({ message: "ไม่สามารถบันทึกการชำระค่าปรับได้" });
    }
  };
}

export function createFineReviewHandler(getActingName) {
  return async function reviewParkingFine(req, res) {
    try {
      const id = Number(req.params.id);
      const decision = req.body?.decision;
      if (!isPositiveId(id) || !["approve", "reject"].includes(decision)) return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      const pool = getPool();
      const actorName = await getActingName(pool, req.user);
      if (decision === "approve") {
        const [result] = await pool.query(
          `UPDATE ResidentVisitRequest
           SET fine_status = 'paid', fine_paid_at = NOW(),
               fine_payment_method = COALESCE(fine_payment_method, 'counter'),
               fine_paid_by_name = CONCAT(?, ' · ', IF(fine_status = 'pending_review', 'ตรวจสลิปแล้ว', 'รับชำระที่เคาน์เตอร์'))
           WHERE id = ? AND fine_status IN ('unpaid', 'pending_review') AND fine_amount > 0`,
          [actorName, id],
        );
        if (!result.affectedRows) return res.status(409).json({ message: "รายการนี้ไม่มีค่าปรับที่รอชำระ" });
        return res.json({ message: "บันทึกการชำระค่าปรับแล้ว" });
      }
      const [rows] = await pool.query("SELECT fine_slip_path FROM ResidentVisitRequest WHERE id = ? AND fine_status = 'pending_review'", [id]);
      if (!rows[0]) return res.status(409).json({ message: "ไม่มีสลิปค่าปรับที่รอตรวจสอบ" });
      await pool.query(
        `UPDATE ResidentVisitRequest
         SET fine_status = 'unpaid', fine_payment_method = NULL, fine_slip_path = NULL, fine_qr_payload = NULL, fine_trans_ref = NULL
         WHERE id = ? AND fine_status = 'pending_review'`,
        [id],
      );
      const slipFile = rows[0].fine_slip_path ? path.join(FINE_SLIP_DIR, path.basename(rows[0].fine_slip_path)) : null;
      if (slipFile && fs.existsSync(slipFile)) fs.unlinkSync(slipFile);
      return res.json({ message: "ปฏิเสธสลิปค่าปรับแล้ว ผู้จอดต้องชำระใหม่" });
    } catch (error) {
      console.error("Review parking fine error:", error);
      return res.status(500).json({ message: "ไม่สามารถบันทึกผลได้" });
    }
  };
}

export async function syncParkingSpaces(connection, vehicleType, count) {
  const prefix = SPACE_PREFIX[vehicleType];
  for (let number = 1; number <= count; number += 1) {
    await connection.query(
      `INSERT INTO ParkingSpace (code, vehicle_type, zone) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = IF(vehicle_type = VALUES(vehicle_type), TRUE, is_active)`,
      [`${prefix}${String(number).padStart(2, "0")}`, vehicleType, SPACE_ZONE[vehicleType]],
    );
  }
  const [extra] = await connection.query(
    `SELECT s.id, s.code FROM ParkingSpace s
     WHERE s.vehicle_type = ? AND s.is_active = TRUE AND s.code REGEXP ? AND CAST(SUBSTRING(s.code, 2) AS UNSIGNED) > ?`,
    [vehicleType, `^${prefix}[0-9]+$`, count],
  );
  if (extra.length === 0) return;
  const [busy] = await connection.query(
    `SELECT DISTINCT ps.code FROM ResidentVisitRequest r JOIN ParkingSpace ps ON ps.id = r.parking_space_id
     WHERE r.parking_space_id IN (?) AND ${ACTIVE_VEHICLE_SQL}`,
    [extra.map((space) => space.id)],
  );
  if (busy.length) {
    throw new ParkingError(409, `ปิดช่องจอดไม่ได้ เพราะช่อง ${busy.map((space) => space.code).join(", ")} ยังมีรถใช้งานอยู่`);
  }
  await connection.query("UPDATE ParkingSpace SET is_active = FALSE WHERE id IN (?)", [extra.map((space) => space.id)]);
}

export async function parkingSpaceCounts(db) {
  const [rows] = await db.query("SELECT vehicle_type, COUNT(*) AS total FROM ParkingSpace WHERE is_active = TRUE GROUP BY vehicle_type");
  const counts = { car: 0, motorcycle: 0 };
  for (const row of rows) counts[row.vehicle_type] = Number(row.total);
  return counts;
}

export async function getParkingSettings(_req, res) {
  try {
    const pool = getPool();
    const [settings, counts] = await Promise.all([loadParkingSettings(pool), parkingSpaceCounts(pool)]);
    return res.json({ finePerHour: settings.finePerHour, visitorMaxHours: VISITOR_MAX_HOURS, carSpaces: counts.car, motorcycleSpaces: counts.motorcycle });
  } catch (error) {
    console.error("Load parking settings error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดการตั้งค่าที่จอดรถได้" });
  }
}

export async function updateParkingSettings(req, res) {
  try {
    if (!["Admin", "Owner"].includes(req.user?.role)) return res.status(403).json({ message: "เฉพาะแอดมินหรือเจ้าของหอเท่านั้น" });
    const finePerHour = Number(req.body?.finePerHour);
    const carSpaces = Number(req.body?.carSpaces);
    const motorcycleSpaces = Number(req.body?.motorcycleSpaces);
    if (!Number.isFinite(finePerHour) || finePerHour < 0 || finePerHour > MAX_FINE_PER_HOUR || Math.round(finePerHour * 100) !== finePerHour * 100) {
      return res.status(400).json({ message: `ค่าปรับต่อชั่วโมงต้องอยู่ระหว่าง 0 - ${MAX_FINE_PER_HOUR.toLocaleString("th-TH")} บาท` });
    }
    if (![carSpaces, motorcycleSpaces].every((value) => Number.isInteger(value) && value >= 0 && value <= MAX_SPACES_PER_TYPE)) {
      return res.status(400).json({ message: `จำนวนช่องจอดต้องเป็นจำนวนเต็ม 0 - ${MAX_SPACES_PER_TYPE} ช่อง` });
    }
    const pool = getPool();
    await withParkingLock(pool, async (connection) => {
      await connection.query(
        "INSERT INTO DormConfig (id, parking_fine_per_hour) VALUES (1, ?) ON DUPLICATE KEY UPDATE parking_fine_per_hour = ?",
        [finePerHour, finePerHour],
      );
      await syncParkingSpaces(connection, "car", carSpaces);
      await syncParkingSpaces(connection, "motorcycle", motorcycleSpaces);
    });
    return res.json({ message: "บันทึกการตั้งค่าที่จอดรถแล้ว", finePerHour, visitorMaxHours: VISITOR_MAX_HOURS, carSpaces, motorcycleSpaces });
  } catch (error) {
    if (error instanceof ParkingError) return res.status(error.status).json({ message: error.message });
    console.error("Update parking settings error:", error);
    return res.status(500).json({ message: "ไม่สามารถบันทึกการตั้งค่าที่จอดรถได้" });
  }
}

