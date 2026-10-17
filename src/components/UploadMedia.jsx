import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { API_ORIGIN, LOCAL_API_ORIGIN } from '../config/api.js'

function getUploadApiPath(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value, API_ORIGIN)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const configuredOrigins = [API_ORIGIN, LOCAL_API_ORIGIN]
    const isVps = [new URL(API_ORIGIN).hostname, '14.207.142.105'].includes(url.hostname)
    const isLocalService = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && Number(url.port) >= 4000 && Number(url.port) <= 4007
    const isFrontend = typeof window !== 'undefined' && url.origin === window.location.origin
    if (!configuredOrigins.includes(url.origin) && !isVps && !isLocalService && !isFrontend) return null
    const pathname = url.pathname.replace(/^\/__api\/(?:vps|local)(?=\/)/, '')
    const match = /^\/(?:uploads|api\/files)\/(.+)$/.exec(pathname)
    return match ? `/api/files/${match[1]}` : null
  } catch {
    return null
  }
}

// Kept with both media components so pages only import this file.
function useUploadUrl(source) {
  const apiPath = getUploadApiPath(source)
  const token = apiPath ? sessionStorage.getItem('token') : null
  const resource = useMemo(() => ({ apiPath, token }), [apiPath, token])
  const [loaded, setLoaded] = useState(null)

  useEffect(() => {
    if (!apiPath || !token) return
    const controller = new AbortController()
    let objectUrl
    let retryTimer
    let retries = 0

    const load = () => {
      if (controller.signal.aborted || sessionStorage.getItem('token') !== token) return
      axios.get(apiPath, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }).then(({ data }) => {
        if (controller.signal.aborted || sessionStorage.getItem('token') !== token) return
        objectUrl = URL.createObjectURL(data)
        setLoaded({ resource, url: objectUrl })
      }).catch((error) => {
        if (controller.signal.aborted || axios.isCancel(error) || sessionStorage.getItem('token') !== token) return
        const temporaryFailure = !error.response || [502, 503, 504].includes(error.response.status)
        if (temporaryFailure && retries < 3) {
          retryTimer = setTimeout(load, 2000 * (2 ** retries))
          retries += 1
        }
        // Missing or unauthorized files never switch to another server's copy.
      })
    }

    load()
    return () => {
      controller.abort()
      clearTimeout(retryTimer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [apiPath, token, resource])

  if (!apiPath) return source || undefined
  return loaded?.resource === resource ? loaded.url : undefined
}

export function UploadImage({ src, alt = '', ...props }) {
  const url = useUploadUrl(src)
  return <img {...props} src={url} alt={alt} />
}

export function UploadLink({ href, children, ...props }) {
  const url = useUploadUrl(href)
  return <a {...props} href={url} aria-disabled={!url || undefined}>{children}</a>
}
