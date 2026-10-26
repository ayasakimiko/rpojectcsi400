import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";

export const VENDOR_MIN_IMAGES = 5;
export const VENDOR_MAX_IMAGES = 10;
export const REPAIR_UPLOAD_DIR = path.resolve(process.env.REPAIR_UPLOAD_DIR || path.join(process.cwd(), "storage", "repair-contracts"));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IMAGE_TYPES = {
  "image/jpeg": { ext: ".jpg", matches: (header) => header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff },
  "image/png": { ext: ".png", matches: (header) => header.subarray(0, 8).equals(PNG_SIGNATURE) },
  "image/webp": { ext: ".webp", matches: (header) => header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP" },
};
const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: "รูปสัญญาต้องมีขนาดไม่เกิน 5 MB ต่อรูป",
  LIMIT_FILE_COUNT: `แนบรูปสัญญาได้ไม่เกิน ${VENDOR_MAX_IMAGES} รูป`,
  LIMIT_UNEXPECTED_FILE: `แนบรูปสัญญาได้ไม่เกิน ${VENDOR_MAX_IMAGES} รูป`,
};

fs.mkdirSync(REPAIR_UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: REPAIR_UPLOAD_DIR,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype].ext}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: VENDOR_MAX_IMAGES, fields: 10, fieldSize: 16 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (Object.hasOwn(IMAGE_TYPES, file.mimetype)) return callback(null, true);
    return callback(Object.assign(new Error("แนบรูปสัญญาได้เฉพาะไฟล์ JPG, JPEG, PNG หรือ WebP"), { status: 400 }));
  },
}).array("contract_images", VENDOR_MAX_IMAGES);

async function isRealImage(file) {
  const handle = await fs.promises.open(file.path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    return bytesRead >= 12 && IMAGE_TYPES[file.mimetype].matches(buffer);
  } finally {
    await handle.close();
  }
}

export async function removeVendorFiles(fileNames) {
  await Promise.all((fileNames ?? []).filter((name) => FILE_NAME_PATTERN.test(name))
    .map((name) => fs.promises.unlink(path.join(REPAIR_UPLOAD_DIR, name)).catch(() => {})));
}

export function vendorImagePath(fileName) {
  return FILE_NAME_PATTERN.test(fileName) ? path.join(REPAIR_UPLOAD_DIR, fileName) : null;
}

export function parseVendorImages({ min }) {
  return function vendorImagesParser(req, res, next) {
    upload(req, res, async (error) => {
      const files = req.files ?? [];
      const names = files.map((file) => file.filename);
      if (error) {
        await removeVendorFiles(names);
        return res.status(400).json({ message: error.status ? error.message : UPLOAD_ERRORS[error.code] ?? "อัปโหลดรูปสัญญาไม่สำเร็จ" });
      }
      try {
        if (files.length < min) {
          await removeVendorFiles(names);
          return res.status(400).json({ message: `กรุณาแนบรูปสัญญาซ่อมอย่างน้อย ${min} รูป` });
        }
        for (const file of files) {
          if (!(await isRealImage(file))) {
            await removeVendorFiles(names);
            return res.status(400).json({ message: "ไฟล์รูปสัญญาไม่ถูกต้อง กรุณาเลือกไฟล์รูปภาพจริง" });
          }
        }
        req.vendorImages = files.map((file) => ({ name: file.originalname.slice(0, 255) || file.filename, file_name: file.filename }));
        return next();
      } catch (checkError) {
        await removeVendorFiles(names);
        console.error("Check vendor images error:", checkError);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
      }
    });
  };
}
