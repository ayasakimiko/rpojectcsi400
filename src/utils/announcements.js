const STORAGE_KEY = 'projectcsi400.announcements'
const CHANGE_EVENT = 'projectcsi400:announcements-changed'

export function readAnnouncements() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAnnouncements(items) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeAnnouncements(onChange) {
  const refresh = () => onChange(readAnnouncements())
  window.addEventListener(CHANGE_EVENT, refresh)
  window.addEventListener('storage', refresh)
  refresh()
  return () => {
    window.removeEventListener(CHANGE_EVENT, refresh)
    window.removeEventListener('storage', refresh)
  }
}

export function createAnnouncement(announcement) {
  const entry = {
    ...announcement,
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
  }
  saveAnnouncements([entry, ...readAnnouncements()])
}

export function deleteAnnouncement(id) {
  saveAnnouncements(readAnnouncements().filter((item) => item.id !== id))
}