import './ProcessSteps.css'

const ICON_PATHS = {
  note: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  check: <path d="M5 12.5 10 17l9-10" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  box: <><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M12 8v4M12 16h.01" /></>,
  edit: <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />,
}

function StepIcon({ type, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[type] || ICON_PATHS.clock}
    </svg>
  )
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(Math.abs(ms) / (1000 * 60))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  const parts = []
  if (days > 0) parts.push(`${days} วัน`)
  if (hours > 0) parts.push(`${hours} ชั่วโมง`)
  if (days === 0 && minutes > 0) parts.push(`${minutes} นาที`)
  return parts.length > 0 ? parts.join(' ') : 'น้อยกว่า 1 นาที'
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ProcessSteps({ title, ...props }) {
  if (!title) return <ProcessStepsBody {...props} />
  return (
    <section className="process-steps-card">
      <h4 className="process-steps-title">{title}</h4>
      <ProcessStepsBody {...props} />
    </section>
  )
}

function ProcessStepsBody({ steps: raw, startDate, endDate, pendingText = 'ไม่มีข้อมูล', actorClassName = '', waitingText = 'กำลังดำเนินการ' }) {
  const steps = raw.map((step, index) => {
    const previous = raw.slice(0, index).reverse().find((item) => item.date)
    const gap = previous && step.date ? new Date(step.date) - new Date(previous.date) : null
    return { ...step, done: Boolean(step.date), gap: gap !== null && gap >= 0 ? formatDuration(gap) : null }
  })
  const total = endDate && startDate ? new Date(endDate) - new Date(startDate) : null

  return (
    <div className="moveout-steps-wrap">
      <ol className="moveout-steps" style={{ '--step-count': steps.length }}>
        {steps.map((step, index) => (
          <li key={step.key} className={`${step.done ? 'is-done' : 'is-pending'}${step.tone ? ` is-${step.tone}` : ''}`}>
            {index > 0 && (
              <span className="moveout-step-connector" aria-hidden="true">
                {step.gap && <small>+ {step.gap}</small>}
              </span>
            )}
            <span className="moveout-step-dot">
              <StepIcon type={step.done ? step.icon : 'clock'} />
            </span>
            <div className="moveout-step-body">
              <strong>{step.label}</strong>
              {step.by && step.done && <span className={`moveout-step-by ${actorClassName}`.trim()}>{step.by}</span>}
              <small>{step.date ? formatDateTime(step.date) : step.pendingText || pendingText}</small>
              {step.note && step.done && <p className="moveout-step-note">{step.note}</p>}
            </div>
          </li>
        ))}
      </ol>
      {total !== null && total >= 0 ? (
        <p className="moveout-steps-total">
          <StepIcon type="clock" size={13} />
          ใช้เวลาทั้งหมด <strong>{formatDuration(total)}</strong>
        </p>
      ) : (
        <p className="moveout-steps-total is-waiting">
          <StepIcon type="clock" size={13} />
          {waitingText}
        </p>
      )}
    </div>
  )
}
