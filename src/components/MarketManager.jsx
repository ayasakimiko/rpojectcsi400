import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import ThaiDatePicker from './ThaiDatePicker.jsx'
import PhotoLightbox from './PhotoLightbox.jsx'
import PromptPayQr from './PromptPayQr.jsx'
import readSlipQrPayload from '../utils/slipQr.js'
import { copyText } from '../utils/copyText.js'
import { formatPromptPayId } from '../utils/promptpay.js'
import {
  GUIDE_ENDPOINTS,
  GUIDE_ERRORS,
  GUIDE_FIELDS,
  GUIDE_RULES,
  GUIDE_TITLE,
  GUIDE_VERSION,
  downloadGuideDocx,
  downloadGuidePdf,
  guideExamples,
} from '../utils/marketApiGuide.js'
import { ContractImagePicker } from './RentalContract.jsx'
import { addContractMonths } from '../utils/rentalContract.js'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'
import { API_ORIGIN } from '../config/api.js'
import { MARKET_TENANT_API_PREFIX } from '../config/serviceRoutes.js'
import './MarketManager.css'

const API_BASE = '/api/market'
const DATE_PORTAL = 'market-date-portal'

const SECTIONS = [
  { key: 'shops', label: 'ร้านค้า' },
  { key: 'leases', label: 'สัญญาเช่าร้านค้า' },
  { key: 'api', label: 'API สำหรับผู้เช่า' },
]

const LEASE_STATUS = {
  active: { label: 'ใช้งานอยู่', tone: 'success' },
  upcoming: { label: 'รอเริ่มสัญญา', tone: 'info' },
  expired: { label: 'หมดอายุ', tone: 'muted' },
  terminated: { label: 'ยกเลิกแล้ว', tone: 'danger' },
}

const LEASE_FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'active', label: 'ใช้งานอยู่' },
  { key: 'upcoming', label: 'รอเริ่ม' },
  { key: 'expired', label: 'หมดอายุ' },
  { key: 'terminated', label: 'ยกเลิกแล้ว' },
]

const SHOP_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', match: () => true },
  { key: 'rented', label: 'มีผู้เช่า', match: (shop) => shop.current_lease?.status === 'active' },
  { key: 'upcoming', label: 'รอเริ่มสัญญา', match: (shop) => shop.current_lease?.status === 'upcoming' },
  { key: 'vacant', label: 'ว่าง', match: (shop) => !shop.current_lease },
]

const ROLE_HINT = {
  Admin: 'สร้าง/แก้ไขร้านค้า ทำสัญญาเช่า และจัดการสินค้าได้',
  Owner: 'สร้าง/แก้ไขร้านค้าได้ ส่วนสัญญาเช่าและสินค้าดูได้อย่างเดียว',
  Staff: 'ดูแลร้านค้า ทำสัญญาเช่า จัดการสินค้า และออก API key ให้ผู้เช่า',
}

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })
const errorMessage = (error, fallback) => error.response?.data?.message || fallback
const currentRole = () => {
  try {
    return JSON.parse(sessionStorage.getItem('user') || '{}').role || ''
  } catch {
    return ''
  }
}

const money = (value) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const thaiDate = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-')
const thaiDateTime = (value) => (value ? new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')
const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const dateFromKey = (key) => (key ? new Date(`${key}T00:00:00`) : undefined)
const daysUntil = (key) => Math.round((new Date(`${key}T00:00:00`) - new Date(`${todayKey()}T00:00:00`)) / 86400000)
const hours = (shop) => (shop.open_time && shop.close_time ? `${shop.open_time} - ${shop.close_time} น.` : 'ไม่ระบุเวลา')

const ICON_PATHS = {
  shop: <><path d="M3 9.5 4.6 4.8A1.5 1.5 0 0 1 6 3.8h12a1.5 1.5 0 0 1 1.4 1L21 9.5" /><path d="M3 9.5h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 13.2V20h14v-6.8" /><path d="M10 20v-4h4v4" /></>,
  contract: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7" /><path d="m17 6 2.5 2.5M14.5 8.5 16.5 10.5" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2M6 6l1 14h10l1-14" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  idcard: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0M15 10h3M15 14h3" /></>,
  ruler: <><path d="M3 17 17 3l4 4L7 21z" /><path d="m7 13 2 2M10 10l2 2M13 7l2 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  wallet: <><path d="M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v3" /><path d="M16 13.5h.01" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5-9 9" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2A2.6 2.6 0 0 0 12.4 8H11a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-1.6a2.6 2.6 0 0 1-2.4-1.2M12 6v2M12 16v2" /></>,
}

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

function InfoGroup({ title, icon, items, columns = 3 }) {
  return (
    <section className="market-section">
      <div className="market-section-head"><h4><span className="market-section-icon"><Icon name={icon} size={15} /></span> {title}</h4></div>
      <div className={`market-info-grid is-${columns}`}>
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
    </section>
  )
}

function StatusPill({ status }) {
  const info = LEASE_STATUS[status] || { label: 'ว่าง', tone: 'vacant' }
  return <span className={`market-pill is-${info.tone}`}>{info.label}</span>
}

const openModals = []
const MODAL_EXIT_MS = 180

function MarketModal({ title, subtitle, icon = 'shop', tone = 'primary', size = 'md', busy, error, onClose, onSubmit, submitLabel, submitDisabled, cancelLabel = 'ยกเลิก', footer, children }) {
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
        className={`market-modal is-${tone} is-${size}`}
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
                <button type="button" className="market-btn" disabled={busy} onClick={requestClose}>{cancelLabel}</button>
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
  return { busy, error, setError, run }
}

const SHOP_TYPE_PRESETS = ['มินิมาร์ท / ร้านสะดวกซื้อ', 'ร้านเครื่องดื่ม', 'ร้านอาหาร', 'เครื่องเขียน / ของใช้', 'ร้านซักรีด', 'ร้านขนม / เบเกอรี่']
const HOUR_PRESETS = [
  { label: '06:00 - 23:00', open: '06:00', close: '23:00' },
  { label: '07:00 - 20:00', open: '07:00', close: '20:00' },
  { label: '09:00 - 21:00', open: '09:00', close: '21:00' },
  { label: '24 ชั่วโมง', open: '00:00', close: '23:59' },
]

const timeToDate = (value) => {
  if (!value) return null
  const [hour, minute] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date
}
const dateToTime = (date) => (date ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '')

function nextShopCode(shops) {
  const numbers = shops.map((item) => Number(/^SH-(\d+)$/i.exec(item.code)?.[1])).filter(Number.isFinite)
  return `SH-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(2, '0')}`
}

function ShopFormModal({ shop, shops = [], onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    code: shop?.code || nextShopCode(shops),
    name: shop?.name || '',
    shop_type: shop?.shop_type || '',
    location: shop?.location || '',
    area_sqm: shop ? String(shop.area_sqm) : '',
    monthly_rent: shop ? String(shop.monthly_rent) : '',
    open_time: shop?.open_time || '',
    close_time: shop?.close_time || '',
    caretaker_staff_id: shop?.caretaker_staff_id ? String(shop.caretaker_staff_id) : '',
    description: shop?.description || '',
  }))
  const [staff, setStaff] = useState([])
  const { busy, error, run } = useSubmit((data) => onSaved(data.message))

  useEffect(() => {
    axios.get('/api/auth/staff-directory', { headers: authHeaders() })
      .then(({ data }) => setStaff(data.staff || []))
      .catch(() => setStaff([]))
  }, [])

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const setValue = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const caretaker = staff.find((item) => String(item.id) === form.caretaker_staff_id)
  const caretakerName = caretaker?.name || (form.caretaker_staff_id && shop?.caretaker_name) || null
  const previewShop = {
    id: shop?.id ?? 0,
    code: form.code.trim() || 'SH-??',
    name: form.name.trim() || 'ชื่อร้าน',
    shop_type: form.shop_type.trim() || 'ประเภทร้าน',
    location: form.location.trim() || 'ตำแหน่งร้าน',
    open_time: form.open_time && form.close_time ? form.open_time : null,
    close_time: form.open_time && form.close_time ? form.close_time : null,
    monthly_rent: Number(form.monthly_rent) || 0,
    caretaker_name: caretakerName,
    categories: shop?.categories || [],
    product_count: shop?.product_count || 0,
    available_count: shop?.available_count || 0,
    current_lease: shop?.current_lease || null,
  }
  const missing = [
    !form.code.trim() && 'รหัสร้าน',
    !form.name.trim() && 'ชื่อร้าน',
    !form.shop_type.trim() && 'ประเภทร้าน',
    !form.location.trim() && 'ตำแหน่งร้าน',
    !(Number(form.monthly_rent) > 0) && 'ค่าเช่าตั้งต้น',
    Boolean(form.open_time) !== Boolean(form.close_time) && 'เวลาเปิด-ปิดให้ครบ',
  ].filter(Boolean)

  const submit = () => {
    if (missing.length > 0) return
    run(() => {
      const body = { ...form, caretaker_staff_id: form.caretaker_staff_id ? Number(form.caretaker_staff_id) : null, area_sqm: form.area_sqm || 0 }
      return shop ? axios.put(`${API_BASE}/shops/${shop.id}`, body, { headers: authHeaders() }) : axios.post(`${API_BASE}/shops`, body, { headers: authHeaders() })
    }, 'บันทึกร้านค้าไม่สำเร็จ')
  }

  return (
    <MarketModal
      title={shop ? `แก้ไขร้าน ${shop.name}` : 'สร้างร้านค้าใหม่'}
      subtitle="จุดขายข้างหอพักที่เปิดให้เช่า"
      size="xl"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={shop ? 'บันทึกการแก้ไข' : 'สร้างร้านค้า'}
      submitDisabled={missing.length > 0}
    >
      <div className="market-lease-form is-shop-form">
        <div className="market-lease-form-main">
          <FormStep number="1" title="ข้อมูลร้าน">
            <div className="market-form-grid">
              <Field label="รหัสร้าน *" hint={shop ? null : 'ระบบตั้งรหัสถัดไปให้ แก้ได้'}>
                <input className="market-input" value={form.code} maxLength={20} onChange={(event) => setValue('code', event.target.value.toUpperCase())} />
              </Field>
              <Field label="ชื่อร้าน *"><input className="market-input" value={form.name} maxLength={150} placeholder="เช่น มินิมาร์ทหน้าหอ" onChange={set('name')} /></Field>
              <Field label="ประเภทร้าน *" wide>
                <div className="market-chips">
                  {SHOP_TYPE_PRESETS.map((type) => (
                    <button key={type} type="button" className={`market-chip${form.shop_type === type ? ' is-active' : ''}`} onClick={() => setValue('shop_type', type)}>{type}</button>
                  ))}
                </div>
                <input className="market-input" value={form.shop_type} maxLength={100} placeholder="หรือพิมพ์ประเภทร้านเอง" onChange={set('shop_type')} />
              </Field>
            </div>
          </FormStep>

          <FormStep number="2" title="ทำเลและค่าเช่า">
            <div className="market-form-grid">
              <Field label="ตำแหน่งร้าน *" wide><input className="market-input" value={form.location} maxLength={255} placeholder="เช่น ชั้น 1 ติดประตูทางเข้าหลัก" onChange={set('location')} /></Field>
              <Field label="ขนาดพื้นที่ (ตร.ม.)"><input className="market-input" type="number" min="0" step="0.01" value={form.area_sqm} placeholder="0" onChange={set('area_sqm')} /></Field>
              <Field label="ค่าเช่าตั้งต้น / เดือน (บาท) *"><input className="market-input" type="number" min="1" step="0.01" value={form.monthly_rent} placeholder="เช่น 5000" onChange={set('monthly_rent')} /></Field>
            </div>
          </FormStep>

          <FormStep number="3" title="เวลาเปิด-ปิด" hint="เลือกจากชุดเวลาที่ใช้บ่อย หรือเลือกเวลาเอง">
            <div className="market-chips">
              {HOUR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`market-chip${form.open_time === preset.open && form.close_time === preset.close ? ' is-active' : ''}`}
                  onClick={() => setForm((current) => ({ ...current, open_time: preset.open, close_time: preset.close }))}
                >
                  {preset.label}
                </button>
              ))}
              <button type="button" className={`market-chip${!form.open_time && !form.close_time ? ' is-active' : ''}`} onClick={() => setForm((current) => ({ ...current, open_time: '', close_time: '' }))}>ไม่ระบุเวลา</button>
            </div>
            <div className="market-form-grid">
              <Field label="เวลาเปิด">
                <ThaiDatePicker className="form-control market-date-input" timeOnly valueType="date" timeIntervals={30} placeholder="เลือกเวลาเปิด" portalId={DATE_PORTAL} value={timeToDate(form.open_time)} onChange={(date) => setValue('open_time', dateToTime(date))} />
              </Field>
              <Field label="เวลาปิด">
                <ThaiDatePicker className="form-control market-date-input" timeOnly valueType="date" timeIntervals={30} placeholder="เลือกเวลาปิด" portalId={DATE_PORTAL} value={timeToDate(form.close_time)} onChange={(date) => setValue('close_time', dateToTime(date))} />
              </Field>
            </div>
          </FormStep>

          <FormStep number="4" title="พนักงานผู้ดูแลและรายละเอียด">
            <div className="market-staff-picker" role="radiogroup" aria-label="พนักงานผู้ดูแลร้าน">
              <button type="button" role="radio" aria-checked={!form.caretaker_staff_id} className={`market-staff-option${!form.caretaker_staff_id ? ' is-selected' : ''}`} onClick={() => setValue('caretaker_staff_id', '')}>
                <span className="market-staff-avatar is-empty"><Icon name="user" size={15} /></span>
                <span>ยังไม่กำหนด</span>
              </button>
              {staff.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={form.caretaker_staff_id === String(item.id)} className={`market-staff-option${form.caretaker_staff_id === String(item.id) ? ' is-selected' : ''}`} onClick={() => setValue('caretaker_staff_id', String(item.id))}>
                  <span className="market-staff-avatar"><Icon name="user" size={14} /></span>
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
            <Field label="รายละเอียดร้าน"><textarea className="market-input" rows={3} maxLength={1000} value={form.description} placeholder="สินค้าหลัก บริการ หรือข้อมูลอื่น ๆ ของร้าน" onChange={set('description')} /></Field>
          </FormStep>
        </div>

        <aside className="market-lease-summary">
          <h4>ตัวอย่างการ์ดร้าน</h4>
          <small className="market-card-preview-hint">หน้าตาจริงที่จะแสดงในรายการร้านค้า</small>
          <div className="market-card-preview" aria-hidden="true" inert="">
            <ShopCard shop={previewShop} onOpen={() => {}} />
          </div>
          <dl>
            <div><dt>พื้นที่</dt><dd>{form.area_sqm ? `${money(form.area_sqm)} ตร.ม.` : '-'}</dd></div>
            <div><dt>ค่าเช่าตั้งต้น</dt><dd>฿{money(form.monthly_rent)} / เดือน</dd></div>
          </dl>
          <div className={`market-lease-summary-check${missing.length ? '' : ' is-ready'}`}>
            {missing.length ? (
              <>
                <strong>ยังขาดข้อมูล</strong>
                <ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            ) : <strong>ข้อมูลครบ พร้อมบันทึก</strong>}
          </div>
        </aside>
      </div>
    </MarketModal>
  )
}

