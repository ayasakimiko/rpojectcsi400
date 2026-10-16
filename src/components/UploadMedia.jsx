import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { API_ORIGIN, LOCAL_API_ORIGIN } from '../config/api.js'

function getUploadApiPath(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value, API_ORIGIN)
    const origins = [API_ORIGIN, LOCAL_API_ORIGIN, 'http://localhost:4000']
    if (!origins.includes(url.origin) || !url.pathname.startsWith('/uploads/')) return null
    return `/api/files/${url.pathname.slice('/uploads/'.length)}`
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
    axios.get(apiPath, {
      responseType: 'blob',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(data)
      setLoaded({ resource, url: objectUrl })
    }).catch(() => {
      // Existing alternative text remains visible if an image cannot be loaded.
    })
    return () => {
      controller.abort()
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
