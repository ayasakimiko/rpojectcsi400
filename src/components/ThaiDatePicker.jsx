import { useRef } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import { th } from 'date-fns/locale/th'
import 'react-datepicker/dist/react-datepicker.css'
import './ThaiDatePicker.css'

registerLocale('th', th)

const WEEKDAY_SHORT = {
  อาทิตย์: 'อา',
  จันทร์: 'จ',
  อังคาร: 'อ',
  พุธ: 'พ',
  พฤหัสบดี: 'พฤ',
  ศุกร์: 'ศ',
  เสาร์: 'ส',
}

const pad2 = (number) => String(number).padStart(2, '0')

function parseDateString(value) {
  return value ? new Date(`${value}T00:00:00`) : null
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const formatShort = (date) => date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
const formatFull = (date) => date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
const formatTime = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
const formatMonth = (date) => date.toLocaleDateString('th-TH', { month: 'long' })

function getRangeHint(minDate, maxDate, selected) {
  if (minDate && maxDate) return `เลือกได้ ${formatShort(minDate)} – ${formatShort(maxDate)}`
  if (minDate) return `เลือกได้ตั้งแต่ ${formatShort(minDate)}`
  if (maxDate) return `เลือกได้ถึง ${formatShort(maxDate)}`
  return selected ? `เลือก ${formatShort(selected)}` : 'ยังไม่ได้เลือกวันที่'
}

const ChevronIcon =({ direction }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
)

function ThaiDatePicker({
  value,
  onChange,
  valueType = 'string',
  placeholder = 'เลือกวันที่',
  className = 'form-control',
  invalid = false,
  compact = false,
  showTimeSelect = false,
  minDate,
  maxDate,
  ...rest
}) {
  const pickerRef = useRef(null)
  const selected = valueType === 'date' ? value || null : parseDateString(value)

  const emit = (date) => {
    if (valueType === 'date') onChange(date)
    else onChange(date ? toDateString(date) : '')
  }

  const today = startOfDay(new Date())
  const todayDisabled = (minDate && today < startOfDay(minDate)) || (maxDate && today > startOfDay(maxDate))

  const selectToday = () => {
    if (showTimeSelect) {
      const now = new Date()
      now.setSeconds(0, 0)
      emit(minDate && now < minDate ? minDate : now)
    } else {
      emit(today)
    }
    pickerRef.current?.setOpen(false)
  }

  const displayValue = selected ? (showTimeSelect ? `${formatFull(selected)} เวลา ${formatTime(selected)}` : formatFull(selected)) : ''

  return (
    <DatePicker
      ref={pickerRef}
      selected={selected}
      onChange={emit}
      value={displayValue}
      onChangeRaw={(event) => event?.preventDefault()}
      locale="th"
      placeholderText={placeholder}
      className={`${className} thai-dp-input${invalid ? ' is-invalid' : ''}`.trim()}
      wrapperClassName={`thai-dp-wrapper${compact ? ' is-compact' : ''}`}
      calendarClassName="thai-dp"
      popperClassName="thai-dp-popper"
      popperPlacement="bottom-start"
      showPopperArrow={false}
      fixedHeight
      autoComplete="off"
      showTimeSelect={showTimeSelect}
      timeFormat="HH:mm"
      timeCaption="เวลา"
      minDate={minDate}
      maxDate={maxDate}
      formatWeekDay={(dayName) => WEEKDAY_SHORT[dayName] || dayName}
      renderCustomHeader={({ monthDate, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
        <div className="thai-dp-header">
          <button type="button" className="thai-dp-nav" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} aria-label="เดือนก่อนหน้า">
            <ChevronIcon direction="left" />
          </button>
          <div className="thai-dp-title">
            {formatMonth(monthDate)} <span className="thai-dp-year">{monthDate.getFullYear() + 543}</span>
          </div>
          <button type="button" className="thai-dp-nav" onClick={increaseMonth} disabled={nextMonthButtonDisabled} aria-label="เดือนถัดไป">
            <ChevronIcon direction="right" />
          </button>
        </div>
      )}
      {...rest}
    >
      <div className="thai-dp-footer">
        <span className="thai-dp-hint">{getRangeHint(minDate, maxDate, selected)}</span>
        <button type="button" className="thai-dp-today" onClick={selectToday} disabled={todayDisabled}>
          {showTimeSelect ? 'ตอนนี้' : 'วันนี้'}
        </button>
      </div>
    </DatePicker>
  )
}

export default ThaiDatePicker
