import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../Database/connection.js";
import { authenticate, createRequireActiveAccount, requireOwnerRole } from "../middleware/authMiddleware.js";
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
import { listSafetyIncidents, reviewSafetyIncident } from "./AdminRouter.js";
import expenseRouter from "./ExpenseRouter.js";
import dormInfoRouter from "./DormInfoRouter.js";
import announcementRouter from "./AnnouncementRouter.js";
import { createNotificationRoutes } from "./notificationRoutes.js";
import { loadPendingNotifications, PENDING_KINDS } from "./pendingNotifications.js";
import { staffAccountChanged } from "./notificationEvents.js";

const router = Router();

const requireActiveOwner = createRequireActiveAccount(getPool);

router.use(authenticate, requireOwnerRole, requireActiveOwner);
router.use("/notifications", createNotificationRoutes({ loadPending: loadPendingNotifications, pendingKinds: PENDING_KINDS }));
router.use("/dorm-info", dormInfoRouter);
router.use("/expenses", expenseRouter);

const PAYMENT_FIELDS = ["promptpay_id", "bank_name", "bank_account_no"];
const SLIP_VERIFY_MODES = new Set(["auto", "manual"]);
router.get("/payment-settings", async (_req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const [rows] = await getPool().query(`SELECT ${PAYMENT_FIELDS.join(", ")}, payment_test_mode, slip_verify_mode FROM DormConfig WHERE id = 1`);
    return res.json({
      settings: Object.fromEntries(PAYMENT_FIELDS.map((field) => [field, rows[0]?.[field] ?? ""])),
      testMode: Boolean(rows[0]?.payment_test_mode),
      verifyMode: rows[0]?.slip_verify_mode === "manual" ? "manual" : "auto",
    });
  } catch (error) {
    console.error("Owner payment settings read error:", error.code);
    return res.status(500).json({ message: "ไม่สามารถโหลดข้อมูลรับโอนได้" });
  }
});

