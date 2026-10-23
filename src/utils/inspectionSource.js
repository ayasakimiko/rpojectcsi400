export function getInspectionPurposeLabel(inspection) {
  if (inspection.tenant_request_type === 'move_room') return 'ย้ายห้อง'
  if (inspection.tenant_request_type === 'moveout') return 'ย้ายออก'
  if (inspection.tenant_request_id) return 'ตามคำขอ'
  return 'ย้ายออก'
}

export function getInspectionSourceLabel(inspection) {
  if (inspection.tenant_request_type === 'move_room') return `คำขอย้ายห้อง #${inspection.tenant_request_id}`
  if (inspection.tenant_request_type === 'moveout') return `คำขอแจ้งย้ายออก #${inspection.tenant_request_id}`
  if (inspection.tenant_request_id) return `คำขอ #${inspection.tenant_request_id}`
  return 'ผลตรวจย้ายออกที่ Staff บันทึก'
}
