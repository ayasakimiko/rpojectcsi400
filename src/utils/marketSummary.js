const money = (value) => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

export function marketSummaryTiles(summary, style) {
  const value = (number) => (summary ? number : '—')
  return [
    { key: 'market-shops', ...style.shops, label: 'ร้านค้าทั้งหมด', value: value(summary?.shops), hint: summary ? `สินค้า ${summary.products.toLocaleString('th-TH')} รายการ` : null },
    { key: 'market-rented', ...style.rented, label: 'ร้านที่มีผู้เช่า', value: value(summary?.rented) },
    { key: 'market-vacant', ...style.vacant, label: 'ร้านว่าง', value: value(summary?.vacant) },
    { key: 'market-income', ...style.income, label: 'ค่าเช่ารวม/เดือน', value: summary ? `฿${money(summary.monthly_income)}` : '—' },
    { key: 'market-expiring', ...style.expiring, label: 'ใกล้หมดสัญญา', value: value(summary?.expiring_soon), hint: 'ภายใน 30 วัน', alert: Boolean(summary?.expiring_soon) },
  ]
}
