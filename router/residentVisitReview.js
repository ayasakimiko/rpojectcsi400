import { getPool } from "../Database/connection.js";
import { isPositiveId } from "../middleware/validation.js";
import { parseStoredPhotos } from "../middleware/publicUploads.js";

export async function listResidentVisitRequests(_req, res) {
  try {
    const [requests] = await getPool().query(
      `SELECT r.*, c.first_name, c.last_name, c.phone AS customer_phone
       FROM ResidentVisitRequest r LEFT JOIN Customer c ON c.id = r.customer_id
       ORDER BY (r.status = 'pending') DESC, r.created_at DESC`,
    );
    return res.json({
      requests: requests.map((request) => ({ ...request, vehicle_photos: parseStoredPhotos(request.vehicle_photos) })),
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
