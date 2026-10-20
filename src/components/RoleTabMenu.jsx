import { useId, useState } from 'react'
import './RoleTabMenu.css'

export default function RoleTabMenu({ tabs, activeKey, activeLabel, onSelect, listClassName, linkClassName, logoutClassName, onLogout, renderBadge }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const selectedLabel = tabs.find((tab) => tab.key === activeKey)?.label || activeLabel || 'เมนู'

  const selectTab = (key) => {
    setOpen(false)
    onSelect(key)
  }

  return (
    <nav className={`role-tab-menu${open ? ' is-open' : ''}`} aria-label="เมนูแดชบอร์ด">
      <button
        type="button"
        className="role-tab-menu-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="role-tab-menu-icon" aria-hidden="true"><span /><span /><span /></span>
        <span>เมนู</span>
        <strong>{selectedLabel}</strong>
      </button>
      <div className="role-tab-menu-panel" id={panelId}>
        <ul className={`nav nav-tabs role-tab-menu-tabs ${listClassName}`}>
          {tabs.map((tab) => (
            <li className="nav-item" key={tab.key}>
              <button
                type="button"
                className={`nav-link role-tab-menu-link ${linkClassName}${activeKey === tab.key ? ' active' : ''}`}
                onClick={() => selectTab(tab.key)}
              >
                {tab.label}
                {renderBadge?.(tab.key)}
              </button>
            </li>
          ))}
        </ul>
        <div className="role-tab-menu-footer">
          <button type="button" className={logoutClassName} onClick={onLogout}>ออกจากระบบ</button>
        </div>
      </div>
    </nav>
  )
}
