import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { PUBLIC_UPLOAD_DIR, deletePublicImages } from "../middleware/publicUploads.js";
import { isPositiveId } from "../middleware/validation.js";

const MAX_PARCEL_PHOTOS = 6;
const PARCEL_UPLOAD_DIR = path.join(PUBLIC_UPLOAD_DIR, "parcels");
const SERVER_ERROR = "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const IMAGE_TYPES = {
  "image/jpeg": { ext: ".jpg", matches: (header) => header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff },
  "image/png": { ext: ".png", matches: (header) => header.subarray(0, 8).equals(PNG_SIGNATURE) },
  "image/webp": {
    ext: ".webp",
    matches: (header) => header.toString("latin1", 0, 4) === "RIFF" && header.toString("latin1", 8, 12) === "WEBP",
  },
};

const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: "รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป",
  LIMIT_FILE_COUNT: `แนบรูปได้ไม่เกิน ${MAX_PARCEL_PHOTOS} รูป`,
  LIMIT_UNEXPECTED_FILE: `แนบรูปได้ไม่เกิน ${MAX_PARCEL_PHOTOS} รูป`,
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

fs.mkdirSync(PARCEL_UPLOAD_DIR, { recursive: true });

const parcelUpload = multer({
  storage: multer.diskStorage({
    destination: PARCEL_UPLOAD_DIR,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype].ext}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_PARCEL_PHOTOS },
  fileFilter: (_req, file, callback) => {
    if (Object.hasOwn(IMAGE_TYPES, file.mimetype)) return callback(null, true);
    return callback(new HttpError(400, "แนบได้เฉพาะไฟล์ JPG, PNG หรือ WebP"));
  },
}).array("photos", MAX_PARCEL_PHOTOS);

function uploadPhotos(req, res) {
  return new Promise((resolve, reject) => {
    parcelUpload(req, res, (error) => {
      if (!error) return resolve();
      if (error instanceof HttpError) return reject(error);
      return reject(new HttpError(400, UPLOAD_ERRORS[error.code] ?? "อัปโหลดรูปพัสดุไม่สำเร็จ"));
    });
  });
}

