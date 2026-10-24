import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import InspectionPhotoPicker from './InspectionPhotoPicker.jsx'
import InspectionTopicFilter from './InspectionTopicFilter.jsx'
import MoveOutAssetCheck from './MoveOutAssetCheck.jsx'
import ThaiDatePicker from './ThaiDatePicker.jsx'
import compressImageFile from '../utils/compressImageFile.js'
import { assetPriceValue, CHECKLIST_ITEMS, ISSUE_RESULTS, isValidAssetPrice, RESULT_OPTIONS } from '../utils/inspectionChecklist.js'
import './InspectionCells.css'
import './InspectionStaffForm.css'
import './InspectionForm.css'
import './MoveInInspection.css'

const MAX_PHOTOS = 15

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

const pad2 = (number) => String(number).padStart(2, '0')

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatBaht(value) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const assetRow = (asset) => ({
  name: asset.name || '',
  price: asset.price === undefined || asset.price === null ? '' : String(asset.price),
  result: asset.result || 'good',
})

const TOPICS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'checklist', label: 'ตรวจสภาพห้อง' },
  { key: 'photos', label: 'รายละเอียดและรูปภาพ' },
]

function assetSummary(assets = []) {
  const total = assets.reduce((sum, asset) => sum + Number(asset.price || 0), 0)
  const issues = assets.filter((asset) => ISSUE_RESULTS.includes(asset.result))
  return { total, issueCount: issues.length, issueValue: issues.reduce((sum, asset) => sum + Number(asset.price || 0), 0) }
}

