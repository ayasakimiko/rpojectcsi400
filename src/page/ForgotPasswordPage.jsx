import { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import { AuthAlert, AuthLayout } from '../components/AuthLayout.jsx'

const LOCK_ICON = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

const STEP_ORDER = ['lookup', 'otp', 'reset']

const STEP_LABELS = {
  lookup: 'ตรวจสอบ',
  otp: 'ยืนยัน OTP',
  reset: 'รหัสใหม่',
}

const STEP_ICONS = {
  lookup: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6.5 16a2.5 2.5 0 0 1 5 0" />
      <path d="M14 10h4" />
      <path d="M14 14h3" />
    </>
  ),
  otp: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10 6h4" />
      <path d="M9.5 13h.01" />
      <path d="M12 13h.01" />
      <path d="M14.5 13h.01" />
    </>
  ),
  reset: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.85 12.15 8.65-8.65" />
      <path d="m16.5 6.5 2.5 2.5" />
      <path d="m14 9 2 2" />
    </>
  ),
  done: <path d="m5 12.5 4.5 4.5L19 7.5" />,
}

const INFO_ICONS = {
  name: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  room: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  phone: (
    <path d="M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 4.2 2 2 0 0 1 3.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  ),
}

function stepTone(notice) {
  if (!notice?.message || notice.type === 'success' || notice.type === 'info') return ''
  if (notice.type === 'warning' || notice.status === 400 || notice.status === 429) return ' is-warning'
  return ' is-error'
}

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
  const [notice, setNotice] = useState(null)
  const [done, setDone] = useState(false)

  const showWarning = (message) => setNotice({ type: 'warning', message })

  const run = async (action) => {
    setNotice(null)
    try {
      setLoading(true)
      await action()
    } catch (err) {
      setNotice({ status: err.response?.status ?? 0, message: err.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' })
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
      showWarning('กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง')
      return
    }
    run(async () => {
      const { data } = await axios.post('/api/auth/forgot-password/lookup', { idcard })
      setCustomer(data.customer)
      setOtp('')
      setStep('otp')
      setNotice({ type: 'info', message: data.message })
    })
  }

  const handleVerify = (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(otp)) {
      showWarning('กรุณากรอกรหัส OTP 6 หลัก')
      return
    }
    run(async () => {
      const { data } = await axios.post('/api/auth/forgot-password/verify-otp', { idcard, otp })
      setResetToken(data.reset_token)
      setStep('reset')
      setNotice({ type: 'success', message: data.message })
    })
  }

  const handleReset = (e) => {
    e.preventDefault()
    if (newPassword.length < 6 || newPassword.length > 128) {
      showWarning('รหัสผ่านต้องมีความยาว 6-128 ตัวอักษร')
      return
    }
    if (newPassword !== confirmPassword) {
      showWarning('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }
    run(async () => {
      const { data } = await axios.post('/api/auth/forgot-password/reset', {
        reset_token: resetToken,
        new_password: newPassword,
      })
      setDone(true)
      setNotice({ type: 'success', message: data.message })
      setTimeout(() => navigate('/login'), 1200)
    })
  }

  return (
    <AuthLayout icon={LOCK_ICON} title={STEP_TITLES[step]} subtitle={STEP_SUBTITLES[step]}>
      <div className="auth-steps">
        {STEP_ORDER.map((key, index) => {
          const isDone = done || index < STEP_ORDER.indexOf(step)
          const isActive = key === step && !done
          return (
            <div
              key={key}
              className={`auth-step${isActive ? ` is-active${stepTone(notice)}` : ''}${isDone ? ' is-done' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="auth-step-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {STEP_ICONS[isDone ? 'done' : key]}
                </svg>
              </span>
              <span className="auth-step-text">
                <small>ขั้นที่ {index + 1}</small>
                {STEP_LABELS[key]}
              </span>
            </div>
          )
        })}
      </div>

      <AuthAlert notice={notice} />

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
          <div className="auth-info-head">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" />
              <path d="m8 12.5 2.75 2.75L16 10" />
            </svg>
            พบข้อมูลผู้เช่า
          </div>
          {[
            { label: 'ชื่อ-นามสกุล', value: `${customer.first_name} ${customer.last_name}`, icon: INFO_ICONS.name },
            { label: 'ห้องพัก', value: customer.room_number ?? 'ยังไม่มีห้องพัก', icon: INFO_ICONS.room },
            { label: 'เบอร์โทรศัพท์', value: customer.phone, icon: INFO_ICONS.phone },
          ].map((row) => (
            <div className="auth-info-row" key={row.label}>
              <span className="auth-info-label">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {row.icon}
                </svg>
                {row.label}
              </span>
              <strong>{row.value}</strong>
            </div>
          ))}
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
          <button type="submit" className="auth-submit-btn" disabled={loading || done}>
            {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
          </button>
        </form>
      )}

      <div className="auth-footer-link">
        <Link to="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
      </div>
    </AuthLayout>
  )
}

export default ForgotPasswordPage
