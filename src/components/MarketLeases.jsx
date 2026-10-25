import { useCallback, useEffect, useMemo, useState } from 'react'
import PhotoLightbox from './PhotoLightbox.jsx'
import ThaiDatePicker from './ThaiDatePicker.jsx'
import { BOOKING_STATUS, DEPOSIT_STATUS, INVOICE_STATUS, LEASE_CONTRACT_TYPE, LEASE_STATUS, UTILITY_MODE } from '../utils/marketStatus.js'
import { addContractMonths } from '../utils/rentalContract.js'
import {
  ConfirmModal, EmptyState, Field, MarketModal, StatusPill,
} from './MarketShared.jsx'
import { errorMessage, formatDate, formatDateTime, formatMoney } from '../utils/marketUi.js'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])

function printContract(contract, config) {
  const popup = window.open('', '_blank', 'width=820,height=1000')
  if (!popup) return false
  const row = (label, value) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
  popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(contract.contract_no)}</title>
    <style>body{font-family:'Sarabun','Segoe UI',sans-serif;margin:40px;color:#111;line-height:1.7}h1{font-size:22px;text-align:center;margin:0}
    p.no{text-align:center;margin:4px 0 24px;color:#555}table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;vertical-align:top}th{width:32%;background:#f5f5f5}
    .terms{white-space:pre-wrap;border:1px solid #ccc;padding:12px}.sign{display:flex;justify-content:space-between;margin-top:64px}
    .sign div{width:42%;text-align:center;border-top:1px solid #333;padding-top:8px}</style></head><body>
    <h1>${escapeHtml(LEASE_CONTRACT_TYPE[contract.contract_type]?.label)}</h1>
    <p class="no">เลขที่ ${escapeHtml(contract.contract_no)} · ${escapeHtml(config?.site_name)}</p>
    <table>
      ${row('ผู้เช่า', `${contract.vendor_name} (ผู้ติดต่อ ${contract.contact_name} โทร ${contract.phone})`)}
      ${row('ล็อก', `${contract.stall_code}${contract.zone ? ` · ${contract.zone}` : ''}`)}
      ${row('ประเภทสินค้า', contract.category_name)}
      ${row('ระยะเวลาเช่า', `${formatDate(contract.start_date)} ถึง ${formatDate(contract.end_date)} (${contract.lease_months} เดือน)`)}
      ${row('ค่าเช่าต่อเดือน', formatMoney(contract.rent_price))}
      ${row('เงินประกัน', `${formatMoney(contract.deposit_amount)} (${contract.deposit_months} เดือน)`)}
      ${row('ค่าไฟ / ค่าน้ำ', `${UTILITY_MODE[contract.electricity_mode].label} / ${UTILITY_MODE[contract.water_mode].label}`)}
    </table>
    <h3>เงื่อนไข</h3><div class="terms">${escapeHtml(contract.terms)}</div>
    <div class="sign"><div>ผู้ให้เช่า</div><div>ผู้เช่า</div></div>
    <script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
  return true
}

function BookingForm({ api, stalls, vendors, categories, config, onClose, onSaved }) {
  const bookable = stalls.filter((stall) => !stall.is_sandbox && stall.unit_kind === 'rentable' && stall.status !== 'closed')
  const activeVendors = vendors.filter((vendor) => vendor.status === 'active')
  const [form, setForm] = useState({
    stall_id: bookable[0] ? String(bookable[0].id) : '',
    vendor_id: activeVendors[0] ? String(activeVendors[0].id) : '',
    category_id: '',
    start_date: '',
    lease_months: String(config.min_lease_months),
    deposit_months: String(config.default_deposit_months),
    rent_price: '',
    note: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const input = (key) => ({ value: form[key], onChange: (event) => set(key)(event.target.value) })
  const stall = bookable.find((item) => String(item.id) === form.stall_id)
  const allowed = categories.filter((category) => category.is_active && stall?.category_ids.includes(category.id)
    && (!category.requires_water || stall.has_water))
  const categoryId = allowed.some((category) => String(category.id) === form.category_id) ? form.category_id : String(allowed[0]?.id ?? '')
  const rent = form.rent_price === '' ? stall?.rent_price ?? 0 : Number(form.rent_price)
  const months = Number(form.lease_months) || 0
  const depositMonths = Number(form.deposit_months) || 0
  const endDate = form.start_date && months > 0 ? addContractMonths(`${form.start_date}T00:00:00`, months) : null

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await api.post('/bookings', {
        stall_id: Number(form.stall_id), vendor_id: Number(form.vendor_id), category_id: Number(categoryId),
        start_date: form.start_date, lease_months: months, deposit_months: depositMonths,
        rent_price: form.rent_price === '' ? undefined : Number(form.rent_price), note: form.note,
      })
      onSaved(data.message)
    } catch (requestError) {
      setError(errorMessage(requestError))
      setBusy(false)
    }
  }

  return (
    <MarketModal title="บันทึกการจองล็อก" wide busy={busy} error={error} onClose={onClose} onSubmit={submit}
      submitDisabled={!stall || !form.vendor_id || !categoryId || !form.start_date}>
      {bookable.length === 0 && <p className="market-error">ยังไม่มีล็อกที่เปิดให้เช่า ให้เปิดล็อกจากแท็บผังก่อน</p>}
      {activeVendors.length === 0 && <p className="market-error">ยังไม่มีผู้ค้า ให้เพิ่มที่แท็บผู้ค้าก่อน</p>}
      <div className="market-form-grid">
        <Field label="ล็อก">
          <select className="market-input" {...input('stall_id')}>
            {bookable.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.zone || '-'} · {formatMoney(item.rent_price)}/เดือน</option>)}
          </select>
        </Field>
        <Field label="ผู้ค้า">
          <select className="market-input" {...input('vendor_id')}>
            {activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendor_name}</option>)}
          </select>
        </Field>
        <Field label="ประเภทร้าน / สินค้าหลัก" hint="ประเภทที่ต้องใช้น้ำ เลือกได้เฉพาะล็อกที่มีน้ำ">
          <select className="market-input" value={categoryId} onChange={(event) => set('category_id')(event.target.value)}>
            {allowed.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
        <Field label="วันเริ่มสัญญา">
          <ThaiDatePicker value={form.start_date} onChange={set('start_date')} className="market-input" />
        </Field>
        <Field label="ระยะสัญญา (เดือน)" hint={`ขั้นต่ำ ${config.min_lease_months} เดือน`}>
          <input className="market-input" type="number" min={config.min_lease_months} {...input('lease_months')} />
        </Field>
        <Field label="เงินประกัน (เดือน)"><input className="market-input" type="number" min="0" {...input('deposit_months')} /></Field>
        <Field label="ค่าเช่าต่อเดือน" hint="เว้นว่างเพื่อใช้ราคาของล็อก">
          <input className="market-input" type="number" step="0.01" min="0" placeholder={stall ? String(stall.rent_price) : ''} {...input('rent_price')} />
        </Field>
        <Field label="หมายเหตุ"><input className="market-input" {...input('note')} /></Field>
      </div>
      {stall && months > 0 && (
        <div className="market-summary-box">
          <span>ค่าเช่า {formatMoney(rent)} × {months} เดือน = <strong>{formatMoney(rent * months)}</strong></span>
          <span>เงินประกัน {depositMonths} เดือน = <strong>{formatMoney(rent * depositMonths)}</strong></span>
          {endDate && <span>สิ้นสุดสัญญา {formatDate(endDate)}</span>}
          <span>ค่าไฟ{UTILITY_MODE[stall.electricity_mode].label} · ค่าน้ำ{UTILITY_MODE[stall.water_mode].label}</span>
        </div>
      )}
    </MarketModal>
  )
}

