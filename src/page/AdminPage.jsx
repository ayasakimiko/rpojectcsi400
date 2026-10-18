import { UploadImage } from '../components/UploadMedia.jsx'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/AdminPage.css'
import './css/ParcelManagement.css'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'
import ParcelPhotoPicker from '../components/ParcelPhotoPicker.jsx'
import { CheckIcon, DoorIcon, HashIcon, NoteIcon, PackageIcon, PersonIcon, PlusIcon, TruckIcon } from '../components/ParcelIcons.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import StepTimeline from '../components/StepTimeline.jsx'
import { downloadUploadFile } from '../utils/uploadFiles.js'
import {
  InspectionDateCell,
  InspectionInspectorCell,
  InspectionPersonCell,
  InspectionPhotosCell,
  InspectionRoomCell,
} from '../components/InspectionCells.jsx'
import InspectionDetail from '../components/InspectionDetail.jsx'
import InspectionForm from '../components/InspectionForm.jsx'

const WAITING_UI_STATUSES = {
  waiting: { label: 'รอห้องว่าง', tone: 'warning' },
  contacted: { label: 'ติดต่อแล้ว', tone: 'info' },
  reserved: { label: 'จองแล้ว', tone: 'success' },
  closed: { label: 'ปิดรายการ', tone: 'muted' },
}

const WAITING_UI_ROOM_PREFERENCES = ['ห้องแอร์', 'มี Wi-Fi', 'มีตู้เย็น', 'เตียงเดี่ยว', 'เตียงคู่']

function splitWaitingPreferences(value) {
  return String(value || '').split('|').map((item) => item.trim()).filter(Boolean)
}

function waitingDayKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function waitingDateFromKey(value) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00`) : undefined
}

function formatWaitingDate(value) {
  if (!value) return '-'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? waitingDateFromKey(value) : new Date(value)
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatWaitingDateTime(value) {
  return value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
}

function waitingDaysSince(value, now) {
  if (!value) return 0
  const elapsed = now - new Date(value).getTime()
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86400000)) : 0
}

function describeWaitingMoveIn(value, now) {
  const today = new Date(now)
  const diff = Math.round((waitingDateFromKey(value).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
  if (diff < 0) return { text: `เลยกำหนด ${-diff} วัน`, tone: 'late' }
  if (diff === 0) return { text: 'วันนี้', tone: 'soon' }
  return { text: `อีก ${diff} วัน`, tone: diff <= 7 ? 'soon' : 'later' }
}

function getWaitingMoveInPresets(now) {
  const today = new Date(now)
  return [
    { label: 'สัปดาห์หน้า', value: waitingDayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)) },
    { label: 'ต้นเดือนหน้า', value: waitingDayKey(new Date(today.getFullYear(), today.getMonth() + 1, 1)) },
    { label: 'อีก 1 เดือน', value: waitingDayKey(new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())) },
  ]
}

function groupWaitingEntries(items) {
  return items.reduce((groups, item) => {
    const key = waitingDayKey(item.created_at)
    const previous = groups[groups.length - 1]
    if (previous?.key === key) previous.items.push(item)
    else groups.push({ key, date: new Date(item.created_at), items: [item] })
    return groups
  }, [])
}

function WaitingListPanel({ items, now, vacantCount, onAdd, onDetail, onEdit, onDelete, onStatusChange, statusBusyId }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('newest')
  const [dates, setDates] = useState({ from: '', to: '' })
  const [page, setPage] = useState(1)
  const counts = items.reduce((result, item) => {
    const key = WAITING_UI_STATUSES[item.status] ? item.status : 'waiting'
    result[key] = (result[key] || 0) + 1
    return result
  }, {})
  const keyword = search.trim().toLocaleLowerCase('th-TH')
  const filtered = items.filter(item => {
    const key = WAITING_UI_STATUSES[item.status] ? item.status : 'waiting'
    if (status !== 'all' && status !== key) return false
    const created = waitingDayKey(item.created_at)
    if ((dates.from && created < dates.from) || (dates.to && created > dates.to)) return false
    return !keyword || [item.full_name, item.phone, item.room_preference, item.note, item.submitted_by_name].filter(Boolean).join(' ').toLocaleLowerCase('th-TH').includes(keyword)
  }).sort((a, b) => {
    const difference = new Date(a.created_at) - new Date(b.created_at)
    return sort === 'oldest' ? difference : -difference
  })
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const filtersActive = Boolean(keyword || status !== 'all' || sort !== 'newest' || dates.from || dates.to)
  return (
    <section className="waiting-board">
      <header className="waiting-board-header">
        <div>
          <h2>รายชื่อคนรอห้องว่าง <span className="waiting-ui-count-pill">{items.length}</span></h2>
          <p className="waiting-list-storage-note">ห้องว่างตอนนี้ {vacantCount} ห้อง · รายชื่อจาก Staff และ Admin</p>
        </div>
        <button type="button" className="waiting-ui-action-btn is-primary" onClick={onAdd}>+ เพิ่มผู้สนใจ</button>
      </header>
      <div className="waiting-filter-panel">
        <div className="waiting-filter-segments" role="group" aria-label="สถานะรายชื่อ">
          {[{ key: 'all', label: 'ทั้งหมด', tone: 'all' }, ...Object.entries(WAITING_UI_STATUSES).map(([key, info]) => ({ key, ...info }))].map(info => (
            <button key={info.key} type="button" className={`waiting-filter-segment is-${info.tone}${status === info.key ? ' active' : ''}`} aria-pressed={status === info.key} onClick={() => { setStatus(info.key); setPage(1) }}>
              {info.label}<span>{info.key === 'all' ? items.length : counts[info.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="waiting-filter-row">
          <label className="waiting-filter-search">
            <span className="waiting-sr-only">ค้นหารายชื่อ</span>
            <input type="search" className="waiting-ui-form-input" placeholder="ค้นหาชื่อ เบอร์โทร ประเภทห้อง หรือหมายเหตุ" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />
          </label>
          <select className="waiting-ui-form-input waiting-filter-sort" aria-label="เรียงลำดับ" value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}>
            <option value="newest">แจ้งล่าสุดก่อน</option><option value="oldest">รอนานสุดก่อน</option>
          </select>
        </div>
        <div className="waiting-filter-dates">
          <span><WaitingDetailIcon type="calendar" />วันที่แจ้ง</span>
          <ThaiDatePicker className="waiting-ui-form-input" placeholder="ตั้งแต่วันที่" value={dates.from} maxDate={waitingDateFromKey(dates.to || waitingDayKey(now))} isClearable portalId="waiting-date-portal" onChange={value => { setDates(current => ({ ...current, from: value })); setPage(1) }} />
          <span>ถึง</span>
          <ThaiDatePicker className="waiting-ui-form-input" placeholder="ถึงวันที่" value={dates.to} minDate={waitingDateFromKey(dates.from)} maxDate={waitingDateFromKey(waitingDayKey(now))} isClearable portalId="waiting-date-portal" onChange={value => { setDates(current => ({ ...current, to: value })); setPage(1) }} />
        </div>
        <div className="waiting-filter-result">
          <span>พบ {filtered.length} จาก {items.length} รายชื่อ</span>
          {filtersActive && <button type="button" onClick={() => { setSearch(''); setStatus('all'); setSort('newest'); setDates({ from: '', to: '' }); setPage(1) }}>ล้างตัวกรอง</button>}
        </div>
      </div>
      <div className="waiting-cards-scroll">
        {pageItems.length ? <WaitingListTimeline items={pageItems} now={now} onDetail={onDetail} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} statusBusyId={statusBusyId} /> : (
          <div className="waiting-empty">
            <span className="waiting-empty-icon"><WaitingDetailIcon type="user" size={26} /></span>
            <strong>{items.length ? 'ไม่พบรายชื่อตามเงื่อนไข' : 'ยังไม่มีรายชื่อผู้รอห้องว่าง'}</strong>
            <span>{items.length ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ' : 'กด "+ เพิ่มผู้สนใจ" เพื่อบันทึกรายชื่อแรก'}</span>
          </div>
        )}
      </div>
      <nav className="waiting-pagination" aria-label="หน้ารายชื่อผู้รอห้องว่าง">
        <span>ทั้งหมด {filtered.length} รายชื่อ</span>
        <div>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</button>
          <span>หน้า {currentPage} / {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>ถัดไป</button>
        </div>
      </nav>
    </section>
  )
}

function WaitingListDelete({ item, busy, error, onClose, onConfirm }) {
  return (
    <div className="waiting-delete">
      <span className="waiting-delete-icon"><NoteIcon size={25} /></span>
      <strong>ลบรายชื่อผู้สนใจนี้ออกจากระบบ?</strong>
      <dl><div><dt>ชื่อผู้สนใจ</dt><dd>{item.full_name}</dd></div><div><dt>เบอร์โทรศัพท์</dt><dd>{item.phone}</dd></div></dl>
      {error && <p className="waiting-ui-form-error" role="alert">{error}</p>}
      <div className="waiting-ui-form-actions">
        <button type="button" className="waiting-ui-action-btn is-ghost" disabled={busy} onClick={onClose}>ยกเลิก</button>
        <button type="button" className="waiting-ui-action-btn is-danger" disabled={busy} onClick={onConfirm}>{busy ? 'กำลังลบ...' : 'ยืนยันลบ'}</button>
      </div>
    </div>
  )
}

function WaitingDetailIcon({ type, size = 16 }) {
  const paths = {
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.7L8.7 10.5a16 16 0 0 0 4.8 4.8l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.5a2 2 0 0 1 1.7 2Z" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    edit: <><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  )
}

function WaitingListTimeline({ items, now, onDetail, onEdit, onDelete, onStatusChange, statusBusyId = null }) {
  const waitingNow = now
  const waitingToday = new Date(now)
  const waitingTodayKey = waitingDayKey(now)
  const waitingYesterdayKey = waitingDayKey(new Date(waitingToday.getFullYear(), waitingToday.getMonth(), waitingToday.getDate() - 1))
  const waitingDayGroups = groupWaitingEntries(items)
  return (
    <div className="waiting-timeline">
      {waitingDayGroups.map((group) => {
        const relativeDay =
          group.key === waitingTodayKey ? 'วันนี้' : group.key === waitingYesterdayKey ? 'เมื่อวาน' : null
        const weekday = group.date.toLocaleDateString('th-TH', { weekday: 'long' })
        return (
          <section className="waiting-day" key={group.key}>
            <header className="waiting-day-head">
              <div className="waiting-day-date">
                <strong>{group.date.getDate()}</strong>
                <small>{group.date.toLocaleDateString('th-TH', { month: 'short' })}</small>
              </div>
              <div className="waiting-day-card">
                <div className="waiting-day-text">
                  <strong>{relativeDay || weekday}</strong>
                  <span>
                    {relativeDay ? `${weekday} ` : ''}
                    {group.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <span className="waiting-day-count">{group.items.length} รายชื่อ</span>
              </div>
            </header>
            <div className="waiting-day-items">
              {group.items.map((item) => {
                const status = WAITING_UI_STATUSES[item.status] ? item.status : 'waiting'
                const preferences = splitWaitingPreferences(item.room_preference)
                const days = waitingDaysSince(item.created_at, waitingNow)
                return (
                  <div className={`waiting-day-item is-${WAITING_UI_STATUSES[status].tone}`} key={item.id}>
                    <span className="waiting-day-dot" aria-hidden="true" />
                    <article className={`waiting-card is-${WAITING_UI_STATUSES[status].tone}`}>
                      <div className="waiting-card-top">
                        <span className="waiting-avatar" aria-hidden="true">
                          <PersonIcon size={18} />
                        </span>
                        <div className="waiting-card-id">
                          <div className="waiting-card-head">
                            <strong>{item.full_name}</strong>
                            <span className={`waiting-status is-${WAITING_UI_STATUSES[status].tone}`}>
                              {WAITING_UI_STATUSES[status].label}
                            </span>
                          </div>
                          <a className="waiting-card-phone" href={`tel:${item.phone}`}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
                            </svg>
                            {item.phone}
                          </a>
                        </div>
                        <div className={`waiting-card-days${days >= 30 ? ' is-long' : ''}${days === 0 ? ' is-new' : ''}`}>
                          <strong>{days === 0 ? 'ใหม่' : days}</strong>
                          <span>{days === 0 ? 'แจ้งวันนี้' : 'วันที่รอ'}</span>
                        </div>
                      </div>
                      <div className="waiting-card-body">
                        {onStatusChange && (
                          <label className="waiting-status-control">
                            <span>จัดการสถานะ</span>
                            <select value={status} disabled={statusBusyId != null} onChange={(event) => onStatusChange(item, event.target.value)} aria-label={`สถานะของ ${item.full_name}`}>
                              {Object.entries(WAITING_UI_STATUSES).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
                            </select>
                          </label>
                        )}
                        {item.desired_move_in_date && (
                          <span className={`waiting-movein is-${describeWaitingMoveIn(item.desired_move_in_date, waitingNow).tone}`}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 10.5 12 3l9 7.5" />
                              <path d="M5 9.5V21h14V9.5" />
                            </svg>
                            อยากเข้าอยู่ {formatWaitingDate(item.desired_move_in_date)}
                            <small>{describeWaitingMoveIn(item.desired_move_in_date, waitingNow).text}</small>
                          </span>
                        )}
                        <div className="waiting-tags">
                          {preferences.length > 0 ? (
                            preferences.map((preference) => <span key={preference}>{preference}</span>)
                          ) : (
                            <span className="is-muted">ไม่ระบุประเภทห้อง</span>
                          )}
                        </div>
                        {item.note && (
                          <div className="waiting-card-note">
                            <span className="waiting-card-note-icon" aria-hidden="true">
                              <NoteIcon size={17} strokeWidth={1.8} />
                            </span>
                            <div className="waiting-card-note-content">
                              <span className="waiting-card-note-label">หมายเหตุ</span>
                              <p>{item.note}</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="waiting-card-foot">
                        <div className="waiting-card-meta">
                          <span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
                              <path d="M16 3v3M8 3v3M3 10h18" />
                            </svg>
                            {formatWaitingDate(item.created_at)}
                          </span>
                          <span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="8" r="4" />
                              <path d="M4 21a8 8 0 0 1 16 0" />
                            </svg>
                            <span className={item.submitted_by_name ? 'waiting-ui-actor' : ''}>{item.submitted_by_name || '-'}</span>
                          </span>
                        </div>
                        <div className="waiting-card-actions">
                          <button
                            type="button"
                            className="waiting-icon-btn is-view"
                            onClick={() => onDetail(item)}
                            aria-label={`ดูรายละเอียด ${item.full_name}`}
                            title="ดูรายละเอียด"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="waiting-icon-btn"
                            onClick={() => onEdit(item)}
                            aria-label={`แก้ไขข้อมูล ${item.full_name}`}
                            title="แก้ไข"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="waiting-icon-btn is-danger"
                            onClick={() => {
                              onDelete(item)
                            }}
                            aria-label={`ลบรายชื่อ ${item.full_name}`}
                            title="ลบ"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
                          <button type="button" className="waiting-detail-btn" onClick={() => onDetail(item)}>
                            ดูรายละเอียด
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </article>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function WaitingListDetails({ item, now, vacantRooms = [], onClose, onEdit, onStatusChange, statusBusyId = null, actionError = '' }) {
  const [waitingPhoneCopied, setWaitingPhoneCopied] = useState(null)
  const waitingNow = now
  const status = WAITING_UI_STATUSES[item.status] ? item.status : 'waiting'
  const preferences = splitWaitingPreferences(item.room_preference)
  const days = waitingDaysSince(item.created_at, now)
  const formatCurrency = (value) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="waiting-detail">
      <div className="waiting-detail-scroll">
        <div className={`waiting-detail-hero is-${WAITING_UI_STATUSES[status].tone}`}>
          <span className="waiting-avatar is-large" aria-hidden="true">
            <PersonIcon size={18} />
          </span>
          <div className="waiting-detail-name">
            <span className="waiting-detail-eyebrow">ข้อมูลผู้สนใจเช่าห้อง</span>
            <strong>{item.full_name}</strong>
          </div>
          <span className={`waiting-status is-${WAITING_UI_STATUSES[status].tone}`}>
            {WAITING_UI_STATUSES[status].label}
          </span>
        </div>

        <div className="waiting-detail-contact">
          <div className="waiting-detail-phone">
            <span>เบอร์ติดต่อ</span>
            <strong>{item.phone}</strong>
          </div>
          <div className="waiting-detail-contact-actions">
            <a className="waiting-ui-action-btn is-primary" href={`tel:${item.phone}`}>
              <WaitingDetailIcon type="phone" />
              โทรติดต่อ
            </a>
            <button
              type="button"
              className="waiting-ui-action-btn is-ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(item.phone)
                  setWaitingPhoneCopied(item.id)
                } catch {
                  setWaitingPhoneCopied(null)
                }
              }}
            >
              {waitingPhoneCopied === item.id ? <CheckIcon size={16} /> : <WaitingDetailIcon type="copy" />}
              {waitingPhoneCopied === item.id ? 'คัดลอกแล้ว' : 'คัดลอกเบอร์'}
            </button>
          </div>
        </div>


        {actionError && <p className="waiting-ui-form-error waiting-ui-form-error-block" role="alert">{actionError}</p>}
        {onStatusChange && (
          <label className="waiting-status-control is-detail">
            <span>จัดการสถานะรายชื่อ</span>
            <select value={status} disabled={statusBusyId != null} onChange={(event) => onStatusChange(item, event.target.value)}>
              {Object.entries(WAITING_UI_STATUSES).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
            </select>
          </label>
        )}
        <dl className="waiting-detail-stats">
          <div className={days >= 30 ? 'is-long' : ''}>
            <dt><WaitingDetailIcon type="clock" />ระยะเวลาที่รอ</dt>
            <dd>{days === 0 ? 'แจ้งวันนี้' : `${days} วัน`}</dd>
          </div>
          <div>
            <dt><WaitingDetailIcon type="calendar" />วันที่แจ้ง</dt>
            <dd>{formatWaitingDateTime(item.created_at)}</dd>
          </div>
          <div>
            <dt><WaitingDetailIcon type="user" />บันทึกโดย</dt>
            <dd className={item.submitted_by_name ? 'waiting-ui-actor' : ''}>{item.submitted_by_name || '-'}</dd>
          </div>
          <div className={item.desired_move_in_date ? `is-movein-${describeWaitingMoveIn(item.desired_move_in_date, waitingNow).tone}` : ''}>
            <dt><WaitingDetailIcon type="calendar" />ต้องการเข้าอยู่</dt>
            <dd>
              {item.desired_move_in_date
                ? formatWaitingDate(item.desired_move_in_date)
                : 'ไม่ระบุ'}
            </dd>
            {item.desired_move_in_date && <small>{describeWaitingMoveIn(item.desired_move_in_date, waitingNow).text}</small>}
          </div>
        </dl>

        <section className="waiting-detail-section">
          <h4><DoorIcon size={17} />ประเภทห้องที่สนใจ</h4>
          <div className="waiting-tags">
            {preferences.length > 0 ? (
              preferences.map((preference) => <span key={preference}>{preference}</span>)
            ) : (
              <span className="is-muted">ไม่ระบุประเภทห้อง</span>
            )}
          </div>
        </section>

        <section className="waiting-detail-section is-note">
          <h4><NoteIcon size={17} />หมายเหตุ</h4>
          <p className={`waiting-detail-note${item.note ? '' : ' is-empty'}`}>{item.note || 'ไม่มีหมายเหตุ'}</p>
        </section>

        <section className="waiting-detail-section is-vacancies">
          <h4>
            <DoorIcon size={17} />
            ห้องว่างตอนนี้ <span className="waiting-ui-count-pill">{vacantRooms.length}</span>
          </h4>
          {vacantRooms.length > 0 ? (
            <div className="waiting-vacant-rooms">
              {vacantRooms.map((room) => (
                <span key={room.room_number}>
                  <strong>ห้อง {room.room_number}</strong>
                  {room.price != null && <small>฿{formatCurrency(room.price)}/เดือน</small>}
                </span>
              ))}
            </div>
          ) : (
            <p className="waiting-detail-note is-empty">ยังไม่มีห้องว่าง</p>
          )}
        </section>

        <p className="waiting-detail-hint"><WaitingDetailIcon type="info" />{onStatusChange ? 'ปรับสถานะเพื่อให้เจ้าหน้าที่เห็นข้อมูลล่าสุด' : 'สถานะของรายชื่อนี้จัดการโดย Admin'}</p>
      </div>

      <footer className="waiting-ui-form-actions waiting-detail-actions">
        <button type="button" className="waiting-ui-action-btn is-ghost" onClick={onClose}>
          ปิด
        </button>
        <button
          type="button"
          className="waiting-ui-action-btn is-primary"
          onClick={() => {
            onEdit(item)
          }}
        >
          <WaitingDetailIcon type="edit" />
          แก้ไขข้อมูล
        </button>
      </footer>
    </div>
  )
}

function WaitingListForm({ value, fieldErrors = {}, error = '', busy = false, editing = false, now, onChange, onSubmit, onClose, idPrefix = 'waiting' }) {
  const waitingListForm = value
  const waitingListFieldErrors = fieldErrors
  const waitingListError = error
  const waitingListSubmitting = busy
  const waitingListEditing = editing
  const waitingNow = now
  const waitingFormTodayKey = waitingDayKey(now)
  const waitingMoveInPresets = getWaitingMoveInPresets(now)
  const waitingListPreferences = splitWaitingPreferences(value.room_preference)
  const updateWaitingListField = onChange
  const toggleRoomPreference = (chip) => {
    const next = waitingListPreferences.includes(chip) ? waitingListPreferences.filter(item => item !== chip) : [...waitingListPreferences, chip]
    const text = next.join(' | ')
    if (text.length <= 100) onChange('room_preference', text)
  }
  return (
    <form
      className="waiting-form"
      onSubmit={(event) => onSubmit(event)}
      noValidate
    >
      <div className="waiting-form-intro">
        <span className="waiting-form-intro-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          </svg>
        </span>
        <div>
          <strong>{waitingListEditing ? 'แก้ไขข้อมูลผู้สนใจ' : 'บันทึกผู้สนใจเช่าห้อง'}</strong>
          <p>เก็บข้อมูลไว้ติดต่อกลับเมื่อมีห้องว่างตรงกับความต้องการ</p>
        </div>
      </div>

      {waitingListError && (
        <p className="waiting-ui-form-error waiting-ui-form-error-block" role="alert">
          {waitingListError}
        </p>
      )}

      <section className="waiting-form-section">
        <h4 className="waiting-form-section-title">
          <span>1</span>
          ข้อมูลติดต่อ
        </h4>
        <div className="waiting-form-grid">
          <div className="waiting-ui-form-field">
            <label className="waiting-ui-form-label" htmlFor={`${idPrefix}-full-name`}>
              ชื่อผู้สนใจ <span className="waiting-ui-form-required">*</span>
            </label>
            <input
              id={`${idPrefix}-full-name`}
              className={`waiting-ui-form-input${waitingListFieldErrors.full_name ? ' is-invalid' : ''}`}
              maxLength={255}
              autoFocus
              autoComplete="off"
              placeholder="ชื่อ-นามสกุล"
              value={waitingListForm.full_name}
              onChange={(event) => updateWaitingListField('full_name', event.target.value)}
            />
            {waitingListFieldErrors.full_name && (
              <span className="waiting-ui-form-field-error">{waitingListFieldErrors.full_name}</span>
            )}
          </div>
          <div className="waiting-ui-form-field">
            <label className="waiting-ui-form-label" htmlFor={`${idPrefix}-phone`}>
              เบอร์โทรศัพท์ <span className="waiting-ui-form-required">*</span>
            </label>
            <input
              id={`${idPrefix}-phone`}
              className={`waiting-ui-form-input${waitingListFieldErrors.phone ? ' is-invalid' : ''}`}
              type="tel"
              inputMode="tel"
              maxLength={20}
              autoComplete="off"
              placeholder="เช่น 0812345678"
              value={waitingListForm.phone}
              onChange={(event) => updateWaitingListField('phone', event.target.value)}
            />
            {waitingListFieldErrors.phone && (
              <span className="waiting-ui-form-field-error">{waitingListFieldErrors.phone}</span>
            )}
          </div>
        </div>
      </section>

      <section className="waiting-form-section">
        <h4 className="waiting-form-section-title">
          <span>2</span>
          วันที่ต้องการเข้าอยู่ <span className="waiting-ui-form-optional">(ไม่บังคับ)</span>
        </h4>
        <div className="waiting-form-movein">
          <ThaiDatePicker
            className={`waiting-ui-form-input waiting-form-date${waitingListFieldErrors.desired_move_in_date ? ' is-invalid' : ''}`}
            placeholder="เลือกวันที่ต้องการเข้าอยู่"
            value={waitingListForm.desired_move_in_date}
            minDate={waitingDateFromKey(waitingFormTodayKey)}
            isClearable
            portalId="waiting-date-portal"
            onChange={(value) => updateWaitingListField('desired_move_in_date', value)}
          />
          <div className="waiting-form-chips" role="group" aria-label="เลือกวันเข้าอยู่แบบเร็ว">
            {waitingMoveInPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`waiting-form-chip${waitingListForm.desired_move_in_date === preset.value ? ' is-active' : ''}`}
                aria-pressed={waitingListForm.desired_move_in_date === preset.value}
                onClick={() =>
                  updateWaitingListField(
                    'desired_move_in_date',
                    waitingListForm.desired_move_in_date === preset.value ? '' : preset.value,
                  )
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        {waitingListForm.desired_move_in_date && (
          <p className="waiting-form-hint">
            เข้าอยู่ {formatWaitingDate(waitingListForm.desired_move_in_date)} ·{' '}
            {describeWaitingMoveIn(waitingListForm.desired_move_in_date, waitingNow).text}
          </p>
        )}
        {waitingListFieldErrors.desired_move_in_date && (
          <span className="waiting-ui-form-field-error">{waitingListFieldErrors.desired_move_in_date}</span>
        )}
      </section>

      <section className="waiting-form-section">
        <h4 className="waiting-form-section-title">
          <span>3</span>
          ประเภทห้องที่สนใจ <span className="waiting-ui-form-optional">(ไม่บังคับ)</span>
        </h4>
        <div className="waiting-form-chips" role="group" aria-label="เลือกประเภทห้องแบบเร็ว">
          {WAITING_UI_ROOM_PREFERENCES.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`waiting-form-chip${waitingListPreferences.includes(chip) ? ' is-active' : ''}`}
              aria-pressed={waitingListPreferences.includes(chip)}
              onClick={() => toggleRoomPreference(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <input
          id={`${idPrefix}-room-preference`}
          className="waiting-ui-form-input"
          maxLength={100}
          autoComplete="off"
          aria-label="ประเภทห้องที่สนใจ"
          placeholder="หรือพิมพ์เอง เช่น งบไม่เกิน 4,000 บาท"
          value={waitingListForm.room_preference}
          onChange={(event) => updateWaitingListField('room_preference', event.target.value)}
        />
      </section>

      <section className="waiting-form-section">
        <div className="waiting-ui-form-label-row">
          <h4 className="waiting-form-section-title">
            <span>4</span>
            <label htmlFor={`${idPrefix}-note`}>หมายเหตุ</label> <span className="waiting-ui-form-optional">(ไม่บังคับ)</span>
          </h4>
          <span className="waiting-ui-form-counter">{waitingListForm.note.length}/500</span>
        </div>
        <textarea
          id={`${idPrefix}-note`}
          className="waiting-ui-form-input waiting-ui-form-textarea"
          rows={3}
          maxLength={500}
          placeholder="เช่น จำนวนผู้พัก งบประมาณ หรือเวลาที่สะดวกให้ติดต่อ"
          value={waitingListForm.note}
          onChange={(event) => updateWaitingListField('note', event.target.value)}
        />
      </section>

      <div className="waiting-ui-form-actions">
        <button type="button" className="waiting-ui-action-btn is-ghost" onClick={onClose}>
          ยกเลิก
        </button>
        <button type="submit" className="waiting-ui-action-btn is-primary" disabled={waitingListSubmitting}>
          {waitingListSubmitting
            ? 'กำลังบันทึก...'
            : waitingListEditing
              ? 'บันทึกการแก้ไข'
              : 'บันทึกรายชื่อ'}
        </button>
      </div>
    </form>
  )
}

const MOVE_OUT_CHECKLIST = [
  { key: 'walls', label: 'ผนังและสี (รอยแตก คราบ สีลอก)' },
  { key: 'floor', label: 'พื้น (รอยแตก คราบ ความเสียหาย)' },
  { key: 'ceiling', label: 'เพดานและไฟ (คราบรั่วซึม หลอดไฟ)' },
  { key: 'doors', label: 'ประตูและกุญแจ (บาน ลูกบิด กลอน กุญแจ)' },
  { key: 'windows', label: 'หน้าต่าง (กระจก วงกบ ตัวล็อก)' },
  { key: 'electrical', label: 'ระบบไฟฟ้า (ปลั๊ก สวิตช์ ไฟส่องสว่าง)' },
  { key: 'bathroom', label: 'ห้องน้ำและสุขภัณฑ์ (ก๊อก ฝักบัว โถ ท่อระบาย)' },
  { key: 'furniture', label: 'เฟอร์นิเจอร์และอุปกรณ์ของห้อง' },
]

const INSPECTION_RESULT_ORDER = ['good', 'wear', 'damaged', 'missing', 'not_applicable']
const INSPECTION_TONE_LABEL = { danger: 'พบชำรุด/สูญหาย', warning: 'พบสึกหรอ', success: 'สภาพปกติ' }
const ADMIN_INSPECTION_KINDS = {
  moveout: {
    label: 'ตรวจห้องย้ายออก',
    title: 'Checklist ตรวจห้องย้ายออก',
    note: 'รายงานตรวจสภาพห้องตอนผู้เช่าย้ายออกที่ Staff ส่งมา',
    empty: 'ยังไม่มีรายงานตรวจห้องย้ายออกจาก Staff',
  },
  move_room: {
    label: 'ตรวจก่อนย้ายห้อง',
    title: 'Checklist ตรวจห้องก่อนย้ายห้อง',
    note: 'ผลตรวจห้องเดิมจากคำขอย้ายห้อง ซึ่ง Staff ต้องตรวจก่อนอนุมัติ',
    empty: 'ยังไม่มีผลตรวจห้องก่อนย้ายห้อง',
  },
}
const inspectionKindOf = (inspection) => (inspection.tenant_request_id ? 'move_room' : 'moveout')

function summarizeInspection(checklist) {
  const counts = Object.fromEntries(INSPECTION_RESULT_ORDER.map((key) => [key, 0]))
  for (const result of Object.values(checklist || {})) {
    if (result in counts) counts[result] += 1
  }
  const tone = counts.damaged + counts.missing > 0 ? 'danger' : counts.wear > 0 ? 'warning' : 'success'
  return { counts, tone }
}

const RENEW_DURATION_LABEL = { 1: '1 เดือน', 3: '3 เดือน', 6: '6 เดือน', 12: '1 ปี (12 เดือน)' }
const RENEW_PAYMENT_TYPE_LABEL = { monthly: 'จ่ายรายเดือน', lump_sum: 'จ่ายล่วงหน้าทั้งก้อน' }
const MOVE_ROOM_REASON_LABEL = {
  room_problem: 'ห้องเดิมมีปัญหา/ชำรุด',
  price: 'ต้องการห้องราคาที่เหมาะสมขึ้น',
  amenities: 'ต้องการสิ่งอำนวยความสะดวกเพิ่ม',
  location: 'ต้องการชั้นหรือตำแหน่งที่สะดวกขึ้น',
  noise: 'เสียงดัง/ปัญหาเพื่อนบ้าน',
  other: 'อื่นๆ',
}
const MOVE_OUT_INSPECTION_STATUS = {
  pending: 'รอ Admin ตรวจ',
  reviewed: 'Admin ตรวจแล้ว',
  follow_up: 'ต้องติดตาม',
}

const INSPECTION_STATUS_ACTIONS = {
  pending: [
    { key: 'confirm', next: 'reviewed', label: 'ยืนยัน' },
    { key: 'follow', next: 'follow_up', label: 'ติดตาม' },
  ],
  follow_up: [
    { key: 'confirm', next: 'reviewed', label: 'ยืนยัน' },
    { key: 'cancel', next: 'pending', label: 'ยกเลิก' },
  ],
  reviewed: [{ key: 'cancel', next: 'pending', label: 'ยกเลิก' }],
}

function InspectionStatusActions({ status, onChange, size = 'sm' }) {
  const actions = INSPECTION_STATUS_ACTIONS[status] || INSPECTION_STATUS_ACTIONS.pending
  return actions.map((action) => (
    <button
      key={action.key}
      type="button"
      className={`insp-status-action is-${action.key}${size === 'lg' ? ' is-large' : ''}`}
      title={`เปลี่ยนสถานะเป็น "${MOVE_OUT_INSPECTION_STATUS[action.next]}"`}
      onClick={() => onChange(action.next)}
    >
      {action.key === 'confirm' && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12 5 5 9-10" />
        </svg>
      )}
      {action.key === 'follow' && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </svg>
      )}
      {action.key === 'cancel' && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      )}
      {action.label}
    </button>
  ))
}

function escapeInvoiceHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function formatInvoiceMoney(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
}

function printMonthlyInvoices(rooms, targetWindow = window.open('', '_blank', 'width=900,height=720')) {
  const occupiedRooms = rooms.filter((room) => room.is_booked && room.tenant)
  if (occupiedRooms.length === 0) {
    targetWindow?.close()
    return 0
  }

  const printWindow = targetWindow
  if (!printWindow) throw new Error('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง')

  const now = new Date()
  const monthLabel = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
  const issueDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  const invoices = occupiedRooms.map((room) => {
    const due = room.currentDue
    const items = due?.items?.length ? due.items : [{ label: 'ไม่มียอดค้างชำระ', amount: 0 }]
    const dueDate = due?.dueDate ? new Date(due.dueDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'
    const tenantName = `${room.tenant.first_name || ''} ${room.tenant.last_name || ''}`.trim()
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${room.room_number}`
    const status = due?.status === 'overdue' ? 'ค้างชำระ' : due?.status === 'pending' ? 'รอตรวจสอบ' : due?.amount > 0 ? 'รอชำระ' : 'ชำระครบ / ไม่มียอดค้าง'

    return `<article class="invoice">
      <header class="invoice-header"><div><p class="eyebrow">CSI400 RESIDENCE</p><h1>ใบแจ้งหนี้ประจำเดือน</h1><p class="period">${escapeInvoiceHtml(monthLabel)}</p></div><div class="invoice-number"><span>เลขที่เอกสาร</span><strong>${escapeInvoiceHtml(invoiceNumber)}</strong><span>วันที่ออก ${escapeInvoiceHtml(issueDate)}</span></div></header>
      <section class="tenant"><div><span>ห้อง</span><strong>${escapeInvoiceHtml(room.room_number)}</strong></div><div><span>ผู้เช่า</span><strong>${escapeInvoiceHtml(tenantName || '-')}</strong></div><div><span>เบอร์โทร</span><strong>${escapeInvoiceHtml(room.tenant.phone || '-')}</strong></div></section>
      <table><thead><tr><th>รายการ</th><th class="amount">จำนวนเงิน (บาท)</th></tr></thead><tbody>${items.map((item) => `<tr><td>${escapeInvoiceHtml(item.label)}${item.note ? `<small>${escapeInvoiceHtml(item.note)}</small>` : ''}</td><td class="amount">${formatInvoiceMoney(item.amount)}</td></tr>`).join('')}</tbody></table>
      <div class="total"><span>ยอดรวม</span><strong>฿${formatInvoiceMoney(due?.amount || 0)}</strong></div>
      <footer><span>สถานะ: ${escapeInvoiceHtml(status)}</span><span>กำหนดชำระ: ${escapeInvoiceHtml(dueDate)}</span></footer>
    </article>`
  }).join('')

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบแจ้งหนี้ประจำเดือน ${escapeInvoiceHtml(monthLabel)}</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#172b3a;font:14px "Tahoma","Leelawadee UI",sans-serif}.invoice{min-height:265mm;position:relative;page-break-after:always;padding:4mm 2mm}.invoice:last-child{page-break-after:auto}.invoice-header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #173f4f;padding-bottom:18px}.eyebrow{margin:0 0 8px;color:#15736d;font-size:11px;font-weight:700;letter-spacing:1px}.invoice h1{font-size:25px;margin:0 0 5px}.period{margin:0;color:#60717c}.invoice-number{text-align:right;display:flex;flex-direction:column;gap:6px;font-size:11px;color:#60717c}.invoice-number strong{font-size:14px;color:#172b3a}.tenant{display:grid;grid-template-columns:0.7fr 1.5fr 1fr;gap:12px;padding:20px 0}.tenant div{display:flex;flex-direction:column;gap:5px}.tenant span{font-size:11px;color:#60717c}.tenant strong{font-size:14px}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{padding:12px 10px;border-bottom:1px solid #dce5e8;text-align:left}th{background:#f1f6f5;color:#405963;font-size:11px}.amount{text-align:right;white-space:nowrap}td small{display:block;color:#60717c;margin-top:4px}.total{display:flex;justify-content:flex-end;align-items:center;gap:40px;margin-top:24px;padding:16px 10px;background:#f1f6f5}.total strong{font-size:22px;color:#12665f}footer{position:absolute;bottom:6mm;left:2mm;right:2mm;display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid #dce5e8;color:#60717c;font-size:11px}@media screen{body{background:#e9eff0;padding:24px}.invoice{max-width:780px;min-height:1000px;margin:0 auto 24px;padding:40px;background:white;box-shadow:0 4px 18px #193b4a22}footer{bottom:40px;left:40px;right:40px}}@media print{body{background:#fff}.invoice{min-height:265mm}.invoice:last-child{page-break-after:auto}}
    </style></head><body>${invoices}</body></html>`

  printWindow.addEventListener('load', () => {
    printWindow.focus()
    printWindow.print()
  }, { once: true })
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  return occupiedRooms.length
}

function NotifKindIcon({ kind }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  if (kind === 'announcement') {
    return (
      <svg {...props}>
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    )
  }
  if (kind === 'maintenance') {
    return (
      <svg {...props}>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />
      </svg>
    )
  }
  if (kind === 'staff') {
    return (
      <svg {...props}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    )
  }
  return (
    <svg {...props}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  )
}

function buildAnnouncementNotif(item) {
  return {
    key: `announcement-${item.id}`,
    announcementId: item.id,
    title: item.title,
    label: item.tone === 'warning' ? 'ประกาศแจ้งเตือนจากหอพัก' : 'ประกาศจากหอพัก',
    tone: item.tone === 'warning' ? 'pending' : 'info',
    date: item.created_at,
    preview: item.message,
    previewLabel: 'รายละเอียดประกาศ',
    details: [
      { label: 'รายละเอียด', value: item.message },
      { label: 'ประกาศโดย', value: <span className="admin-actor-inline">{item.author || 'เจ้าหน้าที่'}</span> },
      { label: 'ลบอัตโนมัติ', value: item.expires_at ? `${formatDateTime(item.expires_at)} น.` : 'ไม่กำหนด' },
    ],
    kind: 'announcement',
  }
}

let openModalCount = 0
const modalStack = []

function lockBodyScroll() {
  openModalCount += 1
  if (openModalCount === 1) {
    document.body.style.overflow = 'hidden'
  }
}

function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1)
  if (openModalCount === 0) {
    document.body.style.overflow = ''
  }
}

function Modal({ title, onClose, children, variant }) {
  const [isClosing, setIsClosing] = useState(false)
  const requestClose = () => setIsClosing(true)

  useEffect(() => {
    const token = Symbol('modal')
    modalStack.push(token)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && modalStack[modalStack.length - 1] === token) requestClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      modalStack.splice(modalStack.indexOf(token), 1)
    }
  }, [])

  useEffect(() => {
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [])

  return (
    <div
      className={`admin-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`admin-modal${variant === 'confirm' ? ' admin-modal-confirm' : ''}${variant === 'form' ? ' admin-modal-form' : ''}${variant === 'wide' ? ' admin-modal-wide' : ''}${variant === 'gallery' ? ' admin-modal-gallery' : ''}${variant === 'waiting-detail' ? ' admin-modal-waiting-detail' : ''}${variant === 'waiting-form' ? ' admin-modal-waiting-form' : ''}${variant === 'room-detail' ? ' admin-modal-room-detail' : ''}${variant === 'room-history' ? ' admin-modal-room-history' : ''}${variant === 'payment-detail' ? ' admin-modal-payment-detail' : ''}${variant === 'rental-history' ? ' admin-modal-rental-history' : ''}${variant === 'moveout-detail' ? ' admin-modal-moveout-detail' : ''}${variant === 'inspection-detail' ? ' admin-modal-inspection-detail' : ''}${variant === 'inspection-form' ? ' admin-modal-inspection-form' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-header">
          <h3>{title}</h3>
          <button type="button" className="admin-modal-close" onClick={requestClose} aria-label="ปิด">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="admin-modal-body">{typeof children === 'function' ? children(requestClose) : children}</div>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="admin-pagination">
      <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ก่อนหน้า
      </button>
      <span className="admin-page-info">
        หน้า {page} / {totalPages}
      </span>
      <button type="button" className="admin-page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ถัดไป
      </button>
    </div>
  )
}

const ROWS_PER_PAGE = 10

const TABS = [
  { key: 'rooms', label: 'ห้องพัก' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'customers', label: 'ลูกค้า' },
  { key: 'moveouts', label: 'ผู้ย้ายออก' },
  { key: 'requests', label: 'ประวัติคำขอผู้เช่า' },
  { key: 'maintenance', label: 'ประวัติแจ้งซ่อม' },
  { key: 'waiting-list', label: 'รายชื่อรอห้องว่าง' },
  { key: 'move-out-inspections', label: 'ตรวจห้องย้ายออก' },
  { key: 'parcels', label: 'พัสดุ' },
  { key: 'expenses', label: 'รายจ่าย' },
  { key: 'announcements', label: 'ประกาศ' },
  { key: 'vehicle-requests', label: 'คำขอรถ' },
  { key: 'safety', label: 'ตรวจเหตุฉุกเฉิน' },
]

const TAB_GROUPS = [
  { key: 'residents', label: 'ห้องพักและผู้เช่า', tabs: ['rooms', 'customers', 'moveouts', 'waiting-list'] },
  { key: 'services', label: 'คำขอและงานบริการ', tabs: ['requests', 'maintenance', 'move-out-inspections', 'vehicle-requests', 'safety'] },
  { key: 'parcels', label: 'พัสดุ', tabs: ['parcels'] },
  { key: 'announcements', label: 'ประกาศจากหอพัก', tabs: ['announcements'] },
  { key: 'staff', label: 'พนักงาน', tabs: ['staff'] },
  { key: 'finance', label: 'รายจ่าย', tabs: ['expenses'] },
]
const TAB_LABEL = Object.fromEntries(TABS.map((tab) => [tab.key, tab.label]))
const TAB_GROUP_OF = Object.fromEntries(TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => [tab, group.key])))

const REQUEST_TYPE_LABEL = { renew: 'ต่อสัญญา', moveout: 'แจ้งย้ายออก', move_room: 'ย้ายห้อง' }
const REQUEST_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'รับเรื่องแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธแล้ว',
}
const MAINTENANCE_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
}
const MAINTENANCE_CATEGORY_LABEL = {
  electrical: 'ไฟฟ้า',
  plumbing: 'ประปา',
  aircon: 'เครื่องปรับอากาศ',
  furniture: 'เฟอร์นิเจอร์',
  other: 'อื่นๆ',
}
const PAYMENT_STATUS_LABEL = { paid: 'ชำระแล้ว', pending: 'รอชำระ', overdue: 'ค้างชำระ' }
const PAYMENT_TYPE_LABEL = { rent: 'ค่าเช่า', deposit: 'เงินมัดจำ', water: 'ค่าน้ำ', electricity: 'ค่าไฟฟ้า' }
const PAYMENT_BADGE_CLASS = { paid: 'approved', pending: 'pending', overdue: 'rejected' }

const MAINTENANCE_CATEGORY_ICON = {
  electrical: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  plumbing: <path d="M12 2S5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-13-7-13Z" />,
  aircon: <path d="M12 3v18M5.6 6.5 18.4 17.5M18.4 6.5 5.6 17.5" />,
  furniture: (
    <g>
      <path d="M4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3Z" />
      <path d="M5 17v2M19 17v2" />
    </g>
  ),
  other: (
    <path d="M14.5 3.5a4 4 0 0 0-5 5L4 14l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2-2 2.5-2.5Z" />
  ),
}

function MaintenanceCategoryBadge({ category }) {
  const key = MAINTENANCE_CATEGORY_LABEL[category] ? category : 'other'
  return (
    <span className={`admin-badge category-${key}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {MAINTENANCE_CATEGORY_ICON[key]}
      </svg>
      {MAINTENANCE_CATEGORY_LABEL[key]}
    </span>
  )
}

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getTodayInputDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatRemaining(ms) {
  const totalMinutes = Math.floor(Math.abs(ms) / (1000 * 60))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const parts = []
  if (days > 0) parts.push(`${days} วัน`)
  if (hours > 0) parts.push(`${hours} ชั่วโมง`)
  if (days === 0 && minutes > 0) parts.push(`${minutes} นาที`)
  return parts.length > 0 ? parts.join(' ') : 'น้อยกว่า 1 นาที'
}

