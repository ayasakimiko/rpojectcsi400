import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/StaffPage.css'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import DateDropdowns from '../components/DateDropdowns.jsx'

const MOVE_OUT_CHECKLIST = [
  { key: 'walls', label: 'ผนังและสี' },
  { key: 'floor', label: 'พื้น' },
  { key: 'ceiling', label: 'เพดานและไฟ' },
  { key: 'doors', label: 'ประตูและกุญแจ' },
  { key: 'windows', label: 'หน้าต่าง' },
  { key: 'electrical', label: 'ปลั๊กและสวิตช์ไฟ' },
  { key: 'bathroom', label: 'ห้องน้ำและสุขภัณฑ์' },
  { key: 'furniture', label: 'เฟอร์นิเจอร์และอุปกรณ์' },
]

const CHECKLIST_RESULT_OPTIONS = [
  { key: 'good', label: 'ปกติ', title: 'ปกติ' },
  { key: 'damaged', label: 'ชำรุด', title: 'ชำรุด' },
  { key: 'not_applicable', label: 'ไม่เกี่ยวข้อง', title: 'ไม่มี / ไม่เกี่ยวข้อง' },
]
const INSPECTION_MAX_PHOTOS = 15
const INSPECTION_MAX_PHOTO_BYTES = 15 * 1024 * 1024

function formatPhotoSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
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
        [room.room_number, room.tenant.first_name, room.tenant.last_name, room.tenant.phone]
          .join(' ')
          .toLowerCase()
          .includes(keyword),
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
              {selected.tenant.first_name?.[0] || '?'}
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

