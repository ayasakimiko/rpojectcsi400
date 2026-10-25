import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../Database/connection.js";
import { authenticate, createRequireActiveAccount, requireAdminRole } from "../middleware/authMiddleware.js";
import { getActingAdminName } from "../middleware/accounts.js";
import { actorOf } from "../middleware/notifications.js";
import { moveOutInspectionSaved, safetyHandled, staffAccountChanged } from "./notificationEvents.js";
import { createResidentVisitReview, listResidentVisitRequests } from "./residentVisitReview.js";
import {
  createFinePaymentHandler,
  createFineReviewHandler,
  createParkingOptionsHandler,
  getParkingSettings,
  parseFineSlip,
  updateParkingSettings,
} from "./parking.js";
import {
  hasField,
  isPositiveId,
  MOVE_OUT_INSPECTION_STATUSES,
  normalizePersonUpdate,
  parseDamageCost,
  parseMoveOutInspectionInput,
  parseMoveOutInspectionUpdate,
  parsePage,
  parseRoomAssetsInput,
  parseRoomTypeInput,
  parseSearch,
  parseWaitingListInput,
  validatePersonInput,
  validatePersonUpdateInput,
  validateRoomFields,
} from "../middleware/validation.js";
import { customerUploadFolder, deletePublicImages, savePublicImages, withIncidentPhotos } from "../middleware/publicUploads.js";
import announcementRouter from "./AnnouncementRouter.js";
import { createNotificationRoutes } from "./notificationRoutes.js";
import { loadPendingNotifications, PENDING_KINDS } from "./pendingNotifications.js";
import expenseRouter from "./ExpenseRouter.js";
import dormInfoRouter from "./DormInfoRouter.js";
import { attachMaintenancePhotos } from "./CustomerDashboardRouter.js";
import {
  createAttachTransferContractHandler,
  createPendingTransferContractsHandler,
  expireRoomTransferCharges,
  loadCustomerContracts,
  parseTransferContractImages,
  loadRoomTransferPreview,
  resetCustomerHistory,
  roomHeldForTransfer,
  syncRoomTransferCharge,
  validateInspectionDamage,
} from "./rentalContracts.js";
import { normalizeRoomAmenity } from "../src/utils/roomAmenities.js";
import { effectiveRoomAssets } from "./roomAssets.js";
import { loadMoveOutBaseline } from "./moveInBaseline.js";

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

router.use(authenticate, requireAdminRole, createRequireActiveAccount(getPool));
router.use("/notifications", createNotificationRoutes({ loadPending: loadPendingNotifications, pendingKinds: PENDING_KINDS }));
router.use("/dorm-info", dormInfoRouter);
router.use("/expenses", expenseRouter);
router.use("/announcements", announcementRouter);

function buildUpdate(allowedColumns, body) {
  const columns = [];
  const values = [];
  for (const column of allowedColumns) {
    if (Object.prototype.hasOwnProperty.call(body, column)) {
      columns.push(`${column} = ?`);
      values.push(body[column]);
    }
  }
  return { columns, values };
}

const SAFETY_REVIEWER_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };

export async function listSafetyIncidents(_req, res) {
  try {
    const [incidents] = await getPool().query(
      `SELECT id, reporter_role, reporter_name, room_number, incident_type, severity, description, photos,
              status, reviewed_by_name, reviewed_at, review_note, cancelled_by_name, cancelled_at, cancel_reason, created_at
       FROM SafetyIncident ORDER BY (status = 'pending') DESC, created_at DESC`,
    );
    return res.json({ incidents: withIncidentPhotos(incidents) });
  } catch (error) {
    console.error("Fetch safety incidents error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดรายงานเหตุได้" });
  }
}

export async function reviewSafetyIncident(req, res) {
  try {
    const id = Number(req.params.id);
    if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสรายงานไม่ถูกต้อง" });
    const note = String(req.body?.reviewNote ?? "").trim();
    if (note.length > 500) return res.status(400).json({ message: "บันทึกผลต้องไม่เกิน 500 ตัวอักษร" });
    const pool = getPool();
    const reviewerTable = SAFETY_REVIEWER_TABLE[req.user?.role];
    const [reviewers] = reviewerTable
      ? await pool.query(`SELECT first_name, last_name FROM ${reviewerTable} WHERE id = ?`, [req.user.id])
      : [[]];
    const reviewerName = reviewers[0] ? `${reviewers[0].first_name} ${reviewers[0].last_name}` : req.user.role;
    const [result] = await pool.query(
      "UPDATE SafetyIncident SET status = 'reviewed', reviewed_by_name = ?, reviewed_at = NOW(), review_note = ? WHERE id = ? AND status = 'pending'",
      [reviewerName, note || null, id],
    );
    if (!result.affectedRows) return res.status(409).json({ message: "รายงานนี้ถูกตรวจสอบหรือยกเลิกไปแล้ว" });
    await safetyHandled(id, actorOf(req.user, reviewerName), "reviewed", note);
    return res.json({ message: "บันทึกผลตรวจสอบแล้ว" });
  } catch (error) {
    console.error("Review safety incident error:", error);
    return res.status(500).json({ message: "ไม่สามารถบันทึกผลตรวจสอบได้" });
  }
}

router.get("/safety-incidents", listSafetyIncidents);
router.patch("/safety-incidents/:id/review", reviewSafetyIncident);

router.get("/resident-visit-requests", listResidentVisitRequests);
router.get("/parking/options", createParkingOptionsHandler({ withOccupant: true }));
router.get("/parking/settings", getParkingSettings);
router.put("/parking/settings", updateParkingSettings);
router.post("/resident-visit-requests/:id/fine-review", createFineReviewHandler(getActingAdminName));
router.post("/resident-visit-requests/:id/fine-payment", parseFineSlip, createFinePaymentHandler({ getActingName: getActingAdminName }));
router.post("/resident-visit-requests/:id/:decision", createResidentVisitReview(getActingAdminName));

