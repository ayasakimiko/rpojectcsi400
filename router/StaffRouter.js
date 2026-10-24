import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { authenticate, requireStaffRole } from "../middleware/authMiddleware.js";
import { getActingStaffName, requireActiveStaff } from "../middleware/accounts.js";
import {
  isPositiveId,
  lookup,
  parseDamageCost,
  parseDepositSettlementInput,
  parseMoveInInspectionInput,
  parseMoveInInspectionUpdate,
  parseMoveOutInspectionInput,
  parseMoveOutInspectionUpdate,
  parsePage,
  parsePhotoList,
  parseSearch,
  parseUtilityBillInput,
  parseWaitingListInput,
} from "../middleware/validation.js";
import { deletePublicImages, savePublicImages } from "../middleware/publicUploads.js";
import { recordAuditFields } from "../middleware/auditDetails.js";
import { roomEquipmentAssets } from "./roomAssets.js";
import { TEST_PAYMENT_MARK } from "../middleware/slipVerification.js";
import announcementRouter from "./AnnouncementRouter.js";
import dormInfoRouter from "./DormInfoRouter.js";
import {
  attachMaintenancePhotos,
  CHARGE_PAYMENT_TYPES,
  computeCurrentDue,
  createSafetyIncident,
  isPlateRegisteredByOther,
  loadCustomerOutstanding,
  loadDepositPayments,
  loadMoveOutBalance,
  loadTransferDepositLedger,
  MOVEOUT_OUTSTANDING_MESSAGE,
  paidDepositCents,
  RENEW_OUTSTANDING_MESSAGE,
  withThisMonthRent,
  withVehiclePhotos,
} from "./CustomerDashboardRouter.js";
import { listSafetyIncidents, reviewSafetyIncident } from "./AdminRouter.js";
import expenseRouter from "./ExpenseRouter.js";
import { createResidentVisitReview, listResidentVisitRequests } from "./residentVisitReview.js";
import {
  applyRoomTransfer,
  buildRoomTransferPlan,
  cancelTransfersIntoBookedRooms,
  claimRoomsForPaidTransfers,
  closeCustomerTenancy,
  contractImageName,
  contractImageUrl,
  expireRoomTransferCharges,
  loadCompletedContracts,
  loadContractByBooking,
  loadHeldTransferRooms,
  loadRoomTransferPreview,
  parseOptionalContractImages,
  removeContractFiles,
  requestRoomTransferCharge,
  ROOM_TRANSFER_CHARGE_DAYS,
  ROOM_TRANSFER_MIN_CONTRACT_IMAGES,
  roomTransferApprovalMessage,
  roomTransferNeedsPayment,
  syncRoomTransferCharge,
  validateInspectionDamage,
} from "./rentalContracts.js";
import { depositBalanceAfterTransfers, transferDepositDeductedCents } from "./roomTransferFinance.js";

const router = Router();

async function cancelStaleTenantRequests(connection, customerId, currentRoomNumber) {
  await connection.query(
    `UPDATE TenantRequest
     SET status = 'cancelled', completed_at = NOW(), completed_by_name = 'ระบบ (เปลี่ยนห้อง)'
     WHERE customer_id = ? AND status IN ('pending', 'in_progress')
       AND (type <> 'move_room' OR NOT EXISTS (SELECT 1 FROM Payment p WHERE p.id = TenantRequest.transfer_charge_payment_id AND p.status = 'paid'))
       AND (? IS NULL OR room_number <> ?)`,
    [customerId, currentRoomNumber, currentRoomNumber],
  );
}
const VEHICLE_MAX_PHOTOS = 6;

const STAFF_ROLE_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };

router.use(authenticate, requireStaffRole, requireActiveStaff);
router.use("/dorm-info", dormInfoRouter);

router.use("/expenses", expenseRouter);
router.use("/announcements", announcementRouter);
router.get("/safety-incidents", listSafetyIncidents);
router.post("/safety-incidents", createSafetyIncident);
router.patch("/safety-incidents/:id/review", reviewSafetyIncident);
router.patch("/safety-incidents/:id/cancel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสรายงานไม่ถูกต้อง" });
    const reason = String(req.body?.reason ?? "").trim();
    if (reason.length > 500) return res.status(400).json({ message: "เหตุผลการยกเลิกต้องไม่เกิน 500 ตัวอักษร" });
    const pool = getPool();
    const staffName = await getActingStaffName(pool, req.user);
    const [result] = await pool.query(
      `UPDATE SafetyIncident SET status = 'cancelled', cancelled_by_name = ?, cancelled_at = NOW(), cancel_reason = ?
       WHERE id = ? AND status = 'pending'`,
      [staffName || req.user.role, reason || null, id],
    );
    if (!result.affectedRows) return res.status(409).json({ message: "รายงานนี้ถูกตรวจสอบหรือยกเลิกไปแล้ว" });
    return res.json({ message: "ยกเลิกรายงานเหตุแล้ว" });
  } catch (error) {
    console.error("Cancel safety incident error:", error);
    return res.status(500).json({ message: "ไม่สามารถยกเลิกรายงานเหตุได้" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const pool = getPool();
    const table = STAFF_ROLE_TABLE[req.user.role];
    const [rows] = await pool.query(
      `SELECT id, role, idcard, first_name, last_name, phone FROM ${table} WHERE id = ?`,
      [req.user.id],
    );
    const staff = rows[0];
    if (!staff) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }
    return res.json({ staff });
  } catch (error) {
    console.error("Fetch staff profile error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/contracts/completed", async (_req, res) => {
  try {
    const pool = getPool();
    return res.json({ contracts: await withThisMonthRent(pool, await loadCompletedContracts(pool)) });
  } catch (error) {
    console.error("Fetch completed contracts error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดรายการสัญญาที่เสร็จสมบูรณ์ได้" });
  }
});

async function sendDepositSettlementLogs(res, bookingId = null) {
  try {
    const [rows] = await getPool().query(
      `SELECT id, booking_id, room_number, tenant_name, action, deposit_amount, deduction, refunded_amount,
              forfeited_amount, note, contract_status, left_at, contract_end_date, left_reason, settled_by_name, created_at
         FROM DepositSettlementLog ${bookingId ? "WHERE booking_id = ?" : ""} ORDER BY id DESC LIMIT 500`,
      bookingId ? [bookingId] : [],
    );
    return res.json({
      logs: rows.map((row) => ({
        ...row,
        deposit_amount: Number(row.deposit_amount),
        deduction: Number(row.deduction),
        refunded_amount: Number(row.refunded_amount),
        forfeited_amount: Number(row.forfeited_amount),
      })),
    });
  } catch (error) {
    console.error("Fetch deposit settlement logs error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดบันทึกการจัดการเงินมัดจำได้" });
  }
}

router.get("/contracts/deposit-settlement-logs", (req, res) => sendDepositSettlementLogs(res));

router.get("/contracts/:bookingId/deposit-settlement-logs", (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (!isPositiveId(bookingId)) return res.status(400).json({ message: "รหัสสัญญาไม่ถูกต้อง" });
  return sendDepositSettlementLogs(res, bookingId);
});

