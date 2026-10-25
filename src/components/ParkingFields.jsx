import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import PromptPayQr from './PromptPayQr.jsx'
import { formatPromptPayId, isValidPromptPayId } from '../utils/promptpay.js'
import readSlipQrPayload from '../utils/slipQr.js'
import {
  FINE_STATUS_LABEL,
  FINE_STATUS_TONE,
  HOUR_MS,
  USER_CATEGORY_LABEL,
  VEHICLE_TYPE_LABEL,
  VISITOR_MAX_HOURS,
  formatBaht,
  getVisitorSession,
  useNow,
  visitorEndFrom,
} from '../utils/parking.js'
import './ParkingFields.css'

function formatClock(value) {
  const date = new Date(value)
  return `${date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
}

function formatDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours} ชม. ${rest} นาที`
  if (hours) return `${hours} ชม.`
  return `${rest} นาที`
}

function ChoiceIcon({ kind }) {
  if (kind === 'car') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.6 5H8.4a2 2 0 0 0-1.9 1.3L5 10 3 8" />
        <rect x="3" y="10" width="18" height="8" rx="2" />
        <path d="M7 14h.01M17 14h.01M5 18v2M19 18v2" />
      </svg>
    )
  }
  if (kind === 'motorcycle') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="5.5" cy="17" r="3.5" />
        <circle cx="18.5" cy="17" r="3.5" />
        <path d="M15 6h2l3 7.5M5.5 17 9 10h6l3.5 7M9 10 7.5 7H5" />
      </svg>
    )
  }
  if (kind === 'resident') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M10 21v-6h4v6" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="7" r="4" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  )
}

