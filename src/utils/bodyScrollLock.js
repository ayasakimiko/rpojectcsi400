let lockCount = 0
let savedPaddingRight = ''

export function lockBodyScroll() {
  lockCount += 1
  if (lockCount === 1) {
    const { body, documentElement } = document
    // hiding overflow removes the page scrollbar; pad the body by its width so the page behind
    // the modal does not jump sideways (and re-layout) on open and again on close
    const scrollbar = window.innerWidth - documentElement.clientWidth
    savedPaddingRight = body.style.paddingRight
    if (scrollbar > 0) {
      const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0
      body.style.paddingRight = `${current + scrollbar}px`
    }
    body.style.overflow = 'hidden'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      document.body.style.overflow = ''
      document.body.style.paddingRight = savedPaddingRight
    }
  }
}
