import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/CustomerDashbord.css'

const AMENITIES = [
  { key: 'air_conditioner', label: 'แอร์', color: 'blue' },
  { key: 'wifi', label: 'ไวไฟ', color: 'purple' },
  { key: 'refrigerator', label: 'ตู้เย็น', color: 'teal' },
  { key: 'bathroom', label: 'ห้องน้ำในตัว', color: 'amber' },
  { key: 'cctv', label: 'กล้องวงจรปิด', color: 'red' },
]

const AMENITY_ICON_PATHS = {
  air_conditioner: (
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
  ),
  wifi: (
    <>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </>
  ),
  refrigerator: (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="5" y1="10" x2="19" y2="10" />
      <line x1="9" y1="6" x2="9" y2="8" />
      <line x1="9" y1="14" x2="9" y2="16" />
    </>
  ),
  bathroom: <path d="M12 2.69 17.66 8.35a8 8 0 1 1-11.31 0z" />,
  cctv: (
    <>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </>
  ),
  bed: (
    <>
      <path d="M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6" />
      <path d="M2 21v-3" />
      <path d="M22 21v-3" />
      <path d="M6 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
    </>
  ),
}

function AmenityIcon({ name }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {AMENITY_ICON_PATHS[name]}
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function Modal({ title, onClose, children, variant }) {
  const [isClosing, setIsClosing] = useState(false)

  const requestClose = () => setIsClosing(true)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      className={`dashboard-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`dashboard-modal${variant === 'confirm' ? ' dashboard-modal-confirm' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dashboard-modal-header">
          <h3>{title}</h3>
          <button type="button" className="dashboard-modal-close" onClick={requestClose} aria-label="ปิด">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="dashboard-modal-body">
          {typeof children === 'function' ? children(requestClose) : children}
        </div>
      </div>
    </div>
  )
}

const FAKE_QR_SIZE = 21

function isInFinderPattern(row, col, size) {
  const corners = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]
  return corners.some(([r, c]) => row >= r && row < r + 7 && col >= c && col < c + 7)
}

function finderModuleOn(row, col, size) {
  const corners = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]
  for (const [r0, c0] of corners) {
    if (row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7) {
      const localRow = row - r0
      const localCol = col - c0
      const ring = localRow === 0 || localRow === 6 || localCol === 0 || localCol === 6
      const core = localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4
      return ring || core
    }
  }
  return false
}

function pseudoRandomModuleOn(row, col) {
  const value = Math.sin(row * 12.9898 + col * 78.233) * 43758.5453
  return value - Math.floor(value) > 0.55
}

function FakeQrCode() {
  const modules = []
  for (let row = 0; row < FAKE_QR_SIZE; row++) {
    for (let col = 0; col < FAKE_QR_SIZE; col++) {
      const on = isInFinderPattern(row, col, FAKE_QR_SIZE)
        ? finderModuleOn(row, col, FAKE_QR_SIZE)
        : pseudoRandomModuleOn(row, col)
      if (on) modules.push(`${row}-${col}`)
    }
  }

  return (
    <svg
      viewBox={`0 0 ${FAKE_QR_SIZE} ${FAKE_QR_SIZE}`}
      className="dashboard-fake-qr"
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR สำหรับสแกนชำระเงิน"
    >
      <rect width={FAKE_QR_SIZE} height={FAKE_QR_SIZE} fill="#fff" />
      {modules.map((key) => {
        const [row, col] = key.split('-').map(Number)
        return <rect key={key} x={col} y={row} width={1} height={1} fill="#0f2b52" />
      })}
    </svg>
  )
}

const STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอชำระ',
  overdue: 'ค้างชำระ',
}

const DUE_STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอตรวจสอบ',
  due: 'ยังไม่ครบกำหนด',
  overdue: 'ค้างชำระ',
}

function dueBadgeClass(status) {
  if (status === 'paid') return 'paid'
  if (status === 'overdue') return 'overdue'
  if (status === 'pending') return 'pending'
  return 'due'
}

const TENANT_REQUEST_TYPE_LABEL = {
  renew: 'ต่อสัญญา',
  moveout: 'แจ้งย้ายออก',
}

const TENANT_REQUEST_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'รับเรื่องแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
}

const RENEW_DURATION_OPTIONS = [
  { value: '1', label: '1 เดือน' },
  { value: '3', label: '3 เดือน' },
  { value: '6', label: '6 เดือน' },
  { value: '12', label: '1 ปี (12 เดือน)' },
]

const RENEW_PAYMENT_TYPE_OPTIONS = [
  { value: 'monthly', label: 'จ่ายรายเดือน' },
  { value: 'lump_sum', label: 'จ่ายล่วงหน้าทั้งก้อน' },
]

const RENEW_DURATION_LABEL = Object.fromEntries(RENEW_DURATION_OPTIONS.map((option) => [option.value, option.label]))
const RENEW_PAYMENT_TYPE_LABEL = Object.fromEntries(
  RENEW_PAYMENT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
)

function tenantRequestBadgeClass(status) {
  if (status === 'approved') return 'paid'
  if (status === 'rejected') return 'overdue'
  if (status === 'in_progress') return 'in-progress'
  return 'pending'
}

const MOVEOUT_APPROVED_CONTACT_MESSAGE =
  'คำขอแจ้งย้ายออกของคุณได้รับการอนุมัติแล้ว กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อดำเนินการคืนกุญแจและตรวจสอบเงินประกันคืน'

const MOVEOUT_IN_PROGRESS_CONTACT_MESSAGE =
  'เจ้าหน้าที่รับเรื่องแจ้งย้ายออกของคุณแล้ว กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อพูดคุยรายละเอียดเพิ่มเติม'

const MOVEOUT_REJECTED_CONTACT_MESSAGE =
  'คำขอแจ้งย้ายออกของคุณถูกปฏิเสธ กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อสอบถามรายละเอียดเพิ่มเติม'

const MOVEOUT_STATUS_POPUP_CONTENT = {
  in_progress: { title: 'เจ้าหน้าที่รับเรื่องแล้ว', message: MOVEOUT_IN_PROGRESS_CONTACT_MESSAGE, icon: 'info' },
  approved: { title: 'แจ้งย้ายออกได้รับการอนุมัติ', message: MOVEOUT_APPROVED_CONTACT_MESSAGE, icon: 'success' },
  rejected: { title: 'คำขอแจ้งย้ายออกไม่ได้รับการอนุมัติ', message: MOVEOUT_REJECTED_CONTACT_MESSAGE, icon: 'danger' },
}

const RENEW_RESUBMIT_WINDOW_MS = 10 * 24 * 60 * 60 * 1000

const RENEW_STATUS_POPUP_CONTENT = {
  in_progress: {
    title: 'เจ้าหน้าที่รับเรื่องแล้ว',
    message: 'เจ้าหน้าที่รับเรื่องคำขอต่อสัญญาของคุณแล้ว กรุณารอการติดต่อกลับจากเจ้าหน้าที่',
    icon: 'info',
  },
  approved: {
    title: 'ต่อสัญญาสำเร็จ',
    message: 'คำขอต่อสัญญาของคุณได้รับการอนุมัติแล้ว ระบบได้ขยายระยะเวลาสัญญาเช่าให้เรียบร้อยแล้ว',
    icon: 'success',
  },
}

