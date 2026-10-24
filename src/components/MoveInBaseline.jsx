import { useState } from 'react'
import { createPortal } from 'react-dom'
import PhotoLightbox from './PhotoLightbox.jsx'
import { UploadImage } from './UploadMedia.jsx'
import { CHECKLIST_ITEMS, ISSUE_RESULTS, RESULT_LABELS } from '../utils/inspectionChecklist.js'
import { compareWithMoveIn } from '../utils/moveInBaseline.js'
import './MoveInBaseline.css'

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function MoveInCompareTag({ before, after }) {
  const compare = compareWithMoveIn(before, after)
  return (
    <span className={`mib-tag is-${compare.tone}`}>
      {compare.label}
      {compare.isNew && <b>เกิดขึ้นใหม่</b>}
      {!compare.isNew && ISSUE_RESULTS.includes(before) && ISSUE_RESULTS.includes(after) && <b>มีมาตั้งแต่ก่อนเข้าอยู่</b>}
    </span>
  )
}

const ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M10 21v-6h4v6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  note: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" /><circle cx="12" cy="13" r="3" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  check: <path d="m5 12 5 5L20 7" />,
  chevron: <path d="m6 9 6 6 6-6" />,
}

function Icon({ type, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[type]}
    </svg>
  )
}

const MAX_THUMBS = 6
const COUNT_ORDER = ['good', 'wear', 'damaged', 'missing', 'not_applicable']
const shortLabel = (label) => label.replace(/\s*\(.*\)$/, '')

const RING_RADIUS = 22
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

function ConditionRing({ value, total, tone }) {
  const ratio = total > 0 ? value / total : 0
  return (
    <span className={`mib-ring is-${tone}`} role="img" aria-label={`สภาพปกติ ${Math.round(ratio * 100)}%`}>
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle className="mib-ring-track" cx="28" cy="28" r={RING_RADIUS} />
        <circle
          className="mib-ring-value"
          cx="28"
          cy="28"
          r={RING_RADIUS}
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - ratio)}
        />
      </svg>
      <b>{Math.round(ratio * 100)}%</b>
    </span>
  )
}

const MAX_GRID_COLUMNS = 4

function gridColumns(count) {
  const rows = Math.max(1, Math.ceil(count / MAX_GRID_COLUMNS))
  return Math.max(1, Math.ceil(count / rows))
}

