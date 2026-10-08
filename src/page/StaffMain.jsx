import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/StaffPage.css'
import DormInfoPanel from '../components/DormInfoPanel.jsx'
import { createWaitingListEntry, readWaitingList, subscribeWaitingList } from '../utils/waitingList.js'
import { printMonthlyInvoices } from '../utils/printMonthlyInvoices.js'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import StaffPaymentReview from '../components/StaffPaymentReview.jsx'
import {
  compressImageFile,
  createMoveOutInspection,
  MOVE_OUT_CHECKLIST,
  readMoveOutInspections,
  subscribeMoveOutInspections,
} from '../utils/moveOutInspections.js'
import {
  getCurrentMeterMonth,
  getPreviousMeterMonth,
  readUtilityMeterReadings,
  saveUtilityMeterReadings,
} from '../utils/utilityMeterReadings.js'
import { readMaintenanceAttachments, subscribeMaintenanceAttachments } from '../utils/maintenanceAttachments.js'

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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div
      className={`staff-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`staff-modal${variant === 'confirm' ? ' staff-modal-confirm' : ''}${variant === 'wide' ? ' staff-modal-wide' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="staff-modal-header">
          <h3>{title}</h3>
          <button type="button" className="staff-modal-close" onClick={requestClose} aria-label="ปิด">
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
        <div className="staff-modal-body">
          {typeof children === 'function' ? children(requestClose) : children}
        </div>
      </div>
    </div>
  )
}

function ContractArrowIcon() {
  return (
    <svg
      className="staff-contract-arrow"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

const TENANT_REQUEST_TYPE_LABEL = {
  renew: 'ต่อสัญญา',
  moveout: 'แจ้งย้ายออก',
}

const TENANT_REQUEST_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'รับเรื่องแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธแล้ว',
}

const RENEW_DURATION_LABEL = {
  1: '1 เดือน',
  3: '3 เดือน',
  6: '6 เดือน',
  12: '1 ปี (12 เดือน)',
}

const RENEW_PAYMENT_TYPE_LABEL = {
  monthly: 'จ่ายรายเดือน',
  lump_sum: 'จ่ายล่วงหน้าทั้งก้อน',
}

const MAINTENANCE_CATEGORY_LABEL = {
  electrical: 'ไฟฟ้า',
  plumbing: 'ประปา',
  aircon: 'เครื่องปรับอากาศ',
  furniture: 'เฟอร์นิเจอร์ / สิ่งอำนวยความสะดวก',
  other: 'อื่นๆ',
}

const MAINTENANCE_TIME_LABEL = {
  anytime: 'เวลาไหนก็ได้',
  morning: 'ช่วงเช้า (08:00-12:00)',
  afternoon: 'ช่วงบ่าย (12:00-16:00)',
  evening: 'ช่วงเย็น (16:00-19:00)',
}

const MAINTENANCE_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
}

const REQUEST_PREVIEW_COUNT = 3
const ROOMS_PER_PAGE = 5
const MODAL_ITEMS_PER_PAGE = 10
const NOTIF_PAGE_SIZE = 6
const PAYMENT_HISTORY_PAGE_SIZE = 5

const STAFF_TENANT_NOTIF_INFO = {
  pending: { label: 'คำขอใหม่ รอดำเนินการ', tone: 'pending' },
  in_progress: { label: 'รับเรื่องแล้ว รอดำเนินการขั้นต่อไป', tone: 'info' },
}

const STAFF_MAINTENANCE_NOTIF_INFO = {
  pending: { label: 'แจ้งซ่อมใหม่ รอดำเนินการ', tone: 'pending' },
  in_progress: { label: 'กำลังดำเนินการซ่อม', tone: 'info' },
}

const DUE_STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอตรวจสอบ',
  due: 'ยังไม่ครบกำหนด',
  overdue: 'ค้างชำระ',
}

const PAYMENT_STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอชำระ',
  overdue: 'ค้างชำระ',
}

const PAYMENT_TYPE_LABEL = {
  rent: 'ค่าเช่าห้อง',
  deposit: 'เงินประกัน',
  water: 'ค่าน้ำ',
  electricity: 'ค่าไฟฟ้า',
}

