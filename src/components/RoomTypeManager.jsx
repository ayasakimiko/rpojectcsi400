import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import './RoomTypeManager.css'

function formatBaht(value) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const priceValue = (text) => Number(String(text ?? '').replace(/,/g, '').trim()) || 0

let assetRowId = 0
const assetRow = (asset = {}) => ({
  rowId: ++assetRowId,
  name: asset.name || '',
  price: asset.price === undefined || asset.price === null ? '' : String(asset.price),
})

const DEFAULT_ASSETS = [
  { name: 'เตียงและฟูก', price: 3000 },
  { name: 'ตู้เสื้อผ้า', price: 2500 },
  { name: 'โต๊ะและเก้าอี้', price: 1500 },
  { name: 'เครื่องปรับอากาศ', price: 12000 },
  { name: 'รีโมตแอร์', price: 300 },
  { name: 'กุญแจห้อง', price: 200 },
]

function RoomTypeForm({ initial, rooms, roomTypes, submitting, error, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [assets, setAssets] = useState(() => (initial ? initial.assets : DEFAULT_ASSETS).map(assetRow))
  const [roomNumbers, setRoomNumbers] = useState(() => new Set(initial?.room_numbers || []))
  const [localError, setLocalError] = useState('')

  const typeNameById = new Map(roomTypes.map((type) => [type.id, type.name]))
  const total = assets.reduce((sum, asset) => sum + priceValue(asset.price), 0)

  const updateAsset = (rowId, patch) => setAssets((current) => current.map((asset) => (asset.rowId === rowId ? { ...asset, ...patch } : asset)))

  const toggleRoom = (roomNumber) =>
    setRoomNumbers((current) => {
      const next = new Set(current)
      if (next.has(roomNumber)) next.delete(roomNumber)
      else next.add(roomNumber)
      return next
    })

  const submit = (event) => {
    event.preventDefault()
    if (!name.trim()) return setLocalError('กรุณาระบุชื่อประเภทห้อง')
    const names = new Set()
    for (const asset of assets) {
      const assetName = asset.name.trim()
      if (!assetName) return setLocalError('กรุณาระบุชื่อทรัพย์สินให้ครบทุกแถว')
      if (names.has(assetName)) return setLocalError(`รายการทรัพย์สิน "${assetName}" ซ้ำกัน`)
      names.add(assetName)
      if (!/^\d+(\.\d{1,2})?$/.test(String(asset.price).replace(/,/g, '').trim())) {
        return setLocalError(`ราคาของ "${assetName}" ต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง`)
      }
    }
    setLocalError('')
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      assets: assets.map((asset) => ({ name: asset.name.trim(), price: priceValue(asset.price) })),
      room_numbers: [...roomNumbers],
    })
  }

  const shownError = localError || error

  return (
    <form className="admin-room-form room-type-form" onSubmit={submit} noValidate>
      {shownError && <div className="alert alert-danger py-2 px-3">{shownError}</div>}

      <section className="admin-room-form-section">
        <header>
          <div>
            <strong>ข้อมูลประเภทห้อง</strong>
            <small>เช่น ห้องแอร์เตียงเดี่ยว ห้องพัดลม</small>
          </div>
        </header>
        <div className="admin-room-form-grid is-2">
          <label className="admin-room-field">
            <span>ชื่อประเภทห้อง</span>
            <input className="form-control" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="เช่น ห้องแอร์" />
          </label>
          <label className="admin-room-field">
            <span>
              รายละเอียด <small className="admin-room-optional">ไม่บังคับ</small>
            </span>
            <input className="form-control" value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="admin-room-form-section">
        <header>
          <div>
            <strong>ทรัพย์สินและราคากลาง</strong>
            <small>ราคานี้ใช้เป็นค่าเริ่มต้นตอน Staff ตรวจก่อนเข้าอยู่ (แก้เฉพาะห้องได้)</small>
          </div>
        </header>
        <div className="room-type-assets">
          {assets.map((asset) => (
            <div key={asset.rowId} className="room-type-asset">
              <input
                className="form-control"
                value={asset.name}
                maxLength={100}
                placeholder="ชื่อทรัพย์สิน"
                aria-label="ชื่อทรัพย์สิน"
                onChange={(event) => updateAsset(asset.rowId, { name: event.target.value })}
              />
              <div className="admin-room-input room-type-asset-price">
                <input
                  className="form-control"
                  inputMode="decimal"
                  value={asset.price}
                  placeholder="0.00"
                  aria-label={`ราคา ${asset.name}`}
                  onChange={(event) => updateAsset(asset.rowId, { price: event.target.value })}
                />
                <em>บาท</em>
              </div>
              <button
                type="button"
                className="room-type-asset-remove"
                aria-label={`ลบ ${asset.name || 'รายการ'}`}
                onClick={() => setAssets((current) => current.filter((item) => item.rowId !== asset.rowId))}
              >
                ×
              </button>
            </div>
          ))}
          <div className="room-type-assets-footer">
            <button type="button" className="admin-action-btn is-ghost" onClick={() => setAssets((current) => [...current, assetRow()])}>
              + เพิ่มทรัพย์สิน
            </button>
            <span>
              {assets.length} รายการ · มูลค่ารวม <strong>{formatBaht(total)}</strong>
            </span>
          </div>
        </div>
      </section>

      <section className="admin-room-form-section">
        <header>
          <div>
            <strong>ห้องที่ใช้ประเภทนี้</strong>
            <small>เลือกแล้ว {roomNumbers.size} ห้อง · ห้องที่อยู่ในประเภทอื่นจะถูกย้ายมาประเภทนี้</small>
          </div>
        </header>
        <div className="room-type-rooms">
          {rooms.length === 0 && <span className="room-type-muted">ยังไม่มีห้องในระบบ</span>}
          {rooms.map((room) => {
            const active = roomNumbers.has(room.room_number)
            const otherType = !active && room.room_type_id && room.room_type_id !== initial?.id ? typeNameById.get(room.room_type_id) : null
            return (
              <button
                key={room.room_number}
                type="button"
                className={`room-type-room${active ? ' is-active' : ''}`}
                aria-pressed={active}
                title={otherType ? `ปัจจุบันเป็นประเภท ${otherType}` : undefined}
                onClick={() => toggleRoom(room.room_number)}
              >
                {room.room_number}
                {otherType && <small>{otherType}</small>}
              </button>
            )
          })}
        </div>
      </section>

      <div className="admin-form-actions">
        <button type="button" className="admin-action-btn is-ghost" onClick={onCancel} disabled={submitting}>
          ยกเลิก
        </button>
        <button type="submit" className="admin-action-btn is-primary" disabled={submitting}>
          {submitting ? 'กำลังบันทึก...' : initial ? 'บันทึกการแก้ไข' : 'เพิ่มประเภทห้อง'}
        </button>
      </div>
    </form>
  )
}

