function field(id, value) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

function crc16(text) {
  let crc = 0xffff
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function normalizePromptPayId(value) {
  return String(value || '').replace(/\D/g, '')
}

export function isValidPromptPayId(value) {
  return /^(?:0\d{9}|\d{13})$/.test(normalizePromptPayId(value))
}

export function buildPromptPayPayload(promptPayId, amount) {
  const id = normalizePromptPayId(promptPayId)
  if (!isValidPromptPayId(id)) return ''
  const target = id.length === 10
    ? field('01', `0066${id.slice(1)}`.padStart(13, '0'))
    : field('02', id)
  const merchant = field('29', `${field('00', 'A000000677010111')}${target}`)
  const numericAmount = Number(amount)
  const hasAmount = Number.isFinite(numericAmount) && numericAmount > 0
  const body = [
    field('00', '01'),
    field('01', hasAmount ? '12' : '11'),
    merchant,
    field('53', '764'),
    hasAmount ? field('54', numericAmount.toFixed(2)) : '',
    field('58', 'TH'),
  ].join('')
  const withCrcTag = `${body}6304`
  return `${withCrcTag}${crc16(withCrcTag)}`
}

export function formatPromptPayId(value) {
  const id = normalizePromptPayId(value)
  if (id.length === 10) return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
  if (id.length === 13) return `${id.slice(0, 1)}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id.slice(12)}`
  return id
}
