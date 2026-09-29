const STORAGE_KEY = 'projectcsi400.utility-meter-readings'

export function getCurrentMeterMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getPreviousMeterMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const previous = new Date(year, monthNumber - 2, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
}

export function readUtilityMeterReadings() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function saveUtilityMeterReadings(month, readings) {
  const allReadings = readUtilityMeterReadings()
  allReadings[month] = readings
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allReadings))
}