function InspectionPhotoPicker({ files, existing = [], onRemoveExisting, onChange, onError }) {
  const [dragging, setDragging] = useState(false)
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])

  useEffect(
    () => () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url))
    },
    [previewUrls],
  )

  const addFiles = (incoming) => {
    const list = Array.from(incoming || [])
    if (list.length === 0) return
    const images = list.filter((file) => file.type.startsWith('image/'))
    const withinSize = images.filter((file) => file.size <= INSPECTION_MAX_PHOTO_BYTES)
    const room = INSPECTION_MAX_PHOTOS - existing.length - files.length
    const accepted = withinSize.slice(0, Math.max(0, room))
    if (images.length < list.length) onError('เลือกได้เฉพาะไฟล์รูปภาพ')
    else if (withinSize.length < images.length) onError('รูปภาพต้องมีขนาดไม่เกิน 15 MB ต่อรูป')
    else if (accepted.length < withinSize.length) onError(`แนบรูปได้ไม่เกิน ${INSPECTION_MAX_PHOTOS} รูป`)
    else onError('')
    if (accepted.length > 0) onChange([...files, ...accepted])
  }

  const dragsFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
  const canAddMore = existing.length + files.length < INSPECTION_MAX_PHOTOS

  return (
    <div
      className={`photo-field${dragging ? ' is-dragging' : ''}`}
      onDragEnter={(event) => {
        if (!dragsFiles(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!dragsFiles(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        addFiles(event.dataTransfer?.files)
      }}
    >
      <input
        id="inspection-photos"
        className="photo-input"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />
      {existing.length + files.length === 0 ? (
        <label htmlFor="inspection-photos" className="photo-dropzone">
          <span className="photo-dropzone-icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </span>
          <span className="photo-dropzone-text">
            <span className="photo-dropzone-title">
              {dragging ? 'ปล่อยรูปที่นี่' : 'ลากรูปมาวางที่นี่ หรือ '}
              {!dragging && <span className="photo-dropzone-link">คลิกเพื่อเลือกรูป</span>}
            </span>
            <span className="photo-dropzone-hint">สูงสุด {INSPECTION_MAX_PHOTOS} รูป ระบบจะย่อขนาดก่อนบันทึก</span>
          </span>
        </label>
      ) : (
        <div className="photo-grid">
          {existing.map((photo, index) => (
            <figure className="photo-tile" key={`saved-${photo.url}`}>
              <img src={photo.url} alt={`รูปที่บันทึกไว้ ${index + 1}`} />
              <figcaption title={photo.name}>
                <span>{photo.name}</span>
                <small>บันทึกไว้แล้ว</small>
              </figcaption>
              <button
                type="button"
                className="photo-tile-remove"
                aria-label={`ลบรูป ${photo.name}`}
                onClick={() => onRemoveExisting?.(photo.url)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </figure>
          ))}
          {files.map((file, index) => (
            <figure className="photo-tile" key={`${file.name}-${index}`}>
              <img src={previewUrls[index]} alt={`รูปที่แนบ ${index + 1}`} />
              <figcaption title={file.name}>
                <span>{file.name}</span>
                <small>{formatPhotoSize(file.size)}</small>
              </figcaption>
              <button
                type="button"
                className="photo-tile-remove"
                aria-label={`ลบรูป ${file.name}`}
                onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </figure>
          ))}
          {canAddMore && (
            <label htmlFor="inspection-photos" className="photo-add-tile">
              <span aria-hidden="true">+</span>
              <small>{dragging ? 'ปล่อยเพื่อเพิ่ม' : 'เพิ่มรูป'}</small>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

function compressImageFile(file) {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('เลือกได้เฉพาะไฟล์รูปภาพ'))
  if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error('รูปภาพต้องมีขนาดไม่เกิน 15 MB'))

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

function buildAnnouncementNotif(item) {
  return {
    key: `announcement-${item.id}`,
    title: item.title,
    label: item.tone === 'warning' ? 'ประกาศแจ้งเตือนจากหอพัก' : 'ประกาศจากหอพัก',
    tone: item.tone === 'warning' ? 'pending' : 'info',
    date: item.created_at,
    details: [
      { label: 'รายละเอียด', value: item.message },
      { label: 'ประกาศโดย', value: item.author || 'เจ้าหน้าที่' },
      { label: 'ลบอัตโนมัติ', value: item.expires_at ? `${formatDateTime(item.expires_at)} น.` : 'ไม่กำหนด' },
    ],
    kind: 'announcement',
  }
}

function Modal({ title, onClose, children, variant }) {
  const [isClosing, setIsClosing] = useState(false)

  const requestClose = () => setIsClosing(true)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div
      className={`staff-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`staff-modal${variant === 'confirm' ? ' staff-modal-confirm' : ''}${variant === 'wide' ? ' staff-modal-wide' : ''}${variant === 'form' ? ' staff-modal-form' : ''}${variant === 'inspection' ? ' staff-modal-inspection' : ''}${isClosing ? ' is-closing' : ''}`}
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
        <div className="staff-modal-body">{typeof children === 'function' ? children(requestClose) : children}</div>
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
}

const TENANT_REQUEST_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'รับเรื่องแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธแล้ว',
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

const MAINTENANCE_CATEGORY_LABEL = {
  electrical: 'ไฟฟ้า',
  plumbing: 'ประปา',
  aircon: 'เครื่องปรับอากาศ',
  furniture: 'เฟอร์นิเจอร์ / สิ่งอำนวยความสะดวก',
  other: 'อื่นๆ',
}

const MAINTENANCE_TIME_LABEL = {
  anytime: 'เวลาไหนก็ได้',
  morning: 'ช่วงเช้า (08:00-12:00)',
  afternoon: 'ช่วงบ่าย (12:00-16:00)',
  evening: 'ช่วงเย็น (16:00-19:00)',
}

const MAINTENANCE_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
}

const STAFF_TABS = [
  { key: 'home', label: 'หน้าแรก' },
  { key: 'payment-review', label: 'สลิปรอตรวจสอบ' },
  { key: 'announcements', label: 'ประกาศจากหอพัก' },
  { key: 'waiting-list', label: 'รายชื่อคนรอห้องว่าง' },
  { key: 'move-out-inspections', label: 'ตรวจห้องตอนย้ายออก' },
]

const ROOM_PREFERENCE_CHIPS = ['ห้องแอร์', 'มี Wi-Fi', 'มีตู้เย็น', 'เตียงเดี่ยว', 'เตียงคู่']
const WAITING_PHONE_PATTERN = /^[0-9+\-\s]{9,20}$/

const REQUEST_PREVIEW_COUNT = 3
const ROOMS_PER_PAGE = 5
const STAFF_LIST_PAGE_SIZE = 10
const MODAL_ITEMS_PER_PAGE = 10
const NOTIF_PAGE_SIZE = 6
const PAYMENT_HISTORY_PAGE_SIZE = 5

const STAFF_TENANT_NOTIF_INFO = {
  pending: { label: 'คำขอใหม่ รอดำเนินการ', tone: 'pending' },
  in_progress: { label: 'รับเรื่องแล้ว รอดำเนินการขั้นต่อไป', tone: 'info' },
}

const STAFF_MAINTENANCE_NOTIF_INFO = {
  pending: { label: 'แจ้งซ่อมใหม่ รอดำเนินการ', tone: 'pending' },
  in_progress: { label: 'กำลังดำเนินการซ่อม', tone: 'info' },
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
  deposit: 'เงินประกัน',
  water: 'ค่าน้ำ',
  electricity: 'ค่าไฟฟ้า',
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
  return [
    {
      key: `tenant-${request.id}-${request.status}`,
      title: TENANT_REQUEST_TYPE_LABEL[request.type] || request.type,
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

function getStaffRequestTimeline(kind, request) {
  if (!request) return []
  const steps = [{ label: kind === 'maintenance' ? 'แจ้งซ่อม' : 'ส่งคำขอ', date: request.created_at }]
  if (request.accepted_at) {
    steps.push({ label: 'รับเรื่อง', date: request.accepted_at })
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
                <p className="staff-request-log-label">{step.label}</p>
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

const SUMMARY_ICON_PATHS = {
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

const PAYMENT_REVIEW_LABEL = { rent: 'ค่าเช่า', water: 'ค่าน้ำ', electricity: 'ค่าไฟ' }

function StaffPagination({ page, total, onChange }) {
  if (total <= STAFF_LIST_PAGE_SIZE) return null
  const totalPages = Math.ceil(total / STAFF_LIST_PAGE_SIZE)
  const current = Math.min(page, totalPages)
  return (
    <div className="staff-pagination">
      <span className="staff-pagination-info">
        แสดง {(current - 1) * STAFF_LIST_PAGE_SIZE + 1}-{Math.min(current * STAFF_LIST_PAGE_SIZE, total)} จาก {total}{' '}
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

function StaffPaymentReview({ onCountChange }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null) 
  const [confirmReview, setConfirmReview] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewClosing, setPreviewClosing] = useState(false)
  const [page, setPage] = useState(1)

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

  const showError = (message) => {
    setError(message)
    setNotice({ type: 'error', message })
  }

  const loadPayments = () => {
    setLoading(true)
    return axios
      .get('/api/staff/payment-verifications', { headers: authHeaders() })
      .then(({ data }) => {
        setPayments(data.payments || [])
        onCountChange?.((data.payments || []).length)
        setError('')
      })
      .catch((err) => showError(err.response?.data?.message || 'โหลดสลิปรอตรวจไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    axios
      .get('/api/staff/payment-verifications', {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      .then(({ data }) => {
        if (!cancelled) {
          setPayments(data.payments || [])
          onCountChange?.((data.payments || []).length)
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) showError(err.response?.data?.message || 'โหลดสลิปรอตรวจไม่สำเร็จ')
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
      if (event.key === 'Escape' && !confirmReview) setPreviewClosing(true)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [preview, confirmReview])

  const currentPage = Math.min(page, Math.max(1, Math.ceil(payments.length / STAFF_LIST_PAGE_SIZE)))
  const pagePayments = payments.slice((currentPage - 1) * STAFF_LIST_PAGE_SIZE, currentPage * STAFF_LIST_PAGE_SIZE)

  const openSlip = (payment) => {
    setError('')
    setPreviewClosing(false)
    setPreview({ payment, url: payment.slip_path })
  }

  const closeSlip = () => setPreviewClosing(true)

  const requestReview = (payment, decision) => setConfirmReview({ payment, decision })

  const submitReview = async (requestClose) => {
    const { payment, decision } = confirmReview
    setBusyId(payment.id)
    try {
      const { data } = await axios.patch(
        `/api/staff/payment-verifications/${payment.id}`,
        { decision },
        { headers: authHeaders() },
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
    <section className="staff-card payment-review-card">
      <div className="staff-card-header">
        <h2>
          สลิปรอตรวจสอบ{' '}
          <span className="staff-count-pill">{error && payments.length === 0 ? '—' : payments.length}</span>
        </h2>
        <button type="button" className="staff-action-btn is-ghost" onClick={loadPayments} disabled={loading}>
          รีเฟรช
        </button>
      </div>
      <p className="payment-review-note">อนุมัติแล้วจึงเปลี่ยนสถานะรายการชำระเป็น “ชำระแล้ว”</p>
      {loading && payments.length === 0 ? (
        <p className="staff-empty">กำลังโหลดรายการ...</p>
      ) : payments.length === 0 && error ? (
        <p className="staff-empty">โหลดรายการไม่สำเร็จ กดรีเฟรชเพื่อลองใหม่</p>
      ) : payments.length === 0 ? (
        <p className="staff-empty">ไม่มีสลิปรอตรวจสอบ</p>
      ) : (
        <div className="table-responsive">
          <table className="staff-table">
            <thead>
              <tr>
                <th>ห้อง</th>
                <th>ผู้เช่า</th>
                <th>รายการ</th>
                <th>ยอดรวม</th>
                <th>วันที่ส่ง</th>
                <th>ตรวจ</th>
              </tr>
            </thead>
            <tbody>
              {pagePayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.room_number}</td>
                  <td>
                    {payment.first_name} {payment.last_name}
                    <small>{payment.phone}</small>
                  </td>
                  <td>
                    {String(payment.payment_types || '')
                      .split(',')
                      .map((type) => PAYMENT_REVIEW_LABEL[type] || type)
                      .join(', ')}
                  </td>
                  <td>
                    ฿
                    {Number(payment.amount).toLocaleString('th-TH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td>{new Date(payment.payment_date).toLocaleDateString('th-TH')}</td>
                  <td>
                    <div className="payment-review-actions">
                      <button type="button" className="staff-action-btn is-ghost" onClick={() => openSlip(payment)}>
                        ดูสลิป
                      </button>
                      <button
                        type="button"
                        className="staff-action-btn is-primary"
                        disabled={busyId === payment.id}
                        onClick={() => requestReview(payment, 'approved')}
                      >
                        อนุมัติ
                      </button>
                      <button
                        type="button"
                        className="staff-action-btn is-danger"
                        disabled={busyId === payment.id}
                        onClick={() => requestReview(payment, 'rejected')}
                      >
                        ปฏิเสธ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <StaffPagination page={currentPage} total={payments.length} onChange={setPage} />
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
                <button
                  type="button"
                  className="staff-action-btn is-ghost"
                  disabled={busyId === confirmReview.payment.id}
                  onClick={requestClose}
                >
                  ยกเลิก
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
              <p className="staff-confirm-message">{notice.message}</p>
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
                <a href={preview.url} target="_blank" rel="noreferrer" title="คลิกเพื่อดูรูปขนาดเต็ม">
                  <img src={preview.url} alt={`สลิปชำระเงินห้อง ${preview.payment.room_number}`} />
                </a>
                <span className="payment-slip-image-hint">คลิกที่รูปเพื่อดูขนาดเต็ม</span>
              </div>

              <dl className="payment-slip-details">
                <div className="payment-slip-amount">
                  <dt>ยอดรวม</dt>
                  <dd>
                    ฿
                    {Number(preview.payment.amount).toLocaleString('th-TH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>ผู้เช่า</dt>
                  <dd>
                    {preview.payment.first_name} {preview.payment.last_name}
                  </dd>
                </div>
                <div>
                  <dt>เบอร์โทร</dt>
                  <dd>{preview.payment.phone || '-'}</dd>
                </div>
                <div>
                  <dt>รายการ</dt>
                  <dd>
                    {String(preview.payment.payment_types || '')
                      .split(',')
                      .map((type) => PAYMENT_REVIEW_LABEL[type] || type)
                      .join(', ')}
                  </dd>
                </div>
                <div>
                  <dt>วันที่ส่ง</dt>
                  <dd>
                    {new Date(preview.payment.payment_date).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </dd>
                </div>
              </dl>
            </div>

            <footer className="payment-slip-footer">
              <button
                type="button"
                className="staff-action-btn is-primary"
                disabled={busyId === preview.payment.id || previewClosing}
                onClick={() => requestReview(preview.payment, 'approved')}
              >
                อนุมัติ
              </button>
              <button
                type="button"
                className="staff-action-btn is-danger"
                disabled={busyId === preview.payment.id || previewClosing}
                onClick={() => requestReview(preview.payment, 'rejected')}
              >
                ปฏิเสธ
              </button>
              <button type="button" className="staff-action-btn is-ghost" onClick={closeSlip}>
                ปิด
              </button>
            </footer>
          </section>
        </div>
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
  const [waitingListModalOpen, setWaitingListModalOpen] = useState(false)
  const [waitingListEditing, setWaitingListEditing] = useState(null)
  const [waitingListForm, setWaitingListForm] = useState({ full_name: '', phone: '', room_preference: '', note: '' })
  const [waitingListError, setWaitingListError] = useState('')
  const [waitingListFieldErrors, setWaitingListFieldErrors] = useState({})
  const [waitingListSubmitting, setWaitingListSubmitting] = useState(false)
  const [waitingListPage, setWaitingListPage] = useState(1)
  const [inspectionsPage, setInspectionsPage] = useState(1)
  const [waitingListDelete, setWaitingListDelete] = useState(null)
  const [waitingListDeleting, setWaitingListDeleting] = useState(false)
  const [waitingListDeleteError, setWaitingListDeleteError] = useState('')
  const [moveOutInspections, setMoveOutInspections] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [inspectionModal, setInspectionModal] = useState(false)
  const [inspectionForm, setInspectionForm] = useState({
    room_number: '',
    checklist: {},
    damage_note: '',
    photos: [],
    existingPhotos: [],
  })
  const [inspectionEditing, setInspectionEditing] = useState(null)
  const [inspectionLoadingId, setInspectionLoadingId] = useState(null)
  const [inspectionListError, setInspectionListError] = useState('')
  const [inspectionDelete, setInspectionDelete] = useState(null)
  const [inspectionDeleting, setInspectionDeleting] = useState(false)
  const [inspectionDeleteError, setInspectionDeleteError] = useState('')
  const [inspectionError, setInspectionError] = useState('')
  const [inspectionFieldErrors, setInspectionFieldErrors] = useState({})
  const [inspectionSubmitting, setInspectionSubmitting] = useState(false)
  const [invoicePrintError, setInvoicePrintError] = useState('')
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
  const [notifSeen, setNotifSeen] = useState(false)
  const [notifPage, setNotifPage] = useState(1)
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
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
  const [historyPage, setHistoryPage] = useState(1)

  const [collectRoom, setCollectRoom] = useState(null)
  const [collectSubmitting, setCollectSubmitting] = useState(false)
  const [collectError, setCollectError] = useState('')

  const [dueDetailRoom, setDueDetailRoom] = useState(null)
  const [actionSuccess, setActionSuccess] = useState('')
  const [staffTab, setStaffTab] = useState('home')
  const [pendingSlipCount, setPendingSlipCount] = useState(0)

  const [utilityRoom, setUtilityRoom] = useState(null)
  const [utilityForm, setUtilityForm] = useState({
    electricity_mode: 'units',
    electricity_units: '',
    electricity_amount: '',
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
  const [tenantModalPage, setTenantModalPage] = useState(1)
  const [maintenanceModalPage, setMaintenanceModalPage] = useState(1)
  const [maintenanceFilterStatus, setMaintenanceFilterStatus] = useState('all')
  const [maintenanceFilterDate, setMaintenanceFilterDate] = useState('')
  const [maintenanceFilterSearch, setMaintenanceFilterSearch] = useState('')
  const [moveoutConfirmRequest, setMoveoutConfirmRequest] = useState(null)
  const [renewApproveConfirm, setRenewApproveConfirm] = useState(null)
  const [moveoutAcknowledgeConfirm, setMoveoutAcknowledgeConfirm] = useState(null)
  const [tenantRejectConfirm, setTenantRejectConfirm] = useState(null)
  const [maintenanceCompleteConfirm, setMaintenanceCompleteConfirm] = useState(null)

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

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

  const loadWaitingList = () => {
    return axios
      .get('/api/staff/waiting-list', { headers: authHeaders() })
      .then(({ data }) => setWaitingList(data.waitingList))
      .catch(() => {})
  }

  const loadMoveOutInspections = () => {
    return axios
      .get('/api/staff/move-out-inspections', { headers: authHeaders() })
      .then(({ data }) => setMoveOutInspections(data.inspections))
      .catch(() => {})
  }

  const loadPendingSlipCount = () => {
    return axios
      .get('/api/staff/payment-verifications', { headers: authHeaders() })
      .then(({ data }) => setPendingSlipCount((data.payments || []).length))
      .catch(() => {})
  }

  const loadAnnouncements = () => {
    return axios
      .get('/api/staff/announcements', { headers: authHeaders() })
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
      const { data } = await axios.delete(`/api/staff/waiting-list/${waitingListDelete.id}`, { headers: authHeaders() })
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
          }
        : { full_name: '', phone: '', room_preference: '', note: '' },
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

  const waitingListPreferences = waitingListForm.room_preference
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)

  const toggleRoomPreference = (chip) => {
    const next = waitingListPreferences.includes(chip)
      ? waitingListPreferences.filter((item) => item !== chip)
      : [...waitingListPreferences, chip]
    const text = next.join(' | ')
    if (text.length <= 100) updateWaitingListField('room_preference', text)
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
      }
      if (waitingListEditing) {
        await axios.patch(`/api/staff/waiting-list/${waitingListEditing.id}`, payload, { headers: authHeaders() })
      } else {
        await axios.post('/api/staff/waiting-list', payload, { headers: authHeaders() })
        setWaitingListPage(1)
      }
      setWaitingListForm({ full_name: '', phone: '', room_preference: '', note: '' })
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
      photos: [],
      existingPhotos: [],
    })
    setInspectionEditing(null)
    setInspectionError('')
    setInspectionFieldErrors({})
    setInspectionModal(true)
  }

  const openEditInspection = async (inspection) => {
    setInspectionLoadingId(inspection.id)
    setInspectionListError('')
    try {
      const { data } = await axios.get(`/api/staff/move-out-inspections/${inspection.id}`, { headers: authHeaders() })
      const detail = data.inspection
      setInspectionForm({
        room_number: String(detail.room_number),
        checklist: detail.checklist,
        damage_note: detail.damage_note || '',
        photos: [],
        existingPhotos: detail.photos || [],
      })
      setInspectionEditing({
        id: detail.id,
        room_number: detail.room_number,
        tenant_name: detail.tenant_name,
        tenant_phone: detail.tenant_phone,
      })
      setInspectionError('')
      setInspectionFieldErrors({})
      setInspectionModal(true)
    } catch (error) {
      setInspectionListError(error.response?.data?.message || 'โหลดผลตรวจห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      if (error.response?.status === 404) await loadMoveOutInspections()
    } finally {
      setInspectionLoadingId(null)
    }
  }

  const confirmDeleteInspection = async (requestClose) => {
    setInspectionDeleting(true)
    setInspectionDeleteError('')
    try {
      const { data } = await axios.delete(`/api/staff/move-out-inspections/${inspectionDelete.id}`, {
        headers: authHeaders(),
      })
      setActionSuccess(data.message || 'ลบผลตรวจห้องสำเร็จ')
      requestClose()
      await loadMoveOutInspections()
    } catch (error) {
      setInspectionDeleteError(error.response?.data?.message || 'ลบผลตรวจห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      if (error.response?.status === 404) await loadMoveOutInspections()
    } finally {
      setInspectionDeleting(false)
    }
  }

  // Choosing the answer that is already selected clears it again.
  const setChecklistResult = (key, value) => {
    setInspectionForm((form) => {
      const { [key]: current, ...rest } = form.checklist
      return { ...form, checklist: current === value ? rest : { ...rest, [key]: value } }
    })
    setInspectionFieldErrors((errors) => ({ ...errors, checklist: (errors.checklist || []).filter((k) => k !== key) }))
  }

  const resetChecklist = () => {
    setInspectionForm((form) => ({ ...form, checklist: {} }))
    setInspectionFieldErrors((errors) => ({ ...errors, checklist: [] }))
  }

  const markRemainingGood = () => {
    setInspectionForm((form) => ({
      ...form,
      checklist: {
        ...Object.fromEntries(MOVE_OUT_CHECKLIST.map((item) => [item.key, 'good'])),
        ...form.checklist,
      },
    }))
    setInspectionFieldErrors((errors) => ({ ...errors, checklist: [] }))
  }

  const submitMoveOutInspection = async (event, requestClose) => {
    event.preventDefault()
    const room = rooms.find(
      (item) => String(item.room_number) === inspectionForm.room_number && item.is_booked && item.tenant,
    )
    const fieldErrors = {}
    if (!inspectionEditing && !room) fieldErrors.room = 'กรุณาเลือกห้องที่มีผู้เช่า'
    const missing = MOVE_OUT_CHECKLIST.filter((item) => !inspectionForm.checklist[item.key]).map((item) => item.key)
    if (missing.length > 0) fieldErrors.checklist = missing
    if (Object.values(inspectionForm.checklist).includes('damaged') && !inspectionForm.damage_note.trim()) {
      fieldErrors.damage_note = 'กรุณาระบุรายละเอียดความเสียหายที่พบ'
    }
    setInspectionFieldErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      setInspectionError(
        missing.length > 0
          ? `ยังไม่ได้ตรวจอีก ${missing.length} หัวข้อ (ไฮไลต์สีแดงด้านบน) กรุณาเลือกผลให้ครบ`
          : 'กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง',
      )
      return
    }

    setInspectionSubmitting(true)
    setInspectionError('')
    try {
      const photos = await Promise.all(inspectionForm.photos.map(compressImageFile))
      const details = {
        checklist: inspectionForm.checklist,
        damage_note: inspectionForm.damage_note.trim(),
        photos,
      }
      const { data } = inspectionEditing
        ? await axios.patch(
            `/api/staff/move-out-inspections/${inspectionEditing.id}`,
            { ...details, keep_photos: inspectionForm.existingPhotos.map((photo) => photo.url) },
            { headers: authHeaders() },
          )
        : await axios.post(
            '/api/staff/move-out-inspections',
            { room_number: room.room_number, ...details },
            { headers: authHeaders() },
          )
      setActionSuccess(data.message || (inspectionEditing ? 'แก้ไขผลตรวจห้องสำเร็จ' : 'ส่งผลตรวจห้องให้ Admin แล้ว'))
      if (!inspectionEditing) setInspectionsPage(1)
      requestClose()
      await loadMoveOutInspections()
    } catch (error) {
      setInspectionError(error.response?.data?.message || error.message || 'บันทึกผลตรวจไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      if (error.response?.status === 404) loadMoveOutInspections()
    } finally {
      setInspectionSubmitting(false)
    }
  }

  const handlePrintMonthlyInvoices = async () => {
    setInvoicePrintError('')
    const printWindow = window.open('', '_blank', 'width=900,height=720')
    if (!printWindow) {
      setInvoicePrintError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง')
      return
    }
    setInvoiceGenerating(true)
    try {
      const { data } = await axios.get('/api/staff/rooms', { headers: authHeaders() })
      const count = printMonthlyInvoices(data.rooms, printWindow)
      if (count === 0) {
        setInvoicePrintError('ไม่มีห้องที่มีผู้เช่าให้ออกใบแจ้งหนี้')
        return
      }
      setActionSuccess(`เตรียมใบแจ้งหนี้ ${count} ห้องแล้ว เลือกพิมพ์หรือบันทึกเป็น PDF ได้จากหน้าต่างที่เปิดขึ้น`)
    } catch (error) {
      printWindow.close()
      if (error.response?.status === 401 || error.response?.status === 403) {
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('user')
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
  const [expenseModal, setExpenseModal] = useState(null)
  const [expenseDelete, setExpenseDelete] = useState(null)
  const [expenseDeleting, setExpenseDeleting] = useState(false)
  const [expenseDeleteError, setExpenseDeleteError] = useState('')
  const [expenseForm, setExpenseForm] = useState({ category: '', description: '', amount: '', expense_date: '' })
  const [expenseFormError, setExpenseFormError] = useState('')
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)

  const loadExpenses = (page = 1) => {
    return axios
      .get('/api/staff/expenses', { headers: authHeaders(), params: { page } })
      .then(({ data }) => {
        setExpenses(data.expenses)
        setExpensesPage(data.page)
        setExpensesTotalPages(Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 20))))
        setExpensesError('')
      })
      .catch((err) => {
        setExpensesError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลรายจ่ายได้')
      })
      .finally(() => setExpensesLoading(false))
  }

  const openCreateExpense = () => {
    setExpenseForm({ category: '', description: '', amount: '', expense_date: getTodayInputDate() })
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

  const confirmDeleteExpense = async (requestClose) => {
    setExpenseDeleting(true)
    setExpenseDeleteError('')
    try {
      const { data } = await axios.delete(`/api/staff/expenses/${expenseDelete.id}`, { headers: authHeaders() })
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
        ? axios.post('/api/staff/expenses', payload, { headers: authHeaders() })
        : axios.put(`/api/staff/expenses/${expenseModal.expense.id}`, payload, { headers: authHeaders() })

    request
      .then(() => {
        requestClose()
        loadExpenses(expenseModal.mode === 'create' ? 1 : expensesPage)
      })
      .catch((err) => {
        setExpenseFormError(err.response?.data?.message || 'ไม่สามารถบันทึกรายจ่ายได้')
      })
      .finally(() => setExpenseSubmitting(false))
  }

  const loadRequests = () => {
    return axios
      .get('/api/staff/requests', { headers: authHeaders() })
      .then(({ data }) => {
        setTenantRequests(data.tenantRequests)
        setMaintenanceRequests(data.maintenanceRequests)
        setRequestsError('')
      })
      .catch((err) => {
        setRequestsError(err.response?.data?.message || 'ไม่สามารถโหลดรายการคำขอได้')
      })
  }

  const loadTenantHistory = (page, search = tenantHistorySearch, status = tenantHistoryStatusFilter) => {
    setTenantHistoryLoading(true)
    setTenantHistoryError('')
    return axios
      .get('/api/staff/requests/history', {
        headers: authHeaders(),
        params: { page, search: search || undefined, status: status !== 'all' ? status : undefined },
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
    loadTenantHistory(1, '', 'all')
  }

  const loadMaintenanceHistory = (page, search = maintenanceHistorySearch, status = maintenanceHistoryStatusFilter) => {
    setMaintenanceHistoryLoading(true)
    setMaintenanceHistoryError('')
    return axios
      .get('/api/staff/maintenance/history', {
        headers: authHeaders(),
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
      .get('/api/staff/rooms', { headers: authHeaders() })
      .then(({ data }) => {
        setRooms(data.rooms)
        setError('')
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      })
  }

  useEffect(() => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    let isMounted = true
    loadRooms().finally(() => {
      if (isMounted) setLoading(false)
    })
    loadRequests().finally(() => {
      if (isMounted) setRequestsLoading(false)
    })
    loadExpenses(1)
    loadWaitingList()
    loadMoveOutInspections()
    loadAnnouncements()
    loadPendingSlipCount()
    const announcementsInterval = setInterval(loadAnnouncements, 30000)
    const slipCountInterval = setInterval(loadPendingSlipCount, 30000)
    return () => {
      isMounted = false
      clearInterval(announcementsInterval)
      clearInterval(slipCountInterval)
    }
  }, [])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    setStaffUser(null)
    navigate('/login', { replace: true })
  }

  const handleApproveTenantRequest = async (request) => {
    const key = `tenant-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${request.id}/approve`, {}, { headers: authHeaders() })
      setActionSuccess(data.message || 'อนุมัติคำขอสำเร็จ')
      await Promise.all([loadRequests(), loadRooms()])
      return true
    } catch (err) {
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
      const { data } = await axios.post(`/api/staff/requests/${request.id}/acknowledge`, {}, { headers: authHeaders() })
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

  const handleConfirmRenewApproval = async () => {
    if (!renewApproveConfirm) return
    const success = await handleApproveTenantRequest(renewApproveConfirm)
    if (success) setRenewApproveConfirm(null)
  }

  const handleConfirmMoveoutAcknowledge = async () => {
    if (!moveoutAcknowledgeConfirm) return
    const success = await handleAcknowledgeTenantRequest(moveoutAcknowledgeConfirm)
    if (success) setMoveoutAcknowledgeConfirm(null)
  }

  const handleConfirmMaintenanceComplete = async () => {
    if (!maintenanceCompleteConfirm) return
    const success = await handleMaintenanceAction(maintenanceCompleteConfirm, 'complete')
    if (success) setMaintenanceCompleteConfirm(null)
  }

  const handleRejectTenantRequest = async (request) => {
    const key = `tenant-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(`/api/staff/requests/${request.id}/reject`, {}, { headers: authHeaders() })
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

  const handleConfirmTenantReject = async () => {
    if (!tenantRejectConfirm) return
    const success = await handleRejectTenantRequest(tenantRejectConfirm)
    if (success) setTenantRejectConfirm(null)
  }

  const handleMaintenanceAction = async (request, action) => {
    const key = `maintenance-${request.id}`
    setProcessingRequestKey(key)
    setRequestsError('')
    try {
      const { data } = await axios.post(
        `/api/staff/maintenance/${request.id}/${action}`,
        {},
        { headers: authHeaders() },
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

  const renderTenantRequestItem = (request) => {
    const key = `tenant-${request.id}`
    const isProcessing = processingRequestKey === key
    return (
      <div key={key} className="staff-request-item">
        <div className="staff-request-main">
          <div className="staff-request-headline">
            <span className={`staff-badge type-${request.type}`}>
              {TENANT_REQUEST_TYPE_LABEL[request.type] || request.type}
            </span>
            <span className="staff-request-room">ห้อง {request.room_number}</span>
            <span className="staff-request-tenant">
              {request.first_name} {request.last_name}
            </span>
          </div>
          <div className="staff-request-meta">
            {request.type === 'renew' && (
              <>
                <span>
                  ขอต่อ{' '}
                  {RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`}
                </span>
                <span>{RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type}</span>
              </>
            )}
            {request.phone && <span>โทร {request.phone}</span>}
          </div>
          {request.note && <p className="staff-request-note">หมายเหตุ: {request.note}</p>}
          <p className="staff-request-date is-submitted">
            <span className="staff-request-date-label">ส่งคำขอ</span>
            <span className="staff-request-date-value">{formatDateTime(request.created_at)}</span>
          </p>
        </div>
        <div className="staff-row-actions">
          {request.type === 'moveout' ? (
            request.status === 'in_progress' ? (
              <button
                type="button"
                className="staff-action-btn is-primary"
                disabled={isProcessing}
                onClick={() => setMoveoutConfirmRequest(request)}
              >
                {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติการย้ายออก'}
              </button>
            ) : (
              <button
                type="button"
                className="staff-action-btn is-primary"
                disabled={isProcessing}
                onClick={() => setMoveoutAcknowledgeConfirm(request)}
              >
                {isProcessing ? 'กำลังดำเนินการ...' : 'รับเรื่อง'}
              </button>
            )
          ) : (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => setRenewApproveConfirm(request)}
            >
              {isProcessing ? 'กำลังดำเนินการ...' : 'อนุมัติ'}
            </button>
          )}
          <button
            type="button"
            className="staff-action-btn is-ghost"
            disabled={isProcessing}
            onClick={() => setTenantRejectConfirm(request)}
          >
            ปฏิเสธ
          </button>
        </div>
        {request.type === 'moveout' && (
          <div className="staff-status-below">
            <span className={`staff-badge status-${request.status}`}>
              {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
            </span>
          </div>
        )}
      </div>
    )
  }

  const renderMaintenanceRequestItem = (request) => {
    const key = `maintenance-${request.id}`
    const isProcessing = processingRequestKey === key
    return (
      <div key={key} className="staff-request-item is-maintenance">
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
            <div className="staff-maintenance-photos">
              {request.photos.map((photo, index) => (
                <a key={`${photo.name}-${index}`} href={photo.dataUrl} target="_blank" rel="noreferrer">
                  <img src={photo.dataUrl} alt={`รูปแจ้งซ่อมห้อง ${request.room_number} ${index + 1}`} />
                </a>
              ))}
            </div>
          )}
          <p className="staff-request-date is-reported">
            <span className="staff-request-date-label">แจ้งซ่อม</span>
            <span className="staff-request-date-value">{formatDateTime(request.created_at)}</span>
          </p>
        </div>
        <div className="staff-row-actions">
          {request.status === 'pending' ? (
            <button
              type="button"
              className="staff-action-btn is-primary"
              disabled={isProcessing}
              onClick={() => handleMaintenanceAction(request, 'accept')}
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
          <button
            type="button"
            className="staff-action-btn is-ghost"
            disabled={isProcessing}
            onClick={() => handleMaintenanceAction(request, 'reject')}
          >
            ปฏิเสธ
          </button>
        </div>
      </div>
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

  // The slip viewer in the payment history: Esc closes only the viewer, not the history window behind it.
  useEffect(() => {
    if (!historySlip) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setHistorySlipClosing(true)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [historySlip])

  useEffect(() => {
    if (!historySlipClosing) return undefined
    const timer = setTimeout(() => {
      setHistorySlip(null)
      setHistorySlipClosing(false)
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
      const { data } = await axios.get(`/api/staff/rooms/${room.room_number}/history`, { headers: authHeaders() })
      setHistoryData(data.rentalHistory)
    } catch (err) {
      setHistoryError(err.response?.data?.message || 'ไม่สามารถโหลดประวัติการจ่ายเงินได้')
    } finally {
      setHistoryLoading(false)
    }
  }

  const openDueDetail = (room) => {
    setDueDetailRoom(room)
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
        {},
        { headers: authHeaders() },
      )
      setActionSuccess(data.message || 'บันทึกการเก็บเงินสำเร็จ')
      setCollectRoom(null)
      await loadRooms()
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
          water_amount: utilityForm.water_amount,
        },
        { headers: authHeaders() },
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

  const notifications = useMemo(() => {
    return [
      ...tenantRequests.flatMap(buildStaffTenantNotifs),
      ...maintenanceRequests.flatMap(buildStaffMaintenanceNotifs),
      ...announcements.map(buildAnnouncementNotif),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [tenantRequests, maintenanceRequests, announcements])

  const inspectionResults = MOVE_OUT_CHECKLIST.map((item) => inspectionForm.checklist[item.key]).filter(Boolean)
  const inspectionCounts = {
    good: inspectionResults.filter((result) => result === 'good').length,
    damaged: inspectionResults.filter((result) => result === 'damaged').length,
    not_applicable: inspectionResults.filter((result) => result === 'not_applicable').length,
  }
  
  const currentWaitingListPage = Math.min(
    waitingListPage,
    Math.max(1, Math.ceil(waitingList.length / STAFF_LIST_PAGE_SIZE)),
  )
  const waitingListPageItems = waitingList.slice(
    (currentWaitingListPage - 1) * STAFF_LIST_PAGE_SIZE,
    currentWaitingListPage * STAFF_LIST_PAGE_SIZE,
  )
  const currentInspectionsPage = Math.min(
    inspectionsPage,
    Math.max(1, Math.ceil(moveOutInspections.length / STAFF_LIST_PAGE_SIZE)),
  )
  const inspectionsPageItems = moveOutInspections.slice(
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
          const matchesRoom = String(room.room_number).includes(keyword)
          const matchesTenant = tenantName.includes(keyword)
          const matchesPhone = room.tenant?.phone?.includes(keyword)
          if (!matchesRoom && !matchesTenant && !matchesPhone) return false
        }
        return true
      })
      .sort((a, b) => Number(a.is_booked) - Number(b.is_booked) || a.room_number - b.room_number)
  }, [rooms, search, statusFilter])

  const roomsTotalPages = Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE))
  const currentRoomsPage = Math.min(roomsPage, roomsTotalPages)

  const paginatedRooms = useMemo(() => {
    const start = (currentRoomsPage - 1) * ROOMS_PER_PAGE
    return filteredRooms.slice(start, start + ROOMS_PER_PAGE)
  }, [filteredRooms, currentRoomsPage])

  const filteredTenantRequests = useMemo(() => {
    return tenantRequests.filter((request) => {
      if (tenantFilterType !== 'all' && request.type !== tenantFilterType) return false

      if (tenantFilterSearch.trim()) {
        const keyword = tenantFilterSearch.trim().toLowerCase()
        const tenantName = `${request.first_name} ${request.last_name}`.toLowerCase()
        const matchesRoom = String(request.room_number).includes(keyword)
        const matchesTenant = tenantName.includes(keyword)
        const matchesPhone = request.phone?.includes(keyword)
        if (!matchesRoom && !matchesTenant && !matchesPhone) return false
      }
      return true
    })
  }, [tenantRequests, tenantFilterType, tenantFilterSearch])

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
        const matchesRoom = String(request.room_number).includes(keyword)
        const matchesTenant = tenantName.includes(keyword)
        const matchesPhone = request.contact_phone?.includes(keyword)
        if (!matchesRoom && !matchesTenant && !matchesPhone) return false
      }
      return true
    })
  }, [maintenanceRequests, maintenanceFilterStatus, maintenanceFilterDate, maintenanceFilterSearch])

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
        const haystack = [
          payment.tenantName,
          formatDateTime(payment.created_at),
          PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง',
          formatCurrency(payment.amount),
          PAYMENT_STATUS_LABEL[payment.status] || payment.status,
          payment.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(keyword)) return false
      }
      return true
    })
  }, [historyPayments, historyStatusFilter, historySearch])

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryPayments.length / PAYMENT_HISTORY_PAGE_SIZE))
  const currentHistoryPage = Math.min(historyPage, historyTotalPages)
  const paginatedHistoryPayments = useMemo(() => {
    const start = (currentHistoryPage - 1) * PAYMENT_HISTORY_PAGE_SIZE
    return filteredHistoryPayments.slice(start, start + PAYMENT_HISTORY_PAGE_SIZE)
  }, [filteredHistoryPayments, currentHistoryPage])

  if (loading) {
    return (
      <div className="staff-page d-flex align-items-center justify-content-center">
        <p className="text-muted">กำลังโหลดข้อมูล...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="staff-page">
        <div className="container">
          <div className="alert alert-danger">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="staff-page">
      <div className="staff-container">
        <div className="staff-header">
          <div className="staff-title-group">
            <div className="auth-icon">
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
              <h1>สวัสดี, {staffUser ? `${staffUser.first_name} ${staffUser.last_name}` : 'เจ้าหน้าที่'}</h1>
              <p>แดชบอร์ดเจ้าหน้าที่ - จัดการห้องพักและการเก็บเงิน</p>
            </div>
          </div>
          <div className="staff-header-actions">
            <div className="staff-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="staff-notif-btn"
                aria-label="การแจ้งเตือน"
                onClick={() => {
                  if (notifOpen) {
                    closeNotifPanel()
                  } else {
                    setNotifOpen(true)
                    setNotifSeen(true)
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
                {!notifSeen && notifications.length > 0 && <span className="staff-notif-dot" />}
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
                    <span>การแจ้งเตือน</span>
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
                    <p className="staff-notif-empty">ยังไม่มีการแจ้งเตือน</p>
                  ) : (
                    <>
                      <div className="staff-notif-list">
                        {paginatedNotifications.map((notif) => (
                          <button
                            type="button"
                            key={notif.key}
                            className={`staff-notif-item is-${notif.tone}`}
                            onClick={() => setNotifDetail(notif)}
                          >
                            <p className="staff-notif-item-title">{notif.title}</p>
                            <p className="staff-notif-item-status">{notif.label}</p>
                            <p className="staff-notif-item-date">{formatDateTime(notif.date)}</p>
                          </button>
                        ))}
                      </div>
                      {notifTotalPages > 1 && (
                        <div className="staff-notif-pagination">
                          <button
                            type="button"
                            className="staff-notif-page-btn"
                            disabled={notifCurrentPage <= 1}
                            onClick={() => setNotifPage(Math.max(1, notifCurrentPage - 1))}
                          >
                            ก่อนหน้า
                          </button>
                          <span className="staff-notif-page-info">
                            หน้า {notifCurrentPage} / {notifTotalPages}
                          </span>
                          <button
                            type="button"
                            className="staff-notif-page-btn"
                            disabled={notifCurrentPage >= notifTotalPages}
                            onClick={() => setNotifPage(Math.min(notifTotalPages, notifCurrentPage + 1))}
                          >
                            ถัดไป
                          </button>
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
            <button type="button" className="staff-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
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
                <p className="staff-confirm-message">{actionSuccess}</p>
                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

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
                    className="staff-action-btn is-danger"
                    disabled={waitingListDeleting}
                    onClick={() => confirmDeleteWaitingListEntry(requestClose)}
                  >
                    {waitingListDeleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                  </button>
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    disabled={waitingListDeleting}
                    onClick={requestClose}
                  >
                    ยกเลิก
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
            variant="form"
          >
            {(requestClose) => (
              <form
                className="waiting-form"
                onSubmit={(event) => submitWaitingListEntry(event, requestClose)}
                noValidate
              >
                <div className="waiting-form-intro">
                  <span className="waiting-form-intro-icon" aria-hidden="true">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M19 8v6M22 11h-6" />
                    </svg>
                  </span>
                  <p>บันทึกคนที่สนใจเช่าห้อง เพื่อติดต่อกลับเมื่อมีห้องว่าง</p>
                </div>

                {waitingListError && (
                  <p className="staff-form-error staff-form-error-block" role="alert">
                    {waitingListError}
                  </p>
                )}

                <div className="staff-form-field">
                  <label className="staff-form-label" htmlFor="waiting-full-name">
                    ชื่อผู้สนใจ <span className="staff-form-required">*</span>
                  </label>
                  <input
                    id="waiting-full-name"
                    className={`staff-form-input${waitingListFieldErrors.full_name ? ' is-invalid' : ''}`}
                    maxLength={255}
                    autoFocus
                    autoComplete="off"
                    placeholder="ชื่อ-นามสกุล"
                    value={waitingListForm.full_name}
                    onChange={(event) => updateWaitingListField('full_name', event.target.value)}
                  />
                  {waitingListFieldErrors.full_name && (
                    <span className="staff-form-field-error">{waitingListFieldErrors.full_name}</span>
                  )}
                </div>

                <div className="staff-form-field">
                  <label className="staff-form-label" htmlFor="waiting-phone">
                    เบอร์โทรศัพท์ <span className="staff-form-required">*</span>
                  </label>
                  <input
                    id="waiting-phone"
                    className={`staff-form-input${waitingListFieldErrors.phone ? ' is-invalid' : ''}`}
                    type="tel"
                    inputMode="tel"
                    maxLength={20}
                    autoComplete="off"
                    placeholder="เช่น 0812345678"
                    value={waitingListForm.phone}
                    onChange={(event) => updateWaitingListField('phone', event.target.value)}
                  />
                  {waitingListFieldErrors.phone && (
                    <span className="staff-form-field-error">{waitingListFieldErrors.phone}</span>
                  )}
                </div>

                <div className="staff-form-field">
                  <label className="staff-form-label" htmlFor="waiting-room-preference">
                    ประเภทห้องที่สนใจ <span className="staff-form-optional">(ไม่บังคับ)</span>
                  </label>
                  <div className="waiting-form-chips" role="group" aria-label="เลือกประเภทห้องแบบเร็ว">
                    {ROOM_PREFERENCE_CHIPS.map((chip) => (
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
                    id="waiting-room-preference"
                    className="staff-form-input"
                    maxLength={100}
                    autoComplete="off"
                    placeholder="หรือพิมพ์เอง เช่น งบไม่เกิน 4,000 บาท"
                    value={waitingListForm.room_preference}
                    onChange={(event) => updateWaitingListField('room_preference', event.target.value)}
                  />
                </div>

                <div className="staff-form-field">
                  <div className="staff-form-label-row">
                    <label className="staff-form-label" htmlFor="waiting-note">
                      หมายเหตุ <span className="staff-form-optional">(ไม่บังคับ)</span>
                    </label>
                    <span className="staff-form-counter">{waitingListForm.note.length}/500</span>
                  </div>
                  <textarea
                    id="waiting-note"
                    className="staff-form-input staff-form-textarea"
                    rows={3}
                    maxLength={500}
                    placeholder="เช่น ต้องการเข้าอยู่ต้นเดือนหน้า"
                    value={waitingListForm.note}
                    onChange={(event) => updateWaitingListField('note', event.target.value)}
                  />
                </div>

                <div className="staff-form-actions">
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                    ยกเลิก
                  </button>
                  <button type="submit" className="staff-action-btn is-primary" disabled={waitingListSubmitting}>
                    {waitingListSubmitting
                      ? 'กำลังบันทึก...'
                      : waitingListEditing
                        ? 'บันทึกการแก้ไข'
                        : 'บันทึกรายชื่อ'}
                  </button>
                </div>
              </form>
            )}
          </Modal>
        )}

        {inspectionDelete && (
          <Modal title="ยืนยันการลบผลตรวจห้อง" onClose={() => setInspectionDelete(null)} variant="confirm">
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
                <p className="staff-confirm-message">ลบผลตรวจห้องนี้ออกจากระบบ? รูปที่แนบจะถูกลบด้วย</p>
                <div className="staff-confirm-details">
                  <div className="staff-confirm-detail-row">
                    <span>ห้อง</span>
                    <strong>{inspectionDelete.room_number}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>ผู้เช่า</span>
                    <strong>{inspectionDelete.tenant_name}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>วันที่ตรวจ</span>
                    <strong>{formatDateTime(inspectionDelete.created_at)}</strong>
                  </div>
                </div>
                {inspectionDeleteError && (
                  <p className="staff-form-error" role="alert">
                    {inspectionDeleteError}
                  </p>
                )}
                <div className="staff-form-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-danger"
                    disabled={inspectionDeleting}
                    onClick={() => confirmDeleteInspection(requestClose)}
                  >
                    {inspectionDeleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                  </button>
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    disabled={inspectionDeleting}
                    onClick={requestClose}
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {inspectionModal && (
          <Modal
            title={inspectionEditing ? `แก้ไขผลตรวจห้อง ${inspectionEditing.room_number}` : 'Checklist ตรวจห้องย้ายออก'}
            onClose={() => {
              setInspectionModal(false)
              setInspectionEditing(null)
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
                    <span className="inspection-step">1</span> {inspectionEditing ? 'ห้องที่ตรวจ' : 'เลือกห้องที่ตรวจ'}
                  </h4>
                  <div className="staff-form-field">
                    <label className="staff-form-label" htmlFor="inspection-room">
                      ห้อง / ผู้เช่า <span className="staff-form-required">*</span>
                    </label>
                    {inspectionEditing ? (
                      <div className="room-picker-trigger inspection-room-fixed" id="inspection-room">
                        <span className="room-picker-avatar" aria-hidden="true">
                          {inspectionEditing.tenant_name?.[0] || '?'}
                        </span>
                        <span className="room-picker-main">
                          <strong>{inspectionEditing.tenant_name}</strong>
                          <small>
                            ห้อง {inspectionEditing.room_number}
                            {inspectionEditing.tenant_phone ? ` · โทร ${inspectionEditing.tenant_phone}` : ''}
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
                          setInspectionForm((form) => ({ ...form, room_number: roomNumber }))
                          setInspectionFieldErrors((errors) => ({ ...errors, room: undefined }))
                        }}
                      />
                    )}
                    {inspectionFieldErrors.room && (
                      <span className="staff-form-field-error">{inspectionFieldErrors.room}</span>
                    )}
                  </div>
                </section>

                <section className="inspection-section">
                  <div className="inspection-section-head">
                    <h4 className="inspection-section-title">
                      <span className="inspection-step">2</span> ตรวจสภาพห้อง
                    </h4>
                    <div className="inspection-head-actions">
                      <button type="button" className="inspection-link-btn" onClick={markRemainingGood}>
                        ตั้งที่เหลือเป็น “ปกติ” ทั้งหมด
                      </button>
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
                      <span className="inspection-counts">
                        <span className="is-good">ปกติ {inspectionCounts.good}</span>
                        <span className="is-damaged">ชำรุด {inspectionCounts.damaged}</span>
                        <span className="is-not_applicable">ไม่เกี่ยวข้อง {inspectionCounts.not_applicable}</span>
                      </span>
                    </div>
                    <span className="inspection-progress-bar">
                      <span style={{ width: `${(inspectionResults.length / MOVE_OUT_CHECKLIST.length) * 100}%` }} />
                    </span>
                  </div>
                  <div className="inspection-list">
                    {MOVE_OUT_CHECKLIST.map((item) => {
                      const result = inspectionForm.checklist[item.key] || ''
                      const isMissing = (inspectionFieldErrors.checklist || []).includes(item.key)
                      return (
                        <div
                          key={item.key}
                          className={`inspection-row${result ? ` is-${result}` : ''}${isMissing ? ' is-missing' : ''}`}
                        >
                          <span className="inspection-row-label">
                            {item.label}
                            {isMissing && <small>ยังไม่ได้เลือก</small>}
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
                      <label className="staff-form-label" htmlFor="inspection-damage-note">
                        รายละเอียดความเสียหาย / หมายเหตุ{' '}
                        {inspectionCounts.damaged > 0 ? (
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
                      placeholder={
                        inspectionCounts.damaged > 0
                          ? 'ระบุตำแหน่งและรายละเอียดของสิ่งที่ชำรุด'
                          : 'หมายเหตุเพิ่มเติม (ถ้ามี)'
                      }
                    />
                    {inspectionFieldErrors.damage_note && (
                      <span className="staff-form-field-error">{inspectionFieldErrors.damage_note}</span>
                    )}
                  </div>
                  <div className="staff-form-field">
                    <span className="staff-form-label">
                      รูปภาพประกอบ <span className="staff-form-optional">(ไม่บังคับ · สูงสุด {INSPECTION_MAX_PHOTOS} รูป)</span>
                    </span>
                    <InspectionPhotoPicker
                      files={inspectionForm.photos}
                      existing={inspectionForm.existingPhotos}
                      onRemoveExisting={(url) =>
                        setInspectionForm((form) => ({
                          ...form,
                          existingPhotos: form.existingPhotos.filter((photo) => photo.url !== url),
                        }))
                      }
                      onChange={(photos) => setInspectionForm((form) => ({ ...form, photos }))}
                      onError={setInspectionError}
                    />
                  </div>
                </section>

                <div className="inspection-footer">
                  {inspectionError && (
                    <p className="staff-form-error inspection-footer-error" role="alert">
                      {inspectionError}
                    </p>
                  )}
                  <p className="inspection-footer-note">
                    {inspectionEditing
                      ? 'เมื่อแก้ไข สถานะจะกลับเป็น "รอตรวจ" เพื่อให้ Admin ตรวจสอบอีกครั้ง'
                      : 'ผลตรวจและรูปจะถูกบันทึกในระบบ และส่งให้ Admin ตรวจสอบ'}
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
                          : 'ส่งผลตรวจให้ Admin'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </Modal>
        )}

        <div className="staff-summary-grid">
          <div className="staff-summary-card">
            <span className="staff-summary-icon">
              <SummaryIcon type="total" />
            </span>
            <span className="staff-summary-text">
              <span className="staff-summary-label">ห้องทั้งหมด</span>
              <span className="staff-summary-value">{summary.total}</span>
            </span>
          </div>
          <div className="staff-summary-card is-booked">
            <span className="staff-summary-icon">
              <SummaryIcon type="booked" />
            </span>
            <span className="staff-summary-text">
              <span className="staff-summary-label">ห้องไม่ว่าง</span>
              <span className="staff-summary-value">{summary.booked}</span>
            </span>
          </div>
          <div className="staff-summary-card is-vacant">
            <span className="staff-summary-icon">
              <SummaryIcon type="vacant" />
            </span>
            <span className="staff-summary-text">
              <span className="staff-summary-label">ห้องว่าง</span>
              <span className="staff-summary-value">{summary.vacant}</span>
            </span>
          </div>
          <div className="staff-summary-card is-due">
            <span className="staff-summary-icon">
              <SummaryIcon type="due" />
            </span>
            <span className="staff-summary-text">
              <span className="staff-summary-label">รอเก็บเงิน</span>
              <span className="staff-summary-value">{summary.dueCount}</span>
            </span>
          </div>
        </div>

        <ul className="nav nav-tabs staff-tabs">
          {STAFF_TABS.map((tab) => (
            <li className="nav-item" key={tab.key}>
              <button
                type="button"
                className={`nav-link staff-tab-link${staffTab === tab.key ? ' active' : ''}`}
                onClick={() => setStaffTab(tab.key)}
              >
                {tab.label}
                {tab.key === 'payment-review' && pendingSlipCount > 0 && (
                  <span className="staff-tab-badge" aria-label={`${pendingSlipCount} รายการรอตรวจ`}>
                    {pendingSlipCount}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {staffTab === 'payment-review' && <StaffPaymentReview onCountChange={setPendingSlipCount} />}

        {staffTab === 'announcements' && (
          <AnnouncementBoard
            variant="staff"
            announcements={announcements}
            canManage
            apiBase="/api/staff/announcements"
            onChange={loadAnnouncements}
          />
        )}

        {staffTab === 'waiting-list' && (
          <div className="staff-card">
            <div className="staff-card-header">
              <div>
                <h2>
                  รายชื่อคนรอห้องว่าง <span className="staff-count-pill">{waitingList.length}</span>
                </h2>
                <p className="waiting-list-storage-note">Admin เห็นรายชื่อนี้และจัดการสถานะต่อได้</p>
              </div>
              <button
                type="button"
                className="staff-action-btn is-primary"
                onClick={() => openWaitingListModal()}
              >
                + เพิ่มผู้สนใจ
              </button>
            </div>
            <div className="table-responsive">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>ชื่อผู้สนใจ</th>
                    <th>เบอร์โทร</th>
                    <th>ประเภทห้อง</th>
                    <th>วันที่แจ้ง</th>
                    <th>บันทึกโดย</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {waitingList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="staff-empty">
                        ยังไม่มีรายชื่อผู้รอห้องว่าง
                      </td>
                    </tr>
                  ) : (
                    waitingListPageItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.full_name}</td>
                        <td>{item.phone}</td>
                        <td>{item.room_preference || '-'}</td>
                        <td>{formatDate(item.created_at)}</td>
                        <td>{item.submitted_by_name || '-'}</td>
                        <td>
                          <div className="staff-row-actions">
                            <button
                              type="button"
                              className="staff-action-btn is-ghost"
                              onClick={() => openWaitingListModal(item)}
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              className="staff-action-btn is-danger"
                              onClick={() => {
                                setWaitingListDeleteError('')
                                setWaitingListDelete(item)
                              }}
                            >
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
            <StaffPagination page={currentWaitingListPage} total={waitingList.length} onChange={setWaitingListPage} />
          </div>
        )}

        {staffTab === 'move-out-inspections' && (
          <div className="staff-card">
            <div className="staff-card-header">
              <div>
                <h2>
                  ตรวจห้องตอนย้ายออก <span className="staff-count-pill">{moveOutInspections.length}</span>
                </h2>
                <p className="waiting-list-storage-note">Checklist, รูป และความเสียหายที่ส่งให้ Admin</p>
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
            <div className="table-responsive">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>ห้อง</th>
                    <th>ผู้เช่า</th>
                    <th>วันที่ตรวจ</th>
                    <th>ผลตรวจ</th>
                    <th>Admin</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {moveOutInspections.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="staff-empty">
                        ยังไม่มีผลตรวจห้องย้ายออก
                      </td>
                    </tr>
                  ) : (
                    inspectionsPageItems.map((inspection) => (
                      <tr key={inspection.id}>
                        <td>{inspection.room_number}</td>
                        <td>{inspection.tenant_name}</td>
                        <td>{formatDateTime(inspection.created_at)}</td>
                        <td>
                          {inspection.checklist && Object.values(inspection.checklist).includes('damaged')
                            ? 'พบความเสียหาย'
                            : 'บันทึกแล้ว'}
                        </td>
                        <td>
                          {inspection.status === 'pending'
                            ? 'รอตรวจ'
                            : inspection.status === 'reviewed'
                              ? 'ตรวจแล้ว'
                              : 'ต้องติดตาม'}
                        </td>
                        <td>
                          <div className="staff-row-actions">
                            <button
                              type="button"
                              className="staff-action-btn is-ghost"
                              disabled={inspectionLoadingId === inspection.id}
                              onClick={() => openEditInspection(inspection)}
                            >
                              {inspectionLoadingId === inspection.id ? 'กำลังโหลด...' : 'แก้ไข'}
                            </button>
                            <button
                              type="button"
                              className="staff-action-btn is-danger"
                              onClick={() => {
                                setInspectionDeleteError('')
                                setInspectionDelete(inspection)
                              }}
                            >
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
            <StaffPagination
              page={currentInspectionsPage}
              total={moveOutInspections.length}
              onChange={setInspectionsPage}
            />
          </div>
        )}

        {staffTab === 'home' && (
          <>
            <div className="staff-card">
              <div className="staff-card-header">
                <h2>รายการห้องพัก</h2>
                <div className="staff-card-header-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-ghost"
                    onClick={handlePrintMonthlyInvoices}
                    disabled={invoiceGenerating}
                  >
                    {invoiceGenerating ? 'กำลังเตรียม...' : 'ใบแจ้งหนี้รวม / PDF'}
                  </button>
                  <div className="staff-filters">
                    <input
                      type="text"
                      className="staff-search-input"
                      placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร..."
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value)
                        setRoomsPage(1)
                      }}
                    />
                    <select
                      className="staff-filter-select"
                      value={statusFilter}
                      onChange={(event) => {
                        setStatusFilter(event.target.value)
                        setRoomsPage(1)
                      }}
                    >
                      <option value="all">ทุกสถานะ</option>
                      <option value="booked">ไม่ว่าง</option>
                      <option value="vacant">ว่าง</option>
                      <option value="due">รอเก็บเงิน</option>
                      <option value="expiring">ใกล้หมดสัญญา</option>
                    </select>
                  </div>
                </div>
              </div>

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
                      <tr>
                        <td colSpan={8} className="staff-empty">
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
                            <tr>
                              <td className="staff-room-number-cell">{room.room_number}</td>
                              <td>
                                <span className={`staff-badge status-${room.is_booked ? 'booked' : 'vacant'}`}>
                                  {room.is_booked ? 'ไม่ว่าง' : 'ว่าง'}
                                </span>
                              </td>
                              <td>{room.tenant ? `${room.tenant.first_name} ${room.tenant.last_name}` : '-'}</td>
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
                              <td>
                                {room.currentDue ? (
                                  <span className={`staff-badge status-${dueBadgeClass(room.currentDue.status)}`}>
                                    {DUE_STATUS_LABEL[room.currentDue.status] || room.currentDue.status}
                                  </span>
                                ) : (
                                  <span className="staff-badge status-none">-</span>
                                )}
                              </td>
                              <td className="staff-col-optional">
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
                              <td>
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
                              </td>
                            </tr>
                            <tr className="staff-row-detail">
                              <td colSpan={8}>
                                <div className={`staff-row-detail-wrap${isExpanded ? ' is-expanded' : ''}`}>
                                  <div className="staff-row-detail-scroll">
                                    <div className="staff-row-detail-content">
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
                                      <div className="staff-row-detail-item">
                                        <span>ยอดค้างชำระ</span>
                                        {hasDue ? (
                                          <button
                                            type="button"
                                            className={`staff-due-amount staff-due-amount-btn is-${dueBadgeClass(room.currentDue.status)}`}
                                            onClick={() => openDueDetail(room)}
                                          >
                                            ฿{formatCurrency(room.currentDue.amount)}
                                          </button>
                                        ) : (
                                          <strong className="staff-due-amount is-none">-</strong>
                                        )}
                                      </div>
                                      <div className="staff-row-actions">
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
                                            onClick={() =>
                                              navigate('/register', { state: { roomNumber: room.room_number } })
                                            }
                                          >
                                            เพิ่มผู้เช่า
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                            <tr className="staff-row-toggle-row">
                              <td colSpan={8}>
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

            <div className="staff-requests-grid">
              <div className="staff-card">
                <div className="staff-card-header">
                  <h2>
                    คำขอต่อสัญญา / แจ้งย้ายออก
                    {tenantRequests.length > 0 && <span className="staff-count-pill">{tenantRequests.length}</span>}
                  </h2>
                  <div className="staff-card-header-actions">
                    <button type="button" className="staff-view-all-btn" onClick={openTenantHistory}>
                      ดูประวัติ
                    </button>
                    {filteredTenantRequests.length > REQUEST_PREVIEW_COUNT && (
                      <button type="button" className="staff-view-all-btn" onClick={() => setViewAllRequests('tenant')}>
                        ดูทั้งหมด
                      </button>
                    )}
                  </div>
                </div>

                {tenantRequests.length > 0 && (
                  <div className="staff-filters staff-card-filters">
                    <input
                      type="text"
                      className="staff-search-input"
                      placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
                      value={tenantFilterSearch}
                      onChange={(event) => {
                        setTenantFilterSearch(event.target.value)
                        setTenantModalPage(1)
                      }}
                    />
                    <select
                      className="staff-filter-select"
                      value={tenantFilterType}
                      onChange={(event) => {
                        setTenantFilterType(event.target.value)
                        setTenantModalPage(1)
                      }}
                    >
                      <option value="all">ทุกประเภท</option>
                      <option value="renew">ต่อสัญญา</option>
                      <option value="moveout">แจ้งย้ายออก</option>
                    </select>
                  </div>
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
                  ) : tenantRequests.length === 0 ? (
                    <p className="staff-empty">ไม่มีคำขอที่รอดำเนินการในขณะนี้</p>
                  ) : filteredTenantRequests.length === 0 ? (
                    <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
                  ) : (
                    <div className="staff-requests-list">
                      {filteredTenantRequests.slice(0, REQUEST_PREVIEW_COUNT).map(renderTenantRequestItem)}
                    </div>
                  )}
                </div>
              </div>

              <div className="staff-card">
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
                    {filteredMaintenanceRequests.length > REQUEST_PREVIEW_COUNT && (
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

                {maintenanceRequests.length > 0 && (
                  <div className="staff-filters staff-card-filters">
                    <input
                      type="text"
                      className="staff-search-input"
                      placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
                      value={maintenanceFilterSearch}
                      onChange={(event) => {
                        setMaintenanceFilterSearch(event.target.value)
                        setMaintenanceModalPage(1)
                      }}
                    />
                    <select
                      className="staff-filter-select"
                      value={maintenanceFilterStatus}
                      onChange={(event) => {
                        setMaintenanceFilterStatus(event.target.value)
                        setMaintenanceModalPage(1)
                      }}
                    >
                      <option value="all">ทุกสถานะ</option>
                      <option value="pending">รอดำเนินการ</option>
                      <option value="in_progress">กำลังดำเนินการ</option>
                    </select>
                    <DateDropdowns
                      inline
                      selectClassName="staff-filter-select"
                      value={maintenanceFilterDate}
                      onChange={(date) => {
                        setMaintenanceFilterDate(date)
                        setMaintenanceModalPage(1)
                      }}
                    />
                    {maintenanceFilterDate && (
                      <button
                        type="button"
                        className="staff-action-btn is-ghost"
                        onClick={() => {
                          setMaintenanceFilterDate('')
                          setMaintenanceModalPage(1)
                        }}
                      >
                        ล้างวันที่
                      </button>
                    )}
                  </div>
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
                  ) : maintenanceRequests.length === 0 ? (
                    <p className="staff-empty">ไม่มีคำขอที่รอดำเนินการในขณะนี้</p>
                  ) : filteredMaintenanceRequests.length === 0 ? (
                    <p className="staff-empty">ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
                  ) : (
                    <div className="staff-requests-list">
                      {filteredMaintenanceRequests.slice(0, REQUEST_PREVIEW_COUNT).map(renderMaintenanceRequestItem)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="staff-card">
              <div className="staff-card-header">
                <h2>รายจ่าย</h2>
                <div className="staff-card-header-actions">
                  <button type="button" className="staff-action-btn is-primary" onClick={openCreateExpense}>
                    + บันทึกรายจ่าย
                  </button>
                </div>
              </div>

              <div className="staff-card-body">
                {expensesError ? (
                  <div className="staff-inline-error">
                    <p className="staff-form-error staff-form-error-block">{expensesError}</p>
                    <button type="button" className="staff-action-btn is-ghost" onClick={() => loadExpenses(expensesPage)}>
                      ลองใหม่
                    </button>
                  </div>
                ) : expensesLoading ? (
                  <p className="staff-empty">กำลังโหลดข้อมูล...</p>
                ) : expenses.length === 0 ? (
                  <p className="staff-empty">ยังไม่มีรายการรายจ่าย</p>
                ) : (
                  <div className="table-responsive">
                    <table className="staff-table">
                      <thead>
                        <tr>
                          <th>วันที่</th>
                          <th>หมวดหมู่</th>
                          <th>รายละเอียด</th>
                          <th>บันทึกโดย</th>
                          <th>จำนวนเงิน</th>
                          <th>จัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense) => (
                          <tr key={expense.id}>
                            <td>{formatDate(expense.expense_date)}</td>
                            <td>{expense.category}</td>
                            <td>{expense.description || '-'}</td>
                            <td>{expense.recorded_by_name || '-'}</td>
                            <td>฿{formatCurrency(expense.amount)}</td>
                            <td>
                              <div className="staff-row-actions">
                                <button
                                  type="button"
                                  className="staff-action-btn is-ghost"
                                  onClick={() => openEditExpense(expense)}
                                >
                                  แก้ไข
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
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {expensesTotalPages > 1 && (
                  <div className="staff-pagination">
                    <span className="staff-pagination-info">
                      หน้า {expensesPage} / {expensesTotalPages}
                    </span>
                    <div className="staff-pagination-controls">
                      <button
                        type="button"
                        className="staff-action-btn is-ghost"
                        disabled={expensesPage <= 1}
                        onClick={() => loadExpenses(expensesPage - 1)}
                      >
                        ก่อนหน้า
                      </button>
                      <button
                        type="button"
                        className="staff-action-btn is-ghost"
                        disabled={expensesPage >= expensesTotalPages}
                        onClick={() => loadExpenses(expensesPage + 1)}
                      >
                        ถัดไป
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                  className="staff-action-btn is-danger"
                  disabled={expenseDeleting}
                  onClick={() => confirmDeleteExpense(requestClose)}
                >
                  {expenseDeleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                </button>
                <button
                  type="button"
                  className="staff-action-btn is-ghost"
                  disabled={expenseDeleting}
                  onClick={requestClose}
                >
                  ยกเลิก
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
          variant="confirm"
        >
          {(requestClose) => (
            <form
              className="staff-confirm-body"
              onSubmit={(event) => submitExpenseForm(event, requestClose)}
              noValidate
            >
              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="expense-category">
                  หมวดหมู่
                </label>
                <input
                  id="expense-category"
                  type="text"
                  className="staff-form-input"
                  placeholder="เช่น ค่าน้ำ, ค่าไฟ, ซ่อมบำรุง"
                  value={expenseForm.category}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                />
              </div>

              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="expense-description">
                  รายละเอียด (ไม่บังคับ)
                </label>
                <input
                  id="expense-description"
                  type="text"
                  className="staff-form-input"
                  value={expenseForm.description}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </div>

              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="expense-amount">
                  จำนวนเงิน (บาท)
                </label>
                <input
                  id="expense-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="staff-form-input no-spinner"
                  value={expenseForm.amount}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                />
              </div>

              <div className="staff-form-field">
                <label className="staff-form-label" htmlFor="expense-date">
                  วันที่
                </label>
                <DateDropdowns
                  id="expense-date"
                  selectClassName="staff-form-input"
                  value={expenseForm.expense_date}
                  onChange={(date) => setExpenseForm((prev) => ({ ...prev, expense_date: date }))}
                />
              </div>

              {expenseFormError && <p className="staff-form-error">{expenseFormError}</p>}
              <div className="staff-form-actions">
                <button type="submit" className="staff-action-btn is-primary" disabled={expenseSubmitting}>
                  {expenseSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {viewAllRequests === 'tenant' && (
        <Modal
          title="คำขอต่อสัญญา / แจ้งย้ายออก (ทั้งหมด)"
          onClose={() => {
            setViewAllRequests(null)
            setTenantFilterType('all')
            setTenantFilterSearch('')
            setTenantModalPage(1)
          }}
        >
          <div className="staff-filters staff-modal-filters">
            <input
              type="text"
              className="staff-search-input"
              placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
              value={tenantFilterSearch}
              onChange={(event) => {
                setTenantFilterSearch(event.target.value)
                setTenantModalPage(1)
              }}
            />
            <select
              className="staff-filter-select"
              value={tenantFilterType}
              onChange={(event) => {
                setTenantFilterType(event.target.value)
                setTenantModalPage(1)
              }}
            >
              <option value="all">ทุกประเภท</option>
              <option value="renew">ต่อสัญญา</option>
              <option value="moveout">แจ้งย้ายออก</option>
            </select>
          </div>

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
          title="คำขอแจ้งซ่อม (ทั้งหมด)"
          onClose={() => {
            setViewAllRequests(null)
            setMaintenanceModalPage(1)
            setMaintenanceFilterStatus('all')
            setMaintenanceFilterDate('')
            setMaintenanceFilterSearch('')
          }}
        >
          <div className="staff-filters staff-modal-filters">
            <input
              type="text"
              className="staff-search-input"
              placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
              value={maintenanceFilterSearch}
              onChange={(event) => {
                setMaintenanceFilterSearch(event.target.value)
                setMaintenanceModalPage(1)
              }}
            />
            <select
              className="staff-filter-select"
              value={maintenanceFilterStatus}
              onChange={(event) => {
                setMaintenanceFilterStatus(event.target.value)
                setMaintenanceModalPage(1)
              }}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="pending">รอดำเนินการ</option>
              <option value="in_progress">กำลังดำเนินการ</option>
            </select>
            <DateDropdowns
              inline
              selectClassName="staff-filter-select"
              value={maintenanceFilterDate}
              onChange={(date) => {
                setMaintenanceFilterDate(date)
                setMaintenanceModalPage(1)
              }}
            />
            {maintenanceFilterDate && (
              <button
                type="button"
                className="staff-action-btn is-ghost"
                onClick={() => {
                  setMaintenanceFilterDate('')
                  setMaintenanceModalPage(1)
                }}
              >
                ล้างวันที่
              </button>
            )}
          </div>

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
          title="ประวัติคำขอต่อสัญญา / แจ้งย้ายออก"
          onClose={() => {
            setShowTenantHistory(false)
            setTenantHistoryData([])
            setTenantHistoryTotal(0)
            setTenantHistoryPage(1)
            setTenantHistoryError('')
            setTenantHistorySearch('')
            setTenantHistoryStatusFilter('all')
          }}
        >
          <div className="staff-filters staff-modal-filters">
            <input
              type="text"
              className="staff-search-input"
              placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร..."
              value={tenantHistorySearch}
              onChange={(event) => {
                const value = event.target.value
                setTenantHistorySearch(value)
                setTenantHistoryPage(1)
                loadTenantHistory(1, value, tenantHistoryStatusFilter)
              }}
            />
            <select
              className="staff-filter-select"
              value={tenantHistoryStatusFilter}
              onChange={(event) => {
                const value = event.target.value
                setTenantHistoryStatusFilter(value)
                setTenantHistoryPage(1)
                loadTenantHistory(1, tenantHistorySearch, value)
              }}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="rejected">ปฏิเสธแล้ว</option>
            </select>
          </div>

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
                  <div key={request.id} className="staff-request-item">
                    <div className="staff-request-main">
                      <div className="staff-request-headline">
                        <span className={`staff-badge type-${request.type}`}>
                          {TENANT_REQUEST_TYPE_LABEL[request.type] || request.type}
                        </span>
                        <span className="staff-request-room">ห้อง {request.room_number}</span>
                        <span className="staff-request-tenant">
                          {request.first_name} {request.last_name}
                        </span>
                        <span className="staff-status-break" aria-hidden="true" />
                        <span className={`staff-badge status-${request.status} staff-status-end`}>
                          {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
                        </span>
                      </div>
                      <div className="staff-request-meta">
                        {request.type === 'renew' && (
                          <>
                            <span>
                              ขอต่อ{' '}
                              {RENEW_DURATION_LABEL[request.renew_duration_months] ||
                                `${request.renew_duration_months} เดือน`}
                            </span>
                            <span>
                              {RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type}
                            </span>
                          </>
                        )}
                        {request.phone && <span>โทร {request.phone}</span>}
                      </div>
                      {request.note && <p className="staff-request-note">หมายเหตุ: {request.note}</p>}
                      <div className="staff-request-timeline">
                        <p className="staff-request-date is-submitted">
                          <span className="staff-request-date-label">ส่งคำขอ</span>
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
                          <p
                            className={`staff-request-date is-${request.status === 'approved' ? 'approved' : 'rejected'}`}
                          >
                            <span className="staff-request-date-label">
                              {request.status === 'approved' ? 'อนุมัติโดย' : 'ปฏิเสธโดย'}{' '}
                              <span className="staff-request-date-staff">{request.completed_by_name}</span>
                            </span>
                            <span className="staff-request-date-value">{formatDateTime(request.completed_at)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
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
          title="ประวัติคำขอแจ้งซ่อม"
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
          <div className="staff-filters staff-modal-filters">
            <input
              type="text"
              className="staff-search-input"
              placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า, เบอร์โทร, รายละเอียด..."
              value={maintenanceHistorySearch}
              onChange={(event) => {
                const value = event.target.value
                setMaintenanceHistorySearch(value)
                setMaintenanceHistoryPage(1)
                loadMaintenanceHistory(1, value, maintenanceHistoryStatusFilter)
              }}
            />
            <select
              className="staff-filter-select"
              value={maintenanceHistoryStatusFilter}
              onChange={(event) => {
                const value = event.target.value
                setMaintenanceHistoryStatusFilter(value)
                setMaintenanceHistoryPage(1)
                loadMaintenanceHistory(1, maintenanceHistorySearch, value)
              }}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="done">เสร็จสิ้น</option>
              <option value="cancelled">ยกเลิกแล้ว</option>
            </select>
          </div>

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
                  <div key={request.id} className="staff-request-item is-maintenance">
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
                <a href={historySlip.slip_path} target="_blank" rel="noreferrer" title="คลิกเพื่อดูรูปขนาดเต็ม">
                  <img src={historySlip.slip_path} alt="สลิปโอนเงิน" />
                </a>
                <span className="payment-slip-image-hint">คลิกที่รูปเพื่อดูขนาดเต็ม</span>
              </div>

              <dl className="payment-slip-details">
                <div className="payment-slip-amount">
                  <dt>จำนวนเงิน</dt>
                  <dd>฿{formatCurrency(historySlip.amount)}</dd>
                </div>
                <div>
                  <dt>ผู้เช่า</dt>
                  <dd>{historySlip.tenantName}</dd>
                </div>
                <div>
                  <dt>รายการ</dt>
                  <dd>{PAYMENT_TYPE_LABEL[historySlip.type] || 'ค่าเช่าห้อง'}</dd>
                </div>
                <div>
                  <dt>สถานะ</dt>
                  <dd>{PAYMENT_STATUS_LABEL[historySlip.status] || historySlip.status}</dd>
                </div>
                <div>
                  <dt>วันที่</dt>
                  <dd>{formatDateTime(historySlip.created_at)}</dd>
                </div>
              </dl>
            </div>

            <footer className="payment-slip-footer">
              <button type="button" className="staff-action-btn is-ghost" onClick={() => setHistorySlipClosing(true)}>
                ปิด
              </button>
            </footer>
          </section>
        </div>
      )}

      {historyRoom && (
        <Modal
          title={`ประวัติการจ่ายเงิน - ห้อง ${historyRoom.room_number}`}
          onClose={() => {
            setHistorySlip(null)
            setHistoryRoom(null)
            setHistorySearch('')
            setHistoryStatusFilter('all')
            setHistoryPage(1)
          }}
          variant="wide"
        >
          {historyLoading ? (
            <p className="staff-empty">กำลังโหลดข้อมูล...</p>
          ) : historyError ? (
            <p className="staff-form-error">{historyError}</p>
          ) : !historyData || historyData.length === 0 ? (
            <p className="staff-empty">ยังไม่มีประวัติการจ่ายเงินห้องนี้</p>
          ) : (
            <>
              <div className="staff-filters staff-modal-filters">
                <input
                  type="text"
                  className="staff-search-input"
                  placeholder="ค้นหาผู้เช่า, จำนวนเงิน, หมายเหตุ..."
                  value={historySearch}
                  onChange={(event) => {
                    setHistorySearch(event.target.value)
                    setHistoryPage(1)
                  }}
                />
                <select
                  className="staff-filter-select"
                  value={historyStatusFilter}
                  onChange={(event) => {
                    setHistoryStatusFilter(event.target.value)
                    setHistoryPage(1)
                  }}
                >
                  <option value="all">ทุกสถานะ</option>
                  <option value="paid">ชำระแล้ว</option>
                  <option value="pending">รอชำระ</option>
                  <option value="overdue">ค้างชำระ</option>
                </select>
              </div>

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
                        แสดง {(currentHistoryPage - 1) * PAYMENT_HISTORY_PAGE_SIZE + 1}-
                        {Math.min(currentHistoryPage * PAYMENT_HISTORY_PAGE_SIZE, filteredHistoryPayments.length)} จาก{' '}
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
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-icon is-money">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.7-2.5 1.7-2.5.6-2.5 1.8 1.1 2 2.5 2 2.5-.8 2.5-2" />
                </svg>
              </div>
              <p className="staff-confirm-message">ยืนยันการเก็บเงินค่าเช่า</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{collectRoom.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {collectRoom.tenant ? `${collectRoom.tenant.first_name} ${collectRoom.tenant.last_name}` : '-'}
                  </strong>
                </div>
              </div>
              {collectRoom.currentDue && (
                <>
                  {collectRoom.currentDue.items?.length > 1 && (
                    <div className="staff-confirm-details">
                      {collectRoom.currentDue.items.map((item, index) => (
                        <div className="staff-confirm-detail-row" key={item.id ?? `${item.type}-${index}`}>
                          <span>{item.label}</span>
                          <strong>฿{formatCurrency(item.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="staff-confirm-amount-block">
                    <p className="staff-confirm-amount-label">ยอดที่ต้องชำระ</p>
                    <p className="staff-confirm-amount">
                      <span className="staff-confirm-amount-symbol">฿</span>
                      {formatCurrency(collectRoom.currentDue.amount)}
                    </p>
                  </div>
                </>
              )}
              {collectError && <p className="staff-form-error">{collectError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={collectSubmitting}
                  onClick={handleCollectPayment}
                >
                  {collectSubmitting ? 'กำลังบันทึก...' : 'ยืนยันเก็บเงิน'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {dueDetailRoom && (
        <Modal
          title={`รายการค้างชำระ - ห้อง ${dueDetailRoom.room_number}`}
          onClose={() => setDueDetailRoom(null)}
          variant="confirm"
        >
          {(requestClose) => (
            <div className="staff-confirm-body">
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{dueDetailRoom.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {dueDetailRoom.tenant
                      ? `${dueDetailRoom.tenant.first_name} ${dueDetailRoom.tenant.last_name}`
                      : '-'}
                  </strong>
                </div>
              </div>

              {dueDetailRoom.currentDue?.items?.length > 0 && (
                <div className="staff-confirm-details">
                  {dueDetailRoom.currentDue.items.map((item, index) => (
                    <div className="staff-confirm-detail-row" key={item.id ?? `${item.type}-${index}`}>
                      <span>{item.label}</span>
                      <strong>฿{formatCurrency(item.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}

              {dueDetailRoom.currentDue && (
                <div className="staff-confirm-amount-block">
                  <p className="staff-confirm-amount-label">ยอดค้างชำระรวม</p>
                  <p className="staff-confirm-amount">
                    <span className="staff-confirm-amount-symbol">฿</span>
                    {formatCurrency(dueDetailRoom.currentDue.amount)}
                  </p>
                </div>
              )}

              <div className="staff-due-detail-actions">
                <button
                  type="button"
                  className="staff-form-link-btn"
                  onClick={() => {
                    const room = dueDetailRoom
                    setDueDetailRoom(null)
                    openHistory(room)
                  }}
                >
                  ดูประวัติการจ่ายเงิน
                </button>

                <div className="staff-form-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
                    onClick={() => {
                      const room = dueDetailRoom
                      setDueDetailRoom(null)
                      openCollect(room)
                    }}
                  >
                    เก็บเงิน
                  </button>
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {utilityRoom && (
        <Modal
          title={`ส่งค่าน้ำ-ค่าไฟ - ห้อง ${utilityRoom.room_number}`}
          onClose={() => setUtilityRoom(null)}
          variant="confirm"
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
            const waterAmount = Number(utilityForm.water_amount)
            const total = electricityAmount + (Number.isFinite(waterAmount) && waterAmount > 0 ? waterAmount : 0)
            return (
              <div className="staff-confirm-body">
                <div className="staff-confirm-details">
                  <div className="staff-confirm-detail-row">
                    <span>ห้อง</span>
                    <strong>{utilityRoom.room_number}</strong>
                  </div>
                  <div className="staff-confirm-detail-row">
                    <span>ผู้เช่า</span>
                    <strong>
                      {utilityRoom.tenant ? `${utilityRoom.tenant.first_name} ${utilityRoom.tenant.last_name}` : '-'}
                    </strong>
                  </div>
                </div>

                <div className="staff-form-field">
                  <div className="staff-form-label-row">
                    <label className="staff-form-label" htmlFor="utility-electricity-input">
                      {isUnitsMode ? `ค่าไฟฟ้า (บาท/หน่วย ฿${formatCurrency(unitPrice)})` : 'ค่าไฟฟ้า (บาท)'}
                    </label>
                    <div className="staff-form-mode-switch">
                      <button
                        type="button"
                        className={`staff-form-mode-btn${isUnitsMode ? ' is-active' : ''}`}
                        onClick={() => setUtilityForm((prev) => ({ ...prev, electricity_mode: 'units' }))}
                      >
                        คิดตามหน่วย
                      </button>
                      <button
                        type="button"
                        className={`staff-form-mode-btn${!isUnitsMode ? ' is-active' : ''}`}
                        onClick={() => setUtilityForm((prev) => ({ ...prev, electricity_mode: 'amount' }))}
                      >
                        ราคาปกติ
                      </button>
                    </div>
                  </div>
                  {isUnitsMode ? (
                    <input
                      id="utility-electricity-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="staff-form-input no-spinner"
                      placeholder="เช่น 50 (หน่วย)"
                      value={utilityForm.electricity_units}
                      onChange={(event) =>
                        setUtilityForm((prev) => ({ ...prev, electricity_units: event.target.value }))
                      }
                    />
                  ) : (
                    <input
                      id="utility-electricity-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="staff-form-input no-spinner"
                      placeholder="เช่น 400 (บาท)"
                      value={utilityForm.electricity_amount}
                      onChange={(event) =>
                        setUtilityForm((prev) => ({ ...prev, electricity_amount: event.target.value }))
                      }
                    />
                  )}
                  {isUnitsMode && electricityAmount > 0 && (
                    <span className="staff-form-hint">คิดเป็น ฿{formatCurrency(electricityAmount)}</span>
                  )}
                </div>

                <div className="staff-form-field">
                  <label className="staff-form-label" htmlFor="utility-water-amount">
                    ค่าน้ำ (บาท)
                  </label>
                  <input
                    id="utility-water-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="staff-form-input no-spinner"
                    placeholder="เช่น 100"
                    value={utilityForm.water_amount}
                    onChange={(event) => setUtilityForm((prev) => ({ ...prev, water_amount: event.target.value }))}
                  />
                </div>

                {total > 0 && (
                  <div className="staff-confirm-amount-block">
                    <p className="staff-confirm-amount-label">ยอดรวมที่จะส่งให้ลูกค้า</p>
                    <p className="staff-confirm-amount">
                      <span className="staff-confirm-amount-symbol">฿</span>
                      {formatCurrency(total)}
                    </p>
                  </div>
                )}

                {utilityError && <p className="staff-form-error">{utilityError}</p>}
                <div className="staff-form-actions">
                  <button
                    type="button"
                    className="staff-action-btn is-primary"
                    disabled={utilitySubmitting}
                    onClick={handleSendUtilityBill}
                  >
                    {utilitySubmitting ? 'กำลังส่ง...' : 'ส่งบิล'}
                  </button>
                  <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                    ยกเลิก
                  </button>
                </div>
              </div>
            )
          }}
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
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {moveoutConfirmRequest && (
        <Modal title="ยืนยันการย้ายออก" onClose={() => setMoveoutConfirmRequest(null)} variant="confirm">
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
              <p className="staff-confirm-message">ยืนยันอนุมัติการย้ายออก</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{moveoutConfirmRequest.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {moveoutConfirmRequest.first_name} {moveoutConfirmRequest.last_name}
                  </strong>
                </div>
              </div>
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
                <p>การดำเนินการนี้จะระงับบัญชีผู้เช่ารายนี้ และเปลี่ยนสถานะห้องเป็นว่างทันที</p>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `tenant-${moveoutConfirmRequest.id}`}
                  onClick={handleConfirmMoveoutApproval}
                >
                  {processingRequestKey === `tenant-${moveoutConfirmRequest.id}`
                    ? 'กำลังดำเนินการ...'
                    : 'ยืนยันอนุมัติ'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {renewApproveConfirm && (
        <Modal title="ยืนยันการอนุมัติต่อสัญญา" onClose={() => setRenewApproveConfirm(null)} variant="confirm">
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
                <div className="staff-confirm-detail-row">
                  <span>ระยะเวลา</span>
                  <strong>
                    {RENEW_DURATION_LABEL[renewApproveConfirm.renew_duration_months] ||
                      `${renewApproveConfirm.renew_duration_months} เดือน`}
                  </strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `tenant-${renewApproveConfirm.id}`}
                  onClick={handleConfirmRenewApproval}
                >
                  {processingRequestKey === `tenant-${renewApproveConfirm.id}` ? 'กำลังดำเนินการ...' : 'ยืนยันอนุมัติ'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {moveoutAcknowledgeConfirm && (
        <Modal title="ยืนยันรับเรื่องแจ้งย้ายออก" onClose={() => setMoveoutAcknowledgeConfirm(null)} variant="confirm">
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
              <p className="staff-confirm-message">ยืนยันรับเรื่องคำขอแจ้งย้ายออก</p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{moveoutAcknowledgeConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {moveoutAcknowledgeConfirm.first_name} {moveoutAcknowledgeConfirm.last_name}
                  </strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `tenant-${moveoutAcknowledgeConfirm.id}`}
                  onClick={handleConfirmMoveoutAcknowledge}
                >
                  {processingRequestKey === `tenant-${moveoutAcknowledgeConfirm.id}`
                    ? 'กำลังดำเนินการ...'
                    : 'ยืนยันรับเรื่อง'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {tenantRejectConfirm && (
        <Modal title="ยืนยันการปฏิเสธคำขอ" onClose={() => setTenantRejectConfirm(null)} variant="confirm">
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
              <p className="staff-confirm-message">
                ยืนยันปฏิเสธคำขอ{TENANT_REQUEST_TYPE_LABEL[tenantRejectConfirm.type] || ''}
              </p>
              <div className="staff-confirm-details">
                <div className="staff-confirm-detail-row">
                  <span>ห้อง</span>
                  <strong>{tenantRejectConfirm.room_number}</strong>
                </div>
                <div className="staff-confirm-detail-row">
                  <span>ผู้เช่า</span>
                  <strong>
                    {tenantRejectConfirm.first_name} {tenantRejectConfirm.last_name}
                  </strong>
                </div>
              </div>
              {requestsError && <p className="staff-form-error">{requestsError}</p>}
              <div className="staff-form-actions">
                <button
                  type="button"
                  className="staff-action-btn is-primary"
                  disabled={processingRequestKey === `tenant-${tenantRejectConfirm.id}`}
                  onClick={handleConfirmTenantReject}
                >
                  {processingRequestKey === `tenant-${tenantRejectConfirm.id}` ? 'กำลังดำเนินการ...' : 'ยืนยันปฏิเสธ'}
                </button>
                <button type="button" className="staff-action-btn is-ghost" onClick={requestClose}>
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default StaffMain
