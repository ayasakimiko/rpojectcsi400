import { UploadImage } from './UploadMedia.jsx'
import { PersonIcon } from './ParcelIcons.jsx'
import { InspectionPurposeBadge } from './InspectionCells.jsx'
import { getInspectionSourceLabel } from '../utils/inspectionSource.js'
import './InspectionCells.css'
import './InspectionDetail.css'

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

const RESULT_INFO = {
  good: { label: 'ปกติ', tone: 'success' },
  wear: { label: 'สึกหรอตามปกติ', tone: 'warning' },
  damaged: { label: 'ชำรุด', tone: 'danger' },
  missing: { label: 'สูญหาย', tone: 'danger' },
  not_applicable: { label: 'ไม่มี/ไม่ได้ติดตั้ง', tone: 'muted' },
}
const RESULT_NONE = { label: 'ไม่ได้ระบุ', tone: 'muted' }
const TONE_LABEL = { danger: 'พบชำรุด/สูญหาย', warning: 'พบสึกหรอ', success: 'สภาพปกติ' }

const ICON_PATHS = {
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.7L8.7 10.5a16 16 0 0 0 4.8 4.8l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.5a2 2 0 0 1 1.7 2Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></>,
  note: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" /><circle cx="12" cy="13" r="3" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M10 21v-6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6" /></>,
  chevron: <path d="M9 18l6-6-6-6" />,
  arrow: <><line x1="4" y1="12" x2="20" y2="12" /><polyline points="14 6 20 12 14 18" /></>,
}

function Icon({ type, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[type]}
    </svg>
  )
}

function summarize(checklist) {
  const counts = { good: 0, wear: 0, damaged: 0, missing: 0, not_applicable: 0 }
  for (const result of Object.values(checklist || {})) {
    if (result in counts) counts[result] += 1
  }
  const tone = counts.damaged + counts.missing > 0 ? 'danger' : counts.wear > 0 ? 'warning' : 'success'
  return { counts, tone }
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function InspectionDetail({
  inspection,
  statusLabel,
  statusTone,
  actorClassName = '',
  photoLimit = null,
  onOpenPhoto,
  onOpenGallery,
  footer = null,
  purposeInHeader = false,
}) {
  const summary = summarize(inspection.checklist)
  const issueCount = summary.counts.damaged + summary.counts.missing
  const isMoveRoom = inspection.tenant_request_type === 'move_room'
  const photos = inspection.photos || []
  const shownPhotos = photoLimit ? photos.slice(0, photoLimit) : photos
  const inspector = inspection.inspected_by || inspection.inspected_by_name

  return (
    <div className="idt">
      <div className="idt-body">
        <div className={`idt-hero is-${summary.tone}`}>
          <div className="idt-hero-top">
            <span className="idt-avatar" aria-hidden="true"><PersonIcon size={22} /></span>
            <div className="idt-hero-main">
              <strong>{inspection.tenant_name || '-'}</strong>
              <div className="idt-hero-rooms">
                {isMoveRoom ? (
                  <>
                    <span className="insp-room-pill">{inspection.room_number}</span>
                    <Icon type="arrow" size={14} />
                    <span className="insp-room-pill is-target">{inspection.target_room_number || '-'}</span>
                    <small>ตรวจห้องก่อนย้าย</small>
                  </>
                ) : (
                  <>
                    <span className="insp-room-pill">
                      <Icon type="home" size={13} />
                      ห้อง {inspection.room_number}
                    </span>
                    <small>ตรวจห้องย้ายออก</small>
                  </>
                )}
              </div>
            </div>
            {statusLabel && (
              <div className="idt-hero-status">
                <span className="idt-hero-status-label">สถานะตอนนี้</span>
                <span className={`insp-status-badge is-${statusTone || 'pending'}`}>{statusLabel}</span>
              </div>
            )}
          </div>
          <div className={`idt-source${purposeInHeader ? ' is-reference' : ''}`}>
            {!purposeInHeader && <><span>ประเภทการตรวจ</span><InspectionPurposeBadge inspection={inspection} /></>}
            <small>ที่มา: {getInspectionSourceLabel(inspection)}</small>
          </div>
          <dl className="idt-meta">
            <div>
              <dt><Icon type="phone" size={13} />เบอร์โทร</dt>
              <dd>{inspection.tenant_phone ? <a href={`tel:${inspection.tenant_phone}`}>{inspection.tenant_phone}</a> : '-'}</dd>
            </div>
            <div>
              <dt><Icon type="user" size={13} />ตรวจโดย</dt>
              <dd className={inspector ? actorClassName : ''}>{inspector || '-'}</dd>
            </div>
            <div>
              <dt><Icon type="calendar" size={13} />ตรวจเมื่อ</dt>
              <dd>{formatDateTime(inspection.created_at)}</dd>
            </div>
          </dl>
        </div>

        <section className="idt-section">
          <h4><Icon type="note" size={16} />รายละเอียดที่พบ / หมายเหตุ</h4>
          <div className={`idt-note${inspection.damage_note ? '' : ' is-empty'}`}>
            <p>{inspection.damage_note || 'ไม่มีบันทึกความเสียหาย'}</p>
          </div>
        </section>

        <section className="idt-section">
          <div className="idt-section-head">
            <h4><Icon type="clipboard" size={16} />Checklist</h4>
            <span className={`idt-result is-${summary.tone}`}>
              {TONE_LABEL[summary.tone]}
              {issueCount > 0 && ` ${issueCount} ข้อ`}
            </span>
          </div>
          <div className="idt-counts">
            <span className="is-success"><strong>{summary.counts.good}</strong>ปกติ</span>
            <span className="is-warning"><strong>{summary.counts.wear}</strong>สึกหรอ</span>
            <span className="is-danger"><strong>{summary.counts.damaged}</strong>ชำรุด</span>
            <span className="is-danger"><strong>{summary.counts.missing}</strong>สูญหาย</span>
            <span><strong>{summary.counts.not_applicable}</strong>ไม่มี</span>
          </div>
          <ul className="idt-checklist">
            {CHECKLIST_ITEMS.map((item) => {
              const info = RESULT_INFO[inspection.checklist?.[item.key]] || RESULT_NONE
              return (
                <li key={item.key} className={`is-${info.tone}`}>
                  <span className={`idt-dot is-${info.tone}`} aria-hidden="true" />
                  <span className="idt-checklist-label">{item.label}</span>
                  <span className={`idt-chip is-${info.tone}`}>{info.label}</span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="idt-section">
          <div className="idt-section-head">
            <h4>
              <Icon type="camera" size={16} />
              รูปภาพประกอบ
              <span className="idt-count">{photos.length}</span>
            </h4>
            {onOpenGallery && photos.length > shownPhotos.length && (
              <button type="button" className="idt-link" onClick={onOpenGallery}>
                ดูทั้งหมด
                <Icon type="chevron" size={13} />
              </button>
            )}
          </div>
          {shownPhotos.length ? (
            <div className="idt-photos">
              {shownPhotos.map((photo, index) => (
                <button type="button" key={`${photo.url}-${index}`} onClick={() => onOpenPhoto?.(index)} title="ดูรูปขนาดเต็ม">
                  <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
                  <span>{photo.name || `รูปที่ ${index + 1}`}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="idt-empty">
              <Icon type="camera" size={20} />
              <span>ไม่มีรูปภาพแนบ</span>
            </div>
          )}
        </section>
      </div>
      {footer}
    </div>
  )
}
