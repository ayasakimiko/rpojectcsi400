import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import DatePicker, { registerLocale } from 'react-datepicker'
import { th } from 'date-fns/locale/th'
import 'react-datepicker/dist/react-datepicker.css'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts'
import './css/OwnerPage.css'

registerLocale('th', th)

const ROOM_OCCUPANCY_COLORS = { occupied: '#2563eb', vacant: '#10b981' }

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
}

function StatIcon({ name }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {STAT_ICON_PATHS[name]}
    </svg>
  )
}

function RoomOccupancyTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const item = payload[0]
  return (
    <div className="owner-chart-tooltip">
      <span className="owner-chart-tooltip-dot" style={{ background: item.payload.color }} />
      <span>{item.payload.name}</span>
      <strong>{item.value} ห้อง</strong>
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

const OWNER_TABS = [
  { key: 'rooms', label: 'สรุปรายระเอียด' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'customers', label: 'ลูกค้า' },
  { key: 'moveouts', label: 'ผู้ย้ายออก' },
  { key: 'requests', label: 'ประวัติคำขอผู้เช่า' },
  { key: 'maintenance', label: 'ประวัติแจ้งซ่อม' },
]

const PAYMENT_DATE_PRESETS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'today', label: 'วันนี้' },
  { key: '7d', label: '7 วัน' },
  { key: '30d', label: '30 วัน' },
  { key: 'month', label: 'เดือนนี้' },
]

function parseInputDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null
}

