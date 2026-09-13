import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/RegisterPage.css'

const initialRegisterForm = {
  idcard: '',
  first_name: '',
  last_name: '',
  phone: '',
  age: '',
  room_number: '',
  password: '',
  confirmPassword: '',
}

function RegisterMain() {
  const navigate = useNavigate()
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
        if (isMounted) setAvailableRooms(data.rooms || [])
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

  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const { idcard, first_name, last_name, phone, age, room_number, password, confirmPassword } = registerForm

    if (!idcard || !first_name || !last_name || !phone || !age || !room_number || !password || !confirmPassword) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง')
      return
    }

    if (password !== confirmPassword) {
      setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }

    try {
      setLoading(true)
      const { data } = await axios.post('/api/auth/register', {
        idcard,
        first_name,
        last_name,
        phone,
        age,
        room_number,
        password,
      })
      setSuccess(data.message || 'สมัครสมาชิกสำเร็จ')
      setRegisterForm(initialRegisterForm)
      setTimeout(() => navigate('/login'), 1200)
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
                <h1>สร้างบัญชีใหม่</h1>
                <p>สมัครสมาชิกเพื่อใช้งานระบบจัดการหอพัก</p>
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

                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="register-phone">
                      เบอร์โทรศัพท์
                    </label>
                    <input
                      id="register-phone"
                      type="tel"
                      name="phone"
                      className="form-control"
                      placeholder="เบอร์โทรศัพท์"
                      value={registerForm.phone}
                      onChange={handleRegisterChange}
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
                      min={1}
                      max={120}
                      name="age"
                      className="form-control"
                      placeholder="อายุ"
                      value={registerForm.age}
                      onChange={handleRegisterChange}
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
                  {loading ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}
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
