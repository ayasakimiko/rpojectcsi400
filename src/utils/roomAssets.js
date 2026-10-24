import { useEffect, useState } from 'react'
import axios from 'axios'
import { assetPriceValue, isValidAssetPrice } from './inspectionChecklist.js'

let assetRowId = 0

export const toAssetRows = (assets = []) =>
  assets.map((asset) => ({
    rowId: ++assetRowId,
    name: asset.name || '',
    price: asset.price === undefined || asset.price === null ? '' : String(asset.price),
  }))

export const rowsToAssets = (rows) => rows.map((row) => ({ name: row.name.trim(), price: assetPriceValue(row.price) }))

export function assetRowsError(rows) {
  const names = new Set()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) return 'กรุณาระบุชื่อทรัพย์สินให้ครบทุกแถว'
    if (names.has(name)) return `รายการทรัพย์สิน "${name}" ซ้ำกัน`
    names.add(name)
    if (!isValidAssetPrice(row.price)) return `ราคาของ "${name}" ต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง`
  }
  return ''
}

export function saveRoomAssets(roomNumber, roomTypeId, rows, extra = {}) {
  return axios.put(
    `/api/admin/rooms/${roomNumber}/assets`,
    { ...extra, room_type_id: roomTypeId, assets: rowsToAssets(rows) },
    { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } },
  )
}

export function useRoomTypes() {
  const [roomTypes, setRoomTypes] = useState([])
  useEffect(() => {
    let active = true
    axios
      .get('/api/admin/room-types', { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
      .then(({ data }) => {
        if (active) setRoomTypes(data.roomTypes)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return roomTypes
}
