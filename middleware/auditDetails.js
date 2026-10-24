import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import jwt from "jsonwebtoken";
import { PUBLIC_UPLOAD_DIR } from "./publicUploads.js";
import { getPool } from "../Database/connection.js";

const auditContext = new AsyncLocalStorage();
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HIDDEN_KEY = /pass(word)?|otp|token|secret|idcard|qr_?payload|data_?url|photos?$/i;
const MAX_FIELDS = 24;
const MAX_IMAGES = 12;
const MAX_TEXT = 160;

export function recordAuditImages(urls) {
  auditContext.getStore()?.images.push(...urls.filter((url) => typeof url === "string"));
}

export function recordAuditFields(fields) {
  const store = auditContext.getStore();
  if (!store) return;
  for (const [key, value] of Object.entries(fields)) store.fields.push([key, value]);
}

function collectUploadUrls(value, found, depth = 0) {
  if (depth > 4 || found.length >= MAX_IMAGES * 2) return;
  if (typeof value === "string") {
    if (value.startsWith("/uploads/")) found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectUploadUrls(item, found, depth + 1);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectUploadUrls(item, found, depth + 1);
  }
}

function toFieldValue(value) {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || text.startsWith("data:") || text.startsWith("/uploads/")) return null;
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
  }
  
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.length > 0 && value.every((item) => ["string", "number"].includes(typeof item))) {
    return toFieldValue(value.join(", "));
  }

  return null;
}

export function buildAuditDetails(body, extraImages = [], { extraFields = [], resultMessage = null } = {}) {
  const fields = [];
  const entries = [
    ...(body && typeof body === "object" && !Array.isArray(body) ? Object.entries(body) : []),
    ...extraFields,
  ];
  for (const [key, value] of entries) {
    if (fields.length >= MAX_FIELDS) break;
    if (HIDDEN_KEY.test(key) || fields.some(([existing]) => existing === key)) continue;
    const fieldValue = toFieldValue(value);
    if (fieldValue !== null) fields.push([key, fieldValue]);
  }
  const resultText = toFieldValue(resultMessage);
  if (fields.length === 0 && resultText !== null) fields.push(["result", resultText]);
  const found = [...extraImages];
  collectUploadUrls(body, found);
  const images = [...new Set(found)].slice(0, MAX_IMAGES);
  if (fields.length === 0 && images.length === 0) return null;
  return { fields, images };
}

function uploadedFileUrl(file) {
  if (!file?.path) return null;
  const relative = path.relative(PUBLIC_UPLOAD_DIR, path.resolve(file.path));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return `/uploads/${relative.split(path.sep).join("/")}`;
}

// ใช้หลัง express.json() เพื่อให้รูปที่บันทึกในคำขอเดียวกันถูกเก็บไว้ในบริบทของคำขอนั้น
export function auditDetailsMiddleware(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const store = { images: [], fields: [], resultMessage: null };
  let details = null;
  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return;
    let actor;
    try {
      actor = jwt.verify(authorization.slice(7), process.env.JWT_SECRET || "dev-secret-change-me");
    } catch {
      return;
    }
    if (!Number.isSafeInteger(actor.id) || !["Customer", "Staff", "Admin", "Owner"].includes(actor.role)) return;
    const endpoint = req.originalUrl.split("?")[0].slice(0, 255);
    const ipAddress = (req.socket.remoteAddress || "").slice(0, 45);
    getPool().query(
      `INSERT INTO AuditLog (actor_id, actor_role, method, endpoint, status_code, ip_address, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actor.id, actor.role, req.method, endpoint, res.statusCode, ipAddress || null, details],
    ).catch((error) => console.error("Audit log write error:", error));
  });
  const json = res.json;
  res.json = function jsonWithAuditMessage(body) {
    if (body && typeof body.message === "string") store.resultMessage = body.message;
    return json.call(this, body);
  };
  const writeHead = res.writeHead;
  res.writeHead = function writeHeadWithAuditDetails(...args) {
    if (!res.headersSent) {
      try {
        const files = [req.file, ...(Array.isArray(req.files) ? req.files : [])];
        const fileUrls = files.map(uploadedFileUrl).filter(Boolean);
        const audit = buildAuditDetails(req.body, [...store.images, ...fileUrls], {
          extraFields: store.fields,
          resultMessage: store.resultMessage,
        });
        details = audit ? JSON.stringify(audit) : null;
      } catch (error) {
        console.error("Audit details build error:", error);
      }
    }
    return writeHead.apply(this, args);
  };
  return auditContext.run(store, next);
}