const MAINTENANCE_STATUS_POPUP_CONTENT = {
  in_progress: {
    title: 'เจ้าหน้าที่รับเรื่องแล้ว',
    message: 'เจ้าหน้าที่รับเรื่องแจ้งซ่อมของคุณแล้ว กำลังดำเนินการซ่อมแซม',
    icon: 'info',
  },
  done: {
    title: 'ซ่อมเสร็จสิ้นแล้ว',
    message: 'การแจ้งซ่อมของคุณดำเนินการเสร็จสิ้นแล้ว ขอบคุณที่แจ้งให้เราทราบ',
    icon: 'success',
  },
  cancelled: {
    title: 'รายการแจ้งซ่อมถูกยกเลิก',
    message: 'รายการแจ้งซ่อมของคุณถูกยกเลิกโดยเจ้าหน้าที่ กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์หากต้องการสอบถามเพิ่มเติม',
    icon: 'muted',
  },
}

const CONTRACT_STATUS_POPUP_CONTENT = {
  warning: {
    title: 'สัญญาใกล้หมดอายุ',
    message: 'สัญญาเช่าห้องของคุณใกล้ครบกำหนดแล้ว กรุณาต่อสัญญาหรือแจ้งย้ายออกล่วงหน้า',
    icon: 'info',
  },
  final: {
    title: 'สัญญาใกล้หมดอายุมากแล้ว',
    message: 'สัญญาเช่าห้องของคุณกำลังจะหมดอายุในอีกไม่กี่วัน กรุณาดำเนินการต่อสัญญาหรือแจ้งย้ายออกโดยเร็วที่สุด',
    icon: 'danger',
  },
}

const STATUS_POPUP_CONTENT_BY_KIND = {
  moveout: MOVEOUT_STATUS_POPUP_CONTENT,
  renew: RENEW_STATUS_POPUP_CONTENT,
  maintenance: MAINTENANCE_STATUS_POPUP_CONTENT,
  contract: CONTRACT_STATUS_POPUP_CONTENT,
}

function StatusIconPaths({ tone }) {
  if (tone === 'success') return <polyline points="20 6 9 17 4 12" />
  if (tone === 'danger') {
    return (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    )
  }
  return (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  )
}

const TENANT_REQUEST_NOTIF_INFO = {
  in_progress: { label: 'เจ้าหน้าที่รับเรื่องแล้ว', tone: 'info' },
  approved: { label: 'อนุมัติแล้ว', tone: 'success' },
  rejected: { label: 'ถูกปฏิเสธ', tone: 'danger' },
}

const MAINTENANCE_NOTIF_INFO = {
  in_progress: { label: 'กำลังดำเนินการ', tone: 'info' },
  done: { label: 'ซ่อมเสร็จสิ้นแล้ว', tone: 'success' },
  cancelled: { label: 'ถูกยกเลิก', tone: 'muted' },
}

const TENANT_REQUEST_FINAL_LOG_LABEL = {
  approved: 'อนุมัติคำขอ',
  rejected: 'ปฏิเสธคำขอ',
}

const MAINTENANCE_FINAL_LOG_LABEL = {
  done: 'ซ่อมเสร็จสิ้น',
  cancelled: 'ยกเลิกรายการ',
}

function getRequestTimeline(kind, request) {
  if (!request) return []
  const steps = [{ label: kind === 'maintenance' ? 'แจ้งซ่อม' : 'ส่งคำขอ', date: request.created_at }]
  if (request.accepted_at) {
    steps.push({ label: 'เจ้าหน้าที่รับเรื่อง', date: request.accepted_at })
  }
  const finalLabel = kind === 'maintenance' ? MAINTENANCE_FINAL_LOG_LABEL[request.status] : TENANT_REQUEST_FINAL_LOG_LABEL[request.status]
  if (finalLabel) {
    // completed_at may be missing on older records transitioned before this timestamp was tracked
    steps.push({ label: finalLabel, date: request.completed_at || request.accepted_at || request.created_at })
  }
  return steps
}

function RequestTimeline({ kind, request }) {
  const timeline = getRequestTimeline(kind, request)
  if (timeline.length === 0) return null

  return (
    <div className="dashboard-request-log">
      <div className="dashboard-request-log-items">
        {timeline.map((step, index) => {
          const prevStep = timeline[index - 1]
          const stepMs = prevStep ? new Date(step.date).getTime() - new Date(prevStep.date).getTime() : null
          return (
            <div key={step.label} className="dashboard-request-log-item">
              <span className="dashboard-request-log-dot" />
              <div className="dashboard-request-log-content">
                <p className="dashboard-request-log-label">{step.label}</p>
                <p className="dashboard-request-log-date">{formatDateTime(step.date)}</p>
                {stepMs !== null && <p className="dashboard-request-log-duration">ใช้เวลา {formatRemaining(stepMs)}</p>}
              </div>
            </div>
          )
        })}
      </div>
      {timeline.length > 1 && (
        <p className="dashboard-request-log-total">
          รวมใช้เวลาทั้งหมด{' '}
          {formatRemaining(
            new Date(timeline[timeline.length - 1].date).getTime() - new Date(timeline[0].date).getTime(),
          )}
        </p>
      )}
    </div>
  )
}

const NOTIF_PAGE_SIZE = 6
const MAINTENANCE_PAGE_SIZE = 5

const MAINTENANCE_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
}

function maintenanceBadgeClass(status) {
  if (status === 'done') return 'paid'
  if (status === 'in_progress') return 'due'
  if (status === 'cancelled') return 'cancelled'
  return 'pending'
}

const MAINTENANCE_CATEGORY_OPTIONS = [
  { value: 'electrical', label: 'ไฟฟ้า' },
  { value: 'plumbing', label: 'ประปา' },
  { value: 'aircon', label: 'เครื่องปรับอากาศ' },
  { value: 'furniture', label: 'เฟอร์นิเจอร์ / สิ่งอำนวยความสะดวก' },
  { value: 'other', label: 'อื่นๆ' },
]

const MAINTENANCE_TIME_OPTIONS = [
  { value: 'anytime', label: 'เวลาไหนก็ได้' },
  { value: 'morning', label: 'ช่วงเช้า (08:00-12:00)' },
  { value: 'afternoon', label: 'ช่วงบ่าย (12:00-16:00)' },
  { value: 'evening', label: 'ช่วงเย็น (16:00-19:00)' },
]

const MAINTENANCE_CATEGORY_LABEL = Object.fromEntries(
  MAINTENANCE_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
)
const MAINTENANCE_TIME_LABEL = Object.fromEntries(
  MAINTENANCE_TIME_OPTIONS.map((option) => [option.value, option.label]),
)

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function formatRentalDuration(startValue, endValue) {
  if (!startValue || !endValue) return null
  const start = new Date(startValue)
  const end = new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
  if (totalDays <= 0) return null

  if (totalDays % 365 === 0) {
    return `สัญญาเช่า ${totalDays / 365} ปี`
  }
  if (totalDays % 30 === 0) {
    return `สัญญาเช่า ${totalDays / 30} เดือน`
  }
  if (totalDays % 7 === 0) {
    return `สัญญาเช่า ${totalDays / 7} สัปดาห์`
  }
  return `สัญญาเช่า ${totalDays} วัน`
}

