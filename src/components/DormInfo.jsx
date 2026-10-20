import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import './DormInfo.css'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'

const PUBLISHED_FIELDS = ['dorm_name', 'dorm_rules', 'gate_close_time', 'caretaker_phone']

function hasDormInfoChanges(current, saved) {
  if (!saved) return true
  return PUBLISHED_FIELDS.some((field) => (current?.[field] || '') !== (saved[field] || ''))
}

function dormInfoHeaders() {
  return { Authorization: `Bearer ${sessionStorage.getItem('token')}` }
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

export function DormInfoSettings({ apiBase, children = null, slipPreview = null }) {
  const { config, setConfig, loading, error, reload } = useDormInfo(apiBase)
  const [previewTab, setPreviewTab] = useState('info')
  const showSlip = Boolean(slipPreview) && previewTab === 'slip'
  const previewChanged = showSlip ? slipPreview.changed : null
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const formId = useId()
  const form = draft || config
  const changed = hasDormInfoChanges(form, config)
  const previewRules = (form?.dorm_rules || '').split(/\r?\n/).map((rule) => rule.trim()).filter(Boolean)
  const ruleLines = (form?.dorm_rules || '').split(/\r?\n/)
  const pendingRuleFocusRef = useRef(null)
  const update = (event) => {
    setDraft({ ...form, [event.target.name]: event.target.value })
    setNotice(null)
  }
  const setRuleLines = (lines, focusIndex = null) => {
    pendingRuleFocusRef.current = focusIndex
    setDraft({ ...form, dorm_rules: lines.join('\n') })
    setNotice(null)
  }
  const updateRule = (index, value) => setRuleLines(ruleLines.map((line, lineIndex) => (lineIndex === index ? value : line)))
  const addRule = (afterIndex = ruleLines.length - 1) => {
    const next = [...ruleLines]
    next.splice(afterIndex + 1, 0, '')
    setRuleLines(next, afterIndex + 1)
  }
  const removeRule = (index) => {
    const next = ruleLines.filter((_, lineIndex) => lineIndex !== index)
    setRuleLines(next.length ? next : [''], Math.max(0, Math.min(index, next.length - 1)))
  }
  const moveRule = (index, offset) => {
    const target = index + offset
    if (target < 0 || target >= ruleLines.length) return
    const next = [...ruleLines]
    ;[next[index], next[target]] = [next[target], next[index]]
    setRuleLines(next, target)
  }

  useEffect(() => {
    if (pendingRuleFocusRef.current === null) return
    document.getElementById(`${formId}-rule-${pendingRuleFocusRef.current}`)?.focus()
    pendingRuleFocusRef.current = null
  })

  const save = (event) => {
    event.preventDefault()
    if (!form || saving || !changed) return
    setNotice(null)
    setDialog('confirm')
  }

  const confirmSave = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const payload = { ...form, dorm_rules: ruleLines.map((line) => line.trim()).filter(Boolean).join('\n') }
      const { data } = await axios.put(apiBase, payload, { headers: dormInfoHeaders() })
      setConfig(data.config)
      setDraft(null)
      setSuccessMessage(data.message || 'บันทึกกฎระเบียบและเบอร์ติดต่อเรียบร้อยแล้ว')
      setDialog('success')
    } catch (saveError) {
      setDialog(null)
      setNotice({ type: 'error', message: saveError.response?.data?.message || 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dorm-settings">
      <div className="dorm-settings-main">
      <section className="dorm-settings-editor" aria-labelledby={`${formId}-title`}>
        <div className="dorm-settings-head">
          <span className="dorm-settings-head-icon" aria-hidden="true">
            <Icon name="book" size={20} />
          </span>
          <div className="dorm-settings-head-text">
            <h2 id={`${formId}-title`}>จัดการกฎระเบียบและเบอร์ติดต่อ</h2>
            <p>เมื่อบันทึกสำเร็จ ผู้เช่าและเจ้าหน้าที่จะเห็นข้อมูลชุดเดียวกันทันที</p>
          </div>
          {form && (
            <span className={`dorm-settings-status ${changed ? 'is-draft' : 'is-saved'}`}>
              {changed ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกล่าสุดแล้ว'}
            </span>
          )}
        </div>

        {error && <p className="dorm-settings-alert is-error" role="alert">{error}</p>}
        {notice && (
          <p className={`dorm-settings-alert is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
            {notice.message}
          </p>
        )}
        {loading && !form && <div className="dorm-settings-loading" role="status">กำลังโหลดข้อมูล...</div>}
        {!loading && !config && (
          <button type="button" className="dorm-settings-btn is-ghost" onClick={reload}>ลองใหม่</button>
        )}

        {form && (
          <form onSubmit={save} className="dorm-settings-form">
            <fieldset disabled={saving || loading}>
              <div className="dorm-settings-group">
                <div className="dorm-settings-group-head">
                  <Icon name="book" size={16} />
                  <span>ข้อมูลทั่วไป</span>
                </div>
                <div className="dorm-settings-field">
                  <label htmlFor={`${formId}-name`}>ชื่อหอพัก</label>
                  <input id={`${formId}-name`} name="dorm_name" value={form.dorm_name} onChange={update} maxLength={255} required placeholder="ชื่อหอพัก" />
                </div>
              </div>

              <div className="dorm-settings-group">
                <div className="dorm-settings-group-head">
                  <Icon name="rules" size={16} />
                  <span>กฎระเบียบหอพัก</span>
                  <span className="dorm-settings-count">{previewRules.length} ข้อ</span>
                </div>
                <ol className="dorm-rule-list">
                  {ruleLines.map((line, index) => (
                    <li key={index} className="dorm-rule-item">
                      <span className="dorm-rule-no" aria-hidden="true">{index + 1}</span>
                      <label htmlFor={`${formId}-rule-${index}`} className="dorm-settings-sr">กฎข้อที่ {index + 1}</label>
                      <input
                        id={`${formId}-rule-${index}`}
                        value={line}
                        maxLength={500}
                        placeholder={index === 0 ? 'เช่น ห้ามส่งเสียงดังหลัง 22:00 น.' : 'พิมพ์กฎข้อนี้'}
                        onChange={(event) => updateRule(index, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addRule(index)
                          } else if (event.key === 'Backspace' && !line && ruleLines.length > 1) {
                            event.preventDefault()
                            removeRule(index)
                          }
                        }}
                      />
                      <span className="dorm-rule-actions">
                        <button type="button" onClick={() => moveRule(index, -1)} disabled={index === 0} aria-label={`เลื่อนกฎข้อที่ ${index + 1} ขึ้น`} title="เลื่อนขึ้น">
                          <Icon name="up" size={14} strokeWidth={2.4} />
                        </button>
                        <button type="button" onClick={() => moveRule(index, 1)} disabled={index === ruleLines.length - 1} aria-label={`เลื่อนกฎข้อที่ ${index + 1} ลง`} title="เลื่อนลง">
                          <Icon name="down" size={14} strokeWidth={2.4} />
                        </button>
                        <button type="button" className="is-danger" onClick={() => removeRule(index)} aria-label={`ลบกฎข้อที่ ${index + 1}`} title="ลบข้อนี้">
                          <Icon name="trash" size={14} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
                <button type="button" className="dorm-rule-add" onClick={() => addRule()}>
                  <Icon name="plus" size={16} strokeWidth={2.4} />
                  เพิ่มข้อ
                </button>
                <small className="dorm-settings-hint">กด Enter เพื่อเพิ่มข้อถัดไป · ข้อที่เว้นว่างจะไม่ถูกบันทึก</small>
              </div>

              <div className="dorm-settings-group">
                <div className="dorm-settings-group-head">
                  <Icon name="phone" size={16} />
                  <span>เบอร์ติดต่อฉุกเฉิน</span>
                </div>
                <div className="dorm-settings-field">
                  <label htmlFor={`${formId}-caretaker`}>ผู้ดูแลหอพัก</label>
                  <div className="dorm-settings-input-icon">
                    <Icon name="phone" size={16} />
                    <input id={`${formId}-caretaker`} type="tel" name="caretaker_phone" value={form.caretaker_phone} onChange={update} maxLength={20} placeholder="เช่น 0812345678" />
                  </div>
                </div>
              </div>

              <div className={`dorm-settings-actions${changed ? ' is-dirty' : ''}`}>
                <span className="dorm-settings-actions-note">
                  {saving ? 'กำลังบันทึกข้อมูล...' : changed ? 'แก้ไขแล้ว ยังไม่ได้บันทึก' : 'ไม่มีการเปลี่ยนแปลง'}
                </span>
                <button type="button" className="dorm-settings-btn is-ghost" disabled={!changed} onClick={() => { setDraft(null); setNotice(null) }}>
                  ยกเลิกการแก้ไข
                </button>
                <button type="submit" className="dorm-settings-btn is-primary" disabled={!changed}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </fieldset>
          </form>
        )}
      </section>
      {children}
      </div>

      <SettingsDialog
        open={dialog === 'confirm'}
        tone="primary"
        icon="rules"
        title="ยืนยันการบันทึกข้อมูล"
        message="ผู้เช่าและเจ้าหน้าที่จะเห็นกฎระเบียบและเบอร์ติดต่อชุดใหม่ทันทีหลังบันทึก"
        details={[
          ['ชื่อหอพัก', form?.dorm_name || '-'],
          ['กฎระเบียบ', `${previewRules.length} ข้อ`],
          ['ผู้ดูแลหอพัก', form?.caretaker_phone || 'ไม่ระบุ'],
        ]}
        confirmLabel={saving ? 'กำลังบันทึก...' : 'ยืนยันบันทึก'}
        busy={saving}
        onConfirm={confirmSave}
        onCancel={() => setDialog(null)}
      />
      <SettingsDialog
        open={dialog === 'success'}
        tone="success"
        icon="check"
        title="บันทึกสำเร็จ"
        message={successMessage}
        confirmLabel="ตกลง"
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
        hideCancel
      />

      {form && (
        <aside className="dorm-settings-preview" aria-label="ตัวอย่างที่ผู้เช่าเห็น">
          <div className="dorm-settings-preview-head">
            <span>ตัวอย่างที่ผู้เช่าเห็น</span>
            <span className={`dorm-settings-status ${(showSlip ? previewChanged : changed) ? 'is-draft' : 'is-saved'}`}>{(showSlip ? previewChanged : changed) ? 'ตัวอย่างก่อนบันทึก' : 'ข้อมูลปัจจุบัน'}</span>
          </div>
          {slipPreview && (
            <div className="dorm-settings-preview-tabs" role="tablist" aria-label="เลือกตัวอย่าง">
              <button type="button" role="tab" aria-selected={!showSlip} className={!showSlip ? 'is-active' : ''} onClick={() => setPreviewTab('info')}>
                <Icon name="rules" size={15} />
                กฎระเบียบและเบอร์ติดต่อ
              </button>
              <button type="button" role="tab" aria-selected={showSlip} className={showSlip ? 'is-active' : ''} onClick={() => setPreviewTab('slip')}>
                <Icon name="bank" size={15} />
                ชำระเงินและแนบสลิป
              </button>
            </div>
          )}
          {showSlip ? slipPreview.content : (
          <div className="dorm-settings-preview-card">
            <div className="dorm-settings-preview-title">
              <Icon name="book" size={18} />
              <span>
                <strong>กฎระเบียบและเบอร์ติดต่อ</strong>
                <small>{form.dorm_name || 'ชื่อหอพัก'}</small>
              </span>
            </div>

            <section className="dorm-menu-card">
              <h3>
                <Icon name="rules" size={18} />
                กฎระเบียบหอพัก
                {previewRules.length > 0 && <span className="dorm-menu-count">{previewRules.length} ข้อ</span>}
              </h3>
              {previewRules.length > 0 ? (
                <ol className="dorm-menu-rules">
                  {previewRules.map((rule, index) => (
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
              <h3><Icon name="phone" size={18} />เบอร์ติดต่อฉุกเฉิน</h3>
              <div className="dorm-menu-contacts">
                <ContactRow icon="phone" label="ผู้ดูแลหอพัก" phone={form.caretaker_phone} />
              </div>
            </section>
          </div>
          )}
        </aside>
      )}
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
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 10" />
    </>
  ),
  bank: (
    <>
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
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

export function SettingsDialog({
  open,
  tone = 'primary',
  icon = 'rules',
  title,
  message,
  details = [],
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  busy = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return undefined
    const unlock = lockBodyScroll()
    const handleKey = (event) => {
      if (event.key === 'Escape' && !busy) onCancel?.()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      unlock()
    }
  }, [open, busy, onCancel])

  if (!open) return null
  return createPortal(
    <div className="dorm-dialog-overlay" role="presentation" onClick={() => !busy && onCancel?.()}>
      <section
        className={`dorm-dialog is-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dorm-dialog-body">
          <span className="dorm-dialog-icon" aria-hidden="true">
            <Icon name={icon} size={26} strokeWidth={2.2} />
          </span>
          <h3 id={titleId}>{title}</h3>
          {message && <p>{message}</p>}
          {details.length > 0 && (
            <dl className="dorm-dialog-details">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className={`dorm-dialog-actions${hideCancel ? ' is-single' : ''}`}>
          {!hideCancel && (
            <button type="button" className="dorm-settings-btn is-ghost" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
          )}
          <button type="button" className="dorm-settings-btn is-primary" onClick={onConfirm} disabled={busy} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
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
                    <h3><Icon name="phone" size={18} />เบอร์ติดต่อฉุกเฉิน</h3>
                    <div className="dorm-menu-contacts">
                      <ContactRow icon="phone" label="ผู้ดูแลหอพัก" phone={config.caretaker_phone} />
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
