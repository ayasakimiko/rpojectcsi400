import { Modal } from '../page/StaffMain.jsx'

const formatDate = (value) => (value
  ? new Date(value).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '')

export default function NotificationDetailModal({ notification, onClose, onGo, goLabel = 'ไปที่รายการนี้' }) {
  return (
    <Modal title={notification.title} onClose={onClose} variant="confirm">
      {(requestClose) => (
        <div className="staff-confirm-body">
          <div className={`staff-confirm-icon is-${notification.tone || 'info'}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <p className="staff-confirm-message">
            <span className={`staff-confirm-message-status is-${notification.tone || 'info'}`}>{notification.label}</span>
          </p>
          {notification.details?.length > 0 && (
            <div className="staff-confirm-details">
              {notification.details.map((item) => (
                <div className="staff-confirm-detail-row" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
              {notification.date && (
                <div className="staff-confirm-detail-row">
                  <span>เวลา</span>
                  <strong>{formatDate(notification.date)}</strong>
                </div>
              )}
            </div>
          )}
          <div className="staff-form-actions">
            <button type="button" className={`staff-action-btn${onGo ? '' : ' is-primary'}`} onClick={requestClose}>ปิด</button>
            {onGo && (
              <button type="button" className="staff-action-btn is-primary" onClick={() => { onGo(); requestClose() }}>{goLabel}</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