function msUntil(value) {
  if (!value) return null
  return new Date(value).getTime() - Date.now()
}

const CONTRACT_WARNING_WINDOW_MS = 30 * MS_PER_DAY
const CONTRACT_FINAL_WARNING_WINDOW_MS = 3 * MS_PER_DAY

function getContractMsLeft(room) {
  if (!room?.is_booked) return null
  const msUntilStart = msUntil(room.rental_start_date)
  if (msUntilStart === null || msUntilStart > 0) return null
  return msUntil(room.rental_end_date)
}

function formatRemaining(ms) {
  const totalMinutes = Math.floor(Math.abs(ms) / (1000 * 60))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const parts = []
  if (days > 0) parts.push(`${days} วัน`)
  if (hours > 0) parts.push(`${hours} ชั่วโมง`)
  if (days === 0 && minutes > 0) parts.push(`${minutes} นาที`)
  return parts.length > 0 ? parts.join(' ') : 'น้อยกว่า 1 นาที'
}

function CustomerDashbord() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifClosing, setNotifClosing] = useState(false)
  const [notifSeen, setNotifSeen] = useState(false)
  const [notifPage, setNotifPage] = useState(1)
  const [notifDetail, setNotifDetail] = useState(null)
  const notifRef = useRef(null)

  const closeNotifPanel = () => setNotifClosing(true)

  useEffect(() => {
    if (!notifOpen) return
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        closeNotifPanel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen])

  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentSuccess, setPaymentSuccess] = useState('')

  const [activeRequestType, setActiveRequestType] = useState(null)
  const [requestNote, setRequestNote] = useState('')
  const [renewDurationMonths, setRenewDurationMonths] = useState(RENEW_DURATION_OPTIONS[2].value)
  const [renewPaymentType, setRenewPaymentType] = useState(RENEW_PAYMENT_TYPE_OPTIONS[0].value)
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestSuccess, setRequestSuccess] = useState('')

  const [statusPopup, setStatusPopup] = useState(null)

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [maintenanceText, setMaintenanceText] = useState('')
  const [maintenanceCategory, setMaintenanceCategory] = useState(MAINTENANCE_CATEGORY_OPTIONS[0].value)
  const [maintenancePreferredTime, setMaintenancePreferredTime] = useState(MAINTENANCE_TIME_OPTIONS[0].value)
  const [maintenanceContactPhone, setMaintenanceContactPhone] = useState('')
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState('')
  const [maintenanceSuccess, setMaintenanceSuccess] = useState('')
  const [cancelingMaintenanceId, setCancelingMaintenanceId] = useState(null)
  const [confirmCancelId, setConfirmCancelId] = useState(null)
  const [maintenancePage, setMaintenancePage] = useState(1)
  const [maintenanceSearch, setMaintenanceSearch] = useState('')
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState('all')

  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')

  useEffect(() => {
    const isAnyOverlayOpen =
      showPaymentForm ||
      Boolean(activeRequestType) ||
      Boolean(statusPopup) ||
      showMaintenanceForm ||
      confirmCancelId !== null ||
      notifOpen ||
      Boolean(notifDetail)

    if (!isAnyOverlayOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [
    showPaymentForm,
    activeRequestType,
    statusPopup,
    showMaintenanceForm,
    confirmCancelId,
    notifOpen,
    notifDetail,
  ])

  const maybeShowStatusPopups = (dashboardData) => {
    const tryShowStatusPopup = (kind, status, id, request) => {
      if (!STATUS_POPUP_CONTENT_BY_KIND[kind]?.[status]) return false
      if (status === 'in_progress') {
        setStatusPopup({ kind, status, request })
        return true
      }
      const seenKey = `${kind}_${status}_notice_seen_${id}`
      if (localStorage.getItem(seenKey)) return false
      localStorage.setItem(seenKey, '1')
      setStatusPopup({ kind, status, request })
      return true
    }

    const moveoutRequest = dashboardData?.tenantRequests?.find((request) => request.type === 'moveout')
    if (moveoutRequest && tryShowStatusPopup('moveout', moveoutRequest.status, moveoutRequest.id, moveoutRequest)) return

    const contractMsLeft = getContractMsLeft(dashboardData?.room)
    if (contractMsLeft !== null && contractMsLeft >= 0 && contractMsLeft <= CONTRACT_WARNING_WINDOW_MS) {
      const contractKey = `${dashboardData.room.room_number}_${dashboardData.room.rental_end_date}`
      const status = contractMsLeft <= CONTRACT_FINAL_WARNING_WINDOW_MS ? 'final' : 'warning'
      if (tryShowStatusPopup('contract', status, contractKey)) return
    }

    const renewRequest = dashboardData?.tenantRequests?.find((request) => request.type === 'renew')
    if (renewRequest && tryShowStatusPopup('renew', renewRequest.status, renewRequest.id, renewRequest)) return

    const latestMaintenance = dashboardData?.maintenanceRequests?.[0]
    if (latestMaintenance) tryShowStatusPopup('maintenance', latestMaintenance.status, latestMaintenance.id, latestMaintenance)
  }

  const loadDashboard = () => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true })
      return Promise.resolve()
    }

    return axios
      .get('/api/customer/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        setData(data)
        setError('')
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    let isMounted = true
    const token = sessionStorage.getItem('token')

    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    axios
      .get('/api/customer/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        if (isMounted) {
          setData(data)
          const justLoggedIn = sessionStorage.getItem('justLoggedIn') === '1'
          sessionStorage.removeItem('justLoggedIn')
          if (justLoggedIn) maybeShowStatusPopups(data)
        }
      })
      .catch((err) => {
        if (!isMounted) return
        if (err.response?.status === 401) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const openPaymentForm = () => {
    setPaymentError('')
    setPaymentSuccess('')
    setShowPaymentForm(true)
  }

  const handleConfirmPayment = async (event) => {
    event.preventDefault()
    const token = sessionStorage.getItem('token')
    setPaymentSubmitting(true)
    setPaymentError('')
    try {
      const { data: result } = await axios.post(
        '/api/customer/payments/confirm',
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setPaymentSuccess(result.message || 'ชำระเงินสำเร็จ')
      setShowPaymentForm(false)
      await loadDashboard()
    } catch (err) {
      setPaymentError(err.response?.data?.message || 'ชำระเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  const openRequestForm = (type) => {
    setActiveRequestType(type)
    setRequestNote('')
    setRenewDurationMonths(RENEW_DURATION_OPTIONS[2].value)
    setRenewPaymentType(RENEW_PAYMENT_TYPE_OPTIONS[0].value)
    setRequestError('')
    setRequestSuccess('')
  }

  const handleRequestSubmit = async (event) => {
    event.preventDefault()
    const token = sessionStorage.getItem('token')
    setRequestSubmitting(true)
    setRequestError('')
    try {
      const payload = { type: activeRequestType, note: requestNote.trim() || undefined }
      if (activeRequestType === 'renew') {
        payload.renew_duration_months = Number(renewDurationMonths)
        payload.renew_payment_type = renewPaymentType
      }
      const { data: result } = await axios.post('/api/customer/requests', payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setRequestSuccess(result.message || 'ส่งคำขอสำเร็จ')
      setActiveRequestType(null)
      await loadDashboard()
    } catch (err) {
      setRequestError(err.response?.data?.message || 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setRequestSubmitting(false)
    }
  }

  const openMaintenanceForm = () => {
    setMaintenanceText('')
    setMaintenanceCategory(MAINTENANCE_CATEGORY_OPTIONS[0].value)
    setMaintenancePreferredTime(MAINTENANCE_TIME_OPTIONS[0].value)
    setMaintenanceContactPhone(data?.customer?.phone || '')
    setMaintenanceError('')
    setMaintenanceSuccess('')
    setShowMaintenanceForm(true)
  }

  const handleMaintenanceSubmit = async (event) => {
    event.preventDefault()
    const description = maintenanceText.trim()
    if (!description) {
      setMaintenanceError('กรุณากรอกรายละเอียดปัญหา')
      return
    }
    const token = sessionStorage.getItem('token')
    setMaintenanceSubmitting(true)
    setMaintenanceError('')
    try {
      const { data: result } = await axios.post(
        '/api/customer/maintenance',
        {
          description,
          category: maintenanceCategory,
          preferredTime: maintenancePreferredTime,
          contactPhone: maintenanceContactPhone.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setMaintenanceSuccess(result.message || 'แจ้งซ่อมสำเร็จ')
      setMaintenanceText('')
      setShowMaintenanceForm(false)
      await loadDashboard()
    } catch (err) {
      setMaintenanceError(err.response?.data?.message || 'แจ้งซ่อมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setMaintenanceSubmitting(false)
    }
  }

  const handleCancelMaintenance = async (id) => {
    const token = sessionStorage.getItem('token')
    setMaintenanceError('')
    setMaintenanceSuccess('')
    setCancelingMaintenanceId(id)
    try {
      const { data: result } = await axios.post(
        `/api/customer/maintenance/${id}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setMaintenanceSuccess(result.message || 'ยกเลิกรายการแจ้งซ่อมสำเร็จ')
      await loadDashboard()
      return true
    } catch (err) {
      setMaintenanceError(err.response?.data?.message || 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setCancelingMaintenanceId(null)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-page d-flex align-items-center justify-content-center">
        <p className="text-muted">กำลังโหลดข้อมูล...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="container">
          <div className="alert alert-danger">{error}</div>
        </div>
      </div>
    )
  }

  const { customer, room, rentalHistory, currentDue, maintenanceRequests = [], tenantRequests = [] } = data
  const prepaidUntilDate = room?.prepaid_until ? new Date(room.prepaid_until) : null
  const isPrepaid = prepaidUntilDate && !currentDue && prepaidUntilDate > new Date()
  const msUntilStart = room?.is_booked ? msUntil(room.rental_start_date) : null
  const hasStarted = msUntilStart !== null && msUntilStart <= 0
  const msLeft = hasStarted ? msUntil(room.rental_end_date) : null
  const isExpired = msLeft !== null && msLeft < 0
  const isWarning = msLeft !== null && msLeft >= 0 && msLeft <= CONTRACT_WARNING_WINDOW_MS

  const latestRequestByType = (type) => tenantRequests.find((request) => request.type === type)
  const renewRequest = latestRequestByType('renew')
  const moveoutRequest = latestRequestByType('moveout')

  const canResubmitRenew =
    !renewRequest
    || renewRequest.status === 'rejected'
    || (renewRequest.status === 'approved' && msLeft !== null && msLeft <= RENEW_RESUBMIT_WINDOW_MS)

  const buildTenantRequestNotifs = (request) => {
    const items = []
    if (request.accepted_at) {
      items.push({
        key: `tenant-${request.id}-in_progress`,
        title: TENANT_REQUEST_TYPE_LABEL[request.type] || request.type,
        ...TENANT_REQUEST_NOTIF_INFO.in_progress,
        date: request.accepted_at,
        detail: request.note ? `หมายเหตุของคุณ: ${request.note}` : null,
        kind: 'tenant',
        request,
      })
    }
    if (request.status !== 'in_progress' && TENANT_REQUEST_NOTIF_INFO[request.status]) {
      items.push({
        key: `tenant-${request.id}-${request.status}`,
        title: TENANT_REQUEST_TYPE_LABEL[request.type] || request.type,
        ...TENANT_REQUEST_NOTIF_INFO[request.status],
        date: request.completed_at || request.created_at,
        detail:
          (request.type === 'moveout' && MOVEOUT_STATUS_POPUP_CONTENT[request.status]?.message)
          || (request.note ? `หมายเหตุของคุณ: ${request.note}` : null),
        kind: 'tenant',
        request,
      })
    }
    return items
  }

  const buildMaintenanceNotifs = (request) => {
    const items = []
    if (request.accepted_at) {
      items.push({
        key: `maintenance-${request.id}-in_progress`,
        title: 'แจ้งซ่อม',
        ...MAINTENANCE_NOTIF_INFO.in_progress,
        date: request.accepted_at,
        detail: request.description || null,
        kind: 'maintenance',
        request,
      })
    }
    if (request.status !== 'in_progress' && MAINTENANCE_NOTIF_INFO[request.status]) {
      items.push({
        key: `maintenance-${request.id}-${request.status}`,
        title: 'แจ้งซ่อม',
        ...MAINTENANCE_NOTIF_INFO[request.status],
        date: request.completed_at || request.created_at,
        detail: request.description || null,
        kind: 'maintenance',
        request,
      })
    }
    return items
  }

  const notifications = [
    ...tenantRequests.flatMap(buildTenantRequestNotifs),
    ...maintenanceRequests.flatMap(buildMaintenanceNotifs),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  const notifTotalPages = Math.max(1, Math.ceil(notifications.length / NOTIF_PAGE_SIZE))
  const notifCurrentPage = Math.min(notifPage, notifTotalPages)
  const paginatedNotifications = notifications.slice(
    (notifCurrentPage - 1) * NOTIF_PAGE_SIZE,
    notifCurrentPage * NOTIF_PAGE_SIZE,
  )

  const maintenanceKeyword = maintenanceSearch.trim().toLowerCase()
  const filteredMaintenanceRequests = maintenanceRequests.filter((item) => {
    if (maintenanceStatusFilter !== 'all' && item.status !== maintenanceStatusFilter) return false
    if (maintenanceKeyword) {
      const haystack = [
        item.description,
        MAINTENANCE_CATEGORY_LABEL[item.category],
        MAINTENANCE_TIME_LABEL[item.preferred_time],
        item.contact_phone,
        MAINTENANCE_STATUS_LABEL[item.status],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(maintenanceKeyword)) return false
    }
    return true
  })

  const maintenanceTotalPages = Math.max(1, Math.ceil(filteredMaintenanceRequests.length / MAINTENANCE_PAGE_SIZE))
  const maintenanceCurrentPage = Math.min(maintenancePage, maintenanceTotalPages)
  const paginatedMaintenanceRequests = filteredMaintenanceRequests.slice(
    (maintenanceCurrentPage - 1) * MAINTENANCE_PAGE_SIZE,
    maintenanceCurrentPage * MAINTENANCE_PAGE_SIZE,
  )

  const historyKeyword = historySearch.trim().toLowerCase()
  const filteredRentalHistory = rentalHistory.map((entry) => {
    const payments = entry.payments.filter((payment) => {
      if (historyStatusFilter !== 'all' && payment.status !== historyStatusFilter) return false
      if (historyKeyword) {
        const haystack = [
          formatDateTime(payment.created_at),
          formatCurrency(payment.amount),
          STATUS_LABEL[payment.status] || payment.status,
          payment.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(historyKeyword)) return false
      }
      return true
    })
    return { ...entry, payments, hasOriginalPayments: entry.payments.length > 0 }
  })

  const reminders = []
  if (room?.is_booked) {
    if (isExpired) {
      reminders.push({ type: 'danger', text: `สัญญาเช่าห้อง ${room.room_number} หมดอายุแล้ว กรุณาต่อสัญญาหรือแจ้งย้ายออก` })
    } else if (isWarning) {
      reminders.push({ type: 'warning', text: `สัญญาเช่าห้อง ${room.room_number} ใกล้หมดอายุ (เหลืออีก ${formatRemaining(msLeft)})` })
    }
  }
  if (currentDue) {
    if (currentDue.status === 'overdue') {
      reminders.push({
        type: 'danger',
        text: `ค้างชำระค่าเช่างวดนี้ (ครบกำหนดวันที่ ${formatDate(currentDue.dueDate)}) กรุณาชำระโดยเร็ว`,
      })
    } else if (currentDue.status === 'due') {
      reminders.push({
        type: 'warning',
        text: `ถึงกำหนดชำระค่าเช่าประจำงวดนี้แล้ว กรุณาชำระภายในวันที่ ${formatDate(currentDue.dueDate)}`,
      })
    }
  }

  return (
    <div className="dashboard-page">
      <div className="container">
        <div className="dashboard-header">
          <div className="dashboard-title-group">
            <div className="auth-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h1>
                สวัสดี, {customer.first_name} {customer.last_name}
              </h1>
              <p>แดชบอร์ดของฉัน</p>
            </div>
          </div>
          <div className="dashboard-header-actions">
            <div className="dashboard-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="dashboard-notif-btn"
                aria-label="การแจ้งเตือน"
                onClick={() => {
                  if (notifOpen) {
                    closeNotifPanel()
                  } else {
                    setNotifOpen(true)
                    setNotifSeen(true)
                    setNotifPage(1)
                  }
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {!notifSeen && notifications.length > 0 && <span className="dashboard-notif-dot" />}
              </button>
              {notifOpen && (
                <div
                  className={`dashboard-notif-panel${notifClosing ? ' is-closing' : ''}`}
                  onAnimationEnd={() => {
                    if (notifClosing) {
                      setNotifOpen(false)
                      setNotifClosing(false)
                    }
                  }}
                >
                  <div className="dashboard-notif-panel-header">
                    <span>การแจ้งเตือน</span>
                    <button
                      type="button"
                      className="dashboard-notif-panel-close"
                      onClick={closeNotifPanel}
                      aria-label="ปิด"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="dashboard-notif-empty">ยังไม่มีการแจ้งเตือน</p>
                  ) : (
                    <>
                      <div className="dashboard-notif-list">
                        {paginatedNotifications.map((notif) => (
                          <button
                            type="button"
                            key={notif.key}
                            className={`dashboard-notif-item is-${notif.tone}`}
                            onClick={() => setNotifDetail(notif)}
                          >
                            <p className="dashboard-notif-item-title">{notif.title}</p>
                            <p className="dashboard-notif-item-status">{notif.label}</p>
                            <p className="dashboard-notif-item-date">{formatDateTime(notif.date)}</p>
                          </button>
                        ))}
                      </div>
                      {notifTotalPages > 1 && (
                        <div className="dashboard-notif-pagination">
                          <button
                            type="button"
                            className="dashboard-notif-page-btn"
                            disabled={notifCurrentPage <= 1}
                            onClick={() => setNotifPage(Math.max(1, notifCurrentPage - 1))}
                          >
                            ก่อนหน้า
                          </button>
                          <span className="dashboard-notif-page-info">
                            หน้า {notifCurrentPage} / {notifTotalPages}
                          </span>
                          <button
                            type="button"
                            className="dashboard-notif-page-btn"
                            disabled={notifCurrentPage >= notifTotalPages}
                            onClick={() => setNotifPage(Math.min(notifTotalPages, notifCurrentPage + 1))}
                          >
                            ถัดไป
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {notifDetail && (
              <Modal title={notifDetail.title} onClose={() => setNotifDetail(null)} variant="confirm">
                {(requestClose) => (
                  <div className="dashboard-confirm-body">
                    <div className={`dashboard-confirm-icon is-${notifDetail.tone}`}>
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        {notifDetail.tone === 'success' ? (
                          <polyline points="20 6 9 17 4 12" />
                        ) : notifDetail.tone === 'danger' ? (
                          <>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </>
                        ) : (
                          <>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </>
                        )}
                      </svg>
                    </div>
                    <p className="dashboard-confirm-message">
                      <span className={`dashboard-confirm-message-status is-${notifDetail.tone}`}>
                        {notifDetail.label}
                      </span>
                      {notifDetail.detail && (
                        <>
                          <br />
                          {notifDetail.detail}
                        </>
                      )}
                    </p>
                    {notifDetail.request ? (
                      <RequestTimeline kind={notifDetail.kind} request={notifDetail.request} />
                    ) : (
                      <p className="dashboard-notif-item-date">{formatDateTime(notifDetail.date)}</p>
                    )}
                    <div className="dashboard-form-actions">
                      <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                        ปิด
                      </button>
                    </div>
                  </div>
                )}
              </Modal>
            )}
            {room && (
              <span className="dashboard-room-status">
                {room.is_booked ? 'กำลังเช่าอยู่' : 'ว่าง'}
              </span>
            )}
            <button type="button" className="dashboard-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        {statusPopup && STATUS_POPUP_CONTENT_BY_KIND[statusPopup.kind]?.[statusPopup.status] && (
          <Modal
            title={STATUS_POPUP_CONTENT_BY_KIND[statusPopup.kind][statusPopup.status].title}
            onClose={() => setStatusPopup(null)}
            variant="confirm"
          >
            {(requestClose) => {
              const content = STATUS_POPUP_CONTENT_BY_KIND[statusPopup.kind][statusPopup.status]
              return (
                <div className="dashboard-confirm-body">
                  <div className={`dashboard-confirm-icon is-${content.icon}`}>
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <StatusIconPaths tone={content.icon} />
                    </svg>
                  </div>
                  <p className="dashboard-confirm-message">{content.message}</p>
                  {statusPopup.request && <RequestTimeline kind={statusPopup.kind} request={statusPopup.request} />}
                  <div className="dashboard-form-actions">
                    <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                      รับทราบ
                    </button>
                  </div>
                </div>
              )
            }}
          </Modal>
        )}

        {reminders.length > 0 && (
          <div className="dashboard-reminders">
            {reminders.map((reminder, index) => (
              <div key={index} className={`alert alert-${reminder.type} dashboard-reminder`}>
                {reminder.text}
              </div>
            ))}
          </div>
        )}

        <div className="row g-3">
          <div className="col-12 col-lg-4">
            <div className="dashboard-card">
              <h2>ห้องของฉัน</h2>
              {room ? (
                <>
                  <p className="dashboard-room-number">ห้อง {room.room_number}</p>
                  {room.is_booked && room.rental_start_date && room.rental_end_date && (
                    <>
                      <h3 className="dashboard-section-title">ระยะเวลาการเช่า</h3>
                      <p className="dashboard-rental-duration">
                        {formatRentalDuration(room.rental_start_date, room.rental_end_date)}
                      </p>
                      <p className="dashboard-rental-period">
                        <CalendarIcon />
                        {formatDateTime(room.rental_start_date)} ถึง {formatDateTime(room.rental_end_date)}
                      </p>
                      {!hasStarted && msUntilStart !== null && (
                        <p className="dashboard-countdown is-pending">
                          เริ่มสัญญาในอีก {formatRemaining(msUntilStart)}
                        </p>
                      )}
                      {msLeft !== null && (
                        <p
                          className={`dashboard-countdown${isExpired ? ' is-expired' : isWarning ? ' is-warning' : ''}`}
                        >
                          {isExpired ? `หมดสัญญาแล้ว ${formatRemaining(msLeft)}` : `เหลืออีก ${formatRemaining(msLeft)}`}
                        </p>
                      )}
                    </>
                  )}
                  <h3 className="dashboard-section-title">สิ่งอำนวยความสะดวก</h3>
                  <div className="dashboard-amenities">
                    {AMENITIES.map((amenity) => (
                      <span
                        key={amenity.key}
                        className={`dashboard-amenity${room[amenity.key] ? ` is-${amenity.color}` : ' is-off'}`}
                      >
                        <AmenityIcon name={amenity.key} />
                        {amenity.label}
                      </span>
                    ))}
                    <span className="dashboard-amenity is-indigo">
                      <AmenityIcon name="bed" />
                      เตียง {room.bed ?? 0} เตียง
                    </span>
                  </div>

                  <h3 className="dashboard-section-title">ค่าน้ำ - ค่าไฟ</h3>
                  <div className="dashboard-utility-rates">
                    <div className="dashboard-utility-rate is-electric">
                      <span>ค่าไฟฟ้า</span>
                      <strong>{formatCurrency(room.electricity_unit_price)} บาท/หน่วย</strong>
                    </div>
                    <div className="dashboard-utility-rate is-water">
                      <span>ค่าน้ำ</span>
                      <strong>{formatCurrency(room.water_price)} บาท/หน่วย</strong>
                    </div>
                  </div>

                  {currentDue && currentDue.status !== 'paid' && (
                    <>
                      <h3 className="dashboard-section-title with-aside">
                        ยอดชำระเดือนนี้
                        <span className="dashboard-due-period">
                          ค่าเช่ารอบ {formatDate(currentDue.periodStart)} - {formatDate(currentDue.periodEnd)}
                        </span>
                      </h3>
                      <div className="dashboard-due-box">
                        <span className="dashboard-due-amount">฿{formatCurrency(currentDue.amount)}</span>
                        <span className={`dashboard-badge status-${dueBadgeClass(currentDue.status)}`}>
                          {DUE_STATUS_LABEL[currentDue.status] || currentDue.status}
                        </span>
                      </div>
                      <p className="dashboard-due-date">กำหนดชำระภายในวันที่ {formatDate(currentDue.dueDate)}</p>
                      {currentDue.depositApplied > 0 && (
                        <p className="dashboard-due-deposit-note">
                          หักเงินมัดจำ ฿{formatCurrency(currentDue.depositApplied)} จากค่าเช่าเดือนแรกแล้ว
                        </p>
                      )}
                      {currentDue.lumpSumMonths && (
                        <p className="dashboard-due-deposit-note">
                          ยอดนี้รวมค่าเช่าล่วงหน้า {currentDue.lumpSumMonths} เดือน ตามคำขอต่อสัญญาแบบจ่ายทบ
                        </p>
                      )}

                      <button type="button" className="dashboard-action-btn is-primary" onClick={openPaymentForm}>
                        ชำระเงิน
                      </button>
                      {paymentSuccess && !showPaymentForm && <p className="dashboard-form-success">{paymentSuccess}</p>}
                      {showPaymentForm && (
                        <Modal title="สแกนเพื่อชำระเงิน" onClose={() => setShowPaymentForm(false)} variant="confirm">
                          {(requestClose) => (
                            <form className="dashboard-inline-form" onSubmit={handleConfirmPayment}>
                              <div className="dashboard-qr-box">
                                <span className="dashboard-qr-badge">PromptPay</span>
                                <FakeQrCode />
                                <p className="dashboard-qr-amount">฿{formatCurrency(currentDue.amount)}</p>
                                <p className="dashboard-qr-hint">
                                  {currentDue.lumpSumMonths
                                    ? `ยอดรวมค่าเช่าล่วงหน้า ${currentDue.lumpSumMonths} เดือน — สแกนผ่านแอปธนาคารเพื่อชำระเงิน`
                                    : 'สแกนผ่านแอปธนาคารเพื่อชำระเงิน'}
                                </p>
                              </div>
                              {paymentError && <p className="dashboard-form-error">{paymentError}</p>}
                              <div className="dashboard-form-actions">
                                <button type="submit" className="dashboard-action-btn is-primary" disabled={paymentSubmitting}>
                                  {paymentSubmitting ? 'กำลังตรวจสอบ...' : 'ฉันชำระเงินแล้ว'}
                                </button>
                                <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                                  ยกเลิก
                                </button>
                              </div>
                            </form>
                          )}
                        </Modal>
                      )}
                    </>
                  )}

                  {isPrepaid && (
                    <>
                      <h3 className="dashboard-section-title">ยอดชำระเดือนนี้</h3>
                      <p className="dashboard-prepaid-note">
                        ชำระค่าเช่าล่วงหน้าแบบทบยอดไว้แล้วถึงวันที่ {formatDate(room.prepaid_until)} —
                        ระบบจะเริ่มแสดงยอดชำระรายเดือนอีกครั้งหลังจากวันนั้น
                      </p>
                    </>
                  )}
                </>
              ) : (
                <p className="dashboard-empty">ไม่พบข้อมูลห้องพัก</p>
              )}
            </div>
          </div>

          <div className="col-12 col-lg-8">
            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h2>ประวัติการเช่าและการชำระค่าเช่า</h2>
                {rentalHistory.length > 0 && (
                  <div className="dashboard-filters">
                    <input
                      type="text"
                      className="dashboard-search-input"
                      placeholder="ค้นหาวันที่, จำนวนเงิน, หมายเหตุ..."
                      value={historySearch}
                      onChange={(event) => setHistorySearch(event.target.value)}
                    />
                    <select
                      className="dashboard-filter-select"
                      value={historyStatusFilter}
                      onChange={(event) => setHistoryStatusFilter(event.target.value)}
                    >
                      <option value="all">ทุกสถานะ</option>
                      <option value="paid">ชำระแล้ว</option>
                      <option value="pending">รอชำระ</option>
                      <option value="overdue">ค้างชำระ</option>
                    </select>
                  </div>
                )}
              </div>
              {rentalHistory.length === 0 ? (
                <p className="dashboard-empty">ยังไม่มีประวัติการเช่า</p>
              ) : (
                filteredRentalHistory.map((entry) => (
                  <div key={entry.booking_id} className="dashboard-rental-entry">
                    {entry.payments.length === 0 ? (
                      <p className="dashboard-empty">
                        {entry.hasOriginalPayments ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีประวัติการชำระค่าเช่า'}
                      </p>
                    ) : (
                      <div className="table-responsive">
                        <table className="dashboard-table">
                          <thead>
                            <tr>
                              <th>วันที่ชำระ</th>
                              <th>จำนวนเงิน</th>
                              <th>สถานะ</th>
                              <th>หมายเหตุ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.payments.map((payment) => (
                              <tr key={payment.id}>
                                <td>{formatDateTime(payment.created_at)}</td>
                                <td>฿{formatCurrency(payment.amount)}</td>
                                <td>
                                  <span className={`dashboard-badge status-${payment.status}`}>
                                    {STATUS_LABEL[payment.status] || payment.status}
                                  </span>
                                </td>
                                <td>{payment.note || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="row g-3 mt-1">
          {(room?.is_booked || moveoutRequest?.status === 'approved') && (
            <div className="col-12 col-lg-5">
              <div className="dashboard-card">
                <h2>จัดการสัญญาเช่า</h2>
                <div className="dashboard-request-list">
                  {room?.is_booked && (
                    <div className="dashboard-request-row">
                      <div className="dashboard-request-info">
                        <p className="dashboard-request-title">ต่อสัญญา</p>
                        <p className="dashboard-request-desc">
                          {(!canResubmitRenew && RENEW_STATUS_POPUP_CONTENT[renewRequest?.status]?.message)
                            || (renewRequest?.status === 'pending'
                              ? `ขอต่อ ${RENEW_DURATION_LABEL[renewRequest.renew_duration_months] || `${renewRequest.renew_duration_months} เดือน`} · ${RENEW_PAYMENT_TYPE_LABEL[renewRequest.renew_payment_type] || renewRequest.renew_payment_type}`
                              : 'ขอต่ออายุสัญญาเช่าห้องนี้เมื่อใกล้ครบกำหนด')}
                        </p>
                      </div>
                      {!canResubmitRenew && RENEW_STATUS_POPUP_CONTENT[renewRequest?.status] ? (
                        <button
                          type="button"
                          className={`dashboard-badge status-${tenantRequestBadgeClass(renewRequest.status)} dashboard-badge-btn`}
                          onClick={() => setStatusPopup({ kind: 'renew', status: renewRequest.status, request: renewRequest })}
                        >
                          {TENANT_REQUEST_STATUS_LABEL[renewRequest.status]}
                        </button>
                      ) : renewRequest?.status === 'pending' ? (
                        <span className={`dashboard-badge status-${tenantRequestBadgeClass(renewRequest.status)}`}>
                          {TENANT_REQUEST_STATUS_LABEL[renewRequest.status]}
                        </span>
                      ) : (
                        <button type="button" className="dashboard-action-btn is-primary" onClick={() => openRequestForm('renew')}>
                          ต่อสัญญา
                        </button>
                      )}
                    </div>
                  )}
                  <div className="dashboard-request-row">
                    <div className="dashboard-request-info">
                      <p className="dashboard-request-title">แจ้งย้ายออก</p>
                      <p className="dashboard-request-desc">
                        {(moveoutRequest?.status !== 'rejected' && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest?.status]?.message)
                          || 'แจ้งความประสงค์ย้ายออกก่อนสิ้นสุดสัญญา'}
                      </p>
                    </div>
                    {moveoutRequest?.status !== 'rejected' && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest?.status] ? (
                      <button
                        type="button"
                        className={`dashboard-badge status-${tenantRequestBadgeClass(moveoutRequest.status)} dashboard-badge-btn`}
                        onClick={() => setStatusPopup({ kind: 'moveout', status: moveoutRequest.status, request: moveoutRequest })}
                      >
                        {TENANT_REQUEST_STATUS_LABEL[moveoutRequest.status]}
                      </button>
                    ) : moveoutRequest?.status === 'pending' ? (
                      <span className={`dashboard-badge status-${tenantRequestBadgeClass(moveoutRequest.status)}`}>
                        {TENANT_REQUEST_STATUS_LABEL[moveoutRequest.status]}
                      </span>
                    ) : (
                      room?.is_booked && (
                        <button type="button" className="dashboard-action-btn is-danger" onClick={() => openRequestForm('moveout')}>
                          แจ้งย้ายออก
                        </button>
                      )
                    )}
                  </div>
                </div>
                {requestSuccess && !activeRequestType && <p className="dashboard-form-success">{requestSuccess}</p>}

                {activeRequestType && (
                  <Modal title={TENANT_REQUEST_TYPE_LABEL[activeRequestType]} onClose={() => setActiveRequestType(null)}>
                    {(requestClose) => (
                      <form className="dashboard-inline-form" onSubmit={handleRequestSubmit}>
                        {activeRequestType === 'renew' && (
                          <>
                            <label>ระยะเวลาที่ต้องการต่อ</label>
                            <select
                              value={renewDurationMonths}
                              onChange={(event) => {
                                const value = event.target.value
                                setRenewDurationMonths(value)
                                if (Number(value) <= 1 && renewPaymentType === 'lump_sum') {
                                  setRenewPaymentType('monthly')
                                }
                              }}
                            >
                              {RENEW_DURATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <label>รูปแบบการชำระ</label>
                            <select
                              value={renewPaymentType}
                              onChange={(event) => setRenewPaymentType(event.target.value)}
                            >
                              {RENEW_PAYMENT_TYPE_OPTIONS.filter(
                                (option) => option.value !== 'lump_sum' || Number(renewDurationMonths) > 1,
                              ).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        <label>หมายเหตุ (ถ้ามี)</label>
                        <textarea
                          rows={2}
                          value={requestNote}
                          onChange={(event) => setRequestNote(event.target.value)}
                          placeholder="ระบุรายละเอียดเพิ่มเติม..."
                        />
                        {requestError && <p className="dashboard-form-error">{requestError}</p>}
                        <div className="dashboard-form-actions">
                          <button type="submit" className="dashboard-action-btn is-primary" disabled={requestSubmitting}>
                            {requestSubmitting ? 'กำลังส่ง...' : 'ยืนยันส่งคำขอ'}
                          </button>
                          <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                            ยกเลิก
                          </button>
                        </div>
                      </form>
                    )}
                  </Modal>
                )}
              </div>
            </div>
          )}

          <div className="col-12 col-lg-7">
            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h2>แจ้งซ่อม</h2>
                <button type="button" className="dashboard-action-btn is-primary" onClick={openMaintenanceForm}>
                  แจ้งซ่อม
                </button>
              </div>
              {maintenanceRequests.length > 0 && (
                <div className="dashboard-filters dashboard-filters-spaced">
                  <input
                    type="text"
                    className="dashboard-search-input"
                    placeholder="ค้นหารายละเอียด, หมวดหมู่, เบอร์โทร..."
                    value={maintenanceSearch}
                    onChange={(event) => {
                      setMaintenanceSearch(event.target.value)
                      setMaintenancePage(1)
                    }}
                  />
                  <select
                    className="dashboard-filter-select"
                    value={maintenanceStatusFilter}
                    onChange={(event) => {
                      setMaintenanceStatusFilter(event.target.value)
                      setMaintenancePage(1)
                    }}
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="pending">รอดำเนินการ</option>
                    <option value="in_progress">กำลังดำเนินการ</option>
                    <option value="done">เสร็จสิ้น</option>
                    <option value="cancelled">ยกเลิกแล้ว</option>
                  </select>
                </div>
              )}
              {maintenanceSuccess && !showMaintenanceForm && <p className="dashboard-form-success">{maintenanceSuccess}</p>}
              {showMaintenanceForm && (
                <Modal title="แจ้งซ่อม" onClose={() => setShowMaintenanceForm(false)}>
                  {(requestClose) => (
                    <form className="dashboard-inline-form" onSubmit={handleMaintenanceSubmit}>
                      <label>หมวดหมู่ปัญหา</label>
                      <select value={maintenanceCategory} onChange={(event) => setMaintenanceCategory(event.target.value)}>
                        {MAINTENANCE_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <label>รายละเอียดปัญหา</label>
                      <textarea
                        rows={3}
                        value={maintenanceText}
                        onChange={(event) => setMaintenanceText(event.target.value)}
                        placeholder="อธิบายปัญหาที่ต้องการแจ้งซ่อม เช่น แอร์ไม่เย็น, ก๊อกน้ำรั่ว..."
                      />

                      <label>ช่วงเวลาที่สะดวกให้เข้าซ่อม</label>
                      <select
                        value={maintenancePreferredTime}
                        onChange={(event) => setMaintenancePreferredTime(event.target.value)}
                      >
                        {MAINTENANCE_TIME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <label>เบอร์โทรติดต่อ (ถ้ามี)</label>
                      <input
                        type="tel"
                        value={maintenanceContactPhone}
                        onChange={(event) => setMaintenanceContactPhone(event.target.value)}
                        placeholder="เบอร์โทรที่ติดต่อได้"
                      />

                      {maintenanceError && <p className="dashboard-form-error">{maintenanceError}</p>}
                      <div className="dashboard-form-actions">
                        <button type="submit" className="dashboard-action-btn is-primary" disabled={maintenanceSubmitting}>
                          {maintenanceSubmitting ? 'กำลังส่ง...' : 'ยืนยันแจ้งซ่อม'}
                        </button>
                        <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                          ยกเลิก
                        </button>
                      </div>
                    </form>
                  )}
                </Modal>
              )}

              {maintenanceRequests.length === 0 ? (
                <p className="dashboard-empty">ยังไม่มีรายการแจ้งซ่อม</p>
              ) : filteredMaintenanceRequests.length === 0 ? (
                <p className="dashboard-empty">ไม่พบรายการที่ตรงกับการค้นหา</p>
              ) : (
                <>
                <div className="dashboard-maintenance-list">
                  {paginatedMaintenanceRequests.map((item) => (
                    <div key={item.id} className="dashboard-maintenance-item">
                      <div>
                        <p className="dashboard-maintenance-desc">{item.description}</p>
                        <p className="dashboard-maintenance-meta">
                          {MAINTENANCE_CATEGORY_LABEL[item.category] || 'อื่นๆ'}
                          {' · '}
                          {MAINTENANCE_TIME_LABEL[item.preferred_time] || 'เวลาไหนก็ได้'}
                          {item.contact_phone ? ` · โทร ${item.contact_phone}` : ''}
                        </p>
                        <p className="dashboard-maintenance-date">{formatDateTime(item.created_at)}</p>
                      </div>
                      <div className="dashboard-maintenance-badges">
                        {MAINTENANCE_STATUS_POPUP_CONTENT[item.status] ? (
                          <button
                            type="button"
                            className={`dashboard-badge status-${maintenanceBadgeClass(item.status)} dashboard-badge-btn`}
                            onClick={() => setStatusPopup({ kind: 'maintenance', status: item.status, request: item })}
                          >
                            {MAINTENANCE_STATUS_LABEL[item.status] || item.status}
                          </button>
                        ) : (
                          <span className={`dashboard-badge status-${maintenanceBadgeClass(item.status)}`}>
                            {MAINTENANCE_STATUS_LABEL[item.status] || item.status}
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <button
                            type="button"
                            className="dashboard-maintenance-cancel"
                            disabled={cancelingMaintenanceId === item.id}
                            onClick={() => {
                              setMaintenanceError('')
                              setMaintenanceSuccess('')
                              setConfirmCancelId(item.id)
                            }}
                          >
                            {cancelingMaintenanceId === item.id ? 'กำลังยกเลิก...' : 'ยกเลิก'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {maintenanceTotalPages > 1 && (
                  <div className="dashboard-maintenance-pagination">
                    <button
                      type="button"
                      className="dashboard-notif-page-btn"
                      disabled={maintenanceCurrentPage <= 1}
                      onClick={() => setMaintenancePage(Math.max(1, maintenanceCurrentPage - 1))}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="dashboard-notif-page-info">
                      หน้า {maintenanceCurrentPage} / {maintenanceTotalPages}
                    </span>
                    <button
                      type="button"
                      className="dashboard-notif-page-btn"
                      disabled={maintenanceCurrentPage >= maintenanceTotalPages}
                      onClick={() => setMaintenancePage(Math.min(maintenanceTotalPages, maintenanceCurrentPage + 1))}
                    >
                      ถัดไป
                    </button>
                  </div>
                )}
                </>
              )}

              {confirmCancelId !== null && (
                <Modal title="ยืนยันการยกเลิก" onClose={() => setConfirmCancelId(null)} variant="confirm">
                  {(requestClose) => (
                    <div className="dashboard-confirm-body">
                      <div className="dashboard-confirm-icon">!</div>
                      <p className="dashboard-confirm-message">
                        ต้องการยกเลิกรายการแจ้งซ่อมนี้ใช่หรือไม่?
                        <br />
                        เมื่อยกเลิกแล้วจะไม่สามารถกู้คืนได้
                      </p>
                      {maintenanceError && <p className="dashboard-form-error">{maintenanceError}</p>}
                      <div className="dashboard-form-actions">
                        <button
                          type="button"
                          className="dashboard-action-btn is-danger"
                          disabled={cancelingMaintenanceId === confirmCancelId}
                          onClick={async () => {
                            const ok = await handleCancelMaintenance(confirmCancelId)
                            if (ok) requestClose()
                          }}
                        >
                          {cancelingMaintenanceId === confirmCancelId ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
                        </button>
                        <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                          ไม่ยกเลิก
                        </button>
                      </div>
                    </div>
                  )}
                </Modal>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CustomerDashbord
