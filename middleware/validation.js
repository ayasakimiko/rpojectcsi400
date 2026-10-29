import { ROOM_AMENITY_ICON_KEYS } from "../src/utils/roomAmenities.js";
import { MAINTENANCE_CATEGORY_KEYS, MAINTENANCE_TIME_KEYS } from "../src/utils/maintenanceCategories.js";
import {
  MAX_MONEY,
  MAX_NAME_LENGTH,
  MESSAGES,
  isPositiveId,
  isValidAge,
  isValidDateString,
  isValidDateTimeString,
  isValidIdcard,
  isValidPassword,
  isValidPhone,
  validateName,
  validateText,
} from "../src/utils/validators.js";

export {
  MAX_MONEY,
  MAX_NAME_LENGTH,
  isPositiveId,
  isValidAge,
  isValidDateString,
  isValidDateTimeString,
  isValidIdcard,
  isValidPassword,
  isValidPhone,
  validateName,
  validateText,
};

const MAX_SEARCH_LENGTH = 100;
const MAX_PAGE = 100_000;

export function hasField(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

export function lookup(map, key) {
  return typeof key === "string" && Object.hasOwn(map, key) ? map[key] : undefined;
}

export function parsePage(value) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1;
}

export function parseSearch(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_SEARCH_LENGTH) : "";
}

