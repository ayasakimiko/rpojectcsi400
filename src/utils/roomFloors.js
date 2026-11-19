// A room's floor is the hundreds digit of its number: 101 → floor 1, 204 → floor 2.
// Shared by the API and the pages so every screen agrees on which floor a room is on.

export const roomFloorOf = (roomNumber) => {
  const value = Number(roomNumber)
  return Number.isInteger(value) && value >= 100 ? Math.floor(value / 100) : null
}

export const floorLabel = (floor) => (floor == null ? 'ไม่ระบุชั้น' : `ชั้น ${floor}`)

export const roomFloorLabel = (roomNumber) => floorLabel(roomFloorOf(roomNumber))

export const floorRoomRange = (floor) => `${floor * 100 + 1}–${floor * 100 + 99}`

// Sorted, de-duplicated floors that appear in a list of rooms (for filter dropdowns).
export const floorsOfRooms = (rooms) =>
  [...new Set(rooms.map((room) => roomFloorOf(room.room_number)).filter((floor) => floor != null))].sort((a, b) => a - b)

// Lower floors must cost more: each floor's rate has to be above the floor over it.
// `floors` is [{ floor_number, price_rate }]; returns an error message or ''.
export function floorRateOrderError(floors) {
  const sorted = [...floors].sort((a, b) => a.floor_number - b.floor_number)
  for (let index = 1; index < sorted.length; index += 1) {
    const below = sorted[index - 1]
    const above = sorted[index]
    if (!(Number(below.price_rate) > Number(above.price_rate))) {
      return `เรทชั้น ${below.floor_number} ต้องแพงกว่าชั้น ${above.floor_number} (ชั้นยิ่งต่ำยิ่งแพง)`
    }
  }
  return ''
}
