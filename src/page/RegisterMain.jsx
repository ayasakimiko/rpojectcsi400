import { useEffect, useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/RegisterPage.css'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'
import compressImageFile, { validateImageFile } from '../utils/compressImageFile.js'
import { ContractImagePicker } from '../components/RentalContract.jsx'
import {
  addContractMonths,
  CONTRACT_DURATION_OPTIONS,
  CONTRACT_MAX_IMAGES,
  CONTRACT_MIN_IMAGES,
  DEPOSIT_MONTHS,
  firstMonthBreakdown,
  formatContractDate,
  formatContractMoney,
} from '../utils/rentalContract.js'

const formatDateTimeLocal = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const getNow = () => new Date()

const SECTION_ICONS = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M10 21v-6h4v6" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
}

function RegisterIcon({ type, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SECTION_ICONS[type]}
    </svg>
  )
}

function RegisterSection({ step, icon, title, hint, children }) {
  return (
    <section className="register-section">
      <header className="register-section-head">
        <span className="register-section-icon"><RegisterIcon type={icon} /></span>
        <div>
          <small>ขั้นตอนที่ {step}</small>
          <strong>{title}</strong>
          {hint && <span>{hint}</span>}
        </div>
      </header>
      <div className="row g-3">{children}</div>
    </section>
  )
}

const Required = () => <span className="register-required" aria-hidden="true">*</span>

