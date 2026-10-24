import { useState } from 'react'
import { UploadImage } from './UploadMedia.jsx'
import { PersonIcon } from './ParcelIcons.jsx'
import { InspectionPurposeBadge } from './InspectionCells.jsx'
import { getInspectionSourceLabel } from '../utils/inspectionSource.js'
import { assetCost, chargeableAssetCost } from '../utils/inspectionChecklist.js'
import MoveInBaselineCard from './MoveInBaseline.jsx'
import InspectionTopicFilter from './InspectionTopicFilter.jsx'
import { changeBetween } from '../utils/moveInBaseline.js'
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
const CHANGE_INFO = {
  new: { label: 'เกิดขึ้นใหม่', tone: 'danger' },
  worse: { label: 'แย่ลง', tone: 'warning' },
  better: { label: 'ดีขึ้น', tone: 'success' },
  same: { label: 'เหมือนเดิม', tone: 'muted' },
  unknown: { label: 'เทียบไม่ได้', tone: 'muted' },
}

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

function formatBaht(value) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
  const isMoveRoom = inspection.tenant_request_type === 'move_room'
  const photos = inspection.photos || []
  const shownPhotos = photoLimit ? photos.slice(0, photoLimit) : photos
  const inspector = inspection.inspected_by || inspection.inspected_by_name
  const [checklistView, setChecklistView] = useState('result')
  const [topic, setTopic] = useState('all')
  const show = (key) => topic === 'all' || topic === key
  const topics = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'note', label: 'รายละเอียด' },
    ...((inspection.assets || []).length > 0 ? [{ key: 'assets', label: 'อุปกรณ์และทรัพย์สิน' }] : []),
    ...(inspection.move_in_baseline !== undefined ? [{ key: 'baseline', label: 'ผลตรวจก่อนเข้าอยู่' }] : []),
    { key: 'checklist', label: 'Checklist' },
    { key: 'photos', label: 'รูปภาพ' },
  ]
  const assets = inspection.assets || []
  const assetTotal = assets.reduce((sum, asset) => sum + (Number(asset.price) || 0), 0)
  const assetCharge = chargeableAssetCost(assets)
  const assetIssues = assets.filter((asset) => ['damaged', 'missing'].includes(asset.result)).length
  const compareRows = CHECKLIST_ITEMS.map((item) => {
    const beforeKey = inspection.move_in_baseline?.checklist?.[item.key]
    const afterKey = inspection.checklist?.[item.key]
    return {
      key: item.key,
      label: item.label.replace(/\s*\(.*\)$/, ''),
      before: RESULT_INFO[beforeKey] || RESULT_NONE,
      after: RESULT_INFO[afterKey] || RESULT_NONE,
      change: changeBetween(beforeKey, afterKey),
      cost: Number(inspection.item_costs?.[item.key]) || 0,
    }
  })
  const compareTally = compareRows.reduce((acc, row) => ({ ...acc, [row.change]: (acc[row.change] || 0) + 1 }), {})
  const hasBaseline = inspection.move_in_baseline !== undefined
  const baseline = inspection.move_in_baseline || null

  return (
    <div className="idt">
      <div className="idt-body" data-topic-root>
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

        <InspectionTopicFilter topics={topics} value={topic} onChange={setTopic} />

        <section className="idt-section" data-topic="note" hidden={!show('note')}>
          <h4><Icon type="note" size={16} />รายละเอียดที่พบ / หมายเหตุ</h4>
          <div className={`idt-note${inspection.damage_note ? '' : ' is-empty'}`}>
            <p>{inspection.damage_note || 'ไม่มีบันทึกความเสียหาย'}</p>
          </div>
          {(isMoveRoom || Number(inspection.damage_cost) > 0) && (
            <p className="idt-damage-cost">
              {isMoveRoom ? 'ค่าเสียหายที่หักจากเงินมัดจำ' : 'ค่าเสียหายจากทรัพย์สิน (ใช้หักเงินมัดจำ)'}{' '}
              <b>{Number(inspection.damage_cost) > 0 ? formatBaht(inspection.damage_cost) : 'ไม่มี'}</b>
            </p>
          )}
        </section>

        {assets.length > 0 && (
          <section className="idt-section" data-topic="assets" hidden={!show('assets')}>
            <div className="idt-section-head">
              <h4><Icon type="clipboard" size={16} />อุปกรณ์และทรัพย์สินในห้อง</h4>
              <span className={`idt-result is-${assetCharge > 0 ? 'danger' : 'success'}`}>
                {assetCharge > 0 ? `คิดค่าเสียหาย ${formatBaht(assetCharge)}` : 'ไม่มีค่าเสียหาย'}
              </span>
            </div>
            <dl className="idt-asset-summary">
              <div>
                <dt>ทั้งหมด</dt>
                <dd>{assets.length} รายการ</dd>
              </div>
              <div>
                <dt>มูลค่ารวม</dt>
                <dd>{formatBaht(assetTotal)}</dd>
              </div>
              <div className={assetIssues > 0 ? 'is-danger' : ''}>
                <dt>ชำรุด/สูญหาย</dt>
                <dd>{assetIssues} รายการ</dd>
              </div>
              <div className={assetCharge > 0 ? 'is-danger' : ''}>
                <dt>ค่าเสียหาย</dt>
                <dd>{formatBaht(assetCharge)}</dd>
              </div>
            </dl>
            <div className="idt-assets" role="table" aria-label="อุปกรณ์และทรัพย์สินในห้อง">
              <div className="idt-asset-row is-head" role="row">
                <span role="columnheader">อุปกรณ์</span>
                <span role="columnheader">ราคา</span>
                <span role="columnheader">ตอนเข้าอยู่ → ครั้งนี้</span>
                <span role="columnheader">ค่าเสียหาย</span>
              </div>
              {assets.map((asset) => {
                const after = RESULT_INFO[asset.result] || RESULT_NONE
                const before = RESULT_INFO[asset.move_in_result] || RESULT_NONE
                const change = changeBetween(asset.move_in_result, asset.result)
                const cost = assetCost(asset)
                return (
                  <div key={asset.name} role="row" className={`idt-asset-row is-${after.tone}${change === 'new' ? ' is-new' : ''}`}>
                    <span role="cell" className="idt-asset-name">
                      {asset.name}
                      {change === 'new' && <em>เกิดขึ้นใหม่</em>}
                    </span>
                    <span role="cell" className="idt-asset-price">{formatBaht(asset.price)}</span>
                    <span role="cell" className="idt-asset-flow">
                      <span className={`idt-chip is-${before.tone}`} title="ตอนเข้าอยู่">{asset.move_in_result ? before.label : 'ไม่ได้บันทึก'}</span>
                      <Icon type="arrow" size={13} />
                      <span className={`idt-chip is-${after.tone}`} title="ตรวจครั้งนี้">{after.label}</span>
                    </span>
                    <span role="cell" className={`idt-asset-cost${cost > 0 ? ' is-charged' : ''}`}>{cost > 0 ? formatBaht(cost) : '—'}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {hasBaseline && (
          <section className="idt-section" data-topic="baseline" hidden={!show('baseline')}>
            <h4><Icon type="home" size={16} />ผลตรวจก่อนเข้าอยู่</h4>
            <MoveInBaselineCard baseline={baseline} title="ผลตรวจก่อนเข้าอยู่ของผู้เช่าคนนี้" />
          </section>
        )}

        <section className="idt-section" data-topic="checklist" hidden={!show('checklist')}>
          <div className="idt-section-head">
            <h4><Icon type="clipboard" size={16} />Checklist</h4>
            <div className="idt-view-toggle" role="tablist" aria-label="มุมมอง Checklist">
              <button type="button" role="tab" aria-selected={checklistView === 'result'} className={checklistView === 'result' ? 'is-active' : ''} onClick={() => setChecklistView('result')}>
                ผลตรวจ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={checklistView === 'compare'}
                className={checklistView === 'compare' ? 'is-active' : ''}
                disabled={!baseline}
                title={baseline ? undefined : 'ไม่มีผลตรวจก่อนเข้าอยู่ให้เปรียบเทียบ'}
                onClick={() => setChecklistView('compare')}
              >
                ผลตรวจก่อนเข้าอยู่
              </button>
            </div>
          </div>
          {checklistView === 'compare' && baseline ? (
            <>
              <div className="idt-compare-tally">
                {['new', 'worse', 'better', 'same'].map((key) => (
                  <span key={key} className={`is-${CHANGE_INFO[key].tone}${compareTally[key] ? '' : ' is-zero'}`}>
                    <strong>{compareTally[key] || 0}</strong>
                    {CHANGE_INFO[key].label}
                  </span>
                ))}
              </div>
              <div className="idt-compare" role="table" aria-label="เปรียบเทียบ Checklist กับตอนเข้าอยู่">
                <div className="idt-compare-row is-head" role="row">
                  <span role="columnheader">รายการ</span>
                  <span role="columnheader">ตอนเข้าอยู่</span>
                  <span role="columnheader">ครั้งนี้</span>
                  <span role="columnheader">ผลเทียบ</span>
                </div>
                {compareRows.map((row) => (
                  <div key={row.key} role="row" className={`idt-compare-row is-${row.change}`}>
                    <span role="cell" className="idt-compare-name">
                      {row.label}
                      {row.cost > 0 && <small>ค่าเสียหาย {formatBaht(row.cost)}</small>}
                    </span>
                    <span role="cell"><span className={`idt-chip is-${row.before.tone}`}>{row.before.label}</span></span>
                    <span role="cell"><span className={`idt-chip is-${row.after.tone}`}>{row.after.label}</span></span>
                    <span role="cell" className={`idt-compare-change is-${CHANGE_INFO[row.change].tone}`}>{CHANGE_INFO[row.change].label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
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
                  const itemCost = Number(inspection.item_costs?.[item.key]) || 0
                  return (
                    <li key={item.key} className={`is-${info.tone}`}>
                      <span className={`idt-dot is-${info.tone}`} aria-hidden="true" />
                      <span className="idt-checklist-label">
                        {item.label}
                        {itemCost > 0 && <small className="idt-asset-before">ค่าเสียหาย {formatBaht(itemCost)}</small>}
                      </span>
                      <span className={`idt-chip is-${info.tone}`}>{info.label}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        <section className="idt-section" data-topic="photos" hidden={!show('photos')}>
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
