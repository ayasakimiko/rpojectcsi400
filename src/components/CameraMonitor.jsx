import { useEffect, useRef, useState } from 'react'
import './CameraMonitor.css'

const CAMERAS = [
  { id: 'CAM-01', name: 'ทางเข้าหอพัก', location: 'ประตูหลัก', online: true, recording: true, motion: true },
  { id: 'CAM-02', name: 'โถงต้อนรับ', location: 'ชั้น 1', online: true, recording: true, motion: false },
  { id: 'CAM-03', name: 'ลานจอดรถ', location: 'พื้นที่ด้านหน้า', online: true, recording: true, motion: true },
  { id: 'CAM-04', name: 'ทางเดินชั้น 2', location: 'อาคาร A', online: true, recording: true, motion: false },
  { id: 'CAM-05', name: 'ทางเดินชั้น 3', location: 'อาคาร A', online: false, recording: false, motion: false },
]

function CameraFeed({ camera, index, mode, time, large = false }) {
  if (!camera?.online) {
    return <div className={`camera-feed${large ? ' camera-feed-large' : ''} is-offline`}><div className="camera-offline-message">ขาดการเชื่อมต่อกับกล้อง</div></div>
  }

  return (
    <div className={`camera-feed camera-feed-${index + 1}${large ? ' camera-feed-large' : ''}`}>
      <div className="camera-feed-scene" aria-hidden="true">
        <span className="camera-scene-building" />
        <span className="camera-scene-ground" />
        <span className="camera-scene-person person-one" />
        <span className="camera-scene-person person-two" />
      </div>
      <span className={`camera-feed-live${mode === 'playback' ? ' is-playback' : ''}`}><i /> {mode === 'live' ? 'LIVE' : 'PLAYBACK'}</span>
      {camera.recording && <span className="camera-recording-badge">REC</span>}
      {camera.motion && <span className="camera-motion-badge">ตรวจพบการเคลื่อนไหว</span>}
      <span className="camera-feed-id">{camera.id}</span>
      <span className="camera-feed-time">{time}</span>
    </div>
  )
}

function FullscreenIcon({ expanded }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {expanded ? (
        <path d="M8 3v5H3M16 3v5h5M3 16h5v5m13-5h-5v5" />
      ) : (
        <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
      )}
    </svg>
  )
}

function PlayPauseIcon({ playing }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      {playing ? <path d="M7 5h4v14H7zm6 0h4v14h-4z" /> : <path d="M7 4.5v15L19 12 7 4.5z" />}
    </svg>
  )
}

