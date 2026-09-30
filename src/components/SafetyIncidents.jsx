import { useEffect, useState } from 'react'
import axios from 'axios'

const INCIDENT_TYPES = [
  ['accident', 'อุบัติเหตุ'], ['security', 'ความปลอดภัย'], ['fire', 'ไฟไหม้ / ควัน'],
  ['medical', 'เหตุฉุกเฉินทางการแพทย์'], ['other', 'อื่น ๆ'],
]

export default function SafetyIncidents({ reviewer = false, base = 'customer', nav = false }) {
  const [open, setOpen] = useState(false)
  const [incidents, setIncidents] = useState([])
  const [form, setForm] = useState({ incidentType: 'security', severity: 'urgent', description: '', roomNumber: '' })
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const Wrapper = nav ? 'li' : 'div'
  const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}` }
  const load = () => axios.get(`/api/${base}/safety-incidents`, { headers }).then(({ data }) => setIncidents(data.incidents || []))
    .catch((error) => setMessage(error.response?.data?.message || 'โหลดรายงานเหตุไม่สำเร็จ'))

  useEffect(() => { if (reviewer) load() }, [reviewer, base])

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const payload = { ...form, roomNumber: form.roomNumber || undefined }
      const { data } = await axios.post(`/api/${base}/safety-incidents`, payload, { headers })
      setMessage(data.message || 'ส่งรายงานแล้ว')
      setForm({ incidentType: 'security', severity: 'urgent', description: '', roomNumber: '' })
    } catch (error) { setMessage(error.response?.data?.message || 'ส่งรายงานไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const markReviewed = async (incident) => {
    setBusy(true); setMessage('')
    try {
      await axios.patch(`/api/${base}/safety-incidents/${incident.id}/review`, { reviewNote: notes[incident.id] || '' }, { headers })
      await load()
    } catch (error) { setMessage(error.response?.data?.message || 'บันทึกผลไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <Wrapper className={nav ? 'nav-item' : 'safety-entry'}>
    <button className={nav ? `nav-link${base === 'staff' ? ' staff-tab-link' : base === 'admin' ? ' admin-tab-link' : base === 'owner' ? ' owner-tab-link' : ' dashboard-tab-link'}` : `safety-trigger${reviewer ? ' is-reviewer' : ''}`} type="button" onClick={() => { setOpen(true); setMessage(''); if (reviewer) load() }}>
      {reviewer ? `ตรวจเหตุฉุกเฉิน${incidents.filter((item) => item.status === 'pending').length ? ` (${incidents.filter((item) => item.status === 'pending').length})` : ''}` : 'แจ้งเหตุฉุกเฉิน'}
    </button>
    {open && <div className="safety-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="safety-modal" role="dialog" aria-modal="true" aria-labelledby="safety-title">
        <button className="safety-close" type="button" aria-label="ปิด" onClick={() => setOpen(false)}>×</button>
        <span className="safety-eyebrow">SAFETY & SECURITY</span>
        <h2 id="safety-title">{reviewer ? 'ตรวจสอบเหตุฉุกเฉิน' : 'รายงานเหตุฉุกเฉิน / ความปลอดภัย'}</h2>
        <p className="safety-intro">{reviewer ? 'รายการรายงานจากผู้พักอาศัยและเจ้าหน้าที่' : 'รายงานเหตุให้ Admin และ Owner ตรวจสอบโดยเร็ว'}</p>
        {reviewer ? <div className="safety-list">{incidents.length === 0 ? <p className="safety-empty">ยังไม่มีรายงานเหตุ</p> : incidents.map((item) => <article className="safety-card" key={item.id}>
          <div className="safety-card-heading"><strong>{INCIDENT_TYPES.find(([key]) => key === item.incident_type)?.[1] || item.incident_type}</strong><span className={`safety-status ${item.status} ${item.severity}`}>{item.status === 'pending' ? 'รอตรวจสอบ' : 'ตรวจแล้ว'}{item.severity === 'urgent' ? ' · ด่วน' : ''}</span></div>
          <p>{item.description}</p><small>{item.reporter_name} ({item.reporter_role}){item.room_number ? ` · ห้อง ${item.room_number}` : ''} · {new Date(item.created_at).toLocaleString('th-TH')}</small>
          {item.status === 'pending' ? <><textarea aria-label="บันทึกผลตรวจสอบ" placeholder="บันทึกผลหรือการดำเนินการ (ถ้ามี)" value={notes[item.id] || ''} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} /><button className="safety-review" type="button" disabled={busy} onClick={() => markReviewed(item)}>บันทึกว่าตรวจสอบแล้ว</button></> : item.review_note && <p className="safety-note">ผลตรวจสอบ: {item.review_note}</p>}
        </article>)}</div> : <form className="safety-form" onSubmit={submit}>
          <label>ประเภทเหตุ<select value={form.incidentType} onChange={(event) => setForm({ ...form, incidentType: event.target.value })}>{INCIDENT_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {base === 'staff' && <label>เลขห้อง (ถ้าเกี่ยวข้อง)<input inputMode="numeric" value={form.roomNumber} onChange={(event) => setForm({ ...form, roomNumber: event.target.value })} /></label>}
          <label>ระดับความเร่งด่วน<select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}><option value="urgent">ด่วน</option><option value="normal">ทั่วไป</option></select></label>
          <label>รายละเอียดเหตุการณ์<textarea required rows="5" maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="ระบุสถานที่ เวลา และสิ่งที่เกิดขึ้น" /></label>
          <button className="safety-submit" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งรายงานให้ Admin และ Owner'}</button>
        </form>}
        {message && <p className="safety-message" role="status">{message}</p>}
      </section>
    </div>}
  </Wrapper>
}
