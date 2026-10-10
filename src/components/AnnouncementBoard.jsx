import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import PhotoLightbox from './PhotoLightbox.jsx'
import compressImageFile, { validateImageFile } from '../utils/compressImageFile.js'
import './AnnouncementBoard.css'

const ANNOUNCEMENTS_PER_PAGE = 10
const CLOSE_ANIMATION_MS = 160
const EMPTY_FORM = {
  title: '',
  message: '',
  tone: 'info',
  expMode: 'none',
  expAfterHours: '1',
  expAfterMinutes: '0',
  expDay: '',
  expMonth: '',
  expYear: '',
  expHour: '23',
  expMinute: '59',
  keptPhotos: [],
  newPhotos: [],
}
const MAX_PHOTOS = 6
const CONFIRM_TEXT = {
  publish: {
    title: 'ยืนยันการเผยแพร่ประกาศ',
    message: 'ผู้เช่าและเจ้าหน้าที่ทุกคนจะเห็นประกาศนี้ และจะแสดงในการแจ้งเตือนด้วย',
    button: 'ยืนยันเผยแพร่',
  },
  edit: {
    title: 'ยืนยันการแก้ไขประกาศ',
    message: 'การเปลี่ยนแปลงจะแสดงกับผู้เช่าและเจ้าหน้าที่ทุกคนทันที',
    button: 'ยืนยันแก้ไข',
  },
  delete: {
    title: 'ยืนยันการลบประกาศ',
    message: 'ประกาศนี้จะถูกลบออกจากระบบ และผู้เช่ากับเจ้าหน้าที่จะไม่เห็นอีก',
    button: 'ยืนยันลบ',
  },
}
const MONTH_NAMES = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]
const pad2 = (number) => String(number).padStart(2, '0')
const EXPIRY_MODES = [
  { key: 'none', label: 'ไม่ลบอัตโนมัติ' },
  { key: 'after', label: 'ลบหลังจากผ่านไป' },
  { key: 'at', label: 'ระบุวันและเวลา' },
]
const MAX_AFTER_HOURS = 72
const AFTER_HOUR_OPTIONS = Array.from({ length: MAX_AFTER_HOURS + 1 }, (_, index) => index)
const AFTER_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index)
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => pad2(index))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => pad2(index))
const TONE_LABEL = { info: 'ทั่วไป', warning: 'แจ้งเตือน' }

const VARIANT_CLASSES = {
  staff: {
    card: 'staff-card',
    header: 'staff-card-header',
    button: 'staff-action-btn',
  },
  admin: {
    card: 'admin-card',
    header: 'admin-card-header',
    button: 'admin-action-btn',
  },
  dashboard: {
    card: 'dashboard-card',
    header: 'dashboard-card-header',
    button: 'dashboard-action-btn',
  },
}