router.get("/room-transfers/pending-contracts", createPendingTransferContractsHandler(getPool));
router.post("/room-transfers/:id/contract-images", parseTransferContractImages, createAttachTransferContractHandler(getPool));

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
    const adminName = await getActingAdminName(pool, req.user);
    const [result] = await pool.query(
      `INSERT INTO WaitingList (full_name, phone, room_preference, note, desired_move_in_date, submitted_by_name) VALUES (?, ?, ?, ?, ?, ?)`,
      [value.full_name, value.phone, value.room_preference ?? null, value.note ?? null, value.desired_move_in_date ?? null, adminName],
    );
    return res.status(201).json({ message: "เพิ่มรายชื่อผู้สนใจสำเร็จ", waitingListId: result.insertId });
  } catch (error) {
    console.error("Create waiting list entry error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/waiting-list/:id", async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    if (!isPositiveId(entryId)) {
      return res.status(400).json({ message: "รหัสรายการไม่ถูกต้อง" });
    }
    const { error, value } = parseWaitingListInput(req.body ?? {}, { partial: true });
    if (error) {
      return res.status(400).json({ message: error });
    }
    const { columns, values } = buildUpdate(["full_name", "phone", "room_preference", "note", "desired_move_in_date", "status"], value);
    if (columns.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE WaitingList SET ${columns.join(", ")} WHERE id = ?`, [...values, entryId]);
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
              moi.tenant_name, moi.tenant_phone, moi.checklist, moi.damage_note, moi.damage_cost, JSON_LENGTH(moi.photos) AS photo_count,
              moi.status, moi.inspected_by_name AS inspected_by, moi.reviewed_at, moi.updated_at, moi.created_at
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

router.get("/move-out-inspections/move-room-candidates", async (_req, res) => {
  try {
    const pool = getPool();
    const [requests] = await pool.query(
      `SELECT tr.id, tr.room_number, tr.target_room_number, tr.status, tr.created_at, tr.preferred_move_date,
              c.first_name, c.last_name, c.phone
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       LEFT JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
       WHERE tr.type = 'move_room' AND tr.status IN ('pending', 'in_progress')
         AND tr.room_number = c.room_number AND moi.id IS NULL
       ORDER BY tr.created_at ASC, tr.id ASC`,
    );
    return res.json({ requests });
  } catch (error) {
    console.error("Fetch move-room inspection candidates error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/move-out-inspections/move-room-candidates/:id/transfer-preview", async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    const damage = req.query.damage === undefined ? { value: null } : parseDamageCost(req.query.damage);
    if (damage.error) return res.status(400).json({ message: damage.error });
    const pool = getPool();
    await expireRoomTransferCharges(pool);
    const preview = await loadRoomTransferPreview(pool, requestId, { damageCents: damage.value });
    if (!preview) return res.status(404).json({ message: "ไม่พบคำขอย้ายห้องนี้" });
    return res.json({ preview });
  } catch (error) {
    console.error("Admin room transfer preview error:", error);
    return res.status(500).json({ message: "ไม่สามารถคำนวณรายละเอียดการย้ายห้องได้" });
  }
});

router.post("/move-out-inspections", async (req, res) => {
  let photos = [];
  let connection;
  try {
    const { error, value } = parseMoveOutInspectionInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }
    const tenantRequestId = Number(req.body?.tenant_request_id);
    if (!isPositiveId(tenantRequestId)) {
      return res.status(400).json({ message: "กรุณาเลือกคำขอย้ายห้องที่ต้องการตรวจ" });
    }

    const pool = getPool();
    const damageError = await validateInspectionDamage(pool, tenantRequestId, value.damageCostCents);
    if (damageError) return res.status(409).json({ message: damageError });
    const adminName = await getActingAdminName(pool, req.user);
    const [[requestOwner]] = await pool.query("SELECT customer_id FROM TenantRequest WHERE id = ?", [tenantRequestId]);
    photos = await savePublicImages(customerUploadFolder("move-out-inspections", requestOwner?.customer_id), value.photos);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT tr.id, tr.room_number, tr.type, tr.status, c.room_number AS current_room_number,
              c.first_name, c.last_name, c.phone
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       WHERE tr.id = ? FOR UPDATE`,
      [tenantRequestId],
    );
    const tenantRequest = requestRows[0];
    if (
      !tenantRequest
      || tenantRequest.type !== "move_room"
      || !["pending", "in_progress"].includes(tenantRequest.status)
      || tenantRequest.room_number !== value.roomNumber
      || tenantRequest.current_room_number !== value.roomNumber
    ) {
      await connection.rollback();
      await deletePublicImages(photos.map((photo) => photo.url));
      return res.status(409).json({ message: "ไม่พบคำขอย้ายห้องที่ตรงกับห้องที่ตรวจ" });
    }
    const [existing] = await connection.query(`SELECT id FROM MoveOutInspection WHERE tenant_request_id = ?`, [tenantRequestId]);
    if (existing.length > 0) {
      await connection.rollback();
      await deletePublicImages(photos.map((photo) => photo.url));
      return res.status(409).json({ message: "มีผลตรวจสำหรับคำขอนี้แล้ว กรุณาแก้ไขผลตรวจเดิม" });
    }

    const [result] = await connection.query(
      `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, tenant_phone, checklist, damage_note, damage_cost, photos, inspected_by_name, status, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reviewed', NOW())`,
      [
        value.roomNumber,
        tenantRequestId,
        `${tenantRequest.first_name} ${tenantRequest.last_name}`,
        tenantRequest.phone || null,
        JSON.stringify(value.checklist),
        value.damageNote,
        value.damageCostCents / 100,
        JSON.stringify(photos),
        adminName,
      ],
    );
    await connection.query(
      `UPDATE TenantRequest
       SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
           accepted_at = COALESCE(accepted_at, NOW()),
           accepted_by_name = COALESCE(accepted_by_name, ?)
       WHERE id = ?`,
      [adminName, tenantRequestId],
    );
    const sentChargeCents = await syncRoomTransferCharge(connection, tenantRequestId, adminName);
    await connection.commit();
    await moveOutInspectionSaved(result.insertId, actorOf(req.user, adminName));
    return res.status(201).json({
      message: sentChargeCents > 0
        ? `บันทึกผลตรวจห้องสำเร็จ ส่งยอดชำระย้ายห้อง ฿${(sentChargeCents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ให้ผู้เช่าแล้ว`
        : "บันทึกผลตรวจห้องสำเร็จ",
      inspectionId: result.insertId,
    });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    await deletePublicImages(photos.map((photo) => photo.url));
    console.error("Admin create move-room inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection?.release();
  }
});

