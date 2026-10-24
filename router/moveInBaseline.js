export function parseMoveInInspectionRow(row) {
  const dates = row.inspection_dates ? JSON.parse(row.inspection_dates) : null;
  return {
    ...row,
    inspection_dates: Array.isArray(dates) && dates.length > 0 ? dates : [row.inspection_date].filter(Boolean),
    checklist: JSON.parse(row.checklist),
    assets: JSON.parse(row.assets),
  };
}

export async function loadMoveInBaseline(db, { roomNumber, customerId = null, before = null }) {
  const [rows] = await db.query(
    `SELECT id, room_number, customer_id, tenant_name, tenant_phone, room_type_id, room_type_name,
            DATE_FORMAT(inspection_date, '%Y-%m-%d') AS inspection_date, inspection_dates, checklist, assets, note,
            inspected_by_name, updated_at, created_at, photos
     FROM MoveInInspection
     WHERE room_number = ? AND (? IS NULL OR customer_id = ?) AND (? IS NULL OR created_at <= ?)
     ORDER BY inspection_date DESC, id DESC LIMIT 1`,
    [roomNumber, customerId, customerId, before, before],
  );
  if (!rows[0]) return null;
  const { photos, ...row } = rows[0];
  return { ...parseMoveInInspectionRow(row), photos: JSON.parse(photos || "[]") };
}

export async function loadMoveOutBaseline(db, inspection) {
  if (inspection.customer_id) {
    return loadMoveInBaseline(db, { roomNumber: inspection.room_number, customerId: inspection.customer_id });
  }
  return loadMoveInBaseline(db, { roomNumber: inspection.room_number, before: inspection.created_at });
}
