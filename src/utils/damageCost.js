export function damageInputValue(value) {
  return String(value ?? '').replace(/,/g, '').trim()
}

export function damageInputError(value) {
  const text = damageInputValue(value)
  if (!text) return ''
  const number = Number(text)
  if (!Number.isFinite(number) || number < 0) return 'ค่าเสียหายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป'
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 'ค่าเสียหายระบุทศนิยมได้ไม่เกิน 2 ตำแหน่ง'
  return ''
}
