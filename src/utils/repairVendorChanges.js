// Vendor details a vendor (e.g. RenoCare) may ask to change through the Repair API.
// Nothing is applied until staff or the owner approve the request.
// webhook_url, note and is_active stay dorm-only.
export const VENDOR_CHANGE_FIELDS = [
  'name',
  'contact_name',
  'phone',
  'email',
  'specialties',
  'specialty_other',
  'contract_type',
  'contract_start',
  'contract_end',
  'contract_fee',
]

export const VENDOR_CHANGE_LABEL = {
  name: 'ชื่อร้าน/บริษัทช่าง',
  contact_name: 'ผู้ติดต่อ',
  phone: 'เบอร์โทร',
  email: 'อีเมล',
  specialties: 'ประเภทงานที่รับ',
  specialty_other: 'งานประเภทอื่นๆ',
  contract_type: 'รูปแบบสัญญา',
  contract_start: 'วันเริ่มสัญญา',
  contract_end: 'วันสิ้นสุดสัญญา',
  contract_fee: 'ค่าสัญญา',
}

export const VENDOR_CHANGE_STATUS = {
  pending: { label: 'รออนุมัติ', tone: 'warning' },
  approved: { label: 'อนุมัติแล้ว', tone: 'success' },
  rejected: { label: 'ไม่อนุมัติ', tone: 'danger' },
  cancelled: { label: 'ช่างยกเลิก', tone: 'muted' },
}
