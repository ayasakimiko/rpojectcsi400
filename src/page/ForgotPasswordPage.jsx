import { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'

const STEP_TITLES = {
  lookup: 'ลืมรหัสผ่าน',
  otp: 'ยืนยันรหัส OTP',
  reset: 'ตั้งรหัสผ่านใหม่',
}

const STEP_SUBTITLES = {
  lookup: 'กรอกเลขบัตรประชาชนเพื่อตรวจสอบข้อมูลผู้เช่า',
  otp: 'กรอกรหัส OTP 6 หลักที่ส่งไปยังเบอร์โทรศัพท์ที่ลงทะเบียนไว้',
  reset: 'กำหนดรหัสผ่านใหม่สำหรับเข้าสู่ระบบ',
}

function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState('lookup')
  const [idcard, setIdcard] = useState('')
  const [customer, setCustomer] = useState(null)
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const run = async (action) => {
    setError('')
    setSuccess('')
    try {
      setLoading(true)
      await action()
    } catch (err) {
      setError(err.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  const handleIdcardChange = (e) => {
    setIdcard(e.target.value.replace(/\D/g, '').slice(0, 13))
    if (step !== 'lookup') {
      setStep('lookup')
      setCustomer(null)
      setOtp('')
    }
  }

  const handleLookup = (e) => {
    e.preventDefault()
    if (!/^\d{13}$/.test(idcard)) {
      setError('กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง')
      return
    }
    run(async () => {
      const { data } = await axios.post('/api/auth/forgot-password/lookup', { idcard })
      setCustomer(data.customer)
      setOtp('')
      setStep('otp')
      setSuccess(data.message)
    })
  }

  const handleVerify = (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(otp)) {
      setError('กรุณากรอกรหัส OTP 6 หลัก')
      return
    }
    run(async () => {
      const { data } = await axios.post('/api/auth/forgot-password/verify-otp', { idcard, otp })
      setResetToken(data.reset_token)
      setStep('reset')
      setSuccess(data.message)
    })
  }

  const handleReset = (e) => {
    e.preventDefault()
    if (newPassword.length < 6 || newPassword.length > 128) {
      setError('รหัสผ่านต้องมีความยาว 6-128 ตัวอักษร')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }
    run(async () => {
      const { data } = await axios.post('/api/auth/forgot-password/reset', {
        reset_token: resetToken,
        new_password: newPassword,
      })
      setSuccess(data.message)
      setTimeout(() => navigate('/login'), 1200)
    })
  }

  return (
    <div className="auth-page">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-sm-10 col-md-8 col-lg-6 col-xl-5">
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
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </div>
                <h1>{STEP_TITLES[step]}</h1>
                <p>{STEP_SUBTITLES[step]}</p>
              </div>

              {error && <div className="alert alert-danger py-2 px-3">{error}</div>}
              {success && <div className="alert alert-success py-2 px-3">{success}</div>}

              {step !== 'reset' && (
                <form onSubmit={handleLookup} noValidate>
                  <label className="form-label" htmlFor="forgot-idcard">
                    เลขบัตรประชาชน
                  </label>
                  <input
                    id="forgot-idcard"
                    type="text"
                    inputMode="numeric"
                    maxLength={13}
                    className="form-control"
                    placeholder="เลขบัตรประชาชน 13 หลัก"
                    value={idcard}
                    onChange={handleIdcardChange}
                    autoComplete="off"
                  />
                  <button type="submit" className={step === 'lookup' ? 'auth-submit-btn' : 'auth-secondary-btn'} disabled={loading}>
                    {loading && step === 'lookup' ? 'กำลังตรวจสอบ...' : step === 'lookup' ? 'ตรวจสอบ' : 'ขอรหัส OTP ใหม่'}
                  </button>
                </form>
              )}

              {customer && (
                <div className="auth-info-box">
                  <div className="auth-info-row">
                    <span>ชื่อ-นามสกุล</span>
                    <strong>{customer.first_name} {customer.last_name}</strong>
                  </div>
                  <div className="auth-info-row">
                    <span>ห้องพัก</span>
                    <strong>{customer.room_number ?? 'ยังไม่มีห้องพัก'}</strong>
                  </div>
                  <div className="auth-info-row">
                    <span>เบอร์โทรศัพท์</span>
                    <strong>{customer.phone}</strong>
                  </div>
                </div>
              )}

              {step === 'otp' && (
                <form onSubmit={handleVerify} noValidate className="mt-3">
                  <label className="form-label" htmlFor="forgot-otp">
                    รหัส OTP
                  </label>
                  <input
                    id="forgot-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="form-control auth-otp-input"
                    placeholder="------"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoComplete="one-time-code"
                  />
                  <div className="form-text">รหัส OTP มีอายุ 5 นาที</div>
                  <button type="submit" className="auth-submit-btn" disabled={loading || otp.length !== 6}>
                    {loading ? 'กำลังยืนยัน...' : 'ยืนยัน OTP'}
                  </button>
                </form>
              )}

              {step === 'reset' && (
                <form onSubmit={handleReset} noValidate className="mt-3">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" htmlFor="forgot-new-password">
                        รหัสผ่านใหม่
                      </label>
                      <input
                        id="forgot-new-password"
                        type="password"
                        className="form-control"
                        placeholder="อย่างน้อย 6 ตัวอักษร"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="forgot-confirm-password">
                        ยืนยันรหัสผ่านใหม่
                      </label>
                      <input
                        id="forgot-confirm-password"
                        type="password"
                        className="form-control"
                        placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <button type="submit" className="auth-submit-btn" disabled={loading}>
                    {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
                  </button>
                </form>
              )}

              <div className="auth-footer-link">
                <Link to="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