router.post("/contracts/:bookingId/deposit-settlement", async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    if (!isPositiveId(bookingId)) return res.status(400).json({ message: "รหัสสัญญาไม่ถูกต้อง" });
    const pool = getPool();
    const contract = await loadContractByBooking(pool, bookingId);
    if (!contract) return res.status(404).json({ message: "ไม่พบสัญญานี้" });
    if (!contract.is_archived) return res.status(409).json({ message: "สัญญานี้ยังไม่สิ้นสุด จึงยังจัดการเงินมัดจำไม่ได้" });
    if (contract.deposit_settlement) return res.status(409).json({ message: "บันทึกการคืน/ริบเงินมัดจำของสัญญานี้ไปแล้ว" });
    if (!(contract.deposit_remaining > 0)) return res.status(409).json({ message: "สัญญานี้ไม่มีเงินมัดจำคงเหลือ" });

    const { error, value } = parseDepositSettlementInput(req.body ?? {}, contract.deposit_remaining);
    if (error) return res.status(400).json({ message: error });
    const requiredAction = contract.deposit_refund === "forfeit" ? "forfeit" : "refund";
    if (value.action !== requiredAction) {
      return res.status(409).json({
        message: requiredAction === "forfeit"
          ? "ผู้เช่าย้ายออกก่อนครบสัญญา ต้องริบเงินมัดจำตามเงื่อนไข"
          : "ผู้เช่าพักครบสัญญา ต้องคืนเงินมัดจำตามเงื่อนไข",
      });
    }

    const staffName = await getActingStaffName(pool, req.user);
    const [result] = await pool.query(
      `UPDATE Booking SET deposit_settlement = ?, deposit_deduction = ?, deposit_refunded_amount = ?,
                          deposit_settlement_note = ?, deposit_settled_at = NOW(), deposit_settled_by_name = ?
       WHERE id = ? AND deposit_settlement IS NULL`,
      [
        value.action === "refund" ? "refunded" : "forfeited",
        value.deductionCents / 100,
        value.refundCents / 100,
        value.note,
        staffName || req.user.role,
        bookingId,
      ],
    );
    if (!result.affectedRows) return res.status(409).json({ message: "บันทึกการคืน/ริบเงินมัดจำของสัญญานี้ไปแล้ว" });
    await pool.query(
      `INSERT INTO DepositSettlementLog (booking_id, customer_id, room_number, tenant_name, action, deposit_amount,
                                        deduction, refunded_amount, forfeited_amount, note, contract_status,
                                        left_at, contract_end_date, left_reason, settled_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        contract.customer_id,
        contract.room_number ?? null,
        `${contract.first_name || ""} ${contract.last_name || ""}`.trim() || null,
        value.action === "refund" ? "refunded" : "forfeited",
        contract.deposit_remaining,
        value.deductionCents / 100,
        value.refundCents / 100,
        value.action === "refund" ? 0 : contract.deposit_remaining,
        value.note,
        contract.status,
        contract.moved_out_at || contract.next_contract_at || null,
        contract.effective_end_date || contract.rental_end_date || null,
        contract.moved_out_at ? "moveout" : contract.is_suspended ? "suspended" : contract.next_contract_at ? "new_contract" : null,
        staffName || req.user.role,
      ],
    );
    const [updated] =await withThisMonthRent(pool, [await loadContractByBooking(pool, bookingId)]);
    return res.json({
      message: value.action === "refund"
        ? `บันทึกคืนเงินมัดจำ ฿${(value.refundCents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} แล้ว`
        : "บันทึกริบเงินมัดจำแล้ว",
      contract: updated,
    });
  } catch (error) {
    console.error("Settle deposit error:", error);
    return res.status(500).json({ message: "ไม่สามารถบันทึกการคืนเงินมัดจำได้" });
  }
});

router.get("/payment-slips", async (_req, res) => {
  try {
    const [slips] = await getPool().query(
      `SELECT ps.id, ps.booking_id, ps.trans_ref, ps.amount, ps.trans_at, ps.sending_bank, ps.receiving_bank,
              ps.sender_name, ps.receiver_name, ps.slip_path, ps.is_test, ps.reviewed_by_name, ps.created_at,
              c.first_name, c.last_name, c.phone, COALESCE(r.room_number, c.room_number) AS room_number,
              (SELECT GROUP_CONCAT(DISTINCT p.type ORDER BY p.type SEPARATOR ',') FROM Payment p
                WHERE p.booking_id = ps.booking_id AND p.slip_path = ps.slip_path) AS payment_types,
              (SELECT JSON_ARRAYAGG(JSON_OBJECT('type', p.type, 'amount', p.amount, 'note', p.note)) FROM Payment p
                WHERE p.booking_id = ps.booking_id AND p.slip_path = ps.slip_path) AS payment_items
       FROM PaymentSlip ps
       JOIN Customer c ON c.id = ps.customer_id
       LEFT JOIN Booking b ON b.id = ps.booking_id
       LEFT JOIN Room r ON r.id = b.room_id
       ORDER BY ps.created_at DESC, ps.id DESC
       LIMIT 500`,
    );
    const [rejected] = await getPool().query(
      `SELECT sr.id, sr.booking_id, sr.trans_ref, sr.amount, sr.trans_at, sr.sender_name, sr.receiver_name,
              sr.sending_bank, sr.receiving_bank, sr.slip_path, sr.reason, sr.reviewed_by_name, sr.created_at,
              c.first_name, c.last_name, c.phone, COALESCE(r.room_number, c.room_number) AS room_number,
              (SELECT JSON_ARRAYAGG(JSON_OBJECT('type', p.type, 'amount', p.amount, 'note', p.note)) FROM Payment p
                WHERE p.booking_id = sr.booking_id AND p.slip_path = sr.slip_path) AS payment_items
       FROM PaymentSlipRejection sr
       JOIN Customer c ON c.id = sr.customer_id
       LEFT JOIN Booking b ON b.id = sr.booking_id
       LEFT JOIN Room r ON r.id = b.room_id
       ORDER BY sr.created_at DESC, sr.id DESC
       LIMIT 500`,
    );
    const [configRows] = await getPool().query("SELECT payment_test_mode, slip_verify_mode FROM DormConfig WHERE id = 1");
    const testMode = Boolean(configRows[0]?.payment_test_mode);
    const verifyMode = configRows[0]?.slip_verify_mode === "manual" ? "manual" : "auto";
    return res.json({ slips, rejected, mode: testMode ? "test" : verifyMode });
  } catch (error) {
    console.error("Fetch payment slip history error:", error);
    return res.status(500).json({ message: "โหลดประวัติสลิปไม่สำเร็จ" });
  }
});

router.get("/payment-verifications", async (_req, res) => {
  try {
    const pool = getPool();
    const [payments] = await pool.query(
      `SELECT MIN(p.id) AS id, p.booking_id, p.slip_path, SUM(p.amount) AS amount,
              MAX(p.payment_date) AS payment_date, c.first_name, c.last_name, c.phone,
              r.room_number, GROUP_CONCAT(DISTINCT p.type ORDER BY p.type SEPARATOR ',') AS payment_types,
              JSON_ARRAYAGG(JSON_OBJECT('type', p.type, 'amount', p.amount, 'note', p.note)) AS payment_items
       FROM Payment p
       JOIN Booking b ON b.id = p.booking_id
       JOIN Customer c ON c.id = b.customer_id
       JOIN Room r ON r.id = b.room_id
       WHERE p.status = 'pending' AND p.slip_path IS NOT NULL
       GROUP BY p.booking_id, p.slip_path, c.first_name, c.last_name, c.phone, r.room_number
       ORDER BY MAX(p.created_at) ASC`,
    );
    return res.json({ payments });
  } catch (error) {
    console.error("Fetch payment verifications error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/payment-verifications/:id", async (req, res) => {
  const { decision } = req.body ?? {};
  if (!isPositiveId(req.params.id)) return res.status(400).json({ message: "รหัสรายการไม่ถูกต้อง" });
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ message: "ผลการตรวจไม่ถูกต้อง" });

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [paymentRows] = await connection.query(
      `SELECT id, booking_id, slip_path FROM Payment WHERE id = ? AND status = 'pending' AND slip_path IS NOT NULL FOR UPDATE`,
      [req.params.id],
    );
    const payment = paymentRows[0];
    if (!payment) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบรายการที่รอตรวจสอบ" });
    }

    const [relatedPayments] = await connection.query(
      `SELECT id, amount, payment_date, status, type, note FROM Payment
       WHERE booking_id = ? AND slip_path = ? AND status = 'pending' FOR UPDATE`,
      [payment.booking_id, payment.slip_path],
    );
    const [ownerRows] = await connection.query(`SELECT customer_id FROM Booking WHERE id = ?`, [payment.booking_id]);
    const reviewerName = await getActingStaffName(pool, req.user);
    const isTestSlip = relatedPayments.some((item) => String(item.note || "").includes(TEST_PAYMENT_MARK));
    const slipAmount = relatedPayments.reduce((total, item) => total + Math.round(Number(item.amount) * 100), 0) / 100;
    if (decision === "rejected") {
      if (ownerRows[0]) {
        await connection.query(
          `INSERT INTO PaymentSlipRejection (booking_id, customer_id, slip_path, amount, reason, reviewed_by_name)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [payment.booking_id, ownerRows[0].customer_id, payment.slip_path, slipAmount, "เจ้าหน้าที่ตรวจแล้วไม่อนุมัติสลิป", reviewerName],
        );
      }
      await connection.query(
        `UPDATE Payment SET status = 'rejected', note = CONCAT(COALESCE(note, ''), ' (สลิปไม่ผ่านการตรวจสอบ)')
         WHERE booking_id = ? AND slip_path = ? AND status = 'pending' AND type IN ('rent', 'deposit')`,
        [payment.booking_id, payment.slip_path],
      );
      await connection.query(
        `UPDATE Payment SET slip_path = NULL, note = CONCAT(COALESCE(note, ''), ' (สลิปไม่ผ่านการตรวจสอบ กรุณาส่งใหม่)')
         WHERE booking_id = ? AND slip_path = ? AND status = 'pending' AND type IN (?)`,
        [payment.booking_id, payment.slip_path, CHARGE_PAYMENT_TYPES],
      );
      await connection.commit();
      return res.json({ message: "ปฏิเสธสลิปแล้ว ผู้เช่าสามารถส่งใหม่ได้" });
    }

    const [bookingRows] = await connection.query(
      `SELECT c.id AS customer_id, c.room_number, c.deposit_amount,
              r.price, r.is_booked, r.rental_start_date, r.rental_end_date, r.prepaid_until, r.billing_start_date, r.pending_lump_sum_months, r.rent_credit
       FROM Booking b JOIN Customer c ON c.id = b.customer_id JOIN Room r ON r.id = b.room_id
       WHERE b.id = ?`,
      [payment.booking_id],
    );
    const booking = bookingRows[0];
    if (!booking) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบสัญญาเช่าของรายการนี้" });
    }
    const [allPayments] = await connection.query(
      `SELECT id, amount, payment_date, status, type, note FROM Payment WHERE booking_id = ?`,
      [payment.booking_id],
    );
    const currentDue = computeCurrentDue(booking, allPayments, booking.deposit_amount);

    await connection.query(
      `UPDATE Payment SET status = 'paid', payment_date = CURDATE()
       WHERE booking_id = ? AND slip_path = ? AND status = 'pending'`,
      [payment.booking_id, payment.slip_path],
    );
    await claimRoomsForPaidTransfers(connection);
    if (currentDue?.lumpSumMonths) {
      await connection.query(
        `UPDATE Room SET prepaid_until = DATE_ADD(?, INTERVAL ? MONTH), pending_lump_sum_months = NULL
         WHERE room_number = ?`,
        [currentDue.periodEnd, currentDue.lumpSumMonths - 1, booking.room_number],
      );
    }
    await connection.query(
      `INSERT INTO PaymentSlip (trans_ref, booking_id, customer_id, slip_path, amount, reviewed_by_name, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`MANUAL-${payment.id}`, payment.booking_id, booking.customer_id, payment.slip_path, slipAmount, reviewerName, isTestSlip],
    );
    await connection.commit();
    return res.json({ message: `อนุมัติสลิปแล้ว (${relatedPayments.length} รายการ)` });
  } catch (error) {
    await connection.rollback();
    console.error("Review payment slip error:", error);
    return res.status(500).json({ message: "ตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection.release();
  }
});

router.get("/waiting-list", async (_req, res) => {
  try {
    const pool = getPool();
    const [waitingList] = await pool.query(
      `SELECT id, full_name, phone, room_preference, note, DATE_FORMAT(desired_move_in_date, '%Y-%m-%d') AS desired_move_in_date,
              status, submitted_by_name, created_at
       FROM WaitingList ORDER BY created_at DESC, id DESC`,
    );
    return res.json({ waitingList });
  } catch (error) {
    console.error("Fetch waiting list error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/waiting-list", async (req, res) => {
  try {
    const { error, value } = parseWaitingListInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }

    const pool = getPool();
    const staffName = await getActingStaffName(pool, req.user);
    const [result] = await pool.query(
      `INSERT INTO WaitingList (full_name, phone, room_preference, note, desired_move_in_date, submitted_by_name) VALUES (?, ?, ?, ?, ?, ?)`,
      [value.full_name, value.phone, value.room_preference ?? null, value.note ?? null, value.desired_move_in_date ?? null, staffName],
    );
    return res.status(201).json({ message: "เพิ่มรายชื่อผู้สนใจสำเร็จ", waitingListId: result.insertId });
  } catch (error) {
    console.error("Create waiting list entry error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/waiting-list/:id/status", async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    if (!isPositiveId(entryId)) {
      return res.status(400).json({ message: "รหัสรายการไม่ถูกต้อง" });
    }
    const { error, value } = parseWaitingListInput({ status: req.body?.status }, { partial: true });
    if (error || !value.status) {
      return res.status(400).json({ message: error || "กรุณาเลือกสถานะ" });
    }
    const [result] = await getPool().query(`UPDATE WaitingList SET status = ? WHERE id = ?`, [value.status, entryId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบรายชื่อผู้สนใจ" });
    }
    return res.json({ message: "เปลี่ยนสถานะสำเร็จ" });
  } catch (error) {
    console.error("Update waiting list status error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/waiting-list/:id", async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    if (!isPositiveId(entryId)) {
      return res.status(400).json({ message: "รหัสรายการไม่ถูกต้อง" });
    }
    const { error, value } = parseWaitingListInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `UPDATE WaitingList SET full_name = ?, phone = ?, room_preference = ?, note = ?, desired_move_in_date = ? WHERE id = ?`,
      [value.full_name, value.phone, value.room_preference ?? null, value.note ?? null, value.desired_move_in_date ?? null, entryId],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบรายชื่อผู้สนใจ" });
    }
    return res.json({ message: "แก้ไขรายชื่อผู้สนใจสำเร็จ" });
  } catch (error) {
    console.error("Update waiting list entry error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/waiting-list/:id", async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    if (!isPositiveId(entryId)) {
      return res.status(400).json({ message: "รหัสรายการไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`DELETE FROM WaitingList WHERE id = ?`, [entryId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบรายชื่อผู้สนใจ" });
    }
    return res.json({ message: "ลบรายชื่อผู้สนใจสำเร็จ" });
  } catch (error) {
    console.error("Delete waiting list entry error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/move-out-inspections", async (_req, res) => {
  try {
    const pool = getPool();
    const [inspections] = await pool.query(
      `SELECT moi.id, moi.room_number, moi.tenant_request_id, tr.type AS tenant_request_type, tr.target_room_number,
              moi.tenant_name, moi.tenant_phone, moi.checklist, moi.damage_note, moi.damage_cost, moi.inspected_by_name,
              JSON_LENGTH(moi.photos) AS photo_count, moi.status, moi.created_at
       FROM MoveOutInspection moi
       LEFT JOIN TenantRequest tr ON tr.id = moi.tenant_request_id
       WHERE moi.hidden_at IS NULL
       ORDER BY moi.created_at DESC, moi.id DESC`,
    );
    return res.json({
      inspections: inspections.map((inspection) => ({ ...inspection, checklist: JSON.parse(inspection.checklist) })),
    });
  } catch (error) {
    console.error("Fetch move-out inspections error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

// The current tenant's move-in inspection, used as the baseline when checking
// the same room at move-out.
router.get("/move-out-inspections/move-in-baseline/:room_number", async (req, res) => {
  try {
    const roomNumber = Number(req.params.room_number);
    if (!isPositiveId(roomNumber)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }
    const pool = getPool();
    const [tenantRows] = await pool.query(`${MOVE_IN_TENANT_SQL} AND r.room_number = ?`, [roomNumber]);
    const tenant = tenantRows[0];
    if (!tenant) return res.json({ baseline: null, room_assets: [] });
    const [rows] = await pool.query(
      `SELECT ${MOVE_IN_INSPECTION_COLUMNS} FROM MoveInInspection
       WHERE customer_id = ? AND room_number = ?
       ORDER BY id DESC LIMIT 1`,
      [tenant.customer_id, roomNumber],
    );
    return res.json({
      baseline: rows[0] ? parseMoveInInspectionRow(rows[0]) : null,
      room_assets: roomEquipmentAssets(tenant),
    });
  } catch (error) {
    console.error("Fetch move-in baseline error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/move-out-inspections/:id", async (req, res) => {
  try {
    const inspectionId = Number(req.params.id);
    if (!isPositiveId(inspectionId)) {
      return res.status(400).json({ message: "รหัสผลตรวจไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT moi.id, moi.room_number, moi.tenant_request_id, tr.type AS tenant_request_type, tr.target_room_number, moi.tenant_name, moi.tenant_phone,
              moi.checklist, moi.assets, moi.item_costs, moi.damage_note, moi.damage_cost, moi.photos, moi.status, moi.inspected_by_name,
              moi.reviewed_at, moi.updated_at, moi.created_at
       FROM MoveOutInspection moi
       LEFT JOIN TenantRequest tr ON tr.id = moi.tenant_request_id
       WHERE moi.id = ? AND moi.hidden_at IS NULL`,
      [inspectionId],
    );
    const inspection = rows[0];
    if (!inspection) {
      return res.status(404).json({ message: "ไม่พบผลตรวจห้อง" });
    }
    return res.json({
      inspection: {
        ...inspection,
        checklist: JSON.parse(inspection.checklist),
        assets: inspection.assets ? JSON.parse(inspection.assets) : null,
        item_costs: inspection.item_costs ? JSON.parse(inspection.item_costs) : null,
        photos: JSON.parse(inspection.photos),
      },
    });
  } catch (error) {
    console.error("Fetch move-out inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/move-out-inspections/:id", async (req, res) => {
  try {
    const inspectionId = Number(req.params.id);
    if (!isPositiveId(inspectionId)) {
      return res.status(400).json({ message: "รหัสผลตรวจไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT moi.photos, moi.tenant_request_id, tr.type AS tenant_request_type, tr.status AS tenant_request_status
       FROM MoveOutInspection moi
       LEFT JOIN TenantRequest tr ON tr.id = moi.tenant_request_id
       WHERE moi.id = ? AND moi.hidden_at IS NULL`,
      [inspectionId],
    );
    if (!rows[0]) {
      return res.status(404).json({ message: "ไม่พบผลตรวจห้อง" });
    }
    const existingPhotos = JSON.parse(rows[0].photos);
    const openMoveRoomId = rows[0].tenant_request_type === "move_room" && ["pending", "in_progress"].includes(rows[0].tenant_request_status)
      ? rows[0].tenant_request_id
      : null;

    const { error, value } = parseMoveOutInspectionUpdate(req.body ?? {}, existingPhotos);
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (openMoveRoomId) {
      const damageError = await validateInspectionDamage(pool, openMoveRoomId, value.damageCostCents);
      if (damageError) return res.status(409).json({ message: damageError });
    }

    const staffName = await getActingStaffName(pool, req.user);
    const savedPhotos = await savePublicImages("move-out-inspections", value.newPhotos);
    let sentChargeCents = 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        `UPDATE MoveOutInspection
         SET checklist = ?, assets = COALESCE(?, assets), item_costs = COALESCE(?, item_costs),
             damage_note = ?, damage_cost = ?, photos = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          JSON.stringify(value.checklist),
          value.assets ? JSON.stringify(value.assets) : null,
          value.itemCosts ? JSON.stringify(value.itemCosts) : null,
          value.damageNote,
          value.damageCostCents / 100,
          JSON.stringify([...value.keptPhotos, ...savedPhotos]),
          inspectionId,
        ],
      );
      if (openMoveRoomId) sentChargeCents = await syncRoomTransferCharge(connection, openMoveRoomId, staffName);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      await deletePublicImages(savedPhotos.map((photo) => photo.url));
      throw error;
    } finally {
      connection.release();
    }

    const keptUrls = new Set(value.keptPhotos.map((photo) => photo.url));
    await deletePublicImages(existingPhotos.filter((photo) => !keptUrls.has(photo.url)).map((photo) => photo.url));
    return res.json({
      message: sentChargeCents > 0
        ? `แก้ไขผลตรวจห้องสำเร็จ ส่งยอดชำระย้ายห้อง ฿${(sentChargeCents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ให้ผู้เช่าแล้ว`
        : "แก้ไขผลตรวจห้องสำเร็จ",
    });
  } catch (error) {
    console.error("Update move-out inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/move-out-inspections/:id", (_req, res) => {
  return res.status(403).json({ message: "เจ้าหน้าที่ไม่มีสิทธิ์ลบผลตรวจห้อง" });
});

router.post("/move-out-inspections", async (req, res) => {
  try {
    const { error, value } = parseMoveOutInspectionInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }

    const pool = getPool();
    const tenantRequestId = req.body?.tenant_request_id == null ? null : Number(req.body.tenant_request_id);
    if (tenantRequestId !== null && !isPositiveId(tenantRequestId)) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }
    const [tenantRows] = await pool.query(
      `SELECT c.id, c.first_name, c.last_name, c.phone
       FROM Room r
       JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
       WHERE r.room_number = ? AND r.is_booked = TRUE
       ORDER BY c.id DESC
       LIMIT 1`,
      [value.roomNumber],
    );
    const tenant = tenantRows[0];
    if (!tenant) {
      return res.status(400).json({ message: "กรุณาเลือกห้องที่มีผู้เช่า" });
    }

    if (tenantRequestId !== null) {
      const [requestRows] = await pool.query(
        `SELECT id, customer_id, room_number, type, status
         FROM TenantRequest WHERE id = ?`,
        [tenantRequestId],
      );
      const tenantRequest = requestRows[0];
      if (
        !tenantRequest
        || !["move_room", "moveout"].includes(tenantRequest.type)
        || !["pending", "in_progress"].includes(tenantRequest.status)
        || tenantRequest.room_number !== value.roomNumber
        || tenantRequest.customer_id !== tenant.id
      ) {
        return res.status(409).json({ message: "ไม่พบคำขอที่ตรงกับห้องและผู้เช่าที่ตรวจ" });
      }
      const [existingInspections] = await pool.query(
        `SELECT id FROM MoveOutInspection WHERE tenant_request_id = ?`,
        [tenantRequestId],
      );
      if (existingInspections.length > 0) {
        return res.status(409).json({ message: "มีผลตรวจสำหรับคำขอนี้แล้ว กรุณาแก้ไขผลตรวจเดิม" });
      }
      if (tenantRequest.type === "move_room") {
        const damageError = await validateInspectionDamage(pool, tenantRequestId, value.damageCostCents);
        if (damageError) return res.status(409).json({ message: damageError });
      }
    }
    const staffName = await getActingStaffName(pool, req.user);
    const photos = await savePublicImages("move-out-inspections", value.photos);
    const connection = await pool.getConnection();
    let linkedRequestType = null;
    try {
      await connection.beginTransaction();
      if (tenantRequestId !== null) {
        const [requestRows] = await connection.query(
          `SELECT id, customer_id, room_number, type, status
           FROM TenantRequest WHERE id = ? FOR UPDATE`,
          [tenantRequestId],
        );
        const tenantRequest = requestRows[0];
        if (
          !tenantRequest
          || !["move_room", "moveout"].includes(tenantRequest.type)
          || !["pending", "in_progress"].includes(tenantRequest.status)
          || tenantRequest.room_number !== value.roomNumber
          || tenantRequest.customer_id !== tenant.id
        ) {
          await connection.rollback();
          await deletePublicImages(photos.map((photo) => photo.url));
          return res.status(409).json({ message: "ไม่พบคำขอที่ตรงกับห้องและผู้เช่าที่ตรวจ" });
        }
        linkedRequestType = tenantRequest.type;
      }

      const [result] = await connection.query(
        `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, tenant_phone, checklist, assets, item_costs, damage_note, damage_cost, photos, inspected_by_name, status, reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE NOW() END)`,
        [
          value.roomNumber,
          tenantRequestId,
          `${tenant.first_name} ${tenant.last_name}`,
          tenant.phone || null,
          JSON.stringify(value.checklist),
          value.assets ? JSON.stringify(value.assets) : null,
          value.itemCosts ? JSON.stringify(value.itemCosts) : null,
          value.damageNote,
          value.damageCostCents / 100,
          JSON.stringify(photos),
          staffName,
          tenantRequestId === null ? "pending" : "reviewed",
          tenantRequestId,
        ],
      );
      if (tenantRequestId !== null) {
        await connection.query(
          `UPDATE TenantRequest
           SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
               accepted_at = COALESCE(accepted_at, NOW()),
               accepted_by_name = COALESCE(accepted_by_name, ?)
           WHERE id = ? AND status IN ('pending', 'in_progress')`,
          [staffName, tenantRequestId],
        );
      }
      const sentChargeCents = linkedRequestType === "move_room"
        ? await syncRoomTransferCharge(connection, tenantRequestId, staffName)
        : 0;
      await connection.commit();
      return res.status(201).json({
        message: tenantRequestId === null
          ? "ส่งผลตรวจห้องให้ Admin แล้ว"
          : linkedRequestType === "moveout"
            ? "บันทึกผลตรวจแล้ว สามารถอนุมัติการย้ายออกได้"
            : sentChargeCents > 0
              ? `บันทึกผลตรวจแล้ว ส่งยอดมัดจำเพิ่ม ฿${(sentChargeCents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ให้ผู้เช่าชำระภายใน ${ROOM_TRANSFER_CHARGE_DAYS} วัน`
              : "บันทึกผลตรวจแล้ว สามารถอนุมัติย้ายห้องได้ทันที",
        inspectionId: result.insertId,
      });
    } catch (error) {
      await connection.rollback();
      await deletePublicImages(photos.map((photo) => photo.url));
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "มีผลตรวจสำหรับคำขอนี้แล้ว กรุณาแก้ไขผลตรวจเดิม" });
    }
    console.error("Create move-out inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

// The current tenant of each booked room, joined with the room type whose asset
// list pre-fills the move-in checklist.
const MOVE_IN_TENANT_SQL = `
  SELECT r.room_number, r.rental_start_date, r.room_type_id, rt.name AS room_type_name,
         r.assets AS room_assets, rt.assets AS type_assets, r.air_conditioner, r.refrigerator, r.custom_amenities,
         c.id AS customer_id, c.first_name, c.last_name, c.phone
  FROM Room r
  JOIN Customer c ON c.id = (
    SELECT c2.id FROM Customer c2
    WHERE c2.room_number = r.room_number AND c2.is_suspended = FALSE
    ORDER BY c2.id DESC
    LIMIT 1
  )
  LEFT JOIN RoomType rt ON rt.id = r.room_type_id
  WHERE r.is_booked = TRUE`;

const MOVE_IN_INSPECTION_COLUMNS = `
  id, room_number, customer_id, tenant_name, tenant_phone, room_type_id, room_type_name,
  DATE_FORMAT(inspection_date, '%Y-%m-%d') AS inspection_date, checklist, assets, note,
  inspected_by_name, updated_at, created_at`;

function parseMoveInInspectionRow(row) {
  return { ...row, checklist: JSON.parse(row.checklist), assets: JSON.parse(row.assets) };
}

router.get("/move-in-inspections/candidates", async (_req, res) => {
  try {
    const pool = getPool();
    const [rooms] = await pool.query(`${MOVE_IN_TENANT_SQL} ORDER BY r.room_number ASC`);
    const [inspected] = await pool.query("SELECT id, customer_id, room_number FROM MoveInInspection");
    const inspectionByTenant = new Map(inspected.map((row) => [`${row.customer_id}:${row.room_number}`, row.id]));
    return res.json({
      candidates: rooms.map(({ room_assets, type_assets, air_conditioner, refrigerator, custom_amenities, ...room }) => ({
        ...room,
        room_assets: roomEquipmentAssets({ room_assets, type_assets, air_conditioner, refrigerator, custom_amenities }),
        inspection_id: inspectionByTenant.get(`${room.customer_id}:${room.room_number}`) || null,
      })),
    });
  } catch (error) {
    console.error("Fetch move-in inspection candidates error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/move-in-inspections", async (_req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT ${MOVE_IN_INSPECTION_COLUMNS}, JSON_LENGTH(photos) AS photo_count
       FROM MoveInInspection
       ORDER BY inspection_date DESC, id DESC`,
    );
    return res.json({ inspections: rows.map(parseMoveInInspectionRow) });
  } catch (error) {
    console.error("Fetch move-in inspections error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/move-in-inspections/:id", async (req, res) => {
  try {
    const inspectionId = Number(req.params.id);
    if (!isPositiveId(inspectionId)) {
      return res.status(400).json({ message: "รหัสผลตรวจไม่ถูกต้อง" });
    }
    const [rows] = await getPool().query(
      `SELECT ${MOVE_IN_INSPECTION_COLUMNS}, photos FROM MoveInInspection WHERE id = ?`,
      [inspectionId],
    );
    if (!rows[0]) {
      return res.status(404).json({ message: "ไม่พบผลตรวจห้อง" });
    }
    const inspection = parseMoveInInspectionRow(rows[0]);
    return res.json({ inspection: { ...inspection, photos: JSON.parse(rows[0].photos) } });
  } catch (error) {
    console.error("Fetch move-in inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/move-in-inspections", async (req, res) => {
  try {
    const { error, value } = parseMoveInInspectionInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }

    const pool = getPool();
    const [tenantRows] = await pool.query(`${MOVE_IN_TENANT_SQL} AND r.room_number = ?`, [value.roomNumber]);
    const tenant = tenantRows[0];
    if (!tenant) {
      return res.status(400).json({ message: "กรุณาเลือกห้องที่มีผู้เช่า" });
    }
    const [existing] = await pool.query(
      "SELECT id FROM MoveInInspection WHERE customer_id = ? AND room_number = ?",
      [tenant.customer_id, value.roomNumber],
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "ผู้เช่านี้มีผลตรวจก่อนเข้าอยู่แล้ว กรุณาแก้ไขผลตรวจเดิม" });
    }

    const staffName = await getActingStaffName(pool, req.user);
    const photos = await savePublicImages("move-in-inspections", value.photos);
    try {
      const [result] = await pool.query(
        `INSERT INTO MoveInInspection
           (room_number, customer_id, tenant_name, tenant_phone, room_type_id, room_type_name,
            inspection_date, checklist, assets, note, photos, inspected_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          value.roomNumber,
          tenant.customer_id,
          `${tenant.first_name} ${tenant.last_name}`,
          tenant.phone || null,
          tenant.room_type_id,
          tenant.room_type_name,
          value.inspectionDate,
          JSON.stringify(value.checklist),
          JSON.stringify(value.assets),
          value.note,
          JSON.stringify(photos),
          staffName,
        ],
      );
      return res.status(201).json({ message: "บันทึกผลตรวจก่อนเข้าอยู่สำเร็จ", inspectionId: result.insertId });
    } catch (error) {
      await deletePublicImages(photos.map((photo) => photo.url));
      throw error;
    }
  } catch (error) {
    console.error("Create move-in inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/move-in-inspections/:id", async (req, res) => {
  try {
    const inspectionId = Number(req.params.id);
    if (!isPositiveId(inspectionId)) {
      return res.status(400).json({ message: "รหัสผลตรวจไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [rows] = await pool.query("SELECT photos FROM MoveInInspection WHERE id = ?", [inspectionId]);
    if (!rows[0]) {
      return res.status(404).json({ message: "ไม่พบผลตรวจห้อง" });
    }
    const existingPhotos = JSON.parse(rows[0].photos);
    const { error, value } = parseMoveInInspectionUpdate(req.body ?? {}, existingPhotos);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const savedPhotos = await savePublicImages("move-in-inspections", value.newPhotos);
    try {
      await pool.query(
        `UPDATE MoveInInspection
         SET inspection_date = ?, checklist = ?, assets = ?, note = ?, photos = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          value.inspectionDate,
          JSON.stringify(value.checklist),
          JSON.stringify(value.assets),
          value.note,
          JSON.stringify([...value.keptPhotos, ...savedPhotos]),
          inspectionId,
        ],
      );
    } catch (error) {
      await deletePublicImages(savedPhotos.map((photo) => photo.url));
      throw error;
    }

    const keptUrls = new Set(value.keptPhotos.map((photo) => photo.url));
    await deletePublicImages(existingPhotos.filter((photo) => !keptUrls.has(photo.url)).map((photo) => photo.url));
    return res.json({ message: "แก้ไขผลตรวจก่อนเข้าอยู่สำเร็จ" });
  } catch (error) {
    console.error("Update move-in inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms", async (req, res) => {
  try {
    const pool = getPool();
    await expireRoomTransferCharges(pool);

    const [rooms] = await pool.query(
      `SELECT
         r.id, r.room_number, r.is_booked, r.price, r.room_size,
         r.rental_start_date, r.rental_end_date, r.prepaid_until, r.billing_start_date, r.pending_lump_sum_months, r.rent_credit,
         r.electricity_unit_price, r.water_unit_price, r.water_price,
         c.id AS customer_id, c.first_name, c.last_name, c.phone, c.deposit_amount
       FROM Room r
       LEFT JOIN Customer c ON c.id = (
         SELECT c2.id FROM Customer c2
         WHERE c2.room_number = r.room_number AND c2.is_suspended = FALSE
         ORDER BY c2.id DESC
         LIMIT 1
       )
       ORDER BY r.room_number ASC`,
    );

    const bookedRoomIds = rooms.filter((room) => room.is_booked && room.customer_id).map((room) => room.id);
    let latestBookingByRoomId = new Map();
    let paymentsByBookingId = new Map();

    if (bookedRoomIds.length > 0) {
      const [bookings] = await pool.query(
        `SELECT id, room_id, customer_id, created_at
         FROM Booking WHERE room_id IN (?)
         ORDER BY created_at DESC`,
        [bookedRoomIds],
      );
      for (const booking of bookings) {
        if (!latestBookingByRoomId.has(booking.room_id)) {
          latestBookingByRoomId.set(booking.room_id, booking);
        }
      }

      const bookingIds = [...latestBookingByRoomId.values()].map((booking) => booking.id);
      if (bookingIds.length > 0) {
        const [payments] = await pool.query(
          `SELECT id, booking_id, amount, status, type, note, payment_date FROM Payment WHERE booking_id IN (?)`,
          [bookingIds],
        );
        for (const payment of payments) {
          if (!paymentsByBookingId.has(payment.booking_id)) {
            paymentsByBookingId.set(payment.booking_id, []);
          }
          paymentsByBookingId.get(payment.booking_id).push(payment);
        }
      }
    }

    const [depositPaymentsByCustomer, heldRooms] = await Promise.all([
      loadDepositPayments(pool, rooms.map((room) => room.customer_id).filter(Boolean)),
      loadHeldTransferRooms(pool),
    ]);
    const result = rooms.map((room) => {
      const booking = latestBookingByRoomId.get(room.id);
      const payments = booking ? paymentsByBookingId.get(booking.id) || [] : [];
      const currentDue = booking
        ? computeCurrentDue(room, payments, room.deposit_amount, depositPaymentsByCustomer.get(room.customer_id) ?? [])
        : null;

      return {
        room_number: room.room_number,
        is_booked: room.is_booked,
        held_for_transfer: !room.is_booked && heldRooms.has(Number(room.room_number)),
        price: room.price,
        room_size: room.room_size,
        electricity_unit_price: room.electricity_unit_price,
        water_unit_price: room.water_unit_price,
        water_price: room.water_price,
        rental_start_date: room.rental_start_date,
        rental_end_date: room.rental_end_date,
        tenant: room.customer_id
          ? { id: room.customer_id, first_name: room.first_name, last_name: room.last_name, phone: room.phone }
          : null,
        currentDue,
      };
    });

    return res.json({ rooms: result });
  } catch (error) {
    console.error("Fetch staff rooms error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/:room_number/history", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();

    const [bookings] = await pool.query(
      `SELECT b.id AS booking_id, b.created_at, cu.first_name, cu.last_name
       FROM Booking b
       JOIN Room r ON r.id = b.room_id
       JOIN Customer cu ON cu.id = b.customer_id
       WHERE r.room_number = ?
       ORDER BY b.created_at DESC`,
      [roomNumberValue],
    );

    const bookingIds = bookings.map((booking) => booking.booking_id);
    let payments = [];
    if (bookingIds.length > 0) {
      [payments] = await pool.query(
        `SELECT id, booking_id, amount, payment_date, status, type, note, slip_path, created_at
         FROM Payment WHERE booking_id IN (?)
         ORDER BY payment_date DESC, created_at DESC`,
        [bookingIds],
      );
    }

    const rentalHistory = bookings.map((booking) => ({
      ...booking,
      payments: payments.filter((payment) => payment.booking_id === booking.booking_id),
    }));

    return res.json({ rentalHistory });
  } catch (error) {
    console.error("Fetch room history error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/rooms/:room_number/collect-payment", async (req, res) => {
  let connection;
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const [customerRows] = await connection.query(
      `SELECT id, deposit_amount FROM Customer WHERE room_number = ? AND is_suspended = FALSE ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [roomNumberValue],
    );
    const customer = customerRows[0];
    if (!customer) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบผู้เช่าของห้องนี้" });
    }

    const [roomRows] = await connection.query(
      `SELECT price, is_booked, rental_start_date, rental_end_date, prepaid_until, billing_start_date, pending_lump_sum_months, rent_credit FROM Room WHERE room_number = ? FOR UPDATE`,
      [roomNumberValue],
    );
    const room = roomRows[0];

    const [bookingRows] = await connection.query(
      `SELECT id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [customer.id],
    );
    const booking = bookingRows[0];
    if (!booking) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบสัญญาเช่าของห้องนี้" });
    }

    const [paymentsForBooking] = await connection.query(
      `SELECT id, amount, status, type, note, payment_date FROM Payment WHERE booking_id = ? FOR UPDATE`,
      [booking.id],
    );

    const depositPayments = (await loadDepositPayments(connection, [customer.id])).get(customer.id) ?? [];
    const currentDue = computeCurrentDue(room, paymentsForBooking, customer.deposit_amount, depositPayments);
    if (!currentDue) {
      await connection.rollback();
      return res.status(400).json({ message: "ไม่มียอดค่าเช่าที่ต้องเก็บในขณะนี้" });
    }

    if (currentDue.rentAmount > 0) {
      const note = currentDue.lumpSumMonths
        ? `เจ้าหน้าที่เก็บเงินสด (จ่ายทบ ${currentDue.lumpSumMonths} เดือน)`
        : "เจ้าหน้าที่เก็บเงินสด";

      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'paid', 'rent', ?)`,
        [booking.id, currentDue.rentAmount, note],
      );

      if (currentDue.lumpSumMonths) {
        await connection.query(
          `UPDATE Room
           SET prepaid_until = DATE_ADD(?, INTERVAL ? MONTH), pending_lump_sum_months = NULL
           WHERE room_number = ?`,
          [currentDue.periodEnd, currentDue.lumpSumMonths - 1, roomNumberValue],
        );
      }
    }

    if (currentDue.depositAmount > 0 && currentDue.depositStatus === "due") {
      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'paid', 'deposit', 'เจ้าหน้าที่เก็บเงินมัดจำ (เงินสด)')`,
        [booking.id, currentDue.depositAmount],
      );
    }

    const utilityPaymentIds = currentDue.items.filter((item) => item.id).map((item) => item.id);
    if (utilityPaymentIds.length > 0) {
      await connection.query(
        `UPDATE Payment SET status = 'paid', payment_date = CURDATE() WHERE id IN (?)`,
        [utilityPaymentIds],
      );
      await claimRoomsForPaidTransfers(connection);
    }

    await connection.commit();
    recordAuditFields({
      roomNumber: roomNumberValue,
      paidItems: currentDue.items.map((item) => `${item.label} ${Number(item.amount).toLocaleString("th-TH")} บาท`).join(", "),
      totalAmount: currentDue.amount,
      paymentMethod: "cash",
    });
    return res.status(201).json({ message: "บันทึกการเก็บเงินสำเร็จ" });
  } catch (error) {
    if (connection) await connection.rollback();
    if (["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code)) {
      return res.status(409).json({ message: "มีรายการอื่นกำลังปรับปรุงข้อมูลห้องนี้ กรุณารีเฟรชและลองใหม่อีกครั้ง" });
    }
    console.error("Staff collect payment error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection?.release();
  }
});

router.post("/rooms/:room_number/utility-bill", async (req, res) => {
  let connection;
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const [customerRows] = await connection.query(
      `SELECT id FROM Customer WHERE room_number = ? AND is_suspended = FALSE ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [roomNumberValue],
    );
    const customer = customerRows[0];
    if (!customer) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบผู้เช่าของห้องนี้" });
    }

    const [roomRows] = await connection.query(
      `SELECT is_booked, electricity_unit_price, water_unit_price, water_price FROM Room WHERE room_number = ? FOR UPDATE`,
      [roomNumberValue],
    );
    const room = roomRows[0];
    if (!room || !room.is_booked) {
      await connection.rollback();
      return res.status(400).json({ message: "ห้องนี้ไม่มีผู้เช่าอยู่ในขณะนี้" });
    }

    const [bookingRows] = await connection.query(
      `SELECT id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [customer.id],
    );
    const booking = bookingRows[0];
    if (!booking) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบสัญญาเช่าของห้องนี้" });
    }

    const { error, value } = parseUtilityBillInput(req.body ?? {});
    if (error) {
      await connection.rollback();
      return res.status(400).json({ message: error });
    }
    const { electricityUnits, electricityAmount: electricityAmountInput, waterAmount: waterAmountInput, waterUnits } = value;
    const wantsElectricityByUnits = electricityUnits !== null;
    const wantsElectricityByAmount = electricityAmountInput !== null;
    const wantsElectricity = wantsElectricityByUnits || wantsElectricityByAmount;
    const wantsWater = waterUnits !== null || waterAmountInput !== null;
    const waterUnitPrice = Number(room.water_unit_price) || 0;
    if (waterUnits !== null && waterUnitPrice <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: "กรุณากำหนดราคาน้ำต่อหน่วยของห้องนี้ก่อนส่งบิล" });
    }
    const waterAmount = waterUnits !== null
      ? Math.round(waterUnits * waterUnitPrice * 100) / 100
      : waterAmountInput;

    const [existingPending] = await connection.query(
      `SELECT type FROM Payment
       WHERE booking_id = ? AND status = 'pending' AND type IN ('water', 'electricity')
         AND payment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND payment_date < DATE_FORMAT(CURDATE() + INTERVAL 1 MONTH, '%Y-%m-01') FOR UPDATE`,
      [booking.id],
    );
    const existingTypes = new Set(existingPending.map((row) => row.type));
    if (wantsElectricity && existingTypes.has("electricity")) {
      await connection.rollback();
      return res.status(409).json({ message: "ส่งบิลค่าไฟของเดือนนี้ไปแล้ว รอลูกค้าชำระก่อน" });
    }
    if (wantsWater && existingTypes.has("water")) {
      await connection.rollback();
      return res.status(409).json({ message: "ส่งบิลค่าน้ำของเดือนนี้ไปแล้ว รอลูกค้าชำระก่อน" });
    }

    const staffName = await getActingStaffName(connection, req.user);

    if (wantsElectricityByUnits) {
      const unitPrice = Number(room.electricity_unit_price) || 0;
      const amount = Math.round(electricityUnits * unitPrice * 100) / 100;
      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, electricity_units, note) VALUES (?, ?, CURDATE(), 'pending', 'electricity', ?, ?)`,
        [
          booking.id,
          amount,
          electricityUnits,
          `ค่าไฟฟ้า ${electricityUnits} หน่วย x ฿${unitPrice}/หน่วย (แจ้งโดย ${staffName || "เจ้าหน้าที่"})`,
        ],
      );
    } else if (wantsElectricityByAmount) {
      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'pending', 'electricity', ?)`,
        [booking.id, electricityAmountInput, `ค่าไฟฟ้า (ราคาปกติ) (แจ้งโดย ${staffName || "เจ้าหน้าที่"})`],
      );
    }

    if (wantsWater) {
      await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, water_units, note) VALUES (?, ?, CURDATE(), 'pending', 'water', ?, ?)`,
        [booking.id, waterAmount, waterUnits, `ค่าน้ำประจำเดือน${waterUnits === null ? "" : ` ${waterUnits} หน่วย`} (แจ้งโดย ${staffName || "เจ้าหน้าที่"})`],
      );
    }

    await connection.commit();
    return res.status(201).json({ message: "ส่งบิลค่าน้ำ-ค่าไฟสำเร็จ" });
  } catch (error) {
    if (connection) await connection.rollback();
    if (["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code)) {
      return res.status(409).json({ message: "มีรายการอื่นกำลังปรับปรุงข้อมูลห้องนี้ กรุณารีเฟรชและลองใหม่อีกครั้ง" });
    }
    console.error("Send utility bill error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection?.release();
  }
});

router.get("/requests", async (req, res) => {
  try {
    const pool = getPool();
    await expireRoomTransferCharges(pool);

    const [[tenantRequests], [maintenanceRequests]] = await Promise.all([pool.query(
      `SELECT tr.id, tr.customer_id, tr.type, tr.note, tr.renew_duration_months, tr.renew_payment_type, tr.status, tr.created_at,
              tr.accepted_at, tr.accepted_by_name, tr.transfer_charge_due_at,
              tcp.amount AS transfer_charge_amount, tcp.status AS transfer_charge_status,
              (tcp.slip_path IS NOT NULL) AS transfer_charge_has_slip,
              tr.move_reason, DATE_FORMAT(tr.preferred_move_date, '%Y-%m-%d') AS preferred_move_date,
              tr.room_number, tr.target_room_number, c.first_name, c.last_name, c.phone, c.deposit_amount,
              moi.id AS inspection_id, moi.status AS inspection_status, moi.reviewed_at AS inspection_reviewed_at,
              moi.inspected_by_name AS inspection_by_name,
              moi.updated_at AS inspection_updated_at,
              sr.price AS source_room_price, sr.rental_end_date AS source_rental_end_date,
              sr.prepaid_until AS source_prepaid_until, sr.room_size AS source_room_size,
              tg.price AS target_room_price, tg.is_booked AS target_room_is_booked, tg.room_size AS target_room_size,
              tg.electricity_unit_price AS target_room_electricity_unit_price, tg.water_price AS target_room_water_price,
              tg.bed AS target_room_bed
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       LEFT JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
       LEFT JOIN Room sr ON sr.room_number = tr.room_number
       LEFT JOIN Room tg ON tg.room_number = tr.target_room_number
       LEFT JOIN Payment tcp ON tcp.id = tr.transfer_charge_payment_id
       WHERE tr.status IN ('pending', 'in_progress') AND tr.room_number = c.room_number
       ORDER BY tr.created_at ASC`,
    ), pool.query(
      `SELECT mr.id, mr.description, mr.category, mr.contact_phone, mr.preferred_time, mr.status, mr.created_at,
              mr.room_number, c.first_name, c.last_name, c.phone
       FROM MaintenanceRequest mr
       JOIN Customer c ON c.id = mr.customer_id
       WHERE mr.status IN ('pending', 'in_progress')
       ORDER BY mr.created_at ASC`,
    )]);

    const moveoutCustomerIds = tenantRequests.filter((request) => request.type === "moveout").map((request) => request.customer_id);
    const [depositPaymentsByCustomer, transferLedger] = moveoutCustomerIds.length
      ? await Promise.all([loadDepositPayments(pool, moveoutCustomerIds), loadTransferDepositLedger(pool, moveoutCustomerIds)])
      : [new Map(), new Map()];
    const tenantRequestsWithOutstanding = await Promise.all(
      tenantRequests.map(async (request) => {
        if (request.type === "renew") return { ...request, outstanding: await loadCustomerOutstanding(pool, request.customer_id) };
        if (request.type !== "moveout") return request;
        const transfers = transferLedger.get(request.customer_id) ?? [];
        return {
          ...request,
          outstanding: await loadMoveOutBalance(pool, request.customer_id),
          deposit_paid: depositBalanceAfterTransfers(paidDepositCents(depositPaymentsByCustomer.get(request.customer_id)), transfers) / 100,
          deposit_transfer_deducted: transferDepositDeductedCents(transfers) / 100,
        };
      }),
    );

    return res.json({ tenantRequests: tenantRequestsWithOutstanding, maintenanceRequests: await attachMaintenancePhotos(pool, maintenanceRequests) });
  } catch (error) {
    console.error("Fetch staff requests error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const REQUEST_HISTORY_PAGE_SIZE = 10;

router.get("/requests/history", async (req, res) => {
  try {
    const pool = getPool();
    const page = parsePage(req.query.page);
    const offset = (page - 1) * REQUEST_HISTORY_PAGE_SIZE;

    const conditions = [`tr.status IN ('approved', 'rejected', 'cancelled')`];
    const params = [];

    if (["approved", "rejected", "cancelled"].includes(req.query.status)) {
      conditions.push(`tr.status = ?`);
      params.push(req.query.status);
    }

    if (["renew", "moveout", "move_room"].includes(req.query.type)) {
      conditions.push(`tr.type = ?`);
      params.push(req.query.type);
    }

    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(`(CAST(tr.room_number AS CHAR) LIKE ? OR CAST(tr.target_room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR c.phone LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.join(" AND ");

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       WHERE ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const [requests] = await pool.query(
      `SELECT tr.id, tr.type, tr.note, tr.renew_duration_months, tr.renew_payment_type, tr.status, tr.created_at,
              tr.accepted_at, tr.accepted_by_name, tr.completed_at, tr.completed_by_name, tr.reject_reason,
              tr.move_reason, DATE_FORMAT(tr.preferred_move_date, '%Y-%m-%d') AS preferred_move_date,
              tr.room_number, tr.target_room_number, c.first_name, c.last_name, c.phone,
              moi.id AS inspection_id, moi.inspected_by_name AS inspection_by_name,
              moi.reviewed_at AS inspection_reviewed_at,
              sr.price AS source_room_price, tg.price AS target_room_price
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       LEFT JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
       LEFT JOIN Room sr ON sr.room_number = tr.room_number
       LEFT JOIN Room tg ON tg.room_number = tr.target_room_number
       WHERE ${whereClause}
       ORDER BY tr.completed_at DESC
       LIMIT ? OFFSET ?`,
      [...params, REQUEST_HISTORY_PAGE_SIZE, offset],
    );

    return res.json({ requests, total, page, pageSize: REQUEST_HISTORY_PAGE_SIZE });
  } catch (error) {
    console.error("Fetch tenant request history error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/maintenance/history", async (req, res) => {
  try {
    const pool = getPool();
    const page = parsePage(req.query.page);
    const offset = (page - 1) * REQUEST_HISTORY_PAGE_SIZE;

    const conditions = [`mr.status IN ('done', 'cancelled')`];
    const params = [];

    if (["done", "cancelled"].includes(req.query.status)) {
      conditions.push(`mr.status = ?`);
      params.push(req.query.status);
    }

    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(
        `(CAST(mr.room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR c.phone LIKE ? OR mr.description LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.join(" AND ");

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM MaintenanceRequest mr
       JOIN Customer c ON c.id = mr.customer_id
       WHERE ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const [requests] = await pool.query(
      `SELECT mr.id, mr.description, mr.category, mr.contact_phone, mr.preferred_time, mr.status, mr.created_at,
              mr.accepted_at, mr.accepted_by_name, mr.completed_at, mr.completed_by_name,
              mr.room_number, c.first_name, c.last_name, c.phone
       FROM MaintenanceRequest mr
       JOIN Customer c ON c.id = mr.customer_id
       WHERE ${whereClause}
       ORDER BY mr.completed_at DESC
       LIMIT ? OFFSET ?`,
      [...params, REQUEST_HISTORY_PAGE_SIZE, offset],
    );

    return res.json({
      requests: await attachMaintenancePhotos(pool, requests),
      total,
      page,
      pageSize: REQUEST_HISTORY_PAGE_SIZE,
    });
  } catch (error) {
    console.error("Fetch maintenance request history error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/requests/:id/acknowledge", async (req, res) => {
  try {
    const pool = getPool();
    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    const staffName = await getActingStaffName(pool, req.user);
    const [result] = await pool.query(
      `UPDATE TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id AND c.room_number = tr.room_number
       SET tr.status = 'in_progress', tr.accepted_at = NOW(), tr.accepted_by_name = ?
       WHERE tr.id = ? AND tr.status = 'pending'`,
      [staffName, requestId],
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ message: "ไม่พบคำขอที่รอดำเนินการนี้" });
    }

    return res.json({ message: "รับเรื่องสำเร็จ" });
  } catch (error) {
    console.error("Acknowledge tenant request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/requests/:id/transfer-preview", async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    const damage = req.query.damage === undefined ? { value: null } : parseDamageCost(req.query.damage);
    if (damage.error) return res.status(400).json({ message: damage.error });
    await expireRoomTransferCharges(getPool());
    const preview = await loadRoomTransferPreview(getPool(), requestId, { damageCents: damage.value });
    if (!preview) return res.status(404).json({ message: "ไม่พบคำขอย้ายห้องนี้" });
    return res.json({ preview });
  } catch (error) {
    console.error("Room transfer preview error:", error);
    return res.status(500).json({ message: "ไม่สามารถคำนวณรายละเอียดการย้ายห้องได้" });
  }
});

router.post("/requests/:id/transfer-charge", async (req, res) => {
  const pool = getPool();
  const requestId = Number(req.params.id);
  if (!isPositiveId(requestId)) return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
  const connection = await pool.getConnection();
  try {
    await expireRoomTransferCharges(pool);
    const staffName = await getActingStaffName(pool, req.user);
    await connection.beginTransaction();
    const plan = await buildRoomTransferPlan(connection, requestId, { lock: true });
    if (!plan?.customer) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบคำขอย้ายห้องนี้" });
    }
    if (plan.stale) {
      await cancelStaleTenantRequests(connection, plan.request.customer_id, plan.customer.room_number);
      await connection.commit();
      return res.status(410).json({ message: "คำขอถูกนำออกจากรายการแล้ว เนื่องจากผู้เช่าเปลี่ยนห้อง" });
    }
    if (plan.blockers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: plan.blockers[0], blockers: plan.blockers });
    }
    if (!plan.transferCharge.required) {
      await connection.rollback();
      return res.status(409).json({ message: "ย้ายห้องนี้ไม่มีเงินมัดจำที่ต้องเก็บเพิ่มก่อนย้าย" });
    }
    if (plan.transferCharge.status !== "not_sent") {
      await connection.rollback();
      return res.status(409).json({ message: "ส่งยอดชำระย้ายห้องให้ผู้เช่าไปแล้ว" });
    }
    await requestRoomTransferCharge(connection, plan, staffName);
    await connection.commit();
    return res.status(201).json({
      message: `ส่งยอดมัดจำเพิ่ม ฿${(plan.settlement.additionalChargeCents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ให้ผู้เช่าแล้ว ต้องชำระภายใน ${ROOM_TRANSFER_CHARGE_DAYS} วัน ไม่เช่นนั้นคำขอย้ายห้องจะถูกยกเลิก`,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Room transfer charge error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection.release();
  }
});

router.post("/requests/:id/approve", parseOptionalContractImages, async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();
  const uploadedFiles = req.files ?? [];
  let keepUploadedFiles = false;
  try {
    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    const staffName = await getActingStaffName(pool, req.user);
    await expireRoomTransferCharges(pool);

    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT id, customer_id, room_number, target_room_number, type, renew_duration_months, renew_payment_type, status
       FROM TenantRequest WHERE id = ? FOR UPDATE`,
      [requestId],
    );
    const tenantRequest = requestRows[0];
    if (!tenantRequest) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบคำขอนี้" });
    }
    if (!["pending", "in_progress"].includes(tenantRequest.status)) {
      await connection.rollback();
      return res.status(409).json({ message: "คำขอนี้ถูกดำเนินการไปแล้ว" });
    }

    if (tenantRequest.type === "renew" || tenantRequest.type === "moveout") {
      const [customerRows] = await connection.query(
        `SELECT room_number FROM Customer WHERE id = ? FOR UPDATE`,
        [tenantRequest.customer_id],
      );
      if (!customerRows[0]) {
        await connection.rollback();
        return res.status(404).json({ message: "ไม่พบผู้เช่า" });
      }
      if (customerRows[0].room_number !== tenantRequest.room_number) {
        await cancelStaleTenantRequests(connection, tenantRequest.customer_id, customerRows[0].room_number);
        await connection.commit();
        return res.status(410).json({ message: "คำขอถูกนำออกจากรายการแล้ว เนื่องจากผู้เช่าเปลี่ยนห้อง" });
      }
    }

    if (tenantRequest.type === "renew") {
      const outstanding = await loadCustomerOutstanding(connection, tenantRequest.customer_id);
      if (outstanding.amount > 0) {
        await connection.rollback();
        return res.status(409).json({ code: "RENEW_OUTSTANDING", message: RENEW_OUTSTANDING_MESSAGE(outstanding.amount), outstanding });
      }
      const durationMonths = tenantRequest.renew_duration_months;

      await connection.query(
        `UPDATE Room
         SET
           rental_end_date = DATE_ADD(rental_end_date, INTERVAL ? MONTH),
           rental_duration_months = TIMESTAMPDIFF(MONTH, rental_start_date, rental_end_date)
         WHERE room_number = ?`,
        [durationMonths, tenantRequest.room_number],
      );
    }

    let transferPlan = null;
    if (tenantRequest.type === "move_room") {
      transferPlan = await buildRoomTransferPlan(connection, tenantRequest.id, { lock: true });
      if (!transferPlan?.customer) {
        await connection.rollback();
        return res.status(404).json({ message: "ไม่พบผู้เช่า" });
      }
      if (transferPlan.stale) {
        await cancelStaleTenantRequests(connection, tenantRequest.customer_id, transferPlan.customer.room_number);
        await connection.commit();
        return res.status(410).json({ message: "คำขอถูกนำออกจากรายการแล้ว เนื่องจากผู้เช่าเปลี่ยนห้อง" });
      }
      if (transferPlan.blockers.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: transferPlan.blockers[0], blockers: transferPlan.blockers });
      }
      if (roomTransferNeedsPayment(transferPlan)) {
        await connection.rollback();
        return res.status(409).json({
          code: "TRANSFER_CHARGE_UNPAID",
          message: transferPlan.transferCharge.status === "not_sent"
            ? "มียอดค่าเช่าหรือเงินมัดจำที่ต้องเก็บเพิ่ม กรุณาส่งยอดเก็บเงินให้ผู้เช่าชำระก่อนทำสัญญาย้ายห้อง"
            : transferPlan.transferCharge.status === "verifying"
              ? "ผู้เช่าส่งสลิปยอดย้ายห้องแล้ว กรุณาตรวจสลิปให้เรียบร้อยก่อนทำสัญญาย้ายห้อง"
              : "ผู้เช่ายังไม่ได้ชำระยอดย้ายห้อง ยังทำสัญญาย้ายห้องไม่ได้",
        });
      }
      if (uploadedFiles.length < ROOM_TRANSFER_MIN_CONTRACT_IMAGES) {
        await connection.rollback();
        return res.status(400).json({
          code: "CONTRACT_IMAGES_REQUIRED",
          message: `กรุณาแนบรูปสัญญาใหม่อย่างน้อย ${ROOM_TRANSFER_MIN_CONTRACT_IMAGES} รูปก่อนอนุมัติย้ายห้อง`,
        });
      }
      await applyRoomTransfer(
        connection,
        transferPlan,
        staffName,
        uploadedFiles.map((file, index) => ({ name: contractImageName(file, index), url: contractImageUrl(file) })),
      );
    }

    if (tenantRequest.type === "moveout") {
      const [inspectionRows] = await connection.query(
        `SELECT id FROM MoveOutInspection
         WHERE tenant_request_id = ? AND room_number = ? AND status = 'reviewed' AND hidden_at IS NULL
         FOR UPDATE`,
        [tenantRequest.id, tenantRequest.room_number],
      );
      if (!inspectionRows[0]) {
        await connection.rollback();
        return res.status(409).json({ message: "กรุณาตรวจสภาพห้องก่อนอนุมัติการย้ายออก" });
      }

      const balance = await loadMoveOutBalance(connection, tenantRequest.customer_id);
      if (balance.items.length > 0) {
        await connection.rollback();
        return res.status(409).json({ code: "MOVEOUT_OUTSTANDING", message: MOVEOUT_OUTSTANDING_MESSAGE(balance), outstanding: balance });
      }

      const [roomBeforeReset] = await connection.query(
        `SELECT id, rental_start_date, rental_end_date FROM Room WHERE room_number = ? FOR UPDATE`,
        [tenantRequest.room_number],
      );
      const moveInDate = roomBeforeReset[0]?.rental_start_date ?? null;
      const [bookingRows] = await connection.query(
        `SELECT id FROM Booking WHERE customer_id = ? AND room_id = ? ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
        [tenantRequest.customer_id, roomBeforeReset[0]?.id ?? null],
      );
      if (bookingRows[0]) {
        await connection.query(
          `UPDATE Booking SET rental_start_date = ?, rental_end_date = ? WHERE id = ?`,
          [moveInDate, roomBeforeReset[0]?.rental_end_date ?? null, bookingRows[0].id],
        );
      }

      await connection.query(`UPDATE TenantRequest SET move_in_date = ? WHERE id = ?`, [moveInDate, requestId]);

      await closeCustomerTenancy(connection, tenantRequest.customer_id);
      await connection.query(
        `UPDATE Customer SET room_number = NULL, is_suspended = TRUE, suspended_at = COALESCE(suspended_at, NOW()) WHERE id = ?`,
        [tenantRequest.customer_id],
      );

      await connection.query(
        `UPDATE Room
         SET
           is_booked = FALSE,
           rental_start_date = NULL,
           rental_end_date = NULL,
           rental_duration_months = NULL,
           prepaid_until = NULL,
           billing_start_date = NULL,
           pending_lump_sum_months = NULL,
           rent_credit = NULL
         WHERE room_number = ?`,
        [tenantRequest.room_number],
      );
    }

    await connection.query(
      `UPDATE TenantRequest
       SET status = 'approved',
           accepted_at = COALESCE(accepted_at, NOW()),
           accepted_by_name = COALESCE(accepted_by_name, ?),
           completed_at = NOW(),
           completed_by_name = ?
       WHERE id = ?`,
      [staffName, staffName, requestId],
    );

    if (tenantRequest.type === "move_room" || tenantRequest.type === "moveout") {
      await cancelStaleTenantRequests(
        connection,
        tenantRequest.customer_id,
        tenantRequest.type === "move_room" ? tenantRequest.target_room_number : null,
      );
    }
    if (tenantRequest.type === "move_room") {
      await cancelTransfersIntoBookedRooms(connection, tenantRequest.target_room_number);
    }

    if (tenantRequest.type === "moveout") {
      await connection.query(
        `UPDATE ResidentVisitRequest
         SET status = 'cancelled', cancelled_by_name = 'ระบบ (ผู้เช่าย้ายออก)', cancelled_at = NOW()
         WHERE customer_id = ? AND (status = 'pending'
           OR (status = 'approved' AND (end_at IS NULL OR end_at > NOW())))`,
        [tenantRequest.customer_id],
      );
      await connection.query(
        `UPDATE SafetyIncident
         SET status = 'cancelled', cancelled_by_name = 'ระบบ (ผู้เช่าย้ายออก)',
             cancelled_at = NOW(), cancel_reason = 'ผู้แจ้งเหตุย้ายออกจากห้อง'
         WHERE reporter_role = 'Customer' AND reporter_id = ? AND status = 'pending'`,
        [tenantRequest.customer_id],
      );
    }

    if (tenantRequest.type === "move_room" || tenantRequest.type === "moveout") {
      const currentRoomNumber = tenantRequest.type === "move_room" ? tenantRequest.target_room_number : null;
      await connection.query(
        `UPDATE MaintenanceRequest
         SET status = 'cancelled', completed_at = NOW(), completed_by_name = ?
         WHERE customer_id = ? AND status IN ('pending', 'in_progress')
           AND (? IS NULL OR room_number <> ?)`,
        [tenantRequest.type === "moveout" ? "ระบบ (ผู้เช่าย้ายออก)" : "ระบบ (เปลี่ยนห้อง)",
          tenantRequest.customer_id, currentRoomNumber, currentRoomNumber],
      );
    }

    await connection.commit();
    keepUploadedFiles = Boolean(transferPlan);
    return res.json({ message: transferPlan ? roomTransferApprovalMessage(transferPlan) : "อนุมัติคำขอสำเร็จ" });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "คำขอนี้ถูกดำเนินการไปแล้ว" });
    console.error("Approve tenant request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection.release();
    if (!keepUploadedFiles && uploadedFiles.length > 0) await removeContractFiles(uploadedFiles);
  }
});

router.post("/requests/:id/reject", async (req, res) => {
  try {
    const pool = getPool();
    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      return res.status(400).json({ message: "กรุณาระบุเหตุผลที่ปฏิเสธเพื่อแจ้งผู้เช่า" });
    }
    if (reason.length > 500) {
      return res.status(400).json({ message: "เหตุผลที่ปฏิเสธต้องไม่เกิน 500 ตัวอักษร" });
    }

    const staffName = await getActingStaffName(pool, req.user);
    const [result] = await pool.query(
      `UPDATE TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id AND c.room_number = tr.room_number
       SET tr.status = 'rejected',
           tr.accepted_at = COALESCE(tr.accepted_at, NOW()),
           tr.accepted_by_name = COALESCE(tr.accepted_by_name, ?),
           tr.completed_at = NOW(),
           tr.completed_by_name = ?,
           tr.reject_reason = ?
       WHERE tr.id = ? AND tr.status IN ('pending', 'in_progress')
         AND (tr.type <> 'move_room' OR NOT EXISTS (
           SELECT 1 FROM Payment p WHERE p.id = tr.transfer_charge_payment_id AND p.status = 'paid'
         ))`,
      [staffName, staffName, reason, requestId],
    );
    if (result.affectedRows === 0) {
      const [paidTransfers] = await pool.query(
        `SELECT tr.id FROM TenantRequest tr
         JOIN Payment p ON p.id = tr.transfer_charge_payment_id AND p.status = 'paid'
         WHERE tr.id = ? AND tr.type = 'move_room'`,
        [requestId],
      );
      if (paidTransfers.length) {
        return res.status(409).json({ message: "ชำระส่วนต่างย้ายห้องแล้ว ไม่สามารถยกเลิกหรือปฏิเสธคำขอได้" });
      }
      return res.status(409).json({ message: "ไม่พบคำขอที่รอดำเนินการนี้" });
    }

    return res.json({ message: "ปฏิเสธคำขอสำเร็จ" });
  } catch (error) {
    console.error("Reject tenant request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const MAINTENANCE_TRANSITIONS = {
  accept: {
    from: ["pending"],
    to: "in_progress",
    timestampColumn: "accepted_at",
    byNameColumn: "accepted_by_name",
    message: "รับเรื่องแจ้งซ่อมสำเร็จ",
  },
  complete: {
    from: ["pending", "in_progress"],
    to: "done",
    timestampColumn: "completed_at",
    byNameColumn: "completed_by_name",
    recordAcceptance: true,
    message: "บันทึกการซ่อมเสร็จสิ้นสำเร็จ",
  },
  reject: {
    from: ["pending", "in_progress"],
    to: "cancelled",
    timestampColumn: "completed_at",
    byNameColumn: "completed_by_name",
    recordAcceptance: true,
    message: "ปฏิเสธรายการแจ้งซ่อมสำเร็จ",
  },
};

router.post("/maintenance/:id/:action", async (req, res) => {
  try {
    const transition = lookup(MAINTENANCE_TRANSITIONS, req.params.action);
    if (!transition) {
      return res.status(404).json({ message: "ไม่พบการดำเนินการนี้" });
    }

    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) {
      return res.status(400).json({ message: "รหัสรายการแจ้งซ่อมไม่ถูกต้อง" });
    }

    const pool = getPool();
    const staffName = await getActingStaffName(pool, req.user);
    const acceptanceUpdate = transition.recordAcceptance
      ? ", accepted_at = COALESCE(accepted_at, NOW()), accepted_by_name = COALESCE(accepted_by_name, ?)"
      : "";
    const [result] = await pool.query(
      `UPDATE MaintenanceRequest
       SET status = ?, ${transition.timestampColumn} = NOW(), ${transition.byNameColumn} = ?${acceptanceUpdate}
       WHERE id = ? AND status IN (?)`,
      transition.recordAcceptance
        ? [transition.to, staffName, staffName, requestId, transition.from]
        : [transition.to, staffName, requestId, transition.from],
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ message: "ไม่พบรายการแจ้งซ่อมที่สามารถดำเนินการนี้ได้" });
    }

    return res.json({ message: transition.message });
  } catch (error) {
    console.error("Update maintenance request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/resident-visit-requests", listResidentVisitRequests);

router.post("/resident-visit-requests", async (req, res) => {
  let savedPhotos = [];
  try {
    const { roomNumber, owner, vehiclePlate, vehicleModel, guestName, guestPhone, startAt, endAt, note, photos } = req.body ?? {};
    const room = Number(roomNumber);
    const startTime = typeof startAt === "string" ? Date.parse(startAt) : NaN;
    const openEnded = endAt === null || endAt === undefined || endAt === "";
    const endTime = openEnded ? null : typeof endAt === "string" ? Date.parse(endAt) : NaN;
    if (!["self", "family", "external"].includes(owner)) return res.status(400).json({ message: "กรุณาเลือกประเภทรถ" });
    const isExternal = owner === "external";
    if (!isExternal && !isPositiveId(room)) return res.status(400).json({ message: "กรุณาเลือกห้อง" });
    if (!Number.isFinite(startTime) || (!openEnded && (!Number.isFinite(endTime) || endTime <= startTime))) {
      return res.status(400).json({ message: "กรุณาระบุช่วงเวลาให้ถูกต้อง" });
    }
    const textFields = [[vehiclePlate, 20], [vehicleModel, 100], [guestName, 255], [guestPhone, 20], [note, 500]];
    if (textFields.some(([value, maxLength]) => value != null && (typeof value !== "string" || value.trim().length > maxLength))) {
      return res.status(400).json({ message: "ข้อมูลข้อความไม่ถูกต้องหรือยาวเกินที่กำหนด" });
    }
    if (!String(vehiclePlate ?? "").trim()) return res.status(400).json({ message: "กรุณาระบุทะเบียนรถ" });
    const parsedPhotos = parsePhotoList(photos, VEHICLE_MAX_PHOTOS);
    if (parsedPhotos.error) return res.status(400).json({ message: parsedPhotos.error });
    if (owner !== "self" && !String(guestName ?? "").trim()) {
      return res.status(400).json({ message: isExternal ? "กรุณาระบุชื่อผู้ขอจอด" : "กรุณาระบุชื่อผู้มาเยี่ยม" });
    }

    const pool = getPool();
    let customerId = null;
    if (!isExternal) {
      const [customers] = await pool.query(
        "SELECT id FROM Customer WHERE room_number = ? AND is_suspended = FALSE ORDER BY id DESC LIMIT 1",
        [room],
      );
      customerId = customers[0]?.id;
      if (!customerId) return res.status(400).json({ message: "ห้องนี้ยังไม่มีผู้เช่า" });
    }
    if (await isPlateRegisteredByOther(pool, customerId, vehiclePlate)) {
      return res.status(409).json({ message: "ทะเบียนรถนี้ถูกลงทะเบียนกับห้องพักอยู่แล้ว" });
    }
    const staffName = await getActingStaffName(pool, req.user);
    const hasVisitor = owner !== "self";
    savedPhotos = await savePublicImages("vehicles", parsedPhotos.value);
    const [result] = await pool.query(
      `INSERT INTO ResidentVisitRequest
         (customer_id, room_number, request_type, vehicle_plate, vehicle_model, vehicle_photos, guest_name, guest_phone, start_at, end_at, note, status, reviewed_by_name, reviewed_at)
       VALUES (?, ?, 'vehicle', ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, NOW())`,
      [
        customerId,
        isExternal ? null : room,
        vehiclePlate.trim(),
        vehicleModel?.trim() || null,
        savedPhotos.length ? JSON.stringify(savedPhotos) : null,
        hasVisitor ? guestName.trim() : null,
        hasVisitor ? guestPhone?.trim() || null : null,
        startAt,
        openEnded ? null : endAt,
        note?.trim() || null,
        staffName,
      ],
    );
    return res.status(201).json({ id: result.insertId, message: "เพิ่มรถเรียบร้อยแล้ว" });
  } catch (error) {
    if (savedPhotos.length) await deletePublicImages(savedPhotos.map((photo) => photo.url)).catch(() => {});
    console.error("Staff create resident vehicle error:", error);
    return res.status(500).json({ message: "ไม่สามารถเพิ่มรถได้" });
  }
});

router.patch("/resident-visit-requests/:id", async (req, res) => {
  let savedPhotos = [];
  try {
    const id = Number(req.params.id);
    if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    const { vehiclePlate, vehicleModel, guestName, guestPhone, startAt, endAt, note, keepPhotos, photos } = req.body ?? {};
    const startTime = typeof startAt === "string" ? Date.parse(startAt) : NaN;
    const openEnded = endAt === null || endAt === undefined || endAt === "";
    const endTime = openEnded ? null : typeof endAt === "string" ? Date.parse(endAt) : NaN;
    if (!Number.isFinite(startTime) || (!openEnded && (!Number.isFinite(endTime) || endTime <= startTime))) {
      return res.status(400).json({ message: "กรุณาระบุช่วงเวลาให้ถูกต้อง" });
    }
    const textFields = [[vehiclePlate, 20], [vehicleModel, 100], [guestName, 255], [guestPhone, 20], [note, 500]];
    if (textFields.some(([value, maxLength]) => value != null && (typeof value !== "string" || value.trim().length > maxLength))) {
      return res.status(400).json({ message: "ข้อมูลข้อความไม่ถูกต้องหรือยาวเกินที่กำหนด" });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT id, customer_id, request_type, status, vehicle_plate, vehicle_photos, guest_name FROM ResidentVisitRequest WHERE id = ?",
      [id],
    );
    const current = withVehiclePhotos(rows)[0];
    if (!current) return res.status(404).json({ message: "ไม่พบคำขอนี้" });
    if (current.request_type !== "vehicle") return res.status(400).json({ message: "แก้ไขได้เฉพาะคำขอรถ" });
    if (!["pending", "approved"].includes(current.status)) {
      return res.status(409).json({ message: "คำขอนี้ถูกปิดแล้ว แก้ไขไม่ได้" });
    }
    if (!String(vehiclePlate ?? "").trim()) return res.status(400).json({ message: "กรุณาระบุทะเบียนรถ" });
    const hasVisitor = Boolean(current.guest_name) || !current.customer_id;
    if (hasVisitor && !String(guestName ?? "").trim()) {
      return res.status(400).json({ message: current.customer_id ? "กรุณาระบุชื่อผู้มาเยี่ยม" : "กรุณาระบุชื่อผู้ขอจอด" });
    }

    const keep = new Set(Array.isArray(keepPhotos) ? keepPhotos.filter((url) => typeof url === "string") : []);
    const keptPhotos = current.vehicle_photos.filter((photo) => keep.has(photo.url));
    const removedPhotos = current.vehicle_photos.filter((photo) => !keep.has(photo.url));
    const parsedPhotos = parsePhotoList(photos, VEHICLE_MAX_PHOTOS - keptPhotos.length);
    if (parsedPhotos.error) return res.status(400).json({ message: parsedPhotos.error });

    const plate = vehiclePlate.trim();
    const plateChanged = plate.replace(/\s+/g, "").toUpperCase() !== String(current.vehicle_plate ?? "").replace(/\s+/g, "").toUpperCase();
    if (plateChanged && (await isPlateRegisteredByOther(pool, current.customer_id, plate))) {
      return res.status(409).json({ message: "ทะเบียนรถนี้ถูกลงทะเบียนกับห้องอื่นอยู่แล้ว" });
    }

    const staffName = await getActingStaffName(pool, req.user);
    savedPhotos = await savePublicImages("vehicles", parsedPhotos.value);
    const nextPhotos = [...keptPhotos, ...savedPhotos];
    const [result] = await pool.query(
      `UPDATE ResidentVisitRequest
       SET vehicle_plate = ?, vehicle_model = ?, vehicle_photos = ?, guest_name = ?, guest_phone = ?, start_at = ?, end_at = ?, note = ?,
           updated_by_name = ?, updated_at = NOW()
       WHERE id = ? AND status IN ('pending', 'approved')`,
      [
        plate,
        vehicleModel?.trim() || null,
        nextPhotos.length ? JSON.stringify(nextPhotos) : null,
        hasVisitor ? guestName.trim() : null,
        hasVisitor ? guestPhone?.trim() || null : null,
        startAt,
        openEnded ? null : endAt,
        note?.trim() || null,
        staffName,
        id,
      ],
    );
    if (!result.affectedRows) {
      await deletePublicImages(savedPhotos.map((photo) => photo.url));
      return res.status(409).json({ message: "คำขอนี้ถูกปิดแล้ว แก้ไขไม่ได้" });
    }
    if (removedPhotos.length) await deletePublicImages(removedPhotos.map((photo) => photo.url)).catch(() => {});
    return res.json({ message: "บันทึกการแก้ไขแล้ว" });
  } catch (error) {
    if (savedPhotos.length) await deletePublicImages(savedPhotos.map((photo) => photo.url)).catch(() => {});
    console.error("Staff update resident vehicle error:", error);
    return res.status(500).json({ message: "ไม่สามารถบันทึกการแก้ไขได้" });
  }
});

router.delete("/resident-visit-requests/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    const pool = getPool();
    const staffName = await getActingStaffName(pool, req.user);
    const [result] = await pool.query(
      `UPDATE ResidentVisitRequest SET status = 'cancelled', cancelled_by_name = ?, cancelled_at = NOW()
       WHERE id = ? AND status IN ('pending', 'approved')`,
      [staffName, id],
    );
    if (!result.affectedRows) return res.status(409).json({ message: "คำขอนี้ถูกปิดแล้ว" });
    return res.json({ message: "ยกเลิกรายการรถแล้ว" });
  } catch (error) {
    console.error("Staff cancel resident vehicle error:", error);
    return res.status(500).json({ message: "ไม่สามารถยกเลิกรายการได้" });
  }
});

router.post("/resident-visit-requests/:id/:decision", createResidentVisitReview(getActingStaffName));

export default router;