function toInputDate(value) {
  if (!value) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function ThaiDatePicker({ value, onChange, placeholder = 'วว/ดด/ปปปป' }) {
  return (
    <DatePicker
      selected={parseInputDate(value)}
      onChange={(date) => onChange(date ? toInputDate(date) : '')}
      dateFormat="dd/MM/yyyy"
      locale="th"
      placeholderText={placeholder}
      isClearable
      showPopperArrow={false}
    />
  )
}

function getAuthHeaders() {
  const token = sessionStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function OwnerMain() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('rooms')
  const [overview, setOverview] = useState({ rooms: {}, finance: {} })
  const [roomStatus, setRoomStatus] = useState({ totalRooms: 0, vacantCount: 0, occupiedCount: 0, vacantRooms: [], rooms: [] })
  const [incomeSummary, setIncomeSummary] = useState({ totalIncome: 0, byType: [] })
  const [expenses, setExpenses] = useState({ expenses: [], total: 0, totalAmount: 0, page: 1, pageSize: 10 })
  const [staffList, setStaffList] = useState([])
  const [paymentLogs, setPaymentLogs] = useState({ payments: [], total: 0, page: 1, pageSize: 20 })
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF)
  const [paymentFilter, setPaymentFilter] = useState({ search: '', from: '', to: '', onlyOverdue: false })
  const [paymentDatePreset, setPaymentDatePreset] = useState('all')
  const [notice, setNotice] = useState({ type: '', message: '' })
  const [isLoading, setIsLoading] = useState(true)
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
  const [paymentHistoryPage, setPaymentHistoryPage] = useState(1)
  const [incomeTypePage, setIncomeTypePage] = useState(1)
  const [expensePreviewPage, setExpensePreviewPage] = useState(1)
  const [occupancySummary, setOccupancySummary] = useState(null)
  const [isOccupancySummaryLoading, setIsOccupancySummaryLoading] = useState(false)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [viewingStaff, setViewingStaff] = useState(null)

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

  const expensePreviewTotalPages = Math.max(1, Math.ceil((expenses.expenses?.length || 0) / SUMMARY_PAGE_SIZE))
  const paginatedExpensePreview = useMemo(() => {
    const start = (expensePreviewPage - 1) * SUMMARY_PAGE_SIZE
    return (expenses.expenses || []).slice(start, start + SUMMARY_PAGE_SIZE)
  }, [expenses, expensePreviewPage])

  const statCards = useMemo(
    () => [
      {
        label: 'ห้องทั้งหมด',
        value: overview?.rooms?.totalRooms ?? roomStatus?.totalRooms ?? 0,
        subtitle: `${roomStatus?.occupiedCount ?? 0} ทราบว่าใช้งาน / ${roomStatus?.vacantCount ?? 0} ว่าง`,
        tone: 'blue',
        icon: 'rooms',
      },
      {
        label: 'รายได้รวม',
        value: formatSignedCurrency(totalIncome),
        subtitle: 'ตามรายการจ่ายชำระที่สำเร็จ',
        tone: 'green',
        icon: 'income',
      },
      {
        label: 'ค่าใช้จ่าย',
        value: formatSignedCurrency(totalExpense),
        subtitle: 'ค่าใช้จ่ายทั้งหมดของหอพัก',
        tone: 'orange',
        icon: 'expense',
      },
      {
        label: 'กำไรสุทธิ',
        value: formatSignedCurrency(netProfit),
        subtitle: 'รายได้ - ค่าใช้จ่าย',
        tone: netProfit < 0 ? 'red' : 'green',
        icon: 'profit',
      },
    ],
    [overview, roomStatus, totalExpense, totalIncome, netProfit],
  )

  const roomListItems = useMemo(() => {
    if (roomListFilter === 'occupied') return (roomStatus.rooms || []).filter((room) => room.is_booked)
    if (roomListFilter === 'vacant') return (roomStatus.rooms || []).filter((room) => room.status === 'vacant')
    if (roomListFilter === 'all') return roomStatus.rooms || []
    return []
  }, [roomListFilter, roomStatus.rooms])

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

  const roomOccupancyChartData = useMemo(
    () => [
      { name: 'มีผู้เช่า', value: roomOccupancyStats.occupied, color: ROOM_OCCUPANCY_COLORS.occupied },
      { name: 'ห้องว่าง', value: roomOccupancyStats.vacant, color: ROOM_OCCUPANCY_COLORS.vacant },
    ],
    [roomOccupancyStats],
  )

  const roomDetailBalance = useMemo(() => {
    if (!roomDetail?.tenant) return null
    const rent = Number(roomDetail.room?.price) || 0
    const unpaidUtilities = (roomDetail.payments || [])
      .filter((payment) => payment.status !== 'paid' && (payment.type === 'water' || payment.type === 'electricity'))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const deposit = Number(roomDetail.tenant.deposit_amount) || 0
    const totalDue = rent + unpaidUtilities
    return { rent, unpaidUtilities, deposit, totalDue, netBalance: totalDue - deposit }
  }, [roomDetail])

  const PAYMENT_HISTORY_PAGE_SIZE = 5
  const paymentHistoryTotalPages = Math.max(1, Math.ceil((roomDetail?.payments?.length || 0) / PAYMENT_HISTORY_PAGE_SIZE))
  const paginatedPaymentHistory = useMemo(() => {
    const start = (paymentHistoryPage - 1) * PAYMENT_HISTORY_PAGE_SIZE
    return (roomDetail?.payments || []).slice(start, start + PAYMENT_HISTORY_PAGE_SIZE)
  }, [roomDetail, paymentHistoryPage])

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

  const loadExpenses = async (page = expenses.page || 1) => {
    const { data } = await axios.get('/api/owner/expenses', {
      headers: getAuthHeaders(),
      params: { page },
    })
    setExpenses(data)
    setExpensePreviewPage(1)
  }

  const loadStaff = async () => {
    const { data } = await axios.get('/api/owner/staff', { headers: getAuthHeaders() })
    setStaffList(data.staff || [])
  }

  const loadPaymentLogs = async (page = paymentLogs.page || 1, overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
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
    setPaymentLogs(data)
  }

  const handleRoomClick = async (room) => {
    setRoomDetail({ room, tenant: null, payments: [] })
    setPaymentHistoryPage(1)
    setIsRoomDetailLoading(true)
    try {
      const { data } = await axios.get(`/api/owner/rooms/${room.room_number}`, { headers: getAuthHeaders() })
      setRoomDetail(data)
    } catch (error) {
      setRoomDetail(null)
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดห้องได้')
    } finally {
      setIsRoomDetailLoading(false)
    }
  }

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setIsLoading(true)
        await Promise.all([loadOverview(), loadRoomStatus(), loadOccupancySummary(), loadIncome(), loadExpenses(1), loadStaff(), loadPaymentLogs(1)])
      } catch (error) {
        const message = error.response?.data?.message || 'ไม่สามารถโหลดข้อมูลหอพักได้'
        setMessage('danger', message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAll()
  }, [])

  useEffect(() => {
    const isModalOpen = Boolean(roomDetail) || Boolean(roomListFilter) || isStaffModalOpen || Boolean(viewingStaff)
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
  }, [roomDetail, roomListFilter, isStaffModalOpen, viewingStaff])

  const handlePaymentFilterChange = async (field, value) => {
    const nextFilters = { ...paymentFilter, [field]: value }
    setPaymentFilter(nextFilters)
    if (field === 'from' || field === 'to') setPaymentDatePreset('custom')
    try {
      await loadPaymentLogs(1, nextFilters)
      if (field === 'from' || field === 'to') {
        await Promise.all([loadIncome(nextFilters), loadOverview(nextFilters), loadOccupancySummary(nextFilters)])
      }
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลการเงินได้')
    }
  }

  const handlePaymentDatePreset = async (presetKey) => {
    setPaymentDatePreset(presetKey)
    const today = new Date()
    let from = ''
    let to = ''
    if (presetKey === 'today') {
      from = toInputDate(today)
      to = toInputDate(today)
    } else if (presetKey === '7d') {
      from = toInputDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
      to = toInputDate(today)
    } else if (presetKey === '30d') {
      from = toInputDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29))
      to = toInputDate(today)
    } else if (presetKey === 'month') {
      from = toInputDate(new Date(today.getFullYear(), today.getMonth(), 1))
      to = toInputDate(today)
    }

    const nextFilters = { ...paymentFilter, from, to }
    setPaymentFilter(nextFilters)
    try {
      await Promise.all([
        loadPaymentLogs(1, nextFilters),
        loadIncome(nextFilters),
        loadOverview(nextFilters),
        loadOccupancySummary(nextFilters),
      ])
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลการเงินได้')
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
    if (!window.confirm(`ต้องการลบ ${staffMember.role} นี้หรือไม่`)) return
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
            <button type="button" className="owner-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </header>

        <section className="owner-period-bar">
          <div>
            <strong>สรุปข้อมูลประจำเดือน</strong>
            <span>ยอดรายรับ รายจ่าย และกำไรสุทธิของเดือนปัจจุบัน</span>
          </div>
          <span className="owner-period-badge">
            {THAI_MONTHS[selectedPeriod.month - 1]} {selectedPeriod.year + 543}
          </span>
        </section>

        {notice.message && (
          <div className={`owner-alert owner-alert-${notice.type}`}>{notice.message}</div>
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

        {!isLoading && activeTab === 'rooms' && (
          <div className="owner-filter-presets owner-filter-presets-top">
            {PAYMENT_DATE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={`owner-filter-preset-btn${paymentDatePreset === preset.key ? ' active' : ''}`}
                onClick={() => handlePaymentDatePreset(preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {isLoading && <div className="owner-loading-box">กำลังโหลดข้อมูล...</div>}

        {!isLoading && activeTab === 'rooms' && (
          <>
            <section className="owner-card-grid">
              {statCards.map((card) => (
                <article key={card.label} className={`owner-stat-card ${card.tone}`}>
                  <div className="owner-stat-header">
                    <span>{card.label}</span>
                    <span className="owner-stat-badge">
                      <StatIcon name={card.icon} />
                    </span>
                  </div>
                  <h2>{card.value}</h2>
                  <p>{card.subtitle}</p>
                </article>
              ))}
            </section>

            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>ภาพรวมห้องพัก</h3>
                <button type="button" className="owner-panel-header-link" onClick={() => setRoomListFilter('all')}>
                  ดูทั้งหมด
                </button>
              </div>
              <div className="owner-room-grid">
                <div className="owner-room-linecard">
                  <div className="owner-linecard-header">
                    <div>
                      <h4>อัตราการใช้ห้อง</h4>
                      <p>เปรียบเทียบห้องที่มีผู้เช่ากับห้องว่าง จากทั้งหมด {roomOccupancyStats.total} ห้อง</p>
                    </div>
                    <strong className="owner-linecard-rate">{roomOccupancyStats.occupancyRate}%</strong>
                  </div>

                  <div className={`owner-linecard-chart ${isOccupancySummaryLoading ? 'is-loading' : ''}`}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={roomOccupancyChartData} barCategoryGap="35%" accessibilityLayer={false}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={28} />
                        <Tooltip content={<RoomOccupancyTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={70}>
                          <LabelList dataKey="value" position="top" style={{ fill: '#0f2b52', fontWeight: 700, fontSize: 13 }} />
                          {roomOccupancyChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="owner-room-status-summary">
                <button type="button" className="owner-room-status-card occupied" onClick={() => setRoomListFilter('occupied')}>
                  <span className="owner-room-status-icon" aria-hidden="true" />
                  <div>
                    <strong>{roomStatus?.occupiedCount ?? 0} ห้อง</strong>
                    <span>มีผู้เช่า</span>
                  </div>
                  <span className="owner-room-status-hint">ดูรายการ</span>
                </button>
                <button type="button" className="owner-room-status-card vacant" onClick={() => setRoomListFilter('vacant')}>
                  <span className="owner-room-status-icon" aria-hidden="true" />
                  <div>
                    <strong>{roomStatus?.vacantCount ?? 0} ห้อง</strong>
                    <span>ห้องว่าง</span>
                  </div>
                  <span className="owner-room-status-hint">ดูรายการ</span>
                </button>
              </div>
            </section>

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
                  <h3>ค่าใช้จ่ายล่าสุด</h3>
                </div>
                <div className="owner-summary-list">
                  {paginatedExpensePreview.length ? (
                    paginatedExpensePreview.map((item) => (
                      <div key={item.id} className="owner-summary-item">
                        <div>
                          <span className="owner-summary-label">{item.category}</span>
                          <small>{item.recorded_by_name || 'เจ้าของหอพัก'}</small>
                        </div>
                        <strong>฿{formatCurrency(item.amount)}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="owner-empty">ยังไม่มีรายการรายจ่าย</div>
                  )}
                </div>
                {expenses.expenses?.length > SUMMARY_PAGE_SIZE && (
                  <div className="owner-pagination">
                    <button type="button" disabled={expensePreviewPage <= 1} onClick={() => setExpensePreviewPage((page) => page - 1)}>
                      ก่อนหน้า
                    </button>
                    <span>
                      หน้า {expensePreviewPage}/{expensePreviewTotalPages}
                    </span>
                    <button type="button" disabled={expensePreviewPage >= expensePreviewTotalPages} onClick={() => setExpensePreviewPage((page) => page + 1)}>
                      ถัดไป
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {!isLoading && activeTab === 'staff' && (
          <section className="owner-panel owner-staff-panel">
              <div className="owner-panel-header">
                <h3>จัดการพนักงาน</h3>
                <button type="button" className="owner-primary-btn small" onClick={openStaffModal}>
                  + เพิ่มพนักงาน
                </button>
              </div>

                <div className="owner-table-wrap">
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
                      {staffList.length ? (
                        staffList.map((member) => (
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
          </section>
        )}

        {isStaffModalOpen && (
          <div className="owner-modal-backdrop" role="presentation" onClick={closeStaffModal}>
            <section className="owner-modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title" onClick={(event) => event.stopPropagation()}>
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

        {viewingStaff && (
          <div className="owner-modal-backdrop" role="presentation" onClick={() => setViewingStaff(null)}>
            <section className="owner-modal" role="dialog" aria-modal="true" aria-labelledby="staff-detail-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <span className={`owner-status-badge ${viewingStaff.is_suspended ? 'disabled' : 'active'}`}>
                    {viewingStaff.role}
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
                      <strong>{`${viewingStaff.first_name || ''} ${viewingStaff.last_name || ''}`.trim() || '-'}</strong>
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
                      <strong>{viewingStaff.phone || '-'}</strong>
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
                      <strong>{viewingStaff.idcard || '-'}</strong>
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
                      <strong>{viewingStaff.age ? `${viewingStaff.age} ปี` : '-'}</strong>
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
                      <strong>{viewingStaff.role}</strong>
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
                      <strong>{viewingStaff.is_suspended ? 'ระงับใช้งาน' : 'ใช้งานปกติ'}</strong>
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
                      <strong>{formatDate(viewingStaff.created_at)}</strong>
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

        {!isLoading && ['customers', 'moveouts', 'requests', 'maintenance'].includes(activeTab) && (
          <section className="owner-panel">
            <div className="owner-panel-header">
              <h3>{OWNER_TABS.find((tab) => tab.key === activeTab)?.label}</h3>
            </div>
            <div className="owner-empty">กำลังพัฒนาฟีเจอร์นี้ เร็ว ๆ นี้</div>
          </section>
        )}

        {!isLoading && activeTab === 'rooms' && (
          <>
            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>บันทึกการชำระเงิน</h3>
              </div>

              <label className="owner-search-standalone">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={paymentFilter.search}
                  onChange={(event) => handlePaymentFilterChange('search', event.target.value)}
                  placeholder="ค้นหาห้อง / ลูกค้า / หมายเหตุ"
                />
              </label>

              <div className="owner-filter-box">
                <div className="owner-filter-row">
                  <label className="owner-date-field">
                    จาก
                    <ThaiDatePicker value={paymentFilter.from} onChange={(value) => handlePaymentFilterChange('from', value)} />
                  </label>
                  <label className="owner-date-field">
                    ถึง
                    <ThaiDatePicker value={paymentFilter.to} onChange={(value) => handlePaymentFilterChange('to', value)} />
                  </label>
                  <label className="owner-search-box">
                    สถานะการชำระ
                    <select
                      value={paymentFilter.onlyOverdue ? 'overdue' : 'all'}
                      onChange={(event) => handlePaymentFilterChange('onlyOverdue', event.target.value === 'overdue')}
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
                          <td>{payment.note || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="owner-empty-row">
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

            {roomDetail && (
              <div className="owner-modal-backdrop" role="presentation" onClick={() => setRoomDetail(null)}>
                <section className="owner-modal" role="dialog" aria-modal="true" aria-labelledby="room-detail-title" onClick={(event) => event.stopPropagation()}>
                  <div className="owner-modal-header">
                    <div>
                      <span className={`owner-status-badge ${roomDetail.room.status === 'vacant' ? 'active' : roomDetail.room.status === 'overdue' ? 'disabled' : ''}`}>
                        ห้อง {roomDetail.room.room_number}
                      </span>
                      <h3 id="room-detail-title">รายละเอียดห้องพัก</h3>
                    </div>
                    <button type="button" className="owner-modal-close" onClick={() => setRoomDetail(null)} aria-label="ปิดรายละเอียด">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="owner-modal-body">
                  {isRoomDetailLoading ? (
                    <div className="owner-loading-box">กำลังโหลดรายละเอียดห้อง...</div>
                  ) : (
                    <>
                      <div className="owner-detail-grid">
                        <div>
                          <div className="owner-detail-icon blue" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="8" r="3.3" />
                              <path d="M5.5 20c0-3.9 2.9-7 6.5-7s6.5 3.1 6.5 7" />
                            </svg>
                          </div>
                          <div className="owner-detail-text">
                            <span>ผู้เช่า</span>
                            <strong>{roomDetail.tenant ? `${roomDetail.tenant.first_name} ${roomDetail.tenant.last_name}` : 'ห้องว่าง'}</strong>
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
                            <strong>{roomDetail.tenant?.phone || '-'}</strong>
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
                            <span>วันเริ่มสัญญา</span>
                            <strong>{formatDate(roomDetail.room.rental_start_date)}</strong>
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
                            <span>วันสิ้นสุดสัญญา</span>
                            <strong>{formatDate(roomDetail.room.rental_end_date)}</strong>
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
                            <span>ค่าเช่ารายเดือน</span>
                            <strong>฿{formatCurrency(roomDetail.room.price)}</strong>
                          </div>
                        </div>
                        <div>
                          <div className="owner-detail-icon rose" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2 4 5v6c0 5.25 3.6 9.74 8 11 4.4-1.26 8-5.75 8-11V5l-8-3Z" />
                            </svg>
                          </div>
                          <div className="owner-detail-text">
                            <span>มัดจำ</span>
                            <strong>฿{formatCurrency(roomDetail.tenant?.deposit_amount)}</strong>
                          </div>
                        </div>
                      </div>
                      {!roomDetail.tenant && (
                        <button type="button" className="owner-primary-btn" onClick={() => navigate('/register')}>เพิ่มผู้เช่า</button>
                      )}
                      {roomDetailBalance && (
                        <div className="owner-balance-summary">
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
                          <div className={roomDetailBalance.netBalance > 0 ? 'is-owed' : 'is-refund'}>
                            <span>{roomDetailBalance.netBalance > 0 ? 'เก็บเพิ่ม' : 'มัดจำคงเหลือ (คืนลูกค้า)'}</span>
                            <strong>฿{formatCurrency(Math.abs(roomDetailBalance.netBalance))}</strong>
                          </div>
                        </div>
                      )}
                      <h4 className="owner-modal-subtitle">ประวัติการชำระเงิน</h4>
                      <div className="owner-table-wrap">
                        <table className="owner-table">
                          <thead>
                            <tr>
                              <th>วันที่</th>
                              <th>ประเภท</th>
                              <th className="owner-col-status">สถานะ</th>
                              <th>จำนวนเงิน</th>
                            </tr>
                          </thead>
                          <tbody>
                            {roomDetailBalance && (
                              <tr className="owner-room-balance-row">
                                <td>{formatDate(new Date())}</td>
                                <td>ค่าห้อง</td>
                                <td className="owner-col-status">
                                  <span className={`owner-status-badge ${roomDetailBalance.rent - roomDetailBalance.deposit > 0 ? 'pending' : 'active'}`}>
                                    {roomDetailBalance.rent - roomDetailBalance.deposit > 0 ? 'รอชำระ' : 'ชำระแล้ว'}
                                  </span>
                                </td>
                                <td>฿{formatCurrency(Math.abs(roomDetailBalance.rent - roomDetailBalance.deposit))}</td>
                              </tr>
                            )}
                            {roomDetail.payments?.length ? (
                              paginatedPaymentHistory.map((payment) => (
                                <tr key={payment.id}>
                                  <td>{formatDate(payment.payment_date)}</td>
                                  <td>{payment.type ? formatPaymentType(payment.type) : 'ไม่ระบุ'}</td>
                                  <td className="owner-col-status">
                                    <span className={`owner-status-badge ${payment.status === 'paid' ? 'active' : payment.status === 'pending' ? 'pending' : 'disabled'}`}>
                                      {payment.status === 'paid' ? 'ชำระแล้ว' : payment.status === 'pending' ? 'รอชำระ' : payment.status}
                                    </span>
                                  </td>
                                  <td>฿{formatCurrency(payment.amount)}</td>
                                </tr>
                              ))
                            ) : (
                              !roomDetailBalance && (
                                <tr>
                                  <td colSpan="4" className="owner-empty-row">
                                    ยังไม่มีประวัติการชำระเงิน
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                      {roomDetail.payments?.length > PAYMENT_HISTORY_PAGE_SIZE && (
                        <div className="owner-pagination">
                          <button type="button" disabled={paymentHistoryPage <= 1} onClick={() => setPaymentHistoryPage((page) => page - 1)}>
                            ก่อนหน้า
                          </button>
                          <span>
                            หน้า {paymentHistoryPage}/{paymentHistoryTotalPages}
                          </span>
                          <button type="button" disabled={paymentHistoryPage >= paymentHistoryTotalPages} onClick={() => setPaymentHistoryPage((page) => page + 1)}>
                            ถัดไป
                          </button>
                        </div>
                      )}
                      {roomDetailBalance && (
                        <div className="owner-payment-history-footer">
                          <span>คงเหลือหลังหักมัดจำ</span>
                          <span className={`owner-status-badge ${roomDetailBalance.netBalance > 0 ? 'pending' : 'active'}`}>
                            {roomDetailBalance.netBalance > 0
                              ? `ค้างชำระ ฿${formatCurrency(roomDetailBalance.netBalance)}`
                              : `คืนลูกค้า ฿${formatCurrency(Math.abs(roomDetailBalance.netBalance))}`}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  </div>
                </section>
              </div>
            )}

            {roomListFilter && (
              <div className="owner-modal-backdrop" role="presentation" onClick={() => setRoomListFilter(null)}>
                <section className="owner-modal" role="dialog" aria-modal="true" aria-labelledby="room-list-title" onClick={(event) => event.stopPropagation()}>
                  <div className="owner-modal-header">
                    <div>
                      <h3 id="room-list-title">
                        {roomListFilter === 'occupied' ? 'ห้องที่มีผู้เช่า' : roomListFilter === 'vacant' ? 'ห้องว่าง' : 'ห้องทั้งหมด'}
                      </h3>
                      <p className="owner-modal-subtext">คลิกที่ห้องเพื่อดูรายละเอียด</p>
                    </div>
                    <button type="button" className="owner-modal-close" onClick={() => setRoomListFilter(null)} aria-label="ปิดรายการห้อง">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div className="owner-modal-body">
                  <div className="owner-room-list">
                    {roomListItems.length ? (
                      roomListItems.map((room) => {
                        const statusLabels = { vacant: 'ว่าง', occupied: 'มีผู้เช่า', overdue: 'ค้างชำระ', maintenance: 'ซ่อมบำรุง' }
                        return (
                          <button
                            key={room.room_number}
                            type="button"
                            className={`owner-room-pill room-${room.status}`}
                            onClick={() => {
                              setRoomListFilter(null)
                              handleRoomClick(room)
                            }}
                          >
                            <span>ห้อง {room.room_number}</span>
                            <strong>{statusLabels[room.status] || 'มีผู้เช่า'}</strong>
                          </button>
                        )
                      })
                    ) : (
                      <div className="owner-empty">ไม่มีห้องในหมวดนี้</div>
                    )}
                  </div>

                  <div className="owner-room-legend" aria-label="คำอธิบายสถานะห้อง">
                    <span><i className="room-dot vacant" />ว่าง</span>
                    <span><i className="room-dot occupied" />มีผู้เช่า</span>
                    <span><i className="room-dot overdue" />ค้างชำระ</span>
                    <span><i className="room-dot maintenance" />ซ่อมบำรุง</span>
                  </div>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default OwnerMain