function ProductFormModal({ shop, product, categories, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: product?.name || '',
    category: product?.category || '',
    price: product ? String(product.price) : '',
    stock: product ? String(product.stock) : '0',
    unit: product?.unit || 'ชิ้น',
    sku: product?.sku || '',
    description: product?.description || '',
    is_available: product ? product.is_available : true,
  }))
  const listId = useId()
  const { busy, error, run } = useSubmit((data) => onSaved(data.message))
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const submit = () => run(() => {
    const body = { ...form, price: Number(form.price), stock: Number(form.stock || 0) }
    const url = product ? `${API_BASE}/shops/${shop.id}/products/${product.id}` : `${API_BASE}/shops/${shop.id}/products`
    return product ? axios.put(url, body, { headers: authHeaders() }) : axios.post(url, body, { headers: authHeaders() })
  }, 'บันทึกสินค้าไม่สำเร็จ')

  return (
    <MarketModal
      title={product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}
      subtitle={shop.name}
      icon="box"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={product ? 'บันทึก' : 'เพิ่มสินค้า'}
    >
      <div className="market-form-grid">
        <Field label="ชื่อสินค้า *" wide><input className="market-input" value={form.name} maxLength={150} onChange={set('name')} required /></Field>
        <Field label="ประเภทสินค้า *">
          <input className="market-input" list={listId} value={form.category} maxLength={100} onChange={set('category')} required />
          <datalist id={listId}>{categories.map((category) => <option key={category} value={category} />)}</datalist>
        </Field>
        <Field label="รหัสสินค้า (SKU)"><input className="market-input" value={form.sku} maxLength={40} onChange={set('sku')} /></Field>
        <Field label="ราคา (บาท) *"><input className="market-input" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} required /></Field>
        <Field label="คงเหลือ"><input className="market-input" type="number" min="0" step="1" value={form.stock} onChange={set('stock')} /></Field>
        <Field label="หน่วยนับ"><input className="market-input" value={form.unit} maxLength={30} onChange={set('unit')} /></Field>
        <Field label="สถานะการขาย">
          <button type="button" className={`market-toggle${form.is_available ? ' is-on' : ''}`} aria-pressed={form.is_available} onClick={() => setForm((current) => ({ ...current, is_available: !current.is_available }))}>
            <span aria-hidden="true" />{form.is_available ? 'พร้อมขาย' : 'งดขายชั่วคราว'}
          </button>
        </Field>
        <Field label="รายละเอียด" wide><textarea className="market-input" rows={2} maxLength={500} value={form.description} onChange={set('description')} /></Field>
      </div>
    </MarketModal>
  )
}

const LEASE_DURATIONS = [3, 6, 12, 24]
const DEPOSIT_OPTIONS = [0, 1, 2, 3]
const LEASE_MIN_IMAGES = 3
const DEFAULT_TERMS = 'ชำระค่าเช่าภายในวันที่กำหนดของทุกเดือน ผู้เช่าดูแลความสะอาดพื้นที่ร้าน และปฏิบัติตามกฎของหอพัก'

const toDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function addMonthsKey(key, months) {
  const end = addContractMonths(new Date(`${key}T00:00:00`), months)
  end.setDate(end.getDate() - 1)
  return toDateKey(end)
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

function LeaseFormModal({ shops, initialShopId, onClose, onSaved }) {
  const firstShop = shops.find((shop) => shop.id === initialShopId) || shops.find((shop) => !shop.current_lease) || shops[0]
  const [form, setForm] = useState(() => ({
    shop_id: firstShop ? firstShop.id : null,
    tenant_name: '',
    business_name: '',
    tenant_phone: '',
    tenant_idcard: '',
    tenant_email: '',
    start_date: todayKey(),
    duration: 12,
    custom_end: '',
    monthly_rent: firstShop ? String(firstShop.monthly_rent) : '',
    deposit_months: 2,
    payment_due_day: '5',
    terms: DEFAULT_TERMS,
  }))
  const [images, setImages] = useState([])
  const [touched, setTouched] = useState(false)
  const [flash, setFlash] = useState('')
  const formRef = useRef(null)
  const flashTimer = useRef(null)
  useEffect(() => () => clearTimeout(flashTimer.current), [])
  const [stage, setStage] = useState('form')
  const [payment, setPayment] = useState({ method: 'promptpay', slip: null, qrPayload: '', cashConfirmed: false })
  const previewImages = useMemo(() => images.map((image, index) => ({ id: `preview-${index}`, url: URL.createObjectURL(image), local: true })), [images])
  useEffect(() => () => previewImages.forEach((image) => URL.revokeObjectURL(image.url)), [previewImages])
  const { busy, error, run } = useSubmit((data) => onSaved(data.message, data.lease))
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const digits = (field, max) => (event) => setForm((current) => ({ ...current, [field]: event.target.value.replace(/\D/g, '').slice(0, max) }))
  const sortedShops = [...shops].sort((a, b) => Boolean(a.current_lease) - Boolean(b.current_lease) || a.code.localeCompare(b.code))
  const shop = shops.find((item) => item.id === form.shop_id)
  const endDate = form.duration === 'custom' ? form.custom_end : form.start_date ? addMonthsKey(form.start_date, form.duration) : ''
  const rent = Number(form.monthly_rent) || 0
  const deposit = rent * form.deposit_months
  const months = endDate && form.start_date ? Math.max(1, Math.round((new Date(`${endDate}T00:00:00`) - new Date(`${form.start_date}T00:00:00`) + DAY_MS) / DAY_MS / AVG_MONTH_DAYS)) : 0
  const missing = [
    !shop && { key: 'shop', label: 'เลือกร้านค้า' },
    !form.tenant_name.trim() && { key: 'tenant_name', label: 'ชื่อผู้เช่า' },
    !/^0\d{8,9}$/.test(form.tenant_phone) && { key: 'tenant_phone', label: 'เบอร์โทร' },
    !/^\d{13}$/.test(form.tenant_idcard) && { key: 'tenant_idcard', label: 'เลขบัตรประชาชน' },
    (!form.start_date || !endDate || endDate <= form.start_date) && { key: form.start_date ? 'end_date' : 'start_date', label: 'ช่วงวันที่สัญญา' },
    !(rent > 0) && { key: 'monthly_rent', label: 'ค่าเช่า' },
    images.length < LEASE_MIN_IMAGES && { key: 'images', label: `รูปสัญญาอีก ${LEASE_MIN_IMAGES - images.length} รูป` },
  ].filter(Boolean)
  const missingKeys = new Set(missing.map((item) => item.key))
  const fieldState = (key) => ({ name: key, flash: flash === key, invalid: touched && missingKeys.has(key) })

  const focusField = (key) => {
    if (stage !== 'form') setStage('form')
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

  const chooseShop = (item) => setForm((current) => ({ ...current, shop_id: item.id, monthly_rent: String(item.monthly_rent) }))

  const paymentReady = payment.method === 'counter' ? payment.cashConfirmed : Boolean(payment.slip)
  const previewLease = {
    id: 0,
    contract_no: 'SL-ใหม่',
    shop_code: shop?.code || 'SH-??',
    shop_name: shop?.name || 'ยังไม่ได้เลือกร้าน',
    tenant_name: form.tenant_name.trim() || 'ชื่อผู้เช่า',
    tenant_phone: form.tenant_phone || '-',
    start_date: form.start_date || todayKey(),
    end_date: endDate && endDate > form.start_date ? endDate : form.start_date || todayKey(),
    status: form.start_date > todayKey() ? 'upcoming' : 'active',
    monthly_rent: rent,
    deposit,
    active_keys: 0,
    created_at: new Date().toISOString(),
    created_by_name: 'คุณ',
    images: previewImages,
  }

  const submit = () => {
    setTouched(true)
    if (missing.length > 0) {
      focusField(missing[0].key)
      return
    }
    if (stage === 'form') {
      setStage('payment')
      return
    }
    if (!paymentReady) return
    const body = new FormData()
    const fields = {
      shop_id: form.shop_id,
      tenant_name: form.tenant_name,
      business_name: form.business_name,
      tenant_phone: form.tenant_phone,
      tenant_idcard: form.tenant_idcard,
      tenant_email: form.tenant_email,
      start_date: form.start_date,
      end_date: endDate,
      monthly_rent: rent,
      deposit,
      payment_due_day: form.payment_due_day,
      terms: form.terms,
    }
    for (const [key, value] of Object.entries(fields)) body.append(key, String(value ?? ''))
    for (const file of images) body.append('contract_images', file)
    body.append('payment_method', payment.method)
    if (payment.method !== 'counter') {
      body.append('payment_slip', payment.slip)
      if (payment.qrPayload) body.append('qr_payload', payment.qrPayload)
    }
    run(() => axios.post(`${API_BASE}/leases`, body, { headers: authHeaders() }), 'ชำระเงินหรือทำสัญญาไม่สำเร็จ')
  }

  return (
    <MarketModal
      title={stage === 'form' ? 'ทำสัญญาเช่าร้านค้า' : 'ชำระเงินก่อนทำสัญญา'}
      subtitle={stage === 'form' ? 'กรอกข้อมูลสัญญา แล้วไปขั้นชำระเงิน · สัญญาจะถูกสร้างหลังชำระเงินสำเร็จ' : 'ใช้ช่องทางชำระเงินเดียวกับของหอพัก'}
      icon={stage === 'form' ? 'contract' : 'coin'}
      size="xxl"
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={stage === 'form' ? 'ไปขั้นชำระเงิน ›' : 'ยืนยันชำระเงินและบันทึกสัญญา'}
      submitDisabled={stage === 'payment' && !paymentReady}
      footer={stage === 'payment' ? (
        <div className="market-footer-left">
          <button type="button" className="market-btn" disabled={busy} onClick={() => setStage('form')}>‹ กลับไปแก้ข้อมูล</button>
        </div>
      ) : null}
    >
      <div className="market-stage-bar" aria-hidden="true">
        <span className={stage === 'form' ? 'is-active' : 'is-done'}><b>1</b> ข้อมูลสัญญา</span>
        <i />
        <span className={stage === 'payment' ? 'is-active' : ''}><b>2</b> ชำระเงิน</span>
        <i />
        <span><b>3</b> สร้างสัญญา</span>
      </div>
      <div className="market-lease-form is-shop-form" ref={formRef}>
        {stage === 'payment' ? (
          <div className="market-lease-form-main">
            <LeasePaymentStep amount={rent + deposit} detail={`ค่าเช่าเดือนแรก ฿${money(rent)} + มัดจำ${form.deposit_months ? ` ${form.deposit_months} เดือน` : ''} ฿${money(deposit)}`} payment={payment} setPayment={setPayment} />
          </div>
        ) : (
        <div className="market-lease-form-main">
          <FormStep number="1" title="เลือกร้านค้า" hint="ร้านที่ว่างแสดงก่อน ร้านที่มีสัญญาอยู่ทำสัญญาต่อหลังวันสิ้นสุดได้">
            <div className={`market-shop-picker${fieldState('shop').invalid ? ' is-invalid' : ''}${fieldState('shop').flash ? ' is-flash' : ''}`} data-field="shop" role="radiogroup" aria-label="เลือกร้านค้า">
              {sortedShops.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={form.shop_id === item.id}
                  className={`market-shop-option${form.shop_id === item.id ? ' is-selected' : ''}${item.current_lease ? ' is-busy' : ''}`}
                  onClick={() => chooseShop(item)}
                >
                  <span className="market-shop-option-icon"><Icon name="shop" size={17} /></span>
                  <span className="market-shop-option-text">
                    <strong>{item.name}</strong>
                    <small>{item.code} · ฿{money(item.monthly_rent)}/เดือน</small>
                  </span>
                  <span className={`market-pill ${item.current_lease ? 'is-muted' : 'is-vacant'}`}>
                    {item.current_lease ? `ถึง ${thaiDate(item.current_lease.end_date)}` : 'ว่าง'}
                  </span>
                </button>
              ))}
            </div>
          </FormStep>

          <FormStep number="2" title="ข้อมูลผู้เช่า">
            <div className="market-form-grid">
              <Field {...fieldState('tenant_name')} label="ชื่อ-นามสกุลผู้เช่า *"><input className="market-input" value={form.tenant_name} maxLength={255} placeholder="เช่น สมชาย ใจดี" onChange={set('tenant_name')} /></Field>
              <Field label="ชื่อกิจการ / ชื่อร้าน"><input className="market-input" value={form.business_name} maxLength={150} placeholder="ไม่บังคับ" onChange={set('business_name')} /></Field>
              <Field {...fieldState('tenant_phone')} label="เบอร์โทรศัพท์ *" hint={`${form.tenant_phone.length}/10 หลัก`}><input className="market-input" inputMode="numeric" value={form.tenant_phone} placeholder="0812345678" onChange={digits('tenant_phone', 10)} /></Field>
              <Field {...fieldState('tenant_idcard')} label="เลขบัตรประชาชน *" hint={`${form.tenant_idcard.length}/13 หลัก`}><input className="market-input" inputMode="numeric" value={form.tenant_idcard} placeholder="13 หลัก" onChange={digits('tenant_idcard', 13)} /></Field>
              <Field label="อีเมล" wide><input className="market-input" type="email" value={form.tenant_email} maxLength={255} placeholder="ไม่บังคับ" onChange={set('tenant_email')} /></Field>
            </div>
          </FormStep>

          <FormStep number="3" title="ระยะสัญญาและค่าเช่า">
            <div className="market-form-grid">
              <Field label="ระยะเวลาสัญญา *" wide>
                <div className="market-segment is-even" role="group" aria-label="ระยะเวลาสัญญา">
                  {LEASE_DURATIONS.map((value) => (
                    <button key={value} type="button" className={form.duration === value ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, duration: value }))}>{value} เดือน</button>
                  ))}
                  <button type="button" className={form.duration === 'custom' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, duration: 'custom', custom_end: current.custom_end || endDate }))}>กำหนดเอง</button>
                </div>
              </Field>
              <Field {...fieldState('start_date')} label="วันเริ่มสัญญา *">
                <ThaiDatePicker
                  className="form-control market-date-input"
                  value={form.start_date}
                  placeholder="เลือกวันเริ่มสัญญา"
                  portalId={DATE_PORTAL}
                  onChange={(value) => setForm((current) => ({ ...current, start_date: value }))}
                />
              </Field>
              <Field {...fieldState('end_date')} label="วันสิ้นสุดสัญญา *" hint={form.duration === 'custom' ? 'เลือกวันสิ้นสุดเอง' : `คำนวณจาก ${form.duration} เดือน`}>
                {form.duration === 'custom' ? (
                  <ThaiDatePicker
                    className="form-control market-date-input"
                    value={form.custom_end}
                    placeholder="เลือกวันสิ้นสุดสัญญา"
                    minDate={dateFromKey(form.start_date)}
                    portalId={DATE_PORTAL}
                    onChange={(value) => setForm((current) => ({ ...current, custom_end: value }))}
                  />
                ) : (
                  <div className="market-readonly-input">
                    <Icon name="calendar" size={16} />
                    <strong>{endDate ? thaiDate(endDate) : '-'}</strong>
                  </div>
                )}
              </Field>
              <Field {...fieldState('monthly_rent')} label="ค่าเช่า / เดือน (บาท) *" hint={shop ? `ราคาตั้งต้นของร้าน ฿${money(shop.monthly_rent)}` : null}>
                <input className="market-input" type="number" min="1" step="0.01" value={form.monthly_rent} onChange={set('monthly_rent')} />
              </Field>
              <Field label="ชำระทุกวันที่" hint="1-28 ของทุกเดือน">
                <input className="market-input" type="number" min="1" max="28" value={form.payment_due_day} onChange={set('payment_due_day')} />
              </Field>
              <Field label="เงินมัดจำ" wide>
                <div className="market-segment is-even is-deposit" role="group" aria-label="จำนวนเดือนมัดจำ">
                  {DEPOSIT_OPTIONS.map((value) => (
                    <button key={value} type="button" className={form.deposit_months === value ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, deposit_months: value }))}>
                      <span>{value === 0 ? 'ไม่มีมัดจำ' : `${value} เดือน`}</span>
                      <small>฿{money(rent * value)}</small>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="เงื่อนไขเพิ่มเติม" wide><textarea className="market-input" rows={3} maxLength={2000} value={form.terms} onChange={set('terms')} /></Field>
            </div>
          </FormStep>

