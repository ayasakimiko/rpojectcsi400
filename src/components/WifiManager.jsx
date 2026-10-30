import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'
import { ConfirmDialog } from './ActionDialog.jsx'
import './WifiManager.css'

const API_BASE = '/api/rooms/wifi'
const MAX_DEVICE_LIMIT = 20

const DEVICE_TYPES = [
  { key: 'phone', label: 'โทรศัพท์' },
  { key: 'laptop', label: 'แล็ปท็อป' },
  { key: 'tablet', label: 'แท็บเล็ต' },
  { key: 'tv', label: 'ทีวี' },
  { key: 'other', label: 'อื่น ๆ' },
]
const DEVICE_TYPE_LABEL = Object.fromEntries(DEVICE_TYPES.map((type) => [type.key, type.label]))

const STATUS_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', match: () => true },
  { key: 'active', label: 'ใช้งานอยู่', match: (room) => room.is_enabled },
  { key: 'full', label: 'เต็มแล้ว', match: (room) => room.is_enabled && room.devices.length >= room.max_devices },
  { key: 'disabled', label: 'ปิดใช้งาน', match: (room) => !room.is_enabled },
]

const errorMessage = (error, fallback) => error.response?.data?.message || fallback

function WifiIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

function SlotMeter({ devices, max }) {
  const slots = Array.from({ length: Math.max(max, devices.length) }, (_, index) => devices[index] || null)
  return (
    <ul className={`wifi-slots${devices.length >= max ? ' is-full' : ''}`} aria-label={`เชื่อมต่อแล้ว ${devices.length} จาก ${max} เครื่อง`}>
      {slots.map((device, index) => (
        <li
          key={device ? `device-${device.id}` : `free-${index}`}
          className={`wifi-slot${device ? ' is-used' : ''}${device && !device.is_online ? ' is-offline' : ''}`}
          title={device ? `${device.device_name} (${device.is_online ? 'ออนไลน์' : 'ออฟไลน์'})` : 'ว่าง'}
        >
          {device ? <DeviceIcon type={device.device_type} size={16} /> : <span className="wifi-slot-plus" aria-hidden="true">+</span>}
        </li>
      ))}
    </ul>
  )
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const DEVICE_ICON_PATHS = {
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  laptop: <><path d="M4.5 15.5V6.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5v9" /><path d="M2.5 15.5h19l-1.2 2.6a1.5 1.5 0 0 1-1.36.9H5.06a1.5 1.5 0 0 1-1.36-.9z" /></>,
  tablet: <><rect x="4" y="2.5" width="16" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  tv: <><rect x="2.5" y="6.5" width="19" height="13" rx="2" /><path d="m8 2.5 4 4 4-4" /></>,
  other: <><circle cx="12" cy="12" r="9.5" /><path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.6" /></>,
}

function DeviceIcon({ type, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {DEVICE_ICON_PATHS[type] || DEVICE_ICON_PATHS.other}
    </svg>
  )
}

function WifiModal({ bare = false, title, subtitle, tone = 'primary', icon, busy, error, onClose, onSubmit, submitLabel, submitDisabled, cancelLabel = 'ยกเลิก', children }) {
  const titleId = useId()
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)

  useEffect(() => {
    closeRef.current = onClose
    busyRef.current = busy
  })

  useEffect(() => {
    const unlock = lockBodyScroll()
    const handleKey = (event) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      unlock()
    }
  }, [])

  if (bare) {
    return createPortal(
      <div className="wifi-modal-overlay" role="presentation" onClick={() => !busy && onClose()}>
        <section className={`wifi-modal is-${tone}`} role="alertdialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
          {children}
        </section>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="wifi-modal-overlay" role="presentation" onClick={() => !busy && onClose()}>
      <form
        className={`wifi-modal is-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy && !submitDisabled) onSubmit()
        }}
      >
        <header className="wifi-modal-head">
          <span className="wifi-modal-icon" aria-hidden="true">{icon}</span>
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="wifi-modal-close" aria-label="ปิด" disabled={busy} onClick={onClose}>×</button>
        </header>
        <div className="wifi-modal-body">
          {children}
          {error && <p className="wifi-error" role="alert">{error}</p>}
        </div>
        <footer className="wifi-modal-actions">
          <button type="button" className="wifi-btn" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button type="submit" className={`wifi-btn ${tone === 'danger' ? 'is-danger' : 'is-primary'}`} disabled={busy || submitDisabled}>
            {busy ? 'กำลังดำเนินการ...' : submitLabel}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}

function DeviceSummary({ device }) {
  return (
    <div className="wifi-device-summary">
      <span className="wifi-device-icon"><DeviceIcon type={device.device_type} size={20} /></span>
      <span className="wifi-device-name">
        <strong className="wifi-device-label" title={device.device_name}>{device.device_name}</strong>
        <small>{DEVICE_TYPE_LABEL[device.device_type] || 'อื่น ๆ'} · {device.mac_address}</small>
      </span>
      <span className={`wifi-online-toggle is-static${device.is_online ? ' is-online' : ''}`}>{device.is_online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
    </div>
  )
}

function AddDeviceModal({ room, busy, error, onClose, onSubmit }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('phone')
  const nameId = useId()
  const used = room.devices.length
  const trimmed = name.trim()

  return (
    <WifiModal
      title="เพิ่มอุปกรณ์"
      subtitle={`ห้อง ${room.room_number} · ${room.ssid}`}
      icon={<WifiIcon size={22} />}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => onSubmit({ device_name: trimmed, device_type: type })}
      submitLabel="เพิ่มอุปกรณ์"
      submitDisabled={!trimmed}
    >
      <div className="wifi-modal-quota">
        <div className="wifi-usage-text">
          <span>เชื่อมต่อแล้ว <strong>{used} / {room.max_devices}</strong> เครื่อง</span>
          <small>เพิ่มได้อีก {Math.max(0, room.max_devices - used)} เครื่อง</small>
        </div>
        <SlotMeter devices={room.devices} max={room.max_devices} />
      </div>

      <div className="wifi-field">
        <label htmlFor={nameId}>ชื่ออุปกรณ์ <span className="wifi-required">*</span></label>
        <input
          id={nameId}
          className="wifi-input"
          placeholder="เช่น iPhone ของผู้เช่า"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          autoComplete="off"
        />
        <small className="wifi-field-counter">{name.length}/60</small>
      </div>

      <fieldset className="wifi-field">
        <legend>ประเภทอุปกรณ์</legend>
        <div className="wifi-type-grid">
          {DEVICE_TYPES.map((item) => (
            <label key={item.key} className={`wifi-type-tile${type === item.key ? ' is-selected' : ''}`}>
              <input type="radio" name="device-type" value={item.key} checked={type === item.key} onChange={() => setType(item.key)} />
              <span className="wifi-type-icon"><DeviceIcon type={item.key} size={26} /></span>
              <span className="wifi-type-label">{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <small className="wifi-hint">ระบบจำลองจะสุ่ม MAC address และตั้งสถานะเป็นออนไลน์ให้อัตโนมัติ</small>
    </WifiModal>
  )
}

function RemoveDevicesModal({ room, device, busy, error, onClose, onSubmit }) {
  const devices = device ? [device] : room.devices
  const title = device ? 'ตัดการเชื่อมต่ออุปกรณ์' : 'ตัดการเชื่อมต่อทุกอุปกรณ์'
  return (
    <WifiModal bare tone="danger" title={title} busy={busy} onClose={onClose}>
      <ConfirmDialog
        tone="danger"
        icon="wifi"
        kicker={`Wi-Fi ห้อง ${room.room_number} · เชื่อมต่ออยู่ ${room.devices.length} / ${room.max_devices} เครื่อง`}
        title={`${title}?`}
        lead={device
          ? 'อุปกรณ์นี้จะถูกนำออกจากรายการ และต้องเชื่อมต่อใหม่หากต้องการใช้งาน'
          : 'อุปกรณ์ทั้งหมดด้านล่างจะถูกนำออกจากรายการของห้องนี้'}
        error={error}
        busy={busy}
        confirmLabel={device ? 'ตัดการเชื่อมต่อ' : `ตัดการเชื่อมต่อ ${devices.length} เครื่อง`}
        onConfirm={onSubmit}
        onCancel={onClose}
      >
        <div className="wifi-device-summary-list">
          {devices.map((item) => <DeviceSummary key={item.id} device={item} />)}
        </div>
      </ConfirmDialog>
    </WifiModal>
  )
}


const LIMIT_PRESETS = [1, 2, 3, 4, 5, 6, 8, 10]

function LimitModal({ room, busy, error, onClose, onSubmit }) {
  const used = room.devices.length
  const min = Math.max(1, used)
  const [value, setValue] = useState(String(room.max_devices))
  const inputId = useId()
  const inputRef = useRef(null)
  const number = Number(value)
  const valid = Number.isInteger(number) && number >= min && number <= MAX_DEVICE_LIMIT
  const preview = valid ? number : room.max_devices
  const diff = preview - room.max_devices
  const choose = (next) => {
    setValue(String(next))
    inputRef.current?.focus()
  }
  const step = (delta) => choose(Math.min(MAX_DEVICE_LIMIT, Math.max(min, (valid ? number : room.max_devices) + delta)))

  return (
    <WifiModal
      title="แก้จำนวนเครื่อง"
      subtitle={`ห้อง ${room.room_number} · ${room.ssid}`}
      icon={<WifiIcon size={22} />}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => onSubmit(number)}
      submitLabel="บันทึก"
      submitDisabled={!valid || number === room.max_devices}
    >
      <div className="wifi-field">
        <label htmlFor={inputId}>จำนวนเครื่องที่เชื่อมต่อได้สูงสุด</label>
        <div className="wifi-stepper">
          <button type="button" className="wifi-stepper-btn" aria-label="ลดจำนวน" disabled={busy || preview <= min} onClick={() => step(-1)}>−</button>
          <div className="wifi-stepper-value">
            <input
              id={inputId}
              ref={inputRef}
              type="number"
              inputMode="numeric"
              min={min}
              max={MAX_DEVICE_LIMIT}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onFocus={(event) => event.target.select()}
              autoFocus
              aria-invalid={!valid}
            />
            <span>เครื่อง</span>
          </div>
          <button type="button" className="wifi-stepper-btn" aria-label="เพิ่มจำนวน" disabled={busy || preview >= MAX_DEVICE_LIMIT} onClick={() => step(1)}>+</button>
        </div>
        {!valid && value !== '' && (
          <small className="wifi-field-error">กรุณาระบุ {min}-{MAX_DEVICE_LIMIT} เครื่อง</small>
        )}
      </div>

      <div className="wifi-field">
        <span className="wifi-field-title">เลือกด่วน</span>
        <div className="wifi-preset-row">
          {LIMIT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`wifi-preset-chip${preview === preset ? ' is-selected' : ''}`}
              disabled={busy || preset < min}
              aria-pressed={preview === preset}
              onClick={() => choose(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="wifi-modal-quota">
        <div className="wifi-usage-text">
          <span>
            {room.max_devices} → <strong>{preview}</strong> เครื่อง
            {diff !== 0 && <span className={`wifi-diff ${diff > 0 ? 'is-up' : 'is-down'}`}>{diff > 0 ? `+${diff}` : diff}</span>}
          </span>
          <small>ใช้งานอยู่ {used} เครื่อง</small>
        </div>
        <SlotMeter devices={room.devices} max={preview} />
      </div>

      <small className="wifi-hint">
        {used > 1
          ? `ห้องนี้เชื่อมต่ออยู่ ${used} เครื่อง จึงตั้งต่ำกว่า ${used} ไม่ได้ หากต้องการลด กรุณาตัดการเชื่อมต่อก่อน`
          : `ตั้งได้ตั้งแต่ 1 ถึง ${MAX_DEVICE_LIMIT} เครื่องต่อห้อง`}
      </small>
    </WifiModal>
  )
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button type="button" className={`wifi-icon-btn${copied ? ' is-done' : ''}`} aria-label={`คัดลอก${label}`} title={copied ? 'คัดลอกแล้ว' : `คัดลอก${label}`} onClick={async () => setCopied(await copyText(text))}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {copied ? <path d="M20 6 9 17l-5-5" /> : <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
      </svg>
      <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
    </button>
  )
}

function CredentialsCard({ room, showPassword, onTogglePassword, className = '' }) {
  return (
    <div className={`wifi-cred-card${room.is_enabled ? '' : ' is-off'}${className ? ` ${className}` : ''}`}>
      <div className="wifi-cred-row">
        <div>
          <span className="wifi-cred-label">ชื่อ Wi-Fi (SSID)</span>
          <strong className="wifi-cred-value">{room.ssid}</strong>
        </div>
        <CopyButton text={room.ssid} label="ชื่อ Wi-Fi" />
      </div>
      <div className="wifi-cred-row">
        <div>
          <span className="wifi-cred-label">รหัสผ่าน</span>
          <strong className="wifi-cred-value is-secret">{showPassword ? room.password : '•'.repeat(room.password.length)}</strong>
        </div>
        <div className="wifi-cred-actions">
          <button type="button" className="wifi-icon-btn" aria-pressed={showPassword} onClick={onTogglePassword}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {showPassword && <path d="M3 3l18 18" />}
            </svg>
            <span>{showPassword ? 'ซ่อน' : 'แสดง'}</span>
          </button>
          <CopyButton text={room.password} label="รหัสผ่าน" />
        </div>
      </div>
    </div>
  )
}

function PasswordModal({ room, busy, error, onClose, onRename, onToggle, onReset }) {
  const [showPassword, setShowPassword] = useState(false)
  const [ssid, setSsid] = useState(room.ssid)
  const [confirm, setConfirm] = useState(null)
  const ssidId = useId()
  const used = room.devices.length
  const trimmed = ssid.trim()

  const request = async (action) => {
    if (used > 0 && confirm !== action) {
      setConfirm(action)
      return
    }
    setConfirm(null)
    if (action === 'reset') {
      if (await onReset()) setShowPassword(true)
    } else {
      await onToggle()
    }
  }

  return (
    <WifiModal
      title="รหัส Wi-Fi"
      subtitle={`ห้อง ${room.room_number}${room.tenant_name ? ` · ${room.tenant_name}` : ''}`}
      icon={<WifiIcon size={22} />}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => onRename(trimmed)}
      submitLabel="บันทึกชื่อ Wi-Fi"
      submitDisabled={!trimmed || trimmed === room.ssid}
      cancelLabel="ปิด"
    >
      <CredentialsCard room={room} showPassword={showPassword} onTogglePassword={() => setShowPassword((value) => !value)} />

      <div className="wifi-field">
        <label htmlFor={ssidId}>เปลี่ยนชื่อ Wi-Fi</label>
        <input
          id={ssidId}
          className="wifi-input"
          maxLength={32}
          value={ssid}
          onChange={(event) => setSsid(event.target.value)}
          autoComplete="off"
        />
        <small className="wifi-field-counter">{ssid.length}/32</small>
      </div>

      <div className="wifi-setting-list">
        <div className="wifi-setting-row">
          <div>
            <strong>สถานะ Wi-Fi</strong>
            <small>{room.is_enabled ? `เปิดใช้งาน · เชื่อมต่ออยู่ ${used} เครื่อง` : 'ปิดใช้งาน · ผู้เช่าเชื่อมต่อไม่ได้'}</small>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={room.is_enabled}
            aria-label={room.is_enabled ? 'ปิด Wi-Fi' : 'เปิด Wi-Fi'}
            className={`wifi-switch${room.is_enabled ? ' is-on' : ''}`}
            disabled={busy}
            onClick={() => request(room.is_enabled ? 'disable' : 'enable')}
          >
            <span />
          </button>
        </div>
        <div className="wifi-setting-row">
          <div>
            <strong>สุ่มรหัสผ่านใหม่</strong>
            <small>{used > 0 ? `อุปกรณ์ ${used} เครื่องจะถูกตัดการเชื่อมต่อ` : 'สร้างรหัสผ่านใหม่แบบสุ่ม 10 ตัวอักษร'}</small>
          </div>
          <button type="button" className="wifi-btn is-warning" disabled={busy} onClick={() => request('reset')}>สุ่มรหัสใหม่</button>
        </div>
      </div>

      {confirm && (
        <div className="wifi-confirm" role="alert">
          <p>
            {confirm === 'reset' ? 'ยืนยันสุ่มรหัสผ่านใหม่?' : 'ยืนยันปิด Wi-Fi?'}{' '}
            อุปกรณ์ทั้ง {used} เครื่องจะถูกตัดการเชื่อมต่อ
          </p>
          <div className="wifi-confirm-actions">
            <button type="button" className="wifi-btn" disabled={busy} onClick={() => setConfirm(null)}>ไม่ใช่</button>
            <button type="button" className="wifi-btn is-danger" disabled={busy} onClick={() => request(confirm)}>
              {confirm === 'reset' ? 'สุ่มรหัสใหม่' : 'ปิด Wi-Fi'}
            </button>
          </div>
        </div>
      )}
    </WifiModal>
  )
}

function WifiRoomCard({ room, onChange }) {
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const used = room.devices.length
  const isFull = used >= room.max_devices
  const onlineCount = room.devices.filter((item) => item.is_online).length

  const openModal = (next) => {
    setError('')
    setModal(next)
  }

  const closeModal = () => {
    if (busy) return
    setError('')
    setModal(null)
  }

  const run = async (request, { keepOpen = false } = {}) => {
    setBusy(true)
    setError('')
    try {
      const { data } = await request()
      onChange(data.room, data.message)
      if (!keepOpen) setModal(null)
      return true
    } catch (requestError) {
      setError(errorMessage(requestError, 'ทำรายการไม่สำเร็จ'))
      return false
    } finally {
      setBusy(false)
    }
  }

  const url = `${API_BASE}/${room.room_number}`
  const saveSettings = (body, options) => run(() => axios.patch(url, body), options)

  return (
    <article className={`wifi-room-card${room.is_enabled ? '' : ' is-disabled'}`}>
      <header className="wifi-room-head">
        <div>
          <h4>ห้อง {room.room_number}</h4>
          <small>{room.tenant_name || (room.is_booked ? 'มีผู้เช่า' : 'ห้องว่าง')}</small>
        </div>
        <span className={`wifi-status-badge ${room.is_enabled ? (isFull ? 'is-full' : 'is-active') : 'is-off'}`}>
          {room.is_enabled ? (isFull ? 'เต็มแล้ว' : 'ใช้งานอยู่') : 'ปิดใช้งาน'}
        </span>
      </header>

      <div className="wifi-usage">
        <div className="wifi-usage-text">
          <span>เชื่อมต่อแล้ว <strong>{used} / {room.max_devices}</strong> เครื่อง</span>
          {used > 0 && <small>ออนไลน์ {onlineCount}</small>}
        </div>
        <SlotMeter devices={room.devices} max={room.max_devices} />
      </div>

      <div className="wifi-device-section">
        <div className="wifi-device-head">
          <span>อุปกรณ์ที่เชื่อมต่อ</span>
          <button
            type="button"
            className="wifi-link-btn"
            disabled={!room.is_enabled || isFull || busy}
            title={!room.is_enabled ? 'Wi-Fi ปิดใช้งานอยู่' : isFull ? 'เชื่อมต่อครบจำนวนแล้ว' : undefined}
            onClick={() => openModal({ type: 'add' })}
          >
            + เพิ่มอุปกรณ์
          </button>
        </div>
        {used === 0 ? (
          <p className="wifi-empty-text">{room.is_enabled ? 'ยังไม่มีอุปกรณ์เชื่อมต่อ' : 'Wi-Fi ของห้องนี้ปิดใช้งานอยู่'}</p>
        ) : (
          <ul className="wifi-device-list">
            {room.devices.map((item) => (
              <li key={item.id}>
                <span className="wifi-device-icon"><DeviceIcon type={item.device_type} /></span>
                <span className="wifi-device-name">
                  <strong className="wifi-device-label" title={`${item.device_name} · ${item.mac_address}`}>{item.device_name}</strong>
                  <small>{DEVICE_TYPE_LABEL[item.device_type] || 'อื่น ๆ'}</small>
                </span>
                <button
                  type="button"
                  className={`wifi-online-toggle${item.is_online ? ' is-online' : ''}`}
                  disabled={busy}
                  title="กดเพื่อสลับสถานะ (จำลอง)"
                  onClick={() => run(() => axios.patch(`${url}/devices/${item.id}`, { is_online: !item.is_online }))}
                >
                  {item.is_online ? 'ออนไลน์' : 'ออฟไลน์'}
                </button>
                <button
                  type="button"
                  className="wifi-remove-btn"
                  aria-label={`ตัดการเชื่อมต่อ ${item.device_name}`}
                  title="ตัดการเชื่อมต่อ"
                  disabled={busy}
                  onClick={() => openModal({ type: 'remove', device: item })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && !modal && <p className="wifi-error" role="alert">{error}</p>}

      <footer className="wifi-room-actions">
        <button type="button" className="wifi-btn" disabled={busy} onClick={() => openModal({ type: 'password' })}>ดูรหัส Wi-Fi</button>
        <button type="button" className="wifi-btn" disabled={busy} onClick={() => openModal({ type: 'limit' })}>แก้จำนวนเครื่อง</button>
        <button type="button" className="wifi-btn is-danger-ghost" disabled={used === 0 || busy} onClick={() => openModal({ type: 'remove-all' })}>ตัดการเชื่อมต่อ</button>
      </footer>

      {modal?.type === 'add' && (
        <AddDeviceModal
          room={room}
          busy={busy}
          error={error}
          onClose={closeModal}
          onSubmit={(body) => run(() => axios.post(`${url}/devices`, body))}
        />
      )}
      {modal?.type === 'limit' && (
        <LimitModal
          room={room}
          busy={busy}
          error={error}
          onClose={closeModal}
          onSubmit={(maxDevices) => saveSettings({ max_devices: maxDevices })}
        />
      )}
      {(modal?.type === 'remove' || modal?.type === 'remove-all') && (
        <RemoveDevicesModal
          room={room}
          device={modal.device}
          busy={busy}
          error={error}
          onClose={closeModal}
          onSubmit={() => run(() => axios.delete(modal.device ? `${url}/devices/${modal.device.id}` : `${url}/devices`))}
        />
      )}
      {modal?.type === 'password' && (
        <PasswordModal
          room={room}
          busy={busy}
          error={error}
          onClose={closeModal}
          onRename={(ssid) => saveSettings({ ssid }, { keepOpen: true })}
          onToggle={() => saveSettings({ is_enabled: !room.is_enabled }, { keepOpen: true })}
          onReset={() => run(() => axios.post(`${url}/reset-password`, {}), { keepOpen: true })}
        />
      )}
    </article>
  )
}

export default function WifiManager() {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [notice, setNotice] = useState(null)

  const load = useCallback(() => {
    return axios
      .get(API_BASE)
      .then(({ data }) => setRooms(data.rooms || []))
      .catch((error) => setNotice({ type: 'error', message: errorMessage(error, 'โหลดข้อมูล Wi-Fi ไม่สำเร็จ') }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  const updateRoom = useCallback((room, message) => {
    setRooms((current) => current.map((item) => (item.room_number === room.room_number ? room : item)))
    if (message) setNotice({ type: 'success', message })
  }, [])

  const keyword = search.trim()
  const searched = keyword ? rooms.filter((room) => String(room.room_number).includes(keyword)) : rooms
  const activeFilter = STATUS_FILTERS.find((item) => item.key === filter) || STATUS_FILTERS[0]
  const visible = searched.filter(activeFilter.match)
  const totalDevices = rooms.reduce((sum, room) => sum + room.devices.length, 0)
  const totalCapacity = rooms.filter((room) => room.is_enabled).reduce((sum, room) => sum + room.max_devices, 0)

  return (
    <section className="wifi-manager">
      <div className="wifi-manager-head">
        <div className="wifi-manager-title">
          <span className="wifi-title-icon"><WifiIcon size={20} /></span>
          <div>
            <h3>จัดการ Wi-Fi รายห้อง</h3>
            <div className="wifi-manager-meta">
              <span className="wifi-sim-tag">ระบบจำลองสำหรับทดสอบ</span>
              <span className="wifi-total-stat">
                เชื่อมต่อรวม <strong>{totalDevices}</strong> / {totalCapacity} เครื่อง
              </span>
            </div>
          </div>
        </div>
        <input
          className="wifi-input wifi-search"
          type="search"
          inputMode="numeric"
          placeholder="ค้นหาเลขห้อง"
          aria-label="ค้นหาเลขห้อง"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="wifi-filters" role="group" aria-label="กรองสถานะ Wi-Fi">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`wifi-filter-chip${filter === item.key ? ' is-active' : ''}`}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            <span>{searched.filter(item.match).length}</span>
          </button>
        ))}
        <button type="button" className="wifi-link-btn wifi-refresh" onClick={() => { setLoading(true); load() }} disabled={loading}>รีเฟรช</button>
      </div>

      {notice && <div className={`wifi-notice is-${notice.type}`} role="status">{notice.message}</div>}

      {loading && rooms.length === 0 ? (
        <p className="wifi-empty-text">กำลังโหลดข้อมูล Wi-Fi...</p>
      ) : visible.length === 0 ? (
        <p className="wifi-empty-text">{rooms.length === 0 ? 'ยังไม่มีห้องพักในระบบ' : 'ไม่พบห้องที่ตรงกับการค้นหา'}</p>
      ) : (
        <div className="wifi-room-grid">
          {visible.map((room) => <WifiRoomCard key={room.room_number} room={room} onChange={updateRoom} />)}
        </div>
      )}
    </section>
  )
}

export function CustomerWifiCard() {
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  const connectDevice = async (body) => {
    setAdding(true)
    setAddError('')
    try {
      const { data } = await axios.post(`${API_BASE}/me/devices`, body)
      setRoom(data.room)
      setNotice(data.message || 'เชื่อมต่ออุปกรณ์แล้ว')
      setAddOpen(false)
    } catch (requestError) {
      setAddError(errorMessage(requestError, 'เชื่อมต่ออุปกรณ์ไม่สำเร็จ'))
    } finally {
      setAdding(false)
    }
  }

  const disconnectDevice = async () => {
    setRemoving(true)
    setRemoveError('')
    try {
      const { data } = await axios.delete(`${API_BASE}/me/devices/${removeTarget.id}`)
      setRoom(data.room)
      setNotice(data.message || 'ยกเลิกการเชื่อมต่ออุปกรณ์แล้ว')
      setRemoveTarget(null)
    } catch (requestError) {
      setRemoveError(errorMessage(requestError, 'ยกเลิกการเชื่อมต่อไม่สำเร็จ'))
    } finally {
      setRemoving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    axios
      .get(`${API_BASE}/me`)
      .then(({ data }) => { if (!cancelled) setRoom(data.room) })
      .catch((requestError) => { if (!cancelled) setError(errorMessage(requestError, 'โหลดข้อมูล Wi-Fi ไม่สำเร็จ')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const used = room?.devices.length || 0
  const remaining = room ? Math.max(0, room.max_devices - used) : 0
  const onlineCount = room?.devices.filter((item) => item.is_online).length || 0

  return (
    <section className="dashboard-card wifi-customer-card" aria-labelledby="customer-wifi-title">
      <div className="wifi-manager-title">
        <span className="wifi-title-icon"><WifiIcon size={20} /></span>
        <div>
          <h3 id="customer-wifi-title">Wi-Fi ห้องของฉัน</h3>
          {room && <p>ห้อง {room.room_number}</p>}
        </div>
        {room && (
          <span className={`wifi-status-badge ${room.is_enabled ? 'is-active' : 'is-off'}`}>
            {room.is_enabled ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
          </span>
        )}
      </div>

      {loading ? (
        <p className="wifi-empty-text">กำลังโหลดข้อมูล Wi-Fi...</p>
      ) : error ? (
        <p className="wifi-error" role="alert">{error}</p>
      ) : !room ? (
        <p className="wifi-empty-text">ยังไม่มีข้อมูล Wi-Fi สำหรับห้องของคุณ</p>
      ) : (
        <>
          <div className="wifi-customer-grid">
            {room.is_enabled ? (
              <CredentialsCard
                room={room}
                className="is-hero"
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword((value) => !value)}
              />
            ) : (
              <div className="wifi-cred-card is-off is-hero wifi-customer-off">
                <WifiIcon size={28} />
                <strong>Wi-Fi ยังไม่เปิดใช้งาน</strong>
                <small>หากต้องการใช้ กรุณาติดต่อเจ้าหน้าที่</small>
              </div>
            )}

            <div className={`wifi-customer-usage${!room.is_enabled ? ' is-off' : remaining === 0 ? ' is-full' : ''}`}>
              <div className="wifi-customer-usage-head">
                <span>เชื่อมต่อแล้ว</span>
                {room.is_enabled && remaining === 0 && <span className="wifi-status-badge is-full">เต็มแล้ว</span>}
              </div>
              <div className="wifi-customer-count">
                <strong>{used}</strong>
                <span>/ {room.max_devices} เครื่อง</span>
              </div>
              <small className="wifi-customer-remaining">
                {room.is_enabled
                  ? remaining > 0 ? `เชื่อมต่อเพิ่มได้อีก ${remaining} เครื่อง` : 'เชื่อมต่อครบจำนวนแล้ว'
                  : 'ปิดใช้งานอยู่'}
              </small>
              <SlotMeter devices={room.devices} max={room.max_devices} />
            </div>
          </div>

          <div className="wifi-device-section">
            <div className="wifi-device-head">
              <span>อุปกรณ์ที่เชื่อมต่อ</span>
              <div className="wifi-device-head-actions">
                {used > 0 && <span className="wifi-online-count"><i aria-hidden="true" />ออนไลน์ {onlineCount} / {used}</span>}
                <button
                  type="button"
                  className="wifi-test-connect"
                  disabled={!room.is_enabled || remaining === 0 || adding}
                  title={!room.is_enabled ? 'Wi-Fi ปิดใช้งานอยู่' : remaining === 0 ? 'เชื่อมต่อครบจำนวนแล้ว' : 'จำลองการเชื่อมต่ออุปกรณ์ (สำหรับทดสอบ)'}
                  onClick={() => {
                    setAddError('')
                    setAddOpen(true)
                  }}
                >
                  + เชื่อมต่ออุปกรณ์
                  <span className="wifi-test-badge">ทดสอบ</span>
                </button>
              </div>
            </div>
            {used === 0 ? (
              <p className="wifi-empty-box">ยังไม่มีอุปกรณ์เชื่อมต่อ</p>
            ) : (
              <ul className="wifi-customer-devices">
                {room.devices.map((item) => (
                  <li key={item.id} className={item.is_online ? 'is-online' : ''}>
                    <span className="wifi-device-icon"><DeviceIcon type={item.device_type} size={20} /></span>
                    <span className="wifi-device-name">
                      <strong className="wifi-device-label" title={item.device_name}>{item.device_name}</strong>
                      <small>{DEVICE_TYPE_LABEL[item.device_type] || 'อื่น ๆ'}</small>
                    </span>
                    <span className="wifi-presence">{item.is_online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
                    <button
                      type="button"
                      className="wifi-device-cancel"
                      aria-label={`ยกเลิกการเชื่อมต่อ ${item.device_name}`}
                      title="ยกเลิกการเชื่อมต่อ"
                      disabled={removing}
                      onClick={() => {
                        setRemoveError('')
                        setRemoveTarget(item)
                      }}
                    >
                      ยกเลิก
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {notice && <div className="wifi-notice is-success" role="status">{notice}</div>}
          </div>

          {addOpen && (
            <AddDeviceModal
              room={room}
              busy={adding}
              error={addError}
              onClose={() => !adding && setAddOpen(false)}
              onSubmit={connectDevice}
            />
          )}

          {removeTarget && (
            <RemoveDevicesModal
              room={room}
              device={removeTarget}
              busy={removing}
              error={removeError}
              onClose={() => !removing && setRemoveTarget(null)}
              onSubmit={disconnectDevice}
            />
          )}

          {room.is_enabled && (
            <p className="wifi-note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9.5" /><path d="M12 11v5" /><path d="M12 8h.01" />
              </svg>
              ต้องการเพิ่มจำนวนเครื่องหรือเปลี่ยนรหัส กรุณาติดต่อเจ้าหน้าที่
            </p>
          )}
        </>
      )}
    </section>
  )
}
