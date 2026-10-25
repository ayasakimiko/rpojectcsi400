export const SERVICE_PORTS = { auth: 4001, rooms: 4002, customer: 4003, staff: 4004, admin: 4005, owner: 4006, parcels: 4007, maintenance: 4008, payment: 4009, market: 4010 }
export const SERVICE_HEALTH_NAMES = { auth: 'auth', rooms: 'room', customer: 'customer', staff: 'staff', admin: 'admin', owner: 'owner', parcels: 'parcel', maintenance: 'maintenance', payment: 'payment', market: 'market' }

const ROUTES = [
  ['/api/files', 'customer'],
  ['/api/market', 'market'],
  ['/api/payment', 'payment'],
  ['/api/admin/parcels', 'parcels'],
  ['/api/staff/parcels', 'parcels'],
  ['/api/customer/parcels', 'parcels'],
  ['/api/customer/maintenance', 'maintenance'],
  ['/api/staff/maintenance', 'maintenance'],
  ['/api/admin/logs/maintenance', 'maintenance'],
  ['/api/customer/payment-channels', 'payment'],
  ['/api/customer/payments', 'payment'],
  ['/api/staff/payment-slips', 'payment'],
  ['/api/staff/payment-verifications', 'payment'],
  ['/api/owner/income', 'payment'],
  ['/api/owner/utility-receipts', 'payment'],
  ['/api/owner/logs/payments', 'payment'],
  ['/api/auth', 'auth'],
  ['/api/rooms', 'rooms'],
  ['/api/customer', 'customer'],
  ['/api/staff', 'staff'],
  ['/api/admin', 'admin'],
  ['/api/owner', 'owner'],
]

export const MARKET_TENANT_API_PREFIX = '/api/market/v1'

function pathnameOf(url = '') {
  return url.split(/[?#]/, 1)[0].toLowerCase()
}

export function isMarketTenantApiPath(url = '') {
  const pathname = pathnameOf(url)
  return pathname === MARKET_TENANT_API_PREFIX || pathname.startsWith(`${MARKET_TENANT_API_PREFIX}/`)
}

export function serviceForPath(url = '') {
  const pathname = pathnameOf(url)
  if (/^\/api\/staff\/rooms\/[^/]+\/(collect-payment|utility-bill)(\/|$)/.test(pathname)) return 'payment'
  if (/^\/api\/admin\/rooms\/[^/]+\/maintenance(\/|$)/.test(pathname)) return 'maintenance'
  return ROUTES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || null
}
