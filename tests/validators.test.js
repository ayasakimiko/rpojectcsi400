import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesSearch } from '../src/utils/search.js'
import { dateSearchSql, parseSearchDate } from '../middleware/validation.js'
import {
  MAX_MONEY,
  MESSAGES,
  digitsOnly,
  firstError,
  isPositiveId,
  isValidAge,
  isValidDateString,
  isValidDateTimeString,
  isValidIdcard,
  isValidMoney,
  isValidOtp,
  isValidPassword,
  isValidPhone,
  isValidRoomNumber,
  validateLoginForm,
  validateName,
  validatePasswordPair,
  validatePersonForm,
  validateText,
} from '../src/utils/validators.js'

const validPerson = {
  idcard: '1100200000001',
  first_name: 'สมชาย',
  last_name: 'ใจดี',
  phone: '0812345678',
  age: '25',
  password: 'secret1',
  confirmPassword: 'secret1',
}

test('digitsOnly strips non-digits and limits length', () => {
  assert.equal(digitsOnly('08-1234 5678'), '0812345678')
  assert.equal(digitsOnly('1234567890123456', 13), '1234567890123')
  assert.equal(digitsOnly(null), '')
  assert.equal(digitsOnly(12.5), '125')
})

test('isValidPhone accepts Thai 9-10 digit numbers starting with 0', () => {
  assert.equal(isValidPhone('0812345678'), true)
  assert.equal(isValidPhone('021234567'), true)
  assert.equal(isValidPhone(' 0812345678 '), true)
  assert.equal(isValidPhone('812345678'), false)
  assert.equal(isValidPhone('08123456789'), false)
  assert.equal(isValidPhone('08-12345678'), false)
  assert.equal(isValidPhone(812345678), false)
  assert.equal(isValidPhone(undefined), false)
})

test('isValidIdcard requires exactly 13 digits as a string', () => {
  assert.equal(isValidIdcard('1100200000001'), true)
  assert.equal(isValidIdcard('110020000000'), false)
  assert.equal(isValidIdcard('11002000000012'), false)
  assert.equal(isValidIdcard('110020000000a'), false)
  assert.equal(isValidIdcard(1100200000001), false)
})

test('isValidAge accepts whole numbers from 1 to 120 only', () => {
  for (const ok of [1, 25, '30', 120]) assert.equal(isValidAge(ok), true, `${ok}`)
  for (const bad of [0, 121, -1, 20.5, '', ' ', null, undefined, true, 'abc', NaN]) assert.equal(isValidAge(bad), false, `${bad}`)
})

test('isValidPassword enforces 6-128 characters', () => {
  assert.equal(isValidPassword('123456'), true)
  assert.equal(isValidPassword('x'.repeat(128)), true)
  assert.equal(isValidPassword('12345'), false)
  assert.equal(isValidPassword('x'.repeat(129)), false)
  assert.equal(isValidPassword(123456), false)
})

test('isValidOtp requires six digits', () => {
  assert.equal(isValidOtp('123456'), true)
  assert.equal(isValidOtp('12345'), false)
  assert.equal(isValidOtp('12345a'), false)
  assert.equal(isValidOtp(123456), false)
})

test('isValidRoomNumber accepts 100-999 integers', () => {
  assert.equal(isValidRoomNumber(101), true)
  assert.equal(isValidRoomNumber('999'), true)
  for (const bad of [99, 1000, 101.5, '', null, true, 'abc']) assert.equal(isValidRoomNumber(bad), false, `${bad}`)
})

test('isPositiveId rejects zero, negatives, fractions and blanks', () => {
  assert.equal(isPositiveId(1), true)
  assert.equal(isPositiveId('42'), true)
  for (const bad of [0, -1, 1.5, '', null, undefined, true, 'x']) assert.equal(isPositiveId(bad), false, `${bad}`)
})

