import { useEffect, useState } from 'react'
import axios from 'axios'
import './AnnouncementBoard.css'

const ANNOUNCEMENTS_PER_PAGE = 5
const EMPTY_FORM = { title: '', message: '', tone: 'info' }
const TONE_LABEL = { info: 'ทั่วไป', warning: 'แจ้งเตือน' }

// Each page styles its cards and tables with its own class prefix, so the board borrows the host page's classes.
const VARIANT_CLASSES = {
  staff: {
    card: 'staff-card',
    header: 'staff-card-header',
    table: 'staff-table',
    button: 'staff-action-btn',
    empty: 'staff-empty',
  },
  admin: {
    card: 'admin-card',
    header: 'admin-card-header',
    table: 'table admin-table',
    button: 'admin-action-btn',
    empty: 'admin-empty',
  },
  dashboard: {
    card: 'dashboard-card',
    header: 'dashboard-card-header',
    table: 'dashboard-table',
    button: 'dashboard-action-btn',
    empty: 'dashboard-empty',
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

function AnnouncementBoard({ announcements = [], canManage = false, apiBase, onChange, variant = 'staff' }) {
  const classes = VARIANT_CLASSES[variant] || VARIANT_CLASSES.staff
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(announcements.length / ANNOUNCEMENTS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = announcements.slice((currentPage - 1) * ANNOUNCEMENTS_PER_PAGE, currentPage * ANNOUNCEMENTS_PER_PAGE)

  useEffect(() => {
    if (!isCreating) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsCreating(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCreating])

  const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

  const openCreateForm = () => {
    setForm(EMPTY_FORM)
    setError('')
    setIsCreating(true)
  }

  const submitAnnouncement = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.message.trim()) {
      setError('กรุณากรอกหัวข้อและรายละเอียดประกาศ')
      return
    }
    setSubmitting(true)
    try {
      await axios.post(
        apiBase,
        { title: form.title.trim(), message: form.message.trim(), tone: form.tone },
        { headers: authHeaders() },
      )
      setIsCreating(false)
      setPage(1)
      await onChange?.()
    } catch (err) {
      setError(err.response?.data?.message || 'เผยแพร่ประกาศไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const removeAnnouncement = async (item) => {
    if (!window.confirm(`ลบประกาศ "${item.title}" หรือไม่?`)) return
    try {
      await axios.delete(`${apiBase}/${item.id}`, { headers: authHeaders() })
      setError('')
      await onChange?.()
    } catch (err) {
      setError(err.response?.data?.message || 'ลบประกาศไม่สำเร็จ')
    }
  }

  return (
    <section className={`${classes.card} announcement-board`}>
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

      <div className="table-responsive">
        <table className={`${classes.table} announcement-table`}>
          <thead>
            <tr>
              <th>หัวข้อ</th>
              <th>รายละเอียด</th>
              <th>ประกาศโดย</th>
              <th>วันที่ประกาศ</th>
              {canManage && <th>จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {announcements.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 5 : 4} className={classes.empty}>
                  ยังไม่มีประกาศ
                </td>
              </tr>
            ) : (
              pageItems.map((item) => (
                <tr key={item.id}>
                  <td className="announcement-cell-title">
                    <strong>{item.title}</strong>
                    <span className={`announcement-tone is-${item.tone || 'info'}`}>
                      {TONE_LABEL[item.tone] || TONE_LABEL.info}
                    </span>
                  </td>
                  <td className="announcement-cell-message" title={item.message}>
                    {item.message}
                  </td>
                  <td>{item.author || 'เจ้าหน้าที่'}</td>
                  <td className="announcement-cell-date">{formatAnnouncementDate(item.created_at)}</td>
                  {canManage && (
                    <td>
                      <button
                        type="button"
                        className={`${classes.button} is-danger`}
                        onClick={() => removeAnnouncement(item)}
                      >
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="announcement-pagination">
          <span>
            หน้า {currentPage} / {totalPages}
          </span>
          <div className="announcement-pagination-controls">
            <button
              type="button"
              className={`${classes.button} is-ghost`}
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              className={`${classes.button} is-ghost`}
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {isCreating && canManage && (
        <div
          className="announcement-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsCreating(false)
          }}
        >
          <section
            className="announcement-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-dialog-title"
          >
            <header className="announcement-dialog-header">
              <h3 id="announcement-dialog-title">เพิ่มประกาศ</h3>
              <button
                type="button"
                className="announcement-dialog-close"
                aria-label="ปิด"
                onClick={() => setIsCreating(false)}
              >
                ×
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
              {error && (
                <p className="announcement-board-error" role="alert">
                  {error}
                </p>
              )}
              <div className="announcement-form-actions">
                <button
                  type="button"
                  className="announcement-board-cancel"
                  onClick={() => setIsCreating(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="announcement-board-submit" disabled={submitting}>
                  {submitting ? 'กำลังเผยแพร่...' : 'เผยแพร่ประกาศ'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default AnnouncementBoard
