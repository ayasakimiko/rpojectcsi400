import { parseSearchDate } from '../middleware/validation.js'

export function dateSearchSql(search, columns) {
  const fullDate = parseSearchDate(search)
  const text = String(search ?? '').trim().replace(/[๐-๙]/g, (digit) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)))
  const dayOnly = /^(\d{1,2})\.$/.exec(text)
  const dayMonth = /^(\d{1,2})[./-](\d{1,2})\.?$/.exec(text)
  const day = Number(dayOnly?.[1] ?? dayMonth?.[1])
  const month = dayMonth ? Number(dayMonth[2]) : null
  if (!fullDate && (!day || day > 31 || (month !== null && (month < 1 || month > 12)))) return null

  const params = []
  const sql = columns.map((column) => {
    if (fullDate) {
      params.push(fullDate)
      return `DATE(${column}) = ?`
    }
    params.push(day)
    if (!month) return `DAY(${column}) = ?`
    params.push(month)
    return `(DAY(${column}) = ? AND MONTH(${column}) = ?)`
  }).join(' OR ')
  return { sql: `(${sql})`, params }
}