const dataUrlToFile = async (dataUrl, name) => {
  const blob = await (await fetch(dataUrl)).blob()
  const baseName = String(name || 'contract').replace(/\.[^.]+$/, '') || 'contract'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
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
  contract_duration_months: '',
  deposit_months: DEPOSIT_MONTHS,
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
  const [contractImages, setContractImages] = useState([])
  const [contractImageError, setContractImageError] = useState('')
  const selectedRoom = availableRooms.find((room) => String(room.room_number) === String(registerForm.room_number))
  const selectedRoomPrice = selectedRoom ? Number(selectedRoom.price) : null
  const contractEndDate =
    registerForm.rental_start_date && registerForm.contract_duration_months
      ? addContractMonths(registerForm.rental_start_date, registerForm.contract_duration_months)
      : null
  const firstMonth = selectedRoomPrice !== null ? firstMonthBreakdown(selectedRoomPrice, registerForm.deposit_months) : null

  const handleContractImagesChange = (files) => {
    const invalid = files.map(validateImageFile).find(Boolean)
    if (invalid) {
      setContractImageError(invalid)
      return
    }
    if (files.length > CONTRACT_MAX_IMAGES) {
      setContractImageError(`แนบรูปสัญญาได้ไม่เกิน ${CONTRACT_MAX_IMAGES} รูป`)
      return
    }
    setContractImageError('')
    setContractImages(files)
  }

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

  const handleRoomChange = (e) => {
    setRegisterForm((prev) => ({ ...prev, room_number: e.target.value }))
  }

  const handleRentalStartChange = (date) => {
    setRegisterForm((prev) => ({ ...prev, rental_start_date: date }))
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
      contract_duration_months,
      deposit_months,
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
      !contract_duration_months ||
      !password ||
      !confirmPassword
    ) {
      setError(contract_duration_months ? 'กรุณากรอกข้อมูลให้ครบทุกช่อง' : 'กรุณาเลือกระยะเวลาสัญญาเช่า')
      return
    }

    if (!/^0\d{8,9}$/.test(phone)) {
      setError('เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก')
      return
    }

    if (contractImages.length < CONTRACT_MIN_IMAGES) {
      const message = `กรุณาแนบรูปสัญญาเช่าอย่างน้อย ${CONTRACT_MIN_IMAGES} รูป (แนบแล้ว ${contractImages.length} รูป)`
      setContractImageError(message)
      setError(message)
      return
    }

    if (Number(deposit_months) !== DEPOSIT_MONTHS) {
      setError(`เงินมัดจำต้องเป็น ${DEPOSIT_MONTHS} เดือน`)
      return
    }

    if (password !== confirmPassword) {
      setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }

    try {
      setLoading(true)
      const payload = new FormData()
      Object.entries({
        idcard,
        first_name,
        last_name,
        phone,
        age,
        room_number,
        rental_start_date: formatDateTimeLocal(rental_start_date),
        contract_duration_months,
        deposit_months,
        password,
      }).forEach(([key, value]) => {
        if (value !== '' && value !== undefined && value !== null) payload.append(key, value)
      })
      const compressed = await Promise.all(contractImages.map((file) => compressImageFile(file)))
      const files = await Promise.all(compressed.map(({ name, dataUrl }) => dataUrlToFile(dataUrl, name)))
      files.forEach((file) => payload.append('contract_images', file))
      const { data } = await axios.post('/api/auth/register', payload, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      setSuccess(data.message || 'สมัครสมาชิกสำเร็จ')
      setRegisterForm({ ...initialRegisterForm, rental_start_date: getNow() })
      setContractImages([])
      setTimeout(() => navigate('/staff'), 1200)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page register-page">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-10 col-xl-9">
            <div className="auth-card register-card">
              <div className="register-head">
                <button type="button" className="register-back" onClick={() => navigate(-1)} disabled={loading}>
                  <RegisterIcon type="back" size={16} />
                  <span>กลับ</span>
                </button>
                <div className="register-head-main">
                  <span className="register-head-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M19 8v6" />
                      <path d="M22 11h-6" />
                    </svg>
                  </span>
                  <div className="register-head-text">
                    <h1>ลงทะเบียนลูกค้าใหม่</h1>
                    <p>กรอก 4 ขั้นตอน · ช่องที่มี <Required /> ต้องกรอก</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleRegisterSubmit} noValidate className="register-form">
                <RegisterSection step={1} icon="user" title="ข้อมูลผู้เช่า" hint="ชื่อ เลขบัตรประชาชน และช่องทางติดต่อ">
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-firstname">
                      ชื่อจริง <Required />
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
                      นามสกุล <Required />
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

                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-idcard">
                      เลขบัตรประชาชน <Required />
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
                    <div className="form-text">ใช้เป็นชื่อผู้ใช้สำหรับเข้าสู่ระบบ</div>
                  </div>
                  <div className="col-7 col-md-3">
                    <label className="form-label" htmlFor="register-phone">
                      เบอร์โทรศัพท์ <Required />
                    </label>
                    <input
                      id="register-phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      name="phone"
                      className="form-control"
                      placeholder="0812345678"
                      value={registerForm.phone}
                      onChange={handlePhoneChange}
                      autoComplete="tel"
                    />
                  </div>
                  <div className="col-5 col-md-3">
                    <label className="form-label" htmlFor="register-age">
                      อายุ <Required />
                    </label>
                    <input
                      id="register-age"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={99}
                      name="age"
                      className="form-control"
                      placeholder="ปี"
                      value={registerForm.age}
                      onChange={handleAgeChange}
                    />
                  </div>
                </RegisterSection>

                <RegisterSection step={2} icon="home" title="ห้องพักและสัญญาเช่า" hint="ราคาห้องดึงจากข้อมูลห้องจริง วันสิ้นสุดคำนวณให้อัตโนมัติ">
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-room-number">
                      ห้องพัก <Required />
                    </label>
                    <select
                      id="register-room-number"
                      name="room_number"
                      className="form-select"
                      value={registerForm.room_number}
                      onChange={handleRoomChange}
                      disabled={roomsLoading}
                    >
                      <option value="">
                        {roomsLoading ? 'กำลังโหลดห้องว่าง...' : 'เลือกห้องว่าง'}
                      </option>
                      {availableRooms.map((room) => (
                        <option key={room.id} value={room.room_number}>
                          ห้อง {room.room_number} · {formatContractMoney(room.price)}/เดือน
                        </option>
                      ))}
                    </select>
                    {!roomsLoading && availableRooms.length === 0 && (
                      <div className="form-text text-danger">ขณะนี้ไม่มีห้องว่าง</div>
                    )}
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-deposit">
                      เงินมัดจำ <Required />
                    </label>
                    <input
                      id="register-deposit"
                      type="text"
                      name="deposit_months"
                      className="form-control"
                      value={`${DEPOSIT_MONTHS} เดือน${selectedRoomPrice !== null ? ` · ${formatContractMoney(selectedRoomPrice * DEPOSIT_MONTHS)}` : ''}`}
                      readOnly
                      required
                    />
                    <div className="form-text">
                      {selectedRoom
                        ? `มัดจำ ${DEPOSIT_MONTHS} เดือนทุกสัญญา · ชำระพร้อมค่าห้องเดือนแรก`
                        : `มัดจำ ${DEPOSIT_MONTHS} เดือนของราคาห้อง · เลือกห้องเพื่อดูยอด`}
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-contract-duration">
                      ระยะเวลาสัญญาเช่า <Required />
                    </label>
                    <select
                      id="register-contract-duration"
                      name="contract_duration_months"
                      className="form-select"
                      value={registerForm.contract_duration_months}
                      onChange={handleRegisterChange}
                    >
                      <option value="">เลือกระยะเวลาสัญญา</option>
                      {CONTRACT_DURATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-rental-start">
                      วันเวลาที่เริ่มเช่า <Required />
                    </label>
                    <ThaiDatePicker
                      id="register-rental-start"
                      name="rental_start_date"
                      valueType="date"
                      placeholder="เลือกวันเวลา"
                      value={registerForm.rental_start_date}
                      onChange={handleRentalStartChange}
                      showTimeSelect
                      timeIntervals={15}
                      withPortal={isMobile}
                      portalId="rental-date-portal"
                    />
                  </div>

                  <div className="col-12">
                    <div className="register-contract-summary">
                      <div className="rcs-date">
                        <span className="rcs-date-icon" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="5" width="18" height="16" rx="3" />
                            <path d="M16 3v4M8 3v4M3 11h18" />
                          </svg>
                        </span>
                        <div>
                          <span>สิ้นสุดสัญญา</span>
                          <strong className={contractEndDate ? '' : 'is-empty'}>
                            {contractEndDate ? formatContractDate(contractEndDate, true) : 'เลือกระยะสัญญา'}
                          </strong>
                        </div>
                      </div>
                      <div className="rcs-calc">
                        <div className="rcs-item">
                          <span>ค่าห้อง</span>
                          <strong>{firstMonth ? formatContractMoney(firstMonth.price) : '-'}</strong>
                        </div>
                        <span className="rcs-op" aria-hidden="true">+</span>
                        <div className="rcs-item">
                          <span>มัดจำ{firstMonth?.depositMonths ? ` ${firstMonth.depositMonths} เดือน` : ''}</span>
                          <strong>{firstMonth ? formatContractMoney(firstMonth.deposit) : '-'}</strong>
                        </div>
                        <span className="rcs-op" aria-hidden="true">=</span>
                        <div className="rcs-item is-total">
                          <span>เดือนแรก</span>
                          <strong>{firstMonth ? formatContractMoney(firstMonth.total) : '-'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                </RegisterSection>

                <RegisterSection
                  step={3}
                  icon="image"
                  title={<>รูปสัญญาเช่า <Required /></>}
                  hint="ถ่ายสัญญาทุกหน้าให้อ่านออกชัดเจน"
                >
                  <div className="col-12">
                    <ContractImagePicker files={contractImages} onChange={handleContractImagesChange} error={contractImageError} />
                  </div>
                </RegisterSection>

                <RegisterSection step={4} icon="lock" title="บัญชีเข้าใช้งาน" hint="ผู้เช่าใช้เลขบัตรประชาชนหรือเลขห้องคู่กับรหัสผ่านนี้เข้าสู่ระบบ">
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-password">
                      รหัสผ่าน <Required />
                    </label>
                    <input
                      id="register-password"
                      type="password"
                      name="password"
                      className="form-control"
                      placeholder="อย่างน้อย 6 ตัวอักษร"
                      value={registerForm.password}
                      onChange={handleRegisterChange}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-confirm-password">
                      ยืนยันรหัสผ่าน <Required />
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
                    {registerForm.confirmPassword && registerForm.password !== registerForm.confirmPassword && (
                      <div className="form-text text-danger">รหัสผ่านไม่ตรงกัน</div>
                    )}
                  </div>
                </RegisterSection>

                <div className="register-actions">
                  {(error || success) && (
                    <div className={`auth-alert ${success ? 'is-success' : ''}`} role={error ? 'alert' : 'status'}>
                      <span className="auth-alert-icon"><RegisterIcon type={success ? 'check' : 'alert'} size={18} /></span>
                      <span>{success || error}</span>
                    </div>
                  )}
                  <div className="register-actions-row">
                    <div className="register-actions-meta">
                      {selectedRoom ? (
                        <>
                          <span>ห้อง {selectedRoom.room_number}{registerForm.contract_duration_months ? ` · ${registerForm.contract_duration_months} เดือน` : ''}</span>
                          <strong>เดือนแรก {firstMonth ? formatContractMoney(firstMonth.total) : '-'} · ถัดไป {firstMonth ? formatContractMoney(firstMonth.price) : '-'}/เดือน</strong>
                        </>
                      ) : (
                        <span>ยังไม่ได้เลือกห้อง</span>
                      )}
                    </div>
                    <button type="button" className="auth-secondary-btn register-cancel" disabled={loading} onClick={() => navigate(-1)}>
                      ยกเลิก
                    </button>
                    <button type="submit" className="auth-submit-btn register-submit" disabled={loading}>
                      {loading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนลูกค้า'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RegisterMain
