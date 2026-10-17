import { useEffect, useState } from 'react'
import axios from 'axios'

export default function OwnerParkingSummary() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = sessionStorage.getItem('token')
    axios.get('/api/owner/parking/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setSummary(data))
      .catch((requestError) => setError(requestError.response?.data?.message || 'โหลดข้อมูลที่จอดรถไม่สำเร็จ'))
  }, [])

  return <section className="owner-parking-summary">
    <div className="owner-parking-icon" aria-hidden="true">P</div>
    <div className="owner-parking-copy">
      <strong>สถานะที่จอดรถ</strong>
      <span>{error || (summary ? summary.capacity === null ? 'ยังไม่ได้กำหนดจำนวนที่จอดทั้งหมด' : summary.isFull ? 'พื้นที่จอดรถเต็มแล้ว' : 'ยังมีพื้นที่จอดรถว่าง' : 'กำลังโหลดข้อมูล…')}</span>
    </div>
    <div className="owner-parking-count">
      <strong>{summary?.parkedCount ?? '—'}{summary?.capacity !== null && summary?.capacity !== undefined ? ` / ${summary.capacity}` : ''}</strong>
      <span>คันที่กำลังจอด</span>
    </div>
  </section>
}
