import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { UploadImage } from './UploadMedia.jsx'
import PhotoLightbox from './PhotoLightbox.jsx'
import ThaiDatePicker from './ThaiDatePicker.jsx'
import './RentalContract.css'
import {
  addContractMonths,
  CONTRACT_MAX_IMAGES,
  CONTRACT_MIN_IMAGES,
  formatContractDate,
  formatContractLength,
  formatContractMoney,
  formatDepositMonths,
  formatDepositSummary,
  DEPOSIT_STATUS_LABEL,
} from '../utils/rentalContract.js'

const CONTRACT_STATUS = {
  active: { label: 'สัญญามีผล', tone: 'active' },
  awaiting_payment: { label: 'รอชำระงวดแรก', tone: 'unpaid' },
  payment_review: { label: 'รอตรวจสลิปงวดแรก', tone: 'warning' },
  upcoming: { label: 'ยังไม่เริ่มสัญญา', tone: 'info' },
  expired: { label: 'หมดอายุสัญญา', tone: 'warning' },
  ended: { label: 'สิ้นสุดการเช่า', tone: 'muted' },
  ended_early: { label: 'ออกก่อนสัญญา', tone: 'unpaid' },
}

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

function ContractIcon({ type, size = 16 }) {
  const paths = {
    file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.7L8.7 10.5a16 16 0 0 0 4.8 4.8l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.5a2 2 0 0 1 1.7 2Z" />,
    check: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="m9 14 2 2 4-4" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  )
}

function ContractLightbox({ images, index, title, subtitle, onClose }) {
  return createPortal(
    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <PhotoLightbox photos={images} initialIndex={index} title={title} subtitle={subtitle} label="รูปสัญญาเช่า" onClose={onClose} />
    </div>,
    document.body,
  )
}

function remainingRentMonthsLabel(contract) {
  const price = Number(contract?.monthly_price) || 0
  const remaining = Number(contract?.contract_remaining) || 0
  if (price <= 0) return ''
  const months = Math.ceil(Math.round((remaining / price) * 100) / 100)
  return ` (${months} เดือน)`
}

export function ContractMonthTrack({ start, end, originalEnd, now }) {
  const startDate = start ? new Date(start) : null
  const endDate = end ? new Date(end) : null
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return null
  const renewFrom = originalEnd ? new Date(originalEnd) : null
  const periods = []
  for (let index = 0; index < 120; index += 1) {
    const periodStart = addContractMonths(startDate, index)
    if (periodStart >= endDate) break
    periods.push({ index, periodStart, renewed: Boolean(renewFrom && periodStart >= renewFrom && renewFrom < endDate) })
  }
  if (periods.length === 0) return null
  const daysLeft = Math.ceil((endDate.getTime() - now) / 86400000)
  const tone = daysLeft < 0 ? 'danger' : daysLeft <= 30 ? 'warning' : 'success'
  const leftLabel = daysLeft < 0 ? `หมดสัญญาแล้ว ${Math.abs(daysLeft)} วัน` : daysLeft === 0 ? 'ครบสัญญาวันนี้' : `เหลืออีก ${daysLeft} วัน`
  const elapsed = periods.filter((period) => period.periodStart.getTime() <= now).length
  const current = Math.min(periods.length, Math.max(1, elapsed))
  const finished = now >= endDate.getTime()
  return (
    <div className={`contract-months is-${tone}`}>
      <div className="contract-months-head">
        <div>
          <small>รอบบิล</small>
          <strong>
            {finished ? `ครบ ${periods.length}` : `เดือนที่ ${current}`}
            <span> / {periods.length} เดือน</span>
          </strong>
        </div>
        <span className="contract-months-left">{leftLabel}</span>
      </div>
      <ol className="contract-months-track" aria-label={`รอบบิลเดือนที่ ${current} จาก ${periods.length}`}>
        {periods.map((period) => {
          const state = finished || period.index < current - 1 ? 'is-done' : period.index === current - 1 ? 'is-current' : 'is-next'
          return (
            <li
              key={period.index}
              className={`${state}${period.renewed ? ' is-renewed' : ''}`}
              title={`เดือนที่ ${period.index + 1} · ${period.periodStart.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}${period.renewed ? ' · ช่วงต่อสัญญา' : ''}`}
            >
              <span>{period.periodStart.toLocaleDateString('th-TH', { month: 'short' })}</span>
            </li>
          )
        })}
      </ol>
      <div className="contract-months-legend">
        <span className="is-done">ผ่านแล้ว</span>
        <span className="is-current">เดือนนี้</span>
        <span className="is-next">ที่เหลือ</span>
        {periods.some((period) => period.renewed) && <span className="is-renewed">ช่วงต่อสัญญา</span>}
      </div>
    </div>
  )
}

export function ContractStatusBadge({ status }) {
  const info = CONTRACT_STATUS[status] || CONTRACT_STATUS.active
  return <span className={`contract-status is-${info.tone}`}>{info.label}</span>
}

export function ContractFirstPaymentNote({ contract, viewer = 'staff' }) {
  if (!contract || !['awaiting_payment', 'payment_review'].includes(contract.status)) return null
  const review = contract.status === 'payment_review'
  const amount = formatContractMoney(contract.first_month_total)
  const detail = Number(contract.deposit_amount) > 0
    ? `ค่าห้อง ${formatContractMoney(contract.first_month_amount)} + มัดจำ ${formatContractMoney(contract.deposit_amount)}`
    : `ค่าห้อง ${formatContractMoney(contract.first_month_amount)}`
  return (
    <div className={`contract-first-payment-note${review ? ' is-review' : ''}`} role="status">
      <ContractIcon type="wallet" size={18} />
      <span>
        <strong>{review ? 'ส่งสลิปงวดแรกแล้ว รอเจ้าหน้าที่ตรวจสอบ' : 'สัญญายังไม่มีผล'}</strong>
        {review
          ? `สัญญาจะมีผลเมื่ออนุมัติสลิปงวดแรก ${amount} (${detail})`
          : viewer === 'customer'
            ? `กรุณาชำระงวดแรก ${amount} (${detail}) ผ่านระบบหรือที่เจ้าหน้าที่ สัญญาจะมีผลหลังชำระครบ`
            : `สัญญาจะมีผลเมื่อผู้เช่าชำระงวดแรก ${amount} (${detail}) หรือเจ้าหน้าที่เก็บเงินแล้ว`}
      </span>
    </div>
  )
}

export function ContractGallery({ images = [], title = 'รูปสัญญาเช่า', subtitle }) {
  const [openIndex, setOpenIndex] = useState(null)
  if (images.length === 0) {
    return (
      <div className="contract-gallery-empty">
        <ContractIcon type="image" size={22} />
        <strong>ไม่มีรูปสัญญาเช่า</strong>
        <span>สัญญาที่ลงทะเบียนก่อนเปิดใช้ระบบแนบรูปจะไม่มีรูปสัญญาในระบบ</span>
      </div>
    )
  }
  return (
    <>
      <ul className="contract-gallery" aria-label={title}>
        {images.map((image, index) => (
          <li key={image.url}>
            <button
              type="button"
              className="contract-gallery-item"
              onClick={(event) => {
                event.stopPropagation()
                setOpenIndex(index)
              }}
              aria-label={`ดูรูปสัญญาเช่า ${index + 1} จาก ${images.length}`}
            >
              <UploadImage src={image.url} alt="" loading="lazy" />
              <span className="contract-gallery-index">{index + 1}</span>
            </button>
          </li>
        ))}
      </ul>
      {openIndex !== null && (
        <ContractLightbox images={images} index={openIndex} title={title} subtitle={subtitle} onClose={() => setOpenIndex(null)} />
      )}
    </>
  )
}

export function ContractFacts({ contract }) {
  const facts = [
    { label: 'ระยะเวลาสัญญา', value: formatContractLength(contract) },
    { label: 'วันเริ่มสัญญา', value: formatContractDate(contract.rental_start_date, true) },
    { label: 'วันสิ้นสุดสัญญา', value: formatContractDate(contract.rental_end_date, true) },
    ...(contract.current_end_date && new Date(contract.current_end_date).getTime() !== new Date(contract.rental_end_date).getTime()
      ? [{ label: 'สัญญาปัจจุบันถึง', value: formatContractDate(contract.current_end_date, true), hint: 'รวมการต่อสัญญา/ย้ายห้อง' }]
      : []),
    { label: 'ค่าเช่าห้องต่อเดือน', value: formatContractMoney(contract.monthly_price) },
    { label: 'เงินมัดจำ', value: formatDepositSummary(contract) },
    {
      label: 'ทำสัญญาสำเร็จเมื่อ',
      value: contract.contract_completed_at ? formatContractDate(contract.contract_completed_at, true) : formatContractDate(contract.created_at, true),
    },
  ]
  return (
    <dl className="contract-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>
            {fact.value}
            {fact.hint && <small>{fact.hint}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ContractFirstMonth({ contract }) {
  return (
    <div className="contract-first-month" aria-label="การคำนวณค่าเช่าเดือนแรก">
      <div>
        <span>ค่าเช่าเดือนแรก</span>
        <strong>{formatContractMoney(contract.first_month_amount)}</strong>
      </div>
      <div>
        <span>เงินมัดจำ ({formatDepositMonths(contract)})</span>
        <strong>+ {formatContractMoney(contract.deposit_amount || 0)}</strong>
      </div>
      <div className="is-total">
        <span>รวมชำระเดือนแรก</span>
        <strong>{formatContractMoney(contract.first_month_total)}</strong>
      </div>
      <p>
        เดือนแรกชำระค่าห้องพร้อมเงินมัดจำ เดือนถัดไปชำระเฉพาะค่าห้อง
        {DEPOSIT_STATUS_LABEL[contract.deposit_status] ? ` · มัดจำ${DEPOSIT_STATUS_LABEL[contract.deposit_status]}` : ''}
      </p>
    </div>
  )
}

export function ContractDetail({ contract, showPerson = false, onDepositSettled }) {
  const [now] = useState(() => Date.now())
  if (!contract) {
    return (
      <div className="contract-gallery-empty">
        <ContractIcon type="file" size={22} />
        <strong>ยังไม่มีข้อมูลสัญญาเช่า</strong>
      </div>
    )
  }
  const name = `${contract.first_name || ''} ${contract.last_name || ''}`.trim()
  return (
    <div className="contract-detail">
      <div className="contract-detail-head">
        <span className="contract-detail-icon"><ContractIcon type="file" size={18} /></span>
        <div>
          <strong>{showPerson && name ? name : 'สัญญาเช่า'}</strong>
          <small>ห้อง {contract.room_number || '-'} · {formatContractLength(contract)}</small>
        </div>
        <ContractStatusBadge status={contract.status} />
      </div>
      {!contract.is_archived && <ContractFirstPaymentNote contract={contract} />}
      {onDepositSettled && contract.can_settle_deposit ? (
        <DepositSettlementForm contract={contract} onSaved={onDepositSettled} />
      ) : (
        <DepositRefundNote contract={contract} />
      )}
      {!contract.is_archived && (
        <ContractMonthTrack
          start={contract.rental_start_date}
          end={contract.effective_end_date || contract.current_end_date || contract.rental_end_date}
          originalEnd={
            contract.current_end_date && new Date(contract.current_end_date).getTime() !== new Date(contract.rental_end_date).getTime()
              ? contract.rental_end_date
              : null
          }
          now={now}
        />
      )}
      <ContractFacts contract={contract} />
      <ContractTransferHistory contract={contract} />
      <ContractFirstMonth contract={contract} />
      <section className="contract-detail-images">
        <header>
          <ContractIcon type="image" size={15} />
          <strong>รูปสัญญาเช่า</strong>
          <span>{contract.image_count || 0} รูป</span>
        </header>
        <ContractGallery images={contract.images || []} subtitle={`ห้อง ${contract.room_number || '-'}${name ? ` · ${name}` : ''}`} />
      </section>
    </div>
  )
}

export function ContractCell({ contract }) {
  if (!contract) return <span className="contract-cell-empty">-</span>
  const start = contract.rental_start_date ? new Date(contract.rental_start_date) : null
  const endValue = contract.effective_end_date || contract.current_end_date || contract.rental_end_date
  const end = endValue ? new Date(endValue) : null
  const extended = Boolean(end && contract.rental_end_date && end.getTime() > new Date(contract.rental_end_date).getTime())
  const totalMonths = extended && start
    ? Math.max(1, Math.round((end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()))
    : null
  const hasDeposit = Number(contract.deposit_amount) > 0
  const depositState = contract.deposit_settlement
    ? contract.deposit_settlement === 'refunded'
      ? { label: 'คืนแล้ว', tone: 'paid' }
      : { label: 'ริบแล้ว', tone: 'muted' }
    : contract.deposit_refund === 'forfeit'
    ? { label: 'ริบ', tone: 'due' }
    : contract.deposit_refund === 'refund'
      ? { label: 'ต้องคืน', tone: 'pending' }
      : DEPOSIT_STATUS_LABEL[contract.deposit_status]
        ? { label: DEPOSIT_STATUS_LABEL[contract.deposit_status], tone: contract.deposit_status }
        : null
  return (
    <div className="contract-cell">
      <div className="contract-cell-text">
        <strong>
          {formatContractMoney(contract.monthly_price)} · {totalMonths ? `${totalMonths} เดือน` : formatContractLength(contract)}
          {extended && <em className="contract-cell-tag">ต่อแล้ว</em>}
        </strong>
        <small>
          {hasDeposit ? <>มัดจำ <b>{formatContractMoney(contract.deposit_amount)}</b></> : 'ไม่มีมัดจำ'}
          {hasDeposit && depositState && <i className={`contract-cell-deposit is-${depositState.tone}`}> · {depositState.label}</i>}
        </small>
      </div>
      <ContractThumb contract={contract} />
    </div>
  )
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

export function ContractImagePicker({ files, onChange, error, min = CONTRACT_MIN_IMAGES }) {
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files])
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews])
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const inputRef = useRef(null)
  const full = files.length >= CONTRACT_MAX_IMAGES
  const remaining = Math.max(0, min - files.length)
  const progress = Math.min(100, (files.length / min) * 100)

  const addFiles = (selected) => {
    if (selected.length) onChange([...files, ...selected])
  }
  const replaceFile = (index, event) => {
    const [file] = event.target.files || []
    event.target.value = ''
    if (file) onChange(files.map((item, itemIndex) => (itemIndex === index ? file : item)))
  }
  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files')
  const dragHandlers = {
    onDragEnter: (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    },
    onDragOver: (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = full ? 'none' : 'copy'
    },
    onDragLeave: (event) => {
      if (!hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (!full) addFiles([...(event.dataTransfer.files || [])])
    },
  }

  return (
    <div className={`contract-picker${error ? ' is-invalid' : ''}${dragging ? ' is-dragging' : ''}`} {...dragHandlers}>
      <div className="contract-picker-head">
        <div className="contract-picker-progress">
          <span>
            <strong>{files.length}</strong>/{CONTRACT_MAX_IMAGES} รูป
            <em className={remaining > 0 ? 'is-pending' : 'is-done'}>{remaining > 0 ? `ขาดอีก ${remaining}` : 'ครบขั้นต่ำ'}</em>
          </span>
          <i aria-hidden="true"><b style={{ width: `${progress}%` }} /></i>
        </div>
        <button type="button" className="contract-picker-add" disabled={full} onClick={() => inputRef.current?.click()}>
          + เพิ่มรูป
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            const selected = [...(event.target.files || [])]
            event.target.value = ''
            addFiles(selected)
          }}
        />
      </div>
      <div className="contract-picker-body">
        {previews.length > 0 ? (
          <ul className="contract-gallery contract-picker-grid">
            {previews.map((preview, index) => (
              <li key={preview.url}>
                <div className="contract-gallery-item is-static">
                  <img src={preview.url} alt={`รูปสัญญาเช่า ${index + 1}`} />
                  <span className="contract-gallery-index">{index + 1}</span>
                </div>
                <div className="contract-picker-actions">
                  <label>
                    เปลี่ยน
                    <input type="file" accept={IMAGE_ACCEPT} hidden onChange={(event) => replaceFile(index, event)} />
                  </label>
                  <button type="button" onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}>
                    ลบ
                  </button>
                </div>
              </li>
            ))}
            {!full && (
              <li>
                <button type="button" className="contract-picker-tile" onClick={() => inputRef.current?.click()}>
                  <span>+</span>
                  เพิ่มรูป
                </button>
              </li>
            )}
          </ul>
        ) : (
          <button type="button" className="contract-picker-drop" onClick={() => inputRef.current?.click()}>
            <ContractIcon type="image" size={26} />
            <strong>ลากรูปมาวาง หรือคลิกเพื่อเลือก</strong>
            <span>อย่างน้อย {min} รูป · JPG, PNG, WebP · ไม่เกิน 5 MB/รูป</span>
          </button>
        )}
      </div>
      {dragging && (
        <div className="contract-picker-overlay" aria-hidden="true">
          <ContractIcon type="image" size={28} />
          <strong>{full ? `แนบครบ ${CONTRACT_MAX_IMAGES} รูปแล้ว` : 'ปล่อยเพื่อเพิ่มรูปสัญญา'}</strong>
        </div>
      )}
      {error && <div className="contract-picker-error">{error}</div>}
    </div>
  )
}

