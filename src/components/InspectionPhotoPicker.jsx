import { useEffect, useMemo, useState } from 'react'
import { UploadImage } from './UploadMedia.jsx'
import './InspectionStaffForm.css'

const INSPECTION_MAX_PHOTOS = 15
const INSPECTION_MAX_PHOTO_BYTES = 5 * 1024 * 1024

function formatPhotoSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function InspectionPhotoPicker({ files, existing = [], onRemoveExisting, onChange, onError }) {
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
    else if (withinSize.length < images.length) onError('รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป')
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
            <span className="photo-dropzone-hint">สูงสุด {INSPECTION_MAX_PHOTOS} รูป รูปละไม่เกิน 5 MB</span>
          </span>
        </label>
      ) : (
        <div className="photo-grid">
          {existing.map((photo, index) => (
            <figure className="photo-tile" key={`saved-${photo.url}`}>
              <UploadImage src={photo.url} alt={`รูปที่บันทึกไว้ ${index + 1}`} />
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
              <UploadImage src={previewUrls[index]} alt={`รูปที่แนบ ${index + 1}`} />
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
