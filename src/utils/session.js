import axios from 'axios'

export const SESSION_KEYS = ['session', 'user', 'justLoggedIn', 'apiBackend']

export function hasSession() {
  return Boolean(sessionStorage.getItem('session'))
}

export function startSession(user) {
  sessionStorage.setItem('session', `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
  sessionStorage.setItem('user', JSON.stringify(user))
}

export function clearSession() {
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key)
}

export function logout() {
  axios.post('/api/auth/logout').catch(() => {})
  clearSession()
}