router.put("/payment-settings", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || PAYMENT_FIELDS.some((field) => typeof body[field] !== "string")) {
    return res.status(400).json({ message: "ข้อมูลรับโอนไม่ถูกต้อง" });
  }
  if (body.test_mode !== undefined && typeof body.test_mode !== "boolean") {
    return res.status(400).json({ message: "ค่าโหมดทดลองไม่ถูกต้อง" });
  }
  if (body.verify_mode !== undefined && !SLIP_VERIFY_MODES.has(body.verify_mode)) {
    return res.status(400).json({ message: "วิธีตรวจสลิปไม่ถูกต้อง" });
  }
  const settings = Object.fromEntries(PAYMENT_FIELDS.map((field) => [field, body[field].trim()]));
  if (settings.promptpay_id && !/^(?:0\d{9}|\d{13})$/.test(settings.promptpay_id)) {
    return res.status(400).json({ message: "PromptPay ต้องเป็นเบอร์มือถือ 10 หลักหรือเลขบัตรประชาชน 13 หลัก" });
  }
  if (settings.bank_name.length > 100 || settings.bank_account_no.length > 50 ||
      (settings.bank_account_no && !/^[\d -]+$/.test(settings.bank_account_no))) {
    return res.status(400).json({ message: "ชื่อธนาคารหรือเลขบัญชีไม่ถูกต้อง" });
  }
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO DormConfig (id, ${PAYMENT_FIELDS.join(", ")}) VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ${PAYMENT_FIELDS.map((field) => `${field} = ?`).join(", ")}`,
      [...PAYMENT_FIELDS.map((field) => settings[field]), ...PAYMENT_FIELDS.map((field) => settings[field])],
    );
    if (typeof body.test_mode === "boolean") {
      await pool.query("UPDATE DormConfig SET payment_test_mode = ? WHERE id = 1", [body.test_mode]);
    }
    if (SLIP_VERIFY_MODES.has(body.verify_mode)) {
      await pool.query("UPDATE DormConfig SET slip_verify_mode = ? WHERE id = 1", [body.verify_mode]);
    }
    const [rows] = await pool.query("SELECT payment_test_mode, slip_verify_mode FROM DormConfig WHERE id = 1");
    return res.json({
      message: "บันทึกข้อมูลรับโอนแล้ว",
      settings,
      testMode: Boolean(rows[0]?.payment_test_mode),
      verifyMode: rows[0]?.slip_verify_mode === "manual" ? "manual" : "auto",
    });
  } catch (error) {
    console.error("Owner payment settings save error:", error.code);
    return res.status(500).json({ message: "ไม่สามารถบันทึกข้อมูลรับโอนได้" });
  }
});
router.use("/announcements", announcementRouter);
router.get("/safety-incidents", listSafetyIncidents);
router.patch("/safety-incidents/:id/review", reviewSafetyIncident);

router.get("/parking/summary", async (_req, res) => {
  try {
    const pool = getPool();
    const [[{ parkedCount }]] = await pool.query(
      `SELECT COUNT(DISTINCT vehicle_plate) AS parkedCount
       FROM ResidentVisitRequest
       WHERE request_type = 'vehicle' AND status = 'approved' AND checked_out_at IS NULL
         AND (end_at IS NULL OR end_at > NOW() OR parked_at IS NOT NULL)`,
    );
    const [[{ spaceCount }]] = await pool.query("SELECT COUNT(*) AS spaceCount FROM ParkingSpace WHERE is_active = TRUE");
    const [[fines]] = await pool.query(
      `SELECT COUNT(*) AS unpaidCount, COALESCE(SUM(fine_amount), 0) AS unpaidAmount
       FROM ResidentVisitRequest WHERE fine_status IN ('unpaid', 'pending_review')`,
    );
    const capacityText = process.env.PARKING_CAPACITY?.trim() || "";
    const parsedCapacity = /^\d+$/.test(capacityText) ? Number(capacityText) : NaN;
    const capacity = Number(spaceCount) > 0 ? Number(spaceCount) : Number.isSafeInteger(parsedCapacity) ? parsedCapacity : null;
    const count = Number(parkedCount);
    return res.json({
      parkedCount: count,
      capacity,
      isFull: capacity !== null && count >= capacity,
      unpaidFineCount: Number(fines.unpaidCount),
      unpaidFineAmount: Number(fines.unpaidAmount),
    });
  } catch (error) {
    console.error("Fetch parking summary error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดข้อมูลที่จอดรถได้" });
  }
});

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

const AUDIT_ACTOR_ROLES = ["Customer", "Staff", "Admin"];
const AUDIT_BASE_CONDITIONS = [
  "al.actor_role IN ('Customer', 'Staff', 'Admin')",
  "al.endpoint NOT LIKE '/api/files/%'",
  "al.endpoint NOT LIKE '/api/customer/%acknowledge'",
];

router.get("/logs/audit", async (req, res) => {
  try {
    const pool = getPool();
    const page = parsePage(req.query.page);
    const pageSize = 100;
    const offset = (page - 1) * pageSize;
    const conditions = [...AUDIT_BASE_CONDITIONS];
    const params = [];
    if (AUDIT_ACTOR_ROLES.includes(req.query.role)) {
      conditions.push("al.actor_role = ?");
      params.push(req.query.role);
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.query.method)) {
      conditions.push("al.method = ?");
      params.push(req.query.method);
    }
    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push("(al.endpoint LIKE ? OR al.actor_role LIKE ? OR CAST(al.actor_id AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR CONCAT(s.first_name, ' ', s.last_name) LIKE ? OR CONCAT(a.first_name, ' ', a.last_name) LIKE ? OR CONCAT(o.first_name, ' ', o.last_name) LIKE ?)");
      params.push(...Array(7).fill(`%${search}%`));
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const joins = `
      LEFT JOIN Customer c ON al.actor_role = 'Customer' AND c.id = al.actor_id
      LEFT JOIN Staff s ON al.actor_role = 'Staff' AND s.id = al.actor_id
      LEFT JOIN Admin a ON al.actor_role = 'Admin' AND a.id = al.actor_id
      LEFT JOIN Owner o ON al.actor_role = 'Owner' AND o.id = al.actor_id`;
    const countJoins = search ? joins : "";
    const [[countRows], [logs], [summaryRows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM AuditLog al ${countJoins} ${whereClause}`, params),
      pool.query(
      `SELECT al.id, al.actor_id, al.actor_role, al.method, al.endpoint, al.status_code, al.ip_address, al.details, al.created_at,
              COALESCE(CONCAT(c.first_name, ' ', c.last_name), CONCAT(s.first_name, ' ', s.last_name),
                       CONCAT(a.first_name, ' ', a.last_name), CONCAT(o.first_name, ' ', o.last_name)) AS actor_name
       FROM AuditLog al ${joins} ${whereClause}
       ORDER BY al.created_at DESC, al.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      ),
      pool.query(
        `SELECT COUNT(*) AS total, SUM(created_at >= CURDATE()) AS today,
                COUNT(DISTINCT actor_role, actor_id) AS actors, SUM(method = 'DELETE') AS deletes
         FROM AuditLog al WHERE ${AUDIT_BASE_CONDITIONS.join(" AND ")}`,
      ),
    ]);
    const summary = Object.fromEntries(
      Object.entries(summaryRows[0]).map(([key, value]) => [key, Number(value) || 0]),
    );
    return res.json({ logs, total: countRows[0].total, page, pageSize, summary });
  } catch (error) {
    console.error("Owner fetch audit log error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดประวัติการใช้งานได้" });
  }
});

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
    const expenseDateClause = `WHERE ${["deleted_at IS NULL", ...dateConditions.map((c) => `expense_date ${c}`)].join(" AND ")}`;
    const overduePaymentClause = dateConditions.length
      ? `AND ${dateConditions.map((c) => `p.payment_date ${c}`).join(" AND ")}`
      : "";
    const maintenanceDateClause = dateConditions.length
      ? `AND ${dateConditions.map((c) => `mr.created_at ${c}`).join(" AND ")}`
      : "";

    const [
      [roomRows],
      [[{ total: incomeTotal }]],
      [[{ total: expenseTotal }]],
      [[{ overdueCount }]],
      [[{ maintenanceCount }]],
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS totalRooms, SUM(is_booked = TRUE) AS occupiedRooms FROM Room`),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM Payment WHERE status = 'paid' ${incomeDateClause}`,
        rangeParams,
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM Expense ${expenseDateClause}`,
        rangeParams,
      ),
      pool.query(
      `SELECT COUNT(*) AS overdueCount
       FROM Room r
       WHERE r.is_booked = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM Booking b
           JOIN Payment p ON p.booking_id = b.id
           WHERE b.room_id = r.id AND p.status = 'paid' ${overduePaymentClause}
         )`,
        rangeParams,
      ),
      pool.query(
        `SELECT COUNT(DISTINCT mr.room_number) AS maintenanceCount
         FROM MaintenanceRequest mr
         WHERE mr.status IN ('pending', 'in_progress', 'accepted') ${maintenanceDateClause}`,
        rangeParams,
      ),
    ]);

    const totalRooms = Number(roomRows[0].totalRooms) || 0;
    const occupiedRooms = Number(roomRows[0].occupiedRooms) || 0;
    const vacantRooms = totalRooms - occupiedRooms;
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

