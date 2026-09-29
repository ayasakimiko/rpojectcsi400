const STORAGE_KEY = 'projectcsi400.move-out-inspections'
const CHANGE_EVENT = 'projectcsi400:move-out-inspections-changed'

export const MOVE_OUT_CHECKLIST = [
  { key: 'walls', label: 'ผนังและสี' },
  { key: 'floor', label: 'พื้น' },
  { key: 'ceiling', label: 'เพดานและไฟ' },
  { key: 'doors', label: 'ประตูและกุญแจ' },
  { key: 'windows', label: 'หน้าต่าง' },
  { key: 'electrical', label: 'ปลั๊กและสวิตช์ไฟ' },
  { key: 'bathroom', label: 'ห้องน้ำและสุขภัณฑ์' },
  { key: 'furniture', label: 'เฟอร์นิเจอร์และอุปกรณ์' },
]

export const MOVE_OUT_INSPECTION_STATUS = {
  pending: 'รอ Admin ตรวจ',
  reviewed: 'Admin ตรวจแล้ว',
  follow_up: 'ต้องติดตาม',
}

export function readMoveOutInspections() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveMoveOutInspections(items) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeMoveOutInspections(onChange) {
  const refresh = () => onChange(readMoveOutInspections())
  window.addEventListener(CHANGE_EVENT, refresh)
  window.addEventListener('storage', refresh)
  refresh()
  return () => {
    window.removeEventListener(CHANGE_EVENT, refresh)
    window.removeEventListener('storage', refresh)
  }
}

export function createMoveOutInspection(entry) {
  const inspection = {
    ...entry,
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: 'pending',
    created_at: new Date().toISOString(),
  }
  saveMoveOutInspections([inspection, ...readMoveOutInspections()])
}

export function updateMoveOutInspection(id, updates) {
  saveMoveOutInspections(readMoveOutInspections().map((item) => (item.id === id ? { ...item, ...updates } : item)))
}

export function deleteMoveOutInspection(id) {
  saveMoveOutInspections(readMoveOutInspections().filter((item) => item.id !== id))
}

export function compressImageFile(file) {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('เลือกได้เฉพาะไฟล์รูปภาพ'))
  if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error('รูปภาพต้องมีขนาดไม่เกิน 15 MB'))

  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const maxDimension = 1400
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(imageUrl)
        reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'))
        return
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(imageUrl)
      resolve({
        name: file.name,
        dataUrl: canvas.toDataURL('image/jpeg', 0.65),
        contentType: 'image/jpeg',
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('อ่านรูปภาพไม่สำเร็จ'))
    }
    image.src = imageUrl
  })
}
