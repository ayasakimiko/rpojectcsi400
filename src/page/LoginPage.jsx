import { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import { AuthAlert, AuthLayout } from '../components/AuthLayout.jsx'
import { homePathForRole, startSession } from '../utils/session.js'
import { PASSWORD_MAX_LENGTH, digitsOnly, firstError, validateLoginForm } from '../utils/validators.js'

const HOME_ICON = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
  </svg>
)
function FieldIcon({ children }) {
  return (
    <span className="auth-field-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  )
}

const initialLoginForm = { username: '', password: '', role: '' }
const ROLE_LABELS = { Customer: 'ผู้เช่า', Staff: 'เจ้าหน้าที่', Admin: 'ผู้ดูแลระบบ', Owner: 'เจ้าของหอพัก' }

function LoginPage() {
  const navigate = useNavigate()
  const [loginForm, setLoginForm] = useState(initialLoginForm)
  const [loading, setLoading] = useState(false)
  const [availableRoles, setAvailableRoles] = useState([])
  const [notice, setNotice] = useState(() => ({ type: 'warning', message: sessionStorage.getItem('apiBackendNotice') || '' }))
  const [loggedIn, setLoggedIn] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)

  const handleLoginChange = (e) => {
    const { name } = e.target
    const value = name === 'username' ? digitsOnly(e.target.value, 13) : e.target.value
    if (name !== 'role') setAvailableRoles([])
    setFieldErrors((prev) => ({ ...prev, [name]: null }))
    setLoginForm((prev) => ({ ...prev, ...(name !== 'role' ? { role: '' } : {}), [name]: value }))
  }

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    sessionStorage.removeItem('apiBackendNotice')
    setNotice(null)

    const errors = validateLoginForm(loginForm)
    setFieldErrors(errors)
    if (firstError(errors)) {
      setNotice({ type: 'warning', message: firstError(errors) })
      return
    }

    try {
      setLoading(true)
      const { data } = await axios.post('/api/auth/login', loginForm)
      startSession(data.user)
      sessionStorage.setItem('justLoggedIn', '1')
      setLoggedIn(true)
      setNotice({ type: 'success', message: data.message || 'เข้าสู่ระบบสำเร็จ' })
      setTimeout(() => navigate(homePathForRole(data.user?.role), { replace: true }), 600)
    } catch (err) {
      if (err.response?.data?.code === 'LOGIN_ROLE_REQUIRED') {
        setAvailableRoles((err.response.data.roles || []).filter((role) => Object.hasOwn(ROLE_LABELS, role)))
      }
      setNotice({ status: err.response?.status ?? 0, message: err.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout icon={HOME_ICON} title="ยินดีต้อนรับกลับมา" subtitle="เข้าสู่ระบบเพื่อใช้งานระบบจัดการหอพัก">
      <AuthAlert notice={notice} />

      <form onSubmit={handleLoginSubmit} noValidate>
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label" htmlFor="login-username">
              เลขบัตรประชาชน หรือ เลขห้อง
            </label>
            <div className="auth-field">
              <FieldIcon>
                <rect x="3" y="5" width="18" height="14" rx="2.5" />
                <circle cx="9" cy="11" r="2" />
                <path d="M6.5 15.5c.6-1.2 1.5-1.8 2.5-1.8s1.9.6 2.5 1.8M14 10h4M14 13.5h3" />
              </FieldIcon>
              <input
                id="login-username"
                type="text"
                inputMode="numeric"
                maxLength={13}
                name="username"
                className={`form-control${fieldErrors.username ? ' is-invalid' : ''}`}
                placeholder="เลขบัตรประชาชน 13 หลัก หรือ เลขห้อง"
                value={loginForm.username}
                onChange={handleLoginChange}
                autoComplete="username"
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby={fieldErrors.username ? 'login-username-error' : undefined}
              />
              {fieldErrors.username && <div id="login-username-error" className="invalid-feedback">{fieldErrors.username}</div>}
            </div>
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="login-password">
              รหัสผ่าน
            </label>
            <div className="auth-field has-toggle">
              <FieldIcon>
                <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                <path d="M12 14.5v2.5" />
              </FieldIcon>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                className={`form-control${fieldErrors.password ? ' is-invalid' : ''}`}
                placeholder="กรอกรหัสผ่าน"
                value={loginForm.password}
                onChange={handleLoginChange}
                autoComplete="current-password"
                maxLength={PASSWORD_MAX_LENGTH}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              />
              <button
                type="button"
                className="auth-field-toggle"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.2-3.1 3.5M6.3 7.8C4.4 9.1 3.1 10.9 2.5 12c1 1.5 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.9" />
                      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                    </>
                  ) : (
                    <>
                      <path d="M2.5 12C3.5 10.5 7 6 12 6s8.5 4.5 9.5 6c-1 1.5-4.5 6-9.5 6s-8.5-4.5-9.5-6Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
              {fieldErrors.password && <div id="login-password-error" className="invalid-feedback">{fieldErrors.password}</div>}
            </div>
            <div className="auth-forgot-link">
              <Link to="/forgot-password">ลืมรหัสผ่าน?</Link>
            </div>
          </div>
        </div>
        {availableRoles.length > 0 && (
          <div className="mt-3">
            <label className="form-label" htmlFor="login-role">สิทธิ์ที่ต้องการเข้าสู่ระบบ</label>
            <select id="login-role" name="role" className="form-select" value={loginForm.role} onChange={handleLoginChange}>
              <option value="">เลือกสิทธิ์ผู้ใช้งาน</option>
              {availableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
          </div>
        )}
        <button type="submit" className="auth-submit-btn" disabled={loading || loggedIn || (availableRoles.length > 0 && !loginForm.role)}>
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </AuthLayout>
  )
}

export default LoginPage