let lastOccupancySnapshot = "";

function recordOccupancySnapshot(pool, totalRooms, occupiedCount, vacantCount) {
  const snapshotKey = `${toDateKey(new Date())}|${totalRooms}|${occupiedCount}|${vacantCount}`;
  if (snapshotKey === lastOccupancySnapshot) return;
  lastOccupancySnapshot = snapshotKey;
  pool
    .query(
      `INSERT INTO RoomOccupancySnapshot (snapshot_date, total_rooms, occupied_count, vacant_count)
       VALUES (CURDATE(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE total_rooms = VALUES(total_rooms), occupied_count = VALUES(occupied_count), vacant_count = VALUES(vacant_count)`,
      [totalRooms, occupiedCount, vacantCount],
    )
    .catch((snapshotError) => {
      lastOccupancySnapshot = "";
      console.error("Owner record occupancy snapshot error:", snapshotError);
    });
}

router.get("/rooms/status", async (req, res) => {
  try {
    const pool = getPool();
    const [rooms] = await pool.query(
      `SELECT r.room_number, r.is_booked, r.price, r.room_size, r.rental_start_date, r.rental_end_date,
              c.id AS customer_id, c.first_name, c.last_name, c.phone,
              (SELECT MAX(tr.completed_at) FROM TenantRequest tr
               WHERE tr.room_number = r.room_number AND tr.type = 'moveout' AND tr.status = 'approved') AS vacated_at,
              (SELECT MIN(mr.created_at) FROM MaintenanceRequest mr
               WHERE mr.room_number = r.room_number AND mr.status IN ('pending', 'in_progress', 'accepted')) AS maintenance_since,
              CASE
                WHEN r.is_booked = FALSE THEN 'vacant'
                WHEN EXISTS (
                  SELECT 1 FROM MaintenanceRequest mr
                  WHERE mr.room_number = r.room_number AND mr.status IN ('pending', 'in_progress', 'accepted')
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
    const vacantCount = rooms.filter((room) => room.status === "vacant").length;
    const occupiedCount = rooms.filter((room) => room.is_booked).length;
    recordOccupancySnapshot(pool, rooms.length, occupiedCount, vacantCount);

    return res.json({
      totalRooms: rooms.length,
      vacantCount,
      occupiedCount,
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
    const hasExplicitDateRange = Boolean(req.query.from || req.query.to);
    const selectedRange = hasExplicitDateRange ? null : getSelectedMonthRange(req.query);
    if (selectedRange) {
      conditions.push(`payment_date >= ? AND payment_date < ?`);
      params.push(selectedRange.from, selectedRange.toExclusive);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [byType] = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM Payment ${whereClause} GROUP BY type`,
      params,
    );
    const totalIncome = byType.reduce((sum, row) => sum + Number(row.total || 0), 0);

    const [previews] = await pool.query(
      `SELECT ranked.id, ranked.type, ranked.amount, ranked.payment_date, ranked.booking_id,
              r.room_number, c.first_name, c.last_name
       FROM (
         SELECT id, type, amount, payment_date, booking_id,
                ROW_NUMBER() OVER (PARTITION BY type ORDER BY payment_date DESC, id DESC) AS position
         FROM Payment ${whereClause}
       ) ranked
       LEFT JOIN Booking b ON b.id = ranked.booking_id
       LEFT JOIN Room r ON r.id = b.room_id
       LEFT JOIN Customer c ON c.id = b.customer_id
       WHERE ranked.position <= 3 ORDER BY ranked.payment_date DESC, ranked.id DESC`, params,
    );
    return res.json({ totalIncome, byType: byType.map((item) => ({ ...item, previews: previews.filter((payment) => payment.type === item.type) })) });
  } catch (error) {
    console.error("Owner fetch income error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/income/items", async (req, res) => {
  try {
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });
    const conditions = ["p.status = 'paid'"];
    const params = [];
    if (req.query.from) { conditions.push("p.payment_date >= ?"); params.push(req.query.from); }
    if (req.query.to) { conditions.push("p.payment_date < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(req.query.to); }
    if (!req.query.from && !req.query.to) {
      const range = getSelectedMonthRange(req.query);
      if (range) { conditions.push("p.payment_date >= ? AND p.payment_date < ?"); params.push(range.from, range.toExclusive); }
    }
    if (typeof req.query.type === "string" && req.query.type && req.query.type !== "all") {
      conditions.push("p.type = ?"); params.push(req.query.type);
    }
    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push("(CAST(r.room_number AS CHAR) LIKE ? OR CONCAT_WS(' ', c.first_name, c.last_name) LIKE ? OR p.note LIKE ? OR CAST(p.id AS CHAR) LIKE ?)");
      params.push(...Array(4).fill(`%${search}%`));
    }
    const page = parsePage(req.query.page);
    const pageSize = 30;
    const base = `FROM Payment p LEFT JOIN Booking b ON b.id = p.booking_id LEFT JOIN Room r ON r.id = b.room_id LEFT JOIN Customer c ON c.id = b.customer_id WHERE ${conditions.join(" AND ")}`;
    const pool = getPool();
    const [[summary], [items]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(p.amount), 0) AS amount ${base}`, params),
      pool.query(`SELECT p.id, p.type, p.amount, p.payment_date, p.note, r.room_number, c.first_name, c.last_name ${base} ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]),
    ]);
    return res.json({ items, total: Number(summary[0].total), amount: Number(summary[0].amount), page, pageSize });
  } catch (error) {
    console.error("Owner income items error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดรายการรายรับได้" });
  }
});

