import { useEffect, useMemo } from 'react'
import './ParcelPhotoPicker.css'

export const PARCEL_MAX_PHOTOS = 6
export const PARCEL_MAX_PHOTO_BYTES = 5 * 1024 * 1024

export default function ParcelPhotoPicker({ id, files, onChange, error, onError }) {
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  )

  useEffect(
    () => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)),
    [previews],
  )

  const addFiles = (incoming) => {
    const selected = Array.from(incoming || [])
    if (selected.length === 0) return
    if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      onError('เลือกได้เฉพาะไฟล์ JPG, PNG หรือ WebP')
      return
    }
    if (selected.some((file) => file.size === 0)) {
      onError('ไฟล์รูปภาพว่างเปล่า กรุณาเลือกรูปใหม่')
      return
    }
    if (selected.some((file) => file.size > PARCEL_MAX_PHOTO_BYTES)) {
      onError('รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป')
      return
    }
    if (files.length + selected.length > PARCEL_MAX_PHOTOS) {
      onError(`แนบรูปได้ไม่เกิน ${PARCEL_MAX_PHOTOS} รูป`)
      return
    }
    onError('')
    onChange([...files, ...selected])
  }

  return (
    <div className="parcel-photo-field">
      <div className="parcel-photo-field-heading">
        <span>รูปพัสดุ <span className="parcel-photo-optional">(ไม่บังคับ)</span></span>
        <small>แนบได้หลายรูปสำหรับพัสดุชิ้นนี้ · สูงสุด {PARCEL_MAX_PHOTOS} รูป · JPG, PNG หรือ WebP · ไม่เกิน 5 MB ต่อรูป</small>
      </div>
      <input
        id={id}
        className="parcel-photo-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <div className="parcel-photo-list">
        {previews.map(({ file, url }, index) => (
          <figure className="parcel-photo-item" key={`${file.name}-${file.lastModified}-${index}`}>
            <img src={url} alt={`ตัวอย่างรูปพัสดุ ${index + 1}`} />
            <figcaption title={file.name}>{file.name}</figcaption>
            <button
              type="button"
              className="parcel-photo-remove"
              aria-label={`นำรูป ${file.name} ออก`}
              onClick={() => {
                onChange(files.filter((_, fileIndex) => fileIndex !== index))
                onError('')
              }}
            >
              ลบ
            </button>
          </figure>
        ))}
        {files.length < PARCEL_MAX_PHOTOS && (
          <label className="parcel-photo-add" htmlFor={id}>
            <span aria-hidden="true">+</span>
            <small>เพิ่มรูป</small>
          </label>
        )}
      </div>
      {error && <div className="parcel-photo-error" role="alert">{error}</div>}
    </div>
  )
}
