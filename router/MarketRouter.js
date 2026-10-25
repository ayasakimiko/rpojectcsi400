import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { canManageShops, canOperateMarket, fetchAuthService } from "../middleware/marketAuth.js";
import { decryptApiKey, generateApiKey, hashApiKey } from "../middleware/marketApiKey.js";
import { LEASE_MIN_IMAGES, leaseImagePath, parseLeaseImages, removeLeaseFiles } from "../middleware/marketUploads.js";
import { PAYMENT_METHODS, verifyLeasePayment } from "../middleware/marketPayment.js";
import {
  createProduct,
  deleteProduct,
  fail,
  listProducts,
  parseId,
  serializeLease,
  serializeShop,
  updateProduct,
  validateLeaseInput,
  validateProductInput,
  validateShopInput,
} from "./marketShared.js";
import { validateText } from "../src/utils/validators.js";

const router = Router();
const MAX_KEYS_PER_LEASE = 5;
const EXPIRING_DAYS = 30;
const MAX_IMAGES_PER_LEASE = 20;

const SQL = {
  shops: "SELECT * FROM ShopInfo WHERE (? IS NULL OR id = ?) ORDER BY code",
  shopCategories: `SELECT p.shop_id, p.category FROM ShopProduct p JOIN Shop s ON s.id = p.shop_id
    WHERE s.is_active = TRUE AND (? IS NULL OR p.shop_id = ?)
    GROUP BY p.shop_id, p.category ORDER BY p.category`,
  leaseCounts: `SELECT
      SUM(l.status = 'active' AND l.start_date <= CURDATE() AND l.end_date >= CURDATE()) AS active_leases,
      SUM(l.status = 'active' AND l.end_date >= CURDATE() AND l.end_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)) AS expiring_soon,
      SUM(l.status = 'active' AND l.start_date > CURDATE()) AS upcoming_leases
    FROM ShopLease l JOIN Shop s ON s.id = l.shop_id AND s.is_active = TRUE`,
  activeShop: "SELECT id FROM Shop WHERE id = ? AND is_active = TRUE",
  activeShopForUpdate: "SELECT id FROM Shop WHERE id = ? AND is_active = TRUE FOR UPDATE",
  insertShop: `INSERT INTO Shop (code, name, shop_type, location, area_sqm, monthly_rent, open_time, close_time, description,
      caretaker_staff_id, caretaker_name, created_by_role, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  updateShop: `UPDATE Shop SET code = ?, name = ?, shop_type = ?, location = ?, area_sqm = ?, monthly_rent = ?, open_time = ?,
      close_time = ?, description = ?, caretaker_staff_id = ?, caretaker_name = ?, updated_by_name = ?
    WHERE id = ?`,
  currentLeaseOfShop: "SELECT id FROM ShopLease WHERE shop_id = ? AND status = 'active' AND end_date >= CURDATE() LIMIT 1",
  closeShop: "UPDATE Shop SET is_active = FALSE WHERE id = ?",
  lease: "SELECT * FROM ShopLeaseInfo WHERE id = ?",
  leases: "SELECT * FROM ShopLeaseInfo ORDER BY FIELD(status, 'active', 'upcoming', 'expired', 'terminated'), start_date DESC, id DESC",
  shopLeases: "SELECT * FROM ShopLeaseInfo WHERE shop_id = ? ORDER BY start_date DESC, id DESC",
  overlappingLease: `SELECT contract_no FROM ShopLease
    WHERE shop_id = ? AND status = 'active' AND start_date <= ? AND end_date >= ? LIMIT 1`,
  insertLease: `INSERT INTO ShopLease (contract_no, shop_id, tenant_name, tenant_phone, tenant_idcard, tenant_email, business_name,
      start_date, end_date, monthly_rent, deposit, payment_due_day, terms, created_by_role, created_by_name)
    VALUES (LEFT(REPLACE(UUID(), '-', ''), 30), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  setContractNo: "UPDATE ShopLease SET contract_no = CONCAT('SL-', YEAR(CURDATE()), '-', LPAD(id, 4, '0')) WHERE id = ?",
  extendOverlap: `SELECT contract_no FROM ShopLease
    WHERE shop_id = ? AND id <> ? AND status = 'active' AND start_date <= ? AND end_date > ? LIMIT 1`,
  terminateLease: `UPDATE ShopLease SET status = 'terminated', terminated_at = NOW(), termination_reason = ?, terminated_by_name = ?
    WHERE id = ? AND status = 'active'`,
  revokeLeaseKeys: "UPDATE ShopApiKey SET revoked_at = NOW(), revoked_by_name = ? WHERE lease_id = ? AND revoked_at IS NULL",
  apiKeys: `SELECT id, label, key_prefix, created_by_name, created_at, last_used_at, revoked_at, revoked_by_name,
      key_cipher IS NOT NULL AS can_reveal
    FROM ShopApiKey WHERE lease_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC`,
  activeKeyCount: "SELECT COUNT(*) AS count FROM ShopApiKey WHERE lease_id = ? AND revoked_at IS NULL",
  insertApiKey: "INSERT INTO ShopApiKey (lease_id, label, key_prefix, key_hash, key_cipher, created_by_name) VALUES (?, ?, ?, ?, ?, ?)",
  apiKeySecret: "SELECT key_hash, key_cipher, revoked_at FROM ShopApiKey WHERE id = ?",
  apiKeyLease: "SELECT lease_id FROM ShopApiKey WHERE id = ?",
  revokeKey: "UPDATE ShopApiKey SET revoked_at = NOW(), revoked_by_name = ? WHERE id = ? AND revoked_at IS NULL",
  insertImages: "INSERT INTO ShopLeaseImage (lease_id, name, file_name, uploaded_by_name) VALUES ?",
  leaseImages: "SELECT id, name, uploaded_by_name, created_at FROM ShopLeaseImage WHERE lease_id = ? AND archived_at IS NULL ORDER BY id",
  archivedLeaseImages: `SELECT id, name, uploaded_by_name, created_at, archived_at, archive_note, archived_by_name,
      DATE_FORMAT(archived_prev_start, '%Y-%m-%d') AS prev_start, DATE_FORMAT(archived_prev_end, '%Y-%m-%d') AS prev_end,
      DATE_FORMAT(archived_new_end, '%Y-%m-%d') AS new_end, archived_months
    FROM ShopLeaseImage WHERE lease_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC, id`,
  archiveLeaseImages: `UPDATE ShopLeaseImage SET archived_at = NOW(), archive_note = ?, archived_by_name = ?,
      archived_prev_start = ?, archived_prev_end = ?, archived_new_end = ?, archived_months = ?
    WHERE lease_id = ? AND archived_at IS NULL`,
  leaseImageCount: "SELECT COUNT(*) AS count FROM ShopLeaseImage WHERE lease_id = ? AND archived_at IS NULL",
  leaseImageFile: "SELECT file_name FROM ShopLeaseImage WHERE id = ?",
  allLeaseImages: "SELECT id, lease_id FROM ShopLeaseImage WHERE archived_at IS NULL ORDER BY lease_id, id",
  apiKeyForRotate: "SELECT id, lease_id, label, revoked_at FROM ShopApiKey WHERE id = ?",
  insertPayment: `INSERT INTO ShopLeasePayment (lease_id, payment_type, amount, rent_amount, deposit_amount, method, verify_mode, slip_file,
      qr_payload, trans_ref, payer_name, transferred_at, received_by_name)
    VALUES (?, 'initial', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  insertRenewPayment: `INSERT INTO ShopLeasePayment (lease_id, payment_type, amount, rent_amount, deposit_amount, renew_months, renew_plan,
      method, verify_mode, slip_file, qr_payload, trans_ref, payer_name, transferred_at, received_by_name)
    VALUES (?, 'renewal', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  leasePayments: `SELECT id, payment_type, amount, rent_amount, deposit_amount, renew_months, renew_plan, method, verify_mode, slip_file IS NOT NULL AS has_slip,
      trans_ref, payer_name, transferred_at, received_by_name, paid_at
    FROM ShopLeasePayment WHERE lease_id = ? ORDER BY id`,
  paymentSlipFile: "SELECT slip_file FROM ShopLeasePayment WHERE id = ?",
  renewLease: "UPDATE ShopLease SET end_date = DATE_ADD(end_date, INTERVAL ? MONTH) WHERE id = ? AND status = 'active'",
  renewPreview: "SELECT DATE_FORMAT(DATE_ADD(end_date, INTERVAL ? MONTH), '%Y-%m-%d') AS new_end FROM ShopLease WHERE id = ?",
};

async function loadImageHistory(db, leaseId) {
  const [rows] = await db.query(SQL.archivedLeaseImages, [leaseId]);
  const groups = new Map();
  for (const row of rows) {
    const key = new Date(row.archived_at).toISOString();
    if (!groups.has(key)) {
      groups.set(key, {
        archived_at: row.archived_at,
        note: row.archive_note,
        archived_by_name: row.archived_by_name,
        prev_start: row.prev_start,
        prev_end: row.prev_end,
        new_end: row.new_end,
        months: row.archived_months,
        images: [],
      });
    }
    groups.get(key).images.push({
      id: row.id, name: row.name, created_at: row.created_at, uploaded_by_name: row.uploaded_by_name, url: "/api/market/lease-images/" + row.id,
    });
  }
  return [...groups.values()];
}

async function loadLeaseImages(db, leaseId) {
  const [rows] = await db.query(SQL.leaseImages, [leaseId]);
  return rows.map((row) => ({ ...row, url: "/api/market/lease-images/" + row.id }));
}

function imageRows(leaseId, images, actorName) {
  return images.map((image) => [leaseId, image.name, image.file_name, actorName]);
}

function permissions(role) {
  return { manageShops: role === "Admin" || role === "Owner", operate: role === "Staff" || role === "Admin" };
}

function shapeShop(row, categories) {
  const shop = serializeShop(row);
  const lease = row.lease_id ? {
    id: row.lease_id,
    contract_no: row.lease_contract_no,
    tenant_name: row.lease_tenant_name,
    business_name: row.lease_business_name,
    tenant_phone: row.lease_tenant_phone,
    start_date: row.lease_start_date,
    end_date: row.lease_end_date,
    monthly_rent: Number(row.lease_monthly_rent),
    status: row.lease_status,
  } : null;
  for (const key of Object.keys(shop)) if (key.startsWith("lease_")) delete shop[key];
  return {
    ...shop,
    product_count: Number(row.product_count || 0),
    available_count: Number(row.available_count || 0),
    categories: categories.get(row.id) || [],
    current_lease: lease,
  };
}

async function loadShops(db, shopId = null) {
  const [rows] = await db.query(SQL.shops, [shopId, shopId]);
  const [categoryRows] = await db.query(SQL.shopCategories, [shopId, shopId]);
  const categories = new Map();
  for (const { shop_id: id, category } of categoryRows) categories.set(id, [...(categories.get(id) || []), category]);
  return rows.map((row) => shapeShop(row, categories));
}

async function loadShop(db, shopId) {
  const [shop] = await loadShops(db, shopId);
  if (!shop) throw fail("ไม่พบร้านค้านี้", 404, "NOT_FOUND");
  return shop;
}

async function resolveCaretaker(req, staffId) {
  if (!staffId) return { caretaker_staff_id: null, caretaker_name: null };
  const { status, body } = await fetchAuthService("/api/auth/staff-directory", req.authorization);
  if (status !== 200 || !Array.isArray(body.staff)) throw fail("ตรวจสอบรายชื่อพนักงานไม่ได้ กรุณาลองใหม่", 503);
  const staff = body.staff.find((item) => item.id === staffId);
  if (!staff) throw fail("ไม่พบพนักงานผู้ดูแลที่เลือก หรือบัญชีถูกระงับ");
  return { caretaker_staff_id: staff.id, caretaker_name: staff.name };
}

async function loadLease(db, leaseId) {
  const [[row]] = await db.query(SQL.lease, [leaseId]);
  if (!row) throw fail("ไม่พบสัญญาเช่านี้", 404, "NOT_FOUND");
  return serializeLease(row);
}

async function loadApiKeys(db, leaseId) {
  const [rows] = await db.query(SQL.apiKeys, [leaseId]);
  return rows.map((row) => ({ ...row, can_reveal: Boolean(row.can_reveal) }));
}

async function requireOperableShop(db, shopId) {
  const [[shop]] = await db.query(SQL.activeShop, [shopId]);
  if (!shop) throw fail("ไม่พบร้านค้านี้", 404, "NOT_FOUND");
}

function shopValues(input, caretaker) {
  return [input.code, input.name, input.shop_type, input.location, input.area_sqm, input.monthly_rent, input.open_time,
    input.close_time, input.description, caretaker.caretaker_staff_id, caretaker.caretaker_name];
}

router.get("/overview", async (req, res) => {
  const db = getPool();
  const shops = await loadShops(db);
  const [[counts]] = await db.query(SQL.leaseCounts, [EXPIRING_DAYS]);
  const rented = shops.filter((shop) => shop.current_lease?.status === "active").length;
  res.json({
    shops,
    summary: {
      shops: shops.length,
      rented,
      vacant: shops.length - rented,
      products: shops.reduce((sum, shop) => sum + shop.product_count, 0),
      monthly_income: shops.reduce((sum, shop) => sum + (shop.current_lease?.status === "active" ? shop.current_lease.monthly_rent : 0), 0),
      active_leases: Number(counts.active_leases || 0),
      upcoming_leases: Number(counts.upcoming_leases || 0),
      expiring_soon: Number(counts.expiring_soon || 0),
    },
    permissions: permissions(req.actor.role),
  });
});

router.get("/shops/:id", async (req, res) => {
  const db = getPool();
  const shopId = parseId(req.params.id);
  const shop = await loadShop(db, shopId);
  const [leases] = await db.query(SQL.shopLeases, [shopId]);
  res.json({ shop, products: await listProducts(db, shopId), leases: leases.map(serializeLease), permissions: permissions(req.actor.role) });
});

router.post("/shops", canManageShops, async (req, res) => {
  const db = getPool();
  const input = validateShopInput(req.body);
  const caretaker = await resolveCaretaker(req, input.caretaker_staff_id);
  try {
    const [result] = await db.query(SQL.insertShop, [...shopValues(input, caretaker), req.actor.role, req.actor.name]);
    res.status(201).json({ message: "สร้างร้านค้าเรียบร้อยแล้ว", shop: await loadShop(db, result.insertId) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw fail("รหัสร้านนี้ถูกใช้แล้ว", 409, "CONFLICT");
    throw error;
  }
});

router.put("/shops/:id", canManageShops, async (req, res) => {
  const db = getPool();
  const shopId = parseId(req.params.id);
  await requireOperableShop(db, shopId);
  const input = validateShopInput(req.body);
  const caretaker = await resolveCaretaker(req, input.caretaker_staff_id);
  try {
    await db.query(SQL.updateShop, [...shopValues(input, caretaker), req.actor.name, shopId]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw fail("รหัสร้านนี้ถูกใช้แล้ว", 409, "CONFLICT");
    throw error;
  }
  res.json({ message: "บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว", shop: await loadShop(db, shopId) });
});

router.delete("/shops/:id", canManageShops, async (req, res) => {
  const db = getPool();
  const shopId = parseId(req.params.id);
  await requireOperableShop(db, shopId);
  const [[lease]] = await db.query(SQL.currentLeaseOfShop, [shopId]);
  if (lease) throw fail("ร้านนี้ยังมีสัญญาเช่าที่ใช้งานอยู่ ต้องยกเลิกสัญญาก่อนปิดร้าน", 409, "CONFLICT");
  await db.query(SQL.closeShop, [shopId]);
  res.json({ message: "ปิดร้านค้าเรียบร้อยแล้ว" });
});

router.post("/shops/:id/products", canOperateMarket, async (req, res) => {
  const db = getPool();
  const shopId = parseId(req.params.id);
  await requireOperableShop(db, shopId);
  const product = await createProduct(db, shopId, validateProductInput(req.body), req.actor.name);
  res.status(201).json({ message: "เพิ่มสินค้าเรียบร้อยแล้ว", product });
});

router.put("/shops/:id/products/:productId", canOperateMarket, async (req, res) => {
  const db = getPool();
  const shopId = parseId(req.params.id);
  await requireOperableShop(db, shopId);
  const product = await updateProduct(db, shopId, parseId(req.params.productId), validateProductInput(req.body, { partial: true }), req.actor.name);
  res.json({ message: "บันทึกสินค้าเรียบร้อยแล้ว", product });
});

router.delete("/shops/:id/products/:productId", canOperateMarket, async (req, res) => {
  const db = getPool();
  const shopId = parseId(req.params.id);
  await requireOperableShop(db, shopId);
  await deleteProduct(db, shopId, parseId(req.params.productId));
  res.json({ message: "ลบสินค้าเรียบร้อยแล้ว" });
});

router.get("/leases", async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(SQL.leases);
  const [imageRows] = await db.query(SQL.allLeaseImages);
  const imagesByLease = new Map();
  for (const image of imageRows) {
    imagesByLease.set(image.lease_id, [...(imagesByLease.get(image.lease_id) || []), { id: image.id, url: "/api/market/lease-images/" + image.id }]);
  }
  res.json({
    leases: rows.map((row) => ({ ...serializeLease(row), images: imagesByLease.get(row.id) || [] })),
    permissions: permissions(req.actor.role),
  });
});

router.get("/leases/:id", async (req, res) => {
  const db = getPool();
  const leaseId = parseId(req.params.id);
  res.json({
    lease: await loadLease(db, leaseId),
    api_keys: await loadApiKeys(db, leaseId),
    images: await loadLeaseImages(db, leaseId),
    image_history: await loadImageHistory(db, leaseId),
    payments: (await db.query(SQL.leasePayments, [leaseId]))[0].map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
      rent_amount: Number(payment.rent_amount),
      deposit_amount: Number(payment.deposit_amount),
      renew_plan_label: RENEW_PLANS[payment.renew_plan] || null,
      has_slip: Boolean(payment.has_slip),
      method_label: PAYMENT_METHODS[payment.method],
      slip_url: payment.has_slip ? "/api/market/lease-payments/" + payment.id + "/slip" : null,
    })),
    permissions: permissions(req.actor.role),
  });
});

router.get("/lease-images/:id", async (req, res) => {
  const [[image]] = await getPool().query(SQL.leaseImageFile, [parseId(req.params.id)]);
  const filePath = image && leaseImagePath(image.file_name);
  if (!filePath) throw fail("ไม่พบรูปสัญญา", 404, "NOT_FOUND");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(filePath, { dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) res.status(404).json({ message: "ไม่พบรูปสัญญา" });
  });
});

