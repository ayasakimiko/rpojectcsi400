export function getInspectionPurposeLabel(inspection) {
  if (inspection.tenant_request_type === 'move_room') return 'ตรวจก่อนเปลี่ยนห้อง'
  if (inspection.tenant_request_type === 'moveout') return 'ตรวจก่อนย้ายออก'
  if (inspection.tenant_request_id) return 'ตรวจสภาพห้องตามคำขอ'
  return 'ตรวจห้องย้ายออก'
}

export function getInspectionSourceLabel(inspection) {
  if (inspection.tenant_request_type === 'move_room') return `คำขอย้ายห้อง #${inspection.tenant_request_id}`
  if (inspection.tenant_request_type === 'moveout') return `คำขอแจ้งย้ายออก #${inspection.tenant_request_id}`
  if (inspection.tenant_request_id) return `คำขอ #${inspection.tenant_request_id}`
  return 'ผลตรวจย้ายออกที่ Staff บันทึก'
}
