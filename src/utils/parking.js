import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'

export const VISITOR_MAX_HOURS = 3
export const VEHICLE_TYPE_LABEL = { car: 'รถยนต์', motorcycle: 'รถจักรยานยนต์' }
export const USER_CATEGORY_LABEL = { resident: 'ผู้พักอาศัย', visitor: 'ผู้มาติดต่อ' }
export const FINE_STATUS_LABEL = { none: 'ไม่มีค่าปรับ', unpaid: 'ค้างชำระ', pending_review: 'รอตรวจสลิป', paid: 'ชำระแล้ว' }
export const FINE_STATUS_TONE = { none: 'muted', unpaid: 'danger', pending_review: 'warning', paid: 'success' }
export const HOUR_MS = 60 * 60 * 1000
export const PARKING_FORM_TOPICS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'owner', label: 'ผู้ใช้และข้อมูลรถ' },
  { key: 'time', label: 'วันเวลาจอด' },
  { key: 'space', label: 'ช่องจอด' },
  { key: 'extra', label: 'รูปและหมายเหตุ' },
]

export function formatBaht(value) {
  return `฿${(Number(value) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function toQueryDateTime(date) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

export function visitorEndFrom(startAt) {
  return startAt ? new Date(new Date(startAt).getTime() + VISITOR_MAX_HOURS * HOUR_MS) : null
}

export function getVisitorSession(item, finePerHour, now) {
  if (item?.user_category !== 'visitor' || item.request_type !== 'vehicle') return null
  if (item.checked_out_at) {
    return { state: 'done', overtimeHours: Number(item.fine_hours) || 0, amount: Number(item.fine_amount) || 0 }
  }
  if (!item.parked_at) return { state: 'waiting', overtimeHours: 0, amount: 0 }
  const parkedAt = new Date(item.parked_at).getTime()
  const allowedUntil = parkedAt + VISITOR_MAX_HOURS * HOUR_MS
  const overMs = now - allowedUntil
  const overtimeHours = overMs > 0 ? Math.ceil(overMs / HOUR_MS) : 0
  return {
    state: overtimeHours > 0 ? 'overtime' : 'parked',
    parkedAt,
    allowedUntil,
    remainingMs: Math.max(0, allowedUntil - now),
    overtimeHours,
    amount: overtimeHours * (Number(finePerHour) || 0),
  }
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

const EMPTY_OPTIONS = { key: '', spaces: [], settings: null, usage: null, hasUnpaidFine: false, error: '' }

export function useParkingOptions(endpoint, { enabled = true, userCategory, startAt, endAt, excludeId, roomNumber } = {}) {
  const [state, setState] = useState(EMPTY_OPTIONS)
  const [version, setVersion] = useState(0)
  const startKey = startAt ? toQueryDateTime(new Date(startAt)) : ''
  const endKey = endAt && userCategory !== 'visitor' ? toQueryDateTime(new Date(endAt)) : ''
  const requestKey = [endpoint, userCategory, startKey, endKey, excludeId || '', roomNumber || '', version].join('|')

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    axios
      .get(endpoint, {
        params: { userCategory, startAt: startKey || undefined, endAt: endKey || undefined, excludeId: excludeId || undefined, roomNumber: roomNumber || undefined },
        signal: controller.signal,
      })
      .then(({ data }) =>
        setState({
          key: requestKey,
          spaces: data.spaces || [],
          settings: data.settings || null,
          usage: data.usage || null,
          hasUnpaidFine: Boolean(data.hasUnpaidFine),
          residentWindow: data.residentWindow || null,
          error: '',
        }),
      )
      .catch((error) => {
        if (axios.isCancel(error)) return
        setState((current) => ({ ...current, key: requestKey, error: error.response?.data?.message || 'โหลดข้อมูลช่องจอดไม่สำเร็จ' }))
      })
    return () => controller.abort()
  }, [endpoint, enabled, userCategory, startKey, endKey, excludeId, roomNumber, requestKey])

  const reload = useCallback(() => setVersion((value) => value + 1), [])
  return { ...state, loading: enabled && state.key !== requestKey, reload }
}
