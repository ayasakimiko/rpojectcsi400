import { useEffect, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/RegisterPage.css'

const RENTAL_DATE_FORMAT = "dd/MM/yyyy 'เวลา' HH:mm"

const formatDateTimeLocal = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const getNow = () => new Date()

const addDefaultRentalPeriod = (date) => {
  const next = new Date(date)
  next.setDate(next.getDate() + 7)
  return next
}

const isSameDay = (a, b) => {
  const dateA = new Date(a)
  const dateB = new Date(b)
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

const MOBILE_QUERY = '(max-width: 576px)'

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const handleChange = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}

const initialRegisterForm = {
  idcard: '',
  first_name: '',
  last_name: '',
  phone: '',
  age: '',
  room_number: '',
  rental_start_date: getNow(),
  rental_end_date: addDefaultRentalPeriod(getNow()),
  deposit_amount: '',
  password: '',
  confirmPassword: '',
}

function RegisterMain() {
  const navigate = useNavigate()
  const location = useLocation()
  const preselectedRoomNumber = location.state?.roomNumber
  const isMobile = useIsMobile()
  const [registerForm, setRegisterForm] = useState(initialRegisterForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [availableRooms, setAvailableRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    axios
      .get('/api/rooms/available')
      .then(({ data }) => {
        if (!isMounted) return
        const rooms = data.rooms || []
        setAvailableRooms(rooms)
        if (preselectedRoomNumber && rooms.some((room) => room.room_number === preselectedRoomNumber)) {
          setRegisterForm((prev) => ({ ...prev, room_number: preselectedRoomNumber }))
        }
      })
      .catch(() => {
        if (isMounted) setError('ไม่สามารถโหลดรายการห้องว่างได้ กรุณาลองใหม่อีกครั้ง')
      })
      .finally(() => {
        if (isMounted) setRoomsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const handleRegisterChange = (e) => {
    const { name, value } = e.target
    setRegisterForm((prev) => ({ ...prev, [name]: value }))
  }

  const handlePhoneChange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
    setRegisterForm((prev) => ({ ...prev, phone: digitsOnly }))
  }

  const handleAgeChange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 2)
    setRegisterForm((prev) => ({ ...prev, age: digitsOnly }))
  }

  const handleDepositChange = (e) => {
    const cleaned = e.target.value.replace(/[^\d.]/g, '')
    setRegisterForm((prev) => ({ ...prev, deposit_amount: cleaned }))
  }

  const handleRentalDateChange = (name, date) => {
    setRegisterForm((prev) => {
      const next = { ...prev, [name]: date }
      if (name === 'rental_start_date' && date) {
        next.rental_end_date = addDefaultRentalPeriod(date)
      }
      return next
    })
  }

  const filterEndTime = (time) => {
    const start = registerForm.rental_start_date
    if (!start || !isSameDay(time, start)) return true
    return time.getTime() > new Date(start).getTime()
  }

  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const {
      idcard,
      first_name,
      last_name,
      phone,
      age,
      room_number,
      rental_start_date,
      rental_end_date,
      deposit_amount,
      password,
      confirmPassword,
    } = registerForm

    if (
      !idcard ||
      !first_name ||
      !last_name ||
      !phone ||
      !age ||
      !room_number ||
      !rental_start_date ||
      !rental_end_date ||
      !password ||
      !confirmPassword
    ) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง')
      return
    }

    if (!/^0\d{8,9}$/.test(phone)) {
      setError('เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก')
      return
    }

    if (rental_end_date <= rental_start_date) {
      setError('วันที่สิ้นสุดสัญญาต้องอยู่หลังวันที่เริ่มเช่า')
      return
    }

    if (deposit_amount && (!Number.isFinite(Number(deposit_amount)) || Number(deposit_amount) < 0)) {
      setError('จำนวนเงินมัดจำไม่ถูกต้อง')
      return
    }

    if (password !== confirmPassword) {
      setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }

    try {
      setLoading(true)
      const { data } = await axios.post(
        '/api/auth/register',
        {
          idcard,
          first_name,
          last_name,
          phone,
          age,
          room_number,
          rental_start_date: formatDateTimeLocal(rental_start_date),
          rental_end_date: formatDateTimeLocal(rental_end_date),
          deposit_amount: deposit_amount || undefined,
          password,
        },
        { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } },
      )
      setSuccess(data.message || 'สมัครสมาชิกสำเร็จ')
      setRegisterForm({
        ...initialRegisterForm,
        rental_start_date: getNow(),
        rental_end_date: addDefaultRentalPeriod(getNow()),
      })
      setTimeout(() => navigate('/staff'), 1200)
    } catch (err) {
      setError(err.response?.data?.message || 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-sm-10 col-md-9 col-lg-7 col-xl-6">
            <div className="auth-card">
              <div className="auth-brand">
                <div className="auth-icon">
                  <svg
                    width="26"
                    height="26"
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
                    <path d="M19 8v6" />
                    <path d="M22 11h-6" />
                  </svg>
                </div>
                <h1>ลงทะเบียนลูกค้าใหม่</h1>
                <p>กรอกข้อมูลลูกค้าที่เข้าพักเพื่อสร้างบัญชีและห้องพัก</p>
              </div>

              {error && <div className="alert alert-danger py-2 px-3">{error}</div>}
              {success && <div className="alert alert-success py-2 px-3">{success}</div>}

              <form onSubmit={handleRegisterSubmit} noValidate>
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-firstname">
                      ชื่อจริง
                    </label>
                    <input
                      id="register-firstname"
                      type="text"
                      name="first_name"
                      className="form-control"
                      placeholder="ชื่อจริง"
                      value={registerForm.first_name}
                      onChange={handleRegisterChange}
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-lastname">
                      นามสกุล
                    </label>
                    <input
                      id="register-lastname"
                      type="text"
                      name="last_name"
                      className="form-control"
                      placeholder="นามสกุล"
                      value={registerForm.last_name}
                      onChange={handleRegisterChange}
                      autoComplete="family-name"
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label" htmlFor="register-idcard">
                      เลขบัตรประชาชน
                    </label>
                    <input
                      id="register-idcard"
                      type="text"
                      inputMode="numeric"
                      maxLength={13}
                      name="idcard"
                      className="form-control"
                      placeholder="เลขบัตรประชาชน 13 หลัก"
                      value={registerForm.idcard}
                      onChange={handleRegisterChange}
                      autoComplete="username"
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label" htmlFor="register-room-number">
                      เลขห้อง
                    </label>
                    <select
                      id="register-room-number"
                      name="room_number"
                      className="form-select"
                      value={registerForm.room_number}
                      onChange={handleRegisterChange}
                      disabled={roomsLoading}
                    >
                      <option value="">
                        {roomsLoading ? 'กำลังโหลดห้องว่าง...' : 'เลือกห้องว่าง'}
                      </option>
                      {availableRooms.map((room) => (
                        <option key={room.id} value={room.room_number}>
                          ห้อง {room.room_number}
                        </option>
                      ))}
                    </select>
                    {!roomsLoading && availableRooms.length === 0 && (
                      <div className="form-text text-danger">ขณะนี้ไม่มีห้องว่าง</div>
                    )}
                  </div>

                  <div className="col-12">
                    <label className="form-label" htmlFor="register-deposit">
                      เงินมัดจำ (ถ้ามี)
                    </label>
                    <input
                      id="register-deposit"
                      type="text"
                      inputMode="decimal"
                      name="deposit_amount"
                      className="form-control"
                      placeholder="เว้นว่างไว้หากไม่มีมัดจำ"
                      value={registerForm.deposit_amount}
                      onChange={handleDepositChange}
                    />
                    <div className="form-text">ยอดมัดจำนี้จะถูกหักออกจากค่าเช่าเดือนแรกให้อัตโนมัติ</div>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-rental-start">
                      วันเวลาที่เริ่มเช่า
                    </label>
                    <DatePicker
                      id="register-rental-start"
                      name="rental_start_date"
                      className="form-control"
                      wrapperClassName="w-100"
                      selected={registerForm.rental_start_date}
                      onChange={(date) => handleRentalDateChange('rental_start_date', date)}
                      showTimeSelect
                      timeIntervals={15}
                      timeFormat="HH:mm"
                      timeCaption="เวลา"
                      dateFormat={RENTAL_DATE_FORMAT}
                      autoComplete="off"
                      onChangeRaw={(e) => e.preventDefault()}
                      showIcon
                      toggleCalendarOnIconClick
                      withPortal={isMobile}
                      portalId="rental-date-portal"
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-rental-end">
                      วันเวลาที่สิ้นสุดสัญญา
                    </label>
                    <DatePicker
                      id="register-rental-end"
                      name="rental_end_date"
                      className="form-control"
                      wrapperClassName="w-100"
                      selected={registerForm.rental_end_date}
                      onChange={(date) => handleRentalDateChange('rental_end_date', date)}
                      minDate={registerForm.rental_start_date || getNow()}
                      openToDate={getNow()}
                      filterTime={filterEndTime}
                      showTimeSelect
                      timeIntervals={15}
                      timeFormat="HH:mm"
                      timeCaption="เวลา"
                      dateFormat={RENTAL_DATE_FORMAT}
                      autoComplete="off"
                      onChangeRaw={(e) => e.preventDefault()}
                      showIcon
                      toggleCalendarOnIconClick
                      withPortal={isMobile}
                      portalId="rental-date-portal"
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-phone">
                      เบอร์โทรศัพท์
                    </label>
                    <input
                      id="register-phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      name="phone"
                      className="form-control"
                      placeholder="เบอร์โทรศัพท์ เช่น 0812345678"
                      value={registerForm.phone}
                      onChange={handlePhoneChange}
                      autoComplete="tel"
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-age">
                      อายุ
                    </label>
                    <input
                      id="register-age"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={99}
                      name="age"
                      className="form-control"
                      placeholder="อายุ"
                      value={registerForm.age}
                      onChange={handleAgeChange}
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-password">
                      รหัสผ่าน
                    </label>
                    <input
                      id="register-password"
                      type="password"
                      name="password"
                      className="form-control"
                      placeholder="กรอกรหัสผ่าน"
                      value={registerForm.password}
                      onChange={handleRegisterChange}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-confirm-password">
                      ยืนยันรหัสผ่าน
                    </label>
                    <input
                      id="register-confirm-password"
                      type="password"
                      name="confirmPassword"
                      className="form-control"
                      placeholder="ยืนยันรหัสผ่าน"
                      value={registerForm.confirmPassword}
                      onChange={handleRegisterChange}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <button type="submit" className="auth-submit-btn" disabled={loading}>
                  {loading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนลูกค้า'}
                </button>
                <button
                  type="button"
                  className="auth-secondary-btn"
                  disabled={loading}
                  onClick={() => navigate(-1)}
                >
                  ยกเลิก
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RegisterMain
