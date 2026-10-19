import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import './DormInfo.css'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'

const PUBLISHED_FIELDS = ['dorm_name', 'dorm_rules', 'gate_close_time', 'caretaker_phone', 'technician_phone']

function hasDormInfoChanges(current, saved) {
  if (!saved) return true
  return PUBLISHED_FIELDS.some((field) => (current?.[field] || '') !== (saved[field] || ''))
}

function dormInfoHeaders() {
  return { Authorization: `Bearer ${sessionStorage.getItem('token')}` }
}

function formatThaiTime(value) {
  if (!value) return ''
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return value
  return `${match[1].padStart(2, '0')}:${match[2]} น.`
}

function useDormInfo(apiBase) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback((signal) => {
    return axios.get(apiBase, { headers: dormInfoHeaders(), signal }).then(({ data }) => {
      if (!signal?.aborted) {
        setConfig(data.config)
        setError('')
      }
    }).catch((loadError) => {
      if (!axios.isCancel(loadError)) setError(loadError.response?.data?.message || 'ไม่สามารถโหลดกฎระเบียบและเบอร์ติดต่อได้')
    }).finally(() => {
      if (!signal?.aborted) setLoading(false)
    })
  }, [apiBase])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const reload = () => {
    setLoading(true)
    setError('')
    return load()
  }
  return { config, setConfig, loading, error, reload }
}

function Contact({ label, phone }) {
  const dialablePhone = phone?.replace(/[^\d+]/g, '')
  return (
    <p>
      <span>{label}</span>
      {phone ? <a href={`tel:${dialablePhone}`}>{phone}</a> : <span>ยังไม่ได้ระบุ</span>}
    </p>
  )
}

