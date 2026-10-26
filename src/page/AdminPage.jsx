import { UploadImage } from '../components/UploadMedia.jsx'
import { Fragment, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { DormInfoMenu, DormInfoSettings } from '../components/DormInfo'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/AdminPage.css'
import './css/ParcelManagement.css'
import './css/WaitingDetail.css'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'
import ParcelPhotoPicker from '../components/ParcelPhotoPicker.jsx'
import { CheckIcon, DoorIcon, HashIcon, NoteIcon, PackageIcon, PersonIcon, PlusIcon, TruckIcon } from '../components/ParcelIcons.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import { ArchivedContractBadge, ContractCell, ContractDetail, ContractFirstPaymentNote, ContractFullModal, ContractStatusBadge, DepositRefundNote } from '../components/RentalContract.jsx'
import { completedContractSummaryTiles, DEPOSIT_STATUS_LABEL, formatDepositMonths, formatDepositSummary } from '../utils/rentalContract.js'
import ProcessSteps from '../components/ProcessSteps.jsx'
import { downloadUploadFile } from '../utils/uploadFiles.js'
import compressImageFile from '../utils/compressImageFile.js'
import { PARCEL_STATUS_OPTIONS, PREVIOUS_TENANT_LABEL, parcelStatusInfo } from '../utils/parcelStatus.js'
import {
  InspectionDateCell,
  InspectionInspectorCell,
  InspectionPersonCell,
  InspectionPhotosCell,
  InspectionPurposeBadge,
  InspectionRoomCell,
} from '../components/InspectionCells.jsx'
import { getInspectionPurposeLabel, getInspectionSourceLabel } from '../utils/inspectionSource.js'
import InspectionDetail from '../components/InspectionDetail.jsx'
import InspectionForm from '../components/InspectionForm.jsx'
import { assetRowsError, saveRoomAssets, toAssetRows, useRoomTypes } from '../utils/roomAssets.js'
import { assetPriceValue, isValidAssetPrice } from '../utils/inspectionChecklist.js'
import RoleTabMenu from '../components/RoleTabMenu.jsx'
import WifiManager from '../components/WifiManager.jsx'
import MarketManager from '../components/MarketManager.jsx'
import { marketSummaryTiles } from '../utils/marketSummary.js'
import RepairVendorManager from '../components/RepairVendorManager.jsx'
import NotificationDetailModal from '../components/NotificationDetailModal.jsx'
import { repairSummaryTiles } from '../utils/repairSummary.js'
import { MAINTENANCE_CATEGORY_LABEL, MAINTENANCE_TIME_LABEL } from '../utils/maintenanceCategories.js'
import CameraMonitor from '../components/CameraMonitor.jsx'
import { cameraSummaryTiles } from '../utils/cameras.js'
import { AppHeaderDate, AppHeaderMeta, LogoutIcon } from '../components/AppHeader.jsx'
import { countNewExpenses, maxExpenseId, readExpenseSeen, writeExpenseSeen } from '../utils/expenseSeen.js'
import CustomAmenityIcon from '../components/CustomAmenityIcon.jsx'
import { parseRoomAmenities } from '../utils/roomAmenities.js'
import { Modal as StaffModal, StaffCompletedContractsTab, StaffFilterPanel, StaffResidentVisitsTab, TransferContractPendingPanel } from './StaffMain.jsx'
import MoveInInspectionPanel from '../components/MoveInInspection.jsx'
import { isUnread, takeNotificationDeepLink, useNotificationReads, sortNewestFirst, useServerNotifications } from '../utils/serverNotifications.js'
import { clearSession, hasSession, logout } from '../utils/session.js'

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
        <div className="waiting-filter-row">
          <label className="waiting-filter-search">
            <span className="waiting-sr-only">ค้นหารายชื่อ</span>
            <input type="search" className="waiting-ui-form-input" placeholder="ค้นหาชื่อ เบอร์โทร ประเภทห้อง หรือหมายเหตุ" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />
          </label>
          <select className="waiting-ui-form-input waiting-filter-sort" aria-label="เรียงลำดับ" value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}>
            <option value="newest">แจ้งล่าสุดก่อน</option><option value="oldest">รอนานสุดก่อน</option>
          </select>
        </div>
        <div className="waiting-filter-segments" role="group" aria-label="สถานะรายชื่อ">
          {[{ key: 'all', label: 'ทั้งหมด', tone: 'all' }, ...Object.entries(WAITING_UI_STATUSES).map(([key, info]) => ({ key, ...info }))].map(info => (
            <button key={info.key} type="button" className={`waiting-filter-segment is-${info.tone}${status === info.key ? ' active' : ''}`} aria-pressed={status === info.key} onClick={() => { setStatus(info.key); setPage(1) }}>
              {info.label}<span>{info.key === 'all' ? items.length : counts[info.key] || 0}</span>
            </button>
          ))}
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
    wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></>,
    idcard: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0M15 10h3M15 14h3" /></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
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
                          <small className="waiting-tags-label">ประเภทห้องที่สนใจ</small>
                          <div className="waiting-tags-values">
                            {preferences.length > 0 ? (
                              preferences.map((preference) => <span key={preference}><DoorIcon size={15} />{preference}</span>)
                            ) : (
                              <span className="is-muted"><DoorIcon size={15} />ไม่ระบุประเภทห้อง</span>
                            )}
                          </div>
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
                            className="waiting-icon-btn"
                            onClick={() => onEdit(item)}
                            aria-label={`แก้ไขข้อมูล ${item.full_name}`}
                            title="แก้ไข"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                            <span>แก้ไข</span>
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
                            <span>ลบ</span>
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
  const status = WAITING_UI_STATUSES[item.status] ? item.status : 'waiting'
  const statusInfo = WAITING_UI_STATUSES[status]
  const preferences = splitWaitingPreferences(item.room_preference)
  const days = waitingDaysSince(item.created_at, now)
  const moveIn = item.desired_move_in_date ? describeWaitingMoveIn(item.desired_move_in_date, now) : null
  const formatCurrency = (value) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const pricedRooms = vacantRooms.filter((room) => room.price != null)
  const lowestPrice = pricedRooms.length > 1 ? Math.min(...pricedRooms.map((room) => Number(room.price))) : null
  const copied = waitingPhoneCopied === item.id
  const statusBusy = statusBusyId != null

  return (
    <div className="awd">
      <div className="awd-scroll">
        <header className={`awd-hero is-${statusInfo.tone}`}>
          <div className="awd-hero-person">
            <span className="awd-avatar" aria-hidden="true"><PersonIcon size={22} /></span>
            <div className="awd-hero-name">
              <small>ผู้สนใจเช่าห้อง</small>
              <strong>{item.full_name}</strong>
            </div>
            <span className={`awd-status is-${statusInfo.tone}`}>
              <span aria-hidden="true" />
              {statusInfo.label}
            </span>
          </div>
          <div className="awd-contact">
            <div className="awd-phone">
              <small>เบอร์ติดต่อ</small>
              <strong>{item.phone}</strong>
            </div>
            <div className="awd-contact-actions">
              <a className="awd-btn is-primary" href={`tel:${item.phone}`}>
                <WaitingDetailIcon type="phone" />
                โทรติดต่อ
              </a>
              <button
                type="button"
                className={`awd-btn is-ghost${copied ? ' is-copied' : ''}`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(item.phone)
                    setWaitingPhoneCopied(item.id)
                  } catch {
                    setWaitingPhoneCopied(null)
                  }
                }}
                aria-live="polite"
              >
                {copied ? <CheckIcon size={16} /> : <WaitingDetailIcon type="copy" />}
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกเบอร์'}
              </button>
            </div>
          </div>
        </header>

        {onStatusChange && (
          <section className="awd-status-panel" aria-label="จัดการสถานะรายชื่อ">
            <div className="awd-status-head">
              <strong>จัดการสถานะ</strong>
              <small>{statusBusy ? 'กำลังบันทึกสถานะ...' : 'กดเพื่อเปลี่ยนสถานะ เจ้าหน้าที่จะเห็นข้อมูลล่าสุด'}</small>
            </div>
            <div className="awd-status-options" role="radiogroup" aria-label="สถานะรายชื่อ">
              {Object.entries(WAITING_UI_STATUSES).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={status === key}
                  className={`awd-status-option is-${info.tone}${status === key ? ' is-active' : ''}`}
                  disabled={statusBusy}
                  onClick={() => {
                    if (status !== key) onStatusChange(item, key)
                  }}
                >
                  <span aria-hidden="true" />
                  {info.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {actionError && (
          <p className="awd-error" role="alert">
            <WaitingDetailIcon type="info" />
            {actionError}
          </p>
        )}

        <dl className="awd-stats">
          <div className={days >= 30 ? 'is-long' : ''}>
            <dt><WaitingDetailIcon type="clock" size={14} />รอมาแล้ว</dt>
            <dd>{days === 0 ? 'แจ้งวันนี้' : `${days} วัน`}</dd>
            <small>{days >= 30 ? 'รอนานกว่า 1 เดือน' : 'นับจากวันที่แจ้ง'}</small>
          </div>
          <div>
            <dt><WaitingDetailIcon type="calendar" size={14} />วันที่แจ้ง</dt>
            <dd>{formatWaitingDateTime(item.created_at)}</dd>
            <small>
              บันทึกโดย <span className={item.submitted_by_name ? 'waiting-ui-actor' : ''}>{item.submitted_by_name || '-'}</span>
            </small>
          </div>
          <div className={moveIn ? `is-movein-${moveIn.tone}` : 'is-empty'}>
            <dt><WaitingDetailIcon type="calendar" size={14} />ต้องการเข้าอยู่</dt>
            <dd>{item.desired_move_in_date ? formatWaitingDate(item.desired_move_in_date) : 'ไม่ระบุ'}</dd>
            <small>{moveIn ? moveIn.text : 'ยังไม่ได้ระบุวันที่'}</small>
          </div>
        </dl>

        <div className="awd-grid">
          <section className="awd-card">
            <header className="awd-card-head">
              <span className="awd-card-icon"><DoorIcon size={16} /></span>
              <h4>ประเภทห้องที่สนใจ</h4>
            </header>
            {preferences.length > 0 ? (
              <div className="awd-tags">
                {preferences.map((preference) => <span key={preference}>{preference}</span>)}
              </div>
            ) : (
              <p className="awd-empty">ไม่ได้ระบุประเภทห้อง แนะนำห้องว่างที่มีได้ทุกห้อง</p>
            )}
          </section>

          <section className="awd-card">
            <header className="awd-card-head">
              <span className="awd-card-icon"><NoteIcon size={16} /></span>
              <h4>หมายเหตุ</h4>
            </header>
            {item.note ? <p className="awd-note">{item.note}</p> : <p className="awd-empty">ไม่มีหมายเหตุ</p>}
          </section>
        </div>

        <section className="awd-card is-vacancies">
          <header className="awd-card-head">
            <span className="awd-card-icon is-green"><DoorIcon size={16} /></span>
            <h4>
              ห้องว่างตอนนี้
              <span className="awd-count">{vacantRooms.length}</span>
            </h4>
            {vacantRooms.length > 0 && <small>เทียบเลขห้องและราคาต่อเดือน</small>}
          </header>
          {vacantRooms.length > 0 ? (
            <ul className="awd-rooms">
              {vacantRooms.map((room) => {
                const cheapest = lowestPrice != null && Number(room.price) === lowestPrice
                return (
                  <li key={room.room_number} className={cheapest ? 'is-cheapest' : ''}>
                    <span className="awd-room-number">
                      <small>ห้อง</small>
                      <strong>{room.room_number}</strong>
                    </span>
                    <span className="awd-room-price">
                      {room.price != null ? (
                        <>
                          <strong>฿{formatCurrency(room.price)}</strong>
                          <small>/เดือน</small>
                        </>
                      ) : (
                        <small>ไม่ระบุราคา</small>
                      )}
                    </span>
                    {cheapest && <em>ถูกที่สุด</em>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="awd-empty">ยังไม่มีห้องว่าง แจ้งผู้สนใจเมื่อมีห้องว่างแล้วเปลี่ยนสถานะเป็น "ติดต่อแล้ว"</p>
          )}
        </section>
      </div>

      <footer className="awd-actions">
        <span className="awd-actions-hint">
          <WaitingDetailIcon type="info" size={14} />
          {onStatusChange ? 'แก้ชื่อ เบอร์ หรือความต้องการได้ที่ปุ่มแก้ไขข้อมูล' : 'สถานะของรายชื่อนี้จัดการโดย Admin'}
        </span>
        <button type="button" className="awd-btn is-ghost" onClick={onClose}>
          ปิด
        </button>
        <button
          type="button"
          className="awd-btn is-primary"
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
const inspectionKindOf = (inspection) => (inspection.tenant_request_type === 'move_room' ? 'move_room' : 'moveout')

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
  if (kind === 'safety') {
    return (
      <svg {...props}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    )
  }
  if (kind === 'visit') {
    return (
      <svg {...props}>
        <path d="M5 17h14M6 17l1.5-5.5A2 2 0 0 1 9.4 10h5.2a2 2 0 0 1 1.9 1.5L18 17" />
        <circle cx="7.5" cy="17.5" r="1.5" />
        <circle cx="16.5" cy="17.5" r="1.5" />
      </svg>
    )
  }
  if (kind === 'inspection') {
    return (
      <svg {...props}>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3h6v1M9 12l2 2 4-4" />
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

function Modal({ title, onClose, children, variant, headerExtra = null }) {
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
        className={`admin-modal${variant === 'confirm' ? ' admin-modal-confirm' : ''}${variant === 'amenity' ? ' admin-modal-amenity' : ''}${variant === 'form' ? ' admin-modal-form' : ''}${variant === 'wide' ? ' admin-modal-wide' : ''}${variant === 'gallery' ? ' admin-modal-gallery' : ''}${variant === 'waiting-detail' ? ' admin-modal-waiting-detail' : ''}${variant === 'waiting-form' ? ' admin-modal-waiting-form' : ''}${variant === 'room-detail' ? ' admin-modal-room-detail' : ''}${variant === 'room-history' ? ' admin-modal-room-history' : ''}${variant === 'payment-detail' ? ' admin-modal-payment-detail' : ''}${variant === 'rental-history' ? ' admin-modal-rental-history' : ''}${variant === 'moveout-detail' ? ' admin-modal-moveout-detail' : ''}${variant === 'inspection-detail' ? ' admin-modal-inspection-detail' : ''}${variant === 'inspection-form' ? ' admin-modal-inspection-form' : ''}${variant === 'expense' ? ' admin-modal-expense' : ''}${variant === 'customer-profile' ? ' admin-modal-customer-profile' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-header">
          <h3>{title}</h3>
          {headerExtra && <div className="admin-modal-header-extra">{headerExtra}</div>}
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

const SUMMARY_ICON_PATHS = {
  camera: (
    <>
      <path d="M15 10l4.5-2.5v9L15 14" />
      <rect x="3" y="7" width="12" height="10" rx="2" />
    </>
  ),
  cameraOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M15 10l4.5-2.5v9L16 14.5M10 7h3a2 2 0 0 1 2 2v3M7 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" />
    </>
  ),
  rec: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </>
  ),
  motion: (
    <>
      <circle cx="13" cy="4.5" r="1.5" />
      <path d="M7 21l3-6 3 2v4M10 15l1-5 4 3 3 1M8 10l3-1" />
    </>
  ),
  announce: (
    <>
      <path d="M3 10v4a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1Z" />
      <path d="M16 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  total: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  booked: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  vacant: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.3 2.3L15.5 9.5" />
    </>
  ),
  due: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.7-2.5 1.7-2.5.6-2.5 1.8 1.1 2 2.5 2 2.5-.8 2.5-2" />
    </>
  ),
  queue: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5" />
    </>
  ),
  slip: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  maintenance: (
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z" />
  ),
  request: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  parcel: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  car: (
    <>
      <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.6 5H8.4a2 2 0 0 0-1.9 1.3L5 10 3 8" />
      <rect x="3" y="10" width="18" height="8" rx="2" />
      <path d="M7 14h.01M17 14h.01M5 18v2M19 18v2" />
    </>
  ),
  carPending: (
    <>
      <path d="M14.5 13H3.8a1 1 0 0 0-.8.4V19h12v-5.6a1 1 0 0 0-.5-.4Z" />
      <path d="m3 13 1.4-3.3A1.5 1.5 0 0 1 5.8 9h6.4" />
      <path d="M6 16h.01M12 16h.01M4 19v2M14 19v2" />
      <circle cx="18" cy="7" r="4" />
      <path d="M18 5v2l1.3 1" />
    </>
  ),
  safety: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
}

function SummaryIcon({ type }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SUMMARY_ICON_PATHS[type]}
    </svg>
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

const ROWS_PER_PAGE = 15

const TABS = [
  { key: 'dorm-info', label: 'กฎระเบียบและเบอร์ติดต่อ' },
  { key: 'rooms', label: 'ห้องพัก' },
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'market', label: 'ร้านค้าเช่าข้างหอ' },
  { key: 'repair-vendors', label: 'ติดต่อช่าง' },
  { key: 'cameras', label: 'กล้องวงจรปิด' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'customers', label: 'ลูกค้า' },
  { key: 'completed-contracts', label: 'สัญญาที่เสร็จสมบูรณ์' },
  { key: 'moveouts', label: 'ผู้ย้ายออก' },
  { key: 'requests', label: 'ประวัติคำขอผู้เช่า' },
  { key: 'maintenance', label: 'ประวัติแจ้งซ่อม' },
  { key: 'waiting-list', label: 'รายชื่อรอห้องว่าง' },
  { key: 'move-in-inspections', label: 'ตรวจก่อนเข้าอยู่' },
  { key: 'move-out-inspections', label: 'ผลตรวจห้อง' },
  { key: 'parcels', label: 'พัสดุ' },
  { key: 'expenses', label: 'รายจ่าย' },
  { key: 'announcements', label: 'ประกาศ' },
  { key: 'vehicle-requests', label: 'คำขอรถ' },
  { key: 'safety', label: 'ตรวจเหตุฉุกเฉิน' },
]

const TAB_GROUPS = [
  { key: 'residents', label: 'ห้องพักและผู้เช่า', tabs: ['rooms', 'wifi', 'customers', 'moveouts', 'waiting-list'] },
  { key: 'contracts', label: 'สัญญาและตรวจห้อง', tabs: ['completed-contracts', 'move-in-inspections', 'move-out-inspections'] },
  { key: 'services', label: 'คำขอและงานบริการ', tabs: ['requests', 'maintenance', 'vehicle-requests', 'safety'] },
  { key: 'repair', label: 'ติดต่อช่าง', tabs: ['repair-vendors'] },
  { key: 'parcels', label: 'พัสดุ', tabs: ['parcels'] },
  { key: 'announcements', label: 'ประกาศจากหอพัก', tabs: ['announcements'] },
  { key: 'market', label: 'ร้านค้าเช่าข้างหอ', tabs: ['market'] },
  { key: 'management', label: 'จัดการหอพัก', tabs: ['staff', 'expenses', 'cameras'] },
]
const SUMMARY_GROUP_OF = {
  rooms: 'residents', wifi: 'residents', customers: 'residents', moveouts: 'residents', 'waiting-list': 'residents',
  'completed-contracts': 'contracts', 'move-in-inspections': 'inspections', 'move-out-inspections': 'inspections',
  requests: 'services', maintenance: 'services', 'vehicle-requests': 'services', safety: 'services',
  parcels: 'parcels', announcements: 'announcements', market: 'market', cameras: 'cameras', staff: 'staff', expenses: 'finance',
  'repair-vendors': 'repair',
}
const formatRoomSize = (value) => `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 })} ตร.ม.`

const isCustomerMovedOut = (customer) =>
  (Boolean(customer.is_suspended) || customer.room_number == null) && !customer.rental_start_date && !customer.rental_end_date

const CUSTOMER_SEGMENTS = [
  { key: 'all', label: 'ทั้งหมด', match: () => true },
  { key: 'staying', label: 'พักอยู่', match: (customer) => !isCustomerMovedOut(customer) },
  { key: 'moved-out', label: 'ย้ายออกแล้ว', match: isCustomerMovedOut },
  { key: 'active', label: 'ใช้งานปกติ', match: (customer) => !customer.is_suspended },
  { key: 'suspended', label: 'ระงับการใช้งาน', match: (customer) => Boolean(customer.is_suspended) },
  { key: 'deposit', label: 'รอจัดการมัดจำ', match: (customer) => Boolean(customer.contract?.can_settle_deposit) },
]

const customerRegisteredTime = (customer) => new Date(customer.registered_at || 0).getTime() || 0

const CUSTOMER_SORTERS = {
  room: (a, b) => (a.room_number ?? Infinity) - (b.room_number ?? Infinity) || Boolean(a.is_suspended) - Boolean(b.is_suspended),
  newest: (a, b) => customerRegisteredTime(b) - customerRegisteredTime(a),
  oldest: (a, b) => customerRegisteredTime(a) - customerRegisteredTime(b),
  name: (a, b) => `${a.first_name || ''} ${a.last_name || ''}`.localeCompare(`${b.first_name || ''} ${b.last_name || ''}`, 'th'),
}

const CUSTOMER_SORT_OPTIONS = [
  { value: 'room', label: 'เรียงตามเลขห้อง' },
  { value: 'newest', label: 'ลงทะเบียนล่าสุดก่อน' },
  { value: 'oldest', label: 'ลงทะเบียนเก่าสุดก่อน' },
  { value: 'name', label: 'เรียงตามชื่อ' },
]

const TAB_LABEL = Object.fromEntries(TABS.map((tab) => [tab.key, tab.label]))
const TAB_GROUP_OF = Object.fromEntries(TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => [tab, group.key])))

const REQUEST_TYPE_LABEL = { renew: 'ต่อสัญญา', moveout: 'แจ้งย้ายออก', move_room: 'ย้ายห้อง' }
const REQUEST_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'รับเรื่องแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธแล้ว',
  cancelled: 'ยกเลิกแล้ว',
}
const MAINTENANCE_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
}
const PAYMENT_STATUS_LABEL = { paid: 'ชำระแล้ว', pending: 'รอชำระ', overdue: 'ค้างชำระ' }
const PAYMENT_TYPE_LABEL = { rent: 'ค่าเช่า', deposit: 'เงินมัดจำ', water: 'ค่าน้ำ', electricity: 'ค่าไฟฟ้า', room_transfer: 'ส่วนต่างย้ายห้อง' }
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
  appliance: (
    <g>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <path d="M6 9h12M9 5.5v1M9 12v3" />
    </g>
  ),
  door: (
    <g>
      <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" />
      <path d="M3 21h18M14.5 12h.01" />
    </g>
  ),
  building: (
    <g>
      <path d="M3 21h18M5 21V8l7-5 7 5v13" />
      <path d="M9 21v-6h6v6" />
    </g>
  ),
  internet: (
    <g>
      <path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
      <path d="M12 19.5h.01" />
    </g>
  ),
  pest: (
    <g>
      <ellipse cx="12" cy="13" rx="4" ry="6" />
      <path d="M12 7V4M8 11H4M8 15H4.5M16 11h4M16 15h3.5" />
    </g>
  ),
  other: (
    <path d="M14.5 3.5a4 4 0 0 0-5 5L4 14l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2-2 2.5-2.5Z" />
  ),
}

const adminTransferPreviewUrl = (requestId) => `/api/admin/move-out-inspections/move-room-candidates/${requestId}/transfer-preview`

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
const ADMIN_SERVER_PENDING_KINDS = [
  'fine_review', 'fine_unpaid', 'deposit', 'transfer_contract', 'move_in', 'contract_expiry', 'rent_overdue',
  'waiting_list', 'parcel_stale',
]
const ADMIN_TARGET_TABS = {
  visits: 'vehicle-requests', safety: 'safety', requests: 'requests', 'transfer-contracts': 'requests',
  maintenance: 'maintenance', contracts: 'completed-contracts', 'move-in': 'move-in-inspections',
  inspections: 'move-out-inspections', rooms: 'rooms', 'waiting-list': 'waiting-list', parcels: 'parcels',
  staff: 'staff', expenses: 'expenses', 'repair-vendors': 'repair-vendors', market: 'market',
}
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
    const userId = user.id ?? user.username ?? 'current'
    return `${role}-notifications-seen-${userId}`
  } catch {
    return `${role}-notifications-seen-current`
  }
}

function buildAdminTenantNotifs(request) {
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
  const reset = useCallback(() => setExpanded(new Set()), [])
  return [expanded, toggle, reset]
}

function DetailRow({ open, colSpan, fields }) {
  const [rendered, setRendered] = useState(open)

  useEffect(() => {
    const delay = open || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 130
    const timeout = window.setTimeout(() => setRendered(open), delay)
    return () => window.clearTimeout(timeout)
  }, [open])

  if (!rendered) return null
  return (
    <tr className={`admin-detail-row${open ? '' : ' is-closing'}`} aria-hidden={!open}>
      <td colSpan={colSpan}>
        <div className="admin-detail-reveal">
          <div className="admin-detail-grid">
            {fields.map(({ label, value }) => (
              <div className="admin-detail-item" key={label}>
                <span className="admin-detail-item-label">{label}</span>
                <span className="admin-detail-item-value">{value}</span>
              </div>
            ))}
          </div>
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

function flashHighlight(element, className) {
  element.classList.remove(className, 'is-fading')
  void element.offsetWidth
  element.classList.add(className, 'is-fading')
  element.addEventListener('animationend', () => element.classList.remove(className, 'is-fading'), { once: true })
}

function useFocusScroll() {
  const pendingRef = useRef(null)
  const [, setNonce] = useState(0)

  useEffect(() => {
    if (pendingRef.current == null) return
    const element = document.querySelector(`[data-admin-focus="${pendingRef.current}"]`)
    if (!element) return
    pendingRef.current = null
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flashHighlight(element, 'admin-focus-flash')
  })

  return useCallback((key) => {
    pendingRef.current = key
    setNonce((value) => value + 1)
  }, [])
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

const ADMIN_REQUEST_NEXT_STEP = {
  renew: { pending: 'ขั้นต่อไป: อนุมัติต่อสัญญา', in_progress: 'ขั้นต่อไป: อนุมัติต่อสัญญา' },
  moveout: { pending: 'ขั้นต่อไป: รับเรื่อง', in_progress: 'ขั้นต่อไป: ตรวจห้องและอนุมัติ' },
}

function getAdminRequestDetails(request) {
  const phone = { key: 'phone', icon: 'phone', label: 'โทร', value: request.phone || '-' }
  if (request.type === 'renew') {
    return [
      phone,
      {
        key: 'duration',
        icon: 'calendar',
        label: 'ระยะเวลา',
        value: RENEW_DURATION_LABEL[request.renew_duration_months] || (request.renew_duration_months ? `${request.renew_duration_months} เดือน` : '-'),
      },
      { key: 'payment', icon: 'wallet', label: 'การชำระเงิน', value: RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type || '-' },
    ]
  }
  if (request.type === 'move_room') {
    return [
      phone,
      { key: 'reason', icon: 'info', label: 'เหตุผล', value: request.move_reason ? MOVE_ROOM_REASON_LABEL[request.move_reason] || request.move_reason : '-' },
      { key: 'date', icon: 'calendar', label: 'ต้องการย้าย', value: request.preferred_move_date ? formatDate(request.preferred_move_date) : 'ไม่ระบุ' },
    ]
  }
  return [phone, { key: 'created', icon: 'clock', label: 'แจ้งเมื่อ', value: `${formatDateTime(request.created_at)} น.` }]
}

const ADMIN_REQUEST_STEP_ICON = {
  created: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></>,
  accepted: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 12l2 2 4-4" /></>,
  approved: <path d="M5 12.5 10 17l9-10" />,
  rejected: <path d="M6 6l12 12M18 6 6 18" />,
  movein: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M10 21v-6h4v6" /></>,
  moveout: <><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  repair: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
}

const ADMIN_MAINTENANCE_NEXT_STEP = {
  pending: { label: 'ขั้นต่อไป: รับเรื่อง', tone: 'is-waiting' },
  in_progress: { label: 'กำลังดำเนินการซ่อม', tone: 'is-info' },
}

function AdminMaintenanceCard({ request, onOpen, onPhotos }) {
  const nextStep = ADMIN_MAINTENANCE_NEXT_STEP[request.status]
  const photos = request.photos || []
  const steps = [{ key: 'created', icon: 'created', label: 'แจ้งซ่อม', by: `${request.first_name || ''} ${request.last_name || ''}`.trim(), date: request.created_at, tone: 'info' }]
  if (request.accepted_at) steps.push({ key: 'accepted', icon: 'accepted', label: 'รับเรื่อง', by: request.accepted_by_name, date: request.accepted_at, tone: 'info' })
  if (request.completed_at) {
    const done = request.status === 'done'
    steps.push({
      key: 'completed',
      icon: done ? 'repair' : 'rejected',
      label: done ? 'ซ่อมเสร็จแล้ว' : 'ยกเลิกแล้ว',
      by: request.completed_by_name,
      date: request.completed_at,
      tone: done ? 'success' : 'danger',
    })
  }
  return (
    <article className="admin-req-card type-maintenance" data-admin-focus={`maintenance-${request.id}`}>
      <div className="admin-req-head">
        <span className="admin-req-avatar" aria-hidden="true">
          <WaitingDetailIcon type="user" size={18} />
        </span>
        <div className="admin-req-identity">
          <strong>{request.first_name} {request.last_name}</strong>
          <span className="admin-req-type is-maintenance">แจ้งซ่อม</span>
        </div>
        <span className={`admin-badge status-${request.status}`}>{MAINTENANCE_STATUS_LABEL[request.status] || request.status}</span>
      </div>
      <div className="admin-req-route">
        <div className="admin-req-route-room is-target">
          <small>ห้องที่แจ้งซ่อม</small>
          <strong>{request.room_number}</strong>
        </div>
        {nextStep && <span className={`admin-req-route-check ${nextStep.tone}`}>{nextStep.label}</span>}
      </div>
      <dl className="admin-req-details">
        {[
          { key: 'phone', icon: 'phone', label: 'โทร', value: request.contact_phone || request.phone || '-' },
          { key: 'category', icon: 'tool', label: 'หมวดหมู่', value: MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ' },
          { key: 'time', icon: 'clock', label: 'เวลาสะดวก', value: MAINTENANCE_TIME_LABEL[request.preferred_time] || 'เวลาไหนก็ได้' },
        ].map((detail) => (
          <div key={detail.key} className="admin-req-detail">
            <dt>
              <WaitingDetailIcon type={detail.icon} size={15} />
              {detail.label}
            </dt>
            <dd>{detail.value}</dd>
          </div>
        ))}
      </dl>
      {request.description && (
        <div className="admin-req-note">
          <span className="admin-req-note-label">รายละเอียดปัญหา</span>
          <p>{request.description}</p>
        </div>
      )}
      {photos.length > 0 && (
        <div className="admin-req-photos">
          <span className="admin-req-photos-label">รูปประกอบ · {photos.length} รูป</span>
          <div className="admin-req-photos-list">
            {photos.slice(0, 4).map((photo, index) => (
              <button
                key={`${photo.url}-${index}`}
                type="button"
                className="parcel-thumb"
                aria-label={`ดูรูปแจ้งซ่อมห้อง ${request.room_number} รูปที่ ${index + 1}`}
                onClick={() => onPhotos(request, index)}
              >
                <UploadImage src={photo.url} alt="" />
                {index === 3 && photos.length > 4 && <span>+{photos.length - 4}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="admin-req-footer">
        <AdminCardSteps steps={steps} />
        <button type="button" className="admin-action-btn is-view admin-req-open" onClick={() => onOpen(request)}>
          ดูรายละเอียด
        </button>
      </div>
    </article>
  )
}

function AdminCardSteps({ steps }) {
  return (
    <ol className="admin-req-meta">
      {steps.map((step) => (
        <li key={step.key} className={`admin-req-meta-step is-${step.tone}`}>
          <span className="admin-req-meta-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              {ADMIN_REQUEST_STEP_ICON[step.icon]}
            </svg>
          </span>
          <span className="admin-req-meta-body">
            <span className="admin-req-meta-label">{step.label}</span>
            <span className="admin-req-meta-sub">
              {step.by && (
                <span className="admin-req-meta-by" title={step.by}>
                  โดย <strong>{step.by}</strong>
                </span>
              )}
              <time dateTime={step.date}>
                {step.dateOnly
                  ? formatDate(step.date)
                  : `${new Date(step.date).toLocaleString('th-TH', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} น.`}
              </time>
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function AdminMoveoutCard({ moveout, idcardRevealed, onToggleIdCard, onOpen }) {
  const stayDays = calcStayDays(moveout.move_in_date, moveout.completed_at)
  const steps = [
    ...(moveout.move_in_date ? [{ key: 'movein', icon: 'movein', label: 'เข้าพัก', date: moveout.move_in_date, dateOnly: true, tone: 'info' }] : []),
    { key: 'created', icon: 'created', label: 'แจ้งย้ายออก', date: moveout.created_at, tone: 'info' },
    ...(moveout.completed_at
      ? [{ key: 'completed', icon: 'moveout', label: 'ย้ายออกเรียบร้อย', by: moveout.completed_by_name, date: moveout.completed_at, tone: 'success' }]
      : []),
  ]
  return (
    <article className="admin-req-card type-moveout" data-admin-focus={`moveouts-${moveout.id}`}>
      <div className="admin-req-head">
        <span className="admin-req-avatar" aria-hidden="true">
          <WaitingDetailIcon type="user" size={18} />
        </span>
        <div className="admin-req-identity">
          <strong>{moveout.first_name} {moveout.last_name}</strong>
          <span className="admin-req-type is-moveout">ผู้ย้ายออก</span>
        </div>
        <span className="admin-badge status-approved">ย้ายออกแล้ว</span>
      </div>
      <div className="admin-req-route">
        <div className="admin-req-route-room is-target">
          <small>ห้องที่ย้ายออก</small>
          <strong>{moveout.room_number}</strong>
        </div>
        {stayDays !== null && <span className="admin-req-route-check is-info">พักอยู่ {stayDays} วัน</span>}
      </div>
      <dl className="admin-req-details">
        <div className="admin-req-detail">
          <dt>
            <WaitingDetailIcon type="phone" size={15} />
            โทร
          </dt>
          <dd>{moveout.phone || '-'}</dd>
        </div>
        <div className="admin-req-detail">
          <dt>
            <WaitingDetailIcon type="idcard" size={15} />
            บัตรประชาชน
          </dt>
          <dd>
            <button type="button" className="admin-idcard-toggle" onClick={onToggleIdCard} title={idcardRevealed ? 'ซ่อนเลขบัตร' : 'แสดงเลขบัตร'}>
              {idcardRevealed ? moveout.idcard : '•'.repeat(String(moveout.idcard || '').length || 13)}
            </button>
          </dd>
        </div>
      </dl>
      {moveout.note && (
        <div className="admin-req-note">
          <span className="admin-req-note-label">เหตุผลการย้ายออก</span>
          <p>{moveout.note}</p>
        </div>
      )}
      <div className="admin-req-footer">
        <AdminCardSteps steps={steps} />
        <button type="button" className="admin-action-btn is-view admin-req-open" onClick={() => onOpen(moveout)}>
          ดูรายละเอียด
        </button>
      </div>
    </article>
  )
}

function getAdminRequestSteps(request) {
  const steps = [{ key: 'created', icon: 'created', label: 'ส่งคำขอ', by: `${request.first_name || ''} ${request.last_name || ''}`.trim(), date: request.created_at, tone: 'info' }]
  if (request.accepted_at) steps.push({ key: 'accepted', icon: 'accepted', label: 'รับเรื่อง', by: request.accepted_by_name, date: request.accepted_at, tone: 'info' })
  if (request.completed_at) {
    const approved = request.status === 'approved'
    steps.push({
      key: 'completed',
      icon: approved ? 'approved' : 'rejected',
      label: approved ? 'อนุมัติแล้ว' : request.status === 'cancelled' ? 'ยกเลิกแล้ว' : 'ปฏิเสธแล้ว',
      by: request.completed_by_name,
      date: request.completed_at,
      tone: approved ? 'success' : 'danger',
    })
  }
  return steps
}

function AdminRequestCard({ request, onOpen }) {
  const open = ['pending', 'in_progress'].includes(request.status)
  const nextStep = ADMIN_REQUEST_NEXT_STEP[request.type]?.[request.status]
  const roomLabel = request.type === 'renew' ? 'ห้องที่ขอต่อสัญญา' : request.type === 'moveout' ? 'ห้องที่แจ้งย้ายออก' : 'ห้องเดิม'
  return (
    <article className={`admin-req-card type-${request.type}`} data-admin-focus={`requests-${request.id}`}>
      <div className="admin-req-head">
        <span className="admin-req-avatar" aria-hidden="true">
          <WaitingDetailIcon type="user" size={18} />
        </span>
        <div className="admin-req-identity">
          <strong>{request.first_name} {request.last_name}</strong>
          <span className={`admin-req-type is-${request.type}`}>{REQUEST_TYPE_LABEL[request.type] || request.type}</span>
        </div>
        <span className={`admin-badge status-${request.status}`}>{REQUEST_STATUS_LABEL[request.status] || request.status}</span>
      </div>
      <div className="admin-req-route">
        <div className={`admin-req-route-room${request.type === 'move_room' ? '' : ' is-target'}`}>
          <small>{roomLabel}</small>
          <strong>{request.room_number}</strong>
        </div>
        {request.type === 'move_room' && (
          <>
            <span className="admin-req-route-arrow" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="12" x2="20" y2="12" />
                <polyline points="14 6 20 12 14 18" />
              </svg>
            </span>
            <div className="admin-req-route-room is-target">
              <small>ห้องใหม่</small>
              <strong>{request.target_room_number || '-'}</strong>
            </div>
          </>
        )}
        {request.type === 'move_room' && open ? (
          <span className={`admin-req-route-check ${request.inspection_id ? 'is-done' : 'is-waiting'}`}>
            {request.inspection_id ? 'ตรวจห้องแล้ว' : 'รอตรวจสภาพห้อง'}
          </span>
        ) : nextStep ? (
          <span className={`admin-req-route-check ${request.status === 'pending' ? 'is-waiting' : 'is-info'}`}>{nextStep}</span>
        ) : null}
      </div>
      <dl className="admin-req-details">
        {getAdminRequestDetails(request).map((detail) => (
          <div key={detail.key} className="admin-req-detail">
            <dt>
              <WaitingDetailIcon type={detail.icon} size={15} />
              {detail.label}
            </dt>
            <dd>{detail.value}</dd>
          </div>
        ))}
      </dl>
      {request.note && (
        <div className="admin-req-note">
          <span className="admin-req-note-label">{request.type === 'moveout' ? 'เหตุผลการย้ายออก' : 'หมายเหตุ'}</span>
          <p>{request.note}</p>
        </div>
      )}
      <div className="admin-req-footer">
        <AdminCardSteps steps={getAdminRequestSteps(request)} />
        <button type="button" className="admin-action-btn is-view admin-req-open" onClick={() => onOpen(request)}>
          ดูรายละเอียด
        </button>
      </div>
    </article>
  )
}

function CustomerProfile({ customer, contract, rentalHistory, loading, error, idcardRevealed, onToggleIdCard, onRetry, onOpenHistory, onEdit, onToggleSuspend, onDepositSettled }) {
  const [now] = useState(() => Date.now())
  const payments = (rentalHistory || []).flatMap((booking) => booking.payments || [])
  const paidTotal = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const outstanding =
    payments.filter((payment) => payment.status === 'pending' || payment.status === 'overdue').length +
    (contract?.deposit_status === 'due' ? 1 : 0)
  const movedOut = (Boolean(customer.is_suspended) || customer.room_number == null) && !customer.rental_start_date && !customer.rental_end_date
  const facts = [
    { icon: 'phone', label: 'เบอร์โทร', value: customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : '-' },
    { icon: 'user', label: 'อายุ', value: customer.age ? `${customer.age} ปี` : '-' },
    {
      icon: 'idcard',
      label: 'บัตรประชาชน',
      value: (
        <button type="button" className="admin-idcard-toggle" onClick={onToggleIdCard}>
          {idcardRevealed ? customer.idcard : '•'.repeat(String(customer.idcard || '').length || 13)}
        </button>
      ),
    },
    {
      icon: 'wallet',
      label: 'เงินมัดจำ',
      value: formatDepositSummary(contract ?? { deposit_amount: customer.deposit_amount }),
    },
  ]
  const registeredAt = customer.registered_at || customer.created_at
  const contractStart = customer.rental_start_date ? new Date(customer.rental_start_date) : null
  const contractEnd = customer.rental_end_date ? new Date(customer.rental_end_date) : null
  const dayMs = 24 * 60 * 60 * 1000
  const remainingDays = contractEnd ? Math.ceil((contractEnd - now) / dayMs) : null
  const contractTone = remainingDays === null ? 'muted' : remainingDays < 0 ? 'danger' : remainingDays <= 30 ? 'warning' : 'active'

  return (
    <div className="customer-profile">
      <div className="customer-profile-scroll">
        <div className="customer-profile-column">
        <div className={`customer-profile-hero${customer.is_suspended ? ' is-suspended' : ''}`}>
          <span className="customer-profile-avatar" aria-hidden="true"><RoomDetailIcon type="user" size={24} /></span>
          <div className="customer-profile-name">
            <strong>{customer.first_name} {customer.last_name}</strong>
            <span>
              {customer.room_number ? (
                <span className="customer-profile-room"><RoomDetailIcon type="home" size={13} />ห้อง {customer.room_number}</span>
              ) : (
                <span className="customer-profile-room is-empty">ไม่มีห้องพัก</span>
              )}
              {movedOut && <span className="customer-profile-note">ย้ายออกจากหอพักแล้ว</span>}
            </span>
            {registeredAt && (
              <small className="customer-profile-since">
                <RoomDetailIcon type="calendar" size={12} />
                เข้าพักเมื่อ <strong>{formatDate(registeredAt)}</strong>
              </small>
            )}
          </div>
          <span className={`admin-badge status-${customer.is_suspended ? 'suspended' : 'active'}`}>
            {customer.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
          </span>
        </div>

        <dl className="customer-profile-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt><WaitingDetailIcon type={fact.icon} size={14} />{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        <section className={`customer-profile-contract is-${contractTone}`}>
          <header>
            <span className="customer-profile-contract-icon"><RoomDetailIcon type="calendar" size={16} /></span>
            <strong>ระยะเวลาสัญญา</strong>
            {remainingDays !== null && (
              <span className="customer-profile-contract-badge">
                {remainingDays < 0 ? `หมดสัญญาแล้ว ${Math.abs(remainingDays)} วัน` : remainingDays === 0 ? 'หมดสัญญาวันนี้' : `เหลืออีก ${remainingDays} วัน`}
              </span>
            )}
          </header>
          {contractStart || contractEnd ? (
            <>
              <div className="customer-profile-contract-range">
                <span className="customer-profile-contract-point">
                  <small>เริ่มสัญญา</small>
                  <strong>{contractStart ? formatDate(customer.rental_start_date) : '-'}</strong>
                </span>
                <span className="customer-profile-contract-arrow" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
                <span className="customer-profile-contract-point">
                  <small>สิ้นสุดสัญญา</small>
                  <strong>{contractEnd ? formatDate(customer.rental_end_date) : '-'}</strong>
                </span>
              </div>
            </>
          ) : (
            <p className="customer-profile-contract-empty">ยังไม่มีสัญญาเช่าที่ใช้งานอยู่</p>
          )}
        </section>

        <section className="customer-profile-history">
          <header>
            <span className="admin-room-form-icon"><RoomDetailIcon type="history" size={16} /></span>
            <div>
              <strong>ประวัติการเช่า</strong>
              <small>สรุปสัญญาและการชำระเงินทั้งหมดของลูกค้าคนนี้</small>
            </div>
          </header>
          {loading ? (
            <p className="customer-profile-state">กำลังโหลดข้อมูล...</p>
          ) : error ? (
            <p className="customer-profile-state is-error">
              {error}
              <button type="button" onClick={onRetry}>ลองใหม่</button>
            </p>
          ) : (
            <div className="customer-profile-stats">
              <span><strong>{(rentalHistory || []).length}</strong>สัญญาเช่า</span>
              <span><strong>{payments.length}</strong>รายการชำระ</span>
              <span className="is-success"><strong>฿{formatCurrency(paidTotal)}</strong>ชำระแล้ว</span>
              <span className={outstanding > 0 ? 'is-warning' : ''}><strong>{outstanding}</strong>ค้าง / รอชำระ</span>
            </div>
          )}
          <button type="button" className="admin-action-btn is-primary customer-profile-history-btn" onClick={onOpenHistory} disabled={loading || Boolean(error)}>
            <RoomDetailIcon type="history" size={15} />
            ดูประวัติการเช่า
          </button>
        </section>
        </div>

        <section className="customer-profile-history customer-profile-rental-contract">
          <header>
            <span className="admin-room-form-icon"><RoomDetailIcon type="note" size={16} /></span>
            <div>
              <strong>สัญญาเช่าและรูปสัญญา</strong>
              <small>ข้อมูลการลงทะเบียน มัดจำ และค่าเช่าเดือนแรก</small>
            </div>
            {contract?.is_archived && <ArchivedContractBadge contract={contract} />}
          </header>
          {loading && !contract ? (
            <p className="customer-profile-state">กำลังโหลดข้อมูล...</p>
          ) : (
            <ContractDetail contract={contract} onDepositSettled={onDepositSettled} />
          )}
        </section>
      </div>
      <div className="customer-profile-actions">
        <button type="button" className="admin-action-btn is-ghost" onClick={onEdit}>แก้ไขข้อมูล</button>
        <button type="button" className={`admin-action-btn ${customer.is_suspended ? 'is-success' : 'is-warning'}`} onClick={onToggleSuspend}>
          {customer.is_suspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
        </button>
      </div>
    </div>
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

function AmenitiesList({ room }) {
  const amenities = [
    room.air_conditioner && 'แอร์',
    room.refrigerator && 'ตู้เย็น',
    ...parseRoomAmenities(room.custom_amenities),
  ].filter(Boolean)
  if (amenities.length === 0) return '-'
  return (
    <div className="admin-amenities-list">
      {amenities.map((amenity) => (
        <span key={typeof amenity === 'string' ? amenity : amenity.name} className="admin-amenity-item">
          {typeof amenity === 'string' ? amenity : <><CustomAmenityIcon name={amenity.icon} size={14} />{amenity.name}</>}
        </span>
      ))}
    </div>
  )
}

const ROOM_AMENITIES = [
  { key: 'air_conditioner', label: 'เครื่องปรับอากาศ' },
  { key: 'refrigerator', label: 'ตู้เย็น' },
]

const BUILTIN_EQUIPMENT = [
  { field: 'air_conditioner', name: 'เครื่องปรับอากาศ', icon: 'aircon' },
  { field: 'refrigerator', name: 'ตู้เย็น', icon: 'fridge' },
]

const ROOM_AMENITY_SUGGESTIONS = [
  ...BUILTIN_EQUIPMENT.map((item) => ({ name: item.name, icon: item.icon })),
  { name: 'โต๊ะทำงาน', icon: 'desk' },
  { name: 'ตู้เสื้อผ้า', icon: 'wardrobe' },
  { name: 'เครื่องทำน้ำอุ่น', icon: 'shower' },
  { name: 'โทรทัศน์', icon: 'tv' },
  { name: 'ระเบียง', icon: 'balcony' },
  { name: 'โซฟา', icon: 'sofa' },
]

function availableAssetSuggestions(form) {
  const used = new Set(
    [
      ...form.custom_amenities.map((item) => item.name),
      ...form.assetRows.map((row) => row.name.trim()),
      ...BUILTIN_EQUIPMENT.filter((item) => form[item.field]).map((item) => item.name),
    ].map((name) => name.toLocaleLowerCase()),
  )
  return ROOM_AMENITY_SUGGESTIONS.filter((suggestion) => !used.has(suggestion.name.toLocaleLowerCase()))
}

function roomEquipmentItems(form) {
  const amenities = [
    ...BUILTIN_EQUIPMENT.filter((item) => form[item.field]).map((item) => ({ name: item.name, icon: item.icon })),
    ...form.custom_amenities,
  ]
  return [
    ...amenities.map((item) => ({ ...item, asset: form.assetRows.find((row) => row.name.trim() === item.name) })),
    ...form.assetRows
      .filter((row) => !amenities.some((item) => item.name === row.name.trim()))
      .map((row) => ({ name: row.name.trim(), icon: 'sparkle', asset: row })),
  ]
}

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
  const elapsedDays = Math.max(0, Math.floor((now - startMs) / (1000 * 60 * 60 * 24)))
  const daysLeft = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24))
  const tone = daysLeft < 0 ? 'danger' : daysLeft <= 30 ? 'warning' : 'success'
  const label = daysLeft < 0 ? `หมดสัญญาแล้ว ${Math.abs(daysLeft)} วัน` : daysLeft === 0 ? 'ครบสัญญาวันนี้' : `เหลืออีก ${daysLeft} วัน`
  return { elapsedDays, tone, label }
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

      <dl className="payment-detail-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt><RoomDetailIcon type={fact.icon} size={14} />{fact.label}</dt>
            <dd>{fact.href ? <a className="maintenance-detail-tel" href={`tel:${fact.href}`}>{fact.value}</a> : fact.value || '-'}</dd>
          </div>
        ))}
      </dl>

      <section className="payment-detail-section">
        <h4><RoomDetailIcon type="history" size={16} />สถานะการแจ้งซ่อม</h4>
        <MaintenanceSteps request={request} />
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

function MaintenanceSteps({ request }) {
  const cancelled = request.status === 'cancelled'
  const finished = request.status === 'done' || cancelled
  return (
    <ProcessSteps
      actorClassName="admin-actor-inline"
      startDate={request.created_at}
      endDate={finished ? request.completed_at : null}
      waitingText={request.status === 'pending' ? 'รอเจ้าหน้าที่รับเรื่อง' : 'กำลังดำเนินการซ่อม'}
      steps={[
        { key: 'request', label: 'แจ้งซ่อม', by: `${request.first_name || ''} ${request.last_name || ''}`.trim(), date: request.created_at, icon: 'note' },
        {
          key: 'accept',
          label: 'เจ้าหน้าที่รับเรื่อง',
          by: request.accepted_by_name,
          date: request.accepted_at,
          icon: 'user',
          pendingText: cancelled ? 'ไม่ได้รับเรื่อง' : 'กำลังรอดำเนินการ',
        },
        {
          key: 'done',
          label: cancelled ? 'ยกเลิกแล้ว' : finished ? 'ซ่อมเสร็จสิ้น' : 'รอซ่อมเสร็จ',
          by: request.completed_by_name,
          date: finished ? request.completed_at : null,
          icon: cancelled ? 'x' : 'tool',
          tone: cancelled ? 'danger' : undefined,
          pendingText: 'ยังไม่ถึงขั้นตอนนี้',
        },
      ]}
    />
  )
}

function MoveoutSteps({ moveout }) {
  return (
    <ProcessSteps
      actorClassName="admin-actor-inline"
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
  const cancelled = request.status === 'cancelled'
  const finished = request.status === 'approved' || rejected || cancelled
  return (
    <ProcessSteps
      actorClassName="admin-actor-inline"
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
          label: cancelled ? 'ยกเลิกคำขอ' : rejected ? 'ปฏิเสธคำขอ' : finished ? 'อนุมัติคำขอ' : 'รอผลการพิจารณา',
          by: request.completed_by_name,
          date: finished ? request.completed_at : null,
          icon: rejected || cancelled ? 'x' : 'check',
          tone: rejected || cancelled ? 'danger' : undefined,
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

function MoveoutDetailCard({ icon, title, hint, tone, action, children }) {
  return (
    <section className={`amd-card${tone ? ` is-${tone}` : ''}`}>
      <header className="amd-card-head">
        <span className="amd-card-icon"><RoomDetailIcon type={icon} size={16} /></span>
        <div className="amd-card-title">
          <h4>{title}</h4>
          {hint && <small>{hint}</small>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function MoveoutDetailEmpty({ icon, title, text }) {
  return (
    <div className="amd-empty">
      <span className="amd-empty-icon"><RoomDetailIcon type={icon} size={18} /></span>
      <div>
        <strong>{title}</strong>
        {text && <span>{text}</span>}
      </div>
    </div>
  )
}

function splitChecklistLabel(label) {
  const index = label.indexOf(' (')
  return index === -1 ? { main: label, sub: '' } : { main: label.slice(0, index), sub: label.slice(index + 2, -1) }
}

function MoveoutDetail({ row, detail, loading, error, onRetry, onOpenInspection, onSelectPayment, idcardRevealed, onToggleIdCard }) {
  const moveout = detail?.moveout ? { ...row, ...detail.moveout } : row
  const paymentList = detail?.paymentList || []
  const stayDays = calcStayDays(moveout.move_in_date, moveout.completed_at)
  const inspection = detail?.inspection
  const inspectionSummary = inspection ? summarizeInspection(inspection.checklist) : null
  const idcard = String(moveout.idcard || '')
  const totals = detail?.payments
  const unpaidTotal = totals ? Number(totals.pending.total) + Number(totals.overdue.total) : 0
  const issueCount = inspectionSummary ? inspectionSummary.counts.damaged + inspectionSummary.counts.missing : 0
  const alerts = detail
    ? [
        totals?.overdue.total > 0 && { tone: 'danger', icon: 'wallet', text: `ค้างชำระ ฿${formatCurrency(totals.overdue.total)} (${totals.overdue.count} รายการ)` },
        totals?.pending.total > 0 && { tone: 'warning', icon: 'clock', text: `รอชำระ ฿${formatCurrency(totals.pending.total)} (${totals.pending.count} รายการ)` },
        issueCount > 0 && { tone: 'danger', icon: 'clipboard', text: `ตรวจห้องพบชำรุด/สูญหาย ${issueCount} รายการ` },
        detail.maintenance.open > 0 && { tone: 'warning', icon: 'wrench', text: `แจ้งซ่อมค้าง ${detail.maintenance.open} รายการ` },
      ].filter(Boolean)
    : []
  const facts = [
    {
      label: 'บัตรประชาชน',
      value: (
        <button type="button" className="admin-idcard-toggle" onClick={onToggleIdCard} aria-label={idcardRevealed ? 'ซ่อนเลขบัตรประชาชน' : 'แสดงเลขบัตรประชาชน'}>
          {idcardRevealed ? idcard || '-' : '•'.repeat(idcard.length || 13)}
        </button>
      ),
    },
    { label: 'เบอร์โทร', value: moveout.phone ? <a className="amd-link" href={`tel:${moveout.phone}`}>{moveout.phone}</a> : '-' },
    { label: 'อายุ', value: moveout.age ? `${moveout.age} ปี` : '-' },
    { label: 'ลงทะเบียนเมื่อ', value: formatDate(moveout.registered_at) },
    { label: 'ค่าเช่าห้อง', value: moveout.room_price != null ? `฿${formatCurrency(moveout.room_price)} / เดือน` : '-' },
    { label: 'เงินมัดจำ', value: moveout.deposit_amount != null ? `฿${formatCurrency(moveout.deposit_amount)}` : '-' },
  ]

  return (
    <div className="amd">
      <header className="amd-hero">
        <div className="amd-hero-person">
          <span className="amd-avatar" aria-hidden="true"><PersonIcon size={24} /></span>
          <div className="amd-hero-name">
            <small>ผู้เช่าที่ย้ายออก</small>
            <strong>{moveout.first_name} {moveout.last_name}</strong>
            <div className="amd-hero-tags">
              <span className="amd-tag is-room">
                <RoomDetailIcon type="home" size={13} />
                ห้อง {moveout.room_number}
              </span>
              <span className="amd-tag is-done">
                <RoomDetailIcon type="check" size={13} />
                ย้ายออกเรียบร้อย
              </span>
            </div>
          </div>
        </div>
        <dl className="amd-stay">
          <div>
            <dt><RoomDetailIcon type="calendar" size={13} />เข้าพัก</dt>
            <dd>{formatDate(moveout.move_in_date)}</dd>
          </div>
          <span className="amd-stay-arrow" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
          <div>
            <dt><RoomDetailIcon type="door" size={13} />ย้ายออก</dt>
            <dd>{formatDateTime(moveout.completed_at)}</dd>
          </div>
          <div className="is-total">
            <dt><RoomDetailIcon type="clock" size={13} />รวมพัก</dt>
            <dd>
              {stayDays !== null ? `${stayDays} วัน` : '-'}
              {stayDays !== null && stayDays >= 30 && <small>ประมาณ {formatDays(stayDays)}</small>}
            </dd>
          </div>
        </dl>
      </header>

      <section className={`amd-tenant-note${moveout.note ? '' : ' is-empty'}`}>
        <span className="amd-tenant-note-icon"><RoomDetailIcon type="note" size={16} /></span>
        <div>
          <strong>หมายเหตุจากผู้เช่า</strong>
          <p>{moveout.note || 'ผู้เช่าไม่ได้ระบุเหตุผลหรือรายละเอียดเพิ่มเติม'}</p>
        </div>
      </section>

      {loading ? (
        <div className="amd-status-bar" role="status">
          <span className="amd-spinner" aria-hidden="true" />
          กำลังโหลดผลตรวจห้องและประวัติการชำระเงิน...
        </div>
      ) : error ? (
        <div className="amd-status-bar is-error" role="alert">
          <RoomDetailIcon type="alert" size={16} />
          <span>{error}</span>
          <button type="button" className="admin-action-btn is-ghost" onClick={onRetry}>ลองใหม่</button>
        </div>
      ) : detail ? (
        alerts.length > 0 ? (
          <ul className="amd-alerts" aria-label="สิ่งที่ต้องตรวจสอบ">
            {alerts.map((alert) => (
              <li key={alert.text} className={`is-${alert.tone}`}>
                <RoomDetailIcon type={alert.icon} size={14} />
                {alert.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="amd-clear">
            <RoomDetailIcon type="check" size={14} />
            ไม่มียอดค้าง ห้องไม่มีความเสียหาย และไม่มีงานซ่อมค้าง
          </p>
        )
      ) : null}

      <div className="amd-grid">
        <div className="amd-col">
          <MoveoutDetailCard icon="user" title="ข้อมูลผู้เช่า">
            <dl className="amd-facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </MoveoutDetailCard>

          <MoveoutDetailCard
            icon="history"
            title="ขั้นตอนการย้ายออก"
            hint={moveout.preferred_move_date ? `ผู้เช่าต้องการย้ายออก ${formatDate(moveout.preferred_move_date)}` : undefined}
          >
            <MoveoutSteps moveout={moveout} />
          </MoveoutDetailCard>
        </div>

        <div className="amd-col">
          <MoveoutDetailCard
            icon="clipboard"
            title="ผลตรวจห้องตอนย้ายออก"
            tone={inspectionSummary?.tone === 'danger' ? 'danger' : undefined}
            hint={
              inspection
                ? `ตรวจโดย ${inspection.inspected_by_name || '-'} · ${formatDate(inspection.created_at)}`
                : detail ? 'ยังไม่มีข้อมูลการตรวจห้อง' : undefined
            }
            action={
              inspection && (
                <span className={`amd-chip ${inspection.status === 'reviewed' ? 'is-success' : 'is-warning'}`}>
                  {MOVE_OUT_INSPECTION_STATUS[inspection.status] || inspection.status}
                </span>
              )
            }
          >
            {!detail ? (
              <MoveoutDetailEmpty icon="clipboard" title={loading ? 'กำลังโหลดผลตรวจห้อง' : 'ยังโหลดผลตรวจไม่ได้'} text={loading ? undefined : 'กดลองใหม่ด้านบน'} />
            ) : inspection ? (
              <>
                <div className={`amd-verdict is-${inspectionSummary.tone}`}>
                  <strong>{INSPECTION_TONE_LABEL[inspectionSummary.tone]}</strong>
                  <div className="amd-verdict-stats">
                    <span className="is-success"><b>{inspectionSummary.counts.good}</b>ปกติ</span>
                    <span className="is-warning"><b>{inspectionSummary.counts.wear}</b>สึกหรอ</span>
                    <span className="is-danger"><b>{issueCount}</b>ชำรุด/หาย</span>
                    <span><b>{inspection.photo_count || 0}</b>รูป</span>
                  </div>
                </div>
                <ul className="amd-checklist">
                  {MOVE_OUT_CHECKLIST.map((item) => {
                    const result = inspection.checklist?.[item.key]
                    const info = INSPECTION_RESULT_INFO[result] || INSPECTION_RESULT_INFO.none
                    const label = splitChecklistLabel(item.label)
                    return (
                      <li key={item.key} className={`is-${info.tone}`} title={item.label}>
                        <span className="amd-checklist-label">
                          <strong>{label.main}</strong>
                          {label.sub && <small>{label.sub}</small>}
                        </span>
                        <span className={`amd-chip is-${info.tone}`}>{info.label}</span>
                      </li>
                    )
                  })}
                </ul>
                <div className={`amd-damage${inspection.damage_note ? ' has-note' : ''}`}>
                  <RoomDetailIcon type="note" size={14} />
                  <span>{inspection.damage_note || 'ไม่มีบันทึกความเสียหาย'}</span>
                </div>
                <button type="button" className="admin-action-btn is-primary amd-block-btn" onClick={() => onOpenInspection(inspection)}>
                  <RoomDetailIcon type="clipboard" size={15} />
                  ดูผลตรวจห้องแบบเต็ม
                </button>
              </>
            ) : (
              <MoveoutDetailEmpty icon="clipboard" title="ไม่พบผลตรวจห้อง" text="ไม่พบผลตรวจห้องของการย้ายออกครั้งนี้" />
            )}
          </MoveoutDetailCard>

          <MoveoutDetailCard
            icon="wallet"
            title="การชำระเงินระหว่างพัก"
            tone={totals?.overdue.total > 0 ? 'danger' : undefined}
            hint={detail ? `${paymentList.length} รายการ` : undefined}
          >
            {detail ? (
              <>
                <div className="amd-totals">
                  <div className="is-success">
                    <span>ชำระแล้ว</span>
                    <strong>฿{formatCurrency(totals.paid.total)}</strong>
                  </div>
                  <div className={totals.pending.total > 0 ? 'is-warning' : 'is-zero'}>
                    <span>รอชำระ</span>
                    <strong>฿{formatCurrency(totals.pending.total)}</strong>
                  </div>
                  <div className={totals.overdue.total > 0 ? 'is-danger' : 'is-zero'}>
                    <span>ค้างชำระ</span>
                    <strong>฿{formatCurrency(totals.overdue.total)}</strong>
                  </div>
                </div>
                {unpaidTotal === 0 && paymentList.length > 0 && <p className="amd-muted">ชำระครบทุกรายการแล้ว</p>}
                {paymentList.length > 0 ? (
                  <ul className="amd-payments">
                    {paymentList.map((payment) => {
                      const date = new Date(payment.payment_date || payment.created_at)
                      const validDate = !Number.isNaN(date.getTime())
                      const select = () => onSelectPayment(payment)
                      return (
                        <li
                          key={payment.id}
                          className={`is-${payment.status}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดการชำระ ฿${formatCurrency(payment.amount)}`}
                          onClick={select}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              select()
                            }
                          }}
                        >
                          <span className="amd-date">
                            <strong>{validDate ? date.getDate() : '-'}</strong>
                            <small>{validDate ? date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }) : ''}</small>
                          </span>
                          <span className="amd-payment-main">
                            <strong>{PAYMENT_TYPE_LABEL[payment.type] || payment.type}</strong>
                            <span className={`admin-badge status-${PAYMENT_BADGE_CLASS[payment.status] || 'pending'}`}>
                              {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                            </span>
                          </span>
                          <span className="amd-amount">฿{formatCurrency(payment.amount)}</span>
                          <svg className="amd-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <MoveoutDetailEmpty icon="wallet" title="ไม่มีรายการชำระเงิน" text="ไม่พบการชำระเงินระหว่างที่พักห้องนี้" />
                )}
              </>
            ) : (
              <MoveoutDetailEmpty icon="wallet" title={loading ? 'กำลังโหลดการชำระเงิน' : 'ยังโหลดข้อมูลการชำระเงินไม่ได้'} />
            )}
          </MoveoutDetailCard>

          <MoveoutDetailCard
            icon="wrench"
            title="การแจ้งซ่อมระหว่างพัก"
            tone={detail?.maintenance.open > 0 ? 'warning' : undefined}
          >
            {detail ? (
              <dl className="amd-maintenance">
                <div>
                  <dt>แจ้งซ่อมทั้งหมด</dt>
                  <dd>{detail.maintenance.total}<small>ครั้ง</small></dd>
                </div>
                <div className={detail.maintenance.open > 0 ? 'is-warning' : 'is-success'}>
                  <dt>ยังค้างอยู่</dt>
                  <dd>{detail.maintenance.open}<small>รายการ</small></dd>
                </div>
              </dl>
            ) : (
              <MoveoutDetailEmpty icon="wrench" title={loading ? 'กำลังโหลดข้อมูลแจ้งซ่อม' : 'ยังโหลดข้อมูลแจ้งซ่อมไม่ได้'} />
            )}
          </MoveoutDetailCard>
        </div>
      </div>
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
              const tenantContract = tenant.contract
              const effectiveEnd = tenantContract?.effective_end_date || tenant.rental_end_date
              const tenantExtended = Boolean(
                tenantContract?.rental_end_date
                && effectiveEnd
                && new Date(effectiveEnd).getTime() > new Date(tenantContract.rental_end_date).getTime(),
              )
              const stay = formatStayLength(tenant.rental_start_date, effectiveEnd)
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
                      <span className="tenant-card-badges">
                        <span className={`tenant-card-status is-${status.tone}`}>{status.label}</span>
                        {tenantContract && ['awaiting_payment', 'payment_review', 'ended_early', 'expired'].includes(tenantContract.status) && (
                          <ContractStatusBadge status={tenantContract.status} />
                        )}
                      </span>
                    </div>
                    {tenant.phone && (
                      <a className="room-detail-row-phone" href={`tel:${tenant.phone}`}>
                        <RoomDetailIcon type="phone" size={13} />
                        {tenant.phone}
                      </a>
                    )}
                  </header>

                  <div className="tenant-card-period">
                    <div className="is-start">
                      <span>เริ่มสัญญา</span>
                      <strong>{formatDate(tenant.rental_start_date || tenant.created_at)}</strong>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <polyline points="14 6 20 12 14 18" />
                    </svg>
                    {tenantExtended ? (
                      <div className="is-renew">
                        <span>ต่อสัญญาถึง</span>
                        <strong>{formatDate(effectiveEnd)}</strong>
                        <small>สิ้นสุดเดิม <s>{formatDate(tenantContract.rental_end_date)}</s></small>
                      </div>
                    ) : (
                      <div className="is-end">
                        <span>สิ้นสุดสัญญา</span>
                        <strong>{formatDate(effectiveEnd)}</strong>
                      </div>
                    )}
                    {stay && <span className="room-detail-chip is-stay"><RoomDetailIcon type="clock" size={11} />อยู่ {stay}</span>}
                  </div>

                  <dl className="tenant-card-facts">
                    <div><dt>อายุ</dt><dd>{tenant.age ? `${tenant.age} ปี` : '-'}</dd></div>
                    <div>
                      <dt>เงินมัดจำ</dt>
                      <dd>
                        {Number(tenant.deposit_amount) > 0
                          ? `฿${formatCurrency(tenant.deposit_amount)}${tenantContract ? ` (${formatDepositMonths(tenantContract)})` : ''}`
                          : 'ไม่มีมัดจำ'}
                        {tenantContract && DEPOSIT_STATUS_LABEL[tenantContract.deposit_status] && (
                          <small className={`room-detail-deposit-status is-${tenantContract.deposit_status}`}>
                            {DEPOSIT_STATUS_LABEL[tenantContract.deposit_status]}
                          </small>
                        )}
                      </dd>
                    </div>
                    <div><dt>ลงทะเบียนเมื่อ</dt><dd>{formatDate(tenant.registered_at)}</dd></div>
                    <div><dt>ทำสัญญาเมื่อ</dt><dd>{formatDate(tenant.created_at)}</dd></div>
                  </dl>
                  {tenantContract?.deposit_refund && <DepositRefundNote contract={tenantContract} compact />}

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

function RoomDetailChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function RoomDetailCard({ icon, title, hint, count, action, tone, className = '', children }) {
  return (
    <section className={`ard-card${tone ? ` is-${tone}` : ''}${className ? ` ${className}` : ''}`}>
      <header className="ard-card-head">
        <span className="ard-card-icon"><RoomDetailIcon type={icon} size={16} /></span>
        <div className="ard-card-title">
          <h4>
            {title}
            {count > 0 && <span className="ard-card-count">{count}</span>}
          </h4>
          {hint && <small>{hint}</small>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function RoomDetailLink({ onClick, children }) {
  return (
    <button type="button" className="ard-link" onClick={onClick}>
      {children}
      <RoomDetailChevron />
    </button>
  )
}

function RoomDetailEmpty({ icon, title, text }) {
  return (
    <div className="ard-empty">
      <span className="ard-empty-icon"><RoomDetailIcon type={icon} size={18} /></span>
      <div>
        <strong>{title}</strong>
        {text && <span>{text}</span>}
      </div>
    </div>
  )
}

function rowKeyHandler(action) {
  return (event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }
}

function RoomDetails({ room, detail, loading, error, onEdit, onRetry, onOpenHistory, onSelectPayment, onOpenTenants, onOpenMaintenance }) {
  const [now] = useState(() => Date.now())
  const [contractOpen, setContractOpen] = useState(false)
  const data = detail?.room ? { ...room, ...detail.room } : room
  const tenant = detail ? detail.tenant : room.customer_id ? { first_name: room.first_name, last_name: room.last_name, phone: room.phone } : null
  const contract = describeContract(data.rental_start_date, data.rental_end_date, now)
  const roomContract = detail?.contract ?? null
  const roomExtended = Boolean(
    roomContract?.rental_end_date
    && data.rental_end_date
    && new Date(data.rental_end_date).getTime() > new Date(roomContract.rental_end_date).getTime(),
  )
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
  const hasPeriod = Boolean(data.rental_start_date || data.rental_end_date)
  const customAmenities = parseRoomAmenities(data.custom_amenities)
  const availableAmenities = ROOM_AMENITIES.filter((amenity) => Boolean(data[amenity.key]))
  const missingAmenities = ROOM_AMENITIES.filter((amenity) => !data[amenity.key])
  const depositAmount = Number(roomContract?.deposit_amount) > 0
    ? roomContract.deposit_transfer_adjusted || Number(roomContract.deposit_transfer_deducted) > 0 ? roomContract.deposit_remaining : roomContract.deposit_amount
    : null
  const contractRent = roomContract?.monthly_price ?? null
  const rentDiffers = contractRent != null && Number(contractRent) !== Number(data.price)
  const summaryValue = (value) => (detail ? value : loading ? '…' : '-')
  const lastInspection = detail?.lastInspection

  return (
    <div className="ard">
      <div className="ard-scroll">
        <header className={`ard-hero is-${heroTone}`}>
          <div className="ard-hero-room">
            <small>ห้อง</small>
            <strong>{data.room_number}</strong>
            <span>ชั้น {String(data.room_number).charAt(0)}</span>
          </div>
          <div className="ard-hero-main">
            <span className="ard-status">
              <span aria-hidden="true" />
              {ROOM_HERO_STATUS_LABEL[heroTone]}
            </span>
            <div className="ard-hero-price">
              <strong>฿{formatCurrency(data.price)}</strong>
              <span>/ เดือน</span>
            </div>
            <div className="ard-hero-meta">
              {tenant ? (
                <span>
                  <RoomDetailIcon type="user" size={13} />
                  {tenant.first_name} {tenant.last_name}
                </span>
              ) : (
                <span>
                  <RoomDetailIcon type="door" size={13} />
                  ไม่มีผู้เช่า
                </span>
              )}
              {contract && (
                <span className={`is-${contract.tone}`}>
                  <RoomDetailIcon type="clock" size={13} />
                  {contract.label}
                </span>
              )}
              <span className={data.room_size != null ? '' : 'is-muted'}>
                <RoomDetailIcon type="home" size={13} />
                {data.room_size != null ? `ขนาด ${formatRoomSize(data.room_size)}` : 'ยังไม่ระบุขนาดห้อง'}
              </span>
              {data.created_at && (
                <span className="is-muted">
                  <RoomDetailIcon type="calendar" size={13} />
                  เพิ่มเข้าระบบ {formatDate(data.created_at)}
                </span>
              )}
            </div>
          </div>
          <dl className="ard-hero-stats">
            <div className={`is-maintenance${detail ? (openMaintenance > 0 ? ' is-warning' : ' is-success') : ''}`}>
              <dt><RoomDetailIcon type="wrench" size={14} />แจ้งซ่อมค้าง</dt>
              <dd>{summaryValue(openMaintenance)}</dd>
              <small>{detail ? `ทั้งหมด ${totalMaintenance} รายการ` : 'รอข้อมูล'}</small>
            </div>
            <div className={`is-parcel${detail ? (detail.parcels?.pending > 0 ? ' is-info' : ' is-calm') : ''}`}>
              <dt><RoomDetailIcon type="box" size={14} />พัสดุรอรับ</dt>
              <dd>{summaryValue(detail?.parcels?.pending ?? 0)}</dd>
              <small>{detail ? `ทั้งหมด ${detail.parcels?.total ?? 0} ชิ้น` : 'รอข้อมูล'}</small>
            </div>
            <div
              className={`is-inspection${
                !detail
                  ? ''
                  : !lastInspection
                    ? ' is-calm'
                    : lastInspection.status === 'reviewed'
                      ? ' is-success'
                      : lastInspection.status === 'follow_up'
                        ? ' is-danger'
                        : ' is-warning'
              }`}
            >
              <dt><RoomDetailIcon type="clipboard" size={14} />ตรวจห้องล่าสุด</dt>
              <dd className="is-text">
                {detail
                  ? lastInspection ? MOVE_OUT_INSPECTION_STATUS[lastInspection.status] || lastInspection.status : 'ไม่มี'
                  : summaryValue('')}
              </dd>
              <small>{detail ? (lastInspection ? formatDate(lastInspection.created_at) : 'ยังไม่เคยตรวจ') : 'รอข้อมูล'}</small>
            </div>
          </dl>
        </header>

        {loading ? (
          <div className="ard-status-bar" role="status">
            <span className="ard-spinner" aria-hidden="true" />
            กำลังโหลดข้อมูลผู้เช่า การชำระเงิน และประวัติห้อง...
          </div>
        ) : error ? (
          <div className="ard-status-bar is-error" role="alert">
            <RoomDetailIcon type="alert" size={16} />
            <span>{error}</span>
            <button type="button" className="admin-action-btn is-ghost" onClick={onRetry}>ลองใหม่</button>
          </div>
        ) : null}

        <div className="ard-grid">
          <div className="ard-col">
            <RoomDetailCard
              icon="user"
              title="ผู้เช่าปัจจุบัน"
              action={(detail?.history || []).length > 0 && <RoomDetailLink onClick={() => onOpenTenants()}>ผู้เช่าทั้งหมด</RoomDetailLink>}
            >
              {tenant ? (
                <div className="ard-tenant">
                  <div className="ard-tenant-id">
                    <span className="ard-avatar" aria-hidden="true"><PersonIcon size={20} /></span>
                    <div>
                      <strong>{tenant.first_name} {tenant.last_name}</strong>
                      {tenant.phone ? (
                        <a href={`tel:${tenant.phone}`}>
                          <RoomDetailIcon type="phone" size={13} />
                          {tenant.phone}
                        </a>
                      ) : (
                        <span className="is-muted">ไม่มีเบอร์โทร</span>
                      )}
                    </div>
                  </div>
                  {detail?.tenant && (
                    <dl className="ard-facts is-2">
                      <div><dt>อายุ</dt><dd>{tenant.age ? `${tenant.age} ปี` : '-'}</dd></div>
                      <div><dt>ลงทะเบียนเมื่อ</dt><dd>{formatDate(tenant.created_at)}</dd></div>
                    </dl>
                  )}
                </div>
              ) : (
                <RoomDetailEmpty icon="door" title="ห้องว่าง พร้อมให้เช่า" text="ยังไม่มีผู้เช่าในห้องนี้" />
              )}
            </RoomDetailCard>

            <RoomDetailCard
              icon="calendar"
              title="สัญญาและเงินมัดจำ"
              className="ard-contract"
              action={
                roomContract && (
                  <div className="ard-contract-actions">
                    <ContractStatusBadge status={roomContract.status} />
                    <RoomDetailLink onClick={() => setContractOpen(true)}>ดูสัญญาเต็ม</RoomDetailLink>
                  </div>
                )
              }
            >
              {hasPeriod ? (
                <>
                  {roomContract && <ContractFirstPaymentNote contract={roomContract} />}
                  {roomContract && <DepositRefundNote contract={roomContract} />}
                  <div className="ard-period">
                    <div className="ard-period-dates">
                      <span>
                        <small>เริ่มสัญญา</small>
                        <b>{formatDate(data.rental_start_date)}</b>
                      </span>
                      <span className="ard-period-track" aria-hidden="true">
                        {data.rental_duration_months && <em>{data.rental_duration_months} เดือน</em>}
                      </span>
                      <span className="is-end">
                        <small>{roomExtended ? 'ต่อสัญญาถึง' : 'สิ้นสุดสัญญา'}</small>
                        <b>{formatDate(data.rental_end_date)}</b>
                        {roomExtended && <small className="is-old">เดิม {formatDate(roomContract.rental_end_date)}</small>}
                      </span>
                    </div>
                    {contract && (
                      <div className="ard-period-meta">
                        <span>{contract.tone === 'danger' ? 'ครบระยะสัญญาแล้ว' : `ผ่านไปแล้ว ${contract.elapsedDays} วัน`}</span>
                        <em className={`is-${contract.tone}`}>{contract.label}</em>
                      </div>
                    )}
                  </div>
                  {roomContract ? (
                    <dl className="ard-facts is-4">
                      <div>
                        <dt>ค่าเช่าตามสัญญา</dt>
                        <dd>฿{formatCurrency(contractRent)}</dd>
                        <small>{rentDiffers ? `ราคาห้องตอนนี้ ฿${formatCurrency(data.price)}` : roomContract.billing_periods > 0 ? `${roomContract.billing_periods} รอบบิล` : 'ต่อเดือน'}</small>
                      </div>
                      <div className="is-deposit">
                        <dt>เงินมัดจำ</dt>
                        <dd>{depositAmount != null ? `฿${formatCurrency(depositAmount)}` : 'ไม่มี'}</dd>
                        {depositAmount != null && (
                          <small>
                            {formatDepositMonths(roomContract)}
                            {DEPOSIT_STATUS_LABEL[roomContract.deposit_status] && (
                              <b className={`ard-deposit-status is-${roomContract.deposit_status}`}>{DEPOSIT_STATUS_LABEL[roomContract.deposit_status]}</b>
                            )}
                          </small>
                        )}
                      </div>
                      <div className="is-paid">
                        <dt>รับค่าเช่าแล้ว</dt>
                        <dd>฿{formatCurrency(roomContract.rent_paid)}</dd>
                        <small>รวมทุกงวดที่ชำระ</small>
                      </div>
                      <div>
                        <dt>ยอดตามสัญญา</dt>
                        <dd>฿{formatCurrency(roomContract.contract_total)}</dd>
                        <small>รวม {roomContract.billing_periods || 0} เดือน</small>
                      </div>
                    </dl>
                  ) : (
                    !loading && !detail && <p className="ard-muted">ข้อมูลเงินมัดจำจะแสดงเมื่อโหลดรายละเอียดเสร็จ</p>
                  )}
                </>
              ) : (
                <RoomDetailEmpty icon="calendar" title="ยังไม่มีสัญญาเช่า" text={data.is_booked ? 'ไม่พบวันเริ่มและวันสิ้นสุดสัญญา' : 'จะแสดงเมื่อมีการลงทะเบียนผู้เช่า'} />
              )}
              {contractOpen && roomContract && <ContractFullModal contract={roomContract} onClose={() => setContractOpen(false)} />}
            </RoomDetailCard>

            {detail && tenant && (
              <RoomDetailCard
                icon="wallet"
                title="การชำระเงินล่าสุด"
                count={payments.length}
                hint={payments.length > 0 ? `ชำระแล้ว ฿${formatCurrency(paidTotal)}${pendingPayments > 0 ? ` · ค้าง/รอ ${pendingPayments} รายการ` : ''}` : 'ของผู้เช่าปัจจุบัน'}
                action={<RoomDetailLink onClick={onOpenHistory}>ดูทั้งหมด</RoomDetailLink>}
              >
                {payments.length > 0 ? (
                  <ul className="ard-rows">
                    {payments.map((payment) => {
                      const tone = payment.status === 'paid' ? 'is-success' : payment.status === 'overdue' ? 'is-danger' : 'is-warning'
                      const noteParts = parsePaymentNote(payment.note)
                      const select = () => onSelectPayment(payment)
                      return (
                        <li
                          key={payment.id}
                          className={tone}
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดการชำระ ฿${formatCurrency(payment.amount)}`}
                          onClick={select}
                          onKeyDown={rowKeyHandler(select)}
                        >
                          <RoomDetailDateTile value={payment.payment_date} />
                          <div className="ard-row-main">
                            <strong className="is-money">฿{formatCurrency(payment.amount)}</strong>
                            <div className="ard-row-meta">
                              <span className="ard-chip">
                                <RoomDetailIcon type="wallet" size={11} />
                                {PAYMENT_TYPE_LABEL[payment.type] || payment.type}
                              </span>
                              {noteParts.tags
                                .filter((tag) => tag.tone !== 'info')
                                .slice(0, 1)
                                .map((tag) => (
                                  <span key={tag.text} className={`ard-chip is-${tag.tone}`}>
                                    <RoomDetailIcon type={tag.icon} size={11} />
                                    {tag.value}
                                  </span>
                                ))}
                            </div>
                            {noteParts.main && <p className="ard-row-note" title={payment.note}>{noteParts.main}</p>}
                          </div>
                          <span className={`admin-badge status-${PAYMENT_BADGE_CLASS[payment.status] || 'pending'}`}>
                            {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                          </span>
                          <span className="ard-row-chevron" aria-hidden="true"><RoomDetailChevron /></span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <RoomDetailEmpty icon="wallet" title="ยังไม่มีประวัติการชำระเงิน" text="รายการจะแสดงเมื่อผู้เช่าชำระหรือมีบิล" />
                )}
              </RoomDetailCard>
            )}
          </div>

          <div className="ard-col">
            <RoomDetailCard icon="bolt" title="ค่าเช่าและสาธารณูปโภค" hint="อัตราที่ใช้ออกบิลของห้องนี้">
              <dl className="ard-rates">
                <div>
                  <dt><span className="ard-rate-icon is-rent"><RoomDetailIcon type="home" size={14} /></span>ค่าเช่าห้อง</dt>
                  <dd>฿{formatCurrency(data.price)}<small>/เดือน</small></dd>
                </div>
                <div>
                  <dt><span className="ard-rate-icon is-electric"><RoomDetailIcon type="bolt" size={14} /></span>ค่าไฟ</dt>
                  <dd>฿{formatCurrency(data.electricity_unit_price)}<small>/หน่วย</small></dd>
                </div>
                <div>
                  <dt><span className="ard-rate-icon is-water"><RoomDetailIcon type="drop" size={14} /></span>ค่าน้ำเหมาจ่าย</dt>
                  <dd>฿{formatCurrency(data.water_price)}<small>/เดือน</small></dd>
                </div>
                <div>
                  <dt><span className="ard-rate-icon is-water"><RoomDetailIcon type="drop" size={14} /></span>ค่าน้ำตามหน่วย</dt>
                  <dd>฿{formatCurrency(data.water_unit_price)}<small>/หน่วย</small></dd>
                </div>
              </dl>
            </RoomDetailCard>

            <RoomDetailCard
              icon="sparkle"
              title="สิ่งอำนวยความสะดวก"
              count={availableAmenities.length + customAmenities.length}
            >
              {availableAmenities.length + customAmenities.length > 0 ? (
                <div className="ard-amenities">
                  {availableAmenities.map((amenity) => (
                    <span key={amenity.key} className="is-on">
                      <RoomDetailIcon type="check" size={13} />
                      {amenity.label}
                    </span>
                  ))}
                  {customAmenities.map((amenity) => (
                    <span key={amenity.name} className="is-on is-custom">
                      <CustomAmenityIcon name={amenity.icon} size={14} />
                      {amenity.name}
                    </span>
                  ))}
                </div>
              ) : (
                <RoomDetailEmpty icon="sparkle" title="ยังไม่ได้ระบุสิ่งอำนวยความสะดวก" text="เพิ่มได้จากปุ่มแก้ไขข้อมูลห้อง" />
              )}
              {missingAmenities.length > 0 && (
                <p className="ard-amenities-missing">
                  ไม่มี: {missingAmenities.map((amenity) => amenity.label).join(' · ')}
                </p>
              )}
            </RoomDetailCard>

            {detail && (
              <RoomDetailCard
                icon="wrench"
                title="แจ้งซ่อมล่าสุด"
                count={detail.maintenance.length}
                tone={openMaintenance > 0 ? 'warning' : undefined}
                hint={totalMaintenance > 0 ? `ค้างอยู่ ${openMaintenance} จากทั้งหมด ${totalMaintenance} รายการ` : undefined}
                action={totalMaintenance > 0 && <RoomDetailLink onClick={() => onOpenMaintenance()}>ดูทั้งหมด</RoomDetailLink>}
              >
                {detail.maintenance.length > 0 ? (
                  <ul className="ard-rows">
                    {detail.maintenance.map((request) => {
                      const category = MAINTENANCE_CATEGORY_LABEL[request.category] ? request.category : 'other'
                      const open = () => onOpenMaintenance(request.id)
                      return (
                        <li
                          key={request.id}
                          className={`is-maintenance-${request.status}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดแจ้งซ่อม ${MAINTENANCE_CATEGORY_LABEL[category]}`}
                          onClick={open}
                          onKeyDown={rowKeyHandler(open)}
                        >
                          <span className={`ard-row-icon category-${category}`} aria-hidden="true">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              {MAINTENANCE_CATEGORY_ICON[category]}
                            </svg>
                          </span>
                          <div className="ard-row-main">
                            <strong>{MAINTENANCE_CATEGORY_LABEL[category]}</strong>
                            {request.description && <p className="ard-row-note">{request.description}</p>}
                            <div className="ard-row-meta">
                              <span className="ard-meta">
                                <RoomDetailIcon type="calendar" size={12} />
                                แจ้ง {formatDate(request.created_at)}
                              </span>
                              {request.completed_at && (
                                <span className="ard-meta is-success">
                                  <RoomDetailIcon type="check" size={12} />
                                  เสร็จ {formatDate(request.completed_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`admin-badge status-${request.status}`}>
                            {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
                          </span>
                          <span className="ard-row-chevron" aria-hidden="true"><RoomDetailChevron /></span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <RoomDetailEmpty icon="wrench" title="ไม่มีประวัติการแจ้งซ่อม" text="ห้องนี้ยังไม่เคยแจ้งซ่อม" />
                )}
              </RoomDetailCard>
            )}

            {detail && (
              <RoomDetailCard
                icon="history"
                title="ประวัติผู้เช่าก่อนหน้า"
                count={pastTenants.length}
                hint={pastTenants.length > 0 ? 'เรียงจากล่าสุดไปเก่าสุด' : undefined}
                action={(detail.history || []).length > 0 && <RoomDetailLink onClick={() => onOpenTenants()}>ดูทั้งหมด</RoomDetailLink>}
              >
                {pastTenants.length > 0 ? (
                  <ul className="ard-rows">
                    {pastTenants.map((booking) => {
                      const stay = formatStayLength(booking.rental_start_date, booking.rental_end_date)
                      const open = () => onOpenTenants(booking.booking_id)
                      return (
                        <li
                          key={booking.booking_id}
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดผู้เช่า ${booking.first_name} ${booking.last_name}`}
                          onClick={open}
                          onKeyDown={rowKeyHandler(open)}
                        >
                          <span className="ard-row-icon is-person" aria-hidden="true"><PersonIcon size={17} /></span>
                          <div className="ard-row-main">
                            <strong>{booking.first_name} {booking.last_name}</strong>
                            <div className="ard-row-meta">
                              <span className="ard-meta">
                                <RoomDetailIcon type="calendar" size={12} />
                                {booking.rental_start_date && booking.rental_end_date
                                  ? `${formatDate(booking.rental_start_date)} – ${formatDate(booking.rental_end_date)}`
                                  : `ทำสัญญา ${formatDate(booking.created_at)}`}
                              </span>
                              {stay && (
                                <span className="ard-chip">
                                  <RoomDetailIcon type="clock" size={11} />
                                  อยู่ {stay}
                                </span>
                              )}
                            </div>
                            {booking.phone && (
                              <div className="ard-row-meta">
                                <a className="ard-meta is-link" href={`tel:${booking.phone}`} onClick={(event) => event.stopPropagation()}>
                                  <RoomDetailIcon type="phone" size={12} />
                                  {booking.phone}
                                </a>
                              </div>
                            )}
                          </div>
                          <span className="ard-row-chevron" aria-hidden="true"><RoomDetailChevron /></span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <RoomDetailEmpty icon="history" title="ไม่มีประวัติผู้เช่าก่อนหน้า" text="ห้องนี้ยังไม่เคยมีผู้เช่าคนอื่น" />
                )}
              </RoomDetailCard>
            )}
          </div>
        </div>
      </div>

      <footer className="ard-actions">
        {data.is_booked ? (
          <span className="ard-actions-note">
            <RoomDetailIcon type="alert" size={14} />
            ห้องที่มีผู้เช่าอยู่แก้ไขข้อมูลไม่ได้
          </span>
        ) : (
          <span className="ard-actions-note is-muted">ห้องว่าง แก้ไขราคา สิ่งอำนวยความสะดวก หรือเลขห้องได้</span>
        )}
        <button type="button" className="admin-action-btn is-ghost" onClick={onOpenHistory}>
          <RoomDetailIcon type="wallet" size={15} />
          ประวัติการจ่ายเงิน
        </button>
        <button type="button" className="admin-action-btn is-primary" onClick={onEdit} disabled={Boolean(data.is_booked)} title={data.is_booked ? 'ห้องที่มีผู้เช่าอยู่ไม่สามารถแก้ไขได้' : undefined}>
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
  room_size: '',
  electricity_unit_price: '8',
  water_unit_price: '100',
  water_price: '100',
  custom_amenities: [],
  air_conditioner: false,
  wifi: false,
  refrigerator: false,
  bathroom: false,
  cctv: false,
  room_type_id: null,
  assetRows: [],
}

const emptyStaffForm = { idcard: '', password: '', confirm_password: '', phone: '', first_name: '', last_name: '', age: '' }

const emptyCustomerForm = { first_name: '', last_name: '', phone: '', age: '', deposit_amount: '', password: '', confirm_password: '' }

const emptyExpenseForm = {
  category: '',
  description: '',
  amount: '',
  expense_date: '',
  vendor: '',
  payment_method: '',
  receipt_number: '',
  room_number: '',
  keptPhotos: [],
  newPhotos: [],
}
const EMPTY_EXPENSE_FILTERS = { search: '', category: '', from: '', to: '' }
const EXPENSES_PAGE_SIZE = 9
const EXPENSE_MAX_PHOTOS = 6
const EXPENSE_CATEGORY_PRESETS = ['ค่าน้ำ', 'ค่าไฟ', 'ซ่อมบำรุง', 'ทำความสะอาด', 'วัสดุอุปกรณ์', 'อินเทอร์เน็ต', 'เงินเดือน', 'อื่นๆ']
const EXPENSE_PAYMENT_METHOD_LABEL = { cash: 'เงินสด', transfer: 'โอนเงิน', card: 'บัตร', other: 'อื่นๆ' }
const emptyWaitingListForm = { full_name: '', phone: '', room_preference: '', note: '', desired_move_in_date: '' }
const INSPECTION_PHOTO_PREVIEW_COUNT = 4
const INSPECTION_GALLERY_PAGE_SIZE = 8
const WAITING_PHONE_PATTERN = /^[0-9+\-\s]{9,20}$/

const RESIDENT_VISIT_TYPE_LABEL = { vehicle: 'รถ / ที่จอดรถ', overnight_guest: 'แจ้งแขกค้างคืน' }

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
const SAFETY_PAGE_SIZE = 12

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

function getVisitHeading(item) {
  return item.request_type === 'vehicle' ? item.vehicle_plate || 'ไม่ระบุทะเบียน' : item.guest_name || 'ผู้มาพัก'
}

function buildAdminSafetyNotifs(item) {
  if (item.status !== 'pending') return []
  const urgent = item.severity === 'urgent'
  return [
    {
      key: `safety-${item.id}-pending`,
      title: `แจ้งเหตุ: ${SAFETY_INCIDENT_TYPE_LABEL[item.incident_type] || item.incident_type}`,
      label: urgent ? 'แจ้งเหตุด่วน รอตรวจสอบ' : 'แจ้งเหตุใหม่ รอตรวจสอบ',
      tone: urgent ? 'danger' : 'pending',
      date: item.created_at,
      preview: item.description || item.reporter_name,
      previewLabel: item.description ? 'รายละเอียดเหตุการณ์' : 'ผู้แจ้ง',
      kind: 'safety',
      request: item,
    },
  ]
}

function buildAdminVisitNotifs(item) {
  if (item.status !== 'pending') return []
  return [
    {
      key: `visit-${item.id}-pending`,
      title: RESIDENT_VISIT_TYPE_LABEL[item.request_type] || 'คำขอผู้เช่า',
      label: 'คำขอใหม่ รออนุมัติ',
      tone: 'pending',
      date: item.created_at,
      preview: `${getVisitHeading(item)}${item.room_number ? ` · ห้อง ${item.room_number}` : ''}`,
      previewLabel: item.request_type === 'vehicle' ? 'ทะเบียนรถ' : 'ผู้มาพัก',
      kind: 'visit',
      request: item,
    },
  ]
}

function buildAdminInspectionNotifs(inspection) {
  if (inspection.tenant_request_id || (inspection.status || 'pending') !== 'pending') return []
  return [
    {
      key: `inspection-${inspection.id}-pending`,
      title: `ผลตรวจห้องย้ายออก ห้อง ${inspection.room_number}`,
      label: MOVE_OUT_INSPECTION_STATUS.pending,
      tone: summarizeInspection(inspection.checklist).tone === 'danger' ? 'danger' : 'pending',
      date: inspection.created_at,
      preview: inspection.damage_note || inspection.tenant_name,
      previewLabel: inspection.damage_note ? 'รายละเอียดที่พบ' : 'ผู้เช่า',
      kind: 'inspection',
      request: inspection,
    },
  ]
}

function AdminSafetyIncidentsTab({ onCountChange, focusId = null }) {
  const pendingFocusRef = useRef(focusId)
  const requestFocus = useFocusScroll()
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

  const load = useCallback(
    () =>
      axios
        .get('/api/admin/safety-incidents')
        .then(({ data }) => {
          const list = data.incidents || []
          setIncidents(list)
          onCountChange?.(list.filter((item) => item.status === 'pending').length)
          if (pendingFocusRef.current != null) {
            const sorted = list.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            const index = sorted.findIndex((item) => item.id === pendingFocusRef.current)
            pendingFocusRef.current = null
            if (index >= 0) {
              setFilter('all')
              setSearch('')
              setPage(Math.floor(index / SAFETY_PAGE_SIZE) + 1)
              setNote('')
              setDetailId(sorted[index].id)
              requestFocus(`safety-${sorted[index].id}`)
            }
          }
        })
        .catch((error) => setMessage(error.response?.data?.message || 'โหลดรายงานเหตุไม่สำเร็จ'))
        .finally(() => setLoading(false)),
    [onCountChange, requestFocus],
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
      await axios.patch(`/api/admin/safety-incidents/${detail.id}/review`, { reviewNote: note })
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
              <article key={item.id} data-admin-focus={`safety-${item.id}`} className={`admin-incident-card is-${status.tone} is-${item.severity}`}>
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
              { key: 'report', label: 'แจ้งเหตุ', by: detail.reporter_name, date: detail.created_at, icon: 'shield' },
              detail.status === 'reviewed'
                ? { key: 'review', label: 'ตรวจสอบแล้ว', by: detail.reviewed_by_name, note: detail.review_note, date: detail.reviewed_at, icon: 'check' }
                : detail.status === 'cancelled'
                  ? { key: 'review', label: 'ยกเลิกแล้ว', by: detail.cancelled_by_name, note: detail.cancel_reason, date: detail.cancelled_at, icon: 'x', tone: 'danger' }
                  : { key: 'review', label: 'รอตรวจสอบ', date: null, icon: 'check', pendingText: 'กำลังรอตรวจสอบ' },
            ]
            const stepsEnd = detail.status === 'reviewed' ? detail.reviewed_at : detail.status === 'cancelled' ? detail.cancelled_at : null
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

                <ProcessSteps
                  title="ขั้นตอนการดำเนินการ"
                  actorClassName="admin-actor-inline"
                  startDate={detail.created_at}
                  endDate={stepsEnd}
                  waitingText="รอตรวจสอบ"
                  steps={steps}
                />

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
  const [contractSummary, setContractSummary] = useState(null)
  const [pendingSafetyCount, setPendingSafetyCount] = useState(0)
  const [tabFocus, setTabFocus] = useState(null)
  const [notifDetail, setNotifDetail] = useState(null)
  const requestRowFocus = useFocusScroll()
  useEffect(() => {
    if (tabFocus && activeTab !== tabFocus.tab) setTabFocus(null)
  }, [activeTab, tabFocus])
  const [notifVisitItems, setNotifVisitItems] = useState([])
  const [notifSafetyItems, setNotifSafetyItems] = useState([])
  const [serviceCounts, setServiceCounts] = useState({ requestPending: 0, maintenancePending: 0 })
  const [seenTabItems, setSeenTabItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(getNotificationStorageKey('admin-tabs')) || '{}')
    } catch {
      return {}
    }
  })
  const pendingTabIds = useMemo(
    () => ({
      'vehicle-requests': notifVisitItems.filter((item) => item.status === 'pending').map((item) => item.id),
      safety: notifSafetyItems.filter((item) => item.status === 'pending').map((item) => item.id),
    }),
    [notifVisitItems, notifSafetyItems],
  )
  const tabBadges = Object.fromEntries(
    Object.entries(pendingTabIds).map(([tab, ids]) => [tab, ids.filter((id) => !(seenTabItems[tab] || []).includes(id)).length]),
  )

  useEffect(() => {
    const ids = pendingTabIds[activeTab]
    if (!ids || ids.every((id) => (seenTabItems[activeTab] || []).includes(id))) return
    const next = { ...seenTabItems, [activeTab]: ids }
    setSeenTabItems(next)
    try {
      localStorage.setItem(getNotificationStorageKey('admin-tabs'), JSON.stringify(next))
    } catch {
      return
    }
  }, [activeTab, pendingTabIds, seenTabItems])

  const [peerRefresh, setPeerRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    const loadReviewCounts = () => {
      axios
        .get('/api/admin/resident-visit-requests')
        .then(({ data }) => {
          if (cancelled) return
          const list = data.requests || []
          setNotifVisitItems(list)
          setPendingVehicleCount(list.filter((item) => item.status === 'pending').length)
        })
        .catch(() => {})
      axios
        .get('/api/admin/safety-incidents')
        .then(({ data }) => {
          if (cancelled) return
          const list = data.incidents || []
          setNotifSafetyItems(list)
          setPendingSafetyCount(list.filter((item) => item.status === 'pending').length)
        })
        .catch(() => {})
    }
    window.addEventListener('focus', loadReviewCounts)
    loadReviewCounts()
    const interval = setInterval(loadReviewCounts, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', loadReviewCounts)
    }
  }, [peerRefresh])
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
  const [parcelDetail, setParcelDetail] = useState(null)
  const [parcelSearch, setParcelSearch] = useState('')
  const [parcelStatusFilter, setParcelStatusFilter] = useState('all')
  const [parcelPage, setParcelPage] = useState(1)
  const [moveOutInspections, setMoveOutInspections] = useState([])
  const [inspectionKind, setInspectionKind] = useState('all')
  const [inspectionSearch, setInspectionSearch] = useState('')
  const [inspectionResultFilter, setInspectionResultFilter] = useState('all')
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState('all')
  const [expandedInspectionRows, toggleInspectionRow] = useExpandedRows()
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
  const [notifPage, setNotifPage] = useState(1)
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

  const handleUnauthorized = (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      clearSession()
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
  const equipmentItems = roomEquipmentItems(roomForm)
  const [amenityDraft, setAmenityDraft] = useState('')
  const [amenityIcon, setAmenityIcon] = useState('sparkle')
  const [amenityPrice, setAmenityPrice] = useState('')
  const roomTypes = useRoomTypes()
  const [addingAmenity, setAddingAmenity] = useState(false)
  const [amenityModalError, setAmenityModalError] = useState('')
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
  const [expensesTotal, setExpensesTotal] = useState(0)
  const [expenseSeenId, setExpenseSeenId] = useState(() => readExpenseSeen('admin'))
  const viewingExpenses = activeTab === 'expenses'
  const pendingBadges = {
    requests: serviceCounts.requestPending,
    maintenance: serviceCounts.maintenancePending,
    expenses: viewingExpenses ? 0 : countNewExpenses(expenses, expenseSeenId),
  }
  const tabBadgeCount = (tabKey) => (tabKey in pendingBadges ? pendingBadges[tabKey] : tabBadges[tabKey] || 0)
  const groupBadgeCount = (groupKey) =>
    (TAB_GROUPS.find((group) => group.key === groupKey)?.tabs || []).reduce((sum, tabKey) => sum + tabBadgeCount(tabKey), 0)

  useEffect(() => {
    if (!viewingExpenses) return
    const maxId = maxExpenseId(expenses)
    if (expenseSeenId !== null && maxId <= expenseSeenId) return
    writeExpenseSeen('admin', maxId)
    setExpenseSeenId(maxId)
  }, [viewingExpenses, expenses, expenseSeenId])
  const [expenseModal, setExpenseModal] = useState(null)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)
  const [expenseFormError, setExpenseFormError] = useState('')
  const [expensePhotoError, setExpensePhotoError] = useState('')
  const [expenseExtraOpen, setExpenseExtraOpen] = useState(false)
  const [expenseDelete, setExpenseDelete] = useState(null)
  const [expenseDeleting, setExpenseDeleting] = useState(false)
  const [expenseDeleteError, setExpenseDeleteError] = useState('')
  const [expenseFilters, setExpenseFilters] = useState(EMPTY_EXPENSE_FILTERS)
  const expenseFiltersRef = useRef(EMPTY_EXPENSE_FILTERS)
  const expenseSearchTimerRef = useRef(null)
  const [expenseSummary, setExpenseSummary] = useState({ totalAmount: 0, byCategory: [] })
  const [expenseDetail, setExpenseDetail] = useState(null)
  const [expenseDetailPhotoIndex, setExpenseDetailPhotoIndex] = useState(0)
  const [expensePhotoPreview, setExpensePhotoPreview] = useState(null)

  const loadExpenses = (page = 1) => {
    const filters = expenseFiltersRef.current
    setExpensesLoading(true)
    return axios
      .get('/api/admin/expenses', {
        params: {
          page,
          pageSize: EXPENSES_PAGE_SIZE,
          search: filters.search.trim() || undefined,
          category: filters.category || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        },
      })
      .then(({ data }) => {
        setExpenses(data.expenses)
        if (readExpenseSeen('admin') === null) {
          const maxId = maxExpenseId(data.expenses)
          writeExpenseSeen('admin', maxId)
          setExpenseSeenId(maxId)
        }
        setExpensesPage(data.page)
        setExpensesTotal(data.total || 0)
        setExpensesTotalPages(Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || EXPENSES_PAGE_SIZE))))
        setExpenseSummary({ totalAmount: Number(data.totalAmount) || 0, byCategory: data.byCategory || [] })
        setExpensesError('')
      })
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setExpensesError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลรายจ่ายได้')
      })
      .finally(() => setExpensesLoading(false))
  }

  const updateExpenseFilters = (patch, { debounce = false } = {}) => {
    const next = { ...expenseFiltersRef.current, ...patch }
    expenseFiltersRef.current = next
    setExpenseFilters(next)
    clearTimeout(expenseSearchTimerRef.current)
    if (debounce) {
      expenseSearchTimerRef.current = setTimeout(() => loadExpenses(1), 350)
    } else {
      loadExpenses(1)
    }
  }

  const expenseFiltersActive = Boolean(
    expenseFilters.search.trim() || expenseFilters.category || expenseFilters.from || expenseFilters.to,
  )

  const openExpenseDetail = (expense) => {
    setExpenseDetailPhotoIndex(0)
    setExpenseDetail(expense)
  }

  const openCreateExpense = () => {
    setExpenseForm({ ...emptyExpenseForm, expense_date: getTodayInputDate() })
    setExpenseExtraOpen(false)
    setExpenseFormError('')
    setExpensePhotoError('')
    setExpenseModal({ mode: 'create' })
  }

  const openEditExpense = (expense) => {
    setExpenseForm({
      ...emptyExpenseForm,
      category: expense.category || '',
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      expense_date: (expense.expense_date || '').slice(0, 10),
      vendor: expense.vendor || '',
      payment_method: expense.payment_method || '',
      receipt_number: expense.receipt_number || '',
      room_number: expense.room_number ? String(expense.room_number) : '',
      keptPhotos: expense.photos || [],
    })
    setExpenseExtraOpen(Boolean(expense.vendor || expense.payment_method || expense.receipt_number || expense.room_number))
    setExpenseFormError('')
    setExpensePhotoError('')
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
      .get('/api/admin/waiting-list')
      .then(({ data }) => setWaitingList(data.waitingList || []))
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setPageError(err.response?.data?.message || 'โหลดรายชื่อคนรอห้องว่างไม่สำเร็จ')
      })
  }

  const loadParcels = useCallback(() => {
    return axios
      .get('/api/admin/parcels')
      .then(({ data }) => {
        setParcels(data.parcels || [])
        setParcelsError('')
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          clearSession()
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
      const { data } = await axios.post('/api/admin/parcels', payload)
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
      .get('/api/admin/move-out-inspections')
      .then(({ data }) => setMoveOutInspections(data.inspections))
      .catch((err) => {
        if (handleUnauthorized(err)) return
        setPageError(err.response?.data?.message || 'โหลดผลตรวจห้องย้ายออกไม่สำเร็จ')
      })
  }

  const loadAnnouncements = () => {
    return axios
      .get('/api/admin/announcements')
      .then(({ data }) => setAnnouncements(data.announcements))
      .catch((err) => handleUnauthorized(err))
  }

  const reloadAnnouncements = useEffectEvent(() => loadAnnouncements())
  useEffect(() => {
    const now = Date.now()
    const upcoming = announcements
      .map((item) => (item.expires_epoch ? item.expires_epoch * 1000 - now : Number.NaN))
      .filter((wait) => Number.isFinite(wait) && wait > 0)
    if (upcoming.length === 0) return undefined
    const timer = setTimeout(() => reloadAnnouncements(), Math.min(Math.min(...upcoming) + 1000, 2147483647))
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
          ? await axios.post('/api/admin/waiting-list', payload)
          : await axios.patch(`/api/admin/waiting-list/${waitingListModal.entry.id}`, payload)
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
      await axios.patch('/api/admin/waiting-list/' + entry.id, { status })
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
      const { data } = await axios.delete('/api/admin/waiting-list/' + waitingListDelete.id)
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
      .get('/api/admin/move-out-inspections/move-room-candidates')
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
      const { data } = await axios.get(`/api/admin/move-out-inspections/${inspection.id}`)
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
          ? await axios.post('/api/admin/move-out-inspections', payload)
          : await axios.put(`/api/admin/move-out-inspections/${inspectionEditor.initial.id}`, payload)
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
      const { data } = await axios.get(`/api/admin/move-out-inspections/${inspection.id}`)
      setInspectionDetail(data.inspection)
    } catch (err) {
      if (handleUnauthorized(err)) return
      setPageError(err.response?.data?.message || 'โหลดรายละเอียดผลตรวจไม่สำเร็จ')
    }
  }

  const setMoveOutInspectionStatus = async (inspection, status) => {
    try {
      await axios.patch(`/api/admin/move-out-inspections/${inspection.id}`, { status })
      setInspectionDetail((current) => (current?.id === inspection.id ? { ...current, status } : current))
      await loadMoveOutInspections()
    } catch (err) {
      if (handleUnauthorized(err)) return
      setPageError(err.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ')
    }
  }

  const confirmDeleteExpense = async (requestClose) => {
    setExpenseDeleting(true)
    setExpenseDeleteError('')
    try {
      const { data } = await axios.delete(`/api/admin/expenses/${expenseDelete.id}`)
      setSuccessMessage(data.message || 'ลบรายจ่ายสำเร็จ')
      requestClose()
      loadExpenses(expenses.length === 1 && expensesPage > 1 ? expensesPage - 1 : expensesPage)
    } catch (err) {
      if (handleUnauthorized(err)) return
      setExpenseDeleteError(err.response?.data?.message || 'ลบรายจ่ายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      if (err.response?.status === 404) loadExpenses(expensesPage)
    } finally {
      setExpenseDeleting(false)
    }
  }

  const submitExpenseForm = async (event, requestClose) => {
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
    if (!expenseForm.description.trim()) {
      setExpenseFormError('กรุณากรอกรายละเอียดรายจ่าย')
      return
    }
    if (expenseForm.keptPhotos.length + expenseForm.newPhotos.length === 0) {
      setExpenseFormError('กรุณาแนบรูปใบเสร็จหรือหลักฐานอย่างน้อย 1 รูป')
      return
    }

    setExpenseSubmitting(true)
    setExpenseFormError('')
    try {
      const photos = (await Promise.all(expenseForm.newPhotos.map((file) => compressImageFile(file)))).map(({ name, dataUrl }) => ({ name, dataUrl }))
      const payload = {
        category: expenseForm.category.trim(),
        description: expenseForm.description.trim() || null,
        amount: amountValue,
        expense_date: expenseForm.expense_date,
        vendor: expenseForm.vendor.trim() || null,
        payment_method: expenseForm.payment_method || null,
        receipt_number: expenseForm.receipt_number.trim() || null,
        room_number: expenseForm.room_number || null,
        photos,
        keep_photos: expenseForm.keptPhotos.map((photo) => photo.url),
      }
      if (expenseModal.mode === 'create') {
        await axios.post('/api/admin/expenses', payload)
      } else {
        await axios.put(`/api/admin/expenses/${expenseModal.expense.id}`, payload)
      }
      setSuccessMessage(expenseModal.mode === 'create' ? 'บันทึกรายจ่ายสำเร็จ' : 'แก้ไขรายจ่ายสำเร็จ')
      requestClose()
      loadExpenses(expenseModal.mode === 'create' ? 1 : expensesPage)
    } catch (err) {
      if (handleUnauthorized(err)) return
      setExpenseFormError(err.response?.data?.message || err.message || 'ไม่สามารถบันทึกรายจ่ายได้')
    } finally {
      setExpenseSubmitting(false)
    }
  }

  const loadRooms = () => {
    setRoomsLoading(true)
    return axios
      .get('/api/admin/rooms')
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
      const { data } = await axios.get('/api/staff/rooms')
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
    setRoomForm({ ...emptyRoomForm, custom_amenities: [] })
    setAmenityDraft('')
    setAmenityIcon('sparkle')
    setAddingAmenity(false)
    setAmenityModalError('')
    setRoomFormError('')
    setRoomModal({ mode: 'create' })
  }

  const openEditRoom = (room, mode = 'edit') => {
    if (room.is_booked && mode === 'edit') return
    setAmenityDraft('')
    setAmenityIcon('sparkle')
    setAddingAmenity(false)
    setAmenityModalError('')
    setRoomForm({
      room_number: String(room.room_number),
      price: String(room.price),
      room_size: room.room_size != null ? String(Number(room.room_size)) : '',
      electricity_unit_price: String(room.electricity_unit_price),
      water_unit_price: String(room.water_unit_price ?? 100),
      water_price: String(room.water_price),
      custom_amenities: parseRoomAmenities(room.custom_amenities),
      air_conditioner: Boolean(room.air_conditioner),
      wifi: Boolean(room.wifi),
      refrigerator: Boolean(room.refrigerator),
      bathroom: Boolean(room.bathroom),
      cctv: Boolean(room.cctv),
      room_type_id: room.room_type_id ?? null,
      assetRows: toAssetRows(room.assets),
    })
    setRoomFormError('')
    setRoomModal({ mode, room })
  }

  const openRoomDetail = (room) => {
    setRoomDetail({ room, data: null, loading: true, error: '' })
    axios
      .get(`/api/admin/rooms/${room.room_number}/detail`)
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
      .get(`/api/admin/rooms/${room.room_number}/maintenance`)
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
      .get(`/api/admin/rooms/${room.room_number}/tenants`)
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
      .get(`/api/admin/rooms/${room.room_number}/history`)
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
    if (name === 'electricity_unit_price' || name === 'water_unit_price' || name === 'water_price') {
      const maxValue = name === 'electricity_unit_price' ? 99.99 : 999.99
      if (value !== '' && Number(value) > maxValue) return
      setRoomForm((prev) => ({ ...prev, [name]: value }))
      return
    }
    setRoomForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const addRoomAmenity = (requestClose) => {
    const name = amenityDraft.trim()
    if (!name) {
      setAmenityModalError('กรุณากรอกชื่อทรัพย์สิน')
      return
    }
    const builtin = BUILTIN_EQUIPMENT.find((item) => item.name === name)
    const duplicate = (builtin && roomForm[builtin.field])
      || roomForm.custom_amenities.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      || roomForm.assetRows.some((row) => row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    if (name.length > 60 || duplicate) {
      setAmenityModalError('รายการซ้ำหรือยาวเกิน 60 ตัวอักษร')
      return
    }
    if (!isValidAssetPrice(amenityPrice)) {
      setAmenityModalError('กรุณาระบุราคาเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง')
      return
    }
    setRoomForm((prev) => ({
      ...prev,
      ...(builtin
        ? { [builtin.field]: true }
        : {
            custom_amenities: prev.custom_amenities.length < 12 ? [...prev.custom_amenities, { name, icon: amenityIcon }] : prev.custom_amenities,
          }),
      assetRows: [...prev.assetRows, ...toAssetRows([{ name, price: amenityPrice.replace(/,/g, '').trim() }])],
    }))
    requestClose()
  }

  const removeRoomAsset = (name) => {
    const builtin = BUILTIN_EQUIPMENT.find((item) => item.name === name)
    setRoomForm((prev) => ({
      ...prev,
      ...(builtin ? { [builtin.field]: false } : {}),
      custom_amenities: prev.custom_amenities.filter((item) => item.name !== name),
      assetRows: prev.assetRows.filter((row) => row.name.trim() !== name),
    }))
  }

  const openAddRoomAsset = () => {
    const [first] = availableAssetSuggestions(roomForm)
    setAmenityDraft(first?.name || '')
    setAmenityIcon(first?.icon || 'sparkle')
    setAmenityPrice('')
    setAmenityModalError('')
    setAddingAmenity(true)
  }

  const applyRoomType = (roomTypeId) => {
    const type = roomTypes.find((item) => item.id === roomTypeId)
    setRoomForm((prev) => {
      const known = new Set(prev.assetRows.map((row) => row.name.trim()))
      const added = (type?.assets || []).filter((asset) => !known.has(asset.name))
      return { ...prev, room_type_id: roomTypeId, assetRows: [...prev.assetRows, ...toAssetRows(added)] }
    })
  }

  const submitRoomForm = async (event, requestClose) => {
    event.preventDefault()
    if (roomModal.mode === 'amenities') {
      const error = assetRowsError(roomForm.assetRows)
      if (error) {
        setRoomFormError(error)
        return
      }
      setRoomSubmitting(true)
      setRoomFormError('')
      try {
        const { data } = await saveRoomAssets(roomModal.room.room_number, roomForm.room_type_id, roomForm.assetRows, {
          air_conditioner: roomForm.air_conditioner,
          refrigerator: roomForm.refrigerator,
          custom_amenities: roomForm.custom_amenities,
        })
        setSuccessMessage(data.message)
        requestClose()
        await loadRooms()
      } catch (err) {
        setRoomFormError(err.response?.data?.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      } finally {
        setRoomSubmitting(false)
      }
      return
    }
    if (!/^[1-9][0-9]{2}$/.test(roomForm.room_number)) {
      setRoomFormError('เลขห้องต้องเป็นตัวเลข 3 หลัก')
      return
    }
    const sizeValue = roomForm.room_size === '' ? null : Number(roomForm.room_size)
    if (sizeValue !== null && (!Number.isFinite(sizeValue) || sizeValue <= 0 || sizeValue > 9999.99)) {
      setRoomFormError('ขนาดห้องต้องเป็นตัวเลขมากกว่า 0 (ไม่เกิน 9,999.99 ตร.ม.)')
      return
    }
    const electricityValue = Number(roomForm.electricity_unit_price)
    if (!Number.isFinite(electricityValue) || electricityValue < 0 || electricityValue > 99.99) {
      setRoomFormError('ค่าไฟ/หน่วยต้องเป็นตัวเลข 2 หลัก (0-99.99)')
      return
    }
    const waterValue = Number(roomForm.water_price)
    const waterUnitValue = Number(roomForm.water_unit_price)
    if (!Number.isFinite(waterUnitValue) || waterUnitValue < 0 || waterUnitValue > 999.99) {
      setRoomFormError('ค่าน้ำ/หน่วยต้องเป็นตัวเลข (0-999.99)')
      return
    }
    if (!Number.isFinite(waterValue) || waterValue < 0 || waterValue > 999.99) {
      setRoomFormError('ค่าน้ำ/เดือนต้องเป็นตัวเลข 3 หลัก (0-999.99)')
      return
    }
    const assetsError = assetRowsError(roomForm.assetRows)
    if (assetsError) {
      setRoomFormError(assetsError)
      return
    }
    setRoomSubmitting(true)
    setRoomFormError('')
    const payload = {
      room_number: Number(roomForm.room_number),
      price: Number(roomForm.price),
      room_size: sizeValue,
      electricity_unit_price: Number(roomForm.electricity_unit_price),
      water_unit_price: Number(roomForm.water_unit_price),
      water_price: Number(roomForm.water_price),
      custom_amenities: roomForm.custom_amenities,
      air_conditioner: roomForm.air_conditioner,
      wifi: roomForm.wifi,
      refrigerator: roomForm.refrigerator,
      bathroom: roomForm.bathroom,
      cctv: roomForm.cctv,
    }
    try {
      if (roomModal.mode === 'create') {
        const { data } = await axios.post('/api/admin/rooms', payload)
        setSuccessMessage(data.message || 'สร้างห้องพักสำเร็จ')
      } else {
        const { room_number, ...editable } = payload
        const renamed = room_number !== Number(roomModal.room.room_number)
        const { data } = await axios.put(
          `/api/admin/rooms/${roomModal.room.room_number}`,
          renamed ? { ...editable, room_number } : editable
        )
        setSuccessMessage(data.message || 'แก้ไขข้อมูลห้องพักสำเร็จ')
      }
      try {
        await saveRoomAssets(payload.room_number, roomForm.room_type_id, roomForm.assetRows)
      } catch (assetError) {
        setPageError(`บันทึกห้องแล้ว แต่บันทึกทรัพย์สินไม่สำเร็จ (${assetError.response?.data?.message || 'ลองใหม่ที่ปุ่ม “ทรัพย์สิน”'})`)
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
      const { data } = await axios.delete(`/api/admin/rooms/${roomDeleteConfirm.room_number}`)
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
  }, [currentRoomsPage, activeTab, resetRoomRows])

  const [staffList, setStaffList] = useState([])
  const [marketSummary, setMarketSummary] = useState(null)
  const [repairSummary, setRepairSummary] = useState(null)
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
      .get('/api/admin/staff')
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
      confirm_password: '',
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
    if (staffForm.password !== staffForm.confirm_password) {
      setStaffFormError(staffModal.mode === 'create' ? 'ยืนยันรหัสผ่านไม่ตรงกัน' : 'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน')
      return
    }
    setStaffSubmitting(true)
    setStaffFormError('')
    try {
      if (staffModal.mode === 'create') {
        const createPayload = {
          idcard: staffForm.idcard,
          password: staffForm.password,
          phone: staffForm.phone,
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          age: staffForm.age,
        }
        const { data } = await axios.post('/api/admin/staff', createPayload)
        setSuccessMessage(data.message || 'เพิ่มพนักงานสำเร็จ')
      } else {
        const payload = {
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          phone: staffForm.phone,
          age: Number(staffForm.age),
        }
        if (staffForm.password) payload.password = staffForm.password
        const { data } = await axios.put(`/api/admin/staff/${staffModal.staff.id}`, payload)
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
        { is_suspended: !member.is_suspended }
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
      const { data } = await axios.delete(`/api/admin/staff/${staffDeleteConfirm.id}`)
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

  const [staffDetail, setStaffDetail] = useState(null)

  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [customersError, setCustomersError] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all')
  const [customerSort, setCustomerSort] = useState('room')
  const [customersPage, setCustomersPage] = useState(1)
  const [customerModal, setCustomerModal] = useState(null)
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm)
  const [customerSubmitting, setCustomerSubmitting] = useState(false)
  const [customerFormError, setCustomerFormError] = useState('')
  const [customerDetail, setCustomerDetail] = useState(null)
  const [customerProfile, setCustomerProfile] = useState(null)
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

  const loadCustomers = () => {
    setCustomersLoading(true)
    return axios
      .get('/api/admin/customers')
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

  const openEditCustomer = (customer) => {
    setCustomerForm({
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      age: String(customer.age),
      deposit_amount: customer.deposit_amount != null ? String(customer.deposit_amount) : '',
      password: '',
      confirm_password: '',
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
    const password = customerForm.password || ''
    if (password && (password.length < 6 || password.length > 128)) {
      setCustomerFormError('รหัสผ่านใหม่ต้องมีความยาว 6-128 ตัวอักษร')
      return
    }
    if (password !== (customerForm.confirm_password || '')) {
      setCustomerFormError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน')
      return
    }
    setCustomerSubmitting(true)
    setCustomerFormError('')
    try {
      const payload = {
        first_name: customerForm.first_name,
        last_name: customerForm.last_name,
        phone: customerForm.phone,
        age: Number(customerForm.age),
        ...(password ? { password } : {}),
      }
      const { data } = await axios.put(`/api/admin/customers/${customerModal.id}`, payload)
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
        { is_suspended: !customer.is_suspended }
      )
      setSuccessMessage(data.message || 'ดำเนินการสำเร็จ')
      requestClose()
      await Promise.all([loadCustomers(), loadRooms()])
    } catch (err) {
      setPageError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ')
      requestClose()
    }
  }

  const openCustomerProfile = async (customer) => {
    setCustomerProfile({ id: customer.id, customer, detail: null, loading: true, error: '' })
    try {
      const { data } = await axios.get(`/api/admin/customers/${customer.id}`)
      setCustomerProfile((prev) => (prev?.id === customer.id ? { ...prev, detail: data, loading: false } : prev))
    } catch (err) {
      if (handleUnauthorized(err)) return
      setCustomerProfile((prev) =>
        prev?.id === customer.id ? { ...prev, loading: false, error: err.response?.data?.message || 'ไม่สามารถโหลดประวัติการเช่าได้' } : prev,
      )
    }
  }

  const openCustomerProfileHistory = () => {
    if (!customerProfile?.detail) return
    setCustomerDetailError('')
    setCustomerDetailLoading(false)
    setCustomerDetail({ customer: customerProfile.detail.customer, rentalHistory: customerProfile.detail.rentalHistory })
  }

  const customerSegmentCounts = useMemo(
    () =>
      customers.reduce(
        (counts, customer) => {
          CUSTOMER_SEGMENTS.forEach((segment) => {
            if (segment.match(customer)) counts[segment.key] += 1
          })
          return counts
        },
        Object.fromEntries(CUSTOMER_SEGMENTS.map((segment) => [segment.key, 0])),
      ),
    [customers],
  )

  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase()
    const segment = CUSTOMER_SEGMENTS.find((item) => item.key === customerStatusFilter) || CUSTOMER_SEGMENTS[0]
    return customers
      .filter((customer) => {
        if (!segment.match(customer)) return false
        if (!keyword) return true
        return [customer.room_number, `${customer.first_name || ''} ${customer.last_name || ''}`, customer.phone, customer.idcard]
          .filter((value) => value != null)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
      .sort(CUSTOMER_SORTERS[customerSort] || CUSTOMER_SORTERS.room)
  }, [customers, customerStatusFilter, customerSearch, customerSort])

  const customersTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / ROWS_PER_PAGE))
  const currentCustomersPage = Math.min(customersPage, customersTotalPages)
  const paginatedCustomers = useMemo(() => {
    const start = (currentCustomersPage - 1) * ROWS_PER_PAGE
    return filteredCustomers.slice(start, start + ROWS_PER_PAGE)
  }, [filteredCustomers, currentCustomersPage])

  const [expandedCustomerRows, toggleCustomerRow, resetCustomerRows] = useExpandedRows()
  useEffect(() => {
    resetCustomerRows()
  }, [currentCustomersPage, activeTab, resetCustomerRows])

  const [requestLogs, setRequestLogs] = useState({ items: [], total: 0, page: 1, pageSize: 20 })
  const [requestLogsLoading, setRequestLogsLoading] = useState(false)
  const [requestDetail, setRequestDetail] = useState(null)
  const [requestLogsError, setRequestLogsError] = useState('')
  const [requestStatusFilter, setRequestStatusFilter] = useState('all')
  const [requestSearch, setRequestSearch] = useState('')

  const loadRequestLogs = () => {
    setRequestLogsLoading(true)
    return axios
      .get('/api/admin/logs/requests', { params: { all: 1 } })
      .then(({ data }) => {
        setRequestLogs((current) => ({ items: data.requests, total: data.total, page: current.page, pageSize: data.pageSize }))
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

  const loadMaintenanceLogs = () => {
    setMaintenanceLogsLoading(true)
    return axios
      .get('/api/admin/logs/maintenance', { params: { all: 1 } })
      .then(({ data }) => {
        setMaintenanceLogs((current) => ({ items: data.requests, total: data.total, page: current.page, pageSize: data.pageSize }))
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
      .get(`/api/admin/moveouts/${row.id}`)
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

  const loadMoveoutLogs = () => {
    setMoveoutLogsLoading(true)
    return axios
      .get('/api/admin/logs/moveouts', {
        params: { all: 1 },
      })
      .then(({ data }) => {
        setMoveoutLogs({ items: data.moveouts, total: data.total, page: 1, pageSize: data.pageSize })
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
      .get('/api/admin/logs/requests', { params: { page: 1, status: 'pending' } })
      .then(({ data }) => setServiceCounts((current) => ({ ...current, requestPending: data.total || 0 })))
      .catch(() => {})
    axios
      .get('/api/admin/logs/maintenance', { params: { page: 1, status: 'pending' } })
      .then(({ data }) => setServiceCounts((current) => ({ ...current, maintenancePending: data.total || 0 })))
      .catch(() => {})
    const loadOpen = (url) =>
      Promise.all(['pending', 'in_progress'].map((status) =>
        axios.get(url, { params: { page: 1, status } }).then(({ data }) => data.requests || []),
      )).then((lists) => lists.flat())
    loadOpen('/api/admin/logs/requests')
      .then(setNotifTenantItems)
      .catch((err) => handleUnauthorized(err))
    loadOpen('/api/admin/logs/maintenance')
      .then(setNotifMaintenanceItems)
      .catch((err) => handleUnauthorized(err))
    loadAnnouncements()
  }

  const startAdminSession = useEffectEvent(() => {
    if (!hasSession()) {
      navigate('/login', { replace: true })
      return false
    }
    const storedUser = sessionStorage.getItem('user')
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser)
        if (!['Admin', 'Owner'].includes(parsed?.role)) {
          navigate('/login', { replace: true })
          return false
        }
        setAdminUser(parsed)
      } catch {
        setAdminUser(null)
      }
    }
    loadRooms()
    loadStaff()
    loadCustomers()
    loadWaitingList()
    loadMoveOutInspections()
    loadParcels()
    loadNotifSources()
    loadExpenses(1)
    return true
  })

  const refreshAdminNotifications = useEffectEvent(() => {
    loadNotifSources()
    loadExpenses(1)
    loadStaff()
    loadParcels()
    loadMoveOutInspections()
  })

  useEffect(() => {
    if (!startAdminSession()) return undefined
    const refreshNotifications = () => refreshAdminNotifications()
    const interval = setInterval(refreshNotifications, 60000)
    window.addEventListener('focus', refreshNotifications)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refreshNotifications)
    }
  }, [])

  const loadActiveTab = useEffectEvent((tab) => {
    if (tab === 'requests') loadRequestLogs()
    if (tab === 'maintenance') loadMaintenanceLogs()
    if (tab === 'moveouts') loadMoveoutLogs()
    if (tab === 'expenses') loadExpenses(1)
  })

  useEffect(() => {
    loadActiveTab(activeTab)
  }, [activeTab])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const summary = useMemo(() => {
    const totalRooms = rooms.length
    const vacantRooms = rooms.filter((room) => !room.is_booked).length
    const activeStaff = staffList.filter((member) => !member.is_suspended).length
    const activeCustomers = customers.filter((customer) => !customer.is_suspended && customer.room_number != null).length
    return { totalRooms, vacantRooms, activeStaff, activeCustomers }
  }, [rooms, staffList, customers])

  const goToTab = (tabKey) => {
    setActiveTab(tabKey)
    setLastTabByGroup((current) => ({ ...current, [TAB_GROUP_OF[tabKey]]: tabKey }))
    setAnnouncementFocus(null)
  }
  const pendingParcelCount = parcels.filter((parcel) => parcel.status === 'pending').length
  const todayParcelKey = new Date().toDateString()
  const parcelsArrivedToday = parcels.filter((parcel) => new Date(parcel.created_at).toDateString() === todayParcelKey).length
  const parcelsPickedToday = parcels.filter((parcel) => parcel.received_at && new Date(parcel.received_at).toDateString() === todayParcelKey).length
  const roomsWithPendingParcels = new Set(parcels.filter((parcel) => parcel.status === 'pending').map((parcel) => parcel.room_number)).size
  const oldestPendingParcelDays = parcels
    .filter((parcel) => parcel.status === 'pending')
    .reduce((max, parcel) => Math.max(max, Math.floor((Date.now() - new Date(parcel.created_at).getTime()) / 86400000)), 0)
  const waitingQueueCount = waitingList.filter((item) => (WAITING_UI_STATUSES[item.status] ? item.status : 'waiting') === 'waiting').length
  const scheduledAnnouncementCount = announcements.filter((item) => item.expires_at).length
  const warningAnnouncementCount = announcements.filter((item) => item.tone === 'warning').length
  const newAnnouncementCount = announcements.filter((item) => Date.now() - new Date(item.created_at).getTime() < 24 * 60 * 60 * 1000).length
  const summaryByGroup = {
    residents: [
      { key: 'rooms', icon: 'total', tone: 'blue', label: 'ห้องทั้งหมด', value: summary.totalRooms, onClick: () => goToTab('rooms') },
      { key: 'vacant', icon: 'vacant', tone: 'green', label: 'ห้องว่าง', value: summary.vacantRooms, hint: `มีผู้เช่า ${summary.totalRooms - summary.vacantRooms} ห้อง`, onClick: () => goToTab('rooms') },
      { key: 'customers', icon: 'booked', tone: 'amber', label: 'ลูกค้าที่ใช้งานอยู่', value: summary.activeCustomers, onClick: () => goToTab('customers') },
      { key: 'waiting', icon: 'queue', tone: 'violet', label: 'คิวรอห้องว่าง', value: waitingQueueCount, onClick: () => goToTab('waiting-list') },
    ],
    services: [
      { key: 'requests', icon: 'request', tone: 'indigo', label: 'คำขอผู้เช่ารอดำเนินการ', value: serviceCounts.requestPending, onClick: () => goToTab('requests') },
      { key: 'maintenance', icon: 'maintenance', tone: 'amber', label: 'แจ้งซ่อมรอรับเรื่อง', value: serviceCounts.maintenancePending, onClick: () => goToTab('maintenance') },
      { key: 'vehicle', icon: 'carPending', tone: 'blue', label: 'คำขอรถรอพิจารณา', value: pendingVehicleCount, onClick: () => goToTab('vehicle-requests') },
      { key: 'safety', icon: 'safety', tone: 'red', label: 'เหตุรอรับเรื่อง', value: pendingSafetyCount, alert: pendingSafetyCount > 0, onClick: () => goToTab('safety') },
    ],
    parcels: [
      {
        key: 'pending',
        icon: 'parcel',
        tone: 'amber',
        label: 'พัสดุรอผู้เช่ารับ',
        value: pendingParcelCount,
        hint: oldestPendingParcelDays > 0 ? `ค้างนานสุด ${oldestPendingParcelDays} วัน` : pendingParcelCount > 0 ? 'มาถึงวันนี้' : null,
        onClick: () => goToTab('parcels'),
      },
      { key: 'today', icon: 'parcel', tone: 'blue', label: 'รับเข้าวันนี้', value: parcelsArrivedToday, hint: `ทั้งหมด ${parcels.length} รายการ`, onClick: () => goToTab('parcels') },
      { key: 'picked', icon: 'vacant', tone: 'green', label: 'ผู้เช่ารับไปวันนี้', value: parcelsPickedToday, onClick: () => goToTab('parcels') },
      { key: 'rooms', icon: 'total', tone: 'violet', label: 'ห้องที่มีพัสดุรอ', value: roomsWithPendingParcels, onClick: () => goToTab('parcels') },
    ],
    announcements: [
      { key: 'all', icon: 'announce', tone: 'blue', label: 'ประกาศทั้งหมด', value: announcements.length, onClick: () => goToTab('announcements') },
      { key: 'warning', icon: 'announce', tone: 'amber', label: 'ประกาศแจ้งเตือน', value: warningAnnouncementCount, onClick: () => goToTab('announcements') },
      { key: 'info', icon: 'announce', tone: 'indigo', label: 'ประกาศทั่วไป', value: announcements.length - warningAnnouncementCount, onClick: () => goToTab('announcements') },
      {
        key: 'scheduled',
        icon: 'clock',
        tone: 'slate',
        label: 'กำหนดลบอัตโนมัติ',
        value: scheduledAnnouncementCount,
        hint: newAnnouncementCount > 0 ? `ใหม่ใน 24 ชม. ${newAnnouncementCount} รายการ` : null,
        onClick: () => goToTab('announcements'),
      },
    ],
    contracts: completedContractSummaryTiles(contractSummary),
    cameras: cameraSummaryTiles().map((tile) => ({ ...tile, onClick: () => goToTab('cameras') })),
    market: marketSummaryTiles(marketSummary, {
      shops: { icon: 'total', tone: 'blue' },
      rented: { icon: 'booked', tone: 'indigo' },
      vacant: { icon: 'vacant', tone: 'green' },
      income: { icon: 'due', tone: 'violet' },
      expiring: { icon: 'clock', tone: 'amber' },
    }),
    repair: repairSummaryTiles(repairSummary, {
      vendors: { icon: 'queue', tone: 'blue' },
      sent: { icon: 'clock', tone: 'amber' },
      progress: { icon: 'maintenance', tone: 'indigo' },
      done: { icon: 'vacant', tone: 'green' },
      rejected: { icon: 'x', tone: 'red' },
    }),
    staff: [
      { key: 'all', icon: 'queue', tone: 'blue', label: 'พนักงานทั้งหมด', value: staffList.length, onClick: () => goToTab('staff') },
      { key: 'active', icon: 'vacant', tone: 'indigo', label: 'ใช้งานอยู่', value: summary.activeStaff, onClick: () => goToTab('staff') },
      { key: 'suspended', icon: 'x', tone: 'red', label: 'ระงับการใช้งาน', value: staffList.length - summary.activeStaff, onClick: () => goToTab('staff') },
    ],
    finance: [
      {
        key: 'amount',
        icon: 'due',
        tone: 'blue',
        label: 'ยอดรวมรายจ่าย',
        value: `฿${formatCurrency(expenseSummary.totalAmount)}`,
        hint: expenseFiltersActive ? 'ตามตัวกรองที่เลือก' : 'ทุกรายการ',
        onClick: () => goToTab('expenses'),
      },
      { key: 'count', icon: 'total', tone: 'slate', label: 'จำนวนรายการ', value: expensesTotal, onClick: () => goToTab('expenses') },
      {
        key: 'top',
        icon: 'request',
        tone: 'amber',
        label: 'หมวดที่ใช้จ่ายมากที่สุด',
        value: expenseSummary.byCategory[0]?.category || '-',
        hint: expenseSummary.byCategory[0] ? `฿${formatCurrency(expenseSummary.byCategory[0].total)}` : null,
        onClick: () => goToTab('expenses'),
      },
    ],
  }
  const activeSummaryTiles = summaryByGroup[SUMMARY_GROUP_OF[activeTab]] || summaryByGroup.residents

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
      getInspectionPurposeLabel(inspection),
      getInspectionSourceLabel(inspection),
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

  const serverFeed = useServerNotifications('/api/admin', {
    pendingKinds: ADMIN_SERVER_PENDING_KINDS,
    onNewEvents: () => {
      loadNotifSources()
      loadMoveOutInspections()
      loadAnnouncements()
      setPeerRefresh((count) => count + 1)
    },
  })

  const notifications = useMemo(() => {
    return sortNewestFirst([
      ...notifTenantItems.flatMap(buildAdminTenantNotifs),
      ...notifMaintenanceItems.flatMap(buildAdminMaintenanceNotifs),
      ...notifSafetyItems.flatMap(buildAdminSafetyNotifs),
      ...notifVisitItems.flatMap(buildAdminVisitNotifs),
      ...moveOutInspections.flatMap(buildAdminInspectionNotifs),
      ...staffList.flatMap(buildAdminStaffNotifs),
      ...announcements.map(buildAnnouncementNotif),
      ...serverFeed.events,
      ...serverFeed.pending,
    ])
  }, [notifTenantItems, notifMaintenanceItems, notifSafetyItems, notifVisitItems, moveOutInspections, staffList, announcements, serverFeed.events, serverFeed.pending])

  const notificationReads = useNotificationReads(getNotificationStorageKey('admin'), serverFeed)
  const newNotifications = notifications.filter((notification) => isUnread(notification, notificationReads.seenKeys))
  const freshNotifKeys = new Set(newNotifications.map((notification) => notification.key))

  useEffect(() => {
    const link = takeNotificationDeepLink()
    if (!link || !Object.values(ADMIN_TARGET_TABS).includes(link.tab)) return
    setActiveTab(link.tab)
    if (link.focus && ['vehicle-requests', 'safety'].includes(link.tab)) setTabFocus({ tab: link.tab, id: Number(link.focus), nonce: Date.now() })
  }, [])

  const notifTotalPages = Math.max(1, Math.ceil(notifications.length / NOTIF_PAGE_SIZE))
  const notifCurrentPage = Math.min(notifPage, notifTotalPages)
  const paginatedNotifications = notifications.slice(
    (notifCurrentPage - 1) * NOTIF_PAGE_SIZE,
    notifCurrentPage * NOTIF_PAGE_SIZE,
  )

  const matchesLogKeyword = (keyword, values) =>
    !keyword || values.filter((value) => value != null).some((value) => String(value).toLowerCase().includes(keyword))
  const requestKeyword = requestSearch.trim().toLowerCase()
  const filteredRequestLogs = requestLogs.items.filter(
    (request) =>
      (requestStatusFilter === 'all' || request.status === requestStatusFilter) &&
      matchesLogKeyword(requestKeyword, [
        request.room_number,
        request.target_room_number,
        `${request.first_name || ''} ${request.last_name || ''}`,
        request.accepted_by_name,
        request.completed_by_name,
      ]),
  )
  const requestLogsTotalPages = Math.max(1, Math.ceil(filteredRequestLogs.length / requestLogs.pageSize))
  const currentRequestLogsPage = Math.min(requestLogs.page, requestLogsTotalPages)
  const pagedRequestLogs = filteredRequestLogs.slice((currentRequestLogsPage - 1) * requestLogs.pageSize, currentRequestLogsPage * requestLogs.pageSize)

  const maintenanceKeyword = maintenanceSearch.trim().toLowerCase()
  const filteredMaintenanceLogs = maintenanceLogs.items.filter(
    (request) =>
      (maintenanceStatusFilter === 'all' || request.status === maintenanceStatusFilter) &&
      matchesLogKeyword(maintenanceKeyword, [
        request.room_number,
        `${request.first_name || ''} ${request.last_name || ''}`,
        request.accepted_by_name,
        request.completed_by_name,
      ]),
  )
  const maintenanceLogsTotalPages = Math.max(1, Math.ceil(filteredMaintenanceLogs.length / maintenanceLogs.pageSize))
  const currentMaintenanceLogsPage = Math.min(maintenanceLogs.page, maintenanceLogsTotalPages)
  const pagedMaintenanceLogs = filteredMaintenanceLogs.slice(
    (currentMaintenanceLogsPage - 1) * maintenanceLogs.pageSize,
    currentMaintenanceLogsPage * maintenanceLogs.pageSize,
  )
  const moveoutKeyword = moveoutSearch.trim().toLowerCase()
  const filteredMoveouts = moveoutKeyword
    ? moveoutLogs.items.filter((moveout) =>
        [moveout.room_number, `${moveout.first_name || ''} ${moveout.last_name || ''}`, moveout.idcard, moveout.phone]
          .filter((value) => value != null)
          .some((value) => String(value).toLowerCase().includes(moveoutKeyword)),
      )
    : moveoutLogs.items
  const moveoutLogsTotalPages = Math.max(1, Math.ceil(filteredMoveouts.length / moveoutLogs.pageSize))
  const currentMoveoutPage = Math.min(moveoutLogs.page, moveoutLogsTotalPages)
  const pagedMoveouts = filteredMoveouts.slice((currentMoveoutPage - 1) * moveoutLogs.pageSize, currentMoveoutPage * moveoutLogs.pageSize)

  const openNotification = (notif) => {
    closeNotifPanel()
    notificationReads.markRead(notif, notifications)
    if (notif.server) {
      const tab = ADMIN_TARGET_TABS[(notif.target || '').split(':')[0]]
      setAnnouncementFocus(null)
      if (!tab) {
        setNotifDetail(notif)
        return
      }
      if (['vehicle-requests', 'safety', 'market', 'repair-vendors'].includes(tab)) setTabFocus({ tab, id: notif.refId, refTable: notif.refTable, nonce: Date.now() })
      setActiveTab(tab)
      return
    }
    if (notif.kind === 'announcement') {
      setActiveTab('announcements')
      setAnnouncementFocus((focus) => ({ id: notif.announcementId, nonce: (focus?.nonce ?? 0) + 1 }))
      return
    }
    setAnnouncementFocus(null)
    if (notif.kind === 'safety' || notif.kind === 'visit') {
      const tab = notif.kind === 'safety' ? 'safety' : 'vehicle-requests'
      setTabFocus({ tab, id: notif.request.id, nonce: Date.now() })
      setActiveTab(tab)
      return
    }
    if (notif.kind === 'inspection') {
      setInspectionKind('all')
      setInspectionSearch('')
      setInspectionResultFilter('all')
      setInspectionStatusFilter('all')
      setActiveTab('move-out-inspections')
      requestRowFocus(`inspection-${notif.request.id}`)
      openInspectionDetail(notif.request)
      return
    }
    if (notif.kind === 'staff') {
      const index = staffList.findIndex((member) => member.id === notif.request.id)
      setStaffSearch('')
      setStaffPage(index >= 0 ? Math.floor(index / ROWS_PER_PAGE) + 1 : 1)
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
      setRequestLogs((current) => ({ ...current, page: 1 }))
      loadRequestLogs().finally(() => setNotifTargetReady((count) => count + 1))
      return
    }
    setMaintenanceStatusFilter('all')
    setMaintenanceSearch('')
    setActiveTab('maintenance')
    notifTargetRef.current = { tab: 'maintenance', id: notif.request.id }
    setMaintenanceLogs((current) => ({ ...current, page: 1 }))
    loadMaintenanceLogs().finally(() => setNotifTargetReady((count) => count + 1))
  }

  useEffect(() => {
    const target = notifTargetRef.current
    if (!target || activeTab !== target.tab) return
    const { tab, id } = target
    const source = tab === 'requests' ? requestLogs.items : tab === 'maintenance' ? maintenanceLogs.items : staffList
    const item = source.find((entry) => entry.id === id)
    if (item) {
      if (tab === 'requests') setRequestDetail(item)
      else if (tab === 'maintenance') setMaintenanceDetail(item)
      else setStaffDetail(item)
      requestRowFocus(`${tab}-${id}`)
    }
    notifTargetRef.current = null
  }, [notifTargetReady, activeTab, requestLogs.items, maintenanceLogs.items, staffList, requestRowFocus])

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header app-header">
          <div className="admin-title-group app-header-title">
            <div className="admin-icon app-header-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z" />
              </svg>
            </div>
            <div>
              <AppHeaderMeta role="admin" />
              <h1>สวัสดี, {adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'ผู้ดูแลระบบ'}</h1>
              <p>จัดการห้องพัก พนักงาน ลูกค้า และตรวจสอบกิจกรรมทั้งหมดของหอพัก</p>
            </div>
          </div>
          <div className="admin-header-actions app-header-actions">
            <div className="admin-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="admin-notif-btn app-header-icon-btn"
                aria-label="การแจ้งเตือน"
                onClick={() => {
                  if (notifOpen) {
                    closeNotifPanel()
                  } else {
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
            <button type="button" className="admin-logout-btn app-header-logout" onClick={handleLogout}>
              <LogoutIcon />
              ออกจากระบบ
            </button>
          </div>
          <AppHeaderDate />
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

        {activeTab !== 'dorm-info' && (
          <div className={`admin-summary-grid is-${activeSummaryTiles.length}`}>
            {activeSummaryTiles.map((tile) => (
              <div
                key={tile.key}
                className={`admin-summary-card is-${tile.tone}${tile.value === 0 ? ' is-zero' : ''}${tile.alert ? ' is-alert' : ''}`}
              >
                <span className="admin-summary-icon">
                  {SUMMARY_ICON_PATHS[tile.icon] ? <SummaryIcon type={tile.icon} /> : <RoomDetailIcon type={tile.icon} size={20} />}
                </span>
                <span className="admin-summary-text">
                  <span className="admin-summary-label">{tile.label}</span>
                  <strong className="admin-summary-value">{tile.value}</strong>
                  {tile.hint && <small className="admin-summary-hint">{tile.hint}</small>}
                </span>
              </div>
            ))}
          </div>
        )}
        <RoleTabMenu
          tabs={TAB_GROUPS}
          activeKey={TAB_GROUP_OF[activeTab]}
          activeLabel={TAB_LABEL[activeTab]}
          onSelect={(key) => {
            if (TAB_GROUP_OF[activeTab] === key) return
            const group = TAB_GROUPS.find((item) => item.key === key)
            setActiveTab(lastTabByGroup[key] || group.tabs[0])
            setAnnouncementFocus(null)
          }}
          listClassName="admin-tabs mb-0"
          linkClassName="admin-tab-link"
          logoutClassName="admin-logout-btn"
          onLogout={handleLogout}
          renderBadge={(groupKey) => {
            const count = groupBadgeCount(groupKey)
            return count > 0 && <span className="admin-subtab-badge admin-tab-badge" aria-label={`${count} รายการรอตรวจ`}>{count}</span>
          }}
        />
        <div className="admin-subtabs-row">
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
                    {tabBadgeCount(tabKey) > 0 && <span className="admin-subtab-badge" aria-label={`${tabBadgeCount(tabKey)} รายการรอตรวจ`}>{tabBadgeCount(tabKey)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ))}
          <div className="dorm-menu-bar">
            <DormInfoMenu
              apiBase="/api/admin/dorm-info"
              onManage={() => {
                setActiveTab('dorm-info')
                setAnnouncementFocus(null)
              }}
            />
          </div>
        </div>

        {activeTab === 'dorm-info' && <DormInfoSettings apiBase="/api/admin/dorm-info" />}

        {activeTab === 'completed-contracts' && (
          <div className="admin-contracts">
            <StaffCompletedContractsTab onSummaryChange={setContractSummary} />
          </div>
        )}

        {activeTab === 'vehicle-requests' && (
          <StaffResidentVisitsTab
            key={tabFocus?.tab === 'vehicle-requests' ? tabFocus.nonce : 'vehicle-requests'}
            canManageSettings
            rooms={rooms}
            onCountChange={setPendingVehicleCount}
            focusId={tabFocus?.tab === 'vehicle-requests' ? tabFocus.id : null}
          />
        )}

        {activeTab === 'safety' && (
          <AdminSafetyIncidentsTab
            key={tabFocus?.tab === 'safety' ? tabFocus.nonce : 'safety'}
            onCountChange={setPendingSafetyCount}
            focusId={tabFocus?.tab === 'safety' ? tabFocus.id : null}
          />
        )}

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

        {activeTab === 'wifi' && <WifiManager />}

        {activeTab === 'market' && <MarketManager onSummary={setMarketSummary} focus={tabFocus?.tab === 'market' ? tabFocus : null} />}
        {activeTab === 'repair-vendors' && <RepairVendorManager rooms={rooms} onSummary={setRepairSummary} focus={tabFocus?.tab === 'repair-vendors' ? tabFocus : null} />}
        {notifDetail && <NotificationDetailModal notification={notifDetail} onClose={() => setNotifDetail(null)} />}

        {activeTab === 'cameras' && <CameraMonitor />}

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
                <label className="parcel-label" htmlFor="parcel-ui-search">ค้นหา</label>
                <input
                  id="parcel-ui-search"
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
                <label className="parcel-label" htmlFor="parcel-ui-status">สถานะ</label>
                <select
                  id="parcel-ui-status"
                  className="parcel-control"
                  value={parcelStatusFilter}
                  onChange={(event) => {
                    setParcelStatusFilter(event.target.value)
                    setParcelPage(1)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  {PARCEL_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="table-responsive parcel-table-wrap">
              <table className="parcel-table parcel-ui-table admin-parcel-table">
                <thead>
                  <tr>
                    <th className="admin-parcel-who">ห้อง / ผู้รับ</th>
                    <th className="admin-parcel-sender">ผู้ส่ง / รายละเอียด</th>
                    <th className="admin-parcel-tracking">เลขพัสดุ</th>
                    <th className="admin-parcel-photo">รูป</th>
                    <th className="admin-parcel-status">สถานะ</th>
                    <th className="admin-parcel-record">บันทึก</th>
                    <th className="admin-parcel-action" aria-label="การดำเนินการ" />
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
                    <tr
                      key={parcel.id}
                      className="parcel-row-clickable"
                      tabIndex={0}
                      aria-label={`ดูรายละเอียดพัสดุห้อง ${parcel.room_number}`}
                      onClick={() => setParcelDetail(parcel)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setParcelDetail(parcel)
                      }}
                    >
                      <td className="admin-parcel-who">
                        <div className="parcel-ui-who">
                          <span className="parcel-room-badge">{parcel.room_number}</span>
                          <div className="parcel-ui-stack">
                            <strong>{parcel.first_name ? `${parcel.first_name} ${parcel.last_name}` : 'ไม่มีผู้เช่าปัจจุบัน'}</strong>
                            {parcel.is_previous_tenant ? <em className="parcel-prev-tenant">{PREVIOUS_TENANT_LABEL}</em> : null}
                            <small>
                              <RoomDetailIcon type="phone" size={12} />
                              {parcel.phone || '-'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="admin-parcel-sender">
                        <div className="parcel-ui-stack">
                          <strong>{parcel.sender_name || 'พัสดุทั่วไป'}</strong>
                          <small className="parcel-ui-desc">{parcel.description || 'ไม่มีรายละเอียด'}</small>
                        </div>
                      </td>
                      <td className="admin-parcel-tracking">
                        {parcel.tracking_number ? <span className="parcel-ui-tracking">{parcel.tracking_number}</span> : <span className="parcel-ui-none">-</span>}
                      </td>
                      <td className="admin-parcel-photo">
                        {parcel.photos?.length ? (
                          <button
                            type="button"
                            className="parcel-thumb"
                            aria-label={`ดูรูปพัสดุห้อง ${parcel.room_number}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setParcelPhotoPreview(parcel)
                              setPhotoPreview(0)
                            }}
                          >
                            <UploadImage src={parcel.photos[0].url} alt="" />
                            {parcel.photos.length > 1 && <span>+{parcel.photos.length - 1}</span>}
                          </button>
                        ) : <span className="parcel-ui-nophoto">ไม่มีรูป</span>}
                      </td>
                      <td className="admin-parcel-status">
                        <div className="parcel-ui-stack">
                          <span className={`parcel-ui-status ${parcelStatusInfo(parcel.status).tone}`}>
                            <span className="parcel-ui-status-dot" aria-hidden="true" />
                            {parcelStatusInfo(parcel.status).label}
                          </span>
                          {parcel.received_at && <small>{formatDateTime(parcel.received_at)}</small>}
                        </div>
                      </td>
                      <td className="admin-parcel-record">
                        <div className="parcel-ui-stack">
                          <strong className="parcel-ui-date">{formatDateTime(parcel.created_at)}</strong>
                          <small>
                            โดย <span className="parcel-ui-actor">{parcel.staff_name || 'เจ้าหน้าที่'}</span>
                          </small>
                        </div>
                      </td>
                      <td className="parcel-ui-action admin-parcel-action">
                        <span className="parcel-ui-open">
                          ดูรายละเอียด
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                        </span>
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

            <div className="table-responsive admin-rooms-table-wrap">
              <table className="table admin-table admin-rooms-table">
                <thead>
                  <tr>
                    <th>เลขห้อง</th>
                    <th>สถานะ</th>
                    <th className="admin-room-price-column">ราคา/เดือน</th>
                    <th className="admin-col-optional admin-room-size-column">ขนาดห้อง</th>
                    <th className="admin-col-optional admin-room-amenities-column">สิ่งอำนวยความสะดวก</th>
                    <th className="admin-col-optional admin-room-tenant-column">ผู้เช่า</th>
                    <th className="admin-col-optional admin-room-actions-column">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {roomsLoading ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : filteredRooms.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        ไม่พบข้อมูลห้องพัก
                      </td>
                    </tr>
                  ) : (
                    paginatedRooms.map((room) => (
                      <Fragment key={room.id}>
                        <tr>
                          <td className="admin-strong-cell">
                            <button type="button" className="room-number-link" onClick={() => openRoomDetail(room)} title="ดูรายละเอียดห้อง">
                              <RoomDetailIcon type="home" size={13} />
                              {room.room_number}
                            </button>
                          </td>
                          <td>
                            <span className={`admin-badge has-dot status-${room.is_booked ? 'booked' : 'vacant'}`}>
                              {room.is_booked ? 'ไม่ว่าง' : 'ว่าง'}
                            </span>
                          </td>
                          <td className="admin-price-cell admin-room-price-column">
                            ฿{formatCurrency(room.price)}
                            <span className="admin-price-unit">/เดือน</span>
                          </td>
                          <td className="admin-col-optional admin-room-size-column">
                            <span className={`admin-room-size-cell${room.room_size != null ? '' : ' is-empty'}`}>
                              {room.room_size != null ? formatRoomSize(room.room_size) : 'ไม่ระบุ'}
                            </span>
                          </td>
                          <td className="admin-col-optional admin-amenities-cell admin-room-amenities-column">
                            <AmenitiesList room={room} />
                          </td>
                          <td className="admin-col-optional admin-room-tenant-column">
                            {room.customer_id ? (
                              <span className="admin-room-tenant">
                                <span className="admin-room-tenant-avatar" aria-hidden="true">
                                  <RoomDetailIcon type="user" size={14} />
                                </span>
                                {room.first_name} {room.last_name}
                              </span>
                            ) : (
                              <span className="admin-room-tenant is-empty">ยังไม่มีผู้เช่า</span>
                            )}
                          </td>
                          <td className="admin-col-optional admin-room-actions-column">
                            <div className="admin-row-actions">
                              <button type="button" className="admin-action-btn is-view" onClick={() => openRoomDetail(room)}>
                                รายละเอียด
                              </button>
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditRoom(room)} disabled={Boolean(room.is_booked)} title={room.is_booked ? 'ห้องที่มีผู้เช่าอยู่ไม่สามารถแก้ไขได้' : undefined}>
                                แก้ไข
                              </button>
                              <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditRoom(room, 'amenities')} title="อุปกรณ์และทรัพย์สินในห้อง (แก้ได้แม้มีผู้เช่า)">
                                ทรัพย์สิน
                              </button>
                              <button type="button" className="admin-action-btn is-danger" onClick={() => setRoomDeleteConfirm(room)} disabled={Boolean(room.is_booked)} title={room.is_booked ? 'ห้องที่มีผู้เช่าอยู่ไม่สามารถลบได้' : undefined}>
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                        <ExpandToggleRow
                          open={expandedRoomRows.has(room.room_number)}
                          colSpan={7}
                          onClick={() => toggleRoomRow(room.room_number)}
                        />
                        <DetailRow
                          open={expandedRoomRows.has(room.room_number)}
                          colSpan={7}
                          fields={[
                            { label: 'สถานะ', value: room.is_booked ? 'ไม่ว่าง' : 'ว่าง' },
                            { label: 'ขนาดห้อง', value: room.room_size != null ? formatRoomSize(room.room_size) : 'ไม่ระบุ' },
                            { label: 'ราคา/เดือน', value: `฿${formatCurrency(room.price)}` },
                            {
                              label: 'ผู้เช่า',
                              value: room.customer_id
                                ? `${room.first_name} ${room.last_name}`
                                : 'ยังไม่มีผู้เช่า',
                            },
                            { label: 'สิ่งอำนวยความสะดวก', value: <AmenitiesList room={room} /> },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-action-btn is-view" onClick={() => openRoomDetail(room)}>
                                    รายละเอียด
                                  </button>
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditRoom(room)} disabled={Boolean(room.is_booked)} title={room.is_booked ? 'ห้องที่มีผู้เช่าอยู่ไม่สามารถแก้ไขได้' : undefined}>
                                    แก้ไข
                                  </button>
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openEditRoom(room, 'amenities')} title="อุปกรณ์และทรัพย์สินในห้อง (แก้ได้แม้มีผู้เช่า)">
                                    ทรัพย์สิน
                                  </button>
                                  <button type="button" className="admin-action-btn is-danger" onClick={() => setRoomDeleteConfirm(room)} disabled={Boolean(room.is_booked)} title={room.is_booked ? 'ห้องที่มีผู้เช่าอยู่ไม่สามารถลบได้' : undefined}>
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

            <div className="table-responsive admin-staff-table-wrap">
              <table className="table admin-table admin-staff-table">
                <thead>
                  <tr>
                    <th className="admin-staff-person-cell">พนักงาน</th>
                    <th className="admin-col-optional">บัตรประชาชน</th>
                    <th className="admin-staff-phone-cell">เบอร์โทร</th>
                    <th className="admin-col-optional">อายุ</th>
                    <th className="admin-staff-status-cell">สถานะ</th>
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
                      <tr
                        key={member.id}
                        data-admin-focus={`staff-${member.id}`}
                        className={`admin-staff-row${member.is_suspended ? ' is-suspended' : ''}`}
                        tabIndex={0}
                        aria-label={`ดูรายละเอียดพนักงาน ${member.first_name} ${member.last_name}`}
                        onClick={() => setStaffDetail(member)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') setStaffDetail(member)
                        }}
                      >
                        <td className="admin-staff-person-cell">
                          <div className="admin-staff-person">
                            <span className="admin-staff-avatar" aria-hidden="true">
                              <RoomDetailIcon type="user" size={18} />
                            </span>
                            <div className="admin-staff-name">
                              <strong>
                                {member.first_name} {member.last_name}
                              </strong>
                              <small>เริ่มงาน {member.created_at ? formatDate(member.created_at) : '-'}</small>
                            </div>
                          </div>
                        </td>
                        <td className="admin-col-optional">
                          <button
                            type="button"
                            className="admin-idcard-toggle"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleStaffIdCardReveal(member.id)
                            }}
                          >
                            {revealedStaffIdCards.has(member.id) ? member.idcard : '•'.repeat(String(member.idcard || '').length || 13)}
                          </button>
                        </td>
                        <td className="admin-staff-phone-cell">
                          <span className="admin-staff-phone">
                            <RoomDetailIcon type="phone" size={14} />
                            {member.phone || '-'}
                          </span>
                        </td>
                        <td className="admin-col-optional">
                          <span className="admin-staff-age">{member.age ? `${member.age} ปี` : '-'}</span>
                        </td>
                        <td className="admin-staff-status-cell">
                          <span className={`admin-staff-status${member.is_suspended ? ' is-suspended' : ' is-active'}`}>
                            <span className="admin-staff-status-dot" aria-hidden="true" />
                            {member.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                          </span>
                          <span className="admin-staff-mobile-open" aria-hidden="true">ดูรายละเอียด ›</span>
                        </td>
                        <td className="admin-col-optional">
                          <div className="admin-row-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                            <button type="button" className="admin-action-btn is-view" onClick={() => setStaffDetail(member)}>
                              ดูรายละเอียด
                            </button>
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
                          </div>
                        </td>
                      </tr>
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

            <StaffFilterPanel
              segments={CUSTOMER_SEGMENTS.map((segment) => ({
                key: segment.key,
                label: segment.label,
                count: customerSegmentCounts[segment.key],
              }))}
              segmentLabel="กรองรายการลูกค้า"
              segmentsBelow
              active={customerStatusFilter}
              onSegment={(key) => {
                setCustomerStatusFilter(key)
                setCustomersPage(1)
              }}
              search={customerSearch}
              onSearch={(value) => {
                setCustomerSearch(value)
                setCustomersPage(1)
              }}
              searchPlaceholder="ค้นหาชื่อ, เบอร์โทร, เลขห้อง, บัตร ปชช..."
              resultText={`พบ ${filteredCustomers.length} จาก ${customers.length} คน`}
              canClear={Boolean(customerSearch.trim()) || customerStatusFilter !== 'all' || customerSort !== 'room'}
              onClear={() => {
                setCustomerSearch('')
                setCustomerStatusFilter('all')
                setCustomerSort('room')
                setCustomersPage(1)
              }}
            >
              <select
                className="staff-filter-select"
                value={customerSort}
                onChange={(event) => {
                  setCustomerSort(event.target.value)
                  setCustomersPage(1)
                }}
                aria-label="เรียงลำดับ"
              >
                {CUSTOMER_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </StaffFilterPanel>

            {customersError && <div className="alert alert-danger">{customersError}</div>}

            <div className="table-responsive admin-customers-table-wrap">
              <table className="table admin-table admin-customer-table">
                <thead>
                  <tr>
                    <th>ลูกค้า</th>
                    <th className="admin-col-optional">บัตรประชาชน</th>
                    <th className="admin-customer-room-column">ห้อง</th>
                    <th className="admin-col-optional">ระยะเวลาสัญญา</th>
                    <th className="admin-col-optional admin-customer-contract-column">สัญญาเช่า / มัดจำ</th>
                    <th className="admin-col-optional admin-customer-stay-column">การเข้าพัก</th>
                    <th className="admin-customer-status-column">สถานะ</th>
                    <th className="admin-col-optional">การดำเนินการ</th>
                    <th className="admin-customer-profile-column" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {customersLoading ? (
                    <tr>
                      <td colSpan={9} className="admin-empty">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="admin-empty">
                        ไม่พบข้อมูลลูกค้า
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map((customer) => (
                      <Fragment key={customer.id}>
                        <tr
                          className="moveout-row"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดลูกค้า ${customer.first_name} ${customer.last_name}`}
                          onClick={() => openCustomerProfile(customer)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openCustomerProfile(customer)
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
                                <span className="admin-customer-phone">
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
                          <td className="admin-customer-room-column">
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
                          <td className="admin-col-optional admin-customer-contract-column">
                            <ContractCell contract={customer.contract} />
                          </td>
                          <td className="admin-col-optional admin-customer-stay-column">
                            {(Boolean(customer.is_suspended) || customer.room_number == null) && !customer.rental_start_date && !customer.rental_end_date ? (
                              <span className="admin-stay-label is-moved-out">ย้ายออกแล้ว</span>
                            ) : (
                              <span className="admin-stay-label is-staying">พักอยู่</span>
                            )}
                          </td>
                          <td className="admin-customer-status-column">
                            <span className={`admin-badge status-${customer.is_suspended ? 'suspended' : 'active'}`}>
                              {customer.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                            </span>
                            {customer.contract?.can_settle_deposit && (
                              <p className={`admin-status-hint is-deposit${customer.contract.deposit_refund === 'forfeit' ? ' is-forfeit' : ' is-refund'}`}>
                                {customer.contract.deposit_refund === 'forfeit' ? 'รอบันทึกริบมัดจำ' : 'รอคืนมัดจำ'}{' '}
                                ฿{formatCurrency(customer.contract.deposit_remaining ?? customer.contract.deposit_paid)}
                              </p>
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
                          <td className="moveout-cell-chevron admin-customer-profile-column" aria-hidden="true">
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
                          colSpan={9}
                          onClick={() => toggleCustomerRow(customer.id)}
                        />
                        <DetailRow
                          open={expandedCustomerRows.has(customer.id)}
                          colSpan={9}
                          fields={[
                            { label: 'ห้อง', value: customer.room_number || '-' },
                            {
                              label: 'สถานะ',
                              value: (
                                <>
                                  <span className={`admin-badge status-${customer.is_suspended ? 'suspended' : 'active'}`}>
                                    {customer.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                                  </span>
                                  {(Boolean(customer.is_suspended) || customer.room_number == null) && !customer.rental_start_date && !customer.rental_end_date && (
                                    <p className="admin-status-hint">ย้ายออกจากหอพักแล้ว</p>
                                  )}
                                </>
                              ),
                            },
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
                              label: 'สัญญาเช่า / มัดจำ',
                              value: <ContractCell contract={customer.contract} />,
                            },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-action-btn is-ghost" onClick={() => openCustomerProfile(customer)}>
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
          <div className="admin-card admin-request-history">
            <div className="admin-card-header">
              <h2>ประวัติคำขอผู้เช่า</h2>
            </div>

            <TransferContractPendingPanel apiBase="/api/admin" />

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
                  onChange={(event) => {
                    setRequestSearch(event.target.value)
                    setRequestLogs((current) => ({ ...current, page: 1 }))
                  }}
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
                    setRequestLogs((current) => ({ ...current, page: 1 }))
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="in_progress">รับเรื่องแล้ว</option>
                  <option value="approved">อนุมัติแล้ว</option>
                  <option value="rejected">ปฏิเสธแล้ว</option>
                  <option value="cancelled">ยกเลิกแล้ว</option>
                </select>
              </div>
            </div>

            {requestLogsError && <div className="alert alert-danger">{requestLogsError}</div>}

            {requestLogsLoading ? (
              <p className="admin-req-empty">กำลังโหลดข้อมูล...</p>
            ) : pagedRequestLogs.length === 0 ? (
              <p className="admin-req-empty">ไม่พบประวัติคำขอ</p>
            ) : (
              <div className="admin-req-grid">
                {pagedRequestLogs.map((request) => (
                  <AdminRequestCard key={request.id} request={request} onOpen={setRequestDetail} />
                ))}
              </div>
            )}
            <Pagination
              page={currentRequestLogsPage}
              totalPages={requestLogsTotalPages}
              onChange={(page) => setRequestLogs((current) => ({ ...current, page }))}
            />
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="admin-card admin-request-history">
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
                  onChange={(event) => {
                    setMaintenanceSearch(event.target.value)
                    setMaintenanceLogs((current) => ({ ...current, page: 1 }))
                  }}
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
                    setMaintenanceLogs((current) => ({ ...current, page: 1 }))
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

            {maintenanceLogsLoading ? (
              <p className="admin-req-empty">กำลังโหลดข้อมูล...</p>
            ) : pagedMaintenanceLogs.length === 0 ? (
              <p className="admin-req-empty">ไม่พบประวัติแจ้งซ่อม</p>
            ) : (
              <div className="admin-req-grid">
                {pagedMaintenanceLogs.map((request) => (
                  <AdminMaintenanceCard key={request.id} request={request} onOpen={setMaintenanceDetail} onPhotos={openMaintenancePhotos} />
                ))}
              </div>
            )}
            <Pagination
              page={currentMaintenanceLogsPage}
              totalPages={maintenanceLogsTotalPages}
              onChange={(page) => setMaintenanceLogs((current) => ({ ...current, page }))}
            />
          </div>
        )}

        {activeTab === 'moveouts' && (
          <div className="admin-card admin-request-history">
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
                  onChange={(event) => {
                    setMoveoutSearch(event.target.value)
                    setMoveoutLogs((current) => ({ ...current, page: 1 }))
                  }}
                />
              </div>
            </div>

            {moveoutLogsError && <div className="alert alert-danger">{moveoutLogsError}</div>}

            {moveoutLogsLoading ? (
              <p className="admin-req-empty">กำลังโหลดข้อมูล...</p>
            ) : pagedMoveouts.length === 0 ? (
              <p className="admin-req-empty">ไม่พบรายชื่อผู้ย้ายออก</p>
            ) : (
              <div className="admin-req-grid">
                {pagedMoveouts.map((moveout) => (
                  <AdminMoveoutCard
                    key={moveout.id}
                    moveout={moveout}
                    idcardRevealed={revealedMoveoutIdCards.has(moveout.id)}
                    onToggleIdCard={() => toggleMoveoutIdCardReveal(moveout.id)}
                    onOpen={openMoveoutDetail}
                  />
                ))}
              </div>
            )}
            <Pagination
              page={currentMoveoutPage}
              totalPages={moveoutLogsTotalPages}
              onChange={(page) => setMoveoutLogs((current) => ({ ...current, page }))}
            />
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="admin-card exp-ui-card">
            <div className="admin-card-header">
              <h2>
                รายจ่าย
                {expensesTotal > 0 && <span className="exp-ui-count">{expensesTotal}</span>}
              </h2>
              <button type="button" className="admin-action-btn is-primary" onClick={openCreateExpense}>
                + บันทึกรายจ่าย
              </button>
            </div>

            <div className="exp-ui-filters">
              <div className="exp-ui-filter-row">
                <label className="exp-ui-search">
                  <RoomDetailIcon type="search" size={16} />
                  <input
                    type="search"
                    value={expenseFilters.search}
                    onChange={(event) => updateExpenseFilters({ search: event.target.value }, { debounce: true })}
                    placeholder="ค้นหาหมวดหมู่ รายละเอียด ร้านค้า เลขใบเสร็จ หรือเลขห้อง"
                    aria-label="ค้นหา"
                  />
                </label>
                <select
                  className="exp-ui-select"
                  value={expenseFilters.category}
                  onChange={(event) => updateExpenseFilters({ category: event.target.value })}
                  aria-label="หมวดหมู่"
                >
                  <option value="">ทุกหมวดหมู่</option>
                  {expenseSummary.byCategory.map((item) => (
                    <option key={item.category} value={item.category}>
                      {item.category} ({item.count})
                    </option>
                  ))}
                </select>
              </div>
              <div className="exp-ui-date-range">
                <span className="exp-ui-date-label">
                  <RoomDetailIcon type="calendar" size={14} />
                  ช่วงวันที่
                </span>
                <div className="exp-ui-date-inputs">
                  <ThaiDatePicker
                    className="exp-ui-select exp-ui-date-input"
                    placeholder="ตั้งแต่วันที่"
                    value={expenseFilters.from}
                    isClearable
                    onChange={(value) => updateExpenseFilters({ from: value || '' })}
                  />
                  <span className="exp-ui-date-sep" aria-hidden="true">ถึง</span>
                  <ThaiDatePicker
                    className="exp-ui-select exp-ui-date-input"
                    placeholder="ถึงวันที่"
                    value={expenseFilters.to}
                    isClearable
                    onChange={(value) => updateExpenseFilters({ to: value || '' })}
                  />
                </div>
              </div>
              {expenseFiltersActive && (
                <div className="exp-ui-result">
                  <span>พบ {expensesTotal} รายการ</span>
                  <button type="button" className="exp-ui-clear" onClick={() => updateExpenseFilters(EMPTY_EXPENSE_FILTERS)}>
                    ล้างตัวกรอง
                  </button>
                </div>
              )}
            </div>

            <div className="exp-ui-list">
            {expensesError ? (
              <div className="exp-ui-empty">
                <p className="exp-ui-error">{expensesError}</p>
                <button type="button" className="admin-action-btn is-ghost" disabled={expensesLoading} onClick={() => loadExpenses(expensesPage)}>
                  ลองใหม่
                </button>
              </div>
            ) : expensesLoading ? (
              <p className="exp-ui-empty">กำลังโหลดข้อมูล...</p>
            ) : expenses.length === 0 ? (
              <p className="exp-ui-empty">{expenseFiltersActive ? 'ไม่พบรายจ่ายที่ตรงกับเงื่อนไข' : 'ยังไม่มีรายการรายจ่าย'}</p>
            ) : (
              <div className="exp-ui-grid">
                {expenses.map((expense) => (
                  <article key={expense.id} className="exp-ui-item">
                    <div className="exp-ui-item-head">
                      <span className="exp-ui-avatar" aria-hidden="true">
                        <RoomDetailIcon type="receipt" size={18} />
                      </span>
                      <div className="exp-ui-identity">
                        <strong title={expense.description || expense.category}>{expense.description || expense.category}</strong>
                        <span className="exp-ui-category">{expense.category}</span>
                      </div>
                      <span className="exp-ui-date">{formatDate(expense.expense_date)}</span>
                    </div>
                    <div className="exp-ui-amount-row">
                      <div className="exp-ui-amount">
                        <small>จำนวนเงิน</small>
                        <strong>฿{formatCurrency(expense.amount)}</strong>
                      </div>
                    </div>
                    <dl className="exp-ui-facts is-columns">
                      {[
                        { key: 'vendor', icon: 'user', label: 'ผู้รับเงิน', value: expense.vendor || 'ไม่ระบุ' },
                        { key: 'payment', icon: 'wallet', label: 'ชำระโดย', value: EXPENSE_PAYMENT_METHOD_LABEL[expense.payment_method] || 'ไม่ระบุ' },
                        { key: 'receipt', icon: 'receipt', label: 'เลขใบเสร็จ', value: expense.receipt_number || 'ไม่ระบุ' },
                        { key: 'room', icon: 'door', label: 'ห้องที่เกี่ยวข้อง', value: expense.room_number ? `ห้อง ${expense.room_number}` : 'ไม่ระบุ' },
                      ].map((fact) => (
                        <div key={fact.key}>
                          <dt>
                            <RoomDetailIcon type={fact.icon} size={15} />
                            {fact.label}
                          </dt>
                          <dd>{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {expense.photos?.length > 0 && (
                      <div className="exp-ui-thumbs-block">
                        <span className="exp-ui-thumbs-title">รูปหลักฐาน · {expense.photos.length} รูป</span>
                        <button
                          type="button"
                          className="exp-ui-thumbs"
                          aria-label={`ดูรูปหลักฐานทั้งหมด ${expense.photos.length} รูป`}
                          onClick={() => openExpenseDetail(expense)}
                        >
                          {expense.photos.slice(0, 4).map((photo, index) => (
                            <span key={photo.url} className="exp-ui-thumb">
                              <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
                              {index === 3 && expense.photos.length > 4 && (
                                <span className="exp-ui-thumb-more">+{expense.photos.length - 4}</span>
                              )}
                            </span>
                          ))}
                        </button>
                      </div>
                    )}
                    <div className="exp-ui-footer">
                      <div className="exp-ui-recorder">
                        <span className="exp-ui-dot" aria-hidden="true" />
                        <span>
                          บันทึกโดย <strong>{expense.recorded_by_name || '-'}</strong>
                        </span>
                        <time dateTime={expense.created_at}>{formatDateTime(expense.created_at)}</time>
                      </div>
                      <div className="exp-ui-actions">
                        <button type="button" className="exp-ui-link" onClick={() => openExpenseDetail(expense)}>
                          ดูรายละเอียด
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn is-danger"
                          onClick={() => {
                            setExpenseDeleteError('')
                            setExpenseDelete(expense)
                          }}
                        >
                          ลบ
                        </button>
                        <button type="button" className="admin-action-btn is-primary" onClick={() => openEditExpense(expense)}>
                          แก้ไข
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            </div>

            <div className="exp-ui-pagination">
              <span>
                {expensesTotal > 0
                  ? `แสดง ${(expensesPage - 1) * EXPENSES_PAGE_SIZE + 1}-${Math.min(expensesPage * EXPENSES_PAGE_SIZE, expensesTotal)} จาก ${expensesTotal} รายการ`
                  : '0 รายการ'}
              </span>
              <Pagination page={expensesPage} totalPages={expensesTotalPages} onChange={(page) => loadExpenses(page)} />
            </div>
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

        {activeTab === 'move-in-inspections' && <MoveInInspectionPanel Modal={StaffModal} FilterPanel={StaffFilterPanel} />}

        {activeTab === 'move-out-inspections' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2>ผลตรวจห้อง ({moveOutInspections.length})</h2>
                <p className="waiting-list-storage-note">ผลตรวจจากคำขอย้ายห้อง คำขอแจ้งย้ายออก และผลตรวจย้ายออกที่ Staff บันทึก</p>
              </div>
              <button type="button" className="admin-action-btn is-primary" onClick={openCreateInspection}>
                + เพิ่มผลตรวจก่อนย้ายห้อง
              </button>
            </div>
            <div className="admin-toolbar admin-inspection-toolbar">
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
            <div className="table-responsive admin-inspection-table-wrap">
              <table className="table admin-table admin-inspection-table insp-table">
                <thead>
                  <tr>
                    <th>ห้อง</th>
                    <th className="admin-insp-purpose-column">ประเภทการตรวจ</th>
                    <th className="admin-insp-tenant-column">ผู้เช่า</th>
                    <th className="admin-insp-date-column">วันที่ตรวจ</th>
                    <th>ผลตรวจ</th>
                    <th className="admin-insp-inspector-column">ผู้ตรวจ</th>
                    <th className="admin-insp-photos-column">รูป</th>
                    <th className="admin-insp-status-column">สถานะ</th>
                    <th className="admin-inspection-actions admin-insp-actions-column">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInspections.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="admin-empty">
                        {kindInspections.length ? 'ไม่พบผลตรวจตามเงื่อนไข' : inspectionKind === 'all' ? 'ยังไม่มีผลตรวจห้อง' : ADMIN_INSPECTION_KINDS[inspectionKind].empty}
                      </td>
                    </tr>
                  ) : (
                    filteredInspections.map((inspection) => {
                      const summary = summarizeInspection(inspection.checklist)
                      const issueCount = summary.counts.damaged + summary.counts.missing
                      return (
                        <Fragment key={inspection.id}>
                        <tr
                          data-admin-focus={`inspection-${inspection.id}`}
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
                              isMoveRoom={inspection.tenant_request_type === 'move_room'}
                              sourceLabel={`ที่มา: ${getInspectionSourceLabel(inspection)}`}
                            />
                          </td>
                          <td className="admin-insp-purpose-column">
                            <InspectionPurposeBadge inspection={inspection} />
                          </td>
                          <td className="admin-insp-tenant-column">
                            <InspectionPersonCell name={inspection.tenant_name} phone={inspection.tenant_phone} />
                          </td>
                          <td className="admin-insp-date-column">
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
                          <td className="admin-insp-inspector-column">
                            <InspectionInspectorCell name={inspection.inspected_by} className="admin-actor-inline" />
                          </td>
                          <td className="admin-insp-photos-column">
                            <InspectionPhotosCell count={inspection.photo_count} />
                          </td>
                          <td className="admin-insp-status-column">
                            {inspection.tenant_request_id ? (
                              <span className="insp-status-badge is-reviewed">Staff ตรวจแล้ว</span>
                            ) : (
                              <span className={`insp-status-badge is-${inspection.status || 'pending'}`}>
                                {MOVE_OUT_INSPECTION_STATUS[inspection.status || 'pending']}
                              </span>
                            )}
                          </td>
                          <td className="admin-inspection-actions admin-insp-actions-column">
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
                        <ExpandToggleRow
                          open={expandedInspectionRows.has(inspection.id)}
                          colSpan={9}
                          onClick={() => toggleInspectionRow(inspection.id)}
                        />
                        <DetailRow
                          open={expandedInspectionRows.has(inspection.id)}
                          colSpan={9}
                          fields={[
                            { label: 'ประเภทการตรวจ', value: <InspectionPurposeBadge inspection={inspection} /> },
                            { label: 'ผู้เช่า', value: <InspectionPersonCell name={inspection.tenant_name} phone={inspection.tenant_phone} /> },
                            { label: 'ที่มาของผลตรวจ', value: getInspectionSourceLabel(inspection) },
                            { label: 'วันที่ตรวจ', value: <InspectionDateCell value={inspection.created_at} /> },
                            {
                              label: 'ผลตรวจ',
                              value: <span className={`inspection-result is-${summary.tone}`}>{INSPECTION_TONE_LABEL[summary.tone]}{issueCount > 0 && ` ${issueCount} ข้อ`}</span>,
                            },
                            { label: 'ผู้ตรวจ', value: <InspectionInspectorCell name={inspection.inspected_by} /> },
                            { label: 'รูป', value: <InspectionPhotosCell count={inspection.photo_count} /> },
                            {
                              label: 'สถานะ',
                              value: inspection.tenant_request_id
                                ? <span className="insp-status-badge is-reviewed">Staff ตรวจแล้ว</span>
                                : <span className={`insp-status-badge is-${inspection.status || 'pending'}`}>{MOVE_OUT_INSPECTION_STATUS[inspection.status || 'pending']}</span>,
                            },
                            {
                              label: 'การดำเนินการ',
                              value: (
                                <div className="admin-inspection-mobile-actions">
                                  <button type="button" className="admin-action-btn is-view" onClick={() => openInspectionDetail(inspection)}>ดูรายละเอียด</button>
                                  {inspection.tenant_request_id ? (
                                    <button
                                      type="button"
                                      className="insp-status-action is-edit"
                                      disabled={inspectionEditLoadingId === inspection.id}
                                      onClick={() => openEditInspectionFromRow(inspection)}
                                    >
                                      {inspectionEditLoadingId === inspection.id ? 'กำลังโหลด...' : 'แก้ไข'}
                                    </button>
                                  ) : (
                                    <InspectionStatusActions
                                      status={inspection.status || 'pending'}
                                      onChange={(next) => setInspectionConfirm({ kind: 'status', inspection, next })}
                                    />
                                  )}
                                </div>
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
          </div>
        )}
      </div>

      {moveoutDetail && (
        <Modal title="รายละเอียดการย้ายออก" onClose={() => setMoveoutDetail(null)} variant="moveout-detail">
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
        <Modal
          title={`ผลตรวจห้อง ${inspectionDetail.room_number}`}
          onClose={() => { setPhotoPreview(null); setPhotoGalleryPage(null); setInspectionDetail(null) }}
          variant="inspection-detail"
          headerExtra={<><span>ประเภทการตรวจ</span><InspectionPurposeBadge inspection={inspectionDetail} /></>}
        >
          {() => {
            const isLinkedRequest = Boolean(inspectionDetail.tenant_request_id)
            const status = isLinkedRequest ? 'reviewed' : inspectionDetail.status || 'pending'
            return (
              <InspectionDetail
                inspection={inspectionDetail}
                purposeInHeader
                statusLabel={isLinkedRequest ? 'Staff ตรวจแล้ว' : MOVE_OUT_INSPECTION_STATUS[status]}
                statusTone={status}
                actorClassName="admin-actor-inline"
                photoLimit={INSPECTION_PHOTO_PREVIEW_COUNT}
                onOpenPhoto={showPhoto}
                onOpenGallery={() => setPhotoGalleryPage(1)}
                footer={
                  <footer className="idt-footer">
                    {isLinkedRequest && (
                      <div className="idt-footer-right">
                        <button type="button" className="idt-footer-btn is-primary" onClick={() => openEditInspectionForm(inspectionDetail)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />
                          </svg>
                          แก้ไขผลตรวจ
                        </button>
                      </div>
                    )}
                    {!isLinkedRequest && (
                      <div className="idt-footer-right">
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
              previewUrlFor={adminTransferPreviewUrl}
              onCancel={() => setInspectionConfirm({ kind: 'cancel', close: requestClose })}
              onSubmit={(payload) => setInspectionConfirm({ kind: 'save', payload, close: requestClose })}
            />
          )}
        </Modal>
      )}

      {inspectionConfirm && (
        <Modal
          title={
            inspectionConfirm.kind === 'status'
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
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5.5M12 16.5h.01" />
                  </svg>
                )}
              </div>
              <p className="admin-confirm-message">
                {inspectionConfirm.kind === 'status'
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
                    } finally {
                      setInspectionConfirmBusy(false)
                      requestClose()
                    }
                  }}
                >
                  {inspectionConfirmBusy
                    ? 'กำลังดำเนินการ...'
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

      {staffDetail && (
        <Modal title="รายละเอียดพนักงาน" onClose={() => setStaffDetail(null)} variant="expense">
          {(requestClose) => {
            const member = staffList.find((item) => item.id === staffDetail.id) || staffDetail
            const runAfterClose = (action) => {
              requestClose()
              action(member)
            }
            return (
              <div className="exp-ui-body">
                <div className="exp-ui-top">
                  <div className="admin-staff-hero">
                    <span className="admin-staff-avatar is-large" aria-hidden="true">
                      <RoomDetailIcon type="user" size={26} />
                    </span>
                    <div className="admin-staff-hero-text">
                      <small>พนักงาน</small>
                      <strong>
                        {member.first_name} {member.last_name}
                      </strong>
                    </div>
                    <span className={`admin-staff-status${member.is_suspended ? ' is-suspended' : ' is-active'}`}>
                      <span className="admin-staff-status-dot" aria-hidden="true" />
                      {member.is_suspended ? 'ระงับการใช้งาน' : 'ใช้งานปกติ'}
                    </span>
                  </div>
                </div>
                <div className="exp-ui-scroll">
                  <section className="exp-ui-section">
                    <h4 className="exp-ui-section-title">ข้อมูลพนักงาน</h4>
                    <dl className="exp-ui-facts is-columns">
                      <div>
                        <dt>
                          <RoomDetailIcon type="phone" size={15} />
                          เบอร์โทร
                        </dt>
                        <dd>{member.phone ? <a className="admin-staff-tel" href={`tel:${member.phone}`}>{member.phone}</a> : '-'}</dd>
                      </div>
                      <div>
                        <dt>
                          <RoomDetailIcon type="user" size={15} />
                          อายุ
                        </dt>
                        <dd>{member.age ? `${member.age} ปี` : '-'}</dd>
                      </div>
                      <div>
                        <dt>
                          <RoomDetailIcon type="note" size={15} />
                          บัตรประชาชน
                        </dt>
                        <dd>
                          <button type="button" className="admin-idcard-toggle" onClick={() => toggleStaffIdCardReveal(member.id)}>
                            {revealedStaffIdCards.has(member.id) ? member.idcard : '•'.repeat(String(member.idcard || '').length || 13)}
                          </button>
                        </dd>
                      </div>
                      <div>
                        <dt>
                          <RoomDetailIcon type="calendar" size={15} />
                          เริ่มงานเมื่อ
                        </dt>
                        <dd>{member.created_at ? formatDate(member.created_at) : '-'}</dd>
                      </div>
                    </dl>
                  </section>
                </div>
                <div className="exp-ui-footer-bar">
                  <div className="exp-ui-modal-actions">
                    <button type="button" className="admin-action-btn is-danger" onClick={() => runAfterClose(setStaffDeleteConfirm)}>
                      ลบ
                    </button>
                    <button
                      type="button"
                      className={`admin-action-btn ${member.is_suspended ? 'is-success' : 'is-warning'}`}
                      onClick={() => runAfterClose(setStaffSuspendConfirm)}
                    >
                      {member.is_suspended ? 'เปิดใช้งาน' : 'ระงับ'}
                    </button>
                    <button type="button" className="admin-action-btn is-primary" onClick={() => runAfterClose(openEditStaff)}>
                      แก้ไข
                    </button>
                  </div>
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {parcelDetail && (
        <Modal title="รายละเอียดพัสดุ" onClose={() => setParcelDetail(null)} variant="expense">
          {() => {
            const received = parcelDetail.status === 'received'
            const statusInfo = parcelStatusInfo(parcelDetail.status)
            const photos = parcelDetail.photos || []
            const tenantName = parcelDetail.first_name ? `${parcelDetail.first_name} ${parcelDetail.last_name}` : 'ไม่มีผู้เช่าปัจจุบัน'
            return (
              <div className="exp-ui-body">
                <div className="exp-ui-top">
                  <div className="exp-ui-detail-head">
                    <span className={`parcel-status ${statusInfo.tone}`}>{statusInfo.label}</span>
                    <span className="exp-ui-detail-date">
                      <RoomDetailIcon type="calendar" size={16} />
                      <span>
                        <small>บันทึกเมื่อ</small>
                        <strong>{formatDateTime(parcelDetail.created_at)}</strong>
                      </span>
                    </span>
                  </div>
                  <div className="exp-ui-summary">
                    <span className="exp-ui-summary-icon">
                      <PackageIcon size={30} strokeWidth={2} />
                    </span>
                    <div className="exp-ui-summary-amount">
                      <small>ห้อง</small>
                      <strong>{parcelDetail.room_number}</strong>
                    </div>
                    <div className="exp-ui-summary-vendor">
                      <small>ผู้รับ</small>
                      <span className="parcel-recipient-name">
                        {tenantName}
                        {parcelDetail.is_previous_tenant ? <em className="parcel-prev-tenant">{PREVIOUS_TENANT_LABEL}</em> : null}
                      </span>
                      {parcelDetail.phone && (
                        <em>
                          <RoomDetailIcon type="phone" size={13} />
                          {parcelDetail.phone}
                        </em>
                      )}
                    </div>
                  </div>
                </div>
                <div className="exp-ui-scroll">
                  <section className="exp-ui-section">
                    <h4 className="exp-ui-section-title">ข้อมูลพัสดุ</h4>
                    <dl className="exp-ui-facts is-columns">
                      {[
                        { key: 'sender', icon: 'user', label: 'ผู้ส่ง', value: parcelDetail.sender_name || 'พัสดุทั่วไป' },
                        { key: 'tracking', icon: 'receipt', label: 'เลขพัสดุ', value: parcelDetail.tracking_number || '-' },
                        { key: 'by', icon: 'user', label: 'บันทึกโดย', value: parcelDetail.staff_name || 'เจ้าหน้าที่' },
                        { key: 'received', icon: 'clock', label: 'วันที่รับ', value: received ? formatDateTime(parcelDetail.received_at) : parcelDetail.status === 'cancelled' ? 'ผู้เช่าย้ายออก' : 'ยังไม่ได้รับ' },
                      ].map((fact) => (
                        <div key={fact.key}>
                          <dt>
                            <RoomDetailIcon type={fact.icon} size={15} />
                            {fact.label}
                          </dt>
                          <dd>{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {parcelDetail.description && (
                      <div className="exp-ui-note">
                        <span>รายละเอียด</span>
                        <p>{parcelDetail.description}</p>
                      </div>
                    )}
                  </section>
                  <section className="exp-ui-section">
                    <h4 className="exp-ui-section-title">
                      รูปพัสดุ
                      <small className="exp-ui-counter">{photos.length} รูป</small>
                    </h4>
                    {photos.length > 0 ? (
                      <div className="exp-ui-gallery-thumbs is-wrap">
                        {photos.map((photo, index) => (
                          <button
                            key={photo.url}
                            type="button"
                            className="exp-ui-gallery-thumb is-large"
                            aria-label={`ดูรูปพัสดุ ${index + 1}`}
                            onClick={() => {
                              setParcelPhotoPreview(parcelDetail)
                              setPhotoPreview(index)
                            }}
                          >
                            <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="exp-ui-muted">ไม่มีรูปพัสดุ</p>
                    )}
                  </section>
                  <ProcessSteps
                    title="ขั้นตอนการดำเนินการ"
                    actorClassName="admin-actor-inline"
                    startDate={parcelDetail.created_at}
                    endDate={received ? parcelDetail.received_at : null}
                    waitingText={parcelDetail.status === 'cancelled' ? 'ผู้เช่าย้ายออก' : 'รอผู้เช่ารับพัสดุ'}
                    steps={[
                      { key: 'record', label: 'บันทึกพัสดุเข้าห้อง', by: parcelDetail.staff_name || 'เจ้าหน้าที่', date: parcelDetail.created_at, icon: 'box' },
                      {
                        key: 'receive',
                        label: received ? 'ผู้เช่ารับพัสดุแล้ว' : parcelDetail.status === 'cancelled' ? 'ผู้เช่าย้ายออก' : 'รอผู้เช่ารับพัสดุ',
                        date: received ? parcelDetail.received_at : null,
                        icon: 'check',
                        pendingText: parcelDetail.status === 'cancelled' ? 'ยกเลิก' : 'ยังไม่ได้รับ',
                      },
                    ]}
                  />
                </div>
              </div>
            )
          }}
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
              { icon: 'wallet', label: 'เงินมัดจำ', value: request.deposit_amount != null ? `฿${formatCurrency(request.deposit_amount)}` : '-' },
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

                <div className={`request-detail-note${request.note ? '' : ' is-empty'}`}>
                  <span className="request-detail-note-label">
                    <RoomDetailIcon type="note" size={14} />
                    {request.type === 'moveout' ? 'เหตุผล / รายละเอียดการย้ายออก' : 'หมายเหตุจากผู้เช่า'}
                  </span>
                  <p>{request.note || 'ผู้เช่าไม่ได้ระบุรายละเอียด'}</p>
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
                </section>

                <section className="payment-detail-section">
                  <h4><RoomDetailIcon type="user" size={16} />ผู้ดำเนินการ</h4>
                  <dl className="request-detail-actors">
                    <div>
                      <dt><RoomDetailIcon type="user" size={14} />รับเรื่องโดย</dt>
                      <dd><StaffActionCell name={request.accepted_by_name} date={request.accepted_at} /></dd>
                    </div>
                    <div>
                      <dt><RoomDetailIcon type="check" size={14} />{request.status === 'cancelled' ? 'ยกเลิกโดย' : request.status === 'rejected' ? 'ปฏิเสธโดย' : 'เสร็จสิ้นโดย'}</dt>
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

      {expenseDelete && (
        <Modal title="ยืนยันการลบรายจ่าย" onClose={() => setExpenseDelete(null)} variant="confirm">
          {(requestClose) => (
            <div className="exp-ui-confirm">
              <span className="exp-ui-confirm-icon">
                <RoomDetailIcon type="alert" size={26} />
              </span>
              <p className="exp-ui-confirm-message">ลบรายจ่ายนี้ออกจากระบบ?</p>
              <dl className="exp-ui-confirm-details">
                <div>
                  <dt>วันที่</dt>
                  <dd>{formatDate(expenseDelete.expense_date)}</dd>
                </div>
                <div>
                  <dt>หมวดหมู่</dt>
                  <dd>{expenseDelete.category}</dd>
                </div>
                <div>
                  <dt>จำนวนเงิน</dt>
                  <dd>฿{formatCurrency(expenseDelete.amount)}</dd>
                </div>
              </dl>
              {expenseDeleteError && (
                <p className="exp-ui-error" role="alert">
                  {expenseDeleteError}
                </p>
              )}
              <div className="exp-ui-modal-actions">
                <button type="button" className="admin-action-btn is-ghost" disabled={expenseDeleting} onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="admin-action-btn is-danger" disabled={expenseDeleting} onClick={() => confirmDeleteExpense(requestClose)}>
                  {expenseDeleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {expenseModal && (
        <Modal
          title={expenseModal.mode === 'create' ? 'บันทึกรายจ่าย' : 'แก้ไขรายจ่าย'}
          onClose={() => setExpenseModal(null)}
          variant="expense"
        >
          {(requestClose) => {
            const setField = (field) => (event) => setExpenseForm((prev) => ({ ...prev, [field]: event.target.value }))
            const photoCount = expenseForm.keptPhotos.length + expenseForm.newPhotos.length
            const expenseExtraFilled = ['vendor', 'payment_method', 'receipt_number', 'room_number'].filter(
              (field) => String(expenseForm[field]).trim(),
            ).length
            return (
              <form className="exp-ui-body" onSubmit={(event) => submitExpenseForm(event, requestClose)} noValidate>
                <div className="exp-ui-scroll">
                  <section className="exp-ui-section">
                    <h4 className="exp-ui-section-title">ข้อมูลรายจ่าย</h4>
                    <div className="exp-ui-form-grid">
                      <div className="exp-ui-field is-full">
                        <label className="exp-ui-label" htmlFor="admin-expense-category">
                          หมวดหมู่ <span className="text-danger">*</span>
                        </label>
                        <input
                          id="admin-expense-category"
                          type="text"
                          className="exp-ui-input"
                          placeholder="พิมพ์เอง หรือเลือกจากด้านล่าง"
                          maxLength={50}
                          value={expenseForm.category}
                          onChange={setField('category')}
                        />
                        <div className="exp-ui-chips" role="group" aria-label="หมวดหมู่ที่ใช้บ่อย">
                          {EXPENSE_CATEGORY_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={`exp-ui-chip${expenseForm.category.trim() === preset ? ' is-active' : ''}`}
                              onClick={() => setExpenseForm((prev) => ({ ...prev, category: preset }))}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="exp-ui-field">
                        <label className="exp-ui-label" htmlFor="admin-expense-amount">
                          จำนวนเงิน (บาท) <span className="text-danger">*</span>
                        </label>
                        <input
                          id="admin-expense-amount"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          className="exp-ui-input"
                          value={expenseForm.amount}
                          onChange={setField('amount')}
                        />
                      </div>
                      <div className="exp-ui-field">
                        <label className="exp-ui-label" htmlFor="admin-expense-date">
                          วันที่จ่าย <span className="text-danger">*</span>
                        </label>
                        <ThaiDatePicker
                          id="admin-expense-date"
                          className="exp-ui-input"
                          value={expenseForm.expense_date}
                          onChange={(date) => setExpenseForm((prev) => ({ ...prev, expense_date: date }))}
                        />
                      </div>
                      <div className="exp-ui-field is-full">
                        <label className="exp-ui-label" htmlFor="admin-expense-description">
                          รายละเอียด <span className="text-danger">*</span>
                        </label>
                        <textarea
                          id="admin-expense-description"
                          className="exp-ui-input exp-ui-textarea"
                          rows={3}
                          maxLength={255}
                          placeholder="อธิบายรายจ่ายนี้ เช่น ซื้ออะไร ซ่อมจุดไหน"
                          value={expenseForm.description}
                          onChange={setField('description')}
                        />
                        <small className="exp-ui-counter">{expenseForm.description.length}/255</small>
                      </div>
                    </div>
                  </section>

                  <section className={`exp-ui-section exp-ui-collapsible${expenseExtraOpen ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="exp-ui-collapse-toggle"
                      aria-expanded={expenseExtraOpen}
                      aria-controls="admin-expense-extra-fields"
                      onClick={() => setExpenseExtraOpen((open) => !open)}
                    >
                      <span className="exp-ui-section-title">
                        รายละเอียดเพิ่มเติม
                        <small className="exp-ui-optional">ไม่บังคับ</small>
                      </span>
                      {!expenseExtraOpen && expenseExtraFilled > 0 && (
                        <span className="exp-ui-filled">กรอกแล้ว {expenseExtraFilled} ช่อง</span>
                      )}
                      <svg className="exp-ui-collapse-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    <div className="exp-ui-form-grid" id="admin-expense-extra-fields" hidden={!expenseExtraOpen}>
                      <div className="exp-ui-field">
                        <label className="exp-ui-label" htmlFor="admin-expense-vendor">
                          ผู้รับเงิน / ร้านค้า
                        </label>
                        <input
                          id="admin-expense-vendor"
                          type="text"
                          className="exp-ui-input"
                          placeholder="เช่น การไฟฟ้า, ร้านวัสดุ"
                          maxLength={120}
                          value={expenseForm.vendor}
                          onChange={setField('vendor')}
                        />
                      </div>
                      <div className="exp-ui-field">
                        <label className="exp-ui-label" htmlFor="admin-expense-payment">
                          วิธีชำระเงิน
                        </label>
                        <select id="admin-expense-payment" className="exp-ui-input" value={expenseForm.payment_method} onChange={setField('payment_method')}>
                          <option value="">ไม่ระบุ</option>
                          {Object.entries(EXPENSE_PAYMENT_METHOD_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="exp-ui-field">
                        <label className="exp-ui-label" htmlFor="admin-expense-receipt">
                          เลขที่ใบเสร็จ / อ้างอิง
                        </label>
                        <input
                          id="admin-expense-receipt"
                          type="text"
                          className="exp-ui-input"
                          maxLength={60}
                          value={expenseForm.receipt_number}
                          onChange={setField('receipt_number')}
                        />
                      </div>
                      <div className="exp-ui-field">
                        <label className="exp-ui-label" htmlFor="admin-expense-room">
                          ห้องที่เกี่ยวข้อง
                        </label>
                        <select id="admin-expense-room" className="exp-ui-input" value={expenseForm.room_number} onChange={setField('room_number')}>
                          <option value="">ไม่เกี่ยวกับห้องใด</option>
                          {[...rooms]
                            .sort((a, b) => a.room_number - b.room_number)
                            .map((room) => (
                              <option key={room.room_number} value={String(room.room_number)}>
                                ห้อง {room.room_number}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </section>

                  <section className="exp-ui-section">
                    <h4 className="exp-ui-section-title">
                      รูปใบเสร็จ / หลักฐาน <span className="text-danger">*</span>
                      <small className="exp-ui-counter">
                        {photoCount}/{EXPENSE_MAX_PHOTOS} รูป · JPG, PNG, WebP ไม่เกิน 5 MB
                      </small>
                    </h4>
                    {expenseForm.keptPhotos.length > 0 && (
                      <div className="exp-ui-kept-photos">
                        {expenseForm.keptPhotos.map((photo, index) => (
                          <figure key={photo.url} className="exp-ui-kept-photo">
                            <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
                            <button
                              type="button"
                              className="parcel-photo-remove"
                              aria-label={`นำรูปที่ ${index + 1} ออก`}
                              onClick={() =>
                                setExpenseForm((prev) => ({
                                  ...prev,
                                  keptPhotos: prev.keptPhotos.filter((item) => item.url !== photo.url),
                                }))
                              }
                            >
                              ลบ
                            </button>
                          </figure>
                        ))}
                      </div>
                    )}
                    <ParcelPhotoPicker
                      id="admin-expense-photos"
                      files={expenseForm.newPhotos}
                      onChange={(files) => setExpenseForm((prev) => ({ ...prev, newPhotos: files }))}
                      error={expensePhotoError}
                      onError={setExpensePhotoError}
                      heading={false}
                      maxPhotos={Math.max(0, EXPENSE_MAX_PHOTOS - expenseForm.keptPhotos.length)}
                    />
                  </section>
                </div>

                <div className="exp-ui-footer-bar">
                  {expenseFormError && <p className="exp-ui-error">{expenseFormError}</p>}
                  <div className="exp-ui-modal-actions">
                    <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>
                      ยกเลิก
                    </button>
                    <button type="submit" className="admin-action-btn is-primary" disabled={expenseSubmitting}>
                      {expenseSubmitting ? 'กำลังบันทึก...' : expenseModal.mode === 'create' ? 'บันทึกรายจ่าย' : 'บันทึกการแก้ไข'}
                    </button>
                  </div>
                </div>
              </form>
            )
          }}
        </Modal>
      )}

      {expenseDetail && (
        <Modal title="รายละเอียดรายจ่าย" onClose={() => setExpenseDetail(null)} variant="expense">
          {(requestClose) => (
            <div className="exp-ui-body">
              <div className="exp-ui-top">
                <div className="exp-ui-detail-head">
                  <span className="exp-ui-category">{expenseDetail.category}</span>
                  {expenseDetail.payment_method && (
                    <span className="exp-ui-method">{EXPENSE_PAYMENT_METHOD_LABEL[expenseDetail.payment_method]}</span>
                  )}
                  <span className="exp-ui-detail-date">
                    <RoomDetailIcon type="calendar" size={16} />
                    <span>
                      <small>วันที่จ่าย</small>
                      <strong>{formatDate(expenseDetail.expense_date)}</strong>
                    </span>
                  </span>
                </div>
                <div className="exp-ui-summary">
                  <span className="exp-ui-summary-icon">
                    <RoomDetailIcon type="wallet" size={30} />
                  </span>
                  <div className="exp-ui-summary-amount">
                    <small>จำนวนเงิน</small>
                    <strong>฿{formatCurrency(expenseDetail.amount)}</strong>
                  </div>
                  <div className="exp-ui-summary-vendor">
                    <small>ผู้รับเงิน / ร้านค้า</small>
                    <span>{expenseDetail.vendor || '-'}</span>
                    {expenseDetail.receipt_number && (
                      <em>
                        <RoomDetailIcon type="receipt" size={13} />
                        ใบเสร็จ {expenseDetail.receipt_number}
                      </em>
                    )}
                  </div>
                </div>
              </div>
              <div className="exp-ui-scroll">
                <div className="exp-ui-detail-layout">
                  <section className="exp-ui-section">
                    <h4 className="exp-ui-section-title">ข้อมูลรายจ่าย</h4>
                    <dl className="exp-ui-facts is-columns">
                      {[
                        { key: 'date', icon: 'calendar', label: 'วันที่จ่าย', value: formatDate(expenseDetail.expense_date) },
                        { key: 'payment', icon: 'wallet', label: 'ชำระโดย', value: EXPENSE_PAYMENT_METHOD_LABEL[expenseDetail.payment_method] || 'ไม่ระบุ' },
                        { key: 'room', icon: 'door', label: 'ห้องที่เกี่ยวข้อง', value: expenseDetail.room_number ? `ห้อง ${expenseDetail.room_number}` : 'ไม่เกี่ยวกับห้องใด' },
                        { key: 'by', icon: 'user', label: 'บันทึกโดย', value: expenseDetail.recorded_by_name || '-' },
                        { key: 'created', icon: 'clock', label: 'บันทึกเมื่อ', value: formatDateTime(expenseDetail.created_at) },
                      ].map((fact) => (
                        <div key={fact.key}>
                          <dt>
                            <RoomDetailIcon type={fact.icon} size={15} />
                            {fact.label}
                          </dt>
                          <dd>{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="exp-ui-note">
                      <span>รายละเอียด</span>
                      <p>{expenseDetail.description || '-'}</p>
                    </div>
                  </section>
                  <section className="exp-ui-section">
                    <h4 className="exp-ui-section-title">
                      รูปใบเสร็จ / หลักฐาน
                      {expenseDetail.photos?.length > 0 && (
                        <small className="exp-ui-counter">
                          {expenseDetail.photos.length > 4 ? `${expenseDetail.photos.length} รูป` : `${Math.min(expenseDetailPhotoIndex, expenseDetail.photos.length - 1) + 1}/${expenseDetail.photos.length}`}
                        </small>
                      )}
                    </h4>
                    {expenseDetail.photos?.length > 4 ? (
                      <div className="exp-ui-gallery-grid">
                        {expenseDetail.photos.slice(0, 4).map((photo, index) => (
                          <button
                            key={photo.url}
                            type="button"
                            className="exp-ui-gallery-tile"
                            aria-label={`ดูรูปที่ ${index + 1}`}
                            onClick={() => setExpensePhotoPreview({ index })}
                          >
                            <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
                            {index === 3 && <span className="exp-ui-gallery-more">+{expenseDetail.photos.length - 4}</span>}
                          </button>
                        ))}
                      </div>
                    ) : expenseDetail.photos?.length > 0 ? (
                      (() => {
                        const activeIndex = Math.min(expenseDetailPhotoIndex, expenseDetail.photos.length - 1)
                        const activePhoto = expenseDetail.photos[activeIndex]
                        return (
                          <>
                            <button
                              type="button"
                              className="exp-ui-gallery-main"
                              title="คลิกเพื่อดูรูปขนาดเต็ม"
                              onClick={() => setExpensePhotoPreview({ index: activeIndex })}
                            >
                              <UploadImage src={activePhoto.url} alt={activePhoto.name || `รูปที่ ${activeIndex + 1}`} />
                              <span className="exp-ui-gallery-zoom">ดูรูปขนาดเต็ม</span>
                            </button>
                            {expenseDetail.photos.length > 1 && (
                              <div className="exp-ui-gallery-thumbs">
                                {expenseDetail.photos.map((photo, index) => (
                                  <button
                                    key={photo.url}
                                    type="button"
                                    className={`exp-ui-gallery-thumb${index === activeIndex ? ' is-active' : ''}`}
                                    aria-label={`ดูรูปที่ ${index + 1}`}
                                    onClick={() => setExpenseDetailPhotoIndex(index)}
                                  >
                                    <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )
                      })()
                    ) : (
                      <div className="exp-ui-gallery-empty">
                        <RoomDetailIcon type="receipt" size={28} />
                        <span>ยังไม่มีรูปใบเสร็จหรือหลักฐาน</span>
                        <button
                          type="button"
                          className="exp-ui-link"
                          onClick={() => {
                            const target = expenseDetail
                            requestClose()
                            openEditExpense(target)
                          }}
                        >
                          แนบรูปเพิ่ม
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              </div>
              <div className="exp-ui-footer-bar">
                <div className="exp-ui-modal-actions">
                  <button
                    type="button"
                    className="admin-action-btn is-primary"
                    onClick={() => {
                      const target = expenseDetail
                      requestClose()
                      openEditExpense(target)
                    }}
                  >
                    แก้ไข
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {expenseDetail && expensePhotoPreview && (
        <PhotoLightbox
          photos={(expenseDetail.photos || []).map((photo, index) => ({
            name: photo.name || `รูปที่ ${index + 1}`,
            url: photo.url,
          }))}
          initialIndex={expensePhotoPreview.index}
          title={`รายจ่าย ${expenseDetail.category}`}
          subtitle={`฿${formatCurrency(expenseDetail.amount)} · ${formatDate(expenseDetail.expense_date)}`}
          label="รูปรายจ่าย"
          onClose={() => setExpensePhotoPreview(null)}
        />
      )}

      {roomDetail && (
        <Modal
          title="รายละเอียดห้องพัก"
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
        <Modal
          title={
            roomModal.mode === 'create'
              ? 'เพิ่มห้องพัก'
              : roomModal.mode === 'amenities'
                ? `อุปกรณ์และทรัพย์สินในห้อง ${roomModal.room.room_number}`
                : `แก้ไขห้อง ${roomModal.room.room_number}`
          }
          onClose={() => setRoomModal(null)}
        >
          {(requestClose) => (
          <form className="admin-room-form" onSubmit={(event) => submitRoomForm(event, requestClose)} noValidate>
            {roomFormError && <div className="alert alert-danger py-2 px-3">{roomFormError}</div>}

            {roomModal.mode !== 'amenities' && (
            <>
            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><RoomDetailIcon type="home" size={16} /></span>
                <div>
                  <strong>ข้อมูลห้องพัก</strong>
                  <small>
                    {roomModal.mode === 'edit' && roomModal.room?.is_booked
                      ? 'ห้องนี้มีผู้เช่าอยู่ เปลี่ยนเลขห้องไม่ได้'
                      : roomModal.mode === 'edit'
                        ? 'ห้องว่าง เปลี่ยนเลขห้องได้ (3 หลัก)'
                        : 'เลขห้อง 3 หลัก เช่น 101'}
                  </small>
                </div>
              </header>
              <div className="admin-room-form-grid is-2">
                <label className="admin-room-field">
                  <span>เลขห้อง</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{3}"
                    name="room_number"
                    className="form-control"
                    value={roomForm.room_number}
                    onChange={handleRoomFormChange}
                    disabled={roomModal.mode === 'edit' && Boolean(roomModal.room?.is_booked)}
                    maxLength={3}
                    placeholder="เช่น 101"
                    required
                  />
                </label>
                <label className="admin-room-field">
                  <span>ขนาดห้อง <small className="admin-room-optional">ไม่บังคับ</small></span>
                  <div className="admin-room-input">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="9999.99"
                      name="room_size"
                      className="form-control"
                      value={roomForm.room_size}
                      onChange={handleRoomFormChange}
                      placeholder="เช่น 24"
                    />
                    <em>ตร.ม.</em>
                  </div>
                </label>
              </div>
            </section>

            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><RoomDetailIcon type="wallet" size={16} /></span>
                <div>
                  <strong>ค่าใช้จ่าย</strong>
                  <small>ราคาค่าเช่าและอัตราค่าน้ำ-ค่าไฟของห้องนี้</small>
                </div>
              </header>
              <div className="admin-room-form-grid is-4">
                <label className="admin-room-field">
                  <span>ค่าเช่า</span>
                  <div className="admin-room-input has-prefix">
                    <b>฿</b>
                    <input type="number" name="price" className="form-control" value={roomForm.price} onChange={handleRoomFormChange} required />
                    <em>/เดือน</em>
                  </div>
                </label>
                <label className="admin-room-field">
                  <span>ค่าไฟ</span>
                  <div className="admin-room-input has-prefix">
                    <b>฿</b>
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
                    <em>/หน่วย</em>
                  </div>
                </label>
                <label className="admin-room-field">
                  <span>ค่าน้ำต่อหน่วย</span>
                  <div className="admin-room-input has-prefix">
                    <b>฿</b>
                    <input type="number" step="0.01" min="0" max="999.99" name="water_unit_price" className="form-control" value={roomForm.water_unit_price} onChange={handleRoomFormChange} />
                    <em>/หน่วย</em>
                  </div>
                </label>
                <label className="admin-room-field">
                  <span>ค่าน้ำ</span>
                  <div className="admin-room-input has-prefix">
                    <b>฿</b>
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
                    <em>/เดือน</em>
                  </div>
                </label>
              </div>
            </section>
            </>
            )}

            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><RoomDetailIcon type="sparkle" size={16} /></span>
                <div>
                  <strong>อุปกรณ์และทรัพย์สินในห้อง</strong>
                  <small>จัดการรายการและราคาสำหรับคำนวณค่าเสียหายตอนย้ายออก</small>
                </div>
              </header>
              {roomTypes.length > 0 && (
                <label className="admin-room-field room-assets-type">
                  <span>
                    ดึงทรัพย์สินจากประเภทห้อง <small className="admin-room-optional">ไม่บังคับ</small>
                  </span>
                  <select className="form-select" value={roomForm.room_type_id ?? ''} onChange={(event) => applyRoomType(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">ไม่ระบุประเภท</option>
                    {roomTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name} ({type.assets.length} รายการ)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="admin-equipment-list-heading">
                <strong>รายการในห้อง <span>{equipmentItems.length} รายการ</span></strong>
                <button type="button" className="admin-action-btn is-primary" onClick={openAddRoomAsset}>+ เพิ่มทรัพย์สิน</button>
              </div>
              {equipmentItems.length > 0 ? (
                <ul className="admin-equipment-list">
                  {equipmentItems.map((item) => (
                    <li className="admin-equipment-item" key={item.asset?.rowId ?? item.name}>
                      <span className="admin-equipment-icon" aria-hidden="true"><CustomAmenityIcon name={item.icon} size={20} /></span>
                      <div className="admin-equipment-info">
                        <strong>{item.name}</strong>
                        <span className={item.asset ? 'admin-equipment-price' : 'admin-equipment-unpriced'}>
                          {item.asset ? '฿' + assetPriceValue(item.asset.price).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'ยังไม่ระบุราคา'}
                        </span>
                      </div>
                      <button type="button" className="admin-equipment-remove" onClick={() => removeRoomAsset(item.name)} aria-label={'ลบ ' + item.name} title={'ลบ ' + item.name}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="admin-equipment-empty">
                  <RoomDetailIcon type="box" size={28} />
                  <strong>ยังไม่มีอุปกรณ์หรือทรัพย์สิน</strong>
                  <span>กด “เพิ่มทรัพย์สิน” เพื่อเริ่มเพิ่มรายการในห้องนี้</span>
                </div>
              )}
              <div className="admin-equipment-summary">
                <div><strong>มูลค่าทรัพย์สินรวม</strong><small>ระบุราคาแล้ว {roomForm.assetRows.length} รายการ</small></div>
                <strong>฿{roomForm.assetRows.reduce((sum, row) => sum + assetPriceValue(row.price), 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </section>

            <div className="admin-room-form-actions">
              <button type="button" className="admin-action-btn is-ghost" onClick={requestClose} disabled={roomSubmitting}>
                ยกเลิก
              </button>
              <button type="submit" className="admin-action-btn is-primary" disabled={roomSubmitting}>
                {roomSubmitting
                  ? 'กำลังบันทึก...'
                  : roomModal.mode === 'create' ? 'เพิ่มห้องพัก' : roomModal.mode === 'amenities' ? 'บันทึกอุปกรณ์และทรัพย์สิน' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {roomModal && addingAmenity && (
        <Modal title="เพิ่มทรัพย์สินในห้อง" variant="amenity" onClose={() => { setAddingAmenity(false); setAmenityDraft(''); setAmenityIcon('sparkle'); setAmenityPrice(''); setAmenityModalError('') }}>
          {(requestClose) => {
            const usedCount = roomForm.custom_amenities.length
            const remaining = Math.max(0, 12 - usedCount)
            const draftName = amenityDraft.trim()
            const availableSuggestions = availableAssetSuggestions(roomForm)
            return (
              <form className="admin-amenity-modal-form" onSubmit={(event) => { event.preventDefault(); addRoomAmenity(requestClose) }}>
                <div className="admin-amenity-modal-content">
                  <div className={`admin-amenity-preview${draftName ? '' : ' is-empty'}`} aria-live="polite">
                    <span className="admin-amenity-preview-icon"><CustomAmenityIcon name={amenityIcon} size={26} /></span>
                    <div className="admin-amenity-preview-text">
                      <small>ตัวอย่างที่จะแสดงในห้อง</small>
                      <strong>{draftName || 'ชื่อทรัพย์สิน'}</strong>
                      {isValidAssetPrice(amenityPrice) && <small>ราคา ฿{assetPriceValue(amenityPrice).toLocaleString('th-TH')}</small>}
                    </div>
                    <span className={`admin-amenity-quota${remaining <= 2 ? ' is-low' : ''}`}>
                      <b>{usedCount}</b>/12
                      <small>รายการ</small>
                    </span>
                  </div>

                  <section className="admin-amenity-section">
                    <header>
                      <span className="admin-amenity-step">1</span>
                      <label htmlFor="admin-new-amenity">ชื่อทรัพย์สิน <span className="text-danger">*</span></label>
                      <small className={`admin-amenity-counter${amenityDraft.length >= 55 ? ' is-near' : ''}`}>{amenityDraft.length}/60</small>
                    </header>
                    <div className={`admin-amenity-name-input${amenityModalError ? ' is-invalid' : ''}`}>
                      <i><CustomAmenityIcon name={amenityIcon} size={18} /></i>
                      <input
                        id="admin-new-amenity"
                        type="text"
                        maxLength={60}
                        value={amenityDraft}
                        onChange={(event) => {
                          const value = event.target.value
                          const match = ROOM_AMENITY_SUGGESTIONS.find((suggestion) => suggestion.name === value.trim())
                          setAmenityDraft(value)
                          setAmenityIcon(match ? match.icon : 'sparkle')
                          setAmenityModalError('')
                        }}
                        placeholder="เช่น โต๊ะทำงาน, ไมโครเวฟ"
                        autoFocus
                        autoComplete="off"
                      />
                      {amenityDraft && (
                        <button type="button" onClick={() => { setAmenityDraft(''); setAmenityIcon('sparkle'); setAmenityModalError('') }} aria-label="ล้างชื่อ">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {amenityModalError && (
                      <p className="admin-amenity-modal-error" role="alert">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                        {amenityModalError}
                      </p>
                    )}
                  </section>

                  <section className="admin-amenity-section">
                    <header>
                      <span className="admin-amenity-step">2</span>
                      <label htmlFor="admin-new-amenity-price">ราคาทรัพย์สิน (บาท) <span className="text-danger">*</span></label>
                      <small>ใช้คิดค่าเสียหายเมื่อชำรุดหรือสูญหาย</small>
                    </header>
                    <div className="admin-amenity-name-input">
                      <i>฿</i>
                      <input
                        id="admin-new-amenity-price"
                        type="text"
                        inputMode="decimal"
                        value={amenityPrice}
                        onChange={(event) => {
                          setAmenityPrice(event.target.value)
                          setAmenityModalError('')
                        }}
                        placeholder="เช่น 3500"
                        autoComplete="off"
                      />
                    </div>
                  </section>

                  <section className="admin-amenity-section">
                    <header>
                      <span className="admin-amenity-step">3</span>
                      <span className="admin-amenity-section-title">รายการแนะนำ</span>
                      <small>กดเพื่อใช้ชื่อและไอคอนนี้</small>
                    </header>
                    {availableSuggestions.length > 0 ? (
                      <div className="admin-amenity-suggest-grid">
                        {availableSuggestions.map((suggestion) => {
                          const selected = draftName === suggestion.name
                          return (
                            <button
                              type="button"
                              key={suggestion.name}
                              className={selected ? 'is-selected' : ''}
                              onClick={() => { setAmenityDraft(suggestion.name); setAmenityIcon(suggestion.icon); setAmenityModalError('') }}
                              aria-pressed={selected}
                            >
                              <span><CustomAmenityIcon name={suggestion.icon} size={17} /></span>
                              {suggestion.name}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="admin-amenity-empty">เพิ่มรายการแนะนำครบทุกอย่างแล้ว พิมพ์ชื่อเองได้ที่ช่องด้านบน</p>
                    )}
                  </section>
                </div>
                <div className="admin-amenity-modal-actions">
                  <span className="admin-amenity-remaining">
                    {remaining > 0 ? `แสดงในหน้าห้องได้อีก ${remaining} รายการ` : 'ครบ 12 รายการที่แสดงแล้ว (ยังบันทึกเป็นทรัพย์สินได้)'}
                  </span>
                  <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>ยกเลิก</button>
                  <button type="submit" className="admin-action-btn is-primary">เพิ่มทรัพย์สิน</button>
                </div>
              </form>
            )
          }}
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
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>ปิด</button>
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
          {(requestClose) => (
          <form className="admin-room-form" onSubmit={requestParcelSave}>
            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><DoorIcon /></span>
                <div>
                  <strong>ผู้รับพัสดุ <span className="text-danger">*</span></strong>
                  <small>เลือกห้องที่มีผู้เช่าอยู่ ระบบจะแจ้งเตือนผู้เช่าห้องนั้น</small>
                </div>
              </header>
              <label className="admin-room-field" htmlFor="parcel-ui-room">
                <span>ห้อง / ผู้เช่า</span>
                <div className="admin-room-input has-icon">
                  <i><DoorIcon /></i>
                  <select
                    id="parcel-ui-room"
                    className="form-select form-control"
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
              </label>
            </section>

            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><PackageIcon /></span>
                <div>
                  <strong>ข้อมูลพัสดุ</strong>
                  <small>ไม่บังคับ แต่ช่วยให้ผู้เช่าระบุพัสดุได้ง่ายขึ้น</small>
                </div>
              </header>
              <div className="admin-room-form-grid is-2">
                <label className="admin-room-field" htmlFor="parcel-ui-sender">
                  <span>บริษัทขนส่ง / ผู้ส่ง</span>
                  <div className="admin-room-input has-icon">
                    <i><TruckIcon /></i>
                    <input
                      id="parcel-ui-sender"
                      className="form-control"
                      type="text"
                      maxLength={100}
                      placeholder="เช่น ไปรษณีย์ไทย, Kerry"
                      value={parcelForm.sender_name}
                      onChange={(event) => setParcelForm((form) => ({ ...form, sender_name: event.target.value }))}
                    />
                  </div>
                </label>
                <label className="admin-room-field" htmlFor="parcel-ui-tracking">
                  <span>เลขพัสดุ</span>
                  <div className="admin-room-input has-icon">
                    <i><HashIcon /></i>
                    <input
                      id="parcel-ui-tracking"
                      className="form-control"
                      type="text"
                      maxLength={100}
                      placeholder="เช่น TH1234567890"
                      value={parcelForm.tracking_number}
                      onChange={(event) => setParcelForm((form) => ({ ...form, tracking_number: event.target.value }))}
                    />
                  </div>
                </label>
              </div>
              <label className="admin-room-field" htmlFor="parcel-ui-description">
                <span>รายละเอียด</span>
                <div className="admin-room-input has-icon">
                  <i><NoteIcon /></i>
                  <input
                    id="parcel-ui-description"
                    className="form-control"
                    type="text"
                    maxLength={255}
                    placeholder="เช่น กล่องขนาดใหญ่"
                    value={parcelForm.description}
                    onChange={(event) => setParcelForm((form) => ({ ...form, description: event.target.value }))}
                  />
                </div>
              </label>
            </section>

            <section className="admin-room-form-section">
              <div className="parcel-photo-section">
                <ParcelPhotoPicker
                  id="parcel-ui-photos"
                  required
                  files={parcelPhotos}
                  onChange={setParcelPhotos}
                  error={parcelPhotoError}
                  onError={setParcelPhotoError}
                />
              </div>
            </section>

            {parcelFormError && <div className="parcel-form-error" role="alert">{parcelFormError}</div>}
            <div className="admin-room-form-actions">
              <button type="button" className="admin-action-btn is-ghost" onClick={requestClose} disabled={parcelSubmitting}>
                ยกเลิก
              </button>
              <button
                type="submit"
                className="admin-action-btn is-primary"
                disabled={parcelSubmitting || parcelPhotos.length === 0}
                title={parcelPhotos.length === 0 ? 'แนบรูปพัสดุก่อนบันทึก' : undefined}
              >
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
                  <button type="button" className="admin-action-btn is-ghost" onClick={requestClose} disabled={parcelSubmitting}>ปิด</button>
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
          <form className="admin-room-form" onSubmit={(event) => submitStaffForm(event, requestClose)} noValidate>
            {staffFormError && <div className="alert alert-danger py-2 px-3">{staffFormError}</div>}
            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><WaitingDetailIcon type="lock" size={16} /></span>
                <div>
                  <strong>บัญชีเข้าสู่ระบบ</strong>
                  <small>{staffModal.mode === 'create' ? 'พนักงานใช้เลขบัตรประชาชนและรหัสผ่านนี้เข้าสู่ระบบ' : 'เลขบัตรแก้ไขไม่ได้ · เว้นรหัสผ่านว่างถ้าไม่ต้องการเปลี่ยน'}</small>
                </div>
              </header>
              <div className="admin-room-form-grid is-2">
                <label className="admin-room-field is-wide">
                  <span>เลขบัตรประชาชน</span>
                  <div className="admin-room-input has-icon">
                    <i><WaitingDetailIcon type="idcard" size={16} /></i>
                    <input
                      type="text"
                      inputMode="numeric"
                      name="idcard"
                      className="form-control"
                      value={staffForm.idcard}
                      onChange={handleStaffFormChange}
                      disabled={staffModal.mode === 'edit'}
                      maxLength={13}
                      placeholder="13 หลัก"
                      required
                    />
                  </div>
                </label>
                <label className="admin-room-field">
                  <span>{staffModal.mode === 'create' ? 'รหัสผ่าน' : 'รหัสผ่านใหม่'}</span>
                  <div className="admin-room-input has-icon">
                    <i><WaitingDetailIcon type="lock" size={16} /></i>
                    <input
                      type="password"
                      name="password"
                      className="form-control"
                      autoComplete="new-password"
                      value={staffForm.password}
                      onChange={handleStaffFormChange}
                      placeholder={staffModal.mode === 'create' ? 'อย่างน้อย 6 ตัวอักษร' : 'เว้นว่างถ้าไม่เปลี่ยน'}
                      required={staffModal.mode === 'create'}
                    />
                  </div>
                </label>
                <label className="admin-room-field">
                  <span>{staffModal.mode === 'create' ? 'ยืนยันรหัสผ่าน' : 'ยืนยันรหัสผ่านใหม่'}</span>
                  <div className="admin-room-input has-icon">
                    <i><WaitingDetailIcon type="lock" size={16} /></i>
                    <input
                      type="password"
                      name="confirm_password"
                      className="form-control"
                      autoComplete="new-password"
                      value={staffForm.confirm_password}
                      onChange={handleStaffFormChange}
                      placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                      required={staffModal.mode === 'create'}
                    />
                  </div>
                </label>
              </div>
            </section>
            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><RoomDetailIcon type="user" size={16} /></span>
                <div>
                  <strong>ข้อมูลส่วนตัว</strong>
                  <small>ชื่อและช่องทางติดต่อของพนักงาน</small>
                </div>
              </header>
              <div className="admin-room-form-grid is-2">
                <label className="admin-room-field">
                  <span>ชื่อ</span>
                  <input type="text" name="first_name" className="form-control" value={staffForm.first_name} onChange={handleStaffFormChange} required />
                </label>
                <label className="admin-room-field">
                  <span>นามสกุล</span>
                  <input type="text" name="last_name" className="form-control" value={staffForm.last_name} onChange={handleStaffFormChange} required />
                </label>
                <label className="admin-room-field">
                  <span>เบอร์โทรศัพท์</span>
                  <div className="admin-room-input has-icon">
                    <i><RoomDetailIcon type="phone" size={14} /></i>
                    <input type="text" inputMode="tel" name="phone" className="form-control" value={staffForm.phone} onChange={handleStaffFormChange} required />
                  </div>
                </label>
                <label className="admin-room-field">
                  <span>อายุ</span>
                  <div className="admin-room-input">
                    <input type="number" name="age" className="form-control" value={staffForm.age} onChange={handleStaffFormChange} required />
                    <em>ปี</em>
                  </div>
                </label>
              </div>
            </section>
            <div className="admin-room-form-actions">
              <button type="button" className="admin-action-btn is-ghost" onClick={requestClose} disabled={staffSubmitting}>
                ยกเลิก
              </button>
              <button type="submit" className="admin-action-btn is-primary" disabled={staffSubmitting}>
                {staffSubmitting ? 'กำลังบันทึก...' : staffModal.mode === 'create' ? 'เพิ่มพนักงาน' : 'บันทึกการแก้ไข'}
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
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>ปิด</button>
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
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>ปิด</button>
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

      {customerProfile && (() => {
        const profileCustomer = customers.find((item) => item.id === customerProfile.id) || customerProfile.customer
        return (
          <Modal title="รายละเอียดลูกค้า" onClose={() => setCustomerProfile(null)} variant="customer-profile">
            <CustomerProfile
              customer={{ ...customerProfile.detail?.customer, ...profileCustomer }}
              contract={customerProfile.detail?.contract ?? profileCustomer.contract ?? null}
              rentalHistory={customerProfile.detail?.rentalHistory}
              loading={customerProfile.loading}
              error={customerProfile.error}
              idcardRevealed={revealedCustomerIdCards.has(customerProfile.id)}
              onToggleIdCard={() => toggleCustomerIdCardReveal(customerProfile.id)}
              onRetry={() => openCustomerProfile(profileCustomer)}
              onOpenHistory={openCustomerProfileHistory}
              onEdit={() => openEditCustomer(profileCustomer)}
              onToggleSuspend={() => setCustomerSuspendConfirm(profileCustomer)}
              onDepositSettled={(updated) => {
                const merge = (current) => (current?.booking_id === updated.booking_id ? { ...current, ...updated } : current)
                setCustomerProfile((prev) => (prev?.detail ? { ...prev, detail: { ...prev.detail, contract: merge(prev.detail.contract) } } : prev))
                setCustomers((list) => list.map((item) => (item.id === customerProfile.id ? { ...item, contract: merge(item.contract) } : item)))
              }}
            />
          </Modal>
        )
      })()}

      {customerModal && (
        <Modal title={`แก้ไขข้อมูลลูกค้า - ${customerModal.first_name} ${customerModal.last_name}`} onClose={() => setCustomerModal(null)}>
          {(requestClose) => (
          <form className="admin-room-form" onSubmit={(event) => submitCustomerForm(event, requestClose)} noValidate>
            {customerFormError && <div className="alert alert-danger py-2 px-3">{customerFormError}</div>}
            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><RoomDetailIcon type="user" size={16} /></span>
                <div>
                  <strong>ข้อมูลส่วนตัว</strong>
                  <small>ชื่อและช่องทางติดต่อของผู้เช่า</small>
                </div>
              </header>
              <div className="admin-room-form-grid is-2">
                <label className="admin-room-field">
                  <span>ชื่อ</span>
                  <input type="text" name="first_name" className="form-control" value={customerForm.first_name} onChange={handleCustomerFormChange} required />
                </label>
                <label className="admin-room-field">
                  <span>นามสกุล</span>
                  <input type="text" name="last_name" className="form-control" value={customerForm.last_name} onChange={handleCustomerFormChange} required />
                </label>
                <label className="admin-room-field">
                  <span>เบอร์โทรศัพท์</span>
                  <div className="admin-room-input has-icon">
                    <i><RoomDetailIcon type="phone" size={14} /></i>
                    <input type="text" inputMode="tel" name="phone" className="form-control" value={customerForm.phone} onChange={handleCustomerFormChange} required />
                  </div>
                </label>
                <label className="admin-room-field">
                  <span>อายุ</span>
                  <div className="admin-room-input">
                    <input type="number" name="age" className="form-control" value={customerForm.age} onChange={handleCustomerFormChange} required />
                    <em>ปี</em>
                  </div>
                </label>
              </div>
            </section>
            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><RoomDetailIcon type="wallet" size={16} /></span>
                <div>
                  <strong>เงินมัดจำ</strong>
                  <small>กำหนดตามสัญญาเช่า แก้ไขไม่ได้</small>
                </div>
              </header>
              <div className="admin-deposit-readonly">
                <span>จำนวนเงินมัดจำตามสัญญา</span>
                <strong>
                  {customerForm.deposit_amount !== '' && customerForm.deposit_amount != null
                    ? `฿${formatCurrency(customerForm.deposit_amount)}`
                    : 'ไม่มีมัดจำ'}
                </strong>
                <small>เปลี่ยนได้เฉพาะตอนทำสัญญาใหม่ ส่วนการหัก คืน หรือริบมัดจำ ระบบคำนวณตามสัญญาให้</small>
              </div>
            </section>
            <section className="admin-room-form-section">
              <header>
                <span className="admin-room-form-icon"><WaitingDetailIcon type="lock" size={16} /></span>
                <div>
                  <strong>เปลี่ยนรหัสผ่าน</strong>
                  <small>เว้นว่างทั้งสองช่องถ้าไม่ต้องการเปลี่ยน · อย่างน้อย 6 ตัวอักษร</small>
                </div>
              </header>
              <div className="admin-room-form-grid is-2">
                <label className="admin-room-field">
                  <span>รหัสผ่านใหม่</span>
                  <div className="admin-room-input has-icon">
                    <i><WaitingDetailIcon type="lock" size={16} /></i>
                    <input
                      type="password"
                      name="password"
                      className="form-control"
                      autoComplete="new-password"
                      maxLength={128}
                      placeholder="เว้นว่างถ้าไม่เปลี่ยน"
                      value={customerForm.password || ''}
                      onChange={handleCustomerFormChange}
                    />
                  </div>
                </label>
                <label className="admin-room-field">
                  <span>ยืนยันรหัสผ่านใหม่</span>
                  <div className="admin-room-input has-icon">
                    <i><WaitingDetailIcon type="lock" size={16} /></i>
                    <input
                      type="password"
                      name="confirm_password"
                      className="form-control"
                      autoComplete="new-password"
                      maxLength={128}
                      placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
                      value={customerForm.confirm_password || ''}
                      onChange={handleCustomerFormChange}
                    />
                  </div>
                </label>
              </div>
            </section>
            <div className="admin-room-form-actions">
              <button type="button" className="admin-action-btn is-ghost" onClick={requestClose} disabled={customerSubmitting}>
                ยกเลิก
              </button>
              <button type="submit" className="admin-action-btn is-primary" disabled={customerSubmitting}>
                {customerSubmitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
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
                {!customerSuspendConfirm.is_suspended && customerSuspendConfirm.room_number && (
                  <><br />ลูกค้าจะถูกนำออกจากห้อง {customerSuspendConfirm.room_number} หากไม่มีผู้เช่าคนอื่น ห้องจะถูกปล่อยเป็นห้องว่าง และการเปิดใช้งานบัญชีอีกครั้งจะไม่คืนห้องให้อัตโนมัติ</>
                )}
                {Boolean(customerSuspendConfirm.is_suspended) && (
                  <><br />บัญชีจะกลับมาใช้งานได้โดยไม่มีห้องพัก ห้องเดิมจะยังว่างอยู่หากไม่มีผู้เช่าคนอื่น</>
                )}
              </p>
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose}>ปิด</button>
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
