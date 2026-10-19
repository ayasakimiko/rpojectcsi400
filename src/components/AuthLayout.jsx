import '../page/css/Login.css'

const FEATURES = ['ดูบิลค่าเช่าและชำระเงินออนไลน์', 'แจ้งซ่อมและติดตามสถานะได้ทันที', 'รับแจ้งเตือนพัสดุและประกาศจากหอพัก']

export function AuthLayout({ icon, title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card auth-card-split">
        <aside className="auth-aside">
          <div className="auth-aside-content">
            <span className="auth-aside-badge">Dormitory System</span>
            <h2>ระบบจัดการหอพัก</h2>
            <p>จัดการทุกเรื่องในหอพักได้ในที่เดียว สะดวก รวดเร็ว และปลอดภัย</p>
            <ul className="auth-aside-list">
              {FEATURES.map((feature) => (
                <li key={feature}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </aside>
        <main className="auth-main">
          <div className="auth-brand">
            <div className="auth-icon">{icon}</div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
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
