import { useState } from 'react'
import { PersonIcon } from './ParcelIcons.jsx'
import InspectionPhotoPicker from './InspectionPhotoPicker.jsx'
import compressImageFile from '../utils/compressImageFile.js'
import './InspectionCells.css'
import './InspectionStaffForm.css'
import './InspectionForm.css'

const CHECKLIST_ITEMS = [
  { key: 'walls', label: 'ผนังและสี (รอยแตก คราบ สีลอก)' },
  { key: 'floor', label: 'พื้น (รอยแตก คราบ ความเสียหาย)' },
  { key: 'ceiling', label: 'เพดานและไฟ (คราบรั่วซึม หลอดไฟ)' },
  { key: 'doors', label: 'ประตูและกุญแจ (บาน ลูกบิด กลอน กุญแจ)' },
  { key: 'windows', label: 'หน้าต่าง (กระจก วงกบ ตัวล็อก)' },
  { key: 'electrical', label: 'ระบบไฟฟ้า (ปลั๊ก สวิตช์ ไฟส่องสว่าง)' },
  { key: 'bathroom', label: 'ห้องน้ำและสุขภัณฑ์ (ก๊อก ฝักบัว โถ ท่อระบาย)' },
  { key: 'furniture', label: 'เฟอร์นิเจอร์และอุปกรณ์ของห้อง' },
]

const RESULT_OPTIONS = [
  { key: 'good', label: 'ปกติ', title: 'สภาพดี ใช้งานได้' },
  { key: 'wear', label: 'สึกหรอ', title: 'สึกหรอตามการใช้งานปกติ แต่ยังใช้งานได้' },
  { key: 'damaged', label: 'ชำรุด', title: 'เสียหายหรือใช้งานไม่ได้' },
  { key: 'missing', label: 'สูญหาย', title: 'อุปกรณ์หรือทรัพย์สินที่ควรมีสูญหาย' },
  { key: 'not_applicable', label: 'ไม่มี', title: 'ไม่มีหรือติดตั้งรายการนี้ในห้อง' },
]