export function parseSearchDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/[๐-๙]/g, (digit) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
  const yearFirst = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (!yearFirst && !dayFirst) return null;
  let year = Number(yearFirst ? yearFirst[1] : dayFirst[3]);
  const month = Number(yearFirst ? yearFirst[2] : dayFirst[2]);
  const day = Number(yearFirst ? yearFirst[3] : dayFirst[1]);
  if (year > 2400) year -= 543;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateSearchSql(search, columns) {
  const fullDate = parseSearchDate(search);
  const text = String(search ?? '').trim().replace(/[๐-๙]/g, (digit) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
  const dayOnly = /^(\d{1,2})\.$/.exec(text);
  const dayMonth = /^(\d{1,2})[./-](\d{1,2})\.?$/.exec(text);
  const day = Number(dayOnly?.[1] ?? dayMonth?.[1]);
  const month = dayMonth ? Number(dayMonth[2]) : null;
  if (!fullDate && (!day || day > 31 || (month !== null && (month < 1 || month > 12)))) return null;

  const params = [];
  const sql = columns.map((column) => {
    if (fullDate) {
      params.push(fullDate);
      return `DATE(${column}) = ?`;
    }
    params.push(day);
    if (!month) return `DAY(${column}) = ?`;
    params.push(month);
    return `(DAY(${column}) = ? AND MONTH(${column}) = ?)`;
  }).join(' OR ');
  return { sql: `(${sql})`, params };
}

export function validateDateQuery(query, keys) {
  for (const key of keys) {
    const value = query[key];
    if (value === undefined || value === "") continue;
    if (!isValidDateString(value)) {
      return MESSAGES.date;
    }
  }
  return null;
}

export function parseYearMonthQuery(query) {
  const year = Number(query.year);
  const month = Number(query.month);
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

export function isValidMoney(value, { allowZero = true } = {}) {
  const num = Number(value);
  if (value === null || value === "" || typeof value === "boolean" || !Number.isFinite(num)) return false;
  return (allowZero ? num >= 0 : num > 0) && num <= MAX_MONEY;
}

export function validatePersonInput({ idcard, password, phone, first_name, last_name, age }) {
  const textFields = [idcard, password, phone, first_name, last_name];
  if (textFields.some((value) => value !== undefined && value !== null && typeof value !== "string")) {
    return "รูปแบบข้อมูลไม่ถูกต้อง";
  }
  if (textFields.some((value) => !value || !value.trim()) || age === undefined || age === null || age === "") {
    return "กรุณากรอกข้อมูลให้ครบทุกช่อง";
  }
  if (!isValidIdcard(idcard)) return MESSAGES.idcard;
  if (!isValidPassword(password)) return MESSAGES.password;
  if (!isValidPhone(phone)) return MESSAGES.phone;
  return validateName(first_name, "ชื่อ") || validateName(last_name, "นามสกุล") || (isValidAge(age) ? null : MESSAGES.age);
}

export function validatePersonUpdateInput(body) {
  if (hasField(body, "first_name")) {
    const error = validateName(body.first_name, "ชื่อ");
    if (error) return error;
  }
  if (hasField(body, "last_name")) {
    const error = validateName(body.last_name, "นามสกุล");
    if (error) return error;
  }
  if (hasField(body, "phone") && !isValidPhone(body.phone)) {
    return MESSAGES.phone;
  }
  if (hasField(body, "age") && !isValidAge(body.age)) {
    return MESSAGES.age;
  }
  if (hasField(body, "password") && body.password !== "" && body.password !== null && !isValidPassword(body.password)) {
    return MESSAGES.password;
  }
  return null;
}

export function normalizePersonUpdate(body) {
  const normalized = { ...body };
  for (const field of ["first_name", "last_name", "phone"]) {
    if (typeof normalized[field] === "string") normalized[field] = normalized[field].trim();
  }
  if (hasField(normalized, "age")) normalized.age = Number(normalized.age);
  return normalized;
}

const ROOM_BOOLEAN_FIELDS = ["air_conditioner", "wifi", "refrigerator", "bathroom", "cctv"];

const ROOM_FIELD_VALIDATORS = {
  room_number: (value) => {
    const num = Number(value);
    return Number.isInteger(num) && num >= 100 && num <= 999 ? null : "เลขห้องต้องเป็นตัวเลข 3 หลัก (100-999)";
  },
  price: (value) => (isValidMoney(value) ? null : "ราคาไม่ถูกต้อง"),
  room_size: (value) => {
    if (value === null || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 && num <= 9999.99 ? null : "ขนาดห้องต้องเป็นตัวเลขมากกว่า 0 (ไม่เกิน 9,999.99 ตร.ม.)";
  },
  bed: (value) => {
    const num = Number(value);
    return Number.isInteger(num) && num >= 0 && num <= 99 ? null : "จำนวนเตียงต้องเป็นตัวเลข 2 หลัก (0-99)";
  },
  electricity_unit_price: (value) => {
    const num = Number(value);
    return value !== null && value !== "" && Number.isFinite(num) && num >= 0 && num <= 99.99
      ? null
      : "ค่าไฟ/หน่วยต้องเป็นตัวเลข 2 หลัก (0-99.99)";
  },
  water_unit_price: (value) => {
    const num = Number(value);
    return value !== null && value !== "" && Number.isFinite(num) && num >= 0 && num <= 999.99
      ? null
      : "ค่าน้ำ/หน่วยต้องเป็นตัวเลข (0-999.99)";
  },
  water_price: (value) => {
    const num = Number(value);
    return value !== null && value !== "" && Number.isFinite(num) && num >= 0 && num <= 999.99
      ? null
      : "ค่าน้ำ/เดือนต้องเป็นตัวเลข 3 หลัก (0-999.99)";
  },
  custom_amenities: (value) => {
    if (!Array.isArray(value) || value.length > 12) return "สิ่งอำนวยความสะดวกเพิ่มเติมต้องเป็นรายการไม่เกิน 12 รายการ";
    const names = value.map((item) => typeof item === "string" ? item.trim() : typeof item?.name === "string" ? item.name.trim() : "");
    if (names.some((name) => !name || name.length > 60) || new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) {
      return "สิ่งอำนวยความสะดวกเพิ่มเติมต้องไม่ซ้ำกันและยาวไม่เกิน 60 ตัวอักษรต่อรายการ";
    }
    if (value.some((item) => typeof item !== "string" && (!item || typeof item !== "object" || !ROOM_AMENITY_ICON_KEYS.includes(item.icon || "sparkle")))) {
      return "ไอคอนสิ่งอำนวยความสะดวกไม่ถูกต้อง";
    }
    return null;
  },
};

for (const field of ROOM_BOOLEAN_FIELDS) {
  ROOM_FIELD_VALIDATORS[field] = (value) => (typeof value === "boolean" ? null : "รูปแบบข้อมูลสิ่งอำนวยความสะดวกไม่ถูกต้อง");
}

export function validateRoomFields(body) {
  for (const [field, validate] of Object.entries(ROOM_FIELD_VALIDATORS)) {
    if (hasField(body, field)) {
      const error = validate(body[field]);
      if (error) return error;
    }
  }
  return null;
}

export function validateLoginInput({ username, password }) {
  if (typeof username !== "string" || typeof password !== "string") {
    return "รูปแบบข้อมูลไม่ถูกต้อง";
  }
  if (!username.trim() || !password) {
    return "กรุณากรอกเลขบัตรประชาชนหรือเลขห้อง และรหัสผ่าน";
  }
  if (!/^\d{1,13}$/.test(username.trim())) {
    return "กรุณากรอกเลขบัตรประชาชนหรือเลขห้องให้ถูกต้อง";
  }
  if (password.length < 6 || password.length > 128) {
    return "เลขบัตรประชาชน เลขห้อง หรือรหัสผ่านไม่ถูกต้อง";
  }
  return null;
}

export function validateRegisterInput(body) {
  const { room_number, rental_start_date, rental_end_date, deposit_amount } = body;
  if (!room_number || !rental_start_date || !rental_end_date) {
    return "กรุณากรอกข้อมูลให้ครบทุกช่อง";
  }
  const personError = validatePersonInput(body);
  if (personError) {
    return personError;
  }
  const roomNumberValue = Number(room_number);
  if (!Number.isInteger(roomNumberValue) || roomNumberValue < 100 || roomNumberValue > 999) {
    return "เลขห้องไม่ถูกต้อง";
  }
  if (!isValidDateTimeString(rental_start_date) || !isValidDateTimeString(rental_end_date)) {
    return "วันเวลาที่เริ่มเช่าหรือวันเวลาที่สิ้นสุดสัญญาไม่ถูกต้อง";
  }
  if (new Date(rental_end_date) <= new Date(rental_start_date)) {
    return "วันเวลาที่สิ้นสุดสัญญาต้องอยู่หลังวันเวลาที่เริ่มเช่า";
  }
  if (deposit_amount !== undefined && deposit_amount !== null && deposit_amount !== "" && !isValidMoney(deposit_amount)) {
    return "จำนวนเงินมัดจำไม่ถูกต้อง";
  }
  return null;
}

export const EXPENSE_PAYMENT_METHODS = new Set(["cash", "transfer", "card", "other"]);
export const EXPENSE_MAX_PHOTOS = 6;

const isBlank = (value) => value === undefined || value === null || value === "";

const EXPENSE_FIELD_VALIDATORS = {
  category: (value) => validateText(value, "หมวดหมู่รายจ่าย", { maxLength: 50 }),
  description: (value) => validateText(value, "คำอธิบาย", { maxLength: 255, required: false }),
  amount: (value) => (isValidMoney(value, { allowZero: false }) ? null : "จำนวนเงินไม่ถูกต้อง"),
  expense_date: (value) => (isValidDateString(value) ? null : "วันที่ไม่ถูกต้อง"),
  vendor: (value) => validateText(value, "ผู้รับเงิน/ร้านค้า", { maxLength: 120, required: false }),
  payment_method: (value) =>
    isBlank(value) || EXPENSE_PAYMENT_METHODS.has(value) ? null : "วิธีชำระเงินไม่ถูกต้อง",
  receipt_number: (value) => validateText(value, "เลขที่ใบเสร็จ", { maxLength: 60, required: false }),
  room_number: (value) =>
    isBlank(value) || (Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 999)
      ? null
      : "เลขห้องไม่ถูกต้อง",
};

export function validateExpenseInput(body, { partial }) {
  for (const [field, validate] of Object.entries(EXPENSE_FIELD_VALIDATORS)) {
    if (partial && !hasField(body, field)) continue;
    const error = validate(body[field]);
    if (error) return error;
  }
  return null;
}

const MAINTENANCE_CATEGORIES = new Set(MAINTENANCE_CATEGORY_KEYS);
const MAINTENANCE_TIME_SLOTS = new Set(MAINTENANCE_TIME_KEYS);

export function parseMaintenanceInput(body = {}) {
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return { error: "กรุณากรอกรายละเอียดปัญหาที่ต้องการแจ้งซ่อม" };
  }
  if (description.length > 500) {
    return { error: "รายละเอียดยาวเกินไป (สูงสุด 500 ตัวอักษร)" };
  }
  const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() : "";
  if (contactPhone && !/^[0-9+\-\s]{9,20}$/.test(contactPhone)) {
    return { error: "เบอร์โทรติดต่อไม่ถูกต้อง" };
  }
  return {
    value: {
      description,
      category: MAINTENANCE_CATEGORIES.has(body.category) ? body.category : "other",
      preferredTime: MAINTENANCE_TIME_SLOTS.has(body.preferredTime) ? body.preferredTime : "anytime",
      contactPhone: contactPhone || null,
    },
  };
}

const REQUEST_TYPES = new Set(["renew", "moveout", "move_room"]);
export const RENEW_DURATION_MONTHS = new Set([1, 3, 6, 12]);
export const CONTRACT_DURATION_MONTHS = new Set([3, 6, 12]);
export const DEPOSIT_MONTHS = 2;
export const RENT_GRACE_DAYS = 3;
export const CONTRACT_MIN_IMAGES = 5;
export const ROOM_TRANSFER_MIN_CONTRACT_IMAGES = 5;
const MOVE_ROOM_REASONS = new Set(["room_problem", "price", "amenities", "location", "noise", "other"]);
export const MOVE_ROOM_MAX_DAYS_AHEAD = 60;

export function contractSystemRules() {
  return {
    contract_durations: [...CONTRACT_DURATION_MONTHS],
    renew_durations: [...RENEW_DURATION_MONTHS],
    deposit_months: DEPOSIT_MONTHS,
    grace_days: RENT_GRACE_DAYS,
    notice_days: MOVE_ROOM_MAX_DAYS_AHEAD,
    contract_min_images: CONTRACT_MIN_IMAGES,
    transfer_min_images: ROOM_TRANSFER_MIN_CONTRACT_IMAGES,
  };
}

function toLocalDateString(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseTenantRequestInput(body = {}) {
  const { type } = body;
  if (!REQUEST_TYPES.has(type)) {
    return { error: "ประเภทคำขอไม่ถูกต้อง" };
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  if (type === "moveout" && !note) {
    return { error: "กรุณากรอกรายละเอียดการย้ายออก" };
  }
  const parsePreferredMoveDate = () => {
    const preferredMoveDate = typeof body.preferred_move_date === "string" ? body.preferred_move_date : "";
    const today = new Date();
    const latest = new Date(today.getFullYear(), today.getMonth(), today.getDate() + MOVE_ROOM_MAX_DAYS_AHEAD);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(preferredMoveDate)
      || Number.isNaN(new Date(`${preferredMoveDate}T00:00:00`).getTime())
      || preferredMoveDate < toLocalDateString(today)
      || preferredMoveDate > toLocalDateString(latest)
    ) {
      return null;
    }
    return preferredMoveDate;
  };
  if (type === "moveout") {
    const preferredMoveDate = parsePreferredMoveDate();
    if (!preferredMoveDate) {
      return { error: `กรุณาเลือกวันที่ต้องการย้ายออกภายใน ${MOVE_ROOM_MAX_DAYS_AHEAD} วันนับจากวันนี้` };
    }
    return {
      value: {
        type, note, targetRoomNumber: null, renewDurationMonths: null, renewPaymentType: null,
        moveReason: null, preferredMoveDate,
      },
    };
  }
  if (type === "move_room") {
    const targetRoomNumber = Number(body.target_room_number);
    if (!Number.isInteger(targetRoomNumber) || targetRoomNumber < 100 || targetRoomNumber > 999) {
      return { error: "กรุณาเลือกห้องที่ต้องการย้าย" };
    }
    const moveReason = body.move_reason;
    if (!MOVE_ROOM_REASONS.has(moveReason)) {
      return { error: "กรุณาเลือกเหตุผลที่ต้องการย้ายห้อง" };
    }
    if (moveReason === "other" && !note) {
      return { error: "กรุณาระบุเหตุผลเพิ่มเติมในหมายเหตุ" };
    }
    const preferredMoveDate = parsePreferredMoveDate();
    if (!preferredMoveDate) {
      return { error: `กรุณาเลือกวันที่ต้องการย้ายภายใน ${MOVE_ROOM_MAX_DAYS_AHEAD} วันนับจากวันนี้` };
    }
    return {
      value: {
        type, note, targetRoomNumber, renewDurationMonths: null, renewPaymentType: null, moveReason, preferredMoveDate,
      },
    };
  }

  const renewDurationMonths = Number(body.renew_duration_months);
  if (!RENEW_DURATION_MONTHS.has(renewDurationMonths)) {
    return { error: "กรุณาเลือกระยะเวลาที่ต้องการต่อสัญญา" };
  }
  const renewPaymentType = "monthly";
  return {
    value: {
      type, note, targetRoomNumber: null, renewDurationMonths, renewPaymentType, moveReason: null, preferredMoveDate: null,
    },
  };
}

export function parseUtilityBillInput(body = {}) {
  const isFilled = (raw) => raw !== undefined && raw !== "" && raw !== null;
  const { electricity_units: unitsRaw, electricity_amount: amountRaw, water_amount: waterRaw, water_units: waterUnitsRaw } = body;

  const electricityUnits = isFilled(unitsRaw) ? Number(unitsRaw) : null;
  if (electricityUnits !== null && (!Number.isFinite(electricityUnits) || electricityUnits <= 0 || electricityUnits > 100_000)) {
    return { error: "หน่วยไฟฟ้าไม่ถูกต้อง" };
  }
  if (isFilled(amountRaw) && !isValidMoney(amountRaw, { allowZero: false })) {
    return { error: "ค่าไฟฟ้าไม่ถูกต้อง" };
  }
  if (isFilled(waterRaw) && !isValidMoney(waterRaw, { allowZero: false })) {
    return { error: "ค่าน้ำไม่ถูกต้อง" };
  }

  const electricityAmount = isFilled(amountRaw) ? Number(amountRaw) : null;
  const waterAmount = isFilled(waterRaw) ? Number(waterRaw) : null;
  const waterUnits = isFilled(waterUnitsRaw) ? Number(waterUnitsRaw) : null;
  if (waterUnits !== null && (!Number.isFinite(waterUnits) || waterUnits <= 0 || waterUnits > 100_000)) {
    return { error: "หน่วยน้ำไม่ถูกต้อง" };
  }
  if (waterUnits !== null && waterAmount !== null) return { error: "เลือกค่าน้ำแบบหน่วยหรือยอดเงินอย่างใดอย่างหนึ่ง" };
  if (electricityUnits !== null && electricityAmount !== null) return { error: "เลือกค่าไฟแบบหน่วยหรือยอดเงินอย่างใดอย่างหนึ่ง" };
  if (electricityUnits === null && electricityAmount === null && waterAmount === null && waterUnits === null) {
    return { error: "กรุณากรอกค่าไฟฟ้าหรือค่าน้ำอย่างน้อยหนึ่งรายการ" };
  }
  return { value: { electricityUnits, electricityAmount, waterAmount, waterUnits } };
}

const MAX_PHOTOS = 6;
const MAX_PHOTO_DATA_URL_LENGTH = 7_000_000;
const PHOTO_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function parsePhotoList(photos, maxPhotos = MAX_PHOTOS) {
  if (photos === undefined || photos === null) return { value: [] };
  if (!Array.isArray(photos) || photos.length > maxPhotos) {
    return { error: `แนบรูปได้ไม่เกิน ${maxPhotos} รูป` };
  }
  const value = [];
  for (const photo of photos) {
    const dataUrl = photo?.dataUrl;
    if (typeof dataUrl !== "string" || dataUrl.length > MAX_PHOTO_DATA_URL_LENGTH || !PHOTO_DATA_URL_PATTERN.test(dataUrl)) {
      return { error: "รูปภาพไม่ถูกต้องหรือมีขนาดใหญ่เกินไป" };
    }
    const name = typeof photo.name === "string" ? photo.name.trim().slice(0, 255) : "";
    value.push({ name: name || "photo.jpg", dataUrl });
  }
  return { value };
}

const ANNOUNCEMENT_TONES = new Set(["info", "warning"]);
const MAX_EXPIRY_MINUTES = 30 * 24 * 60;
const MAX_POPUP_MINUTES = 365 * 24 * 60;
export const ANNOUNCEMENT_MAX_PHOTOS = 6;

export function parseAnnouncementInput(body = {}, existingPhotos = []) {
  const error =
    validateText(body.title, "หัวข้อประกาศ", { maxLength: 120 }) ||
    validateText(body.message, "รายละเอียดประกาศ", { maxLength: 1000 });
  if (error) return { error };
  const tone = body.tone ?? "info";
  if (!ANNOUNCEMENT_TONES.has(tone)) return { error: "ประเภทประกาศไม่ถูกต้อง" };

  const isGiven = (field) => body[field] !== undefined && body[field] !== null && body[field] !== "";
  if (isGiven("expires_at") && isGiven("expires_in_minutes")) {
    return { error: "เลือกกำหนดเวลาลบประกาศได้อย่างใดอย่างหนึ่ง (วันและเวลา หรือระยะเวลา)" };
  }

  let expiresAt = null;
  if (isGiven("expires_at")) {
    if (!isValidDateTimeString(body.expires_at)) return { error: "วันและเวลาที่ลบประกาศไม่ถูกต้อง" };
    expiresAt = `${body.expires_at.slice(0, 10)} ${body.expires_at.slice(11, 16)}:00`;
  }

  let expiresInMinutes = null;
  if (isGiven("expires_in_minutes")) {
    const raw = body.expires_in_minutes;
    const isNumeric = typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw.trim()));
    const minutes = isNumeric ? Number(raw) : Number.NaN;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_EXPIRY_MINUTES) {
      return { error: "ระยะเวลาที่ลบประกาศต้องอยู่ระหว่าง 1 นาที ถึง 30 วัน" };
    }
    expiresInMinutes = minutes;
  }

  let popupInMinutes;
  if (tone !== "warning") {
    popupInMinutes = null;
  } else if (body.popup_in_minutes === null || body.popup_in_minutes === "") {
    popupInMinutes = null;
  } else if (body.popup_in_minutes !== undefined) {
    const raw = body.popup_in_minutes;
    const isNumeric = typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw.trim()));
    const minutes = isNumeric ? Number(raw) : Number.NaN;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_POPUP_MINUTES) {
      return { error: "ระยะเวลาแสดง popup ต้องอยู่ระหว่าง 1 นาที ถึง 365 วัน" };
    }
    popupInMinutes = minutes;
  }

  let keptPhotos = existingPhotos;
  if (body.keep_photos !== undefined) {
    if (!Array.isArray(body.keep_photos)) return { error: "รายการรูปที่เก็บไว้ไม่ถูกต้อง" };
    const keepUrls = new Set(body.keep_photos);
    keptPhotos = existingPhotos.filter((photo) => keepUrls.has(photo.url));
  }
  const newPhotos = parsePhotoList(body.photos, ANNOUNCEMENT_MAX_PHOTOS);
  if (newPhotos.error) return newPhotos;
  if (keptPhotos.length + newPhotos.value.length > ANNOUNCEMENT_MAX_PHOTOS) {
    return { error: `แนบรูปได้ไม่เกิน ${ANNOUNCEMENT_MAX_PHOTOS} รูป` };
  }

  return {
    value: {
      title: body.title.trim(),
      message: body.message.trim(),
      tone,
      expiresAt,
      expiresInMinutes,
      popupInMinutes,
      keptPhotos,
      newPhotos: newPhotos.value,
    },
  };
}

