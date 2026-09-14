import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
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

const ROWS_PER_PAGE = 10
const DETAIL_ROWS_PER_PAGE = 5

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
const PAYMENT_STATUS_LABEL = { paid: 'ชำระแล้ว', pending: 'รอชำระ' }
const PAYMENT_TYPE_LABEL = { rent: 'ค่าเช่า', deposit: 'เงินมัดจำ' }

const MAINTENANCE_CATEGORY_ICON = {
  electrical: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  plumbing: <path d="M12 2S5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-13-7-13Z" />,
  aircon: <path d="M12 3v18M5.6 6.5 18.4 17.5M18.4 6.5 5.6 17.5" />,
  furniture: (
    <g>
      <path d="M4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3Z" />
      <path d="M5 17v2M19 17v2" />
    </g>
  ),
  other: (
    <path d="M14.5 3.5a4 4 0 0 0-5 5L4 14l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2-2 2.5-2.5Z" />
  ),
}

function MaintenanceCategoryBadge({ category }) {
  const key = MAINTENANCE_CATEGORY_LABEL[category] ? category : 'other'
  return (
    <span className={`admin-badge category-${key}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {MAINTENANCE_CATEGORY_ICON[key]}
      </svg>
      {MAINTENANCE_CATEGORY_LABEL[key]}
    </span>
  )
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

function useExpandedRows() {
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const reset = () => setExpanded(new Set())
  return [expanded, toggle, reset]
}

function DetailRow({ open, colSpan, fields }) {
  if (!open) return null
  return (
    <tr className="admin-detail-row">
      <td colSpan={colSpan}>
        <div className="admin-detail-grid">
          {fields.map(({ label, value }) => (
            <div className="admin-detail-item" key={label}>
              <span className="admin-detail-item-label">{label}</span>
              <span className="admin-detail-item-value">{value}</span>
            </div>
          ))}
        </div>
      </td>
    </tr>
  )
}

function ExpandToggleButton({ open, onClick }) {
  return (
    <button type="button" className="admin-expand-btn" onClick={onClick} aria-expanded={open}>
      {open ? 'ย่อ' : 'ดูเพิ่มเติม'}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transform: open ? 'rotate(180deg)' : 'none' }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )
}

function ExpandToggleRow({ open, colSpan, onClick }) {
  return (
    <tr className="admin-toggle-row">
      <td colSpan={colSpan}>
        <ExpandToggleButton open={open} onClick={onClick} />
      </td>
    </tr>
  )
}

function StaffActionCell({ name, date }) {
  if (!name) return <span className="admin-cell-empty">-</span>
  return (
    <div className="admin-staff-action">
      <span className="admin-staff-action-name">{name}</span>
      <span className="admin-staff-action-date">{formatDateTime(date)}</span>
    </div>
  )
}

function AmenitiesList({ room }) {
  const amenities = [
    room.air_conditioner && 'แอร์',
    room.wifi && 'ไวไฟ',
    room.refrigerator && 'ตู้เย็น',
    room.bathroom && 'ห้องน้ำในตัว',
    room.cctv && 'CCTV',
  ].filter(Boolean)
  if (amenities.length === 0) return '-'
  return (
    <div className="admin-amenities-list">
      {amenities.map((amenity, index) => (
        <span key={amenity} className="admin-amenity-item">
          {index > 0 && <span className="admin-amenity-divider" aria-hidden="true" />}
          {amenity}
        </span>
      ))}
    </div>
  )
}

function RentalPeriodCell({ start, end }) {
  if (!start || !end) return <span className="admin-cell-empty">-</span>
  return (
    <div className="admin-rental-period">
      <span className="admin-rental-date">{formatDate(start)}</span>
      <svg className="admin-rental-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="4" y1="12" x2="20" y2="12" />
        <polyline points="14 6 20 12 14 18" />
      </svg>
      <span className="admin-rental-date">{formatDate(end)}</span>
    </div>
  )
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

  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [roomsPage, setRoomsPage] = useState(1)
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

  const submitRoomForm = async (event, requestClose) => {
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
      requestClose()
      await loadRooms()
    } catch (err) {
      setRoomFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setRoomSubmitting(false)
    }
  }

  const confirmDeleteRoom = async (requestClose) => {
    if (!roomDeleteConfirm) return
    try {
      const { data } = await axios.delete(`/api/admin/rooms/${roomDeleteConfirm.room_number}`, { headers: authHeaders() })
      setSuccessMessage(data.message || 'ลบห้องพักสำเร็จ')
      requestClose()
      await loadRooms()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ลบห้องพักไม่สำเร็จ')
      requestClose()
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

  const roomsTotalPages = Math.max(1, Math.ceil(filteredRooms.length / ROWS_PER_PAGE))
  const currentRoomsPage = Math.min(roomsPage, roomsTotalPages)
  const paginatedRooms = useMemo(() => {
    const start = (currentRoomsPage - 1) * ROWS_PER_PAGE
    return filteredRooms.slice(start, start + ROWS_PER_PAGE)
  }, [filteredRooms, currentRoomsPage])

  const [expandedRoomRows, toggleRoomRow, resetRoomRows] = useExpandedRows()
  useEffect(() => {
    resetRoomRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoomsPage, activeTab])

  /* -------------------------------- Staff --------------------------------- */
  const [staffList, setStaffList] = useState([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [staffError, setStaffError] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [staffPage, setStaffPage] = useState(1)
  const [staffModal, setStaffModal] = useState(null)
  const [staffForm, setStaffForm] = useState(emptyStaffForm)
  const [staffSubmitting, setStaffSubmitting] = useState(false)
  const [staffFormError, setStaffFormError] = useState('')
  const [staffDeleteConfirm, setStaffDeleteConfirm] = useState(null)
  const [staffSuspendConfirm, setStaffSuspendConfirm] = useState(null)
  const [revealedStaffIdCards, setRevealedStaffIdCards] = useState(() => new Set())

  const toggleStaffIdCardReveal = (id) => {
    setRevealedStaffIdCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const submitStaffForm = async (event, requestClose) => {
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
      requestClose()
      await loadStaff()
    } catch (err) {
      setStaffFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setStaffSubmitting(false)
    }
  }

  const toggleStaffSuspend = async (member, requestClose) => {
    try {
      const { data } = await axios.patch(
        `/api/admin/staff/${member.id}/suspend`,
        { is_suspended: !member.is_suspended },
        { headers: authHeaders() },
      )
      setSuccessMessage(data.message || 'ดำเนินการสำเร็จ')
      requestClose()
      await loadStaff()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ')
      requestClose()
    }
  }

  const confirmDeleteStaff = async (requestClose) => {
    if (!staffDeleteConfirm) return
    try {
      const { data } = await axios.delete(`/api/admin/staff/${staffDeleteConfirm.id}`, { headers: authHeaders() })
      setSuccessMessage(data.message || 'ลบพนักงานสำเร็จ')
      requestClose()
      await loadStaff()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ลบพนักงานไม่สำเร็จ')
      requestClose()
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

  const staffTotalPages = Math.max(1, Math.ceil(filteredStaff.length / ROWS_PER_PAGE))
  const currentStaffPage = Math.min(staffPage, staffTotalPages)
  const paginatedStaff = useMemo(() => {
    const start = (currentStaffPage - 1) * ROWS_PER_PAGE
    return filteredStaff.slice(start, start + ROWS_PER_PAGE)
  }, [filteredStaff, currentStaffPage])

  useEffect(() => {
    setRevealedStaffIdCards(new Set())
  }, [currentStaffPage, activeTab])

  const [expandedStaffRows, toggleStaffRow, resetStaffRows] = useExpandedRows()
  useEffect(() => {
    resetStaffRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStaffPage, activeTab])

  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [customersError, setCustomersError] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all')
  const [customersPage, setCustomersPage] = useState(1)
  const [customerModal, setCustomerModal] = useState(null)
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm)
  const [customerSubmitting, setCustomerSubmitting] = useState(false)
  const [customerFormError, setCustomerFormError] = useState('')
  const [customerDetail, setCustomerDetail] = useState(null)
  const [customerSuspendConfirm, setCustomerSuspendConfirm] = useState(null)
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false)
  const [customerDetailError, setCustomerDetailError] = useState('')
  const [rentalPaymentsPage, setRentalPaymentsPage] = useState({})

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

  const isCustomerSearchMount = useRef(true)
  useEffect(() => {
    if (isCustomerSearchMount.current) {
      isCustomerSearchMount.current = false
      return
    }
    const timeout = setTimeout(() => loadCustomers(customerSearch), 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSearch])

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

  const submitCustomerForm = async (event, requestClose) => {
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
      requestClose()
      await loadCustomers()
    } catch (err) {
      setCustomerFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setCustomerSubmitting(false)
    }
  }

  const toggleCustomerSuspend = async (customer, requestClose) => {
    try {
      const { data } = await axios.patch(
        `/api/admin/customers/${customer.id}/suspend`,
        { is_suspended: !customer.is_suspended },
        { headers: authHeaders() },
      )
      setSuccessMessage(data.message || 'ดำเนินการสำเร็จ')
      requestClose()
      await loadCustomers()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ')
      requestClose()
    }
  }

  const openCustomerDetail = async (customer) => {
    setCustomerDetail({ customer, rentalHistory: null })
    setCustomerDetailError('')
    setCustomerDetailLoading(true)
    setRentalPaymentsPage({})
    try {
      const { data } = await axios.get(`/api/admin/customers/${customer.id}`, { headers: authHeaders() })
      setCustomerDetail({ customer: data.customer, rentalHistory: data.rentalHistory })
    } catch (err) {
      setCustomerDetailError(err.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดลูกค้าได้')
    } finally {
      setCustomerDetailLoading(false)
    }
  }

  const filteredCustomers = useMemo(() => {
    if (customerStatusFilter === 'all') return customers
    const wantSuspended = customerStatusFilter === 'suspended'
    return customers.filter((customer) => Boolean(customer.is_suspended) === wantSuspended)
  }, [customers, customerStatusFilter])

  const customersTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / ROWS_PER_PAGE))
  const currentCustomersPage = Math.min(customersPage, customersTotalPages)
  const paginatedCustomers = useMemo(() => {
    const start = (currentCustomersPage - 1) * ROWS_PER_PAGE
    return filteredCustomers.slice(start, start + ROWS_PER_PAGE)
  }, [filteredCustomers, currentCustomersPage])

  const [expandedCustomerRows, toggleCustomerRow, resetCustomerRows] = useExpandedRows()
  useEffect(() => {
    resetCustomerRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCustomersPage, activeTab])

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

  const isRequestSearchMount = useRef(true)
  useEffect(() => {
    if (isRequestSearchMount.current) {
      isRequestSearchMount.current = false
      return
    }
    if (activeTab !== 'requests') return
    const timeout = setTimeout(() => loadRequestLogs(1, requestStatusFilter, requestSearch), 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSearch])

  const isMaintenanceSearchMount = useRef(true)
  useEffect(() => {
    if (isMaintenanceSearchMount.current) {
      isMaintenanceSearchMount.current = false
      return
    }
    if (activeTab !== 'maintenance') return
    const timeout = setTimeout(() => loadMaintenanceLogs(1, maintenanceStatusFilter, maintenanceSearch), 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenanceSearch])

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

  const [expandedRequestRows, toggleRequestRow, resetRequestRows] = useExpandedRows()
  useEffect(() => {
    resetRequestRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestLogs.page, activeTab])

  const [expandedMaintenanceRows, toggleMaintenanceRow, resetMaintenanceRows] = useExpandedRows()
  useEffect(() => {
    resetMaintenanceRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenanceLogs.page, activeTab])

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
            <div className="admin-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
              </svg>
            </div>
            <div className="admin-summary-text">
              <span className="admin-summary-label">ห้องทั้งหมด</span>
              <span className="admin-summary-value">{summary.totalRooms}</span>
            </div>
          </div>
          <div className="admin-summary-card is-vacant">
            <div className="admin-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="8 12.5 11 15.5 16 9.5" />
              </svg>
            </div>
            <div className="admin-summary-text">
              <span className="admin-summary-label">ห้องว่าง</span>
              <span className="admin-summary-value">{summary.vacantRooms}</span>
            </div>
          </div>
          <div className="admin-summary-card is-staff">
            <div className="admin-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="3.3" />
                <path d="M5.5 20c0-3.9 2.9-7 6.5-7s6.5 3.1 6.5 7" />
              </svg>
            </div>
            <div className="admin-summary-text">
              <span className="admin-summary-label">พนักงานที่ใช้งานอยู่</span>
              <span className="admin-summary-value">{summary.activeStaff}</span>
            </div>
          </div>
          <div className="admin-summary-card is-customer">
            <div className="admin-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="8.5" r="3" />
                <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" />
                <path d="M15 4.3a3 3 0 0 1 0 5.7" />
                <path d="M16.5 14c2 .4 3.5 2.7 3.5 6" />
              </svg>
            </div>
            <div className="admin-summary-text">
              <span className="admin-summary-label">ลูกค้าที่ใช้งานอยู่</span>
              <span className="admin-summary-value">{summary.activeCustomers}</span>
            </div>
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
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="room-search">
                  ค้นหา
                </label>
                <input
                  id="room-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร..."
                  value={roomSearch}
                  onChange={(event) => {
                    setRoomSearch(event.target.value)
                    setRoomsPage(1)
                  }}
                />
              </div>
              <div className="admin-filters">
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
                    <th className="admin-col-optional">การดำเนินการ</th>
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
                    paginatedRooms.map((room) => (
                      <Fragment key={room.id}>
                        <tr>
                          <td className="admin-strong-cell">{room.room_number}</td>
                          <td>
                            <span className={`admin-badge status-${room.is_booked ? 'booked' : 'vacant'}`}>
                              {room.is_booked ? 'ไม่ว่าง' : 'ว่าง'}
                            </span>
                          </td>
                          <td className="admin-price-cell">฿{formatCurrency(room.price)}</td>
                          <td className="admin-col-optional admin-amenities-cell">
                            <AmenitiesList room={room} />
                          </td>
                          <td>{room.customer_id ? `${room.first_name} ${room.last_name}` : '-'}</td>
                          <td className="admin-col-optional">
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
                        <ExpandToggleRow
                          open={expandedRoomRows.has(room.room_number)}
                          colSpan={6}
                          onClick={() => toggleRoomRow(room.room_number)}
                        />
                        <DetailRow
                          open={expandedRoomRows.has(room.room_number)}
                          colSpan={6}
                          fields={[
                            { label: 'สิ่งอำนวยความสะดวก', value: <AmenitiesList room={room} /> },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditRoom(room)}>
                                    แก้ไข
                                  </button>
                                  <button type="button" className="admin-action-btn is-danger" onClick={() => setRoomDeleteConfirm(room)}>
                                    ลบ
                                  </button>
                                </div>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={currentRoomsPage} totalPages={roomsTotalPages} onChange={setRoomsPage} />
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายการพนักงาน</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="staff-search">
                  ค้นหา
                </label>
                <input
                  id="staff-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาชื่อ, เบอร์โทร, บัตร ปชช..."
                  value={staffSearch}
                  onChange={(event) => {
                    setStaffSearch(event.target.value)
                    setStaffPage(1)
                  }}
                />
              </div>
              <div className="admin-filters">
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
                    <th className="admin-col-optional">การดำเนินการ</th>
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
                    paginatedStaff.map((member) => (
                      <Fragment key={member.id}>
                        <tr>
                          <td className="admin-strong-cell">
                            {member.first_name} {member.last_name}
                          </td>
                          <td className="admin-col-optional">
                            <button
                              type="button"
                              className="admin-idcard-toggle"
                              onClick={() => toggleStaffIdCardReveal(member.id)}
                            >
                              {revealedStaffIdCards.has(member.id) ? member.idcard : '•'.repeat(String(member.idcard || '').length || 13)}
                            </button>
                          </td>
                          <td>{member.phone}</td>
                          <td className="admin-col-optional">{member.age}</td>
                          <td>
                            <span className={`admin-badge status-${member.is_suspended ? 'suspended' : 'active'}`}>
                              {member.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                            </span>
                          </td>
                          <td className="admin-col-optional">
                            <div className="admin-row-actions">
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditStaff(member)}>
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                className={`admin-action-btn ${member.is_suspended ? 'is-success' : 'is-warning'}`}
                                onClick={() => setStaffSuspendConfirm(member)}
                              >
                                {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                              </button>
                              <button type="button" className="admin-action-btn is-danger" onClick={() => setStaffDeleteConfirm(member)}>
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                        <ExpandToggleRow open={expandedStaffRows.has(member.id)} colSpan={6} onClick={() => toggleStaffRow(member.id)} />
                        <DetailRow
                          open={expandedStaffRows.has(member.id)}
                          colSpan={6}
                          fields={[
                            {
                              label: 'บัตรประชาชน',
                              value: (
                                <button type="button" className="admin-idcard-toggle" onClick={() => toggleStaffIdCardReveal(member.id)}>
                                  {revealedStaffIdCards.has(member.id) ? member.idcard : '•'.repeat(String(member.idcard || '').length || 13)}
                                </button>
                              ),
                            },
                            { label: 'อายุ', value: member.age },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditStaff(member)}>
                                    แก้ไข
                                  </button>
                                  <button
                                    type="button"
                                    className={`admin-action-btn ${member.is_suspended ? 'is-success' : 'is-warning'}`}
                                    onClick={() => setStaffSuspendConfirm(member)}
                                  >
                                    {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                                  </button>
                                  <button type="button" className="admin-action-btn is-danger" onClick={() => setStaffDeleteConfirm(member)}>
                                    ลบ
                                  </button>
                                </div>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={currentStaffPage} totalPages={staffTotalPages} onChange={setStaffPage} />
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายการลูกค้า</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="customer-search">
                  ค้นหา
                </label>
                <input
                  id="customer-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาชื่อ, เบอร์โทร, เลขห้อง, บัตร ปชช..."
                  value={customerSearch}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value)
                    setCustomersPage(1)
                  }}
                />
              </div>
              <div className="admin-filter-group">
                <label className="admin-toolbar-label" htmlFor="customer-status-filter">
                  สถานะ
                </label>
                <select
                  id="customer-status-filter"
                  className="form-select admin-filter-select"
                  value={customerStatusFilter}
                  onChange={(event) => {
                    setCustomerStatusFilter(event.target.value)
                    setCustomersPage(1)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="active">ใช้งานปกติ</option>
                  <option value="suspended">ระงับการใช้งาน</option>
                </select>
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
                    <th className="admin-col-optional">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {customersLoading ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        ไม่พบข้อมูลลูกค้า
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map((customer) => (
                      <Fragment key={customer.id}>
                        <tr>
                          <td className="admin-strong-cell">
                            {customer.first_name} {customer.last_name}
                          </td>
                          <td>{customer.room_number ?? '-'}</td>
                          <td className="admin-col-optional">{customer.phone}</td>
                          <td className="admin-col-optional">
                            <RentalPeriodCell start={customer.rental_start_date} end={customer.rental_end_date} />
                          </td>
                          <td>
                            <span className={`admin-badge status-${customer.is_suspended ? 'suspended' : 'active'}`}>
                              {customer.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                            </span>
                          </td>
                          <td className="admin-col-optional">
                            <div className="admin-row-actions">
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openCustomerDetail(customer)}>
                                ดูรายละเอียด
                              </button>
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditCustomer(customer)}>
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                className={`admin-action-btn ${customer.is_suspended ? 'is-success' : 'is-warning'}`}
                                onClick={() => setCustomerSuspendConfirm(customer)}
                              >
                                {customer.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        <ExpandToggleRow
                          open={expandedCustomerRows.has(customer.id)}
                          colSpan={6}
                          onClick={() => toggleCustomerRow(customer.id)}
                        />
                        <DetailRow
                          open={expandedCustomerRows.has(customer.id)}
                          colSpan={6}
                          fields={[
                            { label: 'เบอร์โทร', value: customer.phone },
                            {
                              label: 'ระยะเวลาสัญญา',
                              value: <RentalPeriodCell start={customer.rental_start_date} end={customer.rental_end_date} />,
                            },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openCustomerDetail(customer)}>
                                    ดูรายละเอียด
                                  </button>
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditCustomer(customer)}>
                                    แก้ไข
                                  </button>
                                  <button
                                    type="button"
                                    className={`admin-action-btn ${customer.is_suspended ? 'is-success' : 'is-warning'}`}
                                    onClick={() => setCustomerSuspendConfirm(customer)}
                                  >
                                    {customer.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                                  </button>
                                </div>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={currentCustomersPage} totalPages={customersTotalPages} onChange={setCustomersPage} />
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>ประวัติคำขอผู้เช่า</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="request-search">
                  ค้นหา
                </label>
                <input
                  id="request-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อ, ผู้อนุมัติ..."
                  value={requestSearch}
                  onChange={(event) => setRequestSearch(event.target.value)}
                />
              </div>
              <div className="admin-filter-group">
                <label className="admin-toolbar-label" htmlFor="request-status-filter">
                  สถานะ
                </label>
                <select
                  id="request-status-filter"
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
                      <Fragment key={request.id}>
                        <tr>
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
                            <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} />
                          </td>
                          <td className="admin-col-optional">
                            <StaffActionCell name={request.completed_by_name} date={request.completed_at} />
                          </td>
                          <td className="admin-col-optional">{formatDateTime(request.created_at)}</td>
                        </tr>
                        <ExpandToggleRow open={expandedRequestRows.has(request.id)} colSpan={7} onClick={() => toggleRequestRow(request.id)} />
                        <DetailRow
                          open={expandedRequestRows.has(request.id)}
                          colSpan={7}
                          fields={[
                            { label: 'รับเรื่องโดย', value: <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} /> },
                            { label: 'เสร็จสิ้นโดย', value: <StaffActionCell name={request.completed_by_name} date={request.completed_at} /> },
                            { label: 'วันที่ส่งคำขอ', value: formatDateTime(request.created_at) },
                          ]}
                        />
                      </Fragment>
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
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="maintenance-search">
                  ค้นหา
                </label>
                <input
                  id="maintenance-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อ, ผู้ดำเนินการ..."
                  value={maintenanceSearch}
                  onChange={(event) => setMaintenanceSearch(event.target.value)}
                />
              </div>
              <div className="admin-filter-group">
                <label className="admin-toolbar-label" htmlFor="maintenance-status-filter">
                  สถานะ
                </label>
                <select
                  id="maintenance-status-filter"
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
                      <Fragment key={request.id}>
                        <tr>
                          <td>{request.description}</td>
                          <td className="admin-col-optional">
                            <MaintenanceCategoryBadge category={request.category} />
                          </td>
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
                            <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} />
                          </td>
                          <td className="admin-col-optional">
                            <StaffActionCell name={request.completed_by_name} date={request.completed_at} />
                          </td>
                        </tr>
                        <ExpandToggleRow
                          open={expandedMaintenanceRows.has(request.id)}
                          colSpan={7}
                          onClick={() => toggleMaintenanceRow(request.id)}
                        />
                        <DetailRow
                          open={expandedMaintenanceRows.has(request.id)}
                          colSpan={7}
                          fields={[
                            { label: 'หมวดหมู่', value: <MaintenanceCategoryBadge category={request.category} /> },
                            { label: 'รับเรื่องโดย', value: <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} /> },
                            { label: 'เสร็จสิ้นโดย', value: <StaffActionCell name={request.completed_by_name} date={request.completed_at} /> },
                          ]}
                        />
                      </Fragment>
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
          {(requestClose) => (
          <form onSubmit={(event) => submitRoomForm(event, requestClose)} noValidate>
            {roomFormError && <div className="alert alert-danger py-2 px-3">{roomFormError}</div>}

            <div className="admin-form-section">
              <p className="admin-form-section-title">ข้อมูลห้องพัก</p>
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
                  <div className="admin-input-group">
                    <span className="admin-input-affix">฿</span>
                    <input type="number" name="price" className="form-control" value={roomForm.price} onChange={handleRoomFormChange} required />
                  </div>
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
              </div>
            </div>

            <div className="admin-form-divider" />

            <div className="admin-form-section">
              <p className="admin-form-section-title">สิ่งอำนวยความสะดวก</p>
              <div className="admin-toggle-grid">
                {[
                  [
                    'air_conditioner',
                    'เครื่องปรับอากาศ',
                    <path key="ac" d="M12 3v18M5.6 6.5 18.4 17.5M18.4 6.5 5.6 17.5" />,
                  ],
                  [
                    'wifi',
                    'ไวไฟ',
                    <g key="wifi">
                      <path d="M2 8.5a16 16 0 0 1 20 0" />
                      <path d="M5.5 12.5a11 11 0 0 1 13 0" />
                      <path d="M9 16.5a5.5 5.5 0 0 1 6 0" />
                      <circle cx="12" cy="19.5" r="0.5" fill="currentColor" />
                    </g>,
                  ],
                  [
                    'refrigerator',
                    'ตู้เย็น',
                    <g key="fridge">
                      <rect x="5" y="2.5" width="14" height="19" rx="2" />
                      <line x1="5" y1="10.5" x2="19" y2="10.5" />
                      <line x1="8.5" y1="5.5" x2="8.5" y2="8" />
                      <line x1="8.5" y1="13.5" x2="8.5" y2="16" />
                    </g>,
                  ],
                  [
                    'bathroom',
                    'ห้องน้ำในตัว',
                    <g key="bath">
                      <path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z" />
                      <path d="M7 12V6a2.5 2.5 0 0 1 4.6-1.4" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                    </g>,
                  ],
                  [
                    'cctv',
                    'กล้องวงจรปิด',
                    <g key="cctv">
                      <rect x="2.5" y="8" width="12" height="8" rx="2" />
                      <path d="M14.5 10.5 21 8v8l-6.5-2.5" />
                      <line x1="6" y1="16" x2="5" y2="19" />
                    </g>,
                  ],
                ].map(([field, label, icon]) => (
                  <label className="admin-toggle-chip" key={field}>
                    <input type="checkbox" name={field} checked={roomForm[field]} onChange={handleRoomFormChange} />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {icon}
                    </svg>
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="admin-action-btn is-primary" disabled={roomSubmitting}>
                {roomSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {roomDeleteConfirm && (
        <Modal title="ยืนยันการลบห้องพัก" onClose={() => setRoomDeleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div className="admin-confirm-icon is-danger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <p className="admin-confirm-message">ต้องการลบห้อง {roomDeleteConfirm.room_number} ใช่หรือไม่?</p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="admin-action-btn is-danger" onClick={() => confirmDeleteRoom(requestClose)}>
                  ลบห้องพัก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {staffModal && (
        <Modal title={staffModal.mode === 'create' ? 'เพิ่มพนักงาน' : 'แก้ไขข้อมูลพนักงาน'} onClose={() => setStaffModal(null)}>
          {(requestClose) => (
          <form onSubmit={(event) => submitStaffForm(event, requestClose)} noValidate>
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
          )}
        </Modal>
      )}

      {staffDeleteConfirm && (
        <Modal title="ยืนยันการลบพนักงาน" onClose={() => setStaffDeleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div className="admin-confirm-icon is-danger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <p className="admin-confirm-message">
                ต้องการลบพนักงาน {staffDeleteConfirm.first_name} {staffDeleteConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="admin-action-btn is-danger" onClick={() => confirmDeleteStaff(requestClose)}>
                  ลบพนักงาน
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {staffSuspendConfirm && (
        <Modal
          title={staffSuspendConfirm.is_suspended ? 'ยืนยันการเปิดใช้งานพนักงาน' : 'ยืนยันการระงับพนักงาน'}
          onClose={() => setStaffSuspendConfirm(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div className={`admin-confirm-icon ${staffSuspendConfirm.is_suspended ? 'is-success' : 'is-danger'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v6" />
                  <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                </svg>
              </div>
              <p className="admin-confirm-message">
                ต้องการ{staffSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}พนักงาน {staffSuspendConfirm.first_name}{' '}
                {staffSuspendConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={`admin-action-btn ${staffSuspendConfirm.is_suspended ? 'is-primary' : 'is-danger'}`}
                  onClick={() => toggleStaffSuspend(staffSuspendConfirm, requestClose)}
                >
                  {staffSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {customerModal && (
        <Modal title={`แก้ไขข้อมูลลูกค้า - ${customerModal.first_name} ${customerModal.last_name}`} onClose={() => setCustomerModal(null)}>
          {(requestClose) => (
          <form onSubmit={(event) => submitCustomerForm(event, requestClose)} noValidate>
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
          )}
        </Modal>
      )}

      {customerSuspendConfirm && (
        <Modal
          title={customerSuspendConfirm.is_suspended ? 'ยืนยันการเปิดใช้งานลูกค้า' : 'ยืนยันการระงับลูกค้า'}
          onClose={() => setCustomerSuspendConfirm(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div className={`admin-confirm-icon ${customerSuspendConfirm.is_suspended ? 'is-success' : 'is-danger'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v6" />
                  <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                </svg>
              </div>
              <p className="admin-confirm-message">
                ต้องการ{customerSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}ลูกค้า {customerSuspendConfirm.first_name}{' '}
                {customerSuspendConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={`admin-action-btn ${customerSuspendConfirm.is_suspended ? 'is-primary' : 'is-danger'}`}
                  onClick={() => toggleCustomerSuspend(customerSuspendConfirm, requestClose)}
                >
                  {customerSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
                </button>
              </div>
            </div>
          )}
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
                customerDetail.rentalHistory.map((booking) => {
                  const page = rentalPaymentsPage[booking.booking_id] || 1
                  const totalPages = Math.max(1, Math.ceil(booking.payments.length / DETAIL_ROWS_PER_PAGE))
                  const currentPage = Math.min(page, totalPages)
                  const start = (currentPage - 1) * DETAIL_ROWS_PER_PAGE
                  const pagePayments = booking.payments.slice(start, start + DETAIL_ROWS_PER_PAGE)
                  return (
                    <div className="admin-detail-block" key={booking.booking_id}>
                      <p className="admin-detail-block-title">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                          <path d="M14 2v6h6" />
                          <line x1="8" y1="13" x2="16" y2="13" />
                          <line x1="8" y1="17" x2="13" y2="17" />
                        </svg>
                        สัญญาเช่าเมื่อ {formatDateTime(booking.created_at)}
                      </p>
                      {booking.payments.length === 0 ? (
                        <p className="admin-empty">ยังไม่มีประวัติการชำระเงิน</p>
                      ) : (
                        <>
                          <div className="admin-detail-table-wrap">
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
                                {pagePayments.map((payment) => (
                                  <tr key={payment.id}>
                                    <td>{formatDate(payment.payment_date)}</td>
                                    <td className="admin-strong-cell">฿{formatCurrency(payment.amount)}</td>
                                    <td>
                                      <span className={`admin-badge type-${payment.type}`}>{PAYMENT_TYPE_LABEL[payment.type] || payment.type}</span>
                                    </td>
                                    <td>
                                      <span className={`admin-badge status-${payment.status === 'paid' ? 'approved' : 'pending'}`}>
                                        {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <Pagination
                            page={currentPage}
                            totalPages={totalPages}
                            onChange={(nextPage) => setRentalPaymentsPage((prev) => ({ ...prev, [booking.booking_id]: nextPage }))}
                          />
                        </>
                      )}
                    </div>
                  )
                })
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
