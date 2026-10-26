import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './page/LoginPage.jsx'
import ForgotPasswordPage from './page/ForgotPasswordPage.jsx'
import RegisterMain from './page/RegisterMain.jsx'
import CustomerDashbord from './page/CustomerDashbord.jsx'
import StaffMain from './page/StaffMain.jsx'
import AdminPage from './page/AdminPage.jsx'
import OwnerMain from './page/OwnerMain.jsx'
import { clearSession, hasSession, homePathForRole } from './utils/session.js'

const STAFF_ROLES = new Set(['Staff', 'Admin', 'Owner'])
const ADMIN_ROLES = new Set(['Admin', 'Owner'])
const USER_ROLES = new Set(['Customer', ...STAFF_ROLES])

function parseUser(raw) {
  try {
    return JSON.parse(raw || 'null')
  } catch {
    return null
  }
}

function readSessionUser() {
  if (!hasSession()) return null
  const user = parseUser(sessionStorage.getItem('user'))
  if (user && USER_ROLES.has(user.role)) return user
  clearSession()
  sessionStorage.setItem('apiBackendNotice', 'ข้อมูลการเข้าสู่ระบบไม่สมบูรณ์ กรุณาเข้าสู่ระบบใหม่')
  return null
}

function RequireAuth({ children }) {
  if (readSessionUser()?.role !== 'Customer') {
    return <Navigate to="/login" replace />
  }
  return children
}

function RequireStaffAuth({ children }) {
  if (!STAFF_ROLES.has(readSessionUser()?.role)) {
    return <Navigate to="/login" replace />
  }
  return children
}

function RequireStaffPage({ children }) {
  const role = readSessionUser()?.role
  if (role === 'Owner') return <Navigate to={homePathForRole(role)} replace />
  if (!STAFF_ROLES.has(role)) return <Navigate to="/login" replace />
  return children
}

function RequireAdminAuth({ children }) {
  if (!ADMIN_ROLES.has(readSessionUser()?.role)) {
    return <Navigate to="/login" replace />
  }
  return children
}

function RequireOwnerAuth({ children }) {
  if (readSessionUser()?.role !== 'Owner') {
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/register"
          element={
            <RequireStaffAuth>
              <RegisterMain />
            </RequireStaffAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <CustomerDashbord />
            </RequireAuth>
          }
        />
        <Route
          path="/staff"
          element={
            <RequireStaffPage>
              <StaffMain />
            </RequireStaffPage>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdminAuth>
              <AdminPage />
            </RequireAdminAuth>
          }
        />
        <Route
          path="/owner"
          element={
            <RequireOwnerAuth>
              <OwnerMain />
            </RequireOwnerAuth>
          }
        />
        <Route path="" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
