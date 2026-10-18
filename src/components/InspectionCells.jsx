import { PersonIcon } from './ParcelIcons.jsx'
import './InspectionCells.css'

function HomeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M10 21v-6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6" />
    </svg>
  )
}

export function InspectionRoomCell({ roomNumber, targetRoomNumber, isMoveRoom }) {
  if (isMoveRoom) {
    return (
      <div className="insp-room">
        <span className="insp-room-pills">
          <span className="insp-room-pill">{roomNumber}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="12" x2="20" y2="12" />
            <polyline points="14 6 20 12 14 18" />
          </svg>
          <span className="insp-room-pill is-target">{targetRoomNumber || '-'}</span>
        </span>
        <small>ห้องเดิม → ห้องใหม่</small>
      </div>
    )
  }
  return (
    <div className="insp-room">
      <span className="insp-room-pill">
        <HomeIcon />
        {roomNumber}
      </span>
    </div>
  )
}

export function InspectionPersonCell({ name, phone }) {
  return (
    <div className="insp-person">
      <span className="insp-person-avatar" aria-hidden="true">
        <PersonIcon size={17} />
      </span>
      <div>
        <strong>{name || '-'}</strong>
        <span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.7L8.7 10.5a16 16 0 0 0 4.8 4.8l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.5a2 2 0 0 1 1.7 2Z" />
          </svg>
          {phone || '-'}
        </span>
      </div>
    </div>
  )
}

export function InspectionDateCell({ value }) {
  const date = value ? new Date(value) : null
  const valid = date && !Number.isNaN(date.getTime())
  return (
    <div className="insp-date">
      <strong>{valid ? date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</strong>
      <span>{valid ? `${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : ''}</span>
    </div>
  )
}

export function InspectionPhotosCell({ count }) {
  const total = Number(count) || 0
  return (
    <span className={`insp-photos${total === 0 ? ' is-empty' : ''}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
      {total > 0 ? `${total} รูป` : 'ไม่มีรูป'}
    </span>
  )
}

export function InspectionInspectorCell({ name, className = '' }) {
  if (!name) return <span className="insp-muted">-</span>
  return (
    <span className="insp-inspector">
      <PersonIcon size={13} />
      <span className={className}>{name}</span>
    </span>
  )
}