router.get("/lease-payments/:id/slip", async (req, res) => {
  const [[payment]] = await getPool().query(SQL.paymentSlipFile, [parseId(req.params.id)]);
  const filePath = payment?.slip_file && leaseImagePath(payment.slip_file);
  if (!filePath) throw fail("ไม่พบสลิป", 404, "NOT_FOUND");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(filePath, { dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) res.status(404).json({ message: "ไม่พบสลิป" });
  });
});

router.post("/leases/:id/images", canOperateMarket, parseLeaseImages({ min: 1 }), async (req, res) => {
  const db = getPool();
  const fileNames = req.leaseImages.map((image) => image.file_name);
  try {
    const leaseId = parseId(req.params.id);
    await loadLease(db, leaseId);
    const [[{ count }]] = await db.query(SQL.leaseImageCount, [leaseId]);
    if (count + req.leaseImages.length > MAX_IMAGES_PER_LEASE) throw fail(`สัญญาหนึ่งแนบรูปได้สูงสุด ${MAX_IMAGES_PER_LEASE} รูป`, 409, "CONFLICT");
    await db.query(SQL.insertImages, [imageRows(leaseId, req.leaseImages, req.actor.name)]);
    res.status(201).json({ message: "แนบรูปสัญญาเรียบร้อยแล้ว", images: await loadLeaseImages(db, leaseId) });
  } catch (error) {
    await removeLeaseFiles(fileNames);
    throw error;
  }
});

