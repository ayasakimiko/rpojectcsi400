import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import ThaiDatePicker from './ThaiDatePicker.jsx'
import PhotoLightbox from './PhotoLightbox.jsx'
import { ContractImagePicker } from './RentalContract.jsx'
import { copyText } from '../utils/copyText.js'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'
import { API_ORIGIN } from '../config/api.js'
import { REPAIR_VENDOR_API_PREFIX } from '../config/serviceRoutes.js'
import {
  REPAIR_GUIDE_ENDPOINTS,
  REPAIR_GUIDE_ERRORS,
  REPAIR_GUIDE_RULES,
  REPAIR_STATUS_FIELDS,
  REPAIR_STATUS_FLOW,
  REPAIR_WEBHOOK_SAMPLE,
  REPAIR_GUIDE_FILE,
  REPAIR_GUIDE_TITLE,
  REPAIR_GUIDE_VERSION,
  downloadRepairGuideDocx,
  repairAiPrompt,
  repairClientSamples,
  repairGuideExamples,
} from '../utils/repairApiGuide.js'
import { downloadGuidePdf } from '../utils/marketApiGuide.js'
import { MAINTENANCE_CATEGORY_HINT, MAINTENANCE_CATEGORY_LABEL, MAINTENANCE_TIME_LABEL, MAINTENANCE_TIME_OPTIONS } from '../utils/maintenanceCategories.js'
import './MarketManager.css'
import './RepairVendorManager.css'

const API_BASE = '/api/staff/repair-vendors'
const CanEditContext = createContext(true)
const useCanEdit = () => useContext(CanEditContext)
const DATE_PORTAL = 'repair-date-portal'
const REFRESH_MS = 30000
const VENDOR_MIN_IMAGES = 5
const VENDOR_MAX_IMAGES = 10

const SECTIONS = [
  { key: 'jobs', label: 'งานที่ส่งช่าง', icon: 'send' },
  { key: 'vendors', label: 'ช่างที่ทำสัญญา', icon: 'wrench' },
  { key: 'api', label: 'API สำหรับช่าง', icon: 'code' },
]

const CATEGORY_LABEL = MAINTENANCE_CATEGORY_LABEL

const SPECIALTY_ICON = {
  electrical: 'bolt', plumbing: 'drop', aircon: 'snow', appliance: 'fridge', furniture: 'sofa',
  door: 'door', building: 'building', internet: 'wifi', pest: 'bug', other: 'dots',
}

const SPECIALTY_INFO = Object.fromEntries(Object.keys(MAINTENANCE_CATEGORY_LABEL).map((key) => [key, {
  icon: SPECIALTY_ICON[key] || 'dots',
  hint: key === 'other' ? 'ระบุงานที่รับเพิ่มเอง' : MAINTENANCE_CATEGORY_HINT[key],
}]))

const specialtyLabel = (vendor, key) => (key === 'other' && vendor.specialty_other ? `อื่นๆ: ${vendor.specialty_other}` : CATEGORY_LABEL[key] || key)

const TIME_LABEL = MAINTENANCE_TIME_LABEL

const CONTRACT_LABEL = { monthly: 'รายเดือน', yearly: 'รายปี' }

const JOB_STATUS = {
  sent: { label: 'รอช่างตอบรับ', tone: 'warning' },
  accepted: { label: 'ช่างรับงานแล้ว', tone: 'info' },
  in_progress: { label: 'กำลังซ่อม', tone: 'info' },
  done: { label: 'ซ่อมเสร็จ', tone: 'success' },
  rejected: { label: 'ช่างปฏิเสธ', tone: 'danger' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'muted' },
}

const JOB_FILTERS = [
  { key: 'open', label: 'กำลังดำเนินการ', match: (job) => ['sent', 'accepted', 'in_progress'].includes(job.status) },
  { key: 'sent', label: 'รอตอบรับ', match: (job) => job.status === 'sent' },
  { key: 'done', label: 'เสร็จแล้ว', match: (job) => job.status === 'done' },
  { key: 'closed', label: 'ปฏิเสธ/ยกเลิก', match: (job) => ['rejected', 'cancelled'].includes(job.status) },
  { key: 'all', label: 'ทั้งหมด', match: () => true },
]

