import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const PUBLIC_UPLOAD_DIR = path.resolve(process.env.PUBLIC_UPLOADS_DIR || path.join(process.cwd(), "public", "uploads"));
const URL_PREFIX = "/uploads";
const EXTENSIONS = { jpeg: ".jpg", png: ".png", webp: ".webp" };
const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export async function deletePublicImages(urls) {
  for (const url of urls) {
    if (typeof url !== "string" || !url.startsWith(`${URL_PREFIX}/`)) continue;
    const filePath = path.resolve(PUBLIC_UPLOAD_DIR, url.slice(URL_PREFIX.length + 1));
    if (!filePath.startsWith(PUBLIC_UPLOAD_DIR + path.sep)) continue;
    await fs.rm(filePath, { force: true });
  }
}

export async function savePublicImages(folder, photos) {
  const folderPath = path.join(PUBLIC_UPLOAD_DIR, folder);
  await fs.mkdir(folderPath, { recursive: true });
  const saved = [];
  try {
    for (const photo of photos) {
      const [, type, base64] = DATA_URL_PATTERN.exec(photo.dataUrl) ?? [];
      if (!type) throw new Error("Invalid image data");
      const fileName = `${randomUUID()}${EXTENSIONS[type]}`;
      await fs.writeFile(path.join(folderPath, fileName), Buffer.from(base64, "base64"));
      saved.push({ name: photo.name, url: `${URL_PREFIX}/${folder}/${fileName}` });
    }
  } catch (error) {
    await deletePublicImages(saved.map((photo) => photo.url));
    throw error;
  }
  return saved;
}
