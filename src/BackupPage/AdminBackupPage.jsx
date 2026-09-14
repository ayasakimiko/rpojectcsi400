import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './AdminBackupPage.css'

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
      className={`admin-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`admin-modal${variant === 'confirm' ? ' admin-modal-confirm' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-header">
          <h3>{title}</h3>
          <button type="button" className="admin-modal-close" onClick={requestClose} aria-label="ปิด">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="admin-modal-body">{typeof children === 'function' ? children(requestClose) : children}</div>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="admin-pagination">
      <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ก่อนหน้า
      </button>
      <span className="admin-page-info">
        หน้า {page} / {totalPages}
      </span>
      <button type="button" className="admin-page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ถัดไป
      </button>
    </div>
  )
}

const TABS = [
  { key: 'rooms', label: 'ห้องพัก' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'customers', label: 'ลูกค้า' },
  { key: 'requests', label: 'ประวัติคำขอผู้เช่า' },
  { key: 'maintenance', label: 'ประวัติแจ้งซ่อม' },
]

const REQUEST_TYPE_LABEL = { renew: 'ต่อสัญญา', moveout: 'แจ้งย้ายออก' }
const REQUEST_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'รับเรื่องแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธแล้ว',
}
const MAINTENANCE_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
}
const MAINTENANCE_CATEGORY_LABEL = {
  electrical: 'ไฟฟ้า',
  plumbing: 'ประปา',
  aircon: 'เครื่องปรับอากาศ',
  furniture: 'เฟอร์นิเจอร์',
  other: 'อื่นๆ',
}

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const emptyRoomForm = {
  room_number: '',
  price: '',
  bed: '1',
  electricity_unit_price: '8',
  water_price: '100',
  air_conditioner: false,
  wifi: false,
  refrigerator: false,
  bathroom: false,
  cctv: false,
}

const emptyStaffForm = { idcard: '', password: '', phone: '', first_name: '', last_name: '', age: '' }

const emptyCustomerForm = { first_name: '', last_name: '', phone: '', age: '', deposit_amount: '' }

