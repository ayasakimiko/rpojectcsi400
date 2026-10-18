import './StepTimeline.css'

function StepIcon({ state, tone, index }) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  if (state === 'done' && tone === 'danger') {
    return (
      <svg {...props} strokeWidth="3">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    )
  }
  if (state === 'done') {
    return (
      <svg {...props} strokeWidth="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
  if (state === 'current') {
    return (
      <svg {...props} strokeWidth="2.4">
        <circle cx="12" cy="12" r="8" />
        <polyline points="12 8 12 12 14.5 13.5" />
      </svg>
    )
  }
  return <span className="step-timeline-number">{index + 1}</span>
}

const STATE_TEXT = { done: 'เสร็จแล้ว', current: 'กำลังดำเนินการ', pending: 'ยังไม่ถึงขั้นตอนนี้' }

export default function StepTimeline({ title = 'ขั้นตอนการดำเนินการ', aside = null, steps = [], actorClassName = '' }) {
  if (steps.length === 0) return null
  return (
    <section className="step-timeline" aria-label={title}>
      <div className="step-timeline-head">
        <h4>{title}</h4>
        {aside}
      </div>
      <ol className="step-timeline-list">
        {steps.map((step, index) => {
          const state = step.state === 'upcoming' ? 'pending' : step.state || 'pending'
          const tone = step.tone || (state === 'done' ? 'primary' : '')
          const next = steps[index + 1]
          const classes = [
            'step-timeline-item',
            `is-${state}`,
            tone ? `is-${tone}` : '',
            state === 'done' && next && next.state !== 'pending' && next.state !== 'upcoming' ? 'is-line-done' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <li key={`${step.label}-${index}`} className={classes}>
              <span className="step-timeline-marker" title={STATE_TEXT[state]}>
                <StepIcon state={state} tone={step.tone} index={index} />
              </span>
              <div className="step-timeline-body">
                <strong>{step.label}</strong>
                {step.meta && <small>{step.meta}</small>}
                {step.by && <span className={`step-timeline-by ${actorClassName}`.trim()}>{step.by}</span>}
                {step.extra && <span className="step-timeline-extra">{step.extra}</span>}
                {step.note && <p className="step-timeline-note">{step.note}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
