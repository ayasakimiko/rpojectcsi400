import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './page/LoginPage.jsx'
import RegisterMain from './page/RegisterMain.jsx'
import CustomerDashbord from './page/CustomerDashbord.jsx'
import StaffMain from './page/StaffMain.jsx'
import AdminBackupPage from './BackupPage/AdminBackupPage.jsx'

const STAFF_ROLES = new Set(['Staff', 'Admin', 'Owner'])
const ADMIN_ROLES = new Set(['Admin', 'Owner'])

function RequireAuth({ children }) {
  const token = sessionStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

function RequireStaffAuth({ children }) {
  const token = sessionStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  const storedUser = sessionStorage.getItem('user')
  const role = storedUser ? JSON.parse(storedUser)?.role : null
  if (!STAFF_ROLES.has(role)) {
    return <Navigate to="/login" replace />
  }
  return children
}

function RequireAdminAuth({ children }) {
  const token = sessionStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  const storedUser = sessionStorage.getItem('user')
  const role = storedUser ? JSON.parse(storedUser)?.role : null
  if (!ADMIN_ROLES.has(role)) {
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
              <AdminBackupPage />
            </RequireAdminAuth>
          }
        />
        <Route path="" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
