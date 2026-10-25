export async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back when clipboard permissions are unavailable.
    }
  }

  const previousFocus = document.activeElement
  const field = document.createElement('textarea')
  field.value = value
  field.readOnly = true
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px;'
  const container = previousFocus?.closest('[role="dialog"], dialog') || document.body
  container.appendChild(field)
  try {
    field.focus({ preventScroll: true })
    field.select()
    field.setSelectionRange(0, value.length)
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
  } finally {
    field.remove()
    previousFocus?.focus?.({ preventScroll: true })
  }
}
