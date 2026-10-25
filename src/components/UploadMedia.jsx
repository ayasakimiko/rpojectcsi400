import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { getUploadApiPath } from '../utils/uploadFiles.js'

const RELEASE_DELAY_MS = 30000
const blobCache = new Map()

function fetchBlobUrl(apiPath, session) {
  return new Promise((resolve, reject) => {
    let retries = 0
    const load = () => {
      if (sessionStorage.getItem('session') !== session) {
        reject(new Error('Session changed'))
        return
      }
      axios
        .get(apiPath, { responseType: 'blob' })
        .then(({ data }) => resolve(URL.createObjectURL(data)))
        .catch((error) => {
          const temporaryFailure = !error.response || [502, 503, 504].includes(error.response.status)
          if (temporaryFailure && retries < 3) {
            setTimeout(load, 2000 * 2 ** retries)
            retries += 1
            return
          }
          reject(error)
        })
    }
    load()
  })
}

function acquireBlobUrl(apiPath, session) {
  const key = `${session}|${apiPath}`
  let entry = blobCache.get(key)
  if (!entry) {
    entry = { refs: 0, url: null, releaseTimer: null, promise: null }
    entry.promise = fetchBlobUrl(apiPath, session).then(
      (url) => {
        entry.url = url
        return url
      },
      (error) => {
        blobCache.delete(key)
        throw error
      },
    )
    blobCache.set(key, entry)
  }
  entry.refs += 1
  clearTimeout(entry.releaseTimer)
  return { key, promise: entry.promise }
}

function releaseBlobUrl(key) {
  const entry = blobCache.get(key)
  if (!entry) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs > 0) return
  clearTimeout(entry.releaseTimer)
  entry.releaseTimer = setTimeout(() => {
    if (entry.refs > 0 || blobCache.get(key) !== entry) return
    blobCache.delete(key)
    if (entry.url) URL.revokeObjectURL(entry.url)
  }, RELEASE_DELAY_MS)
}

function useUploadUrl(source, { lazy = false, nodeRef = null } = {}) {
  const apiPath = getUploadApiPath(source)
  const session = apiPath ? sessionStorage.getItem('session') : null
  const resource = useMemo(() => ({ apiPath, session }), [apiPath, session])
  const [loaded, setLoaded] = useState(null)
  const [visible, setVisible] = useState(() => !lazy || typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (visible || !nodeRef?.current) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        setVisible(true)
      },
      { rootMargin: '300px' },
    )
    observer.observe(nodeRef.current)
    return () => observer.disconnect()
  }, [visible, nodeRef])

  useEffect(() => {
    if (!apiPath || !session || !visible) return undefined
    let active = true
    const { key, promise } = acquireBlobUrl(apiPath, session)
    promise
      .then((url) => {
        if (active) setLoaded({ resource, url })
      })
      .catch(() => {})
    return () => {
      active = false
      releaseBlobUrl(key)
    }
  }, [apiPath, session, resource, visible])

  if (!apiPath) return source || undefined
  return loaded?.resource === resource ? loaded.url : undefined
}

export function UploadImage({ src, alt = '', loading, ...props }) {
  const nodeRef = useRef(null)
  const url = useUploadUrl(src, { lazy: loading === 'lazy', nodeRef })
  return <img {...props} ref={nodeRef} loading={loading} src={url} alt={alt} />
}

export function UploadLink({ href, children, ...props }) {
  const url = useUploadUrl(href)
  return <a {...props} href={url} aria-disabled={!url || undefined}>{children}</a>
}
