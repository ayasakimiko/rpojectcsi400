function SvgPerson({ body = '#1b2530', skin = '#d9c7a8', className = '' }) {
  return (
    <g className={`svg-person ${className}`}>
      <ellipse cx="0" cy="0.5" rx="4" ry="1.2" fill="rgba(0,0,0,0.35)" />
      <g className="svg-person-body">
        <rect x="-2.3" y="-6" width="1.9" height="6" rx="0.8" fill="#222b36" />
        <rect x="0.4" y="-6" width="1.9" height="6" rx="0.8" fill="#222b36" />
        <rect x="-3" y="-15" width="6" height="10" rx="2.4" fill={body} />
        <circle cx="0" cy="-17.6" r="2.6" fill={skin} />
        <path d="M-2.6 -18.6a2.6 2.6 0 0 1 5.2 0z" fill="#2a211b" />
      </g>
    </g>
  )
}

export function EntranceScene() {
  const windowCols = [84, 108, 132, 188, 212, 236]
  const windowRows = [30, 52, 74]
  const lit = new Set(['84-30', '132-52', '212-30', '236-74', '108-74', '188-52'])
  return (
    <svg className="scene-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="en-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24405f" />
          <stop offset="1" stopColor="#89a8c0" />
        </linearGradient>
        <linearGradient id="en-facade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b9b2a4" />
          <stop offset="1" stopColor="#d3ccbd" />
        </linearGradient>
        <linearGradient id="en-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a5058" />
          <stop offset="1" stopColor="#5c636b" />
        </linearGradient>
        <linearGradient id="en-lawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4d6b45" />
          <stop offset="1" stopColor="#5f7f54" />
        </linearGradient>
        <radialGradient id="en-glow">
          <stop offset="0" stopColor="rgba(255,226,160,0.6)" />
          <stop offset="1" stopColor="rgba(255,226,160,0)" />
        </radialGradient>
        <linearGradient id="en-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9b8" />
          <stop offset="1" stopColor="#f4c97a" />
        </linearGradient>
      </defs>
      <rect width="320" height="114" fill="url(#en-sky)" />
      <g className="entrance-svg-cloud" fill="rgba(255,255,255,0.22)">
        <ellipse cx="40" cy="16" rx="26" ry="6" />
        <ellipse cx="58" cy="12" rx="16" ry="5" />
      </g>
      <g className="entrance-svg-cloud is-slow" fill="rgba(255,255,255,0.16)">
        <ellipse cx="230" cy="10" rx="30" ry="5" />
      </g>
      <rect x="0" y="48" width="72" height="66" fill="#7b7568" />
      <g fill="#5b564c">
        {[8, 26, 44].map((x) => [58, 80].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="12" />))}
      </g>
      <rect x="66" y="16" width="188" height="98" fill="url(#en-facade)" />
      <rect x="62" y="12" width="196" height="6" fill="#8d8577" />
      <rect x="154" y="16" width="12" height="98" fill="#aaa294" />
      {windowCols.map((x) => windowRows.map((y) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="16" height="14" fill="#4a4f57" />
          <rect
            className={lit.has(`${x}-${y}`) ? 'entrance-svg-lit' : undefined}
            x={x + 1.5}
            y={y + 1.5}
            width="13"
            height="11"
            fill={lit.has(`${x}-${y}`) ? 'url(#en-glass)' : '#6f8291'}
          />
          <rect x={x - 1} y={y + 14} width="18" height="1.6" fill="#8d8577" />
        </g>
      )))}
      <rect x="130" y="88" width="60" height="5" fill="#5b564c" />
      <rect x="138" y="80" width="44" height="7" rx="1.5" fill="#1e3a5f" />
      <text x="160" y="85.6" textAnchor="middle" fontSize="5" fontWeight="700" fill="#fff">หอพัก</text>
      <rect x="144" y="93" width="32" height="21" fill="#3d3a34" />
      <rect className="entrance-svg-door" x="146" y="95" width="13" height="19" fill="rgba(255,226,170,0.75)" />
      <rect className="entrance-svg-door" x="161" y="95" width="13" height="19" fill="rgba(255,226,170,0.75)" />
      <g fill="#2f4a2c">
        <circle cx="282" cy="78" r="16" />
        <circle cx="298" cy="88" r="13" />
        <circle cx="270" cy="92" r="11" />
        <circle cx="28" cy="92" r="12" />
      </g>
      <g className="entrance-svg-tree">
        <rect x="280" y="92" width="4" height="22" fill="#4a3626" />
      </g>
      <rect y="112" width="320" height="10" fill="#9a958b" />
      <rect y="112" width="320" height="1.4" fill="#b8b2a6" />
      <rect y="122" width="320" height="58" fill="url(#en-lawn)" />
      <polygon points="146,122 174,122 232,180 88,180" fill="url(#en-road)" />
      <g stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeDasharray="7 6">
        <line x1="160" y1="124" x2="160" y2="180" />
      </g>
      <polygon points="146,122 148,122 92,180 88,180" fill="#c9c3b6" />
      <polygon points="172,122 174,122 232,180 228,180" fill="#c9c3b6" />
      <g stroke="#d6d3cc" strokeWidth="1.4">
        {[4, 16, 28, 40, 52, 64, 76, 88].map((x) => <line key={x} x1={x} y1="140" x2={x} y2="156" />)}
        {[236, 248, 260, 272, 284, 296, 308, 320].map((x) => <line key={x} x1={x} y1="140" x2={x} y2="156" />)}
        <line x1="0" y1="142" x2="96" y2="142" />
        <line x1="0" y1="150" x2="96" y2="150" />
        <line x1="226" y1="142" x2="320" y2="142" />
        <line x1="226" y1="150" x2="320" y2="150" />
      </g>
      <rect x="96" y="132" width="5" height="26" fill="#d6d3cc" />
      <rect x="220" y="132" width="5" height="26" fill="#d6d3cc" />
      <g>
        <ellipse cx="251" cy="149" rx="20" ry="2.4" fill="rgba(0,0,0,0.28)" />
        <rect x="235" y="118" width="32" height="30" rx="1" fill="#e6e1d6" />
        <rect x="235" y="118" width="3" height="30" fill="#cfc8ba" />
        <clipPath id="en-booth-window">
          <rect x="240" y="123" width="22" height="13" rx="1" />
        </clipPath>
        <rect x="240" y="123" width="22" height="13" rx="1" fill="#f3e7c8" />
        <g clipPath="url(#en-booth-window)">
          <rect x="240" y="123" width="22" height="13" fill="#e9dcb8" />
          <rect x="240" y="123" width="22" height="2" fill="rgba(255,255,255,0.5)" />
          <g className="entrance-svg-guard">
            <path d="M245 137 v-5.6 a6 4.2 0 0 1 12 0 v5.6 z" fill="#1e3a5f" />
            <rect x="250.4" y="131.4" width="1.2" height="5" fill="#f8fafc" opacity="0.7" />
            <rect x="253.4" y="132.2" width="2" height="1.6" rx="0.3" fill="#facc15" />
            <circle cx="251" cy="128.2" r="2.5" fill="#d9c7a8" />
            <path d="M248.2 127.4 a2.8 2.4 0 0 1 5.6 0 z" fill="#0f2b52" />
            <rect x="247.6" y="127" width="6.8" height="0.9" rx="0.4" fill="#0f2b52" />
          </g>
        </g>
        <rect x="240" y="123" width="22" height="13" rx="1" fill="none" stroke="#5b564c" strokeWidth="0.8" />
        <rect x="251" y="123" width="0.8" height="13" fill="#5b564c" />
        <rect x="238" y="135.6" width="26" height="2" rx="0.5" fill="#b9b1a2" />
        <rect x="231" y="113.5" width="40" height="5" rx="1.2" fill="#1e3a5f" />
        <rect x="244" y="114.6" width="14" height="2.8" rx="0.6" fill="#facc15" />
        <text x="251" y="116.9" textAnchor="middle" fontSize="2.3" fontWeight="700" fill="#1e3a5f">SECURITY</text>
        <rect x="257" y="139" width="6" height="9" rx="0.6" fill="#cfc8ba" />
      </g>
      <rect x="216" y="138" width="5" height="10" fill="#dc2626" />
      <g className="entrance-svg-barrier">
        <rect x="104" y="140" width="114" height="3.6" fill="#f8fafc" />
        <g fill="#dc2626">
          {[110, 128, 146, 164, 182, 200].map((x) => <rect key={x} x={x} y="140" width="8" height="3.6" />)}
        </g>
      </g>
      <g className="entrance-svg-car">
        <ellipse cx="0" cy="13" rx="22" ry="4" fill="rgba(0,0,0,0.4)" />
        <rect x="-19" y="-6" width="38" height="18" rx="5" fill="#e5e7eb" />
        <rect x="-15" y="-15" width="30" height="12" rx="4" fill="#c4cad1" />
        <rect x="-12.5" y="-13.5" width="25" height="7" rx="2" fill="rgba(80,110,135,0.85)" />
        <rect x="-18" y="2" width="7" height="3" rx="1.2" fill="#ef4444" />
        <rect x="11" y="2" width="7" height="3" rx="1.2" fill="#ef4444" />
        <rect x="-6" y="3" width="12" height="4" rx="0.8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.4" />
      </g>
      <g className="entrance-svg-lamp">
        <rect x="70" y="96" width="2.4" height="44" fill="#1f2937" />
        <circle className="entrance-svg-bulb" cx="71" cy="96" r="9" fill="url(#en-glow)" />
        <rect x="208" y="96" width="2.4" height="44" fill="#1f2937" />
        <circle className="entrance-svg-bulb is-late" cx="209" cy="96" r="9" fill="url(#en-glow)" />
      </g>
      <g className="entrance-svg-walker">
        <SvgPerson body="#7c2d12" />
      </g>
      <g className="entrance-svg-leaver">
        <SvgPerson body="#0f766e" />
      </g>
      <g className="entrance-svg-sidewalk">
        <SvgPerson body="#6d28d9" skin="#c9a77c" />
      </g>
    </svg>
  )
}

