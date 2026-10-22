export const CONTRACT_DURATION_OPTIONS = [
  { value: 1, label: '1 เดือน' },
  { value: 3, label: '3 เดือน' },
  { value: 6, label: '6 เดือน' },
  { value: 12, label: '12 เดือน (1 ปี)' },
]

export const CONTRACT_MIN_IMAGES = 3
export const CONTRACT_MAX_IMAGES = 10

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

export function firstMonthBreakdown(monthlyPrice, depositAmount) {
  const priceCents = Math.max(0, Math.round(Number(monthlyPrice) * 100) || 0)
  const depositCents = Math.min(priceCents, Math.max(0, Math.round((Number(depositAmount) || 0) * 100)))
  return { price: priceCents / 100, depositApplied: depositCents / 100, remaining: (priceCents - depositCents) / 100 }
}
