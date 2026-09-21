import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../Database/connection.js";
import { authenticate, requireOwnerRole } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authenticate, requireOwnerRole);

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

async function getOwnerName(pool, user) {
  const [rows] = await pool.query(`SELECT first_name, last_name FROM Owner WHERE id = ?`, [user.id]);
  const row = rows[0];
  return row ? `${row.first_name} ${row.last_name}` : null;
}

const LOG_PAGE_SIZE = 20;
const PAYMENT_LOG_PAGE_SIZE = 10;

function getSelectedMonthRange(query) {
  const year = Number(query.year);
  const month = Number(query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;

  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const toExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { from, toExclusive };
}

router.get("/overview", async (req, res) => {
  try {
    const pool = getPool();

    const [roomRows] = await pool.query(
      `SELECT COUNT(*) AS totalRooms, SUM(is_booked = TRUE) AS occupiedRooms FROM Room`,
    );
    const totalRooms = roomRows[0].totalRooms;
    const occupiedRooms = Number(roomRows[0].occupiedRooms) || 0;
    const vacantRooms = totalRooms - occupiedRooms;

    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : null;

    let rangeParams = [];
    let incomeDateClause = "";
    let expenseDateClause = "";
    if (from || to) {
      const conditions = [];
      if (from) { conditions.push(">= ?"); rangeParams.push(from); }
      if (to) { conditions.push("<= ?"); rangeParams.push(to); }
      incomeDateClause = `AND ${conditions.map((c) => `payment_date ${c}`).join(" AND ")}`;
      expenseDateClause = `WHERE ${conditions.map((c) => `expense_date ${c}`).join(" AND ")}`;
    } else {
      const selectedRange = getSelectedMonthRange(req.query);
      if (selectedRange) {
        rangeParams = [selectedRange.from, selectedRange.toExclusive];
        incomeDateClause = "AND payment_date >= ? AND payment_date < ?";
        expenseDateClause = "WHERE expense_date >= ? AND expense_date < ?";
      }
    }

    const [[{ total: incomeTotal }]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM Payment WHERE status = 'paid' ${incomeDateClause}`,
      rangeParams,
    );
    const [[{ total: expenseTotal }]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM Expense ${expenseDateClause}`,
      rangeParams,
    );

    const totalIncome = Number(incomeTotal);
    const totalExpense = Number(expenseTotal);

    return res.json({
      rooms: {
        totalRooms,
        occupiedRooms,
        vacantRooms,
        occupancyRate: totalRooms > 0 ? occupiedRooms / totalRooms : 0,
      },
      finance: { totalIncome, totalExpense, netProfit: totalIncome - totalExpense },
    });
  } catch (error) {
    console.error("Owner fetch overview error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/status", async (req, res) => {
  try {
    const pool = getPool();
    const [rooms] = await pool.query(
      `SELECT r.room_number, r.is_booked, r.price, r.rental_start_date, r.rental_end_date,
              c.id AS customer_id, c.first_name, c.last_name, c.phone,
              CASE
                WHEN r.is_booked = FALSE THEN 'vacant'
                WHEN EXISTS (
                  SELECT 1 FROM MaintenanceRequest mr
                  WHERE mr.room_number = r.room_number AND mr.status IN ('pending', 'accepted')
                ) THEN 'maintenance'
                WHEN NOT EXISTS (
                  SELECT 1 FROM Booking b
                  JOIN Payment p ON p.booking_id = b.id
                  WHERE b.room_id = r.id AND p.status = 'paid'
                    AND p.payment_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
                ) THEN 'overdue'
                ELSE 'occupied'
              END AS status
       FROM Room r
       LEFT JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
       ORDER BY r.room_number ASC`,
    );
    const vacantRooms = rooms.filter((room) => room.status === "vacant");
    const occupiedRooms = rooms.filter((room) => room.is_booked);

    try {
      await pool.query(
        `INSERT INTO RoomOccupancySnapshot (snapshot_date, total_rooms, occupied_count, vacant_count)
         VALUES (CURDATE(), ?, ?, ?)
         ON DUPLICATE KEY UPDATE total_rooms = VALUES(total_rooms), occupied_count = VALUES(occupied_count), vacant_count = VALUES(vacant_count)`,
        [rooms.length, occupiedRooms.length, vacantRooms.length],
      );
    } catch (snapshotError) {
      console.error("Owner record occupancy snapshot error:", snapshotError);
    }

    return res.json({
      totalRooms: rooms.length,
      vacantCount: vacantRooms.length,
      occupiedCount: occupiedRooms.length,
      vacantRooms,
      rooms,
    });
  } catch (error) {
    console.error("Owner fetch room status error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/occupancy-summary", async (req, res) => {
  try {
    const pool = getPool();

    const liveCountsFallback = async () => {
      const [[liveCounts]] = await pool.query(
        `SELECT COUNT(*) AS totalRooms, COALESCE(SUM(CASE WHEN is_booked = TRUE THEN 1 ELSE 0 END), 0) AS occupiedCount FROM Room`,
      );
      const totalRooms = Number(liveCounts.totalRooms) || 0;
      const occupiedCount = Math.min(totalRooms, Number(liveCounts.occupiedCount) || 0);
      return {
        sampleDays: 0,
        total: totalRooms,
        occupied: occupiedCount,
        vacant: Math.max(0, totalRooms - occupiedCount),
      };
    };

    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : null;

    if (!from && !to) {
      return res.json(await liveCountsFallback());
    }

    const conditions = [];
    const params = [];
    if (from) { conditions.push("snapshot_date >= ?"); params.push(from); }
    if (to) { conditions.push("snapshot_date <= ?"); params.push(to); }

    const [summaryRows] = await pool.query(
      `SELECT AVG(total_rooms) AS avgTotal, AVG(occupied_count) AS avgOccupied, COUNT(*) AS sampleDays
       FROM RoomOccupancySnapshot
       WHERE ${conditions.join(" AND ")}`,
      params,
    );
    const summary = summaryRows[0];

    if (!summary || !summary.sampleDays) {
      return res.json(await liveCountsFallback());
    }

    const total = Math.round(Number(summary.avgTotal) || 0);
    const occupied = Math.min(total, Math.round(Number(summary.avgOccupied) || 0));

    return res.json({
      sampleDays: summary.sampleDays,
      total,
      occupied,
      vacant: Math.max(0, total - occupied),
    });
  } catch (error) {
    console.error("Owner fetch occupancy summary error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/income", async (req, res) => {
  try {
    const pool = getPool();
    const conditions = [`status = 'paid'`];
    const params = [];

    if (typeof req.query.from === "string" && req.query.from) {
      conditions.push(`payment_date >= ?`);
      params.push(req.query.from);
    }
    if (typeof req.query.to === "string" && req.query.to) {
      conditions.push(`payment_date <= ?`);
      params.push(req.query.to);
    }
    const selectedRange = getSelectedMonthRange(req.query);
    if (selectedRange) {
      conditions.push(`payment_date >= ? AND payment_date < ?`);
      params.push(selectedRange.from, selectedRange.toExclusive);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [totalRows] = await pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM Payment ${whereClause}`, params);
    const [byType] = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM Payment ${whereClause} GROUP BY type`,
      params,
    );

    return res.json({ totalIncome: totalRows[0].total, byType });
  } catch (error) {
    console.error("Owner fetch income error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/trends", async (req, res) => {
  try {
    const pool = getPool();
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 6));

    const [incomeRows] = await pool.query(
      `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, COALESCE(SUM(amount), 0) AS total
       FROM Payment
       WHERE status = 'paid' AND payment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month`,
      [months - 1],
    );
    const [expenseRows] = await pool.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month, COALESCE(SUM(amount), 0) AS total
       FROM Expense
       WHERE expense_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month`,
      [months - 1],
    );

    const incomeByMonth = new Map(incomeRows.map((row) => [row.month, Number(row.total)]));
    const expenseByMonth = new Map(expenseRows.map((row) => [row.month, Number(row.total)]));

    const trends = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const income = incomeByMonth.get(key) || 0;
      const expense = expenseByMonth.get(key) || 0;
      trends.push({ month: key, income, expense, netProfit: income - expense });
    }

    return res.json({ trends });
  } catch (error) {
    console.error("Owner fetch trends error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/:roomNumber", async (req, res) => {
  try {
    const roomNumber = Number(req.params.roomNumber);
    if (!Number.isInteger(roomNumber) || roomNumber < 1) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [roomRows] = await pool.query(
      `SELECT r.id, r.room_number, r.is_booked, r.price, r.rental_start_date, r.rental_end_date,
              r.air_conditioner, r.wifi, r.refrigerator, r.bed, r.bathroom, r.cctv,
              r.electricity_unit_price, r.water_price,
              c.id AS customer_id, c.first_name, c.last_name, c.phone, c.deposit_amount
       FROM Room r
       LEFT JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
       WHERE r.room_number = ?`,
      [roomNumber],
    );
    const room = roomRows[0];
    if (!room) return res.status(404).json({ message: "ไม่พบห้องพักนี้" });

    let payments = [];
    if (room.customer_id) {
      const [paymentRows] = await pool.query(
        `SELECT p.id, p.amount, p.payment_date, p.status, p.type, p.note
         FROM Payment p
         JOIN Booking b ON b.id = p.booking_id
         WHERE b.room_id = ? AND b.customer_id = ?
         ORDER BY p.payment_date DESC, p.created_at DESC`,
        [room.id, room.customer_id],
      );
      payments = paymentRows;
    }

    return res.json({ room, tenant: room.customer_id ? room : null, payments });
  } catch (error) {
    console.error("Owner fetch room detail error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

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

router.get("/expenses", async (req, res) => {
  try {
    const pool = getPool();
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * LOG_PAGE_SIZE;

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
      [...params, LOG_PAGE_SIZE, offset],
    );

    return res.json({
      expenses,
      total: countRows[0].total,
      totalAmount: countRows[0].totalAmount,
      page,
      pageSize: LOG_PAGE_SIZE,
    });
  } catch (error) {
    console.error("Owner fetch expenses error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/expenses", async (req, res) => {
  try {
    const { category, description, amount, expense_date } = req.body ?? {};
    const validationError = validateExpenseInput({ category, description, amount, expense_date });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const pool = getPool();
    const recordedByName = await getOwnerName(pool, req.user);
    const [result] = await pool.query(
      `INSERT INTO Expense (category, description, amount, expense_date, recorded_by_name) VALUES (?, ?, ?, ?, ?)`,
      [category.trim(), description?.trim() || null, Number(amount), expense_date, recordedByName],
    );

    return res.status(201).json({ message: "บันทึกรายจ่ายสำเร็จ", expenseId: result.insertId });
  } catch (error) {
    console.error("Owner create expense error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const EXPENSE_EDITABLE_COLUMNS = ["category", "description", "amount", "expense_date"];

router.put("/expenses/:id", async (req, res) => {
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
    console.error("Owner update expense error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/expenses/:id", async (req, res) => {
  try {
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
    console.error("Owner delete expense error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/logs/payments", async (req, res) => {
  try {
    const pool = getPool();
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * PAYMENT_LOG_PAGE_SIZE;

    const conditions = [];
    const params = [];

    if (typeof req.query.date === "string" && req.query.date) {
      conditions.push(`payment_date = ?`);
      params.push(req.query.date);
    }
    if (typeof req.query.from === "string" && req.query.from) {
      conditions.push(`payment_date >= ?`);
      params.push(req.query.from);
    }
    if (typeof req.query.to === "string" && req.query.to) {
      conditions.push(`payment_date <= ?`);
      params.push(req.query.to);
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      conditions.push(
        `(CAST(room_number AS CHAR) LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ? OR note LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.onlyOverdue === "true") {
      conditions.push(
        `(COALESCE(room_price, 0) + COALESCE(unpaid_utilities, 0) - COALESCE(deposit_amount, 0)) > 0`,
      );
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Combines real Payment rows with one synthetic "ค่าห้อง" (room fee) row per
    // currently booked tenant, reflecting room price minus deposit at query time.
    const combinedQuery = `
      SELECT CONCAT('payment-', p.id) AS id, p.amount, p.payment_date, p.status, p.type, p.note, p.created_at,
             c.id AS customer_id, c.first_name, c.last_name, c.room_number, c.deposit_amount,
             r.price AS room_price,
             COALESCE((
               SELECT SUM(p2.amount) FROM Payment p2
               JOIN Booking b2 ON b2.id = p2.booking_id
               WHERE b2.customer_id = c.id AND p2.status != 'paid' AND p2.type IN ('water', 'electricity')
             ), 0) AS unpaid_utilities
      FROM Payment p
      JOIN Booking b ON b.id = p.booking_id
      JOIN Customer c ON c.id = b.customer_id
      LEFT JOIN Room r ON r.room_number = c.room_number

      UNION ALL

      SELECT CONCAT('room-', c.id) AS id,
             ABS(COALESCE(r.price, 0) - COALESCE(c.deposit_amount, 0)) AS amount,
             CURDATE() AS payment_date,
             CASE WHEN (COALESCE(r.price, 0) - COALESCE(c.deposit_amount, 0)) > 0 THEN 'pending' ELSE 'paid' END AS status,
             'room' AS type,
             CASE
               WHEN (COALESCE(r.price, 0) - COALESCE(c.deposit_amount, 0)) > 0
                 THEN CONCAT('ค่าห้องประจำเดือน ฿', FORMAT(r.price, 0), ' หักเงินมัดจำ ฿', FORMAT(COALESCE(c.deposit_amount, 0), 0), ' คงเหลือค้างชำระ')
               ELSE CONCAT('ค่าห้องประจำเดือน ฿', FORMAT(r.price, 0), ' หักเงินมัดจำ ฿', FORMAT(COALESCE(c.deposit_amount, 0), 0), ' ครอบคลุมครบแล้ว')
             END AS note,
             NOW() AS created_at,
             c.id AS customer_id, c.first_name, c.last_name, c.room_number, c.deposit_amount,
             r.price AS room_price,
             0 AS unpaid_utilities
      FROM Customer c
      JOIN Room r ON r.room_number = c.room_number
      WHERE r.is_booked = 1
    `;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM (${combinedQuery}) AS combined ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const [payments] = await pool.query(
      `SELECT * FROM (${combinedQuery}) AS combined
       ${whereClause}
       ORDER BY payment_date DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, PAYMENT_LOG_PAGE_SIZE, offset],
    );

    return res.json({ payments, total, page, pageSize: PAYMENT_LOG_PAGE_SIZE });
  } catch (error) {
    console.error("Owner fetch payment log error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const STAFF_MANAGEABLE_TABLES = { Staff: "Staff", Admin: "Admin" };

function validateStaffInput({ idcard, password, phone, first_name, last_name, age }) {
  if (
    typeof idcard !== "string" ||
    typeof password !== "string" ||
    typeof phone !== "string" ||
    typeof first_name !== "string" ||
    typeof last_name !== "string"
  ) {
    return "รูปแบบข้อมูลไม่ถูกต้อง";
  }
  if (!idcard.trim() || !password || !phone.trim() || !first_name.trim() || !last_name.trim() || !age) {
    return "กรุณากรอกข้อมูลให้ครบทุกช่อง";
  }
  if (!/^\d{13}$/.test(idcard.trim())) {
    return "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
  }
  if (!/^0\d{8,9}$/.test(phone.trim())) {
    return "เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก";
  }
  if (password.length < 6 || password.length > 128) {
    return "รหัสผ่านต้องมีความยาว 6-128 ตัวอักษร";
  }
  const ageNumber = Number(age);
  if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
    return "อายุไม่ถูกต้อง";
  }
  return null;
}

function validateStaffUpdateInput(body) {
  if (Object.prototype.hasOwnProperty.call(body, "first_name")) {
    if (typeof body.first_name !== "string" || !body.first_name.trim()) {
      return "กรุณาระบุชื่อ";
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "last_name")) {
    if (typeof body.last_name !== "string" || !body.last_name.trim()) {
      return "กรุณาระบุนามสกุล";
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    if (typeof body.phone !== "string" || !/^0\d{8,9}$/.test(body.phone.trim())) {
      return "เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก";
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "age")) {
    const ageNumber = Number(body.age);
    if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
      return "อายุไม่ถูกต้อง";
    }
  }
  return null;
}

router.get("/staff", async (req, res) => {
  try {
    const pool = getPool();
    const [staffRows] = await pool.query(
      `SELECT id, role, idcard, first_name, last_name, phone, age, is_suspended, created_at FROM Staff`,
    );
    const [adminRows] = await pool.query(
      `SELECT id, role, idcard, first_name, last_name, phone, age, is_suspended, created_at FROM Admin`,
    );

    const staff = [...staffRows, ...adminRows].sort(
      (a, b) => Number(a.is_suspended) - Number(b.is_suspended) || a.role.localeCompare(b.role) || a.id - b.id,
    );

    return res.json({ staff });
  } catch (error) {
    console.error("Owner fetch staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/staff", async (req, res) => {
  try {
    const { role, idcard, password, phone, first_name, last_name, age } = req.body ?? {};
    const table = STAFF_MANAGEABLE_TABLES[role];
    if (!table) {
      return res.status(400).json({ message: "ตำแหน่งไม่ถูกต้อง (ต้องเป็น Staff หรือ Admin)" });
    }

    const validationError = validateStaffInput({ idcard, password, phone, first_name, last_name, age });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO ${table} (role, idcard, password, phone, first_name, last_name, age) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [role, idcard.trim(), hashedPassword, phone.trim(), first_name.trim(), last_name.trim(), Number(age)],
    );

    return res.status(201).json({
      message: role === "Admin" ? "เพิ่มผู้ดูแลระบบสำเร็จ" : "เพิ่มพนักงานสำเร็จ",
      id: result.insertId,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      if (error.sqlMessage?.includes("idcard")) {
        return res.status(409).json({ message: "เลขบัตรประชาชนนี้มีอยู่แล้ว" });
      }
      if (error.sqlMessage?.includes("phone")) {
        return res.status(409).json({ message: "เบอร์โทรศัพท์นี้มีอยู่แล้ว" });
      }
    }
    console.error("Owner create staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const STAFF_EDITABLE_COLUMNS = ["first_name", "last_name", "phone", "age"];

router.put("/staff/:role/:id", async (req, res) => {
  try {
    const table = STAFF_MANAGEABLE_TABLES[req.params.role];
    if (!table) {
      return res.status(400).json({ message: "ตำแหน่งไม่ถูกต้อง (ต้องเป็น Staff หรือ Admin)" });
    }
    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId) || staffId < 1) {
      return res.status(400).json({ message: "รหัสไม่ถูกต้อง" });
    }

    const body = req.body ?? {};
    const validationError = validateStaffUpdateInput(body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const sanitizedBody = { ...body };
    if (typeof sanitizedBody.first_name === "string") sanitizedBody.first_name = sanitizedBody.first_name.trim();
    if (typeof sanitizedBody.last_name === "string") sanitizedBody.last_name = sanitizedBody.last_name.trim();
    if (typeof sanitizedBody.phone === "string") sanitizedBody.phone = sanitizedBody.phone.trim();
    if (Object.prototype.hasOwnProperty.call(sanitizedBody, "age")) sanitizedBody.age = Number(sanitizedBody.age);

    const { columns, values } = buildUpdate(STAFF_EDITABLE_COLUMNS, sanitizedBody);

    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 6 || body.password.length > 128) {
        return res.status(400).json({ message: "รหัสผ่านต้องมีความยาว 6-128 ตัวอักษร" });
      }
      columns.push("password = ?");
      values.push(await bcrypt.hash(body.password, 10));
    }

    if (columns.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE ${table} SET ${columns.join(", ")} WHERE id = ?`, [...values, staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    return res.json({ message: "แก้ไขข้อมูลสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เบอร์โทรศัพท์นี้มีอยู่แล้ว" });
    }
    console.error("Owner update staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/staff/:role/:id/suspend", async (req, res) => {
  try {
    const table = STAFF_MANAGEABLE_TABLES[req.params.role];
    if (!table) {
      return res.status(400).json({ message: "ตำแหน่งไม่ถูกต้อง (ต้องเป็น Staff หรือ Admin)" });
    }
    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId) || staffId < 1) {
      return res.status(400).json({ message: "รหัสไม่ถูกต้อง" });
    }
    const { is_suspended } = req.body ?? {};
    if (typeof is_suspended !== "boolean") {
      return res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE ${table} SET is_suspended = ? WHERE id = ?`, [is_suspended, staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    return res.json({ message: is_suspended ? "ระงับการใช้งานสำเร็จ" : "เปิดการใช้งานสำเร็จ" });
  } catch (error) {
    console.error("Owner suspend staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/staff/:role/:id", async (req, res) => {
  try {
    const table = STAFF_MANAGEABLE_TABLES[req.params.role];
    if (!table) {
      return res.status(400).json({ message: "ตำแหน่งไม่ถูกต้อง (ต้องเป็น Staff หรือ Admin)" });
    }
    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId) || staffId < 1) {
      return res.status(400).json({ message: "รหัสไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    return res.json({ message: "ลบพนักงานสำเร็จ" });
  } catch (error) {
    console.error("Owner delete staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