const errorMessage = (error, fallback) => error.response?.data?.message || fallback
const thaiDate = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-')
const thaiDateTime = (value) => (value ? new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')
const money = (value) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const daysUntil = (key) => Math.round((new Date(`${key}T00:00:00`) - new Date(`${todayKey()}T00:00:00`)) / 86400000)

function contractEndFor(startKey, type) {
  if (!startKey) return ''
  const date = new Date(`${startKey}T00:00:00`)
  if (type === 'yearly') date.setFullYear(date.getFullYear() + 1)
  else date.setMonth(date.getMonth() + 1)
  date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function contractState(vendor) {
  if (!vendor.is_active) return { label: 'ปิดการใช้งาน', tone: 'muted' }
  const today = todayKey()
  if (vendor.contract_start > today) return { label: 'รอเริ่มสัญญา', tone: 'info' }
  const left = daysUntil(vendor.contract_end)
  if (left < 0) return { label: 'สัญญาหมดอายุ', tone: 'danger' }
  if (left <= 30) return { label: `เหลือ ${left} วัน`, tone: 'warning' }
  return { label: 'สัญญาใช้งานอยู่', tone: 'success' }
}

const ICON_PATHS = {
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7" /><path d="m17 6 2.5 2.5M14.5 8.5 16.5 10.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2M6 6l1 14h10l1-14" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  door: <><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" /><path d="M3 21h18M14 12h.01" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 10" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  contract: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  snow: <><path d="M12 2v20M4.9 6l14.2 12M4.9 18 19.1 6" /><path d="m9 4 3 2 3-2M9 20l3-2 3 2" /></>,
  sofa: <><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" /><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" /><path d="M5 18v2M19 18v2" /></>,
  fridge: <><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M6 9h12M9 5.5v1M9 12v3" /></>,
  building: <><path d="M3 21h18M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>,
  wifi: <><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><path d="M12 19.5h.01" /></>,
  bug: <><ellipse cx="12" cy="13" rx="4" ry="6" /><path d="M12 7V4M8 11H4M8 15H4.5M16 11h4M16 15h3.5" /></>,
  dots: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5-9 9" /></>,
}

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

function Pill({ tone, children }) {
  return <span className={`market-pill is-${tone}`}>{children}</span>
}

function JobStatusPill({ status }) {
  const info = JOB_STATUS[status] || { label: status, tone: 'muted' }
  return <Pill tone={info.tone}>{info.label}</Pill>
}

const openModals = []
const MODAL_EXIT_MS = 180

function RepairModal({ title, subtitle, icon = 'wrench', tone = 'primary', size = 'md', busy, error, onClose, onSubmit, submitLabel, submitDisabled, cancelLabel = 'ยกเลิก', hideCancel = false, footer, children }) {
  const titleId = useId()
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  const closingRef = useRef(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    closeRef.current = onClose
    busyRef.current = busy
  })

  const requestClose = useCallback(() => {
    if (closingRef.current || busyRef.current) return
    closingRef.current = true
    setClosing(true)
    setTimeout(() => closeRef.current(), MODAL_EXIT_MS)
  }, [])

  useEffect(() => {
    const unlock = lockBodyScroll()
    const token = {}
    openModals.push(token)
    const handleKey = (event) => {
      if (event.key === 'Escape' && openModals[openModals.length - 1] === token) requestClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      openModals.splice(openModals.indexOf(token), 1)
      unlock()
    }
  }, [requestClose])

  const Tag = onSubmit ? 'form' : 'div'
  return createPortal(
    <div className={`market-modal-overlay${closing ? ' is-closing' : ''}`} role="presentation" onClick={requestClose}>
      <Tag
        className={`market-modal repair-modal is-${tone} is-${size}`}
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
          <span className="market-modal-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="market-modal-close" aria-label="ปิด" disabled={busy} onClick={requestClose}>×</button>
        </header>
        <div className="market-modal-body">
          {children}
          {error && <p className="market-error" role="alert">{error}</p>}
        </div>
        {(onSubmit || footer) && (
          <footer className="market-modal-actions">
            {footer}
            {onSubmit && (
              <>
                {!hideCancel && <button type="button" className="market-btn" disabled={busy} onClick={requestClose}>{cancelLabel}</button>}
                <button type="submit" className={`market-btn ${tone === 'danger' ? 'is-danger' : 'is-primary'}`} disabled={busy || submitDisabled}>
                  {busy ? 'กำลังดำเนินการ...' : submitLabel}
                </button>
              </>
            )}
          </footer>
        )}
      </Tag>
    </div>,
    document.body,
  )
}

function Field({ label, hint, wide, name, flash, invalid, children }) {
  return (
    <label className={`market-field${wide ? ' is-wide' : ''}${invalid ? ' is-invalid' : ''}${flash ? ' is-flash' : ''}`} data-field={name}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function useSubmit(onDone) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (request, fallback) => {
    setBusy(true)
    setError('')
    try {
      const { data } = await request()
      await onDone(data)
    } catch (requestError) {
      setError(errorMessage(requestError, fallback))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function NoticeModal({ message, onClose }) {
  return (
    <RepairModal title="ดำเนินการสำเร็จ" icon="check" tone="success" size="sm" onClose={onClose} onSubmit={onClose} submitLabel="ตกลง" hideCancel>
      <p className="market-notice-message">{message}</p>
    </RepairModal>
  )
}

function ConfirmModal({ title, message, tone = 'danger', icon = 'trash', submitLabel, reasonLabel, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const { busy, error, run } = useSubmit(onClose)
  return (
    <RepairModal
      title={title}
      icon={icon}
      tone={tone}
      size="sm"
      busy={busy}
      error={error}
      onClose={onClose}
      submitLabel={submitLabel}
      submitDisabled={Boolean(reasonLabel) && !reason.trim()}
      onSubmit={() => run(() => onConfirm(reason.trim()), 'ดำเนินการไม่สำเร็จ')}
    >
      <p className="market-notice-message">{message}</p>
      {reasonLabel && (
        <Field label={reasonLabel} wide>
          <textarea className="market-input" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      )}
    </RepairModal>
  )
}

function InfoGrid({ items }) {
  return (
    <div className="market-info-grid is-3">
      {items.map((item) => (
        <div key={item.label} className={`market-info-item is-${item.tone || 'plain'}`}>
          <span className="market-info-icon"><Icon name={item.icon} size={17} /></span>
          <span className="market-info-text">
            <small>{item.label}</small>
            <strong title={String(item.value)}>{item.value}</strong>
          </span>
        </div>
      ))}
    </div>
  )
}

const EMPTY_VENDOR = {
  name: '', contact_name: '', phone: '', email: '', specialties: [], specialty_other: '', contract_type: 'monthly',
  contract_start: '', contract_end: '', contract_fee: '', webhook_url: '', note: '', is_active: true,
}

function FormStep({ number, title, hint, children }) {
  return (
    <section className="market-step">
      <header className="market-step-head">
        <span className="market-step-number">{number}</span>
        <div>
          <h4>{title}</h4>
          {hint && <small>{hint}</small>}
        </div>
      </header>
      {children}
    </section>
  )
}

function VendorFormModal({ vendor, onClose, onSaved }) {
  const [form, setForm] = useState(() => (vendor ? {
    ...EMPTY_VENDOR,
    ...vendor,
    contact_name: vendor.contact_name || '',
    email: vendor.email || '',
    contract_fee: vendor.contract_fee ?? '',
    webhook_url: vendor.webhook_url || '',
    note: vendor.note || '',
    specialty_other: vendor.specialty_other || '',
  } : { ...EMPTY_VENDOR, contract_start: todayKey(), contract_end: contractEndFor(todayKey(), 'monthly') }))
  const [images, setImages] = useState([])
  const [touched, setTouched] = useState(false)
  const [flash, setFlash] = useState('')
  const flashTimer = useRef(null)
  const formRef = useRef(null)
  const { busy, error, run } = useSubmit((data) => onSaved(data.message))
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const toggleSpecialty = (key) => setForm((current) => ({
    ...current,
    specialties: current.specialties.includes(key) ? current.specialties.filter((item) => item !== key) : [...current.specialties, key],
  }))
  const setType = (type) => setForm((current) => ({ ...current, contract_type: type, contract_end: contractEndFor(current.contract_start, type) }))
  const setStart = (value) => setForm((current) => ({ ...current, contract_start: value, contract_end: contractEndFor(value, current.contract_type) }))

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const missing = [
    !form.name.trim() && { key: 'name', label: 'ชื่อร้าน/บริษัทช่าง' },
    !/^0\d{8,9}$/.test(form.phone) && { key: 'phone', label: 'เบอร์โทร' },
    form.specialties.length === 0 && { key: 'specialties', label: 'ประเภทงานที่รับซ่อม' },
    form.specialties.includes('other') && !form.specialty_other.trim() && { key: 'specialty_other', label: 'ระบุงานประเภทอื่นๆ' },
    (!form.contract_start || !form.contract_end || form.contract_end < form.contract_start) && { key: form.contract_start ? 'contract_end' : 'contract_start', label: 'ช่วงวันที่สัญญา' },
    !vendor && images.length < VENDOR_MIN_IMAGES && { key: 'images', label: `รูปสัญญาอีก ${VENDOR_MIN_IMAGES - images.length} รูป` },
  ].filter(Boolean)
  const missingKeys = new Set(missing.map((item) => item.key))
  const fieldState = (key) => ({ name: key, flash: flash === key, invalid: touched && missingKeys.has(key) })

  const focusField = (key) => {
    requestAnimationFrame(() => {
      const node = formRef.current?.querySelector(`[data-field="${key}"]`)
      if (!node) return
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      node.querySelector('input:not([type="hidden"]):not([type="file"]), textarea, button')?.focus({ preventScroll: true })
      setFlash('')
      requestAnimationFrame(() => setFlash(key))
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(''), 1800)
    })
  }

  const payload = {
    name: form.name.trim(),
    contact_name: form.contact_name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    specialties: form.specialties,
    specialty_other: form.specialties.includes('other') ? form.specialty_other.trim() : '',
    contract_type: form.contract_type,
    contract_start: form.contract_start,
    contract_end: form.contract_end,
    contract_fee: form.contract_fee === '' ? null : Number(form.contract_fee),
    webhook_url: form.webhook_url.trim(),
    note: form.note.trim(),
    is_active: form.is_active,
  }

  const submit = () => {
    setTouched(true)
    if (missing.length > 0) {
      focusField(missing[0].key)
      return
    }
    if (vendor) {
      run(() => axios.put(`${API_BASE}/vendors/${vendor.id}`, payload), 'บันทึกข้อมูลช่างไม่สำเร็จ')
      return
    }
    const body = new FormData()
    body.append('payload', JSON.stringify(payload))
    for (const file of images) body.append('contract_images', file)
    run(() => axios.post(`${API_BASE}/vendors`, body), 'เพิ่มช่างที่ทำสัญญาไม่สำเร็จ')
  }

  const today = todayKey()
  const days = form.contract_start && form.contract_end >= form.contract_start
    ? Math.round((new Date(`${form.contract_end}T00:00:00`) - new Date(`${form.contract_start}T00:00:00`)) / 86400000) + 1
    : 0
  const previewVendor = {
    id: 0,
    name: payload.name || 'ชื่อร้าน/บริษัทช่าง',
    contact_name: payload.contact_name,
    phone: payload.phone || '0xxxxxxxxx',
    specialties: form.specialties,
    specialty_other: payload.specialty_other,
    contract_type: form.contract_type,
    contract_start: form.contract_start || today,
    contract_end: form.contract_end || today,
    is_active: form.is_active,
    is_usable: form.is_active && (form.contract_start || today) <= today && (form.contract_end || today) >= today,
    open_jobs: vendor?.open_jobs || 0,
    active_keys: vendor?.active_keys || 0,
    image_count: vendor ? vendor.image_count : images.length,
    webhook_url: payload.webhook_url,
  }
  const blockState = (key) => `market-field-block${fieldState(key).invalid ? ' is-invalid' : ''}${fieldState(key).flash ? ' is-flash' : ''}`

  return (
    <RepairModal
      title={vendor ? 'แก้ไขข้อมูลช่าง' : 'เพิ่มช่างที่ทำสัญญาซ่อม'}
      subtitle="ช่างหรือบริษัทที่หอพักทำสัญญาซ่อมบำรุงรายเดือน/รายปี"
      icon="wrench"
      size="xxl"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={vendor ? 'บันทึกการแก้ไข' : 'บันทึกช่างและสัญญา'}
    >
      <div className="market-lease-form is-shop-form" ref={formRef}>
        <div className="market-lease-form-main">
          <FormStep number="1" title="ข้อมูลช่าง">
            <div className="market-form-grid">
              <Field {...fieldState('name')} label="ชื่อร้าน/บริษัทช่าง *"><input className="market-input" value={form.name} maxLength={150} placeholder="เช่น ช่างแอร์บ้านสบาย" onChange={set('name')} /></Field>
              <Field label="ชื่อผู้ติดต่อ"><input className="market-input" value={form.contact_name} maxLength={150} placeholder="ไม่บังคับ" onChange={set('contact_name')} /></Field>
              <Field {...fieldState('phone')} label="เบอร์โทรศัพท์ *" hint={`${form.phone.length}/10 หลัก`}>
                <input className="market-input" inputMode="numeric" value={form.phone} placeholder="0812345678" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
              </Field>
              <Field label="อีเมล"><input className="market-input" type="email" value={form.email} maxLength={255} placeholder="ไม่บังคับ" onChange={set('email')} /></Field>
            </div>
          </FormStep>

          <FormStep number="2" title="ประเภทงานที่รับซ่อม" hint={`เลือกได้หลายอย่าง ใช้แนะนำช่างตอนส่งงาน · เลือกแล้ว ${form.specialties.length} ประเภท`}>
            <div className={blockState('specialties')} data-field="specialties">
              <div className="repair-specialty-grid" role="group" aria-label="ประเภทงานที่รับซ่อม">
                {Object.entries(CATEGORY_LABEL).map(([key, label]) => {
                  const selected = form.specialties.includes(key)
                  return (
                    <button key={key} type="button" aria-pressed={selected} className={`repair-specialty-option${selected ? ' is-selected' : ''}`} onClick={() => toggleSpecialty(key)}>
                      <span className="repair-specialty-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                      <span className="repair-specialty-icon"><Icon name={SPECIALTY_INFO[key].icon} size={20} /></span>
                      <strong>{label}</strong>
                      <small>{SPECIALTY_INFO[key].hint}</small>
                    </button>
                  )
                })}
              </div>
            </div>
            {form.specialties.includes('other') && (
              <Field {...fieldState('specialty_other')} label="งานประเภทอื่นๆ ที่รับซ่อม *" wide hint={`${form.specialty_other.length}/150 ตัวอักษร · คั่นหลายอย่างด้วยเครื่องหมายจุลภาค`}>
                <input className="market-input" value={form.specialty_other} maxLength={150} placeholder="เช่น ปั๊มน้ำ, กล้องวงจรปิด, ประตูคีย์การ์ด" onChange={set('specialty_other')} />
              </Field>
            )}
          </FormStep>

          <FormStep number="3" title="สัญญาซ่อม">
            <div className="market-form-grid">
              <Field label="รูปแบบสัญญา *" wide>
                <div className="market-segment is-even is-deposit" role="group" aria-label="รูปแบบสัญญา">
                  {Object.entries(CONTRACT_LABEL).map(([key, label]) => (
                    <button key={key} type="button" className={form.contract_type === key ? 'is-active' : ''} onClick={() => setType(key)}>
                      <span>{label}</span>
                      <small>{key === 'yearly' ? 'ระยะสัญญา 12 เดือน' : 'ระยะสัญญา 1 เดือน'}</small>
                    </button>
                  ))}
                </div>
              </Field>
              <Field {...fieldState('contract_start')} label="วันเริ่มสัญญา *">
                <ThaiDatePicker className="form-control market-date-input" value={form.contract_start} placeholder="เลือกวันเริ่มสัญญา" portalId={DATE_PORTAL} onChange={setStart} />
              </Field>
              <Field {...fieldState('contract_end')} label="วันสิ้นสุดสัญญา *" hint={`คำนวณจากสัญญา${CONTRACT_LABEL[form.contract_type]} แก้ได้`}>
                <ThaiDatePicker
                  className="form-control market-date-input"
                  value={form.contract_end}
                  placeholder="เลือกวันสิ้นสุดสัญญา"
                  minDate={form.contract_start ? new Date(`${form.contract_start}T00:00:00`) : undefined}
                  portalId={DATE_PORTAL}
                  onChange={(value) => setForm((current) => ({ ...current, contract_end: value }))}
                />
              </Field>
              <Field label={`ค่าสัญญา${form.contract_type === 'yearly' ? 'ต่อปี' : 'ต่อเดือน'} (บาท)`} hint="ไม่บังคับ">
                <input className="market-input" type="number" min="0" step="0.01" value={form.contract_fee} placeholder="0" onChange={set('contract_fee')} />
              </Field>
              {vendor && (
                <Field label="สถานะ">
                  <div className="market-segment is-even" role="group" aria-label="สถานะช่าง">
                    <button type="button" className={form.is_active ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, is_active: true }))}>ใช้งาน</button>
                    <button type="button" className={!form.is_active ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, is_active: false }))}>ปิดการใช้งาน</button>
                  </div>
                </Field>
              )}
            </div>
          </FormStep>

          <FormStep number="4" title="การเชื่อมต่อระบบ" hint="ไม่บังคับ ถ้าระบบของช่างมี URL รับแจ้งเตือน หอพักจะ POST งานใหม่ไปให้ทันทีที่กดส่ง">
            <div className="market-form-grid">
              <Field label="Webhook URL" wide><input className="market-input" value={form.webhook_url} maxLength={500} placeholder="https://example.com/webhooks/dorm-repair" onChange={set('webhook_url')} /></Field>
              <Field label="หมายเหตุ" wide><textarea className="market-input" rows={3} maxLength={500} value={form.note} placeholder="เงื่อนไขการเรียกช่าง เวลาให้บริการ ฯลฯ" onChange={set('note')} /></Field>
            </div>
          </FormStep>

          {!vendor && (
            <FormStep number="5" title="รูปสัญญาซ่อม" hint={`แนบอย่างน้อย ${VENDOR_MIN_IMAGES} รูป (สูงสุด ${VENDOR_MAX_IMAGES} รูป)`}>
              <div className={blockState('images')} data-field="images">
                <ContractImagePicker files={images} onChange={setImages} min={VENDOR_MIN_IMAGES} error={touched && images.length < VENDOR_MIN_IMAGES ? `กรุณาแนบรูปสัญญาอย่างน้อย ${VENDOR_MIN_IMAGES} รูป` : ''} />
              </div>
            </FormStep>
          )}
        </div>

        <aside className="market-lease-summary">
          <h4>ตัวอย่างการ์ดช่าง</h4>
          <small className="market-card-preview-hint">หน้าตาจริงที่จะแสดงในรายการช่างที่ทำสัญญา</small>
          <div className="market-card-preview" aria-hidden="true" inert="">
            <VendorCard vendor={previewVendor} onOpen={() => {}} onSend={() => {}} />
          </div>
          <div className="market-lease-summary-total">
            <span>ระยะสัญญา{CONTRACT_LABEL[form.contract_type]}</span>
            <strong>{days ? `${days.toLocaleString('th-TH')} วัน` : '-'}</strong>
            <small>{form.contract_start && form.contract_end ? `${thaiDate(form.contract_start)} - ${thaiDate(form.contract_end)}` : 'เลือกช่วงวันที่สัญญา'}</small>
          </div>
          <div className={`market-lease-summary-check${missing.length ? '' : ' is-ready'}`}>
            {missing.length ? (
              <>
                <strong>ยังขาดข้อมูล · กดเพื่อไปที่ช่องนั้น</strong>
                <ul>{missing.map((item) => <li key={item.key}><button type="button" className="market-missing-link" onClick={() => focusField(item.key)}>{item.label}</button></li>)}</ul>
              </>
            ) : <strong>{vendor ? 'ข้อมูลครบ บันทึกการแก้ไขได้' : 'ข้อมูลครบ บันทึกช่างและสัญญาได้'}</strong>}
          </div>
        </aside>
      </div>
    </RepairModal>
  )
}

function useVendorImageUrls(images) {
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let active = true
    const created = []
    Promise.all(images.map((image) => axios.get(`${API_BASE}/vendor-images/${image.id}`, { responseType: 'blob' })
      .then(({ data }) => {
        const url = URL.createObjectURL(data)
        created.push(url)
        return [image.id, url]
      })
      .catch(() => [image.id, null])))
      .then((entries) => {
        if (active) setUrls(Object.fromEntries(entries))
      })
    return () => {
      active = false
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [images])
  return urls
}

