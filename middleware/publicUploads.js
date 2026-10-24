import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recordAuditImages } from "./auditDetails.js";

export const PUBLIC_UPLOAD_DIR = path.resolve(process.env.PUBLIC_UPLOADS_DIR || path.join(process.cwd(), "public", "uploads"));
const URL_PREFIX = "/uploads";
const EXTENSIONS = { jpeg: ".jpg", png: ".png", webp: ".webp" };
const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export function parseStoredPhotos(photos) {
  if (typeof photos === "string") {
    try {
      photos = JSON.parse(photos);
    } catch {
      photos = [];
    }
  }
  return Array.isArray(photos) ? photos.flatMap((photo) => {
    const url = typeof photo === "string" ? photo : photo?.url || photo?.dataUrl;
    if (typeof url !== "string" || !url.trim()) return [];
    const name = typeof photo?.name === "string" ? photo.name : "";
    return [{ name, url: url.trim() }];
  }) : [];
}

export function withIncidentPhotos(incidents) {
  return incidents.map((incident) => ({ ...incident, photos: parseStoredPhotos(incident.photos) }));
}

export async function deletePublicImages(urls) {
  for (const url of urls) {
    if (typeof url !== "string" || !url.startsWith(`${URL_PREFIX}/`)) continue;
    const filePath = path.resolve(PUBLIC_UPLOAD_DIR, url.slice(URL_PREFIX.length + 1));
    if (!filePath.startsWith(PUBLIC_UPLOAD_DIR + path.sep)) continue;
    await fs.rm(filePath, { force: true });
  }
}

export const GUEST_UPLOAD_FOLDER = "guest";
export const OWNER_FOLDER_PATTERN = /^(?:customer-[1-9]\d{0,9}|guest)$/;

export function customerUploadFolder(folder, customerId) {
  const id = Number(customerId);
  return `${folder}/${Number.isSafeInteger(id) && id > 0 ? `customer-${id}` : GUEST_UPLOAD_FOLDER}`;
}

export function uploadedFileUrl(file) {
  if (!file?.path) return null;
  const relative = path.relative(PUBLIC_UPLOAD_DIR, path.resolve(file.path));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return `${URL_PREFIX}/${relative.split(path.sep).join("/")}`;
}

export async function moveUploadedFiles(files, folder) {
  const folderPath = path.join(PUBLIC_UPLOAD_DIR, folder);
  await fs.mkdir(folderPath, { recursive: true });
  for (const file of files ?? []) {
    if (!file?.path) continue;
    const target = path.join(folderPath, path.basename(file.path));
    if (path.resolve(file.path) === target) continue;
    await fs.rename(file.path, target);
    file.path = target;
    file.destination = folderPath;
  }
  return (files ?? []).map(uploadedFileUrl);
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
  recordAuditImages(saved.map((photo) => photo.url));
  return saved;
}
