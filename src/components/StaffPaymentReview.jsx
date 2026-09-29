import { useEffect, useState } from 'react'
import axios from 'axios'
import './StaffPaymentReview.css'

const PAYMENT_LABEL = { rent: 'ค่าเช่า', water: 'ค่าน้ำ', electricity: 'ค่าไฟ' }

function StaffPaymentReview() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [preview, setPreview] = useState(null)

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

  const loadPayments = () => {
    setLoading(true)
    return axios.get('/api/staff/payment-verifications', { headers: authHeaders() })
      .then(({ data }) => { setPayments(data.payments || []); setError('') })
      .catch((err) => setError(err.response?.data?.message || 'โหลดสลิปรอตรวจไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    axios.get('/api/staff/payment-verifications', {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
    })
      .then(({ data }) => {
        if (!cancelled) {
          setPayments(data.payments || [])
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'โหลดสลิปรอตรวจไม่สำเร็จ')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
  }, [preview])

  const openSlip = async (payment) => {
    setError('')
    try {
      const { data } = await axios.get(`/api/staff/payment-verifications/${payment.id}/slip`, {
        headers: authHeaders(),
        responseType: 'blob',
      })
      setPreview({ payment, url: URL.createObjectURL(data) })
    } catch (err) {
      setError(err.response?.data?.message || 'เปิดสลิปไม่สำเร็จ')
    }
  }

  const reviewPayment = async (payment, decision) => {
    if (decision === 'rejected' && !window.confirm(`ปฏิเสธสลิปของห้อง ${payment.room_number} หรือไม่?`)) return
    setBusyId(payment.id)
    setError('')
    setMessage('')
    try {
      const { data } = await axios.patch(`/api/staff/payment-verifications/${payment.id}`, { decision }, { headers: authHeaders() })
      setMessage(data.message)
      setPreview((current) => current?.payment.id === payment.id ? null : current)
      await loadPayments()
    } catch (err) {
      setError(err.response?.data?.message || 'ตรวจสลิปไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="staff-card payment-review-card">
      <div className="staff-card-header">
        <h2>สลิปรอตรวจสอบ <span className="staff-count-pill">{error && payments.length === 0 ? '—' : payments.length}</span></h2>
        <button type="button" className="staff-action-btn is-ghost" onClick={loadPayments} disabled={loading}>รีเฟรช</button>
      </div>
      <p className="payment-review-note">อนุมัติแล้วจึงเปลี่ยนสถานะรายการชำระเป็น “ชำระแล้ว”</p>
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {message && <div className="alert alert-success py-2">{message}</div>}
      {loading && payments.length === 0 ? <p className="staff-empty">กำลังโหลดรายการ...</p> : payments.length === 0 && error ? null : payments.length === 0 ? <p className="staff-empty">ไม่มีสลิปรอตรวจสอบ</p> : (
        <div className="table-responsive">
          <table className="staff-table">
            <thead><tr><th>ห้อง</th><th>ผู้เช่า</th><th>รายการ</th><th>ยอดรวม</th><th>วันที่ส่ง</th><th>ตรวจ</th></tr></thead>
            <tbody>{payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.room_number}</td>
                <td>{payment.first_name} {payment.last_name}<small>{payment.phone}</small></td>
                <td>{String(payment.payment_types || '').split(',').map((type) => PAYMENT_LABEL[type] || type).join(', ')}</td>
                <td>฿{Number(payment.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>{new Date(payment.payment_date).toLocaleDateString('th-TH')}</td>
                <td><div className="payment-review-actions">
                  <button type="button" className="staff-action-btn is-ghost" onClick={() => openSlip(payment)}>ดูสลิป</button>
                  <button type="button" className="staff-action-btn is-primary" disabled={busyId === payment.id} onClick={() => reviewPayment(payment, 'approved')}>อนุมัติ</button>
                  <button type="button" className="staff-action-btn is-danger" disabled={busyId === payment.id} onClick={() => reviewPayment(payment, 'rejected')}>ปฏิเสธ</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {preview && (
        <div className="payment-slip-overlay" role="presentation" onClick={() => setPreview(null)}>
          <section className="payment-slip-dialog" role="dialog" aria-modal="true" aria-label={`สลิปห้อง ${preview.payment.room_number}`} onClick={(event) => event.stopPropagation()}>
            <header><h3>สลิปห้อง {preview.payment.room_number}</h3><button type="button" onClick={() => setPreview(null)} aria-label="ปิด">×</button></header>
            <img src={preview.url} alt={`สลิปชำระเงินห้อง ${preview.payment.room_number}`} />
          </section>
        </div>
      )}
    </section>
  )
}

export default StaffPaymentReview