export const CAMERAS = [
  { id: 'CAM-01', name: 'ทางเข้าหอพัก', location: 'ประตูหลัก', scene: 'entrance', online: true, recording: true, motion: true },
  { id: 'CAM-02', name: 'โถงต้อนรับ', location: 'ชั้น 1', scene: 'lobby', online: true, recording: true, motion: false },
  { id: 'CAM-03', name: 'ลานจอดรถ', location: 'พื้นที่ด้านหน้า', scene: 'parking', online: true, recording: true, motion: true },
  { id: 'CAM-04', name: 'ทางเดินชั้น 2', location: 'อาคาร A', scene: 'corridor', online: true, recording: true, motion: false },
  { id: 'CAM-05', name: 'ทางเดินชั้น 3', location: 'อาคาร A', scene: 'corridor', online: false, recording: false, motion: false },
  { id: 'CAM-06', name: 'ร้านเช่าใต้ตึก', location: 'ทางเท้าหน้าร้าน ชั้นล่าง', scene: 'lobby', online: true, recording: true, motion: true },
]

export function cameraSummaryTiles(cameras = CAMERAS) {
  const online = cameras.filter((camera) => camera.online)
  const offline = cameras.length - online.length
  const recording = cameras.filter((camera) => camera.recording).length
  const motion = online.filter((camera) => camera.motion)
  return [
    { key: 'online', icon: 'camera', tone: 'green', label: 'กล้องออนไลน์', value: `${online.length}/${cameras.length}`, hint: offline ? `ออฟไลน์ ${offline} ตัว` : 'ทุกตัวทำงานปกติ' },
    { key: 'offline', icon: 'cameraOff', tone: 'red', label: 'ขาดการเชื่อมต่อ', value: offline, alert: offline > 0, hint: offline ? cameras.filter((camera) => !camera.online).map((camera) => camera.name).join(', ') : null },
    { key: 'recording', icon: 'rec', tone: 'blue', label: 'กำลังบันทึก', value: recording, hint: `จาก ${cameras.length} กล้อง` },
    { key: 'motion', icon: 'motion', tone: 'amber', label: 'ตรวจพบการเคลื่อนไหว', value: motion.length, hint: motion.length ? motion.map((camera) => camera.name).join(', ') : null },
  ]
}
