import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { getPool } from "../Database/connection.js";
import { PUBLIC_UPLOAD_DIR, deletePublicImages } from "../middleware/publicUploads.js";
import { isPositiveId } from "../middleware/validation.js";

const MAX_PARCEL_PHOTOS = 6;
const MAX_PARCEL_PHOTO_BYTES = 5 * 1024 * 1024;
const PARCEL_UPLOAD_DIR = path.join(PUBLIC_UPLOAD_DIR, "parcels");
const IMAGE_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

fs.mkdirSync(PARCEL_UPLOAD_DIR, { recursive: true });

async function matchesImageType(file) {
  const handle = await fs.promises.open(file.path, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (file.mimetype === "image/jpeg") {
      return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (file.mimetype === "image/png") {
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      return bytesRead >= 8 && header.subarray(0, 8).equals(pngSignature);
    }
    return file.mimetype === "image/webp"
      && bytesRead >= 12
      && header.toString("ascii", 0, 4) === "RIFF"
      && header.toString("ascii", 8, 12) === "WEBP";
  } finally {
    await handle.close();
  }
}

const parcelUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, PARCEL_UPLOAD_DIR),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype] || ".jpg"}`),
  }),
  limits: { fileSize: MAX_PARCEL_PHOTO_BYTES, files: MAX_PARCEL_PHOTOS },
  fileFilter: (_req, file, callback) => {
    if (Object.hasOwn(IMAGE_TYPES, file.mimetype)) return callback(null, true);
    return callback(new Error("แนบได้เฉพาะไฟล์ JPG, PNG หรือ WebP"));
  },
});

function parcelPhotoUrl(file) {
  return `/uploads/parcels/${path.basename(file.filename)}`;
}

async function removeParcelPhotos(files) {
  try {
    await deletePublicImages(files.map(parcelPhotoUrl));
    return true;
  } catch (error) {
    console.error("Remove parcel photos error:", error);
    return false;
  }
}

export async function attachParcelPhotos(pool, parcels) {
  if (parcels.length === 0) return parcels;
  const [photos] = await pool.query(
    `SELECT parcel_id, name, url FROM ParcelPhoto
     WHERE parcel_id IN (?) ORDER BY id ASC`,
    [parcels.map((parcel) => parcel.id)],
  );
  const photosByParcelId = new Map();
  for (const photo of photos) {
    const list = photosByParcelId.get(photo.parcel_id) || [];
    list.push({ name: photo.name, url: photo.url });
    photosByParcelId.set(photo.parcel_id, list);
  }
  return parcels.map((parcel) => ({ ...parcel, photos: photosByParcelId.get(parcel.id) || [] }));
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
      return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
    }
  });

  router.post("/", (req, res) => {
    parcelUpload.array("photos", MAX_PARCEL_PHOTOS)(req, res, async (uploadError) => {
      if (uploadError) {
        if (!(await removeParcelPhotos(req.files || []))) {
          return res.status(500).json({ message: "อัปโหลดไม่สำเร็จและลบไฟล์ชั่วคราวไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ" });
        }
        const message = uploadError.code === "LIMIT_FILE_SIZE"
          ? "รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อรูป"
          : uploadError.code === "LIMIT_UNEXPECTED_FILE"
            ? `แนบรูปได้ไม่เกิน ${MAX_PARCEL_PHOTOS} รูป`
            : uploadError.message || "อัปโหลดรูปพัสดุไม่สำเร็จ";
        return res.status(400).json({ message });
      }

      let connection;
      try {
        const { room_number, tracking_number, sender_name, description } = req.body ?? {};
        const roomNumber = Number(room_number);
        if (!Number.isSafeInteger(roomNumber) || roomNumber < 100 || roomNumber > 999) {
          if (!(await removeParcelPhotos(req.files || []))) {
            return res.status(500).json({ message: "ข้อมูลไม่ถูกต้องและลบไฟล์รูปไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ" });
          }
          return res.status(400).json({ message: "กรุณาระบุเลขห้องให้ถูกต้อง" });
        }
        if (
          (tracking_number != null && typeof tracking_number !== "string") ||
          (sender_name != null && typeof sender_name !== "string") ||
          (description != null && typeof description !== "string")
        ) {
          if (!(await removeParcelPhotos(req.files || []))) {
            return res.status(500).json({ message: "ข้อมูลไม่ถูกต้องและลบไฟล์รูปไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ" });
          }
          return res.status(400).json({ message: "ข้อมูลพัสดุไม่ถูกต้อง" });
        }

        const trackingNumber = tracking_number?.trim() || null;
        const senderName = sender_name?.trim() || "พัสดุทั่วไป";
        const parcelDescription = description?.trim() || null;
        if (trackingNumber?.length > 100 || senderName.length > 100 || parcelDescription?.length > 255) {
          if (!(await removeParcelPhotos(req.files || []))) {
            return res.status(500).json({ message: "ข้อมูลไม่ถูกต้องและลบไฟล์รูปไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ" });
          }
          return res.status(400).json({ message: "ข้อมูลพัสดุยาวเกินกำหนด" });
        }

        const pool = getPool();
        const [occupiedRooms] = await pool.query(
          `SELECT r.room_number, c.id AS customer_id
           FROM Room r
           JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
           WHERE r.room_number = ? AND r.is_booked = TRUE
           LIMIT 1`,
          [roomNumber],
        );
        if (occupiedRooms.length === 0) {
          if (!(await removeParcelPhotos(req.files || []))) {
            return res.status(500).json({ message: "ไม่พบห้องและลบไฟล์รูปไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ" });
          }
          return res.status(404).json({ message: "ไม่พบห้องที่มีผู้เช่าอยู่" });
        }
        const customerId = occupiedRooms[0].customer_id;

        const actorName = await getActorName(pool, req.user);
        const files = req.files || [];
        const validImages = await Promise.all(files.map(matchesImageType));
        if (validImages.some((valid) => !valid)) {
          if (!(await removeParcelPhotos(files))) {
            return res.status(500).json({ message: "รูปภาพไม่ถูกต้องและลบไฟล์ไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ" });
          }
          return res.status(400).json({ message: "ไฟล์ที่อัปโหลดไม่ใช่รูปภาพ JPG, PNG หรือ WebP ที่ถูกต้อง" });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.query(
          `INSERT INTO Parcel (room_number, customer_id, tracking_number, sender_name, description, staff_name, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
          [roomNumber, customerId, trackingNumber, senderName, parcelDescription, actorName || "เจ้าหน้าที่"],
        );

        if (files.length > 0) {
          await connection.query(
            `INSERT INTO ParcelPhoto (parcel_id, name, url) VALUES ?`,
            [files.map((file) => [result.insertId, path.basename(file.originalname).slice(0, 255) || "รูปพัสดุ", parcelPhotoUrl(file)])],
          );
        }
        await connection.commit();
        return res.status(201).json({ message: "บันทึกพัสดุเข้าห้องสำเร็จ", parcelId: result.insertId });
      } catch (error) {
        if (connection) await connection.rollback();
        await removeParcelPhotos(req.files || []);
        console.error("Create parcel error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
      } finally {
        connection?.release();
      }
    });
  });

  router.delete("/:id", async (req, res) => {
    if (!isPositiveId(req.params.id)) return res.status(400).json({ message: "รหัสพัสดุไม่ถูกต้อง" });
    let connection;
    try {
      const pool = getPool();
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [parcels] = await connection.query(`SELECT id FROM Parcel WHERE id = ? FOR UPDATE`, [req.params.id]);
      if (parcels.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "ไม่พบรายการพัสดุนี้" });
      }
      const [photos] = await connection.query(`SELECT url FROM ParcelPhoto WHERE parcel_id = ?`, [req.params.id]);
      await connection.query(`DELETE FROM Parcel WHERE id = ?`, [req.params.id]);
      await connection.commit();
      try {
        await deletePublicImages(photos.map((photo) => photo.url));
      } catch (error) {
        console.error("Remove deleted parcel photos error:", error);
        return res.status(500).json({ message: "ลบรายการพัสดุแล้ว แต่ลบรูปภาพไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ" });
      }
      return res.json({ message: "ลบรายการพัสดุสำเร็จ" });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("Delete parcel error:", error);
      return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
    } finally {
      connection?.release();
    }
  });

  return router;
}
