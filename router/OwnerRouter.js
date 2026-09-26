import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../Database/connection.js";
import { authenticate, requireOwnerRole } from "../middleware/authMiddleware.js";
import {
  isPositiveId,
  lookup,
  normalizePersonUpdate,
  parsePage,
  parseSearch,
  parseYearMonthQuery,
  validateDateQuery,
  validatePersonInput,
  validatePersonUpdateInput,
} from "../middleware/validation.js";
import expenseRouter from "./ExpenseRouter.js";

const router = Router();

router.use(authenticate, requireOwnerRole);
router.use("/expenses", expenseRouter);

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

const PAYMENT_LOG_PAGE_SIZE = 10;

function getSelectedMonthRange(query) {
  const yearMonth = parseYearMonthQuery(query);
  if (!yearMonth) return null;
  const { year, month } = yearMonth;

  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const toExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { from, toExclusive };
}

router.get("/overview", async (req, res) => {
  try {
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });

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
    let dateConditions = [];
    if (from || to) {
      if (from) { dateConditions.push(">= ?"); rangeParams.push(from); }
      if (to) { dateConditions.push("<= ?"); rangeParams.push(to); }
    } else {
      const selectedRange = getSelectedMonthRange(req.query);
      if (selectedRange) {
        dateConditions = [">= ?", "< ?"];
        rangeParams = [selectedRange.from, selectedRange.toExclusive];
      }
    }

    const incomeDateClause = dateConditions.length
      ? `AND ${dateConditions.map((c) => `payment_date ${c}`).join(" AND ")}`
      : "";
    const expenseDateClause = dateConditions.length
      ? `WHERE ${dateConditions.map((c) => `expense_date ${c}`).join(" AND ")}`
      : "";
    const overduePaymentClause = dateConditions.length
      ? `AND ${dateConditions.map((c) => `p.payment_date ${c}`).join(" AND ")}`
      : "";
    const maintenanceDateClause = dateConditions.length
      ? `AND ${dateConditions.map((c) => `mr.created_at ${c}`).join(" AND ")}`
      : "";

    const [[{ total: incomeTotal }]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM Payment WHERE status = 'paid' ${incomeDateClause}`,
      rangeParams,
    );
    const [[{ total: expenseTotal }]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM Expense ${expenseDateClause}`,
      rangeParams,
    );

    // Rooms currently booked with no paid payment inside the selected window (or
    // this month, when no filter is given) — the same rule /rooms/status uses live,
    // generalized to whatever period the owner has selected.
    const [[{ overdueCount }]] = await pool.query(
      `SELECT COUNT(*) AS overdueCount
       FROM Room r
       WHERE r.is_booked = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM Booking b
           JOIN Payment p ON p.booking_id = b.id
           WHERE b.room_id = r.id AND p.status = 'paid' ${overduePaymentClause}
         )`,
      rangeParams,
    );

    // Rooms with a maintenance request still open, filed inside the selected
    // window (or all currently open ones, when no filter is given).
    const [[{ maintenanceCount }]] = await pool.query(
      `SELECT COUNT(DISTINCT mr.room_number) AS maintenanceCount
       FROM MaintenanceRequest mr
       WHERE mr.status IN ('pending', 'accepted') ${maintenanceDateClause}`,
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
        overdueRoomsCount: Number(overdueCount) || 0,
        maintenanceRoomsCount: Number(maintenanceCount) || 0,
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
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });

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
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });

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

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TRENDS_DAILY_THRESHOLD_DAYS = 31;

