const STORAGE_KEY = 'projectcsi400.waiting-list'
const CHANGE_EVENT = 'projectcsi400:waiting-list-changed'

export const WAITING_LIST_STATUS_LABEL = {
  waiting: 'รอห้องว่าง',
  contacted: 'ติดต่อแล้ว',
  reserved: 'จองแล้ว',
  closed: 'ปิดรายการ',
}

export function readWaitingList() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveWaitingList(items) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeWaitingList(onChange) {
  const refresh = () => onChange(readWaitingList())
  window.addEventListener(CHANGE_EVENT, refresh)
  window.addEventListener('storage', refresh)
  refresh()
  return () => {
    window.removeEventListener(CHANGE_EVENT, refresh)
    window.removeEventListener('storage', refresh)
  }
}

export function createWaitingListEntry(entry) {
  const item = {
    ...entry,
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: 'waiting',
    created_at: new Date().toISOString(),
  }
  saveWaitingList([item, ...readWaitingList()])
}

export function updateWaitingListEntry(id, updates) {
  saveWaitingList(readWaitingList().map((item) => (item.id === id ? { ...item, ...updates } : item)))
}

export function deleteWaitingListEntry(id) {
  saveWaitingList(readWaitingList().filter((item) => item.id !== id))
}