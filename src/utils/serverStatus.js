import { BACKENDS } from '../config/api.js'

export function serviceHealthTargets({ backends = BACKENDS, development = false } = {}) {
  return backends.flatMap((backend) => [
    { url: `${development ? backend.proxy : backend.origin}/api/health`, healthService: 'gateway' },
    ...Object.values(backend.services || {}).map((service) => ({
      url: `${development ? service.proxy : service.origin}/api/health`,
      healthService: service.healthService,
    })),
  ])
}

export async function anyServiceUp({
  targets = serviceHealthTargets(),
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 3000,
} = {}) {
  const gateways = targets.filter((target) => target.healthService === 'gateway')
  for (const gateway of gateways) {
    if (await probeTargets([gateway], fetchImpl, timeoutMs)) return true
  }
  const services = targets.filter((target) => target.healthService !== 'gateway')
  return services.length > 0 && probeTargets(services, fetchImpl, timeoutMs)
}

async function probeTargets(targets, fetchImpl, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await Promise.any(targets.map(async (target) => {
      const response = await fetchImpl(target.url, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      })
      if (!response.ok) throw new Error('unhealthy')
      const body = await response.json()
      if (body.status !== 'ok' || body.service !== target.healthService) throw new Error('unhealthy')
    }))
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

export function elapsedParts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}
