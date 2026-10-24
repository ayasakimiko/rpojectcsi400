import { useState } from 'react'
import { createPortal } from 'react-dom'
import PhotoLightbox from './PhotoLightbox.jsx'
import { UploadImage } from './UploadMedia.jsx'
import { CHECKLIST_ITEMS, RESULT_LABELS } from '../utils/inspectionChecklist.js'
import { changeBetween } from '../utils/moveInBaseline.js'
import './MoveInComparison.css'

const CHANGE_INFO = {
  new: { label: 'เกิดขึ้นใหม่', tone: 'danger' },
  worse: { label: 'แย่ลง', tone: 'warning' },
  better: { label: 'ดีขึ้น', tone: 'success' },
  same: { label: 'เหมือนเดิม', tone: 'muted' },
  unknown: { label: 'เทียบไม่ได้', tone: 'muted' },
}

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'changed', label: 'เฉพาะที่เปลี่ยน' },
  { key: 'new', label: 'เกิดขึ้นใหม่' },
]

const MAX_PHOTOS = 4

function formatDate(value, withTime = false) {
  if (!value) return '-'
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

function Status({ result }) {
  return (
    <span className={`mic-status is-${result || 'none'}`}>
      <i aria-hidden="true" />
      {RESULT_LABELS[result] || 'ไม่ได้ตรวจ'}
    </span>
  )
}

function PhotoColumn({ title, photos, onOpen }) {
  const shown = photos.slice(0, MAX_PHOTOS)
  const hidden = photos.length - shown.length
  return (
    <div className="mic-photo-col">
      <span className="mic-col-title">
        {title} <small>{photos.length} รูป</small>
      </span>
      {photos.length === 0 ? (
        <p className="mic-empty">ไม่มีรูป</p>
      ) : (
        <div className="mic-photos">
          {shown.map((photo, index) => {
            const more = index === shown.length - 1 && hidden > 0
            return (
              <button type="button" key={`${photo.url}-${index}`} className="mic-photo" onClick={() => onOpen(index)} aria-label={`${title} รูปที่ ${index + 1}`}>
                <UploadImage src={photo.url} alt="" loading="lazy" />
                {more && <span>+{hidden + 1}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MoveInComparison({ baseline, latest }) {
  const [filter, setFilter] = useState('all')
  const [lightbox, setLightbox] = useState(null)

  if (!baseline) {
    return (
      <div className="mic-card is-empty">
        <strong>ไม่มีผลตรวจก่อนเข้าอยู่ให้เปรียบเทียบ</strong>
        <span>ผู้เช่าคนนี้ไม่ได้ตรวจห้องก่อนเข้าอยู่ไว้</span>
      </div>
    )
  }

  const baselineAssets = new Map((baseline.assets || []).map((asset) => [asset.name, asset.result]))
  const latestAssets = latest.assets || []
  const rows = [
    ...CHECKLIST_ITEMS.map((item) => ({
      key: `c-${item.key}`,
      group: 'ตัวห้อง',
      label: item.label.replace(/\s*\(.*\)$/, ''),
      before: baseline.checklist?.[item.key],
      after: latest.checklist?.[item.key],
    })),
    ...latestAssets.map((asset) => ({
      key: `a-${asset.name}`,
      group: 'อุปกรณ์และทรัพย์สิน',
      label: asset.name,
      before: baselineAssets.get(asset.name) ?? asset.move_in_result ?? null,
      after: asset.result,
    })),
    ...[...baselineAssets.entries()]
      .filter(([name]) => !latestAssets.some((asset) => asset.name === name))
      .map(([name, result]) => ({ key: `b-${name}`, group: 'อุปกรณ์และทรัพย์สิน', label: name, before: result, after: null })),
  ].map((row) => ({ ...row, change: changeBetween(row.before, row.after) }))

  const tally = rows.reduce((acc, row) => ({ ...acc, [row.change]: (acc[row.change] || 0) + 1 }), {})
  const shown = rows.filter((row) =>
    filter === 'all' ? true : filter === 'changed' ? !['same', 'unknown'].includes(row.change) : row.change === 'new',
  )
  const groups = ['ตัวห้อง', 'อุปกรณ์และทรัพย์สิน']
    .map((group) => ({ group, rows: shown.filter((row) => row.group === group) }))
    .filter((entry) => entry.rows.length > 0)
  const baselinePhotos = baseline.photos || []
  const latestPhotos = latest.photos || []
  const lightboxPhotos = lightbox?.side === 'before' ? baselinePhotos : latestPhotos

  return (
    <div className="mic-card">
      <div className="mic-sides">
        <div className="mic-side is-before">
          <small>ตอนเข้าอยู่ · บันทึกล่าสุด</small>
          <strong>{formatDate(baseline.inspection_date)}</strong>
          <span>{baseline.inspected_by_name ? `โดย ${baseline.inspected_by_name}` : '-'}</span>
        </div>
        <span className="mic-arrow" aria-hidden="true">→</span>
        <div className="mic-side is-after">
          <small>ตรวจล่าสุด</small>
          <strong>{formatDate(latest.updated_at || latest.created_at, true)}</strong>
          <span>{latest.inspected_by_name || latest.inspected_by ? `โดย ${latest.inspected_by_name || latest.inspected_by}` : '-'}</span>
        </div>
      </div>

      <div className="mic-tally">
        {['new', 'worse', 'better', 'same'].map((key) => (
          <span key={key} className={`is-${CHANGE_INFO[key].tone}${tally[key] ? '' : ' is-zero'}`}>
            <strong>{tally[key] || 0}</strong>
            {CHANGE_INFO[key].label}
          </span>
        ))}
      </div>

      <div className="mic-filter" role="group" aria-label="กรองการเปรียบเทียบ">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={filter === item.key ? 'is-active' : ''}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="mic-empty">{filter === 'new' ? 'ไม่มีความเสียหายที่เกิดขึ้นใหม่' : 'ไม่มีรายการที่เปลี่ยนแปลง'}</p>
      ) : (
        <div className="mic-table-wrap">
          <table className="mic-table">
            <thead>
              <tr>
                <th scope="col">รายการ</th>
                <th scope="col">ตอนเข้าอยู่</th>
                <th scope="col">ตรวจล่าสุด</th>
                <th scope="col">ผลเทียบ</th>
              </tr>
            </thead>
            {groups.map((entry) => (
              <tbody key={entry.group}>
                <tr className="mic-group">
                  <th colSpan={4} scope="colgroup">
                    {entry.group} <small>{entry.rows.length} รายการ</small>
                  </th>
                </tr>
                {entry.rows.map((row) => (
                  <tr key={row.key} className={`is-${row.change}`}>
                    <td className="mic-name">{row.label}</td>
                    <td><Status result={row.before} /></td>
                    <td><Status result={row.after} /></td>
                    <td>
                      <span className={`mic-change is-${CHANGE_INFO[row.change].tone}`}>{CHANGE_INFO[row.change].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <div className="mic-pair">
        <div className="mic-note is-before">
          <span className="mic-col-title">รายละเอียดตอนเข้าอยู่</span>
          <p>{baseline.note || 'ไม่มีบันทึก'}</p>
        </div>
        <div className="mic-note is-after">
          <span className="mic-col-title">รายละเอียดตรวจล่าสุด</span>
          <p>{latest.damage_note || 'ไม่มีบันทึก'}</p>
        </div>
      </div>

      <div className="mic-pair">
        <PhotoColumn title="รูปตอนเข้าอยู่" photos={baselinePhotos} onOpen={(index) => setLightbox({ side: 'before', index })} />
        <PhotoColumn title="รูปตรวจล่าสุด" photos={latestPhotos} onOpen={(index) => setLightbox({ side: 'after', index })} />
      </div>

      {lightbox && lightboxPhotos[lightbox.index] && createPortal(
        <PhotoLightbox
          photos={lightboxPhotos}
          initialIndex={lightbox.index}
          title={lightbox.side === 'before' ? 'รูปตอนเข้าอยู่' : 'รูปตรวจล่าสุด'}
          subtitle={`ห้อง ${latest.room_number}`}
          label={lightbox.side === 'before' ? 'รูปตอนเข้าอยู่' : 'รูปตรวจล่าสุด'}
          onClose={() => setLightbox(null)}
        />,
        document.body,
      )}
    </div>
  )
}