function AdminBackupPage() {
  const navigate = useNavigate()
  const [adminUser, setAdminUser] = useState(null)
  const [activeTab, setActiveTab] = useState('rooms')
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

  const handleUnauthorized = (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      navigate('/login', { replace: true })
      return true
    }
    return false
  }

  /* -------------------------------- Rooms -------------------------------- */
  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [roomModal, setRoomModal] = useState(null)
  const [roomForm, setRoomForm] = useState(emptyRoomForm)
  const [roomSubmitting, setRoomSubmitting] = useState(false)
  const [roomFormError, setRoomFormError] = useState('')
  const [roomDeleteConfirm, setRoomDeleteConfirm] = useState(null)

  const loadRooms = () => {
    setRoomsLoading(true)
    return axios
      .get('/api/admin/rooms', { headers: authHeaders() })
      .then(({ data }) => {
        setRooms(data.rooms)
        setRoomsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRoomsError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลห้องพักได้')
      })
      .finally(() => setRoomsLoading(false))
  }

  const openCreateRoom = () => {
    setRoomForm(emptyRoomForm)
    setRoomFormError('')
    setRoomModal({ mode: 'create' })
  }

  const openEditRoom = (room) => {
    setRoomForm({
      room_number: String(room.room_number),
      price: String(room.price),
      bed: String(room.bed ?? 1),
      electricity_unit_price: String(room.electricity_unit_price),
      water_price: String(room.water_price),
      air_conditioner: Boolean(room.air_conditioner),
      wifi: Boolean(room.wifi),
      refrigerator: Boolean(room.refrigerator),
      bathroom: Boolean(room.bathroom),
      cctv: Boolean(room.cctv),
    })
    setRoomFormError('')
    setRoomModal({ mode: 'edit', room })
  }

  const handleRoomFormChange = (event) => {
    const { name, type, value, checked } = event.target
    setRoomForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const submitRoomForm = async (event) => {
    event.preventDefault()
    setRoomSubmitting(true)
    setRoomFormError('')
    const payload = {
      room_number: Number(roomForm.room_number),
      price: Number(roomForm.price),
      bed: Number(roomForm.bed),
      electricity_unit_price: Number(roomForm.electricity_unit_price),
      water_price: Number(roomForm.water_price),
      air_conditioner: roomForm.air_conditioner,
      wifi: roomForm.wifi,
      refrigerator: roomForm.refrigerator,
      bathroom: roomForm.bathroom,
      cctv: roomForm.cctv,
    }
    try {
      if (roomModal.mode === 'create') {
        const { data } = await axios.post('/api/admin/rooms', payload, { headers: authHeaders() })
        setSuccessMessage(data.message || 'สร้างห้องพักสำเร็จ')
      } else {
        const { room_number, ...editable } = payload
        void room_number
        const { data } = await axios.put(`/api/admin/rooms/${roomModal.room.room_number}`, editable, { headers: authHeaders() })
        setSuccessMessage(data.message || 'แก้ไขข้อมูลห้องพักสำเร็จ')
      }
      setRoomModal(null)
      await loadRooms()
    } catch (err) {
      setRoomFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setRoomSubmitting(false)
    }
  }

  const confirmDeleteRoom = async () => {
    if (!roomDeleteConfirm) return
    try {
      const { data } = await axios.delete(`/api/admin/rooms/${roomDeleteConfirm.room_number}`, { headers: authHeaders() })
      setSuccessMessage(data.message || 'ลบห้องพักสำเร็จ')
      setRoomDeleteConfirm(null)
      await loadRooms()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ลบห้องพักไม่สำเร็จ')
      setRoomDeleteConfirm(null)
    }
  }

  const filteredRooms = useMemo(() => {
    const keyword = roomSearch.trim().toLowerCase()
    if (!keyword) return rooms
    return rooms.filter((room) => {
      const tenantName = room.customer_id ? `${room.first_name} ${room.last_name}`.toLowerCase() : ''
      return String(room.room_number).includes(keyword) || tenantName.includes(keyword) || (room.phone || '').includes(keyword)
    })
  }, [rooms, roomSearch])

  /* -------------------------------- Staff --------------------------------- */
  const [staffList, setStaffList] = useState([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [staffError, setStaffError] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [staffModal, setStaffModal] = useState(null)
  const [staffForm, setStaffForm] = useState(emptyStaffForm)
  const [staffSubmitting, setStaffSubmitting] = useState(false)
  const [staffFormError, setStaffFormError] = useState('')
  const [staffDeleteConfirm, setStaffDeleteConfirm] = useState(null)

  const loadStaff = () => {
    setStaffLoading(true)
    return axios
      .get('/api/admin/staff', { headers: authHeaders() })
      .then(({ data }) => {
        setStaffList(data.staff)
        setStaffError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setStaffError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลพนักงานได้')
      })
      .finally(() => setStaffLoading(false))
  }

  const openCreateStaff = () => {
    setStaffForm(emptyStaffForm)
    setStaffFormError('')
    setStaffModal({ mode: 'create' })
  }

  const openEditStaff = (member) => {
    setStaffForm({
      idcard: member.idcard,
      password: '',
      phone: member.phone,
      first_name: member.first_name,
      last_name: member.last_name,
      age: String(member.age),
    })
    setStaffFormError('')
    setStaffModal({ mode: 'edit', staff: member })
  }

  const handleStaffFormChange = (event) => {
    const { name, value } = event.target
    setStaffForm((prev) => ({ ...prev, [name]: value }))
  }

  const submitStaffForm = async (event) => {
    event.preventDefault()
    setStaffSubmitting(true)
    setStaffFormError('')
    try {
      if (staffModal.mode === 'create') {
        const { data } = await axios.post('/api/admin/staff', staffForm, { headers: authHeaders() })
        setSuccessMessage(data.message || 'เพิ่มพนักงานสำเร็จ')
      } else {
        const payload = {
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          phone: staffForm.phone,
          age: Number(staffForm.age),
        }
        if (staffForm.password) payload.password = staffForm.password
        const { data } = await axios.put(`/api/admin/staff/${staffModal.staff.id}`, payload, { headers: authHeaders() })
        setSuccessMessage(data.message || 'แก้ไขข้อมูลพนักงานสำเร็จ')
      }
      setStaffModal(null)
      await loadStaff()
    } catch (err) {
      setStaffFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setStaffSubmitting(false)
    }
  }

  const toggleStaffSuspend = async (member) => {
    try {
      const { data } = await axios.patch(
        `/api/admin/staff/${member.id}/suspend`,
        { is_suspended: !member.is_suspended },
        { headers: authHeaders() },
      )
      setSuccessMessage(data.message || 'ดำเนินการสำเร็จ')
      await loadStaff()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ')
    }
  }

  const confirmDeleteStaff = async () => {
    if (!staffDeleteConfirm) return
    try {
      const { data } = await axios.delete(`/api/admin/staff/${staffDeleteConfirm.id}`, { headers: authHeaders() })
      setSuccessMessage(data.message || 'ลบพนักงานสำเร็จ')
      setStaffDeleteConfirm(null)
      await loadStaff()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ลบพนักงานไม่สำเร็จ')
      setStaffDeleteConfirm(null)
    }
  }

  const filteredStaff = useMemo(() => {
    const keyword = staffSearch.trim().toLowerCase()
    if (!keyword) return staffList
    return staffList.filter((member) => {
      const name = `${member.first_name} ${member.last_name}`.toLowerCase()
      return name.includes(keyword) || member.phone.includes(keyword) || member.idcard.includes(keyword)
    })
  }, [staffList, staffSearch])

  /* ------------------------------- Customers ------------------------------- */
  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [customersError, setCustomersError] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerModal, setCustomerModal] = useState(null)
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm)
  const [customerSubmitting, setCustomerSubmitting] = useState(false)
  const [customerFormError, setCustomerFormError] = useState('')
  const [customerDetail, setCustomerDetail] = useState(null)
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false)
  const [customerDetailError, setCustomerDetailError] = useState('')

  const loadCustomers = (search = customerSearch) => {
    setCustomersLoading(true)
    return axios
      .get('/api/admin/customers', { headers: authHeaders(), params: { search: search || undefined } })
      .then(({ data }) => {
        setCustomers(data.customers)
        setCustomersError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setCustomersError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลลูกค้าได้')
      })
      .finally(() => setCustomersLoading(false))
  }

  const openEditCustomer = (customer) => {
    setCustomerForm({
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      age: String(customer.age),
      deposit_amount: customer.deposit_amount != null ? String(customer.deposit_amount) : '',
    })
    setCustomerFormError('')
    setCustomerModal(customer)
  }

  const handleCustomerFormChange = (event) => {
    const { name, value } = event.target
    setCustomerForm((prev) => ({ ...prev, [name]: value }))
  }

  const submitCustomerForm = async (event) => {
    event.preventDefault()
    setCustomerSubmitting(true)
    setCustomerFormError('')
    try {
      const payload = {
        first_name: customerForm.first_name,
        last_name: customerForm.last_name,
        phone: customerForm.phone,
        age: Number(customerForm.age),
        deposit_amount: customerForm.deposit_amount === '' ? null : Number(customerForm.deposit_amount),
      }
      const { data } = await axios.put(`/api/admin/customers/${customerModal.id}`, payload, { headers: authHeaders() })
      setSuccessMessage(data.message || 'แก้ไขข้อมูลลูกค้าสำเร็จ')
      setCustomerModal(null)
      await loadCustomers()
    } catch (err) {
      setCustomerFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setCustomerSubmitting(false)
    }
  }

  const toggleCustomerSuspend = async (customer) => {
    try {
      const { data } = await axios.patch(
        `/api/admin/customers/${customer.id}/suspend`,
        { is_suspended: !customer.is_suspended },
        { headers: authHeaders() },
      )
      setSuccessMessage(data.message || 'ดำเนินการสำเร็จ')
      await loadCustomers()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ')
    }
  }

  const openCustomerDetail = async (customer) => {
    setCustomerDetail({ customer, rentalHistory: null })
    setCustomerDetailError('')
    setCustomerDetailLoading(true)
    try {
      const { data } = await axios.get(`/api/admin/customers/${customer.id}`, { headers: authHeaders() })
      setCustomerDetail({ customer: data.customer, rentalHistory: data.rentalHistory })
    } catch (err) {
      setCustomerDetailError(err.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดลูกค้าได้')
    } finally {
      setCustomerDetailLoading(false)
    }
  }

  /* --------------------------------- Logs ---------------------------------- */
  const [requestLogs, setRequestLogs] = useState({ items: [], total: 0, page: 1, pageSize: 20 })
  const [requestLogsLoading, setRequestLogsLoading] = useState(false)
  const [requestLogsError, setRequestLogsError] = useState('')
  const [requestStatusFilter, setRequestStatusFilter] = useState('all')
  const [requestSearch, setRequestSearch] = useState('')

  const loadRequestLogs = (page = 1, status = requestStatusFilter, search = requestSearch) => {
    setRequestLogsLoading(true)
    return axios
      .get('/api/admin/logs/requests', {
        headers: authHeaders(),
        params: { page, status: status !== 'all' ? status : undefined, search: search || undefined },
      })
      .then(({ data }) => {
        setRequestLogs({ items: data.requests, total: data.total, page: data.page, pageSize: data.pageSize })
        setRequestLogsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRequestLogsError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติคำขอได้')
      })
      .finally(() => setRequestLogsLoading(false))
  }

  const [maintenanceLogs, setMaintenanceLogs] = useState({ items: [], total: 0, page: 1, pageSize: 20 })
  const [maintenanceLogsLoading, setMaintenanceLogsLoading] = useState(false)
  const [maintenanceLogsError, setMaintenanceLogsError] = useState('')
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState('all')
  const [maintenanceSearch, setMaintenanceSearch] = useState('')

  const loadMaintenanceLogs = (page = 1, status = maintenanceStatusFilter, search = maintenanceSearch) => {
    setMaintenanceLogsLoading(true)
    return axios
      .get('/api/admin/logs/maintenance', {
        headers: authHeaders(),
        params: { page, status: status !== 'all' ? status : undefined, search: search || undefined },
      })
      .then(({ data }) => {
        setMaintenanceLogs({ items: data.requests, total: data.total, page: data.page, pageSize: data.pageSize })
        setMaintenanceLogsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setMaintenanceLogsError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติแจ้งซ่อมได้')
      })
      .finally(() => setMaintenanceLogsLoading(false))
  }

  /* -------------------------------- Lifecycle ------------------------------- */
  useEffect(() => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    const storedUser = sessionStorage.getItem('user')
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser)
        if (!['Admin', 'Owner'].includes(parsed?.role)) {
          navigate('/login', { replace: true })
          return
        }
        setAdminUser(parsed)
      } catch {
        setAdminUser(null)
      }
    }
    loadRooms()
    loadStaff()
    loadCustomers('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeTab === 'requests') loadRequestLogs(1, requestStatusFilter, requestSearch)
    if (activeTab === 'maintenance') loadMaintenanceLogs(1, maintenanceStatusFilter, maintenanceSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const summary = useMemo(() => {
    const totalRooms = rooms.length
    const vacantRooms = rooms.filter((room) => !room.is_booked).length
    const activeStaff = staffList.filter((member) => !member.is_suspended).length
    const activeCustomers = customers.filter((customer) => !customer.is_suspended).length
    return { totalRooms, vacantRooms, activeStaff, activeCustomers }
  }, [rooms, staffList, customers])

  const requestLogsTotalPages = Math.max(1, Math.ceil(requestLogs.total / requestLogs.pageSize))
  const maintenanceLogsTotalPages = Math.max(1, Math.ceil(maintenanceLogs.total / maintenanceLogs.pageSize))

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <div className="admin-title-group">
            <div className="admin-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z" />
              </svg>
            </div>
            <div>
              <h1>สวัสดี, {adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'ผู้ดูแลระบบ'}</h1>
              <p>แดชบอร์ดผู้ดูแลระบบ - จัดการห้องพัก พนักงาน ลูกค้า และตรวจสอบกิจกรรม</p>
            </div>
          </div>
          <button type="button" className="admin-logout-btn" onClick={handleLogout}>
            ออกจากระบบ
          </button>
        </div>

        {pageError && (
          <div className="alert alert-danger admin-alert" role="alert">
            {pageError}
            <button type="button" className="btn-close float-end" onClick={() => setPageError('')} aria-label="ปิด" />
          </div>
        )}

        {successMessage && (
          <Modal title="สำเร็จ" onClose={() => setSuccessMessage('')} variant="confirm">
            {(requestClose) => (
              <div className="admin-confirm-body">
                <div className="admin-confirm-icon is-success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="admin-confirm-message">{successMessage}</p>
                <div className="admin-form-actions">
                  <button type="button" className="admin-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        <div className="admin-summary-grid">
          <div className="admin-summary-card">
            <span className="admin-summary-label">ห้องทั้งหมด</span>
            <span className="admin-summary-value">{summary.totalRooms}</span>
          </div>
          <div className="admin-summary-card is-vacant">
            <span className="admin-summary-label">ห้องว่าง</span>
            <span className="admin-summary-value">{summary.vacantRooms}</span>
          </div>
          <div className="admin-summary-card is-staff">
            <span className="admin-summary-label">พนักงานที่ใช้งานอยู่</span>
            <span className="admin-summary-value">{summary.activeStaff}</span>
          </div>
          <div className="admin-summary-card is-customer">
            <span className="admin-summary-label">ลูกค้าที่ใช้งานอยู่</span>
            <span className="admin-summary-value">{summary.activeCustomers}</span>
          </div>
        </div>

        <ul className="nav nav-tabs admin-tabs">
          {TABS.map((tab) => (
            <li className="nav-item" key={tab.key}>
              <button
                type="button"
                className={`nav-link admin-tab-link${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>

        {activeTab === 'rooms' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายการห้องพัก</h2>
              <div className="admin-filters">
                <input
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร..."
                  value={roomSearch}
                  onChange={(event) => setRoomSearch(event.target.value)}
                />
                <button type="button" className="admin-action-btn is-primary" onClick={openCreateRoom}>
                  + เพิ่มห้องพัก
                </button>
              </div>
            </div>

            {roomsError && <div className="alert alert-danger">{roomsError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>เลขห้อง</th>
                    <th>สถานะ</th>
                    <th>ราคา/เดือน</th>
                    <th className="admin-col-optional">สิ่งอำนวยความสะดวก</th>
                    <th>ผู้เช่า</th>
                    <th>การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {roomsLoading ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : filteredRooms.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        ไม่พบข้อมูลห้องพัก
                      </td>
                    </tr>
                  ) : (
                    filteredRooms.map((room) => (
                      <tr key={room.room_number}>
                        <td className="admin-strong-cell">{room.room_number}</td>
                        <td>
                          <span className={`admin-badge status-${room.is_booked ? 'booked' : 'vacant'}`}>
                            {room.is_booked ? 'ไม่ว่าง' : 'ว่าง'}
                          </span>
                        </td>
                        <td>฿{formatCurrency(room.price)}</td>
                        <td className="admin-col-optional admin-amenities-cell">
                          {[
                            room.air_conditioner && 'แอร์',
                            room.wifi && 'ไวไฟ',
                            room.refrigerator && 'ตู้เย็น',
                            room.bathroom && 'ห้องน้ำในตัว',
                            room.cctv && 'CCTV',
                          ]
                            .filter(Boolean)
                            .join(', ') || '-'}
                        </td>
                        <td>{room.customer_id ? `${room.first_name} ${room.last_name}` : '-'}</td>
                        <td>
                          <div className="admin-row-actions">
                            <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditRoom(room)}>
                              แก้ไข
                            </button>
                            <button type="button" className="admin-action-btn is-danger" onClick={() => setRoomDeleteConfirm(room)}>
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายการพนักงาน</h2>
              <div className="admin-filters">
                <input
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาชื่อ, เบอร์โทร, บัตร ปชช..."
                  value={staffSearch}
                  onChange={(event) => setStaffSearch(event.target.value)}
                />
                <button type="button" className="admin-action-btn is-primary" onClick={openCreateStaff}>
                  + เพิ่มพนักงาน
                </button>
              </div>
            </div>

            {staffError && <div className="alert alert-danger">{staffError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>ชื่อ-นามสกุล</th>
                    <th className="admin-col-optional">บัตรประชาชน</th>
                    <th>เบอร์โทร</th>
                    <th className="admin-col-optional">อายุ</th>
                    <th>สถานะ</th>
                    <th>การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {staffLoading ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        ไม่พบข้อมูลพนักงาน
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((member) => (
                      <tr key={member.id}>
                        <td className="admin-strong-cell">
                          {member.first_name} {member.last_name}
                        </td>
                        <td className="admin-col-optional">{member.idcard}</td>
                        <td>{member.phone}</td>
                        <td className="admin-col-optional">{member.age}</td>
                        <td>
                          <span className={`admin-badge status-${member.is_suspended ? 'suspended' : 'active'}`}>
                            {member.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                          </span>
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditStaff(member)}>
                              แก้ไข
                            </button>
                            <button type="button" className="admin-action-btn is-ghost" onClick={() => toggleStaffSuspend(member)}>
                              {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                            </button>
                            <button type="button" className="admin-action-btn is-danger" onClick={() => setStaffDeleteConfirm(member)}>
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายการลูกค้า</h2>
              <div className="admin-filters">
                <input
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาชื่อ, เบอร์โทร, เลขห้อง, บัตร ปชช..."
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') loadCustomers(customerSearch)
                  }}
                />
                <button type="button" className="admin-action-btn is-primary" onClick={() => loadCustomers(customerSearch)}>
                  ค้นหา
                </button>
              </div>
            </div>

            {customersError && <div className="alert alert-danger">{customersError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>ชื่อ-นามสกุล</th>
                    <th>ห้อง</th>
                    <th className="admin-col-optional">เบอร์โทร</th>
                    <th className="admin-col-optional">ระยะเวลาสัญญา</th>
                    <th>สถานะ</th>
                    <th>การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {customersLoading ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        ไม่พบข้อมูลลูกค้า
                      </td>
                    </tr>
                  ) : (
                    customers.map((customer) => (
                      <tr key={customer.id}>
                        <td className="admin-strong-cell">
                          {customer.first_name} {customer.last_name}
                        </td>
                        <td>{customer.room_number ?? '-'}</td>
                        <td className="admin-col-optional">{customer.phone}</td>
                        <td className="admin-col-optional">
                          {customer.rental_start_date && customer.rental_end_date
                            ? `${formatDate(customer.rental_start_date)} - ${formatDate(customer.rental_end_date)}`
                            : '-'}
                        </td>
                        <td>
                          <span className={`admin-badge status-${customer.is_suspended ? 'suspended' : 'active'}`}>
                            {customer.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                          </span>
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <button type="button" className="admin-action-btn is-ghost" onClick={() => openCustomerDetail(customer)}>
                              ดูรายละเอียด
                            </button>
                            <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditCustomer(customer)}>
                              แก้ไข
                            </button>
                            <button type="button" className="admin-action-btn is-ghost" onClick={() => toggleCustomerSuspend(customer)}>
                              {customer.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>ประวัติคำขอผู้เช่า</h2>
              <div className="admin-filters">
                <input
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อ, ผู้อนุมัติ..."
                  value={requestSearch}
                  onChange={(event) => setRequestSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') loadRequestLogs(1, requestStatusFilter, requestSearch)
                  }}
                />
                <select
                  className="form-select admin-filter-select"
                  value={requestStatusFilter}
                  onChange={(event) => {
                    setRequestStatusFilter(event.target.value)
                    loadRequestLogs(1, event.target.value, requestSearch)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="in_progress">รับเรื่องแล้ว</option>
                  <option value="approved">อนุมัติแล้ว</option>
                  <option value="rejected">ปฏิเสธแล้ว</option>
                </select>
                <button type="button" className="admin-action-btn is-primary" onClick={() => loadRequestLogs(1, requestStatusFilter, requestSearch)}>
                  ค้นหา
                </button>
              </div>
            </div>

            {requestLogsError && <div className="alert alert-danger">{requestLogsError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>ประเภท</th>
                    <th>ห้อง</th>
                    <th>ผู้เช่า</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">รับเรื่องโดย</th>
                    <th className="admin-col-optional">เสร็จสิ้นโดย</th>
                    <th className="admin-col-optional">วันที่ส่งคำขอ</th>
                  </tr>
                </thead>
                <tbody>
                  {requestLogsLoading ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : requestLogs.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        ไม่พบประวัติคำขอ
                      </td>
                    </tr>
                  ) : (
                    requestLogs.items.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <span className={`admin-badge type-${request.type}`}>{REQUEST_TYPE_LABEL[request.type] || request.type}</span>
                        </td>
                        <td>{request.room_number}</td>
                        <td>
                          {request.first_name} {request.last_name}
                        </td>
                        <td>
                          <span className={`admin-badge status-${request.status}`}>{REQUEST_STATUS_LABEL[request.status] || request.status}</span>
                        </td>
                        <td className="admin-col-optional">
                          {request.accepted_by_name ? `${request.accepted_by_name} (${formatDateTime(request.accepted_at)})` : '-'}
                        </td>
                        <td className="admin-col-optional">
                          {request.completed_by_name ? `${request.completed_by_name} (${formatDateTime(request.completed_at)})` : '-'}
                        </td>
                        <td className="admin-col-optional">{formatDateTime(request.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={requestLogs.page} totalPages={requestLogsTotalPages} onChange={(page) => loadRequestLogs(page, requestStatusFilter, requestSearch)} />
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>ประวัติแจ้งซ่อม</h2>
              <div className="admin-filters">
                <input
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อ, ผู้ดำเนินการ..."
                  value={maintenanceSearch}
                  onChange={(event) => setMaintenanceSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') loadMaintenanceLogs(1, maintenanceStatusFilter, maintenanceSearch)
                  }}
                />
                <select
                  className="form-select admin-filter-select"
                  value={maintenanceStatusFilter}
                  onChange={(event) => {
                    setMaintenanceStatusFilter(event.target.value)
                    loadMaintenanceLogs(1, event.target.value, maintenanceSearch)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="in_progress">กำลังดำเนินการ</option>
                  <option value="done">เสร็จสิ้น</option>
                  <option value="cancelled">ยกเลิกแล้ว</option>
                </select>
                <button
                  type="button"
                  className="admin-action-btn is-primary"
                  onClick={() => loadMaintenanceLogs(1, maintenanceStatusFilter, maintenanceSearch)}
                >
                  ค้นหา
                </button>
              </div>
            </div>

            {maintenanceLogsError && <div className="alert alert-danger">{maintenanceLogsError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>รายละเอียด</th>
                    <th className="admin-col-optional">หมวดหมู่</th>
                    <th>ห้อง</th>
                    <th>ผู้แจ้ง</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">รับเรื่องโดย</th>
                    <th className="admin-col-optional">เสร็จสิ้นโดย</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceLogsLoading ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : maintenanceLogs.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        ไม่พบประวัติแจ้งซ่อม
                      </td>
                    </tr>
                  ) : (
                    maintenanceLogs.items.map((request) => (
                      <tr key={request.id}>
                        <td>{request.description}</td>
                        <td className="admin-col-optional">{MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ'}</td>
                        <td>{request.room_number}</td>
                        <td>
                          {request.first_name} {request.last_name}
                        </td>
                        <td>
                          <span className={`admin-badge status-${request.status}`}>
                            {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
                          </span>
                        </td>
                        <td className="admin-col-optional">
                          {request.accepted_by_name ? `${request.accepted_by_name} (${formatDateTime(request.accepted_at)})` : '-'}
                        </td>
                        <td className="admin-col-optional">
                          {request.completed_by_name ? `${request.completed_by_name} (${formatDateTime(request.completed_at)})` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={maintenanceLogs.page}
              totalPages={maintenanceLogsTotalPages}
              onChange={(page) => loadMaintenanceLogs(page, maintenanceStatusFilter, maintenanceSearch)}
            />
          </div>
        )}
      </div>

      {roomModal && (
        <Modal title={roomModal.mode === 'create' ? 'เพิ่มห้องพัก' : `แก้ไขห้อง ${roomModal.room.room_number}`} onClose={() => setRoomModal(null)}>
          <form onSubmit={submitRoomForm} noValidate>
            {roomFormError && <div className="alert alert-danger py-2 px-3">{roomFormError}</div>}
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label">เลขห้อง</label>
                <input
                  type="number"
                  name="room_number"
                  className="form-control"
                  value={roomForm.room_number}
                  onChange={handleRoomFormChange}
                  disabled={roomModal.mode === 'edit'}
                  required
                />
              </div>
              <div className="col-6">
                <label className="form-label">ราคา/เดือน (บาท)</label>
                <input type="number" name="price" className="form-control" value={roomForm.price} onChange={handleRoomFormChange} required />
              </div>
              <div className="col-4">
                <label className="form-label">จำนวนเตียง</label>
                <input type="number" name="bed" className="form-control" value={roomForm.bed} onChange={handleRoomFormChange} />
              </div>
              <div className="col-4">
                <label className="form-label">ค่าไฟ/หน่วย</label>
                <input
                  type="number"
                  step="0.01"
                  name="electricity_unit_price"
                  className="form-control"
                  value={roomForm.electricity_unit_price}
                  onChange={handleRoomFormChange}
                />
              </div>
              <div className="col-4">
                <label className="form-label">ค่าน้ำ/เดือน</label>
                <input type="number" step="0.01" name="water_price" className="form-control" value={roomForm.water_price} onChange={handleRoomFormChange} />
              </div>
              <div className="col-12">
                <label className="form-label">สิ่งอำนวยความสะดวก</label>
                <div className="admin-checkbox-grid">
                  {[
                    ['air_conditioner', 'เครื่องปรับอากาศ'],
                    ['wifi', 'ไวไฟ'],
                    ['refrigerator', 'ตู้เย็น'],
                    ['bathroom', 'ห้องน้ำในตัว'],
                    ['cctv', 'กล้องวงจรปิด'],
                  ].map(([field, label]) => (
                    <label className="admin-checkbox" key={field}>
                      <input type="checkbox" name={field} checked={roomForm[field]} onChange={handleRoomFormChange} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-action-btn is-primary" disabled={roomSubmitting}>
                {roomSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {roomDeleteConfirm && (
        <Modal title="ยืนยันการลบห้องพัก" onClose={() => setRoomDeleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="admin-confirm-body">
              <p className="admin-confirm-message">ต้องการลบห้อง {roomDeleteConfirm.room_number} ใช่หรือไม่?</p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="admin-action-btn is-danger" onClick={confirmDeleteRoom}>
                  ลบห้องพัก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {staffModal && (
        <Modal title={staffModal.mode === 'create' ? 'เพิ่มพนักงาน' : 'แก้ไขข้อมูลพนักงาน'} onClose={() => setStaffModal(null)}>
          <form onSubmit={submitStaffForm} noValidate>
            {staffFormError && <div className="alert alert-danger py-2 px-3">{staffFormError}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label">เลขบัตรประชาชน</label>
                <input
                  type="text"
                  name="idcard"
                  className="form-control"
                  value={staffForm.idcard}
                  onChange={handleStaffFormChange}
                  disabled={staffModal.mode === 'edit'}
                  maxLength={13}
                  required
                />
              </div>
              <div className="col-12">
                <label className="form-label">{staffModal.mode === 'create' ? 'รหัสผ่าน' : 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)'}</label>
                <input
                  type="password"
                  name="password"
                  className="form-control"
                  value={staffForm.password}
                  onChange={handleStaffFormChange}
                  required={staffModal.mode === 'create'}
                />
              </div>
              <div className="col-6">
                <label className="form-label">ชื่อ</label>
                <input type="text" name="first_name" className="form-control" value={staffForm.first_name} onChange={handleStaffFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">นามสกุล</label>
                <input type="text" name="last_name" className="form-control" value={staffForm.last_name} onChange={handleStaffFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">เบอร์โทรศัพท์</label>
                <input type="text" name="phone" className="form-control" value={staffForm.phone} onChange={handleStaffFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">อายุ</label>
                <input type="number" name="age" className="form-control" value={staffForm.age} onChange={handleStaffFormChange} required />
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-action-btn is-primary" disabled={staffSubmitting}>
                {staffSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {staffDeleteConfirm && (
        <Modal title="ยืนยันการลบพนักงาน" onClose={() => setStaffDeleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="admin-confirm-body">
              <p className="admin-confirm-message">
                ต้องการลบพนักงาน {staffDeleteConfirm.first_name} {staffDeleteConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="admin-action-btn is-danger" onClick={confirmDeleteStaff}>
                  ลบพนักงาน
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {customerModal && (
        <Modal title={`แก้ไขข้อมูลลูกค้า - ${customerModal.first_name} ${customerModal.last_name}`} onClose={() => setCustomerModal(null)}>
          <form onSubmit={submitCustomerForm} noValidate>
            {customerFormError && <div className="alert alert-danger py-2 px-3">{customerFormError}</div>}
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label">ชื่อ</label>
                <input type="text" name="first_name" className="form-control" value={customerForm.first_name} onChange={handleCustomerFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">นามสกุล</label>
                <input type="text" name="last_name" className="form-control" value={customerForm.last_name} onChange={handleCustomerFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">เบอร์โทรศัพท์</label>
                <input type="text" name="phone" className="form-control" value={customerForm.phone} onChange={handleCustomerFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">อายุ</label>
                <input type="number" name="age" className="form-control" value={customerForm.age} onChange={handleCustomerFormChange} required />
              </div>
              <div className="col-12">
                <label className="form-label">เงินมัดจำ (บาท)</label>
                <input type="number" name="deposit_amount" className="form-control" value={customerForm.deposit_amount} onChange={handleCustomerFormChange} />
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-action-btn is-primary" disabled={customerSubmitting}>
                {customerSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {customerDetail && (
        <Modal
          title={`ประวัติการเช่า - ${customerDetail.customer.first_name} ${customerDetail.customer.last_name}`}
          onClose={() => setCustomerDetail(null)}
        >
          {customerDetailLoading ? (
            <p className="text-muted">กำลังโหลดข้อมูล...</p>
          ) : customerDetailError ? (
            <div className="alert alert-danger">{customerDetailError}</div>
          ) : (
            <div className="admin-detail-list">
              {customerDetail.rentalHistory && customerDetail.rentalHistory.length > 0 ? (
                customerDetail.rentalHistory.map((booking) => (
                  <div className="admin-detail-block" key={booking.booking_id}>
                    <p className="admin-detail-block-title">สัญญาเช่าเมื่อ {formatDateTime(booking.created_at)}</p>
                    {booking.payments.length === 0 ? (
                      <p className="admin-empty">ยังไม่มีประวัติการชำระเงิน</p>
                    ) : (
                      <table className="table admin-table admin-detail-table">
                        <thead>
                          <tr>
                            <th>วันที่ชำระ</th>
                            <th>จำนวนเงิน</th>
                            <th>ประเภท</th>
                            <th>สถานะ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {booking.payments.map((payment) => (
                            <tr key={payment.id}>
                              <td>{formatDate(payment.payment_date)}</td>
                              <td>฿{formatCurrency(payment.amount)}</td>
                              <td>{payment.type}</td>
                              <td>{payment.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))
              ) : (
                <p className="admin-empty">ยังไม่มีประวัติการเช่า</p>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default AdminBackupPage
