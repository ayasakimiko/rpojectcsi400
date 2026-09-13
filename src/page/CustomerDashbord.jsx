import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/CustomerDashbord.css'

const AMENITIES = [
  { key: 'air_conditioner', label: 'แอร์', color: 'blue' },
  { key: 'wifi', label: 'ไวไฟ', color: 'purple' },
  { key: 'refrigerator', label: 'ตู้เย็น', color: 'teal' },
  { key: 'bathroom', label: 'ห้องน้ำในตัว', color: 'amber' },
  { key: 'cctv', label: 'กล้องวงจรปิด', color: 'red' },
]

const AMENITY_ICON_PATHS = {
  air_conditioner: (
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
  ),
  wifi: (
    <>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </>
  ),
  refrigerator: (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="5" y1="10" x2="19" y2="10" />
      <line x1="9" y1="6" x2="9" y2="8" />
      <line x1="9" y1="14" x2="9" y2="16" />
    </>
  ),
  bathroom: <path d="M12 2.69 17.66 8.35a8 8 0 1 1-11.31 0z" />,
  cctv: (
    <>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </>
  ),
  bed: (
    <>
      <path d="M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6" />
      <path d="M2 21v-3" />
      <path d="M22 21v-3" />
      <path d="M6 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
    </>
  ),
}

function AmenityIcon({ name }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {AMENITY_ICON_PATHS[name]}
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

const STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอชำระ',
  overdue: 'ค้างชำระ',
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function formatRentalDuration(startValue, endValue) {
  if (!startValue || !endValue) return null
  const start = new Date(startValue)
  const end = new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
  if (totalDays <= 0) return null

  if (totalDays % 365 === 0) {
    return `สัญญาเช่า ${totalDays / 365} ปี`
  }
  if (totalDays % 30 === 0) {
    return `สัญญาเช่า ${totalDays / 30} เดือน`
  }
  if (totalDays % 7 === 0) {
    return `สัญญาเช่า ${totalDays / 7} สัปดาห์`
  }
  return `สัญญาเช่า ${totalDays} วัน`
}

function msUntil(value) {
  if (!value) return null
  return new Date(value).getTime() - Date.now()
}

function formatRemaining(ms) {
  const totalMinutes = Math.floor(Math.abs(ms) / (1000 * 60))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const parts = []
  if (days > 0) parts.push(`${days} วัน`)
  if (hours > 0) parts.push(`${hours} ชั่วโมง`)
  if (days === 0 && minutes > 0) parts.push(`${minutes} นาที`)
  return parts.length > 0 ? parts.join(' ') : 'น้อยกว่า 1 นาที'
}

function CustomerDashbord() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    const token = sessionStorage.getItem('token')

    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    axios
      .get('/api/customer/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        if (isMounted) setData(data)
      })
      .catch((err) => {
        if (!isMounted) return
        if (err.response?.status === 401) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [navigate])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="dashboard-page d-flex align-items-center justify-content-center">
        <p className="text-muted">กำลังโหลดข้อมูล...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="container">
          <div className="alert alert-danger">{error}</div>
        </div>
      </div>
    )
  }

  const { customer, room, rentalHistory } = data
  const msUntilStart = room?.is_booked ? msUntil(room.rental_start_date) : null
  const hasStarted = msUntilStart !== null && msUntilStart <= 0
  const msLeft = hasStarted ? msUntil(room.rental_end_date) : null
  const isExpired = msLeft !== null && msLeft < 0
  const isWarning = msLeft !== null && msLeft >= 0 && msLeft <= 30 * 24 * 60 * 60 * 1000

  return (
    <div className="dashboard-page">
      <div className="container">
        <div className="dashboard-header">
          <div className="dashboard-title-group">
            <div className="auth-icon">
              <svg
                width="22"
                height="22"
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
              </svg>
            </div>
            <div>
              <h1>
                สวัสดี, {customer.first_name} {customer.last_name}
              </h1>
              <p>แดชบอร์ดของฉัน</p>
            </div>
          </div>
          <div className="dashboard-header-actions">
            {room && (
              <span className="dashboard-room-status">
                {room.is_booked ? 'กำลังเช่าอยู่' : 'ว่าง'}
              </span>
            )}
            <button type="button" className="dashboard-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-12 col-lg-4">
            <div className="dashboard-card">
              <h2>ห้องของฉัน</h2>
              {room ? (
                <>
                  <p className="dashboard-room-number">ห้อง {room.room_number}</p>
                  {room.is_booked && room.rental_start_date && room.rental_end_date && (
                    <>
                      <h3 className="dashboard-section-title">ระยะเวลาการเช่า</h3>
                      <p className="dashboard-rental-duration">
                        {formatRentalDuration(room.rental_start_date, room.rental_end_date)}
                      </p>
                      <p className="dashboard-rental-period">
                        <CalendarIcon />
                        {formatDateTime(room.rental_start_date)} ถึง {formatDateTime(room.rental_end_date)}
                      </p>
                      {!hasStarted && msUntilStart !== null && (
                        <p className="dashboard-countdown is-pending">
                          เริ่มสัญญาในอีก {formatRemaining(msUntilStart)}
                        </p>
                      )}
                      {msLeft !== null && (
                        <p
                          className={`dashboard-countdown${isExpired ? ' is-expired' : isWarning ? ' is-warning' : ''}`}
                        >
                          {isExpired ? `หมดสัญญาแล้ว ${formatRemaining(msLeft)}` : `เหลืออีก ${formatRemaining(msLeft)}`}
                        </p>
                      )}
                    </>
                  )}
                  <h3 className="dashboard-section-title">สิ่งอำนวยความสะดวก</h3>
                  <div className="dashboard-amenities">
                    {AMENITIES.map((amenity) => (
                      <span
                        key={amenity.key}
                        className={`dashboard-amenity${room[amenity.key] ? ` is-${amenity.color}` : ' is-off'}`}
                      >
                        <AmenityIcon name={amenity.key} />
                        {amenity.label}
                      </span>
                    ))}
                    <span className="dashboard-amenity is-indigo">
                      <AmenityIcon name="bed" />
                      เตียง {room.bed ?? 0} เตียง
                    </span>
                  </div>
                </>
              ) : (
                <p className="dashboard-empty">ไม่พบข้อมูลห้องพัก</p>
              )}
            </div>
          </div>

          <div className="col-12 col-lg-8">
            <div className="dashboard-card">
              <h2>ประวัติการเช่าและการชำระค่าเช่า</h2>
              {rentalHistory.length === 0 ? (
                <p className="dashboard-empty">ยังไม่มีประวัติการเช่า</p>
              ) : (
                rentalHistory.map((entry) => (
                  <div key={entry.booking_id} className="dashboard-rental-entry">
                    {entry.payments.length === 0 ? (
                      <p className="dashboard-empty">ยังไม่มีประวัติการชำระค่าเช่า</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="dashboard-table">
                          <thead>
                            <tr>
                              <th>วันที่ชำระ</th>
                              <th>สถานะ</th>
                              <th>หมายเหตุ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.payments.map((payment) => (
                              <tr key={payment.id}>
                                <td>{formatDate(payment.payment_date)}</td>
                                <td>
                                  <span className={`dashboard-badge status-${payment.status}`}>
                                    {STATUS_LABEL[payment.status] || payment.status}
                                  </span>
                                </td>
                                <td>{payment.note || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CustomerDashbord
