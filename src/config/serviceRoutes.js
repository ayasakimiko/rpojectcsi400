export const SERVICE_PORTS = { auth: 4001, rooms: 4002, customer: 4003, staff: 4004, admin: 4005, owner: 4006, parcels: 4007 }
export const SERVICE_HEALTH_NAMES = { auth: 'auth', rooms: 'room', customer: 'customer', staff: 'staff', admin: 'admin', owner: 'owner', parcels: 'parcel' }

// Keep this order in sync with the gateway: parcel paths and files are more
// specific than the role prefixes.
const ROUTES = [
  ['/api/files', 'customer'],
  ['/api/admin/parcels', 'parcels'],
  ['/api/staff/parcels', 'parcels'],
  ['/api/customer/parcels', 'parcels'],
  ['/api/auth', 'auth'],
  ['/api/rooms', 'rooms'],
  ['/api/customer', 'customer'],
  ['/api/staff', 'staff'],
  ['/api/admin', 'admin'],
  ['/api/owner', 'owner'],
]

export function serviceForPath(url = '') {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase()
  return ROUTES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || null
}
