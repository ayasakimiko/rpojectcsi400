import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './page/LoginPage.jsx'
import RegisterMain from './page/RegisterMain.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterMain />} />
        <Route path="" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