test('isValidMoney checks range, decimals and type', () => {
  assert.equal(isValidMoney(0), true)
  assert.equal(isValidMoney('1500.50'), true)
  assert.equal(isValidMoney(MAX_MONEY), true)
  assert.equal(isValidMoney(0, { allowZero: false }), false)
  assert.equal(isValidMoney(-1), false)
  assert.equal(isValidMoney(MAX_MONEY + 1), false)
  assert.equal(isValidMoney('10.555'), false)
  assert.equal(isValidMoney('1e3'), false)
  assert.equal(isValidMoney(''), false)
  assert.equal(isValidMoney(true), false)
  assert.equal(isValidMoney(Infinity), false)
})

test('isValidDateString rejects impossible calendar dates', () => {
  assert.equal(isValidDateString('2026-02-28'), true)
  assert.equal(isValidDateString('2024-02-29'), true)
  assert.equal(isValidDateString('2026-02-29'), false)
  assert.equal(isValidDateString('2026-13-01'), false)
  assert.equal(isValidDateString('2026-1-01'), false)
  assert.equal(isValidDateString(20260101), false)
})

test('isValidDateTimeString accepts minute or second precision', () => {
  assert.equal(isValidDateTimeString('2026-10-25T08:30'), true)
  assert.equal(isValidDateTimeString('2026-10-25T08:30:15'), true)
  assert.equal(isValidDateTimeString('2026-10-25 08:30'), false)
  assert.equal(isValidDateTimeString('2026-10-25'), false)
})

test('validateText and validateName report required, type and length errors', () => {
  assert.equal(validateText('hello', 'ชื่อ', { maxLength: 10 }), null)
  assert.equal(validateText(undefined, 'ชื่อ', { maxLength: 10 }), MESSAGES.required('ชื่อ'))
  assert.equal(validateText(undefined, 'ชื่อ', { maxLength: 10, required: false }), null)
  assert.equal(validateText('   ', 'ชื่อ', { maxLength: 10 }), MESSAGES.required('ชื่อ'))
  assert.equal(validateText(5, 'ชื่อ', { maxLength: 10 }), MESSAGES.invalidFormat('ชื่อ'))
  assert.equal(validateText('x'.repeat(11), 'ชื่อ', { maxLength: 10 }), MESSAGES.tooLong('ชื่อ', 10))
  assert.equal(validateName('x'.repeat(100), 'ชื่อ'), null)
  assert.equal(validateName('x'.repeat(101), 'ชื่อ'), MESSAGES.tooLong('ชื่อ', 100))
})

test('validateLoginForm flags missing and malformed fields', () => {
  assert.deepEqual(validateLoginForm({ username: '101', password: 'secret1' }), {})
  assert.deepEqual(validateLoginForm({ username: '1100200000001', password: 'secret1' }), {})
  assert.equal(validateLoginForm({ username: '', password: '' }).username, MESSAGES.loginRequired)
  assert.equal(validateLoginForm({ username: 'abc', password: 'secret1' }).username, MESSAGES.loginUsername)
  assert.equal(validateLoginForm({ username: '101', password: '123' }).password, MESSAGES.password)
  assert.ok(validateLoginForm({ username: '101', password: '' }).password)
})

test('validatePasswordPair checks length and confirmation', () => {
  assert.deepEqual(validatePasswordPair('secret1', 'secret1'), {})
  assert.equal(validatePasswordPair('secret1', 'secret2').confirmPassword, MESSAGES.passwordMismatch)
  assert.equal(validatePasswordPair('123', '123').password, MESSAGES.password)
  assert.ok(validatePasswordPair('', '').password)
  assert.deepEqual(validatePasswordPair('', '', { required: false }), {})
})

test('validatePersonForm returns no errors for a valid person', () => {
  assert.deepEqual(validatePersonForm(validPerson), {})
})

