import { useRef } from 'react'
import './InspectionForm.css'

export default function InspectionTopicFilter({ topics, value, onChange }) {
  const barRef = useRef(null)

  const select = (key) => {
    onChange(key)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = barRef.current?.closest('[data-topic-root], form')
        if (!root) return
        const target = key === 'all' ? root : root.querySelector(`[data-topic="${key}"]:not([hidden])`)
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        barRef.current?.querySelector(`[data-key="${key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      })
    })
  }

  return (
    <div ref={barRef} className="inspection-topic-filter">
      <div className="inspection-topic-options" role="tablist" aria-label="เลือกหัวข้อที่ต้องการดู">
        {topics.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            data-key={key}
            aria-selected={value === key}
            className={value === key ? 'is-active' : ''}
            onClick={() => select(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