<FormStep number="4" title="รูปสัญญาเช่า" hint={`แนบอย่างน้อย ${LEASE_MIN_IMAGES} รูป เหมือนสัญญาเช่าห้อง`}>
            <div className={`market-field-block${fieldState('images').invalid ? ' is-invalid' : ''}${fieldState('images').flash ? ' is-flash' : ''}`} data-field="images">
              <ContractImagePicker files={images} onChange={setImages} min={LEASE_MIN_IMAGES} error={touched && images.length < LEASE_MIN_IMAGES ? `กรุณาแนบรูปสัญญาอย่างน้อย ${LEASE_MIN_IMAGES} รูป` : ''} />
            </div>
          </FormStep>
        </div>
        )}

        <aside className="market-lease-summary">
          <h4>ตัวอย่างการ์ดสัญญา</h4>
          <small className="market-card-preview-hint">หน้าตาจริงที่จะแสดงในรายการสัญญา{months ? ` · ${months} เดือน` : ''}</small>
          <div className="market-card-preview" aria-hidden="true" inert="">
            <LeaseCard lease={previewLease} onOpen={() => {}} />
          </div>
          <div className="market-lease-summary-total">
            <span>ยอดชำระแรกเข้า</span>
            <strong>฿{money(rent + deposit)}</strong>
            <small>ค่าเช่าเดือนแรก + มัดจำ</small>
          </div>
          <div className={`market-lease-summary-check${missing.length ? '' : ' is-ready'}`}>
            {missing.length ? (
              <>
                <strong>ยังขาดข้อมูล · กดเพื่อไปที่ช่องนั้น</strong>
                <ul>{missing.map((item) => <li key={item.key}><button type="button" className="market-missing-link" onClick={() => focusField(item.key)}>{item.label}</button></li>)}</ul>
              </>
            ) : <strong>{stage === 'form' ? 'ข้อมูลครบ ไปขั้นชำระเงินได้' : paymentReady ? 'พร้อมยืนยันการชำระเงิน' : payment.method === 'counter' ? 'ยืนยันว่าได้รับเงินสดแล้ว' : 'แนบสลิปการโอนเงิน'}</strong>}
          </div>
        </aside>
      </div>
    </MarketModal>
  )
}

