import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/StaffPage.css'

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
      className={`staff-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`staff-modal${variant === 'confirm' ? ' staff-modal-confirm' : ''}${isClosing ? ' is-closing' : ''}`}
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

const TENANT_REQUEST_TYPE_LABEL = {
  renew: 'ต่อสัญญา',
  moveout: 'แจ้งย้ายออก',
}

const TENANT_REQUEST_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'รับเรื่องแล้ว',
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
      detail: `ห้อง ${request.room_number} · ${request.first_name} ${request.last_name}${
        request.note ? ` · หมายเหตุ: ${request.note}` : ''
      }`,
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
      detail: `ห้อง ${request.room_number} · ${request.first_name} ${request.last_name} · ${
        MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ'
      }`,
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

function StaffMain() {
  const navigate = useNavigate()
  const [staffUser, setStaffUser] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
  const [actionSuccess, setActionSuccess] = useState('')

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
  const [maintenanceCompleteConfirm, setMaintenanceCompleteConfirm] = useState(null)

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

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
    const storedUser = sessionStorage.getItem('user')
    if (storedUser) {
      try {
        setStaffUser(JSON.parse(storedUser))
      } catch {
        setStaffUser(null)
      }
    }

    let isMounted = true
    loadRooms().finally(() => {
      if (isMounted) setLoading(false)
    })
    loadRequests().finally(() => {
      if (isMounted) setRequestsLoading(false)
    })
    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
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
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'รับเรื่องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setProcessingRequestKey('')
    }
  }

  const handleConfirmMoveoutApproval = async () => {
    if (!moveoutConfirmRequest) return
    const success = await handleApproveTenantRequest(moveoutConfirmRequest)
    if (success) setMoveoutConfirmRequest(null)
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
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'ปฏิเสธคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setProcessingRequestKey('')
    }
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
            {request.type === 'moveout' && (
              <span className={`staff-badge status-${request.status}`}>
                {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
              </span>
            )}
          </div>
          <p className="staff-request-meta">
            {request.type === 'renew' &&
              `ขอต่อ ${RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`} · ${RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type}`}
            {request.phone ? ` · โทร ${request.phone}` : ''}
          </p>
          {request.note && <p className="staff-request-note">หมายเหตุ: {request.note}</p>}
          <p className="staff-request-date">{formatDateTime(request.created_at)}</p>
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
                onClick={() => handleAcknowledgeTenantRequest(request)}
              >
                {isProcessing ? 'กำลังดำเนินการ...' : 'รับเรื่อง'}
              </button>
            )
          ) : (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => handleApproveTenantRequest(request)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติ'}
            </button>
          )}
          <button
            type="button"
            className="staff-action-btn is-ghost"
            disabled={isProcessing}
            onClick={() => handleRejectTenantRequest(request)}
          >
            ปฏิเสธ
          </button>
        </div>
      </div>
    )
  }

  const renderMaintenanceRequestItem = (request) => {
    const key = `maintenance-${request.id}`
    const isProcessing = processingRequestKey === key
    return (
      <div key={key} className="staff-request-item">
        <div className="staff-request-main">
          <div className="staff-request-headline">
            <span className="staff-badge type-maintenance">แจ้งซ่อม</span>
            <span className="staff-request-room">ห้อง {request.room_number}</span>
            <span className="staff-request-tenant">{request.first_name} {request.last_name}</span>
            <span className={`staff-badge status-${request.status}`}>
              {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
            </span>
          </div>
          <p className="staff-request-meta">
            {MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ'}
            {' · '}
            {MAINTENANCE_TIME_LABEL[request.preferred_time] || 'เวลาไหนก็ได้'}
            {request.contact_phone ? ` · โทร ${request.contact_phone}` : ''}
          </p>
          <p className="staff-request-note">{request.description}</p>
          <p className="staff-request-date">{formatDateTime(request.created_at)}</p>
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
    return rooms.filter((room) => {
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
                  {notifDetail.detail && (
                    <>
                      <br />
                      {notifDetail.detail}
                    </>
                  )}
                </p>
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

        {actionSuccess && <p className="staff-form-success">{actionSuccess}</p>}

        <div className="staff-summary-grid">
          <div className="staff-summary-card">
            <span className="staff-summary-label">ห้องทั้งหมด</span>
            <span className="staff-summary-value">{summary.total}</span>
          </div>
          <div className="staff-summary-card is-booked">
            <span className="staff-summary-label">ห้องไม่ว่าง</span>
            <span className="staff-summary-value">{summary.booked}</span>
          </div>
          <div className="staff-summary-card is-vacant">
            <span className="staff-summary-label">ห้องว่าง</span>
            <span className="staff-summary-value">{summary.vacant}</span>
          </div>
          <div className="staff-summary-card is-due">
            <span className="staff-summary-label">รอเก็บเงิน</span>
            <span className="staff-summary-value">{summary.dueCount}</span>
          </div>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <h2>รายการห้องพัก</h2>
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

          <div className="table-responsive">
            <table className="staff-table">
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
                            {room.rental_start_date && room.rental_end_date
                              ? `${formatDate(room.rental_start_date)} - ${formatDate(room.rental_end_date)}`
                              : '-'}
                            {expiryStatus && (
                              <span className={`staff-badge status-${expiryStatus.level} staff-expiry-badge`}>
                                {expiryStatus.label}
                              </span>
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
                              <span className={`staff-due-amount is-${dueBadgeClass(room.currentDue.status)}`}>
                                ฿{formatCurrency(room.currentDue.amount)}
                              </span>
                            ) : (
                              <span className="staff-due-amount is-none">-</span>
                            )}
                          </td>
                          <td>
                            <div className="staff-row-actions staff-row-actions-desktop">
                              <button
                                type="button"
                                className="staff-action-btn is-ghost"
                                onClick={() => openHistory(room)}
                              >
                                ประวัติการจ่ายเงิน
                              </button>
                              {hasDue && (
                                <button
                                  type="button"
                                  className="staff-action-btn is-primary"
                                  onClick={() => openCollect(room)}
                                >
                                  เก็บเงิน
                                </button>
                              )}
                            </div>
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
                                    <strong>
                                      {room.rental_start_date && room.rental_end_date
                                        ? `${formatDate(room.rental_start_date)} - ${formatDate(room.rental_end_date)}`
                                        : '-'}
                                    </strong>
                                    {expiryStatus && (
                                      <span className={`staff-badge status-${expiryStatus.level} staff-expiry-badge`}>
                                        {expiryStatus.label}
                                      </span>
                                    )}
                                  </div>
                                  <div className="staff-row-detail-item">
                                    <span>ยอดค้างชำระ</span>
                                    {hasDue ? (
                                      <strong className={`staff-due-amount is-${dueBadgeClass(room.currentDue.status)}`}>
                                        ฿{formatCurrency(room.currentDue.amount)}
                                      </strong>
                                    ) : (
                                      <strong className="staff-due-amount is-none">-</strong>
                                    )}
                                  </div>
                                  <div className="staff-row-actions">
                                    <button
                                      type="button"
                                      className="staff-action-btn is-ghost"
                                      onClick={() => openHistory(room)}
                                    >
                                      ประวัติการจ่ายเงิน
                                    </button>
                                    {hasDue && (
                                      <button
                                        type="button"
                                        className="staff-action-btn is-primary"
                                        onClick={() => openCollect(room)}
                                      >
                                        เก็บเงิน
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
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

        <div className="staff-requests-grid">
          <div className="staff-card">
            <div className="staff-card-header">
              <h2>
                คำขอต่อสัญญา / แจ้งย้ายออก
                {tenantRequests.length > 0 && <span className="staff-count-pill">{tenantRequests.length}</span>}
              </h2>
              {filteredTenantRequests.length > REQUEST_PREVIEW_COUNT && (
                <button type="button" className="staff-view-all-btn" onClick={() => setViewAllRequests('tenant')}>
                  ดูทั้งหมด
                </button>
              )}
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
              {filteredMaintenanceRequests.length > REQUEST_PREVIEW_COUNT && (
                <button type="button" className="staff-view-all-btn" onClick={() => setViewAllRequests('maintenance')}>
                  ดูทั้งหมด
                </button>
              )}
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
      </div>

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

      {historyRoom && (
        <Modal
          title={`ประวัติการจ่ายเงิน - ห้อง ${historyRoom.room_number}`}
          onClose={() => {
            setHistoryRoom(null)
            setHistorySearch('')
            setHistoryStatusFilter('all')
            setHistoryPage(1)
          }}
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
                          <th>จำนวนเงิน</th>
                          <th>สถานะ</th>
                          <th>หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistoryPayments.map((payment) => (
                          <tr key={payment.id}>
                            <td>{formatDateTime(payment.created_at)}</td>
                            <td>{payment.tenantName}</td>
                            <td>฿{formatCurrency(payment.amount)}</td>
                            <td>
                              <span className={`staff-badge status-${payment.status}`}>
                                {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                              </span>
                            </td>
                            <td>{payment.note || '-'}</td>
                          </tr>
                        ))}
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
                <div className="staff-confirm-amount-block">
                  <p className="staff-confirm-amount-label">ยอดที่ต้องชำระ</p>
                  <p className="staff-confirm-amount">
                    <span className="staff-confirm-amount-symbol">฿</span>
                    {formatCurrency(collectRoom.currentDue.amount)}
                  </p>
                </div>
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
    </div>
  )
}

export default StaffMain
