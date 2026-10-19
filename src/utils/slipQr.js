import jsQR from 'jsqr'

const SCAN_DIMENSIONS = [2000, 1200, 800]

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('อ่านรูปสลิปไม่สำเร็จ'))
    }
    image.src = url
  })
}

function scan(image, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return ''
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data?.trim() || ''
}

export default async function readSlipQrPayload(file) {
  try {
    const image = await loadImage(file)
    for (const dimension of SCAN_DIMENSIONS) {
      const payload = scan(image, dimension)
      if (payload) return payload
    }
  } catch {
    return ''
  }
  return ''
}