function dueBadgeClass(status) {
  if (status === 'paid') return 'paid'
  if (status === 'overdue') return 'overdue'
  if (status === 'pending') return 'pending'
  return 'due'
}

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function splitNote(note) {
  if (!note) return { main: '-', extra: '' }
  const parenIndex = note.indexOf('(')
  if (parenIndex === -1) return { main: note, extra: '' }
  return { main: note.slice(0, parenIndex).trim(), extra: note.slice(parenIndex).trim() }
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

function getTodayInputDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

const MS_PER_DAY = 24 * 60 * 60 * 1000
const ROOM_EXPIRY_WARNING_WINDOW_MS = 10 * MS_PER_DAY

function getRoomMsLeft(room) {
  if (!room.is_booked || !room.rental_start_date || !room.rental_end_date) return null
  const msUntilStart = new Date(room.rental_start_date).getTime() - Date.now()
  if (msUntilStart > 0) return null
  return new Date(room.rental_end_date).getTime() - Date.now()
}

function formatDaysLeft(ms) {
  const days = Math.max(0, Math.ceil(Math.abs(ms) / MS_PER_DAY))
  return days > 0 ? `${days} วัน` : 'น้อยกว่า 1 วัน'
}

function getRoomExpiryStatus(room) {
  const msLeft = getRoomMsLeft(room)
  if (msLeft === null) return null
  if (msLeft < 0) return { level: 'expired', msLeft, label: `หมดแล้ว ${formatDaysLeft(msLeft)}` }
  if (msLeft <= ROOM_EXPIRY_WARNING_WINDOW_MS) return { level: 'warning', msLeft, label: `เหลือ ${formatDaysLeft(msLeft)}` }
  return null
}

function buildStaffTenantNotifs(request) {
  const info = STAFF_TENANT_NOTIF_INFO[request.status]
  if (!info) return []
  return [
    {
      key: `tenant-${request.id}-${request.status}`,
      title: TENANT_REQUEST_TYPE_LABEL[request.type] || request.type,
      ...info,
      date: request.status === 'in_progress' ? request.accepted_at || request.created_at : request.created_at,
      details: [
        { label: 'ห้อง', value: request.room_number },
        { label: 'ผู้เช่า', value: `${request.first_name} ${request.last_name}` },
        ...(request.note ? [{ label: 'หมายเหตุ', value: request.note }] : []),
      ],
      kind: 'tenant',
      request,
    },
  ]
}

function buildStaffMaintenanceNotifs(request) {
  const info = STAFF_MAINTENANCE_NOTIF_INFO[request.status]
  if (!info) return []
  return [
    {
      key: `maintenance-${request.id}-${request.status}`,
      title: 'แจ้งซ่อม',
      ...info,
      date: request.status === 'in_progress' ? request.accepted_at || request.created_at : request.created_at,
      details: [
        { label: 'ห้อง', value: request.room_number },
        { label: 'ผู้เช่า', value: `${request.first_name} ${request.last_name}` },
        { label: 'ประเภท', value: MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ' },
      ],
      kind: 'maintenance',
      request,
    },
  ]
}

function getStaffRequestTimeline(kind, request) {
  if (!request) return []
  const steps = [{ label: kind === 'maintenance' ? 'แจ้งซ่อม' : 'ส่งคำขอ', date: request.created_at }]
  if (request.accepted_at) {
    steps.push({ label: 'รับเรื่อง', date: request.accepted_at })
  }
  return steps
}

function StaffRequestTimeline({ kind, request }) {
  const timeline = getStaffRequestTimeline(kind, request)
  if (timeline.length === 0) return null

  return (
    <div className="staff-request-log">
      <div className="staff-request-log-items">
        {timeline.map((step, index) => {
          const prevStep = timeline[index - 1]
          const stepMs = prevStep ? new Date(step.date).getTime() - new Date(prevStep.date).getTime() : null
          return (
            <div key={step.label} className="staff-request-log-item">
              <span className="staff-request-log-dot" />
              <div className="staff-request-log-content">
                <p className="staff-request-log-label">{step.label}</p>
                <p className="staff-request-log-date">{formatDateTime(step.date)}</p>
                {stepMs !== null && <p className="staff-request-log-duration">ใช้เวลา {formatRemaining(stepMs)}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const SUMMARY_ICON_PATHS = {
  total: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  booked: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  vacant: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.3 2.3L15.5 9.5" />
    </>
  ),
  due: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.7-2.5 1.7-2.5.6-2.5 1.8 1.1 2 2.5 2 2.5-.8 2.5-2" />
    </>
  ),
}

function SummaryIcon({ type }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SUMMARY_ICON_PATHS[type]}
    </svg>
  )
}

function StaffMain() {
  const navigate = useNavigate()
  const [staffUser, setStaffUser] = useState(() => {
    const storedUser = sessionStorage.getItem('user')
    if (!storedUser) return null
    try {
      return JSON.parse(storedUser)
    } catch {
      return null
    }
  })
  const [waitingList, setWaitingList] = useState(readWaitingList)
  const [waitingListModalOpen, setWaitingListModalOpen] = useState(false)
  const [waitingListForm, setWaitingListForm] = useState({ full_name: '', phone: '', room_preference: '', note: '' })
  const [waitingListError, setWaitingListError] = useState('')
  const [moveOutInspections, setMoveOutInspections] = useState(readMoveOutInspections)
  const [maintenanceAttachments, setMaintenanceAttachments] = useState(readMaintenanceAttachments)
  const [inspectionModal, setInspectionModal] = useState(false)
  const [inspectionForm, setInspectionForm] = useState({ room_number: '', checklist: {}, damage_note: '', photos: [] })
  const [inspectionError, setInspectionError] = useState('')
  const [inspectionSubmitting, setInspectionSubmitting] = useState(false)
  const [invoicePrintError, setInvoicePrintError] = useState('')
  const [invoiceGenerating, setInvoiceGenerating] = useState(false)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dormInfo, setDormInfo] = useState(null)
  const [dormInfoError, setDormInfoError] = useState('')
  const [dormInfoRefreshing, setDormInfoRefreshing] = useState(true)

  const [, tickExpiry] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => tickExpiry((tick) => tick + 1), 60000)
    return () => clearInterval(interval)
  }, [])

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

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roomsPage, setRoomsPage] = useState(1)
  const [expandedRoomNumbers, setExpandedRoomNumbers] = useState(() => new Set())

  const [historyRoom, setHistoryRoom] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
  const [historyPage, setHistoryPage] = useState(1)

  const [collectRoom, setCollectRoom] = useState(null)
  const [collectSubmitting, setCollectSubmitting] = useState(false)
  const [collectError, setCollectError] = useState('')

  const [dueDetailRoom, setDueDetailRoom] = useState(null)
  const [actionSuccess, setActionSuccess] = useState('')

  const [utilityRoom, setUtilityRoom] = useState(null)
  const [utilityForm, setUtilityForm] = useState({
    electricity_mode: 'units',
    electricity_units: '',
    electricity_amount: '',
    water_amount: '',
  })
  const [utilitySubmitting, setUtilitySubmitting] = useState(false)
  const [utilityError, setUtilityError] = useState('')
  const [meterModal, setMeterModal] = useState(false)
  const [meterMonth, setMeterMonth] = useState(getCurrentMeterMonth)
  const [meterHistory, setMeterHistory] = useState(readUtilityMeterReadings)
  const [meterDrafts, setMeterDrafts] = useState(() => readUtilityMeterReadings()[getCurrentMeterMonth()] || {})
  const [meterError, setMeterError] = useState('')

  const [tenantRequests, setTenantRequests] = useState([])
  const [maintenanceRequests, setMaintenanceRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestsError, setRequestsError] = useState('')
  const [processingRequestKey, setProcessingRequestKey] = useState('')
  const [viewAllRequests, setViewAllRequests] = useState(null)
  const [tenantFilterType, setTenantFilterType] = useState('all')
  const [tenantFilterSearch, setTenantFilterSearch] = useState('')
  const [tenantModalPage, setTenantModalPage] = useState(1)
  const [maintenanceModalPage, setMaintenanceModalPage] = useState(1)
  const [maintenanceFilterStatus, setMaintenanceFilterStatus] = useState('all')
  const [maintenanceFilterDate, setMaintenanceFilterDate] = useState('')
  const [maintenanceFilterSearch, setMaintenanceFilterSearch] = useState('')
  const [moveoutConfirmRequest, setMoveoutConfirmRequest] = useState(null)
  const [renewApproveConfirm, setRenewApproveConfirm] = useState(null)
  const [moveoutAcknowledgeConfirm, setMoveoutAcknowledgeConfirm] = useState(null)
  const [tenantRejectConfirm, setTenantRejectConfirm] = useState(null)
  const [maintenanceCompleteConfirm, setMaintenanceCompleteConfirm] = useState(null)

  const [showTenantHistory, setShowTenantHistory] = useState(false)
  const [tenantHistoryData, setTenantHistoryData] = useState([])
  const [tenantHistoryTotal, setTenantHistoryTotal] = useState(0)
  const [tenantHistoryPage, setTenantHistoryPage] = useState(1)
  const [tenantHistoryLoading, setTenantHistoryLoading] = useState(false)
  const [tenantHistoryError, setTenantHistoryError] = useState('')
  const [tenantHistorySearch, setTenantHistorySearch] = useState('')
  const [tenantHistoryStatusFilter, setTenantHistoryStatusFilter] = useState('all')

  const [showMaintenanceHistory, setShowMaintenanceHistory] = useState(false)
  const [maintenanceHistoryData, setMaintenanceHistoryData] = useState([])
  const [maintenanceHistoryTotal, setMaintenanceHistoryTotal] = useState(0)
  const [maintenanceHistoryPage, setMaintenanceHistoryPage] = useState(1)
  const [maintenanceHistoryLoading, setMaintenanceHistoryLoading] = useState(false)
  const [maintenanceHistoryError, setMaintenanceHistoryError] = useState('')
  const [maintenanceHistorySearch, setMaintenanceHistorySearch] = useState('')
  const [maintenanceHistoryStatusFilter, setMaintenanceHistoryStatusFilter] = useState('all')

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

  const fetchDormInfo = () =>
    axios
      .get('/api/staff/dorm-info', { headers: authHeaders() })
      .then(({ data }) => {
        setDormInfo(data.config)
        setDormInfoError('')
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setDormInfoError(err.response?.data?.message || 'ไม่สามารถโหลดกฎระเบียบและเบอร์ติดต่อได้')
      })
      .finally(() => setDormInfoRefreshing(false))

  const loadDormInfo = () => {
    setDormInfoRefreshing(true)
    return fetchDormInfo()
  }

  const submitWaitingListEntry = (event, requestClose) => {
    event.preventDefault()
    const fullName = waitingListForm.full_name.trim()
    const phone = waitingListForm.phone.trim()
    if (!fullName || !phone) {
      setWaitingListError('กรุณาระบุชื่อและเบอร์โทรศัพท์')
      return
    }
    try {
      createWaitingListEntry({
        ...waitingListForm,
        full_name: fullName,
        phone,
        room_preference: waitingListForm.room_preference.trim(),
        note: waitingListForm.note.trim(),
        submitted_by_name: staffUser ? `${staffUser.first_name || ''} ${staffUser.last_name || ''}`.trim() : 'เจ้าหน้าที่',
      })
      setWaitingListForm({ full_name: '', phone: '', room_preference: '', note: '' })
      setWaitingListError('')
      requestClose()
    } catch {
      setWaitingListError('บันทึกไม่ได้ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์')
    }
  }

  const openMoveOutInspection = () => {
    const occupiedRoom = rooms.find((room) => room.is_booked && room.tenant)
    setInspectionForm({ room_number: occupiedRoom ? String(occupiedRoom.room_number) : '', checklist: {}, damage_note: '', photos: [] })
    setInspectionError('')
    setInspectionModal(true)
  }

  const submitMoveOutInspection = async (event, requestClose) => {
    event.preventDefault()
    const room = rooms.find((item) => String(item.room_number) === inspectionForm.room_number && item.is_booked && item.tenant)
    if (!room) {
      setInspectionError('กรุณาเลือกห้องที่มีผู้เช่า')
      return
    }
    if (MOVE_OUT_CHECKLIST.some((item) => !inspectionForm.checklist[item.key])) {
      setInspectionError('กรุณาตรวจและเลือกผลให้ครบทุกหัวข้อ')
      return
    }
    if (Object.values(inspectionForm.checklist).includes('damaged') && !inspectionForm.damage_note.trim()) {
      setInspectionError('กรุณาระบุรายละเอียดความเสียหาย')
      return
    }

    setInspectionSubmitting(true)
    setInspectionError('')
    try {
      const photos = await Promise.all(inspectionForm.photos.map(compressImageFile))
      createMoveOutInspection({
        room_number: room.room_number,
        tenant_name: `${room.tenant.first_name} ${room.tenant.last_name}`,
        tenant_phone: room.tenant.phone || '',
        checklist: inspectionForm.checklist,
        damage_note: inspectionForm.damage_note.trim(),
        photos,
        inspected_by: staffUser ? `${staffUser.first_name || ''} ${staffUser.last_name || ''}`.trim() || 'เจ้าหน้าที่' : 'เจ้าหน้าที่',
      })
      setActionSuccess('ส่งผลตรวจห้องให้ Admin แล้ว')
      requestClose()
    } catch (error) {
      setInspectionError(error.message || 'บันทึกไม่สำเร็จ พื้นที่จัดเก็บเบราว์เซอร์อาจเต็ม')
    } finally {
      setInspectionSubmitting(false)
    }
  }

  const handlePrintMonthlyInvoices = async () => {
    setInvoicePrintError('')
    const printWindow = window.open('', '_blank', 'width=900,height=720')
    if (!printWindow) {
      setInvoicePrintError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง')
      return
    }
    setInvoiceGenerating(true)
    try {
      const { data } = await axios.get('/api/staff/rooms', { headers: authHeaders() })
      const count = printMonthlyInvoices(data.rooms, printWindow)
      if (count === 0) {
        setInvoicePrintError('ไม่มีห้องที่มีผู้เช่าให้ออกใบแจ้งหนี้')
        return
      }
      setActionSuccess(`เตรียมใบแจ้งหนี้ ${count} ห้องแล้ว เลือกพิมพ์หรือบันทึกเป็น PDF ได้จากหน้าต่างที่เปิดขึ้น`)
    } catch (error) {
      printWindow.close()
      if (error.response?.status === 401 || error.response?.status === 403) {
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('user')
        navigate('/login', { replace: true })
        return
      }
      setInvoicePrintError(error.message || 'เปิดหน้าต่างพิมพ์ไม่สำเร็จ')
    } finally {
      setInvoiceGenerating(false)
    }
  }

  const [expenses, setExpenses] = useState([])
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [expensesError, setExpensesError] = useState('')
  const [expensesPage, setExpensesPage] = useState(1)
  const [expensesTotalPages, setExpensesTotalPages] = useState(1)
  const [expenseModal, setExpenseModal] = useState(null)
  const [expenseForm, setExpenseForm] = useState({ category: '', description: '', amount: '', expense_date: '' })
  const [expenseFormError, setExpenseFormError] = useState('')
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)

  const loadExpenses = (page = 1) => {
    return axios
      .get('/api/staff/expenses', { headers: authHeaders(), params: { page } })
      .then(({ data }) => {
        setExpenses(data.expenses)
        setExpensesPage(data.page)
        setExpensesTotalPages(Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 20))))
        setExpensesError('')
      })
      .catch((err) => {
        setExpensesError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลรายจ่ายได้')
      })
      .finally(() => setExpensesLoading(false))
  }

  const openCreateExpense = () => {
    setExpenseForm({ category: '', description: '', amount: '', expense_date: getTodayInputDate() })
    setExpenseFormError('')
    setExpenseModal({ mode: 'create' })
  }

  const openEditExpense = (expense) => {
    setExpenseForm({
      category: expense.category || '',
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      expense_date: (expense.expense_date || '').slice(0, 10),
    })
    setExpenseFormError('')
    setExpenseModal({ mode: 'edit', expense })
  }

  const submitExpenseForm = (event, requestClose) => {
    event.preventDefault()
    if (!expenseForm.category.trim()) {
      setExpenseFormError('กรุณาระบุหมวดหมู่รายจ่าย')
      return
    }
    const amountValue = Number(expenseForm.amount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setExpenseFormError('กรุณาระบุจำนวนเงินให้ถูกต้อง')
      return
    }
    if (!expenseForm.expense_date) {
      setExpenseFormError('กรุณาระบุวันที่')
      return
    }

    setExpenseSubmitting(true)
    setExpenseFormError('')
    const payload = {
      category: expenseForm.category.trim(),
      description: expenseForm.description.trim() || null,
      amount: amountValue,
      expense_date: expenseForm.expense_date,
    }
    const request =
      expenseModal.mode === 'create'
        ? axios.post('/api/staff/expenses', payload, { headers: authHeaders() })
        : axios.put(`/api/staff/expenses/${expenseModal.expense.id}`, payload, { headers: authHeaders() })

    request
      .then(() => {
        requestClose()
        loadExpenses(expenseModal.mode === 'create' ? 1 : expensesPage)
      })
      .catch((err) => {
        setExpenseFormError(err.response?.data?.message || 'ไม่สามารถบันทึกรายจ่ายได้')
      })
      .finally(() => setExpenseSubmitting(false))
  }

  const loadRequests = () => {
    return axios
      .get('/api/staff/requests', { headers: authHeaders() })
      .then(({ data }) => {
        setTenantRequests(data.tenantRequests)
        setMaintenanceRequests(data.maintenanceRequests)
        setRequestsError('')
      })
      .catch((err) => {
        setRequestsError(err.response?.data?.message || 'ไม่สามารถโหลดรายการคำขอได้')
      })
  }

  const loadTenantHistory = (page, search = tenantHistorySearch, status = tenantHistoryStatusFilter) => {
    setTenantHistoryLoading(true)
    setTenantHistoryError('')
    return axios
      .get('/api/staff/requests/history', {
        headers: authHeaders(),
        params: { page, search: search || undefined, status: status !== 'all' ? status : undefined },
      })
      .then(({ data }) => {
        setTenantHistoryData(data.requests)
        setTenantHistoryTotal(data.total)
      })
      .catch((err) => {
        setTenantHistoryError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติคำขอได้')
      })
      .finally(() => setTenantHistoryLoading(false))
  }

  const openTenantHistory = () => {
    setShowTenantHistory(true)
    setTenantHistoryPage(1)
    setTenantHistorySearch('')
    setTenantHistoryStatusFilter('all')
    loadTenantHistory(1, '', 'all')
  }

  const loadMaintenanceHistory = (page, search = maintenanceHistorySearch, status = maintenanceHistoryStatusFilter) => {
    setMaintenanceHistoryLoading(true)
    setMaintenanceHistoryError('')
    return axios
      .get('/api/staff/maintenance/history', {
        headers: authHeaders(),
        params: { page, search: search || undefined, status: status !== 'all' ? status : undefined },
      })
      .then(({ data }) => {
        setMaintenanceHistoryData(data.requests)
        setMaintenanceHistoryTotal(data.total)
      })
      .catch((err) => {
        setMaintenanceHistoryError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติแจ้งซ่อมได้')
      })
      .finally(() => setMaintenanceHistoryLoading(false))
  }

  const openMaintenanceHistory = () => {
    setShowMaintenanceHistory(true)
    setMaintenanceHistoryPage(1)
    setMaintenanceHistorySearch('')
    setMaintenanceHistoryStatusFilter('all')
    loadMaintenanceHistory(1, '', 'all')
  }

  const loadRooms = () => {
    return axios
      .get('/api/staff/rooms', { headers: authHeaders() })
      .then(({ data }) => {
        setRooms(data.rooms)
        setError('')
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      })
  }

  useEffect(() => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    let isMounted = true
    loadRooms().finally(() => {
      if (isMounted) setLoading(false)
    })
    fetchDormInfo()
    loadRequests().finally(() => {
      if (isMounted) setRequestsLoading(false)
    })
    loadExpenses(1)
    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => subscribeWaitingList(setWaitingList), [])
  useEffect(() => subscribeMoveOutInspections(setMoveOutInspections), [])
  useEffect(() => subscribeMaintenanceAttachments(setMaintenanceAttachments), [])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    setStaffUser(null)
    navigate('/login', { replace: true })
  }

  const handleApproveTenantRequest = async (request) => {
    const key = `tenant-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${request.id}/approve`, {}, { headers: authHeaders() })
      setActionSuccess(data.message || 'อนุมัติคำขอสำเร็จ')
      await Promise.all([loadRequests(), loadRooms()])
      return true
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'อนุมัติคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setProcessingRequestKey('')
    }
  }

  const handleAcknowledgeTenantRequest = async (request) => {
    const key = `tenant-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${request.id}/acknowledge`, {}, { headers: authHeaders() })
      setActionSuccess(data.message || 'รับเรื่องสำเร็จ')
      await loadRequests()
      return true
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'รับเรื่องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setProcessingRequestKey('')
    }
  }

  const handleConfirmMoveoutApproval = async () => {
    if (!moveoutConfirmRequest) return
    const success = await handleApproveTenantRequest(moveoutConfirmRequest)
    if (success) setMoveoutConfirmRequest(null)
  }

  const handleConfirmRenewApproval = async () => {
    if (!renewApproveConfirm) return
    const success = await handleApproveTenantRequest(renewApproveConfirm)
    if (success) setRenewApproveConfirm(null)
  }

  const handleConfirmMoveoutAcknowledge = async () => {
    if (!moveoutAcknowledgeConfirm) return
    const success = await handleAcknowledgeTenantRequest(moveoutAcknowledgeConfirm)
    if (success) setMoveoutAcknowledgeConfirm(null)
  }

  const handleConfirmMaintenanceComplete = async () => {
    if (!maintenanceCompleteConfirm) return
    const success = await handleMaintenanceAction(maintenanceCompleteConfirm, 'complete')
    if (success) setMaintenanceCompleteConfirm(null)
  }

  const handleRejectTenantRequest = async (request) => {
    const key = `tenant-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${request.id}/reject`, {}, { headers: authHeaders() })
      setActionSuccess(data.message || 'ปฏิเสธคำขอสำเร็จ')
      await loadRequests()
      return true
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'ปฏิเสธคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setProcessingRequestKey('')
    }
  }

  const handleConfirmTenantReject = async () => {
    if (!tenantRejectConfirm) return
    const success = await handleRejectTenantRequest(tenantRejectConfirm)
    if (success) setTenantRejectConfirm(null)
  }

  const handleMaintenanceAction = async (request, action) => {
    const key = `maintenance-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/maintenance/${request.id}/${action}`, {}, { headers: authHeaders() })
      setActionSuccess(data.message || 'ดำเนินการสำเร็จ')
      await loadRequests()
      return true
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setProcessingRequestKey('')
    }
  }

  const renderTenantRequestItem = (request) => {
    const key = `tenant-${request.id}`
    const isProcessing = processingRequestKey === key
    return (
      <div key={key} className="staff-request-item">
        <div className="staff-request-main">
          <div className="staff-request-headline">
            <span className={`staff-badge type-${request.type}`}>
              {TENANT_REQUEST_TYPE_LABEL[request.type] || request.type}
            </span>
            <span className="staff-request-room">ห้อง {request.room_number}</span>
            <span className="staff-request-tenant">{request.first_name} {request.last_name}</span>
          </div>
          <div className="staff-request-meta">
            {request.type === 'renew' && (
              <>
                <span>
                  ขอต่อ {RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`}
                </span>
                <span>{RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type}</span>
              </>
            )}
            {request.phone && <span>โทร {request.phone}</span>}
          </div>
          {request.note && <p className="staff-request-note">หมายเหตุ: {request.note}</p>}
          <p className="staff-request-date is-submitted">
            <span className="staff-request-date-label">ส่งคำขอ</span>
            <span className="staff-request-date-value">{formatDateTime(request.created_at)}</span>
          </p>
        </div>
        <div className="staff-row-actions">
          {request.type === 'moveout' ? (
            request.status === 'in_progress' ? (
              <button
                type="button"
                className="staff-action-btn is-primary"
                disabled={isProcessing}
                onClick={() => setMoveoutConfirmRequest(request)}
              >
                {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติการย้ายออก'}
              </button>
            ) : (
              <button
                type="button"
                className="staff-action-btn is-primary"
                disabled={isProcessing}
                onClick={() => setMoveoutAcknowledgeConfirm(request)}
              >
                {isProcessing ? 'กำลังดำเนินการ...' : 'รับเรื่อง'}
              </button>
            )
          ) : (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => setRenewApproveConfirm(request)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติ'}
            </button>
          )}
          <button
            type="button"
            className="staff-action-btn is-ghost"
            disabled={isProcessing}
            onClick={() => setTenantRejectConfirm(request)}
          >
            ปฏิเสธ
          </button>
        </div>
        {request.type === 'moveout' && (
          <div className="staff-status-below">
            <span className={`staff-badge status-${request.status}`}>
              {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
            </span>
          </div>
        )}
      </div>
    )
  }

  const renderMaintenanceRequestItem = (request) => {
    const key = `maintenance-${request.id}`
    const isProcessing = processingRequestKey === key
    return (
      <div key={key} className="staff-request-item is-maintenance">
        <div className="staff-request-main">
          <div className="staff-request-headline">
            <span className="staff-badge type-maintenance">แจ้งซ่อม</span>
            <span className="staff-request-room">ห้อง {request.room_number}</span>
            <span className="staff-request-tenant">{request.first_name} {request.last_name}</span>
            <span className="staff-status-break" aria-hidden="true" />
            <span className={`staff-badge status-${request.status} staff-status-end`}>
              {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
            </span>
          </div>
          <div className="staff-request-meta">
            <span>{MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ'}</span>
            <span>{MAINTENANCE_TIME_LABEL[request.preferred_time] || 'เวลาไหนก็ได้'}</span>
            {request.contact_phone && <span>โทร {request.contact_phone}</span>}
          </div>
          <p className="staff-request-note">{request.description}</p>
          {(maintenanceAttachments[request.id] || []).length > 0 && (
            <div className="staff-maintenance-photos">
              {maintenanceAttachments[request.id].map((photo, index) => <a key={`${photo.name}-${index}`} href={photo.dataUrl} target="_blank" rel="noreferrer"><img src={photo.dataUrl} alt={`รูปแจ้งซ่อมห้อง ${request.room_number} ${index + 1}`} /></a>)}
            </div>
          )}
          <p className="staff-request-date is-reported">
            <span className="staff-request-date-label">แจ้งซ่อม</span>
            <span className="staff-request-date-value">{formatDateTime(request.created_at)}</span>
          </p>
        </div>
        <div className="staff-row-actions">
          {request.status === 'pending' ? (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => handleMaintenanceAction(request, 'accept')}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'รับเรื่อง'}
            </button>
          ) : (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => setMaintenanceCompleteConfirm(request)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'เสร็จสิ้น'}
            </button>
          )}
          <button
            type="button"
            className="staff-action-btn is-ghost"
            disabled={isProcessing}
            onClick={() => handleMaintenanceAction(request, 'reject')}
          >
            ปฏิเสธ
          </button>
        </div>
      </div>
    )
  }

  const toggleRoomExpanded = (roomNumber) => {
    setExpandedRoomNumbers((prev) => {
      const next = new Set(prev)
      if (next.has(roomNumber)) {
        next.delete(roomNumber)
      } else {
        next.add(roomNumber)
      }
      return next
    })
  }

  const openHistory = async (room) => {
    setHistoryRoom(room)
    setHistoryData(null)
    setHistoryError('')
    setHistorySearch('')
    setHistoryStatusFilter('all')
    setHistoryPage(1)
    setHistoryLoading(true)
    try {
      const { data } = await axios.get(`/api/staff/rooms/${room.room_number}/history`, { headers: authHeaders() })
      setHistoryData(data.rentalHistory)
    } catch (err) {
      setHistoryError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติการจ่ายเงินได้')
    } finally {
      setHistoryLoading(false)
    }
  }

  const openDueDetail = (room) => {
    setDueDetailRoom(room)
  }

  const openCollect = (room) => {
    setCollectRoom(room)
    setCollectError('')
  }

  const handleCollectPayment = async () => {
    if (!collectRoom) return
    setCollectSubmitting(true)
    setCollectError('')
    try {
      const { data } = await axios.post(
        `/api/staff/rooms/${collectRoom.room_number}/collect-payment`,
        {},
        { headers: authHeaders() },
      )
      setActionSuccess(data.message || 'บันทึกการเก็บเงินสำเร็จ')
      setCollectRoom(null)
      await loadRooms()
    } catch (err) {
      setCollectError(err.response?.data?.message || 'บันทึกการเก็บเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setCollectSubmitting(false)
    }
  }

  const openUtilityBill = (room) => {
    setUtilityRoom(room)
    setUtilityForm({
      electricity_mode: 'units',
      electricity_units: '',
      electricity_amount: '',
      water_amount: room.water_price ? String(room.water_price) : '',
    })
    setUtilityError('')
  }

  const handleSendUtilityBill = async () => {
    if (!utilityRoom) return
    setUtilitySubmitting(true)
    setUtilityError('')
    try {
      const { data } = await axios.post(
        `/api/staff/rooms/${utilityRoom.room_number}/utility-bill`,
        {
          electricity_units: utilityForm.electricity_mode === 'units' ? utilityForm.electricity_units : '',
          electricity_amount: utilityForm.electricity_mode === 'amount' ? utilityForm.electricity_amount : '',
          water_amount: utilityForm.water_amount,
        },
        { headers: authHeaders() },
      )
      setActionSuccess(data.message || 'ส่งบิลค่าน้ำ-ค่าไฟสำเร็จ')
      setUtilityRoom(null)
      await loadRooms()
    } catch (err) {
      setUtilityError(err.response?.data?.message || 'ส่งบิลค่าน้ำ-ค่าไฟไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setUtilitySubmitting(false)
    }
  }

  const openMeterGrid = () => {
    const history = readUtilityMeterReadings()
    const month = getCurrentMeterMonth()
    setMeterHistory(history)
    setMeterMonth(month)
    setMeterDrafts(history[month] || {})
    setMeterError('')
    setMeterModal(true)
  }

  const handleMeterDraftChange = (roomNumber, field, value) => {
    setMeterDrafts((drafts) => ({
      ...drafts,
      [roomNumber]: { ...drafts[roomNumber], [field]: value },
    }))
  }

  const meterRows = useMemo(() => {
    const previousMonth = getPreviousMeterMonth(meterMonth)
    const previousReadings = meterHistory[previousMonth] || {}
    return rooms.filter((room) => room.is_booked && room.tenant).map((room) => {
      const previous = previousReadings[room.room_number] || {}
      const current = meterDrafts[room.room_number] || {}
      const previousElectricity = previous.electricity_reading === '' || previous.electricity_reading == null ? null : Number(previous.electricity_reading)
      const previousWater = previous.water_reading === '' || previous.water_reading == null ? null : Number(previous.water_reading)
      const currentElectricity = current.electricity_reading === '' || current.electricity_reading == null ? null : Number(current.electricity_reading)
      const currentWater = current.water_reading === '' || current.water_reading == null ? null : Number(current.water_reading)
      const electricityUnits = previousElectricity === null || currentElectricity === null ? null : currentElectricity - previousElectricity
      const waterUnits = previousWater === null || currentWater === null ? null : currentWater - previousWater
      return {
        ...room,
        previousElectricity,
        previousWater,
        currentElectricity,
        currentWater,
        electricityUnits,
        waterUnits,
        electricityAmount: electricityUnits !== null && electricityUnits >= 0 ? electricityUnits * Number(room.electricity_unit_price || 0) : null,
      }
    })
  }, [rooms, meterHistory, meterDrafts, meterMonth])

  const saveMeterGrid = () => {
    if (meterRows.length === 0) {
      setMeterError('ไม่มีห้องที่มีผู้เช่าให้บันทึกเลขมิเตอร์')
      return
    }
    for (const row of meterRows) {
      const draft = meterDrafts[row.room_number] || {}
      if (draft.electricity_reading === '' || draft.electricity_reading == null || draft.water_reading === '' || draft.water_reading == null) {
        setMeterError(`กรุณากรอกเลขมิเตอร์น้ำและไฟ ห้อง ${row.room_number}`)
        return
      }
      if (!Number.isFinite(Number(draft.electricity_reading)) || !Number.isFinite(Number(draft.water_reading))) {
        setMeterError(`เลขมิเตอร์ห้อง ${row.room_number} ไม่ถูกต้อง`)
        return
      }
      if (Number(draft.electricity_reading) < 0 || Number(draft.water_reading) < 0) {
        setMeterError(`เลขมิเตอร์ห้อง ${row.room_number} ต้องไม่ติดลบ`)
        return
      }
      if ((row.previousElectricity !== null && row.currentElectricity < row.previousElectricity) || (row.previousWater !== null && row.currentWater < row.previousWater)) {
        setMeterError(`เลขมิเตอร์ห้อง ${row.room_number} ต้องไม่น้อยกว่ารอบก่อน`)
        return
      }
    }

    try {
      const snapshot = Object.fromEntries(meterRows.map((row) => [row.room_number, {
        electricity_reading: Number(meterDrafts[row.room_number].electricity_reading),
        water_reading: Number(meterDrafts[row.room_number].water_reading),
      }]))
      saveUtilityMeterReadings(meterMonth, snapshot)
      setMeterHistory(readUtilityMeterReadings())
      setActionSuccess(`บันทึกเลขมิเตอร์ ${meterRows.length} ห้องในเบราว์เซอร์นี้แล้ว (ยังไม่ได้ส่งบิล)`)
      setMeterError('')
      setMeterModal(false)
    } catch {
      setMeterError('บันทึกไม่ได้ พื้นที่จัดเก็บในเบราว์เซอร์อาจเต็ม')
    }
  }

  const notifications = useMemo(() => {
    return [
      ...tenantRequests.flatMap(buildStaffTenantNotifs),
      ...maintenanceRequests.flatMap(buildStaffMaintenanceNotifs),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [tenantRequests, maintenanceRequests])

  const notifTotalPages = Math.max(1, Math.ceil(notifications.length / NOTIF_PAGE_SIZE))
  const notifCurrentPage = Math.min(notifPage, notifTotalPages)
  const paginatedNotifications = notifications.slice(
    (notifCurrentPage - 1) * NOTIF_PAGE_SIZE,
    notifCurrentPage * NOTIF_PAGE_SIZE,
  )

  const summary = useMemo(() => {
    const total = rooms.length
    const booked = rooms.filter((room) => room.is_booked).length
    const vacant = total - booked
    const dueCount = rooms.filter((room) => room.currentDue && room.currentDue.status !== 'paid').length
    return { total, booked, vacant, dueCount }
  }, [rooms])

  const filteredRooms = useMemo(() => {
    return rooms
      .filter((room) => {
        if (statusFilter === 'booked' && !room.is_booked) return false
        if (statusFilter === 'vacant' && room.is_booked) return false
        if (statusFilter === 'due' && (!room.currentDue || room.currentDue.status === 'paid')) return false
        if (statusFilter === 'expiring' && !getRoomExpiryStatus(room)) return false

        if (search.trim()) {
          const keyword = search.trim().toLowerCase()
          const tenantName = room.tenant ? `${room.tenant.first_name} ${room.tenant.last_name}`.toLowerCase() : ''
          const matchesRoom = String(room.room_number).includes(keyword)
          const matchesTenant = tenantName.includes(keyword)
          const matchesPhone = room.tenant?.phone?.includes(keyword)
          if (!matchesRoom && !matchesTenant && !matchesPhone) return false
        }
        return true
      })
      .sort((a, b) => Number(a.is_booked) - Number(b.is_booked) || a.room_number - b.room_number)
  }, [rooms, search, statusFilter])

  const roomsTotalPages = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE))
  const currentRoomsPage = Math.min(roomsPage, roomsTotalPages)

  const paginatedRooms = useMemo(() => {
    const start = (currentRoomsPage - 1) * ROOMS_PER_PAGE
    return filteredRooms.slice(start, start + ROOMS_PER_PAGE)
  }, [filteredRooms, currentRoomsPage])

  const filteredTenantRequests = useMemo(() => {
    return tenantRequests.filter((request) => {
      if (tenantFilterType !== 'all' && request.type !== tenantFilterType) return false

      if (tenantFilterSearch.trim()) {
        const keyword = tenantFilterSearch.trim().toLowerCase()
        const tenantName = `${request.first_name} ${request.last_name}`.toLowerCase()
        const matchesRoom = String(request.room_number).includes(keyword)
        const matchesTenant = tenantName.includes(keyword)
        const matchesPhone = request.phone?.includes(keyword)
        if (!matchesRoom && !matchesTenant && !matchesPhone) return false
      }
      return true
    })
  }, [tenantRequests, tenantFilterType, tenantFilterSearch])

  const tenantModalTotalPages = Math.max(1, Math.ceil(filteredTenantRequests.length / MODAL_ITEMS_PER_PAGE))
  const currentTenantModalPage = Math.min(tenantModalPage, tenantModalTotalPages)
  const paginatedTenantRequests = useMemo(() => {
    const start = (currentTenantModalPage - 1) * MODAL_ITEMS_PER_PAGE
    return filteredTenantRequests.slice(start, start + MODAL_ITEMS_PER_PAGE)
  }, [filteredTenantRequests, currentTenantModalPage])

  const filteredMaintenanceRequests = useMemo(() => {
    return maintenanceRequests.filter((request) => {
      if (maintenanceFilterStatus !== 'all' && request.status !== maintenanceFilterStatus) return false

      if (maintenanceFilterDate) {
        const createdAt = new Date(request.created_at)
        const localDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`
        if (localDate !== maintenanceFilterDate) return false
      }

      if (maintenanceFilterSearch.trim()) {
        const keyword = maintenanceFilterSearch.trim().toLowerCase()
        const tenantName = `${request.first_name} ${request.last_name}`.toLowerCase()
        const matchesRoom = String(request.room_number).includes(keyword)
        const matchesTenant = tenantName.includes(keyword)
        const matchesPhone = request.contact_phone?.includes(keyword)
        if (!matchesRoom && !matchesTenant && !matchesPhone) return false
      }
      return true
    })
  }, [maintenanceRequests, maintenanceFilterStatus, maintenanceFilterDate, maintenanceFilterSearch])

  const maintenanceModalTotalPages = Math.max(1, Math.ceil(filteredMaintenanceRequests.length / MODAL_ITEMS_PER_PAGE))
  const currentMaintenanceModalPage = Math.min(maintenanceModalPage, maintenanceModalTotalPages)
  const paginatedMaintenanceRequests = useMemo(() => {
    const start = (currentMaintenanceModalPage - 1) * MODAL_ITEMS_PER_PAGE
    return filteredMaintenanceRequests.slice(start, start + MODAL_ITEMS_PER_PAGE)
  }, [filteredMaintenanceRequests, currentMaintenanceModalPage])

  const historyPayments = useMemo(() => {
    if (!historyData) return []
    return historyData.flatMap((entry) =>
      entry.payments.map((payment) => ({
        ...payment,
        tenantName: `${entry.first_name} ${entry.last_name}`,
      })),
    )
  }, [historyData])

  const filteredHistoryPayments = useMemo(() => {
    return historyPayments.filter((payment) => {
      if (historyStatusFilter !== 'all' && payment.status !== historyStatusFilter) return false

      if (historySearch.trim()) {
        const keyword = historySearch.trim().toLowerCase()
        const haystack = [
          payment.tenantName,
          formatDateTime(payment.created_at),
          PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง',
          formatCurrency(payment.amount),
          PAYMENT_STATUS_LABEL[payment.status] || payment.status,
          payment.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(keyword)) return false
      }
      return true
    })
  }, [historyPayments, historyStatusFilter, historySearch])

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryPayments.length / PAYMENT_HISTORY_PAGE_SIZE))
  const currentHistoryPage = Math.min(historyPage, historyTotalPages)
  const paginatedHistoryPayments = useMemo(() => {
    const start = (currentHistoryPage - 1) * PAYMENT_HISTORY_PAGE_SIZE
    return filteredHistoryPayments.slice(start, start + PAYMENT_HISTORY_PAGE_SIZE)
  }, [filteredHistoryPayments, currentHistoryPage])

  if (loading) {
    return (
      <div className="staff-page d-flex align-items-center justify-content-center">
        <p className="text-muted">กำลังโหลดข้อมูล...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="staff-page">
        <div className="container">
          <div className="alert alert-danger">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="staff-page">
      <div className="staff-container">
        <div className="staff-header">
          <div className="staff-title-group">
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M3 9h18" />
              </svg>
            </div>
            <div>
              <h1>
                สวัสดี, {staffUser ? `${staffUser.first_name} ${staffUser.last_name}` : 'เจ้าหน้าที่'}
              </h1>
              <p>แดชบอร์ดเจ้าหน้าที่ - จัดการห้องพักและการเก็บเงิน</p>
            </div>
          </div>
          <div className="staff-header-actions">
            <div className="staff-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="staff-notif-btn"
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
                {!notifSeen && notifications.length > 0 && <span className="staff-notif-dot" />}
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
                    <span>การแจ้งเตือน</span>
                    <button
                      type="button"
                      className="staff-notif-panel-close"
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
                    <p className="staff-notif-empty">ยังไม่มีการแจ้งเตือน</p>
                  ) : (
                    <>
                      <div className="staff-notif-list">
                        {paginatedNotifications.map((notif) => (
                          <button
                            type="button"
                            key={notif.key}
                            className={`staff-notif-item is-${notif.tone}`}
                            onClick={() => setNotifDetail(notif)}
                          >
                            <p className="staff-notif-item-title">{notif.title}</p>
                            <p className="staff-notif-item-status">{notif.label}</p>
                            <p className="staff-notif-item-date">{formatDateTime(notif.date)}</p>
                          </button>
                        ))}
                      </div>
                      {notifTotalPages > 1 && (
                        <div className="staff-notif-pagination">
                          <button
                            type="button"
                            className="staff-notif-page-btn"
                            disabled={notifCurrentPage <= 1}
                            onClick={() => setNotifPage(Math.max(1, notifCurrentPage - 1))}
                          >
                            ก่อนหน้า
                          </button>
                          <span className="staff-notif-page-info">
                            หน้า {notifCurrentPage} / {notifTotalPages}
                          </span>
                          <button
                            type="button"
                            className="staff-notif-page-btn"
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
            <button
              type="button"
              className="staff-action-btn is-primary"
              onClick={() => navigate('/register')}
            >
              ลงทะเบียนลูกค้าใหม่
            </button>
            <button type="button" className="staff-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        {notifDetail && (
          <Modal title={notifDetail.title} onClose={() => setNotifDetail(null)} variant="confirm">
            {(requestClose) => (
              <div className="staff-confirm-body">
                <div className={`staff-confirm-icon is-${notifDetail.tone}`}>
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
                    {notifDetail.tone === 'info' ? (
                      <>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </>
                    )}
                  </svg>
                </div>
                <p className="staff-confirm-message">
                  <span className={`staff-confirm-message-status is-${notifDetail.tone}`}>{notifDetail.label}</span>
                </p>
                {notifDetail.details && notifDetail.details.length > 0 && (
                  <div className="staff-confirm-details">
                    {notifDetail.details.map((item) => (
                      <div className="staff-confirm-detail-row" key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                <StaffRequestTimeline kind={notifDetail.kind} request={notifDetail.request} />
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {actionSuccess && (
          <Modal title="สำเร็จ" onClose={() => setActionSuccess('')} variant="confirm">
            {(requestClose) => (
              <div className="staff-confirm-body">
                <div className="staff-confirm-icon is-success">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="staff-confirm-message">{actionSuccess}</p>
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {waitingListModalOpen && (
          <Modal title="เพิ่มผู้สนใจเช่าห้อง" onClose={() => setWaitingListModalOpen(false)}>
            {(requestClose) => (
              <form onSubmit={(event) => submitWaitingListEntry(event, requestClose)} noValidate>
                {waitingListError && <div className="alert alert-danger py-2 px-3">{waitingListError}</div>}
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label" htmlFor="waiting-full-name">ชื่อผู้สนใจ</label>
                    <input id="waiting-full-name" className="form-control" maxLength={255} value={waitingListForm.full_name} onChange={(event) => setWaitingListForm((form) => ({ ...form, full_name: event.target.value }))} required />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="waiting-phone">เบอร์โทรศัพท์</label>
                    <input id="waiting-phone" className="form-control" type="tel" maxLength={20} value={waitingListForm.phone} onChange={(event) => setWaitingListForm((form) => ({ ...form, phone: event.target.value }))} required />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="waiting-room-preference">ประเภทห้องที่สนใจ</label>
                    <input id="waiting-room-preference" className="form-control" maxLength={100} placeholder="เช่น ห้องแอร์, งบไม่เกิน 4,000 บาท" value={waitingListForm.room_preference} onChange={(event) => setWaitingListForm((form) => ({ ...form, room_preference: event.target.value }))} />
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="waiting-note">หมายเหตุ</label>
                    <textarea id="waiting-note" className="form-control" rows={3} maxLength={500} value={waitingListForm.note} onChange={(event) => setWaitingListForm((form) => ({ ...form, note: event.target.value }))} />
                  </div>
                </div>
                <div className="staff-form-actions">
                  <button type="submit" className="staff-action-btn is-primary">บันทึกรายชื่อ</button>
                </div>
              </form>
            )}
          </Modal>
        )}

        {inspectionModal && (
          <Modal title="Checklist ตรวจห้องย้ายออก" onClose={() => setInspectionModal(false)} variant="wide">
            {(requestClose) => (
              <form onSubmit={(event) => submitMoveOutInspection(event, requestClose)} noValidate>
                {inspectionError && <div className="alert alert-danger py-2 px-3">{inspectionError}</div>}
                <div className="row g-3 mb-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="inspection-room">ห้อง / ผู้เช่า</label>
                    <select id="inspection-room" className="form-select" value={inspectionForm.room_number} onChange={(event) => setInspectionForm((form) => ({ ...form, room_number: event.target.value }))} required>
                      <option value="">เลือกห้อง</option>
                      {rooms.filter((room) => room.is_booked && room.tenant).map((room) => <option key={room.room_number} value={room.room_number}>{room.room_number} - {room.tenant.first_name} {room.tenant.last_name}</option>)}
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label">ผู้เช่า</label>
                    <div className="form-control-plaintext">{rooms.find((room) => String(room.room_number) === inspectionForm.room_number)?.tenant ? `${rooms.find((room) => String(room.room_number) === inspectionForm.room_number).tenant.first_name} ${rooms.find((room) => String(room.room_number) === inspectionForm.room_number).tenant.last_name}` : '-'}</div>
                  </div>
                </div>
                <div className="moveout-inspection-checklist">
                  <div className="moveout-inspection-checklist-heading"><strong>รายการตรวจ</strong><span>เลือกผลการตรวจทุกข้อ</span></div>
                  {MOVE_OUT_CHECKLIST.map((item) => (
                    <label className="moveout-inspection-checklist-row" key={item.key}>
                      <span>{item.label}</span>
                      <select className="form-select" value={inspectionForm.checklist[item.key] || ''} onChange={(event) => setInspectionForm((form) => ({ ...form, checklist: { ...form.checklist, [item.key]: event.target.value } }))}>
                        <option value="">เลือกผล</option><option value="good">ปกติ</option><option value="damaged">ชำรุด</option><option value="not_applicable">ไม่มี/ไม่เกี่ยวข้อง</option>
                      </select>
                    </label>
                  ))}
                </div>
                <div className="row g-3 mt-1">
                  <div className="col-12">
                    <label className="form-label" htmlFor="inspection-damage-note">รายละเอียดความเสียหาย / หมายเหตุ</label>
                    <textarea id="inspection-damage-note" className="form-control" rows={3} maxLength={1000} value={inspectionForm.damage_note} onChange={(event) => setInspectionForm((form) => ({ ...form, damage_note: event.target.value }))} placeholder="ระบุตำแหน่งและรายละเอียดความเสียหาย" />
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="inspection-photos">แนบรูปภาพ (สูงสุด 3 รูป)</label>
                    <input id="inspection-photos" className="form-control" type="file" accept="image/*" multiple onChange={(event) => {
                      const files = Array.from(event.target.files || [])
                      if (files.length > 3) setInspectionError('แนบรูปได้ไม่เกิน 3 รูป')
                      else {
                        setInspectionError('')
                        setInspectionForm((form) => ({ ...form, photos: files }))
                      }
                    }} />
                    {inspectionForm.photos.length > 0 && <small className="text-muted">เลือกแล้ว {inspectionForm.photos.length} รูป ระบบจะย่อขนาดก่อนบันทึก</small>}
                  </div>
                </div>
                <p className="waiting-list-storage-note mt-3">ข้อมูลและรูปเก็บในเบราว์เซอร์นี้ Admin จะเห็นเมื่อเปิดระบบบนเบราว์เซอร์เดียวกัน</p>
                <div className="staff-form-actions">
                  <button type="submit" className="staff-action-btn is-primary" disabled={inspectionSubmitting}>{inspectionSubmitting ? 'กำลังบันทึก...' : 'ส่งผลตรวจให้ Admin'}</button>
                </div>
              </form>
            )}
          </Modal>
        )}

        {meterModal && (
          <Modal title="จดมิเตอร์ทุกห้อง" onClose={() => setMeterModal(false)} variant="wide">
            <div className="meter-entry-toolbar">
              <label className="form-label" htmlFor="meter-month">รอบบิล</label>
              <input id="meter-month" type="month" className="form-control" value={meterMonth} onChange={(event) => {
                const month = event.target.value
                const history = readUtilityMeterReadings()
                setMeterMonth(month)
                setMeterHistory(history)
                setMeterDrafts(history[month] || {})
                setMeterError('')
              }} />
              <span>เลขรอบก่อนเทียบกับ {getPreviousMeterMonth(meterMonth)}</span>
            </div>
            {meterError && <div className="alert alert-danger py-2 px-3">{meterError}</div>}
            <div className="table-responsive meter-entry-table-wrap">
              <table className="staff-table meter-entry-table">
                <thead><tr><th>ห้อง / ผู้เช่า</th><th>ไฟรอบก่อน</th><th>เลขไฟครั้งนี้</th><th>หน่วยไฟที่ใช้</th><th>ค่าไฟโดยประมาณ</th><th>น้ำรอบก่อน</th><th>เลขน้ำครั้งนี้</th><th>หน่วยน้ำที่ใช้</th><th>ค่าน้ำ/เดือน</th></tr></thead>
                <tbody>
                  {meterRows.length === 0 ? <tr><td colSpan={9} className="staff-empty">ไม่มีห้องที่มีผู้เช่า</td></tr> : meterRows.map((row) => (
                    <tr key={row.room_number}>
                      <td><strong>{row.room_number}</strong><small>{row.tenant.first_name} {row.tenant.last_name}</small></td>
                      <td>{row.previousElectricity ?? 'ไม่มีข้อมูล'}</td>
                      <td><input aria-label={`เลขมิเตอร์ไฟห้อง ${row.room_number}`} type="number" min="0" step="0.01" className="form-control meter-reading-input" value={meterDrafts[row.room_number]?.electricity_reading ?? ''} onChange={(event) => handleMeterDraftChange(row.room_number, 'electricity_reading', event.target.value)} /></td>
                      <td>{row.electricityUnits === null ? '-' : row.electricityUnits < 0 ? 'เลขลดลง' : row.electricityUnits.toLocaleString('th-TH')}</td>
                      <td>{row.electricityAmount === null ? '-' : `฿${formatCurrency(row.electricityAmount)}`}</td>
                      <td>{row.previousWater ?? 'ไม่มีข้อมูล'}</td>
                      <td><input aria-label={`เลขมิเตอร์น้ำห้อง ${row.room_number}`} type="number" min="0" step="0.01" className="form-control meter-reading-input" value={meterDrafts[row.room_number]?.water_reading ?? ''} onChange={(event) => handleMeterDraftChange(row.room_number, 'water_reading', event.target.value)} /></td>
                      <td>{row.waterUnits === null ? '-' : row.waterUnits < 0 ? 'เลขลดลง' : row.waterUnits.toLocaleString('th-TH')}</td>
                      <td>฿{formatCurrency(row.water_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="waiting-list-storage-note mt-3">เลขมิเตอร์เก็บในเบราว์เซอร์นี้เท่านั้น รอบแรกจะแสดงเป็นข้อมูลตั้งต้น; ค่าไฟคำนวณจากหน่วยใช้จริง ส่วนค่าน้ำยังเป็นราคาเหมาจ่ายตาม DB และการบันทึกนี้ยังไม่ส่งบิล</p>
            <div className="staff-form-actions"><button type="button" className="staff-action-btn is-primary" onClick={saveMeterGrid}>บันทึกเลขมิเตอร์ทั้งหมด</button></div>
          </Modal>
        )}

        <div className="staff-summary-grid">
          <div className="staff-summary-card">
            <span className="staff-summary-icon">
              <SummaryIcon type="total" />
            </span>
            <span className="staff-summary-text">
              <span className="staff-summary-label">ห้องทั้งหมด</span>
              <span className="staff-summary-value">{summary.total}</span>
            </span>
          </div>
          <div className="staff-summary-card is-booked">
            <span className="staff-summary-icon">
              <SummaryIcon type="booked" />
            </span>
            <span className="staff-summary-text">
              <span className="staff-summary-label">ห้องไม่ว่าง</span>
              <span className="staff-summary-value">{summary.booked}</span>
            </span>
          </div>
          <div className="staff-summary-card is-vacant">
            <span className="staff-summary-icon">
              <SummaryIcon type="vacant" />
            </span>
            <span className="staff-summary-text">
              <span className="staff-summary-label">ห้องว่าง</span>
              <span className="staff-summary-value">{summary.vacant}</span>
            </span>
          </div>
          <div className="staff-summary-card is-due">
            <span className="staff-summary-icon">
              <SummaryIcon type="due" />
            </span>
            <span className="staff-summary-text">
              <span className="staff-summary-label">รอเก็บเงิน</span>
              <span className="staff-summary-value">{summary.dueCount}</span>
            </span>
          </div>
        </div>

        <AnnouncementBoard canManage author={staffUser ? `${staffUser.first_name || ''} ${staffUser.last_name || ''}`.trim() || 'เจ้าหน้าที่' : 'เจ้าหน้าที่'} />

        <DormInfoPanel
          config={dormInfo}
          onRefresh={loadDormInfo}
          refreshing={dormInfoRefreshing}
          error={dormInfoError}
        />

        <div className="staff-card meter-entry-card">
          <div className="staff-card-header">
            <div><h2>จดมิเตอร์ทุกห้อง</h2><p className="waiting-list-storage-note">กรอกเลขน้ำและไฟรวมในตารางเดียว แล้วเทียบกับรอบก่อน</p></div>
            <button type="button" className="staff-action-btn is-primary" onClick={openMeterGrid}>เปิดตารางมิเตอร์</button>
          </div>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <div>
              <h2>รายชื่อคนรอห้องว่าง <span className="staff-count-pill">{waitingList.length}</span></h2>
              <p className="waiting-list-storage-note">บันทึกไว้ในเบราว์เซอร์นี้เท่านั้น</p>
            </div>
            <button type="button" className="staff-action-btn is-primary" onClick={() => { setWaitingListError(''); setWaitingListModalOpen(true) }}>
              + เพิ่มผู้สนใจ
            </button>
          </div>
          <div className="table-responsive">
            <table className="staff-table">
              <thead>
                <tr><th>ชื่อผู้สนใจ</th><th>เบอร์โทร</th><th>ประเภทห้อง</th><th>วันที่แจ้ง</th><th>บันทึกโดย</th></tr>
              </thead>
              <tbody>
                {waitingList.length === 0 ? (
                  <tr><td colSpan={5} className="staff-empty">ยังไม่มีรายชื่อผู้รอห้องว่าง</td></tr>
                ) : waitingList.map((item) => (
                  <tr key={item.id}>
                    <td>{item.full_name}</td><td>{item.phone}</td><td>{item.room_preference || '-'}</td>
                    <td>{formatDate(item.created_at)}</td><td>{item.submitted_by_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <div>
              <h2>ตรวจห้องตอนย้ายออก <span className="staff-count-pill">{moveOutInspections.length}</span></h2>
              <p className="waiting-list-storage-note">Checklist, รูป และความเสียหายที่ส่งให้ Admin</p>
            </div>
            <button type="button" className="staff-action-btn is-primary" onClick={openMoveOutInspection} disabled={!rooms.some((room) => room.is_booked && room.tenant)}>+ เริ่มตรวจห้อง</button>
          </div>
          <div className="table-responsive">
            <table className="staff-table">
              <thead><tr><th>ห้อง</th><th>ผู้เช่า</th><th>วันที่ตรวจ</th><th>ผลตรวจ</th><th>Admin</th></tr></thead>
              <tbody>
                {moveOutInspections.length === 0 ? (
                  <tr><td colSpan={5} className="staff-empty">ยังไม่มีผลตรวจห้องย้ายออก</td></tr>
                ) : moveOutInspections.map((inspection) => (
                  <tr key={inspection.id}>
                    <td>{inspection.room_number}</td><td>{inspection.tenant_name}</td><td>{formatDateTime(inspection.created_at)}</td>
                    <td>{inspection.checklist && Object.values(inspection.checklist).includes('damaged') ? 'พบความเสียหาย' : 'บันทึกแล้ว'}</td>
                    <td>{inspection.status === 'pending' ? 'รอตรวจ' : inspection.status === 'reviewed' ? 'ตรวจแล้ว' : 'ต้องติดตาม'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <h2>รายการห้องพัก</h2>
            <div className="staff-card-header-actions">
              <button type="button" className="staff-action-btn is-ghost" onClick={handlePrintMonthlyInvoices} disabled={invoiceGenerating}>
                {invoiceGenerating ? 'กำลังเตรียม...' : 'ใบแจ้งหนี้รวม / PDF'}
              </button>
              <div className="staff-filters">
              <input
                type="text"
                className="staff-search-input"
                placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setRoomsPage(1)
                }}
              />
              <select
                className="staff-filter-select"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value)
                  setRoomsPage(1)
                }}
              >
                <option value="all">ทุกสถานะ</option>
                <option value="booked">ไม่ว่าง</option>
                <option value="vacant">ว่าง</option>
                <option value="due">รอเก็บเงิน</option>
                <option value="expiring">ใกล้หมดสัญญา</option>
              </select>
              </div>
            </div>
          </div>

          {invoicePrintError && <div className="staff-inline-error" role="alert">{invoicePrintError}</div>}

          <div className="table-responsive">
            <table className="staff-table staff-rooms-table">
              <thead>
                <tr>
                  <th>เลขห้อง</th>
                  <th>สถานะห้อง</th>
                  <th>ผู้เช่า</th>
                  <th className="staff-col-optional">เบอร์โทร</th>
                  <th className="staff-col-optional">ระยะเวลาสัญญา</th>
                  <th>สถานะการชำระเงิน</th>
                  <th className="staff-col-optional">ยอดค้างชำระ</th>
                  <th>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="staff-empty">
                      ไม่พบข้อมูลห้องพักที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                ) : (
                  paginatedRooms.map((room) => {
                    const isExpanded = expandedRoomNumbers.has(room.room_number)
                    const hasDue = room.currentDue && room.currentDue.status !== 'paid'
                    const expiryStatus = getRoomExpiryStatus(room)
                    return (
                      <Fragment key={room.room_number}>
                        <tr>
                          <td className="staff-room-number-cell">{room.room_number}</td>
                          <td>
                            <span className={`staff-badge status-${room.is_booked ? 'booked' : 'vacant'}`}>
                              {room.is_booked ? 'ไม่ว่าง' : 'ว่าง'}
                            </span>
                          </td>
                          <td>{room.tenant ? `${room.tenant.first_name} ${room.tenant.last_name}` : '-'}</td>
                          <td className="staff-col-optional">{room.tenant?.phone || '-'}</td>
                          <td className="staff-col-optional">
                            <div className="staff-contract-dates">
                              {room.rental_start_date && room.rental_end_date ? (
                                <>
                                  {formatDate(room.rental_start_date)}
                                  <ContractArrowIcon />
                                  {formatDate(room.rental_end_date)}
                                </>
                              ) : (
                                '-'
                              )}
                            </div>
                            {expiryStatus && (
                              <div className={`staff-contract-remaining is-${expiryStatus.level}`}>
                                {expiryStatus.label}
                              </div>
                            )}
                          </td>
                          <td>
                            {room.currentDue ? (
                              <span className={`staff-badge status-${dueBadgeClass(room.currentDue.status)}`}>
                                {DUE_STATUS_LABEL[room.currentDue.status] || room.currentDue.status}
                              </span>
                            ) : (
                              <span className="staff-badge status-none">-</span>
                            )}
                          </td>
                          <td className="staff-col-optional">
                            {hasDue ? (
                              <button
                                type="button"
                                className={`staff-due-amount staff-due-amount-btn is-${dueBadgeClass(room.currentDue.status)}`}
                                onClick={() => openDueDetail(room)}
                              >
                                ฿{formatCurrency(room.currentDue.amount)}
                              </button>
                            ) : (
                              <span className="staff-due-amount is-none">-</span>
                            )}
                          </td>
                          <td>
                            <div className="staff-row-actions staff-row-actions-desktop">
                              {Boolean(room.is_booked) && room.tenant && (
                                <button
                                  type="button"
                                  className="staff-action-btn is-ghost"
                                  onClick={() => openHistory(room)}
                                >
                                  ประวัติการจ่ายเงิน
                                </button>
                              )}
                              {Boolean(room.is_booked) && room.tenant && (
                                <button
                                  type="button"
                                  className="staff-action-btn is-ghost"
                                  onClick={() => openUtilityBill(room)}
                                >
                                  ส่งค่าน้ำ-ค่าไฟ
                                </button>
                              )}
                              {hasDue && (
                                <button
                                  type="button"
                                  className="staff-action-btn is-primary"
                                  onClick={() => openCollect(room)}
                                >
                                  เก็บเงิน
                                </button>
                              )}
                              {!room.is_booked && (
                                <button
                                  type="button"
                                  className="staff-action-btn is-primary"
                                  onClick={() => navigate('/register', { state: { roomNumber: room.room_number } })}
                                >
                                  เพิ่มผู้เช่า
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        <tr className="staff-row-detail">
                          <td colSpan={8}>
                            <div className={`staff-row-detail-wrap${isExpanded ? ' is-expanded' : ''}`}>
                              <div className="staff-row-detail-scroll">
                                <div className="staff-row-detail-content">
                                  <div className="staff-row-detail-item">
                                    <span>เบอร์โทร</span>
                                    <strong>{room.tenant?.phone || '-'}</strong>
                                  </div>
                                  <div className="staff-row-detail-item">
                                    <span>ระยะเวลาสัญญา</span>
                                    <span className="staff-contract-value">
                                      <strong>
                                        {room.rental_start_date && room.rental_end_date ? (
                                          <>
                                            {formatDate(room.rental_start_date)}
                                            <ContractArrowIcon />
                                            {formatDate(room.rental_end_date)}
                                          </>
                                        ) : (
                                          '-'
                                        )}
                                      </strong>
                                      {expiryStatus && (
                                        <span className={`staff-contract-remaining is-${expiryStatus.level}`}>
                                          {expiryStatus.label}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="staff-row-detail-item">
                                    <span>ยอดค้างชำระ</span>
                                    {hasDue ? (
                                      <button
                                        type="button"
                                        className={`staff-due-amount staff-due-amount-btn is-${dueBadgeClass(room.currentDue.status)}`}
                                        onClick={() => openDueDetail(room)}
                                      >
                                        ฿{formatCurrency(room.currentDue.amount)}
                                      </button>
                                    ) : (
                                      <strong className="staff-due-amount is-none">-</strong>
                                    )}
                                  </div>
                                  <div className="staff-row-actions">
                                    {Boolean(room.is_booked) && room.tenant && (
                                      <button
                                        type="button"
                                        className="staff-action-btn is-ghost"
                                        onClick={() => openHistory(room)}
                                      >
                                        ประวัติการจ่ายเงิน
                                      </button>
                                    )}
                                    {Boolean(room.is_booked) && room.tenant && (
                                      <button
                                        type="button"
                                        className="staff-action-btn is-ghost"
                                        onClick={() => openUtilityBill(room)}
                                      >
                                        ส่งค่าน้ำ-ค่าไฟ
                                      </button>
                                    )}
                                    {hasDue && (
                                      <button
                                        type="button"
                                        className="staff-action-btn is-primary"
                                        onClick={() => openCollect(room)}
                                      >
                                        เก็บเงิน
                                      </button>
                                    )}
                                    {!room.is_booked && (
                                      <button
                                        type="button"
                                        className="staff-action-btn is-primary"
                                        onClick={() => navigate('/register', { state: { roomNumber: room.room_number } })}
                                      >
                                        เพิ่มผู้เช่า
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                        <tr className="staff-row-toggle-row">
                          <td colSpan={8}>
                            <button
                              type="button"
                              className={`staff-row-toggle${isExpanded ? ' is-expanded' : ''}`}
                              onClick={() => toggleRoomExpanded(room.room_number)}
                              aria-expanded={isExpanded}
                            >
                              ดูเพิ่มเติม
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredRooms.length > 0 && (
            <div className="staff-pagination">
              <span className="staff-pagination-info">
                แสดง {(currentRoomsPage - 1) * ROOMS_PER_PAGE + 1}
                -{Math.min(currentRoomsPage * ROOMS_PER_PAGE, filteredRooms.length)} จาก {filteredRooms.length} รายการ
              </span>
              <div className="staff-pagination-controls">
                <button
                  type="button"
                  className="staff-action-btn is-ghost"
                  disabled={currentRoomsPage <= 1}
                  onClick={() => setRoomsPage(Math.max(1, currentRoomsPage - 1))}
                >
                  ก่อนหน้า
                </button>
                <span className="staff-pagination-page">
                  หน้า {currentRoomsPage} / {roomsTotalPages}
                </span>
                <button
                  type="button"
                  className="staff-action-btn is-ghost"
                  disabled={currentRoomsPage >= roomsTotalPages}
                  onClick={() => setRoomsPage(Math.min(roomsTotalPages, currentRoomsPage + 1))}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>

        <StaffPaymentReview />

        <div className="staff-requests-grid">
          <div className="staff-card">
            <div className="staff-card-header">
              <h2>
                คำขอต่อสัญญา / แจ้งย้ายออก
                {tenantRequests.length > 0 && <span className="staff-count-pill">{tenantRequests.length}</span>}
              </h2>
              <div className="staff-card-header-actions">
                <button type="button" className="staff-view-all-btn" onClick={openTenantHistory}>
                  ดูประวัติ
                </button>
                {filteredTenantRequests.length > REQUEST_PREVIEW_COUNT && (
                  <button type="button" className="staff-view-all-btn" onClick={() => setViewAllRequests('tenant')}>
                    ดูทั้งหมด
                  </button>
                )}
              </div>
            </div>

            {tenantRequests.length > 0 && (
              <div className="staff-filters staff-card-filters">
                <input
                  type="text"
                  className="staff-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
                  value={tenantFilterSearch}
                  onChange={(event) => {
                    setTenantFilterSearch(event.target.value)
                    setTenantModalPage(1)
                  }}
                />
                <select
                  className="staff-filter-select"
                  value={tenantFilterType}
                  onChange={(event) => {
                    setTenantFilterType(event.target.value)
                    setTenantModalPage(1)
                  }}
                >
                  <option value="all">ทุกประเภท</option>
                  <option value="renew">ต่อสัญญา</option>
                  <option value="moveout">แจ้งย้ายออก</option>
                </select>
              </div>
            )}

            <div className="staff-card-body">
              {requestsError ? (
                <div className="staff-inline-error">
                  <p className="staff-form-error staff-form-error-block">{requestsError}</p>
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    onClick={() => {
                      setRequestsLoading(true)
                      loadRequests().finally(() => setRequestsLoading(false))
                    }}
                  >
                    ลองใหม่
                  </button>
                </div>
              ) : requestsLoading ? (
                <p className="staff-empty">กำลังโหลดข้อมูล...</p>
              ) : tenantRequests.length === 0 ? (
                <p className="staff-empty">ไม่มีคำขอที่รอดำเนินการในขณะนี้</p>
              ) : filteredTenantRequests.length === 0 ? (
                <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
              ) : (
                <div className="staff-requests-list">
                  {filteredTenantRequests.slice(0, REQUEST_PREVIEW_COUNT).map(renderTenantRequestItem)}
                </div>
              )}
            </div>
          </div>

          <div className="staff-card">
            <div className="staff-card-header">
              <h2>
                คำขอแจ้งซ่อม
                {maintenanceRequests.length > 0 && <span className="staff-count-pill">{maintenanceRequests.length}</span>}
              </h2>
              <div className="staff-card-header-actions">
                <button type="button" className="staff-view-all-btn" onClick={openMaintenanceHistory}>
                  ดูประวัติ
                </button>
                {filteredMaintenanceRequests.length > REQUEST_PREVIEW_COUNT && (
                  <button type="button" className="staff-view-all-btn" onClick={() => setViewAllRequests('maintenance')}>
                    ดูทั้งหมด
                  </button>
                )}
              </div>
            </div>

            {maintenanceRequests.length > 0 && (
              <div className="staff-filters staff-card-filters">
                <input
                  type="text"
                  className="staff-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
                  value={maintenanceFilterSearch}
                  onChange={(event) => {
                    setMaintenanceFilterSearch(event.target.value)
                    setMaintenanceModalPage(1)
                  }}
                />
                <select
                  className="staff-filter-select"
                  value={maintenanceFilterStatus}
                  onChange={(event) => {
                    setMaintenanceFilterStatus(event.target.value)
                    setMaintenanceModalPage(1)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="in_progress">กำลังดำเนินการ</option>
                </select>
                <input
                  type="date"
                  className="staff-filter-select"
                  value={maintenanceFilterDate}
                  onChange={(event) => {
                    setMaintenanceFilterDate(event.target.value)
                    setMaintenanceModalPage(1)
                  }}
                />
              </div>
            )}

            <div className="staff-card-body">
              {requestsError ? (
                <div className="staff-inline-error">
                  <p className="staff-form-error staff-form-error-block">{requestsError}</p>
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    onClick={() => {
                      setRequestsLoading(true)
                      loadRequests().finally(() => setRequestsLoading(false))
                    }}
                  >
                    ลองใหม่
                  </button>
                </div>
              ) : requestsLoading ? (
                <p className="staff-empty">กำลังโหลดข้อมูล...</p>
              ) : maintenanceRequests.length === 0 ? (
                <p className="staff-empty">ไม่มีคำขอที่รอดำเนินการในขณะนี้</p>
              ) : filteredMaintenanceRequests.length === 0 ? (
                <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
              ) : (
                <div className="staff-requests-list">
                  {filteredMaintenanceRequests.slice(0, REQUEST_PREVIEW_COUNT).map(renderMaintenanceRequestItem)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <h2>รายจ่าย</h2>
            <div className="staff-card-header-actions">
              <button type="button" className="staff-action-btn is-primary" onClick={openCreateExpense}>
                + บันทึกรายจ่าย
              </button>
            </div>
          </div>

          <div className="staff-card-body">
            {expensesError ? (
              <div className="staff-inline-error">
                <p className="staff-form-error staff-form-error-block">{expensesError}</p>
                <button type="button" className="staff-action-btn is-ghost" onClick={() => loadExpenses(expensesPage)}>
                  ลองใหม่
                </button>
              </div>
            ) : expensesLoading ? (
              <p className="staff-empty">กำลังโหลดข้อมูล...</p>
            ) : expenses.length === 0 ? (
              <p className="staff-empty">ยังไม่มีรายการรายจ่าย</p>
            ) : (
              <div className="table-responsive">
                <table className="staff-table">
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
                    {expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{formatDate(expense.expense_date)}</td>
                        <td>{expense.category}</td>
                        <td>{expense.description || '-'}</td>
                        <td>{expense.recorded_by_name || '-'}</td>
                        <td>฿{formatCurrency(expense.amount)}</td>
                        <td>
                          <button type="button" className="staff-action-btn is-ghost" onClick={() => openEditExpense(expense)}>
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {expensesTotalPages > 1 && (
              <div className="staff-pagination">
                <span className="staff-pagination-info">
                  หน้า {expensesPage} / {expensesTotalPages}
                </span>
                <div className="staff-pagination-controls">
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    disabled={expensesPage <= 1}
                    onClick={() => loadExpenses(expensesPage - 1)}
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    disabled={expensesPage >= expensesTotalPages}
                    onClick={() => loadExpenses(expensesPage + 1)}
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {expenseModal && (
        <Modal
          title={expenseModal.mode === 'create' ? 'บันทึกรายจ่าย' : 'แก้ไขรายจ่าย'}
          onClose={() => setExpenseModal(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <form className="staff-confirm-body" onSubmit={(event) => submitExpenseForm(event, requestClose)} noValidate>
              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="expense-category">
                  หมวดหมู่
                </label>
                <input
                  id="expense-category"
                  type="text"
                  className="staff-form-input"
                  placeholder="เช่น ค่าน้ำ, ค่าไฟ, ซ่อมบำรุง"
                  value={expenseForm.category}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                />
              </div>

              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="expense-description">
                  รายละเอียด (ไม่บังคับ)
                </label>
                <input
                  id="expense-description"
                  type="text"
                  className="staff-form-input"
                  value={expenseForm.description}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </div>

              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="expense-amount">
                  จำนวนเงิน (บาท)
                </label>
                <input
                  id="expense-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="staff-form-input no-spinner"
                  value={expenseForm.amount}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                />
              </div>

              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="expense-date">
                  วันที่
                </label>
                <input
                  id="expense-date"
                  type="date"
                  className="staff-form-input"
                  value={expenseForm.expense_date}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, expense_date: event.target.value }))}
                />
              </div>

              {expenseFormError && <p className="staff-form-error">{expenseFormError}</p>}
              <div className="staff-form-actions">
                <button type="submit" className="staff-action-btn is-primary" disabled={expenseSubmitting}>
                  {expenseSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {viewAllRequests === 'tenant' && (
        <Modal
          title="คำขอต่อสัญญา / แจ้งย้ายออก (ทั้งหมด)"
          onClose={() => {
            setViewAllRequests(null)
            setTenantFilterType('all')
            setTenantFilterSearch('')
            setTenantModalPage(1)
          }}
        >
          <div className="staff-filters staff-modal-filters">
            <input
              type="text"
              className="staff-search-input"
              placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
              value={tenantFilterSearch}
              onChange={(event) => {
                setTenantFilterSearch(event.target.value)
                setTenantModalPage(1)
              }}
            />
            <select
              className="staff-filter-select"
              value={tenantFilterType}
              onChange={(event) => {
                setTenantFilterType(event.target.value)
                setTenantModalPage(1)
              }}
            >
              <option value="all">ทุกประเภท</option>
              <option value="renew">ต่อสัญญา</option>
              <option value="moveout">แจ้งย้ายออก</option>
            </select>
          </div>

          {filteredTenantRequests.length === 0 ? (
            <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
          ) : (
            <>
              <div className="staff-requests-list">
                {paginatedTenantRequests.map(renderTenantRequestItem)}
              </div>
              {tenantModalTotalPages > 1 && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(currentTenantModalPage - 1) * MODAL_ITEMS_PER_PAGE + 1}
                    -{Math.min(currentTenantModalPage * MODAL_ITEMS_PER_PAGE, filteredTenantRequests.length)} จาก{' '}
                    {filteredTenantRequests.length} รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentTenantModalPage <= 1}
                      onClick={() => setTenantModalPage(Math.max(1, currentTenantModalPage - 1))}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {currentTenantModalPage} / {tenantModalTotalPages}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentTenantModalPage >= tenantModalTotalPages}
                      onClick={() => setTenantModalPage(Math.min(tenantModalTotalPages, currentTenantModalPage + 1))}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {viewAllRequests === 'maintenance' && (
        <Modal
          title="คำขอแจ้งซ่อม (ทั้งหมด)"
          onClose={() => {
            setViewAllRequests(null)
            setMaintenanceModalPage(1)
            setMaintenanceFilterStatus('all')
            setMaintenanceFilterDate('')
            setMaintenanceFilterSearch('')
          }}
        >
          <div className="staff-filters staff-modal-filters">
            <input
              type="text"
              className="staff-search-input"
              placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
              value={maintenanceFilterSearch}
              onChange={(event) => {
                setMaintenanceFilterSearch(event.target.value)
                setMaintenanceModalPage(1)
              }}
            />
            <select
              className="staff-filter-select"
              value={maintenanceFilterStatus}
              onChange={(event) => {
                setMaintenanceFilterStatus(event.target.value)
                setMaintenanceModalPage(1)
              }}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="pending">รอดำเนินการ</option>
              <option value="in_progress">กำลังดำเนินการ</option>
            </select>
            <input
              type="date"
              className="staff-filter-select"
              value={maintenanceFilterDate}
              onChange={(event) => {
                setMaintenanceFilterDate(event.target.value)
                setMaintenanceModalPage(1)
              }}
            />
          </div>

          {filteredMaintenanceRequests.length === 0 ? (
            <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
          ) : (
            <>
              <div className="staff-requests-list">
                {paginatedMaintenanceRequests.map(renderMaintenanceRequestItem)}
              </div>
              {maintenanceModalTotalPages > 1 && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(currentMaintenanceModalPage - 1) * MODAL_ITEMS_PER_PAGE + 1}
                    -{Math.min(currentMaintenanceModalPage * MODAL_ITEMS_PER_PAGE, filteredMaintenanceRequests.length)}{' '}
                    จาก {filteredMaintenanceRequests.length} รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentMaintenanceModalPage <= 1}
                      onClick={() => setMaintenanceModalPage(Math.max(1, currentMaintenanceModalPage - 1))}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {currentMaintenanceModalPage} / {maintenanceModalTotalPages}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentMaintenanceModalPage >= maintenanceModalTotalPages}
                      onClick={() =>
                        setMaintenanceModalPage(Math.min(maintenanceModalTotalPages, currentMaintenanceModalPage + 1))
                      }
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {showTenantHistory && (
        <Modal
          title="ประวัติคำขอต่อสัญญา / แจ้งย้ายออก"
          onClose={() => {
            setShowTenantHistory(false)
            setTenantHistoryData([])
            setTenantHistoryTotal(0)
            setTenantHistoryPage(1)
            setTenantHistoryError('')
            setTenantHistorySearch('')
            setTenantHistoryStatusFilter('all')
          }}
        >
          <div className="staff-filters staff-modal-filters">
            <input
              type="text"
              className="staff-search-input"
              placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร..."
              value={tenantHistorySearch}
              onChange={(event) => {
                const value = event.target.value
                setTenantHistorySearch(value)
                setTenantHistoryPage(1)
                loadTenantHistory(1, value, tenantHistoryStatusFilter)
              }}
            />
            <select
              className="staff-filter-select"
              value={tenantHistoryStatusFilter}
              onChange={(event) => {
                const value = event.target.value
                setTenantHistoryStatusFilter(value)
                setTenantHistoryPage(1)
                loadTenantHistory(1, tenantHistorySearch, value)
              }}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="rejected">ปฏิเสธแล้ว</option>
            </select>
          </div>

          {tenantHistoryLoading ? (
            <p className="staff-empty">กำลังโหลดข้อมูล...</p>
          ) : tenantHistoryError ? (
            <p className="staff-form-error">{tenantHistoryError}</p>
          ) : tenantHistoryData.length === 0 ? (
            <p className="staff-empty">ไม่พบประวัติคำขอที่ตรงกับเงื่อนไข</p>
          ) : (
            <>
              <div className="staff-requests-list">
                {tenantHistoryData.map((request) => (
                  <div key={request.id} className="staff-request-item">
                    <div className="staff-request-main">
                      <div className="staff-request-headline">
                        <span className={`staff-badge type-${request.type}`}>
                          {TENANT_REQUEST_TYPE_LABEL[request.type] || request.type}
                        </span>
                        <span className="staff-request-room">ห้อง {request.room_number}</span>
                        <span className="staff-request-tenant">
                          {request.first_name} {request.last_name}
                        </span>
                        <span className="staff-status-break" aria-hidden="true" />
                        <span className={`staff-badge status-${request.status} staff-status-end`}>
                          {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
                        </span>
                      </div>
                      <div className="staff-request-meta">
                        {request.type === 'renew' && (
                          <>
                            <span>
                              ขอต่อ{' '}
                              {RENEW_DURATION_LABEL[request.renew_duration_months] ||
                                `${request.renew_duration_months} เดือน`}
                            </span>
                            <span>{RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type}</span>
                          </>
                        )}
                        {request.phone && <span>โทร {request.phone}</span>}
                      </div>
                      {request.note && <p className="staff-request-note">หมายเหตุ: {request.note}</p>}
                      <div className="staff-request-timeline">
                        <p className="staff-request-date is-submitted">
                          <span className="staff-request-date-label">ส่งคำขอ</span>
                          <span className="staff-request-date-value">{formatDateTime(request.created_at)}</span>
                        </p>
                        {request.accepted_by_name && (
                          <p className="staff-request-date is-accepted">
                            <span className="staff-request-date-label">
                              รับเรื่องโดย <span className="staff-request-date-staff">{request.accepted_by_name}</span>
                            </span>
                            <span className="staff-request-date-value">{formatDateTime(request.accepted_at)}</span>
                          </p>
                        )}
                        {request.completed_by_name && (
                          <p className={`staff-request-date is-${request.status === 'approved' ? 'approved' : 'rejected'}`}>
                            <span className="staff-request-date-label">
                              {request.status === 'approved' ? 'อนุมัติโดย' : 'ปฏิเสธโดย'}{' '}
                              <span className="staff-request-date-staff">{request.completed_by_name}</span>
                            </span>
                            <span className="staff-request-date-value">{formatDateTime(request.completed_at)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {tenantHistoryTotal > MODAL_ITEMS_PER_PAGE && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(tenantHistoryPage - 1) * MODAL_ITEMS_PER_PAGE + 1}
                    -{Math.min(tenantHistoryPage * MODAL_ITEMS_PER_PAGE, tenantHistoryTotal)} จาก {tenantHistoryTotal}{' '}
                    รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={tenantHistoryPage <= 1}
                      onClick={() => {
                        const next = Math.max(1, tenantHistoryPage - 1)
                        setTenantHistoryPage(next)
                        loadTenantHistory(next)
                      }}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {tenantHistoryPage} / {Math.max(1, Math.ceil(tenantHistoryTotal / MODAL_ITEMS_PER_PAGE))}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={tenantHistoryPage >= Math.ceil(tenantHistoryTotal / MODAL_ITEMS_PER_PAGE)}
                      onClick={() => {
                        const next = Math.min(
                          Math.ceil(tenantHistoryTotal / MODAL_ITEMS_PER_PAGE),
                          tenantHistoryPage + 1,
                        )
                        setTenantHistoryPage(next)
                        loadTenantHistory(next)
                      }}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {showMaintenanceHistory && (
        <Modal
          title="ประวัติคำขอแจ้งซ่อม"
          onClose={() => {
            setShowMaintenanceHistory(false)
            setMaintenanceHistoryData([])
            setMaintenanceHistoryTotal(0)
            setMaintenanceHistoryPage(1)
            setMaintenanceHistoryError('')
            setMaintenanceHistorySearch('')
            setMaintenanceHistoryStatusFilter('all')
          }}
        >
          <div className="staff-filters staff-modal-filters">
            <input
              type="text"
              className="staff-search-input"
              placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร, รายละเอียด..."
              value={maintenanceHistorySearch}
              onChange={(event) => {
                const value = event.target.value
                setMaintenanceHistorySearch(value)
                setMaintenanceHistoryPage(1)
                loadMaintenanceHistory(1, value, maintenanceHistoryStatusFilter)
              }}
            />
            <select
              className="staff-filter-select"
              value={maintenanceHistoryStatusFilter}
              onChange={(event) => {
                const value = event.target.value
                setMaintenanceHistoryStatusFilter(value)
                setMaintenanceHistoryPage(1)
                loadMaintenanceHistory(1, maintenanceHistorySearch, value)
              }}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="done">เสร็จสิ้น</option>
              <option value="cancelled">ยกเลิกแล้ว</option>
            </select>
          </div>

          {maintenanceHistoryLoading ? (
            <p className="staff-empty">กำลังโหลดข้อมูล...</p>
          ) : maintenanceHistoryError ? (
            <p className="staff-form-error">{maintenanceHistoryError}</p>
          ) : maintenanceHistoryData.length === 0 ? (
            <p className="staff-empty">ไม่พบประวัติการแจ้งซ่อมที่ตรงกับเงื่อนไข</p>
          ) : (
            <>
              <div className="staff-requests-list">
                {maintenanceHistoryData.map((request) => (
                  <div key={request.id} className="staff-request-item is-maintenance">
                    <div className="staff-request-main">
                      <div className="staff-request-headline">
                        <span className="staff-badge type-maintenance">แจ้งซ่อม</span>
                        <span className="staff-request-room">ห้อง {request.room_number}</span>
                        <span className="staff-request-tenant">
                          {request.first_name} {request.last_name}
                        </span>
                        <span className="staff-status-break" aria-hidden="true" />
                        <span className={`staff-badge status-${request.status} staff-status-end`}>
                          {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
                        </span>
                      </div>
                      <div className="staff-request-meta">
                        <span>{MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ'}</span>
                        <span>{MAINTENANCE_TIME_LABEL[request.preferred_time] || 'เวลาไหนก็ได้'}</span>
                        {request.contact_phone && <span>โทร {request.contact_phone}</span>}
                      </div>
                      <p className="staff-request-note">{request.description}</p>
                      <div className="staff-request-timeline">
                        <p className="staff-request-date is-reported">
                          <span className="staff-request-date-label">แจ้งซ่อม</span>
                          <span className="staff-request-date-value">{formatDateTime(request.created_at)}</span>
                        </p>
                        {request.accepted_by_name && (
                          <p className="staff-request-date is-accepted">
                            <span className="staff-request-date-label">
                              รับเรื่องโดย <span className="staff-request-date-staff">{request.accepted_by_name}</span>
                            </span>
                            <span className="staff-request-date-value">{formatDateTime(request.accepted_at)}</span>
                          </p>
                        )}
                        {request.completed_by_name && (
                          <p className={`staff-request-date is-${request.status === 'done' ? 'approved' : 'rejected'}`}>
                            <span className="staff-request-date-label">
                              {request.status === 'done' ? 'ซ่อมเสร็จโดย' : 'ยกเลิกโดย'}{' '}
                              <span className="staff-request-date-staff">{request.completed_by_name}</span>
                            </span>
                            <span className="staff-request-date-value">{formatDateTime(request.completed_at)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {maintenanceHistoryTotal > MODAL_ITEMS_PER_PAGE && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(maintenanceHistoryPage - 1) * MODAL_ITEMS_PER_PAGE + 1}
                    -{Math.min(maintenanceHistoryPage * MODAL_ITEMS_PER_PAGE, maintenanceHistoryTotal)} จาก{' '}
                    {maintenanceHistoryTotal} รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={maintenanceHistoryPage <= 1}
                      onClick={() => {
                        const next = Math.max(1, maintenanceHistoryPage - 1)
                        setMaintenanceHistoryPage(next)
                        loadMaintenanceHistory(next)
                      }}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {maintenanceHistoryPage} /{' '}
                      {Math.max(1, Math.ceil(maintenanceHistoryTotal / MODAL_ITEMS_PER_PAGE))}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={maintenanceHistoryPage >= Math.ceil(maintenanceHistoryTotal / MODAL_ITEMS_PER_PAGE)}
                      onClick={() => {
                        const next = Math.min(
                          Math.ceil(maintenanceHistoryTotal / MODAL_ITEMS_PER_PAGE),
                          maintenanceHistoryPage + 1,
                        )
                        setMaintenanceHistoryPage(next)
                        loadMaintenanceHistory(next)
                      }}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {historyRoom && (
        <Modal
          title={`ประวัติการจ่ายเงิน - ห้อง ${historyRoom.room_number}`}
          onClose={() => {
            setHistoryRoom(null)
            setHistorySearch('')
            setHistoryStatusFilter('all')
            setHistoryPage(1)
          }}
          variant="wide"
        >
          {historyLoading ? (
            <p className="staff-empty">กำลังโหลดข้อมูล...</p>
          ) : historyError ? (
            <p className="staff-form-error">{historyError}</p>
          ) : !historyData || historyData.length === 0 ? (
            <p className="staff-empty">ยังไม่มีประวัติการจ่ายเงินห้องนี้</p>
          ) : (
            <>
              <div className="staff-filters staff-modal-filters">
                <input
                  type="text"
                  className="staff-search-input"
                  placeholder="ค้นหาผู้เช่า, จำนวนเงิน, หมายเหตุ..."
                  value={historySearch}
                  onChange={(event) => {
                    setHistorySearch(event.target.value)
                    setHistoryPage(1)
                  }}
                />
                <select
                  className="staff-filter-select"
                  value={historyStatusFilter}
                  onChange={(event) => {
                    setHistoryStatusFilter(event.target.value)
                    setHistoryPage(1)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="paid">ชำระแล้ว</option>
                  <option value="pending">รอชำระ</option>
                  <option value="overdue">ค้างชำระ</option>
                </select>
              </div>

              {filteredHistoryPayments.length === 0 ? (
                <p className="staff-empty">ไม่พบประวัติการชำระเงินที่ตรงกับเงื่อนไข</p>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="staff-table">
                      <thead>
                        <tr>
                          <th>วันที่ชำระ</th>
                          <th>ผู้เช่า</th>
                          <th>รายการ</th>
                          <th>จำนวนเงิน</th>
                          <th>สถานะ</th>
                          <th>หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistoryPayments.map((payment) => {
                          const notePart = splitNote(payment.note)
                          return (
                            <tr key={payment.id}>
                              <td>{formatDateTime(payment.created_at)}</td>
                              <td>{payment.tenantName}</td>
                              <td>{PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง'}</td>
                              <td>฿{formatCurrency(payment.amount)}</td>
                              <td>
                                <span className={`staff-badge status-${payment.status}`}>
                                  {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                                </span>
                              </td>
                              <td>
                                <span className="staff-history-note-cell" title={payment.note || ''}>
                                  <span className="staff-history-note-main">{notePart.main}</span>
                                  {notePart.extra && (
                                    <span className="staff-history-note-extra">{notePart.extra}</span>
                                  )}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {historyTotalPages > 1 && (
                    <div className="staff-pagination">
                      <span className="staff-pagination-info">
                        แสดง {(currentHistoryPage - 1) * PAYMENT_HISTORY_PAGE_SIZE + 1}
                        -{Math.min(currentHistoryPage * PAYMENT_HISTORY_PAGE_SIZE, filteredHistoryPayments.length)} จาก{' '}
                        {filteredHistoryPayments.length} รายการ
                      </span>
                      <div className="staff-pagination-controls">
                        <button
                          type="button"
                          className="staff-action-btn is-ghost"
                          disabled={currentHistoryPage <= 1}
                          onClick={() => setHistoryPage(Math.max(1, currentHistoryPage - 1))}
                        >
                          ก่อนหน้า
                        </button>
                        <span className="staff-pagination-page">
                          หน้า {currentHistoryPage} / {historyTotalPages}
                        </span>
                        <button
                          type="button"
                          className="staff-action-btn is-ghost"
                          disabled={currentHistoryPage >= historyTotalPages}
                          onClick={() => setHistoryPage(Math.min(historyTotalPages, currentHistoryPage + 1))}
                        >
                          ถัดไป
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Modal>
      )}

      {collectRoom && (
        <Modal
          title={`เก็บเงิน - ห้อง ${collectRoom.room_number}`}
          onClose={() => setCollectRoom(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-money">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.7-2.5 1.7-2.5.6-2.5 1.8 1.1 2 2.5 2 2.5-.8 2.5-2" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันการเก็บเงินค่าเช่า</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{collectRoom.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {collectRoom.tenant ? `${collectRoom.tenant.first_name} ${collectRoom.tenant.last_name}` : '-'}
                  </strong>
                </div>
              </div>
              {collectRoom.currentDue && (
                <>
                  {collectRoom.currentDue.items?.length > 1 && (
                    <div className="staff-confirm-details">
                      {collectRoom.currentDue.items.map((item, index) => (
                        <div className="staff-confirm-detail-row" key={item.id ?? `${item.type}-${index}`}>
                          <span>{item.label}</span>
                          <strong>฿{formatCurrency(item.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="staff-confirm-amount-block">
                    <p className="staff-confirm-amount-label">ยอดที่ต้องชำระ</p>
                    <p className="staff-confirm-amount">
                      <span className="staff-confirm-amount-symbol">฿</span>
                      {formatCurrency(collectRoom.currentDue.amount)}
                    </p>
                  </div>
                </>
              )}
              {collectError && <p className="staff-form-error">{collectError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={collectSubmitting}
                  onClick={handleCollectPayment}
                >
                  {collectSubmitting ? 'กำลังบันทึก...' : 'ยืนยันเก็บเงิน'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {dueDetailRoom && (
        <Modal
          title={`รายการค้างชำระ - ห้อง ${dueDetailRoom.room_number}`}
          onClose={() => setDueDetailRoom(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{dueDetailRoom.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {dueDetailRoom.tenant
                      ? `${dueDetailRoom.tenant.first_name} ${dueDetailRoom.tenant.last_name}`
                      : '-'}
                  </strong>
                </div>
              </div>

              {dueDetailRoom.currentDue?.items?.length > 0 && (
                <div className="staff-confirm-details">
                  {dueDetailRoom.currentDue.items.map((item, index) => (
                    <div className="staff-confirm-detail-row" key={item.id ?? `${item.type}-${index}`}>
                      <span>{item.label}</span>
                      <strong>฿{formatCurrency(item.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}

              {dueDetailRoom.currentDue && (
                <div className="staff-confirm-amount-block">
                  <p className="staff-confirm-amount-label">ยอดค้างชำระรวม</p>
                  <p className="staff-confirm-amount">
                    <span className="staff-confirm-amount-symbol">฿</span>
                    {formatCurrency(dueDetailRoom.currentDue.amount)}
                  </p>
                </div>
              )}

              <div className="staff-due-detail-actions">
                <button
                  type="button"
                  className="staff-form-link-btn"
                  onClick={() => {
                    const room = dueDetailRoom
                    setDueDetailRoom(null)
                    openHistory(room)
                  }}
                >
                  ดูประวัติการจ่ายเงิน
                </button>

                <div className="staff-form-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
                    onClick={() => {
                      const room = dueDetailRoom
                      setDueDetailRoom(null)
                      openCollect(room)
                    }}
                  >
                    เก็บเงิน
                  </button>
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {utilityRoom && (
        <Modal
          title={`ส่งค่าน้ำ-ค่าไฟ - ห้อง ${utilityRoom.room_number}`}
          onClose={() => setUtilityRoom(null)}
          variant="confirm"
        >
          {(requestClose) => {
            const unitPrice = Number(utilityRoom.electricity_unit_price) || 0
            const isUnitsMode = utilityForm.electricity_mode === 'units'
            const units = Number(utilityForm.electricity_units)
            const directAmount = Number(utilityForm.electricity_amount)
            const electricityAmount = isUnitsMode
              ? Number.isFinite(units) && units > 0
                ? units * unitPrice
                : 0
              : Number.isFinite(directAmount) && directAmount > 0
                ? directAmount
                : 0
            const waterAmount = Number(utilityForm.water_amount)
            const total = electricityAmount + (Number.isFinite(waterAmount) && waterAmount > 0 ? waterAmount : 0)
            return (
              <div className="staff-confirm-body">
                <div className="staff-confirm-details">
                  <div className="staff-confirm-detail-row">
                    <span>ห้อง</span>
                    <strong>{utilityRoom.room_number}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>ผู้เช่า</span>
                    <strong>
                      {utilityRoom.tenant ? `${utilityRoom.tenant.first_name} ${utilityRoom.tenant.last_name}` : '-'}
                    </strong>
                  </div>
                </div>

                <div className="staff-form-field">
                  <div className="staff-form-label-row">
                    <label className="staff-form-label" htmlFor="utility-electricity-input">
                      {isUnitsMode ? `ค่าไฟฟ้า (บาท/หน่วย ฿${formatCurrency(unitPrice)})` : 'ค่าไฟฟ้า (บาท)'}
                    </label>
                    <div className="staff-form-mode-switch">
                      <button
                        type="button"
                        className={`staff-form-mode-btn${isUnitsMode ? ' is-active' : ''}`}
                        onClick={() => setUtilityForm((prev) => ({ ...prev, electricity_mode: 'units' }))}
                      >
                        คิดตามหน่วย
                      </button>
                      <button
                        type="button"
                        className={`staff-form-mode-btn${!isUnitsMode ? ' is-active' : ''}`}
                        onClick={() => setUtilityForm((prev) => ({ ...prev, electricity_mode: 'amount' }))}
                      >
                        ราคาปกติ
                      </button>
                    </div>
                  </div>
                  {isUnitsMode ? (
                    <input
                      id="utility-electricity-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="staff-form-input no-spinner"
                      placeholder="เช่น 50 (หน่วย)"
                      value={utilityForm.electricity_units}
                      onChange={(event) =>
                        setUtilityForm((prev) => ({ ...prev, electricity_units: event.target.value }))
                      }
                    />
                  ) : (
                    <input
                      id="utility-electricity-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="staff-form-input no-spinner"
                      placeholder="เช่น 400 (บาท)"
                      value={utilityForm.electricity_amount}
                      onChange={(event) =>
                        setUtilityForm((prev) => ({ ...prev, electricity_amount: event.target.value }))
                      }
                    />
                  )}
                  {isUnitsMode && electricityAmount > 0 && (
                    <span className="staff-form-hint">คิดเป็น ฿{formatCurrency(electricityAmount)}</span>
                  )}
                </div>

                <div className="staff-form-field">
                  <label className="staff-form-label" htmlFor="utility-water-amount">
                    ค่าน้ำ (บาท)
                  </label>
                  <input
                    id="utility-water-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="staff-form-input no-spinner"
                    placeholder="เช่น 100"
                    value={utilityForm.water_amount}
                    onChange={(event) => setUtilityForm((prev) => ({ ...prev, water_amount: event.target.value }))}
                  />
                </div>

                {total > 0 && (
                  <div className="staff-confirm-amount-block">
                    <p className="staff-confirm-amount-label">ยอดรวมที่จะส่งให้ลูกค้า</p>
                    <p className="staff-confirm-amount">
                      <span className="staff-confirm-amount-symbol">฿</span>
                      {formatCurrency(total)}
                    </p>
                  </div>
                )}

                {utilityError && <p className="staff-form-error">{utilityError}</p>}
                <div className="staff-form-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
                    disabled={utilitySubmitting}
                    onClick={handleSendUtilityBill}
                  >
                    {utilitySubmitting ? 'กำลังส่ง...' : 'ส่งบิล'}
                  </button>
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                    ยกเลิก
                  </button>
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {maintenanceCompleteConfirm && (
        <Modal title="ยืนยันงานเสร็จสิ้น" onClose={() => setMaintenanceCompleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-success">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันว่างานซ่อมเสร็จสิ้นแล้ว</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{maintenanceCompleteConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {maintenanceCompleteConfirm.first_name} {maintenanceCompleteConfirm.last_name}
                  </strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `maintenance-${maintenanceCompleteConfirm.id}`}
                  onClick={handleConfirmMaintenanceComplete}
                >
                  {processingRequestKey === `maintenance-${maintenanceCompleteConfirm.id}` ? 'กำลังดำเนินการ...' : 'ยืนยันเสร็จสิ้น'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {moveoutConfirmRequest && (
        <Modal title="ยืนยันการย้ายออก" onClose={() => setMoveoutConfirmRequest(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-warning">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันอนุมัติการย้ายออก</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{moveoutConfirmRequest.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {moveoutConfirmRequest.first_name} {moveoutConfirmRequest.last_name}
                  </strong>
                </div>
              </div>
              <div className="staff-confirm-warning">
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
                  <path d="M12 9v4M12 17h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                <p>การดำเนินการนี้จะระงับบัญชีผู้เช่ารายนี้ และเปลี่ยนสถานะห้องเป็นว่างทันที</p>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `tenant-${moveoutConfirmRequest.id}`}
                  onClick={handleConfirmMoveoutApproval}
                >
                  {processingRequestKey === `tenant-${moveoutConfirmRequest.id}` ? 'กำลังดำเนินการ...' : 'ยืนยันอนุมัติ'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {renewApproveConfirm && (
        <Modal title="ยืนยันการอนุมัติต่อสัญญา" onClose={() => setRenewApproveConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-success">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันอนุมัติคำขอต่อสัญญา</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{renewApproveConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {renewApproveConfirm.first_name} {renewApproveConfirm.last_name}
                  </strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ระยะเวลา</span>
                  <strong>
                    {RENEW_DURATION_LABEL[renewApproveConfirm.renew_duration_months] ||
                      `${renewApproveConfirm.renew_duration_months} เดือน`}
                  </strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `tenant-${renewApproveConfirm.id}`}
                  onClick={handleConfirmRenewApproval}
                >
                  {processingRequestKey === `tenant-${renewApproveConfirm.id}` ? 'กำลังดำเนินการ...' : 'ยืนยันอนุมัติ'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {moveoutAcknowledgeConfirm && (
        <Modal title="ยืนยันรับเรื่องแจ้งย้ายออก" onClose={() => setMoveoutAcknowledgeConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-info">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันรับเรื่องคำขอแจ้งย้ายออก</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{moveoutAcknowledgeConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {moveoutAcknowledgeConfirm.first_name} {moveoutAcknowledgeConfirm.last_name}
                  </strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `tenant-${moveoutAcknowledgeConfirm.id}`}
                  onClick={handleConfirmMoveoutAcknowledge}
                >
                  {processingRequestKey === `tenant-${moveoutAcknowledgeConfirm.id}` ? 'กำลังดำเนินการ...' : 'ยืนยันรับเรื่อง'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {tenantRejectConfirm && (
        <Modal title="ยืนยันการปฏิเสธคำขอ" onClose={() => setTenantRejectConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-warning">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 9v4M12 17h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </div>
              <p className="staff-confirm-message">
                ยืนยันปฏิเสธคำขอ{TENANT_REQUEST_TYPE_LABEL[tenantRejectConfirm.type] || ''}
              </p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{tenantRejectConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {tenantRejectConfirm.first_name} {tenantRejectConfirm.last_name}
                  </strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `tenant-${tenantRejectConfirm.id}`}
                  onClick={handleConfirmTenantReject}
                >
                  {processingRequestKey === `tenant-${tenantRejectConfirm.id}` ? 'กำลังดำเนินการ...' : 'ยืนยันปฏิเสธ'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default StaffMain
