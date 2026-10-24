import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { chargeableAssetCost, COSTED_RESULTS, defaultAssetCost, RESULT_LABELS, RESULT_OPTIONS } from '../utils/inspectionChecklist.js'
import './MoveInInspection.css'

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

function formatBaht(value) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Room assets shown under the furniture checklist row. Items come from the
// tenant's move-in inspection plus the room's asset list; staff mark each one
// and the damage amount starts at the asset price when it is chargeable.
// `assets` is null until the list has loaded.
export default function MoveOutAssetCheck({ roomNumber, assets, onChange, invalidIndexes = [] }) {
  const [source, setSource] = useState({ room: null, inspection: null, error: '' })
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (assets !== null || !roomNumber) return undefined
    let active = true
    axios
      .get(`/api/staff/move-out-inspections/move-in-baseline/${roomNumber}`, { headers: authHeaders() })
      .then(({ data }) => {
        if (!active) return
        setSource({ room: roomNumber, inspection: data.baseline, error: '' })
        // The room's current asset list (with prices) comes first, every item
        // starting as "ปกติ"; the move-in result is attached for comparison.
        // Items checked at move-in but no longer on the room list follow.
        const moveIn = new Map((data.baseline?.assets || []).map((asset) => [asset.name, asset]))
        const roomItems = data.room_assets.map((asset) => ({
          name: asset.name,
          price: asset.price,
          move_in_result: moveIn.get(asset.name)?.result ?? null,
          result: 'good',
        }))
        const roomNames = new Set(roomItems.map((asset) => asset.name))
        const moveInOnly = [...moveIn.values()]
          .filter((asset) => !roomNames.has(asset.name))
          .map((asset) => ({ name: asset.name, price: asset.price, move_in_result: asset.result, result: 'good' }))
        onChangeRef.current([...roomItems, ...moveInOnly])
      })
      .catch((error) => {
        if (active) setSource({ room: roomNumber, inspection: null, error: error.response?.data?.message || 'ไม่สามารถโหลดรายการทรัพย์สินได้' })
      })
    return () => {
      active = false
    }
  }, [roomNumber, assets])

  const current = source.room === roomNumber ? source : { inspection: null, error: '' }

  const update = (index, patch) => onChange(assets.map((asset, i) => (i === index ? { ...asset, ...patch } : asset)))

  const setResult = (index, value) => {
    const asset = assets[index]
    const result = asset.result === value ? '' : value
    update(index, { result, cost: COSTED_RESULTS.includes(result) ? defaultAssetCost({ ...asset, result }) : undefined })
  }

  if (!roomNumber) return <p className="move-out-assets-note">เลือกห้องก่อน ระบบจะดึงทรัพย์สินของห้องพร้อมราคา</p>
  if (assets === null) return <p className="move-out-assets-note">{current.error || 'กำลังโหลดทรัพย์สินของห้อง...'}</p>

  return (
    <div className="move-out-assets">
      <p className="move-out-assets-note">
        อุปกรณ์ของห้องพร้อมราคา เริ่มต้นเป็น “ปกติ”
        {current.inspection ? ` · เทียบกับผลตรวจก่อนเข้าอยู่ ${formatDate(current.inspection.inspection_date)}` : ''}
        {' · '}ชำรุด/สูญหาย ใช้ราคาเป็นค่าเสียหายเริ่มต้น (แก้ได้)
      </p>
      {assets.length === 0 && <p className="move-out-assets-note">ห้องนี้ยังไม่มีรายการทรัพย์สิน กด “+ เพิ่มรายการ” เพื่อกรอกเอง</p>}
      {assets.map((asset, index) => {
        const invalid = invalidIndexes.includes(index)
        const costed = COSTED_RESULTS.includes(asset.result)
        return (
          <div key={index} className={`move-out-asset${asset.result ? ` is-${asset.result}` : ''}${invalid ? ' is-invalid' : ''}`}>
            <div className="move-out-asset-head">
              {asset.manual ? (
                <div className="move-in-asset-fields">
                  <input
                    className="staff-form-input move-in-asset-name"
                    value={asset.name}
                    maxLength={100}
                    placeholder="ชื่อทรัพย์สิน"
                    aria-label="ชื่อทรัพย์สิน"
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                  <label className="move-in-asset-price">
                    <span>฿</span>
                    <input
                      className="staff-form-input"
                      inputMode="decimal"
                      value={asset.price}
                      placeholder="ราคา"
                      aria-label={`ราคา ${asset.name}`}
                      onChange={(event) => update(index, { price: event.target.value })}
                    />
                  </label>
                </div>
              ) : (
                <span className="move-out-asset-name">
                  {asset.name} <b>{formatBaht(asset.price)}</b>
                  <small>ตอนเข้าอยู่: {RESULT_LABELS[asset.move_in_result] || 'ไม่ได้ตรวจ'}</small>
                </span>
              )}
              <div className="move-in-asset-actions">
                <div className="inspection-choices" role="radiogroup" aria-label={asset.name || 'ทรัพย์สิน'}>
                  {RESULT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={asset.result === option.key}
                      title={option.title}
                      className={`inspection-choice is-${option.key}${asset.result === option.key ? ' is-selected' : ''}`}
                      onClick={() => setResult(index, option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {asset.manual && (
                  <button
                    type="button"
                    className="move-in-asset-remove"
                    aria-label={`ลบ ${asset.name || 'รายการ'}`}
                    title="ลบรายการ"
                    onClick={() => onChange(assets.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            {costed && (
              <label className="inspection-cost">
                <span>ค่าเสียหาย</span>
                <input
                  className="staff-form-input"
                  inputMode="decimal"
                  value={asset.cost ?? ''}
                  placeholder="0"
                  aria-label={`ค่าเสียหาย ${asset.name}`}
                  onChange={(event) => update(index, { cost: event.target.value })}
                />
                <em>บาท</em>
              </label>
            )}
            {invalid && <small className="move-in-asset-error">กรุณาระบุชื่อ ราคา และค่าเสียหายให้ถูกต้อง</small>}
          </div>
        )
      })}
      <div className="move-out-assets-footer">
        <button
          type="button"
          className="inspection-link-btn"
          onClick={() => onChange([...assets, { name: '', price: '', move_in_result: null, result: 'good', manual: true }])}
        >
          + เพิ่มรายการ
        </button>
        <span>
          ค่าเสียหายทรัพย์สิน <strong>{formatBaht(chargeableAssetCost(assets))}</strong>
        </span>
      </div>
    </div>
  )
}
