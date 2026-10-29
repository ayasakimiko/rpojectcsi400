import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesSearch } from '../src/utils/search.js'
import { parseSearchDate } from '../middleware/validation.js'
import { dateSearchSql } from '../router/searchDates.js'

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
