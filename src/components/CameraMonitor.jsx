import { memo, useEffect, useRef, useState } from 'react'
import { lockBodyScroll } from '../utils/bodyScrollLock.js'
import ThaiDatePicker from './ThaiDatePicker.jsx'
import { CAMERAS } from '../utils/cameras.js'
import { CorridorScene, EntranceScene, LobbyScene } from './CameraScenes.jsx'
import './CameraMonitor.css'

const VANISH = { x: 160, y: 10 }
const project = (x, y, depth) => VANISH.x + (x - VANISH.x) * ((depth - VANISH.y) / (y - VANISH.y))

function StallRow({ back, front, xs }) {
  return (
    <g className="parking-svg-lines">
      <line x1={project(xs[0], front, back)} y1={back} x2={project(xs[xs.length - 1], front, back)} y2={back} />
      {xs.map((x) => <line key={x} x1={project(x, front, back)} y1={back} x2={x} y2={front} />)}
    </g>
  )
}

function SvgCar({ x, y, scale = 1, color, shade }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="7" rx="14" ry="3.2" fill="rgba(0,0,0,0.45)" />
      <rect x="-12" y="-6" width="24" height="13" rx="4" fill={color} />
      <rect x="-9" y="-11" width="18" height="8" rx="3" fill={shade} />
      <rect x="-7.5" y="-10" width="15" height="4.5" rx="1.5" fill="rgba(170,205,225,0.55)" />
      <rect x="-11" y="2.5" width="4" height="2" rx="1" fill="#f87171" />
      <rect x="7" y="2.5" width="4" height="2" rx="1" fill="#f87171" />
      <rect x="-4" y="3" width="8" height="2.4" rx="0.6" fill="#e5e7eb" opacity="0.8" />
    </g>
  )
}

function ParkingScene() {
  return (
    <svg className="parking-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="pk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1a26" />
          <stop offset="1" stopColor="#2a3a4b" />
        </linearGradient>
        <linearGradient id="pk-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#323c46" />
          <stop offset="1" stopColor="#444f59" />
        </linearGradient>
        <radialGradient id="pk-glow">
          <stop offset="0" stopColor="rgba(255,226,160,0.55)" />
          <stop offset="1" stopColor="rgba(255,226,160,0)" />
        </radialGradient>
        <linearGradient id="pk-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,244,200,0.55)" />
          <stop offset="1" stopColor="rgba(255,244,200,0)" />
        </linearGradient>
      </defs>
      <rect width="320" height="52" fill="url(#pk-sky)" />
      <g fill="#18222d">
        <rect x="0" y="26" width="46" height="26" />
        <rect x="40" y="18" width="30" height="34" />
        <rect x="108" y="30" width="60" height="22" />
        <rect x="196" y="22" width="40" height="30" />
        <rect x="232" y="32" width="88" height="20" />
      </g>
      <g className="parking-svg-windows" fill="#fcd581">
        <rect x="46" y="24" width="3" height="2" />
        <rect x="56" y="30" width="3" height="2" />
        <rect x="120" y="36" width="3" height="2" />
        <rect x="140" y="40" width="3" height="2" />
        <rect x="204" y="28" width="3" height="2" />
        <rect x="220" y="36" width="3" height="2" />
        <rect x="262" y="38" width="3" height="2" />
      </g>
      <rect y="50" width="320" height="130" fill="url(#pk-ground)" />
      <rect y="50" width="320" height="3" fill="#56616c" />
      <ellipse className="parking-svg-pool" cx="40" cy="110" rx="70" ry="26" fill="url(#pk-glow)" />
      <ellipse className="parking-svg-pool pool-two" cx="282" cy="110" rx="70" ry="26" fill="url(#pk-glow)" />
      <StallRow back={58} front={90} xs={[20, 60, 100, 140, 180, 220, 260, 300]} />
      <g className="parking-svg-lane">
        <line x1="0" y1="104" x2="320" y2="104" />
      </g>
      <StallRow back={118} front={178} xs={[-40, 20, 80, 140, 200, 260, 320, 380]} />
      <SvgCar x={project(40, 90, 80)} y={80} scale={0.62} color="#9b2c2c" shade="#7a2020" />
      <SvgCar x={project(120, 90, 80)} y={80} scale={0.62} color="#d6dade" shade="#aab1b8" />
      <SvgCar x={project(160, 90, 80)} y={80} scale={0.62} color="#1f3b68" shade="#172d50" />
      <SvgCar x={project(240, 90, 80)} y={80} scale={0.62} color="#3f4a55" shade="#2d363f" />
      <SvgCar x={project(50, 178, 150)} y={150} scale={1.15} color="#e5e7eb" shade="#b8bec5" />
      <SvgCar x={project(110, 178, 150)} y={150} scale={1.15} color="#2c4a7a" shade="#1f365c" />
      <SvgCar x={project(230, 178, 150)} y={150} scale={1.15} color="#7c2d12" shade="#5f220d" />
      <g className="parking-svg-mover">
        <polygon points="13,-3 60,-12 60,12 13,3" fill="url(#pk-beam)" />
        <g transform="rotate(90) scale(0.85)">
          <rect x="-7" y="-14" width="14" height="28" rx="4" fill="#cbd5e1" />
          <rect x="-5.5" y="-6" width="11" height="12" rx="2" fill="#475569" />
          <rect x="-5" y="-12" width="10" height="4" rx="1" fill="rgba(170,205,225,0.6)" />
        </g>
      </g>
      <g className="parking-svg-walker">
        <g className="parking-svg-walker-body">
          <rect x="-2.6" y="-14" width="5.2" height="12" rx="2.4" fill="#1b2530" />
          <rect x="-2.2" y="-3" width="1.8" height="5" fill="#1b2530" />
          <rect x="0.4" y="-3" width="1.8" height="5" fill="#1b2530" />
          <circle cx="0" cy="-17" r="2.6" fill="#d2c9ac" />
        </g>
      </g>
      <g className="parking-svg-lamp">
        <rect x="38" y="44" width="2" height="66" fill="#1b2530" />
        <rect x="32" y="43" width="12" height="2.5" rx="1" fill="#1b2530" />
        <circle className="parking-svg-bulb" cx="34" cy="47" r="10" fill="url(#pk-glow)" />
      </g>
      <g className="parking-svg-lamp">
        <rect x="280" y="44" width="2" height="66" fill="#1b2530" />
        <rect x="276" y="43" width="12" height="2.5" rx="1" fill="#1b2530" />
        <circle className="parking-svg-bulb bulb-two" cx="286" cy="47" r="10" fill="url(#pk-glow)" />
      </g>
    </svg>
  )
}

