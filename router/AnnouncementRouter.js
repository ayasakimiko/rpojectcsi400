import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { isPositiveId, parseAnnouncementInput } from "../middleware/validation.js";

const router = Router();

const AUTHOR_ROLE_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };

async function getAuthorName(pool, user) {
  const table = AUTHOR_ROLE_TABLE[user?.role];
  if (!table) return null;
  const [rows] = await pool.query(`SELECT first_name, last_name FROM ${table} WHERE id = ?`, [user.id]);
  const row = rows[0];
  return row ? `${row.first_name} ${row.last_name}` : null;
}

router.get("/", async (_req, res) => {
  try {
    const pool = getPool();
    const [announcements] = await pool.query(
      `SELECT id, title, message, tone, author_name AS author, created_at
       FROM Announcement ORDER BY created_at DESC, id DESC LIMIT 50`,
    );
    return res.json({ announcements });
  } catch (error) {
    console.error("Fetch announcements error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { error, value } = parseAnnouncementInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }

    const pool = getPool();
    const authorName = await getAuthorName(pool, req.user);
    const [result] = await pool.query(
      `INSERT INTO Announcement (title, message, tone, author_name) VALUES (?, ?, ?, ?)`,
      [value.title, value.message, value.tone, authorName],
    );

    return res.status(201).json({ message: "เผยแพร่ประกาศสำเร็จ", announcementId: result.insertId });
  } catch (error) {
    console.error("Create announcement error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const announcementId = Number(req.params.id);
    if (!isPositiveId(announcementId)) {
      return res.status(400).json({ message: "รหัสประกาศไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`DELETE FROM Announcement WHERE id = ?`, [announcementId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบประกาศ" });
    }

    return res.json({ message: "ลบประกาศสำเร็จ" });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
