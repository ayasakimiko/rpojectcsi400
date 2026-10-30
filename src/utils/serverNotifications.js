import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'

// Fallback only; changes normally arrive through the /notifications/wait long poll.
const POLL_MS = 60000

const KIND_BY_TYPE_PREFIX = [
  ['tenant_request', 'tenant'],
  ['renew', 'tenant'],
  ['maintenance', 'maintenance'],
  ['slip', 'slip'],
  ['payment', 'slip'],
  ['fine', 'visit'],
  ['visit', 'visit'],
  ['safety', 'safety'],
  ['staff', 'staff'],
  ['tenant_registered', 'staff'],
  ['waiting', 'staff'],
]

function kindOf(type = '') {
  return KIND_BY_TYPE_PREFIX.find(([prefix]) => type.startsWith(prefix))?.[1] || 'document'
}

export function toBellItem(row, pending = false) {
  return {
    key: pending ? `pending-${row.key}` : `server-${row.id}`,
    serverId: pending ? null : row.id,
    type: row.type || null,
    actorName: row.actor_name || null,
    isRead: pending ? null : Boolean(row.is_read),
    title: row.title,
    label: row.message,
    tone: row.tone || 'info',
    date: row.created_at,
    preview: row.detail || null,
    previewLabel: 'รายละเอียด',
    detail: row.detail || null,
    details: [
      { label: 'สถานะ', value: row.message },
      row.detail && { label: 'รายละเอียด', value: row.detail },
      row.actor_name && { label: 'ดำเนินการโดย', value: row.actor_name },
    ].filter(Boolean),
    kind: row.kind || kindOf(row.type),
    target: row.target || null,
    refId: row.ref_id ?? null,
    refTable: row.ref_table || null,
    server: true,
  }
}

function timeOf(item) {
  const value = typeof item.date === 'string' ? item.date.replace(/^(\d{4}-\d{2}-\d{2}) (?=\d)/, '$1T') : item.date
  const time = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}

// Newest first. Reminders dated in the future (due bills, contracts about to end) count as
// "now" so they do not stay pinned above newer events; items without a valid date go last.
export function sortNewestFirst(items, now = Date.now()) {
  return items
    .map((item) => ({ item, time: Math.min(timeOf(item), now) }))
    .sort((a, b) => (b.time > a.time) - (b.time < a.time))
    .map(({ item }) => item)
}

export function isUnread(item, seenKeys) {
  if (item.serverId) return !item.isRead
  return seenKeys.has ? !seenKeys.has(item.key) : !seenKeys.includes(item.key)
}

// The page area a notification leads to; reading one item also reads the other unread
// items about the same subject (same title in the same area), and nothing else.
export function topicOf(item) {
  return item.target ? item.target.split(':')[0] : item.kind || ''
}

const sameSubject = (a, b) => a.key === b.key || (a.title === b.title && topicOf(a) === topicOf(b))

const MAX_SEEN_KEYS = 1000
const RETRY_MS = 5000

function readSeenKeys(storageKey) {
  if (!storageKey) return new Set()
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return new Set(Array.isArray(stored) ? stored : [])
  } catch {
    return new Set()
  }
}

// Read state for one bell: server events are tracked per account on the server, items the
// page derives itself are remembered per browser under storageKey.
export function useNotificationReads(storageKey, serverFeed) {
  const [seen, setSeen] = useState(() => ({ storageKey, keys: readSeenKeys(storageKey) }))
  let seenKeys = seen.keys
  if (seen.storageKey !== storageKey) {
    seenKeys = readSeenKeys(storageKey)
    setSeen({ storageKey, keys: seenKeys })
  }
  const { markRead: markServerRead } = serverFeed

  const markRead = useCallback((item, notifications) => {
    const items = notifications.filter((other) => sameSubject(other, item) && isUnread(other, seenKeys))
    if (!items.some((other) => other.key === item.key) && isUnread(item, seenKeys)) items.push(item)
    markServerRead(items.filter((other) => other.serverId).map((other) => other.serverId))
    const keys = items.filter((other) => !other.serverId).map((other) => other.key)
    if (keys.length === 0) return
    const next = new Set([...keys, ...seenKeys].slice(0, MAX_SEEN_KEYS))
    setSeen({ storageKey, keys: next })
    try {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify([...next]))
    } catch (error) {
      console.warn('Could not save seen notifications', error)
    }
  }, [markServerRead, seenKeys, storageKey])

  return { seenKeys, markRead }
}

export function useServerNotifications(apiBase, { pendingKinds = [], enabled = true, onNewEvents } = {}) {
  const [events, setEvents] = useState([])
  const [pending, setPending] = useState([])
  const newestId = useRef(0)
  const readIds = useRef(new Set())
  const onNewEventsRef = useRef(onNewEvents)
  const kinds = pendingKinds.join(',')

  useEffect(() => {
    onNewEventsRef.current = onNewEvents
  }, [onNewEvents])

  // Resolves true when it already told the page about new events.
  const refresh = useCallback(() => axios
    .get(`${apiBase}/notifications`, {
      params: kinds ? { pending: kinds } : undefined,
    })
    .then(({ data }) => {
      const rows = data.notifications || []
      const newest = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0)
      const fresh = Boolean(newestId.current && newest > newestId.current)
      if (fresh) onNewEventsRef.current?.()
      newestId.current = Math.max(newestId.current, newest)
      // A read posted a moment ago may not be visible to this response yet.
      setEvents(rows.map((row) => toBellItem(readIds.current.has(row.id) ? { ...row, is_read: true } : row)))
      setPending((data.pending || []).map((row) => toBellItem(row, true)))
      return fresh
    })
    .catch(() => false), [apiBase, kinds])

  useEffect(() => {
    if (!enabled) return undefined
    const first = setTimeout(refresh, 0)
    const timer = setInterval(refresh, POLL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [enabled, refresh])

  // Live updates: /notifications/wait answers as soon as anything this bell shows changes.
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    let cursor = null
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    ;(async () => {
      while (!controller.signal.aborted) {
        try {
          const { data } = await axios.get(`${apiBase}/notifications/wait`, {
            params: cursor ? { cursor } : undefined,
            signal: controller.signal,
            timeout: 40000,
          })
          cursor = data.cursor
          if (data.changed && !(await refresh())) onNewEventsRef.current?.()
        } catch {
          if (controller.signal.aborted) return
          await pause(RETRY_MS)
        }
      }
    })()
    return () => controller.abort()
  }, [apiBase, enabled, refresh])

  const markRead = useCallback((ids) => {
    const unread = ids.filter((id) => !readIds.current.has(id))
    if (unread.length === 0) return
    unread.forEach((id) => readIds.current.add(id))
    setEvents((current) => current.map((item) => (unread.includes(item.serverId) ? { ...item, isRead: true } : item)))
    axios.post(`${apiBase}/notifications/read`, { ids: unread }).catch(() => {
      unread.forEach((id) => readIds.current.delete(id))
    })
  }, [apiBase])

  const markAllRead = useCallback(() => {
    if (!events.some((item) => !item.isRead)) return
    events.forEach((item) => readIds.current.add(item.serverId))
    setEvents((current) => current.map((item) => ({ ...item, isRead: true })))
    axios.post(`${apiBase}/notifications/read`, { all: true }).catch(() => {})
  }, [apiBase, events])

  return { events, pending, markRead, markAllRead, refresh }
}

export function takeNotificationDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (!tab) return null
    const link = { tab, section: params.get('section'), focus: params.get('focus') }
    window.history.replaceState(null, '', window.location.pathname)
    return link
  } catch {
    return null
  }
}
