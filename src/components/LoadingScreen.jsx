import { createPortal } from 'react-dom'

export default function LoadingScreen({ title = 'กำลังโหลดระบบ', subtitle = 'กรุณารอสักครู่', leaving = false }) {
  return createPortal(
    <div className={`app-loader${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="app-loader-spinner" aria-hidden="true">
        <div className="app-loader-ring" />
        <div className="app-loader-ring is-inner" />
        <div className="app-loader-core">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
            <path d="M10 21v-6h4v6" />
          </svg>
        </div>
      </div>
      <div className="app-loader-text">
        <div className="app-loader-title">{title}</div>
        <div className="app-loader-sub">
          {subtitle}
          <span className="app-loader-dots"><span /><span /><span /></span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
