const HIGHLIGHT_CLASS = 'is-focus-highlight'
const HIGHLIGHT_MS = 2600
const POLL_MS = 120
const MAX_ATTEMPTS = 30

export function focusAndHighlight(selector, { onFound, onMissing } = {}) {
  let attempts = 0
  let timer = 0
  let clearTimer = 0
  let cancelled = false

  const tick = () => {
    if (cancelled) return
    const node = document.querySelector(selector)
    if (!node) {
      attempts += 1
      if (attempts >= MAX_ATTEMPTS) {
        onMissing?.()
        return
      }
      timer = setTimeout(tick, POLL_MS)
      return
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.classList.remove(HIGHLIGHT_CLASS)
    void node.offsetWidth
    node.classList.add(HIGHLIGHT_CLASS)
    clearTimer = setTimeout(() => node.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS)
    onFound?.(node)
  }

  timer = setTimeout(tick, POLL_MS)
  return () => {
    cancelled = true
    clearTimeout(timer)
    clearTimeout(clearTimer)
  }
}