const WAITING_LIST_STATUSES = new Set(["waiting", "contacted", "reserved", "closed"]);
const WAITING_LIST_REQUIRED_FIELDS = new Set(["full_name", "phone"]);
const WAITING_LIST_FIELD_VALIDATORS = {
  full_name: (value) => validateText(value, "ชื่อผู้สนใจ", { maxLength: 255 }),
  phone: (value) =>
    validateText(value, "เบอร์โทรศัพท์", { maxLength: 20 }) ||
    (/^[0-9+\-\s]{9,20}$/.test(value.trim()) ? null : "เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9-20 หลัก)"),
  room_preference: (value) => validateText(value, "ประเภทห้องที่สนใจ", { maxLength: 100, required: false }),
  note: (value) => validateText(value, "หมายเหตุ", { maxLength: 500, required: false }),
  desired_move_in_date: (value) =>
    value === "" || value === null || isValidDateString(value) ? null : "วันที่ต้องการเข้าอยู่ไม่ถูกต้อง",
  status: (value) => (WAITING_LIST_STATUSES.has(value) ? null : "สถานะไม่ถูกต้อง"),
};

export function parseWaitingListInput(body = {}, { partial = false } = {}) {
  const value = {};
  for (const [field, validate] of Object.entries(WAITING_LIST_FIELD_VALIDATORS)) {
    if (!partial && field === "status") continue;
    if (!hasField(body, field)) {
      if (!partial && WAITING_LIST_REQUIRED_FIELDS.has(field)) return { error: validate(undefined) };
      continue;
    }
    const error = validate(body[field]);
    if (error) return { error };
    value[field] = typeof body[field] === "string" ? body[field].trim() || null : null;
  }
  return { value };
}

