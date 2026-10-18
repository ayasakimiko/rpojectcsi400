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
import { CheckIcon, DoorIcon, HashIcon, NoteIcon, PackageIcon, PlusIcon, TruckIcon } from '../components/ParcelIcons.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import StepTimeline from '../components/StepTimeline.jsx'

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

function waitingNameInitial(name) {
  return String(name || '').trim().replace(/^[เแโใไ]/, '').charAt(0).toUpperCase() || '?'
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
                          {waitingNameInitial(item.full_name)}
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
            {waitingNameInitial(item.full_name)}
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
        className={`admin-modal${variant === 'confirm' ? ' admin-modal-confirm' : ''}${variant === 'form' ? ' admin-modal-form' : ''}${variant === 'wide' ? ' admin-modal-wide' : ''}${variant === 'gallery' ? ' admin-modal-gallery' : ''}${variant === 'waiting-detail' ? ' admin-modal-waiting-detail' : ''}${variant === 'waiting-form' ? ' admin-modal-waiting-form' : ''}${isClosing ? ' is-closing' : ''}`}
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
const DETAIL_ROWS_PER_PAGE = 5

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
  { key: 'building', label: 'พัสดุและประกาศ', tabs: ['parcels', 'announcements'] },
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
const PAYMENT_STATUS_LABEL = { paid: 'ชำระแล้ว', pending: 'รอชำระ' }
const PAYMENT_TYPE_LABEL = { rent: 'ค่าเช่า', deposit: 'เงินมัดจำ' }

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

function AdminRequestProgress({ request }) {
  const rejected = request.status === 'rejected'
  const finished = ['approved', 'rejected'].includes(request.status)
  const raw = [
    { label: 'ส่งคำขอ', by: `${request.first_name || ''} ${request.last_name || ''}`.trim(), date: request.created_at, state: 'done' },
    {
      label: 'เจ้าหน้าที่รับเรื่อง',
      by: request.accepted_by_name,
      date: request.accepted_at,
      state: request.accepted_at || finished ? 'done' : 'current',
    },
    {
      label: rejected ? 'ปฏิเสธคำขอ' : finished ? 'อนุมัติคำขอ' : 'รอผลการพิจารณา',
      by: request.completed_by_name,
      date: request.completed_at,
      state: finished ? 'done' : request.accepted_at ? 'current' : 'pending',
      tone: finished ? (rejected ? 'danger' : 'success') : undefined,
    },
  ]
  const steps = raw.map((step, index) => {
    const previous = raw[index - 1]
    const gapMs = previous?.date && step.date ? new Date(step.date) - new Date(previous.date) : null
    return {
      ...step,
      meta: step.date ? formatDateTime(step.date) : step.state === 'current' ? 'กำลังรอดำเนินการ' : 'ยังไม่ถึงขั้นตอนนี้',
      by: step.date ? step.by : null,
      extra: gapMs !== null && gapMs >= 0 ? `+ ${formatRemaining(gapMs)}` : null,
    }
  })
  const totalMs = finished && request.completed_at ? new Date(request.completed_at) - new Date(request.created_at) : null
  const aside =
    totalMs !== null && totalMs >= 0 ? (
      <span className={`admin-progress-total${rejected ? ' is-rejected' : ''}`}>ใช้เวลาทั้งหมด {formatRemaining(totalMs)}</span>
    ) : (
      <span className="admin-progress-total is-waiting">กำลังดำเนินการ</span>
    )
  return <StepTimeline steps={steps} aside={aside} actorClassName="admin-actor-inline" />
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
  const [inspectionKind, setInspectionKind] = useState('moveout')
  const [inspectionSearch, setInspectionSearch] = useState('')
  const [inspectionResultFilter, setInspectionResultFilter] = useState('all')
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState('all')
  const [announcements, setAnnouncements] = useState([])
  const [inspectionDetail, setInspectionDetail] = useState(null)
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
        title: 'สลิปโอนเงิน',
        subtitle: slipPreview.subtitle,
        label: 'สลิปโอนเงิน',
        photos: [{ name: slipPreview.name, url: slipPreview.url }],
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

  const openSlipPreview = (customer, payment) => {
    setSlipPreview({
      url: payment.slip_path,
      name: `สลิปโอนเงิน ${formatDate(payment.payment_date)}`,
      subtitle: `${customer.first_name} ${customer.last_name} · ฿${formatCurrency(payment.amount)} · ${PAYMENT_TYPE_LABEL[payment.type] || payment.type}`,
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

  const removeMoveOutInspection = async (inspection) => {
    if (!window.confirm(`ลบผลตรวจห้อง ${inspection.room_number} หรือไม่?`)) return
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
  const [rentalPaymentsPage, setRentalPaymentsPage] = useState({})

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
    setRentalPaymentsPage({})
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
  const kindInspections = moveOutInspections.filter((inspection) => inspectionKindOf(inspection) === inspectionKind)
  const inspectionToneCounts = kindInspections.reduce((counts, inspection) => {
    const tone = summarizeInspection(inspection.checklist).tone
    counts[tone] = (counts[tone] || 0) + 1
    return counts
  }, {})
  const inspectionKeyword = inspectionSearch.trim().toLocaleLowerCase('th-TH')
  const filteredInspections = kindInspections.filter((inspection) => {
    if (inspectionResultFilter !== 'all' && summarizeInspection(inspection.checklist).tone !== inspectionResultFilter) return false
    if (inspectionKind === 'moveout' && inspectionStatusFilter !== 'all' && (inspection.status || 'pending') !== inspectionStatusFilter) {
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
                          <td className="admin-strong-cell">{room.room_number}</td>
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
                    <th>ชื่อ-นามสกุล</th>
                    <th className="admin-col-optional">บัตรประชาชน</th>
                    <th>ห้อง</th>
                    <th className="admin-col-optional">เบอร์โทร</th>
                    <th className="admin-col-optional">ระยะเวลาสัญญา</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">การดำเนินการ</th>
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
                        <tr>
                          <td className="admin-strong-cell">
                            {customer.first_name} {customer.last_name}
                          </td>
                          <td className="admin-col-optional">
                            <button
                              type="button"
                              className="admin-idcard-toggle"
                              onClick={() => toggleCustomerIdCardReveal(customer.id)}
                            >
                              {revealedCustomerIdCards.has(customer.id) ? customer.idcard : '•'.repeat(String(customer.idcard || '').length || 13)}
                            </button>
                          </td>
                          <td>{customer.room_number ?? '-'}</td>
                          <td className="admin-col-optional">{customer.phone}</td>
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
                    <th>ประเภท</th>
                    <th>ห้อง</th>
                    <th>ผู้เช่า</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">รับเรื่องโดย</th>
                    <th className="admin-col-optional">เสร็จสิ้นโดย</th>
                    <th className="admin-col-optional">วันที่ส่งคำขอ</th>
                    <th aria-label="รายละเอียด" />
                  </tr>
                </thead>
                <tbody>
                  {requestLogsLoading ? (
                    <tr>
                      <td colSpan={8} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : requestLogs.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="admin-empty">
                        ไม่พบประวัติคำขอ
                      </td>
                    </tr>
                  ) : (
                    requestLogs.items.map((request) => (
                      <Fragment key={request.id}>
                        <tr>
                          <td>
                            <span className={`admin-badge type-${request.type}`}>{REQUEST_TYPE_LABEL[request.type] || request.type}</span>
                          </td>
                          <td>
                            {request.type === 'move_room'
                              ? `ห้อง ${request.room_number} → ${request.target_room_number || '-'}`
                              : request.room_number}
                          </td>
                          <td>
                            {request.first_name} {request.last_name}
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
                          <td className="admin-col-optional">{formatDateTime(request.created_at)}</td>
                          <td className="admin-more-cell">
                            <button type="button" className="admin-more-link" onClick={() => setRequestDetail(request)}>
                              ดูเพิ่มเติม <span aria-hidden="true">›</span>
                            </button>
                          </td>
                        </tr>
                        <ExpandToggleRow open={expandedRequestRows.has(request.id)} colSpan={8} onClick={() => toggleRequestRow(request.id)} />
                        <DetailRow
                          open={expandedRequestRows.has(request.id)}
                          colSpan={8}
                          fields={[
                            { label: 'ขั้นตอนการดำเนินการ', value: <AdminRequestTimeline kind="tenant" request={request} /> },
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
                    <th>รายละเอียด</th>
                    <th className="admin-col-optional">หมวดหมู่</th>
                    <th>ห้อง</th>
                    <th>ผู้แจ้ง</th>
                    <th>สถานะ</th>
                    <th className="admin-col-optional">รับเรื่องโดย</th>
                    <th className="admin-col-optional">เสร็จสิ้นโดย</th>
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
                    maintenanceLogs.items.map((request) => (
                      <Fragment key={request.id}>
                        <tr>
                          <td>{request.description}</td>
                          <td className="admin-col-optional">
                            <MaintenanceCategoryBadge category={request.category} />
                          </td>
                          <td>{request.room_number}</td>
                          <td>
                            {request.first_name} {request.last_name}
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
                            { label: 'ขั้นตอนการดำเนินการ', value: <AdminRequestTimeline kind="maintenance" request={request} /> },
                          ]}
                        />
                      </Fragment>
                    ))
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
                    <th>ชื่อ-นามสกุล</th>
                    <th className="admin-col-optional">บัตรประชาชน</th>
                    <th>ห้อง</th>
                    <th className="admin-col-optional">เบอร์โทร</th>
                    <th className="admin-col-optional">วันที่เข้าพัก</th>
                    <th>วันที่ย้ายออก</th>
                    <th>รวมวันที่พัก</th>
                    <th className="admin-col-optional">ดำเนินการโดย</th>
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
                        <tr>
                          <td className="admin-strong-cell">
                            {moveout.first_name} {moveout.last_name}
                          </td>
                          <td className="admin-col-optional">
                            <button
                              type="button"
                              className="admin-idcard-toggle"
                              onClick={() => toggleMoveoutIdCardReveal(moveout.id)}
                            >
                              {revealedMoveoutIdCards.has(moveout.id) ? moveout.idcard : '•'.repeat(String(moveout.idcard || '').length || 13)}
                            </button>
                          </td>
                          <td>{moveout.room_number}</td>
                          <td className="admin-col-optional">{moveout.phone}</td>
                          <td className="admin-col-optional">{formatDate(moveout.move_in_date)}</td>
                          <td>{formatDateTime(moveout.completed_at)}</td>
                          <td>{stayDays !== null ? `${stayDays} วัน` : '-'}</td>
                          <td className="admin-col-optional">
                            <ActorName name={moveout.completed_by_name} />
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
                <h2>
                  {ADMIN_INSPECTION_KINDS[inspectionKind].title} ({kindInspections.length})
                </h2>
                <p className="waiting-list-storage-note">{ADMIN_INSPECTION_KINDS[inspectionKind].note}</p>
              </div>
            </div>
            <div className="inspection-kind-tabs" role="tablist" aria-label="ประเภทการตรวจห้อง">
              {Object.entries(ADMIN_INSPECTION_KINDS).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={inspectionKind === key}
                  className={`inspection-kind-tab${inspectionKind === key ? ' is-active' : ''}`}
                  onClick={() => {
                    setInspectionKind(key)
                    setInspectionResultFilter('all')
                    setInspectionStatusFilter('all')
                  }}
                >
                  {key === 'moveout' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <path d="m16 17 5-5-5-5M21 12H9" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 7h11l-3-3M17 17H6l3 3" />
                    </svg>
                  )}
                  {info.label}
                  <span>{inspectionKindCounts[key] || 0}</span>
                </button>
              ))}
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
                {inspectionKind === 'moveout' && (
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
              <table className="table admin-table admin-inspection-table">
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
                        {kindInspections.length ? 'ไม่พบผลตรวจตามเงื่อนไข' : ADMIN_INSPECTION_KINDS[inspectionKind].empty}
                      </td>
                    </tr>
                  ) : (
                    filteredInspections.map((inspection) => {
                      const summary = summarizeInspection(inspection.checklist)
                      const issueCount = summary.counts.damaged + summary.counts.missing
                      return (
                        <tr key={inspection.id}>
                          <td>
                            <div className="admin-inspection-room">
                              {inspection.tenant_request_id ? (
                                <>
                                  <strong>
                                    {inspection.room_number} → {inspection.target_room_number || '-'}
                                  </strong>
                                  <small>ห้องเดิม → ห้องใหม่</small>
                                </>
                              ) : (
                                <strong>ห้อง {inspection.room_number}</strong>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="admin-inspection-stack">
                              <strong>{inspection.tenant_name}</strong>
                              <small>{inspection.tenant_phone || '-'}</small>
                            </div>
                          </td>
                          <td className="admin-inspection-date">{formatDateTime(inspection.created_at)}</td>
                          <td>
                            <div className="admin-inspection-result">
                              <span className={`inspection-result is-${summary.tone}`}>
                                {INSPECTION_TONE_LABEL[summary.tone]}
                                {issueCount > 0 && ` ${issueCount} ข้อ`}
                              </span>
                              <div className="inspection-meter" aria-hidden="true">
                                {INSPECTION_RESULT_ORDER.map((key) =>
                                  summary.counts[key] > 0 ? (
                                    <span key={key} className={`is-${key}`} style={{ flexGrow: summary.counts[key] }} />
                                  ) : null,
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={inspection.inspected_by ? '' : 'admin-inspection-muted'}>{inspection.inspected_by || '-'}</td>
                          <td>
                            <span className="admin-inspection-photos">{inspection.photo_count || 0} รูป</span>
                          </td>
                          <td>
                            {inspection.tenant_request_id ? (
                              <span className="moveout-inspection-status is-reviewed">Staff ตรวจแล้ว</span>
                            ) : (
                              <select
                                aria-label={`สถานะตรวจห้อง ${inspection.room_number}`}
                                className={`form-select waiting-list-status-select admin-inspection-status is-${inspection.status || 'pending'}`}
                                value={inspection.status || 'pending'}
                                onChange={(event) => setMoveOutInspectionStatus(inspection, event.target.value)}
                              >
                                {Object.entries(MOVE_OUT_INSPECTION_STATUS).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="admin-inspection-actions">
                            <div className="admin-row-actions">
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openInspectionDetail(inspection)}>
                                ดูรายละเอียด
                              </button>
                              <button type="button" className="admin-action-btn is-danger" onClick={() => removeMoveOutInspection(inspection)}>
                                ลบ
                              </button>
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

      {inspectionDetail && (
        <Modal title={`ผลตรวจห้อง ${inspectionDetail.room_number}`} onClose={() => { setPhotoPreview(null); setPhotoGalleryPage(null); setInspectionDetail(null) }} variant="wide">
          <div className="moveout-inspection-admin-detail">
            <div className="moveout-inspection-admin-hero">
              <span className="moveout-inspection-admin-avatar" aria-hidden="true">{inspectionDetail.tenant_name?.[0] || '?'}</span>
              <div className="moveout-inspection-admin-hero-main">
                <strong>{inspectionDetail.tenant_name}</strong>
                <span>
                  {inspectionDetail.tenant_request_id
                    ? `ห้อง ${inspectionDetail.room_number} → ${inspectionDetail.target_room_number} (ตรวจห้องก่อนย้าย)`
                    : `ห้อง ${inspectionDetail.room_number}`}
                </span>
              </div>
              <span className={`moveout-inspection-status is-${inspectionDetail.tenant_request_id ? 'reviewed' : inspectionDetail.status || 'pending'}`}>
                {inspectionDetail.tenant_request_id ? 'Staff ตรวจแล้ว' : MOVE_OUT_INSPECTION_STATUS[inspectionDetail.status || 'pending']}
              </span>
            </div>
            <div className="moveout-inspection-admin-meta">
              <div><span>เบอร์โทร</span><strong>{inspectionDetail.tenant_phone || '-'}</strong></div>
              <div><span>ตรวจโดย</span><strong>{inspectionDetail.inspected_by || '-'}</strong></div>
              <div><span>ตรวจเมื่อ</span><strong>{formatDateTime(inspectionDetail.created_at)}</strong></div>
            </div>
            <h4>Checklist</h4>
            <div className="moveout-inspection-admin-checklist">
              {MOVE_OUT_CHECKLIST.map((item) => {
                const result = inspectionDetail.checklist?.[item.key]
                const label = {
                  good: 'ปกติ',
                  wear: 'สึกหรอตามปกติ',
                  damaged: 'ชำรุด',
                  missing: 'สูญหาย',
                  not_applicable: 'ไม่มี/ไม่ได้ติดตั้ง',
                }[result] || 'ไม่ได้ระบุ'
                return <div key={item.key}><span>{item.label}</span><strong className={`is-${result || 'none'}`}>{label}</strong></div>
              })}
            </div>
            <h4>รายละเอียดที่พบ / หมายเหตุ</h4>
            <p className={`moveout-inspection-damage-note${inspectionDetail.damage_note ? '' : ' is-empty'}`}>
              {inspectionDetail.damage_note || 'ไม่มีบันทึกความเสียหาย'}
            </p>
            <div className="moveout-inspection-section-head">
              <h4>รูปภาพประกอบ ({inspectionDetail.photos?.length || 0})</h4>
              {inspectionDetail.photos?.length > 0 && (
                <button type="button" className="admin-action-btn is-ghost" onClick={() => setPhotoGalleryPage(1)}>
                  ดูเพิ่มเติม
                </button>
              )}
            </div>
            {inspectionDetail.photos?.length ? (
              <div className="moveout-inspection-photo-grid">
                {inspectionDetail.photos.slice(0, INSPECTION_PHOTO_PREVIEW_COUNT).map(renderInspectionPhoto)}
              </div>
            ) : <p className="moveout-inspection-empty-photos">ไม่มีรูปภาพแนบ</p>}
            {!inspectionDetail.tenant_request_id && (
              <div className="admin-form-actions moveout-inspection-status-bar">
                <label className="form-label" htmlFor="inspection-detail-status">สถานะตรวจ</label>
                <select id="inspection-detail-status" className="form-select waiting-list-status-select" value={inspectionDetail.status || 'pending'} onChange={(event) => setMoveOutInspectionStatus(inspectionDetail, event.target.value)}>
                  {Object.entries(MOVE_OUT_INSPECTION_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            )}
          </div>
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
        <Modal title="รายละเอียดคำขอผู้เช่า" onClose={() => setRequestDetail(null)}>
          {() => {
            const request = requestDetail
            const priceDiff =
              request.type === 'move_room' && request.source_room_price != null && request.target_room_price != null
                ? Number(request.target_room_price) - Number(request.source_room_price)
                : null
            return (
              <div className="admin-incident-detail">
                <div className="admin-incident-scroll">
                  <div className={`admin-incident-hero admin-request-hero is-${request.status}`}>
                    <span className="admin-incident-icon is-large admin-request-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                        <path d="M14 3v6h6M8 13h8M8 17h5" />
                      </svg>
                    </span>
                    <div>
                      <strong>คำขอ{REQUEST_TYPE_LABEL[request.type] || request.type}</strong>
                      <span className={`admin-badge type-${request.type}`}>{REQUEST_TYPE_LABEL[request.type] || request.type}</span>
                    </div>
                    <span className={`admin-badge status-${request.status}`}>{REQUEST_STATUS_LABEL[request.status] || request.status}</span>
                  </div>

                  <section className="admin-request-section">
                    <h4>ข้อมูลผู้เช่า</h4>
                    <dl className="admin-incident-fields">
                      <div>
                        <dt>ชื่อผู้เช่า</dt>
                        <dd>{request.first_name} {request.last_name}</dd>
                      </div>
                      <div>
                        <dt>เบอร์โทร</dt>
                        <dd>{request.phone ? <a href={`tel:${request.phone}`}>{request.phone}</a> : '-'}</dd>
                      </div>
                      <div>
                        <dt>ห้องปัจจุบัน</dt>
                        <dd>ห้อง {request.room_number}</dd>
                      </div>
                      <div>
                        <dt>เงินประกัน</dt>
                        <dd>{request.deposit_amount != null ? `฿${formatCurrency(request.deposit_amount)}` : '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="admin-request-section">
                    <h4>รายละเอียดคำขอ</h4>
                    <dl className="admin-incident-fields">
                      <div>
                        <dt>วันที่ส่งคำขอ</dt>
                        <dd>{formatDateTime(request.created_at)}</dd>
                      </div>
                      <div>
                        <dt>ประเภทคำขอ</dt>
                        <dd>{REQUEST_TYPE_LABEL[request.type] || request.type}</dd>
                      </div>
                      {request.type === 'renew' && (
                        <>
                          <div>
                            <dt>ระยะเวลาที่ขอต่อ</dt>
                            <dd>{RENEW_DURATION_LABEL[String(request.renew_duration_months)] || (request.renew_duration_months ? `${request.renew_duration_months} เดือน` : '-')}</dd>
                          </div>
                          <div>
                            <dt>รูปแบบการชำระ</dt>
                            <dd>{RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type || '-'}</dd>
                          </div>
                        </>
                      )}
                      {request.type === 'move_room' && (
                        <>
                          <div>
                            <dt>ห้องที่ต้องการย้ายไป</dt>
                            <dd>{request.target_room_number ? `ห้อง ${request.target_room_number}` : '-'}</dd>
                          </div>
                          <div>
                            <dt>วันที่ต้องการย้าย</dt>
                            <dd>{request.preferred_move_date ? formatDate(request.preferred_move_date) : '-'}</dd>
                          </div>
                          <div>
                            <dt>ค่าเช่าห้องเดิม → ห้องใหม่</dt>
                            <dd>
                              {request.source_room_price != null ? `฿${formatCurrency(request.source_room_price)}` : '-'} →{' '}
                              {request.target_room_price != null ? `฿${formatCurrency(request.target_room_price)}` : '-'}
                              {priceDiff !== null && priceDiff !== 0 && (
                                <span className={`admin-request-diff ${priceDiff > 0 ? 'is-up' : 'is-down'}`}>
                                  {priceDiff > 0 ? '+' : '−'}฿{formatCurrency(Math.abs(priceDiff))}/เดือน
                                </span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>เหตุผลที่ย้าย</dt>
                            <dd>{MOVE_ROOM_REASON_LABEL[request.move_reason] || request.move_reason || '-'}</dd>
                          </div>
                          <div className="is-wide">
                            <dt>ตรวจสภาพห้องเดิม</dt>
                            <dd>{request.inspection_id ? MOVE_OUT_INSPECTION_STATUS[request.inspection_status] || 'ตรวจแล้ว' : 'ยังไม่ได้ตรวจห้อง'}</dd>
                          </div>
                        </>
                      )}
                      {request.type === 'moveout' && (
                        <div className="is-wide">
                          <dt>ตรวจสภาพห้องก่อนย้ายออก</dt>
                          <dd>{request.inspection_id ? MOVE_OUT_INSPECTION_STATUS[request.inspection_status] || 'ตรวจแล้ว' : 'ยังไม่ได้ตรวจห้อง'}</dd>
                        </div>
                      )}
                      <div className="is-wide">
                        <dt>{request.type === 'moveout' ? 'เหตุผล / รายละเอียดการย้ายออก' : 'หมายเหตุจากผู้เช่า'}</dt>
                        <dd>{request.note || '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="admin-request-section">
                    <h4>ผู้ดำเนินการ</h4>
                    <dl className="admin-incident-fields">
                      <div>
                        <dt>รับเรื่องโดย</dt>
                        <dd>
                          <StaffActionCell name={request.accepted_by_name} date={request.accepted_at} />
                        </dd>
                      </div>
                      <div>
                        <dt>{request.status === 'rejected' ? 'ปฏิเสธโดย' : 'เสร็จสิ้นโดย'}</dt>
                        <dd>
                          <StaffActionCell name={request.completed_by_name} date={request.completed_at} />
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <AdminRequestProgress request={request} />
                </div>
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
            setCustomerDetail(null)
          }}
        >
          {customerDetailLoading ? (
            <p className="text-muted">กำลังโหลดข้อมูล...</p>
          ) : customerDetailError ? (
            <div className="alert alert-danger">{customerDetailError}</div>
          ) : (
            <div className="admin-detail-list">
              {customerDetail.rentalHistory && customerDetail.rentalHistory.length > 0 ? (
                customerDetail.rentalHistory.map((booking) => {
                  const page = rentalPaymentsPage[booking.booking_id] || 1
                  const totalPages = Math.max(1, Math.ceil(booking.payments.length / DETAIL_ROWS_PER_PAGE))
                  const currentPage = Math.min(page, totalPages)
                  const start = (currentPage - 1) * DETAIL_ROWS_PER_PAGE
                  const pagePayments = booking.payments.slice(start, start + DETAIL_ROWS_PER_PAGE)
                  return (
                    <div className="admin-detail-block" key={booking.booking_id}>
                      <p className="admin-detail-block-title">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                          <path d="M14 2v6h6" />
                          <line x1="8" y1="13" x2="16" y2="13" />
                          <line x1="8" y1="17" x2="13" y2="17" />
                        </svg>
                        สัญญาเช่าเมื่อ {formatDateTime(booking.created_at)}
                      </p>
                      {booking.payments.length === 0 ? (
                        <p className="admin-empty">ยังไม่มีประวัติการชำระเงิน</p>
                      ) : (
                        <>
                          <div className="admin-detail-table-wrap">
                            <table className="table admin-table admin-detail-table">
                              <thead>
                                <tr>
                                  <th>วันที่ชำระ</th>
                                  <th>จำนวนเงิน</th>
                                  <th>ประเภท</th>
                                  <th>สถานะ</th>
                                  <th>สลิป</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pagePayments.map((payment) => (
                                  <tr key={payment.id}>
                                    <td>{formatDate(payment.payment_date)}</td>
                                    <td className="admin-strong-cell">฿{formatCurrency(payment.amount)}</td>
                                    <td>
                                      <span className={`admin-badge type-${payment.type}`}>{PAYMENT_TYPE_LABEL[payment.type] || payment.type}</span>
                                    </td>
                                    <td>
                                      <span className={`admin-badge status-${payment.status === 'paid' ? 'approved' : 'pending'}`}>
                                        {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                                      </span>
                                    </td>
                                    <td>
                                      {payment.slip_path ? (
                                        <button
                                          type="button"
                                          className="admin-action-btn is-ghost"
                                          onClick={() => openSlipPreview(customerDetail.customer, payment)}
                                        >
                                          ดูสลิป
                                        </button>
                                      ) : (
                                        <span className="text-muted">-</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <Pagination
                            page={currentPage}
                            totalPages={totalPages}
                            onChange={(nextPage) => setRentalPaymentsPage((prev) => ({ ...prev, [booking.booking_id]: nextPage }))}
                          />
                        </>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="admin-empty">ยังไม่มีประวัติการเช่า</p>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default AdminBackupPage
