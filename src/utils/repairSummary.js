export function repairSummaryTiles(summary, style) {
  const value = (number) => (summary ? number : '—')
  const status = summary?.by_status
  return [
    { key: 'repair-vendors', ...style.vendors, label: 'ช่างที่ใช้งานได้', value: value(summary?.usable_vendors), hint: summary ? `ทำสัญญาทั้งหมด ${summary.vendors} ราย` : null },
    { key: 'repair-sent', ...style.sent, label: 'รอช่างตอบรับ', value: value(status?.sent), alert: Boolean(status?.sent) },
    { key: 'repair-progress', ...style.progress, label: 'กำลังดำเนินการ', value: summary ? status.accepted + status.in_progress : '—', hint: summary ? `รับงานแล้ว ${status.accepted} · กำลังซ่อม ${status.in_progress}` : null },
    { key: 'repair-done', ...style.done, label: 'ซ่อมเสร็จแล้ว', value: value(status?.done) },
    { key: 'repair-rejected', ...style.rejected, label: 'ช่างปฏิเสธงาน', value: value(status?.rejected), hint: 'ส่งต่อให้ช่างรายอื่นได้' },
  ]
}
