import { Router } from "express";
import { getPool } from "../Database/connection.js";

const router = Router();

const EXPENSE_LOG_PAGE_SIZE = 20;
const RECORDER_ROLE_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };

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

function validateExpenseInput({ category, description, amount, expense_date }) {
  if (typeof category !== "string" || !category.trim()) {
    return "กรุณาระบุหมวดหมู่รายจ่าย";
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return "รูปแบบคำอธิบายไม่ถูกต้อง";
  }
  const amountValue = Number(amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    return "จำนวนเงินไม่ถูกต้อง";
  }
  if (typeof expense_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    return "วันที่ไม่ถูกต้อง";
  }
  return null;
}

function validateExpenseUpdateInput(body) {
  if (Object.prototype.hasOwnProperty.call(body, "category")) {
    if (typeof body.category !== "string" || !body.category.trim()) {
      return "กรุณาระบุหมวดหมู่รายจ่าย";
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "description") && body.description !== null) {
    if (typeof body.description !== "string") {
      return "รูปแบบคำอธิบายไม่ถูกต้อง";
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "amount")) {
    const amountValue = Number(body.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return "จำนวนเงินไม่ถูกต้อง";
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "expense_date")) {
    if (typeof body.expense_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.expense_date)) {
      return "วันที่ไม่ถูกต้อง";
    }
  }
  return null;
}

const EXPENSE_EDITABLE_COLUMNS = ["category", "description", "amount", "expense_date"];

router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * EXPENSE_LOG_PAGE_SIZE;

    const conditions = [];
    const params = [];
    if (typeof req.query.from === "string" && req.query.from) {
      conditions.push(`expense_date >= ?`);
      params.push(req.query.from);
    }
    if (typeof req.query.to === "string" && req.query.to) {
      conditions.push(`expense_date <= ?`);
      params.push(req.query.to);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS totalAmount FROM Expense ${whereClause}`, params);

    const [expenses] = await pool.query(
      `SELECT id, category, description, amount, expense_date, recorded_by_name, created_at
       FROM Expense ${whereClause}
       ORDER BY expense_date DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, EXPENSE_LOG_PAGE_SIZE, offset],
    );

    const [byCategory] = await pool.query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM Expense ${whereClause}
       GROUP BY category
       ORDER BY total DESC`,
      params,
    );

    return res.json({
      expenses,
      byCategory,
      total: countRows[0].total,
      totalAmount: countRows[0].totalAmount,
      page,
      pageSize: EXPENSE_LOG_PAGE_SIZE,
    });
  } catch (error) {
    console.error("Fetch expenses error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { category, description, amount, expense_date } = req.body ?? {};
    const validationError = validateExpenseInput({ category, description, amount, expense_date });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const pool = getPool();
    const recordedByName = await getRecorderName(pool, req.user);
    const [result] = await pool.query(
      `INSERT INTO Expense (category, description, amount, expense_date, recorded_by_name) VALUES (?, ?, ?, ?, ?)`,
      [category.trim(), description?.trim() || null, Number(amount), expense_date, recordedByName],
    );

    return res.status(201).json({ message: "บันทึกรายจ่ายสำเร็จ", expenseId: result.insertId });
  } catch (error) {
    console.error("Create expense error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const expenseId = Number(req.params.id);
    if (!Number.isInteger(expenseId) || expenseId < 1) {
      return res.status(400).json({ message: "รหัสรายจ่ายไม่ถูกต้อง" });
    }

    const body = req.body ?? {};
    const validationError = validateExpenseUpdateInput(body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const sanitizedBody = { ...body };
    if (typeof sanitizedBody.category === "string") sanitizedBody.category = sanitizedBody.category.trim();
    if (typeof sanitizedBody.description === "string") sanitizedBody.description = sanitizedBody.description.trim() || null;
    if (Object.prototype.hasOwnProperty.call(sanitizedBody, "amount")) sanitizedBody.amount = Number(sanitizedBody.amount);

    const { columns, values } = buildUpdate(EXPENSE_EDITABLE_COLUMNS, sanitizedBody);
    if (columns.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE Expense SET ${columns.join(", ")} WHERE id = ?`, [...values, expenseId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบรายการรายจ่ายนี้" });
    }

    return res.json({ message: "แก้ไขรายจ่ายสำเร็จ" });
  } catch (error) {
    console.error("Update expense error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    // Staff and Admin can log and edit expenses, but only the Owner can delete one.
    if (req.user?.role !== "Owner") {
      return res.status(403).json({ message: "ไม่ได้รับอนุญาต (ต้องเป็นเจ้าของ)" });
    }

    const expenseId = Number(req.params.id);
    if (!Number.isInteger(expenseId) || expenseId < 1) {
      return res.status(400).json({ message: "รหัสรายจ่ายไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`DELETE FROM Expense WHERE id = ?`, [expenseId]);
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
