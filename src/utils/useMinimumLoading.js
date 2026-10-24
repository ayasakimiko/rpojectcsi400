import { useEffect, useRef, useState } from 'react'

export const LOADING_MIN_MS = 600
export const LOADING_FADE_MS = 250

export default function useMinimumLoading(loading, minMs = LOADING_MIN_MS) {
  const [visible, setVisible] = useState(loading)
  const [leaving, setLeaving] = useState(false)
  const startedAt = useRef(null)

  if (loading && (!visible || leaving)) {
    setVisible(true)
    setLeaving(false)
  }

  useEffect(() => {
    if (loading) {
      if (startedAt.current === null) startedAt.current = performance.now()
      return undefined
    }
    if (startedAt.current === null) return undefined
    const remaining = Math.max(0, minMs - (performance.now() - startedAt.current))
    let hideTimer
    const leaveTimer = setTimeout(() => {
      setLeaving(true)
      hideTimer = setTimeout(() => {
        startedAt.current = null
        setVisible(false)
        setLeaving(false)
      }, LOADING_FADE_MS)
    }, remaining)
    return () => {
      clearTimeout(leaveTimer)
      clearTimeout(hideTimer)
    }
  }, [loading, minMs])

  return { visible, leaving }
}