export function LobbyScene() {
  const floorXs = [-120, -60, 0, 60, 120, 180, 240, 300, 360, 420]
  return (
    <svg className="scene-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="lb-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d5446" />
          <stop offset="1" stopColor="#7c705d" />
        </linearGradient>
        <linearGradient id="lb-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a8172" />
          <stop offset="1" stopColor="#b3aa98" />
        </linearGradient>
        <linearGradient id="lb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9cc0d8" />
          <stop offset="1" stopColor="#dbe6ea" />
        </linearGradient>
        <linearGradient id="lb-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b4f37" />
          <stop offset="1" stopColor="#4a3626" />
        </linearGradient>
        <linearGradient id="lb-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,236,190,0.4)" />
          <stop offset="1" stopColor="rgba(255,236,190,0)" />
        </linearGradient>
        <linearGradient id="lb-ray" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgba(220,236,245,0.28)" />
          <stop offset="1" stopColor="rgba(220,236,245,0)" />
        </linearGradient>
      </defs>
      <rect width="320" height="92" fill="url(#lb-wall)" />
      <rect width="320" height="8" fill="#4a4237" />
      <rect y="78" width="320" height="14" fill="#4e463a" />
      <rect y="77" width="320" height="1.5" fill="#9c8f78" />
      <rect x="14" y="16" width="104" height="54" fill="#3f372d" />
      <rect x="17" y="19" width="98" height="48" fill="url(#lb-sky)" />
      <g fill="#c7d9b8" opacity="0.6">
        <circle cx="34" cy="60" r="9" />
        <circle cx="50" cy="58" r="11" />
        <circle cx="96" cy="61" r="8" />
      </g>
      <g fill="#3f372d">
        <rect x="47" y="19" width="2.4" height="48" />
        <rect x="82" y="19" width="2.4" height="48" />
        <rect x="17" y="42" width="98" height="2" />
      </g>
      <rect x="146" y="24" width="68" height="12" rx="2" fill="#2f2820" />
      <text x="180" y="32.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#e7c98a" letterSpacing="1.2">RECEPTION</text>
      <rect x="252" y="20" width="54" height="72" fill="#3a332a" />
      <rect x="255" y="23" width="23" height="69" fill="rgba(160,190,205,0.55)" />
      <rect x="280" y="23" width="23" height="69" fill="rgba(160,190,205,0.55)" />
      <polygon points="258,26 266,26 260,88 258,88" fill="rgba(255,255,255,0.18)" />
      <polygon points="283,26 291,26 285,88 283,88" fill="rgba(255,255,255,0.18)" />
      <rect x="275" y="54" width="2" height="10" rx="1" fill="#c9b48a" />
      <rect x="281" y="54" width="2" height="10" rx="1" fill="#c9b48a" />
      <rect y="92" width="320" height="88" fill="url(#lb-floor)" />
      <g className="scene-svg-gridlines">
        {floorXs.map((x) => <line key={x} x1={160 + (x - 160) * 0.35} y1="92" x2={x} y2="180" />)}
        {[97, 104, 114, 128, 148, 176].map((y) => <line key={y} x1="0" y1={y} x2="320" y2={y} />)}
      </g>
      <polygon className="lobby-svg-ray" points="17,67 115,67 170,180 40,180" fill="url(#lb-ray)" />
      {[70, 160, 250].map((x, index) => (
        <g key={x} className={`scene-svg-light${index === 1 ? ' is-flicker' : ''}`}>
          <polygon points={`${x - 6},8 ${x + 6},8 ${x + 34},92 ${x - 34},92`} fill="url(#lb-cone)" />
          <rect x={x - 7} y="7" width="14" height="2.4" rx="1" fill="#fff4d6" />
        </g>
      ))}
      <ellipse cx="62" cy="152" rx="56" ry="16" fill="#6d5a6a" opacity="0.55" />
      <rect x="24" y="122" width="76" height="20" rx="5" fill="#556273" />
      <rect x="24" y="114" width="76" height="12" rx="5" fill="#64738a" />
      <rect x="20" y="118" width="10" height="26" rx="4" fill="#4b5768" />
      <rect x="94" y="118" width="10" height="26" rx="4" fill="#4b5768" />
      <rect x="34" y="120" width="26" height="9" rx="3" fill="#7a89a0" />
      <rect x="64" y="120" width="26" height="9" rx="3" fill="#7a89a0" />
      <ellipse cx="62" cy="146" rx="40" ry="3" fill="rgba(0,0,0,0.25)" />
      <ellipse cx="62" cy="168" rx="22" ry="5" fill="rgba(0,0,0,0.25)" />
      <ellipse cx="62" cy="162" rx="22" ry="5" fill="#3b2f25" />
      <rect x="58" y="157" width="8" height="4" rx="1" fill="#e8dcc4" />
      <g className="lobby-svg-plant">
        <rect x="124" y="100" width="12" height="16" rx="2" fill="#5c4634" />
        <ellipse cx="130" cy="94" rx="11" ry="9" fill="#3f6b45" />
        <ellipse cx="124" cy="88" rx="6" ry="8" fill="#4d8054" />
        <ellipse cx="136" cy="86" rx="6" ry="9" fill="#457a4c" />
      </g>
      <g transform="translate(196 100)">
        <SvgPerson className="lobby-svg-staff" body="#1e3a5f" />
      </g>
      <polygon points="146,92 252,92 258,100 140,100" fill="#8a6c4f" />
      <rect x="140" y="100" width="118" height="34" fill="url(#lb-wood)" />
      <rect x="140" y="100" width="118" height="2" fill="#a88a68" />
      <g fill="rgba(255,255,255,0.05)">
        <rect x="152" y="106" width="22" height="24" />
        <rect x="188" y="106" width="22" height="24" />
        <rect x="224" y="106" width="22" height="24" />
      </g>
      <ellipse cx="199" cy="137" rx="64" ry="4" fill="rgba(0,0,0,0.3)" />
      <rect x="214" y="80" width="18" height="12" rx="1.5" fill="#1f2937" />
      <rect className="lobby-svg-screen" x="216" y="82" width="14" height="8" fill="#60a5fa" />
      <rect x="221" y="92" width="4" height="2" fill="#1f2937" />
      <rect x="160" y="89" width="14" height="3" rx="1" fill="#e5e7eb" />
      <g className="lobby-svg-guest">
        <SvgPerson body="#7c2d12" />
      </g>
      <g className="lobby-svg-guest-two">
        <SvgPerson body="#365314" />
      </g>
    </svg>
  )
}

