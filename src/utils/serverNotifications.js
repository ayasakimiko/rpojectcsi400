import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'

// Bell feed served by GET {apiBase}/notifications:
//  - events: stored notifications ("approved by X", results for the tenant, contract reminders).
//    Their read state lives on the server, so it follows the user across devices.
//  - pending: work still waiting, derived from current data; it disappears once handled.

const POLL_MS = 20000

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

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
    server: true,
  }
}

// Unread when the server says so (events) or when the local seen list lacks the key.
export function isUnread(item, seenKeys) {
  if (item.serverId) return !item.isRead
  return seenKeys.has ? !seenKeys.has(item.key) : !seenKeys.includes(item.key)
}

export function useServerNotifications(apiBase, { pendingKinds = [], enabled = true, onNewEvents } = {}) {
  const [events, setEvents] = useState([])
  const [pending, setPending] = useState([])
  const newestId = useRef(0)
  const onNewEventsRef = useRef(onNewEvents)
  const kinds = pendingKinds.join(',')

  useEffect(() => {
    onNewEventsRef.current = onNewEvents
  }, [onNewEvents])

  const refresh = useCallback(async () => {
    try {
      const { data } = await axios.get(`${apiBase}/notifications`, {
        headers: authHeaders(),
        params: kinds ? { pending: kinds } : undefined,
      })
      const rows = data.notifications || []
      const newest = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0)
      // Someone else acted: let the page reload its own lists so handled items drop out now.
      if (newestId.current && newest > newestId.current) onNewEventsRef.current?.()
      newestId.current = Math.max(newestId.current, newest)
      setEvents(rows.map((row) => toBellItem(row)))
      setPending((data.pending || []).map((row) => toBellItem(row, true)))
    } catch {
      // Keep the last feed; the page's own error handling covers expired sessions.
    }
  }, [apiBase, kinds])

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

  const markAllRead = useCallback(() => {
    if (!events.some((item) => !item.isRead)) return
    setEvents((current) => current.map((item) => ({ ...item, isRead: true })))
    axios.post(`${apiBase}/notifications/read`, { all: true }, { headers: authHeaders() }).catch(() => {})
  }, [apiBase, events])

  return { events, pending, markAllRead, refresh }
}

// Owner opens Staff/Admin pages through ?tab=...&section=...&focus=...; returns and clears it.
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
