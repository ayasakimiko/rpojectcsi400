import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { DormInfoSettings } from '../components/DormInfo'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts'
import './css/OwnerPage.css'
import './css/StaffPage.css'
import { StaffResidentVisitsTab, StaffSafetyTab } from './StaffMain.jsx'
import { UploadImage } from '../components/UploadMedia.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'
import { downloadUploadFile } from '../utils/uploadFiles.js'

const EMPTY = { promptpay_id: '', bank_name: '', bank_account_no: '' }
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

function OwnerPaymentSettings() {
  const id = useId()
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    axios.get('/api/owner/payment-settings', { headers: headers(), signal: controller.signal })
      .then(({ data }) => { setSaved(data.settings); setDraft(data.settings) })
      .catch((error) => { if (!axios.isCancel(error)) setMessage({ error: true, text: error.response?.data?.message || 'โหลดข้อมูลรับโอนไม่สำเร็จ' }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const change = (event) => {
    setDraft({ ...draft, [event.target.name]: event.target.value })
    setMessage(null)
  }
  const save = async (event) => {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true)
    setMessage(null)
    try {
      const { data } = await axios.put('/api/owner/payment-settings', draft, { headers: headers() })
      setSaved(data.settings)
      setDraft(data.settings)
      setMessage({ error: false, text: data.message })
    } catch (error) {
      setMessage({ error: true, text: error.response?.data?.message || 'บันทึกข้อมูลรับโอนไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }
  const changed = draft && Object.keys(EMPTY).some((field) => draft[field] !== saved?.[field])
  return (
    <section className="owner-payment-settings owner-panel" aria-labelledby={`${id}-title`}>
      <div className="owner-panel-header">
        <div><h3 id={`${id}-title`}>ช่องทางรับโอน</h3><p>กำหนดหมายเลข PromptPay และบัญชีธนาคารของหอพัก</p></div>
      </div>
      {loading && <p role="status">กำลังโหลดข้อมูล...</p>}
      {message && <p className={message.error ? 'owner-payment-error' : 'owner-payment-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      {!loading && draft && (
        <form onSubmit={save} className="owner-payment-form">
          <label htmlFor={`${id}-promptpay`}>หมายเลข PromptPay
            <input id={`${id}-promptpay`} name="promptpay_id" type="text" inputMode="numeric" maxLength={13} value={draft.promptpay_id} onChange={change} placeholder="เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก" />
          </label>
          <label htmlFor={`${id}-bank`}>ชื่อธนาคาร
            <input id={`${id}-bank`} name="bank_name" type="text" maxLength={100} value={draft.bank_name} onChange={change} placeholder="ชื่อธนาคาร" />
          </label>
          <label htmlFor={`${id}-account`}>เลขบัญชี
            <input id={`${id}-account`} name="bank_account_no" type="text" inputMode="numeric" maxLength={50} value={draft.bank_account_no} onChange={change} placeholder="เลขบัญชีธนาคาร" />
          </label>
          <div className="owner-payment-actions">
            <button type="button" disabled={!changed || saving} onClick={() => { setDraft(saved); setMessage(null) }}>ยกเลิกการแก้ไข</button>
            <button type="submit" disabled={!changed || saving}>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลรับโอน'}</button>
          </div>
        </form>
      )}
    </section>
  )
}

const currency = (value) => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

function OwnerUtilityReceipts({ from, to }) {
  const [result, setResult] = useState({ trends: [], granularity: 'month' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    axios.get('/api/owner/utility-receipts', {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      params: { from: from || undefined, to: to || undefined },
      signal: controller.signal,
    }).then(({ data }) => { setResult(data); setError('') })
      .catch((requestError) => { if (!axios.isCancel(requestError)) setError(requestError.response?.data?.message || 'โหลดรายรับค่าน้ำค่าไฟไม่สำเร็จ') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [from, to])

  const totals = result.trends.reduce((sum, row) => ({
    water: sum.water + row.water,
    electricity: sum.electricity + row.electricity,
    waterUnits: sum.waterUnits + (row.waterUnits || 0),
    electricityUnits: sum.electricityUnits + (row.electricityUnits || 0),
  }), { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 })
  return (
    <section className="owner-panel owner-utility-receipts" aria-label="รายรับค่าน้ำค่าไฟ">
      <div className="owner-panel-header">
        <div><h3>รายรับค่าน้ำและค่าไฟ</h3><p>ยอดที่ชำระแล้วในช่วงวันที่เลือก</p></div>
      </div>
      {error && <p className="owner-utility-receipts-error" role="alert">{error}</p>}
      {loading ? <p role="status">กำลังโหลดข้อมูล...</p> : result.trends.length ? (
        <>
          <div className="owner-utility-receipts-summary">
            <span>ค่าน้ำ <strong>฿{currency(totals.water)}</strong></span>
            <span>ค่าไฟ <strong>฿{currency(totals.electricity)}</strong></span>
            <span>หน่วยน้ำ <strong>{currency(totals.waterUnits)}</strong></span>
            <span>หน่วยไฟ <strong>{currency(totals.electricityUnits)}</strong></span>
          </div>
          <div className="owner-utility-receipts-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.trends} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="amount" tick={{ fontSize: 11 }} tickFormatter={currency} />
                <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 11 }} tickFormatter={currency} />
                <Tooltip formatter={(value, name) => [name.includes('หน่วย') ? `${currency(value)} หน่วย` : `฿${currency(value)}`, name]} />
                <Legend />
                <Line animationDuration={350} yAxisId="amount" type="monotone" dataKey="water" name="ค่าน้ำ" stroke="#0891b2" strokeWidth={2} />
                <Line animationDuration={350} yAxisId="amount" type="monotone" dataKey="electricity" name="ค่าไฟ" stroke="#d97706" strokeWidth={2} />
                <Line animationDuration={350} yAxisId="units" type="monotone" dataKey="waterUnits" name="หน่วยน้ำ" stroke="#16a34a" strokeWidth={2} connectNulls />
                <Line animationDuration={350} yAxisId="units" type="monotone" dataKey="electricityUnits" name="หน่วยไฟ" stroke="#7c3aed" strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : !error && <p className="owner-empty">ยังไม่มีรายการค่าน้ำหรือค่าไฟที่รับชำระในช่วงนี้</p>}
    </section>
  )
}

const ROOM_OCCUPANCY_COLORS = { occupied: '#2563eb', vacant: '#10b981' }

const ROOM_STATUS_LABELS = { vacant: 'ว่าง', occupied: 'มีผู้เช่า', overdue: 'ค้างชำระ', maintenance: 'ซ่อมบำรุง' }

const ROOM_STATUS_COLORS = { occupied: '#3b82f6', overdue: '#f97316', vacant: '#10b981', maintenance: '#e11d48' }

const ROOM_PAYMENT_STATUS_LABELS = { paid: 'ชำระแล้ว', pending: 'รอตรวจสอบ', rejected: 'ถูกปฏิเสธ', unpaid: 'ยังไม่ชำระ', overdue: 'เกินกำหนด' }

function getRoomPaymentTone(status) {
  if (status === 'paid') return 'paid'
  if (status === 'pending') return 'pending'
  if (status === 'rejected' || status === 'overdue') return 'danger'
  return 'other'
}

const ROOM_PAYMENTS_ALL_PAGE_SIZE = 30

const ROOM_MAP_PAGE_SIZE = 12

const ROOM_LIST_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', title: 'ห้องทั้งหมด' },
  { key: 'occupied', label: 'มีผู้เช่า', title: 'ห้องที่มีผู้เช่า' },
  { key: 'overdue', label: 'ค้างชำระ', title: 'ห้องค้างชำระ' },
  { key: 'vacant', label: 'ว่าง', title: 'ห้องว่าง' },
  { key: 'maintenance', label: 'ซ่อมบำรุง', title: 'ห้องที่กำลังซ่อม' },
]

function OwnerSlipDownloadButton({ url, fileName }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const download = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await downloadUploadFile(url, fileName)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={`payment-slip-download${failed ? ' is-failed' : ''}`} onClick={download} disabled={busy}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </svg>
      {busy ? 'กำลังบันทึก...' : failed ? 'บันทึกไม่สำเร็จ ลองอีกครั้ง' : 'บันทึกรูปสลิป'}
    </button>
  )
}

const STAT_ICON_PATHS = {
  rooms: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M3 9 12 3l9 6" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  income: (
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <path d="M6 11 12 5l6 6" />
    </>
  ),
  expense: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <path d="M6 13 12 19l6-6" />
    </>
  ),
  profit: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  margin: (
    <>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  overdue: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  maintenance: (
    <path d="M21 7.5a5.5 5.5 0 0 1-7.6 5.1L6 20l-3-3 7.4-7.4A5.5 5.5 0 1 1 21 7.5Z" />
  ),
  water: (
    <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />
  ),
  electricity: (
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  ),
}

const OWNER_TILE_TONES = { blue: 'blue', green: 'green', purple: 'violet', orange: 'orange', red: 'red' }

function StatIcon({ name }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {STAT_ICON_PATHS[name]}
    </svg>
  )
}

const OWNER_LIST_ICON_PATHS = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  door: <><path d="M4 21h16" /><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" /><path d="M14 12h.01" /></>,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 10" /></>,
}

function OwnerListIcon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {OWNER_LIST_ICON_PATHS[name]}
    </svg>
  )
}

function compareNewest(field) {
  return (a, b) => {
    const timeA = a[field] ? new Date(a[field]).getTime() : -Infinity
    const timeB = b[field] ? new Date(b[field]).getTime() : -Infinity
    if (timeA !== timeB) return timeB - timeA
    return a.room_number - b.room_number
  }
}

function OwnerStatTile({ icon, label, value, hint, tone }) {
  return (
    <div className={`staff-summary-tile is-${OWNER_TILE_TONES[tone] || 'blue'}`}>
      <span className="staff-summary-tile-icon">
        <StatIcon name={icon} />
      </span>
      <span className="staff-summary-tile-text">
        <span className="staff-summary-tile-label">{label}</span>
        <strong className="staff-summary-tile-value">{value}</strong>
        {hint && <small className="staff-summary-tile-hint">{hint}</small>}
      </span>
    </div>
  )
}

const EMPTY_STAFF = {
  role: 'Staff',
  idcard: '',
  password: '',
  phone: '',
  first_name: '',
  last_name: '',
  age: '',
}

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(value) {
  if (!value) return '-'
  const dateValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  return new Date(dateValue).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatSignedCurrency(value) {
  const amount = Number(value) || 0
  return amount < 0 ? `-฿${formatCurrency(Math.abs(amount))}` : `฿${formatCurrency(amount)}`
}

function formatPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${num.toFixed(1)}%`
}

const PAYMENT_TYPE_LABELS = {
  rent: 'ค่าเช่า',
  room: 'ค่าห้อง',
  deposit: 'เงินมัดจำ',
  water: 'ค่าน้ำ',
  electricity: 'ค่าไฟ',
}

function formatPaymentType(type) {
  return PAYMENT_TYPE_LABELS[type] || type
}

const PAYMENT_TYPE_COLORS = {
  rent: '#2563eb',
  deposit: '#7c3aed',
  water: '#0891b2',
  electricity: '#d97706',
}

function getPaymentTypeColor(type) {
  return PAYMENT_TYPE_COLORS[type] || '#5d728b'
}

const PAYMENT_TYPE_ICON_PATHS = {
  rent: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  deposit: (
    <>
      <path d="M12 2v3" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  water: <path d="M12 2c3.5 4.5 7 8.6 7 12.5A7 7 0 1 1 5 14.5C5 10.6 8.5 6.5 12 2Z" />,
  electricity: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
}

function PaymentTypeIcon({ type }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PAYMENT_TYPE_ICON_PATHS[type] || <circle cx="12" cy="12" r="8" />}
    </svg>
  )
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

function formatTrendMonth(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey
  const [year, month] = monthKey.split('-').map(Number)
  const shortYear = String(year + 543).slice(-2)
  return `${THAI_MONTHS_SHORT[month - 1]} ${shortYear}`
}

function formatTrendDay(dayKey) {
  if (typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return dayKey
  const [, month, day] = dayKey.split('-').map(Number)
  return `${day} ${THAI_MONTHS_SHORT[month - 1]}`
}

const FINANCE_TREND_COLORS = { income: '#2563eb', expense: '#d97706', net: '#7c3aed' }
const FINANCE_TREND_SERIES = [
  { key: 'income', label: 'รายรับ', color: FINANCE_TREND_COLORS.income },
  { key: 'expense', label: 'รายจ่าย', color: FINANCE_TREND_COLORS.expense },
  { key: 'netProfit', label: 'กำไร/ขาดทุน', color: FINANCE_TREND_COLORS.net },
]

const OCCUPANCY_TREND_SERIES = [
  { key: 'occupied', label: 'มีผู้เช่า', color: ROOM_OCCUPANCY_COLORS.occupied },
  { key: 'vacant', label: 'ว่าง', color: ROOM_OCCUPANCY_COLORS.vacant },
]

const OCCUPANCY_MOVEMENT_SERIES = [
  { key: 'moveIns', label: 'ย้ายเข้า', color: '#0f9d58' },
  { key: 'moveOuts', label: 'ย้ายออก', color: '#d97706' },
]

function TrendTooltip({ active, payload, label, series, formatValue }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="owner-chart-tooltip owner-chart-tooltip-multi">
      <strong className="owner-chart-tooltip-title">{label}</strong>
      {payload.map((item) => (
        <div key={item.dataKey} className="owner-chart-tooltip-row">
          <span className="owner-chart-tooltip-dot" style={{ background: item.color }} />
          <span>{series.find((s) => s.key === item.dataKey)?.label || item.dataKey}</span>
          <strong>{formatValue(item.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function FinanceTrendTooltip(props) {
  return <TrendTooltip {...props} series={FINANCE_TREND_SERIES} formatValue={formatSignedCurrency} />
}

function OccupancyTrendTooltip(props) {
  return <TrendTooltip {...props} series={OCCUPANCY_TREND_SERIES} formatValue={(value) => `${value} ห้อง`} />
}

function OccupancyMovementTooltip(props) {
  return <TrendTooltip {...props} series={OCCUPANCY_MOVEMENT_SERIES} formatValue={(value) => `${value} คน`} />
}

const OWNER_ROOMS_SECTIONS = [
  { key: 'overview', label: 'ภาพรวมห้องพัก' },
  { key: 'occupancy', label: 'เปรียบเทียบจำนวนผู้เข้าพัก' },
  { key: 'logs', label: 'บันทึกการเข้าพักและย้ายออก' },
]

const OWNER_TABS = [
  { key: 'rooms', label: 'สรุปห้อง' },
  { key: 'finance', label: 'รายละเอียดการเงิน' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'parking', label: 'ที่จอดรถ' },
  { key: 'safety', label: 'แจ้งเหตุฉุกเฉิน' },
  { key: 'utilities', label: 'ค่าน้ำ-ค่าไฟ' },
  { key: 'audit', label: 'ประวัติ Audit' },
  { key: 'announcements', label: 'ประกาศจากหอพัก' },
  { key: 'dorm-info', label: 'กฎระเบียบและเบอร์ติดต่อ' },
]

const OWNER_PERIOD_BAR_CONTENT = {
  rooms: { title: 'สรุปข้อมูลห้องพัก', subtitle: 'ภาพรวมห้องพักและผู้เข้าพักประจำเดือน' },
  finance: { title: 'สรุปข้อมูลการเงิน', subtitle: 'ยอดรายรับ รายจ่าย และกำไรสุทธิของเดือนปัจจุบัน' },
  staff: { title: 'ข้อมูลพนักงาน', subtitle: 'รายชื่อและสถานะพนักงานทั้งหมด' },
  parking: { title: 'จัดการที่จอดรถ', subtitle: 'ติดตามคำขอและรายการรถของผู้เข้าพัก' },
  safety: { title: 'จัดการเหตุฉุกเฉิน', subtitle: 'ติดตามและตรวจสอบรายงานจากผู้เข้าพักและเจ้าหน้าที่' },
  utilities: { title: 'ค่าน้ำ-ค่าไฟรายห้อง', subtitle: 'หน่วยที่ใช้ ยอดเรียกเก็บ และสถานะการชำระแยกตามห้อง' },
  audit: { title: 'ประวัติการใช้งานเว็บไซต์', subtitle: 'รายการเปลี่ยนแปลงข้อมูลที่ดำเนินการโดยผู้ใช้ทุกบทบาท' },
  announcements: { title: 'ประกาศจากหอพัก', subtitle: 'ข่าวสารและการแจ้งเตือนที่สื่อสารกับผู้เช่าและเจ้าหน้าที่' },
}

const AUDIT_RESOURCES = [
  ['move-out-inspections', 'ผลตรวจห้องย้ายออก'],
  ['resident-visit-requests', 'คำขอเข้าเยี่ยม/รถ'],
  ['payment-verifications', 'รายการชำระเงิน'],
  ['safety-incidents', 'รายงานเหตุ'],
  ['utility-bill', 'บิลค่าน้ำ-ค่าไฟ'],
  ['collect-payment', 'การชำระเงิน'],
  ['waiting-list', 'รายชื่อผู้รอห้อง'],
  ['announcements', 'ประกาศ'],
  ['maintenance', 'งานแจ้งซ่อม'],
  ['customers', 'ข้อมูลผู้เช่า'],
  ['requests', 'คำขอผู้เช่า'],
  ['expenses', 'รายการรายจ่าย'],
  ['parcels', 'รายการพัสดุ'],
  ['register', 'ผู้เช่า'],
  ['rooms', 'ห้องพัก'],
  ['staff', 'ข้อมูลพนักงาน'],
  ['profile', 'ข้อมูลส่วนตัว'],
]

function describeAuditActivity(log) {
  const segments = String(log.endpoint || '').split('?')[0].split('/').filter(Boolean)
  const method = String(log.method || '').toUpperCase()
  const resourceEntry = AUDIT_RESOURCES.find(([key]) => segments.includes(key))
  const resource = resourceEntry?.[1] || 'ข้อมูลในระบบ'
  const actionSegment = segments.find((segment) => ['approve', 'reject', 'review', 'acknowledge', 'cancel', 'suspend'].includes(segment))
  const resourceIndex = resourceEntry ? segments.indexOf(resourceEntry[0]) : -1
  const recordId = resourceIndex >= 0 ? segments.slice(resourceIndex + 1).find((segment) => /^\d+$/.test(segment)) : null
  const recordLabel = recordId
    ? resource === 'ห้องพัก' ? `ห้อง ${recordId}` : `${resource} #${recordId}`
    : resource === 'ผู้เช่า' && segments.includes('register') ? 'ผู้เช่ารายใหม่' : resource

  if (segments.includes('register') && method === 'POST') return { action: 'สมัครผู้เช่า', detail: 'ลงทะเบียนผู้เช่ารายใหม่' }
  if (actionSegment === 'approve') return { action: `อนุมัติ${resource}`, detail: recordLabel }
  if (actionSegment === 'reject') return { action: `ปฏิเสธ${resource}`, detail: recordLabel }
  if (actionSegment === 'review') return { action: `ตรวจสอบ${resource}`, detail: recordLabel }
  if (actionSegment === 'acknowledge') return { action: `รับทราบ${resource}`, detail: recordLabel }
  if (actionSegment === 'cancel') return { action: `ยกเลิก${resource}`, detail: recordLabel }
  if (actionSegment === 'suspend') return { action: `เปลี่ยนสถานะ${resource}`, detail: recordLabel }
  if (segments.includes('collect-payment')) return { action: 'รับชำระเงิน', detail: recordLabel }
  if (segments.includes('utility-bill')) return { action: 'บันทึกบิลค่าน้ำ-ค่าไฟ', detail: recordLabel }
  if (method === 'POST') return { action: `เพิ่ม${resource}`, detail: recordLabel }
  if (method === 'PUT' || method === 'PATCH') return { action: `แก้ไข${resource}`, detail: recordLabel }
  if (method === 'DELETE') return { action: `ลบ${resource}`, detail: recordLabel }
  return { action: 'อัปเดตข้อมูล', detail: recordLabel }
}

function OwnerAuditLog() {
  const [result, setResult] = useState({ logs: [], total: 0, page: 1, pageSize: 20 })
  const [page, setPage] = useState(1)
  const [role, setRole] = useState('all')
  const [method, setMethod] = useState('all')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    axios.get('/api/owner/logs/audit', {
      headers: getAuthHeaders(),
      params: { page, role: role !== 'all' ? role : undefined, method: method !== 'all' ? method : undefined, search: appliedSearch || undefined },
    }).then(({ data }) => {
      if (!cancelled) {
        setResult(data)
        setError('')
      }
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.response?.data?.message || 'โหลดประวัติการใช้งานไม่สำเร็จ')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [page, role, method, appliedSearch])

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  return (
    <section className="owner-panel owner-audit-panel">
      <div className="owner-panel-header">
        <div><h3>ประวัติการใช้งานเว็บไซต์</h3><p>บันทึกการเปลี่ยนแปลงข้อมูลที่สำเร็จจากทุกบทบาท</p></div>
        <span className="owner-panel-header-count">{Number(result.total).toLocaleString('th-TH')} รายการ</span>
      </div>
      <form className="owner-audit-filters" onSubmit={(event) => { event.preventDefault(); if (search.trim() !== appliedSearch) setLoading(true); setPage(1); setAppliedSearch(search.trim()) }}>
        <input className="owner-audit-search" type="search" placeholder="ค้นหาผู้ใช้หรือรายการ" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="กรองบทบาท" value={role} onChange={(event) => { setLoading(true); setRole(event.target.value); setPage(1) }}>
          <option value="all">ทุกบทบาท</option><option value="Customer">ลูกค้า</option><option value="Staff">พนักงาน</option><option value="Admin">แอดมิน</option><option value="Owner">เจ้าของ</option>
        </select>
        <select aria-label="กรองการกระทำ" value={method} onChange={(event) => { setLoading(true); setMethod(event.target.value); setPage(1) }}>
          <option value="all">ทุกการกระทำ</option><option value="POST">สร้าง</option><option value="PUT">แก้ไข</option><option value="PATCH">แก้ไข</option><option value="DELETE">ลบ</option>
        </select>
        <button className="owner-primary-btn small" type="submit">ค้นหา</button>
      </form>
      {error && <div className="owner-alert owner-alert-danger" role="alert">{error}</div>}
      <div className="owner-table-wrap owner-audit-table-wrap">
        <table className="owner-table owner-audit-table">
          <thead><tr><th>วัน-เวลา</th><th>ผู้ทำรายการ</th><th>กิจกรรม</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="3" className="owner-empty-row">กำลังโหลด...</td></tr> : result.logs.length ? result.logs.map((log) => {
              const activity = describeAuditActivity(log)
              return <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{log.actor_name || `${log.actor_role} #${log.actor_id}`}<small>{log.actor_role}</small></td>
                <td><strong>{activity.action}</strong><small>{activity.detail}</small></td>
              </tr>
            }) : <tr><td colSpan="3" className="owner-empty-row">ยังไม่มีประวัติการใช้งาน</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="owner-audit-pagination">
        <span>หน้า {page} / {totalPages} · ทั้งหมด {Number(result.total).toLocaleString('th-TH')} รายการ</span>
        <div className="owner-pagination">
          <button type="button" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage(page - 1) }}>ก่อนหน้า</button>
          <button type="button" disabled={loading || page >= totalPages} onClick={() => { setLoading(true); setPage(page + 1) }}>ถัดไป</button>
        </div>
      </div>
    </section>
  )
}

