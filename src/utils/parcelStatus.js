const PARCEL_STATUS = {
  pending: { label: 'รอผู้เช่ารับ', tone: 'is-pending' },
  received: { label: 'รับแล้ว', tone: 'is-received' },
  cancelled: { label: 'ยกเลิก', tone: 'is-cancelled' },
}

export const PARCEL_STATUS_OPTIONS = Object.entries(PARCEL_STATUS).map(([value, { label }]) => ({ value, label }))

export function parcelStatusInfo(status) {
  return PARCEL_STATUS[status] || PARCEL_STATUS.pending
}

export const PREVIOUS_TENANT_LABEL = 'ผู้เช่าคนก่อน'
