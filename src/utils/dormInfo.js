const PUBLISHED_FIELDS = ['dorm_name', 'dorm_rules', 'gate_close_time', 'caretaker_phone', 'technician_phone']

export function mergeDormConfig(current, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return current
  return { ...(current || {}), ...incoming }
}

export function hasDormInfoChanges(current, saved) {
  if (!saved) return true
  return PUBLISHED_FIELDS.some((field) => (current?.[field] || '') !== (saved[field] || ''))
}
