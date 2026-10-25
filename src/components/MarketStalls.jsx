import { useCallback, useEffect, useMemo, useState } from 'react'
import { LEASE_CONTRACT_TYPE, LEASE_STATUS, STALL_KIND, STALL_STATUS, UTILITY_MODE, statusOptions } from '../utils/marketStatus.js'
import {
  CheckField, ConfirmModal, EmptyState, Field, MarketModal, StatusPill,
} from './MarketShared.jsx'
import { errorMessage, formatDate, formatMoney } from '../utils/marketUi.js'

const EMPTY_STALL = {
  code: '', unit_kind: 'rentable', zone: '', shop_name: '', map_row: '1', map_col: '', width_m: '', depth_m: '',
  has_water: false, has_grease_trap: false, has_exhaust: false, power_amp: '15', electricity_mode: 'meter',
  water_mode: 'meter', rent_price: '', note: '', category_ids: [], is_sandbox: false,
}

const EMPTY_PRODUCT = { category_id: '', name: '', unit: '', price: '', quantity: '0', quantity_limit: '' }

function stallFeatures(stall) {
  return [
    stall.has_water && 'น้ำ',
    stall.has_grease_trap && 'บ่อดักไขมัน',
    stall.has_exhaust && 'ท่อดูดควัน',
    stall.unit_kind === 'rentable' && `ไฟ ${stall.power_amp}A`,
  ].filter(Boolean)
}

function currentLease(stall) {
  return stall.leases.find((lease) => lease.status === 'active') || stall.leases[0] || null
}

function StallTile({ stall, onOpen }) {
  const lease = currentLease(stall)
  const common = stall.unit_kind === 'common'
  return (
    <button
      type="button"
      className={`market-tile${common ? ' is-common' : ''} ${STALL_STATUS[stall.status]?.tone || ''}`}
      style={{ flexGrow: stall.width_m }}
      onClick={() => onOpen(stall)}
    >
      <span className="market-tile-head">
        <strong>{stall.code}</strong>
        {!common && <StatusPill map={STALL_STATUS} value={stall.status} />}
      </span>
      <span className="market-tile-name">{common ? stall.shop_name || STALL_KIND.common.label : stall.shop_name || lease?.vendor_name || stall.zone || '-'}</span>
      {!common && (
        <>
          <span className="market-tile-meta">
            {stall.is_sandbox ? 'ล็อกทดลอง API' : stall.rent_price > 0 ? `${formatMoney(stall.rent_price)}/เดือน` : 'ยังไม่ตั้งค่าเช่า'}
          </span>
          <span className="market-tile-meta">{stallFeatures(stall).join(' · ')}</span>
          <span className="market-tile-foot">
            {stall.product_count > 0 && <span>สินค้า {stall.product_count}</span>}
            {stall.low_stock_count > 0 && <span className="is-warning">ใกล้หมด {stall.low_stock_count}</span>}
            {stall.pending_bookings > 0 && <span className="is-info">รออนุมัติ {stall.pending_bookings}</span>}
          </span>
        </>
      )}
    </button>
  )
}

