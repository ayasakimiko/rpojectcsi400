import { getPool } from "../Database/connection.js";
import { isPositiveId } from "../middleware/validation.js";
import { parseStoredPhotos } from "../middleware/publicUploads.js";
import { PARKING_JOIN_SQL, PARKING_SELECT_SQL, loadParkingSettings, withParkingState } from "./parking.js";

export const PARKING_EXPIRED_BY = "ระบบ (หมดเวลาจอด)";

export async function expireParkedVehicles(pool) {
  await pool.query(
    `UPDATE ResidentVisitRequest SET status = 'cancelled', cancelled_by_name = ?, cancelled_at = end_at
     WHERE request_type = 'vehicle' AND status = 'approved' AND end_at IS NOT NULL AND end_at <= NOW() AND parked_at IS NULL`,
    [PARKING_EXPIRED_BY],
  );
}

export async function listResidentVisitRequests(_req, res) {
  try {
    const pool = getPool();
    await expireParkedVehicles(pool);
    const settings = await loadParkingSettings(pool);
    const [requests] = await pool.query(
      `SELECT r.id, r.customer_id, r.room_number, r.request_type, r.vehicle_plate, r.vehicle_model, r.vehicle_photos,
              r.guest_name, r.guest_phone, r.start_at, r.end_at, r.note, r.status, r.reviewed_by_name, r.reviewed_at,
              r.admin_reviewed_by_name, r.admin_reviewed_at, r.updated_by_name, r.updated_at,
              r.cancelled_by_name, r.cancelled_at, r.created_at,
              c.first_name, c.last_name, c.phone AS customer_phone, ${PARKING_SELECT_SQL}
       FROM ResidentVisitRequest r LEFT JOIN Customer c ON c.id = r.customer_id ${PARKING_JOIN_SQL}
       ORDER BY (r.status = 'pending') DESC, (r.fine_status IN ('unpaid', 'pending_review')) DESC, r.created_at DESC`,
    );
    return res.json({
      requests: withParkingState(requests, settings.finePerHour).map((request) => ({ ...request, vehicle_photos: parseStoredPhotos(request.vehicle_photos) })),
      settings,
    });
  } catch (error) {
    console.error("Fetch resident visit requests error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดคำขอได้" });
  }
}

export function createResidentVisitReview(getActingName) {
  return async function reviewResidentVisitRequest(req, res) {
    try {
      const id = Number(req.params.id);
      const status = req.params.decision === "approve" ? "approved" : req.params.decision === "reject" ? "rejected" : null;
      if (!isPositiveId(id) || !status) return res.status(400).json({ message: "ข้อมูลคำขอไม่ถูกต้อง" });
      const pool = getPool();
      const reviewerName = await getActingName(pool, req.user);
      const [result] = await pool.query(
        "UPDATE ResidentVisitRequest SET status = ?, reviewed_by_name = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
        [status, reviewerName, id],
      );
      if (!result.affectedRows) return res.status(409).json({ message: "คำขอนี้ถูกดำเนินการแล้ว" });
      return res.json({ message: status === "approved" ? "อนุมัติคำขอแล้ว" : "ปฏิเสธคำขอแล้ว" });
    } catch (error) {
      console.error("Review resident visit request error:", error);
      return res.status(500).json({ message: "ไม่สามารถบันทึกผลได้" });
    }
  };
}
