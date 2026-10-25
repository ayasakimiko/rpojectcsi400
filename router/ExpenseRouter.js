import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { expenseRecorded } from "./notificationEvents.js";
import {
  EXPENSE_MAX_PHOTOS,
  isPositiveId,
  parsePage,
  parsePhotoList,
  validateDateQuery,
  validateExpenseInput,
} from "../middleware/validation.js";
import { deletePublicImages, parseStoredPhotos, savePublicImages } from "../middleware/publicUploads.js";

// ตั้งค่า Router และฟังก์ชันกลางสำหรับผู้บันทึก ข้อมูลรายจ่าย และรูปหลักฐาน
const router = Router();

const EXPENSE_LOG_PAGE_SIZE = 20;
const RECORDER_ROLE_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };
const PHOTO_FOLDER = "expenses";

async function getRecorderName(pool, user) {
  const table = RECORDER_ROLE_TABLE[user?.role];
  if (!table) return null;
  const [rows] = await pool.query(`SELECT first_name, last_name FROM ${table} WHERE id = ?`, [user.id]);
  const row = rows[0];
  return row ? `${row.first_name} ${row.last_name}` : null;
}

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

const EXPENSE_EDITABLE_COLUMNS = [
  "category",
  "description",
  "amount",
  "expense_date",
  "vendor",
  "payment_method",
  "receipt_number",
  "room_number",
];

const optionalText = (value) => (typeof value === "string" ? value.trim() || null : null);
const optionalRoom = (value) => (value === undefined || value === null || value === "" ? null : Number(value));

function sanitizeExpense(body) {
  const sanitized = {};
  if (typeof body.category === "string") sanitized.category = body.category.trim();
  if (Object.prototype.hasOwnProperty.call(body, "amount")) sanitized.amount = Number(body.amount);
  if (Object.prototype.hasOwnProperty.call(body, "expense_date")) sanitized.expense_date = body.expense_date;
  for (const field of ["description", "vendor", "receipt_number"]) {
    if (Object.prototype.hasOwnProperty.call(body, field)) sanitized[field] = optionalText(body[field]);
  }
  if (Object.prototype.hasOwnProperty.call(body, "payment_method")) sanitized.payment_method = body.payment_method || null;
  if (Object.prototype.hasOwnProperty.call(body, "room_number")) sanitized.room_number = optionalRoom(body.room_number);
  return sanitized;
}

const photoUrls = (photos) => photos.map((photo) => photo.url);
const serializePhotos = (photos) => (photos.length > 0 ? JSON.stringify(photos) : null);

