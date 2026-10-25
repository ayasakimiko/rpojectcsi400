function storageKey(role) {
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    return `expensesSeen:${role}:${user.id || 'anon'}`
  } catch {
    return `expensesSeen:${role}`
  }
}

export function readExpenseSeen(role) {
  try {
    const value = localStorage.getItem(storageKey(role))
    return value === null ? null : Number(value) || 0
  } catch {
    return null
  }
}

export function writeExpenseSeen(role, id) {
  try {
    localStorage.setItem(storageKey(role), String(id))
  } catch {
    return
  }
}

export const maxExpenseId = (list = []) => list.reduce((max, expense) => Math.max(max, Number(expense.id) || 0), 0)

export const countNewExpenses = (list = [], seenId) => (seenId === null ? 0 : list.filter((expense) => Number(expense.id) > seenId).length)