const MAX_PHOTOS = 15

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function InspectionForm({ mode, candidates = [], candidatesLoading = false, initial = null, submitting = false, error = '', onSubmit, onCancel }) {
  const [requestId, setRequestId] = useState(() => (mode === 'create' && candidates.length === 1 ? String(candidates[0].id) : ''))
  const [checklist, setChecklist] = useState(() => ({ ...(initial?.checklist || {}) }))
  const [damageNote, setDamageNote] = useState(initial?.damage_note || '')
  const [existingPhotos, setExistingPhotos] = useState(initial?.photos || [])
  const [photos, setPhotos] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [localError, setLocalError] = useState('')

  const selectedRequest = candidates.find((item) => String(item.id) === requestId) || null
  const results = Object.values(checklist)
  const counts = RESULT_OPTIONS.reduce((total, option) => ({ ...total, [option.key]: results.filter((value) => value === option.key).length }), {})
  const hasIssue = counts.damaged + counts.missing > 0
  const photoCount = existingPhotos.length + photos.length

  const setResult = (key, value) => {
    setChecklist((current) => {
      const { [key]: previous, ...rest } = current
      return previous === value ? rest : { ...rest, [key]: value }
    })
    setFieldErrors((errors) => ({ ...errors, checklist: (errors.checklist || []).filter((item) => item !== key) }))
  }

  const submit = async (event) => {
    event.preventDefault()
    const errors = {}
    if (mode === 'create' && !selectedRequest) errors.room = 'กรุณาเลือกคำขอย้ายห้องที่ต้องการตรวจ'
    const missing = CHECKLIST_ITEMS.filter((item) => !checklist[item.key]).map((item) => item.key)
    if (missing.length > 0) errors.checklist = missing
    if (hasIssue && !damageNote.trim()) errors.damage_note = 'กรุณาระบุรายการและตำแหน่งที่ชำรุดหรือสูญหาย'
    if (hasIssue && photoCount === 0) errors.photos = 'กรุณาแนบภาพประกอบกรณีพบรายการชำรุดหรือสูญหาย'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setLocalError(
        errors.room
          ? errors.room
          : missing.length > 0
            ? `ยังไม่ได้ตรวจอีก ${missing.length} หัวข้อ (ไฮไลต์สีแดงด้านบน) กรุณาเลือกผลให้ครบ`
            : errors.photos
              ? 'กรุณาแนบภาพประกอบรายการชำรุดหรือสูญหาย'
              : 'กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง',
      )
      return
    }
    setLocalError('')
    try {
      const compressed = await Promise.all(photos.map((file) => compressImageFile(file)))
      const payload = { checklist, damage_note: damageNote.trim(), photos: compressed }
      if (mode === 'create') {
        payload.room_number = selectedRequest.room_number
        payload.tenant_request_id = selectedRequest.id
      } else {
        payload.keep_photos = existingPhotos.map((photo) => photo.url)
      }
      onSubmit(payload)
    } catch (compressError) {
      setLocalError(compressError.message || 'ไม่สามารถประมวลผลรูปภาพได้')
    }
  }

  const shownError = localError || error

  return (
    <form className="inspection-form admin-inspection-form" onSubmit={submit} noValidate>
      <section className="inspection-section">
        <h4 className="inspection-section-title">
          <span className="inspection-step">1</span> {mode === 'create' ? 'เลือกคำขอย้ายห้องที่ตรวจ' : 'ห้องที่ตรวจ'}
        </h4>
        <div className="staff-form-field">
          <label className="staff-form-label">
            ห้อง / ผู้เช่า <span className="staff-form-required">*</span>
          </label>
          {mode === 'create' ? (
            candidatesLoading ? (
              <p className="idf-candidates-empty">กำลังโหลดคำขอย้ายห้อง...</p>
            ) : candidates.length === 0 ? (
              <p className="idf-candidates-empty">ไม่มีคำขอย้ายห้องที่รอตรวจห้อง</p>
            ) : (
              <div className={`idf-requests${fieldErrors.room ? ' is-invalid' : ''}`} role="radiogroup" aria-label="คำขอย้ายห้อง">
                {candidates.map((item) => {
                  const active = String(item.id) === requestId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`idf-request${active ? ' is-active' : ''}`}
                      onClick={() => {
                        setRequestId(String(item.id))
                        setFieldErrors((errors) => ({ ...errors, room: undefined }))
                      }}
                    >
                      <span className="room-picker-avatar" aria-hidden="true">
                        <PersonIcon size={17} />
                      </span>
                      <span className="idf-request-info">
                        <strong>{item.first_name} {item.last_name}</strong>
                        <span>
                          ห้อง {item.room_number} → {item.target_room_number || '-'} · ส่งคำขอ {formatDate(item.created_at)}
                          {item.phone ? ` · โทร ${item.phone}` : ''}
                        </span>
                      </span>
                      <span className="idf-request-check" aria-hidden="true">
                        {active && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 12 5 5 9-10" />
                          </svg>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <div className="room-picker-trigger inspection-room-fixed">
              <span className="room-picker-avatar" aria-hidden="true">
                <PersonIcon size={17} />
              </span>
              <span className="room-picker-main">
                <strong>{initial?.tenant_name}</strong>
                <small>
                  ห้อง {initial?.room_number}
                  {initial?.tenant_request_id ? ` → ${initial?.target_room_number || '-'}` : ''}
                  {initial?.tenant_phone ? ` · โทร ${initial.tenant_phone}` : ''}
                </small>
              </span>
            </div>
          )}
          {fieldErrors.room && <span className="staff-form-field-error">{fieldErrors.room}</span>}
        </div>
      </section>

      <section className="inspection-section">
        <div className="inspection-section-head">
          <h4 className="inspection-section-title">
            <span className="inspection-step">2</span> ตรวจสภาพห้อง
          </h4>
          <div className="inspection-head-actions">
            <button
              type="button"
              className="inspection-link-btn is-reset"
              onClick={() => {
                setChecklist({})
                setFieldErrors((errors) => ({ ...errors, checklist: [] }))
              }}
              disabled={results.length === 0}
            >
              รีเซ็ตทั้งหมด
            </button>
          </div>
        </div>
        <div className="inspection-progress" aria-live="polite">
          <div className="inspection-progress-text">
            <span>
              ตรวจแล้ว <strong>{results.length}</strong> / {CHECKLIST_ITEMS.length} ข้อ
            </span>
            <span className="inspection-counts">
              <span className="is-good">ปกติ {counts.good}</span>
              <span className="is-wear">สึกหรอ {counts.wear}</span>
              <span className="is-damaged">ชำรุด {counts.damaged}</span>
              <span className="is-missing">สูญหาย {counts.missing}</span>
              <span className="is-not_applicable">ไม่มี {counts.not_applicable}</span>
            </span>
          </div>
          <p className="inspection-guidance">
            ตรวจแต่ละรายการจริง แยกการสึกหรอตามปกติออกจากความเสียหาย และเลือก “ไม่มี” เฉพาะรายการที่ไม่ได้ติดตั้ง
          </p>
          <span className="inspection-progress-bar">
            <span style={{ width: `${(results.length / CHECKLIST_ITEMS.length) * 100}%` }} />
          </span>
        </div>
        <div className="inspection-list">
          {CHECKLIST_ITEMS.map((item) => {
            const result = checklist[item.key] || ''
            const isMissing = (fieldErrors.checklist || []).includes(item.key)
            return (
              <div key={item.key} className={`inspection-row${result ? ` is-${result}` : ''}${isMissing ? ' is-missing' : ''}`}>
                <span className="inspection-row-label">
                  {item.label}
                  {isMissing && <small>ยังไม่ได้เลือก</small>}
                </span>
                <div className="inspection-choices" role="radiogroup" aria-label={item.label}>
                  {RESULT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={result === option.key}
                      title={result === option.key ? `${option.title} (กดอีกครั้งเพื่อยกเลิก)` : option.title}
                      className={`inspection-choice is-${option.key}${result === option.key ? ' is-selected' : ''}`}
                      onClick={() => setResult(item.key, option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="inspection-section">
        <h4 className="inspection-section-title">
          <span className="inspection-step">3</span> รายละเอียดและรูปภาพ
        </h4>
        <div className="staff-form-field">
          <div className="staff-form-label-row">
            <label className="staff-form-label" htmlFor="admin-inspection-note">
              รายละเอียดและตำแหน่งที่พบ{' '}
              {hasIssue ? <span className="staff-form-required">*</span> : <span className="staff-form-optional">(ไม่บังคับ)</span>}
            </label>
            <span className="staff-form-counter">{damageNote.length}/1000</span>
          </div>
          <textarea
            id="admin-inspection-note"
            className={`staff-form-input staff-form-textarea${fieldErrors.damage_note ? ' is-invalid' : ''}`}
            rows={3}
            maxLength={1000}
            value={damageNote}
            onChange={(event) => {
              setDamageNote(event.target.value)
              setFieldErrors((errors) => ({ ...errors, damage_note: undefined }))
            }}
            placeholder="ระบุรายการ ตำแหน่ง และลักษณะการชำรุดหรือสูญหาย"
          />
          {fieldErrors.damage_note && <span className="staff-form-field-error">{fieldErrors.damage_note}</span>}
        </div>
        <div className="staff-form-field">
          <span className="staff-form-label">
            รูปภาพประกอบ{' '}
            {hasIssue ? (
              <span className="staff-form-required">(จำเป็นเมื่อชำรุด/สูญหาย · สูงสุด {MAX_PHOTOS} รูป)</span>
            ) : (
              <span className="staff-form-optional">(ไม่บังคับ · สูงสุด {MAX_PHOTOS} รูป)</span>
            )}
          </span>
          <InspectionPhotoPicker
            files={photos}
            existing={existingPhotos}
            onRemoveExisting={(url) => {
              setExistingPhotos((current) => current.filter((photo) => photo.url !== url))
              setFieldErrors((errors) => ({ ...errors, photos: undefined }))
            }}
            onChange={(next) => {
              setPhotos(next)
              setFieldErrors((errors) => ({ ...errors, photos: undefined }))
            }}
            onError={setLocalError}
          />
          {fieldErrors.photos && <span className="staff-form-field-error">{fieldErrors.photos}</span>}
        </div>
      </section>

      <div className="inspection-footer">
        {shownError && (
          <p className="staff-form-error inspection-footer-error" role="alert">
            {shownError}
          </p>
        )}
        <p className="inspection-footer-note">บันทึกผลตรวจและรูปแล้ว Staff สามารถอนุมัติย้ายห้องได้ทันที</p>
        <div className="inspection-footer-actions">
          <button type="button" className="staff-action-btn is-ghost" onClick={onCancel} disabled={submitting}>
            ยกเลิก
          </button>
          <button type="submit" className="staff-action-btn is-primary" disabled={submitting || (mode === 'create' && candidates.length === 0)}>
            {submitting ? 'กำลังบันทึก...' : mode === 'create' ? 'บันทึกผลตรวจ' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </div>
    </form>
  )
}