const END = { left: 130, right: 190, top: 58, bottom: 102 }
const wallTop = (x) => (END.top / END.left) * x
const wallBottom = (x) => 180 - ((180 - END.bottom) / END.left) * x

function doorPoints(xa, xb, mirror = false) {
  const top = (x) => wallTop(x) + 0.24 * (wallBottom(x) - wallTop(x))
  return [[xa, top(xa)], [xb, top(xb)], [xb, wallBottom(xb)], [xa, wallBottom(xa)]]
    .map(([x, y]) => `${mirror ? 320 - x : x},${y}`)
    .join(' ')
}

const SHIRT_COLORS = ['#334155', '#7c2d12', '#065f46', '#1e3a8a', '#831843', '#78350f', '#3f6212', '#0f766e']
const CORRIDOR_WALKERS = ['approach', 'away', 'enter-left', 'exit-right', 'enter-right']

function corridorCast(seed) {
  const picks = CORRIDOR_WALKERS.filter((_, index) => ((seed >> index) & 1) === 1)
  const cast = picks.length >= 2 ? picks : ['approach', CORRIDOR_WALKERS[2 + (seed % 3)]]
  return cast.map((path, index) => ({ path, body: SHIRT_COLORS[(seed + index * 3) % SHIRT_COLORS.length] }))
}

