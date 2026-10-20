import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { DormInfoSettings, SettingsDialog } from '../components/DormInfo'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts'
import './css/OwnerPage.css'
import './css/StaffPage.css'
import { StaffResidentVisitsTab, StaffSafetyTab } from './StaffMain.jsx'
import { UploadImage } from '../components/UploadMedia.jsx'
import PromptPayQr from '../components/PromptPayQr.jsx'
import { DEMO_PAYMENT_CHANNELS, formatPromptPayId, isValidPromptPayId, normalizePromptPayId } from '../utils/promptpay.js'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import ProcessSteps from '../components/ProcessSteps.jsx'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'
import { downloadUploadFile } from '../utils/uploadFiles.js'

const EMPTY = { promptpay_id: '', bank_name: '', bank_account_no: '', test_mode: false, verify_mode: 'auto' }
const SLIP_VERIFY_OPTIONS = [
  { key: 'auto', label: 'ตรวจอัตโนมัติ', hint: 'ตรวจสลิปกับธนาคารผ่าน RDCW ผ่านแล้วเป็น “ชำระแล้ว” ทันที และใช้สลิปซ้ำไม่ได้' },
  { key: 'manual', label: 'เจ้าหน้าที่ตรวจเอง', hint: 'ไม่ส่งไปตรวจที่ RDCW สลิปจะรอให้เจ้าหน้าที่กดอนุมัติหรือปฏิเสธ' },
]
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

const SLIP_PREVIEW_AMOUNT = 3500

function OwnerSlipPreview({ settings }) {
  const [method, setMethod] = useState('promptpay')
  const channels = settings.test_mode ? DEMO_PAYMENT_CHANNELS : settings
  const hasPromptPay = isValidPromptPayId(channels.promptpay_id)
  const hasBank = Boolean(channels.bank_name && channels.bank_account_no)
  const manual = settings.verify_mode === 'manual'
  return (
    <div className="dorm-settings-preview-card owner-slip-preview">
      <div className="dorm-settings-preview-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
        <span><strong>ชำระเงินและแนบสลิป</strong><small>ตัวอย่างยอด ฿{currency(SLIP_PREVIEW_AMOUNT)}</small></span>
      </div>
      <section className="dorm-menu-card owner-slip-preview-body">
        <div className="owner-slip-preview-amount"><span>ยอดที่ต้องชำระ</span><strong>฿{currency(SLIP_PREVIEW_AMOUNT)}</strong></div>
        {settings.test_mode && <div className="owner-slip-preview-test" role="note"><strong>โหมดทดลอง</strong><span>QR และบัญชีด้านล่างเป็นตัวอย่าง ห้ามโอนเงินจริง แนบรูปใดก็ได้เพื่อทดสอบระบบ</span></div>}
        <span className="owner-slip-preview-label">เลือกช่องทางการชำระเงิน</span>
        <div className="owner-slip-preview-methods" role="radiogroup" aria-label="ช่องทางการชำระเงินตัวอย่าง">
          {[
            { key: 'promptpay', label: 'PromptPay', hint: 'สแกน QR จากแอปธนาคาร', available: hasPromptPay },
            { key: 'bank', label: 'โอนเข้าบัญชี', hint: 'โอนผ่านเลขบัญชีธนาคาร', available: hasBank },
          ].map((option) => (
            <button key={option.key} type="button" role="radio" aria-checked={method === option.key} className={method === option.key ? 'is-active' : ''} onClick={() => setMethod(option.key)}>
              <span className="owner-slip-preview-method-icon" aria-hidden="true">
                {option.key === 'promptpay' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>
                )}
              </span>
              <span className="owner-slip-preview-method-text">
                <strong>{option.label}</strong>
                <small>{option.available ? option.hint : 'หอพักยังไม่ได้ตั้งค่า'}</small>
              </span>
            </button>
          ))}
        </div>
        {method === 'promptpay' ? (
          hasPromptPay ? (
            <div className="owner-slip-preview-panel is-promptpay">
              <span className="owner-slip-preview-badge">PromptPay</span>
              <PromptPayQr promptPayId={channels.promptpay_id} amount={SLIP_PREVIEW_AMOUNT} size={172} className="owner-pp-qr" />
              <strong>{formatPromptPayId(channels.promptpay_id)}</strong>
              <p className="owner-slip-preview-owner">ชำระผ่าน PromptPay</p>
              <small>สแกนผ่านแอปธนาคาร ยอดเงินจะถูกใส่ให้อัตโนมัติ</small>
            </div>
          ) : <div className="owner-slip-preview-panel is-empty">หอพักยังไม่ได้ตั้งค่า PromptPay กรุณาเลือกโอนเข้าบัญชีหรือติดต่อเจ้าหน้าที่</div>
        ) : hasBank ? (
          <div className="owner-slip-preview-panel is-bank">
            <div><span>ธนาคาร</span><strong>{channels.bank_name}</strong></div>
            <div><span>เลขบัญชี</span><strong className="is-account">{channels.bank_account_no}</strong><em className="owner-slip-preview-copy" aria-hidden="true">คัดลอก</em></div>
            <small>โอนยอด ฿{currency(SLIP_PREVIEW_AMOUNT)} แล้วแนบสลิปด้านล่าง</small>
          </div>
        ) : <div className="owner-slip-preview-panel is-empty">หอพักยังไม่ได้ตั้งค่าบัญชีธนาคาร กรุณาเลือก PromptPay หรือติดต่อเจ้าหน้าที่</div>}
        <span className="owner-slip-preview-label">แนบสลิปโอนเงิน <em className="owner-slip-preview-required">จำเป็น</em></span>
        <div className="owner-slip-preview-drop" aria-hidden="true">
          <span className="owner-slip-preview-drop-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </span>
          <strong>ลากรูปสลิปมาวางที่นี่</strong>
          <span>หรือ <b>คลิกเพื่อเลือกไฟล์</b></span>
          <small>JPG, PNG หรือ WebP ไม่เกิน 5 MB</small>
        </div>
        <div className={`owner-slip-preview-verify${manual ? ' is-manual' : ''}`}>
          <strong>{manual ? 'ส่งสลิปให้เจ้าหน้าที่ตรวจ' : 'ตรวจสอบสลิปและชำระเงิน'}</strong>
          <small>{manual ? 'สลิปจะรอเจ้าหน้าที่อนุมัติก่อนเป็น “ชำระแล้ว”' : settings.test_mode ? 'โหมดทดลอง: ไม่ตรวจกับธนาคาร เป็น “ชำระแล้ว” ทันที' : 'ระบบตรวจสลิปกับธนาคารอัตโนมัติ ผ่านแล้วเป็น “ชำระแล้ว” ทันที'}</small>
        </div>
      </section>
    </div>
  )
}

function OwnerDormInfoSettings() {
  const [paymentPreview, setPaymentPreview] = useState(null)
  return (
    <DormInfoSettings
      apiBase="/api/owner/dorm-info"
      slipPreview={paymentPreview && { changed: paymentPreview.changed, content: <OwnerSlipPreview settings={paymentPreview.settings} /> }}
    >
      <OwnerPaymentSettings onPreviewChange={setPaymentPreview} />
    </DormInfoSettings>
  )
}