function ConditionGrid({ title, items }) {
  return (
    <section className="mib-grid-section">
      <h5 className="mib-grid-title">
        {title} <small>{items.length} รายการ</small>
      </h5>
      <ul className="mib-grid" style={{ '--mib-cols': gridColumns(items.length) }}>
        {items.map((item) => {
          const result = item.result || 'none'
          return (
            <li key={item.key} className={`is-${result}`}>
              <span className="mib-grid-name" title={item.label}>{item.label}</span>
              <span className={`mib-status is-${result}`}>
                <i aria-hidden="true" />
                {RESULT_LABELS[item.result] || 'ไม่ได้ตรวจ'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function MoveInBaselineCard({ baseline, loading = false, error = '', title = 'เทียบกับผลตรวจก่อนเข้าอยู่' }) {
  const [open, setOpen] = useState(true)
  const [photoIndex, setPhotoIndex] = useState(null)
  const [filter, setFilter] = useState('all')

  if (loading) {
    return (
      <div className="mib-card is-empty">
        <span className="mib-empty-icon"><Icon type="home" size={18} /></span>
        <div><strong>กำลังโหลดผลตรวจก่อนเข้าอยู่...</strong></div>
      </div>
    )
  }
  if (error || !baseline) {
    return (
      <div className="mib-card is-empty">
        <span className="mib-empty-icon"><Icon type="home" size={18} /></span>
        <div>
          <strong>{error ? 'โหลดผลตรวจก่อนเข้าอยู่ไม่สำเร็จ' : 'ไม่มีผลตรวจก่อนเข้าอยู่'}</strong>
          <span>{error || 'ผู้เช่าคนนี้ไม่ได้ตรวจห้องก่อนเข้าอยู่ จึงไม่มีข้อมูลให้เทียบ'}</span>
        </div>
      </div>
    )
  }

  const photos = baseline.photos || []
  const thumbs = photos.slice(0, MAX_THUMBS)
  const hiddenCount = photos.length - thumbs.length
  const assets = baseline.assets || []
  const results = [...CHECKLIST_ITEMS.map((item) => baseline.checklist?.[item.key]), ...assets.map((asset) => asset.result)].filter(Boolean)
  const counts = Object.fromEntries(COUNT_ORDER.map((key) => [key, results.filter((result) => result === key).length]))
  const issues = results.filter((result) => ISSUE_RESULTS.includes(result))
  const roomItems = CHECKLIST_ITEMS.map((item) => ({ key: item.key, label: shortLabel(item.label), result: baseline.checklist?.[item.key] }))
  const assetItems = assets.map((asset) => ({ key: asset.name, label: asset.name, result: asset.result }))
  const matches = (item) => filter === 'all' || item.result === filter
  const shownRoom = roomItems.filter(matches)
  const shownAssets = assetItems.filter(matches)

  return (
    <div className={`mib-card${open ? ' is-open' : ''}`}>
      <button type="button" className="mib-head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="mib-head-icon"><Icon type="home" size={18} /></span>
        <span className="mib-head-main">
          <strong>{title}</strong>
          <span className="mib-meta">
            <span><Icon type="calendar" size={13} />บันทึกล่าสุด {formatDate(baseline.inspection_date)}</span>
            {baseline.inspected_by_name && <span><Icon type="user" size={13} />{baseline.inspected_by_name}</span>}
            <span><Icon type="camera" size={13} />{photos.length} รูป</span>
          </span>
        </span>
        <span className={`mib-pill ${issues.length > 0 ? 'is-issue' : 'is-good'}`}>
          <Icon type={issues.length > 0 ? 'alert' : 'check'} size={13} />
          {issues.length > 0 ? `ชำรุดอยู่แล้ว ${issues.length}` : 'สภาพปกติ'}
        </span>
        <span className="mib-chevron"><Icon type="chevron" size={16} /></span>
      </button>
      {open && (
        <div className="mib-body">
          <section className="mib-block">
            <div className="mib-block-head">
              <span className="mib-label"><Icon type="clipboard" size={13} />สภาพห้องตอนเข้าอยู่</span>
            </div>
            <div className="mib-summary">
              <div className="mib-ring-wrap">
                <ConditionRing value={counts.good} total={results.length} tone={issues.length > 0 ? 'issue' : counts.wear > 0 ? 'wear' : 'good'} />
                <div className="mib-summary-text">
                  <strong>{counts.good} / {results.length}</strong>
                  <span>รายการอยู่ในสภาพปกติ</span>
                </div>
              </div>
              <div className="mib-stats" role="group" aria-label="กรองตามสภาพ">
                {['all', ...COUNT_ORDER].map((key) => {
                  const count = key === 'all' ? roomItems.length + assetItems.length : counts[key]
                  const active = filter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`is-${key}${count === 0 ? ' is-zero' : ''}${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      disabled={count === 0 && !active}
                      onClick={() => setFilter(active ? 'all' : key)}
                    >
                      <strong>{count}</strong>
                      <span>{key === 'all' ? 'ทั้งหมด' : RESULT_LABELS[key]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {filter !== 'all' && (
              <div className="mib-filter-bar">
                <span>
                  แสดงเฉพาะ <b>{RESULT_LABELS[filter]}</b> · {shownRoom.length + shownAssets.length} รายการ
                </span>
                <button type="button" className="mib-link" onClick={() => setFilter('all')}>ล้างตัวกรอง</button>
              </div>
            )}
            {shownRoom.length + shownAssets.length > 0 ? (
              <div className="mib-grid-wrap">
                {shownRoom.length > 0 && <ConditionGrid title="ตัวห้อง" items={shownRoom} />}
                {shownAssets.length > 0 && <ConditionGrid title="อุปกรณ์และทรัพย์สิน" items={shownAssets} />}
              </div>
            ) : (
              <p className="mib-note is-empty">ไม่มีรายการที่ตรงกับตัวกรอง</p>
            )}
            {issues.length > 0 && (
              <p className="mib-issue-note">
                <Icon type="alert" size={13} />
                รายการที่ชำรุด/สูญหายตั้งแต่ก่อนเข้าอยู่ {issues.length} รายการ จะไม่ถูกคิดค่าเสียหายตอนย้ายออก
              </p>
            )}
          </section>
          <section className="mib-block">
            <div className="mib-block-head">
              <span className="mib-label"><Icon type="note" size={13} />รายละเอียดตอนเข้าอยู่</span>
            </div>
            <p className={`mib-note is-detail${baseline.note ? '' : ' is-empty'}`}>{baseline.note || 'ไม่มีบันทึกเพิ่มเติม'}</p>
          </section>
          <section className="mib-block">
            <div className="mib-block-head">
              <span className="mib-label"><Icon type="camera" size={13} />รูปตอนเข้าอยู่</span>
              {photos.length > 0 && (
                <button type="button" className="mib-link" onClick={() => setPhotoIndex(0)}>
                  ดูทั้งหมด {photos.length} รูป
                </button>
              )}
            </div>
            {photos.length > 0 ? (
              <div className="mib-photos">
                {thumbs.map((photo, index) => {
                  const more = index === thumbs.length - 1 && hiddenCount > 0
                  return (
                    <button
                      type="button"
                      key={`${photo.url}-${index}`}
                      className="mib-photo"
                      onClick={() => setPhotoIndex(index)}
                      aria-label={more ? `ดูรูปทั้งหมด ${photos.length} รูป` : `ดูรูปตอนเข้าอยู่ที่ ${index + 1}`}
                    >
                      <UploadImage src={photo.url} alt="" loading="lazy" />
                      {more && <span className="mib-photo-more">+{hiddenCount + 1}</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="mib-note is-empty">ไม่มีรูปแนบตอนเข้าอยู่</p>
            )}
          </section>
        </div>
      )}
      {photoIndex !== null && photos[photoIndex] && createPortal(
        <PhotoLightbox
          photos={photos}
          initialIndex={photoIndex}
          title={`ผลตรวจก่อนเข้าอยู่ ห้อง ${baseline.room_number}`}
          subtitle={baseline.tenant_name}
          label={`ภาพตรวจก่อนเข้าอยู่ ห้อง ${baseline.room_number}`}
          onClose={() => setPhotoIndex(null)}
        />,
        document.body,
      )}
    </div>
  )
}
