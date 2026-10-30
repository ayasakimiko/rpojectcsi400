import { Children, useState } from 'react'
import { UploadImage } from './UploadMedia.jsx'
import './ActionDialog.css'

// Shared body for confirm / result popups. It renders inside each page's own Modal shell
// (StaffMain, CustomerDashbord); ActionDialog.css hides that shell's header and padding.

const ICON_PATHS = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M7 7l10 10M17 7 7 17" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5M12 16h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  car: (
    <>
      <path d="M5 17h14v-5l-1.8-4.6A2 2 0 0 0 15.3 6H8.7a2 2 0 0 0-1.9 1.4L5 12v5Z" />
      <path d="M5 12h14M7.5 17v2M16.5 17v2" />
      <circle cx="8" cy="14.5" r=".6" />
      <circle cx="16" cy="14.5" r=".6" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.9 12a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8l.9-12M10 11v6M14 11v6" />,
  box: (
    <>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </>
  ),
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />,
  door: (
    <>
      <path d="M5 21V4a1 1 0 0 1 1-1h9l4 2v16" />
      <path d="M3 21h18M14 12h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" />
    </>
  ),
  shop: (
    <>
      <path d="M3 9.5 4.8 4h14.4L21 9.5" />
      <path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 12v8h14v-8M10 20v-5h4v5" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  bank: <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  wifi: (
    <>
      <path d="M2 8.8a15 15 0 0 1 20 0M5 12.4a10 10 0 0 1 14 0M8.5 15.9a5 5 0 0 1 7 0" />
      <path d="M12 19.5h.01" />
    </>
  ),
  bolt: <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z" />,
  drop: <path d="M12 2.7c-3.6 4.4-6 7.7-6 10.8a6 6 0 0 0 12 0c0-3.1-2.4-6.4-6-10.8Z" />,
}

export function ActionDialogIcon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] || ICON_PATHS.alert}
    </svg>
  )
}

// tone: success | danger | pending | info
export function ActionDialog({ tone = 'info', icon, kicker, title, lead, busy = false, role, actions, children }) {
  return (
    <div className={`action-dialog is-${tone}`} role={role} aria-busy={busy || undefined}>
      <header className="action-dialog-hero">
        <span className="action-dialog-badge">
          <ActionDialogIcon name={icon} />
        </span>
        <div className="action-dialog-heading">
          {kicker && <span className="action-dialog-kicker">{kicker}</span>}
          <h3>{title}</h3>
          {lead && <p>{lead}</p>}
        </div>
      </header>
      {Children.toArray(children).length > 0 && <div className="action-dialog-content">{children}</div>}
      {actions && <footer className={`action-dialog-actions${Array.isArray(actions) && actions.filter(Boolean).length === 1 ? ' is-single' : ''}`}>{actions}</footer>}
    </div>
  )
}

export function ActionDialogPayer({ thumb, thumbAlt = '', room, name, meta, amountLabel, amount }) {
  return (
    <div className="action-dialog-payer">
      {thumb && (
        <span className="action-dialog-thumb">
          <UploadImage src={thumb} alt={thumbAlt} />
        </span>
      )}
      <div className="action-dialog-payer-text">
        {room && <span className="action-dialog-room">ห้อง {room}</span>}
        {name && <strong title={name}>{name}</strong>}
        {meta && <small>{meta}</small>}
      </div>
      {amount && (
        <div className="action-dialog-total">
          <span>{amountLabel}</span>
          <strong>{amount}</strong>
        </div>
      )}
    </div>
  )
}

export function ActionDialogAmount({ label, amount, sub, status }) {
  return (
    <div className="action-dialog-amount">
      <div>
        <span>{label}</span>
        <strong>{amount}</strong>
        {sub && <small>{sub}</small>}
      </div>
      {status && <em>{status}</em>}
    </div>
  )
}

