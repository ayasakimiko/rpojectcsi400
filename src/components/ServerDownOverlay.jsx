import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { anyServiceUp, elapsedParts, serviceHealthTargets } from '../utils/serverStatus.js'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'
import useMinimumLoading from '../utils/useMinimumLoading.js'
import LoadingScreen from './LoadingScreen.jsx'
import './ServerDownOverlay.css'

const DOWN_KEY = 'serverDownSince'
const UP_INTERVAL_MS = 15000
const DOWN_INTERVAL_MS = 5000
const FAILURES_BEFORE_DOWN = 2

function readDownSince() {
  try {
    const value = Number(localStorage.getItem(DOWN_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function writeDownSince(value) {
  try {
    if (value) localStorage.setItem(DOWN_KEY, String(value))
    else localStorage.removeItem(DOWN_KEY)
  } catch {
    return
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

export default function ServerDownOverlay({ development = false }) {
  const [downSince, setDownSince] = useState(readDownSince)
  const [now, setNow] = useState(Date.now)
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState(null)
  const running = useRef(false)

  const check = useCallback(async () => {
    if (running.current) return
    running.current = true
    setChecking(true)
    try {
      const targets = serviceHealthTargets({ development })
      const attempts = readDownSince() ? 1 : FAILURES_BEFORE_DOWN
      let up = false
      for (let attempt = 0; attempt < attempts && !up; attempt += 1) {
        if (attempt) await wait(1500)
        up = await anyServiceUp({ targets })
      }
      setLastChecked(Date.now())
      const since = up ? null : readDownSince() || Date.now()
      writeDownSince(since)
      setDownSince(since)
    } finally {
      running.current = false
      setChecking(false)
    }
  }, [development])

  useEffect(() => {
    check()
    const timer = setInterval(check, downSince ? DOWN_INTERVAL_MS : UP_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [check, downSince])

  useEffect(() => {
    const recheck = () => { if (document.visibilityState !== 'hidden') check() }
    window.addEventListener('online', recheck)
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('online', recheck)
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [check])

  const loading = !downSince && lastChecked === null
  const loader = useMinimumLoading(loading)

  useEffect(() => {
    if (!downSince) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [downSince])

  useEffect(() => {
    if (!downSince && !loader.visible) return undefined
    return lockBodyScroll()
  }, [downSince, loader.visible])

  if (!downSince && loader.visible) {
    return <LoadingScreen subtitle="กำลังตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์" leaving={loader.leaving} />
  }
  if (!downSince) return null

  const elapsed = elapsedParts(now - downSince)

  return (
    <div className="server-down" role="alertdialog" aria-modal="true" aria-labelledby="server-down-title">
      <div className="server-down-card">
        <div className="server-down-head">
          <div className="server-down-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="7" rx="2" />
              <rect x="3" y="13" width="18" height="7" rx="2" />
              <path d="M7 7.5h.01M7 16.5h.01" />
              <path d="M14 15l4 3M18 15l-4 3" />
            </svg>
          </div>
          <span className="server-down-badge">
            <span className="server-down-badge-dot" />
            Error 500 · Server Unavailable
          </span>
        </div>

        <h2 id="server-down-title" className="server-down-title">ระบบขัดข้องชั่วคราว</h2>
        <p className="server-down-text">
          ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ทุกช่องทาง<br />
          ระบบจะกลับมาใช้งานให้อัตโนมัติเมื่อเซิร์ฟเวอร์พร้อม
        </p>

        <div className="server-down-timer">
          <div className="server-down-label">ระบบล้มมาแล้ว</div>
          <div className="server-down-clock" aria-live="off">
            {[
              ...(elapsed.days ? [[elapsed.days, 'วัน']] : []),
              [elapsed.hours, 'ชั่วโมง'],
              [elapsed.minutes, 'นาที'],
              [elapsed.seconds, 'วินาที'],
            ].map(([value, unit], index) => (
              <Fragment key={unit}>
                {index > 0 && <span className="server-down-colon">:</span>}
                <div className="server-down-unit">
                  <span className="server-down-num">{String(value).padStart(2, '0')}</span>
                  <span className="server-down-unit-label">{unit}</span>
                </div>
              </Fragment>
            ))}
          </div>
          <div className="server-down-since">
            เริ่มล้มเมื่อ <strong>{dateFormat.format(downSince)} น.</strong>
          </div>
        </div>

        <div className="server-down-status">
          <span className={`server-down-dot${checking ? ' is-checking' : ''}`} />
          {checking
            ? 'กำลังตรวจสอบเซิร์ฟเวอร์...'
            : `ตรวจสอบล่าสุด ${lastChecked ? new Date(lastChecked).toLocaleTimeString('th-TH') : '-'} · ตรวจซ้ำทุก ${DOWN_INTERVAL_MS / 1000} วินาที`}
        </div>

        <button type="button" className="server-down-btn" onClick={check} disabled={checking}>
          <svg className={checking ? 'is-spinning' : ''} viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 4v5h-5" />
          </svg>
          {checking ? 'กำลังตรวจสอบ...' : 'ลองเชื่อมต่ออีกครั้ง'}
        </button>
      </div>
    </div>
  )
}
