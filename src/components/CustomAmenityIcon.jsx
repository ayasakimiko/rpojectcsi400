const ICON_PATHS = {
  sparkle: <><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z" /><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z" /></>,
  desk: <><path d="M3 10h18v3H3zM5 13v8m14-8v8M8 10V4h8v6" /></>,
  wardrobe: <><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M12 2v20M9 11v3m6-3v3" /></>,
  shower: <><path d="M5 20V7a4 4 0 0 1 8 0v1m-2 0h7v3h-7zM12 14v1m3-1v2m3-2v1" /></>,
  tv: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 22h8m-4-4v4" /></>,
  balcony: <><path d="M3 21h18M5 17h14M6 17V5h12v12M9 9h6M9 13h6M8 17v4m8-4v4" /></>,
  sofa: <><path d="M4 12V9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M3 12a2 2 0 0 1 2 2v4h14v-4a2 2 0 0 1 4 0v5H1v-5a2 2 0 0 1 2-2Zm2 7v2m14-2v2" /></>,
}

export default function CustomAmenityIcon({ name = 'sparkle', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] || ICON_PATHS.sparkle}
    </svg>
  )
}
