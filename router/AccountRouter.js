import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { authenticate, requireStaffRole } from "../middleware/authMiddleware.js";

const ACCOUNT_QUERIES = {
  Customer: "SELECT id, first_name, last_name, is_suspended FROM Customer WHERE id = ?",
  Staff: "SELECT id, first_name, last_name, is_suspended FROM Staff WHERE id = ?",
  Admin: "SELECT id, first_name, last_name, is_suspended FROM Admin WHERE id = ?",
  Owner: "SELECT id, first_name, last_name, is_suspended FROM Owner WHERE id = ?",
};
const STAFF_DIRECTORY = "SELECT id, first_name, last_name FROM Staff WHERE is_suspended = FALSE ORDER BY first_name, last_name";

const router = Router();

router.get("/account", authenticate, async (req, res) => {
  const { role, id } = req.user || {};
  if (!Object.hasOwn(ACCOUNT_QUERIES, role) || !Number.isSafeInteger(id) || id <= 0) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบใหม่" });
  }
  try {
    const [[account]] = await getPool().query(ACCOUNT_QUERIES[role], [id]);
    if (!account || account.is_suspended) {
      return res.status(401).json({ message: "บัญชีนี้ถูกระงับหรือไม่มีอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบ" });
    }
    return res.json({ id: account.id, role, name: `${account.first_name} ${account.last_name}`.trim() });
  } catch (error) {
    console.error("Account status error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/staff-directory", authenticate, requireStaffRole, async (req, res) => {
  try {
    const [rows] = await getPool().query(STAFF_DIRECTORY);
    return res.json({ staff: rows.map((row) => ({ id: row.id, name: `${row.first_name} ${row.last_name}`.trim() })) });
  } catch (error) {
    console.error("Staff directory error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
