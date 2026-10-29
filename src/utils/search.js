const DATE_FIELD = /(?:^date$|(?:^|_)(?:date|at|time|timestamp)$|(?:date|Date|At|Time)$)/
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'

const normalize = (value) => String(value ?? '').toLocaleLowerCase('th-TH').replace(/[๐-๙]/g, (digit) => THAI_DIGITS.indexOf(digit))

function parseDateQuery(keyword) {
  let match = /^(\d{1,2})\.$/.exec(keyword)
  if (match) return { day: Number(match[1]) }
  match = /^(\d{1,2})[./-](\d{1,2})\.?$/.exec(keyword)
  if (match) return { day: Number(match[1]), month: Number(match[2]) }
  match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\.?$/.exec(keyword)
  if (match) return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) }
  match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(keyword)
  if (match) return { day: Number(match[3]), month: Number(match[2]), year: Number(match[1]) }
  return null
}

function dateParts(value) {
  if (value == null || value === '') return null
  const raw = String(value)
  if (!(value instanceof Date) && !/^\d{4}-\d{1,2}-\d{1,2}/.test(raw) && !/^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(raw)) return null
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw) ? `${raw}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return null
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear(), date, raw }
}

function dateSearchValues(value) {
  const parts = dateParts(value)
  if (!parts) return []
  const { day, month, year, date, raw } = parts
  const paddedDay = String(day).padStart(2, '0')
  const paddedMonth = String(month).padStart(2, '0')
  const formats = [raw, `${year}-${paddedMonth}-${paddedDay}`]
  for (const calendarYear of [year, year + 543]) {
    formats.push(
      `${paddedDay}/${paddedMonth}/${calendarYear}`,
      `${day}/${month}/${calendarYear}`,
      `${paddedDay}-${paddedMonth}-${calendarYear}`,
      `${calendarYear}-${paddedMonth}-${paddedDay}`,
      `${calendarYear}/${paddedMonth}/${paddedDay}`,
    )
  }
  formats.push(date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }))
  formats.push(date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }))
  return formats
}

/** The optional visibleDates limits date searches to dates shown for a record. */
export function matchesSearch(values, query, record, visibleDates) {
  const keyword = normalize(query).trim()
  if (!keyword) return true
  const dateQuery = parseDateQuery(keyword)
  if (dateQuery) {
    const dates = visibleDates ?? (record && typeof record === 'object'
      ? Object.entries(record).filter(([key]) => DATE_FIELD.test(key)).map(([, value]) => value)
      : values)
    return dates.some((value) => {
      const parts = dateParts(value)
      if (!parts || parts.day !== dateQuery.day || (dateQuery.month && parts.month !== dateQuery.month)) return false
      if (!dateQuery.year) return true
      return parts.year === dateQuery.year || parts.year + 543 === dateQuery.year
    })
  }
  const candidates = [...values]
  if (record && typeof record === 'object') {
    for (const [key, value] of Object.entries(record)) {
      if (DATE_FIELD.test(key)) candidates.push(value)
    }
  }
  if (normalize(candidates.filter((value) => value != null).join(' ')).includes(keyword)) return true
  return candidates.some((value) => {
    if (value == null) return false
    return [value, ...dateSearchValues(value)].some((candidate) => normalize(candidate).includes(keyword))
  })
}
