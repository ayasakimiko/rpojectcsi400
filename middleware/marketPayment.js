import { randomUUID } from "node:crypto";
import {
  PAYMENT_CHANNELS_MISSING_MESSAGE,
  SlipVerificationError,
  TEST_PAYMENT_MARK,
  inquireSlip,
  normalizeSlipPayload,
  slipReceiverMatches,
  slipTransactionTime,
} from "./slipVerification.js";
import { MarketError } from "../router/marketShared.js";

const PAYMENT_SERVICE_URL = (process.env.PAYMENT_SERVICE_URL || `http://localhost:${process.env.PAYMENT_PORT || 4009}`).replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 8_000;
const SLIP_USED_MESSAGE = "สลิปนี้ถูกใช้ชำระเงินไปแล้ว ไม่สามารถใช้ซ้ำได้";
const LOCAL_SLIP_USED = "SELECT COUNT(*) AS total FROM ShopLeasePayment WHERE qr_payload = ? OR trans_ref = ?";

export const PAYMENT_METHODS = {
  promptpay: "PromptPay",
  bank: "โอนเข้าบัญชีธนาคาร",
  counter: "เงินสดที่เคาน์เตอร์",
};

async function paymentService(path, authorization) {
  let response;
  try {
    response = await fetch(`${PAYMENT_SERVICE_URL}${path}`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MarketError(503, "เชื่อมต่อระบบชำระเงินไม่ได้ กรุณาลองใหม่อีกครั้ง", "SERVER_ERROR");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new MarketError(response.status === 401 ? 401 : 503, body.message || "ระบบชำระเงินไม่พร้อมใช้งาน", "SERVER_ERROR");
  return body;
}

async function slipUsed(db, authorization, { qrPayload, transRef }) {
  const [[local]] = await db.query(LOCAL_SLIP_USED, [qrPayload || "\u0000", transRef || "\u0000"]);
  if (Number(local.total) > 0) return true;
  const query = new URLSearchParams({ ...(qrPayload ? { qr_payload: qrPayload } : {}), ...(transRef ? { trans_ref: transRef } : {}) });
  const { used } = await paymentService(`/api/payment/slip-usage?${query}`, authorization);
  return Boolean(used);
}

export async function verifyLeasePayment({ db, authorization, method, slipFile, qrPayload: rawPayload, amount }) {
  if (!Object.hasOwn(PAYMENT_METHODS, method)) throw new MarketError(400, "กรุณาเลือกวิธีชำระเงิน");
  const { channels } = await paymentService("/api/payment/channels", authorization);
  if (method === "counter") {
    return { method, verifyMode: "counter", transRef: null, qrPayload: null, paidAt: null, payerName: null, testMode: Boolean(channels.test_mode) };
  }
  if (!channels.configured && !channels.test_mode) throw new MarketError(400, PAYMENT_CHANNELS_MISSING_MESSAGE);
  if (!slipFile) throw new MarketError(400, "กรุณาแนบสลิปการโอนเงิน");
  const qrPayload = normalizeSlipPayload(rawPayload);
  if (channels.test_mode) {
    return { method, verifyMode: "test", transRef: `TEST-${randomUUID()}`, qrPayload: null, paidAt: null, payerName: TEST_PAYMENT_MARK, testMode: true };
  }
  if (qrPayload && (await slipUsed(db, authorization, { qrPayload }))) throw new MarketError(409, SLIP_USED_MESSAGE, "CONFLICT");
  if (channels.verify_mode === "manual") {
    return { method, verifyMode: "manual", transRef: null, qrPayload: qrPayload || null, paidAt: null, payerName: null, testMode: false };
  }
  let slip;
  try {
    slip = await inquireSlip({ payload: qrPayload, file: slipFile });
  } catch (error) {
    if (error instanceof SlipVerificationError) throw new MarketError(error.status, error.message);
    throw error;
  }
  const transRef = String(slip.transRef ?? "").replace(/[^\x21-\x7e]/g, "").slice(0, 64);
  if (!transRef) throw new MarketError(400, "สลิปไม่ถูกต้อง หรือไม่พบรายการโอนนี้ในระบบธนาคาร");
  if (await slipUsed(db, authorization, { transRef })) throw new MarketError(409, SLIP_USED_MESSAGE, "CONFLICT");
  const slipCents = Math.round(Number(slip.amount) * 100);
  const dueCents = Math.round(amount * 100);
  if (!Number.isSafeInteger(slipCents) || slipCents < dueCents) {
    throw new MarketError(400, `ยอดเงินในสลิป (฿${(Number(slip.amount) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}) น้อยกว่ายอดที่ต้องชำระ (฿${amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })})`);
  }
  if (!slipReceiverMatches(slip, [channels.promptpay_id, channels.bank_account_no])) {
    throw new MarketError(400, "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีของหอพัก กรุณาตรวจสอบสลิปอีกครั้ง");
  }
  return {
    method,
    verifyMode: "auto",
    transRef,
    qrPayload: qrPayload || null,
    paidAt: slipTransactionTime(slip),
    payerName: String(slip.sender?.displayName || slip.sender?.name || "").slice(0, 255) || null,
    testMode: false,
  };
}