function DormInfoPanel({ config, mode = 'published', onRefresh, refreshing = false, error = '' }) {
  const titleId = useId()
  const isPreview = mode !== 'published'
  return (
    <section className="dorm-info-panel" aria-labelledby={titleId} aria-busy={refreshing}>
      <div className="dorm-info-header">
        <div>
          <p className="dorm-info-eyebrow">{config?.dorm_name || 'ข้อมูลหอพัก'}</p>
          <h2 id={titleId}>กฎระเบียบและเบอร์ติดต่อ</h2>
        </div>
        {isPreview ? (
          <span className={`dorm-info-status is-${mode}`}>
            {mode === 'preview-draft' ? 'ตัวอย่างก่อนบันทึก' : 'ข้อมูลที่บันทึกแล้ว'}
          </span>
        ) : (
          <button type="button" className="dorm-info-refresh" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'กำลังอัปเดต...' : 'อัปเดตข้อมูลล่าสุด'}
          </button>
        )}
      </div>
      {isPreview && (
        <p className="dorm-info-note">
          {mode === 'preview-draft'
            ? 'ตัวอย่างนี้เปลี่ยนตามข้อมูลด้านบน ผู้เช่าจะเห็นหลังจากกดบันทึกสำเร็จ'
            : 'ข้อมูลนี้บันทึกแล้ว และแสดงให้ผู้เช่ากับเจ้าหน้าที่เห็น'}
        </p>
      )}
      {error && <p className="dorm-info-error" role="alert">{error}</p>}
      {!config && refreshing ? <p role="status">กำลังโหลดข้อมูล...</p> : config && (
        <div className="dorm-info-grid">
          <div className="dorm-info-item dorm-info-rules">
            <h3>กฎระเบียบหอพัก</h3>
            <p>{config.dorm_rules?.trim() || 'ยังไม่ได้ระบุกฎระเบียบหอพัก'}</p>
          </div>
          <div className="dorm-info-item">
            <h3>เวลาปิดประตู</h3>
            <p className="dorm-info-value">{formatThaiTime(config.gate_close_time) || 'ยังไม่ได้ระบุ'}</p>
          </div>
          <div className="dorm-info-item">
            <h3>เบอร์ติดต่อฉุกเฉิน</h3>
            <div className="dorm-info-contact-list">
              <Contact label="ผู้ดูแลหอพัก" phone={config.caretaker_phone} />
              <Contact label="ช่าง" phone={config.technician_phone} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export function DormInfoSettings({ apiBase }) {
  const { config, setConfig, loading, error, reload } = useDormInfo(apiBase)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const formId = useId()
  const form = draft || config
  const changed = hasDormInfoChanges(form, config)
  const update = (event) => {
    setDraft({ ...form, [event.target.name]: event.target.value })
    setNotice(null)
  }
  const save = async (event) => {
    event.preventDefault()
    if (!form || saving || !changed) return
    setSaving(true)
    setNotice(null)
    try {
      const { data } = await axios.put(apiBase, form, { headers: dormInfoHeaders() })
      setConfig(data.config)
      setDraft(null)
      setNotice({ type: 'success', message: data.message })
    } catch (saveError) {
      setNotice({ type: 'error', message: saveError.response?.data?.message || 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dorm-info-settings">
      <section className="dorm-info-panel" aria-labelledby={`${formId}-title`}>
        <div className="dorm-info-header">
          <div>
            <p className="dorm-info-eyebrow">ข้อมูลหอพัก</p>
            <h2 id={`${formId}-title`}>จัดการกฎระเบียบและเบอร์ติดต่อ</h2>
          </div>
        </div>
        <p className="dorm-info-note">เมื่อบันทึกสำเร็จ ผู้เช่าและเจ้าหน้าที่จะเห็นข้อมูลชุดเดียวกัน</p>
        {error && <p className="dorm-info-error" role="alert">{error}</p>}
        {loading && <p role="status">กำลังโหลดข้อมูล...</p>}
        {!loading && !config && <button type="button" className="dorm-info-refresh" onClick={reload}>ลองใหม่</button>}
        {notice && <p className={`dorm-info-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
        {form && (
          <form onSubmit={save}>
            <fieldset disabled={saving || loading} className="dorm-info-form">
              <div className="dorm-info-field is-wide">
                <label htmlFor={`${formId}-name`}>ชื่อหอพัก</label>
                <input id={`${formId}-name`} name="dorm_name" value={form.dorm_name} onChange={update} maxLength={255} required />
              </div>
              <div className="dorm-info-field is-wide">
                <label htmlFor={`${formId}-rules`}>กฎระเบียบหอพัก</label>
                <textarea id={`${formId}-rules`} name="dorm_rules" value={form.dorm_rules} onChange={update} rows={7} maxLength={10000} placeholder="ระบุกฎระเบียบหอพัก แยกแต่ละข้อด้วยการขึ้นบรรทัดใหม่" />
              </div>
              <div className="dorm-info-field">
                <label htmlFor={`${formId}-time`}>เวลาปิดประตู</label>
                <input id={`${formId}-time`} type="time" name="gate_close_time" value={form.gate_close_time} onChange={update} />
              </div>
              <div className="dorm-info-field">
                <label htmlFor={`${formId}-caretaker`}>เบอร์ผู้ดูแลหอพัก</label>
                <input id={`${formId}-caretaker`} type="tel" name="caretaker_phone" value={form.caretaker_phone} onChange={update} maxLength={20} placeholder="เช่น 0812345678" />
              </div>
              <div className="dorm-info-field">
                <label htmlFor={`${formId}-technician`}>เบอร์ช่าง</label>
                <input id={`${formId}-technician`} type="tel" name="technician_phone" value={form.technician_phone} onChange={update} maxLength={20} placeholder="เช่น 02-123-4567" />
              </div>
              <div className="dorm-info-actions is-wide">
                <button type="button" className="dorm-info-refresh" disabled={!changed} onClick={() => { setDraft(null); setNotice(null) }}>ยกเลิกการแก้ไข</button>
                <button type="submit" className="dorm-info-save" disabled={!changed}>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
              </div>
            </fieldset>
          </form>
        )}
      </section>
      {form && <DormInfoPanel config={form} mode={changed ? 'preview-draft' : 'preview-saved'} />}
    </div>
  )
}

const ICONS = {
  book: (
    <>
      <path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z" />
      <path d="M4 19.5A2 2 0 0 0 6 21.5h13" />
      <path d="M9 7.5h6" />
      <path d="M9 11h4" />
    </>
  ),
  rules: (
    <>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="m9 13 2 2 4-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  phone: (
    <path d="M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 4.2 2 2 0 0 1 3.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z" />
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
}

function Icon({ name, size = 16, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

function ContactRow({ icon, label, phone }) {
  const dialablePhone = phone?.replace(/[^\d+]/g, '')
  return (
    <div className={`dorm-menu-row${phone ? '' : ' is-empty'}`}>
      <span className="dorm-menu-row-icon"><Icon name={icon} size={18} /></span>
      <span className="dorm-menu-row-text">
        <span className="dorm-menu-row-label">{label}</span>
        {phone ? <a className="dorm-menu-row-value" href={`tel:${dialablePhone}`}>{phone}</a> : <span className="dorm-menu-row-empty">ยังไม่ได้ระบุ</span>}
      </span>
    </div>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div className="dorm-menu-empty">
      <Icon name={icon} size={22} strokeWidth={1.75} />
      <span>{text}</span>
    </div>
  )
}

export function DormInfoMenu({ apiBase, onManage, requireAck = false, onAcknowledge }) {
  const { config, loading, error, reload } = useDormInfo(apiBase)
  const [open, setOpen] = useState(requireAck)
  const [closing, setClosing] = useState(false)
  const [acking, setAcking] = useState(false)
  const [ackError, setAckError] = useState('')
  const titleId = useId()
  const rules = (config?.dorm_rules || '').split(/\r?\n/).map((rule) => rule.trim()).filter(Boolean)
  const requestClose = () => {
    if (!requireAck) setClosing(true)
  }

  useEffect(() => {
    if (!open) return undefined
    const unlock = lockBodyScroll()
    const handleKey = (event) => {
      if (event.key === 'Escape' && !requireAck) setClosing(true)
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      unlock()
    }
  }, [open, requireAck])

  const acknowledge = async () => {
    setAcking(true)
    setAckError('')
    try {
      await onAcknowledge()
      setClosing(true)
    } catch (ackFailure) {
      setAckError(ackFailure.response?.data?.message || 'บันทึกการรับทราบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setAcking(false)
    }
  }

  const openModal = () => {
    setOpen(true)
    if (!loading) reload()
  }

  return (
    <>
      <button
        type="button"
        className="dorm-menu-btn"
        aria-haspopup="dialog"
        onClick={openModal}
      >
        <Icon name="book" size={14} />
        กฎระเบียบและเบอร์ติดต่อ
      </button>
      {open && createPortal(
        <div
          className={`dorm-menu-overlay${closing ? ' is-closing' : ''}`}
          onClick={requestClose}
          onAnimationEnd={(event) => {
            if (closing && event.target === event.currentTarget) {
              setOpen(false)
              setClosing(false)
            }
          }}
        >
          <div
            className={`dorm-menu-modal${closing ? ' is-closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dorm-menu-header">
              <span className="dorm-menu-title">
                <Icon name="book" size={20} />
                <span>
                  <span id={titleId}>กฎระเบียบและเบอร์ติดต่อ</span>
                  {config?.dorm_name && <small>{config.dorm_name}</small>}
                </span>
              </span>
              <span className="dorm-menu-header-actions">
                {onManage && (
                  <button
                    type="button"
                    className="dorm-menu-action"
                    onClick={() => {
                      setClosing(true)
                      onManage()
                    }}
                  >
                    <Icon name="edit" size={15} />
                    จัดการข้อมูล
                  </button>
                )}
                {!requireAck && (
                  <button type="button" className="dorm-menu-close" onClick={requestClose} aria-label="ปิด">
                    <Icon name="close" size={18} strokeWidth={2.5} />
                  </button>
                )}
              </span>
            </div>

            <div className="dorm-menu-body" aria-busy={loading}>
              {error && <p className="dorm-menu-error" role="alert">{error}</p>}
              {!config && loading && <p className="dorm-menu-loading" role="status">กำลังโหลดข้อมูล...</p>}
              {config && (
                <div className="dorm-menu-grid">
                  <section className="dorm-menu-card">
                    <h3>
                      <Icon name="rules" size={18} />
                      กฎระเบียบหอพัก
                      {rules.length > 0 && <span className="dorm-menu-count">{rules.length} ข้อ</span>}
                    </h3>
                    {rules.length > 0 ? (
                      <ol className="dorm-menu-rules">
                        {rules.map((rule, index) => (
                          <li key={`${index}-${rule}`}>
                            <span className="dorm-menu-rule-no">{index + 1}</span>
                            <span>{rule}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <EmptyState icon="rules" text="ยังไม่ได้ระบุกฎระเบียบหอพัก" />
                    )}
                  </section>

                  <section className="dorm-menu-card">
                    <h3><Icon name="clock" size={18} />เวลาปิดประตู</h3>
                    {config.gate_close_time ? (
                      <p className="dorm-menu-time">{formatThaiTime(config.gate_close_time)}</p>
                    ) : (
                      <EmptyState icon="clock" text="ยังไม่ได้ระบุเวลาปิดประตู" />
                    )}
                  </section>

                  <section className="dorm-menu-card">
                    <h3><Icon name="phone" size={18} />เบอร์ติดต่อฉุกเฉิน</h3>
                    <div className="dorm-menu-contacts">
                      <ContactRow icon="phone" label="ผู้ดูแลหอพัก" phone={config.caretaker_phone} />
                      <ContactRow icon="wrench" label="ช่าง" phone={config.technician_phone} />
                    </div>
                  </section>
                </div>
              )}
            </div>

            {requireAck && (
              <div className="dorm-menu-ack">
                {ackError && <p className="dorm-menu-error" role="alert">{ackError}</p>}
                <p className="dorm-menu-ack-note">กรุณาอ่านกฎระเบียบและบันทึกเบอร์ติดต่อฉุกเฉินไว้ แล้วกดรับทราบเพื่อเริ่มใช้งาน</p>
                <button type="button" className="dorm-menu-ack-btn" onClick={acknowledge} disabled={acking || loading}>
                  <Icon name="rules" size={16} />
                  {acking ? 'กำลังบันทึก...' : 'รับทราบ'}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
