import { useState } from 'react'
import { VENDOR_STATUS, statusOptions } from '../utils/marketStatus.js'
import { CheckField, EmptyState, Field, MarketModal, StatusPill } from './MarketShared.jsx'
import { errorMessage } from '../utils/marketUi.js'

const EMPTY_VENDOR = { vendor_name: '', contact_name: '', phone: '', email: '', id_card_or_tax_id: '', address: '', status: 'active' }

function VendorForm({ api, vendor, onClose, onSaved }) {
  const [form, setForm] = useState(vendor ? { ...EMPTY_VENDOR, ...Object.fromEntries(Object.entries(vendor).map(([key, value]) => [key, value ?? ''])) } : EMPTY_VENDOR)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = (key) => ({ value: form[key], onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })) })

  const submit = async () => {
    setBusy(true)
    setError('')
    const payload = Object.fromEntries(Object.keys(EMPTY_VENDOR).map((key) => [key, form[key]]))
    try {
      onSaved(vendor ? await api.put(`/vendors/${vendor.id}`, payload) : await api.post('/vendors', payload))
    } catch (requestError) {
      setError(errorMessage(requestError))
      setBusy(false)
    }
  }

  return (
    <MarketModal title={vendor ? `แก้ไข ${vendor.vendor_name}` : 'เพิ่มผู้ค้า'} wide busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      <div className="market-form-grid">
        <Field label="ชื่อร้าน / ผู้ค้า"><input className="market-input" {...input('vendor_name')} required /></Field>
        <Field label="ชื่อผู้ติดต่อ"><input className="market-input" {...input('contact_name')} required /></Field>
        <Field label="เบอร์โทร"><input className="market-input" inputMode="tel" {...input('phone')} required /></Field>
        <Field label="อีเมล (ไม่บังคับ)"><input className="market-input" type="email" {...input('email')} /></Field>
        <Field label="เลขบัตรประชาชน / เลขผู้เสียภาษี" hint="13 หลัก แสดงเฉพาะ 4 ตัวท้ายในรายการ">
          <input className="market-input" inputMode="numeric" maxLength={13} {...input('id_card_or_tax_id')} required />
        </Field>
        <Field label="สถานะ">
          <select className="market-input" {...input('status')}>
            {statusOptions(VENDOR_STATUS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="ที่อยู่ (ไม่บังคับ)" wide><textarea className="market-input" rows="2" {...input('address')} /></Field>
    </MarketModal>
  )
}

export function MarketVendors({ api, vendors, onReload, onNotify }) {
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const keyword = search.trim().toLocaleLowerCase('th-TH')
  const visible = vendors.filter((vendor) => !keyword || [vendor.vendor_name, vendor.contact_name, vendor.phone, vendor.email]
    .filter(Boolean).join(' ').toLocaleLowerCase('th-TH').includes(keyword))

  const openEdit = async (vendor) => {
    setError('')
    try {
      const data = await api.get(`/vendors/${vendor.id}`)
      setForm({ vendor: data.vendor })
    } catch (requestError) {
      setError(errorMessage(requestError))
    }
  }

  return (
    <div className="market-panel">
      <div className="market-toolbar">
        <input className="market-input is-compact" placeholder="ค้นหาผู้ค้า ชื่อ เบอร์โทร" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="market-btn is-primary market-toolbar-end" onClick={() => setForm({})}>+ เพิ่มผู้ค้า</button>
      </div>
      {error && <p className="market-error">{error}</p>}
      <div className="market-scroll">
        {visible.length === 0 ? <EmptyState>ยังไม่มีผู้ค้า</EmptyState> : (
          <div className="market-table-wrap">
            <table className="market-table">
              <thead><tr><th>ร้าน / ผู้ค้า</th><th>ผู้ติดต่อ</th><th>เบอร์โทร</th><th>เลขผู้เสียภาษี</th><th>สัญญาที่ใช้อยู่</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {visible.map((vendor) => (
                  <tr key={vendor.id}>
                    <td><strong>{vendor.vendor_name}</strong>{vendor.email && <><br /><small className="market-muted">{vendor.email}</small></>}</td>
                    <td>{vendor.contact_name}</td>
                    <td>{vendor.phone}</td>
                    <td className="market-mono">{vendor.id_card_or_tax_id}</td>
                    <td>{vendor.active_leases || '-'}</td>
                    <td><StatusPill map={VENDOR_STATUS} value={vendor.status} /></td>
                    <td><button type="button" className="market-btn is-small" onClick={() => openEdit(vendor)}>แก้ไข</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && (
        <VendorForm api={api} vendor={form.vendor} onClose={() => setForm(null)}
          onSaved={(data) => {
            setForm(null)
            onNotify(data.message)
            onReload()
          }} />
      )}
    </div>
  )
}

function CategoryForm({ api, category, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: category?.name ?? '', requires_water: category?.requires_water ?? false, is_active: category?.is_active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      onSaved(category ? await api.put(`/categories/${category.id}`, form) : await api.post('/categories', form))
    } catch (requestError) {
      setError(errorMessage(requestError))
      setBusy(false)
    }
  }
  return (
    <MarketModal title={category ? `แก้ไขประเภท ${category.name}` : 'เพิ่มประเภทสินค้า'} busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      <Field label="ชื่อประเภท" wide><input className="market-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
      <div className="market-check-row">
        <CheckField label="ต้องใช้ล็อกที่มีน้ำ (เช่น อาหาร)" checked={form.requires_water} onChange={(value) => setForm((current) => ({ ...current, requires_water: value }))} />
        {category && <CheckField label="ใช้งาน" checked={form.is_active} onChange={(value) => setForm((current) => ({ ...current, is_active: value }))} />}
      </div>
    </MarketModal>
  )
}

export function MarketCategories({ api, categories, onReload, onNotify }) {
  const [form, setForm] = useState(null)
  return (
    <div className="market-panel">
      <div className="market-toolbar">
        <p className="market-muted">ประเภทที่ “ต้องใช้น้ำ” จะเลือกได้เฉพาะล็อกที่มีน้ำ และใช้แยกสัญญาเช่าร้านอาหารออกจากสัญญาเช่าร้านค้า</p>
        <button type="button" className="market-btn is-primary market-toolbar-end" onClick={() => setForm({})}>+ เพิ่มประเภท</button>
      </div>
      <div className="market-scroll">
        <div className="market-chip-grid">
          {categories.map((category) => (
            <button type="button" key={category.id} className={`market-category${category.is_active ? '' : ' is-inactive'}`} onClick={() => setForm({ category })}>
              <strong>{category.name}</strong>
              <span>{category.requires_water ? 'ต้องใช้น้ำ · สัญญาร้านอาหาร' : 'สัญญาร้านค้า'}</span>
              <span className="market-muted">สินค้า {category.product_count} รายการ{category.is_active ? '' : ' · ปิดใช้งาน'}</span>
            </button>
          ))}
        </div>
      </div>
      {form && (
        <CategoryForm api={api} category={form.category} onClose={() => setForm(null)}
          onSaved={(data) => {
            setForm(null)
            onNotify(data.message)
            onReload()
          }} />
      )}
    </div>
  )
}
