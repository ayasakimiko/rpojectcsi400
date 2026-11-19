import { useState } from 'react'
import './NotificationActions.css'

export function NotificationDeleteAllButton({ count, onConfirm }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = () => {
    setBusy(true)
    setError('')
    Promise.resolve(onConfirm())
      .then(() => setConfirming(false))
      .catch(() => setError('ลบไม่สำเร็จ ลองใหม่อีกครั้ง'))
      .finally(() => setBusy(false))
  }

  if (!confirming) {
    return (
      <button type="button" className="notif-delete-all" onClick={() => setConfirming(true)} disabled={count === 0}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
        </svg>
        ลบทั้งหมด
      </button>
    )
  }

  return (
    <div className="notif-delete-confirm" role="alertdialog" aria-label="ยืนยันลบการแจ้งเตือนทั้งหมด">
      <span className="notif-delete-confirm-text">
        {error || `ลบทั้งหมด ${count.toLocaleString('th-TH')} รายการ?`}
      </span>
      <button type="button" className="notif-delete-confirm-cancel" onClick={() => { setConfirming(false); setError('') }} disabled={busy}>
        ยกเลิก
      </button>
      <button type="button" className="notif-delete-confirm-ok" onClick={confirm} disabled={busy} autoFocus>
        {busy ? 'กำลังลบ...' : 'ลบ'}
      </button>
    </div>
  )
}

export function NotificationReadAllButton({ disabled, onClick }) {
  return (
    <button type="button" className="notif-read-all" onClick={onClick} disabled={disabled}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12.5 6.5 17 15 8M9.5 17 18 8.5M22 8l-8.5 9" />
      </svg>
      อ่านทั้งหมด
    </button>
  )
}

export function NotificationItemShell({ title, onDelete, children }) {
  return (
    <div className="notif-item-shell">
      {children}
      <button
        type="button"
        className="notif-item-delete"
        onClick={onDelete}
        aria-label={'ลบการแจ้งเตือน ' + (title || '')}
        title="ลบการแจ้งเตือน"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
        </svg>
      </button>
    </div>
  )
}
