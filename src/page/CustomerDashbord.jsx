import { UploadImage } from '../components/UploadMedia.jsx'
import StepTimeline from '../components/StepTimeline.jsx'
import ProcessSteps from '../components/ProcessSteps.jsx'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { DormInfoMenu } from '../components/DormInfo'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import 'bootstrap/dist/css/bootstrap.min.css'
import './css/Login.css'
import './css/CustomerDashbord.css'
import AnnouncementBoard from '../components/AnnouncementBoard.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import { CustomerContractPanel } from '../components/RentalContract.jsx'
import { PackageIcon } from '../components/ParcelIcons.jsx'
import ThaiDatePicker from '../components/ThaiDatePicker.jsx'
import PromptPayQr from '../components/PromptPayQr.jsx'
import { formatPromptPayId, isValidPromptPayId } from '../utils/promptpay.js'
import readSlipQrPayload from '../utils/slipQr.js'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'
import CustomAmenityIcon from '../components/CustomAmenityIcon.jsx'
import { parseRoomAmenities } from '../utils/roomAmenities.js'
import { addContractMonths } from '../utils/rentalContract.js'

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

const MAINTENANCE_MAX_PHOTOS = 6
const MAINTENANCE_MAX_PHOTO_BYTES = 5 * 1024 * 1024

function formatPhotoSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function MaintenancePhotoPicker({ id, files, onChange, onError, max = MAINTENANCE_MAX_PHOTOS }) {
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
    const room = max - files.length
    const accepted = withinSize.slice(0, Math.max(0, room))
    if (images.length < list.length) onError('เลือกได้เฉพาะไฟล์รูปภาพ')
    else if (withinSize.length < images.length) onError('รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป')
    else if (accepted.length < withinSize.length) onError(`แนบรูปได้ไม่เกิน ${max} รูป`)
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
          <span className="maint-photo-dropzone-hint">สูงสุด {max} รูป รูปละไม่เกิน 5 MB</span>
        </label>
      ) : (
        <div className="maint-photo-grid">
          {files.map((file, index) => (
            <figure className="maint-photo-tile" key={`${file.name}-${index}`}>
              <UploadImage src={previewUrls[index]} alt={`รูปที่แนบ ${index + 1}`} />
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
          {files.length < max && (
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
          <UploadImage className="slip-preview-image" src={previewUrl} alt="ตัวอย่างสลิปที่แนบ" />
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
  deposit: 'เงินมัดจำ',
  water: 'ค่าน้ำ',
  electricity: 'ค่าไฟฟ้า',
  room_transfer: 'ส่วนต่างค่าเช่า (ย้ายห้อง)',
}

const AMENITIES = [
  { key: 'air_conditioner', label: 'แอร์', color: 'blue' },
  { key: 'refrigerator', label: 'ตู้เย็น', color: 'teal' },
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

function NotifKindIcon({ kind, paymentType }) {
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
  if (kind === 'parcel') {
    return (
      <svg {...props}>
        <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
        <path d="m3 8 9 5 9-5M12 13v8" />
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
  if (kind === 'utility' && paymentType === 'electricity') {
    return (
      <svg {...props}>
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
    )
  }
  if (kind === 'utility') {
    return (
      <svg {...props}>
        <path d="M12 2.7s-6 6.4-6 11.3a6 6 0 0 0 12 0c0-4.9-6-11.3-6-11.3z" />
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

function Modal({ title, onClose, children, variant, onBack, headerAction }) {
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
        className={`dashboard-modal${variant === 'confirm' || variant === 'success' ? ' dashboard-modal-confirm' : ''}${variant === 'success' ? ' dashboard-modal-success' : ''}${variant === 'status' ? ' dashboard-modal-confirm dashboard-modal-status' : ''}${variant === 'pinned' ? ' dashboard-modal-pinned' : ''}${variant === 'request' ? ' dashboard-modal-confirm dashboard-modal-status dashboard-modal-request' : ''}${variant === 'parcel' ? ' dashboard-modal-confirm dashboard-modal-status dashboard-modal-parcel' : ''}${variant === 'payment' ? ' dashboard-modal-payment' : ''}${isClosing ? ' is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dashboard-modal-header">
          <div className="dashboard-modal-title">
            {onBack && (
              <button type="button" className="dashboard-modal-back" onClick={onBack} aria-label="ย้อนกลับ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <h3>{title}</h3>
          </div>
          {headerAction && <div className="dashboard-modal-header-actions">{headerAction}</div>}
          <button type="button" className="dashboard-modal-close" onClick={requestClose} aria-label="ปิด">
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
        <div className="dashboard-modal-body">
          {(variant === 'confirm' || variant === 'success') && <h3 className="dashboard-modal-alert-title">{title}</h3>}
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
  cancelled: 'ยกเลิกแล้ว',
}

const RENEW_DURATION_OPTIONS = [
  { value: '1', label: '1 เดือน' },
  { value: '3', label: '3 เดือน' },
  { value: '6', label: '6 เดือน' },
  { value: '12', label: '1 ปี (12 เดือน)' },
]

const RENEW_DURATION_LABEL = Object.fromEntries(RENEW_DURATION_OPTIONS.map((option) => [option.value, option.label]))

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

const FIELD_ICON_PATHS = {
  room: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" />
      <circle cx="15" cy="12" r="1" />
    </>
  ),
  reason: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
      <path d="M12 17h.01" />
    </>
  ),
  date: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M16 3v3M8 3v3M3 10h18" />
    </>
  ),
  note: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  water: <path d="M12 2.7s-6 6.4-6 11.3a6 6 0 0 0 12 0c0-4.9-6-11.3-6-11.3z" />,
  area: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h4M9 3v4M21 15h-4M15 21v-4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  up: <path d="M7 17 17 7M9 7h8v8" />,
  down: <path d="M7 7l10 10M17 9v8H9" />,
}

function FieldIcon({ name, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {FIELD_ICON_PATHS[name]}
    </svg>
  )
}

function FieldLabel({ htmlFor, required = false, children }) {
  return (
    <label htmlFor={htmlFor} className="dashboard-field-label">
      {children}
      {required && <span className="dashboard-required">*</span>}
    </label>
  )
}

function MoveRoomPreview({ currentRoom, targetRoom }) {
  if (!targetRoom) return null
  const rentDiff = formatRentDiff(currentRoom?.price, targetRoom.price)
  const amenities = AMENITIES.filter((amenity) => targetRoom[amenity.key])
  return (
    <div className="dashboard-move-preview">
      <div className="dashboard-move-route">
        <div className="dashboard-move-route-room is-from">
          <span className="dashboard-move-route-label">
            <FieldIcon name="room" size={15} />
            <small>ห้องปัจจุบัน</small>
          </span>
          <strong>{currentRoom?.room_number ?? '-'}</strong>
          <div className="dashboard-move-preview-price">
            <small>ค่าเช่ารายเดือน</small>
            <strong>{currentRoom?.price != null ? `฿${formatCurrency(currentRoom.price)}` : '-'}</strong>
            <span>/เดือน</span>
          </div>
        </div>
        <span className="dashboard-move-route-arrow" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
        <div className="dashboard-move-route-room is-to">
          <span className="dashboard-move-route-label">
            <FieldIcon name="room" size={15} />
            <small>ห้องใหม่</small>
          </span>
          <strong>{targetRoom.room_number}</strong>
          <div className="dashboard-move-preview-price">
            <small>ค่าเช่ารายเดือน</small>
            <strong>฿{formatCurrency(targetRoom.price)}</strong>
            <span>/เดือน</span>
          </div>
        </div>
      </div>
      {rentDiff && (
        <span className={`dashboard-move-diff is-${rentDiff.tone}`}>
          {rentDiff.tone !== 'same' && <FieldIcon name={rentDiff.tone === 'up' ? 'up' : 'down'} size={13} />}
          {rentDiff.label} จากห้องปัจจุบัน
        </span>
      )}
      <div className="dashboard-move-preview-tags">
        {targetRoom.room_size != null && (
          <span>
            <FieldIcon name="area" size={13} />
            ขนาด {formatRoomSize(targetRoom.room_size)}
          </span>
        )}
        <span className="is-electric">
          <FieldIcon name="zap" size={13} />
          ไฟ ฿{formatCurrency(targetRoom.electricity_unit_price)}/หน่วย
        </span>
        <span className="is-water">
          <FieldIcon name="water" size={13} />
          น้ำ ฿{formatCurrency(targetRoom.water_unit_price)}/หน่วย · เหมา ฿{formatCurrency(targetRoom.water_price)}/เดือน
        </span>
        {amenities.map((amenity) => (
          <span key={amenity.key} className={`is-${amenity.color}`}>
            <AmenityIcon name={amenity.key} />
            {amenity.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function tenantRequestBadgeClass(status) {
  if (status === 'approved') return 'paid'
  if (status === 'rejected') return 'overdue'
  if (status === 'in_progress') return 'in-progress'
  if (status === 'cancelled') return 'cancelled'
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
  cancelled: { title: 'คำขอแจ้งย้ายออกถูกยกเลิก', message: 'คำขอเดิมถูกยกเลิกเนื่องจากสถานะห้องหรือบัญชีผู้เช่าเปลี่ยนแปลง', icon: 'danger' },
}

const MOVE_ROOM_STATUS_POPUP_CONTENT = {
  pending: {
    title: 'รอดำเนินการ',
    message: 'ส่งคำขอย้ายห้องแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบห้องปลายทาง',
    icon: 'info',
  },
  in_progress: {
    title: 'เจ้าหน้าที่รับเรื่องแล้ว',
    message:
      'เจ้าหน้าที่รับเรื่องคำขอย้ายห้องแล้ว กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อนัดตรวจสภาพห้องปัจจุบันและพูดคุยรายละเอียดค่าเช่าและเงินประกันของห้องใหม่',
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
  cancelled: { title: 'คำขอย้ายห้องถูกยกเลิก', message: 'คำขอเดิมถูกยกเลิกเนื่องจากสถานะห้องหรือบัญชีผู้เช่าเปลี่ยนแปลง', icon: 'danger' },
}

const MOVE_ROOM_TAKEN_CANCELLER = 'ระบบ (ห้องปลายทางมีผู้เช่าแล้ว)'

const isMoveRoomTakenCancellation = (request) =>
  request?.type === 'move_room' && request.status === 'cancelled' && request.completed_by_name === MOVE_ROOM_TAKEN_CANCELLER

const getMoveRoomTakenPopupContent = (request) => ({
  title: 'ห้องที่จะย้ายไปมีผู้เช่าแล้ว',
  message: `ห้อง ${request.target_room_number} มีผู้เช่ารายใหม่ลงทะเบียนเข้าพักแล้ว คำขอย้ายห้องและยอดส่วนต่างที่รอชำระถูกยกเลิกอัตโนมัติ หากยังต้องการย้าย กรุณาส่งคำขอใหม่โดยเลือกห้องอื่น`,
  icon: 'danger',
})

const RENEW_RESUBMIT_WINDOW_MS = 10 * 24 * 60 * 60 * 1000

const RENEW_STATUS_POPUP_CONTENT = {
  pending: {
    title: 'รอดำเนินการ',
    message: 'ส่งคำขอต่อสัญญาเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบและติดต่อกลับ',
    icon: 'info',
  },
  in_progress: {
    title: 'เจ้าหน้าที่รับเรื่องแล้ว',
    message: 'เจ้าหน้าที่รับเรื่องคำขอต่อสัญญาของคุณแล้ว กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อพูดคุยรายละเอียดและลงนามต่อสัญญา',
    icon: 'info',
  },
  approved: {
    title: 'ต่อสัญญาสำเร็จ',
    message: 'คำขอต่อสัญญาของคุณได้รับการอนุมัติแล้ว ระบบได้ขยายระยะเวลาสัญญาเช่าให้เรียบร้อยแล้ว',
    icon: 'success',
  },
  rejected: {
    title: 'คำขอต่อสัญญาไม่ได้รับการอนุมัติ',
    message: 'คำขอต่อสัญญาของคุณไม่ได้รับการอนุมัติ กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อสอบถามรายละเอียดเพิ่มเติม',
    icon: 'danger',
  },
  cancelled: { title: 'คำขอต่อสัญญาถูกยกเลิก', message: 'คำขอเดิมถูกยกเลิกเนื่องจากสถานะห้องหรือบัญชีผู้เช่าเปลี่ยนแปลง', icon: 'danger' },
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
    message: 'รายการแจ้งซ่อมของคุณถูกยกเลิกแล้ว กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์หากต้องการสอบถามเพิ่มเติม',
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
  cancelled: { label: 'ถูกยกเลิก', tone: 'danger' },
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
  cancelled: 'ยกเลิกคำขอ',
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

function contractMonthsBetween(startValue, endValue) {
  const start = startValue ? new Date(startValue) : null
  const end = endValue ? new Date(endValue) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null
  return Math.max(1, Math.round((end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()))
}

function RenewContractPreview({ room, months, depositAmount }) {
  const currentEnd = room.rental_end_date
  const newEnd = addContractMonths(currentEnd, months)
  const currentMonths = contractMonthsBetween(room.rental_start_date, currentEnd)
  const newMonths = currentMonths == null ? null : currentMonths + months
  const price = Number(room.price) || 0
  const deposit = Number(depositAmount) || 0
  const depositMonths = price > 0 && deposit > 0 && Number.isInteger(deposit / price) ? deposit / price : null
  const rows = [
    { label: 'วันเริ่มสัญญา', before: formatDate(room.rental_start_date), after: formatDate(room.rental_start_date) },
    { label: 'วันสิ้นสุดสัญญา', before: formatDate(currentEnd), after: formatDate(newEnd), changed: true },
    {
      label: 'ระยะสัญญารวม',
      before: currentMonths == null ? '-' : `${currentMonths} เดือน`,
      after: newMonths == null ? `+${months} เดือน` : `${newMonths} เดือน`,
      changed: true,
    },
    { label: 'ค่าเช่า', before: `฿${formatCurrency(price)}/เดือน`, after: `฿${formatCurrency(price)}/เดือน` },
    { label: 'การชำระ', before: 'รายเดือน', after: 'รายเดือน' },
    {
      label: 'เงินมัดจำ',
      before: deposit > 0 ? `฿${formatCurrency(deposit)}${depositMonths ? ` (${depositMonths} เดือน)` : ''}` : 'ไม่มี',
      after: deposit > 0 ? 'ยังอยู่ครบ' : 'ไม่มี',
    },
  ]
  return (
    <div className="dashboard-renew-preview">
      <div className="dashboard-renew-preview-head">
        <span>รายละเอียด</span>
        <span>สัญญาตอนนี้</span>
        <span>หลังต่อสัญญา</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className={`dashboard-renew-preview-row${row.changed ? ' is-changed' : ''}`}>
          <span>{row.label}</span>
          <span>{row.before}</span>
          <strong>{row.after}</strong>
        </div>
      ))}
      <ul className="dashboard-renew-preview-notes">
        <li>ต่อจากวันสิ้นสุดเดิม {formatDate(currentEnd)} อีก {months} เดือน ไม่เริ่มนับสัญญาใหม่</li>
        <li>ช่วงที่ต่อชำระค่าเช่ารายเดือนตามปกติ ฿{formatCurrency(price)}/เดือน ไม่มีค่าใช้จ่ายเพิ่มตอนต่อสัญญา</li>
        {deposit > 0 ? (
          <li className="is-deposit">
            เงินมัดจำ ฿{formatCurrency(deposit)} ยังอยู่กับหอพัก ไม่ต้องจ่ายเพิ่ม และจะคืนให้เมื่อพักครบถึง {formatDate(newEnd)}
            {' '}— หากย้ายออกก่อนวันดังกล่าว จะไม่ได้รับเงินมัดจำคืน
          </li>
        ) : (
          <li>สัญญานี้ไม่มีเงินมัดจำ</li>
        )}
      </ul>
    </div>
  )
}

function MoveOutImpactPreview({ room, moveDate, depositAmount, depositPaid, depositDeducted, balance }) {
  const price = Number(room.price) || 0
  const deposit = Number(depositAmount) || 0
  const paidDeposit = Math.min(deposit, Number(depositPaid) || 0)
  const deductedDeposit = Number(depositDeducted) || 0
  const endDay = room.rental_end_date ? new Date(room.rental_end_date) : null
  if (endDay) endDay.setHours(0, 0, 0, 0)
  const moveDay = moveDate ? new Date(`${moveDate}T00:00:00`) : null
  const daysEarly = moveDay && endDay ? Math.ceil((endDay - moveDay) / 86400000) : null
  const leavesEarly = daysEarly !== null && daysEarly > 0
  const totalMonths = contractMonthsBetween(room.rental_start_date, room.rental_end_date)
  const balanceItems = balance?.items ?? []
  const unpaidItems = balanceItems.filter((item) => item.status !== 'pending')
  const pendingItems = balanceItems.filter((item) => item.status === 'pending')
  const rows = [
    { label: 'ห้อง', value: `ห้อง ${room.room_number}`, tone: 'brand' },
    { label: 'วันเริ่มสัญญา', value: formatDate(room.rental_start_date) },
    { label: 'วันสิ้นสุดสัญญา', value: formatDate(room.rental_end_date), tone: 'warning' },
    { label: 'ระยะสัญญา', value: totalMonths == null ? '-' : `${totalMonths} เดือน` },
    { label: 'ค่าเช่า', value: `฿${formatCurrency(price)}/เดือน`, tone: 'brand' },
    {
      label: deductedDeposit > 0 ? 'เงินมัดจำคงเหลือ' : 'เงินมัดจำที่ชำระไว้',
      value: deposit <= 0
        ? 'ไม่มี'
        : deductedDeposit > 0
          ? `฿${formatCurrency(paidDeposit)} (หักส่วนต่างย้ายห้อง ฿${formatCurrency(deductedDeposit)})`
          : `฿${formatCurrency(paidDeposit)}${paidDeposit < deposit ? ` จาก ฿${formatCurrency(deposit)}` : ''}`,
      tone: deposit <= 0 ? 'muted' : paidDeposit >= deposit ? 'ok' : paidDeposit > 0 ? 'warning' : 'danger',
    },
    {
      label: 'วันที่ต้องการย้ายออก',
      value: moveDay ? formatDateOnly(moveDate) : 'ยังไม่ได้เลือก',
      tone: moveDay ? (leavesEarly ? 'danger' : 'ok') : null,
    },
  ]
  return (
    <div className="dashboard-renew-preview dashboard-moveout-impact">
      <div className="dashboard-moveout-impact-title">รายละเอียดสัญญาของคุณ</div>
      {rows.map((row) => (
        <div key={row.label} className={`dashboard-moveout-impact-row${row.tone ? ` is-${row.tone}` : ''}`}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
      <div className="dashboard-moveout-impact-title">ผลกระทบถ้าย้ายออก{moveDay ? `วันที่ ${formatDateOnly(moveDate)}` : 'ตอนนี้'}</div>
      <ul className="dashboard-renew-preview-notes dashboard-moveout-impact-notes">
        {!moveDay ? (
          <li>เลือกวันที่ต้องการย้ายออกเพื่อดูผลกระทบกับเงินมัดจำ</li>
        ) : paidDeposit <= 0 ? (
          <li>{deposit > 0 ? 'คุณยังไม่ได้ชำระเงินมัดจำ จึงไม่มีเงินมัดจำที่จะได้รับคืน' : 'สัญญานี้ไม่มีเงินมัดจำ'}</li>
        ) : leavesEarly ? (
          <li className="is-danger">
            ย้ายออกก่อนสิ้นสุดสัญญา {daysEarly} วัน <b>จะไม่ได้รับเงินมัดจำ ฿{formatCurrency(paidDeposit)} คืน</b>
            {' '}ถ้าต้องการได้มัดจำคืน ให้ย้ายออกตั้งแต่วันที่ {formatDate(room.rental_end_date)} เป็นต้นไป
          </li>
        ) : (
          <li className="is-ok">
            พักครบสัญญาแล้ว — ได้รับเงินมัดจำคืน ฿{formatCurrency(paidDeposit)} หลังเจ้าหน้าที่ตรวจสภาพห้อง
            {' '}(ถ้าพบความเสียหาย อาจถูกหักค่าซ่อมจากเงินมัดจำ)
          </li>
        )}
        {unpaidItems.length > 0 && (
          <li className="is-danger">
            มียอดค้างชำระ {unpaidItems.map((item) => `${item.label} ฿${formatCurrency(item.amount)}`).join(', ')}
            {' '}— ต้องชำระให้ครบก่อน เจ้าหน้าที่จึงจะอนุมัติการย้ายออกได้
          </li>
        )}
        {pendingItems.length > 0 && (
          <li className="is-warning">มีสลิปที่รอเจ้าหน้าที่ตรวจ ({pendingItems.map((item) => item.label).join(', ')}) ต้องตรวจผ่านก่อนอนุมัติย้ายออก</li>
        )}
        {balanceItems.length === 0 && <li className="is-ok">ไม่มียอดค้างชำระ</li>}
        <li>ไม่มีค่าเช่าของเดือนถัดไปหลังวันที่ย้ายออกได้รับอนุมัติ</li>
        <li>เจ้าหน้าที่จะนัดตรวจสภาพห้องก่อนอนุมัติ ค่าเสียหายที่พบอาจหักจากเงินมัดจำ</li>
        <li>คำขอ แจ้งซ่อม คำขอรถ และพัสดุที่ยังไม่ได้รับจะถูกยกเลิกเมื่ออนุมัติ รับพัสดุให้เรียบร้อยก่อนย้าย</li>
        <li>เมื่ออนุมัติย้ายออก บัญชีนี้จะถูกระงับและเข้าสู่ระบบไม่ได้อีก บันทึกใบเสร็จหรือสัญญาที่ต้องใช้ไว้ก่อน</li>
      </ul>
    </div>
  )
}

function OutstandingNotice({ amount, action }) {
  return (
    <>
      <span className="dashboard-request-desc-alert">
        <strong>ค้างชำระ ฿{formatCurrency(amount)}</strong>
      </span>
      <span className="dashboard-request-desc-next">ชำระให้ครบก่อน จึงจะ{action}ได้</span>
    </>
  )
}

function MoveRoomOutcome({ currentRoom, targetRoom, depositRemaining, balance }) {
  if (!currentRoom) return null
  const currentNumber = currentRoom.room_number
  const fromPrice = Number(currentRoom.price) || 0
  const balanceItems = balance?.items ?? []
  if (!targetRoom) {
    return (
      <p className="dashboard-move-hint">
        <FieldIcon name="info" size={16} />
        <span>เลือกห้องที่ต้องการย้ายไป เพื่อดูว่าสัญญา ค่าเช่า และเงินมัดจำของคุณจะเปลี่ยนอย่างไร</span>
      </p>
    )
  }
  const toPrice = Number(targetRoom.price) || 0
  const diff = toPrice - fromPrice
  const deposit = Math.max(0, Number(depositRemaining) || 0)
  const deducted = diff > 0 ? Math.min(diff, deposit) : 0
  const charge = diff > 0 ? diff - deducted : 0
  const steps = [
    { tone: 'is-info', text: `เจ้าหน้าที่จะนัดตรวจสภาพห้อง ${currentNumber} ก่อนอนุมัติ` },
    balanceItems.length > 0 && {
      tone: 'is-danger',
      text: `ต้องชำระยอดค้างให้ครบก่อนจึงจะอนุมัติได้: ${balanceItems.map((item) => `${item.label} ฿${formatCurrency(item.amount)}`).join(', ')}`,
    },
    { tone: 'is-info', text: `เมื่ออนุมัติ คุณย้ายเข้าห้อง ${targetRoom.room_number} ได้ทันที และห้อง ${currentNumber} จะกลายเป็นห้องว่าง` },
    {
      tone: 'is-info',
      text: `ใช้สัญญาฉบับเดิมต่อ${currentRoom.rental_end_date ? ` วันสิ้นสุดสัญญายังเป็น ${formatDate(currentRoom.rental_end_date)}` : ''} ระบบบันทึกการย้ายแนบท้ายสัญญา`,
    },
    diff === 0
      ? { tone: 'is-ok', text: 'ค่าเช่าเท่าเดิม ไม่หักเงินมัดจำและไม่มียอดเพิ่ม' }
      : diff < 0
        ? { tone: 'is-ok', text: `ค่าเช่าลดลงเหลือ ฿${formatCurrency(toPrice)}/เดือน ตั้งแต่รอบบิลถัดไป ไม่หักเงินมัดจำ (รอบที่จ่ายไปแล้วไม่คืนส่วนต่าง)` }
        : { tone: 'is-warning', text: `ค่าเช่าเพิ่มเป็น ฿${formatCurrency(toPrice)}/เดือน ตั้งแต่รอบบิลถัดไป` },
    diff > 0 && {
      tone: 'is-warning',
      text: deducted > 0
        ? `ส่วนต่างรอบนี้ ฿${formatCurrency(diff)} หักจากเงินมัดจำ ฿${formatCurrency(deducted)} (มัดจำเหลือ ฿${formatCurrency(deposit - deducted)})${charge > 0 ? ` ส่วนที่เหลือ ฿${formatCurrency(charge)} ต้องชำระภายใน 3 วันก่อนทำสัญญาย้ายห้อง` : ''}`
        : `ส่วนต่างรอบนี้ ฿${formatCurrency(diff)} ต้องชำระภายใน 3 วันก่อนทำสัญญาย้ายห้อง (ไม่มีเงินมัดจำให้หัก)`,
    },
    { tone: 'is-info', text: `คำขอและแจ้งซ่อมที่ยังค้างของห้อง ${currentNumber} จะถูกยกเลิก ส่งใหม่ได้จากห้องใหม่` },
  ].filter(Boolean)
  return (
    <div className="dashboard-move-impact">
      <div className="dashboard-move-impact-title">จะเกิดอะไรขึ้นถ้าเจ้าหน้าที่อนุมัติ</div>
      {diff > 0 && (
        <div className="dashboard-move-cost">
          <div className="dashboard-move-cost-head">
            <FieldIcon name="info" size={16} />
            <span>ส่วนต่างที่ต้องจ่ายเพิ่มทั้งหมด (รวมเงินมัดจำที่ถูกหัก)</span>
            <strong>฿{formatCurrency(diff)}</strong>
          </div>
          <div className="dashboard-move-cost-row">
            <span>หักจากเงินมัดจำ</span>
            <strong>{deducted > 0 ? `฿${formatCurrency(deducted)}` : 'ไม่หัก'}</strong>
          </div>
          <div className="dashboard-move-cost-row">
            <span>เงินมัดจำคงเหลือหลังหัก</span>
            <strong>฿{formatCurrency(deposit - deducted)}</strong>
          </div>
          <div className={`dashboard-move-cost-row${charge > 0 ? ' is-danger' : ' is-ok'}`}>
            <span>ต้องชำระเพิ่มภายใน 3 วัน</span>
            <strong>{charge > 0 ? `฿${formatCurrency(charge)}` : 'ไม่มี'}</strong>
          </div>
        </div>
      )}
      <ol className="dashboard-move-outcome">
        {steps.map((step) => (
          <li key={step.text} className={step.tone}>
            {step.text}
          </li>
        ))}
      </ol>
      <p className="dashboard-move-outcome-note">
        ตัวเลขเป็นการประมาณจากข้อมูลตอนนี้ ยอดจริงคำนวณตอนเจ้าหน้าที่อนุมัติ
      </p>
    </div>
  )
}

function MoveRoomContractImpact({ request }) {
  const tracked = ['pending', 'in_progress', 'approved'].includes(request.status)
  const [state, setState] = useState({ impact: null, loading: tracked, error: '' })

  useEffect(() => {
    if (!tracked) return undefined
    let active = true
    axios
      .get(`/api/customer/requests/${request.id}/transfer-impact`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      .then(({ data }) => {
        if (active) setState({ impact: data.impact, loading: false, error: '' })
      })
      .catch((err) => {
        if (active) setState({ impact: null, loading: false, error: err.response?.data?.message || 'ไม่สามารถคำนวณผลกระทบต่อสัญญาได้' })
      })
    return () => {
      active = false
    }
  }, [request.id, request.status, tracked])

  if (!tracked) return null
  const { impact, loading, error } = state
  if (loading) return <p className="dashboard-move-impact-muted">กำลังคำนวณผลกระทบต่อสัญญา...</p>
  if (error) return <p className="dashboard-move-impact-muted is-danger">{error}</p>
  if (!impact) return null

  const diff = Number(impact.to_price) - Number(impact.from_price)
  const deducted = Number(impact.deposit_deducted) || 0
  const charge = Number(impact.additional_charge) || 0
  const total = Number(impact.total_difference) || 0
  const rows = [
    { label: 'ห้องในสัญญา', value: `ห้อง ${impact.from_room_number} → ห้อง ${impact.to_room_number}`, tone: 'is-accent' },
    {
      label: 'ค่าเช่าต่อเดือน',
      value: `฿${formatCurrency(impact.from_price)} → ฿${formatCurrency(impact.to_price)}`,
      tone: diff > 0 ? 'is-warning' : diff < 0 ? 'is-ok' : null,
    },
    impact.new_price_from && { label: 'ราคาใหม่เริ่มรอบ', value: formatDate(impact.new_price_from) },
    impact.contract_end_date && { label: 'วันสิ้นสุดสัญญา', value: `${formatDate(impact.contract_end_date)} (เท่าเดิม)` },
    {
      label: 'ส่วนต่างที่ต้องชำระ',
      value: total > 0 ? `฿${formatCurrency(total)} (ครั้งเดียว)` : 'ไม่มี',
      tone: total > 0 ? 'is-warning' : 'is-ok',
    },
    total > 0 && {
      label: 'หักจากเงินมัดจำ',
      value: deducted > 0 ? `฿${formatCurrency(deducted)}` : 'ไม่หัก',
      tone: deducted > 0 ? 'is-warning' : null,
    },
    { label: 'เงินมัดจำคงเหลือ', value: `฿${formatCurrency(impact.deposit_remaining_after)}`, tone: 'is-brand' },
    total > 0 && {
      label: impact.final ? 'ชำระส่วนต่างเพิ่ม' : 'ต้องชำระก่อนย้ายห้อง',
      value: charge > 0
        ? `฿${formatCurrency(charge)}${impact.final ? (impact.charge_status === 'paid' ? ' (ชำระแล้ว)' : ' (รอชำระ)') : ''}`
        : 'ไม่มี',
      tone: charge > 0 ? (impact.charge_status === 'paid' ? 'is-ok' : 'is-danger') : 'is-ok',
    },
  ].filter(Boolean)
  const outstanding = impact.outstanding ?? []

  return (
    <div className="dashboard-move-impact">
      <div className="dashboard-move-impact-title">
        {impact.final ? 'สัญญาของคุณหลังย้ายห้อง' : 'ผลกระทบต่อสัญญาถ้าได้รับอนุมัติ'}
      </div>
      {rows.map((row) => (
        <div key={row.label} className={`dashboard-moveout-impact-row${row.tone ? ` ${row.tone}` : ''}`}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
      <ul className="dashboard-renew-preview-notes dashboard-moveout-impact-notes">
        {diff > 0 && total > 0 && (
          <li>
            ห้องใหม่แพงกว่า ฿{formatCurrency(diff)}/เดือน ระบบหักส่วนต่างจากเงินมัดจำก่อน
            {charge > 0 ? ` ส่วนที่มัดจำไม่พอ ฿${formatCurrency(charge)} ต้องชำระก่อน จึงจะย้ายห้องและทำสัญญาได้` : ''}
          </li>
        )}
        {!impact.final && charge > 0 && (
          <li className="is-danger">
            {impact.transfer_charge?.due_at
              ? `ชำระส่วนต่าง ฿${formatCurrency(charge)} ภายใน ${formatDateTime(impact.transfer_charge.due_at)} ถ้าไม่ชำระ คำขอย้ายห้องและการทำสัญญาจะถูกยกเลิกอัตโนมัติ`
              : `เมื่อเจ้าหน้าที่ส่งยอดมา ต้องชำระส่วนต่างภายใน 3 วัน ถ้าไม่ชำระ คำขอย้ายห้องและการทำสัญญาจะถูกยกเลิกอัตโนมัติ`}
          </li>
        )}
        {diff <= 0 && <li className="is-ok">{diff === 0 ? 'ค่าเช่าเท่าเดิม' : 'ห้องใหม่ถูกกว่า'} ไม่หักเงินมัดจำและไม่มียอดเพิ่ม</li>}
        <li>สัญญาฉบับเดิมยังใช้ต่อ ระบบบันทึกการย้ายห้องแนบท้ายสัญญา ดูได้ที่เมนูสัญญาเช่าของฉัน</li>
        {outstanding.length > 0 && (
          <li className="is-danger">
            ต้องชำระยอดค้างก่อนจึงจะอนุมัติได้: {outstanding.map((item) => `${item.label} ฿${formatCurrency(item.amount)}`).join(', ')}
          </li>
        )}
        {!impact.final && impact.target_available === false && (
          <li className="is-danger">ห้อง {impact.to_room_number} ไม่ว่างแล้ว กรุณาติดต่อเจ้าหน้าที่</li>
        )}
        {!impact.final && <li>ตัวเลขคำนวณจากข้อมูลปัจจุบัน ยอดจริงยืนยันตอนเจ้าหน้าที่อนุมัติ</li>}
      </ul>
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
            <span>ห้องที่ย้ายไป</span>
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
          <MoveRoomContractImpact request={request} />
        </>
      )}
      {request.type === 'moveout' && (() => {
        const waiting = ['pending', 'in_progress'].includes(request.status)
        const voided = ['rejected', 'cancelled'].includes(request.status)
        const contractEnd = request.source_rental_end_date
        const deposit = Number(request.deposit_amount) || 0
        const moveDay = request.preferred_move_date ? new Date(`${request.preferred_move_date}T00:00:00`) : null
        const endDay = contractEnd ? new Date(contractEnd) : null
        if (endDay) endDay.setHours(0, 0, 0, 0)
        const daysEarly = moveDay && endDay ? Math.ceil((endDay - moveDay) / 86400000) : null
        const leavesEarly = daysEarly !== null && daysEarly > 0
        return (
          <>
            <div className="dashboard-maintenance-detail-row">
              <span>วันที่ต้องการย้ายออก</span>
              <strong className="is-accent">{moveDay ? formatDateOnly(request.preferred_move_date) : 'ไม่ระบุ'}</strong>
            </div>
            {contractEnd && !voided && (
              <div className="dashboard-maintenance-detail-row">
                <span>สิ้นสุดสัญญา</span>
                <strong>{formatDate(contractEnd)}</strong>
              </div>
            )}
            {waiting && daysEarly !== null && (
              <div className="dashboard-maintenance-detail-row">
                <span>ย้ายออกเทียบกับสัญญา</span>
                <strong className={leavesEarly ? 'is-danger' : 'is-success'}>
                  {leavesEarly ? `ก่อนครบสัญญา ${daysEarly} วัน` : 'ครบสัญญาแล้ว'}
                </strong>
              </div>
            )}
            {waiting && (
              <div className="dashboard-maintenance-detail-row">
                <span>ตรวจสภาพห้อง</span>
                <strong className={request.room_inspected ? 'is-success' : 'is-pending'}>
                  {request.room_inspected ? 'ตรวจเรียบร้อยแล้ว' : 'รอเจ้าหน้าที่ตรวจห้อง'}
                </strong>
              </div>
            )}
            {deposit > 0 && (
              <div className="dashboard-maintenance-detail-row">
                <span>เงินมัดจำ</span>
                <strong className={voided ? 'is-success' : waiting && daysEarly !== null ? (leavesEarly ? 'is-danger' : 'is-success') : ''}>
                  ฿{formatCurrency(deposit)}
                  {voided
                    ? ' · ยังอยู่ครบ'
                    : waiting && daysEarly !== null
                      ? leavesEarly ? ' · จะถูกริบ' : ' · คืนหลังตรวจห้อง'
                      : request.status === 'approved' ? ' · ดูผลในเมนูสัญญาเช่าของฉัน' : ''}
                </strong>
              </div>
            )}
            {voided ? (
              <p className="dashboard-renew-summary is-warning">
                <strong>คำขอนี้ไม่มีผล</strong> สัญญาเช่าและเงินมัดจำของคุณยังเหมือนเดิม
                {' '}หากยังต้องการย้ายออก สามารถแจ้งย้ายออกใหม่ได้
              </p>
            ) : waiting ? (
              <div className="dashboard-moveout-summary">
                {deposit > 0 && (
                  <div className={`dashboard-moveout-summary-item ${leavesEarly ? 'is-danger' : 'is-ok'}`}>
                    <strong>{leavesEarly ? 'ไม่ได้รับเงินมัดจำคืน' : 'ได้รับเงินมัดจำคืน'}</strong>
                    <span>
                      {leavesEarly
                        ? `ย้ายออกก่อนสิ้นสุดสัญญา ${daysEarly} วัน เงินมัดจำ ฿${formatCurrency(deposit)} จะถูกริบ`
                        : `พักครบสัญญา ได้รับเงินมัดจำ ฿${formatCurrency(deposit)} คืน (อาจหักค่าเสียหายจากผลตรวจห้อง)`}
                    </span>
                  </div>
                )}
                <div className="dashboard-moveout-summary-item">
                  <strong>ก่อนเจ้าหน้าที่อนุมัติ</strong>
                  <ul>
                    <li>เจ้าหน้าที่ต้องตรวจสภาพห้องก่อน</li>
                    <li>ต้องไม่มียอดค้างชำระ</li>
                  </ul>
                </div>
              </div>
            ) : request.status === 'approved' ? (
              <p className="dashboard-renew-summary">
                ย้ายออกเรียบร้อยแล้ว · ยังเข้าสู่ระบบเพื่อดูประวัติการเช่า ใบเสร็จ และสัญญาเก่าได้
              </p>
            ) : null}
          </>
        )
      })()}
      {request.type === 'renew' && (() => {
        const waiting = ['pending', 'in_progress'].includes(request.status)
        const currentEnd = request.source_rental_end_date
        const newEnd = waiting && currentEnd ? addContractMonths(currentEnd, Number(request.renew_duration_months)) : null
        const hasDeposit = Number(request.deposit_amount) > 0
        return (
          <>
            <div className="dashboard-maintenance-detail-row">
              <span>ระยะเวลาที่ขอต่อ</span>
              <strong className="is-accent">+{RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`}</strong>
            </div>
            {currentEnd && (
              <div className="dashboard-maintenance-detail-row">
                <span>{waiting ? 'สิ้นสุดสัญญาเดิม' : 'สิ้นสุดสัญญาปัจจุบัน'}</span>
                <strong className={waiting ? 'is-old' : 'is-accent'}>{formatDate(currentEnd)}</strong>
              </div>
            )}
            {newEnd && (
              <div className="dashboard-maintenance-detail-row">
                <span>สิ้นสุดสัญญาใหม่ (หลังอนุมัติ)</span>
                <strong className="is-success">{formatDate(newEnd)}</strong>
              </div>
            )}
            <div className="dashboard-maintenance-detail-row">
              <span>รูปแบบการชำระ</span>
              <strong>
                จ่ายรายเดือน
                {request.source_room_price != null && (
                  <span className="dashboard-detail-money"> · ฿{formatCurrency(request.source_room_price)}/เดือน</span>
                )}
              </strong>
            </div>
            {hasDeposit && (
              <div className="dashboard-maintenance-detail-row">
                <span>เงินมัดจำ</span>
                <strong className="is-success">฿{formatCurrency(request.deposit_amount)} · ยังอยู่ครบ</strong>
              </div>
            )}
            <p className="dashboard-renew-summary">
              <strong>ต่อจากวันสิ้นสุดสัญญาเดิม</strong> ไม่เริ่มนับใหม่ · ช่วงที่ต่อชำระ<strong>ค่าเช่ารายเดือนตามปกติ</strong>{' '}
              <span className="is-good">ไม่เก็บมัดจำเพิ่ม</span>
              {hasDeposit && (
                <>
                  {' '}· <span className="is-alert">
                    หากย้ายออกก่อนวันสิ้นสุดสัญญา{newEnd ? `ใหม่ (${formatDate(newEnd)})` : ''} จะไม่ได้รับเงินมัดจำ ฿{formatCurrency(request.deposit_amount)} คืน
                  </span>
                </>
              )}
            </p>
          </>
        )
      })()}
      <div className="dashboard-maintenance-detail-row">
        <span>วันที่ส่งคำขอ</span>
        <strong>{formatDateTime(request.created_at)}</strong>
      </div>
    </div>
  )
}

const STATUS_HERO_LABEL = {
  success: 'เรียบร้อยแล้ว',
  info: 'กำลังดำเนินการ',
  danger: 'ไม่สำเร็จ',
}

function getStatusPopupContent(popup) {
  if (popup.kind === 'move_room' && isMoveRoomTakenCancellation({ ...popup.request, type: 'move_room' })) {
    return getMoveRoomTakenPopupContent(popup.request)
  }
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
  if (kind === 'resident_visit') {
    if (request.status === 'cancelled') {
      return [
        { label: 'ส่งคำขอ', date: request.created_at, done: true },
        { label: 'ยกเลิกรายการ', date: request.cancelled_at || request.created_at, done: true, by: request.cancelled_by_name },
      ]
    }
    const finalLabel = TENANT_REQUEST_FINAL_LOG_LABEL[request.status]
    return [
      { label: 'ส่งคำขอ', date: request.created_at, done: true },
      {
        label: finalLabel || REQUEST_TIMELINE_PENDING_FINAL_LABEL,
        date: finalLabel ? request.admin_reviewed_at || request.reviewed_at || request.created_at : null,
        done: Boolean(finalLabel),
        by: finalLabel ? request.admin_reviewed_by_name || request.reviewed_by_name : null,
      },
    ]
  }
  if (kind === 'safety') {
    const isReviewed = request.status === 'reviewed'
    if (request.status === 'cancelled') {
      return [
        { label: 'แจ้งเหตุ', date: request.created_at, done: true },
        { label: 'ยกเลิกแล้ว', date: request.cancelled_at || request.created_at, done: true, by: request.cancelled_by_name },
      ]
    }
    return [
      { label: 'แจ้งเหตุ', date: request.created_at, done: true },
      {
        label: isReviewed ? 'ตรวจสอบแล้ว' : REQUEST_TIMELINE_PENDING_FINAL_LABEL,
        date: isReviewed ? request.reviewed_at || request.created_at : null,
        done: isReviewed,
        by: isReviewed ? request.reviewed_by_name : null,
      },
    ]
  }
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
    { label: 'เจ้าหน้าที่รับเรื่อง', date: request.accepted_at, done: Boolean(request.accepted_at), by: request.accepted_by_name },
    {
      label: finalLabel || REQUEST_TIMELINE_PENDING_FINAL_LABEL,
      date: isFinal ? request.completed_at || request.accepted_at || request.created_at : null,
      done: isFinal,
      by: isFinal && !isSelfCancelledMaintenance ? request.completed_by_name : null,
    },
  ]
}

const REQUEST_PROGRESS_VISIBLE_MS = 10 * 60 * 1000

function isRequestSettled(request) {
  if (!request || !['approved', 'rejected', 'cancelled'].includes(request.status)) return false
  const finishedAt = new Date(request.completed_at || request.accepted_at || request.created_at).getTime()
  return Date.now() - finishedAt > REQUEST_PROGRESS_VISIBLE_MS
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

function getRequestSubject(kind, request) {
  const sent = formatStepDate(request.created_at)
  const meta = `ส่งเมื่อ ${sent.date} ${sent.time} น.`
  if (kind === 'resident_visit') {
    return {
      title: `ลงทะเบียนรถ ${getVisitTitle(request)}`,
      meta: `${request.guest_name ? RESIDENT_VEHICLE_OWNER_LABEL.family : RESIDENT_VEHICLE_OWNER_LABEL.self} · ${meta}`,
    }
  }
  if (kind === 'safety') {
    return { title: `แจ้งเหตุ${SAFETY_INCIDENT_TYPE_LABEL[request.incident_type] || ''}`, meta: `แจ้งเมื่อ ${sent.date} ${sent.time} น.` }
  }
  if (kind === 'maintenance') return { title: 'แจ้งซ่อม', meta }
  const target = kind === 'move_room' && request.target_room_number ? ` ไปห้อง ${request.target_room_number}` : ''
  return { title: `คำขอ${TENANT_REQUEST_TYPE_LABEL[kind] || ''}${target}`, meta }
}

const FINISHED_PROGRESS_VISIBLE_MS = 5 * 60 * 1000

function RequestTimelineDropdown({ kind, request }) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  const timeline = getRequestTimeline(kind, request)
  if (timeline.length === 0) return null
  const inProgress = ['pending', 'in_progress'].includes(request.status)
  if (!inProgress) {
    const finishedAt = new Date(timeline[timeline.length - 1].date || request.completed_at || request.reviewed_at || 0).getTime()
    const justFinished = Number.isFinite(finishedAt) && finishedAt > 0 && now - finishedAt <= FINISHED_PROGRESS_VISIBLE_MS
    if (!justFinished) return null
  }
  const subject = getRequestSubject(kind, request)

  const doneCount = timeline.filter((step) => step.done).length
  const currentStep = timeline.find((step) => !step.done)

  return (
    <div className={`dashboard-progress-dropdown${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="dashboard-progress-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="dashboard-progress-toggle-label">ความคืบหน้า</span>
        <span className={`dashboard-progress-toggle-step${!currentStep ? ' is-complete' : ''}`}>
          {!currentStep
            ? 'ครบทุกขั้นตอน'
            : currentStep.label.startsWith('รอ')
              ? currentStep.label
              : `รอ${currentStep.label}`}
        </span>
        <span className="dashboard-progress-toggle-count">
          {doneCount}/{timeline.length}
        </span>
        <svg
          className="dashboard-progress-toggle-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="dashboard-progress-panel">
          <div className="dashboard-progress-panel-head">
            <span className="dashboard-progress-panel-text">
              <small>ขั้นตอนของ</small>
              <strong>{subject.title}</strong>
              <span>{subject.meta}</span>
            </span>
          </div>
          <RequestTimeline kind={kind} request={request} compact />
        </div>
      )}
    </div>
  )
}

const STEP_ICON_PATHS = {
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></>,
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M12 8v4M12 16h.01" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  check: <path d="M5 12.5 10 17l9-10" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  box: <><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>,
}

function StepDotIcon({ type, number }) {
  if (!type) return <span className="dashboard-step-number">{number}</span>
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {STEP_ICON_PATHS[type]}
    </svg>
  )
}

function getStepIcon(kind, step, index, { isLast, isCurrent, finalTone }) {
  if (!step.done) return isCurrent ? 'clock' : null
  if (isLast && index > 0) return finalTone === 'danger' ? 'x' : 'check'
  if (index === 0) return kind === 'maintenance' ? 'tool' : kind === 'safety' ? 'shield' : 'send'
  return 'user'
}

const PROFILE_SUMMARY_ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /></>,
  money: <><rect x="3" y="6" width="18" height="13" rx="2" /><circle cx="12" cy="12.5" r="2.5" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.7L8.7 10.5a16 16 0 0 0 4.8 4.8l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.5a2 2 0 0 1 1.7 2Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  idcard: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0M15 10h3M15 14h3" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
}

function CustomerProfileSummary({ customer, room }) {
  const [idcardRevealed, setIdcardRevealed] = useState(false)
  const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || '-'
  const idcard = String(customer.idcard || '')
  const renting = Boolean(room?.is_booked)
  const rows = [
    { key: 'room', icon: 'home', label: 'ห้องพัก', value: room?.room_number ? `ห้อง ${room.room_number}` : 'ไม่มีห้องพัก' },
    ...(room?.price != null ? [{ key: 'price', icon: 'money', label: 'ค่าเช่า', value: `฿${formatCurrency(room.price)} / เดือน` }] : []),
    { key: 'phone', icon: 'phone', label: 'เบอร์โทร', value: customer.phone || '-' },
    { key: 'age', icon: 'user', label: 'อายุ', value: customer.age ? `${customer.age} ปี` : '-' },
    {
      key: 'idcard',
      icon: 'idcard',
      label: 'บัตรประชาชน',
      value: idcard ? (
        <button
          type="button"
          className={`dashboard-profile-idcard${idcardRevealed ? ' is-revealed' : ''}`}
          onClick={() => setIdcardRevealed((value) => !value)}
          title={idcardRevealed ? 'ซ่อนเลขบัตร' : 'กดเพื่อแสดงเลขบัตร'}
          aria-label={idcardRevealed ? 'ซ่อนเลขบัตรประชาชน' : 'แสดงเลขบัตรประชาชน'}
        >
          <span>{idcardRevealed ? idcard : '•'.repeat(idcard.length || 13)}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {idcardRevealed ? (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 6.1A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.6A17 17 0 0 0 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 4-.9" />
              </>
            ) : (
              <>
                <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.5" />
              </>
            )}
          </svg>
        </button>
      ) : '-',
    },
    { key: 'deposit', icon: 'wallet', label: 'เงินมัดจำ', value: customer.deposit_amount != null ? `฿${formatCurrency(customer.deposit_amount)}` : '-' },
    {
      key: 'contract',
      icon: 'calendar',
      label: 'สัญญาเช่า',
      value: room?.rental_start_date || room?.rental_end_date
        ? `${room.rental_start_date ? formatDate(room.rental_start_date) : '-'} ถึง ${room.rental_end_date ? formatDate(room.rental_end_date) : '-'}`
        : '-',
    },
    { key: 'since', icon: 'clock', label: 'เข้าพักเมื่อ', value: customer.registered_at ? formatDate(customer.registered_at) : '-' },
  ]

  return (
    <aside className="dashboard-profile-summary">
      <div className="dashboard-profile-summary-head">
        <svg className="dashboard-profile-summary-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="10" r="3.2" />
          <path d="M6.2 18.6a6.5 6.5 0 0 1 11.6 0" />
        </svg>
        <strong>{fullName}</strong>
        <span className={`dashboard-profile-summary-status${renting ? ' is-active' : ''}`}>{renting ? 'กำลังเช่าอยู่' : 'ไม่มีห้องพัก'}</span>
      </div>
      <dl className="dashboard-profile-summary-list">
        {rows.map((row) => (
          <div key={row.key}>
            <dt>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {PROFILE_SUMMARY_ICONS[row.icon]}
              </svg>
              {row.label}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

const REMINDER_ICON_PATHS = {
  contract: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18M12 14v3" /></>,
  payment: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></>,
}

function DashboardReminders({ reminders }) {
  const [open, setOpen] = useState(true)
  if (reminders.length === 0) return null
  const urgent = reminders.some((reminder) => reminder.type === 'danger')
  return (
    <section className={`dashboard-reminders${urgent ? ' is-danger' : ' is-warning'}${open ? ' is-open' : ''}`}>
      <button type="button" className="dashboard-reminders-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="dashboard-reminders-bell" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        <span className="dashboard-reminders-heading">
          <strong>สิ่งที่ต้องดำเนินการ</strong>
          <small>{urgent ? 'มีรายการที่ต้องดำเนินการด่วน' : 'มีรายการที่ควรดำเนินการเร็วๆ นี้'}</small>
        </span>
        <span className="dashboard-reminders-count">{reminders.length}</span>
        <svg className="dashboard-reminders-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <ul className="dashboard-reminders-list">
          {reminders.map((reminder) => (
            <li key={`${reminder.kind}-${reminder.title}`} className={`dashboard-reminder is-${reminder.type}`}>
              <span className="dashboard-reminder-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  {REMINDER_ICON_PATHS[reminder.kind]}
                </svg>
              </span>
              <span className="dashboard-reminder-text">
                <strong>{reminder.title}</strong>
                <span>
                  {reminder.text}
                  {reminder.highlight && <mark className="dashboard-reminder-highlight">{reminder.highlight}</mark>}
                  {reminder.suffix}
                </span>
              </span>
              <span className="dashboard-reminder-tag">{reminder.type === 'danger' ? 'ด่วน' : 'แจ้งเตือน'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const STEPPER_MANY_THRESHOLD = 4

function DashboardStepper({ count, currentIndex, children }) {
  const listRef = useRef(null)
  const isMany = count > STEPPER_MANY_THRESHOLD

  useEffect(() => {
    const list = listRef.current
    if (!isMany || !list || list.scrollWidth <= list.clientWidth) return
    const item = list.children[currentIndex >= 0 ? currentIndex : count - 1]
    if (!item) return
    list.scrollLeft = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2
  }, [isMany, count, currentIndex])

  return (
    <ol ref={listRef} className={`dashboard-stepper${isMany ? ' is-many' : ''}`}>
      {children}
    </ol>
  )
}

function RequestTimeline({ kind, request, compact = false }) {
  const timeline = getRequestTimeline(kind, request)
  if (timeline.length === 0) return null

  const statusBadgeClass =
    kind === 'maintenance'
      ? maintenanceBadgeClass(request.status)
      : kind === 'safety'
        ? SAFETY_STATUS_BADGE[request.status] || 'pending'
        : tenantRequestBadgeClass(request.status)
  const statusLabel =
    kind === 'maintenance'
      ? MAINTENANCE_STATUS_LABEL[request.status]
      : kind === 'safety'
        ? SAFETY_STATUS_LABEL[request.status]
        : kind === 'resident_visit'
          ? RESIDENT_VISIT_STATUS_LABEL[request.status]
          : TENANT_REQUEST_STATUS_LABEL[request.status]
  const lastStep = timeline[timeline.length - 1]
  const totalMs = lastStep.done ? new Date(lastStep.date).getTime() - new Date(timeline[0].date).getTime() : null
  const currentIndex = timeline.findIndex((step) => !step.done)
  const finalTone = ['rejected', 'cancelled'].includes(request.status)
    ? 'danger'
    : ['approved', 'done', 'reviewed'].includes(request.status)
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
      <DashboardStepper count={timeline.length} currentIndex={currentIndex}>
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
              {!compact && stepMs !== null && <span className="dashboard-step-gap">+ {formatRemaining(stepMs)}</span>}
              <span className="dashboard-step-dot" aria-hidden="true">
                <StepDotIcon
                  type={getStepIcon(kind, step, index, { isLast, isCurrent: index === currentIndex, finalTone })}
                  number={index + 1}
                />
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
              {!compact && step.done && step.by && (
                <p className="dashboard-step-by">
                  โดย <span className="dashboard-actor">{step.by}</span>
                </p>
              )}
            </li>
          )
        })}
      </DashboardStepper>
      {!compact && (
        <p className={`dashboard-progress-total${totalMs === null ? ' is-waiting' : ''}`}>
          <StepDotIcon type="clock" />
          {totalMs !== null ? (
            <>
              รวมใช้เวลาทั้งหมด <strong>{formatRemaining(totalMs)}</strong>
            </>
          ) : (
            'กำลังดำเนินการ'
          )}
        </p>
      )}
    </div>
  )
}

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
        <UploadImage src={current.url} alt={current.name || `รูปพัสดุ ${selected + 1}`} />
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
              <UploadImage src={photo.url} alt="" />
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
              <StepDotIcon type={step.done ? (step.key === 'logged' ? 'box' : 'check') : 'clock'} number={index + 1} />
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

const NOTIF_PAGE_SIZE = 30

const CUSTOMER_TABS = [
  { key: 'home', label: 'หน้าแรก' },
  { key: 'rental-history', label: 'ประวัติการเช่า' },
  { key: 'contract', label: 'สัญญาเช่าของฉัน' },
  { key: 'parcels', label: 'พัสดุ' },
  { key: 'vehicles', label: 'รถของฉัน' },
  { key: 'announcements', label: 'ประกาศจากหอพัก' },
  { key: 'profile', label: 'โปรไฟล์และรหัสผ่าน' },
]
const MAINTENANCE_PAGE_SIZE = 5
const RENTAL_HISTORY_PAGE_SIZE = 5
const RENTAL_HISTORY_FULL_PAGE_SIZE = 30
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

const MAINTENANCE_CATEGORY_ICON_PATHS = {
  electrical: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  plumbing: <path d="M12 2.7s6 6.4 6 11.3a6 6 0 0 1-12 0c0-4.9 6-11.3 6-11.3z" />,
  aircon: (
    <>
      <path d="M12 2v20M4.9 6.9l14.2 10.2M19.1 6.9 4.9 17.1" />
      <path d="m9 3.5 3 2 3-2M9 20.5l3-2 3 2" />
    </>
  ),
  furniture: (
    <>
      <path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3" />
      <path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2" />
    </>
  ),
  other: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
}

function MaintenanceCategoryIcon({ category, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {MAINTENANCE_CATEGORY_ICON_PATHS[category] || MAINTENANCE_CATEGORY_ICON_PATHS.other}
    </svg>
  )
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

function formatRoomSize(value) {
  return `${formatCurrency(value)} ตร.ม.`
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

const MOVE_ROOM_COOLDOWN_ENABLED = false
const MOVE_ROOM_COOLDOWN_DAYS = 15

function moveRoomCooldown(startValue, lastTransferValue) {
  const start = startValue ? new Date(startValue) : null
  const lastTransfer = lastTransferValue ? new Date(lastTransferValue) : null
  const afterTransfer = Boolean(lastTransfer && (!start || lastTransfer > start))
  const base = afterTransfer ? lastTransfer : start
  if (!base) return null
  return {
    allowedAt: new Date(base.getFullYear(), base.getMonth(), base.getDate() + MOVE_ROOM_COOLDOWN_DAYS),
    afterTransfer,
  }
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

const RESIDENT_VISIT_TYPE_LABEL = { vehicle: 'รถ / ที่จอดรถ', overnight_guest: 'แขกค้างคืน' }
const RESIDENT_VISIT_STATUS_LABEL = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' }
const RESIDENT_VEHICLE_OWNER_LABEL = { self: 'รถของฉัน', family: 'รถครอบครัวที่มาเยี่ยม' }
const EMPTY_RESIDENT_VISIT_FORM = {
  owner: 'self',
  vehiclePlate: '',
  vehicleModel: '',
  guestName: '',
  guestPhone: '',
  startAt: null,
  endAt: null,
  limitTime: true,
  note: '',
  photos: [],
}

function defaultVisitWindow() {
  const start = new Date()
  start.setSeconds(0, 0)
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { startAt: start, endAt: end }
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function CarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.6 5H8.4a2 2 0 0 0-1.9 1.3L5 10 3 8" />
      <rect x="3" y="10" width="18" height="8" rx="2" />
      <path d="M7 14h.01M17 14h.01" />
      <path d="M5 18v2M19 18v2" />
    </svg>
  )
}

function GuestIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
      <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
      <path d="M12 4v6" />
      <path d="M2 18h20" />
    </svg>
  )
}

function formatVisitPoint(value) {
  const date = new Date(value)
  return {
    day: date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
    time: date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
  }
}

function DetailTimeline({ steps }) {
  return <StepTimeline steps={steps} actorClassName="dashboard-actor" />
}

function RoomChip({ room }) {
  return (
    <span className="dashboard-room-chip">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 21h18" />
        <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
        <path d="M14 12h.01" />
      </svg>
      ห้อง {room}
    </span>
  )
}

function VisitRange({ start, end }) {
  const from = formatVisitPoint(start)
  if (!end) {
    return (
      <span className="dashboard-rv-range">
        <span className="dashboard-rv-range-point">
          <b>{from.day}</b>
          {from.time}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <b>ไม่จำกัดเวลา</b>
      </span>
    )
  }
  const to = formatVisitPoint(end)
  return (
    <span className="dashboard-rv-range">
      <span className="dashboard-rv-range-point">
        <b>{from.day}</b>
        {from.time}
      </span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
      <span className="dashboard-rv-range-point">
        <b>{to.day}</b>
        {to.time}
      </span>
    </span>
  )
}

function toLocalDateTime(date) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

const RESIDENT_VISIT_FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รออนุมัติ', tone: 'warning' },
  { key: 'approved', label: 'อนุมัติแล้ว', tone: 'success' },
  { key: 'rejected', label: 'ไม่อนุมัติ', tone: 'danger' },
  { key: 'cancelled', label: 'ยกเลิกแล้ว' },
]

function getVisitKind(item) {
  if (item.request_type !== 'vehicle') return item.request_type
  return item.guest_name ? 'family' : 'self'
}

function getVisitKindLabel(item) {
  const kind = getVisitKind(item)
  return RESIDENT_VEHICLE_OWNER_LABEL[kind] || RESIDENT_VISIT_TYPE_LABEL[kind] || kind
}

function getVisitTitle(item) {
  return item.request_type === 'vehicle'
    ? item.vehicle_plate || RESIDENT_VISIT_TYPE_LABEL.vehicle
    : item.guest_name || RESIDENT_VISIT_TYPE_LABEL.overnight_guest
}

function formatVisitDateTime(value) {
  const date = new Date(value)
  return `${date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} เวลา ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
}

function formatVisitRange(start, end) {
  const options = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  return `${new Date(start).toLocaleString('th-TH', options)} – ${end ? new Date(end).toLocaleString('th-TH', options) : 'ไม่จำกัดเวลา'}`
}

function ResidentVisitRequestRow({ outstanding = 0, onPayOutstanding }) {
  const [view, setView] = useState(null)
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(null)
  const [historyFilter, setHistoryFilter] = useState('all')
  const [historySearch, setHistorySearch] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [form, setForm] = useState(EMPTY_RESIDENT_VISIT_FORM)
  const token = sessionStorage.getItem('token')
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const load = useCallback(
    () =>
      axios
        .get('/api/customer/resident-visit-requests', { headers })
        .then(({ data }) => setItems(data.requests || []))
        .catch((requestError) => setError(requestError.response?.data?.message || 'โหลดคำขอไม่สำเร็จ')),
    [headers],
  )

  useEffect(() => {
    load()
  }, [load])

  const updateForm = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value })
    if (error) setError('')
  }

  const updateDate = (field, date) => {
    const next = { ...form, [field]: date }
    if (field === 'startAt' && date && next.endAt && next.endAt <= date) next.endAt = null
    setForm(next)
    if (error) setError('')
  }

  const toggleLimitTime = (enabled) => {
    const next = { ...form, limitTime: enabled }
    if (enabled && !next.endAt && next.startAt) {
      const end = new Date(next.startAt)
      end.setDate(end.getDate() + 1)
      next.endAt = end
    }
    setForm(next)
    if (error) setError('')
  }

  const openModal = () => {
    setView('form')
    setError('')
    setForm((current) => (current.startAt ? current : { ...current, ...defaultVisitWindow() }))
    load()
  }

  const openHistory = () => {
    setView('history')
    load()
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!form.startAt) {
      setError('กรุณาเลือกวันเวลาเริ่ม')
      return
    }
    if (form.limitTime && !form.endAt) {
      setError('กรุณาเลือกวันเวลาสิ้นสุด หรือปิด "กำหนดระยะเวลาจอด"')
      return
    }
    if (form.limitTime && form.endAt <= form.startAt) {
      setError('วันสิ้นสุดต้องอยู่หลังวันเริ่ม')
      return
    }
    setBusy(true)
    setError('')
    try {
      const photos = (await Promise.all(form.photos.map(compressImageFile))).map(({ name, dataUrl }) => ({ name, dataUrl }))
      await axios.post(
        '/api/customer/resident-visit-requests',
        {
          requestType: 'vehicle',
          vehiclePlate: form.vehiclePlate,
          vehicleModel: form.vehicleModel,
          guestName: form.owner === 'family' ? form.guestName : '',
          guestPhone: form.owner === 'family' ? form.guestPhone : '',
          note: form.note,
          photos,
          startAt: toLocalDateTime(form.startAt),
          endAt: form.limitTime ? toLocalDateTime(form.endAt) : null,
        },
        { headers },
      )
      setSubmitted({
        type: 'vehicle',
        owner: form.owner,
        ownerLabel: RESIDENT_VEHICLE_OWNER_LABEL[form.owner],
        title: form.vehiclePlate.trim(),
        startAt: form.startAt,
        endAt: form.limitTime ? form.endAt : null,
      })
      setForm(EMPTY_RESIDENT_VISIT_FORM)
      setView('success')
      load()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'ส่งคำขอไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const pendingCount = items.filter((item) => item.status === 'pending').length
  const historyKeyword = historySearch.trim().toLowerCase()
  const searchedItems = historyKeyword
    ? items.filter((item) =>
        [
          item.vehicle_plate,
          item.vehicle_model,
          item.guest_name,
          item.guest_phone,
          item.note,
          getVisitKindLabel(item),
          RESIDENT_VISIT_STATUS_LABEL[item.status],
          formatVisitRange(item.start_at, item.end_at),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(historyKeyword),
      )
    : items
  const filteredItems = historyFilter === 'all' ? searchedItems : searchedItems.filter((item) => item.status === historyFilter)
  const detailItem = items.find((item) => item.id === detailId)
  const latestItem = items[0]

  return (
    <div className={`dashboard-request-row${latestItem ? ' has-detail-link' : ''}`}>
      <div className="dashboard-request-info">
        <p className="dashboard-request-title">ลงทะเบียนรถและผู้มาติดต่อ</p>
        <p className="dashboard-request-desc">
          {outstanding > 0 ? (
            <OutstandingNotice amount={outstanding} action="ลงทะเบียนรถและผู้มาติดต่อ" />
          ) : pendingCount > 0 ? (
            <>
              <span className="dashboard-request-desc-status">
                รออนุมัติ <strong>{pendingCount} รายการ</strong>
                <span className="dashboard-request-desc-limit">จากสูงสุด {CUSTOMER_OPEN_REPORT_LIMIT} รายการ</span>
              </span>
              {pendingCount >= CUSTOMER_OPEN_REPORT_LIMIT && (
                <small className="dashboard-request-desc-hint">รอเจ้าหน้าที่พิจารณาก่อนส่งคำขอเพิ่ม</small>
              )}
            </>
          ) : 'ลงทะเบียนรถของคุณหรือรถครอบครัวที่มาเยี่ยม'}
        </p>
      </div>
      {outstanding > 0 && onPayOutstanding ? (
        <button type="button" className="dashboard-action-btn is-primary" onClick={onPayOutstanding}>
          ชำระยอดค้าง
        </button>
      ) : (
        <button
          type="button"
          className="dashboard-action-btn is-primary"
          onClick={openModal}
          disabled={outstanding > 0 || pendingCount >= CUSTOMER_OPEN_REPORT_LIMIT}
          title={
            outstanding > 0
              ? 'ชำระยอดค้างให้ครบก่อนลงทะเบียน'
              : pendingCount >= CUSTOMER_OPEN_REPORT_LIMIT ? `ส่งได้สูงสุด ${CUSTOMER_OPEN_REPORT_LIMIT} รายการที่รออนุมัติ` : undefined
          }
        >
          ลงทะเบียน
        </button>
      )}
      {latestItem && (
        <RequestTimelineDropdown kind="resident_visit" request={items.find((item) => item.status === 'pending') || latestItem} />
      )}
      {latestItem && (
        <button
          type="button"
          className="dashboard-maintenance-more"
          onClick={() => {
            const activeItem = items.find((item) => item.status === 'pending')
            if (!activeItem) {
              openHistory()
              return
            }
            setDetailId(activeItem.id)
            setView('detail')
          }}
        >
          {items.some((item) => item.status === 'pending') ? 'ดูรายละเอียด' : 'ดูประวัติ'}
        </button>
      )}
      {view === 'form' && (
        <Modal title="ลงทะเบียนรถและผู้มาติดต่อ" onClose={() => setView(null)}>
          {(requestClose) => (
            <div className="dashboard-rv">
              <div className="dashboard-rv-top">
                <p className="dashboard-rv-intro">ส่งข้อมูลให้เจ้าหน้าที่ตรวจสอบและอนุมัติ</p>
                <button type="button" className="dashboard-rv-history-link" onClick={openHistory}>
                  คำขอของฉัน
                  {items.length > 0 && <span className="dashboard-rv-history-count">{items.length}</span>}
                  {pendingCount > 0 && <span className="dashboard-rv-history-pending">รอ {pendingCount}</span>}
                  <span aria-hidden="true">›</span>
                </button>
              </div>
              <form className="dashboard-inline-form dashboard-rv-form" onSubmit={submit}>
                <p className="dashboard-rv-own-note">
                  <CarIcon />
                  ลงทะเบียนได้เฉพาะรถของคุณ และรถของครอบครัวที่มาเยี่ยมเท่านั้น
                </p>

                <label htmlFor="rv-owner">รถของ</label>
                <select
                  id="rv-owner"
                  value={form.owner}
                  onChange={(event) => {
                    setForm({ ...form, owner: event.target.value, guestName: '', guestPhone: '' })
                    if (error) setError('')
                  }}
                >
                  {Object.entries(RESIDENT_VEHICLE_OWNER_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <div className="dashboard-rv-grid">
                  <div className="dashboard-rv-field">
                    <label htmlFor="rv-plate">
                      ทะเบียนรถ <span className="dashboard-required">*</span>
                    </label>
                    <input id="rv-plate" type="text" required value={form.vehiclePlate} onChange={updateForm('vehiclePlate')} placeholder="กข 1234" />
                  </div>
                  <div className="dashboard-rv-field">
                    <label htmlFor="rv-model">ยี่ห้อ / รุ่น</label>
                    <input id="rv-model" type="text" value={form.vehicleModel} onChange={updateForm('vehicleModel')} placeholder="เช่น Toyota Yaris" />
                  </div>
                </div>

                {form.owner === 'family' && (
                  <div className="dashboard-rv-grid">
                    <div className="dashboard-rv-field">
                      <label htmlFor="rv-guest">
                        ชื่อผู้มาเยี่ยม <span className="dashboard-required">*</span>
                      </label>
                      <input id="rv-guest" type="text" required value={form.guestName} onChange={updateForm('guestName')} placeholder="ชื่อ - นามสกุล" />
                    </div>
                    <div className="dashboard-rv-field">
                      <label htmlFor="rv-guest-phone">เบอร์ติดต่อ</label>
                      <input id="rv-guest-phone" type="tel" value={form.guestPhone} onChange={updateForm('guestPhone')} placeholder="08x-xxx-xxxx" />
                    </div>
                  </div>
                )}

                <div className="dashboard-rv-time-box">
                  <label className={`dashboard-rv-switch${form.limitTime ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={form.limitTime} onChange={(event) => toggleLimitTime(event.target.checked)} />
                    <span className="dashboard-rv-switch-track" aria-hidden="true" />
                    <span className="dashboard-rv-switch-text">
                      <strong>กำหนดระยะเวลาจอด</strong>
                      <small>{form.limitTime ? 'ระบุวันเวลาเริ่มและสิ้นสุด' : 'จอดได้ไม่จำกัดเวลา หลังเจ้าหน้าที่อนุมัติ'}</small>
                    </span>
                  </label>
                  <div className="dashboard-rv-grid">
                    <div className="dashboard-rv-field">
                      <label htmlFor="rv-start">
                        เริ่ม <span className="dashboard-required">*</span>
                      </label>
                      <ThaiDatePicker
                        id="rv-start"
                        valueType="date"
                        className="dashboard-rv-date-input"
                        placeholder="เลือกวันเวลา"
                        value={form.startAt}
                        onChange={(date) => updateDate('startAt', date)}
                        minDate={startOfToday()}
                        showTimeSelect
                        timeIntervals={15}
                        portalId="dashboard-date-portal"
                      />
                    </div>
                    {form.limitTime ? (
                      <div className="dashboard-rv-field">
                        <label htmlFor="rv-end">
                          สิ้นสุด <span className="dashboard-required">*</span>
                        </label>
                        <ThaiDatePicker
                          id="rv-end"
                          valueType="date"
                          className="dashboard-rv-date-input"
                          placeholder="เลือกวันเวลา"
                          value={form.endAt}
                          onChange={(date) => updateDate('endAt', date)}
                          minDate={form.startAt || startOfToday()}
                          openToDate={form.endAt || form.startAt || undefined}
                          filterTime={(time) => !form.startAt || time > form.startAt}
                          showTimeSelect
                          timeIntervals={15}
                          portalId="dashboard-date-portal"
                        />
                      </div>
                    ) : (
                      <div className="dashboard-rv-field">
                        <label>สิ้นสุด</label>
                        <span className="dashboard-rv-open-end">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
                          </svg>
                          ไม่จำกัดเวลา
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="dashboard-rv-photo-head">
                  <label htmlFor="rv-photos">รูปรถ / ป้ายทะเบียน</label>
                  <span className="dashboard-rv-photo-tag">ไม่บังคับ</span>
                  <span className="dashboard-rv-photo-counter">
                    {form.photos.length}/{MAINTENANCE_MAX_PHOTOS}
                  </span>
                </div>
                <MaintenancePhotoPicker
                  id="rv-photos"
                  files={form.photos}
                  onChange={(files) => {
                    setForm({ ...form, photos: files })
                    if (error) setError('')
                  }}
                  onError={setError}
                />

                <label htmlFor="rv-note">หมายเหตุ (ถ้ามี)</label>
                <textarea id="rv-note" rows={2} maxLength={500} value={form.note} onChange={updateForm('note')} placeholder="ข้อมูลเพิ่มเติมสำหรับเจ้าหน้าที่" />

                {error && <p className="dashboard-form-error">{error}</p>}
                <div className="dashboard-form-actions">
                  <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                    ยกเลิก
                  </button>
                  <button type="submit" className="dashboard-action-btn is-primary" disabled={busy}>
                    {busy ? 'กำลังส่ง...' : 'ส่งคำขอ'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </Modal>
      )}
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos.map((photo, index) => ({ name: photo.name || `รูปที่ ${index + 1}`, url: photo.url }))}
          initialIndex={lightbox.index}
          title={`ทะเบียน ${lightbox.plate}`}
          label="รูปรถ / ป้ายทะเบียน"
          onClose={() => setLightbox(null)}
        />
      )}
      {view === 'success' && submitted && (
        <Modal title="ส่งคำขอแล้ว" onClose={() => setView(null)} variant="success">
          {(requestClose) => (
            <div className="dashboard-confirm-body">
              <div className="dashboard-confirm-icon is-success">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="dashboard-confirm-message">ส่งคำขอให้เจ้าหน้าที่แล้ว รอการอนุมัติ</p>
              <div className="dashboard-rv-submitted">
                <span className={`dashboard-rv-history-icon is-${submitted.type}`}>
                  {submitted.type === 'vehicle' ? <CarIcon /> : <GuestIcon />}
                </span>
                <div className="dashboard-rv-history-text">
                  <strong>{submitted.title || RESIDENT_VISIT_TYPE_LABEL[submitted.type]}</strong>
                  <span className="dashboard-rv-meta">
                    <span className={`dashboard-rv-type-chip is-${submitted.owner}`}>{submitted.ownerLabel}</span>
                    <VisitRange start={submitted.startAt} end={submitted.endAt} />
                  </span>
                </div>
              </div>
              <div className="dashboard-form-actions">
                <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                  ปิด
                </button>
                <button type="button" className="dashboard-action-btn is-primary" onClick={openHistory}>
                  ดูคำขอของฉัน
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {view === 'history' && (
        <Modal title="คำขอของฉัน" onClose={() => setView(null)} onBack={() => setView('form')}>
          {(requestClose) => (
            <div className="dashboard-rv">
              <DashboardFilterPanel
                segments={RESIDENT_VISIT_FILTERS.map((filter) => ({
                  ...filter,
                  count: filter.key === 'all' ? searchedItems.length : searchedItems.filter((item) => item.status === filter.key).length,
                }))}
                active={historyFilter}
                onSegment={setHistoryFilter}
                search={historySearch}
                onSearch={setHistorySearch}
                searchPlaceholder="ค้นหาทะเบียนรถ ชื่อแขก เบอร์โทร หรือหมายเหตุ"
                resultText={`พบ ${filteredItems.length} จาก ${items.length} รายการ`}
                canClear={historyFilter !== 'all' || Boolean(historySearch.trim())}
                onClear={() => {
                  setHistoryFilter('all')
                  setHistorySearch('')
                }}
              />
              <section className="dashboard-rv-history" aria-label="รายการคำขอ">
                {filteredItems.length === 0 ? (
                  <div className="dashboard-rv-history-empty">
                    <span className="dashboard-rv-history-empty-icon" aria-hidden="true">
                      <CarIcon />
                    </span>
                    <strong>{items.length === 0 ? 'ยังไม่มีคำขอ' : 'ไม่พบคำขอที่ตรงกับการค้นหา'}</strong>
                    <small>{items.length === 0 ? 'ลงทะเบียนรถได้จากปุ่มด้านล่าง' : 'ลองเปลี่ยนคำค้นหาหรือสถานะ'}</small>
                  </div>
                ) : (
                  <ul className="dashboard-rv-history-list">
                    {filteredItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`dashboard-rv-history-item is-${item.status}`}
                          onClick={() => {
                            setDetailId(item.id)
                            setView('detail')
                          }}
                        >
                          <span className={`dashboard-rv-history-icon is-${item.request_type}`}>
                            {item.request_type === 'vehicle' ? <CarIcon /> : <GuestIcon />}
                          </span>
                          <span className="dashboard-rv-history-text">
                            <strong>
                              {getVisitTitle(item)}
                            </strong>
                            <span className="dashboard-rv-meta">
                              <span className={`dashboard-rv-type-chip is-${getVisitKind(item)}`}>
                                {getVisitKindLabel(item)}
                              </span>
                              <VisitRange start={item.start_at} end={item.end_at} />
                            </span>
                          </span>
                          <span className={`dashboard-badge status-${tenantRequestBadgeClass(item.status)}`}>
                            {RESIDENT_VISIT_STATUS_LABEL[item.status] || item.status}
                          </span>
                          <span className="dashboard-rv-history-chevron" aria-hidden="true">›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <div className="dashboard-form-actions">
                <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                  ปิด
                </button>
                <button type="button" className="dashboard-action-btn is-primary" onClick={() => setView('form')}>
                  ลงทะเบียนใหม่
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {view === 'detail' && detailItem && (
        <Modal title="รายละเอียดคำขอ" onClose={() => setView(null)} onBack={() => setView('history')}>
          {(requestClose) => {
            const reviewer = detailItem.admin_reviewed_by_name || detailItem.reviewed_by_name
            const reviewedAt = detailItem.admin_reviewed_at || detailItem.reviewed_at
            const fields =
              detailItem.request_type === 'vehicle'
                ? [
                    ['รถของ', getVisitKindLabel(detailItem)],
                    ['ทะเบียนรถ', detailItem.vehicle_plate],
                    ['ยี่ห้อ / รุ่น', detailItem.vehicle_model],
                    ...(detailItem.guest_name
                      ? [
                          ['ผู้มาเยี่ยม', detailItem.guest_name],
                          ['เบอร์ติดต่อ', detailItem.guest_phone],
                        ]
                      : []),
                  ]
                : [
                    ['ชื่อแขก', detailItem.guest_name],
                    ['เบอร์ติดต่อ', detailItem.guest_phone],
                  ]
            return (
              <div className="dashboard-rv">
                <div className={`dashboard-rv-detail-hero is-${detailItem.status}`}>
                  <span className={`dashboard-rv-history-icon is-${detailItem.request_type}`}>
                    {detailItem.request_type === 'vehicle' ? <CarIcon /> : <GuestIcon />}
                  </span>
                  <div className="dashboard-rv-history-text">
                    <strong>{getVisitTitle(detailItem)}</strong>
                    <span className="dashboard-rv-meta dashboard-safety-hero-meta">
                      <span className={`dashboard-rv-kind-chip is-${getVisitKind(detailItem)}`}>
                        {detailItem.request_type === 'vehicle' ? <CarIcon /> : <GuestIcon />}
                        {getVisitKindLabel(detailItem)}
                      </span>
                      {detailItem.room_number && <RoomChip room={detailItem.room_number} />}
                    </span>
                  </div>
                  <span className={`dashboard-badge status-${tenantRequestBadgeClass(detailItem.status)}`}>
                    {RESIDENT_VISIT_STATUS_LABEL[detailItem.status] || detailItem.status}
                  </span>
                </div>

                <dl className="dashboard-rv-detail">
                  {fields.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || '-'}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>เริ่ม</dt>
                    <dd>{formatVisitDateTime(detailItem.start_at)}</dd>
                  </div>
                  <div>
                    <dt>สิ้นสุด</dt>
                    <dd>{detailItem.end_at ? formatVisitDateTime(detailItem.end_at) : 'ไม่จำกัดเวลา'}</dd>
                  </div>
                  <div>
                    <dt>หมายเหตุ</dt>
                    <dd>{detailItem.note || '-'}</dd>
                  </div>
                </dl>

                {detailItem.vehicle_photos?.length > 0 && (
                  <section className="dashboard-rv-photos" aria-label="รูปรถและป้ายทะเบียน">
                    <h4 className="dashboard-rv-timeline-title">รูปรถ / ป้ายทะเบียน</h4>
                    <div className="dashboard-rv-photo-grid">
                      {detailItem.vehicle_photos.map((photo, index) => (
                        <button
                          key={photo.url}
                          type="button"
                          className="dashboard-rv-photo"
                          onClick={() => setLightbox({ photos: detailItem.vehicle_photos, index, plate: getVisitTitle(detailItem) })}
                          aria-label={`ดูรูปที่ ${index + 1}`}
                        >
                          <UploadImage src={photo.url} alt={photo.name || `รูปรถ ${index + 1}`} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <DetailTimeline
                  steps={[
                    { label: 'ส่งคำขอ', meta: formatVisitDateTime(detailItem.created_at), state: 'done' },
                    detailItem.status === 'pending' || reviewedAt
                      ? {
                          label:
                            detailItem.status === 'pending'
                              ? 'รอเจ้าหน้าที่อนุมัติ'
                              : detailItem.status === 'rejected'
                                ? 'ไม่อนุมัติ'
                                : 'อนุมัติแล้ว',
                          meta: detailItem.status === 'pending' ? 'กำลังรอ' : formatVisitDateTime(reviewedAt),
                          by: detailItem.status === 'pending' ? null : reviewer,
                          state: detailItem.status === 'pending' ? 'current' : 'done',
                          tone: detailItem.status === 'rejected' ? 'danger' : detailItem.status === 'pending' ? undefined : 'success',
                        }
                      : null,
                    detailItem.updated_at
                      ? { label: 'แก้ไขข้อมูล', meta: formatVisitDateTime(detailItem.updated_at), by: detailItem.updated_by_name, state: 'done' }
                      : null,
                    detailItem.status === 'cancelled'
                      ? {
                          label: 'ยกเลิกรายการ',
                          meta: detailItem.cancelled_at ? formatVisitDateTime(detailItem.cancelled_at) : '-',
                          by: detailItem.cancelled_by_name,
                          state: 'done',
                          tone: 'danger',
                        }
                      : null,
                  ].filter(Boolean)}
                />

                <div className="dashboard-form-actions">
                  <button type="button" className="dashboard-action-btn is-ghost" onClick={() => setView('history')}>
                    กลับไปที่ประวัติ
                  </button>
                  <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
                </div>
              </div>
            )
          }}
        </Modal>
      )}
    </div>
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
const SAFETY_SEVERITY_RESULT = {
  urgent: { label: 'ด่วน', hint: 'เจ้าหน้าที่จะได้รับแจ้งเป็นเรื่องเร่งด่วน' },
  normal: { label: 'ทั่วไป', hint: 'เจ้าหน้าที่จะตรวจสอบตามลำดับ' },
}
const SAFETY_STATUS_LABEL = { pending: 'รอตรวจสอบ', reviewed: 'ตรวจสอบแล้ว', cancelled: 'ยกเลิกแล้ว' }
const SAFETY_STATUS_BADGE = { pending: 'pending', reviewed: 'paid', cancelled: 'cancelled' }
const SAFETY_FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รอตรวจสอบ', tone: 'warning' },
  { key: 'reviewed', label: 'ตรวจสอบแล้ว', tone: 'success' },
  { key: 'cancelled', label: 'ยกเลิกแล้ว', tone: 'muted' },
]
const SAFETY_DESCRIPTION_MAX = 1000
const CUSTOMER_OPEN_REPORT_LIMIT = 10
const SAFETY_MAX_PHOTOS = 4
const EMPTY_SAFETY_FORM = { incidentType: 'security', description: '', photos: [] }

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function getRequestDetail(kind, request) {
  const fields = []
  let title = `รายละเอียดคำขอ${TENANT_REQUEST_TYPE_LABEL[kind] || ''}`
  let heading = TENANT_REQUEST_TYPE_LABEL[kind] || 'คำขอ'
  let icon = kind === 'renew' ? <CalendarIcon /> : <GuestIcon />
  let iconClass = ''
  let meta = null
  let statusLabel = TENANT_REQUEST_STATUS_LABEL[request.status]
  let badge = tenantRequestBadgeClass(request.status)
  let heroStatus = request.status === 'done' || request.status === 'reviewed' ? 'approved' : request.status
  let photos = []

  if (kind === 'safety') {
    title = 'รายละเอียดการแจ้งเหตุ'
    heading = SAFETY_INCIDENT_TYPE_LABEL[request.incident_type] || request.incident_type
    icon = <ShieldIcon />
    iconClass = `is-safety is-${request.severity}`
    statusLabel = SAFETY_STATUS_LABEL[request.status]
    badge = SAFETY_STATUS_BADGE[request.status] || 'pending'
    heroStatus = request.status === 'reviewed' ? 'approved' : request.status === 'cancelled' ? 'cancelled' : 'pending'
    const severity = SAFETY_SEVERITY_RESULT[request.severity]?.label || request.severity
    meta = (
      <span className={`dashboard-safety-level-chip is-${request.severity}`}>
        <span aria-hidden="true" />
        ระดับ{severity}
      </span>
    )
    fields.push(
      ['ประเภทเหตุ', heading],
      ['ระดับความรุนแรง', (
        <span className={`dashboard-safety-level-chip is-compact is-${request.severity}`}>
          <span aria-hidden="true" />
          {severity}
        </span>
      )],
      ['ห้อง', request.room_number],
      ['รายละเอียดเหตุการณ์', request.description],
      ['วันที่แจ้ง', formatVisitDateTime(request.created_at)],
    )
    if (request.status === 'reviewed') {
      fields.push(['ตรวจสอบโดย', request.reviewed_by_name], ['ผลการตรวจสอบ', request.review_note])
    }
    if (request.status === 'cancelled') {
      fields.push(['ยกเลิกโดย', request.cancelled_by_name], ['เหตุผลที่ยกเลิก', request.cancel_reason])
    }
    photos = request.photos || []
  } else if (kind === 'resident_visit') {
    title = 'รายละเอียดคำขอรถ / ผู้มาติดต่อ'
    heading = getVisitTitle(request)
    icon = request.request_type === 'vehicle' ? <CarIcon /> : <GuestIcon />
    iconClass = `is-${request.request_type}`
    statusLabel = RESIDENT_VISIT_STATUS_LABEL[request.status]
    meta = <span className={`dashboard-rv-kind-chip is-${getVisitKind(request)}`}>{getVisitKindLabel(request)}</span>
    if (request.request_type === 'vehicle') {
      fields.push(['รถของ', getVisitKindLabel(request)], ['ทะเบียนรถ', request.vehicle_plate], ['ยี่ห้อ / รุ่น', request.vehicle_model])
    }
    if (request.guest_name || request.request_type !== 'vehicle') {
      fields.push(['ผู้มาเยี่ยม', request.guest_name], ['เบอร์ติดต่อ', request.guest_phone])
    }
    fields.push(
      ['ห้อง', request.room_number],
      ['เริ่ม', formatVisitDateTime(request.start_at)],
      ['สิ้นสุด', request.end_at ? formatVisitDateTime(request.end_at) : 'ไม่จำกัดเวลา'],
      ['วันที่ส่งคำขอ', formatVisitDateTime(request.created_at)],
      ['หมายเหตุ', request.note],
    )
    photos = request.vehicle_photos || []
  } else if (kind === 'maintenance') {
    title = 'รายละเอียดการแจ้งซ่อม'
    heading = MAINTENANCE_CATEGORY_LABEL[request.category] || 'แจ้งซ่อม'
    icon = <MaintenanceCategoryIcon category={request.category} />
    statusLabel = MAINTENANCE_STATUS_LABEL[request.status]
    badge = maintenanceBadgeClass(request.status)
    fields.push(
      ['ประเภท', heading],
      ['ห้อง', request.room_number],
      ['ช่วงเวลาที่สะดวก', MAINTENANCE_TIME_LABEL[request.preferred_time] || 'เวลาไหนก็ได้'],
      ['เบอร์โทร', request.contact_phone],
      ['รายละเอียดปัญหา', request.description],
      ['วันที่แจ้งซ่อม', formatVisitDateTime(request.created_at)],
    )
    photos = request.photos || []
  } else {
    fields.push(['ประเภทคำขอ', heading], ['ห้อง', request.room_number])
    if (kind === 'renew') {
      fields.push(
        ['ระยะเวลาที่ขอต่อ', RENEW_DURATION_LABEL[request.renew_duration_months] || `${request.renew_duration_months} เดือน`],
        ['รูปแบบการชำระ', `จ่ายรายเดือน${request.source_room_price != null ? ` · ฿${formatCurrency(request.source_room_price)}/เดือน` : ''}`],
      )
      if (request.source_rental_end_date) {
        const waiting = ['pending', 'in_progress'].includes(request.status)
        fields.push([waiting ? 'สิ้นสุดสัญญาเดิม' : 'สิ้นสุดสัญญาปัจจุบัน', formatDate(request.source_rental_end_date)])
        if (waiting) {
          fields.push(['สิ้นสุดสัญญาใหม่ (หลังอนุมัติ)', formatDate(addContractMonths(request.source_rental_end_date, Number(request.renew_duration_months)))])
        }
      }
    }
    if (kind === 'move_room') {
      fields.push(['ห้องที่ย้ายไป', request.target_room_number])
      if (request.target_room_price != null) fields.push(['ค่าเช่าห้องใหม่', `฿${formatCurrency(request.target_room_price)}/เดือน`])
      fields.push(['เหตุผลที่ย้าย', MOVE_ROOM_REASON_LABEL[request.move_reason]], ['วันที่ต้องการย้าย', formatDateOnly(request.preferred_move_date)])
      if (['pending', 'in_progress'].includes(request.status)) {
        fields.push(['ตรวจสภาพห้องเดิม', request.room_inspected ? 'ตรวจเรียบร้อยแล้ว' : 'รอเจ้าหน้าที่ตรวจห้อง'])
      }
    }
    fields.push(
      ['วันที่ส่งคำขอ', formatVisitDateTime(request.created_at)],
      [kind === 'moveout' ? 'เหตุผล/รายละเอียดการย้ายออก' : 'หมายเหตุ', request.note],
    )
    if (kind === 'moveout' && request.preferred_move_date) fields.push(['วันที่ต้องการย้ายออก', formatDateOnly(request.preferred_move_date)])
    if (request.status === 'rejected' && request.reject_reason) fields.push(['เหตุผลที่ไม่อนุมัติ', request.reject_reason])
    if (request.status === 'cancelled' && request.reject_reason) fields.push(['เหตุผลที่ยกเลิก', request.reject_reason])
  }

  return { title, heading, icon, iconClass, meta, statusLabel, badge, heroStatus, fields, photos }
}

const DETAIL_LONG_FIELDS = new Set([
  'รายละเอียดเหตุการณ์',
  'รายละเอียดปัญหา',
  'หมายเหตุ',
  'ผลการตรวจสอบ',
  'เหตุผลที่ยกเลิก',
  'เหตุผล/รายละเอียดการย้ายออก',
  'เหตุผลกรณีพิเศษ',
])
const DETAIL_ACTOR_FIELDS = new Set(['ตรวจสอบโดย', 'ยกเลิกโดย'])

function RequestDetailModal({ kind, request, onClose, onBack, backLabel = 'กลับไปที่รายการ' }) {
  const [photoIndex, setPhotoIndex] = useState(null)
  const detail = getRequestDetail(kind, request)
  const timeline = getRequestTimeline(kind, request)
  const currentIndex = timeline.findIndex((step) => !step.done)
  const finalTone = ['rejected', 'cancelled'].includes(request.status) ? 'danger' : 'success'
  const steps = timeline.map((step, index) => ({
    label: kind === 'safety' && !step.done
      ? 'รอเจ้าหน้าที่ตรวจสอบ'
      : kind === 'resident_visit' && !step.done
        ? 'รอเจ้าหน้าที่อนุมัติ'
        : step.label,
    meta: step.done ? (step.date ? formatVisitDateTime(step.date) : '-') : index === currentIndex ? 'กำลังรอ' : '-',
    by: step.by,
    state: step.done ? 'done' : index === currentIndex ? 'current' : 'pending',
    tone: index === timeline.length - 1 && step.done ? finalTone : undefined,
  }))

  return (
    <>
      <Modal title={detail.title} onClose={onClose} onBack={onBack}>
        {(requestClose) => (
          <div className="dashboard-rv">
            <div className={`dashboard-rv-detail-hero is-${detail.heroStatus}${kind === 'safety' && request.severity ? ` is-severity-${request.severity}` : ''}`}>
              <span className={`dashboard-rv-history-icon ${detail.iconClass}`}>{detail.icon}</span>
              <div className="dashboard-rv-history-text">
                <strong>{detail.heading}</strong>
                <span className="dashboard-rv-meta dashboard-safety-hero-meta">
                  {detail.meta}
                  {request.room_number && <RoomChip room={request.room_number} />}
                </span>
              </div>
              <span className={`dashboard-badge status-${detail.badge}`}>{detail.statusLabel || request.status}</span>
            </div>

            <section className="dashboard-detail-section" aria-label="ข้อมูลคำขอ">
              <h4 className="dashboard-detail-section-title">ข้อมูลคำขอ</h4>
              <dl className="dashboard-detail-grid">
                {detail.fields
                  .filter(([label]) => !DETAIL_LONG_FIELDS.has(label))
                  .map(([label, value]) => (
                    <div key={label} className="dashboard-detail-field">
                      <dt>{label}</dt>
                      <dd className={DETAIL_ACTOR_FIELDS.has(label) && value ? 'dashboard-actor' : undefined}>{value || '-'}</dd>
                    </div>
                  ))}
              </dl>
              {detail.fields
                .filter(([label]) => DETAIL_LONG_FIELDS.has(label))
                .map(([label, value]) => (
                  <div key={label} className={`dashboard-detail-note${value ? '' : ' is-empty'}`}>
                    <span>{label}</span>
                    <p>{value || '-'}</p>
                  </div>
                ))}
            </section>

            {detail.photos.length > 0 && (
              <section className="dashboard-rv-photos dashboard-detail-section" aria-label="รูปประกอบคำขอ">
                <h4 className="dashboard-detail-section-title">รูปประกอบ · {detail.photos.length} รูป</h4>
                <div className="dashboard-rv-photo-grid">
                  {detail.photos.map((photo, index) => (
                    <button key={`${photo.url}-${index}`} type="button" className="dashboard-rv-photo" onClick={() => setPhotoIndex(index)} aria-label={`ดูรูปที่ ${index + 1}`}>
                      <UploadImage src={photo.url} alt={photo.name || `รูปที่ ${index + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <DetailTimeline steps={steps} />

            <div className="dashboard-form-actions">
              {onBack && <button type="button" className="dashboard-action-btn is-ghost" onClick={onBack}>{backLabel}</button>}
              <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>ปิด</button>
            </div>
          </div>
        )}
      </Modal>
      {photoIndex !== null && (
        <PhotoLightbox photos={detail.photos} initialIndex={photoIndex} title="รูปประกอบคำขอ" subtitle={detail.heading} label="รูปประกอบ" onClose={() => setPhotoIndex(null)} />
      )}
    </>
  )
}

function SafetyIncidentReportRow() {
  const [view, setView] = useState(null)
  const [form, setForm] = useState(EMPTY_SAFETY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentSeverity, setSentSeverity] = useState('')
  const [incidents, setIncidents] = useState([])
  const [historyFilter, setHistoryFilter] = useState('all')
  const [historySearch, setHistorySearch] = useState('')
  const [detailId, setDetailId] = useState(null)
  const token = sessionStorage.getItem('token')
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const load = useCallback(
    () =>
      axios
        .get('/api/customer/safety-incidents', { headers })
        .then(({ data }) => setIncidents(data.incidents || []))
        .catch((requestError) => setError(requestError.response?.data?.message || 'โหลดประวัติการแจ้งเหตุไม่สำเร็จ')),
    [headers],
  )

  useEffect(() => {
    load()
  }, [load])

  const openModal = () => {
    setView('form')
    setError('')
  }

  const openHistory = () => {
    setView('history')
    load()
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const photos = (await Promise.all(form.photos.map(compressImageFile))).map(({ name, dataUrl }) => ({ name, dataUrl }))
      const { data } = await axios.post(
        '/api/customer/safety-incidents',
        { incidentType: form.incidentType, description: form.description, photos },
        { headers },
      )
      setSentSeverity(data.severity || '')
      setForm(EMPTY_SAFETY_FORM)
      setView('success')
      load()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'ส่งรายงานไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const pendingCount = incidents.filter((item) => item.status === 'pending').length
  const historyKeyword = historySearch.trim().toLowerCase()
  const searchedIncidents = historyKeyword
    ? incidents.filter((item) =>
        [
          SAFETY_INCIDENT_TYPE_LABEL[item.incident_type] || item.incident_type,
          item.description,
          item.review_note,
          SAFETY_SEVERITY_RESULT[item.severity]?.label,
          SAFETY_STATUS_LABEL[item.status],
          formatVisitDateTime(item.created_at),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(historyKeyword),
      )
    : incidents
  const filteredIncidents =
    historyFilter === 'all' ? searchedIncidents : searchedIncidents.filter((item) => item.status === historyFilter)
  const detailItem = incidents.find((item) => item.id === detailId)
  const latestIncident = incidents[0]

  return (
    <div className={`dashboard-request-row${latestIncident ? ' has-detail-link' : ''}`}>
      <div className="dashboard-request-info">
        <p className="dashboard-request-title">รายงานเหตุฉุกเฉิน / ความปลอดภัย</p>
        <p className="dashboard-request-desc">
          {pendingCount > 0 ? (
            <>
              <span className="dashboard-request-desc-status">
                รอตรวจสอบ <strong>{pendingCount} รายการ</strong>
                <span className="dashboard-request-desc-limit">จากสูงสุด {CUSTOMER_OPEN_REPORT_LIMIT} รายการ</span>
              </span>
              {pendingCount >= CUSTOMER_OPEN_REPORT_LIMIT && (
                <small className="dashboard-request-desc-hint">รอเจ้าหน้าที่ตรวจสอบก่อนแจ้งเหตุเพิ่ม</small>
              )}
            </>
          ) : 'แจ้งเหตุให้เจ้าหน้าที่ตรวจสอบโดยเร็ว'}
        </p>
      </div>
      <button
        type="button"
        className="dashboard-action-btn is-danger"
        onClick={openModal}
        disabled={pendingCount >= CUSTOMER_OPEN_REPORT_LIMIT}
        title={pendingCount >= CUSTOMER_OPEN_REPORT_LIMIT ? `แจ้งได้สูงสุด ${CUSTOMER_OPEN_REPORT_LIMIT} รายการที่รอตรวจสอบ` : undefined}
      >
        แจ้งเหตุ
      </button>
      {latestIncident && (
        <RequestTimelineDropdown kind="safety" request={incidents.find((item) => item.status === 'pending') || latestIncident} />
      )}
      {latestIncident && (
        <button
          type="button"
          className="dashboard-maintenance-more"
          onClick={() => {
            const activeIncident = incidents.find((item) => item.status === 'pending')
            if (!activeIncident) {
              openHistory()
              return
            }
            setDetailId(activeIncident.id)
            setView('detail')
          }}
        >
          {incidents.some((item) => item.status === 'pending') ? 'ดูรายละเอียด' : 'ดูประวัติ'}
        </button>
      )}

      {view === 'form' && (
        <Modal title="รายงานเหตุฉุกเฉิน / ความปลอดภัย" onClose={() => setView(null)}>
          {(requestClose) => (
            <div className="dashboard-safety">
              <div className="dashboard-rv-top">
                <p className="dashboard-rv-intro">รายงานจะถูกส่งถึงเจ้าหน้าที่ทันที</p>
                <button type="button" className="dashboard-rv-history-link" onClick={openHistory}>
                  ประวัติการแจ้งเหตุ
                  {incidents.length > 0 && <span className="dashboard-rv-history-count">{incidents.length}</span>}
                  {pendingCount > 0 && <span className="dashboard-rv-history-pending">รอ {pendingCount}</span>}
                  <span aria-hidden="true">›</span>
                </button>
              </div>

              <div className="dashboard-safety-alert" role="note">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p>
                  หากมีอันตรายต่อชีวิต โทร <b>191</b> (ตำรวจ) <b>199</b> (ดับเพลิง) หรือ <b>1669</b> (การแพทย์ฉุกเฉิน) ทันที
                </p>
              </div>

              <form className="dashboard-inline-form dashboard-safety-form" onSubmit={submit}>
                <label id="safety-type-label">ประเภทเหตุ</label>
                <div className="dashboard-safety-types" role="radiogroup" aria-labelledby="safety-type-label">
                  {SAFETY_INCIDENT_TYPES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={form.incidentType === value}
                      className={`dashboard-safety-type${form.incidentType === value ? ' is-active' : ''}`}
                      onClick={() => setForm({ ...form, incidentType: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label htmlFor="safety-description">
                  รายละเอียดเหตุการณ์ <span className="dashboard-required">*</span>
                </label>
                <textarea
                  id="safety-description"
                  required
                  rows={4}
                  maxLength={SAFETY_DESCRIPTION_MAX}
                  value={form.description}
                  onChange={(event) => {
                    setForm({ ...form, description: event.target.value })
                    if (error) setError('')
                  }}
                  placeholder="ระบุสถานที่ เวลา และสิ่งที่เกิดขึ้น"
                />
                <div className="dashboard-safety-foot">
                  <span className="dashboard-safety-auto">ระบบจะประเมินระดับความเร่งด่วนจากประเภทและรายละเอียดให้อัตโนมัติ</span>
                  <span className="dashboard-safety-counter">
                    {form.description.length}/{SAFETY_DESCRIPTION_MAX}
                  </span>
                </div>

                <label htmlFor="safety-photos">
                  รูปประกอบ <span className="dashboard-safety-optional">(ไม่บังคับ)</span>
                </label>
                <MaintenancePhotoPicker
                  id="safety-photos"
                  files={form.photos}
                  max={SAFETY_MAX_PHOTOS}
                  onChange={(photos) => setForm((current) => ({ ...current, photos }))}
                  onError={setError}
                />

                {error && <p className="dashboard-form-error">{error}</p>}
                <div className="dashboard-form-actions">
                  <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                    ยกเลิก
                  </button>
                  <button type="submit" className="dashboard-action-btn is-danger" disabled={busy || !form.description.trim()}>
                    {busy ? 'กำลังส่ง...' : 'ส่งรายงาน'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </Modal>
      )}

      {view === 'success' && (
        <Modal title="ส่งรายงานแล้ว" onClose={() => setView(null)} variant="success">
          {(requestClose) => (
            <div className="dashboard-confirm-body">
              <div className="dashboard-confirm-icon is-success">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="dashboard-confirm-message">ส่งรายงานเหตุให้เจ้าหน้าที่แล้ว</p>
              {SAFETY_SEVERITY_RESULT[sentSeverity] && (
                <div className={`dashboard-safety-result is-${sentSeverity}`}>
                  <div className="dashboard-safety-result-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {sentSeverity === 'urgent' ? (
                        <>
                          <path d="M10.3 4.5 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" />
                          <path d="M12 9v4M12 17h.01" />
                        </>
                      ) : (
                        <>
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 11v6M12 7h.01" />
                        </>
                      )}
                    </svg>
                  </div>
                  <div className="dashboard-safety-result-content">
                    <div className="dashboard-safety-result-heading">
                      <span>ระบบจัดระดับเป็น</span>
                      <strong>{SAFETY_SEVERITY_RESULT[sentSeverity].label}</strong>
                    </div>
                    <small>{SAFETY_SEVERITY_RESULT[sentSeverity].hint}</small>
                  </div>
                </div>
              )}
              <div className="dashboard-form-actions">
                <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                  ปิด
                </button>
                <button type="button" className="dashboard-action-btn is-primary" onClick={openHistory}>
                  ดูประวัติการแจ้งเหตุ
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {view === 'history' && (
        <Modal title="ประวัติการแจ้งเหตุ" onClose={() => setView(null)} onBack={() => setView('form')}>
          {(requestClose) => (
            <div className="dashboard-rv">
              <DashboardFilterPanel
                segments={SAFETY_FILTERS.map((filter) => ({
                  ...filter,
                  count:
                    filter.key === 'all'
                      ? searchedIncidents.length
                      : searchedIncidents.filter((item) => item.status === filter.key).length,
                }))}
                active={historyFilter}
                onSegment={setHistoryFilter}
                search={historySearch}
                onSearch={setHistorySearch}
                searchPlaceholder="ค้นหาประเภทเหตุ รายละเอียด หรือผลการตรวจสอบ"
                resultText={`พบ ${filteredIncidents.length} จาก ${incidents.length} รายการ`}
                canClear={historyFilter !== 'all' || Boolean(historySearch.trim())}
                onClear={() => {
                  setHistoryFilter('all')
                  setHistorySearch('')
                }}
              />
              <section className="dashboard-rv-history" aria-label="รายการแจ้งเหตุ">
                {filteredIncidents.length === 0 ? (
                  <div className="dashboard-rv-history-empty">
                    <span className="dashboard-rv-history-empty-icon" aria-hidden="true">
                      <ShieldIcon />
                    </span>
                    <strong>{incidents.length === 0 ? 'ยังไม่มีการแจ้งเหตุ' : 'ไม่พบรายการที่ตรงกับการค้นหา'}</strong>
                    <small>{incidents.length === 0 ? 'แจ้งเหตุได้จากปุ่มด้านล่าง' : 'ลองเปลี่ยนคำค้นหาหรือสถานะ'}</small>
                  </div>
                ) : (
                  <ul className="dashboard-rv-history-list">
                    {filteredIncidents.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="dashboard-rv-history-item"
                          onClick={() => {
                            setDetailId(item.id)
                            setView('detail')
                          }}
                        >
                          <span className={`dashboard-rv-history-icon is-safety is-${item.severity}`}>
                            <ShieldIcon />
                          </span>
                          <span className="dashboard-rv-history-text">
                            <strong>{SAFETY_INCIDENT_TYPE_LABEL[item.incident_type] || item.incident_type}</strong>
                            <span className="dashboard-rv-meta">
                              <span className={`dashboard-safety-level-chip is-compact is-${item.severity}`}>
                                <span aria-hidden="true" />
                                {SAFETY_SEVERITY_RESULT[item.severity]?.label || item.severity}
                              </span>
                              <span className="dashboard-rv-range">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <circle cx="12" cy="12" r="9" />
                                  <polyline points="12 7 12 12 15 14" />
                                </svg>
                                <span className="dashboard-rv-range-point">
                                  <b>{formatVisitPoint(item.created_at).day}</b>
                                  {formatVisitPoint(item.created_at).time}
                                </span>
                              </span>
                            </span>
                            <span className="dashboard-rv-meta-desc">
                              <span className="dashboard-rv-meta-label">รายละเอียดเหตุการณ์</span>
                              <span className="dashboard-rv-meta-text">{item.description}</span>
                            </span>
                            {item.photos?.length > 0 && (
                              <span className="dashboard-safety-photo-chip">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="3" y="3" width="18" height="18" rx="2" />
                                  <circle cx="8.5" cy="8.5" r="1.5" />
                                  <path d="m21 15-5-5L5 21" />
                                </svg>
                                {item.photos.length} รูป
                              </span>
                            )}
                          </span>
                          <span className={`dashboard-badge status-${SAFETY_STATUS_BADGE[item.status] || 'pending'}`}>
                            {SAFETY_STATUS_LABEL[item.status] || item.status}
                          </span>
                          <span className="dashboard-rv-history-chevron" aria-hidden="true">›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <div className="dashboard-form-actions">
                <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                  ปิด
                </button>
                <button type="button" className="dashboard-action-btn is-danger" onClick={() => setView('form')}>
                  แจ้งเหตุใหม่
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {view === 'detail' && detailItem && (
        <RequestDetailModal
          kind="safety"
          request={detailItem}
          onClose={() => setView(null)}
          onBack={() => setView('history')}
          backLabel="กลับไปที่ประวัติ"
        />
      )}
    </div>
  )
}

const PARKING_PAGE_SIZE = 6

function getParkingPhase(vehicle, now) {
  const start = new Date(vehicle.start_at).getTime()
  if (now < start) return { key: 'upcoming', label: 'รอเข้าจอด' }
  return { key: 'parked', label: 'กำลังจอด' }
}

function CustomerParkingTab({ onCountChange }) {
  const [rawVehicles, setVehicles] = useState([])
  const [roomNumber, setRoomNumber] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [detail, setDetail] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    axios
      .get('/api/customer/parked-vehicles', { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
      .then(({ data }) => {
        if (cancelled) return
        setVehicles(data.vehicles || [])
        setRoomNumber(data.roomNumber)
        onCountChange?.((data.vehicles || []).length)
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.response?.data?.message || 'โหลดข้อมูลรถไม่สำเร็จ')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [onCountChange])

  const vehicles = rawVehicles.filter((vehicle) => !vehicle.end_at || new Date(vehicle.end_at).getTime() > now)
  const parkedVehicles = vehicles.filter((vehicle) => getParkingPhase(vehicle, now).key === 'parked')
  const parkedCount = parkedVehicles.length
  const keyword = search.trim().toLowerCase()
  const searched = keyword
    ? vehicles.filter((vehicle) =>
        [
          vehicle.vehicle_plate,
          vehicle.vehicle_model,
          vehicle.guest_name,
          vehicle.guest_phone,
          vehicle.note,
          vehicle.guest_name ? 'รถครอบครัวที่มาเยี่ยม' : 'รถของฉัน',
          vehicle.admin_reviewed_by_name || vehicle.reviewed_by_name,
          formatVisitRange(vehicle.start_at, vehicle.end_at),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      )
    : vehicles
  const filtered = filter === 'all' ? searched : searched.filter((vehicle) => getParkingPhase(vehicle, now).key === filter)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PARKING_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageVehicles = filtered.slice((currentPage - 1) * PARKING_PAGE_SIZE, currentPage * PARKING_PAGE_SIZE)

  return (
    <section className="dashboard-card dashboard-park-card" aria-labelledby="customer-parking-title">
      <div className="dashboard-card-header">
        <div>
          <h2 id="customer-parking-title">รถของฉัน</h2>
          <p className="dashboard-park-subtitle">รถที่ได้รับอนุมัติให้จอดของห้องคุณ</p>
        </div>
        <span className="dashboard-park-header-chips">
          <span className="dashboard-park-count-chip">
            <span aria-hidden="true" />
            กำลังจอด <strong>{parkedCount}</strong> คัน
          </span>
          {roomNumber && <RoomChip room={roomNumber} />}
        </span>
      </div>

      {loading ? (
        <p className="dashboard-empty">กำลังโหลดข้อมูลรถ...</p>
      ) : error ? (
        <p className="dashboard-empty">{error}</p>
      ) : vehicles.length === 0 ? (
        <div className="dashboard-park-empty">
          <span className="dashboard-rv-history-empty-icon" aria-hidden="true">
            <CarIcon />
          </span>
          <strong>ยังไม่มีรถที่ได้รับอนุมัติให้จอด</strong>
          <small>ลงทะเบียนรถได้ที่การ์ด "แจ้งปัญหาต่างๆ" ในหน้าแรก เมื่อเจ้าหน้าที่อนุมัติแล้วจะแสดงที่นี่</small>
        </div>
      ) : (
        <>
          <DashboardFilterPanel
            segments={[
              { key: 'all', label: 'ทั้งหมด', count: searched.length },
              { key: 'parked', label: 'กำลังจอด', count: searched.filter((vehicle) => getParkingPhase(vehicle, now).key === 'parked').length, tone: 'success' },
              { key: 'upcoming', label: 'รอเข้าจอด', count: searched.filter((vehicle) => getParkingPhase(vehicle, now).key === 'upcoming').length, tone: 'warning' },
            ]}
            active={filter}
            onSegment={(key) => {
              setFilter(key)
              setPage(1)
            }}
            search={search}
            onSearch={(value) => {
              setSearch(value)
              setPage(1)
            }}
            searchPlaceholder="ค้นหาทะเบียนรถ รุ่น ชื่อผู้มาเยี่ยม หรือหมายเหตุ"
            resultText={`พบ ${filtered.length} จาก ${vehicles.length} คัน`}
            canClear={filter !== 'all' || Boolean(keyword)}
            onClear={() => {
              setFilter('all')
              setSearch('')
              setPage(1)
            }}
          />
          {filtered.length === 0 ? (
            <div className="dashboard-park-empty">
              <span className="dashboard-rv-history-empty-icon" aria-hidden="true">
                <CarIcon />
              </span>
              <strong>ไม่พบรถที่ตรงกับการค้นหา</strong>
              <small>ลองเปลี่ยนคำค้นหาหรือสถานะ</small>
            </div>
          ) : (
        <ul className="dashboard-park-list">
          {pageVehicles.map((vehicle) => {
            const phase = getParkingPhase(vehicle, now)
            const approver = vehicle.admin_reviewed_by_name || vehicle.reviewed_by_name
            return (
              <li key={vehicle.id} className={`dashboard-park-item is-${phase.key}`}>
                <button
                  type="button"
                  className="dashboard-park-item-main"
                  onClick={() => setDetail(vehicle)}
                  aria-label={`ดูรายละเอียดรถทะเบียน ${vehicle.vehicle_plate}`}
                >
                  <span className="dashboard-park-item-head">
                    <span className="dashboard-park-item-icon">
                      <CarIcon />
                    </span>
                    <span className="dashboard-park-item-title">
                      <strong>{vehicle.vehicle_plate}</strong>
                      {vehicle.vehicle_model && <em className="dashboard-park-model">{vehicle.vehicle_model}</em>}
                    </span>
                    <span className={`dashboard-park-status is-${phase.key}`}>
                      <span aria-hidden="true" />
                      {phase.label}
                    </span>
                  </span>
                  <span className="dashboard-park-grid">
                    <span className="dashboard-park-cell">
                      <span className="dashboard-park-label">ประเภท</span>
                      <span className="dashboard-park-value">{vehicle.guest_name ? 'รถครอบครัว' : 'รถของฉัน'}</span>
                    </span>
                    <span className="dashboard-park-cell">
                      <span className="dashboard-park-label">ห้อง</span>
                      <span className="dashboard-park-value">{vehicle.room_number || roomNumber ? `ห้อง ${vehicle.room_number || roomNumber}` : 'ไม่ระบุ'}</span>
                    </span>
                    <span className="dashboard-park-cell">
                      <span className="dashboard-park-label">{vehicle.guest_name ? 'ผู้มาเยี่ยม' : 'เจ้าของรถ'}</span>
                      <span className="dashboard-park-value" title={vehicle.guest_name ? `${vehicle.guest_name}${vehicle.guest_phone ? ` · ${vehicle.guest_phone}` : ''}` : ''}>
                        {vehicle.guest_name || 'ฉัน'}
                      </span>
                    </span>
                  </span>
                  <span className="dashboard-park-range">
                    <span className="dashboard-park-range-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </span>
                    <span className="dashboard-park-range-body">
                      <span className="dashboard-park-label">ช่วงเวลาจอด</span>
                      <span className="dashboard-park-value">
                        {formatVisitPoint(vehicle.start_at).day} {formatVisitPoint(vehicle.start_at).time}
                        <span className="dashboard-park-arrow" aria-hidden="true">→</span>
                        <span className={vehicle.end_at ? undefined : 'dashboard-park-open'}>
                          {vehicle.end_at ? `${formatVisitPoint(vehicle.end_at).day} ${formatVisitPoint(vehicle.end_at).time}` : 'ไม่จำกัดเวลา'}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
                <div className="dashboard-park-photos">
                  <span className="dashboard-park-photos-label">
                    {vehicle.vehicle_photos?.length ? `รูปรถ · ${vehicle.vehicle_photos.length} รูป` : 'รูปรถ'}
                  </span>
                  {vehicle.vehicle_photos?.length > 0 ? (
                    <span className="dashboard-park-photo-row">
                      {vehicle.vehicle_photos.slice(0, 4).map((photo, index) => (
                        <button
                          key={`${photo.url}-${index}`}
                          type="button"
                          className="dashboard-park-photo"
                          onClick={() => setLightbox({ photos: vehicle.vehicle_photos, index, plate: vehicle.vehicle_plate })}
                          aria-label={`ดูรูปที่ ${index + 1}`}
                        >
                          <UploadImage src={photo.url} alt={photo.name || `รูปรถ ${index + 1}`} loading="lazy" />
                          {index === 3 && vehicle.vehicle_photos.length > 4 && <span>+{vehicle.vehicle_photos.length - 4}</span>}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="dashboard-park-photo-empty">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      ไม่มีรูปรถ
                    </span>
                  )}
                </div>
                <div className="dashboard-park-item-foot">
                  <span className="dashboard-park-result">
                    อนุมัติโดย <span className="dashboard-actor">{approver || '-'}</span>
                  </span>
                  <button type="button" className="dashboard-park-more" onClick={() => setDetail(vehicle)}>
                    ดูรายละเอียด
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
          )}
          {totalPages > 1 && (
            <div className="dashboard-maintenance-pagination dashboard-park-pagination">
              <button
                type="button"
                className="dashboard-notif-page-btn"
                disabled={currentPage <= 1}
                onClick={() => setPage(Math.max(1, currentPage - 1))}
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
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              >
                ถัดไป
              </button>
            </div>
          )}
        </>
      )}

      {detail && (
        <Modal title="รายละเอียดรถ" onClose={() => setDetail(null)}>
          {(requestClose) => {
            const phase = getParkingPhase(detail, now)
            const approver = detail.admin_reviewed_by_name || detail.reviewed_by_name
            const approvedAt = detail.admin_reviewed_at || detail.reviewed_at
            const fields = [
              ['ทะเบียนรถ', detail.vehicle_plate],
              ['ยี่ห้อ / รุ่น', detail.vehicle_model],
              ...(detail.guest_name
                ? [
                    ['ผู้มาเยี่ยม', detail.guest_name],
                    ['เบอร์ผู้มาเยี่ยม', detail.guest_phone],
                  ]
                : []),
              ['เริ่มจอด', formatVisitDateTime(detail.start_at)],
              ['สิ้นสุด', detail.end_at ? formatVisitDateTime(detail.end_at) : 'ไม่จำกัดเวลา'],
            ]
            return (
              <div className="dashboard-rv">
                <div className={`dashboard-rv-detail-hero is-${phase.key === 'parked' ? 'approved' : 'pending'}`}>
                  <span className={`dashboard-rv-history-icon${detail.guest_name ? ' is-family' : ''}`}>
                    <CarIcon />
                  </span>
                  <div className="dashboard-rv-history-text">
                    <strong>{detail.vehicle_plate}</strong>
                    <span className="dashboard-rv-meta dashboard-safety-hero-meta">
                      <span className={`dashboard-rv-kind-chip is-${detail.guest_name ? 'family' : 'self'}`}>
                        <CarIcon />
                        {detail.guest_name ? 'รถครอบครัวที่มาเยี่ยม' : 'รถของฉัน'}
                      </span>
                      {detail.room_number && <RoomChip room={detail.room_number} />}
                    </span>
                  </div>
                  <span className={`dashboard-park-status is-${phase.key}`}>
                    <span aria-hidden="true" />
                    {phase.label}
                  </span>
                </div>

                <dl className="dashboard-rv-detail">
                  {fields.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || '-'}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>หมายเหตุ</dt>
                    <dd>{detail.note || '-'}</dd>
                  </div>
                </dl>

                {detail.vehicle_photos?.length > 0 && (
                  <section className="dashboard-rv-photos" aria-label="รูปรถและป้ายทะเบียน">
                    <h4 className="dashboard-rv-timeline-title">รูปรถ / ป้ายทะเบียน</h4>
                    <div className="dashboard-rv-photo-grid">
                      {detail.vehicle_photos.map((photo, index) => (
                        <button
                          key={photo.url}
                          type="button"
                          className="dashboard-rv-photo"
                          onClick={() => setLightbox({ photos: detail.vehicle_photos, index, plate: detail.vehicle_plate })}
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
                  actorClassName="dashboard-actor"
                  startDate={detail.created_at}
                  endDate={approvedAt}
                  waitingText="รอพิจารณา"
                  steps={[
                    { key: 'request', label: 'ส่งคำขอ', date: detail.created_at, icon: 'note' },
                    { key: 'review', label: 'อนุมัติแล้ว', by: approver, date: approvedAt, icon: 'check' },
                    ...(detail.updated_at
                      ? [{ key: 'edit', label: 'แก้ไขข้อมูล', by: detail.updated_by_name, date: detail.updated_at, icon: 'edit' }]
                      : []),
                    phase.key === 'parked'
                      ? { key: 'park', label: 'กำลังจอด', date: detail.start_at, icon: 'check' }
                      : { key: 'park', label: 'รอเข้าจอด', date: null, pendingText: `เริ่ม ${formatVisitDateTime(detail.start_at)}` },
                    {
                      key: 'end',
                      label: 'หมดเวลาจอด',
                      date: null,
                      pendingText: detail.end_at ? `สิ้นสุด ${formatVisitDateTime(detail.end_at)}` : 'ไม่จำกัดเวลา',
                    },
                  ]}
                />

                <div className="dashboard-form-actions">
                  <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                    ปิด
                  </button>
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
          title={`ทะเบียน ${lightbox.plate}`}
          label="รูปรถ / ป้ายทะเบียน"
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  )
}

function AnnouncementAlertPopup({ announcement, remaining, onAcknowledge }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const photos = announcement.photos ?? []

  const acknowledge = async () => {
    setBusy(true)
    setError('')
    try {
      await onAcknowledge(announcement.id)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'ปิดประกาศไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="dashboard-alert-overlay" role="presentation">
        <section
          className="dashboard-alert"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="dashboard-alert-title"
          aria-describedby="dashboard-alert-message"
        >
          <header className="dashboard-alert-hero">
            <span className="dashboard-alert-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </span>
            <div className="dashboard-alert-hero-text">
              <span className="dashboard-alert-eyebrow-row">
                <span className="dashboard-alert-eyebrow">ประกาศแจ้งเตือนจากหอพัก</span>
                {remaining > 1 && <span className="dashboard-alert-count">อีก {remaining - 1} ประกาศ</span>}
              </span>
              <h3 id="dashboard-alert-title">{announcement.title}</h3>
            </div>
          </header>
          <div className="dashboard-alert-body">
            <section className="dashboard-alert-note">
              <span className="dashboard-alert-label">รายละเอียดประกาศ</span>
              <p id="dashboard-alert-message" className="dashboard-alert-message">
                {announcement.message}
              </p>
            </section>
            {photos.length > 0 && (
              <section className="dashboard-alert-gallery">
                <span className="dashboard-alert-label">
                  รูปประกอบ
                  <em>{photos.length} รูป</em>
                </span>
                <div className="dashboard-alert-photos">
                  {photos.map((photo, index) => (
                    <button
                      key={photo.url}
                      type="button"
                      className="dashboard-alert-photo"
                      onClick={() => setLightboxIndex(index)}
                      aria-label={`ดูรูปที่ ${index + 1}`}
                    >
                      <UploadImage src={photo.url} alt={photo.name || `รูปประกาศ ${index + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div className="dashboard-alert-meta">
              <div className="dashboard-alert-meta-item">
                <span className="dashboard-alert-meta-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21a8 8 0 0 1 16 0" />
                  </svg>
                </span>
                <span className="dashboard-alert-meta-text">
                  <small>ประกาศโดย</small>
                  <strong className="dashboard-actor">{announcement.author || 'เจ้าหน้าที่'}</strong>
                </span>
              </div>
              <div className="dashboard-alert-meta-item">
                <span className="dashboard-alert-meta-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 14" />
                  </svg>
                </span>
                <span className="dashboard-alert-meta-text">
                  <small>วันเวลาที่ประกาศ</small>
                  <strong>{formatDateTime(announcement.created_at)} น.</strong>
                </span>
              </div>
            </div>
            {error && (
              <p className="dashboard-alert-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className="dashboard-alert-actions">
            <p className="dashboard-alert-hint">
              {announcement.popup_until
                ? `ประกาศนี้จะแสดงทุกครั้งที่เข้าสู่ระบบ จนกว่าจะกดรับทราบ หรือถึง ${formatDateTime(announcement.popup_until)} น.`
                : 'ประกาศนี้จะแสดงทุกครั้งที่เข้าสู่ระบบ จนกว่าจะกดรับทราบ'}
            </p>
            <button type="button" className="dashboard-alert-confirm" disabled={busy} onClick={acknowledge}>
              {busy ? 'กำลังบันทึก...' : 'รับทราบและปิด'}
            </button>
          </footer>
        </section>
      </div>
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos.map((photo, index) => ({ name: photo.name || `รูปที่ ${index + 1}`, url: photo.url }))}
          initialIndex={lightboxIndex}
          title={announcement.title}
          label="รูปประกาศ"
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}

function CustomerDashbord() {
  const navigate = useNavigate()
  const dashboardLoadRef = useRef(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acknowledgedAnnouncementIds, setAcknowledgedAnnouncementIds] = useState(() => new Set())

  const acknowledgeAnnouncement = async (announcementId) => {
    const token = sessionStorage.getItem('token')
    try {
      await axios.post(`/api/customer/announcements/${announcementId}/acknowledge`, null, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (requestError) {
      if (requestError.response?.status !== 404) throw requestError
    }
    setAcknowledgedAnnouncementIds((ids) => new Set(ids).add(announcementId))
  }

  const [dormInfoAcknowledged, setDormInfoAcknowledged] = useState(false)
  const acknowledgeDormInfo = async () => {
    await axios.post('/api/customer/dorm-info/acknowledge', null, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
    })
    setDormInfoAcknowledged(true)
  }

  const [, tickCountdown] = useState(0)
  const [popupNow, setPopupNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => {
      tickCountdown((tick) => tick + 1)
      setPopupNow(Date.now())
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const [customerTab, setCustomerTab] = useState('home')
  const [mobileTabMenuOpen, setMobileTabMenuOpen] = useState(false)
  const [activeVehicleIds, setActiveVehicleIds] = useState([])
  const [tabSeenVersion, setTabSeenVersion] = useState(0)
  const tabSeenStorageKey = data?.customer?.id ? `customer_tab_seen_${data.customer.id}` : null
  const seenTabKeys = useMemo(() => {
    if (!tabSeenStorageKey || tabSeenVersion < 0) return new Set()
    try {
      const stored = JSON.parse(localStorage.getItem(tabSeenStorageKey) || '[]')
      return new Set(Array.isArray(stored) ? stored : [])
    } catch {
      return new Set()
    }
  }, [tabSeenStorageKey, tabSeenVersion])
  const customerTabKeys = {
    vehicles: activeVehicleIds.map((id) => `vehicle-${id}`),
    parcels: (data?.parcels || []).filter((parcel) => parcel.status === 'pending').map((parcel) => `parcel-${parcel.id}`),
  }
  const newCustomerTabCount = (key) =>
    customerTab === key ? 0 : (customerTabKeys[key] || []).filter((itemKey) => !seenTabKeys.has(itemKey)).length

  const [expiredVehicles, setExpiredVehicles] = useState([])
  useEffect(() => {
    let cancelled = false
    const loadParking = () =>
      axios
        .get('/api/customer/parked-vehicles', { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
        .then(({ data }) => {
          if (cancelled) return
          setActiveVehicleIds((data.vehicles || []).map((vehicle) => vehicle.id))
          const unseen = (data.expired || []).filter((vehicle) => !localStorage.getItem(`parking_expired_seen_${vehicle.id}`))
          if (unseen.length > 0) {
            setExpiredVehicles((current) => [...current, ...unseen.filter((vehicle) => !current.some((item) => item.id === vehicle.id))])
          }
        })
        .catch(() => {})
    loadParking()
    const timer = setInterval(loadParking, 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])
  const closeExpiredVehicles = () => {
    expiredVehicles.forEach((vehicle) => localStorage.setItem(`parking_expired_seen_${vehicle.id}`, '1'))
    setExpiredVehicles([])
  }
  const [announcementFocus, setAnnouncementFocus] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifClosing, setNotifClosing] = useState(false)
  const [notifSeenVersion, setNotifSeenVersion] = useState(0)
  const [freshNotifKeys, setFreshNotifKeys] = useState(() => new Set())
  const notifSeenStorageKey = data?.customer?.id ? `notif_seen_keys_${data.customer.id}` : null
  const seenNotifKeys = useMemo(() => {
    if (!notifSeenStorageKey || notifSeenVersion < 0) return new Set()
    try {
      const stored = JSON.parse(localStorage.getItem(notifSeenStorageKey) || '[]')
      return new Set(Array.isArray(stored) ? stored : [])
    } catch {
      return new Set()
    }
  }, [notifSeenStorageKey, notifSeenVersion])
  const [notifPage, setNotifPage] = useState(1)
  const scrollFocusRef = useRef(null)
  useEffect(() => {
    if (!scrollFocusRef.current) return
    const element = document.querySelector(`[data-customer-focus="${scrollFocusRef.current}"]`)
    if (!element) return
    scrollFocusRef.current = null
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flashHighlight(element, 'dashboard-focus-highlight')
  })
  const notifListRef = useRef(null)
  const [notifDetail, setNotifDetail] = useState(null)
  const [parcelReceiveId, setParcelReceiveId] = useState(null)
  const [parcelReceiveConfirm, setParcelReceiveConfirm] = useState(null)
  const [parcelReceiveError, setParcelReceiveError] = useState('')
  const [parcelReceiveErrorId, setParcelReceiveErrorId] = useState(null)
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
  const [blockedRequestPopup, setBlockedRequestPopup] = useState(null)
  const [profileForm, setProfileForm] = useState({ phone: '', current_password: '', new_password: '', confirm_password: '' })
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentSlip, setPaymentSlip] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('promptpay')
  const [paymentChannels, setPaymentChannels] = useState(null)
  const [paymentCopied, setPaymentCopied] = useState(false)
  const [showDueBreakdown, setShowDueBreakdown] = useState(true)

  const [activeRequestType, setActiveRequestType] = useState(null)
  const [requestNote, setRequestNote] = useState('')
  const [renewDurationMonths, setRenewDurationMonths] = useState(RENEW_DURATION_OPTIONS[2].value)
  const [targetRoomNumber, setTargetRoomNumber] = useState('')
  const [moveReason, setMoveReason] = useState('')
  const [preferredMoveDate, setPreferredMoveDate] = useState('')
  const [moveDateRange, setMoveDateRange] = useState({ min: null, max: null })
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')

  const [statusPopup, setStatusPopup] = useState(null)
  const [moveRoomReminder, setMoveRoomReminder] = useState(null)
  const [maintenanceDetail, setMaintenanceDetail] = useState(null)
  const [maintenancePhotoPreview, setMaintenancePhotoPreview] = useState(null)

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
  const [expandedHomePayments, setExpandedHomePayments] = useState(() => new Set())
  const homePaymentRowsRef = useRef(new Map())
  const homePaymentHeightsRef = useRef(new Map())
  const homePaymentAnimationsRef = useRef(new Map())
  const [historyBookingId, setHistoryBookingId] = useState(null)
  const [slipPreview, setSlipPreview] = useState(null)

  const [receiptRequest, setReceiptRequest] = useState(null)
  const [receiptGenerating, setReceiptGenerating] = useState(false)
  const receiptRef = useRef(null)
  const moveRoomReminderRef = useRef(null)

  useLayoutEffect(() => {
    for (const [key, previousHeight] of homePaymentHeightsRef.current) {
      const row = homePaymentRowsRef.current.get(key)
      if (!row) continue
      const nextHeight = row.getBoundingClientRect().height
      if (Math.abs(nextHeight - previousHeight) < 1) continue
      row.style.overflow = 'hidden'
      const animation = row.animate(
        [{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }],
        { duration: 100, easing: 'ease-out' },
      )
      homePaymentAnimationsRef.current.set(key, animation)
      const clearAnimation = () => {
        if (homePaymentAnimationsRef.current.get(key) !== animation) return
        row.style.overflow = ''
        homePaymentAnimationsRef.current.delete(key)
      }
      animation.onfinish = clearAnimation
      animation.oncancel = clearAnimation
    }
    homePaymentHeightsRef.current.clear()
  }, [expandedHomePayments])

  useEffect(() => () => {
    for (const animation of homePaymentAnimationsRef.current.values()) animation.cancel()
  }, [])

  useEffect(() => {
    const isAnyOverlayOpen =
      showPaymentForm ||
      Boolean(activeRequestType) ||
      Boolean(statusPopup) ||
      Boolean(moveRoomReminder) ||
      Boolean(successPopup) ||
      Boolean(blockedRequestPopup) ||
      expiredVehicles.length > 0 ||
      showMaintenanceForm ||
      confirmCancelId !== null ||
      Boolean(parcelReceiveConfirm) ||
      notifOpen ||
      Boolean(notifDetail) ||
      Boolean(maintenanceDetail) ||
      Boolean(slipPreview)

    if (!isAnyOverlayOpen) return
    return lockBodyScroll()
  }, [
    showPaymentForm,
    activeRequestType,
    statusPopup,
    moveRoomReminder,
    successPopup,
    blockedRequestPopup,
    expiredVehicles,
    showMaintenanceForm,
    confirmCancelId,
    parcelReceiveConfirm,
    notifOpen,
    notifDetail,
    maintenanceDetail,
    slipPreview,
  ])

  const remindMoveRoomContact = (dashboardData, onlyOnChange) => {
    const request = dashboardData?.tenantRequests?.find((item) => item.type === 'move_room')
    const activeId = request?.status === 'in_progress' ? request.id : null
    const changed = activeId !== moveRoomReminderRef.current
    moveRoomReminderRef.current = activeId
    if (activeId === null || (onlyOnChange && !changed)) return false
    setMoveRoomReminder((current) => current ?? request)
    return true
  }

  const noticeMoveRoomTaken = (dashboardData) => {
    const request = dashboardData?.tenantRequests?.find((item) => item.type === 'move_room')
    if (!isMoveRoomTakenCancellation(request)) return false
    const seenKey = `move_room_taken_notice_seen_${request.id}`
    if (localStorage.getItem(seenKey)) return false
    localStorage.setItem(seenKey, '1')
    setMoveRoomReminder(null)
    setStatusPopup({ kind: 'move_room', status: request.status, request })
    return true
  }

  const maybeShowStatusPopups = (dashboardData) => {
    const tryShowStatusPopup = (kind, status, id, request, open = () => setStatusPopup({ kind, status, request })) => {
      if (!STATUS_POPUP_CONTENT_BY_KIND[kind]?.[status]) return false

      if (status === 'pending') return false
      if (status === 'in_progress') {
        open()
        return true
      }
      const seenKey = `${kind}_${status}_notice_seen_${id}`
      if (localStorage.getItem(seenKey)) return false
      localStorage.setItem(seenKey, '1')
      open()
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
    if (latestMaintenance) {
      tryShowStatusPopup('maintenance', latestMaintenance.status, latestMaintenance.id, latestMaintenance, () =>
        setMaintenanceDetail(latestMaintenance),
      )
    }
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
        if (!noticeMoveRoomTaken(data)) remindMoveRoomContact(data, true)
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
    try {
      await axios.post(
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
          if (!noticeMoveRoomTaken(data) && !remindMoveRoomContact(data, false) && justLoggedIn) maybeShowStatusPopups(data)
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
  }, [])

  useEffect(() => {
    const now = Date.now()
    const upcoming = (data?.announcements ?? [])
      .map((item) => (item.expires_epoch ? item.expires_epoch * 1000 - now : Number.NaN))
      .filter((wait) => Number.isFinite(wait) && wait > 0)
    if (upcoming.length === 0) return undefined
    const timer = setTimeout(loadDashboard, Math.min(Math.min(...upcoming) + 1000, 2147483647))
    return () => clearTimeout(timer)
  }, [data])

  const handleLogout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const openPaymentForm = () => {
    setPaymentError('')
    setPaymentSlip(null)
    setPaymentCopied(false)
    setShowPaymentForm(true)
    axios
      .get('/api/customer/payment-channels', { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
      .then(({ data: result }) => {
        const channels = result.channels || {}
        setPaymentChannels(channels)
        const hasPromptPay = isValidPromptPayId(channels.promptpay_id)
        const hasBank = Boolean(channels.bank_name && channels.bank_account_no)
        setPaymentMethod(hasPromptPay || !hasBank ? 'promptpay' : 'bank')
      })
      .catch(() => setPaymentChannels({}))
  }

  const copyBankAccount = async (accountNo) => {
    try {
      await navigator.clipboard.writeText(String(accountNo).replace(/[^\d]/g, ''))
      setPaymentCopied(true)
      window.setTimeout(() => setPaymentCopied(false), 1800)
    } catch {
      setPaymentCopied(false)
    }
  }

  const handleConfirmPayment = async (event) => {
    event.preventDefault()
    const token = sessionStorage.getItem('token')
    if (!paymentMethod) {
      setPaymentError('กรุณาเลือกช่องทางการชำระเงิน')
      return
    }
    if (!paymentSlip) {
      setPaymentError('กรุณาแนบสลิปโอนเงินก่อนส่ง')
      return
    }
    setPaymentSubmitting(true)
    setPaymentError('')
    try {
      const qrPayload = paymentChannels?.test_mode ? '' : await readSlipQrPayload(paymentSlip)
      const formData = new FormData()
      formData.append('payment_method', paymentMethod)
      if (qrPayload) formData.append('qr_payload', qrPayload)
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
    setMobileTabMenuOpen(false)
    const visited = [...(customerTabKeys[customerTab] || []), ...(customerTabKeys[key] || [])]
    if (tabSeenStorageKey && visited.some((itemKey) => !seenTabKeys.has(itemKey))) {
      const current = new Set(Object.values(customerTabKeys).flat())
      const next = [...new Set([...[...seenTabKeys].filter((itemKey) => current.has(itemKey)), ...visited])]
      try {
        localStorage.setItem(tabSeenStorageKey, JSON.stringify(next))
        setTabSeenVersion((version) => version + 1)
      } catch (error) {
        console.warn('Could not save seen tab items', error)
      }
    }
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
    setRequestError('')
  }

  const handleRequestSubmit = async (event) => {
    event.preventDefault()
    if (activeRequestType === 'moveout' && !preferredMoveDate) {
      setRequestError('กรุณาเลือกวันที่ต้องการย้ายออก')
      return
    }
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
        payload.renew_payment_type = 'monthly'
      }
      if (activeRequestType === 'move_room') {
        payload.target_room_number = Number(targetRoomNumber)
        payload.move_reason = moveReason
        payload.preferred_move_date = preferredMoveDate
      }
      if (activeRequestType === 'moveout') payload.preferred_move_date = preferredMoveDate
      const { data: result } = await axios.post('/api/customer/requests', payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setActiveRequestType(null)
      setSuccessPopup(result.message || 'ส่งคำขอสำเร็จ')
      await loadDashboard()
    } catch (err) {
      if (err.response?.data?.code === 'TENANT_REQUEST_ACTIVE') {
        setBlockedRequestPopup({ message: err.response.data.message, type: activeRequestType })
        setActiveRequestType(null)
        loadDashboard()
      } else if (['RENEW_OUTSTANDING', 'MOVE_ROOM_OUTSTANDING'].includes(err.response?.data?.code)) {
        setRequestError(err.response.data.message)
        loadDashboard()
      } else {
        setRequestError(err.response?.data?.message || 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      }
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

  if (!data) return null

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
  const needsDormInfoAck = customer?.dorm_info_acknowledged === false && !dormInfoAcknowledged
  const pendingAlerts = announcements.filter(
    (item) =>
      item.tone === 'warning' &&
      !item.acknowledged &&
      !acknowledgedAnnouncementIds.has(item.id) &&
      item.popup_active !== false &&
      !(item.popup_epoch && item.popup_epoch * 1000 <= popupNow),
  )
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
  const parcelToday = new Date()
  const todayParcelKey = parcelDayKey(parcelToday)
  const yesterdayParcelKey = parcelDayKey(
    new Date(parcelToday.getFullYear(), parcelToday.getMonth(), parcelToday.getDate() - 1),
  )
  const parcelDayGroups = pagedParcels.reduce((groups, parcel) => {
    const key = parcelDayKey(parcel.created_at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(parcel)
    else groups.push({ key, date: new Date(parcel.created_at), items: [parcel] })
    return groups
  }, [])
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
  const renewOutstanding = Number(data?.outstanding?.amount) || 0
  const moveOutUnpaidItems = (data?.moveOutBalance?.items ?? []).filter((item) => item.status !== 'pending')
  const moveOutOutstanding = moveOutUnpaidItems.reduce((total, item) => total + (Number(item.amount) || 0), 0)
  const moveoutRequest = latestRequestByType('moveout')
  const moveoutActive = Boolean(
    moveoutRequest && !['rejected', 'cancelled'].includes(moveoutRequest.status) && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest.status],
  )
  const moveRoomRequest = latestRequestByType('move_room')
  const moveRoomActive = Boolean(moveRoomRequest && ['pending', 'in_progress'].includes(moveRoomRequest.status))
  const moveRoomChargeDue = moveRoomActive && moveRoomRequest.transfer_charge_due_at && moveRoomRequest.transfer_charge_status === 'pending'
    ? moveRoomRequest
    : null
  const lastMoveRoomAt = (data?.tenantRequests ?? [])
    .filter((request) => request.type === 'move_room' && request.status === 'approved' && request.completed_at)
    .reduce((latest, request) => (!latest || new Date(request.completed_at) > new Date(latest) ? request.completed_at : latest), null)
  const moveRoomWait = MOVE_ROOM_COOLDOWN_ENABLED && room?.is_booked ? moveRoomCooldown(room.rental_start_date, lastMoveRoomAt) : null
  const moveRoomAllowedAt = moveRoomWait?.allowedAt ?? null
  const moveRoomTooEarly = Boolean(moveRoomAllowedAt && msUntil(moveRoomAllowedAt) > 0)
  const moveRoomWaitMessage = moveRoomWait?.afterTransfer
    ? `เพิ่งย้ายห้องไป ต้องรอ ${MOVE_ROOM_COOLDOWN_DAYS} วันหลังย้ายห้องจึงจะขอย้ายได้อีกครั้ง`
    : `ต้องพักอาศัยครบ ${MOVE_ROOM_COOLDOWN_DAYS} วันนับจากวันเริ่มสัญญาจึงจะขอย้ายห้องได้`

  const canResubmitRenew =
    !renewRequest
    || renewRequest.status === 'rejected'
    || renewRequest.status === 'cancelled'
    || (renewRequest.status === 'approved' && msLeft !== null && msLeft <= RENEW_RESUBMIT_WINDOW_MS)

  const buildTenantRequestNotifs = (request) => {
    const items = []
    if (request.accepted_at) {
      items.push({
        key: `tenant-${request.id}-in_progress`,
        title: TENANT_REQUEST_TYPE_LABEL[request.type] || request.type,
        ...TENANT_REQUEST_NOTIF_INFO.in_progress,
        date: request.accepted_at,
        preview: request.note,
        previewLabel: 'หมายเหตุของคุณ',
        detail:
          [
            STATUS_POPUP_CONTENT_BY_KIND[request.type]?.in_progress?.message,
            request.note ? `หมายเหตุของคุณ: ${request.note}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
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
        preview: request.note,
        previewLabel: 'หมายเหตุของคุณ',
        detail:
          (request.type === 'moveout' && MOVEOUT_STATUS_POPUP_CONTENT[request.status]?.message)
          || (request.type === 'move_room' && request.status === 'cancelled' && request.reject_reason)
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
        preview: request.description,
        previewLabel: 'รายละเอียดการแจ้งซ่อม',
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
        preview: request.description,
        previewLabel: 'รายละเอียดการแจ้งซ่อม',
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
        preview: `฿${formatCurrency(payment.amount)}`,
        previewLabel: 'ยอดเงิน',
        detail: (
          <span className="dashboard-notif-utility-detail">
            <span className="dashboard-notif-utility-amount">จำนวนเงิน ฿{formatCurrency(payment.amount)}</span>
            {description !== '-' && <span className="dashboard-notif-utility-desc">{description}</span>}
            <span className="dashboard-notif-utility-by">แจ้งโดยพนักงาน</span>
          </span>
        ),
        kind: 'utility',
        paymentType: payment.type,
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
            <span className="dashboard-notif-utility-by">บันทึกโดย <span className="dashboard-actor">{parcel.staff_name || 'เจ้าหน้าที่'}</span></span>
          </span>
        ),
        preview: parcel.description || parcel.tracking_number || parcel.sender_name || 'กรุณาติดต่อรับพัสดุ',
        previewLabel: parcel.description ? 'รายละเอียดพัสดุ' : parcel.tracking_number ? 'เลขพัสดุ' : parcel.sender_name ? 'ผู้ส่ง' : 'การรับพัสดุ',
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
      bylineName: item.author || 'เจ้าหน้าที่',
      preview: item.message,
      previewLabel: 'รายละเอียดประกาศ',
      kind: 'announcement',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  const newNotifications = notifications.filter((notif) => !seenNotifKeys.has(notif.key))

  const markNotificationsSeen = () => {
    setFreshNotifKeys(new Set(newNotifications.map((notif) => notif.key)))
    if (newNotifications.length === 0) return
    try {
      if (notifSeenStorageKey) {
        localStorage.setItem(notifSeenStorageKey, JSON.stringify(notifications.map((notif) => notif.key)))
      }
    } catch {
      return
    }
    setNotifSeenVersion((version) => version + 1)
  }

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

  const currentDueRentItem = currentDue?.items?.find((item) => item.type === 'rent' && item.status !== 'pending')
  const currentDueDepositItem = currentDue?.items?.find((item) => item.type === 'deposit' && item.status !== 'pending')
  const rentalHistoryWithDue =
    (currentDueRentItem || currentDueDepositItem) && rentalHistory.length > 0
      ? rentalHistory.map((entry, index) => {
          if (index !== 0) return entry
          const pendingDepositPayment = currentDueDepositItem && {
            id: `due-deposit-${entry.booking_id}`,
            booking_id: entry.booking_id,
            created_at: currentDue.dueDate || currentDue.periodStart || entry.rental_start_date,
            payment_date: currentDue.dueDate || currentDue.periodStart || entry.rental_start_date,
            type: 'deposit',
            amount: currentDueDepositItem.amount,
            status: 'pending',
            note: `เงินมัดจำ ชำระครั้งเดียวพร้อมค่าเช่าเดือนแรก${currentDue.monthlyPrice ? ` (${Math.round(currentDueDepositItem.amount / currentDue.monthlyPrice)} เดือน × ฿${formatCurrency(currentDue.monthlyPrice)})` : ''}`,
          }
          const pendingRentPayment = currentDueRentItem && {
            id: `due-rent-${entry.booking_id}`,
            booking_id: entry.booking_id,
            created_at: currentDue.dueDate || currentDue.periodStart,
            payment_date: currentDue.dueDate || currentDue.periodStart,
            type: 'rent',
            amount: currentDueRentItem.amount,
            status: currentDueRentItem.status === 'overdue' ? 'overdue' : 'pending',
            note: [
              currentDue.firstPeriod
                ? currentDue.depositAmount > 0
                  ? `ค่าเช่าเดือนแรก · ชำระพร้อมเงินมัดจำ รวม ฿${formatCurrency(currentDueRentItem.amount + currentDue.depositAmount)}`
                  : 'ค่าเช่าเดือนแรกหลังลงทะเบียน'
                : currentDue.periodStart && currentDue.periodEnd
                  ? `รอบบิล ${formatDate(currentDue.periodStart)} – ${formatDate(currentDue.periodEnd)}`
                  : null,
              currentDue.overdueMonths > 0 ? `ค้างสะสม ${currentDue.overdueMonths + 1} เดือน` : null,
              currentDue.lumpSumMonths ? `จ่ายล่วงหน้า ${currentDue.lumpSumMonths} เดือน` : null,
            ].filter(Boolean).join(' · ') || null,
          }
          return { ...entry, payments: [pendingDepositPayment, pendingRentPayment, ...entry.payments].filter(Boolean) }
        })
      : rentalHistory

  const historyKeyword = historySearch.trim().toLowerCase()
  const filteredRentalHistory = rentalHistoryWithDue.map((entry) => {
    const payments = entry.payments.filter((payment) => {
      if (historyStatusFilter !== 'all' && payment.status !== historyStatusFilter) return false
      if (historyKeyword) {
        const haystack = [
          `ห้อง ${entry.room_number}`,
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
  const isHistoryFiltered = historyStatusFilter !== 'all' || Boolean(historyKeyword)

  const renderRentalEntry = (entry, index, scope) => {
    const pageKey = `${scope}-${entry.booking_id}`
    const { movedIn, movedOut } = getBookingTransfer(index)
    const originalEntry =
      rentalHistoryWithDue.find((item) => item.booking_id === entry.booking_id) || entry
    const pageSize = scope === 'all' ? RENTAL_HISTORY_FULL_PAGE_SIZE : RENTAL_HISTORY_PAGE_SIZE
    const totalPages = Math.max(1, Math.ceil(entry.payments.length / pageSize))
    const currentPage = Math.min(historyPageByBooking[pageKey] || 1, totalPages)
    const paginatedPayments = entry.payments.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const setBookingPage = (page) =>
      setHistoryPageByBooking((prev) => ({ ...prev, [pageKey]: page }))
    return (
      <div key={entry.booking_id} className="dashboard-rental-entry">
        <div className="dashboard-rental-entry-header">
          <div className="dashboard-rental-entry-info">
            <p className="dashboard-rental-entry-title">
              ห้อง {entry.room_number}
              {index === 0 && room?.is_booked && <span className="dashboard-rental-entry-current">กำลังเช่า</span>}
            </p>
            {entry.rental_start_date && (movedOut || entry.rental_end_date) && (
              <span className="dashboard-rental-entry-dates">
                <CalendarIcon />
                {formatDate(entry.rental_start_date)} – {formatDate(movedOut ? movedOut.completed_at : entry.rental_end_date)}
              </span>
            )}
          </div>
          {originalEntry.payments.some((payment) => payment.status === 'paid') && (
            <button
              type="button"
              className="dashboard-receipt-all-btn"
              disabled={receiptGenerating}
              onClick={() => requestCombinedReceipt(originalEntry)}
              title="ดาวน์โหลดใบเสร็จรวม (PDF)"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {receiptGenerating && receiptRequest?.mode === 'all' && receiptRequest.entry.booking_id === entry.booking_id
                ? 'กำลังสร้าง...'
                : 'ใบเสร็จรวม PDF'}
            </button>
          )}
        </div>
        {(movedIn || movedOut) &&
          (() => {
            const transfer = movedOut || movedIn
            const linkedBooking = rentalHistory[movedOut ? index - 1 : index + 1]
            const linkedRoom = movedOut ? transfer.target_room_number : transfer.room_number
            return (
              <div className={`dashboard-history-transfer-note${movedOut ? ' is-out' : ' is-in'}`}>
                <span className="dashboard-history-transfer-icon" aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </span>
                <div className="dashboard-history-transfer-text">
                  <span className="dashboard-history-transfer-route">
                    ย้ายจาก <b>{transfer.room_number}</b> {movedOut ? 'ไป' : 'มา'} <b>{transfer.target_room_number}</b>
                  </span>
                  <span className="dashboard-history-transfer-date">{formatDate(transfer.completed_at)}</span>
                </div>
                {linkedBooking && (
                  <button
                    type="button"
                    className="dashboard-history-transfer-link"
                    onClick={() => {
                      setHistoryBookingId(linkedBooking.booking_id)
                      if (scope !== 'all') selectCustomerTab('rental-history')
                    }}
                  >
                    ดูห้อง {linkedRoom}
                    <span aria-hidden="true">›</span>
                  </button>
                )}
              </div>
            )
          })()}
        {entry.payments.length === 0 ? (
          <p className="dashboard-empty">
            {entry.hasOriginalPayments ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีประวัติการชำระค่าเช่า'}
          </p>
        ) : (
          <>
            <div className="table-responsive">
              <table className="dashboard-table dashboard-rental-table">
                <thead>
                  <tr>
                    <th>วันที่ชำระ</th>
                    <th>รายการ</th>
                    <th className="is-amount">จำนวนเงิน</th>
                    <th>สถานะ</th>
                    <th>หมายเหตุ</th>
                    <th className="is-slip">สลิป</th>
                    <th className="is-receipt">ใบเสร็จ</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPayments.map((payment) => {
                    const paidAt = new Date(payment.created_at)
                    const note = formatCustomerNote(payment.note)
                    const homePaymentKey = `${entry.booking_id}-${payment.id}`
                    const isHomePaymentExpanded = scope === 'home' && expandedHomePayments.has(homePaymentKey)
                    return (
                    <tr key={payment.id} ref={scope === 'home' ? (node) => {
                      if (node) homePaymentRowsRef.current.set(homePaymentKey, node)
                      else homePaymentRowsRef.current.delete(homePaymentKey)
                    } : undefined} data-payment-status={payment.status} className={`${isHomePaymentExpanded ? 'is-expanded ' : ''}${note && note !== '-' ? 'has-note' : ''}`}>
                      <td>
                        <span className="dashboard-rental-date">
                          <strong>{paidAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                          <small>{paidAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</small>
                        </span>
                      </td>
                      <td>
                        <span className={`dashboard-rental-type is-${payment.type || 'rent'}`}>
                          {PAYMENT_TYPE_LABEL[payment.type] || 'ค่าเช่าห้อง'}
                        </span>
                      </td>
                      <td className="dashboard-payment-amount is-amount">฿{formatCurrency(payment.amount)}</td>
                      <td>
                        <span className={`dashboard-badge status-${payment.status}`}>
                          {payment.status === 'pending' && payment.slip_path ? 'รอตรวจสอบสลิป' : STATUS_LABEL[payment.status] || payment.status}
                        </span>
                      </td>
                      <td className={note && note !== '-' ? '' : 'is-empty-note'}>
                        <span className={`dashboard-rental-note${note && note !== '-' ? '' : ' is-empty'}`} title={typeof note === 'string' ? note : undefined}>
                          {note || '-'}
                        </span>
                      </td>
                      <td className={`is-slip${payment.slip_path ? '' : ' is-empty-action'}`}>
                        {payment.slip_path ? (
                          <button
                            type="button"
                            className="dashboard-receipt-btn"
                            onClick={() => setSlipPreview({ ...payment, room_number: entry.room_number })}
                            aria-label={`ดูสลิปการชำระเงินห้อง ${entry.room_number}`}
                          >
                            ดูสลิป
                          </button>
                        ) : (
                          <span className="dashboard-empty-cell">-</span>
                        )}
                      </td>
                      <td className={`is-receipt${payment.status === 'paid' ? '' : ' is-empty-action'}`}>
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
                      {scope === 'home' && (
                        <td className="dashboard-rental-more-cell">
                          <button
                            type="button"
                            aria-expanded={isHomePaymentExpanded}
                            onClick={(event) => {
                              const row = event.currentTarget.closest('tr')
                              if (row && window.matchMedia('(max-width: 768px) and (prefers-reduced-motion: no-preference)').matches) {
                                homePaymentHeightsRef.current.set(homePaymentKey, row.getBoundingClientRect().height)
                                homePaymentAnimationsRef.current.get(homePaymentKey)?.cancel()
                              }
                              setExpandedHomePayments((previous) => {
                                const next = new Set(previous)
                                if (next.has(homePaymentKey)) next.delete(homePaymentKey)
                                else next.add(homePaymentKey)
                                return next
                              })
                            }}
                          >
                            {isHomePaymentExpanded ? 'ย่อรายละเอียด' : 'ดูเพิ่มเติม'}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                          </button>
                        </td>
                      )}
                    </tr>
                    )
                  })}
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
  }

  const reminders = []
  if (room?.is_booked) {
    if (isExpired) {
      reminders.push({
        type: 'danger',
        kind: 'contract',
        title: 'สัญญาเช่าหมดอายุแล้ว',
        text: `สัญญาเช่าห้อง ${room.room_number} หมดอายุแล้ว กรุณาต่อสัญญาหรือแจ้งย้ายออก`,
      })
    } else if (isWarning) {
      reminders.push({
        type: 'warning',
        kind: 'contract',
        title: 'สัญญาเช่าใกล้หมดอายุ',
        text: `สัญญาเช่าห้อง ${room.room_number} จะหมดอายุในอีก `,
        highlight: formatRemaining(msLeft),
      })
    }
  }
  if (currentDue) {
    if (currentDue.status === 'overdue') {
      reminders.push({
        type: 'danger',
        kind: 'payment',
        title: 'ค้างชำระค่าเช่า',
        text: 'เลยกำหนดชำระงวดนี้แล้ว ครบกำหนดวันที่ ',
        highlight: formatDate(currentDue.dueDate),
        suffix: ' กรุณาชำระโดยเร็ว',
      })
    } else if (currentDue.status === 'due') {
      reminders.push({
        type: 'warning',
        kind: 'payment',
        title: 'ถึงกำหนดชำระค่าเช่า',
        text: 'กรุณาชำระค่าเช่างวดนี้ภายในวันที่ ',
        highlight: formatDate(currentDue.dueDate),
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
                    markNotificationsSeen()
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
                  <span className="dashboard-notif-dot">{newNotifications.length > 99 ? '99+' : newNotifications.length}</span>
                )}
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
                      <div className="dashboard-notif-list" ref={notifListRef}>
                        {paginatedNotifications.map((notif) => (
                          <button
                            type="button"
                            key={notif.key}
                            className={`dashboard-notif-item is-${notif.tone}${freshNotifKeys.has(notif.key) ? ' is-new' : ''}`}
                            onClick={() => {
                              closeNotifPanel()
                              if (notif.kind === 'announcement') {
                                selectCustomerTab('announcements')
                                setAnnouncementFocus({ id: notif.announcementId, nonce: Date.now() })
                                return
                              }
                              if (notif.kind === 'parcel') {
                                selectCustomerTab('parcels')
                                let index = filteredParcels.findIndex((parcel) => parcel.id === notif.parcel.id)
                                if (index < 0) {
                                  resetParcelFilters()
                                  index = parcels.findIndex((parcel) => parcel.id === notif.parcel.id)
                                }
                                setParcelPage(Math.floor(Math.max(index, 0) / PARCEL_PAGE_SIZE) + 1)
                                setParcelReceiveError('')
                                setParcelDetailId(notif.parcel.id)
                                scrollFocusRef.current = `parcel-${notif.parcel.id}`
                                return
                              }
                              selectCustomerTab('home')
                              if (notif.kind === 'maintenance') {
                                let index = filteredMaintenanceRequests.findIndex((item) => item.id === notif.request.id)
                                if (index < 0) {
                                  setMaintenanceSearch('')
                                  setMaintenanceStatusFilter('all')
                                  index = maintenanceRequests.findIndex((item) => item.id === notif.request.id)
                                }
                                setMaintenancePage(Math.floor(Math.max(index, 0) / MAINTENANCE_PAGE_SIZE) + 1)
                                setMaintenanceDetail(notif.request)
                                scrollFocusRef.current = `maintenance-${notif.request.id}`
                              } else if (notif.kind === 'tenant') {
                                setStatusPopup({ kind: notif.request.type, status: notif.request.status, request: notif.request })
                                scrollFocusRef.current = `tenant-${notif.request.type}`
                              } else {
                                setNotifDetail(notif)
                                if (notif.kind === 'utility') scrollFocusRef.current = 'due'
                              }
                            }}
                          >
                            <span className="dashboard-notif-item-icon">
                              <NotifKindIcon kind={notif.kind} paymentType={notif.paymentType} />
                            </span>
                            <span className="dashboard-notif-item-main">
                              <span className="dashboard-notif-item-head">
                                <span className="dashboard-notif-item-title">
                                  {freshNotifKeys.has(notif.key) && <span className="dashboard-notif-item-new">ใหม่</span>}
                                  {notif.title}
                                </span>
                                <time className="dashboard-notif-item-date">{formatDateTime(notif.date)}</time>
                              </span>
                              <span className="dashboard-notif-item-status">{notif.label}</span>
                              {notif.preview && (
                                <span className="dashboard-notif-item-preview">
                                  <span className="dashboard-notif-item-preview-label">{notif.previewLabel}</span>
                                  <span className="dashboard-notif-item-preview-text">{notif.preview}</span>
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      {notifTotalPages > 1 && (
                        <div className="dashboard-notif-pagination">
                          <span className="dashboard-notif-page-info">
                            {(notifCurrentPage - 1) * NOTIF_PAGE_SIZE + 1}–
                            {Math.min(notifCurrentPage * NOTIF_PAGE_SIZE, notifications.length)} จาก {notifications.length}
                          </span>
                          <div className="dashboard-notif-page-nav">
                            <button
                              type="button"
                              className="dashboard-notif-page-btn"
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
                            <span className="dashboard-notif-page-current">
                              {notifCurrentPage} / {notifTotalPages}
                            </span>
                            <button
                              type="button"
                              className="dashboard-notif-page-btn"
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
                    {notifDetail.request ? (
                      <RequestTimeline kind={notifDetail.kind} request={notifDetail.request} />
                    ) : (
                      <p className="dashboard-notif-item-date">
                        {notifDetail.bylineName && (
                          <>
                            ประกาศโดย <span className="dashboard-actor">{notifDetail.bylineName}</span>
                            {' · '}
                          </>
                        )}
                        {formatDateTime(notifDetail.date)}
                      </p>
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
          <Modal title="รายละเอียดการแจ้งซ่อม" onClose={() => setMaintenanceDetail(null)} variant="pinned">
            {() => (
              <div className="dashboard-maintenance-detail">
                <div className="dashboard-modal-scroll">
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
                          href={photo.url}
                          title="คลิกเพื่อดูตัวอย่างรูป"
                          onClick={(event) => {
                            event.preventDefault()
                            setMaintenancePhotoPreview({ index })
                          }}
                        >
                          <UploadImage src={photo.url} alt={`รูปแจ้งซ่อม ${index + 1}`} />
                          <span className="dashboard-maintenance-photo-caption">
                            <span>{photo.name || `รูปที่ ${index + 1}`}</span>
                            <small>รูปที่ {index + 1}</small>
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}
          </Modal>
        )}

        {maintenancePhotoPreview && (maintenancePhotoPreview.item || maintenanceDetail) && (
          <PhotoLightbox
            photos={((maintenancePhotoPreview.item || maintenanceDetail).photos || []).map((photo, index) => ({
              name: photo.name || `รูปที่ ${index + 1}`,
              url: photo.url,
            }))}
            initialIndex={maintenancePhotoPreview.index}
            title="รูปแจ้งซ่อม"
            subtitle={(maintenancePhotoPreview.item || maintenanceDetail).description}
            label="รูปแจ้งซ่อม"
            onClose={() => setMaintenancePhotoPreview(null)}
          />
        )}

        {expiredVehicles.length > 0 && (
          <Modal title="หมดเวลาจอดแล้ว" variant="confirm" onClose={closeExpiredVehicles}>
            {(requestClose) => (
              <div className="dashboard-park-expired">
                <span className="dashboard-park-expired-icon" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 14" />
                  </svg>
                </span>
                <p className="dashboard-park-expired-text">
                  ระบบยกเลิกสิทธิ์จอดรถให้อัตโนมัติ เนื่องจากถึงเวลาสิ้นสุดที่ขอไว้แล้ว
                  หากต้องการจอดต่อ กรุณาลงทะเบียนรถใหม่อีกครั้ง
                </p>
                <ul className="dashboard-park-expired-list">
                  {expiredVehicles.map((vehicle) => (
                    <li key={vehicle.id}>
                      <span className="dashboard-park-expired-car" aria-hidden="true">
                        <CarIcon />
                      </span>
                      <span className="dashboard-park-expired-info">
                        <strong>{vehicle.vehicle_plate}</strong>
                        <small>
                          {vehicle.guest_name ? `รถผู้มาเยี่ยม · ${vehicle.guest_name}` : vehicle.vehicle_model || 'รถของฉัน'}
                        </small>
                      </span>
                      <span className="dashboard-park-expired-time">
                        <small>หมดเวลา</small>
                        {formatVisitDateTime(vehicle.end_at)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="dashboard-form-actions">
                  <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                    รับทราบ
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {statusPopup && getStatusPopupContent(statusPopup) && (
          <Modal
            title={
              statusPopup.showLog
                ? `ประวัติคำขอ${TENANT_REQUEST_TYPE_LABEL[statusPopup.kind] || ''}`
                : statusPopup.previousOf
                  ? 'คำขอก่อนหน้า'
                  : getStatusPopupContent(statusPopup).title
            }
            onClose={() => setStatusPopup(null)}
            variant="request"
            onBack={statusPopup.showLog ? () => setStatusPopup({ ...statusPopup, showLog: false }) : undefined}
            headerAction={(() => {
              const historyCount = TENANT_REQUEST_TYPE_LABEL[statusPopup.kind]
                ? tenantRequests.filter((request) => request.type === statusPopup.kind).length
                : 0
              if (statusPopup.showLog || historyCount === 0) return null
              return (
                <button
                  type="button"
                  className="dashboard-modal-history-btn"
                  onClick={() => setStatusPopup({ ...statusPopup, showLog: true })}
                  aria-label={`ประวัติคำขอทั้งหมด ${historyCount} รายการ`}
                  title="ประวัติคำขอทั้งหมด"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5M12 7v5l3 2" />
                  </svg>
                  <span className="dashboard-modal-history-text">ประวัติคำขอ</span>
                  <span className="dashboard-modal-history-count">{historyCount}</span>
                </button>
              )
            })()}
          >
            {() => {
              const content = getStatusPopupContent(statusPopup)
              const sameTypeRequests = TENANT_REQUEST_TYPE_LABEL[statusPopup.kind]
                ? tenantRequests.filter((request) => request.type === statusPopup.kind)
                : []
              const rootPopup = { ...(statusPopup.previousOf || statusPopup), showLog: false }
              const selectRequest = (request) =>
                setStatusPopup({
                  ...(request.id === rootPopup.request?.id
                    ? rootPopup
                    : { kind: statusPopup.kind, status: request.status, request, previousOf: rootPopup }),
                  logFilter: statusPopup.logFilter,
                  logDateFrom: statusPopup.logDateFrom,
                  logDateTo: statusPopup.logDateTo,
                })
              if (statusPopup.showLog) {
                const logFilter = statusPopup.logFilter || 'all'
                const logDateFrom = statusPopup.logDateFrom || ''
                const logDateTo = statusPopup.logDateTo || ''
                const updateLog = (changes) => setStatusPopup({ ...statusPopup, ...changes })
                const todayKey = parcelDayKey(new Date())
                const logPresets = [
                  { days: 7, label: '7 วัน' },
                  { days: 30, label: '30 วัน' },
                  { days: 90, label: '3 เดือน' },
                ].map((preset) => {
                  const start = new Date()
                  start.setDate(start.getDate() - (preset.days - 1))
                  return { ...preset, from: parcelDayKey(start) }
                })
                const datedRequests = sameTypeRequests
                  .map((request, index) => ({ request, number: sameTypeRequests.length - index }))
                  .filter(({ request }) => {
                    const sentOn = parcelDayKey(request.created_at)
                    return (!logDateFrom || sentOn >= logDateFrom) && (!logDateTo || sentOn <= logDateTo)
                  })
                const visibleRequests = datedRequests.filter(
                  ({ request }) => logFilter === 'all' || request.status === logFilter,
                )
                const logDateActive = Boolean(logDateFrom) || Boolean(logDateTo)
                const logFiltersActive = logFilter !== 'all' || logDateActive
                const logSegments = [
                  { key: 'all', label: 'ทั้งหมด' },
                  { key: 'pending', label: 'รอดำเนินการ', tone: 'warning' },
                  { key: 'in_progress', label: 'รับเรื่องแล้ว', tone: 'info' },
                  { key: 'approved', label: 'อนุมัติแล้ว', tone: 'success' },
                  { key: 'rejected', label: 'ปฏิเสธ', tone: 'danger' },
                  { key: 'cancelled', label: 'ยกเลิกแล้ว', tone: 'danger' },
                ]
                  .map((segment) => ({
                    ...segment,
                    count:
                      segment.key === 'all'
                        ? datedRequests.length
                        : datedRequests.filter(({ request }) => request.status === segment.key).length,
                  }))
                  .filter((segment) => segment.key === 'all' || segment.key === logFilter || segment.count > 0)
                return (
                  <div className="dashboard-confirm-body dashboard-status-body">
                    <div className="dashboard-request-log-toolbar">
                      <div className="dashboard-request-log-toolbar-group">
                        <span className="dashboard-request-log-toolbar-label">สถานะ</span>
                        <div className="dashboard-parcel-segments" role="tablist" aria-label="กรองตามสถานะ">
                          {logSegments.map((segment) => (
                            <button
                              key={segment.key}
                              type="button"
                              role="tab"
                              aria-selected={logFilter === segment.key}
                              className={`dashboard-parcel-segment${segment.tone ? ` tone-${segment.tone}` : ''}${logFilter === segment.key ? ' is-active' : ''}`}
                              onClick={() => updateLog({ logFilter: segment.key })}
                            >
                              {segment.label}
                              <span>{segment.count}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="dashboard-request-log-toolbar-group">
                        <span className="dashboard-request-log-toolbar-label">ช่วงวันที่ส่งคำขอ</span>
                        <div className="dashboard-request-log-dates">
                          <ThaiDatePicker
                            className="dashboard-request-log-date-input"
                            placeholder="ตั้งแต่วันที่"
                            value={logDateFrom}
                            maxDate={dayKeyToDate(logDateTo || todayKey)}
                            isClearable
                            portalId="dashboard-date-portal"
                            onChange={(date) => updateLog({ logDateFrom: date })}
                          />
                          <span className="dashboard-request-log-dates-sep" aria-hidden="true">
                            ถึง
                          </span>
                          <ThaiDatePicker
                            className="dashboard-request-log-date-input"
                            placeholder="ถึงวันที่"
                            value={logDateTo}
                            minDate={dayKeyToDate(logDateFrom)}
                            maxDate={dayKeyToDate(todayKey)}
                            isClearable
                            portalId="dashboard-date-portal"
                            onChange={(date) => updateLog({ logDateTo: date })}
                          />
                        </div>
                        <div className="dashboard-request-log-presets" role="group" aria-label="ช่วงเวลาด่วน">
                          {logPresets.map((preset) => {
                            const isActive = logDateFrom === preset.from && logDateTo === todayKey
                            return (
                              <button
                                key={preset.days}
                                type="button"
                                aria-pressed={isActive}
                                className={`dashboard-request-log-preset${isActive ? ' is-active' : ''}`}
                                onClick={() =>
                                  updateLog(
                                    isActive
                                      ? { logDateFrom: '', logDateTo: '' }
                                      : { logDateFrom: preset.from, logDateTo: todayKey },
                                  )
                                }
                              >
                                {preset.label}ล่าสุด
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="dashboard-request-log-result">
                        <span>
                          แสดง <strong>{visibleRequests.length}</strong> จาก {sameTypeRequests.length} คำขอ
                        </span>
                        {logFiltersActive && (
                          <button
                            type="button"
                            className="dashboard-parcel-clear"
                            onClick={() => updateLog({ logFilter: 'all', logDateFrom: '', logDateTo: '' })}
                          >
                            ล้างตัวกรอง
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="dashboard-status-scroll">
                      {visibleRequests.length === 0 ? (
                        <p className="dashboard-request-log-empty">
                          {logDateActive ? 'ไม่มีคำขอในช่วงวันที่ที่เลือก' : 'ไม่มีคำขอในสถานะนี้'}
                        </p>
                      ) : (
                        <ul className="dashboard-request-log-list">
                          {visibleRequests.map(({ request, number }) => {
                            const sentAt = new Date(request.created_at)
                            return (
                              <li key={request.id}>
                                <button
                                  type="button"
                                  className="dashboard-request-log-entry"
                                  onClick={() => selectRequest(request)}
                                >
                                  <span className="dashboard-request-log-entry-date" aria-hidden="true">
                                    <strong>{sentAt.toLocaleDateString('th-TH', { day: 'numeric' })}</strong>
                                    <small>{sentAt.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })}</small>
                                  </span>
                                  <span className="dashboard-request-log-entry-text">
                                    <strong>
                                      คำขอครั้งที่ {number}
                                      {number === sameTypeRequests.length && <em>ล่าสุด</em>}
                                    </strong>
                                    <small>ส่งเมื่อ {formatDateTime(request.created_at)}</small>
                                  </span>
                                  <span className={`dashboard-badge status-${tenantRequestBadgeClass(request.status)}`}>
                                    {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )
              }
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
                  {['rejected', 'cancelled'].includes(statusPopup.status) && statusPopup.request?.reject_reason && (
                    <div className="dashboard-reject-reason">
                      <span className="dashboard-reject-reason-label">
                        {statusPopup.status === 'cancelled' ? 'เหตุผลที่ยกเลิก' : 'ข้อความจากเจ้าหน้าที่'}
                        {statusPopup.request.completed_by_name ? ` (${statusPopup.request.completed_by_name})` : ''}
                      </span>
                      <p>{statusPopup.request.reject_reason}</p>
                    </div>
                  )}
                  <div className="dashboard-status-scroll" key={statusPopup.request?.id ?? statusPopup.kind}>
                    {statusPopup.request && <RequestTimeline kind={statusPopup.kind} request={statusPopup.request} />}
                    {statusPopup.request && ['renew', 'moveout', 'move_room'].includes(statusPopup.kind) && (
                      <div className="dashboard-maintenance-detail-row is-note">
                        <span>{statusPopup.kind === 'moveout' ? 'เหตุผล/รายละเอียดการย้ายออก' : 'หมายเหตุ'}</span>
                        <strong>{statusPopup.request.note || '-'}</strong>
                      </div>
                    )}
                    {statusPopup.request && (statusPopup.kind === 'renew' || statusPopup.kind === 'moveout' || statusPopup.kind === 'move_room') && (
                      <TenantRequestDetailCard
                        request={{ ...statusPopup.request, type: statusPopup.kind }}
                        roomNumber={room?.room_number}
                      />
                    )}
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
            <Modal title="รายละเอียดพัสดุ" onClose={() => setParcelDetailId(null)} variant="parcel">
              {(requestClose) => (
                <div className="dashboard-confirm-body dashboard-status-body dashboard-parcel-detail">
                  <div className={`dashboard-status-hero ${isPending ? 'is-pending' : 'is-success'}`}>
                    <div className="dashboard-confirm-icon">
                      <PackageIcon size={22} strokeWidth={2.2} />
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
                    <div className={`dashboard-parcel-detail-grid${photos.length > 0 ? ' has-photos' : ''}`}>
                      {photos.length > 0 && (
                        <ParcelGallery photos={photos} onOpen={(index) => setParcelPhotoPreview({ parcel, index })} />
                      )}
                      <div className="dashboard-parcel-detail-side">
                        <ParcelProgress parcel={parcel} />
                        <div className="dashboard-maintenance-detail-card">
                          <h4 className="dashboard-detail-title">ข้อมูลพัสดุ</h4>
                          <div className="dashboard-maintenance-detail-row">
                            <span>ผู้ส่ง / ขนส่ง</span>
                            <strong>{parcel.sender_name || 'พัสดุทั่วไป'}</strong>
                          </div>
                          <div className="dashboard-maintenance-detail-row">
                            <span>เลขพัสดุ</span>
                            {parcel.tracking_number ? (
                              <strong className="dashboard-parcel-detail-tracking">{parcel.tracking_number}</strong>
                            ) : (
                              <strong className="is-muted">ไม่มีเลขพัสดุ</strong>
                            )}
                          </div>
                          <div className="dashboard-maintenance-detail-row">
                            <span>บันทึกโดย</span>
                            <strong className="dashboard-actor">{parcel.staff_name || 'เจ้าหน้าที่'}</strong>
                          </div>
                          {parcel.description && (
                            <div className="dashboard-maintenance-detail-row is-note">
                              <span>รายละเอียด</span>
                              <strong>{parcel.description}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="dashboard-maintenance-detail-card">
                      <h4 className="dashboard-detail-title">การรับพัสดุ</h4>
                      <div className="dashboard-parcel-detail-facts">
                        <div>
                          <span>ผู้รับ</span>
                          <strong>
                            {customer.first_name} {customer.last_name}
                          </strong>
                        </div>
                        <div>
                          <span>ห้อง</span>
                          <strong>{room?.room_number ?? customer.room_number}</strong>
                        </div>
                        <div>
                          <span>พัสดุมาถึง</span>
                          <strong>{formatDateTime(parcel.created_at)}</strong>
                        </div>
                        <div>
                          <span>รับพัสดุ</span>
                          <strong className={isPending ? 'is-pending' : 'is-success'}>
                            {isPending ? 'ยังไม่ได้รับ' : formatDateTime(parcel.received_at)}
                          </strong>
                        </div>
                        {!isPending && parcel.received_at && (
                          <div>
                            <span>ใช้เวลาก่อนรับ</span>
                            <strong>
                              {formatRemaining(new Date(parcel.received_at).getTime() - new Date(parcel.created_at).getTime())}
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>
                    {isPending && (
                      <p className="dashboard-parcel-pickup-hint">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 8h.01M11 12h1v4h1" />
                        </svg>
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

        {moveRoomReminder && (
          <Modal title="ติดต่อเจ้าหน้าที่เรื่องย้ายห้อง" onClose={() => setMoveRoomReminder(null)} variant="confirm">
            {(requestClose) => (
              <div className="dashboard-confirm-body dashboard-contact-reminder">
                <div className="dashboard-confirm-icon is-info">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 21h18" />
                    <path d="M5 21V10h14v11" />
                    <path d="M9 21v-5h6v5" />
                    <circle cx="12" cy="5" r="2.5" />
                  </svg>
                </div>
                <p className="dashboard-confirm-message">เจ้าหน้าที่รับเรื่องคำขอย้ายห้องของคุณแล้ว</p>
                <div className="dashboard-contact-reminder-route">
                  <span>ห้อง {moveRoomReminder.room_number}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                  <strong>ห้อง {moveRoomReminder.target_room_number}</strong>
                </div>
                <div className="dashboard-contact-reminder-box">
                  <p>กรุณาติดต่อเจ้าหน้าที่ที่เคาน์เตอร์เพื่อ</p>
                  <ul>
                    {!moveRoomReminder.room_inspected && <li>นัดตรวจสภาพห้องปัจจุบัน</li>}
                    <li>พูดคุยรายละเอียดค่าเช่าและเงินประกันของห้องใหม่</li>
                    <li>ลงนามบันทึกการย้ายห้อง</li>
                  </ul>
                </div>
                <div className="dashboard-form-actions">
                  <button
                    type="button"
                    className="dashboard-action-btn is-ghost"
                    onClick={() => {
                      setStatusPopup({ kind: 'move_room', status: moveRoomReminder.status, request: moveRoomReminder })
                      requestClose()
                    }}
                  >
                    ดูรายละเอียด
                  </button>
                  <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                    รับทราบ
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {blockedRequestPopup && (
          <Modal title="ยังมีคำขอที่รอดำเนินการ" onClose={() => setBlockedRequestPopup(null)} variant="confirm">
            {(requestClose) => {
              const openRequests = tenantRequests.filter((request) => ['pending', 'in_progress'].includes(request.status))
              const sameTypeRequests = openRequests.filter((request) => request.type === blockedRequestPopup.type)
              const activeRequests = sameTypeRequests.length > 0 ? sameTypeRequests : openRequests
              return (
                <div className="dashboard-confirm-body">
                  <div className="dashboard-confirm-icon is-pending">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <polyline points="12 7 12 12 15 14" />
                    </svg>
                  </div>
                  <p className="dashboard-confirm-message">{blockedRequestPopup.message}</p>
                  <div className="dashboard-blocked-list">
                    <span className="dashboard-blocked-label">
                      {sameTypeRequests.length > 0 ? `คำขอ${TENANT_REQUEST_TYPE_LABEL[blockedRequestPopup.type] || ''}ที่กำลังดำเนินการอยู่` : 'คำขอที่กำลังดำเนินการอยู่'}
                    </span>
                    {activeRequests.length === 0 ? (
                      <span className="dashboard-blocked-empty">ไม่พบรายการ กรุณารีเฟรชหน้าอีกครั้ง</span>
                    ) : (
                      activeRequests.map((request) => (
                        <button
                          key={request.id}
                          type="button"
                          className="dashboard-blocked-item"
                          onClick={() => {
                            requestClose()
                            setStatusPopup({ kind: request.type, status: request.status, request })
                          }}
                        >
                          <span className="dashboard-blocked-item-text">
                            <strong>
                              คำขอ{TENANT_REQUEST_TYPE_LABEL[request.type] || request.type}
                              {request.type === 'move_room' && request.target_room_number ? ` → ห้อง ${request.target_room_number}` : ''}
                            </strong>
                            <small>ส่งเมื่อ {formatVisitDateTime(request.created_at)}</small>
                          </span>
                          <span className={`dashboard-badge status-${tenantRequestBadgeClass(request.status)}`}>
                            {TENANT_REQUEST_STATUS_LABEL[request.status] || request.status}
                          </span>
                          <span className="dashboard-blocked-item-chevron" aria-hidden="true">›</span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="dashboard-form-actions">
                    <button type="button" className="dashboard-action-btn is-primary" onClick={requestClose}>
                      เข้าใจแล้ว
                    </button>
                  </div>
                </div>
              )
            }}
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

        {!room && (
          <div className="dashboard-former-tenant" role="status">
            <strong>คุณย้ายออกจากหอพักแล้ว</strong>
            <span>บัญชีนี้ใช้ดูประวัติการเช่า ใบเสร็จ และสัญญาเก่าได้อย่างเดียว ถ้าต้องการเช่าอีกครั้ง กรุณาติดต่อเจ้าหน้าที่</span>
          </div>
        )}

        <DashboardReminders reminders={reminders} />

        <nav className={`dashboard-tab-menu${mobileTabMenuOpen ? ' is-open' : ''}`} aria-label="เมนูแดชบอร์ด">
          <button
            type="button"
            className="dashboard-tab-menu-toggle"
            aria-expanded={mobileTabMenuOpen}
            aria-controls="dashboard-tab-menu-panel"
            onClick={() => setMobileTabMenuOpen((open) => !open)}
          >
            <span className="dashboard-tab-menu-icon" aria-hidden="true"><span /><span /><span /></span>
            <span>เมนู</span>
            <strong>{CUSTOMER_TABS.find((tab) => tab.key === customerTab)?.label}</strong>
          </button>
          <div className="dashboard-tab-menu-panel" id="dashboard-tab-menu-panel">
            <ul className="nav nav-tabs dashboard-tabs mb-0">
              {CUSTOMER_TABS.map((tab) => (
                <li className="nav-item" key={tab.key}>
                  <button
                    type="button"
                    className={`nav-link dashboard-tab-link${customerTab === tab.key ? ' active' : ''}`}
                    onClick={() => selectCustomerTab(tab.key)}
                  >
                    {tab.label}
                    {newCustomerTabCount(tab.key) > 0 && (
                      <span
                        className={`dashboard-parcel-tab-count${tab.key === 'vehicles' ? ' is-info' : ''}`}
                        aria-label={`${newCustomerTabCount(tab.key)} รายการใหม่`}
                      >
                        {newCustomerTabCount(tab.key)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="dashboard-tab-menu-footer">
              <button type="button" className="dashboard-logout-btn" onClick={handleLogout}>
                ออกจากระบบ
              </button>
            </div>
          </div>
        </nav>
        <div className="dorm-menu-bar">
          <DormInfoMenu
            apiBase="/api/customer/dorm-info"
            requireAck={needsDormInfoAck}
            onAcknowledge={acknowledgeDormInfo}
          />
        </div>

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
                  {parcelDayGroups.map((group) => {
                    const relativeDay =
                      group.key === todayParcelKey ? 'วันนี้' : group.key === yesterdayParcelKey ? 'เมื่อวาน' : null
                    const weekday = group.date.toLocaleDateString('th-TH', { weekday: 'long' })
                    return (
                      <section className="dashboard-parcel-day" key={group.key}>
                        <header className="dashboard-parcel-day-head">
                          <div className="dashboard-parcel-date">
                            <strong>{group.date.getDate()}</strong>
                            <small>{group.date.toLocaleDateString('th-TH', { month: 'short' })}</small>
                          </div>
                          <div className="dashboard-parcel-day-text">
                            <strong>{relativeDay || weekday}</strong>
                            <span>
                              {relativeDay ? `${weekday} ` : ''}
                              {group.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                          </div>
                          <span className="dashboard-parcel-day-count">{group.items.length} รายการ</span>
                        </header>
                        {group.items.map((parcel) => {
                          const isPending = parcel.status === 'pending'
                          return (
                            <article className={`dashboard-parcel-item${isPending ? ' is-pending' : ' is-received'}`} key={parcel.id}>
                              <span className="dashboard-parcel-dot" aria-hidden="true" />
                            <div
                              data-customer-focus={`parcel-${parcel.id}`}
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

                                  {parcel.description && (
                                    <p className="dashboard-parcel-desc">
                                      <span className="dashboard-parcel-desc-label">รายละเอียด</span>
                                      {parcel.description}
                                    </p>
                                  )}

                                  <div className="dashboard-parcel-meta">
                                    <span>
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="8" r="4" />
                                        <path d="M4 21a8 8 0 0 1 16 0" />
                                      </svg>
                                      บันทึกโดย <strong className="dashboard-actor">{parcel.staff_name || 'เจ้าหน้าที่'}</strong>
                                    </span>
                                    <span>
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="12" r="9" />
                                        <path d="M12 7v5l3 2" />
                                      </svg>
                                      มาถึง <strong>{formatStepDate(parcel.created_at).time} น.</strong>
                                    </span>
                                    {parcel.photos?.length > 0 && (
                                      <span>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <rect x="3" y="5" width="18" height="14" rx="2" />
                                          <circle cx="9" cy="10" r="1.5" />
                                          <path d="m21 16-5-5-8 8" />
                                        </svg>
                                        <strong>{parcel.photos.length}</strong> รูป
                                      </span>
                                    )}
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
                                    <UploadImage src={parcel.photos[0].url} alt={parcel.photos[0].name || 'รูปพัสดุ'} loading="lazy" />
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
                      </section>
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
            <CustomerProfileSummary customer={customer} room={room} />
            <form className="dashboard-inline-form dashboard-profile-form" onSubmit={handleProfileSubmit}>
              <div className="dashboard-profile-grid">
                <section className="dashboard-profile-section">
                  <header className="dashboard-profile-head">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21a8 8 0 0 1 16 0" />
                    </svg>
                    <div>
                      <h3>ข้อมูลส่วนตัว</h3>
                      <p>ชื่อและนามสกุลอ้างอิงตามข้อมูลที่ลงทะเบียน ไม่สามารถแก้ไขได้</p>
                    </div>
                  </header>
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
                  <header className="dashboard-profile-head">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    <div>
                      <h3>เปลี่ยนรหัสผ่าน</h3>
                      <p>หากไม่ต้องการเปลี่ยนรหัสผ่าน ให้เว้นช่องด้านล่างว่างไว้</p>
                    </div>
                  </header>
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

        {customerTab === 'vehicles' && <CustomerParkingTab />}

        {customerTab === 'contract' && <CustomerContractPanel />}

        {customerTab === 'rental-history' && (
          <section className="dashboard-card dashboard-rental-history-card">
            <div className="dashboard-card-header">
              <h2>ประวัติการเช่าและการชำระค่าเช่า</h2>
            </div>
            {filteredRentalHistory.length > 0 && (
              <div className="dashboard-history-tabs" role="tablist" aria-label="เลือกห้องที่ต้องการดูประวัติ">
                {filteredRentalHistory.map((entry, index) => {
                  const { movedOut } = getBookingTransfer(index)
                  const isCurrent = index === 0 && Boolean(room?.is_booked)
                  const isActive = index === activeHistoryIndex
                  const paymentCount = rentalHistory[index]?.payments?.length || 0
                  return (
                    <button
                      key={entry.booking_id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      title={movedOut ? `ย้ายไปห้อง ${movedOut.target_room_number}` : `${paymentCount} รายการชำระ`}
                      className={`dashboard-history-tab${isActive ? ' is-active' : ''}`}
                      onClick={() => setHistoryBookingId(entry.booking_id)}
                    >
                      <span className="dashboard-history-tab-top">
                        ห้อง {entry.room_number}
                        {isCurrent && <em>ปัจจุบัน</em>}
                      </span>
                      <span className="dashboard-history-tab-dates">
                        {isCurrent
                          ? `ตั้งแต่ ${formatDate(entry.rental_start_date)}`
                          : `${formatDate(entry.rental_start_date)} – ${formatDate(movedOut ? movedOut.completed_at : entry.rental_end_date)}`}
                      </span>
                      {isHistoryFiltered && (
                        <span className={`dashboard-history-tab-count${entry.payments.length === 0 ? ' is-empty' : ''}`}>
                          พบ {entry.payments.length} รายการ
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
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
                    searchPlaceholder="ค้นหาเลขห้อง วันที่ รายการ จำนวนเงิน หรือหมายเหตุ"
                    resultText={`พบ ${filteredRentalHistory[activeHistoryIndex]?.payments.length ?? 0} จาก ${activePayments.length} รายการ`}
                    canClear={isHistoryFiltered}
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
              renderRentalEntry(filteredRentalHistory[activeHistoryIndex], activeHistoryIndex, 'all')
            )}
          </section>
        )}

        {customerTab === 'home' && (
          <>
            <div className="row g-3">
              <div className="col-12 col-xl-3">
                <div className={`dashboard-card dashboard-room-home-card${room ? ' has-room' : ''}`}>
                  <h2>ห้องของฉัน</h2>
                  {room ? (
                    <>
                      <p className="dashboard-room-number">ห้อง {room.room_number}</p>
                      {room.room_size != null && (
                        <p className="dashboard-room-size">
                          <FieldIcon name="area" size={14} />
                          ขนาดห้อง {formatRoomSize(room.room_size)}
                        </p>
                      )}
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
                        {parseRoomAmenities(room.custom_amenities).map((amenity) => (
                          <span key={amenity.name} className="dashboard-amenity is-teal"><CustomAmenityIcon name={amenity.icon} size={16} />{amenity.name}</span>
                        ))}
                      </div>

                      <h3 className="dashboard-section-title">ค่าน้ำ - ค่าไฟ</h3>
                      <div className="dashboard-utility-rates">
                        <div className="dashboard-utility-rate is-electric">
                          <span>ค่าไฟฟ้า</span>
                          <strong>{formatCurrency(room.electricity_unit_price)} บาท/หน่วย</strong>
                        </div>
                        <div className="dashboard-utility-rate is-water">
                          <span>ค่าน้ำ</span>
                          <strong>{formatCurrency(room.water_price)}/เดือน</strong>
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
                          <div className="dashboard-due-box" data-customer-focus="due">
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
                          {currentDue.depositAmount > 0 && (
                            <p className="dashboard-due-deposit-note is-deposit-applied">
                              รวมเงินมัดจำ ฿{formatCurrency(currentDue.depositAmount)} ชำระครั้งเดียวพร้อมค่าห้องเดือนแรก
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
                            <Modal title="ชำระเงินและแนบสลิป" onClose={() => setShowPaymentForm(false)} variant="payment">
                              {(requestClose) => (
                                <form className="dashboard-inline-form dashboard-pay-form" onSubmit={handleConfirmPayment}>
                                  <div className="dashboard-pay-layout">
                                  <div className="dashboard-pay-left">
                                  {(() => {
                                    const channels = paymentChannels || {}
                                    const hasPromptPay = isValidPromptPayId(channels.promptpay_id)
                                    const hasBank = Boolean(channels.bank_name && channels.bank_account_no)
                                    return (
                                      <>
                                        <div className="dashboard-pay-amount">
                                          <span>ยอดที่ต้องชำระ</span>
                                          <strong>฿{formatCurrency(currentDue.amount)}</strong>
                                          {currentDue.lumpSumMonths ? <small>ค่าเช่าล่วงหน้า {currentDue.lumpSumMonths} เดือน</small> : null}
                                        </div>

                                        {channels.test_mode && (
                                          <div className="dashboard-pay-test" role="note">
                                            <strong>โหมดทดลอง</strong>
                                            <span>QR และบัญชีด้านล่างเป็นตัวอย่าง ห้ามโอนเงินจริง แนบรูปใดก็ได้เพื่อทดสอบระบบ</span>
                                          </div>
                                        )}

                                        <span className="slip-field-label">เลือกช่องทางการชำระเงิน</span>
                                        <div className="dashboard-pay-methods" role="radiogroup" aria-label="ช่องทางการชำระเงิน">
                                          {[
                                            { key: 'promptpay', label: 'PromptPay', hint: 'สแกน QR จากแอปธนาคาร', available: hasPromptPay },
                                            { key: 'bank', label: 'โอนเข้าบัญชี', hint: 'โอนผ่านเลขบัญชีธนาคาร', available: hasBank },
                                          ].map((method) => (
                                            <button
                                              key={method.key}
                                              type="button"
                                              role="radio"
                                              aria-checked={paymentMethod === method.key}
                                              className={`dashboard-pay-method${paymentMethod === method.key ? ' is-active' : ''}`}
                                              disabled={paymentChannels !== null && !method.available}
                                              onClick={() => {
                                                setPaymentMethod(method.key)
                                                setPaymentError('')
                                              }}
                                            >
                                              <span className="dashboard-pay-method-icon" aria-hidden="true">
                                                {method.key === 'promptpay' ? (
                                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="3" width="7" height="7" rx="1" />
                                                    <rect x="14" y="3" width="7" height="7" rx="1" />
                                                    <rect x="3" y="14" width="7" height="7" rx="1" />
                                                    <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3" />
                                                  </svg>
                                                ) : (
                                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 10 12 4l9 6" />
                                                    <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
                                                  </svg>
                                                )}
                                              </span>
                                              <span className="dashboard-pay-method-text">
                                                <strong>{method.label}</strong>
                                                <small>{paymentChannels !== null && !method.available ? 'หอพักยังไม่ได้ตั้งค่า' : method.hint}</small>
                                              </span>
                                            </button>
                                          ))}
                                        </div>

                                        {paymentChannels === null ? (
                                          <div className="dashboard-pay-panel is-loading">กำลังโหลดช่องทางชำระเงิน...</div>
                                        ) : paymentMethod === 'promptpay' ? (
                                          hasPromptPay ? (
                                            <div className="dashboard-pay-panel is-promptpay">
                                              <span className="dashboard-qr-badge">PromptPay</span>
                                              <PromptPayQr promptPayId={channels.promptpay_id} amount={currentDue.amount} size={172} className="dashboard-pay-qr" />
                                              <p className="dashboard-pay-panel-id">{formatPromptPayId(channels.promptpay_id)}</p>
                                              <p className="dashboard-pay-panel-owner">ชำระผ่าน PromptPay</p>
                                              <p className="dashboard-qr-hint">สแกนผ่านแอปธนาคาร ยอดเงินจะถูกใส่ให้อัตโนมัติ</p>
                                            </div>
                                          ) : (
                                            <div className="dashboard-pay-panel is-empty">หอพักยังไม่ได้ตั้งค่า PromptPay กรุณาเลือกโอนเข้าบัญชีหรือติดต่อเจ้าหน้าที่</div>
                                          )
                                        ) : hasBank ? (
                                          <div className="dashboard-pay-panel is-bank">
                                            <div className="dashboard-pay-bank-row">
                                              <span>ธนาคาร</span>
                                              <strong>{channels.bank_name}</strong>
                                            </div>
                                            <div className="dashboard-pay-bank-row">
                                              <span>เลขบัญชี</span>
                                              <strong className="is-account">{channels.bank_account_no}</strong>
                                              <button type="button" className="dashboard-pay-copy" onClick={() => copyBankAccount(channels.bank_account_no)}>
                                                {paymentCopied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
                                              </button>
                                            </div>
                                            {channels.dorm_name && (
                                              <div className="dashboard-pay-bank-row">
                                                <span>ชื่อบัญชี</span>
                                                <strong>{channels.dorm_name}</strong>
                                              </div>
                                            )}
                                            <p className="dashboard-qr-hint">โอนยอด ฿{formatCurrency(currentDue.amount)} แล้วแนบสลิปด้านล่าง</p>
                                          </div>
                                        ) : (
                                          <div className="dashboard-pay-panel is-empty">หอพักยังไม่ได้ตั้งค่าบัญชีธนาคาร กรุณาเลือก PromptPay หรือติดต่อเจ้าหน้าที่</div>
                                        )}
                                      </>
                                    )
                                  })()}
                                  </div>
                                  <div className="dashboard-pay-right">
                                  <span className="slip-field-label">แนบสลิปโอนเงิน <em className="dashboard-pay-required">จำเป็น</em></span>
                                  <SlipDropZone
                                    id="payment-slip-file"
                                    file={paymentSlip}
                                    onChange={setPaymentSlip}
                                    onError={setPaymentError}
                                  />
                                  {paymentError && <p className="dashboard-form-error">{paymentError}</p>}
                                  </div>
                                  </div>
                                  <div className="dashboard-form-actions">
                                    <button type="button" className="dashboard-action-btn is-ghost" onClick={requestClose}>
                                      ยกเลิก
                                    </button>
                                    <button type="submit" className="dashboard-action-btn is-primary" disabled={paymentSubmitting || !paymentSlip}>
                                      {paymentSubmitting
                                        ? paymentChannels?.verify_mode === 'manual' ? 'กำลังส่งสลิป...' : 'กำลังตรวจสอบสลิป...'
                                        : !paymentSlip
                                          ? 'แนบสลิปก่อนส่ง'
                                          : paymentChannels?.verify_mode === 'manual' ? 'ส่งสลิปให้เจ้าหน้าที่ตรวจ' : 'ตรวจสอบสลิปและชำระเงิน'}
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

              <div className="col-12 col-xl-9">
                <div className="dashboard-card dashboard-rental-home-card">
                  <div className="dashboard-card-header">
                    <h2>ประวัติการเช่าและการชำระค่าเช่า</h2>
                    {rentalHistory.length > 0 && (
                      <button
                        type="button"
                        className="dashboard-action-btn is-ghost"
                        onClick={() => selectCustomerTab('rental-history')}
                      >
                        ดูประวัติทุกห้อง
                      </button>
                    )}
                  </div>
                  {rentalHistory.length === 0 ? (
                    <p className="dashboard-empty">ยังไม่มีประวัติการเช่า</p>
                  ) : (
                    renderRentalEntry(
                      { ...rentalHistoryWithDue[0], hasOriginalPayments: rentalHistoryWithDue[0].payments.length > 0 },
                      0,
                      'home',
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="row g-3 mt-1">
              {(room?.is_booked || tenantRequests.length > 0) && (
                <div className="col-12 col-lg-5">
                  <div className="dashboard-card">
                    <h2>แจ้งปัญหาต่างๆ</h2>
                    <div className="dashboard-request-list">
                      {room?.is_booked && (
                        <div data-customer-focus="tenant-renew" className={`dashboard-request-row${renewRequest && RENEW_STATUS_POPUP_CONTENT[renewRequest.status] ? ' has-detail-link' : ''}`}>
                          <div className="dashboard-request-info">
                            <p className="dashboard-request-title">ต่อสัญญา</p>
                            <p className={`dashboard-request-desc${canResubmitRenew && renewOutstanding > 0 ? ' is-warning' : ''}`}>
                              {(canResubmitRenew && renewOutstanding > 0
                                && <OutstandingNotice amount={renewOutstanding} action="ต่อสัญญา" />)
                                || (!canResubmitRenew && renewRequest?.status !== 'pending' && RENEW_STATUS_POPUP_CONTENT[renewRequest?.status]?.message)
                                || (renewRequest?.status === 'pending'
                                  ? `ขอต่อ ${RENEW_DURATION_LABEL[renewRequest.renew_duration_months] || `${renewRequest.renew_duration_months} เดือน`} · จ่ายรายเดือน`
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
                          ) : renewOutstanding > 0 ? (
                            <button type="button" className="dashboard-action-btn is-primary" onClick={openPaymentForm}>
                              ชำระยอดค้าง
                            </button>
                          ) : (
                            <button type="button" className="dashboard-action-btn is-primary" onClick={() => openRequestForm('renew')}>
                              ต่อสัญญา
                            </button>
                          )}
                          {renewRequest && RENEW_STATUS_POPUP_CONTENT[renewRequest.status] && !isRequestSettled(renewRequest) && (
                            <RequestTimelineDropdown kind="renew" request={renewRequest} />
                          )}
                          {renewRequest && RENEW_STATUS_POPUP_CONTENT[renewRequest.status] && (
                            <button
                              type="button"
                              className="dashboard-maintenance-more"
                              onClick={() => setStatusPopup({ kind: 'renew', status: renewRequest.status, request: renewRequest, showLog: isRequestSettled(renewRequest) })}
                            >
                              {isRequestSettled(renewRequest) ? 'ดูประวัติ' : 'ดูรายละเอียด'}
                            </button>
                          )}
                        </div>
                      )}
                      <div data-customer-focus="tenant-moveout" className={`dashboard-request-row${moveoutRequest && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest.status] ? ' has-detail-link' : ''}`}>
                        <div className="dashboard-request-info">
                          <p className="dashboard-request-title">แจ้งย้ายออก</p>
                          <p className={`dashboard-request-desc${!moveoutActive && moveOutOutstanding > 0 ? ' is-warning' : ''}`}>
                            {(moveoutActive && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest?.status]?.message)
                              || (room?.is_booked && moveOutOutstanding > 0
                                && <OutstandingNotice amount={moveOutOutstanding} action="แจ้งย้ายออก" />)
                              || 'แจ้งความประสงค์ย้ายออกก่อนสิ้นสุดสัญญา'}
                          </p>
                        </div>
                        {moveoutActive ? (
                          <button
                            type="button"
                            className={`dashboard-badge status-${tenantRequestBadgeClass(moveoutRequest.status)} dashboard-badge-btn`}
                            onClick={() => setStatusPopup({ kind: 'moveout', status: moveoutRequest.status, request: moveoutRequest })}
                          >
                            {TENANT_REQUEST_STATUS_LABEL[moveoutRequest.status]}
                          </button>
                        ) : room?.is_booked && moveOutOutstanding > 0 ? (
                          <button type="button" className="dashboard-action-btn is-primary" onClick={openPaymentForm}>
                            ชำระยอดค้าง
                          </button>
                        ) : (
                          room?.is_booked && (
                            <button type="button" className="dashboard-action-btn is-danger" onClick={() => openRequestForm('moveout')}>
                              แจ้งย้ายออก
                            </button>
                          )
                        )}
                        {moveoutRequest && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest.status] && !isRequestSettled(moveoutRequest) && (
                          <RequestTimelineDropdown kind="moveout" request={moveoutRequest} />
                        )}
                        {moveoutRequest && MOVEOUT_STATUS_POPUP_CONTENT[moveoutRequest.status] && (
                          <button
                            type="button"
                            className="dashboard-maintenance-more"
                            onClick={() => setStatusPopup({ kind: 'moveout', status: moveoutRequest.status, request: moveoutRequest, showLog: isRequestSettled(moveoutRequest) })}
                          >
                            {isRequestSettled(moveoutRequest) ? 'ดูประวัติ' : 'ดูรายละเอียด'}
                          </button>
                        )}
                      </div>
                      <div data-customer-focus="tenant-move_room" className={`dashboard-request-row${moveRoomRequest ? ' has-detail-link' : ''}`}>
                        <div className="dashboard-request-info">
                          <p className="dashboard-request-title">ย้ายห้อง</p>
                          <p className={`dashboard-request-desc${moveRoomChargeDue || (!moveRoomActive && room?.is_booked && (moveRoomTooEarly || moveOutOutstanding > 0)) ? ' is-warning' : ''}`}>
                            {moveRoomChargeDue
                              ? moveRoomChargeDue.transfer_charge_has_slip
                                ? `ส่งสลิปส่วนต่าง ฿${formatCurrency(moveRoomChargeDue.transfer_charge_amount)} แล้ว รอเจ้าหน้าที่ตรวจ`
                                : `ชำระส่วนต่าง ฿${formatCurrency(moveRoomChargeDue.transfer_charge_amount)} ภายใน ${formatDateTime(moveRoomChargeDue.transfer_charge_due_at)} ไม่งั้นคำขอถูกยกเลิก`
                              : moveRoomActive
                              ? `กำลังขอย้ายไปห้อง ${moveRoomRequest.target_room_number}`
                              : moveRoomTooEarly
                                ? `${moveRoomWaitMessage} ส่งคำขอได้ตั้งแต่ ${formatDate(moveRoomAllowedAt)}`
                                : room?.is_booked && moveOutOutstanding > 0
                                  ? <OutstandingNotice amount={moveOutOutstanding} action="ขอย้ายห้อง" />
                                  : availableRooms.length > 0
                                    ? MOVE_ROOM_COOLDOWN_ENABLED
                                      ? `ส่งคำขอย้ายไปยังห้องพักที่ว่าง (ต้องพักอาศัยครบ ${MOVE_ROOM_COOLDOWN_DAYS} วันขึ้นไป)`
                                      : 'ส่งคำขอย้ายไปยังห้องพักที่ว่าง'
                                    : 'ขณะนี้ไม่มีห้องว่างให้เลือก'}
                          </p>
                        </div>
                        {moveRoomChargeDue && !moveRoomChargeDue.transfer_charge_has_slip ? (
                          <button type="button" className="dashboard-action-btn is-primary" onClick={openPaymentForm}>
                            ชำระส่วนต่าง
                          </button>
                        ) : moveRoomActive ? (
                          <button
                            type="button"
                            className={`dashboard-badge status-${tenantRequestBadgeClass(moveRoomRequest.status)} dashboard-badge-btn`}
                            onClick={() => setStatusPopup({ kind: 'move_room', status: moveRoomRequest.status, request: moveRoomRequest })}
                          >
                            {TENANT_REQUEST_STATUS_LABEL[moveRoomRequest.status]}
                          </button>
                        ) : moveRoomTooEarly ? (
                          <span className="dashboard-request-wait" title={`ขอย้ายห้องได้ตั้งแต่ ${formatDate(moveRoomAllowedAt)}`}>
                            <small>ขอย้ายได้อีก</small>
                            <b>{Math.ceil(msUntil(moveRoomAllowedAt) / 86400000)} วัน</b>
                          </span>
                        ) : room?.is_booked && moveOutOutstanding > 0 ? (
                          <button type="button" className="dashboard-action-btn is-primary" onClick={openPaymentForm}>
                            ชำระยอดค้าง
                          </button>
                        ) : (
                          room?.is_booked && availableRooms.length > 0 && (
                            <button type="button" className="dashboard-action-btn is-primary" onClick={() => openRequestForm('move_room')}>
                              ย้ายห้อง
                            </button>
                          )
                        )}
                        {moveRoomRequest && !isRequestSettled(moveRoomRequest) && (
                          <RequestTimelineDropdown kind="move_room" request={moveRoomRequest} />
                        )}
                        {moveRoomRequest && (
                          <button
                            type="button"
                            className="dashboard-maintenance-more"
                            onClick={() => setStatusPopup({ kind: 'move_room', status: moveRoomRequest.status, request: moveRoomRequest, showLog: isRequestSettled(moveRoomRequest) })}
                          >
                            {isRequestSettled(moveRoomRequest) ? 'ดูประวัติ' : 'ดูรายละเอียด'}
                          </button>
                        )}
                      </div>
                      {room?.is_booked && <ResidentVisitRequestRow outstanding={renewOutstanding} onPayOutstanding={openPaymentForm} />}
                      <SafetyIncidentReportRow />
                    </div>

                    {activeRequestType && (
                      <Modal title={TENANT_REQUEST_TYPE_LABEL[activeRequestType]} onClose={() => setActiveRequestType(null)}>
                        {(requestClose) => (
                          <form className="dashboard-inline-form" onSubmit={handleRequestSubmit}>
                            {activeRequestType === 'renew' && (
                              <>
                                <label>ระยะเวลาที่ต้องการต่อ</label>
                                <select value={renewDurationMonths} onChange={(event) => setRenewDurationMonths(event.target.value)}>
                                  {RENEW_DURATION_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                {room?.rental_end_date && (
                                  <RenewContractPreview
                                    room={room}
                                    months={Number(renewDurationMonths)}
                                    depositAmount={data?.customer?.deposit_amount}
                                  />
                                )}
                              </>
                            )}
                            {activeRequestType === 'move_room' && (
                              <>
                                {MOVE_ROOM_COOLDOWN_ENABLED && (
                                  <p className="dashboard-move-hint">
                                    <FieldIcon name="info" size={16} />
                                    <span>
                                      เงื่อนไข: ต้องพักอาศัยครบ {MOVE_ROOM_COOLDOWN_DAYS} วันนับจากวันเริ่มสัญญา และหลังย้ายห้องแล้วต้องรออีก {MOVE_ROOM_COOLDOWN_DAYS} วันจึงจะขอย้ายได้อีกครั้ง
                                      {moveRoomAllowedAt && ` (ขอย้ายได้ตั้งแต่ ${formatDate(moveRoomAllowedAt)})`}
                                    </span>
                                  </p>
                                )}
                                <FieldLabel htmlFor="target-room-number" required>
                                  ห้องที่ต้องการย้ายไป
                                </FieldLabel>
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
                                      {availableRoom.room_size != null ? ` · ${formatRoomSize(availableRoom.room_size)}` : ''}
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
                                <FieldLabel htmlFor="move-room-reason" required>
                                  เหตุผลที่ต้องการย้าย
                                </FieldLabel>
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
                                <FieldLabel required>
                                  วันที่ต้องการย้าย
                                </FieldLabel>
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
                                <MoveRoomOutcome
                                  currentRoom={room}
                                  targetRoom={availableRooms.find(
                                    (availableRoom) => String(availableRoom.room_number) === targetRoomNumber,
                                  )}
                                  depositRemaining={data?.depositPaid}
                                  balance={data?.moveOutBalance}
                                />
                              </>
                            )}
                            {activeRequestType === 'moveout' && (
                              <>
                                <FieldLabel required>
                                  วันที่ต้องการย้ายออก
                                </FieldLabel>
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
                                {room && (
                                  <MoveOutImpactPreview
                                    room={room}
                                    moveDate={preferredMoveDate}
                                    depositAmount={data?.customer?.deposit_amount}
                                    depositPaid={data?.depositPaid}
                                    depositDeducted={data?.depositTransferDeducted}
                                    balance={data?.moveOutBalance}
                                  />
                                )}
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
                                  ? 'เช่น เหตุผลที่ย้ายออก และช่วงเวลาที่สะดวกให้เจ้าหน้าที่ตรวจห้อง'
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
                                  || (activeRequestType === 'moveout' && (!requestNote.trim() || !preferredMoveDate))
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
                    {room && (
                      <button type="button" className="dashboard-action-btn is-primary" onClick={openMaintenanceForm}>
                        แจ้งซ่อม
                      </button>
                    )}
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
                        <div
                          key={item.id}
                          data-customer-focus={`maintenance-${item.id}`}
                          className={`dashboard-maintenance-item is-${maintenanceBadgeClass(item.status)} cat-${MAINTENANCE_CATEGORY_LABEL[item.category] ? item.category : 'other'}`}
                        >
                          {item.photos?.length > 0 ? (
                            <button
                              type="button"
                              className="dashboard-maintenance-thumb"
                              onClick={() => setMaintenancePhotoPreview({ item, index: 0 })}
                              aria-label={`ดูรูปแจ้งซ่อม ${item.photos.length} รูป`}
                            >
                              <UploadImage src={item.photos[0].url} alt={item.photos[0].name || 'รูปแจ้งซ่อม'} loading="lazy" />
                              {item.photos.length > 1 && <span>+{item.photos.length - 1}</span>}
                            </button>
                          ) : (
                            <span className="dashboard-maintenance-thumb is-empty" aria-hidden="true">
                              <MaintenanceCategoryIcon category={item.category} size={26} />
                            </span>
                          )}
                          <div className="dashboard-maintenance-main">
                            <div className="dashboard-maintenance-top">
                              <div className="dashboard-maintenance-heading">
                                <span className="dashboard-maintenance-kicker">
                                  <MaintenanceCategoryIcon category={item.category} size={13} />
                                  {MAINTENANCE_CATEGORY_LABEL[item.category] || 'อื่นๆ'}
                                </span>
                                <p className="dashboard-maintenance-desc">{item.description}</p>
                              </div>
                              {MAINTENANCE_STATUS_POPUP_CONTENT[item.status] ? (
                                <button
                                  type="button"
                                  className={`dashboard-badge status-${maintenanceBadgeClass(item.status)} dashboard-badge-btn`}
                                  onClick={() => setMaintenanceDetail(item)}
                                >
                                  {MAINTENANCE_STATUS_LABEL[item.status] || item.status}
                                </button>
                              ) : (
                                <span className={`dashboard-badge status-${maintenanceBadgeClass(item.status)}`}>
                                  {MAINTENANCE_STATUS_LABEL[item.status] || item.status}
                                </span>
                              )}
                            </div>
                            <div className="dashboard-maintenance-tags">
                              <span>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <circle cx="12" cy="12" r="9" />
                                  <path d="M12 7v5l3 2" />
                                </svg>
                                {MAINTENANCE_TIME_LABEL[item.preferred_time] || 'เวลาไหนก็ได้'}
                              </span>
                              {item.contact_phone && (
                                <span>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
                                  </svg>
                                  {item.contact_phone}
                                </span>
                              )}
                            </div>
                          </div>
                          <RequestTimeline kind="maintenance" request={item} compact />
                          <div className="dashboard-maintenance-foot">
                            <span className="dashboard-maintenance-date">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
                                <path d="M16 3v3M8 3v3M3 10h18" />
                              </svg>
                              แจ้งเมื่อ {formatDateTime(item.created_at)}
                            </span>
                            <div className="dashboard-maintenance-actions">
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
                              <button type="button" className="dashboard-maintenance-more" onClick={() => setMaintenanceDetail(item)}>
                                ดูรายละเอียด
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M9 18l6-6-6-6" />
                                </svg>
                              </button>
                            </div>
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

      {!needsDormInfoAck && pendingAlerts.length > 0 && (
        <AnnouncementAlertPopup
          key={pendingAlerts[0].id}
          announcement={pendingAlerts[0]}
          remaining={pendingAlerts.length}
          onAcknowledge={acknowledgeAnnouncement}
        />
      )}

      {receiptRequest && (
        <div style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1 }}>
          <div ref={receiptRef}>
            <ReceiptTemplate receiptRequest={receiptRequest} customer={customer} />
          </div>
        </div>
      )}
      {slipPreview && (
        <PhotoLightbox
          photos={[{ name: `สลิปห้อง ${slipPreview.room_number}`, url: slipPreview.slip_path }]}
          title="สลิปการชำระเงิน"
          subtitle={`ห้อง ${slipPreview.room_number} · ${formatDateTime(slipPreview.created_at)}`}
          label="สลิป"
          onClose={() => setSlipPreview(null)}
        />
      )}
    </div>
  )
}

export default CustomerDashbord