const STAFF_CARD_STATUS = {
  active: { label: 'สัญญามีผล', tone: 'is-active' },
  transferred: { label: 'ย้ายห้องแล้ว', tone: 'is-transferred' },
  awaiting_payment: { label: 'รอชำระงวดแรก', tone: 'is-unpaid' },
  payment_review: { label: 'รอตรวจสลิปงวดแรก', tone: 'is-warning' },
  upcoming: { label: 'ยังไม่เริ่ม', tone: 'is-info' },
  expired: { label: 'หมดอายุ', tone: 'is-warning' },
  ended: { label: 'สิ้นสุดการเช่า', tone: 'is-muted' },
  ended_early: { label: 'ออกก่อนสัญญา', tone: 'is-unpaid' },
}
const STAFF_CARD_PHOTOS = 4

export function DepositEarlyLeaveWarning({ contract }) {
  if (!contract || !(Number(contract.deposit_amount) > 0)) return null
  if (['ended', 'ended_early', 'expired'].includes(contract.status)) return null
  const endValue = contract.current_end_date || contract.rental_end_date
  return (
    <div className="contract-refund-note is-warning" role="note">
      <ContractIcon type="wallet" size={18} />
      <span>
        <strong>ย้ายออกก่อนสัญญาหมด จะไม่ได้รับเงินมัดจำคืน</strong>
        <small>
          เงินมัดจำ {formatContractMoney(contract.deposit_amount)} ({formatDepositMonths(contract)}) จะคืนให้เมื่อพักอยู่ครบสัญญาถึง {formatContractDate(endValue)}
          {' '}หากย้ายออกก่อนวันดังกล่าว ทางหอพักจะไม่คืนเงินมัดจำ
        </small>
      </span>
    </div>
  )
}

function SettledDepositNote({ contract, viewer, compact }) {
  const refunded = contract.deposit_settlement === 'refunded'
  const deduction = Number(contract.deposit_deduction) || 0
  const title = refunded
    ? viewer === 'customer'
      ? `ได้รับเงินมัดจำคืนแล้ว ${formatContractMoney(contract.deposit_refunded_amount)}`
      : `คืนเงินมัดจำแล้ว ${formatContractMoney(contract.deposit_refunded_amount)}`
    : `ริบเงินมัดจำแล้ว ${formatContractMoney(contract.deposit_remaining ?? contract.deposit_paid)}`
  if (!compact) {
    return (
      <div className={`contract-refund-note ${refunded ? 'is-refund' : 'is-forfeit'} is-settled is-detailed`} role="note">
        <ContractIcon type="check" size={16} />
        <div className="settled-deposit-body">
          <div className="settled-deposit-head">
            <strong>{title}</strong>
            {viewer !== 'customer' && contract.booking_id && <DepositLogLink contract={contract} />}
          </div>
          <div className="settled-deposit-meta">
            {refunded && deduction > 0 && <span>หักค่าเสียหาย {formatContractMoney(deduction)}</span>}
            {contract.deposit_settlement_note && (
              <span className="is-reason">
                {refunded ? 'หมายเหตุ' : 'เหตุผล'}: {contract.deposit_settlement_note}
              </span>
            )}
            <span className="is-staff">
              <ContractIcon type="user" size={12} />
              {contract.deposit_settled_by_name || '-'}
            </span>
            <span className="is-date">
              <ContractIcon type="calendar" size={12} />
              {formatContractDate(contract.deposit_settled_at)}
            </span>
          </div>
        </div>
      </div>
    )
  }
  const parts = [
    refunded && deduction > 0 ? `หักค่าเสียหาย ${formatContractMoney(deduction)}` : null,
    `${contract.deposit_settled_by_name || '-'} · ${formatContractDate(contract.deposit_settled_at)}`,
  ].filter(Boolean)
  return (
    <span className={`contract-refund-note ${refunded ? 'is-refund' : 'is-forfeit'} is-settled${compact ? ' is-compact' : ''}`} role="note">
      <ContractIcon type="check" size={compact ? 14 : 18} />
      <span>
        <strong>{title}</strong>
        <small>{parts.join(' · ')}</small>
      </span>
    </span>
  )
}

export function DepositRefundNote({ contract, viewer = 'staff', compact = false }) {
  if (contract?.deposit_settlement) return <SettledDepositNote contract={contract} viewer={viewer} compact={compact} />
  if (!contract?.deposit_refund) return null
  const amount = formatContractMoney(contract.deposit_remaining ?? contract.deposit_paid)
  const refund = contract.deposit_refund === 'refund'
  const pendingTask = viewer !== 'customer' && contract.can_settle_deposit
  const title = refund
    ? viewer === 'customer' ? `รอรับเงินมัดจำคืน ${amount}` : `ต้องคืนเงินมัดจำ ${amount}`
    : pendingTask ? `ต้องบันทึกริบเงินมัดจำ ${amount}` : 'ไม่ต้องคืนเงินมัดจำ'
  const detail = refund
    ? contract.status === 'expired'
      ? compact ? 'ครบสัญญา พักอยู่ตามกำหนด' : 'สัญญาครบกำหนดแล้วและผู้เช่าพักอยู่ตามกำหนด'
      : compact ? 'พักอยู่ครบตามสัญญา' : 'ผู้เช่าพักอยู่ครบตามสัญญา'
    : pendingTask
      ? compact ? 'ออกก่อนสัญญา · ยังไม่ได้บันทึก' : 'ผู้เช่าออกก่อนสัญญาสิ้นสุด · ยังไม่ได้บันทึกการริบเงินมัดจำ'
      : compact ? `ออกก่อนสัญญา · ริบมัดจำ ${amount}` : `ผู้เช่าออกก่อนสัญญาสิ้นสุด · ริบเงินมัดจำ ${amount}`
  return (
    <span className={`contract-refund-note ${refund ? 'is-refund' : 'is-forfeit'}${pendingTask ? ' is-pending-task' : ''}${compact ? ' is-compact' : ''}`} role="note">
      <ContractIcon type="wallet" size={compact ? 14 : 18} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </span>
  )
}

