import './MissingItemNotice.css'

export default function MissingItemNotice({ title = 'ไม่พบรายการนี้', message, hint = 'รายการอาจถูกลบไปแล้ว หรือข้อมูลยังไม่อัปเดต ลองรีเฟรชหน้าอีกครั้ง', onClose }) {
  return (
    <div className="missing-notice">
      <button type="button" className="missing-notice-close" onClick={onClose} aria-label="ปิด">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <span className="missing-notice-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5" />
        </svg>
      </span>
      <h3 className="missing-notice-title">{title}</h3>
      {message && <p className="missing-notice-message">{message}</p>}
      {hint && <p className="missing-notice-hint">{hint}</p>}
      <button type="button" className="missing-notice-ok" onClick={onClose} autoFocus>
        ตกลง
      </button>
    </div>
  )
}