function calcStayDays(start, end) {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

const NOTIF_PAGE_SIZE = 30
const ADMIN_STAFF_NOTIF_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const ADMIN_TENANT_NOTIF_INFO = {
  pending: { label: 'คำขอใหม่ รอดำเนินการ', tone: 'pending' },
  in_progress: { label: 'รับเรื่องแล้ว รอดำเนินการขั้นต่อไป', tone: 'info' },
}

const ADMIN_MAINTENANCE_NOTIF_INFO = {
  pending: { label: 'แจ้งซ่อมใหม่ รอดำเนินการ', tone: 'pending' },
  in_progress: { label: 'กำลังดำเนินการซ่อม', tone: 'info' },
}

function getNotificationStorageKey(role) {
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    const userId = user.id ?? user.idcard ?? user.username ?? 'current'
    return `${role}-notifications-seen-${userId}`
  } catch {
    return `${role}-notifications-seen-current`
  }
}

function buildAdminTenantNotifs(request) {
  if (request.type === 'move_room') return []
  const info = ADMIN_TENANT_NOTIF_INFO[request.status]
  if (!info) return []
  return [
    {
      key: `tenant-${request.id}-${request.status}`,
      title: REQUEST_TYPE_LABEL[request.type] || request.type,
      ...info,
      date: request.status === 'in_progress' ? request.accepted_at || request.created_at : request.created_at,
      preview: request.note || [request.first_name, request.last_name].filter(Boolean).join(' '),
      previewLabel: request.note ? 'หมายเหตุ' : 'ผู้เช่า',
      details: [
        { label: 'ห้อง', value: request.room_number },
        { label: 'ผู้เช่า', value: `${request.first_name} ${request.last_name}` },
        ...(request.note ? [{ label: 'หมายเหตุ', value: request.note }] : []),
      ],
      kind: 'tenant',
      request,
    },
  ]
}

function buildAdminMaintenanceNotifs(request) {
  const info = ADMIN_MAINTENANCE_NOTIF_INFO[request.status]
  if (!info) return []
  return [
    {
      key: `maintenance-${request.id}-${request.status}`,
      title: 'แจ้งซ่อม',
      ...info,
      date: request.status === 'in_progress' ? request.accepted_at || request.created_at : request.created_at,
      preview: request.description || MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ',
      previewLabel: request.description ? 'รายละเอียดการแจ้งซ่อม' : 'ประเภทการแจ้งซ่อม',
      details: [
        { label: 'ห้อง', value: request.room_number },
        { label: 'ผู้เช่า', value: `${request.first_name} ${request.last_name}` },
        { label: 'ประเภท', value: MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ' },
      ],
      kind: 'maintenance',
      request,
    },
  ]
}

function buildAdminStaffNotifs(member) {
  if (!member.created_at) return []
  const createdMs = new Date(member.created_at).getTime()
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > ADMIN_STAFF_NOTIF_WINDOW_MS) return []
  return [
    {
      key: `staff-${member.id}-new`,
      title: 'พนักงานใหม่',
      label: 'เพิ่มพนักงานใหม่เข้าระบบ',
      tone: 'info',
      date: member.created_at,
      preview: [member.first_name, member.last_name].filter(Boolean).join(' '),
      previewLabel: 'ชื่อพนักงาน',
      details: [
        { label: 'ชื่อ-นามสกุล', value: `${member.first_name} ${member.last_name}` },
        { label: 'เบอร์โทร', value: member.phone },
      ],
      kind: 'staff',
      request: member,
    },
  ]
}

function getAdminRequestTimeline(kind, request) {
  if (!request || kind === 'staff') return []
  const steps = [{ label: kind === 'maintenance' ? 'แจ้งซ่อม' : 'ส่งคำขอ', date: request.created_at }]
  if (request.accepted_at) {
    steps.push({ label: request.accepted_by_name ? 'รับเรื่องโดย' : 'รับเรื่อง', by: request.accepted_by_name, date: request.accepted_at })
  }
  if (request.completed_at) {
    steps.push({ label: request.completed_by_name ? 'เสร็จสิ้นโดย' : 'เสร็จสิ้น', by: request.completed_by_name, date: request.completed_at })
  }
  return steps
}

