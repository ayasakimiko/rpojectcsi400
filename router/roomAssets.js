import { parseRoomAmenities } from "../src/utils/roomAmenities.js";

// A room's own asset list wins; rooms without one fall back to their room type.
export function effectiveRoomAssets(roomAssets, typeAssets) {
  if (roomAssets) return JSON.parse(roomAssets);
  return typeAssets ? JSON.parse(typeAssets) : [];
}

// Everything listed under "อุปกรณ์และทรัพย์สินในห้อง": the priced assets first,
// then the equipment toggles and amenity chips that have no price yet (0 baht).
export function roomEquipmentAssets({ room_assets, type_assets, air_conditioner, refrigerator, custom_amenities }) {
  const assets = effectiveRoomAssets(room_assets, type_assets);
  const names = new Set(assets.map((asset) => asset.name));
  const equipment = [
    ...(air_conditioner ? ["เครื่องปรับอากาศ"] : []),
    ...(refrigerator ? ["ตู้เย็น"] : []),
    ...parseRoomAmenities(custom_amenities).map((amenity) => amenity.name),
  ];
  for (const name of equipment) {
    if (names.has(name)) continue;
    names.add(name);
    assets.push({ name, price: 0 });
  }
  return assets;
}
