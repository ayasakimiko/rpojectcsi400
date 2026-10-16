import axios from 'axios'

export const API_ORIGIN = 'https://backend.ayasakimioweb.com'
export const LOCAL_API_ORIGIN = 'http://127.0.0.1:4000'
export const BACKENDS = [
  { id: 'vps', origin: API_ORIGIN, proxy: '/__api/vps' },
  { id: 'local', origin: LOCAL_API_ORIGIN, proxy: '/__api/local' },
]

function connectionError(message, code, config, status = 503) {
  const error = new axios.AxiosError(message, code, config)
  error.response = { status, data: { message }, headers: {}, config }
  return error
}

export function createBackendSelector({
  backends = BACKENDS,
  baseUrl = (backend) => backend.origin,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 1800,
  cacheMs = 5000,
  now = Date.now,
} = {}) {
  let current = null
  let validUntil = 0
  let pending = null

  async function healthy(backend) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${baseUrl(backend)}/api/health`, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      })
      if (!response.ok) return false
      const body = await response.json()
      return body.status === 'ok' && body.service === 'gateway'
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  async function select({ force = false } = {}) {
    if (!force && current && now() < validUntil) return current
    if (pending) return pending
    pending = (async () => {
      for (const backend of backends) {
        if (await healthy(backend)) {
          current = backend
          validUntil = now() + cacheMs
          return backend
        }
      }
      current = null
      validUntil = 0
      throw connectionError('เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเซิร์ฟเวอร์แล้วลองใหม่', 'ERR_BACKEND_UNAVAILABLE')
    })()
    try {
      return await pending
    } finally {
      pending = null
    }
  }

  return {
    select,
    invalidate(id) { if (!id || current?.id === id) validUntil = 0 },
    get current() { return current },
  }
}

const REGISTRATION = Symbol.for('projectcsi400.apiClient')

export function configureApiClient({
  client = axios,
  development = false,
  storage = globalThis.sessionStorage,
  backends = BACKENDS,
  fetchImpl,
  timeoutMs,
  cacheMs,
  redirectToLogin = () => {
    if (window.location.pathname !== '/login') window.location.replace('/login')
  },
} = {}) {
  client[REGISTRATION]?.dispose()
  const baseUrl = (backend) => development ? backend.proxy : backend.origin
  const selector = createBackendSelector({ backends, baseUrl, fetchImpl, timeoutMs, cacheMs })
  client.defaults.baseURL = development ? '/' : backends[0].origin

  function bearer(config) {
    const value = axios.AxiosHeaders.from(config.headers).get('Authorization')
    return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null
  }

  function staleSession(config) {
    const error = new axios.CanceledError('ข้ามคำตอบจากการเข้าสู่ระบบครั้งก่อน', config)
    error.code = 'ERR_STALE_SESSION'
    return error
  }

  const requestInterceptor = client.interceptors.request.use(async (config) => {
    if (!/^\/api(?:\/|$)/.test(config.url || '')) return config
    const backend = await selector.select()
    const token = storage.getItem('token')
    const suppliedToken = bearer(config)
    if (suppliedToken && suppliedToken !== token) throw staleSession(config)

    const sessionBackend = storage.getItem('apiBackend') || 'vps'
    if (token && sessionBackend !== backend.id) {
      for (const key of ['token', 'user', 'justLoggedIn', 'apiBackend']) storage.removeItem(key)
      const message = 'เปลี่ยนเซิร์ฟเวอร์ที่ใช้งานแล้ว กรุณาเข้าสู่ระบบใหม่'
      storage.setItem('apiBackendNotice', message)
      redirectToLogin()
      throw connectionError(message, 'ERR_BACKEND_CHANGED', config, 401)
    }
    if (token) storage.setItem('apiBackend', backend.id)
    config.baseURL = baseUrl(backend)
    config.backendId = backend.id
    return config
  })

  const responseInterceptor = client.interceptors.response.use((response) => {
    const token = bearer(response.config)
    if (token && token !== storage.getItem('token')) throw staleSession(response.config)
    if (response.config.url === '/api/auth/login' && response.data?.token) {
      storage.setItem('apiBackend', response.config.backendId)
      storage.removeItem('apiBackendNotice')
    }
    return response
  }, async (error) => {
    const config = error.config
    if (!config?.backendId || axios.isCancel(error) || error.code?.startsWith('ERR_BACKEND_') || error.code === 'ERR_STALE_SESSION') {
      throw error
    }
    const token = bearer(config)
    if (token && token !== storage.getItem('token')) {
      // Old responses must not sign out or overwrite a newer login.
      throw staleSession(config)
    }
    if (error.response?.status === 401 && !/^\/api\/auth\/login(?:[/?#]|$)/.test(config.url || '')) {
      if (token) {
        for (const key of ['token', 'user', 'justLoggedIn', 'apiBackend']) storage.removeItem(key)
        storage.setItem('apiBackendNotice', 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่')
        redirectToLogin()
      }
    }
    const unreachable = !error.response || [502, 503, 504].includes(error.response.status)
    if (!unreachable) throw error
    selector.invalidate(config.backendId)
    // Never replay a write: the first server may already have accepted it.
    if (!['get', 'head'].includes(config.method) || config.backendRetried) throw error
    let next
    try {
      next = await selector.select({ force: true })
    } catch {
      throw error
    }
    if (next.id === config.backendId) throw error
    return client.request({ ...config, backendRetried: true })
  })

  const registration = {
    selector,
    dispose() {
      client.interceptors.request.eject(requestInterceptor)
      client.interceptors.response.eject(responseInterceptor)
      if (client[REGISTRATION] === registration) delete client[REGISTRATION]
    },
  }
  client[REGISTRATION] = registration
  return registration
}
