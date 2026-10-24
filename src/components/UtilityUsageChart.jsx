import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './UtilityUsageChart.css'

const SERIES = [
  { key: 'water', label: 'ค่าน้ำ', color: '#0891b2' },
  { key: 'electricity', label: 'ค่าไฟ', color: '#d97706' },
]
const METRICS = [
  { key: 'amount', label: 'จำนวนเงิน', unit: 'บาท' },
  { key: 'units', label: 'หน่วยที่ใช้', unit: 'หน่วย' },
]
const RANGES = [
  { key: 6, label: '6 เดือน' },
  { key: 12, label: '12 เดือน' },
  { key: 0, label: 'ทั้งหมด' },
]
const IGNORED_STATUSES = new Set(['cancelled', 'rejected'])
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const monthKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (key, withYear = false) => {
  const [year, month] = key.split('-').map(Number)
  return `${THAI_MONTHS[month - 1]}${withYear ? ` ${String(year + 543).slice(-2)}` : ''}`
}
const formatNumber = (value, digits = 0) =>
  Number(value).toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const formatValue = (value, metric) =>
  value == null ? '-' : metric === 'amount' ? `฿${formatNumber(value, Number.isInteger(value) ? 0 : 2)}` : `${formatNumber(value, Number.isInteger(value) ? 0 : 2)} หน่วย`