function formatClock(minutes) {
  const safeMinutes = Math.max(0, Math.min(1439, Math.floor(minutes)))
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, '0')}:${String(safeMinutes % 60).padStart(2, '0')}`
}

function CameraMonitor() {
  const [mode, setMode] = useState('live')
  const [selectedId, setSelectedId] = useState(CAMERAS[0].id)
  const [viewerId, setViewerId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const viewerRef = useRef(null)
  const today = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-${String(currentTime.getDate()).padStart(2, '0')}`
  const [playbackDate, setPlaybackDate] = useState(today)
  const [playbackMinutes, setPlaybackMinutes] = useState(() => {
    const date = new Date()
    return date.getHours() * 60 + date.getMinutes()
  })
  const currentDayMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
  const maxPlaybackMinutes = playbackDate === today ? currentDayMinutes : 1439
  const safePlaybackMinutes = Math.min(playbackMinutes, maxPlaybackMinutes)
  const playbackTicks = [0, 0.25, 0.5, 0.75, 1].map((portion) => Math.floor(maxPlaybackMinutes * portion))
  const timeLabel = currentTime.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' })
  const selectedCamera = CAMERAS.find((camera) => camera.id === selectedId)
  const viewerCamera = CAMERAS.find((camera) => camera.id === viewerId)
  const onlineCount = CAMERAS.filter((camera) => camera.online).length
  const viewerIndex = CAMERAS.findIndex((camera) => camera.id === viewerId)

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (mode !== 'playback' || !isPlaying) return undefined
    if (safePlaybackMinutes >= maxPlaybackMinutes) {
      setIsPlaying(false)
      return undefined
    }
    const timer = window.setInterval(() => setPlaybackMinutes((minutes) => Math.min(maxPlaybackMinutes, minutes + 1)), 1000)
    return () => window.clearInterval(timer)
  }, [mode, isPlaying, safePlaybackMinutes, maxPlaybackMinutes])

  useEffect(() => {
    if (!viewerId) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setViewerId(null)
    }
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === viewerRef.current)
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [viewerId])

  async function toggleFullscreen() {
    if (!viewerRef.current) return
    if (document.fullscreenElement) await document.exitFullscreen()
    else await viewerRef.current.requestFullscreen?.()
  }

  function handlePlaybackDateChange(event) {
    const nextDate = event.target.value
    if (!nextDate || nextDate > today) return
    setPlaybackDate(nextDate)
    setPlaybackMinutes((minutes) => nextDate === today ? Math.min(minutes, currentDayMinutes) : minutes)
    setIsPlaying(false)
  }

  function openCamera(camera) {
    if (!camera.online) return
    setSelectedId(camera.id)
    setViewerId(camera.id)
    setIsPlaying(false)
  }

  return (
    <>
      <section className="camera-monitor" aria-labelledby="camera-monitor-title">
        <header className="camera-monitor-header">
          <div>
            <p className="camera-monitor-eyebrow">ระบบรักษาความปลอดภัย</p>
            <h2 id="camera-monitor-title">กล้องวงจรปิด</h2>
            <p className="camera-monitor-description">{onlineCount} จาก {CAMERAS.length} กล้องออนไลน์ · อัปเดต {timeLabel}</p>
          </div>
          <div className="camera-monitor-summary"><span className="camera-online-dot" /><strong>{onlineCount} ออนไลน์</strong></div>
        </header>

        <div className="camera-monitor-toolbar">
          <div className="camera-mode-switch" role="tablist" aria-label="โหมดการดูกล้อง">
            <button type="button" role="tab" aria-selected={mode === 'live'} className={mode === 'live' ? 'is-active' : ''} onClick={() => setMode('live')}>ภาพสด</button>
            <button type="button" role="tab" aria-selected={mode === 'playback'} className={mode === 'playback' ? 'is-active' : ''} onClick={() => setMode('playback')}>ดูย้อนหลัง</button>
          </div>
          {mode === 'playback' && <label className="camera-date-picker"><span>วันที่</span><input type="date" value={playbackDate} max={today} onChange={handlePlaybackDateChange} aria-label="เลือกวันที่ดูย้อนหลัง" /></label>}
        </div>

        <div className="camera-monitor-grid">
          {CAMERAS.map((camera, index) => (
            <article className={`camera-card${camera.online ? '' : ' is-offline'}${selectedId === camera.id ? ' is-selected' : ''}`} key={camera.id}>
              <button type="button" className="camera-preview-button" onClick={() => openCamera(camera)} disabled={!camera.online} aria-label={`เปิดภาพกล้อง ${camera.name}`}>
                <CameraFeed camera={camera} index={index} mode={mode} time={timeLabel} />
                {camera.online && <span className="camera-preview-hint">คลิกเพื่อขยายภาพ</span>}
              </button>
              <div className="camera-card-details">
                <div>
                  <h3>{camera.name}</h3>
                  <p>{camera.id} <span>·</span> {camera.location}</p>
                  <div className="camera-card-status">
                    <span className={`camera-status-indicator${camera.online ? ' is-online' : ' is-offline'}`} />
                    {camera.online ? 'ออนไลน์' : 'ขาดการเชื่อมต่อ'}
                    {camera.recording && <span className="camera-recording-label">● กำลังบันทึก</span>}
                  </div>
                </div>
                <button type="button" className="camera-toggle" onClick={() => openCamera(camera)} disabled={!camera.online}>
                  {camera.online ? 'เปิดภาพ' : 'ออฟไลน์'}
                </button>
              </div>
            </article>
          ))}
        </div>

        {mode === 'playback' && (
          <section className="camera-playback-panel" aria-label="แถบเวลาเล่นย้อนหลัง">
            <div className="camera-playback-heading">
              <div><strong>{selectedCamera?.name}</strong><span>{selectedCamera?.id} · {today}</span></div>
              <span>{formatClock(safePlaybackMinutes)}</span>
            </div>
            <div className="camera-playback-controls">
              <button type="button" onClick={() => setIsPlaying((playing) => !playing)} aria-label={isPlaying ? "Pause" : "Play"}><PlayPauseIcon playing={isPlaying} /></button>
              <input type="range" min="0" max={maxPlaybackMinutes} value={safePlaybackMinutes} onChange={(event) => setPlaybackMinutes(Number(event.target.value))} aria-label="เลื่อนเวลาเล่นย้อนหลัง" />
            </div>
            <div className="camera-playback-ticks">{playbackTicks.map((tick, index) => <span key={index}>{formatClock(tick)}</span>)}</div>
          </section>
        )}
      </section>

      {viewerCamera && (
        <div className="camera-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewerId(null) }}>
          <section className="camera-viewer" ref={viewerRef} role="dialog" aria-modal="true" aria-label={`ภาพกล้อง ${viewerCamera.name}`}>
            <header className="camera-viewer-header">
              <div className="camera-viewer-title">
                <span className="camera-status-indicator is-online" />
                <div><h2>{viewerCamera.name}</h2><p>{viewerCamera.id} · {viewerCamera.location} · {mode === 'live' ? 'ภาพสด' : 'ดูย้อนหลัง'}</p></div>
              </div>
              <div className="camera-viewer-actions">
                <div className="camera-viewer-mode">
                  <button type="button" className={mode === 'live' ? 'is-active' : ''} onClick={() => { setMode('live'); setIsPlaying(false) }}>ภาพสด</button>
                  <button type="button" className={mode === 'playback' ? 'is-active' : ''} onClick={() => setMode('playback')}>ย้อนหลัง</button>
                </div>
                {mode === 'playback' && <input className="camera-viewer-date" type="date" value={playbackDate} max={today} onChange={handlePlaybackDateChange} aria-label="เลือกวันที่ดูย้อนหลัง" />}
                {mode === 'live' && viewerCamera.recording && <span className="camera-viewer-rec"><i /> REC</span>}
                <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Fullscreen" : "Exit fullscreen"}><FullscreenIcon expanded={isFullscreen} /></button>
                <button type="button" className="camera-viewer-close" onClick={() => setViewerId(null)} aria-label="ปิดภาพกล้อง">×</button>
              </div>
            </header>
            <div className="camera-viewer-body">
              <CameraFeed camera={viewerCamera} index={viewerIndex} mode={mode} time={timeLabel} large />
              <aside className="camera-viewer-sidebar">
                <h3>กล้อง</h3>
                {CAMERAS.map((camera) => (
                  <button type="button" key={camera.id} className={camera.id === viewerId ? 'is-active' : ''} disabled={!camera.online} onClick={() => setViewerId(camera.id)}>
                    <span className={`camera-status-indicator${camera.online ? ' is-online' : ' is-offline'}`} />
                    <span><strong>{camera.name}</strong><small>{camera.id} · {camera.location}</small></span>
                  </button>
                ))}
              </aside>
            </div>
            {mode === 'playback' && (
              <div className="camera-viewer-playback">
                <div className="camera-playback-heading"><strong>{playbackDate}</strong><span>{formatClock(safePlaybackMinutes)}</span></div>
                <div className="camera-playback-controls"><button type="button" onClick={() => setIsPlaying((playing) => !playing)} aria-label={isPlaying ? "Pause" : "Play"}><PlayPauseIcon playing={isPlaying} /></button><input type="range" min="0" max={maxPlaybackMinutes} value={safePlaybackMinutes} onChange={(event) => setPlaybackMinutes(Number(event.target.value))} aria-label="เลื่อนเวลาเล่นย้อนหลัง" /></div>
                <div className="camera-playback-ticks">{playbackTicks.map((tick, index) => <span key={index}>{formatClock(tick)}</span>)}</div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

export default CameraMonitor
