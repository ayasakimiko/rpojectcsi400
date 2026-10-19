import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts'
import './css/OwnerPage.css'
import './css/StaffPage.css'
import { StaffResidentVisitsTab, StaffSafetyTab } from './StaffMain.jsx'
import { UploadImage } from '../components/UploadMedia.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'
import { downloadUploadFile } from '../utils/uploadFiles.js'

const ROOM_OCCUPANCY_COLORS = { occupied: '#2563eb', vacant: '#10b981' }

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

const OWNER_TABS = [
  { key: 'rooms', label: 'สรุปห้อง' },
  { key: 'finance', label: 'รายละเอียดการเงิน' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'parking', label: 'ที่จอดรถ' },
  { key: 'safety', label: 'แจ้งเหตุฉุกเฉิน' },
]

const OWNER_PERIOD_BAR_CONTENT = {
  rooms: { title: 'สรุปข้อมูลห้องพัก', subtitle: 'ภาพรวมห้องพักและผู้เข้าพักประจำเดือน' },
  finance: { title: 'สรุปข้อมูลการเงิน', subtitle: 'ยอดรายรับ รายจ่าย และกำไรสุทธิของเดือนปัจจุบัน' },
  staff: { title: 'ข้อมูลพนักงาน', subtitle: 'รายชื่อและสถานะพนักงานทั้งหมด' },
  parking: { title: 'จัดการที่จอดรถ', subtitle: 'ติดตามคำขอและรายการรถของผู้เข้าพัก' },
  safety: { title: 'จัดการเหตุฉุกเฉิน', subtitle: 'ติดตามและตรวจสอบรายงานจากผู้เข้าพักและเจ้าหน้าที่' },
}

const PAYMENT_DATE_PRESETS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'today', label: 'วันนี้' },
  { key: 'month', label: 'เดือนนี้' },
  { key: '7d', label: '7 วัน' },
  { key: '30d', label: '30 วัน' },
  { key: '3m', label: '3 เดือน' },
  { key: '6m', label: '6 เดือน' },
  { key: '1y', label: '1 ปี' },
]

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

