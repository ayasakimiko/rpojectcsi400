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
        const options = barRef.current.querySelector('.inspection-topic-options')
        const button = options?.querySelector(`[data-key="${key}"]`)
        if (options && button) {
          const bounds = options.getBoundingClientRect()
          const buttonBounds = button.getBoundingClientRect()
          const offset = buttonBounds.left < bounds.left
            ? buttonBounds.left - bounds.left
            : buttonBounds.right > bounds.right ? buttonBounds.right - bounds.right : 0
          // Reveal the tab horizontally without cancelling the section's vertical scroll.
          if (offset) options.scrollBy({ left: offset, behavior: 'smooth' })
        }
        const target = key === 'all' ? root : root.querySelector(`[data-topic="${key}"]:not([hidden])`)
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
