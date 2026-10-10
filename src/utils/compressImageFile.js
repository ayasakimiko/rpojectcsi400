const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function validateImageFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'เลือกได้เฉพาะไฟล์ JPG, PNG หรือ WebP'
  if (file.size === 0) return 'ไฟล์รูปภาพว่างเปล่า กรุณาเลือกรูปใหม่'
  if (file.size > MAX_IMAGE_BYTES) return 'รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป'
  return null
}

export default function compressImageFile(file, maxDimension = 1600) {
  const invalid = validateImageFile(file)
  if (invalid) return Promise.reject(new Error(invalid))

  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      URL.revokeObjectURL(imageUrl)
      if (!context) {
        reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'))
        return
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve({ name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.72) })
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('อ่านรูปภาพไม่สำเร็จ'))
    }
    image.src = imageUrl
  })
}
