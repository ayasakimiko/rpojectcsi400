import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { buildPromptPayPayload } from '../utils/promptpay.js'
import './PromptPayQr.css'

export default function PromptPayQr({ promptPayId, amount, size = 220, className = '' }) {
  const payload = buildPromptPayPayload(promptPayId, amount)
  const [rendered, setRendered] = useState({ payload: '', url: '' })

  useEffect(() => {
    if (!payload) return undefined
    let cancelled = false
    QRCode.toDataURL(payload, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f2b52', light: '#ffffff' } })
      .then((url) => {
        if (!cancelled) setRendered({ payload, url })
      })
      .catch(() => {
        if (!cancelled) setRendered({ payload, url: '' })
      })
    return () => {
      cancelled = true
    }
  }, [payload, size])

  if (!payload) return null
  const url = rendered.payload === payload ? rendered.url : ''
  return (
    <span className={`promptpay-qr ${className}`.trim()} style={{ width: size, height: size }}>
      {url ? <img src={url} alt="PromptPay QR Code" width={size} height={size} /> : <span className="promptpay-qr-loading">กำลังสร้าง QR...</span>}
    </span>
  )
}
