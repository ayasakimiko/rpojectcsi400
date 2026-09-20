import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import DatePicker, { registerLocale } from 'react-datepicker'
import { th } from 'date-fns/locale/th'
import 'react-datepicker/dist/react-datepicker.css'
import './css/OwnerPage.css'

registerLocale('th', th)

const EMPTY_EXPENSE = {
  category: 'maintenance',
  description: '',
  amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
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
  const [overview, setOverview] = useState({ rooms: {}, finance: {} })
  const [roomStatus, setRoomStatus] = useState({ totalRooms: 0, vacantCount: 0, occupiedCount: 0, vacantRooms: [], rooms: [] })
  const [incomeSummary, setIncomeSummary] = useState({ totalIncome: 0, byType: [] })
  const [expenses, setExpenses] = useState({ expenses: [], total: 0, totalAmount: 0, page: 1, pageSize: 10 })
  const [staffList, setStaffList] = useState([])
  const [paymentLogs, setPaymentLogs] = useState({ payments: [], total: 0, page: 1, pageSize: 20 })
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE)
  const [expenseFilter, setExpenseFilter] = useState({ from: '', to: '' })
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF)
  const [paymentFilter, setPaymentFilter] = useState({ search: '', date: '', from: '', to: '' })
  const [notice, setNotice] = useState({ type: '', message: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [staffErrors, setStaffErrors] = useState({})
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const today = new Date()
    return { month: today.getMonth() + 1, year: today.getFullYear() }
  })
  const [roomDetail, setRoomDetail] = useState(null)
  const [isRoomDetailLoading, setIsRoomDetailLoading] = useState(false)

  const totalIncome = Number(overview?.finance?.totalIncome ?? incomeSummary?.totalIncome ?? 0)
  const totalExpense = Number(overview?.finance?.totalExpense ?? 0)
  const netProfit = Number(overview?.finance?.netProfit ?? totalIncome - totalExpense)

  const statCards = useMemo(
    () => [
      {
        label: 'ห้องทั้งหมด',
        value: overview?.rooms?.totalRooms ?? roomStatus?.totalRooms ?? 0,
        subtitle: `${roomStatus?.occupiedCount ?? 0} ทราบว่าใช้งาน / ${roomStatus?.vacantCount ?? 0} ว่าง`,
        tone: 'blue',
      },
      {
        label: 'รายได้รวม',
        value: formatSignedCurrency(totalIncome),
        subtitle: 'ตามรายการจ่ายชำระที่สำเร็จ',
        tone: 'green',
      },
      {
        label: 'ค่าใช้จ่าย',
        value: formatSignedCurrency(totalExpense),
        subtitle: 'ค่าใช้จ่ายทั้งหมดของหอพัก',
        tone: 'orange',
      },
      {
        label: 'กำไรสุทธิ',
        value: formatSignedCurrency(netProfit),
        subtitle: 'รายได้ - ค่าใช้จ่าย',
        tone: netProfit < 0 ? 'red' : 'green',
      },
    ],
    [overview, roomStatus, totalExpense, totalIncome, netProfit],
  )

  const setMessage = (type, message) => {
    setNotice({ type, message })
    window.setTimeout(() => {
      setNotice((prev) => (prev.message === message ? { type: '', message: '' } : prev))
    }, 3500)
  }

  const loadOverview = async (overrides = {}) => {
    const period = { ...selectedPeriod, ...overrides }
    const { data } = await axios.get('/api/owner/overview', { headers: getAuthHeaders(), params: period })
    setOverview(data)
  }

  const loadRoomStatus = async () => {
    const { data } = await axios.get('/api/owner/rooms/status', { headers: getAuthHeaders() })
    setRoomStatus(data)
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
        date: nextFilters.date || undefined,
      },
    })
    setIncomeSummary(data)
  }

  const loadExpenses = async (page = expenses.page || 1, overrides = {}) => {
    const nextFilters = { ...expenseFilter, ...overrides }
    const { data } = await axios.get('/api/owner/expenses', {
      headers: getAuthHeaders(),
      params: {
        page,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
      },
    })
    setExpenses(data)
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
        date: nextFilters.date || undefined,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
        search: nextFilters.search || undefined,
      },
    })
    setPaymentLogs(data)
  }

  const handlePeriodChange = async (field, value) => {
    const nextPeriod = { ...selectedPeriod, [field]: Number(value) }
    setSelectedPeriod(nextPeriod)
    try {
      await Promise.all([loadOverview(nextPeriod), loadIncome(nextPeriod)])
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถเปลี่ยนช่วงเวลาได้')
    }
  }

  const handleRoomClick = async (room) => {
    setRoomDetail({ room, tenant: null, payments: [] })
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
        await Promise.all([loadOverview(), loadRoomStatus(), loadIncome(), loadExpenses(1), loadStaff(), loadPaymentLogs(1)])
      } catch (error) {
        const message = error.response?.data?.message || 'ไม่สามารถโหลดข้อมูลหอพักได้'
        setMessage('danger', message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAll()
  }, [])

  const handleExpenseFilterChange = async (field, value) => {
    const nextFilters = { ...expenseFilter, [field]: value }
    setExpenseFilter(nextFilters)
    try {
      await loadExpenses(1, nextFilters)
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลรายจ่ายได้')
    }
  }

  const handlePaymentFilterChange = async (field, value) => {
    const nextFilters = { ...paymentFilter, [field]: value }
    setPaymentFilter(nextFilters)
    try {
      await loadPaymentLogs(1, nextFilters)
      if (field !== 'search') await loadIncome(nextFilters)
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลการเงินได้')
    }
  }

  const handleExpenseSubmit = async (event) => {
    event.preventDefault()
    setIsSubmittingExpense(true)
    try {
      if (editingExpenseId) {
        await axios.put(`/api/owner/expenses/${editingExpenseId}`, expenseForm, { headers: getAuthHeaders() })
        setMessage('success', 'แก้ไขรายการรายจ่ายสำเร็จ')
      } else {
        await axios.post('/api/owner/expenses', expenseForm, { headers: getAuthHeaders() })
        setMessage('success', 'บันทึกรายจ่ายสำเร็จ')
      }

      setExpenseForm(EMPTY_EXPENSE)
      setEditingExpenseId(null)
      await Promise.all([loadOverview(), loadIncome(), loadExpenses(1), loadPaymentLogs(1)])
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถบันทึกรายจ่ายได้')
    } finally {
      setIsSubmittingExpense(false)
    }
  }

  const handleExpenseEdit = (expense) => {
    setEditingExpenseId(expense.id)
    setExpenseForm({
      category: expense.category || 'maintenance',
      description: expense.description || '',
      amount: expense.amount || '',
      expense_date: expense.expense_date ? new Date(expense.expense_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    })
  }

  const handleExpenseDelete = async (id) => {
    if (!window.confirm('ต้องการลบรายการรายจ่ายนี้หรือไม่')) return
    try {
      await axios.delete(`/api/owner/expenses/${id}`, { headers: getAuthHeaders() })
      setMessage('success', 'ลบรายการรายจ่ายสำเร็จ')
      await Promise.all([loadOverview(), loadIncome(), loadExpenses(1), loadPaymentLogs(1)])
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถลบรายการรายจ่ายได้')
    }
  }

  const validateStaffForm = () => {
    const errors = {}
    if (!/^\d{13}$/.test(staffForm.idcard.trim())) errors.idcard = 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'
    if (!/^0\d{8,9}$/.test(staffForm.phone.trim())) errors.phone = 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก'
    if (staffForm.password.length < 6) errors.password = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
    if (!staffForm.age || Number(staffForm.age) < 1 || Number(staffForm.age) > 120) errors.age = 'กรุณาระบุอายุ 1-120 ปี'
    setStaffErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleStaffSubmit = async (event) => {
    event.preventDefault()
    if (!validateStaffForm()) return
    setIsSubmittingStaff(true)
    try {
      await axios.post('/api/owner/staff', staffForm, { headers: getAuthHeaders() })
      setStaffForm(EMPTY_STAFF)
      setStaffErrors({})
      setMessage('success', 'เพิ่มพนักงานสำเร็จ')
      await loadStaff()
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถเพิ่มพนักงานได้')
    } finally {
      setIsSubmittingStaff(false)
    }
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

  const activeExpensePage = Number(expenses.page || 1)
  const totalExpensePages = Math.max(1, Math.ceil((Number(expenses.total) || 0) / (Number(expenses.pageSize) || 10)))
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
            <span>เลือกเดือนและปีเพื่อปรับยอดรายรับ รายจ่าย และกำไรสุทธิ</span>
          </div>
          <div className="owner-period-fields">
            <label>
              เดือน
              <select value={selectedPeriod.month} onChange={(event) => handlePeriodChange('month', event.target.value)}>
                {['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'].map((month, index) => (
                  <option key={month} value={index + 1}>{month}</option>
                ))}
              </select>
            </label>
            <label>
              ปี
              <select value={selectedPeriod.year} onChange={(event) => handlePeriodChange('year', event.target.value)}>
                {[selectedPeriod.year - 1, selectedPeriod.year, selectedPeriod.year + 1].map((year) => (
                  <option key={year} value={year}>{year + 543}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {notice.message && (
          <div className={`owner-alert owner-alert-${notice.type}`}>{notice.message}</div>
        )}

        {isLoading ? (
          <div className="owner-loading-box">กำลังโหลดข้อมูล...</div>
        ) : (
          <>
            <section className="owner-card-grid">
              {statCards.map((card) => (
                <article key={card.label} className={`owner-stat-card ${card.tone}`}>
                  <div className="owner-stat-header">
                    <span>{card.label}</span>
                    <span className="owner-stat-badge">•</span>
                  </div>
                  <h2>{card.value}</h2>
                  <p>{card.subtitle}</p>
                </article>
              ))}
            </section>

            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>ภาพรวมห้องพัก</h3>
              </div>
              <div className="owner-room-grid">
                <div className="owner-room-total">
                  <div className="owner-room-ring">
                    <span>{Math.round((overview?.rooms?.occupancyRate || roomStatus?.totalRooms ? (roomStatus?.occupiedCount || 0) / Math.max(1, roomStatus?.totalRooms || 0) : 0) * 100)}%</span>
                  </div>
                  <div>
                    <h4>อัตราการใช้ห้อง</h4>
                    <p>{roomStatus?.occupiedCount ?? 0} ห้องใช้งาน / {roomStatus?.totalRooms ?? 0} ห้องทั้งหมด</p>
                  </div>
                </div>

                <div className="owner-room-list">
                  {roomStatus.rooms?.length ? (
                    roomStatus.rooms.map((room) => {
                      const statusLabels = { vacant: 'ว่าง', occupied: 'มีผู้เช่า', overdue: 'ค้างชำระ', maintenance: 'ซ่อมบำรุง' }
                      return (
                        <button
                          key={room.room_number}
                          type="button"
                          className={`owner-room-pill room-${room.status}`}
                          onClick={() => handleRoomClick(room)}
                        >
                          <span>ห้อง {room.room_number}</span>
                          <strong>{statusLabels[room.status] || 'มีผู้เช่า'}</strong>
                        </button>
                      )
                    })
                  ) : (
                    <div className="owner-empty">ไม่มีห้องว่างในระบบ</div>
                  )}
                </div>
              </div>
              <div className="owner-room-legend" aria-label="คำอธิบายสถานะห้อง">
                <span><i className="room-dot vacant" />ว่าง</span>
                <span><i className="room-dot occupied" />มีผู้เช่า</span>
                <span><i className="room-dot overdue" />ค้างชำระ</span>
                <span><i className="room-dot maintenance" />ซ่อมบำรุง</span>
              </div>
              <div className="owner-room-status-summary">
                <div className="owner-room-status-card occupied">
                  <span className="owner-room-status-icon" aria-hidden="true" />
                  <div>
                    <strong>{roomStatus?.occupiedCount ?? 0} ห้อง</strong>
                    <span>มีผู้เช่า</span>
                  </div>
                </div>
                <div className="owner-room-status-card vacant">
                  <span className="owner-room-status-icon" aria-hidden="true" />
                  <div>
                    <strong>{roomStatus?.vacantCount ?? 0} ห้อง</strong>
                    <span>ห้องว่าง</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="owner-shell-grid">
              <div className="owner-panel">
                <div className="owner-panel-header">
                  <h3>รายรับตามประเภท</h3>
                </div>
                <div className="owner-summary-list">
                  {incomeSummary.byType?.length ? (
                    incomeSummary.byType.map((item) => (
                      <div key={item.type} className="owner-summary-item">
                        <div>
                          <span className="owner-summary-label">{item.type || 'ไม่ระบุ'}</span>
                          <small>{item.count || 0} รายการ</small>
                        </div>
                        <strong>฿{formatCurrency(item.total)}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="owner-empty">ยังไม่มีข้อมูลรายรับ</div>
                  )}
                </div>
              </div>

              <div className="owner-panel">
                <div className="owner-panel-header">
                  <h3>ค่าใช้จ่ายล่าสุด</h3>
                </div>
                <div className="owner-summary-list">
                  {expenses.expenses?.length ? (
                    expenses.expenses.slice(0, 5).map((item) => (
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
              </div>
            </section>

            <section className="owner-shell-grid owner-two-col">
              <div className="owner-panel">
                <div className="owner-panel-header">
                  <h3>บันทึกค่าใช้จ่าย</h3>
                </div>
                <form onSubmit={handleExpenseSubmit} className="owner-form-group">
                  <div className="owner-form-row">
                    <label>
                      หมวดหมู่
                      <select
                        value={expenseForm.category}
                        onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                      >
                        <option value="maintenance">ซ่อมบำรุง</option>
                        <option value="utilities">ค่าใช้จ่ายทั่วไป</option>
                        <option value="salary">เงินเดือน / บุคลากร</option>
                        <option value="marketing">การตลาด</option>
                        <option value="other">อื่น ๆ</option>
                      </select>
                    </label>
                    <label>
                      วันที่
                      <ThaiDatePicker
                        value={expenseForm.expense_date}
                        onChange={(value) => setExpenseForm((prev) => ({ ...prev, expense_date: value }))}
                      />
                    </label>
                  </div>

                  <label>
                    รายละเอียด
                    <input
                      type="text"
                      value={expenseForm.description}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="เช่น ซ่อมประตูห้อง 101"
                    />
                  </label>

                  <label>
                    จำนวนเงิน
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                      placeholder="0.00"
                    />
                  </label>

                  <div className="owner-form-actions">
                    <button type="submit" className="owner-primary-btn" disabled={isSubmittingExpense}>
                      {isSubmittingExpense ? 'กำลังบันทึก...' : editingExpenseId ? 'บันทึกการแก้ไข' : 'เพิ่มรายจ่าย'}
                    </button>
                    {editingExpenseId && (
                      <button
                        type="button"
                        className="owner-secondary-btn"
                        onClick={() => {
                          setEditingExpenseId(null)
                          setExpenseForm(EMPTY_EXPENSE)
                        }}
                      >
                        ยกเลิก
                      </button>
                    )}
                  </div>
                </form>

                <div className="owner-filter-box">
                  <div className="owner-filter-help">
                    เลือกวันที่เพื่อกรองรายการค่าใช้จ่าย: <strong>จาก</strong> และ <strong>ถึง</strong> เป็นช่วงเวลา, ถ้าต้องการดูวันเดียวให้เลือกวันที่เดียวในช่อง <strong>จาก</strong> หรือ <strong>ถึง</strong> เท่ากัน
                  </div>
                  <div className="owner-filter-row">
                    <label className="owner-date-field">
                      จาก
                      <ThaiDatePicker value={expenseFilter.from} onChange={(value) => handleExpenseFilterChange('from', value)} />
                    </label>
                    <label className="owner-date-field">
                      ถึง
                      <ThaiDatePicker value={expenseFilter.to} onChange={(value) => handleExpenseFilterChange('to', value)} />
                    </label>
                  </div>
                </div>

                <div className="owner-table-wrap">
                  <table className="owner-table">
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th>หมวดหมู่</th>
                        <th>รายละเอียด</th>
                        <th>จำนวน</th>
                        <th>ผู้บันทึก</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.expenses?.length ? (
                        expenses.expenses.map((expense) => (
                          <tr key={expense.id}>
                            <td>{formatDate(expense.expense_date)}</td>
                            <td>{expense.category}</td>
                            <td>{expense.description || '-'}</td>
                            <td>฿{formatCurrency(expense.amount)}</td>
                            <td>{expense.recorded_by_name || '-'}</td>
                            <td>
                              <div className="owner-inline-actions">
                                <button type="button" className="owner-action-btn update" onClick={() => handleExpenseEdit(expense)}>
                                  แก้ไข
                                </button>
                                <button type="button" className="owner-action-btn delete" onClick={() => handleExpenseDelete(expense.id)}>
                                  ลบ
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="owner-empty-row">
                            ไม่มีรายการรายจ่าย
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="owner-pagination">
                  <button type="button" disabled={activeExpensePage <= 1} onClick={() => loadExpenses(activeExpensePage - 1)}>
                    ก่อนหน้า
                  </button>
                  <span>
                    หน้า {activeExpensePage}/{totalExpensePages}
                  </span>
                  <button type="button" disabled={activeExpensePage >= totalExpensePages} onClick={() => loadExpenses(activeExpensePage + 1)}>
                    ถัดไป
                  </button>
                </div>
              </div>

              <div className="owner-panel owner-staff-panel">
                <div className="owner-panel-header">
                  <h3>จัดการพนักงาน</h3>
                </div>

                <form onSubmit={handleStaffSubmit} className="owner-staff-form">
                  <div className="owner-form-row">
                    <label>
                      ตำแหน่ง
                      <select
                        value={staffForm.role}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, role: event.target.value }))}
                      >
                        <option value="Staff">พนักงาน</option>
                        <option value="Admin">ผู้ดูแลระบบ</option>
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
                    รหัสผ่าน
                    <span className="owner-password-field">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={staffForm.password}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="อย่างน้อย 6 ตัว"
                      />
                      <button type="button" className="owner-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                        <span className={`owner-password-icon ${showPassword ? 'is-visible' : ''}`} aria-hidden="true" />
                      </button>
                    </span>
                    {staffErrors.password && <span className="owner-field-error">{staffErrors.password}</span>}
                  </label>

                  <div className="owner-form-actions">
                    <button type="submit" className="owner-primary-btn" disabled={isSubmittingStaff}>
                      {isSubmittingStaff ? 'กำลังเพิ่ม...' : 'เพิ่มพนักงาน'}
                    </button>
                  </div>
                </form>

                <div className="owner-table-wrap">
                  <table className="owner-table">
                    <thead>
                      <tr>
                        <th>ชื่อ-นามสกุล</th>
                        <th>ตำแหน่ง</th>
                        <th>เบอร์</th>
                        <th>สถานะ</th>
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
                            <td>
                              <span className={`owner-status-badge ${member.is_suspended ? 'disabled' : 'active'}`}>
                                {member.is_suspended ? 'ระงับใช้งาน' : 'ใช้งานปกติ'}
                              </span>
                            </td>
                            <td>
                              <div className="owner-inline-actions">
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
              </div>
            </section>

            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>บันทึกการชำระเงิน</h3>
              </div>

              <div className="owner-filter-box">
                <div className="owner-filter-help">
                  <strong>วันที่</strong> = ดูรายการในวันเดียว, <strong>จาก</strong> และ <strong>ถึง</strong> = ดูช่วงเวลา, <strong>ค้นหา</strong> = ค้นหาห้อง / ลูกค้า / หมายเหตุ
                </div>
                <div className="owner-filter-row">
                  <label className="owner-date-field">
                    วันที่
                    <ThaiDatePicker value={paymentFilter.date} onChange={(value) => handlePaymentFilterChange('date', value)} />
                  </label>
                  <label className="owner-date-field">
                    จาก
                    <ThaiDatePicker value={paymentFilter.from} onChange={(value) => handlePaymentFilterChange('from', value)} />
                  </label>
                  <label className="owner-date-field">
                    ถึง
                    <ThaiDatePicker value={paymentFilter.to} onChange={(value) => handlePaymentFilterChange('to', value)} />
                  </label>
                  <label className="owner-search-box">
                    ค้นหา
                    <input
                      type="text"
                      value={paymentFilter.search}
                      onChange={(event) => handlePaymentFilterChange('search', event.target.value)}
                      placeholder="ค้นหาห้อง / ลูกค้า / หมายเหตุ"
                    />
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
                      <th>สถานะ</th>
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
                          <td>{payment.type || '-'}</td>
                          <td>฿{formatCurrency(payment.amount)}</td>
                          <td>
                            <span className={`owner-status-badge ${payment.status === 'paid' ? 'active' : 'disabled'}`}>
                              {payment.status === 'paid' ? 'ชำระแล้ว' : payment.status}
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
                    <button type="button" className="owner-modal-close" onClick={() => setRoomDetail(null)} aria-label="ปิดรายละเอียด">×</button>
                  </div>
                  {isRoomDetailLoading ? (
                    <div className="owner-loading-box">กำลังโหลดรายละเอียดห้อง...</div>
                  ) : (
                    <>
                      <div className="owner-detail-grid">
                        <div><span>ผู้เช่า</span><strong>{roomDetail.tenant ? `${roomDetail.tenant.first_name} ${roomDetail.tenant.last_name}` : 'ห้องว่าง'}</strong></div>
                        <div><span>เบอร์โทรศัพท์</span><strong>{roomDetail.tenant?.phone || '-'}</strong></div>
                        <div><span>วันเริ่มสัญญา</span><strong>{formatDate(roomDetail.room.rental_start_date)}</strong></div>
                        <div><span>วันสิ้นสุดสัญญา</span><strong>{formatDate(roomDetail.room.rental_end_date)}</strong></div>
                        <div><span>ค่าเช่ารายเดือน</span><strong>฿{formatCurrency(roomDetail.room.price)}</strong></div>
                        <div><span>มัดจำ</span><strong>฿{formatCurrency(roomDetail.tenant?.deposit_amount)}</strong></div>
                      </div>
                      {!roomDetail.tenant && (
                        <button type="button" className="owner-primary-btn" onClick={() => navigate('/register')}>เพิ่มผู้เช่า</button>
                      )}
                      <h4 className="owner-modal-subtitle">ประวัติการชำระเงิน</h4>
                      {roomDetail.payments?.length ? (
                        <div className="owner-payment-history">
                          {roomDetail.payments.slice(0, 8).map((payment) => (
                            <div key={payment.id}>
                              <span>{formatDate(payment.payment_date)} · {payment.type || 'ไม่ระบุ'}</span>
                              <strong>฿{formatCurrency(payment.amount)}</strong>
                            </div>
                          ))}
                        </div>
                      ) : <div className="owner-empty">ยังไม่มีประวัติการชำระเงิน</div>}
                    </>
                  )}
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
