const PUBLISHED_FIELDS = ['dorm_name', 'dorm_rules', 'caretaker_phone']

export function mergeDormConfig(current, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return current
  return { ...(current || {}), ...incoming }
}

export function hasDormInfoChanges(current, saved) {
  if (!saved) return true
  return PUBLISHED_FIELDS.some((field) => (current?.[field] || '') !== (saved[field] || ''))
}
