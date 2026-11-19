import './NotificationRow.css'

// One bell item plus its delete (soft delete: hides it from this bell only, the
// notification stays in the database). The item itself is a <button>, so the delete
// button sits beside it inside this wrapper instead of being nested in it.
export default function NotificationRow({ onDelete, children }) {
  return (
    <div className="notif-row">
      {children}
      <button
        type="button"
        className="notif-row-delete"
        aria-label="ลบการแจ้งเตือน"
        title="ลบการแจ้งเตือน"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      </button>
    </div>
  )
}
