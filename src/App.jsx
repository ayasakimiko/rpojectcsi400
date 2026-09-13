import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './page/LoginPage.jsx'
import RegisterMain from './page/RegisterMain.jsx'
import CustomerDashbord from './page/CustomerDashbord.jsx'

function RequireAuth({ children }) {
  const token = sessionStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterMain />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <CustomerDashbord />
            </RequireAuth>
          }
        />
        <Route path="" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