function ConfirmModal({ title, message, tone = 'danger', icon = 'trash', submitLabel, reasonLabel, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const { busy, error, run } = useSubmit((data) => onClose(data.message))
  return (
    <MarketModal
      title={title}
      icon={icon}
      tone={tone}
      busy={busy}
      error={error}
      onClose={() => onClose()}
      onSubmit={() => run(() => onConfirm(reason.trim()), 'ทำรายการไม่สำเร็จ')}
      submitLabel={submitLabel}
      submitDisabled={reasonLabel ? !reason.trim() : false}
    >
      <p className="market-modal-message">{message}</p>
      {reasonLabel && (
        <Field label={reasonLabel}>
          <textarea className="market-input" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
        </Field>
      )}
    </MarketModal>
  )
}

const RENEW_OPTIONS = [3, 6, 12, 24]
const TERMINATE_REASONS = ['ผู้เช่าขอยกเลิกสัญญา', 'ผู้เช่าค้างชำระค่าเช่า', 'ผิดเงื่อนไขสัญญา', 'ปิดกิจการ / ย้ายร้าน']

function renewEndKey(endKey, months) {
  return toDateKey(addContractMonths(new Date(`${endKey}T00:00:00`), months))
}

function LeaseMiniSummary({ lease, tone = 'blue' }) {
  return (
    <div className={`market-mini-lease is-${tone}`}>
      <span className="market-lease-shop">
        <small>ร้าน</small>
        <strong>{lease.shop_code.replace(/^SH-/i, '')}</strong>
      </span>
      <div className="market-mini-lease-text">
        <strong>{lease.tenant_name}</strong>
        <small>{lease.contract_no} · {lease.shop_name}</small>
        <small>{thaiDate(lease.start_date)} – {thaiDate(lease.end_date)} · ฿{money(lease.monthly_rent)}/เดือน</small>
      </div>
      <StatusPill status={lease.status} />
    </div>
  )
}

const RENEW_PLAN_OPTIONS = [
  { key: 'monthly', label: 'จ่ายรายเดือน', hint: 'ชำระค่าเช่าเดือนแรกของช่วงที่ต่อตอนนี้' },
  { key: 'lump_sum', label: 'จ่ายล่วงหน้าทั้งก้อน', hint: 'ชำระค่าเช่าครบทุกเดือนที่ต่อในครั้งเดียว' },
]

function RenewModal({ lease, onClose }) {
  const [months, setMonths] = useState(12)
  const [plan, setPlan] = useState('monthly')
  const [stage, setStage] = useState('plan')
  const [payment, setPayment] = useState({ method: 'promptpay', slip: null, qrPayload: '', cashConfirmed: false })
  const { busy, error, run } = useSubmit((data) => onClose(data.message))
  const newEnd = renewEndKey(lease.end_date, months)
  const amount = lease.monthly_rent * (plan === 'lump_sum' ? months : 1)
  const paymentReady = payment.method === 'counter' ? payment.cashConfirmed : Boolean(payment.slip)

  const submit = () => {
    if (stage === 'plan') {
      setStage('payment')
      return
    }
    if (!paymentReady) return
    const body = new FormData()
    body.append('months', String(months))
    body.append('renew_plan', plan)
    body.append('payment_method', payment.method)
    if (payment.method !== 'counter') {
      body.append('payment_slip', payment.slip)
      if (payment.qrPayload) body.append('qr_payload', payment.qrPayload)
    }
    run(() => axios.post(`${API_BASE}/leases/${lease.id}/renew`, body, { headers: authHeaders() }), 'ชำระเงินหรือต่อสัญญาไม่สำเร็จ')
  }

  return (
    <MarketModal
      title={stage === 'plan' ? 'ต่อสัญญาเช่า' : 'ชำระเงินเพื่อต่อสัญญา'}
      subtitle={stage === 'plan' ? 'ขยายเวลาต่อจากวันสิ้นสุดเดิม แบบเดียวกับการต่อสัญญาห้องพัก' : 'ใช้ช่องทางชำระเงินเดียวกับของหอพัก · ต่อสัญญาหลังชำระสำเร็จ'}
      icon={stage === 'plan' ? 'clock' : 'coin'}
      size="xl"
      busy={busy}
      error={error}
      onClose={() => onClose()}
      onSubmit={submit}
      submitLabel={stage === 'plan' ? `ไปชำระเงิน ฿${money(amount)} ›` : 'ยืนยันชำระเงินและต่อสัญญา'}
      submitDisabled={stage === 'payment' && !paymentReady}
      footer={stage === 'payment' ? (
        <div className="market-footer-left">
          <button type="button" className="market-btn" disabled={busy} onClick={() => setStage('plan')}>‹ กลับไปเลือกระยะเวลา</button>
        </div>
      ) : null}
    >
      <div className="market-stage-bar" aria-hidden="true">
        <span className={stage === 'plan' ? 'is-active' : 'is-done'}><b>1</b> เลือกระยะเวลา</span>
        <i />
        <span className={stage === 'payment' ? 'is-active' : ''}><b>2</b> ชำระเงิน</span>
        <i />
        <span><b>3</b> ต่อสัญญา</span>
      </div>
      <LeaseMiniSummary lease={lease} />
      {stage === 'plan' ? (
        <>
          <Field label="ต่อสัญญาเพิ่ม">
            <div className="market-segment is-even" role="group" aria-label="ระยะเวลาต่อสัญญา">
              {RENEW_OPTIONS.map((value) => (
                <button key={value} type="button" className={months === value ? 'is-active' : ''} onClick={() => setMonths(value)}>{value} เดือน</button>
              ))}
            </div>
          </Field>
          <div className="market-renew-timeline">
            <span><small>สิ้นสุดเดิม</small><strong>{thaiDate(lease.end_date)}</strong></span>
            <span className="market-lease-span">
              <i aria-hidden="true" />
              <b>+{months} เดือน</b>
              <i className="is-arrow" aria-hidden="true" />
            </span>
            <span className="is-end"><small>สิ้นสุดใหม่</small><strong>{thaiDate(newEnd)}</strong></span>
          </div>
          <Field label="รูปแบบการชำระเงิน">
            <div className="market-payment-methods is-two" role="radiogroup" aria-label="รูปแบบการชำระเงิน">
              {RENEW_PLAN_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={plan === option.key}
                  className={`market-payment-method${plan === option.key ? ' is-selected' : ''}`}
                  onClick={() => setPlan(option.key)}
                >
                  <span className="market-info-icon"><Icon name={option.key === 'monthly' ? 'calendar' : 'wallet'} size={17} /></span>
                  <span>
                    <strong>{option.label} · ฿{money(lease.monthly_rent * (option.key === 'lump_sum' ? months : 1))}</strong>
                    <small>{option.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </Field>
          <p className="market-renew-note">ค่าเช่า ฿{money(lease.monthly_rent)}/เดือน ชำระทุกวันที่ {lease.payment_due_day} · ต่อสัญญาจะเกิดขึ้นหลังชำระเงินสำเร็จเท่านั้น</p>
        </>
      ) : (
        <LeasePaymentStep
          amount={amount}
          label="ยอดที่ต้องชำระเพื่อต่อสัญญา"
          detail={plan === 'lump_sum'
            ? `ค่าเช่าล่วงหน้า ${months} เดือน × ฿${money(lease.monthly_rent)} · สิ้นสุดใหม่ ${thaiDate(newEnd)}`
            : `ค่าเช่าเดือนแรกของช่วงต่อสัญญา ${months} เดือน · สิ้นสุดใหม่ ${thaiDate(newEnd)}`}
          payment={payment}
          setPayment={setPayment}
        />
      )}
    </MarketModal>
  )
}

function TerminateModal({ lease, activeKeys, onClose }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const { busy, error, run } = useSubmit((data) => onClose(data.message))
  const effects = [
    { icon: 'shop', tone: 'green', title: 'ร้านกลับเป็นว่าง', text: `${lease.shop_name} พร้อมทำสัญญาใหม่ได้ทันที` },
    { icon: 'key', tone: 'orange', title: `ปิด API key ${activeKeys} อัน`, text: 'ระบบของผู้เช่าจะเรียกข้อมูลร้านไม่ได้อีก' },
    { icon: 'wallet', tone: 'purple', title: `เงินมัดจำ ฿${money(lease.deposit)}`, text: 'ตรวจสอบและคืนตามเงื่อนไขสัญญา' },
  ]
  return (
    <MarketModal
      title="ยกเลิกสัญญาเช่า"
      subtitle="การยกเลิกย้อนกลับไม่ได้ กรุณาตรวจสอบก่อนยืนยัน"
      icon="contract"
      tone="danger"
      size="lg"
      busy={busy}
      error={error}
      onClose={() => onClose()}
      onSubmit={() => run(() => axios.post(`${API_BASE}/leases/${lease.id}/terminate`, { reason: reason.trim() }, { headers: authHeaders() }), 'ยกเลิกสัญญาไม่สำเร็จ')}
      submitLabel="ยืนยันยกเลิกสัญญา"
      submitDisabled={!reason.trim() || !confirmed}
    >
      <LeaseMiniSummary lease={lease} tone="red" />
      <div className="market-effects">
        <p>สิ่งที่จะเกิดขึ้น</p>
        <ul>
          {effects.map((effect) => (
            <li key={effect.title} className={`is-${effect.tone}`}>
              <span className="market-info-icon"><Icon name={effect.icon} size={16} /></span>
              <span><strong>{effect.title}</strong><small>{effect.text}</small></span>
            </li>
          ))}
        </ul>
      </div>
      <Field label="เหตุผลการยกเลิก *">
        <div className="market-chips">
          {TERMINATE_REASONS.map((item) => (
            <button key={item} type="button" className={`market-chip${reason === item ? ' is-active' : ''}`} onClick={() => setReason(item)}>{item}</button>
          ))}
        </div>
        <textarea className="market-input" rows={3} maxLength={500} value={reason} placeholder="เลือกเหตุผลด้านบน หรือพิมพ์รายละเอียดเพิ่มเติม" onChange={(event) => setReason(event.target.value)} />
      </Field>
      <label className="market-confirm-check">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>ฉันตรวจสอบแล้วและต้องการยกเลิกสัญญา <b>{lease.contract_no}</b></span>
      </label>
    </MarketModal>
  )
}

function LeasePaymentStep({ amount, label = 'ยอดที่ต้องชำระก่อนทำสัญญา', detail, payment, setPayment }) {
  const [channels, setChannels] = useState(null)
  const [channelError, setChannelError] = useState('')
  const [reading, setReading] = useState(false)
  const slipPreview = useMemo(() => (payment.slip ? URL.createObjectURL(payment.slip) : ''), [payment.slip])
  useEffect(() => () => {
    if (slipPreview) URL.revokeObjectURL(slipPreview)
  }, [slipPreview])

  useEffect(() => {
    axios.get('/api/payment/channels', { headers: authHeaders() })
      .then(({ data }) => setChannels(data.channels))
      .catch((error) => setChannelError(errorMessage(error, 'โหลดช่องทางชำระเงินไม่สำเร็จ')))
  }, [])

  const chooseSlip = async (file) => {
    if (!file) return
    setReading(true)
    setPayment((current) => ({ ...current, slip: file, qrPayload: '' }))
    const qrPayload = await readSlipQrPayload(file).catch(() => '')
    setPayment((current) => (current.slip === file ? { ...current, qrPayload: qrPayload || '' } : current))
    setReading(false)
  }

  const methods = [
    { key: 'promptpay', icon: 'coin', label: 'PromptPay', hint: 'สแกน QR แล้วแนบสลิป' },
    { key: 'bank', icon: 'wallet', label: 'โอนเข้าบัญชี', hint: 'โอนแล้วแนบสลิป' },
    { key: 'counter', icon: 'user', label: 'เงินสด', hint: 'รับเงินที่เคาน์เตอร์' },
  ]

  return (
    <div className="market-payment">
      <div className="market-payment-amount">
        <span>{label}</span>
        <strong>฿{money(amount)}</strong>
        {detail && <small>{detail}</small>}
      </div>

      {channels?.test_mode && <p className="market-payment-test">ระบบชำระเงินอยู่ในโหมดทดลอง สลิปจะไม่ถูกตรวจกับธนาคาร</p>}
      {channelError && <p className="market-error">{channelError}</p>}

      <div className="market-payment-methods" role="radiogroup" aria-label="วิธีชำระเงิน">
        {methods.map((method) => (
          <button
            key={method.key}
            type="button"
            role="radio"
            aria-checked={payment.method === method.key}
            className={`market-payment-method${payment.method === method.key ? ' is-selected' : ''}`}
            onClick={() => setPayment((current) => ({ ...current, method: method.key }))}
          >
            <span className="market-info-icon"><Icon name={method.icon} size={17} /></span>
            <span><strong>{method.label}</strong><small>{method.hint}</small></span>
          </button>
        ))}
      </div>

      {payment.method === 'promptpay' && channels && (
        <div className="market-payment-channel">
          <PromptPayQr promptPayId={channels.promptpay_id} amount={amount} size={180} />
          <div>
            <small>พร้อมเพย์</small>
            <strong>{formatPromptPayId(channels.promptpay_id) || '-'}</strong>
            <small>{channels.dorm_name || 'หอพัก'}</small>
            <small>ยอด ฿{money(amount)} ฝังอยู่ใน QR แล้ว</small>
          </div>
        </div>
      )}
      {payment.method === 'bank' && channels && (
        <div className="market-payment-channel is-bank">
          <span className="market-info-icon"><Icon name="wallet" size={20} /></span>
          <div>
            <small>{channels.bank_name || 'ธนาคาร'}</small>
            <strong>{channels.bank_account_no || '-'}</strong>
            <small>{channels.dorm_name || 'หอพัก'} · ยอด ฿{money(amount)}</small>
          </div>
        </div>
      )}

      {payment.method !== 'counter' ? (
        <div className="market-slip-drop">
          {slipPreview ? (
            <div className="market-slip-preview">
              <img src={slipPreview} alt="สลิปที่แนบ" />
              <div>
                <strong>{payment.slip.name}</strong>
                <small>{reading ? 'กำลังอ่าน QR บนสลิป...' : payment.qrPayload ? 'อ่าน QR บนสลิปได้แล้ว' : 'อ่าน QR ไม่ได้ ระบบจะส่งรูปสลิปไปตรวจแทน'}</small>
                <label className="market-btn is-small">
                  เปลี่ยนสลิป
                  <input type="file" accept="image/jpeg,image/png" hidden onChange={(event) => chooseSlip(event.target.files?.[0])} />
                </label>
              </div>
            </div>
          ) : (
            <label className="market-slip-empty">
              <Icon name="image" size={22} />
              <strong>แนบสลิปการโอนเงิน</strong>
              <small>JPG หรือ PNG ที่เห็น QR code ชัดเจน · {channels?.verify_mode === 'manual' ? 'เจ้าหน้าที่ตรวจสลิปเอง' : 'ระบบตรวจสลิปกับธนาคารอัตโนมัติ'}</small>
              <input type="file" accept="image/jpeg,image/png" hidden onChange={(event) => chooseSlip(event.target.files?.[0])} />
            </label>
          )}
        </div>
      ) : (
        <label className="market-confirm-check">
          <input type="checkbox" checked={payment.cashConfirmed} onChange={(event) => setPayment((current) => ({ ...current, cashConfirmed: event.target.checked }))} />
          <span>ฉันได้รับเงินสด <b>฿{money(amount)}</b> จากผู้เช่าครบแล้ว</span>
        </label>
      )}
    </div>
  )
}

function KeyToken({ apiKey, canReveal }) {
  const [full, setFull] = useState('')
  const [shown, setShown] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const masked = `${apiKey.key_prefix}_••••••••`
  const available = canReveal && apiKey.can_reveal

  const loadFull = async () => {
    if (full) return full
    setLoading(true)
    try {
      const { data } = await axios.get(`${API_BASE}/api-keys/${apiKey.id}/reveal`, { headers: authHeaders() })
      setFull(data.api_key)
      return data.api_key
    } catch (error) {
      setStatus(errorMessage(error, 'เปิดดู key ไม่สำเร็จ'))
      return ''
    } finally {
      setLoading(false)
    }
  }

  const toggle = async () => {
    setStatus('')
    if (shown) {
      setShown(false)
      return
    }
    if (await loadFull()) setShown(true)
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
      setStatus('เบราว์เซอร์ไม่อนุญาตให้คัดลอก เลือก key ด้านล่างแล้วคัดลอกเองได้')
    }
  }

  if (!available) {
    return (
      <div className="market-key-token">
        <code className="market-key-code">{masked}</code>
        {canReveal && !apiKey.can_reveal && <small className="market-key-token-note">ออกก่อนเปิดระบบดูย้อนหลัง</small>}
      </div>
    )
  }

  return (
    <div className="market-key-token">
      <button
        type="button"
        className={`market-key-code is-button${shown ? ' is-shown' : ''}`}
        title={shown ? 'กดเพื่อซ่อน key' : 'กดเพื่อดู key แบบเต็ม'}
        aria-pressed={shown}
        disabled={loading}
        onClick={toggle}
      >
        <span>{loading ? 'กำลังโหลด...' : shown ? full : masked}</span>
        <Icon name={shown ? 'eyeOff' : 'eye'} size={13} />
      </button>
      <button type="button" className="market-key-copy" title="คัดลอก key แบบเต็ม" disabled={loading} onClick={copy}>
        <Icon name="copy" size={13} /> คัดลอก
      </button>
      {status && <small role="status" className={`market-key-token-note${status === 'คัดลอกแล้ว' ? ' is-ok' : ' is-error'}`}>{status}</small>}
      {status.startsWith('เบราว์เซอร์ไม่อนุญาต') && <input className="market-input" aria-label="API key สำหรับคัดลอกด้วยตนเอง" readOnly value={full} onFocus={(event) => event.target.select()} />}
    </div>
  )
}

function ApiKeyPanel({ lease, apiKeys, canOperate, onChanged }) {
  const [label, setLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(null)
  const { busy, error, run } = useSubmit((data) => {
    setNewKey(data.api_key)
    setLabel('')
    onChanged(data.api_keys)
  })
  const usable = lease.status === 'active' || lease.status === 'upcoming'
  const copy = async () => {
    try {
      await copyText(newKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="market-section">
      <div className="market-section-head">
        <h4><Icon name="key" size={16} /> API key ของผู้เช่า</h4>
        <small>ผู้เช่าใช้ดูข้อมูลร้านและสัญญา (อ่านอย่างเดียว) และแก้ไขสินค้าในร้านตัวเองได้</small>
      </div>
      {newKey && (
        <div className="market-new-key" role="status">
          <p>คัดลอก API key นี้ให้ผู้เช่าตอนนี้ ระบบจะไม่แสดงซ้ำอีก</p>
          <div>
            <code>{newKey}</code>
            <button type="button" className="market-btn is-small" onClick={copy}><Icon name="copy" size={14} /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>
          </div>
        </div>
      )}
      {canOperate && usable && (
        <form className="market-key-form" onSubmit={(event) => {
          event.preventDefault()
          if (label.trim()) run(() => axios.post(`${API_BASE}/leases/${lease.id}/api-keys`, { label: label.trim() }, { headers: authHeaders() }), 'สร้าง API key ไม่สำเร็จ')
        }}>
          <input className="market-input" placeholder="ชื่อเรียก เช่น ระบบ POS หน้าร้าน" value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} />
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
                <span className={`market-pill ${key.revoked_at ? 'is-danger' : key.last_used_at ? 'is-success' : 'is-info'}`}>
                  {key.revoked_at ? 'ยกเลิกแล้ว' : key.last_used_at ? 'ใช้งานอยู่' : 'ยังไม่เคยใช้'}
                </span>
              </div>
              <KeyToken apiKey={key} canReveal={canOperate && !key.revoked_at} />
              <div className="market-key-meta">
                <span><Icon name="user" size={12} /> {key.created_by_name}</span>
                <span><Icon name="calendar" size={12} /> ออก {thaiDateTime(key.created_at)}</span>
                <span><Icon name="clock" size={12} /> {key.revoked_at ? `ยกเลิก ${thaiDateTime(key.revoked_at)}` : key.last_used_at ? `ใช้ล่าสุด ${thaiDateTime(key.last_used_at)}` : 'ยังไม่มีการเรียกใช้'}</span>
              </div>
            </div>
            {canOperate && !key.revoked_at && (
              <button type="button" className="market-row-btn is-danger" onClick={() => setRevoking(key)}><Icon name="trash" size={13} /> ยกเลิก key</button>
            )}
          </li>
        ))}
      </ul>
      {revoking && (
        <ConfirmModal
          title="ยกเลิก API key"
          message={`ยกเลิก "${revoking.label}" แล้ว ระบบของผู้เช่าที่ใช้ key นี้จะเรียก API ไม่ได้ทันที`}
          submitLabel="ยกเลิก API key"
          icon="key"
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            const response = await axios.post(`${API_BASE}/api-keys/${revoking.id}/revoke`, {}, { headers: authHeaders() })
            onChanged(response.data.api_keys)
            return response
          }}
        />
      )}
    </section>
  )
}

function useMarketImageUrls(images) {
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let active = true
    const created = []
    Promise.all(images.map((image) => (image.local ? Promise.resolve([image.id, image.url]) : axios.get(image.url, { responseType: 'blob', headers: authHeaders() })
      .then(({ data }) => {
        const url = URL.createObjectURL(data)
        created.push(url)
        return [image.id, url]
      })
      .catch(() => [image.id, null]))))
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

function LeaseGallery({ lease, images, canUpload, onUploaded }) {
  const urls = useMarketImageUrls(images)
  const [openIndex, setOpenIndex] = useState(null)
  const inputRef = useRef(null)
  const { busy, error, run } = useSubmit((data) => onUploaded(data.images))
  const photos = images.map((image) => ({ url: urls[image.id], name: image.name })).filter((photo) => photo.url)
  const upload = (files) => {
    if (!files.length) return
    const body = new FormData()
    for (const file of files) body.append('contract_images', file)
    run(() => axios.post(`${API_BASE}/leases/${lease.id}/images`, body, { headers: authHeaders() }), 'แนบรูปสัญญาไม่สำเร็จ')
  }
  return (
    <section className="market-section market-lease-gallery-section">
      <div className="market-section-head">
        <h4><span className="market-section-icon"><Icon name="image" size={15} /></span> รูปสัญญา <span className="market-count">{images.length}</span></h4>
        {canUpload && (
          <>
            <button type="button" className="market-link-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Icon name="plus" size={14} /> {busy ? 'กำลังอัปโหลด...' : 'แนบรูปเพิ่ม'}
            </button>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => {
              upload([...event.target.files])
              event.target.value = ''
            }} />
          </>
        )}
      </div>
      {error && <p className="market-error">{error}</p>}
      {images.length === 0 ? (
        <div className="market-gallery-empty">
          <Icon name="image" size={22} />
          <strong>ยังไม่มีรูปสัญญา</strong>
          <span>สัญญาที่สร้างก่อนเปิดระบบแนบรูปจะไม่มีรูปในระบบ</span>
        </div>
      ) : (
        <ul className="market-gallery">
          {images.map((image, index) => (
            <li key={image.id}>
              <button type="button" aria-label={`ดูรูปสัญญา ${index + 1}`} disabled={!urls[image.id]} onClick={() => setOpenIndex(photos.findIndex((photo) => photo.url === urls[image.id]))}>
                {urls[image.id] ? <img src={urls[image.id]} alt="" /> : <span className="market-gallery-loading" />}
                <span className="market-gallery-index">{index + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openIndex !== null && openIndex >= 0 && createPortal(
        <div className="market-lightbox-layer" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <PhotoLightbox photos={photos} initialIndex={openIndex} title={`สัญญา ${lease.contract_no}`} subtitle={lease.shop_name} label="รูปสัญญาเช่า" onClose={() => setOpenIndex(null)} />
        </div>,
        document.body,
      )}
    </section>
  )
}

const VERIFY_LABELS = {
  auto: { text: 'ตรวจสลิปกับธนาคารแล้ว', tone: 'success' },
  manual: { text: 'เจ้าหน้าที่ตรวจสลิป', tone: 'info' },
  test: { text: 'โหมดทดลอง', tone: 'warning' },
  counter: { text: 'รับเงินสด', tone: 'muted' },
}

function LeasePaymentSection({ payments }) {
  const slips = useMemo(() => payments.filter((payment) => payment.slip_url).map((payment) => ({ id: payment.id, url: payment.slip_url })), [payments])
  const urls = useMarketImageUrls(slips)
  const [openUrl, setOpenUrl] = useState(null)
  return (
    <section className="market-section">
      <div className="market-section-head">
        <h4><span className="market-section-icon"><Icon name="coin" size={15} /></span> การชำระเงิน</h4>
      </div>
      {payments.length === 0 ? (
        <p className="market-empty-line">สัญญานี้สร้างก่อนเปิดระบบชำระเงิน จึงไม่มีรายการชำระในระบบ</p>
      ) : (
        <ul className="market-payment-list">
          {payments.map((payment) => {
            const verify = VERIFY_LABELS[payment.verify_mode] || VERIFY_LABELS.counter
            return (
              <li key={payment.id}>
                {payment.slip_url && urls[payment.id] ? (
                  <button type="button" className="market-payment-slip" onClick={() => setOpenUrl(urls[payment.id])} aria-label="ดูสลิป">
                    <img src={urls[payment.id]} alt="" />
                  </button>
                ) : <span className="market-info-icon"><Icon name={payment.method === 'counter' ? 'wallet' : 'coin'} size={18} /></span>}
                <div className="market-payment-list-main">
                  <strong>฿{money(payment.amount)} <small>· {payment.payment_type === 'initial' ? 'ชำระแรกเข้า' : `ต่อสัญญา ${payment.renew_months} เดือน`}</small></strong>
                  <small>{payment.payment_type === 'initial' ? `ค่าเช่า ฿${money(payment.rent_amount)} + มัดจำ ฿${money(payment.deposit_amount)}` : payment.renew_plan_label} · {payment.method_label}</small>
                  <small>รับโดย {payment.received_by_name} · {thaiDateTime(payment.paid_at)}{payment.trans_ref && payment.verify_mode === 'auto' ? ` · Ref ${payment.trans_ref}` : ''}</small>
                </div>
                <span className={`market-pill is-${verify.tone}`}>{verify.text}</span>
              </li>
            )
          })}
        </ul>
      )}
      {openUrl && createPortal(
        <div className="market-lightbox-layer" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <PhotoLightbox photos={[{ url: openUrl }]} initialIndex={0} title="สลิปการชำระเงิน" label="สลิป" onClose={() => setOpenUrl(null)} />
        </div>,
        document.body,
      )}
    </section>
  )
}

function LeaseDetailModal({ leaseId, onClose, onChanged }) {
  const [state, setState] = useState({ loading: true, error: '', lease: null, apiKeys: [], images: [], payments: [], permissions: {} })
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/leases/${leaseId}`, { headers: authHeaders() })
      setState({ loading: false, error: '', lease: data.lease, apiKeys: data.api_keys, images: data.images, payments: data.payments || [], permissions: data.permissions })
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'โหลดสัญญาไม่สำเร็จ') }))
    }
  }, [leaseId])

  useEffect(() => {
    load()
  }, [load])

  const closeDialog = async (message) => {
    setDialog(null)
    if (message) {
      setNotice(message)
      await load()
      onChanged()
    }
  }

  const { lease, permissions } = state
  const canChange = permissions.operate && lease && lease.status !== 'terminated'
  const progress = lease ? leaseProgress(lease) : null
  return (
    <MarketModal
      title={lease ? `สัญญา ${lease.contract_no}` : 'สัญญาเช่าร้านค้า'}
      subtitle={lease ? `${lease.shop_code} · ${lease.shop_name}` : ''}
      icon="contract"
      size="xl"
      error={state.error}
      onClose={onClose}
      footer={canChange ? (
        <div className="market-footer-left">
          {lease.status !== 'expired' && <button type="button" className="market-btn is-danger-ghost" onClick={() => setDialog('terminate')}>ยกเลิกสัญญา</button>}
          <button type="button" className="market-btn is-primary" onClick={() => setDialog('renew')}><Icon name="clock" size={14} /> ต่อสัญญา</button>
        </div>
      ) : null}
    >
      {state.loading && <p className="market-empty-line">กำลังโหลด...</p>}
      {notice && <p className="market-notice" role="status">{notice}</p>}
      {lease && (
        <>
          <section className={`market-contract-hero is-${lease.status}`}>
            <div className="market-contract-hero-top">
              <span className="market-lease-shop">
                <small>ร้าน</small>
                <strong>{lease.shop_code.replace(/^SH-/i, '')}</strong>
              </span>
              <div className="market-lease-who">
                <strong>{lease.tenant_name}</strong>
                <small>{lease.business_name || 'ไม่ระบุชื่อกิจการ'} · {lease.tenant_phone}</small>
              </div>
              <StatusPill status={lease.status} />
            </div>
            <div className="market-lease-period">
              <div className="market-lease-dates">
                <span><small>เริ่มสัญญา</small><strong>{thaiDate(lease.start_date)}</strong></span>
                <span className="market-lease-span">
                  <i aria-hidden="true" />
                  <b>{progress.totalMonths} เดือน</b>
                  <i className="is-arrow" aria-hidden="true" />
                </span>
                <span className="is-end"><small>สิ้นสุด</small><strong>{thaiDate(lease.end_date)}</strong></span>
              </div>
              <div className="market-lease-progress">
                <small>{lease.status === 'active' ? `เดือนที่ ${progress.currentMonth}/${progress.totalMonths}` : `ระยะสัญญา ${progress.totalMonths} เดือน`}</small>
                <span className={`market-pill is-${progress.remaining.tone}`}>{progress.remaining.text}</span>
              </div>
            </div>
            <div className="market-lease-figures is-four">
              <span><small>ค่าเช่า/เดือน</small><strong>฿{money(lease.monthly_rent)}</strong></span>
              <span><small>มัดจำ</small><strong>฿{money(lease.deposit)}</strong></span>
              <span><small>ชำระทุกวันที่</small><strong>{lease.payment_due_day}</strong></span>
              <span className="is-highlight"><small>ยอดแรกเข้า</small><strong>฿{money(lease.monthly_rent + lease.deposit)}</strong></span>
            </div>
          </section>

          <LeasePaymentSection payments={state.payments} />

          {lease.status === 'terminated' && (
            <p className="market-terminated">ยกเลิกเมื่อ {thaiDateTime(lease.terminated_at)} โดย {lease.terminated_by_name} · เหตุผล: {lease.termination_reason}</p>
          )}

          <div className="market-contract-columns">
            <InfoGroup title="ข้อมูลผู้เช่า" icon="user" columns={2} items={[
              { icon: 'user', label: 'ผู้เช่า', value: lease.tenant_name, tone: 'blue' },
              { icon: 'shop', label: 'ชื่อกิจการ', value: lease.business_name || '-', tone: 'purple' },
              { icon: 'phone', label: 'เบอร์โทร', value: lease.tenant_phone, tone: 'green' },
              { icon: 'idcard', label: 'เลขบัตรประชาชน', value: lease.tenant_idcard, tone: 'orange' },
              { icon: 'mail', label: 'อีเมล', value: lease.tenant_email || '-', tone: 'teal' },
              { icon: 'pin', label: 'ตำแหน่งร้าน', value: lease.shop_location, tone: 'rose' },
            ]} />
            <LeaseGallery
              lease={lease}
              images={state.images}
              canUpload={permissions.operate && lease.status !== 'terminated'}
              onUploaded={(images) => setState((current) => ({ ...current, images }))}
            />
          </div>

          <section className="market-section">
            <div className="market-section-head">
              <h4><span className="market-section-icon"><Icon name="contract" size={15} /></span> เงื่อนไขสัญญา</h4>
              <small>ทำสัญญาโดย {lease.created_by_name} · {thaiDateTime(lease.created_at)}</small>
            </div>
            <p className="market-terms">{lease.terms || 'ไม่มีเงื่อนไขเพิ่มเติม'}</p>
          </section>

          <ApiKeyPanel lease={lease} apiKeys={state.apiKeys} canOperate={permissions.operate} onChanged={(apiKeys) => {
            setState((current) => ({ ...current, apiKeys }))
            onChanged()
          }} />
        </>
      )}
      {dialog === 'renew' && <RenewModal lease={lease} onClose={closeDialog} />}
      {dialog === 'terminate' && (
        <TerminateModal lease={lease} activeKeys={state.apiKeys.filter((key) => !key.revoked_at).length} onClose={closeDialog} />
      )}
    </MarketModal>
  )
}

const PRODUCT_PREVIEW_COUNT = 5

const PRODUCT_STATUS_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', match: () => true },
  { key: 'available', label: 'พร้อมขาย', match: (product) => product.is_available },
  { key: 'off', label: 'งดขาย', match: (product) => !product.is_available },
  { key: 'out', label: 'หมดสต็อก', match: (product) => product.stock === 0 },
]

const productCategories = (products) => [...new Set(products.map((product) => product.category))]

function ProductList({ shop, products, canOperate, onEdit, onViewAll }) {
  const categories = useMemo(() => productCategories(products), [products])
  const preview = products.slice(0, PRODUCT_PREVIEW_COUNT)
  return (
    <section className="market-section">
      <div className="market-section-head">
        <h4><span className="market-section-icon"><Icon name="box" size={15} /></span> สินค้าในร้าน <span className="market-count">{products.length}</span></h4>
        <div className="market-section-actions">
          {products.length > 0 && (
            <button type="button" className="market-link-btn" onClick={onViewAll}>ดูทั้งหมด ({products.length}) <span aria-hidden="true">›</span></button>
          )}
          {canOperate && <button type="button" className="market-btn is-primary is-small" onClick={() => onEdit(null, categories)}><Icon name="plus" size={14} /> เพิ่มสินค้า</button>}
        </div>
      </div>
      <ProductTable shop={shop} products={preview} categories={categories} canOperate={false} compact emptyText="ร้านนี้ยังไม่มีสินค้า" />
      {products.length > PRODUCT_PREVIEW_COUNT && (
        <button type="button" className="market-more-row" onClick={onViewAll}>
          และอีก {products.length - PRODUCT_PREVIEW_COUNT} รายการ · ดูสินค้าทั้งหมด
        </button>
      )}
    </section>
  )
}

function AllProductsModal({ shop, products, canOperate, onEdit, onDelete, onClose }) {
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const categories = useMemo(() => productCategories(products), [products])
  const term = search.trim().toLowerCase()
  const statusMatch = PRODUCT_STATUS_FILTERS.find((item) => item.key === status)?.match || (() => true)
  const visible = products.filter((product) => (category === 'all' || product.category === category) && statusMatch(product)
    && (!term || [product.name, product.sku, product.category, product.description].some((value) => value?.toLowerCase().includes(term))))

  return (
    <MarketModal
      title={`สินค้าทั้งหมด · ${shop.name}`}
      subtitle={`${shop.code} · ${products.length} รายการ`}
      icon="box"
      size="xl"
      onClose={onClose}
      footer={canOperate ? (
        <button type="button" className="market-btn is-primary" onClick={() => onEdit(null, categories)}><Icon name="plus" size={14} /> เพิ่มสินค้า</button>
      ) : null}
    >
      <div className="market-all-products">
        <div className="market-product-tools">
          <div className="market-search">
            <Icon name="search" size={16} />
            <input placeholder="ค้นหาชื่อสินค้า, SKU, ประเภท หรือรายละเอียด" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
            {search && <button type="button" className="market-search-clear" aria-label="ล้างคำค้นหา" onClick={() => setSearch('')}>×</button>}
          </div>
          <div className="market-chips" role="group" aria-label="กรองตามสถานะสินค้า">
            {PRODUCT_STATUS_FILTERS.map((item) => (
              <button key={item.key} type="button" className={`market-chip${status === item.key ? ' is-active' : ''}`} onClick={() => setStatus(item.key)}>
                {item.label} <span>{products.filter(item.match).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="market-chips" role="group" aria-label="กรองตามประเภทสินค้า">
          {['all', ...categories].map((key) => (
            <button key={key} type="button" className={`market-chip is-soft${category === key ? ' is-active' : ''}`} onClick={() => setCategory(key)}>
              {key === 'all' ? 'ทุกประเภท' : key}
            </button>
          ))}
        </div>
        <p className="market-result-count">แสดง {visible.length} จาก {products.length} รายการ</p>
        <ProductTable shop={shop} products={visible} categories={categories} canOperate={canOperate} onEdit={onEdit} onDelete={onDelete} emptyText="ไม่พบสินค้าที่ตรงกับการค้นหา" />
      </div>
    </MarketModal>
  )
}

function ProductTable({ shop, products, categories, canOperate, onEdit, onDelete, compact, emptyText }) {
  return (
    <div className={`market-product-table${compact ? ' is-compact' : ''}`} role="table" aria-label={`สินค้าใน ${shop.name}`}>
      <div className="market-product-row is-head" role="row">
        <span role="columnheader">สินค้า</span>
        <span role="columnheader">ประเภท</span>
        <span role="columnheader">ราคา</span>
        <span role="columnheader">คงเหลือ</span>
        <span role="columnheader">สถานะ</span>
        {canOperate && <span role="columnheader" aria-label="จัดการ" />}
      </div>
      <div className="market-product-body">
          {products.length === 0 && <p className="market-empty-line">{emptyText}</p>}
          {products.map((product) => (
            <div key={product.id} className={`market-product-row${product.is_available ? '' : ' is-off'}`} role="row">
              <span role="cell" className="market-product-name">
                <strong>{product.name}</strong>
                <small>{product.sku ? `${product.sku} · ` : ''}แก้ไขล่าสุดโดย {product.updated_by || '-'}</small>
              </span>
              <span role="cell"><span className="market-tag">{product.category}</span></span>
              <span role="cell" className="market-price">฿{money(product.price)}<small>/{product.unit}</small></span>
              <span role="cell" className={product.stock === 0 ? 'market-stock-out' : ''}>{product.stock.toLocaleString('th-TH')} {product.unit}</span>
              <span role="cell"><span className={`market-pill ${product.is_available ? 'is-success' : 'is-muted'}`}>{product.is_available ? 'พร้อมขาย' : 'งดขาย'}</span></span>
              {canOperate && (
                <span role="cell" className="market-row-actions">
                  <button type="button" className="market-row-btn" title={`แก้ไข ${product.name}`} onClick={() => onEdit(product, categories)}><Icon name="edit" size={14} /> แก้ไข</button>
                  <button type="button" className="market-row-btn is-danger" title={`ลบ ${product.name}`} onClick={() => onDelete(product)}><Icon name="trash" size={14} /> ลบ</button>
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

function ShopDetailModal({ shopId, onClose, onChanged, onOpenLease, onCreateLease }) {
  const [state, setState] = useState({ loading: true, error: '', shop: null, products: [], leases: [], permissions: {} })
  const [dialog, setDialog] = useState(null)
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/shops/${shopId}`, { headers: authHeaders() })
      setState({ loading: false, error: '', shop: data.shop, products: data.products, leases: data.leases, permissions: data.permissions })
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'โหลดข้อมูลร้านไม่สำเร็จ') }))
    }
  }, [shopId])

  useEffect(() => {
    load()
  }, [load])

  const done = async (message) => {
    setDialog(null)
    if (!message) return
    setNotice(message)
    await load()
    onChanged()
  }

  const { shop, permissions } = state
  const lease = shop?.current_lease
  return (
    <MarketModal
      title={shop ? shop.name : 'รายละเอียดร้านค้า'}
      subtitle={shop ? `${shop.code} · ${shop.shop_type}` : ''}
      size="xl"
      error={state.error}
      onClose={onClose}
      footer={shop && permissions.manageShops ? (
        <div className="market-footer-left">
          <button type="button" className="market-btn is-danger-ghost" onClick={() => setDialog({ type: 'close-shop' })}>ปิดร้านค้า</button>
          <button type="button" className="market-btn" onClick={() => setDialog({ type: 'edit-shop' })}><Icon name="edit" size={14} /> แก้ไขข้อมูลร้าน</button>
        </div>
      ) : null}
    >
      {state.loading && <p className="market-empty-line">กำลังโหลด...</p>}
      {notice && <p className="market-notice" role="status">{notice}</p>}
      {shop && (
        <>
          <InfoGroup title="ข้อมูลร้านค้า" icon="shop" items={[
            { icon: 'pin', label: 'ตำแหน่ง', value: shop.location, tone: 'rose' },
            { icon: 'ruler', label: 'พื้นที่', value: `${money(shop.area_sqm)} ตร.ม.`, tone: 'teal' },
            { icon: 'coin', label: 'ค่าเช่าตั้งต้น', value: `${money(shop.monthly_rent)} บาท/เดือน`, tone: 'blue' },
            { icon: 'clock', label: 'เวลาเปิด-ปิด', value: hours(shop), tone: 'orange' },
            { icon: 'user', label: 'พนักงานผู้ดูแล', value: shop.caretaker_name || 'ยังไม่กำหนด', tone: 'green' },
            { icon: 'edit', label: 'สร้างโดย', value: shop.created_by_name, tone: 'purple' },
          ]} />
          {shop.description && <p className="market-terms">{shop.description}</p>}

          <section className={`market-tenant-box${lease ? '' : ' is-vacant'}`}>
            <span className="market-tenant-icon"><Icon name={lease ? 'user' : 'shop'} size={20} /></span>
            {lease ? (
              <div>
                <strong>{lease.tenant_name}{lease.business_name ? ` · ${lease.business_name}` : ''}</strong>
                <small>สัญญา {lease.contract_no} · {thaiDate(lease.start_date)} – {thaiDate(lease.end_date)} · {money(lease.monthly_rent)} บาท/เดือน</small>
              </div>
            ) : (
              <div>
                <strong>ร้านนี้ยังว่าง</strong>
                <small>ยังไม่มีสัญญาเช่าที่ใช้งานอยู่</small>
              </div>
            )}
            {lease && <StatusPill status={lease.status} />}
            {lease && <button type="button" className="market-btn is-small" onClick={() => onOpenLease(lease.id)}>ดูสัญญา</button>}
            {!lease && permissions.operate && <button type="button" className="market-btn is-primary is-small" onClick={() => onCreateLease(shop.id)}><Icon name="contract" size={14} /> ทำสัญญาเช่า</button>}
          </section>

          <ProductList
            shop={shop}
            products={state.products}
            canOperate={permissions.operate}
            onEdit={(product, categories) => setDialog({ type: 'product', product, categories })}
            onViewAll={() => setShowAllProducts(true)}
          />
          {showAllProducts && (
            <AllProductsModal
              shop={shop}
              products={state.products}
              canOperate={permissions.operate}
              onEdit={(product, categories) => setDialog({ type: 'product', product, categories })}
              onDelete={(product) => setDialog({ type: 'delete-product', product })}
              onClose={() => setShowAllProducts(false)}
            />
          )}

          <section className="market-section">
            <div className="market-section-head">
              <h4><span className="market-section-icon"><Icon name="contract" size={15} /></span> ประวัติสัญญาของร้าน <span className="market-count">{state.leases.length}</span></h4>
            </div>
            <ul className="market-history">
              {state.leases.length === 0 && <li className="market-empty-line">ยังไม่เคยมีสัญญาเช่า</li>}
              {state.leases.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`market-history-item is-${item.status}`} onClick={() => onOpenLease(item.id)}>
                    <span className="market-history-avatar"><Icon name="user" size={16} /></span>
                    <span className="market-history-main">
                      <strong>{item.tenant_name}</strong>
                      <small><b>{item.contract_no}</b>{item.business_name ? ` · ${item.business_name}` : ''}</small>
                    </span>
                    <span className="market-history-period">
                      <small><Icon name="calendar" size={12} /> ช่วงสัญญา</small>
                      <strong>{thaiDate(item.start_date)} – {thaiDate(item.end_date)}</strong>
                    </span>
                    <span className="market-history-rent">
                      <small>ค่าเช่า/เดือน</small>
                      <strong>฿{money(item.monthly_rent)}</strong>
                    </span>
                    <StatusPill status={item.status} />
                    <span className="market-history-chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {dialog?.type === 'edit-shop' && <ShopFormModal shop={shop} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === 'product' && <ProductFormModal shop={shop} product={dialog.product} categories={dialog.categories} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === 'delete-product' && (
        <ConfirmModal
          title="ลบสินค้า"
          message={`ลบ "${dialog.product.name}" ออกจากร้าน ${shop.name}?`}
          submitLabel="ลบสินค้า"
          onClose={done}
          onConfirm={() => axios.delete(`${API_BASE}/shops/${shop.id}/products/${dialog.product.id}`, { headers: authHeaders() })}
        />
      )}
      {dialog?.type === 'close-shop' && (
        <ConfirmModal
          title="ปิดร้านค้า"
          message={`ปิดร้าน ${shop.name} แล้วร้านจะไม่แสดงในรายการ (ต้องไม่มีสัญญาเช่าที่ยังใช้งานอยู่)`}
          submitLabel="ปิดร้านค้า"
          icon="shop"
          onClose={async (message) => {
            setDialog(null)
            if (message) {
              onChanged(message)
              onClose()
            }
          }}
          onConfirm={() => axios.delete(`${API_BASE}/shops/${shop.id}`, { headers: authHeaders() })}
        />
      )}
    </MarketModal>
  )
}

