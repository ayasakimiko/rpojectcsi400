import { useState } from 'react'
import axios from 'axios'
import { floorRoomRange } from '../utils/roomFloors.js'
import './FloorManager.css'

const formatBaht = (value) =>
  `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

// The rate a floor may take sits between the floor below (must stay cheaper) and the floor above (must stay dearer).
function rateBounds(floors, floorNumber) {
  const rated = floors.filter((floor) => floor.price_rate != null)
  const below = rated.filter((floor) => floor.floor_number < floorNumber).sort((a, b) => b.floor_number - a.floor_number)[0]
  const above = rated.filter((floor) => floor.floor_number > floorNumber).sort((a, b) => a.floor_number - b.floor_number)[0]
  return { below, above }
}



function FloorForm({ floor, floors, submitting, error, onSubmit, onCancel }) {
  const [rate, setRate] = useState(floor.price_rate != null ? String(Number(floor.price_rate)) : '')
  const [note, setNote] = useState(floor.note || '')
  const [applyToVacant, setApplyToVacant] = useState(false)
  const { below, above } = rateBounds(floors, floor.floor_number)
  const rateNumber = Number(rate)
  const localError =
    rate === ''
      ? ''
      : !(rateNumber > 0)
        ? 'เรทราคาต้องมากกว่า 0'
        : below && !(rateNumber < Number(below.price_rate))
          ? `ต้องถูกกว่าชั้น ${below.floor_number} (${formatBaht(below.price_rate)})`
          : above && !(rateNumber > Number(above.price_rate))
            ? `ต้องแพงกว่าชั้น ${above.floor_number} (${formatBaht(above.price_rate)})`
            : ''

  return (
    <form
      className="floor-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (localError || rate === '') return
        onSubmit({ price_rate: rateNumber, note, apply_to_vacant: applyToVacant })
      }}
    >
      <label className="admin-room-field">
        <span>เรทราคาต่อเดือน</span>
        <div className="admin-room-input has-prefix">
          <b>฿</b>
          <input
            type="number"
            min="1"
            step="0.01"
            className="form-control"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            required
            autoFocus
          />
          <em>/เดือน</em>
        </div>
        <small className={`floor-form-hint${localError ? ' is-error' : ''}`}>
          {localError ||
            [below && `ถูกกว่าชั้น ${below.floor_number} (${formatBaht(below.price_rate)})`, above && `แพงกว่าชั้น ${above.floor_number} (${formatBaht(above.price_rate)})`]
              .filter(Boolean)
              .join(' และ ') ||
            'ชั้นยิ่งต่ำยิ่งแพง'}
        </small>
      </label>

      <label className="admin-room-field">
        <span>หมายเหตุ <small className="admin-room-optional">ไม่บังคับ</small></span>
        <input type="text" className="form-control" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ใกล้ลิฟต์ วิวดี" />
      </label>

      <label className="floor-form-check">
        <input type="checkbox" checked={applyToVacant} onChange={(event) => setApplyToVacant(event.target.checked)} />
        <span>
          ปรับค่าเช่าของห้องว่างในชั้นนี้ ({floor.vacant_count} ห้อง) ให้เป็นเรทใหม่
          <small>ห้องที่มีผู้เช่าอยู่ยังใช้ราคาตามสัญญาเดิม</small>
        </span>
      </label>

      {error && <div className="alert alert-danger py-2 px-3 mb-0">{error}</div>}
      <div className="admin-form-actions">
        <button type="button" className="admin-action-btn is-ghost" onClick={onCancel} disabled={submitting}>
          ยกเลิก
        </button>
        <button type="submit" className="admin-action-btn is-primary" disabled={submitting || Boolean(localError) || rate === ''}>
          {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}

export default function FloorManager({ Modal, floors, loading, error, onChanged, onOpenRooms }) {
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const rated = floors.filter((floor) => floor.price_rate != null)
  const highest = rated.reduce((max, floor) => Math.max(max, Number(floor.price_rate)), 0)
  const lowest = rated.reduce((min, floor) => Math.min(min, Number(floor.price_rate)), Infinity)
  const totalRooms = floors.reduce((sum, floor) => sum + floor.room_count, 0)
  const totalVacant = floors.reduce((sum, floor) => sum + floor.vacant_count, 0)
  // Shown like a building: top floor first.
  const stacked = [...floors].sort((a, b) => b.floor_number - a.floor_number)

  const save = async (payload, requestClose) => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data } = await axios.put(`/api/admin/floors/${editing.floor_number}`, payload)
      setNotice(data.message)
      requestClose()
      onChanged?.()
    } catch (saveError) {
      setSubmitError(saveError.response?.data?.message || 'ไม่สามารถบันทึกเรทชั้นได้')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header floor-header">
        <div>
          <h2>ชั้นห้องพักและเรทราคา</h2>
          <p className="floor-muted">
            เลขห้องขึ้นต้นด้วยเลขชั้น (ชั้น 1 = 101–199, ชั้น 2 = 201–299 …) ชั้นยิ่งต่ำยิ่งแพง
          </p>
        </div>
        <div className="floor-totals">
          <span><strong>{floors.length}</strong> ชั้น</span>
          <span><strong>{totalRooms}</strong> ห้อง</span>
          <span className="is-vacant"><strong>{totalVacant}</strong> ว่าง</span>
        </div>
      </div>

      {notice && <div className="alert alert-success py-2 px-3">{notice}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {floors.length === 0 ? (
        <p className="floor-empty">{loading ? 'กำลังโหลด...' : 'ยังไม่มีข้อมูลชั้น'}</p>
      ) : (
        <div className="floor-stack">
          {stacked.map((floor) => {
            const occupancy = floor.room_count ? Math.round((floor.booked_count / floor.room_count) * 100) : 0
            const tag =
              floor.price_rate == null
                ? null
                : rated.length > 1 && Number(floor.price_rate) === highest
                  ? { label: 'แพงสุด', tone: 'high' }
                  : rated.length > 1 && Number(floor.price_rate) === lowest
                    ? { label: 'ถูกสุด', tone: 'low' }
                    : null
            return (
              <article key={floor.floor_number} className="floor-row">
                <div className="floor-badge" aria-hidden="true">
                  <small>ชั้น</small>
                  <strong>{floor.floor_number}</strong>
                </div>

                <div className="floor-main">
                  <div className="floor-title">
                    <h3>ชั้น {floor.floor_number}</h3>
                    <span className="floor-range">ห้อง {floorRoomRange(floor.floor_number)}</span>
                    {tag && <span className={`floor-tag is-${tag.tone}`}>{tag.label}</span>}
                  </div>
                  {floor.note && <p className="floor-note">{floor.note}</p>}

                  <div className="floor-stats">
                    <span><strong>{floor.room_count}</strong> ห้อง</span>
                    <span className="is-booked"><strong>{floor.booked_count}</strong> ไม่ว่าง</span>
                    <span className="is-vacant"><strong>{floor.vacant_count}</strong> ว่าง</span>
                    <span className="floor-occupancy" title={`เข้าพัก ${occupancy}%`}>
                      <span style={{ width: `${occupancy}%` }} />
                    </span>
                  </div>

                  {floor.rooms.length > 0 ? (
                    <div className="floor-rooms">
                      {floor.rooms.map((room) => (
                        <button
                          type="button"
                          key={room.room_number}
                          className={`floor-room-chip${room.is_booked ? ' is-booked' : ''}`}
                          onClick={() => onOpenRooms?.(floor.floor_number)}
                          title={`${room.is_booked ? 'ไม่ว่าง' : 'ว่าง'} · ${formatBaht(room.price)}/เดือน`}
                        >
                          {room.room_number}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="floor-muted">ยังไม่มีห้องในชั้นนี้ เพิ่มได้ที่แท็บห้องพัก</p>
                  )}
                  {floor.off_rate_vacant_count > 0 && (
                    <p className="floor-warning">ห้องว่าง {floor.off_rate_vacant_count} ห้องยังใช้ราคาไม่ตรงกับเรทชั้น</p>
                  )}
                </div>

                <div className="floor-rate">
                  <span className="floor-rate-label">เรทราคา</span>
                  {floor.price_rate != null ? (
                    <strong>
                      {formatBaht(floor.price_rate)}
                      <small>/เดือน</small>
                    </strong>
                  ) : (
                    <strong className="is-empty">ยังไม่ตั้งเรท</strong>
                  )}
                  <button
                    type="button"
                    className="admin-action-btn is-ghost"
                    onClick={() => {
                      setSubmitError('')
                      setNotice('')
                      setEditing(floor)
                    }}
                  >
                    {floor.price_rate != null ? 'แก้ไขเรท' : 'ตั้งเรท'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editing && (
        <Modal title={`เรทราคาชั้น ${editing.floor_number}`} onClose={() => setEditing(null)}>
          {(requestClose) => (
            <FloorForm
              floor={editing}
              floors={floors}
              submitting={submitting}
              error={submitError}
              onSubmit={(payload) => save(payload, requestClose)}
              onCancel={requestClose}
            />
          )}
        </Modal>
      )}
    </div>
  )
}
