import { useCallback, useEffect, useState } from 'react'
import ThaiDatePicker from './ThaiDatePicker.jsx'
import { API_KEY_MODE, MARKET_SCOPES, statusOptions } from '../utils/marketStatus.js'
import { MARKET_PUBLIC_PREFIX } from '../config/serviceRoutes.js'
import {
  CheckField, ConfirmModal, EmptyState, Field, MarketModal, Pager,
} from './MarketShared.jsx'
import { errorMessage, formatDate, formatDateTime } from '../utils/marketUi.js'

function clientStatus(client) {
  if (!client.is_active) return { label: 'ระงับ', tone: 'is-closed' }
  if (client.expired) return { label: 'หมดอายุ', tone: 'is-closed' }
  return { label: 'ใช้งาน', tone: 'is-active' }
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function KeyForm({ api, client, stalls, origins, config, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: client?.name ?? '',
    project_name: client?.project_name ?? '',
    contact_email: client?.contact_email ?? '',
    mode: client?.mode ?? 'test',
    scopes: client?.scopes ?? ['stalls:read', 'products:read'],
    stall_ids: client?.stall_ids ?? [],
    origin_ids: client?.origin_ids ?? [],
    allowed_ips: (client?.allowed_ips ?? []).join('\n'),
    rate_limit_per_min: String(client?.rate_limit_per_min ?? config.default_rate_limit_per_min),
    expires_at: client?.expires_at ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const input = (key) => ({ value: form[key], onChange: (event) => set(key)(event.target.value) })
  const choices = stalls.filter((stall) => stall.unit_kind === 'rentable' && stall.is_sandbox === (form.mode === 'test'))

  const submit = async () => {
    setBusy(true)
    setError('')
    const payload = {
      name: form.name, project_name: form.project_name, contact_email: form.contact_email, scopes: form.scopes,
      stall_ids: form.stall_ids.filter((id) => choices.some((stall) => stall.id === id)), origin_ids: form.origin_ids,
      allowed_ips: form.allowed_ips.split(/[\s,]+/).filter(Boolean), rate_limit_per_min: Number(form.rate_limit_per_min),
      expires_at: form.expires_at || (client ? null : undefined),
      ...(client ? {} : { mode: form.mode }),
    }
    try {
      onSaved(client ? await api.patch(`/api-clients/${client.id}`, payload) : await api.post('/api-clients', payload))
    } catch (requestError) {
      setError(errorMessage(requestError))
      setBusy(false)
    }
  }

  return (
    <MarketModal title={client ? `แก้ไข ${client.name}` : 'สร้าง API key'} wide busy={busy} error={error} onClose={onClose} onSubmit={submit}
      submitLabel={client ? 'บันทึก' : 'สร้าง key'}>
      <div className="market-form-grid">
        <Field label="ชื่อระบบ"><input className="market-input" {...input('name')} required /></Field>
        <Field label="โปรเจกต์ของผู้ขอ"><input className="market-input" {...input('project_name')} required /></Field>
        <Field label="อีเมลผู้ติดต่อ"><input className="market-input" type="email" {...input('contact_email')} required /></Field>
        <Field label="ชนิด key" hint={client ? 'เปลี่ยนชนิดไม่ได้ ให้สร้าง key ใหม่' : 'แนะนำให้ออก test ก่อน แล้วค่อยออก live'}>
          <select className="market-input" value={form.mode} disabled={Boolean(client)}
            onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value, stall_ids: [] }))}>
            {statusOptions(API_KEY_MODE).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="จำกัดการเรียกต่อนาที"><input className="market-input" type="number" min="1" {...input('rate_limit_per_min')} /></Field>
        <Field label="วันหมดอายุ" hint={client ? 'ว่าง = ไม่หมดอายุ' : `ว่าง = ${config.key_default_expiry_days} วันนับจากวันนี้`}>
          <ThaiDatePicker value={form.expires_at} onChange={set('expires_at')} className="market-input" minDate={new Date()} />
        </Field>
      </div>
      <div className="market-field is-wide">
        <span className="market-field-label">สิทธิ์ (scope)</span>
        <div className="market-check-row">
          {Object.entries(MARKET_SCOPES).map(([scope, info]) => (
            <CheckField key={scope} label={`${info.label} (${scope})`} checked={form.scopes.includes(scope)} onChange={() => set('scopes')(toggle(form.scopes, scope))} />
          ))}
        </div>
      </div>
      <div className="market-field is-wide">
        <span className="market-field-label">ล็อกที่ key นี้เข้าถึงได้ {form.mode === 'test' ? '(เฉพาะล็อกทดลอง)' : '(เฉพาะล็อกจริง)'}</span>
        <div className="market-chip-row">
          {choices.length === 0 && <span className="market-muted">ไม่มีล็อกให้เลือก</span>}
          {choices.map((stall) => (
            <button type="button" key={stall.id} className={`market-chip${form.stall_ids.includes(stall.id) ? ' is-selected' : ''}`}
              onClick={() => set('stall_ids')(toggle(form.stall_ids, stall.id))}>
              {stall.code}{stall.shop_name ? ` · ${stall.shop_name}` : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="market-field is-wide">
        <span className="market-field-label">domain ที่เรียกจากเบราว์เซอร์ได้ (เลือกจากแท็บ Domain เท่านั้น)</span>
        <div className="market-chip-row">
          {origins.length === 0 && <span className="market-muted">ยังไม่มี domain ถ้าเรียกจาก server อย่างเดียวไม่ต้องเลือก</span>}
          {origins.map((origin) => (
            <button type="button" key={origin.id} className={`market-chip${form.origin_ids.includes(origin.id) ? ' is-selected' : ''}${origin.is_active ? '' : ' is-inactive'}`}
              onClick={() => set('origin_ids')(toggle(form.origin_ids, origin.id))}>
              {origin.origin}
            </button>
          ))}
        </div>
      </div>
      <Field label="จำกัด IP (ไม่บังคับ)" hint="หนึ่ง IP ต่อบรรทัด ว่าง = ทุก IP" wide>
        <textarea className="market-input market-mono" rows="2" {...input('allowed_ips')} />
      </Field>
    </MarketModal>
  )
}

function RevealKey({ apiKey, title, onClose }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <MarketModal title={title} onClose={() => saved && onClose()} hideFooter>
      <p className="market-error">คัดลอก key ตอนนี้ ปิดหน้าต่างนี้แล้วระบบจะไม่แสดงอีก</p>
      <div className="market-key-box">
        <code>{apiKey}</code>
        <button type="button" className="market-btn is-small" onClick={async () => {
          try {
            await navigator.clipboard.writeText(apiKey)
            setCopied(true)
          } catch {
            setCopied(false)
          }
        }}>{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>
      </div>
      <p className="market-muted">ส่ง header <code>X-Market-Api-Key</code> ไปที่ <code>{MARKET_PUBLIC_PREFIX}</code></p>
      <div className="market-modal-foot">
        <CheckField label="ฉันเก็บ key แล้ว" checked={saved} onChange={setSaved} />
        <button type="button" className="market-btn is-primary" disabled={!saved} onClick={onClose}>ปิด</button>
      </div>
    </MarketModal>
  )
}

function ApiKeys({ api, stalls, config, onNotify, onShowLogs }) {
  const [clients, setClients] = useState([])
  const [origins, setOrigins] = useState([])
  const [form, setForm] = useState(null)
  const [reveal, setReveal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stallCode = (id) => stalls.find((stall) => stall.id === id)?.code || `#${id}`
  const originName = (id) => origins.find((origin) => origin.id === id)?.origin || `#${id}`

  const load = useCallback(() => Promise.all([api.get('/api-clients'), api.get('/allowed-origins')])
    .then(([clientData, originData]) => {
      setClients(clientData.clients)
      setOrigins(originData.origins)
    })
    .catch((requestError) => setError(errorMessage(requestError))), [api])

  useEffect(() => {
    load()
  }, [load])

  const run = async (action) => {
    setBusy(true)
    setError('')
    try {
      const data = await action()
      setConfirm(null)
      setClients(data.clients)
      onNotify(data.message)
      if (data.api_key) setReveal({ apiKey: data.api_key, title: 'API key ใหม่' })
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="market-toolbar">
        <p className="market-muted">key แสดงครั้งเดียวตอนสร้างหรือหมุน ระบบเก็บแค่ค่า hash</p>
        <button type="button" className="market-btn is-primary market-toolbar-end" onClick={() => setForm({})}>+ สร้าง API key</button>
      </div>
      {error && <p className="market-error">{error}</p>}
      <div className="market-scroll">
        {clients.length === 0 ? <EmptyState>ยังไม่มี API key</EmptyState> : clients.map((client) => {
          const status = clientStatus(client)
          return (
            <article key={client.id} className="market-card">
              <header className="market-card-head">
                <strong>{client.name} <small className="market-muted">· {client.project_name}</small></strong>
                <span className={`market-pill ${client.mode === 'live' ? 'is-info' : 'is-muted'}`}>{client.mode}</span>
                <span className={`market-pill ${status.tone}`}>{status.label}</span>
              </header>
              <p className="market-mono">{client.key_hint}</p>
              <p>สิทธิ์: {client.scopes.map((scope) => MARKET_SCOPES[scope]?.label || scope).join(', ')}</p>
              <p>ล็อก: {client.stall_ids.map(stallCode).join(', ') || '-'} · domain: {client.origin_ids.map(originName).join(', ') || 'เรียกจาก server เท่านั้น'}</p>
              <p className="market-muted">
                {client.rate_limit_per_min} ครั้ง/นาที · หมดอายุ {client.expires_at ? formatDate(client.expires_at) : 'ไม่หมดอายุ'}
                · ใช้ล่าสุด {client.last_used_at ? formatDateTime(client.last_used_at) : 'ยังไม่เคยใช้'}
                {client.allowed_ips.length > 0 && ` · IP ${client.allowed_ips.join(', ')}`}
                · ติดต่อ {client.contact_email}
              </p>
              {client.previous_key_expires_at && new Date(client.previous_key_expires_at) > new Date() && (
                <p className="market-muted">key เก่ายังใช้ได้ถึง {formatDateTime(client.previous_key_expires_at)}</p>
              )}
              <div className="market-actions">
                <button type="button" className="market-btn is-small" onClick={() => setForm({ client })}>แก้ไข</button>
                <button type="button" className="market-btn is-small" onClick={() => setConfirm({ type: 'rotate', client })}>หมุน key</button>
                <button type="button" className={`market-btn is-small${client.is_active ? ' is-danger' : ''}`} disabled={busy}
                  onClick={() => run(() => api.patch(`/api-clients/${client.id}`, { is_active: !client.is_active }))}>
                  {client.is_active ? 'ระงับ' : 'เปิดใช้งาน'}
                </button>
                <button type="button" className="market-btn is-small" onClick={() => onShowLogs(client.id)}>ดู log</button>
              </div>
            </article>
          )
        })}
      </div>
      {form && (
        <KeyForm api={api} client={form.client} stalls={stalls} origins={origins} config={config} onClose={() => setForm(null)}
          onSaved={(data) => {
            setForm(null)
            setClients(data.clients)
            onNotify(data.message)
            if (data.api_key) setReveal({ apiKey: data.api_key, title: 'สร้าง API key แล้ว' })
          }} />
      )}
      {confirm?.type === 'rotate' && (
        <ConfirmModal
          title={`หมุน key ของ ${confirm.client.name}`}
          message={`ระบบจะออก key ใหม่ key เดิมยังใช้ได้อีก ${config.key_rotation_grace_hours} ชั่วโมงเพื่อให้ปลายทางเปลี่ยนทัน`}
          confirmLabel="หมุน key"
          tone="primary"
          busy={busy}
          error={error}
          onClose={() => setConfirm(null)}
          onConfirm={() => run(() => api.post(`/api-clients/${confirm.client.id}/rotate`))}
        />
      )}
      {reveal && <RevealKey apiKey={reveal.apiKey} title={reveal.title} onClose={() => setReveal(null)} />}
    </>
  )
}

function Origins({ api, onNotify }) {
  const [origins, setOrigins] = useState([])
  const [form, setForm] = useState({ origin: '', note: '' })
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => api.get('/allowed-origins')
    .then((data) => setOrigins(data.origins))
    .catch((requestError) => setError(errorMessage(requestError))), [api])

  useEffect(() => {
    load()
  }, [load])

  const run = async (action, after) => {
    setBusy(true)
    setError('')
    try {
      const data = await action()
      setOrigins(data.origins)
      onNotify(data.message)
      after?.()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form className="market-toolbar" onSubmit={(event) => {
        event.preventDefault()
        run(() => api.post('/allowed-origins', form), () => setForm({ origin: '', note: '' }))
      }}>
        <input className="market-input" placeholder="https://shop.example.com" value={form.origin}
          onChange={(event) => setForm((current) => ({ ...current, origin: event.target.value }))} required />
        <input className="market-input" placeholder="หมายเหตุ เช่น ชื่อระบบ" value={form.note}
          onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        <button type="submit" className="market-btn is-primary" disabled={busy}>+ เพิ่ม domain</button>
      </form>
      <p className="market-muted">รับเฉพาะ https://host ไม่มี path และห้ามใช้ * ระบบภายนอกเพิ่มหรือแก้รายการนี้เองไม่ได้ ปิดแล้วมีผลทันที</p>
      {error && <p className="market-error">{error}</p>}
      <div className="market-scroll">
        {origins.length === 0 ? <EmptyState>ยังไม่มี domain ที่อนุญาต</EmptyState> : (
          <div className="market-table-wrap">
            <table className="market-table">
              <thead><tr><th>domain</th><th>หมายเหตุ</th><th>ใช้กับ key</th><th>เพิ่มโดย</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {origins.map((origin) => (
                  <tr key={origin.id}>
                    <td className="market-mono">{origin.origin}</td>
                    <td>{origin.note || '-'}</td>
                    <td>{origin.client_count}</td>
                    <td>{origin.created_by_name || '-'}<br /><small className="market-muted">{formatDate(origin.created_at)}</small></td>
                    <td><span className={`market-pill ${origin.is_active ? 'is-active' : 'is-closed'}`}>{origin.is_active ? 'เปิด' : 'ปิด'}</span></td>
                    <td className="market-cell-actions">
                      <button type="button" className="market-btn is-small" disabled={busy}
                        onClick={() => run(() => api.patch(`/allowed-origins/${origin.id}`, { is_active: !origin.is_active }))}>
                        {origin.is_active ? 'ปิด' : 'เปิด'}
                      </button>
                      <button type="button" className="market-btn is-small is-danger" onClick={() => setConfirm(origin)}>ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirm && (
        <ConfirmModal title={`ลบ ${confirm.origin}`} message={`key ${confirm.client_count} ตัวที่ผูกกับ domain นี้จะเรียกจากเบราว์เซอร์ไม่ได้อีก`}
          confirmLabel="ลบ domain" busy={busy} error={error} onClose={() => setConfirm(null)}
          onConfirm={() => run(() => api.del(`/allowed-origins/${confirm.id}`), () => setConfirm(null))} />
      )}
    </>
  )
}

function formatChanges(changes) {
  if (!changes) return '-'
  return Object.entries(changes).filter(([key]) => key !== 'target')
    .map(([key, [before, after]]) => `${key} ${before} → ${after}`).join(', ') || '-'
}

function ApiLogs({ api, clientId, onClientChange }) {
  const [clients, setClients] = useState([])
  const [filter, setFilter] = useState({ result: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ logs: [], total_pages: 1 })
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api-clients').then((result) => setClients(result.clients)).catch(() => {})
  }, [api])

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) })
    if (clientId) params.set('client_id', String(clientId))
    for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value)
    return api.get(`/api-logs?${params}`).then(setData).catch((requestError) => setError(errorMessage(requestError)))
  }, [api, clientId, filter, page])

  useEffect(() => {
    load()
  }, [load])

  const update = (key) => (value) => {
    setPage(1)
    setFilter((current) => ({ ...current, [key]: value }))
  }

  return (
    <>
      <div className="market-toolbar">
        <select className="market-input is-compact" value={clientId || ''} onChange={(event) => {
          setPage(1)
          onClientChange(event.target.value ? Number(event.target.value) : null)
        }}>
          <option value="">ทุก key</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <select className="market-input is-compact" value={filter.result} onChange={(event) => update('result')(event.target.value)}>
          <option value="">ทุกผล</option>
          <option value="success">สำเร็จ</option>
          <option value="error">ผิดพลาด</option>
        </select>
        <ThaiDatePicker value={filter.from} onChange={update('from')} className="market-input is-compact" placeholder="ตั้งแต่วันที่" isClearable />
        <ThaiDatePicker value={filter.to} onChange={update('to')} className="market-input is-compact" placeholder="ถึงวันที่" isClearable />
        <button type="button" className="market-btn market-toolbar-end" onClick={load}>รีเฟรช</button>
      </div>
      {error && <p className="market-error">{error}</p>}
      <div className="market-scroll">
        {data.logs.length === 0 ? <EmptyState>ไม่มี log</EmptyState> : (
          <div className="market-table-wrap">
            <table className="market-table">
              <thead><tr><th>เวลา</th><th>key</th><th>คำขอ</th><th>ผล</th><th>การเปลี่ยนแปลง</th><th>IP</th><th>Request ID</th></tr></thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>{log.client_name || <span className="market-muted">ไม่มี key</span>}</td>
                    <td className="market-mono">{log.method} {log.path}</td>
                    <td><span className={`market-pill ${log.status_code < 400 ? 'is-active' : 'is-closed'}`}>{log.status_code}</span></td>
                    <td>{formatChanges(log.changes)}</td>
                    <td className="market-mono">{log.ip || '-'}</td>
                    <td className="market-mono" title={log.request_id}>{log.request_id.slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pager page={page} totalPages={data.total_pages} onChange={setPage} />
    </>
  )
}

function AuditLogs({ api }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ logs: [], total_pages: 1 })
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/audit-logs?page=${page}`).then(setData).catch((requestError) => setError(errorMessage(requestError)))
  }, [api, page])

  return (
    <>
      {error && <p className="market-error">{error}</p>}
      <div className="market-scroll">
        {data.logs.length === 0 ? <EmptyState>ยังไม่มีประวัติ</EmptyState> : (
          <div className="market-table-wrap">
            <table className="market-table">
              <thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>{log.actor_name || '-'} <small className="market-muted">{log.actor_role}</small></td>
                    <td className="market-mono">{log.action}</td>
                    <td>{log.target || '-'}</td>
                    <td className="market-log-details">{log.details ? JSON.stringify(log.details) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pager page={page} totalPages={data.total_pages} onChange={setPage} />
    </>
  )
}

export default function MarketApiAccess({ api, section, stalls, config, onNotify, onSectionChange }) {
  const [logClientId, setLogClientId] = useState(null)
  return (
    <div className="market-panel">
      {section === 'api-keys' && (
        <ApiKeys api={api} stalls={stalls} config={config} onNotify={onNotify}
          onShowLogs={(clientId) => {
            setLogClientId(clientId)
            onSectionChange('api-logs')
          }} />
      )}
      {section === 'origins' && <Origins api={api} onNotify={onNotify} />}
      {section === 'api-logs' && <ApiLogs api={api} clientId={logClientId} onClientChange={setLogClientId} />}
      {section === 'audit-logs' && <AuditLogs api={api} />}
    </div>
  )
}
