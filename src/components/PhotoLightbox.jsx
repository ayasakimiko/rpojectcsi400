import { useEffect, useRef, useState } from 'react'
import './PhotoLightbox.css'

const PHOTO_ZOOM_MAX = 5
const PHOTO_ZOOM_STEP = 0.5
const PHOTO_CLICK_ZOOM = 2.5
const PHOTO_DRAG_THRESHOLD = 4
const PHOTO_CLOSE_ANIMATION_MS = 90

const roundZoom = (value) => Math.round(value * 100) / 100

export default function PhotoLightbox({ photos, initialIndex = 0, title, subtitle, label, onClose }) {
  const count = photos.length
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0)))
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const dragRef = useRef(null)
  const dragMovedRef = useRef(false)

  const showPhoto = (next) => {
    setIndex(next)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }
  const stepPhoto = (step) => showPhoto((index + step + count) % count)

  const changeZoom = (next) => {
    const value = Math.min(PHOTO_ZOOM_MAX, Math.max(1, roundZoom(next)))
    setZoom(value)
    if (value === 1) setPan({ x: 0, y: 0 })
  }

  const startDrag = (event) => {
    dragMovedRef.current = false
    if (zoom <= 1) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      x: event.clientX - pan.x,
      y: event.clientY - pan.y,
      startX: event.clientX,
      startY: event.clientY,
    }
    setDragging(true)
  }
  const moveDrag = (event) => {
    const drag = dragRef.current
    if (!drag) return
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > PHOTO_DRAG_THRESHOLD) {
      dragMovedRef.current = true
    }
    setPan({ x: event.clientX - drag.x, y: event.clientY - drag.y })
  }
  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }
  const toggleZoom = () => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      return
    }
    changeZoom(zoom > 1 ? 1 : PHOTO_CLICK_ZOOM)
  }

  useEffect(() => {
    if (!closing) return undefined
    const timer = setTimeout(onClose, PHOTO_CLOSE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [closing, onClose])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!['Escape', 'ArrowLeft', 'ArrowRight', '+', '=', '-'].includes(event.key)) return
      event.stopImmediatePropagation()
      if (event.key === 'Escape') {
        if (zoom > 1) {
          setZoom(1)
          setPan({ x: 0, y: 0 })
        } else setClosing(true)
      } else if (event.key === '+' || event.key === '=') {
        setZoom(Math.min(PHOTO_ZOOM_MAX, roundZoom(zoom + PHOTO_ZOOM_STEP)))
      } else if (event.key === '-') {
        const value = Math.max(1, roundZoom(zoom - PHOTO_ZOOM_STEP))
        setZoom(value)
        if (value === 1) setPan({ x: 0, y: 0 })
      } else if (count > 1) {
        const step = event.key === 'ArrowRight' ? 1 : -1
        setIndex((index + step + count) % count)
        setZoom(1)
        setPan({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [index, count, zoom])

  const photo = photos[index]
  if (!photo) return null

  return (
    <div
      className={`photo-viewer${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => setClosing(true)}
    >
      <header className="photo-viewer-bar" onClick={(event) => event.stopPropagation()}>
        <div className="photo-viewer-heading">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {count > 1 && <span className="photo-viewer-counter">{index + 1} / {count}</span>}
        <div className="photo-viewer-zoom" role="group" aria-label="ซูมภาพ">
          <button type="button" onClick={() => changeZoom(zoom - PHOTO_ZOOM_STEP)} disabled={zoom <= 1} aria-label="ซูมออก">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button type="button" className="is-level" onClick={() => changeZoom(1)} disabled={zoom === 1} aria-label="รีเซ็ตขนาดภาพ">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => changeZoom(zoom + PHOTO_ZOOM_STEP)} disabled={zoom >= PHOTO_ZOOM_MAX} aria-label="ซูมเข้า">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <button type="button" className="photo-viewer-close" onClick={() => setClosing(true)} aria-label="ปิด">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="photo-viewer-stage" onWheel={(event) => changeZoom(zoom - event.deltaY * 0.0015)}>
        {count > 1 && (
          <button type="button" className="photo-viewer-nav is-prev" onClick={(event) => { event.stopPropagation(); stepPhoto(-1) }} aria-label="ภาพก่อนหน้า">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <figure className="photo-viewer-figure" onClick={(event) => event.stopPropagation()}>
          <img
            key={index}
            className={`photo-viewer-image${zoom > 1 ? (dragging ? ' is-dragging' : ' is-zoomed') : ''}`}
            src={photo.url}
            alt={`${label || title} ${index + 1}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            draggable={false}
            onClick={toggleZoom}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <figcaption>{photo.name}</figcaption>
        </figure>
        {count > 1 && (
          <button type="button" className="photo-viewer-nav is-next" onClick={(event) => { event.stopPropagation(); stepPhoto(1) }} aria-label="ภาพถัดไป">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="photo-viewer-thumbs" role="tablist" aria-label="รูปภาพทั้งหมด" onClick={(event) => event.stopPropagation()}>
          {photos.map((item, thumbIndex) => (
            <button
              type="button"
              role="tab"
              aria-selected={thumbIndex === index}
              aria-label={`ภาพที่ ${thumbIndex + 1}`}
              key={`${item.name}-${thumbIndex}`}
              ref={thumbIndex === index ? (node) => node?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) : null}
              className={`photo-viewer-thumb${thumbIndex === index ? ' is-active' : ''}`}
              onClick={() => showPhoto(thumbIndex)}
            >
              <img src={item.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
