import { DEPOSIT_MONTHS, formatContractDate, formatContractMoney } from '../utils/rentalContract.js'
import './RoomTransferFinance.css'

const money = (value) => formatContractMoney(Number(value) || 0)
const amount = (value) => Number(value) || 0

function FinanceRow({ label, value, note, tone }) {
  return (
    <div className={`rtf-row${tone ? ` ${tone}` : ''}`}>
      <dt>
        {label}
        {note && <small>{note}</small>}
      </dt>
      <dd>{value}</dd>
    </div>
  )
}

export default function RoomTransferFinance({ finance, fromPrice, toPrice, final = false, chargeStatus = null, compact = false }) {
  if (!finance) return null
  const oldPrice = amount(fromPrice)
  const newPrice = amount(toPrice)
  const damage = amount(finance.damage_deduction)
  const topup = amount(finance.deposit_topup)
  const surplus = amount(finance.deposit_surplus_credit)
  const rentCharge = amount(finance.rent_charge)
  const rentCredit = amount(finance.rent_credit_to_deposit)
  const excess = amount(finance.deposit_excess_refund)
  const charge = amount(finance.additional_charge)
  const remainingDays = amount(finance.remaining_days)
  const periodDays = amount(finance.period_days)
  const periods = amount(finance.chargeable_periods)
  const carry = amount(finance.rent_carry_credit)
  const rentDiffTotal = amount(finance.rent_difference)
  const newModel = finance.rent_carry_credit !== undefined
  const rentAfterMove = newModel && (!final || Boolean(finance.rent_charge_after_move))
  const rentStatus = finance.rent_charge_status
  const credited = surplus + rentCredit - excess
  const chargeNote = charge > 0
    ? chargeStatus === 'paid' ? 'ชำระแล้ว' : final ? 'รอชำระ' : 'ต้องชำระก่อนย้ายห้อง'
    : 'ไม่มียอดเก็บก่อนย้าย'
  const priceDiff = newPrice - oldPrice
  const fullMonths = (price, total) => Math.round(price * periods * 100) === Math.round(amount(total) * 100)
  const spanNote = (price, total) => {
    if (periods === 1 && periodDays > 0) {
      return <><em className="rtf-status">{money(price)}</em> ÷ {periodDays} วัน × {remainingDays} วัน</>
    }
    return fullMonths(price, total)
      ? <><em className="rtf-status">{money(price)}</em> × {periods} เดือน</>
      : `คิดตาม ${remainingDays} วัน`
  }
  const paidThroughText = finance.paid_through ? formatContractDate(finance.paid_through) : null
  const spanText = periods > 1 ? `${periods} เดือน` : `${remainingDays} วัน`
  const moveNew = amount(finance.move_period_new_rent)
  const showCatchUp = remainingDays > 0 && rentDiffTotal !== 0
  const schedule = []
  if (rentAfterMove && rentCharge > 0 && periods > 1 && newPrice > 0) {
    const start = finance.next_period_start ? new Date(finance.next_period_start) : null
    let credit = carry
    for (let index = 0; index < periods - 1; index += 1) {
      const applied = Math.min(newPrice, credit)
      credit -= applied
      schedule.push({
        key: index,
        date: start ? new Date(start.getFullYear(), start.getMonth() + index, start.getDate()) : null,
        applied,
        bill: newPrice - applied,
      })
    }
  }
  const chargeParts = [
    !rentAfterMove && rentCharge > 0 && { label: 'ส่วนต่างค่าเช่า', value: rentCharge },
    topup > 0 && { label: 'มัดจำเพิ่ม', value: topup },
  ].filter(Boolean)
  const afterMoveNote = rentCharge > 0
    ? final
      ? rentStatus === 'paid' ? 'ชำระแล้ว' : 'ส่งบิลให้ผู้เช่าแล้ว รอชำระ'
      : 'เก็บหลังย้ายห้องสำเร็จ'
    : rentCredit > 0 ? 'ห้องใหม่ถูกกว่า ไม่มีส่วนต่าง' : 'ไม่มีส่วนต่าง'

  return (
    <div className={`rtf${compact ? ' is-compact' : ''}`}>
      {newPrice > 0 && (
        <div className="rtf-rent">
          <div>
            <small>ค่าเช่าห้องใหม่</small>
            <strong>{money(newPrice)}<em>/เดือน</em></strong>
          </div>
          {oldPrice > 0 && (
            <span>
              จากเดิม {money(oldPrice)}/เดือน
              {priceDiff !== 0 && (
                <b className={priceDiff > 0 ? 'is-up' : 'is-down'}>
                  {priceDiff > 0 ? 'แพงขึ้น' : 'ถูกลง'} {money(Math.abs(priceDiff))}/เดือน
                </b>
              )}
            </span>
          )}
        </div>
      )}
      <div className="rtf-tiles">
        <div className={`rtf-tile ${charge > 0 && chargeStatus !== 'paid' ? 'is-due' : 'is-success'}`}>
          <small>ต้องชำระก่อนย้าย</small>
          <strong>{charge > 0 ? money(charge) : '฿0'}</strong>
          {charge > 0 && chargeParts.length > 0 ? (
            <ul className="rtf-breakdown">
              {chargeParts.map((part) => (
                <li key={part.label}>
                  <span>{part.label}</span>
                  <span>{money(part.value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span>{chargeNote}</span>
          )}
        </div>
        {rentAfterMove && (
          <div className="rtf-tile is-success is-highlight">
            <small>เก็บหลังย้ายสำเร็จ</small>
            <strong>{rentCharge > 0 ? money(rentCharge) : '฿0'}</strong>
            <span>
              {rentCharge > 0 ? (
                <>ส่วนต่างค่าเช่าเดือนที่ย้ายเข้า · <em className="rtf-status">{afterMoveNote}</em></>
              ) : afterMoveNote}
            </span>
          </div>
        )}
        <div className="rtf-tile is-brand">
          <small>เงินมัดจำที่คืนได้หลังย้าย</small>
          <strong>{money(finance.deposit_after)}</strong>
          <span>ผูกกับห้องใหม่ คืนตามเงื่อนไขสัญญา</span>
        </div>
        <div className={`rtf-tile ${credited > 0 ? 'is-success' : ''}`}>
          <small>เครดิตเพิ่มเข้ามัดจำ</small>
          <strong>{credited > 0 ? `+${money(credited)}` : '฿0'}</strong>
          <span>{credited > 0 ? 'ไม่นำไปหักค่าเช่า' : 'ไม่มีส่วนเกิน'}</span>
        </div>
      </div>

      <div className="rtf-grid">
        <section className="rtf-block">
          <h5>เงินมัดจำ</h5>
          <dl>
            <FinanceRow label="เงินมัดจำห้องเดิม" value={money(finance.deposit_before)} />
            <FinanceRow
              label="หักค่าเสียหาย (จากผลตรวจห้อง)"
              value={damage > 0 ? `− ${money(damage)}` : 'ไม่มี'}
              tone={damage > 0 ? 'is-warning' : 'is-muted'}
            />
            <FinanceRow label="มัดจำคงเหลือที่โอนได้" value={money(finance.transferable_deposit)} tone="is-strong" />
            <FinanceRow
              label="มัดจำที่ห้องใหม่ต้องมี"
              note={newPrice > 0 ? `${DEPOSIT_MONTHS} เดือน × ${money(newPrice)}` : null}
              value={money(finance.required_deposit)}
            />
            <FinanceRow label="โอนมัดจำเดิมไปห้องใหม่" value={money(finance.deposit_applied)} />
            <FinanceRow
              label="ต้องชำระมัดจำเพิ่ม"
              value={topup > 0 ? money(topup) : 'ไม่ต้อง'}
              tone={topup > 0 ? 'is-danger' : 'is-success'}
            />
            <FinanceRow
              label="มัดจำส่วนเกิน → เครดิตมัดจำที่คืนได้"
              value={surplus > 0 ? `+${money(surplus)}` : 'ไม่มี'}
              tone={surplus > 0 ? 'is-success' : 'is-muted'}
            />
          </dl>
        </section>

        <section className="rtf-block">
          <h5>ค่าเช่าที่จ่ายแล้ว (คิดตามวันที่เหลือ)</h5>
          <dl>
            <FinanceRow
              label={final ? 'วันที่ย้ายสำเร็จ' : 'คำนวณ ณ วันที่'}
              value={finance.move_date ? formatContractDate(finance.move_date) : '-'}
            />
            <FinanceRow label="ชำระค่าเช่าห้องเดิมถึง" value={finance.paid_through ? formatContractDate(finance.paid_through) : 'ยังไม่มีรอบที่จ่ายล่วงหน้า'} />
            <FinanceRow
              label="วันที่จ่ายแล้วแต่ยังไม่ได้ใช้"
              value={remainingDays > 0 ? `${remainingDays} วัน` : '0 วัน'}
              note={remainingDays > 0 && periodDays > 0 ? (periods > 1 ? `ครอบคลุม ${periods} รอบบิล` : `จากรอบบิล ${periodDays} วัน`) : null}
            />
            {oldPrice > 0 && <FinanceRow label="ค่าเช่าห้องเดิม" value={`${money(oldPrice)}/เดือน`} />}
            <FinanceRow
              label="ค่าเช่าที่จ่ายไว้แล้วแต่ยังไม่ได้ใช้"
              note={remainingDays > 0 ? spanNote(oldPrice, finance.old_unused_rent) : null}
              value={money(finance.old_unused_rent)}
              tone="is-strong"
            />
            {!rentAfterMove && (
              <FinanceRow
                label="ต้องชำระส่วนต่างค่าเช่า"
                value={rentCharge > 0 ? money(rentCharge) : 'ไม่ต้อง'}
                tone={rentCharge > 0 ? 'is-danger' : 'is-success'}
              />
            )}
            <FinanceRow
              label="ค่าเช่าเหลือ → แปลงเป็นเครดิตมัดจำ"
              value={rentCredit > 0 ? `+${money(rentCredit)}` : 'ไม่มี'}
              tone={rentCredit > 0 ? 'is-success' : 'is-muted'}
            />
          </dl>
        </section>
      </div>

      {showCatchUp && (
        <section className={`rtf-catchup ${rentDiffTotal > 0 ? 'is-up' : 'is-down'}`}>
          <h5>{rentDiffTotal > 0 ? 'ทำไมต้องจ่ายค่าเช่าเพิ่ม' : 'ค่าเช่าที่จ่ายเกินไว้'}</h5>
          <p className="rtf-catchup-reason">
            ผู้เช่าจ่ายค่าเช่าห้องเดิมไว้แล้ว
            {paidThroughText && <>ถึง <em className="rtf-status">{paidThroughText}</em></>}
            {' '}(อีก <em className="rtf-status">{spanText}</em>) ในราคา <em className="rtf-status">{money(oldPrice)}</em>/เดือน
            {rentDiffTotal > 0 ? (
              <> แต่ช่วงนั้นจะได้อยู่ห้องใหม่ราคา <em className="rtf-status">{money(newPrice)}</em>/เดือน จึงต้องจ่ายเพิ่มเฉพาะส่วนที่ยังขาด</>
            ) : (
              <> แต่ห้องใหม่ถูกกว่า (<em className="rtf-status">{money(newPrice)}</em>/เดือน) ส่วนที่จ่ายเกินไม่หายไป ระบบเก็บเป็นเครดิตให้</>
            )}
          </p>
          <dl>
            <FinanceRow label="จ่ายไว้แล้ว (ราคาห้องเดิม)" note={spanNote(oldPrice, finance.old_unused_rent)} value={money(finance.old_unused_rent)} />
            <FinanceRow label="ถ้าคิดราคาห้องใหม่ ช่วงเดียวกัน" note={spanNote(newPrice, finance.new_prorated_rent)} value={money(finance.new_prorated_rent)} />
            {rentDiffTotal > 0 ? (
              <FinanceRow
                label="ต้องจ่ายเพิ่มรวม"
                note={rentAfterMove && schedule.length > 0 ? 'ไม่ได้เก็บก้อนเดียว แบ่งจ่ายตามรอบด้านล่าง' : null}
                value={money(rentDiffTotal)}
                tone="is-strong"
              />
            ) : (
              <FinanceRow label="จ่ายเกินไว้ → เป็นเครดิต" value={`+${money(Math.abs(rentDiffTotal))}`} tone="is-success" />
            )}
          </dl>
          {rentAfterMove && rentCharge > 0 && (
            <>
              <p className="rtf-catchup-sub">จะแบ่งจ่ายตามรอบด้านล่าง</p>
              <ol className="rtf-schedule">
                <li>
                  <span>
                    <b>หลังย้ายสำเร็จ</b>
                    <small>
                      {moveNew > 0 ? (
                        <>
                          ค่าห้องใหม่เดือนที่ย้ายเข้า <em className="rtf-status">{money(moveNew)}</em> ลดให้{' '}
                          <em className="rtf-status">{money(moveNew - rentCharge)}</em>{' '}
                          {periods > 1 ? 'จากค่าเช่าที่จ่ายล่วงหน้าไว้ทั้งหมด' : 'เพราะจ่ายไว้แล้วตอนอยู่ห้องเดิม'}
                        </>
                      ) : 'ส่วนต่างค่าเช่าเดือนที่ย้ายเข้า'}
                      {final ? ` · ${afterMoveNote}` : ''}
                    </small>
                  </span>
                  <strong>{money(rentCharge)}</strong>
                </li>
                {schedule.map((row, index) => (
                  <li key={row.key}>
                    <span>
                      <b>บิลรอบ {row.date ? formatContractDate(row.date) : `เดือนที่ ${index + 2}`}</b>
                      <small>
                        {row.applied > 0 ? (
                          <>
                            ค่าห้อง <em className="rtf-status">{money(newPrice)}</em> ลดให้{' '}
                            <em className="rtf-status">{money(row.applied)}</em> จากค่าเช่าที่จ่ายล่วงหน้าไว้ซึ่งยังเหลืออยู่
                          </>
                        ) : (
                          <>จ่ายค่าห้องเต็ม <em className="rtf-status">{money(newPrice)}</em> เพราะค่าเช่าที่จ่ายล่วงหน้าไว้ใช้ลดครบแล้ว</>
                        )}
                      </small>
                    </span>
                    <strong>{money(row.bill)}</strong>
                  </li>
                ))}
              </ol>
              <p className="rtf-catchup-foot">หลังจากนั้นจ่ายค่าเช่า {money(newPrice)}/เดือน ตามปกติ</p>
            </>
          )}
          {rentDiffTotal <= 0 && (rentCredit > 0 || carry > 0) && (
            <ol className="rtf-schedule">
              {rentCredit > 0 && (
                <li>
                  <span><b>เดือนที่ย้ายเข้า</b><small>ส่วนที่จ่ายเกิน → เครดิตมัดจำ (คืนได้ตอนย้ายออก)</small></span>
                  <strong>+{money(rentCredit)}</strong>
                </li>
              )}
              {carry > 0 && (
                <li>
                  <span><b>บิลรอบถัดไป</b><small>ค่าเช่าที่จ่ายไว้แล้ว นำไปหักบิลค่าเช่าห้องใหม่</small></span>
                  <strong>+{money(carry)}</strong>
                </li>
              )}
            </ol>
          )}
        </section>
      )}

      <section className="rtf-total">
        <h5>สรุปยอดเงิน</h5>
        <dl>
          <FinanceRow
            label="เงินมัดจำที่คืนได้รวม"
            note={
              <>
                มัดจำห้องใหม่ <em className="rtf-status">{money(finance.required_deposit)}</em>
                {surplus > 0 && <> + ส่วนเกินมัดจำเดิม <em className="rtf-status">{money(surplus)}</em></>}
                {rentCredit > 0 && <> + เครดิตค่าเช่า <em className="rtf-status">{money(rentCredit)}</em></>}
                {excess > 0 && <> − คืนส่วนเกิน <em className="rtf-status">{money(excess)}</em></>}
              </>
            }
            value={money(finance.deposit_after)}
            tone="is-strong is-highlight"
          />
          {excess > 0 && (
            <FinanceRow
              label="ส่วนเกินเพดานมัดจำ ต้องคืนผู้เช่า"
              note={finance.deposit_limit != null ? `เพดานมัดจำ ${money(finance.deposit_limit)}` : null}
              value={money(excess)}
              tone="is-warning"
            />
          )}
          <FinanceRow label="ยอดที่ต้องชำระก่อนย้าย" note={chargeNote} value={charge > 0 ? money(charge) : '฿0'} tone={`${charge > 0 && chargeStatus !== 'paid' ? 'is-due' : 'is-success'} is-highlight`} />
          {rentAfterMove && rentCharge > 0 && (
            <FinanceRow
              label="เก็บหลังย้ายสำเร็จ"
              note={<>ค่าเช่าเดือนที่ย้ายเข้า หักค่าเช่าที่จ่ายไว้แล้ว · <em className="rtf-status">{afterMoveNote}</em></>}
              value={money(rentCharge)}
              tone="is-success is-highlight"
            />
          )}
        </dl>
      </section>
      {!compact && (
        <p className="rtf-note">
          ก่อนย้ายเก็บเฉพาะเงินมัดจำเพิ่ม · ส่วนต่างค่าเช่าเดือนที่ย้ายเข้าเก็บหลังย้ายสำเร็จ · เดือนถัดไปจ่ายค่าเช่ารายเดือนตามราคาห้องใหม่ตามปกติ
        </p>
      )}
    </div>
  )
}
