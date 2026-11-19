// Layout and motion adapted from the "Himal Journeys Template"
// Copyright (c) 2026 Kedhareswer Naidu — MIT License
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasSession, homePathForRole, sessionRole } from '../utils/session.js'
import './css/LandingPage.css'
import buildingImg from '../assets/landing/building.jpg'
import roomBalconyImg from '../assets/landing/room-balcony.jpg'
import roomCityviewImg from '../assets/landing/room-cityview.jpg'
import roomStudioImg from '../assets/landing/room-studio.jpg'
import commonAreaImg from '../assets/landing/common-area.jpg'
import foodNightImg from '../assets/landing/food-night.jpg'
import foodStreetImg from '../assets/landing/food-street.jpg'

const DORM_NAME = 'หอพักใจ'
const MAP_QUERY = 'มหาวิทยาลัยศรีปทุม บางเขน'
const MAP_EMBED_URL = `https://maps.google.com/maps?q=${encodeURIComponent(MAP_QUERY)}&z=16&hl=th&output=embed`
const MAP_LINK_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAP_QUERY)}`

const NAV = [
  { id: 'spaces', label: 'บรรยากาศ' },
  { id: 'about', label: 'เกี่ยวกับเรา' },
  { id: 'highlights', label: 'จุดเด่น' },
  { id: 'location', label: 'ที่ตั้ง' },
]

const HERO_PHRASES = ['ใกล้ห้องเรียน', 'ใจกลางบางเขน', 'ในแบบของคุณ', 'ที่อยู่แล้วสบายใจ']

const SPACES = [
  {
    id: 'balcony',
    tag: 'ห้องพัก',
    title: 'ห้องพร้อมระเบียง',
    img: roomBalconyImg,
    blurb: 'ห้องโปร่ง รับแสงธรรมชาติจากระเบียง มีโต๊ะทำงานตัวยาวสำหรับนั่งอ่านหนังสือหรือทำโปรเจกต์',
    points: ['เตียง ตู้ และโต๊ะทำงานพร้อมใช้', 'เครื่องปรับอากาศในห้อง', 'ระเบียงสำหรับตากผ้าและรับลม'],
  },
  {
    id: 'cityview',
    tag: 'ห้องพัก',
    title: 'ห้องวิวเมือง',
    img: roomCityviewImg,
    blurb: 'หน้าต่างบานกว้าง มองเห็นวิวเมืองและแนวรถไฟฟ้า ตื่นเช้ามาพร้อมแสงแดดอ่อน ๆ',
    points: ['หน้าต่างบานใหญ่ แสงเข้าทั้งวัน', 'ราวแขวนเสื้อผ้าและชั้นวางของ', 'มุมโต๊ะทำงานติดผนัง'],
  },
  {
    id: 'studio',
    tag: 'ห้องพัก',
    title: 'ห้องสตูดิโอ',
    img: roomStudioImg,
    blurb: 'ห้องขนาดกว้าง แบ่งมุมนอน มุมนั่งเล่น และครัวเล็กไว้ทำอาหารง่าย ๆ ได้ในห้องเดียว',
    points: ['มุมนั่งเล่นแยกจากเตียง', 'เคาน์เตอร์ครัวขนาดเล็ก', 'ประตูกระจกออกระเบียง'],
  },
  {
    id: 'common',
    tag: 'พื้นที่ส่วนกลาง',
    title: 'Common Space',
    img: commonAreaImg,
    blurb: 'พื้นที่ส่วนกลางสำหรับอ่านหนังสือ ทำงานกลุ่ม หรือนั่งพักกับเพื่อน มีตู้เครื่องดื่มและขนมพร้อมบริการ',
    points: ['โต๊ะกว้างสำหรับทำงานกลุ่ม', 'Wi-Fi ทั่วทั้งพื้นที่', 'ตู้เครื่องดื่มและขนม'],
  },
  {
    id: 'food-night',
    tag: 'รอบหอพัก',
    title: 'ร้านอาหารหน้าหอ',
    img: foodNightImg,
    blurb: 'เลิกเรียนตอนเย็นก็มีร้านอาหารเรียงรายหน้าหอ ทั้งข้าวผัด ส้มตำ ก๋วยเตี๋ยว และหมูปิ้ง',
    points: ['ร้านอาหารเปิดถึงค่ำ', 'ราคาเป็นมิตรกับนักศึกษา', 'เดินจากหอได้ทันที'],
  },
  {
    id: 'food-street',
    tag: 'รอบหอพัก',
    title: 'สตรีทฟู้ดใกล้มหาวิทยาลัย',
    img: foodStreetImg,
    blurb: 'ถนนสายอาหารใกล้มหาวิทยาลัย มีของกินให้เลือกเยอะ บรรยากาศคึกคักทุกเย็น',
    points: ['ของกินหลากหลาย', 'ใกล้มหาวิทยาลัยศรีปทุม', 'บรรยากาศคึกคักช่วงเย็น'],
  },
]

// words wrapped in *asterisks* are highlighted in the accent colour
const ABOUT_WORDS = 'หอพักใจ ตั้งอยู่ใกล้ มหาวิทยาลัยศรีปทุม บางเขน เราอยากให้ทุกคน ที่ย้ายเข้ามา รู้สึกเหมือน *ได้กลับบ้าน* ห้องสะอาด ปลอดภัย เดินไปเรียนได้ และทุกเรื่องในหอ จัดการได้ *จากมือถือเครื่องเดียว*'.split(' ')

const ONLINE_FEATURES = [
  { title: 'ดูบิลและชำระค่าเช่า', icon: 'bill' },
  { title: 'แจ้งซ่อมพร้อมติดตามสถานะ', icon: 'tool' },
  { title: 'แจ้งเตือนเมื่อพัสดุมาถึง', icon: 'box' },
  { title: 'ประกาศและข่าวสารจากหอพัก', icon: 'bell' },
]

const STATS = [
  { value: '24', unit: 'ชม.', label: 'ระบบออนไลน์พร้อมใช้ตลอดวัน' },
  { value: '7', unit: 'วัน', label: 'แจ้งซ่อมได้ทุกวัน ไม่ต้องรอเวลาทำการ' },
  { value: '4', unit: 'บริการ', label: 'บิล งานซ่อม พัสดุ และประกาศ ในแอปเดียว' },
  { value: '3', unit: 'สไตล์', label: 'ห้องพักให้เลือกตามไลฟ์สไตล์' },
]

const ICONS = {
  bill: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  tool: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.3-.4-.4-2.3 2.6-2.6Z" />,
  box: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.1 7-11.5a7 7 0 1 0-14 0C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
    </>
  ),
}

// scroll to a section without putting "#id" into the address bar
function scrollToSection(id) {
  if (id === 'top') window.scrollTo({ top: 0 })
  else document.getElementById(id)?.scrollIntoView()
}

function sectionLink(id, after) {
  return (e) => {
    e.preventDefault()
    after?.()
    scrollToSection(id)
  }
}

function Icon({ name, size = 20, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null
// Thai vowels and tone marks must stay attached to their base letter, so split by grapheme, not by code point
const graphemes = (text) => (segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text))

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function useInView({ once = true, threshold = 0.2 } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(() => !('IntersectionObserver' in window))
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        if (once) observer.disconnect()
      } else if (!once) {
        setInView(false)
      }
    }, { threshold })
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, threshold])
  return [ref, inView]
}

function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const [ref, inView] = useInView({ threshold: 0.15 })
  return (
    <Tag ref={ref} className={`lp-reveal${inView ? ' is-in' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

function RollLabel({ children }) {
  return (
    <span className="lp-roll">
      <span className="lp-roll-inner">
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
    </span>
  )
}

function Letters({ text, className }) {
  return (
    <span className={className} aria-hidden="true">
      {graphemes(text).map((letter, i) => (
        <span key={i} style={{ '--i': i }}>{letter}</span>
      ))}
    </span>
  )
}

function MorphPhrase({ phrases, paused }) {
  const [state, setState] = useState({ index: 0, prev: null })
  const wrapRef = useRef(null)
  const measureRefs = useRef([])
  const widthsRef = useRef([])
  const indexRef = useRef(0)

  const applyWidth = useCallback(() => {
    const width = widthsRef.current[indexRef.current]
    if (wrapRef.current && width) wrapRef.current.style.width = `${Math.ceil(width) + 6}px`
  }, [])

  useLayoutEffect(() => {
    const measure = () => {
      widthsRef.current = measureRefs.current.map((el) => el?.getBoundingClientRect().width || 0)
      applyWidth()
    }
    measure()
    document.fonts?.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [phrases, applyWidth])

  useLayoutEffect(() => {
    indexRef.current = state.index
    applyWidth()
  }, [state.index, applyWidth])

  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => {
      setState((s) => ({ index: (s.index + 1) % phrases.length, prev: s.index }))
    }, 3200)
    return () => clearInterval(id)
  }, [paused, phrases.length])

  return (
    <span className="lp-morph" ref={wrapRef}>
      <span className="lp-sr">{phrases[state.index]}</span>
      {state.prev !== null && <Letters key={`out-${state.prev}-${state.index}`} text={phrases[state.prev]} className="lp-morph-word is-out" />}
      <Letters key={`in-${state.index}`} text={phrases[state.index]} className="lp-morph-word is-in" />
      <span className="lp-morph-measure" aria-hidden="true">
        {phrases.map((phrase, i) => (
          <span key={phrase} ref={(el) => { measureRefs.current[i] = el }}>{phrase}</span>
        ))}
      </span>
    </span>
  )
}

