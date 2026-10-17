import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { authenticate, STAFF_ROLES } from "../middleware/authMiddleware.js";
import { PUBLIC_UPLOAD_DIR } from "../middleware/publicUploads.js";

const ROLE_TABLE = { Customer: "Customer", Staff: "Staff", Admin: "Admin", Owner: "Owner" };
const FOLDERS = new Set(["announcements", "incidents", "move-out-inspections", "parcels", "payment-slips", "vehicles"]);
const IMAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i;
const NOT_FOUND = "ไม่พบรูปภาพนี้";

export function createUploadRouter(getPool, { uploadsDir = PUBLIC_UPLOAD_DIR } = {}) {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  router.use(authenticate);

  router.get("/:folder/:fileName", async (req, res) => {
    const { folder, fileName } = req.params;
    if (!FOLDERS.has(folder) || fileName.length > 255 || !IMAGE_FILE.test(fileName)) {
      return res.status(404).json({ message: NOT_FOUND });
    }
    const { role, id } = req.user;
    if (!Object.hasOwn(ROLE_TABLE, role) || !Number.isSafeInteger(id) || id <= 0) {
      return res.status(403).json({ message: "ไม่ได้รับอนุญาต" });
    }

    try {
      const pool = getPool();
      const [users] = await pool.query(
        `SELECT is_suspended${role === "Customer" ? ", room_number" : ""} FROM ${ROLE_TABLE[role]} WHERE id = ?`,
        [id],
      );
      const user = users[0];
      if (!user || user.is_suspended) {
        return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้" });
      }
      if (folder === "move-out-inspections" && !STAFF_ROLES.has(role)) {
        return res.status(403).json({ message: "ไม่ได้รับอนุญาต" });
      }

      const storedUrl = `/uploads/${folder}/${fileName}`;
      if (folder === "payment-slips") {
        const [payments] = await pool.query(
          `SELECT p.id FROM Payment p JOIN Booking b ON b.id = p.booking_id
           WHERE p.slip_path = ?${role === "Customer" ? " AND b.customer_id = ?" : ""} LIMIT 1`,
          role === "Customer" ? [storedUrl, id] : [storedUrl],
        );
        if (payments.length === 0) return res.status(404).json({ message: NOT_FOUND });
      }
      if (folder === "vehicles" && !STAFF_ROLES.has(role)) {
        const [vehicles] = await pool.query(
          "SELECT id FROM ResidentVisitRequest WHERE customer_id = ? AND vehicle_photos LIKE ? LIMIT 1",
          [id, `%"${storedUrl}"%`],
        );
        if (vehicles.length === 0) return res.status(404).json({ message: NOT_FOUND });
      }
      if (folder === "incidents" && !STAFF_ROLES.has(role)) {
        const [incidents] = await pool.query(
          "SELECT id FROM SafetyIncident WHERE reporter_role = ? AND reporter_id = ? AND photos LIKE ? LIMIT 1",
          [role, id, `%"${storedUrl}"%`],
        );
        if (incidents.length === 0) return res.status(404).json({ message: NOT_FOUND });
      }
      if (folder === "parcels") {
        const [parcels] = await pool.query(
          `SELECT p.id FROM ParcelPhoto ph JOIN Parcel p ON p.id = ph.parcel_id
           WHERE ph.url = ?${role === "Customer" ? " AND p.customer_id = ? AND p.room_number = ?" : ""} LIMIT 1`,
          role === "Customer" ? [storedUrl, id, user.room_number] : [storedUrl],
        );
        if (parcels.length === 0) return res.status(404).json({ message: NOT_FOUND });
      }

      const root = await fs.realpath(uploadsDir);
      const folderPath = path.join(root, folder);
      const filePath = path.join(folderPath, fileName);
      const realFile = await fs.realpath(filePath);
      const stat = await fs.lstat(filePath);
      if (path.dirname(realFile) !== folderPath || !stat.isFile()) {
        return res.status(404).json({ message: NOT_FOUND });
      }
      return res.sendFile(fileName, {
        root: folderPath,
        dotfiles: "deny",
        cacheControl: false,
        acceptRanges: false,
      }, (error) => {
        if (!error || res.headersSent) return;
        const status = error.status === 404 || error.code === "ENOENT" ? 404 : 500;
        res.status(status).json({ message: status === 404 ? NOT_FOUND : "โหลดรูปภาพไม่สำเร็จ" });
      });
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) {
        return res.status(404).json({ message: NOT_FOUND });
      }
      console.error("Read upload error:", error);
      return res.status(500).json({ message: "โหลดรูปภาพไม่สำเร็จ" });
    }
  });

  return router;
}
