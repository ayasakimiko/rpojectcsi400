import { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'

const initialLoginForm = { username: '', password: '', role: '' }
const ROLE_LABELS = { Customer: 'ผู้เช่า', Staff: 'เจ้าหน้าที่', Admin: 'ผู้ดูแลระบบ', Owner: 'เจ้าของหอพัก' }

function LoginPage() {
  const navigate = useNavigate()
  const [loginForm, setLoginForm] = useState(initialLoginForm)
  const [loading, setLoading] = useState(false)
  const [availableRoles, setAvailableRoles] = useState([])
  const [error, setError] = useState(() => sessionStorage.getItem('apiBackendNotice') || '')
  const [success, setSuccess] = useState('')

  const handleLoginChange = (e) => {
    const { name, value } = e.target
    if (name !== 'role') setAvailableRoles([])
    setLoginForm((prev) => ({ ...prev, ...(name !== 'role' ? { role: '' } : {}), [name]: value }))
  }

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    sessionStorage.removeItem('apiBackendNotice')
    setError('')
    setSuccess('')

    if (!loginForm.username || !loginForm.password) {
      setError('กรุณากรอกเลขบัตรประชาชนหรือเลขห้อง และรหัสผ่าน')
      return
    }

    try {
      setLoading(true)
      const { data } = await axios.post('/api/auth/login', loginForm)
      sessionStorage.setItem('token', data.token)
      sessionStorage.setItem('user', JSON.stringify(data.user))
      sessionStorage.setItem('justLoggedIn', '1')
      setSuccess(data.message || 'เข้าสู่ระบบสำเร็จ')
      const destination =
        data.user?.role === 'Customer'
          ? '/dashboard'
          : data.user?.role === 'Owner'
            ? '/owner'
            : data.user?.role === 'Admin'
              ? '/admin'
              : '/staff'
      setTimeout(() => navigate(destination), 600)
    } catch (err) {
      if (err.response?.data?.code === 'LOGIN_ROLE_REQUIRED') {
        setAvailableRoles((err.response.data.roles || []).filter((role) => Object.hasOwn(ROLE_LABELS, role)))
      }
      setError(err.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
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
                    <path d="M3 11.5 12 4l9 7.5" />
                    <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
                  </svg>
                </div>
                <h1>ยินดีต้อนรับกลับมา</h1>
                <p>เข้าสู่ระบบเพื่อใช้งานระบบจัดการหอพัก</p>
              </div>

              {error && <div className="alert alert-danger py-2 px-3">{error}</div>}
              {success && <div className="alert alert-success py-2 px-3">{success}</div>}

              <form onSubmit={handleLoginSubmit} noValidate>
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label" htmlFor="login-username">
                      เลขบัตรประชาชน หรือ เลขห้อง
                    </label>
                    <input
                      id="login-username"
                      type="text"
                      inputMode="numeric"
                      maxLength={13}
                      name="username"
                      className="form-control"
                      placeholder="เลขบัตรประชาชน 13 หลัก หรือ เลขห้อง"
                      value={loginForm.username}
                      onChange={handleLoginChange}
                      autoComplete="username"
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="login-password">
                      รหัสผ่าน
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      name="password"
                      className="form-control"
                      placeholder="กรอกรหัสผ่าน"
                      value={loginForm.password}
                      onChange={handleLoginChange}
                      autoComplete="current-password"
                    />
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
                <button type="submit" className="auth-submit-btn" disabled={loading || (availableRoles.length > 0 && !loginForm.role)}>
                  {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage