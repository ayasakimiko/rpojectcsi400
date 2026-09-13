import { Router } from "express";
import { getPool } from "../Database/connection.js";

const router = Router();

router.get("/available", async (req, res) => {
  try {
    const pool = getPool();
    const [rooms] = await pool.query(
      `SELECT id, room_number, price FROM Room WHERE is_booked = FALSE ORDER BY room_number ASC`,
    );

    return res.json({ rooms });
  } catch (error) {
    console.error("Fetch available rooms error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
