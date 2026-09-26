// DECIMAL(10,2) upper bound; anything larger makes MySQL throw instead of returning a 400.
export const MAX_MONEY = 99_999_999.99;
export const MAX_NAME_LENGTH = 100;
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

export function isPositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 1;
}

export function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateDateQuery(query, keys) {
  for (const key of keys) {
    const value = query[key];
    if (value === undefined || value === "") continue;
    if (!isValidDateString(value)) {
      return "รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)";
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

export function validateText(value, label, { maxLength, required = true }) {
  if (value === undefined || value === null) {
    return required ? `กรุณาระบุ${label}` : null;
  }
  if (typeof value !== "string") return `รูปแบบ${label}ไม่ถูกต้อง`;
  if (required && !value.trim()) return `กรุณาระบุ${label}`;
  if (value.trim().length > maxLength) return `${label}ยาวเกินไป (สูงสุด ${maxLength} ตัวอักษร)`;
  return null;
}

export function validateName(value, label) {
  return validateText(value, label, { maxLength: MAX_NAME_LENGTH });
}

export function isValidPhone(value) {
  return typeof value === "string" && /^0\d{8,9}$/.test(value.trim());
}

export function isValidIdcard(value) {
  return typeof value === "string" && /^\d{13}$/.test(value.trim());
}

export function isValidAge(value) {
  const age = Number(value);
  return Number.isInteger(age) && age >= 1 && age <= 120;
}

export function isValidPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= 128;
}

export function validatePersonInput({ idcard, password, phone, first_name, last_name, age }) {
  const textFields = [idcard, password, phone, first_name, last_name];
  if (textFields.some((value) => value !== undefined && value !== null && typeof value !== "string")) {
    return "รูปแบบข้อมูลไม่ถูกต้อง";
  }
  if (textFields.some((value) => !value || !value.trim()) || age === undefined || age === null || age === "") {
    return "กรุณากรอกข้อมูลให้ครบทุกช่อง";
  }
  if (!isValidIdcard(idcard)) return "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
  if (!isValidPassword(password)) return "รหัสผ่านต้องมีความยาว 6-128 ตัวอักษร";
  if (!isValidPhone(phone)) return "เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก";
  return validateName(first_name, "ชื่อ") || validateName(last_name, "นามสกุล") || (isValidAge(age) ? null : "อายุไม่ถูกต้อง");
}

// Checks only the fields present in a partial-update body.
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
    return "เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก";
  }
  if (hasField(body, "age") && !isValidAge(body.age)) {
    return "อายุไม่ถูกต้อง";
  }
  if (hasField(body, "password") && body.password !== "" && body.password !== null && !isValidPassword(body.password)) {
    return "รหัสผ่านต้องมีความยาว 6-128 ตัวอักษร";
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
  water_price: (value) => {
    const num = Number(value);
    return value !== null && value !== "" && Number.isFinite(num) && num >= 0 && num <= 999.99
      ? null
      : "ค่าน้ำ/เดือนต้องเป็นตัวเลข 3 หลัก (0-999.99)";
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

export function isValidDateTimeString(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
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

const EXPENSE_FIELD_VALIDATORS = {
  category: (value) => validateText(value, "หมวดหมู่รายจ่าย", { maxLength: 50 }),
  description: (value) => validateText(value, "คำอธิบาย", { maxLength: 255, required: false }),
  amount: (value) => (isValidMoney(value, { allowZero: false }) ? null : "จำนวนเงินไม่ถูกต้อง"),
  expense_date: (value) => (isValidDateString(value) ? null : "วันที่ไม่ถูกต้อง"),
};

export function validateExpenseInput(body, { partial }) {
  for (const [field, validate] of Object.entries(EXPENSE_FIELD_VALIDATORS)) {
    if (partial && !hasField(body, field)) continue;
    const error = validate(body[field]);
    if (error) return error;
  }
  return null;
}

const MAINTENANCE_CATEGORIES = new Set(["electrical", "plumbing", "aircon", "furniture", "other"]);
const MAINTENANCE_TIME_SLOTS = new Set(["anytime", "morning", "afternoon", "evening"]);

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

const REQUEST_TYPES = new Set(["renew", "moveout"]);
const RENEW_DURATION_MONTHS = new Set([1, 3, 6, 12]);
const RENEW_PAYMENT_TYPES = new Set(["monthly", "lump_sum"]);

export function parseTenantRequestInput(body = {}) {
  const { type } = body;
  if (!REQUEST_TYPES.has(type)) {
    return { error: "ประเภทคำขอไม่ถูกต้อง" };
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  if (type !== "renew") {
    return { value: { type, note, renewDurationMonths: null, renewPaymentType: null } };
  }

  const renewDurationMonths = Number(body.renew_duration_months);
  if (!RENEW_DURATION_MONTHS.has(renewDurationMonths)) {
    return { error: "กรุณาเลือกระยะเวลาที่ต้องการต่อสัญญา" };
  }
  const renewPaymentType = body.renew_payment_type;
  if (!RENEW_PAYMENT_TYPES.has(renewPaymentType)) {
    return { error: "กรุณาเลือกรูปแบบการชำระเงิน" };
  }
  if (renewPaymentType === "lump_sum" && renewDurationMonths <= 1) {
    return { error: "จ่ายล่วงหน้าทั้งก้อนเลือกได้เฉพาะระยะเวลาต่อสัญญามากกว่า 1 เดือน" };
  }
  return { value: { type, note, renewDurationMonths, renewPaymentType } };
}

export function parseUtilityBillInput(body = {}) {
  const isFilled = (raw) => raw !== undefined && raw !== "" && raw !== null;
  const { electricity_units: unitsRaw, electricity_amount: amountRaw, water_amount: waterRaw } = body;

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
  if (electricityUnits === null && electricityAmount === null && waterAmount === null) {
    return { error: "กรุณากรอกค่าไฟฟ้าหรือค่าน้ำอย่างน้อยหนึ่งรายการ" };
  }
  return { value: { electricityUnits, electricityAmount, waterAmount } };
}