// แสดงรายการและสรุปรายจ่าย พร้อมการค้นหา กรองวันที่ และแบ่งหน้า
router.get("/", async (req, res) => {
  try {
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });

    const pool = getPool();
    const requestedPageSize = Number(req.query.pageSize);
    const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize >= 1 && requestedPageSize <= EXPENSE_LOG_PAGE_SIZE
      ? requestedPageSize
      : EXPENSE_LOG_PAGE_SIZE;

    const conditions = ["deleted_at IS NULL"];
    const params = [];
    if (typeof req.query.from === "string" && req.query.from) {
      conditions.push(`expense_date >= ?`);
      params.push(req.query.from);
    }
    if (typeof req.query.to === "string" && req.query.to) {
      conditions.push(`expense_date <= ?`);
      params.push(req.query.to);
    }
    const dateWhere = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const dateParams = [...params];

    if (typeof req.query.category === "string" && req.query.category) {
      conditions.push(`category = ?`);
      params.push(req.query.category.slice(0, 50));
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    if (search) {
      const like = `%${search}%`;
      conditions.push(
        `(category LIKE ? OR description LIKE ? OR vendor LIKE ? OR receipt_number LIKE ? OR recorded_by_name LIKE ? OR CAST(room_number AS CHAR) LIKE ?)`,
      );
      params.push(like, like, like, like, like, like);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS totalAmount FROM Expense ${whereClause}`, params);
    const totalPages = Math.max(1, Math.ceil(countRows[0].total / pageSize));
    const page = Math.min(parsePage(req.query.page), totalPages);
    const offset = (page - 1) * pageSize;

    const [expenses] = await pool.query(
      `SELECT id, category, description, vendor, payment_method, receipt_number, room_number, photos,
              amount, expense_date, recorded_by_name, created_at
       FROM Expense ${whereClause}
       ORDER BY expense_date DESC, created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    const [byCategory] = await pool.query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM Expense ${dateWhere}
       GROUP BY category
       ORDER BY total DESC`,
      dateParams,
    );

    return res.json({
      expenses: expenses.map((expense) => ({ ...expense, photos: parseStoredPhotos(expense.photos) })),
      byCategory,
      total: countRows[0].total,
      totalAmount: countRows[0].totalAmount,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Fetch expenses error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

// จัดการรายจ่าย เพิ่ม แก้ไข และลบ พร้อมรูปหลักฐานประกอบ
router.post("/", async (req, res) => {
  try {
    const body = req.body ?? {};
    const validationError = validateExpenseInput(body, { partial: false });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    const newPhotos = parsePhotoList(body.photos, EXPENSE_MAX_PHOTOS);
    if (newPhotos.error) return res.status(400).json({ message: newPhotos.error });
    if (body.photos !== undefined && newPhotos.value.length === 0) {
      return res.status(400).json({ message: "กรุณาแนบรูปใบเสร็จหรือหลักฐานอย่างน้อย 1 รูป" });
    }

    const pool = getPool();
    const recordedByName = await getRecorderName(pool, req.user);
    const expense = sanitizeExpense(body);
    const savedPhotos = await savePublicImages(PHOTO_FOLDER, newPhotos.value);
    try {
      const [result] = await pool.query(
        `INSERT INTO Expense (category, description, vendor, payment_method, receipt_number, room_number, photos, amount, expense_date, recorded_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          expense.category,
          expense.description ?? null,
          expense.vendor ?? null,
          expense.payment_method ?? null,
          expense.receipt_number ?? null,
          expense.room_number ?? null,
          serializePhotos(savedPhotos),
          expense.amount,
          expense.expense_date,
          recordedByName,
        ],
      );
      await expenseRecorded({ id: result.insertId, ...expense }, req.user);
      return res.status(201).json({ message: "บันทึกรายจ่ายสำเร็จ", expenseId: result.insertId });
    } catch (insertError) {
      await deletePublicImages(photoUrls(savedPhotos));
      throw insertError;
    }
  } catch (error) {
    console.error("Create expense error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const expenseId = Number(req.params.id);
    if (!isPositiveId(expenseId)) {
      return res.status(400).json({ message: "รหัสรายจ่ายไม่ถูกต้อง" });
    }

    const body = req.body ?? {};
    const validationError = validateExpenseInput(body, { partial: true });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const pool = getPool();
    const [rows] = await pool.query(`SELECT photos FROM Expense WHERE id = ? AND deleted_at IS NULL`, [expenseId]);
    if (!rows[0]) {
      return res.status(404).json({ message: "ไม่พบรายการรายจ่ายนี้" });
    }
    const existingPhotos = parseStoredPhotos(rows[0].photos);

    const touchesPhotos = body.keep_photos !== undefined || body.photos !== undefined;
    let keptPhotos = existingPhotos;
    if (body.keep_photos !== undefined) {
      if (!Array.isArray(body.keep_photos)) return res.status(400).json({ message: "รายการรูปที่เก็บไว้ไม่ถูกต้อง" });
      const keepUrls = new Set(body.keep_photos);
      keptPhotos = existingPhotos.filter((photo) => keepUrls.has(photo.url));
    }
    const newPhotos = parsePhotoList(body.photos, EXPENSE_MAX_PHOTOS);
    if (newPhotos.error) return res.status(400).json({ message: newPhotos.error });
    if (keptPhotos.length + newPhotos.value.length > EXPENSE_MAX_PHOTOS) {
      return res.status(400).json({ message: `แนบรูปได้ไม่เกิน ${EXPENSE_MAX_PHOTOS} รูป` });
    }
    if (touchesPhotos && keptPhotos.length + newPhotos.value.length === 0) {
      return res.status(400).json({ message: "กรุณาแนบรูปใบเสร็จหรือหลักฐานอย่างน้อย 1 รูป" });
    }

    const { columns, values } = buildUpdate(EXPENSE_EDITABLE_COLUMNS, sanitizeExpense(body));
    if (columns.length === 0 && !touchesPhotos) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const savedPhotos = await savePublicImages(PHOTO_FOLDER, newPhotos.value);
    if (touchesPhotos) {
      columns.push("photos = ?");
      values.push(serializePhotos([...keptPhotos, ...savedPhotos]));
    }
    try {
      await pool.query(`UPDATE Expense SET ${columns.join(", ")} WHERE id = ? AND deleted_at IS NULL`, [...values, expenseId]);
    } catch (updateError) {
      await deletePublicImages(photoUrls(savedPhotos));
      throw updateError;
    }

    if (touchesPhotos) {
      const keptUrls = new Set(photoUrls(keptPhotos));
      await deletePublicImages(photoUrls(existingPhotos).filter((url) => !keptUrls.has(url)));
    }
    return res.json({ message: "แก้ไขรายจ่ายสำเร็จ" });
  } catch (error) {
    console.error("Update expense error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!RECORDER_ROLE_TABLE[req.user?.role]) {
      return res.status(403).json({ message: "ไม่ได้รับอนุญาต" });
    }

    const expenseId = Number(req.params.id);
    if (!isPositiveId(expenseId)) {
      return res.status(400).json({ message: "รหัสรายจ่ายไม่ถูกต้อง" });
    }

    const pool = getPool();
    const deletedByName = await getRecorderName(pool, req.user);
    const [result] = await pool.query(
      `UPDATE Expense SET deleted_at = CURRENT_TIMESTAMP, deleted_by_name = ? WHERE id = ? AND deleted_at IS NULL`,
      [deletedByName, expenseId],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบรายการรายจ่ายนี้" });
    }

    return res.json({ message: "ลบรายจ่ายสำเร็จ" });
  } catch (error) {
    console.error("Delete expense error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