function buildMonths(rentalHistory, roomNumber) {
  const months = new Map()
  for (const booking of rentalHistory || []) {
    if (Number(booking.room_number) !== Number(roomNumber)) continue
    for (const payment of booking.payments || []) {
      if (payment.type !== 'water' && payment.type !== 'electricity') continue
      if (IGNORED_STATUSES.has(payment.status)) continue
      const key = monthKey(payment.payment_date)
      if (!key) continue
      const month = months.get(key) || {
        key,
        water: { amount: 0, units: null, bills: 0, unpaid: false },
        electricity: { amount: 0, units: null, bills: 0, unpaid: false },
      }
      const entry = month[payment.type]
      entry.amount += Number(payment.amount) || 0
      const units = payment.type === 'water' ? payment.water_units : payment.electricity_units
      if (units != null) entry.units = (entry.units || 0) + Number(units)
      entry.bills += 1
      if (payment.status !== 'paid') entry.unpaid = true
      months.set(key, month)
    }
  }
  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function ChartTooltip({ active, payload, metric }) {
  if (!active || !payload?.length) return null
  const month = payload[0].payload
  return (
    <div className="utility-tooltip">
      <strong>{monthLabel(month.key, true)}</strong>
      {SERIES.map((series) => {
        const entry = month.source[series.key]
        return (
          <div key={series.key} className="utility-tooltip-row">
            <span className="utility-swatch" style={{ background: series.color }} aria-hidden="true" />
            <span>{series.label}</span>
            <b>{entry.bills ? formatValue(metric === 'amount' ? entry.amount : entry.units, metric) : 'ไม่มีบิล'}</b>
            {entry.bills > 0 && entry.unpaid && <em>ยังไม่ชำระ</em>}
          </div>
        )
      })}
    </div>
  )
}

export default function UtilityUsageChart({ rentalHistory, roomNumber }) {
  const [metric, setMetric] = useState('amount')
  const [range, setRange] = useState(6)
  const [showTable, setShowTable] = useState(false)

  const allMonths = useMemo(() => buildMonths(rentalHistory, roomNumber), [rentalHistory, roomNumber])
  const months = range ? allMonths.slice(-range) : allMonths
  const metricInfo = METRICS.find((item) => item.key === metric)
  const chartData = months.map((month) => ({
    key: month.key,
    label: monthLabel(month.key, months.length > 6 || month.key.endsWith('-01')),
    source: month,
    water: month.water.bills ? (metric === 'amount' ? month.water.amount : month.water.units) : null,
    electricity: month.electricity.bills ? (metric === 'amount' ? month.electricity.amount : month.electricity.units) : null,
  }))
  const hasUnits = months.some((month) => month.water.units != null || month.electricity.units != null)
  const missingUnits = metric === 'units' && months.some((month) =>
    (month.water.bills && month.water.units == null) || (month.electricity.bills && month.electricity.units == null))

  const empty = allMonths.length === 0
  const latest = allMonths[allMonths.length - 1]
  const previous = allMonths[allMonths.length - 2]
  const otherMetric = metric === 'amount' ? 'units' : 'amount'
  const totals = SERIES.map((series) => {
    const current = latest?.[series.key]
    const before = previous?.[series.key]
    const value = current?.bills ? current[metric] : null
    const previousValue = before?.bills ? before[metric] : null
    return {
      ...series,
      total: months.reduce((sum, month) => sum + month[series.key].amount, 0),
      latest: current,
      value,
      other: current?.bills ? current[otherMetric] : null,
      change: value != null && previousValue != null ? value - previousValue : null,
    }
  })

  return (
    <section className="dashboard-card utility-chart-card" aria-labelledby="utility-chart-title">
      <header className="utility-chart-head">
        <div>
          <h3 id="utility-chart-title">ค่าน้ำ-ค่าไฟ ห้อง {roomNumber}</h3>
          <p>ยอดบิลรายเดือนของห้องนี้ตั้งแต่คุณเข้าพัก</p>
        </div>
      </header>

      <div className="utility-stats">
        {totals.map((series) => (
          <div key={series.key} className="utility-stat" style={{ '--series': series.color }}>
            <span className="utility-stat-label"><i aria-hidden="true" />{series.label}เดือนล่าสุด{latest ? ` · ${monthLabel(latest.key, true)}` : ''}</span>
            <strong>
              {series.value != null ? formatValue(series.value, metric) : '-'}
              {series.latest?.unpaid && <em className="utility-unpaid">ยังไม่ชำระ</em>}
            </strong>
            <small>
              {series.other != null && `${formatValue(series.other, otherMetric)} · `}
              {empty
                ? 'ยังไม่มีบิล'
                : series.latest?.bills && series.value == null
                ? 'เดือนนี้คิดแบบเหมาจ่าย ไม่มีข้อมูลหน่วย'
                : series.change == null
                ? 'ไม่มีเดือนก่อนให้เทียบ'
                : series.change === 0
                  ? 'เท่ากับเดือนก่อน'
                  : <span className={series.change > 0 ? 'is-up' : 'is-down'}>{series.change > 0 ? '▲' : '▼'} {formatValue(Math.abs(series.change), metric)} จากเดือนก่อน</span>}
            </small>
          </div>
        ))}
      </div>

      <div className="utility-controls">
        <div className="utility-segment" role="group" aria-label="ค่าที่แสดง">
          {METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={metric === item.key}
              className={metric === item.key ? 'is-active' : ''}
              disabled={empty || (item.key === 'units' && !hasUnits)}
              title={item.key === 'units' && !hasUnits ? 'บิลของห้องนี้ไม่มีข้อมูลหน่วย' : undefined}
              onClick={() => setMetric(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="utility-segment" role="group" aria-label="ช่วงเวลา">
          {RANGES.map((item) => (
            <button key={item.key} type="button" aria-pressed={range === item.key} className={range === item.key ? 'is-active' : ''} disabled={empty} onClick={() => setRange(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="utility-legend" aria-hidden={showTable}>
        {SERIES.map((series) => (
          <span key={series.key}><i style={{ background: series.color }} />{series.label}</span>
        ))}
        <small>หน่วยแกน: {metricInfo.unit}</small>
      </div>

      <div className="utility-view">
        {empty ? (
          <p className="utility-empty">ยังไม่มีบิลค่าน้ำหรือค่าไฟของห้องนี้</p>
        ) : showTable ? (
          <div className="utility-table-wrap">
            <table className="utility-table">
              <thead>
                <tr>
                  <th scope="col">เดือน</th>
                  <th scope="col">ค่าน้ำ</th>
                  <th scope="col">หน่วยน้ำ</th>
                  <th scope="col">ค่าไฟ</th>
                  <th scope="col">หน่วยไฟ</th>
                  <th scope="col">รวม</th>
                </tr>
              </thead>
              <tbody>
                {[...months].reverse().map((month) => (
                  <tr key={month.key}>
                    <th scope="row">{monthLabel(month.key, true)}</th>
                    <td>{month.water.bills ? formatValue(month.water.amount, 'amount') : '-'}{month.water.unpaid && <em>ค้าง</em>}</td>
                    <td>{month.water.units != null ? formatNumber(month.water.units, Number.isInteger(month.water.units) ? 0 : 2) : '-'}</td>
                    <td>{month.electricity.bills ? formatValue(month.electricity.amount, 'amount') : '-'}{month.electricity.unpaid && <em>ค้าง</em>}</td>
                    <td>{month.electricity.units != null ? formatNumber(month.electricity.units, Number.isInteger(month.electricity.units) ? 0 : 2) : '-'}</td>
                    <td><b>{formatValue(month.water.amount + month.electricity.amount, 'amount')}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="utility-chart" role="img" aria-label={`กราฟ${metricInfo.label}ค่าน้ำและค่าไฟรายเดือน ${months.length} เดือน`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#e8eef6" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d6e4f5' }} tick={{ fill: '#48627d', fontSize: 12 }} interval={0} padding={{ left: 12, right: 12 }} />
                <YAxis
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#6b859e', fontSize: 12 }}
                  tickFormatter={(value) => (metric === 'amount' ? `฿${formatNumber(value)}` : formatNumber(value))}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: '#c7d8ee', strokeDasharray: '4 4' }} />
                {SERIES.map((series) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stroke={series.color}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#fff', stroke: series.color, strokeWidth: 2 }}
                    activeDot={{ r: 5.5, fill: series.color, stroke: '#fff', strokeWidth: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <footer className="utility-chart-foot">
        <span>
          รวม {months.length} เดือน: ค่าน้ำ ฿{formatNumber(totals[0].total)} · ค่าไฟ ฿{formatNumber(totals[1].total)}
          {missingUnits && ' · บางเดือนคิดแบบเหมาจ่าย จึงไม่มีข้อมูลหน่วย'}
        </span>
        <button type="button" className="utility-link" disabled={empty} onClick={() => setShowTable((value) => !value)}>
          {showTable ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'}
        </button>
      </footer>
    </section>
  )
}
