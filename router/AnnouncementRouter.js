import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { isPositiveId, parseAnnouncementInput } from "../middleware/validation.js";
import { deletePublicImages, savePublicImages } from "../middleware/publicUploads.js";

// ตั้งค่า Router และฟังก์ชันกลางสำหรับผู้ประกาศ เวลาแสดงผล และรูปประกอบ
const router = Router();

const AUTHOR_ROLE_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };
const PHOTO_FOLDER = "announcements";

async function getAuthorName(pool, user) {
  const table = AUTHOR_ROLE_TABLE[user?.role];
  if (!table) return null;
  const [rows] = await pool.query(`SELECT first_name, last_name FROM ${table} WHERE id = ?`, [user.id]);
  const row = rows[0];
  return row ? `${row.first_name} ${row.last_name}` : null;
}

function expiryValue(value) {
  return value.expiresInMinutes
    ? { sql: "DATE_ADD(NOW(), INTERVAL ? MINUTE)", param: value.expiresInMinutes }
    : { sql: "?", param: value.expiresAt };
}

function popupValue(value) {
  if (value.popupInMinutes === undefined) return null;
  return value.popupInMinutes === null
    ? { sql: "NULL", params: [] }
    : { sql: "DATE_ADD(NOW(), INTERVAL ? MINUTE)", params: [value.popupInMinutes] };
}

function parsePhotos(raw) {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const photoUrls = (photos) => photos.map((photo) => photo.url);
const serializePhotos = (photos) => (photos.length > 0 ? JSON.stringify(photos) : null);

// โหลดประกาศที่ยังใช้งานและล้างประกาศที่หมดอายุพร้อมรูปประกอบ
export async function listAnnouncements(pool) {
  const [expired] = await pool.query(
    `SELECT id, photos FROM Announcement WHERE expires_at IS NOT NULL AND expires_at <= NOW()`,
  );
  if (expired.length > 0) {
    await pool.query(`DELETE FROM Announcement WHERE id IN (?)`, [expired.map((row) => row.id)]);
    await deletePublicImages(expired.flatMap((row) => photoUrls(parsePhotos(row.photos))));
  }
  const [announcements] = await pool.query(
    `SELECT id, title, message, tone, author_name AS author, DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i') AS expires_at,
            UNIX_TIMESTAMP(expires_at) AS expires_epoch,
            DATE_FORMAT(popup_until, '%Y-%m-%dT%H:%i') AS popup_until, UNIX_TIMESTAMP(popup_until) AS popup_epoch,
            (popup_until IS NULL OR popup_until > NOW()) AS popup_active,
            photos, created_at
     FROM Announcement ORDER BY created_at DESC, id DESC LIMIT 50`,
  );
  return announcements.map((announcement) => ({
    ...announcement,
    popup_active: Boolean(announcement.popup_active),
    photos: parsePhotos(announcement.photos),
  }));
}

async function checkFutureExpiry(pool, value) {
  if (!value.expiresAt) return true;
  const [[check]] = await pool.query(`SELECT ? > NOW() AS is_future`, [value.expiresAt]);
  return Boolean(check.is_future);
}

// แสดงรายการประกาศสำหรับผู้ใช้งาน
router.get("/", async (_req, res) => {
  try {
    const announcements = await listAnnouncements(getPool());
    return res.json({ announcements });
  } catch (error) {
    console.error("Fetch announcements error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

// จัดการประกาศ เพิ่ม แก้ไข และลบ พร้อมกำหนดอายุและรูปประกอบ
router.post("/", async (req, res) => {
  try {
    const { error, value } = parseAnnouncementInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }

    const pool = getPool();
    if (!(await checkFutureExpiry(pool, value))) {
      return res.status(400).json({ message: "วันและเวลาที่ลบประกาศต้องเป็นเวลาในอนาคต" });
    }

    const authorName = await getAuthorName(pool, req.user);
    const expiry = expiryValue(value);
    const popup = popupValue(value) || { sql: "NULL", params: [] };
    const savedPhotos = await savePublicImages(PHOTO_FOLDER, value.newPhotos);
    try {
      const [result] = await pool.query(
        `INSERT INTO Announcement (title, message, tone, author_name, expires_at, popup_until, photos)
         VALUES (?, ?, ?, ?, ${expiry.sql}, ${popup.sql}, ?)`,
        [value.title, value.message, value.tone, authorName, expiry.param, ...popup.params, serializePhotos(savedPhotos)],
      );
      return res.status(201).json({ message: "เผยแพร่ประกาศสำเร็จ", announcementId: result.insertId });
    } catch (insertError) {
      await deletePublicImages(photoUrls(savedPhotos));
      throw insertError;
    }
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

    const pool = getPool();
    const [rows] = await pool.query(`SELECT photos FROM Announcement WHERE id = ?`, [announcementId]);
    if (!rows[0]) {
      return res.status(404).json({ message: "ไม่พบประกาศ" });
    }
    const existingPhotos = parsePhotos(rows[0].photos);

    const { error, value } = parseAnnouncementInput(req.body ?? {}, existingPhotos);
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (!(await checkFutureExpiry(pool, value))) {
      return res.status(400).json({ message: "วันและเวลาที่ลบประกาศต้องเป็นเวลาในอนาคต" });
    }

    const expiry = expiryValue(value);
    const popup = popupValue(value);
    const savedPhotos = await savePublicImages(PHOTO_FOLDER, value.newPhotos);
    let result;
    try {
      [result] = await pool.query(
        `UPDATE Announcement SET title = ?, message = ?, tone = ?, expires_at = ${expiry.sql}${popup ? `, popup_until = ${popup.sql}` : ""}, photos = ? WHERE id = ?`,
        [
          value.title,
          value.message,
          value.tone,
          expiry.param,
          ...(popup ? popup.params : []),
          serializePhotos([...value.keptPhotos, ...savedPhotos]),
          announcementId,
        ],
      );
    } catch (updateError) {
      await deletePublicImages(photoUrls(savedPhotos));
      throw updateError;
    }
    if (result.affectedRows === 0) {
      await deletePublicImages(photoUrls(savedPhotos));
      return res.status(404).json({ message: "ไม่พบประกาศ" });
    }

    const keptUrls = new Set(photoUrls(value.keptPhotos));
    await deletePublicImages(photoUrls(existingPhotos).filter((url) => !keptUrls.has(url)));
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
    const [rows] = await pool.query(`SELECT photos FROM Announcement WHERE id = ?`, [announcementId]);
    const [result] = await pool.query(`DELETE FROM Announcement WHERE id = ?`, [announcementId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบประกาศ" });
    }
    await deletePublicImages(photoUrls(parsePhotos(rows[0]?.photos)));

    return res.json({ message: "ลบประกาศสำเร็จ" });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