test('validatePersonForm reports every invalid field at once', () => {
  const errors = validatePersonForm({ idcard: '123', first_name: '', last_name: 'x'.repeat(101), phone: '12', age: '200', password: '1', confirmPassword: '2' })
  assert.equal(errors.idcard, MESSAGES.idcard)
  assert.equal(errors.first_name, MESSAGES.required('ชื่อ'))
  assert.equal(errors.last_name, MESSAGES.tooLong('นามสกุล', 100))
  assert.equal(errors.phone, MESSAGES.phone)
  assert.equal(errors.age, MESSAGES.age)
  assert.equal(errors.password, MESSAGES.password)
  assert.equal(errors.confirmPassword, MESSAGES.passwordMismatch)
})

test('validatePersonForm can skip idcard and optional password for edits', () => {
  const { idcard: _idcard, password: _password, confirmPassword: _confirm, ...rest } = validPerson
  assert.deepEqual(validatePersonForm(rest, { requireIdcard: false, requirePassword: false }), {})
  assert.equal(validatePersonForm({ ...rest, password: '12' }, { requireIdcard: false, requirePassword: false }).password, MESSAGES.password)
})

test('firstError returns the first message or null', () => {
  assert.equal(firstError({}), null)
  assert.equal(firstError({ a: null, b: 'oops', c: 'later' }), 'oops')
})

test('search matches contract dates in Gregorian and Buddhist calendar formats', () => {
  const contract = {
    first_name: 'สมชาย',
    contract_completed_at: '2026-10-29T10:00:00+07:00',
    rental_end_date: '2027-10-28',
  }
  assert.equal(matchesSearch([contract.first_name], '29/10/2569', contract), true)
  assert.equal(matchesSearch([contract.first_name], '2026-10-29', contract), true)
  assert.equal(matchesSearch([contract.first_name], '28/10/2570', contract), true)
  assert.equal(matchesSearch([contract.first_name], '30/10/2569', contract), false)
  assert.equal(matchesSearch([contract.first_name], 'สมชาย', contract), true)
})

test('a typed day matches the day exactly, not digits in the year or a hidden date', () => {
  const contract = {
    first_name: 'ผู้เช่า',
    rental_start_date: '2026-10-22',
    rental_end_date: '2026-11-22',
    contract_completed_at: '2026-10-22T19:05:00+07:00',
    updated_at: '2026-10-26T09:00:00+07:00',
  }
  const visibleDates = [contract.rental_start_date, contract.rental_end_date, contract.contract_completed_at]
  assert.equal(matchesSearch([contract.first_name], '26.', contract, visibleDates), false)
  assert.equal(matchesSearch([contract.first_name], '22.', contract, visibleDates), true)
  assert.equal(matchesSearch([contract.first_name], '22/10', contract, visibleDates), true)
  assert.equal(matchesSearch([contract.first_name], '22/12', contract, visibleDates), false)
  assert.equal(matchesSearch([contract.first_name], '22/10/2569', contract, visibleDates), true)
})

test('server search parses typed dates and rejects impossible dates', () => {
  assert.equal(parseSearchDate('29/10/2569'), '2026-10-29')
  assert.equal(parseSearchDate('2026-10-29'), '2026-10-29')
  assert.equal(parseSearchDate('๒๙/๑๐/๒๕๖๙'), '2026-10-29')
  assert.equal(parseSearchDate('31/02/2569'), null)
})

test('server date search uses the exact day instead of matching text containing 26', () => {
  const day = dateSearchSql('26.', ['created_at', 'completed_at'])
  assert.deepEqual(day, {
    sql: '(DAY(created_at) = ? OR DAY(completed_at) = ?)',
    params: [26, 26],
  })
  assert.deepEqual(dateSearchSql('26/10', ['created_at']), {
    sql: '((DAY(created_at) = ? AND MONTH(created_at) = ?))',
    params: [26, 10],
  })
  assert.deepEqual(dateSearchSql('26/10/2569', ['created_at']), {
    sql: '(DATE(created_at) = ?)',
    params: ['2026-10-26'],
  })
  assert.equal(dateSearchSql('26/13', ['created_at']), null)
})
