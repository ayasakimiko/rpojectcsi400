import { Router } from "express";
import { getPool } from "../Database/connection.js";

const router = Router();

const STAFF_API_KEY = process.env.STAFF_API_KEY || "dev-staff-key";

function requireStaffKey(req, res, next) {
  if (req.headers["x-staff-key"] !== STAFF_API_KEY) {
    return res.status(401).json({ message: "ไม่ได้รับอนุญาต (staff key ไม่ถูกต้อง)" });
  }
  next();
}

router.post("/tenant-requests/:id/approve", requireStaffKey, async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT id, room_number, type, renew_duration_months, renew_payment_type, status
       FROM TenantRequest WHERE id = ? FOR UPDATE`,
      [requestId],
    );
    const tenantRequest = requestRows[0];
    if (!tenantRequest) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบคำขอนี้" });
    }
    if (tenantRequest.status !== "pending") {
      await connection.rollback();
      return res.status(409).json({ message: "คำขอนี้ถูกดำเนินการไปแล้ว" });
    }

    if (tenantRequest.type === "renew") {
      const durationMonths = tenantRequest.renew_duration_months;
      const paymentType = tenantRequest.renew_payment_type;

      await connection.query(
        `UPDATE Room
         SET
           rental_end_date = DATE_ADD(rental_end_date, INTERVAL ? MONTH),
           rental_duration_months = TIMESTAMPDIFF(MONTH, rental_start_date, rental_end_date),
           pending_lump_sum_months = IF(? = 'lump_sum', ?, pending_lump_sum_months)
         WHERE room_number = ?`,
        [durationMonths, paymentType, durationMonths, tenantRequest.room_number],
      );
    }

    await connection.query(`UPDATE TenantRequest SET status = 'approved' WHERE id = ?`, [requestId]);

    await connection.commit();
    return res.json({ message: "อนุมัติคำขอสำเร็จ" });
  } catch (error) {
    await connection.rollback();
    console.error("Approve tenant request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection.release();
  }
});

router.post("/tenant-requests/:id/reject", requireStaffKey, async (req, res) => {
  try {
    const pool = getPool();
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    const [result] = await pool.query(
      `UPDATE TenantRequest SET status = 'rejected' WHERE id = ? AND status = 'pending'`,
      [requestId],
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ message: "ไม่พบคำขอที่รอดำเนินการนี้" });
    }

    return res.json({ message: "ปฏิเสธคำขอสำเร็จ" });
  } catch (error) {
    console.error("Reject tenant request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