function isOpenNow(shop) {
  if (!shop.open_time || !shop.close_time) return null
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [openHour, openMinute] = shop.open_time.split(':').map(Number)
  const [closeHour, closeMinute] = shop.close_time.split(':').map(Number)
  const open = openHour * 60 + openMinute
  const close = closeHour * 60 + closeMinute
  return open <= close ? current >= open && current < close : current >= open || current < close
}

const SHOP_STATUS = {
  active: { label: 'มีผู้เช่า', tone: 'info' },
  upcoming: { label: 'รอเริ่มสัญญา', tone: 'warning' },
}

function ShopCard({ shop, onOpen }) {
  const lease = shop.current_lease
  const status = SHOP_STATUS[lease?.status] || { label: 'ว่าง', tone: 'vacant' }
  const extra = shop.categories.length - 2
  const expiring = lease?.status === 'active' && daysUntil(lease.end_date) <= 30
  const openNow = isOpenNow(shop)
  return (
    <button type="button" className={`market-shop-card${lease ? '' : ' is-vacant'}`} onClick={() => onOpen(shop.id)}>
      <div className="market-shop-main">
        <div className="market-shop-title">
          <span className="market-shop-icon"><Icon name="shop" size={21} /></span>
          <div>
            <strong title={shop.name}>{shop.name}</strong>
            <small><b>{shop.code}</b> · {shop.shop_type}</small>
          </div>
          <span className={`market-pill is-${status.tone}`}>{status.label}</span>
        </div>
        <div className="market-shop-meta">
          <span className="market-shop-meta-item" title={shop.location}>
            <span className="market-shop-meta-icon"><Icon name="pin" size={15} /></span>
            <span className="market-shop-meta-text">
              <small>ตำแหน่ง</small>
              <strong>{shop.location}</strong>
            </span>
          </span>
          <span className="market-shop-meta-item is-hours">
            <span className="market-shop-meta-icon"><Icon name="clock" size={15} /></span>
            <span className="market-shop-meta-text">
              {openNow === null
                ? <small>เวลาทำการ</small>
                : <small className={`market-open-dot ${openNow ? 'is-open' : 'is-closed'}`}>{openNow ? 'เปิดอยู่ตอนนี้' : 'ปิดแล้วตอนนี้'}</small>}
              <strong>{hours(shop)}</strong>
            </span>
          </span>
        </div>
        <div className={`market-shop-tenant${lease ? '' : ' is-empty'}`}>
          <span className="market-shop-avatar"><Icon name={lease ? 'user' : 'plus'} size={16} /></span>
          {lease ? (
            <span className="market-shop-tenant-text">
              <strong>{lease.tenant_name}</strong>
              <small>{lease.business_name || lease.contract_no} · ถึง {thaiDate(lease.end_date)}</small>
            </span>
          ) : (
            <span className="market-shop-tenant-text">
              <strong>ยังไม่มีผู้เช่า</strong>
              <small>พร้อมทำสัญญาเช่า</small>
            </span>
          )}
          {expiring && <span className="market-shop-flag">ใกล้หมดสัญญา</span>}
        </div>
        <div className="market-shop-tags">
          {shop.categories.slice(0, 2).map((category) => <span key={category} className="market-tag">{category}</span>)}
          {extra > 0 && <span className="market-tag is-more">+{extra}</span>}
          {shop.categories.length === 0 && <span className="market-tag is-more">ยังไม่มีสินค้า</span>}
        </div>
      </div>
      <div className="market-shop-foot">
        <span><small>ค่าเช่า/เดือน</small><b>฿{money(lease ? lease.monthly_rent : shop.monthly_rent)}</b></span>
        <span><small>สินค้าพร้อมขาย</small><b>{shop.available_count}<i> / {shop.product_count}</i></b></span>
        <span><small>ผู้ดูแล</small><b title={shop.caretaker_name || ''}>{shop.caretaker_name || 'ยังไม่กำหนด'}</b></span>
      </div>
    </button>
  )
}