router.get("/trends", async (req, res) => {
  try {
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });

    const pool = getPool();

    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : null;

    const toDate = to ? new Date(`${to}T00:00:00`) : new Date();
    const fromDate = from ? new Date(`${from}T00:00:00`) : new Date(toDate.getFullYear(), toDate.getMonth() - 5, 1);

    const daySpan = Math.round((toDate - fromDate) / 86400000) + 1;

    if (daySpan >= 1 && daySpan <= TRENDS_DAILY_THRESHOLD_DAYS) {
      const fromKey = toDateKey(fromDate);
      const toKey = toDateKey(toDate);

      const [incomeRows] = await pool.query(
        `SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS period, COALESCE(SUM(amount), 0) AS total
         FROM Payment
         WHERE status = 'paid' AND payment_date >= ? AND payment_date <= ?
         GROUP BY period`,
        [fromKey, toKey],
      );
      const [expenseRows] = await pool.query(
        `SELECT DATE_FORMAT(expense_date, '%Y-%m-%d') AS period, COALESCE(SUM(amount), 0) AS total
         FROM Expense
         WHERE expense_date >= ? AND expense_date <= ?
         GROUP BY period`,
        [fromKey, toKey],
      );

      const incomeByDay = new Map(incomeRows.map((row) => [row.period, Number(row.total)]));
      const expenseByDay = new Map(expenseRows.map((row) => [row.period, Number(row.total)]));

      const trends = [];
      const cursor = new Date(fromDate);
      for (let i = 0; i < daySpan; i += 1) {
        const key = toDateKey(cursor);
        const income = incomeByDay.get(key) || 0;
        const expense = expenseByDay.get(key) || 0;
        trends.push({ period: key, income, expense, netProfit: income - expense });
        cursor.setDate(cursor.getDate() + 1);
      }

      return res.json({ trends, granularity: "day" });
    }

    const rangeEndMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
    const rangeStartMonthRaw = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);

    const monthsSpan = Math.min(
      24,
      Math.max(
        1,
        (rangeEndMonth.getFullYear() - rangeStartMonthRaw.getFullYear()) * 12 +
          (rangeEndMonth.getMonth() - rangeStartMonthRaw.getMonth()) +
          1,
      ),
    );
    const rangeStartMonth = new Date(rangeEndMonth.getFullYear(), rangeEndMonth.getMonth() - (monthsSpan - 1), 1);
    const rangeStartKey = `${rangeStartMonth.getFullYear()}-${String(rangeStartMonth.getMonth() + 1).padStart(2, "0")}-01`;

    const [incomeRows] = await pool.query(
      `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS period, COALESCE(SUM(amount), 0) AS total
       FROM Payment
       WHERE status = 'paid' AND payment_date >= ?
       GROUP BY period`,
      [rangeStartKey],
    );
    const [expenseRows] = await pool.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m') AS period, COALESCE(SUM(amount), 0) AS total
       FROM Expense
       WHERE expense_date >= ?
       GROUP BY period`,
      [rangeStartKey],
    );

    const incomeByMonth = new Map(incomeRows.map((row) => [row.period, Number(row.total)]));
    const expenseByMonth = new Map(expenseRows.map((row) => [row.period, Number(row.total)]));

    const trends = [];
    for (let i = monthsSpan - 1; i >= 0; i -= 1) {
      const d = new Date(rangeEndMonth.getFullYear(), rangeEndMonth.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const income = incomeByMonth.get(key) || 0;
      const expense = expenseByMonth.get(key) || 0;
      trends.push({ period: key, income, expense, netProfit: income - expense });
    }

    return res.json({ trends, granularity: "month" });
  } catch (error) {
    console.error("Owner fetch trends error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/occupancy-trend", async (req, res) => {
  try {
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });

    const pool = getPool();

    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : null;

    const toDate = to ? new Date(`${to}T00:00:00`) : new Date();
    const fromDate = from ? new Date(`${from}T00:00:00`) : new Date(toDate.getFullYear(), toDate.getMonth() - 5, 1);

    const daySpan = Math.round((toDate - fromDate) / 86400000) + 1;

    if (daySpan >= 1 && daySpan <= TRENDS_DAILY_THRESHOLD_DAYS) {
      const fromKey = toDateKey(fromDate);
      const toKey = toDateKey(toDate);

      const [rows] = await pool.query(
        `SELECT DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS period, total_rooms, occupied_count, vacant_count
         FROM RoomOccupancySnapshot
         WHERE snapshot_date <= ?
         ORDER BY snapshot_date ASC`,
        [toKey],
      );
      const byDay = new Map(rows.map((row) => [row.period, row]));

      let lastKnown = null;
      for (const row of rows) {
        if (row.period > fromKey) break;
        lastKnown = row;
      }

      const trends = [];
      const cursor = new Date(fromDate);
      for (let i = 0; i < daySpan; i += 1) {
        const key = toDateKey(cursor);
        if (byDay.has(key)) lastKnown = byDay.get(key);
        trends.push({
          period: key,
          occupied: lastKnown ? Number(lastKnown.occupied_count) : 0,
          vacant: lastKnown ? Number(lastKnown.vacant_count) : 0,
          total: lastKnown ? Number(lastKnown.total_rooms) : 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      return res.json({ trends, granularity: "day" });
    }

    const rangeEndMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
    const rangeStartMonthRaw = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);

    const monthsSpan = Math.min(
      24,
      Math.max(
        1,
        (rangeEndMonth.getFullYear() - rangeStartMonthRaw.getFullYear()) * 12 +
          (rangeEndMonth.getMonth() - rangeStartMonthRaw.getMonth()) +
          1,
      ),
    );
    const rangeStartMonth = new Date(rangeEndMonth.getFullYear(), rangeEndMonth.getMonth() - (monthsSpan - 1), 1);
    const rangeStartKey = `${rangeStartMonth.getFullYear()}-${String(rangeStartMonth.getMonth() + 1).padStart(2, "0")}`;

    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(snapshot_date, '%Y-%m') AS period,
              AVG(total_rooms) AS total_rooms, AVG(occupied_count) AS occupied_count, AVG(vacant_count) AS vacant_count
       FROM RoomOccupancySnapshot
       WHERE snapshot_date <= ?
       GROUP BY period
       ORDER BY period ASC`,
      [toDateKey(toDate)],
    );
    const byMonth = new Map(rows.map((row) => [row.period, row]));

    let lastKnownMonth = null;
    for (const row of rows) {
      if (row.period >= rangeStartKey) break;
      lastKnownMonth = row;
    }

    const trends = [];
    for (let i = monthsSpan - 1; i >= 0; i -= 1) {
      const d = new Date(rangeEndMonth.getFullYear(), rangeEndMonth.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (byMonth.has(key)) lastKnownMonth = byMonth.get(key);
      trends.push({
        period: key,
        occupied: lastKnownMonth ? Math.round(Number(lastKnownMonth.occupied_count)) : 0,
        vacant: lastKnownMonth ? Math.round(Number(lastKnownMonth.vacant_count)) : 0,
        total: lastKnownMonth ? Math.round(Number(lastKnownMonth.total_rooms)) : 0,
      });
    }

    return res.json({ trends, granularity: "month" });
  } catch (error) {
    console.error("Owner fetch occupancy trend error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/rooms/:roomNumber", async (req, res) => {
  try {
    const roomNumber = Number(req.params.roomNumber);
    if (!isPositiveId(roomNumber)) {
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

router.get("/logs/payments", async (req, res) => {
  try {
    const dateError = validateDateQuery(req.query, ["date", "from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });

    const pool = getPool();
    const page = parsePage(req.query.page);
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
    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(
        `(CAST(room_number AS CHAR) LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ? OR note LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.onlyOverdue === "true") {
      conditions.push(`status != 'paid'`);
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

const OCCUPANCY_LOG_PAGE_SIZE = 10;

router.get("/logs/occupancy", async (req, res) => {
  try {
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });

    const pool = getPool();
    const page = parsePage(req.query.page);
    const offset = (page - 1) * OCCUPANCY_LOG_PAGE_SIZE;

    const conditions = [];
    const params = [];

    if (typeof req.query.from === "string" && req.query.from) {
      conditions.push(`DATE(event_date) >= ?`);
      params.push(req.query.from);
    }
    if (typeof req.query.to === "string" && req.query.to) {
      conditions.push(`DATE(event_date) <= ?`);
      params.push(req.query.to);
    }
    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(`(CAST(room_number AS CHAR) LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (req.query.type === "move_in" || req.query.type === "move_out") {
      conditions.push(`event_type = ?`);
      params.push(req.query.type);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Combines Booking rows (move-in, permanent history) with approved "moveout"
    // TenantRequest rows (move-out) into one chronological tenancy log.
    const combinedQuery = `
      SELECT CONCAT('movein-', b.id) AS id, b.created_at AS event_date, 'move_in' AS event_type,
             r.room_number, c.first_name, c.last_name, c.phone, NULL AS note
      FROM Booking b
      JOIN Customer c ON c.id = b.customer_id
      JOIN Room r ON r.id = b.room_id

      UNION ALL

      SELECT CONCAT('moveout-', tr.id) AS id, tr.completed_at AS event_date, 'move_out' AS event_type,
             tr.room_number, c.first_name, c.last_name, c.phone, tr.note
      FROM TenantRequest tr
      JOIN Customer c ON c.id = tr.customer_id
      WHERE tr.type = 'moveout' AND tr.status = 'approved'
    `;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM (${combinedQuery}) AS combined ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const [logs] = await pool.query(
      `SELECT * FROM (${combinedQuery}) AS combined
       ${whereClause}
       ORDER BY event_date DESC
       LIMIT ? OFFSET ?`,
      [...params, OCCUPANCY_LOG_PAGE_SIZE, offset],
    );

    return res.json({ logs, total, page, pageSize: OCCUPANCY_LOG_PAGE_SIZE });
  } catch (error) {
    console.error("Owner fetch occupancy log error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const STAFF_MANAGEABLE_TABLES = { Staff: "Staff", Admin: "Admin" };

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
    const table = lookup(STAFF_MANAGEABLE_TABLES, role);
    if (!table) {
      return res.status(400).json({ message: "ตำแหน่งไม่ถูกต้อง (ต้องเป็น Staff หรือ Admin)" });
    }

    const validationError = validatePersonInput({ idcard, password, phone, first_name, last_name, age });
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
    const table = lookup(STAFF_MANAGEABLE_TABLES, req.params.role);
    if (!table) {
      return res.status(400).json({ message: "ตำแหน่งไม่ถูกต้อง (ต้องเป็น Staff หรือ Admin)" });
    }
    const staffId = Number(req.params.id);
    if (!isPositiveId(staffId)) {
      return res.status(400).json({ message: "รหัสไม่ถูกต้อง" });
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
    const table = lookup(STAFF_MANAGEABLE_TABLES, req.params.role);
    if (!table) {
      return res.status(400).json({ message: "ตำแหน่งไม่ถูกต้อง (ต้องเป็น Staff หรือ Admin)" });
    }
    const staffId = Number(req.params.id);
    if (!isPositiveId(staffId)) {
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
    const table = lookup(STAFF_MANAGEABLE_TABLES, req.params.role);
    if (!table) {
      return res.status(400).json({ message: "ตำแหน่งไม่ถูกต้อง (ต้องเป็น Staff หรือ Admin)" });
    }
    const staffId = Number(req.params.id);
    if (!isPositiveId(staffId)) {
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
