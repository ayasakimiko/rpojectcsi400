import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './NotificationActions.css'

const TrashIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
  </svg>
)

export function NotificationDeleteAllButton({ count, onConfirm }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef(null)
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const openerRef = useRef(null)
  const titleId = useId()
  const descId = useId()

  const close = () => {
    if (busy) return
    setConfirming(false)
    setError('')
    openerRef.current?.focus()
  }

  const confirm = () => {
    setBusy(true)
    setError('')
    Promise.resolve(onConfirm())
      .then(() => setConfirming(false))
      .catch(() => setError('ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'))
      .finally(() => setBusy(false))
  }

  // Start on "cancel" so Enter cannot delete by accident.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
  }, [confirming])

  // The modal is portalled to <body>, outside the bell panel. Every page closes that panel on a
  // document mousedown outside it, which would unmount this modal, so stop mousedown here.
  // Keys are caught in the capture phase: Escape closes only the modal, Tab stays inside it.
  useEffect(() => {
    if (!confirming) return
    const overlay = overlayRef.current
    const stopMouseDown = (event) => event.stopPropagation()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled)') || [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    overlay?.addEventListener('mousedown', stopMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      overlay?.removeEventListener('mousedown', stopMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  })

  return (
    <>
      <button
        type="button"
        className="notif-delete-all"
        onClick={(event) => {
          openerRef.current = event.currentTarget
          setConfirming(true)
        }}
        disabled={count === 0}
      >
        <TrashIcon />
        ลบทั้งหมด
      </button>
      {confirming && createPortal(
        <div
          ref={overlayRef}
          className="notif-confirm-overlay"
          onClick={(event) => { if (event.target === event.currentTarget) close() }}
        >
          <section
            ref={dialogRef}
            className="notif-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            aria-busy={busy || undefined}
          >
            <span className="notif-confirm-icon">
              <TrashIcon size={26} />
            </span>
            <h3 id={titleId} className="notif-confirm-title">ลบการแจ้งเตือนทั้งหมด?</h3>
            <p id={descId} className="notif-confirm-desc">
              การแจ้งเตือน <strong>{count.toLocaleString('th-TH')} รายการ</strong> จะหายไปจากกล่องแจ้งเตือนของคุณ
            </p>
            {error && (
              <p className="notif-confirm-error" role="alert">{error}</p>
            )}
            <div className="notif-confirm-actions">
              <button ref={cancelRef} type="button" className="notif-confirm-btn is-cancel" onClick={close} disabled={busy}>
                ยกเลิก
              </button>
              <button type="button" className="notif-confirm-btn is-danger" onClick={confirm} disabled={busy}>
                {busy ? <span className="notif-confirm-spinner" aria-hidden="true" /> : <TrashIcon size={16} />}
                {busy ? 'กำลังลบ...' : error ? 'ลองอีกครั้ง' : `ลบ ${count.toLocaleString('th-TH')} รายการ`}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
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
