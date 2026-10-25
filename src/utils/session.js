import axios from 'axios'

export const SESSION_KEYS = ['session', 'user', 'justLoggedIn', 'apiBackend']

export function hasSession() {
  return Boolean(sessionStorage.getItem('session'))
}

export function sessionRole() {
  try {
    return JSON.parse(sessionStorage.getItem('user') || 'null')?.role || null
  } catch {
    return null
  }
}

export function startSession(user) {
  sessionStorage.setItem('session', `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
  sessionStorage.setItem('user', JSON.stringify(user))
}

export function clearSession() {
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key)
}

export function logout() {
  const role = sessionRole()
  axios.post('/api/auth/logout', null, role ? { headers: { 'X-Auth-Role': role } } : undefined).catch(() => {})
  clearSession()
}