function MoveInInspectionForm({ candidates, initial, startNew = false, submitting, error, onSubmit, onCancel, onLoadSave, onDeleteSave }) {
  const isCreate = !initial
  const saves = initial?.saves || []
  const [newSave, setNewSave] = useState(Boolean(initial && startNew))
  const [scrollRequest, setScrollRequest] = useState(0)
  const formRef = useRef(null)
  const [roomNumber, setRoomNumber] = useState(() => (isCreate && candidates.length === 1 ? String(candidates[0].room_number) : ''))
  const [inspectionDate, setInspectionDate] = useState(() => {
    if (!initial) return todayKey()
    if (!startNew) return initial.inspection_date
    return (initial.saves || []).some((save) => save.inspection_date === todayKey()) ? '' : todayKey()
  })
  const [checklist, setChecklist] = useState(() => ({ ...(initial?.checklist || {}) }))
  const [assets, setAssets] = useState(() =>
    (initial?.assets || (isCreate && candidates.length === 1 ? candidates[0].room_assets : [])).map(assetRow),
  )
  const [note, setNote] = useState(initial?.note || '')
  const [existingPhotos, setExistingPhotos] = useState(() => (initial && startNew ? [] : initial?.photos || []))
  const [photos, setPhotos] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [localError, setLocalError] = useState('')
  const [section, setSection] = useState('all')
  const [assetsOpen, setAssetsOpen] = useState(true)

  const selected = isCreate ? candidates.find((item) => String(item.room_number) === roomNumber) || null : null
  const assetRoom = isCreate ? selected?.room_number : initial.room_number
  const results = CHECKLIST_ITEMS.map((item) => checklist[item.key]).filter(Boolean)
  const counts = Object.fromEntries(RESULT_OPTIONS.map((option) => [option.key, results.filter((result) => result === option.key).length]))
  const hasIssue = [...results, ...assets.map((asset) => asset.result)].some((result) => ISSUE_RESULTS.includes(result))

  const clearFieldError = (key) => setFieldErrors((errors) => ({ ...errors, [key]: undefined }))

  const selectRoom = (candidate) => {
    setRoomNumber(String(candidate.room_number))
    setAssets(candidate.room_assets.map(assetRow))
    setFieldErrors((errors) => ({ ...errors, room: undefined, assets: undefined }))
  }

  const setResult = (key, value) => {
    setChecklist((current) => {
      const { [key]: previous, ...rest } = current
      return previous === value ? rest : { ...rest, [key]: value }
    })
    setFieldErrors((errors) => ({ ...errors, checklist: (errors.checklist || []).filter((item) => item !== key) }))
  }

  const changeAssets = (next) => {
    setAssets(next)
    clearFieldError('assets')
  }

  const resetChecklist = () => {
    setChecklist({})
    setFieldErrors((errors) => ({ ...errors, checklist: [] }))
  }

  const setAllResults = (value) => {
    setChecklist(Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.key, value])))
    setFieldErrors((errors) => ({ ...errors, checklist: [] }))
  }

  const takenDates = new Set(saves.filter((save) => newSave || save.id !== initial?.id).map((save) => save.inspection_date))
  const dateTaken = !isCreate && takenDates.has(inspectionDate)
  const latestSaveId = saves[0]?.id

  const changeDate = (value) => {
    setInspectionDate(value)
    clearFieldError('date')
  }

  const startNewSave = () => {
    const today = todayKey()
    setNewSave(true)
    setInspectionDate(saves.some((save) => save.inspection_date === today) ? '' : today)
    setExistingPhotos([])
    setPhotos([])
    setFieldErrors({})
    setLocalError('')
    setSection('all')
  }

  const cancelNewSave = () => {
    setNewSave(false)
    setInspectionDate(initial.inspection_date)
    setExistingPhotos(initial.photos || [])
    setPhotos([])
    setFieldErrors({})
    setLocalError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    const errors = {}
    if (isCreate && !selected) errors.room = 'กรุณาเลือกห้องที่ต้องการตรวจ'
    if (!inspectionDate) errors.date = 'กรุณาเลือกวันที่ตรวจ'
    else if (dateTaken) errors.date = `มีบันทึกของวันที่ ${formatDate(inspectionDate)} แล้ว กรุณาเลือกวันอื่น หรือเปิดบันทึกวันนั้นแล้วแก้ไข`
    const missing = CHECKLIST_ITEMS.filter((item) => !checklist[item.key]).map((item) => item.key)
    if (missing.length > 0) errors.checklist = missing
    const seenNames = new Set()
    const invalidAssets = []
    assets.forEach((asset, index) => {
      const name = String(asset.name).trim()
      if (!name || seenNames.has(name) || !isValidAssetPrice(asset.price) || !asset.result) invalidAssets.push(index)
      seenNames.add(name)
    })
    if (invalidAssets.length > 0) {
      errors.assets = invalidAssets
      setAssetsOpen(true)
    }
    if (hasIssue && !note.trim()) errors.note = 'กรุณาระบุรายการและตำแหน่งที่ชำรุดหรือสูญหาย'
    if (hasIssue && existingPhotos.length + photos.length === 0) errors.photos = 'กรุณาแนบภาพประกอบกรณีพบรายการชำรุดหรือสูญหาย'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setSection(errors.room || errors.date ? 'all' : missing.length > 0 || errors.assets ? 'checklist' : 'photos')
      setLocalError(
        errors.room
          || errors.date
          || (missing.length > 0 ? `ยังไม่ได้ตรวจอีก ${missing.length} หัวข้อ (ไฮไลต์สีแดงด้านบน) กรุณาเลือกผลให้ครบ` : '')
          || (errors.assets ? `อุปกรณ์และทรัพย์สินยังไม่ถูกต้อง ${invalidAssets.length} รายการ (ชื่อซ้ำ ไม่มีชื่อ หรือราคาไม่ถูกต้อง)` : '')
          || errors.note
          || errors.photos,
      )
      setScrollRequest((count) => count + 1)
      return
    }
    setLocalError('')
    try {
      const compressed = await Promise.all(photos.map((file) => compressImageFile(file)))
      const payload = {
        inspection_date: inspectionDate,
        checklist,
        assets: assets.map((asset) => ({ name: String(asset.name).trim(), price: assetPriceValue(asset.price), result: asset.result })),
        note: note.trim(),
        photos: compressed,
      }
      if (isCreate) payload.room_number = selected.room_number
      else if (newSave) {
        payload.room_number = initial.room_number
        payload.customer_id = initial.customer_id
      } else payload.keep_photos = existingPhotos.map((photo) => photo.url)
      onSubmit(payload, { asNewSave: newSave })
    } catch (compressError) {
      setLocalError(compressError.message || 'ไม่สามารถประมวลผลรูปภาพได้')
    }
  }

  const shownError = localError || error

  useEffect(() => {
    if (!scrollRequest || !formRef.current) return
    const target = formRef.current.querySelector(
      '.is-invalid:not([hidden]), .is-missing, .staff-form-field-error, .move-out-asset.is-invalid',
    )
    const field = target?.closest('.staff-form-field, .inspection-row, .move-out-asset, .move-in-setup-block') || target
    if (field) {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' })
      field.querySelector('input:not([type="file"]), textarea')?.focus({ preventScroll: true })
    }
  }, [scrollRequest])

  useEffect(() => {
    if (error && formRef.current) {
      formRef.current.querySelector('.inspection-footer-error')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [error])

  return (
    <form ref={formRef} className="inspection-form move-in-form" onSubmit={submit} noValidate>
      <InspectionTopicFilter topics={TOPICS} value={section} onChange={setSection} />

      <section className="inspection-section">
        <h4 className="inspection-section-title">
          <span className="inspection-step">1</span> {isCreate ? 'เลือกห้องและวันที่ตรวจ' : 'ห้องและวันที่ตรวจ'}
        </h4>
        <div className="move-in-setup">
          <div className="move-in-setup-block">
            <div className="move-in-setup-head">
              <span className="staff-form-label">
                ห้อง / ผู้เช่าใหม่ <span className="staff-form-required">*</span>
              </span>
              {isCreate && candidates.length > 0 && <span className="move-in-setup-meta">รอตรวจ {candidates.length} ห้อง</span>}
            </div>
            {isCreate ? (
              candidates.length === 0 ? (
                <p className="idf-candidates-empty">ไม่มีห้องที่รอตรวจก่อนเข้าอยู่</p>
              ) : (
                <div className={`move-in-rooms${fieldErrors.room ? ' is-invalid' : ''}`} role="radiogroup" aria-label="ห้องที่รอตรวจก่อนเข้าอยู่">
                  {candidates.map((item) => {
                    const active = String(item.room_number) === roomNumber
                    return (
                      <button
                        key={item.room_number}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`move-in-room${active ? ' is-active' : ''}`}
                        onClick={() => selectRoom(item)}
                      >
                        <span className="move-in-room-no">
                          <small>ห้อง</small>
                          {item.room_number}
                        </span>
                        <span className="move-in-room-info">
                          <strong>
                            {item.first_name} {item.last_name}
                          </strong>
                          <span>{item.room_type_name ? `ประเภท ${item.room_type_name}` : 'ยังไม่กำหนดประเภทห้อง'}</span>
                          <span>
                            {item.rental_start_date ? `เริ่มเช่า ${formatDate(item.rental_start_date)}` : 'ยังไม่ระบุวันเริ่มเช่า'}
                            {item.phone ? ` · โทร ${item.phone}` : ''}
                          </span>
                        </span>
                        <span className="move-in-room-check" aria-hidden="true">
                          {active ? '✓' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            ) : (
              <div className="move-in-room is-active is-fixed">
                <span className="move-in-room-no">
                  <small>ห้อง</small>
                  {initial.room_number}
                </span>
                <span className="move-in-room-info">
                  <strong>{initial.tenant_name}</strong>
                  <span>{initial.room_type_name ? `ประเภท ${initial.room_type_name}` : 'ยังไม่กำหนดประเภทห้อง'}</span>
                  {initial.tenant_phone && <span>โทร {initial.tenant_phone}</span>}
                </span>
              </div>
            )}
            {fieldErrors.room && <span className="staff-form-field-error">{fieldErrors.room}</span>}
          </div>
          {!isCreate && (
            <div className="move-in-setup-block">
              <div className="move-in-setup-head">
                <span className="staff-form-label">บันทึกผลตรวจ</span>
                <span className="move-in-setup-meta">{saves.length} ครั้ง · กดเพื่อเปิดบันทึกของวันนั้น</span>
              </div>
              <div className="move-in-saves" role="tablist" aria-label="บันทึกผลตรวจแต่ละวัน">
                {newSave && (
                  <span className="move-in-save is-active is-new">
                    <span className="move-in-save-slot">ใหม่</span>
                    <strong>{inspectionDate ? formatDate(inspectionDate) : 'เลือกวันที่'}</strong>
                    <small>ยังไม่ได้บันทึก</small>
                  </span>
                )}
                {saves.map((save, index) => {
                  const active = !newSave && save.id === initial.id
                  return (
                    <div key={save.id} className="move-in-save-wrap">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`move-in-save${active ? ' is-active' : ''}`}
                        disabled={submitting}
                        onClick={() => !active && onLoadSave(save.id)}
                      >
                        <span className="move-in-save-slot">
                          ครั้งที่ {saves.length - index}
                          {save.id === latestSaveId && <b>ล่าสุด</b>}
                        </span>
                        <strong>{formatDate(save.inspection_date)}</strong>
                        <small>
                          <i className={save.issue_count > 0 ? 'is-issue' : 'is-good'} aria-hidden="true" />
                          {save.issue_count > 0 ? `พบปัญหา ${save.issue_count}` : 'ปกติ'} · {save.photo_count} รูป
                        </small>
                        <small className="move-in-save-time">บันทึก {formatDateTime(save.saved_at)}</small>
                      </button>
                      <button
                        type="button"
                        className="move-in-save-delete"
                        aria-label={`ลบบันทึกวันที่ ${formatDate(save.inspection_date)}`}
                        disabled={submitting || newSave}
                        onClick={() => onDeleteSave({ ...save, order: saves.length - index })}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                        </svg>
                        ลบบันทึกนี้
                      </button>
                    </div>
                  )
                })}
                {!newSave && (
                  <button type="button" className="move-in-save-add" onClick={startNewSave} disabled={submitting}>
                    <span aria-hidden="true">+</span>
                    บันทึกวันใหม่
                  </button>
                )}
              </div>
              {newSave ? (
                <div className="move-in-save-note">
                  <span>กำลังสร้างบันทึกวันใหม่จากข้อมูลที่เปิดอยู่ · บันทึกเดิมยังอยู่ครบ · รูปของบันทึกเดิมไม่ถูกคัดลอก</span>
                  <button type="button" className="move-in-save-cancel" onClick={cancelNewSave} disabled={submitting}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    ยกเลิกบันทึกวันใหม่
                  </button>
                </div>
              ) : (
                <p className="move-in-save-hint">
                  กำลังเปิดบันทึกวันที่ {formatDate(initial.inspection_date)} · การเทียบตอนย้ายออก/ย้ายห้องใช้บันทึกล่าสุด
                </p>
              )}
            </div>
          )}
          <div className="move-in-setup-block move-in-date-field">
            <div className="move-in-setup-head">
              <span className="staff-form-label">
                วันที่ตรวจ <span className="staff-form-required">*</span>
              </span>
              <span className="move-in-setup-meta">เลือกได้ถึงวันนี้</span>
            </div>
            <div className="move-in-date-row">
              <ThaiDatePicker
                className={`staff-form-input${fieldErrors.date || dateTaken ? ' is-invalid' : ''}`}
                value={inspectionDate}
                maxDate={new Date()}
                onChange={changeDate}
              />
              <button
                type="button"
                className={`move-in-date-today${inspectionDate === todayKey() ? ' is-active' : ''}`}
                onClick={() => changeDate(todayKey())}
              >
                วันนี้
              </button>
            </div>
            {fieldErrors.date ? (
              <span className="staff-form-field-error">{fieldErrors.date}</span>
            ) : dateTaken ? (
              <span className="staff-form-field-error">มีบันทึกของวันที่นี้แล้ว กรุณาเลือกวันอื่น</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="inspection-section" data-topic="checklist" hidden={!['all', 'checklist'].includes(section)}>
        <div className="inspection-section-head">
          <h4 className="inspection-section-title">
            <span className="inspection-step">2</span> ตรวจสภาพห้อง
          </h4>
          <div className="inspection-head-actions">
            <button type="button" className="inspection-link-btn is-reset" onClick={resetChecklist} disabled={results.length === 0}>
              รีเซ็ตทั้งหมด
            </button>
          </div>
        </div>
        <div className="inspection-progress" aria-live="polite">
          <div className="inspection-progress-text">
            <span>
              ตรวจแล้ว <strong>{results.length}</strong> / {CHECKLIST_ITEMS.length} ข้อ
            </span>
            <span className="inspection-counts" role="group" aria-label="เลือกผลเดียวกันทุกข้อ">
              {RESULT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`is-${option.key}${counts[option.key] === CHECKLIST_ITEMS.length ? ' is-all' : ''}`}
                  title={`ตั้งทุกข้อเป็น "${option.label}"`}
                  onClick={() => setAllResults(option.key)}
                >
                  {option.label} {counts[option.key]}
                </button>
              ))}
            </span>
          </div>
          <p className="inspection-guidance">
            บันทึกสภาพจริงก่อนผู้เช่าเข้าอยู่ รายการที่ชำรุดหรือสูญหายอยู่แล้วจะไม่ถูกคิดค่าเสียหายตอนย้ายออก
          </p>
          <span className="inspection-progress-bar">
            <span style={{ width: `${(results.length / CHECKLIST_ITEMS.length) * 100}%` }} />
          </span>
        </div>
        <div className="inspection-list">
          {CHECKLIST_ITEMS.map((item) => {
            const result = checklist[item.key] || ''
            const isMissing = (fieldErrors.checklist || []).includes(item.key)
            const isFurniture = item.key === 'furniture'
            return (
              <div key={item.key} className={`inspection-row has-extra${result ? ` is-${result}` : ''}${isMissing ? ' is-missing' : ''}`}>
                <span className="inspection-row-label">
                  {item.label}
                  {isMissing && <small>ยังไม่ได้เลือก</small>}
                  {isFurniture && (
                    <button type="button" className="inspection-assets-toggle" aria-expanded={assetsOpen} onClick={() => setAssetsOpen((open) => !open)}>
                      {assetsOpen ? '▴' : '▾'} อุปกรณ์และทรัพย์สินในห้อง ({assets.length})
                    </button>
                  )}
                </span>
                <ResultChoices label={item.label} value={result} onChange={(value) => setResult(item.key, value)} />
                {isFurniture && (
                  <div className="inspection-assets-panel" hidden={!assetsOpen && !ISSUE_RESULTS.includes(result)}>
                    <MoveOutAssetCheck
                      roomNumber={assetRoom}
                      assets={assets}
                      onChange={changeAssets}
                      invalidIndexes={fieldErrors.assets || []}
                      recordOnly
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className={`inspection-damage-total${hasIssue ? ' is-charged' : ''}`}>
          <span>{hasIssue ? 'พบรายการชำรุดหรือสูญหายตั้งแต่ก่อนเข้าอยู่' : 'สภาพห้องก่อนเข้าอยู่'}</span>
          <strong>{hasIssue ? 'บันทึกเป็นหลักฐาน' : 'ปกติ'}</strong>
        </div>
      </section>

      <section className="inspection-section" data-topic="photos" hidden={!['all', 'photos'].includes(section)}>
        <h4 className="inspection-section-title">
          <span className="inspection-step">3</span> รายละเอียดและรูปภาพ
        </h4>
        <div className="staff-form-field">
          <div className="staff-form-label-row">
            <label className="staff-form-label" htmlFor="move-in-note">
              รายละเอียดและตำแหน่งที่พบ{' '}
              {hasIssue ? <span className="staff-form-required">*</span> : <span className="staff-form-optional">(ไม่บังคับ)</span>}
            </label>
            <span className="staff-form-counter">{note.length}/1000</span>
          </div>
          <textarea
            id="move-in-note"
            className={`staff-form-input staff-form-textarea${fieldErrors.note ? ' is-invalid' : ''}`}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              clearFieldError('note')
            }}
            placeholder="ระบุสภาพห้องก่อนเข้าอยู่ ตำแหน่งที่ชำรุด หรือข้อตกลงกับผู้เช่า"
          />
          {fieldErrors.note && <span className="staff-form-field-error">{fieldErrors.note}</span>}
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
              clearFieldError('photos')
            }}
            onChange={(next) => {
              setPhotos(next)
              clearFieldError('photos')
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
        <p className="inspection-footer-note">บันทึกไว้เป็นหลักฐานสภาพห้องก่อนเข้าอยู่ ไม่มีการคิดเงินและไม่ต้องส่งให้ Admin อนุมัติ ใช้เทียบตอนผู้เช่าย้ายออก</p>
        <div className="inspection-footer-actions">
          <button type="button" className="staff-action-btn is-ghost" onClick={onCancel} disabled={submitting}>
            ยกเลิก
          </button>
          <button type="submit" className="staff-action-btn is-primary" disabled={submitting || (isCreate && candidates.length === 0)}>
            {submitting ? 'กำลังบันทึก...' : isCreate ? 'บันทึกผลตรวจ' : newSave ? 'บันทึกเป็นวันใหม่' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </div>
    </form>
  )
}

function ResultChoices({ label, value, onChange }) {
  return (
    <div className="inspection-choices" role="radiogroup" aria-label={label}>
      {RESULT_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={value === option.key}
          title={value === option.key ? `${option.title} (กดอีกครั้งเพื่อยกเลิก)` : option.title}
          className={`inspection-choice is-${option.key}${value === option.key ? ' is-selected' : ''}`}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const MI_ICONS = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
}

function MiIcon({ type }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {MI_ICONS[type]}
    </svg>
  )
}

export default function MoveInInspectionPanel({ Modal, FilterPanel }) {
  const [inspections, setInspections] = useState([])
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const load = useCallback(
    () =>
      Promise.all([
        axios.get('/api/staff/move-in-inspections', { headers: authHeaders() }),
        axios.get('/api/staff/move-in-inspections/candidates', { headers: authHeaders() }),
      ])
        .then(([list, rooms]) => {
          setInspections(list.data.inspections)
          setCandidates(rooms.data.candidates)
          setListError('')
        })
        .catch((error) => setListError(error.response?.data?.message || 'ไม่สามารถโหลดผลตรวจก่อนเข้าอยู่ได้'))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const pending = candidates.filter((item) => !item.inspection_id)
  const keyword = query.trim().toLowerCase()
  const matchesQuery = (...fields) => !keyword || fields.some((field) => String(field ?? '').toLowerCase().includes(keyword))
  const latestByTenant = new Map()
  for (const inspection of inspections) {
    const key = `${inspection.customer_id}:${inspection.room_number}`
    const entry = latestByTenant.get(key)
    if (entry) entry.saveCount += 1
    else latestByTenant.set(key, { inspection, saveCount: 1 })
  }
  const rows = [...latestByTenant.values()].map(({ inspection, saveCount }) => {
    const summary = assetSummary(inspection.assets)
    const checklistIssues = Object.values(inspection.checklist).filter((result) => ISSUE_RESULTS.includes(result)).length
    return { inspection, saveCount, summary, issueCount: checklistIssues + summary.issueCount }
  })
  const shownPending = ['all', 'pending'].includes(filter)
    ? pending.filter((item) => matchesQuery(item.room_number, `${item.first_name} ${item.last_name}`, item.phone))
    : []
  const shownRows = filter === 'pending'
    ? []
    : rows.filter(({ inspection, issueCount }) =>
        (filter === 'all' || (filter === 'issue' ? issueCount > 0 : issueCount === 0))
        && matchesQuery(inspection.room_number, inspection.tenant_name, inspection.tenant_phone))

  const openEdit = async (inspection, { startNew = false } = {}) => {
    try {
      const { data } = await axios.get(`/api/staff/move-in-inspections/${inspection.id}`, { headers: authHeaders() })
      setSubmitError('')
      setModal({ inspection: data.inspection, startNew })
    } catch (error) {
      setListError(error.response?.data?.message || 'ไม่สามารถโหลดผลตรวจได้')
    }
  }

  const deleteSave = async (id, requestClose) => {
    setDeleting(true)
    setDeleteError('')
    try {
      const { data } = await axios.delete(`/api/staff/move-in-inspections/${id}`, { headers: authHeaders() })
      requestClose()
      load()
      if (modal?.inspection?.id !== id) await openEdit({ id: modal.inspection.id })
      else if (data.next_id) await openEdit({ id: data.next_id })
      else setModal(null)
      setNotice(data.message)
    } catch (error) {
      setDeleteError(error.response?.data?.message || 'ไม่สามารถลบบันทึกได้')
    } finally {
      setDeleting(false)
    }
  }

  const submit = async (payload, { asNewSave = false } = {}, requestClose) => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data } = modal.inspection && !asNewSave
        ? await axios.patch(`/api/staff/move-in-inspections/${modal.inspection.id}`, payload, { headers: authHeaders() })
        : await axios.post('/api/staff/move-in-inspections', payload, { headers: authHeaders() })
      setNotice(asNewSave ? 'บันทึกผลตรวจวันใหม่สำเร็จ บันทึกเดิมยังอยู่ครบ' : data.message)
      requestClose()
      load()
    } catch (error) {
      setSubmitError(error.response?.data?.message || 'ไม่สามารถบันทึกผลตรวจได้')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="staff-card staff-tab-card move-in-card">
      <div className="staff-card-header">
        <div>
          <h2>
            ตรวจก่อนเข้าอยู่ <span className="staff-count-pill">{rows.length}</span>
          </h2>
          <p className="waiting-list-storage-note">
            บันทึกสภาพห้องและราคาทรัพย์สินตามประเภทห้องก่อนผู้เช่าใหม่เข้าอยู่
            {pending.length > 0 && <strong className="move-in-pending"> · รอตรวจ {pending.length} ห้อง</strong>}
          </p>
        </div>
        <button
          type="button"
          className="staff-action-btn is-primary"
          onClick={() => {
            setSubmitError('')
            setModal({ inspection: null })
          }}
          disabled={pending.length === 0}
        >
          + ตรวจก่อนเข้าอยู่
        </button>
      </div>
      {listError && (
        <p className="staff-form-error staff-form-error-block" role="alert">
          {listError}
        </p>
      )}
      <FilterPanel
        segments={[
          { key: 'all', label: 'ทั้งหมด', count: rows.length + pending.length },
          { key: 'pending', label: 'รอตรวจ', count: pending.length },
          { key: 'good', label: 'ปกติ', count: rows.filter((row) => row.issueCount === 0).length },
          { key: 'issue', label: 'พบปัญหา', count: rows.filter((row) => row.issueCount > 0).length },
        ]}
        active={filter}
        onSegment={setFilter}
        search={query}
        onSearch={setQuery}
        searchPlaceholder="ค้นหาเลขห้อง ชื่อผู้เช่า หรือเบอร์โทร"
        resultText={`พบ ${shownPending.length + shownRows.length} จาก ${rows.length + pending.length} ห้อง`}
        canClear={filter !== 'all' || Boolean(query)}
        onClear={() => {
          setFilter('all')
          setQuery('')
        }}
      />

      <div className="mi-scroll">
        {loading && rows.length === 0 && pending.length === 0 ? (
          <p className="mi-empty">กำลังโหลด...</p>
        ) : shownPending.length + shownRows.length === 0 ? (
          <p className="mi-empty">{query || filter !== 'all' ? 'ไม่พบห้องที่ตรงกับตัวกรอง' : 'ยังไม่มีผลตรวจก่อนเข้าอยู่'}</p>
        ) : (
          <div className="mi-grid">
            {shownPending.map((candidate) => (
              <article key={`p-${candidate.room_number}`} className="mi-item is-pending">
                <div className="mi-item-head">
                  <span className="mi-room">{candidate.room_number}</span>
                  <div className="mi-tenant">
                    <strong>{candidate.first_name} {candidate.last_name}</strong>
                    <span>{candidate.phone || '-'}</span>
                  </div>
                  <span className="mi-badge is-pending">รอตรวจ</span>
                </div>
                <dl className="mi-facts">
                  <div>
                    <dt>เริ่มเช่า</dt>
                    <dd>{formatDate(candidate.rental_start_date)}</dd>
                  </div>
                  <div>
                    <dt>ทรัพย์สิน</dt>
                    <dd>{candidate.room_assets.length} รายการ</dd>
                  </div>
                  <div>
                    <dt>ประเภทห้อง</dt>
                    <dd>{candidate.room_type_name || '-'}</dd>
                  </div>
                </dl>
                <div className="mi-item-foot">
                  <span className="mi-hint">ยังไม่ได้ตรวจก่อนเข้าอยู่</span>
                  <button
                    type="button"
                    className="mi-btn is-primary"
                    onClick={() => {
                      setSubmitError('')
                      setModal({ inspection: null, candidates: [candidate] })
                    }}
                  >
                    ตรวจเลย
                  </button>
                </div>
              </article>
            ))}
            {shownRows.map(({ inspection, saveCount, summary, issueCount }) => (
              <article key={inspection.id} className={`mi-item ${issueCount > 0 ? 'is-issue' : 'is-good'}`}>
                <div className="mi-item-head">
                  <span className="mi-room">{inspection.room_number}</span>
                  <div className="mi-tenant">
                    <strong>{inspection.tenant_name}</strong>
                    <span>{inspection.tenant_phone || '-'}</span>
                  </div>
                  <span className={`mi-badge ${issueCount > 0 ? 'is-issue' : 'is-good'}`}>
                    {issueCount > 0 ? `พบปัญหา ${issueCount}` : 'ปกติ'}
                  </span>
                </div>
                <dl className="mi-facts">
                  <div>
                    <dt>บันทึกล่าสุด</dt>
                    <dd>{formatDate(inspection.inspection_date)}</dd>
                  </div>
                  <div>
                    <dt>ทรัพย์สิน</dt>
                    <dd title={formatBaht(summary.total)}>{inspection.assets.length} รายการ</dd>
                  </div>
                  <div>
                    <dt>บันทึกทั้งหมด</dt>
                    <dd>{saveCount} ครั้ง · {Number(inspection.photo_count) || 0} รูป</dd>
                  </div>
                </dl>
                <span className="mi-inspector">
                  <MiIcon type="user" />
                  ตรวจล่าสุดโดย {inspection.inspected_by_name || '-'}
                </span>
                <div className="mi-item-foot is-actions">
                  <button type="button" className="mi-btn" onClick={() => openEdit(inspection)}>
                    <MiIcon type="eye" />
                    ดู / แก้ไข
                  </button>
                  <button type="button" className="mi-btn is-primary" onClick={() => openEdit(inspection, { startNew: true })}>
                    <MiIcon type="plus" />
                    บันทึกวันใหม่
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.inspection ? `แก้ไขผลตรวจก่อนเข้าอยู่ ห้อง ${modal.inspection.room_number}` : 'ตรวจห้องก่อนเข้าอยู่'}
          onClose={() => setModal(null)}
          variant="inspection"
        >
          {(requestClose) => (
            <MoveInInspectionForm
              key={`${modal.inspection?.id ?? 'new'}-${modal.startNew ? 'add' : 'edit'}`}
              candidates={modal.candidates || pending}
              initial={modal.inspection}
              startNew={Boolean(modal.startNew)}
              submitting={submitting}
              error={submitError}
              onSubmit={(payload, options) => submit(payload, options, requestClose)}
              onLoadSave={(id) => openEdit({ id })}
              onDeleteSave={(save) => {
                setDeleteError('')
                setConfirmDelete(save)
              }}
              onCancel={requestClose}
            />
          )}
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="ยืนยันลบบันทึกผลตรวจ" onClose={() => !deleting && setConfirmDelete(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                </svg>
              </div>
              <div className="staff-confirm-message-card is-error">
                <span className="staff-confirm-message-label">ต้องการลบบันทึกนี้ใช่ไหม</span>
                <p className="staff-confirm-message">
                  บันทึกครั้งที่ {confirmDelete.order} · วันที่ {formatDate(confirmDelete.inspection_date)}
                </p>
                <ul className="staff-confirm-message-points">
                  <li>ผลตรวจ: {confirmDelete.issue_count > 0 ? `พบปัญหา ${confirmDelete.issue_count} รายการ` : 'ปกติ'}</li>
                  <li>รูปประกอบ {confirmDelete.photo_count} รูปจะถูกลบไปด้วย</li>
                  <li>ลบแล้วกู้คืนไม่ได้</li>
                </ul>
              </div>
              {deleteError && (
                <p className="staff-form-error" role="alert">
                  {deleteError}
                </p>
              )}
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose} disabled={deleting}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="staff-action-btn is-danger"
                  onClick={() => deleteSave(confirmDelete.id, requestClose)}
                  disabled={deleting}
                >
                  {deleting ? 'กำลังลบ...' : 'ลบบันทึก'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {notice && (
        <Modal title="สำเร็จ" onClose={() => setNotice('')} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="staff-confirm-message-card is-success">
                <span className="staff-confirm-message-label">ผลการดำเนินการ</span>
                <p className="staff-confirm-message">{notice}</p>
              </div>
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                  ปิด
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