const CameraScene = memo(function CameraScene({ scene, seed = 0 }) {
  if (scene === 'lobby') return <LobbyScene />
  if (scene === 'parking') return <ParkingScene />
  if (scene === 'corridor') return <CorridorScene seed={seed} />
  return <EntranceScene />
})

const CAMERA_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', match: () => true },
  { key: 'online', label: 'ออนไลน์', tone: 'success', match: (camera) => camera.online },
  { key: 'offline', label: 'ออฟไลน์', tone: 'muted', match: (camera) => !camera.online },
  { key: 'motion', label: 'ตรวจพบการเคลื่อนไหว', tone: 'warning', match: (camera) => camera.online && camera.motion },
]

function CamIcon({ name, size = 16 }) {
  const paths = {
    camera: ['M15 10l4.5-2.5v9L15 14', 'M3 7h12v10H3z'],
    off: ['M3 3l18 18', 'M15 10l4.5-2.5v9L16 14.5', 'M10 7h5v5', 'M7 7H3v10h12v-2'],
    live: ['M12 12h.01', 'M8.5 8.5a5 5 0 0 0 0 7', 'M15.5 8.5a5 5 0 0 1 0 7', 'M5.6 5.6a9 9 0 0 0 0 12.8', 'M18.4 5.6a9 9 0 0 1 0 12.8'],
    history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3 2'],
    pin: ['M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z', 'M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
    expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
    calendar: ['M4 5h16v16H4z', 'M16 3v4M8 3v4M4 10h16'],
    motion: ['M13 4a1.5 1.5 0 1 0 0 .01', 'M7 21l3-6 3 2v4', 'M10 15l1-5 4 3 3 1', 'M8 10l3-1'],
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

const WEATHER_LABEL = { clear: 'ท้องฟ้าแจ่มใส', cloudy: 'มีเมฆมาก', rain: 'ฝนตก', fog: 'หมอกลง' }
const WEATHER_KEYS = Object.keys(WEATHER_LABEL)

function hashText(text) {
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x45d9f3b) >>> 0
  hash ^= hash >>> 16
  return hash >>> 0
}

function nightLevel(minutes) {
  const hour = minutes / 60
  if (hour < 5 || hour >= 19.5) return 1
  if (hour < 7) return 1 - (hour - 5) / 2
  if (hour >= 17.5) return (hour - 17.5) / 2
  return 0
}

function sceneVariant(date, minutes) {
  const hash = hashText(date)
  const night = nightLevel(minutes)
  return {
    seed: (hash >>> 3) % 32,
    weather: WEATHER_KEYS[hash % WEATHER_KEYS.length],
    shift: (hash % 97) * 1.7,
    night,
    period: night >= 0.85 ? 'กลางคืน' : night > 0.15 ? (minutes < 720 ? 'รุ่งเช้า' : 'พลบค่ำ') : 'กลางวัน',
  }
}

function CameraFeed({ camera, index, mode, time, large = false, scrub = null, paused = false, seeking = false, variant = null }) {
  if (!camera?.online) {
    return (
      <div className={`camera-feed${large ? ' camera-feed-large' : ''} is-offline`}>
        <div className="camera-offline-message">
          <span><CamIcon name="off" size={22} /></span>
          <strong>ขาดการเชื่อมต่อกับกล้อง</strong>
          <small>ตรวจสอบสายสัญญาณหรือไฟเลี้ยงกล้อง</small>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`camera-feed camera-feed-${index + 1} is-scene-${camera.scene}${large ? ' camera-feed-large' : ''}${scrub !== null ? ' is-scrub' : ''}${paused ? ' is-paused' : ''}${seeking ? ' is-seeking' : ''}${variant ? ` weather-${variant.weather}` : ''}`}
      style={{
        ...(scrub !== null ? { '--scrub': `${-(scrub + (variant?.shift || 0))}s` } : {}),
        ...(variant ? { '--night': variant.night } : {}),
      }}
    >
      <div className="camera-feed-scene" aria-hidden="true">
        <CameraScene scene={camera.scene} seed={variant?.seed} />
      </div>
      <span className="camera-feed-weather" aria-hidden="true" />
      <span className="camera-feed-night" aria-hidden="true" />
      <span className="camera-feed-noise" aria-hidden="true" />
      <span className="camera-feed-sweep" aria-hidden="true" />
      <span className="camera-feed-top">
        <span className={`camera-feed-live${mode === 'playback' ? ' is-playback' : ''}`}><i />{mode === 'live' ? 'LIVE' : 'PLAYBACK'}</span>
        {camera.recording && <span className="camera-recording-badge"><i />REC</span>}
      </span>
      {large && <span className="camera-feed-id">{camera.id}</span>}
      <span className="camera-feed-bottom">
        {camera.motion ? <span className="camera-motion-badge"><CamIcon name="motion" size={12} />เคลื่อนไหว</span> : <span />}
        <span className="camera-feed-time">{time}</span>
      </span>
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

function ModeSwitch({ mode, onChange, className = '' }) {
  return (
    <div className={`camera-mode-switch ${className}${mode === 'playback' ? ' is-playback' : ''}`} role="tablist" aria-label="โหมดการดูกล้อง">
      <span className="camera-mode-indicator" aria-hidden="true" />
      {[
        { key: 'live', label: 'ภาพสด', icon: 'live' },
        { key: 'playback', label: 'ดูย้อนหลัง', icon: 'history' },
      ].map((item) => (
        <button key={item.key} type="button" role="tab" aria-selected={mode === item.key} className={mode === item.key ? 'is-active' : ''} onClick={() => onChange(item.key)}>
          <CamIcon name={item.icon} size={14} />
          {item.label}
        </button>
      ))}
    </div>
  )
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function CameraDateControl({ value, max, onChange, label = true }) {
  const isToday = value >= max
  return (
    <div className="camera-date-control">
      {label && <span className="camera-date-label"><CamIcon name="calendar" size={15} />วันที่</span>}
      <div className="camera-date-group">
        <button type="button" className="camera-date-step" onClick={() => onChange(shiftDate(value, -1))} aria-label="วันก่อนหน้า">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <ThaiDatePicker
          value={value}
          maxDate={new Date(`${max}T00:00:00`)}
          onChange={(next) => next && onChange(next)}
          className="camera-date-input"
          popperClassName="thai-dp-popper camera-dp-popper"
          popperPlacement="bottom-end"
          portalId="camera-date-portal"
        />
        <button type="button" className="camera-date-step" onClick={() => onChange(shiftDate(value, 1))} disabled={isToday} aria-label="วันถัดไป">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
      <button type="button" className={`camera-date-today${isToday ? ' is-active' : ''}`} onClick={() => onChange(max)} disabled={isToday}>
        วันนี้
      </button>
    </div>
  )
}

function SkipIcon({ forward }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {forward ? <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></> : <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>}
    </svg>
  )
}

function PlaybackBar({ title, subtitle, minutes, max, ticks, playing, onToggle, onSeek }) {
  const [dragValue, setDragValue] = useState(null)
  const frame = useRef(0)
  const pending = useRef(null)
  const shown = dragValue ?? minutes
  const progress = max > 0 ? (shown / max) * 100 : 0
  const seek = (value) => {
    if (!Number.isFinite(value)) return
    onSeek(Math.max(0, Math.min(max, value)))
  }

  const scheduleSeek = (value) => {
    pending.current = value
    if (frame.current) return
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0
      if (pending.current !== null) seek(pending.current)
    })
  }

  const endDrag = () => {
    window.cancelAnimationFrame(frame.current)
    frame.current = 0
    if (pending.current !== null) seek(pending.current)
    pending.current = null
    setDragValue(null)
  }

  useEffect(() => () => window.cancelAnimationFrame(frame.current), [])

  return (
    <div className="camera-playback">
      <div className="camera-playback-head">
        <span className="camera-playback-label"><CamIcon name="history" size={14} />ไทม์ไลน์ย้อนหลัง</span>
        <span className="camera-playback-meta">{title} <b>·</b> {subtitle}</span>
        <span className={`camera-playback-state${playing ? ' is-playing' : ''}`}><i />{playing ? 'กำลังเล่น' : 'หยุดชั่วคราว'}</span>
      </div>
      <div className="camera-playback-row">
        <div className="camera-playback-buttons">
          <button type="button" className="is-ghost" onClick={() => seek(minutes - 10)} disabled={minutes <= 0} aria-label="ย้อนหลัง 10 นาที" title="ย้อนหลัง 10 นาที"><SkipIcon /></button>
          <button type="button" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}><PlayPauseIcon playing={playing} /></button>
          <button type="button" className="is-ghost" onClick={() => seek(minutes + 10)} disabled={minutes >= max} aria-label="ข้ามไป 10 นาที" title="ข้ามไป 10 นาที"><SkipIcon forward /></button>
        </div>
        <div className={`camera-playback-track${dragValue !== null ? ' is-dragging' : ''}`}>
          <div className="camera-playback-rail" aria-hidden="true">
            <span className="camera-playback-fill" style={{ transform: `scaleX(${progress / 100})` }} />
            <span className="camera-playback-thumb" style={{ left: `${progress}%` }}>
              <em>{formatClock(shown)}</em>
            </span>
          </div>
          <input
            type="range"
            className="camera-playback-input"
            min="0"
            max={max}
            step="0.1"
            value={shown}
            onPointerDown={() => setDragValue(minutes)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onBlur={() => dragValue !== null && endDrag()}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (dragValue !== null) {
                setDragValue(value)
                scheduleSeek(value)
              } else {
                seek(value)
              }
            }}
            aria-label="เลื่อนเวลาเล่นย้อนหลัง"
          />
          <div className="camera-playback-ticks">{ticks.map((tick, index) => <span key={index}>{formatClock(tick)}</span>)}</div>
        </div>
        <div className="camera-playback-time">
          <strong>{formatClock(shown)}</strong>
          <small>/ {formatClock(max)}</small>
        </div>
      </div>
    </div>
  )
}

