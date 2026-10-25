import { useEffect, useState } from 'react'
import './AppHeader.css'

const ROLE_LABEL = {
  admin: 'ผู้ดูแลระบบ',
  staff: 'เจ้าหน้าที่',
  owner: 'เจ้าของหอพัก',
  customer: 'ผู้เช่า',
}

const formatWeekday = (date) => date.toLocaleDateString('th-TH', { weekday: 'long' })
const formatDay = (date) => date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
const formatClock = (date) => date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

export function AppHeaderMeta({ role, extra = null }) {
  return (
    <div className="app-header-meta">
      <span className={`app-header-role is-${role}`}>
        <i aria-hidden="true" />
        {ROLE_LABEL[role] || role}
      </span>
      {extra}
    </div>
  )
}

export function AppHeaderDate() {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), 15000)
    return () => clearInterval(timer)
  }, [])

  return (
    <time className="app-header-date" dateTime={today.toISOString()}>
      <span className="app-header-date-icon" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      </span>
      <strong>{formatWeekday(today)}</strong>
      <span>{formatDay(today)}</span>
      <i aria-hidden="true" />
      <span className="app-header-clock">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        {formatClock(today)} น.
      </span>
    </time>
  )
}

export function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}
