export const CONTRACT_DURATION_OPTIONS = [
  { value: 3, label: '3 เดือน' },
  { value: 6, label: '6 เดือน' },
  { value: 12, label: '12 เดือน (1 ปี)' },
]

export const CONTRACT_MIN_IMAGES = 5
export const CONTRACT_MAX_IMAGES = 10
export const ROOM_TRANSFER_MIN_CONTRACT_IMAGES = 5

export function completedContractsViewedKey() {
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    return `completed-contracts-viewed-${user.role || 'current'}-${user.id ?? user.username ?? 'current'}`
  } catch {
    return 'completed-contracts-viewed-current'
  }
}

export function readViewedContractIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(completedContractsViewedKey()) || '[]')
    return new Set(Array.isArray(saved) ? saved.map(String) : [])
  } catch {
    return new Set()
  }
}

export function formatContractMoney(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return `฿${number.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatContractDate(value, withTime = false) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function formatContractDuration(months) {
  if (!months && months !== 0) return '-'
  return CONTRACT_DURATION_OPTIONS.find((option) => option.value === Number(months))?.label || `${months} เดือน`
}

export function formatContractLength(contract) {
  const months = Number(contract?.contract_duration_months)
  if (months >= 1) return formatContractDuration(months)
  const start = contract?.rental_start_date ? new Date(contract.rental_start_date).getTime() : NaN
  const end = contract?.rental_end_date ? new Date(contract.rental_end_date).getTime() : NaN
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '-'
  return `${Math.max(1, Math.round((end - start) / 86400000))} วัน`
}

export function addContractMonths(date, months) {
  const start = new Date(date)
  const target = new Date(start.getFullYear(), start.getMonth() + Number(months), 1, start.getHours(), start.getMinutes())
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(start.getDate(), lastDay))
  return target
}

export const DEPOSIT_MONTHS = 2

export function firstMonthBreakdown(monthlyPrice, depositMonths = DEPOSIT_MONTHS) {
  const priceCents = Math.max(0, Math.round(Number(monthlyPrice) * 100) || 0)
  const months = Math.max(0, Number(depositMonths) || 0)
  const depositCents = priceCents * months
  return { price: priceCents / 100, depositMonths: months, deposit: depositCents / 100, total: (priceCents + depositCents) / 100 }
}

export const DEPOSIT_STATUS_LABEL = { paid: 'ชำระแล้ว', pending: 'รอตรวจสลิป', due: 'ยังไม่ชำระ' }

export function formatDepositSummary(contract) {
  if (!(Number(contract?.deposit_amount) > 0)) return 'ไม่มีมัดจำ'
  const status = DEPOSIT_STATUS_LABEL[contract.deposit_status]
  return `${formatContractMoney(contract.deposit_amount)} (${formatDepositMonths(contract)})${status ? ` · ${status}` : ''}`
}

export function formatDepositMonths(contract) {
  const months = Number(contract?.deposit_months)
  if (!(Number(contract?.deposit_amount) > 0)) return 'ไม่มีมัดจำ'
  return Number.isInteger(months) && months > 0 ? `${months} เดือน` : formatContractMoney(contract.deposit_amount)
}

export function completedContractSummaryTiles(summary) {
  const value = (key) => (summary ? summary[key] : '-')
  return [
    { key: 'total', icon: 'total', tone: 'blue', label: 'สัญญาทั้งหมด', value: value('total'), hint: summary?.archived ? `สัญญาเก่า ${summary.archived} ฉบับ` : null },
    { key: 'active', icon: 'vacant', tone: 'green', label: 'สัญญามีผล', value: value('active') },
    { key: 'awaiting', icon: 'slip', tone: 'amber', label: 'รอชำระงวดแรก', value: value('awaitingPayment') },
    { key: 'deposit', icon: 'due', tone: 'red', label: 'รอคืน/ริบมัดจำ', value: value('pendingDeposit'), alert: summary?.pendingDeposit > 0 },
    { key: 'transferred', icon: 'booked', tone: 'violet', label: 'ย้ายห้องแล้ว', value: value('transferred') },
    { key: 'ended-early', icon: 'request', tone: 'orange', label: 'ออกก่อนสัญญา', value: value('endedEarly') },
  ]
}
