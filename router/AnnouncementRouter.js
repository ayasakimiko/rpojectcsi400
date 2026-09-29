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

// The SQL for expires_at: a countdown is added to the database clock, a fixed time is used as given.
function expiryValue(value) {
  return value.expiresInMinutes
    ? { sql: "DATE_ADD(NOW(), INTERVAL ? MINUTE)", param: value.expiresInMinutes }
    : { sql: "?", param: value.expiresAt };
}

// Expired rows are deleted whenever the list is read. expires_epoch is the same moment as a Unix timestamp,
// so pages can show a countdown without caring about time zones.
export async function listAnnouncements(pool) {
  await pool.query(`DELETE FROM Announcement WHERE expires_at IS NOT NULL AND expires_at <= NOW()`);
  const [announcements] = await pool.query(
    `SELECT id, title, message, tone, author_name AS author, DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i') AS expires_at,
            UNIX_TIMESTAMP(expires_at) AS expires_epoch, created_at
     FROM Announcement ORDER BY created_at DESC, id DESC LIMIT 50`,
  );
  return announcements;
}

router.get("/", async (_req, res) => {
  try {
    const announcements = await listAnnouncements(getPool());
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
    if (value.expiresAt) {
      const [[check]] = await pool.query(`SELECT ? > NOW() AS is_future`, [value.expiresAt]);
      if (!check.is_future) {
        return res.status(400).json({ message: "วันและเวลาที่ลบประกาศต้องเป็นเวลาในอนาคต" });
      }
    }

    const authorName = await getAuthorName(pool, req.user);
    const expiry = expiryValue(value);
    const [result] = await pool.query(
      `INSERT INTO Announcement (title, message, tone, author_name, expires_at) VALUES (?, ?, ?, ?, ${expiry.sql})`,
      [value.title, value.message, value.tone, authorName, expiry.param],
    );

    return res.status(201).json({ message: "เผยแพร่ประกาศสำเร็จ", announcementId: result.insertId });
  } catch (error) {
    console.error("Create announcement error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const announcementId = Number(req.params.id);
    if (!isPositiveId(announcementId)) {
      return res.status(400).json({ message: "รหัสประกาศไม่ถูกต้อง" });
    }
    const { error, value } = parseAnnouncementInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }

    const pool = getPool();
    if (value.expiresAt) {
      const [[check]] = await pool.query(`SELECT ? > NOW() AS is_future`, [value.expiresAt]);
      if (!check.is_future) {
        return res.status(400).json({ message: "วันและเวลาที่ลบประกาศต้องเป็นเวลาในอนาคต" });
      }
    }

    const expiry = expiryValue(value);
    const [result] = await pool.query(
      `UPDATE Announcement SET title = ?, message = ?, tone = ?, expires_at = ${expiry.sql} WHERE id = ?`,
      [value.title, value.message, value.tone, expiry.param, announcementId],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบประกาศ" });
    }

    return res.json({ message: "แก้ไขประกาศสำเร็จ" });
  } catch (error) {
    console.error("Update announcement error:", error);
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