const MOVE_OUT_CHECKLIST_KEYS = ["walls", "floor", "ceiling", "doors", "windows", "electrical", "bathroom", "furniture"];
const MOVE_OUT_MAX_PHOTOS = 15;
const MOVE_OUT_RESULTS = new Set(["good", "wear", "damaged", "missing", "not_applicable"]);
const MOVE_OUT_ISSUE_RESULTS = new Set(["damaged", "missing"]);
export const MOVE_OUT_INSPECTION_STATUSES = new Set(["pending", "reviewed", "follow_up"]);

function parseMoveOutChecklistAndNote(body) {
  const checklist = {};
  for (const key of MOVE_OUT_CHECKLIST_KEYS) {
    const result = body.checklist?.[key];
    if (!MOVE_OUT_RESULTS.has(result)) return { error: "กรุณาตรวจและเลือกผลให้ครบทุกหัวข้อ" };
    checklist[key] = result;
  }
  const noteError = validateText(body.damage_note, "รายละเอียดความเสียหาย", { maxLength: 1000, required: false });
  if (noteError) return { error: noteError };
  const damageNote = typeof body.damage_note === "string" ? body.damage_note.trim() : "";
  const assets = body.assets === undefined ? { value: null } : parseAssetList(body.assets, { withResult: true, withMoveInResult: true });
  if (assets.error) return assets;
  const itemCosts = parseItemCosts(body.item_costs, checklist);
  if (itemCosts.error) return itemCosts;
  const hasIssue = [...Object.values(checklist), ...(assets.value || []).map((asset) => asset.result)]
    .some((result) => MOVE_OUT_ISSUE_RESULTS.has(result));
  if (hasIssue && !damageNote) {
    return { error: "กรุณาระบุรายการและตำแหน่งที่ชำรุดหรือสูญหาย" };
  }
  const computedCents = itemCosts.value || assets.value
    ? Object.values(itemCosts.value || {}).reduce((sum, cost) => sum + Math.round(cost * 100), 0)
      + (assets.value || []).reduce((sum, asset) => sum + Math.round((asset.cost || 0) * 100), 0)
    : null;
  const damageCost = body.damage_cost === undefined && computedCents !== null ? { value: computedCents } : parseDamageCost(body.damage_cost);
  if (damageCost.error) return damageCost;
  if (damageCost.value > 99999999) return { error: "ค่าเสียหายสูงเกินไป" };
  if (damageCost.value > 0 && !damageNote) {
    return { error: "กรุณาระบุรายการความเสียหายที่คิดค่าเสียหาย" };
  }
  return {
    value: { checklist, assets: assets.value, itemCosts: itemCosts.value, damageNote: damageNote || null, damageCostCents: damageCost.value },
    hasIssue,
  };
}

