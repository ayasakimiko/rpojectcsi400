import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import InspectionPhotoPicker from './InspectionPhotoPicker.jsx'
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

function MoveInInspectionForm({ candidates, initial, submitting, error, onSubmit, onCancel }) {
  const isCreate = !initial
  const [roomNumber, setRoomNumber] = useState(() => (isCreate && candidates.length === 1 ? String(candidates[0].room_number) : ''))
  const [inspectionDate, setInspectionDate] = useState(initial?.inspection_date || todayKey())
  const [checklist, setChecklist] = useState(() => ({ ...(initial?.checklist || {}) }))
  const [assets, setAssets] = useState(() =>
    (initial?.assets || (isCreate && candidates.length === 1 ? candidates[0].room_assets : [])).map(assetRow),
  )
  const [note, setNote] = useState(initial?.note || '')
  const [existingPhotos, setExistingPhotos] = useState(initial?.photos || [])
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

  const submit = async (event) => {
    event.preventDefault()
    const errors = {}
    if (isCreate && !selected) errors.room = 'กรุณาเลือกห้องที่ต้องการตรวจ'
    if (!inspectionDate) errors.date = 'กรุณาเลือกวันที่ตรวจ'
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
      else payload.keep_photos = existingPhotos.map((photo) => photo.url)
      onSubmit(payload)
    } catch (compressError) {
      setLocalError(compressError.message || 'ไม่สามารถประมวลผลรูปภาพได้')
    }
  }

  const shownError = localError || error

  return (
    <form className="inspection-form move-in-form" onSubmit={submit} noValidate>
      <div className="inspection-topic-filter" role="group" aria-label="กรองหัวข้อการตรวจห้อง">
        <span>เลือกหัวข้อที่ต้องการดู</span>
        <div className="inspection-topic-options">
          {TOPICS.map(({ key, label }) => (
            <button key={key} type="button" className={section === key ? 'is-active' : ''} aria-pressed={section === key} onClick={() => setSection(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

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
          <div className="move-in-setup-block move-in-date-field">
            <div className="move-in-setup-head">
              <span className="staff-form-label">
                วันที่ตรวจ <span className="staff-form-required">*</span>
              </span>
              <span className="move-in-setup-meta">เลือกได้ถึงวันนี้</span>
            </div>
            <div className="move-in-date-row">
              <ThaiDatePicker
                className={`staff-form-input${fieldErrors.date ? ' is-invalid' : ''}`}
                value={inspectionDate}
                maxDate={new Date()}
                onChange={(value) => {
                  setInspectionDate(value)
                  clearFieldError('date')
                }}
              />
              <button
                type="button"
                className={`move-in-date-today${inspectionDate === todayKey() ? ' is-active' : ''}`}
                onClick={() => {
                  setInspectionDate(todayKey())
                  clearFieldError('date')
                }}
              >
                วันนี้
              </button>
            </div>
            {fieldErrors.date && <span className="staff-form-field-error">{fieldErrors.date}</span>}
          </div>
        </div>
      </section>

      <section className="inspection-section" hidden={!['all', 'checklist'].includes(section)}>
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
            <span className="inspection-counts">
              {RESULT_OPTIONS.map((option) => (
                <span key={option.key} className={`is-${option.key}`}>
                  {option.label} {counts[option.key]}
                </span>
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

      <section className="inspection-section" hidden={!['all', 'photos'].includes(section)}>
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
            {submitting ? 'กำลังบันทึก...' : isCreate ? 'บันทึกผลตรวจ' : 'บันทึกการแก้ไข'}
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

export default function MoveInInspectionPanel({ Modal }) {
  const [inspections, setInspections] = useState([])
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

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

  const openEdit = async (inspection) => {
    try {
      const { data } = await axios.get(`/api/staff/move-in-inspections/${inspection.id}`, { headers: authHeaders() })
      setSubmitError('')
      setModal({ inspection: data.inspection })
    } catch (error) {
      setListError(error.response?.data?.message || 'ไม่สามารถโหลดผลตรวจได้')
    }
  }

  const submit = async (payload, requestClose) => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data } = modal.inspection
        ? await axios.patch(`/api/staff/move-in-inspections/${modal.inspection.id}`, payload, { headers: authHeaders() })
        : await axios.post('/api/staff/move-in-inspections', payload, { headers: authHeaders() })
      setNotice(data.message)
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
            ตรวจก่อนเข้าอยู่ <span className="staff-count-pill">{inspections.length}</span>
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
      {notice && (
        <p className="move-in-notice" role="status">
          {notice}
        </p>
      )}
      {listError && (
        <p className="staff-form-error staff-form-error-block" role="alert">
          {listError}
        </p>
      )}
      <div className="table-responsive">
        <table className="staff-table move-in-table">
          <thead>
            <tr>
              <th>วันที่ตรวจ</th>
              <th>ห้อง</th>
              <th>ผู้เช่า</th>
              <th>ประเภทห้อง</th>
              <th>ทรัพย์สิน</th>
              <th>ผลตรวจ</th>
              <th>ผู้ตรวจ</th>
            </tr>
          </thead>
          <tbody>
            {inspections.length === 0 ? (
              <tr>
                <td colSpan={7} className="staff-empty">
                  {loading ? 'กำลังโหลด...' : 'ยังไม่มีผลตรวจก่อนเข้าอยู่'}
                </td>
              </tr>
            ) : (
              inspections.map((inspection) => {
                const summary = assetSummary(inspection.assets)
                const checklistIssues = Object.values(inspection.checklist).filter((result) => ISSUE_RESULTS.includes(result)).length
                const issueCount = checklistIssues + summary.issueCount
                return (
                  <tr
                    key={inspection.id}
                    className="insp-row-clickable"
                    tabIndex={0}
                    aria-label={`แก้ไขผลตรวจก่อนเข้าอยู่ห้อง ${inspection.room_number}`}
                    onClick={() => openEdit(inspection)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openEdit(inspection)
                      }
                    }}
                  >
                    <td>{formatDate(inspection.inspection_date)}</td>
                    <td>
                      <strong>{inspection.room_number}</strong>
                    </td>
                    <td>
                      {inspection.tenant_name}
                      {inspection.tenant_phone && <small className="move-in-sub">{inspection.tenant_phone}</small>}
                    </td>
                    <td>{inspection.room_type_name || <span className="move-in-muted">ไม่ระบุ</span>}</td>
                    <td>
                      {inspection.assets.length} รายการ
                      <small className="move-in-sub">{formatBaht(summary.total)}</small>
                    </td>
                    <td>
                      <span className={`move-in-result ${issueCount > 0 ? 'is-issue' : 'is-good'}`}>
                        {issueCount > 0 ? `พบปัญหา ${issueCount} รายการ` : 'ปกติ'}
                      </span>
                    </td>
                    <td>{inspection.inspected_by_name || '-'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.inspection ? `แก้ไขผลตรวจก่อนเข้าอยู่ ห้อง ${modal.inspection.room_number}` : 'ตรวจห้องก่อนเข้าอยู่'}
          onClose={() => setModal(null)}
          variant="inspection"
        >
          {(requestClose) => (
            <MoveInInspectionForm
              candidates={pending}
              initial={modal.inspection}
              submitting={submitting}
              error={submitError}
              onSubmit={(payload) => submit(payload, requestClose)}
              onCancel={requestClose}
            />
          )}
        </Modal>
      )}
    </div>
  )
}