function ShopsSection({ data, onOpenShop, onCreateShop }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const matcher = SHOP_FILTERS.find((item) => item.key === filter)?.match || (() => true)
  const term = search.trim().toLowerCase()
  const shops = data.shops.filter((shop) => matcher(shop) && (!term || [shop.code, shop.name, shop.shop_type, shop.location, shop.current_lease?.tenant_name, shop.current_lease?.business_name, ...shop.categories]
    .some((value) => value?.toLowerCase().includes(term))))

  return (
    <>
      <div className="market-toolbar">
        <div className="market-search">
          <Icon name="search" size={16} />
          <input placeholder="ค้นหาร้าน ผู้เช่า หรือประเภทสินค้า" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="market-chips" role="group" aria-label="กรองสถานะร้าน">
          {SHOP_FILTERS.map((item) => (
            <button key={item.key} type="button" className={`market-chip${filter === item.key ? ' is-active' : ''}`} onClick={() => setFilter(item.key)}>
              {item.label} <span>{data.shops.filter(item.match).length}</span>
            </button>
          ))}
        </div>
        {data.permissions.manageShops && (
          <button type="button" className="market-btn is-primary market-toolbar-action" onClick={onCreateShop}><Icon name="plus" size={15} /> สร้างร้านค้า</button>
        )}
      </div>
      <div className="market-scroll">
        {shops.length === 0 ? <p className="market-empty">ไม่พบร้านค้า</p> : (
          <div className="market-shop-grid">
            {shops.map((shop) => <ShopCard key={shop.id} shop={shop} onOpen={onOpenShop} />)}
          </div>
        )}
      </div>
    </>
  )
}

