import { UploadImage } from '../components/UploadMedia.jsx'
import { downloadUploadFile } from '../utils/uploadFiles.js'
import { Fragment, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { DormInfoMenu } from '../components/DormInfo'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/StaffPage.css'
import './css/ParcelManagement.css'
import './css/WaitingDetail.css'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'
import ParcelPhotoPicker from '../components/ParcelPhotoPicker.jsx'
import { CheckIcon, DoorIcon, HashIcon, NoteIcon, PackageIcon, PersonIcon, PlusIcon, TruckIcon } from '../components/ParcelIcons.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import CameraMonitor from '../components/CameraMonitor.jsx'
import { cameraSummaryTiles } from '../utils/cameras.js'
import { AppHeaderDate, AppHeaderMeta, LogoutIcon } from '../components/AppHeader.jsx'
import { countNewExpenses, maxExpenseId, readExpenseSeen, writeExpenseSeen } from '../utils/expenseSeen.js'
import ProcessSteps from '../components/ProcessSteps.jsx'
import {
  InspectionDateCell,
  InspectionInspectorCell,
  InspectionPersonCell,
  InspectionPhotosCell,
  InspectionRoomCell,
} from '../components/InspectionCells.jsx'
import InspectionDetail from '../components/InspectionDetail.jsx'
import MoveInInspectionPanel from '../components/MoveInInspection.jsx'
import MoveOutAssetCheck from '../components/MoveOutAssetCheck.jsx'
import FurnitureAssetsRow from '../components/FurnitureAssetsRow.jsx'
import InspectionCostInput from '../components/InspectionCostInput.jsx'
import InspectionTopicFilter from '../components/InspectionTopicFilter.jsx'
import MoveInBaselineCard, { MoveInCompareTag } from '../components/MoveInBaseline.jsx'
import MoveInComparison from '../components/MoveInComparison.jsx'
import { useMoveInBaseline } from '../utils/moveInBaseline.js'
import {
  assetPriceValue,
  chargeableAssetCost,
  COSTED_RESULTS,
  isValidAssetPrice,
  itemCostTotal,
  withFurnitureResult,
} from '../utils/inspectionChecklist.js'
import RoomTransferFinance from '../components/RoomTransferFinance.jsx'
import MoveRoomDamageFinance from '../components/MoveRoomDamageFinance.jsx'
import { damageInputError, damageInputValue } from '../utils/damageCost.js'
import InspectionPhotoPicker from '../components/InspectionPhotoPicker.jsx'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'
import RoleTabMenu from '../components/RoleTabMenu.jsx'
import WifiManager from '../components/WifiManager.jsx'
import MarketManager from '../components/MarketManager.jsx'
import RepairVendorManager from '../components/RepairVendorManager.jsx'
import { marketSummaryTiles } from '../utils/marketSummary.js'
import { repairSummaryTiles } from '../utils/repairSummary.js'
import { MAINTENANCE_CATEGORY_LABEL, MAINTENANCE_TIME_LABEL } from '../utils/maintenanceCategories.js'
import {
  ParkingChoiceGroup,
  ParkingFinePayment,
  ParkingRulesNote,
  ParkingSessionPanel,
  ParkingSettingsButton,
  ParkingSettingsForm,
  ParkingSpacePicker,
  ParkingStatusPill,
  ResidentContractWindow,
  VisitorTimeSummary,
} from '../components/ParkingFields.jsx'
import { PARKING_FORM_TOPICS, USER_CATEGORY_LABEL, VEHICLE_TYPE_LABEL, formatBaht, getVisitorSession, useParkingOptions } from '../utils/parking.js'
import {
  ContractGallery,
  ContractImagePicker,
  ContractStatusBadge,
  ContractTransferHistory,
  StaffCompletedContracts,
} from '../components/RentalContract.jsx'
import { addContractMonths, completedContractSummaryTiles, CONTRACT_MAX_IMAGES, readViewedContractIds, ROOM_TRANSFER_MIN_CONTRACT_IMAGES } from '../utils/rentalContract.js'
import { validateImageFile } from '../utils/compressImageFile.js'
import { PARCEL_STATUS_OPTIONS, PREVIOUS_TENANT_LABEL, parcelStatusInfo } from '../utils/parcelStatus.js'
import LoadingScreen from '../components/LoadingScreen.jsx'
import useMinimumLoading from '../utils/useMinimumLoading.js'
import { isUnread, takeNotificationDeepLink, useNotificationReads, sortNewestFirst, useServerNotifications } from '../utils/serverNotifications.js'
import { clearSession, hasSession, logout } from '../utils/session.js'
import { matchesSearch } from '../utils/search.js'

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
    photo: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
    tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5Z" />,
    home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
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

const CHECKLIST_RESULT_OPTIONS = [
  { key: 'good', label: 'ปกติ', title: 'สภาพดี ใช้งานได้' },
  { key: 'wear', label: 'สึกหรอ', title: 'สึกหรอตามการใช้งานปกติ แต่ยังใช้งานได้' },
  { key: 'damaged', label: 'ชำรุด', title: 'เสียหายหรือใช้งานไม่ได้' },
  { key: 'missing', label: 'สูญหาย', title: 'อุปกรณ์หรือทรัพย์สินที่ควรมีสูญหาย' },
  { key: 'not_applicable', label: 'ไม่มี', title: 'ไม่มีหรือติดตั้งรายการนี้ในห้อง' },
]
const INSPECTION_MAX_PHOTOS = 15
const INSPECTION_PAGES = [
  { key: 'move-in', label: 'ตรวจก่อนเข้าอยู่', icon: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4.5V3h6v1.5" /><path d="m9 13 2 2 4-4" /></> },
  { key: 'results', label: 'ผลตรวจห้อง', icon: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 12h5M10 16h5" /></> },
]
const STAFF_INSPECTION_STATUS_LABEL = {
  pending: 'รอ Admin ตรวจ',
  reviewed: 'Admin ตรวจแล้ว',
  follow_up: 'ต้องติดตาม',
}
const INSPECTION_RESULT_ORDER = ['good', 'wear', 'damaged', 'missing', 'not_applicable']
const INSPECTION_KINDS = {
  moveout: {
    label: 'ตรวจห้องย้ายออก',
    title: 'ตรวจห้องตอนย้ายออก',
    note: 'ผลตรวจสภาพห้องก่อนคืนห้อง: checklist รูป และความเสียหาย',
    empty: 'ยังไม่มีผลตรวจห้องย้ายออก',
  },
  move_room: {
    label: 'ตรวจก่อนย้ายห้อง',
    title: 'ตรวจห้องก่อนย้ายห้อง',
    note: 'ผลตรวจห้องเดิมจากคำขอย้ายห้อง ต้องตรวจก่อนอนุมัติให้ย้าย',
    empty: 'ยังไม่มีผลตรวจห้องก่อนย้ายห้อง',
  },
}
const inspectionKindOf = (inspection) => (inspection.tenant_request_type === 'move_room' ? 'move_room' : 'moveout')
const INSPECTION_RESULT_SEGMENTS = [
  { key: 'danger', label: 'พบชำรุด/สูญหาย', className: 'tone-danger' },
  { key: 'warning', label: 'พบสึกหรอ', className: 'tone-warning' },
  { key: 'success', label: 'สภาพปกติ', className: 'tone-success' },
]

function summarizeInspection(checklist) {
  const counts = Object.fromEntries(INSPECTION_RESULT_ORDER.map((key) => [key, 0]))
  for (const result of Object.values(checklist || {})) {
    if (result in counts) counts[result] += 1
  }
  const issues = MOVE_OUT_CHECKLIST.filter((item) => ['damaged', 'missing'].includes(checklist?.[item.key])).map((item) => ({
    ...item,
    result: checklist[item.key],
  }))
  const tone = counts.damaged + counts.missing > 0 ? 'danger' : counts.wear > 0 ? 'warning' : 'success'
  const label = tone === 'danger' ? 'พบชำรุด/สูญหาย' : tone === 'warning' ? 'พบสึกหรอ' : 'สภาพปกติ'
  return { counts, issues, tone, label }
}
function InspectionRoomPicker({ id, rooms, value, onChange, invalid }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef(null)
  const listId = `${id}-list`

  const selected = rooms.find((room) => String(room.room_number) === value)
  const keyword = query.trim().toLowerCase()
  const options = keyword
    ? rooms.filter((room) =>
        matchesSearch([room.room_number, room.tenant.first_name, room.tenant.last_name, room.tenant.phone], keyword, room),
      )
    : rooms

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex, id])

  const openPicker = () => {
    setQuery('')
    setActiveIndex(Math.max(0, rooms.findIndex((room) => String(room.room_number) === value)))
    setOpen(true)
  }

  const choose = (room) => {
    onChange(String(room.room_number))
    setOpen(false)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      event.nativeEvent.stopPropagation()
      setOpen(false)
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) openPicker()
      else setActiveIndex((index) => Math.min(options.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openPicker()
      else setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      if (options[activeIndex]) choose(options[activeIndex])
    }
  }

  return (
    <div className="room-picker" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        id={id}
        className={`room-picker-trigger${invalid ? ' is-invalid' : ''}${open ? ' is-open' : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        {selected ? (
          <>
            <span className="room-picker-avatar" aria-hidden="true">
              <PersonIcon size={17} />
            </span>
            <span className="room-picker-main">
              <strong>
                {selected.tenant.first_name} {selected.tenant.last_name}
              </strong>
              <small>
                ห้อง {selected.room_number}
                {selected.tenant.phone ? ` · โทร ${selected.tenant.phone}` : ''}
              </small>
            </span>
          </>
        ) : (
          <span className="room-picker-placeholder">เลือกห้อง / ผู้เช่า</span>
        )}
        <svg
          className="room-picker-chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="room-picker-panel">
          <div className="room-picker-search">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              autoFocus
              autoComplete="off"
              placeholder="ค้นหาห้อง ชื่อ หรือเบอร์โทร"
              aria-label="ค้นหาห้อง"
              aria-controls={listId}
              aria-activedescendant={options[activeIndex] ? `${id}-opt-${activeIndex}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
            />
          </div>
          <ul id={listId} className="room-picker-list" role="listbox" aria-label="ห้องที่มีผู้เช่า">
            {options.length === 0 ? (
              <li className="room-picker-empty">ไม่พบห้องที่ตรงกับคำค้น</li>
            ) : (
              options.map((room, index) => {
                const isSelected = String(room.room_number) === value
                return (
                  <li
                    key={room.room_number}
                    id={`${id}-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`room-picker-option${index === activeIndex ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(room)}
                  >
                    <span className="room-picker-room">{room.room_number}</span>
                    <span className="room-picker-main">
                      <strong>
                        {room.tenant.first_name} {room.tenant.last_name}
                      </strong>
                      {room.tenant.phone && <small>โทร {room.tenant.phone}</small>}
                    </span>
                    {isSelected && (
                      <svg
                        className="room-picker-check"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

function compressImageFile(file) {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('เลือกได้เฉพาะไฟล์รูปภาพ'))
  if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error('รูปภาพต้องมีขนาดไม่เกิน 5 MB'))

  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const maxDimension = 1400
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(imageUrl)
        reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'))
        return
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(imageUrl)
      resolve({
        name: file.name,
        dataUrl: canvas.toDataURL('image/jpeg', 0.65),
        contentType: 'image/jpeg',
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('อ่านรูปภาพไม่สำเร็จ'))
    }
    image.src = imageUrl
  })
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
  if (kind === 'slip') {
    return (
      <svg {...props}>
        <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
        <path d="M9 7h6M9 11h6M9 15h4" />
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
      { label: 'ประกาศโดย', value: <span className="staff-actor">{item.author || 'เจ้าหน้าที่'}</span> },
      { label: 'ลบอัตโนมัติ', value: item.expires_at ? `${formatDateTime(item.expires_at)} น.` : 'ไม่กำหนด' },
    ],
    kind: 'announcement',
  }
}

const openModalStack = []

export function Modal({ title, onClose, children, variant, stickyFilters = false, bodyRef }) {
  const [isClosing, setIsClosing] = useState(false)

  const requestClose = () => setIsClosing(true)

  useEffect(() => {
    const token = {}
    openModalStack.push(token)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && openModalStack[openModalStack.length - 1] === token) requestClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      openModalStack.splice(openModalStack.indexOf(token), 1)
    }
  }, [])

  useEffect(() => lockBodyScroll(), [])

  return (
    <div
      className={`staff-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`staff-modal${variant === 'confirm' ? ' staff-modal-confirm' : ''}${variant === 'wide' ? ' staff-modal-wide' : ''}${variant === 'payment-history' ? ' staff-modal-payment-history' : ''}${variant === 'history' ? ' staff-modal-history' : ''}${variant === 'form' ? ' staff-modal-form' : ''}${variant === 'utility' ? ' staff-modal-utility' : ''}${variant === 'waiting-form' ? ' staff-modal-form staff-modal-waiting-form' : ''}${variant === 'parking-form' ? ' staff-modal-form staff-modal-parking-form' : ''}${variant === 'inspection' ? ' staff-modal-inspection' : ''}${variant === 'detail' ? ' staff-modal-detail' : ''}${variant === 'waiting-detail' ? ' staff-modal-waiting-detail' : ''}${['transfer', 'transfer-approval', 'transfer-detail', 'parcel-detail'].includes(variant) ? ' staff-modal-transfer' : ''}${variant === 'parcel-detail' ? ' staff-modal-parcel-detail' : ''}${variant === 'transfer-approval' ? ' staff-modal-transfer-approval' : ''}${variant === 'transfer-detail' ? ' staff-modal-transfer-detail' : ''}${variant === 'inspection-detail' ? ' staff-modal-inspection-detail' : ''}${stickyFilters ? ' staff-modal-sticky-filters' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="staff-modal-header">
          <h3>{title}</h3>
          <button type="button" className="staff-modal-close" onClick={requestClose} aria-label="ปิด">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="staff-modal-body" ref={bodyRef}>
          {variant === 'confirm' && <h3 className="staff-modal-alert-title">{title}</h3>}
          {typeof children === 'function' ? children(requestClose) : children}
        </div>
      </div>
    </div>
  )
}

function ContractArrowIcon() {
  return (
    <svg
      className="staff-contract-arrow"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

const TENANT_REQUEST_TYPE_LABEL = {
  renew: 'ต่อสัญญา',
  moveout: 'แจ้งย้ายออก',
  move_room: 'ย้ายห้อง',
}

const TENANT_REQUEST_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'รับเรื่องแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธแล้ว',
  cancelled: 'ยกเลิกแล้ว',
}

const RENEW_DURATION_LABEL = {
  1: '1 เดือน',
  3: '3 เดือน',
  6: '6 เดือน',
  12: '1 ปี (12 เดือน)',
}

const RENEW_PAYMENT_TYPE_LABEL = {
  monthly: 'จ่ายรายเดือน',
  lump_sum: 'จ่ายล่วงหน้าทั้งก้อน',
}

const MAINTENANCE_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
}

const STAFF_TABS = [
  { key: 'home', label: 'หน้าแรก' },
  { key: 'payment-review', label: 'ประวัติสลิป' },
  { key: 'completed-contracts', label: 'สัญญาที่เสร็จสมบูรณ์' },
  { key: 'parcels', label: 'พัสดุ' },
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'market', label: 'ร้านค้าเช่าข้างหอ' },
  { key: 'repair-vendors', label: 'ติดต่อช่าง' },
  { key: 'announcements', label: 'ประกาศจากหอพัก' },
  { key: 'waiting-list', label: 'รายชื่อคนรอห้องว่าง' },
  { key: 'move-out-inspections', label: 'ตรวจสภาพห้อง' },
  { key: 'resident-visits', label: 'คำขอรถ' },
  { key: 'safety', label: 'แจ้งเหตุฉุกเฉิน' },
  { key: 'cameras', label: 'กล้องวงจรปิด' },
]

const STAFF_TAB_GROUPS = [
  { key: 'home', label: 'หน้าแรก', tabs: ['home'] },
  { key: 'finance', label: 'การเงินและสัญญา', tabs: ['payment-review', 'completed-contracts'] },
  { key: 'residents', label: 'ห้องพักและผู้เช่า', tabs: ['move-out-inspections', 'waiting-list', 'wifi'] },
  { key: 'services', label: 'บริการผู้เช่า', tabs: ['parcels', 'resident-visits'] },
  { key: 'repair', label: 'ติดต่อช่าง', tabs: ['repair-vendors'] },
  { key: 'announcements', label: 'ประกาศจากหอพัก', tabs: ['announcements'] },
  { key: 'security', label: 'ความปลอดภัย', tabs: ['safety', 'cameras'] },
  { key: 'market', label: 'ร้านค้าเช่าข้างหอ', tabs: ['market'] },
]
const STAFF_TAB_LABEL = Object.fromEntries(STAFF_TABS.map((tab) => [tab.key, tab.label]))

const WAITING_LIST_STATUS = {
  waiting: { label: 'รอห้องว่าง', tone: 'warning' },
  contacted: { label: 'ติดต่อแล้ว', tone: 'info' },
  reserved: { label: 'จองแล้ว', tone: 'success' },
  closed: { label: 'ปิดรายการ', tone: 'muted' },
}
const WAITING_LIST_SORTS = [
  { value: 'newest', label: 'แจ้งล่าสุดก่อน' },
  { value: 'oldest', label: 'รอนานสุดก่อน' },
]

function dayKeyToDate(key) {
  return key ? new Date(`${key}T00:00:00`) : undefined
}

function inDayRange(value, from, to) {
  if (!from && !to) return true
  const key = localDayKey(value)
  return (!from || key >= from) && (!to || key <= to)
}

const DATE_RANGE_PRESETS = [
  { days: 1, label: 'วันนี้' },
  { days: 7, label: '7 วันล่าสุด' },
  { days: 30, label: '30 วันล่าสุด' },
]

function StaffDateRange({ from, to, onChange, label = 'ช่วงวันที่' }) {
  const today = new Date()
  const todayKey = localDayKey(today)
  return (
    <div className="staff-date-range">
      <span className="staff-date-range-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
          <path d="M16 3v3M8 3v3M3 10h18" />
        </svg>
        {label}
      </span>
      <div className="staff-date-range-inputs">
        <ThaiDatePicker
          className="staff-filter-select staff-req-date-input"
          placeholder="ตั้งแต่วันที่"
          value={from}
          maxDate={dayKeyToDate(to || todayKey)}
          isClearable
          portalId="staff-date-portal"
          onChange={(value) => onChange({ from: value, to })}
        />
        <span className="staff-date-range-sep" aria-hidden="true">
          ถึง
        </span>
        <ThaiDatePicker
          className="staff-filter-select staff-req-date-input"
          placeholder="ถึงวันที่"
          value={to}
          minDate={dayKeyToDate(from)}
          maxDate={dayKeyToDate(todayKey)}
          isClearable
          portalId="staff-date-portal"
          onChange={(value) => onChange({ from, to: value })}
        />
      </div>
      <div className="staff-date-range-presets" role="group" aria-label="ช่วงเวลาด่วน">
        {DATE_RANGE_PRESETS.map((preset) => {
          const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (preset.days - 1))
          const presetFrom = localDayKey(start)
          const isActive = from === presetFrom && to === todayKey
          return (
            <button
              key={preset.days}
              type="button"
              aria-pressed={isActive}
              className={`staff-date-preset${isActive ? ' is-active' : ''}`}
              onClick={() => onChange(isActive ? { from: '', to: '' } : { from: presetFrom, to: todayKey })}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function localDayKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const WAITING_PHONE_PATTERN = /^[0-9+\-\s]{9,20}$/

const TENANT_GRID_COUNT = 9
const ROOMS_PER_PAGE = 12
const STAFF_LIST_PAGE_SIZE = 10
const STAFF_CARD_PAGE_SIZE = 12
const EXPENSES_PAGE_SIZE = 12

const EMPTY_EXPENSE_FORM = {
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

const EXPENSE_CATEGORY_PRESETS = ['ค่าน้ำ', 'ค่าไฟ', 'ซ่อมบำรุง', 'ทำความสะอาด', 'วัสดุอุปกรณ์', 'อินเทอร์เน็ต', 'เงินเดือน', 'อื่นๆ']

const EXPENSE_PAYMENT_METHOD_LABEL = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตร',
  other: 'อื่นๆ',
}

const EXPENSE_MAX_PHOTOS = 6
const MODAL_ITEMS_PER_PAGE = 10
const NOTIF_PAGE_SIZE = 100
const STAFF_SERVER_PENDING_KINDS = [
  'fine_review', 'fine_unpaid', 'deposit', 'transfer_contract', 'transfer_charge', 'move_in',
  'contract_expiry', 'rent_overdue', 'waiting_list', 'parcel_stale',
]
const STAFF_FOCUS_TABS = { slips: 'payment-review', visits: 'resident-visits', safety: 'safety' }
const STAFF_PLAIN_TABS = { contracts: 'completed-contracts', 'waiting-list': 'waiting-list', parcels: 'parcels', inspections: 'move-out-inspections', 'repair-vendors': 'repair-vendors', market: 'market' }
const PAYMENT_HISTORY_INITIAL_PAGE_SIZE = 5

const STAFF_TENANT_NOTIF_INFO = {
  pending: { label: 'คำขอใหม่ รอดำเนินการ', tone: 'pending' },
  in_progress: { label: 'รับเรื่องแล้ว รอดำเนินการขั้นต่อไป', tone: 'info' },
}

const STAFF_MAINTENANCE_NOTIF_INFO = {
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

const DUE_STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอตรวจสอบ',
  due: 'ยังไม่ครบกำหนด',
  overdue: 'ค้างชำระ',
}

const PAYMENT_STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอชำระ',
  overdue: 'ค้างชำระ',
}

const PAYMENT_TYPE_LABEL = {
  rent: 'ค่าเช่าห้อง',
  deposit: 'เงินมัดจำ',
  water: 'ค่าน้ำ',
  electricity: 'ค่าไฟฟ้า',
  room_transfer: 'ยอดชำระย้ายห้อง (ค่าเช่า/มัดจำเพิ่ม)',
}

function dueBadgeClass(status) {
  if (status === 'paid') return 'paid'
  if (status === 'overdue') return 'overdue'
  if (status === 'pending') return 'pending'
  return 'due'
}

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

const formatPlainNumber = formatCurrency

function formatRoomSize(value) {
  return `${formatPlainNumber(value)} ตร.ม.`
}

function splitNote(note) {
  if (!note) return { main: '-', extra: '' }
  const parenIndex = note.indexOf('(')
  if (parenIndex === -1) return { main: note, extra: '' }
  return { main: note.slice(0, parenIndex).trim(), extra: note.slice(parenIndex).trim() }
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

const MS_PER_DAY = 24 * 60 * 60 * 1000
const ROOM_EXPIRY_WARNING_WINDOW_MS = 10 * MS_PER_DAY

function getRoomMsLeft(room) {
  if (!room.is_booked || !room.rental_start_date || !room.rental_end_date) return null
  const msUntilStart = new Date(room.rental_start_date).getTime() - Date.now()
  if (msUntilStart > 0) return null
  return new Date(room.rental_end_date).getTime() - Date.now()
}

function formatDaysLeft(ms) {
  const days = Math.max(0, Math.ceil(Math.abs(ms) / MS_PER_DAY))
  return days > 0 ? `${days} วัน` : 'น้อยกว่า 1 วัน'
}

function getRoomExpiryStatus(room) {
  const msLeft = getRoomMsLeft(room)
  if (msLeft === null) return null
  if (msLeft < 0) return { level: 'expired', msLeft, label: `หมดแล้ว ${formatDaysLeft(msLeft)}` }
  if (msLeft <= ROOM_EXPIRY_WARNING_WINDOW_MS)
    return { level: 'warning', msLeft, label: `เหลือ ${formatDaysLeft(msLeft)}` }
  return null
}

function buildStaffTenantNotifs(request) {
  const info = STAFF_TENANT_NOTIF_INFO[request.status]
  if (!info) return []
  const inspectionInfo = ['move_room', 'moveout'].includes(request.type) && request.inspection_id
    ? {
        key: `inspection-${request.inspection_id}-${request.inspection_updated_at || request.inspection_reviewed_at || request.created_at}`,
        label: request.type === 'moveout'
          ? 'ตรวจห้องแล้ว สามารถอนุมัติการย้ายออกได้'
          : 'ตรวจห้องแล้ว สามารถอนุมัติย้ายห้องได้',
        tone: 'info',
      }
    : null
  const notificationInfo = inspectionInfo || info
  return [
    {
      key: inspectionInfo?.key || `tenant-${request.id}-${request.status}`,
      title: TENANT_REQUEST_TYPE_LABEL[request.type] || request.type,
      ...notificationInfo,
      date: inspectionInfo
        ? request.inspection_updated_at || request.inspection_reviewed_at || request.accepted_at || request.created_at
        : request.status === 'in_progress' ? request.accepted_at || request.created_at : request.created_at,
      details: [
        { label: 'ห้อง', value: request.room_number },
        ...(request.type === 'move_room' ? [{ label: 'ห้องปลายทาง', value: request.target_room_number }] : []),
        { label: 'ผู้เช่า', value: `${request.first_name} ${request.last_name}` },
        ...(request.note ? [{ label: 'หมายเหตุ', value: request.note }] : []),
      ],
      kind: 'tenant',
      request,
    },
  ]
}

function buildStaffMaintenanceNotifs(request) {
  const info = STAFF_MAINTENANCE_NOTIF_INFO[request.status]
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

function buildStaffSafetyNotif(incident) {
  const urgent = incident.severity === 'urgent'
  return {
    key: `safety-${incident.id}`,
    targetId: incident.id,
    title: `แจ้งเหตุ${SAFETY_INCIDENT_TYPE_LABEL[incident.incident_type] || ''}`,
    label: urgent ? 'เหตุด่วน รอรับเรื่อง' : 'มีการแจ้งเหตุ รอรับเรื่อง',
    tone: urgent ? 'danger' : 'pending',
    urgent,
    date: incident.created_at,
    preview: incident.description,
    previewLabel: 'รายละเอียดเหตุการณ์',
    kind: 'safety',
  }
}

function buildStaffVisitNotif(request) {
  const isVehicle = request.request_type === 'vehicle'
  return {
    key: `visit-${request.id}`,
    targetId: request.id,
    title: `${isVehicle ? 'คำขอรถ' : 'คำขอผู้มาพัก'}${request.room_number ? ` ห้อง ${request.room_number}` : ''}`,
    label: 'รออนุมัติ',
    tone: 'pending',
    date: request.created_at,
    preview: isVehicle ? request.vehicle_plate : request.guest_name,
    previewLabel: isVehicle ? 'ทะเบียนรถ' : 'ผู้มาพัก',
    kind: 'visit',
  }
}

function buildStaffSlipNotif(payment) {
  return {
    key: `slip-${payment.booking_id}-${payment.slip_path}`,
    targetId: payment.id,
    title: `สลิปโอนเงิน ห้อง ${payment.room_number}`,
    label: 'สลิปรอตรวจสอบ',
    tone: 'info',
    date: payment.created_at || payment.payment_date,
    preview: `${payment.first_name} ${payment.last_name} · ฿${Number(payment.amount || 0).toLocaleString('th-TH')}`,
    previewLabel: 'ผู้โอน · ยอดเงิน',
    kind: 'slip',
  }
}

function getStaffRequestTimeline(kind, request) {
  if (!request) return []
  const steps = [{ label: kind === 'maintenance' ? 'แจ้งซ่อม' : 'ส่งคำขอ', date: request.created_at }]
  if (request.accepted_at) {
    steps.push({ label: 'รับเรื่อง', date: request.accepted_at, by: request.accepted_by_name })
  }
  return steps
}

function StaffRequestTimeline({ kind, request }) {
  const timeline = getStaffRequestTimeline(kind, request)
  if (timeline.length === 0) return null

  return (
    <div className="staff-request-log">
      <div className="staff-request-log-items">
        {timeline.map((step, index) => {
          const prevStep = timeline[index - 1]
          const stepMs = prevStep ? new Date(step.date).getTime() - new Date(prevStep.date).getTime() : null
          return (
            <div key={step.label} className="staff-request-log-item">
              <span className="staff-request-log-dot" />
              <div className="staff-request-log-content">
                <p className="staff-request-log-label">
                  {step.label}
                  {step.by && (
                    <>
                      {' โดย '}
                      <span className="staff-actor">{step.by}</span>
                    </>
                  )}
                </p>
                <p className="staff-request-log-date">{formatDateTime(step.date)}</p>
                {stepMs !== null && <p className="staff-request-log-duration">ใช้เวลา {formatRemaining(stepMs)}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const MOVE_ROOM_REASON_LABEL = {
  room_problem: 'ห้องเดิมมีปัญหา/ชำรุด',
  price: 'ต้องการห้องราคาที่เหมาะสมขึ้น',
  amenities: 'ต้องการสิ่งอำนวยความสะดวกเพิ่ม',
  location: 'ต้องการชั้นหรือตำแหน่งที่สะดวกขึ้น',
  noise: 'เสียงดัง/ปัญหาเพื่อนบ้าน',
  other: 'อื่นๆ',
}

function formatDateOnly(value) {
  if (!value) return '-'
  return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function RouteArrowIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

function getTenantRequestFacts(request) {
  const facts = []
  if (request.type === 'moveout' && ['pending', 'in_progress'].includes(request.status)) {
    facts.push(request.inspection_id
      ? { label: 'ตรวจห้องแล้ว', tone: 'success' }
      : { label: 'รอตรวจสภาพห้อง', tone: 'warning' })
  }
  if (request.type === 'renew') {
    facts.push({
      label: `ขอต่อ ${RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`}`,
    })
    facts.push({ label: RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type })
  }
  if (request.type === 'move_room') {
    if (['pending', 'in_progress'].includes(request.status)) {
      facts.push(
        request.inspection_id
          ? { label: 'ตรวจห้องแล้ว', tone: 'success' }
          : { label: 'รอตรวจสภาพห้อง', tone: 'warning' },
      )
    }
    if (request.move_reason) facts.push({ label: MOVE_ROOM_REASON_LABEL[request.move_reason] || request.move_reason })
    if (request.preferred_move_date) {
      facts.push({ label: `ต้องการย้าย ${formatDateOnly(request.preferred_move_date)}`, tone: 'info' })
    }
  }
  return facts
}

const DEFAULT_HOME_REQUEST_FILTER = { search: '', status: 'all', sort: 'oldest' }

const TENANT_HOME_EXTRA_FILTERS = {
  renew: [
    {
      key: 'duration',
      label: 'ระยะเวลา',
      all: 'ทุกระยะเวลา',
      options: Object.entries(RENEW_DURATION_LABEL),
      match: (request, value) => String(request.renew_duration_months) === value,
    },
    {
      key: 'payment',
      label: 'การชำระเงิน',
      all: 'ทุกรูปแบบการชำระ',
      options: Object.entries(RENEW_PAYMENT_TYPE_LABEL),
      match: (request, value) => request.renew_payment_type === value,
    },
  ],
  moveout: [
    {
      key: 'inspection',
      label: 'การตรวจห้อง',
      all: 'ทุกสถานะการตรวจห้อง',
      options: [
        ['done', 'ตรวจห้องแล้ว'],
        ['waiting', 'รอตรวจสภาพห้อง'],
      ],
      match: (request, value) => (value === 'done') === Boolean(request.inspection_id),
    },
  ],
  move_room: [
    {
      key: 'inspection',
      label: 'การตรวจห้อง',
      all: 'ทุกสถานะการตรวจห้อง',
      options: [
        ['done', 'ตรวจห้องแล้ว'],
        ['waiting', 'รอตรวจสภาพห้อง'],
      ],
      match: (request, value) => (value === 'done') === Boolean(request.inspection_id),
    },
    {
      key: 'reason',
      label: 'เหตุผล',
      all: 'ทุกเหตุผล',
      options: Object.entries(MOVE_ROOM_REASON_LABEL),
      match: (request, value) => request.move_reason === value,
    },
  ],
}

const TENANT_HOME_CARDS = [
  { type: 'renew', title: 'คำขอต่อสัญญา' },
  { type: 'moveout', title: 'คำขอแจ้งย้ายออก' },
  { type: 'move_room', title: 'คำขอย้ายห้อง' },
]

const HOME_SECTIONS = [
  { key: 'rooms', label: 'ห้องพัก' },
  { key: 'renew', label: 'ต่อสัญญา' },
  { key: 'moveout', label: 'แจ้งย้ายออก' },
  { key: 'move_room', label: 'ย้ายห้อง' },
  { key: 'maintenance', label: 'แจ้งซ่อม' },
  { key: 'expenses', label: 'รายจ่าย' },
]

const TENANT_TYPE_SEGMENTS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'renew', label: 'ต่อสัญญา' },
  { key: 'moveout', label: 'แจ้งย้ายออก' },
  { key: 'move_room', label: 'ย้ายห้อง' },
]

export function StaffFilterPanel({
  segments,
  segmentsClassName = '',
  active,
  onSegment,
  segmentLabel = 'กรองตามสถานะ',
  search,
  onSearch,
  searchPlaceholder,
  children,
  resultText,
  canClear,
  onClear,
  sticky = false,
  dateRange,
  segmentsBelow = true,
}) {
  return (
    <div className={`staff-req-filters${sticky ? ' is-sticky' : ''}${segmentsBelow ? ' is-segments-below' : ''}`}>
      {segments && (
        <div className={`staff-req-segments${segmentsClassName ? ` ${segmentsClassName}` : ''}`} role="tablist" aria-label={segmentLabel}>
          {segments.map((segment) => (
            <button
              type="button"
              role="tab"
              key={segment.key}
              aria-selected={active === segment.key}
              className={`staff-req-segment${segment.className ? ` ${segment.className}` : ''}${active === segment.key ? ' is-active' : ''}`}
              onClick={() => onSegment(segment.key)}
            >
              {segment.label}
              {segment.count != null && <span>{segment.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="staff-req-filter-row">
        <label className="staff-req-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label="ค้นหา"
          />
        </label>
        {children}
      </div>
      {dateRange && <StaffDateRange {...dateRange} />}
      {resultText && (
        <div className="staff-req-result">
          <span>{resultText}</span>
          {canClear && (
            <button type="button" className="staff-req-clear" onClick={onClear}>
              ล้างตัวกรอง
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TenantRequestFilters({
  type,
  onType,
  counts,
  search,
  onSearch,
  status,
  onStatus,
  statusOptions,
  sort,
  onSort,
  resultText,
  canClear,
  onClear,
  sticky = false,
}) {
  return (
    <StaffFilterPanel
      segments={TENANT_TYPE_SEGMENTS.map((segment) => ({
        ...segment,
        className: `type-${segment.key}`,
        count: counts ? counts[segment.key] ?? 0 : null,
      }))}
      segmentLabel="กรองตามประเภทคำขอ"
      active={type}
      onSegment={onType}
      search={search}
      onSearch={onSearch}
      searchPlaceholder="ค้นหาเลขห้อง ชื่อผู้เช่า หรือเบอร์โทร"
      resultText={resultText}
      canClear={canClear}
      onClear={onClear}
      sticky={sticky}
    >
      <select className="staff-filter-select" value={status} onChange={(event) => onStatus(event.target.value)} aria-label="สถานะ">
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {onSort && (
        <select className="staff-filter-select" value={sort} onChange={(event) => onSort(event.target.value)} aria-label="เรียงลำดับ">
          <option value="oldest">รอนานสุดก่อน</option>
          <option value="newest">ล่าสุดก่อน</option>
        </select>
      )}
    </StaffFilterPanel>
  )
}

function MoveRoomRequestBody({ request }) {
  const open = ['pending', 'in_progress'].includes(request.status)
  const details = [
    { key: 'phone', icon: 'phone', label: 'โทร', value: request.phone || '-' },
    { key: 'reason', icon: 'info', label: 'เหตุผล', value: request.move_reason ? MOVE_ROOM_REASON_LABEL[request.move_reason] || request.move_reason : '-' },
    { key: 'date', icon: 'calendar', label: 'ต้องการย้าย', value: request.preferred_move_date ? formatDateOnly(request.preferred_move_date) : 'ไม่ระบุ' },
  ]
  return (
    <>
      <div className="staff-req-route">
        <div className="staff-req-route-room">
          <small>ห้องเดิม</small>
          <strong>{request.room_number}</strong>
        </div>
        <span className="staff-req-route-arrow" aria-hidden="true">
          <RouteArrowIcon />
        </span>
        <div className="staff-req-route-room is-target">
          <small>ห้องใหม่</small>
          <strong>{request.target_room_number || '-'}</strong>
        </div>
        {open && (
          <span className={`staff-req-route-check ${request.inspection_id ? 'is-done' : 'is-waiting'}`}>
            {request.inspection_id ? 'ตรวจห้องแล้ว' : 'รอตรวจสภาพห้อง'}
          </span>
        )}
      </div>
      <TenantRequestDetails details={details} />
    </>
  )
}

const MAINTENANCE_NEXT_STEP = {
  pending: { label: 'ขั้นต่อไป: รับเรื่อง', tone: 'is-waiting' },
  in_progress: { label: 'กำลังดำเนินการซ่อม', tone: 'is-info' },
}

function MoveoutRequestBody({ request }) {
  const nextStep = request.status === 'pending'
    ? 'รับเรื่อง'
    : request.status === 'in_progress'
      ? request.inspection_id ? 'อนุมัติการย้ายออก' : 'ตรวจสภาพห้อง'
      : null
  return (
    <>
      <div className="staff-req-route">
        <div className="staff-req-route-room is-target">
          <small>ห้องที่แจ้งย้ายออก</small>
          <strong>{request.room_number}</strong>
        </div>
        {['pending', 'in_progress'].includes(request.status) && (
          <span className={`staff-req-route-check ${request.inspection_id ? 'is-done' : 'is-waiting'}`}>
            {request.inspection_id ? 'ตรวจห้องแล้ว' : 'รอตรวจสภาพห้อง'}
          </span>
        )}
      </div>
      <TenantRequestDetails
        details={[
          { key: 'phone', icon: 'phone', label: 'โทร', value: request.phone || '-' },
          { key: 'created', icon: 'clock', label: 'แจ้งเมื่อ', value: `${formatDateTime(request.created_at)} น.` },
          ...(nextStep ? [{ key: 'next', icon: 'info', label: 'ขั้นต่อไป', value: nextStep }] : []),
        ]}
      />
    </>
  )
}

function TenantRequestDetails({ details, columns = false }) {
  return (
    <dl className={`staff-req-details${columns ? ' is-columns' : ''}`}>
      {details.map((detail) => (
        <div key={detail.key} className="staff-req-detail">
          <dt>
            <WaitingDetailIcon type={detail.icon} size={15} />
            {detail.label}
          </dt>
          <dd>{detail.value}</dd>
        </div>
      ))}
    </dl>
  )
}

const RENEW_NEXT_STEP = {
  pending: { label: 'ขั้นต่อไป: อนุมัติต่อสัญญา', tone: 'is-waiting' },
  in_progress: { label: 'ขั้นต่อไป: อนุมัติต่อสัญญา', tone: 'is-info' },
}

function RenewRequestBody({ request }) {
  const nextStep = RENEW_NEXT_STEP[request.status]
  const isOpen = ['pending', 'in_progress'].includes(request.status)
  const months = Number(request.renew_duration_months) || 0
  const currentEnd = request.source_rental_end_date
  const newEnd = isOpen && currentEnd ? addContractMonths(currentEnd, months) : null
  const price = Number(request.source_room_price) || 0
  const deposit = Number(request.deposit_amount) || 0
  const outstanding = Number(request.outstanding?.amount) || 0
  return (
    <>
      <div className="staff-req-route">
        <div className="staff-req-route-room is-target">
          <small>ห้องที่ขอต่อสัญญา</small>
          <strong>{request.room_number}</strong>
        </div>
        {nextStep && <span className={`staff-req-route-check ${nextStep.tone}`}>{nextStep.label}</span>}
      </div>
      <TenantRequestDetails
        details={[
          { key: 'phone', icon: 'phone', label: 'โทร', value: request.phone || '-' },
          {
            key: 'duration',
            icon: 'calendar',
            label: 'ระยะเวลา',
            value: RENEW_DURATION_LABEL[request.renew_duration_months] || (request.renew_duration_months ? `${request.renew_duration_months} เดือน` : '-'),
          },
          ...(currentEnd
            ? [{
                key: 'end',
                icon: 'calendar',
                label: newEnd ? 'สิ้นสุดสัญญา' : 'สิ้นสุดปัจจุบัน',
                value: newEnd ? (
                  <span className="staff-req-renew-end">
                    <s>{formatDate(currentEnd)}</s>
                    <span aria-hidden="true">→</span>
                    <b>{formatDate(newEnd)}</b>
                  </span>
                ) : formatDate(currentEnd),
              }]
            : []),
          {
            key: 'payment',
            icon: 'wallet',
            label: 'การชำระเงิน',
            value: `รายเดือน${price ? ` · ฿${formatCurrency(price)}` : ''}`,
          },
          ...(isOpen
            ? [{
                key: 'outstanding',
                icon: 'info',
                label: 'ยอดค้าง',
                value: (
                  <span className={`staff-req-renew-due ${outstanding > 0 ? 'is-danger' : 'is-success'}`}>
                    {outstanding > 0 ? `฿${formatCurrency(outstanding)} · ต้องชำระก่อน` : 'ไม่มี'}
                  </span>
                ),
              }]
            : []),
          ...(deposit > 0
            ? [{ key: 'deposit', icon: 'wallet', label: 'เงินมัดจำ', value: `฿${formatCurrency(deposit)} · ยังอยู่ครบ` }]
            : []),
        ]}
      />
    </>
  )
}

const TENANT_REQUEST_BODY = {
  renew: RenewRequestBody,
  moveout: MoveoutRequestBody,
  move_room: MoveRoomRequestBody,
}

const TENANT_REQUEST_NOTE_LABEL = {
  moveout: 'เหตุผลการย้ายออก',
}

function TenantRequestCard({ request, steps = [], children }) {
  const Body = TENANT_REQUEST_BODY[request.type] || RenewRequestBody
  return (
    <article className={`staff-req-card type-${request.type} is-structured status-${request.status}`}>
      <div className="staff-req-head is-identity">
        <span className="staff-req-avatar" aria-hidden="true">
          <WaitingDetailIcon type="user" size={18} />
        </span>
        <div className="staff-req-identity">
          <strong>
            {request.first_name} {request.last_name}
          </strong>
          <span className={`staff-badge type-${request.type}`}>{TENANT_REQUEST_TYPE_LABEL[request.type] || request.type}</span>
        </div>
        <span className={`staff-badge status-${request.status} staff-req-status`}>
          {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
        </span>
      </div>
      <Body request={request} />
      {request.type === 'move_room' && request.transfer_charge_due_at && (
        <div className={`staff-req-charge is-${request.transfer_charge_status === 'paid' ? 'paid' : request.transfer_charge_has_slip ? 'verifying' : 'unpaid'}`}>
          <strong>
            {request.transfer_charge_status === 'paid'
              ? 'ชำระยอดย้ายห้องแล้ว พร้อมทำสัญญา'
              : request.transfer_charge_has_slip
                ? 'ส่งสลิปยอดย้ายห้องแล้ว รอตรวจสลิป'
                : 'รอผู้เช่าชำระยอดย้ายห้อง'}
            {' '}฿{formatCurrency(request.transfer_charge_amount)}
          </strong>
          {request.transfer_charge_status !== 'paid' && <span>ครบกำหนด {formatDateTime(request.transfer_charge_due_at)}</span>}
        </div>
      )}
      {request.note && (
        <div className="staff-req-note">
          <span className="staff-req-note-label">{TENANT_REQUEST_NOTE_LABEL[request.type] || 'หมายเหตุ'}</span>
          <p>{request.note}</p>
        </div>
      )}
      <TenantRequestCardFooter steps={steps}>{children}</TenantRequestCardFooter>
    </article>
  )
}

function TenantRequestCardFooter({ steps, children }) {
  return (
    <div className="staff-req-footer">
      <ol className="staff-req-meta">
        {steps.map((step) => (
          <li key={step.key} className={`staff-req-meta-step${step.tone ? ` is-${step.tone}` : ''}`}>
            <span className="staff-req-meta-dot" aria-hidden="true" />
            <span className="staff-req-meta-label">
              {step.label}
              {step.by && <strong className="staff-actor"> {step.by}</strong>}
            </span>
            <time dateTime={step.date}>
              {new Date(step.date).toLocaleString('th-TH', {
                year: '2-digit',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </li>
        ))}
      </ol>
      <div className="staff-req-actions">{children}</div>
    </div>
  )
}

function MoveoutAcknowledgeModal({ request, room, error, processing, onConfirm, onClose }) {
  const due = room?.currentDue
  const hasDue = due && due.status !== 'paid' && Number(due.amount) > 0
  const nextSteps = [
    { key: 'accept', label: 'รับเรื่องคำขอ', detail: 'ผู้เช่าจะเห็นสถานะ "รับเรื่องแล้ว"', current: true },
    { key: 'inspect', label: 'นัดตรวจสภาพห้อง', detail: 'บันทึกผลตรวจและสรุปค่าเสียหาย (ถ้ามี)' },
    { key: 'approve', label: 'อนุมัติการย้ายออก', detail: 'ระงับบัญชีผู้เช่าและเปลี่ยนห้องเป็นว่าง' },
  ]
  return (
    <Modal title="ยืนยันรับเรื่องแจ้งย้ายออก" onClose={onClose} variant="transfer">
      {(requestClose) => (
        <div className="staff-transfer-body is-moveout-ack">
          <div className="staff-transfer-top">
            <div className="staff-transfer-hero">
              <div className="staff-confirm-icon is-info">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
                  <path d="M16 15l4-3-4-3" />
                  <path d="M20 12H10" />
                </svg>
              </div>
              <div>
                <p className="staff-confirm-message">รับเรื่องคำขอแจ้งย้ายออก</p>
                <p className="staff-confirm-note">ตรวจสอบข้อมูลผู้เช่าก่อนกดรับเรื่อง</p>
              </div>
            </div>
            <div className="staff-req-detail-room is-summary">
              <span className="staff-req-detail-room-icon">
                <DoorIcon size={22} />
              </span>
              <div className="staff-req-detail-room-identity">
                <small>ห้องที่แจ้งย้ายออก</small>
                <strong>{request.room_number}</strong>
              </div>
              <div className="staff-req-detail-room-tenant">
                <small>ผู้เช่า</small>
                <span>{[request.first_name, request.last_name].filter(Boolean).join(' ') || '-'}</span>
                {request.phone && (
                  <em className="staff-req-detail-room-phone">
                    <WaitingDetailIcon type="phone" size={13} />
                    {request.phone}
                  </em>
                )}
              </div>
            </div>
          </div>

          <div className="staff-transfer-scroll">
            <section className="staff-transfer-section">
              <h4 className="staff-transfer-section-title">เหตุผล/รายละเอียดการย้ายออก</h4>
              <p className="staff-transfer-note">{request.note || '-'}</p>
            </section>

            <section className="staff-transfer-section">
              <h4 className="staff-transfer-section-title">ผู้เช่าและสัญญา</h4>
              <div className="staff-transfer-columns">
                <div>
                  <p className="staff-transfer-subtitle">ผู้เช่า</p>
                  <dl className="staff-transfer-list is-single">
                    <div>
                      <dt>ชื่อ</dt>
                      <dd>
                        {request.first_name} {request.last_name}
                      </dd>
                    </div>
                    <div>
                      <dt>เบอร์โทร</dt>
                      <dd>{request.phone || '-'}</dd>
                    </div>
                    <div>
                      <dt>ส่งคำขอ</dt>
                      <dd>{formatDateTime(request.created_at)}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <p className="staff-transfer-subtitle">การเงินและสัญญา</p>
                  <dl className="staff-transfer-list is-single">
                    <div>
                      <dt>เงินประกัน</dt>
                      <dd>{request.deposit_amount != null ? `฿${formatCurrency(request.deposit_amount)}` : '-'}</dd>
                    </div>
                    <div>
                      <dt>ยอดค้างชำระ</dt>
                      <dd className={hasDue ? 'is-danger' : 'is-success'}>
                        {hasDue ? `฿${formatCurrency(due.amount)}` : 'ไม่มี'}
                      </dd>
                    </div>
                    <div>
                      <dt>สิ้นสุดสัญญา</dt>
                      <dd>{formatDate(room?.rental_end_date)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>

            <section className="staff-transfer-section">
              <h4 className="staff-transfer-section-title">ขั้นตอนหลังรับเรื่อง</h4>
              <ol className="staff-req-steps">
                {nextSteps.map((step, index) => (
                  <li key={step.key} className={step.current ? 'is-done' : ''}>
                    <span className="staff-req-step-dot" />
                    <div>
                      <p>
                        {index + 1}. {step.label}
                        {step.current && <span className="staff-req-step-now">ตอนนี้</span>}
                      </p>
                      <small>{step.detail}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="staff-transfer-footer">
            {error && <p className="staff-form-error">{error}</p>}
            <div className="staff-form-actions">
              <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                ยกเลิก
              </button>
              <button type="button" className="staff-action-btn is-primary" disabled={processing} onClick={onConfirm}>
                {processing ? 'กำลังดำเนินการ...' : 'ยืนยันรับเรื่อง'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

const REJECT_OUTCOME = {
  renew: 'สัญญาเช่าเดิมจะไม่ถูกขยาย และยังสิ้นสุดตามวันเดิม',
  moveout: 'บัญชีผู้เช่าและห้องพักยังใช้งานได้ตามปกติ',
  move_room: 'ผู้เช่ายังอยู่ห้องเดิม และห้องปลายทางยังว่างให้คนอื่นเลือกได้',
}

const REJECT_REASON_PRESETS = {
  moveout: ['ยังมียอดค้างชำระ กรุณาชำระให้ครบก่อนแจ้งย้ายออก', 'วันที่ต้องการย้ายออกไม่สะดวก กรุณาติดต่อเจ้าหน้าที่เพื่อนัดวันใหม่', 'ข้อมูลไม่ครบ กรุณาแจ้งย้ายออกใหม่อีกครั้ง'],
  renew: ['ยังมียอดค้างชำระ กรุณาชำระให้ครบก่อนต่อสัญญา', 'ห้องนี้มีกำหนดปรับปรุง ไม่สามารถต่อสัญญาได้'],
  move_room: ['ห้องปลายทางไม่ว่างแล้ว กรุณาเลือกห้องอื่น', 'ยังมียอดค้างชำระ กรุณาชำระให้ครบก่อนย้ายห้อง'],
}

function TenantRejectModal({ request, error, processing, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [openedAt] = useState(() => Date.now())
  const typeLabel = TENANT_REQUEST_TYPE_LABEL[request.type] || ''
  const facts = getTenantRequestFacts(request)
  const contractEnd = request.source_rental_end_date
  const msLeft = contractEnd ? new Date(contractEnd).getTime() - openedAt : null
  const deposit = Number(request.deposit_amount) || 0
  const depositPaid = request.deposit_paid == null ? null : Number(request.deposit_paid) || 0
  const outstanding = Number(request.outstanding?.amount) || 0
  const details = [
    { label: 'เบอร์โทร', value: request.phone || '-' },
    { label: 'ส่งคำขอ', value: formatDateTime(request.created_at) },
    request.accepted_by_name && { label: 'รับเรื่องโดย', value: request.accepted_by_name },
    request.type === 'renew' && {
      label: 'ขอต่อสัญญา',
      value: RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`,
    },
    request.type === 'move_room' && { label: 'ห้องที่ขอย้ายไป', value: request.target_room_number || '-' },
    ['moveout', 'move_room'].includes(request.type) && {
      label: request.type === 'moveout' ? 'ต้องการย้ายออก' : 'ต้องการย้าย',
      value: request.preferred_move_date ? formatDateOnly(request.preferred_move_date) : 'ไม่ระบุ',
    },
    contractEnd && { label: 'สิ้นสุดสัญญา', value: formatDate(contractEnd) },
    msLeft !== null && {
      label: 'สัญญาเหลือ',
      value: msLeft < 0 ? 'หมดสัญญาแล้ว' : formatDaysLeft(msLeft),
      tone: msLeft <= ROOM_EXPIRY_WARNING_WINDOW_MS ? 'warning' : null,
    },
    deposit > 0 && {
      label: 'เงินมัดจำ',
      value: depositPaid === null
        ? `฿${formatCurrency(deposit)}`
        : depositPaid > 0 ? `฿${formatCurrency(depositPaid)} (ชำระแล้ว)` : `฿${formatCurrency(deposit)} (ยังไม่ชำระ)`,
    },
    request.outstanding && {
      label: 'ยอดค้างชำระ',
      value: outstanding > 0 ? `฿${formatCurrency(outstanding)}` : 'ไม่มี',
      tone: outstanding > 0 ? 'danger' : 'success',
    },
  ].filter(Boolean)
  const outcomes = [
    'คำขอนี้จะถูกปิดและเปลี่ยนสถานะเป็น "ปฏิเสธแล้ว"',
    REJECT_OUTCOME[request.type],
    request.type === 'moveout' && contractEnd && `สัญญาเช่ายังมีผลต่อถึง ${formatDate(contractEnd)} ผู้เช่าต้องจ่ายค่าเช่ารายเดือนตามปกติ`,
    request.type === 'moveout' && deposit > 0 && `เงินมัดจำ ฿${formatCurrency(deposit)} ยังอยู่ครบ ไม่มีการคืนหรือริบ`,
    ['moveout', 'move_room'].includes(request.type) && request.inspection_id && 'ผลตรวจห้องที่บันทึกไว้ยังเก็บเป็นประวัติ',
    'ผู้เช่าจะเห็นผลในหน้าของตัวเอง และส่งคำขอใหม่ได้',
  ].filter(Boolean)
  return (
    <Modal title="ยืนยันการปฏิเสธคำขอ" onClose={onClose} variant="transfer-approval">
      {(requestClose) => (
        <div className="staff-transfer-body">
          <div className="staff-transfer-top">
            <div className="staff-transfer-hero">
              <div className="staff-confirm-icon is-warning">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M15 9l-6 6M9 9l6 6" />
                </svg>
              </div>
              <div>
                <p className="staff-confirm-message">ปฏิเสธคำขอ{typeLabel}</p>
                <p className="staff-confirm-note">ตรวจสอบข้อมูลให้แน่ใจก่อนกดยืนยัน การปฏิเสธย้อนกลับไม่ได้</p>
              </div>
            </div>
            <div className="staff-req-detail-room is-reject">
              <span className={`staff-badge type-${request.type}`}>{typeLabel}</span>
              <strong>
                {request.room_number}
                {request.type === 'move_room' && request.target_room_number && (
                  <>
                    <RouteArrowIcon />
                    {request.target_room_number}
                  </>
                )}
              </strong>
              <em>
                {request.first_name} {request.last_name}
              </em>
            </div>
          </div>

          <div className="staff-transfer-scroll">
            <section className="staff-transfer-section">
              <h4 className="staff-transfer-section-title">รายละเอียดคำขอ</h4>
              <dl className="staff-transfer-list">
                {details.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd className={detail.tone ? `is-${detail.tone}` : undefined}>{detail.value}</dd>
                  </div>
                ))}
              </dl>
              {facts.length > 0 && (
                <div className="staff-req-facts">
                  {facts.map((fact) => (
                    <span key={fact.label} className={`staff-req-fact${fact.tone ? ` is-${fact.tone}` : ''}`}>
                      {fact.label}
                    </span>
                  ))}
                </div>
              )}
              <p className="staff-transfer-note">
                <span>{request.type === 'moveout' ? 'เหตุผลการย้ายออก:' : 'หมายเหตุ:'}</span> {request.note || '-'}
              </p>
            </section>

            <section className="staff-transfer-section">
              <h4 className="staff-transfer-section-title">
                เหตุผลที่ปฏิเสธ <span className="staff-reject-required">* ผู้เช่าจะเห็นข้อความนี้</span>
              </h4>
              {REJECT_REASON_PRESETS[request.type] && (
                <div className="staff-reject-presets">
                  {REJECT_REASON_PRESETS[request.type].map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      className={`staff-reject-preset${reason === preset ? ' is-active' : ''}`}
                      onClick={() => {
                        setReason(preset)
                        setReasonError('')
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                className="staff-reject-reason"
                rows={3}
                maxLength={500}
                value={reason}
                placeholder="พิมพ์เหตุผลหรือสิ่งที่ผู้เช่าต้องทำต่อ เช่น กรุณาชำระค่าเช่าเดือนนี้ก่อน แล้วแจ้งย้ายออกใหม่"
                onChange={(event) => {
                  setReason(event.target.value)
                  setReasonError('')
                }}
              />
              <div className="staff-reject-reason-meta">
                {reasonError ? <span className="is-error">{reasonError}</span> : <span>เลือกข้อความด้านบนหรือพิมพ์เองก็ได้</span>}
                <span>{reason.length}/500</span>
              </div>
            </section>

            <section className="staff-transfer-section is-danger">
              <h4 className="staff-transfer-section-title">หลังปฏิเสธ</h4>
              <ul className="staff-reject-outcomes">
                {outcomes.map((outcome) => (
                  <li key={outcome}>{outcome}</li>
                ))}
              </ul>
            </section>
          </div>

          <div className="staff-transfer-footer">
            {error && <p className="staff-form-error">{error}</p>}
            <div className="staff-form-actions">
              <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="staff-action-btn is-danger-solid"
                disabled={processing}
                onClick={() => {
                  if (!reason.trim()) {
                    setReasonError('กรุณาระบุเหตุผลที่ปฏิเสธเพื่อแจ้งผู้เช่า')
                    return
                  }
                  onConfirm(reason.trim())
                }}
              >
                {processing ? 'กำลังดำเนินการ...' : 'ยืนยันปฏิเสธ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ParcelDetailModal({ parcel, onPreviewPhoto, onClose }) {
  const received = parcel.status === 'received'
  const cancelled = parcel.status === 'cancelled'
  const statusInfo = parcelStatusInfo(parcel.status)
  const photos = parcel.photos || []
  const tenantName = parcel.first_name ? `${parcel.first_name} ${parcel.last_name}` : 'ไม่มีผู้เช่าปัจจุบัน'
  const previousTenantTag = parcel.is_previous_tenant ? <em className="parcel-prev-tenant">{PREVIOUS_TENANT_LABEL}</em> : null
  return (
    <Modal title="รายละเอียดพัสดุ" onClose={onClose} variant="parcel-detail">
      {() => (
        <div className="staff-transfer-body">
          <div className="staff-transfer-top">
            <div className="staff-transfer-hero">
              <div className={`staff-confirm-icon ${received ? 'is-success' : 'is-info'}`}>
                <PackageIcon size={20} strokeWidth={2.2} />
              </div>
              <div>
                <p className="staff-confirm-message">{parcel.sender_name || 'พัสดุทั่วไป'}</p>
                <p className="staff-confirm-note">
                  {parcel.tracking_number ? `เลขพัสดุ ${parcel.tracking_number}` : 'ไม่มีเลขพัสดุ'}
                </p>
              </div>
              <span className={`parcel-status staff-parcel-detail-status ${statusInfo.tone}`}>
                {statusInfo.label}
              </span>
            </div>
            <div className="staff-req-detail-room is-summary">
              <span className="staff-req-detail-room-icon">
                <PackageIcon size={22} strokeWidth={2} />
              </span>
              <div className="staff-req-detail-room-identity">
                <small>ห้อง</small>
                <strong>{parcel.room_number}</strong>
              </div>
              <div className="staff-req-detail-room-tenant">
                <small>ผู้รับ</small>
                <span className="parcel-recipient-name">
                  {tenantName}
                  {previousTenantTag}
                </span>
                {parcel.phone && (
                  <em className="staff-req-detail-room-phone">
                    <WaitingDetailIcon type="phone" size={13} />
                    {parcel.phone}
                  </em>
                )}
              </div>
            </div>
          </div>

          <div className="staff-transfer-scroll">
            <section className="staff-transfer-section">
              <h4 className="staff-transfer-section-title">ข้อมูลพัสดุ</h4>
              <div className="staff-transfer-columns">
                <div>
                  <p className="staff-transfer-subtitle">ผู้รับ</p>
                  <dl className="staff-transfer-list is-single">
                    <div>
                      <dt>ห้อง</dt>
                      <dd>{parcel.room_number}</dd>
                    </div>
                    <div>
                      <dt>ผู้เช่า</dt>
                      <dd>{tenantName} {previousTenantTag}</dd>
                    </div>
                    <div>
                      <dt>เบอร์โทร</dt>
                      <dd>{parcel.phone || '-'}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <p className="staff-transfer-subtitle">พัสดุ</p>
                  <dl className="staff-transfer-list is-single">
                    <div>
                      <dt>ผู้ส่ง</dt>
                      <dd>{parcel.sender_name || 'พัสดุทั่วไป'}</dd>
                    </div>
                    <div>
                      <dt>เลขพัสดุ</dt>
                      <dd>{parcel.tracking_number || '-'}</dd>
                    </div>
                    <div>
                      <dt>บันทึกโดย</dt>
                      <dd className="staff-actor">{parcel.staff_name || 'เจ้าหน้าที่'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              {parcel.description && (
                <p className="staff-transfer-note">
                  <span>รายละเอียด:</span> {parcel.description}
                </p>
              )}
            </section>

            <section className="staff-transfer-section">
              <div className="staff-transfer-section-head">
                <h4 className="staff-transfer-section-title">รูปพัสดุ</h4>
                <span className="staff-transfer-muted">{photos.length} รูป</span>
              </div>
              {photos.length > 0 ? (
                <div className="staff-transfer-photos staff-parcel-detail-photos">
                  {photos.map((photo, index) => (
                    <button
                      type="button"
                      key={photo.url}
                      className="staff-transfer-photo"
                      onClick={() => onPreviewPhoto(index)}
                      aria-label={`ดูรูปพัสดุ ${index + 1}`}
                    >
                      <UploadImage src={photo.url} alt="" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="staff-transfer-muted">ไม่มีรูปพัสดุ</p>
              )}
            </section>

            <section className="staff-transfer-section">
              <h4 className="staff-transfer-section-title">ขั้นตอนการดำเนินการ</h4>
              <ProcessSteps
                actorClassName="staff-actor"
                startDate={parcel.created_at}
                endDate={received ? parcel.received_at : null}
                waitingText={cancelled ? 'ผู้เช่าย้ายออก' : 'รอผู้เช่ารับพัสดุ'}
                steps={[
                  { key: 'record', label: 'บันทึกพัสดุเข้าห้อง', by: parcel.staff_name || 'เจ้าหน้าที่', date: parcel.created_at, icon: 'box' },
                  {
                    key: 'receive',
                    label: received ? 'ผู้เช่ารับพัสดุแล้ว' : cancelled ? 'ผู้เช่าย้ายออก' : 'รอผู้เช่ารับพัสดุ',
                    date: received ? parcel.received_at : null,
                    icon: 'check',
                    pendingText: cancelled ? 'ยกเลิก' : 'ยังไม่ได้รับ',
                  },
                ]}
              />
            </section>
          </div>

        </div>
      )}
    </Modal>
  )
}

function RenewRequestOverview({ request, contractEnd, contractMsLeft, isOpen }) {
  const months = Number(request.renew_duration_months) || 0
  const price = Number(request.source_room_price) || 0
  const deposit = Number(request.deposit_amount) || 0
  const depositMonths = price > 0 && deposit > 0 && Number.isInteger(deposit / price) ? deposit / price : null
  const newEnd = isOpen && contractEnd ? addContractMonths(contractEnd, months) : null
  const outstanding = Number(request.outstanding?.amount) || 0
  const expiringSoon = contractMsLeft !== null && contractMsLeft <= ROOM_EXPIRY_WARNING_WINDOW_MS
  const rows = [
    { label: 'วันสิ้นสุดสัญญา', before: formatDate(contractEnd), after: newEnd ? formatDate(newEnd) : '-', changed: true },
    { label: 'ค่าเช่า', before: price ? `฿${formatCurrency(price)}/เดือน` : '-', after: price ? `฿${formatCurrency(price)}/เดือน` : '-' },
    { label: 'การชำระ', before: 'รายเดือน', after: 'รายเดือน' },
    {
      label: 'เงินมัดจำ',
      before: deposit > 0 ? `฿${formatCurrency(deposit)}${depositMonths ? ` (${depositMonths} เดือน)` : ''}` : 'ไม่มี',
      after: deposit > 0 ? 'ยังอยู่ครบ' : 'ไม่มี',
    },
  ]
  return (
    <div className="staff-renew-overview">
      {isOpen && (
        <div className="staff-renew-stats">
          <div className={outstanding > 0 ? 'is-danger' : 'is-success'}>
            <small>ยอดค้างชำระ</small>
            <strong>{outstanding > 0 ? `฿${formatCurrency(outstanding)}` : 'ไม่มี'}</strong>
          </div>
          <div className={expiringSoon ? 'is-warning' : ''}>
            <small>สัญญาเหลือ</small>
            <strong>{contractMsLeft === null ? '-' : contractMsLeft < 0 ? 'หมดสัญญาแล้ว' : formatDaysLeft(contractMsLeft)}</strong>
          </div>
          <div className="is-accent">
            <small>ขอต่อ</small>
            <strong>{RENEW_DURATION_LABEL[request.renew_duration_months] || `${months} เดือน`}</strong>
          </div>
        </div>
      )}

      {isOpen && contractEnd && (
        <div className="staff-renew-compare">
          <div className="staff-renew-compare-head">
            <span>รายละเอียด</span>
            <span>สัญญาตอนนี้</span>
            <span>หลังอนุมัติ</span>
          </div>
          {rows.map((row) => (
            <div key={row.label} className={`staff-renew-compare-row${row.changed ? ' is-changed' : ''}`}>
              <span>{row.label}</span>
              <span>{row.before}</span>
              <strong>{row.after}</strong>
            </div>
          ))}
        </div>
      )}

      {outstanding > 0 && isOpen && (
        <ul className="staff-renew-outstanding-list">
          {request.outstanding.items.map((item, index) => (
            <li key={`${item.type}-${index}`}>
              <span>{item.label}{item.status === 'overdue' ? ' · เกินกำหนด' : ''}</span>
              <b>฿{formatCurrency(item.amount)}</b>
            </li>
          ))}
        </ul>
      )}

      <dl className="staff-renew-info">
        <div>
          <dt>ระยะที่ขอต่อ</dt>
          <dd>{RENEW_DURATION_LABEL[request.renew_duration_months] || `${months} เดือน`}</dd>
        </div>
        <div>
          <dt>การชำระ</dt>
          <dd>รายเดือน</dd>
        </div>
        <div>
          <dt>ส่งคำขอ</dt>
          <dd>{formatDateTime(request.created_at)}</dd>
        </div>
        <div>
          <dt>สถานะ</dt>
          <dd>{TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}</dd>
        </div>
      </dl>

      {deposit > 0 && isOpen && (
        <p className="staff-renew-deposit-note">
          เงินมัดจำ ฿{formatCurrency(deposit)} ยังอยู่ ไม่เก็บเพิ่ม · คืนเมื่อผู้เช่าพักครบถึง {newEnd ? formatDate(newEnd) : 'วันสิ้นสุดใหม่'} · ริบหากออกก่อน
        </p>
      )}
    </div>
  )
}

function MoveOutRequestOverview({ request, contractEnd, contractMsLeft, isOpen }) {
  const deposit = Number(request.deposit_amount) || 0
  const depositPaid = request.deposit_paid == null ? deposit : Math.min(deposit, Number(request.deposit_paid) || 0)
  const balance = request.outstanding
  const balanceItems = balance?.items ?? []
  const outstanding = Number(balance?.amount) || 0
  const inspected = Boolean(request.inspection_id)
  const moveDay = request.preferred_move_date ? new Date(`${request.preferred_move_date}T00:00:00`) : null
  const endDay = contractEnd ? new Date(contractEnd) : null
  if (endDay) endDay.setHours(0, 0, 0, 0)
  const daysEarly = moveDay && endDay ? Math.ceil((endDay - moveDay) / 86400000) : null
  const leavesEarly = daysEarly !== null && daysEarly > 0
  const expiringSoon = contractMsLeft !== null && contractMsLeft <= ROOM_EXPIRY_WARNING_WINDOW_MS
  const ready = inspected && balanceItems.length === 0
  return (
    <div className="staff-renew-overview">
      <div className="staff-renew-stats">
        <div className="is-accent">
          <small>ต้องการย้ายออก</small>
          <strong>{moveDay ? formatDateOnly(request.preferred_move_date) : 'ไม่ระบุ'}</strong>
        </div>
        <div className={expiringSoon ? 'is-warning' : ''}>
          <small>สัญญาเหลือ</small>
          <strong>{contractMsLeft === null ? '-' : contractMsLeft < 0 ? 'หมดสัญญาแล้ว' : formatDaysLeft(contractMsLeft)}</strong>
        </div>
        {isOpen && balance ? (
          <div className={outstanding > 0 ? 'is-danger' : balanceItems.length ? 'is-warning' : 'is-success'}>
            <small>ยอดค้างที่ต้องเคลียร์</small>
            <strong>{outstanding > 0 ? `฿${formatCurrency(outstanding)}` : balanceItems.length ? 'รอตรวจสลิป' : 'ไม่มี'}</strong>
          </div>
        ) : (
          <div>
            <small>สถานะ</small>
            <strong>{TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}</strong>
          </div>
        )}
      </div>

      {contractEnd && (
        <div className="staff-moveout-impact">
          <div className="staff-moveout-impact-row">
            <span>วันสิ้นสุดสัญญา</span>
            <strong>{formatDate(contractEnd)}</strong>
          </div>
          <div className="staff-moveout-impact-row">
            <span>ย้ายออกเทียบกับสัญญา</span>
            <strong className={leavesEarly ? 'is-danger' : moveDay ? 'is-success' : ''}>
              {!moveDay ? '-' : leavesEarly ? `ก่อนครบสัญญา ${daysEarly} วัน` : 'ครบสัญญาแล้ว'}
            </strong>
          </div>
          <div className="staff-moveout-impact-row">
            <span>เงินมัดจำที่ชำระไว้</span>
            <strong>
              {deposit > 0 ? `฿${formatCurrency(depositPaid)}${depositPaid < deposit ? ` จาก ฿${formatCurrency(deposit)}` : ''}` : 'ไม่มี'}
            </strong>
          </div>
          <div className="staff-moveout-impact-row">
            <span>เงินมัดจำหลังย้ายออก</span>
            <strong className={depositPaid > 0 && moveDay ? (leavesEarly ? 'is-danger' : 'is-success') : ''}>
              {depositPaid <= 0
                ? deposit > 0 ? 'ยังไม่ได้ชำระ · ไม่มียอดต้องคืน' : 'ไม่มีเงินมัดจำ'
                : !moveDay ? '-' : leavesEarly ? 'ริบ (ออกก่อนสัญญา)' : 'คืนหลังตรวจห้อง'}
            </strong>
          </div>
        </div>
      )}

      {isOpen && balanceItems.length > 0 && (
        <ul className="staff-renew-outstanding-list">
          {balanceItems.map((item, index) => (
            <li key={`${item.type}-${index}`}>
              <span>
                {item.label}
                {item.status === 'overdue' ? ' · เกินกำหนด' : item.status === 'pending' ? ' · รอตรวจสลิป' : ''}
              </span>
              <b>฿{formatCurrency(item.amount)}</b>
            </li>
          ))}
        </ul>
      )}

      {isOpen && (
        <div className={`staff-moveout-checklist${ready ? ' is-ready' : ''}`}>
          <strong>{ready ? 'พร้อมอนุมัติย้ายออก' : 'ก่อนอนุมัติย้ายออกต้องครบ'}</strong>
          <ul>
            <li className={inspected ? 'is-done' : ''}>{inspected ? 'ตรวจสภาพห้องแล้ว' : 'ยังไม่ได้ตรวจสภาพห้อง'}</li>
            <li className={balanceItems.length === 0 ? 'is-done' : ''}>
              {balanceItems.length === 0 ? 'ไม่มียอดค้างชำระ' : 'ผู้เช่ายังมียอดค้างหรือสลิปรอตรวจ'}
            </li>
          </ul>
        </div>
      )}

    </div>
  )
}

function TenantRequestDetailModal({ request, sourceRoom, actions, onClose }) {
  const isMove = request.type === 'move_room'
  const isOpen = ['pending', 'in_progress'].includes(request.status)
  const [openedAt] = useState(() => Date.now())
  const contractEnd = isOpen ? request.source_rental_end_date || sourceRoom?.rental_end_date : null
  const contractMsLeft = contractEnd ? new Date(contractEnd).getTime() - openedAt : null
  const rentDiff = isMove ? getRentDiff(request) : null
  const transferPreview = useRoomTransferPreview(request.id, isMove && isOpen)
  const rejected = request.status === 'rejected'
  const cancelled = request.status === 'cancelled'
  const finished = request.status === 'approved' || rejected || cancelled
  const progressSteps = [
    { key: 'request', label: 'ส่งคำขอ', by: `${request.first_name || ''} ${request.last_name || ''}`.trim(), date: request.created_at, icon: 'note' },
    {
      key: 'accept',
      label: 'เจ้าหน้าที่รับเรื่อง',
      by: request.accepted_by_name,
      date: request.accepted_at,
      icon: 'user',
      pendingText: 'กำลังรอดำเนินการ',
    },
    ...(request.type === 'moveout' && (['pending', 'in_progress', 'approved'].includes(request.status) || request.inspection_id)
      ? [{
          key: 'inspection',
          label: 'ตรวจสภาพห้อง',
          by: request.inspection_by_name,
          date: request.inspection_id ? request.inspection_reviewed_at : null,
          icon: 'check',
          pendingText: 'ยังไม่ได้ตรวจ',
        }]
      : []),
    {
      key: 'done',
      label: cancelled ? 'ยกเลิกคำขอ' : rejected ? 'ปฏิเสธคำขอ' : finished ? 'อนุมัติคำขอ' : 'รอผลการพิจารณา',
      by: request.completed_by_name,
      date: finished ? request.completed_at : null,
      icon: rejected || cancelled ? 'x' : 'check',
      tone: rejected || cancelled ? 'danger' : undefined,
      pendingText: 'ยังไม่ถึงขั้นตอนนี้',
    },
  ]
  return (
    <Modal
      title={`รายละเอียด${TENANT_REQUEST_TYPE_LABEL[request.type] || 'คำขอ'}`}
      onClose={onClose}
      variant="transfer-detail"
    >
      {() => isMove ? (
        <MoveRoomDetailBody
          request={request}
          isOpen={isOpen}
          rentDiff={rentDiff}
          transferPreview={transferPreview}
          contractEnd={contractEnd}
          contractMsLeft={contractMsLeft}
          progressSteps={progressSteps}
          finished={finished}
          actions={actions}
        />
      ) : (
        <div className="staff-transfer-body">
          <div className="staff-transfer-top">
            <div className="staff-req-detail-head">
              <span className={`staff-badge type-${request.type}`}>
                {TENANT_REQUEST_TYPE_LABEL[request.type] || request.type}
              </span>
              <span className={`staff-badge status-${request.status}`}>
                {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
              </span>
              <span className="staff-req-detail-date">
                <WaitingDetailIcon type="clock" size={16} />
                <span>
                  <small>ส่งคำขอ</small>
                  <strong>{formatDateTime(request.created_at)} น.</strong>
                </span>
              </span>
            </div>
            <div className="staff-req-detail-room is-summary">
                <span className="staff-req-detail-room-icon"><DoorIcon size={22} /></span>
                <div className="staff-req-detail-room-identity">
                  <small>{request.type === 'moveout' ? 'ห้องที่แจ้งย้ายออก' : 'ห้องพัก'}</small>
                  <strong>{request.room_number || '-'}</strong>
                </div>
                <div className="staff-req-detail-room-tenant">
                  <small>ผู้เช่า</small>
                  <span>{[request.first_name, request.last_name].filter(Boolean).join(' ') || '-'}</span>
                  {request.phone && (
                    <em className="staff-req-detail-room-phone">
                      <WaitingDetailIcon type="phone" size={13} />
                      {request.phone}
                    </em>
                  )}
                </div>
              </div>
            {request.type === 'moveout' && request.note && (
              <p className="staff-transfer-note">
                <span>เหตุผลการย้ายออก:</span> {request.note}
              </p>
            )}
          </div>

          <div className="staff-transfer-scroll">
            {request.type === 'renew' ? (
              <section className="staff-transfer-section">
                <h4 className="staff-transfer-section-title">ผู้เช่าและคำขอ</h4>
                <RenewRequestOverview request={request} contractEnd={contractEnd} contractMsLeft={contractMsLeft} isOpen={isOpen} />
                {request.note && (
                  <p className="staff-transfer-note">
                    <span>หมายเหตุ:</span> {request.note}
                  </p>
                )}
              </section>
            ) : (
              <section className="staff-transfer-section">
                <h4 className="staff-transfer-section-title">สัญญาและผลกระทบการย้ายออก</h4>
                <MoveOutRequestOverview request={request} contractEnd={contractEnd} contractMsLeft={contractMsLeft} isOpen={isOpen} />
              </section>
            )}

            {request.type === 'moveout'
              && (request.inspection_id || ['pending', 'in_progress'].includes(request.status)) && (
              <InspectionSummary
                inspectionId={request.inspection_id}
                roomNumber={request.room_number}
                tenantName={`${request.first_name || ''} ${request.last_name || ''}`.trim()}
              />
            )}

            <section className="staff-transfer-section">
              <h4 className="staff-transfer-section-title">ขั้นตอนการดำเนินการ</h4>
              <ProcessSteps
                actorClassName="staff-actor"
                startDate={request.created_at}
                endDate={finished ? request.completed_at : null}
                steps={progressSteps}
              />
            </section>
          </div>

          {isOpen && actions && (
            <div className="staff-transfer-footer">
              <div className="staff-form-actions">{actions}</div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

const CHECKLIST_RESULT_LABEL = Object.fromEntries(CHECKLIST_RESULT_OPTIONS.map((option) => [option.key, option.label]))

const TARGET_ROOM_AMENITIES = [
  { key: 'air_conditioner', label: 'แอร์' },
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'refrigerator', label: 'ตู้เย็น' },
  { key: 'bathroom', label: 'ห้องน้ำในตัว' },
]

function getRentDiff(request) {
  const from = Number(request.source_room_price)
  const to = Number(request.target_room_price)
  if (!Number.isFinite(from) || !Number.isFinite(to) || request.source_room_price == null || request.target_room_price == null) {
    return null
  }
  return to - from
}

function useRoomTransferPreview(requestId, enabled = true) {
  const [state, setState] = useState({ preview: null, loading: enabled, error: '' })
  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    axios
      .get(`/api/staff/requests/${requestId}/transfer-preview`)
      .then(({ data }) => {
        if (active) setState({ preview: data.preview, loading: false, error: '' })
      })
      .catch((err) => {
        if (active) {
          setState({
            preview: null,
            loading: false,
            error: err.response?.data?.message || 'ไม่สามารถคำนวณรายละเอียดการย้ายห้องได้',
          })
        }
      })
    return () => {
      active = false
    }
  }, [requestId, enabled])
  return enabled ? state : { preview: null, loading: false, error: '' }
}

const TRANSFER_CHARGE_STATUS_TEXT = {
  not_sent: 'มีค่าเช่าหรือมัดจำที่ต้องเก็บเพิ่ม ต้องส่งยอดให้ผู้เช่าชำระก่อนทำสัญญา',
  unpaid: 'ส่งยอดแล้ว รอผู้เช่าชำระ',
  verifying: 'ผู้เช่าส่งสลิปแล้ว รอตรวจสลิป',
  paid: 'ชำระแล้ว พร้อมทำสัญญา',
}

function buildMoveRoomChecks(request, preview) {
  const outstandingItems = preview.outstanding?.items ?? []
  const targetNumber = preview.target_room?.room_number ?? request.target_room_number
  const targetFree = preview.target_room ? !preview.target_room.is_booked : false
  const contractExpired = preview.blockers.some((message) => message.includes('หมดอายุ'))
  const checks = [
    {
      key: 'inspection',
      label: `ตรวจสภาพห้อง ${request.room_number}`,
      ok: Boolean(request.inspection_id),
      detail: request.inspection_id
        ? `ตรวจแล้ว${request.inspection_by_name ? ` โดย ${request.inspection_by_name}` : ''}`
        : 'ยังไม่ได้ตรวจ กดปุ่ม "ตรวจห้องก่อนย้าย" ด้านล่าง',
    },
    {
      key: 'outstanding',
      label: 'ยอดค้างชำระของห้องเดิม',
      ok: outstandingItems.length === 0,
      detail: outstandingItems.length === 0
        ? 'ไม่มียอดค้าง'
        : outstandingItems
            .map((item) => `${item.label} ฿${formatCurrency(item.amount)}${item.status === 'pending' ? ' (สลิปรอตรวจ)' : ''}`)
            .join(', '),
      hint: outstandingItems.length > 0 ? 'ผู้เช่าต้องชำระให้ครบ หรือตรวจสลิปให้เรียบร้อยก่อนอนุมัติ' : null,
    },
    {
      key: 'target',
      label: `ห้อง ${targetNumber} ว่าง`,
      ok: targetFree,
      detail: targetFree ? 'พร้อมย้ายเข้า' : 'มีผู้เช่าแล้ว ต้องปฏิเสธคำขอหรือให้ผู้เช่าเลือกห้องใหม่',
    },
    {
      key: 'contract',
      label: 'สัญญาเช่ายังไม่หมดอายุ',
      ok: !contractExpired,
      detail: contractExpired ? 'สัญญาหมดอายุแล้ว ย้ายห้องไม่ได้' : 'สัญญายังมีผล',
    },
    ...(preview.transfer_charge?.required
      ? [{
          key: 'charge',
          label: `ผู้เช่าชำระมัดจำเพิ่ม ฿${formatCurrency(preview.transfer_charge.amount)}`,
          ok: preview.transfer_charge.status === 'paid',
          detail: TRANSFER_CHARGE_STATUS_TEXT[preview.transfer_charge.status],
          hint: preview.transfer_charge.due_at && preview.transfer_charge.status !== 'paid'
            ? `ต้องชำระภายใน ${formatDateTime(preview.transfer_charge.due_at)} ไม่เช่นนั้นระบบจะยกเลิกคำขอย้ายห้อง`
            : null,
        }]
      : []),
  ]
  const knownMessages = ['ตรวจห้อง', 'ยอดค้าง', 'สลิป', 'มีผู้เช่าแล้ว', 'หมดอายุ', 'ห้องปลายทาง']
  const otherBlockers = preview.blockers.filter((message) => !knownMessages.some((word) => message.includes(word)))
  const remaining = checks.filter((check) => !check.ok).length + otherBlockers.length
  return { checks, otherBlockers, remaining }
}

function TrdCard({ icon, title, hint, badge, tone, className = '', children }) {
  return (
    <section className={`trd-card${tone ? ` is-${tone}` : ''}${className ? ` ${className}` : ''}`}>
      <header className="trd-card-head">
        <span className="trd-card-icon" aria-hidden="true"><WaitingDetailIcon type={icon} size={16} /></span>
        <div className="trd-card-title">
          <h4>{title}</h4>
          {hint && <small>{hint}</small>}
        </div>
        {badge}
      </header>
      {children}
    </section>
  )
}

function TrdState({ tone = 'muted', children }) {
  return (
    <p className={`trd-state is-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {tone === 'loading' && <span className="trd-spinner" aria-hidden="true" />}
      {children}
    </p>
  )
}

function TrdSourceTag({ estimate }) {
  return (
    <span className={`trd-source${estimate ? ' is-estimate' : ''}`}>
      {estimate ? 'ประมาณการจากระบบ · ยืนยันตอนอนุมัติ' : 'ข้อมูลที่บันทึกแล้ว'}
    </span>
  )
}

function MoveRoomDetailHero({ request, rentDiff, preview, isOpen }) {
  const targetBooked = preview?.target_room ? Boolean(preview.target_room.is_booked) : request.target_room_is_booked == null ? null : Boolean(request.target_room_is_booked)
  const tenantName = [request.first_name, request.last_name].filter(Boolean).join(' ') || '-'
  return (
    <header className="trd-hero">
      <div className="trd-hero-head">
        <div className="trd-person">
          <span className="trd-avatar" aria-hidden="true"><WaitingDetailIcon type="user" size={20} /></span>
          <div>
            <small>ผู้เช่าที่ขอย้ายห้อง</small>
            <strong>{tenantName}</strong>
            {request.phone ? (
              <a href={`tel:${request.phone}`} className="trd-phone">
                <WaitingDetailIcon type="phone" size={13} />
                {request.phone}
              </a>
            ) : (
              <span className="trd-phone is-empty">ไม่มีเบอร์โทร</span>
            )}
          </div>
        </div>
        <div className="trd-hero-meta">
          <span className={`staff-badge status-${request.status}`}>
            {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
          </span>
          <span className="trd-submitted">
            <WaitingDetailIcon type="clock" size={13} />
            ส่งคำขอ {formatDateTime(request.created_at)} น.
          </span>
        </div>
      </div>
      <div className="trd-route">
        <div className="trd-room is-source">
          <small>ห้องเดิม</small>
          <strong>{request.room_number || '-'}</strong>
          <span>{request.source_room_price != null ? <>฿{formatCurrency(request.source_room_price)}<em>/เดือน</em></> : 'ไม่มีข้อมูลราคา'}</span>
        </div>
        <div className="trd-route-mid" aria-hidden={rentDiff === null}>
          <span className="trd-route-arrow"><RouteArrowIcon /></span>
          {rentDiff !== null && (
            <span className={`trd-diff ${rentDiff > 0 ? 'is-up' : rentDiff < 0 ? 'is-down' : 'is-same'}`}>
              {rentDiff === 0 ? 'ค่าเช่าเท่าเดิม' : `${rentDiff > 0 ? '+' : '-'}฿${formatCurrency(Math.abs(rentDiff))}/เดือน`}
            </span>
          )}
        </div>
        <div className={`trd-room is-target${isOpen && targetBooked ? ' is-blocked' : ''}`}>
          <small>ห้องใหม่</small>
          <strong>{request.target_room_number || '-'}</strong>
          <span>{request.target_room_price != null ? <>฿{formatCurrency(request.target_room_price)}<em>/เดือน</em></> : 'ไม่มีข้อมูลราคา'}</span>
          {isOpen && targetBooked !== null && (
            <b className={`trd-availability ${targetBooked ? 'is-danger' : 'is-success'}`}>
              {targetBooked ? 'ไม่ว่างแล้ว' : 'ยังว่าง'}
            </b>
          )}
        </div>
      </div>
    </header>
  )
}

function MoveRoomDecision({ request, preview, loading, error }) {
  if (loading) return <TrdState tone="loading">กำลังตรวจสอบความพร้อมและคำนวณยอด... ตัวเลขด้านล่างจะแสดงเมื่อคำนวณเสร็จ</TrdState>
  if (error || !preview) return <TrdState tone="danger">{error || 'ไม่สามารถตรวจสอบเงื่อนไขการย้ายห้องได้'}</TrdState>
  const { checks, otherBlockers, remaining } = buildMoveRoomChecks(request, preview)
  const todos = [
    ...checks.filter((check) => !check.ok),
    ...otherBlockers.map((message) => ({ key: message, label: message })),
  ]
  const passed = checks.filter((check) => check.ok)
  return (
    <section className={`trd-decision ${preview.can_approve ? 'is-ready' : 'is-blocked'}`} aria-live="polite">
      <div className="trd-decision-head">
        <span className="trd-decision-icon" aria-hidden="true">{preview.can_approve ? '✓' : '!'}</span>
        <div>
          <strong>{preview.can_approve ? 'พร้อมอนุมัติย้ายห้อง' : `ยังอนุมัติไม่ได้ · ขาดอีก ${remaining} ข้อ`}</strong>
          <small>{preview.can_approve ? 'ผ่านเงื่อนไขครบทุกข้อ กดอนุมัติได้ที่ปุ่มด้านล่าง' : 'ดูรายการที่ต้องจัดการในเช็กลิสต์ด้านล่าง'}</small>
        </div>
      </div>
      {todos.length > 0 && (
        <div className="trd-check-group is-todo">
          <p className="trd-check-group-title">ต้องจัดการ <em>{todos.length}</em></p>
          <ol className="trd-checks">
            {todos.map((check, index) => (
              <li key={check.key} className="is-todo">
                <span className="trd-check-icon" aria-hidden="true">{index + 1}</span>
                <span>
                  <strong>{check.label}</strong>
                  {check.detail && <small>{check.detail}</small>}
                  {check.hint && <small className="is-hint">{check.hint}</small>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {passed.length > 0 && (
        <div className="trd-check-group is-ok">
          <p className="trd-check-group-title">ผ่านแล้ว <em>{passed.length}</em></p>
          <ul className="trd-checks is-compact">
            {passed.map((check) => (
              <li key={check.key} className="is-ok">
                <span className="trd-check-icon" aria-hidden="true">✓</span>
                <span>
                  <strong>{check.label}</strong>
                  <small>{check.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function MoveRoomCompare({ request, preview }) {
  const source = preview?.source_room
  const target = preview?.target_room
  const pick = (room, key, fallback) => (room ? room[key] : fallback)
  const rows = [
    { label: 'ค่าเช่า', unit: '/เดือน', money: true, from: pick(source, 'price', request.source_room_price), to: pick(target, 'price', request.target_room_price) },
    { label: 'ค่าไฟ', unit: '/หน่วย', money: true, from: source?.electricity_unit_price, to: pick(target, 'electricity_unit_price', request.target_room_electricity_unit_price) },
    { label: 'ค่าน้ำ', unit: '/เดือน', money: true, from: source?.water_price, to: pick(target, 'water_price', request.target_room_water_price) },
    { label: 'ขนาดห้อง', unit: ' ตร.ม.', from: pick(source, 'room_size', request.source_room_size), to: pick(target, 'room_size', request.target_room_size) },
  ]
  const show = (row, value) => {
    if (value == null) return '-'
    return row.money ? `฿${formatCurrency(value)}` : `${formatPlainNumber(value)}${row.unit}`
  }
  const change = (row) => {
    if (row.from == null || row.to == null) return { label: '-', tone: 'is-muted' }
    const diff = Number(row.to) - Number(row.from)
    if (diff === 0) return { label: 'เท่าเดิม', tone: 'is-muted' }
    const text = row.money ? `${diff > 0 ? '+' : '-'}฿${formatCurrency(Math.abs(diff))}` : `${diff > 0 ? '+' : '-'}${formatPlainNumber(Math.abs(diff))}${row.unit}`
    const worse = row.money ? diff > 0 : diff < 0
    return { label: text, tone: worse ? 'is-warning' : 'is-success' }
  }
  const amenityState = TARGET_ROOM_AMENITIES.map((item) => ({
    ...item,
    from: source ? Boolean(source[item.key]) : null,
    to: Boolean(pick(target, item.key, request[`target_room_${item.key}`])),
  }))
  const gained = amenityState.filter((item) => item.from === false && item.to)
  const lost = amenityState.filter((item) => item.from && !item.to)
  const kept = amenityState.filter((item) => item.to && (item.from || item.from === null))
  return (
    <TrdCard icon="home" title="เปรียบเทียบห้องเดิมกับห้องใหม่" hint={source ? undefined : 'ข้อมูลห้องเดิมบางส่วนแสดงได้เฉพาะคำขอที่ยังเปิดอยู่'}>
      <div className="trd-compare" role="table" aria-label="เปรียบเทียบห้อง">
        <div className="trd-compare-row is-head" role="row">
          <span role="columnheader">รายการ</span>
          <span role="columnheader">ห้อง {request.room_number}</span>
          <span role="columnheader">ห้อง {request.target_room_number}</span>
          <span role="columnheader">เปลี่ยนแปลง</span>
        </div>
        {rows.map((row) => {
          const delta = change(row)
          return (
            <div className="trd-compare-row" role="row" key={row.label}>
              <span role="rowheader">{row.label}{row.money && <small>{row.unit}</small>}</span>
              <span role="cell">{show(row, row.from)}</span>
              <span role="cell" className="is-target">{show(row, row.to)}</span>
              <span role="cell"><b className={`trd-delta ${delta.tone}`}>{delta.label}</b></span>
            </div>
          )
        })}
      </div>
      <div className="trd-amenities">
        <small>สิ่งอำนวยความสะดวกห้องใหม่</small>
        <div>
          {kept.map((item) => <span key={item.key} className="trd-tag">{item.label}</span>)}
          {gained.map((item) => <span key={item.key} className="trd-tag is-gain">+ {item.label}</span>)}
          {lost.map((item) => <span key={item.key} className="trd-tag is-loss">ไม่มี{item.label}</span>)}
          {kept.length + gained.length + lost.length === 0 && <span className="trd-muted">ไม่มีข้อมูล</span>}
        </div>
        {source && gained.length === 0 && lost.length === 0 && <small className="trd-muted">เหมือนห้องเดิมทุกอย่าง</small>}
      </div>
    </TrdCard>
  )
}

function MoveRoomSettlement({ preview, loading, error }) {
  if (loading) {
    return (
      <TrdCard icon="wallet" title="เงินมัดจำและยอดที่ต้องชำระ" badge={<TrdSourceTag estimate />}>
        <TrdState tone="loading">กำลังคำนวณเงินมัดจำและค่าเช่าตามวันที่เหลือ...</TrdState>
      </TrdCard>
    )
  }
  if (error || !preview) {
    return (
      <TrdCard icon="wallet" title="เงินมัดจำและยอดที่ต้องชำระ" tone="danger">
        <TrdState tone="danger">{error || 'ไม่สามารถคำนวณรายละเอียดการย้ายห้องได้'}</TrdState>
      </TrdCard>
    )
  }
  const charge = Number(preview.settlement.additional_charge) || 0
  const chargeSent = Boolean(preview.transfer_charge?.required && preview.transfer_charge.status !== 'not_sent')
  return (
    <TrdCard
      icon="wallet"
      title="เงินมัดจำและยอดที่ต้องชำระ"
      hint={charge > 0 && preview.transfer_charge?.status ? TRANSFER_CHARGE_STATUS_TEXT[preview.transfer_charge.status] : undefined}
      tone={charge > 0 && preview.transfer_charge?.status !== 'paid' ? 'danger' : undefined}
      badge={<TrdSourceTag estimate={!chargeSent} />}
    >
      <RoomTransferFinance
        finance={preview.settlement}
        fromPrice={preview.source_room?.price}
        toPrice={preview.target_room?.price}
        chargeStatus={preview.transfer_charge?.status === 'paid' ? 'paid' : null}
      />
    </TrdCard>
  )
}

function MoveRoomContractCard({ request, preview, loading, contractEnd, contractMsLeft }) {
  const contract = preview?.contract
  const targetPrice = preview?.target_room?.price ?? request.target_room_price
  const endDate = contract?.effective_end_date || contractEnd
  const changes = [
    `สัญญาเปลี่ยนเป็นห้อง ${request.target_room_number}${targetPrice != null ? ` ค่าเช่า ฿${formatCurrency(targetPrice)}/เดือน` : ''}`,
    'วันสิ้นสุดสัญญาเท่าเดิม',
    'เงินมัดจำเดิมโอนไปเป็นมัดจำห้องใหม่ ส่วนเกินเก็บเป็นเครดิตมัดจำที่คืนได้',
    preview?.new_price_from ? `เริ่มคิดราคาใหม่ตั้งแต่รอบ ${formatDate(preview.new_price_from)}` : 'เริ่มคิดราคาใหม่ตั้งแต่รอบถัดไป',
    'รูปสัญญาที่เซ็นไว้ไม่ถูกแก้ไข ระบบบันทึกการย้ายแนบท้ายสัญญาให้',
  ]
  return (
    <TrdCard
      icon="calendar"
      title="สัญญาปัจจุบันและผลหลังอนุมัติ"
      className="trd-contract"
      badge={contract && <ContractStatusBadge status={contract.status} />}
    >
      {loading ? (
        <TrdState tone="loading">กำลังโหลดสัญญาเช่า...</TrdState>
      ) : !contract ? (
        <TrdState>ไม่พบสัญญาเช่าที่ทำสำเร็จของผู้เช่าคนนี้</TrdState>
      ) : (
        <dl className="trd-facts">
          <div><dt>เลขที่สัญญา</dt><dd>#{contract.booking_id}</dd></div>
          <div><dt>ห้องตามสัญญา</dt><dd>ห้อง {contract.room_number || '-'}</dd></div>
          <div><dt>ค่าเช่าตามสัญญา</dt><dd>฿{formatCurrency(contract.monthly_price)}/เดือน</dd></div>
          <div><dt>ระยะสัญญา</dt><dd>{contract.contract_duration_months ? `${contract.contract_duration_months} เดือน` : '-'}</dd></div>
          <div><dt>เริ่ม → สิ้นสุด</dt><dd>{formatDate(contract.rental_start_date)} → {formatDate(contract.effective_end_date || contract.rental_end_date)}</dd></div>
          <div>
            <dt>เหลือเวลา</dt>
            <dd className={contractMsLeft !== null && contractMsLeft <= ROOM_EXPIRY_WARNING_WINDOW_MS ? 'is-danger' : ''}>
              {contractMsLeft === null ? '-' : contractMsLeft < 0 ? 'หมดสัญญาแล้ว' : formatDaysLeft(contractMsLeft)}
            </dd>
          </div>
          <div><dt>ค่าเช่าชำระแล้ว</dt><dd className="is-success">฿{formatCurrency(contract.rent_paid)}</dd></div>
          <div><dt>คงเหลือตามสัญญา</dt><dd>฿{formatCurrency(contract.contract_remaining)}</dd></div>
          {preview?.coverage?.paid_through && <div><dt>ชำระค่าเช่าถึง</dt><dd className="is-success">{formatDate(preview.coverage.paid_through)}</dd></div>}
          <div><dt>ทำสัญญาเมื่อ</dt><dd>{formatDate(contract.contract_completed_at || contract.created_at)}</dd></div>
        </dl>
      )}
      {!contract && !loading && endDate && <p className="trd-muted">สิ้นสุดสัญญา {formatDate(endDate)}</p>}
      <div className="trd-after">
        <strong>หลังอนุมัติจะเกิดอะไรขึ้น</strong>
        <ul>
          {changes.map((text) => <li key={text}>{text}</li>)}
        </ul>
      </div>
      {contract && (
        <>
          <div className="trd-gallery">
            <small>รูปสัญญาที่เซ็นแล้ว · {(contract.images || []).length} รูป · คลิกรูปเพื่อดูขนาดเต็ม</small>
            <ContractGallery images={contract.images || []} subtitle={`ห้อง ${contract.room_number || '-'} · ${request.first_name || ''} ${request.last_name || ''}`} />
          </div>
          <ContractTransferHistory contract={contract} />
        </>
      )}
    </TrdCard>
  )
}

function SectionFilter({ sections, value, onChange }) {
  return (
    <div className="trd-filter" role="tablist" aria-label="กรองหัวข้อ">
      {sections.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          className={value === item.key ? 'is-active' : ''}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function MoveRoomDetailBody({ request, isOpen, rentDiff, transferPreview, contractEnd, contractMsLeft, progressSteps, finished, actions }) {
  const { preview, loading, error } = transferPreview
  const tenantName = `${request.first_name || ''} ${request.last_name || ''}`.trim()
  const [section, setSection] = useState('all')
  const hasInspection = Boolean(request.inspection_id || isOpen)
  const sections = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'overview', label: 'ภาพรวมคำขอ' },
    isOpen && { key: 'money', label: 'เงินมัดจำและยอดชำระ' },
    { key: 'rooms', label: 'เปรียบเทียบห้อง' },
    isOpen && { key: 'contract', label: 'สัญญา' },
    hasInspection && { key: 'inspection', label: 'ผลตรวจห้อง' },
  ].filter(Boolean)
  const show = (key) => section === 'all' || section === key
  return (
    <div className="trd">
      <div className="trd-scroll">
        <MoveRoomDetailHero request={request} rentDiff={rentDiff} preview={preview} isOpen={isOpen} />

        <SectionFilter sections={sections} value={section} onChange={setSection} />

        <div className={`trd-note${request.note ? '' : ' is-empty'}`}>
          <small>หมายเหตุจากผู้เช่า</small>
          <p>{request.note || 'ผู้เช่าไม่ได้ระบุหมายเหตุ'}</p>
        </div>

        {show('overview') && (
          <>
            <TrdCard icon="clock" title="ขั้นตอนการดำเนินการ">
              <ProcessSteps
                actorClassName="staff-actor"
                startDate={request.created_at}
                endDate={finished ? request.completed_at : null}
                steps={progressSteps}
              />
            </TrdCard>

            {isOpen && <MoveRoomDecision request={request} preview={preview} loading={loading} error={error} />}

            <dl className="trd-request-strip" aria-label="รายละเอียดคำขอ">
              <div>
                <dt><WaitingDetailIcon type="info" size={14} />เหตุผล</dt>
                <dd>{MOVE_ROOM_REASON_LABEL[request.move_reason] || '-'}</dd>
              </div>
              <div>
                <dt><WaitingDetailIcon type="calendar" size={14} />ต้องการย้าย</dt>
                <dd>{formatDateOnly(request.preferred_move_date)}</dd>
              </div>
              <div>
                <dt><WaitingDetailIcon type="clock" size={14} />ส่งคำขอ</dt>
                <dd>{formatDateTime(request.created_at)}</dd>
              </div>
              <div>
                <dt><WaitingDetailIcon type="user" size={14} />รับเรื่องโดย</dt>
                <dd>{request.accepted_by_name || 'ยังไม่มีผู้รับเรื่อง'}</dd>
              </div>
            </dl>
          </>
        )}

        {isOpen && show('money') && <MoveRoomSettlement preview={preview} loading={loading} error={error} />}
        {show('rooms') && <MoveRoomCompare request={request} preview={preview} />}
        {isOpen && show('contract') && (
          <MoveRoomContractCard
            request={request}
            preview={preview}
            loading={loading}
            contractEnd={contractEnd}
            contractMsLeft={contractMsLeft}
          />
        )}

        {hasInspection && show('inspection') && (
          <div className={`trd-inspection${!request.inspection_id && isOpen ? ' is-missing' : ''}`}>
            <InspectionSummary inspectionId={request.inspection_id} roomNumber={request.room_number} tenantName={tenantName} />
          </div>
        )}
      </div>

      {isOpen && actions && (
        <footer className="trd-actions">
          <span className="trd-actions-hint">
            {loading
              ? 'กำลังตรวจสอบเงื่อนไข...'
              : preview?.can_approve
                ? 'ผ่านเงื่อนไขครบแล้ว'
                : !request.inspection_id
                  ? 'ต้องตรวจห้องก่อนอนุมัติ'
                  : 'ตรวจเช็กลิสต์ด้านบนก่อนอนุมัติ'}
          </span>
          <div className="staff-form-actions">{actions}</div>
        </footer>
      )}
    </div>
  )
}

function InspectionSummary({ inspectionId, roomNumber, tenantName }) {
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(Boolean(inspectionId))
  const [loadError, setLoadError] = useState('')
  const [photoIndex, setPhotoIndex] = useState(null)
  const [view, setView] = useState('latest')

  useEffect(() => {
    if (!inspectionId) return undefined
    let active = true
    axios
      .get(`/api/staff/move-out-inspections/${inspectionId}`)
      .then(({ data }) => {
        if (active) setInspection(data.inspection)
      })
      .catch((err) => {
        if (active) setLoadError(err.response?.data?.message || 'โหลดผลตรวจห้องไม่สำเร็จ')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [inspectionId])

  const checklist = inspection?.checklist || {}
  const resultCounts = CHECKLIST_RESULT_OPTIONS.map((option) => ({
    ...option,
    count: Object.values(checklist).filter((value) => value === option.key).length,
  })).filter((option) => option.count > 0)
  const issueItems = MOVE_OUT_CHECKLIST.filter((item) => ['damaged', 'missing'].includes(checklist[item.key]))
  const photos = inspection?.photos || []

  return (
    <section className="staff-transfer-section staff-transfer-inspection">
      <div className="staff-transfer-section-head">
        <h4 className="staff-transfer-section-title">ผลตรวจห้อง {roomNumber}</h4>
        {inspection && (
          <span className={`staff-transfer-chip ${issueItems.length > 0 ? 'is-danger' : 'is-success'}`}>
            {issueItems.length > 0 ? `พบปัญหา ${issueItems.length} รายการ` : 'สภาพเรียบร้อย'}
          </span>
        )}
      </div>
      {!inspectionId ? (
        <p className="staff-transfer-muted">ยังไม่มีผลตรวจห้อง</p>
      ) : loading ? (
        <p className="staff-transfer-muted">กำลังโหลดผลตรวจห้อง...</p>
      ) : loadError ? (
        <p className="staff-form-error">{loadError}</p>
      ) : inspection ? (
        <>
          <div className="mic-view-toggle" role="group" aria-label="มุมมองผลตรวจ">
            {[
              { key: 'latest', label: 'ผลตรวจล่าสุด' },
              { key: 'compare', label: 'ผลตรวจก่อนเข้าอยู่' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={view === item.key ? 'is-active' : ''}
                aria-pressed={view === item.key}
                onClick={() => setView(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {view === 'compare' ? (
            <MoveInComparison baseline={inspection.move_in_baseline} latest={inspection} />
          ) : (
          <>
          <p className="staff-insp-meta">
            ตรวจเมื่อ {formatDateTime(inspection.updated_at || inspection.reviewed_at || inspection.created_at)}
            {inspection.inspected_by_name && (
              <>
                {' · โดย '}
                <span className="staff-actor">{inspection.inspected_by_name}</span>
              </>
            )}
          </p>
          {resultCounts.length > 0 && (
            <div className="staff-insp-summary">
              {resultCounts.map((option) => (
                <span key={option.key} className={`staff-insp-count result-${option.key}`}>
                  <strong>{option.count}</strong>
                  <small>{option.label}</small>
                </span>
              ))}
            </div>
          )}
          <ul className="staff-insp-checklist">
            {MOVE_OUT_CHECKLIST.map((item) => {
              const [title, detail] = item.label.split(' (')
              const result = checklist[item.key]
              return (
                <li key={item.key} className={`result-${result || 'none'}`}>
                  <span className="staff-insp-item">
                    <span>{title}</span>
                    {detail && <small>{detail.replace(/\)$/, '')}</small>}
                  </span>
                  <strong className={`staff-insp-badge result-${result || 'none'}`}>{CHECKLIST_RESULT_LABEL[result] || '-'}</strong>
                </li>
              )
            })}
          </ul>
          {inspection.tenant_request_type === 'move_room' && (
            <p className="idt-damage-cost">
              ค่าเสียหายที่หักจากเงินมัดจำ{' '}
              <b>{Number(inspection.damage_cost) > 0 ? `฿${formatCurrency(inspection.damage_cost)}` : 'ไม่มี'}</b>
            </p>
          )}
          {inspection.damage_note && (
            <div className={`staff-insp-note${issueItems.length > 0 ? ' is-issue' : ''}`}>
              <strong>{issueItems.length > 0 ? 'รายละเอียดความเสียหาย' : 'หมายเหตุจากการตรวจ'}</strong>
              <p>{inspection.damage_note}</p>
            </div>
          )}
          {photos.length > 0 ? (
            <div className="staff-insp-gallery">
              <div className="staff-insp-gallery-head">
                <strong>รูปประกอบ <span>{photos.length} รูป</span></strong>
                <small>คลิกรูปเพื่อดูขนาดเต็ม</small>
              </div>
              <div className="staff-insp-photos">
                {photos.slice(0, 8).map((photo, index) => (
                  <button
                    type="button"
                    key={photo.url}
                    className="staff-insp-photo"
                    onClick={() => setPhotoIndex(index)}
                    aria-label={`ดูรูปตรวจห้อง ${index + 1}`}
                  >
                    <UploadImage src={photo.url} alt="" />
                    {index === 7 && photos.length > 8 && <span>+{photos.length - 8}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="staff-transfer-muted">ไม่มีรูปถ่าย</p>
          )}
          </>
          )}
        </>
      ) : null}
      {photoIndex !== null &&
        createPortal(
          <PhotoLightbox
            photos={photos.map((photo, index) => ({ name: photo.name || `รูปที่ ${index + 1}`, url: photo.url }))}
            initialIndex={photoIndex}
            title={`ผลตรวจห้อง ${roomNumber}`}
            subtitle={tenantName}
            label="รูปตรวจห้อง"
            onClose={() => setPhotoIndex(null)}
          />,
          document.body,
        )}
    </section>
  )
}

function TransferSettlementSection({ preview, loading, loadError }) {
  if (loading) {
    return (
      <section className="staff-transfer-section">
        <h4 className="staff-transfer-section-title">ผลต่อเงินมัดจำและยอดชำระ</h4>
        <p className="staff-transfer-muted">กำลังคำนวณเงินมัดจำและค่าเช่าตามวันที่เหลือ...</p>
      </section>
    )
  }
  if (loadError || !preview) {
    return (
      <section className="staff-transfer-section is-danger">
        <h4 className="staff-transfer-section-title">ผลต่อเงินมัดจำและยอดชำระ</h4>
        <p className="staff-form-error">{loadError || 'ไม่สามารถคำนวณรายละเอียดการย้ายห้องได้'}</p>
      </section>
    )
  }
  const targetPrice = Number(preview.target_room?.price) || 0
  const outcomes = [
    `สัญญาเดิมจะเปลี่ยนเป็นห้อง ${preview.target_room?.room_number} ค่าเช่า ฿${formatCurrency(targetPrice)}/เดือน วันสิ้นสุดสัญญาเท่าเดิม`,
    preview.new_price_from
      ? `เริ่มคิดค่าเช่าราคาใหม่ตั้งแต่รอบ ${formatDate(preview.new_price_from)} เป็นต้นไป`
      : 'เริ่มคิดค่าเช่าราคาใหม่ตั้งแต่รอบถัดไป',
    'เงินมัดจำเดิมโอนไปเป็นเงินมัดจำห้องใหม่ ไม่นำไปหักค่าเช่า',
    Number(preview.settlement.additional_charge) > 0 &&
      `ผู้เช่าต้องชำระมัดจำเพิ่ม ฿${formatCurrency(preview.settlement.additional_charge)} ภายใน ${preview.transfer_charge?.days ?? 3} วันก่อนทำสัญญาย้ายห้อง ถ้าไม่ชำระระบบจะยกเลิกคำขอ`,
    Number(preview.settlement.rent_charge) > 0 &&
      `หลังย้ายสำเร็จ ระบบส่งบิลส่วนต่างค่าเช่าเดือนที่ย้ายเข้า ฿${formatCurrency(preview.settlement.rent_charge)} ให้ผู้เช่า จากนั้นเก็บค่าเช่ารายเดือนตามปกติ`,
  ].filter(Boolean)

  return (
    <section className="staff-transfer-section">
      <h4 className="staff-transfer-section-title">ผลต่อเงินมัดจำและยอดชำระ</h4>
      <RoomTransferFinance
        finance={preview.settlement}
        fromPrice={preview.source_room?.price}
        toPrice={preview.target_room?.price}
        chargeStatus={preview.transfer_charge?.status === 'paid' ? 'paid' : null}
      />
      <ul className="staff-transfer-outcomes">
        {outcomes.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </section>
  )
}

export function TransferContractPendingPanel({ apiBase, refreshKey = 0 }) {
  const [transfers, setTransfers] = useState([])
  const [active, setActive] = useState(null)
  const [files, setFiles] = useState([])
  const [fileError, setFileError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    axios
      .get(`${apiBase}/room-transfers/pending-contracts`, { signal: controller.signal })
      .then(({ data }) => setTransfers(data.transfers || []))
      .catch(() => {})
    return () => controller.abort()
  }, [apiBase, refreshKey, version])

  const changeFiles = (next) => {
    const invalid = next.map(validateImageFile).find(Boolean)
    if (invalid) return setFileError(invalid)
    if (next.length > CONTRACT_MAX_IMAGES) return setFileError(`แนบรูปสัญญาได้ไม่เกิน ${CONTRACT_MAX_IMAGES} รูป`)
    setFileError('')
    setFiles(next)
  }

  const submit = async (requestClose) => {
    if (files.length < ROOM_TRANSFER_MIN_CONTRACT_IMAGES) {
      setFileError(`กรุณาแนบรูปสัญญาใหม่อย่างน้อย ${ROOM_TRANSFER_MIN_CONTRACT_IMAGES} รูป (แนบแล้ว ${files.length} รูป)`)
      return
    }
    setBusy(true)
    try {
      const body = new FormData()
      files.forEach((file) => body.append('contract_images', file))
      const { data } = await axios.post(`${apiBase}/room-transfers/${active.id}/contract-images`, body)
      setNotice(data.message || 'แนบรูปสัญญาใหม่เรียบร้อยแล้ว')
      requestClose()
      setVersion((value) => value + 1)
    } catch (error) {
      setFileError(error.response?.data?.message || 'แนบรูปสัญญาไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (transfers.length === 0 && !notice) return null
  return (
    <section className="staff-transfer-pending" aria-label="ย้ายห้องอัตโนมัติที่รอแนบสัญญาใหม่">
      <div className="staff-transfer-pending-head">
        <strong>ย้ายห้องอัตโนมัติแล้ว · รอแนบรูปสัญญาใหม่</strong>
        <span>ระบบย้ายห้องให้ทันทีเมื่อชำระยอดย้ายห้องและตรวจสลิปผ่าน กรุณาแนบรูปสัญญาที่เซ็นใหม่อย่างน้อย {ROOM_TRANSFER_MIN_CONTRACT_IMAGES} รูป</span>
      </div>
      {notice && <p className="staff-transfer-pending-notice">{notice}</p>}
      <ul className="staff-transfer-pending-list">
        {transfers.map((transfer) => (
          <li key={transfer.id}>
            <span>
              <strong>
                ห้อง {transfer.from_room_number} → {transfer.to_room_number}
              </strong>
              <small>
                {`${transfer.first_name || ''} ${transfer.last_name || ''}`.trim()}
                {transfer.phone ? ` · ${transfer.phone}` : ''} · ย้ายเมื่อ {formatDateTime(transfer.transferred_at)}
              </small>
            </span>
            <button
              type="button"
              className="staff-action-btn is-primary"
              onClick={() => {
                setActive(transfer)
                setFiles([])
                setFileError('')
                setNotice('')
              }}
            >
              แนบสัญญาใหม่
            </button>
          </li>
        ))}
      </ul>
      {active && (
        <Modal title={`แนบรูปสัญญาใหม่ · ห้อง ${active.to_room_number}`} onClose={() => setActive(null)} variant="waiting-form">
          {(requestClose) => (
            <div className="staff-rv-form">
              <p className="staff-rv-form-note">
                ผู้เช่า {`${active.first_name || ''} ${active.last_name || ''}`.trim()} ย้ายจากห้อง {active.from_room_number} ไปห้อง {active.to_room_number} แล้ว
                รูปชุดนี้จะใช้แทนรูปสัญญาปัจจุบัน ส่วนรูปเดิมเก็บเป็นประวัติการย้ายห้อง
              </p>
              <ContractImagePicker files={files} onChange={changeFiles} error={fileError} min={ROOM_TRANSFER_MIN_CONTRACT_IMAGES} />
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" disabled={busy} onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="staff-action-btn is-primary" disabled={busy} onClick={() => submit(requestClose)}>
                  {busy ? 'กำลังอัปโหลด...' : `บันทึกสัญญา (${files.length}/${ROOM_TRANSFER_MIN_CONTRACT_IMAGES})`}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  )
}

function MoveRoomApprovalModal({ request, error, processing, onConfirm, onSendCharge, onClose }) {
  const [openedAt] = useState(() => Date.now())
  const { preview, loading: previewLoading, error: previewError } = useRoomTransferPreview(request.id)

  const rentDiff = getRentDiff(request)
  const targetBooked = preview ? Boolean(preview.target_room?.is_booked) : Boolean(request.target_room_is_booked)
  const contractEnd = preview?.contract?.effective_end_date || request.source_rental_end_date
  const contractMsLeft = contractEnd ? new Date(contractEnd).getTime() - openedAt : null
  const outstanding = preview?.outstanding
  const hasDue = (outstanding?.items?.length ?? 0) > 0
  const blockers = preview?.blockers ?? []
  const [contractFiles, setContractFiles] = useState([])
  const [contractFilesError, setContractFilesError] = useState('')
  const contractFilesReady = contractFiles.length >= ROOM_TRANSFER_MIN_CONTRACT_IMAGES
  const canApprove = Boolean(preview?.can_approve) && !previewLoading && !previewError && contractFilesReady
  const transferCharge = preview?.transfer_charge
  const awaitingCharge = Boolean(transferCharge?.required && transferCharge.status !== 'paid')
  const handleContractFilesChange = (files) => {
    const invalid = files.map(validateImageFile).find(Boolean)
    if (invalid) {
      setContractFilesError(invalid)
      return
    }
    if (files.length > CONTRACT_MAX_IMAGES) {
      setContractFilesError(`แนบรูปสัญญาได้ไม่เกิน ${CONTRACT_MAX_IMAGES} รูป`)
      return
    }
    setContractFilesError('')
    setContractFiles(files)
  }
  const handleConfirm = () => {
    if (!contractFilesReady) {
      setContractFilesError(`กรุณาแนบรูปสัญญาใหม่อย่างน้อย ${ROOM_TRANSFER_MIN_CONTRACT_IMAGES} รูป (แนบแล้ว ${contractFiles.length} รูป)`)
      return
    }
    const body = new FormData()
    contractFiles.forEach((file) => body.append('contract_images', file))
    onConfirm(body)
  }
  const chargeSectionRef = useRef(null)
  const contractSectionRef = useRef(null)
  const [section, setSection] = useState('all')
  const sections = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'tenant', label: 'ผู้เช่าและสัญญา' },
    { key: 'inspection', label: 'ผลตรวจห้อง' },
    { key: 'money', label: 'เงินมัดจำและยอดชำระ' },
    { key: 'contract', label: 'รูปสัญญาใหม่' },
  ]
  const show = (key) => section === 'all' || section === key
  const scrollToSection = (key, ref) => {
    if (!show(key)) setSection(key)
    requestAnimationFrame(() => {
      const node = ref.current
      if (!node) return
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      node.classList.remove('is-flash')
      void node.offsetWidth
      node.classList.add('is-flash')
    })
  }
  const amenities = TARGET_ROOM_AMENITIES.filter((item) => request[`target_room_${item.key}`])

  return (
    <>
      <Modal title="ยืนยันการอนุมัติย้ายห้อง" onClose={onClose} variant="transfer-approval">
        {(requestClose) => (
          <div className="staff-transfer-body is-move-approval">
            <div className="staff-transfer-top">
              <div className="staff-transfer-hero">
                <div className="staff-confirm-icon is-success">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M17 3l4 4-4 4" />
                    <path d="M3 7h18" />
                    <path d="M7 21l-4-4 4-4" />
                    <path d="M21 17H3" />
                  </svg>
                </div>
                <div>
                  <p className="staff-confirm-message">ยืนยันอนุมัติคำขอย้ายห้อง</p>
                  <p className="staff-confirm-note">ตรวจสอบรายละเอียดให้ครบถ้วนก่อนกดยืนยัน</p>
                </div>
              </div>
              <div className="staff-transfer-route">
                <div className="staff-transfer-room is-source">
                  <span className="staff-transfer-room-icon"><WaitingDetailIcon type="home" size={22} /></span>
                  <span className="staff-transfer-room-label">ห้องเดิม</span>
                  <strong className="staff-transfer-room-number">{request.room_number}</strong>
                  <span className="staff-transfer-room-price">
                    {request.source_room_price != null ? `฿${formatCurrency(request.source_room_price)}` : '-'}
                    <small>/เดือน</small>
                  </span>
                  <span className="staff-transfer-chip is-muted">จะเป็นห้องว่าง</span>
                </div>
                <div className="staff-transfer-arrow" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                </div>
                <div className={`staff-transfer-room is-target${targetBooked ? ' is-unavailable' : ''}`}>
                  <span className="staff-transfer-room-icon"><WaitingDetailIcon type="home" size={22} /></span>
                  <span className="staff-transfer-room-label">ห้องใหม่</span>
                  <strong className="staff-transfer-room-number">{request.target_room_number}</strong>
                  <span className="staff-transfer-room-price">
                    {request.target_room_price != null ? `฿${formatCurrency(request.target_room_price)}` : '-'}
                    <small>/เดือน</small>
                  </span>
                  <span className={`staff-transfer-chip ${targetBooked ? 'is-danger' : 'is-success'}`}>
                    {targetBooked ? 'ไม่ว่างแล้ว' : 'ว่าง พร้อมย้ายเข้า'}
                  </span>
                </div>
              </div>
            </div>

            <div className="staff-transfer-scroll">
              <SectionFilter sections={sections} value={section} onChange={setSection} />
              {request.note && (
                <p className="staff-transfer-note">
                  <span>หมายเหตุ:</span> {request.note}
                </p>
              )}
              <div className="staff-transfer-summary">
                {rentDiff !== null && (
                  <span
                    className={`staff-transfer-chip ${rentDiff > 0 ? 'is-warning' : rentDiff < 0 ? 'is-success' : 'is-muted'}`}
                  >
                    {rentDiff === 0
                      ? 'ค่าเช่าเท่าเดิม'
                      : `ค่าเช่า ${rentDiff > 0 ? '+' : '-'}฿${formatCurrency(Math.abs(rentDiff))}/เดือน`}
                  </span>
                )}
                {request.target_room_electricity_unit_price != null && (
                  <span className="staff-transfer-tag">ไฟ ฿{formatCurrency(request.target_room_electricity_unit_price)}/หน่วย</span>
                )}
                {request.target_room_water_price != null && (
                  <span className="staff-transfer-tag">น้ำ ฿{formatCurrency(request.target_room_water_price)}</span>
                )}
                {amenities.map((item) => (
                  <span key={item.key} className="staff-transfer-tag">
                    {item.label}
                  </span>
                ))}
              </div>

              <section className="staff-transfer-section" hidden={!show('tenant')}>
                <h4 className="staff-transfer-section-title">ผู้เช่าและสัญญา</h4>
                <div className="staff-transfer-groups">
                  <div className="staff-transfer-group">
                    <p className="staff-transfer-group-title">ผู้เช่า</p>
                    <dl className="staff-transfer-list is-single">
                      <div>
                        <dt>ชื่อ</dt>
                        <dd>
                          {request.first_name} {request.last_name}
                        </dd>
                      </div>
                      <div>
                        <dt>เบอร์โทร</dt>
                        <dd>{request.phone || '-'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="staff-transfer-group">
                    <p className="staff-transfer-group-title">สัญญาเช่าปัจจุบัน</p>
                    <dl className="staff-transfer-list is-single">
                      {preview?.contract && (
                        <>
                          <div>
                            <dt>สัญญาห้อง</dt>
                            <dd>{preview.contract.room_number || '-'}</dd>
                          </div>
                          <div>
                            <dt>เริ่มสัญญา</dt>
                            <dd>{formatDate(preview.contract.rental_start_date)}</dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt>สิ้นสุดสัญญา</dt>
                        <dd>{formatDate(contractEnd)}</dd>
                      </div>
                      <div>
                        <dt>คงเหลือ</dt>
                        <dd
                          className={
                            contractMsLeft !== null && contractMsLeft <= ROOM_EXPIRY_WARNING_WINDOW_MS ? 'is-danger' : ''
                          }
                        >
                          {contractMsLeft === null ? '-' : contractMsLeft < 0 ? 'หมดสัญญาแล้ว' : formatDaysLeft(contractMsLeft)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="staff-transfer-group">
                    <p className="staff-transfer-group-title">การเงิน</p>
                    <dl className="staff-transfer-list is-single">
                      <div>
                        <dt>เงินมัดจำตามสัญญา</dt>
                        <dd>
                          {preview
                            ? `฿${formatCurrency(preview.deposit.amount)}`
                            : request.deposit_amount != null ? `฿${formatCurrency(request.deposit_amount)}` : '-'}
                        </dd>
                      </div>
                      {preview && (
                        <div>
                          <dt>ชำระมัดจำแล้ว</dt>
                          <dd>฿{formatCurrency(preview.deposit.paid)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>ยอดค้างห้องเดิม</dt>
                        <dd className={hasDue ? 'is-danger' : 'is-success'}>
                          {!preview ? '-' : hasDue ? `฿${formatCurrency(outstanding.amount)}` : 'ไม่มี'}
                        </dd>
                      </div>
                      <div>
                        <dt>ชำระค่าเช่าถึง</dt>
                        <dd>{preview?.coverage?.paid_through ? formatDate(preview.coverage.paid_through) : '-'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="staff-transfer-group">
                    <p className="staff-transfer-group-title">คำขอย้ายห้อง</p>
                    <dl className="staff-transfer-list is-single">
                      <div>
                        <dt>เหตุผล</dt>
                        <dd>{MOVE_ROOM_REASON_LABEL[request.move_reason] || '-'}</dd>
                      </div>
                      <div>
                        <dt>ต้องการย้าย</dt>
                        <dd>{formatDateOnly(request.preferred_move_date)}</dd>
                      </div>
                      <div>
                        <dt>ส่งคำขอ</dt>
                        <dd>{formatDateTime(request.created_at)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </section>

              {show('inspection') && (
                <InspectionSummary
                  inspectionId={request.inspection_id}
                  roomNumber={request.room_number}
                  tenantName={`${request.first_name || ''} ${request.last_name || ''}`.trim()}
                />
              )}

              {show('money') && <TransferSettlementSection preview={preview} loading={previewLoading} loadError={previewError} />}

              {show('money') && awaitingCharge && (
                <section
                  ref={chargeSectionRef}
                  className="staff-transfer-section is-warning is-charge"
                  onAnimationEnd={(event) => event.currentTarget.classList.remove('is-flash')}
                >
                  <h4 className="staff-transfer-section-title">
                    ต้องเก็บเงินเพิ่มก่อนทำสัญญา
                    <span className="staff-transfer-chip is-warning">{TRANSFER_CHARGE_STATUS_TEXT[transferCharge.status]}</span>
                  </h4>
                  <p className="staff-transfer-muted">
                    ผู้เช่าต้องชำระมัดจำเพิ่ม ฿{formatCurrency(transferCharge.amount)} ภายใน {transferCharge.days} วัน
                    {transferCharge.due_at ? ` (ถึง ${formatDateTime(transferCharge.due_at)})` : ' นับจากกดส่งยอด'}
                    {' '}เมื่อชำระและตรวจสลิปผ่าน ระบบจะย้ายห้องให้อัตโนมัติทันที แล้วค่อยแนบรูปสัญญาใหม่ภายหลัง ถ้าเลยกำหนดระบบจะยกเลิกคำขอย้ายห้อง
                  </p>
                </section>
              )}

              <section
                ref={contractSectionRef}
                hidden={!show('contract')}
                className={`staff-transfer-section${contractFilesReady ? '' : ' is-warning'}`}
                onAnimationEnd={(event) => event.currentTarget.classList.remove('is-flash')}
              >
                <h4 className="staff-transfer-section-title">
                  รูปสัญญาใหม่ (บังคับ)
                  <span className={`staff-transfer-chip ${contractFilesReady ? 'is-success' : 'is-warning'}`}>
                    {contractFiles.length}/{ROOM_TRANSFER_MIN_CONTRACT_IMAGES} รูปขั้นต่ำ
                  </span>
                </h4>
                <p className="staff-transfer-muted">
                  แนบรูปสัญญาที่เซ็นใหม่สำหรับห้อง {request.target_room_number} อย่างน้อย {ROOM_TRANSFER_MIN_CONTRACT_IMAGES} รูป
                  รูปชุดนี้จะใช้แทนรูปสัญญาปัจจุบัน ส่วนรูปเดิมจะเก็บไว้เป็นประวัติการย้ายห้อง
                </p>
                <ContractImagePicker
                  files={contractFiles}
                  onChange={handleContractFilesChange}
                  error={contractFilesError}
                  min={ROOM_TRANSFER_MIN_CONTRACT_IMAGES}
                />
              </section>

              <p className="staff-transfer-info">
                ผู้เช่าจะย้ายไปห้อง {request.target_room_number} ทันที โดยใช้สัญญาฉบับเดิมและบันทึกการย้ายห้องเป็นประวัติแนบสัญญา
                ส่วนห้อง {request.room_number} จะเปลี่ยนเป็นห้องว่าง
              </p>
            </div>

            <div className="staff-transfer-footer">
              {awaitingCharge && transferCharge.status !== 'not_sent' && (
                <button type="button" className="staff-transfer-footer-warning" onClick={() => scrollToSection('money', chargeSectionRef)}>
                  <strong>{TRANSFER_CHARGE_STATUS_TEXT[transferCharge.status]}</strong>
                  <span>เมื่อผู้เช่าชำระยอดย้ายห้องและตรวจสลิปผ่าน ระบบจะย้ายห้องให้อัตโนมัติ ไม่ต้องกดอนุมัติ</span>
                  <em className="staff-transfer-footer-warning-link">ดูรายละเอียด ↓</em>
                </button>
              )}
              {!awaitingCharge && !contractFilesReady && (
                <button type="button" className="staff-transfer-footer-warning" onClick={() => scrollToSection('contract', contractSectionRef)}>
                  <strong>ต้องแนบรูปสัญญาใหม่ก่อนอนุมัติ</strong>
                  <span>
                    แนบแล้ว {contractFiles.length} จาก {ROOM_TRANSFER_MIN_CONTRACT_IMAGES} รูป
                    {' '}· ขาดอีก {ROOM_TRANSFER_MIN_CONTRACT_IMAGES - contractFiles.length} รูป
                  </span>
                  <em className="staff-transfer-footer-warning-link">ไปแนบรูป ↓</em>
                </button>
              )}
              {blockers.map((message) => (
                <p key={message} className="staff-form-error">
                  {message}
                </p>
              ))}
              {!preview && targetBooked && (
                <p className="staff-form-error">
                  ห้อง {request.target_room_number} มีผู้เช่าแล้ว ไม่สามารถอนุมัติได้ กรุณาปฏิเสธคำขอหรือติดต่อผู้เช่า
                </p>
              )}
              {error && <p className="staff-form-error">{error}</p>}
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                {preview?.can_request_charge ? (
                  <button type="button" className="staff-action-btn is-primary" disabled={processing} onClick={onSendCharge}>
                    {processing ? 'กำลังดำเนินการ...' : `ส่งยอดเก็บเงิน ฿${formatCurrency(transferCharge.amount)}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
                    disabled={processing || !canApprove}
                    onClick={handleConfirm}
                  >
                    {processing ? 'กำลังดำเนินการ...' : 'ยืนยันอนุมัติย้ายห้อง'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
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

function StaffSummaryTile({ icon, label, value, hint, tone, alert = false }) {
  return (
    <div className={`staff-summary-tile is-${tone}${value === 0 ? ' is-zero' : ''}${alert ? ' is-alert' : ''}`}>
      <span className="staff-summary-tile-icon">
        <SummaryIcon type={icon} />
      </span>
      <span className="staff-summary-tile-text">
        <span className="staff-summary-tile-label">{label}</span>
        <strong className="staff-summary-tile-value">{value}</strong>
        {hint && <small className="staff-summary-tile-hint">{hint}</small>}
      </span>
    </div>
  )
}

function SummaryIcon({ type }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SUMMARY_ICON_PATHS[type]}
    </svg>
  )
}

const PAYMENT_REVIEW_LABEL = { rent: 'ค่าเช่า', deposit: 'เงินมัดจำ', water: 'ค่าน้ำ', electricity: 'ค่าไฟ', room_transfer: 'ยอดย้ายห้อง' }
const PAYMENT_ITEM_ORDER = ['deposit', 'rent', 'room_transfer', 'water', 'electricity']

function slipPaymentItems(payment) {
  let items = payment.payment_items
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items)
    } catch {
      items = []
    }
  }
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.type)
    .sort((a, b) => PAYMENT_ITEM_ORDER.indexOf(a.type) - PAYMENT_ITEM_ORDER.indexOf(b.type))
}

function SlipItemsBreakdown({ payment }) {
  const items = slipPaymentItems(payment)
  if (items.length === 0) return null
  return (
    <span className="staff-slip-breakdown" aria-label="รายการที่ชำระ">
      {items.map((item, index) => (
        <span key={`${item.type}-${index}`} className={`staff-slip-breakdown-row is-${item.type}`}>
          <span>{PAYMENT_REVIEW_LABEL[item.type] || item.type}</span>
          <b>฿{Number(item.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</b>
        </span>
      ))}
    </span>
  )
}

function SlipPaymentItems({ payment }) {
  const items = slipPaymentItems(payment)
  if (items.length === 0) return null
  const money = (value) => `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const total = items.reduce((sum, item) => sum + Math.round(Number(item.amount || 0) * 100), 0) / 100
  return (
    <section className="payment-slip-items" aria-label="รายการที่ชำระในสลิปนี้">
      <header className="payment-slip-items-head">
        <span>รายการที่ชำระ</span>
        <span>{items.length} รายการ</span>
      </header>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.type}-${index}`}>
            <span>
              {PAYMENT_REVIEW_LABEL[item.type] || item.type}
              {item.note && <small>{item.note}</small>}
            </span>
            <strong>{money(item.amount)}</strong>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <div className="payment-slip-items-total">
          <span>รวม</span>
          <span>{money(total)}</span>
        </div>
      )}
    </section>
  )
}

function StaffPagination({ page, total, onChange, pageSize = STAFF_LIST_PAGE_SIZE }) {
  if (total <= pageSize) return null
  const totalPages = Math.ceil(total / pageSize)
  const current = Math.min(page, totalPages)
  return (
    <div className="staff-pagination">
      <span className="staff-pagination-info">
        แสดง {(current - 1) * pageSize + 1}-{Math.min(current * pageSize, total)} จาก {total}{' '}
        รายการ
      </span>
      <div className="staff-pagination-controls">
        <button
          type="button"
          className="staff-action-btn is-ghost"
          disabled={current <= 1}
          onClick={() => onChange(Math.max(1, current - 1))}
        >
          ก่อนหน้า
        </button>
        <span className="staff-pagination-page">
          หน้า {current} / {totalPages}
        </span>
        <button
          type="button"
          className="staff-action-btn is-ghost"
          disabled={current >= totalPages}
          onClick={() => onChange(Math.min(totalPages, current + 1))}
        >
          ถัดไป
        </button>
      </div>
    </div>
  )
}

export function StaffCompletedContractsTab({ onSummaryChange }) {
  return <StaffCompletedContracts Modal={Modal} Pagination={StaffPagination} FilterPanel={StaffFilterPanel} onSummaryChange={onSummaryChange} />
}

function flashHighlight(element, className) {
  element.classList.remove(className, 'is-fading')
  void element.offsetWidth
  element.classList.add(className, 'is-fading')
  element.addEventListener(
    'animationend',
    () => element.classList.remove(className, 'is-fading'),
    { once: true },
  )
}

function useListFocus(pageSize = STAFF_LIST_PAGE_SIZE) {
  const [page, setPageState] = useState(1)
  const [focusedId, setFocusedId] = useState(null)
  const [pinned, setPinned] = useState(false)
  const scrollPendingRef = useRef(false)

  const setPage = useCallback((value) => {
    setPinned(false)
    setPageState(value)
  }, [])

  const focusItem = useCallback((id) => {
    setFocusedId(id)
    setPinned(true)
    scrollPendingRef.current = true
  }, [])

  useEffect(() => {
    if (!scrollPendingRef.current || focusedId == null) return
    const element = document.querySelector(`[data-staff-focus="${focusedId}"]`)
    if (!element) return
    scrollPendingRef.current = false
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flashHighlight(element, 'staff-focus-row')
  })

  const resolvePage = (list) => {
    if (!pinned || focusedId == null) return page
    const index = list.findIndex((item) => item.id === focusedId)
    return index < 0 ? page : Math.floor(index / pageSize) + 1
  }

  return { page, setPage, focusedId, focusItem, resolvePage }
}

const SLIP_FIELD_ICON_PATHS = {
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  bank: <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  room: <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M14 12h.01" />,
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  qr: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 15h2" />
    </>
  ),
  date: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M16 3v3M8 3v3M3 10h18" />
    </>
  ),
  status: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
}

function SlipDownloadButton({ url, fileName }) {
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

function SlipFieldIcon({ name }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SLIP_FIELD_ICON_PATHS[name]}
    </svg>
  )
}

function formatSlipTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const THAI_BANKS = {
  '002': { name: 'กรุงเทพ', logo: 'BBL' },
  '004': { name: 'กสิกรไทย', logo: 'KBANK' },
  '006': { name: 'กรุงไทย', logo: 'KTB' },
  '011': { name: 'ทหารไทยธนชาต', logo: 'TTB' },
  '014': { name: 'ไทยพาณิชย์', logo: 'SCB' },
  '017': { name: 'ซิตี้แบงก์', logo: 'CITI' },
  '022': { name: 'ซีไอเอ็มบี ไทย', logo: 'CIMB' },
  '024': { name: 'ยูโอบี', logo: 'UOB' },
  '025': { name: 'กรุงศรีอยุธยา', logo: 'BAY' },
  '030': { name: 'ออมสิน', logo: 'GSB' },
  '031': { name: 'เอชเอสบีซี', logo: 'HSBC' },
  '033': { name: 'อาคารสงเคราะห์', logo: 'GHB' },
  '034': { name: 'ธ.ก.ส.', logo: 'BAAC' },
  '066': { name: 'อิสลามแห่งประเทศไทย', logo: 'IBANK' },
  '067': { name: 'ทิสโก้', logo: 'TISCO' },
  '069': { name: 'เกียรตินาคินภัทร', logo: 'KKP' },
  '070': { name: 'ไอซีบีซี (ไทย)', logo: 'ICBC' },
  '071': { name: 'ไทยเครดิต', logo: 'TCRB' },
  '073': { name: 'แลนด์ แอนด์ เฮ้าส์', logo: 'LHB' },
}

function SlipBank({ code }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const bank = THAI_BANKS[code]
  if (!bank) return code
  return (
    <span className="slip-bank">
      {!logoFailed && (
        <img src={`/Logo/${bank.logo}.png`} alt="" className="slip-bank-logo" onError={() => setLogoFailed(true)} />
      )}
      {bank.name}
    </span>
  )
}

function bankLabel(code) {
  return code ? <SlipBank code={code} /> : ''
}

function slipVerifyLabel(slip, isFailed) {
  if (slip.is_test) return 'โหมดทดลอง · ไม่ได้ตรวจกับธนาคาร'
  if (slip.reviewed_by_name) return `${isFailed ? 'เจ้าหน้าที่ปฏิเสธ' : 'เจ้าหน้าที่อนุมัติ'} · ${slip.reviewed_by_name}`
  return isFailed ? 'ระบบตรวจอัตโนมัติ (RDCW)' : 'ตรวจอัตโนมัติกับธนาคาร (RDCW)'
}

function slipReasonInfo(slip) {
  const reason = String(slip.reason || '')
  if (slip.reviewed_by_name) return { tone: 'muted', icon: 'user', title: 'เจ้าหน้าที่ไม่อนุมัติ' }
  if (reason.includes('ใช้ชำระเงินไปแล้ว')) return { tone: 'warning', icon: 'copy', title: 'สลิปถูกใช้ซ้ำ' }
  if (reason.includes('ยอดเงินในสลิป')) return { tone: 'warning', icon: 'wallet', title: 'ยอดเงินไม่ครบ' }
  if (reason.includes('บัญชีผู้รับ')) return { tone: 'danger', icon: 'bank', title: 'บัญชีผู้รับไม่ตรง' }
  if (reason.includes('QR')) return { tone: 'info', icon: 'qr', title: 'อ่าน QR บนสลิปไม่ได้' }
  return { tone: 'danger', icon: 'alert', title: 'สลิปไม่ถูกต้อง' }
}

function SlipReason({ slip, compact = false }) {
  if (!slip.reason) return null
  const info = slipReasonInfo(slip)
  return (
    <div className={`slip-reason is-${info.tone}${compact ? ' is-compact' : ''}`} role="note">
      <span className="slip-reason-icon" aria-hidden="true">
        <svg width={compact ? 14 : 18} height={compact ? 14 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {SLIP_FIELD_ICON_PATHS[info.icon]}
        </svg>
      </span>
      <span className="slip-reason-text">
        <strong>{info.title}</strong>
        <span>{slip.reason}</span>
      </span>
    </div>
  )
}

function slipDetailRows({ payment, isHistory, isFailed }) {
  const tenantName = `${payment.first_name || ''} ${payment.last_name || ''}`.trim()
  const types = String(payment.payment_types || '')
    .split(',')
    .filter(Boolean)
    .map((type) => PAYMENT_REVIEW_LABEL[type] || type)
    .join(', ')
  const hasRealRef = payment.trans_ref && !/^(TEST|MANUAL)-/.test(payment.trans_ref)
  const rows = [
    { icon: 'room', label: 'ห้อง', value: payment.room_number ? `ห้อง ${payment.room_number}` : '' },
    { icon: 'user', label: 'ผู้เช่า', value: tenantName },
    { icon: 'phone', label: 'เบอร์โทร', value: payment.phone },
    { icon: 'list', label: 'รายการ', value: slipPaymentItems(payment).length > 0 ? '' : types },
  ]
  if (!isHistory) {
    rows.push({
      icon: 'date',
      label: 'วันที่ส่ง',
      value: new Date(payment.payment_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
    })
    return rows.filter((row) => row.value)
  }
  rows.push(
    { icon: 'user', label: 'ผู้โอน', value: payment.sender_name },
    { icon: 'bank', label: 'ธนาคารผู้โอน', value: bankLabel(payment.sending_bank) },
    { icon: 'user', label: 'ผู้รับ', value: payment.receiver_name },
    { icon: 'bank', label: 'ธนาคารผู้รับ', value: bankLabel(payment.receiving_bank) },
    { icon: 'date', label: 'เวลาโอน', value: payment.trans_at ? formatSlipTime(payment.trans_at) : '' },
    { icon: 'date', label: 'เวลาส่งสลิป', value: formatSlipTime(payment.created_at) },
    { icon: 'hash', label: 'เลขอ้างอิง', value: hasRealRef ? payment.trans_ref : '' },
    { icon: 'shield', label: 'วิธีตรวจ', value: slipVerifyLabel(payment, isFailed) },
  )
  return rows.filter((row) => row.value)
}

function StaffPaymentReview({ onCountChange, focusId }) {
  const [payments, setPayments] = useState([])
  const [slipHistory, setSlipHistory] = useState([])
  const [rejectedSlips, setRejectedSlips] = useState([])
  const [slipView, setSlipView] = useState('passed')
  const [slipSearch, setSlipSearch] = useState('')
  const [slipMode, setSlipMode] = useState('auto')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [confirmReview, setConfirmReview] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [slipViewerOpen, setSlipViewerOpen] = useState(false)
  const [previewClosing, setPreviewClosing] = useState(false)
  const { setPage, resolvePage } = useListFocus(STAFF_CARD_PAGE_SIZE)

  const showError = (message) => {
    setError(message)
    setNotice({ type: 'error', message })
  }

  const fetchSlips = () =>
    Promise.all([
      axios.get('/api/staff/payment-verifications'),
      axios.get('/api/staff/payment-slips'),
    ]).then(([pending, history]) => ({
      pending: pending.data.payments || [],
      history: history.data.slips || [],
      rejected: history.data.rejected || [],
      mode: history.data.mode || 'auto',
    }))

  const applySlips = ({ pending, history, rejected, mode }) => {
    setSlipMode(mode)
    if (mode === 'auto' && pending.length === 0) setSlipView((view) => (view === 'pending' ? 'passed' : view))
    setPayments(pending)
    setSlipHistory(history)
    setRejectedSlips(rejected)
    onCountChange?.(pending.length)
    setError('')
  }

  const loadPayments = () => {
    setLoading(true)
    return fetchSlips()
      .then(applySlips)
      .catch((err) => showError(err.response?.data?.message || 'โหลดประวัติสลิปไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  const applyInitialSlips = useEffectEvent((result) => {
    applySlips(result)
    if (result.mode === 'manual' || (result.mode === 'test' && result.pending.length > 0)) setSlipView('pending')
    const target = focusId ? result.pending.find((payment) => payment.id === focusId) : null
    if (target) {
      setSlipView('pending')
      setPreview({ payment: target, url: target.slip_path })
    }
  })

  useEffect(() => {
    let cancelled = false
    fetchSlips()
      .then((result) => {
        if (!cancelled) applyInitialSlips(result)
      })
      .catch((err) => {
        if (!cancelled) showError(err.response?.data?.message || 'โหลดประวัติสลิปไม่สำเร็จ')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!previewClosing) return undefined
    const timer = setTimeout(() => {
      setPreview(null)
      setPreviewClosing(false)
    }, 160)
    return () => clearTimeout(timer)
  }, [previewClosing])

  useEffect(() => {
    if (!preview) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !confirmReview && !slipViewerOpen) setPreviewClosing(true)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [preview, confirmReview, slipViewerOpen])

  const hasPreview = Boolean(preview)
  useEffect(() => (hasPreview ? lockBodyScroll() : undefined), [hasPreview])

  const isFailedView = slipView === 'failed'
  const baseSlips = slipView === 'pending' ? payments : isFailedView ? rejectedSlips : slipHistory
  const searchText = slipSearch.trim().toLowerCase()
  const visibleSlips = searchText
    ? baseSlips.filter((slip) =>
        matchesSearch([
          slip.room_number,
          `${slip.first_name || ''} ${slip.last_name || ''}`,
          slip.phone,
          slip.sender_name,
          slip.trans_ref,
          slip.reason,
        ], searchText, slip),
      )
    : baseSlips
  const passedTotal = slipHistory.reduce((total, slip) => (slip.is_test ? total : total + (Number(slip.amount) || 0)), 0)
  const currentPage = Math.min(resolvePage(visibleSlips), Math.max(1, Math.ceil(visibleSlips.length / STAFF_CARD_PAGE_SIZE)))
  const pageSlips = visibleSlips.slice((currentPage - 1) * STAFF_CARD_PAGE_SIZE, currentPage * STAFF_CARD_PAGE_SIZE)
  const pendingSegment = { key: 'pending', label: 'รอตรวจสอบ', count: payments.length }
  const historySegments = [
    { key: 'passed', label: 'ตรวจผ่าน', count: slipHistory.length },
    { key: 'failed', label: 'ตรวจไม่ผ่าน', count: rejectedSlips.length },
  ]
  const slipSegments = slipMode === 'manual'
    ? [pendingSegment, ...historySegments]
    : slipMode === 'test' || payments.length > 0
      ? [...historySegments, pendingSegment]
      : historySegments

  const selectSlipView = (view) => {
    setSlipView(view)
    setPage(1)
  }

  const openSlip = (payment, isHistory = false, isFailed = false) => {
    setError('')
    setPreviewClosing(false)
    setSlipViewerOpen(false)
    setPreview({ payment, url: payment.slip_path, isHistory, isFailed })
  }

  const closeSlip = () => setPreviewClosing(true)

  const requestReview = (payment, decision) => setConfirmReview({ payment, decision })

  const submitReview = async (requestClose) => {
    const { payment, decision } = confirmReview
    setBusyId(payment.id)
    try {
      const { data } = await axios.patch(
        `/api/staff/payment-verifications/${payment.id}`,
        { decision }
      )
      setNotice({ type: 'success', message: data.message || 'บันทึกผลการตรวจสลิปแล้ว' })
      if (preview?.payment.id === payment.id) setPreviewClosing(true)
      requestClose()
      await loadPayments()
    } catch (err) {
      setNotice({ type: 'error', message: err.response?.data?.message || 'ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' })
      requestClose()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="staff-card staff-tab-card payment-review-card">
      <div className="staff-card-header payment-review-header">
        <div className="payment-review-heading">
          <span className="payment-review-heading-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
              <path d="m9 10 2 2 4-4" />
              <path d="M9 16h6" />
            </svg>
          </span>
          <div>
            <h2>ประวัติสลิป</h2>
            <p className="payment-review-lead">ตรวจสลิปกับธนาคารอัตโนมัติ สลิปที่ผ่านจะเป็น “ชำระแล้ว” ทันที และใช้ซ้ำไม่ได้</p>
          </div>
        </div>
        <div className="payment-review-stats">
          <span className="payment-review-stat is-success">
            <small>ตรวจผ่าน</small>
            <strong>{slipHistory.length}</strong>
          </span>
          <span className="payment-review-stat is-danger">
            <small>ไม่ผ่าน</small>
            <strong>{rejectedSlips.length}</strong>
          </span>
          <span className="payment-review-stat">
            <small>ยอดรับแล้ว</small>
            <strong>฿{passedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </span>
        </div>
      </div>
      <StaffFilterPanel
        segments={slipSegments}
        segmentLabel="หมวดสลิป"
        active={slipView}
        onSegment={selectSlipView}
        search={slipSearch}
        onSearch={(value) => {
          setSlipSearch(value)
          setPage(1)
        }}
        searchPlaceholder="ค้นหาเลขห้อง ชื่อผู้เช่า ผู้โอน เบอร์โทร หรือเลขอ้างอิง"
        resultText={searchText ? `พบ ${visibleSlips.length} จาก ${baseSlips.length} รายการ` : null}
        canClear={Boolean(searchText)}
        onClear={() => setSlipSearch('')}
      />
      {slipView === 'pending' && visibleSlips.length > 0 && (
        <ul className="staff-rv-list staff-ic-grid is-visit">
          {pageSlips.map((payment) => {
            const types = String(payment.payment_types || '').split(',').filter(Boolean)
            const tenantName = `${payment.first_name || ''} ${payment.last_name || ''}`.trim() || '-'
            return (
              <li key={payment.id} data-staff-focus={payment.id} className="staff-ic-card staff-ic-visit-card staff-slip-card is-pending">
                <button type="button" className="staff-ic-main" onClick={() => openSlip(payment)}>
                  <span className="staff-ic-head">
                    <span className="staff-ic-icon">
                      <SlipFieldIcon name="wallet" />
                    </span>
                    <span className="staff-ic-title">
                      <strong>ห้อง {payment.room_number}</strong>
                      <span className="staff-slip-types">
                        {types.map((type) => (
                          <em key={type} className="staff-vc-model">{PAYMENT_REVIEW_LABEL[type] || type}</em>
                        ))}
                      </span>
                    </span>
                    <span className="staff-ic-status is-pending">รอตรวจสอบ</span>
                  </span>
                  <span className="staff-vc-grid">
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">ผู้เช่า</span>
                      <span className="staff-vc-value" title={tenantName}>{tenantName}</span>
                    </span>
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">เบอร์โทร</span>
                      <span className="staff-vc-value">{payment.phone || '-'}</span>
                    </span>
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">วันที่ส่ง</span>
                      <span className="staff-vc-value">{new Date(payment.payment_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                    </span>
                  </span>
                  <span className="staff-vc-range staff-slip-amount">
                    <span className="staff-vc-range-icon" aria-hidden="true">
                      <SlipFieldIcon name="wallet" />
                    </span>
                    <span className="staff-vc-range-body">
                      <span className="staff-vc-label">ยอดที่ต้องตรวจ</span>
                      <strong>
                        ฿{Number(payment.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </span>
                  </span>
                  <SlipItemsBreakdown payment={payment} />
                </button>
                <div className="staff-ic-photos">
                  <span className="staff-ic-label">สลิปโอนเงิน</span>
                  {payment.slip_path ? (
                    <span className="staff-ic-photo-row">
                      <button type="button" className="staff-ic-photo" onClick={() => openSlip(payment)} aria-label={`ดูสลิปห้อง ${payment.room_number}`}>
                        <UploadImage src={payment.slip_path} alt="" loading="lazy" />
                      </button>
                    </span>
                  ) : (
                    <span className="staff-ic-photo-empty">
                      <StaffEmptyPhotoIcon />
                      ไม่มีรูปสลิป
                    </span>
                  )}
                </div>
                <div className="staff-ic-foot">
                  <span className="staff-ic-result">รอเจ้าหน้าที่ตรวจสอบสลิป</span>
                  <span className="staff-ic-actions">
                    <button type="button" className="staff-ic-btn" onClick={() => openSlip(payment)}>
                      ดูสลิป
                    </button>
                    <button
                      type="button"
                      className="staff-ic-btn is-danger"
                      disabled={busyId === payment.id}
                      onClick={() => requestReview(payment, 'rejected')}
                    >
                      ปฏิเสธ
                    </button>
                    <button
                      type="button"
                      className="staff-ic-btn is-primary"
                      disabled={busyId === payment.id}
                      onClick={() => requestReview(payment, 'approved')}
                    >
                      อนุมัติ
                    </button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {loading && visibleSlips.length === 0 ? (
        <p className="staff-empty">กำลังโหลดรายการ...</p>
      ) : visibleSlips.length === 0 && error ? (
        <p className="staff-empty">โหลดรายการไม่สำเร็จ กรุณาเปิดหน้านี้ใหม่อีกครั้ง</p>
      ) : visibleSlips.length === 0 ? (
        <p className="staff-empty">
          {searchText
            ? 'ไม่พบสลิปที่ตรงกับคำค้นหา'
            : slipView === 'pending'
              ? 'ไม่มีสลิปรอตรวจสอบ'
              : isFailedView
                ? 'ไม่มีสลิปที่ตรวจไม่ผ่าน'
                : 'ยังไม่มีสลิปที่ตรวจผ่าน'}
        </p>
      ) : slipView === 'pending' ? null : (
        <ul className="staff-rv-list staff-ic-grid is-visit">
          {pageSlips.map((slip) => {
            const types = String(slip.payment_types || '').split(',').filter(Boolean)
            const tenantName = `${slip.first_name || ''} ${slip.last_name || ''}`.trim() || '-'
            return (
              <li key={slip.id} className={`staff-ic-card staff-ic-visit-card staff-slip-card${isFailedView ? ' is-failed' : ''}`}>
                <button type="button" className="staff-ic-main" onClick={() => openSlip(slip, true, isFailedView)}>
                  <span className="staff-ic-head">
                    <span className="staff-ic-icon">
                      <SlipFieldIcon name="wallet" />
                    </span>
                    <span className="staff-ic-title">
                      <strong>ห้อง {slip.room_number || '-'}</strong>
                      <span className="staff-slip-types">
                        {types.map((type) => (
                          <em key={type} className="staff-vc-model">{PAYMENT_REVIEW_LABEL[type] || type}</em>
                        ))}
                      </span>
                    </span>
                    <span className={`staff-ic-status ${isFailedView ? 'is-rejected' : slip.is_test ? 'is-pending' : 'is-reviewed'}`}>
                      {isFailedView ? 'ตรวจไม่ผ่าน' : slip.is_test ? 'ทดลอง' : 'ชำระแล้ว'}
                    </span>
                  </span>
                  <span className="staff-vc-grid">
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">ผู้เช่า</span>
                      <span className="staff-vc-value" title={tenantName}>{tenantName}</span>
                    </span>
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">ผู้โอน</span>
                      <span className="staff-vc-value" title={slip.sender_name || ''}>{slip.sender_name || '-'}</span>
                    </span>
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">เวลาโอน</span>
                      <span className="staff-vc-value">{formatSlipTime(slip.trans_at || slip.created_at)}</span>
                    </span>
                  </span>
                  <span className="staff-vc-range staff-slip-amount">
                    <span className="staff-vc-range-icon" aria-hidden="true">
                      <SlipFieldIcon name="wallet" />
                    </span>
                    <span className="staff-vc-range-body">
                      <span className="staff-vc-label">ยอดในสลิป</span>
                      <strong>
                        {slip.amount == null
                          ? '-'
                          : `฿${Number(slip.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </strong>
                    </span>
                  </span>
                  <SlipItemsBreakdown payment={slip} />
                  {isFailedView && <SlipReason slip={slip} compact />}
                </button>
                <div className="staff-ic-photos">
                  <span className="staff-ic-label">สลิปโอนเงิน</span>
                  <span className="staff-ic-photo-row">
                    <button type="button" className="staff-ic-photo" onClick={() => openSlip(slip, true, isFailedView)} aria-label={`ดูสลิปห้อง ${slip.room_number}`}>
                      <UploadImage src={slip.slip_path} alt="" loading="lazy" />
                    </button>
                  </span>
                </div>
                <div className="staff-ic-foot">
                  <span className="staff-ic-result" title={slip.trans_ref || ''}>
                    {isFailedView
                      ? `ส่งเมื่อ ${formatSlipTime(slip.created_at)}`
                      : slipVerifyLabel(slip, false)}
                  </span>
                  <span className="staff-ic-actions">
                    <button type="button" className="staff-ic-btn" onClick={() => openSlip(slip, true, isFailedView)}>
                      ดูสลิป
                    </button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <StaffPagination page={currentPage} total={visibleSlips.length} onChange={setPage} pageSize={STAFF_CARD_PAGE_SIZE} />
      {confirmReview && (
        <Modal
          title={confirmReview.decision === 'approved' ? 'ยืนยันการอนุมัติสลิป' : 'ยืนยันการปฏิเสธสลิป'}
          onClose={() => setConfirmReview(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className={`staff-confirm-icon ${confirmReview.decision === 'approved' ? 'is-success' : 'is-warning'}`}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {confirmReview.decision === 'approved' ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </>
                  )}
                </svg>
              </div>
              <p className="staff-confirm-message">
                {confirmReview.decision === 'approved' ? 'ยืนยันอนุมัติสลิปโอนเงินนี้?' : 'ยืนยันปฏิเสธสลิปโอนเงินนี้?'}
              </p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{confirmReview.payment.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {confirmReview.payment.first_name} {confirmReview.payment.last_name}
                  </strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>รายการ</span>
                  <strong>
                    {String(confirmReview.payment.payment_types || '')
                      .split(',')
                      .map((type) => PAYMENT_REVIEW_LABEL[type] || type)
                      .join(', ')}
                  </strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ยอดรวม</span>
                  <strong>
                    ฿
                    {Number(confirmReview.payment.amount).toLocaleString('th-TH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </div>
              </div>
              {confirmReview.decision === 'approved' ? (
                <p className="staff-confirm-note">
                  เมื่ออนุมัติ ระบบจะเปลี่ยนสถานะรายการชำระเป็น “ชำระแล้ว”
                </p>
              ) : (
                <div className="staff-confirm-warning">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 9v4M12 17h.01" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                  <p>สลิปนี้จะไม่ผ่านการตรวจสอบ ผู้เช่าจะต้องส่งสลิปใหม่อีกครั้ง</p>
                </div>
              )}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-ghost"
                  disabled={busyId === confirmReview.payment.id}
                  onClick={requestClose}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={`staff-action-btn ${confirmReview.decision === 'approved' ? 'is-primary' : 'is-danger'}`}
                  disabled={busyId === confirmReview.payment.id}
                  onClick={() => submitReview(requestClose)}
                >
                  {busyId === confirmReview.payment.id
                    ? 'กำลังดำเนินการ...'
                    : confirmReview.decision === 'approved'
                      ? 'ยืนยันอนุมัติ'
                      : 'ยืนยันปฏิเสธ'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {notice && (
        <Modal
          title={notice.type === 'success' ? 'สำเร็จ' : 'เกิดข้อผิดพลาด'}
          onClose={() => setNotice(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className={`staff-confirm-icon ${notice.type === 'success' ? 'is-success' : 'is-warning'}`}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {notice.type === 'success' ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <path d="M12 9v4M12 17h.01" />
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    </>
                  )}
                </svg>
              </div>
              <StaffNoticeMessage message={notice.message} type={notice.type} />
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                  ปิด
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {preview && (
        <div
          className={`payment-slip-overlay${previewClosing ? ' is-closing' : ''}`}
          role="presentation"
          onClick={closeSlip}
        >
          <section
            className="payment-slip-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-slip-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="payment-slip-header">
              <div className="payment-slip-heading">
                <span className="payment-slip-heading-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                    <path d="M9 7h6M9 11h6M9 15h4" />
                  </svg>
                </span>
                <h3 id="payment-slip-title">สลิปโอนเงิน</h3>
                <span className="payment-slip-room">ห้อง {preview.payment.room_number}</span>
              </div>
              <button type="button" className="payment-slip-close" onClick={closeSlip} aria-label="ปิด">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            <div className="payment-slip-body">
              <div className="payment-slip-image-frame">
                <button type="button" className="payment-slip-image-btn" onClick={() => setSlipViewerOpen(true)} title="คลิกเพื่อดูรูปขนาดเต็ม">
                  <UploadImage src={preview.url} alt={`สลิปชำระเงินห้อง ${preview.payment.room_number}`} />
                </button>
                <span className="payment-slip-image-hint">คลิกที่รูปเพื่อดูขนาดเต็ม</span>
              </div>

              <div className="payment-slip-side">
              {preview.isFailed && <SlipReason slip={preview.payment} />}
              <dl className="payment-slip-details">
                <div className="payment-slip-amount">
                  <dt>{preview.isHistory ? 'ยอดในสลิป' : 'ยอดรวม'}</dt>
                  <dd>
                    {preview.payment.amount == null
                      ? '-'
                      : `฿${Number(preview.payment.amount).toLocaleString('th-TH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                  </dd>
                </div>
                {slipDetailRows(preview).map((row) => (
                  <div key={row.label} className={row.tone ? `is-${row.tone}` : undefined}>
                    <dt>
                      <SlipFieldIcon name={row.icon} />
                      {row.label}
                    </dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <SlipPaymentItems payment={preview.payment} />
              </div>
            </div>

            <footer className="payment-slip-footer">
              <SlipDownloadButton url={preview.url} fileName={`slip-room-${preview.payment.room_number}-${preview.payment.id}`} />
              {!preview.isHistory && (
              <>
              <button
                type="button"
                className="staff-action-btn is-danger"
                disabled={busyId === preview.payment.id || previewClosing}
                onClick={() => requestReview(preview.payment, 'rejected')}
              >
                ปฏิเสธ
              </button>
              <button
                type="button"
                className="staff-action-btn is-primary"
                disabled={busyId === preview.payment.id || previewClosing}
                onClick={() => requestReview(preview.payment, 'approved')}
              >
                อนุมัติ
              </button>
              </>
              )}
            </footer>
          </section>
        </div>
      )}

      {preview && slipViewerOpen && createPortal(
        <PhotoLightbox
          photos={[{ name: `สลิปห้อง ${preview.payment.room_number}`, url: preview.url }]}
          initialIndex={0}
          title="สลิปโอนเงิน"
          subtitle={`ห้อง ${preview.payment.room_number} · ${preview.payment.first_name} ${preview.payment.last_name}`}
          label="สลิปโอนเงิน"
          onClose={() => setSlipViewerOpen(false)}
        />,
        document.body,
      )}
    </section>
  )
}

const RESIDENT_VISIT_STATUS = {
  pending: { label: 'รออนุมัติ', badge: 'pending', tone: 'warning' },
  approved: { label: 'อนุมัติแล้ว', badge: 'approved', tone: 'success' },
  rejected: { label: 'ไม่อนุมัติ', badge: 'rejected', tone: 'danger' },
  cancelled: { label: 'ยกเลิกแล้ว', badge: 'cancelled', tone: 'muted' },
}
const RESIDENT_VISIT_ACTIVE_PHASES = new Set(['parked', 'pending', 'checkin', 'overtime'])
const RESIDENT_VISIT_VIEWS = {
  main: {
    label: 'หน้าหลัก',
    defaultFilter: 'active',
    filters: [
      { key: 'active', label: 'ทั้งหมด' },
      { key: 'parked', label: 'กำลังจอด', tone: 'success' },
      { key: 'overtime', label: 'เกินเวลา', tone: 'danger' },
      { key: 'checkin', label: 'รอเช็คอิน', tone: 'info' },
      { key: 'pending', label: 'รออนุมัติ', tone: 'warning' },
      { key: 'fine', label: 'ค่าปรับค้าง', tone: 'danger' },
    ],
  },
  history: {
    label: 'ประวัติ',
    defaultFilter: 'closed',
    filters: [
      { key: 'closed', label: 'ทั้งหมด' },
      { key: 'checkedout', label: 'ออกจากที่จอดแล้ว', tone: 'muted' },
      { key: 'expired', label: 'หมดเวลาจอด', tone: 'muted' },
      { key: 'rejected', label: 'ไม่อนุมัติ', tone: 'danger' },
      { key: 'cancelled', label: 'ยกเลิกแล้ว', tone: 'muted' },
    ],
  },
}

const STAFF_IC_TONE = { warning: 'pending', info: 'pending', success: 'reviewed', danger: 'rejected', muted: 'cancelled' }

function StaffEmptyPhotoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

function getStaffVisitPhase(item, now, finePerHour = 0) {
  if (item.checked_out_at) return { key: 'checkedout', label: 'ออกจากที่จอดแล้ว', badge: 'cancelled', tone: 'muted' }
  if (item.status !== 'approved') return { key: item.status, ...(RESIDENT_VISIT_STATUS[item.status] || RESIDENT_VISIT_STATUS.pending) }
  const session = getVisitorSession(item, finePerHour, now)
  if (session?.state === 'waiting') return { key: 'checkin', label: 'รอเช็คอิน', badge: 'pending', tone: 'info' }
  if (session?.state === 'overtime') return { key: 'overtime', label: `เกินเวลา ${session.overtimeHours} ชม.`, badge: 'rejected', tone: 'danger' }
  if (session?.state === 'parked') return { key: 'parked', label: 'กำลังจอด', badge: 'parked', tone: 'success' }
  if (!item.end_at) return { key: 'parked', label: 'กำลังจอด', badge: 'parked', tone: 'success' }
  const end = new Date(item.end_at).getTime()
  if (now >= end) return { key: 'expired', label: 'หมดเวลาจอด', badge: 'expired', tone: 'muted' }
  return { key: 'parked', label: 'กำลังจอด', badge: 'parked', tone: 'success' }
}

const STAFF_VEHICLE_MAX_PHOTOS = 6
const RESIDENT_VEHICLE_OWNER_LABEL = {
  self: 'ผู้พักอาศัย',
  family: 'ผู้มาติดต่อห้องพัก',
  external: 'ผู้มาติดต่อภายนอก',
}
const EMPTY_STAFF_VEHICLE_FORM = {
  roomNumber: '',
  userCategory: 'resident',
  vehicleType: 'car',
  parkingSpaceId: null,
  vehiclePlate: '',
  vehicleModel: '',
  guestName: '',
  guestPhone: '',
  startAt: null,
  note: '',
  photos: [],
}

function defaultParkingWindow() {
  const start = new Date()
  start.setSeconds(0, 0)
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15)
  return { startAt: start }
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function toLocalDateTime(date) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

function formatStaffDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return `${date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
}

function formatStaffPoint(value) {
  const date = new Date(value)
  return {
    day: date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
    time: date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
  }
}

function StaffCarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.6 5H8.4a2 2 0 0 0-1.9 1.3L5 10 3 8" />
      <rect x="3" y="10" width="18" height="8" rx="2" />
      <path d="M7 14h.01M17 14h.01" />
      <path d="M5 18v2M19 18v2" />
    </svg>
  )
}

function StaffNoticeMessage({ message, type = 'success' }) {
  const [main, ...points] = String(message || '')
    .split(/\s+·\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
  return (
    <div className={`staff-confirm-message-card is-${type}`}>
      <span className="staff-confirm-message-label">{type === 'success' ? 'ผลการดำเนินการ' : 'สาเหตุ'}</span>
      <p className="staff-confirm-message">{main || (type === 'success' ? 'ดำเนินการสำเร็จ' : 'เกิดข้อผิดพลาด')}</p>
      {points.length > 0 && (
        <ul className="staff-confirm-message-points">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StaffShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function StaffRange({ start, end, openEnded = false }) {
  const from = formatStaffPoint(start)
  const to = end ? formatStaffPoint(end) : null
  return (
    <span className="staff-rv-range">
      <span>
        <b>{from.day}</b> {from.time}
      </span>
      {!to && openEnded && (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <span className="staff-rv-range-open">ไม่จำกัดเวลา</span>
        </>
      )}
      {to && (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <span>
            <b>{to.day}</b> {to.time}
          </span>
        </>
      )}
    </span>
  )
}

function getStaffVisitKind(item) {
  if (item.request_type !== 'vehicle') return 'guest'
  if (!item.customer_id) return 'external'
  return item.user_category === 'visitor' || (!item.user_category && item.guest_name) ? 'family' : 'self'
}

function getStaffVisitOwner(item) {
  const kind = getStaffVisitKind(item)
  if (kind === 'guest') return 'แขกค้างคืน'
  return `${RESIDENT_VEHICLE_OWNER_LABEL[kind]}${item.vehicle_type ? ` · ${VEHICLE_TYPE_LABEL[item.vehicle_type]}` : ''}`
}

function getStaffVisitPerson(item) {
  const kind = getStaffVisitKind(item)
  if (kind === 'external') return `ผู้ขอจอด ${item.guest_name || '-'}${item.guest_phone ? ` · ${item.guest_phone}` : ''}`
  return `${item.first_name || ''} ${item.last_name || ''}`.trim() + (item.guest_name ? ` · ผู้มาเยี่ยม ${item.guest_name}` : '')
}

function getVisitConfirmCopy({ item, decision }, finePerHour, now) {
  if (decision === 'cancel' && item.user_category === 'visitor' && item.parked_at && !item.checked_out_at) {
    const session = getVisitorSession(item, finePerHour, now)
    return {
      title: 'ยืนยันบันทึกรถออก',
      message: 'บันทึกว่ารถคันนี้ออกจากที่จอดแล้ว?',
      note:
        session?.amount > 0
          ? `จอดเกินเวลา ${session.overtimeHours} ชั่วโมง ระบบจะคิดค่าปรับประมาณ ${formatBaht(session.amount)} ตามเวลาที่กดยืนยันจริง`
          : 'ยังจอดไม่เกินเวลา ไม่มีค่าปรับ ช่องจอดจะว่างทันที',
      action: 'ยืนยันรถออก',
      positive: true,
    }
  }
  const copy = {
    approve: { title: 'ยืนยันการอนุมัติ', message: 'อนุมัติคำขอรถคันนี้?', action: 'ยืนยันอนุมัติ', positive: true },
    reject: { title: 'ยืนยันการปฏิเสธ', message: 'ปฏิเสธคำขอรถคันนี้?', action: 'ยืนยันปฏิเสธ' },
    cancel: {
      title: 'ยืนยันการยกเลิกรายการ',
      message: 'ยกเลิกรายการรถคันนี้?',
      note: 'รายการจะเปลี่ยนสถานะเป็น "ยกเลิกแล้ว" ช่องจอดจะว่าง และยังเก็บไว้ในประวัติ ไม่ได้ลบออกจากระบบ',
      action: 'ยืนยันยกเลิก',
    },
    checkin: {
      title: 'ยืนยันเช็คอินเข้าจอด',
      message: 'บันทึกว่ารถคันนี้เข้าจอดแล้วตอนนี้?',
      note: 'ระบบจะเริ่มนับเวลาจอด 3 ชั่วโมงจากเวลาที่กดยืนยัน หากเกินจะคิดค่าปรับรายชั่วโมง',
      action: 'ยืนยันเช็คอิน',
      positive: true,
    },
    'fine-approve': {
      title: 'ยืนยันรับชำระค่าปรับ',
      message: `ยืนยันว่าได้รับค่าปรับ ${formatBaht(item.fine_amount)} แล้ว?`,
      note: item.fine_status === 'pending_review' ? 'ตรวจยอดและบัญชีผู้รับในสลิปให้ถูกต้องก่อนยืนยัน' : 'ใช้เมื่อผู้จอดชำระที่เคาน์เตอร์หรือสแกน QR ต่อหน้าเจ้าหน้าที่แล้ว',
      action: 'ยืนยันรับชำระ',
      positive: true,
    },
    'fine-reject': {
      title: 'ปฏิเสธสลิปค่าปรับ',
      message: 'สลิปไม่ถูกต้อง ให้ผู้จอดชำระใหม่?',
      note: 'สถานะค่าปรับจะกลับเป็น "ค้างชำระ" และลบสลิปที่แนบไว้',
      action: 'ยืนยันปฏิเสธสลิป',
    },
  }
  return copy[decision] || copy.reject
}

function getStaffVisitTitle(item) {
  return item.request_type === 'vehicle' ? item.vehicle_plate || '-' : item.guest_name || '-'
}

export function StaffResidentVisitsTab({ rooms, onCountChange, onSummaryChange, focusId, canManageSettings = false, canCreate = true }) {
  const pendingFocusRef = useRef(focusId)
  const [items, setItems] = useState([])
  const [parkingSettings, setParkingSettings] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [formSection, setFormSection] = useState('all')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('main')
  const [status, setStatus] = useState(RESIDENT_VISIT_VIEWS.main.defaultFilter)
  const [search, setSearch] = useState('')
  const { setPage, focusItem, resolvePage } = useListFocus(STAFF_CARD_PAGE_SIZE)
  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_STAFF_VEHICLE_FORM)
  const [formError, setFormError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [editing, setEditing] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const load = useCallback(() => {
    return axios
      .get('/api/staff/resident-visit-requests')
      .then(({ data }) => {
        const requests = data.requests || []
        setItems(requests)
        setParkingSettings(data.settings || null)
        onCountChange?.(requests.filter((item) => item.status === 'pending').length)
        if (pendingFocusRef.current) {
          const target = requests.find((item) => item.id === pendingFocusRef.current)
          pendingFocusRef.current = null
          if (target) {
            focusItem(target.id)
            setDetail(target)
          }
        }
      })
      .catch((error) => setNotice({ type: 'error', message: error.response?.data?.message || 'โหลดคำขอไม่สำเร็จ' }))
      .finally(() => setLoading(false))
  }, [onCountChange, focusItem])

  useEffect(() => {
    load()
  }, [load])

  const occupiedRooms = useMemo(() => (rooms || []).filter((room) => room.tenant?.id), [rooms])
  const finePerHour = parkingSettings?.finePerHour ?? 0
  const isVisitorForm = form.userCategory === 'visitor'
  const editingParked = Boolean(editing?.parked_at)
  const parkingOptions = useParkingOptions('/api/staff/parking/options', {
    enabled: formOpen,
    userCategory: form.userCategory,
    startAt: editingParked ? editing.parked_at : isVisitorForm ? form.startAt : editing?.start_at,
    excludeId: editing?.id,
    roomNumber: isVisitorForm ? undefined : form.roomNumber || editing?.room_number,
  })
  const keyword = search.trim().toLowerCase()
  const searched = keyword
    ? items.filter((item) =>
        matchesSearch([
          item.vehicle_plate,
          item.vehicle_model,
          item.guest_name,
          item.guest_phone,
          item.note,
          `ห้อง ${item.room_number}`,
          getStaffVisitPerson(item),
          item.customer_phone,
          getStaffVisitOwner(item),
        ], keyword, item),
      )
    : items
  const hasOpenFine = (item) => ['unpaid', 'pending_review'].includes(item.fine_status)
  const isActive = (item) => RESIDENT_VISIT_ACTIVE_PHASES.has(getStaffVisitPhase(item, now, finePerHour).key) || hasOpenFine(item)
  const matchesFilter = (item, key) => {
    if (key === 'active') return isActive(item)
    if (key === 'closed') return !isActive(item)
    if (key === 'fine') return hasOpenFine(item)
    return getStaffVisitPhase(item, now, finePerHour).key === key
  }
  const filtered = searched.filter((item) => matchesFilter(item, status))
  const activeCount = items.filter(isActive).length
  const historyCount = items.length - activeCount
  const switchView = (next) => {
    setView(next)
    setStatus(RESIDENT_VISIT_VIEWS[next].defaultFilter)
    setPage(1)
  }
  const currentPage = Math.min(resolvePage(filtered), Math.max(1, Math.ceil(filtered.length / STAFF_CARD_PAGE_SIZE)))
  const pageItems = filtered.slice((currentPage - 1) * STAFF_CARD_PAGE_SIZE, currentPage * STAFF_CARD_PAGE_SIZE)
  const pendingCount = items.filter((item) => item.status === 'pending').length
  const parkedCount = items.filter((item) => ['parked', 'overtime'].includes(getStaffVisitPhase(item, now, finePerHour).key)).length
  const expiredCount = items.filter((item) => getStaffVisitPhase(item, now, finePerHour).key === 'expired').length
  const overtimeCount = items.filter((item) => getStaffVisitPhase(item, now, finePerHour).key === 'overtime').length
  const unpaidFines = items.filter((item) => item.fine_status === 'unpaid')
  const unpaidFineCount = unpaidFines.length
  const unpaidFineAmount = unpaidFines.reduce((sum, item) => sum + (Number(item.fine_amount) || 0), 0)

  useEffect(() => {
    if (!loading) {
      onSummaryChange?.({
        total: items.length,
        pending: pendingCount,
        parked: parkedCount,
        expired: expiredCount,
        overtime: overtimeCount,
        unpaidFines: unpaidFineCount,
        unpaidFineAmount,
      })
    }
  }, [onSummaryChange, loading, items.length, pendingCount, parkedCount, expiredCount, overtimeCount, unpaidFineCount, unpaidFineAmount])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_STAFF_VEHICLE_FORM, ...defaultParkingWindow() })
    setFormSection('all')
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      ...EMPTY_STAFF_VEHICLE_FORM,
      roomNumber: item.room_number ? String(item.room_number) : '',
      userCategory: item.user_category || (item.guest_name || !item.customer_id ? 'visitor' : 'resident'),
      vehicleType: item.vehicle_type || 'car',
      parkingSpaceId: item.parking_space_id || null,
      vehiclePlate: item.vehicle_plate || '',
      vehicleModel: item.vehicle_model || '',
      guestName: item.guest_name || '',
      guestPhone: item.guest_phone || '',
      startAt: new Date(item.start_at),
      note: item.note || '',
      photos: [],
      keepPhotos: (item.vehicle_photos || []).map((photo) => photo.url),
    })
    setFormSection('all')
    setFormError('')
    setDetail(null)
    setFormOpen(true)
  }

  const review = async (requestClose) => {
    setBusy(true)
    try {
      const base = `/api/staff/resident-visit-requests/${confirm.item.id}`
      const { data } =
        confirm.decision === 'cancel'
          ? await axios.delete(base)
          : confirm.decision === 'checkin'
            ? await axios.post(`${base}/check-in`, {})
            : confirm.decision === 'fine-approve' || confirm.decision === 'fine-reject'
              ? await axios.post(`${base}/fine-review`, { decision: confirm.decision === 'fine-approve' ? 'approve' : 'reject' })
              : await axios.post(`${base}/${confirm.decision}`, {})
      requestClose()
      setDetail(null)
      setNotice({ type: 'success', message: data.message || 'บันทึกผลแล้ว' })
      await load()
    } catch (error) {
      requestClose()
      setNotice({ type: 'error', message: error.response?.data?.message || 'บันทึกผลไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'userCategory' || field === 'vehicleType') next.parkingSpaceId = null
      if (field === 'userCategory' && value === 'resident') {
        next.guestName = ''
        next.guestPhone = ''
      }
      return next
    })
    if (formError) setFormError('')
  }

  const submitVehicle = async (event, requestClose) => {
    event.preventDefault()
    const visitor = form.userCategory === 'visitor'
    if (!editing && !visitor && !form.roomNumber) return setFormError('กรุณาเลือกห้องของผู้พักอาศัย')
    if (!form.vehiclePlate.trim()) return setFormError('กรุณาระบุทะเบียนรถ')
    if (visitor && !form.guestName.trim()) return setFormError('กรุณาระบุชื่อผู้มาติดต่อ')
    if (visitor && form.guestPhone.replace(/\D/g, '').length < 9) return setFormError('กรุณาระบุเบอร์โทรผู้มาติดต่อให้ถูกต้อง')
    if (visitor && !form.startAt) return setFormError('กรุณาเลือกวันเวลาเริ่ม')
    if (!visitor && parkingOptions.residentWindow?.expired) return setFormError('สัญญาเช่าของห้องนี้หมดแล้ว ไม่สามารถลงทะเบียนรถได้')
    const selectedSpace = parkingOptions.spaces.find((space) => space.id === form.parkingSpaceId)
    if (!selectedSpace) return setFormError('กรุณาเลือกช่องจอดที่ว่าง')
    if (!selectedSpace.available && selectedSpace.id !== editing?.parking_space_id) {
      return setFormError(`ช่อง ${selectedSpace.code} ไม่ว่างในช่วงเวลาที่เลือก กรุณาเลือกช่องอื่น`)
    }
    setBusy(true)
    try {
      const photos = (await Promise.all(form.photos.map(compressImageFile))).map(({ name, dataUrl }) => ({ name, dataUrl }))
      const payload = {
        ...form,
        photos,
        startAt: form.startAt ? toLocalDateTime(form.startAt) : null,
        endAt: null,
      }
      const { data } = editing
        ? await axios.patch(`/api/staff/resident-visit-requests/${editing.id}`, payload)
        : await axios.post('/api/staff/resident-visit-requests', payload)
      requestClose()
      setForm(EMPTY_STAFF_VEHICLE_FORM)
      setEditing(null)
      setNotice({ type: 'success', message: data.message || (editing ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรถเรียบร้อยแล้ว') })
      await load()
    } catch (error) {
      setFormError(error.response?.data?.message || error.message || 'เพิ่มรถไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="staff-card staff-tab-card staff-rv-card">
      <div className="staff-card-header">
        <div>
          <h2>
            คำขอรถ / ผู้มาติดต่อ <span className="staff-count-pill">{items.length}</span>
          </h2>
          <p className="staff-rv-subtitle">
            {pendingCount > 0 ? `รออนุมัติ ${pendingCount} รายการ` : 'ไม่มีคำขอที่รออนุมัติ'}
            {overtimeCount > 0 ? ` · จอดเกินเวลา ${overtimeCount} คัน` : ''} · ผู้มาติดต่อจอดได้ 3 ชม. ค่าปรับ {formatBaht(finePerHour)}/ชม.
          </p>
        </div>
        <div className="staff-rv-header-actions">
          <span className="staff-rv-parked-chip" aria-label={`กำลังจอดอยู่ ${parkedCount} คัน`}>
            <span className="staff-rv-parked-icon" aria-hidden="true">P</span>
            <span>
              กำลังจอดอยู่ <strong>{parkedCount}</strong> คัน
            </span>
          </span>
          {unpaidFineCount > 0 && (
            <button
              type="button"
              className="staff-rv-parked-chip"
              onClick={() => {
                setView('main')
                setStatus('fine')
                setPage(1)
              }}
            >
              ค่าปรับค้าง <strong>{unpaidFineCount}</strong> รายการ · {formatBaht(unpaidFineAmount)}
            </button>
          )}
          {canManageSettings && <ParkingSettingsButton onClick={() => setSettingsOpen(true)} />}
          {canCreate && (
            <button type="button" className="staff-action-btn is-primary" onClick={openCreate}>
              + เพิ่มรถ
            </button>
          )}
        </div>
      </div>

      <div className="staff-rv-subtabs" role="tablist" aria-label="มุมมองคำขอรถ">
        {Object.entries(RESIDENT_VISIT_VIEWS).map(([key, info]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`staff-rv-subtab${view === key ? ' is-active' : ''}`}
            onClick={() => switchView(key)}
          >
            {info.label}
            <span>{key === 'main' ? activeCount : historyCount}</span>
          </button>
        ))}
      </div>

      <StaffFilterPanel
        segments={RESIDENT_VISIT_VIEWS[view].filters.map((filter) => ({
          key: filter.key,
          label: filter.label,
          className: filter.tone ? `tone-${filter.tone}` : undefined,
          count: searched.filter((item) => matchesFilter(item, filter.key)).length,
        }))}
        active={status}
        onSegment={(value) => {
          setStatus(value)
          setPage(1)
        }}
        search={search}
        onSearch={(value) => {
          setSearch(value)
          setPage(1)
        }}
        searchPlaceholder="ค้นหาทะเบียนรถ ห้อง ชื่อผู้เช่า หรือผู้มาเยี่ยม"
        resultText={`พบ ${filtered.length} จาก ${items.length} รายการ`}
        canClear={status !== RESIDENT_VISIT_VIEWS[view].defaultFilter || Boolean(keyword)}
        onClear={() => {
          setStatus(RESIDENT_VISIT_VIEWS[view].defaultFilter)
          setSearch('')
          setPage(1)
        }}
      />

      {loading && items.length === 0 ? (
        <p className="staff-empty">กำลังโหลดรายการ...</p>
      ) : filtered.length === 0 ? (
        <div className="staff-rv-empty">
          <span className="staff-rv-empty-icon" aria-hidden="true">
            <StaffCarIcon />
          </span>
          <strong>
            {keyword || status !== RESIDENT_VISIT_VIEWS[view].defaultFilter
              ? 'ไม่พบรายการตามเงื่อนไข'
              : view === 'main'
                ? 'ไม่มีรถที่กำลังจอดหรือคำขอที่รออยู่'
                : 'ยังไม่มีประวัติ'}
          </strong>
          <span>
            {keyword || status !== RESIDENT_VISIT_VIEWS[view].defaultFilter
              ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ'
              : view === 'main'
                ? canCreate ? 'กด "+ เพิ่มรถ" เพื่อบันทึกรถของผู้เช่าหรือผู้มาขอจอด' : 'ยังไม่มีรถที่บันทึกไว้'
                : 'รายการที่หมดเวลา ไม่อนุมัติ หรือยกเลิกจะแสดงที่นี่'}
          </span>
        </div>
      ) : (
        <ul className="staff-rv-list staff-ic-grid is-visit">
          {pageItems.map((item) => {
            const info = getStaffVisitPhase(item, now, finePerHour)
            const tone = STAFF_IC_TONE[info.tone] || 'pending'
            const canReview = item.status === 'pending'
            const canCancelParking = ['parked', 'overtime', 'checkin'].includes(info.key) && item.request_type === 'vehicle'
            const isCheckedIn = item.user_category === 'visitor' && item.parked_at && !item.checked_out_at
            const openFine = ['unpaid', 'pending_review'].includes(item.fine_status)
            const photos = item.vehicle_photos || []
            const reviewer = item.reviewed_by_name || item.admin_reviewed_by_name
            const rangeStart = isCheckedIn ? item.parked_at : item.start_at
            return (
              <li key={item.id} data-staff-focus={item.id} className={`staff-ic-card staff-ic-visit-card is-${tone}`}>
                <button type="button" className="staff-ic-main" onClick={() => setDetail(item)}>
                  <span className="staff-ic-head">
                    <span className="staff-ic-icon">
                      <StaffCarIcon />
                    </span>
                    <span className="staff-ic-title">
                      <strong>{getStaffVisitTitle(item)}</strong>
                      {item.vehicle_model ? <em className="staff-vc-model">{item.vehicle_model}</em> : <small>ส่งคำขอ {formatStaffDateTime(item.created_at)}</small>}
                    </span>
                    <span className={`staff-ic-status is-${tone}`}>{info.label}</span>
                  </span>
                  <span className="staff-vc-grid">
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">ประเภท</span>
                      <span className="staff-vc-value">{getStaffVisitOwner(item)}</span>
                    </span>
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">ช่องจอด / ห้อง</span>
                      <span className="staff-vc-value">
                        {item.parking_space_code ? `ช่อง ${item.parking_space_code}` : 'ไม่ระบุช่อง'} · {item.room_number ? `ห้อง ${item.room_number}` : 'ภายนอก'}
                      </span>
                    </span>
                    <span className="staff-vc-cell">
                      <span className="staff-vc-label">
                        ผู้ขอ
                        <span className={`staff-ic-role is-${item.customer_id ? 'customer' : 'external'}`}>
                          {item.customer_id ? 'ผู้เช่า' : 'ภายนอก'}
                        </span>
                      </span>
                      <span className="staff-vc-value" title={item.customer_id ? `${item.first_name || ''} ${item.last_name || ''}`.trim() : item.guest_name || ''}>
                        {item.customer_id ? `${item.first_name || ''} ${item.last_name || ''}`.trim() || '-' : item.guest_name || '-'}
                      </span>
                    </span>
                  </span>
                  <span className="staff-vc-range">
                    <span className="staff-vc-range-icon" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </span>
                    <span className="staff-vc-range-body">
                      <span className="staff-vc-label">
                        {isCheckedIn ? 'เข้าจอดจริง → จอดได้ถึง' : 'ช่วงเวลาจอด'}
                        {openFine && <ParkingStatusPill status={item.fine_status} />}
                      </span>
                      <span className="staff-vc-value">
                        {formatStaffPoint(rangeStart).day} {formatStaffPoint(rangeStart).time} น.
                        <span className="staff-vc-arrow" aria-hidden="true">→</span>
                        <span className={item.end_at ? undefined : 'staff-vc-open'}>
                          {item.end_at ? `${formatStaffPoint(item.end_at).day} ${formatStaffPoint(item.end_at).time} น.` : 'ไม่จำกัดเวลา'}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
                <div className="staff-ic-photos">
                  <span className="staff-ic-label">{photos.length > 0 ? `รูปรถ · ${photos.length} รูป` : 'รูปรถ'}</span>
                  {photos.length > 0 ? (
                    <span className="staff-ic-photo-row">
                      {photos.slice(0, 4).map((photo, index) => (
                        <button
                          key={`${photo.url}-${index}`}
                          type="button"
                          className="staff-ic-photo"
                          onClick={() => setLightbox({ photos, index, plate: getStaffVisitTitle(item) })}
                          aria-label={`ดูรูปที่ ${index + 1}`}
                        >
                          <UploadImage src={photo.url} alt={photo.name || `รูปรถ ${index + 1}`} loading="lazy" />
                          {index === 3 && photos.length > 4 && <span>+{photos.length - 4}</span>}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="staff-ic-photo-empty">
                      <StaffEmptyPhotoIcon />
                      ไม่มีรูปรถ
                    </span>
                  )}
                </div>
                <div className="staff-ic-foot">
                  <span className="staff-ic-result">
                    {item.status === 'pending' ? (
                      'ยังไม่มีผู้อนุมัติ'
                    ) : item.status === 'cancelled' ? (
                      <>
                        ยกเลิกโดย <span className="staff-actor">{item.cancelled_by_name || item.updated_by_name || '-'}</span>
                      </>
                    ) : (
                      <>
                        {item.status === 'rejected' ? 'ปฏิเสธโดย' : 'อนุมัติโดย'} <span className="staff-actor">{reviewer || '-'}</span>
                      </>
                    )}
                  </span>
                  <span className="staff-ic-actions">
                    {openFine && (
                      <button type="button" className="staff-ic-btn is-danger" onClick={() => setDetail(item)}>
                        ค่าปรับ {formatBaht(item.fine_amount)}
                      </button>
                    )}
                    {canCancelParking && (
                      <button type="button" className="staff-ic-btn is-danger" disabled={busy} onClick={() => setConfirm({ item, decision: 'cancel' })}>
                        {isCheckedIn ? 'บันทึกรถออก' : 'ยกเลิกรายการ'}
                      </button>
                    )}
                    {info.key === 'checkin' && (
                      <button type="button" className="staff-ic-btn is-primary" disabled={busy} onClick={() => setConfirm({ item, decision: 'checkin' })}>
                        เช็คอินเข้าจอด
                      </button>
                    )}
                    {canReview && (
                      <>
                        <button type="button" className="staff-ic-btn is-danger" disabled={busy} onClick={() => setConfirm({ item, decision: 'reject' })}>
                          ปฏิเสธ
                        </button>
                        <button type="button" className="staff-ic-btn is-primary" disabled={busy} onClick={() => setConfirm({ item, decision: 'approve' })}>
                          อนุมัติ
                        </button>
                      </>
                    )}
                    {!canReview && (
                      <button type="button" className="staff-ic-btn" onClick={() => setDetail(item)}>
                        ดูรายละเอียด <span aria-hidden="true">›</span>
                      </button>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <StaffPagination page={currentPage} total={filtered.length} onChange={setPage} pageSize={STAFF_CARD_PAGE_SIZE} />

      {detail && (
        <Modal title="รายละเอียดคำขอรถ" onClose={() => setDetail(null)} variant="detail">
          {(requestClose) => {
            const info = getStaffVisitPhase(detail, now, finePerHour)
            const canManage = ['pending', 'approved'].includes(detail.status) && detail.request_type === 'vehicle'
            const reviewer = detail.admin_reviewed_by_name || detail.reviewed_by_name
            const reviewedAt = detail.admin_reviewed_at || detail.reviewed_at
            const tenantName = [detail.first_name, detail.last_name].filter(Boolean).join(' ').trim()
            const fields = [
              ['ทะเบียนรถ', detail.vehicle_plate],
              ['ยี่ห้อ / รุ่น', detail.vehicle_model],
              ...(detail.customer_id
                ? [
                    [detail.guest_name ? 'ชื่อผู้แจ้ง / ผู้เช่า' : 'ชื่อผู้จอด / ผู้เช่า', tenantName],
                    ['เบอร์ผู้เช่า', detail.customer_phone],
                  ]
                : []),
              ...(detail.guest_name || !detail.customer_id
                ? [
                    [detail.request_type === 'vehicle' ? 'ชื่อผู้จอด' : 'ชื่อผู้มาติดต่อ', detail.guest_name],
                    [detail.customer_id ? 'เบอร์ผู้มาเยี่ยม' : 'เบอร์ผู้ขอจอด', detail.guest_phone],
                  ]
                : []),
            ]
            const withTime = (name, at) => (name || at ? [name, at && formatStaffDateTime(at)].filter(Boolean).join(' · ') : null)
            const reviewLabel = detail.status === 'rejected' ? 'ไม่อนุมัติโดย' : 'อนุมัติโดย'
            const requestInfo = [
              ['เลขคำขอ', `#${detail.id}`],
              ['ส่งคำขอเมื่อ', formatStaffDateTime(detail.created_at)],
              [reviewLabel, withTime(reviewer, reviewedAt) || (detail.status === 'pending' ? 'รออนุมัติ' : null)],
              ['แก้ไขล่าสุด', withTime(detail.updated_by_name, detail.updated_at) || 'ไม่เคยแก้ไข'],
              ...(detail.status === 'cancelled' ? [['ยกเลิกโดย', withTime(detail.cancelled_by_name, detail.cancelled_at), true]] : []),
              ...(detail.is_special ? [['คำขอพิเศษ', detail.special_reason || 'ไม่ระบุเหตุผล', true]] : []),
            ]
            return (
              <div className="staff-rv-detail">
                <div className={`staff-rv-detail-hero is-${info.tone}`}>
                  <span className={`staff-rv-icon is-large is-${getStaffVisitKind(detail)}`}>
                    <StaffCarIcon />
                  </span>
                  <div className="staff-rv-text">
                    <strong>{getStaffVisitTitle(detail)}</strong>
                    <span className="staff-rv-meta">
                      {detail.room_number && <span className="staff-rv-room">ห้อง {detail.room_number}</span>}
                      <span className={`staff-rv-owner is-${getStaffVisitKind(detail)}`}>{getStaffVisitOwner(detail)}</span>
                    </span>
                  </div>
                  <span className={`staff-badge status-${info.badge}`}>{info.label}</span>
                </div>
                <dl className="staff-rv-fields">
                  {fields.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || '-'}</dd>
                    </div>
                  ))}
                </dl>
                <section className="staff-rv-range-box">
                  <h4>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    {detail.request_type === 'vehicle' ? 'ช่วงเวลาจอด' : 'ช่วงเวลาเข้าพัก'}
                    {detail.end_at && <span className="staff-rv-range-total">รวม {formatRemaining(new Date(detail.end_at) - new Date(detail.start_at))}</span>}
                  </h4>
                  <div className="staff-rv-range-detail">
                    <span className="staff-rv-range-point">
                      <small>เริ่ม</small>
                      <strong>{formatStaffDateTime(detail.start_at)}</strong>
                    </span>
                    <span className="staff-rv-range-arrow" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                    <span className={`staff-rv-range-point${detail.end_at ? '' : ' is-open'}`}>
                      <small>สิ้นสุด</small>
                      <strong>{detail.end_at ? formatStaffDateTime(detail.end_at) : 'ไม่จำกัดเวลา'}</strong>
                    </span>
                  </div>
                </section>
                {detail.note && (
                  <section className="staff-rv-note-box">
                    <h4>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
                        <path d="M14 3v6h6M8 13h8M8 17h5" />
                      </svg>
                      หมายเหตุ
                    </h4>
                    <p>{detail.note}</p>
                  </section>
                )}
                {detail.request_type === 'vehicle' && <ParkingSessionPanel item={detail} finePerHour={finePerHour} alwaysShow />}
                <section className="staff-rv-request-info" aria-label="ข้อมูลคำขอ">
                  <h4 className="staff-rv-timeline-title">ข้อมูลคำขอ</h4>
                  <dl className="staff-rv-fields">
                    {requestInfo.map(([label, value, wide]) => (
                      <div key={label} className={wide ? 'is-wide' : undefined}>
                        <dt>{label}</dt>
                        <dd>{value || '-'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                {['unpaid', 'pending_review', 'paid'].includes(detail.fine_status) && (
                  <>
                    <ParkingFinePayment
                      item={detail}
                      channels={parkingSettings?.paymentChannels}
                      endpoint={`/api/staff/resident-visit-requests/${detail.id}/fine-payment`}
                      onDone={async () => {
                        const { data } = await axios.get('/api/staff/resident-visit-requests')
                        const next = (data.requests || []).find((entry) => entry.id === detail.id)
                        setItems(data.requests || [])
                        if (next) setDetail(next)
                      }}
                      onCounterPaid={() => setConfirm({ item: detail, decision: 'fine-approve' })}
                      counterBusy={busy}
                    />
                    {detail.fine_status === 'pending_review' && (
                      <div className="staff-rv-detail-manage">
                        <span className="staff-rv-detail-manage-label">ตรวจสลิปค่าปรับ</span>
                        {detail.fine_slip_path && (
                          <button
                            type="button"
                            className="staff-rv-pill"
                            onClick={() => setLightbox({ photos: [{ url: detail.fine_slip_path, name: 'สลิปค่าปรับ' }], index: 0, plate: getStaffVisitTitle(detail) })}
                          >
                            ดูสลิป
                          </button>
                        )}
                        <button type="button" className="staff-rv-pill" onClick={() => setConfirm({ item: detail, decision: 'fine-reject' })}>
                          ปฏิเสธสลิป
                        </button>
                        <button type="button" className="staff-rv-pill" onClick={() => setConfirm({ item: detail, decision: 'fine-approve' })}>
                          ยืนยันว่าชำระแล้ว
                        </button>
                      </div>
                    )}
                  </>
                )}
                {detail.vehicle_photos?.length > 0 && (
                  <section className="staff-rv-photos" aria-label="รูปรถและป้ายทะเบียน">
                    <h4 className="staff-rv-timeline-title">รูปรถ / ป้ายทะเบียน ({detail.vehicle_photos.length} รูป)</h4>
                    <div className="staff-rv-photo-grid">
                      {detail.vehicle_photos.map((photo, index) => (
                        <button
                          key={`${photo.url}-${index}`}
                          type="button"
                          className="staff-rv-photo"
                          onClick={() => setLightbox({ photos: detail.vehicle_photos, index, plate: getStaffVisitTitle(detail) })}
                          aria-label={`ดูรูปที่ ${index + 1}`}
                        >
                          <UploadImage src={photo.url} alt={photo.name || `รูปรถ ${index + 1}`} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <ProcessSteps
                  title="ขั้นตอนการดำเนินการ"
                  actorClassName="staff-actor"
                  startDate={detail.created_at}
                  endDate={detail.status === 'cancelled' ? detail.cancelled_at : detail.status === 'pending' ? null : reviewedAt}
                  waitingText={detail.status === 'pending' ? 'รออนุมัติ' : 'กำลังดำเนินการ'}
                  steps={[
                    {
                      key: 'request',
                      label: 'ส่งคำขอ',
                      by: detail.customer_id ? `${detail.first_name || ''} ${detail.last_name || ''}`.trim() : detail.guest_name,
                      date: detail.created_at,
                      icon: 'note',
                    },
                    detail.status === 'pending' || reviewedAt
                      ? {
                          key: 'review',
                          label: detail.status === 'pending' ? 'รออนุมัติ' : detail.status === 'rejected' ? 'ไม่อนุมัติ' : 'อนุมัติแล้ว',
                          by: reviewer,
                          date: detail.status === 'pending' ? null : reviewedAt,
                          icon: detail.status === 'rejected' ? 'x' : 'check',
                          tone: detail.status === 'rejected' ? 'danger' : undefined,
                          pendingText: 'กำลังรอเจ้าหน้าที่',
                        }
                      : null,
                    detail.updated_at
                      ? { key: 'edit', label: 'แก้ไขข้อมูล', by: detail.updated_by_name, date: detail.updated_at, icon: 'edit' }
                      : null,
                    detail.parked_at ? { key: 'checkin', label: 'เช็คอินเข้าจอด', date: detail.parked_at, icon: 'check' } : null,
                    detail.status === 'cancelled'
                      ? detail.checked_out_at
                        ? { key: 'checkout', label: 'บันทึกรถออก', by: detail.cancelled_by_name, date: detail.checked_out_at, icon: 'check' }
                        : { key: 'cancel', label: 'ยกเลิกรายการ', by: detail.cancelled_by_name, date: detail.cancelled_at, icon: 'x', tone: 'danger' }
                      : null,
                    detail.fine_status === 'paid'
                      ? { key: 'fine', label: `ชำระค่าปรับ ${formatBaht(detail.fine_amount)}`, by: detail.fine_paid_by_name, date: detail.fine_paid_at, icon: 'check' }
                      : null,
                  ].filter(Boolean)}
                />
                <div className="staff-rv-detail-actions">
                  {canManage && detail.status === 'pending' && (
                    <div className="staff-rv-detail-manage">
                      <span className="staff-rv-detail-manage-label">จัดการรายการ</span>
                      <button type="button" className="staff-rv-pill" onClick={() => openEdit(detail)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                        แก้ไข
                      </button>
                    </div>
                  )}
                  <div className="staff-rv-detail-primary">
                    {detail.status === 'pending' ? (
                      <>
                        <button type="button" className="staff-action-btn is-danger" onClick={() => setConfirm({ item: detail, decision: 'reject' })}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                          ปฏิเสธ
                        </button>
                        <button type="button" className="staff-action-btn is-primary" onClick={() => setConfirm({ item: detail, decision: 'approve' })}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          อนุมัติ
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                          ปิด
                        </button>
                        {canManage && detail.status === 'approved' && (
                          <button type="button" className="staff-action-btn is-danger" onClick={() => setConfirm({ item: detail, decision: 'cancel' })}>
                            {detail.user_category === 'visitor' && detail.parked_at ? 'บันทึกรถออก' : 'ยกเลิกรายการ'}
                          </button>
                        )}
                        {info.key === 'checkin' && (
                          <button type="button" className="staff-action-btn is-primary" onClick={() => setConfirm({ item: detail, decision: 'checkin' })}>
                            เช็คอินเข้าจอด
                          </button>
                        )}
                        {canManage && (
                          <button type="button" className="staff-action-btn is-primary" onClick={() => openEdit(detail)}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                            แก้ไขข้อมูล
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {confirm && (() => {
        const copy = getVisitConfirmCopy(confirm, finePerHour, now)
        return (
          <Modal title={copy.title} onClose={() => setConfirm(null)} variant="confirm">
            {(requestClose) => (
              <div className="staff-confirm-body">
                <div className={`staff-confirm-icon ${copy.positive ? 'is-success' : 'is-warning'}`}>
                  <StaffCarIcon />
                </div>
                <p className="staff-confirm-message">{copy.message}</p>
                {copy.note && <p className="staff-confirm-note">{copy.note}</p>}
                <div className="staff-confirm-details">
                  <div className="staff-confirm-detail-row">
                    <span>ทะเบียนรถ</span>
                    <strong>{getStaffVisitTitle(confirm.item)}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>ช่องจอด / ห้อง</span>
                    <strong>
                      {confirm.item.parking_space_code ? `ช่อง ${confirm.item.parking_space_code}` : 'ไม่ระบุช่อง'} ·{' '}
                      {confirm.item.room_number ? `ห้อง ${confirm.item.room_number}` : 'บุคคลภายนอก'}
                    </strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>{confirm.item.parked_at ? 'เข้าจอดจริง' : 'ช่วงเวลา'}</span>
                    <strong>
                      <StaffRange start={confirm.item.parked_at || confirm.item.start_at} end={confirm.item.end_at} openEnded />
                    </strong>
                  </div>
                </div>
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-ghost" disabled={busy} onClick={requestClose}>
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className={`staff-action-btn ${copy.positive ? 'is-primary' : 'is-danger'}`}
                    disabled={busy}
                    onClick={() => review(requestClose)}
                  >
                    {busy ? 'กำลังดำเนินการ...' : copy.action}
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )
      })()}

      {lightbox && createPortal(
        <PhotoLightbox
          photos={lightbox.photos.map((photo, index) => ({ name: photo.name || `รูปที่ ${index + 1}`, url: photo.url }))}
          initialIndex={lightbox.index}
          title={`ทะเบียน ${lightbox.plate}`}
          label="รูปรถ / ป้ายทะเบียน"
          onClose={() => setLightbox(null)}
        />,
        document.body,
      )}

      {formOpen && (
        <Modal
          title={editing ? 'แก้ไขข้อมูลรถและช่องจอด' : 'เพิ่มรถและเลือกช่องจอด'}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          variant="parking-form"
        >
          {(requestClose) => (
            <form className="staff-rv-form" onSubmit={(event) => submitVehicle(event, requestClose)} noValidate>
              <p className="staff-rv-form-note">
                {editing ? (
                  <>
                    {USER_CATEGORY_LABEL[form.userCategory]}
                    {editing.room_number ? ` · ห้อง ${editing.room_number}` : ''} · แก้ไขประเภทรถ ช่องจอด ทะเบียน วันเวลา และรูปได้
                  </>
                ) : (
                  'รถที่เจ้าหน้าที่เพิ่มจะได้รับการอนุมัติและจองช่องจอดทันที'
                )}
              </p>
              {formError && (
                <p className="staff-form-error staff-form-error-block" role="alert">
                  {formError}
                </p>
              )}
              <InspectionTopicFilter
                topics={PARKING_FORM_TOPICS}
                value={formSection}
                onChange={setFormSection}
              />
              <section className="parking-form-section" data-topic="owner" hidden={!["all", "owner"].includes(formSection)}>
                <h4 className="parking-form-section-title">ผู้ใช้และข้อมูลรถ</h4>
              <ParkingChoiceGroup
                label="ประเภทผู้ใช้"
                name="staff-rv-category"
                value={form.userCategory}
                disabled={Boolean(editing)}
                onChange={(value) => updateField('userCategory', value)}
                options={[
                  { value: 'resident', label: 'ผู้พักอาศัย', hint: 'รถยนต์ 1 คัน + จักรยานยนต์ 1 คัน ต่อผู้เช่า' },
                  { value: 'visitor', label: 'ผู้มาติดต่อ', hint: `บุคคลภายนอก · จอดได้ครั้งละ ${parkingOptions.settings?.visitorMaxHours || 3} ชั่วโมง` },
                ]}
              />
              <ParkingChoiceGroup
                label="ประเภทรถ"
                name="staff-rv-vehicle-type"
                value={form.vehicleType}
                onChange={(value) => updateField('vehicleType', value)}
                options={[
                  { value: 'car', label: VEHICLE_TYPE_LABEL.car, hint: 'สูงสุด 1 คันต่อคน' },
                  { value: 'motorcycle', label: VEHICLE_TYPE_LABEL.motorcycle, hint: 'สูงสุด 1 คันต่อคน' },
                ]}
              />
              <ParkingRulesNote userCategory={form.userCategory} finePerHour={parkingOptions.settings?.finePerHour ?? finePerHour} />
              <div className="waiting-form-grid">
                {!editing && (
                  <div className="staff-form-field">
                    <label className="staff-form-label" htmlFor="staff-rv-room">
                      {isVisitorForm ? 'มาติดต่อห้อง' : 'ห้อง'} {!isVisitorForm && <span className="staff-form-required">*</span>}
                    </label>
                    <select
                      id="staff-rv-room"
                      className="staff-form-input"
                      value={form.roomNumber}
                      onChange={(event) => updateField('roomNumber', event.target.value)}
                    >
                      <option value="">
                        {isVisitorForm ? 'ไม่ระบุห้อง (บุคคลภายนอก)' : occupiedRooms.length ? 'เลือกห้อง' : 'ยังไม่มีห้องที่มีผู้เช่า'}
                      </option>
                      {(rooms || []).map((room) => (
                        <option key={room.room_number} value={room.room_number} disabled={!room.tenant?.id}>
                          ห้อง {room.room_number} · {room.tenant?.id ? `${room.tenant.first_name} ${room.tenant.last_name}` : 'ห้องว่าง'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="staff-form-field">
                  <label className="staff-form-label" htmlFor="staff-rv-plate">
                    ทะเบียนรถ <span className="staff-form-required">*</span>
                  </label>
                  <input
                    id="staff-rv-plate"
                    className="staff-form-input"
                    maxLength={20}
                    placeholder="กข 1234"
                    value={form.vehiclePlate}
                    onChange={(event) => updateField('vehiclePlate', event.target.value)}
                  />
                </div>
                <div className="staff-form-field">
                  <label className="staff-form-label" htmlFor="staff-rv-model">
                    ยี่ห้อ / รุ่น
                  </label>
                  <input
                    id="staff-rv-model"
                    className="staff-form-input"
                    maxLength={100}
                    placeholder={form.vehicleType === 'motorcycle' ? 'เช่น Honda Wave' : 'เช่น Toyota Yaris'}
                    value={form.vehicleModel}
                    onChange={(event) => updateField('vehicleModel', event.target.value)}
                  />
                </div>
                {isVisitorForm && (
                  <>
                    <div className="staff-form-field">
                      <label className="staff-form-label" htmlFor="staff-rv-guest">
                        ชื่อผู้มาติดต่อ <span className="staff-form-required">*</span>
                      </label>
                      <input
                        id="staff-rv-guest"
                        className="staff-form-input"
                        maxLength={255}
                        placeholder="ชื่อ - นามสกุล"
                        value={form.guestName}
                        onChange={(event) => updateField('guestName', event.target.value)}
                      />
                    </div>
                    <div className="staff-form-field">
                      <label className="staff-form-label" htmlFor="staff-rv-guest-phone">
                        เบอร์ผู้มาติดต่อ <span className="staff-form-required">*</span>
                      </label>
                      <input
                        id="staff-rv-guest-phone"
                        type="tel"
                        className="staff-form-input"
                        maxLength={20}
                        placeholder="08x-xxx-xxxx"
                        value={form.guestPhone}
                        onChange={(event) => updateField('guestPhone', event.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              </section>
              <section className="parking-form-section" data-topic="time" hidden={!["all", "time"].includes(formSection)}>
                <h4 className="parking-form-section-title">วันเวลาจอด</h4>
              {!isVisitorForm ? (
                <ResidentContractWindow
                  startLabel={editing ? formatStaffDateTime(editing.start_at) : 'ทันทีที่บันทึก'}
                  endAt={parkingOptions.residentWindow?.endAt}
                  note={
                    !editing && !form.roomNumber
                      ? 'เลือกห้องก่อน ระบบจะใช้วันสิ้นสุดสัญญาเช่าของห้องนั้นเป็นวันสุดท้ายที่จอดได้'
                      : 'ผู้พักอาศัยจอดได้ตลอดสัญญาเช่า ไม่ต้องกำหนดวันเวลาเอง ระบบยกเลิกสิทธิ์อัตโนมัติเมื่อสัญญาสิ้นสุดหรือย้ายออก'
                  }
                />
              ) : (
                <div className="staff-rv-time-box">
                  {editingParked ? (
                    <p className="staff-rv-form-note">
                      เช็คอินเข้าจอดแล้วเมื่อ {formatStaffDateTime(editing.parked_at)} · เวลาจอดนับจากเวลาเช็คอินจริงและแก้ไขไม่ได้
                    </p>
                  ) : (
                    <div className="waiting-form-grid">
                      <div className="staff-form-field">
                        <label className="staff-form-label" htmlFor="staff-rv-start">
                          เริ่ม <span className="staff-form-required">*</span>
                        </label>
                        <ThaiDatePicker
                          id="staff-rv-start"
                          valueType="date"
                          className="staff-form-input"
                          placeholder="เลือกวันเวลา"
                          value={form.startAt}
                          onChange={(date) => updateField('startAt', date)}
                          minDate={startOfToday()}
                          showTimeSelect
                          timeIntervals={15}
                          portalId="staff-date-portal"
                        />
                      </div>
                      <div className="staff-form-field">
                        <VisitorTimeSummary startAt={form.startAt} />
                      </div>
                    </div>
                  )}
                  {!editing && (
                    <p className="staff-rv-photo-hint">ถ้าเวลาเริ่มไม่เกินเวลาปัจจุบัน ระบบจะถือว่ารถเข้าจอดแล้ว (เช็คอินอัตโนมัติ) และเริ่มนับ 3 ชั่วโมงจากเวลาเริ่ม</p>
                  )}
                </div>
              )}
              </section>
              <section className="parking-form-section" data-topic="space" hidden={!["all", "space"].includes(formSection)}>
                <h4 className="parking-form-section-title">เลือกช่องจอด</h4>
              <ParkingSpacePicker
                spaces={parkingOptions.spaces}
                vehicleType={form.vehicleType}
                value={form.parkingSpaceId}
                loading={parkingOptions.loading}
                error={parkingOptions.error}
                showOccupant
                keepId={editing && editing.vehicle_type === form.vehicleType ? editing.parking_space_id : null}
                onChange={(spaceId) => updateField('parkingSpaceId', spaceId)}
              />
              </section>
              <section className="parking-form-section" data-topic="extra" hidden={!["all", "extra"].includes(formSection)}>
                <h4 className="parking-form-section-title">รูปรถและหมายเหตุ</h4>
              <div className="staff-form-field">
                <div className="staff-rv-photo-head">
                  <span className="staff-form-label">รูปรถ / ป้ายทะเบียน</span>
                  <span className="staff-rv-photo-tag">ไม่บังคับ</span>
                  <span className="staff-rv-photo-counter">
                    {(form.keepPhotos?.length || 0) + form.photos.length}/{STAFF_VEHICLE_MAX_PHOTOS}
                  </span>
                </div>
                <p className="staff-rv-photo-hint">ถ่ายให้เห็นตัวรถและป้ายทะเบียนชัดเจน · JPG, PNG หรือ WebP · ไม่เกิน 5 MB ต่อรูป</p>
                {editing && form.keepPhotos?.length > 0 && (
                  <div className="staff-rv-photo-grid staff-rv-keep-photos">
                    {(editing.vehicle_photos || [])
                      .filter((photo) => form.keepPhotos.includes(photo.url))
                      .map((photo) => (
                        <div key={photo.url} className="staff-rv-photo is-keep">
                          <UploadImage src={photo.url} alt={photo.name || 'รูปรถ'} loading="lazy" />
                          <button
                            type="button"
                            className="staff-rv-photo-remove"
                            onClick={() => updateField('keepPhotos', form.keepPhotos.filter((url) => url !== photo.url))}
                            aria-label="ลบรูปนี้"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                  </div>
                )}
                <ParcelPhotoPicker
                  id="staff-rv-photos"
                  heading={false}
                  maxPhotos={STAFF_VEHICLE_MAX_PHOTOS - (form.keepPhotos?.length || 0)}
                  files={form.photos}
                  onChange={(files) => updateField('photos', files)}
                  onError={setFormError}
                />
              </div>
              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="staff-rv-note">
                  หมายเหตุ
                </label>
                <textarea
                  id="staff-rv-note"
                  className="staff-form-input staff-rv-note"
                  rows={4}
                  maxLength={500}
                  placeholder="เช่น จอดได้เฉพาะช่องด้านหลังอาคาร หรือรายละเอียดเพิ่มเติม"
                  value={form.note}
                  onChange={(event) => updateField('note', event.target.value)}
                />
                <span className="staff-rv-hint">{form.note.length}/500</span>
              </div>
              </section>
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="submit" className="staff-action-btn is-primary" disabled={busy}>
                  {busy ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'บันทึกรถ'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {settingsOpen && (
        <Modal title="ตั้งค่าที่จอดรถและค่าปรับ" onClose={() => setSettingsOpen(false)} variant="waiting-form">
          {(requestClose) => (
            <ParkingSettingsForm
              endpoint="/api/staff/parking/settings"
              onCancel={requestClose}
              onSaved={async (data) => {
                requestClose()
                setNotice({ type: 'success', message: data.message || 'บันทึกการตั้งค่าแล้ว' })
                await load()
              }}
            />
          )}
        </Modal>
      )}

      {notice && (
        <Modal title={notice.type === 'success' ? 'สำเร็จ' : 'เกิดข้อผิดพลาด'} onClose={() => setNotice(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className={`staff-confirm-icon ${notice.type === 'success' ? 'is-success' : 'is-warning'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {notice.type === 'success' ? <polyline points="20 6 9 17 4 12" /> : <path d="M12 9v4M12 17h.01" />}
                </svg>
              </div>
              <StaffNoticeMessage message={notice.message} type={notice.type} />
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                  ปิด
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  )
}

const SAFETY_INCIDENT_TYPES = [
  ['accident', 'อุบัติเหตุ'],
  ['security', 'ความปลอดภัย'],
  ['fire', 'ไฟไหม้ / ควัน'],
  ['medical', 'เจ็บป่วยฉุกเฉิน'],
  ['other', 'อื่น ๆ'],
]
const SAFETY_INCIDENT_TYPE_LABEL = Object.fromEntries(SAFETY_INCIDENT_TYPES)
const SAFETY_SEVERITY_LABEL = { urgent: 'ด่วน', normal: 'ทั่วไป' }
const SAFETY_REPORTER_ROLE_LABEL = { Customer: 'ผู้เช่า', Staff: 'เจ้าหน้าที่', Admin: 'Admin', Owner: 'Owner' }
const SAFETY_STATUS = {
  pending: { label: 'รอตรวจสอบ', badge: 'pending', tone: 'warning' },
  reviewed: { label: 'ตรวจสอบแล้ว', badge: 'reviewed', tone: 'success' },
  cancelled: { label: 'ยกเลิกแล้ว', badge: 'cancelled', tone: 'muted' },
}
const EMPTY_SAFETY_FORM = { incidentType: 'security', description: '', roomNumber: '', photos: [] }
const STAFF_SAFETY_MAX_PHOTOS = 4

export function StaffSafetyTab({ rooms, onCountChange, onSummaryChange, focusId }) {
  const pendingFocusRef = useRef(focusId)
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const { setPage, focusItem, resolvePage } = useListFocus(STAFF_CARD_PAGE_SIZE)
  const [detail, setDetail] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_SAFETY_FORM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [reviewTarget, setReviewTarget] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(() => {
    return axios
      .get('/api/staff/safety-incidents')
      .then(({ data }) => {
        const list = data.incidents || []
        setIncidents(list)
        onCountChange?.(list.filter((item) => item.status === 'pending').length)
        if (pendingFocusRef.current) {
          const target = list.find((item) => item.id === pendingFocusRef.current)
          pendingFocusRef.current = null
          if (target) {
            focusItem(target.id)
            setDetail(target)
          }
        }
      })
      .catch((error) => setNotice({ type: 'error', message: error.response?.data?.message || 'โหลดรายการแจ้งเหตุไม่สำเร็จ' }))
      .finally(() => setLoading(false))
  }, [onCountChange, focusItem])

  useEffect(() => {
    load()
  }, [load])

  const keyword = search.trim().toLowerCase()
  const searched = keyword
    ? incidents.filter((item) =>
        matchesSearch([
          SAFETY_INCIDENT_TYPE_LABEL[item.incident_type] || item.incident_type,
          item.description,
          item.review_note,
          item.room_number ? `ห้อง ${item.room_number}` : '',
          item.reporter_name,
          SAFETY_REPORTER_ROLE_LABEL[item.reporter_role],
          SAFETY_SEVERITY_LABEL[item.severity],
        ], keyword, item),
      )
    : incidents
  const filtered = status === 'all' ? searched : searched.filter((item) => item.status === status)
  const currentPage = Math.min(resolvePage(filtered), Math.max(1, Math.ceil(filtered.length / STAFF_CARD_PAGE_SIZE)))
  const pageItems = filtered.slice((currentPage - 1) * STAFF_CARD_PAGE_SIZE, currentPage * STAFF_CARD_PAGE_SIZE)

  const pendingCount = incidents.filter((item) => item.status === 'pending').length
  const urgentCount = incidents.filter((item) => item.status === 'pending' && item.severity === 'urgent').length
  const reviewedCount = incidents.filter((item) => item.status === 'reviewed').length
  const cancelledCount = incidents.filter((item) => item.status === 'cancelled').length

  useEffect(() => {
    if (!loading) onSummaryChange?.({ total: incidents.length, pending: pendingCount, urgent: urgentCount, reviewed: reviewedCount, cancelled: cancelledCount })
  }, [onSummaryChange, loading, incidents.length, pendingCount, urgentCount, reviewedCount, cancelledCount])

  const openReview = (item) => {
    setReviewNote('')
    setReviewTarget(item)
  }

  const submitReview = async (requestClose) => {
    setBusy(true)
    try {
      const { data } = await axios.patch(
        `/api/staff/safety-incidents/${reviewTarget.id}/review`,
        { reviewNote }
      )
      requestClose()
      setDetail(null)
      setNotice({ type: 'success', message: data.message || 'บันทึกผลตรวจสอบแล้ว' })
      await load()
    } catch (error) {
      requestClose()
      setNotice({ type: 'error', message: error.response?.data?.message || 'บันทึกผลไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  const openCancel = (item) => {
    setCancelReason('')
    setCancelTarget(item)
  }

  const submitCancel = async (requestClose) => {
    setBusy(true)
    try {
      const { data } = await axios.patch(
        `/api/staff/safety-incidents/${cancelTarget.id}/cancel`,
        { reason: cancelReason }
      )
      requestClose()
      setDetail(null)
      setNotice({ type: 'success', message: data.message || 'ยกเลิกรายงานเหตุแล้ว' })
      await load()
    } catch (error) {
      requestClose()
      setNotice({ type: 'error', message: error.response?.data?.message || 'ยกเลิกไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  const submit = async (event, requestClose) => {
    event.preventDefault()
    if (!form.description.trim()) return setFormError('กรุณาระบุรายละเอียดเหตุการณ์')
    setBusy(true)
    try {
      const photos = (await Promise.all(form.photos.map(compressImageFile))).map(({ name, dataUrl }) => ({ name, dataUrl }))
      const { data } = await axios.post(
        '/api/staff/safety-incidents',
        {
          incidentType: form.incidentType,
          description: form.description,
          roomNumber: form.roomNumber || undefined,
          photos,
        }
      )
      requestClose()
      setForm(EMPTY_SAFETY_FORM)
      setNotice({
        type: 'success',
        message: `${data.message || 'ส่งรายงานแล้ว'}${data.severity ? ` · ระบบจัดระดับเป็น ${SAFETY_SEVERITY_LABEL[data.severity]}` : ''}`,
      })
      await load()
    } catch (error) {
      setFormError(error.response?.data?.message || 'ส่งรายงานไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="staff-card staff-tab-card staff-rv-card">
      <div className="staff-card-header">
        <div>
          <h2>
            แจ้งเหตุฉุกเฉิน <span className="staff-count-pill">{incidents.length}</span>
          </h2>
          <p className="staff-rv-subtitle">
            {pendingCount > 0 ? `รอรับเรื่อง ${pendingCount} รายการ` : 'ไม่มีรายงานที่รอรับเรื่อง'} · รายงานจากผู้เช่าและเจ้าหน้าที่
          </p>
        </div>
        <button
          type="button"
          className="staff-action-btn is-danger"
          onClick={() => {
            setForm(EMPTY_SAFETY_FORM)
            setFormError('')
            setFormOpen(true)
          }}
        >
          + แจ้งเหตุ
        </button>
      </div>

      <StaffFilterPanel
        segments={[
          { key: 'all', label: 'ทั้งหมด', count: searched.length },
          ...Object.entries(SAFETY_STATUS).map(([key, info]) => ({
            key,
            label: info.label,
            className: `tone-${info.tone}`,
            count: searched.filter((item) => item.status === key).length,
          })),
        ]}
        active={status}
        onSegment={(value) => {
          setStatus(value)
          setPage(1)
        }}
        search={search}
        onSearch={(value) => {
          setSearch(value)
          setPage(1)
        }}
        searchPlaceholder="ค้นหาประเภทเหตุ ห้อง ผู้แจ้ง รายละเอียด หรือผลตรวจสอบ"
        resultText={`พบ ${filtered.length} จาก ${incidents.length} รายการ`}
        canClear={status !== 'all' || Boolean(keyword)}
        onClear={() => {
          setStatus('all')
          setSearch('')
          setPage(1)
        }}
      />

      {loading && incidents.length === 0 ? (
        <p className="staff-empty">กำลังโหลดรายการ...</p>
      ) : filtered.length === 0 ? (
        <div className="staff-rv-empty">
          <span className="staff-rv-empty-icon is-danger" aria-hidden="true">
            <StaffShieldIcon />
          </span>
          <strong>{incidents.length ? 'ไม่พบรายการตามเงื่อนไข' : 'ยังไม่มีการแจ้งเหตุ'}</strong>
          <span>{incidents.length ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : 'กด "+ แจ้งเหตุ" เมื่อพบเหตุฉุกเฉินหรือปัญหาความปลอดภัย'}</span>
        </div>
      ) : (
        <ul className="staff-rv-list staff-ic-grid">
          {pageItems.map((item) => {
            const info = SAFETY_STATUS[item.status] || SAFETY_STATUS.pending
            const tone = STAFF_IC_TONE[info.tone] || 'pending'
            const photos = item.photos || []
            const typeLabel = SAFETY_INCIDENT_TYPE_LABEL[item.incident_type] || item.incident_type
            return (
              <li
                key={item.id}
                data-staff-focus={item.id}
                className={`staff-ic-card staff-ic-safety-card is-${tone}${item.severity === 'urgent' ? ' is-urgent' : ''}`}
              >
                <button type="button" className="staff-ic-main" onClick={() => setDetail(item)}>
                  <span className="staff-ic-head">
                    <span className="staff-ic-icon">
                      <StaffShieldIcon />
                    </span>
                    <span className="staff-ic-title">
                      <strong>{typeLabel}</strong>
                      <small>แจ้งเมื่อ {formatStaffDateTime(item.created_at)}</small>
                    </span>
                    <span className={`staff-ic-status is-${tone}`}>{info.label}</span>
                  </span>
                  <span className="staff-ic-info">
                    <span className="staff-ic-cell">
                      <span className="staff-ic-label">ระดับ</span>
                      <span className={`staff-ic-level is-${item.severity}`}>
                        <span aria-hidden="true" />
                        {SAFETY_SEVERITY_LABEL[item.severity] || item.severity}
                      </span>
                    </span>
                    <span className="staff-ic-cell">
                      <span className="staff-ic-label">ห้อง</span>
                      <span className="staff-ic-value">{item.room_number ? `ห้อง ${item.room_number}` : 'ไม่ระบุ'}</span>
                    </span>
                    <span className="staff-ic-cell is-wide">
                      <span className="staff-ic-label">ผู้แจ้ง</span>
                      <span className="staff-ic-value">
                        <span className="staff-ic-name">{item.reporter_name}</span>
                        <span className={`staff-ic-role is-${String(item.reporter_role || '').toLowerCase()}`}>
                          {SAFETY_REPORTER_ROLE_LABEL[item.reporter_role] || item.reporter_role}
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="staff-ic-section">
                    <span className="staff-ic-label">รายละเอียดเหตุการณ์</span>
                    <span className="staff-ic-desc">{item.description}</span>
                  </span>
                </button>
                <div className="staff-ic-photos">
                  <span className="staff-ic-label">{photos.length > 0 ? `รูปประกอบ · ${photos.length} รูป` : 'รูปประกอบ'}</span>
                  {photos.length > 0 ? (
                    <span className="staff-ic-photo-row">
                      {photos.slice(0, 4).map((photo, index) => (
                        <button
                          key={`${photo.url}-${index}`}
                          type="button"
                          className="staff-ic-photo"
                          onClick={() => setLightbox({ photos, index, title: typeLabel })}
                          aria-label={`ดูรูปที่ ${index + 1}`}
                        >
                          <UploadImage src={photo.url} alt={photo.name || `รูปประกอบ ${index + 1}`} loading="lazy" />
                          {index === 3 && photos.length > 4 && <span>+{photos.length - 4}</span>}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="staff-ic-photo-empty">
                      <StaffEmptyPhotoIcon />
                      ไม่มีรูปประกอบ
                    </span>
                  )}
                </div>
                <div className="staff-ic-foot">
                  <span className="staff-ic-result">
                    {item.status === 'reviewed' ? (
                      <>
                        ตรวจโดย <span className="staff-actor">{item.reviewed_by_name || '-'}</span>
                      </>
                    ) : item.status === 'cancelled' ? (
                      <>
                        ยกเลิกโดย <span className="staff-actor">{item.cancelled_by_name || '-'}</span>
                      </>
                    ) : (
                      'ยังไม่มีผู้รับเรื่อง'
                    )}
                  </span>
                  <span className="staff-ic-actions">
                    {item.status === 'pending' ? (
                      <>
                        <button type="button" className="staff-ic-btn is-danger" disabled={busy} onClick={() => openCancel(item)}>
                          ยกเลิก
                        </button>
                        <button type="button" className="staff-ic-btn is-primary" disabled={busy} onClick={() => openReview(item)}>
                          รับเรื่อง
                        </button>
                      </>
                    ) : (
                      <button type="button" className="staff-ic-btn" onClick={() => setDetail(item)}>
                        ดูรายละเอียด <span aria-hidden="true">›</span>
                      </button>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <StaffPagination page={currentPage} total={filtered.length} onChange={setPage} pageSize={STAFF_CARD_PAGE_SIZE} />

      {detail && (
        <Modal title="รายละเอียดการแจ้งเหตุ" onClose={() => setDetail(null)} variant="detail">
          {() => {
            const info = SAFETY_STATUS[detail.status] || SAFETY_STATUS.pending
            return (
              <div className="staff-rv-detail">
                <div className={`staff-rv-detail-hero is-${info.tone}`}>
                  <span className={`staff-rv-icon is-large is-safety${detail.severity === 'urgent' ? ' is-urgent' : ''}`}>
                    <StaffShieldIcon />
                  </span>
                  <div className="staff-rv-text">
                    <strong>{SAFETY_INCIDENT_TYPE_LABEL[detail.incident_type] || detail.incident_type}</strong>
                    <span className="staff-rv-meta">
                      <span className={`staff-rv-level is-${detail.severity}`}>
                        <span aria-hidden="true" />
                        ระดับ{SAFETY_SEVERITY_LABEL[detail.severity] || detail.severity}
                      </span>
                      {detail.room_number && <span className="staff-rv-room">ห้อง {detail.room_number}</span>}
                    </span>
                  </div>
                  <span className={`staff-badge status-${info.badge}`}>{info.label}</span>
                </div>
                <dl className="staff-rv-fields">
                  <div>
                    <dt>ผู้แจ้ง</dt>
                    <dd>{detail.reporter_name}</dd>
                  </div>
                  <div>
                    <dt>สถานะผู้แจ้ง</dt>
                    <dd>{SAFETY_REPORTER_ROLE_LABEL[detail.reporter_role] || detail.reporter_role}</dd>
                  </div>
                  <div className="is-wide">
                    <dt>รายละเอียดเหตุการณ์</dt>
                    <dd>{detail.description}</dd>
                  </div>
                  {detail.status === 'reviewed' && (
                    <div className="is-wide">
                      <dt>ผลการตรวจสอบ</dt>
                      <dd>{detail.review_note || '-'}</dd>
                    </div>
                  )}
                  {detail.status === 'cancelled' && (
                    <div className="is-wide">
                      <dt>เหตุผลที่ยกเลิก</dt>
                      <dd>{detail.cancel_reason || '-'}</dd>
                    </div>
                  )}
                </dl>
                {detail.photos?.length > 0 && (
                  <section className="staff-rv-photos" aria-label="รูปประกอบการแจ้งเหตุ">
                    <h4 className="staff-rv-timeline-title">รูปประกอบ ({detail.photos.length} รูป)</h4>
                    <div className="staff-rv-photo-grid">
                      {detail.photos.map((photo, index) => (
                        <button
                          key={`${photo.url}-${index}`}
                          type="button"
                          className="staff-rv-photo"
                          onClick={() => setLightbox({ photos: detail.photos, index, title: SAFETY_INCIDENT_TYPE_LABEL[detail.incident_type] || detail.incident_type })}
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
                  actorClassName="staff-actor"
                  startDate={detail.created_at}
                  endDate={detail.status === 'cancelled' ? detail.cancelled_at : detail.status === 'reviewed' ? detail.reviewed_at : null}
                  waitingText="รอเจ้าหน้าที่รับเรื่อง"
                  steps={[
                    { key: 'report', label: 'แจ้งเหตุ', by: detail.reporter_name, date: detail.created_at, icon: 'shield' },
                    detail.status === 'cancelled'
                      ? { key: 'cancel', label: 'ยกเลิกแล้ว', by: detail.cancelled_by_name, date: detail.cancelled_at, icon: 'x', tone: 'danger' }
                      : {
                          key: 'review',
                          label: detail.status === 'reviewed' ? 'ตรวจสอบแล้ว' : 'รอรับเรื่อง',
                          by: detail.reviewed_by_name,
                          date: detail.status === 'reviewed' ? detail.reviewed_at : null,
                          icon: 'check',
                          pendingText: 'กำลังรอเจ้าหน้าที่',
                        },
                  ]}
                />
                {detail.status === 'pending' && (
                  <div className={`staff-form-actions staff-safety-detail-actions${detail.severity === 'urgent' ? ' is-urgent' : ''}`}>
                    <button type="button" className="staff-safety-cancel-btn" onClick={() => openCancel(detail)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="m15 9-6 6M9 9l6 6" />
                      </svg>
                      ยกเลิกรายงาน
                    </button>
                    <button type="button" className="staff-safety-review-btn" onClick={() => openReview(detail)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {detail.severity === 'urgent' ? (
                          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
                        ) : (
                          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        )}
                      </svg>
                      {detail.severity === 'urgent' ? 'รับเรื่องด่วน' : 'รับเรื่อง / บันทึกผล'}
                    </button>
                  </div>
                )}
              </div>
            )
          }}
        </Modal>
      )}

      {reviewTarget && (
        <Modal title="รับเรื่องและบันทึกผล" onClose={() => setReviewTarget(null)} variant="waiting-form">
          {(requestClose) => (
            <div className="staff-rv-form">
              <div className="staff-rv-review-summary">
                <span className={`staff-rv-icon is-safety${reviewTarget.severity === 'urgent' ? ' is-urgent' : ''}`}>
                  <StaffShieldIcon />
                </span>
                <div className="staff-rv-text">
                  <strong>{SAFETY_INCIDENT_TYPE_LABEL[reviewTarget.incident_type] || reviewTarget.incident_type}</strong>
                  <span className="staff-rv-desc">{reviewTarget.description}</span>
                </div>
              </div>
              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="staff-safety-review-note">
                  บันทึกผลหรือการดำเนินการ
                </label>
                <textarea
                  id="staff-safety-review-note"
                  className="staff-form-input"
                  rows={4}
                  maxLength={500}
                  placeholder="เช่น ตรวจสอบพื้นที่แล้ว แจ้งผู้เกี่ยวข้องเรียบร้อย"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                />
                <span className="staff-rv-hint">{reviewNote.length}/500 · ผู้แจ้งจะเห็นผลการตรวจสอบนี้</span>
              </div>
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" disabled={busy} onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="button" className="staff-action-btn is-primary" disabled={busy} onClick={() => submitReview(requestClose)}>
                  {busy ? 'กำลังบันทึก...' : 'บันทึกว่าตรวจสอบแล้ว'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {cancelTarget && (
        <Modal title="ยกเลิกรายงานเหตุ" onClose={() => setCancelTarget(null)} variant="waiting-form">
          {(requestClose) => (
            <div className="staff-rv-form">
              <div className="staff-rv-review-summary">
                <span className={`staff-rv-icon is-safety${cancelTarget.severity === 'urgent' ? ' is-urgent' : ''}`}>
                  <StaffShieldIcon />
                </span>
                <div className="staff-rv-text">
                  <strong>{SAFETY_INCIDENT_TYPE_LABEL[cancelTarget.incident_type] || cancelTarget.incident_type}</strong>
                  <span className="staff-rv-desc">{cancelTarget.description}</span>
                </div>
              </div>
              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="staff-safety-cancel-reason">
                  เหตุผลที่ยกเลิก (ถ้ามี)
                </label>
                <textarea
                  id="staff-safety-cancel-reason"
                  className="staff-form-input"
                  rows={3}
                  maxLength={500}
                  placeholder="เช่น แจ้งซ้ำ, แจ้งผิด, ตรวจแล้วไม่พบเหตุ"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
                <span className="staff-rv-hint">{cancelReason.length}/500 · ผู้แจ้งจะเห็นว่ารายงานถูกยกเลิกพร้อมเหตุผลนี้</span>
              </div>
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" disabled={busy} onClick={requestClose}>
                  กลับ
                </button>
                <button type="button" className="staff-action-btn is-danger" disabled={busy} onClick={() => submitCancel(requestClose)}>
                  {busy ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกรายงาน'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {formOpen && (
        <Modal title="แจ้งเหตุฉุกเฉิน / ความปลอดภัย" onClose={() => setFormOpen(false)} variant="waiting-form">
          {(requestClose) => (
            <form className="staff-rv-form" onSubmit={(event) => submit(event, requestClose)} noValidate>
              <div className="staff-rv-alert" role="note">
                หากมีอันตรายต่อชีวิต โทร <b>191</b> (ตำรวจ) <b>199</b> (ดับเพลิง) หรือ <b>1669</b> (การแพทย์ฉุกเฉิน) ทันที
              </div>
              {formError && (
                <p className="staff-form-error staff-form-error-block" role="alert">
                  {formError}
                </p>
              )}
              <div className="staff-form-field">
                <span className="staff-form-label">ประเภทเหตุ</span>
                <div className="staff-rv-types" role="radiogroup" aria-label="ประเภทเหตุ">
                  {SAFETY_INCIDENT_TYPES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={form.incidentType === value}
                      className={`staff-rv-type${form.incidentType === value ? ' is-active' : ''}`}
                      onClick={() => setForm({ ...form, incidentType: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="staff-safety-room">
                  ห้องที่เกี่ยวข้อง (ถ้ามี)
                </label>
                <select
                  id="staff-safety-room"
                  className="staff-form-input"
                  value={form.roomNumber}
                  onChange={(event) => setForm({ ...form, roomNumber: event.target.value })}
                >
                  <option value="">ไม่ระบุห้อง</option>
                  {(rooms || []).map((room) => (
                    <option key={room.room_number} value={room.room_number}>
                      ห้อง {room.room_number}
                    </option>
                  ))}
                </select>
              </div>
              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="staff-safety-description">
                  รายละเอียดเหตุการณ์ <span className="staff-form-required">*</span>
                </label>
                <textarea
                  id="staff-safety-description"
                  className="staff-form-input"
                  rows={4}
                  maxLength={1000}
                  placeholder="ระบุสถานที่ เวลา และสิ่งที่เกิดขึ้น"
                  value={form.description}
                  onChange={(event) => {
                    setForm({ ...form, description: event.target.value })
                    if (formError) setFormError('')
                  }}
                />
                <span className="staff-rv-hint">
                  ระบบจะประเมินระดับความเร่งด่วนให้อัตโนมัติ · {form.description.length}/1000
                </span>
              </div>
              <div className="staff-form-field">
                <span className="staff-form-label">
                  รูปประกอบ <span className="staff-rv-hint">(ไม่บังคับ สูงสุด {STAFF_SAFETY_MAX_PHOTOS} รูป)</span>
                </span>
                <ParcelPhotoPicker
                  id="staff-safety-photos"
                  heading={false}
                  maxPhotos={STAFF_SAFETY_MAX_PHOTOS}
                  files={form.photos}
                  onChange={(files) => setForm((current) => ({ ...current, photos: files }))}
                  onError={setFormError}
                />
              </div>
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button type="submit" className="staff-action-btn is-danger" disabled={busy || !form.description.trim()}>
                  {busy ? 'กำลังส่ง...' : 'ส่งรายงาน'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {lightbox && createPortal(
        <PhotoLightbox
          photos={lightbox.photos.map((photo, index) => ({ name: photo.name || `รูปที่ ${index + 1}`, url: photo.url }))}
          initialIndex={lightbox.index}
          title={lightbox.title}
          label="รูปประกอบการแจ้งเหตุ"
          onClose={() => setLightbox(null)}
        />,
        document.body,
      )}

      {notice && (
        <Modal title={notice.type === 'success' ? 'สำเร็จ' : 'เกิดข้อผิดพลาด'} onClose={() => setNotice(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className={`staff-confirm-icon ${notice.type === 'success' ? 'is-success' : 'is-warning'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {notice.type === 'success' ? <polyline points="20 6 9 17 4 12" /> : <path d="M12 9v4M12 17h.01" />}
                </svg>
              </div>
              <StaffNoticeMessage message={notice.message} type={notice.type} />
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                  ปิด
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  )
}

function StaffMain() {
  const navigate = useNavigate()
  const [staffUser, setStaffUser] = useState(() => {
    const storedUser = sessionStorage.getItem('user')
    if (!storedUser) return null
    try {
      return JSON.parse(storedUser)
    } catch {
      return null
    }
  })
  const [waitingList, setWaitingList] = useState([])
  const [parcels, setParcels] = useState([])
  const [parcelsLoading, setParcelsLoading] = useState(true)
  const [parcelsError, setParcelsError] = useState('')
  const [parcelSearch, setParcelSearch] = useState('')
  const [parcelStatusFilter, setParcelStatusFilter] = useState('all')
  const [parcelPage, setParcelPage] = useState(1)
  const [parcelForm, setParcelForm] = useState({
    room_number: '',
    sender_name: '',
    tracking_number: '',
    description: '',
  })
  const [parcelSubmitting, setParcelSubmitting] = useState(false)
  const [parcelSaveConfirm, setParcelSaveConfirm] = useState(false)
  const [parcelFormOpen, setParcelFormOpen] = useState(false)
  const [parcelFormError, setParcelFormError] = useState('')
  const [parcelPhotos, setParcelPhotos] = useState([])
  const [parcelPhotoError, setParcelPhotoError] = useState('')
  const [parcelPhotoPreview, setParcelPhotoPreview] = useState(null)
  const [parcelDetail, setParcelDetail] = useState(null)
  const filteredParcels = parcels.filter((parcel) => {
    if (parcelStatusFilter !== 'all' && parcel.status !== parcelStatusFilter) return false
    const keyword = parcelSearch.trim().toLocaleLowerCase('th-TH')
    return matchesSearch([
      parcel.room_number,
      parcel.first_name,
      parcel.last_name,
      parcel.phone,
      parcel.tracking_number,
      parcel.sender_name,
      parcel.description,
    ], keyword, parcel)
  })
  const currentParcelPage = Math.min(parcelPage, Math.max(1, Math.ceil(filteredParcels.length / STAFF_LIST_PAGE_SIZE)))
  const pagedParcels = filteredParcels.slice((currentParcelPage - 1) * STAFF_LIST_PAGE_SIZE, currentParcelPage * STAFF_LIST_PAGE_SIZE)
  const [waitingListModalOpen, setWaitingListModalOpen] = useState(false)
  const [waitingListEditing, setWaitingListEditing] = useState(null)
  const [waitingListForm, setWaitingListForm] = useState({
    full_name: '',
    phone: '',
    room_preference: '',
    note: '',
    desired_move_in_date: '',
  })
  const [waitingListError, setWaitingListError] = useState('')
  const [waitingListFieldErrors, setWaitingListFieldErrors] = useState({})
  const [waitingListSubmitting, setWaitingListSubmitting] = useState(false)
  const [waitingListPage, setWaitingListPage] = useState(1)
  const [inspectionsPage, setInspectionsPage] = useState(1)
  const [inspectionSearch, setInspectionSearch] = useState('')
  const [inspectionResultFilter, setInspectionResultFilter] = useState('all')
  const [inspectionSort, setInspectionSort] = useState('newest')
  const [inspectionKind, setInspectionKind] = useState('all')
  const [waitingListDelete, setWaitingListDelete] = useState(null)
  const [waitingListDeleting, setWaitingListDeleting] = useState(false)
  const [waitingListDeleteError, setWaitingListDeleteError] = useState('')
  const [waitingListSearch, setWaitingListSearch] = useState('')
  const [waitingListStatus, setWaitingListStatus] = useState('all')
  const [waitingListSort, setWaitingListSort] = useState('newest')
  const [waitingListDetail, setWaitingListDetail] = useState(null)
  const [waitingListStatusBusyId, setWaitingListStatusBusyId] = useState(null)
  const [waitingListActionError, setWaitingListActionError] = useState('')
  const [waitingNow] = useState(() => Date.now())
  const [moveOutInspections, setMoveOutInspections] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [marketSummary, setMarketSummary] = useState(null)
  const [repairSummary, setRepairSummary] = useState(null)
  const [inspectionModal, setInspectionModal] = useState(false)
  const [inspectionSection, setInspectionSection] = useState('all')
  const [inspectionForm, setInspectionForm] = useState({
    room_number: '',
    checklist: {},
    damage_note: '',
    damage_cost: '',
    assets: null,
    item_costs: {},
    photos: [],
    existingPhotos: [],
  })
  const [inspectionTenantRequest, setInspectionTenantRequest] = useState(null)
  const [inspectionEditing, setInspectionEditing] = useState(null)
  const [inspectionLoadingId, setInspectionLoadingId] = useState(null)
  const [inspectionView, setInspectionView] = useState(null)
  const [inspectionViewPhoto, setInspectionViewPhoto] = useState(null)
  const [inspectionListError, setInspectionListError] = useState('')
  const [inspectionError, setInspectionError] = useState('')
  const [inspectionFieldErrors, setInspectionFieldErrors] = useState({})
  const [inspectionSubmitting, setInspectionSubmitting] = useState(false)
  const [inspectionAssetsOpen, setInspectionAssetsOpen] = useState(true)
  const [inspectionPage, setInspectionPage] = useState('move-in')
  const [inspectionTabFrom, setInspectionTabFrom] = useState(0)
  const liveMoveInBaseline = useMoveInBaseline(inspectionModal && !inspectionEditing ? inspectionForm.room_number : null)
  const inspectionBaseline = inspectionEditing
    ? { loading: false, baseline: inspectionEditing.move_in_baseline ?? null, error: '' }
    : liveMoveInBaseline
  const inspectionMoveRoomId = inspectionTenantRequest?.type === 'move_room'
    ? inspectionTenantRequest.id
    : inspectionEditing?.tenant_request_type === 'move_room' ? inspectionEditing.tenant_request_id : null
  const [invoicePrintError, setInvoicePrintError] = useState('')
  const [invoiceModal, setInvoiceModal] = useState(null)
  const [invoiceGenerating, setInvoiceGenerating] = useState(false)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [, tickExpiry] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => tickExpiry((tick) => tick + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifClosing, setNotifClosing] = useState(false)
  const [notifPage, setNotifPage] = useState(1)
  const notifListRef = useRef(null)
  const [notifDetail, setNotifDetail] = useState(null)
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

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roomsPage, setRoomsPage] = useState(1)
  const [expandedRoomNumbers, setExpandedRoomNumbers] = useState(() => new Set())

  const [historyRoom, setHistoryRoom] = useState(null)
  const [historySlip, setHistorySlip] = useState(null)
  const [historySlipClosing, setHistorySlipClosing] = useState(false)
  const [historySlipViewerOpen, setHistorySlipViewerOpen] = useState(false)
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(PAYMENT_HISTORY_INITIAL_PAGE_SIZE)
  const historyBodyRef = useRef(null)

  const [collectRoom, setCollectRoom] = useState(null)
  const [collectSubmitting, setCollectSubmitting] = useState(false)
  const [collectError, setCollectError] = useState('')

  const [actionSuccess, setActionSuccess] = useState('')
  const [staffTab, setStaffTab] = useState('home')
  const [lastStaffTabByGroup, setLastStaffTabByGroup] = useState({})
  const [homeSection, setHomeSection] = useState('rooms')
  const [homePages, setHomePages] = useState({})
  const [homeRequestFilters, setHomeRequestFilters] = useState({})
  const updateHomeRequestFilter = (type, patch) => {
    setHomeRequestFilters((current) => ({ ...current, [type]: { ...current[type], ...patch } }))
    setHomePages((current) => ({ ...current, [type]: 1 }))
  }
  const filterHomeRequests = (type, items) => {
    const filters = { ...DEFAULT_HOME_REQUEST_FILTER, ...homeRequestFilters[type] }
    const keyword = filters.search.trim().toLowerCase()
    const list = items.filter((request) => {
      if (filters.status !== 'all' && request.status !== filters.status) return false
      const extraMismatch = (TENANT_HOME_EXTRA_FILTERS[type] || []).some(
        (extra) => filters[extra.key] && filters[extra.key] !== 'all' && !extra.match(request, filters[extra.key]),
      )
      if (extraMismatch) return false
      if (!keyword) return true
      return matchesSearch([
        request.room_number,
        request.target_room_number,
        `${request.first_name} ${request.last_name}`,
        request.phone,
      ], keyword, request)
    })
    return { filters, list: filters.sort === 'newest' ? list.reverse() : list }
  }
  const getHomePage = (section, total) =>
    Math.min(homePages[section] || 1, Math.max(1, Math.ceil(total / TENANT_GRID_COUNT)))
  const renderHomePager = (section, total) => {
    const totalPages = Math.ceil(total / TENANT_GRID_COUNT)
    if (totalPages <= 1) return null
    const page = getHomePage(section, total)
    const goTo = (next) => setHomePages((current) => ({ ...current, [section]: next }))
    return (
      <div className="staff-pagination">
        <span className="staff-pagination-info">
          แสดง {(page - 1) * TENANT_GRID_COUNT + 1}-{Math.min(page * TENANT_GRID_COUNT, total)} จาก {total} รายการ
        </span>
        <div className="staff-pagination-controls">
          <button type="button" className="staff-action-btn is-ghost" disabled={page <= 1} onClick={() => goTo(page - 1)}>
            ก่อนหน้า
          </button>
          <span className="staff-pagination-page">
            หน้า {page} / {totalPages}
          </span>
          <button type="button" className="staff-action-btn is-ghost" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
            ถัดไป
          </button>
        </div>
      </div>
    )
  }
  const [tabFocus, setTabFocus] = useState(null)
  const [peerRefresh, setPeerRefresh] = useState(0)
  const [seenTabKeys, setSeenTabKeys] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(getNotificationStorageKey('staff-tabs')) || '[]'))
    } catch {
      return new Set()
    }
  })
  const [announcementFocus, setAnnouncementFocus] = useState(null)
  const [pendingSlipCount, setPendingSlipCount] = useState(0)
  const [contractSummary, setContractSummary] = useState(null)
  useEffect(() => {
    if (staffTab !== 'payment-review') return undefined
    const controller = new AbortController()
    axios.get('/api/staff/contracts/completed', { signal: controller.signal })
      .then(({ data }) => {
        const viewed = readViewedContractIds()
        const unviewed = (data.contracts || []).filter((contract) => !viewed.has(String(contract.booking_id))).length
        setContractSummary((current) => ({ ...current, unviewed }))
      })
      .catch((error) => {
        if (error.code !== 'ERR_CANCELED') console.warn('Could not load unviewed contract count', error)
      })
    return () => controller.abort()
  }, [staffTab, peerRefresh])
  const [pendingVisitCount, setPendingVisitCount] = useState(0)
  const [parkedVehicleCount, setParkedVehicleCount] = useState(0)
  const [pendingSafetyCount, setPendingSafetyCount] = useState(0)
  const [urgentSafetyCount, setUrgentSafetyCount] = useState(0)
  const [pendingSafetyIncidents, setPendingSafetyIncidents] = useState([])
  const [safetyStatusCounts, setSafetyStatusCounts] = useState({ reviewed: 0, cancelled: 0 })
  const [pendingVisitRequests, setPendingVisitRequests] = useState([])
  const [pendingSlips, setPendingSlips] = useState([])

  useEffect(() => {
    let cancelled = false
    const loadOperationalCounts = () => {
      axios
        .get('/api/staff/resident-visit-requests')
        .then(({ data }) => {
          if (cancelled) return
          const requests = data.requests || []
          const now = Date.now()
          setPendingVisitCount(requests.filter((item) => item.status === 'pending').length)
          setPendingVisitRequests(requests.filter((item) => item.status === 'pending'))
          setParkedVehicleCount(
            requests.filter(
              (item) =>
                item.status === 'approved' &&
                item.vehicle_plate &&
                new Date(item.start_at).getTime() <= now &&
                (!item.end_at || new Date(item.end_at).getTime() > now),
            ).length,
          )
        })
        .catch(() => {})
      axios
        .get('/api/staff/safety-incidents')
        .then(({ data }) => {
          if (cancelled) return
          const pending = (data.incidents || []).filter((item) => item.status === 'pending')
          setPendingSafetyCount(pending.length)
          setUrgentSafetyCount(pending.filter((item) => item.severity === 'urgent').length)
          setPendingSafetyIncidents(pending)
          setSafetyStatusCounts({
            reviewed: (data.incidents || []).filter((item) => item.status === 'reviewed').length,
            cancelled: (data.incidents || []).filter((item) => item.status === 'cancelled').length,
          })
        })
        .catch(() => {})
    }
    loadOperationalCounts()
    const interval = setInterval(loadOperationalCounts, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [peerRefresh])

  const [utilityRoom, setUtilityRoom] = useState(null)
  const [utilityForm, setUtilityForm] = useState({
    electricity_mode: 'units',
    electricity_units: '',
    electricity_amount: '',
    water_mode: 'units',
    water_units: '',
    water_amount: '',
  })
  const [utilitySubmitting, setUtilitySubmitting] = useState(false)
  const [utilityError, setUtilityError] = useState('')

  const [tenantRequests, setTenantRequests] = useState([])
  const [maintenanceRequests, setMaintenanceRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestsError, setRequestsError] = useState('')
  const [processingRequestKey, setProcessingRequestKey] = useState('')
  const [viewAllRequests, setViewAllRequests] = useState(null)
  const [tenantFilterType, setTenantFilterType] = useState('all')
  const [tenantFilterSearch, setTenantFilterSearch] = useState('')
  const [tenantFilterStatus, setTenantFilterStatus] = useState('all')
  const [tenantFilterSort, setTenantFilterSort] = useState('oldest')
  const [waitingListDates, setWaitingListDates] = useState({ from: '', to: '' })
  const [tenantHistoryType, setTenantHistoryType] = useState('all')
  const [tenantModalPage, setTenantModalPage] = useState(1)
  const [maintenanceModalPage, setMaintenanceModalPage] = useState(1)
  const [maintenanceFilterStatus, setMaintenanceFilterStatus] = useState('all')
  const [maintenanceFilterDate, setMaintenanceFilterDate] = useState('')
  const [maintenanceFilterSearch, setMaintenanceFilterSearch] = useState('')
  const [tenantRequestDetail, setTenantRequestDetail] = useState(null)
  const [maintenanceDetail, setMaintenanceDetail] = useState(null)
  const [maintenancePhotoPreview, setMaintenancePhotoPreview] = useState(null)
  const [moveoutConfirmRequest, setMoveoutConfirmRequest] = useState(null)
  const [renewApproveConfirm, setRenewApproveConfirm] = useState(null)
  const [moveoutAcknowledgeConfirm, setMoveoutAcknowledgeConfirm] = useState(null)
  const [tenantRejectConfirm, setTenantRejectConfirm] = useState(null)
  const [maintenanceCompleteConfirm, setMaintenanceCompleteConfirm] = useState(null)
  const [maintenanceAcceptConfirm, setMaintenanceAcceptConfirm] = useState(null)
  const [maintenanceRejectConfirm, setMaintenanceRejectConfirm] = useState(null)

  const [showTenantHistory, setShowTenantHistory] = useState(false)
  const [tenantHistoryData, setTenantHistoryData] = useState([])
  const [tenantHistoryTotal, setTenantHistoryTotal] = useState(0)
  const [tenantHistoryPage, setTenantHistoryPage] = useState(1)
  const [tenantHistoryLoading, setTenantHistoryLoading] = useState(false)
  const [tenantHistoryError, setTenantHistoryError] = useState('')
  const [tenantHistorySearch, setTenantHistorySearch] = useState('')
  const [tenantHistoryStatusFilter, setTenantHistoryStatusFilter] = useState('all')

  const [showMaintenanceHistory, setShowMaintenanceHistory] = useState(false)
  const [maintenanceHistoryData, setMaintenanceHistoryData] = useState([])
  const [maintenanceHistoryTotal, setMaintenanceHistoryTotal] = useState(0)
  const [maintenanceHistoryPage, setMaintenanceHistoryPage] = useState(1)
  const [maintenanceHistoryLoading, setMaintenanceHistoryLoading] = useState(false)
  const [maintenanceHistoryError, setMaintenanceHistoryError] = useState('')
  const [maintenanceHistorySearch, setMaintenanceHistorySearch] = useState('')
  const [maintenanceHistoryStatusFilter, setMaintenanceHistoryStatusFilter] = useState('all')

  const loadWaitingList = () => {
    return axios
      .get('/api/staff/waiting-list')
      .then(({ data }) => setWaitingList(data.waitingList))
      .catch(() => {})
  }

  const setWaitingListEntryStatus = async (entry, status) => {
    if (waitingListStatusBusyId != null) return
    setWaitingListStatusBusyId(entry.id)
    setWaitingListActionError('')
    try {
      await axios.patch(`/api/staff/waiting-list/${entry.id}/status`, { status })
      await loadWaitingList()
    } catch (err) {
      setWaitingListActionError(err.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ')
    } finally {
      setWaitingListStatusBusyId(null)
    }
  }

  const loadParcels = useCallback(() => {
    return axios
      .get('/api/staff/parcels')
      .then(({ data }) => {
        setParcels(data.parcels || [])
        setParcelsError('')
      })
      .catch((err) => {
        setParcelsError(err.response?.data?.message || 'ไม่สามารถโหลดรายการพัสดุได้')
      })
      .finally(() => setParcelsLoading(false))
  }, [])

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
      const { data } = await axios.post('/api/staff/parcels', payload)
      requestClose()
      setParcelFormOpen(false)
      setActionSuccess(data.message || 'บันทึกพัสดุเข้าห้องสำเร็จ')
      setParcelForm({ room_number: '', sender_name: '', tracking_number: '', description: '' })
      setParcelPhotos([])
      setParcelPhotoError('')
      await loadParcels()
    } catch (err) {
      requestClose()
      setParcelFormError(err.response?.data?.message || 'บันทึกพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setParcelSubmitting(false)
    }
  }

  const loadMoveOutInspections = () => {
    return axios
      .get('/api/staff/move-out-inspections')
      .then(({ data }) => {
        setMoveOutInspections(data.inspections)
        setInspectionListError('')
      })
      .catch((err) => {
        setInspectionListError(err.response?.data?.message || 'โหลดผลตรวจห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      })
  }

  const loadPendingSlipCount = () => {
    return axios
      .get('/api/staff/payment-verifications')
      .then(({ data }) => {
        setPendingSlipCount((data.payments || []).length)
        setPendingSlips(data.payments || [])
      })
      .catch(() => {})
  }

  const loadAnnouncements = () => {
    return axios
      .get('/api/staff/announcements')
      .then(({ data }) => setAnnouncements(data.announcements))
      .catch(() => {})
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

  const confirmDeleteWaitingListEntry = async (requestClose) => {
    setWaitingListDeleting(true)
    setWaitingListDeleteError('')
    try {
      const { data } = await axios.delete(`/api/staff/waiting-list/${waitingListDelete.id}`)
      setActionSuccess(data.message || 'ลบรายชื่อผู้สนใจสำเร็จ')
      requestClose()
      await loadWaitingList()
    } catch (err) {
      setWaitingListDeleteError(err.response?.data?.message || 'ลบรายชื่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      if (err.response?.status === 404) await loadWaitingList()
    } finally {
      setWaitingListDeleting(false)
    }
  }

  const openWaitingListModal = (entry = null) => {
    setWaitingListForm(
      entry
        ? {
            full_name: entry.full_name || '',
            phone: entry.phone || '',
            room_preference: entry.room_preference || '',
            note: entry.note || '',
            desired_move_in_date: entry.desired_move_in_date || '',
          }
        : { full_name: '', phone: '', room_preference: '', note: '', desired_move_in_date: '' },
    )
    setWaitingListEditing(entry)
    setWaitingListError('')
    setWaitingListFieldErrors({})
    setWaitingListModalOpen(true)
  }

  const updateWaitingListField = (field, value) => {
    setWaitingListForm((form) => ({ ...form, [field]: value }))
    setWaitingListFieldErrors((errors) => ({ ...errors, [field]: undefined }))
  }

  const submitWaitingListEntry = async (event, requestClose) => {
    event.preventDefault()
    const fullName = waitingListForm.full_name.trim()
    const phone = waitingListForm.phone.trim()
    const fieldErrors = {}
    if (!fullName) fieldErrors.full_name = 'กรุณาระบุชื่อผู้สนใจ'
    if (!phone) fieldErrors.phone = 'กรุณาระบุเบอร์โทรศัพท์'
    else if (!WAITING_PHONE_PATTERN.test(phone)) fieldErrors.phone = 'เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9-20 หลัก)'
    setWaitingListFieldErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      setWaitingListError('')
      return
    }
    setWaitingListSubmitting(true)
    try {
      const payload = {
        full_name: fullName,
        phone,
        room_preference: waitingListForm.room_preference.trim(),
        note: waitingListForm.note.trim(),
        desired_move_in_date: waitingListForm.desired_move_in_date || '',
      }
      if (waitingListEditing) {
        await axios.patch(`/api/staff/waiting-list/${waitingListEditing.id}`, payload)
      } else {
        await axios.post('/api/staff/waiting-list', payload)
        setWaitingListPage(1)
      }
      setWaitingListForm({ full_name: '', phone: '', room_preference: '', note: '', desired_move_in_date: '' })
      setWaitingListError('')
      requestClose()
      await loadWaitingList()
    } catch (err) {
      setWaitingListError(err.response?.data?.message || 'บันทึกรายชื่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      if (err.response?.status === 404) await loadWaitingList()
    } finally {
      setWaitingListSubmitting(false)
    }
  }

  const openMoveOutInspection = () => {
    const occupiedRoom = rooms.find((room) => room.is_booked && room.tenant)
    setInspectionForm({
      room_number: occupiedRoom ? String(occupiedRoom.room_number) : '',
      checklist: {},
      damage_note: '',
      damage_cost: '',
      assets: null,
      item_costs: {},
      photos: [],
      existingPhotos: [],
    })
    setInspectionEditing(null)
    setInspectionTenantRequest(null)
    setInspectionError('')
    setInspectionFieldErrors({})
    setInspectionSection('all')
    setInspectionAssetsOpen(true)
    setInspectionModal(true)
  }

  const openTenantRequestInspection = (request) => {
    setInspectionForm({
      room_number: String(request.room_number),
      checklist: {},
      damage_note: '',
      damage_cost: '',
      assets: null,
      item_costs: {},
      photos: [],
      existingPhotos: [],
    })
    setInspectionEditing(null)
    setInspectionTenantRequest(request)
    setInspectionError('')
    setInspectionFieldErrors({})
    setInspectionSection('all')
    setInspectionAssetsOpen(true)
    setInspectionModal(true)
  }

  const openInspectionView = async (inspection) => {
    setInspectionView({ summary: inspection, data: null, loading: true, error: '' })
    try {
      const { data } = await axios.get(`/api/staff/move-out-inspections/${inspection.id}`)
      setInspectionView((prev) => (prev?.summary.id === inspection.id ? { ...prev, data: data.inspection, loading: false } : prev))
    } catch (err) {
      setInspectionView((prev) =>
        prev?.summary.id === inspection.id
          ? { ...prev, loading: false, error: err.response?.data?.message || 'ไม่สามารถโหลดผลตรวจห้องได้' }
          : prev,
      )
    }
  }

  const openEditInspection = async (inspection) => {
    setInspectionLoadingId(inspection.id)
    setInspectionListError('')
    try {
      const { data } = await axios.get(`/api/staff/move-out-inspections/${inspection.id}`)
      const detail = data.inspection
      setInspectionForm({
        room_number: String(detail.room_number),
        checklist: detail.checklist,
        damage_note: detail.damage_note || '',
        damage_cost: Number(detail.damage_cost) > 0 ? String(Number(detail.damage_cost)) : '',
        assets: detail.assets
          ? detail.assets.map((asset) => ({ ...asset, cost: asset.cost === undefined ? undefined : String(asset.cost) }))
          : null,
        item_costs: Object.fromEntries(Object.entries(detail.item_costs || {}).map(([key, cost]) => [key, String(cost)])),
        photos: [],
        existingPhotos: detail.photos || [],
      })
      setInspectionEditing({
        id: detail.id,
        room_number: detail.room_number,
        tenant_name: detail.tenant_name,
        tenant_phone: detail.tenant_phone,
        tenant_request_id: detail.tenant_request_id,
        tenant_request_type: detail.tenant_request_type,
        move_in_baseline: detail.move_in_baseline ?? null,
      })
      setInspectionTenantRequest(null)
      setInspectionError('')
      setInspectionFieldErrors({})
      setInspectionSection('all')
      setInspectionAssetsOpen(true)
      setInspectionModal(true)
    } catch (error) {
      setInspectionListError(error.response?.data?.message || 'โหลดผลตรวจห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      if (error.response?.status === 404) await loadMoveOutInspections()
    } finally {
      setInspectionLoadingId(null)
    }
  }

  const withDamageTotal = (form) => {
    const total = itemCostTotal(form.checklist, form.item_costs) + chargeableAssetCost(form.assets || [])
    return { ...form, damage_cost: total > 0 ? String(total) : '' }
  }

  const setChecklistResult = (key, value) => {
    setInspectionForm((form) => {
      const { [key]: current, ...rest } = form.checklist
      return withDamageTotal({ ...form, checklist: current === value ? rest : { ...rest, [key]: value } })
    })
    setInspectionFieldErrors((errors) => ({ ...errors, checklist: (errors.checklist || []).filter((k) => k !== key) }))
  }

  const setInspectionItemCost = (key, cost) => {
    setInspectionForm((form) => withDamageTotal({ ...form, item_costs: { ...form.item_costs, [key]: cost } }))
    setInspectionFieldErrors((errors) => ({ ...errors, item_costs: (errors.item_costs || []).filter((k) => k !== key) }))
  }

  const setInspectionAssets = (assets) => {
    setInspectionForm((form) => withDamageTotal({ ...form, assets, checklist: withFurnitureResult(form.checklist, assets) }))
    setInspectionFieldErrors((errors) => ({ ...errors, assets: undefined, checklist: (errors.checklist || []).filter((key) => key !== 'furniture') }))
  }

  const resetChecklist = () => {
    setInspectionForm((form) => ({ ...form, checklist: form.assets ? withFurnitureResult({}, form.assets) : {} }))
    setInspectionFieldErrors((errors) => ({ ...errors, checklist: [] }))
  }

  const setAllChecklistResults = (value) => {
    setInspectionForm((form) =>
      withDamageTotal({
        ...form,
        checklist: {
          ...Object.fromEntries(MOVE_OUT_CHECKLIST.filter((item) => item.key !== 'furniture').map((item) => [item.key, value])),
          ...(form.assets ? withFurnitureResult({}, form.assets) : {}),
        },
      }),
    )
    setInspectionFieldErrors((errors) => ({ ...errors, checklist: [] }))
  }

  const submitMoveOutInspection = async (event, requestClose) => {
    event.preventDefault()
    const room = rooms.find(
      (item) => String(item.room_number) === inspectionForm.room_number && item.is_booked && item.tenant,
    )
    const fieldErrors = {}
    if (!inspectionEditing && !room) fieldErrors.room = 'กรุณาเลือกห้องที่มีผู้เช่า'
    const checklist = withFurnitureResult(inspectionForm.checklist, inspectionForm.assets)
    const missing = MOVE_OUT_CHECKLIST.filter((item) => !checklist[item.key]).map((item) => item.key)
    if (missing.length > 0) fieldErrors.checklist = missing
    const costError = (cost) => cost !== undefined && cost !== '' && !isValidAssetPrice(cost)
    const missingAssets = (inspectionForm.assets || [])
      .map((asset, index) => (!String(asset.name).trim() || !isValidAssetPrice(asset.price) || costError(asset.cost) ? index : null))
      .filter((index) => index !== null)
    if (missingAssets.length > 0) {
      fieldErrors.assets = missingAssets
      setInspectionAssetsOpen(true)
    }
    const invalidCosts = MOVE_OUT_CHECKLIST
      .filter((item) => COSTED_RESULTS.includes(inspectionForm.checklist[item.key]) && costError(inspectionForm.item_costs[item.key]))
      .map((item) => item.key)
    if (invalidCosts.length > 0) fieldErrors.item_costs = invalidCosts
    if (inspectionDamageTotal > 0 && !inspectionForm.damage_note.trim()) {
      fieldErrors.damage_note = 'กรุณาระบุรายการความเสียหายที่คิดค่าเสียหาย'
    }
    const hasIssue = [...Object.values(inspectionForm.checklist), ...(inspectionForm.assets || []).map((asset) => asset.result)]
      .some((result) => ['damaged', 'missing'].includes(result))
    if (hasIssue && !inspectionForm.damage_note.trim()) {
      fieldErrors.damage_note = 'กรุณาระบุรายการและตำแหน่งที่ชำรุดหรือสูญหาย'
    }
    if (hasIssue && inspectionForm.photos.length + inspectionForm.existingPhotos.length === 0) {
      fieldErrors.photos = 'กรุณาแนบภาพประกอบกรณีพบรายการชำรุดหรือสูญหาย'
    }
    if (inspectionMoveRoomId && damageInputError(inspectionForm.damage_cost)) {
      fieldErrors.damage_cost = damageInputError(inspectionForm.damage_cost)
    }
    if (inspectionMoveRoomId && Number(damageInputValue(inspectionForm.damage_cost)) > 0 && !inspectionForm.damage_note.trim()) {
      fieldErrors.damage_note = 'กรุณาระบุรายการความเสียหายที่คิดค่าเสียหาย'
    }
    setInspectionFieldErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      setInspectionSection(fieldErrors.room ? 'all' : missing.length > 0 ? 'checklist' : fieldErrors.damage_note || fieldErrors.photos ? 'photos' : 'finance')
      setInspectionError(
        missing.length > 0
          ? `ยังไม่ได้ตรวจอีก ${missing.length} หัวข้อ (ไฮไลต์สีแดงด้านบน) กรุณาเลือกผลให้ครบ`
          : missingAssets.length > 0
            ? `อุปกรณ์และทรัพย์สินยังไม่ถูกต้อง ${missingAssets.length} รายการ (ชื่อ ราคา หรือค่าเสียหาย)`
          : invalidCosts.length > 0
            ? 'ค่าเสียหายต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'
          : hasIssue && inspectionForm.photos.length + inspectionForm.existingPhotos.length === 0
            ? 'กรุณาแนบภาพประกอบรายการชำรุดหรือสูญหาย'
            : fieldErrors.damage_cost || 'กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง',
      )
      return
    }

    setInspectionSubmitting(true)
    setInspectionError('')
    try {
      const photos = await Promise.all(inspectionForm.photos.map(compressImageFile))
      const details = {
        checklist,
        damage_note: inspectionForm.damage_note.trim(),
        photos,
        item_costs: Object.fromEntries(
          Object.entries(inspectionForm.item_costs)
            .filter(([key]) => COSTED_RESULTS.includes(inspectionForm.checklist[key]))
            .map(([key, cost]) => [key, assetPriceValue(cost)]),
        ),
        ...(inspectionForm.assets
          ? {
              assets: inspectionForm.assets.map(({ name, price, move_in_result, result, cost }) => ({
                name: String(name).trim(),
                price: assetPriceValue(price),
                move_in_result,
                result: result || 'good',
                ...(COSTED_RESULTS.includes(result) ? { cost: assetPriceValue(cost) } : {}),
              })),
            }
          : {}),
        ...(inspectionMoveRoomId ? { damage_cost: damageInputValue(inspectionForm.damage_cost) } : {}),
      }
      const { data } = inspectionEditing
        ? await axios.patch(
            `/api/staff/move-out-inspections/${inspectionEditing.id}`,
            { ...details, keep_photos: inspectionForm.existingPhotos.map((photo) => photo.url) }
          )
        : await axios.post(
            '/api/staff/move-out-inspections',
            {
              room_number: room.room_number,
              ...(inspectionTenantRequest ? { tenant_request_id: inspectionTenantRequest.id } : {}),
              ...details,
            }
          )
      setActionSuccess(data.message || (inspectionEditing ? 'แก้ไขผลตรวจห้องสำเร็จ' : 'บันทึกผลตรวจห้องสำเร็จ'))
      if (!inspectionEditing) setInspectionsPage(1)
      requestClose()
      await loadMoveOutInspections()
      await loadRequests()
    } catch (error) {
      setInspectionError(error.response?.data?.message || error.message || 'บันทึกผลตรวจไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      if (error.response?.status === 404) loadMoveOutInspections()
    } finally {
      setInspectionSubmitting(false)
    }
  }

  const handlePrintMonthlyInvoices = async (roomNumber = null) => {
    setInvoicePrintError('')
    const printWindow = window.open('', '_blank', 'width=900,height=720')
    if (!printWindow) {
      setInvoicePrintError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง')
      return
    }
    setInvoiceGenerating(true)
    try {
      const { data } = await axios.get('/api/staff/rooms')
      const targetRooms = roomNumber
        ? data.rooms.filter((room) => String(room.room_number) === String(roomNumber))
        : data.rooms
      const count = printMonthlyInvoices(targetRooms, printWindow)
      if (count === 0) {
        setInvoicePrintError(roomNumber ? 'ห้องนี้ไม่มีผู้เช่าให้ออกใบแจ้งหนี้' : 'ไม่มีห้องที่มีผู้เช่าให้ออกใบแจ้งหนี้')
        return
      }
      setActionSuccess(
        roomNumber
          ? `เตรียมใบแจ้งหนี้ห้อง ${roomNumber} แล้ว เลือกพิมพ์หรือบันทึกเป็น PDF ได้จากหน้าต่างที่เปิดขึ้น`
          : `เตรียมใบแจ้งหนี้ ${count} ห้องแล้ว เลือกพิมพ์หรือบันทึกเป็น PDF ได้จากหน้าต่างที่เปิดขึ้น`,
      )
    } catch (error) {
      printWindow.close()
      if (error.response?.status === 401 || error.response?.status === 403) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
      setInvoicePrintError(error.message || 'เปิดหน้าต่างพิมพ์ไม่สำเร็จ')
    } finally {
      setInvoiceGenerating(false)
    }
  }

  const [expenses, setExpenses] = useState([])
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [expensesError, setExpensesError] = useState('')
  const [expensesPage, setExpensesPage] = useState(1)
  const [expensesTotalPages, setExpensesTotalPages] = useState(1)
  const [expensesTotal, setExpensesTotal] = useState(0)
  const [expenseSeenId, setExpenseSeenId] = useState(() => readExpenseSeen('staff'))
  const [expenseModal, setExpenseModal] = useState(null)
  const [expenseDelete, setExpenseDelete] = useState(null)
  const [expenseDeleting, setExpenseDeleting] = useState(false)
  const [expenseDeleteError, setExpenseDeleteError] = useState('')
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM)
  const [expenseFormError, setExpenseFormError] = useState('')
  const [expensePhotoError, setExpensePhotoError] = useState('')
  const [expenseExtraOpen, setExpenseExtraOpen] = useState(false)
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)
  const [expenseFilters, setExpenseFilters] = useState(EMPTY_EXPENSE_FILTERS)
  const expenseFiltersRef = useRef(EMPTY_EXPENSE_FILTERS)
  const expenseSearchTimerRef = useRef(null)
  const [expenseSummary, setExpenseSummary] = useState({ totalAmount: 0, byCategory: [] })
  const [expenseDetail, setExpenseDetail] = useState(null)
  const [expensePhotoPreview, setExpensePhotoPreview] = useState(null)
  const [expenseDetailPhotoIndex, setExpenseDetailPhotoIndex] = useState(0)
  const openExpenseDetail = (expense) => {
    setExpenseDetailPhotoIndex(0)
    setExpenseDetail(expense)
  }

  const loadExpenses = (page = 1) => {
    const filters = expenseFiltersRef.current
    setExpensesLoading(true)
    setExpensesError('')
    return axios
      .get('/api/staff/expenses', {
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
        if (readExpenseSeen('staff') === null) {
          const maxId = maxExpenseId(data.expenses)
          writeExpenseSeen('staff', maxId)
          setExpenseSeenId(maxId)
        }
        setExpensesPage(data.page)
        setExpensesTotal(data.total || 0)
        setExpensesTotalPages(Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || EXPENSES_PAGE_SIZE))))
        setExpenseSummary({ totalAmount: Number(data.totalAmount) || 0, byCategory: data.byCategory || [] })
        setExpensesError('')
      })
      .catch((err) => {
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

  const openCreateExpense = () => {
    setExpenseForm({ ...EMPTY_EXPENSE_FORM, expense_date: getTodayInputDate() })
    setExpenseExtraOpen(false)
    setExpenseFormError('')
    setExpensePhotoError('')
    setExpenseModal({ mode: 'create' })
  }

  const openEditExpense = (expense) => {
    setExpenseForm({
      ...EMPTY_EXPENSE_FORM,
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
    setExpenseExtraOpen(
      Boolean(expense.vendor || expense.payment_method || expense.receipt_number || expense.room_number),
    )
    setExpenseFormError('')
    setExpensePhotoError('')
    setExpenseModal({ mode: 'edit', expense })
  }

  const confirmDeleteExpense = async (requestClose) => {
    setExpenseDeleting(true)
    setExpenseDeleteError('')
    try {
      const { data } = await axios.delete(`/api/staff/expenses/${expenseDelete.id}`)
      setActionSuccess(data.message || 'ลบรายจ่ายสำเร็จ')
      requestClose()
      loadExpenses(expenses.length === 1 && expensesPage > 1 ? expensesPage - 1 : expensesPage)
    } catch (err) {
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
      const photos = (await Promise.all(expenseForm.newPhotos.map(compressImageFile))).map(({ name, dataUrl }) => ({ name, dataUrl }))
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
        await axios.post('/api/staff/expenses', payload)
      } else {
        await axios.put(`/api/staff/expenses/${expenseModal.expense.id}`, payload)
      }
      requestClose()
      loadExpenses(expenseModal.mode === 'create' ? 1 : expensesPage)
    } catch (err) {
      setExpenseFormError(err.response?.data?.message || err.message || 'ไม่สามารถบันทึกรายจ่ายได้')
    } finally {
      setExpenseSubmitting(false)
    }
  }

  const loadRequests = () => {
    return axios
      .get('/api/staff/requests')
      .then(({ data }) => {
        setTenantRequests(data.tenantRequests)
        setMaintenanceRequests(data.maintenanceRequests)
        setRequestsError('')
      })
      .catch((err) => {
        setRequestsError(err.response?.data?.message || 'ไม่สามารถโหลดรายการคำขอได้')
      })
  }

  const loadTenantHistory = (
    page,
    search = tenantHistorySearch,
    status = tenantHistoryStatusFilter,
    type = tenantHistoryType,
  ) => {
    setTenantHistoryLoading(true)
    setTenantHistoryError('')
    return axios
      .get('/api/staff/requests/history', {
        params: {
          page,
          search: search || undefined,
          status: status !== 'all' ? status : undefined,
          type: type !== 'all' ? type : undefined,
        },
      })
      .then(({ data }) => {
        setTenantHistoryData(data.requests)
        setTenantHistoryTotal(data.total)
      })
      .catch((err) => {
        setTenantHistoryError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติคำขอได้')
      })
      .finally(() => setTenantHistoryLoading(false))
  }

  const openTenantHistory = () => {
    setShowTenantHistory(true)
    setTenantHistoryPage(1)
    setTenantHistorySearch('')
    setTenantHistoryStatusFilter('all')
    setTenantHistoryType('all')
    loadTenantHistory(1, '', 'all', 'all')
  }

  const loadMaintenanceHistory = (page, search = maintenanceHistorySearch, status = maintenanceHistoryStatusFilter) => {
    setMaintenanceHistoryLoading(true)
    setMaintenanceHistoryError('')
    return axios
      .get('/api/staff/maintenance/history', {
        params: { page, search: search || undefined, status: status !== 'all' ? status : undefined },
      })
      .then(({ data }) => {
        setMaintenanceHistoryData(data.requests)
        setMaintenanceHistoryTotal(data.total)
      })
      .catch((err) => {
        setMaintenanceHistoryError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติแจ้งซ่อมได้')
      })
      .finally(() => setMaintenanceHistoryLoading(false))
  }

  const openMaintenanceHistory = () => {
    setShowMaintenanceHistory(true)
    setMaintenanceHistoryPage(1)
    setMaintenanceHistorySearch('')
    setMaintenanceHistoryStatusFilter('all')
    loadMaintenanceHistory(1, '', 'all')
  }

  const loadRooms = () => {
    return axios
      .get('/api/staff/rooms')
      .then(({ data }) => {
        setRooms(data.rooms)
        setError('')
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          clearSession()
          navigate('/login', { replace: true })
          return
        }
        setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      })
  }

  const loadInitialRooms = useEffectEvent(() => loadRooms())

  useEffect(() => {
    if (!hasSession()) {
      navigate('/login', { replace: true })
      return
    }
    let isMounted = true
    loadInitialRooms().finally(() => {
      if (isMounted) setLoading(false)
    })
    loadParcels()
    loadRequests().finally(() => {
      if (isMounted) setRequestsLoading(false)
    })
    loadExpenses(1)
    loadWaitingList()
    loadMoveOutInspections()
    loadAnnouncements()
    loadPendingSlipCount()
    const requestsInterval = setInterval(loadRequests, 20000)
    const announcementsInterval = setInterval(loadAnnouncements, 30000)
    const slipCountInterval = setInterval(loadPendingSlipCount, 30000)
    const parcelsInterval = setInterval(loadParcels, 30000)
    const refreshRequestsOnFocus = () => loadRequests()
    window.addEventListener('focus', refreshRequestsOnFocus)
    return () => {
      isMounted = false
      clearInterval(requestsInterval)
      clearInterval(announcementsInterval)
      clearInterval(slipCountInterval)
      clearInterval(parcelsInterval)
      window.removeEventListener('focus', refreshRequestsOnFocus)
    }
  }, [loadParcels, navigate])

  const handleLogout = () => {
    logout()
    setStaffUser(null)
    navigate('/login', { replace: true })
  }

  const handleApproveTenantRequest = async (request, body = {}) => {
    const key = `tenant-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${request.id}/approve`, body)
      setActionSuccess(data.message || 'อนุมัติคำขอสำเร็จ')
      await Promise.all([loadRequests(), loadRooms()])
      return true
    } catch (err) {
      if (err.response?.status === 410) {
        await loadRequests()
        setActionSuccess(err.response?.data?.message || 'คำขอเก่าถูกนำออกจากรายการแล้ว')
        return true
      }
      setRequestsError(err.response?.data?.message || 'อนุมัติคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setProcessingRequestKey('')
    }
  }

  const handleAcknowledgeTenantRequest = async (request) => {
    const key = `tenant-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${request.id}/acknowledge`, {})
      setActionSuccess(data.message || 'รับเรื่องสำเร็จ')
      await loadRequests()
      return true
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'รับเรื่องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setProcessingRequestKey('')
    }
  }

  const handleConfirmMoveoutApproval = async () => {
    if (!moveoutConfirmRequest) return
    const success = await handleApproveTenantRequest(moveoutConfirmRequest)
    if (success) setMoveoutConfirmRequest(null)
  }

  const handleConfirmRenewApproval = async (body) => {
    if (!renewApproveConfirm) return
    const success = await handleApproveTenantRequest(renewApproveConfirm, body instanceof FormData ? body : {})
    if (success) setRenewApproveConfirm(null)
    else loadRequests()
  }

  const handleSendTransferCharge = async () => {
    if (!renewApproveConfirm) return
    const key = `tenant-${renewApproveConfirm.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${renewApproveConfirm.id}/transfer-charge`, {})
      setActionSuccess(data.message || 'ส่งยอดชำระย้ายห้องให้ผู้เช่าแล้ว')
      setRenewApproveConfirm(null)
      await loadRequests()
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'ส่งยอดชำระย้ายห้องไม่สำเร็จ')
    } finally {
      setProcessingRequestKey('')
    }
  }

  const renewOutstandingAmount = renewApproveConfirm?.type === 'renew' ? Number(renewApproveConfirm.outstanding?.amount) || 0 : 0
  const renewOutstandingRoom = renewOutstandingAmount > 0
    ? rooms.find((room) => String(room.room_number) === String(renewApproveConfirm.room_number))
    : null

  const handleConfirmMoveoutAcknowledge = async () => {
    if (!moveoutAcknowledgeConfirm) return
    const success = await handleAcknowledgeTenantRequest(moveoutAcknowledgeConfirm)
    if (success) setMoveoutAcknowledgeConfirm(null)
  }

  const handleConfirmMaintenanceAccept = async () => {
    if (!maintenanceAcceptConfirm) return
    const success = await handleMaintenanceAction(maintenanceAcceptConfirm, 'accept')
    if (success) setMaintenanceAcceptConfirm(null)
  }

  const handleConfirmMaintenanceReject = async () => {
    if (!maintenanceRejectConfirm) return
    const success = await handleMaintenanceAction(maintenanceRejectConfirm, 'reject')
    if (success) setMaintenanceRejectConfirm(null)
  }

  const handleConfirmMaintenanceComplete = async () => {
    if (!maintenanceCompleteConfirm) return
    const success = await handleMaintenanceAction(maintenanceCompleteConfirm, 'complete')
    if (success) setMaintenanceCompleteConfirm(null)
  }

  const handleRejectTenantRequest = async (request, reason) => {
    const key = `tenant-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${request.id}/reject`, { reason })
      setActionSuccess(data.message || 'ปฏิเสธคำขอสำเร็จ')
      await loadRequests()
      return true
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'ปฏิเสธคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setProcessingRequestKey('')
    }
  }

  const handleConfirmTenantReject = async (reason) => {
    if (!tenantRejectConfirm) return
    const success = await handleRejectTenantRequest(tenantRejectConfirm, reason)
    if (success) setTenantRejectConfirm(null)
  }

  const handleMaintenanceAction = async (request, action) => {
    const key = `maintenance-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(
        `/api/staff/maintenance/${request.id}/${action}`,
        {}
      )
      setActionSuccess(data.message || 'ดำเนินการสำเร็จ')
      await loadRequests()
      return true
    } catch (err) {
      setRequestsError(err.response?.data?.message || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setProcessingRequestKey('')
    }
  }

  const renderTenantRequestActions = (request) => {
    const key = `tenant-${request.id}`
    const isProcessing = processingRequestKey === key
    const cancellationLocked = request.type === 'move_room' && request.transfer_charge_status === 'paid'
    const openAction = (action) => {
      setTenantRequestDetail(null)
      action(request)
    }
    return (
      <>
        <button
          type="button"
          className="staff-action-btn is-danger-outline"
          disabled={isProcessing || cancellationLocked}
          title={cancellationLocked ? 'ชำระส่วนต่างแล้ว ไม่สามารถยกเลิกหรือปฏิเสธได้' : undefined}
          onClick={() => openAction(setTenantRejectConfirm)}
        >
          {cancellationLocked ? 'ชำระแล้ว ยกเลิกไม่ได้' : 'ปฏิเสธ'}
        </button>
        {request.type === 'moveout' ? (
          request.status === 'pending' ? (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => openAction(setMoveoutAcknowledgeConfirm)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'รับเรื่อง'}
            </button>
          ) : request.inspection_id ? (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => openAction(setMoveoutConfirmRequest)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติการย้ายออก'}
            </button>
          ) : (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => openAction(openTenantRequestInspection)}
            >
              ตรวจสภาพห้องก่อนย้ายออก
            </button>
          )
        ) : request.type === 'move_room' ? (
          request.inspection_id ? (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => openAction(setRenewApproveConfirm)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติย้ายห้อง'}
            </button>
          ) : (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => openAction(openTenantRequestInspection)}
            >
              ตรวจห้องก่อนย้าย
            </button>
          )
        ) : (
          <button
            type="button"
            className="staff-action-btn is-primary"
            disabled={isProcessing}
            onClick={() => openAction(setRenewApproveConfirm)}
          >
            {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติ'}
          </button>
        )}
      </>
    )
  }

  const renderTenantRequestItem = (request) => {
    return (
      <TenantRequestCard
        key={`tenant-${request.id}`}
        request={request}
        steps={[{ key: 'created', label: 'ส่งคำขอ', date: request.created_at, tone: 'info' }]}
      >
        <button type="button" className="staff-text-link" onClick={() => setTenantRequestDetail(request)}>
          ดูรายละเอียด
        </button>
        {renderTenantRequestActions(request)}
      </TenantRequestCard>
    )
  }

  const renderMaintenanceRequestItem = (request) => {
    const key = `maintenance-${request.id}`
    const isProcessing = processingRequestKey === key
    const nextStep = MAINTENANCE_NEXT_STEP[request.status]
    return (
      <article key={key} className="staff-req-card type-maintenance is-structured">
        <div className="staff-req-head is-identity">
          <span className="staff-req-avatar" aria-hidden="true">
            <WaitingDetailIcon type="user" size={18} />
          </span>
          <div className="staff-req-identity">
            <strong>
              {request.first_name} {request.last_name}
            </strong>
            <span className="staff-badge type-maintenance">แจ้งซ่อม</span>
          </div>
          <span className={`staff-badge status-${request.status} staff-req-status`}>
            {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
          </span>
        </div>
        <div className="staff-req-route">
          <div className="staff-req-route-room is-target">
            <small>ห้องที่แจ้งซ่อม</small>
            <strong>{request.room_number}</strong>
          </div>
          {nextStep && <span className={`staff-req-route-check ${nextStep.tone}`}>{nextStep.label}</span>}
        </div>
        <TenantRequestDetails
          details={[
            { key: 'phone', icon: 'phone', label: 'โทร', value: request.contact_phone || '-' },
            { key: 'category', icon: 'tool', label: 'หมวดหมู่', value: MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ' },
            { key: 'time', icon: 'clock', label: 'เวลาสะดวก', value: MAINTENANCE_TIME_LABEL[request.preferred_time] || 'เวลาไหนก็ได้' },
          ]}
        />
        {request.description && (
          <div className="staff-req-note">
            <span className="staff-req-note-label">รายละเอียดปัญหา</span>
            <p>{request.description}</p>
          </div>
        )}
        {request.photos?.length > 0 && (
          <div className="staff-req-note">
            <span className="staff-req-note-label">รูปประกอบ · {request.photos.length} รูป</span>
            <div className="staff-request-photos">
              {request.photos.slice(0, 4).map((photo, index) => (
                <button
                  key={`${photo.url}-${index}`}
                  type="button"
                  className="parcel-thumb"
                  aria-label={`ดูรูปแจ้งซ่อมห้อง ${request.room_number} รูปที่ ${index + 1}`}
                  onClick={() => {
                    setMaintenanceDetail(request)
                    setMaintenancePhotoPreview({ index })
                  }}
                >
                  <UploadImage src={photo.url} alt="" />
                  {index === 3 && request.photos.length > 4 && <span>+{request.photos.length - 4}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <TenantRequestCardFooter steps={[{ key: 'created', label: 'แจ้งซ่อม', date: request.created_at, tone: 'info' }]}>
          <button type="button" className="staff-text-link" onClick={() => setMaintenanceDetail(request)}>
            ดูรายละเอียด
          </button>
          <button
            type="button"
            className="staff-action-btn is-danger-outline"
            disabled={isProcessing}
            onClick={() => setMaintenanceRejectConfirm(request)}
          >
            ปฏิเสธ
          </button>
          {request.status === 'pending' ? (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => setMaintenanceAcceptConfirm(request)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'รับเรื่อง'}
            </button>
          ) : (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => setMaintenanceCompleteConfirm(request)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'เสร็จสิ้น'}
            </button>
          )}
        </TenantRequestCardFooter>
      </article>
    )
  }

  const toggleRoomExpanded = (roomNumber) => {
    setExpandedRoomNumbers((prev) => {
      const next = new Set(prev)
      if (next.has(roomNumber)) {
        next.delete(roomNumber)
      } else {
        next.add(roomNumber)
      }
      return next
    })
  }

  useEffect(() => {
    if (!historySlip || historySlipViewerOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setHistorySlipClosing(true)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [historySlip, historySlipViewerOpen])

  useEffect(() => {
    if (!historySlipClosing) return undefined
    const timer = setTimeout(() => {
      setHistorySlip(null)
      setHistorySlipClosing(false)
      setHistorySlipViewerOpen(false)
    }, 160)
    return () => clearTimeout(timer)
  }, [historySlipClosing])

  const openHistory = async (room) => {
    setHistoryRoom(room)
    setHistoryData(null)
    setHistoryError('')
    setHistorySearch('')
    setHistoryStatusFilter('all')
    setHistoryPage(1)
    setHistoryLoading(true)
    try {
      const { data } = await axios.get(`/api/staff/rooms/${room.room_number}/history`)
      setHistoryData(data.rentalHistory)
    } catch (err) {
      setHistoryError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติการจ่ายเงินได้')
    } finally {
      setHistoryLoading(false)
    }
  }

  const openDueDetail = (room) => {
    openCollect(room)
  }

  const openCollect = (room) => {
    setCollectRoom(room)
    setCollectError('')
  }

  const handleCollectPayment = async () => {
    if (!collectRoom) return
    setCollectSubmitting(true)
    setCollectError('')
    try {
      const { data } = await axios.post(
        `/api/staff/rooms/${collectRoom.room_number}/collect-payment`,
        {}
      )
      setActionSuccess(data.message || 'บันทึกการเก็บเงินสำเร็จ')
      setCollectRoom(null)
      await Promise.all([loadRooms(), loadRequests()])
    } catch (err) {
      setCollectError(err.response?.data?.message || 'บันทึกการเก็บเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setCollectSubmitting(false)
    }
  }

  const openUtilityBill = (room) => {
    setUtilityRoom(room)
    setUtilityForm({
      electricity_mode: 'units',
      electricity_units: '',
      electricity_amount: '',
      water_mode: 'units',
      water_units: '',
      water_amount: room.water_price ? String(room.water_price) : '',
    })
    setUtilityError('')
  }

  const handleSendUtilityBill = async () => {
    if (!utilityRoom) return
    setUtilitySubmitting(true)
    setUtilityError('')
    try {
      const { data } = await axios.post(
        `/api/staff/rooms/${utilityRoom.room_number}/utility-bill`,
        {
          electricity_units: utilityForm.electricity_mode === 'units' ? utilityForm.electricity_units : '',
          electricity_amount: utilityForm.electricity_mode === 'amount' ? utilityForm.electricity_amount : '',
          water_units: utilityForm.water_mode === 'units' ? utilityForm.water_units : '',
          water_amount: utilityForm.water_mode === 'amount' ? utilityForm.water_amount : '',
        }
      )
      setActionSuccess(data.message || 'ส่งบิลค่าน้ำ-ค่าไฟสำเร็จ')
      setUtilityRoom(null)
      await loadRooms()
    } catch (err) {
      setUtilityError(err.response?.data?.message || 'ส่งบิลค่าน้ำ-ค่าไฟไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setUtilitySubmitting(false)
    }
  }

  const serverFeed = useServerNotifications('/api/staff', {
    pendingKinds: STAFF_SERVER_PENDING_KINDS,
    onNewEvents: () => {
      loadRequests()
      loadPendingSlipCount()
      loadAnnouncements()
      setPeerRefresh((count) => count + 1)
    },
  })

  const notifications = useMemo(() => {
    return sortNewestFirst([
      ...pendingSafetyIncidents.map(buildStaffSafetyNotif),
      ...pendingVisitRequests.map(buildStaffVisitNotif),
      ...pendingSlips.map(buildStaffSlipNotif),
      ...tenantRequests.flatMap(buildStaffTenantNotifs),
      ...maintenanceRequests.flatMap(buildStaffMaintenanceNotifs),
      ...announcements.map(buildAnnouncementNotif),
      ...serverFeed.events,
      ...serverFeed.pending,
    ])
  }, [pendingSafetyIncidents, pendingVisitRequests, pendingSlips, tenantRequests, maintenanceRequests, announcements, serverFeed.events, serverFeed.pending])

  const notificationReads = useNotificationReads(getNotificationStorageKey('staff'), serverFeed)
  const newNotifications = notifications.filter((notification) => isUnread(notification, notificationReads.seenKeys))
  const freshNotifKeys = new Set(newNotifications.map((notification) => notification.key))

  const tabItemKeys = {
    'payment-review': pendingSlips.map(buildStaffSlipNotif).map((item) => item.key),
    'resident-visits': pendingVisitRequests.map(buildStaffVisitNotif).map((item) => item.key),
    safety: pendingSafetyIncidents.map(buildStaffSafetyNotif).map((item) => item.key),
  }

  const newTabItemCount = (tab) =>
    staffTab === tab ? 0 : (tabItemKeys[tab] || []).filter((key) => !seenTabKeys.has(key)).length

  const goToStaffTab = (tab) => {
    const visited = [...(tabItemKeys[staffTab] || []), ...(tabItemKeys[tab] || [])]
    if (visited.some((key) => !seenTabKeys.has(key))) {
      const current = new Set(Object.values(tabItemKeys).flat())
      const next = new Set([...[...seenTabKeys].filter((key) => current.has(key)), ...visited])
      setSeenTabKeys(next)
      try {
        localStorage.setItem(getNotificationStorageKey('staff-tabs'), JSON.stringify([...next]))
      } catch (error) {
        console.warn('Could not save seen tab items', error)
      }
    }
    setTabFocus(null)
    setStaffTab(tab)
  }

  const openServerNotification = (notif) => {
    const [area, section] = (notif.target || '').split(':')
    setAnnouncementFocus(null)
    if (STAFF_FOCUS_TABS[area]) {
      goToStaffTab(STAFF_FOCUS_TABS[area])
      setTabFocus({ tab: STAFF_FOCUS_TABS[area], id: notif.refId, nonce: Date.now() })
      return
    }
    if (STAFF_PLAIN_TABS[area]) {
      goToStaffTab(STAFF_PLAIN_TABS[area])
      if (notif.refId) setTabFocus({ tab: STAFF_PLAIN_TABS[area], id: notif.refId, refTable: notif.refTable, nonce: Date.now() })
      return
    }
    if (area === 'move-in') {
      goToStaffTab('move-out-inspections')
      setInspectionPage('move-in')
      return
    }
    const homeSection = { requests: section, 'transfer-contracts': 'move_room', maintenance: 'maintenance', rooms: 'rooms', expenses: 'expenses' }[area]
    if (homeSection) {
      goToStaffTab('home')
      setHomeSection(homeSection)
      return
    }
    setNotifDetail(notif)
  }

  useEffect(() => {
    const link = takeNotificationDeepLink()
    if (!link) return
    if (link.tab === 'move-in') {
      setStaffTab('move-out-inspections')
      setInspectionPage('move-in')
      return
    }
    if (!STAFF_TABS.some((tab) => tab.key === link.tab)) return
    setStaffTab(link.tab)
    if (link.section) setHomeSection(link.section)
    if (link.focus) setTabFocus({ tab: link.tab, id: Number(link.focus), nonce: Date.now() })
  }, [])

  const inspectionResults = MOVE_OUT_CHECKLIST.map((item) => inspectionForm.checklist[item.key]).filter(Boolean)
  const inspectionCounts = {
    good: inspectionResults.filter((result) => result === 'good').length,
    wear: inspectionResults.filter((result) => result === 'wear').length,
    damaged: inspectionResults.filter((result) => result === 'damaged').length,
    missing: inspectionResults.filter((result) => result === 'missing').length,
    not_applicable: inspectionResults.filter((result) => result === 'not_applicable').length,
  }
  const inspectionHasIssue = inspectionCounts.damaged + inspectionCounts.missing > 0
    || (inspectionForm.assets || []).some((asset) => ['damaged', 'missing'].includes(asset.result))
  const inspectionDamageTotal = itemCostTotal(inspectionForm.checklist, inspectionForm.item_costs)
    + chargeableAssetCost(inspectionForm.assets || [])

  const vacantRooms = rooms
    .filter((room) => !room.is_booked)
    .sort((a, b) => a.room_number - b.room_number)
  const waitingStatusCounts = waitingList.reduce((counts, item) => {
    const key = WAITING_LIST_STATUS[item.status] ? item.status : 'waiting'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
  const waitingKeyword = waitingListSearch.trim().toLocaleLowerCase('th-TH')
  const filteredWaitingList = waitingList
    .filter((item) => {
      const status = WAITING_LIST_STATUS[item.status] ? item.status : 'waiting'
      if (waitingListStatus !== 'all' && status !== waitingListStatus) return false
      if (!inDayRange(item.created_at, waitingListDates.from, waitingListDates.to)) return false
      if (!waitingKeyword) return true
      return matchesSearch([item.full_name, item.phone, item.room_preference, item.note, item.submitted_by_name], waitingKeyword, item)
    })
    .sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return waitingListSort === 'oldest' ? diff : -diff
    })
  const waitingListFiltersActive =
    Boolean(waitingKeyword)
    || waitingListStatus !== 'all'
    || waitingListSort !== 'newest'
    || Boolean(waitingListDates.from || waitingListDates.to)
  const currentWaitingListPage = Math.min(
    waitingListPage,
    Math.max(1, Math.ceil(filteredWaitingList.length / STAFF_LIST_PAGE_SIZE)),
  )
  const waitingListPageItems = filteredWaitingList.slice(
    (currentWaitingListPage - 1) * STAFF_LIST_PAGE_SIZE,
    currentWaitingListPage * STAFF_LIST_PAGE_SIZE,
  )
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
  const filteredInspections = kindInspections
    .filter((inspection) => {
      if (inspectionResultFilter !== 'all' && summarizeInspection(inspection.checklist).tone !== inspectionResultFilter) return false
      if (!inspectionKeyword) return true
      return matchesSearch([
        inspection.room_number,
        inspection.target_room_number,
        inspection.tenant_name,
        inspection.tenant_phone,
        inspection.inspected_by_name,
        inspection.damage_note,
      ], inspectionKeyword, inspection)
    })
    .sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return inspectionSort === 'oldest' ? diff : -diff
    })
  const inspectionFiltersActive =
    Boolean(inspectionKeyword) || inspectionResultFilter !== 'all' || inspectionSort !== 'newest' || inspectionKind !== 'all'
  const currentInspectionsPage = Math.min(
    inspectionsPage,
    Math.max(1, Math.ceil(filteredInspections.length / STAFF_LIST_PAGE_SIZE)),
  )
  const inspectionsPageItems = filteredInspections.slice(
    (currentInspectionsPage - 1) * STAFF_LIST_PAGE_SIZE,
    currentInspectionsPage * STAFF_LIST_PAGE_SIZE,
  )

  const notifTotalPages = Math.max(1, Math.ceil(notifications.length / NOTIF_PAGE_SIZE))
  const notifCurrentPage = Math.min(notifPage, notifTotalPages)
  const paginatedNotifications = notifications.slice(
    (notifCurrentPage - 1) * NOTIF_PAGE_SIZE,
    notifCurrentPage * NOTIF_PAGE_SIZE,
  )

  const summary = useMemo(() => {
    const total = rooms.length
    const booked = rooms.filter((room) => room.is_booked).length
    const vacant = total - booked
    const dueCount = rooms.filter((room) => room.currentDue && room.currentDue.status !== 'paid').length
    return { total, booked, vacant, dueCount }
  }, [rooms])

  const waitingQueueCount = waitingList.filter((item) => item.status === 'waiting' || item.status === 'contacted').length
  const pendingParcelCount = parcels.filter((parcel) => parcel.status === 'pending').length
  const todayParcelKey = new Date().toDateString()
  const parcelsArrivedToday = parcels.filter((parcel) => new Date(parcel.created_at).toDateString() === todayParcelKey).length
  const parcelsPickedToday = parcels.filter((parcel) => parcel.received_at && new Date(parcel.received_at).toDateString() === todayParcelKey).length
  const roomsWithPendingParcels = new Set(parcels.filter((parcel) => parcel.status === 'pending').map((parcel) => parcel.room_number)).size
  const oldestPendingParcelDays = parcels
    .filter((parcel) => parcel.status === 'pending')
    .reduce((max, parcel) => Math.max(max, Math.floor((Date.now() - new Date(parcel.created_at).getTime()) / 86400000)), 0)
  const pendingMaintenanceCount = maintenanceRequests.filter((request) => request.status === 'pending').length
  const viewingExpenses = staffTab === 'home' && homeSection === 'expenses'
  const pendingTenantCount = (type) => tenantRequests.filter((request) => request.type === type && request.status === 'pending').length
  const pendingSectionCounts = {
    renew: pendingTenantCount('renew'),
    moveout: pendingTenantCount('moveout'),
    move_room: pendingTenantCount('move_room'),
    maintenance: pendingMaintenanceCount,
    expenses: viewingExpenses ? 0 : countNewExpenses(expenses, expenseSeenId),
  }
  const homePendingTotal = Object.values(pendingSectionCounts).reduce((sum, count) => sum + count, 0)

  useEffect(() => {
    if (!viewingExpenses) return
    const maxId = maxExpenseId(expenses)
    if (expenseSeenId !== null && maxId <= expenseSeenId) return
    writeExpenseSeen('staff', maxId)
    setExpenseSeenId(maxId)
  }, [viewingExpenses, expenses, expenseSeenId])

  const openSummaryTarget = (tab, roomFilter, section) => {
    goToStaffTab(tab)
    setAnnouncementFocus(null)
    if (section) setHomeSection(section)
    if (roomFilter) {
      setHomeSection('rooms')
      setStatusFilter(roomFilter)
      setRoomsPage(1)
    }
  }

  const filteredRooms = useMemo(() => {
    return rooms
      .filter((room) => {
        if (statusFilter === 'booked' && !room.is_booked) return false
        if (statusFilter === 'vacant' && room.is_booked) return false
        if (statusFilter === 'due' && (!room.currentDue || room.currentDue.status === 'paid')) return false
        if (statusFilter === 'expiring' && !getRoomExpiryStatus(room)) return false

        if (search.trim()) {
          const keyword = search.trim().toLowerCase()
          const tenantName = room.tenant ? `${room.tenant.first_name} ${room.tenant.last_name}`.toLowerCase() : ''
          if (!matchesSearch([room.room_number, tenantName, room.tenant?.phone], keyword, room)) return false
        }
        return true
      })
      .sort((a, b) => Number(a.is_booked) - Number(b.is_booked) || a.room_number - b.room_number)
  }, [rooms, search, statusFilter])

  const roomStatusCounts = useMemo(
    () => ({
      booked: rooms.filter((room) => room.is_booked).length,
      vacant: rooms.filter((room) => !room.is_booked).length,
      due: rooms.filter((room) => room.currentDue && room.currentDue.status !== 'paid').length,
      expiring: rooms.filter((room) => getRoomExpiryStatus(room)).length,
    }),
    [rooms],
  )

  const roomsTotalPages = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE))
  const currentRoomsPage = Math.min(roomsPage, roomsTotalPages)

  const paginatedRooms = useMemo(() => {
    const start = (currentRoomsPage - 1) * ROOMS_PER_PAGE
    return filteredRooms.slice(start, start + ROOMS_PER_PAGE)
  }, [filteredRooms, currentRoomsPage])

  const tenantTypeCounts = useMemo(() => {
    const counts = { all: tenantRequests.length, renew: 0, moveout: 0, move_room: 0 }
    tenantRequests.forEach((request) => {
      counts[request.type] = (counts[request.type] || 0) + 1
    })
    return counts
  }, [tenantRequests])

  const sectionItemKeys = useMemo(() => {
    const keys = { renew: [], moveout: [], move_room: [], maintenance: maintenanceRequests.map((request) => `maintenance-${request.id}`) }
    tenantRequests.forEach((request) => {
      if (keys[request.type]) keys[request.type].push(`tenant-${request.id}`)
    })
    return keys
  }, [tenantRequests, maintenanceRequests])

  const [seenSectionKeys, setSeenSectionKeys] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(getNotificationStorageKey('staff-sections')) || '[]'))
    } catch {
      return new Set()
    }
  })

  const newSectionItemCount = (section) =>
    staffTab === 'home' && homeSection === section ? 0 : (sectionItemKeys[section] || []).filter((key) => !seenSectionKeys.has(key)).length

  useEffect(() => {
    if (staffTab !== 'home') return
    const visible = sectionItemKeys[homeSection] || []
    if (visible.every((key) => seenSectionKeys.has(key))) return
    const current = new Set(Object.values(sectionItemKeys).flat())
    const next = new Set([...[...seenSectionKeys].filter((key) => current.has(key)), ...visible])
    setSeenSectionKeys(next)
    try {
      localStorage.setItem(getNotificationStorageKey('staff-sections'), JSON.stringify([...next]))
    } catch (error) {
      console.warn('Could not save seen section items', error)
    }
  }, [staffTab, homeSection, sectionItemKeys, seenSectionKeys])

  const filteredTenantRequests = useMemo(() => {
    const list = tenantRequests.filter((request) => {
      if (tenantFilterType !== 'all' && request.type !== tenantFilterType) return false
      if (tenantFilterStatus !== 'all' && request.status !== tenantFilterStatus) return false

      if (tenantFilterSearch.trim()) {
        const keyword = tenantFilterSearch.trim().toLowerCase()
        const tenantName = `${request.first_name} ${request.last_name}`.toLowerCase()
        if (!matchesSearch([request.room_number, request.target_room_number, tenantName, request.phone], keyword, request)) return false
      }
      return true
    })
    return tenantFilterSort === 'newest' ? list.reverse() : list
  }, [tenantRequests, tenantFilterType, tenantFilterStatus, tenantFilterSearch, tenantFilterSort])

  const tenantFiltersActive =
    tenantFilterType !== 'all' || tenantFilterStatus !== 'all' || Boolean(tenantFilterSearch.trim()) || tenantFilterSort !== 'oldest'
  const resetTenantFilters = () => {
    setTenantFilterType('all')
    setTenantFilterStatus('all')
    setTenantFilterSearch('')
    setTenantFilterSort('oldest')
    setTenantModalPage(1)
  }
  const tenantFilterProps = {
    type: tenantFilterType,
    onType: (value) => {
      setTenantFilterType(value)
      setTenantModalPage(1)
    },
    counts: tenantTypeCounts,
    search: tenantFilterSearch,
    onSearch: (value) => {
      setTenantFilterSearch(value)
      setTenantModalPage(1)
    },
    status: tenantFilterStatus,
    onStatus: (value) => {
      if (value === 'cancelled') {
        setViewAllRequests(null)
        resetTenantFilters()
        setShowTenantHistory(true)
        setTenantHistoryPage(1)
        setTenantHistorySearch(tenantFilterSearch)
        setTenantHistoryStatusFilter('cancelled')
        setTenantHistoryType(tenantFilterType)
        loadTenantHistory(1, tenantFilterSearch, 'cancelled', tenantFilterType)
        return
      }
      setTenantFilterStatus(value)
      setTenantModalPage(1)
    },
    statusOptions: [
      { value: 'all', label: 'ทุกสถานะ' },
      { value: 'pending', label: 'รอดำเนินการ' },
      { value: 'in_progress', label: 'รับเรื่องแล้ว' },
      { value: 'cancelled', label: 'ยกเลิกแล้ว' },
    ],
    sort: tenantFilterSort,
    onSort: (value) => {
      setTenantFilterSort(value)
      setTenantModalPage(1)
    },
    resultText: `พบ ${filteredTenantRequests.length} จาก ${tenantRequests.length} คำขอ`,
    canClear: tenantFiltersActive,
    onClear: resetTenantFilters,
  }

  const tenantModalTotalPages = Math.max(1, Math.ceil(filteredTenantRequests.length / MODAL_ITEMS_PER_PAGE))
  const currentTenantModalPage = Math.min(tenantModalPage, tenantModalTotalPages)
  const paginatedTenantRequests = useMemo(() => {
    const start = (currentTenantModalPage - 1) * MODAL_ITEMS_PER_PAGE
    return filteredTenantRequests.slice(start, start + MODAL_ITEMS_PER_PAGE)
  }, [filteredTenantRequests, currentTenantModalPage])

  const filteredMaintenanceRequests = useMemo(() => {
    return maintenanceRequests.filter((request) => {
      if (maintenanceFilterStatus !== 'all' && request.status !== maintenanceFilterStatus) return false

      if (maintenanceFilterDate) {
        const createdAt = new Date(request.created_at)
        const localDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`
        if (localDate !== maintenanceFilterDate) return false
      }

      if (maintenanceFilterSearch.trim()) {
        const keyword = maintenanceFilterSearch.trim().toLowerCase()
        const tenantName = `${request.first_name} ${request.last_name}`.toLowerCase()
        if (!matchesSearch([request.room_number, tenantName, request.contact_phone], keyword, request)) return false
      }
      return true
    })
  }, [maintenanceRequests, maintenanceFilterStatus, maintenanceFilterDate, maintenanceFilterSearch])

  const resetMaintenanceFilters = () => {
    setMaintenanceFilterStatus('all')
    setMaintenanceFilterDate('')
    setMaintenanceFilterSearch('')
    setMaintenanceModalPage(1)
  }
  const maintenanceFilterPanel = (sticky) => (
    <StaffFilterPanel
      sticky={sticky}
      segments={[
        { key: 'all', label: 'ทั้งหมด', count: maintenanceRequests.length },
        {
          key: 'pending',
          label: 'รอดำเนินการ',
          count: maintenanceRequests.filter((request) => request.status === 'pending').length,
          className: 'tone-warning',
        },
        {
          key: 'in_progress',
          label: 'กำลังดำเนินการ',
          count: maintenanceRequests.filter((request) => request.status === 'in_progress').length,
        },
      ]}
      active={maintenanceFilterStatus}
      onSegment={(value) => {
        setMaintenanceFilterStatus(value)
        setMaintenanceModalPage(1)
      }}
      search={maintenanceFilterSearch}
      onSearch={(value) => {
        setMaintenanceFilterSearch(value)
        setMaintenanceModalPage(1)
      }}
      searchPlaceholder="ค้นหาเลขห้อง ชื่อผู้เช่า หรือเบอร์โทร"
      resultText={`พบ ${filteredMaintenanceRequests.length} จาก ${maintenanceRequests.length} รายการ`}
      canClear={maintenanceFilterStatus !== 'all' || Boolean(maintenanceFilterDate) || Boolean(maintenanceFilterSearch.trim())}
      onClear={resetMaintenanceFilters}
    >
      <div className="staff-req-date">
        <ThaiDatePicker
          className="staff-filter-select staff-req-date-input"
          placeholder="วันที่แจ้งซ่อม"
          value={maintenanceFilterDate}
          isClearable
          onChange={(date) => {
            setMaintenanceFilterDate(date)
            setMaintenanceModalPage(1)
          }}
        />
      </div>
    </StaffFilterPanel>
  )

  const maintenanceModalTotalPages = Math.max(1, Math.ceil(filteredMaintenanceRequests.length / MODAL_ITEMS_PER_PAGE))
  const currentMaintenanceModalPage = Math.min(maintenanceModalPage, maintenanceModalTotalPages)
  const paginatedMaintenanceRequests = useMemo(() => {
    const start = (currentMaintenanceModalPage - 1) * MODAL_ITEMS_PER_PAGE
    return filteredMaintenanceRequests.slice(start, start + MODAL_ITEMS_PER_PAGE)
  }, [filteredMaintenanceRequests, currentMaintenanceModalPage])

  const historyPayments = useMemo(() => {
    if (!historyData) return []
    return historyData.flatMap((entry) =>
      entry.payments.map((payment) => ({
        ...payment,
        tenantName: `${entry.first_name} ${entry.last_name}`,
      })),
    )
  }, [historyData])

  const filteredHistoryPayments = useMemo(() => {
    return historyPayments.filter((payment) => {
      if (historyStatusFilter !== 'all' && payment.status !== historyStatusFilter) return false

      if (historySearch.trim()) {
        const keyword = historySearch.trim().toLowerCase()
        const values = [
          payment.tenantName,
          formatDateTime(payment.created_at),
          PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง',
          formatCurrency(payment.amount),
          PAYMENT_STATUS_LABEL[payment.status] || payment.status,
          payment.note,
        ]
        if (!matchesSearch(values, keyword, payment)) return false
      }
      return true
    })
  }, [historyPayments, historyStatusFilter, historySearch])

  useEffect(() => {
    const body = historyBodyRef.current
    if (!historyRoom || historyLoading || !historyData?.length || !body) return undefined

    const filters = body.querySelector('.staff-req-filters')
    const updatePageSize = () => {
      const rows = [...body.querySelectorAll('.staff-table tbody tr')]
      const rowHeight = Math.max(56, ...rows.map((row) => row.getBoundingClientRect().height))
      const headerHeight = body.querySelector('.staff-table thead')?.getBoundingClientRect().height || 42
      const paginationHeight = body.querySelector('.staff-pagination')?.getBoundingClientRect().height || 68
      const availableHeight = body.clientHeight - (filters?.getBoundingClientRect().height || 0)
        - headerHeight - paginationHeight - 28
      const nextSize = Math.max(1, Math.min(20, Math.floor(availableHeight / rowHeight)))
      setHistoryPageSize((current) => current === nextSize ? current : nextSize)
    }

    const observer = new ResizeObserver(updatePageSize)
    observer.observe(body)
    if (filters) observer.observe(filters)
    updatePageSize()
    return () => observer.disconnect()
  }, [historyRoom, historyLoading, historyData, filteredHistoryPayments.length])

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryPayments.length / historyPageSize))
  const currentHistoryPage = Math.min(historyPage, historyTotalPages)
  const paginatedHistoryPayments = useMemo(() => {
    const start = (currentHistoryPage - 1) * historyPageSize
    return filteredHistoryPayments.slice(start, start + historyPageSize)
  }, [filteredHistoryPayments, currentHistoryPage, historyPageSize])

  const loader = useMinimumLoading(loading)

  if (loading) {
    return <LoadingScreen title="กำลังโหลดข้อมูล" />
  }

  const pageLoader = loader.visible && <LoadingScreen title="กำลังโหลดข้อมูล" leaving={loader.leaving} />

  if (error) {
    return (
      <div className="staff-page">
        <div className="container">
          <div className="alert alert-danger">{error}</div>
        </div>
      </div>
    )
  }

  const announcementWarningCount = announcements.filter((item) => item.tone === 'warning').length
  const announcementScheduledCount = announcements.filter((item) => item.expires_at).length
  const announcementNewCount = announcements.filter((item) => Date.now() - new Date(item.created_at).getTime() < 24 * 60 * 60 * 1000).length
  const safetyTile = {
    key: 'safety',
    icon: 'safety',
    tone: 'red',
    label: 'เหตุรอรับเรื่อง',
    value: pendingSafetyCount,
    hint: urgentSafetyCount > 0 ? `ด่วน ${urgentSafetyCount} รายการ` : null,
    alert: urgentSafetyCount > 0,
    onClick: () => openSummaryTarget('safety'),
  }
  const roomsSummary = {
    title: 'ห้องพัก',
    tiles: [
      { key: 'total', icon: 'total', tone: 'slate', label: 'ห้องทั้งหมด', value: summary.total, onClick: () => openSummaryTarget('home', 'all') },
      { key: 'booked', icon: 'booked', tone: 'blue', label: 'มีผู้เช่า', value: summary.booked, onClick: () => openSummaryTarget('home', 'booked') },
      { key: 'vacant', icon: 'vacant', tone: 'green', label: 'ห้องว่าง', value: summary.vacant, onClick: () => openSummaryTarget('home', 'vacant') },
      { key: 'due', icon: 'due', tone: 'amber', label: 'รอเก็บเงิน', value: summary.dueCount, onClick: () => openSummaryTarget('home', 'due') },
    ],
  }
  const tenantSummary = {
    title: 'คำขอผู้เช่า',
    tiles: [
      { key: 'renew', icon: 'request', tone: 'indigo', label: 'ต่อสัญญา', value: tenantTypeCounts.renew, onClick: () => openSummaryTarget('home', null, 'renew') },
      { key: 'moveout', icon: 'request', tone: 'orange', label: 'แจ้งย้ายออก', value: tenantTypeCounts.moveout, onClick: () => openSummaryTarget('home', null, 'moveout') },
      { key: 'move_room', icon: 'request', tone: 'teal', label: 'ย้ายห้อง', value: tenantTypeCounts.move_room, onClick: () => openSummaryTarget('home', null, 'move_room') },
    ],
  }
  const summaryByView = {
    cameras: { title: 'กล้องวงจรปิด', tiles: cameraSummaryTiles() },
    'home:rooms': roomsSummary,
    'home:renew': tenantSummary,
    'home:moveout': tenantSummary,
    'home:move_room': tenantSummary,
    'home:maintenance': {
      title: 'แจ้งซ่อม',
      tiles: [
        { key: 'pending', icon: 'maintenance', tone: 'amber', label: 'รอรับเรื่อง', value: pendingMaintenanceCount, onClick: () => openSummaryTarget('home', null, 'maintenance') },
        { key: 'progress', icon: 'maintenance', tone: 'orange', label: 'กำลังซ่อม', value: maintenanceRequests.length - pendingMaintenanceCount, onClick: () => openSummaryTarget('home', null, 'maintenance') },
      ],
    },
    'home:expenses': {
      title: 'รายจ่าย',
      tiles: [
        {
          key: 'amount',
          icon: 'due',
          tone: 'blue',
          label: 'ยอดรวมรายจ่าย',
          value: `฿${formatCurrency(expenseSummary.totalAmount)}`,
          hint: expenseFiltersActive ? 'ตามตัวกรองที่เลือก' : 'ทุกรายการ',
          onClick: () => openSummaryTarget('home', null, 'expenses'),
        },
        {
          key: 'count',
          icon: 'total',
          tone: 'slate',
          label: 'จำนวนรายการ',
          value: expensesTotal,
          onClick: () => openSummaryTarget('home', null, 'expenses'),
        },
        {
          key: 'top',
          icon: 'request',
          tone: 'amber',
          label: 'หมวดที่ใช้จ่ายมากที่สุด',
          value: expenseSummary.byCategory[0]?.category || '-',
          hint: expenseSummary.byCategory[0] ? `฿${formatCurrency(expenseSummary.byCategory[0].total)}` : null,
          onClick: () => openSummaryTarget('home', null, 'expenses'),
        },
      ],
    },
    'payment-review': {
      title: 'การเงิน',
      tiles: [
        { key: 'slip', icon: 'slip', tone: 'blue', label: 'สลิปรอตรวจ', value: pendingSlipCount, onClick: () => openSummaryTarget('payment-review') },
        { key: 'due', icon: 'due', tone: 'amber', label: 'รอเก็บเงิน', value: summary.dueCount, onClick: () => openSummaryTarget('home', 'due') },
      ],
    },
    parcels: {
      title: 'พัสดุ',
      tiles: [
        {
          key: 'parcel',
          icon: 'parcel',
          tone: 'amber',
          label: 'พัสดุรอผู้เช่ารับ',
          value: pendingParcelCount,
          hint: oldestPendingParcelDays > 0 ? `ค้างนานสุด ${oldestPendingParcelDays} วัน` : pendingParcelCount > 0 ? 'มาถึงวันนี้' : null,
          onClick: () => openSummaryTarget('parcels'),
        },
        {
          key: 'today',
          icon: 'parcel',
          tone: 'blue',
          label: 'รับเข้าวันนี้',
          value: parcelsArrivedToday,
          hint: `ทั้งหมด ${parcels.length} รายการ`,
          onClick: () => openSummaryTarget('parcels'),
        },
        { key: 'picked', icon: 'vacant', tone: 'green', label: 'ผู้เช่ารับไปวันนี้', value: parcelsPickedToday, onClick: () => openSummaryTarget('parcels') },
        {
          key: 'rooms',
          icon: 'total',
          tone: 'violet',
          label: 'ห้องที่มีพัสดุรอ',
          value: roomsWithPendingParcels,
          onClick: () => openSummaryTarget('parcels'),
        },
      ],
    },
    'completed-contracts': {
      title: 'สัญญาที่เสร็จสมบูรณ์',
      tiles: completedContractSummaryTiles(contractSummary),
    },
    'waiting-list': {
      title: 'รายชื่อรอห้องว่าง',
      tiles: [
        { key: 'queue', icon: 'queue', tone: 'violet', label: 'คิวรอห้องว่าง', value: waitingQueueCount, onClick: () => openSummaryTarget('waiting-list') },
        { key: 'vacant', icon: 'vacant', tone: 'green', label: 'ห้องว่าง', value: summary.vacant, onClick: () => openSummaryTarget('home', 'vacant') },
      ],
    },
    'move-out-inspections': {
      title: 'ตรวจสภาพห้อง',
      tiles: [
        { key: 'moveout', icon: 'request', tone: 'orange', label: 'คำขอแจ้งย้ายออก', value: tenantTypeCounts.moveout, onClick: () => openSummaryTarget('home', null, 'moveout') },
        { key: 'move_room', icon: 'request', tone: 'teal', label: 'คำขอย้ายห้อง', value: tenantTypeCounts.move_room, onClick: () => openSummaryTarget('home', null, 'move_room') },
      ],
    },
    'resident-visits': {
      title: 'รถ',
      tiles: [
        { key: 'car', icon: 'car', tone: 'blue', label: 'รถที่จอดอยู่', value: parkedVehicleCount, onClick: () => openSummaryTarget('resident-visits') },
        { key: 'carPending', icon: 'carPending', tone: 'amber', label: 'คำขอรถรออนุมัติ', value: pendingVisitCount, onClick: () => openSummaryTarget('resident-visits') },
      ],
    },
    announcements: {
      title: 'ประกาศจากหอพัก',
      tiles: [
        { key: 'all', icon: 'announce', tone: 'blue', label: 'ประกาศทั้งหมด', value: announcements.length, onClick: () => openSummaryTarget('announcements') },
        { key: 'warning', icon: 'announce', tone: 'amber', label: 'ประกาศแจ้งเตือน', value: announcementWarningCount, onClick: () => openSummaryTarget('announcements') },
        { key: 'info', icon: 'announce', tone: 'indigo', label: 'ประกาศทั่วไป', value: announcements.length - announcementWarningCount, onClick: () => openSummaryTarget('announcements') },
        {
          key: 'scheduled',
          icon: 'clock',
          tone: 'slate',
          label: 'กำหนดลบอัตโนมัติ',
          value: announcementScheduledCount,
          hint: announcementNewCount > 0 ? `ใหม่ใน 24 ชม. ${announcementNewCount} รายการ` : null,
          onClick: () => openSummaryTarget('announcements'),
        },
      ],
    },
    market: {
      title: 'ร้านค้าเช่าข้างหอ',
      tiles: marketSummaryTiles(marketSummary, {
        shops: { icon: 'total', tone: 'blue' },
        rented: { icon: 'booked', tone: 'indigo' },
        vacant: { icon: 'vacant', tone: 'green' },
        income: { icon: 'due', tone: 'teal' },
        expiring: { icon: 'clock', tone: 'amber' },
      }),
    },
    'repair-vendors': {
      title: 'ติดต่อช่างซ่อม',
      tiles: repairSummaryTiles(repairSummary, {
        vendors: { icon: 'queue', tone: 'blue' },
        sent: { icon: 'clock', tone: 'amber' },
        progress: { icon: 'maintenance', tone: 'indigo' },
        done: { icon: 'vacant', tone: 'green' },
        rejected: { icon: 'request', tone: 'red' },
      }),
    },
    safety: {
      title: 'แจ้งเหตุฉุกเฉิน',
      tiles: [
        { ...safetyTile, label: 'รอตรวจสอบ', hint: null, alert: false },
        { key: 'urgent', icon: 'safety', tone: 'red', label: 'เหตุด่วน', value: urgentSafetyCount, alert: urgentSafetyCount > 0, onClick: () => openSummaryTarget('safety') },
        { key: 'normal', icon: 'safety', tone: 'amber', label: 'เหตุทั่วไป', value: Math.max(0, pendingSafetyCount - urgentSafetyCount), onClick: () => openSummaryTarget('safety') },
        { key: 'reviewed', icon: 'safety', tone: 'green', label: 'ตรวจสอบแล้ว', value: safetyStatusCounts.reviewed, onClick: () => openSummaryTarget('safety') },
        { key: 'cancelled', icon: 'safety', tone: 'slate', label: 'ยกเลิกแล้ว', value: safetyStatusCounts.cancelled, onClick: () => openSummaryTarget('safety') },
      ],
    },
  }
  const activeSummary = summaryByView[staffTab === 'home' ? `home:${homeSection}` : staffTab]
  const summaryTiles = activeSummary
    ? [...activeSummary.tiles, ...(staffTab !== 'safety' && urgentSafetyCount > 0 ? [safetyTile] : [])]
    : []
  const staffTabGroups = STAFF_TAB_GROUPS
    .map((group) => ({ ...group, tabs: group.tabs.filter((key) => key !== 'cameras' || staffUser?.role === 'Staff') }))
    .filter((group) => group.tabs.length > 0)
  const staffGroupOf = (tab) => staffTabGroups.find((group) => group.tabs.includes(tab))?.key
  const inspectionTabIndex = Math.max(0, INSPECTION_PAGES.findIndex((page) => page.key === inspectionPage))
  const inspectionSubtabs = (
    <ul
      className="nav staff-subtabs staff-card-subtabs"
      aria-label="หมวดหมู่ตรวจสภาพห้อง"
      style={{
        '--tab-count': INSPECTION_PAGES.length,
        '--tab-index': inspectionTabIndex,
        '--tab-from': inspectionTabFrom,
      }}
    >
      {INSPECTION_PAGES.map((page) => (
        <li className="nav-item" key={page.key}>
          <button
            type="button"
            className={`nav-link staff-subtab-link${inspectionPage === page.key ? ' active' : ''}`}
            aria-current={inspectionPage === page.key ? 'page' : undefined}
            onClick={() => {
              setInspectionTabFrom(inspectionTabIndex)
              setInspectionPage(page.key)
            }}
          >
            <svg className="staff-card-subtab-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{page.icon}</svg>
            {page.label}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="staff-page">
      {pageLoader}
      <div className="staff-container">
        <div className="staff-header app-header">
          <div className="staff-title-group app-header-title">
            <div className="auth-icon app-header-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M3 9h18" />
              </svg>
            </div>
            <div>
              <AppHeaderMeta role="staff" />
              <h1>สวัสดี, {staffUser ? `${staffUser.first_name} ${staffUser.last_name}` : 'เจ้าหน้าที่'}</h1>
              <p>จัดการห้องพัก คำขอผู้เช่า และการเก็บเงินประจำวัน</p>
            </div>
          </div>
          <div className="staff-header-actions app-header-actions">
            <div className="staff-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="staff-notif-btn app-header-icon-btn"
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
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {newNotifications.length > 0 && (
                  <span className="staff-notif-dot">{newNotifications.length > 99 ? '99+' : newNotifications.length}</span>
                )}
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
                    <button
                      type="button"
                      className="staff-notif-panel-close"
                      onClick={closeNotifPanel}
                      aria-label="ปิด"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
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
                        {paginatedNotifications.map((notif) => (
                          <button
                            type="button"
                            key={notif.key}
                            className={`staff-notif-item is-${notif.tone}${freshNotifKeys.has(notif.key) ? ' is-new' : ''}`}
                            onClick={() => {
                              closeNotifPanel()
                              notificationReads.markRead(notif, notifications)
                              if (notif.server) {
                                openServerNotification(notif)
                                return
                              }
                              if (notif.kind === 'announcement') {
                                goToStaffTab('announcements')
                                setAnnouncementFocus({ id: notif.announcementId, nonce: Date.now() })
                                return
                              }
                              const targetTab = { safety: 'safety', visit: 'resident-visits', slip: 'payment-review' }[notif.kind]
                              if (targetTab) {
                                goToStaffTab(targetTab)
                                setTabFocus({ tab: targetTab, id: notif.targetId, nonce: Date.now() })
                                setAnnouncementFocus(null)
                                return
                              }
                              goToStaffTab('home')
                              setAnnouncementFocus(null)
                              if (notif.kind === 'tenant' && TENANT_HOME_CARDS.some((card) => card.type === notif.request?.type)) setHomeSection(notif.request.type)
                              else if (notif.kind === 'maintenance') setHomeSection('maintenance')
                              if (notif.kind === 'tenant') setTenantRequestDetail(notif.request)
                              else if (notif.kind === 'maintenance') setMaintenanceDetail(notif.request)
                              else setNotifDetail(notif)
                            }}
                          >
                            <span className="staff-notif-item-icon">
                              <NotifKindIcon kind={notif.kind} />
                            </span>
                            <span className="staff-notif-item-main">
                              <span className="staff-notif-item-head">
                                <span className="staff-notif-item-title">
                                  {freshNotifKeys.has(notif.key) && <span className="staff-notif-item-new">ใหม่</span>}
                                  {notif.title}
                                </span>
                                <time className="staff-notif-item-date">{formatDateTime(notif.date)}</time>
                              </span>
                              <span className="staff-notif-item-status">{notif.label}</span>
                              {notif.preview && (
                                <span className="staff-notif-item-preview">
                                  {notif.previewLabel && <span className="staff-notif-item-preview-label">{notif.previewLabel}</span>}
                                  <span className="staff-notif-item-preview-text">{notif.preview}</span>
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      {notifTotalPages > 1 && (
                        <div className="staff-notif-pagination">
                          <span className="staff-notif-page-info">
                            {(notifCurrentPage - 1) * NOTIF_PAGE_SIZE + 1}–
                            {Math.min(notifCurrentPage * NOTIF_PAGE_SIZE, notifications.length)} จาก {notifications.length}
                          </span>
                          <div className="staff-notif-page-nav">
                            <button
                              type="button"
                              className="staff-notif-page-btn"
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
                            <span className="staff-notif-page-current">
                              {notifCurrentPage} / {notifTotalPages}
                            </span>
                            <button
                              type="button"
                              className="staff-notif-page-btn"
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
            <button type="button" className="staff-action-btn is-primary" onClick={() => navigate('/register')}>
              ลงทะเบียนลูกค้าใหม่
            </button>
            <button type="button" className="staff-logout-btn app-header-logout" onClick={handleLogout}>
              <LogoutIcon />
              ออกจากระบบ
            </button>
          </div>
          <AppHeaderDate />
        </div>

        {notifDetail && (
          <Modal title={notifDetail.title} onClose={() => setNotifDetail(null)} variant="confirm">
            {(requestClose) => (
              <div className="staff-confirm-body">
                <div className={`staff-confirm-icon is-${notifDetail.tone}`}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {notifDetail.tone === 'info' ? (
                      <>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </>
                    )}
                  </svg>
                </div>
                <p className="staff-confirm-message">
                  <span className={`staff-confirm-message-status is-${notifDetail.tone}`}>{notifDetail.label}</span>
                </p>
                {notifDetail.details && notifDetail.details.length > 0 && (
                  <div className="staff-confirm-details">
                    {notifDetail.details.map((item) => (
                      <div className="staff-confirm-detail-row" key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                <StaffRequestTimeline kind={notifDetail.kind} request={notifDetail.request} />
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {actionSuccess && (
          <Modal title="สำเร็จ" onClose={() => setActionSuccess('')} variant="confirm">
            {(requestClose) => (
              <div className="staff-confirm-body">
                <div className="staff-confirm-icon is-success">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <StaffNoticeMessage message={actionSuccess} />
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {waitingListDetail && (() => {
          const item = waitingList.find((entry) => entry.id === waitingListDetail.id) || waitingListDetail
          return (
            <Modal title="รายละเอียดผู้รอห้องว่าง" onClose={() => { setWaitingListDetail(null); setWaitingListActionError('') }} variant="waiting-detail">
              {(requestClose) => (
                <WaitingListDetails
                  item={item}
                  now={waitingNow}
                  vacantRooms={vacantRooms}
                  onClose={requestClose}
                  onEdit={(entry) => { setWaitingListDetail(null); openWaitingListModal(entry) }}
                  onStatusChange={setWaitingListEntryStatus}
                  statusBusyId={waitingListStatusBusyId}
                  actionError={waitingListActionError}
                />
              )}
            </Modal>
          )
        })()}

        {waitingListDelete && (
          <Modal title="ยืนยันการลบรายชื่อ" onClose={() => setWaitingListDelete(null)} variant="confirm">
            {(requestClose) => (
              <div className="staff-confirm-body">
                <div className="staff-confirm-icon is-warning">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 9v4M12 17h.01" />
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  </svg>
                </div>
                <p className="staff-confirm-message">ลบรายชื่อผู้สนใจนี้ออกจากระบบ?</p>
                <div className="staff-confirm-details">
                  <div className="staff-confirm-detail-row">
                    <span>ชื่อ</span>
                    <strong>{waitingListDelete.full_name}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>เบอร์โทร</span>
                    <strong>{waitingListDelete.phone}</strong>
                  </div>
                  {waitingListDelete.room_preference && (
                    <div className="staff-confirm-detail-row">
                      <span>ประเภทห้อง</span>
                      <strong>{waitingListDelete.room_preference}</strong>
                    </div>
                  )}
                </div>
                {waitingListDeleteError && (
                  <p className="staff-form-error" role="alert">
                    {waitingListDeleteError}
                  </p>
                )}
                <div className="staff-form-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    disabled={waitingListDeleting}
                    onClick={requestClose}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="staff-action-btn is-danger"
                    disabled={waitingListDeleting}
                    onClick={() => confirmDeleteWaitingListEntry(requestClose)}
                  >
                    {waitingListDeleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {waitingListModalOpen && (
          <Modal
            title={waitingListEditing ? 'แก้ไขรายชื่อผู้สนใจ' : 'เพิ่มผู้สนใจเช่าห้อง'}
            onClose={() => {
              setWaitingListModalOpen(false)
              setWaitingListEditing(null)
            }}
            variant="waiting-form"
          >
            {(requestClose) => (
              <WaitingListForm value={waitingListForm} fieldErrors={waitingListFieldErrors} error={waitingListError} busy={waitingListSubmitting} editing={Boolean(waitingListEditing)} now={waitingNow} onChange={updateWaitingListField} onSubmit={(event) => submitWaitingListEntry(event, requestClose)} onClose={requestClose} idPrefix="staff-waiting" />
            )}
          </Modal>
        )}

        {inspectionView && (
          <Modal
            title={`ผลตรวจห้อง ${inspectionView.summary.room_number}`}
            onClose={() => {
              setInspectionViewPhoto(null)
              setInspectionView(null)
            }}
            variant="inspection-detail"
          >
            {(requestClose) =>
              inspectionView.loading ? (
                <p className="staff-empty">กำลังโหลดผลตรวจห้อง...</p>
              ) : inspectionView.error ? (
                <p className="staff-form-error">{inspectionView.error}</p>
              ) : (
                <InspectionDetail
                  inspection={{ ...inspectionView.summary, ...inspectionView.data }}
                  statusLabel={inspectionView.data.tenant_request_id ? 'Staff ตรวจแล้ว' : STAFF_INSPECTION_STATUS_LABEL[inspectionView.data.status || 'pending']}
                  statusTone={inspectionView.data.tenant_request_id ? 'reviewed' : inspectionView.data.status || 'pending'}
                  actorClassName="staff-actor"
                  onOpenPhoto={setInspectionViewPhoto}
                  footer={
                    <footer className="idt-footer">
                      <div className="idt-footer-right">
                        <button
                          type="button"
                          className="idt-footer-btn is-primary"
                          disabled={inspectionLoadingId === inspectionView.summary.id}
                          onClick={() => {
                            const target = inspectionView.summary
                            requestClose()
                            openEditInspection(target)
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />
                          </svg>
                          แก้ไขผลตรวจ
                        </button>
                      </div>
                    </footer>
                  }
                />
              )
            }
          </Modal>
        )}

        {inspectionView?.data && inspectionViewPhoto !== null && (inspectionView.data.photos || [])[inspectionViewPhoto] && createPortal(
          <PhotoLightbox
            photos={inspectionView.data.photos}
            initialIndex={inspectionViewPhoto}
            title={`ผลตรวจห้อง ${inspectionView.summary.room_number}`}
            subtitle={inspectionView.summary.tenant_name}
            label={`ภาพตรวจห้อง ${inspectionView.summary.room_number}`}
            onClose={() => setInspectionViewPhoto(null)}
          />,
          document.body,
        )}

        {inspectionModal && (
          <Modal
            title={
              inspectionEditing
                ? `แก้ไขผลตรวจห้อง ${inspectionEditing.room_number}`
                : inspectionTenantRequest
                  ? inspectionTenantRequest.type === 'moveout'
                    ? `ตรวจสภาพห้อง ${inspectionTenantRequest.room_number} ก่อนย้ายออก`
                    : `ตรวจห้อง ${inspectionTenantRequest.room_number} ก่อนย้ายไปห้อง ${inspectionTenantRequest.target_room_number}`
                  : 'Checklist ตรวจสภาพห้อง'
            }
            onClose={() => {
              setInspectionModal(false)
              setInspectionEditing(null)
              setInspectionTenantRequest(null)
            }}
            variant="inspection"
          >
            {(requestClose) => (
              <form
                className="inspection-form"
                onSubmit={(event) => submitMoveOutInspection(event, requestClose)}
                noValidate
              >
                <section className="inspection-section">
                  <h4 className="inspection-section-title">
                    <span className="inspection-step">1</span>
                    {' '}
                    {inspectionEditing || inspectionTenantRequest ? 'ห้องที่ตรวจ' : 'เลือกห้องที่ตรวจ'}
                  </h4>
                  <div className="staff-form-field">
                    <label className="staff-form-label" htmlFor="inspection-room">
                      ห้อง / ผู้เช่า <span className="staff-form-required">*</span>
                    </label>
                    {inspectionEditing || inspectionTenantRequest ? (
                      <div className="room-picker-trigger inspection-room-fixed" id="inspection-room">
                        <span className="room-picker-avatar" aria-hidden="true">
                          <PersonIcon size={17} />
                        </span>
                        <span className="room-picker-main">
                          <strong>
                            {inspectionEditing?.tenant_name
                              || `${inspectionTenantRequest?.first_name || ''} ${inspectionTenantRequest?.last_name || ''}`}
                          </strong>
                          <small>
                            ห้อง {inspectionEditing?.room_number || inspectionTenantRequest?.room_number}
                            {inspectionEditing?.tenant_phone || inspectionTenantRequest?.phone
                              ? ` · โทร ${inspectionEditing?.tenant_phone || inspectionTenantRequest.phone}`
                              : ''}
                          </small>
                        </span>
                      </div>
                    ) : (
                      <InspectionRoomPicker
                        id="inspection-room"
                        rooms={rooms.filter((room) => room.is_booked && room.tenant)}
                        value={inspectionForm.room_number}
                        invalid={Boolean(inspectionFieldErrors.room)}
                        onChange={(roomNumber) => {
                          setInspectionForm((form) => ({ ...form, room_number: roomNumber, assets: null }))
                          setInspectionFieldErrors((errors) => ({ ...errors, room: undefined }))
                        }}
                      />
                    )}
                    {inspectionFieldErrors.room && (
                      <span className="staff-form-field-error">{inspectionFieldErrors.room}</span>
                    )}
                  </div>
                </section>

                <InspectionTopicFilter
                  topics={[
                    { key: 'all', label: 'ทั้งหมด' },
                    { key: 'checklist', label: 'ตรวจสภาพห้อง' },
                    ...(inspectionForm.room_number ? [{ key: 'baseline', label: 'ผลตรวจก่อนเข้าอยู่' }] : []),
                    { key: 'photos', label: 'รายละเอียดและรูปภาพ' },
                    ...(inspectionMoveRoomId ? [{ key: 'finance', label: 'ค่าเสียหายและเงินมัดจำ' }] : []),
                  ]}
                  value={inspectionSection}
                  onChange={setInspectionSection}
                />

                <section className="inspection-section" data-topic="checklist" hidden={!['all', 'checklist'].includes(inspectionSection)}>
                  <div className="inspection-section-head">
                    <h4 className="inspection-section-title">
                      <span className="inspection-step">2</span> ตรวจสภาพห้อง
                    </h4>
                    <div className="inspection-head-actions">
                      <button
                        type="button"
                        className="inspection-link-btn is-reset"
                        onClick={resetChecklist}
                        disabled={inspectionResults.length === 0}
                      >
                        รีเซ็ตทั้งหมด
                      </button>
                    </div>
                  </div>
                  <div className="inspection-progress" aria-live="polite">
                    <div className="inspection-progress-text">
                      <span>
                        ตรวจแล้ว <strong>{inspectionResults.length}</strong> / {MOVE_OUT_CHECKLIST.length} ข้อ
                      </span>
                      <span className="inspection-counts" role="group" aria-label="เลือกผลเดียวกันทุกข้อ">
                        {CHECKLIST_RESULT_OPTIONS.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            className={`is-${option.key}${inspectionCounts[option.key] === MOVE_OUT_CHECKLIST.length ? ' is-all' : ''}`}
                            title={`ตั้งทุกข้อเป็น "${option.label}"`}
                            onClick={() => setAllChecklistResults(option.key)}
                          >
                            {option.label} {inspectionCounts[option.key]}
                          </button>
                        ))}
                      </span>
                    </div>
                    <p className="inspection-guidance">
                      ตรวจแต่ละรายการจริง แยกการสึกหรอตามปกติออกจากความเสียหาย และเลือก “ไม่มี” เฉพาะรายการที่ไม่ได้ติดตั้ง
                    </p>
                    <span className="inspection-progress-bar">
                      <span style={{ width: `${(inspectionResults.length / MOVE_OUT_CHECKLIST.length) * 100}%` }} />
                    </span>
                  </div>
                  <div className="inspection-list">
                    {MOVE_OUT_CHECKLIST.map((item) => {
                      const result = inspectionForm.checklist[item.key] || ''
                      const isMissing = (inspectionFieldErrors.checklist || []).includes(item.key)
                      const isFurniture = item.key === 'furniture'
                      const costInvalid = (inspectionFieldErrors.item_costs || []).includes(item.key)
                      if (isFurniture) {
                        return (
                          <FurnitureAssetsRow
                            key={item.key}
                            label={item.label}
                            result={inspectionForm.assets ? result : ''}
                            assets={inspectionForm.assets}
                            open={inspectionAssetsOpen}
                            invalid={isMissing || Boolean(inspectionFieldErrors.assets?.length)}
                            onToggle={() => setInspectionAssetsOpen((open) => !open)}
                            moveIn={inspectionBaseline.baseline ? inspectionBaseline.baseline.checklist?.[item.key] ?? null : undefined}
                            onMoveInClick={(event) => {
                              const form = event.currentTarget.closest('form')
                              setInspectionSection((section) => (section === 'all' ? 'all' : 'baseline'))
                              requestAnimationFrame(() =>
                                requestAnimationFrame(() =>
                                  form?.querySelector('[data-topic="baseline"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                                ),
                              )
                            }}
                          >
                            <MoveOutAssetCheck
                              roomNumber={inspectionForm.room_number}
                              assets={inspectionForm.assets}
                              onChange={setInspectionAssets}
                              invalidIndexes={inspectionFieldErrors.assets || []}
                            />
                          </FurnitureAssetsRow>
                        )
                      }
                      return (
                        <div
                          key={item.key}
                          className={`inspection-row has-extra${result ? ` is-${result}` : ''}${isMissing ? ' is-missing' : ''}`}
                        >
                          <span className="inspection-row-label">
                            {item.label}
                            {isMissing && <small>ยังไม่ได้เลือก</small>}
                            {inspectionBaseline.baseline && (
                              <MoveInCompareTag before={inspectionBaseline.baseline.checklist?.[item.key]} after={result} />
                            )}
                          </span>
                          <div className="inspection-choices" role="radiogroup" aria-label={item.label}>
                            {CHECKLIST_RESULT_OPTIONS.map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                role="radio"
                                aria-checked={result === option.key}
                                title={result === option.key ? `${option.title} (กดอีกครั้งเพื่อยกเลิก)` : option.title}
                                className={`inspection-choice is-${option.key}${result === option.key ? ' is-selected' : ''}`}
                                onClick={() => setChecklistResult(item.key, option.key)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          {COSTED_RESULTS.includes(result) && (
                            <InspectionCostInput
                              value={inspectionForm.item_costs[item.key]}
                              onChange={(cost) => setInspectionItemCost(item.key, cost)}
                              label={item.label}
                              tone={result}
                              hint="เว้นว่างหากไม่คิดค่าเสียหาย"
                              error={costInvalid ? 'กรอกเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง' : ''}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className={`inspection-damage-total${inspectionDamageTotal > 0 ? ' is-charged' : ''}`}>
                    <span>ค่าเสียหายเบื้องต้น (หักจากเงินมัดจำ)</span>
                    <strong>
                      {inspectionDamageTotal > 0
                        ? `฿${inspectionDamageTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : 'ไม่มีค่าเสียหาย'}
                    </strong>
                  </div>
                </section>

                {inspectionForm.room_number && (
                  <section className="inspection-section" data-topic="baseline" hidden={!['all', 'baseline'].includes(inspectionSection)}>
                    <MoveInBaselineCard
                      baseline={inspectionBaseline.baseline}
                      loading={inspectionBaseline.loading}
                      error={inspectionBaseline.error}
                    />
                  </section>
                )}

                <section className="inspection-section" data-topic="photos" hidden={!['all', 'photos'].includes(inspectionSection)}>
                  <h4 className="inspection-section-title">
                    <span className="inspection-step">3</span> รายละเอียดและรูปภาพ
                  </h4>
                  <div className="staff-form-field">
                    <div className="staff-form-label-row">
                      <label className="staff-form-label" htmlFor="inspection-damage-note">
                        รายละเอียดและตำแหน่งที่พบ{' '}
                        {inspectionHasIssue ? (
                          <span className="staff-form-required">*</span>
                        ) : (
                          <span className="staff-form-optional">(ไม่บังคับ)</span>
                        )}
                      </label>
                      <span className="staff-form-counter">{inspectionForm.damage_note.length}/1000</span>
                    </div>
                    <textarea
                      id="inspection-damage-note"
                      className={`staff-form-input staff-form-textarea${inspectionFieldErrors.damage_note ? ' is-invalid' : ''}`}
                      rows={3}
                      maxLength={1000}
                      value={inspectionForm.damage_note}
                      onChange={(event) => {
                        setInspectionForm((form) => ({ ...form, damage_note: event.target.value }))
                        setInspectionFieldErrors((errors) => ({ ...errors, damage_note: undefined }))
                      }}
                      placeholder="ระบุรายการ ตำแหน่ง และลักษณะการชำรุดหรือสูญหาย"
                    />
                    {inspectionFieldErrors.damage_note && (
                      <span className="staff-form-field-error">{inspectionFieldErrors.damage_note}</span>
                    )}
                  </div>
                  <div className="staff-form-field">
                    <span className="staff-form-label">
                      รูปภาพประกอบ{' '}
                      {inspectionHasIssue ? (
                        <span className="staff-form-required">(จำเป็นเมื่อชำรุด/สูญหาย · สูงสุด {INSPECTION_MAX_PHOTOS} รูป)</span>
                      ) : (
                        <span className="staff-form-optional">(ไม่บังคับ · สูงสุด {INSPECTION_MAX_PHOTOS} รูป)</span>
                      )}
                    </span>
                    <InspectionPhotoPicker
                      files={inspectionForm.photos}
                      existing={inspectionForm.existingPhotos}
                      onRemoveExisting={(url) =>
                        {
                          setInspectionForm((form) => ({
                            ...form,
                            existingPhotos: form.existingPhotos.filter((photo) => photo.url !== url),
                          }))
                          setInspectionFieldErrors((errors) => ({ ...errors, photos: undefined }))
                        }
                      }
                      onChange={(photos) => {
                        setInspectionForm((form) => ({ ...form, photos }))
                        setInspectionFieldErrors((errors) => ({ ...errors, photos: undefined }))
                      }}
                      onError={setInspectionError}
                    />
                    {inspectionFieldErrors.photos && (
                      <span className="staff-form-field-error">{inspectionFieldErrors.photos}</span>
                    )}
                  </div>
                </section>

                {inspectionMoveRoomId && (
                  <section className="inspection-section" data-topic="finance" hidden={!['all', 'finance'].includes(inspectionSection)}>
                    <h4 className="inspection-section-title">
                      <span className="inspection-step">4</span> ค่าเสียหายและเงินมัดจำ
                    </h4>
                    <MoveRoomDamageFinance
                      key={inspectionMoveRoomId}
                      previewUrl={`/api/staff/requests/${inspectionMoveRoomId}/transfer-preview`}
                      value={inspectionForm.damage_cost}
                      readOnly
                      error={inspectionFieldErrors.damage_cost}
                      inputId="inspection-damage-cost"
                    />
                  </section>
                )}

                <div className="inspection-footer">
                  {inspectionError && (
                    <p className="staff-form-error inspection-footer-error" role="alert">
                      {inspectionError}
                    </p>
                  )}
                  <p className="inspection-footer-note">
                    {inspectionTenantRequest || inspectionEditing?.tenant_request_id
                      ? inspectionTenantRequest?.type === 'moveout' || inspectionEditing?.tenant_request_type === 'moveout'
                        ? 'บันทึกผลตรวจและรูปแล้ว Staff สามารถอนุมัติการย้ายออกได้'
                        : 'บันทึกผลตรวจแล้ว ถ้ามีค่าเช่าหรือมัดจำที่ต้องเก็บเพิ่ม ระบบจะส่งยอดให้ผู้เช่าชำระก่อนอนุมัติย้ายห้อง'
                      : 'ผลตรวจและรูปจะถูกบันทึกในระบบและส่งให้ Admin ตรวจสอบ'}
                  </p>
                  <div className="inspection-footer-actions">
                    <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                      ยกเลิก
                    </button>
                    <button type="submit" className="staff-action-btn is-primary" disabled={inspectionSubmitting}>
                      {inspectionSubmitting
                        ? 'กำลังบันทึก...'
                        : inspectionEditing
                          ? 'บันทึกการแก้ไข'
                          : inspectionTenantRequest ? 'บันทึกผลตรวจ' : 'ส่งผลตรวจให้ Admin'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </Modal>
        )}

        {activeSummary && (
          <section className="staff-summary-panel">
            <header className="staff-summary-panel-head">
              <span className="staff-summary-panel-title">{activeSummary.title}</span>
            </header>
            <div className="staff-summary-tiles">
              {summaryTiles.map(({ key, ...tile }) => (
                <StaffSummaryTile key={key} {...tile} />
              ))}
            </div>
          </section>
        )}

        <RoleTabMenu
          tabs={staffTabGroups}
          activeKey={staffGroupOf(staffTab)}
          activeLabel={STAFF_TAB_LABEL[staffTab]}
          onSelect={(key) => {
            if (staffGroupOf(staffTab) === key) return
            const group = staffTabGroups.find((item) => item.key === key)
            goToStaffTab(lastStaffTabByGroup[key] && group.tabs.includes(lastStaffTabByGroup[key]) ? lastStaffTabByGroup[key] : group.tabs[0])
            setAnnouncementFocus(null)
          }}
          listClassName="staff-tabs mb-0"
          linkClassName="staff-tab-link"
          logoutClassName="staff-logout-btn"
          onLogout={handleLogout}
          renderBadge={(groupKey) => {
            const tabs = staffTabGroups.find((group) => group.key === groupKey)?.tabs || []
            const count = tabs.reduce((sum, key) => sum + (key === 'home' ? homePendingTotal : newTabItemCount(key)), 0)
            return count > 0 && (
              <span className="staff-tab-badge" aria-label={`${count} ${groupKey === 'home' ? 'รายการรอตรวจ' : 'รายการใหม่'}`}>
                {count}
              </span>
            )
          }}
        />
        <div className="staff-subtabs-row">
          {staffTabGroups.filter((group) => group.tabs.length > 1 && group.key === staffGroupOf(staffTab)).map((group) => (
            <ul key={group.key} className="nav staff-subtabs staff-group-subtabs" aria-label={group.label}>
              {group.tabs.map((key) => {
                const count = key === 'completed-contracts' ? contractSummary?.unviewed || 0 : newTabItemCount(key)
                return (
                  <li className="nav-item" key={key}>
                    <button
                      type="button"
                      className={`nav-link staff-subtab-link${staffTab === key ? ' active' : ''}`}
                      onClick={() => {
                        goToStaffTab(key)
                        setLastStaffTabByGroup((current) => ({ ...current, [group.key]: key }))
                        setAnnouncementFocus(null)
                      }}
                    >
                      {STAFF_TAB_LABEL[key]}
                      {count > 0 && <span className="staff-subtab-badge" aria-label={key === 'completed-contracts' ? `${count} สัญญาที่ยังไม่เปิดดู` : `${count} รายการใหม่`}>{count}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          ))}
          {staffTab === 'home' && (
            <ul className="nav staff-subtabs" aria-label="หมวดหมู่หน้าแรก">
              {HOME_SECTIONS.map((section) => {
                const count = section.key in pendingSectionCounts ? pendingSectionCounts[section.key] : newSectionItemCount(section.key)
                return (
                  <li className="nav-item" key={section.key}>
                    <button
                      type="button"
                      className={`nav-link staff-subtab-link${homeSection === section.key ? ' active' : ''}`}
                      onClick={() => setHomeSection(section.key)}
                    >
                      {section.label}
                      {count > 0 && <span className="staff-subtab-badge" aria-label={`${count} รายการรอตรวจ`}>{count}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="dorm-menu-bar">
            <DormInfoMenu apiBase="/api/staff/dorm-info" />
          </div>
        </div>

        {staffTab === 'payment-review' && (
          <StaffPaymentReview
            key={tabFocus?.tab === 'payment-review' ? tabFocus.nonce : 'payment-review'}
            onCountChange={setPendingSlipCount}
            focusId={tabFocus?.tab === 'payment-review' ? tabFocus.id : null}
          />
        )}

        {staffTab === 'completed-contracts' && <StaffCompletedContractsTab onSummaryChange={setContractSummary} />}

        {staffTab === 'resident-visits' && (
          <StaffResidentVisitsTab
            key={tabFocus?.tab === 'resident-visits' ? tabFocus.nonce : 'resident-visits'}
            rooms={rooms}
            onCountChange={setPendingVisitCount}
            focusId={tabFocus?.tab === 'resident-visits' ? tabFocus.id : null}
          />
        )}

        {staffTab === 'safety' && (
          <StaffSafetyTab
            key={tabFocus?.tab === 'safety' ? tabFocus.nonce : 'safety'}
            rooms={rooms}
            onCountChange={setPendingSafetyCount}
            focusId={tabFocus?.tab === 'safety' ? tabFocus.id : null}
          />
        )}

        {staffTab === 'announcements' && (
          <AnnouncementBoard
            key={announcementFocus?.nonce ?? 'board'}
            variant="staff"
            announcements={announcements}
            openId={announcementFocus?.id}
            canManage
            apiBase="/api/staff/announcements"
            onChange={loadAnnouncements}
          />
        )}

        {staffTab === 'wifi' && <WifiManager />}
        {staffTab === 'market' && <MarketManager onSummary={setMarketSummary} focus={tabFocus?.tab === 'market' ? tabFocus : null} />}
        {staffTab === 'repair-vendors' && <RepairVendorManager rooms={rooms} onSummary={setRepairSummary} focus={tabFocus?.tab === 'repair-vendors' ? tabFocus : null} />}

        {staffTab === 'cameras' && staffUser?.role === 'Staff' && <CameraMonitor />}

        {staffTab === 'parcels' && (
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
                <label className="parcel-label" htmlFor="staff-parcel-search">ค้นหา</label>
                <input
                  id="staff-parcel-search"
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
                <label className="parcel-label" htmlFor="staff-parcel-status">สถานะ</label>
                <select
                  id="staff-parcel-status"
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
              <table className="parcel-table parcel-ui-table staff-parcel-table">
                <thead>
                  <tr>
                    <th className="staff-parcel-who">ห้อง / ผู้รับ</th>
                    <th className="staff-parcel-sender">ผู้ส่ง / รายละเอียด</th>
                    <th className="staff-parcel-tracking">เลขพัสดุ</th>
                    <th className="staff-parcel-photo">รูป</th>
                    <th className="staff-parcel-status">สถานะ</th>
                    <th className="staff-parcel-record">บันทึก</th>
                    <th className="staff-parcel-action" aria-label="การดำเนินการ" />
                  </tr>
                </thead>
                <tbody>
                  {parcelsLoading ? (
                    <tr><td className="parcel-empty" colSpan={7}>กำลังโหลดรายการพัสดุ...</td></tr>
                  ) : parcelsError ? (
                    <tr>
                      <td className="parcel-empty" colSpan={7}>
                        {parcelsError}{' '}
                        <button type="button" className="parcel-action-btn is-ghost" onClick={loadParcels}>ลองใหม่</button>
                      </td>
                    </tr>
                  ) : filteredParcels.length === 0 ? (
                    <tr>
                      <td className="parcel-empty" colSpan={7}>
                        <span className="parcel-empty-icon"><PackageIcon size={28} strokeWidth={1.8} /></span>
                        {parcels.length ? 'ไม่พบรายการพัสดุตามเงื่อนไข' : 'ยังไม่มีรายการพัสดุ'}
                      </td>
                    </tr>
                  ) : (
                    pagedParcels.map((parcel) => (
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
                        <td className="staff-parcel-who">
                          <div className="parcel-ui-who">
                            <span className="parcel-room-badge">{parcel.room_number}</span>
                            <div className="parcel-ui-stack">
                              <strong>{parcel.first_name ? `${parcel.first_name} ${parcel.last_name}` : 'ไม่มีผู้เช่าปัจจุบัน'}</strong>
                              {parcel.is_previous_tenant ? <em className="parcel-prev-tenant">{PREVIOUS_TENANT_LABEL}</em> : null}
                              <small>
                                <WaitingDetailIcon type="phone" size={12} />
                                {parcel.phone || '-'}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className="staff-parcel-sender">
                          <div className="parcel-ui-stack">
                            <strong>{parcel.sender_name || 'พัสดุทั่วไป'}</strong>
                            <small className="parcel-ui-desc">{parcel.description || 'ไม่มีรายละเอียด'}</small>
                          </div>
                        </td>
                        <td className="staff-parcel-tracking">
                          {parcel.tracking_number ? <span className="parcel-ui-tracking">{parcel.tracking_number}</span> : <span className="parcel-ui-none">-</span>}
                        </td>
                        <td className="staff-parcel-photo">
                          {parcel.photos?.length ? (
                            <button
                              type="button"
                              className="parcel-thumb"
                              aria-label={`ดูรูปพัสดุห้อง ${parcel.room_number}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                setParcelPhotoPreview(parcel)
                              }}
                            >
                              <UploadImage src={parcel.photos[0].url} alt="" />
                              {parcel.photos.length > 1 && <span>+{parcel.photos.length - 1}</span>}
                            </button>
                          ) : <span className="parcel-ui-nophoto">ไม่มีรูป</span>}
                        </td>
                        <td className="staff-parcel-status">
                          <div className="parcel-ui-stack">
                            <span className={`parcel-ui-status ${parcelStatusInfo(parcel.status).tone}`}>
                              <span className="parcel-ui-status-dot" aria-hidden="true" />
                              {parcelStatusInfo(parcel.status).label}
                            </span>
                            {parcel.received_at && <small>{formatDateTime(parcel.received_at)}</small>}
                          </div>
                        </td>
                        <td className="staff-parcel-record">
                          <div className="parcel-ui-stack">
                            <strong className="parcel-ui-date">{formatDateTime(parcel.created_at)}</strong>
                            <small>
                              โดย <span className="parcel-ui-actor">{parcel.staff_name || 'เจ้าหน้าที่'}</span>
                            </small>
                          </div>
                        </td>
                        <td className="parcel-ui-action staff-parcel-action">
                          <span className="parcel-ui-open">
                            ดูรายละเอียด
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m9 6 6 6-6 6" />
                            </svg>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <StaffPagination page={parcelPage} total={filteredParcels.length} onChange={setParcelPage} />
          </div>
        )}

        {staffTab === 'waiting-list' && (
          <div className="staff-card staff-tab-card">
            <div className="staff-card-header">
              <div>
                <h2>
                  รายชื่อคนรอห้องว่าง <span className="staff-count-pill">{waitingList.length}</span>
                </h2>
                <p className="waiting-list-storage-note">
                  ห้องว่างตอนนี้ {vacantRooms.length} ห้อง · Admin เห็นรายชื่อนี้และจัดการสถานะต่อได้
                </p>
              </div>
              <button
                type="button"
                className="staff-action-btn is-primary"
                onClick={() => openWaitingListModal()}
              >
                + เพิ่มผู้สนใจ
              </button>
            </div>
            <StaffFilterPanel
              segmentsBelow
              segmentsClassName="staff-waiting-segments"
              segments={[
                { key: 'all', label: 'ทั้งหมด', count: waitingList.length },
                ...Object.entries(WAITING_LIST_STATUS).map(([key, info]) => ({
                  key,
                  label: info.label,
                  className: `tone-${info.tone}`,
                  count: waitingStatusCounts[key] || 0,
                })),
              ]}
              active={waitingListStatus}
              onSegment={(value) => {
                setWaitingListStatus(value)
                setWaitingListPage(1)
              }}
              search={waitingListSearch}
              onSearch={(value) => {
                setWaitingListSearch(value)
                setWaitingListPage(1)
              }}
              searchPlaceholder="ค้นหาชื่อ เบอร์โทร ประเภทห้อง หรือหมายเหตุ"
              resultText={`พบ ${filteredWaitingList.length} จาก ${waitingList.length} รายชื่อ`}
              dateRange={{
                label: 'วันที่แจ้ง',
                from: waitingListDates.from,
                to: waitingListDates.to,
                onChange: (range) => {
                  setWaitingListDates(range)
                  setWaitingListPage(1)
                },
              }}
              canClear={waitingListFiltersActive}
              onClear={() => {
                setWaitingListSearch('')
                setWaitingListDates({ from: '', to: '' })
                setWaitingListStatus('all')
                setWaitingListSort('newest')
                setWaitingListPage(1)
              }}
            >
              <select
                className="staff-filter-select"
                value={waitingListSort}
                onChange={(event) => {
                  setWaitingListSort(event.target.value)
                  setWaitingListPage(1)
                }}
                aria-label="เรียงลำดับ"
              >
                {WAITING_LIST_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </StaffFilterPanel>
            <div className="waiting-cards-scroll">
              {filteredWaitingList.length === 0 ? (
                <div className="waiting-empty">
                  <span className="waiting-empty-icon" aria-hidden="true">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="9" cy="8" r="4" />
                      <path d="M2 21a7 7 0 0 1 14 0" />
                      <path d="M17 11h5M19.5 8.5v5" />
                    </svg>
                  </span>
                  <strong>{waitingList.length ? 'ไม่พบรายชื่อตามเงื่อนไข' : 'ยังไม่มีรายชื่อผู้รอห้องว่าง'}</strong>
                  <span>{waitingList.length ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ' : 'กด "+ เพิ่มผู้สนใจ" เพื่อบันทึกรายชื่อแรก'}</span>
                </div>
              ) : (
                <>
                  {waitingListActionError && !waitingListDetail && (
                    <p className="staff-form-error" role="alert">{waitingListActionError}</p>
                  )}
                  <WaitingListTimeline
                    items={waitingListPageItems}
                    now={waitingNow}
                    onDetail={setWaitingListDetail}
                    onEdit={openWaitingListModal}
                    onDelete={(item) => { setWaitingListDeleteError(''); setWaitingListDelete(item) }}
                    onStatusChange={setWaitingListEntryStatus}
                    statusBusyId={waitingListStatusBusyId}
                  />
                </>
              )}
            </div>
            <StaffPagination page={currentWaitingListPage} total={filteredWaitingList.length} onChange={setWaitingListPage} />
          </div>
        )}

        {staffTab === 'move-out-inspections' && inspectionPage === 'move-in' && (
          <MoveInInspectionPanel Modal={Modal} FilterPanel={StaffFilterPanel} subtabs={inspectionSubtabs} />
        )}

        {staffTab === 'move-out-inspections' && inspectionPage === 'results' && (
          <div className="staff-card staff-tab-card">
            {inspectionSubtabs}
            <div className="staff-card-header">
              <div>
                <h2>
                  ผลตรวจห้อง <span className="staff-count-pill">{moveOutInspections.length}</span>
                </h2>
                <p className="waiting-list-storage-note">รวมผลตรวจห้องตอนย้ายออก และผลตรวจห้องเดิมก่อนอนุมัติย้ายห้อง</p>
              </div>
              <button
                type="button"
                className="staff-action-btn is-primary"
                onClick={openMoveOutInspection}
                disabled={!rooms.some((room) => room.is_booked && room.tenant)}
              >
                + เริ่มตรวจห้อง
              </button>
            </div>
            {inspectionListError && (
              <p className="staff-form-error staff-form-error-block" role="alert">
                {inspectionListError}
              </p>
            )}
            <StaffFilterPanel
              segmentsClassName="staff-inspection-segments"
              segments={[
                { key: 'all', label: 'ทั้งหมด', count: kindInspections.length },
                ...INSPECTION_RESULT_SEGMENTS.map((segment) => ({
                  ...segment,
                  count: inspectionToneCounts[segment.key] || 0,
                })),
              ]}
              active={inspectionResultFilter}
              onSegment={(value) => {
                setInspectionResultFilter(value)
                setInspectionsPage(1)
              }}
              search={inspectionSearch}
              onSearch={(value) => {
                setInspectionSearch(value)
                setInspectionsPage(1)
              }}
              searchPlaceholder="ค้นหาเลขห้อง ชื่อผู้เช่า ผู้ตรวจ หรือรายละเอียดความเสียหาย"
              resultText={`พบ ${filteredInspections.length} จาก ${kindInspections.length} รายการ`}
              canClear={inspectionFiltersActive}
              onClear={() => {
                setInspectionSearch('')
                setInspectionResultFilter('all')
                setInspectionSort('newest')
                setInspectionKind('all')
                setInspectionsPage(1)
              }}
            >
              <select
                className="staff-filter-select"
                value={inspectionKind}
                onChange={(event) => {
                  setInspectionKind(event.target.value)
                  setInspectionsPage(1)
                }}
                aria-label="ประเภทการตรวจห้อง"
              >
                <option value="all">ทุกประเภท ({moveOutInspections.length})</option>
                {Object.entries(INSPECTION_KINDS).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.label} ({inspectionKindCounts[key] || 0})
                  </option>
                ))}
              </select>
              <select
                className="staff-filter-select"
                value={inspectionSort}
                onChange={(event) => {
                  setInspectionSort(event.target.value)
                  setInspectionsPage(1)
                }}
                aria-label="เรียงลำดับ"
              >
                <option value="newest">ตรวจล่าสุดก่อน</option>
                <option value="oldest">ตรวจเก่าสุดก่อน</option>
              </select>
            </StaffFilterPanel>
            <div className="table-responsive staff-inspection-table-wrap">
              <table className="staff-table inspection-table insp-table">
                <thead>
                  <tr>
                    <th>ห้อง</th>
                    <th>ผู้เช่า</th>
                    <th>วันที่ตรวจ</th>
                    <th>ผลตรวจ</th>
                    <th className="staff-insp-inspector">ผู้ตรวจ</th>
                    <th className="staff-insp-photos">รูป</th>
                    <th className="inspection-col-actions">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInspections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="staff-empty">
                        {kindInspections.length ? 'ไม่พบผลตรวจตามเงื่อนไข' : inspectionKind === 'all' ? 'ยังไม่มีผลตรวจห้อง' : INSPECTION_KINDS[inspectionKind].empty}
                      </td>
                    </tr>
                  ) : (
                    inspectionsPageItems.map((inspection) => {
                      const summary = summarizeInspection(inspection.checklist)
                      const issueCount = summary.counts.damaged + summary.counts.missing
                      return (
                        <tr
                          key={inspection.id}
                          className="insp-row-clickable"
                          tabIndex={0}
                          aria-label={`ดูผลตรวจห้อง ${inspection.room_number}`}
                          onClick={() => openInspectionView(inspection)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openInspectionView(inspection)
                            }
                          }}
                        >
                          <td className="staff-insp-room">
                            <InspectionRoomCell
                              roomNumber={inspection.room_number}
                              targetRoomNumber={inspection.target_room_number}
                              isMoveRoom={inspection.tenant_request_type === 'move_room'}
                            />
                          </td>
                          <td className="staff-insp-tenant">
                            <InspectionPersonCell name={inspection.tenant_name} phone={inspection.tenant_phone} />
                          </td>
                          <td className="staff-insp-date">
                            <InspectionDateCell value={inspection.created_at} />
                          </td>
                          <td className="staff-insp-result">
                            <div className="inspection-cell-result">
                              <span className={`inspection-result is-${summary.tone}`}>
                                {summary.label}
                                {issueCount > 0 && ` ${issueCount} ข้อ`}
                              </span>
                            </div>
                          </td>
                          <td className="staff-insp-inspector">
                            <InspectionInspectorCell name={inspection.inspected_by_name} className="staff-actor" />
                          </td>
                          <td className="staff-insp-photos">
                            <InspectionPhotosCell count={inspection.photo_count} />
                          </td>
                          <td className="inspection-col-actions insp-actions-cell staff-insp-actions">
                            <div className="insp-actions">
                              <div
                                className="insp-actions-row"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="staff-action-btn is-ghost"
                                  disabled={inspectionLoadingId === inspection.id}
                                  onClick={() => openEditInspection(inspection)}
                                >
                                  {inspectionLoadingId === inspection.id ? 'กำลังโหลด...' : 'แก้ไข'}
                                </button>
                              </div>
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
            <StaffPagination
              page={currentInspectionsPage}
              total={filteredInspections.length}
              onChange={setInspectionsPage}
            />
          </div>
        )}

        {staffTab === 'home' && (
          <>
            {homeSection === 'rooms' && (
            <div className="staff-card staff-rooms-card">
              <div className="staff-card-header">
                <h2>รายการห้องพัก</h2>
                <div className="staff-card-header-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    onClick={() => {
                      setInvoicePrintError('')
                      setInvoiceModal({ mode: 'all', roomNumber: '' })
                    }}
                    disabled={invoiceGenerating}
                  >
                    {invoiceGenerating ? 'กำลังเตรียม...' : 'ใบแจ้งหนี้ / PDF'}
                  </button>
                </div>
              </div>

              <StaffFilterPanel
                segments={[
                  { key: 'all', label: 'ทั้งหมด', count: rooms.length },
                  { key: 'booked', label: 'ไม่ว่าง', count: roomStatusCounts.booked },
                  { key: 'vacant', label: 'ว่าง', count: roomStatusCounts.vacant, className: 'tone-success' },
                  { key: 'due', label: 'รอเก็บเงิน', count: roomStatusCounts.due, className: 'tone-warning' },
                  { key: 'expiring', label: 'ใกล้หมดสัญญา', count: roomStatusCounts.expiring, className: 'tone-danger' },
                ]}
                active={statusFilter}
                onSegment={(value) => {
                  setStatusFilter(value)
                  setRoomsPage(1)
                }}
                search={search}
                onSearch={(value) => {
                  setSearch(value)
                  setRoomsPage(1)
                }}
                searchPlaceholder="ค้นหาเลขห้อง ชื่อผู้เช่า หรือเบอร์โทร"
                resultText={`พบ ${filteredRooms.length} จาก ${rooms.length} ห้อง`}
                canClear={statusFilter !== 'all' || Boolean(search.trim())}
                onClear={() => {
                  setStatusFilter('all')
                  setSearch('')
                  setRoomsPage(1)
                }}
              />

              {invoicePrintError && (
                <div className="staff-inline-error" role="alert">
                  {invoicePrintError}
                </div>
              )}

              <div className="table-responsive">
                <table className="staff-table staff-rooms-table">
                  <thead>
                    <tr>
                      <th>เลขห้อง</th>
                      <th className="staff-col-optional">ขนาดห้อง</th>
                      <th>สถานะห้อง</th>
                      <th>ผู้เช่า</th>
                      <th className="staff-col-optional">เบอร์โทร</th>
                      <th className="staff-col-optional">ระยะเวลาสัญญา</th>
                      <th>สถานะการชำระเงิน</th>
                      <th className="staff-col-optional">ยอดค้างชำระ</th>
                      <th>การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRooms.length === 0 ? (
                      <tr className="staff-room-empty-row">
                        <td colSpan={9} className="staff-empty">
                          ไม่พบข้อมูลห้องพักที่ตรงกับเงื่อนไข
                        </td>
                      </tr>
                    ) : (
                      paginatedRooms.map((room) => {
                        const isExpanded = expandedRoomNumbers.has(room.room_number)
                        const hasDue = room.currentDue && room.currentDue.status !== 'paid'
                        const expiryStatus = getRoomExpiryStatus(room)
                        return (
                          <Fragment key={room.room_number}>
                            <tr className={`staff-room-main-row${hasDue ? ' has-due' : ''}${hasDue || !room.is_booked ? ' has-mobile-action' : ''}`}>
                              <td className="staff-room-number-cell">
                                <span className="staff-room-mobile-label">ห้อง</span>
                                {room.room_number}
                              </td>
                              <td className="staff-col-optional">
                                <span className={`staff-room-size${room.room_size != null ? '' : ' is-empty'}`}>
                                  {room.room_size != null ? formatRoomSize(room.room_size) : 'ไม่ระบุ'}
                                </span>
                              </td>
                              <td className="staff-room-status-cell">
                                <span className={`staff-badge status-${room.is_booked ? 'booked' : room.held_for_transfer ? 'held' : 'vacant'}`}>
                                  {room.is_booked ? 'ไม่ว่าง' : room.held_for_transfer ? 'ว่าง · มีผู้เช่ารอย้ายเข้า' : 'ว่าง'}
                                </span>
                              </td>
                              <td className="staff-room-tenant-cell">
                                <span className="staff-room-mobile-label">ผู้เช่า</span>
                                <span className="staff-room-tenant-name">{room.tenant ? `${room.tenant.first_name} ${room.tenant.last_name}` : '-'}</span>
                              </td>
                              <td className="staff-col-optional">{room.tenant?.phone || '-'}</td>
                              <td className="staff-col-optional">
                                <div className="staff-contract-dates">
                                  {room.rental_start_date && room.rental_end_date ? (
                                    <>
                                      {formatDate(room.rental_start_date)}
                                      <ContractArrowIcon />
                                      {formatDate(room.rental_end_date)}
                                    </>
                                  ) : (
                                    '-'
                                  )}
                                </div>
                                {expiryStatus && (
                                  <div className={`staff-contract-remaining is-${expiryStatus.level}`}>
                                    {expiryStatus.label}
                                  </div>
                                )}
                              </td>
                              <td className="staff-room-payment-cell">
                                <span className="staff-room-mobile-label">การชำระเงิน</span>
                                {room.currentDue ? (
                                  <span className={`staff-badge status-${dueBadgeClass(room.currentDue.status)}`}>
                                    {DUE_STATUS_LABEL[room.currentDue.status] || room.currentDue.status}
                                  </span>
                                ) : (
                                  <span className="staff-badge status-none">-</span>
                                )}
                              </td>
                              <td className="staff-col-optional staff-room-due-cell">
                                <span className="staff-room-mobile-label">ยอดค้างชำระ</span>
                                {hasDue ? (
                                  <button
                                    type="button"
                                    className={`staff-due-amount staff-due-amount-btn is-${dueBadgeClass(room.currentDue.status)}`}
                                    onClick={() => openDueDetail(room)}
                                  >
                                    ฿{formatCurrency(room.currentDue.amount)}
                                  </button>
                                ) : (
                                  <span className="staff-due-amount is-none">-</span>
                                )}
                              </td>
                              <td className="staff-room-action-cell">
                                <div className="staff-row-actions staff-row-actions-desktop">
                                  {Boolean(room.is_booked) && room.tenant && (
                                    <button
                                      type="button"
                                      className="staff-action-btn is-ghost"
                                      onClick={() => openHistory(room)}
                                    >
                                      ประวัติการจ่ายเงิน
                                    </button>
                                  )}
                                  {Boolean(room.is_booked) && room.tenant && (
                                    <button
                                      type="button"
                                      className="staff-action-btn is-ghost"
                                      onClick={() => openUtilityBill(room)}
                                    >
                                      ส่งค่าน้ำ-ค่าไฟ
                                    </button>
                                  )}
                                  {hasDue && (
                                    <button
                                      type="button"
                                      className="staff-action-btn is-primary"
                                      onClick={() => openCollect(room)}
                                    >
                                      เก็บเงิน
                                    </button>
                                  )}
                                  {!room.is_booked && (
                                    <button
                                      type="button"
                                      className="staff-action-btn is-primary"
                                      onClick={() => navigate('/register', { state: { roomNumber: room.room_number } })}
                                    >
                                      เพิ่มผู้เช่า
                                    </button>
                                  )}
                                </div>
                                {hasDue && (
                                  <button
                                    type="button"
                                    className="staff-action-btn is-primary staff-room-mobile-action"
                                    onClick={() => openCollect(room)}
                                  >
                                    เก็บเงิน
                                  </button>
                                )}
                                {!room.is_booked && (
                                  <button
                                    type="button"
                                    className="staff-action-btn is-primary staff-room-mobile-action"
                                    onClick={() => navigate('/register', { state: { roomNumber: room.room_number } })}
                                  >
                                    เพิ่มผู้เช่า
                                  </button>
                                )}
                              </td>
                            </tr>
                            <tr className="staff-row-detail">
                              <td colSpan={9}>
                                <div className={`staff-row-detail-wrap${isExpanded ? ' is-expanded' : ''}`}>
                                  <div className="staff-row-detail-scroll">
                                    <div className="staff-row-detail-content">
                                      <div className="staff-row-detail-item">
                                        <span>ขนาดห้อง</span>
                                        <strong>{room.room_size != null ? formatRoomSize(room.room_size) : 'ไม่ระบุ'}</strong>
                                      </div>
                                      <div className="staff-row-detail-item">
                                        <span>เบอร์โทร</span>
                                        <strong>{room.tenant?.phone || '-'}</strong>
                                      </div>
                                      <div className="staff-row-detail-item">
                                        <span>ระยะเวลาสัญญา</span>
                                        <span className="staff-contract-value">
                                          <strong>
                                            {room.rental_start_date && room.rental_end_date ? (
                                              <>
                                                {formatDate(room.rental_start_date)}
                                                <ContractArrowIcon />
                                                {formatDate(room.rental_end_date)}
                                              </>
                                            ) : (
                                              '-'
                                            )}
                                          </strong>
                                          {expiryStatus && (
                                            <span className={`staff-contract-remaining is-${expiryStatus.level}`}>
                                              {expiryStatus.label}
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                      {Boolean(room.is_booked) && room.tenant && (
                                        <div className="staff-row-actions">
                                          <button
                                            type="button"
                                            className="staff-action-btn is-ghost"
                                            onClick={() => openHistory(room)}
                                          >
                                            ประวัติการจ่ายเงิน
                                          </button>
                                          <button
                                            type="button"
                                            className="staff-action-btn is-ghost"
                                            onClick={() => openUtilityBill(room)}
                                          >
                                            ส่งค่าน้ำ-ค่าไฟ
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                            <tr className="staff-row-toggle-row">
                              <td colSpan={9}>
                                <button
                                  type="button"
                                  className={`staff-row-toggle${isExpanded ? ' is-expanded' : ''}`}
                                  onClick={() => toggleRoomExpanded(room.room_number)}
                                  aria-expanded={isExpanded}
                                >
                                  ดูเพิ่มเติม
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredRooms.length > 0 && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(currentRoomsPage - 1) * ROOMS_PER_PAGE + 1}-
                    {Math.min(currentRoomsPage * ROOMS_PER_PAGE, filteredRooms.length)} จาก {filteredRooms.length} รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentRoomsPage <= 1}
                      onClick={() => setRoomsPage(Math.max(1, currentRoomsPage - 1))}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {currentRoomsPage} / {roomsTotalPages}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentRoomsPage >= roomsTotalPages}
                      onClick={() => setRoomsPage(Math.min(roomsTotalPages, currentRoomsPage + 1))}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

              {TENANT_HOME_CARDS.filter((card) => card.type === homeSection).map((card) => {
                const items = tenantRequests.filter((request) => request.type === card.type)
                const { filters, list: shownItems } = filterHomeRequests(card.type, items)
                const extras = TENANT_HOME_EXTRA_FILTERS[card.type] || []
                const filtersActive =
                  filters.status !== 'all' ||
                  Boolean(filters.search.trim()) ||
                  filters.sort !== 'oldest' ||
                  extras.some((extra) => filters[extra.key] && filters[extra.key] !== 'all')
                const page = getHomePage(card.type, shownItems.length)
                return (
                  <div className="staff-card staff-home-request-card" key={card.type}>
                    <div className="staff-card-header">
                      <h2>
                        {card.title}
                        {items.length > 0 && <span className="staff-count-pill">{items.length}</span>}
                      </h2>
                      <div className="staff-card-header-actions">
                        <button type="button" className="staff-view-all-btn" onClick={openTenantHistory}>
                          ดูประวัติ
                        </button>
                      </div>
                    </div>

                    {card.type === 'move_room' && <TransferContractPendingPanel apiBase="/api/staff" refreshKey={tenantRequests.length} />}

                    {items.length > 0 && (
                      <StaffFilterPanel
                        segments={[
                          { key: 'all', label: 'ทั้งหมด', count: items.length },
                          { key: 'pending', label: 'รอดำเนินการ', count: items.filter((request) => request.status === 'pending').length },
                          { key: 'in_progress', label: 'รับเรื่องแล้ว', count: items.filter((request) => request.status === 'in_progress').length },
                        ]}
                        active={filters.status}
                        onSegment={(value) => updateHomeRequestFilter(card.type, { status: value })}
                        search={filters.search}
                        onSearch={(value) => updateHomeRequestFilter(card.type, { search: value })}
                        searchPlaceholder={card.type === 'move_room' ? 'ค้นหาเลขห้องเดิม/ห้องใหม่ ชื่อ หรือเบอร์โทร' : 'ค้นหาเลขห้อง ชื่อผู้เช่า หรือเบอร์โทร'}
                        resultText={filtersActive ? `พบ ${shownItems.length} จาก ${items.length} รายการ` : null}
                        canClear={filtersActive}
                        onClear={() => {
                          setHomeRequestFilters((current) => ({ ...current, [card.type]: {} }))
                          setHomePages((current) => ({ ...current, [card.type]: 1 }))
                        }}
                      >
                        {extras.map((extra) => (
                          <select
                            key={extra.key}
                            className="staff-filter-select"
                            value={filters[extra.key] || 'all'}
                            onChange={(event) => updateHomeRequestFilter(card.type, { [extra.key]: event.target.value })}
                            aria-label={extra.label}
                          >
                            <option value="all">{extra.all}</option>
                            {extra.options.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ))}
                        <select
                          className="staff-filter-select"
                          value={filters.sort}
                          onChange={(event) => updateHomeRequestFilter(card.type, { sort: event.target.value })}
                          aria-label="เรียงลำดับ"
                        >
                          <option value="oldest">รอนานสุดก่อน</option>
                          <option value="newest">ล่าสุดก่อน</option>
                        </select>
                      </StaffFilterPanel>
                    )}

                    <div className="staff-card-body">
                      {requestsError ? (
                        <div className="staff-inline-error">
                          <p className="staff-form-error staff-form-error-block">{requestsError}</p>
                          <button
                            type="button"
                            className="staff-action-btn is-ghost"
                            onClick={() => {
                              setRequestsLoading(true)
                              loadRequests().finally(() => setRequestsLoading(false))
                            }}
                          >
                            ลองใหม่
                          </button>
                        </div>
                      ) : requestsLoading ? (
                        <p className="staff-empty">กำลังโหลดข้อมูล...</p>
                      ) : items.length === 0 ? (
                        <p className="staff-empty">ไม่มีคำขอที่รอดำเนินการในขณะนี้</p>
                      ) : shownItems.length === 0 ? (
                        <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
                      ) : (
                        <div className="staff-requests-list is-grid">
                          {shownItems.slice((page - 1) * TENANT_GRID_COUNT, page * TENANT_GRID_COUNT).map(renderTenantRequestItem)}
                        </div>
                      )}
                    </div>
                    {renderHomePager(card.type, shownItems.length)}
                  </div>
                )
              })}

            {homeSection === 'maintenance' && (
              <div className="staff-card staff-home-request-card">
                <div className="staff-card-header">
                  <h2>
                    คำขอแจ้งซ่อม
                    {maintenanceRequests.length > 0 && (
                      <span className="staff-count-pill">{maintenanceRequests.length}</span>
                    )}
                  </h2>
                  <div className="staff-card-header-actions">
                    <button type="button" className="staff-view-all-btn" onClick={openMaintenanceHistory}>
                      ดูประวัติ
                    </button>
                    {filteredMaintenanceRequests.length > TENANT_GRID_COUNT && (
                      <button
                        type="button"
                        className="staff-view-all-btn"
                        onClick={() => setViewAllRequests('maintenance')}
                      >
                        ดูทั้งหมด
                      </button>
                    )}
                  </div>
                </div>

                {maintenanceRequests.length > 0 && maintenanceFilterPanel(false)}

                <div className="staff-card-body">
                  {requestsError ? (
                    <div className="staff-inline-error">
                      <p className="staff-form-error staff-form-error-block">{requestsError}</p>
                      <button
                        type="button"
                        className="staff-action-btn is-ghost"
                        onClick={() => {
                          setRequestsLoading(true)
                          loadRequests().finally(() => setRequestsLoading(false))
                        }}
                      >
                        ลองใหม่
                      </button>
                    </div>
                  ) : requestsLoading ? (
                    <p className="staff-empty">กำลังโหลดข้อมูล...</p>
                  ) : maintenanceRequests.length === 0 ? (
                    <p className="staff-empty">ไม่มีคำขอที่รอดำเนินการในขณะนี้</p>
                  ) : filteredMaintenanceRequests.length === 0 ? (
                    <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
                  ) : (
                    <div className="staff-requests-list is-grid">
                      {filteredMaintenanceRequests
                        .slice(
                          (getHomePage('maintenance', filteredMaintenanceRequests.length) - 1) * TENANT_GRID_COUNT,
                          getHomePage('maintenance', filteredMaintenanceRequests.length) * TENANT_GRID_COUNT,
                        )
                        .map(renderMaintenanceRequestItem)}
                    </div>
                  )}
                </div>
                {renderHomePager('maintenance', filteredMaintenanceRequests.length)}
              </div>
            )}

            {homeSection === 'expenses' && (
            <div className="staff-card staff-expenses-card">
              <div className="staff-card-header">
                <h2>
                  รายจ่าย
                  {expensesTotal > 0 && <span className="staff-count-pill">{expensesTotal}</span>}
                </h2>
                <div className="staff-card-header-actions">
                  <button type="button" className="staff-action-btn is-primary" onClick={openCreateExpense}>
                    + บันทึกรายจ่าย
                  </button>
                </div>
              </div>

              <StaffFilterPanel
                search={expenseFilters.search}
                onSearch={(value) => updateExpenseFilters({ search: value }, { debounce: true })}
                searchPlaceholder="ค้นหาหมวดหมู่ รายละเอียด ร้านค้า เลขใบเสร็จ หรือเลขห้อง"
                dateRange={{
                  from: expenseFilters.from,
                  to: expenseFilters.to,
                  onChange: (range) => updateExpenseFilters(range),
                }}
                resultText={expenseFiltersActive ? `พบ ${expensesTotal} รายการ` : null}
                canClear={expenseFiltersActive}
                onClear={() => updateExpenseFilters(EMPTY_EXPENSE_FILTERS)}
              >
                <select
                  className="staff-filter-select"
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
              </StaffFilterPanel>

              <div className="staff-card-body">
                {expensesError ? (
                  <div className="staff-inline-error">
                    <p className="staff-form-error staff-form-error-block">{expensesError}</p>
                    <button type="button" className="staff-action-btn is-ghost" disabled={expensesLoading} onClick={() => loadExpenses(expensesPage)}>
                      ลองใหม่
                    </button>
                  </div>
                ) : expensesLoading ? (
                  <p className="staff-empty">กำลังโหลดข้อมูล...</p>
                ) : expenses.length === 0 ? (
                  <p className="staff-empty">{expenseFiltersActive ? 'ไม่พบรายจ่ายที่ตรงกับเงื่อนไข' : 'ยังไม่มีรายการรายจ่าย'}</p>
                ) : (
                  <div className="staff-requests-list is-grid">
                    {expenses.map((expense) => (
                      <article key={expense.id} className="staff-req-card type-expense is-structured">
                        <div className="staff-req-head is-identity">
                          <span className="staff-req-avatar" aria-hidden="true">
                            <WaitingDetailIcon type="user" size={18} />
                          </span>
                          <div className="staff-req-identity">
                            <strong title={expense.description || expense.category}>{expense.description || expense.category}</strong>
                            <span className="staff-expense-category">{expense.category}</span>
                          </div>
                          <span className="staff-badge staff-req-status staff-expense-date">{formatDate(expense.expense_date)}</span>
                        </div>
                        <div className="staff-req-route">
                          <div className="staff-req-route-room is-target">
                            <small>จำนวนเงิน</small>
                            <strong>฿{formatCurrency(expense.amount)}</strong>
                          </div>
                        </div>
                        <TenantRequestDetails
                          columns
                          details={[
                            { key: 'vendor', icon: 'user', label: 'ผู้รับเงิน', value: expense.vendor || 'ไม่ระบุ' },
                            { key: 'payment', icon: 'wallet', label: 'ชำระโดย', value: EXPENSE_PAYMENT_METHOD_LABEL[expense.payment_method] || 'ไม่ระบุ' },
                            { key: 'receipt', icon: 'copy', label: 'เลขใบเสร็จ', value: expense.receipt_number || 'ไม่ระบุ' },
                            { key: 'room', icon: 'info', label: 'ห้องที่เกี่ยวข้อง', value: expense.room_number ? `ห้อง ${expense.room_number}` : 'ไม่ระบุ' },
                          ]}
                        />
                        {expense.photos?.length > 0 && (
                          <div className="staff-expense-thumbs-block">
                            <span className="staff-expense-thumbs-title">รูปหลักฐาน · {expense.photos.length} รูป</span>
                            <button
                              type="button"
                              className="staff-expense-thumbs"
                              aria-label={`ดูรูปหลักฐานทั้งหมด ${expense.photos.length} รูป`}
                              onClick={() => openExpenseDetail(expense)}
                            >
                              {expense.photos.slice(0, 4).map((photo, index) => (
                                <span key={photo.url} className="staff-expense-thumb">
                                  <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
                                  {index === 3 && expense.photos.length > 4 && (
                                    <span className="staff-expense-thumb-more">+{expense.photos.length - 4}</span>
                                  )}
                                </span>
                              ))}
                            </button>
                          </div>
                        )}
                        <TenantRequestCardFooter
                          steps={[{ key: 'created', label: 'บันทึกโดย', by: expense.recorded_by_name || '-', date: expense.created_at, tone: 'info' }]}
                        >
                          <button type="button" className="staff-text-link" onClick={() => openExpenseDetail(expense)}>
                            ดูรายละเอียด
                          </button>
                          <button
                            type="button"
                            className="staff-action-btn is-danger"
                            onClick={() => {
                              setExpenseDeleteError('')
                              setExpenseDelete(expense)
                            }}
                          >
                            ลบ
                          </button>
                          <button type="button" className="staff-action-btn is-primary" onClick={() => openEditExpense(expense)}>
                            แก้ไข
                          </button>
                        </TenantRequestCardFooter>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="staff-pagination" aria-label="แบ่งหน้ารายจ่าย">
                <span className="staff-pagination-info">
                  {expensesTotal > 0
                    ? `แสดง ${(expensesPage - 1) * EXPENSES_PAGE_SIZE + 1}-${Math.min(expensesPage * EXPENSES_PAGE_SIZE, expensesTotal)} จาก ${expensesTotal} รายการ`
                    : '0 รายการ'}
                </span>
                <div className="staff-pagination-controls">
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    disabled={expensesLoading || expensesPage <= 1}
                    onClick={() => loadExpenses(expensesPage - 1)}
                  >
                    ก่อนหน้า
                  </button>
                  <span className="staff-pagination-page">
                    หน้า {expensesPage} / {expensesTotalPages}
                  </span>
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    disabled={expensesLoading || expensesPage >= expensesTotalPages}
                    onClick={() => loadExpenses(expensesPage + 1)}
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            </div>
            )}
          </>
        )}
      </div>

      {expenseDelete && (
        <Modal title="ยืนยันการลบรายจ่าย" onClose={() => setExpenseDelete(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-warning">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
              </div>
              <p className="staff-confirm-message">ลบรายจ่ายนี้ออกจากระบบ?</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>วันที่</span>
                  <strong>{formatDate(expenseDelete.expense_date)}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>หมวดหมู่</span>
                  <strong>{expenseDelete.category}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>จำนวนเงิน</span>
                  <strong>฿{formatCurrency(expenseDelete.amount)}</strong>
                </div>
              </div>
              {expenseDeleteError && (
                <p className="staff-form-error" role="alert">
                  {expenseDeleteError}
                </p>
              )}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-ghost"
                  disabled={expenseDeleting}
                  onClick={requestClose}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="staff-action-btn is-danger"
                  disabled={expenseDeleting}
                  onClick={() => confirmDeleteExpense(requestClose)}
                >
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
          variant="transfer-detail"
        >
          {(requestClose) => {
            const setField = (field) => (event) => setExpenseForm((prev) => ({ ...prev, [field]: event.target.value }))
            const photoCount = expenseForm.keptPhotos.length + expenseForm.newPhotos.length
            const expenseExtraFilled = ['vendor', 'payment_method', 'receipt_number', 'room_number'].filter(
              (field) => String(expenseForm[field]).trim(),
            ).length
            return (
              <form
                className="staff-transfer-body"
                onSubmit={(event) => submitExpenseForm(event, requestClose)}
                noValidate
              >
                <div className="staff-transfer-scroll">
                  <section className="staff-transfer-section">
                    <h4 className="staff-transfer-section-title">ข้อมูลรายจ่าย</h4>
                    <div className="staff-expense-form-grid">
                      <div className="staff-form-field is-full">
                        <label className="staff-form-label" htmlFor="expense-category">
                          หมวดหมู่ <span className="text-danger">*</span>
                        </label>
                        <input
                          id="expense-category"
                          type="text"
                          className="staff-form-input"
                          placeholder="พิมพ์เอง หรือเลือกจากด้านล่าง"
                          maxLength={50}
                          value={expenseForm.category}
                          onChange={setField('category')}
                        />
                        <div className="staff-expense-chips" role="group" aria-label="หมวดหมู่ที่ใช้บ่อย">
                          {EXPENSE_CATEGORY_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={`staff-expense-chip${expenseForm.category.trim() === preset ? ' is-active' : ''}`}
                              onClick={() => setExpenseForm((prev) => ({ ...prev, category: preset }))}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="staff-form-field">
                        <label className="staff-form-label" htmlFor="expense-amount">
                          จำนวนเงิน (บาท) <span className="text-danger">*</span>
                        </label>
                        <input
                          id="expense-amount"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          className="staff-form-input no-spinner"
                          value={expenseForm.amount}
                          onChange={setField('amount')}
                        />
                      </div>
                      <div className="staff-form-field">
                        <label className="staff-form-label" htmlFor="expense-date">
                          วันที่จ่าย <span className="text-danger">*</span>
                        </label>
                        <ThaiDatePicker
                          id="expense-date"
                          className="staff-form-input"
                          value={expenseForm.expense_date}
                          onChange={(date) => setExpenseForm((prev) => ({ ...prev, expense_date: date }))}
                        />
                      </div>
                      <div className="staff-form-field is-full">
                        <label className="staff-form-label" htmlFor="expense-description">
                          รายละเอียด <span className="text-danger">*</span>
                        </label>
                        <textarea
                          id="expense-description"
                          className="staff-form-input staff-form-textarea"
                          rows={3}
                          maxLength={255}
                          placeholder="อธิบายรายจ่ายนี้ เช่น ซื้ออะไร ซ่อมจุดไหน"
                          value={expenseForm.description}
                          onChange={setField('description')}
                        />
                        <small className="staff-expense-counter">{expenseForm.description.length}/255</small>
                      </div>
                    </div>
                  </section>

                  <section className={`staff-transfer-section staff-expense-collapsible${expenseExtraOpen ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="staff-expense-collapse-toggle"
                      aria-expanded={expenseExtraOpen}
                      aria-controls="expense-extra-fields"
                      onClick={() => setExpenseExtraOpen((open) => !open)}
                    >
                      <span className="staff-transfer-section-title">
                        รายละเอียดเพิ่มเติม
                        <small className="staff-expense-optional">ไม่บังคับ</small>
                      </span>
                      {!expenseExtraOpen && expenseExtraFilled > 0 && (
                        <span className="staff-expense-filled">กรอกแล้ว {expenseExtraFilled} ช่อง</span>
                      )}
                      <svg className="staff-expense-collapse-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    <div className="staff-expense-form-grid" id="expense-extra-fields" hidden={!expenseExtraOpen}>
                      <div className="staff-form-field">
                        <label className="staff-form-label" htmlFor="expense-vendor">
                          ผู้รับเงิน / ร้านค้า
                        </label>
                        <input
                          id="expense-vendor"
                          type="text"
                          className="staff-form-input"
                          placeholder="เช่น การไฟฟ้า, ร้านวัสดุ"
                          maxLength={120}
                          value={expenseForm.vendor}
                          onChange={setField('vendor')}
                        />
                      </div>
                      <div className="staff-form-field">
                        <label className="staff-form-label" htmlFor="expense-payment">
                          วิธีชำระเงิน
                        </label>
                        <select
                          id="expense-payment"
                          className="staff-form-input"
                          value={expenseForm.payment_method}
                          onChange={setField('payment_method')}
                        >
                          <option value="">ไม่ระบุ</option>
                          {Object.entries(EXPENSE_PAYMENT_METHOD_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="staff-form-field">
                        <label className="staff-form-label" htmlFor="expense-receipt">
                          เลขที่ใบเสร็จ / อ้างอิง
                        </label>
                        <input
                          id="expense-receipt"
                          type="text"
                          className="staff-form-input"
                          maxLength={60}
                          value={expenseForm.receipt_number}
                          onChange={setField('receipt_number')}
                        />
                      </div>
                      <div className="staff-form-field">
                        <label className="staff-form-label" htmlFor="expense-room">
                          ห้องที่เกี่ยวข้อง
                        </label>
                        <select
                          id="expense-room"
                          className="staff-form-input"
                          value={expenseForm.room_number}
                          onChange={setField('room_number')}
                        >
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

                  <section className="staff-transfer-section">
                    <h4 className="staff-transfer-section-title">
                      รูปใบเสร็จ / หลักฐาน <span className="text-danger">*</span>
                      <small className="staff-expense-counter">
                        {photoCount}/{EXPENSE_MAX_PHOTOS} รูป · JPG, PNG, WebP ไม่เกิน 5 MB
                      </small>
                    </h4>
                    {expenseForm.keptPhotos.length > 0 && (
                      <div className="staff-expense-kept-photos">
                        {expenseForm.keptPhotos.map((photo, index) => (
                          <figure key={photo.url} className="staff-expense-kept-photo">
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
                      id="expense-photos"
                      files={expenseForm.newPhotos}
                      onChange={(files) => setExpenseForm((prev) => ({ ...prev, newPhotos: files }))}
                      error={expensePhotoError}
                      onError={setExpensePhotoError}
                      heading={false}
                      maxPhotos={Math.max(0, EXPENSE_MAX_PHOTOS - expenseForm.keptPhotos.length)}
                    />
                  </section>
                </div>

                <div className="staff-transfer-footer">
                  {expenseFormError && <p className="staff-form-error">{expenseFormError}</p>}
                  <div className="staff-form-actions">
                    <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                      ยกเลิก
                    </button>
                    <button type="submit" className="staff-action-btn is-primary" disabled={expenseSubmitting}>
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
        <Modal title="รายละเอียดรายจ่าย" onClose={() => setExpenseDetail(null)} variant="transfer-detail">
          {(requestClose) => (
            <div className="staff-transfer-body">
              <div className="staff-transfer-top">
                <div className="staff-req-detail-head">
                  <span className="staff-expense-category">{expenseDetail.category}</span>
                  {expenseDetail.payment_method && (
                    <span className="staff-badge status-in_progress">{EXPENSE_PAYMENT_METHOD_LABEL[expenseDetail.payment_method]}</span>
                  )}
                  <span className="staff-req-detail-date">
                    <WaitingDetailIcon type="calendar" size={16} />
                    <span>
                      <small>วันที่จ่าย</small>
                      <strong>{formatDate(expenseDetail.expense_date)}</strong>
                    </span>
                  </span>
                </div>
                <div className="staff-req-detail-room is-summary">
                  <span className="staff-req-detail-room-icon">
                    <WaitingDetailIcon type="wallet" size={30} />
                  </span>
                  <div className="staff-req-detail-room-identity">
                    <small>จำนวนเงิน</small>
                    <strong>฿{formatCurrency(expenseDetail.amount)}</strong>
                  </div>
                  <div className="staff-req-detail-room-tenant">
                    <small>ผู้รับเงิน / ร้านค้า</small>
                    <span>{expenseDetail.vendor || '-'}</span>
                    {expenseDetail.receipt_number && (
                      <em className="staff-req-detail-room-phone">
                        <WaitingDetailIcon type="copy" size={13} />
                        ใบเสร็จ {expenseDetail.receipt_number}
                      </em>
                    )}
                  </div>
                </div>
              </div>
              <div className="staff-transfer-scroll">
                <div className="staff-expense-detail-layout">
                <section className="staff-transfer-section">
                  <h4 className="staff-transfer-section-title">ข้อมูลรายจ่าย</h4>
                  <TenantRequestDetails
                    columns
                    details={[
                      { key: 'date', icon: 'calendar', label: 'วันที่จ่าย', value: formatDate(expenseDetail.expense_date) },
                      { key: 'payment', icon: 'wallet', label: 'ชำระโดย', value: EXPENSE_PAYMENT_METHOD_LABEL[expenseDetail.payment_method] || 'ไม่ระบุ' },
                      { key: 'room', icon: 'info', label: 'ห้องที่เกี่ยวข้อง', value: expenseDetail.room_number ? `ห้อง ${expenseDetail.room_number}` : 'ไม่เกี่ยวกับห้องใด' },
                      { key: 'by', icon: 'user', label: 'บันทึกโดย', value: expenseDetail.recorded_by_name || '-' },
                      { key: 'created', icon: 'clock', label: 'บันทึกเมื่อ', value: `${formatDateTime(expenseDetail.created_at)} น.` },
                    ]}
                  />
                  <div className="staff-req-note">
                    <span className="staff-req-note-label">รายละเอียด</span>
                    <p className="is-full">{expenseDetail.description || '-'}</p>
                  </div>
                </section>
                <section className="staff-transfer-section staff-expense-gallery">
                  <h4 className="staff-transfer-section-title">
                    รูปใบเสร็จ / หลักฐาน
                    {expenseDetail.photos?.length > 0 && (
                      <small className="staff-expense-counter">
                        {expenseDetail.photos.length > 4 ? `${expenseDetail.photos.length} รูป` : `${Math.min(expenseDetailPhotoIndex, expenseDetail.photos.length - 1) + 1}/${expenseDetail.photos.length}`}
                      </small>
                    )}
                  </h4>
                  {expenseDetail.photos?.length > 4 ? (
                    <div className="staff-expense-gallery-grid">
                      {expenseDetail.photos.slice(0, 4).map((photo, index) => (
                        <button
                          key={photo.url}
                          type="button"
                          className="staff-expense-gallery-tile"
                          aria-label={`ดูรูปที่ ${index + 1}`}
                          onClick={() => setExpensePhotoPreview({ index })}
                        >
                          <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} />
                          {index === 3 && <span className="staff-expense-gallery-more">+{expenseDetail.photos.length - 4}</span>}
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
                            className="staff-expense-gallery-main"
                            title="คลิกเพื่อดูรูปขนาดเต็ม"
                            onClick={() => setExpensePhotoPreview({ index: activeIndex })}
                          >
                            <UploadImage src={activePhoto.url} alt={activePhoto.name || `รูปที่ ${activeIndex + 1}`} />
                            <span className="staff-expense-gallery-zoom">ดูรูปขนาดเต็ม</span>
                          </button>
                          {expenseDetail.photos.length > 1 && (
                            <div className="staff-expense-gallery-thumbs">
                              {expenseDetail.photos.map((photo, index) => (
                                <button
                                  key={photo.url}
                                  type="button"
                                  className={`staff-expense-gallery-thumb${index === activeIndex ? ' is-active' : ''}`}
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
                    <div className="staff-expense-gallery-empty">
                      <WaitingDetailIcon type="copy" size={28} />
                      <span>ยังไม่มีรูปใบเสร็จหรือหลักฐาน</span>
                      <button
                        type="button"
                        className="staff-text-link"
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
              <div className="staff-transfer-footer">
                <div className="staff-form-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
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

      {viewAllRequests === 'tenant' && (
        <Modal
          stickyFilters
          title={`${TENANT_HOME_CARDS.find((card) => card.type === tenantFilterType)?.title ?? 'คำขอผู้เช่า'} (ทั้งหมด)`}
          onClose={() => {
            setViewAllRequests(null)
            resetTenantFilters()
          }}
        >
          <TenantRequestFilters {...tenantFilterProps} sticky />

          {filteredTenantRequests.length === 0 ? (
            <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
          ) : (
            <>
              <div className="staff-requests-list">{paginatedTenantRequests.map(renderTenantRequestItem)}</div>
              {tenantModalTotalPages > 1 && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(currentTenantModalPage - 1) * MODAL_ITEMS_PER_PAGE + 1}-
                    {Math.min(currentTenantModalPage * MODAL_ITEMS_PER_PAGE, filteredTenantRequests.length)} จาก{' '}
                    {filteredTenantRequests.length} รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentTenantModalPage <= 1}
                      onClick={() => setTenantModalPage(Math.max(1, currentTenantModalPage - 1))}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {currentTenantModalPage} / {tenantModalTotalPages}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentTenantModalPage >= tenantModalTotalPages}
                      onClick={() => setTenantModalPage(Math.min(tenantModalTotalPages, currentTenantModalPage + 1))}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {viewAllRequests === 'maintenance' && (
        <Modal
          stickyFilters
          title="คำขอแจ้งซ่อม (ทั้งหมด)"
          onClose={() => {
            setViewAllRequests(null)
            resetMaintenanceFilters()
          }}
        >
          {maintenanceFilterPanel(true)}

          {filteredMaintenanceRequests.length === 0 ? (
            <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
          ) : (
            <>
              <div className="staff-requests-list">
                {paginatedMaintenanceRequests.map(renderMaintenanceRequestItem)}
              </div>
              {maintenanceModalTotalPages > 1 && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(currentMaintenanceModalPage - 1) * MODAL_ITEMS_PER_PAGE + 1}-
                    {Math.min(currentMaintenanceModalPage * MODAL_ITEMS_PER_PAGE, filteredMaintenanceRequests.length)}{' '}
                    จาก {filteredMaintenanceRequests.length} รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentMaintenanceModalPage <= 1}
                      onClick={() => setMaintenanceModalPage(Math.max(1, currentMaintenanceModalPage - 1))}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {currentMaintenanceModalPage} / {maintenanceModalTotalPages}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={currentMaintenanceModalPage >= maintenanceModalTotalPages}
                      onClick={() =>
                        setMaintenanceModalPage(Math.min(maintenanceModalTotalPages, currentMaintenanceModalPage + 1))
                      }
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {showTenantHistory && (
        <Modal
          stickyFilters
          title="ประวัติคำขอต่อสัญญา / แจ้งย้ายออก"
          variant="history"
          onClose={() => {
            setShowTenantHistory(false)
            setTenantHistoryData([])
            setTenantHistoryTotal(0)
            setTenantHistoryPage(1)
            setTenantHistoryError('')
            setTenantHistorySearch('')
            setTenantHistoryStatusFilter('all')
            setTenantHistoryType('all')
          }}
        >
          <TenantRequestFilters
            sticky
            type={tenantHistoryType}
            onType={(value) => {
              setTenantHistoryType(value)
              setTenantHistoryPage(1)
              loadTenantHistory(1, tenantHistorySearch, tenantHistoryStatusFilter, value)
            }}
            search={tenantHistorySearch}
            onSearch={(value) => {
              setTenantHistorySearch(value)
              setTenantHistoryPage(1)
              loadTenantHistory(1, value, tenantHistoryStatusFilter, tenantHistoryType)
            }}
            status={tenantHistoryStatusFilter}
            onStatus={(value) => {
              setTenantHistoryStatusFilter(value)
              setTenantHistoryPage(1)
              loadTenantHistory(1, tenantHistorySearch, value, tenantHistoryType)
            }}
            statusOptions={[
              { value: 'all', label: 'ทุกผลลัพธ์' },
              { value: 'approved', label: 'อนุมัติแล้ว' },
              { value: 'rejected', label: 'ปฏิเสธแล้ว' },
              { value: 'cancelled', label: 'ยกเลิกแล้ว' },
            ]}
            resultText={`พบ ${tenantHistoryTotal} คำขอ`}
            canClear={tenantHistoryType !== 'all' || tenantHistoryStatusFilter !== 'all' || Boolean(tenantHistorySearch)}
            onClear={() => {
              setTenantHistoryType('all')
              setTenantHistoryStatusFilter('all')
              setTenantHistorySearch('')
              setTenantHistoryPage(1)
              loadTenantHistory(1, '', 'all', 'all')
            }}
          />

          {tenantHistoryLoading ? (
            <p className="staff-empty">กำลังโหลดข้อมูล...</p>
          ) : tenantHistoryError ? (
            <p className="staff-form-error">{tenantHistoryError}</p>
          ) : tenantHistoryData.length === 0 ? (
            <p className="staff-empty">ไม่พบประวัติคำขอที่ตรงกับเงื่อนไข</p>
          ) : (
            <>
              <div className="staff-requests-list">
                {tenantHistoryData.map((request) => (
                  <TenantRequestCard
                    key={request.id}
                    request={request}
                    steps={[
                      { key: 'created', label: 'ส่งคำขอ', date: request.created_at, tone: 'info' },
                      ...(request.accepted_at
                        ? [{ key: 'accepted', label: 'รับเรื่อง', by: request.accepted_by_name, date: request.accepted_at, tone: 'info' }]
                        : []),
                      ...(request.completed_at
                        ? [
                            {
                              key: 'completed',
                              label: request.status === 'approved' ? 'อนุมัติ' : request.status === 'cancelled' ? 'ยกเลิก' : 'ปฏิเสธ',
                              by: request.completed_by_name,
                              date: request.completed_at,
                              tone: request.status === 'approved' ? 'success' : 'danger',
                            },
                          ]
                        : []),
                    ]}
                  >
                    <button type="button" className="staff-text-link" onClick={() => setTenantRequestDetail(request)}>
                      ดูรายละเอียด
                    </button>
                  </TenantRequestCard>
                ))}
              </div>
              {tenantHistoryTotal > MODAL_ITEMS_PER_PAGE && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(tenantHistoryPage - 1) * MODAL_ITEMS_PER_PAGE + 1}-
                    {Math.min(tenantHistoryPage * MODAL_ITEMS_PER_PAGE, tenantHistoryTotal)} จาก {tenantHistoryTotal}{' '}
                    รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={tenantHistoryPage <= 1}
                      onClick={() => {
                        const next = Math.max(1, tenantHistoryPage - 1)
                        setTenantHistoryPage(next)
                        loadTenantHistory(next)
                      }}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {tenantHistoryPage} / {Math.max(1, Math.ceil(tenantHistoryTotal / MODAL_ITEMS_PER_PAGE))}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={tenantHistoryPage >= Math.ceil(tenantHistoryTotal / MODAL_ITEMS_PER_PAGE)}
                      onClick={() => {
                        const next = Math.min(
                          Math.ceil(tenantHistoryTotal / MODAL_ITEMS_PER_PAGE),
                          tenantHistoryPage + 1,
                        )
                        setTenantHistoryPage(next)
                        loadTenantHistory(next)
                      }}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {showMaintenanceHistory && (
        <Modal
          stickyFilters
          title="ประวัติคำขอแจ้งซ่อม"
          variant="history"
          onClose={() => {
            setShowMaintenanceHistory(false)
            setMaintenanceHistoryData([])
            setMaintenanceHistoryTotal(0)
            setMaintenanceHistoryPage(1)
            setMaintenanceHistoryError('')
            setMaintenanceHistorySearch('')
            setMaintenanceHistoryStatusFilter('all')
          }}
        >
          <StaffFilterPanel
            sticky
            segments={[
              { key: 'all', label: 'ทั้งหมด' },
              { key: 'done', label: 'เสร็จสิ้น', className: 'tone-success' },
              { key: 'cancelled', label: 'ยกเลิกแล้ว', className: 'tone-danger' },
            ]}
            active={maintenanceHistoryStatusFilter}
            onSegment={(value) => {
              setMaintenanceHistoryStatusFilter(value)
              setMaintenanceHistoryPage(1)
              loadMaintenanceHistory(1, maintenanceHistorySearch, value)
            }}
            search={maintenanceHistorySearch}
            onSearch={(value) => {
              setMaintenanceHistorySearch(value)
              setMaintenanceHistoryPage(1)
              loadMaintenanceHistory(1, value, maintenanceHistoryStatusFilter)
            }}
            searchPlaceholder="ค้นหาเลขห้อง ชื่อผู้เช่า เบอร์โทร หรือรายละเอียด"
            resultText={`พบ ${maintenanceHistoryTotal} รายการ`}
            canClear={maintenanceHistoryStatusFilter !== 'all' || Boolean(maintenanceHistorySearch)}
            onClear={() => {
              setMaintenanceHistoryStatusFilter('all')
              setMaintenanceHistorySearch('')
              setMaintenanceHistoryPage(1)
              loadMaintenanceHistory(1, '', 'all')
            }}
          />

          {maintenanceHistoryLoading ? (
            <p className="staff-empty">กำลังโหลดข้อมูล...</p>
          ) : maintenanceHistoryError ? (
            <p className="staff-form-error">{maintenanceHistoryError}</p>
          ) : maintenanceHistoryData.length === 0 ? (
            <p className="staff-empty">ไม่พบประวัติการแจ้งซ่อมที่ตรงกับเงื่อนไข</p>
          ) : (
            <>
              <div className="staff-requests-list">
                {maintenanceHistoryData.map((request) => (
                  <div key={request.id} className="staff-request-item is-maintenance has-detail-link">
                    <div className="staff-request-main">
                      <div className="staff-request-headline">
                        <span className="staff-badge type-maintenance">แจ้งซ่อม</span>
                        <span className="staff-request-room">ห้อง {request.room_number}</span>
                        <span className="staff-request-tenant">
                          {request.first_name} {request.last_name}
                        </span>
                        <span className="staff-status-break" aria-hidden="true" />
                        <span className={`staff-badge status-${request.status} staff-status-end`}>
                          {MAINTENANCE_STATUS_LABEL[request.status] || request.status}
                        </span>
                      </div>
                      <div className="staff-request-meta">
                        <span>{MAINTENANCE_CATEGORY_LABEL[request.category] || 'อื่นๆ'}</span>
                        <span>{MAINTENANCE_TIME_LABEL[request.preferred_time] || 'เวลาไหนก็ได้'}</span>
                        {request.contact_phone && <span>โทร {request.contact_phone}</span>}
                      </div>
                      <p className="staff-request-note">{request.description}</p>
                      {request.photos?.length > 0 && (
                        <div className="staff-request-photos">
                          {request.photos.slice(0, 4).map((photo, index) => (
                            <button
                              key={`${photo.url}-${index}`}
                              type="button"
                              className="parcel-thumb"
                              aria-label={`ดูรูปแจ้งซ่อมห้อง ${request.room_number} รูปที่ ${index + 1}`}
                              onClick={() => {
                                setMaintenanceDetail(request)
                                setMaintenancePhotoPreview({ index })
                              }}
                            >
                              <UploadImage src={photo.url} alt="" />
                              {index === 3 && request.photos.length > 4 && <span>+{request.photos.length - 4}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="staff-request-timeline">
                        <p className="staff-request-date is-reported">
                          <span className="staff-request-date-label">แจ้งซ่อม</span>
                          <span className="staff-request-date-value">{formatDateTime(request.created_at)}</span>
                        </p>
                        {request.accepted_by_name && (
                          <p className="staff-request-date is-accepted">
                            <span className="staff-request-date-label">
                              รับเรื่องโดย <span className="staff-request-date-staff">{request.accepted_by_name}</span>
                            </span>
                            <span className="staff-request-date-value">{formatDateTime(request.accepted_at)}</span>
                          </p>
                        )}
                        {request.completed_by_name && (
                          <p className={`staff-request-date is-${request.status === 'done' ? 'approved' : 'rejected'}`}>
                            <span className="staff-request-date-label">
                              {request.status === 'done' ? 'ซ่อมเสร็จโดย' : 'ยกเลิกโดย'}{' '}
                              <span className="staff-request-date-staff">{request.completed_by_name}</span>
                            </span>
                            <span className="staff-request-date-value">{formatDateTime(request.completed_at)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <button type="button" className="staff-text-link" onClick={() => setMaintenanceDetail(request)}>
                      ดูรายละเอียด
                    </button>
                  </div>
                ))}
              </div>
              {maintenanceHistoryTotal > MODAL_ITEMS_PER_PAGE && (
                <div className="staff-pagination">
                  <span className="staff-pagination-info">
                    แสดง {(maintenanceHistoryPage - 1) * MODAL_ITEMS_PER_PAGE + 1}-
                    {Math.min(maintenanceHistoryPage * MODAL_ITEMS_PER_PAGE, maintenanceHistoryTotal)} จาก{' '}
                    {maintenanceHistoryTotal} รายการ
                  </span>
                  <div className="staff-pagination-controls">
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={maintenanceHistoryPage <= 1}
                      onClick={() => {
                        const next = Math.max(1, maintenanceHistoryPage - 1)
                        setMaintenanceHistoryPage(next)
                        loadMaintenanceHistory(next)
                      }}
                    >
                      ก่อนหน้า
                    </button>
                    <span className="staff-pagination-page">
                      หน้า {maintenanceHistoryPage} /{' '}
                      {Math.max(1, Math.ceil(maintenanceHistoryTotal / MODAL_ITEMS_PER_PAGE))}
                    </span>
                    <button
                      type="button"
                      className="staff-action-btn is-ghost"
                      disabled={maintenanceHistoryPage >= Math.ceil(maintenanceHistoryTotal / MODAL_ITEMS_PER_PAGE)}
                      onClick={() => {
                        const next = Math.min(
                          Math.ceil(maintenanceHistoryTotal / MODAL_ITEMS_PER_PAGE),
                          maintenanceHistoryPage + 1,
                        )
                        setMaintenanceHistoryPage(next)
                        loadMaintenanceHistory(next)
                      }}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {historySlip && (
        <div
          className={`payment-slip-overlay is-above-modal${historySlipClosing ? ' is-closing' : ''}`}
          role="presentation"
          onClick={() => setHistorySlipClosing(true)}
        >
          <section
            className="payment-slip-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-slip-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="payment-slip-header">
              <div className="payment-slip-heading">
                <span className="payment-slip-heading-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
                    <path d="M9 7h6M9 11h6M9 15h4" />
                  </svg>
                </span>
                <h3 id="history-slip-title">สลิปโอนเงิน</h3>
                {historyRoom && <span className="payment-slip-room">ห้อง {historyRoom.room_number}</span>}
              </div>
              <button
                type="button"
                className="payment-slip-close"
                onClick={() => setHistorySlipClosing(true)}
                aria-label="ปิด"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            <div className="payment-slip-body">
              <div className="payment-slip-image-frame">
                <button type="button" className="payment-slip-image-btn" onClick={() => setHistorySlipViewerOpen(true)} title="คลิกเพื่อดูรูปขนาดเต็ม">
                  <UploadImage src={historySlip.slip_path} alt="สลิปโอนเงิน" />
                </button>
                <span className="payment-slip-image-hint">คลิกที่รูปเพื่อดูขนาดเต็ม</span>
              </div>

              <dl className="payment-slip-details">
                <div className="payment-slip-amount">
                  <dt>จำนวนเงิน</dt>
                  <dd>฿{formatCurrency(historySlip.amount)}</dd>
                </div>
                <div>
                  <dt>
                    <SlipFieldIcon name="user" />
                    ผู้เช่า
                  </dt>
                  <dd>{historySlip.tenantName}</dd>
                </div>
                <div>
                  <dt>
                    <SlipFieldIcon name="list" />
                    รายการ
                  </dt>
                  <dd>{PAYMENT_TYPE_LABEL[historySlip.type] || 'ค่าเช่าห้อง'}</dd>
                </div>
                <div>
                  <dt>
                    <SlipFieldIcon name="status" />
                    สถานะ
                  </dt>
                  <dd>{PAYMENT_STATUS_LABEL[historySlip.status] || historySlip.status}</dd>
                </div>
                <div>
                  <dt>
                    <SlipFieldIcon name="date" />
                    วันที่
                  </dt>
                  <dd>{formatDateTime(historySlip.created_at)}</dd>
                </div>
              </dl>
            </div>

            <footer className="payment-slip-footer">
              <SlipDownloadButton url={historySlip.slip_path} fileName={`slip-${historyRoom ? `room-${historyRoom.room_number}-` : ''}${historySlip.id ?? 'payment'}`} />
            </footer>
          </section>
        </div>
      )}

      {historySlip && historySlipViewerOpen && createPortal(
        <PhotoLightbox
          photos={[{ name: 'สลิปโอนเงิน', url: historySlip.slip_path }]}
          initialIndex={0}
          title="สลิปโอนเงิน"
          subtitle={historyRoom ? `ห้อง ${historyRoom.room_number} · ${historySlip.tenantName || ''}` : historySlip.tenantName}
          label="สลิปโอนเงิน"
          onClose={() => setHistorySlipViewerOpen(false)}
        />,
        document.body,
      )}

      {historyRoom && (
        <Modal
          stickyFilters
          title={`ประวัติการจ่ายเงิน - ห้อง ${historyRoom.room_number}`}
          onClose={() => {
            setHistorySlip(null)
            setHistoryRoom(null)
            setHistorySearch('')
            setHistoryStatusFilter('all')
            setHistoryPage(1)
          }}
          variant="payment-history"
          bodyRef={historyBodyRef}
        >
          {historyLoading ? (
            <p className="staff-empty">กำลังโหลดข้อมูล...</p>
          ) : historyError ? (
            <p className="staff-form-error">{historyError}</p>
          ) : !historyData || historyData.length === 0 ? (
            <p className="staff-empty">ยังไม่มีประวัติการจ่ายเงินห้องนี้</p>
          ) : (
            <>
              <StaffFilterPanel
                sticky
                segments={[
                  { key: 'all', label: 'ทั้งหมด', count: historyPayments.length },
                  {
                    key: 'paid',
                    label: 'ชำระแล้ว',
                    count: historyPayments.filter((payment) => payment.status === 'paid').length,
                    className: 'tone-success',
                  },
                  {
                    key: 'pending',
                    label: 'รอชำระ',
                    count: historyPayments.filter((payment) => payment.status === 'pending').length,
                    className: 'tone-warning',
                  },
                  {
                    key: 'overdue',
                    label: 'ค้างชำระ',
                    count: historyPayments.filter((payment) => payment.status === 'overdue').length,
                    className: 'tone-danger',
                  },
                ]}
                active={historyStatusFilter}
                onSegment={(value) => {
                  setHistoryStatusFilter(value)
                  setHistoryPage(1)
                }}
                search={historySearch}
                onSearch={(value) => {
                  setHistorySearch(value)
                  setHistoryPage(1)
                }}
                searchPlaceholder="ค้นหาผู้เช่า จำนวนเงิน หรือหมายเหตุ"
                resultText={`พบ ${filteredHistoryPayments.length} จาก ${historyPayments.length} รายการ`}
                canClear={historyStatusFilter !== 'all' || Boolean(historySearch.trim())}
                onClear={() => {
                  setHistoryStatusFilter('all')
                  setHistorySearch('')
                  setHistoryPage(1)
                }}
              />

              {filteredHistoryPayments.length === 0 ? (
                <p className="staff-empty">ไม่พบประวัติการชำระเงินที่ตรงกับเงื่อนไข</p>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="staff-table">
                      <thead>
                        <tr>
                          <th>วันที่ชำระ</th>
                          <th>ผู้เช่า</th>
                          <th>รายการ</th>
                          <th>จำนวนเงิน</th>
                          <th>สถานะ</th>
                          <th>หมายเหตุ</th>
                          <th>สลิป</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistoryPayments.map((payment) => {
                          const notePart = splitNote(payment.note)
                          return (
                            <tr key={payment.id}>
                              <td>{formatDateTime(payment.created_at)}</td>
                              <td>{payment.tenantName}</td>
                              <td>{PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง'}</td>
                              <td>฿{formatCurrency(payment.amount)}</td>
                              <td>
                                <span className={`staff-badge status-${payment.status}`}>
                                  {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                                </span>
                              </td>
                              <td>
                                <span className="staff-history-note-cell" title={payment.note || ''}>
                                  <span className="staff-history-note-main">{notePart.main}</span>
                                  {notePart.extra && <span className="staff-history-note-extra">{notePart.extra}</span>}
                                </span>
                              </td>
                              <td>
                                {payment.slip_path ? (
                                  <button
                                    type="button"
                                    className="staff-action-btn is-ghost"
                                    onClick={() => {
                                      setHistorySlipClosing(false)
                                      setHistorySlip(payment)
                                    }}
                                  >
                                    ดูสลิป
                                  </button>
                                ) : (
                                  '-'
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {historyTotalPages > 1 && (
                    <div className="staff-pagination">
                      <span className="staff-pagination-info">
                        แสดง {(currentHistoryPage - 1) * historyPageSize + 1}-
                        {Math.min(currentHistoryPage * historyPageSize, filteredHistoryPayments.length)} จาก{' '}
                        {filteredHistoryPayments.length} รายการ
                      </span>
                      <div className="staff-pagination-controls">
                        <button
                          type="button"
                          className="staff-action-btn is-ghost"
                          disabled={currentHistoryPage <= 1}
                          onClick={() => setHistoryPage(Math.max(1, currentHistoryPage - 1))}
                        >
                          ก่อนหน้า
                        </button>
                        <span className="staff-pagination-page">
                          หน้า {currentHistoryPage} / {historyTotalPages}
                        </span>
                        <button
                          type="button"
                          className="staff-action-btn is-ghost"
                          disabled={currentHistoryPage >= historyTotalPages}
                          onClick={() => setHistoryPage(Math.min(historyTotalPages, currentHistoryPage + 1))}
                        >
                          ถัดไป
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Modal>
      )}

      {collectRoom && (
        <Modal
          title={`เก็บเงิน - ห้อง ${collectRoom.room_number}`}
          onClose={() => setCollectRoom(null)}
          variant="confirm"
        >
          {(requestClose) => {
            const due = collectRoom.currentDue
            const tenantName = collectRoom.tenant ? `${collectRoom.tenant.first_name} ${collectRoom.tenant.last_name}` : 'ไม่มีผู้เช่า'
            const items = due?.items?.length ? due.items : due ? [{ type: 'rent', label: 'ค่าเช่า', amount: due.amount }] : []
            const status = due?.status || 'due'
            const isOverdue = status === 'overdue'
            return (
              <div className="staff-confirm-body collect-body">
                <div className={`staff-confirm-icon ${isOverdue ? 'is-warning' : 'is-money'}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {isOverdue ? (
                      <>
                        <path d="M12 9v4M12 17h.01" />
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.7-2.5 1.7-2.5.6-2.5 1.8 1.1 2 2.5 2 2.5-.8 2.5-2" />
                      </>
                    )}
                  </svg>
                </div>
                <p className="staff-confirm-message">
                  {isOverdue ? 'ห้องนี้มียอดค้างชำระ ตรวจสอบยอดก่อนบันทึกการรับเงิน' : 'ตรวจสอบยอดก่อนบันทึกการรับเงิน'}
                </p>

                <div className="collect-tenant">
                  <span className="collect-avatar" aria-hidden="true">
                    <PersonIcon size={20} />
                  </span>
                  <div className="collect-tenant-text">
                    <strong>{tenantName}</strong>
                    <small>
                      {due?.periodStart && due?.periodEnd
                        ? `รอบ ${formatDate(due.periodStart)} – ${formatDate(due.periodEnd)}`
                        : 'ค่าเช่าเดือนนี้'}
                    </small>
                  </div>
                  <span className="collect-room">ห้อง {collectRoom.room_number}</span>
                </div>

                {due && (
                  <div className={`collect-receipt is-${dueBadgeClass(status)}`}>
                    <div className="collect-receipt-head">
                      <span>รายการที่ต้องชำระ</span>
                      <span className={`collect-status is-${dueBadgeClass(status)}`}>{DUE_STATUS_LABEL[status] || status}</span>
                    </div>
                    <ul className="collect-receipt-items">
                      {items.map((item, index) => (
                        <li key={item.id ?? `${item.type}-${index}`} className={`is-${item.type || 'other'}`}>
                          <span className="collect-item-label">
                            <span className="collect-item-dot" aria-hidden="true" />
                            {item.label}
                          </span>
                          <strong>฿{formatCurrency(item.amount)}</strong>
                        </li>
                      ))}
                    </ul>
                    {(Number(due.depositAmount) > 0 || Number(due.overdueMonths) > 0 || due.lumpSumMonths) && (
                      <div className="collect-receipt-notes">
                        {Number(due.overdueMonths) > 0 && <span className="is-late">ค้างชำระ {due.overdueMonths} เดือน</span>}
                        {due.lumpSumMonths && <span>จ่ายล่วงหน้า {due.lumpSumMonths} เดือน</span>}
                        {Number(due.depositAmount) > 0 && <span>รวมเงินมัดจำ ฿{formatCurrency(due.depositAmount)}</span>}
                      </div>
                    )}
                    <div className="collect-receipt-total">
                      <span>ยอดที่ต้องชำระ</span>
                      <strong>
                        <small>฿</small>
                        {formatCurrency(due.amount)}
                      </strong>
                    </div>
                    {due.dueDate && <p className="collect-receipt-due">ครบกำหนดชำระ {formatDate(due.dueDate)}</p>}
                  </div>
                )}

                <button
                  type="button"
                  className="collect-history-link"
                  onClick={() => {
                    const room = collectRoom
                    setCollectRoom(null)
                    openHistory(room)
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5M12 7v5l3 2" />
                  </svg>
                  ดูประวัติการจ่ายเงิน
                </button>

                {collectError && <p className="staff-form-error">{collectError}</p>}
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                    ยกเลิก
                  </button>
                  <button type="button" className="staff-action-btn is-primary" disabled={collectSubmitting} onClick={handleCollectPayment}>
                    {collectSubmitting ? 'กำลังบันทึก...' : 'ยืนยันรับเงิน'}
                  </button>
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {utilityRoom && (
        <Modal
          title={`ส่งค่าน้ำ-ค่าไฟ · ห้อง ${utilityRoom.room_number}`}
          onClose={() => setUtilityRoom(null)}
          variant="utility"
        >
          {(requestClose) => {
            const unitPrice = Number(utilityRoom.electricity_unit_price) || 0
            const isUnitsMode = utilityForm.electricity_mode === 'units'
            const units = Number(utilityForm.electricity_units)
            const directAmount = Number(utilityForm.electricity_amount)
            const electricityAmount = isUnitsMode
              ? Number.isFinite(units) && units > 0
                ? units * unitPrice
                : 0
              : Number.isFinite(directAmount) && directAmount > 0
                ? directAmount
                : 0
            const waterUnitPrice = Number(utilityRoom.water_unit_price) || 0
            const isWaterUnitsMode = utilityForm.water_mode === 'units'
            const waterUnits = Number(utilityForm.water_units)
            const directWaterAmount = Number(utilityForm.water_amount)
            const waterAmount = isWaterUnitsMode
              ? Number.isFinite(waterUnits) && waterUnits > 0 ? Math.round(waterUnits * waterUnitPrice * 100) / 100 : 0
              : Number.isFinite(directWaterAmount) && directWaterAmount > 0 ? directWaterAmount : 0
            const total = electricityAmount + (Number.isFinite(waterAmount) && waterAmount > 0 ? waterAmount : 0)
            const canSubmit = total > 0 && !utilitySubmitting
            const tenantName = utilityRoom.tenant ? `${utilityRoom.tenant.first_name} ${utilityRoom.tenant.last_name}` : 'ไม่มีผู้เช่า'
            const sections = [
              {
                key: 'electricity',
                tone: 'amber',
                title: 'ค่าไฟฟ้า',
                rate: unitPrice > 0 ? `฿${formatCurrency(unitPrice)} / หน่วย` : 'ยังไม่กำหนดราคาต่อหน่วย',
                icon: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
                isUnits: isUnitsMode,
                setMode: (mode) => setUtilityForm((prev) => ({ ...prev, electricity_mode: mode })),
                value: isUnitsMode ? utilityForm.electricity_units : utilityForm.electricity_amount,
                setValue: (value) => setUtilityForm((prev) => (isUnitsMode ? { ...prev, electricity_units: value } : { ...prev, electricity_amount: value })),
                amount: electricityAmount,
                warning: isUnitsMode && unitPrice <= 0 ? 'กรุณากำหนดราคาไฟต่อหน่วยก่อน หรือเลือก "ระบุยอดเงิน"' : '',
                inputId: 'utility-electricity-input',
              },
              {
                key: 'water',
                tone: 'sky',
                title: 'ค่าน้ำ',
                rate: waterUnitPrice > 0 ? `฿${formatCurrency(waterUnitPrice)} / หน่วย` : 'ยังไม่กำหนดราคาต่อหน่วย',
                icon: <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />,
                isUnits: isWaterUnitsMode,
                setMode: (mode) => setUtilityForm((prev) => ({ ...prev, water_mode: mode })),
                value: isWaterUnitsMode ? utilityForm.water_units : utilityForm.water_amount,
                setValue: (value) => setUtilityForm((prev) => (isWaterUnitsMode ? { ...prev, water_units: value } : { ...prev, water_amount: value })),
                amount: waterAmount,
                warning: isWaterUnitsMode && waterUnitPrice <= 0 ? 'กรุณากำหนดราคาน้ำต่อหน่วยก่อน หรือเลือก "ระบุยอดเงิน"' : '',
                inputId: 'utility-water-input',
              },
            ]
            return (
              <form
                className="staff-utility"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (canSubmit) handleSendUtilityBill()
                }}
              >
                <div className="staff-utility-hero">
                  <span className="staff-utility-room">
                    <small>ห้อง</small>
                    <strong>{utilityRoom.room_number}</strong>
                  </span>
                  <div className="staff-utility-hero-text">
                    <small>ผู้เช่า</small>
                    <strong>{tenantName}</strong>
                  </div>
                  <div className="staff-utility-rates">
                    <span className="is-amber">ไฟ {unitPrice > 0 ? `฿${formatCurrency(unitPrice)}` : '-'}/หน่วย</span>
                    <span className="is-sky">น้ำ {waterUnitPrice > 0 ? `฿${formatCurrency(waterUnitPrice)}` : '-'}/หน่วย</span>
                  </div>
                </div>

                <div className="staff-utility-grid">
                  {sections.map((section, index) => (
                    <section key={section.key} className={`staff-utility-card is-${section.tone}`}>
                      <div className="staff-utility-card-head">
                        <span className="staff-utility-card-icon" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            {section.icon}
                          </svg>
                        </span>
                        <div>
                          <strong>{section.title}</strong>
                          <small>{section.rate}</small>
                        </div>
                      </div>

                      <div className="staff-utility-switch" role="group" aria-label={`วิธีคิด${section.title}`}>
                        <button type="button" className={section.isUnits ? 'is-active' : ''} aria-pressed={section.isUnits} onClick={() => section.setMode('units')}>
                          ตามหน่วย
                        </button>
                        <button type="button" className={!section.isUnits ? 'is-active' : ''} aria-pressed={!section.isUnits} onClick={() => section.setMode('amount')}>
                          ระบุยอดเงิน
                        </button>
                      </div>

                      <label className="staff-utility-input" htmlFor={section.inputId}>
                        {!section.isUnits && <span className="staff-utility-input-prefix">฿</span>}
                        <input
                          id={section.inputId}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          className="no-spinner"
                          placeholder={section.isUnits ? 'จำนวนหน่วยที่ใช้' : 'ยอดเงิน'}
                          value={section.value}
                          autoFocus={index === 0}
                          onChange={(event) => section.setValue(event.target.value)}
                        />
                        <span className="staff-utility-input-suffix">{section.isUnits ? 'หน่วย' : 'บาท'}</span>
                      </label>

                      <div className="staff-utility-card-foot">
                        {section.warning ? (
                          <span className="staff-utility-warning">{section.warning}</span>
                        ) : (
                          <>
                            <span>{section.isUnits ? 'คิดเป็น' : 'ยอดที่จะเรียกเก็บ'}</span>
                            <strong>฿{formatCurrency(section.amount)}</strong>
                          </>
                        )}
                      </div>
                    </section>
                  ))}
                </div>

                <div className={`staff-utility-total${total > 0 ? ' has-total' : ''}`}>
                  <div className="staff-utility-total-lines">
                    <span>ค่าไฟฟ้า <strong>฿{formatCurrency(electricityAmount)}</strong></span>
                    <span>ค่าน้ำ <strong>฿{formatCurrency(waterAmount)}</strong></span>
                  </div>
                  <div className="staff-utility-total-sum">
                    <small>ยอดรวมที่จะส่งให้ผู้เช่า</small>
                    <strong>฿{formatCurrency(total)}</strong>
                  </div>
                </div>

                {utilityError && <p className="staff-form-error">{utilityError}</p>}
                <div className="staff-form-actions staff-utility-actions">
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                    ยกเลิก
                  </button>
                  <button type="submit" className="staff-action-btn is-primary" disabled={!canSubmit}>
                    {utilitySubmitting ? 'กำลังส่ง...' : total > 0 ? `ส่งบิล ฿${formatCurrency(total)}` : 'กรอกยอดก่อนส่งบิล'}
                  </button>
                </div>
              </form>
            )
          }}
        </Modal>
      )}

      {invoiceModal && (
        <Modal title="ออกใบแจ้งหนี้ประจำเดือน" onClose={() => setInvoiceModal(null)} variant="confirm">
          {(requestClose) => {
            const occupiedRooms = rooms
              .filter((room) => room.is_booked && room.tenant)
              .sort((a, b) => Number(a.room_number) - Number(b.room_number))
            const isSingle = invoiceModal.mode === 'single'
            const canPrint = !isSingle || Boolean(invoiceModal.roomNumber)
            return (
              <div className="staff-confirm-body">
                <p className="staff-confirm-message">เลือกรูปแบบการออกใบแจ้งหนี้</p>
                <div className="staff-choice-group" role="radiogroup" aria-label="รูปแบบการออกใบแจ้งหนี้">
                  <label className={`staff-choice${!isSingle ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="invoice-mode"
                      checked={!isSingle}
                      onChange={() => setInvoiceModal({ mode: 'all', roomNumber: '' })}
                    />
                    <span className="staff-choice-text">
                      <strong>รวมทุกห้อง</strong>
                      <small>ออกเป็นไฟล์เดียว ครบทุกห้องที่มีผู้เช่า ({occupiedRooms.length} ห้อง)</small>
                    </span>
                  </label>
                  <label className={`staff-choice${isSingle ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="invoice-mode"
                      checked={isSingle}
                      onChange={() => setInvoiceModal((current) => ({ ...current, mode: 'single' }))}
                    />
                    <span className="staff-choice-text">
                      <strong>ทีละห้อง</strong>
                      <small>เลือกห้องที่ต้องการออกใบแจ้งหนี้</small>
                    </span>
                  </label>
                </div>
                {isSingle && (
                  <select
                    className="staff-filter-select staff-choice-select"
                    value={invoiceModal.roomNumber}
                    onChange={(event) => setInvoiceModal((current) => ({ ...current, roomNumber: event.target.value }))}
                    aria-label="เลือกห้อง"
                  >
                    <option value="">เลือกห้อง</option>
                    {occupiedRooms.map((room) => (
                      <option key={room.room_number} value={room.room_number}>
                        ห้อง {room.room_number} — {room.tenant.first_name} {room.tenant.last_name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
                    disabled={!canPrint || occupiedRooms.length === 0}
                    onClick={() => {
                      const roomNumber = isSingle ? invoiceModal.roomNumber : null
                      requestClose()
                      handlePrintMonthlyInvoices(roomNumber)
                    }}
                  >
                    พิมพ์ / บันทึก PDF
                  </button>
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {maintenanceAcceptConfirm && (
        <Modal title="ยืนยันรับเรื่องแจ้งซ่อม" onClose={() => setMaintenanceAcceptConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-info">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันรับเรื่องคำขอแจ้งซ่อม</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{maintenanceAcceptConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {maintenanceAcceptConfirm.first_name} {maintenanceAcceptConfirm.last_name}
                  </strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ประเภท</span>
                  <strong>{MAINTENANCE_CATEGORY_LABEL[maintenanceAcceptConfirm.category] || 'อื่นๆ'}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ช่วงเวลาที่สะดวก</span>
                  <strong>{MAINTENANCE_TIME_LABEL[maintenanceAcceptConfirm.preferred_time] || 'เวลาไหนก็ได้'}</strong>
                </div>
                {maintenanceAcceptConfirm.contact_phone && (
                  <div className="staff-confirm-detail-row">
                    <span>เบอร์โทร</span>
                    <strong>{maintenanceAcceptConfirm.contact_phone}</strong>
                  </div>
                )}
                <div className="staff-confirm-detail-row">
                  <span>วันที่แจ้งซ่อม</span>
                  <strong>{formatDateTime(maintenanceAcceptConfirm.created_at)}</strong>
                </div>
                <div className="staff-confirm-detail-row is-note">
                  <span>รายละเอียดปัญหา</span>
                  <strong>{maintenanceAcceptConfirm.description || '-'}</strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `maintenance-${maintenanceAcceptConfirm.id}`}
                  onClick={handleConfirmMaintenanceAccept}
                >
                  {processingRequestKey === `maintenance-${maintenanceAcceptConfirm.id}`
                    ? 'กำลังดำเนินการ...'
                    : 'ยืนยันรับเรื่อง'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {maintenanceRejectConfirm && (
        <Modal title="ยืนยันการปฏิเสธแจ้งซ่อม" onClose={() => setMaintenanceRejectConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-warning">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 9v4M12 17h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันปฏิเสธคำขอแจ้งซ่อม</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{maintenanceRejectConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {maintenanceRejectConfirm.first_name} {maintenanceRejectConfirm.last_name}
                  </strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ประเภท</span>
                  <strong>{MAINTENANCE_CATEGORY_LABEL[maintenanceRejectConfirm.category] || 'อื่นๆ'}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ช่วงเวลาที่สะดวก</span>
                  <strong>{MAINTENANCE_TIME_LABEL[maintenanceRejectConfirm.preferred_time] || 'เวลาไหนก็ได้'}</strong>
                </div>
                {maintenanceRejectConfirm.contact_phone && (
                  <div className="staff-confirm-detail-row">
                    <span>เบอร์โทร</span>
                    <strong>{maintenanceRejectConfirm.contact_phone}</strong>
                  </div>
                )}
                <div className="staff-confirm-detail-row">
                  <span>สถานะ</span>
                  <strong>{MAINTENANCE_STATUS_LABEL[maintenanceRejectConfirm.status] || maintenanceRejectConfirm.status}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>วันที่แจ้งซ่อม</span>
                  <strong>{formatDateTime(maintenanceRejectConfirm.created_at)}</strong>
                </div>
                <div className="staff-confirm-detail-row is-note">
                  <span>รายละเอียดปัญหา</span>
                  <strong>{maintenanceRejectConfirm.description || '-'}</strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `maintenance-${maintenanceRejectConfirm.id}`}
                  onClick={handleConfirmMaintenanceReject}
                >
                  {processingRequestKey === `maintenance-${maintenanceRejectConfirm.id}`
                    ? 'กำลังดำเนินการ...'
                    : 'ยืนยันปฏิเสธ'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {maintenanceCompleteConfirm && (
        <Modal title="ยืนยันงานเสร็จสิ้น" onClose={() => setMaintenanceCompleteConfirm(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-success">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันว่างานซ่อมเสร็จสิ้นแล้ว</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{maintenanceCompleteConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {maintenanceCompleteConfirm.first_name} {maintenanceCompleteConfirm.last_name}
                  </strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `maintenance-${maintenanceCompleteConfirm.id}`}
                  onClick={handleConfirmMaintenanceComplete}
                >
                  {processingRequestKey === `maintenance-${maintenanceCompleteConfirm.id}`
                    ? 'กำลังดำเนินการ...'
                    : 'ยืนยันเสร็จสิ้น'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {tenantRequestDetail && (
        <TenantRequestDetailModal
          request={tenantRequestDetail}
          sourceRoom={rooms.find((room) => String(room.room_number) === String(tenantRequestDetail.room_number))}
          actions={renderTenantRequestActions(tenantRequestDetail)}
          onClose={() => setTenantRequestDetail(null)}
        />
      )}

      {maintenanceDetail && (
        <Modal title="รายละเอียดการแจ้งซ่อม" onClose={() => setMaintenanceDetail(null)} variant="transfer-detail">
          {() => (
            <div className="staff-transfer-body">
              <div className="staff-transfer-top">
                <div className="staff-req-detail-head">
                  <span className="staff-badge type-maintenance">แจ้งซ่อม</span>
                  <span className={`staff-badge status-${maintenanceDetail.status}`}>
                    {MAINTENANCE_STATUS_LABEL[maintenanceDetail.status] || maintenanceDetail.status}
                  </span>
                  <span className="staff-req-detail-date">
                    <WaitingDetailIcon type="clock" size={16} />
                    <span>
                      <small>แจ้งซ่อม</small>
                      <strong>{formatDateTime(maintenanceDetail.created_at)} น.</strong>
                    </span>
                  </span>
                </div>
                <div className="staff-req-detail-room is-summary">
                  <span className="staff-req-detail-room-icon"><DoorIcon size={22} /></span>
                  <div className="staff-req-detail-room-identity">
                    <small>ห้องที่แจ้งซ่อม</small>
                    <strong>{maintenanceDetail.room_number || '-'}</strong>
                  </div>
                  <div className="staff-req-detail-room-tenant">
                    <small>ผู้เช่า</small>
                    <span>{[maintenanceDetail.first_name, maintenanceDetail.last_name].filter(Boolean).join(' ') || '-'}</span>
                    {maintenanceDetail.contact_phone && (
                      <em className="staff-req-detail-room-phone">
                        <WaitingDetailIcon type="phone" size={13} />
                        {maintenanceDetail.contact_phone}
                      </em>
                    )}
                  </div>
                </div>
              </div>

              <div className="staff-transfer-scroll">
              <section className="staff-transfer-section">
                <h4 className="staff-transfer-section-title">ข้อมูลการแจ้งซ่อม</h4>
                <TenantRequestDetails
                  details={[
                    { key: 'category', icon: 'tool', label: 'หมวดหมู่', value: MAINTENANCE_CATEGORY_LABEL[maintenanceDetail.category] || 'อื่นๆ' },
                    { key: 'time', icon: 'clock', label: 'เวลาสะดวก', value: MAINTENANCE_TIME_LABEL[maintenanceDetail.preferred_time] || 'เวลาไหนก็ได้' },
                    { key: 'created', icon: 'calendar', label: 'วันที่แจ้ง', value: `${formatDateTime(maintenanceDetail.created_at)} น.` },
                  ]}
                />
                <div className="staff-req-note">
                  <span className="staff-req-note-label">รายละเอียดปัญหา</span>
                  <p className="is-full">{maintenanceDetail.description || '-'}</p>
                </div>
              </section>
              <section className="staff-transfer-section">
                <h4 className="staff-transfer-section-title">สถานะการแจ้งซ่อม</h4>
                <ProcessSteps
                  actorClassName="staff-actor"
                  startDate={maintenanceDetail.created_at}
                  endDate={['done', 'cancelled'].includes(maintenanceDetail.status) ? maintenanceDetail.completed_at : null}
                  waitingText={maintenanceDetail.status === 'pending' ? 'รอเจ้าหน้าที่รับเรื่อง' : 'กำลังดำเนินการซ่อม'}
                  steps={[
                    {
                      key: 'request',
                      label: 'แจ้งซ่อม',
                      by: [maintenanceDetail.first_name, maintenanceDetail.last_name].filter(Boolean).join(' '),
                      date: maintenanceDetail.created_at,
                      icon: 'note',
                    },
                    {
                      key: 'accept',
                      label: 'เจ้าหน้าที่รับเรื่อง',
                      by: maintenanceDetail.accepted_by_name,
                      date: maintenanceDetail.accepted_at,
                      icon: 'user',
                      pendingText: maintenanceDetail.status === 'cancelled' ? 'ไม่ได้รับเรื่อง' : 'กำลังรอดำเนินการ',
                    },
                    {
                      key: 'done',
                      label: maintenanceDetail.status === 'cancelled' ? 'ยกเลิกแล้ว' : maintenanceDetail.status === 'done' ? 'ซ่อมเสร็จสิ้น' : 'รอซ่อมเสร็จ',
                      by: maintenanceDetail.completed_by_name,
                      date: ['done', 'cancelled'].includes(maintenanceDetail.status) ? maintenanceDetail.completed_at : null,
                      icon: maintenanceDetail.status === 'cancelled' ? 'x' : 'tool',
                      tone: maintenanceDetail.status === 'cancelled' ? 'danger' : undefined,
                      pendingText: 'ยังไม่ถึงขั้นตอนนี้',
                    },
                  ]}
                />
              </section>
              {maintenanceDetail.photos?.length > 0 && (
                <section className="staff-transfer-section staff-maintenance-photos-section">
                  <h4 className="staff-transfer-section-title">รูปประกอบ ({maintenanceDetail.photos.length})</h4>
                  <div className="staff-maintenance-photos">
                    {maintenanceDetail.photos.map((photo, index) => (
                      <a
                        key={`${photo.name}-${index}`}
                        href={photo.url}
                        title="คลิกเพื่อดูตัวอย่างรูป"
                        onClick={(event) => {
                          event.preventDefault()
                          setMaintenancePhotoPreview({ index })
                        }}
                      >
                        <UploadImage src={photo.url} alt={`รูปแจ้งซ่อมห้อง ${maintenanceDetail.room_number} ${index + 1}`} />
                        <span className="staff-maintenance-photo-caption">
                          <span>{photo.name || `รูปที่ ${index + 1}`}</span>
                          <small>รูปที่ {index + 1}</small>
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              )}
              </div>

              {['pending', 'in_progress'].includes(maintenanceDetail.status) && (
                <div className="staff-transfer-footer">
                  <div className="staff-form-actions">
                    <button
                      type="button"
                      className="staff-action-btn is-danger-outline"
                      disabled={processingRequestKey === `maintenance-${maintenanceDetail.id}`}
                      onClick={() => {
                        setMaintenanceRejectConfirm(maintenanceDetail)
                        setMaintenanceDetail(null)
                      }}
                    >
                      ปฏิเสธ
                    </button>
                    <button
                      type="button"
                      className="staff-action-btn is-primary"
                      disabled={processingRequestKey === `maintenance-${maintenanceDetail.id}`}
                      onClick={() => {
                        if (maintenanceDetail.status === 'pending') setMaintenanceAcceptConfirm(maintenanceDetail)
                        else setMaintenanceCompleteConfirm(maintenanceDetail)
                        setMaintenanceDetail(null)
                      }}
                    >
                      {maintenanceDetail.status === 'pending' ? 'รับเรื่อง' : 'เสร็จสิ้น'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {maintenanceDetail && maintenancePhotoPreview && (
        <PhotoLightbox
          photos={(maintenanceDetail.photos || []).map((photo, index) => ({
            name: photo.name || `รูปที่ ${index + 1}`,
            url: photo.url,
          }))}
          initialIndex={maintenancePhotoPreview.index}
          title={`รูปแจ้งซ่อมห้อง ${maintenanceDetail.room_number}`}
          subtitle={`${maintenanceDetail.first_name} ${maintenanceDetail.last_name}`}
          label="รูปแจ้งซ่อม"
          onClose={() => setMaintenancePhotoPreview(null)}
        />
      )}

      {parcelFormOpen && (
        <Modal title="บันทึกพัสดุใหม่" onClose={() => setParcelFormOpen(false)}>
          {(requestClose) => (
          <form className="staff-sec-form" onSubmit={requestParcelSave}>
            <section className="staff-sec">
              <header>
                <span className="staff-sec-icon"><DoorIcon /></span>
                <div>
                  <strong>ผู้รับพัสดุ <span className="text-danger">*</span></strong>
                  <small>เลือกห้องที่มีผู้เช่าอยู่ ระบบจะแจ้งเตือนผู้เช่าห้องนั้น</small>
                </div>
              </header>
              <label className="staff-sec-field" htmlFor="staff-parcel-room">
                <span>ห้อง / ผู้เช่า</span>
                <div className="staff-sec-input">
                  <i><DoorIcon /></i>
                  <select
                    id="staff-parcel-room"
                    className="form-select form-control"
                    required
                    value={parcelForm.room_number}
                    onChange={(event) => setParcelForm((prev) => ({ ...prev, room_number: event.target.value }))}
                  >
                    <option value="">เลือกห้องที่มีผู้เช่า</option>
                    {rooms
                      .filter((room) => room.is_booked && room.tenant)
                      .map((room) => (
                        <option key={room.room_number} value={room.room_number}>
                          ห้อง {room.room_number} · {room.tenant.first_name} {room.tenant.last_name}
                        </option>
                      ))}
                  </select>
                </div>
              </label>
            </section>

            <section className="staff-sec">
              <header>
                <span className="staff-sec-icon"><PackageIcon /></span>
                <div>
                  <strong>ข้อมูลพัสดุ</strong>
                  <small>ไม่บังคับ แต่ช่วยให้ผู้เช่าระบุพัสดุได้ง่ายขึ้น</small>
                </div>
              </header>
              <div className="staff-sec-grid">
                <label className="staff-sec-field" htmlFor="staff-parcel-sender">
                  <span>บริษัทขนส่ง / ผู้ส่ง</span>
                  <div className="staff-sec-input">
                    <i><TruckIcon /></i>
                    <input
                      id="staff-parcel-sender"
                      className="form-control"
                      type="text"
                      maxLength={100}
                      placeholder="เช่น ไปรษณีย์ไทย, Kerry"
                      value={parcelForm.sender_name}
                      onChange={(event) => setParcelForm((prev) => ({ ...prev, sender_name: event.target.value }))}
                    />
                  </div>
                </label>
                <label className="staff-sec-field" htmlFor="staff-parcel-tracking">
                  <span>เลขพัสดุ</span>
                  <div className="staff-sec-input">
                    <i><HashIcon /></i>
                    <input
                      id="staff-parcel-tracking"
                      className="form-control"
                      type="text"
                      maxLength={100}
                      placeholder="เช่น TH1234567890"
                      value={parcelForm.tracking_number}
                      onChange={(event) => setParcelForm((prev) => ({ ...prev, tracking_number: event.target.value }))}
                    />
                  </div>
                </label>
              </div>
              <label className="staff-sec-field" htmlFor="staff-parcel-description">
                <span>รายละเอียด</span>
                <div className="staff-sec-input">
                  <i><NoteIcon /></i>
                  <input
                    id="staff-parcel-description"
                    className="form-control"
                    type="text"
                    maxLength={255}
                    placeholder="เช่น กล่องขนาดใหญ่"
                    value={parcelForm.description}
                    onChange={(event) => setParcelForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </div>
              </label>
            </section>

            <section className="staff-sec">
              <div className="parcel-photo-section">
                <ParcelPhotoPicker
                  id="staff-parcel-photos"
                  required
                  files={parcelPhotos}
                  onChange={setParcelPhotos}
                  error={parcelPhotoError}
                  onError={setParcelPhotoError}
                />
              </div>
            </section>

            {parcelFormError && <div className="parcel-form-error" role="alert">{parcelFormError}</div>}
            <div className="staff-sec-actions">
              <button type="button" className="staff-action-btn is-ghost" onClick={requestClose} disabled={parcelSubmitting}>
                ยกเลิก
              </button>
              <button
                type="submit"
                className="staff-action-btn is-primary"
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
              <div className="staff-confirm-body">
                <div className="staff-confirm-icon is-money">
                  <PackageIcon size={28} strokeWidth={2.2} />
                </div>
                <p className="staff-confirm-message">บันทึกพัสดุนี้และแจ้งผู้เช่าใช่หรือไม่?</p>
                <div className="staff-confirm-details">
                  <div className="staff-confirm-detail-row">
                    <span>ห้อง</span>
                    <strong>{parcelForm.room_number}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>ผู้เช่า</span>
                    <strong>{room?.tenant ? `${room.tenant.first_name} ${room.tenant.last_name}` : '-'}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>ผู้ส่ง</span>
                    <strong>{parcelForm.sender_name.trim() || 'พัสดุทั่วไป'}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>เลขพัสดุ</span>
                    <strong>{parcelForm.tracking_number.trim() || '-'}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>รูปที่แนบ</span>
                    <strong>{parcelPhotos.length} รูป</strong>
                  </div>
                </div>
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose} disabled={parcelSubmitting}>
                    ยกเลิก
                  </button>
                  <button type="button" className="staff-action-btn is-primary" onClick={() => handleCreateParcel(requestClose)} disabled={parcelSubmitting}>
                    {parcelSubmitting ? 'กำลังบันทึก...' : 'ยืนยันบันทึก'}
                  </button>
                </div>
              </div>
            )
          }}
        </Modal>
      )}

      {parcelDetail && (
        <ParcelDetailModal
          parcel={parcelDetail}
          onPreviewPhoto={(index) => setParcelPhotoPreview({ ...parcelDetail, startIndex: index })}
          onClose={() => setParcelDetail(null)}
        />
      )}

      {parcelPhotoPreview && (
        <PhotoLightbox
          photos={(parcelPhotoPreview.photos || []).map((photo, index) => ({
            name: photo.name || `รูปที่ ${index + 1}`,
            url: photo.url,
          }))}
          initialIndex={parcelPhotoPreview.startIndex || 0}
          title={`พัสดุห้อง ${parcelPhotoPreview.room_number}`}
          subtitle={`${parcelPhotoPreview.first_name || ''} ${parcelPhotoPreview.last_name || ''}`.trim()}
          label="รูปพัสดุ"
          onClose={() => setParcelPhotoPreview(null)}
        />
      )}

      {moveoutConfirmRequest && (
        <Modal title="ยืนยันการย้ายออก" onClose={() => setMoveoutConfirmRequest(null)} variant="confirm">
          {(requestClose) => (
            <div className="staff-confirm-body is-moveout-confirm">
              <div className="staff-confirm-icon is-warning">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
              </div>
              <p className="staff-confirm-message">
                อนุมัติย้ายออกห้อง {moveoutConfirmRequest.room_number}
                <small className="staff-moveout-confirm-sub">
                  {moveoutConfirmRequest.first_name} {moveoutConfirmRequest.last_name}
                  {moveoutConfirmRequest.phone ? ` · ${moveoutConfirmRequest.phone}` : ''}
                </small>
              </p>
              {(() => {
                const request = moveoutConfirmRequest
                const balanceItems = request.outstanding?.items ?? []
                const outstanding = Number(request.outstanding?.amount) || 0
                const deposit = Number(request.deposit_amount) || 0
                const depositPaid = request.deposit_paid == null ? deposit : Math.min(deposit, Number(request.deposit_paid) || 0)
                const contractEnd = request.source_rental_end_date
                const endDay = contractEnd ? new Date(contractEnd) : null
                if (endDay) endDay.setHours(0, 0, 0, 0)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const daysEarly = endDay ? Math.ceil((endDay - today) / 86400000) : null
                const leavesEarly = daysEarly !== null && daysEarly > 0
                return (
                  <>
                    <div className="staff-confirm-details">
                      <div className="staff-confirm-detail-row">
                        <span>ต้องการย้ายออก</span>
                        <strong>{request.preferred_move_date ? formatDateOnly(request.preferred_move_date) : 'ไม่ระบุ'}</strong>
                      </div>
                      <div className="staff-confirm-detail-row">
                        <span>สิ้นสุดสัญญา</span>
                        <strong>
                          {formatDate(contractEnd)}
                          {leavesEarly && <em className="staff-moveout-confirm-tag is-danger">ก่อนครบ {daysEarly} วัน</em>}
                        </strong>
                      </div>
                      <div className="staff-confirm-detail-row">
                        <span>ตรวจสภาพห้อง</span>
                        <strong className={request.inspection_id ? 'is-success' : 'is-danger'}>
                          {request.inspection_id ? '✓ ตรวจแล้ว' : '✕ ยังไม่ได้ตรวจ'}
                        </strong>
                      </div>
                      <div className="staff-confirm-detail-row">
                        <span>ยอดค้างชำระ</span>
                        <strong className={balanceItems.length ? 'is-danger' : 'is-success'}>
                          {outstanding > 0 ? `฿${formatCurrency(outstanding)}` : balanceItems.length ? 'มีสลิปรอตรวจ' : '✓ ไม่มี'}
                        </strong>
                      </div>
                      <div className="staff-confirm-detail-row">
                        <span>เงินมัดจำ</span>
                        <strong className={depositPaid > 0 ? (leavesEarly ? 'is-danger' : 'is-success') : ''}>
                          {depositPaid > 0
                            ? `฿${formatCurrency(depositPaid)} · ${leavesEarly ? 'ริบ' : 'คืนให้ผู้เช่า'}`
                            : deposit > 0 ? 'ยังไม่ได้ชำระ · ไม่มียอดต้องคืน' : 'ไม่มี'}
                        </strong>
                      </div>
                    </div>
                    <div className="staff-moveout-confirm-effects">
                      <strong>เมื่อกดยืนยันจะเกิดขึ้นทันที</strong>
                      <ul>
                        <li>ห้อง {request.room_number} กลับเป็นห้องว่าง พร้อมให้เช่าต่อ</li>
                        <li>สัญญาของผู้เช่าเปลี่ยนเป็น "สัญญาเก่า"</li>
                        <li>บัญชีผู้เช่าถูกระงับ เข้าสู่ระบบไม่ได้จนกว่าจะลงทะเบียนเช่าใหม่</li>
                        <li>คำขอ แจ้งซ่อม คำขอรถ และพัสดุที่ค้างอยู่จะถูกยกเลิก</li>
                      </ul>
                      {depositPaid > 0 && (
                        <p>ขั้นต่อไป: บันทึก{leavesEarly ? 'การริบ' : 'การคืน'}เงินมัดจำที่เมนู "สัญญาที่เสร็จสมบูรณ์"</p>
                      )}
                    </div>
                    {balanceItems.length > 0 && (
                      <div className="staff-confirm-warning">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 9v4M12 17h.01" />
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                        <p>ยังอนุมัติไม่ได้ ต้องเก็บเงิน {balanceItems.map((item) => item.label).join(', ')} ให้ครบก่อน</p>
                      </div>
                    )}
                  </>
                )
              })()}
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={
                    processingRequestKey === `tenant-${moveoutConfirmRequest.id}`
                    || (moveoutConfirmRequest.outstanding?.items?.length ?? 0) > 0
                  }
                  onClick={handleConfirmMoveoutApproval}
                >
                  {processingRequestKey === `tenant-${moveoutConfirmRequest.id}`
                    ? 'กำลังดำเนินการ...'
                    : 'ยืนยันอนุมัติ'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {renewApproveConfirm?.type === 'move_room' && (
        <MoveRoomApprovalModal
          request={renewApproveConfirm}
          error={requestsError}
          processing={processingRequestKey === `tenant-${renewApproveConfirm.id}`}
          onConfirm={handleConfirmRenewApproval}
          onSendCharge={handleSendTransferCharge}
          onClose={() => setRenewApproveConfirm(null)}
        />
      )}

      {renewApproveConfirm && renewApproveConfirm.type !== 'move_room' && (
        <Modal
          title="ยืนยันการอนุมัติต่อสัญญา"
          onClose={() => setRenewApproveConfirm(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-success">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันอนุมัติคำขอต่อสัญญา</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{renewApproveConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {renewApproveConfirm.first_name} {renewApproveConfirm.last_name}
                  </strong>
                </div>
                {renewApproveConfirm.type === 'renew' && (
                  <>
                    <div className="staff-confirm-detail-row">
                      <span>ระยะเวลา</span>
                      <strong>
                        {RENEW_DURATION_LABEL[renewApproveConfirm.renew_duration_months] ||
                          `${renewApproveConfirm.renew_duration_months} เดือน`}
                      </strong>
                    </div>
                    <div className="staff-confirm-detail-row">
                      <span>รูปแบบการชำระ</span>
                      <strong>
                        {RENEW_PAYMENT_TYPE_LABEL[renewApproveConfirm.renew_payment_type] ||
                          renewApproveConfirm.renew_payment_type}
                      </strong>
                    </div>
                  </>
                )}
                {renewApproveConfirm.phone && (
                  <div className="staff-confirm-detail-row">
                    <span>เบอร์โทร</span>
                    <strong>{renewApproveConfirm.phone}</strong>
                  </div>
                )}
                <div className="staff-confirm-detail-row">
                  <span>วันที่ส่งคำขอ</span>
                  <strong>{formatDateTime(renewApproveConfirm.created_at)}</strong>
                </div>
                <div className="staff-confirm-detail-row is-note">
                  <span>หมายเหตุ</span>
                  <strong>{renewApproveConfirm.note || '-'}</strong>
                </div>
              </div>
              {renewOutstandingAmount > 0 && (
                <div className="staff-renew-outstanding" role="alert">
                  <strong>มียอดค้างชำระ ฿{formatCurrency(renewOutstandingAmount)} · ต้องชำระก่อนอนุมัติต่อสัญญา</strong>
                  <ul>
                    {renewApproveConfirm.outstanding.items.map((item, index) => (
                      <li key={`${item.type}-${index}`}>
                        <span>{item.label}{item.status === 'overdue' ? ' (เกินกำหนด)' : ''}</span>
                        <b>฿{formatCurrency(item.amount)}</b>
                      </li>
                    ))}
                  </ul>
                  <small>ให้ผู้เช่าชำระผ่านระบบ หรือกดเก็บเงินสดด้านล่าง แล้วกลับมาอนุมัติอีกครั้ง</small>
                </div>
              )}
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
                {renewOutstandingAmount > 0 ? (
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
                    disabled={!renewOutstandingRoom}
                    onClick={() => {
                      setRenewApproveConfirm(null)
                      openCollect(renewOutstandingRoom)
                    }}
                  >
                    เก็บเงินสดยอดค้าง
                  </button>
                ) : (
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
                    disabled={processingRequestKey === `tenant-${renewApproveConfirm.id}`}
                    onClick={handleConfirmRenewApproval}
                  >
                    {processingRequestKey === `tenant-${renewApproveConfirm.id}` ? 'กำลังดำเนินการ...' : 'ยืนยันอนุมัติ'}
                  </button>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {moveoutAcknowledgeConfirm && (
        <MoveoutAcknowledgeModal
          request={moveoutAcknowledgeConfirm}
          room={rooms.find((item) => String(item.room_number) === String(moveoutAcknowledgeConfirm.room_number))}
          error={requestsError}
          processing={processingRequestKey === `tenant-${moveoutAcknowledgeConfirm.id}`}
          onConfirm={handleConfirmMoveoutAcknowledge}
          onClose={() => setMoveoutAcknowledgeConfirm(null)}
        />
      )}

      {tenantRejectConfirm && (
        <TenantRejectModal
          request={tenantRejectConfirm}
          error={requestsError}
          processing={processingRequestKey === `tenant-${tenantRejectConfirm.id}`}
          onConfirm={handleConfirmTenantReject}
          onClose={() => setTenantRejectConfirm(null)}
        />
      )}
    </div>
  )
}

export default StaffMain