function OwnerPaymentSettings({ onPreviewChange }) {
  const id = useId()
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [qrPreviewId, setQrPreviewId] = useState('')
  const [qrError, setQrError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [successText, setSuccessText] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    axios.get('/api/owner/payment-settings', { headers: headers(), signal: controller.signal })
      .then(({ data }) => {
        const settings = { ...data.settings, test_mode: Boolean(data.testMode), verify_mode: data.verifyMode === 'manual' ? 'manual' : 'auto' }
        setSaved(settings)
        setDraft(settings)
        if (isValidPromptPayId(data.settings?.promptpay_id)) setQrPreviewId(data.settings.promptpay_id)
      })
      .catch((error) => { if (!axios.isCancel(error)) setMessage({ error: true, text: error.response?.data?.message || 'โหลดข้อมูลรับโอนไม่สำเร็จ' }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const change = (event) => {
    const { name, value } = event.target
    setDraft({ ...draft, [name]: name === 'promptpay_id' ? normalizePromptPayId(value).slice(0, 13) : value })
    setMessage(null)
    if (name === 'promptpay_id') setQrError('')
  }
  const generateQr = () => {
    if (!isValidPromptPayId(draft?.promptpay_id)) {
      setQrPreviewId('')
      setQrError('หมายเลข PromptPay ต้องเป็นเบอร์มือถือ 10 หลัก (ขึ้นต้นด้วย 0) หรือเลขบัตรประชาชน 13 หลัก')
      return
    }
    setQrError('')
    setQrPreviewId(draft.promptpay_id)
  }
  const save = (event) => {
    event.preventDefault()
    if (!draft || saving) return
    if (draft.promptpay_id && !isValidPromptPayId(draft.promptpay_id)) {
      setQrError('หมายเลข PromptPay ไม่ถูกต้อง')
      return
    }
    setMessage(null)
    setDialog('confirm')
  }
  const confirmSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const { data } = await axios.put('/api/owner/payment-settings', draft, { headers: headers() })
      const settings = { ...data.settings, test_mode: Boolean(data.testMode), verify_mode: data.verifyMode === 'manual' ? 'manual' : 'auto' }
      setSaved(settings)
      setDraft(settings)
      setQrPreviewId(isValidPromptPayId(data.settings?.promptpay_id) ? data.settings.promptpay_id : '')
      setSuccessText(data.message || 'บันทึกข้อมูลรับโอนเรียบร้อยแล้ว')
      setDialog('success')
    } catch (error) {
      setDialog(null)
      setMessage({ error: true, text: error.response?.data?.message || 'บันทึกข้อมูลรับโอนไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }
  const toggleTestMode = () => {
    setDraft({ ...draft, test_mode: !draft.test_mode })
    setMessage(null)
  }
  const changed = draft && Object.keys(EMPTY).some((field) => draft[field] !== saved?.[field])
  const qrMatchesDraft = qrPreviewId && qrPreviewId === draft?.promptpay_id
  const qrIsSaved = qrPreviewId && qrPreviewId === saved?.promptpay_id && !changed
  useEffect(() => {
    if (draft) onPreviewChange?.({ settings: draft, changed: Boolean(changed) })
  }, [draft, changed, onPreviewChange])
  return (
    <section className="owner-payment-settings dorm-settings-editor" aria-labelledby={`${id}-title`}>
      <div className="dorm-settings-head">
        <span className="dorm-settings-head-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20M6 15h4" />
          </svg>
        </span>
        <div className="dorm-settings-head-text">
          <h2 id={`${id}-title`}>ช่องทางรับโอน</h2>
          <p>ผู้เช่าจะเลือกจ่ายผ่าน PromptPay หรือโอนเข้าบัญชีได้ และต้องแนบสลิปทุกครั้ง</p>
        </div>
        {draft && (
          <span className={`dorm-settings-status ${changed ? 'is-draft' : 'is-saved'}`}>
            {changed ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกล่าสุดแล้ว'}
          </span>
        )}
      </div>
      {loading && <div className="dorm-settings-loading" role="status">กำลังโหลดข้อมูล...</div>}
      {message && (
        <p className={`dorm-settings-alert ${message.error ? 'is-error' : 'is-success'}`} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {!loading && draft && (
        <div className={`owner-pay-test${draft.test_mode ? ' is-on' : ''}`}>
          <div className="owner-pay-test-row">
            <div className="owner-pay-test-text">
              <strong>
                โหมดทดลองชำระเงิน
                {saved?.test_mode && <span className="owner-pay-test-badge">กำลังเปิดอยู่</span>}
                {draft.test_mode !== saved?.test_mode && (
                  <span className="owner-pay-test-badge is-draft">{draft.test_mode ? 'จะเปิดเมื่อกดบันทึก' : 'จะปิดเมื่อกดบันทึก'}</span>
                )}
              </strong>
              <small>ผู้เช่าจะเห็น QR และบัญชีตัวอย่างที่ใช้โอนจริงไม่ได้ แนบรูปใดก็ได้ และไม่ตรวจสลิปกับธนาคาร ถ้าเลือกตรวจอัตโนมัติจะเป็นชำระแล้วทันที ถ้าเลือกเจ้าหน้าที่ตรวจเองจะรอเจ้าหน้าที่อนุมัติ ใช้สำหรับทดสอบระบบเท่านั้น</small>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.test_mode}
              aria-label="โหมดทดลองชำระเงิน"
              className={`owner-switch${draft.test_mode ? ' is-on' : ''}`}
              onClick={toggleTestMode}
              disabled={saving}
            >
              <span className="owner-switch-thumb" />
            </button>
          </div>
          {draft.test_mode && (
            <div className="owner-pay-test-demo">
              <PromptPayQr promptPayId={DEMO_PAYMENT_CHANNELS.promptpay_id} size={120} className="owner-pp-qr" />
              <dl>
                <div>
                  <dt>PromptPay ทดลอง</dt>
                  <dd>{formatPromptPayId(DEMO_PAYMENT_CHANNELS.promptpay_id)}</dd>
                </div>
                <div>
                  <dt>ธนาคาร</dt>
                  <dd>{DEMO_PAYMENT_CHANNELS.bank_name}</dd>
                </div>
                <div>
                  <dt>เลขบัญชี</dt>
                  <dd>{DEMO_PAYMENT_CHANNELS.bank_account_no}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}
      {!loading && draft && (
        <form onSubmit={save} className={`dorm-settings-form${draft.test_mode ? ' owner-pay-muted' : ''}`}>
          <fieldset disabled={saving}>
            <div className="dorm-settings-group owner-verify-group">
              <div className="dorm-settings-group-head">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                  <path d="m9 10 2 2 4-4" />
                </svg>
                <span>วิธีตรวจสลิป</span>
              </div>
              <div className="owner-verify-options" role="radiogroup" aria-label="วิธีตรวจสลิป">
                {SLIP_VERIFY_OPTIONS.map((option) => (
                  <label key={option.key} className={`owner-verify-option${draft.verify_mode === option.key ? ' is-active' : ''}`}>
                    <input
                      type="radio"
                      name="verify_mode"
                      className="owner-verify-input"
                      value={option.key}
                      checked={draft.verify_mode === option.key}
                      onChange={change}
                    />
                    <span className="owner-verify-icon" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {option.key === 'auto' ? (
                          <>
                            <path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z" />
                            <path d="m9 12 2 2 4-4" />
                          </>
                        ) : (
                          <>
                            <circle cx="12" cy="8" r="4" />
                            <path d="M4 21a8 8 0 0 1 16 0" />
                          </>
                        )}
                      </svg>
                    </span>
                    <span className="owner-verify-body">
                      <strong className="owner-verify-title">{option.label}</strong>
                      <small className="owner-verify-hint">{option.hint}</small>
                    </span>
                    <span className="owner-verify-dot" aria-hidden="true" />
                  </label>
                ))}
              </div>
            </div>

            <div className="dorm-settings-group">
              <div className="dorm-settings-group-head">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3" />
                </svg>
                <span>PromptPay</span>
              </div>
              <div className="owner-pp-row">
                <div className="dorm-settings-field">
                  <label htmlFor={`${id}-promptpay`}>หมายเลข PromptPay</label>
                  <input id={`${id}-promptpay`} name="promptpay_id" type="text" inputMode="numeric" maxLength={13} value={draft.promptpay_id} onChange={change} disabled={draft.test_mode} placeholder="เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก" />
                  {qrError ? <small className="owner-pp-error">{qrError}</small> : <small className="dorm-settings-hint">ใส่เฉพาะตัวเลข แล้วกดสร้าง QR Code เพื่อตรวจสอบก่อนบันทึก</small>}
                </div>
                <button type="button" className="dorm-settings-btn is-ghost owner-pp-generate" onClick={generateQr} disabled={!draft.promptpay_id || draft.test_mode}>
                  สร้าง QR Code
                </button>
              </div>
              <div className={`owner-pp-preview${qrMatchesDraft ? '' : ' is-empty'}`}>
                {qrMatchesDraft ? (
                  <>
                    <PromptPayQr promptPayId={qrPreviewId} size={168} className="owner-pp-qr" />
                    <div className="owner-pp-preview-text">
                      <span className="owner-pp-badge">PromptPay</span>
                      <strong>{formatPromptPayId(qrPreviewId)}</strong>
                      <small>
                        {qrIsSaved
                          ? 'QR นี้กำลังใช้งานในหน้าชำระเงินของผู้เช่า (ใส่ยอดเงินให้อัตโนมัติ)'
                          : 'ตัวอย่าง QR — กดบันทึกข้อมูลรับโอนเพื่อให้ผู้เช่าใช้ QR นี้'}
                      </small>
                    </div>
                  </>
                ) : (
                  <span>ยังไม่ได้สร้าง QR Code สำหรับหมายเลขนี้</span>
                )}
              </div>
            </div>

            <div className="dorm-settings-group">
              <div className="dorm-settings-group-head">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 10 12 4l9 6" />
                  <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
                </svg>
                <span>บัญชีธนาคาร</span>
              </div>
              <div className="dorm-settings-row">
                <div className="dorm-settings-field">
                  <label htmlFor={`${id}-bank`}>ชื่อธนาคาร</label>
                  <input id={`${id}-bank`} name="bank_name" type="text" maxLength={100} value={draft.bank_name} onChange={change} disabled={draft.test_mode} placeholder="เช่น กสิกรไทย" />
                </div>
                <div className="dorm-settings-field">
                  <label htmlFor={`${id}-account`}>เลขบัญชี</label>
                  <input id={`${id}-account`} name="bank_account_no" type="text" inputMode="numeric" maxLength={50} value={draft.bank_account_no} onChange={change} disabled={draft.test_mode} placeholder="เช่น 123-4-56789-0" />
                </div>
              </div>
            </div>

            <div className={`dorm-settings-actions${changed ? ' is-dirty' : ''}`}>
              <span className="dorm-settings-actions-note">
                {saving ? 'กำลังบันทึกข้อมูล...' : changed ? 'แก้ไขแล้ว ยังไม่ได้บันทึก' : 'ไม่มีการเปลี่ยนแปลง'}
              </span>
              <button
                type="button"
                className="dorm-settings-btn is-ghost"
                disabled={!changed || saving}
                onClick={() => {
                  setDraft(saved)
                  setMessage(null)
                  setQrError('')
                  setQrPreviewId(isValidPromptPayId(saved?.promptpay_id) ? saved.promptpay_id : '')
                }}
              >
                ยกเลิกการแก้ไข
              </button>
              <button type="submit" className="dorm-settings-btn is-primary" disabled={!changed || saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลรับโอน'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <SettingsDialog
        open={dialog === 'confirm'}
        tone="primary"
        icon="bank"
        title="ยืนยันการบันทึกช่องทางรับโอน"
        message="ผู้เช่าจะใช้ข้อมูลชุดนี้ในหน้าชำระเงินทันทีหลังบันทึก"
        details={[
          ['PromptPay', draft?.promptpay_id ? formatPromptPayId(draft.promptpay_id) : 'ไม่ระบุ'],
          ['ธนาคาร', draft?.bank_name || 'ไม่ระบุ'],
          ['เลขบัญชี', draft?.bank_account_no || 'ไม่ระบุ'],
          ['วิธีตรวจสลิป', draft?.verify_mode === 'manual' ? 'เจ้าหน้าที่ตรวจเอง' : 'ตรวจอัตโนมัติ (RDCW)'],
          ['โหมดทดลอง', draft?.test_mode ? 'เปิด (ผู้เช่าเห็นบัญชีทดลอง)' : 'ปิด'],
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
        message={successText}
        confirmLabel="ตกลง"
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
        hideCancel
      />
    </section>
  )
}

const currency = (value) => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

const EXPENSE_CATEGORY_ICON_PATHS = {
  water: <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
  sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><path d="M2 9a15 15 0 0 1 20 0" /><circle cx="12" cy="19.5" r=".8" /></>,
  wallet: <><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5v14a2 2 0 0 0 2 2h15V7" /><path d="M16 14h.01" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6M9 11h6M9 15h3" /></>,
}
const EXPENSE_CATEGORY_STYLES = {
  'ค่าน้ำ': { icon: 'water', color: '#0891b2', bg: '#ecfeff' },
  'ค่าไฟ': { icon: 'bolt', color: '#d97706', bg: '#fffbeb' },
  'ซ่อมบำรุง': { icon: 'tool', color: '#ea580c', bg: '#fff7ed' },
  'ทำความสะอาด': { icon: 'sparkle', color: '#0d9488', bg: '#f0fdfa' },
  'วัสดุอุปกรณ์': { icon: 'box', color: '#7c3aed', bg: '#f5f3ff' },
  'อินเทอร์เน็ต': { icon: 'wifi', color: '#2563eb', bg: '#eff6ff' },
  'เงินเดือน': { icon: 'wallet', color: '#4f46e5', bg: '#eef2ff' },
}
const EXPENSE_CATEGORY_FALLBACKS = [
  { icon: 'receipt', color: '#db2777', bg: '#fdf2f8' },
  { icon: 'receipt', color: '#65a30d', bg: '#f7fee7' },
  { icon: 'receipt', color: '#0284c7', bg: '#f0f9ff' },
  { icon: 'receipt', color: '#64748b', bg: '#f8fafc' },
]
const EXPENSE_METHOD_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน', card: 'บัตร', other: 'อื่นๆ' }
const EXPENSE_LEDGER_PAGE_SIZE = 10

function expenseCategoryStyle(name) {
  if (EXPENSE_CATEGORY_STYLES[name]) return EXPENSE_CATEGORY_STYLES[name]
  const key = String(name || '')
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return EXPENSE_CATEGORY_FALLBACKS[hash % EXPENSE_CATEGORY_FALLBACKS.length]
}

function ExpenseCategoryIcon({ category, size = 18 }) {
  const style = expenseCategoryStyle(category)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {EXPENSE_CATEGORY_ICON_PATHS[style.icon]}
    </svg>
  )
}

function ExpenseCategoryBadge({ category }) {
  const style = expenseCategoryStyle(category)
  return (
    <span className="owner-xl-badge" style={{ '--xl-color': style.color, '--xl-bg': style.bg }}>
      <ExpenseCategoryIcon category={category} size={13} />
      {category || 'ไม่ระบุ'}
    </span>
  )
}

function OwnerExpenseDetailDialog({ expense, onClose, onEdit, onDelete }) {
  const [photoIndex, setPhotoIndex] = useState(null)
  const photos = Array.isArray(expense.photos) ? expense.photos : []
  const style = expenseCategoryStyle(expense.category)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = photoIndex === null ? onClose : () => {} }, [onClose, photoIndex])
  useEffect(() => {
    const previous = document.body.style.overflow
    const previousFocus = document.activeElement
    document.body.style.overflow = 'hidden'
    const escape = (event) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape); previousFocus?.focus?.() }
  }, [])
  const recordedAt = expense.created_at ? new Date(expense.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ไม่ระบุ'
  const fields = [
    { key: 'date', icon: 'calendar', label: 'วันที่จ่าย', value: formatDate(expense.expense_date) },
    { key: 'method', icon: 'receipt', label: 'ชำระโดย', value: EXPENSE_METHOD_LABELS[expense.payment_method] || 'ไม่ระบุ' },
    { key: 'vendor', icon: 'user', label: 'ร้านค้า / ผู้รับเงิน', value: expense.vendor || 'ไม่ระบุ' },
    { key: 'receipt', icon: 'hash', label: 'เลขที่ใบเสร็จ', value: expense.receipt_number || 'ไม่ระบุ' },
    { key: 'room', icon: 'door', label: 'ห้องที่เกี่ยวข้อง', value: expense.room_number ? `ห้อง ${expense.room_number}` : 'ไม่ระบุ' },
    { key: 'by', icon: 'user', label: 'บันทึกโดย', value: expense.recorded_by_name || 'เจ้าของหอพัก' },
    { key: 'at', icon: 'clock', label: 'บันทึกเมื่อ', value: recordedAt },
  ]
  return (
    <div className="owner-modal-backdrop owner-xl-overlay" onClick={onClose}>
      <section className="owner-modal owner-xl-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-xl-dialog-title" onClick={(event) => event.stopPropagation()}>
        <header className="owner-modal-header owner-xl-dialog-header">
          <span className="owner-xl-dialog-icon" style={{ color: style.color, background: style.bg }}><ExpenseCategoryIcon category={expense.category} size={22} /></span>
          <div><h3 id="owner-xl-dialog-title">รายละเอียดรายจ่าย</h3><p className="owner-modal-subtext">รายการ #{expense.id}</p></div>
          <button type="button" className="owner-modal-close" autoFocus onClick={onClose} aria-label="ปิดรายละเอียดรายจ่าย">×</button>
        </header>
        <div className="owner-modal-body owner-xl-dialog-body">
          <div className="owner-xl-hero" style={{ '--xl-color': style.color, '--xl-bg': style.bg }}>
            <div>
              <ExpenseCategoryBadge category={expense.category} />
              <p>{expense.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
            </div>
            <strong><small>จำนวนเงิน</small>฿{formatCurrency(expense.amount)}</strong>
          </div>
          <dl className="owner-xl-fields">
            {fields.map((field) => (
              <div key={field.key} className={field.value === 'ไม่ระบุ' ? 'is-empty' : ''}>
                <dt><OwnerListIcon name={field.icon} size={14} />{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
          <section className="owner-xl-photos">
            <h4><OwnerListIcon name="note" size={15} />หลักฐาน / ใบเสร็จ <span>{photos.length} รูป</span></h4>
            {photos.length ? (
              <div className="owner-xl-photo-grid">
                {photos.map((photo, index) => (
                  <button key={photo.url || index} type="button" className="owner-xl-photo" onClick={() => setPhotoIndex(index)} aria-label={`ดูรูปหลักฐานที่ ${index + 1}`}>
                    <img src={photo.url} alt={photo.name || `หลักฐานที่ ${index + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : <div className="owner-xl-photo-empty">ไม่มีรูปหลักฐานแนบไว้</div>}
          </section>
        </div>
        {(onEdit || onDelete) && (
          <footer className="owner-xl-dialog-actions">
            {onDelete && <button type="button" className="owner-xl-btn is-danger" onClick={() => onDelete(expense)}><ExpenseActionIcon name="trash" />ลบรายจ่าย</button>}
            {onEdit && <button type="button" className="owner-xl-btn is-primary" onClick={() => onEdit(expense)}><ExpenseActionIcon name="edit" />แก้ไขรายจ่าย</button>}
          </footer>
        )}
      </section>
      {photoIndex !== null && (
        <div onClick={(event) => event.stopPropagation()}>
          <PhotoLightbox photos={photos.map((photo, index) => ({ url: photo.url, name: photo.name || `หลักฐานที่ ${index + 1}` }))} initialIndex={photoIndex} title="หลักฐานรายจ่าย" subtitle={`${expense.category || 'ไม่ระบุ'} · ฿${formatCurrency(expense.amount)}`} label="หลักฐานรายจ่าย" onClose={() => setPhotoIndex(null)} />
        </div>
      )}
    </div>
  )
}

function ExpenseActionIcon({ name }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'edit' ? <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></> : <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>}
    </svg>
  )
}

function OwnerExpenseLedger({ range, version, onEdit, onDelete }) {
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const from = range?.from || ''
  const to = range?.to || ''

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    axios.get('/api/owner/expenses', {
      headers: getAuthHeaders(),
      signal: controller.signal,
      params: { page, pageSize: EXPENSE_LEDGER_PAGE_SIZE, from: from || undefined, to: to || undefined, category: category || undefined, search: query || undefined },
    })
      .then(({ data: next }) => { if (!controller.signal.aborted) { setData(next); setError('') } })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.response?.data?.message || 'โหลดรายการรายจ่ายไม่สำเร็จ') })
    return () => controller.abort()
  }, [page, from, to, category, query, version])

  const categories = useMemo(() => [...(data?.byCategory || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)), [data])
  const rows = data?.expenses || []
  const total = Number(data?.total) || 0
  const totalPages = Math.max(1, Math.ceil(total / (Number(data?.pageSize) || EXPENSE_LEDGER_PAGE_SIZE)))
  const currentPage = Math.min(page, totalPages)
  const filtered = Boolean(category || query)
  const chooseCategory = (next) => { setCategory(next); setPage(1) }

  return (
    <>
      <section className="owner-panel owner-xl-panel">
        <div className="owner-xl-list-head">
          <div>
            <h3>รายการรายจ่าย</h3>
            <p>{category ? <>หมวด <ExpenseCategoryBadge category={category} /></> : 'ทุกหมวดหมู่'} · พบ {total} รายการ · รวม ฿{formatCurrency(data?.totalAmount)}</p>
          </div>
          <div className="owner-xl-tools">
            <label className="owner-xl-category">
              <span className="visually-hidden">กรองตามหมวดหมู่</span>
              <select value={category} onChange={(event) => chooseCategory(event.target.value)}>
                <option value="">ทุกหมวดหมู่</option>
                {categories.map((item) => <option key={item.category || 'none'} value={item.category || ''}>{item.category || 'ไม่ระบุ'} ({Number(item.count) || 0})</option>)}
              </select>
            </label>
            <label className="owner-xl-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
              <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="ค้นหารายละเอียด ร้านค้า เลขใบเสร็จ ห้อง หรือผู้บันทึก" aria-label="ค้นหารายจ่าย" />
            </label>
            {filtered && <button type="button" className="owner-xl-clear" onClick={() => { setSearch(''); setQuery(''); chooseCategory('') }}>ล้างตัวกรอง</button>}          </div>
        </div>
        {error && <p className="owner-xl-error" role="alert">{error}</p>}
        <div className="owner-xl-table-wrap">
          <table className="owner-xl-table">
            <colgroup><col style={{ width: '13%' }} /><col style={{ width: '15%' }} /><col /><col style={{ width: '15%' }} /><col style={{ width: '8%' }} /><col style={{ width: '13%' }} /><col style={{ width: '96px' }} /></colgroup>
            <thead><tr><th>วันที่</th><th>หมวดหมู่</th><th>รายละเอียด</th><th>บันทึกโดย</th><th>หลักฐาน</th><th className="is-amount">จำนวนเงิน</th><th className="is-actions">จัดการ</th></tr></thead>
            <tbody>
              {rows.map((item) => {
                const photoCount = Array.isArray(item.photos) ? item.photos.length : 0
                const meta = [item.vendor, item.room_number ? `ห้อง ${item.room_number}` : '', item.receipt_number ? `ใบเสร็จ ${item.receipt_number}` : ''].filter(Boolean).join(' · ')
                return (
                  <tr key={item.id} className="owner-xl-row" tabIndex={0} onClick={() => setSelected(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(item) } }} aria-label={`ดูรายละเอียดรายจ่าย ${item.category || ''} ${formatCurrency(item.amount)} บาท`}>
                    <td><span className="owner-xl-date"><OwnerListIcon name="calendar" size={14} /><strong>{formatDate(item.expense_date)}</strong></span><small className="owner-xl-id">#{item.id}</small></td>
                    <td><ExpenseCategoryBadge category={item.category} /></td>
                    <td><span className="owner-xl-desc"><strong>{item.description || 'ไม่มีรายละเอียด'}</strong>{meta && <small>{meta}</small>}</span></td>
                    <td><span className="owner-xl-actor"><OwnerListIcon name="user" size={13} />{item.recorded_by_name || 'เจ้าของหอพัก'}</span></td>
                    <td><span className={`owner-xl-proof${photoCount ? '' : ' is-none'}`}>{photoCount ? `${photoCount} รูป` : 'ไม่มี'}</span></td>
                    <td className="is-amount"><strong className="owner-xl-amount">฿{formatCurrency(item.amount)}</strong><span className="owner-xl-more">ดูรายละเอียด ›</span></td>
                    <td className="is-actions">
                      <span className="owner-xl-row-actions">
                        <button type="button" className="owner-xl-icon-btn is-edit" title="แก้ไข" aria-label={`แก้ไขรายจ่าย #${item.id}`} onClick={(event) => { event.stopPropagation(); onEdit?.(item) }} onKeyDown={(event) => event.stopPropagation()}><ExpenseActionIcon name="edit" /></button>
                        <button type="button" className="owner-xl-icon-btn is-delete" title="ลบ" aria-label={`ลบรายจ่าย #${item.id}`} onClick={(event) => { event.stopPropagation(); onDelete?.(item) }} onKeyDown={(event) => event.stopPropagation()}><ExpenseActionIcon name="trash" /></button>
                      </span>
                    </td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr><td colSpan={7} className="owner-xl-empty">{!data ? 'กำลังโหลดรายการ...' : filtered ? 'ไม่พบรายจ่ายที่ตรงกับตัวกรอง' : 'ไม่มีรายการรายจ่ายในช่วงที่เลือก'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="owner-xl-footer">
          <span>แสดง {rows.length ? (currentPage - 1) * EXPENSE_LEDGER_PAGE_SIZE + 1 : 0}–{(currentPage - 1) * EXPENSE_LEDGER_PAGE_SIZE + rows.length} จาก {total} รายการ</span>
          <div className="owner-pa-pager">
            <button type="button" aria-label="หน้าก่อนหน้า" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</button>
            <span>{currentPage} / {totalPages}</span>
            <button type="button" aria-label="หน้าถัดไป" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>›</button>
          </div>
        </footer>
      </section>
      {selected && (
        <OwnerExpenseDetailDialog
          key={selected.id}
          expense={selected}
          onClose={() => setSelected(null)}
          onEdit={onEdit ? (item) => { setSelected(null); onEdit(item) } : undefined}
          onDelete={onDelete ? (item) => { setSelected(null); onDelete(item) } : undefined}
        />
      )}
    </>
  )
}

function OwnerOccupancyLogDialog({ eventId, onClose }) {
  const [response, setResponse] = useState(null)
  const [retry, setRetry] = useState(0)
  const [paymentId, setPaymentId] = useState(null)
  const [showAllPayments, setShowAllPayments] = useState(false)
  const [paymentSearch, setPaymentSearch] = useState('')
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = paymentId !== null ? () => {} : showAllPayments ? () => setShowAllPayments(false) : onClose }, [onClose, paymentId, showAllPayments])
  useEffect(() => {
    const controller = new AbortController()
    axios.get(`/api/owner/logs/occupancy/${eventId}`, { headers: getAuthHeaders(), signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResponse(data) })
      .catch((error) => { if (!controller.signal.aborted) setResponse({ error: error.response?.data?.message || 'โหลดรายละเอียดไม่สำเร็จ' }) })
    return () => controller.abort()
  }, [eventId, retry])
  useEffect(() => {
    const previous = document.body.style.overflow
    const previousFocus = document.activeElement
    document.body.style.overflow = 'hidden'
    const escape = (event) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape); previousFocus?.focus() }
  }, [])
  const detail = response?.detail
  const isIn = detail?.event_type === 'move_in'
  const time = (value) => value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ไม่ระบุ'
  const paymentKeyword = paymentSearch.trim().toLowerCase()
  const filteredPayments = (response?.payments || []).filter((payment) => !paymentKeyword || [
    formatPaymentType(payment.type), formatDate(payment.payment_date), `#${payment.id}`, String(payment.amount), currency(payment.amount),
    ROOM_PAYMENT_STATUS_LABELS[payment.status] || payment.status,
  ].some((value) => String(value || '').toLowerCase().includes(paymentKeyword)))
  const renderPayment = (payment) => (
    <article key={payment.id} className="owner-olog-payment">
      <span className="owner-olog-payment-icon" aria-hidden="true"><PaymentTypeIcon type={payment.type} /></span>
      <div className="owner-olog-payment-name"><strong>{formatPaymentType(payment.type)}</strong><small>{formatDate(payment.payment_date)} · #{payment.id}</small></div>
      <div className="owner-olog-payment-end">
        <div className="owner-olog-payment-value"><strong>฿{currency(payment.amount)}</strong><span className={`owner-olog-payment-status is-${getRoomPaymentTone(payment.status)}`}>{ROOM_PAYMENT_STATUS_LABELS[payment.status] || payment.status}</span></div>
        {payment.status === 'paid' && <button type="button" className="owner-ur-view owner-olog-slip-link" onClick={() => setPaymentId(payment.id)}><OwnerListIcon name="receipt" size={14} />รายละเอียด / สลิป <span aria-hidden="true">›</span></button>}
      </div>
    </article>
  )
  return (
    <div className="owner-modal-backdrop owner-olog-overlay" onClick={onClose}>
      <section className="owner-modal owner-olog-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-olog-title" onClick={(event) => event.stopPropagation()}>
        <header className="owner-modal-header"><span className="owner-ip-heading-icon"><OwnerListIcon name="receipt" size={20} /></span><div><h3 id="owner-olog-title">รายละเอียดบันทึกการเข้าพักและย้ายออก</h3><p className="owner-modal-subtext">เลขบันทึก {eventId}</p></div><button type="button" className="owner-modal-close" autoFocus onClick={onClose} aria-label="ปิดรายละเอียดบันทึก">×</button></header>
        <div className="owner-modal-body">
          {!response ? <div className="owner-empty" role="status">กำลังโหลดรายละเอียด...</div> : response.error ? <div className="owner-income-error" role="alert"><h4>โหลดข้อมูลไม่สำเร็จ</h4><p>{response.error}</p><button type="button" onClick={() => { setResponse(null); setRetry((value) => value + 1) }}>ลองอีกครั้ง</button></div> : (
            <>
              <div className={`owner-olog-hero ${isIn ? 'is-in' : 'is-out'}`}><span className="owner-olog-hero-icon"><OwnerListIcon name={isIn ? 'moveIn' : 'moveOut'} size={24} /></span><div><small>{isIn ? 'บันทึกการเข้าพัก' : 'บันทึกการย้ายออก'}</small><h4>{`${detail.first_name || ''} ${detail.last_name || ''}`.trim() || 'ไม่ระบุชื่อ'}</h4><p>ห้อง {detail.room_number} · {time(detail.event_date)}</p></div><span className="owner-olog-event">{isIn ? 'เข้าพัก' : 'ย้ายออกแล้ว'}</span></div>
              <div className="owner-olog-columns">
                <section className="owner-olog-section"><h4><OwnerListIcon name="user" />ข้อมูลผู้เข้าพักและการเช่า</h4><dl>
                  {[
                    ['ชื่อผู้เข้าพัก', `${detail.first_name || ''} ${detail.last_name || ''}`.trim(), 'user'], ['เบอร์โทร', detail.phone || 'ไม่ระบุ', 'phone'],
                    ['เลขห้องในบันทึก', detail.room_number, 'door'], ['เลขการจอง', detail.booking_id ? `#${detail.booking_id}` : 'ไม่พบบัญชีการจองที่เชื่อมโยง', 'hash'],
                    ['เริ่มสัญญา', detail.rental_start_date ? formatDate(detail.rental_start_date) : 'ไม่มีข้อมูลในประวัติ', 'calendar'], ['สิ้นสุดสัญญา', detail.rental_end_date ? formatDate(detail.rental_end_date) : 'ไม่มีข้อมูลในประวัติ', 'calendar'],
                  ].map(([label, value, icon]) => <div key={label}><dt><OwnerListIcon name={icon} size={14} />{label}</dt><dd>{value || '—'}</dd></div>)}
                </dl></section>
                <section className="owner-olog-section owner-olog-process"><h4><OwnerListIcon name="clock" />ขั้นตอนการดำเนินการ</h4>
                  <ProcessSteps
                    actorClassName="owner-olog-step-actor"
                    startDate={detail.requested_at}
                    endDate={isIn ? null : detail.completed_at}
                    pendingText="ไม่มีข้อมูลเวลาบันทึก"
                    waitingText={isIn ? 'บันทึกการเข้าพักเรียบร้อย' : 'ไม่มีข้อมูลเวลาสิ้นสุด'}
                    steps={isIn ? [
                      { key: 'booking', icon: 'note', label: 'บันทึกการเข้าพัก', date: detail.requested_at, by: `${detail.first_name || ''} ${detail.last_name || ''}`.trim() },
                    ] : [
                      { key: 'request', icon: 'note', label: 'ส่งคำขอย้ายออก', date: detail.requested_at, by: `${detail.first_name || ''} ${detail.last_name || ''}`.trim() },
                      { key: 'accepted', icon: 'user', label: 'เจ้าหน้าที่รับเรื่อง', date: detail.accepted_at, by: detail.accepted_by_name },
                      { key: 'completed', icon: 'check', label: 'อนุมัติคำขอ', date: detail.completed_at, by: detail.completed_by_name },
                    ]}
                  />
                  <div className="owner-il-note owner-ip-note"><OwnerListIcon name="note" size={16} /><div><strong>หมายเหตุ</strong><p>{detail.note || 'ไม่มีหมายเหตุในบันทึกนี้'}</p></div></div>
                </section>
              </div>
              <section className="owner-olog-section"><h4><OwnerListIcon name="receipt" />การชำระเงินของการจองนี้{response.payments.length > 5 && <button type="button" className="owner-olog-view-all" onClick={() => { setPaymentSearch(''); setShowAllPayments(true) }}>กดดูทั้งหมด ({response.payments.length}) <span aria-hidden="true">›</span></button>}</h4>
                <div className="owner-olog-money">
                  {[
                    { key: 'paid', icon: 'check', label: 'รับชำระแล้ว', value: currency(response.paymentSummary.paid), unit: 'บาท' },
                    { key: 'pending', icon: 'clock', label: 'ยังไม่ชำระ / รอตรวจ', value: currency(response.paymentSummary.pending), unit: 'บาท' },
                    { key: 'total', icon: 'receipt', label: 'รายการทั้งหมด', value: response.paymentSummary.total, unit: 'รายการ' },
                  ].map((item) => <div key={item.key} className={`owner-olog-money-card is-${item.key}`}><span className="owner-olog-money-label"><OwnerListIcon name={item.icon} size={16} /><small>{item.label}</small></span><strong>{item.value} <em>{item.unit}</em></strong></div>)}
                </div>
                <div className="owner-olog-payment-list">{response.payments.slice(0, 5).map(renderPayment)}{!response.payments.length && <div className="owner-income-group-empty">ไม่มีประวัติการชำระเงินที่เชื่อมโยง</div>}</div>
                <p className="owner-olog-caption">แสดง 5 รายการล่าสุด กดดูทั้งหมดเพื่อดูรายการเพิ่มเติม · ข้อมูลสัญญาอ้างอิงการจองที่เชื่อมโยง ส่วนชื่อและเบอร์โทรอ้างอิงข้อมูลบัญชีล่าสุด</p>
              </section>
            </>
          )}
        </div>
        {showAllPayments && response?.payments && (
          <div className="owner-modal-backdrop owner-olog-all-overlay" onClick={() => setShowAllPayments(false)}>
            <section className="owner-modal owner-olog-all-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-olog-all-title" onClick={(event) => event.stopPropagation()}>
              <header className="owner-modal-header"><span className="owner-ip-heading-icon"><OwnerListIcon name="receipt" size={20} /></span><div><h3 id="owner-olog-all-title">การชำระเงินทั้งหมดของการจองนี้</h3><p className="owner-modal-subtext">ทั้งหมด {response.payments.length} รายการ</p></div><button type="button" className="owner-modal-close" autoFocus onClick={() => setShowAllPayments(false)} aria-label="ปิดรายการการชำระเงินทั้งหมด">×</button></header>
              <div className="owner-modal-body">
                <label className="owner-fp-search owner-olog-all-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg><input type="search" value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} aria-label="ค้นหารายการชำระเงิน" placeholder="ค้นหาประเภท วันที่ เลขรายการ ยอดเงิน หรือสถานะ" /></label>
                <div className="owner-olog-payment-list">{filteredPayments.map(renderPayment)}{!filteredPayments.length && <div className="owner-income-group-empty">ไม่พบรายการที่ตรงกับคำค้นหา</div>}</div>
              </div>
            </section>
          </div>
        )}
        {paymentId !== null && <OwnerIncomePaymentDialog key={paymentId} id={paymentId} onClose={() => setPaymentId(null)} />}
      </section>
    </div>
  )
}

function OwnerFinancePeriodDialog({ period, range, onClose }) {
  const [tab, setTab] = useState('income')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  useEffect(() => {
    const keyword = search.trim()
    if (keyword === appliedSearch) return
    const timer = setTimeout(() => { setAppliedSearch(keyword); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [search, appliedSearch])
  const [response, setResponse] = useState(null)
  const [retry, setRetry] = useState(0)
  const [paymentId, setPaymentId] = useState(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = paymentId === null ? onClose : () => {} }, [onClose, paymentId])
  const month = period.period.length === 7
  const start = month ? `${period.period}-01` : period.period
  const endDate = month ? new Date(Number(period.period.slice(0, 4)), Number(period.period.slice(5, 7)), 0) : null
  const end = month ? `${period.period}-${String(endDate.getDate()).padStart(2, '0')}` : period.period
  const from = range.from && range.from > start ? range.from : start
  const to = range.to && range.to < end ? range.to : end
  const requestKey = JSON.stringify({ tab, page, search: appliedSearch, from, to, retry })
  useEffect(() => {
    const controller = new AbortController()
    const { tab: kind, retry: ignored, ...params } = JSON.parse(requestKey)
    void ignored
    axios.get(kind === 'income' ? '/api/owner/income/items' : '/api/owner/expenses', { headers: getAuthHeaders(), params, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResponse({ key: requestKey, data }) })
      .catch((error) => { if (!controller.signal.aborted) setResponse({ key: requestKey, error: error.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ' }) })
    return () => controller.abort()
  }, [requestKey])
  useEffect(() => {
    const previous = document.body.style.overflow
    const focus = document.activeElement
    document.body.style.overflow = 'hidden'
    const escape = (event) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape); focus?.focus() }
  }, [])
  const current = response?.key === requestKey ? response : null
  const data = current?.data
  const items = tab === 'income' ? data?.items || [] : data?.expenses || []
  const pages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 30)))
  const net = Number(period.income || 0) - Number(period.expense || 0)
  return (
    <div className="owner-modal-backdrop owner-finance-period-overlay" onClick={onClose}>
      <section className="owner-modal owner-finance-period-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-finance-period-title" onClick={(event) => event.stopPropagation()}>
        <header className="owner-modal-header"><div><h3 id="owner-finance-period-title">รายละเอียดการเงิน · {period.monthLabel}</h3><p className="owner-modal-subtext">{formatDate(from)} – {formatDate(to)}</p></div><button type="button" className="owner-modal-close" aria-label="ปิดรายละเอียดช่วงเวลา" onClick={onClose} autoFocus>×</button></header>
        <div className="owner-finance-period-summary">
          {[
            { key: 'income', icon: 'income', label: 'รายรับรวม', amount: period.income, caption: `${period.incomeCount || 0} รายการที่ชำระแล้ว` },
            { key: 'expense', icon: 'expense', label: 'รายจ่ายรวม', amount: period.expense, caption: `${period.expenseCount || 0} รายการค่าใช้จ่าย` },
            { key: net < 0 ? 'loss' : 'net', icon: 'profit', label: net < 0 ? 'ขาดทุนสุทธิ' : 'กำไรสุทธิ', amount: Math.abs(net), caption: 'รายรับรวมหักรายจ่ายรวม' },
          ].map((item) => (
            <div key={item.key} className={`owner-fp-stat is-${item.key}`}>
              <div className="owner-fp-stat-heading"><StatIcon name={item.icon} /><small>{item.label}</small></div>
              <strong>{currency(item.amount)} <em>บาท</em></strong>
              <span className="owner-fp-stat-caption">{item.caption}</span>
            </div>
          ))}
        </div>
        <div className="owner-finance-period-tools">
          <div className="nav staff-subtabs">{[{ key: 'income', label: 'รายการรายรับ' }, { key: 'expense', label: 'รายการรายจ่าย' }].map((item) => <button key={item.key} type="button" className={`nav-link staff-subtab-link${tab === item.key ? ' active' : ''}`} aria-pressed={tab === item.key} onClick={() => { setTab(item.key); setPage(1) }}>{item.label}</button>)}</div>
          <form onSubmit={(event) => event.preventDefault()} role="search">
            <label className="owner-fp-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="ค้นหารายการในช่วงเวลา" placeholder={tab === 'income' ? 'ค้นหาห้อง ผู้ชำระ หรือหมายเหตุ' : 'ค้นหาหมวดหมู่ หรือรายละเอียด'} /></label>
          </form>
        </div>
        <div className={`owner-income-dialog-body owner-fp-body${data && !items.length ? ' is-empty' : ''}`}>
          {!current ? <div className="owner-empty" role="status">กำลังโหลดรายการ...</div> : current.error ? <div className="owner-income-error" role="alert"><p>{current.error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>ลองอีกครั้ง</button></div> : (
            <><table className="owner-finance-period-table">
              <colgroup><col className="is-date" /><col className="is-type" /><col className="is-person" /><col /><col className="is-amount" /></colgroup>
              <thead><tr><th scope="col">วันที่ / เลขรายการ</th><th scope="col">ประเภท / หมวดหมู่</th><th scope="col">{tab === 'income' ? 'ห้อง / ผู้ชำระ' : 'บันทึกโดย'}</th><th scope="col">รายละเอียด</th><th scope="col">จำนวนเงิน (บาท)</th></tr></thead><tbody>
              {items.map((item) => (
                <tr key={item.id} className={tab === 'income' ? 'owner-fp-income-row' : ''} onClick={tab === 'income' ? () => setPaymentId(item.id) : undefined}>
                  <td><span className="owner-il-date"><OwnerListIcon name="calendar" /><strong>{formatDate(tab === 'income' ? item.payment_date : item.expense_date)}</strong></span><span className="owner-il-id">รายการ #{item.id}</span></td>
                  <td><span className="owner-il-type" style={{ '--type-tone': tab === 'income' ? getPaymentTypeColor(item.type) : '#d97706' }}>{tab === 'income' ? <PaymentTypeIcon type={item.type} /> : <StatIcon name="expense" />}{tab === 'income' ? formatPaymentType(item.type) : item.category || 'ไม่ระบุ'}</span></td>
                  <td>{tab === 'income' ? <div className="owner-il-person"><span className="owner-il-room">{item.room_number || '—'}</span><div><strong>{`${item.first_name || ''} ${item.last_name || ''}`.trim() || 'ไม่ระบุชื่อผู้ชำระ'}</strong><span>ห้อง {item.room_number || '—'}</span></div></div> : <span className="owner-fp-recorder"><OwnerListIcon name="user" /><strong>{item.recorded_by_name || 'ไม่ระบุผู้บันทึก'}</strong></span>}</td>
                  <td><span className={`owner-il-note${(tab === 'income' ? item.note : item.description) ? '' : ' is-empty'}`}>{(tab === 'income' ? item.note : item.description) || 'ไม่มีรายละเอียดเพิ่มเติม'}</span></td>
                  <td><strong className={`owner-il-amount${tab === 'expense' ? ' owner-fp-expense-amount' : ''}`}>฿{currency(item.amount)}</strong>{tab === 'income' && <button type="button" className="owner-ur-view owner-fp-payment-link" onClick={(event) => { event.stopPropagation(); setPaymentId(item.id) }}><OwnerListIcon name="receipt" size={13} />รายละเอียด / สลิป <span aria-hidden="true">›</span></button>}</td>
                </tr>
              ))}
            </tbody></table>
            {!items.length && <div className="owner-fp-empty" role="status"><span className="owner-fp-empty-icon" aria-hidden="true"><OwnerListIcon name="receipt" size={26} /></span><strong>{appliedSearch ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'ไม่พบรายการในช่วงเวลานี้'}</strong><p>{appliedSearch ? 'ลองเปลี่ยนคำค้นหา หรือดูรายการทั้งหมดของช่วงนี้' : 'ยังไม่มีรายการในหมวดและช่วงวันที่ที่เลือก'}</p>{appliedSearch && <button type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setPage(1) }}>ล้างคำค้นหา</button>}</div>}</>
          )}
        </div>
        <footer className="owner-income-dialog-footer"><span>พบ {data?.total || 0} รายการ</span><div className="owner-pa-pager"><button type="button" aria-label="หน้าก่อนหน้า" disabled={!data || page <= 1} onClick={() => setPage(page - 1)}>‹</button><span>{page} / {pages}</span><button type="button" aria-label="หน้าถัดไป" disabled={!data || page >= pages} onClick={() => setPage(page + 1)}>›</button></div></footer>
        {paymentId !== null && <OwnerIncomePaymentDialog key={paymentId} id={paymentId} onClose={() => setPaymentId(null)} />}
      </section>
    </div>
  )
}

function OwnerIncomePaymentDialog({ id, onClose }) {
  const [response, setResponse] = useState(null)
  const [retry, setRetry] = useState(0)
  const [zoom, setZoom] = useState(false)
  const dialogRef = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    axios.get(`/api/owner/income/items/${id}`, { headers: getAuthHeaders(), signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResponse({ payment: data.payment }) })
      .catch((error) => { if (!controller.signal.aborted) setResponse({ error: error.response?.data?.message || 'โหลดรายละเอียดไม่สำเร็จ' }) })
    return () => controller.abort()
  }, [id, retry])
  useEffect(() => {
    const previousFocus = document.activeElement
    const onKey = (event) => {
      if (zoom) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose() }
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll('button:not(:disabled), [href], [tabindex="0"]')
        if (!controls?.length) return
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true); previousFocus?.focus() }
  }, [onClose, zoom])
  const payment = response?.payment
  return (
    <div className="owner-modal-backdrop owner-income-payment-overlay" onClick={onClose}>
      <section ref={dialogRef} className="owner-modal owner-income-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-income-payment-title" onClick={(event) => event.stopPropagation()}>
        <header className="owner-modal-header owner-ip-header"><span className="owner-ip-heading-icon" aria-hidden="true"><OwnerListIcon name="receipt" size={20} /></span><div><h3 id="owner-income-payment-title">รายละเอียดการชำระเงิน</h3><p className="owner-modal-subtext">รายการ #{id}</p></div><button type="button" className="owner-modal-close" aria-label="ปิดรายละเอียดการชำระเงิน" autoFocus onClick={onClose}>×</button></header>
        <div className="owner-modal-body">
          {!response ? <div className="owner-empty" role="status">กำลังโหลดรายละเอียด...</div> : response.error ? <div className="owner-income-error" role="alert"><h4>โหลดรายละเอียดไม่สำเร็จ</h4><p>{response.error}</p><button type="button" onClick={() => { setResponse(null); setRetry((value) => value + 1) }}>ลองอีกครั้ง</button></div> : (
            <>
              <div className="owner-income-payment-hero"><span className="owner-ip-amount-icon" aria-hidden="true"><StatIcon name="income" /></span><div className="owner-ip-amount"><span>ยอดรับชำระทั้งหมด</span><strong>฿{currency(payment.amount)}</strong></div><span className="owner-ip-paid"><OwnerListIcon name="check" size={14} />ชำระแล้ว</span></div>
              <h4 className="owner-ip-section-title"><OwnerListIcon name="receipt" />ข้อมูลการชำระเงิน</h4>
              <dl className="owner-income-payment-fields">
                {[
                  ['ผู้ชำระ', `${payment.first_name || ''} ${payment.last_name || ''}`.trim() || 'ไม่ระบุชื่อ', 'user'], ['ห้องพัก', payment.room_number ? `ห้อง ${payment.room_number}` : '—', 'door'],
                  ['ประเภทการชำระ', formatPaymentType(payment.type), 'receipt'], ['เลขรายการ', `#${payment.id}`, 'hash'],
                  ['วันที่ชำระ', formatDate(payment.payment_date), 'calendar'], ['วันที่บันทึก', payment.created_at ? new Date(payment.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—', 'clock'],
                ].map(([label, value, icon]) => <div key={label}><dt><OwnerListIcon name={icon} size={15} /><span>{label}</span></dt><dd>{value}</dd></div>)}
              </dl>
              <div className="owner-il-note owner-ip-note"><OwnerListIcon name="note" size={18} /><div><strong>หมายเหตุ</strong><p>{payment.note || 'ไม่มีหมายเหตุ'}</p></div></div>
              <section className="owner-income-payment-slip"><h4 className="owner-ip-section-title"><OwnerListIcon name="receipt" />หลักฐานการชำระเงิน<span className="owner-ip-slip-count">{payment.slip_path ? '1 ไฟล์' : 'ไม่มีไฟล์'}</span></h4>{payment.slip_path ? <><button type="button" className="owner-income-slip-preview" onClick={() => setZoom(true)} aria-label="ดูสลิปขนาดเต็ม"><UploadImage src={payment.slip_path} alt={`สลิปชำระเงินรายการ ${payment.id}`} /></button><p>กดรูปเพื่อขยายสลิป</p></> : <div className="owner-income-group-empty owner-ip-no-slip"><OwnerListIcon name="receipt" size={24} /><span>รายการนี้ไม่มีสลิปแนบ</span><small>ตรวจสอบข้อมูลการรับชำระได้จากรายละเอียดด้านบน</small></div>}</section>
            </>
          )}
        </div>
      </section>
      {zoom && payment?.slip_path && <div className="owner-income-slip-lightbox" onClick={(event) => event.stopPropagation()}><PhotoLightbox photos={[{ url: payment.slip_path, name: `สลิปรายการ ${payment.id}` }]} title="หลักฐานการชำระเงิน" onClose={() => setZoom(false)} /></div>}
    </div>
  )
}

function OwnerIncomeItemsDialog({ initialType, types, range, onClose }) {
  const [filters, setFilters] = useState({ type: initialType, from: range.from || '', to: range.to || '', search: '', page: 1 })
  const [search, setSearch] = useState('')
  useEffect(() => {
    const keyword = search.trim()
    if (keyword === filters.search) return
    const timer = setTimeout(() => setFilters((previous) => ({ ...previous, search: keyword, page: 1 })), 300)
    return () => clearTimeout(timer)
  }, [search, filters.search])
  const [retry, setRetry] = useState(0)
  const [response, setResponse] = useState(null)
  const [paymentId, setPaymentId] = useState(null)
  const requestKey = JSON.stringify({ ...filters, month: range.month, year: range.year, retry })
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = paymentId === null ? onClose : () => {} }, [onClose, paymentId])
  useEffect(() => {
    const previous = document.body.style.overflow
    const previousFocus = document.activeElement
    document.body.style.overflow = 'hidden'
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey); previousFocus?.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const params = JSON.parse(requestKey)
    delete params.retry
    axios.get('/api/owner/income/items', { headers: getAuthHeaders(), params, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResponse({ key: requestKey, data }) })
      .catch((error) => { if (!controller.signal.aborted) setResponse({ key: requestKey, error: error.response?.data?.message || 'โหลดรายการไม่สำเร็จ' }) })
    return () => controller.abort()
  }, [requestKey])
  const current = response?.key === requestKey ? response : null
  const data = current?.data
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 30))
  const change = (field, value) => setFilters((previous) => ({ ...previous, [field]: value, page: 1 }))
  return (
    <div className="owner-modal-backdrop owner-income-dialog-overlay" onClick={onClose}>
      <section className="owner-modal owner-income-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-income-items-title" onClick={(event) => event.stopPropagation()}>
        <header className="owner-modal-header"><div><h3 id="owner-income-items-title">รายการรายรับทั้งหมด</h3><p className="owner-modal-subtext">เฉพาะรายการที่ชำระแล้ว · {data?.total || 0} รายการ</p></div><button type="button" className="owner-modal-close" autoFocus onClick={onClose} aria-label="ปิดรายการรายรับ">×</button></header>
        <form className="owner-income-dialog-filters" role="search" onSubmit={(event) => event.preventDefault()}>
          <label>ประเภทรายรับ<select value={filters.type} onChange={(event) => change('type', event.target.value)}><option value="all">ทุกประเภท</option>{types.map((item) => <option key={item.type} value={item.type}>{formatPaymentType(item.type)}</option>)}</select></label>
          <label>ตั้งแต่<ThaiDatePicker value={filters.from} onChange={(value) => change('from', value)} maxDate={parseInputDate(filters.to)} isClearable /></label>
          <label>ถึง<ThaiDatePicker value={filters.to} onChange={(value) => change('to', value)} minDate={parseInputDate(filters.from)} isClearable /></label>
          <label className="owner-income-dialog-search">ค้นหารายการ<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="เลขห้อง ชื่อผู้เช่า หมายเหตุ หรือเลขรายการ" /></label>
        </form>
        <div className="owner-income-dialog-total">
          <span className="owner-income-total-icon" aria-hidden="true"><StatIcon name="income" /></span>
          <div className="owner-income-total-text"><span>ยอดรับชำระตามตัวกรอง</span><small>{data ? `${data.total.toLocaleString('th-TH')} รายการที่ชำระแล้ว` : current?.error ? 'ไม่สามารถโหลดข้อมูลได้' : 'กำลังคำนวณยอดรวม...'}</small></div>
          <div className="owner-income-total-value"><strong>{data ? currency(data.amount) : '—'}</strong><span>บาท</span></div>
        </div>
        <div className="owner-income-dialog-body" aria-busy={!current}>
          {!current ? <div className="owner-empty" role="status">กำลังโหลดรายการ...</div> : current.error ? (
            <div className="owner-income-error" role="alert">
              <span className="owner-income-error-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></svg>
              </span>
              <h4>โหลดรายการไม่สำเร็จ</h4>
              <p>{current.error}</p>
              <button type="button" onClick={() => setRetry((value) => value + 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></svg>
                ลองโหลดอีกครั้ง
              </button>
            </div>
          ) : (
            <table className="owner-income-ledger">
              <colgroup><col className="is-date" /><col className="is-type" /><col className="is-person" /><col /><col className="is-amount" /></colgroup>
              <thead><tr>
                <th scope="col"><span className="owner-il-heading"><OwnerListIcon name="calendar" />วันที่รับชำระ</span></th>
                <th scope="col"><span className="owner-il-heading"><StatIcon name="income" />ประเภทรายรับ</span></th>
                <th scope="col"><span className="owner-il-heading"><OwnerListIcon name="user" />ห้อง / ผู้ชำระ</span></th>
                <th scope="col"><span className="owner-il-heading">หมายเหตุ</span></th>
                <th scope="col"><span className="owner-il-heading is-amount">ยอดรับชำระ <small>(บาท)</small></span></th>
              </tr></thead><tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="owner-il-clickable" onClick={() => setPaymentId(item.id)}>
                  <td><button type="button" className="owner-il-open" onClick={(event) => { event.stopPropagation(); setPaymentId(item.id) }} aria-label={`ดูรายละเอียดการชำระเงินรายการ ${item.id}`}><span className="owner-il-date"><OwnerListIcon name="calendar" /><strong>{formatDate(item.payment_date)}</strong></span><span className="owner-il-id">รายการ #{item.id} · ดูรายละเอียด ›</span></button></td>
                  <td><span className="owner-il-type" style={{ '--type-tone': getPaymentTypeColor(item.type) }}><PaymentTypeIcon type={item.type} />{formatPaymentType(item.type)}</span></td>
                  <td><div className="owner-il-person"><span className="owner-il-room">{item.room_number || '—'}</span><div><strong>{`${item.first_name || ''} ${item.last_name || ''}`.trim() || 'ไม่ระบุชื่อผู้ชำระ'}</strong><span>ห้อง {item.room_number || '—'}</span></div></div></td>
                  <td><span className={`owner-il-note${item.note ? '' : ' is-empty'}`}>{item.note || 'ไม่มีหมายเหตุ'}</span></td>
                  <td><strong className="owner-il-amount">{currency(item.amount)}</strong><span className="owner-il-status"><i aria-hidden="true" />ชำระแล้ว</span></td>
                </tr>
              ))}
              {!data.items.length && <tr><td colSpan={5} className="owner-empty-row">ไม่พบรายการตามตัวกรอง</td></tr>}
            </tbody></table>
          )}
        </div>
        <footer className="owner-income-dialog-footer"><span>แสดงครั้งละ 30 รายการ</span><div className="owner-pa-pager"><button type="button" disabled={!data || filters.page <= 1} aria-label="หน้าก่อนหน้า" onClick={() => setFilters((value) => ({ ...value, page: value.page - 1 }))}>‹</button><span>{filters.page} / {pages}</span><button type="button" disabled={!data || filters.page >= pages} aria-label="หน้าถัดไป" onClick={() => setFilters((value) => ({ ...value, page: value.page + 1 }))}>›</button></div></footer>
        {paymentId !== null && <OwnerIncomePaymentDialog key={paymentId} id={paymentId} onClose={() => setPaymentId(null)} />}
      </section>
    </div>
  )
}

function OwnerIncomeTypeCards({ summary, range }) {
  const [openType, setOpenType] = useState(null)
  const [previewPaymentId, setPreviewPaymentId] = useState(null)
  const categories = [...(summary.byType || [])]
  for (const type of ['rent', 'deposit', 'water', 'electricity']) {
    if (!categories.some((item) => item.type === type)) categories.push({ type, total: 0, count: 0, previews: [] })
  }
  categories.sort((a, b) => Number(b.total) - Number(a.total))
  return (
    <section className="owner-income-groups">
      <header className="owner-income-groups-heading"><div><h3>รายรับตามประเภท</h3><p>รายการรับชำระล่าสุด แยกตามประเภท · ตามช่วงวันที่ที่เลือก</p></div><button type="button" className="owner-panel-header-link" onClick={() => setOpenType('all')}>ดูรายรับทั้งหมด ›</button></header>
      <div className="owner-income-groups-grid">
        {categories.map((category) => (
          <section className="owner-panel owner-income-group" key={category.type} style={{ '--income-tone': getPaymentTypeColor(category.type) }}>
            <header>
              <span className="owner-income-group-icon" aria-hidden="true"><PaymentTypeIcon type={category.type} /></span>
              <div className="owner-income-group-title"><h4>{formatPaymentType(category.type)}</h4><span className="owner-income-group-count">{category.count} รายการ</span></div>
              <div className="owner-income-group-total"><small>รับชำระรวม</small><strong>฿{currency(category.total)}</strong></div>
            </header>
            <div className="owner-income-group-subhead"><span>รายการล่าสุด</span><span>ยอดรับชำระ</span></div>
            <div className="owner-income-group-items">
              {(category.previews || []).map((item) => (
                <button key={item.id} type="button" className="owner-income-preview-row" aria-label={`ดูรายละเอียดการชำระเงินรายการ ${item.id}`} onClick={() => setPreviewPaymentId(item.id)}>
                  <span className="owner-income-room"><small>ห้อง</small>{item.room_number || '—'}</span>
                  <div className="owner-income-preview-person"><strong>{`${item.first_name || ''} ${item.last_name || ''}`.trim() || 'ไม่ระบุชื่อผู้ชำระ'}</strong><small>{formatDate(item.payment_date)} <span>· #{item.id}</span></small></div>
                  <div className="owner-income-preview-amount"><b>฿{currency(item.amount)}</b><small><i aria-hidden="true" />ชำระแล้ว</small></div>
                </button>
              ))}
              {!category.previews?.length && <p className="owner-income-group-empty">ยังไม่มีรายการแสดง</p>}
            </div>
            <footer><span>แสดง {category.previews?.length || 0} จาก {category.count} รายการ</span><button type="button" onClick={() => setOpenType(category.type)}>ดูทั้งหมด <span aria-hidden="true">›</span></button></footer>
          </section>
        ))}
        {!categories.length && <div className="owner-empty">ยังไม่มีรายรับในช่วงวันที่เลือก</div>}
      </div>
      {openType !== null && <OwnerIncomeItemsDialog initialType={openType} types={categories} range={range} onClose={() => setOpenType(null)} />}
      {previewPaymentId !== null && <OwnerIncomePaymentDialog key={previewPaymentId} id={previewPaymentId} onClose={() => setPreviewPaymentId(null)} />}
    </section>
  )
}

function OwnerUtilityTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  const period = String(label || '')
  const date = /^\d{4}-\d{2}(?:-\d{2})?$/.test(period) ? new Date(`${period.length === 7 ? period + '-01' : period}T00:00:00`) : null
  const title = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric', ...(period.length > 7 ? { day: 'numeric' } : {}) })
    : period
  return (
    <div className="owner-ur-tooltip">
      <div className="owner-ur-tooltip-title">{title}</div>
      <div className="owner-ur-tooltip-rows">
        {payload.map((item) => (
          <div key={item.dataKey} className="owner-ur-tooltip-row">
            <span className="owner-ur-tooltip-label"><i style={{ backgroundColor: item.color }} />{item.name}</span>
            <strong>{currency(item.value)} <small>{unit}</small></strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function useOwnerUtilityReceipts(enabled, from, to) {
  const key = `${from || ''}:${to || ''}`
  const [response, setResponse] = useState(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    axios.get('/api/owner/utility-receipts', {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      params: { from: from || undefined, to: to || undefined },
      signal: controller.signal,
    }).then(({ data }) => { if (!controller.signal.aborted) setResponse({ key, result: data, error: '' }) })
      .catch((requestError) => { if (!controller.signal.aborted) setResponse({ key, result: { trends: [], granularity: 'month' }, error: requestError.response?.data?.message || 'โหลดรายรับค่าน้ำค่าไฟไม่สำเร็จ' }) })
    return () => controller.abort()
  }, [enabled, from, to, key])
  const current = response?.key === key ? response : null
  return { result: current?.result || { trends: [], granularity: 'month' }, loading: !current, error: current?.error || '' }
}

function OwnerUtilityPeriodDialog({ period, onClose }) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (event) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape) }
  }, [])
  const water = Number(period.water || 0)
  const electricity = Number(period.electricity || 0)
  return (
    <div className="owner-modal-backdrop owner-ur-detail-overlay" onClick={onClose}>
      <section className="owner-modal owner-ur-detail" role="dialog" aria-modal="true" aria-labelledby="owner-ur-detail-title" onClick={(event) => event.stopPropagation()}>
        <header className="owner-modal-header">
          <div><h3 id="owner-ur-detail-title">รายละเอียดรายรับ · {period.label}</h3><p className="owner-modal-subtext">สรุปยอดที่รับชำระแล้วในช่วงเวลานี้</p></div>
          <button type="button" className="owner-modal-close" aria-label="ปิดรายละเอียด" autoFocus onClick={onClose}>×</button>
        </header>
        <div className="owner-modal-body">
          <div className="owner-ur-detail-total"><span>ยอดรับชำระรวม</span><strong>฿{currency(period.total)}</strong><small>ค่าน้ำและค่าไฟรวมกัน</small></div>
          <div className="owner-ur-detail-grid">
            {[
              { key: 'water', label: 'ค่าน้ำ', amount: water, units: period.waterUnits, icon: 'water' },
              { key: 'electricity', label: 'ค่าไฟ', amount: electricity, units: period.electricityUnits, icon: 'electricity' },
            ].map((item) => (
              <section key={item.key} className={'owner-ur-detail-item is-' + item.key}>
                <h4><StatIcon name={item.icon} />{item.label}</h4>
                <dl>
                  <div><dt>ยอดรับชำระ</dt><dd>฿{currency(item.amount)}</dd></div>
                  <div><dt>หน่วยที่รับชำระ</dt><dd>{currency(item.units)} <small>หน่วย</small></dd></div>
                  <div><dt>สัดส่วนรายรับ</dt><dd>{period.total > 0 ? (item.amount / period.total * 100).toFixed(1) : '0.0'}%</dd></div>
                </dl>
              </section>
            ))}
          </div>
          <p className="owner-ur-detail-note">ข้อมูลนี้เป็นยอดรวมของช่วงเวลา ไม่ใช่ยอดเรียกเก็บหรือยอดค้างชำระรายห้อง</p>
        </div>
      </section>
    </div>
  )
}

function OwnerUtilityReceipts({ from, to, result, loading, error }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedPeriod, setSelectedPeriod] = useState(null)

  const totals = result.trends.reduce((sum, row) => ({
    water: sum.water + Number(row.water || 0),
    electricity: sum.electricity + Number(row.electricity || 0),
    waterUnits: sum.waterUnits + Number(row.waterUnits || 0),
    electricityUnits: sum.electricityUnits + Number(row.electricityUnits || 0),
  }), { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 })
  const totalRevenue = totals.water + totals.electricity
  const waterShare = totalRevenue > 0 ? totals.water / totalRevenue * 100 : 0
  const periods = result.trends.map((row) => {
    const date = new Date(`${row.period.length === 7 ? row.period + '-01' : row.period}T00:00:00`)
    return { ...row, total: Number(row.water || 0) + Number(row.electricity || 0), label: Number.isNaN(date.getTime()) ? row.period : date.toLocaleDateString('th-TH', { month: 'short', year: 'numeric', ...(row.period.length > 7 ? { day: 'numeric' } : {}) }) }
  })
  const peak = periods.reduce((best, row) => !best || row.total > best.total ? row : best, null)
  const keyword = search.trim().toLowerCase()
  const matchedPeriods = periods.filter((row) => `${row.period} ${row.label}`.toLowerCase().includes(keyword)).sort((a, b) => b.period.localeCompare(a.period))
  const totalPages = Math.max(1, Math.ceil(matchedPeriods.length / 12))
  const currentPage = Math.min(page, totalPages)
  const visiblePeriods = matchedPeriods.slice((currentPage - 1) * 12, currentPage * 12)
  return (
    <section className="owner-panel owner-utility-receipts" aria-label="รายรับค่าน้ำค่าไฟ">
      <div className="owner-ur-header">
        <span className="owner-ur-heading-icon" aria-hidden="true"><StatIcon name="income" /></span>
        <div><h3>รายรับค่าน้ำและค่าไฟ</h3><p>สรุปยอดรับชำระจริงและหน่วยการใช้งานในช่วงที่เลือก</p></div>
        <span className="owner-ur-period">{result.range ? `${formatDate(result.range.from)} – ${formatDate(result.range.to)}` : from || to ? 'ตามช่วงวันที่เลือก' : 'ย้อนหลัง 6 เดือน'}</span>
      </div>
      {error && <p className="owner-utility-receipts-error" role="alert">{error}</p>}
      {loading ? <p role="status">กำลังโหลดข้อมูล...</p> : result.trends.length ? (
        <>
          <div className="owner-ur-insights">
            <div><small>รับชำระรวมทั้งหมด</small><strong>฿{currency(totalRevenue)}</strong><span>ค่าน้ำและค่าไฟรวมกัน</span></div>
            <div><small>รายรับเฉลี่ยต่อ{result.granularity === 'day' ? 'วัน' : 'เดือน'}</small><strong>฿{currency(totalRevenue / periods.length)}</strong><span>จาก {periods.length} ช่วงเวลาที่มีข้อมูล</span></div>
            <div><small>ช่วงที่รับชำระสูงสุด</small><strong>฿{currency(peak?.total)}</strong><span>{peak?.label}</span></div>
            <div className="owner-ur-share"><small>สัดส่วนรายรับ</small>
              <dl className="owner-ur-share-values">
                <div className="is-water"><dt><i aria-hidden="true" />ค่าน้ำ</dt><dd>{waterShare.toFixed(1)}<small>%</small></dd></div>
                <div className="is-electricity"><dt><i aria-hidden="true" />ค่าไฟ</dt><dd>{totalRevenue > 0 ? (100 - waterShare).toFixed(1) : '0.0'}<small>%</small></dd></div>
              </dl>
            </div>
          </div>
          <div className="owner-ur-charts">
            {[
              { title: 'รายรับที่ชำระแล้ว', caption: 'จำนวนเงิน · บาท', unit: 'บาท', series: [{ key: 'water', name: 'ค่าน้ำ', color: '#0891b2' }, { key: 'electricity', name: 'ค่าไฟ', color: '#d97706' }] },
              { title: 'หน่วยการใช้งานที่รับชำระ', caption: 'การใช้งาน · หน่วย', unit: 'หน่วย', series: [{ key: 'waterUnits', name: 'หน่วยน้ำ', color: '#0891b2' }, { key: 'electricityUnits', name: 'หน่วยไฟ', color: '#d97706' }] },
            ].map((chart) => (
              <section key={chart.title} className="owner-ur-chart-panel">
                <div className="owner-ur-chart-heading"><h4>{chart.title}</h4><span>{chart.caption}</span></div>
                <div className="owner-utility-receipts-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.trends} margin={{ top: 16, right: 12, left: 8, bottom: 0 }} barGap={8}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eff8" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#6b859e' }} tickLine={false} axisLine={{ stroke: '#dce6f3' }} />
                      <YAxis width={72} tick={{ fontSize: 11, fill: '#6b859e' }} tickLine={false} axisLine={false} tickFormatter={(value) => Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
                      <Tooltip cursor={{ fill: '#f1f6fd' }} content={<OwnerUtilityTooltip unit={chart.unit} />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                      {chart.series.map((series) => <Bar key={series.key} animationDuration={180} dataKey={series.key} name={series.name} fill={series.color} maxBarSize={48} radius={[6, 6, 0, 0]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            ))}
          </div>
          <section className="owner-ur-breakdown">
            <header><div><h4>รายละเอียดรายรับตามช่วงเวลา</h4><p>ยอดที่รับชำระแล้ว เรียงจากช่วงล่าสุด</p></div>
              <input type="search" aria-label="ค้นหาช่วงเวลารายรับ" placeholder="ค้นหาเดือน ปี หรือวันที่" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
            </header>
            <div className="owner-ur-table-scroll">
              <table><thead><tr><th>ช่วงเวลา</th><th>ค่าน้ำ</th><th>หน่วยน้ำ</th><th>ค่าไฟ</th><th>หน่วยไฟ</th><th>รับชำระรวม</th><th><span className="visually-hidden">รายละเอียด</span></th></tr></thead>
                <tbody>{visiblePeriods.map((row) => <tr key={row.period} className="owner-ur-period-row" onClick={() => setSelectedPeriod(row)}>
                  <td><span className="owner-ur-period-cell"><OwnerListIcon name="calendar" />{row.label}</span></td>
                  <td><span className="owner-ur-amount is-water">฿{currency(row.water)}</span></td>
                  <td><span className="owner-ur-units">{currency(row.waterUnits)} <small>หน่วย</small></span></td>
                  <td><span className="owner-ur-amount is-electricity">฿{currency(row.electricity)}</span></td>
                  <td><span className="owner-ur-units">{currency(row.electricityUnits)} <small>หน่วย</small></span></td>
                  <td><strong className="owner-ur-row-total">฿{currency(row.total)}</strong></td>
                  <td><button type="button" className="owner-ur-view" aria-label={`ดูรายละเอียด ${row.label}`} onClick={(event) => { event.stopPropagation(); setSelectedPeriod(row) }}>ดูรายละเอียด <span aria-hidden="true">›</span></button></td>
                </tr>)}
                  {!visiblePeriods.length && <tr><td colSpan={7} className="owner-ur-no-results">ไม่พบช่วงเวลาที่ตรงกับคำค้นหา</td></tr>}
                </tbody>
              </table>
            </div>
            <footer><span>พบ {matchedPeriods.length} ช่วงเวลา</span><div className="owner-pa-pager"><button type="button" aria-label="หน้าก่อนหน้า" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</button><span>{currentPage} / {totalPages}</span><button type="button" aria-label="หน้าถัดไป" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>›</button></div></footer>
          </section>
        </>
      ) : !error && <p className="owner-empty">ยังไม่มีรายการค่าน้ำหรือค่าไฟที่รับชำระในช่วงนี้</p>}
      {selectedPeriod && <OwnerUtilityPeriodDialog period={selectedPeriod} onClose={() => setSelectedPeriod(null)} />}
    </section>
  )
}

const ROOM_OCCUPANCY_COLORS = { occupied: '#2563eb', vacant: '#10b981' }

const ROOM_STATUS_LABELS = { vacant: 'ว่าง', occupied: 'มีผู้เช่า', overdue: 'ค้างชำระ', maintenance: 'ซ่อมบำรุง' }

const ROOM_STATUS_COLORS = { occupied: '#3b82f6', overdue: '#f97316', vacant: '#10b981', maintenance: '#e11d48' }

const ROOM_PAYMENT_STATUS_LABELS = { paid: 'ชำระแล้ว', pending: 'รอตรวจสอบ', rejected: 'ถูกปฏิเสธ', unpaid: 'ยังไม่ชำระ', overdue: 'เกินกำหนด' }

function getRoomPaymentTone(status) {
  if (status === 'paid') return 'paid'
  if (status === 'pending') return 'pending'
  if (status === 'rejected' || status === 'overdue') return 'danger'
  return 'other'
}

const ROOM_PAYMENTS_ALL_PAGE_SIZE = 30

const ROOM_MAP_PAGE_SIZE = 12

const ROOM_LIST_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', title: 'ห้องทั้งหมด' },
  { key: 'occupied', label: 'มีผู้เช่า', title: 'ห้องที่มีผู้เช่า' },
  { key: 'overdue', label: 'ค้างชำระ', title: 'ห้องค้างชำระ' },
  { key: 'vacant', label: 'ว่าง', title: 'ห้องว่าง' },
  { key: 'maintenance', label: 'ซ่อมบำรุง', title: 'ห้องที่กำลังซ่อม' },
]

function OwnerSlipDownloadButton({ url, fileName }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const download = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await downloadUploadFile(url, fileName)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={`payment-slip-download${failed ? ' is-failed' : ''}`} onClick={download} disabled={busy}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </svg>
      {busy ? 'กำลังบันทึก...' : failed ? 'บันทึกไม่สำเร็จ ลองอีกครั้ง' : 'บันทึกรูปสลิป'}
    </button>
  )
}

const STAT_ICON_PATHS = {
  rooms: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M3 9 12 3l9 6" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  income: (
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <path d="M6 11 12 5l6 6" />
    </>
  ),
  expense: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <path d="M6 13 12 19l6-6" />
    </>
  ),
  profit: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  margin: (
    <>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  overdue: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  maintenance: (
    <path d="M21 7.5a5.5 5.5 0 0 1-7.6 5.1L6 20l-3-3 7.4-7.4A5.5 5.5 0 1 1 21 7.5Z" />
  ),
  water: (
    <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />
  ),
  electricity: (
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  ),
}

const OWNER_TILE_TONES = { blue: 'blue', green: 'green', purple: 'violet', orange: 'orange', red: 'red' }

function StatIcon({ name }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {STAT_ICON_PATHS[name]}
    </svg>
  )
}

const OWNER_LIST_ICON_PATHS = {
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6M9 11h6M9 15h3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  hash: <><path d="M5 9h14M4 15h14M11 3 7 21M17 3l-4 18" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  door: <><path d="M4 21h16" /><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" /><path d="M14 12h.01" /></>,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 10" /></>,
  note: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  moveIn: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></>,
  moveOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  trendUp: <><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  trendDown: <><path d="m3 7 6 6 4-4 8 8" /><path d="M14 17h7v-7" /></>,
}

function OwnerListIcon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {OWNER_LIST_ICON_PATHS[name]}
    </svg>
  )
}

function compareNewest(field) {
  return (a, b) => {
    const timeA = a[field] ? new Date(a[field]).getTime() : -Infinity
    const timeB = b[field] ? new Date(b[field]).getTime() : -Infinity
    if (timeA !== timeB) return timeB - timeA
    return a.room_number - b.room_number
  }
}

function OwnerStatTile({ icon, label, value, hint, tone }) {
  return (
    <div className={`staff-summary-tile is-${OWNER_TILE_TONES[tone] || 'blue'}`}>
      <span className="staff-summary-tile-icon">
        <StatIcon name={icon} />
      </span>
      <span className="staff-summary-tile-text">
        <span className="staff-summary-tile-label">{label}</span>
        <strong className="staff-summary-tile-value">{value}</strong>
        {hint && <small className="staff-summary-tile-hint">{hint}</small>}
      </span>
    </div>
  )
}

const EMPTY_STAFF = {
  role: 'Staff',
  idcard: '',
  password: '',
  phone: '',
  first_name: '',
  last_name: '',
  age: '',
}

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(value) {
  if (!value) return '-'
  const dateValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  return new Date(dateValue).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatSignedCurrency(value) {
  const amount = Number(value) || 0
  return amount < 0 ? `-฿${formatCurrency(Math.abs(amount))}` : `฿${formatCurrency(amount)}`
}

function formatPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${num.toFixed(1)}%`
}

const PAYMENT_TYPE_LABELS = {
  rent: 'ค่าเช่า',
  room: 'ค่าห้อง',
  deposit: 'เงินมัดจำ',
  water: 'ค่าน้ำ',
  electricity: 'ค่าไฟ',
}

function formatPaymentType(type) {
  return PAYMENT_TYPE_LABELS[type] || type
}

const PAYMENT_TYPE_COLORS = {
  rent: '#2563eb',
  deposit: '#7c3aed',
  water: '#0891b2',
  electricity: '#d97706',
}

function getPaymentTypeColor(type) {
  return PAYMENT_TYPE_COLORS[type] || '#5d728b'
}

const PAYMENT_TYPE_ICON_PATHS = {
  rent: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  deposit: (
    <>
      <path d="M12 2v3" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  water: <path d="M12 2c3.5 4.5 7 8.6 7 12.5A7 7 0 1 1 5 14.5C5 10.6 8.5 6.5 12 2Z" />,
  electricity: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
}

function PaymentTypeIcon({ type }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PAYMENT_TYPE_ICON_PATHS[type] || <circle cx="12" cy="12" r="8" />}
    </svg>
  )
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

function formatTrendMonth(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey
  const [year, month] = monthKey.split('-').map(Number)
  const shortYear = String(year + 543).slice(-2)
  return `${THAI_MONTHS_SHORT[month - 1]} ${shortYear}`
}

function formatTrendDay(dayKey) {
  if (typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return dayKey
  const [, month, day] = dayKey.split('-').map(Number)
  return `${day} ${THAI_MONTHS_SHORT[month - 1]}`
}

const FINANCE_TREND_COLORS = { income: '#2563eb', expense: '#d97706', net: '#7c3aed' }
const FINANCE_TREND_SERIES = [
  { key: 'income', label: 'รายรับ', color: FINANCE_TREND_COLORS.income },
  { key: 'expense', label: 'รายจ่าย', color: FINANCE_TREND_COLORS.expense },
  { key: 'netProfit', label: 'กำไร/ขาดทุน', color: FINANCE_TREND_COLORS.net },
]

const OCCUPANCY_TREND_SERIES = [
  { key: 'occupied', label: 'มีผู้เช่า', color: ROOM_OCCUPANCY_COLORS.occupied },
  { key: 'vacant', label: 'ว่าง', color: ROOM_OCCUPANCY_COLORS.vacant },
]

const OCCUPANCY_MOVEMENT_SERIES = [
  { key: 'moveIns', label: 'ย้ายเข้า', color: '#0f9d58' },
  { key: 'moveOuts', label: 'ย้ายออก', color: '#d97706' },
]

function TrendTooltip({ active, payload, label, series, formatValue }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="owner-chart-tooltip owner-chart-tooltip-multi">
      <strong className="owner-chart-tooltip-title">{label}</strong>
      {payload.map((item) => (
        <div key={item.dataKey} className="owner-chart-tooltip-row">
          <span className="owner-chart-tooltip-dot" style={{ background: item.color }} />
          <span>{series.find((s) => s.key === item.dataKey)?.label || item.dataKey}</span>
          <strong>{formatValue(item.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function FinanceTrendTooltip(props) {
  return <TrendTooltip {...props} series={FINANCE_TREND_SERIES} formatValue={formatSignedCurrency} />
}

function OccupancyTrendTooltip(props) {
  return <TrendTooltip {...props} series={OCCUPANCY_TREND_SERIES} formatValue={(value) => `${value} ห้อง`} />
}

function OccupancyMovementTooltip(props) {
  return <TrendTooltip {...props} series={OCCUPANCY_MOVEMENT_SERIES} formatValue={(value) => `${value} คน`} />
}

const OWNER_ROOMS_SECTIONS = [
  { key: 'overview', label: 'ภาพรวมห้องพัก' },
  { key: 'occupancy', label: 'เปรียบเทียบจำนวนผู้เข้าพัก' },
  { key: 'logs', label: 'บันทึกการเข้าพักและย้ายออก' },
]

const OWNER_FINANCE_SECTIONS = [
  { key: 'overview', label: 'ภาพรวมการเงิน' },
  { key: 'expenses', label: 'รายการรายจ่ายทั้งหมด' },
  { key: 'payments', label: 'บันทึกการชำระเงิน' },
]

const OWNER_TABS = [
  { key: 'rooms', label: 'สรุปห้อง' },
  { key: 'finance', label: 'รายละเอียดการเงิน' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'parking', label: 'ที่จอดรถ' },
  { key: 'safety', label: 'แจ้งเหตุฉุกเฉิน' },
  { key: 'utilities', label: 'ค่าน้ำ-ค่าไฟ' },
  { key: 'audit', label: 'ประวัติ Audit' },
  { key: 'announcements', label: 'ประกาศจากหอพัก' },
  { key: 'dorm-info', label: 'กฎระเบียบและเบอร์ติดต่อ' },
]

const OWNER_PERIOD_BAR_CONTENT = {
  rooms: { title: 'สรุปข้อมูลห้องพัก', subtitle: 'ภาพรวมห้องพักและผู้เข้าพักประจำเดือน' },
  finance: { title: 'สรุปข้อมูลการเงิน', subtitle: 'ยอดรายรับ รายจ่าย และกำไรสุทธิของเดือนปัจจุบัน' },
  staff: { title: 'ข้อมูลพนักงาน', subtitle: 'รายชื่อและสถานะพนักงานทั้งหมด' },
  parking: { title: 'จัดการที่จอดรถ', subtitle: 'ติดตามคำขอและรายการรถของผู้เข้าพัก' },
  safety: { title: 'จัดการเหตุฉุกเฉิน', subtitle: 'ติดตามและตรวจสอบรายงานจากผู้เข้าพักและเจ้าหน้าที่' },
  audit: { title: 'ประวัติการใช้งานเว็บไซต์', subtitle: 'รายการเปลี่ยนแปลงข้อมูลที่ดำเนินการโดยผู้ใช้ทุกบทบาท' },
  announcements: { title: 'ประกาศจากหอพัก', subtitle: 'ข่าวสารและการแจ้งเตือนที่สื่อสารกับผู้เช่าและเจ้าหน้าที่' },
}

const AUDIT_RESOURCES = [
  ['move-out-inspections', 'ผลตรวจห้องย้ายออก'],
  ['resident-visit-requests', 'คำขอเข้าเยี่ยม/รถ'],
  ['payment-verifications', 'รายการชำระเงิน'],
  ['safety-incidents', 'รายงานเหตุ'],
  ['utility-bill', 'บิลค่าน้ำ-ค่าไฟ'],
  ['collect-payment', 'การชำระเงิน'],
  ['waiting-list', 'รายชื่อผู้รอห้อง'],
  ['announcements', 'ประกาศ'],
  ['maintenance', 'งานแจ้งซ่อม'],
  ['customers', 'ข้อมูลผู้เช่า'],
  ['requests', 'คำขอผู้เช่า'],
  ['expenses', 'รายการรายจ่าย'],
  ['parcels', 'รายการพัสดุ'],
  ['register', 'ผู้เช่า'],
  ['rooms', 'ห้องพัก'],
  ['staff', 'ข้อมูลพนักงาน'],
  ['profile', 'ข้อมูลส่วนตัว'],
]

function describeAuditActivity(log) {
  const segments = String(log.endpoint || '').split('?')[0].split('/').filter(Boolean)
  const method = String(log.method || '').toUpperCase()
  const resourceEntry = AUDIT_RESOURCES.find(([key]) => segments.includes(key))
  const resource = resourceEntry?.[1] || 'ข้อมูลในระบบ'
  const actionSegment = segments.find((segment) => ['approve', 'reject', 'review', 'acknowledge', 'cancel', 'suspend'].includes(segment))
  const resourceIndex = resourceEntry ? segments.indexOf(resourceEntry[0]) : -1
  const recordId = resourceIndex >= 0 ? segments.slice(resourceIndex + 1).find((segment) => /^\d+$/.test(segment)) : null
  const recordLabel = recordId
    ? resource === 'ห้องพัก' ? `ห้อง ${recordId}` : `${resource} #${recordId}`
    : resource === 'ผู้เช่า' && segments.includes('register') ? 'ผู้เช่ารายใหม่' : resource

  if (segments.includes('register') && method === 'POST') return { action: 'สมัครผู้เช่า', detail: 'ลงทะเบียนผู้เช่ารายใหม่' }
  if (actionSegment === 'approve') return { action: `อนุมัติ${resource}`, detail: recordLabel }
  if (actionSegment === 'reject') return { action: `ปฏิเสธ${resource}`, detail: recordLabel }
  if (actionSegment === 'review') return { action: `ตรวจสอบ${resource}`, detail: recordLabel }
  if (actionSegment === 'acknowledge') return { action: `รับทราบ${resource}`, detail: recordLabel }
  if (actionSegment === 'cancel') return { action: `ยกเลิก${resource}`, detail: recordLabel }
  if (actionSegment === 'suspend') return { action: `เปลี่ยนสถานะ${resource}`, detail: recordLabel }
  if (segments.includes('collect-payment')) return { action: 'รับชำระเงิน', detail: recordLabel }
  if (segments.includes('utility-bill')) return { action: 'บันทึกบิลค่าน้ำ-ค่าไฟ', detail: recordLabel }
  if (method === 'POST') return { action: `เพิ่ม${resource}`, detail: recordLabel }
  if (method === 'PUT' || method === 'PATCH') return { action: `แก้ไข${resource}`, detail: recordLabel }
  if (method === 'DELETE') return { action: `ลบ${resource}`, detail: recordLabel }
  return { action: 'อัปเดตข้อมูล', detail: recordLabel }
}

function OwnerAuditLog() {
  const [result, setResult] = useState({ logs: [], total: 0, page: 1, pageSize: 20 })
  const [page, setPage] = useState(1)
  const [role, setRole] = useState('all')
  const [method, setMethod] = useState('all')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const keyword = search.trim()
    if (keyword === appliedSearch) return
    const timer = setTimeout(() => { setLoading(true); setPage(1); setAppliedSearch(keyword) }, 300)
    return () => clearTimeout(timer)
  }, [search, appliedSearch])

  useEffect(() => {
    let cancelled = false
    axios.get('/api/owner/logs/audit', {
      headers: getAuthHeaders(),
      params: { page, role: role !== 'all' ? role : undefined, method: method !== 'all' ? method : undefined, search: appliedSearch || undefined },
    }).then(({ data }) => {
      if (!cancelled) {
        setResult(data)
        setError('')
      }
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.response?.data?.message || 'โหลดประวัติการใช้งานไม่สำเร็จ')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [page, role, method, appliedSearch])

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  return (
    <section className="owner-panel owner-audit-panel">
      <div className="owner-panel-header">
        <div><h3>ประวัติการใช้งานเว็บไซต์</h3><p>บันทึกการเปลี่ยนแปลงข้อมูลที่สำเร็จจากทุกบทบาท</p></div>
        <span className="owner-panel-header-count">{Number(result.total).toLocaleString('th-TH')} รายการ</span>
      </div>
      <form className="owner-audit-filters" role="search" onSubmit={(event) => event.preventDefault()}>
        <input className="owner-audit-search" type="search" placeholder="ค้นหาผู้ใช้หรือรายการ" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="กรองบทบาท" value={role} onChange={(event) => { setLoading(true); setRole(event.target.value); setPage(1) }}>
          <option value="all">ทุกบทบาท</option><option value="Customer">ลูกค้า</option><option value="Staff">พนักงาน</option><option value="Admin">แอดมิน</option><option value="Owner">เจ้าของ</option>
        </select>
        <select aria-label="กรองการกระทำ" value={method} onChange={(event) => { setLoading(true); setMethod(event.target.value); setPage(1) }}>
          <option value="all">ทุกการกระทำ</option><option value="POST">สร้าง</option><option value="PUT">แก้ไข</option><option value="PATCH">แก้ไข</option><option value="DELETE">ลบ</option>
        </select>
      </form>
      {error && <div className="owner-alert owner-alert-danger" role="alert">{error}</div>}
      <div className="owner-table-wrap owner-audit-table-wrap">
        <table className="owner-table owner-audit-table">
          <thead><tr><th>วัน-เวลา</th><th>ผู้ทำรายการ</th><th>กิจกรรม</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="3" className="owner-empty-row">กำลังโหลด...</td></tr> : result.logs.length ? result.logs.map((log) => {
              const activity = describeAuditActivity(log)
              return <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{log.actor_name || `${log.actor_role} #${log.actor_id}`}<small>{log.actor_role}</small></td>
                <td><strong>{activity.action}</strong><small>{activity.detail}</small></td>
              </tr>
            }) : <tr><td colSpan="3" className="owner-empty-row">ยังไม่มีประวัติการใช้งาน</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="owner-audit-pagination">
        <span>หน้า {page} / {totalPages} · ทั้งหมด {Number(result.total).toLocaleString('th-TH')} รายการ</span>
        <div className="owner-pagination">
          <button type="button" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage(page - 1) }}>ก่อนหน้า</button>
          <button type="button" disabled={loading || page >= totalPages} onClick={() => { setLoading(true); setPage(page + 1) }}>ถัดไป</button>
        </div>
      </div>
    </section>
  )
}

function getOwnerNotificationStorageKey() {
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    return `owner-notifications-seen-${user.id ?? user.idcard ?? user.username ?? 'current'}`
  } catch {
    return 'owner-notifications-seen-current'
  }
}

function buildOwnerAnnouncementNotification(item) {
  return {
    key: `announcement-${item.id}`,
    announcementId: item.id,
    title: item.title,
    tone: item.tone === 'warning' ? 'pending' : 'info',
    label: item.tone === 'warning' ? 'ประกาศแจ้งเตือนจากหอพัก' : 'ประกาศจากหอพัก',
    date: item.created_at,
    message: item.message,
    author: item.author || 'เจ้าหน้าที่',
  }
}

const OCCUPANCY_TYPE_FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'move_in', label: 'เข้าพัก' },
  { key: 'move_out', label: 'ย้ายออก' },
]

const OCCUPANCY_EVENT_LABELS = { move_in: 'เข้าพัก', move_out: 'ย้ายออก' }

function formatOccupancyEventType(type) {
  return OCCUPANCY_EVENT_LABELS[type] || type
}

function parseInputDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null
}

function getAuthHeaders() {
  const token = sessionStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const MODAL_CLOSE_ANIMATION_MS = 60

function useClosingValue(value, duration = MODAL_CLOSE_ANIMATION_MS) {
  const prevValue = useRef(value)
  const [closingValue, setClosingValue] = useState(null)

  if (value !== prevValue.current) {
    if (!value && prevValue.current) {
      setClosingValue(prevValue.current)
    } else if (value && closingValue) {
      setClosingValue(null)
    }
    prevValue.current = value
  }

  useEffect(() => {
    if (!closingValue) return undefined
    const timeoutId = setTimeout(() => setClosingValue(null), duration)
    return () => clearTimeout(timeoutId)
  }, [closingValue, duration])

  const display = value || closingValue
  const isClosing = !value && Boolean(closingValue)
  return [display, isClosing]
}

const DATE_DEPENDENT_GROUPS = ['overview', 'roomsOverview', 'roomsOccupancy', 'roomsLogs', 'finance']

function getNeededDataGroups(tab, roomsSection) {
  if (tab === 'rooms') {
    const sectionGroup = { overview: 'roomsOverview', occupancy: 'roomsOccupancy', logs: 'roomsLogs' }[roomsSection] || 'roomsOverview'
    return ['roomStatus', 'overview', sectionGroup]
  }
  if (tab === 'finance') return ['overview', 'finance']
  if (tab === 'staff') return ['staff']
  if (tab === 'parking' || tab === 'safety') return ['roomStatus']
  return []
}

function OwnerMain() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('rooms')
  const [financeSection, setFinanceSection] = useState('overview')
  const [financeComparisonPage, setFinanceComparisonPage] = useState(1)
  const [financeComparisonSearch, setFinanceComparisonSearch] = useState('')
  const [financePeriodDetail, setFinancePeriodDetail] = useState(null)
  const [roomsSection, setRoomsSection] = useState('overview')
  const [announcements, setAnnouncements] = useState([])
  const [announcementFocus, setAnnouncementFocus] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifPage, setNotifPage] = useState(1)
  const notifRef = useRef(null)
  const notifListRef = useRef(null)
  const [notifClosing, setNotifClosing] = useState(false)
  const [seenNotificationKeys, setSeenNotificationKeys] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(getOwnerNotificationStorageKey()) || '[]')
    } catch {
      return []
    }
  })
  const [freshNotificationKeys, setFreshNotificationKeys] = useState(() => new Set())
  const [overview, setOverview] = useState({ rooms: {}, finance: {} })
  const [roomStatus, setRoomStatus] = useState({ totalRooms: 0, vacantCount: 0, occupiedCount: 0, rooms: [] })
  const [incomeSummary, setIncomeSummary] = useState({ totalIncome: 0, byType: [] })
  const [expenses, setExpenses] = useState({ expenses: [], byCategory: [], total: 0, totalAmount: 0, page: 1, pageSize: 10 })
  const [financeTrends, setFinanceTrends] = useState({ trends: [], granularity: 'month' })
  const [isTrendsLoading, setIsTrendsLoading] = useState(false)
  const [occupancyTrend, setOccupancyTrend] = useState({ trends: [], granularity: 'month' })
  const [isOccupancyTrendLoading, setIsOccupancyTrendLoading] = useState(false)
  const [occupancyPeriodDetail, setOccupancyPeriodDetail] = useState(null)
  const [occupancyLogId, setOccupancyLogId] = useState(null)
  const [periodDetailFilter, setPeriodDetailFilter] = useState('all')
  const [periodDetailSearch, setPeriodDetailSearch] = useState('')
  const [staffList, setStaffList] = useState([])
  const [paymentLogs, setPaymentLogs] = useState({ payments: [], total: 0, page: 1, pageSize: 20 })
  const [viewingPaymentSlip, setViewingPaymentSlip] = useState(null)
  const [paymentSlipZoomOpen, setPaymentSlipZoomOpen] = useState(false)
  const [pendingSlipReviews, setPendingSlipReviews] = useState([])
  const [reviewingSlipId, setReviewingSlipId] = useState(null)
  const [occupancyLogs, setOccupancyLogs] = useState({ logs: [], total: 0, page: 1, pageSize: 10 })
  const [occupancyFilter, setOccupancyFilter] = useState({ search: '', type: 'all' })
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF)
  const [paymentFilter, setPaymentFilter] = useState({ from: '', to: '' })
  const utilityReceipts = useOwnerUtilityReceipts(activeTab === 'utilities', paymentFilter.from, paymentFilter.to)
  const utilityTotals = useMemo(() => utilityReceipts.result.trends.reduce((sum, row) => ({
    water: sum.water + Number(row.water || 0),
    electricity: sum.electricity + Number(row.electricity || 0),
    waterUnits: sum.waterUnits + Number(row.waterUnits || 0),
    electricityUnits: sum.electricityUnits + Number(row.electricityUnits || 0),
  }), { water: 0, electricity: 0, waterUnits: 0, electricityUnits: 0 }), [utilityReceipts.result])
  const [paymentLogFilter, setPaymentLogFilter] = useState({ search: '', from: '', to: '', onlyOverdue: false })
  const [notice, setNotice] = useState({ type: '', message: '' })
  const [loadedDataGroups, setLoadedDataGroups] = useState(() => new Set())
  const dataGroupsLoadedRef = useRef(new Set())
  const dataGroupsInflightRef = useRef(new Set())
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [staffErrors, setStaffErrors] = useState({})
  const [selectedPeriod] = useState(() => {
    const today = new Date()
    return { month: today.getMonth() + 1, year: today.getFullYear() }
  })
  const [roomDetail, setRoomDetail] = useState(null)
  const [isRoomDetailLoading, setIsRoomDetailLoading] = useState(false)
  const [isRoomHistoryLoading, setIsRoomHistoryLoading] = useState(false)
  const roomDetailRequestIdRef = useRef(0)
  const [roomListFilter, setRoomListFilter] = useState(null)
  const [roomListSearch, setRoomListSearch] = useState('')
  const [roomDetailOpenedAt, setRoomDetailOpenedAt] = useState(0)
  const [roomPaymentDetail, setRoomPaymentDetail] = useState(null)
  const [roomMapFilter, setRoomMapFilter] = useState('all')
  const [roomMapPage, setRoomMapPage] = useState(1)
  const [roomPaymentsAllOpen, setRoomPaymentsAllOpen] = useState(false)
  const [roomPaymentsSearch, setRoomPaymentsSearch] = useState('')
  const [roomPaymentsStatus, setRoomPaymentsStatus] = useState('all')
  const [roomPaymentsPage, setRoomPaymentsPage] = useState(1)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const confirmResolverRef = useRef(null)
  const [staffPage, setStaffPage] = useState(1)
  const [occupancySummary, setOccupancySummary] = useState(null)
  const [isOccupancySummaryLoading, setIsOccupancySummaryLoading] = useState(false)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [viewingStaff, setViewingStaff] = useState(null)

  const [expenseEditModal, setExpenseEditModal] = useState(null)
  const [expenseEditForm, setExpenseEditForm] = useState({ category: '', description: '', amount: '', expense_date: '', vendor: '', payment_method: '', receipt_number: '', room_number: '' })
  const [expenseEditFormError, setExpenseEditFormError] = useState('')
  const [isExpenseEditSubmitting, setIsExpenseEditSubmitting] = useState(false)
  const [expenseDeleteConfirm, setExpenseDeleteConfirm] = useState(null)

  const loadAnnouncements = useCallback(() => axios
    .get('/api/owner/announcements', { headers: getAuthHeaders() })
    .then(({ data }) => setAnnouncements(data.announcements || []))
    .catch(() => {}), [])

  useEffect(() => {
    loadAnnouncements()
    const interval = setInterval(() => {
      if (!document.hidden) loadAnnouncements()
    }, 60000)
    const refresh = () => {
      if (!document.hidden) loadAnnouncements()
    }
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [loadAnnouncements])

  useEffect(() => {
    if (!notifOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!notifRef.current?.contains(event.target)) setNotifClosing(true)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [notifOpen])

  const [displayRoomDetail, isRoomDetailClosing] = useClosingValue(roomDetail)
  const [displayRoomListFilter, isRoomListClosing] = useClosingValue(roomListFilter)
  const [displayRoomPaymentDetail, isRoomPaymentDetailClosing] = useClosingValue(roomPaymentDetail)
  const [displayRoomPaymentsAll, isRoomPaymentsAllClosing] = useClosingValue(roomPaymentsAllOpen)
  const [displayConfirmDialog, isConfirmDialogClosing] = useClosingValue(confirmDialog)

  const askConfirm = (options) => new Promise((resolve) => {
    confirmResolverRef.current = resolve
    setConfirmDialog(options)
  })

  const resolveConfirm = (result) => {
    confirmResolverRef.current?.(result)
    confirmResolverRef.current = null
    setConfirmDialog(null)
  }
  const [displayStaffModalOpen, isStaffModalClosing] = useClosingValue(isStaffModalOpen)
  const [displayViewingStaff, isViewingStaffClosing] = useClosingValue(viewingStaff)
  const [displayExpenseEditModal, isExpenseEditClosing] = useClosingValue(expenseEditModal)
  const [displayExpenseDeleteConfirm, isExpenseDeleteClosing] = useClosingValue(expenseDeleteConfirm)

  const totalIncome = Number(overview?.finance?.totalIncome ?? incomeSummary?.totalIncome ?? 0)
  const totalExpense = Number(overview?.finance?.totalExpense ?? 0)
  const netProfit = Number(overview?.finance?.netProfit ?? totalIncome - totalExpense)

  const SUMMARY_PAGE_SIZE = 5

  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0


  const financeExpensePage = Number(expenses.page || 1)

  const trendChartData = useMemo(() => {
    const formatLabel = financeTrends.granularity === 'day' ? formatTrendDay : formatTrendMonth
    return (financeTrends.trends || []).map((item) => ({ ...item, monthLabel: formatLabel(item.period) }))
  }, [financeTrends])

  const financeComparisonPageSize = 5
  const financeComparisonFiltered = useMemo(() => {
    const keyword = financeComparisonSearch.trim().toLowerCase()
    return trendChartData.map((item, originalIndex) => ({ ...item, originalIndex }))
      .filter((item) => !keyword || [item.period, item.monthLabel, formatDate(`${item.period.length === 7 ? item.period + '-01' : item.period}T00:00:00`), String(item.income || 0), String(item.expense || 0), currency(item.income), currency(item.expense)]
        .join(' ').toLowerCase().includes(keyword))
      .sort((a, b) => {
        const aHasAmount = Number(a.income || 0) !== 0 || Number(a.expense || 0) !== 0
        const bHasAmount = Number(b.income || 0) !== 0 || Number(b.expense || 0) !== 0
        return Number(bHasAmount) - Number(aHasAmount) || b.period.localeCompare(a.period)
      })
  }, [trendChartData, financeComparisonSearch])
  const financeComparisonPages = Math.max(1, Math.ceil(financeComparisonFiltered.length / financeComparisonPageSize))
  const financeComparisonCurrentPage = Math.min(financeComparisonPage, financeComparisonPages)
  const financeComparisonOffset = (financeComparisonCurrentPage - 1) * financeComparisonPageSize
  const financeComparisonRows = financeComparisonFiltered.slice(financeComparisonOffset, financeComparisonOffset + financeComparisonPageSize)

  const trendSummary = useMemo(() => {
    const totalIncome = trendChartData.reduce((sum, item) => sum + Number(item.income || 0), 0)
    const totalExpense = trendChartData.reduce((sum, item) => sum + Number(item.expense || 0), 0)
    const incomeCount = trendChartData.reduce((sum, item) => sum + Number(item.incomeCount || 0), 0)
    const expenseCount = trendChartData.reduce((sum, item) => sum + Number(item.expenseCount || 0), 0)
    const totalNet = totalIncome - totalExpense
    const avgNet = trendChartData.length ? totalNet / trendChartData.length : 0
    const profitMargin = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0
    return {
      totalIncome,
      totalExpense,
      incomeCount,
      expenseCount,
      avgIncomePerPayment: incomeCount ? totalIncome / incomeCount : 0,
      avgExpensePerRecord: expenseCount ? totalExpense / expenseCount : 0,
      totalNet,
      avgNet,
      profitMargin,
      periodCount: trendChartData.length,
    }
  }, [trendChartData])

  const occupancyTrendChartData = useMemo(() => {
    const formatLabel = occupancyTrend.granularity === 'day' ? formatTrendDay : formatTrendMonth
    return (occupancyTrend.trends || []).map((item) => ({ ...item, periodLabel: formatLabel(item.period) }))
  }, [occupancyTrend])

  const occupancyTrendSummary = useMemo(() => {
    const count = occupancyTrendChartData.length
    if (!count) {
      return {
        currentOccupied: 0,
        currentVacant: 0,
        totalRooms: 0,
        avgOccupied: 0,
        avgVacant: 0,
        avgRate: 0,
        moveIns: 0,
        moveOuts: 0,
        peakOccupied: 0,
        peakRate: 0,
        occupiedChange: 0,
        periodCount: 0,
      }
    }
    const latest = occupancyTrendChartData[count - 1]
    const totalOccupied = occupancyTrendChartData.reduce((sum, item) => sum + Number(item.occupied || 0), 0)
    const totalRooms = occupancyTrendChartData.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const moveIns = occupancyTrendChartData.reduce((sum, item) => sum + Number(item.moveIns || 0), 0)
    const moveOuts = occupancyTrendChartData.reduce((sum, item) => sum + Number(item.moveOuts || 0), 0)
    const peakOccupied = Math.max(...occupancyTrendChartData.map((item) => Number(item.occupied || 0)))
    const peakRate = Math.max(...occupancyTrendChartData.map((item) => {
      const capacity = Number(item.total || 0)
      return capacity > 0 ? (Number(item.occupied || 0) / capacity) * 100 : 0
    }))
    const firstOccupied = Number(occupancyTrendChartData[0].occupied || 0)
    return {
      currentOccupied: Number(latest.occupied || 0),
      currentVacant: Number(latest.vacant || 0),
      totalRooms: Number(latest.total || 0),
      avgOccupied: totalOccupied / count,
      avgVacant: occupancyTrendChartData.reduce((sum, item) => sum + Number(item.vacant || 0), 0) / count,
      avgRate: totalRooms > 0 ? (totalOccupied / totalRooms) * 100 : 0,
      moveIns,
      moveOuts,
      peakOccupied,
      peakRate,
      occupiedChange: Number(latest.occupied || 0) - firstOccupied,
      periodCount: count,
    }
  }, [occupancyTrendChartData])

  const occupancyComparisonRows = useMemo(
    () => occupancyTrendChartData.map((item, index) => {
      const occupied = Number(item.occupied || 0)
      const vacant = Number(item.vacant || 0)
      const total = Number(item.total || 0)
      const previousOccupied = index > 0 ? Number(occupancyTrendChartData[index - 1].occupied || 0) : null
      return {
        ...item,
        occupied,
        vacant,
        total,
        moveIns: Number(item.moveIns || 0),
        moveOuts: Number(item.moveOuts || 0),
        occupancyRate: total > 0 ? (occupied / total) * 100 : 0,
        change: previousOccupied === null ? null : occupied - previousOccupied,
      }
    }),
    [occupancyTrendChartData],
  )

  const currentOccupants = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.customer_id).sort(compareNewest('rental_start_date')),
    [roomStatus],
  )
  const recentOccupants = currentOccupants.slice(0, SUMMARY_PAGE_SIZE)

  const vacantRoomsList = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.status === 'vacant').sort(compareNewest('vacated_at')),
    [roomStatus],
  )
  const recentVacantRooms = vacantRoomsList.slice(0, SUMMARY_PAGE_SIZE)

  const maintenanceRoomsList = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.status === 'maintenance').sort(compareNewest('maintenance_since')),
    [roomStatus],
  )
  const recentMaintenanceRooms = maintenanceRoomsList.slice(0, SUMMARY_PAGE_SIZE)

  const occupancyPage = Number(occupancyLogs.page || 1)
  const totalOccupancyPages = Math.max(1, Math.ceil((Number(occupancyLogs.total) || 0) / (Number(occupancyLogs.pageSize) || 10)))

  const STAFF_PAGE_SIZE = 10
  const staffTotalPages = Math.max(1, Math.ceil(staffList.length / STAFF_PAGE_SIZE))
  const clampedStaffPage = Math.min(staffPage, staffTotalPages)
  const paginatedStaff = useMemo(() => {
    const start = (clampedStaffPage - 1) * STAFF_PAGE_SIZE
    return staffList.slice(start, start + STAFF_PAGE_SIZE)
  }, [staffList, clampedStaffPage])

  const roomListItems = useMemo(() => {
    if (displayRoomListFilter === 'occupied') return (roomStatus.rooms || []).filter((room) => room.is_booked)
    if (displayRoomListFilter === 'vacant') return (roomStatus.rooms || []).filter((room) => room.status === 'vacant')
    if (displayRoomListFilter === 'maintenance') return (roomStatus.rooms || []).filter((room) => room.status === 'maintenance')
    if (displayRoomListFilter === 'overdue') return (roomStatus.rooms || []).filter((room) => room.status === 'overdue')
    if (displayRoomListFilter === 'all') return roomStatus.rooms || []
    return []
  }, [displayRoomListFilter, roomStatus.rooms])

  const roomListKeyword = roomListSearch.trim().toLowerCase()
  const visibleRoomListItems = roomListKeyword
    ? roomListItems.filter((room) =>
        [String(room.room_number), `${room.first_name || ''} ${room.last_name || ''}`, room.phone, ROOM_STATUS_LABELS[room.status]]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(roomListKeyword),
      )
    : roomListItems

  const openRoomList = (filterKey) => {
    setRoomListSearch('')
    setRoomListFilter(filterKey)
  }

  const sortedRooms = useMemo(
    () => (roomStatus.rooms || []).slice().sort((a, b) => a.room_number - b.room_number),
    [roomStatus.rooms],
  )

  const roomListCounts = useMemo(() => {
    const rooms = roomStatus.rooms || []
    const countBy = (status) => rooms.filter((room) => room.status === status).length
    return {
      all: rooms.length,
      occupied: rooms.filter((room) => room.is_booked).length,
      overdue: countBy('overdue'),
      vacant: countBy('vacant'),
      maintenance: countBy('maintenance'),
    }
  }, [roomStatus.rooms])

  const roomStatusBreakdown = useMemo(
    () => [
      { key: 'occupied', label: 'มีผู้เช่า (ชำระปกติ)', count: (roomStatus.rooms || []).filter((room) => room.status === 'occupied').length, color: ROOM_STATUS_COLORS.occupied, filter: 'occupied' },
      { key: 'overdue', label: 'ค้างชำระ', count: roomListCounts.overdue, color: ROOM_STATUS_COLORS.overdue, filter: 'overdue' },
      { key: 'vacant', label: 'ห้องว่าง', count: roomListCounts.vacant, color: ROOM_STATUS_COLORS.vacant, filter: 'vacant' },
      { key: 'maintenance', label: 'ซ่อมบำรุง', count: roomListCounts.maintenance, color: ROOM_STATUS_COLORS.maintenance, filter: 'maintenance' },
    ],
    [roomStatus.rooms, roomListCounts],
  )
  const roomStatusTotal = roomStatusBreakdown.reduce((sum, item) => sum + item.count, 0)
  const mapRooms = roomMapFilter === 'all' ? sortedRooms : sortedRooms.filter((room) => (room.status || 'vacant') === roomMapFilter)
  const mapTotalPages = Math.max(1, Math.ceil(mapRooms.length / ROOM_MAP_PAGE_SIZE))
  const mapPage = Math.min(roomMapPage, mapTotalPages)
  const pagedMapRooms = mapRooms.slice((mapPage - 1) * ROOM_MAP_PAGE_SIZE, mapPage * ROOM_MAP_PAGE_SIZE)

  const roomOccupancyStats = useMemo(() => {
    const source = occupancySummary || roomStatus
    const total = Math.max(1, Number(source?.total ?? source?.totalRooms) || 0)
    const occupied = Number(source?.occupied ?? source?.occupiedCount) || 0
    const vacant = Number(source?.vacant ?? source?.vacantCount) || 0
    return {
      total,
      occupied,
      vacant,
      occupancyRate: Math.min(100, Math.round((occupied / total) * 100)),
    }
  }, [roomStatus, occupancySummary])

  const overdueRoomsCount = useMemo(
    () => (roomStatus.rooms || []).filter((room) => room.status === 'overdue').length,
    [roomStatus],
  )
  const maintenanceRoomsCount = maintenanceRoomsList.length

  const statCards = useMemo(() => {
    const periodOverdueCount = overview?.rooms?.overdueRoomsCount ?? overdueRoomsCount
    const periodMaintenanceCount = overview?.rooms?.maintenanceRoomsCount ?? maintenanceRoomsCount
    return [
      {
        label: 'ห้องทั้งหมด',
        value: overview?.rooms?.totalRooms ?? roomStatus?.totalRooms ?? 0,
        subtitle: `${roomStatus?.occupiedCount ?? 0} มีผู้เช่า / ${roomStatus?.vacantCount ?? 0} ว่าง`,
        tone: 'blue',
        icon: 'rooms',
      },
      {
        label: 'อัตราการเข้าพัก',
        value: `${roomOccupancyStats.occupancyRate}%`,
        subtitle: `จาก ${roomOccupancyStats.total} ห้องทั้งหมด`,
        tone: 'purple',
        icon: 'margin',
      },
      {
        label: 'ห้องค้างชำระ',
        value: periodOverdueCount,
        subtitle: 'ยังไม่ชำระในช่วงเวลาที่เลือก',
        tone: periodOverdueCount > 0 ? 'red' : 'green',
        icon: 'overdue',
      },
      {
        label: 'ห้องซ่อมบำรุง',
        value: periodMaintenanceCount,
        subtitle: 'แจ้งซ่อมในช่วงเวลาที่เลือก',
        tone: periodMaintenanceCount > 0 ? 'orange' : 'green',
        icon: 'maintenance',
      },
    ]
  }, [overview, roomStatus, roomOccupancyStats, overdueRoomsCount, maintenanceRoomsCount])

  const roomDetailBalance = useMemo(() => {
    if (!displayRoomDetail?.tenant) return null
    const rent = Number(displayRoomDetail.room?.price) || 0
    const unpaidUtilities = (displayRoomDetail.payments || [])
      .filter((payment) => payment.status !== 'paid' && (payment.type === 'water' || payment.type === 'electricity'))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const deposit = Number(displayRoomDetail.tenant.deposit_amount) || 0
    const totalDue = rent + unpaidUtilities
    return { rent, unpaidUtilities, deposit, totalDue, netBalance: totalDue - deposit }
  }, [displayRoomDetail])

  const recentPaymentHistory = (displayRoomDetail?.payments || []).slice(0, 5)

  const openPaymentSlip = (payment) => {
    setPaymentSlipZoomOpen(false)
    setViewingPaymentSlip(payment)
  }

  const closePaymentSlip = () => {
    setPaymentSlipZoomOpen(false)
    setViewingPaymentSlip(null)
  }

  const setMessage = (type, message) => {
    setNotice({ type, message })
    window.setTimeout(() => {
      setNotice((prev) => (prev.message === message ? { type: '', message: '' } : prev))
    }, 3500)
  }

  const loadOverview = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    const { data } = await axios.get('/api/owner/overview', {
      headers: getAuthHeaders(),
      params: { from: nextFilters.from || undefined, to: nextFilters.to || undefined },
    })
    setOverview(data)
  }

  const loadRoomStatus = async () => {
    const { data } = await axios.get('/api/owner/rooms/status', { headers: getAuthHeaders() })
    setRoomStatus(data)
  }

  const loadOccupancySummary = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    setIsOccupancySummaryLoading(true)
    try {
      const { data } = await axios.get('/api/owner/rooms/occupancy-summary', {
        headers: getAuthHeaders(),
        params: { from: nextFilters.from || undefined, to: nextFilters.to || undefined },
      })
      setOccupancySummary(data)
    } finally {
      setIsOccupancySummaryLoading(false)
    }
  }

  const loadIncome = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    const { data } = await axios.get('/api/owner/income', {
      headers: getAuthHeaders(),
      params: {
        month: nextFilters.month || selectedPeriod.month,
        year: nextFilters.year || selectedPeriod.year,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
      },
    })
    setIncomeSummary(data)

  }

  const loadExpenses = async (page = expenses.page || 1, overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    const { data } = await axios.get('/api/owner/expenses', {
      headers: getAuthHeaders(),
      params: { page, from: nextFilters.from || undefined, to: nextFilters.to || undefined },
    })
    setExpenses(data)
  }

  const openExpenseEdit = (expense) => {
    setExpenseEditForm({
      category: expense.category || '',
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      expense_date: (expense.expense_date || '').slice(0, 10),
      vendor: expense.vendor || '',
      payment_method: expense.payment_method || '',
      receipt_number: expense.receipt_number || '',
      room_number: expense.room_number ? String(expense.room_number) : '',
    })
    setExpenseEditFormError('')
    setExpenseEditModal(expense)
  }

  const submitExpenseEdit = async (event, requestClose) => {
    event.preventDefault()
    if (!expenseEditForm.category.trim()) {
      setExpenseEditFormError('กรุณาระบุหมวดหมู่รายจ่าย')
      return
    }
    const amountValue = Number(expenseEditForm.amount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setExpenseEditFormError('กรุณาระบุจำนวนเงินให้ถูกต้อง')
      return
    }
    if (!expenseEditForm.expense_date) {
      setExpenseEditFormError('กรุณาระบุวันที่')
      return
    }
    const roomValue = (expenseEditForm.room_number || '').trim()
    if (roomValue && !/^[1-9]\d{2}$/.test(roomValue)) {
      setExpenseEditFormError('เลขห้องต้องเป็นตัวเลข 3 หลัก (100–999)')
      return
    }

    setExpenseEditFormError('')
    const confirmed = await askConfirm({
      tone: 'primary',
      title: 'ยืนยันการแก้ไขรายจ่าย',
      message: 'ตรวจสอบข้อมูลก่อนบันทึก ยอดสรุปรายจ่ายจะเปลี่ยนตามข้อมูลใหม่ทันที',
      details: [
        ['หมวดหมู่', expenseEditForm.category.trim()],
        ['จำนวนเงิน', `฿${formatCurrency(amountValue)}`],
        ['วันที่จ่าย', formatDate(expenseEditForm.expense_date)],
        ['ชำระโดย', EXPENSE_METHOD_LABELS[expenseEditForm.payment_method] || 'ไม่ระบุ'],
      ],
      confirmLabel: 'บันทึกการแก้ไข',
    })
    if (!confirmed) return

    setIsExpenseEditSubmitting(true)
    setExpenseEditFormError('')
    try {
      await axios.put(
        `/api/owner/expenses/${expenseEditModal.id}`,
        {
          category: expenseEditForm.category.trim(),
          description: expenseEditForm.description.trim() || null,
          amount: amountValue,
          expense_date: expenseEditForm.expense_date,
          vendor: (expenseEditForm.vendor || '').trim(),
          payment_method: expenseEditForm.payment_method || null,
          receipt_number: (expenseEditForm.receipt_number || '').trim(),
          room_number: roomValue || null,
        },
        { headers: getAuthHeaders() },
      )
      setMessage('success', 'แก้ไขรายจ่ายสำเร็จ')
      requestClose()
      await loadExpenses(financeExpensePage)
    } catch (error) {
      setExpenseEditFormError(error.response?.data?.message || 'ไม่สามารถแก้ไขรายจ่ายได้')
    } finally {
      setIsExpenseEditSubmitting(false)
    }
  }

  const confirmDeleteExpenseRecord = async (requestClose) => {
    try {
      await axios.delete(`/api/owner/expenses/${expenseDeleteConfirm.id}`, { headers: getAuthHeaders() })
      setMessage('success', 'ลบรายจ่ายสำเร็จ')
      requestClose()
      await loadExpenses(financeExpensePage)
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถลบรายจ่ายได้')
    }
  }

  const loadTrends = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    setIsTrendsLoading(true)
    try {
      const { data } = await axios.get('/api/owner/trends', {
        headers: getAuthHeaders(),
        params: { from: nextFilters.from || undefined, to: nextFilters.to || undefined },
      })
      setFinanceTrends(data)
    } finally {
      setIsTrendsLoading(false)
    }
  }

  const loadOccupancyTrend = async (overrides = {}) => {
    const nextFilters = { ...paymentFilter, ...overrides }
    setIsOccupancyTrendLoading(true)
    try {
      const { data } = await axios.get('/api/owner/rooms/occupancy-trend', {
        headers: getAuthHeaders(),
        params: { from: nextFilters.from || undefined, to: nextFilters.to || undefined },
      })
      setOccupancyTrend(data)
    } finally {
      setIsOccupancyTrendLoading(false)
    }
  }

   const loadStaff = async () => {
    const { data } = await axios.get('/api/owner/staff', { headers: getAuthHeaders() })
    setStaffList(data.staff || [])
  }

  const loadPaymentLogs = async (page = paymentLogs.page || 1, overrides = {}) => {
    const nextFilters = { ...paymentLogFilter, ...overrides }
    const { data } = await axios.get('/api/owner/logs/payments', {
      headers: getAuthHeaders(),
      params: {
        page,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
        search: nextFilters.search || undefined,
        onlyOverdue: nextFilters.onlyOverdue ? 'true' : undefined,
      },
    })
    setPaymentLogs({ ...data, payments: data.payments || [] })
  }

  const loadPendingSlipReviews = async () => {
    const { data } = await axios.get('/api/staff/payment-verifications', { headers: getAuthHeaders() })
    setPendingSlipReviews(data.payments || [])
  }

  const reviewOwnerPaymentSlip = async (payment, decision) => {
    const paymentId = payment.payment_id ?? payment.id
    const action = decision === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'
    const confirmed = await askConfirm({
      tone: decision === 'approved' ? 'success' : 'danger',
      title: `${action}สลิปการชำระเงิน`,
      message: decision === 'approved' ? 'ยืนยันว่าตรวจสอบสลิปแล้วและยอดเงินถูกต้อง' : 'สลิปนี้จะถูกปฏิเสธและผู้เช่าต้องส่งหลักฐานใหม่',
      details: [
        ['ห้อง', payment.room_number ? `ห้อง ${payment.room_number}` : '-'],
        ['ยอดเงิน', `฿${formatCurrency(payment.amount)}`],
      ],
      confirmLabel: `${action}สลิป`,
    })
    if (!confirmed) return false
    setReviewingSlipId(paymentId)
    try {
      const { data } = await axios.patch(
        `/api/staff/payment-verifications/${paymentId}`,
        { decision },
        { headers: getAuthHeaders() },
      )
      setMessage('success', data.message || `บันทึกผลการ${action}สลิปแล้ว`)
      await Promise.all([loadPendingSlipReviews(), loadPaymentLogs(paymentLogs.page || 1)])
      const roomNumber = displayRoomDetail?.room?.room_number
      if (roomNumber) {
        const { data: roomData } = await axios.get(`/api/owner/rooms/${roomNumber}`, { headers: getAuthHeaders() })
        setRoomDetail(roomData)
      }
      return true
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่')
      return false
    } finally {
      setReviewingSlipId(null)
    }
  }

  const loadOccupancyLogs = async (page = occupancyLogs.page || 1, overrides = {}) => {
    const nextFilters = { search: occupancyFilter.search, type: occupancyFilter.type, from: paymentFilter.from, to: paymentFilter.to, ...overrides }
    const { data } = await axios.get('/api/owner/logs/occupancy', {
      headers: getAuthHeaders(),
      params: {
        page,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
        search: nextFilters.search || undefined,
        type: nextFilters.type && nextFilters.type !== 'all' ? nextFilters.type : undefined,
      },
    })
    setOccupancyLogs(data)
  }

  const openPeriodLogRoom = (log) => {
    if (!log.room_number) return
    const room = (roomStatus.rooms || []).find((item) => Number(item.room_number) === Number(log.room_number))
    handleRoomClick(room || { room_number: log.room_number })
  }

  const openOccupancyPeriodDetail = async (item) => {
    const isDaily = occupancyTrend.granularity === 'day'
    const from = isDaily ? item.period : `${item.period}-01`
    const endDate = isDaily ? new Date(`${item.period}T00:00:00`) : new Date(`${item.period}-01T00:00:00`)
    if (!isDaily) endDate.setMonth(endDate.getMonth() + 1, 0)
    const to = isDaily ? item.period : `${item.period}-${String(endDate.getDate()).padStart(2, '0')}`
    setPeriodDetailFilter('all')
    setPeriodDetailSearch('')
    setOccupancyPeriodDetail({ item, logs: [], loading: true })
    try {
      const params = { from, to, page: 1 }
      const { data: firstPage } = await axios.get('/api/owner/logs/occupancy', { headers: getAuthHeaders(), params })
      const pageCount = Math.ceil((Number(firstPage.total) || 0) / (Number(firstPage.pageSize) || 10))
      const otherPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
        axios.get('/api/owner/logs/occupancy', { headers: getAuthHeaders(), params: { ...params, page: index + 2 } }),
      ))
      const logs = [...(firstPage.logs || []), ...otherPages.flatMap((response) => response.data.logs || [])]
      setOccupancyPeriodDetail({ item, logs, loading: false })
    } catch (error) {
      setOccupancyPeriodDetail({ item, logs: [], loading: false })
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดช่วงเวลาได้')
    }
  }

  const handleRoomClick = async (room) => {
    const requestId = ++roomDetailRequestIdRef.current
    setRoomDetailOpenedAt(new Date().getTime())
    setRoomDetail({ room, tenant: null, payments: [] })
    setIsRoomDetailLoading(true)
    setIsRoomHistoryLoading(true)
    const historyRequest = axios.get(`/api/staff/rooms/${room.room_number}/history`, { headers: getAuthHeaders() }).catch(() => null)
    try {
      const { data } = await axios.get(`/api/owner/rooms/${room.room_number}`, { headers: getAuthHeaders() })
      if (requestId !== roomDetailRequestIdRef.current) return
      setRoomDetail(data)
      setIsRoomDetailLoading(false)

      const historyResponse = await historyRequest
      if (requestId !== roomDetailRequestIdRef.current) return
      const historicalPayments = (historyResponse?.data?.rentalHistory || []).flatMap((booking) =>
        (booking.payments || []).map((payment) => ({
          ...payment,
          tenantName: `${booking.first_name || ''} ${booking.last_name || ''}`.trim(),
        })),
      )
      if (historicalPayments.length) {
        setRoomDetail((current) => current ? { ...current, payments: historicalPayments } : current)
      }
      setIsRoomHistoryLoading(false)
    } catch (error) {
      if (requestId !== roomDetailRequestIdRef.current) return
      setRoomDetail(null)
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดห้องได้')
      setIsRoomDetailLoading(false)
      setIsRoomHistoryLoading(false)
    }
  }

  const closeRoomDetail = () => {
    roomDetailRequestIdRef.current += 1
    setRoomDetail(null)
    setIsRoomDetailLoading(false)
    setIsRoomHistoryLoading(false)
  }

  const getGroupLoaders = (filters) => ({
    roomStatus: () => loadRoomStatus(),
    overview: () => loadOverview(filters),
    roomsOverview: () => loadOccupancySummary(filters),
    roomsOccupancy: () => loadOccupancyTrend(filters),
    roomsLogs: () => loadOccupancyLogs(1, { from: filters.from, to: filters.to }),
    finance: () => Promise.all([loadIncome(filters), loadExpenses(1, filters), loadTrends(filters), loadPaymentLogs(1), loadPendingSlipReviews()]),
    staff: () => loadStaff(),
  })

  const ensureDataGroups = (groups, { force = false, filters = paymentFilter } = {}) => {
    const loaders = getGroupLoaders(filters)
    groups.forEach((group) => {
      if (!loaders[group] || dataGroupsInflightRef.current.has(group)) return
      if (!force && dataGroupsLoadedRef.current.has(group)) return
      dataGroupsInflightRef.current.add(group)
      loaders[group]()
        .then(() => {
          dataGroupsLoadedRef.current.add(group)
          setLoadedDataGroups(new Set(dataGroupsLoadedRef.current))
        })
        .catch((error) => {
          dataGroupsLoadedRef.current.add(group)
          setLoadedDataGroups(new Set(dataGroupsLoadedRef.current))
          setMessage('danger', error.response?.data?.message || 'ไม่สามารถโหลดข้อมูลหอพักได้')
        })
        .finally(() => {
          dataGroupsInflightRef.current.delete(group)
        })
    })
  }

  const neededDataGroups = getNeededDataGroups(activeTab, roomsSection)
  const isLoading = neededDataGroups.some((group) => !loadedDataGroups.has(group))

  useEffect(() => {
    ensureDataGroups(getNeededDataGroups(activeTab, roomsSection))
  }, [activeTab, roomsSection])

  useEffect(() => {
    const isModalOpen = Boolean(displayRoomDetail) || Boolean(displayRoomListFilter) || displayStaffModalOpen || Boolean(displayViewingStaff)
    if (!isModalOpen) return undefined

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }, [displayRoomDetail, displayRoomListFilter, displayStaffModalOpen, displayViewingStaff])

  const handlePaymentLogFilterChange = async (field, value) => {
    const nextFilters = { ...paymentLogFilter, [field]: value }
    setPaymentLogFilter(nextFilters)
    try {
      await loadPaymentLogs(1, nextFilters)
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลการชำระเงินได้')
    }
  }

  const handlePaymentRangeChange = (field, value) => {
    setFinanceComparisonPage(1)
    const nextFilters = { ...paymentFilter, [field]: value || '' }
    setPaymentFilter(nextFilters)
    const visibleGroups = getNeededDataGroups(activeTab, roomsSection).filter((group) => DATE_DEPENDENT_GROUPS.includes(group))
    DATE_DEPENDENT_GROUPS.filter((group) => !visibleGroups.includes(group)).forEach((group) => dataGroupsLoadedRef.current.delete(group))
    setLoadedDataGroups(new Set(dataGroupsLoadedRef.current))
    ensureDataGroups(visibleGroups, { force: true, filters: nextFilters })
  }

  const handleOccupancyFilterChange = async (field, value) => {
    const nextFilters = { ...occupancyFilter, [field]: value }
    setOccupancyFilter(nextFilters)
    try {
      await loadOccupancyLogs(1, nextFilters)
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถกรองข้อมูลการเข้าพักได้')
    }
  }

  const validateStaffForm = (isEdit) => {
    const errors = {}
    if (!isEdit && !/^\d{13}$/.test(staffForm.idcard.trim())) errors.idcard = 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'
    if (!/^0\d{8,9}$/.test(staffForm.phone.trim())) errors.phone = 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก'
    if (!isEdit || staffForm.password) {
      if ((staffForm.password || '').length < 6) errors.password = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
    }
    if (!staffForm.age || Number(staffForm.age) < 1 || Number(staffForm.age) > 120) errors.age = 'กรุณาระบุอายุ 1-120 ปี'
    setStaffErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleStaffSubmit = async (event) => {
    event.preventDefault()
    const isEdit = Boolean(editingStaff)
    if (!validateStaffForm(isEdit)) return
    setIsSubmittingStaff(true)
    try {
      if (isEdit) {
        const payload = {
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          phone: staffForm.phone,
          age: staffForm.age,
        }
        if (staffForm.password) payload.password = staffForm.password
        await axios.put(`/api/owner/staff/${editingStaff.role}/${editingStaff.id}`, payload, { headers: getAuthHeaders() })
        setMessage('success', 'แก้ไขข้อมูลพนักงานสำเร็จ')
      } else {
        await axios.post('/api/owner/staff', staffForm, { headers: getAuthHeaders() })
        setMessage('success', 'เพิ่มพนักงานสำเร็จ')
      }

      setStaffForm(EMPTY_STAFF)
      setStaffErrors({})
      setIsStaffModalOpen(false)
      setEditingStaff(null)
      await loadStaff()
    } catch (error) {
      setMessage('danger', error.response?.data?.message || (isEdit ? 'ไม่สามารถแก้ไขข้อมูลพนักงานได้' : 'ไม่สามารถเพิ่มพนักงานได้'))
    } finally {
      setIsSubmittingStaff(false)
    }
  }

  const openStaffModal = () => {
    setEditingStaff(null)
    setStaffForm(EMPTY_STAFF)
    setStaffErrors({})
    setShowPassword(false)
    setIsStaffModalOpen(true)
  }

  const openStaffEditModal = (staffMember) => {
    setEditingStaff({ role: staffMember.role, id: staffMember.id })
    setStaffForm({
      role: staffMember.role,
      idcard: staffMember.idcard || '',
      password: '',
      phone: staffMember.phone || '',
      first_name: staffMember.first_name || '',
      last_name: staffMember.last_name || '',
      age: staffMember.age || '',
    })
    setStaffErrors({})
    setShowPassword(false)
    setIsStaffModalOpen(true)
  }

  const closeStaffModal = () => {
    setIsStaffModalOpen(false)
    setEditingStaff(null)
    setStaffErrors({})
  }

  const toggleStaffStatus = async (staffMember) => {
    try {
      const action = staffMember.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'
      await axios.patch(
        `/api/owner/staff/${staffMember.role}/${staffMember.id}/suspend`,
        { is_suspended: !staffMember.is_suspended },
        { headers: getAuthHeaders() },
      )
      setMessage('success', `${action} สำเร็จ`)
      await loadStaff()
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถเปลี่ยนสถานะได้')
    }
  }

  const deleteStaffMember = async (staffMember) => {
    const confirmed = await askConfirm({
      tone: 'danger',
      title: 'ลบพนักงาน',
      message: 'ข้อมูลพนักงานจะถูกลบออกจากระบบและไม่สามารถกู้คืนได้',
      details: [
        ['ชื่อ', `${staffMember.first_name || ''} ${staffMember.last_name || ''}`.trim() || '-'],
        ['ตำแหน่ง', staffMember.role || '-'],
      ],
      confirmLabel: 'ลบพนักงาน',
    })
    if (!confirmed) return
    try {
      await axios.delete(`/api/owner/staff/${staffMember.role}/${staffMember.id}`, { headers: getAuthHeaders() })
      setMessage('success', 'ลบพนักงานสำเร็จ')
      await loadStaff()
    } catch (error) {
      setMessage('danger', error.response?.data?.message || 'ไม่สามารถลบพนักงานได้')
    }
  }

  const handleLogout = () => {
    sessionStorage.clear()
    navigate('/login')
  }

  const paymentPage = Number(paymentLogs.page || 1)
  const totalPaymentPages = Math.max(1, Math.ceil((Number(paymentLogs.total) || 0) / (Number(paymentLogs.pageSize) || 20)))
  const notifications = announcements.map(buildOwnerAnnouncementNotification)
  const newNotifications = notifications.filter((item) => !seenNotificationKeys.includes(item.key))
  const notificationPageSize = 30
  const notificationPages = Math.max(1, Math.ceil(notifications.length / notificationPageSize))
  const notificationPage = Math.min(notifPage, notificationPages)
  const visibleNotifications = notifications.slice((notificationPage - 1) * notificationPageSize, notificationPage * notificationPageSize)
  const markNotificationsRead = () => {
    const keys = notifications.map((item) => item.key)
    setFreshNotificationKeys(new Set(newNotifications.map((item) => item.key)))
    setSeenNotificationKeys(keys)
    localStorage.setItem(getOwnerNotificationStorageKey(), JSON.stringify(keys))
  }
  const ownerSummaryTiles = {
    utilities: [
      { key: 'water', tone: 'blue', icon: 'water', label: 'รายรับค่าน้ำ', value: utilityReceipts.loading || utilityReceipts.error ? '—' : `฿${currency(utilityTotals.water)}`, hint: 'ยอดรับชำระตามช่วงที่เลือก' },
      { key: 'electricity', tone: 'orange', icon: 'electricity', label: 'รายรับค่าไฟ', value: utilityReceipts.loading || utilityReceipts.error ? '—' : `฿${currency(utilityTotals.electricity)}`, hint: 'ยอดรับชำระตามช่วงที่เลือก' },
      { key: 'water-units', tone: 'blue', icon: 'water', label: 'หน่วยน้ำที่รับชำระ', value: utilityReceipts.loading || utilityReceipts.error ? '—' : `${currency(utilityTotals.waterUnits)} หน่วย` },
      { key: 'electricity-units', tone: 'orange', icon: 'electricity', label: 'หน่วยไฟที่รับชำระ', value: utilityReceipts.loading || utilityReceipts.error ? '—' : `${currency(utilityTotals.electricityUnits)} หน่วย` },
    ],
    rooms: roomsSection === 'occupancy'
      ? [
          { key: 'occupants', tone: 'blue', icon: 'rooms', label: 'ผู้เข้าพักปัจจุบัน', value: `${currentOccupants.length} คน`, hint: 'ผู้เช่าที่พักอยู่ตอนนี้' },
          { key: 'avg-rate', tone: 'purple', icon: 'margin', label: 'อัตราเข้าพักเฉลี่ย', value: `${occupancyTrendSummary.avgRate.toFixed(1)}%`, hint: `เฉลี่ยจาก ${occupancyTrendSummary.periodCount} ช่วงเวลา` },
          { key: 'peak', tone: 'orange', icon: 'profit', label: 'ผู้พักสูงสุด', value: `${occupancyTrendSummary.peakOccupied} ห้อง`, hint: `อัตราสูงสุด ${occupancyTrendSummary.peakRate.toFixed(1)}%` },
          {
            key: 'net-move',
            tone: occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts < 0 ? 'red' : 'green',
            icon: 'income',
            label: 'ย้ายเข้า – ย้ายออก',
            value: `${occupancyTrendSummary.moveIns} / ${occupancyTrendSummary.moveOuts}`,
            hint: `สุทธิ ${occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts >= 0 ? '+' : ''}${occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts} ในช่วงที่เลือก`,
          },
        ]
      : roomsSection === 'logs'
        ? [
            { key: 'log-total', tone: 'blue', icon: 'rooms', label: 'รายการทั้งหมด', value: `${(occupancyLogs.summary?.moveIns || 0) + (occupancyLogs.summary?.moveOuts || 0)} รายการ`, hint: 'ตามช่วงวันที่และคำค้นหา' },
            { key: 'log-in', tone: 'green', icon: 'income', label: 'ย้ายเข้า', value: `${occupancyLogs.summary?.moveIns || 0} ครั้ง`, hint: 'การจองห้องใหม่' },
            { key: 'log-out', tone: 'orange', icon: 'expense', label: 'ย้ายออก', value: `${occupancyLogs.summary?.moveOuts || 0} ครั้ง`, hint: 'คำขอย้ายออกที่อนุมัติแล้ว' },
            {
              key: 'log-net',
              tone: (occupancyLogs.summary?.moveIns || 0) - (occupancyLogs.summary?.moveOuts || 0) < 0 ? 'red' : 'purple',
              icon: 'margin',
              label: 'ผลต่างสุทธิ',
              value: `${(occupancyLogs.summary?.moveIns || 0) - (occupancyLogs.summary?.moveOuts || 0) >= 0 ? '+' : ''}${(occupancyLogs.summary?.moveIns || 0) - (occupancyLogs.summary?.moveOuts || 0)}`,
              hint: 'ย้ายเข้าหักย้ายออก',
            },
          ]
        : statCards.map((card) => ({ key: card.label, icon: card.icon, label: card.label, value: card.value, hint: card.subtitle, tone: card.tone })),
    finance: financeSection === 'expenses' ? (() => {
      const categories = [...(expenses.byCategory || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
      const grandTotal = categories.reduce((sum, item) => sum + Number(item.total || 0), 0)
      const grandCount = categories.reduce((sum, item) => sum + Number(item.count || 0), 0)
      const top = categories[0]
      return [
        { key: 'xl-total', tone: 'orange', icon: 'expense', label: 'รายจ่ายรวม', value: `฿${currency(grandTotal)}`, hint: `${grandCount} รายการ ตามช่วงที่เลือก` },
        { key: 'xl-avg', tone: 'blue', icon: 'margin', label: 'เฉลี่ยต่อรายการ', value: `฿${currency(grandCount ? grandTotal / grandCount : 0)}`, hint: 'คำนวณจากทุกหมวด' },
        { key: 'xl-top', tone: 'red', icon: 'profit', label: 'หมวดที่จ่ายมากสุด', value: top ? top.category || 'ไม่ระบุ' : '—', hint: top ? `฿${currency(top.total)} · ${grandTotal ? formatPercent((Number(top.total) / grandTotal) * 100) : '0%'}` : 'ยังไม่มีข้อมูล' },
        { key: 'xl-cats', tone: 'purple', icon: 'rooms', label: 'จำนวนหมวดหมู่', value: `${categories.length} หมวด`, hint: 'ที่มีรายจ่ายในช่วงนี้' },
      ]
    })() : [
      { key: 'income', tone: 'blue', icon: 'income', label: 'รายรับรวม', value: formatSignedCurrency(totalIncome), hint: 'รวมรายการชำระเงินที่สำเร็จตามช่วงที่เลือก' },
      { key: 'expense', tone: 'orange', icon: 'expense', label: 'รายจ่ายรวม', value: formatSignedCurrency(totalExpense), hint: 'รวมรายจ่ายทั้งหมดตามช่วงที่เลือก' },
      { key: 'net', tone: netProfit < 0 ? 'red' : 'green', icon: 'profit', label: netProfit < 0 ? 'ขาดทุนสุทธิ' : 'กำไรสุทธิ', value: formatSignedCurrency(netProfit), hint: 'รายรับ - รายจ่าย' },
      { key: 'margin', tone: netProfit < 0 ? 'red' : 'purple', icon: 'margin', label: 'อัตรากำไร', value: formatPercent(profitMargin), hint: 'กำไรสุทธิเทียบกับรายรับรวม' },
    ],
  }[activeTab]

  const closeNotifPanel = () => setNotifClosing(true)

  const openNotification = (notification) => {
    setActiveTab('announcements')
    setAnnouncementFocus((current) => ({ id: notification.announcementId, nonce: (current?.nonce || 0) + 1 }))
    closeNotifPanel()
  }

  return (
    <div className="owner-page">
      <div className="owner-container">
        <header className="owner-header">
          <div className="owner-title-group">
            <div className="auth-icon owner-building-icon" aria-hidden="true" />
            <div>
              <h1>Owner Dashboard</h1>
              <p>ระบบจัดการหอพักและการเงินรายวัน</p>
            </div>
          </div>

          <div className="owner-header-actions">
            <div className="staff-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="staff-notif-btn"
                aria-label="การแจ้งเตือน"
                aria-expanded={notifOpen}
                onClick={() => {
                  if (notifOpen) closeNotifPanel()
                  else {
                    markNotificationsRead()
                    setNotifOpen(true)
                    setNotifPage(1)
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {newNotifications.length > 0 && <span className="staff-notif-dot">{newNotifications.length > 99 ? '99+' : newNotifications.length}</span>}
              </button>
              {notifOpen && (
                <div
                  className={`staff-notif-panel${notifClosing ? ' is-closing' : ''}`}
                  onAnimationEnd={() => {
                    if (notifClosing) {
                      setNotifOpen(false)
                      setNotifClosing(false)
                    }
                  }}
                >
                  <div className="staff-notif-panel-header">
                    <span className="staff-notif-panel-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      การแจ้งเตือน
                      {notifications.length > 0 && <span className="staff-notif-count">{notifications.length}</span>}
                    </span>
                    <button type="button" className="staff-notif-panel-close" onClick={closeNotifPanel} aria-label="ปิด">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="staff-notif-empty">
                      <span className="staff-notif-empty-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                      </span>
                      ยังไม่มีการแจ้งเตือน
                    </div>
                  ) : (
                    <>
                      <div className="staff-notif-list" ref={notifListRef}>
                        {visibleNotifications.map((notification) => (
                          <button
                            type="button"
                            key={notification.key}
                            className={`staff-notif-item is-${notification.tone}${freshNotificationKeys.has(notification.key) ? ' is-new' : ''}`}
                            onClick={() => openNotification(notification)}
                          >
                            <span className="staff-notif-item-icon">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m3 11 18-5v12L3 14v-3z" />
                                <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                              </svg>
                            </span>
                            <span className="staff-notif-item-main">
                              <span className="staff-notif-item-head">
                                <span className="staff-notif-item-title">
                                  {freshNotificationKeys.has(notification.key) && <span className="staff-notif-item-new">ใหม่</span>}
                                  {notification.title}
                                </span>
                                <time className="staff-notif-item-date">
                                  {notification.date ? new Date(notification.date).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                                </time>
                              </span>
                              <span className="staff-notif-item-status">{notification.label}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                      {notificationPages > 1 && (
                        <div className="staff-notif-pagination">
                          <span className="staff-notif-page-info">
                            {(notificationPage - 1) * notificationPageSize + 1}–
                            {Math.min(notificationPage * notificationPageSize, notifications.length)} จาก {notifications.length}
                          </span>
                          <div className="staff-notif-page-nav">
                            <button
                              type="button"
                              className="staff-notif-page-btn"
                              aria-label="หน้าก่อนหน้า"
                              disabled={notificationPage <= 1}
                              onClick={() => {
                                setNotifPage(Math.max(1, notificationPage - 1))
                                notifListRef.current?.scrollTo({ top: 0 })
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M15 18l-6-6 6-6" />
                              </svg>
                            </button>
                            <span className="staff-notif-page-current">
                              {notificationPage} / {notificationPages}
                            </span>
                            <button
                              type="button"
                              className="staff-notif-page-btn"
                              aria-label="หน้าถัดไป"
                              disabled={notificationPage >= notificationPages}
                              onClick={() => {
                                setNotifPage(Math.min(notificationPages, notificationPage + 1))
                                notifListRef.current?.scrollTo({ top: 0 })
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <button type="button" className="owner-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </header>

        {activeTab !== 'dorm-info' && activeTab !== 'utilities' && (
          <section className="owner-period-bar">
            <div className="owner-period-text">
              <h2>{(OWNER_PERIOD_BAR_CONTENT[activeTab] || OWNER_PERIOD_BAR_CONTENT.rooms).title}</h2>
              <p>{(OWNER_PERIOD_BAR_CONTENT[activeTab] || OWNER_PERIOD_BAR_CONTENT.rooms).subtitle}</p>
            </div>
            {(activeTab === 'rooms' || activeTab === 'finance') && (
              <span className="owner-period-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 10h18" />
                </svg>
                <span>
                  <small>ข้อมูลประจำเดือน</small>
                  {THAI_MONTHS[selectedPeriod.month - 1]} {selectedPeriod.year + 543}
                </span>
              </span>
            )}
          </section>
        )}

        {notice.message && (
          <div className={`owner-alert owner-alert-${notice.type}`}>{notice.message}</div>
        )}

        {!isLoading && ownerSummaryTiles && (
          <section className="staff-summary-tiles owner-stat-tiles">
            {ownerSummaryTiles.map(({ key, ...tile }) => (
              <OwnerStatTile key={key} {...tile} />
            ))}
          </section>
        )}

        <ul className="nav nav-tabs owner-tabs">
          {OWNER_TABS.map((tab) => (
            <li className="nav-item" key={tab.key}>
              <button
                type="button"
                className={`nav-link owner-tab-link${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>

        {(activeTab === 'rooms' || activeTab === 'finance' || activeTab === 'utilities') && (
          <div className="owner-section-toolbar">
            {activeTab === 'rooms' && (
              <ul className="nav staff-subtabs owner-subtabs" aria-label="หมวดหมู่สรุปห้อง">
                {OWNER_ROOMS_SECTIONS.map((section) => (
                  <li className="nav-item" key={section.key}>
                    <button
                      type="button"
                      className={`nav-link staff-subtab-link${roomsSection === section.key ? ' active' : ''}`}
                      aria-pressed={roomsSection === section.key}
                      onClick={() => setRoomsSection(section.key)}
                    >
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {activeTab === 'finance' && (
              <ul className="nav staff-subtabs owner-subtabs" aria-label="หมวดหมู่รายละเอียดการเงิน">
                {OWNER_FINANCE_SECTIONS.map((section) => (
                  <li className="nav-item" key={section.key}>
                    <button type="button" className={`nav-link staff-subtab-link${financeSection === section.key ? ' active' : ''}`} aria-pressed={financeSection === section.key} onClick={() => setFinanceSection(section.key)}>{section.label}</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="owner-period-range-group">
              <small className="owner-period-range-caption">กรองข้อมูลตามช่วงวันที่</small>
            <div className="owner-period-range" role="group" aria-label="กรองข้อมูลตามช่วงวันที่">
              <span className="owner-period-range-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 10h18" />
                </svg>
              </span>
              <ThaiDatePicker
                value={paymentFilter.from}
                onChange={(value) => handlePaymentRangeChange('from', value)}
                maxDate={parseInputDate(paymentFilter.to)}
                placeholder="เลือกวันเริ่มต้นย้อนหลัง"
                aria-label="วันเริ่มต้น เลือกย้อนหลังได้"
                renderCustomHeader={({ monthDate, changeMonth, changeYear, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
                  <div className="thai-dp-header owner-range-calendar-header">
                    <button type="button" className="thai-dp-nav" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} aria-label="เดือนก่อนหน้า">‹</button>
                    <select aria-label="เลือกเดือนเริ่มต้น" value={monthDate.getMonth()} onChange={(event) => changeMonth(Number(event.target.value))}>
                      {Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Date(2000, month, 1).toLocaleDateString('th-TH', { month: 'long' })}</option>)}
                    </select>
                    <select aria-label="เลือกปีเริ่มต้นย้อนหลัง" value={monthDate.getFullYear()} onChange={(event) => changeYear(Number(event.target.value))}>
                      {Array.from({ length: 101 }, (_, index) => monthDate.getFullYear() + 1 - index).map((year) => <option key={year} value={year}>{year + 543}</option>)}
                    </select>
                    <button type="button" className="thai-dp-nav" onClick={increaseMonth} disabled={nextMonthButtonDisabled} aria-label="เดือนถัดไป">›</button>
                  </div>
                )}
                isClearable
              />
              <span className="owner-period-range-sep" aria-hidden="true">–</span>
              <ThaiDatePicker
                value={paymentFilter.to}
                onChange={(value) => handlePaymentRangeChange('to', value)}
                minDate={parseInputDate(paymentFilter.from)}
                placeholder="วันที่สิ้นสุด"
                isClearable
              />
            </div>
            </div>
          </div>
        )}

        {activeTab === 'dorm-info' && (
          <>
            <OwnerDormInfoSettings />
          </>
        )}

        {activeTab === 'parking' && (
          <StaffResidentVisitsTab rooms={(roomStatus.rooms || []).map((room) => ({ ...room, tenant: room.customer_id ? { id: room.customer_id, first_name: room.first_name, last_name: room.last_name } : null }))} />
        )}

        {activeTab === 'safety' && (
          <StaffSafetyTab rooms={(roomStatus.rooms || []).map((room) => ({ ...room, tenant: room.customer_id ? { id: room.customer_id, first_name: room.first_name, last_name: room.last_name } : null }))} showSummary />
        )}

        {isLoading && <div className="owner-loading-box">กำลังโหลดข้อมูล...</div>}

        {!isLoading && activeTab === 'rooms' && roomsSection === 'overview' && (
          <>
            <section className="owner-panel owner-ov-hero">
              <div className="owner-panel-header">
                <div>
                  <h3>ภาพรวมห้องพัก</h3>
                  <p className="owner-ov-caption">สถานะห้องทั้งหมด {roomOccupancyStats.total} ห้อง ณ ปัจจุบัน</p>
                </div>
                <button type="button" className="owner-ov-link" onClick={() => openRoomList('all')}>
                  ดูห้องทั้งหมด
                  <span aria-hidden="true">›</span>
                </button>
              </div>

              <div className="owner-ov-hero-body">
                <div className={`owner-ov-donut${isOccupancySummaryLoading ? ' is-loading' : ''}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={roomStatusBreakdown.some((item) => item.count > 0) ? roomStatusBreakdown : [{ key: 'empty', count: 1, color: '#e8eff9' }]}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="72%"
                        outerRadius="100%"
                        paddingAngle={roomStatusBreakdown.filter((item) => item.count > 0).length > 1 ? 2 : 0}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {(roomStatusBreakdown.some((item) => item.count > 0) ? roomStatusBreakdown : [{ key: 'empty', color: '#e8eff9' }]).map((item) => (
                          <Cell key={item.key} fill={item.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="owner-ov-donut-center">
                    <strong>{roomOccupancyStats.occupancyRate}%</strong>
                    <span>อัตราเข้าพัก</span>
                  </div>
                </div>

                <ul className="owner-ov-status-list">
                  {roomStatusBreakdown.map((item) => (
                    <li key={item.key}>
                      <button type="button" className="owner-ov-status" style={{ '--ov-tone': item.color }} onClick={() => openRoomList(item.filter)}>
                        <span className="owner-ov-status-dot" aria-hidden="true" />
                        <span className="owner-ov-status-text">
                          <span className="owner-ov-status-label">{item.label}</span>
                          <span className="owner-ov-status-bar" aria-hidden="true">
                            <span style={{ width: `${roomStatusTotal ? (item.count / roomStatusTotal) * 100 : 0}%` }} />
                          </span>
                        </span>
                        <strong className="owner-ov-status-count">
                          {item.count}
                          <small>ห้อง</small>
                        </strong>
                        <span className="owner-ov-status-arrow" aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="owner-ov-map">
                <div className="owner-ov-map-head">
                  <div className="owner-ov-map-title">
                    <span className="owner-ov-map-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                      </svg>
                    </span>
                    <div>
                      <strong>ผังห้องพัก</strong>
                      <small>คลิกที่ห้องเพื่อดูรายละเอียด</small>
                    </div>
                  </div>
                  <div className="owner-ov-map-legend" role="group" aria-label="กรองสถานะห้องในผัง">
                    {[{ key: 'all', label: 'ทั้งหมด', count: sortedRooms.length }, ...roomStatusBreakdown.map((item) => ({ key: item.key, label: ROOM_STATUS_LABELS[item.key], count: item.count }))].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`owner-ov-map-chip is-${item.key}${roomMapFilter === item.key ? ' active' : ''}`}
                        aria-pressed={roomMapFilter === item.key}
                        onClick={() => {
                          setRoomMapFilter(item.key)
                          setRoomMapPage(1)
                        }}
                      >
                        {item.key !== 'all' && <i aria-hidden="true" />}
                        {item.label}
                        <span>{item.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {mapRooms.length ? (
                  <div className="owner-ov-map-grid">
                    {pagedMapRooms.map((room) => {
                      const status = room.status || 'vacant'
                      const tenantName = `${room.first_name || ''} ${room.last_name || ''}`.trim()
                      return (
                        <button
                          key={room.room_number}
                          type="button"
                          className={`owner-ov-room is-${status}`}
                          onClick={() => handleRoomClick(room)}
                          title={`ห้อง ${room.room_number} · ${ROOM_STATUS_LABELS[status] || 'ว่าง'}`}
                        >
                          <span className="owner-ov-room-top">
                            <span className="owner-ov-room-number"><small>ห้อง</small><strong>{room.room_number}</strong></span>
                            <span className="owner-ov-room-icon" aria-hidden="true">
                              <StatIcon name={status === 'maintenance' ? 'maintenance' : status === 'overdue' ? 'overdue' : 'rooms'} />
                            </span>
                          </span>
                          <span className="owner-ov-room-name">
                            <small>{status === 'vacant' ? 'สถานะห้อง' : 'ผู้เช่า'}</small>
                            <strong>{tenantName || (status === 'vacant' ? 'พร้อมให้เช่า' : 'ไม่ระบุชื่อ')}</strong>
                          </span>
                          <span className="owner-ov-room-bottom"><span className="owner-ov-room-status">{ROOM_STATUS_LABELS[status] || 'ว่าง'}</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="owner-ov-list-empty">{sortedRooms.length ? 'ไม่มีห้องในสถานะนี้' : 'ยังไม่มีข้อมูลห้องพัก'}</div>
                )}
                {mapTotalPages > 1 && (
                  <div className="owner-ov-map-footer">
                    <span>
                      แสดง {(mapPage - 1) * ROOM_MAP_PAGE_SIZE + 1}–{Math.min(mapPage * ROOM_MAP_PAGE_SIZE, mapRooms.length)} จาก {mapRooms.length} ห้อง
                    </span>
                    <div className="owner-pa-pager">
                      <button type="button" aria-label="หน้าก่อนหน้า" disabled={mapPage <= 1} onClick={() => setRoomMapPage(mapPage - 1)}>‹</button>
                      {Array.from({ length: mapTotalPages }, (_, index) => index + 1)
                        .filter((pageNumber) => pageNumber === 1 || pageNumber === mapTotalPages || Math.abs(pageNumber - mapPage) <= 1)
                        .map((pageNumber, index, pages) => (
                          <span key={pageNumber} className="owner-pa-pager-item">
                            {index > 0 && pageNumber - pages[index - 1] > 1 && <span className="owner-pa-pager-gap">…</span>}
                            <button
                              type="button"
                              className={pageNumber === mapPage ? 'active' : ''}
                              aria-current={pageNumber === mapPage ? 'page' : undefined}
                              onClick={() => setRoomMapPage(pageNumber)}
                            >
                              {pageNumber}
                            </button>
                          </span>
                        ))}
                      <button type="button" aria-label="หน้าถัดไป" disabled={mapPage >= mapTotalPages} onClick={() => setRoomMapPage(mapPage + 1)}>›</button>
                    </div>
                  </div>
                )}
                <div className="owner-ov-map-actions"><button type="button" className="owner-ov-map-view-all" onClick={() => openRoomList('all')}>ดูทั้งหมด <span aria-hidden="true">›</span></button></div>
              </div>
            </section>

            <section className="owner-ov-lists">
              {[
                {
                  key: 'occupied',
                  title: 'ผู้เข้าพักปัจจุบัน',
                  caption: 'เข้าพักล่าสุดอยู่บนสุด',
                  icon: 'user',
                  unit: 'คน',
                  total: currentOccupants.length,
                  items: recentOccupants,
                  empty: 'ยังไม่มีผู้เข้าพัก',
                  primary: (room) => `${room.first_name || ''} ${room.last_name || ''}`.trim() || 'ไม่ระบุชื่อ',
                  secondary: (room) => `เข้าพัก ${formatDate(room.rental_start_date)}`,
                  side: (room) => room.phone || '-',
                  alert: (room) => (room.status === 'overdue' ? 'ค้างชำระ' : null),
                },
                {
                  key: 'vacant',
                  title: 'ห้องว่าง',
                  caption: 'ว่างล่าสุดอยู่บนสุด',
                  icon: 'door',
                  unit: 'ห้อง',
                  total: vacantRoomsList.length,
                  items: recentVacantRooms,
                  empty: 'ไม่มีห้องว่างในขณะนี้',
                  primary: () => 'พร้อมให้เช่า',
                  secondary: (room) => (room.vacated_at ? `ว่างตั้งแต่ ${formatDate(room.vacated_at)}` : 'ยังไม่เคยมีผู้เช่า'),
                  side: (room) => `฿${formatCurrency(room.price)}`,
                  alert: () => null,
                },
                {
                  key: 'maintenance',
                  title: 'ห้องที่กำลังซ่อม',
                  caption: 'แจ้งซ่อมล่าสุดอยู่บนสุด',
                  icon: 'tool',
                  unit: 'ห้อง',
                  total: maintenanceRoomsList.length,
                  items: recentMaintenanceRooms,
                  empty: 'ไม่มีห้องที่กำลังซ่อมบำรุง',
                  primary: (room) => `${room.first_name || ''} ${room.last_name || ''}`.trim() || 'ไม่มีผู้เช่า',
                  secondary: (room) => (room.maintenance_since ? `แจ้งซ่อม ${formatDate(room.maintenance_since)}` : 'กำลังซ่อมบำรุง'),
                  side: (room) => room.phone || '-',
                  alert: () => null,
                },
              ].map((list) => (
                <div key={list.key} className={`owner-panel owner-ov-list is-${list.key}`}>
                  <div className="owner-ov-list-head">
                    <span className="owner-ov-list-icon" aria-hidden="true">
                      <OwnerListIcon name={list.icon} size={18} />
                    </span>
                    <div className="owner-ov-list-heading">
                      <h3>{list.title}</h3>
                      <small>{list.caption}</small>
                    </div>
                    <div className="owner-ov-list-total">
                      <strong>{list.total}</strong>
                      <small>{list.unit}</small>
                    </div>
                  </div>
                  <div className="owner-ov-list-body">
                    {list.items.length ? (
                      list.items.map((room, index) => {
                        const alert = list.alert(room)
                        const isLatest = index === 0
                        return (
                          <button key={room.room_number} type="button" className={`owner-ov-row${alert ? ' has-alert' : ''}`} onClick={() => handleRoomClick(room)}>
                            <span className="owner-ov-row-room">
                              <small>ห้อง</small>
                              {room.room_number}
                            </span>
                            <span className="owner-ov-row-text">
                              <strong>
                                <span className="owner-ov-row-name">{list.primary(room)}</span>
                                {isLatest && <span className="owner-ov-row-latest">ล่าสุด</span>}
                              </strong>
                              <small>{list.secondary(room)}</small>
                            </span>
                            {alert ? (
                              <span className="owner-ov-row-alert">{alert}</span>
                            ) : (
                              <span className="owner-ov-row-side">{list.side(room)}</span>
                            )}
                            <span className="owner-ov-row-chevron" aria-hidden="true">›</span>
                          </button>
                        )
                      })
                    ) : (
                      <div className="owner-ov-list-empty">
                        <span aria-hidden="true">
                          <OwnerListIcon name={list.icon} size={20} />
                        </span>
                        {list.empty}
                      </div>
                    )}
                  </div>
                  <div className="owner-ov-list-foot">
                    <span className="owner-ov-list-foot-note">แสดง {list.items.length} จาก {list.total} รายการ</span>
                    <button type="button" className="owner-ov-link" onClick={() => openRoomList(list.key)}>
                      ดูทั้งหมด
                      <span aria-hidden="true">›</span>
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {!isLoading && activeTab === 'rooms' && roomsSection === 'occupancy' && (
          <>
            {occupancyTrendChartData.length ? (
              <>
                <section className="owner-panel owner-oc-panel is-blue">
                  <div className="owner-oc-head">
                    <span className="owner-oc-head-icon" aria-hidden="true">
                      <StatIcon name="rooms" />
                    </span>
                    <div className="owner-oc-head-text">
                      <h3>แนวโน้มการเข้าพัก</h3>
                      <p>ห้องที่มีผู้พักเทียบกับห้องว่าง แยกราย{occupancyTrend.granularity === 'day' ? 'วัน' : 'เดือน'}</p>
                    </div>
                    <div className="owner-oc-legend">
                      {OCCUPANCY_TREND_SERIES.map((series) => (
                        <span key={series.key}>
                          <i style={{ background: series.color }} />
                          {series.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="owner-oc-chips">
                    {[
                      { key: 'occupied', tone: 'blue', icon: <OwnerListIcon name="user" size={22} />, label: 'ผู้พัก ณ ช่วงล่าสุด', value: occupancyTrendSummary.currentOccupied },
                      { key: 'vacant', tone: 'green', icon: <OwnerListIcon name="door" size={22} />, label: 'ห้องว่าง ณ ช่วงล่าสุด', value: occupancyTrendSummary.currentVacant },
                      {
                        key: 'change',
                        tone: occupancyTrendSummary.occupiedChange < 0 ? 'red' : 'violet',
                        icon: <StatIcon name="profit" />,
                        label: 'เปลี่ยนแปลงจากช่วงแรก',
                        value: `${occupancyTrendSummary.occupiedChange > 0 ? '+' : ''}${occupancyTrendSummary.occupiedChange}`,
                      },
                      { key: 'capacity', tone: 'slate', icon: <StatIcon name="rooms" />, label: 'ความจุ ณ ช่วงล่าสุด', value: occupancyTrendSummary.totalRooms },
                    ].map((chip) => (
                      <div key={chip.key} className={`owner-oc-chip is-${chip.tone}`}>
                        <span className="owner-oc-chip-icon" aria-hidden="true">{chip.icon}</span>
                        <span className="owner-oc-chip-text">
                          <small>{chip.label}</small>
                          <strong>
                            {chip.value} <em>ห้อง</em>
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className={`owner-oc-chart${isOccupancyTrendLoading ? ' is-loading' : ''}`}>
                    <ResponsiveContainer width="100%" height={280}>
                      {occupancyTrendChartData.length >= 2 ? (
                        <LineChart data={occupancyTrendChartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={36} />
                          <Tooltip content={<OccupancyTrendTooltip />} cursor={{ stroke: '#c7d8f0', strokeWidth: 1 }} />
                          <Line animationDuration={350} type="monotone" dataKey="occupied" name="มีผู้เช่า" stroke={ROOM_OCCUPANCY_COLORS.occupied} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                          <Line animationDuration={350} type="monotone" dataKey="vacant" name="ว่าง" stroke={ROOM_OCCUPANCY_COLORS.vacant} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      ) : (
                        <BarChart data={occupancyTrendChartData} barGap={4} barCategoryGap="40%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={36} />
                          <Tooltip content={<OccupancyTrendTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                          <Bar animationDuration={350} dataKey="occupied" name="มีผู้เช่า" fill={ROOM_OCCUPANCY_COLORS.occupied} radius={[6, 6, 0, 0]} maxBarSize={48} />
                          <Bar animationDuration={350} dataKey="vacant" name="ว่าง" fill={ROOM_OCCUPANCY_COLORS.vacant} radius={[6, 6, 0, 0]} maxBarSize={48} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="owner-panel owner-oc-panel is-green">
                  <div className="owner-oc-head">
                    <span className="owner-oc-head-icon" aria-hidden="true">
                      <StatIcon name="income" />
                    </span>
                    <div className="owner-oc-head-text">
                      <h3>การย้ายเข้า–ออก</h3>
                      <p>จำนวนการเข้าอยู่และย้ายออกในแต่ละ{occupancyTrend.granularity === 'day' ? 'วัน' : 'เดือน'}</p>
                    </div>
                    <div className="owner-oc-totals">
                      <span className="is-in">
                        <small>ย้ายเข้า</small>
                        <strong>{occupancyTrendSummary.moveIns}</strong>
                      </span>
                      <span className="is-out">
                        <small>ย้ายออก</small>
                        <strong>{occupancyTrendSummary.moveOuts}</strong>
                      </span>
                      <span className={occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts < 0 ? 'is-down' : 'is-up'}>
                        <small>สุทธิ</small>
                        <strong>
                          {occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts > 0 ? '+' : ''}
                          {occupancyTrendSummary.moveIns - occupancyTrendSummary.moveOuts}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="owner-oc-legend is-inline">
                    {OCCUPANCY_MOVEMENT_SERIES.map((series) => (
                      <span key={series.key}>
                        <i style={{ background: series.color }} />
                        {series.label}
                      </span>
                    ))}
                  </div>

                  <div className="owner-oc-chart">
                    <ResponsiveContainer width="100%" height={230}>
                      {occupancyTrendChartData.length >= 2 ? (
                        <LineChart data={occupancyTrendChartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={32} />
                          <Tooltip content={<OccupancyMovementTooltip />} cursor={{ stroke: '#c7d8f0', strokeWidth: 1 }} />
                          <Line animationDuration={350} type="monotone" dataKey="moveIns" name="ย้ายเข้า" stroke="#0f9d58" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
                          <Line animationDuration={350} type="monotone" dataKey="moveOuts" name="ย้ายออก" stroke="#d97706" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      ) : (
                        <BarChart data={occupancyTrendChartData} barGap={8} barCategoryGap="40%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="periodLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={32} />
                          <Tooltip content={<OccupancyMovementTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                          <Bar animationDuration={350} dataKey="moveIns" name="ย้ายเข้า" fill="#0f9d58" radius={[6, 6, 0, 0]} maxBarSize={34} />
                          <Bar animationDuration={350} dataKey="moveOuts" name="ย้ายออก" fill="#d97706" radius={[6, 6, 0, 0]} maxBarSize={34} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="owner-panel owner-oc-panel is-violet">
                  <div className="owner-oc-head">
                    <span className="owner-oc-head-icon" aria-hidden="true">
                      <StatIcon name="margin" />
                    </span>
                    <div className="owner-oc-head-text">
                      <h3>รายละเอียดตามช่วงเวลา</h3>
                      <p>คลิกที่แถวเพื่อดูรายชื่อผู้ย้ายเข้า–ออกของช่วงนั้น</p>
                    </div>
                    <span className="owner-oc-count">
                      {occupancyTrendSummary.periodCount} {occupancyTrend.granularity === 'day' ? 'วัน' : 'เดือน'}
                    </span>
                  </div>
                  <div className="owner-table-wrap owner-occupancy-detail-table-wrap">
                    <table className="owner-table owner-occupancy-detail-table owner-oc-table">
                      <colgroup>
                        <col className="is-period" />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col className="is-arrow" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>ช่วงเวลา</th>
                          <th>มีผู้พัก</th>
                          <th>ห้องว่าง</th>
                          <th>ห้องทั้งหมด</th>
                          <th>ย้ายเข้า</th>
                          <th>ย้ายออก</th>
                          <th>อัตราเข้าพัก</th>
                          <th>เปลี่ยนจากช่วงก่อน</th>
                          <th aria-hidden="true" />
                        </tr>
                      </thead>
                      <tbody>
                        {occupancyComparisonRows.map((item) => (
                          <tr
                            key={item.period}
                            className="owner-occupancy-clickable-row"
                            tabIndex={0}
                            aria-label={`ดูรายละเอียดผู้เข้าพักช่วง ${item.periodLabel}`}
                            onClick={() => openOccupancyPeriodDetail(item)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                openOccupancyPeriodDetail(item)
                              }
                            }}
                          >
                            <td>
                              <span className="owner-oc-period">
                                <OwnerListIcon name="calendar" size={14} />
                                {item.periodLabel}
                              </span>
                            </td>
                            {[
                              { key: 'occupied', tone: 'blue', icon: 'user', value: item.occupied, unit: 'ห้อง' },
                              { key: 'vacant', tone: 'green', icon: 'door', value: item.vacant, unit: 'ห้อง' },
                              { key: 'total', tone: 'slate', icon: 'grid', value: item.total, unit: 'ห้อง' },
                              { key: 'in', tone: 'teal', icon: 'moveIn', value: item.moveIns, unit: 'ครั้ง' },
                              { key: 'out', tone: 'orange', icon: 'moveOut', value: item.moveOuts, unit: 'ครั้ง' },
                            ].map((cell) => (
                              <td key={cell.key}>
                                <span className={`owner-oc-cell is-${cell.tone}${cell.value ? '' : ' is-zero'}`}>
                                  <OwnerListIcon name={cell.icon} size={15} />
                                  <strong>{cell.value}</strong>
                                  <small>{cell.unit}</small>
                                </span>
                              </td>
                            ))}
                            <td>
                              {item.total > 0 ? (
                                <span className={`owner-oc-rate ${item.occupancyRate >= 80 ? 'is-high' : item.occupancyRate >= 50 ? 'is-mid' : 'is-low'}`}>
                                  {item.occupancyRate.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="owner-oc-dash">–</span>
                              )}
                            </td>
                            <td>
                              {item.change ? (
                                <span className={`owner-oc-cell is-${item.change > 0 ? 'blue' : 'red'}`}>
                                  <OwnerListIcon name={item.change > 0 ? 'trendUp' : 'trendDown'} size={15} />
                                  <strong>{item.change > 0 ? `+${item.change}` : item.change}</strong>
                                  <small>ห้อง</small>
                                </span>
                              ) : (
                                <span className="owner-oc-dash">–</span>
                              )}
                            </td>
                            <td>
                              <span className="owner-oc-row-more">
                                ดูเพิ่มเติม <span className="owner-oc-row-arrow" aria-hidden="true">›</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <section className="owner-panel owner-oc-panel is-blue">
                <div className="owner-ov-list-empty owner-oc-empty">ยังไม่มีข้อมูลแนวโน้มในช่วงวันที่ที่เลือก</div>
              </section>
            )}
          </>
        )}

        {activeTab === 'utilities' && (
          <OwnerUtilityReceipts key={`${paymentFilter.from}:${paymentFilter.to}`} from={paymentFilter.from} to={paymentFilter.to} {...utilityReceipts} />
        )}

        {!isLoading && activeTab === 'audit' && <OwnerAuditLog />}

        {!isLoading && activeTab === 'announcements' && (
          <AnnouncementBoard
            key={announcementFocus?.nonce ?? 'owner-board'}
            variant="owner"
            announcements={announcements}
            openId={announcementFocus?.id}
            canManage
            apiBase="/api/owner/announcements"
            onChange={loadAnnouncements}
          />
        )}

        {!isLoading && activeTab === 'staff' && (
          <section className="owner-panel owner-staff-panel">
              <div className="owner-panel-header">
                <h3>จัดการพนักงาน</h3>
                <button type="button" className="owner-primary-btn small" onClick={openStaffModal}>
                  + เพิ่มพนักงาน
                </button>
              </div>

                <div className="owner-table-wrap owner-staff-table-wrap">
                  <table className="owner-table">
                    <thead>
                      <tr>
                        <th>ชื่อ-นามสกุล</th>
                        <th>ตำแหน่ง</th>
                        <th>เบอร์</th>
                        <th className="owner-col-status">สถานะ</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStaff.length ? (
                        paginatedStaff.map((member) => (
                          <tr key={`${member.role}-${member.id}`}>
                            <td>{`${member.first_name || ''} ${member.last_name || ''}`.trim() || '-'}</td>
                            <td>{member.role}</td>
                            <td>{member.phone || '-'}</td>
                            <td className="owner-col-status">
                              <span className={`owner-status-badge ${member.is_suspended ? 'disabled' : 'active'}`}>
                                {member.is_suspended ? 'ระงับใช้งาน' : 'ใช้งานปกติ'}
                              </span>
                            </td>
                            <td>
                              <div className="owner-inline-actions">
                                <button type="button" className="owner-action-btn view" onClick={() => setViewingStaff(member)}>
                                  ดูรายละเอียด
                                </button>
                                <button type="button" className="owner-action-btn update" onClick={() => openStaffEditModal(member)}>
                                  แก้ไข
                                </button>
                                <button type="button" className="owner-action-btn update" onClick={() => toggleStaffStatus(member)}>
                                  {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                                </button>
                                <button type="button" className="owner-action-btn delete" onClick={() => deleteStaffMember(member)}>
                                  ลบ
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="owner-empty-row">
                            ไม่มีข้อมูลพนักงาน
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {staffList.length > STAFF_PAGE_SIZE && (
                  <div className="owner-pagination">
                    <button type="button" disabled={clampedStaffPage <= 1} onClick={() => setStaffPage((page) => page - 1)}>
                      ก่อนหน้า
                    </button>
                    <span>
                      หน้า {clampedStaffPage}/{staffTotalPages}
                    </span>
                    <button type="button" disabled={clampedStaffPage >= staffTotalPages} onClick={() => setStaffPage((page) => page + 1)}>
                      ถัดไป
                    </button>
                  </div>
                )}
          </section>
        )}

        {displayStaffModalOpen && (
          <div className={`owner-modal-backdrop${isStaffModalClosing ? ' is-closing' : ''}`} role="presentation" onClick={closeStaffModal}>
            <section className={`owner-modal${isStaffModalClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="staff-modal-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <h3 id="staff-modal-title">{editingStaff ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</h3>
                  <p className="owner-modal-subtext">
                    {editingStaff ? 'แก้ไขรายละเอียดพนักงานคนนี้' : 'กรอกรายละเอียดพนักงานที่ต้องการเพิ่ม'}
                  </p>
                </div>
                <button type="button" className="owner-modal-close" onClick={closeStaffModal} aria-label="ปิดหน้าต่างเพิ่มพนักงาน">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="owner-modal-body">
                <form onSubmit={handleStaffSubmit} className="owner-staff-form">
                  <div className="owner-form-row">
                    <label>
                      ตำแหน่ง
                      <select
                        value={staffForm.role}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, role: event.target.value }))}
                        disabled={Boolean(editingStaff)}
                      >
                        <option value="Staff">Staff</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </label>
                    <label>
                      อายุ
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={staffForm.age}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, age: event.target.value }))}
                        placeholder="25"
                      />
                      {staffErrors.age && <span className="owner-field-error">{staffErrors.age}</span>}
                    </label>
                  </div>

                  <div className="owner-form-row">
                    <label>
                      เลขบัตรประชาชน
                      <input
                        type="text"
                        maxLength={13}
                        value={staffForm.idcard}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, idcard: event.target.value }))}
                        placeholder="13 หลัก"
                        disabled={Boolean(editingStaff)}
                      />
                      {staffErrors.idcard && <span className="owner-field-error">{staffErrors.idcard}</span>}
                    </label>
                    <label>
                      โทรศัพท์
                      <input
                        type="tel"
                        value={staffForm.phone}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="0812345678"
                      />
                      {staffErrors.phone && <span className="owner-field-error">{staffErrors.phone}</span>}
                    </label>
                  </div>

                  <div className="owner-form-row">
                    <label>
                      ชื่อ
                      <input
                        type="text"
                        value={staffForm.first_name}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, first_name: event.target.value }))}
                        placeholder="ชื่อ"
                      />
                    </label>
                    <label>
                      นามสกุล
                      <input
                        type="text"
                        value={staffForm.last_name}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, last_name: event.target.value }))}
                        placeholder="นามสกุล"
                      />
                    </label>
                  </div>

                  <label>
                    {editingStaff ? 'รหัสผ่านใหม่ (ไม่บังคับ)' : 'รหัสผ่าน'}
                    <span className="owner-password-field">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={staffForm.password}
                        onChange={(event) => setStaffForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder={editingStaff ? 'เว้นว่างหากไม่ต้องการเปลี่ยน' : 'อย่างน้อย 6 ตัว'}
                      />
                      <button type="button" className="owner-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                        <span className={`owner-password-icon ${showPassword ? 'is-visible' : ''}`} aria-hidden="true" />
                      </button>
                    </span>
                    {staffErrors.password && <span className="owner-field-error">{staffErrors.password}</span>}
                  </label>

                  <div className="owner-form-actions">
                    <button type="button" className="owner-secondary-btn" onClick={closeStaffModal}>
                      ยกเลิก
                    </button>
                    <button type="submit" className="owner-primary-btn" disabled={isSubmittingStaff}>
                      {isSubmittingStaff
                        ? (editingStaff ? 'กำลังบันทึก...' : 'กำลังเพิ่ม...')
                        : (editingStaff ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน')}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        )}

        {displayViewingStaff && (
          <div className={`owner-modal-backdrop${isViewingStaffClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setViewingStaff(null)}>
            <section className={`owner-modal${isViewingStaffClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="staff-detail-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <span className={`owner-status-badge ${displayViewingStaff.is_suspended ? 'disabled' : 'active'}`}>
                    {displayViewingStaff.role}
                  </span>
                  <h3 id="staff-detail-title">รายละเอียดพนักงาน</h3>
                </div>
                <button type="button" className="owner-modal-close" onClick={() => setViewingStaff(null)} aria-label="ปิดรายละเอียด">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="owner-modal-body">
                <div className="owner-detail-grid">
                  <div>
                    <div className="owner-detail-icon blue" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="3.3" />
                        <path d="M5.5 20c0-3.9 2.9-7 6.5-7s6.5 3.1 6.5 7" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>ชื่อ-นามสกุล</span>
                      <strong>{`${displayViewingStaff.first_name || ''} ${displayViewingStaff.last_name || ''}`.trim() || '-'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon purple" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>เบอร์โทรศัพท์</span>
                      <strong>{displayViewingStaff.phone || '-'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon green" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="3" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>เลขบัตรประชาชน</span>
                      <strong>{displayViewingStaff.idcard || '-'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon amber" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="3" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>อายุ</span>
                      <strong>{displayViewingStaff.age ? `${displayViewingStaff.age} ปี` : '-'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon cyan" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>ตำแหน่ง</span>
                      <strong>{displayViewingStaff.role}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon rose" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2 4 5v6c0 5.25 3.6 9.74 8 11 4.4-1.26 8-5.75 8-11V5l-8-3Z" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>สถานะ</span>
                      <strong>{displayViewingStaff.is_suspended ? 'ระงับใช้งาน' : 'ใช้งานปกติ'}</strong>
                    </div>
                  </div>
                  <div>
                    <div className="owner-detail-icon blue" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="3" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className="owner-detail-text">
                      <span>วันที่เพิ่มเข้าระบบ</span>
                      <strong>{formatDate(displayViewingStaff.created_at)}</strong>
                    </div>
                  </div>
                </div>

                <div className="owner-form-actions">
                  <button
                    type="button"
                    className="owner-primary-btn"
                    onClick={() => {
                      const staffMember = viewingStaff
                      setViewingStaff(null)
                      openStaffEditModal(staffMember)
                    }}
                  >
                    แก้ไขข้อมูล
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {!isLoading && activeTab === 'finance' && financeSection === 'overview' && (
          <>
            <section className="owner-panel owner-fc-panel">
              <div className="owner-panel-header owner-fc-header">
                <span className="owner-fc-heading-icon" aria-hidden="true"><StatIcon name="margin" /></span>
                <div>
                  <h3>เปรียบเทียบรายรับและรายจ่าย</h3>
                  <p className="owner-finance-panel-caption">
                    แสดงผลราย{financeTrends.granularity === 'day' ? 'วัน' : 'เดือน'} พร้อมกำไรสุทธิในช่วงเวลาที่เลือก
                  </p>
                </div>
              </div>

              <div className="owner-finance-chart-legend">
                {FINANCE_TREND_SERIES.map((series) => (
                  <span key={series.key}>
                    <i className="owner-chart-tooltip-dot" style={{ background: series.color }} />
                    {series.label}
                  </span>
                ))}
              </div>

              {trendChartData.length ? (
                <>
                <div className={`owner-linecard-chart owner-finance-trend-chart ${isTrendsLoading ? 'is-loading' : ''}`}>
                  <ResponsiveContainer width="100%" height={340}>
                    {trendChartData.length >= 2 ? (
                      <LineChart data={trendChartData} margin={{ top: 20, right: 24, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={72} tickFormatter={(value) => Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
                        <Tooltip content={<FinanceTrendTooltip />} cursor={{ stroke: '#c7d8f0', strokeWidth: 1 }} />
                        <ReferenceLine y={0} stroke="#d8e2ee" />
                        <Line animationDuration={180} type="monotone" dataKey="income" name="รายรับ" stroke={FINANCE_TREND_COLORS.income} strokeWidth={3} dot={trendChartData.length <= 16 ? { r: 3, strokeWidth: 2, fill: '#fff' } : false} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 3 }} />
                        <Line animationDuration={180} type="monotone" dataKey="expense" name="รายจ่าย" stroke={FINANCE_TREND_COLORS.expense} strokeWidth={3} dot={trendChartData.length <= 16 ? { r: 3, strokeWidth: 2, fill: '#fff' } : false} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 3 }} />
                        <Line animationDuration={180}
                          type="monotone"
                          dataKey="netProfit"
                          name="กำไร/ขาดทุน"
                          stroke={FINANCE_TREND_COLORS.net}
                          strokeWidth={3}
                          strokeDasharray="6 4"
                          dot={trendChartData.length <= 16 ? (props) => (
                            <circle
                              key={`net-dot-${props.payload.period}`}
                              cx={props.cx}
                              cy={props.cy}
                              r={4}
                              fill={props.payload.netProfit < 0 ? '#ef4444' : FINANCE_TREND_COLORS.net}
                              stroke="none"
                            />
                          ) : false}
                          activeDot={{ r: 6, stroke: '#fff', strokeWidth: 3 }}
                        />
                      </LineChart>
                    ) : (
                      <BarChart data={trendChartData} margin={{ top: 20, right: 24, left: 4, bottom: 8 }} barGap={10} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={{ stroke: '#e6f0fd' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b859e' }} axisLine={false} tickLine={false} width={72} tickFormatter={(value) => Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
                        <Tooltip content={<FinanceTrendTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                        <Bar animationDuration={180} dataKey="income" name="รายรับ" fill={FINANCE_TREND_COLORS.income} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar animationDuration={180} dataKey="expense" name="รายจ่าย" fill={FINANCE_TREND_COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar animationDuration={180} dataKey="netProfit" name="กำไร/ขาดทุน" fill={FINANCE_TREND_COLORS.net} radius={[4, 4, 0, 0]} maxBarSize={48}>
                          {trendChartData.map((entry) => (
                            <Cell key={entry.period} fill={entry.netProfit < 0 ? '#ef4444' : FINANCE_TREND_COLORS.net} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>

                <div className="owner-balance-summary owner-fc-balances">
                  {[
                    { key: 'income', icon: 'income', label: 'รายรับรวม', value: trendSummary.totalIncome, tone: 'blue', hint: 'ยอดรับชำระในช่วงที่เลือก' },
                    { key: 'expense', icon: 'expense', label: 'รายจ่ายรวม', value: trendSummary.totalExpense, tone: 'orange', hint: 'ค่าใช้จ่ายในช่วงที่เลือก' },
                    { key: 'net', icon: 'profit', label: trendSummary.totalNet < 0 ? 'ขาดทุนสุทธิ' : 'กำไรสุทธิ', value: Math.abs(trendSummary.totalNet), tone: trendSummary.totalNet < 0 ? 'red' : 'green', hint: 'รายรับรวม − รายจ่ายรวม' },
                    { key: 'average', icon: 'margin', label: `${trendSummary.avgNet < 0 ? 'ขาดทุน' : 'กำไร'}เฉลี่ยต่อ${financeTrends.granularity === 'day' ? 'วัน' : 'เดือน'}`, value: Math.abs(trendSummary.avgNet), tone: trendSummary.avgNet < 0 ? 'red' : 'violet', hint: `เฉลี่ยจาก ${trendSummary.periodCount} ช่วงเวลา` },
                  ].map((item) => (
                    <div key={item.key} className={`owner-fc-balance is-${item.tone}${item.key === 'net' ? ' is-net' : ''}`}>
                      <div className="owner-fc-balance-label"><StatIcon name={item.icon} /><span>{item.label}</span></div>
                      <strong>{currency(item.value)} <small>บาท</small></strong>
                      <p>{item.hint}</p>
                    </div>
                  ))}
                </div>
                <div className="owner-finance-detail">
                  <div className="owner-finance-detail-heading">
                    <span className="owner-fc-detail-icon" aria-hidden="true"><OwnerListIcon name="calendar" size={18} /></span>
                    <div className="owner-fc-detail-title">
                      <h4>รายละเอียดเปรียบเทียบตามช่วงเวลา</h4>
                      <p>ช่วงที่มียอดเงินแสดงก่อน · เรียงล่าสุดก่อน · กดแถวเพื่อดูรายละเอียด</p>
                    </div>
                    <label className="owner-fc-comparison-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg><input type="search" value={financeComparisonSearch} onChange={(event) => { setFinanceComparisonSearch(event.target.value); setFinanceComparisonPage(1) }} placeholder="ค้นหาเดือน ปี หรือยอดเงิน" aria-label="ค้นหารายละเอียดเปรียบเทียบตามช่วงเวลา" /></label>
                    <span className="owner-fc-period-count">{trendSummary.periodCount} {financeTrends.granularity === 'day' ? 'วัน' : 'เดือน'}</span>
                  </div>
                  <div className="owner-table-wrap owner-finance-detail-table-wrap">
                    <table className="owner-table owner-finance-detail-table">
                      <colgroup><col style={{ width: '14%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /></colgroup>
                      <thead>
                        <tr>
                          <th>ช่วงเวลา</th>
                          <th>รายรับ</th>
                          <th>รายจ่าย</th>
                          <th>กำไร/ขาดทุนสุทธิ</th>
                          <th>เปลี่ยนสุทธิจากช่วงก่อน</th>
                          <th>รายจ่ายต่อรายรับ</th>
                          <th>อัตรากำไรสุทธิ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financeComparisonRows.map((item) => {
                          const index = item.originalIndex
                          const income = Number(item.income || 0)
                          const expense = Number(item.expense || 0)
                          const incomeCount = Number(item.incomeCount || 0)
                          const expenseCount = Number(item.expenseCount || 0)
                          const netProfit = income - expense
                          const previous = trendChartData[index - 1]
                          const previousNet = previous ? Number(previous.income || 0) - Number(previous.expense || 0) : null
                          const netChange = previousNet === null ? null : netProfit - previousNet
                          const expenseRatio = income > 0 ? (expense / income) * 100 : null
                          const periodProfitMargin = income > 0 ? (netProfit / income) * 100 : null
                          return (
                            <tr key={item.period} className="owner-fc-clickable" onClick={() => setFinancePeriodDetail(item)}>
                              <td><button type="button" className="owner-fc-period owner-fc-period-button" onClick={(event) => { event.stopPropagation(); setFinancePeriodDetail(item) }} aria-label={`ดูรายละเอียดการเงิน ${item.monthLabel}`}><OwnerListIcon name="calendar" /><strong>{item.monthLabel}</strong></button><small>ดูรายละเอียด ›</small></td>
                              <td className="owner-finance-income-cell">
                                <strong>{formatSignedCurrency(income)}</strong>
                                <small>{incomeCount ? `${incomeCount} รายการ · เฉลี่ย ${formatSignedCurrency(income / incomeCount)}` : 'ไม่มีรายการรับชำระ'}</small>
                              </td>
                              <td className="owner-finance-expense-cell">
                                <strong>{formatSignedCurrency(expense)}</strong>
                                <small>{expenseCount ? `${expenseCount} รายการ · เฉลี่ย ${formatSignedCurrency(expense / expenseCount)}` : 'ไม่มีรายการรายจ่าย'}</small>
                              </td>
                              <td className={netProfit < 0 ? 'owner-finance-loss-cell' : 'owner-finance-profit-cell'}>
                                <span className={`owner-fc-net-value ${netProfit < 0 ? 'is-loss' : netProfit > 0 ? 'is-profit' : 'is-zero'}`}>{formatSignedCurrency(netProfit)}</span>
                              </td>
                              <td className={netChange === null ? '' : netChange < 0 ? 'owner-finance-loss-cell' : 'owner-finance-profit-cell'}>
                                <span className={`owner-fc-delta ${netChange === null || netChange === 0 ? 'is-neutral' : netChange < 0 ? 'is-down' : 'is-up'}`}>{netChange === null ? '—' : `${netChange > 0 ? '↑ +' : netChange < 0 ? '↓ ' : ''}${formatSignedCurrency(netChange)}`}</span>
                              </td>
                              <td><span className={`owner-fc-ratio ${expenseRatio === null ? 'is-neutral' : expenseRatio > 100 ? 'is-negative' : 'is-positive'}`}>{expenseRatio === null ? 'ไม่มีรายรับ' : formatPercent(expenseRatio)}</span></td>
                              <td><span className={`owner-fc-ratio ${periodProfitMargin === null ? 'is-neutral' : periodProfitMargin < 0 ? 'is-negative' : 'is-positive'}`}>{periodProfitMargin === null ? 'ไม่มีรายรับ' : formatPercent(periodProfitMargin)}</span></td>
                            </tr>
                          )
                        })}
                        {!financeComparisonRows.length && <tr><td colSpan={7} className="owner-fc-search-empty"><span>ไม่พบช่วงเวลาที่ตรงกับคำค้นหา</span></td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="owner-fc-table-footer">
                    <span>แสดง {financeComparisonFiltered.length ? financeComparisonOffset + 1 : 0}–{Math.min(financeComparisonOffset + financeComparisonPageSize, financeComparisonFiltered.length)} จาก {financeComparisonFiltered.length} ช่วงเวลา</span>
                    <div className="owner-pa-pager">
                      <button type="button" aria-label="หน้าก่อนหน้า" disabled={financeComparisonCurrentPage <= 1} onClick={() => setFinanceComparisonPage(financeComparisonCurrentPage - 1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
                      <span>{financeComparisonCurrentPage} / {financeComparisonPages}</span>
                      <button type="button" aria-label="หน้าถัดไป" disabled={financeComparisonCurrentPage >= financeComparisonPages} onClick={() => setFinanceComparisonPage(financeComparisonCurrentPage + 1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
                    </div>
                  </div>
                </div>
                </>
              ) : (
                <div className="owner-empty">ยังไม่มีข้อมูลแนวโน้มย้อนหลัง</div>
              )}
            </section>


            <OwnerIncomeTypeCards summary={incomeSummary} range={{ ...paymentFilter, ...selectedPeriod }} />

          </>
        )}

        {!isLoading && activeTab === 'finance' && financeSection === 'expenses' && (
          <OwnerExpenseLedger range={paymentFilter} version={expenses} onEdit={openExpenseEdit} onDelete={setExpenseDeleteConfirm} />
        )}

        {!isLoading && activeTab === 'finance' && financeSection === 'payments' && (
            <section className="owner-panel">
              <div className="owner-panel-header">
                <h3>บันทึกการชำระเงิน</h3>
              </div>

              <section className="owner-slip-review-panel">
                <div className="owner-slip-review-heading">
                  <div>
                    <h4>สลิปที่รอตรวจสอบ</h4>
                    <p>{pendingSlipReviews.length ? `มี ${pendingSlipReviews.length} รายการที่ต้องตรวจสอบ` : 'ไม่มีสลิปที่รอตรวจสอบ'}</p>
                  </div>
                  <button type="button" className="owner-slip-refresh" onClick={() => loadPendingSlipReviews().catch(() => setMessage('danger', 'โหลดรายการสลิปไม่สำเร็จ'))}>รีเฟรช</button>
                </div>
                {pendingSlipReviews.length ? (
                  <div className="owner-slip-review-list">
                    {pendingSlipReviews.map((payment) => (
                      <article className="owner-slip-review-item" key={payment.id}>
                        <button type="button" className="owner-slip-review-image" onClick={() => openPaymentSlip(payment)} aria-label={`ดูสลิปห้อง ${payment.room_number}`}>
                          <UploadImage src={payment.slip_path} alt="สลิปโอนเงิน" />
                          <span>ดูสลิป</span>
                        </button>
                        <div className="owner-slip-review-info">
                          <strong>ห้อง {payment.room_number} · {payment.first_name} {payment.last_name}</strong>
                          <span>{payment.payment_types?.split(',').map(formatPaymentType).join(' / ') || 'รายการชำระเงิน'} · {payment.phone || 'ไม่มีเบอร์โทร'}</span>
                          <b>฿{formatCurrency(payment.amount)}</b>
                        </div>
                        <div className="owner-slip-review-actions">
                          <button type="button" className="owner-slip-reject" disabled={reviewingSlipId === payment.id} onClick={() => reviewOwnerPaymentSlip(payment, 'rejected')}>ปฏิเสธ</button>
                          <button type="button" className="owner-slip-approve" disabled={reviewingSlipId === payment.id} onClick={() => reviewOwnerPaymentSlip(payment, 'approved')}>{reviewingSlipId === payment.id ? 'กำลังบันทึก…' : 'อนุมัติสลิป'}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>

              <label className="owner-search-standalone">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={paymentLogFilter.search}
                  onChange={(event) => handlePaymentLogFilterChange('search', event.target.value)}
                  placeholder="ค้นหาห้อง / ลูกค้า / หมายเหตุ"
                />
              </label>

              <div className="owner-filter-box">
                <div className="owner-filter-row">
                  <label className="owner-date-field">
                    จาก
                    <ThaiDatePicker
                      value={paymentLogFilter.from}
                      onChange={(value) => handlePaymentLogFilterChange('from', value)}
                      maxDate={parseInputDate(paymentLogFilter.to)}
                      isClearable
                    />
                  </label>
                  <label className="owner-date-field">
                    ถึง
                    <ThaiDatePicker
                      value={paymentLogFilter.to}
                      onChange={(value) => handlePaymentLogFilterChange('to', value)}
                      minDate={parseInputDate(paymentLogFilter.from)}
                      isClearable
                    />
                  </label>
                  <label className="owner-search-box">
                    สถานะการชำระ
                    <select
                      value={paymentLogFilter.onlyOverdue ? 'overdue' : 'all'}
                      onChange={(event) => handlePaymentLogFilterChange('onlyOverdue', event.target.value === 'overdue')}
                    >
                      <option value="all">ทั้งหมด</option>
                      <option value="overdue">แสดงเฉพาะที่ค้างชำระ</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="owner-table-wrap">
                <table className="owner-table">
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>ลูกค้า</th>
                      <th>ห้อง</th>
                      <th>ประเภท</th>
                      <th>จำนวน</th>
                      <th className="owner-col-status">สถานะ</th>
                      <th>หมายเหตุ</th>
                      <th>สลิป</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentLogs.payments?.length ? (
                      paymentLogs.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{formatDate(payment.payment_date)}</td>
                          <td>{`${payment.first_name || ''} ${payment.last_name || ''}`.trim() || '-'}</td>
                          <td>{payment.room_number || '-'}</td>
                          <td>{payment.type ? formatPaymentType(payment.type) : '-'}</td>
                          <td>฿{formatCurrency(payment.amount)}</td>
                          <td className="owner-col-status">
                            <span className={`owner-status-badge ${payment.status === 'paid' ? 'active' : payment.status === 'pending' ? 'pending' : 'disabled'}`}>
                              {payment.status === 'paid' ? 'ชำระแล้ว' : payment.status === 'pending' ? 'รอชำระ' : payment.status}
                            </span>
                          </td>
                          <td>
                            {payment.status === 'paid' && payment.slip_path && payment.note?.includes('รอตรวจสอบสลิป')
                              ? 'ตรวจสอบสลิปแล้ว'
                              : payment.note || '-'}
                          </td>
                          <td>
                            {payment.slip_path ? (
                              <div className="owner-payment-slip-cell">
                                <button
                                  type="button"
                                  className="owner-view-slip-btn"
                                  onClick={() => openPaymentSlip(payment)}
                                >
                                  <span>ดูสลิป</span>
                                </button>
                                {payment.status === 'pending' && (
                                  <div className="owner-payment-review-actions">
                                    <button type="button" className="owner-payment-reject" disabled={reviewingSlipId === (payment.payment_id ?? payment.id)} onClick={() => reviewOwnerPaymentSlip(payment, 'rejected')}>ปฏิเสธ</button>
                                    <button type="button" className="owner-payment-approve" disabled={reviewingSlipId === (payment.payment_id ?? payment.id)} onClick={() => reviewOwnerPaymentSlip(payment, 'approved')}>อนุมัติ</button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="owner-no-slip">ไม่มีสลิป</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="owner-empty-row">
                          ไม่มีข้อมูลบันทึกการชำระเงิน
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="owner-pagination">
                <button type="button" disabled={paymentPage <= 1} onClick={() => loadPaymentLogs(paymentPage - 1)}>
                  ก่อนหน้า
                </button>
                <span>
                  หน้า {paymentPage}/{totalPaymentPages}
                </span>
                <button type="button" disabled={paymentPage >= totalPaymentPages} onClick={() => loadPaymentLogs(paymentPage + 1)}>
                  ถัดไป
                </button>
              </div>
            </section>

        )}

        {occupancyLogId !== null && <OwnerOccupancyLogDialog key={occupancyLogId} eventId={occupancyLogId} onClose={() => setOccupancyLogId(null)} />}
        {financePeriodDetail && <OwnerFinancePeriodDialog key={financePeriodDetail.period} period={financePeriodDetail} range={paymentFilter} onClose={() => setFinancePeriodDetail(null)} />}

        {occupancyPeriodDetail && (() => {
          const detailItem = occupancyPeriodDetail.item
          const detailLogs = occupancyPeriodDetail.logs || []
          const periodKeyword = periodDetailSearch.trim().toLowerCase()
          const searchedLogs = detailLogs.filter((log) => !periodKeyword || [log.room_number, `${log.first_name || ''} ${log.last_name || ''}`, log.phone, log.note, log.event_date, log.event_type === 'move_in' ? 'ย้ายเข้า' : 'ย้ายออก'].filter(Boolean).join(' ').toLowerCase().includes(periodKeyword))
          const visibleLogs = periodDetailFilter === 'all' ? searchedLogs : searchedLogs.filter((log) => log.event_type === periodDetailFilter)
          const summaryChips = [
            { key: 'occupied', tone: 'blue', icon: 'user', label: 'มีผู้พัก', value: detailItem.occupied, unit: 'ห้อง' },
            { key: 'vacant', tone: 'green', icon: 'door', label: 'ห้องว่าง', value: detailItem.vacant, unit: 'ห้อง' },
            { key: 'in', tone: 'teal', icon: 'moveIn', label: 'ย้ายเข้า', value: detailItem.moveIns, unit: 'ครั้ง' },
            { key: 'out', tone: 'orange', icon: 'moveOut', label: 'ย้ายออก', value: detailItem.moveOuts, unit: 'ครั้ง' },
          ]
          const filterChips = [
            { key: 'all', label: 'ทั้งหมด', count: searchedLogs.length },
            { key: 'move_in', label: 'ย้ายเข้า', count: searchedLogs.filter((log) => log.event_type === 'move_in').length },
            { key: 'move_out', label: 'ย้ายออก', count: searchedLogs.filter((log) => log.event_type === 'move_out').length },
          ]
          return (
            <div className="owner-modal-backdrop" role="presentation" onClick={() => setOccupancyPeriodDetail(null)}>
              <section className="owner-modal owner-pdx-modal" role="dialog" aria-modal="true" aria-labelledby="owner-occupancy-period-title" onClick={(event) => event.stopPropagation()}>
                <div className="owner-modal-header">
                  <span className="owner-modal-header-icon" aria-hidden="true">
                    <OwnerListIcon name="calendar" size={18} />
                  </span>
                  <div>
                    <h3 id="owner-occupancy-period-title">รายละเอียดผู้เข้าพัก · {detailItem.periodLabel}</h3>
                    <p className="owner-modal-subtext">รายการย้ายเข้าและย้ายออกในช่วงเวลานี้</p>
                  </div>
                  <button type="button" className="owner-modal-close" onClick={() => setOccupancyPeriodDetail(null)} aria-label="ปิดรายละเอียด">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="owner-pdx-top">
                  <div className="owner-pdx-summary">
                    {summaryChips.map((chip) => (
                      <div key={chip.key} className={`owner-oc-chip is-${chip.tone}`}>
                        <span className="owner-oc-chip-icon" aria-hidden="true">
                          <OwnerListIcon name={chip.icon} size={22} />
                        </span>
                        <span className="owner-oc-chip-text">
                          <small>{chip.label}</small>
                          <strong>
                            {chip.value} <em>{chip.unit}</em>
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="owner-pdx-toolbar">
                  <div className="owner-pdx-filters" role="group" aria-label="กรองประเภทรายการ">
                    {filterChips.map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        className={`owner-roomlist-filter${periodDetailFilter === chip.key ? ' active' : ''}`}
                        aria-pressed={periodDetailFilter === chip.key}
                        onClick={() => setPeriodDetailFilter(chip.key)}
                      >
                        {chip.label}
                        <span>{chip.count}</span>
                      </button>
                    ))}
                  </div>
                  <label className="owner-pdx-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg><input type="search" value={periodDetailSearch} onChange={(event) => setPeriodDetailSearch(event.target.value)} aria-label="ค้นหารายละเอียดผู้เข้าพัก" placeholder="ค้นหาชื่อ ห้อง เบอร์โทร หรือหมายเหตุ" disabled={occupancyPeriodDetail.loading} /></label>
                  </div>
                </div>

                <div className="owner-modal-body owner-pdx-body">
                  {occupancyPeriodDetail.loading ? (
                    <div className="owner-ov-list-empty owner-pdx-state">กำลังโหลดรายละเอียด...</div>
                  ) : visibleLogs.length ? (
                    <div className="owner-pdx-list">
                      {visibleLogs.map((log) => {
                        const isIn = log.event_type === 'move_in'
                        const name = `${log.first_name || ''} ${log.last_name || ''}`.trim() || 'ไม่ระบุชื่อ'
                        const eventDate = log.event_date ? new Date(log.event_date) : null
                        return (
                          <article
                            key={log.id}
                            className={`owner-pdx-item ${isIn ? 'is-in' : 'is-out'}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`ดูรายละเอียดห้อง ${log.room_number || ''} ของ ${name}`}
                            onClick={() => openPeriodLogRoom(log)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                openPeriodLogRoom(log)
                              }
                            }}
                          >
                            <div className="owner-pdx-item-row">
                              <span className="owner-pdx-item-icon" aria-hidden="true">
                                <OwnerListIcon name={isIn ? 'moveIn' : 'moveOut'} size={18} />
                              </span>
                              <div className="owner-pdx-item-main">
                                <div className="owner-pdx-item-top">
                                  <strong>{name}</strong>
                                  <span className="owner-pdx-item-type">{isIn ? 'ย้ายเข้า' : 'ย้ายออก'}</span>
                                </div>
                                <div className="owner-pdx-item-meta">
                                  <span>
                                    <OwnerListIcon name="door" size={13} />
                                    ห้อง {log.room_number || '-'}
                                  </span>
                                  <span>
                                    <OwnerListIcon name="phone" size={13} />
                                    {log.phone || 'ไม่มีเบอร์'}
                                  </span>
                                </div>
                              </div>
                              <div className="owner-pdx-item-date">
                                {eventDate && !Number.isNaN(eventDate.getTime()) ? (
                                  <>
                                    <strong>{eventDate.getDate()}</strong>
                                    <small>{eventDate.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })}</small>
                                  </>
                                ) : (
                                  <small>ไม่ระบุวันที่</small>
                                )}
                              </div>
                              <span className="owner-pdx-item-chevron" aria-hidden="true">›</span>
                            </div>
                            {log.note && (
                              <div className="owner-pdx-item-note">
                                <OwnerListIcon name="note" size={15} />
                                <p>{log.note}</p>
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="owner-ov-list-empty owner-pdx-state">
                      {periodKeyword ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : detailLogs.length ? 'ไม่มีรายการประเภทนี้ในช่วงเวลานี้' : 'ไม่มีรายการย้ายเข้า–ออกในช่วงเวลานี้'}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )
        })()}

        {viewingPaymentSlip && (
          <div className="payment-slip-overlay" role="presentation" onClick={closePaymentSlip}>
            <section className="payment-slip-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-payment-slip-title" onClick={(event) => event.stopPropagation()}>
              <header className="payment-slip-header">
                <div className="payment-slip-heading">
                  <span className="payment-slip-heading-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                      <path d="M9 7h6M9 11h6M9 15h4" />
                    </svg>
                  </span>
                  <h3 id="owner-payment-slip-title">สลิปโอนเงิน</h3>
                  <span className="payment-slip-room">ห้อง {viewingPaymentSlip.room_number || '-'}</span>
                </div>
                <button type="button" className="payment-slip-close" onClick={closePaymentSlip} aria-label="ปิด">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </header>
              <div className="payment-slip-body">
                <div className="payment-slip-image-frame">
                  <button type="button" className="payment-slip-image-btn" onClick={() => setPaymentSlipZoomOpen(true)} title="คลิกเพื่อดูรูปขนาดเต็ม">
                    <UploadImage src={viewingPaymentSlip.slip_path} alt="สลิปโอนเงิน" />
                  </button>
                  <span className="payment-slip-image-hint">คลิกที่รูปเพื่อดูขนาดเต็ม</span>
                </div>
                <dl className="payment-slip-details">
                  <div className="payment-slip-amount">
                    <dt>จำนวนเงิน</dt>
                    <dd>฿{formatCurrency(viewingPaymentSlip.amount)}</dd>
                  </div>
                  <div><dt>ผู้เช่า</dt><dd>{viewingPaymentSlip.tenantName || `${viewingPaymentSlip.first_name || ''} ${viewingPaymentSlip.last_name || ''}`.trim() || '-'}</dd></div>
                  <div><dt>รายการ</dt><dd>{viewingPaymentSlip.payment_types?.split(',').map(formatPaymentType).join(', ') || formatPaymentType(viewingPaymentSlip.type) || 'ค่าเช่าห้อง'}</dd></div>
                  <div><dt>สถานะ</dt><dd>{viewingPaymentSlip.status === 'paid' ? 'ชำระแล้ว' : viewingPaymentSlip.status === 'pending' ? 'รอตรวจสอบ' : viewingPaymentSlip.status || '-'}</dd></div>
                  <div><dt>วันที่</dt><dd>{new Date(viewingPaymentSlip.created_at || viewingPaymentSlip.payment_date).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
                </dl>
              </div>
              <footer className="payment-slip-footer">
                <OwnerSlipDownloadButton url={viewingPaymentSlip.slip_path} fileName={`slip-room-${viewingPaymentSlip.room_number || 'unknown'}-${viewingPaymentSlip.payment_id || viewingPaymentSlip.id || 'payment'}`} />
              </footer>
            </section>
          </div>
        )}
        {viewingPaymentSlip && paymentSlipZoomOpen && (
          <PhotoLightbox
            photos={[{ name: `สลิปห้อง ${viewingPaymentSlip.room_number || '-'}`, url: viewingPaymentSlip.slip_path }]}
            title="สลิปโอนเงิน"
            subtitle={`ห้อง ${viewingPaymentSlip.room_number || '-'} · ${viewingPaymentSlip.tenantName || `${viewingPaymentSlip.first_name || ''} ${viewingPaymentSlip.last_name || ''}`.trim() || 'ไม่ระบุชื่อผู้เช่า'}`}
            label="สลิปโอนเงิน"
            onClose={() => setPaymentSlipZoomOpen(false)}
          />
        )}


        {displayExpenseEditModal && (
          <div className={`owner-modal-backdrop${isExpenseEditClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setExpenseEditModal(null)}>
            <section className={`owner-modal owner-xe-dialog${isExpenseEditClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="expense-edit-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header owner-xe-header">
                <span className="owner-xe-header-icon" style={{ color: expenseCategoryStyle(expenseEditForm.category).color, background: expenseCategoryStyle(expenseEditForm.category).bg }}><ExpenseCategoryIcon category={expenseEditForm.category} size={20} /></span>
                <div>
                  <h3 id="expense-edit-title">แก้ไขรายจ่าย</h3>
                  <p className="owner-modal-subtext">รายการ #{displayExpenseEditModal.id} · บันทึกโดย {displayExpenseEditModal.recorded_by_name || 'เจ้าของหอพัก'}</p>
                </div>
                <button type="button" className="owner-modal-close" onClick={() => setExpenseEditModal(null)} aria-label="ปิดหน้าต่างแก้ไขรายจ่าย">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <form className="owner-xe-form" onSubmit={(event) => submitExpenseEdit(event, () => setExpenseEditModal(null))}>
                <div className="owner-modal-body owner-xe-body">
                  {expenseEditFormError && <div className="owner-xe-error" role="alert">{expenseEditFormError}</div>}
                  <section className="owner-xe-section">
                    <h4>หมวดหมู่ <em>จำเป็น</em></h4>
                    <div className="owner-xe-chips">
                      {Object.keys(EXPENSE_CATEGORY_STYLES).concat('อื่นๆ').map((name) => {
                        const style = expenseCategoryStyle(name)
                        const active = expenseEditForm.category === name
                        return (
                          <button key={name} type="button" className={`owner-xe-chip${active ? ' is-active' : ''}`} style={{ '--xl-color': style.color, '--xl-bg': style.bg }} aria-pressed={active} onClick={() => setExpenseEditForm((prev) => ({ ...prev, category: prev.category === name ? '' : name }))} title={active ? 'กดอีกครั้งเพื่อยกเลิก' : undefined}>
                            <ExpenseCategoryIcon category={name} size={14} />{name}
                          </button>
                        )
                      })}
                    </div>
                    <input className="owner-xe-input" type="text" maxLength={50} value={expenseEditForm.category} onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="หรือพิมพ์ชื่อหมวดหมู่เอง" aria-label="หมวดหมู่" />
                  </section>
                  <div className="owner-xe-grid">
                    <label className="owner-xe-field">
                      <span>จำนวนเงิน <em>จำเป็น</em></span>
                      <span className="owner-xe-amount"><b>฿</b><input type="number" step="0.01" min="0" inputMode="decimal" value={expenseEditForm.amount} onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, amount: event.target.value }))} placeholder="0.00" /></span>
                    </label>
                    <label className="owner-xe-field">
                      <span>วันที่จ่าย <em>จำเป็น</em></span>
                      <ThaiDatePicker className="owner-xe-input owner-xe-date" value={expenseEditForm.expense_date} onChange={(date) => setExpenseEditForm((prev) => ({ ...prev, expense_date: date }))} />
                    </label>
                  </div>
                  <label className="owner-xe-field">
                    <span>รายละเอียด</span>
                    <textarea className="owner-xe-input" rows={2} maxLength={255} value={expenseEditForm.description} onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="เช่น ซ่อมก๊อกน้ำห้อง 204" />
                  </label>
                  <section className="owner-xe-section">
                    <h4>ชำระโดย</h4>
                    <div className="owner-xe-methods" role="radiogroup" aria-label="ชำระโดย">
                      {[['', 'ไม่ระบุ'], ...Object.entries(EXPENSE_METHOD_LABELS)].map(([key, label]) => (
                        <button key={key || 'none'} type="button" role="radio" aria-checked={expenseEditForm.payment_method === key} className={expenseEditForm.payment_method === key ? 'is-active' : ''} onClick={() => setExpenseEditForm((prev) => ({ ...prev, payment_method: key }))}>{label}</button>
                      ))}
                    </div>
                  </section>
                  <div className="owner-xe-grid is-three">
                    <label className="owner-xe-field">
                      <span>ร้านค้า / ผู้รับเงิน</span>
                      <input className="owner-xe-input" type="text" maxLength={120} value={expenseEditForm.vendor} onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, vendor: event.target.value }))} placeholder="ไม่ระบุ" />
                    </label>
                    <label className="owner-xe-field">
                      <span>เลขที่ใบเสร็จ</span>
                      <input className="owner-xe-input" type="text" maxLength={60} value={expenseEditForm.receipt_number} onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, receipt_number: event.target.value }))} placeholder="ไม่ระบุ" />
                    </label>
                    <label className="owner-xe-field">
                      <span>ห้องที่เกี่ยวข้อง</span>
                      <input className="owner-xe-input" type="text" inputMode="numeric" maxLength={3} value={expenseEditForm.room_number} onChange={(event) => setExpenseEditForm((prev) => ({ ...prev, room_number: event.target.value.replace(/\D/g, '') }))} placeholder="เช่น 204" />
                    </label>
                  </div>
                </div>
                <footer className="owner-xe-footer">
                  <button type="button" className="owner-xl-btn is-ghost" onClick={() => setExpenseEditModal(null)}>ยกเลิก</button>
                  <button type="submit" className="owner-xl-btn is-primary" disabled={isExpenseEditSubmitting}>{isExpenseEditSubmitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {displayExpenseDeleteConfirm && (
          <div className={`owner-modal-backdrop${isExpenseDeleteClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setExpenseDeleteConfirm(null)}>
            <section className={`owner-modal owner-xd-dialog${isExpenseDeleteClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="expense-delete-title" onClick={(event) => event.stopPropagation()}>
              <div className="owner-modal-header">
                <div>
                  <h3 id="expense-delete-title">ยืนยันการลบรายจ่าย</h3>
                </div>
                <button type="button" className="owner-modal-close" onClick={() => setExpenseDeleteConfirm(null)} aria-label="ปิด">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="owner-modal-body">
                <div className="owner-confirm-body">
                  <div className="owner-confirm-icon is-danger">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </div>
                  <p className="owner-confirm-message">
                    ต้องการลบรายจ่าย <strong>"{displayExpenseDeleteConfirm.category}"</strong>
                    <br />
                    จำนวน <strong>฿{formatCurrency(displayExpenseDeleteConfirm.amount)}</strong> ใช่หรือไม่?
                  </p>
                  <p className="owner-confirm-note">รายการจะถูกซ่อนจากรายจ่ายและยอดสรุป แต่ยังเก็บประวัติไว้ในระบบพร้อมชื่อผู้ลบ</p>
                  <div className="owner-form-actions">
                    <button type="button" className="owner-secondary-btn" onClick={() => setExpenseDeleteConfirm(null)}>
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      className="owner-danger-btn"
                      onClick={() => confirmDeleteExpenseRecord(() => setExpenseDeleteConfirm(null))}
                    >
                      ลบรายจ่าย
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {!isLoading && ['moveouts', 'requests', 'maintenance'].includes(activeTab) && (
          <section className="owner-panel">
            <div className="owner-panel-header">
              <h3>{OWNER_TABS.find((tab) => tab.key === activeTab)?.label}</h3>
            </div>
            <div className="owner-empty">กำลังพัฒนาฟีเจอร์นี้ เร็ว ๆ นี้</div>
          </section>
        )}

        {!isLoading && activeTab === 'rooms' && roomsSection === 'logs' && (
          <>
            <section className="owner-panel owner-olog-panel">
              <div className="owner-panel-header">
                <h3 className="owner-olog-heading"><OwnerListIcon name="calendar" size={20} />บันทึกการเข้าพักและย้ายออก</h3>
              </div>

              <div className="owner-filter-box">
                <div className="owner-filter-row owner-occupancy-filter-row">
                  <label className="owner-search-standalone">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={occupancyFilter.search}
                      onChange={(event) => handleOccupancyFilterChange('search', event.target.value)}
                      placeholder="ค้นหาห้อง / ผู้เข้าพัก"
                    />
                  </label>
                  <label className="owner-search-box">
                    ประเภทเหตุการณ์
                    <select
                      value={occupancyFilter.type}
                      onChange={(event) => handleOccupancyFilterChange('type', event.target.value)}
                    >
                      {OCCUPANCY_TYPE_FILTERS.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="owner-table-wrap owner-olog-table-wrap">
                <table className="owner-olog-table"><colgroup><col style={{width:'15%'}} /><col style={{width:'12%'}} /><col style={{width:'8%'}} /><col style={{width:'19%'}} /><col style={{width:'15%'}} /><col style={{width:'20%'}} /><col style={{width:'11%'}} /></colgroup>
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>เหตุการณ์</th>
                      <th>ห้อง</th>
                      <th>ผู้เข้าพัก</th>
                      <th>เบอร์โทร</th>
                      <th>หมายเหตุ</th>
                      <th><span className="visually-hidden">รายละเอียด</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {occupancyLogs.logs?.length ? (
                      occupancyLogs.logs.map((log) => (
                        <tr key={log.id} className="owner-olog-row" onClick={() => setOccupancyLogId(log.id)}>
                          <td><span className="owner-il-date"><OwnerListIcon name="calendar" /><strong>{formatDate(log.event_date)}</strong></span><span className="owner-il-id">{log.id}</span></td>
                          <td className="owner-col-status">
                            <span className={`owner-olog-event ${log.event_type === 'move_in' ? 'is-in' : 'is-out'}`}><OwnerListIcon name={log.event_type === 'move_in' ? 'moveIn' : 'moveOut'} size={13} />
                              {formatOccupancyEventType(log.event_type)}
                            </span>
                          </td>
                          <td><span className="owner-il-room">{log.room_number || '—'}</span></td>
                          <td><span className="owner-olog-name"><OwnerListIcon name="user" size={15} /><strong>{`${log.first_name || ''} ${log.last_name || ''}`.trim() || 'ไม่ระบุชื่อ'}</strong></span></td>
                          <td><span className="owner-olog-phone"><OwnerListIcon name="phone" size={13} />{log.phone || 'ไม่ระบุ'}</span></td>
                          <td><span className={`owner-il-note${log.note ? '' : ' is-empty'}`}>{log.note || 'ไม่มีหมายเหตุ'}</span></td>
                          <td><button type="button" className="owner-ur-view" onClick={(event) => { event.stopPropagation(); setOccupancyLogId(log.id) }}>รายละเอียด ›</button></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="owner-empty-row">
                          ไม่มีข้อมูลการเข้าพักหรือย้ายออก
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="owner-pagination">
                <button type="button" disabled={occupancyPage <= 1} onClick={() => loadOccupancyLogs(occupancyPage - 1)}>
                  ก่อนหน้า
                </button>
                <span>
                  หน้า {occupancyPage}/{totalOccupancyPages}
                </span>
                <button type="button" disabled={occupancyPage >= totalOccupancyPages} onClick={() => loadOccupancyLogs(occupancyPage + 1)}>
                  ถัดไป
                </button>
              </div>
            </section>
          </>
        )}

        {(
          <>

            {displayRoomDetail && (() => {
              const detailRoom = displayRoomDetail.room
              const detailTenant = displayRoomDetail.tenant
              const detailStatus = detailRoom.status || (detailTenant ? 'occupied' : 'vacant')
              const tenantName = detailTenant ? `${detailTenant.first_name || ''} ${detailTenant.last_name || ''}`.trim() : ''
              const contractStart = detailRoom.rental_start_date ? new Date(detailRoom.rental_start_date).getTime() : null
              const contractEnd = detailRoom.rental_end_date ? new Date(detailRoom.rental_end_date).getTime() : null
              const hasContract = Boolean(contractStart && contractEnd && contractEnd > contractStart)
              const contractMonths = hasContract ? Math.max(1, Math.round((contractEnd - contractStart) / (86400000 * 30.44))) : 0
              const contractDaysLeft = contractEnd ? Math.ceil((contractEnd - roomDetailOpenedAt) / 86400000) : null
              const contractTone = contractDaysLeft === null ? 'normal' : contractDaysLeft <= 0 ? 'expired' : contractDaysLeft <= 30 ? 'warning' : 'normal'
              const infoTiles = [
                { key: 'start', tone: 'green', label: 'วันเริ่มสัญญา', value: formatDate(detailRoom.rental_start_date) },
                { key: 'end', tone: 'amber', label: 'วันสิ้นสุดสัญญา', value: formatDate(detailRoom.rental_end_date) },
                { key: 'rent', tone: 'blue', label: 'ค่าเช่ารายเดือน', value: `฿${formatCurrency(detailRoom.price)}` },
                { key: 'deposit', tone: 'violet', label: 'เงินมัดจำ', value: detailTenant ? `฿${formatCurrency(detailTenant.deposit_amount)}` : '-' },
              ]
              return (
                <div className={`owner-modal-backdrop${isRoomDetailClosing ? ' is-closing' : ''}`} role="presentation" onClick={closeRoomDetail}>
                  <section className={`owner-modal owner-rd-modal${isRoomDetailClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-detail-title" onClick={(event) => event.stopPropagation()}>
                    <div className="owner-modal-header">
                      <div>
                        <h3 id="room-detail-title">รายละเอียดห้องพัก</h3>
                        <p className="owner-modal-subtext">ข้อมูลผู้เช่า สัญญา และประวัติการชำระเงิน</p>
                      </div>
                      <button type="button" className="owner-modal-close" onClick={closeRoomDetail} aria-label="ปิดรายละเอียด">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                          <line x1="6" y1="6" x2="18" y2="18" />
                          <line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      </button>
                    </div>
                    <div className="owner-modal-body">
                      <div className={`owner-rd-hero is-${detailStatus}`}>
                        <span className="owner-rd-room">
                          <small>ห้อง</small>
                          <strong>{detailRoom.room_number}</strong>
                        </span>
                        <div className="owner-rd-hero-text">
                          {detailTenant ? (
                            <>
                              <strong>{tenantName || 'ไม่ระบุชื่อ'}</strong>
                              <span className="owner-rd-hero-meta">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                                </svg>
                                {detailTenant.phone || '-'}
                              </span>
                            </>
                          ) : (
                            <>
                              <strong>ห้องว่าง</strong>
                              <span className="owner-rd-hero-meta">พร้อมให้เช่า ฿{formatCurrency(detailRoom.price)}/เดือน</span>
                            </>
                          )}
                        </div>
                        <span className={`owner-rd-status is-${detailStatus}`}>{ROOM_STATUS_LABELS[detailStatus] || 'มีผู้เช่า'}</span>
                      </div>

                      {isRoomDetailLoading ? (
                        <div className="owner-loading-box">กำลังโหลดรายละเอียดห้อง...</div>
                      ) : (
                        <>
                          <div className="owner-rd-tiles">
                            {infoTiles.map((tile) => (
                              <div key={tile.key} className={`owner-rd-tile is-${tile.tone}`}>
                                <span>{tile.label}</span>
                                <strong>{tile.value}</strong>
                              </div>
                            ))}
                          </div>

                          {detailTenant && hasContract && (
                            <div className={`owner-rd-contract is-${contractTone}`}>
                              <div className="owner-rd-contract-info">
                                <span className="owner-rd-contract-icon" aria-hidden="true">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
                                    <path d="M14 3v6h6M8 13h8M8 17h5" />
                                  </svg>
                                </span>
                                <div>
                                  <small>สัญญาเช่า</small>
                                  <strong>{contractMonths} เดือน</strong>
                                </div>
                              </div>
                              <div className="owner-rd-contract-dates">
                                <div>
                                  <small>เริ่ม</small>
                                  <strong>{formatDate(detailRoom.rental_start_date)}</strong>
                                </div>
                                <span className="owner-rd-contract-arrow" aria-hidden="true">→</span>
                                <div>
                                  <small>สิ้นสุด</small>
                                  <strong>{formatDate(detailRoom.rental_end_date)}</strong>
                                </div>
                              </div>
                              <div className="owner-rd-contract-left">
                                {contractTone === 'expired' ? (
                                  <strong>ครบกำหนดแล้ว</strong>
                                ) : (
                                  <>
                                    <strong>{contractDaysLeft}</strong>
                                    <small>วันที่เหลือ</small>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {!detailTenant && (
                            <div className="owner-rd-empty-tenant">
                              <span>ห้องนี้ยังไม่มีผู้เช่า</span>
                              <button
                                type="button"
                                className="owner-primary-btn small"
                                onClick={() => navigate('/register', { state: { roomNumber: detailRoom.room_number } })}
                              >
                                เพิ่มผู้เช่า
                              </button>
                            </div>
                          )}

                          {roomDetailBalance && (
                            <div className="owner-rd-balance">
                              <div>
                                <span>ค่าเช่ารายเดือน</span>
                                <strong>฿{formatCurrency(roomDetailBalance.rent)}</strong>
                              </div>
                              <div>
                                <span>ค่าน้ำ-ไฟค้างชำระ</span>
                                <strong>฿{formatCurrency(roomDetailBalance.unpaidUtilities)}</strong>
                              </div>
                              <div>
                                <span>หักเงินมัดจำ</span>
                                <strong>-฿{formatCurrency(roomDetailBalance.deposit)}</strong>
                              </div>
                              <div className={`is-total ${roomDetailBalance.netBalance > 0 ? 'is-owed' : 'is-refund'}`}>
                                <span>{roomDetailBalance.netBalance > 0 ? 'ค้างชำระสุทธิ' : 'มัดจำคงเหลือ (คืนลูกค้า)'}</span>
                                <strong>฿{formatCurrency(Math.abs(roomDetailBalance.netBalance))}</strong>
                              </div>
                            </div>
                          )}

                          <div className="owner-rd-history">
                            <div className="owner-rd-section-head">
                              <h4>ประวัติการชำระเงิน</h4>
                              <span className="owner-rd-section-meta">
                                {displayRoomDetail.payments?.length || 0} รายการ
                                {displayRoomDetail.payments?.length > 0 && (
                                  <button
                                    type="button"
                                    className="owner-ov-link"
                                    onClick={() => {
                                      setRoomPaymentsSearch('')
                                      setRoomPaymentsStatus('all')
                                      setRoomPaymentsPage(1)
                                      setRoomPaymentsAllOpen(true)
                                    }}
                                  >
                                    ดูเพิ่มเติม
                                    <span aria-hidden="true">›</span>
                                  </button>
                                )}
                              </span>
                            </div>
                            <div className="owner-rd-payments">
                              {isRoomHistoryLoading ? (
                                <div className="owner-rd-payments-empty">กำลังโหลดประวัติการชำระเงิน...</div>
                              ) : displayRoomDetail.payments?.length ? (
                                recentPaymentHistory.map((payment) => {
                                  const tone = getRoomPaymentTone(payment.status)
                                  return (
                                    <button
                                      key={payment.id}
                                      type="button"
                                      className={`owner-rd-payment is-${tone}`}
                                      onClick={() => setRoomPaymentDetail({ ...payment, room_number: detailRoom.room_number, first_name: payment.tenantName || detailTenant?.first_name, last_name: payment.tenantName ? '' : detailTenant?.last_name })}
                                    >
                                      <span className="owner-rd-payment-icon" aria-hidden="true">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="2" y="5" width="20" height="14" rx="2" />
                                          <path d="M2 10h20" />
                                        </svg>
                                      </span>
                                      <span className="owner-rd-payment-text">
                                        <strong>{payment.type ? formatPaymentType(payment.type) : 'ไม่ระบุ'}</strong>
                                        <small>
                                          {formatDate(payment.payment_date)}
                                          {payment.slip_path && (
                                            <span className="owner-rd-slip-chip">
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                                                <path d="M9 7h6M9 11h6" />
                                              </svg>
                                              มีสลิป
                                            </span>
                                          )}
                                        </small>
                                      </span>
                                      <span className="owner-rd-payment-side">
                                        <strong>฿{formatCurrency(payment.amount)}</strong>
                                        <span className={`owner-rd-payment-status is-${tone}`}>{ROOM_PAYMENT_STATUS_LABELS[payment.status] || payment.status || '-'}</span>
                                      </span>
                                      <span className="owner-rd-payment-arrow" aria-hidden="true">›</span>
                                    </button>
                                  )
                                })
                              ) : (
                                <div className="owner-rd-payments-empty">ยังไม่มีประวัติการชำระเงิน</div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                </div>
              )
            })()}

            {displayRoomPaymentsAll && displayRoomDetail && (() => {
              const detailRoom = displayRoomDetail.room
              const detailTenant = displayRoomDetail.tenant
              const allPayments = displayRoomDetail.payments || []
              const keyword = roomPaymentsSearch.trim().toLowerCase()
              const statusCount = (status) => allPayments.filter((payment) => getRoomPaymentTone(payment.status) === status).length
              const filteredPayments = allPayments.filter((payment) => {
                if (roomPaymentsStatus !== 'all' && getRoomPaymentTone(payment.status) !== roomPaymentsStatus) return false
                if (!keyword) return true
                return [
                  payment.type ? formatPaymentType(payment.type) : '',
                  payment.tenantName,
                  payment.note,
                  String(payment.amount ?? ''),
                  formatDate(payment.payment_date),
                  ROOM_PAYMENT_STATUS_LABELS[payment.status],
                  `#${payment.id}`,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase()
                  .includes(keyword)
              })
              const paymentsTotalPages = Math.max(1, Math.ceil(filteredPayments.length / ROOM_PAYMENTS_ALL_PAGE_SIZE))
              const paymentsPage = Math.min(roomPaymentsPage, paymentsTotalPages)
              const pagePayments = filteredPayments.slice((paymentsPage - 1) * ROOM_PAYMENTS_ALL_PAGE_SIZE, paymentsPage * ROOM_PAYMENTS_ALL_PAGE_SIZE)
              const paidTotal = filteredPayments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
              const pendingTotal = filteredPayments.filter((payment) => payment.status === 'pending').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
              const statusFilters = [
                { key: 'all', label: 'ทั้งหมด', count: allPayments.length },
                { key: 'paid', label: 'ชำระแล้ว', count: statusCount('paid') },
                { key: 'pending', label: 'รอตรวจสอบ', count: statusCount('pending') },
                { key: 'danger', label: 'ถูกปฏิเสธ/เกินกำหนด', count: statusCount('danger') },
              ]
              return (
                <div className={`owner-modal-backdrop is-stacked${isRoomPaymentsAllClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomPaymentsAllOpen(false)}>
                  <section className={`owner-modal owner-pa-modal${isRoomPaymentsAllClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-payments-all-title" onClick={(event) => event.stopPropagation()}>
                    <div className="owner-modal-header">
                      <span className="owner-modal-header-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <path d="M2 10h20" />
                        </svg>
                      </span>
                      <div>
                        <h3 id="room-payments-all-title">ประวัติการชำระเงินทั้งหมด</h3>
                        <p className="owner-modal-subtext">
                          ห้อง {detailRoom.room_number}
                          {detailTenant ? ` · ${`${detailTenant.first_name || ''} ${detailTenant.last_name || ''}`.trim()}` : ''}
                          {` · ${allPayments.length} รายการ`}
                        </p>
                      </div>
                      <button type="button" className="owner-modal-close" onClick={() => setRoomPaymentsAllOpen(false)} aria-label="ปิดประวัติการชำระเงิน">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                          <line x1="6" y1="6" x2="18" y2="18" />
                          <line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      </button>
                    </div>

                    <div className="owner-pa-toolbar">
                      <label className="owner-pa-search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          type="search"
                          value={roomPaymentsSearch}
                          onChange={(event) => {
                            setRoomPaymentsSearch(event.target.value)
                            setRoomPaymentsPage(1)
                          }}
                          placeholder="ค้นหาประเภท วันที่ จำนวนเงิน ผู้ชำระ หรือหมายเหตุ"
                          aria-label="ค้นหาประวัติการชำระเงิน"
                        />
                      </label>
                      <div className="owner-pa-filters" role="group" aria-label="กรองสถานะการชำระ">
                        {statusFilters.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={`owner-roomlist-filter${roomPaymentsStatus === item.key ? ' active' : ''}`}
                            aria-pressed={roomPaymentsStatus === item.key}
                            onClick={() => {
                              setRoomPaymentsStatus(item.key)
                              setRoomPaymentsPage(1)
                            }}
                          >
                            {item.label}
                            <span>{item.count}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="owner-modal-body owner-pa-body">
                      <div className="owner-pa-summary">
                        <div>
                          <span>รายการที่แสดง</span>
                          <strong>{filteredPayments.length} รายการ</strong>
                        </div>
                        <div className="is-paid">
                          <span>ยอดชำระแล้ว</span>
                          <strong>฿{formatCurrency(paidTotal)}</strong>
                        </div>
                        <div className="is-pending">
                          <span>ยอดรอตรวจสอบ</span>
                          <strong>฿{formatCurrency(pendingTotal)}</strong>
                        </div>
                      </div>

                      {filteredPayments.length ? (
                        <div className="owner-pa-table" role="table" aria-label="ประวัติการชำระเงิน">
                          <div className="owner-pa-row is-head" role="row">
                            <span role="columnheader">รายการ</span>
                            <span role="columnheader">ผู้ชำระ</span>
                            <span role="columnheader">วันที่ชำระ</span>
                            <span role="columnheader" className="is-amount">จำนวนเงิน</span>
                            <span role="columnheader">สถานะ</span>
                            <span role="columnheader" aria-hidden="true" />
                          </div>
                          {pagePayments.map((payment) => {
                            const tone = getRoomPaymentTone(payment.status)
                            return (
                              <button
                                key={payment.id}
                                type="button"
                                role="row"
                                className={`owner-pa-row is-${tone}`}
                                onClick={() => setRoomPaymentDetail({ ...payment, room_number: detailRoom.room_number, first_name: payment.tenantName || detailTenant?.first_name, last_name: payment.tenantName ? '' : detailTenant?.last_name })}
                              >
                                <span role="cell" className="owner-pa-type">
                                  <span className="owner-rd-payment-icon" aria-hidden="true">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="2" y="5" width="20" height="14" rx="2" />
                                      <path d="M2 10h20" />
                                    </svg>
                                  </span>
                                  <span className="owner-pa-type-text">
                                    <strong>{payment.type ? formatPaymentType(payment.type) : 'ไม่ระบุ'}</strong>
                                    <small>
                                      #{payment.id}
                                      {payment.slip_path && (
                                        <span className="owner-rd-slip-chip">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                                            <path d="M9 7h6M9 11h6" />
                                          </svg>
                                          มีสลิป
                                        </span>
                                      )}
                                    </small>
                                  </span>
                                </span>
                                <span role="cell" className="owner-pa-cell">{payment.tenantName || `${detailTenant?.first_name || ''} ${detailTenant?.last_name || ''}`.trim() || '-'}</span>
                                <span role="cell" className="owner-pa-cell">{formatDate(payment.payment_date)}</span>
                                <span role="cell" className="owner-pa-cell is-amount">฿{formatCurrency(payment.amount)}</span>
                                <span role="cell">
                                  <span className={`owner-rd-payment-status is-${tone}`}>{ROOM_PAYMENT_STATUS_LABELS[payment.status] || payment.status || '-'}</span>
                                </span>
                                <span role="cell" className="owner-rd-payment-arrow" aria-hidden="true">›</span>
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="owner-rd-payments-empty owner-pa-empty">
                          {allPayments.length ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีประวัติการชำระเงิน'}
                        </div>
                      )}
                    </div>
                    {filteredPayments.length > ROOM_PAYMENTS_ALL_PAGE_SIZE && (
                      <div className="owner-pa-footer">
                        <span>
                          แสดง {(paymentsPage - 1) * ROOM_PAYMENTS_ALL_PAGE_SIZE + 1}–{Math.min(paymentsPage * ROOM_PAYMENTS_ALL_PAGE_SIZE, filteredPayments.length)} จาก {filteredPayments.length} รายการ
                        </span>
                        <div className="owner-pa-pager">
                          <button type="button" aria-label="หน้าก่อนหน้า" disabled={paymentsPage <= 1} onClick={() => setRoomPaymentsPage(paymentsPage - 1)}>‹</button>
                          {Array.from({ length: paymentsTotalPages }, (_, index) => index + 1)
                            .filter((pageNumber) => pageNumber === 1 || pageNumber === paymentsTotalPages || Math.abs(pageNumber - paymentsPage) <= 1)
                            .map((pageNumber, index, pages) => (
                              <span key={pageNumber} className="owner-pa-pager-item">
                                {index > 0 && pageNumber - pages[index - 1] > 1 && <span className="owner-pa-pager-gap">…</span>}
                                <button
                                  type="button"
                                  className={pageNumber === paymentsPage ? 'active' : ''}
                                  aria-current={pageNumber === paymentsPage ? 'page' : undefined}
                                  onClick={() => setRoomPaymentsPage(pageNumber)}
                                >
                                  {pageNumber}
                                </button>
                              </span>
                            ))}
                          <button type="button" aria-label="หน้าถัดไป" disabled={paymentsPage >= paymentsTotalPages} onClick={() => setRoomPaymentsPage(paymentsPage + 1)}>›</button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )
            })()}

            {displayRoomPaymentDetail && (() => {
              const payment = displayRoomPaymentDetail
              const tone = getRoomPaymentTone(payment.status)
              const payerName = `${payment.first_name || ''} ${payment.last_name || ''}`.trim() || '-'
              const rows = [
                ['ประเภท', payment.type ? formatPaymentType(payment.type) : 'ไม่ระบุ'],
                ['วันที่ชำระ', formatDate(payment.payment_date)],
                ['บันทึกเมื่อ', payment.created_at ? new Date(payment.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'],
                ['ห้อง', `ห้อง ${payment.room_number || '-'}`],
                ['ผู้ชำระ', payerName],
                ['เลขที่รายการ', `#${payment.id}`],
              ]
              return (
                <div className={`owner-modal-backdrop is-stacked is-top${isRoomPaymentDetailClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomPaymentDetail(null)}>
                  <section className={`owner-modal owner-pd-modal${isRoomPaymentDetailClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-payment-title" onClick={(event) => event.stopPropagation()}>
                    <div className="owner-modal-header">
                      <span className="owner-modal-header-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                          <path d="M9 7h6M9 11h6M9 15h4" />
                        </svg>
                      </span>
                      <div>
                        <h3 id="room-payment-title">รายละเอียดการชำระเงิน</h3>
                        <p className="owner-modal-subtext">ห้อง {payment.room_number || '-'} · {payerName}</p>
                      </div>
                      <button type="button" className="owner-modal-close" onClick={() => setRoomPaymentDetail(null)} aria-label="ปิดรายละเอียดการชำระเงิน">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                          <line x1="6" y1="6" x2="18" y2="18" />
                          <line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      </button>
                    </div>
                    <div className="owner-modal-body">
                      <div className={`owner-pd-hero is-${tone}`}>
                        <span>ยอดชำระ</span>
                        <strong>฿{formatCurrency(payment.amount)}</strong>
                        <span className={`owner-rd-payment-status is-${tone}`}>{ROOM_PAYMENT_STATUS_LABELS[payment.status] || payment.status || '-'}</span>
                      </div>

                      <dl className="owner-pd-rows">
                        {rows.map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>

                      <div className={`owner-pd-note${payment.note ? '' : ' is-empty'}`}>
                        <span className="owner-pd-note-icon" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
                            <path d="M14 3v6h6M8 13h8M8 17h5" />
                          </svg>
                        </span>
                        <div>
                          <span className="owner-pd-note-label">หมายเหตุ</span>
                          <p>{payment.note || 'ไม่มีหมายเหตุสำหรับรายการนี้'}</p>
                        </div>
                      </div>

                      <div className="owner-pd-slip">
                        <span className="owner-pd-slip-label">สลิปโอนเงิน</span>
                        {payment.slip_path ? (
                          <button type="button" className="owner-pd-slip-thumb" onClick={() => openPaymentSlip(payment)}>
                            <UploadImage src={payment.slip_path} alt="สลิปโอนเงิน" loading="lazy" />
                            <span>ดูสลิปขนาดเต็ม</span>
                          </button>
                        ) : (
                          <div className="owner-rd-payments-empty is-compact">ไม่มีสลิปแนบ (ชำระเงินสด/บันทึกโดยเจ้าหน้าที่)</div>
                        )}
                      </div>

                    </div>
                    {payment.status === 'pending' && payment.slip_path && (
                      <div className="owner-pd-actions owner-modal-footer">
                        <button
                          type="button"
                          className="owner-payment-reject"
                          disabled={reviewingSlipId === payment.id}
                          onClick={async () => {
                            if (await reviewOwnerPaymentSlip(payment, 'rejected')) setRoomPaymentDetail(null)
                          }}
                        >
                          ปฏิเสธสลิป
                        </button>
                        <button
                          type="button"
                          className="owner-payment-approve"
                          disabled={reviewingSlipId === payment.id}
                          onClick={async () => {
                            if (await reviewOwnerPaymentSlip(payment, 'approved')) setRoomPaymentDetail(null)
                          }}
                        >
                          อนุมัติสลิป
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              )
            })()}

            {displayRoomListFilter && (
              <div className={`owner-modal-backdrop${isRoomListClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => setRoomListFilter(null)}>
                <section className={`owner-modal owner-roomlist-modal${isRoomListClosing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="room-list-title" onClick={(event) => event.stopPropagation()}>
                  <div className="owner-modal-header has-search">
                    <div>
                      <h3 id="room-list-title">{ROOM_LIST_FILTERS.find((item) => item.key === displayRoomListFilter)?.title || 'ห้องทั้งหมด'}</h3>
                      <p className="owner-modal-subtext">
                        {roomListKeyword ? `พบ ${visibleRoomListItems.length} จาก ${roomListItems.length} ห้อง` : `${roomListItems.length} ห้อง · คลิกที่ห้องเพื่อดูรายละเอียด`}
                      </p>
                    </div>
                    <label className="owner-modal-search">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="search"
                        value={roomListSearch}
                        onChange={(event) => setRoomListSearch(event.target.value)}
                        placeholder="ค้นหาเลขห้อง ชื่อผู้เช่า หรือเบอร์โทร"
                        aria-label="ค้นหาห้อง"
                      />
                    </label>
                    <button type="button" className="owner-modal-close" onClick={() => setRoomListFilter(null)} aria-label="ปิดรายการห้อง">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div className="owner-roomlist-filters" role="group" aria-label="กรองสถานะห้อง">
                    {ROOM_LIST_FILTERS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`owner-roomlist-filter${displayRoomListFilter === item.key ? ' active' : ''}`}
                        aria-pressed={displayRoomListFilter === item.key}
                        onClick={() => setRoomListFilter(item.key)}
                      >
                        {item.label}
                        <span>{roomListCounts[item.key] ?? 0}</span>
                      </button>
                    ))}
                  </div>

                  <div className="owner-modal-body">
                    {visibleRoomListItems.length ? (
                      <div className="owner-roomlist-grid">
                        {visibleRoomListItems.map((room) => (
                          <button
                            key={room.room_number}
                            type="button"
                            className={`owner-roomlist-card is-${room.status || 'vacant'}`}
                            onClick={() => {
                              setRoomListFilter(null)
                              handleRoomClick(room)
                            }}
                          >
                            <span className="owner-roomlist-card-head">
                              <span className="owner-roomlist-card-icon" aria-hidden="true">
                                <StatIcon name={room.status === 'maintenance' ? 'maintenance' : 'rooms'} />
                              </span>
                              <span className="owner-roomlist-card-title">
                                <strong>ห้อง {room.room_number}</strong>
                                <em>{room.price != null ? `฿${formatCurrency(room.price)}/เดือน` : 'ไม่ระบุราคา'}</em>
                              </span>
                              <span className="owner-roomlist-card-status">{ROOM_STATUS_LABELS[room.status] || 'ว่าง'}</span>
                            </span>
                            <span className="owner-roomlist-card-grid">
                              <span className="owner-roomlist-card-cell">
                                <small>ผู้เช่า</small>
                                <strong>{`${room.first_name || ''} ${room.last_name || ''}`.trim() || '-'}</strong>
                              </span>
                              <span className="owner-roomlist-card-cell">
                                <small>เบอร์โทร</small>
                                <strong>{room.phone || '-'}</strong>
                              </span>
                            </span>
                            <span className="owner-roomlist-card-foot">
                              <span>
                                {room.customer_id && room.rental_end_date
                                  ? `สัญญาถึง ${formatDate(room.rental_end_date)}`
                                  : room.status === 'vacant'
                                    ? 'พร้อมให้เช่า'
                                    : room.status === 'maintenance'
                                      ? 'อยู่ระหว่างซ่อมบำรุง'
                                      : 'ไม่มีข้อมูลสัญญา'}
                              </span>
                              <span className="owner-roomlist-card-more">
                                ดูรายละเอียด
                                <span aria-hidden="true">›</span>
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="owner-ov-list-empty">{roomListKeyword ? 'ไม่พบห้องที่ตรงกับคำค้นหา' : 'ไม่มีห้องในหมวดนี้'}</div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </>
        )}

        {displayConfirmDialog && (
          <div className={`owner-modal-backdrop owner-confirm-backdrop${isConfirmDialogClosing ? ' is-closing' : ''}`} role="presentation" onClick={() => resolveConfirm(false)}>
            <section
              className={`owner-modal owner-confirm-modal is-${displayConfirmDialog.tone || 'primary'}${isConfirmDialogClosing ? ' is-closing' : ''}`}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="owner-confirm-title"
              aria-describedby="owner-confirm-message"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="owner-confirm-body">
                <span className="owner-confirm-icon" aria-hidden="true">
                  {displayConfirmDialog.tone === 'danger' ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v5M12 16h.01" />
                    </svg>
                  ) : displayConfirmDialog.tone === 'success' ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="m8 12.5 2.8 2.8L16 10" />
                    </svg>
                  ) : (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 11v5M12 8h.01" />
                    </svg>
                  )}
                </span>
                <h3 id="owner-confirm-title">{displayConfirmDialog.title}</h3>
                <p id="owner-confirm-message">{displayConfirmDialog.message}</p>
                {displayConfirmDialog.details?.length > 0 && (
                  <dl className="owner-confirm-details">
                    {displayConfirmDialog.details.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <div className="owner-confirm-actions">
                <button type="button" className="owner-confirm-cancel" onClick={() => resolveConfirm(false)}>
                  {displayConfirmDialog.cancelLabel || 'ยกเลิก'}
                </button>
                <button type="button" className="owner-confirm-ok" onClick={() => resolveConfirm(true)} autoFocus>
                  {displayConfirmDialog.confirmLabel || 'ยืนยัน'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default OwnerMain