export default function RoomTypeManager({ Modal, rooms, onRoomsChanged }) {
  const [roomTypes, setRoomTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const load = useCallback(
    () =>
      axios
        .get('/api/admin/room-types')
        .then(({ data }) => {
          setRoomTypes(data.roomTypes)
          setListError('')
        })
        .catch((error) => setListError(error.response?.data?.message || 'ไม่สามารถโหลดประเภทห้องได้'))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const untypedRooms = rooms.filter((room) => !room.room_type_id).length

  const afterChange = (message, requestClose) => {
    setNotice(message)
    requestClose()
    load()
    onRoomsChanged?.()
  }

  const save = async (payload, requestClose) => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data } = editing.type
        ? await axios.put(`/api/admin/room-types/${editing.type.id}`, payload)
        : await axios.post('/api/admin/room-types', payload)
      afterChange(data.message, requestClose)
    } catch (error) {
      setSubmitError(error.response?.data?.message || 'ไม่สามารถบันทึกประเภทห้องได้')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (requestClose) => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data } = await axios.delete(`/api/admin/room-types/${deleting.id}`)
      afterChange(data.message, requestClose)
    } catch (error) {
      setSubmitError(error.response?.data?.message || 'ไม่สามารถลบประเภทห้องได้')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header room-type-header">
        <div>
          <h2>ประเภทห้องและทรัพย์สิน</h2>
          <p className="room-type-muted">
            กำหนดรายการทรัพย์สินและราคากลางของแต่ละประเภทห้อง ใช้ตอน Staff ตรวจห้องก่อนผู้เช่าเข้าอยู่
            {untypedRooms > 0 && <strong className="room-type-warning"> · ยังไม่กำหนดประเภท {untypedRooms} ห้อง</strong>}
          </p>
        </div>
        <button
          type="button"
          className="admin-action-btn is-primary"
          onClick={() => {
            setSubmitError('')
            setEditing({ type: null })
          }}
        >
          + เพิ่มประเภทห้อง
        </button>
      </div>

      {notice && <div className="alert alert-success py-2 px-3">{notice}</div>}
      {listError && <div className="alert alert-danger">{listError}</div>}

      {roomTypes.length === 0 ? (
        <p className="room-type-empty">{loading ? 'กำลังโหลด...' : 'ยังไม่มีประเภทห้อง กด “+ เพิ่มประเภทห้อง” เพื่อเริ่ม'}</p>
      ) : (
        <div className="room-type-grid">
          {roomTypes.map((type) => {
            const total = type.assets.reduce((sum, asset) => sum + Number(asset.price || 0), 0)
            return (
              <article key={type.id} className="room-type-card">
                <header>
                  <div>
                    <h3>{type.name}</h3>
                    {type.description && <p>{type.description}</p>}
                  </div>
                  <span className="room-type-total">{formatBaht(total)}</span>
                </header>
                <ul className="room-type-asset-list">
                  {type.assets.map((asset) => (
                    <li key={asset.name}>
                      <span>{asset.name}</span>
                      <span>{formatBaht(asset.price)}</span>
                    </li>
                  ))}
                  {type.assets.length === 0 && <li className="room-type-muted">ยังไม่มีรายการทรัพย์สิน</li>}
                </ul>
                <p className="room-type-card-rooms">
                  {type.room_numbers.length > 0 ? `ห้อง ${type.room_numbers.join(', ')}` : 'ยังไม่มีห้องที่ใช้ประเภทนี้'}
                </p>
                <div className="room-type-card-actions">
                  <button
                    type="button"
                    className="admin-action-btn is-ghost"
                    onClick={() => {
                      setSubmitError('')
                      setEditing({ type })
                    }}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="admin-action-btn is-danger"
                    onClick={() => {
                      setSubmitError('')
                      setDeleting(type)
                    }}
                  >
                    ลบ
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing.type ? `แก้ไขประเภทห้อง ${editing.type.name}` : 'เพิ่มประเภทห้อง'} onClose={() => setEditing(null)}>
          {(requestClose) => (
            <RoomTypeForm
              initial={editing.type}
              rooms={rooms}
              roomTypes={roomTypes}
              submitting={submitting}
              error={submitError}
              onSubmit={(payload) => save(payload, requestClose)}
              onCancel={requestClose}
            />
          )}
        </Modal>
      )}

      {deleting && (
        <Modal title="ลบประเภทห้อง" onClose={() => setDeleting(null)} variant="confirm">
          {(requestClose) => (
            <div className="admin-confirm-body">
              <p className="admin-confirm-message">ลบประเภทห้อง “{deleting.name}” ?</p>
              <p className="room-type-muted">
                ห้องที่ใช้ประเภทนี้ ({deleting.room_numbers.length} ห้อง) จะกลายเป็นไม่ระบุประเภท ผลตรวจที่บันทึกไว้แล้วไม่เปลี่ยน
              </p>
              {submitError && <div className="alert alert-danger py-2 px-3">{submitError}</div>}
              <div className="admin-form-actions">
                <button type="button" className="admin-action-btn is-ghost" onClick={requestClose} disabled={submitting}>
                  ยกเลิก
                </button>
                <button type="button" className="admin-action-btn is-danger" onClick={() => remove(requestClose)} disabled={submitting}>
                  {submitting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
