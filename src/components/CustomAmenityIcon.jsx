const ICON_PATHS = {
  sparkle: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  aircon: <><rect x="2" y="4" width="20" height="9" rx="2" /><path d="M6 9h12M7 17c0 1.5-1 2-1 3m6-3v3m5-3c0 1.5 1 2 1 3" /></>,
  fridge: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M5 9h14M8 5v2m0 5v3" /></>,
  desk: <><path d="M3 10h18v3H3zM5 13v8m14-8v8M8 10V4h8v6" /></>,
  wardrobe: <><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M12 2v20M9 11v3m6-3v3" /></>,
  shower: <><path d="M5 20V7a4 4 0 0 1 8 0v1m-2 0h7v3h-7zM12 14v1m3-1v2m3-2v1" /></>,
  tv: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 22h8m-4-4v4" /></>,
  balcony: <><path d="M3 21h18M5 17h14M6 17V5h12v12M9 9h6M9 13h6M8 17v4m8-4v4" /></>,
  sofa: <><path d="M4 12V9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M3 12a2 2 0 0 1 2 2v4h14v-4a2 2 0 0 1 4 0v5H1v-5a2 2 0 0 1 2-2Zm2 7v2m14-2v2" /></>,
  bed: <><path d="M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6M2 21v-3h20v3M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" /><path d="M8 10V8h3v2m2 0V8h3v2" /></>,
  mattress: <><rect x="2" y="8" width="20" height="9" rx="3" /><path d="M2 12.5h20M7 8v9m10-9v9" /></>,
  chair: <><path d="M7 3h10v8H7zM5 11h14v3H5zM7 14v7m10-7v7" /></>,
  shelf: <><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M4 8h16M4 14h16M8 5h3m2 6h3m-8 6h4" /></>,
  dresser: <><circle cx="12" cy="7" r="4" /><path d="M12 11v2M4 13h16v4H4zm2 4v4m12-4v4" /></>,
}

export default function CustomAmenityIcon({ name = 'sparkle', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] || ICON_PATHS.sparkle}
    </svg>
  )
}
