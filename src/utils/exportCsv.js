const bangkokDateTime = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

const bangkokFileDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

export function exportToCSV(filename, headers, rows, { textKeys = [] } = {}) {
  if (!rows || !rows.length) {
    alert('ไม่มีข้อมูลสำหรับ Export')
    return
  }

  const escapeCell = (cell, asText = false) => {
    if (cell === null || cell === undefined) return '""'
    const stringValue = String(bangkokDateTime(cell)).replace(/"/g, '""')
    if (asText) {
      const formula = `="${stringValue}"&""`
      return `"${formula.replace(/"/g, '""')}"`
    }
    return `"${stringValue}"`
  }

  const headerLine = headers.map((h) => escapeCell(h.label)).join(',')
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCell(row[h.key], textKeys.includes(h.key))).join(',')
  )

  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}_${bangkokFileDate()}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportToExcel(filename, headers, rows, { textKeys = [] } = {}) {
  if (!rows || !rows.length) {
    alert('ไม่มีข้อมูลสำหรับ Export')
    return
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const headerHtml = headers.map(({ label }) => `<th>${escapeHtml(label)}</th>`).join('')
  const rowsHtml = rows.map((row) => `<tr>${headers.map(({ key }) => {
    const textStyle = textKeys.includes(key) ? ' style="mso-number-format:\'\\@\';"' : ''
    return `<td${textStyle}>${escapeHtml(bangkokDateTime(row[key]))}</td>`
  }).join('')}</tr>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}_${bangkokFileDate()}.xls`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
