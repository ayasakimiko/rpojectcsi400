import { useEffect, useRef, useState } from 'react'
import { createAnnouncement, deleteAnnouncement, readAnnouncements, subscribeAnnouncements } from '../utils/announcements.js'
import './AnnouncementBoard.css'

function formatAnnouncementDate(value) {
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AnnouncementBoard({ canManage = false, author = 'เจ้าหน้าที่' }) {
  const [announcements, setAnnouncements] = useState(readAnnouncements)
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', tone: 'info' })
  const [error, setError] = useState('')
  const launcherRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => subscribeAnnouncements(setAnnouncements), [])

  useEffect(() => {
    if (!isOpen) return undefined
    const launcher = launcherRef.current
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      launcher?.focus()
    }
  }, [isOpen])

  const submitAnnouncement = (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.message.trim()) {
      setError('กรุณากรอกหัวข้อและรายละเอียดประกาศ')
      return
    }
    try {
      createAnnouncement({
        title: form.title.trim(),
        message: form.message.trim(),
        tone: form.tone,
        author,
      })
      setForm({ title: '', message: '', tone: 'info' })
      setError('')
      setIsCreating(false)
    } catch {
      setError('บันทึกไม่ได้ พื้นที่จัดเก็บในเบราว์เซอร์อาจเต็ม')
    }
  }

  const removeAnnouncement = (id) => {
    try {
      deleteAnnouncement(id)
    } catch {
      setError('ลบประกาศไม่สำเร็จ')
    }
  }

  return (
    <section className="announcement-board">
      <button
        ref={launcherRef}
        type="button"
        className="announcement-launcher"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <span>ประกาศจากหอพัก</span>
        <span className="announcement-count" aria-label={`${announcements.length} ประกาศ`}>{announcements.length}</span>
      </button>

      {isOpen && (
        <div className="announcement-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false) }}>
          <section className="announcement-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-board-title">
            <header className="announcement-board-header">
              <div>
                <h2 id="announcement-board-title">ประกาศจากหอพัก</h2>
                <p>ข้อมูลแสดงในเบราว์เซอร์นี้เท่านั้น</p>
              </div>
              <div className="announcement-dialog-actions">
                {canManage && (
                  <button type="button" className="announcement-board-add" onClick={() => { setError(''); setIsCreating((open) => !open) }}>
                    {isCreating ? 'ปิดฟอร์ม' : '+ สร้างประกาศ'}
                  </button>
                )}
                <button ref={closeButtonRef} type="button" className="announcement-dialog-close" aria-label="ปิดประกาศ" onClick={() => setIsOpen(false)}>×</button>
              </div>
            </header>

            {isCreating && canManage && (
              <form className="announcement-board-form" onSubmit={submitAnnouncement}>
                <div className="announcement-board-form-row">
                  <label>หัวข้อ<input maxLength={120} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} required /></label>
                  <label>ประเภท<select value={form.tone} onChange={(event) => setForm((value) => ({ ...value, tone: event.target.value }))}><option value="info">ทั่วไป</option><option value="warning">แจ้งเตือน</option></select></label>
                </div>
                <label>รายละเอียด<textarea rows={3} maxLength={1000} value={form.message} onChange={(event) => setForm((value) => ({ ...value, message: event.target.value }))} required /></label>
                {error && <p className="announcement-board-error" role="alert">{error}</p>}
                <button type="submit" className="announcement-board-submit">เผยแพร่ประกาศ</button>
              </form>
            )}

            {announcements.length === 0 ? (
              <p className="announcement-board-empty">ยังไม่มีประกาศ</p>
            ) : (
              <div className="announcement-board-list">
                {announcements.map((item) => (
                  <article className={`announcement-board-item is-${item.tone || 'info'}`} key={item.id}>
                    <div className="announcement-board-item-heading">
                      <h3>{item.title}</h3>
                      <time dateTime={item.created_at}>{formatAnnouncementDate(item.created_at)}</time>
                    </div>
                    <p>{item.message}</p>
                    <footer><span>ประกาศโดย {item.author || 'เจ้าหน้าที่'}</span>{canManage && <button type="button" onClick={() => removeAnnouncement(item.id)}>ลบ</button>}</footer>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  )
}

export default AnnouncementBoard