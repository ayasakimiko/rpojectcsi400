import { useEffect, useState } from 'react'
import axios from 'axios'

const labels = { vehicle: 'รถ / ที่จอดรถ', overnight_guest: 'แจ้งแขกค้างคืน' }
const statusLabels = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ' }

export default function ResidentVisitRequests({ staff = false, admin = false, nav = false }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [type, setType] = useState('vehicle')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ vehiclePlate: '', vehicleModel: '', guestName: '', guestPhone: '', startAt: '', endAt: '', note: '', isSpecial: false, specialReason: '' })
  const Wrapper = nav ? 'li' : 'section'
  const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}` }

  const load = () => axios.get(admin ? '/api/admin/resident-visit-requests/special' : `/api/${staff ? 'staff' : 'customer'}/resident-visit-requests`, { headers })
    .then(({ data }) => setItems(data.requests || []))
    .catch((error) => setMessage(error.response?.data?.message || 'โหลดคำขอไม่สำเร็จ'))

  useEffect(() => { load() }, [staff])

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      await axios.post('/api/customer/resident-visit-requests', { ...form, requestType: type }, { headers })
      setMessage('ส่งคำขอแล้ว รอเจ้าหน้าที่อนุมัติ')
      setForm({ vehiclePlate: '', vehicleModel: '', guestName: '', guestPhone: '', startAt: '', endAt: '', note: '', isSpecial: false, specialReason: '' })
      await load()
    } catch (error) { setMessage(error.response?.data?.message || 'ส่งคำขอไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const review = async (item, decision) => {
    setBusy(true); setMessage('')
    try {
      const url = admin
        ? `/api/admin/resident-visit-requests/${item.id}/special-review`
        : `/api/staff/resident-visit-requests/${item.id}/${decision}`
      await axios.post(url, admin ? { decision } : {}, { headers })
      await load()
    } catch (error) { setMessage(error.response?.data?.message || 'บันทึกผลไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <Wrapper className={nav ? 'nav-item' : 'rv-panel'}>
    <button className={nav ? `nav-link${admin ? ' admin-tab-link' : staff ? ' staff-tab-link' : ' dashboard-tab-link'}` : 'rv-trigger'} onClick={() => { setOpen(true); setMessage(''); load() }}>
      {admin ? `คำขอพิเศษ${items.length ? ` (${items.length})` : ''}` : staff ? `คำขอรถ / แขกค้างคืน${items.length ? ` (${items.length})` : ''}` : 'ลงทะเบียนรถ / แจ้งแขกค้างคืน'}
    </button>
    {open && <div className="rv-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="rv-modal" role="dialog" aria-modal="true" aria-labelledby="rv-title">
        <button className="rv-close" onClick={() => setOpen(false)} aria-label="ปิด">×</button>
        <span className="rv-kicker">RESIDENT SERVICES</span>
        <h2 id="rv-title">{admin ? 'อนุมัติเคสพิเศษ' : staff ? 'คำขอจากผู้พักอาศัย' : 'ลงทะเบียนรถและผู้มาติดต่อ'}</h2>
        <p className="rv-subtitle">{admin ? 'ตรวจสอบเหตุผลและตัดสินใจอนุมัติหรือปฏิเสธคำขอ' : staff ? 'ตรวจสอบรายละเอียดแล้วอนุมัติหรือปฏิเสธคำขอ' : 'ส่งข้อมูลให้เจ้าหน้าที่ตรวจสอบและอนุมัติ'}</p>
        {staff || admin ? <div className="rv-list">{items.length === 0 ? <p className="rv-empty">ไม่มีคำขอที่รอดำเนินการ</p> : items.map((item) => <article className="rv-card" key={item.id}>
          <div className="rv-card-head"><strong>{labels[item.request_type]} · ห้อง {item.room_number}</strong><span>รออนุมัติ</span></div>
          <p>{item.request_type === 'vehicle' ? `ทะเบียน ${item.vehicle_plate}${item.vehicle_model ? ` · ${item.vehicle_model}` : ''}` : `${item.guest_name}${item.guest_phone ? ` · ${item.guest_phone}` : ''}`}</p>
          <p>{new Date(item.start_at).toLocaleString('th-TH')} – {new Date(item.end_at).toLocaleString('th-TH')}</p>
          {item.is_special && <p className="rv-special-reason"><strong>เหตุผลขออนุมัติพิเศษ:</strong> {item.special_reason}</p>}{item.note && <p>{item.note}</p>}<small>{item.first_name} {item.last_name} · {item.customer_phone}</small>
          <div className="rv-actions"><button disabled={busy} onClick={() => review(item, 'approve')}>อนุมัติ{admin ? 'พิเศษ' : ''}</button><button className="rv-deny" disabled={busy} onClick={() => review(item, 'reject')}>ปฏิเสธ</button></div>
        </article>)}</div> : <>
          <div className="rv-switch"><button className={type === 'vehicle' ? 'selected' : ''} onClick={() => setType('vehicle')}>รถ / ที่จอด</button><button className={type === 'overnight_guest' ? 'selected' : ''} onClick={() => setType('overnight_guest')}>แขกค้างคืน</button></div>
          <form className="rv-form" onSubmit={submit}>
            {type === 'vehicle' ? <><label>ทะเบียนรถ<input required value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} placeholder="กข 1234" /></label><label>ยี่ห้อ / รุ่น<input value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} placeholder="เช่น Toyota Yaris" /></label></> : <><label>ชื่อแขก<input required value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} /></label><label>เบอร์ติดต่อ<input value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} /></label></>}
            <div className="rv-dates"><label>เริ่มวันที่ / เวลา<input required type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></label><label>สิ้นสุดวันที่ / เวลา<input required type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></label></div>
            <label>หมายเหตุ (ถ้ามี)<textarea rows="2" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            <label className="rv-special-toggle"><input type="checkbox" checked={form.isSpecial} onChange={(e) => setForm({ ...form, isSpecial: e.target.checked })} /><span>ส่งเป็นเคสพิเศษให้ Admin พิจารณา</span></label>
            {form.isSpecial && <label>เหตุผลที่ขออนุมัติพิเศษ<textarea required rows="3" value={form.specialReason} onChange={(e) => setForm({ ...form, specialReason: e.target.value })} placeholder="เช่น สติกเกอร์รถชำรุด หรือขอขยายเวลาพักแขก" /></label>}
            <button className="rv-submit" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งคำขอ'}</button>
          </form>
          <div className="rv-list">{items.map((item) => <article className="rv-history" key={item.id}><strong>{labels[item.request_type]}</strong><span className={`rv-status ${item.status}`}>{statusLabels[item.status]}</span><small>{new Date(item.start_at).toLocaleString('th-TH')} – {new Date(item.end_at).toLocaleString('th-TH')}</small></article>)}</div>
        </>}
        {message && <p className="rv-message" role="status">{message}</p>}
      </div>
    </div>}
  </Wrapper>
}