router.put("/move-out-inspections/:id", async (req, res) => {
  try {
    const inspectionId = Number(req.params.id);
    if (!isPositiveId(inspectionId)) {
      return res.status(400).json({ message: "รหัสผลตรวจไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT moi.photos, moi.tenant_request_id, tr.customer_id, tr.type AS tenant_request_type, tr.status AS tenant_request_status
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

    const adminName = await getActingAdminName(pool, req.user);
    const savedPhotos = await savePublicImages(customerUploadFolder("move-out-inspections", rows[0].customer_id), value.newPhotos);
    let sentChargeCents = 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        `UPDATE MoveOutInspection SET checklist = ?, damage_note = ?, damage_cost = ?, photos = ?, updated_at = NOW() WHERE id = ?`,
        [
          JSON.stringify(value.checklist),
          value.damageNote,
          value.damageCostCents / 100,
          JSON.stringify([...value.keptPhotos, ...savedPhotos]),
          inspectionId,
        ],
      );
      if (openMoveRoomId) sentChargeCents = await syncRoomTransferCharge(connection, openMoveRoomId, adminName);
      await connection.commit();
    } catch (updateError) {
      await connection.rollback();
      await deletePublicImages(savedPhotos.map((photo) => photo.url));
      throw updateError;
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
    console.error("Admin update move-out inspection error:", error);
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
      `SELECT moi.id, moi.room_number, moi.tenant_request_id, tr.type AS tenant_request_type, tr.target_room_number, tr.customer_id,
              moi.tenant_name, moi.tenant_phone, moi.checklist, moi.assets, moi.item_costs, moi.damage_note, moi.damage_cost, moi.photos,
              moi.status, moi.inspected_by_name AS inspected_by, moi.reviewed_at, moi.created_at
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
        move_in_baseline: await loadMoveOutBaseline(pool, inspection),
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
    const status = req.body?.status;
    if (!MOVE_OUT_INSPECTION_STATUSES.has(status)) {
      return res.status(400).json({ message: "สถานะไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [inspections] = await pool.query(`SELECT tenant_request_id FROM MoveOutInspection WHERE id = ? AND hidden_at IS NULL`, [inspectionId]);
    if (!inspections[0]) {
      return res.status(404).json({ message: "ไม่พบผลตรวจห้อง" });
    }
    if (inspections[0].tenant_request_id !== null) {
      return res.status(409).json({ message: "ผลตรวจสำหรับการย้ายห้องดำเนินการโดย Staff ไม่ต้องตรวจอนุมัติโดย Admin" });
    }
    const [result] = await pool.query(`UPDATE MoveOutInspection SET status = ?, reviewed_at = NOW() WHERE id = ? AND tenant_request_id IS NULL`, [
      status,
      inspectionId,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบผลตรวจห้อง" });
    }
    await moveOutInspectionSaved(inspectionId, actorOf(req.user, await getActingAdminName(pool, req.user)));
    return res.json({ message: "เปลี่ยนสถานะผลตรวจสำเร็จ" });
  } catch (error) {
    console.error("Update move-out inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/move-out-inspections/:id", async (req, res) => {
  try {
    const inspectionId = Number(req.params.id);
    if (!isPositiveId(inspectionId)) {
      return res.status(400).json({ message: "รหัสผลตรวจไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [rows] = await pool.query(`SELECT photos FROM MoveOutInspection WHERE id = ? AND hidden_at IS NULL`, [inspectionId]);
    if (!rows[0]) {
      return res.status(404).json({ message: "ไม่พบผลตรวจห้อง" });
    }
    const adminName = await getActingAdminName(pool, req.user);
    await pool.query(
      `UPDATE MoveOutInspection
       SET hidden_at = NOW(), hidden_by_name = ?, hidden_tenant_request_id = tenant_request_id, tenant_request_id = NULL
       WHERE id = ? AND hidden_at IS NULL`,
      [adminName, inspectionId],
    );
    return res.json({ message: "ลบผลตรวจห้องสำเร็จ" });
  } catch (error) {
    console.error("Delete move-out inspection error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/room-types", async (_req, res) => {
  try {
    const pool = getPool();
    const [types] = await pool.query("SELECT id, name, description, assets, updated_at, created_at FROM RoomType ORDER BY name ASC");
    const [rooms] = await pool.query("SELECT room_number, room_type_id FROM Room WHERE room_type_id IS NOT NULL ORDER BY room_number ASC");
    return res.json({
      roomTypes: types.map((type) => ({
        ...type,
        assets: JSON.parse(type.assets),
        room_numbers: rooms.filter((room) => room.room_type_id === type.id).map((room) => room.room_number),
      })),
    });
  } catch (error) {
    console.error("Fetch room types error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

async function saveRoomType(pool, roomTypeId, value) {
  if (value.roomNumbers.length > 0) {
    const [found] = await pool.query("SELECT room_number FROM Room WHERE room_number IN (?)", [value.roomNumbers]);
    if (found.length !== value.roomNumbers.length) return { status: 400, message: "มีห้องที่เลือกไม่อยู่ในระบบ" };
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let id = roomTypeId;
    if (id) {
      const [result] = await connection.query(
        "UPDATE RoomType SET name = ?, description = ?, assets = ?, updated_at = NOW() WHERE id = ?",
        [value.name, value.description, JSON.stringify(value.assets), id],
      );
      if (result.affectedRows === 0) {
        await connection.rollback();
        return { status: 404, message: "ไม่พบประเภทห้อง" };
      }
    } else {
      const [result] = await connection.query(
        "INSERT INTO RoomType (name, description, assets) VALUES (?, ?, ?)",
        [value.name, value.description, JSON.stringify(value.assets)],
      );
      id = result.insertId;
    }
    await connection.query("UPDATE Room SET room_type_id = NULL WHERE room_type_id = ?", [id]);
    if (value.roomNumbers.length > 0) {
      await connection.query("UPDATE Room SET room_type_id = ? WHERE room_number IN (?)", [id, value.roomNumbers]);
    }
    await connection.commit();
    return { id };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return { status: 409, message: "มีชื่อประเภทห้องนี้แล้ว" };
    throw error;
  } finally {
    connection.release();
  }
}

router.post("/room-types", async (req, res) => {
  try {
    const { error, value } = parseRoomTypeInput(req.body ?? {});
    if (error) return res.status(400).json({ message: error });
    const result = await saveRoomType(getPool(), null, value);
    if (result.status) return res.status(result.status).json({ message: result.message });
    return res.status(201).json({ message: "เพิ่มประเภทห้องสำเร็จ", roomTypeId: result.id });
  } catch (error) {
    console.error("Create room type error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.put("/room-types/:id", async (req, res) => {
  try {
    const roomTypeId = Number(req.params.id);
    if (!isPositiveId(roomTypeId)) return res.status(400).json({ message: "รหัสประเภทห้องไม่ถูกต้อง" });
    const { error, value } = parseRoomTypeInput(req.body ?? {});
    if (error) return res.status(400).json({ message: error });
    const result = await saveRoomType(getPool(), roomTypeId, value);
    if (result.status) return res.status(result.status).json({ message: result.message });
    return res.json({ message: "แก้ไขประเภทห้องสำเร็จ" });
  } catch (error) {
    console.error("Update room type error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/room-types/:id", async (req, res) => {
  const roomTypeId = Number(req.params.id);
  if (!isPositiveId(roomTypeId)) return res.status(400).json({ message: "รหัสประเภทห้องไม่ถูกต้อง" });
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("UPDATE Room SET room_type_id = NULL WHERE room_type_id = ?", [roomTypeId]);
    const [result] = await connection.query("DELETE FROM RoomType WHERE id = ?", [roomTypeId]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบประเภทห้อง" });
    }
    await connection.commit();
    return res.json({ message: "ลบประเภทห้องสำเร็จ" });
  } catch (error) {
    await connection.rollback();
    console.error("Delete room type error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection.release();
  }
});

router.get("/rooms", async (req, res) => {
  try {
    const pool = getPool();
    const [rooms] = await pool.query(
      `SELECT
         r.id, r.room_number, r.is_booked, r.price, r.room_size,
         r.air_conditioner, r.wifi, r.refrigerator, r.bed, r.bathroom, r.cctv, r.custom_amenities,
         r.electricity_unit_price, r.water_unit_price, r.water_price,
         r.rental_duration_months, r.rental_start_date, r.rental_end_date,
         r.room_type_id, rt.name AS room_type_name, r.assets AS room_assets, rt.assets AS type_assets,
         c.id AS customer_id, c.first_name, c.last_name, c.phone
       FROM Room r
       LEFT JOIN RoomType rt ON rt.id = r.room_type_id
       LEFT JOIN Customer c ON c.id = (
         SELECT c2.id FROM Customer c2
         WHERE c2.room_number = r.room_number AND c2.is_suspended = FALSE
         ORDER BY c2.id DESC
         LIMIT 1
       )
       ORDER BY r.room_number ASC`,
    );
    return res.json({
      rooms: rooms.map(({ room_assets, type_assets, ...room }) => ({ ...room, assets: effectiveRoomAssets(room_assets, type_assets) })),
    });
  } catch (error) {
    console.error("Admin fetch rooms error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.put("/rooms/:room_number/assets", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }
    const body = req.body ?? {};
    const { error, value } = parseRoomAssetsInput(body);
    if (error) return res.status(400).json({ message: error });
    const amenityBody = Object.fromEntries(
      ["air_conditioner", "refrigerator", "custom_amenities"].filter((field) => hasField(body, field)).map((field) => [field, body[field]]),
    );
    const amenityError = validateRoomFields(amenityBody);
    if (amenityError) return res.status(400).json({ message: amenityError });
    const pool = getPool();
    if (value.roomTypeId !== null) {
      const [types] = await pool.query("SELECT id FROM RoomType WHERE id = ?", [value.roomTypeId]);
      if (!types[0]) return res.status(400).json({ message: "ไม่พบประเภทห้องที่เลือก" });
    }
    const { columns, values } = buildUpdate(["air_conditioner", "refrigerator", "custom_amenities"], {
      ...amenityBody,
      ...(hasField(amenityBody, "air_conditioner") ? { air_conditioner: Boolean(amenityBody.air_conditioner) } : {}),
      ...(hasField(amenityBody, "refrigerator") ? { refrigerator: Boolean(amenityBody.refrigerator) } : {}),
      ...(hasField(amenityBody, "custom_amenities")
        ? { custom_amenities: JSON.stringify(amenityBody.custom_amenities.map(normalizeRoomAmenity)) }
        : {}),
    });
    const [result] = await pool.query(
      `UPDATE Room SET ${[...columns, "room_type_id = ?", "assets = ?"].join(", ")} WHERE room_number = ?`,
      [...values, value.roomTypeId, JSON.stringify(value.assets), roomNumberValue],
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    return res.json({ message: "บันทึกอุปกรณ์และทรัพย์สินในห้องสำเร็จ" });
  } catch (error) {
    console.error("Admin update room assets error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/:room_number/detail", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [roomRows] = await pool.query(
      `SELECT id, room_number, is_booked, price, room_size,
         air_conditioner, wifi, refrigerator, bed, bathroom, cctv, custom_amenities,
         electricity_unit_price, water_unit_price, water_price,
         rental_duration_months, rental_start_date, rental_end_date,
         prepaid_until, pending_lump_sum_months, created_at
       FROM Room WHERE room_number = ?`,
      [roomNumberValue],
    );
    const room = roomRows[0];
    if (!room) {
      return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    }

    const [tenantRows] = await pool.query(
      `SELECT id, first_name, last_name, phone, age, deposit_amount, created_at
       FROM Customer
       WHERE room_number = ? AND is_suspended = FALSE
       ORDER BY id DESC LIMIT 1`,
      [roomNumberValue],
    );
    const tenant = tenantRows[0] ?? null;

    const [history] = await pool.query(
      `SELECT b.id AS booking_id, b.created_at, b.rental_start_date, b.rental_end_date,
         c.id AS customer_id, c.first_name, c.last_name, c.phone
       FROM Booking b
       JOIN Customer c ON c.id = b.customer_id
       WHERE b.room_id = ?
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT 6`,
      [room.id],
    );

    let payments = [];
    const currentBooking = tenant ? history.find((booking) => booking.customer_id === tenant.id) : null;
    if (currentBooking) {
      [payments] = await pool.query(
        `SELECT id, booking_id, amount, payment_date, status, type, note, slip_path, created_at
         FROM Payment WHERE booking_id = ?
         ORDER BY payment_date DESC, created_at DESC LIMIT 6`,
        [currentBooking.booking_id],
      );
    }

    const [maintenanceCounts] = await pool.query(
      `SELECT status, COUNT(*) AS count FROM MaintenanceRequest WHERE room_number = ? GROUP BY status`,
      [roomNumberValue],
    );
    const [maintenance] = await pool.query(
      `SELECT id, category, description, status, created_at, completed_at
       FROM MaintenanceRequest WHERE room_number = ?
       ORDER BY created_at DESC LIMIT 5`,
      [roomNumberValue],
    );

    const [parcelRows] = await pool.query(
      `SELECT
         SUM(status = 'pending') AS pending,
         COUNT(*) AS total
       FROM Parcel WHERE room_number = ?`,
      [roomNumberValue],
    );

    const [inspectionRows] = await pool.query(
      `SELECT id, tenant_name, status, inspected_by_name, created_at
       FROM MoveOutInspection WHERE room_number = ? AND hidden_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [roomNumberValue],
    );

    const contracts = tenant ? await loadCustomerContracts(pool, [tenant.id]) : new Map();

    return res.json({
      room,
      tenant,
      contract: tenant ? contracts.get(tenant.id) ?? null : null,
      payments,
      history,
      maintenance,
      maintenanceCounts: Object.fromEntries(maintenanceCounts.map((row) => [row.status, Number(row.count)])),
      parcels: { pending: Number(parcelRows[0]?.pending ?? 0), total: Number(parcelRows[0]?.total ?? 0) },
      lastInspection: inspectionRows[0] ?? null,
    });
  } catch (error) {
    console.error("Admin fetch room detail error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/:room_number/maintenance", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [requests] = await pool.query(
      `SELECT mr.id, mr.description, mr.category, mr.contact_phone, mr.preferred_time, mr.status, mr.created_at,
              mr.accepted_at, mr.accepted_by_name, mr.completed_at, mr.completed_by_name,
              mr.room_number, mr.customer_id, c.first_name, c.last_name, c.phone
       FROM MaintenanceRequest mr
       JOIN Customer c ON c.id = mr.customer_id
       WHERE mr.room_number = ?
       ORDER BY mr.created_at DESC, mr.id DESC`,
      [roomNumberValue],
    );

    return res.json({ requests: await attachMaintenancePhotos(pool, requests) });
  } catch (error) {
    console.error("Admin fetch room maintenance error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/:room_number/tenants", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [roomRows] = await pool.query(`SELECT id FROM Room WHERE room_number = ?`, [roomNumberValue]);
    if (!roomRows[0]) {
      return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    }

    const [bookings] = await pool.query(
      `SELECT b.id AS booking_id, b.created_at, b.rental_start_date, b.rental_end_date,
         c.id AS customer_id, c.first_name, c.last_name, c.phone, c.age, c.deposit_amount,
         c.is_suspended, c.room_number AS current_room_number, c.created_at AS registered_at
       FROM Booking b
       JOIN Customer c ON c.id = b.customer_id
       WHERE b.room_id = ?
       ORDER BY b.created_at DESC, b.id DESC`,
      [roomRows[0].id],
    );

    if (bookings.length === 0) {
      return res.json({ tenants: [] });
    }

    const bookingIds = bookings.map((booking) => booking.booking_id);
    const customerIds = [...new Set(bookings.map((booking) => booking.customer_id))];

    const [paymentRows] = await pool.query(
      `SELECT booking_id, status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total, MAX(payment_date) AS last_date
       FROM Payment WHERE booking_id IN (?)
       GROUP BY booking_id, status`,
      [bookingIds],
    );

    const [maintenanceRows] = await pool.query(
      `SELECT customer_id, COUNT(*) AS total, SUM(status IN ('pending', 'in_progress')) AS open_count
       FROM MaintenanceRequest
       WHERE room_number = ? AND customer_id IN (?)
       GROUP BY customer_id`,
      [roomNumberValue, customerIds],
    );

    const [requestRows] = await pool.query(
      `SELECT tr.id, tr.customer_id, tr.type, tr.status, tr.target_room_number, tr.preferred_move_date,
         tr.created_at, tr.completed_at, mi.status AS inspection_status
       FROM TenantRequest tr
       LEFT JOIN MoveOutInspection mi ON mi.tenant_request_id = tr.id
       WHERE tr.room_number = ? AND tr.customer_id IN (?) AND tr.type IN ('moveout', 'move_room')
       ORDER BY tr.created_at DESC, tr.id DESC`,
      [roomNumberValue, customerIds],
    );

    const latestBookingByCustomer = new Map();
    for (const booking of bookings) {
      if (!latestBookingByCustomer.has(booking.customer_id)) latestBookingByCustomer.set(booking.customer_id, booking.booking_id);
    }

    const contracts = await loadCustomerContracts(pool, customerIds);
    const contractSummary = (customerId) => {
      const contract = contracts.get(customerId);
      if (!contract) return null;
      return {
        status: contract.status,
        rental_end_date: contract.rental_end_date,
        effective_end_date: contract.effective_end_date,
        monthly_price: contract.monthly_price,
        deposit_amount: contract.deposit_amount,
        deposit_months: contract.deposit_months,
        deposit_status: contract.deposit_status,
        deposit_paid: contract.deposit_paid,
        deposit_refund: contract.deposit_refund,
        first_month_total: contract.first_month_total,
        contract_remaining: contract.contract_remaining,
      };
    };

    const tenants = bookings.map((booking) => {
      const payments = { paid: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, overdue: { count: 0, total: 0 } };
      let lastPaymentDate = null;
      for (const row of paymentRows) {
        if (row.booking_id !== booking.booking_id) continue;
        if (payments[row.status]) payments[row.status] = { count: Number(row.count), total: Number(row.total) };
        if (row.last_date && (!lastPaymentDate || new Date(row.last_date) > new Date(lastPaymentDate))) lastPaymentDate = row.last_date;
      }
      const maintenance = maintenanceRows.find((row) => row.customer_id === booking.customer_id);
      const lastRequest = requestRows.find((row) => row.customer_id === booking.customer_id) || null;
      const isCurrent =
        !booking.is_suspended &&
        booking.current_room_number === roomNumberValue &&
        latestBookingByCustomer.get(booking.customer_id) === booking.booking_id;

      return {
        ...booking,
        is_current: isCurrent,
        contract: contractSummary(booking.customer_id),
        payments,
        last_payment_date: lastPaymentDate,
        maintenance: { total: Number(maintenance?.total ?? 0), open: Number(maintenance?.open_count ?? 0) },
        last_request: lastRequest,
      };
    });

    return res.json({ tenants });
  } catch (error) {
    console.error("Admin fetch room tenants error:", error);
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
      `SELECT b.id AS booking_id, b.created_at, cu.id AS customer_id, cu.first_name, cu.last_name
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
    console.error("Admin fetch room history error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/rooms", async (req, res) => {
  try {
    const {
      room_number,
      price,
      room_size = null,
      air_conditioner = false,
      wifi = false,
      refrigerator = false,
      bed = 0,
      bathroom = false,
      cctv = false,
      custom_amenities = [],
      electricity_unit_price = 8.0,
      water_unit_price = 100.0,
      water_price = 100.0,
    } = req.body ?? {};

    const validationError = validateRoomFields({
      room_number,
      price,
      room_size,
      air_conditioner,
      wifi,
      refrigerator,
      bed,
      bathroom,
      cctv,
      custom_amenities,
      electricity_unit_price,
      water_unit_price,
      water_price,
    });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO Room (room_number, price, room_size, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, custom_amenities, electricity_unit_price, water_unit_price, water_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(room_number),
        Number(price),
        room_size === null || room_size === "" ? null : Number(room_size),
        Boolean(air_conditioner),
        Boolean(wifi),
        Boolean(refrigerator),
        Number(bed),
        Boolean(bathroom),
        Boolean(cctv),
        JSON.stringify(custom_amenities.map(normalizeRoomAmenity)),
        Number(electricity_unit_price),
        Number(water_unit_price),
        Number(water_price),
      ],
    );

    return res.status(201).json({ message: "สร้างห้องพักสำเร็จ", roomId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เลขห้องนี้มีอยู่แล้ว" });
    }
    console.error("Admin create room error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const ROOM_EDITABLE_COLUMNS = [
  "room_number",
  "price",
  "room_size",
  "air_conditioner",
  "wifi",
  "refrigerator",
  "bed",
  "bathroom",
  "cctv",
  "custom_amenities",
  "electricity_unit_price",
  "water_unit_price",
  "water_price",
];

router.put("/rooms/:room_number", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const body = req.body ?? {};
    const validationError = validateRoomFields(body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const amenityBody = hasField(body, "custom_amenities")
      ? { ...body, custom_amenities: JSON.stringify(body.custom_amenities.map(normalizeRoomAmenity)) }
      : body;
    const normalizedBody = hasField(amenityBody, "room_size")
      ? { ...amenityBody, room_size: amenityBody.room_size === null || amenityBody.room_size === "" ? null : Number(amenityBody.room_size) }
      : amenityBody;
    const { columns, values } = buildUpdate(ROOM_EDITABLE_COLUMNS, normalizedBody);
    if (columns.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const pool = getPool();
    if (hasField(body, "room_number") && Number(body.room_number) !== roomNumberValue) {
      if (await roomHeldForTransfer(pool, roomNumberValue, { anyRequest: true })) {
        return res.status(409).json({ message: "ห้องนี้มีผู้เช่ารอย้ายเข้าอยู่ ยังเปลี่ยนเลขห้องไม่ได้" });
      }
    }
    const [result] = await pool.query(`UPDATE Room SET ${columns.join(", ")} WHERE room_number = ? AND is_booked = FALSE`, [
      ...values,
      roomNumberValue,
    ]);
    if (result.affectedRows === 0) {
      const [roomRows] = await pool.query("SELECT is_booked FROM Room WHERE room_number = ?", [roomNumberValue]);
      if (roomRows[0]?.is_booked) {
        return res.status(409).json({ message: "ไม่สามารถแก้ไขห้องที่มีผู้เช่าอยู่ได้" });
      }
      return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    }

    return res.json({ message: "แก้ไขข้อมูลห้องพักสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เลขห้องนี้มีอยู่แล้ว" });
    }
    console.error("Admin update room error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/rooms/:room_number", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [roomRows] = await pool.query(`SELECT is_booked FROM Room WHERE room_number = ?`, [roomNumberValue]);
    const room = roomRows[0];
    if (!room) {
      return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    }
    if (room.is_booked) {
      return res.status(409).json({ message: "ไม่สามารถลบห้องพักที่มีผู้เช่าอยู่ได้" });
    }

    await pool.query(`DELETE FROM Room WHERE room_number = ?`, [roomNumberValue]);
    return res.json({ message: "ลบห้องพักสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED") {
      return res.status(409).json({ message: "ไม่สามารถลบห้องพักนี้ได้เนื่องจากมีประวัติผู้เช่าอ้างอิงอยู่" });
    }
    console.error("Admin delete room error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/staff", async (req, res) => {
  try {
    const pool = getPool();
    const [staff] = await pool.query(
      `SELECT id, role, idcard, first_name, last_name, phone, age, is_suspended, created_at
       FROM Staff ORDER BY is_suspended ASC, id ASC`,
    );
    return res.json({ staff });
  } catch (error) {
    console.error("Admin fetch staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/staff", async (req, res) => {
  try {
    const { idcard, password, phone, first_name, last_name, age } = req.body ?? {};

    const validationError = validatePersonInput({ idcard, password, phone, first_name, last_name, age });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO Staff (idcard, password, phone, first_name, last_name, age) VALUES (?, ?, ?, ?, ?, ?)`,
      [idcard.trim(), hashedPassword, phone.trim(), first_name.trim(), last_name.trim(), Number(age)],
    );

    await staffAccountChanged({ role: "Staff", id: result.insertId }, "created", req.user);
    return res.status(201).json({ message: "เพิ่มพนักงานสำเร็จ", staffId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      if (error.sqlMessage?.includes("idcard")) {
        return res.status(409).json({ message: "เลขบัตรประชาชนนี้มีอยู่แล้ว" });
      }
      if (error.sqlMessage?.includes("phone")) {
        return res.status(409).json({ message: "เบอร์โทรศัพท์นี้มีอยู่แล้ว" });
      }
    }
    console.error("Admin create staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const STAFF_EDITABLE_COLUMNS = ["first_name", "last_name", "phone", "age"];

router.put("/staff/:id", async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (!isPositiveId(staffId)) {
      return res.status(400).json({ message: "รหัสพนักงานไม่ถูกต้อง" });
    }

    const body = req.body ?? {};
    const validationError = validatePersonUpdateInput(body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const { columns, values } = buildUpdate(STAFF_EDITABLE_COLUMNS, normalizePersonUpdate(body));

    if (typeof body.password === "string" && body.password) {
      columns.push("password = ?");
      values.push(await bcrypt.hash(body.password, 10));
    }

    if (columns.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE Staff SET ${columns.join(", ")} WHERE id = ?`, [...values, staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    await staffAccountChanged({ role: "Staff", id: staffId }, "updated", req.user);
    return res.json({ message: "แก้ไขข้อมูลพนักงานสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เบอร์โทรศัพท์นี้มีอยู่แล้ว" });
    }
    console.error("Admin update staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/staff/:id/suspend", async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (!isPositiveId(staffId)) {
      return res.status(400).json({ message: "รหัสพนักงานไม่ถูกต้อง" });
    }
    const { is_suspended } = req.body ?? {};
    if (typeof is_suspended !== "boolean") {
      return res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE Staff SET is_suspended = ? WHERE id = ?`, [is_suspended, staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    await staffAccountChanged({ role: "Staff", id: staffId }, is_suspended ? "suspended" : "unsuspended", req.user);
    return res.json({ message: is_suspended ? "ระงับการใช้งานพนักงานสำเร็จ" : "เปิดการใช้งานพนักงานสำเร็จ" });
  } catch (error) {
    console.error("Admin suspend staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/staff/:id", async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (!isPositiveId(staffId)) {
      return res.status(400).json({ message: "รหัสพนักงานไม่ถูกต้อง" });
    }

    const pool = getPool();
    await staffAccountChanged({ role: "Staff", id: staffId }, "deleted", req.user);
    const [result] = await pool.query(`DELETE FROM Staff WHERE id = ?`, [staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    return res.json({ message: "ลบพนักงานสำเร็จ" });
  } catch (error) {
    console.error("Admin delete staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/customers", async (req, res) => {
  try {
    const pool = getPool();
    const search = parseSearch(req.query.search);

    const conditions = [];
    const params = [];
    if (search) {
      conditions.push(
        `(CAST(c.room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR c.phone LIKE ? OR c.idcard LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [customers] = await pool.query(
      `SELECT c.id, c.idcard, c.first_name, c.last_name, c.phone, c.age, c.is_suspended,
              c.room_number, c.deposit_amount, c.created_at AS registered_at,
              r.rental_start_date, r.rental_end_date, r.price
       FROM Customer c
       LEFT JOIN Room r ON r.room_number = c.room_number
       ${whereClause}
       ORDER BY c.is_suspended ASC, c.room_number ASC`,
      params,
    );

    const contracts = await loadCustomerContracts(pool, customers.map((customer) => customer.id), { currentOnly: true });
    return res.json({
      customers: customers.map((customer) => ({
        ...customer,
        deposit_amount: customer.room_number != null ? customer.deposit_amount : null,
        contract: contracts.get(customer.id) ?? null,
      })),
    });
  } catch (error) {
    console.error("Admin fetch customers error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/customers/:id", async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!isPositiveId(customerId)) {
      return res.status(400).json({ message: "รหัสลูกค้าไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [customerRows] = await pool.query(
      `SELECT id, idcard, first_name, last_name, phone, age, is_suspended, room_number, deposit_amount, created_at AS registered_at
       FROM Customer WHERE id = ?`,
      [customerId],
    );
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบลูกค้านี้" });
    }
    if (customer.room_number == null) customer.deposit_amount = null;

    const [bookings] = await pool.query(
      `SELECT b.id AS booking_id, r.room_number, b.created_at, b.rental_start_date, b.rental_end_date
       FROM Booking b
       LEFT JOIN Room r ON r.id = b.room_id
       WHERE b.customer_id = ?
       ORDER BY b.created_at DESC, b.id DESC`,
      [customerId],
    );

    const bookingIds = bookings.map((booking) => booking.booking_id);
    let payments = [];
    if (bookingIds.length > 0) {
      [payments] = await pool.query(
        `SELECT id, booking_id, amount, payment_date, status, type, note, slip_path, created_at
         FROM Payment WHERE booking_id IN (?) ORDER BY payment_date DESC, created_at DESC`,
        [bookingIds],
      );
    }

    const rentalHistory = bookings.map((booking) => ({
      ...booking,
      payments: payments.filter((payment) => payment.booking_id === booking.booking_id),
    }));

    const contracts = await loadCustomerContracts(pool, [customerId], { currentOnly: true });
    return res.json({ customer, rentalHistory, contract: contracts.get(customerId) ?? null });
  } catch (error) {
    console.error("Admin fetch customer detail error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const CUSTOMER_EDITABLE_COLUMNS = ["first_name", "last_name", "phone", "age"];

router.put("/customers/:id", async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!isPositiveId(customerId)) {
      return res.status(400).json({ message: "รหัสลูกค้าไม่ถูกต้อง" });
    }

    const body = req.body ?? {};
    const validationError = validatePersonUpdateInput(body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    if (hasField(body, "deposit_amount")) {
      return res.status(400).json({ message: "เงินมัดจำกำหนดตามสัญญาเช่า ไม่สามารถแก้ไขได้" });
    }

    const normalizedBody = normalizePersonUpdate(body);

    const pool = getPool();
    const [roomRows] = await pool.query(`SELECT room_number FROM Customer WHERE id = ?`, [customerId]);
    if (!roomRows.length) {
      return res.status(404).json({ message: "ไม่พบลูกค้านี้" });
    }

    const { columns, values } = buildUpdate(CUSTOMER_EDITABLE_COLUMNS, normalizedBody);
    if (typeof body.password === "string" && body.password) {
      columns.push("password = ?");
      values.push(await bcrypt.hash(body.password, 10));
    }
    if (columns.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const [result] = await pool.query(`UPDATE Customer SET ${columns.join(", ")} WHERE id = ?`, [
      ...values,
      customerId,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบลูกค้านี้" });
    }

    return res.json({ message: "แก้ไขข้อมูลลูกค้าสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เบอร์โทรศัพท์นี้มีอยู่แล้ว" });
    }
    console.error("Admin update customer error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/customers/:id/suspend", async (req, res) => {
  let connection;
  try {
    const customerId = Number(req.params.id);
    if (!isPositiveId(customerId)) {
      return res.status(400).json({ message: "รหัสลูกค้าไม่ถูกต้อง" });
    }
    const { is_suspended } = req.body ?? {};
    if (typeof is_suspended !== "boolean") {
      return res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [customers] = await connection.query(
      `SELECT room_number, is_suspended FROM Customer WHERE id = ? FOR UPDATE`,
      [customerId],
    );
    if (!customers.length) {
      await connection.rollback();
      return res.status(404).json({ message: "ไม่พบลูกค้านี้" });
    }

    const roomNumber = customers[0].room_number;
    const wasSuspended = Boolean(customers[0].is_suspended);
    let roomVacated = false;
    if (roomNumber != null && (is_suspended || wasSuspended)) {
      const [rooms] = await connection.query(
        `SELECT id, rental_start_date, rental_end_date FROM Room WHERE room_number = ? FOR UPDATE`,
        [roomNumber],
      );
      const [otherTenants] = await connection.query(
        `SELECT id FROM Customer WHERE room_number = ? AND id <> ? AND is_suspended = FALSE LIMIT 1 FOR UPDATE`,
        [roomNumber, customerId],
      );
      if (!otherTenants.length && rooms.length) {
        const [bookings] = await connection.query(
          `SELECT id, room_id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
          [customerId],
        );
        if (bookings[0]?.room_id === rooms[0].id) {
          await connection.query(
            `UPDATE Booking SET rental_start_date = COALESCE(?, rental_start_date),
                                rental_end_date = COALESCE(?, rental_end_date) WHERE id = ?`,
            [rooms[0].rental_start_date, rooms[0].rental_end_date, bookings[0].id],
          );
        }
      }

      if (!otherTenants.length) {
        const [roomUpdate] = await connection.query(
          `UPDATE Room SET is_booked = FALSE, rental_start_date = NULL, rental_end_date = NULL,
                           rental_duration_months = NULL, prepaid_until = NULL, billing_start_date = NULL,
                           pending_lump_sum_months = NULL, rent_credit = NULL
           WHERE room_number = ?`,
          [roomNumber],
        );
        roomVacated = roomUpdate.affectedRows > 0;
      }
    }

    if (is_suspended && !wasSuspended) await resetCustomerHistory(connection, customerId);
    await connection.query(
      is_suspended || wasSuspended
        ? `UPDATE Customer SET is_suspended = ?, suspended_at = IF(?, COALESCE(suspended_at, NOW()), NULL),
                              room_number = NULL WHERE id = ?`
        : `UPDATE Customer SET is_suspended = ?, suspended_at = IF(?, NOW(), NULL) WHERE id = ?`,
      [is_suspended, Boolean(is_suspended), customerId],
    );
    await cancelStaleTenantRequests(connection, customerId, is_suspended || wasSuspended ? null : roomNumber);
    if (is_suspended || wasSuspended) {
      await connection.query(
        `UPDATE ResidentVisitRequest
         SET status = 'cancelled', cancelled_by_name = 'ระบบ (ระงับผู้เช่า)', cancelled_at = NOW()
         WHERE customer_id = ? AND (status = 'pending'
           OR (status = 'approved' AND (end_at IS NULL OR end_at > NOW())))`,
        [customerId],
      );
      await connection.query(
        `UPDATE SafetyIncident
         SET status = 'cancelled', cancelled_by_name = 'ระบบ (ระงับผู้เช่า)',
             cancelled_at = NOW(), cancel_reason = 'ผู้แจ้งเหตุถูกระงับการใช้งาน'
         WHERE reporter_role = 'Customer' AND reporter_id = ? AND status = 'pending'`,
        [customerId],
      );
      await connection.query(
        `UPDATE MaintenanceRequest
         SET status = 'cancelled', completed_at = NOW(), completed_by_name = 'ระบบ (ระงับผู้เช่า)'
         WHERE customer_id = ? AND status IN ('pending', 'in_progress')`,
        [customerId],
      );
    }
    await connection.commit();
    const message = is_suspended
      ? roomNumber != null
        ? roomVacated
          ? `ระงับการใช้งานลูกค้าและปล่อยห้อง ${roomNumber} เป็นว่างแล้ว`
          : `ระงับการใช้งานลูกค้าและนำออกจากห้อง ${roomNumber} แล้ว`
        : "ระงับการใช้งานลูกค้าสำเร็จ"
      : roomNumber != null && wasSuspended
        ? `เปิดการใช้งานลูกค้าสำเร็จ โดยไม่คืนห้อง ${roomNumber} ให้บัญชีนี้`
        : "เปิดการใช้งานลูกค้าสำเร็จ";
    return res.json({
      message,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Admin suspend customer error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection?.release();
  }
});

const LOG_PAGE_SIZE = 20;

router.get("/logs/requests", async (req, res) => {
  try {
    const pool = getPool();
    const page = parsePage(req.query.page);
    const offset = (page - 1) * LOG_PAGE_SIZE;

    const conditions = [];
    const params = [];

    if (["pending", "in_progress", "approved", "rejected", "cancelled"].includes(req.query.status)) {
      conditions.push(`tr.status = ?`);
      params.push(req.query.status);
    }
    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(
        `(CAST(tr.room_number AS CHAR) LIKE ? OR CAST(tr.target_room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR tr.accepted_by_name LIKE ? OR tr.completed_by_name LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM TenantRequest tr JOIN Customer c ON c.id = tr.customer_id ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const [requests] = await pool.query(
      `SELECT tr.id, tr.type, tr.note, tr.renew_duration_months, tr.renew_payment_type, tr.status, tr.created_at,
              tr.accepted_at, tr.accepted_by_name, tr.completed_at, tr.completed_by_name, tr.reject_reason,
              tr.room_number, tr.target_room_number, tr.move_reason,
              DATE_FORMAT(tr.preferred_move_date, '%Y-%m-%d') AS preferred_move_date,
              c.first_name, c.last_name, c.phone, c.deposit_amount,
              sr.price AS source_room_price, tg.price AS target_room_price,
              moi.id AS inspection_id, moi.status AS inspection_status
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       LEFT JOIN Room sr ON sr.room_number = tr.room_number
       LEFT JOIN Room tg ON tg.room_number = tr.target_room_number
       LEFT JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
       ${whereClause}
       ORDER BY tr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, req.query.all === "1" ? 5000 : LOG_PAGE_SIZE, req.query.all === "1" ? 0 : offset],
    );

    return res.json({ requests, total, page, pageSize: LOG_PAGE_SIZE });
  } catch (error) {
    console.error("Admin fetch tenant request log error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/logs/maintenance", async (req, res) => {
  try {
    const pool = getPool();
    const page = parsePage(req.query.page);
    const offset = (page - 1) * LOG_PAGE_SIZE;

    const conditions = [];
    const params = [];

    if (["pending", "in_progress", "done", "cancelled"].includes(req.query.status)) {
      conditions.push(`mr.status = ?`);
      params.push(req.query.status);
    }
    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(
        `(CAST(mr.room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR mr.accepted_by_name LIKE ? OR mr.completed_by_name LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM MaintenanceRequest mr JOIN Customer c ON c.id = mr.customer_id ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const [requests] = await pool.query(
      `SELECT mr.id, mr.description, mr.category, mr.contact_phone, mr.preferred_time, mr.status, mr.created_at,
              mr.accepted_at, mr.accepted_by_name, mr.completed_at, mr.completed_by_name,
              mr.room_number, c.first_name, c.last_name, c.phone
       FROM MaintenanceRequest mr
       JOIN Customer c ON c.id = mr.customer_id
       ${whereClause}
       ORDER BY mr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, req.query.all === "1" ? 5000 : LOG_PAGE_SIZE, req.query.all === "1" ? 0 : offset],
    );

    return res.json({ requests: await attachMaintenancePhotos(pool, requests), total, page, pageSize: LOG_PAGE_SIZE });
  } catch (error) {
    console.error("Admin fetch maintenance request log error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/logs/moveouts", async (req, res) => {
  try {
    const pool = getPool();
    const page = parsePage(req.query.page);
    const offset = (page - 1) * LOG_PAGE_SIZE;

    const conditions = ["tr.type = 'moveout'", "tr.status = 'approved'"];
    const params = [];

    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(
        `(CAST(tr.room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR c.idcard LIKE ? OR c.phone LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM TenantRequest tr JOIN Customer c ON c.id = tr.customer_id ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const loadAll = req.query.all === "1";
    const [moveouts] = await pool.query(
      `SELECT tr.id, tr.note, tr.created_at, tr.completed_at, tr.completed_by_name, tr.move_in_date,
              tr.room_number, c.idcard, c.first_name, c.last_name, c.phone
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       ${whereClause}
       ORDER BY tr.completed_at DESC
       LIMIT ? OFFSET ?`,
      [...params, loadAll ? 5000 : LOG_PAGE_SIZE, loadAll ? 0 : offset],
    );

    return res.json({ moveouts, total, page, pageSize: LOG_PAGE_SIZE });
  } catch (error) {
    console.error("Admin fetch moveout log error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/moveouts/:id", async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT tr.id, tr.note, tr.status, tr.created_at, tr.accepted_at, tr.accepted_by_name,
              tr.completed_at, tr.completed_by_name, tr.move_in_date, tr.preferred_move_date, tr.move_reason,
              tr.room_number, tr.customer_id,
              c.idcard, c.first_name, c.last_name, c.phone, c.age, c.deposit_amount, c.created_at AS registered_at,
              r.price AS room_price
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       LEFT JOIN Room r ON r.room_number = tr.room_number
       WHERE tr.id = ? AND tr.type = 'moveout'`,
      [requestId],
    );
    const moveout = rows[0];
    if (!moveout) {
      return res.status(404).json({ message: "ไม่พบข้อมูลการย้ายออก" });
    }

    const [inspectionRows] = await pool.query(
      `SELECT id, status, damage_note, inspected_by_name, created_at, checklist, JSON_LENGTH(photos) AS photo_count
       FROM MoveOutInspection
       WHERE room_number = ? AND tenant_request_id IS NULL AND hidden_at IS NULL AND tenant_name = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [moveout.room_number, `${moveout.first_name} ${moveout.last_name}`],
    );
    const inspection = inspectionRows[0] ? { ...inspectionRows[0], checklist: JSON.parse(inspectionRows[0].checklist) } : null;

    const [paymentRows] = await pool.query(
      `SELECT p.status, COUNT(*) AS count, COALESCE(SUM(p.amount), 0) AS total
       FROM Payment p
       JOIN Booking b ON b.id = p.booking_id
       JOIN Room r ON r.id = b.room_id
       WHERE b.customer_id = ? AND r.room_number = ?
       GROUP BY p.status`,
      [moveout.customer_id, moveout.room_number],
    );
    const payments = { paid: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, overdue: { count: 0, total: 0 } };
    for (const row of paymentRows) {
      if (payments[row.status]) payments[row.status] = { count: Number(row.count), total: Number(row.total) };
    }

    const [paymentList] = await pool.query(
      `SELECT p.id, p.booking_id, p.amount, p.payment_date, p.status, p.type, p.note, p.slip_path, p.created_at
       FROM Payment p
       JOIN Booking b ON b.id = p.booking_id
       JOIN Room r ON r.id = b.room_id
       WHERE b.customer_id = ? AND r.room_number = ?
       ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC`,
      [moveout.customer_id, moveout.room_number],
    );

    const [maintenanceRows] = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status IN ('pending', 'in_progress')), 0) AS open_count
       FROM MaintenanceRequest WHERE customer_id = ? AND room_number = ?`,
      [moveout.customer_id, moveout.room_number],
    );

    return res.json({
      moveout,
      inspection,
      payments,
      paymentList,
      maintenance: { total: Number(maintenanceRows[0]?.total ?? 0), open: Number(maintenanceRows[0]?.open_count ?? 0) },
    });
  } catch (error) {
    console.error("Admin fetch moveout detail error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
