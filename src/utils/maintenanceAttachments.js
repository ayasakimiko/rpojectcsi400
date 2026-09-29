const STORAGE_KEY = 'projectcsi400.maintenance-attachments'
const CHANGE_EVENT = 'projectcsi400:maintenance-attachments-changed'

export function readMaintenanceAttachments() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveMaintenanceAttachments(items) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeMaintenanceAttachments(onChange) {
  const refresh = () => onChange(readMaintenanceAttachments())
  window.addEventListener(CHANGE_EVENT, refresh)
  window.addEventListener('storage', refresh)
  refresh()
  return () => {
    window.removeEventListener(CHANGE_EVENT, refresh)
    window.removeEventListener('storage', refresh)
  }
}

export function saveMaintenanceRequestPhotos(requestId, photos) {
  const attachments = readMaintenanceAttachments()
  attachments[requestId] = photos
  saveMaintenanceAttachments(attachments)
}