function NavBar({ pill, activeId, loginPath, loginLabel }) {
  const listRef = useRef(null)
  const linkRefs = useRef({})
  const inkRef = useRef({ left: 0, visible: false })
  const [hoverId, setHoverId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const targetId = hoverId || (pill ? activeId : null)

  useLayoutEffect(() => {
    const list = listRef.current
    const link = targetId ? linkRefs.current[targetId] : null
    if (!list) return
    if (!link) {
      list.dataset.ink = 'off'
      inkRef.current.visible = false
      return
    }
    const left = link.offsetLeft
    const right = list.offsetWidth - (link.offsetLeft + link.offsetWidth)
    const wasVisible = inkRef.current.visible
    const movingRight = left > inkRef.current.left
    // the leading edge darts ahead, the trailing edge catches up
    list.style.setProperty('--dl', !wasVisible ? '0s' : movingRight ? '0.5s' : '0.28s')
    list.style.setProperty('--dr', !wasVisible ? '0s' : movingRight ? '0.28s' : '0.5s')
    list.style.setProperty('--pl', `${left}px`)
    list.style.setProperty('--pr', `${right}px`)
    list.dataset.ink = 'on'
    inkRef.current = { left, visible: true }
  }, [targetId, pill])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className={`lp-nav${pill ? ' is-pill' : ''}${menuOpen ? ' is-open' : ''}`}>
      <div className="lp-nav-bar">
        <a href="/" className="lp-brand" onClick={sectionLink('top', () => setMenuOpen(false))}>
          <span className="lp-brand-mark"><Icon name="home" size={18} stroke={2.2} /></span>
          {DORM_NAME}
        </a>

        <nav className="lp-nav-links" ref={listRef} aria-label="เมนูหลัก" onMouseLeave={() => setHoverId(null)}>
          <span className="lp-ink" aria-hidden="true" />
          {NAV.map((item) => (
            <a
              key={item.id}
              ref={(el) => { linkRefs.current[item.id] = el }}
              href={`#${item.id}`}
              onClick={sectionLink(item.id)}
              aria-current={activeId === item.id ? 'true' : undefined}
              onMouseEnter={() => setHoverId(item.id)}
              onFocus={() => setHoverId(item.id)}
              onBlur={() => setHoverId(null)}
            >
              {item.label}
            </a>
          ))}
          <span className="lp-ink-labels" aria-hidden="true">
            {NAV.map((item) => <span key={item.id}>{item.label}</span>)}
          </span>
        </nav>

        <Link to={loginPath} className="lp-nav-login lp-roll-host">
          <RollLabel>{loginLabel}</RollLabel>
        </Link>

        <button
          type="button"
          className="lp-menu-btn"
          aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>

        <div className="lp-nav-sheet" hidden={!menuOpen}>
          {NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`} onClick={sectionLink(item.id, () => setMenuOpen(false))}>{item.label}</a>
          ))}
          <Link to={loginPath} className="lp-nav-sheet-login">{loginLabel}</Link>
        </div>
      </div>
    </header>
  )
}

function Coverflow({ items, reduced, sheetIndex, onExplore }) {
  const count = items.length
  const [active, setActive] = useState(0) // unbounded, so a card that wraps around gets a new key and jumps instead of flying across
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [spread, setSpread] = useState(260)
  const [sectionRef, inView] = useInView({ once: false, threshold: 0.3 })
  const trackRef = useRef(null)
  const cardRefs = useRef([])
  const dragRef = useRef(null)

  const current = ((active % count) + count) % count
  const go = useCallback((step) => setActive((a) => a + step), [])

  useEffect(() => {
    const track = trackRef.current
    if (!track || !('ResizeObserver' in window)) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setSpread(Math.max(150, Math.min(300, entry.contentRect.width * 0.25)))
    })
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  const paused = reduced || hovered || dragging || sheetIndex !== null || !inView
  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => go(1), 4200)
    return () => clearInterval(id)
  }, [paused, go])

  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return
    const card = e.target.closest('[data-index]')
    const now = performance.now()
    dragRef.current = { x: e.clientX, lastX: e.clientX, lastT: now, v: 0, index: card ? Number(card.dataset.index) : null }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e) => {
    const state = dragRef.current
    if (!state) return
    const now = performance.now()
    state.v = (e.clientX - state.lastX) / Math.max(1, now - state.lastT)
    state.lastX = e.clientX
    state.lastT = now
    setDrag(e.clientX - state.x)
  }

  const endDrag = (e) => {
    const state = dragRef.current
    if (!state) return
    dragRef.current = null
    const dx = e.clientX - state.x
    setDragging(false)
    setDrag(0)
    if (Math.abs(dx) < 6) {
      if (state.index !== null && state.index !== current) {
        let step = state.index - current
        if (step > count / 2) step -= count
        if (step < -count / 2) step += count
        go(step)
      }
      return
    }
    let steps = Math.round(-dx / spread - state.v * 1.5)
    if (steps === 0 && Math.abs(state.v) > 0.4) steps = state.v < 0 ? 1 : -1
    go(Math.max(-2, Math.min(2, steps)))
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
  }

  const dragShift = drag / spread

  return (
    <div
      ref={sectionRef}
      className="lp-cf"
      role="region"
      aria-roledescription="carousel"
      aria-label="บรรยากาศหอพัก (ใช้ปุ่มลูกศรซ้ายขวาเพื่อเลื่อน)"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={trackRef}
        className={`lp-cf-track${dragging ? ' is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {items.map((item, i) => {
          const behind = active - i
          const lap = Math.floor((behind + 2) / count)
          const offset = lap * count - behind // in [-3, 2] for six cards
          const pos = offset + dragShift
          const dist = Math.abs(pos)
          const isCenter = offset === 0
          const style = {
            transform: `translate(-50%, -50%) translateX(${pos * spread}px) translateY(${dist * dist * 9 - (dist < 0.5 ? 16 : 0)}px) translateZ(${-dist * 170}px) rotateY(${-pos * 15}deg)`,
            opacity: dist > 2.55 ? 0 : 1 - Math.min(dist, 2) * 0.16,
            zIndex: 30 - Math.round(dist * 4),
            transition: dragging ? 'none' : undefined,
            visibility: sheetIndex === i ? 'hidden' : undefined,
            pointerEvents: dist > 2.55 ? 'none' : undefined,
          }
          return (
            <article
              key={`${item.id}:${lap}`}
              ref={(el) => { cardRefs.current[i] = el }}
              data-index={i}
              className={`lp-cf-card${isCenter ? ' is-center' : ''}`}
              style={style}
              aria-hidden={dist > 2.55 ? 'true' : undefined}
            >
              <img src={item.img} alt={item.title} draggable="false" />
              <div className="lp-cf-info">
                <div>
                  <span className="lp-cf-tag">{item.tag}</span>
                  <h3 className="lp-cf-title">{item.title}</h3>
                </div>
                {isCenter && (
                  <button type="button" className="lp-cf-explore" onClick={() => onExplore(i, cardRefs.current[i])}>
                    ดูรายละเอียด
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <div className="lp-cf-controls">
        <button type="button" className="lp-round-btn" aria-label="ก่อนหน้า" onClick={() => go(-1)}>
          <Icon name="arrowLeft" />
        </button>
        <div className="lp-cf-dots" aria-hidden="true">
          {items.map((item, i) => <span key={item.id} className={i === current ? 'is-active' : ''} />)}
        </div>
        <button type="button" className="lp-round-btn" aria-label="ถัดไป" onClick={() => go(1)}>
          <Icon name="arrowRight" />
        </button>
      </div>
      <p className="lp-sr" aria-live="polite">{`${items[current].title} (${current + 1} จาก ${count})`}</p>
    </div>
  )
}

function SpaceSheet({ sheet, item, loginPath, loginLabel, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    if (sheet.open) closeRef.current?.focus({ preventScroll: true })
  }, [sheet.open])

  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = vw < 760 ? vw - 24 : Math.min(980, vw - 48)
  const height = vw < 760 ? vh - 24 : Math.min(620, vh - 48)
  const target = { top: (vh - height) / 2, left: (vw - width) / 2, width, height }
  const box = sheet.open ? target : sheet.rect

  return (
    <div className={`lp-sheet-root${sheet.open ? ' is-open' : ''}`}>
      <div className="lp-sheet-backdrop" onClick={onClose} />
      <div className="lp-sheet" role="dialog" aria-modal="true" aria-labelledby="lp-sheet-title" style={box}>
        <div className="lp-sheet-media">
          <img src={item.img} alt="" />
        </div>
        <div className="lp-sheet-body">
          <span className="lp-eyebrow">{item.tag}</span>
          <h3 id="lp-sheet-title">{item.title}</h3>
          <p>{item.blurb}</p>
          <ul className="lp-check-list">
            {item.points.map((point) => (
              <li key={point}><span className="lp-check"><Icon name="check" size={13} stroke={2.6} /></span>{point}</li>
            ))}
          </ul>
          <div className="lp-sheet-actions">
            <a href="#location" className="lp-btn lp-btn-primary" onClick={sectionLink('location', onClose)}>ดูที่ตั้งหอพัก</a>
            <Link to={loginPath} className="lp-btn lp-btn-line">{loginLabel}</Link>
          </div>
        </div>
        <button type="button" ref={closeRef} className="lp-sheet-close" aria-label="ปิด" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  )
}

function Odometer({ value, run }) {
  return (
    <span className="lp-odo" aria-label={value}>
      {value.split('').map((char, i) => {
        const digit = Number(char)
        return (
          <span key={i} className="lp-odo-col" aria-hidden="true">
            <span
              className="lp-odo-strip"
              style={{ transform: `translateY(${run ? -(10 + digit) : 0}em)`, transitionDelay: `${i * 0.12}s` }}
            >
              {Array.from({ length: 20 }, (_, n) => <span key={n}>{n % 10}</span>)}
            </span>
          </span>
        )
      })}
    </span>
  )
}

function SwitchCard({ loginPath }) {
  const navigate = useNavigate()
  const [resident, setResident] = useState(false)
  const [moving, setMoving] = useState(false)
  const timer = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const toggle = () => {
    setResident((value) => !value)
    setMoving(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMoving(false), 240)
  }

  const act = () => {
    if (resident) navigate(loginPath)
    else scrollToSection('location')
  }

  return (
    <div className="lp-bento-card lp-bento-switch">
      <div className="lp-switch-row">
        <span className={resident ? '' : 'is-active'}>สนใจเข้าพัก</span>
        <button
          type="button"
          role="switch"
          aria-checked={resident}
          aria-label="สลับเป็นผู้พักปัจจุบัน"
          className={`lp-switch${resident ? ' is-on' : ''}${moving ? ' is-moving' : ''}`}
          onClick={toggle}
        >
          <span className="lp-switch-knob" />
        </button>
        <span className={resident ? 'is-active' : ''}>ผู้พักปัจจุบัน</span>
      </div>
      <div className="lp-swap">
        <div className={resident ? 'is-hidden' : ''} aria-hidden={resident}>
          <h3>มาดูห้องจริงก่อนตัดสินใจ</h3>
          <p>หอพักอยู่ใกล้มหาวิทยาลัยศรีปทุม บางเขน แวะมาดูห้องและบรรยากาศรอบหอได้เลย</p>
        </div>
        <div className={resident ? '' : 'is-hidden'} aria-hidden={!resident}>
          <h3>จัดการทุกเรื่องในหอได้ทันที</h3>
          <p>เข้าสู่ระบบด้วยเลขบัตรประชาชนหรือเลขห้อง เพื่อดูบิล แจ้งซ่อม และเช็กพัสดุ</p>
        </div>
      </div>
      <button type="button" className="lp-swap-btn" onClick={act}>
        <span className="lp-roll">
          <span className="lp-roll-inner" style={{ transform: resident ? 'translateY(-50%)' : 'none' }}>
            <span aria-hidden={resident}>ดูที่ตั้งหอพัก</span>
            <span aria-hidden={!resident}>เข้าสู่ระบบ</span>
          </span>
        </span>
        <Icon name="arrowRight" size={18} />
      </button>
    </div>
  )
}

function OnlineCard() {
  const [open, setOpen] = useState(false)
  return (
    <div className="lp-bento-card">
      <span className="lp-eyebrow">ระบบหอพักออนไลน์</span>
      <h3>ทุกเรื่องในหอ อยู่ในมือถือ</h3>
      <p>ไม่ต้องเดินลงไปติดต่อสำนักงาน เรื่องที่ทำบ่อยที่สุดทำได้จากแอปทั้งหมด</p>
      <div className={`lp-mpill${open ? ' is-open' : ''}`}>
        <button type="button" className="lp-mpill-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          ดูว่าทำอะไรได้บ้าง
          <span className="lp-mpill-icon"><Icon name="plus" size={16} stroke={2.4} /></span>
        </button>
        <div className="lp-mpill-body">
          <ul>
            {ONLINE_FEATURES.map((feature) => (
              <li key={feature.title}>
                <span className="lp-mpill-badge"><Icon name={feature.icon} size={18} /></span>
                {feature.title}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function StatsStrip() {
  const [ref, inView] = useInView({ threshold: 0.4 })
  return (
    <div ref={ref} className="lp-stats">
      {STATS.map((stat) => (
        <div key={stat.label} className="lp-stat">
          <div className="lp-stat-num">
            <Odometer value={stat.value} run={inView} />
            <span className="lp-stat-unit">{stat.unit}</span>
          </div>
          <p>{stat.label}</p>
        </div>
      ))}
    </div>
  )
}

function LandingPage() {
  const reduced = usePrefersReducedMotion()
  const signedIn = hasSession()
  const loginPath = signedIn ? homePathForRole(sessionRole()) : '/login'
  const loginLabel = signedIn ? 'ไปที่ระบบของฉัน' : 'เข้าสู่ระบบ'

  const heroRef = useRef(null)
  const parallaxRef = useRef(null)
  const aboutRef = useRef(null)
  const [pill, setPill] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [inked, setInked] = useState(0)
  const [sheet, setSheet] = useState(null)
  const closeTimer = useRef(0)

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.scrollBehavior
    root.style.scrollBehavior = reduced ? 'auto' : 'smooth'
    return () => { root.style.scrollBehavior = previous }
  }, [reduced])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const vh = window.innerHeight
      const heroHeight = heroRef.current?.offsetHeight || vh
      setPill(y > heroHeight - 90)
      if (parallaxRef.current) {
        parallaxRef.current.style.transform = reduced || y > heroHeight ? '' : `translate3d(0, ${y * 0.3}px, 0)`
      }
      let current = null
      for (const item of NAV) {
        const el = document.getElementById(item.id)
        if (el && el.getBoundingClientRect().top < vh * 0.45) current = item.id
      }
      setActiveId(current)
      const about = aboutRef.current
      if (about) {
        const rect = about.getBoundingClientRect()
        const progress = Math.min(1, Math.max(0, (vh * 0.85 - rect.top) / (rect.height + vh * 0.2)))
        setInked(Math.round(progress * ABOUT_WORDS.length * 1.25))
      }
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [reduced])

  const openSheet = useCallback((index, card) => {
    if (!card) return
    clearTimeout(closeTimer.current)
    const { top, left, width, height } = card.getBoundingClientRect()
    setSheet({ index, rect: { top, left, width, height }, open: false })
    requestAnimationFrame(() => requestAnimationFrame(() => setSheet((s) => (s ? { ...s, open: true } : s))))
  }, [])

  const closeSheet = useCallback(() => {
    setSheet((s) => (s ? { ...s, open: false } : s))
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setSheet(null), reduced ? 0 : 600)
  }, [reduced])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const sheetVisible = sheet !== null
  useEffect(() => {
    if (!sheetVisible) return undefined
    const onKey = (e) => { if (e.key === 'Escape') closeSheet() }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [sheetVisible, closeSheet])

  return (
    <div className="lp">
      <NavBar pill={pill} activeId={activeId} loginPath={loginPath} loginLabel={loginLabel} />

      <main>
        <section id="top" className="lp-hero" ref={heroRef}>
          <div className="lp-hero-media" ref={parallaxRef}>
            <img src={buildingImg} alt="" className="lp-hero-img" />
          </div>
          <div className="lp-hero-shade" />
          <div className="lp-hero-inner">
            <span className="lp-hero-kicker lp-rise" style={{ '--d': '0.15s' }}>
              หอพักนักศึกษา · ใกล้มหาวิทยาลัยศรีปทุม บางเขน
            </span>
            <h1 className="lp-hero-title">
              <span className="lp-rise" style={{ '--d': '0.3s' }}>บ้านหลังที่สอง</span>
              <span className="lp-rise" style={{ '--d': '0.45s' }}>
                <MorphPhrase phrases={HERO_PHRASES} paused={reduced} />
              </span>
            </h1>
            <p className="lp-hero-sub lp-rise" style={{ '--d': '0.6s' }}>
              {DORM_NAME} ห้องพักสะอาด ปลอดภัย เดินไปเรียนได้ รอบหอมีของกินเพียบ
              และทุกเรื่องในหอจัดการได้ออนไลน์
            </p>
            <div className="lp-hero-actions lp-rise" style={{ '--d': '0.75s' }}>
              <a href="#spaces" className="lp-cta lp-roll-host" onClick={sectionLink('spaces')}>
                <RollLabel>ดูบรรยากาศหอพัก</RollLabel>
                <span className="lp-cta-dot"><Icon name="arrowRight" size={16} stroke={2.4} /></span>
              </a>
              <Link to={loginPath} className="lp-btn-glass">{loginLabel}</Link>
            </div>
          </div>
        </section>

        <section id="spaces" className="lp-section lp-spaces">
          <Reveal className="lp-wrap lp-head">
            <span className="lp-eyebrow">บรรยากาศ</span>
            <h2 className="lp-h2">ลองเดินชม<em>หอพักใจ</em></h2>
            <p className="lp-lead">ลากการ์ด กดลูกศร หรือใช้ปุ่มซ้ายขวาบนคีย์บอร์ด แล้วกด “ดูรายละเอียด” เพื่อดูแต่ละมุมของหอ</p>
          </Reveal>
          <Coverflow items={SPACES} reduced={reduced} sheetIndex={sheet ? sheet.index : null} onExplore={openSheet} />
        </section>

        <section id="about" className="lp-about" ref={aboutRef}>
          <div className="lp-wrap">
            <span className="lp-eyebrow">เกี่ยวกับเรา</span>
            <p className="lp-ink-text">
              {ABOUT_WORDS.map((word, i) => {
                const accent = word.startsWith('*')
                const text = word.replaceAll('*', '')
                return (
                  <span key={i} className={`${i < inked ? 'is-inked' : ''}${accent ? ' is-accent' : ''}`}>
                    {text}{' '}
                  </span>
                )
              })}
            </p>
          </div>
        </section>

        <section id="highlights" className="lp-section">
          <div className="lp-wrap">
            <Reveal className="lp-head lp-head-left">
              <span className="lp-eyebrow">จุดเด่น</span>
              <h2 className="lp-h2">อยู่สบาย <em>ใช้ชีวิตง่าย</em></h2>
            </Reveal>
            <Reveal className="lp-bento">
              <figure className="lp-bento-photo">
                <img src={foodStreetImg} alt="ถนนสตรีทฟู้ดใกล้หอพัก" loading="lazy" />
                <figcaption>
                  <span className="lp-eyebrow lp-eyebrow-light">รอบหอพัก</span>
                  <h3>ของกินเพียบ อยู่แค่หน้าหอ</h3>
                  <p>ร้านอาหาร สตรีทฟู้ด และร้านสะดวกซื้อ เดินไปได้ทันทีหลังเลิกเรียน</p>
                </figcaption>
              </figure>
              <SwitchCard loginPath={loginPath} />
              <OnlineCard />
            </Reveal>
            <StatsStrip />
          </div>
        </section>

        <section id="location" className="lp-section lp-section-paper">
          <div className="lp-wrap lp-location">
            <Reveal className="lp-location-text">
              <span className="lp-eyebrow">ที่ตั้ง</span>
              <h2 className="lp-h2">ใกล้<em>มหาวิทยาลัยศรีปทุม</em> บางเขน</h2>
              <p className="lp-address">
                <Icon name="pin" size={20} />
                <span>ถนนพหลโยธิน แขวงเสนานิคม เขตจตุจักร กรุงเทพมหานคร 10900</span>
              </p>
              <ul className="lp-check-list">
                <li><span className="lp-check"><Icon name="check" size={13} stroke={2.6} /></span>ใกล้มหาวิทยาลัยศรีปทุม วิทยาเขตบางเขน</li>
                <li><span className="lp-check"><Icon name="check" size={13} stroke={2.6} /></span>ใกล้สถานี BTS เสนานิคม</li>
                <li><span className="lp-check"><Icon name="check" size={13} stroke={2.6} /></span>มีร้านสะดวกซื้อและร้านอาหารรอบหอ</li>
              </ul>
              <a href={MAP_LINK_URL} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary">
                เปิดใน Google Maps
              </a>
            </Reveal>
            <Reveal className="lp-map">
              <iframe
                title="แผนที่หอพักใกล้มหาวิทยาลัยศรีปทุม บางเขน"
                src={MAP_EMBED_URL}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </Reveal>
          </div>
        </section>

        <section className="lp-final">
          <img src={foodNightImg} alt="" loading="lazy" />
          <Reveal className="lp-final-inner">
            <h2>เป็นผู้พักของ{DORM_NAME}อยู่แล้ว?</h2>
            <p>เข้าสู่ระบบเพื่อดูบิล แจ้งซ่อม และรับข่าวสารจากหอพัก</p>
            <Link to={loginPath} className="lp-cta lp-roll-host">
              <RollLabel>{loginLabel}</RollLabel>
              <span className="lp-cta-dot"><Icon name="arrowRight" size={16} stroke={2.4} /></span>
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-grid">
            <div className="lp-footer-about">
              <a href="/" className="lp-brand" onClick={sectionLink('top')}>
                <span className="lp-brand-mark"><Icon name="home" size={18} stroke={2.2} /></span>
                {DORM_NAME}
              </a>
              <p>หอพักนักศึกษาใกล้มหาวิทยาลัยศรีปทุม บางเขน ห้องสะอาด ปลอดภัย และจัดการทุกเรื่องในหอได้จากมือถือ</p>
            </div>

            <nav className="lp-footer-col" aria-label="เมนูท้ายหน้า">
              <h4>เมนู</h4>
              {NAV.map((item) => (
                <a key={item.id} href={`#${item.id}`} onClick={sectionLink(item.id)}>{item.label}</a>
              ))}
            </nav>

            <div className="lp-footer-col">
              <h4>ที่ตั้ง</h4>
              <p>ถนนพหลโยธิน แขวงเสนานิคม<br />เขตจตุจักร กรุงเทพมหานคร 10900</p>
              <a href={MAP_LINK_URL} target="_blank" rel="noopener noreferrer" className="lp-footer-link">
                <Icon name="pin" size={16} />
                เปิดใน Google Maps
              </a>
            </div>

            <div className="lp-footer-col">
              <h4>สำหรับผู้พัก</h4>
              <p>ดูบิล แจ้งซ่อม และเช็กพัสดุได้ทุกวัน</p>
              <Link to={loginPath} className="lp-btn lp-btn-primary lp-footer-login">{loginLabel}</Link>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>© {new Date().getFullYear()} {DORM_NAME} · สงวนลิขสิทธิ์</span>
            <button type="button" className="lp-footer-top" onClick={() => scrollToSection('top')}>
              กลับขึ้นด้านบน
              <span className="lp-footer-top-icon"><Icon name="arrowUp" size={16} stroke={2.2} /></span>
            </button>
          </div>
        </div>
      </footer>

      {sheet && (
        <SpaceSheet sheet={sheet} item={SPACES[sheet.index]} loginPath={loginPath} loginLabel={loginLabel} onClose={closeSheet} />
      )}
    </div>
  )
}

export default LandingPage