function ReasonModal({ title, label, required, confirmLabel, tone, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <MarketModal title={title} busy={busy} error={error} onClose={onClose} submitLabel={confirmLabel} submitTone={tone}
      submitDisabled={required && !reason.trim()}
      onSubmit={async () => {
        setBusy(true)
        setError('')
        try {
          await onSubmit(reason)
        } catch (requestError) {
          setError(errorMessage(requestError))
          setBusy(false)
        }
      }}>
      <Field label={label} wide><textarea className="market-input" rows="3" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
    </MarketModal>
  )
}

function Bookings({ api, bookings, stalls, vendors, categories, config, onReload, onNotify }) {
  const [status, setStatus] = useState('pending')
  const [form, setForm] = useState(false)
  const [action, setAction] = useState(null)
  const visible = status === 'all' ? bookings : bookings.filter((booking) => booking.status === status)
  const counts = Object.fromEntries(Object.keys(BOOKING_STATUS).map((key) => [key, bookings.filter((booking) => booking.status === key).length]))

  const done = (message) => {
    setAction(null)
    setForm(false)
    onNotify(message)
    onReload()
  }

  return (
    <>
      <div className="market-toolbar">
        <div className="market-legend">
          {Object.entries(BOOKING_STATUS).map(([key, info]) => (
            <button type="button" key={key} className={`market-pill ${info.tone}${status === key ? ' is-selected' : ''}`} onClick={() => setStatus(key)}>
              {info.label} {counts[key]}
            </button>
          ))}
          <button type="button" className={`market-pill is-muted${status === 'all' ? ' is-selected' : ''}`} onClick={() => setStatus('all')}>ทั้งหมด {bookings.length}</button>
        </div>
        <button type="button" className="market-btn is-primary market-toolbar-end" onClick={() => setForm(true)}>+ บันทึกการจอง</button>
      </div>
      <div className="market-scroll">
        {visible.length === 0 ? <EmptyState>ไม่มีการจองในสถานะนี้</EmptyState> : visible.map((booking) => (
          <article key={booking.id} className="market-card">
            <header className="market-card-head">
              <strong>{booking.stall_code} · {booking.vendor_name}</strong>
              <StatusPill map={BOOKING_STATUS} value={booking.status} />
            </header>
            <p>{formatDate(booking.start_date)} – {formatDate(booking.end_date)} ({booking.lease_months} เดือน) · {booking.category_name}</p>
            <p>ค่าเช่า {formatMoney(booking.rent_price)}/เดือน · เงินประกัน {formatMoney(booking.deposit_amount)} · รวมทั้งสัญญา {formatMoney(booking.total_price)}</p>
            <p className="market-muted">
              บันทึกโดย {booking.created_by_name || '-'} {formatDateTime(booking.created_at)}
              {booking.reviewed_by_name && ` · ${BOOKING_STATUS[booking.status]?.label}โดย ${booking.reviewed_by_name}`}
              {booking.contract_no && ` · สัญญา ${booking.contract_no}`}
            </p>
            {booking.reject_reason && <p className="market-muted">เหตุผล: {booking.reject_reason}</p>}
            {booking.note && <p className="market-muted">หมายเหตุ: {booking.note}</p>}
            <div className="market-actions">
              {booking.status === 'pending' && (
                <>
                  <button type="button" className="market-btn is-primary is-small" onClick={() => setAction({ type: 'approve', booking })}>อนุมัติ</button>
                  <button type="button" className="market-btn is-small" onClick={() => setAction({ type: 'reject', booking })}>ปฏิเสธ…</button>
                </>
              )}
              {(booking.status === 'pending' || booking.contract_status === 'awaiting_signature') && (
                <button type="button" className="market-btn is-small is-danger" onClick={() => setAction({ type: 'cancel', booking })}>ยกเลิก</button>
              )}
            </div>
          </article>
        ))}
      </div>
      {form && (
        <BookingForm api={api} stalls={stalls} vendors={vendors} categories={categories} config={config}
          onClose={() => setForm(false)} onSaved={done} />
      )}
      {action?.type === 'approve' && (
        <ApproveModal api={api} booking={action.booking} onClose={() => setAction(null)} onDone={done} />
      )}
      {action?.type === 'reject' && (
        <ReasonModal title={`ปฏิเสธการจอง ${action.booking.stall_code}`} label="เหตุผลที่ปฏิเสธ" required confirmLabel="ปฏิเสธ" tone="danger"
          onClose={() => setAction(null)}
          onSubmit={async (reason) => done((await api.post(`/bookings/${action.booking.id}/reject`, { reason })).message)} />
      )}
      {action?.type === 'cancel' && (
        <ReasonModal title={`ยกเลิกการจอง ${action.booking.stall_code}`} label="เหตุผล (ไม่บังคับ)" confirmLabel="ยกเลิกการจอง" tone="danger"
          onClose={() => setAction(null)}
          onSubmit={async (reason) => done((await api.post(`/bookings/${action.booking.id}/cancel`, { reason })).message)} />
      )}
    </>
  )
}