router.post("/leases", canOperateMarket, parseLeaseImages({ min: LEASE_MIN_IMAGES, slip: true }), async (req, res) => {
  const slipFile = req.paymentSlip;
  const fileNames = [...req.leaseImages.map((image) => image.file_name), ...(slipFile ? [slipFile.filename] : [])];
  let input;
  let payment;
  try {
    input = validateLeaseInput(req.body);
    const [[shop]] = await getPool().query(SQL.activeShop, [input.shop_id]);
    if (!shop) throw fail("ไม่พบร้านค้านี้", 404, "NOT_FOUND");
    const [[overlap]] = await getPool().query(SQL.overlappingLease, [input.shop_id, input.end_date, input.start_date]);
    if (overlap) throw fail(`ช่วงวันที่ซ้อนกับสัญญา ${overlap.contract_no} ของร้านนี้`, 409, "CONFLICT");
    payment = await verifyLeasePayment({
      db: getPool(),
      authorization: req.authorization,
      method: req.body.payment_method,
      slipFile,
      qrPayload: req.body.qr_payload,
      amount: input.monthly_rent + input.deposit,
    });
  } catch (error) {
    await removeLeaseFiles(fileNames);
    throw error;
  }
  if (slipFile && payment.method === "counter") {
    await removeLeaseFiles([slipFile.filename]);
  }
  const connection = await getPool().getConnection();
  let leaseId;
  try {
    await connection.beginTransaction();
    const [[shop]] = await connection.query(SQL.activeShopForUpdate, [input.shop_id]);
    if (!shop) throw fail("ไม่พบร้านค้านี้", 404, "NOT_FOUND");
    const [[overlap]] = await connection.query(SQL.overlappingLease, [input.shop_id, input.end_date, input.start_date]);
    if (overlap) throw fail(`ช่วงวันที่ซ้อนกับสัญญา ${overlap.contract_no} ของร้านนี้`, 409, "CONFLICT");
    const [result] = await connection.query(SQL.insertLease, [
      input.shop_id, input.tenant_name, input.tenant_phone, input.tenant_idcard, input.tenant_email, input.business_name,
      input.start_date, input.end_date, input.monthly_rent, input.deposit, input.payment_due_day, input.terms,
      req.actor.role, req.actor.name,
    ]);
    leaseId = result.insertId;
    await connection.query(SQL.setContractNo, [leaseId]);
    await connection.query(SQL.insertImages, [imageRows(leaseId, req.leaseImages, req.actor.name)]);
    await connection.query(SQL.insertPayment, [
      leaseId, input.monthly_rent + input.deposit, input.monthly_rent, input.deposit, payment.method, payment.verifyMode,
      payment.method === "counter" ? null : slipFile?.filename ?? null, payment.qrPayload, payment.transRef, payment.payerName,
      payment.paidAt, payment.testMode ? `${req.actor.name} · โหมดทดลอง` : req.actor.name,
    ]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    await removeLeaseFiles(fileNames);
    throw error;
  } finally {
    connection.release();
  }
  res.status(201).json({ message: "ชำระเงินและทำสัญญาเช่าเรียบร้อยแล้ว", lease: await loadLease(getPool(), leaseId) });
});

const RENEW_PLANS = { monthly: "จ่ายรายเดือน", lump_sum: "จ่ายล่วงหน้าทั้งก้อน" };

router.post("/leases/:id/renew", canOperateMarket, parseLeaseImages({ min: LEASE_MIN_IMAGES, slip: true }), async (req, res) => {
  const db = getPool();
  const slipFile = req.paymentSlip;
  const uploaded = [...req.leaseImages.map((image) => image.file_name), ...(slipFile ? [slipFile.filename] : [])];
  let leaseId;
  let months;
  let plan;
  let amount;
  let newEnd;
  let payment;
  let previousEnd;
  let previousStart;
  try {
    leaseId = parseId(req.params.id);
    months = Number(req.body?.months);
    plan = req.body?.renew_plan;
    if (!Number.isInteger(months) || months < 1 || months > 36) throw fail("ระยะเวลาต่อสัญญาต้องเป็น 1-36 เดือน");
    if (!Object.hasOwn(RENEW_PLANS, plan)) throw fail("กรุณาเลือกรูปแบบการชำระเงิน");
    const lease = await loadLease(db, leaseId);
    if (lease.status === "terminated") throw fail("สัญญานี้ถูกยกเลิกแล้ว ต่อสัญญาไม่ได้", 409, "CONFLICT");
    previousEnd = lease.end_date;
    previousStart = lease.start_date;
    [[{ new_end: newEnd }]] = await db.query(SQL.renewPreview, [months, leaseId]);
    const [[overlap]] = await db.query(SQL.extendOverlap, [lease.shop_id, leaseId, newEnd, lease.end_date]);
    if (overlap) throw fail(`ต่อสัญญาไม่ได้ เพราะซ้อนกับสัญญา ${overlap.contract_no}`, 409, "CONFLICT");
    amount = Math.round(lease.monthly_rent * (plan === "lump_sum" ? months : 1) * 100) / 100;
    payment = await verifyLeasePayment({
      db,
      authorization: req.authorization,
      method: req.body.payment_method,
      slipFile,
      qrPayload: req.body.qr_payload,
      amount,
    });
  } catch (error) {
    await removeLeaseFiles(uploaded);
    throw error;
  }
  if (slipFile && payment.method === "counter") await removeLeaseFiles([slipFile.filename]);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(SQL.renewLease, [months, leaseId]);
    if (result.affectedRows === 0) throw fail("สถานะสัญญาเปลี่ยนแปลง กรุณาโหลดใหม่", 409, "CONFLICT");
    await connection.query(SQL.archiveLeaseImages, [
      `รูปสัญญาก่อนต่อสัญญา ${months} เดือน (เดิมสิ้นสุด ${previousEnd} → ใหม่ ${newEnd})`, req.actor.name,
      previousStart, previousEnd, newEnd, months, leaseId,
    ]);
    await connection.query(SQL.insertImages, [imageRows(leaseId, req.leaseImages, req.actor.name)]);
    await connection.query(SQL.insertRenewPayment, [
      leaseId, amount, amount, months, plan, payment.method, payment.verifyMode,
      payment.method === "counter" ? null : slipFile?.filename ?? null, payment.qrPayload, payment.transRef, payment.payerName,
      payment.paidAt, payment.testMode ? `${req.actor.name} · โหมดทดลอง` : req.actor.name,
    ]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    await removeLeaseFiles(uploaded);
    throw error;
  } finally {
    connection.release();
  }
  res.json({ message: `ชำระเงินและต่อสัญญาเพิ่ม ${months} เดือน ถึง ${newEnd} เรียบร้อยแล้ว`, lease: await loadLease(db, leaseId) });
});

router.post("/leases/:id/terminate", canOperateMarket, async (req, res) => {
  const db = getPool();
  const leaseId = parseId(req.params.id);
  const reasonError = validateText(req.body?.reason, "เหตุผลการยกเลิกสัญญา", { maxLength: 500 });
  if (reasonError) throw fail(reasonError);
  const [result] = await db.query(SQL.terminateLease, [req.body.reason.trim(), req.actor.name, leaseId]);
  if (result.affectedRows === 0) {
    await loadLease(db, leaseId);
    throw fail("สัญญานี้ถูกยกเลิกไปแล้ว", 409, "CONFLICT");
  }
  await db.query(SQL.revokeLeaseKeys, [req.actor.name, leaseId]);
  res.json({ message: "ยกเลิกสัญญาเรียบร้อยแล้ว API key ของสัญญานี้ถูกปิดทั้งหมด", lease: await loadLease(db, leaseId) });
});

router.post("/leases/:id/api-keys", canOperateMarket, async (req, res) => {
  const db = getPool();
  const leaseId = parseId(req.params.id);
  const lease = await loadLease(db, leaseId);
  if (lease.status === "terminated" || lease.status === "expired") throw fail("สัญญานี้สิ้นสุดแล้ว ออก API key ไม่ได้", 409, "CONFLICT");
  const labelError = validateText(req.body?.label, "ชื่อเรียก API key", { maxLength: 100 });
  if (labelError) throw fail(labelError);
  const [[{ count }]] = await db.query(SQL.activeKeyCount, [leaseId]);
  if (count >= MAX_KEYS_PER_LEASE) throw fail(`สัญญาหนึ่งมี API key ที่ใช้งานได้สูงสุด ${MAX_KEYS_PER_LEASE} อัน`, 409, "CONFLICT");
  const { key, prefix, hash, cipher } = generateApiKey();
  await db.query(SQL.insertApiKey, [leaseId, req.body.label.trim(), prefix, hash, cipher, req.actor.name]);
  res.status(201).json({ message: "สร้าง API key เรียบร้อยแล้ว", api_key: key, api_keys: await loadApiKeys(db, leaseId) });
});

router.get("/api-keys/:id/reveal", canOperateMarket, async (req, res) => {
  const [[row]] = await getPool().query(SQL.apiKeySecret, [parseId(req.params.id)]);
  if (!row) throw fail("ไม่พบ API key นี้", 404, "NOT_FOUND");
  if (!row.key_cipher) throw fail("key นี้ออกก่อนเปิดระบบดูย้อนหลัง ดู key เต็มไม่ได้ กรุณาออก key ใหม่ให้ผู้เช่า", 409, "CONFLICT");
  let key;
  try {
    key = decryptApiKey(row.key_cipher);
  } catch {
    throw fail("ถอดรหัส key ไม่ได้ กรุณาออก key ใหม่ให้ผู้เช่า", 409, "CONFLICT");
  }
  if (hashApiKey(key) !== row.key_hash) throw fail("ข้อมูล key ไม่ตรงกัน กรุณาออก key ใหม่ให้ผู้เช่า", 409, "CONFLICT");
  res.setHeader("Cache-Control", "no-store");
  res.json({ api_key: key, revoked: Boolean(row.revoked_at) });
});

router.post("/api-keys/:id/rotate", canOperateMarket, async (req, res) => {
  const db = getPool();
  const [[oldKey]] = await db.query(SQL.apiKeyForRotate, [parseId(req.params.id)]);
  if (!oldKey) throw fail("ไม่พบ API key นี้", 404, "NOT_FOUND");
  if (oldKey.revoked_at) throw fail("key นี้ถูกยกเลิกไปแล้ว", 409, "CONFLICT");
  const lease = await loadLease(db, oldKey.lease_id);
  if (lease.status === "terminated" || lease.status === "expired") throw fail("สัญญานี้สิ้นสุดแล้ว ออก API key ไม่ได้", 409, "CONFLICT");
  const { key, prefix, hash, cipher } = generateApiKey();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [revoked] = await connection.query(SQL.revokeKey, [req.actor.name, oldKey.id]);
    if (revoked.affectedRows === 0) throw fail("key นี้ถูกยกเลิกไปแล้ว", 409, "CONFLICT");
    await connection.query(SQL.insertApiKey, [oldKey.lease_id, oldKey.label, prefix, hash, cipher, req.actor.name]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.status(201).json({ message: "ออก key ใหม่แทนเรียบร้อยแล้ว key เดิมถูกยกเลิก", api_key: key, api_keys: await loadApiKeys(db, oldKey.lease_id) });
});

router.post("/api-keys/:id/revoke", canOperateMarket, async (req, res) => {
  const db = getPool();
  const keyId = parseId(req.params.id);
  const [[key]] = await db.query(SQL.apiKeyLease, [keyId]);
  if (!key) throw fail("ไม่พบ API key นี้", 404, "NOT_FOUND");
  await db.query(SQL.revokeKey, [req.actor.name, keyId]);
  res.json({ message: "ยกเลิก API key เรียบร้อยแล้ว", api_keys: await loadApiKeys(db, key.lease_id) });
});

export default router;
