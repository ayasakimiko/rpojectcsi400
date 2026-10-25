import { useEffect, useState } from 'react'
import axios from 'axios'
import { ISSUE_RESULTS, RESULT_LABELS } from './inspectionChecklist.js'

export function useMoveInBaseline(roomNumber) {
  const [state, setState] = useState({ room: null, baseline: null, error: '' })

  useEffect(() => {
    if (!roomNumber) return undefined
    let active = true
    axios
      .get(`/api/staff/move-out-inspections/move-in-baseline/${roomNumber}`)
      .then(({ data }) => {
        if (active) setState({ room: String(roomNumber), baseline: data.baseline, error: '' })
      })
      .catch((error) => {
        if (active) setState({ room: String(roomNumber), baseline: null, error: error.response?.data?.message || 'ไม่สามารถโหลดผลตรวจก่อนเข้าอยู่ได้' })
      })
    return () => {
      active = false
    }
  }, [roomNumber])

  if (!roomNumber) return { loading: false, baseline: null, error: '' }
  if (state.room !== String(roomNumber)) return { loading: true, baseline: null, error: '' }
  return { loading: false, baseline: state.baseline, error: state.error }
}

const SEVERITY = { good: 0, not_applicable: 0, wear: 1, damaged: 2, missing: 2 }

export function changeBetween(before, after) {
  if (!(before in SEVERITY) || !(after in SEVERITY)) return 'unknown'
  if (ISSUE_RESULTS.includes(after) && !ISSUE_RESULTS.includes(before)) return 'new'
  if (SEVERITY[after] > SEVERITY[before]) return 'worse'
  if (SEVERITY[after] < SEVERITY[before]) return 'better'
  return 'same'
}

export function compareWithMoveIn(before, after) {
  if (!before) return { label: 'ตอนเข้าอยู่: ไม่ได้บันทึก', tone: 'muted', isNew: false }
  const isNew = ISSUE_RESULTS.includes(after) && !ISSUE_RESULTS.includes(before)
  const tone = isNew ? 'new' : ISSUE_RESULTS.includes(before) ? 'issue' : before === 'wear' ? 'wear' : 'good'
  return { label: `ตอนเข้าอยู่: ${RESULT_LABELS[before] || before}`, tone, isNew }
}
