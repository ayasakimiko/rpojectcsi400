import { floorsOfRooms, roomFloorOf } from '../utils/roomFloors.js'
import './FloorFilterChips.css'

// Floor picker for room lists: one chip per floor showing how many rooms it has
// and how many are vacant. `value` is 'all' or a floor number as a string.
export default function FloorFilterChips({ rooms, floors = [], value, onChange, isVacant = (room) => !room.is_booked }) {
  const floorNumbers = [...new Set([...floors, ...floorsOfRooms(rooms)])].sort((a, b) => a - b)
  if (floorNumbers.length === 0) return null

  const countsOf = (list) => ({ total: list.length, vacant: list.filter(isVacant).length })
  const options = [
    { key: 'all', label: 'ทุกชั้น', ...countsOf(rooms) },
    ...floorNumbers.map((floor) => ({
      key: String(floor),
      label: `ชั้น ${floor}`,
      floor,
      ...countsOf(rooms.filter((room) => roomFloorOf(room.room_number) === floor)),
    })),
  ]

  return (
    <div className="floor-chips" role="tablist" aria-label="กรองตามชั้น">
      {options.map((option) => {
        const active = value === option.key
        return (
          <button
            type="button"
            role="tab"
            key={option.key}
            aria-selected={active}
            className={`floor-chip${active ? ' is-active' : ''}${option.total === 0 ? ' is-empty' : ''}`}
            onClick={() => onChange(option.key)}
          >
            <span className="floor-chip-icon" aria-hidden="true">
              {option.floor ?? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" />
                  <path d="M3 21h18M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
                </svg>
              )}
            </span>
            <span className="floor-chip-text">
              <strong>{option.label}</strong>
              <small>
                {option.total} ห้อง
                {option.total > 0 && <em> · ว่าง {option.vacant}</em>}
              </small>
            </span>
          </button>
        )
      })}
    </div>
  )
}