const COSTED_RESULTS = new Set(["wear", "damaged", "missing"]);

function parseItemCosts(itemCosts, checklist) {
  if (itemCosts === undefined || itemCosts === null) return { value: null };
  if (typeof itemCosts !== "object" || Array.isArray(itemCosts)) return { error: "ค่าเสียหายรายหัวข้อไม่ถูกต้อง" };
  const value = {};
  for (const key of MOVE_OUT_CHECKLIST_KEYS) {
    if (!COSTED_RESULTS.has(checklist[key]) || itemCosts[key] === undefined) continue;
    const cost = parseDamageCost(itemCosts[key]);
    if (cost.error) return cost;
    if (cost.value > 0) value[key] = cost.value / 100;
  }
  return { value };
}

export function parseDamageCost(value) {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return { value: 0 };
  const amount = Number(typeof value === "string" ? value.replace(/,/g, "").trim() : value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || cents < 0) {
    return { error: "ค่าเสียหายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" };
  }
  if (Math.abs(amount * 100 - cents) > 1e-6) return { error: "ค่าเสียหายระบุทศนิยมได้ไม่เกิน 2 ตำแหน่ง" };
  if (cents > 99999999) return { error: "ค่าเสียหายสูงเกินไป" };
  return { value: cents };
}

