import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'
import { statusInfo } from '../utils/marketStatus.js'

export function StatusPill({ map, value, children }) {
  const info = statusInfo(map, value)
  return <span className={`market-pill ${info.tone || 'is-muted'}`}>{children ?? info.label}</span>
}

export function MarketModal({
  title, subtitle, busy = false, error, onClose, onSubmit, submitLabel = 'บันทึก', submitTone = 'primary',
  submitDisabled = false, wide = false, cancelLabel = onSubmit ? 'ยกเลิก' : 'ปิด', hideFooter = false, children,
}) {
  const titleId = useId()
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const unlock = lockBodyScroll()
    const handleKey = (event) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      unlock()
    }
  }, [])

  const Container = onSubmit ? 'form' : 'div'
  return createPortal(
    <div className="market-modal-overlay" role="presentation" onClick={() => !busy && onClose()}>
      <Container
        className={`market-modal${wide ? ' is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit ? (event) => {
          event.preventDefault()
          if (!busy && !submitDisabled) onSubmit()
        } : undefined}
      >
        <header className="market-modal-head">
          <div>
            <h4 id={titleId}>{title}</h4>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="market-icon-btn" onClick={onClose} disabled={busy} aria-label="ปิด">×</button>
        </header>
        <div className="market-modal-body">
          {children}
          {error && <p className="market-error" role="alert">{error}</p>}
        </div>
        {!hideFooter && (
          <footer className="market-modal-foot">
            <button type="button" className="market-btn" onClick={onClose} disabled={busy}>{cancelLabel}</button>
            {onSubmit && (
              <button type="submit" className={`market-btn is-${submitTone}`} disabled={busy || submitDisabled}>
                {busy ? 'กำลังบันทึก…' : submitLabel}
              </button>
            )}
          </footer>
        )}
      </Container>
    </div>,
    document.body,
  )
}

export function Field({ label, hint, wide = false, children }) {
  return (
    <label className={`market-field${wide ? ' is-wide' : ''}`}>
      <span className="market-field-label">{label}</span>
      {children}
      {hint && <small className="market-field-hint">{hint}</small>}
    </label>
  )
}

export function CheckField({ label, checked, onChange, disabled }) {
  return (
    <label className="market-check">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  )
}

export function EmptyState({ children }) {
  return <p className="market-empty">{children}</p>
}

export function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="market-pager">
      <button type="button" className="market-btn is-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>ก่อนหน้า</button>
      <span>หน้า {page} / {totalPages}</span>
      <button type="button" className="market-btn is-small" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>ถัดไป</button>
    </div>
  )
}

export function ConfirmModal({ title, message, confirmLabel = 'ยืนยัน', tone = 'danger', busy, error, onConfirm, onClose }) {
  return (
    <MarketModal title={title} busy={busy} error={error} onClose={onClose} onSubmit={onConfirm} submitLabel={confirmLabel} submitTone={tone}>
      <p className="market-confirm-text">{message}</p>
    </MarketModal>
  )
}
