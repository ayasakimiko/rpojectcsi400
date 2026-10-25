import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'

export const MARKET_TAB = { key: 'market', label: 'พื้นที่ขายของ' }

const BELL_TONE = { warning: 'pending', danger: 'danger', success: 'success', info: 'info' }

export const MARKET_SECTION_OF = { stalls: 'stalls', bookings: 'bookings', leases: 'leases', api: 'api-keys' }

export function toBellNotification(item) {
  return {
    key: item.key,
    kind: 'market',
    title: item.title,
    label: `${MARKET_TAB.label} · ${item.detail}`,
    tone: BELL_TONE[item.tone] || 'info',
    date: item.date,
    preview: item.detail,
    previewLabel: MARKET_TAB.label,
    marketSection: MARKET_SECTION_OF[item.section] || 'stalls',
  }
}

export function useMarketNotifications(enabled = true, apiBase = '/api/admin/market') {
  const [items, setItems] = useState([])
  const load = useCallback(() => {
    if (!enabled) return undefined
    return axios.get(`${apiBase}/notifications`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
      .then(({ data }) => setItems(data.notifications || []))
      .catch(() => setItems([]))
  }, [apiBase, enabled])

  useEffect(() => {
    load()
  }, [load])

  return { items, setItems, reload: load }
}