export function ParkingChoiceGroup({ label, name, options, value, onChange, disabled = false }) {
  return (
    <fieldset className="parking-choice" disabled={disabled}>
      <legend className="parking-choice-legend">
        {label} <span className="parking-required">*</span>
      </legend>
      <div className="parking-choice-grid">
        {options.map((option) => (
          <label key={option.value} className={`parking-choice-card${value === option.value ? ' is-active' : ''}${option.disabled ? ' is-disabled' : ''}`}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="parking-choice-icon">
              <ChoiceIcon kind={option.icon || option.value} />
            </span>
            <span className="parking-choice-text">
              <strong>{option.label}</strong>
              {option.hint && <small>{option.hint}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function ParkingRulesNote({ userCategory, finePerHour }) {
  if (userCategory === 'visitor') {
    return (
      <div className="parking-rule is-visitor" role="note">
        <strong>ผู้มาติดต่อจอดได้ครั้งละ {VISITOR_MAX_HOURS} ชั่วโมง</strong>
        <span>
          นับจากเวลาที่เจ้าหน้าที่เช็คอินเข้าจอดจริง · เกินเวลาปรับ {formatBaht(finePerHour)} ต่อชั่วโมง (เศษของชั่วโมงคิดเป็น 1 ชั่วโมง) · ชำระผ่าน QR PromptPay
        </span>
      </div>
    )
  }
  return (
    <div className="parking-rule" role="note">
      <strong>ผู้พักอาศัยลงทะเบียนได้ รถยนต์ 1 คัน และรถจักรยานยนต์ 1 คัน</strong>
      <span>กำหนดช่วงเวลาจอด หรือจอดแบบไม่จำกัดเวลาได้ ช่องจอดที่เลือกจะถูกจองไว้ให้ตลอดช่วงเวลานั้น</span>
    </div>
  )
}

export function ParkingSpacePicker({ spaces, vehicleType, value, onChange, loading = false, error = '', showOccupant = false, keepId = null }) {
  const list = useMemo(() => spaces.filter((space) => space.vehicle_type === vehicleType), [spaces, vehicleType])
  const freeCount = list.filter((space) => space.available || space.id === keepId).length
  const zone = list[0]?.zone
  return (
    <section className="parking-space" aria-label="เลือกช่องจอด">
      <div className="parking-space-head">
        <span className="parking-choice-legend">
          ช่องจอด <span className="parking-required">*</span>
        </span>
        <span className="parking-space-count">
          {loading ? 'กำลังตรวจสอบช่องว่าง...' : `ว่าง ${freeCount} / ${list.length} ช่อง${zone ? ` · ${zone}` : ''}`}
        </span>
      </div>
      <div className="parking-space-legend" aria-hidden="true">
        <span><i className="is-free" />ว่าง</span>
        <span><i className="is-taken" />ไม่ว่าง</span>
        <span><i className="is-selected" />ที่เลือก</span>
      </div>
      <div className={`parking-space-body${loading ? ' is-loading' : ''}`}>
        {error ? (
          <p className="parking-space-empty is-error">{error}</p>
        ) : list.length === 0 ? (
          <p className="parking-space-empty">{loading ? 'กำลังโหลดช่องจอด...' : `ยังไม่มีช่องจอดสำหรับ${VEHICLE_TYPE_LABEL[vehicleType] || 'รถประเภทนี้'}`}</p>
        ) : (
          <div className="parking-space-grid" role="radiogroup" aria-label="ช่องจอด">
            {list.map((space) => {
              const available = space.available || space.id === keepId
              const selected = Number(value) === space.id
              return (
                <button
                  key={space.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!available}
                  className={`parking-space-slot${selected ? ' is-selected' : ''}${available ? '' : ' is-taken'}`}
                  onClick={() => onChange(space.id)}
                  title={available ? `ช่อง ${space.code} ว่าง` : `ช่อง ${space.code} ไม่ว่าง${showOccupant && space.occupied_plate ? ` (${space.occupied_plate})` : ''}`}
                >
                  <strong>{space.code}</strong>
                  <small>{available ? (selected ? 'เลือกแล้ว' : 'ว่าง') : showOccupant && space.occupied_plate ? space.occupied_plate : 'ไม่ว่าง'}</small>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export function VisitorTimeSummary({ startAt }) {
  const end = visitorEndFrom(startAt)
  return (
    <div className="parking-visitor-time">
      <span>สิ้นสุดอัตโนมัติ</span>
      <strong>{end ? formatClock(end) : '-'}</strong>
      <small>{VISITOR_MAX_HOURS} ชั่วโมงหลังเวลาเริ่ม · เมื่อเช็คอินจริงจะนับใหม่จากเวลาเช็คอิน</small>
    </div>
  )
}

export function ParkingStatusPill({ status }) {
  if (!status || status === 'none') return null
  return <span className={`parking-pill is-${FINE_STATUS_TONE[status] || 'muted'}`}>ค่าปรับ{FINE_STATUS_LABEL[status]}</span>
}

export function ParkingSessionPanel({ item, finePerHour, alwaysShow = false }) {
  const now = useNow()
  const session = getVisitorSession(item, finePerHour, now)
  const space = item.parking_space_code
  if (!session && !space && !alwaysShow) return null
  return (
    <section className="parking-session" aria-label="ข้อมูลที่จอด">
      <dl className="parking-session-grid">
        <div>
          <dt>ประเภทผู้ใช้</dt>
          <dd>{USER_CATEGORY_LABEL[item.user_category] || '-'}</dd>
        </div>
        <div>
          <dt>ประเภทรถ</dt>
          <dd>{VEHICLE_TYPE_LABEL[item.vehicle_type] || '-'}</dd>
        </div>
        <div>
          <dt>ช่องจอด</dt>
          <dd>{space ? `${space}${item.parking_space_zone ? ` · ${item.parking_space_zone}` : ''}` : 'ไม่ได้ระบุ (รายการเดิม)'}</dd>
        </div>
        {session && (
          <div>
            <dt>เวลาเข้าจอดจริง</dt>
            <dd>{item.parked_at ? formatClock(item.parked_at) : 'ยังไม่เช็คอิน'}</dd>
          </div>
        )}
        {session && item.parked_at && (
          <div>
            <dt>จอดได้ถึง</dt>
            <dd>{formatClock(new Date(item.parked_at).getTime() + VISITOR_MAX_HOURS * HOUR_MS)}</dd>
          </div>
        )}
        {session && item.checked_out_at && (
          <div>
            <dt>ออกจากที่จอด</dt>
            <dd>{formatClock(item.checked_out_at)}</dd>
          </div>
        )}
      </dl>
      {session && session.state !== 'waiting' && (
        <div className={`parking-session-fine is-${session.amount > 0 ? 'danger' : 'ok'}`}>
          <span>
            {session.state === 'parked'
              ? `เหลือเวลาจอด ${formatDuration(session.remainingMs)}`
              : session.overtimeHours > 0
                ? `จอดเกินเวลา ${session.overtimeHours} ชั่วโมง`
                : 'จอดไม่เกินเวลา'}
          </span>
          <strong>{session.amount > 0 ? `ค่าปรับ ${formatBaht(session.amount)}` : 'ไม่มีค่าปรับ'}</strong>
          {session.state === 'overtime' && <small>ยอดยังเพิ่มขึ้นจนกว่าเจ้าหน้าที่จะบันทึกรถออก</small>}
          {session.state === 'done' && item.fine_status && item.fine_status !== 'none' && <ParkingStatusPill status={item.fine_status} />}
        </div>
      )}
    </section>
  )
}

export function ParkingFinePayment({ item, channels, endpoint, onDone, onCounterPaid, counterBusy = false }) {
  const hasPromptPay = isValidPromptPayId(channels?.promptpay_id)
  const hasBank = Boolean(channels?.bank_account_no)
  const channelsMissing = Boolean(channels) && !channels.configured
  const [method, setMethod] = useState(hasPromptPay || !hasBank ? 'promptpay' : 'bank')
  const [slip, setSlip] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const status = item.fine_status
  const amount = Number(item.fine_amount) || 0

  const submit = async (event) => {
    event.preventDefault()
    if (!slip) {
      setError('กรุณาแนบสลิปการโอนเงินค่าปรับ')
      return
    }
    setBusy(true)
    setError('')
    try {
      const qrPayload = channels?.test_mode ? '' : await readSlipQrPayload(slip)
      const formData = new FormData()
      formData.append('payment_method', method)
      if (qrPayload) formData.append('qr_payload', qrPayload)
      formData.append('slip', slip)
      const { data } = await axios.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setSlip(null)
      setMessage(data.message || 'บันทึกการชำระค่าปรับแล้ว')
      onDone?.(data)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'ชำระค่าปรับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="parking-pay" aria-label="ชำระค่าปรับจอดเกินเวลา">
      <div className="parking-pay-head">
        <div>
          <span className="parking-pay-label">ค่าปรับจอดเกินเวลา</span>
          <strong className="parking-pay-amount">{formatBaht(amount)}</strong>
          <small>
            เกินเวลา {Number(item.fine_hours) || 0} ชั่วโมง × {formatBaht(item.fine_rate)}
          </small>
        </div>
        <span className={`parking-pill is-${FINE_STATUS_TONE[status] || 'muted'}`}>{FINE_STATUS_LABEL[status] || '-'}</span>
      </div>
      {status === 'paid' ? (
        <p className="parking-pay-done">
          ชำระเรียบร้อย{item.fine_paid_at ? ` เมื่อ ${formatClock(item.fine_paid_at)}` : ''}
          {item.fine_paid_by_name ? ` · ${item.fine_paid_by_name}` : ''}
        </p>
      ) : status === 'pending_review' ? (
        <p className="parking-pay-wait">ส่งสลิปแล้ว กำลังรอเจ้าหน้าที่ตรวจสอบ</p>
      ) : status === 'unpaid' ? (
        <form className="parking-pay-form" onSubmit={submit}>
          <div className="parking-pay-methods" role="radiogroup" aria-label="ช่องทางชำระ">
            {[
              { key: 'promptpay', label: 'PromptPay QR', available: hasPromptPay },
              { key: 'bank', label: 'โอนเข้าบัญชี', available: hasBank },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={method === option.key}
                disabled={!option.available || channelsMissing}
                className={`parking-pay-method${method === option.key ? ' is-active' : ''}`}
                onClick={() => setMethod(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {channelsMissing ? (
            <p className="parking-pay-wait">หอพักยังไม่ได้ตั้งค่าช่องทางรับโอน จึงยังส่งสลิปไม่ได้ กรุณาติดต่อเจ้าหน้าที่</p>
          ) : method === 'promptpay' ? (
            hasPromptPay ? (
              <div className="parking-pay-qr">
                <PromptPayQr promptPayId={channels.promptpay_id} amount={amount} size={168} />
                <span>{formatPromptPayId(channels.promptpay_id)}</span>
                <small>สแกนด้วยแอปธนาคาร ยอด {formatBaht(amount)}{channels.test_mode ? ' · โหมดทดลอง' : ''}</small>
              </div>
            ) : (
              <p className="parking-pay-wait">หอพักยังไม่ได้ตั้งค่า PromptPay</p>
            )
          ) : (
            <div className="parking-pay-bank">
              <span>{channels?.bank_name || 'บัญชีหอพัก'}</span>
              <strong>{channels?.bank_account_no || '-'}</strong>
            </div>
          )}
          {!channelsMissing && (
            <label className="parking-pay-file">
              <span>แนบสลิปการโอน</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  setSlip(event.target.files?.[0] || null)
                  setError('')
                }}
              />
            </label>
          )}
          {error && <p className="parking-pay-error" role="alert">{error}</p>}
          {message && <p className="parking-pay-done">{message}</p>}
          <div className="parking-pay-actions">
            {onCounterPaid && (
              <button type="button" className="parking-btn is-ghost" disabled={busy || counterBusy} onClick={onCounterPaid}>
                ยืนยันรับชำระที่เคาน์เตอร์
              </button>
            )}
            <button type="submit" className="parking-btn is-primary" disabled={busy || !slip || channelsMissing}>
              {busy ? 'กำลังตรวจสอบสลิป...' : 'ส่งสลิปชำระค่าปรับ'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}

export function ParkingSettingsForm({ endpoint, onSaved, onCancel }) {
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    axios
      .get(endpoint, { signal: controller.signal })
      .then(({ data }) =>
        setDraft({ finePerHour: String(data.finePerHour ?? ''), carSpaces: String(data.carSpaces ?? ''), motorcycleSpaces: String(data.motorcycleSpaces ?? '') }),
      )
      .catch((requestError) => {
        if (!axios.isCancel(requestError)) setError(requestError.response?.data?.message || 'โหลดการตั้งค่าไม่สำเร็จ')
      })
    return () => controller.abort()
  }, [endpoint])

  const update = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }))
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await axios.put(
        endpoint,
        { finePerHour: Number(draft.finePerHour), carSpaces: Number(draft.carSpaces), motorcycleSpaces: Number(draft.motorcycleSpaces) }
      )
      onSaved?.(data)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'บันทึกการตั้งค่าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!draft) return <p className="parking-space-empty">{error || 'กำลังโหลดการตั้งค่า...'}</p>
  return (
    <form className="parking-settings" onSubmit={submit}>
      <div className="parking-rule is-visitor">
        <strong>ผู้มาติดต่อจอดได้ครั้งละ {VISITOR_MAX_HOURS} ชั่วโมง (กำหนดตามนโยบาย)</strong>
        <span>เกินเวลาคิดค่าปรับรายชั่วโมง เศษของชั่วโมงปัดขึ้นเป็น 1 ชั่วโมง · ค่าปรับที่เปลี่ยนจะใช้กับรถที่ออกจากที่จอดหลังจากนี้</span>
      </div>
      <div className="parking-settings-grid">
        <label className="parking-settings-field">
          ค่าปรับต่อชั่วโมง (บาท)
          <input type="number" min="0" max="10000" step="0.01" inputMode="decimal" value={draft.finePerHour} onChange={update('finePerHour')} required />
        </label>
        <label className="parking-settings-field">
          ช่องจอดรถยนต์
          <input type="number" min="0" max="200" step="1" inputMode="numeric" value={draft.carSpaces} onChange={update('carSpaces')} required />
          <small>รหัสช่อง C01, C02, ...</small>
        </label>
        <label className="parking-settings-field">
          ช่องจอดรถจักรยานยนต์
          <input type="number" min="0" max="200" step="1" inputMode="numeric" value={draft.motorcycleSpaces} onChange={update('motorcycleSpaces')} required />
          <small>รหัสช่อง M01, M02, ...</small>
        </label>
      </div>
      {error && <p className="parking-pay-error" role="alert">{error}</p>}
      <div className="parking-pay-actions">
        {onCancel && (
          <button type="button" className="parking-btn" onClick={onCancel}>
            ยกเลิก
          </button>
        )}
        <button type="submit" className="parking-btn is-primary" disabled={busy}>
          {busy ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </button>
      </div>
    </form>
  )
}

export function ParkingQuotaSummary({ usage }) {
  const resident = usage?.resident || { car: 0, motorcycle: 0 }
  return (
    <div className="parking-quota">
      {['car', 'motorcycle'].map((type) => {
        const used = resident[type] || 0
        return (
          <div key={type} className={`parking-quota-tile${used >= 1 ? ' is-full is-used' : ''}`}>
            <span className="parking-quota-icon" aria-hidden="true">
              <ChoiceIcon kind={type} />
            </span>
            <span className="parking-quota-text">
              <small>ผู้พักอาศัย</small>
              <strong>{VEHICLE_TYPE_LABEL[type]}</strong>
            </span>
            <span className="parking-quota-value">
              <b>{used}</b>/1
            </span>
          </div>
        )
      })}
      <p className="parking-quota-note">ลงทะเบียนได้เฉพาะรถของผู้เช่าห้องนี้ ประเภทละ 1 คัน</p>
    </div>
  )
}

function formatContractPoint(value) {
  const date = new Date(String(value).replace(' ', 'T'))
  return `${date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} เวลา ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
}

export function ResidentContractWindow({ startLabel, endAt, note }) {
  return (
    <div className="dashboard-rv-contract-window">
      <div className="dashboard-rv-contract-track">
        <div className="dashboard-rv-contract-point is-start">
          <span className="dashboard-rv-contract-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12 2.5 2.5 4.5-5" />
            </svg>
          </span>
          <span className="dashboard-rv-contract-text">
            <small>เริ่มจอดได้</small>
            <strong>{startLabel}</strong>
          </span>
        </div>
        <span className="dashboard-rv-contract-line" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
        <div className="dashboard-rv-contract-point is-end">
          <span className="dashboard-rv-contract-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M16 3v4M8 3v4M3 11h18" />
            </svg>
          </span>
          <span className="dashboard-rv-contract-text">
            <small>จอดได้ถึง</small>
            <strong>{endAt ? formatContractPoint(endAt) : 'ตลอดสัญญาเช่า'}</strong>
            {endAt && <em>วันสิ้นสุดสัญญาเช่า</em>}
          </span>
        </div>
      </div>
      <p className="dashboard-rv-contract-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        {note}
      </p>
    </div>
  )
}
