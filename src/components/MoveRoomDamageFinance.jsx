import { useEffect, useState } from 'react'
import axios from 'axios'
import RoomTransferFinance from './RoomTransferFinance.jsx'
import { formatContractMoney } from '../utils/rentalContract.js'
import { damageInputError, damageInputValue } from '../utils/damageCost.js'

export default function MoveRoomDamageFinance({ previewUrl, value, onChange, error = '', inputId = 'move-room-damage-cost', readOnly = false }) {
  const [state, setState] = useState({ preview: null, loading: true, error: '' })
  const inputError = damageInputError(value)
  const query = inputError ? null : damageInputValue(value) || '0'

  useEffect(() => {
    if (!previewUrl || query === null) return undefined
    let active = true
    const timer = setTimeout(() => {
      setState((current) => ({ ...current, loading: true }))
      axios
        .get(previewUrl, { params: { damage: query }, headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
        .then(({ data }) => {
          if (active) setState({ preview: data.preview, loading: false, error: '' })
        })
        .catch((err) => {
          if (active) {
            setState((current) => ({
              preview: current.preview,
              loading: false,
              error: err.response?.data?.message || 'คำนวณเงินมัดจำไม่สำเร็จ',
            }))
          }
        })
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [previewUrl, query])

  const preview = state.preview
  const depositLeft = preview?.deposit?.remaining
  const closed = preview && !['pending', 'in_progress'].includes(preview.request?.status)
  const overDeposit = !inputError && depositLeft != null && Number(query) > Number(depositLeft)
  const shownError = error || inputError || (overDeposit ? `ค่าเสียหายต้องไม่เกินเงินมัดจำคงเหลือ ${formatContractMoney(depositLeft)}` : '')

  return (
    <div className="mrdf">
      <div className="staff-form-field">
        <div className="staff-form-label-row">
          <label className="staff-form-label" htmlFor={inputId}>
            ค่าเสียหาย (หักจากเงินมัดจำ){' '}
            <span className="staff-form-optional">{readOnly ? '(คำนวณอัตโนมัติ)' : '(ไม่บังคับ)'}</span>
          </label>
          {depositLeft != null && (
            <span className="staff-form-counter mrdf-deposit-left">
              มัดจำคงเหลือ <strong>{formatContractMoney(depositLeft)}</strong>
            </span>
          )}
        </div>
        <div className={`mrdf-input${shownError ? ' is-invalid' : ''}${readOnly ? ' is-readonly' : ''}`}>
          <span className="mrdf-input-prefix" aria-hidden="true">฿</span>
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            value={readOnly ? Number(damageInputValue(value) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
            onChange={(event) => onChange?.(event.target.value.replace(/[^\d.,]/g, ''))}
            readOnly={readOnly}
            tabIndex={readOnly ? -1 : undefined}
            placeholder="0.00"
            aria-describedby={`${inputId}-hint`}
          />
          <span className="mrdf-input-suffix" aria-hidden="true">บาท</span>
        </div>
        {shownError ? (
          <span className="staff-form-field-error" id={`${inputId}-hint`}>{shownError}</span>
        ) : (
          <small className="mrdf-hint" id={`${inputId}-hint`}>
            {readOnly ? (
              <>
                <b>แก้ไขเองไม่ได้</b> ยอดรวมจากค่าเสียหายที่กรอกในหัวข้อตรวจสภาพห้องและอุปกรณ์/ทรัพย์สิน · หักจากเงินมัดจำห้องเดิมก่อนโอนเป็นมัดจำห้องใหม่
              </>
            ) : (
              <>
                <b>เว้นว่างได้</b> ถ้าไม่มีค่าเสียหาย · ยอดนี้หักจากเงินมัดจำห้องเดิมก่อนโอนเป็นมัดจำห้องใหม่ ไม่เกี่ยวกับค่าเช่า
              </>
            )}
          </small>
        )}
      </div>
      <div className="mrdf-preview" aria-live="polite">
        <div className="mrdf-preview-head">
          <strong>ผลต่อเงินมัดจำและยอดชำระ</strong>
          <small>{state.loading ? 'กำลังคำนวณ...' : 'ประมาณการ ยืนยันยอดจริงตอนย้ายห้องสำเร็จ'}</small>
        </div>
        {closed && <p className="mrdf-note">คำขอนี้ดำเนินการแล้ว การแก้ค่าเสียหายไม่เปลี่ยนยอดที่บันทึกไว้</p>}
        {state.error && <p className="staff-form-error">{state.error}</p>}
        {preview ? (
          <RoomTransferFinance
            finance={preview.settlement}
            fromPrice={preview.source_room?.price}
            toPrice={preview.target_room?.price}
            compact
          />
        ) : (
          !state.error && <p className="mrdf-note">กำลังโหลดข้อมูลเงินมัดจำ...</p>
        )}
      </div>
    </div>
  )
}
