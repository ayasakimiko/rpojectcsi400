import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidMoney,
  lookup,
  normalizePersonUpdate,
  parseDamageCost,
  parseMaintenanceInput,
  parsePage,
  parsePhotoList,
  parseSearch,
  parseTenantRequestInput,
  parseUtilityBillInput,
  parseYearMonthQuery,
  validateDateQuery,
  validateExpenseInput,
  validateLoginInput,
  validatePersonInput,
  validatePersonUpdateInput,
  validateRegisterInput,
  validateRoomFields,
} from '../middleware/validation.js'
import { MESSAGES } from '../src/utils/validators.js'

const person = {
  idcard: '1100200000001',
  password: 'secret1',
  phone: '0812345678',
  first_name: 'สมชาย',
  last_name: 'ใจดี',
  age: 25,
}

const localDate = (offsetDays) => {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

test('parsePage falls back to 1 for invalid pages', () => {
  assert.equal(parsePage('3'), 3)
  for (const bad of ['0', '-2', '1.5', 'abc', undefined, '100001']) assert.equal(parsePage(bad), 1, `${bad}`)
})

test('parseSearch trims and caps length', () => {
  assert.equal(parseSearch('  ห้อง 101  '), 'ห้อง 101')
  assert.equal(parseSearch('x'.repeat(150)).length, 100)
  assert.equal(parseSearch(['array']), '')
})

test('lookup ignores inherited keys and non-string keys', () => {
  const map = { renew: 'ต่อสัญญา' }
  assert.equal(lookup(map, 'renew'), 'ต่อสัญญา')
  assert.equal(lookup(map, 'toString'), undefined)
  assert.equal(lookup(map, ['renew']), undefined)
})

test('validateDateQuery only checks provided keys', () => {
  assert.equal(validateDateQuery({ from: '2026-10-01', to: '' }, ['from', 'to']), null)
  assert.equal(validateDateQuery({ from: '2026-02-30' }, ['from']), MESSAGES.date)
})

test('parseYearMonthQuery validates year and month ranges', () => {
  assert.deepEqual(parseYearMonthQuery({ year: '2026', month: '10' }), { year: 2026, month: 10 })
  assert.equal(parseYearMonthQuery({ year: '2026', month: '13' }), null)
  assert.equal(parseYearMonthQuery({ year: '26', month: '1' }), null)
})

test('server isValidMoney rejects blanks, booleans and negatives', () => {
  assert.equal(isValidMoney('3500'), true)
  assert.equal(isValidMoney(0), true)
  assert.equal(isValidMoney(0, { allowZero: false }), false)
  for (const bad of ['', null, true, -1, 'abc', Infinity]) assert.equal(isValidMoney(bad), false, `${bad}`)
})

test('validatePersonInput accepts a complete person and rejects each bad field', () => {
  assert.equal(validatePersonInput(person), null)
  assert.equal(validatePersonInput({ ...person, idcard: '123' }), MESSAGES.idcard)
  assert.equal(validatePersonInput({ ...person, password: '123' }), MESSAGES.password)
  assert.equal(validatePersonInput({ ...person, phone: '1234' }), MESSAGES.phone)
  assert.equal(validatePersonInput({ ...person, age: 0 }), MESSAGES.age)
  assert.equal(validatePersonInput({ ...person, first_name: 'x'.repeat(101) }), MESSAGES.tooLong('ชื่อ', 100))
  assert.equal(validatePersonInput({ ...person, phone: 812345678 }), 'รูปแบบข้อมูลไม่ถูกต้อง')
  assert.equal(validatePersonInput({ ...person, first_name: '  ' }), 'กรุณากรอกข้อมูลให้ครบทุกช่อง')
  assert.equal(validatePersonInput({ ...person, age: '' }), 'กรุณากรอกข้อมูลให้ครบทุกช่อง')
})

test('validatePersonUpdateInput only validates fields that are present', () => {
  assert.equal(validatePersonUpdateInput({}), null)
  assert.equal(validatePersonUpdateInput({ phone: '0812345678' }), null)
  assert.equal(validatePersonUpdateInput({ phone: 'bad' }), MESSAGES.phone)
  assert.equal(validatePersonUpdateInput({ age: 500 }), MESSAGES.age)
  assert.equal(validatePersonUpdateInput({ password: '' }), null)
  assert.equal(validatePersonUpdateInput({ password: '12' }), MESSAGES.password)
  assert.equal(validatePersonUpdateInput({ last_name: '' }), MESSAGES.required('นามสกุล'))
})

test('normalizePersonUpdate trims text and converts age', () => {
  assert.deepEqual(normalizePersonUpdate({ first_name: ' A ', phone: ' 0812345678 ', age: '30' }), { first_name: 'A', phone: '0812345678', age: 30 })
})

test('validateRoomFields checks each provided room field', () => {
  assert.equal(validateRoomFields({ room_number: 101, price: 3500, bed: 1, wifi: true }), null)
  assert.match(validateRoomFields({ room_number: 1000 }), /เลขห้อง/)
  assert.match(validateRoomFields({ price: -5 }), /ราคา/)
  assert.match(validateRoomFields({ bed: 100 }), /เตียง/)
  assert.match(validateRoomFields({ wifi: 'yes' }), /สิ่งอำนวยความสะดวก/)
  assert.match(validateRoomFields({ electricity_unit_price: 150 }), /ค่าไฟ/)
  assert.equal(validateRoomFields({ room_size: '' }), null)
  assert.match(validateRoomFields({ custom_amenities: ['A', 'a'] }), /ไม่ซ้ำกัน/)
})

test('validateLoginInput guards type, emptiness and format', () => {
  assert.equal(validateLoginInput({ username: '101', password: 'secret1' }), null)
  assert.equal(validateLoginInput({ username: 101, password: 'secret1' }), 'รูปแบบข้อมูลไม่ถูกต้อง')
  assert.match(validateLoginInput({ username: '', password: '' }), /กรุณากรอก/)
  assert.match(validateLoginInput({ username: 'admin', password: 'secret1' }), /ถูกต้อง/)
  assert.match(validateLoginInput({ username: '101', password: '1' }), /ไม่ถูกต้อง/)
})

test('validateRegisterInput validates dates, room and deposit', () => {
  const body = { ...person, room_number: '101', rental_start_date: '2026-11-01T12:00', rental_end_date: '2027-11-01T12:00' }
  assert.equal(validateRegisterInput(body), null)
  assert.equal(validateRegisterInput({ ...body, room_number: '' }), 'กรุณากรอกข้อมูลให้ครบทุกช่อง')
  assert.equal(validateRegisterInput({ ...body, room_number: '1001' }), 'เลขห้องไม่ถูกต้อง')
  assert.match(validateRegisterInput({ ...body, rental_end_date: '2026-10-01T12:00' }), /ต้องอยู่หลัง/)
  assert.match(validateRegisterInput({ ...body, rental_start_date: 'tomorrow' }), /ไม่ถูกต้อง/)
  assert.equal(validateRegisterInput({ ...body, deposit_amount: -1 }), 'จำนวนเงินมัดจำไม่ถูกต้อง')
  assert.equal(validateRegisterInput({ ...body, idcard: '1' }), MESSAGES.idcard)
})

test('validateExpenseInput validates full and partial updates', () => {
  const expense = { category: 'ซ่อมบำรุง', amount: '500', expense_date: '2026-10-20', payment_method: 'cash' }
  assert.equal(validateExpenseInput(expense, { partial: false }), null)
  assert.equal(validateExpenseInput({ ...expense, amount: '0' }, { partial: false }), 'จำนวนเงินไม่ถูกต้อง')
  assert.equal(validateExpenseInput({ ...expense, expense_date: '2026-02-31' }, { partial: false }), 'วันที่ไม่ถูกต้อง')
  assert.equal(validateExpenseInput({ ...expense, payment_method: 'bitcoin' }, { partial: false }), 'วิธีชำระเงินไม่ถูกต้อง')
  assert.equal(validateExpenseInput({ ...expense, room_number: '50' }, { partial: false }), 'เลขห้องไม่ถูกต้อง')
  assert.equal(validateExpenseInput({ amount: '120' }, { partial: true }), null)
  assert.match(validateExpenseInput({ category: '' }, { partial: true }), /หมวดหมู่/)
})

test('parseMaintenanceInput normalizes enums and validates text and phone', () => {
  assert.deepEqual(parseMaintenanceInput({ description: ' แอร์เสีย ', category: 'aircon', preferredTime: 'morning', contactPhone: '081-234-5678' }).value, {
    description: 'แอร์เสีย',
    category: 'aircon',
    preferredTime: 'morning',
    contactPhone: '081-234-5678',
  })
  assert.equal(parseMaintenanceInput({ description: 'x', category: 'hack' }).value.category, 'other')
  assert.ok(parseMaintenanceInput({ description: '' }).error)
  assert.ok(parseMaintenanceInput({ description: 'x'.repeat(501) }).error)
  assert.ok(parseMaintenanceInput({ description: 'ok', contactPhone: 'call me' }).error)
})

test('parseTenantRequestInput validates each request type', () => {
  assert.ok(parseTenantRequestInput({ type: 'hack' }).error)
  assert.equal(parseTenantRequestInput({ type: 'renew', renew_duration_months: '6' }).value.renewDurationMonths, 6)
  assert.ok(parseTenantRequestInput({ type: 'renew', renew_duration_months: '5' }).error)
  assert.ok(parseTenantRequestInput({ type: 'moveout', preferred_move_date: localDate(5) }).error)
  assert.equal(parseTenantRequestInput({ type: 'moveout', note: 'ย้ายงาน', preferred_move_date: localDate(5) }).value.preferredMoveDate, localDate(5))
  assert.ok(parseTenantRequestInput({ type: 'moveout', note: 'ย้ายงาน', preferred_move_date: localDate(-1) }).error)
  assert.ok(parseTenantRequestInput({ type: 'moveout', note: 'ย้ายงาน', preferred_move_date: localDate(61) }).error)
  const moveRoom = { type: 'move_room', target_room_number: '102', move_reason: 'noise', preferred_move_date: localDate(3) }
  assert.equal(parseTenantRequestInput(moveRoom).value.targetRoomNumber, 102)
  assert.ok(parseTenantRequestInput({ ...moveRoom, move_reason: 'other' }).error)
  assert.ok(parseTenantRequestInput({ ...moveRoom, target_room_number: '9' }).error)
})

test('parseUtilityBillInput enforces one method per utility and at least one value', () => {
  assert.deepEqual(parseUtilityBillInput({ electricity_units: '120', water_amount: '100' }).value, {
    electricityUnits: 120,
    electricityAmount: null,
    waterAmount: 100,
    waterUnits: null,
  })
  assert.ok(parseUtilityBillInput({}).error)
  assert.ok(parseUtilityBillInput({ electricity_units: '10', electricity_amount: '80' }).error)
  assert.ok(parseUtilityBillInput({ water_units: '5', water_amount: '50' }).error)
  assert.ok(parseUtilityBillInput({ electricity_units: '-3' }).error)
  assert.ok(parseUtilityBillInput({ water_amount: '0' }).error)
})

test('parsePhotoList only accepts image data URLs within the limit', () => {
  const photo = { name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' }
  assert.deepEqual(parsePhotoList(undefined), { value: [] })
  assert.equal(parsePhotoList([photo]).value[0].name, 'a.png')
  assert.equal(parsePhotoList([{ dataUrl: photo.dataUrl }]).value[0].name, 'photo.jpg')
  assert.ok(parsePhotoList([{ dataUrl: 'data:text/html;base64,AAAA' }]).error)
  assert.ok(parsePhotoList(Array(7).fill(photo)).error)
  assert.ok(parsePhotoList('not-an-array').error)
})

test('parseDamageCost converts baht to cents with two decimals max', () => {
  assert.deepEqual(parseDamageCost(''), { value: 0 })
  assert.deepEqual(parseDamageCost('1,250.50'), { value: 125050 })
  assert.ok(parseDamageCost('-1').error)
  assert.ok(parseDamageCost('10.555').error)
  assert.ok(parseDamageCost('abc').error)
  assert.ok(parseDamageCost(1_000_000).error)
})
