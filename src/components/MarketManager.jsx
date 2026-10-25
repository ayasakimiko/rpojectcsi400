import { useCallback, useEffect, useState } from 'react'
import MarketStalls from './MarketStalls.jsx'
import MarketLeases from './MarketLeases.jsx'
import MarketApiAccess from './MarketApiAccess.jsx'
import MarketSettings from './MarketSettings.jsx'
import { MarketCategories, MarketVendors } from './MarketDirectory.jsx'
import { EmptyState } from './MarketShared.jsx'
import { errorMessage, formatDateTime, useMarketApi } from '../utils/marketUi.js'
import { MARKET_SECTION_OF } from '../utils/marketNotifications.js'
import './MarketManager.css'

const SECTIONS = [
  { key: 'stalls', label: 'ผังและล็อก' },
  { key: 'bookings', label: 'การจอง' },
  { key: 'leases', label: 'สัญญาเช่าร้าน' },
  { key: 'vendors', label: 'ผู้ค้า' },
  { key: 'categories', label: 'ประเภทสินค้า' },
  { key: 'api-keys', label: 'API key' },
  { key: 'origins', label: 'Domain' },
  { key: 'api-logs', label: 'Log API' },
  { key: 'audit-logs', label: 'ประวัติการแก้ไข' },
  { key: 'settings', label: 'ตั้งค่า' },
]

const MAX_NOTIFICATION_PREVIEW = 4

export default function MarketManager({ apiBase = '/api/admin/market', focusSection, onNotificationsChange }) {
  const api = useMarketApi(apiBase)
  const [section, setSection] = useState(focusSection?.section || 'stalls')
  const [data, setData] = useState({ stalls: [], categories: [], vendors: [], config: null })
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [focusNonce, setFocusNonce] = useState(focusSection?.nonce)

  if (focusSection && focusSection.nonce !== focusNonce) {
    setFocusNonce(focusSection.nonce)
    setSection(focusSection.section)
  }

  const load = useCallback(() => Promise.all([
    api.get('/stalls'), api.get('/categories'), api.get('/vendors'), api.get('/config'), api.get('/notifications'),
  ])
    .then(([stallData, categoryData, vendorData, config, notificationData]) => {
      setData({ stalls: stallData.stalls, categories: categoryData.categories, vendors: vendorData.vendors, config })
      setNotifications(notificationData.notifications)
      onNotificationsChange?.(notificationData.notifications)
    })
    .catch((error) => setNotice({ type: 'error', message: errorMessage(error, 'โหลดข้อมูลพื้นที่ขายของไม่สำเร็จ') }))
    .finally(() => setLoading(false)), [api, onNotificationsChange])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const notify = useCallback((message) => {
    if (message) setNotice({ type: 'success', message })
  }, [])

  const { stalls, categories, vendors, config } = data
  const rentable = stalls.filter((stall) => !stall.is_sandbox && stall.unit_kind === 'rentable')
  const badge = {
    bookings: notifications.filter((item) => item.type === 'booking_pending').length,
    leases: notifications.filter((item) => item.type === 'invoice_unpaid').length,
    'api-keys': notifications.filter((item) => item.type === 'key_expiring').length,
  }
  const shared = { api, stalls, categories, vendors, config, onReload: load, onNotify: notify }

  return (
    <div className="market-manager">
      <header className="market-head">
        <div>
          <h3>{config?.site_name || 'พื้นที่ขายของ'}</h3>
          <p>
            ล็อกให้เช่า {rentable.length} · มีผู้เช่า {rentable.filter((stall) => stall.status === 'occupied').length}
            · ว่าง {rentable.filter((stall) => stall.status === 'available').length}
            {config && ` · เปิด ${config.open_time}–${config.close_time} น.`}
          </p>
        </div>
        {notice && <p className={`market-notice is-${notice.type}`} role="status">{notice.message}</p>}
      </header>

      <nav className="market-tabs" aria-label="เมนูพื้นที่ขายของ">
        {SECTIONS.map((item) => (
          <button type="button" key={item.key} className={`market-tab${section === item.key ? ' is-active' : ''}`} onClick={() => setSection(item.key)}>
            {item.label}
            {badge[item.key] > 0 && <span className="market-tab-badge">{badge[item.key]}</span>}
          </button>
        ))}
      </nav>

      {notifications.length > 0 && section === 'stalls' && (
        <ul className="market-alerts">
          {notifications.slice(0, MAX_NOTIFICATION_PREVIEW).map((item) => (
            <li key={item.key}>
              <button type="button" className={`market-alert is-${item.tone}`} onClick={() => setSection(MARKET_SECTION_OF[item.section] || 'stalls')}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
                <time>{formatDateTime(item.date)}</time>
              </button>
            </li>
          ))}
        </ul>
      )}

      {loading || !config ? <EmptyState>{loading ? 'กำลังโหลด…' : 'โหลดข้อมูลไม่สำเร็จ'}</EmptyState> : (
        <>
          {section === 'stalls' && <MarketStalls {...shared} />}
          {(section === 'bookings' || section === 'leases') && <MarketLeases {...shared} section={section} />}
          {section === 'vendors' && <MarketVendors {...shared} />}
          {section === 'categories' && <MarketCategories {...shared} />}
          {['api-keys', 'origins', 'api-logs', 'audit-logs'].includes(section) && (
            <MarketApiAccess {...shared} section={section} onSectionChange={setSection} />
          )}
          {section === 'settings' && (
            <MarketSettings api={api} config={config} onSaved={(saved) => {
              setData((current) => ({ ...current, config: saved }))
              notify('บันทึกการตั้งค่าแล้ว')
            }} />
          )}
        </>
      )}
    </div>
  )
}
