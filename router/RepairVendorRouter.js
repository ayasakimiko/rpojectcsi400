import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { getActingStaffName } from "../middleware/accounts.js";
import { actorOf } from "../middleware/notifications.js";
import { repairJobCancelled, repairJobEdited, repairJobSent, repairKeyChanged, repairVendorChanged } from "./repairNotifications.js";
import { decryptApiKey, hashApiKey } from "../middleware/marketApiKey.js";
import { generateRepairApiKey } from "../middleware/repairApiKey.js";
import { VENDOR_MAX_IMAGES, VENDOR_MIN_IMAGES, parseVendorImages, removeVendorFiles, vendorImagePath } from "../middleware/repairUploads.js";
import { validateText } from "../src/utils/validators.js";
import {
  JOB_STATUSES,
  OPEN_JOB_STATUSES,
  deliverWebhook,
  fail,
  loadJob,
  parseId,
  serializeVendor,
  validateJobInput,
  validateJobUpdate,
  validateVendorInput,
} from "./repairVendorShared.js";

const router = Router();
const MAX_KEYS_PER_VENDOR = 5;
const OVERVIEW_JOBS = 300;
const VENDOR_JOBS = 50;

router.use((req, res, next) => {
  if (req.user?.role !== "Owner") return next();
  if (req.method === "GET" && !/\/api-keys\/[^/]+\/reveal\/?$/.test(req.path)) return next();
  return res.status(403).json({ message: "เจ้าของหอดูข้อมูลได้อย่างเดียว การส่งงานและจัดการช่างทำได้เฉพาะพนักงานและแอดมิน", code: "READ_ONLY" });
});

async function actorName(req) {
  return (await getActingStaffName(getPool(), req.user)) || "เจ้าหน้าที่";
}

async function staffActor(req) {
  return actorOf(req.user, await actorName(req));
}

const toVendor = (row) => ({ ...serializeVendor(row), is_usable: Boolean(row.is_usable) });

async function loadVendor(db, vendorId) {
  const [[row]] = await db.query(
    `SELECT v.id, v.name, v.contact_name, v.phone, v.email, v.specialties, v.specialty_other, v.contract_type,
            DATE_FORMAT(v.contract_start, '%Y-%m-%d') AS contract_start, DATE_FORMAT(v.contract_end, '%Y-%m-%d') AS contract_end,
            v.contract_fee, v.webhook_url, v.note, v.is_active, v.created_by_name, v.updated_by_name, v.created_at, v.updated_at,
            (v.is_active = TRUE AND v.contract_start <= CURDATE() AND v.contract_end >= CURDATE()) AS is_usable,
            (SELECT COUNT(*) FROM RepairVendorApiKey k WHERE k.vendor_id = v.id AND k.revoked_at IS NULL) AS active_keys,
            (SELECT COUNT(*) FROM RepairJob j WHERE j.vendor_id = v.id AND j.status IN ('sent', 'accepted', 'in_progress')) AS open_jobs,
            (SELECT COUNT(*) FROM RepairJob j WHERE j.vendor_id = v.id) AS total_jobs,
            (SELECT COUNT(*) FROM RepairVendorImage i WHERE i.vendor_id = v.id) AS image_count
     FROM RepairVendor v
     WHERE v.id = ?`,
    [vendorId],
  );
  if (!row) throw fail("ไม่พบช่างรายนี้", 404, "NOT_FOUND");
  return toVendor(row);
}

async function loadVendors(db) {
  const [rows] = await db.query(
    `SELECT v.id, v.name, v.contact_name, v.phone, v.email, v.specialties, v.specialty_other, v.contract_type,
            DATE_FORMAT(v.contract_start, '%Y-%m-%d') AS contract_start, DATE_FORMAT(v.contract_end, '%Y-%m-%d') AS contract_end,
            v.contract_fee, v.webhook_url, v.note, v.is_active, v.created_by_name, v.updated_by_name, v.created_at, v.updated_at,
            (v.is_active = TRUE AND v.contract_start <= CURDATE() AND v.contract_end >= CURDATE()) AS is_usable,
            (SELECT COUNT(*) FROM RepairVendorApiKey k WHERE k.vendor_id = v.id AND k.revoked_at IS NULL) AS active_keys,
            (SELECT COUNT(*) FROM RepairJob j WHERE j.vendor_id = v.id AND j.status IN ('sent', 'accepted', 'in_progress')) AS open_jobs,
            (SELECT COUNT(*) FROM RepairJob j WHERE j.vendor_id = v.id) AS total_jobs,
            (SELECT COUNT(*) FROM RepairVendorImage i WHERE i.vendor_id = v.id) AS image_count
     FROM RepairVendor v
     ORDER BY v.is_active DESC, v.contract_end DESC, v.name`,
  );
  return rows.map(toVendor);
}

