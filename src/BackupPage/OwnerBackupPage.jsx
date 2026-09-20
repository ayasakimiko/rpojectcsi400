import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import 'bootstrap/dist/css/bootstrap.min.css'
import './OwnerBackupPage.css'

let openModalCount = 0

function lockBodyScroll() {
  openModalCount += 1
  if (openModalCount === 1) {
    document.body.style.overflow = 'hidden'
  }
}

function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1)
  if (openModalCount === 0) {
    document.body.style.overflow = ''
  }
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

  useEffect(() => {
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [])

  return (
    <div
      className={`owner-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`owner-modal${variant === 'confirm' ? ' owner-modal-confirm' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="owner-modal-header">
          <h3>{title}</h3>
          <button type="button" className="owner-modal-close" onClick={requestClose} aria-label="ปิด">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="owner-modal-body">{typeof children === 'function' ? children(requestClose) : children}</div>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="owner-pagination">
      <button type="button" className="owner-page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ก่อนหน้า
      </button>
      <span className="owner-page-info">
        หน้า {page} / {totalPages}
      </span>
      <button type="button" className="owner-page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ถัดไป
      </button>
    </div>
  )
}

const ROWS_PER_PAGE = 10

const TABS = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'expenses', label: 'รายจ่าย' },
  { key: 'payments', label: 'ประวัติการชำระเงิน' },
  { key: 'staff', label: 'พนักงาน & ผู้ดูแลระบบ' },
]

