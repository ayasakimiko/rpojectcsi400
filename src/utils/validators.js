export const MAX_MONEY = 99_999_999.99
export const MAX_NAME_LENGTH = 100
export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 128
export const AGE_MIN = 1
export const AGE_MAX = 120

export const MESSAGES = {
  required: (label) => `กรุณาระบุ${label}`,
  invalidFormat: (label) => `รูปแบบ${label}ไม่ถูกต้อง`,
  tooLong: (label, max) => `${label}ยาวเกินไป (สูงสุด ${max} ตัวอักษร)`,
  idcard: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก',
  phone: 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก',
  password: `รหัสผ่านต้องมีความยาว ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} ตัวอักษร`,
  passwordMismatch: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน',
  age: `อายุต้องเป็นตัวเลข ${AGE_MIN}-${AGE_MAX} ปี`,
  money: 'จำนวนเงินไม่ถูกต้อง',
  otp: 'กรุณากรอกรหัส OTP 6 หลัก',
  loginUsername: 'กรุณากรอกเลขบัตรประชาชน 13 หลัก หรือเลขห้อง',
  loginRequired: 'กรุณากรอกเลขบัตรประชาชนหรือเลขห้อง และรหัสผ่าน',
  roomNumber: 'เลขห้องต้องเป็นตัวเลข 3 หลัก (100-999)',
  date: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)',
}

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && !value.trim())

export const digitsOnly = (value, maxLength = Infinity) => String(value ?? '').replace(/\D/g, '').slice(0, maxLength)

export function isValidPhone(value) {
  return typeof value === 'string' && /^0\d{8,9}$/.test(value.trim())
}

export function isValidIdcard(value) {
  return typeof value === 'string' && /^\d{13}$/.test(value.trim())
}

export function isValidAge(value) {
  if (isBlank(value) || typeof value === 'boolean') return false
  const age = Number(value)
  return Number.isInteger(age) && age >= AGE_MIN && age <= AGE_MAX
}

export function isValidPassword(value) {
  return typeof value === 'string' && value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH
}

export function isValidOtp(value) {
  return typeof value === 'string' && /^\d{6}$/.test(value)
}

export function isValidRoomNumber(value) {
  if (isBlank(value) || typeof value === 'boolean') return false
  const num = Number(value)
  return Number.isInteger(num) && num >= 100 && num <= 999
}

export function isPositiveId(value) {
  if (isBlank(value) || typeof value === 'boolean') return false
  const id = Number(value)
  return Number.isSafeInteger(id) && id >= 1
}

export function isValidMoney(value, { allowZero = true, max = MAX_MONEY } = {}) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return false
  const num = Number(value)
  if (!Number.isFinite(num)) return false
  if (typeof value === 'string' && !/^\d+(\.\d{1,2})?$/.test(value.trim())) return false
  return (allowZero ? num >= 0 : num > 0) && num <= max
}

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isValidDateTimeString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) && !Number.isNaN(new Date(value).getTime())
}

export function validateText(value, label, { maxLength, required = true }) {
  if (value === undefined || value === null) return required ? MESSAGES.required(label) : null
  if (typeof value !== 'string') return MESSAGES.invalidFormat(label)
  if (required && !value.trim()) return MESSAGES.required(label)
  if (value.trim().length > maxLength) return MESSAGES.tooLong(label, maxLength)
  return null
}

export function validateName(value, label) {
  return validateText(value, label, { maxLength: MAX_NAME_LENGTH })
}

export function firstError(errors) {
  return Object.values(errors).find(Boolean) || null
}

export function validateLoginForm({ username, password } = {}) {
  const errors = {}
  if (isBlank(username)) errors.username = MESSAGES.loginRequired
  else if (!/^\d{1,13}$/.test(String(username).trim())) errors.username = MESSAGES.loginUsername
  if (!password) errors.password = 'กรุณากรอกรหัสผ่าน'
  else if (!isValidPassword(password)) errors.password = MESSAGES.password
  return errors
}

export function validatePasswordPair(password, confirmPassword, { required = true } = {}) {
  const errors = {}
  if (!password) {
    if (required) errors.password = 'กรุณากรอกรหัสผ่าน'
  } else if (!isValidPassword(password)) {
    errors.password = MESSAGES.password
  }
  if ((password || required) && password !== confirmPassword) {
    errors.confirmPassword = confirmPassword ? MESSAGES.passwordMismatch : 'กรุณายืนยันรหัสผ่าน'
  }
  return errors
}

export function validatePersonForm(values = {}, { requirePassword = true, requireIdcard = true } = {}) {
  const errors = {}
  if (requireIdcard) {
    if (isBlank(values.idcard)) errors.idcard = MESSAGES.required('เลขบัตรประชาชน')
    else if (!isValidIdcard(values.idcard)) errors.idcard = MESSAGES.idcard
  }
  const firstName = validateName(values.first_name, 'ชื่อ')
  if (firstName) errors.first_name = firstName
  const lastName = validateName(values.last_name, 'นามสกุล')
  if (lastName) errors.last_name = lastName
  if (isBlank(values.phone)) errors.phone = MESSAGES.required('เบอร์โทรศัพท์')
  else if (!isValidPhone(values.phone)) errors.phone = MESSAGES.phone
  if (isBlank(values.age)) errors.age = MESSAGES.required('อายุ')
  else if (!isValidAge(values.age)) errors.age = MESSAGES.age
  if (requirePassword || values.password) {
    Object.assign(errors, validatePasswordPair(values.password, values.confirmPassword ?? values.password, { required: requirePassword }))
  }
  return errors
}