function VendorGallery({ vendor, images, onChanged }) {
  const canEdit = useCanEdit()
  const urls = useVendorImageUrls(images)
  const [openIndex, setOpenIndex] = useState(null)
  const [removing, setRemoving] = useState(null)
  const inputRef = useRef(null)
  const { busy, error, run } = useSubmit((data) => onChanged(data.images))
  const photos = images.map((image) => ({ url: urls[image.id], name: image.name })).filter((photo) => photo.url)
  const canRemove = canEdit && images.length > VENDOR_MIN_IMAGES
  const full = images.length >= VENDOR_MAX_IMAGES
  const upload = (files) => {
    if (!files.length) return
    const body = new FormData()
    for (const file of files) body.append('contract_images', file)
    run(() => axios.post(`${API_BASE}/vendors/${vendor.id}/images`, body), 'แนบรูปสัญญาไม่สำเร็จ')
  }
  return (
    <section className="market-section market-lease-gallery-section">
      <div className="market-section-head">
        <h4><span className="market-section-icon"><Icon name="image" size={15} /></span> รูปสัญญาซ่อม <span className="market-count">{images.length}/{VENDOR_MAX_IMAGES}</span></h4>
        {canEdit && (
          <button type="button" className="market-link-btn" disabled={busy || full} onClick={() => inputRef.current?.click()}>
            <Icon name="plus" size={14} /> {busy ? 'กำลังอัปโหลด...' : full ? 'ครบจำนวนสูงสุด' : 'แนบรูปเพิ่ม'}
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => {
          upload([...event.target.files])
          event.target.value = ''
        }} />
      </div>
      {error && <p className="market-error">{error}</p>}
      {images.length === 0 ? (
        <div className="market-gallery-empty">
          <Icon name="image" size={22} />
          <strong>ยังไม่มีรูปสัญญา</strong>
          <span>แนบรูปสัญญาซ่อมอย่างน้อย {VENDOR_MIN_IMAGES} รูป</span>
        </div>
      ) : (
        <ul className="market-gallery">
          {images.map((image, index) => (
            <li key={image.id} className="repair-gallery-item">
              <button type="button" aria-label={`ดูรูปสัญญา ${index + 1}`} disabled={!urls[image.id]} onClick={() => setOpenIndex(photos.findIndex((photo) => photo.url === urls[image.id]))}>
                {urls[image.id] ? <img src={urls[image.id]} alt="" /> : <span className="market-gallery-loading" />}
                <span className="market-gallery-index">{index + 1}</span>
              </button>
              {canRemove && (
                <button type="button" className="repair-gallery-remove" aria-label={`ลบรูปสัญญา ${index + 1}`} onClick={() => setRemoving(image)}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && <small className="repair-gallery-hint">ต้องมีรูปสัญญาอย่างน้อย {VENDOR_MIN_IMAGES} รูป{canRemove ? '' : ' จึงลบรูปเพิ่มไม่ได้'}</small>}
      {openIndex !== null && openIndex >= 0 && createPortal(
        <div className="market-lightbox-layer" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <PhotoLightbox photos={photos} initialIndex={openIndex} title={`สัญญาซ่อม ${vendor.name}`} subtitle={`สัญญา${CONTRACT_LABEL[vendor.contract_type]}`} label="รูปสัญญาซ่อม" onClose={() => setOpenIndex(null)} />
        </div>,
        document.body,
      )}
      {removing && (
        <ConfirmModal
          title="ลบรูปสัญญา"
          message={`ลบรูป "${removing.name}" ออกจากสัญญาของ ${vendor.name}`}
          submitLabel="ลบรูป"
          icon="trash"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const response = await axios.delete(`${API_BASE}/vendor-images/${removing.id}`)
            onChanged(response.data.images)
            return response
          }}
        />
      )}
    </section>
  )
}

function KeyToken({ apiKey, canReveal }) {
  const [full, setFull] = useState('')
  const [shown, setShown] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const masked = `${apiKey.key_prefix}_••••••••`

  const loadFull = async () => {
    if (full) return full
    setLoading(true)
    try {
      const { data } = await axios.get(`${API_BASE}/api-keys/${apiKey.id}/reveal`)
      setFull(data.api_key)
      return data.api_key
    } catch (error) {
      setStatus(errorMessage(error, 'เปิดดู key ไม่สำเร็จ'))
      return ''
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    setStatus('')
    const value = full || await loadFull()
    if (!value) return
    try {
      await copyText(value)
      setStatus('คัดลอกแล้ว')
      setTimeout(() => setStatus((current) => (current === 'คัดลอกแล้ว' ? '' : current)), 1600)
    } catch {
      setShown(true)
      setStatus('เบราว์เซอร์ไม่อนุญาตให้คัดลอก เลือก key แล้วคัดลอกเองได้')
    }
  }

  if (!canReveal || !apiKey.can_reveal) {
    return <div className="market-key-token"><code className="market-key-code">{masked}</code></div>
  }

  return (
    <div className="market-key-token">
      <button
        type="button"
        className={`market-key-code is-button${shown ? ' is-shown' : ''}`}
        aria-pressed={shown}
        disabled={loading}
        onClick={async () => {
          setStatus('')
          if (shown) setShown(false)
          else if (await loadFull()) setShown(true)
        }}
      >
        <span>{loading ? 'กำลังโหลด...' : shown ? full : masked}</span>
        <Icon name={shown ? 'eyeOff' : 'eye'} size={13} />
      </button>
      <button type="button" className="market-key-copy" disabled={loading} onClick={copy}>
        <Icon name="copy" size={13} /> คัดลอก
      </button>
      {status && <small role="status" className={`market-key-token-note${status === 'คัดลอกแล้ว' ? ' is-ok' : ' is-error'}`}>{status}</small>}
    </div>
  )
}

function ApiKeyPanel({ vendor, apiKeys, onChanged }) {
  const canEdit = useCanEdit()
  const [label, setLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [dialog, setDialog] = useState(null)
  const { busy, error, run } = useSubmit((data) => {
    setNewKey(data.api_key)
    setLabel('')
    onChanged(data.api_keys)
  })

  return (
    <section className="market-section">
      <div className="market-section-head">
        <h4><Icon name="key" size={16} /> API key ของช่าง</h4>
        <small>ช่างใช้ดึงงานซ่อมที่หอพักส่งให้ และเปลี่ยนสถานะงานได้</small>
      </div>
      {newKey && (
        <div className="market-new-key" role="status">
          <p>ส่ง API key นี้ให้ช่างพร้อมคู่มือในแท็บ "API สำหรับช่าง"</p>
          <div>
            <code>{newKey}</code>
            <button type="button" className="market-btn is-small" onClick={async () => {
              try {
                await copyText(newKey)
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              } catch {
                setCopied(false)
              }
            }}><Icon name="copy" size={14} /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>
          </div>
        </div>
      )}
      {canEdit && vendor.is_active && (
        <form className="market-key-form" onSubmit={(event) => {
          event.preventDefault()
          if (label.trim()) run(() => axios.post(`${API_BASE}/vendors/${vendor.id}/api-keys`, { label: label.trim() }), 'สร้าง API key ไม่สำเร็จ')
        }}>
          <input className="market-input" placeholder="ชื่อเรียก เช่น ระบบรับงานของบริษัท" value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} />
          <button type="submit" className="market-btn is-primary" disabled={busy || !label.trim()}><Icon name="plus" size={14} /> ออก API key</button>
        </form>
      )}
      {error && <p className="market-error" role="alert">{error}</p>}
      <ul className="market-key-list">
        {apiKeys.length === 0 && <li className="market-empty-line">ยังไม่มี API key</li>}
        {apiKeys.map((key) => (
          <li key={key.id} className={`market-key-item${key.revoked_at ? ' is-revoked' : ''}`}>
            <span className="market-key-icon"><Icon name="key" size={18} /></span>
            <div className="market-key-main">
              <div className="market-key-title">
                <strong title={key.label}>{key.label}</strong>
                <Pill tone={key.revoked_at ? 'danger' : key.last_used_at ? 'success' : 'info'}>
                  {key.revoked_at ? 'ยกเลิกแล้ว' : key.last_used_at ? 'ใช้งานอยู่' : 'ยังไม่เคยใช้'}
                </Pill>
              </div>
              <KeyToken apiKey={key} canReveal={canEdit && !key.revoked_at} />
              <div className="market-key-meta">
                <span><Icon name="user" size={12} /> {key.created_by_name}</span>
                <span><Icon name="calendar" size={12} /> ออก {thaiDateTime(key.created_at)}</span>
                <span><Icon name="clock" size={12} /> {key.revoked_at ? `ยกเลิก ${thaiDateTime(key.revoked_at)}` : key.last_used_at ? `ใช้ล่าสุด ${thaiDateTime(key.last_used_at)}` : 'ยังไม่มีการเรียกใช้'}</span>
              </div>
            </div>
            {canEdit && !key.revoked_at && (
              <span className="repair-key-actions">
                <button type="button" className="market-row-btn" onClick={() => setDialog({ type: 'rotate', key })}><Icon name="key" size={13} /> ออกใหม่แทน</button>
                <button type="button" className="market-row-btn is-danger" onClick={() => setDialog({ type: 'revoke', key })}><Icon name="trash" size={13} /> ยกเลิก</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {dialog?.type === 'rotate' && (
        <ConfirmModal
          title="ออก key ใหม่แทน"
          message={`ระบบจะยกเลิก "${dialog.key.label}" เดิม และออก key ใหม่ชื่อเดียวกัน ระบบของช่างต้องเปลี่ยนไปใช้ key ใหม่`}
          submitLabel="ออก key ใหม่"
          tone="primary"
          icon="key"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const response = await axios.post(`${API_BASE}/api-keys/${dialog.key.id}/rotate`, {})
            setNewKey(response.data.api_key)
            onChanged(response.data.api_keys)
            return response
          }}
        />
      )}
      {dialog?.type === 'revoke' && (
        <ConfirmModal
          title="ยกเลิก API key"
          message={`ยกเลิก "${dialog.key.label}" แล้ว ระบบของช่างที่ใช้ key นี้จะเรียก API ไม่ได้ทันที`}
          submitLabel="ยกเลิก API key"
          icon="key"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const response = await axios.post(`${API_BASE}/api-keys/${dialog.key.id}/revoke`, {})
            onChanged(response.data.api_keys)
            return response
          }}
        />
      )}
    </section>
  )
}

const RECENT_JOBS_PREVIEW = 5

function VendorJobRow({ job, onOpen }) {
  return (
    <li>
      <button type="button" className="repair-job-row" onClick={() => onOpen(job)}>
        <span className="repair-room-chip"><small>ห้อง</small>{job.room_number}</span>
        <span className="repair-mini-text">
          <strong>
            {CATEGORY_LABEL[job.category]}
            {job.urgency === 'urgent' && <em className="repair-urgent-tag">ด่วน</em>}
          </strong>
          <small title={job.description}>{job.description}</small>
        </span>
        <span className="repair-job-row-side">
          <JobStatusPill status={job.status} />
          <small>{thaiDateTime(job.created_at)}</small>
        </span>
      </button>
    </li>
  )
}

function VendorJobsModal({ vendor, jobs, onClose, onOpenJob }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const matcher = JOB_FILTERS.find((item) => item.key === filter)?.match || (() => true)
  const term = search.trim().toLowerCase()
  const visible = jobs.filter((job) => matcher(job) && (!term || [String(job.room_number), job.description, job.technician_name, job.vendor_note, CATEGORY_LABEL[job.category], JOB_STATUS[job.status]?.label]
    .some((value) => value?.toLowerCase().includes(term))))
  return (
    <RepairModal title={`งานทั้งหมดของ ${vendor.name}`} subtitle={`ส่งงานให้ช่างรายนี้ทั้งหมด ${jobs.length} งาน`} icon="clock" size="lg" onClose={onClose}>
      <div className="repair-all-jobs">
        <div className="market-search repair-all-jobs-search">
          <Icon name="search" size={16} />
          <input autoFocus placeholder="ค้นหาเลขห้อง รายละเอียด ชื่อช่าง หรือสถานะ" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="market-chips" role="group" aria-label="กรองสถานะงาน">
          {JOB_FILTERS.map((item) => (
            <button key={item.key} type="button" className={`market-chip repair-filter-chip is-${item.key}${filter === item.key ? ' is-active' : ''}`} onClick={() => setFilter(item.key)}>
              {item.label} <span>{jobs.filter(item.match).length}</span>
            </button>
          ))}
        </div>
        <ul className="repair-mini-jobs is-full">
          {visible.length === 0 && <li className="market-empty-line">ไม่พบงานที่ตรงกับการค้นหา</li>}
          {visible.map((job) => <VendorJobRow key={job.id} job={job} onOpen={onOpenJob} />)}
        </ul>
        <small className="repair-gallery-hint">แสดง {visible.length} จาก {jobs.length} งาน · กดที่งานเพื่อดูรายละเอียด</small>
      </div>
    </RepairModal>
  )
}

function VendorDetailModal({ vendorId, onClose, onChanged, onSendJob, onOpenJob }) {
  const canEdit = useCanEdit()
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [editing, setEditing] = useState(false)
  const [showAllJobs, setShowAllJobs] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const load = () => setReloadKey((value) => value + 1)

  useEffect(() => {
    let active = true
    axios.get(`${API_BASE}/vendors/${vendorId}`)
      .then(({ data }) => {
        if (active) setState({ loading: false, error: '', data })
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: errorMessage(error, 'โหลดข้อมูลช่างไม่สำเร็จ'), data: null })
      })
    return () => {
      active = false
    }
  }, [vendorId, reloadKey])

  const data = state.data
  const vendor = data?.vendor
  const contract = vendor && contractState(vendor)

  return (
    <RepairModal
      title={vendor?.name || 'ข้อมูลช่าง'}
      subtitle={vendor ? `สัญญา${CONTRACT_LABEL[vendor.contract_type]} · ${thaiDate(vendor.contract_start)} - ${thaiDate(vendor.contract_end)}` : null}
      icon="wrench"
      size="lg"
      onClose={onClose}
      footer={canEdit && vendor && (
        <>
          <button type="button" className="market-btn" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> แก้ไขข้อมูล</button>
          {vendor.is_usable && <button type="button" className="market-btn is-primary" onClick={() => onSendJob(vendor.id)}><Icon name="send" size={14} /> ส่งงานให้ช่างรายนี้</button>}
        </>
      )}
    >
      {state.loading && <p className="market-empty">กำลังโหลด...</p>}
      {state.error && <p className="market-error" role="alert">{state.error}</p>}
      {vendor && (
        <div className="repair-detail">
          <section className="market-section">
            <div className="market-section-head">
              <h4><Icon name="contract" size={16} /> ข้อมูลช่างและสัญญา</h4>
              <Pill tone={contract.tone}>{contract.label}</Pill>
            </div>
            <InfoGrid items={[
              { label: 'ผู้ติดต่อ', value: vendor.contact_name || '-', icon: 'user' },
              { label: 'เบอร์โทร', value: vendor.phone, icon: 'phone' },
              { label: 'อีเมล', value: vendor.email || '-', icon: 'mail' },
              { label: 'รูปแบบสัญญา', value: CONTRACT_LABEL[vendor.contract_type], icon: 'contract', tone: 'blue' },
              { label: 'ค่าสัญญา', value: vendor.contract_fee == null ? '-' : `฿${money(vendor.contract_fee)}`, icon: 'calendar' },
              { label: 'งานที่ยังไม่ปิด', value: `${vendor.open_jobs} งาน`, icon: 'wrench' },
            ]} />
            <div className="repair-tag-row">
              {vendor.specialties.map((key) => <span key={key} className={`repair-tag is-${key}`}>{specialtyLabel(vendor, key)}</span>)}
            </div>
            <p className="repair-webhook-line">
              <Icon name="link" size={14} />
              {vendor.webhook_url ? <>Webhook: <code>{vendor.webhook_url}</code></> : 'ไม่ได้ตั้ง Webhook ช่างต้องดึงงานผ่าน GET /jobs'}
            </p>
            {vendor.note && <p className="repair-note">{vendor.note}</p>}
          </section>
          <VendorGallery vendor={vendor} images={data.images} onChanged={(images) => {
            setState((current) => ({ ...current, data: { ...current.data, images } }))
            onChanged()
          }} />
          <ApiKeyPanel vendor={vendor} apiKeys={data.api_keys} onChanged={(apiKeys) => {
            setState((current) => ({ ...current, data: { ...current.data, api_keys: apiKeys } }))
            onChanged()
          }} />
          <section className="market-section">
            <div className="market-section-head">
              <h4><span className="market-section-icon"><Icon name="clock" size={15} /></span> งานล่าสุดของช่างรายนี้ <span className="market-count">{data.jobs.length}</span></h4>
              {data.jobs.length > 0 && (
                <button type="button" className="market-link-btn" onClick={() => setShowAllJobs(true)}>
                  <Icon name="search" size={14} /> ดูทั้งหมด / ค้นหา
                </button>
              )}
            </div>
            <ul className="repair-mini-jobs">
              {data.jobs.length === 0 && <li className="market-empty-line">ยังไม่เคยส่งงานให้ช่างรายนี้</li>}
              {data.jobs.slice(0, RECENT_JOBS_PREVIEW).map((job) => <VendorJobRow key={job.id} job={job} onOpen={onOpenJob} />)}
            </ul>
            {data.jobs.length > RECENT_JOBS_PREVIEW && (
              <button type="button" className="repair-more-btn" onClick={() => setShowAllJobs(true)}>
                ดูอีก {data.jobs.length - RECENT_JOBS_PREVIEW} งาน <span aria-hidden="true">›</span>
              </button>
            )}
          </section>
        </div>
      )}
      {showAllJobs && vendor && (
        <VendorJobsModal vendor={vendor} jobs={data.jobs} onClose={() => setShowAllJobs(false)} onOpenJob={onOpenJob} />
      )}
      {editing && vendor && (
        <VendorFormModal vendor={vendor} onClose={() => setEditing(false)} onSaved={(message) => {
          setEditing(false)
          load()
          onChanged(message)
        }} />
      )}
    </RepairModal>
  )
}

const URGENT_KEYWORDS = [
  'ไฟดับ', 'ไฟช็อต', 'ไฟช๊อต', 'ไฟรั่ว', 'ไฟไหม้', 'ควัน', 'ประกายไฟ', 'สายไฟไหม้', 'เบรกเกอร์ตัด', 'เบรคเกอร์ตัด', 'ไฟฟ้าดับ',
  'น้ำรั่ว', 'น้ำท่วม', 'ท่อแตก', 'น้ำไม่ไหล', 'ไม่มีน้ำ', 'น้ำทะลัก', 'ส้วมตัน', 'ชักโครกตัน', 'ห้องน้ำตัน', 'น้ำเอ่อ',
  'กลิ่นแก๊ส', 'แก๊สรั่ว', 'ประตูล็อก', 'ประตูล็อค', 'เข้าห้องไม่ได้', 'ล็อกไม่ได้', 'ล็อคไม่ได้', 'กุญแจหาย', 'กุญแจหัก', 'ปิดประตูไม่ได้',
  'เพดานถล่ม', 'เพดานพัง', 'กระจกแตก', 'อันตราย', 'ด่วน', 'ฉุกเฉิน', 'งูเข้า', 'รังผึ้ง', 'รังต่อ',
]
const URGENT_WAIT_DAYS = 3

function suggestUrgency({ description, request }) {
  const text = description.replace(/\s+/g, '')
  const keyword = URGENT_KEYWORDS.find((word) => word.length > 1 && text.includes(word))
  if (keyword) return { level: 'urgent', reason: `พบคำว่า "${keyword}" ในรายละเอียด` }
  if (request) {
    const days = Math.floor((Date.now() - new Date(request.created_at).getTime()) / 86400000)
    if (days >= URGENT_WAIT_DAYS) return { level: 'urgent', reason: `ผู้เช่ารอมาแล้ว ${days} วัน` }
  }
  return { level: 'normal', reason: 'ไม่พบอาการที่ต้องเข้าซ่อมทันที' }
}

function JobFormModal({ data, rooms, initialVendorId, onClose, onSaved }) {
  const usableVendors = data.vendors.filter((vendor) => vendor.is_usable)
  const [form, setForm] = useState({
    vendor_id: initialVendorId || usableVendors[0]?.id || '',
    maintenance_request_id: '',
    room_number: '',
    category: 'other',
    urgency: 'normal',
    description: '',
    contact_phone: '',
    preferred_time: 'anytime',
  })
  const [roomSearch, setRoomSearch] = useState('')
  const [urgencyManual, setUrgencyManual] = useState(false)
  const [touched, setTouched] = useState(false)
  const [flash, setFlash] = useState('')
  const flashTimer = useRef(null)
  const formRef = useRef(null)
  const { busy, error, run } = useSubmit((result) => onSaved(result.message))
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const roomOptions = useMemo(() => [...rooms].sort((a, b) => Number(a.room_number) - Number(b.room_number)), [rooms])
  const roomTerm = roomSearch.trim().toLowerCase()
  const visibleRooms = roomOptions.filter((room) => !roomTerm || [String(room.room_number), room.tenant?.first_name, room.tenant?.last_name]
    .some((value) => value?.toLowerCase().includes(roomTerm)))
  const vendor = usableVendors.find((item) => String(item.id) === String(form.vendor_id))
  const selectedRoom = rooms.find((item) => String(item.room_number) === String(form.room_number))
  const roomRequests = data.open_requests.filter((request) => String(request.room_number) === String(form.room_number))
  const outsideSpecialty = vendor && !vendor.specialties.includes(form.category)

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const pickRequest = (id) => {
    const request = data.open_requests.find((item) => String(item.id) === String(id))
    setForm((current) => (request ? {
      ...current,
      maintenance_request_id: request.id,
      room_number: String(request.room_number),
      category: request.category,
      description: request.description,
      contact_phone: request.contact_phone || request.phone || '',
      preferred_time: request.preferred_time || 'anytime',
    } : { ...current, maintenance_request_id: '' }))
  }

  const pickRoom = (value) => {
    const room = rooms.find((item) => String(item.room_number) === value)
    const previous = rooms.find((item) => String(item.room_number) === String(form.room_number))
    setForm((current) => ({
      ...current,
      room_number: value,
      maintenance_request_id: '',
      contact_phone: !current.contact_phone || current.contact_phone === previous?.tenant?.phone ? room?.tenant?.phone || '' : current.contact_phone,
    }))
  }

  const missing = [
    !vendor && { key: 'vendor', label: 'เลือกช่าง' },
    !form.room_number && { key: 'room', label: 'เลือกห้องที่ต้องซ่อม' },
    form.contact_phone && !/^0\d{8,9}$/.test(form.contact_phone) && { key: 'contact_phone', label: 'เบอร์ติดต่อให้ครบ' },
    !form.description.trim() && { key: 'description', label: 'รายละเอียดความเสียหาย' },
  ].filter(Boolean)
  const missingKeys = new Set(missing.map((item) => item.key))
  const fieldState = (key) => ({ name: key, flash: flash === key, invalid: touched && missingKeys.has(key) })
  const blockState = (key, base) => `${base}${fieldState(key).invalid ? ' is-invalid' : ''}${fieldState(key).flash ? ' is-flash' : ''}`

  const focusField = (key) => {
    requestAnimationFrame(() => {
      const node = formRef.current?.querySelector(`[data-field="${key}"]`)
      if (!node) return
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      node.querySelector('input, textarea, button')?.focus({ preventScroll: true })
      setFlash('')
      requestAnimationFrame(() => setFlash(key))
      clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(''), 1800)
    })
  }

  const linkedRequest = data.open_requests.find((request) => String(request.id) === String(form.maintenance_request_id))
  const urgencySuggestion = suggestUrgency({ description: form.description, request: linkedRequest })
  const urgency = urgencyManual ? form.urgency : urgencySuggestion.level
  const chooseUrgency = (level) => {
    setUrgencyManual(true)
    setForm((current) => ({ ...current, urgency: level }))
  }

  const submit = () => {
    setTouched(true)
    if (missing.length > 0) {
      focusField(missing[0].key)
      return
    }
    run(() => axios.post(`${API_BASE}/jobs`, {
      ...form,
      urgency,
      vendor_id: Number(form.vendor_id),
      room_number: Number(form.room_number),
      maintenance_request_id: form.maintenance_request_id ? Number(form.maintenance_request_id) : null,
      description: form.description.trim(),
      contact_phone: form.contact_phone.trim(),
    }), 'ส่งงานให้ช่างไม่สำเร็จ')
  }

  const previewJob = {
    id: 0,
    status: 'sent',
    room_number: form.room_number || '—',
    category: form.category,
    urgency,
    description: form.description.trim() || 'รายละเอียดความเสียหายจะแสดงตรงนี้',
    vendor_name: vendor?.name || 'ยังไม่ได้เลือกช่าง',
    maintenance_request_id: form.maintenance_request_id || null,
    technician_name: null,
    scheduled_at: null,
    sent_by_name: 'คุณ',
    created_at: new Date().toISOString(),
    status_updated_at: null,
  }

  if (usableVendors.length === 0) {
    return (
      <RepairModal title="ส่งงานซ่อมให้ช่าง" icon="send" size="sm" onClose={onClose} onSubmit={onClose} submitLabel="ตกลง" hideCancel>
        <div className="market-gallery-empty">
          <Icon name="wrench" size={22} />
          <strong>ยังไม่มีช่างที่สัญญาอยู่ในช่วงใช้งาน</strong>
          <span>เพิ่มช่างในแท็บ "ช่างที่ทำสัญญา" ก่อนส่งงาน</span>
        </div>
      </RepairModal>
    )
  }

  return (
    <RepairModal
      title="ส่งงานซ่อมให้ช่าง"
      subtitle="ระบบจะส่งเลขห้องและรายละเอียดความเสียหายไปยังช่างที่เลือก ช่างอัปเดตสถานะกลับมาผ่าน API"
      icon="send"
      size="xxl"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="ส่งคำขอให้ช่าง"
    >
      <div className="market-lease-form is-shop-form" ref={formRef}>
        <div className="market-lease-form-main">
          <FormStep number="1" title="เลือกช่างที่ทำสัญญา" hint="แสดงเฉพาะช่างที่สัญญายังอยู่ในช่วงใช้งาน">
            <div className={blockState('vendor', 'market-shop-picker')} data-field="vendor" role="radiogroup" aria-label="เลือกช่าง">
              {usableVendors.map((item) => {
                const selected = String(form.vendor_id) === String(item.id)
                const matches = item.specialties.includes(form.category)
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`market-shop-option repair-vendor-choice${selected ? ' is-selected' : ''}`}
                    onClick={() => setForm((current) => ({ ...current, vendor_id: item.id }))}
                  >
                    <span className="market-shop-option-icon"><Icon name="wrench" size={17} /></span>
                    <span className="market-shop-option-text">
                      <strong>{item.name}</strong>
                      <small>สัญญา{CONTRACT_LABEL[item.contract_type]} · {item.specialties.map((key) => specialtyLabel(item, key)).join(', ')}</small>
                    </span>
                    <span className={`market-pill ${matches ? 'is-success' : item.open_jobs > 0 ? 'is-warning' : 'is-muted'}`}>
                      {matches ? 'ตรงประเภทงาน' : item.open_jobs > 0 ? `ค้าง ${item.open_jobs}` : 'ว่าง'}
                    </span>
                  </button>
                )
              })}
            </div>
          </FormStep>

          <FormStep number="2" title="ดึงจากแจ้งซ่อมของผู้เช่า" hint="ไม่บังคับ เลือกแล้วระบบกรอกข้อมูลให้ และเมื่อช่างปิดงาน แจ้งซ่อมของผู้เช่าจะปิดตามอัตโนมัติ">
            <div className="repair-request-list" role="radiogroup" aria-label="แจ้งซ่อมของผู้เช่า">
              <button
                type="button"
                role="radio"
                aria-checked={!form.maintenance_request_id}
                className={`repair-request-option${!form.maintenance_request_id ? ' is-selected' : ''}`}
                onClick={() => pickRequest('')}
              >
                <span className="repair-room-chip is-plain"><Icon name="edit" size={16} /></span>
                <span className="repair-mini-text"><strong>กรอกข้อมูลเอง</strong><small>ไม่ผูกกับแจ้งซ่อมของผู้เช่า</small></span>
              </button>
              {data.open_requests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  role="radio"
                  aria-checked={String(form.maintenance_request_id) === String(request.id)}
                  className={`repair-request-option${String(form.maintenance_request_id) === String(request.id) ? ' is-selected' : ''}`}
                  onClick={() => pickRequest(request.id)}
                >
                  <span className="repair-room-chip"><small>ห้อง</small>{request.room_number}</span>
                  <span className="repair-mini-text">
                    <strong>{CATEGORY_LABEL[request.category] || 'อื่นๆ'} · {request.first_name} {request.last_name}</strong>
                    <small title={request.description}>{request.description}</small>
                  </span>
                  <small className="repair-request-date">{thaiDateTime(request.created_at)}</small>
                </button>
              ))}
              {data.open_requests.length === 0 && <p className="repair-request-empty">ไม่มีแจ้งซ่อมที่รอดำเนินการ</p>}
            </div>
          </FormStep>

          <FormStep number="3" title="ห้องที่ต้องซ่อม">
            <div className={blockState('room', 'market-field-block repair-room-block')} data-field="room">
              <div className="market-search repair-room-search">
                <Icon name="search" size={16} />
                <input placeholder="ค้นหาเลขห้องหรือชื่อผู้เช่า" value={roomSearch} disabled={Boolean(form.maintenance_request_id)} onChange={(event) => setRoomSearch(event.target.value)} />
              </div>
              <div className="repair-room-grid" role="radiogroup" aria-label="เลือกห้อง">
                {visibleRooms.map((room) => {
                  const selected = String(form.room_number) === String(room.room_number)
                  return (
                    <button
                      key={room.room_number}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={Boolean(form.maintenance_request_id) && !selected}
                      className={`repair-room-option${selected ? ' is-selected' : ''}${room.tenant ? '' : ' is-vacant'}`}
                      onClick={() => pickRoom(String(room.room_number))}
                    >
                      <strong>{room.room_number}</strong>
                      <small>{room.tenant ? room.tenant.first_name : 'ห้องว่าง'}</small>
                    </button>
                  )
                })}
                {visibleRooms.length === 0 && <p className="repair-request-empty">ไม่พบห้อง</p>}
              </div>
            </div>
            {selectedRoom && (
              <div className={`repair-tenant-card${selectedRoom.tenant ? '' : ' is-vacant'}`}>
                <span className="repair-tenant-avatar">
                  {selectedRoom.tenant ? `${selectedRoom.tenant.first_name || ''}`.slice(0, 1) : <Icon name="door" size={18} />}
                </span>
                <div className="repair-tenant-main">
                  <small>ผู้เช่าห้อง {selectedRoom.room_number}</small>
                  <strong>{selectedRoom.tenant ? `${selectedRoom.tenant.first_name} ${selectedRoom.tenant.last_name}` : 'ห้องว่าง ไม่มีผู้เช่า'}</strong>
                  <div className="repair-tenant-meta">
                    {selectedRoom.tenant?.phone && (
                      <a href={`tel:${selectedRoom.tenant.phone}`}><Icon name="phone" size={12} /> {selectedRoom.tenant.phone}</a>
                    )}
                    {selectedRoom.rental_end_date && <span><Icon name="calendar" size={12} /> สัญญาถึง {thaiDate(selectedRoom.rental_end_date)}</span>}
                    {roomRequests.length > 0 && <span className="is-alert"><Icon name="alert" size={12} /> แจ้งซ่อมค้าง {roomRequests.length} รายการ</span>}
                  </div>
                </div>
                {selectedRoom.tenant?.phone && form.contact_phone !== selectedRoom.tenant.phone && (
                  <button type="button" className="market-btn is-small" onClick={() => setForm((current) => ({ ...current, contact_phone: selectedRoom.tenant.phone }))}>
                    ใช้เบอร์ผู้เช่า
                  </button>
                )}
              </div>
            )}
            {!form.maintenance_request_id && roomRequests.length > 0 && (
              <div className="repair-room-requests">
                <small>แจ้งซ่อมที่ผู้เช่าห้องนี้ส่งไว้ กดเพื่อดึงรายละเอียดมาใช้</small>
                {roomRequests.map((request) => (
                  <button key={request.id} type="button" className="repair-request-option" onClick={() => pickRequest(request.id)}>
                    <span className="repair-mini-text">
                      <strong>{CATEGORY_LABEL[request.category] || 'อื่นๆ'}</strong>
                      <small title={request.description}>{request.description}</small>
                    </span>
                    <small className="repair-request-date">{thaiDateTime(request.created_at)}</small>
                  </button>
                ))}
              </div>
            )}
            <div className="market-form-grid">
              <Field {...fieldState('contact_phone')} label="เบอร์ติดต่อหน้างาน" hint={selectedRoom?.tenant ? `ผู้เช่า: ${selectedRoom.tenant.first_name} ${selectedRoom.tenant.last_name}` : 'ไม่บังคับ'}>
                <input className="market-input" inputMode="numeric" value={form.contact_phone} placeholder="0812345678" onChange={(event) => setForm((current) => ({ ...current, contact_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
              </Field>
              <Field label="ช่วงเวลาที่สะดวกให้ช่างเข้า">
                <select className="market-input" value={form.preferred_time} onChange={set('preferred_time')}>
                  {Object.entries(TIME_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </Field>
            </div>
          </FormStep>

          <FormStep number="4" title="สิ่งที่เสียหาย">
            <div className="market-form-grid">
              <div className="market-field is-wide">
                <span>ประเภทงานซ่อม</span>
                <div className="repair-specialty-grid" role="radiogroup" aria-label="ประเภทงานซ่อม">
                  {Object.entries(CATEGORY_LABEL).map(([key, label]) => {
                    const selected = form.category === key
                    const covered = vendor?.specialties.includes(key)
                    const hint = key === 'other' && vendor?.specialty_other ? vendor.specialty_other : SPECIALTY_INFO[key].hint
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={hint}
                        className={`repair-specialty-option is-pick${selected ? ' is-selected' : ''}`}
                        onClick={() => setForm((current) => ({ ...current, category: key }))}
                      >
                        <span className="repair-specialty-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                        {vendor && <em className={`repair-specialty-cover${covered ? ' is-covered' : ''}`}>{covered ? 'ช่างรับงานนี้' : 'ไม่ได้ระบุ'}</em>}
                        <span className="repair-specialty-icon"><Icon name={SPECIALTY_INFO[key].icon} size={20} /></span>
                        <strong>{label}</strong>
                        <small>{hint}</small>
                      </button>
                    )
                  })}
                </div>
                {outsideSpecialty && <small className="repair-specialty-warning"><Icon name="alert" size={13} /> {vendor.name} ไม่ได้ระบุว่ารับงานประเภทนี้ ส่งได้แต่ควรตรวจสอบกับช่างก่อน</small>}
              </div>
              <div className="market-field is-wide">
                <span>ความเร่งด่วน</span>
                <div className="market-segment is-even is-deposit repair-urgency" role="group" aria-label="ความเร่งด่วน">
                  <button type="button" className={urgency === 'normal' ? 'is-active' : ''} onClick={() => chooseUrgency('normal')}>
                    <span>ปกติ</span><small>นัดเวลาตามสะดวก</small>
                  </button>
                  <button type="button" className={`is-urgent${urgency === 'urgent' ? ' is-active' : ''}`} onClick={() => chooseUrgency('urgent')}>
                    <span>ด่วน</span><small>ต้องเข้าซ่อมโดยเร็ว</small>
                  </button>
                </div>
                <small className={`repair-urgency-hint is-${urgencySuggestion.level}${urgencyManual ? ' is-manual' : ''}`}>
                  <Icon name={urgencySuggestion.level === 'urgent' ? 'alert' : 'check'} size={13} />
                  {urgencyManual
                    ? `เลือกเอง · ระบบแนะนำ "${urgencySuggestion.level === 'urgent' ? 'ด่วน' : 'ปกติ'}" (${urgencySuggestion.reason})`
                    : `ระบบปรับให้อัตโนมัติ: ${urgencySuggestion.reason}`}
                  {urgencyManual && urgency !== urgencySuggestion.level && (
                    <button type="button" className="repair-urgency-reset" onClick={() => setUrgencyManual(false)}>ใช้ค่าที่ระบบแนะนำ</button>
                  )}
                </small>
              </div>
              <Field {...fieldState('description')} label="รายละเอียดความเสียหาย *" wide hint={`${form.description.length}/1000 ตัวอักษร`}>
                <textarea className="market-input" rows={4} maxLength={1000} value={form.description} placeholder="เช่น แอร์ไม่เย็น มีน้ำหยดจากตัวเครื่อง เริ่มเป็นตั้งแต่เมื่อวาน" onChange={set('description')} />
              </Field>
            </div>
          </FormStep>
        </div>

        <aside className="market-lease-summary">
          <h4>ตัวอย่างงานที่ช่างจะได้รับ</h4>
          <small className="market-card-preview-hint">หน้าตาการ์ดในรายการงานที่ส่งช่าง</small>
          <div className="market-card-preview" aria-hidden="true" inert="">
            <JobCard job={previewJob} onOpen={() => {}} />
          </div>
          <div className="market-lease-summary-total">
            <span>ส่งถึง</span>
            <strong>{vendor?.name || '-'}</strong>
            <small>{vendor ? (vendor.webhook_url ? 'แจ้งเตือนผ่าน Webhook ทันที และดึงผ่าน API ได้' : 'ช่างดึงงานผ่าน API (ไม่มี Webhook)') : 'เลือกช่างก่อน'}</small>
          </div>
          <div className={`market-lease-summary-check${missing.length ? '' : ' is-ready'}`}>
            {missing.length ? (
              <>
                <strong>ยังขาดข้อมูล · กดเพื่อไปที่ช่องนั้น</strong>
                <ul>{missing.map((item) => <li key={item.key}><button type="button" className="market-missing-link" onClick={() => focusField(item.key)}>{item.label}</button></li>)}</ul>
              </>
            ) : <strong>ข้อมูลครบ ส่งคำขอให้ช่างได้</strong>}
          </div>
        </aside>
      </div>
    </RepairModal>
  )
}

const PROGRESS_STEPS = [
  { status: 'sent', label: 'ส่งงาน', at: 'created_at' },
  { status: 'accepted', label: 'ช่างรับงาน', at: 'accepted_at' },
  { status: 'in_progress', label: 'กำลังซ่อม', at: 'started_at' },
  { status: 'done', label: 'ซ่อมเสร็จ', at: 'completed_at' },
]

function JobProgress({ job, detailed = false }) {
  const stopped = job.status === 'rejected' || job.status === 'cancelled'
  const reached = PROGRESS_STEPS.findIndex((step) => step.status === job.status)
  const lastDone = stopped ? (job.started_at ? 2 : job.accepted_at ? 1 : 0) : reached
  const steps = stopped
    ? [...PROGRESS_STEPS.slice(0, lastDone + 1), { status: job.status, label: job.status === 'rejected' ? 'ช่างปฏิเสธ' : 'ยกเลิกงาน', at: job.status === 'rejected' ? 'completed_at' : 'cancelled_at' }]
    : PROGRESS_STEPS
  return (
    <ol className={`repair-progress${detailed ? ' is-detailed' : ''}`}>
      {steps.map((step, index) => {
        const state = step.status === 'rejected' || step.status === 'cancelled' ? 'is-stopped'
          : index < lastDone || (index === lastDone && job.status === 'done') ? 'is-done'
            : index === lastDone ? 'is-current' : ''
        return (
          <li key={step.status} className={state}>
            <span className="repair-progress-dot">{state === 'is-done' ? '✓' : state === 'is-stopped' ? '×' : index + 1}</span>
            <span className="repair-progress-text">
              <strong>{step.label}</strong>
              {detailed && <small>{job[step.at] ? thaiDateTime(job[step.at]) : 'รอดำเนินการ'}</small>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function DetailRow({ icon, tone = 'blue', label, value, sub, href }) {
  return (
    <div className={`repair-detail-row is-${tone}`}>
      <span className="repair-detail-row-icon"><Icon name={icon} size={15} /></span>
      <small>{label}</small>
      <span className="repair-detail-row-value">
        {href && value !== '-' ? <a href={href}>{value}</a> : <strong>{value}</strong>}
        {sub && <em>{sub}</em>}
      </span>
    </div>
  )
}

const MAINTENANCE_REQUEST_STATUS = { pending: 'รอดำเนินการ', in_progress: 'กำลังดำเนินการ', done: 'เสร็จสิ้น', cancelled: 'ยกเลิกแล้ว' }

const NEXT_STEP = {
  sent: { icon: 'clock', title: 'รอช่างตอบรับงาน', detail: 'ส่งงานถึงช่างแล้ว ถ้ารอนานเกินไป โทรหาช่างหรือกดส่งแจ้งเตือนซ้ำได้' },
  accepted: { icon: 'calendar', title: 'ช่างรับงานแล้ว รอเข้าซ่อม', detail: 'แจ้งผู้เช่าให้ทราบวันเวลานัด และเตรียมให้ช่างเข้าห้องได้' },
  in_progress: { icon: 'wrench', title: 'ช่างกำลังซ่อม', detail: 'เมื่อช่างปิดงาน สถานะจะเปลี่ยนเป็นซ่อมเสร็จอัตโนมัติ' },
  done: { icon: 'check', title: 'ซ่อมเสร็จเรียบร้อย', detail: 'ถ้างานนี้ผูกกับแจ้งซ่อมของผู้เช่า แจ้งซ่อมนั้นถูกปิดเป็นเสร็จสิ้นให้แล้ว' },
  rejected: { icon: 'alert', title: 'ช่างปฏิเสธงานนี้', detail: 'ส่งงานเดิมให้ช่างรายอื่นได้จากปุ่ม "ติดต่อช่าง" ในแท็บงานที่ส่งช่าง' },
  cancelled: { icon: 'alert', title: 'งานนี้ถูกยกเลิกแล้ว', detail: 'ช่างจะเห็นสถานะยกเลิก และเปลี่ยนสถานะต่อไม่ได้' },
}

function elapsedText(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes} นาที`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ชั่วโมง`
  return `${Math.floor(hours / 24)} วัน ${hours % 24} ชม.`
}

function JobEditModal({ job, onClose, onSaved }) {
  const [form, setForm] = useState({
    category: job.category,
    urgency: job.urgency,
    description: job.description,
    contact_phone: job.contact_phone || '',
    preferred_time: job.preferred_time,
  })
  const { busy, error, run } = useSubmit((data) => onSaved(data.message))
  const shorten = (value) => (value.length > 40 ? `${value.slice(0, 40)}…` : value || '-')
  const changes = [
    { key: 'category', label: 'ประเภทงาน', show: (value) => CATEGORY_LABEL[value] || '-' },
    { key: 'urgency', label: 'ความเร่งด่วน', show: (value) => (value === 'urgent' ? 'ด่วน' : 'ปกติ') },
    { key: 'preferred_time', label: 'ช่วงเวลา', show: (value) => TIME_LABEL[value] || '-' },
    { key: 'contact_phone', label: 'เบอร์ติดต่อ', show: (value) => value || '-' },
    { key: 'description', label: 'รายละเอียด', show: (value) => shorten(String(value || '').trim()) },
  ]
    .filter((item) => String(form[item.key] ?? '').trim() !== String(job[item.key] ?? '').trim())
    .map((item) => ({ label: item.label, before: item.show(job[item.key]), after: item.show(form[item.key]) }))
  const changed = changes.length > 0
  const phoneInvalid = form.contact_phone && !/^0\d{8,9}$/.test(form.contact_phone)
  const disabled = !changed || !form.description.trim() || phoneInvalid

  return (
    <RepairModal
      title={`แก้ไขงานซ่อมห้อง ${job.room_number}`}
      subtitle={job.vendor_has_webhook ? `บันทึกแล้วระบบจะแจ้ง ${job.vendor_name} ทันที` : `${job.vendor_name} จะเห็นข้อมูลใหม่ครั้งถัดไปที่เข้ามาดูงาน`}
      icon="edit"
      size="lg"
      busy={busy}
      error={error}
      onClose={onClose}
      submitLabel="บันทึกและแจ้งช่าง"
      submitDisabled={disabled}
      onSubmit={() => run(() => axios.put(`${API_BASE}/jobs/${job.id}`, { ...form, description: form.description.trim(), contact_phone: form.contact_phone.trim() }), 'แก้ไขงานไม่สำเร็จ')}
    >
      <div className="repair-edit-form">
        <FormStep number="1" title="ประเภทงานซ่อม" hint={`ตอนนี้: ${CATEGORY_LABEL[job.category] || '-'}`}>
          <div className="repair-category-chips" role="radiogroup" aria-label="ประเภทงานซ่อม">
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => {
              const selected = form.category === key
              return (
                <button key={key} type="button" role="radio" aria-checked={selected} className={`repair-category-chip${selected ? ' is-selected' : ''}`} onClick={() => setForm((current) => ({ ...current, category: key }))}>
                  <Icon name={SPECIALTY_INFO[key].icon} size={15} />
                  {label}
                </button>
              )
            })}
          </div>
        </FormStep>

        <FormStep number="2" title="ความเร่งด่วนและเวลาเข้าซ่อม">
          <div className="market-segment is-even is-deposit repair-urgency" role="group" aria-label="ความเร่งด่วน">
            <button type="button" className={form.urgency === 'normal' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, urgency: 'normal' }))}>
              <span>ปกติ</span><small>นัดเวลาตามสะดวก</small>
            </button>
            <button type="button" className={`is-urgent${form.urgency === 'urgent' ? ' is-active' : ''}`} onClick={() => setForm((current) => ({ ...current, urgency: 'urgent' }))}>
              <span>ด่วน</span><small>ต้องเข้าซ่อมโดยเร็ว</small>
            </button>
          </div>
          <div className="repair-time-chips" role="radiogroup" aria-label="ช่วงเวลาที่สะดวก">
            {MAINTENANCE_TIME_OPTIONS.map((option) => {
              const selected = form.preferred_time === option.value
              return (
                <button key={option.value} type="button" role="radio" aria-checked={selected} className={`repair-time-chip${selected ? ' is-selected' : ''}`} onClick={() => setForm((current) => ({ ...current, preferred_time: option.value }))}>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </button>
              )
            })}
          </div>
        </FormStep>

        <FormStep number="3" title="รายละเอียดและผู้ติดต่อ">
          <div className="market-form-grid">
            <Field label="รายละเอียดความเสียหาย *" wide hint={`${form.description.length}/1000 ตัวอักษร`}>
              <textarea className="market-input" rows={4} maxLength={1000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <Field label="เบอร์ติดต่อหน้างาน" invalid={Boolean(phoneInvalid)} hint={phoneInvalid ? 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก' : 'ไม่บังคับ'}>
              <input className="market-input" inputMode="numeric" value={form.contact_phone} placeholder="0812345678" onChange={(event) => setForm((current) => ({ ...current, contact_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
            </Field>
          </div>
        </FormStep>

        <section className={`repair-edit-summary${changes.length ? ' is-changed' : ''}`}>
          <strong><Icon name={changes.length ? 'send' : 'check'} size={15} /> {changes.length ? `สิ่งที่จะแจ้งช่าง (${changes.length} รายการ)` : 'ยังไม่มีการเปลี่ยนแปลง'}</strong>
          {changes.length > 0 && (
            <ul>
              {changes.map((item) => (
                <li key={item.label}>
                  <small>{item.label}</small>
                  <span className="is-before">{item.before}</span>
                  <span className="repair-edit-arrow" aria-hidden="true">→</span>
                  <span className="is-after">{item.after}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </RepairModal>
  )
}

function JobDetailModal({ job, onClose, onChanged }) {
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState(false)
  const [resend, setResend] = useState({ busy: false, message: '' })
  const canEdit = useCanEdit()
  const open = canEdit && ['sent', 'accepted', 'in_progress'].includes(job.status)

  return (
    <RepairModal
      title={`งานซ่อมห้อง ${job.room_number}`}
      subtitle={`งาน #${job.id} · ส่งเมื่อ ${thaiDateTime(job.created_at)} โดย ${job.sent_by_name}`}
      icon="wrench"
      size="lg"
      onClose={onClose}
      footer={open && (
        <>
          {job.status === 'sent' && job.webhook_status && (
            <button type="button" className="market-btn" disabled={resend.busy} onClick={async () => {
              setResend({ busy: true, message: '' })
              try {
                const { data } = await axios.post(`${API_BASE}/jobs/${job.id}/resend`, {})
                setResend({ busy: false, message: data.message })
                onChanged()
              } catch (error) {
                setResend({ busy: false, message: errorMessage(error, 'ส่งแจ้งเตือนไม่สำเร็จ') })
              }
            }}><Icon name="send" size={14} /> {resend.busy ? 'กำลังส่ง...' : 'ส่งแจ้งเตือนซ้ำ'}</button>
          )}
          <button type="button" className="market-btn is-danger-ghost" onClick={() => setDialog(true)}><Icon name="trash" size={14} /> ยกเลิกงาน</button>
          <button type="button" className="market-btn is-primary" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> แก้ไขงาน</button>
        </>
      )}
    >
      <div className="repair-detail">
        <section className={`repair-job-hero is-${job.status}`}>
          <div className="repair-job-hero-head">
            <span className="market-lease-shop repair-room-badge"><small>ห้อง</small><strong>{job.room_number}</strong></span>
            <div className="market-lease-who">
              <strong>
                {CATEGORY_LABEL[job.category]}
                {job.urgency === 'urgent' && <em className="repair-urgent-tag">ด่วน</em>}
              </strong>
              <small><Icon name="wrench" size={12} /> {job.vendor_name}</small>
            </div>
            <JobStatusPill status={job.status} />
          </div>
          <JobProgress job={job} detailed />
        </section>

        <div className="repair-job-stats">
          <span><small>ส่งงานไปแล้ว</small><strong>{elapsedText(job.created_at)}</strong></span>
          <span className={job.urgency === 'urgent' ? 'is-red' : 'is-green'}><small>ความเร่งด่วน</small><strong>{job.urgency === 'urgent' ? 'ด่วน' : 'ปกติ'}</strong></span>
          <span><small>สัญญาช่าง</small><strong>{CONTRACT_LABEL[job.vendor_contract_type] || '-'}</strong></span>
          <span className={job.vendor_has_webhook ? 'is-blue' : ''}><small>การแจ้งช่าง</small><strong>{job.vendor_has_webhook ? 'แจ้งเตือนทันที' : 'ช่างเข้ามาดูเอง'}</strong></span>
        </div>

        <div className={`repair-next-step is-${job.status}`}>
          <Icon name={NEXT_STEP[job.status]?.icon || 'clock'} size={18} />
          <div>
            <strong>{NEXT_STEP[job.status]?.title}</strong>
            <small>{NEXT_STEP[job.status]?.detail}</small>
          </div>
        </div>

        {(job.vendor_note || job.cancel_reason) && (
          <p className={`repair-note${job.cancel_reason ? ' is-danger' : ''}`}>
            <strong>{job.cancel_reason ? 'เหตุผลที่ยกเลิก' : 'ข้อความจากช่าง'}:</strong> {job.cancel_reason || job.vendor_note}
          </p>
        )}

        <div className="repair-detail-columns">
          <section className="market-section">
            <div className="market-section-head">
              <h4><span className="market-section-icon"><Icon name="alert" size={15} /></span> สิ่งที่เสียหาย</h4>
              {job.maintenance_request_id && <span className="repair-tag is-linked"><Icon name="link" size={12} /> แจ้งซ่อม #{job.maintenance_request_id}</span>}
            </div>
            <p className="repair-description">{job.description}</p>
            <div className="repair-detail-rows">
              <DetailRow icon="door" tone="blue" label="ห้อง" value={`ห้อง ${job.room_number}`} />
              <DetailRow icon="user" tone="violet" label="ผู้เช่า" value={job.tenant_name || 'ไม่มีผู้เช่า'} />
              <DetailRow icon="phone" tone="green" label="เบอร์ผู้เช่า" value={job.tenant_phone || '-'} href={`tel:${job.tenant_phone}`} />
              <DetailRow icon="phone" tone="green" label="เบอร์ติดต่อหน้างาน" value={job.contact_phone || '-'} href={`tel:${job.contact_phone}`} />
              <DetailRow icon="clock" tone="amber" label="ช่วงเวลาที่สะดวก" value={TIME_LABEL[job.preferred_time] || '-'} />
              {job.details_updated_at && (
                <DetailRow icon="edit" tone="rose" label="แก้ไขรายละเอียดล่าสุด" value={thaiDateTime(job.details_updated_at)} sub={job.details_updated_by ? `โดย ${job.details_updated_by}` : null} />
              )}
              {job.maintenance_request_id && (
                <DetailRow
                  icon="link"
                  tone="teal"
                  label="แจ้งซ่อมของผู้เช่า"
                  value={`#${job.maintenance_request_id} · ${MAINTENANCE_REQUEST_STATUS[job.request_status] || '-'}`}
                  sub={job.request_created_at ? `แจ้งเมื่อ ${thaiDateTime(job.request_created_at)}` : null}
                />
              )}
            </div>
          </section>

          <section className="market-section">
            <div className="market-section-head">
              <h4><span className="market-section-icon"><Icon name="wrench" size={15} /></span> ช่างที่รับผิดชอบ</h4>
            </div>
            <div className="repair-detail-rows">
              <DetailRow icon="wrench" tone="blue" label="ร้าน/บริษัทช่าง" value={job.vendor_name} sub={job.vendor_contract_type ? `สัญญา${CONTRACT_LABEL[job.vendor_contract_type]}` : null} />
              <DetailRow icon="phone" tone="green" label="เบอร์ช่าง" value={job.vendor_phone || '-'} href={`tel:${job.vendor_phone}`} />
              <DetailRow icon="user" tone="violet" label="ช่างที่เข้าซ่อม" value={job.technician_name || '-'} />
              <DetailRow icon="calendar" tone="rose" label="นัดเข้าซ่อม" value={job.scheduled_at ? thaiDateTime(job.scheduled_at) : '-'} />
              <DetailRow icon="clock" tone="teal" label="อัปเดตล่าสุด" value={thaiDateTime(job.status_updated_at || job.created_at)} sub={job.status_updated_by ? `โดย ${job.status_updated_by}` : null} />
            </div>
          </section>
        </div>

        {job.webhook_status && (
          <p className={`repair-webhook-line is-${job.webhook_status}`}>
            <Icon name={job.webhook_status === 'delivered' ? 'check' : 'alert'} size={14} />
            {job.webhook_status === 'delivered' ? 'ส่งแจ้งเตือนไปยังระบบของช่างแล้ว' : 'ส่งแจ้งเตือนไปยังระบบของช่างไม่สำเร็จ'} · {thaiDateTime(job.webhook_at)}
          </p>
        )}
        {resend.message && <p className="market-notice" role="status">{resend.message}</p>}
      </div>
      {editing && (
        <JobEditModal job={job} onClose={() => setEditing(false)} onSaved={(message) => {
          setEditing(false)
          onChanged(message)
        }} />
      )}
      {dialog && (
        <ConfirmModal
          title="ยกเลิกงานซ่อม"
          message={`ยกเลิกงานซ่อมห้อง ${job.room_number} ที่ส่งให้ ${job.vendor_name} ช่างจะเห็นสถานะเป็นยกเลิก`}
          submitLabel="ยกเลิกงาน"
          reasonLabel="เหตุผลที่ยกเลิก *"
          onClose={() => setDialog(false)}
          onConfirm={async (reason) => {
            const response = await axios.post(`${API_BASE}/jobs/${job.id}/cancel`, { reason })
            onChanged(response.data.message)
            onClose()
            return response
          }}
        />
      )}
    </RepairModal>
  )
}

function JobCard({ job, onOpen, onCancel }) {
  return (
    <article
      className={`market-lease-card repair-job-card is-${job.status}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(job)
        }
      }}
    >
      <div className="market-lease-head">
        <span className="market-lease-shop repair-room-badge"><small>ห้อง</small><strong>{job.room_number}</strong></span>
        <div className="market-lease-who">
          <strong>
            {CATEGORY_LABEL[job.category]}
            {job.urgency === 'urgent' && <em className="repair-urgent-tag">ด่วน</em>}
          </strong>
          <small title={job.vendor_name}><Icon name="wrench" size={12} /> {job.vendor_name}</small>
        </div>
        <JobStatusPill status={job.status} />
      </div>
      <p className="repair-job-desc" title={job.description}>{job.description}</p>
      <JobProgress job={job} />
      <div className="market-lease-figures">
        <span><small>ช่างที่เข้าซ่อม</small><strong>{job.technician_name || '-'}</strong></span>
        <span><small>นัดเข้าซ่อม</small><strong>{job.scheduled_at ? thaiDateTime(job.scheduled_at) : '-'}</strong></span>
        <span className={`is-highlight ${job.maintenance_request_id ? 'is-tone-green' : 'is-tone-slate'}`}><small>แจ้งซ่อม</small><strong>{job.maintenance_request_id ? `#${job.maintenance_request_id}` : 'ไม่ผูก'}</strong></span>
      </div>
      <footer className="market-lease-foot">
        <small>ส่ง {thaiDateTime(job.created_at)}<br />โดย <b className="repair-staff-name">{job.sent_by_name}</b></small>
        <span className="market-lease-foot-actions">
          {onCancel && ['sent', 'accepted', 'in_progress'].includes(job.status) && (
            <button
              type="button"
              className="market-btn is-small is-danger-ghost"
              onClick={(event) => {
                event.stopPropagation()
                onCancel(job)
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Icon name="trash" size={13} /> ยกเลิก
            </button>
          )}
          <span className="market-btn is-small">ดูรายละเอียด <span aria-hidden="true">›</span></span>
        </span>
      </footer>
    </article>
  )
}

function JobsSection({ data, onSend, onOpenJob, onCancelJob }) {
  const canEdit = useCanEdit()
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const matcher = JOB_FILTERS.find((item) => item.key === filter)?.match || (() => true)
  const term = search.trim().toLowerCase()
  const jobs = data.jobs.filter((job) => matcher(job) && (!term || [String(job.room_number), job.vendor_name, job.description, job.technician_name, CATEGORY_LABEL[job.category]]
    .some((value) => value?.toLowerCase().includes(term))))

  return (
    <>
      <div className="market-toolbar">
        <div className="market-search">
          <Icon name="search" size={16} />
          <input placeholder="ค้นหาเลขห้อง ช่าง หรือรายละเอียด" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="market-chips" role="group" aria-label="กรองสถานะงาน">
          {JOB_FILTERS.map((item) => (
            <button key={item.key} type="button" className={`market-chip repair-filter-chip is-${item.key}${filter === item.key ? ' is-active' : ''}`} onClick={() => setFilter(item.key)}>
              {item.label} <span>{data.jobs.filter(item.match).length}</span>
            </button>
          ))}
        </div>
        {canEdit && <button type="button" className="market-btn is-primary market-toolbar-action" onClick={() => onSend(null)}><Icon name="send" size={15} /> ติดต่อช่าง</button>}
      </div>
      <div className="market-scroll">
        {jobs.length === 0 ? <p className="market-empty">ไม่พบงานซ่อม</p> : (
          <div className="repair-job-grid">
            {jobs.map((job) => <JobCard key={job.id} job={job} onOpen={onOpenJob} onCancel={canEdit ? onCancelJob : null} />)}
          </div>
        )}
      </div>
    </>
  )
}

function VendorCard({ vendor, onOpen, onSend }) {
  const canEdit = useCanEdit()
  const contract = contractState(vendor)
  return (
    <article className={`repair-vendor-card${vendor.is_usable ? '' : ' is-inactive'}`}>
      <div className="repair-vendor-head">
        <span className="market-title-icon repair-vendor-icon"><Icon name="wrench" size={20} /></span>
        <div className="repair-job-who">
          <strong title={vendor.name}>{vendor.name}</strong>
          <small><Icon name="phone" size={12} /> {vendor.phone}{vendor.contact_name ? ` · ${vendor.contact_name}` : ''}</small>
        </div>
        <Pill tone={contract.tone}>{contract.label}</Pill>
      </div>
      <div className="repair-tag-row">
        {vendor.specialties.map((key) => <span key={key} className={`repair-tag is-${key}`} title={specialtyLabel(vendor, key)}>{specialtyLabel(vendor, key)}</span>)}
      </div>
      <div className="market-lease-figures">
        <span><small>สัญญา</small><strong>{CONTRACT_LABEL[vendor.contract_type]}</strong></span>
        <span><small>สิ้นสุด</small><strong>{thaiDate(vendor.contract_end)}</strong></span>
        <span className={`is-highlight ${vendor.open_jobs > 0 ? 'is-tone-amber' : 'is-tone-green'}`}><small>งานค้าง</small><strong>{vendor.open_jobs} งาน</strong></span>
      </div>
      <footer className="repair-vendor-foot">
        <small><Icon name="image" size={12} /> สัญญา {vendor.image_count} รูป · <Icon name="key" size={12} /> API key {vendor.active_keys} อัน{vendor.webhook_url ? ' · มี Webhook' : ''}</small>
        <span className="market-lease-foot-actions">
          {canEdit && vendor.is_usable && <button type="button" className="market-btn is-small is-primary" onClick={() => onSend(vendor.id)}><Icon name="send" size={13} /> ส่งงาน</button>}
          <button type="button" className="market-btn is-small" onClick={() => onOpen(vendor.id)}>รายละเอียด <span aria-hidden="true">›</span></button>
        </span>
      </footer>
    </article>
  )
}

function VendorsSection({ data, onOpen, onCreate, onSend }) {
  const canEdit = useCanEdit()
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const vendors = data.vendors.filter((vendor) => !term || [vendor.name, vendor.contact_name, vendor.phone, ...vendor.specialties.map((key) => specialtyLabel(vendor, key))]
    .some((value) => value?.toLowerCase().includes(term)))
  return (
    <>
      <div className="market-toolbar">
        <div className="market-search">
          <Icon name="search" size={16} />
          <input placeholder="ค้นหาชื่อช่าง เบอร์โทร หรือประเภทงาน" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {canEdit && <button type="button" className="market-btn is-primary market-toolbar-action" onClick={onCreate}><Icon name="plus" size={15} /> เพิ่มช่างที่ทำสัญญา</button>}
      </div>
      <div className="market-scroll">
        {vendors.length === 0 ? <p className="market-empty">ยังไม่มีช่างที่ทำสัญญา</p> : (
          <div className="repair-vendor-grid">
            {vendors.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} onOpen={onOpen} onSend={onSend} />)}
          </div>
        )}
      </div>
    </>
  )
}

function CopyButton({ value, label = 'คัดลอก' }) {
  const [state, setState] = useState('')
  return (
    <button type="button" className={`market-copy-btn${state === 'คัดลอกแล้ว' ? ' is-done' : ''}`} onClick={async () => {
      try {
        await copyText(value)
        setState('คัดลอกแล้ว')
      } catch {
        setState('คัดลอกไม่สำเร็จ')
      }
      setTimeout(() => setState(''), 1600)
    }}>
      <Icon name={state === 'คัดลอกแล้ว' ? 'check' : 'copy'} size={13} /> {state || label}
    </button>
  )
}

function ApiExamples({ base }) {
  const examples = useMemo(() => repairGuideExamples(base), [base])
  const [activeId, setActiveId] = useState(examples[0].id)
  const active = examples.find((example) => example.id === activeId) || examples[0]
  return (
    <section className="market-section market-api-example">
      <div className="market-endpoints-head">
        <div><h4><Icon name="code" size={18} /> ตัวอย่างการเรียกใช้งาน</h4><p>เลือกขั้นตอนเพื่อดูคำสั่งที่ส่งและผลลัพธ์ที่จะได้รับ</p></div>
        <span className="market-endpoints-count">{examples.length} ตัวอย่าง</span>
      </div>
      <div className="market-example-browser">
        <ul className="market-example-list" role="tablist" aria-label="ตัวอย่าง endpoint">
          {examples.map((example) => (
            <li key={example.id}>
              <button type="button" role="tab" aria-selected={example.id === active.id} className={example.id === active.id ? 'is-active' : ''} onClick={() => setActiveId(example.id)}>
                <span className={`market-method is-${example.method.toLowerCase()}`}>{example.method}</span>
                <span><strong>{example.title}</strong><small>{example.path}</small></span>
              </button>
            </li>
          ))}
        </ul>
        <div className="market-example-detail">
          <p className="market-example-desc">{active.description}</p>
          <div className="market-api-terminal">
            <div className="market-api-terminal-head">
              <span className={`market-method is-${active.method.toLowerCase()}`}>{active.method}</span>
              <span>{active.path}</span>
              <small>Request</small>
              <CopyButton value={active.code} />
            </div>
            <pre className="market-code"><code>{active.code}</code></pre>
          </div>
          <div className="market-api-terminal is-response">
            <div className="market-api-terminal-head">
              <span className={`market-status-badge${active.status >= 400 ? ' is-error' : ''}`}>{active.status}</span>
              <span>application/json</span>
              <small>Response</small>
            </div>
            <pre className="market-code"><code>{active.response}</code></pre>
          </div>
        </div>
      </div>
    </section>
  )
}

const FLOW_MAIN = ['sent', 'accepted', 'in_progress', 'done']
const FLOW_STOPS = ['rejected', 'cancelled']

function StatusFlowStep({ step }) {
  return (
    <li className={`repair-flow-step is-${JOB_STATUS[step.status].tone}`}>
      <span className="repair-flow-status">{step.status}</span>
      <strong>{step.label}</strong>
      <small><Icon name="user" size={12} /> {step.by}</small>
      <em>{step.next.length ? `→ ${step.next.join(', ')}` : 'สิ้นสุด'}</em>
    </li>
  )
}

function GuidePrintDocument({ base, nodeRef }) {
  return createPortal(
    <div className="market-guide-print" ref={nodeRef} aria-hidden="true">
      <header>
        <span className="market-guide-print-icon"><Icon name="wrench" size={26} /></span>
        <div>
          <h1>{REPAIR_GUIDE_TITLE}</h1>
          <p>{REPAIR_GUIDE_VERSION} · ปรับปรุงล่าสุด {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </header>
      <h2>1. ภาพรวมและสิทธิ์การเข้าถึง</h2>
      <ul>{REPAIR_GUIDE_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      <h2>2. การเชื่อมต่อ</h2>
      <dl className="market-guide-print-conn">
        <div><dt>Base URL</dt><dd><code>{base}</code></dd></div>
        <div><dt>Header</dt><dd><code>X-Repair-Api-Key: &lt;API_KEY&gt;</code></dd></div>
      </dl>
      <p>แทน &lt;API_KEY&gt; ด้วย key ที่ได้รับจากเจ้าหน้าที่หอพัก ห้ามส่ง header Authorization มาด้วย ส่งข้อมูลเป็น JSON และใส่ Content-Type: application/json เมื่อมี body</p>
      <h2>3. ลำดับสถานะงาน</h2>
      <table>
        <thead><tr><th>status</th><th>ความหมาย</th><th>ผู้เปลี่ยน</th><th>ไปต่อได้</th></tr></thead>
        <tbody>{REPAIR_STATUS_FLOW.map((step) => <tr key={step.status}><td><code>{step.status}</code></td><td>{step.label}</td><td>{step.by}</td><td>{step.next.length ? step.next.join(', ') : 'สิ้นสุด'}</td></tr>)}</tbody>
      </table>
      <h2>4. Endpoints</h2>
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>สิทธิ์</th><th>รายละเอียด</th></tr></thead>
        <tbody>
          {REPAIR_GUIDE_ENDPOINTS.map((item) => (
            <tr key={item.method + item.path}>
              <td><span className={`market-method is-${item.method.toLowerCase()}`}>{item.method}</span></td>
              <td><code>{item.path}</code></td>
              <td>{item.access}</td>
              <td>{item.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>5. ฟิลด์ใน PATCH /jobs/:id/status</h2>
      <p>ส่งได้เฉพาะฟิลด์ด้านล่าง ถ้าส่งฟิลด์อื่นจะได้ 400 FIELD_NOT_ALLOWED</p>
      <table>
        <thead><tr><th>ฟิลด์</th><th>ชนิดข้อมูล</th><th>หมายเหตุ</th></tr></thead>
        <tbody>{REPAIR_STATUS_FIELDS.map((item) => <tr key={item.name}><td><code>{item.name}</code></td><td>{item.type}</td><td>{item.note}</td></tr>)}</tbody>
      </table>
      <h2>6. ตัวอย่างการเรียกใช้งาน</h2>
      <p>ทุกตัวอย่างใช้ cURL แทน &lt;API_KEY&gt; ด้วย key จริง และแทน id งานด้วยค่าที่ได้จาก GET /jobs</p>
      {repairGuideExamples(base).map((example) => (
        <div key={example.id} className="market-guide-print-example">
          <h3><span className={`market-method is-${example.method.toLowerCase()}`}>{example.method}</span> {example.path} — {example.title}</h3>
          <p className="market-guide-print-muted">{example.description}</p>
          <small>Request</small>
          <pre><code>{example.code}</code></pre>
          <small>Response ({example.status})</small>
          <pre><code>{example.response}</code></pre>
        </div>
      ))}
      <h3>ตัวอย่างโค้ดเรียกใช้งาน</h3>
      {repairClientSamples(base).map((sample) => (
        <div key={sample.id} className="market-guide-print-example">
          <small>{sample.title}</small>
          {sample.setup && <p>ต้องใช้ Node.js 18 ขึ้นไป · ติดตั้ง {sample.setup[0]} · รัน {sample.setup[1]}</p>}
          <pre><code>{sample.code}</code></pre>
        </div>
      ))}
      <h2>7. Webhook (ไม่บังคับ)</h2>
      <p>ถ้าหอพักตั้ง Webhook URL ให้ เมื่อหอพักส่งงาน แก้ไขงาน หรือยกเลิกงาน ระบบจะ POST JSON ไปที่ URL นั้น พร้อม header X-Repair-Event: job.created, job.updated หรือ job.cancelled ต้องตอบ HTTP 2xx ภายใน 5 วินาที แล้วยืนยันข้อมูลอีกครั้งด้วย GET /jobs/:id</p>
      <pre><code>{REPAIR_WEBHOOK_SAMPLE}</code></pre>
      <h2>8. รหัสข้อผิดพลาด</h2>
      <p>เมื่อเกิดข้อผิดพลาด API จะตอบกลับเป็น JSON รูปแบบ {'{ "code": "...", "message": "..." }'}</p>
      <table>
        <thead><tr><th>รหัส</th><th>ความหมาย</th></tr></thead>
        <tbody>{REPAIR_GUIDE_ERRORS.map(([code, meaning]) => <tr key={code}><td><code>{code}</code></td><td>{meaning}</td></tr>)}</tbody>
      </table>
      <h2>9. Prompt สำหรับให้ AI ใช้งาน API</h2>
      <p>คัดลอกข้อความด้านล่างไปใส่เป็น system prompt ของ AI แล้วให้ AI เรียก API แทนคุณ อย่าใส่ API key จริงลงใน prompt</p>
      <pre><code>{repairAiPrompt(base)}</code></pre>
    </div>,
    document.body,
  )
}

function GuideDownloads({ base }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const printRef = useRef(null)

  useEffect(() => {
    if (busy !== 'pdf') return undefined
    let active = true
    const timer = setTimeout(async () => {
      try {
        if (printRef.current) await downloadGuidePdf(printRef.current, REPAIR_GUIDE_FILE)
      } catch {
        if (active) setError('สร้างไฟล์ PDF ไม่สำเร็จ')
      } finally {
        if (active) setBusy('')
      }
    }, 80)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [busy])

  const downloadDocx = async () => {
    setBusy('docx')
    setError('')
    try {
      await downloadRepairGuideDocx(base)
    } catch {
      setError('สร้างไฟล์ DOCX ไม่สำเร็จ')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="market-guide-downloads">
      <span className="market-guide-downloads-label">ดาวน์โหลดคู่มือ</span>
      <button type="button" className="market-guide-download is-docx" disabled={Boolean(busy)} onClick={downloadDocx}>
        <Icon name="contract" size={15} /> {busy === 'docx' ? 'กำลังสร้าง...' : 'DOCX'}
      </button>
      <button type="button" className="market-guide-download is-pdf" disabled={Boolean(busy)} onClick={() => { setError(''); setBusy('pdf') }}>
        <Icon name="contract" size={15} /> {busy === 'pdf' ? 'กำลังสร้าง...' : 'PDF'}
      </button>
      {error && <small className="market-guide-download-error">{error}</small>}
      {busy === 'pdf' && <GuidePrintDocument base={base} nodeRef={printRef} />}
    </div>
  )
}

function ApiClientSamples({ base }) {
  const samples = useMemo(() => repairClientSamples(base), [base])
  const [sampleId, setSampleId] = useState(samples[0].id)
  const sample = samples.find((item) => item.id === sampleId) || samples[0]
  return (
    <div className="market-client-samples">
      <div className="market-client-tabs" role="tablist" aria-label="ภาษาโปรแกรม">
        {samples.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={item.id === sample.id} className={item.id === sample.id ? 'is-active' : ''} onClick={() => setSampleId(item.id)}>{item.title}</button>
        ))}
        <CopyButton value={sample.code} />
      </div>
      {sample.setup && (
        <p className="market-client-hint">
          ต้องใช้ Node.js 18 ขึ้นไป · ติดตั้ง <code>{sample.setup[0]}</code> · รัน <code>{sample.setup[1]}</code>
        </p>
      )}
      <pre className="market-code"><code>{sample.code}</code></pre>
    </div>
  )
}

function ApiGuideSection() {
  const base = `${API_ORIGIN}${REPAIR_VENDOR_API_PREFIX}`
  const prompt = useMemo(() => repairAiPrompt(base), [base])
  const flow = Object.fromEntries(REPAIR_STATUS_FLOW.map((step) => [step.status, step]))
  return (
    <div className="market-scroll market-api-guide">
      <section className="market-section market-api-connect">
        <div className="market-endpoints-head">
          <div><h4><Icon name="key" size={18} /> เชื่อมต่อ API สำหรับช่างที่ทำสัญญา</h4><p>ส่งข้อมูลส่วนนี้ให้ช่างพร้อม API key เพื่อให้ระบบของช่างรับงานและอัปเดตสถานะได้เอง</p></div>
          <div className="market-guide-head-actions">
            <GuideDownloads base={base} />
            <span className="market-endpoints-count">{REPAIR_GUIDE_VERSION}</span>
          </div>
        </div>
        <div className="market-api-credentials">
          <p className="market-api-base"><span>Base URL</span><code>{base}</code><CopyButton value={base} /></p>
          <p className="market-api-base"><span>Header</span><code>X-Repair-Api-Key: &lt;API_KEY&gt;</code><small>ออก key ได้ที่หน้ารายละเอียดช่างแต่ละราย</small></p>
        </div>
        <div className="market-api-scope">
          <h5>สิทธิ์การเข้าถึง</h5>
          <ul className="market-api-rules">{REPAIR_GUIDE_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </div>
      </section>

      <section className="market-section">
        <div className="market-endpoints-head">
          <div><h4><Icon name="wrench" size={18} /> ลำดับสถานะงาน</h4><p>ช่างเปลี่ยนสถานะได้ทีละขั้น สถานะฝั่งหอพักจะเปลี่ยนตามทันที</p></div>
          <span className="market-endpoints-count">{REPAIR_STATUS_FLOW.length} สถานะ</span>
        </div>
        <ol className="repair-flow is-main">
          {FLOW_MAIN.map((status) => <StatusFlowStep key={status} step={flow[status]} />)}
        </ol>
        <div className="repair-flow-stops">
          <span className="repair-flow-stops-label">ปิดงานโดยไม่ซ่อม</span>
          <ol className="repair-flow">
            {FLOW_STOPS.map((status) => <StatusFlowStep key={status} step={flow[status]} />)}
          </ol>
        </div>
      </section>

      <section className="market-section market-endpoints">
        <div className="market-endpoints-head">
          <div><h4><Icon name="code" size={18} /> Endpoints</h4><p>เลือก endpoint ตามงานที่ต้องการ โดยใช้ path ต่อจาก Base URL</p></div>
          <span className="market-endpoints-count">{REPAIR_GUIDE_ENDPOINTS.length} endpoints</span>
        </div>
        <div className="market-endpoint-groups">
          {[
            { access: 'อ่าน', title: 'เรียกดูข้อมูล', description: 'ข้อมูลช่าง สัญญา และงานซ่อมที่ได้รับ', icon: 'search' },
            { access: 'แก้ไข', title: 'อัปเดตสถานะงาน', description: 'รับงาน ปฏิเสธ เริ่มซ่อม และปิดงาน พร้อมนัดหมาย', icon: 'edit' },
          ].map((group) => (
            <section className="market-endpoint-group" key={group.access} aria-label={group.title}>
              <div className="market-endpoint-group-head">
                <span className={`market-endpoint-group-icon ${group.access === 'อ่าน' ? 'is-read' : 'is-write'}`}><Icon name={group.icon} size={18} /></span>
                <div><h5>{group.title}</h5><p>{group.description}</p></div>
              </div>
              <ul className="market-api-table">
                {REPAIR_GUIDE_ENDPOINTS.filter((item) => item.access === group.access).map((item) => (
                  <li key={`${item.method}${item.path}`} className={`market-api-row is-${item.method.toLowerCase()}`}>
                    <div className="market-endpoint-route">
                      <span className={`market-method is-${item.method.toLowerCase()}`}>{item.method}</span>
                      <code>{item.path}</code>
                    </div>
                    <p>{item.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="repair-field-cards">
          <h5>ฟิลด์ที่ส่งได้ใน <code>PATCH /jobs/:id/status</code></h5>
          <ul>
            {REPAIR_STATUS_FIELDS.map((item) => (
              <li key={item.name}>
                <code>{item.name}</code>
                <span>{item.type}</span>
                <small>{item.note}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ApiExamples base={base} />

      <section className="market-section">
        <div className="market-endpoints-head">
          <div><h4><Icon name="code" size={18} /> ตัวอย่างโค้ดสำหรับระบบของช่าง</h4><p>ดึงงานใหม่และรับงานอัตโนมัติ หรือรับแจ้งเตือนผ่าน Webhook</p></div>
        </div>
        <ApiClientSamples base={base} />
      </section>

      <section className="market-section">
        <div className="market-endpoints-head">
          <div>
            <h4><Icon name="link" size={18} /> Webhook (ไม่บังคับ)</h4>
            <p>ถ้าตั้ง Webhook URL ไว้ที่ข้อมูลช่าง เมื่อหอพักส่งงาน แก้ไขงาน หรือยกเลิกงาน ระบบจะ POST JSON ไปที่ URL นั้น ช่างต้องตอบ HTTP 2xx ภายใน 5 วินาที แล้วยืนยันข้อมูลอีกครั้งด้วย GET /jobs/:id</p>
          </div>
          <CopyButton value={REPAIR_WEBHOOK_SAMPLE} />
        </div>
        <div className="repair-webhook-events">
          <span><code>X-Repair-Event: job.created</code> หอพักส่งงานใหม่ หรือกดส่งแจ้งเตือนซ้ำ</span>
          <span><code>X-Repair-Event: job.updated</code> หอพักแก้ไขรายละเอียดงาน</span>
          <span><code>X-Repair-Event: job.cancelled</code> หอพักยกเลิกงาน</span>
        </div>
        <pre className="market-code"><code>{REPAIR_WEBHOOK_SAMPLE}</code></pre>
      </section>

      <section className="market-section market-api-prompt">
        <div className="market-endpoints-head">
          <div>
            <h4><Icon name="user" size={18} /> Prompt สำหรับให้ AI ใช้งาน API</h4>
            <p>คัดลอกไปใส่เป็น system prompt ของ AI หรือ agent แล้วให้ AI ดึงงานและอัปเดตสถานะแทนช่าง</p>
          </div>
          <CopyButton value={prompt} label="คัดลอก Prompt" />
        </div>
        <ol className="market-prompt-steps">
          <li>คัดลอก Prompt ด้านล่างไปตั้งเป็นคำสั่งเริ่มต้นของ AI</li>
          <li>เก็บ API key ไว้ในตัวแปรของระบบหรือ tool ของ AI อย่าวาง key จริงลงในแชต</li>
          <li>สั่งงานเป็นภาษาธรรมดา เช่น "มีงานใหม่ไหม" หรือ "รับงานห้อง 305 นัดพรุ่งนี้บ่ายโมง"</li>
        </ol>
        <pre className="market-code market-prompt-box"><code>{prompt}</code></pre>
      </section>

      <section className="market-section market-api-error-section">
        <div className="market-endpoints-head">
          <div><h4><Icon name="alert" size={18} /> รหัสข้อผิดพลาด</h4><p>ตรวจสอบ HTTP status และ code ที่ได้รับ</p></div>
          <span className="market-endpoints-count">{REPAIR_GUIDE_ERRORS.length} รหัส</span>
        </div>
        <dl className="market-api-errors">
          {REPAIR_GUIDE_ERRORS.map(([code, text]) => <div key={code}><dt><span>{code.split(' ')[0]}</span><code>{code.split(' ')[1]}</code></dt><dd>{text}</dd></div>)}
        </dl>
      </section>
    </div>
  )
}

export default function RepairVendorManager({ rooms = [], onSummary, readOnly = false }) {
  const summaryRef = useRef(onSummary)
  useEffect(() => {
    summaryRef.current = onSummary
  })
  const [section, setSection] = useState('jobs')
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/overview`)
      setState({ loading: false, error: '', data })
      summaryRef.current?.(data.summary)
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'โหลดข้อมูลงานซ่อมไม่สำเร็จ') }))
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  const refresh = (message) => {
    if (typeof message === 'string') setNotice(message)
    load()
  }

  const data = state.data
  const liveJob = modal?.type === 'job' ? data?.jobs.find((job) => job.id === modal.job.id) || modal.job : null

  return (
    <CanEditContext.Provider value={!readOnly}>
    <div className="market-manager repair-manager">
      <header className="market-head">
        <div className="market-title">
          <span className="market-title-icon"><Icon name="wrench" size={22} /></span>
          <div>
            <h3>ติดต่อช่างซ่อม</h3>
            <p>{readOnly ? 'ดูงานซ่อมที่ส่งให้ช่าง ช่างที่ทำสัญญา และสถานะล่าสุด (ดูได้อย่างเดียว)' : 'ส่งงานซ่อมให้ช่างที่ทำสัญญารายเดือน/รายปี และติดตามสถานะที่ช่างอัปเดตกลับมา'}</p>
          </div>
        </div>
        <nav
          className="market-sections repair-sections"
          aria-label="ส่วนของระบบติดต่อช่าง"
          style={{ '--tab-count': SECTIONS.length, '--tab-index': Math.max(0, SECTIONS.findIndex((item) => item.key === section)) }}
        >
          <span className="repair-sections-indicator" aria-hidden="true" />
          {SECTIONS.map((item) => (
            <button key={item.key} type="button" aria-current={section === item.key ? 'page' : undefined} className={`market-section-tab${section === item.key ? ' is-active' : ''}`} onClick={() => setSection(item.key)}>
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {notice && <NoticeModal message={notice} onClose={() => setNotice('')} />}
      {state.error && <p className="market-error" role="alert">{state.error}</p>}
      {state.loading && !data && <p className="market-empty">กำลังโหลด...</p>}

      {data && section === 'jobs' && (
        <JobsSection
          data={data}
          onSend={(vendorId) => setModal({ type: 'send', vendorId })}
          onOpenJob={(job) => setModal({ type: 'job', job })}
          onCancelJob={(job) => setModal({ type: 'cancel-job', job })}
        />
      )}
      {data && section === 'vendors' && (
        <VendorsSection
          data={data}
          onOpen={(id) => setModal({ type: 'vendor', id })}
          onCreate={() => setModal({ type: 'create-vendor' })}
          onSend={(vendorId) => setModal({ type: 'send', vendorId })}
        />
      )}
      {section === 'api' && <ApiGuideSection />}

      {modal?.type === 'create-vendor' && (
        <VendorFormModal onClose={() => setModal(null)} onSaved={(message) => {
          setModal(null)
          refresh(message)
        }} />
      )}
      {modal?.type === 'vendor' && (
        <VendorDetailModal
          vendorId={modal.id}
          onClose={() => setModal(null)}
          onChanged={refresh}
          onSendJob={(vendorId) => setModal({ type: 'send', vendorId })}
          onOpenJob={(job) => setModal({ type: 'job', job, backTo: modal })}
        />
      )}
      {modal?.type === 'send' && data && (
        <JobFormModal data={data} rooms={rooms} initialVendorId={modal.vendorId} onClose={() => setModal(null)} onSaved={(message) => {
          setModal(null)
          setSection('jobs')
          refresh(message)
        }} />
      )}
      {modal?.type === 'cancel-job' && (
        <ConfirmModal
          title="ยกเลิกงานซ่อม"
          message={`ยกเลิกงานซ่อมห้อง ${modal.job.room_number} ที่ส่งให้ ${modal.job.vendor_name} ช่างจะเห็นสถานะเป็นยกเลิก`}
          submitLabel="ยกเลิกงาน"
          reasonLabel="เหตุผลที่ยกเลิก *"
          onClose={() => setModal(null)}
          onConfirm={async (reason) => {
            const response = await axios.post(`${API_BASE}/jobs/${modal.job.id}/cancel`, { reason })
            refresh(response.data.message)
            return response
          }}
        />
      )}
      {liveJob && (
        <JobDetailModal job={liveJob} onClose={() => setModal(modal.backTo || null)} onChanged={refresh} />
      )}
    </div>
    </CanEditContext.Provider>
  )
}