function AdminRequestTimeline({ kind, request }) {
  const timeline = getAdminRequestTimeline(kind, request)
  if (timeline.length === 0) return null

  return (
    <div className="admin-request-log">
      <div className="admin-request-log-items">
        {timeline.map((step, index) => {
          const prevStep = timeline[index - 1]
          const stepMs = prevStep ? new Date(step.date).getTime() - new Date(prevStep.date).getTime() : null
          return (
            <div key={step.label} className="admin-request-log-item">
              <span className="admin-request-log-dot" />
              <div className="admin-request-log-content">
                <p className="admin-request-log-label">
                  {step.label}
                  {step.by && <span className="admin-actor-inline"> {step.by}</span>}
                </p>
                <p className="admin-request-log-date">{formatDateTime(step.date)}</p>
                {stepMs !== null && stepMs >= 0 && <p className="admin-request-log-duration">ใช้เวลา {formatRemaining(stepMs)}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function useExpandedRows() {
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const reset = () => setExpanded(new Set())
  return [expanded, toggle, reset]
}

function DetailRow({ open, colSpan, fields }) {
  if (!open) return null
  return (
    <tr className="admin-detail-row">
      <td colSpan={colSpan}>
        <div className="admin-detail-grid">
          {fields.map(({ label, value }) => (
            <div className="admin-detail-item" key={label}>
              <span className="admin-detail-item-label">{label}</span>
              <span className="admin-detail-item-value">{value}</span>
            </div>
          ))}
        </div>
      </td>
    </tr>
  )
}

function ExpandToggleButton({ open, onClick }) {
  return (
    <button type="button" className="admin-expand-btn" onClick={onClick} aria-expanded={open}>
      {open ? 'ย่อ' : 'ดูเพิ่มเติม'}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transform: open ? 'rotate(180deg)' : 'none' }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )
}

function ExpandToggleRow({ open, colSpan, onClick }) {
  return (
    <tr className="admin-toggle-row">
      <td colSpan={colSpan}>
        <ExpandToggleButton open={open} onClick={onClick} />
      </td>
    </tr>
  )
}

function StaffActionCell({ name, date }) {
  if (!name) return <span className="admin-cell-empty">-</span>
  return (
    <div className="admin-staff-action">
      <span className="admin-staff-action-name">{name}</span>
      <span className="admin-staff-action-date">{formatDateTime(date)}</span>
    </div>
  )
}

function ActorName({ name }) {
  if (!name) return <span className="admin-cell-empty">-</span>
  return <span className="admin-actor-name">{name}</span>
}

function AmenitiesList({ room }) {
  const amenities = [
    room.air_conditioner && 'แอร์',
    room.wifi && 'ไวไฟ',
    room.refrigerator && 'ตู้เย็น',
    room.bathroom && 'ห้องน้ำในตัว',
    room.cctv && 'CCTV',
  ].filter(Boolean)
  if (amenities.length === 0) return '-'
  return (
    <div className="admin-amenities-list">
      {amenities.map((amenity, index) => (
        <span key={amenity} className="admin-amenity-item">
          {index > 0 && <span className="admin-amenity-divider" aria-hidden="true" />}
          {amenity}
        </span>
      ))}
    </div>
  )
}

const ROOM_AMENITIES = [
  { key: 'air_conditioner', label: 'เครื่องปรับอากาศ' },
  { key: 'wifi', label: 'ไวไฟ' },
  { key: 'refrigerator', label: 'ตู้เย็น' },
  { key: 'bathroom', label: 'ห้องน้ำในตัว' },
  { key: 'cctv', label: 'กล้อง CCTV' },
]

function RoomDetailIcon({ type, size = 16 }) {
  const paths = {
    door: <><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" /><path d="M3 21h18M15 12h.01" /></>,
    wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2" /></>,
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    drop: <path d="M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5Z" />,
    bed: <><path d="M3 18V6M21 18v-5a3 3 0 0 0-3-3H10v8" /><path d="M3 14h18M3 18h18" /><circle cx="6.5" cy="11" r="1.5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.7L8.7 10.5a16 16 0 0 0 4.8 4.8l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.5a2 2 0 0 1 1.7 2Z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    wrench: <path d="M14.5 3.5a4 4 0 0 0-5 5L4 14l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2-2 2.5-2.5Z" />,
    box: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6 6 2 2M16 16l2 2M6 18l2-2M16 8l2-2" /></>,
    check: <path d="m5 12 5 5 9-10" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    edit: <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
    note: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M10 21v-6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  )
}

const ROOM_HERO_STATUS_LABEL = {
  vacant: 'ว่าง พร้อมให้เช่า',
  booked: 'มีผู้เช่า',
  expiring: 'ใกล้หมดสัญญา',
  overdue: 'เกินกำหนดสัญญา',
}

function describeContract(start, end, now) {
  if (!start || !end) return null
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  const percent = Math.min(100, Math.max(0, ((now - startMs) / (endMs - startMs)) * 100))
  const daysLeft = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24))
  const tone = daysLeft < 0 ? 'danger' : daysLeft <= 30 ? 'warning' : 'success'
  const label = daysLeft < 0 ? `หมดสัญญาแล้ว ${Math.abs(daysLeft)} วัน` : daysLeft === 0 ? 'ครบสัญญาวันนี้' : `เหลืออีก ${daysLeft} วัน`
  return { percent, tone, label }
}

function formatStayLength(start, end) {
  return formatDays(calcStayDays(start, end))
}

function formatDays(days) {
  if (days === null || days === undefined) return null
  if (days < 30) return `${days} วัน`
  const months = Math.round(days / 30)
  return months >= 12 && months % 12 === 0 ? `${months / 12} ปี` : `${months} เดือน`
}

function RoomDetailSection({ icon, title, hint, count, action, children }) {
  return (
    <section className="room-detail-section is-list">
      <header className="room-detail-section-head">
        <span className="room-detail-section-icon"><RoomDetailIcon type={icon} size={16} /></span>
        <div className="room-detail-section-title">
          <h4>{title}</h4>
          {hint && <span>{hint}</span>}
        </div>
        {count > 0 && <span className="room-detail-section-count">{count}</span>}
        {action}
      </header>
      {children}
    </section>
  )
}

function RoomDetailDateTile({ value }) {
  if (!value) return <span className="room-detail-date-tile is-empty">-</span>
  const date = new Date(value)
  return (
    <span className="room-detail-date-tile">
      <strong>{date.getDate()}</strong>
      <small>{date.toLocaleDateString('th-TH', { month: 'short' })}</small>
      <small>{date.getFullYear() + 543}</small>
    </span>
  )
}

function RoomDetailEmptyRow({ icon, text }) {
  return (
    <div className="room-detail-empty-row">
      <RoomDetailIcon type={icon} size={18} />
      <span>{text}</span>
    </div>
  )
}

const ROOM_HISTORY_PAGE_SIZE = 8

function splitPaymentNote(note) {
  if (!note) return { main: '', extra: '' }
  const parenIndex = note.indexOf('(')
  if (parenIndex === -1) return { main: note, extra: '' }
  return { main: note.slice(0, parenIndex).trim(), extra: note.slice(parenIndex).trim() }
}

const ROOM_HISTORY_SORTS = {
  newest: 'ล่าสุดก่อน',
  oldest: 'เก่าสุดก่อน',
  amount_desc: 'ยอดเงินมากไปน้อย',
  amount_asc: 'ยอดเงินน้อยไปมาก',
}

function paymentTime(payment) {
  const primary = new Date(payment.payment_date || payment.created_at).getTime() || 0
  const secondary = new Date(payment.created_at).getTime() || 0
  return [primary, secondary]
}

function comparePayments(sort) {
  return (a, b) => {
    if (sort === 'amount_desc' || sort === 'amount_asc') {
      const diff = Number(a.amount || 0) - Number(b.amount || 0)
      if (diff !== 0) return sort === 'amount_asc' ? diff : -diff
    }
    const [aPrimary, aSecondary] = paymentTime(a)
    const [bPrimary, bSecondary] = paymentTime(b)
    const diff = aPrimary - bPrimary || aSecondary - bSecondary || a.id - b.id
    return sort === 'oldest' ? diff : -diff
  }
}

function RoomPaymentHistory({ history, loading, error, onRetry, onSlip, onSelect, initialSearch = '' }) {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState(initialSearch)
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  const payments = useMemo(
    () =>
      (history || []).flatMap((entry) =>
        entry.payments.map((payment) => ({
          ...payment,
          tenant: { first_name: entry.first_name, last_name: entry.last_name },
          tenantName: `${entry.first_name} ${entry.last_name}`,
        })),
      ),
    [history],
  )

  const counts = useMemo(() => {
    const result = { all: payments.length, paid: 0, pending: 0, overdue: 0 }
    for (const payment of payments) if (payment.status in result) result[payment.status] += 1
    return result
  }, [payments])

  const totals = useMemo(() => {
    const sum = (key) => payments.filter((payment) => payment.status === key).reduce((total, payment) => total + Number(payment.amount || 0), 0)
    return { paid: sum('paid'), pending: sum('pending'), overdue: sum('overdue') }
  }, [payments])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return payments.filter((payment) => {
      if (status !== 'all' && payment.status !== status) return false
      if (!keyword) return true
      return [
        payment.tenantName,
        formatDateTime(payment.created_at),
        PAYMENT_TYPE_LABEL[payment.type] || payment.type,
        formatCurrency(payment.amount),
        PAYMENT_STATUS_LABEL[payment.status] || payment.status,
        payment.note,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    }).sort(comparePayments(sort))
  }, [payments, status, search, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROOM_HISTORY_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * ROOM_HISTORY_PAGE_SIZE, currentPage * ROOM_HISTORY_PAGE_SIZE)
  const groups = useMemo(() => {
    if (sort !== 'newest' && sort !== 'oldest') {
      return [{ key: 'all', label: null, items: pageItems, total: 0 }]
    }
    const result = []
    for (const payment of pageItems) {
      const date = new Date(payment.payment_date || payment.created_at)
      const valid = !Number.isNaN(date.getTime())
      const key = valid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown'
      let group = result[result.length - 1]
      if (!group || group.key !== key) {
        group = {
          key,
          label: valid ? date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : 'ไม่ระบุวันที่',
          items: [],
          total: 0,
        }
        result.push(group)
      }
      group.items.push(payment)
      group.total += Number(payment.amount || 0)
    }
    return result
  }, [pageItems, sort])
  const canClear = status !== 'all' || Boolean(search.trim()) || sort !== 'newest'

  const ready = !loading && !error && payments.length > 0
  const clearFilters = () => {
    setStatus('all')
    setSearch('')
    setSort('newest')
    setPage(1)
  }

  return (
    <div className="room-history">
      {ready && (
        <div className="room-history-head">
          <div className="room-history-totals">
            {[
              { key: 'paid', label: 'ชำระแล้ว', tone: 'success', icon: 'check' },
              { key: 'pending', label: 'รอชำระ', tone: 'warning', icon: 'clock' },
              { key: 'overdue', label: 'ค้างชำระ', tone: 'danger', icon: 'alert' },
            ].map((total) => (
              <div key={total.key} className={`is-${total.tone}`}>
                <span className="room-history-total-icon"><RoomDetailIcon type={total.icon} size={20} /></span>
                <div>
                  <span>{total.label}</span>
                  <strong>฿{formatCurrency(totals[total.key])}</strong>
                </div>
                <small>{counts[total.key]} รายการ</small>
              </div>
            ))}
          </div>

          <div className="room-history-filter">
            <div className="room-history-segments" role="group" aria-label="สถานะการชำระ">
              {[
                { key: 'all', label: 'ทั้งหมด', tone: 'all' },
                { key: 'paid', label: 'ชำระแล้ว', tone: 'success' },
                { key: 'pending', label: 'รอชำระ', tone: 'warning' },
                { key: 'overdue', label: 'ค้างชำระ', tone: 'danger' },
              ].map((segment) => (
                <button
                  key={segment.key}
                  type="button"
                  className={`room-history-segment is-${segment.tone}${status === segment.key ? ' active' : ''}`}
                  aria-pressed={status === segment.key}
                  onClick={() => {
                    setStatus(segment.key)
                    setPage(1)
                  }}
                >
                  {segment.label}
                  <span>{counts[segment.key]}</span>
                </button>
              ))}
            </div>
            <label className="room-history-search">
              <RoomDetailIcon type="search" size={15} />
              <input
                type="search"
                placeholder="ค้นหาผู้เช่า จำนวนเงิน หรือหมายเหตุ"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className="room-history-sort">
              <span>เรียงตาม</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value)
                  setPage(1)
                }}
              >
                {Object.entries(ROOM_HISTORY_SORTS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="room-history-body">
        {loading ? (
          <div className="room-history-state">
            <span className="room-detail-spinner" aria-hidden="true" />
            <strong>กำลังโหลดประวัติการจ่ายเงิน...</strong>
          </div>
        ) : error ? (
          <div className="room-history-state is-error" role="alert">
            <span className="room-history-state-icon"><RoomDetailIcon type="alert" size={24} /></span>
            <strong>{error}</strong>
            <button type="button" className="admin-action-btn is-ghost" onClick={onRetry}>ลองใหม่</button>
          </div>
        ) : payments.length === 0 ? (
          <div className="room-history-state">
            <span className="room-history-state-icon"><RoomDetailIcon type="receipt" size={24} /></span>
            <strong>ยังไม่มีประวัติการจ่ายเงิน</strong>
            <span>เมื่อมีการชำระเงินของห้องนี้ รายการจะแสดงที่นี่</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="room-history-state">
            <span className="room-history-state-icon"><RoomDetailIcon type="search" size={24} /></span>
            <strong>ไม่พบรายการที่ตรงกับเงื่อนไข</strong>
            <button type="button" className="admin-action-btn is-ghost" onClick={clearFilters}>ล้างตัวกรอง</button>
          </div>
        ) : (
          <div className="room-history-table">
            <div className="room-history-thead" aria-hidden="true">
              <span>วันที่</span>
              <span>รายการ</span>
              <span>ผู้เช่า</span>
              <span>สถานะ</span>
              <span className="is-right">จำนวนเงิน</span>
              <span className="is-center">สลิป</span>
              <span />
            </div>
            {groups.map((group) => (
              <section className="room-history-group" key={group.key}>
                {group.label && (
                  <header className="room-history-group-head">
                    <strong>{group.label}</strong>
                    <span>{group.items.length} รายการ</span>
                    <span className="room-history-group-total">฿{formatCurrency(group.total)}</span>
                  </header>
                )}
                <ul className="room-history-list">
                  {group.items.map((payment) => {
                    const note = splitPaymentNote(payment.note)
                    const date = new Date(payment.payment_date || payment.created_at)
                    const validDate = !Number.isNaN(date.getTime())
                    return (
                      <li
                        key={payment.id}
                        className={`is-${payment.status}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`ดูรายละเอียดการชำระ ฿${formatCurrency(payment.amount)}`}
                        onClick={() => onSelect(payment)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelect(payment)
                          }
                        }}
                      >
                        <div className="room-history-cell-date">
                          <strong>{validDate ? date.getDate() : '-'}</strong>
                          <span>{validDate ? date.toLocaleDateString('th-TH', { month: 'short' }) : ''}</span>
                        </div>
                        <div className="room-history-cell-item">
                          <strong>{PAYMENT_TYPE_LABEL[payment.type] || payment.type}</strong>
                          <span className={note.main ? '' : 'is-empty'} title={payment.note || ''}>
                            {note.main || 'ไม่มีหมายเหตุ'}
                          </span>
                        </div>
                        <div className="room-history-cell-tenant">
                          <strong>{payment.tenantName}</strong>
                          <span>{formatDateTime(payment.created_at)}</span>
                        </div>
                        <div className="room-history-cell-status">
                          <span className={`admin-badge status-${PAYMENT_BADGE_CLASS[payment.status] || 'pending'}`}>
                            {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                          </span>
                        </div>
                        <div className="room-history-cell-amount">฿{formatCurrency(payment.amount)}</div>
                        <div className="room-history-cell-slip">
                          {payment.slip_path ? (
                            <button
                              type="button"
                              className="room-history-slip-icon"
                              title="ดูสลิปโอนเงิน"
                              onClick={(event) => {
                                event.stopPropagation()
                                onSlip(payment.tenant, payment)
                              }}
                            >
                              <RoomDetailIcon type="receipt" size={14} />
                              ดูสลิป
                            </button>
                          ) : (
                            <span className="room-history-slip-none">ไม่มีสลิป</span>
                          )}
                        </div>
                        <span className="room-history-cell-chevron" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {ready && (
        <footer className="room-history-foot">
          <div className="room-history-result">
            <span>
              แสดง {filtered.length === 0 ? 0 : (currentPage - 1) * ROOM_HISTORY_PAGE_SIZE + 1}–
              {Math.min(currentPage * ROOM_HISTORY_PAGE_SIZE, filtered.length)} จาก {filtered.length} รายการ
            </span>
            {canClear && <button type="button" onClick={clearFilters}>ล้างตัวกรอง</button>}
          </div>
          <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
        </footer>
      )}
    </div>
  )
}

const MAINTENANCE_TIME_LABEL = {
  anytime: 'เวลาไหนก็ได้',
  morning: 'ช่วงเช้า (08:00-12:00)',
  afternoon: 'ช่วงบ่าย (12:00-16:00)',
  evening: 'ช่วงเย็น (16:00-19:00)',
}

const MAINTENANCE_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', tone: 'all' },
  { key: 'pending', label: 'รอดำเนินการ', tone: 'warning' },
  { key: 'in_progress', label: 'กำลังดำเนินการ', tone: 'all' },
  { key: 'done', label: 'เสร็จสิ้น', tone: 'success' },
  { key: 'cancelled', label: 'ยกเลิก', tone: 'danger' },
]

const MAINTENANCE_PAGE_SIZE = 8

function MaintenanceCategoryIcon({ category, size = 18 }) {
  const key = MAINTENANCE_CATEGORY_LABEL[category] ? category : 'other'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {MAINTENANCE_CATEGORY_ICON[key]}
    </svg>
  )
}

function RoomMaintenanceHistory({ requests, loading, error, onRetry, onSelect, onPhotos }) {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const list = useMemo(() => requests || [], [requests])

  const counts = useMemo(() => {
    const result = { all: list.length, pending: 0, in_progress: 0, done: 0, cancelled: 0 }
    for (const request of list) if (request.status in result) result[request.status] += 1
    return result
  }, [list])

  const averageFix = useMemo(() => {
    const durations = list
      .filter((request) => request.status === 'done' && request.completed_at)
      .map((request) => new Date(request.completed_at) - new Date(request.created_at))
      .filter((ms) => Number.isFinite(ms) && ms >= 0)
    return durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : null
  }, [list])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return list
      .filter((request) => status === 'all' || request.status === status)
      .filter((request) => {
        if (!keyword) return true
        return [
          request.description,
          MAINTENANCE_CATEGORY_LABEL[request.category],
          `${request.first_name} ${request.last_name}`,
          request.accepted_by_name,
          request.completed_by_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      })
      .sort((a, b) => {
        const diff = new Date(a.created_at) - new Date(b.created_at) || a.id - b.id
        return sort === 'oldest' ? diff : -diff
      })
  }, [list, status, search, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / MAINTENANCE_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * MAINTENANCE_PAGE_SIZE, currentPage * MAINTENANCE_PAGE_SIZE)
  const groups = useMemo(() => {
    const result = []
    for (const request of pageItems) {
      const date = new Date(request.created_at)
      const valid = !Number.isNaN(date.getTime())
      const key = valid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown'
      let group = result[result.length - 1]
      if (!group || group.key !== key) {
        group = { key, label: valid ? date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : 'ไม่ระบุวันที่', items: [] }
        result.push(group)
      }
      group.items.push(request)
    }
    return result
  }, [pageItems])

  const canClear = status !== 'all' || Boolean(search.trim()) || sort !== 'newest'
  const ready = !loading && !error && list.length > 0
  const clearFilters = () => {
    setStatus('all')
    setSearch('')
    setSort('newest')
    setPage(1)
  }

  return (
    <div className="room-history maintenance-history">
      {ready && (
        <div className="room-history-head">
          <div className="room-history-totals">
            <div className="is-warning">
              <span className="room-history-total-icon"><RoomDetailIcon type="wrench" size={20} /></span>
              <div>
                <span>ค้างดำเนินการ</span>
                <strong>{counts.pending + counts.in_progress} รายการ</strong>
              </div>
              <small>รอ {counts.pending} · กำลังซ่อม {counts.in_progress}</small>
            </div>
            <div className="is-success">
              <span className="room-history-total-icon"><RoomDetailIcon type="check" size={20} /></span>
              <div>
                <span>ซ่อมเสร็จแล้ว</span>
                <strong>{counts.done} รายการ</strong>
              </div>
              <small>ยกเลิก {counts.cancelled} รายการ</small>
            </div>
            <div className="is-info">
              <span className="room-history-total-icon"><RoomDetailIcon type="clock" size={20} /></span>
              <div>
                <span>ใช้เวลาซ่อมเฉลี่ย</span>
                <strong>{averageFix === null ? '-' : formatRemaining(averageFix)}</strong>
              </div>
              <small>นับจากแจ้งจนเสร็จ</small>
            </div>
          </div>

          <div className="room-history-filter">
            <div className="room-history-segments" role="group" aria-label="สถานะแจ้งซ่อม">
              {MAINTENANCE_FILTERS.map((segment) => (
                <button
                  key={segment.key}
                  type="button"
                  className={`room-history-segment is-${segment.tone}${status === segment.key ? ' active' : ''}`}
                  aria-pressed={status === segment.key}
                  onClick={() => {
                    setStatus(segment.key)
                    setPage(1)
                  }}
                >
                  {segment.label}
                  <span>{counts[segment.key]}</span>
                </button>
              ))}
            </div>
            <label className="room-history-search">
              <RoomDetailIcon type="search" size={15} />
              <input
                type="search"
                placeholder="ค้นหารายละเอียด ประเภท หรือผู้แจ้ง"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className="room-history-sort">
              <span>เรียงตาม</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value)
                  setPage(1)
                }}
              >
                <option value="newest">ล่าสุดก่อน</option>
                <option value="oldest">เก่าสุดก่อน</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="room-history-body">
        {loading ? (
          <div className="room-history-state">
            <span className="room-detail-spinner" aria-hidden="true" />
            <strong>กำลังโหลดประวัติแจ้งซ่อม...</strong>
          </div>
        ) : error ? (
          <div className="room-history-state is-error" role="alert">
            <span className="room-history-state-icon"><RoomDetailIcon type="alert" size={24} /></span>
            <strong>{error}</strong>
            <button type="button" className="admin-action-btn is-ghost" onClick={onRetry}>ลองใหม่</button>
          </div>
        ) : list.length === 0 ? (
          <div className="room-history-state">
            <span className="room-history-state-icon"><RoomDetailIcon type="wrench" size={24} /></span>
            <strong>ยังไม่มีประวัติแจ้งซ่อม</strong>
            <span>เมื่อผู้เช่าแจ้งซ่อมห้องนี้ รายการจะแสดงที่นี่</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="room-history-state">
            <span className="room-history-state-icon"><RoomDetailIcon type="search" size={24} /></span>
            <strong>ไม่พบรายการที่ตรงกับเงื่อนไข</strong>
            <button type="button" className="admin-action-btn is-ghost" onClick={clearFilters}>ล้างตัวกรอง</button>
          </div>
        ) : (
          <div className="room-history-table is-maintenance">
            <div className="room-history-thead" aria-hidden="true">
              <span>วันที่แจ้ง</span>
              <span>รายการ</span>
              <span>ผู้แจ้ง</span>
              <span>สถานะ</span>
              <span className="is-center">รูปภาพ</span>
              <span />
            </div>
            {groups.map((group) => (
              <section className="room-history-group" key={group.key}>
                <header className="room-history-group-head">
                  <strong>{group.label}</strong>
                  <span>{group.items.length} รายการ</span>
                </header>
                <ul className="room-history-list">
                  {group.items.map((request) => {
                    const category = MAINTENANCE_CATEGORY_LABEL[request.category] ? request.category : 'other'
                    const date = new Date(request.created_at)
                    const validDate = !Number.isNaN(date.getTime())
                    const photoCount = request.photos?.length || 0
                    return (
                      <li
                        key={request.id}
                        className={`is-maintenance-${request.status}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`ดูรายละเอียดแจ้งซ่อม ${MAINTENANCE_CATEGORY_LABEL[category]}`}
                        onClick={() => onSelect(request)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelect(request)
                          }
                        }}
                      >
                        <div className="room-history-cell-date">
                          <strong>{validDate ? date.getDate() : '-'}</strong>
                          <span>{validDate ? date.toLocaleDateString('th-TH', { month: 'short' }) : ''}</span>
                        </div>
                        <div className="room-history-cell-item maintenance-cell-item">
                          <span className={`room-detail-row-icon category-${category}`}>
                            <MaintenanceCategoryIcon category={category} size={16} />
                          </span>
                          <div>
                            <strong>{MAINTENANCE_CATEGORY_LABEL[category]}</strong>
                            <span title={request.description}>{request.description || 'ไม่มีรายละเอียด'}</span>
                          </div>
                        </div>
                        <div className="room-history-cell-tenant">
                          <strong>{request.first_name} {request.last_name}</strong>
                          <span>{formatDateTime(request.created_at)}</span>
                        </div>
                        <div className="room-history-cell-status">
                          <span className={`admin-badge status-${request.status}`}>
                            {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
                          </span>
                        </div>
                        <div className="room-history-cell-slip">
                          {photoCount > 0 ? (
                            <button
                              type="button"
                              className="room-history-slip-icon"
                              title="ดูรูปภาพ"
                              onClick={(event) => {
                                event.stopPropagation()
                                onPhotos(request, 0)
                              }}
                            >
                              <RoomDetailIcon type="receipt" size={14} />
                              {photoCount} รูป
                            </button>
                          ) : (
                            <span className="room-history-slip-none">ไม่มีรูป</span>
                          )}
                        </div>
                        <span className="room-history-cell-chevron" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {ready && (
        <footer className="room-history-foot">
          <div className="room-history-result">
            <span>
              แสดง {filtered.length === 0 ? 0 : (currentPage - 1) * MAINTENANCE_PAGE_SIZE + 1}–
              {Math.min(currentPage * MAINTENANCE_PAGE_SIZE, filtered.length)} จาก {filtered.length} รายการ
            </span>
            {canClear && <button type="button" onClick={clearFilters}>ล้างตัวกรอง</button>}
          </div>
          <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
        </footer>
      )}
    </div>
  )
}

function MaintenanceDetail({ request, onPhotos }) {
  const category = MAINTENANCE_CATEGORY_LABEL[request.category] ? request.category : 'other'
  const photos = request.photos || []
  const facts = [
    { icon: 'door', label: 'ห้อง', value: request.room_number },
    { icon: 'user', label: 'ผู้แจ้ง', value: `${request.first_name || ''} ${request.last_name || ''}`.trim() },
    { icon: 'phone', label: 'เบอร์ติดต่อ', value: request.contact_phone || request.phone, href: request.contact_phone || request.phone },
    { icon: 'clock', label: 'ช่วงเวลาที่สะดวก', value: MAINTENANCE_TIME_LABEL[request.preferred_time] || 'เวลาไหนก็ได้' },
    { icon: 'calendar', label: 'แจ้งเมื่อ', value: formatDateTime(request.created_at) },
    { icon: 'receipt', label: 'เลขที่แจ้งซ่อม', value: `#${request.id}` },
  ]

  return (
    <div className={`maintenance-detail is-${request.status}`}>
      <div className="maintenance-detail-hero">
        <span className={`maintenance-detail-hero-icon category-${category}`}>
          <MaintenanceCategoryIcon category={category} size={24} />
        </span>
        <div className="maintenance-detail-hero-text">
          <span>ประเภทงานซ่อม</span>
          <strong>{MAINTENANCE_CATEGORY_LABEL[category]}</strong>
        </div>
        <span className={`admin-badge status-${request.status}`}>{MAINTENANCE_STATUS_LABEL[request.status] || request.status}</span>
      </div>

      <dl className="payment-detail-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt><RoomDetailIcon type={fact.icon} size={14} />{fact.label}</dt>
            <dd>{fact.href ? <a className="maintenance-detail-tel" href={`tel:${fact.href}`}>{fact.value}</a> : fact.value || '-'}</dd>
          </div>
        ))}
      </dl>

      <section className="payment-detail-section">
        <h4><RoomDetailIcon type="note" size={16} />รายละเอียดปัญหา</h4>
        {request.description ? (
          <p className="maintenance-detail-description">{request.description}</p>
        ) : (
          <div className="payment-detail-note-empty">
            <RoomDetailIcon type="note" size={18} />
            <span>ไม่มีรายละเอียดเพิ่มเติม</span>
          </div>
        )}
      </section>

      <section className="payment-detail-section">
        <h4><RoomDetailIcon type="history" size={16} />ขั้นตอนการดำเนินการ</h4>
        <AdminRequestTimeline kind="maintenance" request={request} />
      </section>

      <section className="payment-detail-section">
        <h4>
          <RoomDetailIcon type="receipt" size={16} />
          รูปภาพประกอบ
          {photos.length > 0 && <span className="maintenance-detail-count">{photos.length}</span>}
        </h4>
        {photos.length > 0 ? (
          <div className="maintenance-detail-photos">
            {photos.map((photo, index) => (
              <button type="button" key={`${photo.url}-${index}`} onClick={() => onPhotos(request, index)} title="ดูรูปขนาดเต็ม">
                <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
              </button>
            ))}
          </div>
        ) : (
          <div className="payment-detail-slip-empty">
            <RoomDetailIcon type="receipt" size={20} />
            <span>ไม่มีรูปภาพแนบ</span>
          </div>
        )}
      </section>
    </div>
  )
}

function ProcessSteps({ steps: raw, startDate, endDate, pendingText = 'ไม่มีข้อมูล' }) {
  const steps = raw.map((step, index) => {
    const previous = raw.slice(0, index).reverse().find((item) => item.date)
    const gap = previous && step.date ? new Date(step.date) - new Date(previous.date) : null
    return { ...step, done: Boolean(step.date), gap: gap !== null && gap >= 0 ? formatRemaining(gap) : null }
  })
  const total = endDate && startDate ? new Date(endDate) - new Date(startDate) : null

  return (
    <div className="moveout-steps-wrap">
      <ol className="moveout-steps">
        {steps.map((step, index) => (
          <li key={step.key} className={`${step.done ? 'is-done' : 'is-pending'}${step.tone ? ` is-${step.tone}` : ''}`}>
            {index > 0 && (
              <span className="moveout-step-connector" aria-hidden="true">
                {step.gap && <small>+ {step.gap}</small>}
              </span>
            )}
            <span className="moveout-step-dot">
              <RoomDetailIcon type={step.done ? step.icon : 'clock'} size={16} />
            </span>
            <div className="moveout-step-body">
              <strong>{step.label}</strong>
              {step.by && step.done && <span className="admin-actor-inline">{step.by}</span>}
              <small>{step.date ? formatDateTime(step.date) : step.pendingText || pendingText}</small>
            </div>
          </li>
        ))}
      </ol>
      {total !== null && total >= 0 ? (
        <p className="moveout-steps-total">
          <RoomDetailIcon type="clock" size={13} />
          ใช้เวลาทั้งหมด <strong>{formatRemaining(total)}</strong>
        </p>
      ) : (
        <p className="moveout-steps-total is-waiting">
          <RoomDetailIcon type="clock" size={13} />
          กำลังดำเนินการ
        </p>
      )}
    </div>
  )
}

function MoveoutSteps({ moveout }) {
  return (
    <ProcessSteps
      startDate={moveout.created_at}
      endDate={moveout.completed_at}
      steps={[
        { key: 'request', label: 'ส่งคำขอย้ายออก', by: `${moveout.first_name || ''} ${moveout.last_name || ''}`.trim(), date: moveout.created_at, icon: 'note' },
        { key: 'accept', label: 'เจ้าหน้าที่รับเรื่อง', by: moveout.accepted_by_name, date: moveout.accepted_at, icon: 'user' },
        { key: 'done', label: 'ย้ายออกเสร็จสิ้น', by: moveout.completed_by_name, date: moveout.completed_at, icon: 'check' },
      ]}
    />
  )
}

function RequestSteps({ request }) {
  const rejected = request.status === 'rejected'
  const finished = request.status === 'approved' || rejected
  return (
    <ProcessSteps
      startDate={request.created_at}
      endDate={finished ? request.completed_at : null}
      steps={[
        { key: 'request', label: 'ส่งคำขอ', by: `${request.first_name || ''} ${request.last_name || ''}`.trim(), date: request.created_at, icon: 'note' },
        {
          key: 'accept',
          label: 'เจ้าหน้าที่รับเรื่อง',
          by: request.accepted_by_name,
          date: request.accepted_at,
          icon: 'user',
          pendingText: 'กำลังรอดำเนินการ',
        },
        {
          key: 'done',
          label: rejected ? 'ปฏิเสธคำขอ' : finished ? 'อนุมัติคำขอ' : 'รอผลการพิจารณา',
          by: request.completed_by_name,
          date: finished ? request.completed_at : null,
          icon: rejected ? 'x' : 'check',
          tone: rejected ? 'danger' : undefined,
          pendingText: 'ยังไม่ถึงขั้นตอนนี้',
        },
      ]}
    />
  )
}

const INSPECTION_RESULT_INFO = {
  good: { label: 'ปกติ', tone: 'success' },
  wear: { label: 'สึกหรอ', tone: 'warning' },
  damaged: { label: 'ชำรุด', tone: 'danger' },
  missing: { label: 'สูญหาย', tone: 'danger' },
  not_applicable: { label: 'ไม่มี', tone: 'muted' },
  none: { label: 'ไม่ได้ระบุ', tone: 'muted' },
}

function MoveoutDetail({ row, detail, loading, error, onRetry, onOpenInspection, onSelectPayment, idcardRevealed, onToggleIdCard }) {
  const moveout = detail?.moveout ? { ...row, ...detail.moveout } : row
  const paymentList = detail?.paymentList || []
  const stayDays = calcStayDays(moveout.move_in_date, moveout.completed_at)
  const inspection = detail?.inspection
  const inspectionSummary = inspection ? summarizeInspection(inspection.checklist) : null
  const idcard = String(moveout.idcard || '')
  const facts = [
    {
      icon: 'user',
      label: 'บัตรประชาชน',
      value: (
        <button type="button" className="admin-idcard-toggle" onClick={onToggleIdCard}>
          {idcardRevealed ? idcard || '-' : '•'.repeat(idcard.length || 13)}
        </button>
      ),
    },
    { icon: 'phone', label: 'เบอร์โทร', value: moveout.phone ? <a className="maintenance-detail-tel" href={`tel:${moveout.phone}`}>{moveout.phone}</a> : '-' },
    { icon: 'user', label: 'อายุ', value: moveout.age ? `${moveout.age} ปี` : '-' },
    { icon: 'wallet', label: 'เงินมัดจำ', value: moveout.deposit_amount != null ? `฿${formatCurrency(moveout.deposit_amount)}` : '-' },
    { icon: 'door', label: 'ค่าเช่าห้อง', value: moveout.room_price != null ? `฿${formatCurrency(moveout.room_price)} / เดือน` : '-' },
    { icon: 'calendar', label: 'ลงทะเบียนเมื่อ', value: formatDate(moveout.registered_at) },
  ]

  return (
    <div className="moveout-detail">
      <div className="moveout-detail-hero">
        <div className="moveout-detail-hero-top">
          <span className="tenant-card-avatar" aria-hidden="true"><PersonIcon size={22} /></span>
          <div className="moveout-detail-hero-text">
            <span>ผู้เช่าที่ย้ายออก</span>
            <strong>{moveout.first_name} {moveout.last_name}</strong>
          </div>
          <span className="moveout-cell-room">
            <RoomDetailIcon type="home" size={13} />
            ห้อง {moveout.room_number}
          </span>
          <span className="moveout-detail-status">
            <RoomDetailIcon type="check" size={13} />
            ย้ายออกเรียบร้อย
          </span>
        </div>
        <dl className="moveout-detail-stay">
          <div>
            <dt><RoomDetailIcon type="calendar" size={13} />วันที่เข้าพัก</dt>
            <dd>{formatDate(moveout.move_in_date)}</dd>
          </div>
          <div>
            <dt><RoomDetailIcon type="door" size={13} />วันที่ย้ายออก</dt>
            <dd>{formatDateTime(moveout.completed_at)}</dd>
          </div>
          <div className="is-total">
            <dt><RoomDetailIcon type="clock" size={13} />รวมวันที่พัก</dt>
            <dd>
              {stayDays !== null ? `${stayDays} วัน` : '-'}
              {stayDays !== null && stayDays >= 30 && <small> (~{formatDays(stayDays)})</small>}
            </dd>
          </div>
        </dl>
      </div>

      <section className="payment-detail-section">
        <h4><RoomDetailIcon type="user" size={16} />ข้อมูลผู้เช่า</h4>
        <dl className="payment-detail-facts is-three">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt><RoomDetailIcon type={fact.icon} size={14} />{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="payment-detail-section">
        <h4><RoomDetailIcon type="history" size={16} />ขั้นตอนการย้ายออก</h4>
        <MoveoutSteps moveout={moveout} />
        {(moveout.preferred_move_date || moveout.note) && (
          <dl className="moveout-detail-extra">
            {moveout.preferred_move_date && (
              <div><dt>วันที่ผู้เช่าต้องการย้ายออก</dt><dd>{formatDate(moveout.preferred_move_date)}</dd></div>
            )}
            {moveout.note && (
              <div className="is-note">
                <dt><RoomDetailIcon type="note" size={14} />หมายเหตุจากผู้เช่า</dt>
                <dd>{moveout.note}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {loading ? (
        <div className="room-detail-loading">
          <span className="room-detail-spinner" aria-hidden="true" />
          กำลังโหลดข้อมูลเพิ่มเติม...
        </div>
      ) : error ? (
        <div className="room-detail-error" role="alert">
          <span>{error}</span>
          <button type="button" className="admin-action-btn is-ghost" onClick={onRetry}>ลองใหม่</button>
        </div>
      ) : detail ? (
        <div className="moveout-detail-grid">
          <section className={`moveout-card${inspection ? ` is-${inspectionSummary.tone}` : ''}`}>
            <header className="moveout-card-head">
              <span className="moveout-card-icon"><RoomDetailIcon type="clipboard" size={18} /></span>
              <div>
                <h4>ผลตรวจห้องตอนย้ายออก</h4>
                <span>
                  {inspection
                    ? `ตรวจโดย ${inspection.inspected_by_name || '-'} · ${formatDate(inspection.created_at)}`
                    : 'ยังไม่มีข้อมูลการตรวจห้อง'}
                </span>
              </div>
              {inspection && (
                <span className={`room-detail-chip ${inspection.status === 'reviewed' ? 'is-success' : 'is-warning'}`}>
                  {MOVE_OUT_INSPECTION_STATUS[inspection.status] || inspection.status}
                </span>
              )}
            </header>

            {inspection ? (
              <>
                <div className="moveout-card-summary">
                  <strong className="moveout-card-verdict">{INSPECTION_TONE_LABEL[inspectionSummary.tone]}</strong>
                  <div className="moveout-card-stats">
                    <span className="is-success"><strong>{inspectionSummary.counts.good}</strong>ปกติ</span>
                    <span className="is-warning"><strong>{inspectionSummary.counts.wear}</strong>สึกหรอ</span>
                    <span className="is-danger"><strong>{inspectionSummary.counts.damaged + inspectionSummary.counts.missing}</strong>ชำรุด/หาย</span>
                    <span><strong>{inspection.photo_count || 0}</strong>รูป</span>
                  </div>
                </div>
                <ul className="moveout-card-list">
                  {MOVE_OUT_CHECKLIST.map((item) => {
                    const result = inspection.checklist?.[item.key]
                    const info = INSPECTION_RESULT_INFO[result] || INSPECTION_RESULT_INFO.none
                    return (
                      <li key={item.key}>
                        <span className={`moveout-card-dot is-${info.tone}`} aria-hidden="true" />
                        <span className="moveout-card-list-label" title={item.label}>{item.label}</span>
                        <span className={`room-detail-chip is-${info.tone}`}>{info.label}</span>
                      </li>
                    )
                  })}
                </ul>
                <footer className="moveout-card-foot">
                  {inspection.damage_note ? (
                    <p title={inspection.damage_note}>
                      <RoomDetailIcon type="note" size={13} />
                      <span>{inspection.damage_note}</span>
                    </p>
                  ) : (
                    <p className="is-empty"><RoomDetailIcon type="note" size={13} /><span>ไม่มีบันทึกความเสียหาย</span></p>
                  )}
                  <button type="button" className="admin-action-btn is-primary" onClick={() => onOpenInspection(inspection)}>
                    ดูผลตรวจห้อง
                  </button>
                </footer>
              </>
            ) : (
              <div className="moveout-card-empty">
                <span className="room-history-state-icon"><RoomDetailIcon type="clipboard" size={22} /></span>
                <strong>ไม่พบผลตรวจห้อง</strong>
                <span>ไม่พบผลตรวจห้องของการย้ายออกครั้งนี้</span>
              </div>
            )}
          </section>

          <section className="moveout-card">
            <header className="moveout-card-head">
              <span className="moveout-card-icon"><RoomDetailIcon type="wallet" size={18} /></span>
              <div>
                <h4>การชำระเงินระหว่างพัก</h4>
                <span>{paymentList.length} รายการ · แจ้งซ่อม {detail.maintenance.total} ครั้ง</span>
              </div>
              {detail.maintenance.open > 0 && <span className="room-detail-chip is-warning">ซ่อมค้าง {detail.maintenance.open}</span>}
            </header>

            <div className="moveout-card-totals">
              <div className="is-success">
                <span>ชำระแล้ว</span>
                <strong>฿{formatCurrency(detail.payments.paid.total)}</strong>
              </div>
              <div className="is-warning">
                <span>รอชำระ</span>
                <strong>฿{formatCurrency(detail.payments.pending.total)}</strong>
              </div>
              <div className="is-danger">
                <span>ค้างชำระ</span>
                <strong>฿{formatCurrency(detail.payments.overdue.total)}</strong>
              </div>
            </div>

            {paymentList.length > 0 ? (
              <ul className="moveout-card-list is-payments">
                {paymentList.map((payment) => {
                  const date = new Date(payment.payment_date || payment.created_at)
                  const validDate = !Number.isNaN(date.getTime())
                  return (
                    <li
                      key={payment.id}
                      className={`is-${payment.status}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectPayment(payment)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onSelectPayment(payment)
                        }
                      }}
                    >
                      <span className="moveout-card-date">
                        <strong>{validDate ? date.getDate() : '-'}</strong>
                        <small>{validDate ? date.toLocaleDateString('th-TH', { month: 'short' }) : ''}</small>
                      </span>
                      <span className="moveout-card-list-label">
                        <strong>{PAYMENT_TYPE_LABEL[payment.type] || payment.type}</strong>
                        <span className={`admin-badge status-${PAYMENT_BADGE_CLASS[payment.status] || 'pending'}`}>
                          {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                        </span>
                      </span>
                      <span className="moveout-card-amount">฿{formatCurrency(payment.amount)}</span>
                      <svg className="moveout-card-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="moveout-card-empty">
                <span className="room-history-state-icon"><RoomDetailIcon type="wallet" size={22} /></span>
                <strong>ไม่มีรายการชำระเงิน</strong>
                <span>ไม่พบการชำระเงินระหว่างที่พักห้องนี้</span>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

const RENTAL_PAGE_SIZE = 10

function CustomerRentalHistory({ history, onSlip, onSelectPayment }) {
  const bookings = useMemo(() => history || [], [history])
  const [selectedId, setSelectedId] = useState(() => bookings[0]?.booking_id ?? null)
  const [page, setPage] = useState(1)
  const [contractSearch, setContractSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const selected = bookings.find((booking) => booking.booking_id === selectedId) || bookings[0] || null

  const visibleBookings = useMemo(() => {
    const keyword = contractSearch.trim().toLowerCase()
    if (!keyword) return bookings
    return bookings.filter((booking) =>
      [
        booking.room_number ? `ห้อง ${booking.room_number}` : '',
        formatDateTime(booking.created_at),
        formatDate(booking.rental_start_date),
        formatDate(booking.rental_end_date),
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [bookings, contractSearch])

  const allPayments = useMemo(() => (selected ? selected.payments : []), [selected])
  const totals = useMemo(() => {
    const result = { paid: 0, pending: 0, overdue: 0, paidCount: 0, pendingCount: 0, overdueCount: 0 }
    for (const payment of allPayments) {
      if (payment.status in result) {
        result[payment.status] += Number(payment.amount || 0)
        result[`${payment.status}Count`] += 1
      }
    }
    return result
  }, [allPayments])

  const payments = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return allPayments
      .filter((payment) => status === 'all' || payment.status === status)
      .filter((payment) => {
        if (!keyword) return true
        return [
          formatDate(payment.payment_date),
          PAYMENT_TYPE_LABEL[payment.type] || payment.type,
          formatCurrency(payment.amount),
          PAYMENT_STATUS_LABEL[payment.status] || payment.status,
          payment.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      })
      .sort(comparePayments(sort))
  }, [allPayments, status, search, sort])

  const canClear = status !== 'all' || Boolean(search.trim()) || sort !== 'newest'
  const clearFilters = () => {
    setStatus('all')
    setSearch('')
    setSort('newest')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(payments.length / RENTAL_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = payments.slice((currentPage - 1) * RENTAL_PAGE_SIZE, currentPage * RENTAL_PAGE_SIZE)

  if (bookings.length === 0) {
    return (
      <div className="room-history-state">
        <span className="room-history-state-icon"><RoomDetailIcon type="history" size={24} /></span>
        <strong>ยังไม่มีประวัติการเช่า</strong>
        <span>เมื่อลูกค้าทำสัญญาเช่า รายการจะแสดงที่นี่</span>
      </div>
    )
  }

  return (
    <div className="rental-history">
      <aside className="rental-history-contracts">
        <header>
          <strong>สัญญาเช่า</strong>
          <span>{bookings.length}</span>
        </header>
        <label className="room-history-search rental-history-contract-search">
          <RoomDetailIcon type="search" size={14} />
          <input
            type="search"
            placeholder="ค้นหาห้องหรือวันที่"
            value={contractSearch}
            onChange={(event) => setContractSearch(event.target.value)}
          />
        </label>
        <div className="rental-history-contract-list" role="tablist" aria-label="เลือกสัญญาเช่า">
          {visibleBookings.length === 0 && <p className="rental-history-contract-empty">ไม่พบสัญญาที่ค้นหา</p>}
          {visibleBookings.map((booking) => {
            const index = bookings.indexOf(booking)
            const date = new Date(booking.created_at)
            const valid = !Number.isNaN(date.getTime())
            const paidTotal = booking.payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
            const active = selected?.booking_id === booking.booking_id
            return (
              <button
                key={booking.booking_id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`rental-history-contract${active ? ' active' : ''}`}
                onClick={() => {
                  setSelectedId(booking.booking_id)
                  setStatus('all')
                  setSearch('')
                  setPage(1)
                }}
              >
                <span className="rental-history-contract-date">
                  <strong>{valid ? date.getDate() : '-'}</strong>
                  <small>{valid ? date.toLocaleDateString('th-TH', { month: 'short' }) : ''}</small>
                  <small>{valid ? date.getFullYear() + 543 : ''}</small>
                </span>
                <span className="rental-history-contract-info">
                  <strong>
                    {booking.room_number ? `ห้อง ${booking.room_number}` : 'สัญญาเช่า'}
                    {index === 0 && <em>ล่าสุด</em>}
                  </strong>
                  <span>{valid ? date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'} น. · {booking.payments.length} รายการ</span>
                  <span className="rental-history-contract-total">ชำระแล้ว ฿{formatCurrency(paidTotal)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="rental-history-main">
        {selected && (
          <>
            <header className="rental-history-main-head">
              <div className="rental-history-main-title">
                <span className="room-history-total-icon"><RoomDetailIcon type="receipt" size={18} /></span>
                <div>
                  <strong>สัญญาเช่าเมื่อ {formatDateTime(selected.created_at)}</strong>
                  <span>
                    {selected.room_number ? `ห้อง ${selected.room_number}` : 'ไม่ระบุห้อง'}
                    {selected.rental_start_date && selected.rental_end_date
                      ? ` · ${formatDate(selected.rental_start_date)} – ${formatDate(selected.rental_end_date)}`
                      : ''}
                  </span>
                </div>
              </div>
              <div className="rental-history-main-totals">
                <span className="room-detail-chip is-success">ชำระแล้ว ฿{formatCurrency(totals.paid)}</span>
                <span className="room-detail-chip is-warning">รอชำระ {totals.pendingCount}</span>
                <span className="room-detail-chip is-danger">ค้างชำระ {totals.overdueCount}</span>
              </div>
            </header>

            {allPayments.length > 0 && (
              <div className="room-history-filter rental-history-filter">
                <div className="room-history-segments" role="group" aria-label="สถานะการชำระ">
                  {[
                    { key: 'all', label: 'ทั้งหมด', tone: 'all', count: allPayments.length },
                    { key: 'paid', label: 'ชำระแล้ว', tone: 'success', count: totals.paidCount },
                    { key: 'pending', label: 'รอชำระ', tone: 'warning', count: totals.pendingCount },
                    { key: 'overdue', label: 'ค้างชำระ', tone: 'danger', count: totals.overdueCount },
                  ].map((segment) => (
                    <button
                      key={segment.key}
                      type="button"
                      className={`room-history-segment is-${segment.tone}${status === segment.key ? ' active' : ''}`}
                      aria-pressed={status === segment.key}
                      onClick={() => {
                        setStatus(segment.key)
                        setPage(1)
                      }}
                    >
                      {segment.label}
                      <span>{segment.count}</span>
                    </button>
                  ))}
                </div>
                <label className="room-history-search">
                  <RoomDetailIcon type="search" size={15} />
                  <input
                    type="search"
                    placeholder="ค้นหาประเภท จำนวนเงิน หรือหมายเหตุ"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setPage(1)
                    }}
                  />
                </label>
                <label className="room-history-sort">
                  <span>เรียงตาม</span>
                  <select
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value)
                      setPage(1)
                    }}
                  >
                    {Object.entries(ROOM_HISTORY_SORTS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="rental-history-table-card">
              {allPayments.length === 0 ? (
                <div className="room-history-state">
                  <span className="room-history-state-icon"><RoomDetailIcon type="wallet" size={24} /></span>
                  <strong>ยังไม่มีประวัติการชำระเงิน</strong>
                  <span>สัญญานี้ยังไม่มีรายการชำระเงิน</span>
                </div>
              ) : payments.length === 0 ? (
                <div className="room-history-state">
                  <span className="room-history-state-icon"><RoomDetailIcon type="search" size={24} /></span>
                  <strong>ไม่พบรายการที่ตรงกับเงื่อนไข</strong>
                  <button type="button" className="admin-action-btn is-ghost" onClick={clearFilters}>ล้างตัวกรอง</button>
                </div>
              ) : (
                <div className="room-history-table is-rental">
                  <div className="room-history-thead" aria-hidden="true">
                    <span>วันที่ชำระ</span>
                    <span>รายการ</span>
                    <span>สถานะ</span>
                    <span className="is-right">จำนวนเงิน</span>
                    <span className="is-center">สลิป</span>
                    <span />
                  </div>
                  <ul className="room-history-list">
                    {pageItems.map((payment) => {
                      const note = splitPaymentNote(payment.note)
                      const date = new Date(payment.payment_date || payment.created_at)
                      const validDate = !Number.isNaN(date.getTime())
                      return (
                        <li
                          key={payment.id}
                          className={`is-${payment.status}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดการชำระ ฿${formatCurrency(payment.amount)}`}
                          onClick={() => onSelectPayment(payment, selected)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              onSelectPayment(payment, selected)
                            }
                          }}
                        >
                          <div className="room-history-cell-date">
                            <strong>{validDate ? date.getDate() : '-'}</strong>
                            <span>{validDate ? date.toLocaleDateString('th-TH', { month: 'short' }) : ''}</span>
                          </div>
                          <div className="room-history-cell-item">
                            <strong>{PAYMENT_TYPE_LABEL[payment.type] || payment.type}</strong>
                            <span className={note.main ? '' : 'is-empty'} title={payment.note || ''}>{note.main || 'ไม่มีหมายเหตุ'}</span>
                          </div>
                          <div className="room-history-cell-status">
                            <span className={`admin-badge status-${PAYMENT_BADGE_CLASS[payment.status] || 'pending'}`}>
                              {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                            </span>
                          </div>
                          <div className="room-history-cell-amount">฿{formatCurrency(payment.amount)}</div>
                          <div className="room-history-cell-slip">
                            {payment.slip_path ? (
                              <button
                                type="button"
                                className="room-history-slip-icon"
                                title="ดูสลิปโอนเงิน"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onSlip(payment)
                                }}
                              >
                                <RoomDetailIcon type="receipt" size={14} />
                                ดูสลิป
                              </button>
                            ) : (
                              <span className="room-history-slip-none">ไม่มีสลิป</span>
                            )}
                          </div>
                          <span className="room-history-cell-chevron" aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>

            <footer className="rental-history-foot">
              <div className="room-history-result">
                <span>
                  {payments.length === 0
                    ? 'ไม่มีรายการ'
                    : `แสดง ${(currentPage - 1) * RENTAL_PAGE_SIZE + 1}–${Math.min(currentPage * RENTAL_PAGE_SIZE, payments.length)} จาก ${payments.length} รายการ`}
                </span>
                {canClear && <button type="button" onClick={clearFilters}>ล้างตัวกรอง</button>}
              </div>
              <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

function describeTenantStatus(tenant, roomNumber) {
  if (tenant.is_current) return { label: 'ผู้เช่าปัจจุบัน', tone: 'current' }
  if (tenant.is_suspended) return { label: 'ระงับบัญชีแล้ว', tone: 'danger' }
  if (tenant.current_room_number && Number(tenant.current_room_number) !== Number(roomNumber)) {
    return { label: `ย้ายไปห้อง ${tenant.current_room_number}`, tone: 'moved' }
  }
  return { label: 'ย้ายออกแล้ว', tone: 'past' }
}

const TENANT_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', tone: 'all' },
  { key: 'current', label: 'ปัจจุบัน', tone: 'success' },
  { key: 'past', label: 'ย้ายออก/ย้ายห้อง', tone: 'warning' },
]

function RoomTenantHistory({ tenants, roomNumber, loading, error, onRetry, onOpenPayments, focusId = null }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const list = useMemo(() => tenants || [], [tenants])
  const bodyRef = useRef(null)

  useEffect(() => {
    if (loading || !focusId || !bodyRef.current) return
    const target = bodyRef.current.querySelector(`[data-booking-id="${focusId}"]`)
    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [loading, focusId, tenants])

  const summary = useMemo(() => {
    const stays = list.map((tenant) => calcStayDays(tenant.rental_start_date, tenant.rental_end_date)).filter((days) => days !== null)
    const paid = list.reduce((sum, tenant) => sum + tenant.payments.paid.total, 0)
    const people = new Set(list.map((tenant) => tenant.customer_id)).size
    return {
      people,
      averageStay: stays.length ? Math.round(stays.reduce((sum, days) => sum + days, 0) / stays.length) : null,
      paid,
    }
  }, [list])

  const counts = useMemo(
    () => ({ all: list.length, current: list.filter((tenant) => tenant.is_current).length, past: list.filter((tenant) => !tenant.is_current).length }),
    [list],
  )

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return list
      .filter((tenant) => (filter === 'current' ? tenant.is_current : filter === 'past' ? !tenant.is_current : true))
      .filter((tenant) => !keyword || [tenant.first_name, tenant.last_name, tenant.phone].filter(Boolean).join(' ').toLowerCase().includes(keyword))
      .sort((a, b) => Number(b.is_current) - Number(a.is_current))
  }, [list, filter, search])

  const ready = !loading && !error && list.length > 0

  return (
    <div className="room-history tenant-history">
      {ready && (
        <div className="room-history-head">
          <div className="room-history-totals">
            <div className="is-info">
              <span className="room-history-total-icon"><RoomDetailIcon type="user" size={20} /></span>
              <div>
                <span>ผู้เช่าทั้งหมด</span>
                <strong>{summary.people} คน</strong>
              </div>
              <small>{list.length} สัญญา</small>
            </div>
            <div className="is-warning">
              <span className="room-history-total-icon"><RoomDetailIcon type="clock" size={20} /></span>
              <div>
                <span>อยู่เฉลี่ย</span>
                <strong>{formatDays(summary.averageStay) || '-'}</strong>
              </div>
              <small>ต่อสัญญา</small>
            </div>
            <div className="is-success">
              <span className="room-history-total-icon"><RoomDetailIcon type="wallet" size={20} /></span>
              <div>
                <span>ยอดชำระรวม</span>
                <strong>฿{formatCurrency(summary.paid)}</strong>
              </div>
              <small>ทุกผู้เช่า</small>
            </div>
          </div>

          <div className="room-history-filter">
            <div className="room-history-segments" role="group" aria-label="สถานะผู้เช่า">
              {TENANT_FILTERS.map((segment) => (
                <button
                  key={segment.key}
                  type="button"
                  className={`room-history-segment is-${segment.tone}${filter === segment.key ? ' active' : ''}`}
                  aria-pressed={filter === segment.key}
                  onClick={() => setFilter(segment.key)}
                >
                  {segment.label}
                  <span>{counts[segment.key]}</span>
                </button>
              ))}
            </div>
            <label className="room-history-search">
              <RoomDetailIcon type="search" size={15} />
              <input type="search" placeholder="ค้นหาชื่อหรือเบอร์โทร" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>
        </div>
      )}

      <div className="room-history-body" ref={bodyRef}>
        {loading ? (
          <div className="room-history-state">
            <span className="room-detail-spinner" aria-hidden="true" />
            <strong>กำลังโหลดประวัติผู้เช่า...</strong>
          </div>
        ) : error ? (
          <div className="room-history-state is-error" role="alert">
            <span className="room-history-state-icon"><RoomDetailIcon type="alert" size={24} /></span>
            <strong>{error}</strong>
            <button type="button" className="admin-action-btn is-ghost" onClick={onRetry}>ลองใหม่</button>
          </div>
        ) : list.length === 0 ? (
          <div className="room-history-state">
            <span className="room-history-state-icon"><RoomDetailIcon type="history" size={24} /></span>
            <strong>ยังไม่มีประวัติผู้เช่า</strong>
            <span>เมื่อมีการทำสัญญาเช่าห้องนี้ รายชื่อจะแสดงที่นี่</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="room-history-state">
            <span className="room-history-state-icon"><RoomDetailIcon type="search" size={24} /></span>
            <strong>ไม่พบผู้เช่าที่ตรงกับเงื่อนไข</strong>
            <button
              type="button"
              className="admin-action-btn is-ghost"
              onClick={() => {
                setFilter('all')
                setSearch('')
              }}
            >
              ล้างตัวกรอง
            </button>
          </div>
        ) : (
          <div className="tenant-history-list">
            {filtered.map((tenant) => {
              const status = describeTenantStatus(tenant, roomNumber)
              const stay = formatStayLength(tenant.rental_start_date, tenant.rental_end_date)
              const request = tenant.last_request
              const totalPayments = tenant.payments.paid.count + tenant.payments.pending.count + tenant.payments.overdue.count
              return (
                <article
                  key={tenant.booking_id}
                  data-booking-id={tenant.booking_id}
                  className={`tenant-card is-${status.tone}${tenant.booking_id === focusId ? ' is-focused' : ''}`}
                >
                  <header className="tenant-card-head">
                    <span className="tenant-card-avatar" aria-hidden="true"><PersonIcon size={20} /></span>
                    <div className="tenant-card-name">
                      <strong>{tenant.first_name} {tenant.last_name}</strong>
                      <span className={`tenant-card-status is-${status.tone}`}>{status.label}</span>
                    </div>
                    {tenant.phone && (
                      <a className="room-detail-row-phone" href={`tel:${tenant.phone}`}>
                        <RoomDetailIcon type="phone" size={13} />
                        {tenant.phone}
                      </a>
                    )}
                  </header>

                  <div className="tenant-card-period">
                    <div>
                      <span>เริ่มสัญญา</span>
                      <strong>{formatDate(tenant.rental_start_date || tenant.created_at)}</strong>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <polyline points="14 6 20 12 14 18" />
                    </svg>
                    <div>
                      <span>สิ้นสุดสัญญา</span>
                      <strong>{formatDate(tenant.rental_end_date)}</strong>
                    </div>
                    {stay && <span className="room-detail-chip is-stay"><RoomDetailIcon type="clock" size={11} />อยู่ {stay}</span>}
                  </div>

                  <dl className="tenant-card-facts">
                    <div><dt>อายุ</dt><dd>{tenant.age ? `${tenant.age} ปี` : '-'}</dd></div>
                    <div><dt>เงินมัดจำ</dt><dd>{tenant.deposit_amount != null ? `฿${formatCurrency(tenant.deposit_amount)}` : '-'}</dd></div>
                    <div><dt>ลงทะเบียนเมื่อ</dt><dd>{formatDate(tenant.registered_at)}</dd></div>
                    <div><dt>ทำสัญญาเมื่อ</dt><dd>{formatDate(tenant.created_at)}</dd></div>
                  </dl>

                  <div className="tenant-card-payments">
                    <div className="tenant-card-payments-head">
                      <span><RoomDetailIcon type="wallet" size={14} />การชำระเงิน</span>
                      <small>{totalPayments} รายการ{tenant.last_payment_date ? ` · ล่าสุด ${formatDate(tenant.last_payment_date)}` : ''}</small>
                    </div>
                    <div className="tenant-card-payments-grid">
                      <div className="is-success">
                        <span>ชำระแล้ว</span>
                        <strong>฿{formatCurrency(tenant.payments.paid.total)}</strong>
                        <small>{tenant.payments.paid.count} รายการ</small>
                      </div>
                      <div className="is-warning">
                        <span>รอชำระ</span>
                        <strong>฿{formatCurrency(tenant.payments.pending.total)}</strong>
                        <small>{tenant.payments.pending.count} รายการ</small>
                      </div>
                      <div className="is-danger">
                        <span>ค้างชำระ</span>
                        <strong>฿{formatCurrency(tenant.payments.overdue.total)}</strong>
                        <small>{tenant.payments.overdue.count} รายการ</small>
                      </div>
                    </div>
                  </div>

                  <div className="tenant-card-foot">
                    <span className={`room-detail-chip ${tenant.maintenance.open > 0 ? 'is-warning' : 'is-muted'}`}>
                      <RoomDetailIcon type="wrench" size={11} />
                      แจ้งซ่อม {tenant.maintenance.total} ครั้ง{tenant.maintenance.open > 0 ? ` · ค้าง ${tenant.maintenance.open}` : ''}
                    </span>
                    {request ? (
                      <span className={`room-detail-chip ${request.status === 'approved' ? 'is-success' : request.status === 'rejected' ? 'is-danger' : 'is-warning'}`}>
                        <RoomDetailIcon type="door" size={11} />
                        {REQUEST_TYPE_LABEL[request.type] || request.type}
                        {request.type === 'move_room' && request.target_room_number ? ` → ${request.target_room_number}` : ''}
                        {' · '}
                        {REQUEST_STATUS_LABEL[request.status] || request.status}
                        {request.completed_at ? ` ${formatDate(request.completed_at)}` : ''}
                      </span>
                    ) : (
                      <span className="room-detail-chip is-muted"><RoomDetailIcon type="door" size={11} />ไม่มีคำขอย้ายออก</span>
                    )}
                    {request?.inspection_status && (
                      <span className={`room-detail-chip ${request.inspection_status === 'reviewed' ? 'is-success' : 'is-warning'}`}>
                        <RoomDetailIcon type="clipboard" size={11} />
                        ตรวจห้อง: {MOVE_OUT_INSPECTION_STATUS[request.inspection_status] || request.inspection_status}
                      </span>
                    )}
                    {totalPayments > 0 && (
                      <button type="button" className="tenant-card-link" onClick={() => onOpenPayments(tenant)}>
                        ดูการชำระเงิน
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function parsePaymentNote(note) {
  if (!note) return { main: '', tags: [] }
  const tags = []
  const main = note
    .replace(/\(([^()]*)\)/g, (_, inner) => {
      const text = inner.trim()
      if (text) tags.push(text)
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return {
    main,
    tags: tags.map((text) => {
      const actor = /^(แจ้งโดย|บันทึกโดย|รับเงินโดย|ตรวจโดย|อนุมัติโดย)\s*(.*)$/.exec(text)
      if (actor) return { text, label: actor[1], value: actor[2] || '-', icon: 'user', tone: 'info' }
      if (/ไม่ผ่าน|ปฏิเสธ|ค้าง|ยกเลิก/.test(text)) return { text, label: '', value: text, icon: 'alert', tone: 'danger' }
      if (/^รอ/.test(text)) return { text, label: '', value: text, icon: 'clock', tone: 'warning' }
      if (/ชำระแล้ว|อนุมัติ|ผ่าน|สำเร็จ|ครบ/.test(text)) return { text, label: '', value: text, icon: 'check', tone: 'success' }
      return { text, label: '', value: text, icon: 'note', tone: 'muted' }
    }),
  }
}

function PaymentDetail({ payment, roomNumber, onSlip }) {
  const noteParts = parsePaymentNote(payment.note)
  const [slipDownload, setSlipDownload] = useState('idle')
  const downloadSlip = async () => {
    setSlipDownload('busy')
    try {
      await downloadUploadFile(payment.slip_path, `slip-room-${roomNumber}-${payment.id}`)
      setSlipDownload('idle')
    } catch {
      setSlipDownload('failed')
    }
  }
  const statusLabel = PAYMENT_STATUS_LABEL[payment.status] || payment.status
  const facts = [
    { icon: 'user', label: 'ผู้เช่า', value: payment.tenantName },
    { icon: 'door', label: 'ห้อง', value: roomNumber },
    { icon: 'wallet', label: 'ประเภทการชำระ', value: PAYMENT_TYPE_LABEL[payment.type] || payment.type },
    { icon: 'calendar', label: 'วันที่ชำระ', value: formatDate(payment.payment_date) },
    { icon: 'clock', label: 'บันทึกเมื่อ', value: formatDateTime(payment.created_at) },
    { icon: 'receipt', label: 'เลขที่รายการ', value: `#${payment.id}` },
  ]

  return (
    <div className={`payment-detail is-${payment.status}`}>
      <div className="payment-detail-hero">
        <span className="payment-detail-hero-icon"><RoomDetailIcon type="receipt" size={24} /></span>
        <div className="payment-detail-hero-text">
          <span>{PAYMENT_TYPE_LABEL[payment.type] || payment.type}</span>
          <strong>฿{formatCurrency(payment.amount)}</strong>
        </div>
        <span className="payment-detail-status">
          <span aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <dl className="payment-detail-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt><RoomDetailIcon type={fact.icon} size={14} />{fact.label}</dt>
            <dd>{fact.value || '-'}</dd>
          </div>
        ))}
      </dl>

      <section className="payment-detail-section">
        <h4><RoomDetailIcon type="note" size={16} />หมายเหตุ</h4>
        {noteParts.main || noteParts.tags.length > 0 ? (
          <div className="payment-detail-note">
            {noteParts.main && (
              <div className="payment-detail-note-main">
                <span className="payment-detail-note-icon"><RoomDetailIcon type="note" size={16} /></span>
                <p>{noteParts.main}</p>
              </div>
            )}
            {noteParts.tags.length > 0 && (
              <ul className="payment-detail-note-tags">
                {noteParts.tags.map((tag) => (
                  <li key={tag.text} className={`is-${tag.tone}`}>
                    <RoomDetailIcon type={tag.icon} size={13} />
                    {tag.label && <span>{tag.label}</span>}
                    <strong>{tag.value}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="payment-detail-note-empty">
            <RoomDetailIcon type="note" size={18} />
            <span>ไม่มีหมายเหตุสำหรับรายการนี้</span>
          </div>
        )}
      </section>

      <section className="payment-detail-section is-slip">
        <h4><RoomDetailIcon type="receipt" size={16} />สลิปโอนเงิน</h4>
        {payment.slip_path ? (
          <div className="payment-detail-slip">
            <button type="button" className="payment-detail-slip-image" onClick={() => onSlip(payment.tenant, payment)} title="ดูสลิปขนาดเต็ม">
              <UploadImage src={payment.slip_path} alt="สลิปโอนเงิน" />
              <span className="payment-detail-slip-zoom">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
                </svg>
                คลิกเพื่อขยาย
              </span>
            </button>
            <div className="payment-detail-slip-info">
              <span className="payment-detail-slip-badge">
                <RoomDetailIcon type="check" size={13} />
                แนบสลิปแล้ว
              </span>
              <dl className="payment-detail-slip-facts">
                <div>
                  <dt>ยอดโอน</dt>
                  <dd className="is-amount">฿{formatCurrency(payment.amount)}</dd>
                </div>
                <div>
                  <dt>วันที่ชำระ</dt>
                  <dd>{formatDate(payment.payment_date)}</dd>
                </div>
                <div>
                  <dt>ผู้โอน</dt>
                  <dd>{payment.tenantName || '-'}</dd>
                </div>
              </dl>
              <div className="payment-detail-slip-actions">
                <button type="button" className="admin-action-btn is-primary" onClick={() => onSlip(payment.tenant, payment)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                  ดูขนาดเต็ม
                </button>
                <button type="button" className={`admin-action-btn is-ghost${slipDownload === 'failed' ? ' is-failed' : ''}`} onClick={downloadSlip} disabled={slipDownload === 'busy'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                  </svg>
                  {slipDownload === 'busy' ? 'กำลังบันทึก...' : slipDownload === 'failed' ? 'บันทึกไม่สำเร็จ ลองอีกครั้ง' : 'บันทึกรูปสลิป'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="payment-detail-slip-empty">
            <span className="room-history-state-icon"><RoomDetailIcon type="receipt" size={22} /></span>
            <strong>ไม่มีสลิปแนบ</strong>
            <span>รายการนี้ชำระโดยไม่มีการแนบสลิปโอนเงิน</span>
          </div>
        )}
      </section>
    </div>
  )
}

function RoomDetails({ room, detail, loading, error, onEdit, onRetry, onOpenHistory, onSelectPayment, onOpenTenants, onOpenMaintenance }) {
  const [now] = useState(() => Date.now())
  const data = detail?.room ? { ...room, ...detail.room } : room
  const tenant = detail ? detail.tenant : room.customer_id ? { first_name: room.first_name, last_name: room.last_name, phone: room.phone } : null
  const contract = describeContract(data.rental_start_date, data.rental_end_date, now)
  const heroTone = !data.is_booked
    ? 'vacant'
    : contract?.tone === 'danger'
      ? 'overdue'
      : contract?.tone === 'warning'
        ? 'expiring'
        : 'booked'
  const counts = detail?.maintenanceCounts || {}
  const openMaintenance = (counts.pending || 0) + (counts.in_progress || 0)
  const totalMaintenance = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const pastTenants = (detail?.history || []).filter((booking) => !tenant || booking.customer_id !== tenant.id)
  const payments = detail?.payments || []
  const paidTotal = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const pendingPayments = payments.filter((payment) => payment.status !== 'paid').length

  return (
    <div className="room-detail">
      <div className="room-detail-scroll">
        <div className={`room-detail-hero is-${heroTone}`}>
          <div className="room-detail-number">
            <span className="room-detail-number-label">ห้อง</span>
            <strong>{data.room_number}</strong>
            <span className="room-detail-number-floor">ชั้น {String(data.room_number).charAt(0)}</span>
          </div>
          <div className="room-detail-hero-info">
            <span className="room-detail-eyebrow">รายละเอียดห้องพัก</span>
            <div className="room-detail-price">
              <strong>฿{formatCurrency(data.price)}</strong>
              <span>/ เดือน</span>
            </div>
            {data.created_at && <span className="room-detail-hero-meta">เพิ่มเข้าระบบ {formatDate(data.created_at)}</span>}
          </div>
          <span className="room-detail-status">
            <span aria-hidden="true" />
            {ROOM_HERO_STATUS_LABEL[heroTone]}
          </span>
        </div>

        <dl className="room-detail-stats">
          <div>
            <dt><RoomDetailIcon type="wallet" />ค่าเช่า</dt>
            <dd>฿{formatCurrency(data.price)}</dd>
            <small>ต่อเดือน</small>
          </div>
          <div className="is-electric">
            <dt><RoomDetailIcon type="bolt" />ค่าไฟ</dt>
            <dd>฿{formatCurrency(data.electricity_unit_price)}</dd>
            <small>ต่อหน่วย</small>
          </div>
          <div className="is-water">
            <dt><RoomDetailIcon type="drop" />ค่าน้ำ</dt>
            <dd>฿{formatCurrency(data.water_price)}</dd>
            <small>เหมาจ่ายต่อเดือน</small>
          </div>
          <div>
            <dt><RoomDetailIcon type="bed" />เตียง</dt>
            <dd>{data.bed ?? 0}</dd>
            <small>เตียง</small>
          </div>
        </dl>

        <section className="room-detail-section">
          <h4><RoomDetailIcon type="sparkle" size={17} />สิ่งอำนวยความสะดวก</h4>
          <div className="room-detail-amenities">
            {ROOM_AMENITIES.map((amenity) => {
              const available = Boolean(data[amenity.key])
              return (
                <span key={amenity.key} className={available ? 'is-on' : 'is-off'}>
                  <RoomDetailIcon type={available ? 'check' : 'x'} size={13} />
                  {amenity.label}
                </span>
              )
            })}
          </div>
        </section>

        <section className="room-detail-section">
          <h4><RoomDetailIcon type="user" size={17} />ผู้เช่าปัจจุบัน</h4>
          {tenant ? (
            <>
              <div className="room-detail-tenant">
                <span className="room-detail-avatar" aria-hidden="true"><PersonIcon size={20} /></span>
                <div className="room-detail-tenant-name">
                  <strong>{tenant.first_name} {tenant.last_name}</strong>
                  {tenant.phone && (
                    <a href={`tel:${tenant.phone}`}>
                      <RoomDetailIcon type="phone" size={13} />
                      {tenant.phone}
                    </a>
                  )}
                </div>
              </div>
              {detail?.tenant && (
                <dl className="room-detail-facts">
                  <div><dt>อายุ</dt><dd>{tenant.age ? `${tenant.age} ปี` : '-'}</dd></div>
                  <div><dt>เงินมัดจำ</dt><dd>{tenant.deposit_amount != null ? `฿${formatCurrency(tenant.deposit_amount)}` : '-'}</dd></div>
                  <div><dt>ลงทะเบียนเมื่อ</dt><dd>{formatDate(tenant.created_at)}</dd></div>
                </dl>
              )}
            </>
          ) : (
            <div className="room-detail-empty">
              <RoomDetailIcon type="door" size={22} />
              <div>
                <strong>ยังไม่มีผู้เช่า</strong>
                <span>ห้องนี้ว่างและพร้อมให้เช่า</span>
              </div>
            </div>
          )}
        </section>

        <section className="room-detail-section">
          <h4><RoomDetailIcon type="calendar" size={17} />สัญญาเช่า</h4>
          {data.rental_start_date || data.rental_end_date ? (
            <>
              <div className="room-detail-contract-dates">
                <div><span>เริ่มสัญญา</span><strong>{formatDate(data.rental_start_date)}</strong></div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <polyline points="14 6 20 12 14 18" />
                </svg>
                <div><span>สิ้นสุดสัญญา</span><strong>{formatDate(data.rental_end_date)}</strong></div>
              </div>
              {contract && contract.tone !== 'danger' && (
                <div className={`room-detail-progress is-${contract.tone}`}>
                  <div className="room-detail-progress-track">
                    <span style={{ width: `${contract.percent}%` }} />
                  </div>
                  <div className="room-detail-progress-meta">
                    <span>ผ่านไป {Math.round(contract.percent)}%</span>
                    <strong>{contract.label}</strong>
                  </div>
                </div>
              )}
              <dl className="room-detail-facts">
                <div><dt>ระยะสัญญา</dt><dd>{data.rental_duration_months ? `${data.rental_duration_months} เดือน` : '-'}</dd></div>
                <div><dt>ชำระล่วงหน้าถึง</dt><dd>{formatDate(data.prepaid_until)}</dd></div>
                {data.pending_lump_sum_months ? <div><dt>รอชำระก้อน</dt><dd>{data.pending_lump_sum_months} เดือน</dd></div> : null}
              </dl>
            </>
          ) : (
            <p className="room-detail-muted">ยังไม่มีข้อมูลสัญญาเช่า</p>
          )}
        </section>

        {loading ? (
          <div className="room-detail-loading">
            <span className="room-detail-spinner" aria-hidden="true" />
            กำลังโหลดข้อมูลเพิ่มเติม...
          </div>
        ) : error ? (
          <div className="room-detail-error" role="alert">
            <span>{error}</span>
            <button type="button" className="admin-action-btn is-ghost" onClick={onRetry}>ลองใหม่</button>
          </div>
        ) : detail ? (
          <>
            <div className="room-detail-summary">
              <div className={openMaintenance > 0 ? 'is-warning' : ''}>
                <span className="room-detail-summary-icon"><RoomDetailIcon type="wrench" size={18} /></span>
                <div>
                  <strong>{openMaintenance}</strong>
                  <span>แจ้งซ่อมค้าง</span>
                  <small>ทั้งหมด {totalMaintenance} รายการ</small>
                </div>
              </div>
              <div className={detail.parcels.pending > 0 ? 'is-info' : ''}>
                <span className="room-detail-summary-icon"><RoomDetailIcon type="box" size={18} /></span>
                <div>
                  <strong>{detail.parcels.pending}</strong>
                  <span>พัสดุรอรับ</span>
                  <small>ทั้งหมด {detail.parcels.total} ชิ้น</small>
                </div>
              </div>
              <div>
                <span className="room-detail-summary-icon"><RoomDetailIcon type="clipboard" size={18} /></span>
                <div>
                  <strong className="is-text">{detail.lastInspection ? MOVE_OUT_INSPECTION_STATUS[detail.lastInspection.status] || detail.lastInspection.status : 'ไม่มี'}</strong>
                  <span>ตรวจห้องล่าสุด</span>
                  <small>{detail.lastInspection ? formatDate(detail.lastInspection.created_at) : 'ยังไม่เคยตรวจ'}</small>
                </div>
              </div>
            </div>

            {tenant && (
              <RoomDetailSection
                icon="wallet"
                title="การชำระเงินล่าสุด"
                count={detail.payments.length}
                hint={
                  detail.payments.length > 0
                    ? `ชำระแล้ว ฿${formatCurrency(paidTotal)}${pendingPayments > 0 ? ` · รอชำระ ${pendingPayments} รายการ` : ''}`
                    : 'ของผู้เช่าปัจจุบัน'
                }
                action={
                  <button type="button" className="room-detail-section-link" onClick={onOpenHistory}>
                    ดูทั้งหมด
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                }
              >
                {detail.payments.length > 0 ? (
                  <ul className="room-detail-rows">
                    {detail.payments.map((payment) => {
                      const tone = payment.status === 'paid' ? 'is-success' : payment.status === 'overdue' ? 'is-danger' : 'is-warning'
                      const noteParts = parsePaymentNote(payment.note)
                      return (
                        <li
                          key={payment.id}
                          className={`${tone} is-clickable`}
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดการชำระ ฿${formatCurrency(payment.amount)}`}
                          onClick={() => onSelectPayment(payment)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              onSelectPayment(payment)
                            }
                          }}
                        >
                          <RoomDetailDateTile value={payment.payment_date} />
                          <div className="room-detail-row-main">
                            <strong className="room-detail-row-title is-money">฿{formatCurrency(payment.amount)}</strong>
                            <div className="room-detail-row-meta">
                              <span className="room-detail-chip is-type">
                                <RoomDetailIcon type="wallet" size={11} />
                                {PAYMENT_TYPE_LABEL[payment.type] || payment.type}
                              </span>
                              {noteParts.tags
                                .filter((tag) => tag.tone !== 'info')
                                .slice(0, 1)
                                .map((tag) => (
                                  <span key={tag.text} className={`room-detail-chip is-${tag.tone}`}>
                                    <RoomDetailIcon type={tag.icon} size={11} />
                                    {tag.value}
                                  </span>
                                ))}
                            </div>
                            {noteParts.main && (
                              <div className="room-detail-row-note" title={payment.note}>
                                <small className="room-detail-row-note-label">หมายเหตุ</small>
                                <span className="room-detail-row-note-content">
                                  <RoomDetailIcon type="note" size={12} />
                                  <span>{noteParts.main}</span>
                                </span>
                              </div>
                            )}
                          </div>
                          <span className={`admin-badge status-${PAYMENT_BADGE_CLASS[payment.status] || 'pending'}`}>
                            {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                          </span>
                          <span className="room-detail-row-chevron" aria-hidden="true">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <RoomDetailEmptyRow icon="wallet" text="ยังไม่มีประวัติการชำระเงิน" />
                )}
              </RoomDetailSection>
            )}

            <RoomDetailSection
              icon="wrench"
              title="แจ้งซ่อมล่าสุด"
              count={detail.maintenance.length}
              hint={totalMaintenance > 0 ? `ค้างอยู่ ${openMaintenance} จากทั้งหมด ${totalMaintenance} รายการ` : 'ห้องนี้ยังไม่เคยแจ้งซ่อม'}
              action={
                totalMaintenance > 0 && (
                  <button type="button" className="room-detail-section-link" onClick={() => onOpenMaintenance()}>
                    ดูทั้งหมด
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                )
              }
            >
              {detail.maintenance.length > 0 ? (
                <ul className="room-detail-rows">
                  {detail.maintenance.map((request) => {
                    const category = MAINTENANCE_CATEGORY_LABEL[request.category] ? request.category : 'other'
                    return (
                      <li
                        key={request.id}
                        className={`is-maintenance-${request.status} is-clickable`}
                        role="button"
                        tabIndex={0}
                        aria-label={`ดูรายละเอียดแจ้งซ่อม ${MAINTENANCE_CATEGORY_LABEL[category]}`}
                        onClick={() => onOpenMaintenance(request.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onOpenMaintenance(request.id)
                          }
                        }}
                      >
                        <span className={`room-detail-row-icon category-${category}`} aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            {MAINTENANCE_CATEGORY_ICON[category]}
                          </svg>
                        </span>
                        <div className="room-detail-row-main">
                          <strong className="room-detail-row-title">{MAINTENANCE_CATEGORY_LABEL[category]}</strong>
                          {request.description && <p className="room-detail-row-desc">{request.description}</p>}
                          <div className="room-detail-row-meta">
                            <span className="room-detail-meta-item">
                              <RoomDetailIcon type="calendar" size={12} />
                              <em>แจ้ง</em>
                              {formatDate(request.created_at)}
                            </span>
                            {request.completed_at && (
                              <span className="room-detail-meta-item is-success">
                                <RoomDetailIcon type="check" size={12} />
                                <em>เสร็จ</em>
                                {formatDate(request.completed_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`admin-badge status-${request.status}`}>
                          {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
                        </span>
                        <span className="room-detail-row-chevron" aria-hidden="true">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <RoomDetailEmptyRow icon="wrench" text="ไม่มีประวัติการแจ้งซ่อม" />
              )}
            </RoomDetailSection>

            <RoomDetailSection
              icon="history"
              title="ผู้เช่าก่อนหน้า"
              count={pastTenants.length}
              hint={pastTenants.length > 0 ? 'เรียงจากล่าสุดไปเก่าสุด' : 'ยังไม่มีผู้เช่าเก่าในห้องนี้'}
              action={
                (detail.history || []).length > 0 && (
                  <button type="button" className="room-detail-section-link" onClick={() => onOpenTenants()}>
                    ดูทั้งหมด
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                )
              }
            >
              {pastTenants.length > 0 ? (
                <ul className="room-detail-rows">
                  {pastTenants.map((booking) => {
                    const stay = formatStayLength(booking.rental_start_date, booking.rental_end_date)
                    return (
                      <li
                        key={booking.booking_id}
                        className="is-clickable"
                        role="button"
                        tabIndex={0}
                        aria-label={`ดูรายละเอียดผู้เช่า ${booking.first_name} ${booking.last_name}`}
                        onClick={() => onOpenTenants(booking.booking_id)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onOpenTenants(booking.booking_id)
                          }
                        }}
                      >
                        <span className="room-detail-row-avatar" aria-hidden="true"><PersonIcon size={18} /></span>
                        <div className="room-detail-row-main">
                          <strong className="room-detail-row-title">{booking.first_name} {booking.last_name}</strong>
                          <div className="room-detail-row-meta">
                            <span className="room-detail-meta-item">
                              <RoomDetailIcon type="calendar" size={12} />
                              {booking.rental_start_date && booking.rental_end_date ? (
                                `${formatDate(booking.rental_start_date)} – ${formatDate(booking.rental_end_date)}`
                              ) : (
                                <>
                                  <em>ทำสัญญา</em>
                                  {formatDate(booking.created_at)}
                                </>
                              )}
                            </span>
                            {stay && (
                              <span className="room-detail-chip is-stay">
                                <RoomDetailIcon type="clock" size={11} />
                                อยู่ {stay}
                              </span>
                            )}
                          </div>
                        </div>
                        {booking.phone && (
                          <a className="room-detail-row-phone" href={`tel:${booking.phone}`} onClick={(event) => event.stopPropagation()}>
                            <RoomDetailIcon type="phone" size={13} />
                            {booking.phone}
                          </a>
                        )}
                        <span className="room-detail-row-chevron" aria-hidden="true">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <RoomDetailEmptyRow icon="history" text="ไม่มีประวัติผู้เช่าก่อนหน้า" />
              )}
            </RoomDetailSection>
          </>
        ) : null}
      </div>

      <footer className="room-detail-actions">
        <button type="button" className="admin-action-btn is-ghost" onClick={onOpenHistory}>
          <RoomDetailIcon type="wallet" size={15} />
          ประวัติการจ่ายเงิน
        </button>
        <button type="button" className="admin-action-btn is-primary" onClick={onEdit}>
          <RoomDetailIcon type="edit" size={15} />
          แก้ไขข้อมูลห้อง
        </button>
      </footer>
    </div>
  )
}

function RentalPeriodCell({ start, end }) {
  if (!start || !end) return <span className="admin-cell-empty">-</span>
  return (
    <div className="admin-rental-period">
      <span className="admin-rental-date">{formatDate(start)}</span>
      <svg className="admin-rental-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="4" y1="12" x2="20" y2="12" />
        <polyline points="14 6 20 12 14 18" />
      </svg>
      <span className="admin-rental-date">{formatDate(end)}</span>
    </div>
  )
}

const emptyRoomForm = {
  room_number: '',
  price: '',
  bed: '1',
  electricity_unit_price: '8',
  water_price: '100',
  air_conditioner: false,
  wifi: false,
  refrigerator: false,
  bathroom: false,
  cctv: false,
}

const emptyStaffForm = { idcard: '', password: '', phone: '', first_name: '', last_name: '', age: '' }

const emptyCustomerForm = { first_name: '', last_name: '', phone: '', age: '', deposit_amount: '' }

const emptyExpenseForm = { category: '', description: '', amount: '', expense_date: '' }
const emptyWaitingListForm = { full_name: '', phone: '', room_preference: '', note: '', desired_move_in_date: '' }
const INSPECTION_PHOTO_PREVIEW_COUNT = 4
const INSPECTION_GALLERY_PAGE_SIZE = 8
const WAITING_PHONE_PATTERN = /^[0-9+\-\s]{9,20}$/

const RESIDENT_VISIT_TYPE_LABEL = { vehicle: 'รถ / ที่จอดรถ', overnight_guest: 'แจ้งแขกค้างคืน' }

function useAuthHeaders() {
  const token = sessionStorage.getItem('token')
  return useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
}


const SAFETY_INCIDENT_TYPE_LABEL = {
  accident: 'อุบัติเหตุ',
  security: 'ความปลอดภัย',
  fire: 'ไฟไหม้ / ควัน',
  medical: 'เหตุฉุกเฉินทางการแพทย์',
  other: 'อื่น ๆ',
}

const SAFETY_STATUS_INFO = {
  pending: { label: 'รอตรวจสอบ', tone: 'pending' },
  reviewed: { label: 'ตรวจสอบแล้ว', tone: 'reviewed' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'cancelled' },
}
const SAFETY_FILTERS = [
  { key: 'pending', label: 'รอตรวจสอบ' },
  { key: 'reviewed', label: 'ตรวจสอบแล้ว' },
  { key: 'cancelled', label: 'ยกเลิกแล้ว' },
  { key: 'all', label: 'ทั้งหมด' },
]
const SAFETY_ROLE_LABEL = { Customer: 'ผู้เช่า', Staff: 'เจ้าหน้าที่', Admin: 'Admin', Owner: 'Owner' }
const SAFETY_PAGE_SIZE = 9

function formatIncidentTime(value) {
  return value ? `${new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} น.` : '-'
}

function IncidentShieldIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  )
}

const VISIT_STATUS_INFO = {
  pending: { label: 'รออนุมัติ', tone: 'pending' },
  approved: { label: 'อนุมัติแล้ว', tone: 'reviewed' },
  rejected: { label: 'ไม่อนุมัติ', tone: 'rejected' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'cancelled' },
}
const VISIT_FILTERS = [
  { key: 'pending', label: 'รออนุมัติ' },
  { key: 'approved', label: 'อนุมัติแล้ว' },
  { key: 'rejected', label: 'ไม่อนุมัติ' },
  { key: 'cancelled', label: 'ยกเลิกแล้ว' },
  { key: 'all', label: 'ทั้งหมด' },
]
const VISIT_PAGE_SIZE = 9

function VisitCarIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 17h14M6 17l1.5-5.5A2 2 0 0 1 9.4 10h5.2a2 2 0 0 1 1.9 1.5L18 17" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </svg>
  )
}

function getVisitHeading(item) {
  return item.request_type === 'vehicle' ? item.vehicle_plate || 'ไม่ระบุทะเบียน' : item.guest_name || 'ผู้มาพัก'
}

function VisitRange({ item }) {
  return (
    <span className="admin-visit-range">
      <span>{formatIncidentTime(item.start_at)}</span>
      <span className="admin-visit-range-divider" aria-hidden="true">|</span>
      <span className={item.end_at ? undefined : 'is-open'}>{item.end_at ? formatIncidentTime(item.end_at) : 'ไม่จำกัดเวลา'}</span>
    </span>
  )
}

function AdminVehicleRequestsTab({ onCountChange }) {
  const [lightbox, setLightbox] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const headers = useAuthHeaders()

  const load = useCallback(
    () =>
      axios
        .get('/api/admin/resident-visit-requests', { headers })
        .then(({ data }) => {
          const list = data.requests || []
          setItems(list)
          onCountChange?.(list.filter((item) => item.status === 'pending').length)
        })
        .catch((error) => setMessage(error.response?.data?.message || 'โหลดคำขอไม่สำเร็จ'))
        .finally(() => setLoading(false)),
    [headers, onCountChange],
  )

  useEffect(() => {
    load()
  }, [load])

  const keyword = search.trim().toLowerCase()
  const searched = keyword
    ? items.filter((item) =>
        [
          item.vehicle_plate,
          item.vehicle_model,
          item.guest_name,
          item.guest_phone,
          item.note,
          item.room_number ? `ห้อง ${item.room_number}` : '',
          `${item.first_name || ''} ${item.last_name || ''}`,
          item.customer_phone,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      )
    : items
  const countOf = (key) => (key === 'all' ? searched.length : searched.filter((item) => item.status === key).length)
  const filtered = (filter === 'all' ? searched : searched.filter((item) => item.status === filter))
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const totalPages = Math.max(1, Math.ceil(filtered.length / VISIT_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * VISIT_PAGE_SIZE, currentPage * VISIT_PAGE_SIZE)
  const detail = items.find((item) => item.id === detailId) || null

  const openDetail = (item) => {
    setMessage('')
    setDetailId(item.id)
  }

  const review = async (decision, requestClose) => {
    setBusy(true)
    setMessage('')
    try {
      await axios.post(`/api/admin/resident-visit-requests/${detail.id}/${decision}`, {}, { headers })
      await load()
      requestClose()
    } catch (error) {
      setMessage(error.response?.data?.message || 'บันทึกผลไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const openPhotos = (item, index) => setLightbox({ photos: item.vehicle_photos || [], index, title: getVisitHeading(item) })

  return (
    <div className="admin-card admin-review-page">
      <div className="admin-card-header">
        <div>
          <h2>คำขอรถ / ผู้มาพัก</h2>
          <p className="admin-review-subtitle">อนุมัติหรือปฏิเสธคำขอจากผู้เช่า พร้อมดูประวัติคำขอทั้งหมด</p>
        </div>
        <span className="admin-review-count">{countOf('pending')} รายการรออนุมัติ</span>
      </div>

      <div className="admin-incident-toolbar">
        <div className="admin-incident-segments" role="tablist" aria-label="สถานะคำขอ">
          {VISIT_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={`admin-incident-segment is-${item.key === 'approved' ? 'reviewed' : item.key}${filter === item.key ? ' active' : ''}`}
              onClick={() => {
                setFilter(item.key)
                setPage(1)
              }}
            >
              {item.label}
              <span>{countOf(item.key)}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="form-control admin-search-input admin-incident-search"
          placeholder="ค้นหาทะเบียน ห้อง ชื่อผู้เช่า หรือผู้มาพัก"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      </div>

      {message && !detail && <p className="admin-safety-message" role="status">{message}</p>}

      {loading && items.length === 0 ? (
        <p className="admin-safety-empty">กำลังโหลดคำขอ...</p>
      ) : pageItems.length === 0 ? (
        <div className="admin-incident-empty">
          <span aria-hidden="true">
            <VisitCarIcon size={24} />
          </span>
          <strong>{items.length === 0 ? 'ยังไม่มีคำขอ' : 'ไม่พบรายการในหมวดนี้'}</strong>
          <small>{items.length === 0 ? 'เมื่อผู้เช่าส่งคำขอ รายการจะแสดงที่นี่' : 'ลองเปลี่ยนสถานะหรือคำค้นหา'}</small>
        </div>
      ) : (
        <div className="admin-incident-grid">
          {pageItems.map((item) => {
            const status = VISIT_STATUS_INFO[item.status] || VISIT_STATUS_INFO.pending
            const photos = item.vehicle_photos || []
            const isVehicle = item.request_type === 'vehicle'
            return (
              <article key={item.id} className={`admin-incident-card admin-visit-card is-${status.tone}`}>
                <button type="button" className="admin-incident-main" onClick={() => openDetail(item)}>
                  <span className="admin-incident-head">
                    <span className="admin-incident-icon">
                      <VisitCarIcon />
                    </span>
                    <span className="admin-incident-title">
                      <strong>{getVisitHeading(item)}</strong>
                      <small>ส่งคำขอ {formatIncidentTime(item.created_at)}</small>
                    </span>
                    <span className={`admin-incident-status is-${status.tone}`}>{status.label}</span>
                  </span>
                  <span className="admin-incident-info">
                    <span className="admin-incident-cell">
                      <span className="admin-incident-label">ประเภท</span>
                      <span className="admin-incident-value">{RESIDENT_VISIT_TYPE_LABEL[item.request_type] || item.request_type}</span>
                    </span>
                    <span className="admin-incident-cell">
                      <span className="admin-incident-label">ห้อง</span>
                      <span className="admin-incident-value">{item.room_number ? `ห้อง ${item.room_number}` : 'ไม่ระบุ'}</span>
                    </span>
                    <span className="admin-incident-cell is-wide">
                      <span className="admin-incident-label">ผู้ขอ</span>
                      <span className="admin-incident-value">
                        <span className="admin-incident-name">{item.first_name ? `${item.first_name} ${item.last_name}` : 'เจ้าหน้าที่บันทึก'}</span>
                        <span className={`admin-incident-role is-${item.customer_id ? 'customer' : 'staff'}`}>
                          {item.customer_id ? 'ผู้เช่า' : 'เจ้าหน้าที่'}
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="admin-incident-section admin-visit-section">
                    <span className="admin-incident-label">ช่วงเวลา{isVehicle && item.vehicle_model ? ` · ${item.vehicle_model}` : ''}</span>
                    <span className="admin-incident-desc"><VisitRange item={item} /></span>
                  </span>
                </button>
                <div className="admin-incident-photos">
                  <span className="admin-incident-label">{photos.length > 0 ? `รูปรถ · ${photos.length} รูป` : 'รูปรถ'}</span>
                  {photos.length > 0 ? (
                    <span className="admin-incident-photo-row">
                      {photos.slice(0, 4).map((photo, index) => (
                        <button
                          key={`${photo.url}-${index}`}
                          type="button"
                          className="admin-incident-photo"
                          onClick={() => openPhotos(item, index)}
                          aria-label={`ดูรูปที่ ${index + 1}`}
                        >
                          <UploadImage src={photo.url} alt={photo.name || `รูปรถ ${index + 1}`} loading="lazy" />
                          {index === 3 && photos.length > 4 && <span>+{photos.length - 4}</span>}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="admin-incident-photo-empty">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      ไม่มีรูปรถ
                    </span>
                  )}
                </div>
                <div className="admin-incident-foot">
                  <span className="admin-incident-result">
                    {item.status === 'pending' ? (
                      'ยังไม่มีผู้อนุมัติ'
                    ) : item.status === 'cancelled' ? (
                      <>
                        ยกเลิกโดย <span className="admin-actor-inline">{item.cancelled_by_name || item.updated_by_name || '-'}</span>
                      </>
                    ) : (
                      <>
                        {item.status === 'approved' ? 'อนุมัติโดย' : 'ปฏิเสธโดย'}{' '}
                        <span className="admin-actor-inline">{item.reviewed_by_name || item.admin_reviewed_by_name || '-'}</span>
                      </>
                    )}
                  </span>
                  <button type="button" className={`admin-incident-open${item.status === 'pending' ? ' is-primary' : ''}`} onClick={() => openDetail(item)}>
                    {item.status === 'pending' ? 'พิจารณา' : 'ดูรายละเอียด'}
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />

      {detail && (
        <Modal title="รายละเอียดคำขอ" onClose={() => setDetailId(null)}>
          {(requestClose) => {
            const status = VISIT_STATUS_INFO[detail.status] || VISIT_STATUS_INFO.pending
            const photos = detail.vehicle_photos || []
            const isVehicle = detail.request_type === 'vehicle'
            const reviewer = detail.reviewed_by_name || detail.admin_reviewed_by_name
            const reviewedAt = detail.reviewed_at || detail.admin_reviewed_at
            const steps = [
              { label: 'ส่งคำขอ', meta: formatIncidentTime(detail.created_at), by: detail.first_name ? `${detail.first_name} ${detail.last_name}` : null, state: 'done' },
              detail.status === 'pending'
                ? { label: 'รออนุมัติ', meta: 'กำลังรอ', state: 'current' }
                : detail.status === 'rejected'
                  ? { label: 'ไม่อนุมัติ', meta: formatIncidentTime(reviewedAt), by: reviewer, state: 'done', tone: 'danger' }
                  : { label: 'อนุมัติแล้ว', meta: formatIncidentTime(reviewedAt), by: reviewer, state: 'done', tone: 'success' },
              ...(detail.status === 'cancelled'
                ? [{ label: 'ยกเลิกแล้ว', meta: formatIncidentTime(detail.cancelled_at || detail.updated_at), by: detail.cancelled_by_name || detail.updated_by_name, state: 'done', tone: 'danger' }]
                : []),
            ]
            return (
              <div className="admin-incident-detail">
                <div className="admin-incident-scroll">
                  <div className={`admin-incident-hero admin-visit-hero is-${status.tone}`}>
                    <span className="admin-incident-icon is-large">
                      <VisitCarIcon size={22} />
                    </span>
                    <div>
                      <strong>{getVisitHeading(detail)}</strong>
                      <span className="admin-incident-chip">{RESIDENT_VISIT_TYPE_LABEL[detail.request_type] || detail.request_type}</span>
                    </div>
                    <span className={`admin-incident-status is-${status.tone}`}>{status.label}</span>
                  </div>

                  <dl className="admin-incident-fields">
                    <div>
                      <dt>ห้อง</dt>
                      <dd>{detail.room_number ? `ห้อง ${detail.room_number}` : 'ไม่ระบุห้อง'}</dd>
                    </div>
                    <div>
                      <dt>ผู้ขอ</dt>
                      <dd>
                        {detail.first_name ? `${detail.first_name} ${detail.last_name}` : 'เจ้าหน้าที่บันทึก'}
                        {detail.customer_phone ? ` · ${detail.customer_phone}` : ''}
                      </dd>
                    </div>
                    {isVehicle ? (
                      <>
                        <div>
                          <dt>ทะเบียนรถ</dt>
                          <dd>{detail.vehicle_plate || '-'}</dd>
                        </div>
                        <div>
                          <dt>ยี่ห้อ / รุ่น</dt>
                          <dd>{detail.vehicle_model || '-'}</dd>
                        </div>
                      </>
                    ) : null}
                    {(detail.guest_name || !isVehicle) && (
                      <>
                        <div>
                          <dt>ผู้มาพัก</dt>
                          <dd>{detail.guest_name || '-'}</dd>
                        </div>
                        <div>
                          <dt>เบอร์ติดต่อ</dt>
                          <dd>{detail.guest_phone || '-'}</dd>
                        </div>
                      </>
                    )}
                    <div className="is-wide">
                      <dt>ช่วงเวลา</dt>
                      <dd><VisitRange item={detail} /></dd>
                    </div>
                    {detail.note && (
                      <div className="is-wide">
                        <dt>หมายเหตุ</dt>
                        <dd>{detail.note}</dd>
                      </div>
                    )}
                  </dl>

                  {photos.length > 0 && (
                    <section className="admin-incident-gallery">
                      <h4>รูปรถ / ป้ายทะเบียน ({photos.length} รูป)</h4>
                      <div>
                        {photos.map((photo, index) => (
                          <button
                            key={`${photo.url}-${index}`}
                            type="button"
                            className="admin-incident-photo"
                            onClick={() => openPhotos(detail, index)}
                            aria-label={`ดูรูปที่ ${index + 1}`}
                          >
                            <UploadImage src={photo.url} alt={photo.name || `รูปรถ ${index + 1}`} loading="lazy" />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <StepTimeline title="ประวัติการดำเนินการ" steps={steps} actorClassName="admin-actor-inline" />

                  {message && <p className="admin-safety-message" role="status">{message}</p>}
                </div>

                <div className="admin-incident-actions">
                  {detail.status === 'pending' && (
                    <>
                      <button type="button" className="admin-action-btn is-danger" disabled={busy} onClick={() => review('reject', requestClose)}>
                        ไม่อนุมัติ
                      </button>
                      <button type="button" className="admin-action-btn is-primary" disabled={busy} onClick={() => review('approve', requestClose)}>
                        {busy ? 'กำลังบันทึก...' : 'อนุมัติ'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos.map((photo, index) => ({ name: photo.name || `รูปที่ ${index + 1}`, url: photo.url }))}
          initialIndex={lightbox.index}
          title={lightbox.title}
          label="รูปรถ / ป้ายทะเบียน"
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

function AdminSafetyIncidentsTab({ onCountChange }) {
  const [lightbox, setLightbox] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const headers = useAuthHeaders()

  const load = useCallback(
    () =>
      axios
        .get('/api/admin/safety-incidents', { headers })
        .then(({ data }) => {
          const list = data.incidents || []
          setIncidents(list)
          onCountChange?.(list.filter((item) => item.status === 'pending').length)
        })
        .catch((error) => setMessage(error.response?.data?.message || 'โหลดรายงานเหตุไม่สำเร็จ'))
        .finally(() => setLoading(false)),
    [headers, onCountChange],
  )

  useEffect(() => {
    load()
  }, [load])

  const keyword = search.trim().toLowerCase()
  const searched = keyword
    ? incidents.filter((item) =>
        [
          SAFETY_INCIDENT_TYPE_LABEL[item.incident_type] || item.incident_type,
          item.description,
          item.reporter_name,
          item.room_number ? `ห้อง ${item.room_number}` : '',
          item.review_note,
          item.cancel_reason,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      )
    : incidents
  const countOf = (key) => (key === 'all' ? searched.length : searched.filter((item) => item.status === key).length)
  const filtered = (filter === 'all' ? searched : searched.filter((item) => item.status === filter))
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const totalPages = Math.max(1, Math.ceil(filtered.length / SAFETY_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * SAFETY_PAGE_SIZE, currentPage * SAFETY_PAGE_SIZE)
  const detail = incidents.find((item) => item.id === detailId) || null

  const openDetail = (item) => {
    setNote('')
    setMessage('')
    setDetailId(item.id)
  }

  const markReviewed = async (requestClose) => {
    setBusy(true)
    setMessage('')
    try {
      await axios.patch(`/api/admin/safety-incidents/${detail.id}/review`, { reviewNote: note }, { headers })
      await load()
      requestClose()
    } catch (error) {
      setMessage(error.response?.data?.message || 'บันทึกผลไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const openPhotos = (item, index) =>
    setLightbox({ photos: item.photos, index, title: SAFETY_INCIDENT_TYPE_LABEL[item.incident_type] || item.incident_type })

  return (
    <div className="admin-card admin-review-page">
      <div className="admin-card-header">
        <div>
          <h2>ตรวจสอบเหตุฉุกเฉิน</h2>
          <p className="admin-review-subtitle">รายงานจากผู้พักอาศัยและเจ้าหน้าที่ พร้อมประวัติการตรวจสอบทั้งหมด</p>
        </div>
        <span className="admin-review-count">{countOf('pending')} รายการรอตรวจสอบ</span>
      </div>

      <div className="admin-incident-toolbar">
        <div className="admin-incident-segments" role="tablist" aria-label="สถานะรายงาน">
          {SAFETY_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              className={`admin-incident-segment is-${item.key}${filter === item.key ? ' active' : ''}`}
              onClick={() => {
                setFilter(item.key)
                setPage(1)
              }}
            >
              {item.label}
              <span>{countOf(item.key)}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="form-control admin-search-input admin-incident-search"
          placeholder="ค้นหาประเภทเหตุ ห้อง ผู้แจ้ง หรือรายละเอียด"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      </div>

      {message && !detail && <p className="admin-safety-message" role="status">{message}</p>}

      {loading && incidents.length === 0 ? (
        <p className="admin-safety-empty">กำลังโหลดรายงาน...</p>
      ) : pageItems.length === 0 ? (
        <div className="admin-incident-empty">
          <span aria-hidden="true">
            <IncidentShieldIcon size={24} />
          </span>
          <strong>{incidents.length === 0 ? 'ยังไม่มีรายงานเหตุ' : 'ไม่พบรายการในหมวดนี้'}</strong>
          <small>{incidents.length === 0 ? 'เมื่อมีการแจ้งเหตุ รายการจะแสดงที่นี่' : 'ลองเปลี่ยนสถานะหรือคำค้นหา'}</small>
        </div>
      ) : (
        <div className="admin-incident-grid">
          {pageItems.map((item) => {
            const status = SAFETY_STATUS_INFO[item.status] || SAFETY_STATUS_INFO.pending
            const typeLabel = SAFETY_INCIDENT_TYPE_LABEL[item.incident_type] || item.incident_type
            const photos = item.photos || []
            return (
              <article key={item.id} className={`admin-incident-card is-${status.tone} is-${item.severity}`}>
                <button type="button" className="admin-incident-main" onClick={() => openDetail(item)}>
                  <span className="admin-incident-head">
                    <span className="admin-incident-icon">
                      <IncidentShieldIcon />
                    </span>
                    <span className="admin-incident-title">
                      <strong>{typeLabel}</strong>
                      <small>{formatIncidentTime(item.created_at)}</small>
                    </span>
                    <span className={`admin-incident-status is-${status.tone}`}>{status.label}</span>
                  </span>
                  <span className="admin-incident-info">
                    <span className="admin-incident-cell">
                      <span className="admin-incident-label">ระดับ</span>
                      <span className={`admin-incident-level is-${item.severity}`}>
                        <span aria-hidden="true" />
                        {item.severity === 'urgent' ? 'ด่วน' : 'ทั่วไป'}
                      </span>
                    </span>
                    <span className="admin-incident-cell">
                      <span className="admin-incident-label">ห้อง</span>
                      <span className="admin-incident-value">{item.room_number ? `ห้อง ${item.room_number}` : 'ไม่ระบุ'}</span>
                    </span>
                    <span className="admin-incident-cell is-wide">
                      <span className="admin-incident-label">ผู้แจ้ง</span>
                      <span className="admin-incident-value">
                        <span className="admin-incident-name">{item.reporter_name}</span>
                        <span className={`admin-incident-role is-${String(item.reporter_role || '').toLowerCase()}`}>
                          {SAFETY_ROLE_LABEL[item.reporter_role] || item.reporter_role}
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="admin-incident-section">
                    <span className="admin-incident-label">รายละเอียดเหตุการณ์</span>
                    <span className="admin-incident-desc">{item.description}</span>
                  </span>
                </button>
                {photos.length === 0 && (
                  <div className="admin-incident-photos">
                    <span className="admin-incident-label">รูปประกอบ</span>
                    <span className="admin-incident-photo-empty">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      ไม่มีรูปประกอบ
                    </span>
                  </div>
                )}
                {photos.length > 0 && (
                  <div className="admin-incident-photos">
                    <span className="admin-incident-label">รูปประกอบ · {photos.length} รูป</span>
                    <span className="admin-incident-photo-row">
                    {photos.slice(0, 4).map((photo, index) => (
                      <button
                        key={`${photo.url}-${index}`}
                        type="button"
                        className="admin-incident-photo"
                        onClick={() => openPhotos(item, index)}
                        aria-label={`ดูรูปที่ ${index + 1}`}
                      >
                        <UploadImage src={photo.url} alt={photo.name || `รูปประกอบ ${index + 1}`} loading="lazy" />
                        {index === 3 && photos.length > 4 && <span>+{photos.length - 4}</span>}
                      </button>
                    ))}
                    </span>
                  </div>
                )}
                <div className="admin-incident-foot">
                  <span className="admin-incident-result">
                    {item.status === 'reviewed' ? (
                      <>
                        ตรวจโดย <span className="admin-actor-inline">{item.reviewed_by_name || '-'}</span>
                      </>
                    ) : item.status === 'cancelled' ? (
                      <>
                        ยกเลิกโดย <span className="admin-actor-inline">{item.cancelled_by_name || '-'}</span>
                      </>
                    ) : (
                      'ยังไม่มีผู้ตรวจสอบ'
                    )}
                  </span>
                  <button type="button" className={`admin-incident-open${item.status === 'pending' ? ' is-primary' : ''}`} onClick={() => openDetail(item)}>
                    {item.status === 'pending' ? 'ตรวจสอบ' : 'ดูรายละเอียด'}
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />

      {detail && (
        <Modal title="รายละเอียดการแจ้งเหตุ" onClose={() => setDetailId(null)}>
          {(requestClose) => {
            const status = SAFETY_STATUS_INFO[detail.status] || SAFETY_STATUS_INFO.pending
            const typeLabel = SAFETY_INCIDENT_TYPE_LABEL[detail.incident_type] || detail.incident_type
            const photos = detail.photos || []
            const steps = [
              { label: 'แจ้งเหตุ', meta: formatIncidentTime(detail.created_at), by: detail.reporter_name, state: 'done' },
              detail.status === 'reviewed'
                ? { label: 'ตรวจสอบแล้ว', meta: formatIncidentTime(detail.reviewed_at), by: detail.reviewed_by_name, note: detail.review_note, state: 'done', tone: 'success' }
                : detail.status === 'cancelled'
                  ? { label: 'ยกเลิกแล้ว', meta: formatIncidentTime(detail.cancelled_at), by: detail.cancelled_by_name, note: detail.cancel_reason, state: 'done', tone: 'danger' }
                  : { label: 'รอตรวจสอบ', meta: 'กำลังรอ', state: 'current' },
            ]
            return (
              <div className="admin-incident-detail">
                <div className="admin-incident-scroll">
                <div className={`admin-incident-hero is-${status.tone} is-${detail.severity}`}>
                  <span className="admin-incident-icon is-large">
                    <IncidentShieldIcon size={22} />
                  </span>
                  <div>
                    <strong>{typeLabel}</strong>
                    <span className={`admin-incident-level is-${detail.severity}`}>
                      <span aria-hidden="true" />
                      ระดับ{detail.severity === 'urgent' ? 'ด่วน' : 'ทั่วไป'}
                    </span>
                  </div>
                  <span className={`admin-incident-status is-${status.tone}`}>{status.label}</span>
                </div>

                <dl className="admin-incident-fields">
                  <div>
                    <dt>ห้อง</dt>
                    <dd>{detail.room_number ? `ห้อง ${detail.room_number}` : 'ไม่ระบุห้อง'}</dd>
                  </div>
                  <div>
                    <dt>วันที่แจ้ง</dt>
                    <dd>{formatIncidentTime(detail.created_at)}</dd>
                  </div>
                  <div>
                    <dt>ผู้แจ้ง</dt>
                    <dd>{detail.reporter_name}</dd>
                  </div>
                  <div>
                    <dt>สถานะผู้แจ้ง</dt>
                    <dd>
                      <span className={`admin-incident-role is-${String(detail.reporter_role || '').toLowerCase()}`}>
                        {SAFETY_ROLE_LABEL[detail.reporter_role] || detail.reporter_role}
                      </span>
                    </dd>
                  </div>
                  <div className="is-wide">
                    <dt>รายละเอียดเหตุการณ์</dt>
                    <dd>{detail.description}</dd>
                  </div>
                </dl>

                {photos.length > 0 && (
                  <section className="admin-incident-gallery">
                    <h4>รูปประกอบ ({photos.length} รูป)</h4>
                    <div>
                      {photos.map((photo, index) => (
                        <button
                          key={`${photo.url}-${index}`}
                          type="button"
                          className="admin-incident-photo"
                          onClick={() => openPhotos(detail, index)}
                          aria-label={`ดูรูปที่ ${index + 1}`}
                        >
                          <UploadImage src={photo.url} alt={photo.name || `รูปประกอบ ${index + 1}`} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <StepTimeline title="ประวัติการดำเนินการ" steps={steps} actorClassName="admin-actor-inline" />

                {detail.status === 'pending' && (
                  <section className="admin-incident-review">
                    <label htmlFor="admin-incident-note">บันทึกผลหรือการดำเนินการ (ถ้ามี)</label>
                    <textarea
                      id="admin-incident-note"
                      rows={3}
                      maxLength={500}
                      placeholder="เช่น ตรวจสอบพื้นที่แล้ว แจ้งผู้เกี่ยวข้องเรียบร้อย"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <small>{note.length}/500 · ผู้แจ้งจะเห็นผลการตรวจสอบนี้</small>
                  </section>
                )}

                {message && <p className="admin-safety-message" role="status">{message}</p>}
                </div>

                <div className="admin-incident-actions">
                  {detail.status === 'pending' && (
                    <button type="button" className="admin-action-btn is-primary" disabled={busy} onClick={() => markReviewed(requestClose)}>
                      {busy ? 'กำลังบันทึก...' : 'บันทึกว่าตรวจสอบแล้ว'}
                    </button>
                  )}
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos.map((photo, index) => ({ name: photo.name || `รูปที่ ${index + 1}`, url: photo.url }))}
          initialIndex={lightbox.index}
          title={lightbox.title}
          label="รูปประกอบการแจ้งเหตุ"
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

function AdminBackupPage() {
  const navigate = useNavigate()
  const [adminUser, setAdminUser] = useState(null)
  const [activeTab, setActiveTab] = useState('rooms')
  const [lastTabByGroup, setLastTabByGroup] = useState({})
  const [pendingVehicleCount, setPendingVehicleCount] = useState(0)
  const [pendingSafetyCount, setPendingSafetyCount] = useState(0)
  const tabBadges = { 'vehicle-requests': pendingVehicleCount, safety: pendingSafetyCount }

  useEffect(() => {
    let cancelled = false
    const loadReviewCounts = () => {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}` }
      axios
        .get('/api/admin/resident-visit-requests', { headers })
        .then(({ data }) => {
          if (!cancelled) setPendingVehicleCount((data.requests || []).filter((item) => item.status === 'pending').length)
        })
        .catch(() => {})
      axios
        .get('/api/admin/safety-incidents', { headers })
        .then(({ data }) => {
          if (!cancelled) setPendingSafetyCount((data.incidents || []).filter((item) => item.status === 'pending').length)
        })
        .catch(() => {})
    }
    loadReviewCounts()
    const interval = setInterval(loadReviewCounts, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])
  const [announcementFocus, setAnnouncementFocus] = useState(null)
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [waitingList, setWaitingList] = useState([])
  const [parcels, setParcels] = useState([])
  const [parcelsLoading, setParcelsLoading] = useState(true)
  const [parcelsError, setParcelsError] = useState('')
  const [parcelForm, setParcelForm] = useState({
    room_number: '',
    sender_name: '',
    tracking_number: '',
    description: '',
  })
  const [parcelPhotos, setParcelPhotos] = useState([])
  const [parcelPhotoError, setParcelPhotoError] = useState('')
  const [parcelFormError, setParcelFormError] = useState('')
  const [parcelSubmitting, setParcelSubmitting] = useState(false)
  const [parcelSaveConfirm, setParcelSaveConfirm] = useState(false)
  const [parcelFormOpen, setParcelFormOpen] = useState(false)
  const [parcelPhotoPreview, setParcelPhotoPreview] = useState(null)
  const [parcelSearch, setParcelSearch] = useState('')
  const [parcelStatusFilter, setParcelStatusFilter] = useState('all')
  const [parcelPage, setParcelPage] = useState(1)
  const [moveOutInspections, setMoveOutInspections] = useState([])
  const [inspectionKind, setInspectionKind] = useState('all')
  const [inspectionSearch, setInspectionSearch] = useState('')
  const [inspectionResultFilter, setInspectionResultFilter] = useState('all')
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState('all')
  const [announcements, setAnnouncements] = useState([])
  const [inspectionDetail, setInspectionDetail] = useState(null)
  const [inspectionEditor, setInspectionEditor] = useState(null)
  const [inspectionEditLoadingId, setInspectionEditLoadingId] = useState(null)
  const [inspectionConfirm, setInspectionConfirm] = useState(null)
  const [inspectionConfirmBusy, setInspectionConfirmBusy] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoGalleryPage, setPhotoGalleryPage] = useState(null)
  const [slipPreview, setSlipPreview] = useState(null)
  const [waitingListModal, setWaitingListModal] = useState(null)
  const [waitingListDetail, setWaitingListDetail] = useState(null)
  const [waitingListDelete, setWaitingListDelete] = useState(null)
  const [waitingListDeleting, setWaitingListDeleting] = useState(false)
  const [waitingListDeleteError, setWaitingListDeleteError] = useState('')
  const [waitingListStatusBusyId, setWaitingListStatusBusyId] = useState(null)
  const [waitingListActionError, setWaitingListActionError] = useState('')
  const [waitingNow] = useState(() => Date.now())
  const [waitingListForm, setWaitingListForm] = useState(emptyWaitingListForm)
  const [waitingListFormError, setWaitingListFormError] = useState('')
  const [waitingListFieldErrors, setWaitingListFieldErrors] = useState({})
  const [waitingListSubmitting, setWaitingListSubmitting] = useState(false)

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifClosing, setNotifClosing] = useState(false)
  const [seenNotificationKeys, setSeenNotificationKeys] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(getNotificationStorageKey('admin')) || '[]')
      return Array.isArray(stored) ? stored : []
    } catch {
      return []
    }
  })
  const [notifPage, setNotifPage] = useState(1)
  const [freshNotifKeys, setFreshNotifKeys] = useState(() => new Set())
  const notifListRef = useRef(null)
  const notifTargetRef = useRef(null)
  const [notifTargetReady, setNotifTargetReady] = useState(0)
  const [notifTenantItems, setNotifTenantItems] = useState([])
  const [notifMaintenanceItems, setNotifMaintenanceItems] = useState([])
  const notifRef = useRef(null)

  const closeNotifPanel = () => setNotifClosing(true)

  useEffect(() => {
    if (!notifOpen) return
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        closeNotifPanel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen])

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })


  const handleUnauthorized = (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      navigate('/login', { replace: true })
      return true
    }
    return false
  }

  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [roomsPage, setRoomsPage] = useState(1)
  const [roomModal, setRoomModal] = useState(null)
  const [roomForm, setRoomForm] = useState(emptyRoomForm)
  const [roomSubmitting, setRoomSubmitting] = useState(false)
  const [roomFormError, setRoomFormError] = useState('')
  const [roomDeleteConfirm, setRoomDeleteConfirm] = useState(null)
  const [roomDetail, setRoomDetail] = useState(null)
  const [roomHistory, setRoomHistory] = useState(null)
  const [paymentDetail, setPaymentDetail] = useState(null)
  const [roomTenants, setRoomTenants] = useState(null)
  const [roomMaintenance, setRoomMaintenance] = useState(null)
  const [maintenanceDetail, setMaintenanceDetail] = useState(null)
  const [invoiceGenerating, setInvoiceGenerating] = useState(false)
  const [invoicePrintError, setInvoicePrintError] = useState('')

  const [expenses, setExpenses] = useState([])
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [expensesError, setExpensesError] = useState('')
  const [expensesPage, setExpensesPage] = useState(1)
  const [expensesTotalPages, setExpensesTotalPages] = useState(1)
  const [expenseModal, setExpenseModal] = useState(null)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)
  const [expenseFormError, setExpenseFormError] = useState('')

  const loadExpenses = (page = 1) => {
    setExpensesLoading(true)
    return axios
      .get('/api/admin/expenses', { headers: authHeaders(), params: { page } })
      .then(({ data }) => {
        setExpenses(data.expenses)
        setExpensesPage(data.page)
        setExpensesTotalPages(Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 20))))
        setExpensesError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setExpensesError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลรายจ่ายได้')
      })
      .finally(() => setExpensesLoading(false))
  }

  const openCreateExpense = () => {
    setExpenseForm({ ...emptyExpenseForm, expense_date: getTodayInputDate() })
    setExpenseFormError('')
    setExpenseModal({ mode: 'create' })
  }

  const openEditExpense = (expense) => {
    setExpenseForm({
      category: expense.category || '',
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      expense_date: (expense.expense_date || '').slice(0, 10),
    })
    setExpenseFormError('')
    setExpenseModal({ mode: 'edit', expense })
  }

  const previewSource = slipPreview
    ? {
        title: slipPreview.title || 'สลิปโอนเงิน',
        subtitle: slipPreview.subtitle,
        label: slipPreview.label || 'สลิปโอนเงิน',
        photos: slipPreview.photos || [{ name: slipPreview.name, url: slipPreview.url }],
      }
    : inspectionDetail
      ? {
          title: `ผลตรวจห้อง ${inspectionDetail.room_number}`,
          subtitle: inspectionDetail.tenant_name,
          label: `ภาพตรวจห้อง ${inspectionDetail.room_number}`,
          photos: inspectionDetail.photos || [],
        }
      : parcelPhotoPreview
        ? {
            title: `พัสดุห้อง ${parcelPhotoPreview.room_number}`,
            subtitle: `${parcelPhotoPreview.first_name || ''} ${parcelPhotoPreview.last_name || ''}`.trim(),
            label: 'รูปพัสดุ',
            photos: parcelPhotoPreview.photos || [],
          }
    : null
  const previewPhotos = previewSource?.photos || []
  const photoPreviewCount = previewPhotos.length

  const openMaintenancePhotos = (request, index = 0) => {
    setSlipPreview({
      title: `รูปแจ้งซ่อม ห้อง ${request.room_number}`,
      label: 'รูปแจ้งซ่อม',
      subtitle: `${request.first_name || ''} ${request.last_name || ''}`.trim() || MAINTENANCE_CATEGORY_LABEL[request.category] || '',
      photos: request.photos || [],
    })
    setPhotoPreview(index)
  }

  const openSlipPreview = (customer, payment) => {
    setSlipPreview({
      url: payment.slip_path,
      name: `สลิปโอนเงิน ${formatDate(payment.payment_date)}`,
      subtitle: `${[customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || payment.tenantName || '-'} · ฿${formatCurrency(payment.amount)} · ${PAYMENT_TYPE_LABEL[payment.type] || payment.type}`,
    })
    setPhotoPreview(0)
  }

  const renderInspectionPhoto = (photo, index) => (
    <button type="button" key={`${photo.name}-${index}`} onClick={() => showPhoto(index)} aria-label={`ดูภาพ ${photo.name}`}>
      <UploadImage src={photo.url} alt={`ภาพตรวจห้อง ${inspectionDetail.room_number} ${index + 1}`} />
      <span>{photo.name}</span>
    </button>
  )

  const galleryTotalPages = Math.max(1, Math.ceil(photoPreviewCount / INSPECTION_GALLERY_PAGE_SIZE))
  const galleryPage = Math.min(photoGalleryPage || 1, galleryTotalPages)
  const galleryStart = (galleryPage - 1) * INSPECTION_GALLERY_PAGE_SIZE

  const showPhoto = (index) => setPhotoPreview(index)

  const openWaitingListForm = (entry = null) => {
    setWaitingListForm(entry ? {
      full_name: entry.full_name || '',
      phone: entry.phone || '',
      room_preference: entry.room_preference || '',
      note: entry.note || '',
      desired_move_in_date: entry.desired_move_in_date || '',
    } : emptyWaitingListForm)
    setWaitingListFormError('')
    setWaitingListFieldErrors({})
    setWaitingListModal(entry ? { mode: 'edit', entry } : { mode: 'create' })
  }

  const updateWaitingListField = (field, value) => {
    setWaitingListForm((form) => ({ ...form, [field]: value }))
    setWaitingListFieldErrors((errors) => ({ ...errors, [field]: undefined }))
  }

  const loadWaitingList = () => {
    return axios
      .get('/api/admin/waiting-list', { headers: authHeaders() })
      .then(({ data }) => setWaitingList(data.waitingList || []))
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setPageError(err.response?.data?.message || 'โหลดรายชื่อคนรอห้องว่างไม่สำเร็จ')
      })
  }

  const loadParcels = useCallback(() => {
    return axios
      .get('/api/admin/parcels', {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      .then(({ data }) => {
        setParcels(data.parcels || [])
        setParcelsError('')
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setParcelsError(err.response?.data?.message || 'โหลดรายการพัสดุไม่สำเร็จ')
      })
      .finally(() => setParcelsLoading(false))
  }, [navigate])

  const requestParcelSave = (event) => {
    event.preventDefault()
    setParcelFormError('')
    if (parcelPhotos.length === 0) {
      setParcelPhotoError('กรุณาแนบรูปพัสดุอย่างน้อย 1 รูปก่อนบันทึก')
      return
    }
    setParcelSaveConfirm(true)
  }

  const handleCreateParcel = async (requestClose) => {
    setParcelSubmitting(true)
    setParcelFormError('')
    try {
      const payload = new FormData()
      Object.entries(parcelForm).forEach(([key, value]) => payload.append(key, value))
      parcelPhotos.forEach((photo) => payload.append('photos', photo))
      const { data } = await axios.post('/api/admin/parcels', payload, { headers: authHeaders() })
      requestClose()
      setParcelFormOpen(false)
      setSuccessMessage(data.message || 'บันทึกพัสดุเข้าห้องสำเร็จ')
      setParcelForm({ room_number: '', sender_name: '', tracking_number: '', description: '' })
      setParcelPhotos([])
      setParcelPhotoError('')
      await loadParcels()
    } catch (err) {
      if (handleUnauthorized(err)) return
      requestClose()
      setParcelFormError(err.response?.data?.message || 'บันทึกพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setParcelSubmitting(false)
    }
  }

  const loadMoveOutInspections = () => {
    return axios
      .get('/api/admin/move-out-inspections', { headers: authHeaders() })
      .then(({ data }) => setMoveOutInspections(data.inspections))
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setPageError(err.response?.data?.message || 'โหลดผลตรวจห้องย้ายออกไม่สำเร็จ')
      })
  }

  const loadAnnouncements = () => {
    return axios
      .get('/api/admin/announcements', { headers: authHeaders() })
      .then(({ data }) => setAnnouncements(data.announcements))
      .catch((err) => handleUnauthorized(err))
  }

  useEffect(() => {
    const now = Date.now()
    const upcoming = announcements
      .map((item) => (item.expires_epoch ? item.expires_epoch * 1000 - now : Number.NaN))
      .filter((wait) => Number.isFinite(wait) && wait > 0)
    if (upcoming.length === 0) return undefined
    const timer = setTimeout(loadAnnouncements, Math.min(Math.min(...upcoming) + 1000, 2147483647))
    return () => clearTimeout(timer)
  }, [announcements])

  const submitWaitingListForm = async (event, requestClose) => {
    event.preventDefault()
    const fullName = waitingListForm.full_name.trim()
    const phone = waitingListForm.phone.trim()
    const fieldErrors = {}
    if (!fullName) fieldErrors.full_name = 'กรุณาระบุชื่อผู้สนใจ'
    if (!phone) fieldErrors.phone = 'กรุณาระบุเบอร์โทรศัพท์'
    else if (!WAITING_PHONE_PATTERN.test(phone)) fieldErrors.phone = 'เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9-20 หลัก)'
    setWaitingListFieldErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      setWaitingListFormError('')
      return
    }
    const payload = {
      full_name: fullName,
      phone,
      room_preference: waitingListForm.room_preference.trim(),
      note: waitingListForm.note.trim(),
      desired_move_in_date: waitingListForm.desired_move_in_date || '',
    }
    setWaitingListSubmitting(true)
    try {
      const { data } =
        waitingListModal.mode === 'create'
          ? await axios.post('/api/admin/waiting-list', payload, { headers: authHeaders() })
          : await axios.patch(`/api/admin/waiting-list/${waitingListModal.entry.id}`, payload, { headers: authHeaders() })
      setWaitingListFormError('')
      setSuccessMessage(data.message)
      requestClose()
      await loadWaitingList()
    } catch (err) {
      if (handleUnauthorized(err)) return
      setWaitingListFormError(err.response?.data?.message || 'บันทึกรายชื่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setWaitingListSubmitting(false)
    }
  }

  const setWaitingListEntryStatus = async (entry, status) => {
    if (waitingListStatusBusyId != null) return
    setWaitingListStatusBusyId(entry.id)
    setWaitingListActionError('')
    try {
      await axios.patch('/api/admin/waiting-list/' + entry.id, { status }, { headers: authHeaders() })
      await loadWaitingList()
    } catch (err) {
      if (handleUnauthorized(err)) return
      const message = err.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ'
      setWaitingListActionError(message)
      setPageError(message)
    } finally {
      setWaitingListStatusBusyId(null)
    }
  }

  const removeWaitingListEntry = async (requestClose) => {
    if (!waitingListDelete || waitingListDeleting) return
    setWaitingListDeleting(true)
    setWaitingListDeleteError('')
    try {
      const { data } = await axios.delete('/api/admin/waiting-list/' + waitingListDelete.id, { headers: authHeaders() })
      setSuccessMessage(data.message)
      requestClose()
      if (waitingListDetail?.id === waitingListDelete.id) setWaitingListDetail(null)
      await loadWaitingList()
    } catch (err) {
      if (handleUnauthorized(err)) return
      setWaitingListDeleteError(err.response?.data?.message || 'ลบรายการไม่สำเร็จ')
    } finally {
      setWaitingListDeleting(false)
    }
  }

  const openCreateInspection = () => {
    setInspectionEditor({ mode: 'create', initial: null, candidates: [], candidatesLoading: true, submitting: false, error: '' })
    axios
      .get('/api/admin/move-out-inspections/move-room-candidates', { headers: authHeaders() })
      .then(({ data }) => {
        setInspectionEditor((prev) => (prev?.mode === 'create' ? { ...prev, candidates: data.requests || [], candidatesLoading: false } : prev))
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setInspectionEditor((prev) =>
          prev?.mode === 'create'
            ? { ...prev, candidatesLoading: false, error: err.response?.data?.message || 'ไม่สามารถโหลดคำขอย้ายห้องได้' }
            : prev,
        )
      })
  }

  const openEditInspectionForm = (inspection) => {
    setInspectionDetail(null)
    setPhotoPreview(null)
    setPhotoGalleryPage(null)
    setInspectionEditor({ mode: 'edit', initial: inspection, candidates: [], candidatesLoading: false, submitting: false, error: '' })
  }

  const openEditInspectionFromRow = async (inspection) => {
    setInspectionEditLoadingId(inspection.id)
    try {
      const { data } = await axios.get(`/api/admin/move-out-inspections/${inspection.id}`, { headers: authHeaders() })
      openEditInspectionForm(data.inspection)
    } catch (err) {
      if (handleUnauthorized(err)) return
      setPageError(err.response?.data?.message || 'ไม่สามารถโหลดผลตรวจห้องได้')
    } finally {
      setInspectionEditLoadingId(null)
    }
  }

  const submitInspectionEditor = async (payload, requestClose) => {
    if (!inspectionEditor) return
    setInspectionEditor((prev) => ({ ...prev, submitting: true, error: '' }))
    try {
      const { data } =
        inspectionEditor.mode === 'create'
          ? await axios.post('/api/admin/move-out-inspections', payload, { headers: authHeaders() })
          : await axios.put(`/api/admin/move-out-inspections/${inspectionEditor.initial.id}`, payload, { headers: authHeaders() })
      setSuccessMessage(data.message || 'บันทึกผลตรวจห้องสำเร็จ')
      requestClose()
      await loadMoveOutInspections()
    } catch (err) {
      if (handleUnauthorized(err)) return
      setInspectionEditor((prev) =>
        prev ? { ...prev, submitting: false, error: err.response?.data?.message || 'บันทึกผลตรวจไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' } : prev,
      )
    }
  }

  const openInspectionDetail = async (inspection) => {
    try {
      const { data } = await axios.get(`/api/admin/move-out-inspections/${inspection.id}`, { headers: authHeaders() })
      setInspectionDetail(data.inspection)
    } catch (err) {
      if (handleUnauthorized(err)) return
      setPageError(err.response?.data?.message || 'โหลดรายละเอียดผลตรวจไม่สำเร็จ')
    }
  }

  const setMoveOutInspectionStatus = async (inspection, status) => {
    try {
      await axios.patch(`/api/admin/move-out-inspections/${inspection.id}`, { status }, { headers: authHeaders() })
      setInspectionDetail((current) => (current?.id === inspection.id ? { ...current, status } : current))
      await loadMoveOutInspections()
    } catch (err) {
      if (handleUnauthorized(err)) return
      setPageError(err.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ')
    }
  }

  const removeMoveOutInspection = (inspection) => {
    setInspectionConfirm({ kind: 'delete', inspection })
  }

  const deleteMoveOutInspection = async (inspection) => {
    try {
      const { data } = await axios.delete(`/api/admin/move-out-inspections/${inspection.id}`, { headers: authHeaders() })
      setSuccessMessage(data.message)
      setInspectionDetail(null)
      await loadMoveOutInspections()
    } catch (err) {
      if (handleUnauthorized(err)) return
      setPageError(err.response?.data?.message || 'ลบผลตรวจไม่สำเร็จ')
    }
  }

  const removeExpense = async (expense) => {
    if (!window.confirm(`ลบรายจ่าย "${expense.category}" ฿${Number(expense.amount).toLocaleString('th-TH')} หรือไม่?`)) return
    try {
      const { data } = await axios.delete(`/api/admin/expenses/${expense.id}`, { headers: authHeaders() })
      setSuccessMessage(data.message || 'ลบรายจ่ายสำเร็จ')
      loadExpenses(expenses.length === 1 && expensesPage > 1 ? expensesPage - 1 : expensesPage)
    } catch (err) {
      if (handleUnauthorized(err)) return
      setExpensesError(err.response?.data?.message || 'ลบรายจ่ายไม่สำเร็จ')
    }
  }

  const handleExpenseFormChange = (event) => {
    const { name, value } = event.target
    setExpenseForm((prev) => ({ ...prev, [name]: value }))
  }

  const submitExpenseForm = (event, requestClose) => {
    event.preventDefault()
    if (!expenseForm.category.trim()) {
      setExpenseFormError('กรุณาระบุหมวดหมู่รายจ่าย')
      return
    }
    const amountValue = Number(expenseForm.amount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setExpenseFormError('กรุณาระบุจำนวนเงินให้ถูกต้อง')
      return
    }
    if (!expenseForm.expense_date) {
      setExpenseFormError('กรุณาระบุวันที่')
      return
    }

    setExpenseSubmitting(true)
    setExpenseFormError('')
    const payload = {
      category: expenseForm.category.trim(),
      description: expenseForm.description.trim() || null,
      amount: amountValue,
      expense_date: expenseForm.expense_date,
    }
    const request =
      expenseModal.mode === 'create'
        ? axios.post('/api/admin/expenses', payload, { headers: authHeaders() })
        : axios.put(`/api/admin/expenses/${expenseModal.expense.id}`, payload, { headers: authHeaders() })

    request
      .then(() => {
        setSuccessMessage(expenseModal.mode === 'create' ? 'บันทึกรายจ่ายสำเร็จ' : 'แก้ไขรายจ่ายสำเร็จ')
        requestClose()
        loadExpenses(expenseModal.mode === 'create' ? 1 : expensesPage)
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setExpenseFormError(err.response?.data?.message || 'ไม่สามารถบันทึกรายจ่ายได้')
      })
      .finally(() => setExpenseSubmitting(false))
  }


  const loadRooms = () => {
    setRoomsLoading(true)
    return axios
      .get('/api/admin/rooms', { headers: authHeaders() })
      .then(({ data }) => {
        setRooms(data.rooms)
        setRoomsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRoomsError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลห้องพักได้')
      })
      .finally(() => setRoomsLoading(false))
  }

  const handlePrintMonthlyInvoices = async () => {
    setInvoiceGenerating(true)
    setInvoicePrintError('')
    const printWindow = window.open('', '_blank', 'width=900,height=720')
    if (!printWindow) {
      setInvoiceGenerating(false)
      setInvoicePrintError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง')
      return
    }
    try {
      const { data } = await axios.get('/api/staff/rooms', { headers: authHeaders() })
      const count = printMonthlyInvoices(data.rooms, printWindow)
      if (count === 0) {
        setInvoicePrintError('ไม่มีห้องที่มีผู้เช่าให้ออกใบแจ้งหนี้')
        return
      }
      setSuccessMessage(`เตรียมใบแจ้งหนี้ ${count} ห้องแล้ว เลือกพิมพ์หรือบันทึกเป็น PDF ได้จากหน้าต่างที่เปิดขึ้น`)
    } catch (err) {
      printWindow.close()
      if (handleUnauthorized(err)) return
      setInvoicePrintError(err.message || 'สร้างใบแจ้งหนี้ไม่สำเร็จ')
    } finally {
      setInvoiceGenerating(false)
    }
  }

  const openCreateRoom = () => {
    setRoomForm(emptyRoomForm)
    setRoomFormError('')
    setRoomModal({ mode: 'create' })
  }

  const openEditRoom = (room) => {
    setRoomForm({
      room_number: String(room.room_number),
      price: String(room.price),
      bed: String(room.bed ?? 1),
      electricity_unit_price: String(room.electricity_unit_price),
      water_price: String(room.water_price),
      air_conditioner: Boolean(room.air_conditioner),
      wifi: Boolean(room.wifi),
      refrigerator: Boolean(room.refrigerator),
      bathroom: Boolean(room.bathroom),
      cctv: Boolean(room.cctv),
    })
    setRoomFormError('')
    setRoomModal({ mode: 'edit', room })
  }

  const openRoomDetail = (room) => {
    setRoomDetail({ room, data: null, loading: true, error: '' })
    axios
      .get(`/api/admin/rooms/${room.room_number}/detail`, { headers: authHeaders() })
      .then(({ data }) => {
        setRoomDetail((prev) => (prev?.room.id === room.id ? { ...prev, data, loading: false } : prev))
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRoomDetail((prev) =>
          prev?.room.id === room.id
            ? { ...prev, loading: false, error: err.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดห้องพักได้' }
            : prev,
        )
      })
  }

  const openRoomMaintenance = (room, focusId = null) => {
    setMaintenanceDetail(null)
    setRoomMaintenance({ room, data: null, loading: true, error: '' })
    axios
      .get(`/api/admin/rooms/${room.room_number}/maintenance`, { headers: authHeaders() })
      .then(({ data }) => {
        setRoomMaintenance((prev) => (prev?.room.id === room.id ? { ...prev, data: data.requests, loading: false } : prev))
        const target = focusId ? data.requests.find((request) => request.id === focusId) : null
        if (target) setMaintenanceDetail(target)
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRoomMaintenance((prev) =>
          prev?.room.id === room.id
            ? { ...prev, loading: false, error: err.response?.data?.message || 'ไม่สามารถโหลดประวัติแจ้งซ่อมได้' }
            : prev,
        )
      })
  }

  const openRoomTenants = (room, focusId = null) => {
    setRoomTenants({ room, data: null, loading: true, error: '', focusId })
    axios
      .get(`/api/admin/rooms/${room.room_number}/tenants`, { headers: authHeaders() })
      .then(({ data }) => {
        setRoomTenants((prev) => (prev?.room.id === room.id ? { ...prev, data: data.tenants, loading: false } : prev))
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRoomTenants((prev) =>
          prev?.room.id === room.id
            ? { ...prev, loading: false, error: err.response?.data?.message || 'ไม่สามารถโหลดประวัติผู้เช่าได้' }
            : prev,
        )
      })
  }

  const openRoomHistory = (room, initialSearch = '') => {
    setRoomHistory({ room, data: null, loading: true, error: '', initialSearch })
    axios
      .get(`/api/admin/rooms/${room.room_number}/history`, { headers: authHeaders() })
      .then(({ data }) => {
        setRoomHistory((prev) => (prev?.room.id === room.id ? { ...prev, data: data.rentalHistory, loading: false } : prev))
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRoomHistory((prev) =>
          prev?.room.id === room.id
            ? { ...prev, loading: false, error: err.response?.data?.message || 'ไม่สามารถโหลดประวัติการจ่ายเงินได้' }
            : prev,
        )
      })
  }

  const handleRoomFormChange = (event) => {
    const { name, type, value, checked } = event.target
    if (name === 'room_number') {
      setRoomForm((prev) => ({ ...prev, room_number: value.replace(/\D/g, '').slice(0, 3) }))
      return
    }
    if (name === 'bed') {
      setRoomForm((prev) => ({ ...prev, bed: value.replace(/\D/g, '').slice(0, 2) }))
      return
    }
    if (name === 'electricity_unit_price' || name === 'water_price') {
      const maxValue = name === 'water_price' ? 999.99 : 99.99
      if (value !== '' && Number(value) > maxValue) return
      setRoomForm((prev) => ({ ...prev, [name]: value }))
      return
    }
    setRoomForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const submitRoomForm = async (event, requestClose) => {
    event.preventDefault()
    if (roomModal.mode === 'create' && !/^[1-9][0-9]{2}$/.test(roomForm.room_number)) {
      setRoomFormError('เลขห้องต้องเป็นตัวเลข 3 หลัก')
      return
    }
    const bedValue = Number(roomForm.bed)
    if (!Number.isInteger(bedValue) || bedValue < 0 || bedValue > 99) {
      setRoomFormError('จำนวนเตียงต้องเป็นตัวเลข 2 หลัก (0-99)')
      return
    }
    const electricityValue = Number(roomForm.electricity_unit_price)
    if (!Number.isFinite(electricityValue) || electricityValue < 0 || electricityValue > 99.99) {
      setRoomFormError('ค่าไฟ/หน่วยต้องเป็นตัวเลข 2 หลัก (0-99.99)')
      return
    }
    const waterValue = Number(roomForm.water_price)
    if (!Number.isFinite(waterValue) || waterValue < 0 || waterValue > 999.99) {
      setRoomFormError('ค่าน้ำ/เดือนต้องเป็นตัวเลข 3 หลัก (0-999.99)')
      return
    }
    setRoomSubmitting(true)
    setRoomFormError('')
    const payload = {
      room_number: Number(roomForm.room_number),
      price: Number(roomForm.price),
      bed: Number(roomForm.bed),
      electricity_unit_price: Number(roomForm.electricity_unit_price),
      water_price: Number(roomForm.water_price),
      air_conditioner: roomForm.air_conditioner,
      wifi: roomForm.wifi,
      refrigerator: roomForm.refrigerator,
      bathroom: roomForm.bathroom,
      cctv: roomForm.cctv,
    }
    try {
      if (roomModal.mode === 'create') {
        const { data } = await axios.post('/api/admin/rooms', payload, { headers: authHeaders() })
        setSuccessMessage(data.message || 'สร้างห้องพักสำเร็จ')
      } else {
        const { room_number, ...editable } = payload
        void room_number
        const { data } = await axios.put(`/api/admin/rooms/${roomModal.room.room_number}`, editable, { headers: authHeaders() })
        setSuccessMessage(data.message || 'แก้ไขข้อมูลห้องพักสำเร็จ')
      }
      requestClose()
      await loadRooms()
    } catch (err) {
      setRoomFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setRoomSubmitting(false)
    }
  }

  const confirmDeleteRoom = async (requestClose) => {
    if (!roomDeleteConfirm) return
    try {
      const { data } = await axios.delete(`/api/admin/rooms/${roomDeleteConfirm.room_number}`, { headers: authHeaders() })
      setSuccessMessage(data.message || 'ลบห้องพักสำเร็จ')
      requestClose()
      await loadRooms()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ลบห้องพักไม่สำเร็จ')
      requestClose()
    }
  }

  const filteredRooms = useMemo(() => {
    const keyword = roomSearch.trim().toLowerCase()
    const matched = !keyword
      ? rooms
      : rooms.filter((room) => {
          const tenantName = room.customer_id ? `${room.first_name} ${room.last_name}`.toLowerCase() : ''
          return String(room.room_number).includes(keyword) || tenantName.includes(keyword) || (room.phone || '').includes(keyword)
        })
    return [...matched].sort((a, b) => Number(a.is_booked) - Number(b.is_booked) || a.room_number - b.room_number)
  }, [rooms, roomSearch])

  const roomsTotalPages = Math.max(1, Math.ceil(filteredRooms.length / ROWS_PER_PAGE))
  const currentRoomsPage = Math.min(roomsPage, roomsTotalPages)
  const paginatedRooms = useMemo(() => {
    const start = (currentRoomsPage - 1) * ROWS_PER_PAGE
    return filteredRooms.slice(start, start + ROWS_PER_PAGE)
  }, [filteredRooms, currentRoomsPage])

  const [expandedRoomRows, toggleRoomRow, resetRoomRows] = useExpandedRows()
  useEffect(() => {
    resetRoomRows()
  }, [currentRoomsPage, activeTab])

  const [staffList, setStaffList] = useState([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [staffError, setStaffError] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [staffPage, setStaffPage] = useState(1)
  const [staffModal, setStaffModal] = useState(null)
  const [staffForm, setStaffForm] = useState(emptyStaffForm)
  const [staffSubmitting, setStaffSubmitting] = useState(false)
  const [staffFormError, setStaffFormError] = useState('')
  const [staffDeleteConfirm, setStaffDeleteConfirm] = useState(null)
  const [staffSuspendConfirm, setStaffSuspendConfirm] = useState(null)
  const [revealedStaffIdCards, setRevealedStaffIdCards] = useState(() => new Set())

  const toggleStaffIdCardReveal = (id) => {
    setRevealedStaffIdCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const loadStaff = () => {
    setStaffLoading(true)
    return axios
      .get('/api/admin/staff', { headers: authHeaders() })
      .then(({ data }) => {
        setStaffList(data.staff)
        setStaffError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setStaffError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลพนักงานได้')
      })
      .finally(() => setStaffLoading(false))
  }

  const openCreateStaff = () => {
    setStaffForm(emptyStaffForm)
    setStaffFormError('')
    setStaffModal({ mode: 'create' })
  }

  const openEditStaff = (member) => {
    setStaffForm({
      idcard: member.idcard,
      password: '',
      phone: member.phone,
      first_name: member.first_name,
      last_name: member.last_name,
      age: String(member.age),
    })
    setStaffFormError('')
    setStaffModal({ mode: 'edit', staff: member })
  }

  const handleStaffFormChange = (event) => {
    const { name, value } = event.target
    setStaffForm((prev) => ({ ...prev, [name]: value }))
  }

  const submitStaffForm = async (event, requestClose) => {
    event.preventDefault()
    setStaffSubmitting(true)
    setStaffFormError('')
    try {
      if (staffModal.mode === 'create') {
        const { data } = await axios.post('/api/admin/staff', staffForm, { headers: authHeaders() })
        setSuccessMessage(data.message || 'เพิ่มพนักงานสำเร็จ')
      } else {
        const payload = {
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          phone: staffForm.phone,
          age: Number(staffForm.age),
        }
        if (staffForm.password) payload.password = staffForm.password
        const { data } = await axios.put(`/api/admin/staff/${staffModal.staff.id}`, payload, { headers: authHeaders() })
        setSuccessMessage(data.message || 'แก้ไขข้อมูลพนักงานสำเร็จ')
      }
      requestClose()
      await loadStaff()
    } catch (err) {
      setStaffFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setStaffSubmitting(false)
    }
  }

  const toggleStaffSuspend = async (member, requestClose) => {
    try {
      const { data } = await axios.patch(
        `/api/admin/staff/${member.id}/suspend`,
        { is_suspended: !member.is_suspended },
        { headers: authHeaders() },
      )
      setSuccessMessage(data.message || 'ดำเนินการสำเร็จ')
      requestClose()
      await loadStaff()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ')
      requestClose()
    }
  }

  const confirmDeleteStaff = async (requestClose) => {
    if (!staffDeleteConfirm) return
    try {
      const { data } = await axios.delete(`/api/admin/staff/${staffDeleteConfirm.id}`, { headers: authHeaders() })
      setSuccessMessage(data.message || 'ลบพนักงานสำเร็จ')
      requestClose()
      await loadStaff()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ลบพนักงานไม่สำเร็จ')
      requestClose()
    }
  }

  const filteredStaff = useMemo(() => {
    const keyword = staffSearch.trim().toLowerCase()
    if (!keyword) return staffList
    return staffList.filter((member) => {
      const name = `${member.first_name} ${member.last_name}`.toLowerCase()
      return name.includes(keyword) || member.phone.includes(keyword) || member.idcard.includes(keyword)
    })
  }, [staffList, staffSearch])

  const staffTotalPages = Math.max(1, Math.ceil(filteredStaff.length / ROWS_PER_PAGE))
  const currentStaffPage = Math.min(staffPage, staffTotalPages)
  const paginatedStaff = useMemo(() => {
    const start = (currentStaffPage - 1) * ROWS_PER_PAGE
    return filteredStaff.slice(start, start + ROWS_PER_PAGE)
  }, [filteredStaff, currentStaffPage])

  useEffect(() => {
    setRevealedStaffIdCards(new Set())
  }, [currentStaffPage, activeTab])

  const [expandedStaffRows, toggleStaffRow, resetStaffRows] = useExpandedRows()
  useEffect(() => {
    resetStaffRows()
  }, [currentStaffPage, activeTab])

  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [customersError, setCustomersError] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all')
  const [customersPage, setCustomersPage] = useState(1)
  const [customerModal, setCustomerModal] = useState(null)
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm)
  const [customerSubmitting, setCustomerSubmitting] = useState(false)
  const [customerFormError, setCustomerFormError] = useState('')
  const [customerDetail, setCustomerDetail] = useState(null)
  const [customerSuspendConfirm, setCustomerSuspendConfirm] = useState(null)
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false)
  const [customerDetailError, setCustomerDetailError] = useState('')
  const [revealedCustomerIdCards, setRevealedCustomerIdCards] = useState(() => new Set())

  const toggleCustomerIdCardReveal = (id) => {
    setRevealedCustomerIdCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const loadCustomers = (search = customerSearch) => {
    setCustomersLoading(true)
    return axios
      .get('/api/admin/customers', { headers: authHeaders(), params: { search: search || undefined } })
      .then(({ data }) => {
        setCustomers(data.customers)
        setCustomersError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setCustomersError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลลูกค้าได้')
      })
      .finally(() => setCustomersLoading(false))
  }

  const isCustomerSearchMount = useRef(true)
  useEffect(() => {
    if (isCustomerSearchMount.current) {
      isCustomerSearchMount.current = false
      return
    }
    const timeout = setTimeout(() => loadCustomers(customerSearch), 400)
    return () => clearTimeout(timeout)
  }, [customerSearch])

  const openEditCustomer = (customer) => {
    setCustomerForm({
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      age: String(customer.age),
      deposit_amount: customer.deposit_amount != null ? String(customer.deposit_amount) : '',
    })
    setCustomerFormError('')
    setCustomerModal(customer)
  }

  const handleCustomerFormChange = (event) => {
    const { name, value } = event.target
    setCustomerForm((prev) => ({ ...prev, [name]: value }))
  }

  const submitCustomerForm = async (event, requestClose) => {
    event.preventDefault()
    setCustomerSubmitting(true)
    setCustomerFormError('')
    try {
      const payload = {
        first_name: customerForm.first_name,
        last_name: customerForm.last_name,
        phone: customerForm.phone,
        age: Number(customerForm.age),
        deposit_amount: customerForm.deposit_amount === '' ? null : Number(customerForm.deposit_amount),
      }
      const { data } = await axios.put(`/api/admin/customers/${customerModal.id}`, payload, { headers: authHeaders() })
      setSuccessMessage(data.message || 'แก้ไขข้อมูลลูกค้าสำเร็จ')
      requestClose()
      await loadCustomers()
    } catch (err) {
      setCustomerFormError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setCustomerSubmitting(false)
    }
  }

  const toggleCustomerSuspend = async (customer, requestClose) => {
    try {
      const { data } = await axios.patch(
        `/api/admin/customers/${customer.id}/suspend`,
        { is_suspended: !customer.is_suspended },
        { headers: authHeaders() },
      )
      setSuccessMessage(data.message || 'ดำเนินการสำเร็จ')
      requestClose()
      await loadCustomers()
    } catch (err) {
      setPageError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ')
      requestClose()
    }
  }

  const openCustomerDetail = async (customer) => {
    setCustomerDetail({ customer, rentalHistory: null })
    setCustomerDetailError('')
    setCustomerDetailLoading(true)
    try {
      const { data } = await axios.get(`/api/admin/customers/${customer.id}`, { headers: authHeaders() })
      setCustomerDetail({ customer: data.customer, rentalHistory: data.rentalHistory })
    } catch (err) {
      setCustomerDetailError(err.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดลูกค้าได้')
    } finally {
      setCustomerDetailLoading(false)
    }
  }

  const filteredCustomers = useMemo(() => {
    if (customerStatusFilter === 'all') return customers
    const wantSuspended = customerStatusFilter === 'suspended'
    return customers.filter((customer) => Boolean(customer.is_suspended) === wantSuspended)
  }, [customers, customerStatusFilter])

  const customersTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / ROWS_PER_PAGE))
  const currentCustomersPage = Math.min(customersPage, customersTotalPages)
  const paginatedCustomers = useMemo(() => {
    const start = (currentCustomersPage - 1) * ROWS_PER_PAGE
    return filteredCustomers.slice(start, start + ROWS_PER_PAGE)
  }, [filteredCustomers, currentCustomersPage])

  const [expandedCustomerRows, toggleCustomerRow, resetCustomerRows] = useExpandedRows()
  useEffect(() => {
    resetCustomerRows()
  }, [currentCustomersPage, activeTab])

  const [requestLogs, setRequestLogs] = useState({ items: [], total: 0, page: 1, pageSize: 20 })
  const [requestLogsLoading, setRequestLogsLoading] = useState(false)
  const [requestDetail, setRequestDetail] = useState(null)
  const [requestLogsError, setRequestLogsError] = useState('')
  const [requestStatusFilter, setRequestStatusFilter] = useState('all')
  const [requestSearch, setRequestSearch] = useState('')

  const loadRequestLogs = (page = 1, status = requestStatusFilter, search = requestSearch) => {
    setRequestLogsLoading(true)
    return axios
      .get('/api/admin/logs/requests', {
        headers: authHeaders(),
        params: { page, status: status !== 'all' ? status : undefined, search: search || undefined },
      })
      .then(({ data }) => {
        setRequestLogs({ items: data.requests, total: data.total, page: data.page, pageSize: data.pageSize })
        setRequestLogsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setRequestLogsError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติคำขอได้')
      })
      .finally(() => setRequestLogsLoading(false))
  }

  const [maintenanceLogs, setMaintenanceLogs] = useState({ items: [], total: 0, page: 1, pageSize: 20 })
  const [maintenanceLogsLoading, setMaintenanceLogsLoading] = useState(false)
  const [maintenanceLogsError, setMaintenanceLogsError] = useState('')
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState('all')
  const [maintenanceSearch, setMaintenanceSearch] = useState('')

  const loadMaintenanceLogs = (page = 1, status = maintenanceStatusFilter, search = maintenanceSearch) => {
    setMaintenanceLogsLoading(true)
    return axios
      .get('/api/admin/logs/maintenance', {
        headers: authHeaders(),
        params: { page, status: status !== 'all' ? status : undefined, search: search || undefined },
      })
      .then(({ data }) => {
        setMaintenanceLogs({ items: data.requests, total: data.total, page: data.page, pageSize: data.pageSize })
        setMaintenanceLogsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setMaintenanceLogsError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติแจ้งซ่อมได้')
      })
      .finally(() => setMaintenanceLogsLoading(false))
  }

  const [moveoutLogs, setMoveoutLogs] = useState({ items: [], total: 0, page: 1, pageSize: 20 })
  const [moveoutLogsLoading, setMoveoutLogsLoading] = useState(false)
  const [moveoutLogsError, setMoveoutLogsError] = useState('')
  const [moveoutSearch, setMoveoutSearch] = useState('')
  const [revealedMoveoutIdCards, setRevealedMoveoutIdCards] = useState(() => new Set())
  const [moveoutDetail, setMoveoutDetail] = useState(null)

  const openMoveoutDetail = (row) => {
    setMoveoutDetail({ row, data: null, loading: true, error: '' })
    axios
      .get(`/api/admin/moveouts/${row.id}`, { headers: authHeaders() })
      .then(({ data }) => {
        setMoveoutDetail((prev) => (prev?.row.id === row.id ? { ...prev, data, loading: false } : prev))
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setMoveoutDetail((prev) =>
          prev?.row.id === row.id
            ? { ...prev, loading: false, error: err.response?.data?.message || 'ไม่สามารถโหลดรายละเอียดการย้ายออกได้' }
            : prev,
        )
      })
  }

  const toggleMoveoutIdCardReveal = (id) => {
    setRevealedMoveoutIdCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const loadMoveoutLogs = (page = 1, search = moveoutSearch) => {
    setMoveoutLogsLoading(true)
    return axios
      .get('/api/admin/logs/moveouts', {
        headers: authHeaders(),
        params: { page, search: search || undefined },
      })
      .then(({ data }) => {
        setMoveoutLogs({ items: data.moveouts, total: data.total, page: data.page, pageSize: data.pageSize })
        setMoveoutLogsError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setMoveoutLogsError(err.response?.data?.message || 'ไม่สามารถโหลดรายชื่อผู้ย้ายออกได้')
      })
      .finally(() => setMoveoutLogsLoading(false))
  }

  const loadNotifSources = () => {
    axios
      .get('/api/admin/logs/requests', { headers: authHeaders(), params: { page: 1 } })
      .then(({ data }) => setNotifTenantItems(data.requests))
      .catch((err) => handleUnauthorized(err))
    axios
      .get('/api/admin/logs/maintenance', { headers: authHeaders(), params: { page: 1 } })
      .then(({ data }) => setNotifMaintenanceItems(data.requests))
      .catch((err) => handleUnauthorized(err))
    loadAnnouncements()
  }

  useEffect(() => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    const storedUser = sessionStorage.getItem('user')
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser)
        if (!['Admin', 'Owner'].includes(parsed?.role)) {
          navigate('/login', { replace: true })
          return
        }
        setAdminUser(parsed)
      } catch {
        setAdminUser(null)
      }
    }
    loadRooms()
    loadStaff()
    loadCustomers('')
    loadWaitingList()
    loadMoveOutInspections()
    loadParcels()
    loadNotifSources()
    const refreshNotifications = () => {
      loadNotifSources()
      loadStaff()
      loadParcels()
      loadMoveOutInspections()
    }
    const interval = setInterval(refreshNotifications, 60000)
    window.addEventListener('focus', refreshNotifications)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refreshNotifications)
    }
  }, [loadParcels])

  useEffect(() => {
    if (activeTab === 'requests') loadRequestLogs(1, requestStatusFilter, requestSearch)
    if (activeTab === 'maintenance') loadMaintenanceLogs(1, maintenanceStatusFilter, maintenanceSearch)
    if (activeTab === 'moveouts') loadMoveoutLogs(1, moveoutSearch)
    if (activeTab === 'expenses') loadExpenses(1)
  }, [activeTab])

  const isRequestSearchMount = useRef(true)
  useEffect(() => {
    if (isRequestSearchMount.current) {
      isRequestSearchMount.current = false
      return
    }
    if (activeTab !== 'requests') return
    const timeout = setTimeout(() => loadRequestLogs(1, requestStatusFilter, requestSearch), 400)
    return () => clearTimeout(timeout)
  }, [requestSearch])

  const isMaintenanceSearchMount = useRef(true)
  useEffect(() => {
    if (isMaintenanceSearchMount.current) {
      isMaintenanceSearchMount.current = false
      return
    }
    if (activeTab !== 'maintenance') return
    const timeout = setTimeout(() => loadMaintenanceLogs(1, maintenanceStatusFilter, maintenanceSearch), 400)
    return () => clearTimeout(timeout)
  }, [maintenanceSearch])

  const isMoveoutSearchMount = useRef(true)
  useEffect(() => {
    if (isMoveoutSearchMount.current) {
      isMoveoutSearchMount.current = false
      return
    }
    if (activeTab !== 'moveouts') return
    const timeout = setTimeout(() => loadMoveoutLogs(1, moveoutSearch), 400)
    return () => clearTimeout(timeout)
  }, [moveoutSearch])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const summary = useMemo(() => {
    const totalRooms = rooms.length
    const vacantRooms = rooms.filter((room) => !room.is_booked).length
    const activeStaff = staffList.filter((member) => !member.is_suspended).length
    const activeCustomers = customers.filter((customer) => !customer.is_suspended).length
    return { totalRooms, vacantRooms, activeStaff, activeCustomers }
  }, [rooms, staffList, customers])

  const inspectionKindCounts = moveOutInspections.reduce((counts, inspection) => {
    const kind = inspectionKindOf(inspection)
    counts[kind] = (counts[kind] || 0) + 1
    return counts
  }, {})
  const kindInspections =
    inspectionKind === 'all' ? moveOutInspections : moveOutInspections.filter((inspection) => inspectionKindOf(inspection) === inspectionKind)
  const inspectionToneCounts = kindInspections.reduce((counts, inspection) => {
    const tone = summarizeInspection(inspection.checklist).tone
    counts[tone] = (counts[tone] || 0) + 1
    return counts
  }, {})
  const inspectionKeyword = inspectionSearch.trim().toLocaleLowerCase('th-TH')
  const filteredInspections = kindInspections.filter((inspection) => {
    if (inspectionResultFilter !== 'all' && summarizeInspection(inspection.checklist).tone !== inspectionResultFilter) return false
    if (
      inspectionStatusFilter !== 'all'
      && (inspectionKindOf(inspection) !== 'moveout' || (inspection.status || 'pending') !== inspectionStatusFilter)
    ) {
      return false
    }
    if (!inspectionKeyword) return true
    return [
      inspection.room_number,
      inspection.target_room_number,
      inspection.tenant_name,
      inspection.tenant_phone,
      inspection.inspected_by,
      inspection.damage_note,
    ]
      .some((value) => String(value ?? '').toLocaleLowerCase('th-TH').includes(inspectionKeyword))
  })

  const filteredParcels = parcels.filter((parcel) => {
    if (parcelStatusFilter !== 'all' && parcel.status !== parcelStatusFilter) return false
    const keyword = parcelSearch.trim().toLocaleLowerCase('th-TH')
    return !keyword || [
      parcel.room_number,
      parcel.first_name,
      parcel.last_name,
      parcel.phone,
      parcel.tracking_number,
      parcel.sender_name,
      parcel.description,
    ].filter(Boolean).join(' ').toLocaleLowerCase('th-TH').includes(keyword)
  })
  const parcelTotalPages = Math.max(1, Math.ceil(filteredParcels.length / ROWS_PER_PAGE))
  const currentParcelPage = Math.min(parcelPage, parcelTotalPages)
  const pagedParcels = filteredParcels.slice((currentParcelPage - 1) * ROWS_PER_PAGE, currentParcelPage * ROWS_PER_PAGE)

  const notifications = useMemo(() => {
    return [
      ...notifTenantItems.flatMap(buildAdminTenantNotifs),
      ...notifMaintenanceItems.flatMap(buildAdminMaintenanceNotifs),
      ...staffList.flatMap(buildAdminStaffNotifs),
      ...announcements.map(buildAnnouncementNotif),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [notifTenantItems, notifMaintenanceItems, staffList, announcements])

  const newNotifications = notifications.filter((notification) => !seenNotificationKeys.includes(notification.key))

  const markNotificationsRead = () => {
    setFreshNotifKeys(new Set(newNotifications.map((notification) => notification.key)))
    const keys = notifications.map((notification) => notification.key)
    setSeenNotificationKeys(keys)
    localStorage.setItem(getNotificationStorageKey('admin'), JSON.stringify(keys))
  }

  const notifTotalPages = Math.max(1, Math.ceil(notifications.length / NOTIF_PAGE_SIZE))
  const notifCurrentPage = Math.min(notifPage, notifTotalPages)
  const paginatedNotifications = notifications.slice(
    (notifCurrentPage - 1) * NOTIF_PAGE_SIZE,
    notifCurrentPage * NOTIF_PAGE_SIZE,
  )

  const requestLogsTotalPages = Math.max(1, Math.ceil(requestLogs.total / requestLogs.pageSize))
  const maintenanceLogsTotalPages = Math.max(1, Math.ceil(maintenanceLogs.total / maintenanceLogs.pageSize))
  const moveoutLogsTotalPages = Math.max(1, Math.ceil(moveoutLogs.total / moveoutLogs.pageSize))

  const [expandedRequestRows, toggleRequestRow, resetRequestRows] = useExpandedRows()
  useEffect(() => {
    resetRequestRows()
  }, [requestLogs.page, activeTab])

  const [expandedMaintenanceRows, toggleMaintenanceRow, resetMaintenanceRows] = useExpandedRows()
  useEffect(() => {
    resetMaintenanceRows()
  }, [maintenanceLogs.page, activeTab])

  const [expandedMoveoutRows, toggleMoveoutRow, resetMoveoutRows] = useExpandedRows()
  useEffect(() => {
    resetMoveoutRows()
  }, [moveoutLogs.page, activeTab])

  const openNotification = (notif) => {
    closeNotifPanel()
    if (notif.kind === 'announcement') {
      setActiveTab('announcements')
      setAnnouncementFocus((focus) => ({ id: notif.announcementId, nonce: (focus?.nonce ?? 0) + 1 }))
      return
    }
    setAnnouncementFocus(null)
    if (notif.kind === 'staff') {
      setStaffSearch('')
      setStaffPage(1)
      setActiveTab('staff')
      notifTargetRef.current = { tab: 'staff', id: notif.request.id }
      setNotifTargetReady((count) => count + 1)
      return
    }
    if (notif.kind === 'tenant') {
      setRequestStatusFilter('all')
      setRequestSearch('')
      setActiveTab('requests')
      notifTargetRef.current = { tab: 'requests', id: notif.request.id }
      loadRequestLogs(1, 'all', '').finally(() => setNotifTargetReady((count) => count + 1))
      return
    }
    setMaintenanceStatusFilter('all')
    setMaintenanceSearch('')
    setActiveTab('maintenance')
    notifTargetRef.current = { tab: 'maintenance', id: notif.request.id }
    loadMaintenanceLogs(1, 'all', '').finally(() => setNotifTargetReady((count) => count + 1))
  }

  useEffect(() => {
    const target = notifTargetRef.current
    if (!target || activeTab !== target.tab) return
    const { tab, id } = target
    if (tab === 'requests' && requestLogs.items.some((item) => item.id === id)) toggleRequestRow(id)
    else if (tab === 'maintenance' && maintenanceLogs.items.some((item) => item.id === id)) toggleMaintenanceRow(id)
    else if (tab === 'staff' && staffList.some((member) => member.id === id)) toggleStaffRow(id)
    notifTargetRef.current = null
  }, [notifTargetReady, activeTab, requestLogs.items, maintenanceLogs.items, staffList])

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <div className="admin-title-group">
            <div className="admin-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z" />
              </svg>
            </div>
            <div>
              <h1>สวัสดี, {adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'ผู้ดูแลระบบ'}</h1>
              <p>แดชบอร์ดผู้ดูแลระบบ - จัดการห้องพัก พนักงาน ลูกค้า และตรวจสอบกิจกรรม</p>
            </div>
          </div>
          <div className="admin-header-actions">
            <div className="admin-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="admin-notif-btn"
                aria-label="การแจ้งเตือน"
                onClick={() => {
                  if (notifOpen) {
                    closeNotifPanel()
                  } else {
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
                {newNotifications.length > 0 && (
                  <span className="admin-notif-dot">{newNotifications.length > 99 ? '99+' : newNotifications.length}</span>
                )}
              </button>
              {notifOpen && (
                <div
                  className={`admin-notif-panel${notifClosing ? ' is-closing' : ''}`}
                  onAnimationEnd={() => {
                    if (notifClosing) {
                      setNotifOpen(false)
                      setNotifClosing(false)
                    }
                  }}
                >
                  <div className="admin-notif-panel-header">
                    <span className="admin-notif-panel-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      การแจ้งเตือน
                      {notifications.length > 0 && <span className="admin-notif-count">{notifications.length}</span>}
                    </span>
                    <button type="button" className="admin-notif-panel-close" onClick={closeNotifPanel} aria-label="ปิด">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="admin-notif-empty">
                      <span className="admin-notif-empty-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                      </span>
                      ยังไม่มีการแจ้งเตือน
                    </div>
                  ) : (
                    <>
                      <div className="admin-notif-list" ref={notifListRef}>
                        {paginatedNotifications.map((notif) => (
                          <button
                            type="button"
                            key={notif.key}
                            className={`admin-notif-item is-${notif.tone}${freshNotifKeys.has(notif.key) ? ' is-new' : ''}`}
                            onClick={() => openNotification(notif)}
                          >
                            <span className="admin-notif-item-icon">
                              <NotifKindIcon kind={notif.kind} />
                            </span>
                            <span className="admin-notif-item-main">
                              <span className="admin-notif-item-head">
                                <span className="admin-notif-item-title">
                                  {freshNotifKeys.has(notif.key) && <span className="admin-notif-item-new">ใหม่</span>}
                                  {notif.title}
                                </span>
                                <time className="admin-notif-item-date">{formatDateTime(notif.date)}</time>
                              </span>
                              <span className="admin-notif-item-status">{notif.label}</span>
                              {notif.preview && (
                                <span className="admin-notif-item-preview">
                                  <span className="admin-notif-item-preview-label">{notif.previewLabel}</span>
                                  <span className="admin-notif-item-preview-text">{notif.preview}</span>
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      {notifTotalPages > 1 && (
                        <div className="admin-notif-pagination">
                          <span className="admin-notif-page-info">
                            {(notifCurrentPage - 1) * NOTIF_PAGE_SIZE + 1}–
                            {Math.min(notifCurrentPage * NOTIF_PAGE_SIZE, notifications.length)} จาก {notifications.length}
                          </span>
                          <div className="admin-notif-page-nav">
                            <button
                              type="button"
                              className="admin-notif-page-btn"
                              aria-label="หน้าก่อนหน้า"
                              disabled={notifCurrentPage <= 1}
                              onClick={() => {
                                setNotifPage(Math.max(1, notifCurrentPage - 1))
                                notifListRef.current?.scrollTo({ top: 0 })
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M15 18l-6-6 6-6" />
                              </svg>
                            </button>
                            <span className="admin-notif-page-current">
                              {notifCurrentPage} / {notifTotalPages}
                            </span>
                            <button
                              type="button"
                              className="admin-notif-page-btn"
                              aria-label="หน้าถัดไป"
                              disabled={notifCurrentPage >= notifTotalPages}
                              onClick={() => {
                                setNotifPage(Math.min(notifTotalPages, notifCurrentPage + 1))
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
            <button type="button" className="admin-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        {pageError && (
          <div className="alert alert-danger admin-alert" role="alert">
            {pageError}
            <button type="button" className="btn-close float-end" onClick={() => setPageError('')} aria-label="ปิด" />
          </div>
        )}

        {successMessage && (
          <Modal title="สำเร็จ" onClose={() => setSuccessMessage('')} variant="confirm">
            {(requestClose) => (
              <div className="admin-confirm-body">
                <div className="admin-confirm-icon is-success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="admin-confirm-message">{successMessage}</p>
                <div className="admin-form-actions">
                  <button type="button" className="admin-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        <div className="admin-summary-grid">
          <div className="admin-summary-card">
            <div className="admin-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
              </svg>
            </div>
            <div className="admin-summary-text">
              <span className="admin-summary-label">ห้องทั้งหมด</span>
              <span className="admin-summary-value">{summary.totalRooms}</span>
            </div>
          </div>
          <div className="admin-summary-card is-vacant">
            <div className="admin-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="8 12.5 11 15.5 16 9.5" />
              </svg>
            </div>
            <div className="admin-summary-text">
              <span className="admin-summary-label">ห้องว่าง</span>
              <span className="admin-summary-value">{summary.vacantRooms}</span>
            </div>
          </div>
          <div className="admin-summary-card is-staff">
            <div className="admin-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="3.3" />
                <path d="M5.5 20c0-3.9 2.9-7 6.5-7s6.5 3.1 6.5 7" />
              </svg>
            </div>
            <div className="admin-summary-text">
              <span className="admin-summary-label">พนักงานที่ใช้งานอยู่</span>
              <span className="admin-summary-value">{summary.activeStaff}</span>
            </div>
          </div>
          <div className="admin-summary-card is-customer">
            <div className="admin-summary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="8.5" r="3" />
                <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" />
                <path d="M15 4.3a3 3 0 0 1 0 5.7" />
                <path d="M16.5 14c2 .4 3.5 2.7 3.5 6" />
              </svg>
            </div>
            <div className="admin-summary-text">
              <span className="admin-summary-label">ลูกค้าที่ใช้งานอยู่</span>
              <span className="admin-summary-value">{summary.activeCustomers}</span>
            </div>
          </div>
        </div>

        <ul className="nav nav-tabs admin-tabs">
          {TAB_GROUPS.map((group) => (
            <li className="nav-item" key={group.key}>
              <button
                type="button"
                className={`nav-link admin-tab-link${TAB_GROUP_OF[activeTab] === group.key ? ' active' : ''}`}
                onClick={() => {
                  if (TAB_GROUP_OF[activeTab] === group.key) return
                  setActiveTab(lastTabByGroup[group.key] || group.tabs[0])
                  setAnnouncementFocus(null)
                }}
              >
                {group.label}
              </button>
            </li>
          ))}
        </ul>

        {TAB_GROUPS.filter((group) => group.tabs.length > 1).map((group) => (
          <ul
            key={group.key}
            className="nav admin-subtabs"
            hidden={TAB_GROUP_OF[activeTab] !== group.key}
            aria-label={group.label}
          >
            {group.tabs.map((tabKey) => (
              <li className="nav-item" key={tabKey}>
                <button
                  type="button"
                  className={`nav-link admin-tab-link admin-subtab-link${activeTab === tabKey ? ' active' : ''}`}
                  onClick={() => {
                    setActiveTab(tabKey)
                    setLastTabByGroup((current) => ({ ...current, [group.key]: tabKey }))
                    setAnnouncementFocus(null)
                  }}
                >
                  {TAB_LABEL[tabKey]}
                  {tabBadges[tabKey] > 0 && <span className="admin-subtab-badge">{tabBadges[tabKey]}</span>}
                </button>
              </li>
            ))}
          </ul>
        ))}

        {activeTab === 'vehicle-requests' && <AdminVehicleRequestsTab onCountChange={setPendingVehicleCount} />}

        {activeTab === 'safety' && <AdminSafetyIncidentsTab onCountChange={setPendingSafetyCount} />}

        {activeTab === 'announcements' && (
          <AnnouncementBoard
            key={announcementFocus?.nonce ?? 'board'}
            variant="admin"
            announcements={announcements}
            openId={announcementFocus?.id}
            canManage
            apiBase="/api/admin/announcements"
            onChange={loadAnnouncements}
          />
        )}

        {activeTab === 'parcels' && (
          <div className="parcel-management-card">
            <div className="parcel-list-head">
              <h3 className="parcel-section-title">รายการพัสดุ</h3>
              <button type="button" className="parcel-action-btn is-primary" onClick={() => setParcelFormOpen(true)}>
                <PlusIcon />
                บันทึกพัสดุใหม่
              </button>
            </div>
            <div className="parcel-toolbar">
              <div className="parcel-search-field">
                <label className="parcel-label" htmlFor="admin-parcel-search">ค้นหา</label>
                <input
                  id="admin-parcel-search"
                  className="parcel-control"
                  type="search"
                  placeholder="เลขห้อง, ชื่อผู้เช่า, เลขพัสดุ..."
                  value={parcelSearch}
                  onChange={(event) => {
                    setParcelSearch(event.target.value)
                    setParcelPage(1)
                  }}
                />
              </div>
              <div className="parcel-filter-field">
                <label className="parcel-label" htmlFor="admin-parcel-status">สถานะ</label>
                <select
                  id="admin-parcel-status"
                  className="parcel-control"
                  value={parcelStatusFilter}
                  onChange={(event) => {
                    setParcelStatusFilter(event.target.value)
                    setParcelPage(1)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รอผู้เช่ารับ</option>
                  <option value="received">รับแล้ว</option>
                </select>
              </div>
            </div>
            <div className="table-responsive parcel-table-wrap">
              <table className="parcel-table">
                <thead>
                  <tr>
                    <th>ห้อง / ผู้เช่า</th>
                    <th>ผู้ส่ง / รายละเอียด</th>
                    <th>เลขพัสดุ</th>
                    <th>รูป</th>
                    <th>สถานะ</th>
                    <th>วันที่บันทึก / รับ</th>
                    <th>บันทึกโดย</th>
                  </tr>
                </thead>
                <tbody>
                  {parcelsLoading ? (
                    <tr><td colSpan={7} className="parcel-empty">กำลังโหลดรายการพัสดุ...</td></tr>
                  ) : parcelsError ? (
                    <tr>
                      <td colSpan={7} className="parcel-empty">
                        {parcelsError}{' '}
                        <button type="button" className="parcel-action-btn is-ghost" onClick={loadParcels}>ลองใหม่</button>
                      </td>
                    </tr>
                  ) : filteredParcels.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="parcel-empty">
                        <span className="parcel-empty-icon"><PackageIcon size={28} strokeWidth={1.8} /></span>
                        {parcels.length ? 'ไม่พบรายการพัสดุตามเงื่อนไข' : 'ยังไม่มีรายการพัสดุ'}
                      </td>
                    </tr>
                  ) : pagedParcels.map((parcel) => (
                    <tr key={parcel.id}>
                      <td>
                        <div className="parcel-room-cell">
                          <span className="parcel-room-badge">{parcel.room_number}</span>
                          <div>
                            <span className="parcel-primary">{parcel.first_name ? `${parcel.first_name} ${parcel.last_name}` : 'ไม่มีผู้เช่าปัจจุบัน'}</span>
                            <small className="parcel-secondary">{parcel.phone || '-'}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="parcel-primary">{parcel.sender_name}</span>
                        <small className="parcel-secondary">{parcel.description || '-'}</small>
                      </td>
                      <td>{parcel.tracking_number ? <span className="parcel-tracking">{parcel.tracking_number}</span> : <span className="parcel-muted">-</span>}</td>
                      <td>
                        {parcel.photos?.length ? (
                          <button
                            type="button"
                            className="parcel-thumb"
                            aria-label={`ดูรูปพัสดุห้อง ${parcel.room_number}`}
                            onClick={() => {
                              setParcelPhotoPreview(parcel)
                              setPhotoPreview(0)
                            }}
                          >
                            <UploadImage src={parcel.photos[0].url} alt="" />
                            {parcel.photos.length > 1 && <span>+{parcel.photos.length - 1}</span>}
                          </button>
                        ) : <span className="parcel-muted">-</span>}
                      </td>
                      <td><span className={`parcel-status${parcel.status === 'received' ? ' is-received' : ' is-pending'}`}>{parcel.status === 'received' ? 'รับแล้ว' : 'รอผู้เช่ารับ'}</span></td>
                      <td>
                        <span className="parcel-primary">{formatDateTime(parcel.created_at)}</span>
                        <small className="parcel-secondary">{parcel.received_at ? `รับ ${formatDateTime(parcel.received_at)}` : 'ยังไม่รับ'}</small>
                      </td>
                      <td>
                            <ActorName name={parcel.staff_name || 'เจ้าหน้าที่'} />
                          </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={currentParcelPage} totalPages={parcelTotalPages} onChange={setParcelPage} />
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายการห้องพัก</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="room-search">
                  ค้นหา
                </label>
                <input
                  id="room-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร..."
                  value={roomSearch}
                  onChange={(event) => {
                    setRoomSearch(event.target.value)
                    setRoomsPage(1)
                  }}
                />
              </div>
              <div className="admin-filters">
                <button type="button" className="admin-action-btn is-ghost" onClick={handlePrintMonthlyInvoices} disabled={invoiceGenerating}>
                  {invoiceGenerating ? 'กำลังเตรียม...' : 'ใบแจ้งหนี้รวม / PDF'}
                </button>
                <button type="button" className="admin-action-btn is-primary" onClick={openCreateRoom}>
                  + เพิ่มห้องพัก
                </button>
              </div>
            </div>

            {invoicePrintError && <div className="alert alert-danger">{invoicePrintError}</div>}
            {roomsError && <div className="alert alert-danger">{roomsError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>เลขห้อง</th>
                    <th>สถานะ</th>
                    <th>ราคา/เดือน</th>
                    <th className="admin-col-optional">สิ่งอำนวยความสะดวก</th>
                    <th>ผู้เช่า</th>
                    <th className="admin-col-optional">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {roomsLoading ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : filteredRooms.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        ไม่พบข้อมูลห้องพัก
                      </td>
                    </tr>
                  ) : (
                    paginatedRooms.map((room) => (
                      <Fragment key={room.id}>
                        <tr>
                          <td className="admin-strong-cell">
                            <button type="button" className="room-number-link" onClick={() => openRoomDetail(room)} title="ดูรายละเอียดห้อง">
                              {room.room_number}
                            </button>
                          </td>
                          <td>
                            <span className={`admin-badge status-${room.is_booked ? 'booked' : 'vacant'}`}>
                              {room.is_booked ? 'ไม่ว่าง' : 'ว่าง'}
                            </span>
                          </td>
                          <td className="admin-price-cell">฿{formatCurrency(room.price)}</td>
                          <td className="admin-col-optional admin-amenities-cell">
                            <AmenitiesList room={room} />
                          </td>
                          <td>{room.customer_id ? `${room.first_name} ${room.last_name}` : '-'}</td>
                          <td className="admin-col-optional">
                            <div className="admin-row-actions">
                              <button type="button" className="admin-action-btn is-view" onClick={() => openRoomDetail(room)}>
                                รายละเอียด
                              </button>
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditRoom(room)}>
                                แก้ไข
                              </button>
                              <button type="button" className="admin-action-btn is-danger" onClick={() => setRoomDeleteConfirm(room)}>
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                        <ExpandToggleRow
                          open={expandedRoomRows.has(room.room_number)}
                          colSpan={6}
                          onClick={() => toggleRoomRow(room.room_number)}
                        />
                        <DetailRow
                          open={expandedRoomRows.has(room.room_number)}
                          colSpan={6}
                          fields={[
                            { label: 'สิ่งอำนวยความสะดวก', value: <AmenitiesList room={room} /> },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-action-btn is-view" onClick={() => openRoomDetail(room)}>
                                    รายละเอียด
                                  </button>
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditRoom(room)}>
                                    แก้ไข
                                  </button>
                                  <button type="button" className="admin-action-btn is-danger" onClick={() => setRoomDeleteConfirm(room)}>
                                    ลบ
                                  </button>
                                </div>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={currentRoomsPage} totalPages={roomsTotalPages} onChange={setRoomsPage} />
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายการพนักงาน</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="staff-search">
                  ค้นหา
                </label>
                <input
                  id="staff-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาชื่อ, เบอร์โทร, บัตร ปชช..."
                  value={staffSearch}
                  onChange={(event) => {
                    setStaffSearch(event.target.value)
                    setStaffPage(1)
                  }}
                />
              </div>
              <div className="admin-filters">
                <button type="button" className="admin-action-btn is-primary" onClick={openCreateStaff}>
                  + เพิ่มพนักงาน
                </button>
              </div>
            </div>

            {staffError && <div className="alert alert-danger">{staffError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>ชื่อ-นามสกุล</th>
                    <th className="admin-col-optional">บัตรประชาชน</th>
                    <th>เบอร์โทร</th>
                    <th className="admin-col-optional">อายุ</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {staffLoading ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        ไม่พบข้อมูลพนักงาน
                      </td>
                    </tr>
                  ) : (
                    paginatedStaff.map((member) => (
                      <Fragment key={member.id}>
                        <tr>
                          <td className="admin-strong-cell">
                            {member.first_name} {member.last_name}
                          </td>
                          <td className="admin-col-optional">
                            <button
                              type="button"
                              className="admin-idcard-toggle"
                              onClick={() => toggleStaffIdCardReveal(member.id)}
                            >
                              {revealedStaffIdCards.has(member.id) ? member.idcard : '•'.repeat(String(member.idcard || '').length || 13)}
                            </button>
                          </td>
                          <td>{member.phone}</td>
                          <td className="admin-col-optional">{member.age}</td>
                          <td>
                            <span className={`admin-badge status-${member.is_suspended ? 'suspended' : 'active'}`}>
                              {member.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                            </span>
                          </td>
                          <td className="admin-col-optional">
                            <div className="admin-row-actions">
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditStaff(member)}>
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                className={`admin-action-btn ${member.is_suspended ? 'is-success' : 'is-warning'}`}
                                onClick={() => setStaffSuspendConfirm(member)}
                              >
                                {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                              </button>
                              <button type="button" className="admin-action-btn is-danger" onClick={() => setStaffDeleteConfirm(member)}>
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                        <ExpandToggleRow open={expandedStaffRows.has(member.id)} colSpan={6} onClick={() => toggleStaffRow(member.id)} />
                        <DetailRow
                          open={expandedStaffRows.has(member.id)}
                          colSpan={6}
                          fields={[
                            {
                              label: 'บัตรประชาชน',
                              value: (
                                <button type="button" className="admin-idcard-toggle" onClick={() => toggleStaffIdCardReveal(member.id)}>
                                  {revealedStaffIdCards.has(member.id) ? member.idcard : '•'.repeat(String(member.idcard || '').length || 13)}
                                </button>
                              ),
                            },
                            { label: 'อายุ', value: member.age },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditStaff(member)}>
                                    แก้ไข
                                  </button>
                                  <button
                                    type="button"
                                    className={`admin-action-btn ${member.is_suspended ? 'is-success' : 'is-warning'}`}
                                    onClick={() => setStaffSuspendConfirm(member)}
                                  >
                                    {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                                  </button>
                                  <button type="button" className="admin-action-btn is-danger" onClick={() => setStaffDeleteConfirm(member)}>
                                    ลบ
                                  </button>
                                </div>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={currentStaffPage} totalPages={staffTotalPages} onChange={setStaffPage} />
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายการลูกค้า</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="customer-search">
                  ค้นหา
                </label>
                <input
                  id="customer-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาชื่อ, เบอร์โทร, เลขห้อง, บัตร ปชช..."
                  value={customerSearch}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value)
                    setCustomersPage(1)
                  }}
                />
              </div>
              <div className="admin-filter-group">
                <label className="admin-toolbar-label" htmlFor="customer-status-filter">
                  สถานะ
                </label>
                <select
                  id="customer-status-filter"
                  className="form-select admin-filter-select"
                  value={customerStatusFilter}
                  onChange={(event) => {
                    setCustomerStatusFilter(event.target.value)
                    setCustomersPage(1)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="active">ใช้งานปกติ</option>
                  <option value="suspended">ระงับการใช้งาน</option>
                </select>
              </div>
            </div>

            {customersError && <div className="alert alert-danger">{customersError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>ลูกค้า</th>
                    <th className="admin-col-optional">บัตรประชาชน</th>
                    <th>ห้อง</th>
                    <th className="admin-col-optional">ระยะเวลาสัญญา</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">การดำเนินการ</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {customersLoading ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        ไม่พบข้อมูลลูกค้า
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map((customer) => (
                      <Fragment key={customer.id}>
                        <tr
                          className="moveout-row"
                          tabIndex={0}
                          aria-label={`ดูประวัติการเช่าของ ${customer.first_name} ${customer.last_name}`}
                          onClick={() => openCustomerDetail(customer)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openCustomerDetail(customer)
                            }
                          }}
                        >
                          <td>
                            <div className="moveout-cell-person">
                              <span className={`moveout-cell-avatar${customer.is_suspended ? '' : ' is-active'}`} aria-hidden="true">
                                <RoomDetailIcon type="user" size={17} />
                              </span>
                              <div>
                                <strong>{customer.first_name} {customer.last_name}</strong>
                                <span>
                                  <RoomDetailIcon type="phone" size={11} />
                                  {customer.phone || '-'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="admin-col-optional">
                            <button
                              type="button"
                              className="admin-idcard-toggle"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleCustomerIdCardReveal(customer.id)
                              }}
                            >
                              {revealedCustomerIdCards.has(customer.id) ? customer.idcard : '•'.repeat(String(customer.idcard || '').length || 13)}
                            </button>
                          </td>
                          <td>
                            {customer.room_number ? (
                              <span className="moveout-cell-room">
                                <RoomDetailIcon type="home" size={13} />
                                {customer.room_number}
                              </span>
                            ) : (
                              <span className="admin-cell-empty">-</span>
                            )}
                          </td>
                          <td className="admin-col-optional">
                            <RentalPeriodCell start={customer.rental_start_date} end={customer.rental_end_date} />
                          </td>
                          <td>
                            <span className={`admin-badge status-${customer.is_suspended ? 'suspended' : 'active'}`}>
                              {customer.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                            </span>
                            {Boolean(customer.is_suspended) && !customer.rental_start_date && !customer.rental_end_date && (
                              <p className="admin-status-hint">ย้ายออกจากหอพักแล้ว</p>
                            )}
                          </td>
                          <td className="admin-col-optional">
                            <div className="admin-row-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditCustomer(customer)}>
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                className={`admin-action-btn ${customer.is_suspended ? 'is-success' : 'is-warning'}`}
                                onClick={() => setCustomerSuspendConfirm(customer)}
                              >
                                {customer.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                              </button>
                            </div>
                          </td>
                          <td className="moveout-cell-chevron" aria-hidden="true">
                            <span>
                              ดูรายละเอียด
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </span>
                          </td>
                        </tr>
                        <ExpandToggleRow
                          open={expandedCustomerRows.has(customer.id)}
                          colSpan={7}
                          onClick={() => toggleCustomerRow(customer.id)}
                        />
                        <DetailRow
                          open={expandedCustomerRows.has(customer.id)}
                          colSpan={7}
                          fields={[
                            {
                              label: 'บัตรประชาชน',
                              value: (
                                <button type="button" className="admin-idcard-toggle" onClick={() => toggleCustomerIdCardReveal(customer.id)}>
                                  {revealedCustomerIdCards.has(customer.id) ? customer.idcard : '•'.repeat(String(customer.idcard || '').length || 13)}
                                </button>
                              ),
                            },
                            { label: 'เบอร์โทร', value: customer.phone },
                            {
                              label: 'ระยะเวลาสัญญา',
                              value: <RentalPeriodCell start={customer.rental_start_date} end={customer.rental_end_date} />,
                            },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openCustomerDetail(customer)}>
                                    ดูรายละเอียด
                                  </button>
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditCustomer(customer)}>
                                    แก้ไข
                                  </button>
                                  <button
                                    type="button"
                                    className={`admin-action-btn ${customer.is_suspended ? 'is-success' : 'is-warning'}`}
                                    onClick={() => setCustomerSuspendConfirm(customer)}
                                  >
                                    {customer.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                                  </button>
                                </div>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={currentCustomersPage} totalPages={customersTotalPages} onChange={setCustomersPage} />
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>ประวัติคำขอผู้เช่า</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="request-search">
                  ค้นหา
                </label>
                <input
                  id="request-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อ, ผู้อนุมัติ..."
                  value={requestSearch}
                  onChange={(event) => setRequestSearch(event.target.value)}
                />
              </div>
              <div className="admin-filter-group">
                <label className="admin-toolbar-label" htmlFor="request-status-filter">
                  สถานะ
                </label>
                <select
                  id="request-status-filter"
                  className="form-select admin-filter-select"
                  value={requestStatusFilter}
                  onChange={(event) => {
                    setRequestStatusFilter(event.target.value)
                    loadRequestLogs(1, event.target.value, requestSearch)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="in_progress">รับเรื่องแล้ว</option>
                  <option value="approved">อนุมัติแล้ว</option>
                  <option value="rejected">ปฏิเสธแล้ว</option>
                </select>
              </div>
            </div>

            {requestLogsError && <div className="alert alert-danger">{requestLogsError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>คำขอ</th>
                    <th>ห้อง</th>
                    <th>ผู้เช่า</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">รับเรื่องโดย</th>
                    <th className="admin-col-optional">เสร็จสิ้นโดย</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {requestLogsLoading ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : requestLogs.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        ไม่พบประวัติคำขอ
                      </td>
                    </tr>
                  ) : (
                    requestLogs.items.map((request) => (
                      <Fragment key={request.id}>
                        <tr
                          className="moveout-row"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดคำขอ${REQUEST_TYPE_LABEL[request.type] || ''} ห้อง ${request.room_number}`}
                          onClick={() => setRequestDetail(request)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setRequestDetail(request)
                            }
                          }}
                        >
                          <td>
                            <div className={`request-cell-type is-${request.type}`}>
                              <span className="request-cell-type-icon">
                                <RoomDetailIcon type={request.type === 'renew' ? 'calendar' : request.type === 'move_room' ? 'history' : 'door'} size={16} />
                              </span>
                              <div>
                                <strong>{REQUEST_TYPE_LABEL[request.type] || request.type}</strong>
                                <span>{formatDateTime(request.created_at)}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            {request.type === 'move_room' ? (
                              <span className="request-cell-rooms">
                                <span className="moveout-cell-room">{request.room_number}</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <line x1="4" y1="12" x2="20" y2="12" />
                                  <polyline points="14 6 20 12 14 18" />
                                </svg>
                                <span className="moveout-cell-room is-target">{request.target_room_number || '-'}</span>
                              </span>
                            ) : (
                              <span className="moveout-cell-room">
                                <RoomDetailIcon type="home" size={13} />
                                {request.room_number}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="moveout-cell-person">
                              <span className="moveout-cell-avatar" aria-hidden="true"><RoomDetailIcon type="user" size={17} /></span>
                              <div>
                                <strong>{request.first_name} {request.last_name}</strong>
                                <span>
                                  <RoomDetailIcon type="phone" size={11} />
                                  {request.phone || '-'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`admin-badge status-${request.status}`}>{REQUEST_STATUS_LABEL[request.status] || request.status}</span>
                          </td>
                          <td className="admin-col-optional">
                            <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} />
                          </td>
                          <td className="admin-col-optional">
                            <StaffActionCell name={request.completed_by_name} date={request.completed_at} />
                          </td>
                          <td className="moveout-cell-chevron" aria-hidden="true">
                            <span>
                              ดูรายละเอียด
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </span>
                          </td>
                        </tr>
                        <ExpandToggleRow open={expandedRequestRows.has(request.id)} colSpan={7} onClick={() => toggleRequestRow(request.id)} />
                        <DetailRow
                          open={expandedRequestRows.has(request.id)}
                          colSpan={7}
                          fields={[
                            { label: 'รับเรื่องโดย', value: <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} /> },
                            { label: 'เสร็จสิ้นโดย', value: <StaffActionCell name={request.completed_by_name} date={request.completed_at} /> },
                            { label: 'ขั้นตอนการดำเนินการ', value: <AdminRequestTimeline kind="tenant" request={request} /> },
                            {
                              label: 'รายละเอียด',
                              value: (
                                <button type="button" className="admin-action-btn is-view" onClick={() => setRequestDetail(request)}>
                                  ดูรายละเอียดทั้งหมด
                                </button>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={requestLogs.page} totalPages={requestLogsTotalPages} onChange={(page) => loadRequestLogs(page, requestStatusFilter, requestSearch)} />
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>ประวัติแจ้งซ่อม</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="maintenance-search">
                  ค้นหา
                </label>
                <input
                  id="maintenance-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาเลขห้อง, ชื่อ, ผู้ดำเนินการ..."
                  value={maintenanceSearch}
                  onChange={(event) => setMaintenanceSearch(event.target.value)}
                />
              </div>
              <div className="admin-filter-group">
                <label className="admin-toolbar-label" htmlFor="maintenance-status-filter">
                  สถานะ
                </label>
                <select
                  id="maintenance-status-filter"
                  className="form-select admin-filter-select"
                  value={maintenanceStatusFilter}
                  onChange={(event) => {
                    setMaintenanceStatusFilter(event.target.value)
                    loadMaintenanceLogs(1, event.target.value, maintenanceSearch)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="in_progress">กำลังดำเนินการ</option>
                  <option value="done">เสร็จสิ้น</option>
                  <option value="cancelled">ยกเลิกแล้ว</option>
                </select>
              </div>
            </div>

            {maintenanceLogsError && <div className="alert alert-danger">{maintenanceLogsError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>รายการแจ้งซ่อม</th>
                    <th>ห้อง</th>
                    <th>ผู้แจ้ง</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">รับเรื่องโดย</th>
                    <th className="admin-col-optional">เสร็จสิ้นโดย</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {maintenanceLogsLoading ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : maintenanceLogs.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        ไม่พบประวัติแจ้งซ่อม
                      </td>
                    </tr>
                  ) : (
                    maintenanceLogs.items.map((request) => {
                      const category = MAINTENANCE_CATEGORY_LABEL[request.category] ? request.category : 'other'
                      return (
                      <Fragment key={request.id}>
                        <tr
                          className="moveout-row"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดแจ้งซ่อม ห้อง ${request.room_number}`}
                          onClick={() => setMaintenanceDetail(request)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setMaintenanceDetail(request)
                            }
                          }}
                        >
                          <td>
                            <div className="request-cell-type maintenance-log-cell">
                              <span className={`request-cell-type-icon room-detail-row-icon category-${category}`}>
                                <MaintenanceCategoryIcon category={category} size={16} />
                              </span>
                              <div>
                                <strong title={request.description}>{request.description || MAINTENANCE_CATEGORY_LABEL[category]}</strong>
                                <span>{MAINTENANCE_CATEGORY_LABEL[category]} · {formatDateTime(request.created_at)}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="moveout-cell-room">
                              <RoomDetailIcon type="home" size={13} />
                              {request.room_number}
                            </span>
                          </td>
                          <td>
                            <div className="moveout-cell-person">
                              <span className="moveout-cell-avatar" aria-hidden="true"><RoomDetailIcon type="user" size={17} /></span>
                              <div>
                                <strong>{request.first_name} {request.last_name}</strong>
                                <span>
                                  <RoomDetailIcon type="phone" size={11} />
                                  {request.contact_phone || request.phone || '-'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`admin-badge status-${request.status}`}>
                              {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
                            </span>
                          </td>
                          <td className="admin-col-optional">
                            <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} />
                          </td>
                          <td className="admin-col-optional">
                            <StaffActionCell name={request.completed_by_name} date={request.completed_at} />
                          </td>
                          <td className="moveout-cell-chevron" aria-hidden="true">
                            <span>
                              ดูรายละเอียด
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </span>
                          </td>
                        </tr>
                        <ExpandToggleRow
                          open={expandedMaintenanceRows.has(request.id)}
                          colSpan={7}
                          onClick={() => toggleMaintenanceRow(request.id)}
                        />
                        <DetailRow
                          open={expandedMaintenanceRows.has(request.id)}
                          colSpan={7}
                          fields={[
                            { label: 'หมวดหมู่', value: <MaintenanceCategoryBadge category={request.category} /> },
                            { label: 'รับเรื่องโดย', value: <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} /> },
                            { label: 'เสร็จสิ้นโดย', value: <StaffActionCell name={request.completed_by_name} date={request.completed_at} /> },
                            { label: 'ขั้นตอนการดำเนินการ', value: <AdminRequestTimeline kind="maintenance" request={request} /> },
                            {
                              label: 'รายละเอียด',
                              value: (
                                <button type="button" className="admin-action-btn is-view" onClick={() => setMaintenanceDetail(request)}>
                                  ดูรายละเอียดทั้งหมด
                                </button>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={maintenanceLogs.page}
              totalPages={maintenanceLogsTotalPages}
              onChange={(page) => loadMaintenanceLogs(page, maintenanceStatusFilter, maintenanceSearch)}
            />
          </div>
        )}

        {activeTab === 'moveouts' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายชื่อผู้ย้ายออก</h2>
            </div>

            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="moveout-search">
                  ค้นหา
                </label>
                <input
                  id="moveout-search"
                  type="text"
                  className="form-control admin-search-input"
                  placeholder="ค้นหาชื่อ, เลขห้อง, บัตร ปชช..."
                  value={moveoutSearch}
                  onChange={(event) => setMoveoutSearch(event.target.value)}
                />
              </div>
            </div>

            {moveoutLogsError && <div className="alert alert-danger">{moveoutLogsError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>ผู้เช่า</th>
                    <th className="admin-col-optional">บัตรประชาชน</th>
                    <th>ห้อง</th>
                    <th className="admin-col-optional">วันที่เข้าพัก</th>
                    <th>วันที่ย้ายออก</th>
                    <th>รวมวันที่พัก</th>
                    <th className="admin-col-optional">ดำเนินการโดย</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {moveoutLogsLoading ? (
                    <tr>
                      <td colSpan={8} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : moveoutLogs.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="admin-empty">
                        ไม่พบรายชื่อผู้ย้ายออก
                      </td>
                    </tr>
                  ) : (
                    moveoutLogs.items.map((moveout) => {
                      const stayDays = calcStayDays(moveout.move_in_date, moveout.completed_at)
                      return (
                      <Fragment key={moveout.id}>
                        <tr
                          className="moveout-row"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดการย้ายออกของ ${moveout.first_name} ${moveout.last_name}`}
                          onClick={() => openMoveoutDetail(moveout)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openMoveoutDetail(moveout)
                            }
                          }}
                        >
                          <td>
                            <div className="moveout-cell-person">
                              <span className="moveout-cell-avatar" aria-hidden="true"><RoomDetailIcon type="user" size={17} /></span>
                              <div>
                                <strong>{moveout.first_name} {moveout.last_name}</strong>
                                <span>
                                  <RoomDetailIcon type="phone" size={11} />
                                  {moveout.phone || '-'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="admin-col-optional">
                            <button
                              type="button"
                              className="admin-idcard-toggle"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleMoveoutIdCardReveal(moveout.id)
                              }}
                            >
                              {revealedMoveoutIdCards.has(moveout.id) ? moveout.idcard : '•'.repeat(String(moveout.idcard || '').length || 13)}
                            </button>
                          </td>
                          <td>
                            <span className="moveout-cell-room">
                              <RoomDetailIcon type="home" size={13} />
                              {moveout.room_number}
                            </span>
                          </td>
                          <td className="admin-col-optional">
                            <div className="moveout-cell-date">
                              <strong>{formatDate(moveout.move_in_date)}</strong>
                              <span>เข้าพัก</span>
                            </div>
                          </td>
                          <td>
                            <div className="moveout-cell-date">
                              <strong>{formatDate(moveout.completed_at)}</strong>
                              <span>
                                {moveout.completed_at
                                  ? `${new Date(moveout.completed_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                                  : '-'}
                              </span>
                            </div>
                          </td>
                          <td>
                            {stayDays !== null ? (
                              <span className="room-detail-chip is-stay">
                                <RoomDetailIcon type="clock" size={11} />
                                {stayDays} วัน
                              </span>
                            ) : (
                              <span className="admin-cell-empty">-</span>
                            )}
                          </td>
                          <td className="admin-col-optional">
                            <ActorName name={moveout.completed_by_name} />
                          </td>
                          <td className="moveout-cell-chevron" aria-hidden="true">
                            <span>
                              ดูรายละเอียด
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </span>
                          </td>
                        </tr>
                        <ExpandToggleRow
                          open={expandedMoveoutRows.has(moveout.id)}
                          colSpan={8}
                          onClick={() => toggleMoveoutRow(moveout.id)}
                        />
                        <DetailRow
                          open={expandedMoveoutRows.has(moveout.id)}
                          colSpan={8}
                          fields={[
                            {
                              label: 'บัตรประชาชน',
                              value: (
                                <button type="button" className="admin-idcard-toggle" onClick={() => toggleMoveoutIdCardReveal(moveout.id)}>
                                  {revealedMoveoutIdCards.has(moveout.id) ? moveout.idcard : '•'.repeat(String(moveout.idcard || '').length || 13)}
                                </button>
                              ),
                            },
                            { label: 'เบอร์โทร', value: moveout.phone },
                            { label: 'วันที่เข้าพัก', value: formatDate(moveout.move_in_date) },
                            { label: 'รวมวันที่พัก', value: stayDays !== null ? `${stayDays} วัน` : '-' },
                            { label: 'ดำเนินการโดย', value: <ActorName name={moveout.completed_by_name} /> },
                            ...(moveout.note ? [{ label: 'หมายเหตุ', value: moveout.note }] : []),
                            {
                              label: 'รายละเอียด',
                              value: (
                                <button type="button" className="admin-action-btn is-view" onClick={() => openMoveoutDetail(moveout)}>
                                  ดูรายละเอียดทั้งหมด
                                </button>
                              ),
                            },
                          ]}
                        />
                      </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={moveoutLogs.page}
              totalPages={moveoutLogsTotalPages}
              onChange={(page) => loadMoveoutLogs(page, moveoutSearch)}
            />
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>รายจ่าย</h2>
              <button type="button" className="admin-action-btn is-primary" onClick={openCreateExpense}>
                + บันทึกรายจ่าย
              </button>
            </div>

            {expensesError && <div className="alert alert-danger">{expensesError}</div>}

            <div className="table-responsive">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>หมวดหมู่</th>
                    <th className="admin-col-optional">รายละเอียด</th>
                    <th className="admin-col-optional">บันทึกโดย</th>
                    <th>จำนวนเงิน</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {expensesLoading ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty">
                        ยังไม่มีรายการรายจ่าย
                      </td>
                    </tr>
                  ) : (
                    expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{formatDate(expense.expense_date)}</td>
                        <td className="admin-strong-cell">{expense.category}</td>
                        <td className="admin-col-optional">{expense.description || '-'}</td>
                        <td className="admin-col-optional">
                          <ActorName name={expense.recorded_by_name} />
                        </td>
                        <td>฿{Number(expense.amount).toLocaleString('th-TH')}</td>
                        <td>
                          <div className="admin-row-actions">
                            <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditExpense(expense)}>
                              แก้ไข
                            </button>
                            <button type="button" className="admin-action-btn is-danger" onClick={() => removeExpense(expense)}>
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={expensesPage} totalPages={expensesTotalPages} onChange={(page) => loadExpenses(page)} />
          </div>
        )}

        {activeTab === 'waiting-list' && (
          <WaitingListPanel
            items={waitingList}
            now={waitingNow}
            vacantCount={summary.vacantRooms}
            onAdd={() => openWaitingListForm()}
            onDetail={(entry) => { setWaitingListActionError(''); setWaitingListDetail(entry) }}
            onEdit={openWaitingListForm}
            onDelete={(entry) => { setWaitingListDeleteError(''); setWaitingListDelete(entry) }}
            onStatusChange={setWaitingListEntryStatus}
            statusBusyId={waitingListStatusBusyId}
          />
        )}

        {activeTab === 'move-out-inspections' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2>ผลตรวจห้อง ({moveOutInspections.length})</h2>
                <p className="waiting-list-storage-note">รวมผลตรวจห้องตอนย้ายออก และผลตรวจห้องเดิมก่อนอนุมัติย้ายห้อง</p>
              </div>
              <button type="button" className="admin-action-btn is-primary" onClick={openCreateInspection}>
                + เพิ่มผลตรวจก่อนย้ายห้อง
              </button>
            </div>
            <div className="admin-toolbar">
              <div className="admin-search-group">
                <label className="admin-toolbar-label" htmlFor="inspection-search">ค้นหา</label>
                <input
                  id="inspection-search"
                  type="search"
                  className="form-control admin-search-input"
                  placeholder="เลขห้อง, ผู้เช่า, ผู้ตรวจ, รายละเอียด..."
                  value={inspectionSearch}
                  onChange={(event) => setInspectionSearch(event.target.value)}
                />
              </div>
              <div className="admin-toolbar-filters">
                <div className="admin-filter-group">
                  <label className="admin-toolbar-label" htmlFor="inspection-kind-filter">ประเภท</label>
                  <select
                    id="inspection-kind-filter"
                    className="form-select admin-filter-select"
                    value={inspectionKind}
                    onChange={(event) => setInspectionKind(event.target.value)}
                  >
                    <option value="all">ทุกประเภท ({moveOutInspections.length})</option>
                    {Object.entries(ADMIN_INSPECTION_KINDS).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.label} ({inspectionKindCounts[key] || 0})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-filter-group">
                  <label className="admin-toolbar-label" htmlFor="inspection-result-filter">ผลตรวจ</label>
                  <select
                    id="inspection-result-filter"
                    className="form-select admin-filter-select"
                    value={inspectionResultFilter}
                    onChange={(event) => setInspectionResultFilter(event.target.value)}
                  >
                    <option value="all">ทุกผลตรวจ ({kindInspections.length})</option>
                    {Object.entries(INSPECTION_TONE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label} ({inspectionToneCounts[value] || 0})
                      </option>
                    ))}
                  </select>
                </div>
                {inspectionKind !== 'move_room' && (
                  <div className="admin-filter-group">
                    <label className="admin-toolbar-label" htmlFor="inspection-status-filter">สถานะ</label>
                    <select
                      id="inspection-status-filter"
                      className="form-select admin-filter-select"
                      value={inspectionStatusFilter}
                      onChange={(event) => setInspectionStatusFilter(event.target.value)}
                    >
                      <option value="all">ทุกสถานะ</option>
                      {Object.entries(MOVE_OUT_INSPECTION_STATUS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="table-responsive">
              <table className="table admin-table admin-inspection-table insp-table">
                <colgroup>
                  <col className="is-room" />
                  <col className="is-tenant" />
                  <col className="is-date" />
                  <col className="is-result" />
                  <col className="is-inspector" />
                  <col className="is-photos" />
                  <col className="is-status" />
                  <col className="is-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>ห้อง</th>
                    <th>ผู้เช่า</th>
                    <th>วันที่ตรวจ</th>
                    <th>ผลตรวจ</th>
                    <th>ผู้ตรวจ</th>
                    <th>รูป</th>
                    <th>สถานะ</th>
                    <th className="admin-inspection-actions">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInspections.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="admin-empty">
                        {kindInspections.length ? 'ไม่พบผลตรวจตามเงื่อนไข' : inspectionKind === 'all' ? 'ยังไม่มีผลตรวจห้อง' : ADMIN_INSPECTION_KINDS[inspectionKind].empty}
                      </td>
                    </tr>
                  ) : (
                    filteredInspections.map((inspection) => {
                      const summary = summarizeInspection(inspection.checklist)
                      const issueCount = summary.counts.damaged + summary.counts.missing
                      return (
                        <tr
                          key={inspection.id}
                          className="moveout-row"
                          tabIndex={0}
                          aria-label={`ดูผลตรวจห้อง ${inspection.room_number}`}
                          onClick={() => openInspectionDetail(inspection)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openInspectionDetail(inspection)
                            }
                          }}
                        >
                          <td>
                            <InspectionRoomCell
                              roomNumber={inspection.room_number}
                              targetRoomNumber={inspection.target_room_number}
                              isMoveRoom={Boolean(inspection.tenant_request_id)}
                            />
                          </td>
                          <td>
                            <InspectionPersonCell name={inspection.tenant_name} phone={inspection.tenant_phone} />
                          </td>
                          <td>
                            <InspectionDateCell value={inspection.created_at} />
                          </td>
                          <td>
                            <div className="admin-inspection-result">
                              <span className={`inspection-result is-${summary.tone}`}>
                                {INSPECTION_TONE_LABEL[summary.tone]}
                                {issueCount > 0 && ` ${issueCount} ข้อ`}
                              </span>
                            </div>
                          </td>
                          <td>
                            <InspectionInspectorCell name={inspection.inspected_by} className="admin-actor-inline" />
                          </td>
                          <td>
                            <InspectionPhotosCell count={inspection.photo_count} />
                          </td>
                          <td>
                            {inspection.tenant_request_id ? (
                              <span className="insp-status-badge is-reviewed">Staff ตรวจแล้ว</span>
                            ) : (
                              <span className={`insp-status-badge is-${inspection.status || 'pending'}`}>
                                {MOVE_OUT_INSPECTION_STATUS[inspection.status || 'pending']}
                              </span>
                            )}
                          </td>
                          <td className="admin-inspection-actions">
                            <div className="insp-actions">
                              {!inspection.tenant_request_id && (
                                <div
                                  className="insp-actions-row"
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => event.stopPropagation()}
                                >
                                  <InspectionStatusActions
                                    status={inspection.status || 'pending'}
                                    onChange={(next) => setInspectionConfirm({ kind: 'status', inspection, next })}
                                  />
                                </div>
                              )}
                              {inspection.tenant_request_id && (
                                <div
                                  className="insp-actions-row"
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="insp-status-action is-edit"
                                    disabled={inspectionEditLoadingId === inspection.id}
                                    onClick={() => openEditInspectionFromRow(inspection)}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />
                                    </svg>
                                    {inspectionEditLoadingId === inspection.id ? 'กำลังโหลด...' : 'แก้ไข'}
                                  </button>
                                </div>
                              )}
                              <span className="insp-actions-hint" aria-hidden="true">
                                ดูรายละเอียด
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M9 18l6-6-6-6" />
                                </svg>
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {moveoutDetail && (
        <Modal title={`รายละเอียดการย้ายออก - ห้อง ${moveoutDetail.row.room_number}`} onClose={() => setMoveoutDetail(null)} variant="moveout-detail">
          <MoveoutDetail
            row={moveoutDetail.row}
            detail={moveoutDetail.data}
            loading={moveoutDetail.loading}
            error={moveoutDetail.error}
            onRetry={() => openMoveoutDetail(moveoutDetail.row)}
            onOpenInspection={openInspectionDetail}
            onSelectPayment={(payment) => {
              const source = moveoutDetail.data?.moveout || moveoutDetail.row
              setPaymentDetail({
                ...payment,
                roomNumber: source.room_number,
                tenant: { first_name: source.first_name, last_name: source.last_name },
                tenantName: `${source.first_name} ${source.last_name}`,
              })
            }}
            idcardRevealed={revealedMoveoutIdCards.has(moveoutDetail.row.id)}
            onToggleIdCard={() => toggleMoveoutIdCardReveal(moveoutDetail.row.id)}
          />
        </Modal>
      )}

      {inspectionDetail && (
        <Modal title={`ผลตรวจห้อง ${inspectionDetail.room_number}`} onClose={() => { setPhotoPreview(null); setPhotoGalleryPage(null); setInspectionDetail(null) }} variant="inspection-detail">
          {() => {
            const isMoveRoom = Boolean(inspectionDetail.tenant_request_id)
            const status = isMoveRoom ? 'reviewed' : inspectionDetail.status || 'pending'
            return (
              <InspectionDetail
                inspection={inspectionDetail}
                statusLabel={isMoveRoom ? 'Staff ตรวจแล้ว' : MOVE_OUT_INSPECTION_STATUS[status]}
                statusTone={status}
                actorClassName="admin-actor-inline"
                photoLimit={INSPECTION_PHOTO_PREVIEW_COUNT}
                onOpenPhoto={showPhoto}
                onOpenGallery={() => setPhotoGalleryPage(1)}
                footer={
                  <footer className="idt-footer">
                    {!isMoveRoom && (
                      <button type="button" className="idt-footer-btn is-danger" onClick={() => removeMoveOutInspection(inspectionDetail)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                        ลบผลตรวจ
                      </button>
                    )}
                    {isMoveRoom && (
                      <div className="idt-footer-right">
                        <button type="button" className="idt-footer-btn is-primary" onClick={() => openEditInspectionForm(inspectionDetail)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />
                          </svg>
                          แก้ไขผลตรวจ
                        </button>
                      </div>
                    )}
                    {!isMoveRoom && (
                      <div className="idt-footer-right">
                        <span className="idt-footer-label">
                          สถานะตอนนี้
                          <span className={`insp-status-badge is-${status}`}>{MOVE_OUT_INSPECTION_STATUS[status]}</span>
                        </span>
                        <div className="idt-footer-actions">
                          <InspectionStatusActions
                            status={status}
                            size="lg"
                            onChange={(next) => setInspectionConfirm({ kind: 'status', inspection: inspectionDetail, next })}
                          />
                        </div>
                      </div>
                    )}
                  </footer>
                }
              />
            )
          }}
        </Modal>
      )}

      {inspectionEditor && (
        <Modal
          title={
            inspectionEditor.mode === 'create'
              ? 'เพิ่มผลตรวจห้องก่อนย้ายห้อง'
              : `แก้ไขผลตรวจห้อง ${inspectionEditor.initial?.room_number || ''}`
          }
          onClose={() => setInspectionEditor(null)}
          variant="inspection-form"
        >
          {(requestClose) => (
            <InspectionForm
              key={inspectionEditor.mode === 'create' ? `create-${inspectionEditor.candidates.length}` : `edit-${inspectionEditor.initial?.id}`}
              mode={inspectionEditor.mode}
              initial={inspectionEditor.initial}
              candidates={inspectionEditor.candidates}
              candidatesLoading={inspectionEditor.candidatesLoading}
              submitting={inspectionEditor.submitting}
              error={inspectionEditor.error}
              onCancel={() => setInspectionConfirm({ kind: 'cancel', close: requestClose })}
              onSubmit={(payload) => setInspectionConfirm({ kind: 'save', payload, close: requestClose })}
            />
          )}
        </Modal>
      )}

      {inspectionConfirm && (
        <Modal
          title={
            inspectionConfirm.kind === 'delete'
              ? 'ยืนยันการลบผลตรวจ'
              : inspectionConfirm.kind === 'status'
                ? 'ยืนยันการเปลี่ยนสถานะ'
                : inspectionConfirm.kind === 'save'
                ? 'ยืนยันการบันทึกผลตรวจ'
                : 'ยืนยันการยกเลิก'
          }
          onClose={() => {
            if (!inspectionConfirmBusy) setInspectionConfirm(null)
          }}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div
                className={`admin-confirm-icon ${
                  inspectionConfirm.kind === 'save' || (inspectionConfirm.kind === 'status' && inspectionConfirm.next === 'reviewed')
                    ? 'is-success'
                    : 'is-danger'
                }`}
              >
                {inspectionConfirm.kind === 'save' || (inspectionConfirm.kind === 'status' && inspectionConfirm.next === 'reviewed') ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                ) : inspectionConfirm.kind === 'delete' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5.5M12 16.5h.01" />
                  </svg>
                )}
              </div>
              <p className="admin-confirm-message">
                {inspectionConfirm.kind === 'delete'
                  ? `ต้องการลบผลตรวจห้อง ${inspectionConfirm.inspection.room_number} ใช่หรือไม่? ผลตรวจจะถูกซ่อนจากหน้าระบบ แต่ข้อมูลและรูปยังเก็บไว้`
                  : inspectionConfirm.kind === 'status'
                    ? inspectionConfirm.next === 'reviewed'
                      ? `ยืนยันว่าตรวจผลตรวจห้อง ${inspectionConfirm.inspection.room_number} เรียบร้อยแล้วใช่หรือไม่?`
                      : inspectionConfirm.next === 'follow_up'
                        ? `ต้องการตั้งผลตรวจห้อง ${inspectionConfirm.inspection.room_number} เป็น "ต้องติดตาม" ใช่หรือไม่?`
                        : `ต้องการยกเลิกสถานะและย้อนผลตรวจห้อง ${inspectionConfirm.inspection.room_number} กลับเป็น "รอ Admin ตรวจ" ใช่หรือไม่?`
                  : inspectionConfirm.kind === 'save'
                    ? inspectionEditor?.mode === 'create'
                      ? 'ต้องการบันทึกผลตรวจห้องนี้ใช่หรือไม่?'
                      : 'ต้องการบันทึกการแก้ไขผลตรวจห้องนี้ใช่หรือไม่?'
                    : 'ต้องการยกเลิกใช่หรือไม่? ข้อมูลที่กรอกไว้จะไม่ถูกบันทึก'}
              </p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" disabled={inspectionConfirmBusy} onClick={requestClose}>
                  {inspectionConfirm.kind === 'cancel' ? 'กลับไปแก้ไขต่อ' : 'ยกเลิก'}
                </button>
                <button
                  type="button"
                  className={`admin-action-btn ${
                    inspectionConfirm.kind === 'save' || (inspectionConfirm.kind === 'status' && inspectionConfirm.next === 'reviewed')
                      ? 'is-primary'
                      : inspectionConfirm.kind === 'status' && inspectionConfirm.next === 'follow_up'
                        ? 'is-warning'
                        : 'is-danger'
                  }`}
                  disabled={inspectionConfirmBusy}
                  onClick={async () => {
                    const current = inspectionConfirm
                    if (current.kind === 'cancel') {
                      requestClose()
                      current.close?.()
                      return
                    }
                    setInspectionConfirmBusy(true)
                    try {
                      if (current.kind === 'save') await submitInspectionEditor(current.payload, current.close)
                      else if (current.kind === 'status') await setMoveOutInspectionStatus(current.inspection, current.next)
                      else await deleteMoveOutInspection(current.inspection)
                    } finally {
                      setInspectionConfirmBusy(false)
                      requestClose()
                    }
                  }}
                >
                  {inspectionConfirmBusy
                    ? 'กำลังดำเนินการ...'
                    : inspectionConfirm.kind === 'delete'
                      ? 'ลบผลตรวจ'
                      : inspectionConfirm.kind === 'status'
                        ? inspectionConfirm.next === 'reviewed'
                          ? 'ยืนยันตรวจแล้ว'
                          : inspectionConfirm.next === 'follow_up'
                            ? 'ตั้งเป็นต้องติดตาม'
                            : 'ยืนยันยกเลิกสถานะ'
                      : inspectionConfirm.kind === 'save'
                        ? 'ยืนยันบันทึก'
                        : 'ยืนยันยกเลิก'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {inspectionDetail && photoGalleryPage !== null && (
        <Modal title={`รูปภาพประกอบทั้งหมด (${photoPreviewCount})`} onClose={() => setPhotoGalleryPage(null)} variant="gallery">
          <div className="moveout-inspection-admin-detail moveout-gallery">
            <div className="moveout-inspection-photo-grid moveout-gallery-grid">
              {inspectionDetail.photos
                .slice(galleryStart, galleryStart + INSPECTION_GALLERY_PAGE_SIZE)
                .map((photo, offset) => renderInspectionPhoto(photo, galleryStart + offset))}
            </div>
            <Pagination page={galleryPage} totalPages={galleryTotalPages} onChange={setPhotoGalleryPage} />
          </div>
        </Modal>
      )}

      {previewSource && photoPreview !== null && previewPhotos[photoPreview] && (
        <PhotoLightbox
          photos={previewPhotos}
          initialIndex={photoPreview}
          title={previewSource.title}
          subtitle={previewSource.subtitle}
          label={previewSource.label}
          onClose={() => {
            setPhotoPreview(null)
            setSlipPreview(null)
          }}
        />
      )}

      {requestDetail && (
        <Modal title="รายละเอียดคำขอผู้เช่า" onClose={() => setRequestDetail(null)} variant="moveout-detail">
          {() => {
            const request = requestDetail
            const priceDiff =
              request.type === 'move_room' && request.source_room_price != null && request.target_room_price != null
                ? Number(request.target_room_price) - Number(request.source_room_price)
                : null
            const typeLabel = REQUEST_TYPE_LABEL[request.type] || request.type
            const needsInspection = request.type === 'moveout' || request.type === 'move_room'
            const inspectionTone = !request.inspection_id
              ? 'warning'
              : request.inspection_status === 'reviewed'
                ? 'success'
                : request.inspection_status === 'follow_up'
                  ? 'danger'
                  : 'info'
            const tenantFacts = [
              { icon: 'user', label: 'ชื่อผู้เช่า', value: `${request.first_name || ''} ${request.last_name || ''}`.trim() || '-' },
              { icon: 'phone', label: 'เบอร์โทร', value: request.phone ? <a className="maintenance-detail-tel" href={`tel:${request.phone}`}>{request.phone}</a> : '-' },
              { icon: 'door', label: 'ห้องปัจจุบัน', value: `ห้อง ${request.room_number}` },
              { icon: 'wallet', label: 'เงินประกัน', value: request.deposit_amount != null ? `฿${formatCurrency(request.deposit_amount)}` : '-' },
            ]
            const requestFacts = [
              { icon: 'calendar', label: 'วันที่ส่งคำขอ', value: formatDateTime(request.created_at) },
              { icon: 'note', label: 'ประเภทคำขอ', value: typeLabel },
              ...(request.type === 'renew'
                ? [
                    {
                      icon: 'clock',
                      label: 'ระยะเวลาที่ขอต่อ',
                      value: RENEW_DURATION_LABEL[String(request.renew_duration_months)] || (request.renew_duration_months ? `${request.renew_duration_months} เดือน` : '-'),
                    },
                    { icon: 'wallet', label: 'รูปแบบการชำระ', value: RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type || '-' },
                  ]
                : []),
              ...(request.type === 'move_room'
                ? [
                    { icon: 'door', label: 'ห้องที่ต้องการย้ายไป', value: request.target_room_number ? `ห้อง ${request.target_room_number}` : '-' },
                    { icon: 'calendar', label: 'วันที่ต้องการย้าย', value: request.preferred_move_date ? formatDate(request.preferred_move_date) : '-' },
                    {
                      icon: 'wallet',
                      label: 'ค่าเช่าห้องเดิม → ห้องใหม่',
                      value: (
                        <>
                          {request.source_room_price != null ? `฿${formatCurrency(request.source_room_price)}` : '-'} →{' '}
                          {request.target_room_price != null ? `฿${formatCurrency(request.target_room_price)}` : '-'}
                          {priceDiff !== null && priceDiff !== 0 && (
                            <span className={`admin-request-diff ${priceDiff > 0 ? 'is-up' : 'is-down'}`}>
                              {priceDiff > 0 ? '+' : '−'}฿{formatCurrency(Math.abs(priceDiff))}/เดือน
                            </span>
                          )}
                        </>
                      ),
                    },
                    { icon: 'note', label: 'เหตุผลที่ย้าย', value: MOVE_ROOM_REASON_LABEL[request.move_reason] || request.move_reason || '-' },
                  ]
                : []),
              ...(request.type === 'moveout' && request.preferred_move_date
                ? [{ icon: 'calendar', label: 'วันที่ต้องการย้ายออก', value: formatDate(request.preferred_move_date) }]
                : []),
            ]

            return (
              <div className="moveout-detail request-detail">
                <div className={`request-detail-hero is-${request.status}`}>
                  <span className="request-detail-hero-icon">
                    <RoomDetailIcon type={request.type === 'renew' ? 'calendar' : 'door'} size={22} />
                  </span>
                  <div className="request-detail-hero-text">
                    <span>คำขอ{typeLabel}</span>
                    <strong>{request.first_name} {request.last_name}</strong>
                    <div className="request-detail-hero-meta">
                      <span className="moveout-cell-room">
                        <RoomDetailIcon type="home" size={13} />
                        ห้อง {request.room_number}
                      </span>
                      <span className={`admin-badge type-${request.type}`}>{typeLabel}</span>
                    </div>
                  </div>
                  <span className={`admin-badge status-${request.status}`}>{REQUEST_STATUS_LABEL[request.status] || request.status}</span>
                </div>

                <section className="payment-detail-section">
                  <h4><RoomDetailIcon type="user" size={16} />ข้อมูลผู้เช่า</h4>
                  <dl className="payment-detail-facts">
                    {tenantFacts.map((fact) => (
                      <div key={fact.label}>
                        <dt><RoomDetailIcon type={fact.icon} size={14} />{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="payment-detail-section">
                  <h4><RoomDetailIcon type="note" size={16} />รายละเอียดคำขอ</h4>
                  <dl className="payment-detail-facts">
                    {requestFacts.map((fact) => (
                      <div key={fact.label}>
                        <dt><RoomDetailIcon type={fact.icon} size={14} />{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>

                  {needsInspection && (
                    <div className={`request-detail-inspection is-${inspectionTone}`}>
                      <span className="request-detail-inspection-icon"><RoomDetailIcon type="clipboard" size={16} /></span>
                      <div>
                        <span>{request.type === 'moveout' ? 'ตรวจสภาพห้องก่อนย้ายออก' : 'ตรวจสภาพห้องเดิม'}</span>
                        <strong>{request.inspection_id ? MOVE_OUT_INSPECTION_STATUS[request.inspection_status] || 'ตรวจแล้ว' : 'ยังไม่ได้ตรวจห้อง'}</strong>
                      </div>
                    </div>
                  )}

                  <div className={`request-detail-note${request.note ? '' : ' is-empty'}`}>
                    <span className="request-detail-note-label">
                      <RoomDetailIcon type="note" size={14} />
                      {request.type === 'moveout' ? 'เหตุผล / รายละเอียดการย้ายออก' : 'หมายเหตุจากผู้เช่า'}
                    </span>
                    <p>{request.note || 'ผู้เช่าไม่ได้ระบุรายละเอียด'}</p>
                  </div>
                </section>

                <section className="payment-detail-section">
                  <h4><RoomDetailIcon type="user" size={16} />ผู้ดำเนินการ</h4>
                  <dl className="request-detail-actors">
                    <div>
                      <dt><RoomDetailIcon type="user" size={14} />รับเรื่องโดย</dt>
                      <dd><StaffActionCell name={request.accepted_by_name} date={request.accepted_at} /></dd>
                    </div>
                    <div>
                      <dt><RoomDetailIcon type="check" size={14} />{request.status === 'rejected' ? 'ปฏิเสธโดย' : 'เสร็จสิ้นโดย'}</dt>
                      <dd><StaffActionCell name={request.completed_by_name} date={request.completed_at} /></dd>
                    </div>
                  </dl>
                </section>

                <section className="payment-detail-section">
                  <h4><RoomDetailIcon type="history" size={16} />ขั้นตอนการดำเนินการ</h4>
                  <RequestSteps request={request} />
                </section>
              </div>
            )
          }}
        </Modal>
      )}

      {waitingListDetail && (
        <Modal title="รายละเอียดผู้รอห้องว่าง" onClose={() => setWaitingListDetail(null)} variant="waiting-detail">
          {(requestClose) => (
            <WaitingListDetails
              item={waitingList.find(entry => entry.id === waitingListDetail.id) || waitingListDetail}
              now={waitingNow}
              vacantRooms={rooms.filter(room => !room.is_booked).sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), 'th', { numeric: true }))}
              onClose={requestClose}
              onEdit={(entry) => { setWaitingListDetail(null); openWaitingListForm(entry) }}
              onStatusChange={setWaitingListEntryStatus}
              statusBusyId={waitingListStatusBusyId}
              actionError={waitingListActionError}
            />
          )}
        </Modal>
      )}

      {waitingListModal && (
        <Modal title={waitingListModal.mode === 'create' ? 'เพิ่มผู้สนใจเช่าห้อง' : 'แก้ไขรายชื่อผู้สนใจ'} onClose={() => setWaitingListModal(null)} variant="waiting-form">
          {(requestClose) => (
            <WaitingListForm value={waitingListForm} fieldErrors={waitingListFieldErrors} error={waitingListFormError} busy={waitingListSubmitting} editing={waitingListModal.mode === 'edit'} now={waitingNow} onChange={updateWaitingListField} onSubmit={(event) => submitWaitingListForm(event, requestClose)} onClose={requestClose} idPrefix="admin-waiting" />
          )}
        </Modal>
      )}

      {waitingListDelete && (
        <Modal title="ยืนยันการลบรายชื่อ" onClose={() => setWaitingListDelete(null)} variant="confirm">
          {(requestClose) => <WaitingListDelete item={waitingListDelete} busy={waitingListDeleting} error={waitingListDeleteError} onClose={requestClose} onConfirm={() => removeWaitingListEntry(requestClose)} />}
        </Modal>
      )}

      {expenseModal && (
        <Modal title={expenseModal.mode === 'create' ? 'บันทึกรายจ่าย' : 'แก้ไขรายจ่าย'} onClose={() => setExpenseModal(null)}>
          {(requestClose) => (
            <form onSubmit={(event) => submitExpenseForm(event, requestClose)} noValidate>
              {expenseFormError && <div className="alert alert-danger py-2 px-3">{expenseFormError}</div>}
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">หมวดหมู่</label>
                  <input
                    type="text"
                    name="category"
                    className="form-control"
                    value={expenseForm.category}
                    onChange={handleExpenseFormChange}
                    placeholder="เช่น ค่าน้ำ, ค่าไฟ, ซ่อมบำรุง"
                    required
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">รายละเอียด (ไม่บังคับ)</label>
                  <input type="text" name="description" className="form-control" value={expenseForm.description} onChange={handleExpenseFormChange} />
                </div>
                <div className="col-12">
                  <label className="form-label">จำนวนเงิน (บาท)</label>
                  <div className="admin-input-group">
                    <span className="admin-input-affix">฿</span>
                    <input type="number" step="0.01" min="0" name="amount" className="form-control" value={expenseForm.amount} onChange={handleExpenseFormChange} required />
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="admin-expense-date">วันที่</label>
                  <ThaiDatePicker
                    id="admin-expense-date"
                    value={expenseForm.expense_date}
                    onChange={(date) => setExpenseForm((prev) => ({ ...prev, expense_date: date }))}
                  />
                </div>
              </div>
              <div className="admin-form-actions">
                <button type="submit" className="admin-action-btn is-primary" disabled={expenseSubmitting}>
                  {expenseSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {roomDetail && (
        <Modal
          title={`รายละเอียดห้อง ${roomDetail.room.room_number}`}
          onClose={() => {
            setPaymentDetail(null)
            setRoomDetail(null)
          }}
          variant="room-detail"
        >
          {(requestClose) => (
            <RoomDetails
              room={roomDetail.room}
              detail={roomDetail.data}
              loading={roomDetail.loading}
              error={roomDetail.error}
              onRetry={() => openRoomDetail(roomDetail.room)}
              onOpenHistory={() => openRoomHistory(roomDetail.room)}
              onOpenTenants={(focusId) => openRoomTenants(roomDetail.room, focusId)}
              onOpenMaintenance={(focusId) => openRoomMaintenance(roomDetail.room, focusId)}
              onSelectPayment={(payment) => {
                const tenant = roomDetail.data?.tenant
                setPaymentDetail({
                  ...payment,
                  roomNumber: roomDetail.room.room_number,
                  tenant: tenant ? { first_name: tenant.first_name, last_name: tenant.last_name } : null,
                  tenantName: tenant ? `${tenant.first_name} ${tenant.last_name}` : '',
                })
              }}
              onEdit={() => {
                const room = roomDetail.data?.room ? { ...roomDetail.room, ...roomDetail.data.room } : roomDetail.room
                requestClose()
                openEditRoom(room)
              }}
            />
          )}
        </Modal>
      )}

      {roomMaintenance && (
        <Modal
          title={`ประวัติแจ้งซ่อม - ห้อง ${roomMaintenance.room.room_number}`}
          onClose={() => {
            setMaintenanceDetail(null)
            setRoomMaintenance(null)
          }}
          variant="room-history"
        >
          <RoomMaintenanceHistory
            requests={roomMaintenance.data}
            loading={roomMaintenance.loading}
            error={roomMaintenance.error}
            onRetry={() => openRoomMaintenance(roomMaintenance.room)}
            onSelect={setMaintenanceDetail}
            onPhotos={openMaintenancePhotos}
          />
        </Modal>
      )}

      {maintenanceDetail && (
        <Modal title={`รายละเอียดแจ้งซ่อม #${maintenanceDetail.id}`} onClose={() => setMaintenanceDetail(null)} variant="payment-detail">
          <MaintenanceDetail request={maintenanceDetail} onPhotos={openMaintenancePhotos} />
        </Modal>
      )}

      {roomTenants && (
        <Modal title={`ประวัติผู้เช่า - ห้อง ${roomTenants.room.room_number}`} onClose={() => setRoomTenants(null)} variant="room-history">
          <RoomTenantHistory
            tenants={roomTenants.data}
            roomNumber={roomTenants.room.room_number}
            loading={roomTenants.loading}
            error={roomTenants.error}
            focusId={roomTenants.focusId}
            onRetry={() => openRoomTenants(roomTenants.room, roomTenants.focusId)}
            onOpenPayments={(tenant) => openRoomHistory(roomTenants.room, `${tenant.first_name} ${tenant.last_name}`)}
          />
        </Modal>
      )}

      {roomHistory && (
        <Modal
          title={`ประวัติการจ่ายเงิน - ห้อง ${roomHistory.room.room_number}`}
          onClose={() => {
            setSlipPreview(null)
            setPhotoPreview(null)
            setPaymentDetail(null)
            setRoomHistory(null)
          }}
          variant="room-history"
        >
          <RoomPaymentHistory
            key={`${roomHistory.room.id}-${roomHistory.initialSearch || ''}`}
            initialSearch={roomHistory.initialSearch}
            history={roomHistory.data}
            loading={roomHistory.loading}
            error={roomHistory.error}
            onRetry={() => openRoomHistory(roomHistory.room)}
            onSlip={openSlipPreview}
            onSelect={(payment) => setPaymentDetail({ ...payment, roomNumber: roomHistory.room.room_number })}
          />
        </Modal>
      )}


      {roomModal && (
        <Modal title={roomModal.mode === 'create' ? 'เพิ่มห้องพัก' : `แก้ไขห้อง ${roomModal.room.room_number}`} onClose={() => setRoomModal(null)}>
          {(requestClose) => (
          <form onSubmit={(event) => submitRoomForm(event, requestClose)} noValidate>
            {roomFormError && <div className="alert alert-danger py-2 px-3">{roomFormError}</div>}

            <div className="admin-form-section">
              <p className="admin-form-section-title">ข้อมูลห้องพัก</p>
              <div className="row g-3">
                <div className="col-6">
                  <label className="form-label">เลขห้อง</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{3}"
                    name="room_number"
                    className="form-control"
                    value={roomForm.room_number}
                    onChange={handleRoomFormChange}
                    disabled={roomModal.mode === 'edit'}
                    maxLength={3}
                    placeholder="เช่น 101"
                    required
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">ราคา/เดือน (บาท)</label>
                  <div className="admin-input-group">
                    <span className="admin-input-affix">฿</span>
                    <input type="number" name="price" className="form-control" value={roomForm.price} onChange={handleRoomFormChange} required />
                  </div>
                </div>
                <div className="col-4">
                  <label className="form-label">จำนวนเตียง</label>
                  <input type="number" min="0" max="99" name="bed" className="form-control" value={roomForm.bed} onChange={handleRoomFormChange} />
                </div>
                <div className="col-4">
                  <label className="form-label">ค่าไฟ/หน่วย</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="99.99"
                    name="electricity_unit_price"
                    className="form-control"
                    value={roomForm.electricity_unit_price}
                    onChange={handleRoomFormChange}
                  />
                </div>
                <div className="col-4">
                  <label className="form-label">ค่าน้ำ/เดือน</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="999.99"
                    name="water_price"
                    className="form-control"
                    value={roomForm.water_price}
                    onChange={handleRoomFormChange}
                  />
                </div>
              </div>
            </div>

            <div className="admin-form-divider" />

            <div className="admin-form-section">
              <p className="admin-form-section-title">สิ่งอำนวยความสะดวก</p>
              <div className="admin-toggle-grid">
                {[
                  [
                    'air_conditioner',
                    'เครื่องปรับอากาศ',
                    <path key="ac" d="M12 3v18M5.6 6.5 18.4 17.5M18.4 6.5 5.6 17.5" />,
                  ],
                  [
                    'wifi',
                    'ไวไฟ',
                    <g key="wifi">
                      <path d="M2 8.5a16 16 0 0 1 20 0" />
                      <path d="M5.5 12.5a11 11 0 0 1 13 0" />
                      <path d="M9 16.5a5.5 5.5 0 0 1 6 0" />
                      <circle cx="12" cy="19.5" r="0.5" fill="currentColor" />
                    </g>,
                  ],
                  [
                    'refrigerator',
                    'ตู้เย็น',
                    <g key="fridge">
                      <rect x="5" y="2.5" width="14" height="19" rx="2" />
                      <line x1="5" y1="10.5" x2="19" y2="10.5" />
                      <line x1="8.5" y1="5.5" x2="8.5" y2="8" />
                      <line x1="8.5" y1="13.5" x2="8.5" y2="16" />
                    </g>,
                  ],
                  [
                    'bathroom',
                    'ห้องน้ำในตัว',
                    <g key="bath">
                      <path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z" />
                      <path d="M7 12V6a2.5 2.5 0 0 1 4.6-1.4" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                    </g>,
                  ],
                  [
                    'cctv',
                    'กล้องวงจรปิด',
                    <g key="cctv">
                      <rect x="2.5" y="8" width="12" height="8" rx="2" />
                      <path d="M14.5 10.5 21 8v8l-6.5-2.5" />
                      <line x1="6" y1="16" x2="5" y2="19" />
                    </g>,
                  ],
                ].map(([field, label, icon]) => (
                  <label className="admin-toggle-chip" key={field}>
                    <input type="checkbox" name={field} checked={roomForm[field]} onChange={handleRoomFormChange} />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {icon}
                    </svg>
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="admin-action-btn is-primary" disabled={roomSubmitting}>
                {roomSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {roomDeleteConfirm && (
        <Modal title="ยืนยันการลบห้องพัก" onClose={() => setRoomDeleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div className="admin-confirm-icon is-danger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <p className="admin-confirm-message">ต้องการลบห้อง {roomDeleteConfirm.room_number} ใช่หรือไม่?</p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-danger" onClick={() => confirmDeleteRoom(requestClose)}>
                  ลบห้องพัก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {parcelFormOpen && (
        <Modal title="บันทึกพัสดุใหม่" onClose={() => setParcelFormOpen(false)}>
          {() => (
          <form className="parcel-form is-modal" onSubmit={requestParcelSave}>
            <p className="parcel-form-hint"><span className="text-danger">*</span> จำเป็นต้องกรอก</p>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="admin-parcel-room">
                  ห้อง / ผู้เช่า <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text"><DoorIcon /></span>
                  <select
                    id="admin-parcel-room"
                    className="form-select"
                    required
                    value={parcelForm.room_number}
                    onChange={(event) => setParcelForm((form) => ({ ...form, room_number: event.target.value }))}
                  >
                    <option value="">เลือกห้องที่มีผู้เช่า</option>
                    {rooms
                      .filter((room) => room.is_booked && room.customer_id)
                      .map((room) => (
                        <option key={room.room_number} value={room.room_number}>
                          ห้อง {room.room_number} · {room.first_name} {room.last_name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="admin-parcel-sender">บริษัทขนส่ง / ผู้ส่ง</label>
                <div className="input-group">
                  <span className="input-group-text"><TruckIcon /></span>
                  <input
                    id="admin-parcel-sender"
                    className="form-control"
                    type="text"
                    maxLength={100}
                    placeholder="เช่น ไปรษณีย์ไทย, Kerry"
                    value={parcelForm.sender_name}
                    onChange={(event) => setParcelForm((form) => ({ ...form, sender_name: event.target.value }))}
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="admin-parcel-tracking">
                  เลขพัสดุ <small>(ไม่บังคับ)</small>
                </label>
                <div className="input-group">
                  <span className="input-group-text"><HashIcon /></span>
                  <input
                    id="admin-parcel-tracking"
                    className="form-control"
                    type="text"
                    maxLength={100}
                    placeholder="เช่น TH1234567890"
                    value={parcelForm.tracking_number}
                    onChange={(event) => setParcelForm((form) => ({ ...form, tracking_number: event.target.value }))}
                  />
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="admin-parcel-description">
                  รายละเอียด <small>(ไม่บังคับ)</small>
                </label>
                <div className="input-group">
                  <span className="input-group-text"><NoteIcon /></span>
                  <input
                    id="admin-parcel-description"
                    className="form-control"
                    type="text"
                    maxLength={255}
                    placeholder="เช่น กล่องขนาดใหญ่"
                    value={parcelForm.description}
                    onChange={(event) => setParcelForm((form) => ({ ...form, description: event.target.value }))}
                  />
                </div>
              </div>
              <div className="col-12">
                <div className="parcel-photo-section">
                  <ParcelPhotoPicker
                    id="admin-parcel-photos"
                    required
                    files={parcelPhotos}
                    onChange={setParcelPhotos}
                    error={parcelPhotoError}
                    onError={setParcelPhotoError}
                  />
                </div>
              </div>
            </div>
            {parcelFormError && <div className="parcel-form-error" role="alert">{parcelFormError}</div>}
            <div className="parcel-form-actions">
              <button
                type="submit"
                className="parcel-action-btn is-primary"
                disabled={parcelSubmitting || parcelPhotos.length === 0}
                title={parcelPhotos.length === 0 ? 'แนบรูปพัสดุก่อนบันทึก' : undefined}
              >
                <CheckIcon />
                {parcelSubmitting ? 'กำลังบันทึก...' : 'บันทึกพัสดุและแจ้งผู้เช่า'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {parcelSaveConfirm && (
        <Modal title="ยืนยันการบันทึกพัสดุ" onClose={() => setParcelSaveConfirm(false)} variant="confirm">
          {(requestClose) => {
            const room = rooms.find((item) => String(item.room_number) === String(parcelForm.room_number))
            return (
              <div className="admin-confirm-body">
                <div className="admin-confirm-icon is-info">
                  <PackageIcon size={28} strokeWidth={2.2} />
                </div>
                <p className="admin-confirm-message">บันทึกพัสดุนี้และแจ้งผู้เช่าใช่หรือไม่?</p>
                <div className="admin-confirm-details">
                  <div className="admin-confirm-detail-row">
                    <span>ห้อง</span>
                    <strong>{parcelForm.room_number}</strong>
                  </div>
                  <div className="admin-confirm-detail-row">
                    <span>ผู้เช่า</span>
                    <strong>{room ? `${room.first_name} ${room.last_name}` : '-'}</strong>
                  </div>
                  <div className="admin-confirm-detail-row">
                    <span>ผู้ส่ง</span>
                    <strong>{parcelForm.sender_name.trim() || 'พัสดุทั่วไป'}</strong>
                  </div>
                  <div className="admin-confirm-detail-row">
                    <span>เลขพัสดุ</span>
                    <strong>{parcelForm.tracking_number.trim() || '-'}</strong>
                  </div>
                  <div className="admin-confirm-detail-row">
                    <span>รูปที่แนบ</span>
                    <strong>{parcelPhotos.length} รูป</strong>
                  </div>
                </div>
                <div className="admin-form-actions">
                  <button type="button" className="admin-action-btn is-primary" onClick={() => handleCreateParcel(requestClose)} disabled={parcelSubmitting}>
                    {parcelSubmitting ? 'กำลังบันทึก...' : 'ยืนยันบันทึก'}
                  </button>
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {staffModal && (
        <Modal title={staffModal.mode === 'create' ? 'เพิ่มพนักงาน' : 'แก้ไขข้อมูลพนักงาน'} onClose={() => setStaffModal(null)}>
          {(requestClose) => (
          <form onSubmit={(event) => submitStaffForm(event, requestClose)} noValidate>
            {staffFormError && <div className="alert alert-danger py-2 px-3">{staffFormError}</div>}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label">เลขบัตรประชาชน</label>
                <input
                  type="text"
                  name="idcard"
                  className="form-control"
                  value={staffForm.idcard}
                  onChange={handleStaffFormChange}
                  disabled={staffModal.mode === 'edit'}
                  maxLength={13}
                  required
                />
              </div>
              <div className="col-12">
                <label className="form-label">{staffModal.mode === 'create' ? 'รหัสผ่าน' : 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)'}</label>
                <input
                  type="password"
                  name="password"
                  className="form-control"
                  value={staffForm.password}
                  onChange={handleStaffFormChange}
                  required={staffModal.mode === 'create'}
                />
              </div>
              <div className="col-6">
                <label className="form-label">ชื่อ</label>
                <input type="text" name="first_name" className="form-control" value={staffForm.first_name} onChange={handleStaffFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">นามสกุล</label>
                <input type="text" name="last_name" className="form-control" value={staffForm.last_name} onChange={handleStaffFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">เบอร์โทรศัพท์</label>
                <input type="text" name="phone" className="form-control" value={staffForm.phone} onChange={handleStaffFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">อายุ</label>
                <input type="number" name="age" className="form-control" value={staffForm.age} onChange={handleStaffFormChange} required />
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-action-btn is-primary" disabled={staffSubmitting}>
                {staffSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {staffDeleteConfirm && (
        <Modal title="ยืนยันการลบพนักงาน" onClose={() => setStaffDeleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div className="admin-confirm-icon is-danger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <p className="admin-confirm-message">
                ต้องการลบพนักงาน {staffDeleteConfirm.first_name} {staffDeleteConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-danger" onClick={() => confirmDeleteStaff(requestClose)}>
                  ลบพนักงาน
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {staffSuspendConfirm && (
        <Modal
          title={staffSuspendConfirm.is_suspended ? 'ยืนยันการเปิดใช้งานพนักงาน' : 'ยืนยันการระงับพนักงาน'}
          onClose={() => setStaffSuspendConfirm(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div className={`admin-confirm-icon ${staffSuspendConfirm.is_suspended ? 'is-success' : 'is-danger'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v6" />
                  <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                </svg>
              </div>
              <p className="admin-confirm-message">
                ต้องการ{staffSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}พนักงาน {staffSuspendConfirm.first_name}{' '}
                {staffSuspendConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="admin-form-actions">
                <button
                  type="button"
                  className={`admin-action-btn ${staffSuspendConfirm.is_suspended ? 'is-primary' : 'is-danger'}`}
                  onClick={() => toggleStaffSuspend(staffSuspendConfirm, requestClose)}
                >
                  {staffSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {customerModal && (
        <Modal title={`แก้ไขข้อมูลลูกค้า - ${customerModal.first_name} ${customerModal.last_name}`} onClose={() => setCustomerModal(null)}>
          {(requestClose) => (
          <form onSubmit={(event) => submitCustomerForm(event, requestClose)} noValidate>
            {customerFormError && <div className="alert alert-danger py-2 px-3">{customerFormError}</div>}
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label">ชื่อ</label>
                <input type="text" name="first_name" className="form-control" value={customerForm.first_name} onChange={handleCustomerFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">นามสกุล</label>
                <input type="text" name="last_name" className="form-control" value={customerForm.last_name} onChange={handleCustomerFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">เบอร์โทรศัพท์</label>
                <input type="text" name="phone" className="form-control" value={customerForm.phone} onChange={handleCustomerFormChange} required />
              </div>
              <div className="col-6">
                <label className="form-label">อายุ</label>
                <input type="number" name="age" className="form-control" value={customerForm.age} onChange={handleCustomerFormChange} required />
              </div>
              <div className="col-12">
                <label className="form-label">เงินมัดจำ (บาท)</label>
                <input type="number" name="deposit_amount" className="form-control" value={customerForm.deposit_amount} onChange={handleCustomerFormChange} />
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-action-btn is-primary" disabled={customerSubmitting}>
                {customerSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {customerSuspendConfirm && (
        <Modal
          title={customerSuspendConfirm.is_suspended ? 'ยืนยันการเปิดใช้งานลูกค้า' : 'ยืนยันการระงับลูกค้า'}
          onClose={() => setCustomerSuspendConfirm(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="admin-confirm-body">
              <div className={`admin-confirm-icon ${customerSuspendConfirm.is_suspended ? 'is-success' : 'is-danger'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v6" />
                  <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                </svg>
              </div>
              <p className="admin-confirm-message">
                ต้องการ{customerSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}ลูกค้า {customerSuspendConfirm.first_name}{' '}
                {customerSuspendConfirm.last_name} ใช่หรือไม่?
              </p>
              <div className="admin-form-actions">
                <button
                  type="button"
                  className={`admin-action-btn ${customerSuspendConfirm.is_suspended ? 'is-primary' : 'is-danger'}`}
                  onClick={() => toggleCustomerSuspend(customerSuspendConfirm, requestClose)}
                >
                  {customerSuspendConfirm.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {customerDetail && (
        <Modal
          title={`ประวัติการเช่า - ${customerDetail.customer.first_name} ${customerDetail.customer.last_name}`}
          onClose={() => {
            setSlipPreview(null)
            setPhotoPreview(null)
            setPaymentDetail(null)
            setCustomerDetail(null)
          }}
          variant="rental-history"
        >
          {customerDetailLoading ? (
            <div className="room-history-state">
              <span className="room-detail-spinner" aria-hidden="true" />
              <strong>กำลังโหลดประวัติการเช่า...</strong>
            </div>
          ) : customerDetailError ? (
            <div className="room-history-state is-error" role="alert">
              <span className="room-history-state-icon"><RoomDetailIcon type="alert" size={24} /></span>
              <strong>{customerDetailError}</strong>
            </div>
          ) : (
            <CustomerRentalHistory
              key={customerDetail.customer.id}
              history={customerDetail.rentalHistory}
              onSlip={(payment) => openSlipPreview(customerDetail.customer, payment)}
              onSelectPayment={(payment, booking) =>
                setPaymentDetail({
                  ...payment,
                  roomNumber: booking.room_number,
                  tenant: { first_name: customerDetail.customer.first_name, last_name: customerDetail.customer.last_name },
                  tenantName: `${customerDetail.customer.first_name} ${customerDetail.customer.last_name}`,
                })
              }
            />
          )}
        </Modal>
      )}

      {paymentDetail && (
        <Modal title={`รายละเอียดการชำระเงิน #${paymentDetail.id}`} onClose={() => setPaymentDetail(null)} variant="payment-detail">
          <PaymentDetail payment={paymentDetail} roomNumber={paymentDetail.roomNumber} onSlip={openSlipPreview} />
        </Modal>
      )}
    </div>
  )
}

export default AdminBackupPage