function getOwnerNotificationStorageKey() {
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    return `owner-notifications-seen-${user.id ?? user.idcard ?? user.username ?? 'current'}`
  } catch {
    return 'owner-notifications-seen-current'
  }
}

function buildOwnerAnnouncementNotification(item) {
  return {
    key: `announcement-${item.id}`,
    announcementId: item.id,
    title: item.title,
    tone: item.tone === 'warning' ? 'pending' : 'info',
    label: item.tone === 'warning' ? 'ประกาศแจ้งเตือนจากหอพัก' : 'ประกาศจากหอพัก',
    date: item.created_at,
    message: item.message,
    author: item.author || 'เจ้าหน้าที่',
  }
}

const OCCUPANCY_TYPE_FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'move_in', label: 'เข้าพัก' },
  { key: 'move_out', label: 'ย้ายออก' },
]

const OCCUPANCY_EVENT_LABELS = { move_in: 'เข้าพัก', move_out: 'ย้ายออก' }

function formatOccupancyEventType(type) {
  return OCCUPANCY_EVENT_LABELS[type] || type
}

function parseInputDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null
}

function getAuthHeaders() {
  const token = sessionStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const MODAL_CLOSE_ANIMATION_MS = 60

function useClosingValue(value, duration = MODAL_CLOSE_ANIMATION_MS) {
  const [prevValue, setPrevValue] = useState(value)
  const [closingValue, setClosingValue] = useState(null)

  if (value !== prevValue) {
    if (!value && prevValue) {
      setClosingValue(prevValue)
    } else if (value && closingValue) {
      setClosingValue(null)
    }
    setPrevValue(value)
  }

  useEffect(() => {
    if (!closingValue) return undefined
    const timeoutId = setTimeout(() => setClosingValue(null), duration)
    return () => clearTimeout(timeoutId)
  }, [closingValue, duration])

  const display = value || closingValue
  const isClosing = !value && Boolean(closingValue)
  return [display, isClosing]
}

const DATE_DEPENDENT_GROUPS = ['overview', 'roomsOverview', 'roomsOccupancy', 'roomsLogs', 'finance']

function getNeededDataGroups(tab, roomsSection) {
  if (tab === 'rooms') {
    const sectionGroup = { overview: 'roomsOverview', occupancy: 'roomsOccupancy', logs: 'roomsLogs' }[roomsSection] || 'roomsOverview'
    return ['roomStatus', 'overview', sectionGroup]
  }
  if (tab === 'finance') return ['overview', 'finance']
  if (tab === 'staff') return ['staff']
  if (tab === 'parking' || tab === 'safety') return ['roomStatus']
  return []
}

function OwnerMain() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('rooms')
  const [roomsSection, setRoomsSection] = useState('overview')
  const [announcements, setAnnouncements] = useState([])
  const [announcementFocus, setAnnouncementFocus] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifPage, setNotifPage] = useState(1)
  const notifRef = useRef(null)
  const notifListRef = useRef(null)
  const [notifClosing, setNotifClosing] = useState(false)
  const [seenNotificationKeys, setSeenNotificationKeys] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(getOwnerNotificationStorageKey()) || '[]')
    } catch {
      return []
    }
  })
  const [freshNotificationKeys, setFreshNotificationKeys] = useState(() => new Set())
  const [overview, setOverview] = useState({ rooms: {}, finance: {} })
  const [roomStatus, setRoomStatus] = useState({ totalRooms: 0, vacantCount: 0, occupiedCount: 0, rooms: [] })
  const [incomeSummary, setIncomeSummary] = useState({ totalIncome: 0, byType: [] })
  const [expenses, setExpenses] = useState({ expenses: [], byCategory: [], total: 0, totalAmount: 0, page: 1, pageSize: 10 })
  const [financeTrends, setFinanceTrends] = useState({ trends: [], granularity: 'month' })
  const [isTrendsLoading, setIsTrendsLoading] = useState(false)
  const [occupancyTrend, setOccupancyTrend] = useState({ trends: [], granularity: 'month' })
  const [isOccupancyTrendLoading, setIsOccupancyTrendLoading] = useState(false)
  const [occupancyPeriodDetail, setOccupancyPeriodDetail] = useState(null)
  const [expenseCategoryPage, setExpenseCategoryPage] = useState(1)
  const [staffList, setStaffList] = useState([])
  const [utilities, setUtilities] = useState({ summary: {}, rooms: [] })
  const [utilityMonth, setUtilityMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [utilityRoomFilter, setUtilityRoomFilter] = useState('all')
  const [paymentLogs, setPaymentLogs] = useState({ payments: [], total: 0, page: 1, pageSize: 20 })
  const [viewingPaymentSlip, setViewingPaymentSlip] = useState(null)
  const [paymentSlipZoomOpen, setPaymentSlipZoomOpen] = useState(false)
  const [pendingSlipReviews, setPendingSlipReviews] = useState([])
  const [reviewingSlipId, setReviewingSlipId] = useState(null)
  const [occupancyLogs, setOccupancyLogs] = useState({ logs: [], total: 0, page: 1, pageSize: 10 })
  const [occupancyFilter, setOccupancyFilter] = useState({ search: '', type: 'all' })
  const [occupantsPage, setOccupantsPage] = useState(1)
  const [vacantRoomsPage, setVacantRoomsPage] = useState(1)
  const [maintenanceRoomsPage, setMaintenanceRoomsPage] = useState(1)
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF)
  const [paymentFilter, setPaymentFilter] = useState({ from: '', to: '' })
  const [paymentLogFilter, setPaymentLogFilter] = useState({ search: '', from: '', to: '', onlyOverdue: false })
  const [notice, setNotice] = useState({ type: '', message: '' })
  const [loadedDataGroups, setLoadedDataGroups] = useState(() => new Set())
  const dataGroupsLoadedRef = useRef(new Set())
  const dataGroupsInflightRef = useRef(new Set())
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [staffErrors, setStaffErrors] = useState({})
  const [selectedPeriod] = useState(() => {
    const today = new Date()
    return { month: today.getMonth() + 1, year: today.getFullYear() }
  })
  const [roomDetail, setRoomDetail] = useState(null)
  const [isRoomDetailLoading, setIsRoomDetailLoading] = useState(false)
  const [roomListFilter, setRoomListFilter] = useState(null)
  const [roomListSearch, setRoomListSearch] = useState('')
  const [roomDetailOpenedAt, setRoomDetailOpenedAt] = useState(0)
  const [roomPaymentDetail, setRoomPaymentDetail] = useState(null)
  const [roomMapFilter, setRoomMapFilter] = useState('all')
  const [roomMapPage, setRoomMapPage] = useState(1)
  const [roomPaymentsAllOpen, setRoomPaymentsAllOpen] = useState(false)
  const [roomPaymentsSearch, setRoomPaymentsSearch] = useState('')
  const [roomPaymentsStatus, setRoomPaymentsStatus] = useState('all')
  const [roomPaymentsPage, setRoomPaymentsPage] = useState(1)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const confirmResolverRef = useRef(null)
  const [paymentHistoryPage, setPaymentHistoryPage] = useState(1)
  const [incomeTypePage, setIncomeTypePage] = useState(1)
  const [staffPage, setStaffPage] = useState(1)
  const [occupancySummary, setOccupancySummary] = useState(null)
  const [isOccupancySummaryLoading, setIsOccupancySummaryLoading] = useState(false)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [viewingStaff, setViewingStaff] = useState(null)

  const [isExpenseManagerOpen, setIsExpenseManagerOpen] = useState(false)
  const [expenseEditModal, setExpenseEditModal] = useState(null)
  const [expenseEditForm, setExpenseEditForm] = useState({ category: '', description: '', amount: '', expense_date: '' })
  const [expenseEditFormError, setExpenseEditFormError] = useState('')
  const [isExpenseEditSubmitting, setIsExpenseEditSubmitting] = useState(false)
  const [expenseDeleteConfirm, setExpenseDeleteConfirm] = useState(null)

  const loadAnnouncements = useCallback(() => axios
    .get('/api/owner/announcements', { headers: getAuthHeaders() })
    .then(({ data }) => setAnnouncements(data.announcements || []))
    .catch(() => {}), [])

  useEffect(() => {
    loadAnnouncements()
    const interval = setInterval(() => {
      if (!document.hidden) loadAnnouncements()
    }, 60000)
    const refresh = () => {
      if (!document.hidden) loadAnnouncements()
    }
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [loadAnnouncements])

  useEffect(() => {
    if (!notifOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!notifRef.current?.contains(event.target)) setNotifClosing(true)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [notifOpen])

  const [displayRoomDetail, isRoomDetailClosing] = useClosingValue(roomDetail)
  const [displayRoomListFilter, isRoomListClosing] = useClosingValue(roomListFilter)
  const [displayRoomPaymentDetail, isRoomPaymentDetailClosing] = useClosingValue(roomPaymentDetail)
  const [displayRoomPaymentsAll, isRoomPaymentsAllClosing] = useClosingValue(roomPaymentsAllOpen)
  const [displayConfirmDialog, isConfirmDialogClosing] = useClosingValue(confirmDialog)

  const askConfirm = (options) => new Promise((resolve) => {
    confirmResolverRef.current = resolve
    setConfirmDialog(options)
  })

  const resolveConfirm = (result) => {
    confirmResolverRef.current?.(result)
    confirmResolverRef.current = null
    setConfirmDialog(null)
  }
  const [displayStaffModalOpen, isStaffModalClosing] = useClosingValue(isStaffModalOpen)
  const [displayViewingStaff, isViewingStaffClosing] = useClosingValue(viewingStaff)
  const [displayExpenseManagerOpen, isExpenseManagerClosing] = useClosingValue(isExpenseManagerOpen)
  const [displayExpenseEditModal, isExpenseEditClosing] = useClosingValue(expenseEditModal)
  const [displayExpenseDeleteConfirm, isExpenseDeleteClosing] = useClosingValue(expenseDeleteConfirm)

  const totalIncome = Number(overview?.finance?.totalIncome ?? incomeSummary?.totalIncome ?? 0)
  const totalExpense = Number(overview?.finance?.totalExpense ?? 0)
  const netProfit = Number(overview?.finance?.netProfit ?? totalIncome - totalExpense)

  const incomeByTypeTotal = useMemo(
    () => (incomeSummary.byType || []).reduce((sum, item) => sum + Number(item.total || 0), 0),
    [incomeSummary],
  )

  const SUMMARY_PAGE_SIZE = 5
  const incomeTypeTotalPages = Math.max(1, Math.ceil((incomeSummary.byType?.length || 0) / SUMMARY_PAGE_SIZE))
  const paginatedIncomeByType = useMemo(() => {
    const start = (incomeTypePage - 1) * SUMMARY_PAGE_SIZE
    return (incomeSummary.byType || []).slice(start, start + SUMMARY_PAGE_SIZE)
  }, [incomeSummary, incomeTypePage])

  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0

  const expenseCategoryTotalPages = Math.max(1, Math.ceil((expenses.byCategory?.length || 0) / SUMMARY_PAGE_SIZE))
  const paginatedExpenseCategories = useMemo(() => {
    const start = (expenseCategoryPage - 1) * SUMMARY_PAGE_SIZE
    return (expenses.byCategory || []).slice(start, start + SUMMARY_PAGE_SIZE)
  }, [expenses, expenseCategoryPage])
  const expenseByCategoryTotal = useMemo(
    () => (expenses.byCategory || []).reduce((sum, item) => sum + Number(item.total || 0), 0),
    [expenses],
  )

  const financeExpensePage = Number(expenses.page || 1)
  const financeExpenseTotalPages = Math.max(1, Math.ceil((Number(expenses.total) || 0) / (Number(expenses.pageSize) || 10)))

  const trendChartData = useMemo(() => {
    const formatLabel = financeTrends.granularity === 'day' ? formatTrendDay : formatTrendMonth
    return (financeTrends.trends || []).map((item) => ({ ...item, monthLabel: formatLabel(item.period) }))
  }, [financeTrends])

  const trendSummary = useMemo(() => {
    const totalIncome = trendChartData.reduce((sum, item) => sum + Number(item.income || 0), 0)
    const totalExpense = trendChartData.reduce((sum, item) => sum + Number(item.expense || 0), 0)
    const incomeCount = trendChartData.reduce((sum, item) => sum + Number(item.incomeCount || 0), 0)
    const expenseCount = trendChartData.reduce((sum, item) => sum + Number(item.expenseCount || 0), 0)
    const totalNet = totalIncome - totalExpense
    const avgNet = trendChartData.length ? totalNet / trendChartData.length : 0
    const profitMargin = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0
    return {
      totalIncome,
      totalExpense,
      incomeCount,
      expenseCount,
      avgIncomePerPayment: incomeCount ? totalIncome / incomeCount : 0,
      avgExpensePerRecord: expenseCount ? totalExpense / expenseCount : 0,
      totalNet,
      avgNet,
      profitMargin,
      periodCount: trendChartData.length,
    }
  }, [trendChartData])

  const occupancyTrendChartData = useMemo(() => {
    const formatLabel = occupancyTrend.granularity === 'day' ? formatTrendDay : formatTrendMonth
    return (occupancyTrend.trends || []).map((item) => ({ ...item, periodLabel: formatLabel(item.period) }))
  }, [occupancyTrend])

  const occupancyTrendSummary = useMemo(() => {
    const count = occupancyTrendChartData.length
    if (!count) {
      return {
        currentOccupied: 0,
        currentVacant: 0,
        totalRooms: 0,
        avgOccupied: 0,
        avgVacant: 0,
        avgRate: 0,
        moveIns: 0,
        moveOuts: 0,
        peakOccupied: 0,
        peakRate: 0,
        occupiedChange: 0,
        periodCount: 0,
      }
    }
    const latest = occupancyTrendChartData[count - 1]
    const totalOccupied = occupancyTrendChartData.reduce((sum, item) => sum + Number(item.occupied || 0), 0)
    const totalRooms = occupancyTrendChartData.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const moveIns = occupancyTrendChartData.reduce((sum, item) => sum + Number(item.moveIns || 0), 0)
    const moveOuts = occupancyTrendChartData.reduce((sum, item) => sum + Number(item.moveOuts || 0), 0)
    const peakOccupied = Math.max(...occupancyTrendChartData.map((item) => Number(item.occupied || 0)))
    const peakRate = Math.max(...occupancyTrendChartData.map((item) => {
      const capacity = Number(item.total || 0)
      return capacity > 0 ? (Number(item.occupied || 0) / capacity) * 100 : 0
    }))
    const firstOccupied = Number(occupancyTrendChartData[0].occupied || 0)
    return {
      currentOccupied: Number(latest.occupied || 0),
      currentVacant: Number(latest.vacant || 0),
      totalRooms: Number(latest.total || 0),
      avgOccupied: totalOccupied / count,
      avgVacant: occupancyTrendChartData.reduce((sum, item) => sum + Number(item.vacant || 0), 0) / count,
      avgRate: totalRooms > 0 ? (totalOccupied / totalRooms) * 100 : 0,
      moveIns,
      moveOuts,
      peakOccupied,
      peakRate,
      occupiedChange: Number(latest.occupied || 0) - firstOccupied,
      periodCount: count,
    }
  }, [occupancyTrendChartData])

  const occupancyComparisonRows = useMemo(
    () => occupancyTrendChartData.map((item, index) => {
      const occupied = Number(item.occupied || 0)
      const vacant = Number(item.vacant || 0)
      const total = Number(item.total || 0)
      const previousOccupied = index > 0 ? Number(occupancyTrendChartData[index - 1].occupied || 0) : null
      return {
        ...item,
        occupied,
        vacant,
        total,
        moveIns: Number(item.moveIns || 0),
        moveOuts: Number(item.moveOuts || 0),
        occupancyRate: total > 0 ? (occupied / total) * 100 : 0,
        change: previousOccupied === null ? null : occupied - previousOccupied,
      }
    }),
    [occupancyTrendChartData],
  )

  const currentOccupants = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.customer_id).sort(compareNewest('rental_start_date')),
    [roomStatus],
  )
  const occupantsTotalPages = Math.max(1, Math.ceil(currentOccupants.length / SUMMARY_PAGE_SIZE))
  const paginatedOccupants = useMemo(() => {
    const start = (occupantsPage - 1) * SUMMARY_PAGE_SIZE
    return currentOccupants.slice(start, start + SUMMARY_PAGE_SIZE)
  }, [currentOccupants, occupantsPage])

  const vacantRoomsList = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.status === 'vacant').sort(compareNewest('vacated_at')),
    [roomStatus],
  )
  const vacantRoomsTotalPages = Math.max(1, Math.ceil(vacantRoomsList.length / SUMMARY_PAGE_SIZE))
  const paginatedVacantRooms = useMemo(() => {
    const start = (vacantRoomsPage - 1) * SUMMARY_PAGE_SIZE
    return vacantRoomsList.slice(start, start + SUMMARY_PAGE_SIZE)
  }, [vacantRoomsList, vacantRoomsPage])

  const maintenanceRoomsList = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.status === 'maintenance').sort(compareNewest('maintenance_since')),
    [roomStatus],
  )
  const maintenanceRoomsTotalPages = Math.max(1, Math.ceil(maintenanceRoomsList.length / SUMMARY_PAGE_SIZE))
  const paginatedMaintenanceRooms = useMemo(() => {
    const start = (maintenanceRoomsPage - 1) * SUMMARY_PAGE_SIZE
    return maintenanceRoomsList.slice(start, start + SUMMARY_PAGE_SIZE)
  }, [maintenanceRoomsList, maintenanceRoomsPage])

  const occupancyPage = Number(occupancyLogs.page || 1)
  const totalOccupancyPages = Math.max(1, Math.ceil((Number(occupancyLogs.total) || 0) / (Number(occupancyLogs.pageSize) || 10)))

  const STAFF_PAGE_SIZE = 10
  const staffTotalPages = Math.max(1, Math.ceil(staffList.length / STAFF_PAGE_SIZE))
  const clampedStaffPage = Math.min(staffPage, staffTotalPages)
  const paginatedStaff = useMemo(() => {
    const start = (clampedStaffPage - 1) * STAFF_PAGE_SIZE
    return staffList.slice(start, start + STAFF_PAGE_SIZE)
  }, [staffList, clampedStaffPage])

  const roomListItems = useMemo(() => {
    if (displayRoomListFilter === 'occupied') return (roomStatus.rooms || []).filter((room) => room.is_booked)
    if (displayRoomListFilter === 'vacant') return (roomStatus.rooms || []).filter((room) => room.status === 'vacant')
    if (displayRoomListFilter === 'maintenance') return (roomStatus.rooms || []).filter((room) => room.status === 'maintenance')
    if (displayRoomListFilter === 'overdue') return (roomStatus.rooms || []).filter((room) => room.status === 'overdue')
    if (displayRoomListFilter === 'all') return roomStatus.rooms || []
    return []
  }, [displayRoomListFilter, roomStatus.rooms])

  const roomListKeyword = roomListSearch.trim().toLowerCase()
  const visibleRoomListItems = roomListKeyword
    ? roomListItems.filter((room) =>
        [String(room.room_number), `${room.first_name || ''} ${room.last_name || ''}`, room.phone, ROOM_STATUS_LABELS[room.status]]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(roomListKeyword),
      )
    : roomListItems

  const openRoomList = (filterKey) => {
    setRoomListSearch('')
    setRoomListFilter(filterKey)
  }

  const sortedRooms = useMemo(
    () => (roomStatus.rooms || []).slice().sort((a, b) => a.room_number - b.room_number),
    [roomStatus.rooms],
  )

  const roomListCounts = useMemo(() => {
    const rooms = roomStatus.rooms || []
    const countBy = (status) => rooms.filter((room) => room.status === status).length
    return {
      all: rooms.length,
      occupied: rooms.filter((room) => room.is_booked).length,
      overdue: countBy('overdue'),
      vacant: countBy('vacant'),
      maintenance: countBy('maintenance'),
    }
  }, [roomStatus.rooms])

  const roomStatusBreakdown = useMemo(
    () => [
      { key: 'occupied', label: 'มีผู้เช่า (ชำระปกติ)', count: (roomStatus.rooms || []).filter((room) => room.status === 'occupied').length, color: ROOM_STATUS_COLORS.occupied, filter: 'occupied' },
      { key: 'overdue', label: 'ค้างชำระ', count: roomListCounts.overdue, color: ROOM_STATUS_COLORS.overdue, filter: 'overdue' },
      { key: 'vacant', label: 'ห้องว่าง', count: roomListCounts.vacant, color: ROOM_STATUS_COLORS.vacant, filter: 'vacant' },
      { key: 'maintenance', label: 'ซ่อมบำรุง', count: roomListCounts.maintenance, color: ROOM_STATUS_COLORS.maintenance, filter: 'maintenance' },
    ],
    [roomStatus.rooms, roomListCounts],
  )
  const roomStatusTotal = roomStatusBreakdown.reduce((sum, item) => sum + item.count, 0)
  const mapRooms = roomMapFilter === 'all' ? sortedRooms : sortedRooms.filter((room) => (room.status || 'vacant') === roomMapFilter)
  const mapTotalPages = Math.max(1, Math.ceil(mapRooms.length / ROOM_MAP_PAGE_SIZE))
  const mapPage = Math.min(roomMapPage, mapTotalPages)
  const pagedMapRooms = mapRooms.slice((mapPage - 1) * ROOM_MAP_PAGE_SIZE, mapPage * ROOM_MAP_PAGE_SIZE)

  const roomOccupancyStats = useMemo(() => {
    const source = occupancySummary || roomStatus
    const total = Math.max(1, Number(source?.total ?? source?.totalRooms) || 0)
    const occupied = Number(source?.occupied ?? source?.occupiedCount) || 0
    const vacant = Number(source?.vacant ?? source?.vacantCount) || 0
    return {
      total,
      occupied,
      vacant,
      occupancyRate: Math.min(100, Math.round((occupied / total) * 100)),
    }
  }, [roomStatus, occupancySummary])

  const overdueRoomsCount = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.status === 'overdue').length,
    [roomStatus],
  )
  const maintenanceRoomsCount = maintenanceRoomsList.length

  const statCards = useMemo(() => {
    const periodOverdueCount = overview?.rooms?.overdueRoomsCount ?? overdueRoomsCount
    const periodMaintenanceCount = overview?.rooms?.maintenanceRoomsCount ?? maintenanceRoomsCount
    return [
      {
        label: 'ห้องทั้งหมด',
        value: overview?.rooms?.totalRooms ?? roomStatus?.totalRooms ?? 0,
        subtitle: `${roomStatus?.occupiedCount ?? 0} มีผู้เช่า / ${roomStatus?.vacantCount ?? 0} ว่าง`,
        tone: 'blue',
        icon: 'rooms',
      },
      {
        label: 'อัตราการเข้าพัก',
        value: `${roomOccupancyStats.occupancyRate}%`,
        subtitle: `จาก ${roomOccupancyStats.total} ห้องทั้งหมด`,
        tone: 'purple',
        icon: 'margin',
      },
      {
        label: 'ห้องค้างชำระ',
        value: periodOverdueCount,
        subtitle: 'ยังไม่ชำระในช่วงเวลาที่เลือก',
        tone: periodOverdueCount > 0 ? 'red' : 'green',
        icon: 'overdue',
      },
      {
        label: 'ห้องซ่อมบำรุง',
        value: periodMaintenanceCount,
        subtitle: 'แจ้งซ่อมในช่วงเวลาที่เลือก',
        tone: periodMaintenanceCount > 0 ? 'orange' : 'green',
        icon: 'maintenance',
      },
    ]
  }, [overview, roomStatus, roomOccupancyStats, overdueRoomsCount, maintenanceRoomsCount])

  const roomDetailBalance = useMemo(() => {
    if (!displayRoomDetail?.tenant) return null
    const rent = Number(displayRoomDetail.room?.price) || 0
    const unpaidUtilities = (displayRoomDetail.payments || [])
      .filter((payment) => payment.status !== 'paid' && (payment.type === 'water' || payment.type === 'electricity'))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const deposit = Number(displayRoomDetail.tenant.deposit_amount) || 0
    const totalDue = rent + unpaidUtilities
    return { rent, unpaidUtilities, deposit, totalDue, netBalance: totalDue - deposit }
  }, [displayRoomDetail])

  const PAYMENT_HISTORY_PAGE_SIZE = 5
  const paymentHistoryTotalPages = Math.max(1, Math.ceil((displayRoomDetail?.payments?.length || 0) / PAYMENT_HISTORY_PAGE_SIZE))
  const paginatedPaymentHistory = useMemo(() => {
    const start = (paymentHistoryPage - 1) * PAYMENT_HISTORY_PAGE_SIZE
    return (displayRoomDetail?.payments || []).slice(start, start + PAYMENT_HISTORY_PAGE_SIZE)
  }, [displayRoomDetail, paymentHistoryPage])

  const openPaymentSlip = (payment) => {
    setPaymentSlipZoomOpen(false)
    setViewingPaymentSlip(payment)
  }

  const closePaymentSlip = () => {
    setPaymentSlipZoomOpen(false)
    setViewingPaymentSlip(null)
  }

  const setMessage = (type, message) => {
    setNotice({ type, message })
    window.setTimeout(() => {
      setNotice((prev) => (prev.message === message ? { type: '', message: '' } : prev))
    }, 3500)
  }

  const loadOverview = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    const { data } = await axios.get('/api/owner/overview', {
      headers: getAuthHeaders(),
      params: { from: nextFilters.from || undefined, to: nextFilters.to || undefined },
    })
    setOverview(data)
  }

  const loadRoomStatus = async () => {
    const { data } = await axios.get('/api/owner/rooms/status', { headers: getAuthHeaders() })
    setRoomStatus(data)
  }

  const loadOccupancySummary = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    setIsOccupancySummaryLoading(true)
    try {
      const { data } = await axios.get('/api/owner/rooms/occupancy-summary', {
        headers: getAuthHeaders(),
        params: { from: nextFilters.from || undefined, to: nextFilters.to || undefined },
      })
      setOccupancySummary(data)
    } finally {
      setIsOccupancySummaryLoading(false)
    }
  }

  const loadIncome = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    const { data } = await axios.get('/api/owner/income', {
      headers: getAuthHeaders(),
      params: {
        month: nextFilters.month || selectedPeriod.month,
        year: nextFilters.year || selectedPeriod.year,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
      },
    })
    setIncomeSummary(data)
    setIncomeTypePage(1)
  }

  const loadExpenses = async (page = expenses.page || 1, overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    const { data } = await axios.get('/api/owner/expenses', {
      headers: getAuthHeaders(),
      params: { page, from: nextFilters.from || undefined, to: nextFilters.to || undefined },
    })
    setExpenses(data)
    setExpenseCategoryPage(1)
  }

  const openExpenseEdit = (expense) => {
    setExpenseEditForm({
      category: expense.category || '',
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      expense_date: (expense.expense_date || '').slice(0, 10),
    })
    setExpenseEditFormError('')
    setExpenseEditModal(expense)
  }

  const submitExpenseEdit = async (event, requestClose) => {
    event.preventDefault()
    if (!expenseEditForm.category.trim()) {
      setExpenseEditFormError('กรุณาระบุหมวดหมู่รายจ่าย')
      return
    }
    const amountValue = Number(expenseEditForm.amount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setExpenseEditFormError('กรุณาระบุจำนวนเงินให้ถูกต้อง')
      return
    }
    if (!expenseEditForm.expense_date) {
      setExpenseEditFormError('กรุณาระบุวันที่')
      return
    }

    setIsExpenseEditSubmitting(true)
    setExpenseEditFormError('')
    try {
      await axios.put(
        `/api/owner/expenses/${expenseEditModal.id}`,
        {
          category: expenseEditForm.category.trim(),
          description: expenseEditForm.description.trim() || null,
          amount: amountValue,
          expense_date: expenseEditForm.expense_date,
        },
        { headers: getAuthHeaders() },
      )
      setMessage('success', 'แก้ไขรายจ่ายสำเร็จ')
      requestClose()
      await loadExpenses(financeExpensePage)
    } catch (error) {
      setExpenseEditFormError(error.response?.data?.message || 'ไม่สามารถแก้ไขรายจ่ายได้')
    } finally {
      setIsExpenseEditSubmitting(false)
    }
  }

  const confirmDeleteExpenseRecord = async (requestClose) => {
    try {
      await axios.delete(`/api/owner/expenses/${expenseDeleteConfirm.id}`, { headers: getAuthHeaders() })
      setMessage('success', 'ลบรายจ่ายสำเร็จ')
      requestClose()
      await loadExpenses(financeExpensePage)
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถลบรายจ่ายได้')
    }
  }

  const loadTrends = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    setIsTrendsLoading(true)
    try {
      const { data } = await axios.get('/api/owner/trends', {
        headers: getAuthHeaders(),
        params: { from: nextFilters.from || undefined, to: nextFilters.to || undefined },
      })
      setFinanceTrends(data)
    } finally {
      setIsTrendsLoading(false)
    }
  }

  const loadOccupancyTrend = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    setIsOccupancyTrendLoading(true)
    try {
      const { data } = await axios.get('/api/owner/rooms/occupancy-trend', {
        headers: getAuthHeaders(),
        params: { from: nextFilters.from || undefined, to: nextFilters.to || undefined },
      })
      setOccupancyTrend(data)
    } finally {
      setIsOccupancyTrendLoading(false)
    }
  }

   const loadStaff = async () => {
    const { data } = await axios.get('/api/owner/staff', { headers: getAuthHeaders() })
    setStaffList(data.staff || [])
  }

  const loadUtilities = async () => {
    const [year, month] = utilityMonth.split('-')
    const { data } = await axios.get('/api/owner/utilities', {
      headers: getAuthHeaders(),
      params: { year, month },
    })
    setUtilities({ summary: data.summary || {}, rooms: data.rooms || [] })
  }

  const loadPaymentLogs = async (page = paymentLogs.page || 1, overrides = {}) => {
    const nextFilters = { ...paymentLogFilter, ...overrides }
    const { data } = await axios.get('/api/owner/logs/payments', {
      headers: getAuthHeaders(),
      params: {
        page,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
        search: nextFilters.search || undefined,
        onlyOverdue: nextFilters.onlyOverdue ? 'true' : undefined,
      },
    })
    setPaymentLogs({ ...data, payments: data.payments || [] })
  }

  const loadPendingSlipReviews = async () => {
    const { data } = await axios.get('/api/staff/payment-verifications', { headers: getAuthHeaders() })
    setPendingSlipReviews(data.payments || [])
  }

  const reviewOwnerPaymentSlip = async (payment, decision) => {
    const paymentId = payment.payment_id ?? payment.id
    const action = decision === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'
    const confirmed = await askConfirm({
      tone: decision === 'approved' ? 'success' : 'danger',
      title: `${action}สลิปการชำระเงิน`,
      message: decision === 'approved' ? 'ยืนยันว่าตรวจสอบสลิปแล้วและยอดเงินถูกต้อง' : 'สลิปนี้จะถูกปฏิเสธและผู้เช่าต้องส่งหลักฐานใหม่',
      details: [
        ['ห้อง', payment.room_number ? `ห้อง ${payment.room_number}` : '-'],
        ['ยอดเงิน', `฿${formatCurrency(payment.amount)}`],
      ],
      confirmLabel: `${action}สลิป`,
    })
    if (!confirmed) return false
    setReviewingSlipId(paymentId)
    try {
      const { data } = await axios.patch(
        `/api/staff/payment-verifications/${paymentId}`,
        { decision },
        { headers: getAuthHeaders() },
      )
      setMessage('success', data.message || `บันทึกผลการ${action}สลิปแล้ว`)
      await Promise.all([loadPendingSlipReviews(), loadPaymentLogs(paymentLogs.page || 1)])
      const roomNumber = displayRoomDetail?.room?.room_number
      if (roomNumber) {
        const { data: roomData } = await axios.get(`/api/owner/rooms/${roomNumber}`, { headers: getAuthHeaders() })
        setRoomDetail(roomData)
      }
      return true
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่')
      return false
    } finally {
      setReviewingSlipId(null)
    }
  }

  const loadOccupancyLogs = async (page = occupancyLogs.page || 1, overrides = {}) => {
    const nextFilters = { search: occupancyFilter.search, type: occupancyFilter.type, from: paymentFilter.from, to: paymentFilter.to, ...overrides }
    const { data } = await axios.get('/api/owner/logs/occupancy', {
      headers: getAuthHeaders(),
      params: {
        page,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
        search: nextFilters.search || undefined,
        type: nextFilters.type && nextFilters.type !== 'all' ? nextFilters.type : undefined,
      },
    })
    setOccupancyLogs(data)
  }

  const openOccupancyPeriodDetail = async (item) => {
    const isDaily = occupancyTrend.granularity === 'day'
    const from = isDaily ? item.period : `${item.period}-01`
    const endDate = isDaily ? new Date(`${item.period}T00:00:00`) : new Date(`${item.period}-01T00:00:00`)
    if (!isDaily) endDate.setMonth(endDate.getMonth() + 1, 0)
    const to = isDaily ? item.period : `${item.period}-${String(endDate.getDate()).padStart(2, '0')}`
    setOccupancyPeriodDetail({ item, logs: [], loading: true })
    try {
      const params = { from, to, page: 1 }
      const { data: firstPage } = await axios.get('/api/owner/logs/occupancy', { headers: getAuthHeaders(), params })
      const pageCount = Math.ceil((Number(firstPage.total) || 0) / (Number(firstPage.pageSize) || 10))
      const otherPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
        axios.get('/api/owner/logs/occupancy', { headers: getAuthHeaders(), params: { ...params, page: index + 2 } }),
      ))
      const logs = [...(firstPage.logs || []), ...otherPages.flatMap((response) => response.data.logs || [])]
      setOccupancyPeriodDetail({ item, logs, loading: false })
    } catch (error) {
      setOccupancyPeriodDetail({ item, logs: [], loading: false })
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดช่วงเวลาได้')
    }
  }

  const handleRoomClick = async (room) => {
    setRoomDetailOpenedAt(new Date().getTime())
    setRoomDetail({ room, tenant: null, payments: [] })
    setPaymentHistoryPage(1)
    setIsRoomDetailLoading(true)
    try {
      const [{ data }, historyResponse] = await Promise.all([
        axios.get(`/api/owner/rooms/${room.room_number}`, { headers: getAuthHeaders() }),
        axios.get(`/api/staff/rooms/${room.room_number}/history`, { headers: getAuthHeaders() }).catch(() => null),
      ])
      const historicalPayments = (historyResponse?.data?.rentalHistory || []).flatMap((booking) =>
        (booking.payments || []).map((payment) => ({
          ...payment,
          tenantName: `${booking.first_name || ''} ${booking.last_name || ''}`.trim(),
        })),
      )
      setRoomDetail({ ...data, payments: historicalPayments.length ? historicalPayments : data.payments || [] })
    } catch (error) {
      setRoomDetail(null)
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดห้องได้')
    } finally {
      setIsRoomDetailLoading(false)
    }
  }

  const getGroupLoaders = (filters) => ({
    roomStatus: () => loadRoomStatus(),
    overview: () => loadOverview(filters),
    roomsOverview: () => loadOccupancySummary(filters),
    roomsOccupancy: () => loadOccupancyTrend(filters),
    roomsLogs: () => loadOccupancyLogs(1, { from: filters.from, to: filters.to }),
    finance: () => Promise.all([loadIncome(filters), loadExpenses(1, filters), loadTrends(filters), loadPaymentLogs(1), loadPendingSlipReviews()]),
    staff: () => loadStaff(),
  })

  const ensureDataGroups = (groups, { force = false, filters = paymentFilter } = {}) => {
    const loaders = getGroupLoaders(filters)
    groups.forEach((group) => {
      if (!loaders[group] || dataGroupsInflightRef.current.has(group)) return
      if (!force && dataGroupsLoadedRef.current.has(group)) return
      dataGroupsInflightRef.current.add(group)
      loaders[group]()
        .then(() => {
          dataGroupsLoadedRef.current.add(group)
          setLoadedDataGroups(new Set(dataGroupsLoadedRef.current))
        })
        .catch((error) => {
          dataGroupsLoadedRef.current.add(group)
          setLoadedDataGroups(new Set(dataGroupsLoadedRef.current))
          setMessage('danger', error.response?.data?.message || 'ไม่สามารถโหลดข้อมูลหอพักได้')
        })
        .finally(() => {
          dataGroupsInflightRef.current.delete(group)
        })
    })
  }

  const neededDataGroups = getNeededDataGroups(activeTab, roomsSection)
  const isLoading = neededDataGroups.some((group) => !loadedDataGroups.has(group))

  useEffect(() => {
    ensureDataGroups(getNeededDataGroups(activeTab, roomsSection))
  }, [activeTab, roomsSection])

  useEffect(() => {
    if (activeTab !== 'utilities') return

    loadUtilities().catch((error) => {
      setMessage('danger', error.response?.data?.message || 'โหลดข้อมูลค่าน้ำ-ค่าไฟไม่สำเร็จ')
    })
  }, [activeTab, utilityMonth])

  useEffect(() => {
    const isModalOpen = Boolean(displayRoomDetail) || Boolean(displayRoomListFilter) || displayStaffModalOpen || Boolean(displayViewingStaff)
    if (!isModalOpen) return undefined

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }, [displayRoomDetail, displayRoomListFilter, displayStaffModalOpen, displayViewingStaff])

  const handlePaymentLogFilterChange = async (field, value) => {
    const nextFilters = { ...paymentLogFilter, [field]: value }
    setPaymentLogFilter(nextFilters)
    try {
      await loadPaymentLogs(1, nextFilters)
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลการชำระเงินได้')
    }
  }

  const handlePaymentRangeChange = (field, value) => {
    const nextFilters = { ...paymentFilter, [field]: value || '' }
    setPaymentFilter(nextFilters)
    const visibleGroups = getNeededDataGroups(activeTab, roomsSection).filter((group) => DATE_DEPENDENT_GROUPS.includes(group))
    DATE_DEPENDENT_GROUPS.filter((group) => !visibleGroups.includes(group)).forEach((group) => dataGroupsLoadedRef.current.delete(group))
    setLoadedDataGroups(new Set(dataGroupsLoadedRef.current))
    ensureDataGroups(visibleGroups, { force: true, filters: nextFilters })
  }

  const handleOccupancyFilterChange = async (field, value) => {
    const nextFilters = { ...occupancyFilter, [field]: value }
    setOccupancyFilter(nextFilters)
    try {
      await loadOccupancyLogs(1, nextFilters)
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลการเข้าพักได้')
    }
  }

  const validateStaffForm = (isEdit) => {
    const errors = {}
    if (!isEdit && !/^\d{13}$/.test(staffForm.idcard.trim())) errors.idcard = 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'
    if (!/^0\d{8,9}$/.test(staffForm.phone.trim())) errors.phone = 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก'
    if (!isEdit || staffForm.password) {
      if ((staffForm.password || '').length < 6) errors.password = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
    }
    if (!staffForm.age || Number(staffForm.age) < 1 || Number(staffForm.age) > 120) errors.age = 'กรุณาระบุอายุ 1-120 ปี'
    setStaffErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleStaffSubmit = async (event) => {
    event.preventDefault()
    const isEdit = Boolean(editingStaff)
    if (!validateStaffForm(isEdit)) return
    setIsSubmittingStaff(true)
    try {
      if (isEdit) {
        const payload = {
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          phone: staffForm.phone,
          age: staffForm.age,
        }
        if (staffForm.password) payload.password = staffForm.password
        await axios.put(`/api/owner/staff/${editingStaff.role}/${editingStaff.id}`, payload, { headers: getAuthHeaders() })
        setMessage('success', 'แก้ไขข้อมูลพนักงานสำเร็จ')
      } else {
        await axios.post('/api/owner/staff', staffForm, { headers: getAuthHeaders() })
        setMessage('success', 'เพิ่มพนักงานสำเร็จ')
      }

      setStaffForm(EMPTY_STAFF)
      setStaffErrors({})
      setIsStaffModalOpen(false)
      setEditingStaff(null)
      await loadStaff()
    } catch (error) {
      setMessage('danger', error.response?.data?.message || (isEdit ? 'ไม่สามารถแก้ไขข้อมูลพนักงานได้' : 'ไม่สามารถเพิ่มพนักงานได้'))
    } finally {
      setIsSubmittingStaff(false)
    }
  }

  const openStaffModal = () => {
    setEditingStaff(null)
    setStaffForm(EMPTY_STAFF)
    setStaffErrors({})
    setShowPassword(false)
    setIsStaffModalOpen(true)
  }

  const openStaffEditModal = (staffMember) => {
    setEditingStaff({ role: staffMember.role, id: staffMember.id })
    setStaffForm({
      role: staffMember.role,
      idcard: staffMember.idcard || '',
      password: '',
      phone: staffMember.phone || '',
      first_name: staffMember.first_name || '',
      last_name: staffMember.last_name || '',
      age: staffMember.age || '',
    })
    setStaffErrors({})
    setShowPassword(false)
    setIsStaffModalOpen(true)
  }

  const closeStaffModal = () => {
    setIsStaffModalOpen(false)
    setEditingStaff(null)
    setStaffErrors({})
  }

  const toggleStaffStatus = async (staffMember) => {
    try {
      const action = staffMember.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'
      await axios.patch(
        `/api/owner/staff/${staffMember.role}/${staffMember.id}/suspend`,
        { is_suspended: !staffMember.is_suspended },
        { headers: getAuthHeaders() },
      )
      setMessage('success', `${action} สำเร็จ`)
      await loadStaff()
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถเปลี่ยนสถานะได้')
    }
  }

  const deleteStaffMember = async (staffMember) => {
    const confirmed = await askConfirm({
      tone: 'danger',
      title: 'ลบพนักงาน',
      message: 'ข้อมูลพนักงานจะถูกลบออกจากระบบและไม่สามารถกู้คืนได้',
      details: [
        ['ชื่อ', `${staffMember.first_name || ''} ${staffMember.last_name || ''}`.trim() || '-'],
        ['ตำแหน่ง', staffMember.role || '-'],
      ],
      confirmLabel: 'ลบพนักงาน',
    })
    if (!confirmed) return
    try {
      await axios.delete(`/api/owner/staff/${staffMember.role}/${staffMember.id}`, { headers: getAuthHeaders() })
      setMessage('success', 'ลบพนักงานสำเร็จ')
      await loadStaff()
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถลบพนักงานได้')
    }
  }

  const handleLogout = () => {
    sessionStorage.clear()
    navigate('/login')
  }

  const paymentPage = Number(paymentLogs.page || 1)
  const totalPaymentPages = Math.max(1, Math.ceil((Number(paymentLogs.total) || 0) / (Number(paymentLogs.pageSize) || 20)))
  const notifications = announcements.map(buildOwnerAnnouncementNotification)
  const newNotifications = notifications.filter((item) => !seenNotificationKeys.includes(item.key))
  const notificationPageSize = 30
  const notificationPages = Math.max(1, Math.ceil(notifications.length / notificationPageSize))
  const notificationPage = Math.min(notifPage, notificationPages)
  const visibleNotifications = notifications.slice((notificationPage - 1) * notificationPageSize, notificationPage * notificationPageSize)
  const markNotificationsRead = () => {
    const keys = notifications.map((item) => item.key)
    setFreshNotificationKeys(new Set(newNotifications.map((item) => item.key)))
    setSeenNotificationKeys(keys)
    localStorage.setItem(getOwnerNotificationStorageKey(), JSON.stringify(keys))
  }
  const ownerSummaryTiles = {
    rooms: roomsSection === 'occupancy'
      ? [
          { key: 'occupants', tone: 'blue', icon: 'rooms', label: 'ผู้เข้าพักปัจจุบัน', value: `${currentOccupants.length} คน`, hint: 'ผู้เช่าที่พักอยู่ตอนนี้' },
          { key: 'avg-rate', tone: 'purple', icon: 'margin', label: 'อัตราเข้าพักเฉลี่ย', value: `${occupancyTrendSummary.avgRate.toFixed(1)}%`, hint: `เฉลี่ยจาก ${occupancyTrendSummary.periodCount} ช่วงเวลา` },
          { key: 'peak', tone: 'orange', icon: 'profit', label: 'ผู้พักสูงสุด', value: `${occupancyTrendSummary.peakOccupied} ห้อง`, hint: `อัตราสูงสุด ${occupancyTrendSummary.peakRate.toFixed(1)}%` },
          {
            key: 'net-move',
            tone: occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts < 0 ? 'red' : 'green',
            icon: 'income',
            label: 'ย้ายเข้า – ย้ายออก',
            value: `${occupancyTrendSummary.moveIns} / ${occupancyTrendSummary.moveOuts}`,
            hint: `สุทธิ ${occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts >= 0 ? '+' : ''}${occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts} ในช่วงที่เลือก`,
          },
        ]
      : roomsSection === 'logs'
        ? [
            { key: 'log-total', tone: 'blue', icon: 'rooms', label: 'รายการทั้งหมด', value: `${(occupancyLogs.summary?.moveIns || 0) + (occupancyLogs.summary?.moveOuts || 0)} รายการ`, hint: 'ตามช่วงวันที่และคำค้นหา' },
            { key: 'log-in', tone: 'green', icon: 'income', label: 'ย้ายเข้า', value: `${occupancyLogs.summary?.moveIns || 0} ครั้ง`, hint: 'การจองห้องใหม่' },
            { key: 'log-out', tone: 'orange', icon: 'expense', label: 'ย้ายออก', value: `${occupancyLogs.summary?.moveOuts || 0} ครั้ง`, hint: 'คำขอย้ายออกที่อนุมัติแล้ว' },
            {
              key: 'log-net',
              tone: (occupancyLogs.summary?.moveIns || 0) - (occupancyLogs.summary?.moveOuts || 0) < 0 ? 'red' : 'purple',
              icon: 'margin',
              label: 'ผลต่างสุทธิ',
              value: `${(occupancyLogs.summary?.moveIns || 0) - (occupancyLogs.summary?.moveOuts || 0) >= 0 ? '+' : ''}${(occupancyLogs.summary?.moveIns || 0) - (occupancyLogs.summary?.moveOuts || 0)}`,
              hint: 'ย้ายเข้าหักย้ายออก',
            },
          ]
        : statCards.map((card) => ({ key: card.label, icon: card.icon, label: card.label, value: card.value, hint: card.subtitle, tone: card.tone })),
    finance: [
      { key: 'income', tone: 'blue', icon: 'income', label: 'รายรับรวม', value: formatSignedCurrency(totalIncome), hint: 'รวมรายการชำระเงินที่สำเร็จตามช่วงที่เลือก' },
      { key: 'expense', tone: 'orange', icon: 'expense', label: 'รายจ่ายรวม', value: formatSignedCurrency(totalExpense), hint: 'รวมรายจ่ายทั้งหมดตามช่วงที่เลือก' },
      { key: 'net', tone: netProfit < 0 ? 'red' : 'green', icon: 'profit', label: netProfit < 0 ? 'ขาดทุนสุทธิ' : 'กำไรสุทธิ', value: formatSignedCurrency(netProfit), hint: 'รายรับ - รายจ่าย' },
      { key: 'margin', tone: netProfit < 0 ? 'red' : 'purple', icon: 'margin', label: 'อัตรากำไร', value: formatPercent(profitMargin), hint: 'กำไรสุทธิเทียบกับรายรับรวม' },
    ],
    utilities: [
      { key: 'water', tone: 'blue', icon: 'water', label: 'ค่าน้ำรวม', value: `฿${formatCurrency(utilities.summary.waterTotal)}`, hint: `${utilities.summary.waterUnits ?? 0} หน่วย` },
      { key: 'electricity', tone: 'orange', icon: 'electricity', label: 'ค่าไฟรวม', value: `฿${formatCurrency(utilities.summary.electricityTotal)}`, hint: `${utilities.summary.electricityUnits ?? 0} หน่วย` },
      { key: 'unpaid', tone: 'red', icon: 'overdue', label: 'ค้างชำระ', value: `฿${formatCurrency(utilities.summary.unpaidTotal)}`, hint: 'ค่าน้ำ-ค่าไฟที่ยังไม่ชำระ' },
      { key: 'rooms', tone: 'purple', icon: 'rooms', label: 'จำนวนห้อง', value: utilities.rooms.length, hint: 'ห้องที่มีข้อมูล' },
    ],
  }[activeTab]

  const closeNotifPanel = () => setNotifClosing(true)

  const openNotification = (notification) => {
    setActiveTab('announcements')
    setAnnouncementFocus((current) => ({ id: notification.announcementId, nonce: (current?.nonce || 0) + 1 }))
    closeNotifPanel()
  }

  return (
    <div className="owner-page">
      <div className="owner-container">
        <header className="owner-header">
          <div className="owner-title-group">
            <div className="auth-icon owner-building-icon" aria-hidden="true" />
            <div>
              <h1>Owner Dashboard</h1>
              <p>ระบบจัดการหอพักและการเงินรายวัน</p>
            </div>
          </div>

          <div className="owner-header-actions">
            <div className="staff-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="staff-notif-btn"
                aria-label="การแจ้งเตือน"
                aria-expanded={notifOpen}
                onClick={() => {
                  if (notifOpen) closeNotifPanel()
                  else {
                    markNotificationsRead()
                    setNotifOpen(true)
                    setNotifPage(1)
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {newNotifications.length > 0 && <span className="staff-notif-dot">{newNotifications.length > 99 ? '99+' : newNotifications.length}</span>}
              </button>
              {notifOpen && (
                <div
                  className={`staff-notif-panel${notifClosing ? ' is-closing' : ''}`}
                  onAnimationEnd={() => {
                    if (notifClosing) {
                      setNotifOpen(false)
                      setNotifClosing(false)
                    }
                  }}
                >
                  <div className="staff-notif-panel-header">
                    <span className="staff-notif-panel-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      การแจ้งเตือน
                      {notifications.length > 0 && <span className="staff-notif-count">{notifications.length}</span>}
                    </span>
                    <button type="button" className="staff-notif-panel-close" onClick={closeNotifPanel} aria-label="ปิด">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="staff-notif-empty">
                      <span className="staff-notif-empty-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                      </span>
                      ยังไม่มีการแจ้งเตือน
                    </div>
                  ) : (
                    <>
                      <div className="staff-notif-list" ref={notifListRef}>
                        {visibleNotifications.map((notification) => (
                          <button
                            type="button"
                            key={notification.key}
                            className={`staff-notif-item is-${notification.tone}${freshNotificationKeys.has(notification.key) ? ' is-new' : ''}`}
                            onClick={() => openNotification(notification)}
                          >
                            <span className="staff-notif-item-icon">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m3 11 18-5v12L3 14v-3z" />
                                <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                              </svg>
                            </span>
                            <span className="staff-notif-item-main">
                              <span className="staff-notif-item-head">
                                <span className="staff-notif-item-title">
                                  {freshNotificationKeys.has(notification.key) && <span className="staff-notif-item-new">ใหม่</span>}
                                  {notification.title}
                                </span>
                                <time className="staff-notif-item-date">
                                  {notification.date ? new Date(notification.date).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                                </time>
                              </span>
                              <span className="staff-notif-item-status">{notification.label}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                      {notificationPages > 1 && (
                        <div className="staff-notif-pagination">
                          <span className="staff-notif-page-info">
                            {(notificationPage - 1) * notificationPageSize + 1}–
                            {Math.min(notificationPage * notificationPageSize, notifications.length)} จาก {notifications.length}
                          </span>
                          <div className="staff-notif-page-nav">
                            <button
                              type="button"
                              className="staff-notif-page-btn"
                              aria-label="หน้าก่อนหน้า"
                              disabled={notificationPage <= 1}
                              onClick={() => {
                                setNotifPage(Math.max(1, notificationPage - 1))
                                notifListRef.current?.scrollTo({ top: 0 })
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M15 18l-6-6 6-6" />
                              </svg>
                            </button>
                            <span className="staff-notif-page-current">
                              {notificationPage} / {notificationPages}
                            </span>
                            <button
                              type="button"
                              className="staff-notif-page-btn"
                              aria-label="หน้าถัดไป"
                              disabled={notificationPage >= notificationPages}
                              onClick={() => {
                                setNotifPage(Math.min(notificationPages, notificationPage + 1))
                                notifListRef.current?.scrollTo({ top: 0 })
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <button type="button" className="owner-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </header>

        {activeTab !== 'dorm-info' && (
          <section className="owner-period-bar">
            <div className="owner-period-text">
              <h2>{(OWNER_PERIOD_BAR_CONTENT[activeTab] || OWNER_PERIOD_BAR_CONTENT.rooms).title}</h2>
              <p>{(OWNER_PERIOD_BAR_CONTENT[activeTab] || OWNER_PERIOD_BAR_CONTENT.rooms).subtitle}</p>
            </div>
            {(activeTab === 'rooms' || activeTab === 'finance') && (
              <span className="owner-period-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 10h18" />
                </svg>
                <span>
                  <small>ข้อมูลประจำเดือน</small>
                  {THAI_MONTHS[selectedPeriod.month - 1]} {selectedPeriod.year + 543}
                </span>
              </span>
            )}
          </section>
        )}

        {notice.message && (
          <div className={`owner-alert owner-alert-${notice.type}`}>{notice.message}</div>
        )}

        {!isLoading && ownerSummaryTiles && (
          <section className="staff-summary-tiles owner-stat-tiles">
            {ownerSummaryTiles.map(({ key, ...tile }) => (
              <OwnerStatTile key={key} {...tile} />
            ))}
          </section>
        )}

        <ul className="nav nav-tabs owner-tabs">
          {OWNER_TABS.map((tab) => (
            <li className="nav-item" key={tab.key}>
              <button
                type="button"
                className={`nav-link owner-tab-link${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>

        {(activeTab === 'rooms' || activeTab === 'finance') && (
          <div className="owner-section-toolbar">
            {activeTab === 'rooms' && (
              <ul className="nav staff-subtabs owner-subtabs" aria-label="หมวดหมู่สรุปห้อง">
                {OWNER_ROOMS_SECTIONS.map((section) => (
                  <li className="nav-item" key={section.key}>
                    <button
                      type="button"
                      className={`nav-link staff-subtab-link${roomsSection === section.key ? ' active' : ''}`}
                      aria-pressed={roomsSection === section.key}
                      onClick={() => setRoomsSection(section.key)}
                    >
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="owner-period-range">
              <span className="owner-period-range-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 10h18" />
                </svg>
              </span>
              <ThaiDatePicker
                value={paymentFilter.from}
                onChange={(value) => handlePaymentRangeChange('from', value)}
                maxDate={parseInputDate(paymentFilter.to)}
                placeholder="วันที่เริ่มต้น"
                isClearable
              />
              <span className="owner-period-range-sep" aria-hidden="true">–</span>
              <ThaiDatePicker
                value={paymentFilter.to}
                onChange={(value) => handlePaymentRangeChange('to', value)}
                minDate={parseInputDate(paymentFilter.from)}
                placeholder="วันที่สิ้นสุด"
                isClearable
              />
            </div>
          </div>
        )}

        {activeTab === 'dorm-info' && (
          <>
            <DormInfoSettings apiBase="/api/owner/dorm-info" />
            <OwnerPaymentSettings />
          </>
        )}

        {activeTab === 'parking' && (
          <StaffResidentVisitsTab rooms={(roomStatus.rooms || []).map((room) => ({ ...room, tenant: room.customer_id ? { id: room.customer_id, first_name: room.first_name, last_name: room.last_name } : null }))} />
        )}

        {activeTab === 'safety' && (
          <StaffSafetyTab rooms={(roomStatus.rooms || []).map((room) => ({ ...room, tenant: room.customer_id ? { id: room.customer_id, first_name: room.first_name, last_name: room.last_name } : null }))} showSummary />
        )}

        {isLoading && <div className="owner-loading-box">กำลังโหลดข้อมูล...</div>}

        {!isLoading && activeTab === 'rooms' && roomsSection === 'overview' && (
          <>
            <section className="owner-panel owner-ov-hero">
              <div className="owner-panel-header">
                <div>
                  <h3>ภาพรวมห้องพัก</h3>
                  <p className="owner-ov-caption">สถานะห้องทั้งหมด {roomOccupancyStats.total} ห้อง ณ ปัจจุบัน</p>
                </div>
                <button type="button" className="owner-ov-link" onClick={() => openRoomList('all')}>
                  ดูห้องทั้งหมด
                  <span aria-hidden="true">›</span>
                </button>
              </div>

              <div className="owner-ov-hero-body">
                <div className={`owner-ov-donut${isOccupancySummaryLoading ? ' is-loading' : ''}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={roomStatusBreakdown.some((item) => item.count > 0) ? roomStatusBreakdown : [{ key: 'empty', count: 1, color: '#e8eff9' }]}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="72%"
                        outerRadius="100%"
                        paddingAngle={roomStatusBreakdown.filter((item) => item.count > 0).length > 1 ? 2 : 0}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {(roomStatusBreakdown.some((item) => item.count > 0) ? roomStatusBreakdown : [{ key: 'empty', color: '#e8eff9' }]).map((item) => (
                          <Cell key={item.key} fill={item.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="owner-ov-donut-center">
                    <strong>{roomOccupancyStats.occupancyRate}%</strong>
                    <span>อัตราเข้าพัก</span>
                  </div>
                </div>

                <ul className="owner-ov-status-list">
                  {roomStatusBreakdown.map((item) => (
                    <li key={item.key}>
                      <button type="button" className="owner-ov-status" style={{ '--ov-tone': item.color }} onClick={() => openRoomList(item.filter)}>
                        <span className="owner-ov-status-dot" aria-hidden="true" />
                        <span className="owner-ov-status-text">
                          <span className="owner-ov-status-label">{item.label}</span>
                          <span className="owner-ov-status-bar" aria-hidden="true">
                            <span style={{ width: `${roomStatusTotal ? (item.count / roomStatusTotal) * 100 : 0}%` }} />
                          </span>
                        </span>
                        <strong className="owner-ov-status-count">
                          {item.count}
                          <small>ห้อง</small>
                        </strong>
                        <span className="owner-ov-status-arrow" aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="owner-ov-map">
                <div className="owner-ov-map-head">
                  <div className="owner-ov-map-title">
                    <span className="owner-ov-map-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                      </svg>
                    </span>
                    <div>
                      <strong>ผังห้องพัก</strong>
                      <small>คลิกที่ห้องเพื่อดูรายละเอียด</small>
                    </div>
                  </div>
                  <div className="owner-ov-map-legend" role="group" aria-label="กรองสถานะห้องในผัง">
                    {[{ key: 'all', label: 'ทั้งหมด', count: sortedRooms.length }, ...roomStatusBreakdown.map((item) => ({ key: item.key, label: ROOM_STATUS_LABELS[item.key], count: item.count }))].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`owner-ov-map-chip is-${item.key}${roomMapFilter === item.key ? ' active' : ''}`}
                        aria-pressed={roomMapFilter === item.key}
                        onClick={() => {
                          setRoomMapFilter(item.key)
                          setRoomMapPage(1)
                        }}
                      >
                        {item.key !== 'all' && <i aria-hidden="true" />}
                        {item.label}
                        <span>{item.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {mapRooms.length ? (
                  <div className="owner-ov-map-grid">
                    {pagedMapRooms.map((room) => {
                      const status = room.status || 'vacant'
                      const tenantName = `${room.first_name || ''} ${room.last_name || ''}`.trim()
                      return (
                        <button
                          key={room.room_number}
                          type="button"
                          className={`owner-ov-room is-${status}`}
                          onClick={() => handleRoomClick(room)}
                          title={`ห้อง ${room.room_number} · ${ROOM_STATUS_LABELS[status] || 'ว่าง'}`}
                        >
                          <span className="owner-ov-room-top">
                            <strong>{room.room_number}</strong>
                            <span className="owner-ov-room-icon" aria-hidden="true">
                              <StatIcon name={status === 'maintenance' ? 'maintenance' : status === 'overdue' ? 'overdue' : 'rooms'} />
                            </span>
                          </span>
                          <span className="owner-ov-room-name">
                            <small>{status === 'vacant' ? 'สถานะห้อง' : 'ผู้เช่า'}</small>
                            <strong>{tenantName || (status === 'vacant' ? 'พร้อมให้เช่า' : 'ไม่ระบุชื่อ')}</strong>
                          </span>
                          <span className="owner-ov-room-status">{ROOM_STATUS_LABELS[status] || 'ว่าง'}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="owner-ov-list-empty">{sortedRooms.length ? 'ไม่มีห้องในสถานะนี้' : 'ยังไม่มีข้อมูลห้องพัก'}</div>
                )}
                {mapTotalPages > 1 && (
                  <div className="owner-ov-map-footer">
                    <span>
                      แสดง {(mapPage - 1) * ROOM_MAP_PAGE_SIZE + 1}–{Math.min(mapPage * ROOM_MAP_PAGE_SIZE, mapRooms.length)} จาก {mapRooms.length} ห้อง
                    </span>
                    <div className="owner-pa-pager">
                      <button type="button" aria-label="หน้าก่อนหน้า" disabled={mapPage <= 1} onClick={() => setRoomMapPage(mapPage - 1)}>‹</button>
                      {Array.from({ length: mapTotalPages }, (_, index) => index + 1)
                        .filter((pageNumber) => pageNumber === 1 || pageNumber === mapTotalPages || Math.abs(pageNumber - mapPage) <= 1)
                        .map((pageNumber, index, pages) => (
                          <span key={pageNumber} className="owner-pa-pager-item">
                            {index > 0 && pageNumber - pages[index - 1] > 1 && <span className="owner-pa-pager-gap">…</span>}
                            <button
                              type="button"
                              className={pageNumber === mapPage ? 'active' : ''}
                              aria-current={pageNumber === mapPage ? 'page' : undefined}
                              onClick={() => setRoomMapPage(pageNumber)}
                            >
                              {pageNumber}
                            </button>
                          </span>
                        ))}
                      <button type="button" aria-label="หน้าถัดไป" disabled={mapPage >= mapTotalPages} onClick={() => setRoomMapPage(mapPage + 1)}>›</button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="owner-ov-lists">
              {[
                {
                  key: 'occupied',
                  title: 'ผู้เข้าพักปัจจุบัน',
                  caption: 'เข้าพักล่าสุดอยู่บนสุด',
                  icon: 'user',
                  unit: 'คน',
                  total: currentOccupants.length,
                  items: paginatedOccupants,
                  page: occupantsPage,
                  totalPages: occupantsTotalPages,
                  setPage: setOccupantsPage,
                  empty: 'ยังไม่มีผู้เข้าพัก',
                  primary: (room) => `${room.first_name || ''} ${room.last_name || ''}`.trim() || 'ไม่ระบุชื่อ',
                  secondary: (room) => `เข้าพัก ${formatDate(room.rental_start_date)}`,
                  side: (room) => room.phone || '-',
                  alert: (room) => (room.status === 'overdue' ? 'ค้างชำระ' : null),
                },
                {
                  key: 'vacant',
                  title: 'ห้องว่าง',
                  caption: 'ว่างล่าสุดอยู่บนสุด',
                  icon: 'door',
                  unit: 'ห้อง',
                  total: vacantRoomsList.length,
                  items: paginatedVacantRooms,
                  page: vacantRoomsPage,
                  totalPages: vacantRoomsTotalPages,
                  setPage: setVacantRoomsPage,
                  empty: 'ไม่มีห้องว่างในขณะนี้',
                  primary: () => 'พร้อมให้เช่า',
                  secondary: (room) => (room.vacated_at ? `ว่างตั้งแต่ ${formatDate(room.vacated_at)}` : 'ยังไม่เคยมีผู้เช่า'),
                  side: (room) => `฿${formatCurrency(room.price)}`,
                  alert: () => null,
                },
                {
                  key: 'maintenance',
                  title: 'ห้องที่กำลังซ่อม',
                  caption: 'แจ้งซ่อมล่าสุดอยู่บนสุด',
                  icon: 'tool',
                  unit: 'ห้อง',
                  total: maintenanceRoomsList.length,
                  items: paginatedMaintenanceRooms,
                  page: maintenanceRoomsPage,
                  totalPages: maintenanceRoomsTotalPages,
                  setPage: setMaintenanceRoomsPage,
                  empty: 'ไม่มีห้องที่กำลังซ่อมบำรุง',
                  primary: (room) => `${room.first_name || ''} ${room.last_name || ''}`.trim() || 'ไม่มีผู้เช่า',
                  secondary: (room) => (room.maintenance_since ? `แจ้งซ่อม ${formatDate(room.maintenance_since)}` : 'กำลังซ่อมบำรุง'),
                  side: (room) => room.phone || '-',
                  alert: () => null,
                },
              ].map((list) => (
                <div key={list.key} className={`owner-panel owner-ov-list is-${list.key}`}>
                  <div className="owner-ov-list-head">
                    <span className="owner-ov-list-icon" aria-hidden="true">
                      <OwnerListIcon name={list.icon} size={18} />
                    </span>
                    <div className="owner-ov-list-heading">
                      <h3>{list.title}</h3>
                      <small>{list.caption}</small>
                    </div>
                    <div className="owner-ov-list-total">
                      <strong>{list.total}</strong>
                      <small>{list.unit}</small>
                    </div>
                  </div>
                  <div className="owner-ov-list-body">
                    {list.items.length ? (
                      list.items.map((room, index) => {
                        const alert = list.alert(room)
                        const isLatest = list.page === 1 && index === 0
                        return (
                          <button key={room.room_number} type="button" className={`owner-ov-row${alert ? ' has-alert' : ''}`} onClick={() => handleRoomClick(room)}>
                            <span className="owner-ov-row-room">
                              <small>ห้อง</small>
                              {room.room_number}
                            </span>
                            <span className="owner-ov-row-text">
                              <strong>
                                <span className="owner-ov-row-name">{list.primary(room)}</span>
                                {isLatest && <span className="owner-ov-row-latest">ล่าสุด</span>}
                              </strong>
                              <small>{list.secondary(room)}</small>
                            </span>
                            {alert ? (
                              <span className="owner-ov-row-alert">{alert}</span>
                            ) : (
                              <span className="owner-ov-row-side">{list.side(room)}</span>
                            )}
                            <span className="owner-ov-row-chevron" aria-hidden="true">›</span>
                          </button>
                        )
                      })
                    ) : (
                      <div className="owner-ov-list-empty">
                        <span aria-hidden="true">
                          <OwnerListIcon name={list.icon} size={20} />
                        </span>
                        {list.empty}
                      </div>
                    )}
                  </div>
                  <div className="owner-ov-list-foot">
                    {list.total > SUMMARY_PAGE_SIZE ? (
                      <div className="owner-ov-pager">
                        <button type="button" aria-label="หน้าก่อนหน้า" disabled={list.page <= 1} onClick={() => list.setPage((page) => page - 1)}>‹</button>
                        <span>{list.page} / {list.totalPages}</span>
                        <button type="button" aria-label="หน้าถัดไป" disabled={list.page >= list.totalPages} onClick={() => list.setPage((page) => page + 1)}>›</button>
                      </div>
                    ) : (
                      <span className="owner-ov-list-foot-note">แสดงครบ {list.total} รายการ</span>
                    )}
                    <button type="button" className="owner-ov-link" onClick={() => openRoomList(list.key)}>
                      ดูทั้งหมด
                      <span aria-hidden="true">›</span>
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {!isLoading && activeTab === 'rooms' && roomsSection === 'occupancy' && (
          <>
            <section className="owner-panel">
              <div className="owner-panel-header">
                <div>
                  <h3>เปรียบเทียบจำนวนผู้เข้าพัก</h3>
                  <p className="owner-occupancy-panel-caption">
                    แนวโน้มห้องที่มีผู้พัก ห้องว่าง และอัตราการเข้าพักแยกตาม{occupancyTrend.granularity === 'day' ? 'วัน' : 'เดือน'}
                  </p>
                </div>
              </div>

              <div className="owner-finance-chart-legend">
                {OCCUPANCY_TREND_SERIES.map((series) => (
                  <span key={series.key}>
                    <i className="owner-chart-tooltip-dot" style={{ background: series.color }} />
                    {series.label}
                  </span>
                ))}
              </div>

              {occupancyTrendChartData.length ? (
                <>
                <div className={`owner-linecard-chart owner-finance-trend-chart ${isOccupancyTrendLoading ? 'is-loading' : ''}`}>
                  <ResponsiveContainer width="100%" height={280}>
                    {occupancyTrendChartData.length >= 2 ? (
                      <LineChart data={occupancyTrendChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip content={<OccupancyTrendTooltip />} cursor={{ stroke: '#c7d8f0', strokeWidth: 1 }} />
                        <Line animationDuration={350} type="monotone" dataKey="occupied" name="มีผู้เช่า" stroke={ROOM_OCCUPANCY_COLORS.occupied} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                        <Line animationDuration={350} type="monotone" dataKey="vacant" name="ว่าง" stroke={ROOM_OCCUPANCY_COLORS.vacant} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    ) : (
                      <BarChart data={occupancyTrendChartData} barGap={4} barCategoryGap="40%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip content={<OccupancyTrendTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                        <Bar animationDuration={350} dataKey="occupied" name="มีผู้เช่า" fill={ROOM_OCCUPANCY_COLORS.occupied} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar animationDuration={350} dataKey="vacant" name="ว่าง" fill={ROOM_OCCUPANCY_COLORS.vacant} radius={[4, 4, 0, 0]} maxBarSize={48} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>

                <section className="owner-occupancy-movement">
                  <div className="owner-occupancy-movement-heading">
                    <div>
                      <h4>เปรียบเทียบการย้ายเข้า–ออก</h4>
                      <p>จำนวนรายการเข้าอยู่และย้ายออกในแต่ละ{occupancyTrend.granularity === 'day' ? 'วัน' : 'เดือน'}</p>
                    </div>
                    <div className="owner-finance-chart-legend">
                      {OCCUPANCY_MOVEMENT_SERIES.map((series) => (
                        <span key={series.key}>
                          <i className="owner-chart-tooltip-dot" style={{ background: series.color }} />
                          {series.label}
                        </span>
                      ))}
                    </div>
                    <div className="owner-occupancy-movement-totals">
                      <span className="is-move-in">ย้ายเข้ารวม <strong>{occupancyTrendSummary.moveIns}</strong> รายการ</span>
                      <span className="is-move-out">ย้ายออกรวม <strong>{occupancyTrendSummary.moveOuts}</strong> รายการ</span>
                    </div>
                  </div>
                  <div className="owner-occupancy-movement-chart">
                    <ResponsiveContainer width="100%" height={220}>
                      {occupancyTrendChartData.length >= 2 ? (
                        <LineChart data={occupancyTrendChartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={32} />
                          <Tooltip content={<OccupancyMovementTooltip />} cursor={{ stroke: '#c7d8f0', strokeWidth: 1 }} />
                          <Line animationDuration={350} type="monotone" dataKey="moveIns" name="ย้ายเข้า" stroke="#0f9d58" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
                          <Line animationDuration={350} type="monotone" dataKey="moveOuts" name="ย้ายออก" stroke="#d97706" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      ) : (
                        <BarChart data={occupancyTrendChartData} barGap={8} barCategoryGap="40%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={32} />
                          <Tooltip content={<OccupancyMovementTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                          <Bar animationDuration={350} dataKey="moveIns" name="ย้ายเข้า" fill="#0f9d58" radius={[4, 4, 0, 0]} maxBarSize={34} />
                          <Bar animationDuration={350} dataKey="moveOuts" name="ย้ายออก" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={34} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </section>

                <div className="owner-occupancy-highlights">
                  <div className="owner-occupancy-highlight occupied">
                    <span className="owner-occupancy-highlight-icon"><StatIcon name="rooms" /></span>
                    <div>
                      <span>ผู้พัก ณ ช่วงล่าสุด</span>
                      <strong>{occupancyTrendSummary.currentOccupied} <small>ห้อง</small></strong>
                    </div>
                  </div>
                  <div className="owner-occupancy-highlight vacant">
                    <span className="owner-occupancy-highlight-icon"><StatIcon name="rooms" /></span>
                    <div>
                      <span>ห้องว่าง ณ ช่วงล่าสุด</span>
                      <strong>{occupancyTrendSummary.currentVacant} <small>ห้อง</small></strong>
                    </div>
                  </div>
                  <div className={`owner-occupancy-highlight ${occupancyTrendSummary.occupiedChange < 0 ? 'decline' : 'growth'}`}>
                    <span className="owner-occupancy-highlight-icon"><StatIcon name="profit" /></span>
                    <div>
                      <span>เปลี่ยนแปลงจากช่วงแรก</span>
                      <strong>
                        {occupancyTrendSummary.occupiedChange > 0 ? '+' : ''}
                        {occupancyTrendSummary.occupiedChange} <small>ห้อง</small>
                      </strong>
                    </div>
                  </div>
                  <div className="owner-occupancy-highlight capacity">
                    <span className="owner-occupancy-highlight-icon"><StatIcon name="margin" /></span>
                    <div>
                      <span>ความจุ ณ ช่วงล่าสุด</span>
                      <strong>{occupancyTrendSummary.totalRooms} <small>ห้อง</small></strong>
                    </div>
                  </div>
                </div>

                <div className="owner-occupancy-detail">
                  <div className="owner-occupancy-detail-heading">
                    <div>
                      <h4>รายละเอียดผู้เข้าพักตามช่วงเวลา</h4>
                      <p>เปรียบเทียบห้องที่มีผู้พัก อัตราเข้าพัก และรายการย้ายเข้า–ออกในแต่ละช่วง</p>
                    </div>
                    <span>{occupancyTrendSummary.periodCount} {occupancyTrend.granularity === 'day' ? 'วัน' : 'เดือน'}</span>
                  </div>
                  <div className="owner-table-wrap owner-occupancy-detail-table-wrap">
                    <table className="owner-table owner-occupancy-detail-table">
                      <thead>
                        <tr>
                          <th>ช่วงเวลา</th>
                          <th>มีผู้พัก</th>
                          <th>ห้องว่าง</th>
                          <th>ห้องทั้งหมด</th>
                          <th>ย้ายเข้า</th>
                          <th>ย้ายออก</th>
                          <th>อัตราเข้าพัก</th>
                          <th>เปลี่ยนจากช่วงก่อน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {occupancyComparisonRows.map((item) => (
                          <tr
                            key={item.period}
                            className="owner-occupancy-clickable-row"
                            tabIndex={0}
                            aria-label={`ดูรายละเอียดผู้เข้าพักช่วง ${item.periodLabel}`}
                            onClick={() => openOccupancyPeriodDetail(item)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                openOccupancyPeriodDetail(item)
                              }
                            }}
                          >
                            <td><strong>{item.periodLabel}</strong></td>
                            <td className="owner-occupancy-occupied-cell">{item.occupied} ห้อง</td>
                            <td className="owner-occupancy-vacant-cell">{item.vacant} ห้อง</td>
                            <td>{item.total} ห้อง</td>
                            <td className="owner-occupancy-move-in-cell">{item.moveIns} รายการ</td>
                            <td className="owner-occupancy-move-out-cell">{item.moveOuts} รายการ</td>
                            <td>
                              <div className="owner-occupancy-rate-cell">
                                <div className="owner-occupancy-rate-track" aria-label={`อัตราการเข้าพัก ${item.occupancyRate.toFixed(1)} เปอร์เซ็นต์`}>
                                  <span style={{ width: `${Math.min(100, item.occupancyRate)}%` }} />
                                </div>
                                <strong>{item.occupancyRate.toFixed(1)}%</strong>
                              </div>
                            </td>
                            <td className={
                              item.change === null
                                ? ''
                                : item.change > 0
                                  ? 'owner-occupancy-change-cell is-up'
                                  : item.change < 0
                                    ? 'owner-occupancy-change-cell is-down'
                                    : 'owner-occupancy-change-cell is-steady'
                            }>
                              {item.change === null
                                ? '—'
                                : item.change > 0
                                  ? `+${item.change} ห้อง`
                                  : `${item.change} ห้อง`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                </>
              ) : (
                <div className="owner-empty">ยังไม่มีข้อมูลแนวโน้มย้อนหลัง</div>
              )}
            </section>
          </>
        )}

        {!isLoading && activeTab === 'utilities' && (
          <>
            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>ค่าน้ำ-ค่าไฟแยกตามห้อง</h3>
                <input
                  type="month"
                  value={utilityMonth}
                  onChange={(event) => setUtilityMonth(event.target.value)}
                  aria-label="เลือกเดือน"
                />
              </div>

              <div className="owner-table-wrap">
                <table className="owner-table">
                  <thead>
                    <tr>
                      <th>ห้อง</th><th>ผู้เช่า</th><th>ค่าน้ำ (หน่วย)</th><th>ค่าน้ำ</th>
                      <th>ค่าไฟ (หน่วย)</th><th>ค่าไฟ</th><th>รวม</th><th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {utilities.rooms
                      .filter((room) => utilityRoomFilter === 'all' || String(room.room_number) === utilityRoomFilter)
                      .map((room) => (
                        <tr key={room.room_number}>
                          <td>{room.room_number}</td>
                          <td>{room.tenant_name || '-'}</td>
                          <td>{room.water_units ?? 0}</td>
                          <td>฿{formatCurrency(room.water_amount)}</td>
                          <td>{room.electricity_units ?? 0}</td>
                          <td>฿{formatCurrency(room.electricity_amount)}</td>
                          <td><strong>฿{formatCurrency(room.total)}</strong></td>
                          <td>
                            <span className={`owner-status-badge ${room.status === 'paid' ? 'active' : 'pending'}`}>
                              {room.status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    {!utilities.rooms.length && (
                      <tr><td colSpan="8" className="owner-empty-row">ไม่มีข้อมูลค่าน้ำ-ค่าไฟ</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {!isLoading && activeTab === 'audit' && <OwnerAuditLog />}

        {!isLoading && activeTab === 'announcements' && (
          <AnnouncementBoard
            key={announcementFocus?.nonce ?? 'owner-board'}
            variant="owner"
            announcements={announcements}
            openId={announcementFocus?.id}
            canManage
            apiBase="/api/owner/announcements"
            onChange={loadAnnouncements}
          />
        )}

        {!isLoading && activeTab === 'staff' && (
          <section className="owner-panel owner-staff-panel">
              <div className="owner-panel-header">
                <h3>จัดการพนักงาน</h3>
                <button type="button" className="owner-primary-btn small" onClick={openStaffModal}>
                  + เพิ่มพนักงาน
                </button>
              </div>

                <div className="owner-table-wrap owner-staff-table-wrap">
                  <table className="owner-table">
                    <thead>
                      <tr>
                        <th>ชื่อ-นามสกุล</th>
                        <th>ตำแหน่ง</th>
                        <th>เบอร์</th>
                        <th className="owner-col-status">สถานะ</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStaff.length ? (
                        paginatedStaff.map((member) => (
                          <tr key={`${member.role}-${member.id}`}>
                            <td>{`${member.first_name || ''} ${member.last_name || ''}`.trim() || '-'}</td>
                            <td>{member.role}</td>
                            <td>{member.phone || '-'}</td>
                            <td className="owner-col-status">
                              <span className={`owner-status-badge ${member.is_suspended ? 'disabled' : 'active'}`}>
                                {member.is_suspended ? 'ระงับใช้งาน' : 'ใช้งานปกติ'}
                              </span>
                            </td>
                            <td>
                              <div className="owner-inline-actions">
                                <button type="button" className="owner-action-btn view" onClick={() => setViewingStaff(member)}>
                                  ดูรายละเอียด
                                </button>
                                <button type="button" className="owner-action-btn update" onClick={() => openStaffEditModal(member)}>
                                  แก้ไข
                                </button>
                                <button type="button" className="owner-action-btn update" onClick={() => toggleStaffStatus(member)}>
                                  {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                                </button>
                                <button type="button" className="owner-action-btn delete" onClick={() => deleteStaffMember(member)}>
                                  ลบ
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="owner-empty-row">
                            ไม่มีข้อมูลพนักงาน
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {staffList.length > STAFF_PAGE_SIZE && (
                  <div className="owner-pagination">
                    <button type="button" disabled={clampedStaffPage <= 1} onClick={() => setStaffPage((page) => page - 1)}>
                      ก่อนหน้า
                    </button>
                    <span>
                      หน้า {clampedStaffPage}/{staffTotalPages}
                    </span>
                    <button type="button" disabled={clampedStaffPage >= staffTotalPages} onClick={() => setStaffPage((page) => page + 1)}>
                      ถัดไป
                    </button>
                  </div>
                )}
          </section>
        )}

        {displayStaffModalOpen && (
          <div className={`owner-modal-backdrop${isStaffModalClosing ? ' is-closing' : ''}`} role="presentation" onClick={closeStaffModal}>
            <section className={`owner-modal${isStaffModalClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="staff-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <h3 id="staff-modal-title">{editingStaff ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</h3>
                  <p className="owner-modal-subtext">
                    {editingStaff ? 'แก้ไขรายละเอียดพนักงานคนนี้' : 'กรอกรายละเอียดพนักงานที่ต้องการเพิ่ม'}
                  </p>
                </div>
                <button type="button" className="owner-modal-close" onClick={closeStaffModal} aria-label="ปิดหน้าต่างเพิ่มพนักงาน">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="owner-modal-body">
                <form onSubmit={handleStaffSubmit} className="owner-staff-form">
                  <div className="owner-form-row">
                    <label>
                      ตำแหน่ง
                      <select
                        value={staffForm.role}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, role: event.target.value }))}
                        disabled={Boolean(editingStaff)}
                      >
                        <option value="Staff">Staff</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </label>
                    <label>
                      อายุ
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={staffForm.age}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, age: event.target.value }))}
                        placeholder="25"
                      />
                      {staffErrors.age && <span className="owner-field-error">{staffErrors.age}</span>}
                    </label>
                  </div>

                  <div className="owner-form-row">
                    <label>
                      เลขบัตรประชาชน
                      <input
                        type="text"
                        maxLength={13}
                        value={staffForm.idcard}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, idcard: event.target.value }))}
                        placeholder="13 หลัก"
                        disabled={Boolean(editingStaff)}
                      />
                      {staffErrors.idcard && <span className="owner-field-error">{staffErrors.idcard}</span>}
                    </label>
                    <label>
                      โทรศัพท์
                      <input
                        type="tel"
                        value={staffForm.phone}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="0812345678"
                      />
                      {staffErrors.phone && <span className="owner-field-error">{staffErrors.phone}</span>}
                    </label>
                  </div>

                  <div className="owner-form-row">
                    <label>
                      ชื่อ
                      <input
                        type="text"
                        value={staffForm.first_name}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, first_name: event.target.value }))}
                        placeholder="ชื่อ"
                      />
                    </label>
                    <label>
                      นามสกุล
                      <input
                        type="text"
                        value={staffForm.last_name}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, last_name: event.target.value }))}
                        placeholder="นามสกุล"
                      />
                    </label>
                  </div>

                  <label>
                    {editingStaff ? 'รหัสผ่านใหม่ (ไม่บังคับ)' : 'รหัสผ่าน'}
                    <span className="owner-password-field">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={staffForm.password}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder={editingStaff ? 'เว้นว่างหากไม่ต้องการเปลี่ยน' : 'อย่างน้อย 6 ตัว'}
                      />
                      <button type="button" className="owner-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                        <span className={`owner-password-icon ${showPassword ? 'is-visible' : ''}`} aria-hidden="true" />
                      </button>
                    </span>
                    {staffErrors.password && <span className="owner-field-error">{staffErrors.password}</span>}
                  </label>

                  <div className="owner-form-actions">
                    <button type="button" className="owner-secondary-btn" onClick={closeStaffModal}>
                      ยกเลิก
                    </button>
                    <button type="submit" className="owner-primary-btn" disabled={isSubmittingStaff}>
                      {isSubmittingStaff
                        ? (editingStaff ? 'กำลังบันทึก...' : 'กำลังเพิ่ม...')
                        : (editingStaff ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน')}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        )}

        {displayViewingStaff && (
          <div className={`owner-modal-backdrop${isViewingStaffClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setViewingStaff(null)}>
            <section className={`owner-modal${isViewingStaffClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="staff-detail-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <span className={`owner-status-badge ${displayViewingStaff.is_suspended ? 'disabled' : 'active'}`}>
                    {displayViewingStaff.role}
                  </span>
                  <h3 id="staff-detail-title">รายละเอียดพนักงาน</h3>
                </div>
                <button type="button" className="owner-modal-close" onClick={() => setViewingStaff(null)} aria-label="ปิดรายละเอียด">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="owner-modal-body">
                <div className="owner-detail-grid">
                  <div>
                    <div className="owner-detail-icon blue" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="3.3" />
                        <path d="M5.5 20c0-3.9 2.9-7 6.5-7s6.5 3.1 6.5 7" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>ชื่อ-นามสกุล</span>
                      <strong>{`${displayViewingStaff.first_name || ''} ${displayViewingStaff.last_name || ''}`.trim() || '-'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon purple" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>เบอร์โทรศัพท์</span>
                      <strong>{displayViewingStaff.phone || '-'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon green" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="3" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>เลขบัตรประชาชน</span>
                      <strong>{displayViewingStaff.idcard || '-'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon amber" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="3" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>อายุ</span>
                      <strong>{displayViewingStaff.age ? `${displayViewingStaff.age} ปี` : '-'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon cyan" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>ตำแหน่ง</span>
                      <strong>{displayViewingStaff.role}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon rose" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2 4 5v6c0 5.25 3.6 9.74 8 11 4.4-1.26 8-5.75 8-11V5l-8-3Z" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>สถานะ</span>
                      <strong>{displayViewingStaff.is_suspended ? 'ระงับใช้งาน' : 'ใช้งานปกติ'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon blue" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="3" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>วันที่เพิ่มเข้าระบบ</span>
                      <strong>{formatDate(displayViewingStaff.created_at)}</strong>
                    </div>
                  </div>
                </div>

                <div className="owner-form-actions">
                  <button
                    type="button"
                    className="owner-primary-btn"
                    onClick={() => {
                      const staffMember = viewingStaff
                      setViewingStaff(null)
                      openStaffEditModal(staffMember)
                    }}
                  >
                    แก้ไขข้อมูล
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {!isLoading && activeTab === 'finance' && (
          <>
            <section className="owner-panel">
              <div className="owner-panel-header">
                <div>
                  <h3>เปรียบเทียบรายรับและรายจ่าย</h3>
                  <p className="owner-finance-panel-caption">
                    แสดงผลราย{financeTrends.granularity === 'day' ? 'วัน' : 'เดือน'} พร้อมกำไรสุทธิในช่วงเวลาที่เลือก
                  </p>
                </div>
              </div>

              <div className="owner-finance-chart-legend">
                {FINANCE_TREND_SERIES.map((series) => (
                  <span key={series.key}>
                    <i className="owner-chart-tooltip-dot" style={{ background: series.color }} />
                    {series.label}
                  </span>
                ))}
              </div>

              {trendChartData.length ? (
                <>
                <div className={`owner-linecard-chart owner-finance-trend-chart ${isTrendsLoading ? 'is-loading' : ''}`}>
                  <ResponsiveContainer width="100%" height={300}>
                    {trendChartData.length >= 2 ? (
                      <LineChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={56} tickFormatter={(value) => formatCurrency(value)} />
                        <Tooltip content={<FinanceTrendTooltip />} cursor={{ stroke: '#c7d8f0', strokeWidth: 1 }} />
                        <ReferenceLine y={0} stroke="#d8e2ee" />
                        <Line animationDuration={350} type="monotone" dataKey="income" name="รายรับ" stroke={FINANCE_TREND_COLORS.income} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                        <Line animationDuration={350} type="monotone" dataKey="expense" name="รายจ่าย" stroke={FINANCE_TREND_COLORS.expense} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                        <Line animationDuration={350}
                          type="monotone"
                          dataKey="netProfit"
                          name="กำไร/ขาดทุน"
                          stroke={FINANCE_TREND_COLORS.net}
                          strokeWidth={2}
                          dot={(props) => (
                            <circle
                              key={`net-dot-${props.payload.period}`}
                              cx={props.cx}
                              cy={props.cy}
                              r={4}
                              fill={props.payload.netProfit < 0 ? '#ef4444' : FINANCE_TREND_COLORS.net}
                              stroke="none"
                            />
                          )}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    ) : (
                      <BarChart data={trendChartData} barGap={4} barCategoryGap="40%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={56} tickFormatter={(value) => formatCurrency(value)} />
                        <Tooltip content={<FinanceTrendTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                        <Bar animationDuration={350} dataKey="income" name="รายรับ" fill={FINANCE_TREND_COLORS.income} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar animationDuration={350} dataKey="expense" name="รายจ่าย" fill={FINANCE_TREND_COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar animationDuration={350} dataKey="netProfit" name="กำไร/ขาดทุน" fill={FINANCE_TREND_COLORS.net} radius={[4, 4, 0, 0]} maxBarSize={48}>
                          {trendChartData.map((entry) => (
                            <Cell key={entry.period} fill={entry.netProfit < 0 ? '#ef4444' : FINANCE_TREND_COLORS.net} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>

                <div className="owner-balance-summary">
                  <div>
                    <span>รวมรายรับ</span>
                    <strong>{formatSignedCurrency(trendSummary.totalIncome)}</strong>
                  </div>
                  <div>
                    <span>รวมรายจ่าย</span>
                    <strong>{formatSignedCurrency(trendSummary.totalExpense)}</strong>
                  </div>
                  <div className={trendSummary.totalNet < 0 ? 'is-owed' : 'is-refund'}>
                    <span>กำไร/ขาดทุนสุทธิ</span>
                    <strong>{formatSignedCurrency(trendSummary.totalNet)}</strong>
                  </div>
                  <div className={trendSummary.avgNet < 0 ? 'is-owed' : 'is-refund'}>
                    <span>กำไรสุทธิเฉลี่ยต่อ{financeTrends.granularity === 'day' ? 'วัน' : 'เดือน'}</span>
                    <strong>{formatSignedCurrency(trendSummary.avgNet)}</strong>
                  </div>
                  <div>
                    <span>อัตรากำไรสุทธิ</span>
                    <strong>{formatPercent(trendSummary.profitMargin)}</strong>
                  </div>
                </div>
                <div className="owner-finance-detail">
                  <div className="owner-finance-detail-heading">
                    <div>
                      <h4>รายละเอียดเปรียบเทียบตามช่วงเวลา</h4>
                      <p>แสดงจำนวนรายการ ค่าเฉลี่ยต่อรายการ และสัดส่วนรายรับ–รายจ่ายในแต่ละช่วง</p>
                    </div>
                    <span>{trendSummary.periodCount} {financeTrends.granularity === 'day' ? 'วัน' : 'เดือน'}</span>
                  </div>
                  <div className="owner-table-wrap owner-finance-detail-table-wrap">
                    <table className="owner-table owner-finance-detail-table">
                      <thead>
                        <tr>
                          <th>ช่วงเวลา</th>
                          <th>รายรับ</th>
                          <th>รายจ่าย</th>
                          <th>กำไร/ขาดทุนสุทธิ</th>
                          <th>เปลี่ยนสุทธิจากช่วงก่อน</th>
                          <th>รายจ่ายต่อรายรับ</th>
                          <th>อัตรากำไรสุทธิ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendChartData.map((item, index) => {
                          const income = Number(item.income || 0)
                          const expense = Number(item.expense || 0)
                          const incomeCount = Number(item.incomeCount || 0)
                          const expenseCount = Number(item.expenseCount || 0)
                          const netProfit = income - expense
                          const previous = trendChartData[index - 1]
                          const previousNet = previous ? Number(previous.income || 0) - Number(previous.expense || 0) : null
                          const netChange = previousNet === null ? null : netProfit - previousNet
                          const expenseRatio = income > 0 ? (expense / income) * 100 : null
                          const periodProfitMargin = income > 0 ? (netProfit / income) * 100 : null
                          return (
                            <tr key={item.period}>
                              <td><strong>{item.monthLabel}</strong></td>
                              <td className="owner-finance-income-cell">
                                <strong>{formatSignedCurrency(income)}</strong>
                                <small>{incomeCount} รายการ · เฉลี่ย {formatSignedCurrency(incomeCount ? income / incomeCount : 0)}</small>
                              </td>
                              <td className="owner-finance-expense-cell">
                                <strong>{formatSignedCurrency(expense)}</strong>
                                <small>{expenseCount} รายการ · เฉลี่ย {formatSignedCurrency(expenseCount ? expense / expenseCount : 0)}</small>
                              </td>
                              <td className={netProfit < 0 ? 'owner-finance-loss-cell' : 'owner-finance-profit-cell'}>
                                <strong>{formatSignedCurrency(netProfit)}</strong>
                              </td>
                              <td className={netChange === null ? '' : netChange < 0 ? 'owner-finance-loss-cell' : 'owner-finance-profit-cell'}>
                                {netChange === null ? '—' : `${netChange > 0 ? '+' : ''}${formatSignedCurrency(netChange)}`}
                              </td>
                              <td>{expenseRatio === null ? 'ไม่มีรายรับ' : formatPercent(expenseRatio)}</td>
                              <td>{periodProfitMargin === null ? 'ไม่มีรายรับ' : formatPercent(periodProfitMargin)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                </>
              ) : (
                <div className="owner-empty">ยังไม่มีข้อมูลแนวโน้มย้อนหลัง</div>
              )}
            </section>

            <OwnerUtilityReceipts from={paymentFilter.from} to={paymentFilter.to} />

            <section className="owner-shell-grid">
              <div className="owner-panel">
                <div className="owner-panel-header">
                  <h3>รายรับตามประเภท</h3>
                </div>
                <div className="owner-income-type-list">
                  {paginatedIncomeByType.length ? (
                    paginatedIncomeByType.map((item) => {
                      const color = getPaymentTypeColor(item.type)
                      const percent = incomeByTypeTotal > 0 ? (Number(item.total || 0) / incomeByTypeTotal) * 100 : 0
                      return (
                        <div key={item.type} className="owner-income-type-item">
                          <span className="owner-income-type-icon" style={{ color, background: `${color}1f` }}>
                            <PaymentTypeIcon type={item.type} />
                          </span>
                          <div className="owner-income-type-body">
                            <div className="owner-income-type-row">
                              <span className="owner-summary-label">{item.type ? formatPaymentType(item.type) : 'ไม่ระบุ'}</span>
                              <strong>฿{formatCurrency(item.total)}</strong>
                            </div>
                            <div className="owner-income-type-progress">
                              <div className="owner-income-type-progress-fill" style={{ width: `${percent}%`, background: color }} />
                            </div>
                            <div className="owner-income-type-row">
                              <small>{item.count || 0} รายการ</small>
                              <small>{percent.toFixed(0)}%</small>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="owner-empty">ยังไม่มีข้อมูลรายรับ</div>
                  )}
                </div>
                {incomeSummary.byType?.length > SUMMARY_PAGE_SIZE && (
                  <div className="owner-pagination">
                    <button type="button" disabled={incomeTypePage <= 1} onClick={() => setIncomeTypePage((page) => page - 1)}>
                      ก่อนหน้า
                    </button>
                    <span>
                      หน้า {incomeTypePage}/{incomeTypeTotalPages}
                    </span>
                    <button type="button" disabled={incomeTypePage >= incomeTypeTotalPages} onClick={() => setIncomeTypePage((page) => page + 1)}>
                      ถัดไป
                    </button>
                  </div>
                )}
              </div>

              <div className="owner-panel">
                <div className="owner-panel-header">
                  <h3>รายจ่ายตามหมวดหมู่</h3>
                  <span className="owner-panel-header-count">
                    รวม {formatSignedCurrency(expenseByCategoryTotal)}
                  </span>
                  <button type="button" className="owner-panel-header-link" onClick={() => setIsExpenseManagerOpen(true)}>
                    จัดการ
                  </button>
                </div>
                <div className="owner-category-list">
                  {paginatedExpenseCategories.length ? (
                    paginatedExpenseCategories.map((item) => (
                      <div key={item.category || 'uncategorized'} className="owner-category-item">
                        <span className="owner-category-icon" style={{ color: '#d97706', background: 'rgba(217, 119, 6, 0.12)' }}>
                          <StatIcon name="expense" />
                        </span>
                        <div className="owner-category-info">
                          <span className="owner-category-name">{item.category || 'ไม่ระบุ'}</span>
                          <span className="owner-category-count">{Number(item.count) || 0} รายการ · {expenseByCategoryTotal > 0 ? formatPercent((Number(item.total || 0) / expenseByCategoryTotal) * 100) : '0%'}</span>
                          <div className="owner-category-progress" aria-label={`สัดส่วนรายจ่าย ${item.category || 'ไม่ระบุ'}`}>
                            <span style={{ width: `${expenseByCategoryTotal > 0 ? Math.min(100, (Number(item.total || 0) / expenseByCategoryTotal) * 100) : 0}%` }} />
                          </div>
                        </div>
                        <div className="owner-category-amount">
                          <strong>{formatSignedCurrency(item.total)}</strong>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="owner-empty">ยังไม่มีข้อมูลรายจ่าย</div>
                  )}
                </div>
                {expenses.byCategory?.length > SUMMARY_PAGE_SIZE && (
                  <div className="owner-pagination">
                    <button type="button" disabled={expenseCategoryPage <= 1} onClick={() => setExpenseCategoryPage((page) => page - 1)}>
                      ก่อนหน้า
                    </button>
                    <span>
                      หน้า {expenseCategoryPage}/{expenseCategoryTotalPages}
                    </span>
                    <button type="button" disabled={expenseCategoryPage >= expenseCategoryTotalPages} onClick={() => setExpenseCategoryPage((page) => page + 1)}>
                      ถัดไป
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>รายการรายจ่ายทั้งหมด</h3>
              </div>
              <div className="owner-table-wrap">
                <table className="owner-table">
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>หมวดหมู่</th>
                      <th>รายละเอียด</th>
                      <th>บันทึกโดย</th>
                      <th>จำนวนเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.expenses?.length ? (
                      expenses.expenses.map((item) => (
                        <tr key={item.id}>
                          <td>{formatDate(item.expense_date)}</td>
                          <td>{item.category || '-'}</td>
                          <td>{item.description || '-'}</td>
                          <td>
                          <span className="owner-actor">{item.recorded_by_name || 'เจ้าของหอพัก'}</span>
                        </td>
                          <td>฿{formatCurrency(item.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="owner-empty-row">
                          ไม่มีรายการรายจ่ายในช่วงที่เลือก
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="owner-pagination">
                <button type="button" disabled={financeExpensePage <= 1} onClick={() => loadExpenses(financeExpensePage - 1)}>
                  ก่อนหน้า
                </button>
                <span>
                  หน้า {financeExpensePage}/{financeExpenseTotalPages}
                </span>
                <button type="button" disabled={financeExpensePage >= financeExpenseTotalPages} onClick={() => loadExpenses(financeExpensePage + 1)}>
                  ถัดไป
                </button>
              </div>
            </section>

            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>บันทึกการชำระเงิน</h3>
              </div>

              <section className="owner-slip-review-panel">
                <div className="owner-slip-review-heading">
                  <div>
                    <h4>สลิปที่รอตรวจสอบ</h4>
                    <p>{pendingSlipReviews.length ? `มี ${pendingSlipReviews.length} รายการที่ต้องตรวจสอบ` : 'ไม่มีสลิปที่รอตรวจสอบ'}</p>
                  </div>
                  <button type="button" className="owner-slip-refresh" onClick={() => loadPendingSlipReviews().catch(() => setMessage('danger', 'โหลดรายการสลิปไม่สำเร็จ'))}>รีเฟรช</button>
                </div>
                {pendingSlipReviews.length ? (
                  <div className="owner-slip-review-list">
                    {pendingSlipReviews.map((payment) => (
                      <article className="owner-slip-review-item" key={payment.id}>
                        <button type="button" className="owner-slip-review-image" onClick={() => openPaymentSlip(payment)} aria-label={`ดูสลิปห้อง ${payment.room_number}`}>
                          <UploadImage src={payment.slip_path} alt="สลิปโอนเงิน" />
                          <span>ดูสลิป</span>
                        </button>
                        <div className="owner-slip-review-info">
                          <strong>ห้อง {payment.room_number} · {payment.first_name} {payment.last_name}</strong>
                          <span>{payment.payment_types?.split(',').map(formatPaymentType).join(' / ') || 'รายการชำระเงิน'} · {payment.phone || 'ไม่มีเบอร์โทร'}</span>
                          <b>฿{formatCurrency(payment.amount)}</b>
                        </div>
                        <div className="owner-slip-review-actions">
                          <button type="button" className="owner-slip-reject" disabled={reviewingSlipId === payment.id} onClick={() => reviewOwnerPaymentSlip(payment, 'rejected')}>ปฏิเสธ</button>
                          <button type="button" className="owner-slip-approve" disabled={reviewingSlipId === payment.id} onClick={() => reviewOwnerPaymentSlip(payment, 'approved')}>{reviewingSlipId === payment.id ? 'กำลังบันทึก…' : 'อนุมัติสลิป'}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>

              <label className="owner-search-standalone">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={paymentLogFilter.search}
                  onChange={(event) => handlePaymentLogFilterChange('search', event.target.value)}
                  placeholder="ค้นหาห้อง / ลูกค้า / หมายเหตุ"
                />
              </label>

              <div className="owner-filter-box">
                <div className="owner-filter-row">
                  <label className="owner-date-field">
                    จาก
                    <ThaiDatePicker
                      value={paymentLogFilter.from}
                      onChange={(value) => handlePaymentLogFilterChange('from', value)}
                      maxDate={parseInputDate(paymentLogFilter.to)}
                      isClearable
                    />
                  </label>
                  <label className="owner-date-field">
                    ถึง
                    <ThaiDatePicker
                      value={paymentLogFilter.to}
                      onChange={(value) => handlePaymentLogFilterChange('to', value)}
                      minDate={parseInputDate(paymentLogFilter.from)}
                      isClearable
                    />
                  </label>
                  <label className="owner-search-box">
                    สถานะการชำระ
                    <select
                      value={paymentLogFilter.onlyOverdue ? 'overdue' : 'all'}
                      onChange={(event) => handlePaymentLogFilterChange('onlyOverdue', event.target.value === 'overdue')}
                    >
                      <option value="all">ทั้งหมด</option>
                      <option value="overdue">แสดงเฉพาะที่ค้างชำระ</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="owner-table-wrap">
                <table className="owner-table">
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>ลูกค้า</th>
                      <th>ห้อง</th>
                      <th>ประเภท</th>
                      <th>จำนวน</th>
                      <th className="owner-col-status">สถานะ</th>
                      <th>หมายเหตุ</th>
                      <th>สลิป</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentLogs.payments?.length ? (
                      paymentLogs.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{formatDate(payment.payment_date)}</td>
                          <td>{`${payment.first_name || ''} ${payment.last_name || ''}`.trim() || '-'}</td>
                          <td>{payment.room_number || '-'}</td>
                          <td>{payment.type ? formatPaymentType(payment.type) : '-'}</td>
                          <td>฿{formatCurrency(payment.amount)}</td>
                          <td className="owner-col-status">
                            <span className={`owner-status-badge ${payment.status === 'paid' ? 'active' : payment.status === 'pending' ? 'pending' : 'disabled'}`}>
                              {payment.status === 'paid' ? 'ชำระแล้ว' : payment.status === 'pending' ? 'รอชำระ' : payment.status}
                            </span>
                          </td>
                          <td>
                            {payment.status === 'paid' && payment.slip_path && payment.note?.includes('รอตรวจสอบสลิป')
                              ? 'ตรวจสอบสลิปแล้ว'
                              : payment.note || '-'}
                          </td>
                          <td>
                            {payment.slip_path ? (
                              <div className="owner-payment-slip-cell">
                                <button
                                  type="button"
                                  className="owner-view-slip-btn"
                                  onClick={() => openPaymentSlip(payment)}
                                >
                                  <span>ดูสลิป</span>
                                </button>
                                {payment.status === 'pending' && (
                                  <div className="owner-payment-review-actions">
                                    <button type="button" className="owner-payment-reject" disabled={reviewingSlipId === (payment.payment_id ?? payment.id)} onClick={() => reviewOwnerPaymentSlip(payment, 'rejected')}>ปฏิเสธ</button>
                                    <button type="button" className="owner-payment-approve" disabled={reviewingSlipId === (payment.payment_id ?? payment.id)} onClick={() => reviewOwnerPaymentSlip(payment, 'approved')}>อนุมัติ</button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="owner-no-slip">ไม่มีสลิป</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="owner-empty-row">
                          ไม่มีข้อมูลบันทึกการชำระเงิน
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="owner-pagination">
                <button type="button" disabled={paymentPage <= 1} onClick={() => loadPaymentLogs(paymentPage - 1)}>
                  ก่อนหน้า
                </button>
                <span>
                  หน้า {paymentPage}/{totalPaymentPages}
                </span>
                <button type="button" disabled={paymentPage >= totalPaymentPages} onClick={() => loadPaymentLogs(paymentPage + 1)}>
                  ถัดไป
                </button>
              </div>
            </section>

          </>
        )}

        {occupancyPeriodDetail && (
          <div className="owner-modal-backdrop" role="presentation" onClick={() => setOccupancyPeriodDetail(null)}>
            <section className="owner-modal owner-occupancy-period-modal" role="dialog" aria-modal="true" aria-labelledby="owner-occupancy-period-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <h3 id="owner-occupancy-period-title">รายละเอียดผู้เข้าพัก · {occupancyPeriodDetail.item.periodLabel}</h3>
                  <p className="owner-modal-subtext">ดูรายการย้ายเข้าและย้ายออกในช่วงเวลานี้</p>
                </div>
                <button type="button" className="owner-modal-close" onClick={() => setOccupancyPeriodDetail(null)} aria-label="ปิดรายละเอียด">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="owner-modal-body owner-occupancy-period-body">
                <div className="owner-occupancy-period-summary">
                  <div><span>ผู้พักอาศัย</span><strong>{occupancyPeriodDetail.item.occupied} ห้อง</strong></div>
                  <div><span>ห้องว่าง</span><strong>{occupancyPeriodDetail.item.vacant} ห้อง</strong></div>
                  <div><span>ย้ายเข้า</span><strong className="is-in">{occupancyPeriodDetail.item.moveIns} รายการ</strong></div>
                  <div><span>ย้ายออก</span><strong className="is-out">{occupancyPeriodDetail.item.moveOuts} รายการ</strong></div>
                </div>
                {occupancyPeriodDetail.loading ? (
                  <div className="owner-occupancy-period-state">กำลังโหลดรายละเอียด...</div>
                ) : occupancyPeriodDetail.logs.length ? (
                  <div className="owner-table-wrap">
                    <table className="owner-table owner-occupancy-period-table">
                      <thead><tr><th>วันที่</th><th>รายการ</th><th>ห้อง</th><th>ผู้เช่า</th><th>เบอร์โทร</th><th>หมายเหตุ</th></tr></thead>
                      <tbody>
                        {occupancyPeriodDetail.logs.map((log) => (
                          <tr key={log.id}>
                            <td>{formatDate(log.event_date)}</td>
                            <td><span className={`owner-occupancy-event-badge ${log.event_type === 'move_in' ? 'is-in' : 'is-out'}`}>{log.event_type === 'move_in' ? 'ย้ายเข้า' : 'ย้ายออก'}</span></td>
                            <td>{log.room_number || '-'}</td>
                            <td>{`${log.first_name || ''} ${log.last_name || ''}`.trim() || '-'}</td>
                            <td>{log.phone || '-'}</td>
                            <td>{log.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="owner-occupancy-period-state">ไม่มีรายการย้ายเข้า–ออกในช่วงเวลานี้</div>
                )}
              </div>
            </section>
          </div>
        )}

        {viewingPaymentSlip && (
          <div className="payment-slip-overlay" role="presentation" onClick={closePaymentSlip}>
            <section className="payment-slip-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-payment-slip-title" onClick={(event) => event.stopPropagation()}>
              <header className="payment-slip-header">
                <div className="payment-slip-heading">
                  <span className="payment-slip-heading-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                      <path d="M9 7h6M9 11h6M9 15h4" />
                    </svg>
                  </span>
                  <h3 id="owner-payment-slip-title">สลิปโอนเงิน</h3>
                  <span className="payment-slip-room">ห้อง {viewingPaymentSlip.room_number || '-'}</span>
                </div>
                <button type="button" className="payment-slip-close" onClick={closePaymentSlip} aria-label="ปิด">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </header>
              <div className="payment-slip-body">
                <div className="payment-slip-image-frame">
                  <button type="button" className="payment-slip-image-btn" onClick={() => setPaymentSlipZoomOpen(true)} title="คลิกเพื่อดูรูปขนาดเต็ม">
                    <UploadImage src={viewingPaymentSlip.slip_path} alt="สลิปโอนเงิน" />
                  </button>
                  <span className="payment-slip-image-hint">คลิกที่รูปเพื่อดูขนาดเต็ม</span>
                </div>
                <dl className="payment-slip-details">
                  <div className="payment-slip-amount">
                    <dt>จำนวนเงิน</dt>
                    <dd>฿{formatCurrency(viewingPaymentSlip.amount)}</dd>
                  </div>
                  <div><dt>ผู้เช่า</dt><dd>{viewingPaymentSlip.tenantName || `${viewingPaymentSlip.first_name || ''} ${viewingPaymentSlip.last_name || ''}`.trim() || '-'}</dd></div>
                  <div><dt>รายการ</dt><dd>{viewingPaymentSlip.payment_types?.split(',').map(formatPaymentType).join(', ') || formatPaymentType(viewingPaymentSlip.type) || 'ค่าเช่าห้อง'}</dd></div>
                  <div><dt>สถานะ</dt><dd>{viewingPaymentSlip.status === 'paid' ? 'ชำระแล้ว' : viewingPaymentSlip.status === 'pending' ? 'รอตรวจสอบ' : viewingPaymentSlip.status || '-'}</dd></div>
                  <div><dt>วันที่</dt><dd>{new Date(viewingPaymentSlip.created_at || viewingPaymentSlip.payment_date).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
                </dl>
              </div>
              <footer className="payment-slip-footer">
                <OwnerSlipDownloadButton url={viewingPaymentSlip.slip_path} fileName={`slip-room-${viewingPaymentSlip.room_number || 'unknown'}-${viewingPaymentSlip.payment_id || viewingPaymentSlip.id || 'payment'}`} />
              </footer>
            </section>
          </div>
        )}
        {viewingPaymentSlip && paymentSlipZoomOpen && (
          <PhotoLightbox
            photos={[{ name: `สลิปห้อง ${viewingPaymentSlip.room_number || '-'}`, url: viewingPaymentSlip.slip_path }]}
            title="สลิปโอนเงิน"
            subtitle={`ห้อง ${viewingPaymentSlip.room_number || '-'} · ${viewingPaymentSlip.tenantName || `${viewingPaymentSlip.first_name || ''} ${viewingPaymentSlip.last_name || ''}`.trim() || 'ไม่ระบุชื่อผู้เช่า'}`}
            label="สลิปโอนเงิน"
            onClose={() => setPaymentSlipZoomOpen(false)}
          />
        )}

        {displayExpenseManagerOpen && (
          <div className={`owner-modal-backdrop${isExpenseManagerClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setIsExpenseManagerOpen(false)}>
            <section className={`owner-modal${isExpenseManagerClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="expense-manager-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <h3 id="expense-manager-title">จัดการรายจ่าย</h3>
                  <p className="owner-modal-subtext">แก้ไขหรือลบรายการรายจ่าย</p>
                </div>
                <button type="button" className="owner-modal-close" onClick={() => setIsExpenseManagerOpen(false)} aria-label="ปิดหน้าต่างจัดการรายจ่าย">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="owner-modal-body">
                <div className="owner-table-wrap">
                  <table className="owner-table">
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th>หมวดหมู่</th>
                        <th>รายละเอียด</th>
                        <th>บันทึกโดย</th>
                        <th>จำนวนเงิน</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.expenses?.length ? (
                        expenses.expenses.map((item) => (
                          <tr key={item.id}>
                            <td>{formatDate(item.expense_date)}</td>
                            <td>{item.category || '-'}</td>
                            <td>{item.description || '-'}</td>
                            <td>{item.recorded_by_name ? <span className="owner-actor">{item.recorded_by_name}</span> : '-'}</td>
                            <td>฿{formatCurrency(item.amount)}</td>
                            <td>
                              <div className="owner-inline-actions">
                                <button type="button" className="owner-action-btn update" onClick={() => openExpenseEdit(item)}>
                                  แก้ไข
                                </button>
                                <button type="button" className="owner-action-btn delete" onClick={() => setExpenseDeleteConfirm(item)}>
                                  ลบ
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="owner-empty-row">
                            ไม่มีรายการรายจ่ายในช่วงที่เลือก
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="owner-pagination">
                  <button type="button" disabled={financeExpensePage <= 1} onClick={() => loadExpenses(financeExpensePage - 1)}>
                    ก่อนหน้า
                  </button>
                  <span>
                    หน้า {financeExpensePage}/{financeExpenseTotalPages}
                  </span>
                  <button type="button" disabled={financeExpensePage >= financeExpenseTotalPages} onClick={() => loadExpenses(financeExpensePage + 1)}>
                    ถัดไป
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {displayExpenseEditModal && (
          <div className={`owner-modal-backdrop${isExpenseEditClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setExpenseEditModal(null)}>
            <section className={`owner-modal${isExpenseEditClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="expense-edit-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <h3 id="expense-edit-title">แก้ไขรายจ่าย</h3>
                </div>
                <button type="button" className="owner-modal-close" onClick={() => setExpenseEditModal(null)} aria-label="ปิดหน้าต่างแก้ไขรายจ่าย">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="owner-modal-body">
                <form onSubmit={(event) => submitExpenseEdit(event, () => setExpenseEditModal(null))} className="owner-form-group">
                  {expenseEditFormError && <div className="owner-alert owner-alert-danger">{expenseEditFormError}</div>}
                  <label>
                    หมวดหมู่
                    <input
                      type="text"
                      value={expenseEditForm.category}
                      onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, category: event.target.value }))}
                      placeholder="เช่น ค่าน้ำ, ค่าไฟ, ซ่อมบำรุง"
                    />
                  </label>
                  <label>
                    รายละเอียด (ไม่บังคับ)
                    <input
                      type="text"
                      value={expenseEditForm.description}
                      onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </label>
                  <label>
                    จำนวนเงิน (บาท)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={expenseEditForm.amount}
                      onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, amount: event.target.value }))}
                    />
                  </label>
                  <label>
                    วันที่
                    <ThaiDatePicker
                      value={expenseEditForm.expense_date}
                      onChange={(date) => setExpenseEditForm((prev) => ({ ...prev, expense_date: date }))}
                    />
                  </label>
                  <div className="owner-form-actions">
                    <button type="button" className="owner-secondary-btn" onClick={() => setExpenseEditModal(null)}>
                      ยกเลิก
                    </button>
                    <button type="submit" className="owner-primary-btn" disabled={isExpenseEditSubmitting}>
                      {isExpenseEditSubmitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        )}

        {displayExpenseDeleteConfirm && (
          <div className={`owner-modal-backdrop${isExpenseDeleteClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setExpenseDeleteConfirm(null)}>
            <section className={`owner-modal${isExpenseDeleteClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="expense-delete-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <h3 id="expense-delete-title">ยืนยันการลบรายจ่าย</h3>
                </div>
                <button type="button" className="owner-modal-close" onClick={() => setExpenseDeleteConfirm(null)} aria-label="ปิด">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="owner-modal-body">
                <div className="owner-confirm-body">
                  <div className="owner-confirm-icon is-danger">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </div>
                  <p className="owner-confirm-message">
                    ต้องการลบรายจ่าย <strong>"{displayExpenseDeleteConfirm.category}"</strong>
                    <br />
                    จำนวน <strong>฿{formatCurrency(displayExpenseDeleteConfirm.amount)}</strong> ใช่หรือไม่?
                  </p>
                  <div className="owner-form-actions">
                    <button type="button" className="owner-secondary-btn" onClick={() => setExpenseDeleteConfirm(null)}>
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      className="owner-danger-btn"
                      onClick={() => confirmDeleteExpenseRecord(() => setExpenseDeleteConfirm(null))}
                    >
                      ลบรายจ่าย
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {!isLoading && ['moveouts', 'requests', 'maintenance'].includes(activeTab) && (
          <section className="owner-panel">
            <div className="owner-panel-header">
              <h3>{OWNER_TABS.find((tab) => tab.key === activeTab)?.label}</h3>
            </div>
            <div className="owner-empty">กำลังพัฒนาฟีเจอร์นี้ เร็ว ๆ นี้</div>
          </section>
        )}

        {!isLoading && activeTab === 'rooms' && roomsSection === 'logs' && (
          <>
            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>บันทึกการเข้าพักและย้ายออก</h3>
              </div>

              <div className="owner-filter-box">
                <div className="owner-filter-row owner-occupancy-filter-row">
                  <label className="owner-search-standalone">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={occupancyFilter.search}
                      onChange={(event) => handleOccupancyFilterChange('search', event.target.value)}
                      placeholder="ค้นหาห้อง / ผู้เข้าพัก"
                    />
                  </label>
                  <label className="owner-search-box">
                    ประเภทเหตุการณ์
                    <select
                      value={occupancyFilter.type}
                      onChange={(event) => handleOccupancyFilterChange('type', event.target.value)}
                    >
                      {OCCUPANCY_TYPE_FILTERS.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="owner-table-wrap">
                <table className="owner-table">
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>เหตุการณ์</th>
                      <th>ห้อง</th>
                      <th>ผู้เข้าพัก</th>
                      <th>เบอร์โทร</th>
                      <th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occupancyLogs.logs?.length ? (
                      occupancyLogs.logs.map((log) => (
                        <tr key={log.id}>
                          <td>{formatDate(log.event_date)}</td>
                          <td className="owner-col-status">
                            <span className={`owner-status-badge ${log.event_type === 'move_in' ? 'active' : 'disabled'}`}>
                              {formatOccupancyEventType(log.event_type)}
                            </span>
                          </td>
                          <td>{log.room_number || '-'}</td>
                          <td>{`${log.first_name || ''} ${log.last_name || ''}`.trim() || '-'}</td>
                          <td>{log.phone || '-'}</td>
                          <td>{log.note || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="owner-empty-row">
                          ไม่มีข้อมูลการเข้าพักหรือย้ายออก
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="owner-pagination">
                <button type="button" disabled={occupancyPage <= 1} onClick={() => loadOccupancyLogs(occupancyPage - 1)}>
                  ก่อนหน้า
                </button>
                <span>
                  หน้า {occupancyPage}/{totalOccupancyPages}
                </span>
                <button type="button" disabled={occupancyPage >= totalOccupancyPages} onClick={() => loadOccupancyLogs(occupancyPage + 1)}>
                  ถัดไป
                </button>
              </div>
            </section>
          </>
        )}

        {(
          <>

            {displayRoomDetail && (() => {
              const detailRoom = displayRoomDetail.room
              const detailTenant = displayRoomDetail.tenant
              const detailStatus = detailRoom.status || (detailTenant ? 'occupied' : 'vacant')
              const tenantName = detailTenant ? `${detailTenant.first_name || ''} ${detailTenant.last_name || ''}`.trim() : ''
              const contractStart = detailRoom.rental_start_date ? new Date(detailRoom.rental_start_date).getTime() : null
              const contractEnd = detailRoom.rental_end_date ? new Date(detailRoom.rental_end_date).getTime() : null
              const hasContract = Boolean(contractStart && contractEnd && contractEnd > contractStart)
              const contractMonths = hasContract ? Math.max(1, Math.round((contractEnd - contractStart) / (86400000 * 30.44))) : 0
              const contractDaysLeft = contractEnd ? Math.ceil((contractEnd - roomDetailOpenedAt) / 86400000) : null
              const contractTone = contractDaysLeft === null ? 'normal' : contractDaysLeft <= 0 ? 'expired' : contractDaysLeft <= 30 ? 'warning' : 'normal'
              const infoTiles = [
                { key: 'start', tone: 'green', label: 'วันเริ่มสัญญา', value: formatDate(detailRoom.rental_start_date) },
                { key: 'end', tone: 'amber', label: 'วันสิ้นสุดสัญญา', value: formatDate(detailRoom.rental_end_date) },
                { key: 'rent', tone: 'blue', label: 'ค่าเช่ารายเดือน', value: `฿${formatCurrency(detailRoom.price)}` },
                { key: 'deposit', tone: 'violet', label: 'เงินมัดจำ', value: detailTenant ? `฿${formatCurrency(detailTenant.deposit_amount)}` : '-' },
              ]
              return (
                <div className={`owner-modal-backdrop${isRoomDetailClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomDetail(null)}>
                  <section className={`owner-modal owner-rd-modal${isRoomDetailClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-detail-title" onClick={(event) => event.stopPropagation()}>
                    <div className="owner-modal-header">
                      <div>
                        <h3 id="room-detail-title">รายละเอียดห้องพัก</h3>
                        <p className="owner-modal-subtext">ข้อมูลผู้เช่า สัญญา และประวัติการชำระเงิน</p>
                      </div>
                      <button type="button" className="owner-modal-close" onClick={() => setRoomDetail(null)} aria-label="ปิดรายละเอียด">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                          <line x1="6" y1="6" x2="18" y2="18" />
                          <line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      </button>
                    </div>
                    <div className="owner-modal-body">
                      <div className={`owner-rd-hero is-${detailStatus}`}>
                        <span className="owner-rd-room">
                          <small>ห้อง</small>
                          <strong>{detailRoom.room_number}</strong>
                        </span>
                        <div className="owner-rd-hero-text">
                          {detailTenant ? (
                            <>
                              <strong>{tenantName || 'ไม่ระบุชื่อ'}</strong>
                              <span className="owner-rd-hero-meta">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                                </svg>
                                {detailTenant.phone || '-'}
                              </span>
                            </>
                          ) : (
                            <>
                              <strong>ห้องว่าง</strong>
                              <span className="owner-rd-hero-meta">พร้อมให้เช่า ฿{formatCurrency(detailRoom.price)}/เดือน</span>
                            </>
                          )}
                        </div>
                        <span className={`owner-rd-status is-${detailStatus}`}>{ROOM_STATUS_LABELS[detailStatus] || 'มีผู้เช่า'}</span>
                      </div>

                      {isRoomDetailLoading ? (
                        <div className="owner-loading-box">กำลังโหลดรายละเอียดห้อง...</div>
                      ) : (
                        <>
                          <div className="owner-rd-tiles">
                            {infoTiles.map((tile) => (
                              <div key={tile.key} className={`owner-rd-tile is-${tile.tone}`}>
                                <span>{tile.label}</span>
                                <strong>{tile.value}</strong>
                              </div>
                            ))}
                          </div>

                          {detailTenant && hasContract && (
                            <div className={`owner-rd-contract is-${contractTone}`}>
                              <div className="owner-rd-contract-info">
                                <span className="owner-rd-contract-icon" aria-hidden="true">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
                                    <path d="M14 3v6h6M8 13h8M8 17h5" />
                                  </svg>
                                </span>
                                <div>
                                  <small>สัญญาเช่า</small>
                                  <strong>{contractMonths} เดือน</strong>
                                </div>
                              </div>
                              <div className="owner-rd-contract-dates">
                                <div>
                                  <small>เริ่ม</small>
                                  <strong>{formatDate(detailRoom.rental_start_date)}</strong>
                                </div>
                                <span className="owner-rd-contract-arrow" aria-hidden="true">→</span>
                                <div>
                                  <small>สิ้นสุด</small>
                                  <strong>{formatDate(detailRoom.rental_end_date)}</strong>
                                </div>
                              </div>
                              <div className="owner-rd-contract-left">
                                {contractTone === 'expired' ? (
                                  <strong>ครบกำหนดแล้ว</strong>
                                ) : (
                                  <>
                                    <strong>{contractDaysLeft}</strong>
                                    <small>วันที่เหลือ</small>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {!detailTenant && (
                            <div className="owner-rd-empty-tenant">
                              <span>ห้องนี้ยังไม่มีผู้เช่า</span>
                              <button
                                type="button"
                                className="owner-primary-btn small"
                                onClick={() => navigate('/register', { state: { roomNumber: detailRoom.room_number } })}
                              >
                                เพิ่มผู้เช่า
                              </button>
                            </div>
                          )}

                          {roomDetailBalance && (
                            <div className="owner-rd-balance">
                              <div>
                                <span>ค่าเช่ารายเดือน</span>
                                <strong>฿{formatCurrency(roomDetailBalance.rent)}</strong>
                              </div>
                              <div>
                                <span>ค่าน้ำ-ไฟค้างชำระ</span>
                                <strong>฿{formatCurrency(roomDetailBalance.unpaidUtilities)}</strong>
                              </div>
                              <div>
                                <span>หักเงินมัดจำ</span>
                                <strong>-฿{formatCurrency(roomDetailBalance.deposit)}</strong>
                              </div>
                              <div className={`is-total ${roomDetailBalance.netBalance > 0 ? 'is-owed' : 'is-refund'}`}>
                                <span>{roomDetailBalance.netBalance > 0 ? 'ค้างชำระสุทธิ' : 'มัดจำคงเหลือ (คืนลูกค้า)'}</span>
                                <strong>฿{formatCurrency(Math.abs(roomDetailBalance.netBalance))}</strong>
                              </div>
                            </div>
                          )}

                          <div className="owner-rd-history">
                            <div className="owner-rd-section-head">
                              <h4>ประวัติการชำระเงิน</h4>
                              <span className="owner-rd-section-meta">
                                {displayRoomDetail.payments?.length || 0} รายการ
                                {displayRoomDetail.payments?.length > 0 && (
                                  <button
                                    type="button"
                                    className="owner-ov-link"
                                    onClick={() => {
                                      setRoomPaymentsSearch('')
                                      setRoomPaymentsStatus('all')
                                      setRoomPaymentsPage(1)
                                      setRoomPaymentsAllOpen(true)
                                    }}
                                  >
                                    ดูเพิ่มเติม
                                    <span aria-hidden="true">›</span>
                                  </button>
                                )}
                              </span>
                            </div>
                            <div className="owner-rd-payments">
                              {displayRoomDetail.payments?.length ? (
                                paginatedPaymentHistory.map((payment) => {
                                  const tone = getRoomPaymentTone(payment.status)
                                  return (
                                    <button
                                      key={payment.id}
                                      type="button"
                                      className={`owner-rd-payment is-${tone}`}
                                      onClick={() => setRoomPaymentDetail({ ...payment, room_number: detailRoom.room_number, first_name: payment.tenantName || detailTenant?.first_name, last_name: payment.tenantName ? '' : detailTenant?.last_name })}
                                    >
                                      <span className="owner-rd-payment-icon" aria-hidden="true">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="2" y="5" width="20" height="14" rx="2" />
                                          <path d="M2 10h20" />
                                        </svg>
                                      </span>
                                      <span className="owner-rd-payment-text">
                                        <strong>{payment.type ? formatPaymentType(payment.type) : 'ไม่ระบุ'}</strong>
                                        <small>
                                          {formatDate(payment.payment_date)}
                                          {payment.slip_path && (
                                            <span className="owner-rd-slip-chip">
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                                                <path d="M9 7h6M9 11h6" />
                                              </svg>
                                              มีสลิป
                                            </span>
                                          )}
                                        </small>
                                      </span>
                                      <span className="owner-rd-payment-side">
                                        <strong>฿{formatCurrency(payment.amount)}</strong>
                                        <span className={`owner-rd-payment-status is-${tone}`}>{ROOM_PAYMENT_STATUS_LABELS[payment.status] || payment.status || '-'}</span>
                                      </span>
                                      <span className="owner-rd-payment-arrow" aria-hidden="true">›</span>
                                    </button>
                                  )
                                })
                              ) : (
                                <div className="owner-rd-payments-empty">ยังไม่มีประวัติการชำระเงิน</div>
                              )}
                            </div>
                            {displayRoomDetail.payments?.length > PAYMENT_HISTORY_PAGE_SIZE && (
                              <div className="owner-ov-pager">
                                <button type="button" aria-label="หน้าก่อนหน้า" disabled={paymentHistoryPage <= 1} onClick={() => setPaymentHistoryPage((page) => page - 1)}>‹</button>
                                <span>{paymentHistoryPage} / {paymentHistoryTotalPages}</span>
                                <button type="button" aria-label="หน้าถัดไป" disabled={paymentHistoryPage >= paymentHistoryTotalPages} onClick={() => setPaymentHistoryPage((page) => page + 1)}>›</button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                </div>
              )
            })()}

            {displayRoomPaymentsAll && displayRoomDetail && (() => {
              const detailRoom = displayRoomDetail.room
              const detailTenant = displayRoomDetail.tenant
              const allPayments = displayRoomDetail.payments || []
              const keyword = roomPaymentsSearch.trim().toLowerCase()
              const statusCount = (status) => allPayments.filter((payment) => getRoomPaymentTone(payment.status) === status).length
              const filteredPayments = allPayments.filter((payment) => {
                if (roomPaymentsStatus !== 'all' && getRoomPaymentTone(payment.status) !== roomPaymentsStatus) return false
                if (!keyword) return true
                return [
                  payment.type ? formatPaymentType(payment.type) : '',
                  payment.tenantName,
                  payment.note,
                  String(payment.amount ?? ''),
                  formatDate(payment.payment_date),
                  ROOM_PAYMENT_STATUS_LABELS[payment.status],
                  `#${payment.id}`,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase()
                  .includes(keyword)
              })
              const paymentsTotalPages = Math.max(1, Math.ceil(filteredPayments.length / ROOM_PAYMENTS_ALL_PAGE_SIZE))
              const paymentsPage = Math.min(roomPaymentsPage, paymentsTotalPages)
              const pagePayments = filteredPayments.slice((paymentsPage - 1) * ROOM_PAYMENTS_ALL_PAGE_SIZE, paymentsPage * ROOM_PAYMENTS_ALL_PAGE_SIZE)
              const paidTotal = filteredPayments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
              const pendingTotal = filteredPayments.filter((payment) => payment.status === 'pending').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
              const statusFilters = [
                { key: 'all', label: 'ทั้งหมด', count: allPayments.length },
                { key: 'paid', label: 'ชำระแล้ว', count: statusCount('paid') },
                { key: 'pending', label: 'รอตรวจสอบ', count: statusCount('pending') },
                { key: 'danger', label: 'ถูกปฏิเสธ/เกินกำหนด', count: statusCount('danger') },
              ]
              return (
                <div className={`owner-modal-backdrop is-stacked${isRoomPaymentsAllClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomPaymentsAllOpen(false)}>
                  <section className={`owner-modal owner-pa-modal${isRoomPaymentsAllClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-payments-all-title" onClick={(event) => event.stopPropagation()}>
                    <div className="owner-modal-header">
                      <span className="owner-modal-header-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <path d="M2 10h20" />
                        </svg>
                      </span>
                      <div>
                        <h3 id="room-payments-all-title">ประวัติการชำระเงินทั้งหมด</h3>
                        <p className="owner-modal-subtext">
                          ห้อง {detailRoom.room_number}
                          {detailTenant ? ` · ${`${detailTenant.first_name || ''} ${detailTenant.last_name || ''}`.trim()}` : ''}
                          {` · ${allPayments.length} รายการ`}
                        </p>
                      </div>
                      <button type="button" className="owner-modal-close" onClick={() => setRoomPaymentsAllOpen(false)} aria-label="ปิดประวัติการชำระเงิน">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                          <line x1="6" y1="6" x2="18" y2="18" />
                          <line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      </button>
                    </div>

                    <div className="owner-pa-toolbar">
                      <label className="owner-pa-search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          type="search"
                          value={roomPaymentsSearch}
                          onChange={(event) => {
                            setRoomPaymentsSearch(event.target.value)
                            setRoomPaymentsPage(1)
                          }}
                          placeholder="ค้นหาประเภท วันที่ จำนวนเงิน ผู้ชำระ หรือหมายเหตุ"
                          aria-label="ค้นหาประวัติการชำระเงิน"
                        />
                      </label>
                      <div className="owner-pa-filters" role="group" aria-label="กรองสถานะการชำระ">
                        {statusFilters.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={`owner-roomlist-filter${roomPaymentsStatus === item.key ? ' active' : ''}`}
                            aria-pressed={roomPaymentsStatus === item.key}
                            onClick={() => {
                              setRoomPaymentsStatus(item.key)
                              setRoomPaymentsPage(1)
                            }}
                          >
                            {item.label}
                            <span>{item.count}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="owner-modal-body owner-pa-body">
                      <div className="owner-pa-summary">
                        <div>
                          <span>รายการที่แสดง</span>
                          <strong>{filteredPayments.length} รายการ</strong>
                        </div>
                        <div className="is-paid">
                          <span>ยอดชำระแล้ว</span>
                          <strong>฿{formatCurrency(paidTotal)}</strong>
                        </div>
                        <div className="is-pending">
                          <span>ยอดรอตรวจสอบ</span>
                          <strong>฿{formatCurrency(pendingTotal)}</strong>
                        </div>
                      </div>

                      {filteredPayments.length ? (
                        <div className="owner-pa-table" role="table" aria-label="ประวัติการชำระเงิน">
                          <div className="owner-pa-row is-head" role="row">
                            <span role="columnheader">รายการ</span>
                            <span role="columnheader">ผู้ชำระ</span>
                            <span role="columnheader">วันที่ชำระ</span>
                            <span role="columnheader" className="is-amount">จำนวนเงิน</span>
                            <span role="columnheader">สถานะ</span>
                            <span role="columnheader" aria-hidden="true" />
                          </div>
                          {pagePayments.map((payment) => {
                            const tone = getRoomPaymentTone(payment.status)
                            return (
                              <button
                                key={payment.id}
                                type="button"
                                role="row"
                                className={`owner-pa-row is-${tone}`}
                                onClick={() => setRoomPaymentDetail({ ...payment, room_number: detailRoom.room_number, first_name: payment.tenantName || detailTenant?.first_name, last_name: payment.tenantName ? '' : detailTenant?.last_name })}
                              >
                                <span role="cell" className="owner-pa-type">
                                  <span className="owner-rd-payment-icon" aria-hidden="true">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="2" y="5" width="20" height="14" rx="2" />
                                      <path d="M2 10h20" />
                                    </svg>
                                  </span>
                                  <span className="owner-pa-type-text">
                                    <strong>{payment.type ? formatPaymentType(payment.type) : 'ไม่ระบุ'}</strong>
                                    <small>
                                      #{payment.id}
                                      {payment.slip_path && (
                                        <span className="owner-rd-slip-chip">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                                            <path d="M9 7h6M9 11h6" />
                                          </svg>
                                          มีสลิป
                                        </span>
                                      )}
                                    </small>
                                  </span>
                                </span>
                                <span role="cell" className="owner-pa-cell">{payment.tenantName || `${detailTenant?.first_name || ''} ${detailTenant?.last_name || ''}`.trim() || '-'}</span>
                                <span role="cell" className="owner-pa-cell">{formatDate(payment.payment_date)}</span>
                                <span role="cell" className="owner-pa-cell is-amount">฿{formatCurrency(payment.amount)}</span>
                                <span role="cell">
                                  <span className={`owner-rd-payment-status is-${tone}`}>{ROOM_PAYMENT_STATUS_LABELS[payment.status] || payment.status || '-'}</span>
                                </span>
                                <span role="cell" className="owner-rd-payment-arrow" aria-hidden="true">›</span>
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="owner-rd-payments-empty owner-pa-empty">
                          {allPayments.length ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีประวัติการชำระเงิน'}
                        </div>
                      )}
                    </div>
                    {filteredPayments.length > ROOM_PAYMENTS_ALL_PAGE_SIZE && (
                      <div className="owner-pa-footer">
                        <span>
                          แสดง {(paymentsPage - 1) * ROOM_PAYMENTS_ALL_PAGE_SIZE + 1}–{Math.min(paymentsPage * ROOM_PAYMENTS_ALL_PAGE_SIZE, filteredPayments.length)} จาก {filteredPayments.length} รายการ
                        </span>
                        <div className="owner-pa-pager">
                          <button type="button" aria-label="หน้าก่อนหน้า" disabled={paymentsPage <= 1} onClick={() => setRoomPaymentsPage(paymentsPage - 1)}>‹</button>
                          {Array.from({ length: paymentsTotalPages }, (_, index) => index + 1)
                            .filter((pageNumber) => pageNumber === 1 || pageNumber === paymentsTotalPages || Math.abs(pageNumber - paymentsPage) <= 1)
                            .map((pageNumber, index, pages) => (
                              <span key={pageNumber} className="owner-pa-pager-item">
                                {index > 0 && pageNumber - pages[index - 1] > 1 && <span className="owner-pa-pager-gap">…</span>}
                                <button
                                  type="button"
                                  className={pageNumber === paymentsPage ? 'active' : ''}
                                  aria-current={pageNumber === paymentsPage ? 'page' : undefined}
                                  onClick={() => setRoomPaymentsPage(pageNumber)}
                                >
                                  {pageNumber}
                                </button>
                              </span>
                            ))}
                          <button type="button" aria-label="หน้าถัดไป" disabled={paymentsPage >= paymentsTotalPages} onClick={() => setRoomPaymentsPage(paymentsPage + 1)}>›</button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )
            })()}

            {displayRoomPaymentDetail && (() => {
              const payment = displayRoomPaymentDetail
              const tone = getRoomPaymentTone(payment.status)
              const payerName = `${payment.first_name || ''} ${payment.last_name || ''}`.trim() || '-'
              const rows = [
                ['ประเภท', payment.type ? formatPaymentType(payment.type) : 'ไม่ระบุ'],
                ['วันที่ชำระ', formatDate(payment.payment_date)],
                ['บันทึกเมื่อ', payment.created_at ? new Date(payment.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'],
                ['ห้อง', `ห้อง ${payment.room_number || '-'}`],
                ['ผู้ชำระ', payerName],
                ['เลขที่รายการ', `#${payment.id}`],
              ]
              return (
                <div className={`owner-modal-backdrop is-stacked is-top${isRoomPaymentDetailClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomPaymentDetail(null)}>
                  <section className={`owner-modal owner-pd-modal${isRoomPaymentDetailClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-payment-title" onClick={(event) => event.stopPropagation()}>
                    <div className="owner-modal-header">
                      <span className="owner-modal-header-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                          <path d="M9 7h6M9 11h6M9 15h4" />
                        </svg>
                      </span>
                      <div>
                        <h3 id="room-payment-title">รายละเอียดการชำระเงิน</h3>
                        <p className="owner-modal-subtext">ห้อง {payment.room_number || '-'} · {payerName}</p>
                      </div>
                      <button type="button" className="owner-modal-close" onClick={() => setRoomPaymentDetail(null)} aria-label="ปิดรายละเอียดการชำระเงิน">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                          <line x1="6" y1="6" x2="18" y2="18" />
                          <line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      </button>
                    </div>
                    <div className="owner-modal-body">
                      <div className={`owner-pd-hero is-${tone}`}>
                        <span>ยอดชำระ</span>
                        <strong>฿{formatCurrency(payment.amount)}</strong>
                        <span className={`owner-rd-payment-status is-${tone}`}>{ROOM_PAYMENT_STATUS_LABELS[payment.status] || payment.status || '-'}</span>
                      </div>

                      <dl className="owner-pd-rows">
                        {rows.map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>

                      <div className={`owner-pd-note${payment.note ? '' : ' is-empty'}`}>
                        <span className="owner-pd-note-icon" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
                            <path d="M14 3v6h6M8 13h8M8 17h5" />
                          </svg>
                        </span>
                        <div>
                          <span className="owner-pd-note-label">หมายเหตุ</span>
                          <p>{payment.note || 'ไม่มีหมายเหตุสำหรับรายการนี้'}</p>
                        </div>
                      </div>

                      <div className="owner-pd-slip">
                        <span className="owner-pd-slip-label">สลิปโอนเงิน</span>
                        {payment.slip_path ? (
                          <button type="button" className="owner-pd-slip-thumb" onClick={() => openPaymentSlip(payment)}>
                            <UploadImage src={payment.slip_path} alt="สลิปโอนเงิน" loading="lazy" />
                            <span>ดูสลิปขนาดเต็ม</span>
                          </button>
                        ) : (
                          <div className="owner-rd-payments-empty is-compact">ไม่มีสลิปแนบ (ชำระเงินสด/บันทึกโดยเจ้าหน้าที่)</div>
                        )}
                      </div>

                    </div>
                    {payment.status === 'pending' && payment.slip_path && (
                      <div className="owner-pd-actions owner-modal-footer">
                        <button
                          type="button"
                          className="owner-payment-reject"
                          disabled={reviewingSlipId === payment.id}
                          onClick={async () => {
                            if (await reviewOwnerPaymentSlip(payment, 'rejected')) setRoomPaymentDetail(null)
                          }}
                        >
                          ปฏิเสธสลิป
                        </button>
                        <button
                          type="button"
                          className="owner-payment-approve"
                          disabled={reviewingSlipId === payment.id}
                          onClick={async () => {
                            if (await reviewOwnerPaymentSlip(payment, 'approved')) setRoomPaymentDetail(null)
                          }}
                        >
                          อนุมัติสลิป
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              )
            })()}

            {displayRoomListFilter && (
              <div className={`owner-modal-backdrop${isRoomListClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomListFilter(null)}>
                <section className={`owner-modal owner-roomlist-modal${isRoomListClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-list-title" onClick={(event) => event.stopPropagation()}>
                  <div className="owner-modal-header has-search">
                    <div>
                      <h3 id="room-list-title">{ROOM_LIST_FILTERS.find((item) => item.key === displayRoomListFilter)?.title || 'ห้องทั้งหมด'}</h3>
                      <p className="owner-modal-subtext">
                        {roomListKeyword ? `พบ ${visibleRoomListItems.length} จาก ${roomListItems.length} ห้อง` : `${roomListItems.length} ห้อง · คลิกที่ห้องเพื่อดูรายละเอียด`}
                      </p>
                    </div>
                    <label className="owner-modal-search">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="search"
                        value={roomListSearch}
                        onChange={(event) => setRoomListSearch(event.target.value)}
                        placeholder="ค้นหาเลขห้อง ชื่อผู้เช่า หรือเบอร์โทร"
                        aria-label="ค้นหาห้อง"
                      />
                    </label>
                    <button type="button" className="owner-modal-close" onClick={() => setRoomListFilter(null)} aria-label="ปิดรายการห้อง">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div className="owner-roomlist-filters" role="group" aria-label="กรองสถานะห้อง">
                    {ROOM_LIST_FILTERS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`owner-roomlist-filter${displayRoomListFilter === item.key ? ' active' : ''}`}
                        aria-pressed={displayRoomListFilter === item.key}
                        onClick={() => setRoomListFilter(item.key)}
                      >
                        {item.label}
                        <span>{roomListCounts[item.key] ?? 0}</span>
                      </button>
                    ))}
                  </div>

                  <div className="owner-modal-body">
                    {visibleRoomListItems.length ? (
                      <div className="owner-roomlist-grid">
                        {visibleRoomListItems.map((room) => (
                          <button
                            key={room.room_number}
                            type="button"
                            className={`owner-roomlist-card is-${room.status || 'vacant'}`}
                            onClick={() => {
                              setRoomListFilter(null)
                              handleRoomClick(room)
                            }}
                          >
                            <span className="owner-roomlist-card-head">
                              <span className="owner-roomlist-card-icon" aria-hidden="true">
                                <StatIcon name={room.status === 'maintenance' ? 'maintenance' : 'rooms'} />
                              </span>
                              <span className="owner-roomlist-card-title">
                                <strong>ห้อง {room.room_number}</strong>
                                <em>{room.price != null ? `฿${formatCurrency(room.price)}/เดือน` : 'ไม่ระบุราคา'}</em>
                              </span>
                              <span className="owner-roomlist-card-status">{ROOM_STATUS_LABELS[room.status] || 'ว่าง'}</span>
                            </span>
                            <span className="owner-roomlist-card-grid">
                              <span className="owner-roomlist-card-cell">
                                <small>ผู้เช่า</small>
                                <strong>{`${room.first_name || ''} ${room.last_name || ''}`.trim() || '-'}</strong>
                              </span>
                              <span className="owner-roomlist-card-cell">
                                <small>เบอร์โทร</small>
                                <strong>{room.phone || '-'}</strong>
                              </span>
                            </span>
                            <span className="owner-roomlist-card-foot">
                              <span>
                                {room.customer_id && room.rental_end_date
                                  ? `สัญญาถึง ${formatDate(room.rental_end_date)}`
                                  : room.status === 'vacant'
                                    ? 'พร้อมให้เช่า'
                                    : room.status === 'maintenance'
                                      ? 'อยู่ระหว่างซ่อมบำรุง'
                                      : 'ไม่มีข้อมูลสัญญา'}
                              </span>
                              <span className="owner-roomlist-card-more">
                                ดูรายละเอียด
                                <span aria-hidden="true">›</span>
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="owner-ov-list-empty">{roomListKeyword ? 'ไม่พบห้องที่ตรงกับคำค้นหา' : 'ไม่มีห้องในหมวดนี้'}</div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </>
        )}

        {displayConfirmDialog && (
          <div className={`owner-modal-backdrop owner-confirm-backdrop${isConfirmDialogClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => resolveConfirm(false)}>
            <section
              className={`owner-modal owner-confirm-modal is-${displayConfirmDialog.tone || 'primary'}${isConfirmDialogClosing ? ' is-closing' : ''}`}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="owner-confirm-title"
              aria-describedby="owner-confirm-message"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="owner-confirm-body">
                <span className="owner-confirm-icon" aria-hidden="true">
                  {displayConfirmDialog.tone === 'danger' ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v5M12 16h.01" />
                    </svg>
                  ) : displayConfirmDialog.tone === 'success' ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="m8 12.5 2.8 2.8L16 10" />
                    </svg>
                  ) : (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 11v5M12 8h.01" />
                    </svg>
                  )}
                </span>
                <h3 id="owner-confirm-title">{displayConfirmDialog.title}</h3>
                <p id="owner-confirm-message">{displayConfirmDialog.message}</p>
                {displayConfirmDialog.details?.length > 0 && (
                  <dl className="owner-confirm-details">
                    {displayConfirmDialog.details.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <div className="owner-confirm-actions">
                <button type="button" className="owner-confirm-cancel" onClick={() => resolveConfirm(false)}>
                  {displayConfirmDialog.cancelLabel || 'ยกเลิก'}
                </button>
                <button type="button" className="owner-confirm-ok" onClick={() => resolveConfirm(true)} autoFocus>
                  {displayConfirmDialog.confirmLabel || 'ยืนยัน'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default OwnerMain
