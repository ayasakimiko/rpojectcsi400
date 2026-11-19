import ThaiDatePicker from './ThaiDatePicker.jsx'
import { AGE_MAX, AGE_MIN, ageFromBirthDate } from '../utils/validators.js'
import './BirthDateInput.css'

const yearsAgo = (today, years) => new Date(today.getFullYear() - years, today.getMonth(), today.getDate())

export default function BirthDateInput({ id, value, onChange, invalid = false, selectClassName = 'form-control', disabled = false }) {
  const today = new Date()
  const age = value ? ageFromBirthDate(value, today) : null
  const hasAge = age != null && age >= 0
  return (
    <div className="birth-date-input">
      <div className="birth-date-picker">
        <ThaiDatePicker
          id={id}
          value={value}
          onChange={onChange}
          placeholder="เลือกวันเกิด"
          className={selectClassName}
          invalid={invalid}
          disabled={disabled}
          minDate={yearsAgo(today, AGE_MAX)}
          maxDate={yearsAgo(today, AGE_MIN)}
          openToDate={value ? undefined : yearsAgo(today, 25)}
          pickMonthYear
        />
      </div>
      <span className={`birth-date-age${hasAge ? '' : ' is-empty'}`} aria-live="polite">
        {hasAge ? `อายุ ${age} ปี` : 'อายุ -'}
      </span>
    </div>
  )
}
