export const ROOM_AMENITY_ICON_KEYS = ['sparkle', 'desk', 'wardrobe', 'shower', 'tv', 'balcony', 'sofa', 'bed', 'mattress', 'chair', 'shelf', 'dresser'];

export function normalizeRoomAmenity(item) {
  if (typeof item === 'string') return { name: item.trim(), icon: 'sparkle' };
  return { name: item.name.trim(), icon: item.icon || 'sparkle' };
}

export function parseRoomAmenities(value) {
  try {
    const amenities = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(amenities)
      ? amenities.filter((item) => typeof item === 'string' ? item.trim() : item && typeof item.name === 'string' && item.name.trim())
        .map((item) => {
          const amenity = normalizeRoomAmenity(item);
          return ROOM_AMENITY_ICON_KEYS.includes(amenity.icon) ? amenity : { ...amenity, icon: 'sparkle' };
        })
      : [];
  } catch {
    return [];
  }
}