const DAY_MS = 86400000
const AVG_MONTH_DAYS = 30.44

function leaseProgress(lease) {
  const start = new Date(`${lease.start_date}T00:00:00`)
  const end = new Date(`${lease.end_date}T00:00:00`)
  const today = new Date(`${todayKey()}T00:00:00`)
  const totalMonths = Math.max(1, Math.round((end - start + DAY_MS) / DAY_MS / AVG_MONTH_DAYS))
  const currentMonth = Math.min(totalMonths, Math.max(1, Math.floor((today - start) / DAY_MS / AVG_MONTH_DAYS) + 1))
  const remaining = {
    active: { text: `เหลือ ${daysUntil(lease.end_date).toLocaleString('th-TH')} วัน`, tone: daysUntil(lease.end_date) <= 30 ? 'warning' : 'info' },
    upcoming: { text: `เริ่มในอีก ${daysUntil(lease.start_date).toLocaleString('th-TH')} วัน`, tone: 'info' },
    expired: { text: 'ครบสัญญาแล้ว', tone: 'muted' },
    terminated: { text: 'ยกเลิกก่อนกำหนด', tone: 'danger' },
  }[lease.status]
  return { totalMonths, currentMonth, remaining }
}

const LEASE_CARD_PHOTOS = 4

function LeaseCardPhotos({ lease, onOpenLease }) {
  const shown = useMemo(() => lease.images.slice(0, LEASE_CARD_PHOTOS), [lease.images])
  const urls = useMarketImageUrls(shown)
  const [openIndex, setOpenIndex] = useState(null)
  const extra = lease.images.length - LEASE_CARD_PHOTOS
  const photos = shown.map((image) => ({ url: urls[image.id] })).filter((photo) => photo.url)
  return (
    <div className="market-lease-photos">
      <p className="market-lease-photos-title">รูปสัญญา <b>{lease.images.length}</b></p>
      {lease.images.length === 0 ? (
        <div className="market-lease-photos-empty"><Icon name="image" size={16} /> ยังไม่มีรูปสัญญา</div>
      ) : (
        <ul className="market-lease-photos-grid">
          {shown.map((image, index) => {
            const more = index === LEASE_CARD_PHOTOS - 1 && extra > 0
            return (
              <li key={image.id}>
                <button
                  type="button"
                  aria-label={more ? `ดูรูปสัญญาทั้งหมด ${lease.images.length} รูป` : `ดูรูปสัญญา ${index + 1}`}
                  disabled={!urls[image.id]}
                  onClick={() => (more ? onOpenLease() : setOpenIndex(photos.findIndex((photo) => photo.url === urls[image.id])))}
                >
                  {urls[image.id] ? <img src={urls[image.id]} alt="" /> : <span className="market-gallery-loading" />}
                  {more && <span className="market-lease-photos-more">+{extra + 1}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {openIndex !== null && openIndex >= 0 && createPortal(
        <div className="market-lightbox-layer" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <PhotoLightbox photos={photos} initialIndex={openIndex} title={`สัญญา ${lease.contract_no}`} subtitle={lease.shop_name} label="รูปสัญญาเช่า" onClose={() => setOpenIndex(null)} />
        </div>,
        document.body,
      )}
    </div>
  )
}

function LeaseCard({ lease, onOpen, onRenew }) {
  const progress = leaseProgress(lease)
  const monthText = lease.status === 'active' ? `เดือนที่ ${progress.currentMonth}/${progress.totalMonths}`
    : lease.status === 'upcoming' ? `ทั้งหมด ${progress.totalMonths} เดือน` : `ระยะสัญญา ${progress.totalMonths} เดือน`
  return (
    <article className={`market-lease-card is-${lease.status}`}>
      <div className="market-lease-head">
        <span className="market-lease-shop">
          <small>ร้าน</small>
          <strong>{lease.shop_code.replace(/^SH-/i, '')}</strong>
        </span>
        <div className="market-lease-who">
          <strong title={lease.tenant_name}>{lease.tenant_name}</strong>
          <small>{lease.tenant_phone}</small>
        </div>
        <StatusPill status={lease.status} />
      </div>
      <p className="market-lease-sub">
        <span title={lease.shop_name}><Icon name="shop" size={14} /> {lease.shop_name}</span>
        <b>{lease.contract_no}</b>
      </p>
      <div className="market-lease-period">
        <div className="market-lease-dates">
          <span><small>เริ่มสัญญา</small><strong>{thaiDate(lease.start_date)}</strong></span>
          <span className="market-lease-span">
            <i aria-hidden="true" />
            <b>{progress.totalMonths} เดือน</b>
            <i className="is-arrow" aria-hidden="true" />
          </span>
          <span className="is-end"><small>สิ้นสุด</small><strong>{thaiDate(lease.end_date)}</strong></span>
        </div>
        <div className="market-lease-progress">
          <small>{monthText}</small>
          <span className={`market-pill is-${progress.remaining.tone}`}>{progress.remaining.text}</span>
        </div>
      </div>
      <div className="market-lease-figures">
        <span><small>ค่าเช่า/เดือน</small><strong>฿{money(lease.monthly_rent)}</strong></span>
        <span><small>มัดจำ</small><strong>฿{money(lease.deposit)}</strong></span>
        <span className="is-highlight"><small>API key</small><strong>{lease.active_keys} อัน</strong></span>
      </div>
      <LeaseCardPhotos lease={lease} onOpenLease={() => onOpen(lease.id)} />
      <footer className="market-lease-foot">
        <small>ทำสัญญา {thaiDateTime(lease.created_at)}<br />โดย {lease.created_by_name}</small>
        <span className="market-lease-foot-actions">
          {onRenew && lease.status !== 'terminated' && (
            <button type="button" className="market-btn is-small is-renew" onClick={() => onRenew(lease)}><Icon name="clock" size={13} /> ต่อสัญญา</button>
          )}
          <button type="button" className="market-btn is-small" onClick={() => onOpen(lease.id)}>ดูสัญญา <span aria-hidden="true">›</span></button>
        </span>
      </footer>
    </article>
  )
}

function LeasesSection({ refreshKey, canOperate, onOpenLease, onCreateLease, onRenewLease }) {
  const [state, setState] = useState({ loading: true, error: '', leases: [] })
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    axios.get(`${API_BASE}/leases`, { headers: authHeaders() })
      .then(({ data }) => active && setState({ loading: false, error: '', leases: data.leases }))
      .catch((error) => active && setState({ loading: false, error: errorMessage(error, 'โหลดสัญญาไม่สำเร็จ'), leases: [] }))
    return () => {
      active = false
    }
  }, [refreshKey])

  const term = search.trim().toLowerCase()
  const leases = state.leases.filter((lease) => (filter === 'all' || lease.status === filter)
    && (!term || [lease.contract_no, lease.shop_code, lease.shop_name, lease.tenant_name, lease.business_name, lease.tenant_phone].some((value) => value?.toLowerCase().includes(term))))

  return (
    <>
      <div className="market-toolbar">
        <div className="market-search">
          <Icon name="search" size={16} />
          <input placeholder="ค้นหาเลขสัญญา ร้าน หรือผู้เช่า" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="market-chips" role="group" aria-label="กรองสถานะสัญญา">
          {LEASE_FILTERS.map((item) => (
            <button key={item.key} type="button" className={`market-chip${filter === item.key ? ' is-active' : ''}`} onClick={() => setFilter(item.key)}>
              {item.label} <span>{item.key === 'all' ? state.leases.length : state.leases.filter((lease) => lease.status === item.key).length}</span>
            </button>
          ))}
        </div>
        {canOperate && (
          <button type="button" className="market-btn is-primary market-toolbar-action" onClick={() => onCreateLease(null)}><Icon name="contract" size={15} /> ทำสัญญาเช่า</button>
        )}
      </div>
      {state.error && <p className="market-error">{state.error}</p>}
      <div className="market-scroll">
        {state.loading ? <p className="market-empty">กำลังโหลด...</p> : leases.length === 0 ? <p className="market-empty">ไม่พบสัญญาเช่า</p> : (
          <div className="market-lease-list">
            {leases.map((lease) => <LeaseCard key={lease.id} lease={lease} onOpen={onOpenLease} onRenew={canOperate ? onRenewLease : undefined} />)}
          </div>
        )}
      </div>
    </>
  )
}

function GuidePrintDocument({ base, nodeRef }) {
  return createPortal(
    <div className="market-guide-print" ref={nodeRef} aria-hidden="true">
      <header>
        <span className="market-guide-print-icon"><Icon name="code" size={26} /></span>
        <div>
          <h1>{GUIDE_TITLE}</h1>
          <p>{GUIDE_VERSION} · ปรับปรุงล่าสุด {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </header>
      <h2>1. ภาพรวมและสิทธิ์การเข้าถึง</h2>
      <ul>{GUIDE_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      <h2>2. การเชื่อมต่อ</h2>
      <dl className="market-guide-print-conn">
        <div><dt>Base URL</dt><dd><code>{base}</code></dd></div>
        <div><dt>Header</dt><dd><code>X-Market-Api-Key: &lt;API_KEY&gt;</code></dd></div>
      </dl>
      <p>แทน &lt;API_KEY&gt; ด้วย key ที่ได้รับจากเจ้าหน้าที่หอพัก (แสดงครั้งเดียวตอนออก key) ห้ามส่ง header Authorization มาด้วย ส่งข้อมูลเป็น JSON และใส่ Content-Type: application/json เมื่อมี body</p>
      <h2>3. Endpoints</h2>
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>สิทธิ์</th><th>รายละเอียด</th></tr></thead>
        <tbody>
          {GUIDE_ENDPOINTS.map((item) => (
            <tr key={item.method + item.path}>
              <td><span className={`market-method is-${item.method.toLowerCase()}`}>{item.method}</span></td>
              <td><code>{item.path}</code></td>
              <td>{item.access}</td>
              <td>{item.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>4. ฟิลด์ของสินค้า</h2>
      <table>
        <thead><tr><th>ฟิลด์</th><th>ชนิดข้อมูล</th><th>หมายเหตุ</th></tr></thead>
        <tbody>{GUIDE_FIELDS.map((item) => <tr key={item.name}><td><code>{item.name}</code></td><td>{item.type}</td><td>{item.note}</td></tr>)}</tbody>
      </table>
      <h2>5. ตัวอย่างการเรียกใช้งาน</h2>
      {guideExamples(base).map((example) => (
        <div key={example.title} className="market-guide-print-example">
          <h3>{example.title}</h3>
          <pre><code>{example.code}</code></pre>
        </div>
      ))}
      <h2>6. รหัสข้อผิดพลาด</h2>
      <p>เมื่อเกิดข้อผิดพลาด API จะตอบกลับเป็น JSON รูปแบบ {'{ "code": "...", "message": "..." }'}</p>
      <table>
        <thead><tr><th>รหัส</th><th>ความหมาย</th></tr></thead>
        <tbody>{GUIDE_ERRORS.map(([code, meaning]) => <tr key={code}><td><code>{code}</code></td><td>{meaning}</td></tr>)}</tbody>
      </table>
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
        if (printRef.current) await downloadGuidePdf(printRef.current)
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
      await downloadGuideDocx(base)
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

function ApiGuideSection() {
  const base = `${API_ORIGIN}${MARKET_TENANT_API_PREFIX}`
  const example = `curl -X PATCH "${base}/products/12" \\
  -H "X-Market-Api-Key: shk_xxxxxxxxxx_xxxxxxxx..." \\
  -H "Content-Type: application/json" \\
  -d '{"price": 25, "stock": 40, "is_available": true}'`
  return (
    <div className="market-scroll market-api-guide">
      <section className="market-section market-api-connect">
        <div className="market-endpoints-head">
          <div><h4><Icon name="key" size={18} /> เชื่อมต่อ API สำหรับผู้เช่า</h4><p>ใช้ API key จากเจ้าหน้าที่เพื่อเชื่อมต่อระบบกับร้านค้าของคุณ</p></div>
          <div className="market-guide-head-actions">
            <GuideDownloads base={base} />
            <span className="market-endpoints-count">API v1</span>
          </div>
        </div>
        <div className="market-api-credentials">
        <p className="market-api-base"><span>Base URL</span><code>{base}</code></p>
        <p className="market-api-base"><span>Header</span><code>X-Market-Api-Key: &lt;API_KEY&gt;</code><small>แทน &lt;API_KEY&gt; ด้วย key ที่ได้จากเจ้าหน้าที่</small></p>
        </div>
        <div className="market-api-scope">
        <h5>สิทธิ์การเข้าถึง</h5>
        <ul className="market-api-rules">
          <li>1 API key ผูกกับ 1 สัญญาเช่า เห็นได้เฉพาะร้านที่ตัวเองเช่าอยู่</li>
          <li>ข้อมูลร้านและสัญญาเช่าเป็นแบบ <strong>อ่านอย่างเดียว</strong></li>
          <li>แก้ไขได้เฉพาะ <strong>สินค้าในร้านที่เช่า</strong>: <span className="market-api-fields">{['sku', 'name', 'category', 'price', 'stock', 'unit', 'description', 'is_available'].map((field) => <code key={field}>{field}</code>)}</span></li>
          <li>เมื่อสัญญาหมดอายุหรือถูกยกเลิก key จะใช้ไม่ได้ทันที</li>
        </ul>
        </div>
      </section>
      <section className="market-section market-endpoints">
        <div className="market-endpoints-head">
          <div>
            <h4><Icon name="code" size={18} /> Endpoints</h4>
            <p>เลือก endpoint ตามงานที่ต้องการ โดยใช้ path ต่อจาก Base URL</p>
          </div>
          <span className="market-endpoints-count">{GUIDE_ENDPOINTS.length} endpoints</span>
        </div>
        <div className="market-endpoint-groups">
          {[
            { access: 'อ่าน', title: 'เรียกดูข้อมูล', description: 'ข้อมูลร้าน สัญญาเช่า และสินค้า', icon: 'shop' },
            { access: 'แก้ไข', title: 'จัดการสินค้า', description: 'เพิ่ม แก้ไข และลบสินค้าในร้านที่เช่า', icon: 'edit' },
          ].map((group) => (
            <section className="market-endpoint-group" key={group.access} aria-label={group.title}>
              <div className="market-endpoint-group-head">
                <span className={`market-endpoint-group-icon ${group.access === 'อ่าน' ? 'is-read' : 'is-write'}`}><Icon name={group.icon} size={18} /></span>
                <div><h5>{group.title}</h5><p>{group.description}</p></div>
              </div>
              <ul className="market-api-table">
                {GUIDE_ENDPOINTS.filter((item) => item.access === group.access).map((item) => (
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
      </section>
      <section className="market-section market-api-example">
        <div className="market-endpoints-head">
          <div><h4><Icon name="code" size={18} /> ตัวอย่างการเรียกใช้งาน</h4><p>อัปเดตราคา จำนวนคงเหลือ และสถานะพร้อมขายของสินค้า</p></div>
          <span className="market-endpoints-count">cURL</span>
        </div>
        <div className="market-api-terminal">
          <div className="market-api-terminal-head"><span className="market-method is-patch">PATCH</span><span>/products/12</span><small>Request</small></div>
          <pre className="market-code"><code>{example}</code></pre>
        </div>
        <p className="market-api-example-note">แทนที่ API key และรหัสสินค้า 12 ด้วยข้อมูลของร้านคุณก่อนเรียกใช้งาน</p>
      </section>
      <section className="market-section market-api-error-section">
        <div className="market-endpoints-head">
          <div><h4><Icon name="code" size={18} /> รหัสข้อผิดพลาด</h4><p>ตรวจสอบ HTTP status และรหัสที่ได้รับ เพื่อหาสาเหตุของคำขอที่ไม่สำเร็จ</p></div>
          <span className="market-endpoints-count">{GUIDE_ERRORS.length} รหัส</span>
        </div>
        <dl className="market-api-errors">
          {GUIDE_ERRORS.map(([code, text]) => <div key={code}><dt><span>{code.split(' ')[0]}</span><code>{code.split(' ')[1]}</code></dt><dd>{text}</dd></div>)}
        </dl>
      </section>
    </div>
  )
}

export default function MarketManager({ onSummary }) {
  const role = currentRole()
  const summaryRef = useRef(onSummary)
  useEffect(() => {
    summaryRef.current = onSummary
  })
  const [section, setSection] = useState('shops')
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [refreshKey, setRefreshKey] = useState(0)
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/overview`, { headers: authHeaders() })
      setState({ loading: false, error: '', data })
      summaryRef.current?.(data.summary)
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'โหลดข้อมูลร้านค้าไม่สำเร็จ') }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  const refresh = (message) => {
    if (typeof message === 'string') setNotice(message)
    setRefreshKey((value) => value + 1)
  }

  const data = state.data

  return (
    <div className="market-manager">
      <header className="market-head">
        <div className="market-title">
          <span className="market-title-icon"><Icon name="shop" size={22} /></span>
          <div>
            <h3>ร้านค้าเช่าข้างหอพัก</h3>
            <p>{ROLE_HINT[role] || 'จุดขายให้เช่าข้างหอพัก'}</p>
          </div>
        </div>
        <nav className="market-sections" aria-label="ส่วนของระบบร้านค้า">
          {SECTIONS.map((item) => (
            <button key={item.key} type="button" className={`market-section-tab${section === item.key ? ' is-active' : ''}`} onClick={() => setSection(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {notice && <p className="market-notice" role="status">{notice}</p>}
      {state.error && <p className="market-error" role="alert">{state.error}</p>}
      {state.loading && !data && <p className="market-empty">กำลังโหลด...</p>}

      {data && section === 'shops' && (
        <ShopsSection data={data} onOpenShop={(id) => setModal({ type: 'shop', id })} onCreateShop={() => setModal({ type: 'create-shop' })} />
      )}
      {data && section === 'leases' && (
        <LeasesSection
          refreshKey={refreshKey}
          canOperate={data.permissions.operate}
          onOpenLease={(id) => setModal({ type: 'lease', id })}
          onCreateLease={(shopId) => setModal({ type: 'create-lease', shopId })}
          onRenewLease={(lease) => setModal({ type: 'renew', lease })}
        />
      )}
      {modal?.type === 'renew' && (
        <RenewModal lease={modal.lease} onClose={(message) => {
          setModal(null)
          if (message) refresh(message)
        }} />
      )}
      {section === 'api' && <ApiGuideSection />}

      {modal?.type === 'create-shop' && (
        <ShopFormModal shops={data?.shops || []} onClose={() => setModal(null)} onSaved={(message) => {
          setModal(null)
          refresh(message)
        }} />
      )}
      {modal?.type === 'shop' && (
        <ShopDetailModal
          shopId={modal.id}
          onClose={() => setModal(null)}
          onChanged={refresh}
          onOpenLease={(id) => setModal({ type: 'lease', id, backTo: modal })}
          onCreateLease={(shopId) => setModal({ type: 'create-lease', shopId })}
        />
      )}
      {modal?.type === 'lease' && (
        <LeaseDetailModal leaseId={modal.id} onClose={() => setModal(modal.backTo || null)} onChanged={refresh} />
      )}
      {modal?.type === 'create-lease' && data && (
        <LeaseFormModal
          shops={data.shops}
          initialShopId={modal.shopId}
          onClose={() => setModal(null)}
          onSaved={(message, lease) => {
            refresh(message)
            setModal({ type: 'lease', id: lease.id })
          }}
        />
      )}
    </div>
  )
}
