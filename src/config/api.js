import axios from 'axios'
import { SERVICE_HEALTH_NAMES, SERVICE_PORTS, serviceForPath } from './serviceRoutes.js'

export const API_ORIGIN = 'https://backend.ayasakimioweb.com'
export const LOCAL_API_ORIGIN = 'http://127.0.0.1:4000'
export const BACKENDS = [
  {
    id: 'vps', origin: API_ORIGIN, proxy: '/__api/vps',
    services: Object.fromEntries(Object.keys(SERVICE_PORTS).map((name) => [name, {
      origin: `${API_ORIGIN}/__api/direct/${name}`,
      proxy: `/__api/vps/__api/direct/${name}`,
      healthService: SERVICE_HEALTH_NAMES[name],
    }])),
  },
  {
    id: 'local', origin: LOCAL_API_ORIGIN, proxy: '/__api/local',
    services: Object.fromEntries(Object.entries(SERVICE_PORTS).map(([name, port]) => [name, {
      origin: `http://127.0.0.1:${port}`,
      proxy: `/__api/local/direct/${name}`,
      healthService: SERVICE_HEALTH_NAMES[name],
    }])),
  },
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
  preferredId = () => null,
  onSelect = () => {},
} = {}) {
  const current = new Map()
  const pending = new Map()
  const gatewayCooldown = new Map()

  async function healthy(target) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${baseUrl(target)}/api/health`, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      })
      if (!response.ok) return false
      const body = await response.json()
      return body.status === 'ok' && body.service === (target.healthService || 'gateway')
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  async function probe(service, exclude) {
    const preferred = preferredId()
    const ordered = [...backends].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred))
    for (const backend of ordered) {
      const gateway = { ...backend, backendId: backend.id, targetId: `${backend.id}:gateway`, service: null }
      if (gateway.targetId !== exclude && now() >= (gatewayCooldown.get(backend.id) || 0)) {
        if (await healthy(gateway)) return gateway
        gatewayCooldown.set(backend.id, now() + cacheMs)
      }
      const direct = backend.services?.[service]
      if (direct) {
        const target = { ...direct, backendId: backend.id, targetId: `${backend.id}:${service}`, service }
        if (target.targetId !== exclude && await healthy(target)) return target
      }
    }
    return null
  }

  async function select({ service, force = false, exclude = null } = {}) {
    if (!service) throw new Error('A service is required to select an API endpoint')
    const cached = current.get(service)
    if (!force && !exclude && cached && now() < cached.validUntil) return cached.target
    const key = `${service}:${exclude || ''}`
    if (pending.has(key)) return pending.get(key)
    const task = (async () => {
      const target = await probe(service, exclude)
      if (!target) {
        current.delete(service)
        throw connectionError('เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเซิร์ฟเวอร์แล้วลองใหม่', 'ERR_BACKEND_UNAVAILABLE')
      }
      current.set(service, { target, validUntil: now() + cacheMs })
      onSelect(target)
      return target
    })()
    pending.set(key, task)
    try { return await task } finally { pending.delete(key) }
  }

  return {
    select,
    invalidate(targetId, service) {
      if (service && (!targetId || current.get(service)?.target.targetId === targetId)) current.delete(service)
      if (targetId?.endsWith(':gateway')) gatewayCooldown.set(targetId.split(':')[0], now() + cacheMs)
    },
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
  const selector = createBackendSelector({
    backends,
    baseUrl,
    fetchImpl,
    timeoutMs,
    cacheMs,
    preferredId: () => storage.getItem('apiBackend') || storage.getItem('apiBackendLast'),
    onSelect: (target) => storage.setItem('apiBackendLast', target.backendId),
  })
  client.defaults.baseURL = development ? '/' : backends[0].origin
  client.defaults.withCredentials = true
  client.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest'

  function staleSession(config) {
    const error = new axios.CanceledError('ข้ามคำตอบจากการเข้าสู่ระบบครั้งก่อน', config)
    error.code = 'ERR_STALE_SESSION'
    return error
  }

  const requestInterceptor = client.interceptors.request.use(async (config) => {
    const service = serviceForPath(config.url)
    if (!service) return config
    const safe = ['get', 'head'].includes((config.method || 'get').toLowerCase())
    const target = await selector.select({ service, force: !safe || !!config.backendRetried, exclude: config.backendExclude })
    const session = config.session === undefined ? storage.getItem('session') : config.session
    if (session && session !== storage.getItem('session')) throw staleSession(config)
    config.session = session

    const sessionBackend = storage.getItem('apiBackend') || 'vps'
    if (session && sessionBackend !== target.backendId) {
      for (const key of ['session', 'user', 'justLoggedIn', 'apiBackend']) storage.removeItem(key)
      const message = 'เปลี่ยนเซิร์ฟเวอร์ที่ใช้งานแล้ว กรุณาเข้าสู่ระบบใหม่'
      storage.setItem('apiBackendNotice', message)
      redirectToLogin()
      throw connectionError(message, 'ERR_BACKEND_CHANGED', config, 401)
    }
    if (session) storage.setItem('apiBackend', target.backendId)
    config.baseURL = baseUrl(target)
    config.backendId = target.backendId
    config.backendTarget = target.targetId
    config.backendService = service
    return config
  })

  const responseInterceptor = client.interceptors.response.use((response) => {
    const session = response.config.session
    if (session && session !== storage.getItem('session')) throw staleSession(response.config)
    if (response.config.url === '/api/auth/login' && response.data?.user) {
      storage.setItem('apiBackend', response.config.backendId)
      storage.removeItem('apiBackendNotice')
    }
    return response
  }, async (error) => {
    const config = error.config
    if (!config?.backendTarget || axios.isCancel(error) || error.code?.startsWith('ERR_BACKEND_') || error.code === 'ERR_STALE_SESSION') {
      throw error
    }
    const session = config.session
    if (session && session !== storage.getItem('session')) {
      throw staleSession(config)
    }
    if (error.response?.status === 401 && !/^\/api\/auth\/login(?:[/?#]|$)/.test(config.url || '')) {
      if (session) {
        for (const key of ['session', 'user', 'justLoggedIn', 'apiBackend']) storage.removeItem(key)
        storage.setItem('apiBackendNotice', 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่')
        redirectToLogin()
      }
    }
    const unreachable = !error.response || [502, 503, 504].includes(error.response.status)
    if (!unreachable) throw error
    selector.invalidate(config.backendTarget, config.backendService)
    if (!['get', 'head'].includes((config.method || 'get').toLowerCase()) || config.backendRetried) throw error
    return client.request({ ...config, backendRetried: true, backendExclude: config.backendTarget })
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