export function parseMoveOutInspectionInput(body = {}) {
  const roomNumber = Number(body.room_number);
  if (!Number.isInteger(roomNumber) || roomNumber < 100 || roomNumber > 999) {
    return { error: "เลขห้องไม่ถูกต้อง" };
  }
  const core = parseMoveOutChecklistAndNote(body);
  if (core.error) return core;
  const photos = parsePhotoList(body.photos, MOVE_OUT_MAX_PHOTOS);
  if (photos.error) return photos;
  if (core.hasIssue && photos.value.length === 0) {
    return { error: "กรุณาแนบภาพประกอบกรณีพบรายการชำรุดหรือสูญหาย" };
  }
  return { value: { roomNumber, ...core.value, photos: photos.value } };
}

export function parseMoveOutInspectionUpdate(body = {}, existingPhotos = []) {
  const core = parseMoveOutChecklistAndNote(body);
  if (core.error) return core;
  let keptPhotos = existingPhotos;
  if (body.keep_photos !== undefined) {
    if (!Array.isArray(body.keep_photos)) return { error: "รายการรูปที่เก็บไว้ไม่ถูกต้อง" };
    const keepUrls = new Set(body.keep_photos);
    keptPhotos = existingPhotos.filter((photo) => keepUrls.has(photo.url));
  }
  const newPhotos = parsePhotoList(body.photos, MOVE_OUT_MAX_PHOTOS);
  if (newPhotos.error) return newPhotos;
  if (keptPhotos.length + newPhotos.value.length > MOVE_OUT_MAX_PHOTOS) {
    return { error: `แนบรูปได้ไม่เกิน ${MOVE_OUT_MAX_PHOTOS} รูป` };
  }
  if (core.hasIssue && keptPhotos.length + newPhotos.value.length === 0) {
    return { error: "กรุณาแนบภาพประกอบกรณีพบรายการชำรุดหรือสูญหาย" };
  }
  return { value: { ...core.value, keptPhotos, newPhotos: newPhotos.value } };
}