async function loadApiKeys(db, vendorId) {
  const [rows] = await db.query(
    `SELECT id, label, key_prefix, created_by_name, created_at, last_used_at, revoked_at, revoked_by_name,
            key_cipher IS NOT NULL AS can_reveal
     FROM RepairVendorApiKey
     WHERE vendor_id = ?
     ORDER BY revoked_at IS NOT NULL, created_at DESC`,
    [vendorId],
  );
  return rows.map((row) => ({ ...row, can_reveal: Boolean(row.can_reveal) }));
}

async function loadApiKey(db, keyId) {
  const [[row]] = await db.query(
    "SELECT id, vendor_id, label, key_hash, key_cipher, revoked_at FROM RepairVendorApiKey WHERE id = ?",
    [keyId],
  );
  if (!row) throw fail("ไม่พบ API key นี้", 404, "NOT_FOUND");
  return row;
}

router.get("/overview", async (req, res) => {
  const db = getPool();
  const [vendors, [jobs], [openRequests], [counts]] = await Promise.all([
    loadVendors(db),
    db.query(
      `SELECT j.*, v.name AS vendor_name, v.phone AS vendor_phone, v.contract_type AS vendor_contract_type, v.webhook_url IS NOT NULL AS vendor_has_webhook,
              mr.status AS request_status, mr.created_at AS request_created_at, mr.category AS request_category,
              (SELECT CONCAT(c.first_name, ' ', c.last_name) FROM Customer c WHERE c.room_number = j.room_number AND c.is_suspended = FALSE ORDER BY c.id DESC LIMIT 1) AS tenant_name,
              (SELECT c.phone FROM Customer c WHERE c.room_number = j.room_number AND c.is_suspended = FALSE ORDER BY c.id DESC LIMIT 1) AS tenant_phone
       FROM RepairJob j
       JOIN RepairVendor v ON v.id = j.vendor_id
       LEFT JOIN MaintenanceRequest mr ON mr.id = j.maintenance_request_id
       ORDER BY j.status IN ('sent', 'accepted', 'in_progress') DESC, j.created_at DESC
       LIMIT ?`,
      [OVERVIEW_JOBS],
    ),
    db.query(
      `SELECT mr.id, mr.room_number, mr.description, mr.category, mr.contact_phone, mr.preferred_time, mr.status, mr.created_at,
              c.first_name, c.last_name, c.phone
       FROM MaintenanceRequest mr
       JOIN Customer c ON c.id = mr.customer_id
       WHERE mr.status IN ('pending', 'in_progress')
         AND NOT EXISTS (SELECT 1 FROM RepairJob j WHERE j.maintenance_request_id = mr.id AND j.status IN ('sent', 'accepted', 'in_progress'))
       ORDER BY mr.created_at DESC
       LIMIT 100`,
    ),
    db.query("SELECT status, COUNT(*) AS count FROM RepairJob GROUP BY status"),
  ]);
  const byStatus = Object.fromEntries(JOB_STATUSES.map((status) => [status, Number(counts.find((row) => row.status === status)?.count || 0)]));
  res.json({
    vendors,
    jobs,
    open_requests: openRequests,
    summary: {
      vendors: vendors.length,
      usable_vendors: vendors.filter((vendor) => vendor.is_usable).length,
      open_jobs: OPEN_JOB_STATUSES.reduce((sum, status) => sum + byStatus[status], 0),
      by_status: byStatus,
    },
  });
});

function parsePayload(body) {
  try {
    return JSON.parse(body?.payload ?? "");
  } catch {
    throw fail("รูปแบบข้อมูลไม่ถูกต้อง");
  }
}

async function loadImages(db, vendorId) {
  const [rows] = await db.query(
    "SELECT id, name, created_by_name, created_at FROM RepairVendorImage WHERE vendor_id = ? ORDER BY id",
    [vendorId],
  );
  return rows;
}

