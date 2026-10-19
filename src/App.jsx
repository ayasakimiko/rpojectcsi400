import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './page/LoginPage.jsx'
import ForgotPasswordPage from './page/ForgotPasswordPage.jsx'
import RegisterMain from './page/RegisterMain.jsx'
import CustomerDashbord from './page/CustomerDashbord.jsx'
import StaffMain from './page/StaffMain.jsx'
import AdminPage from './page/AdminPage.jsx'
import OwnerMain from './page/OwnerMain.jsx'

const STAFF_ROLES = new Set(['Staff', 'Admin', 'Owner'])
const ADMIN_ROLES = new Set(['Admin', 'Owner'])
const USER_ROLES = new Set(['Customer', ...STAFF_ROLES])

function readSessionUser() {
  if (!sessionStorage.getItem('token')) return null
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || 'null')
    if (user && USER_ROLES.has(user.role)) return user
  } catch {
  }
  for (const key of ['token', 'user', 'justLoggedIn', 'apiBackend']) sessionStorage.removeItem(key)
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
            <RequireStaffAuth>
              <StaffMain />
            </RequireStaffAuth>
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
