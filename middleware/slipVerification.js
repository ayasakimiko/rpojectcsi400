import { readFile } from "node:fs/promises";
import path from "node:path";

const RDCW_INQUIRY_URL = "https://suba.rdcw.co.th/v2/inquiry";
const RDCW_TIMEOUT_MS = 20000;
const RDCW_FILE_TYPES = new Set(["image/jpeg", "image/png"]);

export class SlipVerificationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function normalizeSlipPayload(value) {
  const text = String(value ?? "").trim();
  return /^[\x21-\x7e]{10,255}$/.test(text) ? text : "";
}

function rdcwAuthorization() {
  const clientId = process.env.RDCW_CLIENT_ID?.trim();
  const clientSecret = process.env.RDCW_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function buildRequest({ payload, file }) {
  if (payload) return { contentType: "application/json", body: JSON.stringify({ payload }) };
  if (!file || !RDCW_FILE_TYPES.has(file.mimetype)) {
    throw new SlipVerificationError(400, "อ่าน QR code บนสลิปไม่ได้ กรุณาแนบสลิปไฟล์ JPG หรือ PNG ที่เห็น QR code ชัดเจน");
  }
  const form = new FormData();
  form.append("file", new Blob([await readFile(file.path)], { type: file.mimetype }), path.basename(file.path));
  return { body: form };
}

export async function inquireSlip({ payload, file }) {
  const authorization = rdcwAuthorization();
  if (!authorization) {
    console.error("RDCW slip inquiry is not configured: set RDCW_CLIENT_ID and RDCW_CLIENT_SECRET");
    throw new SlipVerificationError(503, "ระบบตรวจสอบสลิปยังไม่พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่");
  }
  const { contentType, body } = await buildRequest({ payload, file });
  let response;
  try {
    response = await fetch(RDCW_INQUIRY_URL, {
      method: "POST",
      headers: { Authorization: authorization, ...(contentType ? { "Content-Type": contentType } : {}) },
      body,
      signal: AbortSignal.timeout(RDCW_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("RDCW slip inquiry request failed:", error.name);
    throw new SlipVerificationError(502, "เชื่อมต่อระบบตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  const result = await response.json().catch(() => null);
  const serviceIssue = response.status === 401 || response.status === 403
    || /authori[sz]|credential|quota|subscription|expired/i.test(String(result?.message ?? ""));
  if (serviceIssue) {
    console.error("RDCW slip inquiry unauthorized:", response.status, result?.code, result?.message);
    throw new SlipVerificationError(503, "ระบบตรวจสอบสลิปยังไม่พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่");
  }
  if (!response.ok) {
    console.warn("RDCW slip inquiry error:", response.status, result?.code, result?.message);
    if (response.status >= 500) throw new SlipVerificationError(502, "ระบบตรวจสอบสลิปขัดข้อง กรุณาลองใหม่อีกครั้ง");
    throw new SlipVerificationError(400, "ไม่สามารถตรวจสอบสลิปนี้ได้ กรุณาตรวจสอบว่าเป็นสลิปจริงและเห็น QR code ชัดเจน");
  }
  if (!result?.valid || !result.data?.transRef) {
    throw new SlipVerificationError(400, "สลิปไม่ถูกต้อง หรือไม่พบรายการโอนนี้ในระบบธนาคาร");
  }
  return result.data;
}

function maskedValueMatches(masked, actual) {
  const pattern = String(masked ?? "").toLowerCase().replace(/[^0-9x]/g, "");
  const digits = String(actual ?? "").replace(/\D/g, "");
  const length = Math.min(pattern.length, digits.length);
  if (length < 4) return false;
  const tailPattern = pattern.slice(-length);
  const tailDigits = digits.slice(-length);
  if (tailPattern.replace(/x/g, "").length < 3) return false;
  return [...tailPattern].every((char, index) => char === "x" || char === tailDigits[index]);
}

export function slipReceiverMatches(slip, accounts) {
  const expected = accounts.map((value) => String(value ?? "").replace(/\D/g, "")).filter(Boolean);
  if (expected.length === 0) return true;
  const receiver = slip.receiver || {};
  const candidates = [receiver.account?.value, receiver.proxy?.value].filter(Boolean);
  return candidates.some((candidate) => expected.some((account) => maskedValueMatches(candidate, account)));
}

export function slipTransactionTime(slip) {
  const date = String(slip.transDate ?? "");
  const time = String(slip.transTime ?? "");
  if (!/^\d{8}$/.test(date)) return null;
  const clock = /^\d{2}:\d{2}(:\d{2})?$/.test(time) ? (time.length === 5 ? `${time}:00` : time) : "00:00:00";
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${clock}`;
}

export function slipPartyName(party) {
  const name = String(party?.displayName || party?.name || "").trim();
  return name ? name.slice(0, 255) : null;
}