function formatAnnouncementDate(value) {
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PostPhotos({ photos, onOpen }) {
  if (!photos?.length) return null
  const shown = photos.slice(0, 4)
  return (
    <div className={`announcement-post-photos is-count-${shown.length}`}>
      {shown.map((photo, index) => (
        <button
          type="button"
          key={`${photo.url}-${index}`}
          onClick={() => onOpen(index)}
          aria-label={`ดูรูปที่ ${index + 1} จาก ${photos.length}`}
        >
          {shown.length === 1 && <img className="announcement-post-photo-backdrop" src={photo.url} alt="" aria-hidden="true" />}
          <img className="announcement-post-photo" src={photo.url} alt={photo.name || `รูปประกาศ ${index + 1}`} loading="lazy" />
          {index === shown.length - 1 && photos.length > shown.length && (
            <span className="announcement-post-photos-more">+{photos.length - shown.length}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function toDayKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatRelativeTime(value, now) {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} วันที่แล้ว`
  return formatAnnouncementDate(value)
}

function getDaysInMonth(year, month) {
  if (!year || !month) return 31
  return new Date(Number(year), Number(month), 0).getDate()
}

function buildExpiry(form) {
  if (form.expMode === 'after') {
    const minutes = Number(form.expAfterHours) * 60 + Number(form.expAfterMinutes)
    if (minutes < 1) return { error: 'กรุณาเลือกระยะเวลาอย่างน้อย 1 นาที' }
    return { kind: 'after', minutes }
  }
  if (form.expMode === 'at') {
    const { expDay, expMonth, expYear, expHour, expMinute } = form
    if (!expDay || !expMonth || !expYear) return { error: 'กรุณาเลือกวัน เดือน และปีให้ครบ' }
    const expiresAt = `${expYear}-${pad2(expMonth)}-${pad2(expDay)}T${expHour}:${expMinute}`
    if (new Date(expiresAt) <= new Date()) return { error: 'กรุณาเลือกวันและเวลาที่ลบประกาศให้เป็นเวลาในอนาคต' }
    return { kind: 'at', expiresAt }
  }
  return { kind: 'none' }
}

function formatExpiryDate(value) {
  return `${formatAnnouncementDate(value)} น.`
}

function formatDuration(totalMinutes) {
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return [days && `${days} วัน`, hours && `${hours} ชั่วโมง`, minutes && `${minutes} นาที`].filter(Boolean).join(' ')
}

function formatRemaining(milliseconds) {
  const minutes = Math.ceil(milliseconds / 60000)
  if (minutes < 1) return 'เหลือไม่ถึง 1 นาที'
  return `เหลือ ${formatDuration(minutes)}`
}

function describeExpiry(expiry) {
  if (expiry.kind === 'at') return formatExpiryDate(expiry.expiresAt)
  if (expiry.kind === 'after') return `อีก ${formatDuration(expiry.minutes)} นับจากตอนกดยืนยัน`
  return 'ไม่กำหนด'
}

function AnnouncementBoard({ announcements = [], canManage = false, apiBase, onChange, variant = 'staff', openId = null }) {
  const classes = VARIANT_CLASSES[variant] || VARIANT_CLASSES.staff
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [lightbox, setLightbox] = useState(null)
  const newPhotoPreviews = useMemo(
    () => form.newPhotos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [form.newPhotos],
  )
  useEffect(() => () => newPhotoPreviews.forEach(({ url }) => URL.revokeObjectURL(url)), [newPhotoPreviews])
  const photoCount = form.keptPhotos.length + form.newPhotos.length
  const addPhotos = (fileList) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    const invalid = files.map(validateImageFile).find(Boolean)
    if (invalid) {
      setError(invalid)
      return
    }
    if (photoCount + files.length > MAX_PHOTOS) {
      setError(`แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป`)
      return
    }
    setError('')
    setForm((current) => ({ ...current, newPhotos: [...current.newPhotos, ...files] }))
  }
  const openLightbox = (item, index) => setLightbox({ item, index })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [result, setResult] = useState(null)
  const [detail, setDetail] = useState(() => announcements.find((item) => item.id === openId) || null)
  const [detailClosing, setDetailClosing] = useState(false)
  const [formClosing, setFormClosing] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const [resultClosing, setResultClosing] = useState(false)
  const [visibleCount, setVisibleCount] = useState(ANNOUNCEMENTS_PER_PAGE)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [now, setNow] = useState(() => Date.now())

  const visibleItems = announcements.slice(0, visibleCount)
  const hiddenCount = announcements.length - visibleItems.length
  const today = new Date(now)
  const todayKey = toDayKey(today)
  const yesterdayKey = toDayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  const announcementDayGroups = visibleItems.reduce((groups, item) => {
    const key = toDayKey(item.created_at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, date: new Date(item.created_at), items: [item] })
    return groups
  }, [])

  const toggleExpanded = (id) =>
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!formClosing) return undefined
    const timer = setTimeout(() => {
      setIsCreating(false)
      setFormClosing(false)
    }, CLOSE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [formClosing])

  useEffect(() => {
    if (!detailClosing) return undefined
    const timer = setTimeout(() => {
      setDetail(null)
      setDetailClosing(false)
    }, CLOSE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [detailClosing])

  useEffect(() => {
    if (!confirmClosing) return undefined
    const timer = setTimeout(() => {
      setConfirm(null)
      setConfirmClosing(false)
    }, CLOSE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [confirmClosing])

  useEffect(() => {
    if (!resultClosing) return undefined
    const timer = setTimeout(() => {
      setResult(null)
      setResultClosing(false)
    }, CLOSE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [resultClosing])

  const closeForm = () => setFormClosing(true)
  const closeConfirm = () => setConfirmClosing(true)
  const closeResult = () => setResultClosing(true)
  const closeDetail = () => setDetailClosing(true)
  const showResult = (next) => {
    setResultClosing(false)
    setResult(next)
  }
  const openConfirm = (next) => {
    setConfirmClosing(false)
    setConfirm(next)
  }

  useEffect(() => {
    if (!isCreating && !confirm && !result && !detail) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || submitting) return
      if (result) setResultClosing(true)
      else if (confirm) setConfirmClosing(true)
      else if (isCreating) setFormClosing(true)
      else setDetailClosing(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCreating, confirm, result, detail, submitting])

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

  const openCreateForm = () => {
    setFormClosing(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setIsCreating(true)
  }

  const openEditForm = (item) => {
    const [datePart = '', timePart = ''] = (item.expires_at || '').split('T')
    const [year = '', month = '', day = ''] = datePart.split('-')
    const [hour, minute] = timePart ? timePart.split(':') : ['23', '59']
    setFormClosing(false)
    setEditingId(item.id)
    setForm({
      ...EMPTY_FORM,
      title: item.title,
      message: item.message,
      tone: item.tone || 'info',
      expMode: item.expires_at ? 'at' : 'none',
      expDay: day ? String(Number(day)) : '',
      expMonth: month ? String(Number(month)) : '',
      expYear: year,
      expHour: hour,
      expMinute: minute,
      keptPhotos: item.photos || [],
    })
    setError('')
    setIsCreating(true)
  }

  const currentYear = new Date().getFullYear()
  const expiryYears = [...new Set([currentYear, currentYear + 1, currentYear + 2, Number(form.expYear) || currentYear])].sort()

  const updateExpiry = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value }
      const maxDay = getDaysInMonth(next.expYear, next.expMonth)
      if (next.expDay && Number(next.expDay) > maxDay) next.expDay = String(maxDay)
      return next
    })
  }

  const setExpiryMode = (mode) => {
    setError('')
    setForm((current) => ({ ...current, expMode: mode }))
  }

  const expiryPreview = (() => {
    if (form.expMode === 'none') return { tone: 'is-none', text: 'ประกาศนี้จะแสดงจนกว่าจะลบเอง' }
    if (form.expMode === 'at' && !form.expDay && !form.expMonth && !form.expYear) {
      return { tone: 'is-none', text: 'เลือกวัน เดือน และปีที่ต้องการให้ลบประกาศ' }
    }
    const built = buildExpiry(form)
    if (built.error) return { tone: 'is-error', text: built.error }
    if (built.kind === 'after') {
      return { tone: 'is-set', text: `จะลบประกาศอัตโนมัติหลังจากผ่านไป ${formatDuration(built.minutes)} นับจากตอนกดยืนยัน` }
    }
    return { tone: 'is-set', text: `จะลบประกาศอัตโนมัติเมื่อ ${formatExpiryDate(built.expiresAt)}` }
  })()

  const submitAnnouncement = (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.message.trim()) {
      setError('กรุณากรอกหัวข้อและรายละเอียดประกาศ')
      return
    }
    const expiry = buildExpiry(form)
    if (expiry.error) {
      setError(expiry.error)
      return
    }
    setError('')
    openConfirm({ kind: editingId ? 'edit' : 'publish', title: form.title.trim(), expiry })
  }

  const publishAnnouncement = async () => {
    setSubmitting(true)
    const { expiry } = confirm
    const payload = { title: form.title.trim(), message: form.message.trim(), tone: form.tone }
    if (expiry.kind === 'after') payload.expires_in_minutes = expiry.minutes
    else payload.expires_at = expiry.kind === 'at' ? expiry.expiresAt : ''
    if (editingId) payload.keep_photos = form.keptPhotos.map((photo) => photo.url)
    try {
      payload.photos = await Promise.all(form.newPhotos.map((file) => compressImageFile(file)))
      let response
      if (editingId) {
        response = await axios.patch(`${apiBase}/${editingId}`, payload, { headers: authHeaders() })
      } else {
        response = await axios.post(apiBase, payload, { headers: authHeaders() })
        setVisibleCount(ANNOUNCEMENTS_PER_PAGE)
      }
      closeConfirm()
      closeForm()
      showResult({
        title: payload.title,
        message: response?.data?.message || (editingId ? 'แก้ไขประกาศสำเร็จ' : 'เผยแพร่ประกาศสำเร็จ'),
      })
      await onChange?.()
    } catch (err) {
      closeConfirm()
      setError(
        err.response?.data?.message ||
          (editingId ? 'แก้ไขประกาศไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' : 'เผยแพร่ประกาศไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const deleteAnnouncement = async () => {
    setSubmitting(true)
    try {
      const response = await axios.delete(`${apiBase}/${confirm.id}`, { headers: authHeaders() })
      setError('')
      closeConfirm()
      showResult({ title: confirm.title, message: response?.data?.message || 'ลบประกาศสำเร็จ' })
      await onChange?.()
    } catch (err) {
      closeConfirm()
      setError(err.response?.data?.message || 'ลบประกาศไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className={`${classes.card} announcement-board${variant === 'staff' ? ' staff-tab-card' : ''}`}>
      <div className={classes.header}>
        <div>
          <h2>
            ประกาศจากหอพัก <span className="announcement-count">{announcements.length}</span>
          </h2>
          <p className="announcement-board-subtitle">
            {canManage
              ? 'ผู้เช่าและเจ้าหน้าที่ทุกคนจะเห็นประกาศนี้ และจะแสดงในการแจ้งเตือนด้วย'
              : 'ข่าวสารและประกาศล่าสุดจากหอพัก'}
          </p>
        </div>
        {canManage && (
          <button type="button" className={`${classes.button} is-primary`} onClick={openCreateForm}>
            + เพิ่มประกาศ
          </button>
        )}
      </div>

      {!isCreating && error && (
        <p className="announcement-board-error" role="alert">
          {error}
        </p>
      )}

      <div className={`announcement-scroll${announcements.length === 0 ? ' is-empty' : ''}`}>
        {announcements.length === 0 ? (
          <div className="announcement-feed-empty">
            <span className="announcement-feed-empty-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11v2a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1Z" />
                <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
              </svg>
            </span>
            <strong>ยังไม่มีประกาศ</strong>
            <span>{canManage ? 'กด "+ เพิ่มประกาศ" เพื่อโพสต์ประกาศแรก' : 'เมื่อหอพักมีประกาศใหม่ จะแสดงที่นี่'}</span>
          </div>
        ) : (
          <>
            <div className="announcement-feed">
              {announcementDayGroups.map((group) => {
                const relativeDay = group.key === todayKey ? 'วันนี้' : group.key === yesterdayKey ? 'เมื่อวาน' : null
                const weekday = group.date.toLocaleDateString('th-TH', { weekday: 'long' })
                return (
                  <section className="announcement-day" key={group.key}>
                    <header className="announcement-day-head">
                      <div className="announcement-day-date">
                        <strong>{group.date.getDate()}</strong>
                        <small>{group.date.toLocaleDateString('th-TH', { month: 'short' })}</small>
                      </div>
                      <div className="announcement-day-text">
                        <strong>{relativeDay || weekday}</strong>
                        <span>
                          {relativeDay ? `${weekday} ` : ''}
                          {group.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                      <span className="announcement-day-count">{group.items.length} ประกาศ</span>
                    </header>
                    <ol className="announcement-day-posts">
                      {group.items.map((item) => {
                        const tone = item.tone === 'warning' ? 'warning' : 'info'
                        const message = item.message || ''
                        const isLong = message.length > 220 || message.split('\n').length > 4
                        const isExpanded = expandedIds.has(item.id)
                        const isNew = now - new Date(item.created_at).getTime() < 24 * 60 * 60 * 1000
                        return (
                          <li key={item.id} className={`announcement-day-item is-${tone}`}>
                            <span className="announcement-day-dot" aria-hidden="true" />
                            <article className={`announcement-post is-${tone}`}>
                              <header className="announcement-post-head">
                                <span className="announcement-post-avatar" aria-hidden="true">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 11v2a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1Z" />
                                    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
                                  </svg>
                                </span>
                                <div className="announcement-post-byline">
                                  <strong>{item.author || 'เจ้าหน้าที่'}</strong>
                                  <span title={`${formatAnnouncementDate(item.created_at)} น.`}>
                                    {formatRelativeTime(item.created_at, now)}
                                    <span aria-hidden="true"> · </span>
                                    ประกาศจากหอพัก
                                  </span>
                                </div>
                                <div className="announcement-post-badges">
                                  {isNew && <span className="announcement-post-new">ใหม่</span>}
                                  <span className={`announcement-tone is-${tone}`}>{TONE_LABEL[tone]}</span>
                                </div>
                              </header>
                              <div className="announcement-post-body">
                                <h3 className="announcement-post-title">{item.title}</h3>
                                <p className={`announcement-post-message${isLong && !isExpanded ? ' is-clamped' : ''}`}>{message}</p>
                                {isLong && (
                                  <button type="button" className="announcement-post-more" onClick={() => toggleExpanded(item.id)}>
                                    {isExpanded ? 'ย่อข้อความ' : 'ดูเพิ่มเติม'}
                                  </button>
                                )}
                              </div>
                              <PostPhotos photos={item.photos} onOpen={(index) => openLightbox(item, index)} />
                              {canManage && (
                                <footer className="announcement-post-foot">
                                  <span className={`announcement-post-expiry${item.expires_at ? ' is-set' : ''}`}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="12" cy="12" r="9" />
                                      <path d="M12 7v5l3 2" />
                                    </svg>
                                    {item.expires_at ? (
                                      <>
                                        ลบอัตโนมัติ {formatExpiryDate(item.expires_at)}
                                        {item.expires_epoch && (
                                          <small className="announcement-remaining">{formatRemaining(item.expires_epoch * 1000 - now)}</small>
                                        )}
                                      </>
                                    ) : (
                                      'ไม่ลบอัตโนมัติ'
                                    )}
                                  </span>
                                  <div className="announcement-post-actions">
                                    <button type="button" className={`${classes.button} is-ghost`} onClick={() => openEditForm(item)}>
                                      แก้ไข
                                    </button>
                                    <button
                                      type="button"
                                      className={`${classes.button} is-danger`}
                                      onClick={() => openConfirm({ kind: 'delete', id: item.id, title: item.title })}
                                    >
                                      ลบ
                                    </button>
                                  </div>
                                </footer>
                              )}
                            </article>
                          </li>
                        )
                      })}
                    </ol>
                  </section>
                )
              })}
            </div>
            {hiddenCount > 0 && (
              <button
                type="button"
                className="announcement-feed-more"
                onClick={() => setVisibleCount((count) => count + ANNOUNCEMENTS_PER_PAGE)}
              >
                ดูประกาศก่อนหน้า
                <span>{hiddenCount}</span>
              </button>
            )}
          </>
        )}
      </div>

      {detail && (
        <div
          className={`announcement-overlay${detailClosing ? ' is-closing' : ''}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetail()
          }}
        >
          <section
            className="announcement-dialog announcement-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-detail-title"
          >
            <header className="announcement-dialog-header">
              <h3 id="announcement-detail-title">รายละเอียดประกาศ</h3>
              <button type="button" className="announcement-dialog-close" aria-label="ปิด" onClick={closeDetail}>
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
            <div className="announcement-detail-body">
              <div className="announcement-detail-heading">
                <h4>{detail.title}</h4>
                <span className={`announcement-tone is-${detail.tone || 'info'}`}>
                  {TONE_LABEL[detail.tone] || TONE_LABEL.info}
                </span>
              </div>
              <p className="announcement-detail-message">{detail.message}</p>
              <PostPhotos photos={detail.photos} onOpen={(index) => openLightbox(detail, index)} />
              <dl className="announcement-detail-meta">
                <div>
                  <dt>ประกาศโดย</dt>
                  <dd>{detail.author || 'เจ้าหน้าที่'}</dd>
                </div>
                <div>
                  <dt>วันเวลาที่ประกาศ</dt>
                  <dd>{formatAnnouncementDate(detail.created_at)} น.</dd>
                </div>
                {canManage && (
                  <div>
                    <dt>ลบอัตโนมัติ</dt>
                    <dd>{detail.expires_at ? formatExpiryDate(detail.expires_at) : 'ไม่กำหนด'}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="announcement-form-actions">
              <button type="button" className="announcement-board-cancel" onClick={closeDetail}>
                ปิด
              </button>
            </div>
          </section>
        </div>
      )}

      {isCreating && canManage && (
        <div
          className={`announcement-overlay${formClosing ? ' is-closing' : ''}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm()
          }}
        >
          <section
            className="announcement-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-dialog-title"
          >
            <header className="announcement-dialog-header">
              <h3 id="announcement-dialog-title">{editingId ? 'แก้ไขประกาศ' : 'เพิ่มประกาศ'}</h3>
              <button
                type="button"
                className="announcement-dialog-close"
                aria-label="ปิด"
                onClick={closeForm}
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
            <form className="announcement-board-form" onSubmit={submitAnnouncement} noValidate>
              <div className="announcement-board-form-row">
                <label>
                  หัวข้อ
                  <input
                    maxLength={120}
                    autoFocus
                    value={form.title}
                    onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                  />
                </label>
                <label>
                  ประเภท
                  <select
                    value={form.tone}
                    onChange={(event) => setForm((value) => ({ ...value, tone: event.target.value }))}
                  >
                    <option value="info">ทั่วไป</option>
                    <option value="warning">แจ้งเตือน</option>
                  </select>
                </label>
              </div>
              <label>
                รายละเอียด
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={form.message}
                  onChange={(event) => setForm((value) => ({ ...value, message: event.target.value }))}
                />
              </label>
              <div className="announcement-photo-field">
                <span>
                  รูปภาพ (ไม่บังคับ)
                  <small>
                    {photoCount} / {MAX_PHOTOS} รูป
                  </small>
                </span>
                <div className="announcement-photo-grid">
                  {form.keptPhotos.map((photo) => (
                    <figure key={photo.url}>
                      <img src={photo.url} alt={photo.name || 'รูปประกาศ'} />
                      <button
                        type="button"
                        aria-label="ลบรูปนี้"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            keptPhotos: current.keptPhotos.filter((item) => item.url !== photo.url),
                          }))
                        }
                      >
                        ×
                      </button>
                    </figure>
                  ))}
                  {newPhotoPreviews.map(({ file, url }) => (
                    <figure key={url}>
                      <img src={url} alt={file.name} />
                      <button
                        type="button"
                        aria-label="ลบรูปนี้"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            newPhotos: current.newPhotos.filter((item) => item !== file),
                          }))
                        }
                      >
                        ×
                      </button>
                    </figure>
                  ))}
                  {photoCount < MAX_PHOTOS && (
                    <label className="announcement-photo-add">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={(event) => {
                          addPhotos(event.target.files)
                          event.target.value = ''
                        }}
                      />
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <circle cx="9" cy="10" r="1.5" />
                        <path d="m21 16-5-5-8 8" />
                      </svg>
                      เพิ่มรูป
                    </label>
                  )}
                </div>
              </div>
              <div className="announcement-expiry" role="group" aria-labelledby="announcement-expiry-label">
                <span id="announcement-expiry-label">ลบประกาศอัตโนมัติ (ไม่บังคับ)</span>
                <div className="announcement-expiry-modes" role="radiogroup" aria-labelledby="announcement-expiry-label">
                  {EXPIRY_MODES.map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      role="radio"
                      aria-checked={form.expMode === mode.key}
                      className={`announcement-expiry-mode${form.expMode === mode.key ? ' is-active' : ''}`}
                      onClick={() => setExpiryMode(mode.key)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                {form.expMode === 'after' && (
                  <div className="announcement-expiry-row is-after">
                    <select
                      aria-label="ชั่วโมง"
                      value={form.expAfterHours}
                      onChange={(event) => updateExpiry('expAfterHours', event.target.value)}
                    >
                      {AFTER_HOUR_OPTIONS.map((hours) => (
                        <option key={hours} value={hours}>
                          {hours} ชั่วโมง
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="นาที"
                      value={form.expAfterMinutes}
                      onChange={(event) => updateExpiry('expAfterMinutes', event.target.value)}
                    >
                      {AFTER_MINUTE_OPTIONS.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes} นาที
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {form.expMode === 'at' && (
                  <div className="announcement-expiry-row">
                    <select aria-label="วัน" value={form.expDay} onChange={(event) => updateExpiry('expDay', event.target.value)}>
                      <option value="">วัน</option>
                      {Array.from({ length: getDaysInMonth(form.expYear, form.expMonth) }, (_, index) => index + 1).map(
                        (day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ),
                      )}
                    </select>
                    <select
                      aria-label="เดือน"
                      value={form.expMonth}
                      onChange={(event) => updateExpiry('expMonth', event.target.value)}
                    >
                      <option value="">เดือน</option>
                      {MONTH_NAMES.map((name, index) => (
                        <option key={name} value={index + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <select aria-label="ปี" value={form.expYear} onChange={(event) => updateExpiry('expYear', event.target.value)}>
                      <option value="">ปี</option>
                      {expiryYears.map((year) => (
                        <option key={year} value={year}>
                          {year + 543}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="ชั่วโมง"
                      value={form.expHour}
                      onChange={(event) => updateExpiry('expHour', event.target.value)}
                    >
                      {HOUR_OPTIONS.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour} น.
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="นาที"
                      value={form.expMinute}
                      onChange={(event) => updateExpiry('expMinute', event.target.value)}
                    >
                      {MINUTE_OPTIONS.map((minute) => (
                        <option key={minute} value={minute}>
                          {minute} นาที
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <p className={`announcement-expiry-summary ${expiryPreview.tone}`} aria-live="polite">
                  {expiryPreview.text}
                </p>
              </div>
              {error && (
                <p className="announcement-board-error" role="alert">
                  {error}
                </p>
              )}
              <div className="announcement-form-actions">
                <button
                  type="button"
                  className="announcement-board-cancel"
                  onClick={closeForm}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="announcement-board-submit">
                  {editingId ? 'บันทึกการแก้ไข' : 'เผยแพร่ประกาศ'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {confirm && (
        <div
          className={`announcement-overlay is-confirm${confirmClosing ? ' is-closing' : ''}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) closeConfirm()
          }}
        >
          <section
            className="announcement-dialog announcement-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="announcement-confirm-title"
          >
            <div className={`announcement-confirm-icon is-${confirm.kind}`}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {confirm.kind === 'delete' ? (
                  <>
                    <path d="M12 9v4M12 17h.01" />
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  </>
                ) : confirm.kind === 'edit' ? (
                  <>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </>
                ) : (
                  <>
                    <path d="M4 11v2a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1Z" />
                    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
                  </>
                )}
              </svg>
            </div>
            <h3 id="announcement-confirm-title">
              {CONFIRM_TEXT[confirm.kind].title}
            </h3>
            <p className="announcement-confirm-message">
              {CONFIRM_TEXT[confirm.kind].message}
            </p>
            <div className="announcement-confirm-detail">
              <span>หัวข้อ</span>
              <strong>{confirm.title}</strong>
            </div>
            {confirm.kind !== 'delete' && photoCount > 0 && (
              <div className="announcement-confirm-detail">
                <span>รูปภาพ</span>
                <strong>{photoCount} รูป</strong>
              </div>
            )}
            {confirm.kind !== 'delete' && (
              <div className="announcement-confirm-detail">
                <span>ลบอัตโนมัติ</span>
                <strong>{describeExpiry(confirm.expiry)}</strong>
              </div>
            )}
            <div className="announcement-form-actions">
              <button
                type="button"
                className="announcement-board-cancel"
                onClick={closeConfirm}
                disabled={submitting}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className={`announcement-board-submit${confirm.kind === 'delete' ? ' is-danger' : ''}`}
                onClick={confirm.kind === 'delete' ? deleteAnnouncement : publishAnnouncement}
                disabled={submitting}
              >
                {submitting ? 'กำลังดำเนินการ...' : CONFIRM_TEXT[confirm.kind].button}
              </button>
            </div>
          </section>
        </div>
      )}

      {result && (
        <div
          className={`announcement-overlay is-confirm${resultClosing ? ' is-closing' : ''}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeResult()
          }}
        >
          <section
            className="announcement-dialog announcement-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="announcement-result-title"
          >
            <div className="announcement-confirm-icon is-success">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 id="announcement-result-title">สำเร็จ</h3>
            <p className="announcement-confirm-message">{result.message}</p>
            <div className="announcement-confirm-detail">
              <span>หัวข้อ</span>
              <strong>{result.title}</strong>
            </div>
            <div className="announcement-form-actions">
              <button type="button" className="announcement-board-submit" onClick={closeResult} autoFocus>
                ปิด
              </button>
            </div>
          </section>
        </div>
      )}
      {lightbox && (
        <PhotoLightbox
          photos={(lightbox.item.photos || []).map((photo, index) => ({
            name: photo.name || `รูปที่ ${index + 1}`,
            url: photo.url,
          }))}
          initialIndex={lightbox.index}
          title={lightbox.item.title}
          subtitle={lightbox.item.author || 'เจ้าหน้าที่'}
          label="รูปประกาศ"
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  )
}

export default AnnouncementBoard
