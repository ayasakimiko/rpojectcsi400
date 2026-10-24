import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import InspectionCostInput from './InspectionCostInput.jsx'
import { MoveInCompareTag } from './MoveInBaseline.jsx'
import { chargeableAssetCost, COSTED_RESULTS, defaultAssetCost, RESULT_OPTIONS } from '../utils/inspectionChecklist.js'
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

function AssetPriceInput({ value, label, invalid, onChange }) {
  return (
    <label className={`asset-price-field${invalid ? ' is-invalid' : ''}`}>
      <b aria-hidden="true">฿</b>
      <input
        inputMode="decimal"
        value={value ?? ''}
        placeholder="0.00"
        aria-label={`ราคา ${label || 'ทรัพย์สิน'}`}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value)}
      />
      <em>บาท</em>
    </label>
  )
}

export default function MoveOutAssetCheck({ roomNumber, assets, onChange, invalidIndexes = [], recordOnly = false }) {
  const [source, setSource] = useState({ room: null, inspection: null, error: '' })
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (recordOnly || assets !== null || !roomNumber) return undefined
    let active = true
    axios
      .get(`/api/staff/move-out-inspections/move-in-baseline/${roomNumber}`, { headers: authHeaders() })
      .then(({ data }) => {
        if (!active) return
        setSource({ room: roomNumber, inspection: data.baseline, error: '' })
        const moveIn = new Map((data.baseline?.assets || []).map((asset) => [asset.name, asset]))
        const roomItems = data.room_assets.map((asset) => ({
          name: asset.name,
          price: moveIn.get(asset.name)?.price ?? asset.price,
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
  }, [roomNumber, assets, recordOnly])

  const current = source.room === roomNumber ? source : { inspection: null, error: '' }

  const update = (index, patch) => onChange(assets.map((asset, i) => (i === index ? { ...asset, ...patch } : asset)))

  const setResult = (index, value) => {
    const asset = assets[index]
    const result = asset.result === value ? '' : value
    if (recordOnly) update(index, { result })
    else update(index, { result, cost: COSTED_RESULTS.includes(result) ? defaultAssetCost({ ...asset, result }) : undefined })
  }

  if (!roomNumber) return <p className="move-out-assets-note">เลือกห้องก่อน ระบบจะดึงทรัพย์สินของห้องพร้อมราคา</p>
  if (assets === null) return <p className="move-out-assets-note">{current.error || 'กำลังโหลดทรัพย์สินของห้อง...'}</p>

  return (
    <div className="move-out-assets">
      <p className="move-out-assets-note">
        {recordOnly ? (
          'ราคาเริ่มจากที่ Admin กำหนด แก้ราคาได้ในช่อง ฿ · ราคานี้ใช้เป็นราคาอ้างอิงตอนตรวจย้ายออก · ผลตรวจเริ่มต้นเป็น “ปกติ”'
        ) : (
          <>
            อุปกรณ์ของห้องพร้อมราคา เริ่มต้นเป็น “ปกติ”
            {current.inspection ? ` · เทียบกับผลตรวจก่อนเข้าอยู่ ${formatDate(current.inspection.inspection_date)}` : ''}
            {' · '}ชำรุด/สูญหาย ใช้ราคาเป็นค่าเสียหายเริ่มต้น (แก้ได้)
          </>
        )}
      </p>
      {assets.length === 0 && <p className="move-out-assets-note">ห้องนี้ยังไม่มีรายการทรัพย์สิน กด “+ เพิ่มรายการ” เพื่อกรอกเอง</p>}
      {assets.map((asset, index) => {
        const invalid = invalidIndexes.includes(index)
        const costed = !recordOnly && COSTED_RESULTS.includes(asset.result)
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
                  <AssetPriceInput value={asset.price} label={asset.name} invalid={invalid} onChange={(price) => update(index, { price })} />
                </div>
              ) : recordOnly ? (
                <div className="move-in-asset-fields">
                  <span className="move-out-asset-name">{asset.name}</span>
                  <AssetPriceInput value={asset.price} label={asset.name} invalid={invalid} onChange={(price) => update(index, { price })} />
                </div>
              ) : (
                <span className="move-out-asset-name">
                  {asset.name} <b>{formatBaht(asset.price)}</b>
                  <MoveInCompareTag before={asset.move_in_result} after={asset.result} />
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
              <InspectionCostInput
                value={asset.cost}
                onChange={(cost) => update(index, { cost })}
                label={asset.name}
                tone={asset.result}
                hint={Number(asset.price) > 0 ? `ราคาทรัพย์สิน ${formatBaht(asset.price)}` : ''}
              />
            )}
            {invalid && (
              <small className="move-in-asset-error">
                {recordOnly ? 'กรุณาระบุชื่อ ราคา และผลตรวจให้ถูกต้อง' : 'กรุณาระบุชื่อ ราคา และค่าเสียหายให้ถูกต้อง'}
              </small>
            )}
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
        {recordOnly ? (
          <span>
            {assets.length} รายการ · มูลค่ารวม <strong>{formatBaht(assets.reduce((sum, asset) => sum + (Number(String(asset.price ?? '').replace(/,/g, '')) || 0), 0))}</strong>
          </span>
        ) : (
          <span>
            ค่าเสียหายทรัพย์สิน <strong>{formatBaht(chargeableAssetCost(assets))}</strong>
          </span>
        )}
      </div>
    </div>
  )
}
