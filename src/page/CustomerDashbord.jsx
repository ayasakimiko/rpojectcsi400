import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/CustomerDashbord.css'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import { PackageIcon } from '../components/ParcelIcons.jsx'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'

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

const PROFILE_FIELD_ICONS = {
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
}

// One labelled text box for the profile form: an icon on the left, a show/hide button for passwords,
// and a small hint underneath that turns red or green as the value is checked.
function ProfileField({ id, label, icon, hint, hintTone, invalid, type = 'text', ...inputProps }) {
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="profile-field">
      <label htmlFor={id}>{label}</label>
      <div className={`profile-field-control${invalid ? ' is-invalid' : ''}`}>
        <svg
          className="profile-field-icon"
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
          {PROFILE_FIELD_ICONS[icon]}
        </svg>
        <input id={id} type={isPassword && revealed ? 'text' : type} aria-invalid={invalid || undefined} {...inputProps} />
        {isPassword && (
          <button
            type="button"
            className="profile-field-toggle"
            aria-label={revealed ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
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
              {revealed ? (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>
      {hint && <small className={`profile-field-hint${hintTone ? ` is-${hintTone}` : ''}`}>{hint}</small>}
    </div>
  )
}

const SLIP_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const SLIP_MAX_BYTES = 5 * 1024 * 1024

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// A framed area for attaching the payment slip: click it to browse, or drag an image onto it.
const MAINTENANCE_MAX_PHOTOS = 6
const MAINTENANCE_MAX_PHOTO_BYTES = 5 * 1024 * 1024

function formatPhotoSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function MaintenancePhotoPicker({ id, files, onChange, onError }) {
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
    const withinSize = images.filter((file) => file.size <= MAINTENANCE_MAX_PHOTO_BYTES)
    const room = MAINTENANCE_MAX_PHOTOS - files.length
    const accepted = withinSize.slice(0, Math.max(0, room))
    if (images.length < list.length) onError('เลือกได้เฉพาะไฟล์รูปภาพ')
    else if (withinSize.length < images.length) onError('รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป')
    else if (accepted.length < withinSize.length) onError(`แนบรูปได้ไม่เกิน ${MAINTENANCE_MAX_PHOTOS} รูป`)
    else onError('')
    if (accepted.length > 0) onChange([...files, ...accepted])
  }

  const dragsFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')

  return (
    <div
      className={`maint-photo-field${dragging ? ' is-dragging' : ''}`}
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
        id={id}
        className="maint-photo-input"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />
      {files.length === 0 ? (
        <label htmlFor={id} className="maint-photo-dropzone">
          <span className="maint-photo-dropzone-icon" aria-hidden="true">
            <svg
              width="22"
              height="22"
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
          <span className="maint-photo-dropzone-title">
            {dragging ? 'ปล่อยรูปที่นี่' : 'ลากรูปมาวางที่นี่ หรือ '}
            {!dragging && <span className="maint-photo-dropzone-link">คลิกเพื่อเลือกรูป</span>}
          </span>
          <span className="maint-photo-dropzone-hint">สูงสุด {MAINTENANCE_MAX_PHOTOS} รูป รูปละไม่เกิน 5 MB</span>
        </label>
      ) : (
        <div className="maint-photo-grid">
          {files.map((file, index) => (
            <figure className="maint-photo-tile" key={`${file.name}-${index}`}>
              <img src={previewUrls[index]} alt={`รูปที่แนบ ${index + 1}`} />
              <figcaption title={file.name}>
                <span>{file.name}</span>
                <small>{formatPhotoSize(file.size)}</small>
              </figcaption>
              <button
                type="button"
                className="maint-photo-remove"
                aria-label={`ลบรูป ${file.name}`}
                onClick={() => {
                  onError('')
                  onChange(files.filter((_, fileIndex) => fileIndex !== index))
                }}
              >
                <svg
                  width="12"
                  height="12"
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
          {files.length < MAINTENANCE_MAX_PHOTOS && (
            <label htmlFor={id} className="maint-photo-add">
              <span aria-hidden="true">+</span>
              <small>{dragging ? 'ปล่อยเพื่อเพิ่ม' : 'เพิ่มรูป'}</small>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

function SlipDropZone({ id, file, onChange, onError }) {
  const [dragging, setDragging] = useState(false)
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  const acceptFiles = (files) => {
    const list = Array.from(files || [])
    if (list.length === 0) return
    if (list.length > 1) {
      onError('แนบสลิปได้ครั้งละ 1 ไฟล์')
      return
    }
    const [picked] = list
    if (!SLIP_ACCEPTED_TYPES.includes(picked.type)) {
      onError('ไฟล์สลิปต้องเป็น JPG, PNG หรือ WebP เท่านั้น')
      return
    }
    if (picked.size > SLIP_MAX_BYTES) {
      onError('ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB')
      return
    }
    onError('')
    onChange(picked)
  }

  const dragsFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')

  return (
    <div
      className={`slip-field${dragging ? ' is-dragging' : ''}`}
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
        acceptFiles(event.dataTransfer?.files)
      }}
    >
      <input
        id={id}
        className="slip-input"
        type="file"
        accept={SLIP_ACCEPTED_TYPES.join(',')}
        onChange={(event) => {
          acceptFiles(event.target.files)
          event.target.value = ''
        }}
      />
      {file ? (
        <div className="slip-preview">
          <img className="slip-preview-image" src={previewUrl} alt="ตัวอย่างสลิปที่แนบ" />
          <div className="slip-preview-info">
            <strong title={file.name}>{file.name}</strong>
            <span>{formatFileSize(file.size)}</span>
            {dragging && <span className="slip-preview-replace">ปล่อยเพื่อเปลี่ยนเป็นไฟล์ใหม่</span>}
          </div>
          <div className="slip-preview-actions">
            <label htmlFor={id} className="slip-preview-btn">
              เปลี่ยนไฟล์
            </label>
            <button type="button" className="slip-preview-btn is-remove" onClick={() => onChange(null)}>
              ลบ
            </button>
          </div>
        </div>
      ) : (
        <label htmlFor={id} className="slip-dropzone">
          <span className="slip-dropzone-icon" aria-hidden="true">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <span className="slip-dropzone-title">
            {dragging ? 'ปล่อยไฟล์ที่นี่เพื่อแนบสลิป' : 'ลากรูปสลิปมาวางที่นี่'}
          </span>
          <span className="slip-dropzone-sub">
            หรือ <span className="slip-dropzone-link">คลิกเพื่อเลือกไฟล์</span>
          </span>
          <span className="slip-dropzone-hint">JPG, PNG หรือ WebP ไม่เกิน 5 MB</span>
        </label>
      )}
    </div>
  )
}

const PAYMENT_TYPE_LABEL = {
  rent: 'ค่าเช่าห้อง',
  deposit: 'เงินประกัน',
  water: 'ค่าน้ำ',
  electricity: 'ค่าไฟฟ้า',
}

const AMENITIES = [
  { key: 'air_conditioner', label: 'แอร์', color: 'blue' },
  { key: 'wifi', label: 'ไวไฟ', color: 'purple' },
  { key: 'refrigerator', label: 'ตู้เย็น', color: 'teal' },
  { key: 'bathroom', label: 'ห้องน้ำในตัว', color: 'amber' },
  { key: 'cctv', label: 'กล้องวงจรปิด', color: 'red' },
]

const AMENITY_ICON_PATHS = {
  air_conditioner: (
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
  ),
  wifi: (
    <>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </>
  ),
  refrigerator: (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="5" y1="10" x2="19" y2="10" />
      <line x1="9" y1="6" x2="9" y2="8" />
      <line x1="9" y1="14" x2="9" y2="16" />
    </>
  ),
  bathroom: <path d="M12 2.69 17.66 8.35a8 8 0 1 1-11.31 0z" />,
  cctv: (
    <>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </>
  ),
  bed: (
    <>
      <path d="M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6" />
      <path d="M2 21v-3" />
      <path d="M22 21v-3" />
      <path d="M6 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
    </>
  ),
}

function AmenityIcon({ name }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {AMENITY_ICON_PATHS[name]}
    </svg>
  )
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
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

  return (
    <div
      className={`dashboard-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={() => {
        if (isClosing) onClose()
      }}
    >
      <div
        className={`dashboard-modal${variant === 'confirm' || variant === 'success' ? ' dashboard-modal-confirm' : ''}${variant === 'success' ? ' dashboard-modal-success' : ''}${variant === 'status' ? ' dashboard-modal-confirm dashboard-modal-status' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dashboard-modal-header">
          <h3>{title}</h3>
          <button type="button" className="dashboard-modal-close" onClick={requestClose} aria-label="ปิด">
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
        <div className="dashboard-modal-body">
          {typeof children === 'function' ? children(requestClose) : children}
        </div>
      </div>
    </div>
  )
}

function ReceiptTemplate({ receiptRequest, customer }) {
  if (!receiptRequest) return null
  const { mode, entry } = receiptRequest
  const payments = mode === 'single' ? [receiptRequest.payment] : entry.payments
  const paidTotal = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const grandTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const receiptNo =
    mode === 'single' ? `RCPT-${String(receiptRequest.payment.id).padStart(6, '0')}` : `RCPT-B${entry.booking_id}-ALL`

  return (
    <div
      style={{
        width: 780,
        minHeight: 1103,
        boxSizing: 'border-box',
        padding: 40,
        background: '#ffffff',
        color: '#0f2b52',
        fontFamily: '"Tahoma", "Segoe UI", "Leelawadee UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>ใบเสร็จรับเงิน</div>
          <div style={{ fontSize: 13, color: '#6b859e', marginTop: 2 }}>
            {mode === 'single' ? 'รายการชำระเงินรายการเดียว' : 'สรุปรายการชำระเงินทั้งหมด'}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#6b859e' }}>
          <div>เลขที่: {receiptNo}</div>
          <div>วันที่ออกใบเสร็จ: {formatDateTime(new Date())}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, fontSize: 13 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>ผู้เช่า</div>
          <div>
            {customer.first_name} {customer.last_name}
          </div>
          {customer.phone && <div>โทร: {customer.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>ห้องพัก</div>
          <div>ห้อง {entry.room_number}</div>
          {entry.rental_start_date && entry.rental_end_date && (
            <div>
              {formatDate(entry.rental_start_date)} - {formatDate(entry.rental_end_date)}
            </div>
          )}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {['วันที่ชำระ', 'รายการ', 'จำนวนเงิน', 'สถานะ', 'หมายเหตุ'].map((head) => (
              <th
                key={head}
                style={{
                  textAlign: head === 'จำนวนเงิน' ? 'right' : 'left',
                  borderBottom: '1.5px solid #0f2b52',
                  padding: '6px 8px',
                  color: '#33506f',
                }}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #e6f0fd' }}>
                {formatDateTime(payment.created_at)}
              </td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #e6f0fd' }}>
                {PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง'}
              </td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #e6f0fd', textAlign: 'right' }}>
                ฿{formatCurrency(payment.amount)}
              </td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #e6f0fd' }}>
                {STATUS_LABEL[payment.status] || payment.status}
              </td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #e6f0fd' }}>{formatCustomerNote(payment.note)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <div style={{ width: 260, fontSize: 13 }}>
          {mode === 'all' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#6b859e' }}>
              <span>ยอดรวมทั้งหมด</span>
              <span>฿{formatCurrency(grandTotal)}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderTop: '1.5px solid #0f2b52',
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            <span>ยอดชำระแล้ว</span>
            <span>฿{formatCurrency(paidTotal)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 48, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <div style={{ color: '#6b859e' }}>เอกสารนี้สร้างโดยระบบอัตโนมัติ</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #6b859e', width: 160, marginBottom: 4 }}>&nbsp;</div>
          <div>ผู้รับเงิน</div>
        </div>
      </div>
    </div>
  )
}

const FAKE_QR_SIZE = 21

function isInFinderPattern(row, col, size) {
  const corners = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]
  return corners.some(([r, c]) => row >= r && row < r + 7 && col >= c && col < c + 7)
}

function finderModuleOn(row, col, size) {
  const corners = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]
  for (const [r0, c0] of corners) {
    if (row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7) {
      const localRow = row - r0
      const localCol = col - c0
      const ring = localRow === 0 || localRow === 6 || localCol === 0 || localCol === 6
      const core = localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4
      return ring || core
    }
  }
  return false
}

function pseudoRandomModuleOn(row, col) {
  const value = Math.sin(row * 12.9898 + col * 78.233) * 43758.5453
  return value - Math.floor(value) > 0.55
}

function FakeQrCode() {
  const modules = []
  for (let row = 0; row < FAKE_QR_SIZE; row++) {
    for (let col = 0; col < FAKE_QR_SIZE; col++) {
      const on = isInFinderPattern(row, col, FAKE_QR_SIZE)
        ? finderModuleOn(row, col, FAKE_QR_SIZE)
        : pseudoRandomModuleOn(row, col)
      if (on) modules.push(`${row}-${col}`)
    }
  }

  return (
    <svg
      viewBox={`0 0 ${FAKE_QR_SIZE} ${FAKE_QR_SIZE}`}
      className="dashboard-fake-qr"
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR สำหรับสแกนชำระเงิน"
    >
      <rect width={FAKE_QR_SIZE} height={FAKE_QR_SIZE} fill="#fff" />
      {modules.map((key) => {
        const [row, col] = key.split('-').map(Number)
        return <rect key={key} x={col} y={row} width={1} height={1} fill="#0f2b52" />
      })}
    </svg>
  )
}

const STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอชำระ',
  overdue: 'ค้างชำระ',
  rejected: 'สลิปไม่ผ่าน',
}

const DUE_STATUS_LABEL = {
  paid: 'ชำระแล้ว',
  pending: 'รอตรวจสอบ',
  due: 'ยังไม่ครบกำหนด',
  overdue: 'ค้างชำระ',
}

function dueBadgeClass(status) {
  if (status === 'paid') return 'paid'
  if (status === 'overdue') return 'overdue'
  if (status === 'pending') return 'pending'
  return 'due'
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
  rejected: 'ปฏิเสธ',
}

const RENEW_DURATION_OPTIONS = [
  { value: '1', label: '1 เดือน' },
  { value: '3', label: '3 เดือน' },
  { value: '6', label: '6 เดือน' },
  { value: '12', label: '1 ปี (12 เดือน)' },
]

const RENEW_PAYMENT_TYPE_OPTIONS = [
  { value: 'monthly', label: 'จ่ายรายเดือน' },
  { value: 'lump_sum', label: 'จ่ายล่วงหน้าทั้งก้อน' },
]

const RENEW_DURATION_LABEL = Object.fromEntries(RENEW_DURATION_OPTIONS.map((option) => [option.value, option.label]))
const RENEW_PAYMENT_TYPE_LABEL = Object.fromEntries(
  RENEW_PAYMENT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
)

const MOVE_ROOM_REASON_OPTIONS = [
  { value: 'room_problem', label: 'ห้องเดิมมีปัญหา/ชำรุด' },
  { value: 'price', label: 'ต้องการห้องราคาที่เหมาะสมขึ้น' },
  { value: 'amenities', label: 'ต้องการสิ่งอำนวยความสะดวกเพิ่ม' },
  { value: 'location', label: 'ต้องการชั้นหรือตำแหน่งที่สะดวกขึ้น' },
  { value: 'noise', label: 'เสียงดัง/ปัญหาเพื่อนบ้าน' },
  { value: 'other', label: 'อื่นๆ (ระบุในหมายเหตุ)' },
]
const MOVE_ROOM_REASON_LABEL = Object.fromEntries(MOVE_ROOM_REASON_OPTIONS.map((option) => [option.value, option.label]))
const MOVE_ROOM_MAX_DAYS_AHEAD = 60

function formatDateOnly(value) {
  if (!value) return '-'
  return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatRentDiff(from, to) {
  if (from == null || to == null) return null
  const diff = Number(to) - Number(from)
  if (!Number.isFinite(diff)) return null
  if (diff === 0) return { tone: 'same', label: 'ค่าเช่าเท่าเดิม' }
  return {
    tone: diff > 0 ? 'up' : 'down',
    label: `${diff > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ฿${formatCurrency(Math.abs(diff))}/เดือน`,
  }
}

function MoveRoomPreview({ currentRoom, targetRoom }) {
  if (!targetRoom) return null
  const rentDiff = formatRentDiff(currentRoom?.price, targetRoom.price)
  const amenities = AMENITIES.filter((amenity) => targetRoom[amenity.key])
  return (
    <div className="dashboard-move-preview">
      <div className="dashboard-move-preview-head">
        <div>
          <span className="dashboard-move-preview-label">ห้องที่เลือก</span>
          <strong className="dashboard-move-preview-room">ห้อง {targetRoom.room_number}</strong>
        </div>
        <div className="dashboard-move-preview-price">
          <strong>฿{formatCurrency(targetRoom.price)}</strong>
          <span>/เดือน</span>
        </div>
      </div>
      {rentDiff && <span className={`dashboard-move-diff is-${rentDiff.tone}`}>{rentDiff.label} จากห้องปัจจุบัน</span>}
      <div className="dashboard-move-preview-tags">
        <span>ไฟ ฿{formatCurrency(targetRoom.electricity_unit_price)}/หน่วย</span>
        <span>น้ำ ฿{formatCurrency(targetRoom.water_price)}/เดือน</span>
        {Number(targetRoom.bed) > 0 && <span>เตียง {targetRoom.bed}</span>}
        {amenities.map((amenity) => (
          <span key={amenity.key}>{amenity.label}</span>
        ))}
      </div>
    </div>
  )
}

function tenantRequestBadgeClass(status) {
  if (status === 'approved') return 'paid'
  if (status === 'rejected') return 'overdue'
  if (status === 'in_progress') return 'in-progress'
  return 'pending'
}

const MOVEOUT_APPROVED_CONTACT_MESSAGE =
  'คำขอแจ้งย้ายออกของคุณได้รับการอนุมัติแล้ว กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อดำเนินการคืนกุญแจและตรวจสอบเงินประกันคืน'

const MOVEOUT_IN_PROGRESS_CONTACT_MESSAGE =
  'เจ้าหน้าที่รับเรื่องแจ้งย้ายออกของคุณแล้ว กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อพูดคุยรายละเอียดเพิ่มเติม'

const MOVEOUT_REJECTED_CONTACT_MESSAGE =
  'คำขอแจ้งย้ายออกของคุณถูกปฏิเสธ กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อสอบถามรายละเอียดเพิ่มเติม'

const MOVEOUT_STATUS_POPUP_CONTENT = {
  pending: {
    title: 'รอดำเนินการ',
    message: 'ส่งคำขอแจ้งย้ายออกเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบและติดต่อกลับ',
    icon: 'info',
  },
  in_progress: { title: 'เจ้าหน้าที่รับเรื่องแล้ว', message: MOVEOUT_IN_PROGRESS_CONTACT_MESSAGE, icon: 'info' },
  approved: { title: 'แจ้งย้ายออกได้รับการอนุมัติ', message: MOVEOUT_APPROVED_CONTACT_MESSAGE, icon: 'success' },
  rejected: { title: 'คำขอแจ้งย้ายออกไม่ได้รับการอนุมัติ', message: MOVEOUT_REJECTED_CONTACT_MESSAGE, icon: 'danger' },
}

const MOVE_ROOM_STATUS_POPUP_CONTENT = {
  pending: {
    title: 'รอดำเนินการ',
    message: 'ส่งคำขอย้ายห้องแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบห้องปลายทาง',
    icon: 'info',
  },
  in_progress: {
    title: 'เจ้าหน้าที่รับเรื่องแล้ว',
    message: 'เจ้าหน้าที่รับเรื่องคำขอย้ายห้องแล้ว กรุณารอผลการตรวจสอบ',
    icon: 'info',
  },
  approved: {
    title: 'ย้ายห้องสำเร็จ',
    message: 'คำขอย้ายห้องได้รับการอนุมัติแล้ว ห้องพักของคุณได้รับการเปลี่ยนเรียบร้อย',
    icon: 'success',
  },
  rejected: {
    title: 'คำขอย้ายห้องไม่ได้รับการอนุมัติ',
    message: 'คำขอย้ายห้องไม่ได้รับการอนุมัติ กรุณาติดต่อเจ้าหน้าที่หากต้องการสอบถามเพิ่มเติม',
    icon: 'danger',
  },
}

const RENEW_RESUBMIT_WINDOW_MS = 10 * 24 * 60 * 60 * 1000

const RENEW_STATUS_POPUP_CONTENT = {
  pending: {
    title: 'รอดำเนินการ',
    message: 'ส่งคำขอต่อสัญญาเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบและติดต่อกลับ',
    icon: 'info',
  },
  in_progress: {
    title: 'เจ้าหน้าที่รับเรื่องแล้ว',
    message: 'เจ้าหน้าที่รับเรื่องคำขอต่อสัญญาของคุณแล้ว กรุณารอการติดต่อกลับจากเจ้าหน้าที่',
    icon: 'info',
  },
  approved: {
    title: 'ต่อสัญญาสำเร็จ',
    message: 'คำขอต่อสัญญาของคุณได้รับการอนุมัติแล้ว ระบบได้ขยายระยะเวลาสัญญาเช่าให้เรียบร้อยแล้ว',
    icon: 'success',
  },
}

const MAINTENANCE_STATUS_POPUP_CONTENT = {
  pending: {
    title: 'รอดำเนินการ',
    message: 'รายการแจ้งซ่อมของคุณอยู่ระหว่างรอเจ้าหน้าที่รับเรื่อง กรุณารอการติดต่อกลับจากเจ้าหน้าที่',
    icon: 'info',
  },
  in_progress: {
    title: 'เจ้าหน้าที่รับเรื่องแล้ว',
    message: 'เจ้าหน้าที่รับเรื่องแจ้งซ่อมของคุณแล้ว กำลังดำเนินการซ่อมแซม',
    icon: 'info',
  },
  done: {
    title: 'ซ่อมเสร็จสิ้นแล้ว',
    message: 'การแจ้งซ่อมของคุณดำเนินการเสร็จสิ้นแล้ว ขอบคุณที่แจ้งให้เราทราบ',
    icon: 'success',
  },
  cancelled: {
    title: 'รายการแจ้งซ่อมถูกยกเลิก',
    message: 'รายการแจ้งซ่อมของคุณถูกยกเลิกโดยเจ้าหน้าที่ กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์หากต้องการสอบถามเพิ่มเติม',
    icon: 'danger',
  },
}

const CONTRACT_STATUS_POPUP_CONTENT = {
  warning: {
    title: 'สัญญาใกล้หมดอายุ',
    message: 'สัญญาเช่าห้องของคุณใกล้ครบกำหนดแล้ว กรุณาต่อสัญญาหรือแจ้งย้ายออกล่วงหน้า',
    icon: 'info',
  },
  final: {
    title: 'สัญญาใกล้หมดอายุมากแล้ว',
    message: 'สัญญาเช่าห้องของคุณกำลังจะหมดอายุในอีกไม่กี่วัน กรุณาดำเนินการต่อสัญญาหรือแจ้งย้ายออกโดยเร็วที่สุด',
    icon: 'danger',
  },
}

const STATUS_POPUP_CONTENT_BY_KIND = {
  moveout: MOVEOUT_STATUS_POPUP_CONTENT,
  move_room: MOVE_ROOM_STATUS_POPUP_CONTENT,
  renew: RENEW_STATUS_POPUP_CONTENT,
  maintenance: MAINTENANCE_STATUS_POPUP_CONTENT,
  contract: CONTRACT_STATUS_POPUP_CONTENT,
}

function StatusIconPaths({ tone }) {
  if (tone === 'success') return <polyline points="20 6 9 17 4 12" />
  if (tone === 'danger') {
    return (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    )
  }
  return (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  )
}

const TENANT_REQUEST_NOTIF_INFO = {
  pending: { label: 'ส่งคำขอสำเร็จ', tone: 'info' },
  in_progress: { label: 'เจ้าหน้าที่รับเรื่องแล้ว', tone: 'info' },
  approved: { label: 'อนุมัติแล้ว', tone: 'success' },
  rejected: { label: 'ถูกปฏิเสธ', tone: 'danger' },
}

const MAINTENANCE_NOTIF_INFO = {
  pending: { label: 'แจ้งซ่อมสำเร็จ', tone: 'info' },
  in_progress: { label: 'กำลังดำเนินการ', tone: 'info' },
  done: { label: 'ซ่อมเสร็จสิ้นแล้ว', tone: 'success' },
  cancelled: { label: 'ถูกยกเลิก', tone: 'danger' },
}

const UTILITY_BILL_NOTIF_INFO = {
  water: { label: 'แจ้งบิลค่าน้ำใหม่ รอชำระ', tone: 'info' },
  electricity: { label: 'แจ้งบิลค่าไฟใหม่ รอชำระ', tone: 'info' },
}

const TENANT_REQUEST_FINAL_LOG_LABEL = {
  approved: 'อนุมัติคำขอ',
  rejected: 'ปฏิเสธคำขอ',
}

const MAINTENANCE_FINAL_LOG_LABEL = {
  done: 'ซ่อมเสร็จสิ้น',
  cancelled: 'ยกเลิกรายการ',
}

const REQUEST_TIMELINE_PENDING_FINAL_LABEL = 'รอผลดำเนินการ'

function StatusAlert({ content }) {
  if (!content) return null
  return (
    <div className={`dashboard-maintenance-alert is-${content.icon}`} role="status">
      <span className="dashboard-maintenance-alert-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <StatusIconPaths tone={content.icon} />
        </svg>
      </span>
      <div>
        <p className="dashboard-maintenance-alert-title">{content.title}</p>
        <p className="dashboard-maintenance-alert-message">{content.message}</p>
      </div>
    </div>
  )
}

function TenantRequestDetailCard({ request, roomNumber }) {
  return (
    <div className="dashboard-maintenance-detail-card">
      <h4 className="dashboard-detail-title">รายละเอียดคำขอ</h4>
      <div className="dashboard-maintenance-detail-row">
        <span>ประเภทคำขอ</span>
        <strong>{TENANT_REQUEST_TYPE_LABEL[request.type] || request.type}</strong>
      </div>
      {roomNumber && (
        <div className="dashboard-maintenance-detail-row">
          <span>ห้อง</span>
          <strong>{request.room_number || roomNumber}</strong>
        </div>
      )}
      {request.type === 'move_room' && (
        <>
          <div className="dashboard-maintenance-detail-row">
            <span>ห้องปลายทาง</span>
            <strong>{request.target_room_number || '-'}</strong>
          </div>
          {request.target_room_price != null && (
            <div className="dashboard-maintenance-detail-row">
              <span>ค่าเช่าห้องใหม่</span>
              <strong>
                ฿{formatCurrency(request.target_room_price)}/เดือน
                {(() => {
                  const rentDiff = formatRentDiff(request.source_room_price, request.target_room_price)
                  return rentDiff && rentDiff.tone !== 'same' ? (
                    <small className={`dashboard-move-diff-inline is-${rentDiff.tone}`}>{rentDiff.label}</small>
                  ) : null
                })()}
              </strong>
            </div>
          )}
          <div className="dashboard-maintenance-detail-row">
            <span>เหตุผลที่ย้าย</span>
            <strong>{MOVE_ROOM_REASON_LABEL[request.move_reason] || '-'}</strong>
          </div>
          <div className="dashboard-maintenance-detail-row">
            <span>วันที่ต้องการย้าย</span>
            <strong>{formatDateOnly(request.preferred_move_date)}</strong>
          </div>
          {['pending', 'in_progress'].includes(request.status) && (
            <div className="dashboard-maintenance-detail-row">
              <span>ตรวจสภาพห้องเดิม</span>
              <strong className={request.room_inspected ? 'is-success' : 'is-pending'}>
                {request.room_inspected ? 'ตรวจเรียบร้อยแล้ว' : 'รอเจ้าหน้าที่ตรวจห้อง'}
              </strong>
            </div>
          )}
        </>
      )}
      {request.type === 'renew' && (
        <>
          <div className="dashboard-maintenance-detail-row">
            <span>ระยะเวลาที่ขอต่อ</span>
            <strong>{RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`}</strong>
          </div>
          <div className="dashboard-maintenance-detail-row">
            <span>รูปแบบการชำระ</span>
            <strong>{RENEW_PAYMENT_TYPE_LABEL[request.renew_payment_type] || request.renew_payment_type}</strong>
          </div>
        </>
      )}
      <div className="dashboard-maintenance-detail-row">
        <span>วันที่ส่งคำขอ</span>
        <strong>{formatDateTime(request.created_at)}</strong>
      </div>
      <div className="dashboard-maintenance-detail-row is-note">
        <span>{request.type === 'moveout' ? 'เหตุผล/รายละเอียดการย้ายออก' : 'หมายเหตุ'}</span>
        <strong>{request.note || '-'}</strong>
      </div>
    </div>
  )
}

// A popup opened from "ดูคำขอก่อนหน้า" carries previousOf; older statuses without their own popup copy get a generic one.
const STATUS_HERO_LABEL = {
  success: 'เรียบร้อยแล้ว',
  info: 'กำลังดำเนินการ',
  danger: 'ไม่สำเร็จ',
}

function getStatusPopupContent(popup) {
  const content = STATUS_POPUP_CONTENT_BY_KIND[popup.kind]?.[popup.status]
  if (content || !popup.previousOf) return content
  return {
    title: TENANT_REQUEST_STATUS_LABEL[popup.status] || popup.status,
    message: `คำขอ${TENANT_REQUEST_TYPE_LABEL[popup.kind] || ''}นี้${TENANT_REQUEST_STATUS_LABEL[popup.status] || popup.status}`,
    icon: popup.status === 'approved' ? 'success' : popup.status === 'rejected' ? 'danger' : 'info',
  }
}

function getRequestTimeline(kind, request) {
  if (!request || kind === 'announcement') return []
  const isSelfCancelledMaintenance =
    kind === 'maintenance' && request.status === 'cancelled' && !request.completed_by_name
  const finalLabel = isSelfCancelledMaintenance
    ? 'ยกเลิกรายการเอง'
    : kind === 'maintenance'
      ? MAINTENANCE_FINAL_LOG_LABEL[request.status]
      : TENANT_REQUEST_FINAL_LOG_LABEL[request.status]
  const isFinal = Boolean(finalLabel)

  return [
    { label: kind === 'maintenance' ? 'แจ้งซ่อม' : 'ส่งคำขอ', date: request.created_at, done: true },
    { label: 'เจ้าหน้าที่รับเรื่อง', date: request.accepted_at, done: Boolean(request.accepted_at) },
    {
      label: finalLabel || REQUEST_TIMELINE_PENDING_FINAL_LABEL,
      // completed_at may be missing on older records transitioned before this timestamp was tracked
      date: isFinal ? request.completed_at || request.accepted_at || request.created_at : null,
      done: isFinal,
    },
  ]
}

const STEP_COMPACT_LABEL = {
  เจ้าหน้าที่รับเรื่อง: 'รับเรื่อง',
  [REQUEST_TIMELINE_PENDING_FINAL_LABEL]: 'รอผล',
}

function formatStepDate(value) {
  const date = new Date(value)
  return {
    date: date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }),
    time: date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
  }
}

// Horizontal o---o---o progress; `compact` is the slim version used inside request rows.
function RequestTimeline({ kind, request, compact = false }) {
  const timeline = getRequestTimeline(kind, request)
  if (timeline.length === 0) return null

  const statusBadgeClass = kind === 'maintenance' ? maintenanceBadgeClass(request.status) : tenantRequestBadgeClass(request.status)
  const statusLabel = kind === 'maintenance' ? MAINTENANCE_STATUS_LABEL[request.status] : TENANT_REQUEST_STATUS_LABEL[request.status]
  const lastStep = timeline[timeline.length - 1]
  const totalMs = lastStep.done ? new Date(lastStep.date).getTime() - new Date(timeline[0].date).getTime() : null
  const currentIndex = timeline.findIndex((step) => !step.done)
  const finalTone = ['rejected', 'cancelled'].includes(request.status)
    ? 'danger'
    : ['approved', 'done'].includes(request.status)
      ? 'success'
      : ''

  return (
    <div className={`dashboard-progress${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <div className="dashboard-progress-head">
          <h4 className="dashboard-detail-title">สถานะปัจจุบัน</h4>
          <span className={`dashboard-badge status-${statusBadgeClass}`}>{statusLabel || request.status}</span>
        </div>
      )}
      <ol className="dashboard-stepper">
        {timeline.map((step, index) => {
          const prevStep = timeline[index - 1]
          const stepMs =
            step.done && prevStep?.done ? new Date(step.date).getTime() - new Date(prevStep.date).getTime() : null
          const isLast = index === timeline.length - 1
          const classes = [
            'dashboard-step',
            step.done ? 'is-done' : '',
            index === currentIndex ? 'is-current' : '',
            timeline[index + 1]?.done ? 'is-line-done' : '',
            isLast && step.done && finalTone ? `is-${finalTone}` : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <li key={step.label + index} className={classes}>
              <span className="dashboard-step-dot" aria-hidden="true">
                {step.done && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    {isLast && finalTone === 'danger' ? <path d="M18 6 6 18M6 6l12 12" /> : <polyline points="20 6 9 17 4 12" />}
                  </svg>
                )}
              </span>
              <p className="dashboard-step-label">{compact ? STEP_COMPACT_LABEL[step.label] || step.label : step.label}</p>
              <p className="dashboard-step-date">
                {step.done ? (
                  <>
                    <span>{formatStepDate(step.date).date}</span>
                    {!compact && <span>{formatStepDate(step.date).time} น.</span>}
                  </>
                ) : index === currentIndex ? (
                  'กำลังรอ'
                ) : (
                  '-'
                )}
              </p>
              {!compact && stepMs !== null && <p className="dashboard-step-duration">ใช้เวลา {formatRemaining(stepMs)}</p>}
            </li>
          )
        })}
      </ol>
      {!compact && totalMs !== null && (
        <p className="dashboard-progress-total">รวมใช้เวลาทั้งหมด {formatRemaining(totalMs)}</p>
      )}
    </div>
  )
}

// Segment buttons + search + result count, matching the parcel filter panel.
function DashboardFilterPanel({ segments, active, onSegment, search, onSearch, searchPlaceholder, resultText, canClear, onClear }) {
  return (
    <div className="dashboard-parcel-filters dashboard-filter-panel">
      <div className="dashboard-parcel-segments" role="tablist" aria-label="กรองตามสถานะ">
        {segments.map((segment) => (
          <button
            type="button"
            role="tab"
            key={segment.key}
            aria-selected={active === segment.key}
            className={`dashboard-parcel-segment${segment.tone ? ` tone-${segment.tone}` : ''}${active === segment.key ? ' is-active' : ''}`}
            onClick={() => onSegment(segment.key)}
          >
            {segment.label}
            <span>{segment.count}</span>
          </button>
        ))}
      </div>
      <span className="dashboard-parcel-search-control">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
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
      </span>
      <div className="dashboard-parcel-result-bar">
        <span>{resultText}</span>
        {canClear && (
          <button type="button" className="dashboard-parcel-clear" onClick={onClear}>
            ล้างตัวกรอง
          </button>
        )}
      </div>
    </div>
  )
}

function ParcelGallery({ photos, onOpen }) {
  const [selected, setSelected] = useState(0)
  const current = photos[Math.min(selected, photos.length - 1)]
  return (
    <div className="dashboard-parcel-gallery">
      <div className="dashboard-parcel-gallery-head">
        <h4 className="dashboard-detail-title">รูปพัสดุ</h4>
        <span>
          {selected + 1} / {photos.length}
        </span>
      </div>
      <button
        type="button"
        className="dashboard-parcel-gallery-main"
        onClick={() => onOpen(selected)}
        aria-label="ดูรูปพัสดุขนาดเต็ม"
      >
        <img src={current.url} alt={current.name || `รูปพัสดุ ${selected + 1}`} />
        <span className="dashboard-parcel-gallery-zoom">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
          </svg>
          ดูรูปขยาย
        </span>
      </button>
      {photos.length > 1 && (
        <div className="dashboard-parcel-gallery-strip" role="tablist" aria-label="เลือกรูปพัสดุ">
          {photos.map((photo, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={index === selected}
              key={`${photo.url}-${index}`}
              className={index === selected ? 'is-active' : ''}
              onClick={() => setSelected(index)}
              aria-label={`รูปที่ ${index + 1}`}
            >
              <img src={photo.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ParcelProgress({ parcel, compact = false }) {
  const received = parcel.status === 'received'
  const steps = [
    { key: 'logged', label: compact ? 'บันทึกพัสดุ' : 'เจ้าหน้าที่บันทึกพัสดุ', date: parcel.created_at, done: true },
    { key: 'received', label: received ? 'รับแล้ว' : compact ? 'รอรับ' : 'รอคุณรับพัสดุ', date: parcel.received_at, done: received },
  ]
  return (
    <div className={`dashboard-progress${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <div className="dashboard-progress-head">
          <h4 className="dashboard-detail-title">สถานะพัสดุ</h4>
          <span className={`dashboard-parcel-status${received ? ' is-received' : ' is-pending'}`}>
            {received ? 'รับแล้ว' : 'รอรับพัสดุ'}
          </span>
        </div>
      )}
      <ol className="dashboard-stepper">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={[
              'dashboard-step',
              step.done ? 'is-done' : 'is-current',
              steps[index + 1]?.done ? 'is-line-done' : '',
              step.key === 'received' && step.done ? 'is-success' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="dashboard-step-dot" aria-hidden="true">
              {step.done && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <p className="dashboard-step-label">{step.label}</p>
            <p className="dashboard-step-date">
              {step.done && step.date ? (
                <>
                  <span>{formatStepDate(step.date).date}</span>
                  {!compact && <span>{formatStepDate(step.date).time} น.</span>}
                </>
              ) : (
                'กำลังรอ'
              )}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

const NOTIF_PAGE_SIZE = 6

const CUSTOMER_TABS = [
  { key: 'home', label: 'หน้าแรก' },
  { key: 'parcels', label: 'พัสดุ' },
  { key: 'announcements', label: 'ประกาศจากหอพัก' },
  { key: 'profile', label: 'โปรไฟล์และรหัสผ่าน' },
]
const MAINTENANCE_PAGE_SIZE = 5
const RENTAL_HISTORY_PAGE_SIZE = 5
const PARCEL_PAGE_SIZE = 3

function parcelDayKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const dayKeyToDate = (key) => (key ? new Date(`${key}T00:00:00`) : undefined)

const MAINTENANCE_STATUS_LABEL = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
}

function maintenanceBadgeClass(status) {
  if (status === 'done') return 'paid'
  if (status === 'in_progress') return 'due'
  if (status === 'cancelled') return 'cancelled'
  return 'pending'
}

const MAINTENANCE_CATEGORY_OPTIONS = [
  { value: 'electrical', label: 'ไฟฟ้า' },
  { value: 'plumbing', label: 'ประปา' },
  { value: 'aircon', label: 'เครื่องปรับอากาศ' },
  { value: 'furniture', label: 'เฟอร์นิเจอร์ / สิ่งอำนวยความสะดวก' },
  { value: 'other', label: 'อื่นๆ' },
]

const MAINTENANCE_TIME_OPTIONS = [
  { value: 'anytime', label: 'เวลาไหนก็ได้' },
  { value: 'morning', label: 'ช่วงเช้า (08:00-12:00)' },
  { value: 'afternoon', label: 'ช่วงบ่าย (12:00-16:00)' },
  { value: 'evening', label: 'ช่วงเย็น (16:00-19:00)' },
]

const MAINTENANCE_CATEGORY_LABEL = Object.fromEntries(
  MAINTENANCE_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
)
const MAINTENANCE_TIME_LABEL = Object.fromEntries(
  MAINTENANCE_TIME_OPTIONS.map((option) => [option.value, option.label]),
)

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatCustomerNote(note) {
  if (!note) return '-'
  const short = note
    .replace(/\s*\(แจ้งโดย[^)]*\)/g, '')
    .replace(/\s*\(จำลอง\)/g, '')
    .trim()
  return short || '-'
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

const MS_PER_DAY = 24 * 60 * 60 * 1000

function formatRentalDuration(startValue, endValue) {
  if (!startValue || !endValue) return null
  const start = new Date(startValue)
  const end = new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
  if (totalDays <= 0) return null

  if (totalDays % 365 === 0) {
    return `สัญญาเช่า ${totalDays / 365} ปี`
  }
  if (totalDays % 30 === 0) {
    return `สัญญาเช่า ${totalDays / 30} เดือน`
  }
  if (totalDays % 7 === 0) {
    return `สัญญาเช่า ${totalDays / 7} สัปดาห์`
  }
  return `สัญญาเช่า ${totalDays} วัน`
}

function msUntil(value) {
  if (!value) return null
  return new Date(value).getTime() - Date.now()
}

const CONTRACT_WARNING_WINDOW_MS = 10 * MS_PER_DAY
const CONTRACT_FINAL_WARNING_WINDOW_MS = 3 * MS_PER_DAY

function getContractMsLeft(room) {
  if (!room?.is_booked) return null
  const msUntilStart = msUntil(room.rental_start_date)
  if (msUntilStart === null || msUntilStart > 0) return null
  return msUntil(room.rental_end_date)
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

function CustomerDashbord() {
  const navigate = useNavigate()
  const dashboardLoadRef = useRef(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [, tickCountdown] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => tickCountdown((tick) => tick + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const [customerTab, setCustomerTab] = useState('home')
  const [announcementFocus, setAnnouncementFocus] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifClosing, setNotifClosing] = useState(false)
  const [notifSeen, setNotifSeen] = useState(false)
  const [notifPage, setNotifPage] = useState(1)
  const [notifDetail, setNotifDetail] = useState(null)
  const [parcelReceiveId, setParcelReceiveId] = useState(null)
  const [parcelReceiveConfirm, setParcelReceiveConfirm] = useState(null)
  const [parcelReceiveError, setParcelReceiveError] = useState('')
  const [parcelReceiveErrorId, setParcelReceiveErrorId] = useState(null)
  const [parcelReceiveSuccess, setParcelReceiveSuccess] = useState('')
  const [parcelPhotoPreview, setParcelPhotoPreview] = useState(null)
  const [parcelDetailId, setParcelDetailId] = useState(null)
  const [parcelSearch, setParcelSearch] = useState('')
  const [parcelStatusFilter, setParcelStatusFilter] = useState('all')
  const [parcelDateFrom, setParcelDateFrom] = useState('')
  const [parcelDateTo, setParcelDateTo] = useState('')
  const [parcelSort, setParcelSort] = useState('newest')
  const [parcelPage, setParcelPage] = useState(1)
  const parcelResultsRef = useRef(null)
  const notifRef = useRef(null)

  useEffect(() => {
    if (parcelResultsRef.current) parcelResultsRef.current.scrollTop = 0
  }, [parcelPage, parcelSearch, parcelStatusFilter, parcelDateFrom, parcelDateTo, parcelSort])

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

  const [successPopup, setSuccessPopup] = useState(null)
  const [profileForm, setProfileForm] = useState({ phone: '', current_password: '', new_password: '', confirm_password: '' })
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentSlip, setPaymentSlip] = useState(null)
  const [showDueBreakdown, setShowDueBreakdown] = useState(true)

  const [activeRequestType, setActiveRequestType] = useState(null)
  const [requestNote, setRequestNote] = useState('')
  const [renewDurationMonths, setRenewDurationMonths] = useState(RENEW_DURATION_OPTIONS[2].value)
  const [renewPaymentType, setRenewPaymentType] = useState(RENEW_PAYMENT_TYPE_OPTIONS[0].value)
  const [targetRoomNumber, setTargetRoomNumber] = useState('')
  const [moveReason, setMoveReason] = useState('')
  const [preferredMoveDate, setPreferredMoveDate] = useState('')
  const [moveDateRange, setMoveDateRange] = useState({ min: null, max: null })
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')

  const [statusPopup, setStatusPopup] = useState(null)
  const [maintenanceDetail, setMaintenanceDetail] = useState(null)
  const [maintenancePhotoPreview, setMaintenancePhotoPreview] = useState(null)
  const [tenantDetail, setTenantDetail] = useState(null)

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [maintenanceText, setMaintenanceText] = useState('')
  const [maintenanceCategory, setMaintenanceCategory] = useState(MAINTENANCE_CATEGORY_OPTIONS[0].value)
  const [maintenancePreferredTime, setMaintenancePreferredTime] = useState(MAINTENANCE_TIME_OPTIONS[0].value)
  const [maintenanceContactPhone, setMaintenanceContactPhone] = useState('')
  const [maintenancePhotos, setMaintenancePhotos] = useState([])
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState('')
  const [cancelingMaintenanceId, setCancelingMaintenanceId] = useState(null)
  const [confirmCancelId, setConfirmCancelId] = useState(null)
  const [maintenancePage, setMaintenancePage] = useState(1)
  const [maintenanceSearch, setMaintenanceSearch] = useState('')
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState('all')

  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
  const [historyPageByBooking, setHistoryPageByBooking] = useState({})
  const [historyBookingId, setHistoryBookingId] = useState(null)

  const [receiptRequest, setReceiptRequest] = useState(null)
  const [receiptGenerating, setReceiptGenerating] = useState(false)
  const receiptRef = useRef(null)

  useEffect(() => {
    const isAnyOverlayOpen =
      showPaymentForm ||
      Boolean(activeRequestType) ||
      Boolean(statusPopup) ||
      Boolean(successPopup) ||
      showMaintenanceForm ||
      confirmCancelId !== null ||
      notifOpen ||
      Boolean(notifDetail) ||
      Boolean(maintenanceDetail) ||
      Boolean(tenantDetail)

    if (!isAnyOverlayOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [
    showPaymentForm,
    activeRequestType,
    statusPopup,
    successPopup,
    showMaintenanceForm,
    confirmCancelId,
    notifOpen,
    notifDetail,
    maintenanceDetail,
    tenantDetail,
  ])

  const maybeShowStatusPopups = (dashboardData) => {
    const tryShowStatusPopup = (kind, status, id, request) => {
      if (!STATUS_POPUP_CONTENT_BY_KIND[kind]?.[status]) return false

      if (status === 'pending') return false
      if (status === 'in_progress') {
        setStatusPopup({ kind, status, request })
        return true
      }
      const seenKey = `${kind}_${status}_notice_seen_${id}`
      if (localStorage.getItem(seenKey)) return false
      localStorage.setItem(seenKey, '1')
      setStatusPopup({ kind, status, request })
      return true
    }

    const moveoutRequest = dashboardData?.tenantRequests?.find((request) => request.type === 'moveout')
    if (moveoutRequest && tryShowStatusPopup('moveout', moveoutRequest.status, moveoutRequest.id, moveoutRequest)) return

    const contractMsLeft = getContractMsLeft(dashboardData?.room)
    if (contractMsLeft !== null && contractMsLeft >= 0 && contractMsLeft <= CONTRACT_WARNING_WINDOW_MS) {
      const contractKey = `${dashboardData.room.room_number}_${dashboardData.room.rental_end_date}`
      const status = contractMsLeft <= CONTRACT_FINAL_WARNING_WINDOW_MS ? 'final' : 'warning'
      if (tryShowStatusPopup('contract', status, contractKey)) return
    }

    const renewRequest = dashboardData?.tenantRequests?.find((request) => request.type === 'renew')
    if (renewRequest && tryShowStatusPopup('renew', renewRequest.status, renewRequest.id, renewRequest)) return

    const latestMaintenance = dashboardData?.maintenanceRequests?.[0]
    if (latestMaintenance) tryShowStatusPopup('maintenance', latestMaintenance.status, latestMaintenance.id, latestMaintenance)
  }

  const loadDashboard = () => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true })
      return Promise.resolve()
    }

    if (dashboardLoadRef.current) return dashboardLoadRef.current

    dashboardLoadRef.current = axios
      .get('/api/customer/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        setData(data)
        setError('')
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      })
      .finally(() => {
        setLoading(false)
        dashboardLoadRef.current = null
      })

    return dashboardLoadRef.current
  }

  const handleReceiveParcel = async (parcel) => {
    setParcelReceiveId(parcel.id)
    setParcelReceiveError('')
    setParcelReceiveErrorId(null)
    setParcelReceiveSuccess('')
    try {
      const { data: result } = await axios.post(
        `/api/customer/parcels/${parcel.id}/receive`,
        {},
        { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } },
      )
      setData((current) =>
        current
          ? {
              ...current,
              parcels: (current.parcels || []).map((item) =>
                item.id === parcel.id ? { ...item, status: 'received', received_at: new Date().toISOString() } : item,
              ),
            }
          : current,
      )
      setNotifDetail((current) =>
        current?.parcel?.id === parcel.id
          ? {
              ...current,
              label: 'ยืนยันรับพัสดุแล้ว',
              tone: 'success',
              parcel: { ...current.parcel, status: 'received' },
            }
          : current,
      )
      setParcelReceiveSuccess(result.message || 'ยืนยันรับพัสดุสำเร็จ')
    } catch (err) {
      setParcelReceiveError(err.response?.data?.message || 'ยืนยันรับพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      setParcelReceiveErrorId(parcel.id)
    } finally {
      setParcelReceiveId(null)
    }
  }

  useEffect(() => {
    let isMounted = true
    const token = sessionStorage.getItem('token')

    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    axios
      .get('/api/customer/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        if (isMounted) {
          setData(data)
          const justLoggedIn = sessionStorage.getItem('justLoggedIn') === '1'
          sessionStorage.removeItem('justLoggedIn')
          if (justLoggedIn) maybeShowStatusPopups(data)
        }
      })
      .catch((err) => {
        if (!isMounted) return
        if (err.response?.status === 401) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
          navigate('/login', { replace: true })
          return
        }
        setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadDashboard()
    }
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadDashboard()
    }, 20000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const now = Date.now()
    const upcoming = (data?.announcements ?? [])
      .map((item) => (item.expires_epoch ? item.expires_epoch * 1000 - now : Number.NaN))
      .filter((wait) => Number.isFinite(wait) && wait > 0)
    if (upcoming.length === 0) return undefined
    const timer = setTimeout(loadDashboard, Math.min(Math.min(...upcoming) + 1000, 2147483647))
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const openPaymentForm = () => {
    setPaymentError('')
    setPaymentSlip(null)
    setShowPaymentForm(true)
  }

  const handleConfirmPayment = async (event) => {
    event.preventDefault()
    const token = sessionStorage.getItem('token')
    if (!paymentSlip) {
      setPaymentError('กรุณาแนบสลิปโอนเงิน')
      return
    }
    setPaymentSubmitting(true)
    setPaymentError('')
    try {
      const formData = new FormData()
      formData.append('slip', paymentSlip)
      const { data: result } = await axios.post(
        '/api/customer/payments/confirm',
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } },
      )
      setShowPaymentForm(false)
      setPaymentSlip(null)
      setSuccessPopup(result.message || 'ชำระเงินสำเร็จ')
      await loadDashboard()
    } catch (err) {
      setPaymentError(err.response?.data?.message || 'ชำระเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // Fills the profile form with what is currently saved and clears the password boxes.
  const resetProfileForm = () => {
    setProfileForm({
      phone: data?.customer?.phone || '',
      current_password: '',
      new_password: '',
      confirm_password: '',
    })
    setProfileError('')
  }

  const selectCustomerTab = (key) => {
    if (key === 'profile') resetProfileForm()
    setAnnouncementFocus(null)
    setCustomerTab(key)
  }

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    if (!/^0\d{8,9}$/.test(profileForm.phone.trim())) {
      setProfileError('เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก')
      return
    }
    if (profileForm.new_password && profileForm.new_password !== profileForm.confirm_password) {
      setProfileError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน')
      return
    }
    setProfileSubmitting(true)
    setProfileError('')
    try {
      const token = sessionStorage.getItem('token')
      const payload = {
        phone: profileForm.phone.trim(),
      }
      if (profileForm.new_password) {
        payload.current_password = profileForm.current_password
        payload.new_password = profileForm.new_password
      }
      const { data: result } = await axios.patch('/api/customer/profile', payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSuccessPopup(result.message || 'บันทึกข้อมูลสำเร็จ')
      setProfileForm((form) => ({ ...form, current_password: '', new_password: '', confirm_password: '' }))
      await loadDashboard()
    } catch (err) {
      setProfileError(err.response?.data?.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setProfileSubmitting(false)
    }
  }

  const openRequestForm = (type) => {
    setActiveRequestType(type)
    setRequestNote('')
    setTargetRoomNumber(String(data?.availableRooms?.[0]?.room_number || ''))
    setMoveReason('')
    setPreferredMoveDate('')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    setMoveDateRange({
      min: today,
      max: new Date(today.getFullYear(), today.getMonth(), today.getDate() + MOVE_ROOM_MAX_DAYS_AHEAD),
    })
    setRenewDurationMonths(RENEW_DURATION_OPTIONS[2].value)
    setRenewPaymentType(RENEW_PAYMENT_TYPE_OPTIONS[0].value)
    setRequestError('')
  }

  const handleRequestSubmit = async (event) => {
    event.preventDefault()
    if (activeRequestType === 'moveout' && !requestNote.trim()) {
      setRequestError('กรุณากรอกรายละเอียดการย้ายออก')
      return
    }
    if (activeRequestType === 'move_room') {
      if (!targetRoomNumber) {
        setRequestError('กรุณาเลือกห้องที่ต้องการย้าย')
        return
      }
      if (!moveReason) {
        setRequestError('กรุณาเลือกเหตุผลที่ต้องการย้ายห้อง')
        return
      }
      if (!preferredMoveDate) {
        setRequestError('กรุณาเลือกวันที่ต้องการย้าย')
        return
      }
      if (moveReason === 'other' && !requestNote.trim()) {
        setRequestError('กรุณาระบุเหตุผลเพิ่มเติมในหมายเหตุ')
        return
      }
    }
    const token = sessionStorage.getItem('token')
    setRequestSubmitting(true)
    setRequestError('')
    try {
      const payload = { type: activeRequestType, note: requestNote.trim() || undefined }
      if (activeRequestType === 'renew') {
        payload.renew_duration_months = Number(renewDurationMonths)
        payload.renew_payment_type = renewPaymentType
      }
      if (activeRequestType === 'move_room') {
        payload.target_room_number = Number(targetRoomNumber)
        payload.move_reason = moveReason
        payload.preferred_move_date = preferredMoveDate
      }
      const { data: result } = await axios.post('/api/customer/requests', payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setActiveRequestType(null)
      setSuccessPopup(result.message || 'ส่งคำขอสำเร็จ')
      await loadDashboard()
    } catch (err) {
      setRequestError(err.response?.data?.message || 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setRequestSubmitting(false)
    }
  }

  const openMaintenanceForm = () => {
    setMaintenanceText('')
    setMaintenanceCategory(MAINTENANCE_CATEGORY_OPTIONS[0].value)
    setMaintenancePreferredTime(MAINTENANCE_TIME_OPTIONS[0].value)
    setMaintenanceContactPhone(data?.customer?.phone || '')
    setMaintenancePhotos([])
    setMaintenanceError('')
    setShowMaintenanceForm(true)
  }

  const handleMaintenanceSubmit = async (event) => {
    event.preventDefault()
    const description = maintenanceText.trim()
    if (!description) {
      setMaintenanceError('กรุณากรอกรายละเอียดปัญหา')
      return
    }
    if (maintenancePhotos.length === 0) {
      setMaintenanceError('กรุณาแนบรูปปัญหาอย่างน้อย 1 รูป')
      return
    }
    const token = sessionStorage.getItem('token')
    setMaintenanceSubmitting(true)
    setMaintenanceError('')
    try {
      const compressedPhotos = await Promise.all(maintenancePhotos.map(compressImageFile))
      const { data: result } = await axios.post(
        '/api/customer/maintenance',
        {
          description,
          category: maintenanceCategory,
          preferredTime: maintenancePreferredTime,
          contactPhone: maintenanceContactPhone.trim() || undefined,
          photos: compressedPhotos,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setMaintenanceText('')
      setMaintenancePhotos([])
      setShowMaintenanceForm(false)
      setSuccessPopup(result.message || 'แจ้งซ่อมสำเร็จ')
      await loadDashboard()
    } catch (err) {
      setMaintenanceError(err.response?.data?.message || err.message || 'แจ้งซ่อมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setMaintenanceSubmitting(false)
    }
  }

  const handleCancelMaintenance = async (id) => {
    const token = sessionStorage.getItem('token')
    setMaintenanceError('')
    setCancelingMaintenanceId(id)
    try {
      const { data: result } = await axios.post(
        `/api/customer/maintenance/${id}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setSuccessPopup(result.message || 'ยกเลิกรายการแจ้งซ่อมสำเร็จ')
      await loadDashboard()
      return true
    } catch (err) {
      setMaintenanceError(err.response?.data?.message || 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      return false
    } finally {
      setCancelingMaintenanceId(null)
    }
  }

  const requestSingleReceipt = (entry, payment) => {
    if (receiptGenerating) return
    setReceiptRequest({ mode: 'single', entry, payment })
  }

  const requestCombinedReceipt = (entry) => {
    if (receiptGenerating) return
    setReceiptRequest({ mode: 'all', entry })
  }

  useEffect(() => {
    if (!receiptRequest) return
    let cancelled = false

    const generate = async () => {
      setReceiptGenerating(true)
      try {
        // wait a tick so the hidden receipt template renders before we capture it
        await new Promise((resolve) => setTimeout(resolve, 50))
        const node = receiptRef.current
        if (!node || cancelled) return

        const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' })
        const imageData = canvas.toDataURL('image/png')
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const imageHeight = (canvas.height * pageWidth) / canvas.width

        if (imageHeight <= pageHeight) {
          pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, imageHeight)
        } else {
          // split across multiple pages when the receipt is taller than one A4 page
          let renderedHeightPx = 0
          const pageHeightPx = (pageHeight * canvas.width) / pageWidth
          while (renderedHeightPx < canvas.height) {
            const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedHeightPx)
            const sliceCanvas = document.createElement('canvas')
            sliceCanvas.width = canvas.width
            sliceCanvas.height = sliceHeightPx
            sliceCanvas
              .getContext('2d')
              .drawImage(canvas, 0, renderedHeightPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)
            if (renderedHeightPx > 0) pdf.addPage()
            pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, (sliceHeightPx * pageWidth) / canvas.width)
            renderedHeightPx += sliceHeightPx
          }
        }

        const roomNumber = receiptRequest.entry?.room_number || ''
        const dateStamp = formatDate(new Date()).replace(/\s+/g, '')
        const fileName =
          receiptRequest.mode === 'single'
            ? `ใบเสร็จ-ห้อง${roomNumber}-${PAYMENT_TYPE_LABEL[receiptRequest.payment.type] || 'ค่าเช่าห้อง'}-${dateStamp}.pdf`
            : `ใบเสร็จรวม-ห้อง${roomNumber}-${dateStamp}.pdf`
        if (!cancelled) pdf.save(fileName)
      } catch (err) {
        console.error('Generate receipt PDF error:', err)
        if (!cancelled) setError('ไม่สามารถสร้างไฟล์ใบเสร็จได้ กรุณาลองใหม่อีกครั้ง')
      } finally {
        if (!cancelled) {
          setReceiptGenerating(false)
          setReceiptRequest(null)
        }
      }
    }

    generate()
    return () => {
      cancelled = true
    }
  }, [receiptRequest])

  if (loading) {
    return (
      <div className="dashboard-page d-flex align-items-center justify-content-center">
        <p className="text-muted">กำลังโหลดข้อมูล...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="container">
          <div className="alert alert-danger">{error}</div>
        </div>
      </div>
    )
  }

  const {
    customer,
    room,
    rentalHistory,
    currentDue,
    availableRooms = [],
    maintenanceRequests = [],
    tenantRequests = [],
    announcements = [],
    parcels = [],
  } = data
  const pendingParcels = parcels.filter((parcel) => parcel.status === 'pending')
  const receivedParcels = parcels.filter((parcel) => parcel.status === 'received')
  const parcelKeyword = parcelSearch.trim().toLocaleLowerCase('th-TH')
  const parcelFiltersActive =
    Boolean(parcelKeyword) ||
    parcelStatusFilter !== 'all' ||
    Boolean(parcelDateFrom) ||
    Boolean(parcelDateTo) ||
    parcelSort !== 'newest'
  const resetParcelFilters = () => {
    setParcelSearch('')
    setParcelStatusFilter('all')
    setParcelDateFrom('')
    setParcelDateTo('')
    setParcelSort('newest')
    setParcelPage(1)
  }
  const filteredParcels = parcels.filter((parcel) => {
    if (parcelStatusFilter !== 'all' && parcel.status !== parcelStatusFilter) return false
    const arrivedOn = parcelDayKey(parcel.created_at)
    if (parcelDateFrom && arrivedOn < parcelDateFrom) return false
    if (parcelDateTo && arrivedOn > parcelDateTo) return false
    if (!parcelKeyword) return true
    return [
      parcel.sender_name,
      parcel.tracking_number,
      parcel.description,
      parcel.staff_name,
      parcel.room_number,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('th-TH')
      .includes(parcelKeyword)
  })
  if (parcelSort === 'oldest') filteredParcels.reverse()
  const parcelTotalPages = Math.max(1, Math.ceil(filteredParcels.length / PARCEL_PAGE_SIZE))
  const parcelCurrentPage = Math.min(parcelPage, parcelTotalPages)
  const pagedParcels = filteredParcels.slice(
    (parcelCurrentPage - 1) * PARCEL_PAGE_SIZE,
    parcelCurrentPage * PARCEL_PAGE_SIZE,
  )
  const currentBooking = rentalHistory?.[0]
  const paymentUnderReview = currentBooking?.payments?.some((payment) => payment.status === 'pending' && payment.slip_path)
  const prepaidUntilDate = room?.prepaid_until ? new Date(room.prepaid_until) : null
  const isPrepaid = prepaidUntilDate && !currentDue && prepaidUntilDate > new Date()
  const msUntilStart = room?.is_booked ? msUntil(room.rental_start_date) : null
  const hasStarted = msUntilStart !== null && msUntilStart <= 0
  const msLeft = hasStarted ? msUntil(room.rental_end_date) : null
  const isExpired = msLeft !== null && msLeft < 0
  const isWarning = msLeft !== null && msLeft >= 0 && msLeft <= CONTRACT_WARNING_WINDOW_MS

  const latestRequestByType = (type) => tenantRequests.find((request) => request.type === type)
  const renewRequest = latestRequestByType('renew')
  const moveoutRequest = latestRequestByType('moveout')
  const moveRoomRequest = latestRequestByType('move_room')

  const canResubmitRenew =
    !renewRequest
    || renewRequest.status === 'rejected'
    || (renewRequest.status === 'approved' && msLeft !== null && msLeft <= RENEW_RESUBMIT_WINDOW_MS)

  const buildTenantRequestNotifs = (request) => {
    const items = []
    if (request.accepted_at) {
      items.push({
        key: `tenant-${request.id}-in_progress`,
        title: TENANT_REQUEST_TYPE_LABEL[request.type] || request.type,
        ...TENANT_REQUEST_NOTIF_INFO.in_progress,
        date: request.accepted_at,
        detail: request.note ? `หมายเหตุของคุณ: ${request.note}` : null,
        kind: 'tenant',
        request,
      })
    }
    if (request.status !== 'in_progress' && TENANT_REQUEST_NOTIF_INFO[request.status]) {
      items.push({
        key: `tenant-${request.id}-${request.status}`,
        title: TENANT_REQUEST_TYPE_LABEL[request.type] || request.type,
        ...TENANT_REQUEST_NOTIF_INFO[request.status],
        date: request.completed_at || request.created_at,
        detail:
          (request.type === 'moveout' && MOVEOUT_STATUS_POPUP_CONTENT[request.status]?.message)
          || (request.type === 'move_room' && MOVE_ROOM_STATUS_POPUP_CONTENT[request.status]?.message)
          || (request.type === 'move_room' && request.target_room_number
            ? `ห้องปลายทางที่ขอ: ${request.target_room_number}`
            : null)
          || (request.note ? `หมายเหตุของคุณ: ${request.note}` : null),
        kind: 'tenant',
        request,
      })
    }
    return items
  }

  const buildMaintenanceNotifs = (request) => {
    const items = []
    if (request.accepted_at) {
      items.push({
        key: `maintenance-${request.id}-in_progress`,
        title: 'แจ้งซ่อม',
        ...MAINTENANCE_NOTIF_INFO.in_progress,
        date: request.accepted_at,
        detail: request.description || null,
        kind: 'maintenance',
        request,
      })
    }
    if (request.status !== 'in_progress' && MAINTENANCE_NOTIF_INFO[request.status]) {
      items.push({
        key: `maintenance-${request.id}-${request.status}`,
        title: 'แจ้งซ่อม',
        ...MAINTENANCE_NOTIF_INFO[request.status],
        date: request.completed_at || request.created_at,
        detail: request.description || null,
        kind: 'maintenance',
        request,
      })
    }
    return items
  }

  const buildUtilityBillNotifs = (payment) => {
    const info = payment.slip_path
      ? { label: 'ส่งสลิปแล้ว รอเจ้าหน้าที่ตรวจสอบ', tone: 'pending' }
      : UTILITY_BILL_NOTIF_INFO[payment.type]
    if (!info || payment.status !== 'pending') return []
    const description = formatCustomerNote(payment.note)
    return [
      {
        key: `utility-${payment.id}`,
        title: PAYMENT_TYPE_LABEL[payment.type],
        ...info,
        date: payment.created_at,
        detail: (
          <span className="dashboard-notif-utility-detail">
            <span className="dashboard-notif-utility-amount">จำนวนเงิน ฿{formatCurrency(payment.amount)}</span>
            {description !== '-' && <span className="dashboard-notif-utility-desc">{description}</span>}
            <span className="dashboard-notif-utility-by">แจ้งโดยพนักงาน</span>
          </span>
        ),
        kind: 'utility',
      },
    ]
  }

  const utilityPayments = (rentalHistory || []).flatMap((entry) => entry.payments || [])

  const notifications = [
    ...tenantRequests.flatMap(buildTenantRequestNotifs),
    ...maintenanceRequests.flatMap(buildMaintenanceNotifs),
    ...utilityPayments.flatMap(buildUtilityBillNotifs),
    ...parcels
      .map((parcel) => ({
        key: `parcel-${parcel.id}`,
        title: `พัสดุเข้าห้อง ${room?.room_number ?? customer.room_number}`,
        label: parcel.status === 'received' ? 'ยืนยันรับพัสดุแล้ว' : 'มีพัสดุรอรับ',
        tone: parcel.status === 'received' ? 'success' : 'pending',
        date: parcel.created_at,
        detail: (
          <span className="dashboard-notif-utility-detail">
            <span>ผู้ส่ง: {parcel.sender_name || 'พัสดุทั่วไป'}</span>
            {parcel.tracking_number && <span>เลขพัสดุ: {parcel.tracking_number}</span>}
            {parcel.description && <span>รายละเอียด: {parcel.description}</span>}
            <span className="dashboard-notif-utility-by">บันทึกโดย {parcel.staff_name || 'เจ้าหน้าที่'}</span>
          </span>
        ),
        preview: parcel.description || parcel.tracking_number || parcel.sender_name || 'กรุณาติดต่อรับพัสดุ',
        kind: 'parcel',
        parcel,
      })),
    ...announcements.map((item) => ({
      key: `announcement-${item.id}`,
      announcementId: item.id,
      title: item.title,
      label: item.tone === 'warning' ? 'ประกาศแจ้งเตือนจากหอพัก' : 'ประกาศจากหอพัก',
      tone: item.tone === 'warning' ? 'pending' : 'info',
      date: item.created_at,
      detail: (
        <>
          <span className={`dashboard-notif-message${item.message.length > 70 || item.message.includes('\n') ? ' is-long' : ''}`}>
            {item.message}
          </span>
        </>
      ),
      byline: `ประกาศโดย ${item.author || 'เจ้าหน้าที่'}`,
      preview: item.message,
      kind: 'announcement',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  const notifTotalPages = Math.max(1, Math.ceil(notifications.length / NOTIF_PAGE_SIZE))
  const notifCurrentPage = Math.min(notifPage, notifTotalPages)
  const paginatedNotifications = notifications.slice(
    (notifCurrentPage - 1) * NOTIF_PAGE_SIZE,
    notifCurrentPage * NOTIF_PAGE_SIZE,
  )

  const maintenanceKeyword = maintenanceSearch.trim().toLowerCase()
  const filteredMaintenanceRequests = maintenanceRequests.filter((item) => {
    if (maintenanceStatusFilter !== 'all' && item.status !== maintenanceStatusFilter) return false
    if (maintenanceKeyword) {
      const haystack = [
        item.description,
        MAINTENANCE_CATEGORY_LABEL[item.category],
        MAINTENANCE_TIME_LABEL[item.preferred_time],
        item.contact_phone,
        MAINTENANCE_STATUS_LABEL[item.status],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(maintenanceKeyword)) return false
    }
    return true
  })

  const maintenanceTotalPages = Math.max(1, Math.ceil(filteredMaintenanceRequests.length / MAINTENANCE_PAGE_SIZE))
  const maintenanceCurrentPage = Math.min(maintenancePage, maintenanceTotalPages)
  const paginatedMaintenanceRequests = filteredMaintenanceRequests.slice(
    (maintenanceCurrentPage - 1) * MAINTENANCE_PAGE_SIZE,
    maintenanceCurrentPage * MAINTENANCE_PAGE_SIZE,
  )

  const currentDueRentItem = currentDue?.items?.find((item) => item.type === 'rent')
  const rentalHistoryWithDue =
    currentDueRentItem && rentalHistory.length > 0
      ? rentalHistory.map((entry, index) => {
          if (index !== 0) return entry
          const pendingRentPayment = {
            id: `due-rent-${entry.booking_id}`,
            booking_id: entry.booking_id,
            created_at: currentDue.dueDate || currentDue.periodStart,
            payment_date: currentDue.dueDate || currentDue.periodStart,
            type: 'rent',
            amount: currentDueRentItem.amount,
            status: currentDueRentItem.status === 'overdue' ? 'overdue' : 'pending',
            note:
              currentDue.overdueMonths > 0
                ? `ค้างสะสมจากเดือนก่อนหน้า ${currentDue.overdueMonths} เดือน`
                : currentDue.depositApplied > 0
                  ? `หักมัดจำ ฿${formatCurrency(currentDue.depositApplied)} แล้ว`
                  : null,
          }
          return { ...entry, payments: [pendingRentPayment, ...entry.payments] }
        })
      : rentalHistory

  const historyKeyword = historySearch.trim().toLowerCase()
  const filteredRentalHistory = rentalHistoryWithDue.map((entry) => {
    const payments = entry.payments.filter((payment) => {
      if (historyStatusFilter !== 'all' && payment.status !== historyStatusFilter) return false
      if (historyKeyword) {
        const haystack = [
          formatDateTime(payment.created_at),
          PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง',
          formatCurrency(payment.amount),
          STATUS_LABEL[payment.status] || payment.status,
          payment.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(historyKeyword)) return false
      }
      return true
    })
    return { ...entry, payments, hasOriginalPayments: entry.payments.length > 0 }
  })

  // Each booking is a separate room stay; a room transfer closes one booking and opens another.
  const approvedMoveRequests = tenantRequests.filter(
    (request) => request.type === 'move_room' && request.status === 'approved',
  )
  const getBookingTransfer = (index) => {
    const entry = rentalHistory[index]
    const newer = rentalHistory[index - 1]
    const older = rentalHistory[index + 1]
    return {
      movedOut: newer
        ? approvedMoveRequests.find(
            (request) => request.room_number === entry.room_number && request.target_room_number === newer.room_number,
          )
        : null,
      movedIn: older
        ? approvedMoveRequests.find(
            (request) => request.target_room_number === entry.room_number && request.room_number === older.room_number,
          )
        : null,
    }
  }
  const activeHistoryIndex = Math.max(
    0,
    filteredRentalHistory.findIndex((entry) => entry.booking_id === historyBookingId),
  )

  const reminders = []
  if (room?.is_booked) {
    if (isExpired) {
      reminders.push({ type: 'danger', text: `สัญญาเช่าห้อง ${room.room_number} หมดอายุแล้ว กรุณาต่อสัญญาหรือแจ้งย้ายออก` })
    } else if (isWarning) {
      reminders.push({ type: 'warning', text: `สัญญาเช่าห้อง ${room.room_number} ใกล้หมดอายุ (เหลืออีก ${formatRemaining(msLeft)})` })
    }
  }
  if (currentDue) {
    if (currentDue.status === 'overdue') {
      reminders.push({
        type: 'danger',
        text: `ค้างชำระค่าเช่างวดนี้ (ครบกำหนดวันที่ ${formatDate(currentDue.dueDate)}) กรุณาชำระโดยเร็ว`,
      })
    } else if (currentDue.status === 'due') {
      reminders.push({
        type: 'warning',
        text: `ถึงกำหนดชำระค่าเช่าประจำงวดนี้แล้ว กรุณาชำระภายในวันที่ ${formatDate(currentDue.dueDate)}`,
      })
    }
  }

  return (
    <div className="dashboard-page">
      <div className="container">
        <div className="dashboard-header">
          <div className="dashboard-title-group">
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
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h1>
                สวัสดี, {customer.first_name} {customer.last_name}
              </h1>
              <p>แดชบอร์ดของฉัน</p>
            </div>
          </div>
          <div className="dashboard-header-actions">
            <div className="dashboard-notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="dashboard-notif-btn"
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
                {!notifSeen && notifications.length > 0 && <span className="dashboard-notif-dot" />}
              </button>
              {notifOpen && (
                <div
                  className={`dashboard-notif-panel${notifClosing ? ' is-closing' : ''}`}
                  onAnimationEnd={() => {
                    if (notifClosing) {
                      setNotifOpen(false)
                      setNotifClosing(false)
                    }
                  }}
                >
                  <div className="dashboard-notif-panel-header">
                    <span className="dashboard-notif-panel-title">
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
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      การแจ้งเตือน
                      {notifications.length > 0 && <span className="dashboard-notif-count">{notifications.length}</span>}
                    </span>
                    <button
                      type="button"
                      className="dashboard-notif-panel-close"
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
                    <div className="dashboard-notif-empty">
                      <span className="dashboard-notif-empty-icon">
                        <svg
                          width="24"
                          height="24"
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
                      </span>
                      ยังไม่มีการแจ้งเตือน
                    </div>
                  ) : (
                    <>
                      <div className="dashboard-notif-list">
                        {paginatedNotifications.map((notif) => (
                          <button
                            type="button"
                            key={notif.key}
                            className={`dashboard-notif-item is-${notif.tone}`}
                            onClick={() => {
                              closeNotifPanel()
                              if (notif.kind === 'announcement') {
                                selectCustomerTab('announcements')
                                setAnnouncementFocus({ id: notif.announcementId, nonce: Date.now() })
                                return
                              }
                              if (notif.kind === 'parcel') {
                                setParcelReceiveError('')
                                setParcelReceiveSuccess('')
                              }
                              // Requests, maintenance and bills all live on the home tab
                              selectCustomerTab('home')
                              if (notif.kind === 'maintenance') setMaintenanceDetail(notif.request)
                              else if (notif.kind === 'tenant') setTenantDetail(notif.request)
                              else setNotifDetail(notif)
                            }}
                          >
                            <p className="dashboard-notif-item-title">{notif.title}</p>
                            <p className="dashboard-notif-item-status">{notif.label}</p>
                            {notif.preview && <p className="dashboard-notif-item-preview">{notif.preview}</p>}
                            <p className="dashboard-notif-item-date">{formatDateTime(notif.date)}</p>
                          </button>
                        ))}
                      </div>
                      {notifTotalPages > 1 && (
                        <div className="dashboard-notif-pagination">
                          <button
                            type="button"
                            className="dashboard-notif-page-btn"
                            disabled={notifCurrentPage <= 1}
                            onClick={() => setNotifPage(Math.max(1, notifCurrentPage - 1))}
                          >
                            ก่อนหน้า
                          </button>
                          <span className="dashboard-notif-page-info">
                            หน้า {notifCurrentPage} / {notifTotalPages}
                          </span>
                          <button
                            type="button"
                            className="dashboard-notif-page-btn"
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

            {notifDetail && (
              <Modal title={notifDetail.title} onClose={() => setNotifDetail(null)} variant="confirm">
                {(requestClose) => (
                  <div className="dashboard-confirm-body">
                    <div className={`dashboard-confirm-icon is-${notifDetail.tone}`}>
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
                        {notifDetail.tone === 'success' ? (
                          <polyline points="20 6 9 17 4 12" />
                        ) : notifDetail.tone === 'danger' ? (
                          <>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </>
                        ) : (
                          <>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </>
                        )}
                      </svg>
                    </div>
                    <p className="dashboard-confirm-message">
                      <span className={`dashboard-confirm-message-status is-${notifDetail.tone}`}>
                        {notifDetail.label}
                      </span>
                    </p>
                    {notifDetail.detail && (
                      <div className="dashboard-confirm-message-detail">{notifDetail.detail}</div>
                    )}
                    {notifDetail.kind === 'parcel' && notifDetail.parcel?.photos?.length > 0 && (
                      <div className="dashboard-parcel-photos">
                        <p>รูปพัสดุ</p>
                        <div>
                          {notifDetail.parcel.photos.map((photo, index) => (
                            <button
                              type="button"
                              key={`${photo.url}-${index}`}
                              onClick={() => setParcelPhotoPreview({ parcel: notifDetail.parcel, index })}
                              aria-label={`ดูรูปพัสดุ ${index + 1}`}
                            >
                              <img src={photo.url} alt={`รูปพัสดุ ${index + 1}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {notifDetail.request ? (
                      <RequestTimeline kind={notifDetail.kind} request={notifDetail.request} />
                    ) : (
                      <p className="dashboard-notif-item-date">
                        {notifDetail.byline ? `${notifDetail.byline} · ` : ''}
                        {formatDateTime(notifDetail.date)}
                      </p>
                    )}
                    {notifDetail.kind === 'parcel' && notifDetail.parcel?.status === 'pending' && (
                      <>
                        {parcelReceiveError && <div className="alert alert-danger mb-0">{parcelReceiveError}</div>}
                        <div className="dashboard-form-actions">
                          <button
                            type="button"
                            className="dashboard-action-btn is-primary"
                            disabled={parcelReceiveId === notifDetail.parcel.id}
                            onClick={() => setParcelReceiveConfirm(notifDetail.parcel)}
                          >
                            {parcelReceiveId === notifDetail.parcel.id ? 'กำลังยืนยัน...' : 'ยืนยันว่าได้รับพัสดุแล้ว'}
                          </button>
                        </div>
                      </>
                    )}
                    {notifDetail.kind === 'parcel' && notifDetail.parcel?.status === 'received' && (
                      <p className="dashboard-confirm-message">{parcelReceiveSuccess || 'ยืนยันรับพัสดุแล้ว'}</p>
                    )}
                    <div className="dashboard-form-actions">
                      <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                        ปิด
                      </button>
                    </div>
                  </div>
                )}
              </Modal>
            )}
            {parcelPhotoPreview && (
              <PhotoLightbox
                photos={(parcelPhotoPreview.parcel.photos || []).map((photo, index) => ({
                  name: photo.name || `รูปที่ ${index + 1}`,
                  url: photo.url,
                }))}
                initialIndex={parcelPhotoPreview.index}
                title={`พัสดุห้อง ${room?.room_number ?? customer.room_number}`}
                subtitle={parcelPhotoPreview.parcel.sender_name || 'พัสดุทั่วไป'}
                label="รูปพัสดุ"
                onClose={() => setParcelPhotoPreview(null)}
              />
            )}
            {room && (
              <span className="dashboard-room-status">
                {room.is_booked ? 'กำลังเช่าอยู่' : 'ว่าง'}
              </span>
            )}
            <button type="button" className="dashboard-logout-btn" onClick={handleLogout}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        {maintenanceDetail && (
          <Modal title="รายละเอียดการแจ้งซ่อม" onClose={() => setMaintenanceDetail(null)}>
            {(requestClose) => (
              <div className="dashboard-maintenance-detail">
                <StatusAlert content={MAINTENANCE_STATUS_POPUP_CONTENT[maintenanceDetail.status]} />
                <div className="dashboard-maintenance-detail-card">
                  <h4 className="dashboard-detail-title">รายละเอียดการแจ้งซ่อม</h4>
                  <div className="dashboard-maintenance-detail-row">
                    <span>ประเภท</span>
                    <strong>{MAINTENANCE_CATEGORY_LABEL[maintenanceDetail.category] || 'อื่นๆ'}</strong>
                  </div>
                  <div className="dashboard-maintenance-detail-row">
                    <span>ช่วงเวลาที่สะดวก</span>
                    <strong>{MAINTENANCE_TIME_LABEL[maintenanceDetail.preferred_time] || 'เวลาไหนก็ได้'}</strong>
                  </div>
                  {maintenanceDetail.contact_phone && (
                    <div className="dashboard-maintenance-detail-row">
                      <span>เบอร์โทร</span>
                      <strong>{maintenanceDetail.contact_phone}</strong>
                    </div>
                  )}
                  <div className="dashboard-maintenance-detail-row">
                    <span>วันที่แจ้งซ่อม</span>
                    <strong>{formatDateTime(maintenanceDetail.created_at)}</strong>
                  </div>
                  <div className="dashboard-maintenance-detail-row is-note">
                    <span>รายละเอียดปัญหา</span>
                    <strong>{maintenanceDetail.description || '-'}</strong>
                  </div>
                </div>
                <RequestTimeline kind="maintenance" request={maintenanceDetail} />
                {maintenanceDetail.photos?.length > 0 && (
                  <div className="dashboard-maintenance-photos-section">
                    <p className="dashboard-maintenance-photos-title">รูปประกอบ ({maintenanceDetail.photos.length})</p>
                    <div className="dashboard-maintenance-photos">
                      {maintenanceDetail.photos.map((photo, index) => (
                        <a
                          key={`${photo.name}-${index}`}
                          href={photo.dataUrl}
                          title="คลิกเพื่อดูตัวอย่างรูป"
                          onClick={(event) => {
                            event.preventDefault()
                            setMaintenancePhotoPreview({ index })
                          }}
                        >
                          <img src={photo.dataUrl} alt={`รูปแจ้งซ่อม ${index + 1}`} />
                          <span className="dashboard-maintenance-photo-caption">
                            <span>{photo.name || `รูปที่ ${index + 1}`}</span>
                            <small>รูปที่ {index + 1}</small>
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div className="dashboard-form-actions">
                  <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {maintenanceDetail && maintenancePhotoPreview && (
          <PhotoLightbox
            photos={(maintenanceDetail.photos || []).map((photo, index) => ({
              name: photo.name || `รูปที่ ${index + 1}`,
              url: photo.dataUrl,
            }))}
            initialIndex={maintenancePhotoPreview.index}
            title="รูปแจ้งซ่อม"
            subtitle={maintenanceDetail.description}
            label="รูปแจ้งซ่อม"
            onClose={() => setMaintenancePhotoPreview(null)}
          />
        )}

        {tenantDetail && (
          <Modal
            title={`รายละเอียด${TENANT_REQUEST_TYPE_LABEL[tenantDetail.type] || 'คำขอ'}`}
            onClose={() => setTenantDetail(null)}
          >
            {(requestClose) => (
              <div className="dashboard-maintenance-detail">
                <StatusAlert content={STATUS_POPUP_CONTENT_BY_KIND[tenantDetail.type]?.[tenantDetail.status]} />
                <TenantRequestDetailCard request={tenantDetail} roomNumber={room?.room_number} />
                <RequestTimeline kind={tenantDetail.type} request={tenantDetail} />
                <div className="dashboard-form-actions">
                  <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {statusPopup && getStatusPopupContent(statusPopup) && (
          <Modal
            title={statusPopup.previousOf ? 'คำขอก่อนหน้า' : getStatusPopupContent(statusPopup).title}
            onClose={() => setStatusPopup(null)}
            variant="status"
          >
            {(requestClose) => {
              const content = getStatusPopupContent(statusPopup)
              const sameTypeRequests = TENANT_REQUEST_TYPE_LABEL[statusPopup.kind]
                ? tenantRequests.filter((request) => request.type === statusPopup.kind)
                : []
              const currentIndex = statusPopup.request
                ? sameTypeRequests.findIndex((request) => request.id === statusPopup.request.id)
                : -1
              const previousRequest =
                !statusPopup.previousOf && currentIndex !== -1 ? sameTypeRequests[currentIndex + 1] : null
              return (
                <div className="dashboard-confirm-body dashboard-status-body">
                  <div className={`dashboard-status-hero is-${content.icon}`}>
                    <div className={`dashboard-confirm-icon is-${content.icon}`}>
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
                        {statusPopup.status === 'pending' ? (
                          <>
                            <circle cx="12" cy="12" r="9" />
                            <polyline points="12 7 12 12 15 14" />
                          </>
                        ) : <StatusIconPaths tone={content.icon} />}
                      </svg>
                    </div>
                    <div className="dashboard-status-hero-text">
                      <span className="dashboard-status-hero-label">{STATUS_HERO_LABEL[content.icon] || 'อัปเดตสถานะ'}</span>
                      <p className="dashboard-confirm-message">{content.message}</p>
                    </div>
                  </div>
                  <div className="dashboard-status-scroll" key={statusPopup.request?.id ?? statusPopup.kind}>
                    {statusPopup.request && <RequestTimeline kind={statusPopup.kind} request={statusPopup.request} />}
                    {statusPopup.request && (statusPopup.kind === 'renew' || statusPopup.kind === 'moveout' || statusPopup.kind === 'move_room') && (
                      <TenantRequestDetailCard
                        request={{ ...statusPopup.request, type: statusPopup.kind }}
                        roomNumber={room?.room_number}
                      />
                    )}
                  </div>
                  {statusPopup.previousOf ? (
                    <button
                      type="button"
                      className="dashboard-status-link"
                      onClick={() => setStatusPopup(statusPopup.previousOf)}
                    >
                      ← กลับไปคำขอล่าสุด
                    </button>
                  ) : (
                    previousRequest && (
                      <button
                        type="button"
                        className="dashboard-status-link"
                        onClick={() =>
                          setStatusPopup({
                            kind: statusPopup.kind,
                            status: previousRequest.status,
                            request: previousRequest,
                            previousOf: statusPopup,
                          })
                        }
                      >
                        ดูคำขอก่อนหน้า ({formatDate(previousRequest.created_at)}) →
                      </button>
                    )
                  )}
                  <div className="dashboard-form-actions">
                    <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                      รับทราบ
                    </button>
                  </div>
                </div>
              )
            }}
          </Modal>
        )}

        {(() => {
          const parcel = parcelDetailId !== null ? parcels.find((item) => item.id === parcelDetailId) : null
          if (!parcel) return null
          const isPending = parcel.status === 'pending'
          const photos = parcel.photos || []
          return (
            <Modal title="รายละเอียดพัสดุ" onClose={() => setParcelDetailId(null)} variant="status">
              {(requestClose) => (
                <div className="dashboard-confirm-body dashboard-status-body">
                  <div className={`dashboard-status-hero ${isPending ? 'is-info' : 'is-success'}`}>
                    <div className={`dashboard-confirm-icon ${isPending ? 'is-info' : 'is-success'}`}>
                      <PackageIcon size={18} strokeWidth={2.2} />
                    </div>
                    <div className="dashboard-status-hero-text">
                      <span className="dashboard-status-hero-label">{isPending ? 'รอรับพัสดุ' : 'รับพัสดุเรียบร้อย'}</span>
                      <p className="dashboard-confirm-message">
                        {isPending
                          ? `พัสดุจาก ${parcel.sender_name || 'พัสดุทั่วไป'} รอคุณมารับที่จุดรับพัสดุ`
                          : `คุณรับพัสดุจาก ${parcel.sender_name || 'พัสดุทั่วไป'} แล้ว`}
                      </p>
                    </div>
                  </div>
                  <div className="dashboard-status-scroll" key={parcel.id}>
                    <ParcelProgress parcel={parcel} />
                    {photos.length > 0 && (
                      <ParcelGallery photos={photos} onOpen={(index) => setParcelPhotoPreview({ parcel, index })} />
                    )}
                    <div className="dashboard-maintenance-detail-card">
                      <h4 className="dashboard-detail-title">ข้อมูลพัสดุ</h4>
                      <div className="dashboard-maintenance-detail-row">
                        <span>ผู้ส่ง / ขนส่ง</span>
                        <strong>{parcel.sender_name || 'พัสดุทั่วไป'}</strong>
                      </div>
                      <div className="dashboard-maintenance-detail-row">
                        <span>เลขพัสดุ</span>
                        <strong>{parcel.tracking_number || 'ไม่มีเลขพัสดุ'}</strong>
                      </div>
                      <div className="dashboard-maintenance-detail-row">
                        <span>จำนวนรูป</span>
                        <strong>{photos.length} รูป</strong>
                      </div>
                      <div className="dashboard-maintenance-detail-row">
                        <span>สถานะ</span>
                        <strong className={isPending ? 'is-pending' : 'is-success'}>
                          {isPending ? 'รอรับพัสดุ' : 'รับแล้ว'}
                        </strong>
                      </div>
                      {parcel.description && (
                        <div className="dashboard-maintenance-detail-row is-note">
                          <span>รายละเอียด</span>
                          <strong>{parcel.description}</strong>
                        </div>
                      )}
                    </div>
                    <div className="dashboard-maintenance-detail-card">
                      <h4 className="dashboard-detail-title">การรับพัสดุ</h4>
                      <div className="dashboard-maintenance-detail-row">
                        <span>ผู้รับ</span>
                        <strong>
                          {customer.first_name} {customer.last_name}
                        </strong>
                      </div>
                      <div className="dashboard-maintenance-detail-row">
                        <span>ห้อง</span>
                        <strong>{room?.room_number ?? customer.room_number}</strong>
                      </div>
                      <div className="dashboard-maintenance-detail-row">
                        <span>บันทึกโดย</span>
                        <strong>{parcel.staff_name || 'เจ้าหน้าที่'}</strong>
                      </div>
                      <div className="dashboard-maintenance-detail-row">
                        <span>วันที่พัสดุมาถึง</span>
                        <strong>{formatDateTime(parcel.created_at)}</strong>
                      </div>
                      <div className="dashboard-maintenance-detail-row">
                        <span>วันที่รับพัสดุ</span>
                        <strong className={isPending ? 'is-pending' : ''}>
                          {isPending ? 'ยังไม่ได้รับ' : formatDateTime(parcel.received_at)}
                        </strong>
                      </div>
                      {!isPending && parcel.received_at && (
                        <div className="dashboard-maintenance-detail-row">
                          <span>ใช้เวลาก่อนรับ</span>
                          <strong>
                            {formatRemaining(new Date(parcel.received_at).getTime() - new Date(parcel.created_at).getTime())}
                          </strong>
                        </div>
                      )}
                    </div>
                    {isPending && (
                      <p className="dashboard-parcel-pickup-hint">
                        เมื่อรับพัสดุแล้ว กด "ยืนยันรับพัสดุ" ด้านล่างเพื่อแจ้งให้เจ้าหน้าที่ทราบ
                      </p>
                    )}
                  </div>
                  <div className="dashboard-form-actions">
                    <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                      ปิด
                    </button>
                    {isPending && (
                      <button
                        type="button"
                        className="dashboard-action-btn is-primary"
                        disabled={parcelReceiveId !== null}
                        onClick={() => {
                          setParcelDetailId(null)
                          setParcelReceiveConfirm(parcel)
                        }}
                      >
                        ยืนยันรับพัสดุ
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Modal>
          )
        })()}

        {parcelReceiveConfirm && (
          <Modal title="ยืนยันรับพัสดุ" onClose={() => setParcelReceiveConfirm(null)} variant="confirm">
            {(requestClose) => (
              <div className="dashboard-confirm-body">
                <div className="dashboard-confirm-icon is-info">
                  <PackageIcon size={24} strokeWidth={2.2} />
                </div>
                <p className="dashboard-confirm-message">ยืนยันว่าคุณได้รับพัสดุชิ้นนี้แล้วใช่หรือไม่?</p>
                <p className="dashboard-confirm-message-detail">
                  ผู้ส่ง: {parcelReceiveConfirm.sender_name || 'พัสดุทั่วไป'}
                  {parcelReceiveConfirm.tracking_number && <><br />เลขพัสดุ: {parcelReceiveConfirm.tracking_number}</>}
                  {parcelReceiveConfirm.description && <><br />รายละเอียด: {parcelReceiveConfirm.description}</>}
                </p>
                <div className="dashboard-form-actions">
                  <button
                    type="button"
                    className="dashboard-action-btn is-ghost"
                    disabled={parcelReceiveId !== null}
                    onClick={requestClose}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="dashboard-action-btn is-primary"
                    disabled={parcelReceiveId !== null}
                    onClick={async () => {
                      await handleReceiveParcel(parcelReceiveConfirm)
                      requestClose()
                    }}
                  >
                    {parcelReceiveId === parcelReceiveConfirm.id ? 'กำลังยืนยัน...' : 'ยืนยันรับพัสดุ'}
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {successPopup && (
          <Modal title="สำเร็จ" onClose={() => setSuccessPopup(null)} variant="success">
            {(requestClose) => (
              <div className="dashboard-confirm-body">
                <div className="dashboard-confirm-icon is-success">
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
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="dashboard-confirm-message">{successPopup}</p>
                <div className="dashboard-form-actions">
                  <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                    รับทราบ
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {reminders.length > 0 && (
          <div className="dashboard-reminders">
            {reminders.map((reminder, index) => (
              <div key={index} className={`alert alert-${reminder.type} dashboard-reminder`}>
                {reminder.text}
              </div>
            ))}
          </div>
        )}

        <ul className="nav nav-tabs dashboard-tabs">
          {CUSTOMER_TABS.map((tab) => (
            <li className="nav-item" key={tab.key}>
              <button
                type="button"
                className={`nav-link dashboard-tab-link${customerTab === tab.key ? ' active' : ''}`}
                onClick={() => selectCustomerTab(tab.key)}
              >
                {tab.label}
                {tab.key === 'parcels' && pendingParcels.length > 0 && (
                  <span className="dashboard-parcel-tab-count" aria-label={`${pendingParcels.length} รายการรอรับ`}>
                    {pendingParcels.length}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {customerTab === 'parcels' && (
          <section
            className="dashboard-card dashboard-parcels-card"
            aria-labelledby="customer-parcels-title"
            style={{ '--parcel-page-size': PARCEL_PAGE_SIZE }}
          >
            <div className="dashboard-card-header dashboard-parcels-header">
              <div>
                <span className="dashboard-parcels-eyebrow">บริการรับพัสดุ</span>
                <h2 id="customer-parcels-title">พัสดุของฉัน</h2>
                <p>ตรวจสอบพัสดุที่เจ้าหน้าที่บันทึกไว้ และยืนยันเมื่อได้รับแล้ว</p>
              </div>
              <div className="dashboard-parcel-summary" aria-label="สรุปรายการพัสดุ">
                <div className="dashboard-parcel-summary-item is-pending">
                  <span>รอรับ</span>
                  <strong>{pendingParcels.length}</strong>
                </div>
                <div className="dashboard-parcel-summary-item is-received">
                  <span>รับแล้ว</span>
                  <strong>{receivedParcels.length}</strong>
                </div>
              </div>
            </div>

            <div className="dashboard-parcel-notice">
              <span className="dashboard-parcel-notice-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 7 9-4 9 4-9 4-9-4Z" />
                  <path d="M3 7v10l9 4 9-4V7" />
                  <path d="M12 11v10" />
                </svg>
              </span>
              <p>เมื่อได้รับพัสดุแล้ว กรุณากดยืนยันรับเพื่ออัปเดตสถานะให้เจ้าหน้าที่ทราบ</p>
            </div>

            <div className="dashboard-parcel-filters">
              <div className="dashboard-parcel-segments" role="tablist" aria-label="กรองตามสถานะ">
                {[
                  { key: 'all', label: 'ทั้งหมด', count: parcels.length },
                  { key: 'pending', label: 'รอรับ', count: pendingParcels.length },
                  { key: 'received', label: 'รับแล้ว', count: receivedParcels.length },
                ].map((option) => (
                  <button
                    type="button"
                    role="tab"
                    key={option.key}
                    aria-selected={parcelStatusFilter === option.key}
                    className={`dashboard-parcel-segment is-${option.key}${parcelStatusFilter === option.key ? ' is-active' : ''}`}
                    onClick={() => {
                      setParcelStatusFilter(option.key)
                      setParcelPage(1)
                    }}
                  >
                    {option.label}
                    <span>{option.count}</span>
                  </button>
                ))}
              </div>

              <div className="dashboard-parcel-toolbar">
                <label className="dashboard-parcel-search">
                  <span>ค้นหาพัสดุ</span>
                  <span className="dashboard-parcel-search-control">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                    <input
                      type="search"
                      value={parcelSearch}
                      onChange={(event) => {
                        setParcelSearch(event.target.value)
                        setParcelPage(1)
                      }}
                      placeholder="ค้นหาผู้ส่ง เลขพัสดุ หรือรายละเอียด"
                    />
                  </span>
                </label>
                <div className="dashboard-parcel-filter is-date">
                  <span>ตั้งแต่วันที่</span>
                  <ThaiDatePicker
                    className="dashboard-parcel-date-input"
                    placeholder="วันที่เริ่ม"
                    value={parcelDateFrom}
                    maxDate={dayKeyToDate(parcelDateTo)}
                    isClearable
                    onChange={(date) => {
                      setParcelDateFrom(date)
                      setParcelPage(1)
                    }}
                  />
                </div>
                <div className="dashboard-parcel-filter is-date">
                  <span>ถึงวันที่</span>
                  <ThaiDatePicker
                    className="dashboard-parcel-date-input"
                    placeholder="วันที่สิ้นสุด"
                    value={parcelDateTo}
                    minDate={dayKeyToDate(parcelDateFrom)}
                    isClearable
                    onChange={(date) => {
                      setParcelDateTo(date)
                      setParcelPage(1)
                    }}
                  />
                </div>
                <label className="dashboard-parcel-filter">
                  <span>เรียงตาม</span>
                  <select
                    value={parcelSort}
                    onChange={(event) => {
                      setParcelSort(event.target.value)
                      setParcelPage(1)
                    }}
                  >
                    <option value="newest">ใหม่สุดก่อน</option>
                    <option value="oldest">เก่าสุดก่อน</option>
                  </select>
                </label>
              </div>

              <div className="dashboard-parcel-result-bar">
                <span>
                  พบ <strong>{filteredParcels.length}</strong> จาก {parcels.length} รายการ
                </span>
                {parcelFiltersActive && (
                  <button type="button" className="dashboard-parcel-clear" onClick={resetParcelFilters}>
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
            </div>

            <div className="dashboard-parcel-results" ref={parcelResultsRef} role="region" aria-label="รายการพัสดุ" tabIndex={0}>
              {filteredParcels.length === 0 ? (
                <div className="dashboard-parcel-empty">
                  <span className="dashboard-parcel-empty-icon" aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 7 9-4 9 4-9 4-9-4Z" />
                      <path d="M3 7v10l9 4 9-4V7" />
                      <path d="M12 11v10" />
                    </svg>
                  </span>
                  <strong>{parcels.length ? 'ไม่พบพัสดุที่ตรงกับการค้นหา' : 'ยังไม่มีพัสดุในรายการ'}</strong>
                  <span>{parcels.length ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ' : 'เมื่อมีพัสดุมาถึง เจ้าหน้าที่จะบันทึกรายการไว้ที่นี่'}</span>
                </div>
              ) : (
                <div className="dashboard-parcel-list">
                  {pagedParcels.map((parcel) => {
                    const isPending = parcel.status === 'pending'
                    const loggedAt = new Date(parcel.created_at)
                    return (
                      <article className={`dashboard-parcel-item${isPending ? ' is-pending' : ' is-received'}`} key={parcel.id}>
                        <div className="dashboard-parcel-date">
                          <strong>{loggedAt.getDate()}</strong>
                          <small>{loggedAt.toLocaleDateString('th-TH', { month: 'short' })}</small>
                        </div>

                        <div
                          className="dashboard-parcel-entry is-clickable"
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายละเอียดพัสดุจาก ${parcel.sender_name || 'พัสดุทั่วไป'}`}
                          onClick={() => setParcelDetailId(parcel.id)}
                          onKeyDown={(event) => {
                            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault()
                              setParcelDetailId(parcel.id)
                            }
                          }}
                        >
                          <div className="dashboard-parcel-entry-body">
                            <div className="dashboard-parcel-entry-main">
                              <div className="dashboard-parcel-entry-head">
                                <div className="dashboard-parcel-entry-title">
                                  <strong>{parcel.sender_name || 'พัสดุทั่วไป'}</strong>
                                  <span className="dashboard-parcel-tags">
                                    {parcel.tracking_number && <span className="dashboard-parcel-tag is-code">{parcel.tracking_number}</span>}
                                  </span>
                                </div>
                                <span className={`dashboard-parcel-status${isPending ? ' is-pending' : ' is-received'}`}>
                                  {isPending ? 'รอรับพัสดุ' : 'รับแล้ว'}
                                </span>
                              </div>

                              {parcel.description && <p className="dashboard-parcel-desc">{parcel.description}</p>}

                              <div className="dashboard-parcel-meta">
                                <span>บันทึกโดย {parcel.staff_name || 'เจ้าหน้าที่'}</span>
                              </div>

                              <ParcelProgress parcel={parcel} compact />
                            </div>

                            {parcel.photos?.length > 0 ? (
                              <button
                                type="button"
                                className="dashboard-parcel-cover"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setParcelPhotoPreview({ parcel, index: 0 })
                                }}
                                aria-label="ดูรูปพัสดุ"
                              >
                                <img src={parcel.photos[0].url} alt={parcel.photos[0].name || 'รูปพัสดุ'} loading="lazy" />
                                {parcel.photos.length > 1 && <span>+{parcel.photos.length - 1}</span>}
                              </button>
                            ) : (
                              <span className="dashboard-parcel-cover is-empty" aria-hidden="true">
                                <PackageIcon size={22} strokeWidth={1.8} />
                              </span>
                            )}
                          </div>

                          {parcelReceiveErrorId === parcel.id && (
                            <p className="dashboard-parcel-error" role="alert">{parcelReceiveError}</p>
                          )}

                          <div className="dashboard-parcel-entry-foot">
                            <span className="dashboard-parcel-more">ดูรายละเอียด</span>
                            {isPending && (
                              <button
                                type="button"
                                className="dashboard-action-btn is-primary"
                                disabled={parcelReceiveId !== null}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setParcelReceiveConfirm(parcel)
                                }}
                              >
                                {parcelReceiveId === parcel.id ? 'กำลังยืนยัน...' : 'ยืนยันว่าได้รับพัสดุแล้ว'}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="dashboard-maintenance-pagination dashboard-parcel-pagination">
              <button
                type="button"
                className="dashboard-notif-page-btn"
                disabled={parcelCurrentPage <= 1}
                onClick={() => setParcelPage(Math.max(1, parcelCurrentPage - 1))}
              >
                ก่อนหน้า
              </button>
              <span className="dashboard-notif-page-info">
                หน้า {parcelCurrentPage} / {parcelTotalPages}
              </span>
              <button
                type="button"
                className="dashboard-notif-page-btn"
                disabled={parcelCurrentPage >= parcelTotalPages}
                onClick={() => setParcelPage(Math.min(parcelTotalPages, parcelCurrentPage + 1))}
              >
                ถัดไป
              </button>
            </div>
          </section>
        )}

        {customerTab === 'announcements' && (
          <AnnouncementBoard
            key={announcementFocus?.nonce ?? 'board'}
            variant="dashboard"
            announcements={announcements}
            openId={announcementFocus?.id}
          />
        )}

        {customerTab === 'profile' && (
          <div className="dashboard-card dashboard-profile-card">
            <div className="dashboard-card-header">
              <div>
                <h2>โปรไฟล์และรหัสผ่าน</h2>
                <p className="dashboard-profile-subtitle">แก้ไขเบอร์โทรศัพท์ และเปลี่ยนรหัสผ่านของคุณ</p>
              </div>
            </div>
            <form className="dashboard-inline-form dashboard-profile-form" onSubmit={handleProfileSubmit}>
              <div className="dashboard-profile-grid">
                <section className="dashboard-profile-section">
                  <h3 className="dashboard-section-title">ข้อมูลส่วนตัว</h3>
                  <p className="dashboard-profile-hint">ชื่อและนามสกุลอ้างอิงตามข้อมูลที่ลงทะเบียน ไม่สามารถแก้ไขได้</p>
                  <ProfileField
                    id="profile-first-name"
                    label="ชื่อ"
                    icon="lock"
                    autoComplete="given-name"
                    disabled
                    value={customer.first_name || ''}
                  />
                  <ProfileField
                    id="profile-last-name"
                    label="นามสกุล"
                    icon="lock"
                    autoComplete="family-name"
                    disabled
                    value={customer.last_name || ''}
                  />
                  <ProfileField
                    id="profile-phone"
                    label="เบอร์โทรศัพท์"
                    icon="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="เช่น 0812345678"
                    maxLength={10}
                    autoComplete="tel"
                    required
                    invalid={Boolean(profileForm.phone) && !/^0\d{8,9}$/.test(profileForm.phone)}
                    hint={
                      profileForm.phone && !/^0\d{8,9}$/.test(profileForm.phone)
                        ? 'ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก'
                        : 'ตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0'
                    }
                    hintTone={profileForm.phone && !/^0\d{8,9}$/.test(profileForm.phone) ? 'error' : undefined}
                    value={profileForm.phone}
                    onChange={(event) => setProfileForm((form) => ({ ...form, phone: event.target.value.replace(/\D/g, '') }))}
                  />
                </section>
                <section className="dashboard-profile-section">
                  <h3 className="dashboard-section-title">เปลี่ยนรหัสผ่าน</h3>
                  <p className="dashboard-profile-hint">หากไม่ต้องการเปลี่ยนรหัสผ่าน ให้เว้นช่องด้านล่างว่างไว้</p>
                  <ProfileField
                    id="profile-current-password"
                    label="รหัสผ่านปัจจุบัน"
                    icon="lock"
                    type="password"
                    placeholder="กรอกเมื่อต้องการเปลี่ยนรหัสผ่าน"
                    autoComplete="current-password"
                    value={profileForm.current_password}
                    onChange={(event) => setProfileForm((form) => ({ ...form, current_password: event.target.value }))}
                  />
                  <ProfileField
                    id="profile-new-password"
                    label="รหัสผ่านใหม่"
                    icon="lock"
                    type="password"
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    autoComplete="new-password"
                    minLength={6}
                    invalid={Boolean(profileForm.new_password) && profileForm.new_password.length < 6}
                    hint={
                      profileForm.new_password && profileForm.new_password.length < 6
                        ? 'ต้องมีอย่างน้อย 6 ตัวอักษร'
                        : profileForm.new_password
                          ? 'ความยาวใช้ได้'
                          : 'อย่างน้อย 6 ตัวอักษร'
                    }
                    hintTone={
                      profileForm.new_password
                        ? profileForm.new_password.length < 6
                          ? 'error'
                          : 'ok'
                        : undefined
                    }
                    value={profileForm.new_password}
                    onChange={(event) => setProfileForm((form) => ({ ...form, new_password: event.target.value }))}
                  />
                  <ProfileField
                    id="profile-confirm-password"
                    label="ยืนยันรหัสผ่านใหม่"
                    icon="lock"
                    type="password"
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                    autoComplete="new-password"
                    minLength={6}
                    invalid={Boolean(profileForm.confirm_password) && profileForm.confirm_password !== profileForm.new_password}
                    hint={
                      profileForm.confirm_password
                        ? profileForm.confirm_password === profileForm.new_password
                          ? 'รหัสผ่านตรงกัน'
                          : 'รหัสผ่านไม่ตรงกัน'
                        : undefined
                    }
                    hintTone={
                      profileForm.confirm_password
                        ? profileForm.confirm_password === profileForm.new_password
                          ? 'ok'
                          : 'error'
                        : undefined
                    }
                    value={profileForm.confirm_password}
                    onChange={(event) => setProfileForm((form) => ({ ...form, confirm_password: event.target.value }))}
                  />
                </section>
              </div>
              {profileError && <p className="dashboard-form-error">{profileError}</p>}
              <div className="dashboard-form-actions">
                <button type="button" className="dashboard-action-btn is-ghost" onClick={resetProfileForm}>
                  คืนค่าเดิม
                </button>
                <button type="submit" className="dashboard-action-btn is-primary" disabled={profileSubmitting}>
                  {profileSubmitting ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
                </button>
              </div>
            </form>
          </div>
        )}

        {customerTab === 'home' && (
          <>
            <div className="row g-3">
              <div className="col-12 col-lg-4">
                <div className="dashboard-card">
                  <h2>ห้องของฉัน</h2>
                  {room ? (
                    <>
                      <p className="dashboard-room-number">ห้อง {room.room_number}</p>
                      {Boolean(room.is_booked) && room.rental_start_date && room.rental_end_date && (
                        <>
                          <h3 className="dashboard-section-title">ระยะเวลาการเช่า</h3>
                          <p className="dashboard-rental-duration">
                            {formatRentalDuration(room.rental_start_date, room.rental_end_date)}
                          </p>
                          <p className="dashboard-rental-period">
                            <CalendarIcon />
                            {formatDateTime(room.rental_start_date)} ถึง {formatDateTime(room.rental_end_date)}
                          </p>
                          {!hasStarted && msUntilStart !== null && (
                            <div className="dashboard-countdown-card is-pending">
                              <ClockIcon />
                              <div>
                                <p className="dashboard-countdown-label">เริ่มสัญญาในอีก</p>
                                <p className="dashboard-countdown-value">{formatRemaining(msUntilStart)}</p>
                              </div>
                            </div>
                          )}
                          {msLeft !== null && (
                            <div
                              className={`dashboard-countdown-card${isExpired ? ' is-expired' : isWarning ? ' is-warning' : ' is-active'}`}
                            >
                              <ClockIcon />
                              <div>
                                <p className="dashboard-countdown-label">{isExpired ? 'หมดสัญญาแล้ว' : 'เหลือเวลาในสัญญา'}</p>
                                <p className="dashboard-countdown-value">{formatRemaining(msLeft)}</p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      <h3 className="dashboard-section-title">สิ่งอำนวยความสะดวก</h3>
                      <div className="dashboard-amenities">
                        {AMENITIES.map((amenity) => (
                          <span
                            key={amenity.key}
                            className={`dashboard-amenity${room[amenity.key] ? ` is-${amenity.color}` : ' is-off'}`}
                          >
                            <AmenityIcon name={amenity.key} />
                            {amenity.label}
                          </span>
                        ))}
                        <span className="dashboard-amenity is-indigo">
                          <AmenityIcon name="bed" />
                          เตียง {room.bed ?? 0} เตียง
                        </span>
                      </div>

                      <h3 className="dashboard-section-title">ค่าน้ำ - ค่าไฟ</h3>
                      <div className="dashboard-utility-rates">
                        <div className="dashboard-utility-rate is-electric">
                          <span>ค่าไฟฟ้า</span>
                          <strong>{formatCurrency(room.electricity_unit_price)} บาท/หน่วย</strong>
                        </div>
                        <div className="dashboard-utility-rate is-water">
                          <span>ค่าน้ำ</span>
                          <strong>{formatCurrency(room.water_price)} บาท/เดือน</strong>
                        </div>
                      </div>

                      {currentDue && currentDue.status !== 'paid' && (
                        <>
                          <h3 className="dashboard-section-title with-aside">
                            ยอดชำระเดือนนี้
                            {currentDue.periodStart && currentDue.periodEnd && (
                              <span className="dashboard-due-period">
                                ค่าเช่ารอบ {formatDate(currentDue.periodStart)} - {formatDate(currentDue.periodEnd)}
                              </span>
                            )}
                          </h3>
                          <div className="dashboard-due-box">
                            <span className="dashboard-due-amount">฿{formatCurrency(currentDue.amount)}</span>
                            <span className={`dashboard-badge status-${dueBadgeClass(currentDue.status)}`}>
                              {DUE_STATUS_LABEL[currentDue.status] || currentDue.status}
                            </span>
                          </div>
                          {currentDue.items?.length > 0 && (
                            <button
                              type="button"
                              className="dashboard-due-breakdown-toggle"
                              onClick={() => setShowDueBreakdown((prev) => !prev)}
                              aria-expanded={showDueBreakdown}
                            >
                              {showDueBreakdown ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดแยกรายการ'}
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
                                style={{ transform: showDueBreakdown ? 'rotate(180deg)' : 'none' }}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>
                          )}
                          {showDueBreakdown && currentDue.items?.length > 0 && (
                            <div className="dashboard-due-breakdown">
                              {currentDue.items.map((item, index) => (
                                <div className="dashboard-due-breakdown-row" key={item.id ?? `${item.type}-${index}`}>
                                  <span>{item.label}</span>
                                  <strong>฿{formatCurrency(item.amount)}</strong>
                                </div>
                              ))}
                            </div>
                          )}
                          {currentDue.depositApplied > 0 && (
                            <p className="dashboard-due-deposit-note">
                              หักมัดจำ ฿{formatCurrency(currentDue.depositApplied)} แล้ว
                            </p>
                          )}
                          {currentDue.overdueMonths > 0 && (
                            <p className="dashboard-due-deposit-note is-warning">
                              มีค่าเช่าค้างสะสมจากเดือนก่อนหน้า {currentDue.overdueMonths} เดือน ทบรวมในยอดนี้แล้ว
                            </p>
                          )}
                          {currentDue.lumpSumMonths && (
                            <p className="dashboard-due-deposit-note">
                              รวมค่าเช่าล่วงหน้า {currentDue.lumpSumMonths} เดือน
                            </p>
                          )}
                          {currentDue.dueDate && (
                            <p className="dashboard-due-date">กำหนดชำระภายในวันที่ {formatDate(currentDue.dueDate)}</p>
                          )}

                          <div className="dashboard-due-pay-actions">
                            {paymentUnderReview ? (
                              <span className="dashboard-badge status-pending">ส่งสลิปแล้ว · รอเจ้าหน้าที่ตรวจสอบ</span>
                            ) : (
                              <button type="button" className="dashboard-action-btn is-primary" onClick={openPaymentForm}>แนบสลิปโอนเงิน</button>
                            )}
                          </div>
                          {showPaymentForm && (
                            <Modal title="ชำระเงินและแนบสลิป" onClose={() => setShowPaymentForm(false)} variant="confirm">
                              {(requestClose) => (
                                <form className="dashboard-inline-form" onSubmit={handleConfirmPayment}>
                                  <div className="dashboard-qr-box">
                                    <span className="dashboard-qr-badge">PromptPay</span>
                                    <FakeQrCode />
                                    <p className="dashboard-qr-amount">฿{formatCurrency(currentDue.amount)}</p>
                                    <p className="dashboard-qr-hint">
                                      {currentDue.lumpSumMonths
                                        ? `ยอดรวมค่าเช่าล่วงหน้า ${currentDue.lumpSumMonths} เดือน — สแกนผ่านแอปธนาคารเพื่อชำระเงิน`
                                        : 'สแกนผ่านแอปธนาคารเพื่อชำระเงิน'}
                                    </p>
                                  </div>
                                  <span className="slip-field-label">แนบสลิปโอนเงิน</span>
                                  <SlipDropZone
                                    id="payment-slip-file"
                                    file={paymentSlip}
                                    onChange={setPaymentSlip}
                                    onError={setPaymentError}
                                  />
                                  {paymentError && <p className="dashboard-form-error">{paymentError}</p>}
                                  <div className="dashboard-form-actions">
                                    <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                                      ยกเลิก
                                    </button>
                                    <button type="submit" className="dashboard-action-btn is-primary" disabled={paymentSubmitting}>
                                      {paymentSubmitting ? 'กำลังส่งสลิป...' : 'ส่งสลิปรอตรวจสอบ'}
                                    </button>
                                  </div>
                                </form>
                              )}
                            </Modal>
                          )}
                        </>
                      )}

                      {isPrepaid && (
                        <>
                          <h3 className="dashboard-section-title">ยอดชำระเดือนนี้</h3>
                          <p className="dashboard-prepaid-note">
                            ชำระค่าเช่าล่วงหน้าแบบทบยอดไว้แล้วถึงวันที่ {formatDate(room.prepaid_until)} —
                            ระบบจะเริ่มแสดงยอดชำระรายเดือนอีกครั้งหลังจากวันนั้น
                          </p>
                        </>
                      )}
                    </>
                  ) : (
                    <p className="dashboard-empty">ไม่พบข้อมูลห้องพัก</p>
                  )}
                </div>
              </div>

              <div className="col-12 col-lg-8">
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <h2>ประวัติการเช่าและการชำระค่าเช่า</h2>
                  </div>
                  {rentalHistory.length > 0 &&
                    (() => {
                      const activePayments = rentalHistoryWithDue[activeHistoryIndex]?.payments || []
                      const countOf = (status) => activePayments.filter((payment) => payment.status === status).length
                      return (
                        <DashboardFilterPanel
                          segments={[
                            { key: 'all', label: 'ทั้งหมด', count: activePayments.length },
                            { key: 'paid', label: 'ชำระแล้ว', count: countOf('paid'), tone: 'success' },
                            { key: 'pending', label: 'รอชำระ', count: countOf('pending'), tone: 'warning' },
                            { key: 'overdue', label: 'ค้างชำระ', count: countOf('overdue'), tone: 'danger' },
                          ]}
                          active={historyStatusFilter}
                          onSegment={setHistoryStatusFilter}
                          search={historySearch}
                          onSearch={setHistorySearch}
                          searchPlaceholder="ค้นหาวันที่ รายการ จำนวนเงิน หรือหมายเหตุ"
                          resultText={`พบ ${filteredRentalHistory[activeHistoryIndex]?.payments.length ?? 0} จาก ${activePayments.length} รายการ (ห้อง ${filteredRentalHistory[activeHistoryIndex]?.room_number ?? '-'})`}
                          canClear={historyStatusFilter !== 'all' || Boolean(historySearch.trim())}
                          onClear={() => {
                            setHistoryStatusFilter('all')
                            setHistorySearch('')
                          }}
                        />
                      )
                    })()}
                  {rentalHistory.length === 0 ? (
                    <p className="dashboard-empty">ยังไม่มีประวัติการเช่า</p>
                  ) : (
                    <>
                    {filteredRentalHistory.length > 1 && (
                      <div className="dashboard-history-rooms">
                        <p className="dashboard-history-rooms-hint">
                          คุณเคยพักมากกว่า 1 ห้อง เลือกห้องเพื่อดูประวัติการชำระของห้องนั้น
                        </p>
                        <div className="dashboard-history-tabs" role="tablist" aria-label="เลือกห้องที่ต้องการดูประวัติ">
                          {filteredRentalHistory.map((entry, index) => {
                            const { movedOut } = getBookingTransfer(index)
                            const isCurrent = index === 0 && Boolean(room?.is_booked)
                            const isActive = index === activeHistoryIndex
                            const paymentCount = rentalHistory[index]?.payments?.length || 0
                            return (
                              <Fragment key={entry.booking_id}>
                                {index > 0 && (
                                  <span className="dashboard-history-tab-link" aria-hidden="true" title="ย้ายห้อง">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M19 12H5" />
                                      <path d="M11 6l-6 6 6 6" />
                                    </svg>
                                  </span>
                                )}
                                <button
                                  type="button"
                                  role="tab"
                                  aria-selected={isActive}
                                  className={`dashboard-history-tab${isActive ? ' is-active' : ''}${isCurrent ? ' is-current' : ' is-past'}`}
                                  onClick={() => setHistoryBookingId(entry.booking_id)}
                                >
                                  <span className="dashboard-history-tab-top">
                                    <strong>ห้อง {entry.room_number}</strong>
                                    <em>{isCurrent ? 'ห้องปัจจุบัน' : 'ห้องเดิม'}</em>
                                  </span>
                                  <span className="dashboard-history-tab-dates">
                                    {formatDate(entry.rental_start_date)} –{' '}
                                    {isCurrent
                                      ? 'ปัจจุบัน'
                                      : formatDate(movedOut ? movedOut.completed_at : entry.rental_end_date)}
                                  </span>
                                  <span className="dashboard-history-tab-meta">
                                    {movedOut ? `ย้ายไปห้อง ${movedOut.target_room_number}` : `${paymentCount} รายการชำระ`}
                                  </span>
                                </button>
                              </Fragment>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {[filteredRentalHistory[activeHistoryIndex]].map((entry) => {
                      const { movedIn, movedOut } = getBookingTransfer(activeHistoryIndex)
                      const originalEntry =
                        rentalHistoryWithDue.find((item) => item.booking_id === entry.booking_id) || entry
                      const totalPages = Math.max(1, Math.ceil(entry.payments.length / RENTAL_HISTORY_PAGE_SIZE))
                      const currentPage = Math.min(historyPageByBooking[entry.booking_id] || 1, totalPages)
                      const paginatedPayments = entry.payments.slice(
                        (currentPage - 1) * RENTAL_HISTORY_PAGE_SIZE,
                        currentPage * RENTAL_HISTORY_PAGE_SIZE,
                      )
                      const setBookingPage = (page) =>
                        setHistoryPageByBooking((prev) => ({ ...prev, [entry.booking_id]: page }))
                      return (
                        <div key={entry.booking_id} className="dashboard-rental-entry">
                          <div className="dashboard-rental-entry-header">
                            <p className="dashboard-rental-entry-title">
                              ห้อง {entry.room_number}
                              {entry.rental_start_date && (movedOut || entry.rental_end_date) && (
                                <span className="dashboard-rental-entry-dates">
                                  {' '}
                                  ({formatDate(entry.rental_start_date)} -{' '}
                                  {formatDate(movedOut ? movedOut.completed_at : entry.rental_end_date)})
                                </span>
                              )}
                            </p>
                            {originalEntry.payments.some((payment) => payment.status === 'paid') && (
                              <button
                                type="button"
                                className="dashboard-action-btn is-ghost dashboard-receipt-all-btn"
                                disabled={receiptGenerating}
                                onClick={() => requestCombinedReceipt(originalEntry)}
                              >
                                {receiptGenerating && receiptRequest?.mode === 'all' && receiptRequest.entry.booking_id === entry.booking_id
                                  ? 'กำลังสร้าง...'
                                  : 'ดาวน์โหลดใบเสร็จรวม (PDF)'}
                              </button>
                            )}
                          </div>
                          {(movedIn || movedOut) && (
                            <p className="dashboard-history-transfer-note">
                              {movedOut
                                ? `ย้ายไปห้อง ${movedOut.target_room_number} เมื่อ ${formatDate(movedOut.completed_at)} — รายการด้านล่างเป็นของห้อง ${entry.room_number} เท่านั้น`
                                : `ย้ายมาจากห้อง ${movedIn.room_number} เมื่อ ${formatDate(movedIn.completed_at)} — ดูประวัติห้องเดิมได้จากแท็บด้านบน`}
                            </p>
                          )}
                          {entry.payments.length === 0 ? (
                            <p className="dashboard-empty">
                              {entry.hasOriginalPayments ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีประวัติการชำระค่าเช่า'}
                            </p>
                          ) : (
                            <>
                              <div className="table-responsive">
                                <table className="dashboard-table">
                                  <thead>
                                    <tr>
                                      <th>วันที่ชำระ</th>
                                      <th>รายการ</th>
                                      <th>จำนวนเงิน</th>
                                      <th>สถานะ</th>
                                      <th>หมายเหตุ</th>
                                      <th>ใบเสร็จ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {paginatedPayments.map((payment) => (
                                      <tr key={payment.id}>
                                        <td>{formatDateTime(payment.created_at)}</td>
                                        <td>{PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง'}</td>
                                        <td>฿{formatCurrency(payment.amount)}</td>
                                        <td>
                                          <span className={`dashboard-badge status-${payment.status}`}>
                                            {payment.status === 'pending' && payment.slip_path ? 'รอตรวจสอบสลิป' : STATUS_LABEL[payment.status] || payment.status}
                                          </span>
                                        </td>
                                        <td>{formatCustomerNote(payment.note)}</td>
                                        <td>
                                          {payment.status !== 'paid' ? (
                                            <span className="dashboard-empty-cell">-</span>
                                          ) : (
                                            <button
                                              type="button"
                                              className="dashboard-receipt-btn"
                                              disabled={receiptGenerating}
                                              onClick={() => requestSingleReceipt(entry, payment)}
                                              aria-label="ดาวน์โหลดใบเสร็จ"
                                              title="ดาวน์โหลดใบเสร็จ (PDF)"
                                            >
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
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="7 10 12 15 17 10" />
                                                <line x1="12" y1="15" x2="12" y2="3" />
                                              </svg>
                                              ใบเสร็จ
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {totalPages > 1 && (
                                <div className="dashboard-maintenance-pagination">
                                  <button
                                    type="button"
                                    className="dashboard-notif-page-btn"
                                    disabled={currentPage <= 1}
                                    onClick={() => setBookingPage(Math.max(1, currentPage - 1))}
                                  >
                                    ก่อนหน้า
                                  </button>
                                  <span className="dashboard-notif-page-info">
                                    หน้า {currentPage} / {totalPages}
                                  </span>
                                  <button
                                    type="button"
                                    className="dashboard-notif-page-btn"
                                    disabled={currentPage >= totalPages}
                                    onClick={() => setBookingPage(Math.min(totalPages, currentPage + 1))}
                                  >
                                    ถัดไป
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="row g-3 mt-1">
              {(room?.is_booked || moveoutRequest?.status === 'approved') && (
                <div className="col-12 col-lg-5">
                  <div className="dashboard-card">
                    <h2>จัดการสัญญาเช่า</h2>
                    <div className="dashboard-request-list">
                      {room?.is_booked && (
                        <div className={`dashboard-request-row${renewRequest && RENEW_STATUS_POPUP_CONTENT[renewRequest.status] ? ' has-detail-link' : ''}`}>
                          <div className="dashboard-request-info">
                            <p className="dashboard-request-title">ต่อสัญญา</p>
                            <p className="dashboard-request-desc">
                              {(!canResubmitRenew && renewRequest?.status !== 'pending' && RENEW_STATUS_POPUP_CONTENT[renewRequest?.status]?.message)
                                || (renewRequest?.status === 'pending'
                                  ? `ขอต่อ ${RENEW_DURATION_LABEL[renewRequest.renew_duration_months] || `${renewRequest.renew_duration_months} เดือน`} · ${RENEW_PAYMENT_TYPE_LABEL[renewRequest.renew_payment_type] || renewRequest.renew_payment_type}`
                                  : 'ขอต่ออายุสัญญาเช่าห้องนี้เมื่อใกล้ครบกำหนด')}
                            </p>
                          </div>
                          {!canResubmitRenew && RENEW_STATUS_POPUP_CONTENT[renewRequest?.status] ? (
                            <button
                              type="button"
                              className={`dashboard-badge status-${tenantRequestBadgeClass(renewRequest.status)} dashboard-badge-btn`}
                              onClick={() => setStatusPopup({ kind: 'renew', status: renewRequest.status, request: renewRequest })}
                            >
                              {TENANT_REQUEST_STATUS_LABEL[renewRequest.status]}
                            </button>
                          ) : (
                            <button type="button" className="dashboard-action-btn is-primary" onClick={() => openRequestForm('renew')}>
                              ต่อสัญญา
                            </button>
                          )}
                          {renewRequest && RENEW_STATUS_POPUP_CONTENT[renewRequest.status] && (
                            <RequestTimeline kind="renew" request={renewRequest} compact />
                          )}
                          {renewRequest && RENEW_STATUS_POPUP_CONTENT[renewRequest.status] && (
                            <button
                              type="button"
                              className="dashboard-maintenance-more"
                              onClick={() => setStatusPopup({ kind: 'renew', status: renewRequest.status, request: renewRequest })}
                            >
                              ดูรายละเอียด
                            </button>
                          )}
                        </div>
                      )}
                      <div className={`dashboard-request-row${moveoutRequest && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest.status] ? ' has-detail-link' : ''}`}>
                        <div className="dashboard-request-info">
                          <p className="dashboard-request-title">แจ้งย้ายออก</p>
                          <p className="dashboard-request-desc">
                            {(moveoutRequest?.status !== 'rejected' && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest?.status]?.message)
                              || 'แจ้งความประสงค์ย้ายออกก่อนสิ้นสุดสัญญา'}
                          </p>
                        </div>
                        {moveoutRequest?.status !== 'rejected' && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest?.status] ? (
                          <button
                            type="button"
                            className={`dashboard-badge status-${tenantRequestBadgeClass(moveoutRequest.status)} dashboard-badge-btn`}
                            onClick={() => setStatusPopup({ kind: 'moveout', status: moveoutRequest.status, request: moveoutRequest })}
                          >
                            {TENANT_REQUEST_STATUS_LABEL[moveoutRequest.status]}
                          </button>
                        ) : (
                          room?.is_booked && (
                            <button type="button" className="dashboard-action-btn is-danger" onClick={() => openRequestForm('moveout')}>
                              แจ้งย้ายออก
                            </button>
                          )
                        )}
                        {moveoutRequest && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest.status] && (
                          <RequestTimeline kind="moveout" request={moveoutRequest} compact />
                        )}
                        {moveoutRequest && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest.status] && (
                          <button
                            type="button"
                            className="dashboard-maintenance-more"
                            onClick={() => setStatusPopup({ kind: 'moveout', status: moveoutRequest.status, request: moveoutRequest })}
                          >
                            ดูรายละเอียด
                          </button>
                        )}
                      </div>
                      <div className={`dashboard-request-row${moveRoomRequest ? ' has-detail-link' : ''}`}>
                        <div className="dashboard-request-info">
                          <p className="dashboard-request-title">ย้ายห้อง</p>
                          <p className="dashboard-request-desc">
                            {moveRoomRequest && ['pending', 'in_progress'].includes(moveRoomRequest.status)
                              ? `กำลังขอย้ายไปห้อง ${moveRoomRequest.target_room_number}`
                              : availableRooms.length > 0
                                ? 'ส่งคำขอย้ายไปยังห้องพักที่ว่าง'
                                : 'ขณะนี้ไม่มีห้องว่างให้เลือก'}
                          </p>
                        </div>
                        {moveRoomRequest && ['pending', 'in_progress'].includes(moveRoomRequest.status) ? (
                          <button
                            type="button"
                            className={`dashboard-badge status-${tenantRequestBadgeClass(moveRoomRequest.status)} dashboard-badge-btn`}
                            onClick={() => setStatusPopup({ kind: 'move_room', status: moveRoomRequest.status, request: moveRoomRequest })}
                          >
                            {TENANT_REQUEST_STATUS_LABEL[moveRoomRequest.status]}
                          </button>
                        ) : (
                          room?.is_booked && availableRooms.length > 0 && (
                            <button type="button" className="dashboard-action-btn is-primary" onClick={() => openRequestForm('move_room')}>
                              ย้ายห้อง
                            </button>
                          )
                        )}
                        {moveRoomRequest && <RequestTimeline kind="move_room" request={moveRoomRequest} compact />}
                        {moveRoomRequest && (
                          <button
                            type="button"
                            className="dashboard-maintenance-more"
                            onClick={() => setStatusPopup({ kind: 'move_room', status: moveRoomRequest.status, request: moveRoomRequest })}
                          >
                            ดูรายละเอียด
                          </button>
                        )}
                      </div>
                    </div>

                    {activeRequestType && (
                      <Modal title={TENANT_REQUEST_TYPE_LABEL[activeRequestType]} onClose={() => setActiveRequestType(null)}>
                        {(requestClose) => (
                          <form className="dashboard-inline-form" onSubmit={handleRequestSubmit}>
                            {activeRequestType === 'renew' && (
                              <>
                                <label>ระยะเวลาที่ต้องการต่อ</label>
                                <select
                                  value={renewDurationMonths}
                                  onChange={(event) => {
                                    const value = event.target.value
                                    setRenewDurationMonths(value)
                                    if (Number(value) <= 1 && renewPaymentType === 'lump_sum') {
                                      setRenewPaymentType('monthly')
                                    }
                                  }}
                                >
                                  {RENEW_DURATION_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <label>รูปแบบการชำระ</label>
                                <select
                                  value={renewPaymentType}
                                  onChange={(event) => setRenewPaymentType(event.target.value)}
                                >
                                  {RENEW_PAYMENT_TYPE_OPTIONS.filter(
                                    (option) => option.value !== 'lump_sum' || Number(renewDurationMonths) > 1,
                                  ).map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </>
                            )}
                            {activeRequestType === 'move_room' && (
                              <>
                                <label htmlFor="target-room-number">ห้องที่ต้องการย้ายไป</label>
                                <select
                                  id="target-room-number"
                                  value={targetRoomNumber}
                                  onChange={(event) => {
                                    setTargetRoomNumber(event.target.value)
                                    if (requestError) setRequestError('')
                                  }}
                                  required
                                >
                                  <option value="" disabled>เลือกห้องว่าง</option>
                                  {availableRooms.map((availableRoom) => (
                                    <option key={availableRoom.room_number} value={availableRoom.room_number}>
                                      ห้อง {availableRoom.room_number} · {Number(availableRoom.price).toLocaleString('th-TH')} บาท/เดือน
                                    </option>
                                  ))}
                                </select>
                                {availableRooms.length === 0 && (
                                  <p className="dashboard-form-error">ขณะนี้ไม่มีห้องว่างให้เลือก</p>
                                )}
                                <MoveRoomPreview
                                  currentRoom={room}
                                  targetRoom={availableRooms.find(
                                    (availableRoom) => String(availableRoom.room_number) === targetRoomNumber,
                                  )}
                                />
                                <label htmlFor="move-room-reason">
                                  เหตุผลที่ต้องการย้าย <span className="dashboard-required">*</span>
                                </label>
                                <select
                                  id="move-room-reason"
                                  value={moveReason}
                                  onChange={(event) => {
                                    setMoveReason(event.target.value)
                                    if (requestError) setRequestError('')
                                  }}
                                  required
                                >
                                  <option value="" disabled>เลือกเหตุผล</option>
                                  {MOVE_ROOM_REASON_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <label>
                                  วันที่ต้องการย้าย <span className="dashboard-required">*</span>
                                </label>
                                <ThaiDatePicker
                                  className="dashboard-date-input"
                                  value={preferredMoveDate}
                                  onChange={(date) => {
                                    setPreferredMoveDate(date)
                                    if (requestError) setRequestError('')
                                  }}
                                  minDate={moveDateRange.min}
                                  maxDate={moveDateRange.max}
                                />
                                <p className="dashboard-move-hint">
                                  สัญญาเช่าเดิม{room?.rental_end_date ? ` (สิ้นสุด ${formatDate(room.rental_end_date)})` : ''} จะย้ายไปใช้กับห้องใหม่
                                  และเจ้าหน้าที่จะตรวจสภาพห้องปัจจุบันก่อนอนุมัติ
                                </p>
                              </>
                            )}
                            <label>
                              {activeRequestType === 'moveout' ? (
                                <>
                                  รายละเอียดการย้ายออก <span className="dashboard-required">*</span>
                                </>
                              ) : activeRequestType === 'move_room' && moveReason === 'other' ? (
                                <>
                                  หมายเหตุ <span className="dashboard-required">*</span>
                                </>
                              ) : (
                                'หมายเหตุ (ถ้ามี)'
                              )}
                            </label>
                            <textarea
                              rows={activeRequestType === 'moveout' ? 3 : 2}
                              maxLength={500}
                              value={requestNote}
                              onChange={(event) => {
                                setRequestNote(event.target.value)
                                if (requestError) setRequestError('')
                              }}
                              placeholder={
                                activeRequestType === 'moveout'
                                  ? 'เช่น เหตุผลที่ย้ายออก และวันที่ต้องการย้ายออก'
                                  : activeRequestType === 'move_room'
                                    ? 'เช่น ปัญหาของห้องเดิม หรือสิ่งที่ต้องการในห้องใหม่'
                                    : 'ระบุรายละเอียดเพิ่มเติม...'
                              }
                              required={activeRequestType === 'moveout'}
                            />
                            {requestError && <p className="dashboard-form-error">{requestError}</p>}
                            <div className="dashboard-form-actions">
                              <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                                ยกเลิก
                              </button>
                              <button
                                type="submit"
                                className="dashboard-action-btn is-primary"
                                disabled={
                                  requestSubmitting
                                  || (activeRequestType === 'moveout' && !requestNote.trim())
                                  || (activeRequestType === 'move_room'
                                    && (!targetRoomNumber || availableRooms.length === 0 || !moveReason || !preferredMoveDate
                                      || (moveReason === 'other' && !requestNote.trim())))
                                }
                              >
                                {requestSubmitting ? 'กำลังส่ง...' : 'ยืนยันส่งคำขอ'}
                              </button>
                            </div>
                          </form>
                        )}
                      </Modal>
                    )}
                  </div>
                </div>
              )}

              <div className="col-12 col-lg-7">
                <div className="dashboard-card">
                  <div className="dashboard-card-header">
                    <h2>แจ้งซ่อม</h2>
                    <button type="button" className="dashboard-action-btn is-primary" onClick={openMaintenanceForm}>
                      แจ้งซ่อม
                    </button>
                  </div>
                  {maintenanceRequests.length > 0 && (
                    <DashboardFilterPanel
                      segments={[
                        { key: 'all', label: 'ทั้งหมด', count: maintenanceRequests.length },
                        ...[
                          { key: 'pending', label: 'รอดำเนินการ', tone: 'warning' },
                          { key: 'in_progress', label: 'กำลังดำเนินการ', tone: 'info' },
                          { key: 'done', label: 'เสร็จสิ้น', tone: 'success' },
                          { key: 'cancelled', label: 'ยกเลิกแล้ว', tone: 'danger' },
                        ].map((segment) => ({
                          ...segment,
                          count: maintenanceRequests.filter((item) => item.status === segment.key).length,
                        })),
                      ]}
                      active={maintenanceStatusFilter}
                      onSegment={(value) => {
                        setMaintenanceStatusFilter(value)
                        setMaintenancePage(1)
                      }}
                      search={maintenanceSearch}
                      onSearch={(value) => {
                        setMaintenanceSearch(value)
                        setMaintenancePage(1)
                      }}
                      searchPlaceholder="ค้นหารายละเอียด หมวดหมู่ หรือเบอร์โทร"
                      resultText={`พบ ${filteredMaintenanceRequests.length} จาก ${maintenanceRequests.length} รายการ`}
                      canClear={maintenanceStatusFilter !== 'all' || Boolean(maintenanceSearch.trim())}
                      onClear={() => {
                        setMaintenanceStatusFilter('all')
                        setMaintenanceSearch('')
                        setMaintenancePage(1)
                      }}
                    />
                  )}
                  {showMaintenanceForm && (
                    <Modal title="แจ้งซ่อม" onClose={() => setShowMaintenanceForm(false)}>
                      {(requestClose) => (
                        <form className="dashboard-inline-form" onSubmit={handleMaintenanceSubmit}>
                          <label>หมวดหมู่ปัญหา</label>
                          <select value={maintenanceCategory} onChange={(event) => setMaintenanceCategory(event.target.value)}>
                            {MAINTENANCE_CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>

                          <label>
                            รายละเอียดปัญหา <span className="dashboard-required">*</span>
                          </label>
                          <textarea
                            rows={3}
                            maxLength={500}
                            required
                            value={maintenanceText}
                            onChange={(event) => {
                              setMaintenanceText(event.target.value)
                              if (maintenanceError) setMaintenanceError('')
                            }}
                            placeholder="อธิบายปัญหาที่ต้องการแจ้งซ่อม เช่น แอร์ไม่เย็น, ก๊อกน้ำรั่ว..."
                          />

                          <label>ช่วงเวลาที่สะดวกให้เข้าซ่อม</label>
                          <select
                            value={maintenancePreferredTime}
                            onChange={(event) => setMaintenancePreferredTime(event.target.value)}
                          >
                            {MAINTENANCE_TIME_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>

                          <label>เบอร์โทรติดต่อ (ถ้ามี)</label>
                          <input
                            type="tel"
                            value={maintenanceContactPhone}
                            onChange={(event) => setMaintenanceContactPhone(event.target.value)}
                            placeholder="เบอร์โทรที่ติดต่อได้"
                          />

                          <label htmlFor="maintenance-photos">
                            แนบรูปปัญหา (อย่างน้อย 1 รูป สูงสุด {MAINTENANCE_MAX_PHOTOS} รูป) <span className="dashboard-required">*</span>
                          </label>
                          <MaintenancePhotoPicker
                            id="maintenance-photos"
                            files={maintenancePhotos}
                            onChange={setMaintenancePhotos}
                            onError={setMaintenanceError}
                          />

                          {maintenanceError && <p className="dashboard-form-error">{maintenanceError}</p>}
                          <div className="dashboard-form-actions">
                            <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                              ยกเลิก
                            </button>
                            <button type="submit" className="dashboard-action-btn is-primary" disabled={maintenanceSubmitting || !maintenanceText.trim() || maintenancePhotos.length === 0}>
                              {maintenanceSubmitting ? 'กำลังส่ง...' : 'ยืนยันแจ้งซ่อม'}
                            </button>
                          </div>
                        </form>
                      )}
                    </Modal>
                  )}

                  <div className="dashboard-maintenance-body">
                  {maintenanceRequests.length === 0 ? (
                    <p className="dashboard-empty">ยังไม่มีรายการแจ้งซ่อม</p>
                  ) : filteredMaintenanceRequests.length === 0 ? (
                    <p className="dashboard-empty">ไม่พบรายการที่ตรงกับการค้นหา</p>
                  ) : (
                    <>
                    <div className="dashboard-maintenance-list">
                      {paginatedMaintenanceRequests.map((item) => (
                        <div key={item.id} className="dashboard-maintenance-item">
                          <div>
                            <p className="dashboard-maintenance-desc">{item.description}</p>
                            <p className="dashboard-maintenance-meta">
                              {MAINTENANCE_CATEGORY_LABEL[item.category] || 'อื่นๆ'}
                              {' · '}
                              {MAINTENANCE_TIME_LABEL[item.preferred_time] || 'เวลาไหนก็ได้'}
                              {item.contact_phone ? ` · โทร ${item.contact_phone}` : ''}
                            </p>
                            <p className="dashboard-maintenance-date">{formatDateTime(item.created_at)}</p>
                            <button type="button" className="dashboard-maintenance-more" onClick={() => setMaintenanceDetail(item)}>
                              ดูเพิ่มเติม
                            </button>
                          </div>
                          <div className="dashboard-maintenance-badges">
                            {MAINTENANCE_STATUS_POPUP_CONTENT[item.status] ? (
                              <button
                                type="button"
                                className={`dashboard-badge status-${maintenanceBadgeClass(item.status)} dashboard-badge-btn`}
                                onClick={() => setStatusPopup({ kind: 'maintenance', status: item.status, request: item })}
                              >
                                {MAINTENANCE_STATUS_LABEL[item.status] || item.status}
                              </button>
                            ) : (
                              <span className={`dashboard-badge status-${maintenanceBadgeClass(item.status)}`}>
                                {MAINTENANCE_STATUS_LABEL[item.status] || item.status}
                              </span>
                            )}
                            {item.status === 'pending' && (
                              <button
                                type="button"
                                className="dashboard-maintenance-cancel"
                                disabled={cancelingMaintenanceId === item.id}
                                onClick={() => {
                                  setMaintenanceError('')
                                  setConfirmCancelId(item.id)
                                }}
                              >
                                {cancelingMaintenanceId === item.id ? 'กำลังยกเลิก...' : 'ยกเลิก'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {maintenanceTotalPages > 1 && (
                      <div className="dashboard-maintenance-pagination">
                        <button
                          type="button"
                          className="dashboard-notif-page-btn"
                          disabled={maintenanceCurrentPage <= 1}
                          onClick={() => setMaintenancePage(Math.max(1, maintenanceCurrentPage - 1))}
                        >
                          ก่อนหน้า
                        </button>
                        <span className="dashboard-notif-page-info">
                          หน้า {maintenanceCurrentPage} / {maintenanceTotalPages}
                        </span>
                        <button
                          type="button"
                          className="dashboard-notif-page-btn"
                          disabled={maintenanceCurrentPage >= maintenanceTotalPages}
                          onClick={() => setMaintenancePage(Math.min(maintenanceTotalPages, maintenanceCurrentPage + 1))}
                        >
                          ถัดไป
                        </button>
                      </div>
                    )}
                    </>
                  )}
                  </div>

                  {confirmCancelId !== null && (
                    <Modal title="ยืนยันการยกเลิก" onClose={() => setConfirmCancelId(null)} variant="confirm">
                      {(requestClose) => (
                        <div className="dashboard-confirm-body">
                          <div className="dashboard-confirm-icon">!</div>
                          <p className="dashboard-confirm-message">
                            ต้องการยกเลิกรายการแจ้งซ่อมนี้ใช่หรือไม่?
                            <br />
                            เมื่อยกเลิกแล้วจะไม่สามารถกู้คืนได้
                          </p>
                          {maintenanceError && <p className="dashboard-form-error">{maintenanceError}</p>}
                          <div className="dashboard-form-actions">
                            <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                              ไม่ยกเลิก
                            </button>
                            <button
                              type="button"
                              className="dashboard-action-btn is-danger"
                              disabled={cancelingMaintenanceId === confirmCancelId}
                              onClick={async () => {
                                const ok = await handleCancelMaintenance(confirmCancelId)
                                if (ok) requestClose()
                              }}
                            >
                              {cancelingMaintenanceId === confirmCancelId ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
                            </button>
                          </div>
                        </div>
                      )}
                    </Modal>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {receiptRequest && (
        <div style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1 }}>
          <div ref={receiptRef}>
            <ReceiptTemplate receiptRequest={receiptRequest} customer={customer} />
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomerDashbord
