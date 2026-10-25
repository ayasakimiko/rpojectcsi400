import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { authenticate } from "../middleware/authMiddleware.js";

const ACCOUNT_TABLES = { Customer: "Customer", Staff: "Staff", Admin: "Admin", Owner: "Owner" };

const router = Router();

router.get("/account", authenticate, async (req, res) => {
  const { role, id } = req.user || {};
  if (!Object.hasOwn(ACCOUNT_TABLES, role) || !Number.isSafeInteger(id) || id <= 0) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบใหม่" });
  }
  try {
    const [[account]] = await getPool().query(
      `SELECT id, first_name, last_name, is_suspended FROM ${ACCOUNT_TABLES[role]} WHERE id = ?`,
      [id],
    );
    if (!account || account.is_suspended) {
      return res.status(401).json({ message: "บัญชีนี้ถูกระงับหรือไม่มีอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบ" });
    }
    return res.json({
      id: account.id,
      role,
      first_name: account.first_name,
      last_name: account.last_name,
      name: `${account.first_name} ${account.last_name}`.trim(),
    });
  } catch (error) {
    console.error("Account status error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