const ROOM_TYPE_MAX_ASSETS = 50;

function parseAssetPrice(value) {
  const price = parseDamageCost(value);
  if (price.error) return { error: price.error.replace("ค่าเสียหาย", "ราคาทรัพย์สิน") };
  return { value: price.value / 100 };
}

function parseAssetList(assets, { withResult = false, withMoveInResult = false } = {}) {
  if (assets === undefined || assets === null) return { value: [] };
  if (!Array.isArray(assets) || assets.length > ROOM_TYPE_MAX_ASSETS) {
    return { error: `ระบุรายการทรัพย์สินได้ไม่เกิน ${ROOM_TYPE_MAX_ASSETS} รายการ` };
  }
  const value = [];
  const names = new Set();
  for (const asset of assets) {
    const nameError = validateText(asset?.name, "ชื่อทรัพย์สิน", { maxLength: 100 });
    if (nameError) return { error: nameError };
    const name = asset.name.trim();
    if (names.has(name)) return { error: `รายการทรัพย์สิน "${name}" ซ้ำกัน` };
    names.add(name);
    const price = parseAssetPrice(asset.price);
    if (price.error) return price;
    const item = { name, price: price.value };
    if (withResult) {
      if (!MOVE_OUT_RESULTS.has(asset.result)) return { error: `กรุณาเลือกผลตรวจของ "${name}"` };
      item.result = asset.result;
    }
    if (withMoveInResult) {
      const moveInResult = asset.move_in_result ?? null;
      if (moveInResult !== null && !MOVE_OUT_RESULTS.has(moveInResult)) return { error: `ผลตรวจก่อนเข้าอยู่ของ "${name}" ไม่ถูกต้อง` };
      item.move_in_result = moveInResult;
      if (COSTED_RESULTS.has(item.result) && asset.cost !== undefined && asset.cost !== null && asset.cost !== "") {
        const cost = parseDamageCost(asset.cost);
        if (cost.error) return { error: `ค่าเสียหายของ "${name}": ${cost.error}` };
        if (cost.value > 0) item.cost = cost.value / 100;
      }
    }
    value.push(item);
  }
  return { value };
}

export function parseRoomTypeInput(body = {}) {
  const error =
    validateText(body.name, "ชื่อประเภทห้อง", { maxLength: 100 }) ||
    validateText(body.description, "รายละเอียดประเภทห้อง", { maxLength: 500, required: false });
  if (error) return { error };
  const assets = parseAssetList(body.assets);
  if (assets.error) return assets;
  const roomNumbers = body.room_numbers ?? [];
  if (!Array.isArray(roomNumbers) || roomNumbers.some((room) => !Number.isInteger(Number(room)) || Number(room) < 100 || Number(room) > 999)) {
    return { error: "รายการห้องไม่ถูกต้อง" };
  }
  return {
    value: {
      name: body.name.trim(),
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      assets: assets.value,
      roomNumbers: [...new Set(roomNumbers.map(Number))],
    },
  };
}

export function parseRoomAssetsInput(body = {}) {
  const roomTypeId = body.room_type_id === null || body.room_type_id === undefined || body.room_type_id === "" ? null : Number(body.room_type_id);
  if (roomTypeId !== null && !isPositiveId(roomTypeId)) return { error: "ประเภทห้องไม่ถูกต้อง" };
  const assets = parseAssetList(body.assets);
  if (assets.error) return assets;
  return { value: { roomTypeId, assets: assets.value } };
}

const MOVE_IN_MAX_DATES = 31;

function parseInspectionDates(body) {
  const raw = Array.isArray(body.inspection_dates) ? body.inspection_dates : [body.inspection_date];
  if (raw.length === 0 || raw.length > MOVE_IN_MAX_DATES) {
    return { error: raw.length === 0 ? "กรุณาเลือกวันที่ตรวจอย่างน้อย 1 วัน" : `เลือกวันที่ตรวจได้ไม่เกิน ${MOVE_IN_MAX_DATES} วัน` };
  }
  if (raw.some((value) => !isValidDateString(value))) return { error: "วันที่ตรวจไม่ถูกต้อง" };
  return { value: [...new Set(raw)].sort() };
}