const PAYMENT_STATUS_LABEL = { paid: 'ชำระแล้ว', pending: 'รอชำระ' }
const PAYMENT_TYPE_LABEL = { rent: 'ค่าเช่า', deposit: 'เงินมัดจำ', water: 'ค่าน้ำ', electricity: 'ค่าไฟ' }
const STAFF_ROLE_LABEL = { Staff: 'พนักงาน', Admin: 'ผู้ดูแลระบบ' }

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const CHART_COLORS = { income: '#027a48', expense: '#b42318', occupied: '#2563eb', vacant: '#6ee7b7' }
const PIE_COLORS = ['#2563eb', '#7c3aed', '#0ea5e9', '#f59e0b', '#ef4444', '#10b981']
const TREND_RANGE_OPTIONS = [3, 6, 12]
const EXPENSE_CATEGORY_OPTIONS = ['ค่าน้ำ-ไฟส่วนกลาง', 'ค่าซ่อมบำรุง', 'เงินเดือนพนักงาน', 'ค่าทำความสะอาด', 'ภาษี', 'อื่นๆ']

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return '-'
  const [y, m] = monthKey.split('-').map(Number)
  const buddhistYear = (y + 543) % 100
  return `${THAI_MONTHS_SHORT[m - 1] || ''} ${String(buddhistYear).padStart(2, '0')}`
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="owner-chart-tooltip">
      <p className="owner-chart-tooltip-label">{label}</p>
      {payload.map((entry) => (
        <div className="owner-chart-tooltip-row" key={entry.dataKey}>
          <span className="owner-chart-tooltip-dot" style={{ background: entry.color }} />
          <span>{entry.name}</span>
          <strong>฿{formatCurrency(entry.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload, currency }) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]
  return (
    <div className="owner-chart-tooltip">
      <div className="owner-chart-tooltip-row">
        <span className="owner-chart-tooltip-dot" style={{ background: item.payload.fill }} />
        <span>{item.name}</span>
        <strong>{currency ? `฿${formatCurrency(item.value)}` : Number(item.value).toLocaleString('th-TH')}</strong>
      </div>
    </div>
  )
}

const emptyExpenseForm = { category: '', description: '', amount: '', expense_date: '' }
const emptyStaffForm = { role: 'Staff', idcard: '', password: '', phone: '', first_name: '', last_name: '', age: '' }

function OwnerBackupPage() {
  const navigate = useNavigate()
  const [ownerUser, setOwnerUser] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
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

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  /* ------------------------------- Overview -------------------------------- */
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')

  const loadOverview = () => {
    setOverviewLoading(true)
    return axios
      .get('/api/owner/overview', { headers: authHeaders() })
      .then(({ data }) => {
        setOverview(data)
        setOverviewError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setOverviewError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลภาพรวมได้')
      })
      .finally(() => setOverviewLoading(false))
  }

  const [trendMonths, setTrendMonths] = useState(6)
  const [trends, setTrends] = useState([])
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [trendsError, setTrendsError] = useState('')

  useEffect(() => {
    setTrendsLoading(true)
    axios
      .get('/api/owner/trends', { headers: authHeaders(), params: { months: trendMonths } })
      .then(({ data }) => {
        setTrends(data.trends || [])
        setTrendsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setTrendsError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลแนวโน้มได้')
      })
      .finally(() => setTrendsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendMonths])

  const [incomeByType, setIncomeByType] = useState([])
  const [incomeByTypeLoading, setIncomeByTypeLoading] = useState(true)

  const loadIncomeByType = () => {
    setIncomeByTypeLoading(true)
    return axios
      .get('/api/owner/income', { headers: authHeaders() })
      .then(({ data }) => setIncomeByType(data.byType || []))
      .catch((err) => handleUnauthorized(err))
      .finally(() => setIncomeByTypeLoading(false))
  }

  const [roomStatus, setRoomStatus] = useState(null)
  const [roomStatusLoading, setRoomStatusLoading] = useState(true)
  const [roomStatusError, setRoomStatusError] = useState('')

  const loadRoomStatus = () => {
    setRoomStatusLoading(true)
    return axios
      .get('/api/owner/rooms/status', { headers: authHeaders() })
      .then(({ data }) => {
        setRoomStatus(data)
        setRoomStatusError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRoomStatusError(err.response?.data?.message || 'ไม่สามารถโหลดสถานะห้องพักได้')
      })
      .finally(() => setRoomStatusLoading(false))
  }

  /* ------------------------------- Expenses -------------------------------- */
  const [expenseLogs, setExpenseLogs] = useState({ items: [], total: 0, totalAmount: 0, page: 1, pageSize: 20 })
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [expensesError, setExpensesError] = useState('')
  const [expensesFrom, setExpensesFrom] = useState('')
  const [expensesTo, setExpensesTo] = useState('')
  const [expenseModal, setExpenseModal] = useState(null)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)
  const [expenseFormError, setExpenseFormError] = useState('')
  const [expenseDeleteConfirm, setExpenseDeleteConfirm] = useState(null)

  const loadExpenses = (page = 1, from = expensesFrom, to = expensesTo) => {
    setExpensesLoading(true)
    return axios
      .get('/api/owner/expenses', {
        headers: authHeaders(),
        params: { page, from: from || undefined, to: to || undefined },
      })
      .then(({ data }) => {
        setExpenseLogs({ items: data.expenses, total: data.total, totalAmount: data.totalAmount, page: data.page, pageSize: data.pageSize })
        setExpensesError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setExpensesError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลรายจ่ายได้')
      })
      .finally(() => setExpensesLoading(false))
  }

  const refreshFinancials = () => {
    loadOverview()
    loadIncomeByType()
    axios
      .get('/api/owner/trends', { headers: authHeaders(), params: { months: trendMonths } })
      .then(({ data }) => setTrends(data.trends || []))
      .catch((err) => handleUnauthorized(err))
  }

  const openCreateExpense = () => {
    setExpenseForm(emptyExpenseForm)
    setExpenseFormError('')
    setExpenseModal({ mode: 'create' })
  }

  const openEditExpense = (expense) => {
    setExpenseForm({
      category: expense.category,
      description: expense.description || '',
      amount: String(expense.amount),
      expense_date: expense.expense_date ? String(expense.expense_date).slice(0, 10) : '',
    })
    setExpenseFormError('')
    setExpenseModal({ mode: 'edit', expense })
  }

  const handleExpenseFormChange = (event) => {
    const { name, value } = event.target
    setExpenseForm((prev) => ({ ...prev, [name]: value }))
  }

  const submitExpenseForm = async (event, requestClose) => {
    event.preventDefault()
    setExpenseSubmitting(true)
    setExpenseFormError('')
    const payload = {
      category: expenseForm.category.trim(),
      description: expenseForm.description.trim() || null,
      amount: Number(expenseForm.amount),
      expense_date: expenseForm.expense_date,
    }
    try {
      if (expenseModal.mode === 'create') {
        const { data } = await axios.post('/api/owner/expenses', payload, { headers: authHeaders() })
        setSuccessMessage(data.message || 'บันทึกรายจ่ายสำเร็จ')
      } else {
        const { data } = await axios.put(`/api/owner/expenses/${expenseModal.expense.id}`, payload, { headers: authHeaders() })
        setSuccessMessage(data.message || 'แก้ไขรายจ่ายสำเร็จ')
      }
      requestClose()
      await loadExpenses(expenseLogs.page)
      refreshFinancials()
    } catch (err) {
      setExpenseFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setExpenseSubmitting(false)
    }
  }

  const confirmDeleteExpense = async (requestClose) => {
    if (!expenseDeleteConfirm) return
    try {
      const { data } = await axios.delete(`/api/owner/expenses/${expenseDeleteConfirm.id}`, { headers: authHeaders() })
      setSuccessMessage(data.message || 'ลบรายจ่ายสำเร็จ')
      requestClose()
      await loadExpenses(expenseLogs.page)
      refreshFinancials()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ลบรายจ่ายไม่สำเร็จ')
      requestClose()
    }
  }

  const expensesTotalPages = Math.max(1, Math.ceil(expenseLogs.total / expenseLogs.pageSize))

  const isExpenseFilterMount = useRef(true)
  useEffect(() => {
    if (isExpenseFilterMount.current) {
      isExpenseFilterMount.current = false
      return
    }
    if (activeTab !== 'expenses') return
    const timeout = setTimeout(() => loadExpenses(1, expensesFrom, expensesTo), 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expensesFrom, expensesTo])

  /* -------------------------------- Payments ------------------------------- */
  const [paymentLogs, setPaymentLogs] = useState({ items: [], total: 0, page: 1, pageSize: 20 })
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentsError, setPaymentsError] = useState('')
  const [paymentsSearch, setPaymentsSearch] = useState('')
  const [paymentsFrom, setPaymentsFrom] = useState('')
  const [paymentsTo, setPaymentsTo] = useState('')

  const loadPayments = (page = 1, search = paymentsSearch, from = paymentsFrom, to = paymentsTo) => {
    setPaymentsLoading(true)
    return axios
      .get('/api/owner/logs/payments', {
        headers: authHeaders(),
        params: { page, search: search || undefined, from: from || undefined, to: to || undefined },
      })
      .then(({ data }) => {
        setPaymentLogs({ items: data.payments, total: data.total, page: data.page, pageSize: data.pageSize })
        setPaymentsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setPaymentsError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติการชำระเงินได้')
      })
      .finally(() => setPaymentsLoading(false))
  }

  const paymentsTotalPages = Math.max(1, Math.ceil(paymentLogs.total / paymentLogs.pageSize))

  const isPaymentsFilterMount = useRef(true)
  useEffect(() => {
    if (isPaymentsFilterMount.current) {
      isPaymentsFilterMount.current = false
      return
    }
    if (activeTab !== 'payments') return
    const timeout = setTimeout(() => loadPayments(1, paymentsSearch, paymentsFrom, paymentsTo), 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentsSearch, paymentsFrom, paymentsTo])

  /* ---------------------------------- Staff --------------------------------- */
  const [staffList, setStaffList] = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffError, setStaffError] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [staffRoleFilter, setStaffRoleFilter] = useState('all')
  const [staffPage, setStaffPage] = useState(1)
  const [staffModal, setStaffModal] = useState(null)
  const [staffForm, setStaffForm] = useState(emptyStaffForm)
  const [staffSubmitting, setStaffSubmitting] = useState(false)
  const [staffFormError, setStaffFormError] = useState('')
  const [staffDeleteConfirm, setStaffDeleteConfirm] = useState(null)
  const [staffSuspendConfirm, setStaffSuspendConfirm] = useState(null)
  const [revealedStaffIdCards, setRevealedStaffIdCards] = useState(() => new Set())

  const toggleStaffIdCardReveal = (key) => {
    setRevealedStaffIdCards((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const loadStaff = () => {
    setStaffLoading(true)
    return axios
      .get('/api/owner/staff', { headers: authHeaders() })
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
      role: member.role,
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
        const { data } = await axios.post('/api/owner/staff', staffForm, { headers: authHeaders() })
        setSuccessMessage(data.message || 'เพิ่มบัญชีสำเร็จ')
      } else {
        const payload = {
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          phone: staffForm.phone,
          age: Number(staffForm.age),
        }
        if (staffForm.password) payload.password = staffForm.password
        const { data } = await axios.put(
          `/api/owner/staff/${staffModal.staff.role}/${staffModal.staff.id}`,
          payload,
          { headers: authHeaders() },
        )
        setSuccessMessage(data.message || 'แก้ไขข้อมูลสำเร็จ')
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
        `/api/owner/staff/${member.role}/${member.id}/suspend`,
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
      const { data } = await axios.delete(`/api/owner/staff/${staffDeleteConfirm.role}/${staffDeleteConfirm.id}`, {
        headers: authHeaders(),
      })
      setSuccessMessage(data.message || 'ลบบัญชีสำเร็จ')
      requestClose()
      await loadStaff()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ลบบัญชีไม่สำเร็จ')
      requestClose()
    }
  }

  const filteredStaff = useMemo(() => {
    let list = staffList
    if (staffRoleFilter !== 'all') list = list.filter((member) => member.role === staffRoleFilter)
    const keyword = staffSearch.trim().toLowerCase()
    if (!keyword) return list
    return list.filter((member) => {
      const name = `${member.first_name} ${member.last_name}`.toLowerCase()
      return name.includes(keyword) || member.phone.includes(keyword) || member.idcard.includes(keyword)
    })
  }, [staffList, staffSearch, staffRoleFilter])

  const staffTotalPages = Math.max(1, Math.ceil(filteredStaff.length / ROWS_PER_PAGE))
  const currentStaffPage = Math.min(staffPage, staffTotalPages)
  const paginatedStaff = useMemo(() => {
    const start = (currentStaffPage - 1) * ROWS_PER_PAGE
    return filteredStaff.slice(start, start + ROWS_PER_PAGE)
  }, [filteredStaff, currentStaffPage])

  useEffect(() => {
    setStaffPage(1)
  }, [staffSearch, staffRoleFilter])

  /* --------------------------------- Mount --------------------------------- */
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
        if (parsed?.role !== 'Owner') {
          navigate('/login', { replace: true })
          return
        }
        setOwnerUser(parsed)
      } catch {
        setOwnerUser(null)
      }
    }
    loadOverview()
    loadIncomeByType()
    loadRoomStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeTab === 'expenses') loadExpenses(1, expensesFrom, expensesTo)
    if (activeTab === 'payments') loadPayments(1, paymentsSearch, paymentsFrom, paymentsTo)
    if (activeTab === 'staff') loadStaff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  /* -------------------------------- Derived -------------------------------- */
  const netProfit = overview ? overview.finance.netProfit : 0

  const occupancyPieData = useMemo(() => {
    if (!overview || overview.rooms.totalRooms === 0) return []
    return [
      { name: 'มีผู้เช่า', value: overview.rooms.occupiedRooms },
      { name: 'ห้องว่าง', value: overview.rooms.vacantRooms },
    ]
  }, [overview])

  const incomeTypePieData = useMemo(
    () => incomeByType.map((row) => ({ name: PAYMENT_TYPE_LABEL[row.type] || row.type, value: Number(row.total) })),
    [incomeByType],
  )

  const trendChartData = useMemo(() => trends.map((t) => ({ ...t, label: formatMonthLabel(t.month) })), [trends])
  const hasTrendData = trendChartData.some((t) => t.income > 0 || t.expense > 0)

  return (
    <div className="owner-page">
      <div className="owner-container">
        <div className="owner-header">
          <div className="owner-title-group">
            <div className="owner-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M3 13h18" />
              </svg>
            </div>
            <div>
              <h1>สวัสดี, {ownerUser ? `${ownerUser.first_name} ${ownerUser.last_name}` : 'เจ้าของกิจการ'}</h1>
              <p>แดชบอร์ดเจ้าของกิจการ - ภาพรวมผลประกอบการ รายรับ-รายจ่าย และสถานะห้องพัก</p>
            </div>
          </div>
          <div className="owner-header-actions">
            <button type="button" className="owner-nav-link-btn" onClick={() => navigate('/admin')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
              จัดการห้องพัก & ลูกค้า
            </button>
            <button type="button" className="owner-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        {pageError && (
          <div className="alert alert-danger owner-alert" role="alert">
            {pageError}
            <button type="button" className="btn-close float-end" onClick={() => setPageError('')} aria-label="ปิด" />
          </div>
        )}

        {successMessage && (
          <Modal title="สำเร็จ" onClose={() => setSuccessMessage('')} variant="confirm">
            {(requestClose) => (
              <div className="owner-confirm-body">
                <div className="owner-confirm-icon is-success">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="owner-confirm-message">{successMessage}</p>
                <div className="owner-form-actions">
                  <button type="button" className="owner-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        <div className="owner-summary-grid">
          <div className="owner-summary-card">
            <div className="owner-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
              </svg>
            </div>
            <div className="owner-summary-text">
              <span className="owner-summary-label">ห้องทั้งหมด</span>
              <span className="owner-summary-value">{overview ? overview.rooms.totalRooms : '-'}</span>
            </div>
          </div>
          <div className="owner-summary-card is-vacant">
            <div className="owner-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="8 12.5 11 15.5 16 9.5" />
              </svg>
            </div>
            <div className="owner-summary-text">
              <span className="owner-summary-label">ห้องว่าง</span>
              <span className="owner-summary-value">{overview ? overview.rooms.vacantRooms : '-'}</span>
            </div>
          </div>
          <div className="owner-summary-card is-income">
            <div className="owner-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 17 9 11 13 15 21 6" />
                <polyline points="14 6 21 6 21 13" />
              </svg>
            </div>
            <div className="owner-summary-text">
              <span className="owner-summary-label">รายรับรวม</span>
              <span className="owner-summary-value">{overview ? `฿${formatCurrency(overview.finance.totalIncome)}` : '-'}</span>
            </div>
          </div>
          <div className="owner-summary-card is-expense">
            <div className="owner-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 7 9 13 13 9 21 18" />
                <polyline points="21 11 21 18 14 18" />
              </svg>
            </div>
            <div className="owner-summary-text">
              <span className="owner-summary-label">รายจ่ายรวม</span>
              <span className="owner-summary-value">{overview ? `฿${formatCurrency(overview.finance.totalExpense)}` : '-'}</span>
            </div>
          </div>
          <div className={`owner-summary-card is-profit${netProfit < 0 ? ' is-negative' : ''}`}>
            <div className="owner-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="9" r="5" />
                <circle cx="15" cy="15" r="5" />
              </svg>
            </div>
            <div className="owner-summary-text">
              <span className="owner-summary-label">กำไรสุทธิ</span>
              <span className="owner-summary-value">{overview ? `฿${formatCurrency(netProfit)}` : '-'}</span>
            </div>
          </div>
        </div>

        <ul className="nav nav-tabs owner-tabs">
          {TABS.map((tab) => (
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

        {activeTab === 'overview' && (
          <Fragment>
            <div className="owner-chart-grid">
              <div className="owner-chart-card">
                <div className="owner-chart-card-header">
                  <div>
                    <h2>เปรียบเทียบรายรับ-รายจ่าย</h2>
                    <p>แนวโน้มย้อนหลังตามเดือน</p>
                  </div>
                  <div className="owner-chart-range">
                    {TREND_RANGE_OPTIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`owner-chart-range-btn${trendMonths === m ? ' active' : ''}`}
                        onClick={() => setTrendMonths(m)}
                      >
                        {m} เดือน
                      </button>
                    ))}
                  </div>
                </div>
                {trendsLoading ? (
                  <div className="owner-chart-empty">กำลังโหลดข้อมูล...</div>
                ) : trendsError ? (
                  <div className="owner-chart-empty">{trendsError}</div>
                ) : !hasTrendData ? (
                  <div className="owner-chart-empty">ยังไม่มีข้อมูลรายรับ-รายจ่ายในช่วงนี้</div>
                ) : (
                  <Fragment>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={trendChartData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#6b859e' }}
                          axisLine={false}
                          tickLine={false}
                          width={54}
                          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                        />
                        <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                        <Bar dataKey="income" name="รายรับ" fill={CHART_COLORS.income} radius={[6, 6, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="expense" name="รายจ่าย" fill={CHART_COLORS.expense} radius={[6, 6, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="owner-chart-legend">
                      <span className="owner-chart-legend-item">
                        <span className="owner-chart-legend-dot" style={{ background: CHART_COLORS.income }} />
                        รายรับ
                      </span>
                      <span className="owner-chart-legend-item">
                        <span className="owner-chart-legend-dot" style={{ background: CHART_COLORS.expense }} />
                        รายจ่าย
                      </span>
                    </div>
                  </Fragment>
                )}
              </div>

              <div className="owner-chart-card">
                <div className="owner-chart-card-header">
                  <div>
                    <h2>สถานะห้องพัก</h2>
                    <p>สัดส่วนห้องว่างเทียบกับห้องที่มีผู้เช่า</p>
                  </div>
                </div>
                {overviewLoading ? (
                  <div className="owner-chart-empty">กำลังโหลดข้อมูล...</div>
                ) : overviewError ? (
                  <div className="owner-chart-empty">{overviewError}</div>
                ) : occupancyPieData.length === 0 ? (
                  <div className="owner-chart-empty">ยังไม่มีข้อมูลห้องพัก</div>
                ) : (
                  <Fragment>
                    <div style={{ position: 'relative' }}>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={occupancyPieData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">
                            <Cell fill={CHART_COLORS.occupied} />
                            <Cell fill={CHART_COLORS.vacant} />
                          </Pie>
                          <Tooltip content={<PieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="owner-donut-center" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        <span className="owner-donut-center-value">{Math.round((overview?.rooms.occupancyRate || 0) * 100)}%</span>
                        <span className="owner-donut-center-label">มีผู้เช่า</span>
                      </div>
                    </div>
                    <div className="owner-chart-legend">
                      <span className="owner-chart-legend-item">
                        <span className="owner-chart-legend-dot" style={{ background: CHART_COLORS.occupied }} />
                        มีผู้เช่า ({overview.rooms.occupiedRooms})
                      </span>
                      <span className="owner-chart-legend-item">
                        <span className="owner-chart-legend-dot" style={{ background: CHART_COLORS.vacant }} />
                        ห้องว่าง ({overview.rooms.vacantRooms})
                      </span>
                    </div>
                  </Fragment>
                )}
              </div>
            </div>

            <div className="owner-chart-grid-secondary">
              <div className="owner-chart-card">
                <div className="owner-chart-card-header">
                  <div>
                    <h2>สัดส่วนรายรับตามประเภท</h2>
                    <p>ค่าเช่า เงินมัดจำ ค่าน้ำ ค่าไฟ (สะสมทั้งหมด)</p>
                  </div>
                </div>
                {incomeByTypeLoading ? (
                  <div className="owner-chart-empty">กำลังโหลดข้อมูล...</div>
                ) : incomeTypePieData.length === 0 ? (
                  <div className="owner-chart-empty">ยังไม่มีข้อมูลรายรับ</div>
                ) : (
                  <Fragment>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={incomeTypePieData} dataKey="value" nameKey="name" outerRadius={88} stroke="none">
                          {incomeTypePieData.map((entry, index) => (
                            <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip currency />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="owner-chart-legend">
                      {incomeTypePieData.map((entry, index) => (
                        <span className="owner-chart-legend-item" key={entry.name}>
                          <span className="owner-chart-legend-dot" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                          {entry.name} (฿{formatCurrency(entry.value)})
                        </span>
                      ))}
                    </div>
                  </Fragment>
                )}
              </div>

              <div className="owner-chart-card">
                <div className="owner-chart-card-header">
                  <div>
                    <h2>ห้องว่างในขณะนี้</h2>
                    <p>รายการห้องที่ยังไม่มีผู้เช่า</p>
                  </div>
                </div>
                {roomStatusLoading ? (
                  <div className="owner-chart-empty">กำลังโหลดข้อมูล...</div>
                ) : roomStatusError ? (
                  <div className="owner-chart-empty">{roomStatusError}</div>
                ) : !roomStatus || roomStatus.vacantRooms.length === 0 ? (
                  <div className="owner-chart-empty">ไม่มีห้องว่างในขณะนี้</div>
                ) : (
                  <div className="table-responsive" style={{ height: 220 }}>
                    <table className="table owner-table mb-0">
                      <thead>
                        <tr>
                          <th>เลขห้อง</th>
                          <th>ราคา/เดือน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roomStatus.vacantRooms.map((room) => (
                          <tr key={room.room_number}>
                            <td className="owner-strong-cell">{room.room_number}</td>
                            <td className="owner-price-cell">฿{formatCurrency(room.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Fragment>
        )}

        {activeTab === 'expenses' && (
          <div className="owner-card">
            <div className="owner-toolbar">
              <div className="owner-search-group">
                <span className="owner-toolbar-label">ตั้งแต่วันที่</span>
                <input type="date" className="form-control owner-search-input" value={expensesFrom} onChange={(e) => setExpensesFrom(e.target.value)} />
              </div>
              <div className="owner-search-group">
                <span className="owner-toolbar-label">ถึงวันที่</span>
                <input type="date" className="form-control owner-search-input" value={expensesTo} onChange={(e) => setExpensesTo(e.target.value)} />
              </div>
              <button type="button" className="owner-action-btn is-primary" onClick={openCreateExpense}>
                + เพิ่มรายจ่าย
              </button>
            </div>
            <div className="owner-card-header">
              <h2>รายการรายจ่าย</h2>
              <span className="owner-status-hint">รวม ฿{formatCurrency(expenseLogs.totalAmount)} ({expenseLogs.total} รายการ)</span>
            </div>
            {expensesError && <div className="alert alert-danger owner-alert">{expensesError}</div>}
            <div className="table-responsive">
              <table className="table owner-table mb-0">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>หมวดหมู่</th>
                    <th className="owner-col-optional">รายละเอียด</th>
                    <th>จำนวนเงิน</th>
                    <th className="owner-col-optional">บันทึกโดย</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expensesLoading ? (
                    <tr>
                      <td colSpan={6} className="owner-empty">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : expenseLogs.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="owner-empty">ไม่พบรายการรายจ่าย</td>
                    </tr>
                  ) : (
                    expenseLogs.items.map((expense) => (
                      <tr key={expense.id}>
                        <td>{formatDate(expense.expense_date)}</td>
                        <td className="owner-strong-cell">{expense.category}</td>
                        <td className="owner-col-optional">{expense.description || <span className="owner-cell-empty">-</span>}</td>
                        <td className="owner-price-cell">฿{formatCurrency(expense.amount)}</td>
                        <td className="owner-col-optional">{expense.recorded_by_name || <span className="owner-cell-empty">-</span>}</td>
                        <td>
                          <div className="owner-row-actions">
                            <button type="button" className="owner-action-btn is-ghost" onClick={() => openEditExpense(expense)}>
                              แก้ไข
                            </button>
                            <button type="button" className="owner-action-btn is-danger" onClick={() => setExpenseDeleteConfirm(expense)}>
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
            <Pagination page={expenseLogs.page} totalPages={expensesTotalPages} onChange={(p) => loadExpenses(p)} />
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="owner-card">
            <div className="owner-toolbar">
              <div className="owner-search-group">
                <span className="owner-toolbar-label">ค้นหา</span>
                <input
                  type="text"
                  className="form-control owner-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า"
                  value={paymentsSearch}
                  onChange={(e) => setPaymentsSearch(e.target.value)}
                />
              </div>
              <div className="owner-search-group">
                <span className="owner-toolbar-label">ตั้งแต่วันที่</span>
                <input type="date" className="form-control owner-search-input" value={paymentsFrom} onChange={(e) => setPaymentsFrom(e.target.value)} />
              </div>
              <div className="owner-search-group">
                <span className="owner-toolbar-label">ถึงวันที่</span>
                <input type="date" className="form-control owner-search-input" value={paymentsTo} onChange={(e) => setPaymentsTo(e.target.value)} />
              </div>
            </div>
            <div className="owner-card-header">
              <h2>ประวัติการชำระเงิน</h2>
              <span className="owner-status-hint">ทั้งหมด {paymentLogs.total} รายการ</span>
            </div>
            {paymentsError && <div className="alert alert-danger owner-alert">{paymentsError}</div>}
            <div className="table-responsive">
              <table className="table owner-table mb-0">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>ห้อง</th>
                    <th>ผู้เช่า</th>
                    <th>ประเภท</th>
                    <th>จำนวนเงิน</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsLoading ? (
                    <tr>
                      <td colSpan={6} className="owner-empty">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : paymentLogs.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="owner-empty">ไม่พบประวัติการชำระเงิน</td>
                    </tr>
                  ) : (
                    paymentLogs.items.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDate(payment.payment_date)}</td>
                        <td className="owner-strong-cell">{payment.room_number}</td>
                        <td>
                          {payment.first_name} {payment.last_name}
                        </td>
                        <td>
                          <span className={`owner-badge type-${payment.type}`}>{PAYMENT_TYPE_LABEL[payment.type] || payment.type}</span>
                        </td>
                        <td className="owner-price-cell">฿{formatCurrency(payment.amount)}</td>
                        <td>
                          <span className={`owner-badge status-${payment.status === 'paid' ? 'active' : 'pending'}`}>
                            {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={paymentLogs.page} totalPages={paymentsTotalPages} onChange={(p) => loadPayments(p)} />
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="owner-card">
            <div className="owner-toolbar">
              <div className="owner-search-group">
                <span className="owner-toolbar-label">ค้นหา</span>
                <input
                  type="text"
                  className="form-control owner-search-input"
                  placeholder="ค้นหาชื่อ, เบอร์โทร, เลขบัตรประชาชน"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                />
              </div>
              <div className="owner-filter-group">
                <span className="owner-toolbar-label">ตำแหน่ง</span>
                <select className="form-select owner-filter-select" value={staffRoleFilter} onChange={(e) => setStaffRoleFilter(e.target.value)}>
                  <option value="all">ทั้งหมด</option>
                  <option value="Staff">พนักงาน</option>
                  <option value="Admin">ผู้ดูแลระบบ</option>
                </select>
              </div>
              <button type="button" className="owner-action-btn is-primary" onClick={openCreateStaff}>
                + เพิ่มบัญชี
              </button>
            </div>
            {staffError && <div className="alert alert-danger owner-alert">{staffError}</div>}
            <div className="table-responsive">
              <table className="table owner-table mb-0">
                <thead>
                  <tr>
                    <th>ชื่อ-นามสกุล</th>
                    <th>ตำแหน่ง</th>
                    <th className="owner-col-optional">เลขบัตรประชาชน</th>
                    <th>เบอร์โทร</th>
                    <th className="owner-col-optional">อายุ</th>
                    <th>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staffLoading ? (
                    <tr>
                      <td colSpan={7} className="owner-empty">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : paginatedStaff.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="owner-empty">ไม่พบข้อมูล</td>
                    </tr>
                  ) : (
                    paginatedStaff.map((member) => {
                      const key = `${member.role}-${member.id}`
                      const revealed = revealedStaffIdCards.has(key)
                      return (
                        <tr key={key}>
                          <td className="owner-strong-cell">
                            {member.first_name} {member.last_name}
                          </td>
                          <td>
                            <span className={`owner-badge ${member.role === 'Admin' ? 'type-renew' : 'type-rent'}`}>
                              {STAFF_ROLE_LABEL[member.role] || member.role}
                            </span>
                          </td>
                          <td className="owner-col-optional">
                            <button type="button" className="owner-idcard-toggle" onClick={() => toggleStaffIdCardReveal(key)}>
                              {revealed ? member.idcard : `${member.idcard.slice(0, 4)}••••••••`}
                            </button>
                          </td>
                          <td>{member.phone}</td>
                          <td className="owner-col-optional">{member.age}</td>
                          <td>
                            <span className={`owner-badge status-${member.is_suspended ? 'suspended' : 'active'}`}>
                              {member.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานอยู่'}
                            </span>
                          </td>
                          <td>
                            <div className="owner-row-actions">
                              <button type="button" className="owner-action-btn is-ghost" onClick={() => openEditStaff(member)}>
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                className={`owner-action-btn ${member.is_suspended ? 'is-success' : 'is-warning'}`}
                                onClick={() => setStaffSuspendConfirm(member)}
                              >
                                {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                              </button>
                              <button type="button" className="owner-action-btn is-danger" onClick={() => setStaffDeleteConfirm(member)}>
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={currentStaffPage} totalPages={staffTotalPages} onChange={setStaffPage} />
          </div>
        )}
      </div>

      {expenseModal && (
        <Modal title={expenseModal.mode === 'create' ? 'เพิ่มรายจ่าย' : 'แก้ไขรายจ่าย'} onClose={() => setExpenseModal(null)}>
          {(requestClose) => (
            <form onSubmit={(e) => submitExpenseForm(e, requestClose)}>
              {expenseFormError && <div className="alert alert-danger py-2 px-3">{expenseFormError}</div>}
              <div className="row g-3">
                <div className="col-12 col-sm-6">
                  <label className="form-label">หมวดหมู่</label>
                  <input
                    type="text"
                    className="form-control"
                    name="category"
                    list="owner-expense-categories"
                    value={expenseForm.category}
                    onChange={handleExpenseFormChange}
                    required
                  />
                  <datalist id="owner-expense-categories">
                    {EXPENSE_CATEGORY_OPTIONS.map((option) => (
                      <option value={option} key={option} />
                    ))}
                  </datalist>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label">วันที่</label>
                  <input type="date" className="form-control" name="expense_date" value={expenseForm.expense_date} onChange={handleExpenseFormChange} required />
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label">จำนวนเงิน (บาท)</label>
                  <div className="owner-input-group">
                    <span className="owner-input-affix">฿</span>
                    <input type="number" min="0" step="0.01" className="form-control" name="amount" value={expenseForm.amount} onChange={handleExpenseFormChange} required />
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label">รายละเอียด (ถ้ามี)</label>
                  <input type="text" className="form-control" name="description" value={expenseForm.description} onChange={handleExpenseFormChange} />
                </div>
              </div>
              <div className="owner-form-actions">
                <button type="button" className="owner-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="submit" className="owner-action-btn is-primary" disabled={expenseSubmitting}>
                  {expenseSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {expenseDeleteConfirm && (
        <Modal title="ยืนยันการลบ" onClose={() => setExpenseDeleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="owner-confirm-body">
              <div className="owner-confirm-icon is-danger">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <p className="owner-confirm-message">
                ต้องการลบรายจ่าย “{expenseDeleteConfirm.category}” จำนวน ฿{formatCurrency(expenseDeleteConfirm.amount)} ใช่หรือไม่?
              </p>
              <div className="owner-form-actions">
                <button type="button" className="owner-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="owner-action-btn is-danger" onClick={() => confirmDeleteExpense(requestClose)}>
                  ลบ
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {staffModal && (
        <Modal title={staffModal.mode === 'create' ? 'เพิ่มบัญชีพนักงาน/ผู้ดูแลระบบ' : 'แก้ไขข้อมูล'} onClose={() => setStaffModal(null)}>
          {(requestClose) => (
            <form onSubmit={(e) => submitStaffForm(e, requestClose)}>
              {staffFormError && <div className="alert alert-danger py-2 px-3">{staffFormError}</div>}
              <div className="row g-3">
                {staffModal.mode === 'create' && (
                  <div className="col-12">
                    <label className="form-label">ตำแหน่ง</label>
                    <select className="form-select" name="role" value={staffForm.role} onChange={handleStaffFormChange}>
                      <option value="Staff">พนักงาน</option>
                      <option value="Admin">ผู้ดูแลระบบ</option>
                    </select>
                  </div>
                )}
                <div className="col-12 col-sm-6">
                  <label className="form-label">ชื่อ</label>
                  <input type="text" className="form-control" name="first_name" value={staffForm.first_name} onChange={handleStaffFormChange} required />
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label">นามสกุล</label>
                  <input type="text" className="form-control" name="last_name" value={staffForm.last_name} onChange={handleStaffFormChange} required />
                </div>
                {staffModal.mode === 'create' && (
                  <div className="col-12 col-sm-6">
                    <label className="form-label">เลขบัตรประชาชน</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={13}
                      className="form-control"
                      name="idcard"
                      value={staffForm.idcard}
                      onChange={handleStaffFormChange}
                      required
                    />
                  </div>
                )}
                <div className="col-12 col-sm-6">
                  <label className="form-label">เบอร์โทรศัพท์</label>
                  <input type="text" inputMode="numeric" className="form-control" name="phone" value={staffForm.phone} onChange={handleStaffFormChange} required />
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label">อายุ</label>
                  <input type="number" min="1" max="120" className="form-control" name="age" value={staffForm.age} onChange={handleStaffFormChange} required />
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label">{staffModal.mode === 'create' ? 'รหัสผ่าน' : 'รหัสผ่านใหม่ (ถ้าต้องการเปลี่ยน)'}</label>
                  <input
                    type="password"
                    className="form-control"
                    name="password"
                    value={staffForm.password}
                    onChange={handleStaffFormChange}
                    required={staffModal.mode === 'create'}
                  />
                </div>
              </div>
              <div className="owner-form-actions">
                <button type="button" className="owner-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="submit" className="owner-action-btn is-primary" disabled={staffSubmitting}>
                  {staffSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {staffSuspendConfirm && (
        <Modal
          title={staffSuspendConfirm.is_suspended ? 'เปิดใช้งานบัญชี' : 'ระงับการใช้งานบัญชี'}
          onClose={() => setStaffSuspendConfirm(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="owner-confirm-body">
              <div className={`owner-confirm-icon ${staffSuspendConfirm.is_suspended ? 'is-success' : 'is-pending'}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="owner-confirm-message">
                ต้องการ{staffSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}บัญชีของ {staffSuspendConfirm.first_name}{' '}
                {staffSuspendConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="owner-form-actions">
                <button type="button" className="owner-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={`owner-action-btn ${staffSuspendConfirm.is_suspended ? 'is-success' : 'is-warning'}`}
                  onClick={() => toggleStaffSuspend(staffSuspendConfirm, requestClose)}
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {staffDeleteConfirm && (
        <Modal title="ยืนยันการลบบัญชี" onClose={() => setStaffDeleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="owner-confirm-body">
              <div className="owner-confirm-icon is-danger">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <p className="owner-confirm-message">
                ต้องการลบบัญชีของ {staffDeleteConfirm.first_name} {staffDeleteConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="owner-form-actions">
                <button type="button" className="owner-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="owner-action-btn is-danger" onClick={() => confirmDeleteStaff(requestClose)}>
                  ลบ
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default OwnerBackupPage