export function ActionDialogItems({ items, label = 'รายการที่ชำระ' }) {
  if (!items?.length) return null
  return (
    <ul className="action-dialog-items" aria-label={label}>
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          <span>{item.label}</span>
          {item.amount && <b>{item.amount}</b>}
        </li>
      ))}
    </ul>
  )
}

export function ActionDialogFacts({ rows }) {
  const visible = (rows || []).filter((row) => row && row[1])
  if (!visible.length) return null
  return (
    <dl className="action-dialog-facts">
      {visible.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ActionDialogOutcome({ title, lines }) {
  const visible = (lines || []).filter(Boolean)
  if (!visible.length) return null
  return (
    <section className="action-dialog-outcome">
      <h4>{title}</h4>
      <ul>
        {visible.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}

export function ActionDialogNote({ label, children }) {
  return (
    <div className="action-dialog-note">
      {label && <span>{label}</span>}
      <p>{children}</p>
    </div>
  )
}

export function ActionDialogError({ message }) {
  if (!message) return null
  return (
    <p className="action-dialog-error" role="alert">
      <ActionDialogIcon name="alert" />
      <span>{message}</span>
    </p>
  )
}

const NOTIFICATION_TONES = { success: 'success', danger: 'danger', pending: 'pending', warning: 'pending' }
const NOTIFICATION_ICONS = { success: 'check', danger: 'alert', pending: 'clock', info: 'bell' }
const NOTIFICATION_KIND_LABEL = {
  tenant: 'คำขอผู้เช่า',
  maintenance: 'แจ้งซ่อม',
  slip: 'การชำระเงิน',
  utility: 'ค่าใช้จ่าย',
  visit: 'ที่จอดรถ',
  safety: 'แจ้งเหตุ',
  staff: 'พนักงาน',
  parcel: 'พัสดุ',
  announcement: 'ประกาศ',
  contract: 'สัญญาเช่า',
}

const formatNotificationTime = (value) => {
  const date = value ? new Date(typeof value === 'string' ? value.replace(/^(\d{4}-\d{2}-\d{2}) (?=\d)/, '$1T') : value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return `${date.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} น.`
}

// Body for a bell-notification popup. Accepts the bell item shape used on every page:
// { title, label, tone, kind, date, detail, details: [{ label, value }], bylineName }.
export function NotificationDialog({ notification, actions, children }) {
  const tone = NOTIFICATION_TONES[notification.tone] || 'info'
  const kindLabel = NOTIFICATION_KIND_LABEL[notification.kind]
  const rows = (notification.details || []).filter((row) => row?.value && !(row.label === 'สถานะ' && row.value === notification.label))
  const detailRow = rows.find((row) => row.label === 'รายละเอียด')
  const detail = detailRow?.value || (rows.length === 0 ? notification.detail : null)
  const facts = rows.filter((row) => row !== detailRow).map((row) => [row.label, row.value])
  if (notification.bylineName) facts.push(['ประกาศโดย', notification.bylineName])
  facts.push(['เวลา', formatNotificationTime(notification.date)])

  return (
    <ActionDialog
      tone={tone}
      icon={NOTIFICATION_ICONS[tone]}
      kicker={kindLabel ? `แจ้งเตือน · ${kindLabel}` : 'การแจ้งเตือน'}
      title={notification.title}
      lead={notification.label}
      actions={actions}
    >
      {detail && <ActionDialogNote label="รายละเอียด">{detail}</ActionDialogNote>}
      <ActionDialogFacts rows={facts} />
      {children}
    </ActionDialog>
  )
}

// Generic "done" / "failed" popup, centred so it reads differently from a confirm dialog.
// Messages joined with " · " or newlines become a headline plus detail lines.
export function ResultDialog({ type = 'success', message, onClose, buttonLabel }) {
  const failed = type !== 'success'
  const [doneAt] = useState(() => new Date())
  const [first, ...points] = String(message || '')
    .split(/\s+·\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
  // "ส่งคำขอสำเร็จ ทางผู้ดูแลจะติดต่อกลับ..." -> headline "ส่งคำขอสำเร็จ" + the rest on its own line.
  const [, main = first, sub] = /^(\S+(?:สำเร็จ|แล้ว))\s+(.+)$/.exec(first || '') || []
  const time = doneAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  const date = doneAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div className={`action-dialog is-result is-${failed ? 'danger' : 'success'}`} role={failed ? 'alert' : 'status'}>
      <div className="action-result-hero">
        <span className="action-result-mark">
          <ActionDialogIcon name={failed ? 'alert' : 'check'} size={28} />
        </span>
        <span className="action-result-sr">{failed ? 'ทำรายการไม่สำเร็จ' : 'ทำรายการสำเร็จ'}</span>
        <h3>{main || (failed ? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' : 'ดำเนินการเรียบร้อยแล้ว')}</h3>
        {sub && <p className="action-result-sub">{sub}</p>}
        <p className="action-result-time">
          <ActionDialogIcon name="clock" size={14} />
          {failed ? 'เกิดขึ้นเมื่อ' : 'บันทึกเมื่อ'} {date} · {time} น.
        </p>
      </div>
      {points.length > 0 && (
        <div className="action-dialog-content">
          <ActionDialogOutcome title="รายละเอียด" lines={points} />
        </div>
      )}
      <footer className="action-dialog-actions is-single">
        <ActionDialogButton onClick={onClose} autoFocus>
          {buttonLabel || (failed ? 'ปิด' : 'ตกลง')}
        </ActionDialogButton>
      </footer>
    </div>
  )
}

// Ready-made confirm / approve / reject / cancel popup body.
// facts: [[label, value]]; outcomes: string[] shown under outcomeTitle; error shows inline with a retry label.
// Danger dialogs focus "cancel" first so Enter cannot trigger the irreversible action by accident.
export function ConfirmDialog({
  tone = 'info',
  icon,
  kicker,
  title,
  lead,
  facts,
  note,
  noteLabel,
  outcomeTitle,
  outcomes,
  error,
  busy = false,
  confirmLabel = 'ยืนยัน',
  confirmIcon,
  busyLabel = 'กำลังดำเนินการ...',
  confirmDisabled = false,
  cancelLabel = 'ยกเลิก',
  onConfirm,
  onCancel,
  children,
}) {
  const focusCancel = tone === 'danger'
  return (
    <ActionDialog
      tone={tone}
      icon={icon || (tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : tone === 'pending' ? 'clock' : 'bell')}
      kicker={kicker}
      title={title}
      lead={lead}
      busy={busy}
      actions={[
        <ActionDialogButton key="cancel" variant="ghost" disabled={busy} onClick={onCancel} autoFocus={focusCancel}>
          {cancelLabel}
        </ActionDialogButton>,
        <ActionDialogButton
          key="confirm"
          icon={confirmIcon}
          busy={busy}
          busyLabel={busyLabel}
          disabled={busy || confirmDisabled}
          onClick={onConfirm}
          autoFocus={!focusCancel}
        >
          {error ? 'ลองอีกครั้ง' : confirmLabel}
        </ActionDialogButton>,
      ]}
    >
      {children || null}
      {facts ? <ActionDialogFacts rows={facts} /> : null}
      {note ? <ActionDialogNote label={noteLabel}>{note}</ActionDialogNote> : null}
      {outcomes ? <ActionDialogOutcome title={outcomeTitle} lines={outcomes} /> : null}
      {error ? <ActionDialogError message={error} /> : null}
    </ActionDialog>
  )
}

// variant: ghost | solid (solid takes the dialog tone colour)
export function ActionDialogButton({ variant = 'solid', icon, busy = false, busyLabel, children, ...props }) {
  return (
    <button type="button" className={`action-dialog-btn is-${variant}`} {...props}>
      {busy ? <span className="action-dialog-spinner" aria-hidden="true" /> : icon && <ActionDialogIcon name={icon} />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  )
}