export function CorridorScene({ seed = 0 }) {
  const doors = [[18, 46], [76, 94], [110, 120]]
  const cast = corridorCast(seed)
  const paths = new Set(cast.map((walker) => walker.path))
  return (
    <svg className="scene-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="cr-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d8a80" />
          <stop offset="1" stopColor="#6b6a64" />
        </linearGradient>
        <linearGradient id="cr-right" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#8d8a80" />
          <stop offset="1" stopColor="#6b6a64" />
        </linearGradient>
        <linearGradient id="cr-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d5a55" />
          <stop offset="1" stopColor="#8c877d" />
        </linearGradient>
        <linearGradient id="cr-ceiling" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9b6ad" />
          <stop offset="1" stopColor="#8f8c84" />
        </linearGradient>
        <linearGradient id="cr-door" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a5636" />
          <stop offset="1" stopColor="#5e412a" />
        </linearGradient>
        <radialGradient id="cr-shine">
          <stop offset="0" stopColor="rgba(255,248,225,0.45)" />
          <stop offset="1" stopColor="rgba(255,248,225,0)" />
        </radialGradient>
        <linearGradient id="cr-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c3dbe9" />
          <stop offset="1" stopColor="#eef4f6" />
        </linearGradient>
      </defs>
      <polygon points={`0,0 320,0 ${END.right},${END.top} ${END.left},${END.top}`} fill="url(#cr-ceiling)" />
      <polygon points={`0,0 ${END.left},${END.top} ${END.left},${END.bottom} 0,180`} fill="url(#cr-left)" />
      <polygon points={`320,0 ${END.right},${END.top} ${END.right},${END.bottom} 320,180`} fill="url(#cr-right)" />
      <polygon points={`0,180 320,180 ${END.right},${END.bottom} ${END.left},${END.bottom}`} fill="url(#cr-floor)" />
      <rect x={END.left} y={END.top} width={END.right - END.left} height={END.bottom - END.top} fill="#7d7a72" />
      <rect x="146" y="66" width="28" height="22" fill="#4b4740" />
      <rect className="corridor-svg-window" x="148" y="68" width="24" height="18" fill="url(#cr-window)" />
      <rect x="159.4" y="68" width="1.2" height="18" fill="#4b4740" />
      <rect x="150" y="60" width="20" height="4" rx="0.8" fill="#15803d" />
      <text x="160" y="63.2" textAnchor="middle" fontSize="2.8" fontWeight="700" fill="#dcfce7">EXIT</text>
      <polygon points={`0,170 ${END.left},${END.bottom - 2} ${END.left},${END.bottom} 0,180`} fill="#4b4740" />
      <polygon points={`320,170 ${END.right},${END.bottom - 2} ${END.right},${END.bottom} 320,180`} fill="#4b4740" />
      <g className="scene-svg-gridlines">
        {[-80, 0, 80, 160, 240, 320, 400].map((x) => (
          <line key={x} x1={END.left + (x / 320) * (END.right - END.left)} y1={END.bottom} x2={x} y2="180" />
        ))}
      </g>
      {doors.map(([xa, xb]) => (
        <g key={xa}>
          <polygon points={doorPoints(xa, xb)} fill="url(#cr-door)" stroke="#3d2a1b" strokeWidth="0.8" />
          <polygon points={doorPoints(xa, xb, true)} fill="url(#cr-door)" stroke="#3d2a1b" strokeWidth="0.8" />
        </g>
      ))}
      {paths.has('enter-left') && <polygon className="corridor-svg-open is-enter-left" points={doorPoints(76, 94)} fill="#2a2119" />}
      {paths.has('exit-right') && <polygon className="corridor-svg-open is-exit-right" points={doorPoints(76, 94, true)} fill="#2a2119" />}
      {paths.has('enter-right') && <polygon className="corridor-svg-open is-enter-right" points={doorPoints(18, 46, true)} fill="#2a2119" />}
      <g fill="#e5e7eb">
        <rect x="50" y="62" width="7" height="3.2" rx="0.6" />
        <rect x="263" y="62" width="7" height="3.2" rx="0.6" />
        <rect x="97" y="68" width="4" height="2" rx="0.4" />
        <rect x="219" y="68" width="4" height="2" rx="0.4" />
      </g>
      <g fill="#d4af37">
        <circle cx="42" cy="108" r="1.2" />
        <circle cx="278" cy="108" r="1.2" />
        <circle cx="91" cy="96" r="0.8" />
        <circle cx="229" cy="96" r="0.8" />
      </g>
      <rect x="296" y="110" width="5" height="12" rx="1.6" fill="#dc2626" />
      <rect x="297.5" y="107" width="2" height="3" fill="#1f2937" />
      <g className="scene-svg-light">
        <rect x="128" y="6" width="64" height="5" rx="1" fill="#fffaf0" />
        <ellipse cx="160" cy="172" rx="60" ry="8" fill="url(#cr-shine)" />
      </g>
      <g className="scene-svg-light is-flicker">
        <rect x="143" y="30" width="34" height="3" rx="0.8" fill="#fffaf0" />
        <ellipse cx="160" cy="132" rx="36" ry="5" fill="url(#cr-shine)" />
      </g>
      <g className="scene-svg-light">
        <rect x="151" y="46" width="18" height="1.8" rx="0.6" fill="#fffaf0" />
        <ellipse cx="160" cy="112" rx="18" ry="3" fill="url(#cr-shine)" />
      </g>
      {cast.map((walker) => (
        <g key={walker.path} className={`corridor-svg-walker is-${walker.path}`}>
          <SvgPerson body={walker.body} />
        </g>
      ))}
    </svg>
  )
}