function toInputDate(value) {
  if (!value) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getAuthHeaders() {
  const token = sessionStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const MODAL_CLOSE_ANIMATION_MS = 110

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

function OwnerMain() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('rooms')
  const [overview, setOverview] = useState({ rooms: {}, finance: {} })
  const [roomStatus, setRoomStatus] = useState({ totalRooms: 0, vacantCount: 0, occupiedCount: 0, vacantRooms: [], rooms: [] })
  const [incomeSummary, setIncomeSummary] = useState({ totalIncome: 0, byType: [] })
  const [expenses, setExpenses] = useState({ expenses: [], byCategory: [], total: 0, totalAmount: 0, page: 1, pageSize: 10 })
  const [financeTrends, setFinanceTrends] = useState({ trends: [], granularity: 'month' })
  const [isTrendsLoading, setIsTrendsLoading] = useState(false)
  const [occupancyTrend, setOccupancyTrend] = useState({ trends: [], granularity: 'month' })
  const [isOccupancyTrendLoading, setIsOccupancyTrendLoading] = useState(false)
  const [occupancyPeriodDetail, setOccupancyPeriodDetail] = useState(null)
  const [expenseCategoryPage, setExpenseCategoryPage] = useState(1)
  const [staffList, setStaffList] = useState([])
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
  const [paymentDatePreset, setPaymentDatePreset] = useState('all')
  const [paymentLogFilter, setPaymentLogFilter] = useState({ search: '', from: '', to: '', onlyOverdue: false })
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

  const [displayRoomDetail, isRoomDetailClosing] = useClosingValue(roomDetail)
  const [displayRoomListFilter, isRoomListClosing] = useClosingValue(roomListFilter)
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
    () => (roomStatus.rooms || []).filter((room) => room.customer_id).sort((a, b) => a.room_number - b.room_number),
    [roomStatus],
  )
  const occupantsTotalPages = Math.max(1, Math.ceil(currentOccupants.length / SUMMARY_PAGE_SIZE))
  const paginatedOccupants = useMemo(() => {
    const start = (occupantsPage - 1) * SUMMARY_PAGE_SIZE
    return currentOccupants.slice(start, start + SUMMARY_PAGE_SIZE)
  }, [currentOccupants, occupantsPage])

  const vacantRoomsList = useMemo(
    () => (roomStatus.vacantRooms || []).slice().sort((a, b) => a.room_number - b.room_number),
    [roomStatus],
  )
  const vacantRoomsTotalPages = Math.max(1, Math.ceil(vacantRoomsList.length / SUMMARY_PAGE_SIZE))
  const paginatedVacantRooms = useMemo(() => {
    const start = (vacantRoomsPage - 1) * SUMMARY_PAGE_SIZE
    return vacantRoomsList.slice(start, start + SUMMARY_PAGE_SIZE)
  }, [vacantRoomsList, vacantRoomsPage])

  const maintenanceRoomsList = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.status === 'maintenance').sort((a, b) => a.room_number - b.room_number),
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
    if (displayRoomListFilter === 'all') return roomStatus.rooms || []
    return []
  }, [displayRoomListFilter, roomStatus.rooms])

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
    const roomNumbers = [...new Set((data.payments || []).map((payment) => payment.room_number).filter(Boolean))]
    const histories = await Promise.all(roomNumbers.map((roomNumber) =>
      axios.get(`/api/staff/rooms/${roomNumber}/history`, { headers: getAuthHeaders() }).catch(() => null),
    ))
    const historicalSlips = new Map()
    histories.forEach((response) => {
      response?.data?.rentalHistory?.forEach((booking) => {
        booking.payments?.forEach((payment) => {
          if (payment.slip_path) historicalSlips.set(String(payment.id), payment.slip_path)
        })
      })
    })
    setPaymentLogs({
      ...data,
      payments: (data.payments || []).map((payment) => {
        const paymentId = String(payment.id || '').replace(/^payment-/, '')
        return { ...payment, slip_path: payment.slip_path || historicalSlips.get(paymentId) || null }
      }),
    })
  }

  const loadPendingSlipReviews = async () => {
    const { data } = await axios.get('/api/staff/payment-verifications', { headers: getAuthHeaders() })
    setPendingSlipReviews(data.payments || [])
  }

  const reviewOwnerPaymentSlip = async (payment, decision) => {
    const paymentId = payment.payment_id ?? payment.id
    const action = decision === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'
    const confirmed = window.confirm(`${action}สลิปของห้อง ${payment.room_number} ยอด ฿${formatCurrency(payment.amount)} หรือไม่?`)
    if (!confirmed) return
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
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่')
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

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setIsLoading(true)
        await Promise.all([loadOverview(), loadRoomStatus(), loadOccupancySummary(), loadIncome(), loadExpenses(1), loadTrends(), loadOccupancyTrend(), loadStaff(), loadPaymentLogs(1), loadPendingSlipReviews(), loadOccupancyLogs(1)])
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
    } else if (presetKey === '3m') {
      from = toInputDate(new Date(today.getFullYear(), today.getMonth() - 2, 1))
      to = toInputDate(today)
    } else if (presetKey === '6m') {
      from = toInputDate(new Date(today.getFullYear(), today.getMonth() - 5, 1))
      to = toInputDate(today)
    } else if (presetKey === '1y') {
      from = toInputDate(new Date(today.getFullYear(), today.getMonth() - 11, 1))
      to = toInputDate(today)
    }

    const nextFilters = { ...paymentFilter, from, to }
    setPaymentFilter(nextFilters)
    try {
      await Promise.all([
        loadIncome(nextFilters),
        loadOverview(nextFilters),
        loadOccupancySummary(nextFilters),
        loadExpenses(1, nextFilters),
        loadOccupancyLogs(1, { from: nextFilters.from, to: nextFilters.to }),
        loadTrends(nextFilters),
        loadOccupancyTrend(nextFilters),
      ])
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลการเงินได้')
    }
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
            <strong>{(OWNER_PERIOD_BAR_CONTENT[activeTab] || OWNER_PERIOD_BAR_CONTENT.rooms).title}</strong>
            <span>{(OWNER_PERIOD_BAR_CONTENT[activeTab] || OWNER_PERIOD_BAR_CONTENT.rooms).subtitle}</span>
          </div>
          {(activeTab === 'rooms' || activeTab === 'finance') && (
            <span className="owner-period-badge">
              {THAI_MONTHS[selectedPeriod.month - 1]} {selectedPeriod.year + 543}
            </span>
          )}
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

        {activeTab === 'parking' && (
          <StaffResidentVisitsTab rooms={(roomStatus.rooms || []).map((room) => ({ ...room, tenant: room.customer_id ? { id: room.customer_id, first_name: room.first_name, last_name: room.last_name } : null }))} />
        )}

        {activeTab === 'safety' && (
          <StaffSafetyTab rooms={(roomStatus.rooms || []).map((room) => ({ ...room, tenant: room.customer_id ? { id: room.customer_id, first_name: room.first_name, last_name: room.last_name } : null }))} showSummary />
        )}

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
                <div className="owner-card-grid owner-occupancy-stat-grid">
                  <article className="owner-stat-card blue">
                    <div className="owner-stat-header">
                      <span>ผู้เข้าพักปัจจุบัน</span>
                      <span className="owner-stat-badge"><StatIcon name="rooms" /></span>
                    </div>
                    <h2>{currentOccupants.length} คน</h2>
                    <p>ผู้เช่าที่มีข้อมูลอยู่ในห้องปัจจุบัน</p>
                  </article>
                  <article className="owner-stat-card green">
                    <div className="owner-stat-header">
                      <span>ห้องที่มีผู้พัก</span>
                      <span className="owner-stat-badge"><StatIcon name="rooms" /></span>
                    </div>
                    <h2>{roomStatus.occupiedCount || 0} ห้อง</h2>
                    <p>จากห้องทั้งหมด {roomStatus.totalRooms || 0} ห้อง</p>
                  </article>
                  <article className="owner-stat-card purple">
                    <div className="owner-stat-header">
                      <span>อัตราการเข้าพักเฉลี่ย</span>
                      <span className="owner-stat-badge"><StatIcon name="margin" /></span>
                    </div>
                    <h2>{occupancyTrendSummary.avgRate.toFixed(1)}%</h2>
                    <p>เฉลี่ยจาก {occupancyTrendSummary.periodCount} ช่วงเวลาที่แสดง</p>
                  </article>
                  <article className="owner-stat-card orange">
                    <div className="owner-stat-header">
                      <span>ผู้พักสูงสุด</span>
                      <span className="owner-stat-badge"><StatIcon name="profit" /></span>
                    </div>
                    <h2>{occupancyTrendSummary.peakOccupied} ห้อง</h2>
                    <p>อัตราเข้าพักสูงสุด {occupancyTrendSummary.peakRate.toFixed(1)}%</p>
                  </article>
                </div>
                <div className={`owner-linecard-chart owner-finance-trend-chart ${isOccupancyTrendLoading ? 'is-loading' : ''}`}>
                  <ResponsiveContainer width="100%" height={280}>
                    {occupancyTrendChartData.length >= 2 ? (
                      <LineChart data={occupancyTrendChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip content={<OccupancyTrendTooltip />} cursor={{ stroke: '#c7d8f0', strokeWidth: 1 }} />
                        <Line type="monotone" dataKey="occupied" name="มีผู้เช่า" stroke={ROOM_OCCUPANCY_COLORS.occupied} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="vacant" name="ว่าง" stroke={ROOM_OCCUPANCY_COLORS.vacant} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    ) : (
                      <BarChart data={occupancyTrendChartData} barGap={4} barCategoryGap="40%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip content={<OccupancyTrendTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                        <Bar dataKey="occupied" name="มีผู้เช่า" fill={ROOM_OCCUPANCY_COLORS.occupied} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar dataKey="vacant" name="ว่าง" fill={ROOM_OCCUPANCY_COLORS.vacant} radius={[4, 4, 0, 0]} maxBarSize={48} />
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
                          <Line type="monotone" dataKey="moveIns" name="ย้ายเข้า" stroke="#0f9d58" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
                          <Line type="monotone" dataKey="moveOuts" name="ย้ายออก" stroke="#d97706" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      ) : (
                        <BarChart data={occupancyTrendChartData} barGap={8} barCategoryGap="40%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={32} />
                          <Tooltip content={<OccupancyMovementTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                          <Bar dataKey="moveIns" name="ย้ายเข้า" fill="#0f9d58" radius={[4, 4, 0, 0]} maxBarSize={34} />
                          <Bar dataKey="moveOuts" name="ย้ายออก" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={34} />
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

            <section className="owner-shell-grid">
              <div className="owner-panel">
                <div className="owner-panel-header">
                  <h3>ผู้เข้าพักปัจจุบัน</h3>
                  <div className="owner-panel-header-actions">
                    <span className="owner-panel-header-count">{currentOccupants.length} คน</span>
                    <button type="button" className="owner-panel-header-link" onClick={() => setRoomListFilter('occupied')}>
                      ดูทั้งหมด
                    </button>
                  </div>
                </div>
                <p className="owner-panel-hint">คลิกที่รายการเพื่อดูรายละเอียดห้อง</p>
                <div className="owner-income-type-list">
                  {paginatedOccupants.length ? (
                    paginatedOccupants.map((room) => (
                      <button
                        key={room.room_number}
                        type="button"
                        className="owner-income-type-item owner-income-type-item-button"
                        onClick={() => handleRoomClick(room)}
                      >
                        <span className="owner-income-type-icon" style={{ color: '#2563eb', background: 'rgba(37, 99, 235, 0.12)' }}>
                          <StatIcon name="rooms" />
                        </span>
                        <div className="owner-income-type-body">
                          <div className="owner-income-type-row">
                            <span className="owner-summary-label">
                              ห้อง {room.room_number} · {`${room.first_name || ''} ${room.last_name || ''}`.trim() || 'ไม่ระบุชื่อ'}
                            </span>
                            <strong>{room.phone || '-'}</strong>
                          </div>
                          <div className="owner-income-type-row">
                            <small>เข้าพักตั้งแต่ {formatDate(room.rental_start_date)}</small>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="owner-empty">ยังไม่มีผู้เข้าพัก</div>
                  )}
                </div>
                {currentOccupants.length > SUMMARY_PAGE_SIZE && (
                  <div className="owner-pagination">
                    <button type="button" disabled={occupantsPage <= 1} onClick={() => setOccupantsPage((page) => page - 1)}>
                      ก่อนหน้า
                    </button>
                    <span>
                      หน้า {occupantsPage}/{occupantsTotalPages}
                    </span>
                    <button type="button" disabled={occupantsPage >= occupantsTotalPages} onClick={() => setOccupantsPage((page) => page + 1)}>
                      ถัดไป
                    </button>
                  </div>
                )}
              </div>

              <div className="owner-panel">
                <div className="owner-panel-header">
                  <h3>ห้องว่าง</h3>
                  <div className="owner-panel-header-actions">
                    <span className="owner-panel-header-count">{vacantRoomsList.length} ห้อง</span>
                    <button type="button" className="owner-panel-header-link" onClick={() => setRoomListFilter('vacant')}>
                      ดูทั้งหมด
                    </button>
                  </div>
                </div>
                <p className="owner-panel-hint">คลิกที่รายการเพื่อดูรายละเอียดห้อง</p>
                <div className="owner-income-type-list">
                  {paginatedVacantRooms.length ? (
                    paginatedVacantRooms.map((room) => (
                      <button
                        key={room.room_number}
                        type="button"
                        className="owner-income-type-item owner-income-type-item-button"
                        onClick={() => handleRoomClick(room)}
                      >
                        <span className="owner-income-type-icon" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.14)' }}>
                          <StatIcon name="rooms" />
                        </span>
                        <div className="owner-income-type-body">
                          <div className="owner-income-type-row">
                            <span className="owner-summary-label">ห้อง {room.room_number}</span>
                            <strong>฿{formatCurrency(room.price)}/เดือน</strong>
                          </div>
                          <div className="owner-income-type-row">
                            <small>ว่าง พร้อมให้เช่า</small>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="owner-empty">ไม่มีห้องว่างในขณะนี้</div>
                  )}
                </div>
                {vacantRoomsList.length > SUMMARY_PAGE_SIZE && (
                  <div className="owner-pagination">
                    <button type="button" disabled={vacantRoomsPage <= 1} onClick={() => setVacantRoomsPage((page) => page - 1)}>
                      ก่อนหน้า
                    </button>
                    <span>
                      หน้า {vacantRoomsPage}/{vacantRoomsTotalPages}
                    </span>
                    <button type="button" disabled={vacantRoomsPage >= vacantRoomsTotalPages} onClick={() => setVacantRoomsPage((page) => page + 1)}>
                      ถัดไป
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>ห้องที่กำลังซ่อม</h3>
                <div className="owner-panel-header-actions">
                  <span className="owner-panel-header-count">{maintenanceRoomsList.length} ห้อง</span>
                  <button type="button" className="owner-panel-header-link" onClick={() => setRoomListFilter('maintenance')}>
                    ดูทั้งหมด
                  </button>
                </div>
              </div>
              <p className="owner-panel-hint">คลิกที่รายการเพื่อดูรายละเอียดห้อง</p>
              <div className="owner-income-type-list">
                {paginatedMaintenanceRooms.length ? (
                  paginatedMaintenanceRooms.map((room) => (
                    <button
                      key={room.room_number}
                      type="button"
                      className="owner-income-type-item owner-income-type-item-button"
                      onClick={() => handleRoomClick(room)}
                    >
                      <span className="owner-income-type-icon" style={{ color: '#e11d48', background: 'rgba(225, 29, 72, 0.12)' }}>
                        <StatIcon name="maintenance" />
                      </span>
                      <div className="owner-income-type-body">
                        <div className="owner-income-type-row">
                          <span className="owner-summary-label">
                            ห้อง {room.room_number} · {`${room.first_name || ''} ${room.last_name || ''}`.trim() || 'ไม่ระบุชื่อ'}
                          </span>
                          <strong>{room.phone || '-'}</strong>
                        </div>
                        <div className="owner-income-type-row">
                          <small>กำลังซ่อมบำรุง</small>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="owner-empty">ไม่มีห้องที่กำลังซ่อมบำรุงในขณะนี้</div>
                )}
              </div>
              {maintenanceRoomsList.length > SUMMARY_PAGE_SIZE && (
                <div className="owner-pagination">
                  <button type="button" disabled={maintenanceRoomsPage <= 1} onClick={() => setMaintenanceRoomsPage((page) => page - 1)}>
                    ก่อนหน้า
                  </button>
                  <span>
                    หน้า {maintenanceRoomsPage}/{maintenanceRoomsTotalPages}
                  </span>
                  <button type="button" disabled={maintenanceRoomsPage >= maintenanceRoomsTotalPages} onClick={() => setMaintenanceRoomsPage((page) => page + 1)}>
                    ถัดไป
                  </button>
                </div>
              )}
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

            <section className="owner-card-grid">
              <article className="owner-stat-card blue">
                <div className="owner-stat-header">
                  <span>รายรับรวม</span>
                  <span className="owner-stat-badge"><StatIcon name="income" /></span>
                </div>
                <h2>{formatSignedCurrency(totalIncome)}</h2>
                <p>รวมรายการชำระเงินที่สำเร็จตามช่วงที่เลือก</p>
              </article>
              <article className="owner-stat-card orange">
                <div className="owner-stat-header">
                  <span>รายจ่ายรวม</span>
                  <span className="owner-stat-badge"><StatIcon name="expense" /></span>
                </div>
                <h2>{formatSignedCurrency(totalExpense)}</h2>
                <p>รวมรายจ่ายทั้งหมดตามช่วงที่เลือก</p>
              </article>
              <article className={`owner-stat-card ${netProfit < 0 ? 'red' : 'green'}`}>
                <div className="owner-stat-header">
                  <span>{netProfit < 0 ? 'ขาดทุนสุทธิ' : 'กำไรสุทธิ'}</span>
                  <span className="owner-stat-badge"><StatIcon name="profit" /></span>
                </div>
                <h2>{formatSignedCurrency(netProfit)}</h2>
                <p>รายรับ - รายจ่าย</p>
              </article>
              <article className={`owner-stat-card ${netProfit < 0 ? 'red' : 'purple'}`}>
                <div className="owner-stat-header">
                  <span>อัตรากำไร</span>
                  <span className="owner-stat-badge"><StatIcon name="margin" /></span>
                </div>
                <h2>{formatPercent(profitMargin)}</h2>
                <p>กำไรสุทธิเทียบกับรายรับรวม</p>
              </article>
            </section>

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
                        <Line type="monotone" dataKey="income" name="รายรับ" stroke={FINANCE_TREND_COLORS.income} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="expense" name="รายจ่าย" stroke={FINANCE_TREND_COLORS.expense} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                        <Line
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
                        <Bar dataKey="income" name="รายรับ" fill={FINANCE_TREND_COLORS.income} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar dataKey="expense" name="รายจ่าย" fill={FINANCE_TREND_COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar dataKey="netProfit" name="กำไร/ขาดทุน" fill={FINANCE_TREND_COLORS.net} radius={[4, 4, 0, 0]} maxBarSize={48}>
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

        {!isLoading && activeTab === 'rooms' && (
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

            {displayRoomDetail && (
              <div className={`owner-modal-backdrop${isRoomDetailClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomDetail(null)}>
                <section className={`owner-modal${isRoomDetailClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-detail-title" onClick={(event) => event.stopPropagation()}>
                  <div className="owner-modal-header">
                    <div>
                      <span className={`owner-status-badge ${displayRoomDetail.room.status === 'vacant' ? 'active' : displayRoomDetail.room.status === 'overdue' ? 'disabled' : ''}`}>
                        ห้อง {displayRoomDetail.room.room_number}
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
                            <strong>{displayRoomDetail.tenant ? `${displayRoomDetail.tenant.first_name} ${displayRoomDetail.tenant.last_name}` : 'ห้องว่าง'}</strong>
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
                            <strong>{displayRoomDetail.tenant?.phone || '-'}</strong>
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
                            <strong>{formatDate(displayRoomDetail.room.rental_start_date)}</strong>
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
                            <strong>{formatDate(displayRoomDetail.room.rental_end_date)}</strong>
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
                            <strong>฿{formatCurrency(displayRoomDetail.room.price)}</strong>
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
                            <strong>฿{formatCurrency(displayRoomDetail.tenant?.deposit_amount)}</strong>
                          </div>
                        </div>
                      </div>
                      {!displayRoomDetail.tenant && (
                        <div className="owner-add-tenant-row">
                          <button
                            type="button"
                            className="owner-primary-btn small"
                            onClick={() => navigate('/register', { state: { roomNumber: displayRoomDetail.room.room_number } })}
                          >
                            เพิ่มผู้เช่า
                          </button>
                        </div>
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
                              <th>สลิป</th>
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
                                <td>-</td>
                              </tr>
                            )}
                            {displayRoomDetail.payments?.length ? (
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
                                  <td>
                                    {payment.slip_path ? (
                                      <div className="owner-payment-slip-cell">
                                        <button type="button" className="owner-view-slip-btn" onClick={() => openPaymentSlip({ ...payment, room_number: displayRoomDetail.room.room_number, first_name: payment.tenantName || displayRoomDetail.tenant?.first_name, last_name: payment.tenantName ? '' : displayRoomDetail.tenant?.last_name })}>
                                          <span>ดูสลิป</span>
                                        </button>
                                        {payment.status === 'pending' && (
                                          <div className="owner-payment-review-actions">
                                            <button type="button" className="owner-payment-reject" disabled={reviewingSlipId === payment.id} onClick={() => reviewOwnerPaymentSlip(payment, 'rejected')}>ปฏิเสธ</button>
                                            <button type="button" className="owner-payment-approve" disabled={reviewingSlipId === payment.id} onClick={() => reviewOwnerPaymentSlip(payment, 'approved')}>อนุมัติ</button>
                                          </div>
                                        )}
                                      </div>
                                    ) : <span className="owner-no-slip">ไม่มีสลิป</span>}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              !roomDetailBalance && (
                                <tr>
                                  <td colSpan="5" className="owner-empty-row">
                                    ยังไม่มีประวัติการชำระเงิน
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                      {displayRoomDetail.payments?.length > PAYMENT_HISTORY_PAGE_SIZE && (
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

            {displayRoomListFilter && (
              <div className={`owner-modal-backdrop${isRoomListClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomListFilter(null)}>
                <section className={`owner-modal${isRoomListClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-list-title" onClick={(event) => event.stopPropagation()}>
                  <div className="owner-modal-header">
                    <div>
                      <h3 id="room-list-title">
                        {displayRoomListFilter === 'occupied'
                          ? 'ห้องที่มีผู้เช่า'
                          : displayRoomListFilter === 'vacant'
                            ? 'ห้องว่าง'
                            : displayRoomListFilter === 'maintenance'
                              ? 'ห้องที่กำลังซ่อม'
                              : 'ห้องทั้งหมด'}
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