function CameraMonitor() {
  const [mode, setMode] = useState('live')
  const [selectedId, setSelectedId] = useState(CAMERAS[0].id)
  const [viewerId, setViewerId] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const viewerRef = useRef(null)
  const seekTimer = useRef(null)
  const [seeking, setSeeking] = useState(false)
  const [closing, setClosing] = useState(false)
  const [fsAnim, setFsAnim] = useState(null)
  const fsTimer = useRef(null)
  const today = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-${String(currentTime.getDate()).padStart(2, '0')}`
  const [playbackDate, setPlaybackDate] = useState(today)
  const [playbackMinutes, setPlaybackMinutes] = useState(() => {
    const date = new Date()
    return date.getHours() * 60 + date.getMinutes()
  })
  const currentDayMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
  const maxPlaybackMinutes = playbackDate === today ? currentDayMinutes : 1439
  const safePlaybackMinutes = Math.min(playbackMinutes, maxPlaybackMinutes)
  const playing = isPlaying && safePlaybackMinutes < maxPlaybackMinutes
  const playbackTicks = [0, 0.25, 0.5, 0.75, 1].map((portion) => Math.floor(maxPlaybackMinutes * portion))
  const timeLabel = currentTime.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' })
  const playbackDateLabel = new Date(`${playbackDate}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  const keyword = search.trim().toLowerCase()
  const searchedCameras = CAMERAS.filter((camera) => !keyword || `${camera.id} ${camera.name} ${camera.location}`.toLowerCase().includes(keyword))
  const filterOptions = CAMERA_FILTERS.map((option) => ({ ...option, count: searchedCameras.filter(option.match).length }))
  const visibleCameras = searchedCameras.filter((CAMERA_FILTERS.find((option) => option.key === filter) || CAMERA_FILTERS[0]).match)
  const viewerCamera = CAMERAS.find((camera) => camera.id === viewerId)
  const onlineCount = CAMERAS.filter((camera) => camera.online).length
  const recordingCount = CAMERAS.filter((camera) => camera.recording).length
  const motionCount = CAMERAS.filter((camera) => camera.online && camera.motion).length
  const viewerIndex = CAMERAS.findIndex((camera) => camera.id === viewerId)
  const feedTime = mode === 'playback' ? `${playbackDateLabel} ${formatClock(safePlaybackMinutes)}` : timeLabel
  const liveVariant = sceneVariant(today, currentDayMinutes)
  const viewerVariant = mode === 'playback' ? sceneVariant(playbackDate, safePlaybackMinutes) : liveVariant

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (mode !== 'playback' || !playing) return undefined
    const timer = window.setInterval(() => setPlaybackMinutes((minutes) => Math.min(maxPlaybackMinutes, minutes + 1)), 1000)
    return () => window.clearInterval(timer)
  }, [mode, playing, maxPlaybackMinutes])

  useEffect(() => {
    if (!viewerId) return undefined
    const unlock = lockBodyScroll()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !document.fullscreenElement) setClosing(true)
    }
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === viewerRef.current
      setIsFullscreen(active)
      setFsAnim(active ? 'enter' : 'exit')
      window.clearTimeout(fsTimer.current)
      fsTimer.current = window.setTimeout(() => setFsAnim(null), 420)
    }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      unlock()
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [viewerId])

  async function toggleFullscreen() {
    if (!viewerRef.current) return
    if (document.fullscreenElement) await document.exitFullscreen()
    else await viewerRef.current.requestFullscreen?.()
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setIsPlaying(false)
  }

  function handlePlaybackDateChange(nextDate) {
    if (!nextDate || nextDate > today) return
    setPlaybackDate(nextDate)
    setPlaybackMinutes((minutes) => nextDate === today ? Math.min(minutes, currentDayMinutes) : minutes)
    setIsPlaying(false)
  }

  function openCamera(camera) {
    if (!camera.online) return
    setSelectedId(camera.id)
    setViewerId(camera.id)
    setClosing(false)
    setMode('live')
    setIsPlaying(false)
  }

  function seekTo(value) {
    setPlaybackMinutes(value)
    setSeeking(true)
    window.clearTimeout(seekTimer.current)
    seekTimer.current = window.setTimeout(() => setSeeking(false), 260)
  }

  function closeViewer() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setClosing(true)
  }

  useEffect(() => {
    if (!closing) return undefined
    const timer = window.setTimeout(() => {
      setViewerId(null)
      setClosing(false)
      setMode('live')
      setIsPlaying(false)
    }, 190)
    return () => window.clearTimeout(timer)
  }, [closing])

  const playbackProps = {
    minutes: safePlaybackMinutes,
    max: maxPlaybackMinutes,
    ticks: playbackTicks,
    playing,
    onToggle: () => setIsPlaying((value) => !value),
    onSeek: seekTo,
  }

  return (
    <>
      <section className="camera-monitor" aria-labelledby="camera-monitor-title">
        <header className="camera-monitor-header">
          <span className="camera-monitor-icon"><CamIcon name="camera" size={22} /></span>
          <div className="camera-monitor-heading">
            <h2 id="camera-monitor-title">กล้องวงจรปิด</h2>
            <p>ระบบรักษาความปลอดภัย · อัปเดต {timeLabel}</p>
          </div>
          <div className="camera-monitor-stats">
            <span className="is-online"><i />ออนไลน์ <strong>{onlineCount}/{CAMERAS.length}</strong></span>
            <span className="is-rec"><i />กำลังบันทึก <strong>{recordingCount}</strong></span>
            <span className="is-motion"><i />ตรวจพบการเคลื่อนไหว <strong>{motionCount}</strong></span>
          </div>
        </header>

        <div className="camera-monitor-toolbar">
          <label className="camera-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อกล้อง ตำแหน่ง หรือรหัส" aria-label="ค้นหากล้อง" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="ล้างคำค้นหา">×</button>}
          </label>
          <div className="camera-filter" role="tablist" aria-label="กรองกล้อง">
            {filterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={filter === option.key}
                className={`${filter === option.key ? 'is-active' : ''}${option.tone ? ` is-${option.tone}` : ''}`}
                onClick={() => setFilter(option.key)}
              >
                {option.tone && <i aria-hidden="true" />}
                {option.label}
                <span>{option.count}</span>
              </button>
            ))}
          </div>
          <span className="camera-toolbar-note">พบ {visibleCameras.length} จาก {CAMERAS.length} กล้อง</span>
        </div>

        <div className="camera-monitor-grid">
          {visibleCameras.length === 0 && (
            <div className="camera-empty">
              <span><CamIcon name="camera" size={22} /></span>
              <strong>ไม่พบกล้องที่ตรงกับการค้นหา</strong>
              <small>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</small>
              <button type="button" onClick={() => { setSearch(''); setFilter('all') }}>ล้างตัวกรอง</button>
            </div>
          )}
          {visibleCameras.map((camera) => (
            <article className={`camera-card${camera.online ? '' : ' is-offline'}${selectedId === camera.id ? ' is-selected' : ''}`} key={camera.id}>
              <button type="button" className="camera-preview-button" onClick={() => openCamera(camera)} disabled={!camera.online} aria-label={`เปิดภาพกล้อง ${camera.name}`}>
                <CameraFeed camera={camera} index={CAMERAS.indexOf(camera)} mode="live" time={timeLabel} variant={liveVariant} />
                {camera.online && <span className="camera-preview-hint"><CamIcon name="expand" size={13} />ขยายภาพ</span>}
              </button>
              <div className="camera-card-details">
                <div className="camera-card-top">
                  <h3 title={camera.name}>{camera.name}</h3>
                  <span className={`camera-pill ${camera.online ? 'is-online' : 'is-offline'}`}><i />{camera.online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
                </div>
                <div className="camera-card-meta">
                  <span className="camera-card-location" title={camera.location}><CamIcon name="pin" size={13} />{camera.location}</span>
                  <span className="camera-card-id">{camera.id}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {viewerCamera && (
        <div className={`camera-viewer-backdrop${closing ? ' is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeViewer() }}>
          <section className={`camera-viewer${fsAnim ? ` is-fs-${fsAnim}` : ''}`} ref={viewerRef} role="dialog" aria-modal="true" aria-label={`ภาพกล้อง ${viewerCamera.name}`}>
            <header className="camera-viewer-header">
              <div className="camera-viewer-title">
                <span className="camera-monitor-icon is-sm"><CamIcon name="camera" size={18} /></span>
                <div>
                  <h2>{viewerCamera.name}</h2>
                  <p>
                    <span className="camera-card-id">{viewerCamera.id}</span>
                    <span className="camera-viewer-loc"><CamIcon name="pin" size={13} />{viewerCamera.location}</span>
                    <span className={`camera-viewer-mode-tag${mode === 'playback' ? ' is-playback' : ''}`}><i />{mode === 'live' ? 'ภาพสด' : 'ดูย้อนหลัง'}</span>
                  </p>
                </div>
              </div>
              <div className="camera-viewer-actions">
                <ModeSwitch mode={mode} onChange={changeMode} className="is-compact" />
                <div className={`camera-viewer-date-wrap${mode === 'playback' ? ' is-open' : ''}`} aria-hidden={mode !== 'playback'} inert={mode !== 'playback'}>
                  <CameraDateControl value={playbackDate} max={today} onChange={handlePlaybackDateChange} label={false} />
                </div>
                <span className="camera-viewer-divider" aria-hidden="true" />
                <button type="button" className="camera-icon-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'} title={isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'}><FullscreenIcon expanded={isFullscreen} /></button>
                <button type="button" className="camera-icon-btn camera-viewer-close" onClick={closeViewer} aria-label="ปิดภาพกล้อง" title="ปิด">×</button>
              </div>
            </header>
            <div className="camera-viewer-body">
              <div className={`camera-viewer-main${mode === 'playback' ? ' is-playback' : ''}`}>
                <CameraFeed
                  key={viewerCamera.id}
                  camera={viewerCamera}
                  index={viewerIndex}
                  mode={mode}
                  time={feedTime}
                  large
                  scrub={mode === 'playback' ? safePlaybackMinutes : null}
                  variant={viewerVariant}
                  paused={mode === 'playback' && !playing}
                  seeking={mode === 'playback' && seeking}
                />
                <div className="camera-viewer-playback-wrap" aria-hidden={mode !== 'playback'} inert={mode !== 'playback'}>
                  <div className="camera-viewer-playback-inner">
                    <PlaybackBar title={playbackDateLabel} subtitle={`${viewerCamera.name} · ${viewerCamera.id}`} {...playbackProps} />
                  </div>
                </div>
              </div>
              <aside className="camera-viewer-side">
                <section className="camera-viewer-panel">
                  <h3>กล้องทั้งหมด <span>{onlineCount}/{CAMERAS.length} ออนไลน์</span></h3>
                  <div className="camera-viewer-list">
                    {CAMERAS.map((camera, index) => (
                      <button type="button" key={camera.id} className={camera.id === viewerId ? 'is-active' : ''} disabled={!camera.online} onClick={() => { setViewerId(camera.id); setSelectedId(camera.id) }}>
                        <span className={`camera-thumb${camera.online ? ` camera-feed-${index + 1} is-scene-${camera.scene}` : ' is-offline'}`}>
                          {camera.online ? (
                            <>
                              <span className="camera-thumb-scene" aria-hidden="true"><CameraScene scene={camera.scene} /></span>
                              <i className={mode === 'playback' ? 'is-playback' : ''} />
                            </>
                          ) : <CamIcon name="off" size={14} />}
                        </span>
                        <span className="camera-viewer-list-text">
                          <strong>{camera.name}</strong>
                          <small>{camera.id} · {camera.location}</small>
                        </span>
                        <span className={`camera-status-indicator${camera.online ? ' is-online' : ' is-offline'}`} />
                      </button>
                    ))}
                  </div>
                </section>
                <section className="camera-viewer-panel">
                  <h3>ข้อมูลกล้อง</h3>
                  <dl className="camera-viewer-info">
                    <div><dt>รหัสกล้อง</dt><dd>{viewerCamera.id}</dd></div>
                    <div><dt>ตำแหน่ง</dt><dd>{viewerCamera.location}</dd></div>
                    <div><dt>สถานะ</dt><dd><span className="camera-pill is-online"><i />ออนไลน์</span></dd></div>
                    <div><dt>การบันทึก</dt><dd>{viewerCamera.recording ? <span className="camera-pill is-rec"><i />กำลังบันทึก</span> : <span className="camera-pill is-offline"><i />ไม่บันทึก</span>}</dd></div>
                    <div><dt>สภาพอากาศ</dt><dd><span className={`camera-pill is-weather-${viewerVariant.weather}`}><i />{WEATHER_LABEL[viewerVariant.weather]}</span></dd></div>
                    <div><dt>ช่วงเวลา</dt><dd><span className={`camera-pill ${viewerVariant.night >= 0.5 ? 'is-night' : 'is-day'}`}><i />{viewerVariant.period}</span></dd></div>
                    <div><dt>การเคลื่อนไหว</dt><dd>{viewerCamera.motion ? <span className="camera-pill is-motion"><i />ตรวจพบ</span> : <span className="camera-pill is-offline"><i />ไม่พบ</span>}</dd></div>
                  </dl>
                </section>
              </aside>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default CameraMonitor
