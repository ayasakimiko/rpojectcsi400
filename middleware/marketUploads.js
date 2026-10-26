import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";

export const LEASE_MIN_IMAGES = 5;
export const LEASE_MAX_IMAGES = 10;
export const MARKET_UPLOAD_DIR = path.resolve(process.env.MARKET_UPLOAD_DIR || path.join(process.cwd(), "storage", "market-contracts"));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IMAGE_TYPES = {
  "image/jpeg": { ext: ".jpg", matches: (header) => header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff },
  "image/png": { ext: ".png", matches: (header) => header.subarray(0, 8).equals(PNG_SIGNATURE) },
  "image/webp": { ext: ".webp", matches: (header) => header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP" },
};
const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: "รูปสัญญาต้องมีขนาดไม่เกิน 5 MB ต่อรูป",
  LIMIT_FILE_COUNT: `แนบรูปสัญญาได้ไม่เกิน ${LEASE_MAX_IMAGES} รูป`,
  LIMIT_UNEXPECTED_FILE: `แนบรูปสัญญาได้ไม่เกิน ${LEASE_MAX_IMAGES} รูป`,
};

fs.mkdirSync(MARKET_UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: MARKET_UPLOAD_DIR,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype].ext}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: LEASE_MAX_IMAGES + 1, fields: 30, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (Object.hasOwn(IMAGE_TYPES, file.mimetype)) return callback(null, true);
    return callback(Object.assign(new Error("แนบรูปสัญญาได้เฉพาะไฟล์ JPG, JPEG, PNG หรือ WebP"), { status: 400 }));
  },
}).fields([{ name: "contract_images", maxCount: LEASE_MAX_IMAGES }, { name: "payment_slip", maxCount: 1 }]);

async function isRealImage(file) {
  const handle = await fs.promises.open(file.path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    return bytesRead >= 12 && IMAGE_TYPES[file.mimetype].matches(buffer);
  } finally {
    await handle.close();
  }
}

export async function removeLeaseFiles(fileNames) {
  await Promise.all((fileNames ?? []).filter((name) => FILE_NAME_PATTERN.test(name))
    .map((name) => fs.promises.unlink(path.join(MARKET_UPLOAD_DIR, name)).catch(() => {})));
}

export function leaseImagePath(fileName) {
  return FILE_NAME_PATTERN.test(fileName) ? path.join(MARKET_UPLOAD_DIR, fileName) : null;
}

export function parseLeaseImages({ min, slip = false }) {
  return function leaseImagesParser(req, res, next) {
    upload(req, res, async (error) => {
      const files = req.files?.contract_images ?? [];
      const slipFile = req.files?.payment_slip?.[0] ?? null;
      const names = [...files, ...(slipFile ? [slipFile] : [])].map((file) => file.filename);
      if (error) {
        await removeLeaseFiles(names);
        return res.status(400).json({ message: error.status ? error.message : UPLOAD_ERRORS[error.code] ?? "อัปโหลดรูปสัญญาไม่สำเร็จ" });
      }
      try {
        if (files.length < min) {
          await removeLeaseFiles(names);
          return res.status(400).json({ message: `กรุณาแนบรูปสัญญาเช่าอย่างน้อย ${min} รูป` });
        }
        if (slipFile && !slip) {
          await removeLeaseFiles(names);
          return res.status(400).json({ message: "รายการนี้ไม่รับสลิปการชำระเงิน" });
        }
        for (const file of [...files, ...(slipFile ? [slipFile] : [])]) {
          if (!(await isRealImage(file))) {
            await removeLeaseFiles(names);
            return res.status(400).json({ message: "ไฟล์รูปสัญญาไม่ถูกต้อง กรุณาเลือกไฟล์รูปภาพจริง" });
          }
        }
        req.leaseImages = files.map((file) => ({ name: file.originalname.slice(0, 255) || file.filename, file_name: file.filename }));
        req.paymentSlip = slipFile;
        return next();
      } catch (checkError) {
        await removeLeaseFiles(names);
        console.error("Check lease images error:", checkError);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
      }
    });
  };
}