async function insertImages(connection, vendorId, images, name) {
  await connection.query(
    "INSERT INTO RepairVendorImage (vendor_id, name, file_name, created_by_name) VALUES ?",
    [images.map((image) => [vendorId, image.name, image.file_name, name])],
  );
}

router.post("/vendors", parseVendorImages({ min: VENDOR_MIN_IMAGES }), async (req, res) => {
  const db = getPool();
  const connection = await db.getConnection();
  let vendorId;
  try {
    const input = validateVendorInput(parsePayload(req.body));
    const name = await actorName(req);
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO RepairVendor (name, contact_name, phone, email, specialties, specialty_other, contract_type, contract_start, contract_end,
         contract_fee, webhook_url, note, is_active, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.name, input.contact_name, input.phone, input.email, input.specialties, input.specialty_other, input.contract_type, input.contract_start,
        input.contract_end, input.contract_fee, input.webhook_url, input.note, input.is_active, name],
    );
    vendorId = result.insertId;
    await insertImages(connection, vendorId, req.vendorImages, name);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    await removeVendorFiles(req.vendorImages.map((image) => image.file_name));
    throw error;
  } finally {
    connection.release();
  }
  const vendor = await loadVendor(db, vendorId);
  await repairVendorChanged(db, vendor, await staffActor(req), "created");
  res.status(201).json({ message: "เพิ่มช่างที่ทำสัญญาเรียบร้อยแล้ว", vendor });
});

router.get("/vendors/:id", async (req, res) => {
  const db = getPool();
  const vendorId = parseId(req.params.id);
  const vendor = await loadVendor(db, vendorId);
  const [jobs] = await db.query(
    `SELECT j.*, v.name AS vendor_name, v.phone AS vendor_phone, v.contract_type AS vendor_contract_type, v.webhook_url IS NOT NULL AS vendor_has_webhook,
            mr.status AS request_status, mr.created_at AS request_created_at, mr.category AS request_category,
            (SELECT CONCAT(c.first_name, ' ', c.last_name) FROM Customer c WHERE c.room_number = j.room_number AND c.is_suspended = FALSE ORDER BY c.id DESC LIMIT 1) AS tenant_name,
            (SELECT c.phone FROM Customer c WHERE c.room_number = j.room_number AND c.is_suspended = FALSE ORDER BY c.id DESC LIMIT 1) AS tenant_phone
     FROM RepairJob j
     JOIN RepairVendor v ON v.id = j.vendor_id
     LEFT JOIN MaintenanceRequest mr ON mr.id = j.maintenance_request_id
     WHERE j.vendor_id = ?
     ORDER BY j.created_at DESC
     LIMIT ?`,
    [vendorId, VENDOR_JOBS],
  );
  res.json({ vendor, api_keys: await loadApiKeys(db, vendorId), images: await loadImages(db, vendorId), jobs });
});

router.post("/vendors/:id/images", parseVendorImages({ min: 1 }), async (req, res) => {
  const db = getPool();
  const files = req.vendorImages.map((image) => image.file_name);
  try {
    const vendorId = parseId(req.params.id);
    await loadVendor(db, vendorId);
    const [[{ count }]] = await db.query("SELECT COUNT(*) AS count FROM RepairVendorImage WHERE vendor_id = ?", [vendorId]);
    if (count + files.length > VENDOR_MAX_IMAGES) {
      throw fail(`รูปสัญญาซ่อมเก็บได้สูงสุด ${VENDOR_MAX_IMAGES} รูป (มีอยู่แล้ว ${count} รูป)`, 409, "CONFLICT");
    }
    await insertImages(db, vendorId, req.vendorImages, await actorName(req));
    res.status(201).json({ message: "แนบรูปสัญญาเรียบร้อยแล้ว", images: await loadImages(db, vendorId) });
  } catch (error) {
    await removeVendorFiles(files);
    throw error;
  }
});

router.get("/vendor-images/:id", async (req, res) => {
  const [[image]] = await getPool().query("SELECT file_name FROM RepairVendorImage WHERE id = ?", [parseId(req.params.id)]);
  const filePath = image && vendorImagePath(image.file_name);
  if (!filePath) throw fail("ไม่พบรูปสัญญา", 404, "NOT_FOUND");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(filePath, { dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) res.status(404).json({ message: "ไม่พบรูปสัญญา" });
  });
});

