import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { DEMO_PAYMENT_CHANNELS, effectiveVerifyMode, normalizeSlipPayload } from "../middleware/slipVerification.js";

const router = Router();

const SQL = {
  config: "SELECT dorm_name, promptpay_id, bank_name, bank_account_no, payment_test_mode, slip_verify_mode FROM DormConfig WHERE id = 1",
  slipByPayload: "SELECT (SELECT COUNT(*) FROM PaymentSlip WHERE qr_payload = ?) + (SELECT COUNT(*) FROM ResidentVisitRequest WHERE fine_qr_payload = ?) AS total",
  slipByRef: "SELECT (SELECT COUNT(*) FROM PaymentSlip WHERE trans_ref = ?) + (SELECT COUNT(*) FROM ResidentVisitRequest WHERE fine_trans_ref = ?) AS total",
};

router.get("/channels", async (_req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const [[config = {}]] = await getPool().query(SQL.config);
    const testMode = Boolean(config.payment_test_mode);
    const source = testMode ? DEMO_PAYMENT_CHANNELS : config;
    return res.json({
      channels: {
        dorm_name: config.dorm_name || "",
        promptpay_id: source.promptpay_id || "",
        bank_name: source.bank_name || "",
        bank_account_no: source.bank_account_no || "",
        test_mode: testMode,
        verify_mode: effectiveVerifyMode(config),
      },
    });
  } catch (error) {
    console.error("Fetch payment channels error:", error.code);
    return res.status(500).json({ message: "ไม่สามารถโหลดช่องทางชำระเงินได้" });
  }
});

router.get("/slip-usage", async (req, res) => {
  try {
    const qrPayload = normalizeSlipPayload(req.query.qr_payload);
    const transRef = String(req.query.trans_ref ?? "").replace(/[^\x21-\x7e]/g, "").slice(0, 64);
    if (!qrPayload && !transRef) return res.status(400).json({ message: "กรุณาระบุข้อมูลสลิป" });
    const pool = getPool();
    let used = false;
    if (qrPayload) {
      const [[row]] = await pool.query(SQL.slipByPayload, [qrPayload, qrPayload]);
      used = Number(row.total) > 0;
    }
    if (!used && transRef) {
      const [[row]] = await pool.query(SQL.slipByRef, [transRef, transRef]);
      used = Number(row.total) > 0;
    }
    return res.json({ used });
  } catch (error) {
    console.error("Slip usage check error:", error.code);
    return res.status(500).json({ message: "ตรวจสอบสลิปซ้ำไม่สำเร็จ" });
  }
});

export default router;