router.get("/income/items/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isPositiveId(id)) return res.status(400).json({ message: "เลขรายการไม่ถูกต้อง" });
  try {
    const [rows] = await getPool().query(
      `SELECT p.id, p.type, p.amount, p.status, p.payment_date, p.created_at, p.note, p.slip_path,
              r.room_number, c.first_name, c.last_name
       FROM Payment p LEFT JOIN Booking b ON b.id = p.booking_id
       LEFT JOIN Room r ON r.id = b.room_id LEFT JOIN Customer c ON c.id = b.customer_id
       WHERE p.id = ? AND p.status = 'paid' LIMIT 1`, [id],
    );
    if (!rows.length) return res.status(404).json({ message: "ไม่พบรายการรับชำระ" });
    return res.json({ payment: rows[0] });
  } catch (error) {
    console.error("Owner income payment detail error:", error);
    return res.status(500).json({ message: "โหลดรายละเอียดการชำระเงินไม่สำเร็จ" });
  }
});

router.get("/utility-receipts", async (req, res) => {
  try {
    const dateError = validateDateQuery(req.query, ["from", "to"]);
    if (dateError) return res.status(400).json({ message: dateError });
    const to = req.query.to || toDateKey(new Date());
    const from = req.query.from || toDateKey(new Date(new Date(`${to}T00:00:00`).getFullYear(), new Date(`${to}T00:00:00`).getMonth() - 5, 1));
    if (from > to) return res.status(400).json({ message: "ช่วงวันที่ไม่ถูกต้อง" });
    const daySpan = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
    const granularity = daySpan <= 31 ? "day" : "month";
    const format = granularity === "day" ? "%Y-%m-%d" : "%Y-%m";
    const [rows] = await getPool().query(
      `SELECT DATE_FORMAT(p.payment_date, '${format}') AS period,
              SUM(CASE WHEN p.type = 'water' THEN p.amount ELSE 0 END) AS water,
              SUM(CASE WHEN p.type = 'electricity' THEN p.amount ELSE 0 END) AS electricity,
              SUM(CASE WHEN p.type = 'water' THEN p.water_units ELSE NULL END) AS waterUnits,
              SUM(CASE WHEN p.type = 'electricity' THEN p.electricity_units ELSE NULL END) AS electricityUnits,
              COUNT(*) AS paymentCount
       FROM Payment p WHERE p.status = 'paid' AND p.type IN ('water', 'electricity')
         AND p.payment_date >= ? AND p.payment_date < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY period ORDER BY period`,
      [from, to],
    );
    return res.json({
      granularity,
      range: { from, to },
      trends: rows.map((row) => ({
        period: row.period,
        water: Number(row.water || 0),
        electricity: Number(row.electricity || 0),
        waterUnits: row.waterUnits === null ? null : Number(row.waterUnits),
        electricityUnits: row.electricityUnits === null ? null : Number(row.electricityUnits),
        paymentCount: Number(row.paymentCount),
      })),
    });
  } catch (error) {
    console.error("Owner utility receipts error:", error.code);
    return res.status(500).json({ message: "ไม่สามารถโหลดรายรับค่าน้ำค่าไฟได้" });
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

      const [[incomeRows], [expenseRows]] = await Promise.all([
        pool.query(
          `SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS period,
                  COALESCE(SUM(amount), 0) AS total, COUNT(*) AS transaction_count
           FROM Payment
           WHERE status = 'paid' AND payment_date >= ? AND payment_date <= ?
           GROUP BY period`,
          [fromKey, toKey],
        ),
        pool.query(
          `SELECT DATE_FORMAT(expense_date, '%Y-%m-%d') AS period,
                  COALESCE(SUM(amount), 0) AS total, COUNT(*) AS transaction_count
           FROM Expense
           WHERE deleted_at IS NULL AND expense_date >= ? AND expense_date <= ?
           GROUP BY period`,
          [fromKey, toKey],
        ),
      ]);

      const incomeByDay = new Map(incomeRows.map((row) => [row.period, Number(row.total)]));
      const expenseByDay = new Map(expenseRows.map((row) => [row.period, Number(row.total)]));
      const incomeCountByDay = new Map(incomeRows.map((row) => [row.period, Number(row.transaction_count)]));
      const expenseCountByDay = new Map(expenseRows.map((row) => [row.period, Number(row.transaction_count)]));

      const trends = [];
      const cursor = new Date(fromDate);
      for (let i = 0; i < daySpan; i += 1) {
        const key = toDateKey(cursor);
        const income = incomeByDay.get(key) || 0;
        const expense = expenseByDay.get(key) || 0;
        trends.push({
          period: key,
          income,
          expense,
          incomeCount: incomeCountByDay.get(key) || 0,
          expenseCount: expenseCountByDay.get(key) || 0,
          netProfit: income - expense,
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
    const rangeStartKey = `${rangeStartMonth.getFullYear()}-${String(rangeStartMonth.getMonth() + 1).padStart(2, "0")}-01`;

    const requestedFromKey = toDateKey(fromDate);
    const queryFromKey = requestedFromKey > rangeStartKey ? requestedFromKey : rangeStartKey;
    const queryToKey = toDateKey(toDate);
    const [[incomeRows], [expenseRows]] = await Promise.all([
      pool.query(
        `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS period,
                COALESCE(SUM(amount), 0) AS total, COUNT(*) AS transaction_count
         FROM Payment
         WHERE status = 'paid' AND payment_date >= ? AND payment_date <= ?
         GROUP BY period`,
        [queryFromKey, queryToKey],
      ),
      pool.query(
        `SELECT DATE_FORMAT(expense_date, '%Y-%m') AS period,
                COALESCE(SUM(amount), 0) AS total, COUNT(*) AS transaction_count
         FROM Expense
         WHERE deleted_at IS NULL AND expense_date >= ? AND expense_date <= ?
         GROUP BY period`,
        [queryFromKey, queryToKey],
      ),
    ]);

    const incomeByMonth = new Map(incomeRows.map((row) => [row.period, Number(row.total)]));
    const expenseByMonth = new Map(expenseRows.map((row) => [row.period, Number(row.total)]));
    const incomeCountByMonth = new Map(incomeRows.map((row) => [row.period, Number(row.transaction_count)]));
    const expenseCountByMonth = new Map(expenseRows.map((row) => [row.period, Number(row.transaction_count)]));

    const trends = [];
    for (let i = monthsSpan - 1; i >= 0; i -= 1) {
      const d = new Date(rangeEndMonth.getFullYear(), rangeEndMonth.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const income = incomeByMonth.get(key) || 0;
      const expense = expenseByMonth.get(key) || 0;
      trends.push({
        period: key,
        income,
        expense,
        incomeCount: incomeCountByMonth.get(key) || 0,
        expenseCount: expenseCountByMonth.get(key) || 0,
        netProfit: income - expense,
      });
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
    const movementPeriodFormat = daySpan <= TRENDS_DAILY_THRESHOLD_DAYS ? "%Y-%m-%d" : "%Y-%m";
    const movementQuery = pool.query(
      `SELECT DATE_FORMAT(events.event_date, ?) AS period,
              SUM(events.event_type = 'move_in') AS move_ins,
              SUM(events.event_type = 'move_out') AS move_outs
       FROM (
         SELECT b.created_at AS event_date, 'move_in' AS event_type
         FROM Booking b
         UNION ALL
         SELECT tr.completed_at AS event_date, 'move_out' AS event_type
         FROM TenantRequest tr
         WHERE tr.type = 'moveout' AND tr.status = 'approved' AND tr.completed_at IS NOT NULL
       ) AS events
       WHERE events.event_date >= ? AND events.event_date < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY period`,
      [movementPeriodFormat, toDateKey(fromDate), toDateKey(toDate)],
    );
    const toMovementMap = ([movementRows]) => new Map(movementRows.map((row) => [row.period, {
      moveIns: Number(row.move_ins || 0),
      moveOuts: Number(row.move_outs || 0),
    }]));

    if (daySpan >= 1 && daySpan <= TRENDS_DAILY_THRESHOLD_DAYS) {
      const fromKey = toDateKey(fromDate);
      const toKey = toDateKey(toDate);

      const [movementResult, [rows], [beforeRows]] = await Promise.all([
        movementQuery,
        pool.query(
          `SELECT DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS period, total_rooms, occupied_count, vacant_count
           FROM RoomOccupancySnapshot
           WHERE snapshot_date >= ? AND snapshot_date <= ?
           ORDER BY snapshot_date ASC`,
          [fromKey, toKey],
        ),
        pool.query(
          `SELECT DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS period, total_rooms, occupied_count, vacant_count
           FROM RoomOccupancySnapshot
           WHERE snapshot_date < ?
           ORDER BY snapshot_date DESC
           LIMIT 1`,
          [fromKey],
        ),
      ]);
      const movementByPeriod = toMovementMap(movementResult);
      const byDay = new Map(rows.map((row) => [row.period, row]));

      let lastKnown = beforeRows[0] || null;

      const trends = [];
      const cursor = new Date(fromDate);
      for (let i = 0; i < daySpan; i += 1) {
        const key = toDateKey(cursor);
        if (byDay.has(key)) lastKnown = byDay.get(key);
        const movement = movementByPeriod.get(key) || { moveIns: 0, moveOuts: 0 };
        trends.push({
          period: key,
          occupied: lastKnown ? Number(lastKnown.occupied_count) : 0,
          vacant: lastKnown ? Number(lastKnown.vacant_count) : 0,
          total: lastKnown ? Number(lastKnown.total_rooms) : 0,
          ...movement,
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
    const rangeStartDate = `${rangeStartKey}-01`;

    const [movementResult, [rows], [beforeRows]] = await Promise.all([
      movementQuery,
      pool.query(
        `SELECT DATE_FORMAT(snapshot_date, '%Y-%m') AS period,
                AVG(total_rooms) AS total_rooms, AVG(occupied_count) AS occupied_count, AVG(vacant_count) AS vacant_count
         FROM RoomOccupancySnapshot
         WHERE snapshot_date >= ? AND snapshot_date <= ?
         GROUP BY period
         ORDER BY period ASC`,
        [rangeStartDate, toDateKey(toDate)],
      ),
      pool.query(
        `SELECT DATE_FORMAT(snapshot_date, '%Y-%m') AS period,
                AVG(total_rooms) AS total_rooms, AVG(occupied_count) AS occupied_count, AVG(vacant_count) AS vacant_count
         FROM RoomOccupancySnapshot
         WHERE snapshot_date >= DATE_FORMAT((SELECT MAX(snapshot_date) FROM RoomOccupancySnapshot WHERE snapshot_date < ?), '%Y-%m-01')
           AND snapshot_date < ?
         GROUP BY period`,
        [rangeStartDate, rangeStartDate],
      ),
    ]);
    const movementByPeriod = toMovementMap(movementResult);
    const byMonth = new Map(rows.map((row) => [row.period, row]));

    let lastKnownMonth = beforeRows[0] || null;

    const trends = [];
    for (let i = monthsSpan - 1; i >= 0; i -= 1) {
      const d = new Date(rangeEndMonth.getFullYear(), rangeEndMonth.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (byMonth.has(key)) lastKnownMonth = byMonth.get(key);
      const movement = movementByPeriod.get(key) || { moveIns: 0, moveOuts: 0 };
      trends.push({
        period: key,
        occupied: lastKnownMonth ? Math.round(Number(lastKnownMonth.occupied_count)) : 0,
        vacant: lastKnownMonth ? Math.round(Number(lastKnownMonth.vacant_count)) : 0,
        total: lastKnownMonth ? Math.round(Number(lastKnownMonth.total_rooms)) : 0,
        ...movement,
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
      `SELECT r.id, r.room_number, r.price, r.room_size, r.rental_start_date, r.rental_end_date,
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
        `SELECT p.id, p.amount, p.payment_date, p.status, p.type, p.note, p.slip_path, p.created_at
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

    const combinedQuery = `
      SELECT CONCAT('payment-', p.id) AS id, p.id AS payment_id, p.amount, p.payment_date, p.status, p.type, p.note, p.slip_path, p.created_at,
             c.first_name, c.last_name, c.room_number
      FROM Payment p
      JOIN Booking b ON b.id = p.booking_id
      JOIN Customer c ON c.id = b.customer_id

      UNION ALL

      SELECT CONCAT('room-', c.id) AS id,
             NULL AS payment_id,
             COALESCE(r.price, 0) AS amount,
             CURDATE() AS payment_date,
             'pending' AS status,
             'room' AS type,
             CONCAT('ค่าห้องประจำเดือน ฿', FORMAT(r.price, 0)) AS note,
             NULL AS slip_path,
             NOW() AS created_at,
             c.first_name, c.last_name, c.room_number
      FROM Customer c
      JOIN Room r ON r.room_number = c.room_number
      WHERE r.is_booked = 1
    `;

    const [[countRows], [payments]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM (${combinedQuery}) AS combined ${whereClause}`, params),
      pool.query(
        `SELECT * FROM (${combinedQuery}) AS combined
         ${whereClause}
         ORDER BY payment_date DESC, created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, PAYMENT_LOG_PAGE_SIZE, offset],
      ),
    ]);
    const total = countRows[0].total;

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
      conditions.push(`event_date >= ?`);
      params.push(req.query.from);
    }
    if (typeof req.query.to === "string" && req.query.to) {
      conditions.push(`event_date < DATE_ADD(?, INTERVAL 1 DAY)`);
      params.push(req.query.to);
    }
    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(`(CAST(room_number AS CHAR) LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    const summaryWhereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const summaryParams = [...params];
    const typeFilter = req.query.type === "move_in" || req.query.type === "move_out" ? req.query.type : null;
    if (typeFilter) {
      conditions.push(`event_type = ?`);
      params.push(typeFilter);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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

    const [[summaryRows], [logs]] = await Promise.all([
      pool.query(
        `SELECT event_type, COUNT(*) AS count FROM (${combinedQuery}) AS combined ${summaryWhereClause} GROUP BY event_type`,
        summaryParams,
      ),
      pool.query(
        `SELECT * FROM (${combinedQuery}) AS combined
         ${whereClause}
         ORDER BY event_date DESC
         LIMIT ? OFFSET ?`,
        [...params, OCCUPANCY_LOG_PAGE_SIZE, offset],
      ),
    ]);
    const countOf = (type) => Number(summaryRows.find((row) => row.event_type === type)?.count || 0);
    const summary = { moveIns: countOf("move_in"), moveOuts: countOf("move_out") };
    const total = typeFilter ? countOf(typeFilter) : summary.moveIns + summary.moveOuts;

    return res.json({ logs, total, page, pageSize: OCCUPANCY_LOG_PAGE_SIZE, summary });
  } catch (error) {
    console.error("Owner fetch occupancy log error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/logs/occupancy/:eventId", async (req, res) => {
  const match = /^(movein|moveout)-(\d+)$/.exec(req.params.eventId);
  if (!match || !isPositiveId(Number(match[2]))) return res.status(400).json({ message: "เลขบันทึกไม่ถูกต้อง" });
  try {
    const pool = getPool();
    const isMoveIn = match[1] === "movein";
    const id = Number(match[2]);
    const [rows] = await pool.query(isMoveIn ?
      `SELECT b.id AS booking_id, b.created_at AS event_date, b.created_at AS requested_at,
              b.rental_start_date, b.rental_end_date, r.room_number,
              c.id AS customer_id, c.first_name, c.last_name, c.phone,
              NULL AS note, NULL AS accepted_at, NULL AS accepted_by_name,
              NULL AS completed_at, NULL AS completed_by_name
       FROM Booking b JOIN Room r ON r.id = b.room_id JOIN Customer c ON c.id = b.customer_id WHERE b.id = ? LIMIT 1` :
      `SELECT b.id AS booking_id, tr.completed_at AS event_date, tr.created_at AS requested_at,
              b.rental_start_date, b.rental_end_date, tr.room_number,
              c.id AS customer_id, c.first_name, c.last_name, c.phone,
              tr.note, tr.accepted_at, tr.accepted_by_name, tr.completed_at, tr.completed_by_name
       FROM TenantRequest tr JOIN Customer c ON c.id = tr.customer_id
       LEFT JOIN Booking b ON b.id = (
         SELECT bx.id FROM Booking bx JOIN Room rx ON rx.id = bx.room_id
         WHERE bx.customer_id = tr.customer_id AND rx.room_number = tr.room_number
           AND bx.created_at <= tr.created_at ORDER BY bx.created_at DESC, bx.id DESC LIMIT 1
       )
       WHERE tr.id = ? AND tr.type = 'moveout' AND tr.status = 'approved' LIMIT 1`, [id]);
    const detail = rows[0];
    if (!detail) return res.status(404).json({ message: "ไม่พบบันทึกการเข้าพักหรือย้ายออก" });
    let payments = [];
    let paymentSummary = { total: 0, paid: 0, pending: 0 };
    if (detail.booking_id) {
      const [[summary], [items]] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid,
          COALESCE(SUM(CASE WHEN status IN ('pending', 'unpaid', 'overdue') THEN amount ELSE 0 END), 0) AS pending
          FROM Payment WHERE booking_id = ?`, [detail.booking_id]),
        pool.query(`SELECT id, type, amount, status, payment_date FROM Payment WHERE booking_id = ? ORDER BY payment_date DESC, id DESC`, [detail.booking_id]),
      ]);
      paymentSummary = { total: Number(summary[0].total), paid: Number(summary[0].paid), pending: Number(summary[0].pending) };
      payments = items;
    }
    return res.json({ detail: { ...detail, id: req.params.eventId, event_type: isMoveIn ? "move_in" : "move_out" }, payments, paymentSummary });
  } catch (error) {
    console.error("Owner occupancy detail error:", error);
    return res.status(500).json({ message: "โหลดรายละเอียดบันทึกไม่สำเร็จ" });
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

    await staffAccountChanged({ role: table, id: result.insertId }, "created", req.user);
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

    await staffAccountChanged({ role: table, id: staffId }, "updated", req.user);
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

    await staffAccountChanged({ role: table, id: staffId }, is_suspended ? "suspended" : "unsuspended", req.user);
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
    await staffAccountChanged({ role: table, id: staffId }, "deleted", req.user);
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
