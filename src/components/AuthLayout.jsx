import { Link } from 'react-router-dom'
import '../page/css/Login.css'
import buildingImg from '../assets/landing/building.jpg'

const DORM_NAME = 'หอพักใจ'

function Svg({ size = 18, stroke = 2.2, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function AuthLayout({ icon, title, subtitle, children }) {
  return (
    <div className="auth-page auth-page-photo">
      <div className="auth-card auth-shell">
        <Link to="/" className="auth-home-btn">
          <Svg size={16}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>
          กลับหน้าแรก
        </Link>

        <aside className="auth-hero">
          <img className="auth-hero-img" src={buildingImg} alt={`อาคาร${DORM_NAME}`} />
          <div className="auth-hero-shade" />

          <span className="auth-hero-location">
            <Svg size={15}>
              <path d="M12 21s7-6.1 7-11.5a7 7 0 1 0-14 0C5 14.9 12 21 12 21Z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </Svg>
            ใกล้ ม.ศรีปทุม บางเขน
          </span>

          <div className="auth-hero-bottom">
            <span className="auth-hero-welcome">ยินดีต้อนรับสู่</span>
            <div className="auth-hero-dorm">
              <span className="auth-hero-dorm-mark">
                <Svg size={24}>
                  <path d="M3 11.5 12 4l9 7.5" />
                  <path d="M5.5 10v10h13V10" />
                </Svg>
              </span>
              <strong>{DORM_NAME}</strong>
            </div>
            <p className="auth-hero-tagline">หอพักนักศึกษาที่อยู่สบาย ปลอดภัย และจัดการทุกเรื่องได้จากมือถือ</p>
          </div>
        </aside>

        <main className="auth-panel">
          <div className="auth-panel-inner">
            <div className="auth-brand">
              <div className="auth-icon">{icon}</div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            {children}
          </div>
          <p className="auth-panel-foot">© {new Date().getFullYear()} {DORM_NAME}</p>
        </main>
      </div>
    </div>
  )
}


const NOTICE_ICONS = {
  success: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.5 2.75 2.75L16 10" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.75h.01" />
    </>
  ),
}

function resolveNotice(notice) {
  if (!notice?.message) return null
  if (Object.hasOwn(NOTICE_ICONS, notice.type ?? '')) return notice
  const { status, message } = notice
  if (status === 0) return { type: 'error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง' }
  if (status === 409) return { type: 'info', message }
  if (status === 400 || status === 429) return { type: 'warning', message }
  return { type: 'error', message }
}

export function AuthAlert({ notice }) {
  const resolved = resolveNotice(notice)
  if (!resolved) return null
  return (
    <div className={`auth-alert is-${resolved.type}`} role="alert">
      <span className="auth-alert-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {NOTICE_ICONS[resolved.type]}
        </svg>
      </span>
      <span>{resolved.message}</span>
    </div>
  )
}