function ApproveModal({ api, booking, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <ConfirmModal
      title={`อนุมัติการจอง ${booking.stall_code}`}
      message={`ระบบจะออกสัญญาเช่าให้ ${booking.vendor_name} และรอแนบสัญญาที่เซ็นแล้วก่อนมีผล`}
      confirmLabel="อนุมัติและออกสัญญา"
      tone="primary"
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={async () => {
        setBusy(true)
        try {
          onDone((await api.post(`/bookings/${booking.id}/approve`)).message)
        } catch (requestError) {
          setError(errorMessage(requestError))
          setBusy(false)
        }
      }}
    />
  )
}

function ContractImages({ api, contract, onChanged }) {
  const [urls, setUrls] = useState({})
  const [viewIndex, setViewIndex] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const created = []
    Promise.all(contract.images.map((image) => api.get(`/leases/${contract.id}/images/${image.id}`, { responseType: 'blob' })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        created.push(url)
        return [image.id, url]
      })
      .catch(() => [image.id, null])))
      .then((entries) => {
        if (!cancelled) setUrls(Object.fromEntries(entries))
      })
    return () => {
      cancelled = true
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [api, contract.id, contract.images])

  const upload = async (files) => {
    if (files.length === 0) return
    setBusy(true)
    setError('')
    const form = new FormData()
    for (const file of files) form.append('contract_images', file)
    try {
      const data = await api.post(`/leases/${contract.id}/images`, form)
      onChanged(data)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (imageId) => {
    setBusy(true)
    setError('')
    try {
      onChanged(await api.del(`/leases/${contract.id}/images/${imageId}`))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const photos = contract.images.map((image, index) => ({ url: urls[image.id], name: `${contract.contract_no}-${index + 1}` })).filter((photo) => photo.url)
  const editable = ['awaiting_signature', 'active'].includes(contract.status)

  return (
    <section className="market-section">
      <div className="market-section-head">
        <h5>รูปสัญญาที่เซ็นแล้ว ({contract.images.length})</h5>
        {editable && (
          <label className="market-btn is-small is-primary">
            {busy ? 'กำลังอัปโหลด…' : '+ แนบรูป'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy}
              onChange={(event) => {
                upload([...event.target.files])
                event.target.value = ''
              }} />
          </label>
        )}
      </div>
      {error && <p className="market-error">{error}</p>}
      {contract.images.length === 0 ? <EmptyState>ยังไม่ได้แนบรูปสัญญา</EmptyState> : (
        <div className="market-thumbs">
          {contract.images.map((image, index) => (
            <figure key={image.id} className="market-thumb">
              {urls[image.id] ? (
                <button type="button" onClick={() => setViewIndex(photos.findIndex((photo) => photo.url === urls[image.id]))}>
                  <img src={urls[image.id]} alt={`รูปสัญญา ${index + 1}`} />
                </button>
              ) : <span className="market-muted">โหลดรูป…</span>}
              {contract.status === 'awaiting_signature' && (
                <button type="button" className="market-btn is-small is-danger" disabled={busy} onClick={() => remove(image.id)}>ลบ</button>
              )}
            </figure>
          ))}
        </div>
      )}
      {viewIndex !== null && viewIndex >= 0 && (
        <PhotoLightbox photos={photos} initialIndex={viewIndex} title={contract.contract_no} label="รูปสัญญาเช่าร้าน" onClose={() => setViewIndex(null)} />
      )}
    </section>
  )
}

function InvoiceSection({ api, contract, config, onChanged }) {
  const [form, setForm] = useState({ period_month: new Date().toISOString().slice(0, 7), electricity_units: '', water_units: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const meterElectric = contract.electricity_mode === 'meter'
  const meterWater = contract.water_mode === 'meter'

  const run = async (action) => {
    setBusy(true)
    setError('')
    try {
      onChanged(await action())
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="market-section">
      <h5>บิลรายเดือน</h5>
      {contract.status === 'active' && (
        <form className="market-inline-form" onSubmit={(event) => {
          event.preventDefault()
          run(() => api.post(`/leases/${contract.id}/invoices`, {
            period_month: form.period_month,
            electricity_units: meterElectric ? Number(form.electricity_units) : undefined,
            water_units: meterWater ? Number(form.water_units) : undefined,
          }))
        }}>
          <Field label="เดือน"><input className="market-input" type="month" value={form.period_month} onChange={(event) => setForm((current) => ({ ...current, period_month: event.target.value }))} required /></Field>
          {meterElectric && (
            <Field label={`หน่วยไฟ (${formatMoney(config.electricity_unit_price)}/หน่วย)`}>
              <input className="market-input" type="number" step="0.01" min="0" value={form.electricity_units} required
                onChange={(event) => setForm((current) => ({ ...current, electricity_units: event.target.value }))} />
            </Field>
          )}
          {meterWater && (
            <Field label={`หน่วยน้ำ (${formatMoney(config.water_unit_price)}/หน่วย)`}>
              <input className="market-input" type="number" step="0.01" min="0" value={form.water_units} required
                onChange={(event) => setForm((current) => ({ ...current, water_units: event.target.value }))} />
            </Field>
          )}
          <button type="submit" className="market-btn is-primary" disabled={busy}>ออกบิล</button>
        </form>
      )}
      {error && <p className="market-error">{error}</p>}
      {contract.invoices.length === 0 ? <EmptyState>ยังไม่มีบิล</EmptyState> : (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead><tr><th>เดือน</th><th>ค่าเช่า</th><th>ค่าไฟ</th><th>ค่าน้ำ</th><th>รวม</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {contract.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.period_month}</td>
                  <td>{formatMoney(invoice.rent_amount)}</td>
                  <td>{formatMoney(invoice.electricity_total)}{invoice.electricity_units != null && <small className="market-muted"> ({invoice.electricity_units} หน่วย)</small>}</td>
                  <td>{formatMoney(invoice.water_total)}{invoice.water_units != null && <small className="market-muted"> ({invoice.water_units} หน่วย)</small>}</td>
                  <td><strong>{formatMoney(invoice.total_amount)}</strong></td>
                  <td><StatusPill map={INVOICE_STATUS} value={invoice.status} />{invoice.paid_at && <small className="market-muted"> {formatDate(invoice.paid_at)}</small>}</td>
                  <td>{invoice.status === 'unpaid' && (
                    <button type="button" className="market-btn is-small" disabled={busy}
                      onClick={() => run(() => api.post(`/leases/invoices/${invoice.id}/pay`, {}))}>บันทึกชำระ</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function EndContractSection({ api, contract, onChanged }) {
  const [type, setType] = useState('terminated')
  const [reason, setReason] = useState('')
  const [settle, setSettle] = useState({ action: 'refund', deduction: '0', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (action) => {
    setBusy(true)
    setError('')
    try {
      onChanged(await action())
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  if (contract.status === 'active') {
    return (
      <section className="market-section">
        <h5>สิ้นสุดสัญญา</h5>
        <form className="market-inline-form" onSubmit={(event) => {
          event.preventDefault()
          run(() => api.post(`/leases/${contract.id}/end`, { type, reason }))
        }}>
          <Field label="แบบ">
            <select className="market-input" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="ended">{LEASE_STATUS.ended.label}</option>
              <option value="terminated">{LEASE_STATUS.terminated.label}</option>
            </select>
          </Field>
          <Field label={type === 'terminated' ? 'เหตุผล (บังคับ)' : 'หมายเหตุ'}>
            <input className="market-input" value={reason} onChange={(event) => setReason(event.target.value)} required={type === 'terminated'} />
          </Field>
          <button type="submit" className="market-btn is-danger" disabled={busy}>สิ้นสุดสัญญา</button>
        </form>
        {error && <p className="market-error">{error}</p>}
      </section>
    )
  }

  if (!['ended', 'terminated'].includes(contract.status)) return null
  return (
    <section className="market-section">
      <h5>เงินประกัน {formatMoney(contract.deposit_amount)}</h5>
      {contract.deposit_status === 'held' ? (
        <form className="market-inline-form" onSubmit={(event) => {
          event.preventDefault()
          run(() => api.post(`/leases/${contract.id}/deposit-settlement`, {
            action: settle.action, deduction: settle.action === 'refund' ? Number(settle.deduction || 0) : undefined, note: settle.note,
          }))
        }}>
          <Field label="จัดการ">
            <select className="market-input" value={settle.action} onChange={(event) => setSettle((current) => ({ ...current, action: event.target.value }))}>
              <option value="refund">คืนเงินประกัน</option>
              <option value="forfeit">ริบเงินประกัน</option>
            </select>
          </Field>
          {settle.action === 'refund' && (
            <Field label="หักค่าเสียหาย / ค้างชำระ" hint={contract.unpaid_total > 0 ? `ค้างชำระ ${formatMoney(contract.unpaid_total)}` : undefined}>
              <input className="market-input" type="number" min="0" step="0.01" value={settle.deduction}
                onChange={(event) => setSettle((current) => ({ ...current, deduction: event.target.value }))} />
            </Field>
          )}
          <Field label="เหตุผล / หมายเหตุ">
            <input className="market-input" value={settle.note} onChange={(event) => setSettle((current) => ({ ...current, note: event.target.value }))} />
          </Field>
          <button type="submit" className="market-btn is-primary" disabled={busy}>บันทึก</button>
        </form>
      ) : (
        <p>
          <StatusPill map={DEPOSIT_STATUS} value={contract.deposit_status} /> หัก {formatMoney(contract.deposit_deduction)} · คืน {formatMoney(contract.deposit_refunded)}
          <span className="market-muted"> · โดย {contract.deposit_settled_by} {formatDateTime(contract.deposit_settled_at)}{contract.deposit_note ? ` · ${contract.deposit_note}` : ''}</span>
        </p>
      )}
      {error && <p className="market-error">{error}</p>}
    </section>
  )
}

function ContractDetail({ api, contractId, config, onClose, onChanged }) {
  const [contract, setContract] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => api.get(`/leases/${contractId}`)
    .then((data) => setContract(data.contract))
    .catch((requestError) => setError(errorMessage(requestError))), [api, contractId])

  useEffect(() => {
    load()
  }, [load])

  const changed = (data) => {
    if (data?.contract) setContract(data.contract)
    onChanged(data?.message)
  }

  const activate = async () => {
    setBusy(true)
    setError('')
    try {
      changed(await api.post(`/leases/${contractId}/activate`))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  if (!contract) {
    return <MarketModal title="สัญญาเช่าร้าน" onClose={onClose} error={error}><EmptyState>กำลังโหลด…</EmptyState></MarketModal>
  }
  const missingImages = Math.max(0, config.contract_min_images - contract.images.length)
  return (
    <MarketModal title={`${contract.contract_no} · ${LEASE_CONTRACT_TYPE[contract.contract_type]?.label}`}
      subtitle={`${contract.stall_code} · ${contract.vendor_name}`} wide busy={busy} error={error} onClose={onClose}>
      <div className="market-detail-summary">
        <StatusPill map={LEASE_STATUS} value={contract.status} />
        <span>{formatDate(contract.start_date)} – {formatDate(contract.end_date)} ({contract.lease_months} เดือน)</span>
        <span>{formatMoney(contract.rent_price)}/เดือน</span>
        <span>ประกัน {formatMoney(contract.deposit_amount)}</span>
        <span>ไฟ{UTILITY_MODE[contract.electricity_mode].label} · น้ำ{UTILITY_MODE[contract.water_mode].label}</span>
        {contract.unpaid_count > 0 && <span className="market-pill is-pending">ค้างชำระ {contract.unpaid_count} บิล</span>}
      </div>
      <p className="market-muted">ผู้ติดต่อ {contract.contact_name} · {contract.phone} · ขาย{contract.category_name}{contract.end_reason ? ` · ${contract.end_reason}` : ''}</p>
      <div className="market-actions">
        <button type="button" className="market-btn" onClick={() => {
          if (!printContract(contract, config)) setError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up')
        }}>พิมพ์สัญญา</button>
        {contract.status === 'awaiting_signature' && (
          <button type="button" className="market-btn is-primary" disabled={busy || missingImages > 0} onClick={activate}>
            {missingImages > 0 ? `แนบรูปอีก ${missingImages} รูปเพื่อเริ่มสัญญา` : 'ยืนยันสัญญามีผล'}
          </button>
        )}
      </div>
      <details className="market-terms">
        <summary>เงื่อนไขในสัญญา</summary>
        <p>{contract.terms}</p>
      </details>
      <ContractImages api={api} contract={contract} onChanged={changed} />
      {['active', 'ended', 'terminated'].includes(contract.status) && <InvoiceSection api={api} contract={contract} config={config} onChanged={changed} />}
      <EndContractSection api={api} contract={contract} onChanged={changed} />
    </MarketModal>
  )
}

function Contracts({ api, contracts, config, onReload, onNotify }) {
  const [status, setStatus] = useState('all')
  const [openId, setOpenId] = useState(null)
  const visible = status === 'all' ? contracts : contracts.filter((contract) => contract.status === status)
  return (
    <>
      <div className="market-toolbar">
        <div className="market-legend">
          <button type="button" className={`market-pill is-muted${status === 'all' ? ' is-selected' : ''}`} onClick={() => setStatus('all')}>ทั้งหมด {contracts.length}</button>
          {Object.entries(LEASE_STATUS).map(([key, info]) => (
            <button type="button" key={key} className={`market-pill ${info.tone}${status === key ? ' is-selected' : ''}`} onClick={() => setStatus(key)}>
              {info.label} {contracts.filter((contract) => contract.status === key).length}
            </button>
          ))}
        </div>
      </div>
      <div className="market-scroll">
        {visible.length === 0 ? <EmptyState>ยังไม่มีสัญญา สัญญาจะถูกออกเมื่ออนุมัติการจอง</EmptyState> : (
          <div className="market-table-wrap">
            <table className="market-table">
              <thead><tr><th>เลขที่</th><th>ประเภทสัญญา</th><th>ล็อก</th><th>ผู้เช่า</th><th>ช่วงสัญญา</th><th>ค่าเช่า</th><th>ค้างชำระ</th><th>สถานะ</th></tr></thead>
              <tbody>
                {visible.map((contract) => (
                  <tr key={contract.id} className="is-clickable" onClick={() => setOpenId(contract.id)}>
                    <td><strong>{contract.contract_no}</strong></td>
                    <td>{LEASE_CONTRACT_TYPE[contract.contract_type]?.label}</td>
                    <td>{contract.stall_code}</td>
                    <td>{contract.vendor_name}</td>
                    <td>{formatDate(contract.start_date)} – {formatDate(contract.end_date)}</td>
                    <td>{formatMoney(contract.rent_price)}</td>
                    <td>{contract.unpaid_count > 0 ? formatMoney(contract.unpaid_total) : '-'}</td>
                    <td>
                      <StatusPill map={LEASE_STATUS} value={contract.status} />
                      {['ended', 'terminated'].includes(contract.status) && contract.deposit_status === 'held' && <span className="market-pill is-pending">รอจัดการเงินประกัน</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {openId && (
        <ContractDetail api={api} contractId={openId} config={config} onClose={() => setOpenId(null)}
          onChanged={(message) => {
            if (message) onNotify(message)
            onReload()
          }} />
      )}
    </>
  )
}

export default function MarketLeases({ api, section, stalls, vendors, categories, config, onNotify, onReload: reloadShared }) {
  const [bookings, setBookings] = useState([])
  const [contracts, setContracts] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(() => Promise.all([api.get('/bookings'), api.get('/leases')])
    .then(([bookingData, contractData]) => {
      setBookings(bookingData.bookings)
      setContracts(contractData.contracts)
    })
    .catch((requestError) => setError(errorMessage(requestError, 'โหลดการจองและสัญญาไม่สำเร็จ'))), [api])

  useEffect(() => {
    load()
  }, [load])

  const reload = useMemo(() => () => {
    load()
    reloadShared()
  }, [load, reloadShared])

  return (
    <div className="market-panel">
      {error && <p className="market-error">{error}</p>}
      {section === 'bookings'
        ? <Bookings api={api} bookings={bookings} stalls={stalls} vendors={vendors} categories={categories} config={config} onReload={reload} onNotify={onNotify} />
        : <Contracts api={api} contracts={contracts} config={config} onReload={reload} onNotify={onNotify} />}
    </div>
  )
}
