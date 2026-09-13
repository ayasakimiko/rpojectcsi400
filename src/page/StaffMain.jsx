import { Fragment, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/StaffPage.css'

function Modal({ title, onClose, children }) {
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
      <div className={`staff-modal${isClosing ? ' is-closing' : ''}`} onClick={(event) => event.stopPropagation()}>
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

function StaffMain() {
  const navigate = useNavigate()
  const [staffUser, setStaffUser] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roomsPage, setRoomsPage] = useState(1)
  const [expandedRoomNumbers, setExpandedRoomNumbers] = useState(() => new Set())

  const [historyRoom, setHistoryRoom] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

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
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'อนุมัติคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setProcessingRequestKey('')
    }
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
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
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
          <p className="staff-request-meta">
            {request.type === 'renew' &&
              `ขอต่อ ${RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`} · ${RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type}`}
            {request.phone ? ` · โทร ${request.phone}` : ''}
          </p>
          {request.note && <p className="staff-request-note">หมายเหตุ: {request.note}</p>}
          <p className="staff-request-date">{formatDateTime(request.created_at)}</p>
        </div>
        <div className="staff-row-actions">
          <button
            type="button"
            className="staff-action-btn is-primary"
            disabled={isProcessing}
            onClick={() => handleApproveTenantRequest(request)}
          >
            {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติ'}
          </button>
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
          {request.status === 'pending' && (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => handleMaintenanceAction(request, 'accept')}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'รับเรื่อง'}
            </button>
          )}
          <button
            type="button"
            className="staff-action-btn is-primary"
            disabled={isProcessing}
            onClick={() => handleMaintenanceAction(request, 'complete')}
          >
            เสร็จสิ้น
          </button>
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
    setHistoryLoading(true)
    try {
      const { data } = await axios.get(`/api/staff/rooms/${room.room_number}/history`, { headers: authHeaders() })
      setHistoryData(data.rentalHistory)
    } catch (err) {
      setHistoryError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติการเช่าได้')
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
                          <td className="staff-col-optional">{hasDue ? `฿${formatCurrency(room.currentDue.amount)}` : '-'}</td>
                          <td>
                            <div className="staff-row-actions staff-row-actions-desktop">
                              <button
                                type="button"
                                className="staff-action-btn is-ghost"
                                onClick={() => openHistory(room)}
                              >
                                ประวัติการเช่า
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
                                  </div>
                                  <div className="staff-row-detail-item">
                                    <span>ยอดค้างชำระ</span>
                                    <strong>{hasDue ? `฿${formatCurrency(room.currentDue.amount)}` : '-'}</strong>
                                  </div>
                                  <div className="staff-row-actions">
                                    <button
                                      type="button"
                                      className="staff-action-btn is-ghost"
                                      onClick={() => openHistory(room)}
                                    >
                                      ประวัติการเช่า
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
              {tenantRequests.length > REQUEST_PREVIEW_COUNT && (
                <button type="button" className="staff-view-all-btn" onClick={() => setViewAllRequests('tenant')}>
                  ดูทั้งหมด
                </button>
              )}
            </div>

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
              ) : (
                <div className="staff-requests-list">
                  {tenantRequests.slice(0, REQUEST_PREVIEW_COUNT).map(renderTenantRequestItem)}
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
              {maintenanceRequests.length > REQUEST_PREVIEW_COUNT && (
                <button type="button" className="staff-view-all-btn" onClick={() => setViewAllRequests('maintenance')}>
                  ดูทั้งหมด
                </button>
              )}
            </div>

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
              ) : (
                <div className="staff-requests-list">
                  {maintenanceRequests.slice(0, REQUEST_PREVIEW_COUNT).map(renderMaintenanceRequestItem)}
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
        <Modal title={`ประวัติการเช่า - ห้อง ${historyRoom.room_number}`} onClose={() => setHistoryRoom(null)}>
          {historyLoading ? (
            <p className="staff-empty">กำลังโหลดข้อมูล...</p>
          ) : historyError ? (
            <p className="staff-form-error">{historyError}</p>
          ) : !historyData || historyData.length === 0 ? (
            <p className="staff-empty">ยังไม่มีประวัติการเช่าห้องนี้</p>
          ) : (
            historyData.map((entry) => (
              <div key={entry.booking_id} className="staff-rental-entry">
                <p className="staff-rental-entry-title">
                  ผู้เช่า: {entry.first_name} {entry.last_name}
                  <span className="staff-rental-entry-date">เริ่มสัญญา {formatDateTime(entry.created_at)}</span>
                </p>
                {entry.payments.length === 0 ? (
                  <p className="staff-empty">ยังไม่มีประวัติการชำระค่าเช่า</p>
                ) : (
                  <div className="table-responsive">
                    <table className="staff-table">
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
                )}
              </div>
            ))
          )}
        </Modal>
      )}

      {collectRoom && (
        <Modal title={`เก็บเงิน - ห้อง ${collectRoom.room_number}`} onClose={() => setCollectRoom(null)}>
          {(requestClose) => (
            <div className="staff-confirm-body">
              <p className="staff-confirm-message">
                ยืนยันการเก็บเงินค่าเช่าห้อง {collectRoom.room_number}
                <br />
                จากคุณ {collectRoom.tenant ? `${collectRoom.tenant.first_name} ${collectRoom.tenant.last_name}` : '-'}
              </p>
              {collectRoom.currentDue && (
                <p className="staff-confirm-amount">฿{formatCurrency(collectRoom.currentDue.amount)}</p>
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
    </div>
  )
}

export default StaffMain
