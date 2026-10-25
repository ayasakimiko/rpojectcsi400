import { MAX_MONEY } from '../../middleware/validation.js'

export const MARKET_CONFIG_GROUPS = [
  { key: 'site', label: 'สถานที่และเวลาเปิดปิด' },
  { key: 'utility', label: 'ค่าไฟและค่าน้ำ' },
  { key: 'lease', label: 'สัญญาเช่าร้าน' },
  { key: 'api', label: 'API ภายนอก' },
  { key: 'notify', label: 'การแจ้งเตือน' },
]

export const MARKET_CONFIG_FIELDS = {
  site_name: { group: 'site', type: 'text', label: 'ชื่อสถานที่', maxLength: 100 },
  open_time: { group: 'site', type: 'time', label: 'เวลาเปิด' },
  close_time: { group: 'site', type: 'time', label: 'เวลาปิด' },
  electricity_unit_price: { group: 'utility', type: 'money', label: 'ค่าไฟต่อหน่วย (บาท)' },
  electricity_flat_price: { group: 'utility', type: 'money', label: 'ค่าไฟเหมาต่อเดือน (บาท)' },
  water_unit_price: { group: 'utility', type: 'money', label: 'ค่าน้ำต่อหน่วย (บาท)' },
  water_flat_price: { group: 'utility', type: 'money', label: 'ค่าน้ำเหมาต่อเดือน (บาท)' },
  default_deposit_months: { group: 'lease', type: 'int', label: 'เงินประกัน (เดือน)', min: 0, max: 12 },
  min_lease_months: { group: 'lease', type: 'int', label: 'สัญญาขั้นต่ำ (เดือน)', min: 1, max: 60 },
  contract_min_images: { group: 'lease', type: 'int', label: 'รูปสัญญาที่ต้องแนบขั้นต่ำ', min: 1, max: 10 },
  invoice_due_day: { group: 'lease', type: 'int', label: 'ชำระค่าเช่าภายในวันที่ของเดือน', min: 1, max: 28 },
  contract_terms: { group: 'lease', type: 'textarea', label: 'เงื่อนไขในสัญญา', maxLength: 5000 },
  default_rate_limit_per_min: { group: 'api', type: 'int', label: 'จำกัดการเรียกต่อนาที (ค่าเริ่มต้น)', min: 1, max: 6000 },
  key_default_expiry_days: { group: 'api', type: 'int', label: 'อายุ key (วัน)', min: 1, max: 3650 },
  key_rotation_grace_hours: { group: 'api', type: 'int', label: 'key เก่าใช้ต่อได้หลังหมุน (ชั่วโมง)', min: 0, max: 720 },
  log_retention_days: { group: 'api', type: 'int', label: 'เก็บ log การเรียก API (วัน)', min: 1, max: 3650 },
  max_price_change_percent: { group: 'api', type: 'int', label: 'จำกัดการเปลี่ยนราคาผ่าน API (%) ว่าง = ไม่จำกัด', min: 1, max: 100, nullable: true },
  low_stock_percent: { group: 'notify', type: 'int', label: 'แจ้งเตือนสินค้าใกล้หมดเมื่อเหลือ (%)', min: 0, max: 100 },
  key_expiry_warning_days: { group: 'notify', type: 'int', label: 'เตือน key ใกล้หมดอายุล่วงหน้า (วัน)', min: 1, max: 365 },
  lease_expiry_warning_days: { group: 'notify', type: 'int', label: 'เตือนสัญญาใกล้หมดล่วงหน้า (วัน)', min: 1, max: 365 },
  price_change_notice_days: { group: 'notify', type: 'int', label: 'แสดงการแก้ราคาผ่าน API ย้อนหลัง (วัน)', min: 1, max: 365 },
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function parseMarketConfigValue(field, value) {
  const spec = MARKET_CONFIG_FIELDS[field]
  if (!spec) return { error: `ไม่รู้จักการตั้งค่า ${field}` }
  if (spec.nullable && (value === null || value === '')) return { value: null }
  if (spec.type === 'text' || spec.type === 'textarea') {
    if (typeof value !== 'string' || !value.trim()) return { error: `กรุณาระบุ${spec.label}` }
    if (value.trim().length > spec.maxLength) return { error: `${spec.label}ยาวได้ไม่เกิน ${spec.maxLength} ตัวอักษร` }
    return { value: value.trim() }
  }
  if (spec.type === 'time') {
    return typeof value === 'string' && TIME_PATTERN.test(value) ? { value } : { error: `${spec.label}ต้องเป็นเวลา HH:MM` }
  }
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) return { error: `${spec.label}ต้องเป็นตัวเลข` }
  if (spec.type === 'money') {
    const cents = number * 100
    if (number < 0 || number > MAX_MONEY || Math.abs(cents - Math.round(cents)) > 1e-6) {
      return { error: `${spec.label}ต้องเป็นจำนวนเงินตั้งแต่ 0 ทศนิยมไม่เกิน 2 ตำแหน่ง` }
    }
    return { value: Math.round(cents) / 100 }
  }
  if (!Number.isInteger(number) || number < spec.min || number > spec.max) {
    return { error: `${spec.label}ต้องเป็นจำนวนเต็ม ${spec.min}–${spec.max}` }
  }
  return { value: number }
}