function FloorMap({ stalls, onOpen }) {
  const rows = useMemo(() => {
    const byRow = new Map()
    for (const stall of stalls) byRow.set(stall.map_row, [...(byRow.get(stall.map_row) || []), stall])
    return [...byRow.entries()].sort(([a], [b]) => a - b).map(([row, items]) => [row, items.sort((a, b) => a.map_col - b.map_col)])
  }, [stalls])
  if (rows.length === 0) return <EmptyState>ยังไม่มีล็อก กด “เพิ่มล็อก” เพื่อเริ่ม</EmptyState>
  return (
    <div className="market-floor">
      {rows.map(([row, items]) => (
        <div className="market-floor-row" key={row}>
          <span className="market-floor-label">แถว {row}</span>
          <div className="market-floor-units">
            {items.map((stall) => <StallTile key={stall.id} stall={stall} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function StallTable({ stalls, onOpen }) {
  if (stalls.length === 0) return <EmptyState>ไม่มีล็อกที่ตรงกับตัวกรอง</EmptyState>
  return (
    <div className="market-table-wrap">
      <table className="market-table">
        <thead>
          <tr><th>รหัส</th><th>โซน</th><th>ร้าน</th><th>ขนาด</th><th>ค่าเช่า/เดือน</th><th>ระบบ</th><th>สถานะ</th></tr>
        </thead>
        <tbody>
          {stalls.map((stall) => (
            <tr key={stall.id} onClick={() => onOpen(stall)} className="is-clickable">
              <td><strong>{stall.code}</strong></td>
              <td>{stall.zone || '-'}</td>
              <td>{stall.shop_name || currentLease(stall)?.vendor_name || '-'}</td>
              <td>{stall.width_m} × {stall.depth_m} ม.</td>
              <td>{stall.unit_kind === 'rentable' ? formatMoney(stall.rent_price) : '-'}</td>
              <td>{stallFeatures(stall).join(' · ') || '-'}</td>
              <td>{stall.unit_kind === 'rentable' ? <StatusPill map={STALL_STATUS} value={stall.status} /> : STALL_KIND.common.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StallForm({ api, stall, categories, onClose, onSaved }) {
  const [form, setForm] = useState(() => (stall ? {
    ...EMPTY_STALL,
    ...Object.fromEntries(Object.entries(stall).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value ?? ''])),
    category_ids: stall.category_ids,
  } : EMPTY_STALL))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const input = (key) => ({ value: form[key], onChange: (event) => set(key)(event.target.value) })
  const rentable = form.unit_kind === 'rentable'

  const toggleCategory = (id) => setForm((current) => ({
    ...current,
    category_ids: current.category_ids.includes(id) ? current.category_ids.filter((item) => item !== id) : [...current.category_ids, id],
  }))

  const submit = async () => {
    setBusy(true)
    setError('')
    const payload = {
      code: form.code, unit_kind: form.unit_kind, zone: form.zone, shop_name: form.shop_name, note: form.note,
      map_row: Number(form.map_row), map_col: Number(form.map_col), width_m: Number(form.width_m), depth_m: Number(form.depth_m),
      has_water: form.has_water, has_grease_trap: form.has_grease_trap, has_exhaust: form.has_exhaust,
      power_amp: Number(form.power_amp), electricity_mode: form.electricity_mode, water_mode: form.water_mode,
      rent_price: rentable ? Number(form.rent_price || 0) : 0, category_ids: rentable ? form.category_ids : [],
      ...(stall ? {} : { is_sandbox: form.is_sandbox }),
    }
    try {
      const data = stall ? await api.put(`/stalls/${stall.id}`, payload) : await api.post('/stalls', payload)
      onSaved(data.message)
    } catch (requestError) {
      setError(errorMessage(requestError))
      setBusy(false)
    }
  }

  return (
    <MarketModal title={stall ? `แก้ไขล็อก ${stall.code}` : 'เพิ่มล็อก'} wide busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      <div className="market-form-grid">
        <Field label="รหัสล็อก" hint="A-Z 0-9 และ - เช่น R-03"><input className="market-input" {...input('code')} required /></Field>
        <Field label="ชนิดช่อง">
          <select className="market-input" {...input('unit_kind')}>
            {statusOptions(STALL_KIND).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="โซน"><input className="market-input" {...input('zone')} /></Field>
        <Field label={rentable ? 'ชื่อร้าน (ถ้ามี)' : 'ชื่อที่แสดงบนผัง'}><input className="market-input" {...input('shop_name')} /></Field>
        <Field label="แถวบนผัง"><input className="market-input" type="number" min="1" {...input('map_row')} required /></Field>
        <Field label="ลำดับในแถว"><input className="market-input" type="number" min="1" {...input('map_col')} required /></Field>
        <Field label="หน้ากว้าง (ม.)"><input className="market-input" type="number" step="0.01" min="0.01" {...input('width_m')} required /></Field>
        <Field label="ความลึก (ม.)"><input className="market-input" type="number" step="0.01" min="0.01" {...input('depth_m')} required /></Field>
        {rentable && (
          <>
            <Field label="ค่าเช่าต่อเดือน (บาท)" hint="ตั้งเป็น 0 ได้ แต่จะเปิดให้เช่าไม่ได้จนกว่าจะตั้งราคา">
              <input className="market-input" type="number" step="0.01" min="0" {...input('rent_price')} />
            </Field>
            <Field label="มิเตอร์ไฟ (A)"><input className="market-input" type="number" min="1" {...input('power_amp')} /></Field>
            <Field label="ค่าไฟ">
              <select className="market-input" {...input('electricity_mode')}>
                {statusOptions(UTILITY_MODE).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="ค่าน้ำ">
              <select className="market-input" {...input('water_mode')}>
                {statusOptions(UTILITY_MODE).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </>
        )}
      </div>
      {rentable && (
        <>
          <div className="market-check-row">
            <CheckField label="มีน้ำ / ท่อระบาย" checked={form.has_water} onChange={set('has_water')} />
            <CheckField label="บ่อดักไขมัน" checked={form.has_grease_trap} onChange={set('has_grease_trap')} />
            <CheckField label="ท่อดูดควัน" checked={form.has_exhaust} onChange={set('has_exhaust')} />
            {!stall && <CheckField label="ล็อกทดลองสำหรับ key แบบ test" checked={form.is_sandbox} onChange={set('is_sandbox')} />}
          </div>
          <div className="market-field is-wide">
            <span className="market-field-label">ประเภทสินค้าที่อนุญาต</span>
            <div className="market-chip-row">
              {categories.filter((category) => category.is_active || form.category_ids.includes(category.id)).map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={`market-chip${form.category_ids.includes(category.id) ? ' is-selected' : ''}`}
                  onClick={() => toggleCategory(category.id)}
                >
                  {category.name}{category.requires_water ? ' · ต้องใช้น้ำ' : ''}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <Field label="หมายเหตุ" wide><textarea className="market-input" rows="2" {...input('note')} /></Field>
    </MarketModal>
  )
}

function ProductForm({ api, stall, product, categories, onClose, onSaved }) {
  const allowed = categories.filter((category) => stall.category_ids.includes(category.id))
  const [form, setForm] = useState(() => (product ? {
    category_id: String(product.category_id), name: product.name, unit: product.unit, price: String(product.price),
    quantity: String(product.quantity), quantity_limit: String(product.quantity_limit),
  } : { ...EMPTY_PRODUCT, category_id: allowed[0] ? String(allowed[0].id) : '' }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = (key) => ({ value: form[key], onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })) })

  const submit = async () => {
    setBusy(true)
    setError('')
    const payload = {
      category_id: Number(form.category_id), name: form.name, unit: form.unit, price: Number(form.price),
      quantity: Number(form.quantity), quantity_limit: Number(form.quantity_limit),
    }
    try {
      const data = product
        ? await api.put(`/stalls/${stall.id}/products/${product.id}`, payload)
        : await api.post(`/stalls/${stall.id}/products`, payload)
      onSaved(data)
    } catch (requestError) {
      setError(errorMessage(requestError))
      setBusy(false)
    }
  }

  return (
    <MarketModal title={product ? `แก้ไข ${product.name}` : `เพิ่มสินค้า ${stall.code}`} busy={busy} error={error} onClose={onClose} onSubmit={submit}>
      {allowed.length === 0 ? <EmptyState>ล็อกนี้ยังไม่ได้ตั้งประเภทสินค้าที่อนุญาต ให้แก้ไขล็อกก่อน</EmptyState> : (
        <div className="market-form-grid">
          <Field label="ประเภท">
            <select className="market-input" {...input('category_id')}>
              {allowed.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="ชื่อสินค้า"><input className="market-input" {...input('name')} required /></Field>
          <Field label="หน่วย" hint="เช่น จาน แก้ว ชิ้น"><input className="market-input" {...input('unit')} required /></Field>
          <Field label="ราคา (บาท)"><input className="market-input" type="number" step="0.01" min="0" {...input('price')} required /></Field>
          <Field label="จำนวน"><input className="market-input" type="number" min="0" {...input('quantity')} required /></Field>
          <Field label="จำนวนสูงสุด (limit)" hint="ระบบภายนอกตั้งจำนวนเกินนี้ไม่ได้"><input className="market-input" type="number" min="0" {...input('quantity_limit')} required /></Field>
        </div>
      )}
    </MarketModal>
  )
}

function StallDetail({ api, stall, categories, config, onClose, onEdit, onChanged }) {
  const [products, setProducts] = useState(null)
  const [productForm, setProductForm] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rentable = stall.unit_kind === 'rentable'
  const categoryName = (id) => categories.find((category) => category.id === id)?.name || '-'
  const lowStock = (product) => product.quantity * 100 <= product.quantity_limit * (config?.low_stock_percent ?? 0)

  const loadProducts = useCallback(() => {
    if (!rentable) return undefined
    return api.get(`/stalls/${stall.id}/products`)
      .then((data) => setProducts(data.products))
      .catch((requestError) => setError(errorMessage(requestError)))
  }, [api, rentable, stall.id])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const runAction = async (action) => {
    setBusy(true)
    setError('')
    try {
      const data = await action()
      setConfirm(null)
      onChanged(data.message)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <MarketModal title={`${stall.code}${stall.shop_name ? ` · ${stall.shop_name}` : ''}`} subtitle={stall.zone} wide busy={busy} error={error} onClose={onClose}>
      <div className="market-detail-summary">
        <span>{stall.width_m} × {stall.depth_m} ม. ({Math.round(stall.width_m * stall.depth_m * 100) / 100} ตร.ม.)</span>
        {rentable && <span>{stall.rent_price > 0 ? `${formatMoney(stall.rent_price)}/เดือน` : 'ยังไม่ตั้งค่าเช่า'}</span>}
        {rentable && <span>ค่าไฟ{UTILITY_MODE[stall.electricity_mode].label} · ค่าน้ำ{UTILITY_MODE[stall.water_mode].label}</span>}
        {stallFeatures(stall).length > 0 && <span>{stallFeatures(stall).join(' · ')}</span>}
        {rentable && <StatusPill map={STALL_STATUS} value={stall.status} />}
      </div>
      {rentable && stall.category_ids.length > 0 && (
        <p className="market-muted">อนุญาต: {stall.category_ids.map(categoryName).join(', ')}</p>
      )}
      {stall.note && <p className="market-muted">{stall.note}</p>}
      {config && rentable && (
        <p className="market-muted">กติกา: เปิด {config.open_time}–{config.close_time} น. · รายละเอียดอยู่ในเงื่อนไขสัญญา</p>
      )}
      <div className="market-actions">
        <button type="button" className="market-btn" onClick={onEdit}>แก้ไขล็อก</button>
        {rentable && !stall.is_sandbox && stall.status === 'closed' && (
          <button type="button" className="market-btn is-primary" disabled={busy}
            onClick={() => runAction(() => api.patch(`/stalls/${stall.id}/status`, { status: 'available' }))}>เปิดให้เช่า</button>
        )}
        {rentable && !stall.is_sandbox && stall.status === 'available' && (
          <button type="button" className="market-btn" disabled={busy}
            onClick={() => runAction(() => api.patch(`/stalls/${stall.id}/status`, { status: 'closed' }))}>ปิดล็อก</button>
        )}
        <button type="button" className="market-btn is-danger" onClick={() => setConfirm('delete')}>ลบล็อก</button>
      </div>

      {stall.leases.length > 0 && (
        <section className="market-section">
          <h5>สัญญาของล็อกนี้</h5>
          {stall.leases.map((lease) => (
            <div key={lease.id} className="market-row-card">
              <strong>{lease.contract_no}</strong>
              <span>{LEASE_CONTRACT_TYPE[lease.contract_type]?.label}</span>
              <span>{lease.vendor_name} ({lease.phone})</span>
              <span>{formatDate(lease.start_date)} – {formatDate(lease.end_date)}</span>
              <StatusPill map={LEASE_STATUS} value={lease.status} />
            </div>
          ))}
        </section>
      )}

      {rentable && (
        <section className="market-section">
          <div className="market-section-head">
            <h5>สินค้า / เมนู</h5>
            <button type="button" className="market-btn is-primary is-small" onClick={() => setProductForm({})}>+ เพิ่มสินค้า</button>
          </div>
          {products === null ? <EmptyState>กำลังโหลด…</EmptyState> : products.length === 0 ? <EmptyState>ยังไม่มีสินค้า</EmptyState> : (
            <div className="market-table-wrap">
              <table className="market-table">
                <thead><tr><th>ชื่อ</th><th>ประเภท</th><th>ราคา</th><th>จำนวน / limit</th><th>แก้ล่าสุด</th><th /></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name} <small className="market-muted">/{product.unit}</small></td>
                      <td>{product.category_name}</td>
                      <td>{formatMoney(product.price)}</td>
                      <td>
                        <span className={`market-stock${lowStock(product) ? ' is-low' : ''}`}>
                          <span style={{ width: `${product.quantity_limit > 0 ? (product.quantity / product.quantity_limit) * 100 : 0}%` }} />
                        </span>
                        {product.quantity}/{product.quantity_limit}
                      </td>
                      <td className="market-muted">
                        {product.updated_by_role === 'api' ? `API: ${product.updated_by_client_name || '-'}` : product.updated_by_name || product.updated_by_role || '-'}
                        <br />{formatDate(product.updated_at, true)}
                      </td>
                      <td className="market-cell-actions">
                        <button type="button" className="market-btn is-small" onClick={() => setProductForm({ product })}>แก้ไข</button>
                        <button type="button" className="market-btn is-small is-danger" onClick={() => setConfirm({ product })}>ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {productForm && (
        <ProductForm
          api={api}
          stall={stall}
          product={productForm.product}
          categories={categories}
          onClose={() => setProductForm(null)}
          onSaved={(data) => {
            setProducts(data.products)
            setProductForm(null)
            onChanged(data.message, { keepOpen: true })
          }}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmModal
          title={`ลบล็อก ${stall.code}`}
          message="ลบได้เฉพาะล็อกที่ไม่เคยมีการจอง ถ้ามีประวัติแล้วให้ปิดล็อกแทน"
          confirmLabel="ลบล็อก"
          busy={busy}
          error={error}
          onClose={() => setConfirm(null)}
          onConfirm={() => runAction(() => api.del(`/stalls/${stall.id}`))}
        />
      )}
      {confirm?.product && (
        <ConfirmModal
          title={`ลบ ${confirm.product.name}`}
          message="ระบบภายนอกที่ใช้สินค้านี้จะอ่านไม่เจออีก"
          confirmLabel="ลบสินค้า"
          busy={busy}
          error={error}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            setBusy(true)
            try {
              const data = await api.del(`/stalls/${stall.id}/products/${confirm.product.id}`)
              setProducts(data.products)
              setConfirm(null)
              onChanged(data.message, { keepOpen: true })
            } catch (requestError) {
              setError(errorMessage(requestError))
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
    </MarketModal>
  )
}

export default function MarketStalls({ api, stalls, categories, config, onReload, onNotify }) {
  const [view, setView] = useState('map')
  const [zone, setZone] = useState('all')
  const [status, setStatus] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [form, setForm] = useState(null)

  const live = stalls.filter((stall) => !stall.is_sandbox)
  const sandbox = stalls.filter((stall) => stall.is_sandbox)
  const zones = [...new Set(live.map((stall) => stall.zone).filter(Boolean))]
  const filtered = live.filter((stall) => (zone === 'all' || stall.zone === zone)
    && (status === 'all' || (stall.unit_kind === 'rentable' && stall.status === status)))
  const openStall = stalls.find((stall) => stall.id === openId)
  const counts = Object.fromEntries(Object.keys(STALL_STATUS).map((key) => [key, live.filter((stall) => stall.unit_kind === 'rentable' && stall.status === key).length]))

  const handleChanged = (message, { keepOpen = false } = {}) => {
    if (!keepOpen) setOpenId(null)
    onNotify(message)
    onReload()
  }

  return (
    <div className="market-panel">
      <div className="market-toolbar">
        <div className="market-segment">
          <button type="button" className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')}>ผัง</button>
          <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}>รายการ</button>
        </div>
        <select className="market-input is-compact" value={zone} onChange={(event) => setZone(event.target.value)} aria-label="โซน">
          <option value="all">ทุกโซน</option>
          {zones.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="market-legend">
          {Object.entries(STALL_STATUS).map(([key, info]) => (
            <button type="button" key={key} className={`market-pill ${info.tone}${status === key ? ' is-selected' : ''}`}
              onClick={() => setStatus((current) => (current === key ? 'all' : key))}>
              {info.label} {counts[key]}
            </button>
          ))}
        </div>
        <button type="button" className="market-btn is-primary market-toolbar-end" onClick={() => setForm({})}>+ เพิ่มล็อก</button>
      </div>

      <div className="market-scroll">
        {view === 'map' ? <FloorMap stalls={filtered} onOpen={(stall) => setOpenId(stall.id)} /> : <StallTable stalls={filtered} onOpen={(stall) => setOpenId(stall.id)} />}
        {sandbox.length > 0 && (
          <section className="market-section">
            <h5>ล็อกทดลองสำหรับ key แบบ test</h5>
            <p className="market-muted">ไม่แสดงในผังจริงและจองไม่ได้ ใช้ให้เพื่อนต่างโปรเจกต์ทดสอบ API</p>
            <div className="market-floor-units">
              {sandbox.map((stall) => <StallTile key={stall.id} stall={stall} onOpen={() => setOpenId(stall.id)} />)}
            </div>
          </section>
        )}
      </div>

      {openStall && (
        <StallDetail
          key={openStall.id}
          api={api}
          stall={openStall}
          categories={categories}
          config={config}
          onClose={() => setOpenId(null)}
          onEdit={() => setForm({ stall: openStall })}
          onChanged={handleChanged}
        />
      )}
      {form && (
        <StallForm
          api={api}
          stall={form.stall}
          categories={categories}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null)
            handleChanged(message, { keepOpen: Boolean(form.stall) })
          }}
        />
      )}
    </div>
  )
}
