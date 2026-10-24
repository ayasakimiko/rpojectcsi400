export default function InspectionCostInput({ value, onChange, label, tone = '', error = '', hint = '' }) {
  return (
    <div className={`inspection-cost${tone ? ` is-${tone}` : ''}${error ? ' is-invalid' : ''}`}>
      <label className="inspection-cost-main">
        <span className="inspection-cost-label">
          ค่าเสียหาย
          {hint && <small>{hint}</small>}
        </span>
        <span className="inspection-cost-field">
          <b aria-hidden="true">฿</b>
          <input
            inputMode="decimal"
            value={value ?? ''}
            placeholder="0.00"
            aria-label={`ค่าเสียหาย ${label}`}
            aria-invalid={Boolean(error)}
            onFocus={(event) => event.target.select()}
            onChange={(event) => onChange(event.target.value)}
          />
          <em>บาท</em>
        </span>
      </label>
      {error && <small className="inspection-cost-error">{error}</small>}
    </div>
  )
}