function parseMoveInChecklistAndAssets(body) {
  const dates = parseInspectionDates(body);
  if (dates.error) return dates;
  const checklist = {};
  for (const key of MOVE_OUT_CHECKLIST_KEYS) {
    const result = body.checklist?.[key];
    if (!MOVE_OUT_RESULTS.has(result)) return { error: "กรุณาตรวจและเลือกผลให้ครบทุกหัวข้อ" };
    checklist[key] = result;
  }
  const assets = parseAssetList(body.assets, { withResult: true });
  if (assets.error) return assets;
  const noteError = validateText(body.note, "รายละเอียด", { maxLength: 1000, required: false });
  if (noteError) return { error: noteError };
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const hasIssue = [...Object.values(checklist), ...assets.value.map((asset) => asset.result)]
    .some((result) => MOVE_OUT_ISSUE_RESULTS.has(result));
  if (hasIssue && !note) return { error: "กรุณาระบุรายการและตำแหน่งที่ชำรุดหรือสูญหาย" };
  return {
    value: { inspectionDate: dates.value[dates.value.length - 1], inspectionDates: dates.value, checklist, assets: assets.value, note: note || null },
    hasIssue,
  };
}

export function parseMoveInInspectionInput(body = {}) {
  const roomNumber = Number(body.room_number);
  if (!Number.isInteger(roomNumber) || roomNumber < 100 || roomNumber > 999) {
    return { error: "เลขห้องไม่ถูกต้อง" };
  }
  const customerId = body.customer_id === undefined || body.customer_id === null ? null : Number(body.customer_id);
  if (customerId !== null && !isPositiveId(customerId)) return { error: "ผู้เช่าไม่ถูกต้อง" };
  const core = parseMoveInChecklistAndAssets(body);
  if (core.error) return core;
  const photos = parsePhotoList(body.photos, MOVE_OUT_MAX_PHOTOS);
  if (photos.error) return photos;
  if (core.hasIssue && photos.value.length === 0) {
    return { error: "กรุณาแนบภาพประกอบกรณีพบรายการชำรุดหรือสูญหาย" };
  }
  return { value: { roomNumber, customerId, ...core.value, photos: photos.value } };
}

export function parseMoveInInspectionUpdate(body = {}, existingPhotos = []) {
  const core = parseMoveInChecklistAndAssets(body);
  if (core.error) return core;
  let keptPhotos = existingPhotos;
  if (body.keep_photos !== undefined) {
    if (!Array.isArray(body.keep_photos)) return { error: "รายการรูปที่เก็บไว้ไม่ถูกต้อง" };
    const keepUrls = new Set(body.keep_photos);
    keptPhotos = existingPhotos.filter((photo) => keepUrls.has(photo.url));
  }
  const newPhotos = parsePhotoList(body.photos, MOVE_OUT_MAX_PHOTOS);
  if (newPhotos.error) return newPhotos;
  if (keptPhotos.length + newPhotos.value.length > MOVE_OUT_MAX_PHOTOS) {
    return { error: `แนบรูปได้ไม่เกิน ${MOVE_OUT_MAX_PHOTOS} รูป` };
  }
  if (core.hasIssue && keptPhotos.length + newPhotos.value.length === 0) {
    return { error: "กรุณาแนบภาพประกอบกรณีพบรายการชำรุดหรือสูญหาย" };
  }
  return { value: { ...core.value, keptPhotos, newPhotos: newPhotos.value } };
}

const DEPOSIT_SETTLEMENT_ACTIONS = new Set(["refund", "forfeit"]);

export function parseDepositSettlementInput(body = {}, depositPaid = 0) {
  const action = body.action;
  if (!DEPOSIT_SETTLEMENT_ACTIONS.has(action)) {
    return { error: "กรุณาเลือกว่าจะคืนหรือริบเงินมัดจำ" };
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  const paidCents = Math.max(0, Math.round(Number(depositPaid) * 100) || 0);
  if (action === "forfeit") {
    if (!note) return { error: "กรุณาระบุเหตุผลที่ริบเงินมัดจำ" };
    return { value: { action, deductionCents: paidCents, refundCents: 0, note } };
  }
  const rawDeduction = body.deduction === undefined || body.deduction === null || body.deduction === "" ? 0 : Number(body.deduction);
  const deductionCents = Math.round(rawDeduction * 100);
  if (!Number.isFinite(rawDeduction) || !Number.isSafeInteger(deductionCents) || deductionCents < 0) {
    return { error: "จำนวนเงินที่หักต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" };
  }
  if (deductionCents > paidCents) {
    return { error: "จำนวนเงินที่หักต้องไม่เกินเงินมัดจำที่ชำระไว้" };
  }
  if (deductionCents > 0 && !note) {
    return { error: "กรุณาระบุรายการค่าเสียหายที่หักจากเงินมัดจำ" };
  }
  return { value: { action, deductionCents, refundCents: paidCents - deductionCents, note } };
}