function contractPeriodPosition(contract, now) {
  const periods = Math.max(1, Number(contract.billing_periods) || 1)
  const start = contract.rental_start_date ? new Date(contract.rental_start_date) : null
  const today = new Date(now)
  const elapsed = start
    ? (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth() - (today.getDate() < start.getDate() ? 1 : 0)
    : 0
  return { periods, currentPeriod: Math.min(periods, Math.max(0, elapsed)) }
}

function ContractPeriodTimeline({ contract, now, endLabel = 'สิ้นสุด', endValue }) {
  const { daysLeft } = contractTimeline(contract, now)
  const { periods, currentPeriod } = contractPeriodPosition(contract, now)
  const left = ['ended', 'ended_early'].includes(contract.status)
  const leftAt = contract.moved_out_at ? new Date(contract.moved_out_at) : null
  const endAt = contract.rental_end_date ? new Date(contract.rental_end_date) : null
  const earlyDays = contract.status === 'ended_early' && endAt
    ? Math.max(0, Math.ceil((endAt - (leftAt ?? new Date(now))) / 86400000))
    : 0
  return (
    <>
      <span className="csc-period-row">
        <span className="csc-date">
          <small>เริ่มสัญญา</small>
          <b>{formatContractDate(contract.rental_start_date)}</b>
        </span>
        <span className="csc-period-line" aria-hidden="true">
          <em>{formatContractLength(contract)}</em>
        </span>
        <span className="csc-date is-end">
          <small>{endLabel}</small>
          <b>{formatContractDate(endValue ?? contract.rental_end_date)}</b>
        </span>
      </span>
      {left ? (
        <span className="csc-period-meta">
          <small>{leftAt ? `ออกเมื่อ ${formatContractDate(leftAt)}` : 'ไม่ได้พักอยู่แล้ว'}</small>
          <small className={earlyDays > 0 ? 'is-danger' : ''}>
            {earlyDays > 0 ? `ออกก่อนครบ ${earlyDays} วัน` : 'สิ้นสุดการเช่า'}
          </small>
        </span>
      ) : (
        <span className="csc-period-meta">
          <small>{currentPeriod >= periods ? `ครบ ${periods} รอบบิล` : `เดือนที่ ${currentPeriod + 1}/${periods}`}</small>
          <small className={daysLeft !== null && daysLeft <= 30 ? 'is-warning' : ''}>
            {daysLeft > 0 ? `เหลือ ${daysLeft} วัน` : formatDaysLeft(daysLeft)}
          </small>
        </span>
      )}
    </>
  )
}

export function ArchivedContractBadge({ contract }) {
  return (
    <>
      <span className="contract-archived-badge" title="สัญญานี้สิ้นสุดแล้ว เก็บไว้เป็นประวัติ">
        สัญญาเก่า
      </span>
      {contract.has_newer_contract && (
        <span className="contract-newer-badge" title="ผู้เช่าคนนี้ทำสัญญาใหม่แล้ว สัญญานี้เก็บไว้เป็นประวัติ">
          มีสัญญาใหม่แล้ว
        </span>
      )}
    </>
  )
}

const contractTransfers = (contract) => contract?.room_transfers ?? []

const contractCardStatus = (contract) =>
  !contract.is_archived && contractTransfers(contract).length > 0 ? 'transferred' : contract.status

export function ContractRoomBadge({ contract, size = 'card' }) {
  const moved = contractTransfers(contract).length > 0
  const roomNumber = (size === 'hero' ? contract.current_room_number : null) || contract.room_number || '-'
  return size === 'hero' ? (
    <div className={`ccc-room${moved ? ' is-moved' : ''}`}>
      <span>ห้อง</span>
      <strong>{roomNumber}</strong>
    </div>
  ) : (
    <span className={`csc-room${moved ? ' is-moved' : ''}`}>
      <small>ห้อง</small>
      <strong>{roomNumber}</strong>
    </span>
  )
}

function ContractTransferSummary({ contract }) {
  const transfers = contractTransfers(contract)
  if (transfers.length === 0) return null
  const last = transfers.at(-1)
  const fromPrice = Number(last.from_price)
  const toPrice = Number(last.to_price)
  return (
    <span className="csc-transfer-route" title={`ย้ายล่าสุด ${formatContractDate(last.transferred_at)}`}>
      <span>
        ย้ายจาก <b>{last.from_room_number}</b>
      </span>
      <span className={fromPrice === toPrice ? 'is-same' : toPrice > fromPrice ? 'is-up' : 'is-down'}>
        {fromPrice === toPrice
          ? 'ค่าเช่าเท่าเดิม'
          : `${toPrice > fromPrice ? '▲' : '▼'} ${formatContractMoney(toPrice)}`}
      </span>
      {transfers.length > 1 && <span className="is-count">ย้ายแล้ว {transfers.length} ครั้ง</span>}
    </span>
  )
}

function StaffContractCard({ contract, onOpen }) {
  const [openIndex, setOpenIndex] = useState(null)
  const [now] = useState(() => Date.now())
  const images = contract.images || []
  const cardStatus = contractCardStatus(contract)
  const status = STAFF_CARD_STATUS[cardStatus] || STAFF_CARD_STATUS.active
  const underlying = cardStatus === 'transferred' && contract.status !== 'active' ? STAFF_CARD_STATUS[contract.status] : null
  const tenantName = `${contract.first_name || ''} ${contract.last_name || ''}`.trim() || '-'
  const extra = images.length - STAFF_CARD_PHOTOS
  return (
    <li
      className={`csc-card is-${cardStatus}${contract.is_archived ? ' is-archived' : ''}${contract.status === 'ended_early' ? ' is-left-early' : ''}`}
    >
      <button type="button" className="csc-main" onClick={onOpen} aria-label={`ดูสัญญาห้อง ${contract.room_number}`}>
        <span className="csc-head">
          <ContractRoomBadge contract={contract} />
          <span className="csc-person">
            <strong title={tenantName}>{tenantName}</strong>
            <small>{contract.phone || '-'}</small>
            {contract.is_archived && (
              <span className="csc-archive-note">
                <span>สัญญาเก่า</span>
                {contract.has_newer_contract && <span className="is-newer">มีสัญญาใหม่แล้ว</span>}
              </span>
            )}
          </span>
          <span className="csc-badges">
            <span className={`csc-status ${status.tone}`}>{status.label}</span>
            {underlying && <span className={`csc-status ${underlying.tone}`}>{underlying.label}</span>}
            {contract.can_settle_deposit && (
              <span className="csc-status is-deposit-alert">
                {contract.deposit_refund === 'forfeit' ? 'รอบันทึกริบมัดจำ' : 'รอคืนมัดจำ'}
              </span>
            )}
          </span>
        </span>
        <ContractTransferSummary contract={contract} />

        <span className="csc-period">
          <ContractPeriodTimeline contract={contract} now={now} />
        </span>

        <span className="csc-money">
          <span>
            <small>ค่าเช่า/เดือน</small>
            <b>{formatContractMoney(contract.monthly_price)}</b>
          </span>
          <span>
            <small>มัดจำ</small>
            <b>{formatDepositMonths(contract)}</b>
          </span>
          <span className="is-total">
            <small>เดือนแรก</small>
            <b>{formatContractMoney(contract.first_month_total)}</b>
          </span>
        </span>
        <DepositRefundNote contract={contract} compact />
      </button>

      <div className="csc-photos">
        <span className="csc-label">รูปสัญญา <b>{images.length}</b></span>
        <span className="csc-photo-row">
          {images.length === 0 ? (
            <span className="contract-cell-nophoto">ไม่มีรูปสัญญา</span>
          ) : (
            images.slice(0, STAFF_CARD_PHOTOS).map((image, index) => (
              <button
                type="button"
                key={image.url}
                className="csc-photo"
                onClick={() => setOpenIndex(index)}
                aria-label={`ดูรูปสัญญาห้อง ${contract.room_number} รูปที่ ${index + 1}`}
              >
                <UploadImage src={image.url} alt="" loading="lazy" />
                {index === STAFF_CARD_PHOTOS - 1 && extra > 0 && <span>+{extra}</span>}
              </button>
            ))
          )}
        </span>
      </div>

      <div className="csc-foot">
        <span>ทำสัญญา {formatContractDate(contract.contract_completed_at, true)}</span>
        <button type="button" className="csc-btn" onClick={onOpen}>
          ดูสัญญา
          <ContractIcon type="chevron" size={14} />
        </button>
      </div>
      {openIndex !== null && (
        <ContractLightbox
          images={images}
          index={openIndex}
          title="รูปสัญญาเช่า"
          subtitle={`ห้อง ${contract.room_number || '-'} · ${tenantName}`}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </li>
  )
}

const COMPLETED_CONTRACT_SORTS = [
  { value: 'newest', label: 'ทำสัญญาล่าสุดก่อน' },
  { value: 'oldest', label: 'ทำสัญญาเก่าสุดก่อน' },
  { value: 'ending', label: 'ใกล้หมดสัญญาก่อน' },
  { value: 'room', label: 'เรียงตามเลขห้อง' },
]

const contractDayKey = (value) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const contractTime = (value) => (value ? new Date(value).getTime() : 0)

const COMPLETED_CONTRACT_SORTERS = {
  newest: (a, b) => contractTime(b.contract_completed_at) - contractTime(a.contract_completed_at),
  oldest: (a, b) => contractTime(a.contract_completed_at) - contractTime(b.contract_completed_at),
  ending: (a, b) =>
    (contractTime(a.current_end_date || a.rental_end_date) || Infinity) - (contractTime(b.current_end_date || b.rental_end_date) || Infinity),
  room: (a, b) => String(a.room_number || '').localeCompare(String(b.room_number || ''), 'th', { numeric: true }),
}

export function StaffCompletedContracts({ Modal, Pagination, FilterPanel, pageSize = 12, onSummaryChange }) {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('newest')
  const [scope, setScope] = useState('all')
  const [dates, setDates] = useState({ from: '', to: '' })
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)
  const [logOpen, setLogOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    axios
      .get('/api/staff/contracts/completed', { headers: authHeaders() })
      .then(({ data }) => {
        if (cancelled) return
        setContracts(data.contracts || [])
        setError('')
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.response?.data?.message || 'ไม่สามารถโหลดรายการสัญญาได้')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const statusCounts = useMemo(
    () =>
      contracts.reduce((counts, contract) => {
        const key = contractCardStatus(contract)
        return { ...counts, [key]: (counts[key] || 0) + 1 }
      }, {}),
    [contracts],
  )
  const keyword = search.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      contracts
        .filter((contract) => status === 'all' || contractCardStatus(contract) === status)
        .filter((contract) =>
          scope === 'all'
            ? true
            : scope === 'deposit'
              ? contract.can_settle_deposit
              : (scope === 'archived') === Boolean(contract.is_archived),
        )
        .filter((contract) => {
          if (!dates.from && !dates.to) return true
          if (!contract.contract_completed_at) return false
          const key = contractDayKey(contract.contract_completed_at)
          return (!dates.from || key >= dates.from) && (!dates.to || key <= dates.to)
        })
        .filter(
          (contract) =>
            !keyword ||
            [
              contract.first_name,
              contract.last_name,
              `${contract.first_name} ${contract.last_name}`,
              contract.phone,
              contract.room_number,
              ...contractTransfers(contract).map((transfer) => transfer.from_room_number),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(keyword),
        )
        .sort(COMPLETED_CONTRACT_SORTERS[sort]),
    [contracts, status, scope, dates, keyword, sort],
  )
  const archivedCount = contracts.filter((contract) => contract.is_archived).length
  const pendingDepositCount = contracts.filter((contract) => contract.can_settle_deposit).length
  useEffect(() => {
    if (!onSummaryChange || loading) return
    onSummaryChange({
      total: contracts.length,
      active: (statusCounts.active || 0) + (statusCounts.transferred || 0),
      awaitingPayment: (statusCounts.awaiting_payment || 0) + (statusCounts.payment_review || 0),
      pendingDeposit: pendingDepositCount,
      archived: archivedCount,
    })
  }, [onSummaryChange, loading, contracts.length, statusCounts, pendingDepositCount, archivedCount])
  const filtersActive = Boolean(keyword || dates.from || dates.to || status !== 'all' || scope !== 'all' || sort !== 'newest')
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const resetPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  return (
    <div className="staff-card staff-tab-card contract-panel">
      <div className="staff-card-header">
        <div>
          <h2>
            สัญญาที่เสร็จสมบูรณ์ <span className="staff-count-pill">{contracts.length}</span>
          </h2>
          <p className="waiting-list-storage-note">สัญญาเช่าที่ลงทะเบียนผู้เช่าและแนบรูปสัญญาครบแล้ว</p>
        </div>
        <button type="button" className="deposit-log-open" onClick={() => setLogOpen(true)}>
          <ContractIcon type="wallet" size={15} />
          บันทึกการจัดการเงินมัดจำ
          {pendingDepositCount > 0 && <em>{pendingDepositCount} รอจัดการ</em>}
        </button>
      </div>
      {logOpen && (
        <DepositLogModal
          pending={contracts.filter((contract) => contract.can_settle_deposit)}
          onSettled={(updated) =>
            setContracts((current) => current.map((item) => (item.booking_id === updated.booking_id ? updated : item)))
          }
          onClose={() => setLogOpen(false)}
        />
      )}
      <FilterPanel
        segments={[
          { key: 'all', label: 'ทั้งหมด', count: contracts.length },
          ...Object.entries(STAFF_CARD_STATUS)
            .filter(([key]) => statusCounts[key])
            .map(([key, info]) => ({ key, label: info.label, count: statusCounts[key] })),
        ]}
        active={status}
        onSegment={resetPage(setStatus)}
        segmentsBelow
        search={search}
        onSearch={resetPage(setSearch)}
        searchPlaceholder="ค้นหาชื่อผู้เช่า เบอร์โทร หรือเลขห้อง"
        resultText={`พบ ${filtered.length} จาก ${contracts.length} สัญญา`}
        dateRange={{ label: 'วันที่ทำสัญญา', from: dates.from, to: dates.to, onChange: resetPage(setDates) }}
        canClear={filtersActive}
        onClear={() => {
          setSearch('')
          setStatus('all')
          setScope('all')
          setSort('newest')
          setDates({ from: '', to: '' })
          setPage(1)
        }}
      >
        <select className="staff-filter-select" value={scope} onChange={(event) => resetPage(setScope)(event.target.value)} aria-label="ประเภทสัญญา">
          <option value="all">ทุกสัญญา</option>
          <option value="current">สัญญาปัจจุบัน ({contracts.length - archivedCount})</option>
          <option value="archived">สัญญาเก่า ({archivedCount})</option>
          <option value="deposit">รอคืน/ริบมัดจำ ({pendingDepositCount})</option>
        </select>
        <select className="staff-filter-select" value={sort} onChange={(event) => resetPage(setSort)(event.target.value)} aria-label="เรียงลำดับ">
          {COMPLETED_CONTRACT_SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterPanel>
      {loading ? (
        <p className="staff-empty">กำลังโหลดรายการสัญญา...</p>
      ) : error ? (
        <p className="staff-empty">
          {error}{' '}
          <button type="button" className="staff-action-btn is-ghost" onClick={() => { setLoading(true); setReloadKey((key) => key + 1) }}>
            ลองใหม่
          </button>
        </p>
      ) : filtered.length === 0 ? (
        <p className="staff-empty">{contracts.length ? 'ไม่พบสัญญาตามเงื่อนไขที่เลือก' : 'ยังไม่มีสัญญาที่เสร็จสมบูรณ์'}</p>
      ) : (
        <ul className="csc-grid">
          {pageItems.map((contract) => (
            <StaffContractCard key={contract.booking_id} contract={contract} onOpen={() => setDetail(contract)} />
          ))}
        </ul>
      )}
      {Pagination && <Pagination page={currentPage} total={filtered.length} onChange={setPage} pageSize={pageSize} />}
      {detail && Modal && (
        <Modal title={`สัญญาเช่า ห้อง ${detail.room_number || '-'}`} onClose={() => setDetail(null)} variant="wide">
          <div className="ccc-modal">
            <div className="ccc-header ccc-person-header">
              <span className="ccc-avatar" aria-hidden="true"><ContractIcon type="user" size={22} /></span>
              <div className="ccc-person">
                <h2>{detail.first_name} {detail.last_name}</h2>
                <div className="ccc-person-meta">
                  <span className="ccc-phone"><ContractIcon type="phone" size={13} />{detail.phone || '-'}</span>
                  <span className="ccc-signed">
                    <ContractIcon type="check" size={13} />
                    ทำสัญญา {formatContractDate(detail.contract_completed_at, true)}
                  </span>
                </div>
              </div>
              <span className="csc-badges">
                {detail.is_archived && <ArchivedContractBadge contract={detail} />}
                {contractCardStatus(detail) === 'transferred' && (
                  <span className="csc-status is-transferred">ย้ายห้องแล้ว</span>
                )}
                <ContractStatusBadge status={detail.status} />
              </span>
            </div>
            {detail.is_archived && (
              <div className="contract-refund-note is-archived" role="note">
                <ContractIcon type="file" size={18} />
                <span>
                  <strong>{detail.has_newer_contract ? 'นี่คือสัญญาเก่า ผู้เช่าคนนี้มีสัญญาใหม่แล้ว' : 'นี่คือสัญญาเก่าที่สิ้นสุดแล้ว'}</strong>
                  <small>
                    {detail.moved_out_at ? `สิ้นสุดเมื่อ ${formatContractDate(detail.moved_out_at)} · ` : ''}เก็บไว้เป็นประวัติ ข้อมูลยอดชำระนับเฉพาะของสัญญานี้
                  </small>
                </span>
              </div>
            )}
            {detail.can_settle_deposit && (
              <DepositSettlementForm
                contract={detail}
                onSaved={(contract) => {
                  setContracts((current) => current.map((item) => (item.booking_id === contract.booking_id ? contract : item)))
                  setDetail(contract)
                }}
              />
            )}
            <CustomerContractBody contract={detail} viewer="staff" />
          </div>
        </Modal>
      )}
    </div>
  )
}

function DepositContractTerms({ contract, title = 'เงื่อนไขสัญญา' }) {
  const action = contract.deposit_refund === 'forfeit' ? 'forfeit' : 'refund'
  const endDate = contract.effective_end_date || contract.rental_end_date
  const leftAt = contract.moved_out_at || contract.next_contract_at || null
  const leftLabel = contract.moved_out_at ? 'ย้ายออกเมื่อ' : contract.next_contract_at ? 'ทำสัญญาใหม่เมื่อ' : 'ย้ายออกเมื่อ'
  const earlyDays = leftAt && endDate ? Math.ceil((new Date(endDate) - new Date(leftAt)) / 86400000) : 0
  return (
    <section className="deposit-settle-terms">
      <h4>
        <ContractIcon type="file" size={14} />
        {title}
      </h4>
      <dl>
        <div>
          <dt>ระยะสัญญา</dt>
          <dd>
            {formatContractDate(contract.rental_start_date)} ถึง {formatContractDate(endDate)}
            {contract.contract_duration_months ? ` (${contract.contract_duration_months} เดือน)` : ''}
          </dd>
        </div>
        <div>
          <dt>เงินมัดจำ</dt>
          <dd>{formatDepositMonths(contract)} · {formatContractMoney(contract.deposit_amount)}</dd>
        </div>
        <div>
          <dt>{leftLabel}</dt>
          <dd>
            {leftAt ? (
              <>
                {formatContractDate(leftAt, true)}
                {earlyDays > 0 ? (
                  <em className="is-early">ก่อนครบสัญญา {earlyDays} วัน</em>
                ) : (
                  <em className="is-complete">อยู่ครบสัญญา</em>
                )}
              </>
            ) : (
              <>
                ไม่มีบันทึกวันย้ายออก
                <em className="is-early">{contract.is_suspended ? 'บัญชีผู้เช่าถูกระงับ' : 'ไม่ได้ผ่านคำขอย้ายออก'}</em>
              </>
            )}
          </dd>
        </div>
        {contract.moveout_damage_note && (
          <div>
            <dt>ผลตรวจห้อง</dt>
            <dd>{contract.moveout_damage_note}</dd>
          </div>
        )}
      </dl>
      <ul>
        <li className={action === 'refund' ? 'is-active is-refund' : ''}>
          <b>พักครบสัญญา</b> คืนเงินมัดจำ หักค่าเสียหายตามจริงได้
        </li>
        <li className={action === 'forfeit' ? 'is-active is-forfeit' : ''}>
          <b>ย้ายออกก่อนครบสัญญา</b> ริบเงินมัดจำทั้งหมด
          {action === 'forfeit' && <em>ผิดเงื่อนไขข้อนี้</em>}
        </li>
      </ul>
    </section>
  )
}

function DepositSettlementModal({ contract, onClose, onSaved }) {
  const action = contract.deposit_refund === 'forfeit' ? 'forfeit' : 'refund'
  const [deduction, setDeduction] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [invalidField, setInvalidField] = useState(null)
  const deductionRef = useRef(null)
  const noteRef = useRef(null)
  const paid = Number(contract.deposit_remaining ?? contract.deposit_paid) || 0
  const deductionValue = Number(deduction) || 0
  const refundAmount = Math.max(0, paid - deductionValue)
  const noteRequired = action === 'forfeit' || deductionValue > 0

  const failField = (field, ref, message) => {
    setError(message)
    setInvalidField(field)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    ref.current?.focus({ preventScroll: true })
  }

  const submit = async (event) => {
    event.preventDefault()
    if (action === 'refund' && (deductionValue < 0 || deductionValue > paid)) {
      failField('deduction', deductionRef, 'จำนวนเงินที่หักต้องอยู่ระหว่าง 0 ถึงเงินมัดจำที่ชำระไว้')
      return
    }
    if (noteRequired && !note.trim()) {
      failField('note', noteRef, action === 'forfeit' ? 'กรุณาระบุเหตุผลที่ริบเงินมัดจำ' : 'กรุณาระบุรายการค่าเสียหายที่หัก')
      return
    }
    setInvalidField(null)
    setSaving(true)
    setError('')
    try {
      const { data } = await axios.post(
        `/api/staff/contracts/${contract.booking_id}/deposit-settlement`,
        { action, deduction: action === 'refund' ? deductionValue : undefined, note: note.trim() || undefined },
        { headers: authHeaders() },
      )
      onSaved(data.contract)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  const name = `${contract.first_name || ''} ${contract.last_name || ''}`.trim()
  const option = action === 'forfeit'
    ? { label: 'ริบเงินมัดจำ', reason: 'ผู้เช่าย้ายออกก่อนครบสัญญา ตามเงื่อนไขหอพักจะไม่คืนเงินมัดจำ' }
    : { label: 'คืนเงินมัดจำ', reason: 'ผู้เช่าพักอยู่ครบสัญญา คืนเงินมัดจำได้ หากมีความเสียหายให้หักออกตามจริง' }

  return (
    <ContractDialog
      className="deposit-settle-modal"
      label="จัดการเงินมัดจำ"
      onClose={onClose}
      locked={saving}
      header={(close) => (
        <header className="rent-bill-head">
          <span className="rent-bill-icon deposit-settle-icon"><ContractIcon type="wallet" size={18} /></span>
          <div>
            <strong>จัดการเงินมัดจำ</strong>
            <small>ห้อง {contract.room_number || '-'}{name ? ` · ${name}` : ''}</small>
          </div>
          <DialogCloseButton onClick={close} />
        </header>
      )}
    >
      <form className="deposit-settle" onSubmit={submit}>
        <div className="deposit-settle-body">
          <div className="deposit-settle-stats">
            <span>
              <i>เงินมัดจำคงเหลือ</i>
              <b>{formatContractMoney(paid)}</b>
            </span>
            <span>
              <i>สถานะสัญญา</i>
              <b>{CONTRACT_STATUS[contract.status]?.label || '-'}</b>
            </span>
            <span className={`is-${action}`}>
              <i>ผลตามเงื่อนไข</i>
              <b>{option.label}</b>
            </span>
          </div>
          <DepositContractTerms contract={contract} />
          <div className={`deposit-settle-auto is-${action}`} role="note">
            <span className="deposit-settle-auto-icon" aria-hidden="true">
              <ContractIcon type="check" size={18} />
            </span>
            <span>
              <strong>
                {option.label}
                <em>ระบบเลือกให้อัตโนมัติ</em>
              </strong>
              <small>{option.reason}</small>
            </span>
          </div>
          {action === 'refund' && (
            <label className={`deposit-settle-field${invalidField === 'deduction' ? ' is-invalid' : ''}`}>
              <span>หักค่าเสียหาย (บาท)</span>
              <input
                ref={deductionRef}
                type="number"
                min="0"
                max={paid}
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                value={deduction}
                onChange={(event) => {
                  setDeduction(event.target.value)
                  setError('')
                  setInvalidField(null)
                }}
              />
            </label>
          )}
          <label className={`deposit-settle-field${action === 'forfeit' ? ' is-forfeit-note' : ''}${invalidField === 'note' ? ' is-invalid' : ''}`}>
            <span>
              {action === 'forfeit' ? 'เหตุผลที่ริบ' : 'รายการค่าเสียหาย / หมายเหตุ'}
              {noteRequired && <em> *</em>}
            </span>
            <textarea
              ref={noteRef}
              rows={3}
              maxLength={500}
              value={note}
              placeholder={action === 'forfeit' ? 'เช่น ย้ายออกก่อนครบสัญญา' : 'เช่น ผนังเป็นรู 1 จุด ค่าซ่อม 500 บาท'}
              onChange={(event) => {
                setNote(event.target.value)
                setError('')
                setInvalidField(null)
              }}
            />
          </label>
          <dl className={`deposit-settle-summary is-${action}`}>
            <div>
              <dt>เงินมัดจำคงเหลือ</dt>
              <dd>{formatContractMoney(paid)}</dd>
            </div>
            {action === 'refund' && deductionValue > 0 && (
              <div>
                <dt>หักค่าเสียหาย</dt>
                <dd>− {formatContractMoney(deductionValue)}</dd>
              </div>
            )}
            <div className="is-total">
              <dt>{action === 'refund' ? 'ยอดที่คืนให้ผู้เช่า' : 'ยอดที่ริบ'}</dt>
              <dd>{formatContractMoney(action === 'refund' ? refundAmount : paid)}</dd>
            </div>
          </dl>
        </div>
        {error && <p className="deposit-settle-error" role="alert">{error}</p>}
        <footer className="deposit-settle-foot">
          <small>บันทึกแล้วแก้ไขไม่ได้ ระบบจะเก็บไว้ในบันทึกการจัดการเงินมัดจำ</small>
          <button type="button" className="deposit-settle-cancel" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button type="submit" className={`deposit-settle-submit is-${action}`} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : action === 'refund' ? 'บันทึกการคืนเงินมัดจำ' : 'บันทึกการริบเงินมัดจำ'}
          </button>
        </footer>
      </form>
    </ContractDialog>
  )
}

export function DepositSettlementForm({ contract, onSaved }) {
  const [open, setOpen] = useState(false)
  const suggested = contract.deposit_refund === 'forfeit' ? 'forfeit' : 'refund'
  const paid = Number(contract.deposit_remaining ?? contract.deposit_paid) || 0
  return (
    <div className={`deposit-settle-card is-${suggested}`}>
      <span className="deposit-settle-card-icon"><ContractIcon type="wallet" size={20} /></span>
      <div>
        <strong>ยังไม่ได้จัดการเงินมัดจำ {formatContractMoney(paid)}</strong>
        <small>
          ตามเงื่อนไข: {suggested === 'forfeit' ? 'ริบเงินมัดจำ (ผู้เช่าออกก่อนครบสัญญา)' : 'คืนเงินมัดจำ (ผู้เช่าพักครบสัญญา)'}
        </small>
      </div>
      <button type="button" onClick={() => setOpen(true)}>จัดการเงินมัดจำ</button>
      {open && (
        <DepositSettlementModal
          contract={contract}
          onClose={() => setOpen(false)}
          onSaved={(updated) => {
            setOpen(false)
            onSaved(updated)
          }}
        />
      )}
    </div>
  )
}

function DialogCloseButton({ onClick }) {
  return (
    <button type="button" className="rent-bill-close" onClick={onClick} aria-label="ปิด">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  )
}

function ContractDialog({ className, label, header, onClose, locked = false, children }) {
  const [closing, setClosing] = useState(false)
  const overlayRef = useRef(null)
  const requestClose = () => {
    if (!locked) setClosing(true)
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || locked) return
      const overlays = document.querySelectorAll('.rent-bill-overlay')
      if (overlays[overlays.length - 1] !== overlayRef.current) return
      event.stopImmediatePropagation()
      setClosing(true)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [locked])

  useEffect(() => {
    if (!closing) return undefined
    const timer = setTimeout(onClose, 110)
    return () => clearTimeout(timer)
  }, [closing, onClose])

  return createPortal(
    <div ref={overlayRef} className={`rent-bill-overlay${closing ? ' is-closing' : ''}`} onClick={requestClose} role="presentation">
      <div
        className={`rent-bill ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {header(requestClose)}
        {children}
      </div>
    </div>,
    document.body,
  )
}

const DEPOSIT_LOG_ACTION = {
  refunded: { label: 'คืนเงินมัดจำ', tone: 'is-refund' },
  forfeited: { label: 'ริบเงินมัดจำ', tone: 'is-forfeit' },
}

const PENDING_PREVIEW = 3

const DEPOSIT_LEFT_REASON = {
  moveout: 'ผู้เช่าแจ้งย้ายออก',
  suspended: 'บัญชีผู้เช่าถูกระงับ',
  new_contract: 'ผู้เช่าทำสัญญาใหม่แทนสัญญานี้',
}

function DepositLogViolation({ log }) {
  const [open, setOpen] = useState(false)
  const leftAt = log.left_at ? new Date(log.left_at) : null
  const endAt = log.contract_end_date ? new Date(log.contract_end_date) : null
  const earlyDays = leftAt && endAt ? Math.ceil((endAt - leftAt) / 86400000) : null
  return (
    <div className={`deposit-log-violation${open ? ' is-open' : ''}`} role="note">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <strong>
          ผิดสัญญา: ย้ายออกก่อนครบสัญญา
          {earlyDays > 0 && <em>ก่อนครบ {earlyDays} วัน</em>}
        </strong>
        <span className="deposit-log-violation-toggle">
          {open ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
          <ContractIcon type="chevron" size={14} />
        </span>
      </button>
      <div className="deposit-collapse" aria-hidden={!open}>
      <ul>
        <li>
          <span>ย้ายออกเมื่อ</span>
          <b>{leftAt ? formatContractDate(log.left_at) : 'ไม่มีบันทึก'}</b>
          {log.left_reason && (
            <small className={`is-${log.left_reason}`}>{DEPOSIT_LEFT_REASON[log.left_reason] || log.left_reason}</small>
          )}
        </li>
        <li>
          <span>สัญญาสิ้นสุด</span>
          <b>{endAt ? formatContractDate(log.contract_end_date) : 'ไม่มีบันทึก'}</b>
        </li>
        <li>
          <span>เงื่อนไขที่ผิด</span>
          <b>ย้ายออกก่อนครบสัญญา หอพักริบเงินมัดจำทั้งหมด</b>
        </li>
      </ul>
      </div>
    </div>
  )
}

function DepositLogModal({ contract, pending = [], onSettled, onClose }) {
  const [logs, setLogs] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [settling, setSettling] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState('history')
  const [expanded, setExpanded] = useState(null)
  const pendingVisible = contract
    ? []
    : pending.filter((item) =>
        !search.trim() ||
        [item.room_number, item.first_name, item.last_name, item.phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
  const keyword = search.trim().toLowerCase()
  const visible = (logs ?? []).filter((log) =>
    !keyword ||
    [
      DEPOSIT_LOG_ACTION[log.action]?.label,
      log.note,
      log.settled_by_name,
      log.room_number,
      log.tenant_name,
      CONTRACT_STATUS[log.contract_status]?.label,
      formatContractDate(log.created_at, true),
      formatContractMoney(log.deposit_amount),
      formatContractMoney(log.refunded_amount),
      formatContractMoney(log.forfeited_amount),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  )

  const bookingId = contract?.booking_id ?? null
  const totals = (logs ?? []).reduce(
    (sum, log) => ({
      refunded: sum.refunded + (Number(log.refunded_amount) || 0),
      forfeited: sum.forfeited + (Number(log.forfeited_amount) || 0),
    }),
    { refunded: 0, forfeited: 0 },
  )

  useEffect(() => {
    let active = true
    const url = bookingId
      ? `/api/staff/contracts/${bookingId}/deposit-settlement-logs`
      : '/api/staff/contracts/deposit-settlement-logs'
    axios
      .get(url, { headers: authHeaders() })
      .then(({ data }) => {
        if (active) setLogs(data.logs ?? [])
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'โหลดบันทึกไม่สำเร็จ')
      })
    return () => {
      active = false
    }
  }, [bookingId, reloadKey])

  return (
    <ContractDialog
      className="deposit-log-modal"
      label="บันทึกการจัดการเงินมัดจำ"
      onClose={onClose}
      header={(close) => (
        <header className="rent-bill-head">
          <span className="rent-bill-icon"><ContractIcon type="file" size={18} /></span>
          <div>
            <strong>บันทึกการจัดการเงินมัดจำ</strong>
            <small>
              {contract
                ? `ห้อง ${contract.room_number || '-'} · ${`${contract.first_name || ''} ${contract.last_name || ''}`.trim() || '-'}`
                : `ทุกสัญญา · คืนแล้ว ${formatContractMoney(totals.refunded)} · ริบแล้ว ${formatContractMoney(totals.forfeited)}`}
            </small>
          </div>
          <DialogCloseButton onClick={close} />
        </header>
      )}
    >
      {!contract && (
        <nav className="deposit-log-tabs" role="tablist" aria-label="ส่วนของบันทึกเงินมัดจำ">
          {[
            { key: 'history', label: 'ประวัติที่บันทึกแล้ว', count: logs?.length ?? 0 },
            { key: 'pending', label: 'รอจัดการเงินมัดจำ', count: pending.length, alert: pending.length > 0 },
          ].map((item) => (
            <button
              type="button"
              role="tab"
              key={item.key}
              aria-selected={tab === item.key}
              className={`${tab === item.key ? 'is-active' : ''}${item.alert ? ' is-alert' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </nav>
      )}
      <div className="contract-transfers-modal-search deposit-log-search">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            contract
              ? 'ค้นหาเหตุผล ผู้บันทึก วันที่ ยอดเงิน หรือ คืน/ริบ'
              : tab === 'pending'
                ? 'ค้นหาห้อง ชื่อผู้เช่า หรือเบอร์โทร'
                : 'ค้นหาห้อง ชื่อผู้เช่า เหตุผล ผู้บันทึก วันที่ หรือ คืน/ริบ'
          }
          aria-label="ค้นหาบันทึกการจัดการเงินมัดจำ"
        />
        <span>
          {tab === 'pending'
            ? `พบ ${pendingVisible.length} จาก ${pending.length} สัญญา`
            : `พบ ${visible.length} จาก ${logs?.length ?? 0} รายการ`}
        </span>
      </div>
      <div className="deposit-log-body">
        {tab === 'pending' && pendingVisible.length === 0 && (
          <p className="deposit-log-empty">{pending.length ? 'ไม่พบสัญญาที่ตรงกับคำค้นหา' : 'ไม่มีสัญญาที่รอจัดการเงินมัดจำ'}</p>
        )}
        {pendingVisible.length > 0 && (
          <section className={`deposit-pending${tab === 'pending' ? ' is-full' : ''}`}>
            <h4>
              <ContractIcon type="wallet" size={15} />
              รอจัดการเงินมัดจำ
              <span>{pendingVisible.length} สัญญา</span>
              {tab === 'history' && pendingVisible.length > PENDING_PREVIEW && (
                <button type="button" className="deposit-pending-more" onClick={() => setTab('pending')}>
                  ดูทั้งหมด {pendingVisible.length} รายการ
                </button>
              )}
            </h4>
            <ul>
              {(tab === 'pending' ? pendingVisible : pendingVisible.slice(0, PENDING_PREVIEW)).map((item) => {
                const forfeit = item.deposit_refund === 'forfeit'
                const amount = Number(item.deposit_remaining ?? item.deposit_paid) || 0
                return (
                  <li
                    key={item.booking_id}
                    className={`${forfeit ? 'is-forfeit' : 'is-refund'}${expanded === item.booking_id ? ' is-open' : ''}`}
                  >
                    <div className="deposit-pending-row">
                      <button
                        type="button"
                        className="deposit-pending-toggle"
                        aria-expanded={expanded === item.booking_id}
                        onClick={() => setExpanded((current) => (current === item.booking_id ? null : item.booking_id))}
                      >
                        <span className="deposit-pending-room">ห้อง {item.room_number || '-'}</span>
                        <span className="deposit-pending-info">
                          <b>{`${item.first_name || ''} ${item.last_name || ''}`.trim() || '-'}</b>
                          <small>
                            {CONTRACT_STATUS[item.status]?.label || '-'} · {forfeit ? 'ต้องริบเงินมัดจำ' : 'ต้องคืนเงินมัดจำ'}
                          </small>
                        </span>
                        <strong>{formatContractMoney(amount)}</strong>
                        <span className="deposit-pending-chevron" aria-hidden="true">
                          <ContractIcon type="chevron" size={16} />
                        </span>
                      </button>
                      <button type="button" className="deposit-pending-action" onClick={() => setSettling(item)}>
                        {forfeit ? 'บันทึกริบ' : 'บันทึกคืน'}
                      </button>
                    </div>
                    <div className="deposit-collapse" aria-hidden={expanded !== item.booking_id}>
                      <div className="deposit-pending-detail">
                        <DepositContractTerms contract={item} title="รายละเอียดและเงื่อนไขสัญญา" />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {!contract && tab === 'history' && <h4 className="deposit-log-heading">ประวัติที่บันทึกแล้ว</h4>}
        {tab === 'pending' ? null : error ? (
          <p className="deposit-settle-error">{error}</p>
        ) : logs === null ? (
          <p className="deposit-log-empty">กำลังโหลด...</p>
        ) : logs.length === 0 ? (
          <p className="deposit-log-empty">ยังไม่มีบันทึก</p>
        ) : visible.length === 0 ? (
          <p className="deposit-log-empty">ไม่พบบันทึกที่ตรงกับคำค้นหา</p>
        ) : (
          visible.map((log) => {
            const info = DEPOSIT_LOG_ACTION[log.action] || { label: log.action, tone: '' }
            const refunded = log.action === 'refunded'
            const facts = [
              { label: 'เงินมัดจำคงเหลือ', value: formatContractMoney(log.deposit_amount), icon: 'wallet', tone: 'is-money' },
              refunded
                ? { label: 'หักค่าเสียหาย', value: formatContractMoney(log.deduction), icon: 'wallet', tone: 'is-deduct' }
                : null,
              log.contract_status
                ? {
                    label: 'สถานะสัญญา',
                    value: CONTRACT_STATUS[log.contract_status]?.label || log.contract_status,
                    icon: 'file',
                    tone: `is-status-${CONTRACT_STATUS[log.contract_status]?.tone || 'muted'}`,
                  }
                : null,
              { label: 'บันทึกโดย', value: log.settled_by_name || '-', icon: 'user', tone: 'is-staff' },
            ].filter(Boolean)
            return (
              <article key={log.id} className={`deposit-log-entry ${info.tone}`}>
                <header>
                  <div>
                    <span className="deposit-log-tags">
                      <em>{info.label}</em>
                      {!contract && (
                        <b>
                          ห้อง {log.room_number || '-'}
                          {log.tenant_name ? ` · ${log.tenant_name}` : ''}
                        </b>
                      )}
                    </span>
                    <time className="deposit-log-time" dateTime={log.created_at}>
                      <ContractIcon type="calendar" size={13} />
                      <b>{formatContractDate(log.created_at)}</b>
                      <span>
                        <ContractIcon type="clock" size={12} />
                        {new Date(log.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                      </span>
                    </time>
                  </div>
                  <span className="deposit-log-amount">
                    <small>{refunded ? 'คืนให้ผู้เช่า' : 'ยอดที่ริบ'}</small>
                    <strong>{formatContractMoney(refunded ? log.refunded_amount : log.forfeited_amount)}</strong>
                  </span>
                </header>
                {!refunded && <DepositLogViolation log={log} />}
                <dl>
                  {facts.map((fact) => (
                    <div key={fact.label} className={fact.tone}>
                      <dt>
                        <ContractIcon type={fact.icon} size={13} />
                        {fact.label}
                      </dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="deposit-log-note">
                  <b>{refunded ? 'หมายเหตุ' : 'เหตุผล'}</b>
                  <span>{log.note || '-'}</span>
                </p>
              </article>
            )
          })
        )}
      </div>
      {settling && (
        <DepositSettlementModal
          contract={settling}
          onClose={() => setSettling(null)}
          onSaved={(updated) => {
            setSettling(null)
            setReloadKey((key) => key + 1)
            onSettled?.(updated)
          }}
        />
      )}
    </ContractDialog>
  )
}

function DepositLogLink({ contract }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="deposit-log-link" onClick={() => setOpen(true)}>
        ดูบันทึกการจัดการเงินมัดจำ
      </button>
      {open && <DepositLogModal contract={contract} onClose={() => setOpen(false)} />}
    </>
  )
}

function ContractThumb({ contract }) {
  const [openIndex, setOpenIndex] = useState(null)
  const images = contract.images || []
  if (images.length === 0) return <span className="contract-cell-nophoto">ไม่มีรูป</span>
  return (
    <>
      <button
        type="button"
        className="contract-cell-thumb"
        onClick={(event) => {
          event.stopPropagation()
          setOpenIndex(0)
        }}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={`ดูรูปสัญญาเช่า ${images.length} รูป`}
      >
        <UploadImage src={images[0].url} alt="" loading="lazy" />
        <span>{images.length} รูป</span>
      </button>
      {openIndex !== null && (
        <ContractLightbox
          images={images}
          index={openIndex}
          title="รูปสัญญาเช่า"
          subtitle={`ห้อง ${contract.room_number || '-'} · ${contract.first_name || ''} ${contract.last_name || ''}`}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  )
}

export function ContractFullModal({ contract, onClose, viewer = 'staff' }) {
  const [closing, setClosing] = useState(false)
  const requestClose = () => setClosing(true)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('.photo-viewer') || document.querySelectorAll('.rent-bill-overlay').length > 1) return
      event.stopImmediatePropagation()
      setClosing(true)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  useEffect(() => {
    if (!closing) return undefined
    const timer = setTimeout(onClose, 110)
    return () => clearTimeout(timer)
  }, [closing, onClose])

  const name = `${contract.first_name || ''} ${contract.last_name || ''}`.trim()
  return createPortal(
    <div className={`rent-bill-overlay${closing ? ' is-closing' : ''}`} onClick={requestClose} role="presentation">
      <div
        className="rent-bill contract-full-modal"
        role="dialog"
        aria-modal="true"
        aria-label="รายละเอียดสัญญาเช่า"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="rent-bill-head">
          <span className="rent-bill-icon"><ContractIcon type="file" size={18} /></span>
          <div>
            <strong>สัญญาเช่า ห้อง {contract.room_number || '-'}</strong>
            <span className="contract-transfers-modal-meta">
              {name && (
                <span>
                  <i>ผู้เช่า</i>
                  <b>{name}</b>
                </span>
              )}
              <span>
                <i>เบอร์โทร</i>
                <b>{contract.phone || '-'}</b>
              </span>
              <span>
                <i>ทำสัญญา</i>
                <b>{formatContractDate(contract.contract_completed_at || contract.created_at)}</b>
              </span>
            </span>
          </div>
          <ContractStatusBadge status={contract.status} />
          <button type="button" className="rent-bill-close" onClick={requestClose} aria-label="ปิด">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="contract-full-modal-body ccc-modal">
          <CustomerContractBody contract={contract} viewer={viewer} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

const TIMELINE_THUMBS = 4

const dayKeyDate = (key) => (key ? new Date(`${key}T00:00:00`) : undefined)

function ContractTransferTimeline({ contract, viewer }) {
  const [openId, setOpenId] = useState(null)
  const [search, setSearch] = useState('')
  const [dates, setDates] = useState({ from: '', to: '' })
  const transfers = contractTransfers(contract)
  const keyword = search.trim().toLowerCase()
  const filtersActive = Boolean(keyword || dates.from || dates.to)
  if (transfers.length === 0) {
    return (
      <div className="ccc-state">
        <ContractIcon type="file" size={26} />
        <strong>ยังไม่มีประวัติการย้ายห้อง</strong>
        <span>เมื่อย้ายห้องในสัญญานี้ ประวัติจะแสดงที่นี่</span>
      </div>
    )
  }
  const allItems = transfers.map((transfer, index) => ({ transfer, order: index + 1 })).reverse()
  const items = allItems.filter(({ transfer, order }) => {
    if (dates.from || dates.to) {
      if (!transfer.transferred_at) return false
      const key = contractDayKey(transfer.transferred_at)
      if ((dates.from && key < dates.from) || (dates.to && key > dates.to)) return false
    }
    if (!keyword) return true
    return [
      `ครั้งที่ ${order}`,
      transfer.from_room_number,
      transfer.to_room_number,
      formatContractDate(transfer.transferred_at, true),
      formatContractMoney(transfer.from_price),
      formatContractMoney(transfer.to_price),
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
  const lastDeposit = Math.max(0, Number(transfers.at(-1).deposit_before) - Number(transfers.at(-1).deposit_deducted))
  return (
    <div className="ctl">
      <div className="ctl-summary">
        <div>
          <span>ห้องปัจจุบัน</span>
          <strong>{contract.current_room_number || contract.room_number || '-'}</strong>
        </div>
        <div>
          <span>ย้ายแล้ว</span>
          <strong>{transfers.length} ครั้ง</strong>
        </div>
        <div>
          <span>ค่าเช่าปัจจุบัน</span>
          <strong>{formatContractMoney(contract.monthly_price)}</strong>
        </div>
        <div>
          <span>เงินมัดจำคงเหลือ</span>
          <strong>{formatContractMoney(contract.deposit_remaining ?? lastDeposit)}</strong>
        </div>
      </div>
      <div className="ctl-toolbar">
        <input
          type="search"
          className="ctl-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหาเลขห้อง ราคา หรือ ครั้งที่"
          aria-label="ค้นหาประวัติการย้ายห้อง"
        />
        <div className="ctl-date-field">
          <ContractIcon type="calendar" size={14} />
          <ThaiDatePicker
            className="ctl-date-input"
            placeholder="ตั้งแต่วันที่"
            value={dates.from}
            maxDate={dayKeyDate(dates.to)}
            isClearable
            portalId="ctl-date-portal"
            onChange={(value) => setDates((current) => ({ ...current, from: value }))}
          />
          <span>ถึง</span>
          <ThaiDatePicker
            className="ctl-date-input"
            placeholder="ถึงวันที่"
            value={dates.to}
            minDate={dayKeyDate(dates.from)}
            isClearable
            portalId="ctl-date-portal"
            onChange={(value) => setDates((current) => ({ ...current, to: value }))}
          />
        </div>
        {filtersActive && (
          <button
            type="button"
            className="ctl-clear"
            onClick={() => {
              setSearch('')
              setDates({ from: '', to: '' })
            }}
          >
            ล้างตัวกรอง
          </button>
        )}
        <span className="ctl-result">พบ {items.length} จาก {allItems.length} ครั้ง</span>
      </div>
      <ol className="ctl-list">
        {items.length === 0 && <li className="ctl-empty">ไม่พบการย้ายห้องที่ตรงกับตัวกรอง</li>}
        {items.map(({ transfer, order }) => {
          const fromPrice = Number(transfer.from_price) || 0
          const toPrice = Number(transfer.to_price) || 0
          const deducted = Number(transfer.deposit_deducted) || 0
          const charged = Number(transfer.amount_charged) || 0
          const date = transfer.transferred_at ? new Date(transfer.transferred_at) : null
          return (
            <li key={transfer.id}>
              <span className="ctl-order">ครั้งที่ {order}</span>
              <button type="button" className="ctl-item" onClick={() => setOpenId(transfer.id)}>
                <span className="ctl-date" aria-hidden="true">
                  <b>{date ? date.toLocaleDateString('th-TH', { day: 'numeric' }) : '-'}</b>
                  <small>{date ? date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }) : ''}</small>
                </span>
                <span className="ctl-body">
                  <span className="ctl-title">
                    ห้อง {transfer.from_room_number} <i>→</i> ห้อง {transfer.to_room_number}
                  </span>
                  <span className="ctl-facts">
                    <span className={toPrice > fromPrice ? 'is-up' : toPrice < fromPrice ? 'is-down' : ''}>
                      ค่าเช่า {formatContractMoney(fromPrice)} → {formatContractMoney(toPrice)}
                    </span>
                    <span className={deducted > 0 ? 'is-up' : 'is-down'}>
                      {deducted > 0 ? `หักมัดจำ ${formatContractMoney(deducted)}` : 'ไม่หักมัดจำ'}
                    </span>
                    {charged > 0 && (
                      <span className={transfer.charge_status === 'paid' ? 'is-down' : 'is-danger'}>
                        จ่ายเพิ่ม {formatContractMoney(charged)} · {TRANSFER_CHARGE_STATUS[transfer.charge_status] || 'รอชำระ'}
                      </span>
                    )}
                  </span>
                  <span className="ctl-time">ย้ายเมื่อ {formatContractDate(transfer.transferred_at, true)}</span>
                </span>
                <span className="ctl-thumbs">
                  {(transfer.new_images ?? []).length > 0 ? (
                    <>
                      <small>รูปสัญญาใหม่ {transfer.new_images.length} รูป</small>
                      <span className="ctl-thumb-row">
                        {transfer.new_images.slice(0, TIMELINE_THUMBS).map((image, index) => (
                          <span key={image.url} className="ctl-thumb">
                            <UploadImage src={image.url} alt="" loading="lazy" />
                            {index === TIMELINE_THUMBS - 1 && transfer.new_images.length > TIMELINE_THUMBS && (
                              <em>+{transfer.new_images.length - TIMELINE_THUMBS}</em>
                            )}
                          </span>
                        ))}
                      </span>
                    </>
                  ) : (
                    <small className="is-empty">ไม่มีรูปสัญญาใหม่</small>
                  )}
                </span>
                <span className="ctl-more">
                  ดูรายละเอียด
                  <ContractIcon type="chevron" size={14} />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {openId !== null && (
        <ContractTransfersModal contract={contract} viewer={viewer} focusId={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  )
}

export function CustomerContractPanel() {
  const [contract, setContract] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('detail')
  const transferCount = contractTransfers(contract).length

  useEffect(() => {
    let cancelled = false
    axios
      .get('/api/customer/contract', { headers: authHeaders() })
      .then(({ data }) => {
        if (!cancelled) setContract(data.contract || null)
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.response?.data?.message || 'ไม่สามารถโหลดข้อมูลสัญญาเช่าได้')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="dashboard-card contract-panel contract-customer-card" aria-labelledby="customer-contract-title">
      <div className="ccc-header">
        <div>
          <h2 id="customer-contract-title">สัญญาเช่าของฉัน</h2>
          <p>ข้อมูลจากวันลงทะเบียนเข้าพัก</p>
        </div>
        {contract && <ContractStatusBadge status={contract.status} />}
      </div>
      {loading || error || !contract ? (
        <div className="ccc-state">
          {loading ? (
            <span>กำลังโหลดข้อมูลสัญญาเช่า...</span>
          ) : error ? (
            <span className="is-error">{error}</span>
          ) : (
            <>
              <ContractIcon type="file" size={26} />
              <strong>ยังไม่มีข้อมูลสัญญาเช่า</strong>
              <span>กรุณาติดต่อเจ้าหน้าที่หากคุณลงทะเบียนเข้าพักแล้ว</span>
            </>
          )}
        </div>
      ) : (
        <>
          <nav className="ccc-tabs" role="tablist" aria-label="ส่วนของสัญญาเช่า">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'detail'}
              className={tab === 'detail' ? 'is-active' : ''}
              onClick={() => setTab('detail')}
            >
              <ContractIcon type="file" size={15} />
              รายละเอียดสัญญา
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'history'}
              className={tab === 'history' ? 'is-active' : ''}
              onClick={() => setTab('history')}
            >
              <ContractIcon type="calendar" size={15} />
              ประวัติการย้ายห้อง
              <em>{transferCount}</em>
            </button>
          </nav>
          {tab === 'detail' ? (
            <CustomerContractBody contract={contract} viewer="customer" />
          ) : (
            <ContractTransferTimeline contract={contract} viewer="customer" />
          )}
        </>
      )}
    </section>
  )
}

function contractTimeline(contract, now) {
  const start = contract.rental_start_date ? new Date(contract.rental_start_date).getTime() : null
  const endValue = contract.current_end_date || contract.rental_end_date
  const end = endValue ? new Date(endValue).getTime() : null
  if (!start || !end || end <= start) return { percent: 0, daysLeft: null, totalDays: null, usedDays: null }
  const percent = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
  const totalDays = Math.max(1, Math.round((end - start) / 86400000))
  const daysLeft = Math.ceil((end - now) / 86400000)
  return { percent, daysLeft, totalDays, usedDays: Math.min(totalDays, Math.max(0, totalDays - Math.max(0, daysLeft))) }
}

function formatDaysLeft(daysLeft) {
  if (daysLeft === null) return '-'
  if (daysLeft > 0) return `${daysLeft} วัน`
  if (daysLeft === 0) return 'ครบวันนี้'
  return `ครบแล้ว (${Math.abs(daysLeft)} วันก่อน)`
}

const THIS_MONTH_STATUS = {
  paid: { label: 'ชำระแล้ว', tone: 'is-paid' },
  due: { label: 'รอชำระ', tone: 'is-due' },
  pending: { label: 'รอตรวจสลิป', tone: 'is-pending' },
  overdue: { label: 'เกินกำหนด', tone: 'is-overdue' },
}

const billDate = (value) => (value ? new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-')

function RentBillModal({ contract, thisMonth, onClose, viewer = 'customer' }) {
  const [closing, setClosing] = useState(false)
  const [slipOpen, setSlipOpen] = useState(false)
  const slipOpenRef = useRef(false)
  const requestClose = () => setClosing(true)

  useEffect(() => {
    slipOpenRef.current = slipOpen
  }, [slipOpen])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || slipOpenRef.current) return
      event.stopImmediatePropagation()
      setClosing(true)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  useEffect(() => {
    if (!closing) return undefined
    const timer = setTimeout(onClose, 110)
    return () => clearTimeout(timer)
  }, [closing, onClose])

  const depositOpen = ['due', 'pending'].includes(thisMonth.deposit_status)
  const deposit = depositOpen ? Number(thisMonth.deposit_due) || 0 : 0
  const rentPaid = thisMonth.status === 'paid'
  const paid = rentPaid && deposit === 0
  const billStatus = rentPaid && deposit > 0 ? thisMonth.deposit_status : thisMonth.status
  const info = THIS_MONTH_STATUS[billStatus] || THIS_MONTH_STATUS.due
  const months = (thisMonth.overdue_months || 0) + 1
  const price = Number(contract.monthly_price) || 0
  const gross = rentPaid ? 0 : price * months
  const rentAmount = rentPaid ? 0 : Number(thisMonth.amount) || 0
  const amount = rentAmount + deposit
  const adjustment = Math.round((rentAmount - gross) * 100) / 100
  const depositMonths = price > 0 ? Number(contract.deposit_amount) / price : 0
  const depositLabel = Number.isInteger(depositMonths) && depositMonths > 0
    ? `เงินมัดจำ ${depositMonths} เดือน (${formatContractMoney(price)} × ${depositMonths})`
    : 'เงินมัดจำ'
  const firstBill = ['awaiting_payment', 'payment_review'].includes(contract.status)
  const lines = paid
    ? [{ label: 'ค่าเช่ารอบนี้', value: formatContractMoney(price) }, { label: 'ชำระแล้ว', value: `− ${formatContractMoney(price)}`, tone: 'is-paid' }]
    : [
        ...(rentPaid
          ? [{ label: 'ค่าเช่ารอบนี้', value: 'ชำระแล้ว', tone: 'is-paid' }]
          : [{ label: months > 1 ? `ค่าเช่า ${months} เดือน (${formatContractMoney(price)} × ${months})` : firstBill ? 'ค่าเช่าเดือนแรก' : 'ค่าเช่ารอบนี้', value: formatContractMoney(gross) }]),
        ...(deposit > 0
          ? [{
              label: thisMonth.deposit_status === 'pending' ? `${depositLabel} · รอตรวจสลิป` : depositLabel,
              value: formatContractMoney(deposit),
              tone: 'is-deposit',
            }]
          : []),
        ...(adjustment < 0 ? [{ label: 'หักยอดที่ชำระไปแล้ว', value: `− ${formatContractMoney(-adjustment)}`, tone: 'is-paid' }] : []),
        ...(adjustment > 0 ? [{ label: 'ค่าเช่าล่วงหน้า (ทบยอด)', value: formatContractMoney(adjustment) }] : []),
      ]

  const payment = thisMonth.last_payment
  const showSlip = ['paid', 'pending'].includes(thisMonth.status)
  const slipPhotos = payment?.slip_path ? [{ name: 'สลิปค่าเช่า', url: payment.slip_path }] : []

  return createPortal(
    <div className={`rent-bill-overlay${closing ? ' is-closing' : ''}`} onClick={requestClose} role="presentation">
      <div className="rent-bill" role="dialog" aria-modal="true" aria-label="ใบแจ้งค่าเช่า" onClick={(event) => event.stopPropagation()}>
        <header className="rent-bill-head">
          <span className="rent-bill-icon"><ContractIcon type="file" size={18} /></span>
          <div>
            <strong>ใบแจ้งค่าเช่า</strong>
            <small>ห้อง {contract.current_room_number || contract.room_number || '-'} · {contract.first_name} {contract.last_name}</small>
          </div>
          <em className={`rent-bill-status ${info.tone}`}>{info.label}</em>
          <button type="button" className="rent-bill-close" onClick={requestClose} aria-label="ปิด">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="rent-bill-body">
          <div className="rent-bill-main">
          <ContractFirstPaymentNote contract={contract} viewer={viewer} />
          <DepositRefundNote contract={contract} viewer={viewer} />
          <div className="rent-bill-meta">
            <div>
              <small>รอบบิล</small>
              <b>{billDate(thisMonth.period_start)} ถึง {billDate(thisMonth.period_end)}</b>
            </div>
            <div>
              <small>{paid ? 'ชำระเมื่อ' : 'ครบกำหนด'}</small>
              <b className={paid ? '' : 'is-due'}>
                {paid ? (payment ? billDate(payment.payment_date) : 'ยอดล่วงหน้า') : billDate(thisMonth.due_date)}
              </b>
            </div>
          </div>

          <div className="rent-bill-sheet">
            <dl className="rent-bill-lines">
              {lines.map((line) => (
                <div key={line.label} className={line.tone}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
            <div className={`rent-bill-total ${info.tone}`}>
              <span>{paid ? 'ยอดคงค้าง' : 'ยอดที่ต้องชำระ'}</span>
              <strong>{formatContractMoney(amount)}</strong>
            </div>
          </div>
          <section className="rent-bill-contract" aria-label="ราคาตามสัญญา">
            <header>
              <span>ราคาตามสัญญา</span>
              <small>{formatContractLength(contract)} · {contract.billing_periods || 0} รอบบิล</small>
            </header>
            <dl>
              <div>
                <dt>ช่วงสัญญา</dt>
                <dd>{billDate(contract.rental_start_date)} – {billDate(contract.current_end_date || contract.rental_end_date)}</dd>
              </div>
              <div>
                <dt>ค่าห้อง/เดือน</dt>
                <dd>{formatContractMoney(contract.monthly_price)}</dd>
              </div>
              <div>
                <dt>เงินมัดจำ</dt>
                <dd>{formatDepositSummary(contract)}</dd>
              </div>
              <div>
                <dt>งวดแรก (ค่าห้อง + มัดจำ)</dt>
                <dd>{formatContractMoney(contract.first_month_total)}</dd>
              </div>
              <div>
                <dt>
                  {contract.room_transfers?.length > 0
                    ? `ยอดค่าเช่าตามสัญญา (${contract.billing_periods || 0} รอบ รวมส่วนต่างย้ายห้อง)`
                    : `ยอดค่าเช่าตามสัญญา (${formatContractMoney(contract.monthly_price)} × ${contract.billing_periods || 0})`}
                </dt>
                <dd>{formatContractMoney(contract.contract_total)}</dd>
              </div>
              <div className="is-paid">
                <dt>ค่าเช่าที่ชำระแล้ว</dt>
                <dd>− {formatContractMoney(contract.rent_paid)}</dd>
              </div>
              <div className="is-total">
                <dt>ค่าเช่าที่เหลือ{remainingRentMonthsLabel(contract)}</dt>
                <dd>{formatContractMoney(contract.contract_remaining)}</dd>
              </div>
            </dl>
            <p>เงินมัดจำไม่ถูกหักจากค่าเช่า · คืนเมื่อพักครบสัญญา ไม่คืนหากออกก่อนสัญญา</p>
          </section>
          </div>

          <section className="rent-bill-slip">
            <header>
              <span>สลิปการชำระ</span>
              {payment && showSlip && <small>{formatContractMoney(payment.amount)} · {billDate(payment.payment_date)}</small>}
            </header>
            {showSlip && slipPhotos.length > 0 ? (
              <button type="button" className="rent-bill-slip-image" onClick={() => setSlipOpen(true)} aria-label="ดูสลิปขนาดใหญ่">
                <UploadImage src={slipPhotos[0].url} alt="สลิปการชำระค่าเช่า" />
                <span>แตะเพื่อขยาย</span>
              </button>
            ) : (
              <div className="rent-bill-slip-empty">
                <ContractIcon type="image" size={22} />
                <span>
                  {!showSlip ? 'ยังไม่มีการชำระในรอบนี้' : payment ? 'ชำระที่เคาน์เตอร์ ไม่มีสลิปแนบ' : 'ไม่มีสลิปสำหรับรอบนี้'}
                </span>
              </div>
            )}
          </section>
        </div>

        <footer className="rent-bill-foot">
          <small>
            {paid
              ? 'ชำระค่าเช่ารอบนี้ครบแล้ว'
              : firstBill
                ? 'งวดแรก = ค่าห้อง + เงินมัดจำ · เดือนถัดไปชำระเฉพาะค่าห้อง · ไม่รวมค่าน้ำค่าไฟ'
                : 'ไม่รวมค่าน้ำค่าไฟ · ชำระได้ที่หน้าแรก'}
          </small>
          <button type="button" onClick={requestClose}>ปิด</button>
        </footer>
      </div>
      {slipOpen && (
        <ContractLightbox
          images={slipPhotos}
          index={0}
          title="สลิปค่าเช่า"
          subtitle={`ห้อง ${contract.current_room_number || contract.room_number || '-'}`}
          onClose={() => setSlipOpen(false)}
        />
      )}
    </div>,
    document.body,
  )
}

function DepositDeductions({ contract }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`ccc-bill-deposit-more${open ? ' is-open' : ''}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="ccc-bill-deposit-summary">
          <span className="is-deduct">
            หักไป <b>−{formatContractMoney(contract.deposit_transfer_deducted)}</b>
          </span>
          <span className="is-left">
            คงเหลือ <b>{formatContractMoney(contract.deposit_remaining)}</b>
          </span>
        </span>
        <span className="ccc-bill-deposit-toggle">
          {open ? 'ซ่อน' : 'ดูรายการหัก'}
          <ContractIcon type="chevron" size={13} />
        </span>
      </button>
      <div className="deposit-collapse" aria-hidden={!open}>
        <ul className="ccc-bill-deposit-deductions">
          <li>
            <span>เงินมัดจำที่ชำระ</span>
            <b>{formatContractMoney(contract.deposit_paid ?? contract.deposit_amount)}</b>
          </li>
          {contractTransfers(contract)
            .filter((transfer) => Number(transfer.deposit_deducted) > 0)
            .map((transfer) => (
              <li key={transfer.id} className="is-deduct">
                <span>
                  หักส่วนต่างย้ายห้อง {transfer.from_room_number} → {transfer.to_room_number}
                  <small>{formatContractDate(transfer.transferred_at)}</small>
                </span>
                <b>−{formatContractMoney(transfer.deposit_deducted)}</b>
              </li>
            ))}
          <li className="is-left">
            <span>คงเหลือ</span>
            <b>{formatContractMoney(contract.deposit_remaining)}</b>
          </li>
        </ul>
      </div>
    </div>
  )
}

function formatShortRange(from, to) {
  const format = (value) => {
    const date = value ? new Date(value) : null
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
      : '-'
  }
  return (
    <>
      <b>{format(from)}</b> ถึง <b>{format(to)}</b>
    </>
  )
}

function ThisMonthRent({ thisMonth, contract, viewer }) {
  const [billOpen, setBillOpen] = useState(false)
  if (!thisMonth) {
    return (
      <div className="ccc-month is-none">
        <div>
          <span>ค่าเช่าเดือนนี้</span>
          <small>ไม่มีรอบบิลที่ต้องชำระ</small>
        </div>
      </div>
    )
  }
  const deposit = ['due', 'pending'].includes(thisMonth.deposit_status) ? Number(thisMonth.deposit_due) || 0 : 0
  const rentPaid = thisMonth.status === 'paid'
  const paid = rentPaid && deposit === 0
  const info = THIS_MONTH_STATUS[rentPaid && deposit > 0 ? thisMonth.deposit_status : thisMonth.status] || THIS_MONTH_STATUS.due
  const total = (rentPaid ? 0 : Number(thisMonth.amount) || 0) + deposit
  const shortDate = (value) =>
    value ? new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'
  return (
    <div className={`ccc-month ${info.tone}`}>
      <div className="ccc-month-top">
        <span>
          {deposit > 0 ? 'ค่าเช่า + เงินมัดจำ' : 'ค่าเช่าเดือนนี้'}
          <em>{info.label}</em>
        </span>
        <strong>{paid ? '✓' : formatContractMoney(total)}</strong>
      </div>
      <div className="ccc-month-facts">
        <div>
          <small>รอบบิล</small>
          <b>{shortDate(thisMonth.period_start)} ถึง {shortDate(thisMonth.period_end)}</b>
        </div>
        {!paid && thisMonth.due_date && (
          <div className="is-due">
            <small>ครบกำหนด</small>
            <b>{shortDate(thisMonth.due_date)}</b>
          </div>
        )}
        {!paid && thisMonth.overdue_months > 0 && (
          <div className="is-due">
            <small>ค้างรวม</small>
            <b>{thisMonth.overdue_months + 1} เดือน</b>
          </div>
        )}
        {deposit > 0 && (
          <div className="is-due">
            <small>รวมมัดจำ</small>
            <b>{formatContractMoney(deposit)}</b>
          </div>
        )}
      </div>
      <button type="button" className="ccc-month-bill" onClick={() => setBillOpen(true)}>
        <ContractIcon type="file" size={14} />
        ดูบิล
      </button>
      {billOpen && <RentBillModal contract={contract} thisMonth={thisMonth} viewer={viewer} onClose={() => setBillOpen(false)} />}
    </div>
  )
}

const TRANSFER_CHARGE_STATUS = { paid: 'ชำระแล้ว', pending: 'รอชำระ', rejected: 'รอชำระ' }
const TRANSFER_PREVIEW_COUNT = 2

function ContractTransferEntry({ transfer, order, viewer, detailed = false, depositAmount = null, focused = false }) {
  const imagesOpen = detailed
  const fromPrice = Number(transfer.from_price) || 0
  const toPrice = Number(transfer.to_price) || 0
  const diff = toPrice - fromPrice
  const periods = Number(transfer.chargeable_periods) || 0
  const totalDiff = Number(transfer.price_difference_total) || 0
  const depositBefore = Number(transfer.deposit_before) || 0
  const deducted = Number(transfer.deposit_deducted) || 0
  const depositAfter = Math.max(0, depositBefore - deducted)
  const charged = Number(transfer.amount_charged) || 0
  const contractDeposit = Number(depositAmount) || 0
  const yours = viewer === 'customer' ? 'ของคุณ' : ''
  const diffText = diff === 0 ? 'เท่าเดิม' : `${diff > 0 ? '+' : '−'}${formatContractMoney(Math.abs(diff))}/เดือน`
  const tiles = [
    {
      label: 'ค่าเช่าห้องใหม่',
      value: formatContractMoney(toPrice),
      note: diff === 0 ? 'เท่าห้องเดิม' : `${diff > 0 ? 'แพงขึ้น' : 'ถูกลง'} ${formatContractMoney(Math.abs(diff))}`,
      tone: diff > 0 ? 'is-warning' : diff < 0 ? 'is-success' : '',
    },
    {
      label: `มัดจำ${yours}หลังย้าย`,
      value: formatContractMoney(depositAfter),
      note: deducted > 0 ? `หักไป ${formatContractMoney(deducted)}` : 'ไม่ถูกหัก',
      tone: deducted > 0 ? 'is-warning' : 'is-success',
    },
    {
      label: 'ต้องจ่ายเพิ่ม',
      value: charged > 0 ? formatContractMoney(charged) : '฿0',
      note: charged > 0 ? TRANSFER_CHARGE_STATUS[transfer.charge_status] || 'รอชำระ' : 'ไม่มียอดเพิ่ม',
      tone: charged > 0 ? (transfer.charge_status === 'paid' ? 'is-success' : 'is-danger') : 'is-success',
    },
  ]
  const groups = [
    {
      title: 'ค่าเช่า',
      rows: [
        { label: 'ห้องเดิม', value: `${formatContractMoney(fromPrice)}/เดือน` },
        { label: 'ห้องใหม่', value: `${formatContractMoney(toPrice)}/เดือน`, tone: 'is-accent' },
        { label: 'ส่วนต่าง', value: diffText, tone: diff > 0 ? 'is-warning' : diff < 0 ? 'is-success' : '' },
        transfer.new_price_from && { label: 'เริ่มคิดราคาใหม่', value: `รอบ ${formatContractDate(transfer.new_price_from)}` },
      ],
    },
    {
      title: 'เงินมัดจำ',
      rows: [
        contractDeposit > 0 && { label: 'ตามสัญญา', value: formatContractMoney(contractDeposit) },
        { label: 'ก่อนย้าย', value: formatContractMoney(depositBefore) },
        { label: 'หักส่วนต่าง', value: deducted > 0 ? `− ${formatContractMoney(deducted)}` : 'ไม่หัก', tone: deducted > 0 ? 'is-warning' : 'is-success' },
        { label: 'หลังย้าย', value: formatContractMoney(depositAfter), tone: 'is-strong' },
        contractDeposit > 0 && depositAfter < contractDeposit && {
          label: 'ขาดจากที่สัญญากำหนด',
          value: formatContractMoney(contractDeposit - depositAfter),
          tone: 'is-muted',
        },
      ],
    },
    {
      title: 'ยอดชำระจากการย้าย',
      rows: [
        {
          label: 'ส่วนต่างที่ต้องชำระ',
          value: diff > 0
            ? `${formatContractMoney(totalDiff)} (${periods} รอบที่จ่ายแล้ว)`
            : diff === 0 ? 'ไม่มี · ราคาเท่าเดิม' : 'ไม่มี · ห้องใหม่ถูกกว่า',
          tone: totalDiff > 0 ? 'is-warning' : '',
        },
        totalDiff > 0 && { label: 'จ่ายด้วยเงินมัดจำ', value: formatContractMoney(deducted) },
        totalDiff > 0 && {
          label: 'เพิ่มในยอดชำระ',
          value: charged > 0 ? `${formatContractMoney(charged)} · ${TRANSFER_CHARGE_STATUS[transfer.charge_status] || 'รอชำระ'}` : 'ไม่มี',
          tone: charged > 0 ? (transfer.charge_status === 'paid' ? 'is-success' : 'is-danger') : 'is-success',
        },
        viewer !== 'customer' && transfer.approved_by_name && { label: 'อนุมัติโดย', value: transfer.approved_by_name },
      ],
    },
  ]
  return (
    <li data-transfer-id={transfer.id} className={focused ? 'is-focused' : undefined}>
      <div className="contract-transfer-route">
        <strong>
          <span className="contract-transfer-order">ครั้งที่ {order}</span>
          ห้อง {transfer.from_room_number} → ห้อง {transfer.to_room_number}
        </strong>
        <span className="contract-transfer-date">
          <ContractIcon type="calendar" size={13} />
          <span>ย้ายเมื่อ</span>
          <b>{formatContractDate(transfer.transferred_at, true)}</b>
        </span>
      </div>
      {detailed ? (
        <>
          <div className="contract-transfer-tiles">
            {tiles.map((tile) => (
              <div key={tile.label}>
                <span>{tile.label}</span>
                <strong>{tile.value}</strong>
                <small className={tile.tone}>{tile.note}</small>
              </div>
            ))}
          </div>
          <div className="contract-transfer-groups">
            {groups.map((group) => (
              <section key={group.title}>
                <h5>{group.title}</h5>
                <dl>
                  {group.rows.filter(Boolean).map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd className={row.tone}>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </>
      ) : (
        <dl>
          <div>
            <dt>ค่าเช่า/เดือน</dt>
            <dd>
              {formatContractMoney(fromPrice)} → <b className="is-accent">{formatContractMoney(toPrice)}</b>
            </dd>
          </div>
          {transfer.new_price_from && (
            <div>
              <dt>เริ่มคิดราคาใหม่</dt>
              <dd>รอบ {formatContractDate(transfer.new_price_from)}</dd>
            </div>
          )}
          <div>
            <dt>ส่วนต่างที่ต้องชำระ</dt>
            <dd className={totalDiff > 0 ? 'is-warning' : ''}>
              {diff > 0 ? formatContractMoney(totalDiff) : diff === 0 ? 'ราคาเท่าเดิม' : 'ห้องใหม่ถูกกว่า ไม่มีส่วนต่าง'}
            </dd>
          </div>
          <div>
            <dt>เงินมัดจำ{yours}</dt>
            <dd className="contract-transfer-deposit">
              <span className={deducted > 0 ? 'is-warning' : 'is-success'}>
                {deducted > 0 ? `หักส่วนต่าง ${formatContractMoney(deducted)}` : 'ไม่หักส่วนต่าง'}
              </span>
              <span className="is-strong">เหลือ {formatContractMoney(depositAfter)}</span>
            </dd>
          </div>
          {charged > 0 && (
            <div>
              <dt>เพิ่มในยอดชำระ</dt>
              <dd className={transfer.charge_status === 'paid' ? 'is-success' : 'is-danger'}>
                {formatContractMoney(charged)} · {TRANSFER_CHARGE_STATUS[transfer.charge_status] || 'รอชำระ'}
              </dd>
            </div>
          )}
        </dl>
      )}
      {transfer.new_images?.length > 0 && (
        <details className="contract-transfer-images" open={imagesOpen}>
          <summary>
            <span>รูปสัญญาใหม่หลังย้าย</span>
            <em>{transfer.new_images.length} รูป</em>
          </summary>
          <ContractGallery images={transfer.new_images} title="รูปสัญญาใหม่หลังย้ายห้อง" subtitle={`ห้อง ${transfer.to_room_number}`} />
        </details>
      )}
      {transfer.previous_images?.length > 0 && (
        <details className="contract-transfer-images is-old" open={imagesOpen}>
          <summary>
            <span>รูปสัญญาเดิมก่อนย้าย · เก็บไว้เป็นประวัติ</span>
            <em>{transfer.previous_images.length} รูป</em>
          </summary>
          <ContractGallery images={transfer.previous_images} title="รูปสัญญาเดิมก่อนย้ายห้อง" subtitle={`ห้อง ${transfer.from_room_number}`} />
        </details>
      )}
    </li>
  )
}

function ContractTransfersModal({ contract, viewer, onClose, focusId = null }) {
  const [closing, setClosing] = useState(false)
  const [search, setSearch] = useState('')
  const requestClose = () => setClosing(true)
  const transfers = contractTransfers(contract)
  const single = focusId !== null
  const keyword = search.trim().toLowerCase()
  const entries = transfers
    .map((transfer, index) => ({ transfer, order: index + 1 }))
    .reverse()
    .filter(({ transfer }) => !single || transfer.id === focusId)
    .filter(({ transfer, order }) =>
      single ||
      !keyword ||
      [
        `ครั้งที่ ${order}`,
        transfer.from_room_number,
        transfer.to_room_number,
        transfer.approved_by_name,
        formatContractDate(transfer.transferred_at, true),
        formatContractMoney(transfer.from_price),
        formatContractMoney(transfer.to_price),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || document.querySelector('.photo-lightbox, .photo-viewer')) return
      event.stopImmediatePropagation()
      setClosing(true)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  useEffect(() => {
    if (!closing) return undefined
    const timer = setTimeout(onClose, 110)
    return () => clearTimeout(timer)
  }, [closing, onClose])

  const name = `${contract.first_name || ''} ${contract.last_name || ''}`.trim()
  return createPortal(
    <div className={`rent-bill-overlay${closing ? ' is-closing' : ''}`} onClick={requestClose} role="presentation">
      <div
        className="rent-bill contract-transfers-modal"
        role="dialog"
        aria-modal="true"
        aria-label={single ? 'รายละเอียดการย้ายห้อง' : 'ประวัติการย้ายห้องทั้งหมด'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="rent-bill-head">
          <span className="rent-bill-icon"><ContractIcon type="file" size={18} /></span>
          <div>
            <strong>
              {single && entries[0]
                ? `รายละเอียดการย้ายห้อง ครั้งที่ ${entries[0].order}`
                : 'ประวัติการย้ายห้องทั้งหมด'}
            </strong>
            <span className="contract-transfers-modal-meta">
              <span>
                <i>ห้องปัจจุบัน</i>
                <b>{contract.room_number || '-'}</b>
              </span>
              {name && (
                <span>
                  <i>ผู้เช่า</i>
                  <b>{name}</b>
                </span>
              )}
              <span className="is-count">
                <i>ย้ายทั้งหมด</i>
                <b>{transfers.length} ครั้ง</b>
              </span>
            </span>
          </div>
          <button type="button" className="rent-bill-close" onClick={requestClose} aria-label="ปิด">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        {!single && (
          <div className="contract-transfers-modal-search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาเลขห้อง ผู้อนุมัติ วันที่ หรือ ครั้งที่"
              aria-label="ค้นหาประวัติการย้ายห้อง"
            />
            <span>พบ {entries.length} จาก {transfers.length} ครั้ง</span>
          </div>
        )}
        <div className="contract-transfers-modal-body contract-transfers">
          {entries.length === 0 ? (
            <p className="contract-transfers-empty">ไม่พบการย้ายห้องที่ตรงกับคำค้นหา</p>
          ) : (
            <ol>
              {entries.map(({ transfer, order }) => (
                <ContractTransferEntry
                  key={transfer.id}
                  transfer={transfer}
                  order={order}
                  viewer={viewer}
                  depositAmount={contract.deposit_amount}
                  detailed
                />
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ContractTransferHistory({ contract, viewer = 'staff' }) {
  const [showAll, setShowAll] = useState(false)
  const transfers = contractTransfers(contract)
  if (transfers.length === 0) return null
  const recent = transfers
    .map((transfer, index) => ({ transfer, order: index + 1 }))
    .slice(-TRANSFER_PREVIEW_COUNT)
    .reverse()
  const hidden = transfers.length - recent.length
  return (
    <section className="contract-transfers" aria-label="ประวัติการย้ายห้อง">
      <header>
        <ContractIcon type="file" size={15} />
        <strong>การย้ายห้อง (บันทึกแนบท้ายสัญญา)</strong>
        <span className="contract-transfers-count">ย้ายแล้ว {transfers.length} ครั้ง</span>
        <button type="button" className="contract-transfers-all" onClick={() => setShowAll(true)}>
          ดูทั้งหมด
        </button>
      </header>
      <p className="contract-transfers-note">
        {viewer === 'customer'
          ? 'สัญญาฉบับที่เซ็นไว้ยังใช้ต่อ ระบบบันทึกการย้ายห้องและการเปลี่ยนค่าเช่าไว้เป็นเอกสารแนบ'
          : 'รูปสัญญาฉบับเดิมไม่ถูกแก้ไข การเปลี่ยนห้องและค่าเช่าบันทึกเป็นประวัติแนบท้ายสัญญา'}
        {hidden > 0 ? ` · แสดงล่าสุด ${recent.length} ครั้ง` : ''}
      </p>
      <ol>
        {recent.map(({ transfer, order }) => (
          <ContractTransferEntry
            key={transfer.id}
            transfer={transfer}
            order={order}
            viewer={viewer}
            depositAmount={contract.deposit_amount}
          />
        ))}
      </ol>
      {hidden > 0 && (
        <button type="button" className="contract-transfers-more" onClick={() => setShowAll(true)}>
          ดูการย้ายก่อนหน้าอีก {hidden} ครั้ง
        </button>
      )}
      {showAll && <ContractTransfersModal contract={contract} viewer={viewer} onClose={() => setShowAll(false)} />}
    </section>
  )
}

function CustomerContractBody({ contract, viewer = 'customer' }) {
  const [now] = useState(() => Date.now())
  const { daysLeft, totalDays, usedDays } = contractTimeline(contract, now)
  const extended = contract.current_end_date && new Date(contract.current_end_date).getTime() !== new Date(contract.rental_end_date).getTime()
  const images = contract.images || []
  const transferred = (contract.room_transfers?.length ?? 0) > 0
  const rows = [
    { label: 'ผู้เช่า', value: `${contract.first_name} ${contract.last_name}` },
    { label: 'ระยะสัญญา', value: formatContractLength(contract) },
    { label: 'เริ่มสัญญา', value: formatContractDate(contract.rental_start_date, true), tone: 'is-date-start' },
    {
      label: 'สิ้นสุดสัญญา',
      value: formatContractDate(contract.rental_end_date, true),
      tone: extended ? 'is-date-old' : 'is-date-end',
    },
    ...(extended ? [{ label: 'ต่อสัญญาถึง', value: formatContractDate(contract.current_end_date, true), tone: 'is-date-renew' }] : []),
    { label: 'ระยะเวลาทั้งหมด', value: totalDays === null ? '-' : `${totalDays} วัน` },
    { label: 'ผ่านไปแล้ว', value: usedDays === null ? '-' : `${usedDays} วัน` },
    { label: 'เหลืออีก', value: formatDaysLeft(daysLeft), tone: daysLeft !== null && daysLeft <= 30 ? 'is-warning' : 'is-accent' },
    { label: 'ค่าเช่า/เดือน', value: formatContractMoney(contract.monthly_price), tone: transferred ? 'is-accent' : undefined },
    {
      label: 'เงินมัดจำ',
      value: formatDepositSummary(contract),
    },
    ...(Number(contract.deposit_transfer_deducted) > 0
      ? [
          { label: 'หักส่วนต่างย้ายห้อง', value: `− ${formatContractMoney(contract.deposit_transfer_deducted)}`, tone: 'is-warning' },
          { label: 'มัดจำคงเหลือ', value: formatContractMoney(contract.deposit_remaining), tone: 'is-accent' },
        ]
      : []),
    { label: 'ชำระเดือนแรก', value: formatContractMoney(contract.first_month_total), tone: 'is-accent' },
    {
      label: 'สถานะสัญญา',
      value: (CONTRACT_STATUS[contract.status] || CONTRACT_STATUS.active).label,
      tone: contract.status === 'active' ? 'is-accent' : ['awaiting_payment', 'payment_review'].includes(contract.status) ? 'is-warning' : undefined,
    },
  ]
  const depositStatus = contract.deposit_status
  const depositStatusLabel = DEPOSIT_STATUS_LABEL[depositStatus]

  return (
    <>
      <div className="ccc-hero">
        <ContractRoomBadge contract={contract} size="hero" />
        <div className="ccc-period csc-period">
          <ContractPeriodTimeline
            contract={contract}
            now={now}
            endLabel={extended ? 'ต่อสัญญาถึง' : 'สิ้นสุด'}
            endValue={contract.current_end_date || contract.rental_end_date}
          />
        </div>
      </div>

      <div className="ccc-grid">
        <div className="ccc-pane">
          <h3>รายละเอียดสัญญา</h3>
          <ContractFirstPaymentNote contract={contract} viewer={viewer} />
          <DepositRefundNote contract={contract} viewer={viewer} />
          {viewer === 'customer' && <DepositEarlyLeaveWarning contract={contract} />}
          <ContractMonthTrack
            start={contract.rental_start_date}
            end={contract.effective_end_date || contract.current_end_date || contract.rental_end_date}
            originalEnd={extended ? contract.rental_end_date : null}
            now={now}
          />
          <dl className="ccc-rows">
            {rows.map((row) => (
              <div key={row.label} className={row.tone}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <ContractTransferHistory contract={contract} viewer={viewer} />
          <div className="ccc-bill">
            <h3>
              ยอดตามสัญญารวมทุกเดือน
              <span>{contract.billing_periods || 0} รอบบิล</span>
            </h3>
            <p className="ccc-bill-period">
              ค่าเช่าทุกเดือนตลอดสัญญา {formatShortRange(contract.rental_start_date, contract.effective_end_date)}{' '}
              <em>{contract.billing_periods || 0} เดือน</em>
            </p>
            {transferred && contract.rent_breakdown?.length ? (
              <>
                {contract.rent_breakdown.map((line, index) => (
                  <div key={index}>
                    <span className="ccc-bill-line">
                      {line.kind === 'difference' ? (
                        `ส่วนต่างย้ายห้อง ${line.from_room_number} → ${line.room_number}`
                      ) : (
                        <>
                          {formatShortRange(line.from_date, line.to_date)}
                          <i>ห้อง {line.room_number}</i>
                          {line.periods > 1 && <small>{formatContractMoney(line.price)} × {line.periods} เดือน</small>}
                        </>
                      )}
                    </span>
                    <strong>{formatContractMoney(line.amount)}</strong>
                  </div>
                ))}
                <div className="ccc-bill-sum">
                  <span>รวมค่าเช่าตามสัญญา</span>
                  <strong>{formatContractMoney(contract.contract_total)}</strong>
                </div>
              </>
            ) : (
              <div>
                <span>ค่าเช่า {formatContractMoney(contract.monthly_price)} × {contract.billing_periods || 0} เดือน</span>
                <strong>{formatContractMoney(contract.contract_total)}</strong>
              </div>
            )}
            <div className="is-paid">
              <span>ชำระแล้ว</span>
              <strong>− {formatContractMoney(contract.rent_paid)}</strong>
            </div>
            {Number(contract.deposit_amount) > 0 && (
              <div className={`ccc-bill-deposit is-${depositStatus || 'none'}`}>
                <div className="ccc-bill-deposit-main">
                  <span>
                    เงินมัดจำ {formatDepositMonths(contract)}
                    {depositStatusLabel && <em>{depositStatusLabel}</em>}
                  </span>
                  <strong>
                    {formatContractMoney(
                      Number(contract.deposit_paid) > 0 ? contract.deposit_paid : contract.deposit_amount,
                    )}
                  </strong>
                </div>
                {Number(contract.deposit_transfer_deducted) > 0 && <DepositDeductions contract={contract} />}
              </div>
            )}
            <ThisMonthRent thisMonth={contract.this_month ?? null} contract={contract} viewer={viewer} />
            <p>เงินมัดจำ {formatDepositMonths(contract)} {formatContractMoney(contract.deposit_amount || 0)} ชำระพร้อมค่าห้องเดือนแรก · เดือนแรก {formatContractMoney(contract.first_month_total)}</p>
          </div>
        </div>
        <div className="ccc-pane ccc-gallery-pane">
          <h3>
            รูปสัญญา
            <span>{images.length} รูป</span>
          </h3>
          <div className="ccc-gallery-scroll">
            <ContractGallery images={images} subtitle={`ห้อง ${contract.room_number || '-'}`} />
          </div>
        </div>
      </div>
    </>
  )
}
