let lockCount = 0

export function lockBodyScroll() {
  lockCount += 1
  if (lockCount === 1) document.body.style.overflow = 'hidden'
  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) document.body.style.overflow = ''
  }
}
