import { Modal } from '../page/StaffMain.jsx'
import { ActionDialogButton, NotificationDialog } from './ActionDialog.jsx'

export default function NotificationDetailModal({ notification, onClose, onGo, goLabel = 'ไปที่รายการนี้' }) {
  return (
    <Modal title={notification.title} onClose={onClose} variant="confirm">
      {(requestClose) => (
        <NotificationDialog
          notification={notification}
          actions={
            onGo
              ? [
                  <ActionDialogButton key="close" variant="ghost" onClick={requestClose}>ปิด</ActionDialogButton>,
                  <ActionDialogButton key="go" onClick={() => { onGo(); requestClose() }} autoFocus>{goLabel}</ActionDialogButton>,
                ]
              : [<ActionDialogButton key="close" onClick={requestClose} autoFocus>ปิด</ActionDialogButton>]
          }
        />
      )}
    </Modal>
  )
}