router.delete("/vendor-images/:id", async (req, res) => {
  const db = getPool();
  const [[image]] = await db.query("SELECT id, vendor_id, file_name FROM RepairVendorImage WHERE id = ?", [parseId(req.params.id)]);
  if (!image) throw fail("ไม่พบรูปสัญญา", 404, "NOT_FOUND");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [images] = await connection.query("SELECT id FROM RepairVendorImage WHERE vendor_id = ? FOR UPDATE", [image.vendor_id]);
    if (images.length <= VENDOR_MIN_IMAGES) throw fail(`ต้องมีรูปสัญญาอย่างน้อย ${VENDOR_MIN_IMAGES} รูป ลบเพิ่มไม่ได้`, 409, "CONFLICT");
    await connection.query("DELETE FROM RepairVendorImage WHERE id = ?", [image.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await removeVendorFiles([image.file_name]);
  res.json({ message: "ลบรูปสัญญาเรียบร้อยแล้ว", images: await loadImages(db, image.vendor_id) });
});

router.put("/vendors/:id", async (req, res) => {
  const db = getPool();
  const vendorId = parseId(req.params.id);
  const before = await loadVendor(db, vendorId);
  const input = validateVendorInput(req.body);
  await db.query(
    `UPDATE RepairVendor
     SET name = ?, contact_name = ?, phone = ?, email = ?, specialties = ?, specialty_other = ?, contract_type = ?, contract_start = ?,
         contract_end = ?, contract_fee = ?, webhook_url = ?, note = ?, is_active = ?, updated_by_name = ?
     WHERE id = ?`,
    [input.name, input.contact_name, input.phone, input.email, input.specialties, input.specialty_other, input.contract_type, input.contract_start,
      input.contract_end, input.contract_fee, input.webhook_url, input.note, input.is_active, await actorName(req), vendorId],
  );
  const vendor = await loadVendor(db, vendorId);
  await repairVendorChanged(db, vendor, await staffActor(req), before.is_active && !vendor.is_active ? "deactivated" : "updated");
  res.json({ message: "บันทึกข้อมูลช่างเรียบร้อยแล้ว", vendor });
});

router.post("/vendors/:id/api-keys", async (req, res) => {
  const db = getPool();
  const vendorId = parseId(req.params.id);
  const vendor = await loadVendor(db, vendorId);
  if (!vendor.is_active) throw fail("ช่างรายนี้ถูกปิดการใช้งาน ออก API key ไม่ได้", 409, "CONFLICT");
  const labelError = validateText(req.body?.label, "ชื่อเรียก API key", { maxLength: 100 });
  if (labelError) throw fail(labelError);
  const [[{ count }]] = await db.query(
    "SELECT COUNT(*) AS count FROM RepairVendorApiKey WHERE vendor_id = ? AND revoked_at IS NULL",
    [vendorId],
  );
  if (count >= MAX_KEYS_PER_VENDOR) throw fail(`ช่างหนึ่งรายมี API key ที่ใช้งานได้สูงสุด ${MAX_KEYS_PER_VENDOR} อัน`, 409, "CONFLICT");
  const { key, prefix, hash, cipher } = generateRepairApiKey();
  await db.query(
    "INSERT INTO RepairVendorApiKey (vendor_id, label, key_prefix, key_hash, key_cipher, created_by_name) VALUES (?, ?, ?, ?, ?, ?)",
    [vendorId, req.body.label.trim(), prefix, hash, cipher, await actorName(req)],
  );
  await repairKeyChanged(db, vendor, await staffActor(req), "issued");
  res.status(201).json({ message: "สร้าง API key เรียบร้อยแล้ว", api_key: key, api_keys: await loadApiKeys(db, vendorId) });
});

router.get("/api-keys/:id/reveal", async (req, res) => {
  const row = await loadApiKey(getPool(), parseId(req.params.id));
  if (!row.key_cipher) throw fail("ดู key เต็มไม่ได้ กรุณาออก key ใหม่ให้ช่าง", 409, "CONFLICT");
  let key;
  try {
    key = decryptApiKey(row.key_cipher);
  } catch {
    throw fail("ถอดรหัส key ไม่ได้ กรุณาออก key ใหม่ให้ช่าง", 409, "CONFLICT");
  }
  if (hashApiKey(key) !== row.key_hash) throw fail("ข้อมูล key ไม่ตรงกัน กรุณาออก key ใหม่ให้ช่าง", 409, "CONFLICT");
  res.setHeader("Cache-Control", "no-store");
  res.json({ api_key: key, revoked: Boolean(row.revoked_at) });
});

router.post("/api-keys/:id/rotate", async (req, res) => {
  const db = getPool();
  const oldKey = await loadApiKey(db, parseId(req.params.id));
  if (oldKey.revoked_at) throw fail("key นี้ถูกยกเลิกไปแล้ว", 409, "CONFLICT");
  const name = await actorName(req);
  const { key, prefix, hash, cipher } = generateRepairApiKey();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [revoked] = await connection.query(
      "UPDATE RepairVendorApiKey SET revoked_at = NOW(), revoked_by_name = ? WHERE id = ? AND revoked_at IS NULL",
      [name, oldKey.id],
    );
    if (revoked.affectedRows === 0) throw fail("key นี้ถูกยกเลิกไปแล้ว", 409, "CONFLICT");
    await connection.query(
      "INSERT INTO RepairVendorApiKey (vendor_id, label, key_prefix, key_hash, key_cipher, created_by_name) VALUES (?, ?, ?, ?, ?, ?)",
      [oldKey.vendor_id, oldKey.label, prefix, hash, cipher, name],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await repairKeyChanged(db, await loadVendor(db, oldKey.vendor_id), await staffActor(req), "rotated");
  res.status(201).json({ message: "ออก key ใหม่แทนเรียบร้อยแล้ว key เดิมถูกยกเลิก", api_key: key, api_keys: await loadApiKeys(db, oldKey.vendor_id) });
});

router.post("/api-keys/:id/revoke", async (req, res) => {
  const db = getPool();
  const key = await loadApiKey(db, parseId(req.params.id));
  const [revoked] = await db.query(
    "UPDATE RepairVendorApiKey SET revoked_at = NOW(), revoked_by_name = ? WHERE id = ? AND revoked_at IS NULL",
    [await actorName(req), key.id],
  );
  if (revoked.affectedRows > 0) await repairKeyChanged(db, await loadVendor(db, key.vendor_id), await staffActor(req), "revoked");
  res.json({ message: "ยกเลิก API key เรียบร้อยแล้ว", api_keys: await loadApiKeys(db, key.vendor_id) });
});

async function checkLinkedRequest(db, input) {
  if (!input.maintenance_request_id) return;
  const [[request]] = await db.query("SELECT room_number, status FROM MaintenanceRequest WHERE id = ?", [input.maintenance_request_id]);
  if (!request || !["pending", "in_progress"].includes(request.status)) throw fail("รายการแจ้งซ่อมนี้ปิดไปแล้ว", 409, "CONFLICT");
  if (Number(request.room_number) !== input.room_number) throw fail("เลขห้องไม่ตรงกับรายการแจ้งซ่อมที่เลือก");
  const [[open]] = await db.query(
    "SELECT id FROM RepairJob WHERE maintenance_request_id = ? AND status IN ('sent', 'accepted', 'in_progress') LIMIT 1",
    [input.maintenance_request_id],
  );
  if (open) throw fail("รายการแจ้งซ่อมนี้ส่งให้ช่างไปแล้วและยังไม่ปิดงาน", 409, "CONFLICT");
}

router.post("/jobs", async (req, res) => {
  const db = getPool();
  const input = validateJobInput(req.body);
  const vendor = await loadVendor(db, input.vendor_id);
  if (!vendor.is_usable) throw fail("สัญญาของช่างรายนี้ไม่อยู่ในช่วงใช้งาน หรือถูกปิดการใช้งาน", 409, "CONFLICT");
  const [[room]] = await db.query("SELECT room_number FROM Room WHERE room_number = ?", [input.room_number]);
  if (!room) throw fail("ไม่พบห้องนี้ในระบบ");
  await checkLinkedRequest(db, input);
  const name = await actorName(req);
  const [result] = await db.query(
    `INSERT INTO RepairJob (vendor_id, maintenance_request_id, room_number, category, urgency, description, contact_phone,
       preferred_time, sent_by_name, status_updated_at, status_updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [input.vendor_id, input.maintenance_request_id, input.room_number, input.category, input.urgency, input.description,
      input.contact_phone, input.preferred_time, name, name],
  );
  await deliverWebhook(db, vendor, "job.created", await loadJob(db, result.insertId));
  const job = await loadJob(db, result.insertId);
  await repairJobSent(db, job, actorOf(req.user, name));
  res.status(201).json({
    message: vendor.webhook_url && job.webhook_status !== "delivered"
      ? "บันทึกงานแล้ว แต่ส่งแจ้งเตือนไปยังระบบของช่างไม่สำเร็จ ช่างยังดึงงานผ่าน API ได้"
      : `ส่งงานซ่อมห้อง ${input.room_number} ให้ ${vendor.name} เรียบร้อยแล้ว`,
    job,
  });
});

router.put("/jobs/:id", async (req, res) => {
  const db = getPool();
  const jobId = parseId(req.params.id);
  const input = validateJobUpdate(req.body);
  const before = await loadJob(db, jobId);
  const changes = Object.keys(input).filter((key) => String(input[key] ?? "") !== String(before[key] ?? ""));
  const [result] = await db.query(
    `UPDATE RepairJob
     SET category = ?, urgency = ?, description = ?, contact_phone = ?, preferred_time = ?,
         details_updated_at = NOW(), details_updated_by = ?
     WHERE id = ? AND status IN ('sent', 'accepted', 'in_progress')`,
    [input.category, input.urgency, input.description, input.contact_phone, input.preferred_time, await actorName(req), jobId],
  );
  if (result.affectedRows === 0) throw fail("งานนี้ปิดไปแล้ว แก้ไขไม่ได้", 409, "CONFLICT");
  const job = await loadJob(db, jobId);
  const vendor = await loadVendor(db, job.vendor_id);
  await deliverWebhook(db, vendor, "job.updated", job);
  if (changes.length) await repairJobEdited(db, job, await staffActor(req), changes);
  const updated = await loadJob(db, jobId);
  res.json({
    message: vendor.webhook_url && updated.webhook_status !== "delivered"
      ? "บันทึกการแก้ไขแล้ว แต่แจ้งเตือนช่างไม่สำเร็จ ช่างจะเห็นข้อมูลใหม่ครั้งถัดไปที่เข้ามาดูงาน"
      : vendor.webhook_url ? "บันทึกการแก้ไขและแจ้งช่างเรียบร้อยแล้ว" : "บันทึกการแก้ไขแล้ว ช่างจะเห็นข้อมูลใหม่ครั้งถัดไปที่เข้ามาดูงาน",
    job: updated,
  });
});

router.post("/jobs/:id/cancel", async (req, res) => {
  const db = getPool();
  const jobId = parseId(req.params.id);
  const reasonError = validateText(req.body?.reason, "เหตุผลที่ยกเลิก", { maxLength: 500 });
  if (reasonError) throw fail(reasonError);
  const [result] = await db.query(
    `UPDATE RepairJob
     SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = ?, status_updated_at = NOW(), status_updated_by = ?
     WHERE id = ? AND status IN ('sent', 'accepted', 'in_progress')`,
    [req.body.reason.trim(), await actorName(req), jobId],
  );
  if (result.affectedRows === 0) {
    await loadJob(db, jobId);
    throw fail("งานนี้ปิดไปแล้ว ยกเลิกไม่ได้", 409, "CONFLICT");
  }
  const job = await loadJob(db, jobId);
  await deliverWebhook(db, await loadVendor(db, job.vendor_id), "job.cancelled", job);
  await repairJobCancelled(db, job, await staffActor(req));
  res.json({ message: "ยกเลิกงานซ่อมเรียบร้อยแล้ว", job: await loadJob(db, jobId) });
});

router.post("/jobs/:id/resend", async (req, res) => {
  const db = getPool();
  const job = await loadJob(db, parseId(req.params.id));
  if (job.status !== "sent") throw fail("ส่งแจ้งเตือนซ้ำได้เฉพาะงานที่ช่างยังไม่ตอบรับ", 409, "CONFLICT");
  const vendor = await loadVendor(db, job.vendor_id);
  if (!vendor.webhook_url) throw fail("ช่างรายนี้ไม่ได้ตั้งค่า Webhook URL", 409, "CONFLICT");
  await deliverWebhook(db, vendor, "job.created", job);
  const updated = await loadJob(db, job.id);
  res.json({ message: updated.webhook_status === "delivered" ? "ส่งแจ้งเตือนไปยังช่างอีกครั้งแล้ว" : "ส่งแจ้งเตือนไม่สำเร็จ", job: updated });
});

export default router;
