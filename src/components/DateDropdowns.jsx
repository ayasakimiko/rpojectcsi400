import { useState } from 'react'
import './DateDropdowns.css'

const MONTH_NAMES = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]
const YEARS_BACK = 5
const YEARS_AHEAD = 1
const pad2 = (number) => String(number).padStart(2, '0')

function getDaysInMonth(year, month) {
  if (!year || !month) return 31
  return new Date(Number(year), Number(month), 0).getDate()
}

function DateDropdowns({ id, value, onChange, selectClassName = '', invalid = false, inline = false }) {
  const [draft, setDraft] = useState({ year: '', month: '', day: '' })
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  const parts = match ? { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) } : draft

  const currentYear = new Date().getFullYear()
  const years = [
    ...new Set([
      ...Array.from({ length: YEARS_BACK + YEARS_AHEAD + 1 }, (_, index) => currentYear - YEARS_BACK + index),
      Number(parts.year) || currentYear,
    ]),
  ].sort((a, b) => a - b)

  const update = (field, fieldValue) => {
    const next = { ...parts, [field]: fieldValue }
    const maxDay = getDaysInMonth(next.year, next.month)
    if (next.day && Number(next.day) > maxDay) next.day = String(maxDay)
    setDraft(next.year && next.month && next.day ? { year: '', month: '', day: '' } : next)
    onChange(next.year && next.month && next.day ? `${next.year}-${pad2(next.month)}-${pad2(next.day)}` : '')
  }

  const selectClass = `date-dropdowns-select ${selectClassName}${invalid ? ' is-invalid' : ''}`.trim()

  return (
    <div className={`date-dropdowns${inline ? ' is-inline' : ''}`} role="group">
      <select id={id} aria-label="วัน" className={selectClass} value={parts.day} onChange={(event) => update('day', event.target.value)}>
        <option value="">วัน</option>
        {Array.from({ length: getDaysInMonth(parts.year, parts.month) }, (_, index) => index + 1).map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </select>
      <select aria-label="เดือน" className={selectClass} value={parts.month} onChange={(event) => update('month', event.target.value)}>
        <option value="">เดือน</option>
        {MONTH_NAMES.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label="ปี" className={selectClass} value={parts.year} onChange={(event) => update('year', event.target.value)}>
        <option value="">ปี</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year + 543}
          </option>
        ))}
      </select>
    </div>
  )
}

export default DateDropdowns
