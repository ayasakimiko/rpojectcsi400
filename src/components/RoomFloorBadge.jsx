import { roomFloorLabel, roomFloorOf } from '../utils/roomFloors.js'
import './RoomFloorBadge.css'

// Small "ชั้น N" pill shown next to a room number.
export default function RoomFloorBadge({ roomNumber, className = '' }) {
  if (roomFloorOf(roomNumber) == null) return null
  return <span className={`room-floor-badge${className ? ` ${className}` : ''}`}>{roomFloorLabel(roomNumber)}</span>
}