async function isRealImage(file) {
  const handle = await fs.promises.open(file.path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    return IMAGE_TYPES[file.mimetype].matches(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function readText(value, maxLength) {
  if (value != null && typeof value !== "string") throw new HttpError(400, "ข้อมูลพัสดุไม่ถูกต้อง");
  const text = value?.trim() || null;
  if (text?.length > maxLength) throw new HttpError(400, "ข้อมูลพัสดุยาวเกินกำหนด");
  return text;
}

const photoUrl = (file) => `/uploads/parcels/${file.filename}`;

async function removePhotos(urls) {
  try {
    await deletePublicImages(urls);
  } catch (error) {
    console.error("Remove parcel photos error:", error);
  }
}

export async function attachParcelPhotos(pool, parcels) {
  if (parcels.length === 0) return parcels;
  const [photos] = await pool.query(
    `SELECT parcel_id, name, url FROM ParcelPhoto WHERE parcel_id IN (?) ORDER BY id`,
    [parcels.map((parcel) => parcel.id)],
  );
  const photosByParcel = new Map();
  for (const { parcel_id, name, url } of photos) {
    photosByParcel.set(parcel_id, [...(photosByParcel.get(parcel_id) ?? []), { name, url }]);
  }
  return parcels.map((parcel) => ({ ...parcel, photos: photosByParcel.get(parcel.id) ?? [] }));
}

export function createParcelRouter(getActorName) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const pool = getPool();
      const [parcels] = await pool.query(
        `SELECT p.id, p.room_number, p.tracking_number, p.sender_name, p.description, p.status,
                p.staff_name, p.received_at, p.created_at, c.first_name, c.last_name, c.phone
         FROM Parcel p
         LEFT JOIN Customer c ON c.id = p.customer_id
         ORDER BY p.created_at DESC, p.id DESC`,
      );
      return res.json({ parcels: await attachParcelPhotos(pool, parcels) });
    } catch (error) {
      console.error("Fetch parcels error:", error);
      return res.status(500).json({ message: SERVER_ERROR });
    }
  });

  router.post("/", async (req, res) => {
    let connection;
    try {
      await uploadPhotos(req, res);
      const files = req.files ?? [];
      const { room_number, tracking_number, sender_name, description } = req.body ?? {};

      const roomNumber = Number(room_number);
      if (!Number.isSafeInteger(roomNumber) || roomNumber < 100 || roomNumber > 999) {
        throw new HttpError(400, "กรุณาระบุเลขห้องให้ถูกต้อง");
      }
      const trackingNumber = readText(tracking_number, 100);
      const senderName = readText(sender_name, 100) ?? "พัสดุทั่วไป";
      const parcelDescription = readText(description, 255);

      const pool = getPool();
      const [[tenant]] = await pool.query(
        `SELECT c.id FROM Room r
         JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
         WHERE r.room_number = ? AND r.is_booked = TRUE
         LIMIT 1`,
        [roomNumber],
      );
      if (!tenant) throw new HttpError(404, "ไม่พบห้องที่มีผู้เช่าอยู่");

      const checks = await Promise.all(files.map(isRealImage));
      if (checks.includes(false)) throw new HttpError(400, "ไฟล์ที่อัปโหลดไม่ใช่รูปภาพ JPG, PNG หรือ WebP ที่ถูกต้อง");

      const actorName = await getActorName(pool, req.user);

      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO Parcel (room_number, customer_id, tracking_number, sender_name, description, staff_name, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [roomNumber, tenant.id, trackingNumber, senderName, parcelDescription, actorName || "เจ้าหน้าที่"],
      );
      if (files.length > 0) {
        await connection.query(`INSERT INTO ParcelPhoto (parcel_id, name, url) VALUES ?`, [
          files.map((file) => [result.insertId, path.basename(file.originalname).slice(0, 255) || "รูปพัสดุ", photoUrl(file)]),
        ]);
      }
      await connection.commit();
      return res.status(201).json({ message: "บันทึกพัสดุเข้าห้องสำเร็จ", parcelId: result.insertId });
    } catch (error) {
      if (connection) await connection.rollback();
      await removePhotos((req.files ?? []).map(photoUrl));
      if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
      console.error("Create parcel error:", error);
      return res.status(500).json({ message: SERVER_ERROR });
    } finally {
      connection?.release();
    }
  });

  router.delete("/:id", async (req, res) => {
    const parcelId = Number(req.params.id);
    if (!isPositiveId(parcelId)) return res.status(400).json({ message: "รหัสพัสดุไม่ถูกต้อง" });
    try {
      const pool = getPool();
      const [photos] = await pool.query(`SELECT url FROM ParcelPhoto WHERE parcel_id = ?`, [parcelId]);
      const [result] = await pool.query(`DELETE FROM Parcel WHERE id = ?`, [parcelId]);
      if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบรายการพัสดุนี้" });
      await removePhotos(photos.map((photo) => photo.url));
      return res.json({ message: "ลบรายการพัสดุสำเร็จ" });
    } catch (error) {
      console.error("Delete parcel error:", error);
      return res.status(500).json({ message: SERVER_ERROR });
    }
  });

  return router;
}

export const customerParcelRouter = Router();

customerParcelRouter.post("/:id/receive", async (req, res) => {
  const parcelId = Number(req.params.id);
  if (!isPositiveId(parcelId)) return res.status(400).json({ message: "รหัสพัสดุไม่ถูกต้อง" });
  try {
    const pool = getPool();
    const [[customer]] = await pool.query(`SELECT id, room_number FROM Customer WHERE id = ?`, [req.user.id]);
    if (!customer) return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });

    const ownParcel = [parcelId, customer.id, customer.room_number];
    const [result] = await pool.query(
      `UPDATE Parcel SET status = 'received', received_at = NOW()
       WHERE id = ? AND customer_id = ? AND room_number = ? AND status = 'pending'`,
      ownParcel,
    );
    if (result.affectedRows === 0) {
      const [[parcel]] = await pool.query(`SELECT status FROM Parcel WHERE id = ? AND customer_id = ? AND room_number = ?`, ownParcel);
      if (parcel?.status === "received") return res.status(409).json({ message: "พัสดุรายการนี้ได้รับการยืนยันแล้ว" });
      return res.status(404).json({ message: "ไม่พบพัสดุในห้องนี้" });
    }
    return res.json({ message: "ยืนยันรับพัสดุสำเร็จ" });
  } catch (error) {
    console.error("Receive parcel error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});
