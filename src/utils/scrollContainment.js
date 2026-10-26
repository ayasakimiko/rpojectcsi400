// Scrolling inside a card that really has more content scrolls only that card: at its top or
// bottom the gesture stops instead of carrying on to the page behind. A card that fits (or
// overflows by a few pixels only) is not treated as scrollable, so the page scrolls as usual.
// CSS overscroll-behavior: contain cannot make that distinction, which is why this is JS.

const MIN_SCROLL_RANGE = 24
const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'overlay'])

function isPageScroller(element) {
  return element === document.body || element === document.documentElement || element === document.scrollingElement
}

function scrollRange(element) {
  return element.scrollHeight - element.clientHeight
}

// The innermost card that owns this vertical gesture, or null when the page should scroll.
function scrollOwner(start) {
  for (let element = start; element && element.nodeType === 1 && !isPageScroller(element); element = element.parentElement) {
    if (scrollRange(element) < MIN_SCROLL_RANGE) continue
    if (SCROLLABLE_OVERFLOW.has(getComputedStyle(element).overflowY)) return element
  }
  return null
}

function canScroll(element, deltaY) {
  if (deltaY < 0) return element.scrollTop > 0
  return Math.ceil(element.scrollTop + element.clientHeight) < element.scrollHeight
}

function containsGesture(target, deltaY) {
  if (!deltaY) return false
  const owner = scrollOwner(target)
  return Boolean(owner) && !canScroll(owner, deltaY)
}

export function installScrollContainment(root = window) {
  const onWheel = (event) => {
    if (event.defaultPrevented || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    if (containsGesture(event.target, event.deltaY)) event.preventDefault()
  }

  let lastTouchY = null
  const onTouchStart = (event) => {
    lastTouchY = event.touches.length === 1 ? event.touches[0].clientY : null
  }
  const onTouchMove = (event) => {
    if (lastTouchY === null || event.touches.length !== 1 || !event.cancelable) return
    const y = event.touches[0].clientY
    const deltaY = lastTouchY - y
    lastTouchY = y
    if (containsGesture(event.target, deltaY)) event.preventDefault()
  }

  root.addEventListener('wheel', onWheel, { passive: false })
  root.addEventListener('touchstart', onTouchStart, { passive: true })
  root.addEventListener('touchmove', onTouchMove, { passive: false })
  return () => {
    root.removeEventListener('wheel', onWheel)
    root.removeEventListener('touchstart', onTouchStart)
    root.removeEventListener('touchmove', onTouchMove)
  }
}
