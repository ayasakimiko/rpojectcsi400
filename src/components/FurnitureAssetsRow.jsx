import { ISSUE_RESULTS, RESULT_LABELS, RESULT_OPTIONS, assetResultCounts } from '../utils/inspectionChecklist.js'
import './FurnitureAssetsRow.css'

export default function FurnitureAssetsRow({ label, result, assets, open, onToggle, moveIn = undefined, onMoveInClick, invalid = false, children }) {
  const loaded = Array.isArray(assets)
  const counts = assetResultCounts(assets)
  const breakdown = RESULT_OPTIONS.filter((option) => counts[option.key] > 0)
  const current = loaded && result ? result : ''
  const hasMoveIn = moveIn !== undefined
  const newIssue = hasMoveIn && ISSUE_RESULTS.includes(current) && !ISSUE_RESULTS.includes(moveIn)
  const toggleByKey = (event) => {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    onToggle()
  }
  return (
    <div className={`inspection-row furniture-assets-row${current ? ` is-${current}` : ''}${open ? ' is-open' : ''}${invalid ? ' is-missing' : ''}`}>
      <div className="furniture-assets-head" role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} onKeyDown={toggleByKey}>
        <span className="furniture-assets-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
            <path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
            <path d="M6 18v2M18 18v2" />
          </svg>
        </span>
        <span className="furniture-assets-title">
          <strong>{label}</strong>
          <span className="furniture-assets-meta">
            {loaded ? `ทรัพย์สินในห้อง ${assets.length} รายการ · สรุปจากสถานะที่มากที่สุด` : 'กำลังโหลดรายการทรัพย์สิน'}
          </span>
          {breakdown.length > 1 && (
            <span className="furniture-assets-breakdown">
              {breakdown.map((option) => (
                <span key={option.key} className={`is-${option.key}`}>
                  {option.label} {counts[option.key]}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="furniture-assets-compare">
          {hasMoveIn && (
            <>
              <button
                type="button"
                className={`furniture-assets-status is-movein is-${moveIn || 'pending'}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onMoveInClick?.(event)
                }}
                title="ดูผลตรวจก่อนเข้าอยู่"
              >
                <small>ตอนเข้าอยู่</small>
                <strong>
                  {moveIn ? RESULT_LABELS[moveIn] : 'ไม่ได้บันทึก'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14M6 13l6 6 6-6" />
                  </svg>
                </strong>
              </button>
              <span className="furniture-assets-arrow" aria-hidden="true">→</span>
            </>
          )}
          <span className={`furniture-assets-status is-${current || 'pending'}`}>
            <small>{hasMoveIn ? 'ตอนนี้' : 'สรุปผล'}</small>
            <strong>{current ? RESULT_LABELS[current] : '—'}</strong>
            {newIssue && <em>เกิดขึ้นใหม่</em>}
          </span>
        </span>
        <span className="furniture-assets-chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
      <div className="furniture-assets-panel" hidden={!open}>
        {children}
      </div>
    </div>
  )
}
