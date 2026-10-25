import axios from 'axios'
import { API_ORIGIN, LOCAL_API_ORIGIN } from '../config/api.js'

export function getUploadApiPath(value) {
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

export async function downloadUploadFile(source, fileName = 'download') {
  const apiPath = getUploadApiPath(source)
  const response = await axios.get(apiPath || source, {
    responseType: 'blob',
    withCredentials: Boolean(apiPath),
  })
  const blob = response.data
  const extension = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = /\.[a-z0-9]+$/i.test(fileName) ? fileName : `${fileName}.${extension}`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
