export const STALL_STATUS = {
  available: { label: 'ว่าง', tone: 'is-available' },
  reserved: { label: 'รอเซ็นสัญญา', tone: 'is-pending' },
  occupied: { label: 'มีผู้เช่า', tone: 'is-active' },
  closed: { label: 'ปิด', tone: 'is-closed' },
}

export const STALL_KIND = {
  rentable: { label: 'ร้านให้เช่า' },
  common: { label: 'ส่วนกลาง' },
}

export const UTILITY_MODE = {
  included: { label: 'รวมในค่าเช่า' },
  flat: { label: 'เหมาจ่าย' },
  meter: { label: 'ตามมิเตอร์' },
}

export const BOOKING_STATUS = {
  pending: { label: 'รออนุมัติ', tone: 'is-pending' },
  approved: { label: 'อนุมัติแล้ว', tone: 'is-active' },
  rejected: { label: 'ปฏิเสธ', tone: 'is-closed' },
  cancelled: { label: 'ยกเลิก', tone: 'is-closed' },
  ended: { label: 'สิ้นสุด', tone: 'is-muted' },
}

export const LEASE_STATUS = {
  awaiting_signature: { label: 'รอแนบสัญญาที่เซ็นแล้ว', tone: 'is-pending' },
  active: { label: 'สัญญามีผล', tone: 'is-active' },
  ended: { label: 'สิ้นสุดตามสัญญา', tone: 'is-muted' },
  terminated: { label: 'ยกเลิกก่อนกำหนด', tone: 'is-closed' },
}

export const LEASE_CONTRACT_TYPE = {
  restaurant: { label: 'สัญญาเช่าร้านอาหาร' },
  retail: { label: 'สัญญาเช่าร้านค้า' },
}

export const DEPOSIT_STATUS = {
  held: { label: 'ถือเงินประกันไว้', tone: 'is-pending' },
  refunded: { label: 'คืนเงินประกันแล้ว', tone: 'is-active' },
  forfeited: { label: 'ริบเงินประกัน', tone: 'is-closed' },
}

export const INVOICE_STATUS = {
  unpaid: { label: 'ค้างชำระ', tone: 'is-pending' },
  paid: { label: 'ชำระแล้ว', tone: 'is-active' },
}

export const VENDOR_STATUS = {
  active: { label: 'ใช้งาน', tone: 'is-active' },
  suspended: { label: 'ระงับ', tone: 'is-closed' },
}

export const API_KEY_MODE = {
  test: { label: 'ทดสอบ (test)', prefix: 'mk_test_' },
  live: { label: 'ใช้งานจริง (live)', prefix: 'mk_live_' },
}

export const MARKET_SCOPES = {
  'stalls:read': { label: 'อ่านชื่อร้าน' },
  'stalls:write': { label: 'แก้ชื่อร้าน' },
  'products:read': { label: 'อ่านสินค้า' },
  'products:write': { label: 'แก้ชื่อ ราคา จำนวนสินค้า' },
}

export function statusInfo(map, key) {
  return map[key] || { label: key || '-', tone: 'is-muted' }
}

export function statusOptions(map) {
  return Object.entries(map).map(([value, { label }]) => ({ value, label }))
}

export const MARKET_AUDIT_ACTIONS = {
  'config.update': 'แก้การตั้งค่าร้านเช่า',
  'stall.create': 'เพิ่มล็อก',
  'stall.update': 'แก้ไขล็อก',
  'stall.open': 'เปิดล็อกให้เช่า',
  'stall.close': 'ปิดล็อก',
  'stall.delete': 'ลบล็อก',
  'product.create': 'เพิ่มสินค้า',
  'product.update': 'แก้ไขสินค้า',
  'product.delete': 'ลบสินค้า',
  'category.create': 'เพิ่มประเภทสินค้า',
  'category.update': 'แก้ไขประเภทสินค้า',
  'vendor.create': 'เพิ่มผู้ค้า',
  'vendor.update': 'แก้ไขผู้ค้า',
  'booking.create': 'บันทึกการจองล็อก',
  'booking.approve': 'อนุมัติการจองและออกสัญญา',
  'booking.reject': 'ปฏิเสธการจอง',
  'booking.cancel': 'ยกเลิกการจอง',
  'lease.images.add': 'แนบรูปสัญญาเช่าร้าน',
  'lease.images.delete': 'ลบรูปสัญญาเช่าร้าน',
  'lease.activate': 'สัญญาเช่าร้านมีผล',
  'lease.ended': 'สิ้นสุดสัญญาเช่าร้าน',
  'lease.terminated': 'ยกเลิกสัญญาเช่าร้านก่อนกำหนด',
  'lease.deposit.refund': 'คืนเงินประกันร้าน',
  'lease.deposit.forfeit': 'ริบเงินประกันร้าน',
  'invoice.create': 'ออกบิลค่าเช่าร้าน',
  'invoice.pay': 'บันทึกชำระบิลค่าเช่าร้าน',
  'api_client.create': 'สร้าง API key',
  'api_client.update': 'แก้ไข API key',
  'api_client.enable': 'เปิดใช้ API key',
  'api_client.suspend': 'ระงับ API key',
  'api_client.rotate': 'หมุน API key',
  'origin.create': 'เพิ่ม domain ที่อนุญาต',
  'origin.enable': 'เปิด domain',
  'origin.disable': 'ปิด domain',
  'origin.delete': 'ลบ domain',
}

export function marketAuditLabel(action) {
  return MARKET_AUDIT_ACTIONS[action] || action
}
