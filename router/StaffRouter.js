import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { authenticate, requireStaffRole } from "../middleware/authMiddleware.js";
import { isPositiveId, lookup, parsePage, parseSearch, parseUtilityBillInput } from "../middleware/validation.js";
import { computeCurrentDue } from "./CustomerDashboardRouter.js";
import expenseRouter from "./ExpenseRouter.js";

const router = Router();

const STAFF_ROLE_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };

async function getActingStaffName(pool, user) {
  const table = STAFF_ROLE_TABLE[user?.role];
  if (!table) return null;
  const [rows] = await pool.query(`SELECT first_name, last_name FROM ${table} WHERE id = ?`, [user.id]);
  const row = rows[0];
  return row ? `${row.first_name} ${row.last_name}` : null;
}

router.use(authenticate, requireStaffRole);

router.use(async (req, res, next) => {
  try {
    const pool = getPool();
    const table = STAFF_ROLE_TABLE[req.user.role];
    const [rows] = await pool.query(`SELECT is_suspended FROM ${table} WHERE id = ?`, [req.user.id]);
    if (!rows[0] || rows[0].is_suspended) {
      return res.status(401).json({ message: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" });
    }
    next();
  } catch (error) {
    console.error("Check staff suspension error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.use("/expenses", expenseRouter);

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

router.get("/rooms", async (req, res) => {
  try {
    const pool = getPool();

    const [rooms] = await pool.query(
      `SELECT
         r.id, r.room_number, r.is_booked, r.price,
         r.rental_start_date, r.rental_end_date, r.prepaid_until, r.pending_lump_sum_months,
         r.electricity_unit_price, r.water_price,
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

    const result = rooms.map((room) => {
      const booking = latestBookingByRoomId.get(room.id);
      const payments = booking ? paymentsByBookingId.get(booking.id) || [] : [];
      const currentDue = booking ? computeCurrentDue(room, payments, room.deposit_amount) : null;

      return {
        room_number: room.room_number,
        is_booked: room.is_booked,
        price: room.price,
        electricity_unit_price: room.electricity_unit_price,
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
        `SELECT id, booking_id, amount, payment_date, status, type, note, created_at
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
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id, deposit_amount FROM Customer WHERE room_number = ? AND is_suspended = FALSE`,
      [roomNumberValue],
    );
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบผู้เช่าของห้องนี้" });
    }

    const [roomRows] = await pool.query(
      `SELECT price, is_booked, rental_start_date, rental_end_date, prepaid_until, pending_lump_sum_months FROM Room WHERE room_number = ?`,
      [roomNumberValue],
    );
    const room = roomRows[0];

    const [bookingRows] = await pool.query(
      `SELECT id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`,
      [customer.id],
    );
    const booking = bookingRows[0];
    if (!booking) {
      return res.status(404).json({ message: "ไม่พบสัญญาเช่าของห้องนี้" });
    }

    const [paymentsForBooking] = await pool.query(
      `SELECT id, amount, status, type, note, payment_date FROM Payment WHERE booking_id = ?`,
      [booking.id],
    );

    const currentDue = computeCurrentDue(room, paymentsForBooking, customer.deposit_amount);
    if (!currentDue) {
      return res.status(400).json({ message: "ไม่มียอดค่าเช่าที่ต้องเก็บในขณะนี้" });
    }

    if (currentDue.rentAmount > 0) {
      const note = currentDue.lumpSumMonths
        ? `เจ้าหน้าที่เก็บเงินสด (จ่ายทบ ${currentDue.lumpSumMonths} เดือน)`
        : "เจ้าหน้าที่เก็บเงินสด";

      await pool.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'paid', 'rent', ?)`,
        [booking.id, currentDue.rentAmount, note],
      );

      if (currentDue.lumpSumMonths) {
        await pool.query(
          `UPDATE Room
           SET prepaid_until = DATE_ADD(?, INTERVAL ? MONTH), pending_lump_sum_months = NULL
           WHERE room_number = ?`,
          [currentDue.periodEnd, currentDue.lumpSumMonths - 1, roomNumberValue],
        );
      }
    }

    const utilityPaymentIds = currentDue.items.filter((item) => item.id).map((item) => item.id);
    if (utilityPaymentIds.length > 0) {
      await pool.query(
        `UPDATE Payment SET status = 'paid', payment_date = CURDATE() WHERE id IN (?)`,
        [utilityPaymentIds],
      );
    }

    return res.status(201).json({ message: "บันทึกการเก็บเงินสำเร็จ" });
  } catch (error) {
    console.error("Staff collect payment error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/rooms/:room_number/utility-bill", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!isPositiveId(roomNumberValue)) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id FROM Customer WHERE room_number = ? AND is_suspended = FALSE`,
      [roomNumberValue],
    );
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบผู้เช่าของห้องนี้" });
    }

    const [roomRows] = await pool.query(
      `SELECT is_booked, electricity_unit_price, water_price FROM Room WHERE room_number = ?`,
      [roomNumberValue],
    );
    const room = roomRows[0];
    if (!room || !room.is_booked) {
      return res.status(400).json({ message: "ห้องนี้ไม่มีผู้เช่าอยู่ในขณะนี้" });
    }

    const [bookingRows] = await pool.query(
      `SELECT id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`,
      [customer.id],
    );
    const booking = bookingRows[0];
    if (!booking) {
      return res.status(404).json({ message: "ไม่พบสัญญาเช่าของห้องนี้" });
    }

    const { error, value } = parseUtilityBillInput(req.body ?? {});
    if (error) {
      return res.status(400).json({ message: error });
    }
    const { electricityUnits, electricityAmount: electricityAmountInput, waterAmount } = value;
    const wantsElectricityByUnits = electricityUnits !== null;
    const wantsElectricityByAmount = electricityAmountInput !== null;
    const wantsElectricity = wantsElectricityByUnits || wantsElectricityByAmount;
    const wantsWater = waterAmount !== null;

    const [existingPending] = await pool.query(
      `SELECT type FROM Payment
       WHERE booking_id = ? AND status = 'pending' AND type IN ('water', 'electricity')
         AND YEAR(payment_date) = YEAR(CURDATE()) AND MONTH(payment_date) = MONTH(CURDATE())`,
      [booking.id],
    );
    const existingTypes = new Set(existingPending.map((row) => row.type));
    if (wantsElectricity && existingTypes.has("electricity")) {
      return res.status(409).json({ message: "ส่งบิลค่าไฟของเดือนนี้ไปแล้ว รอลูกค้าชำระก่อน" });
    }
    if (wantsWater && existingTypes.has("water")) {
      return res.status(409).json({ message: "ส่งบิลค่าน้ำของเดือนนี้ไปแล้ว รอลูกค้าชำระก่อน" });
    }

    const staffName = await getActingStaffName(pool, req.user);

    if (wantsElectricityByUnits) {
      const unitPrice = Number(room.electricity_unit_price) || 0;
      const amount = Math.round(electricityUnits * unitPrice * 100) / 100;
      await pool.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'pending', 'electricity', ?)`,
        [
          booking.id,
          amount,
          `ค่าไฟฟ้า ${electricityUnits} หน่วย x ฿${unitPrice}/หน่วย (แจ้งโดย ${staffName || "เจ้าหน้าที่"})`,
        ],
      );
    } else if (wantsElectricityByAmount) {
      await pool.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'pending', 'electricity', ?)`,
        [booking.id, electricityAmountInput, `ค่าไฟฟ้า (ราคาปกติ) (แจ้งโดย ${staffName || "เจ้าหน้าที่"})`],
      );
    }

    if (wantsWater) {
      await pool.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'pending', 'water', ?)`,
        [booking.id, waterAmount, `ค่าน้ำประจำเดือน (แจ้งโดย ${staffName || "เจ้าหน้าที่"})`],
      );
    }

    return res.status(201).json({ message: "ส่งบิลค่าน้ำ-ค่าไฟสำเร็จ" });
  } catch (error) {
    console.error("Send utility bill error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/requests", async (req, res) => {
  try {
    const pool = getPool();

    const [tenantRequests] = await pool.query(
      `SELECT tr.id, tr.type, tr.note, tr.renew_duration_months, tr.renew_payment_type, tr.status, tr.created_at,
              tr.room_number, c.first_name, c.last_name, c.phone
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       WHERE tr.status IN ('pending', 'in_progress')
       ORDER BY tr.created_at ASC`,
    );

    const [maintenanceRequests] = await pool.query(
      `SELECT mr.id, mr.description, mr.category, mr.contact_phone, mr.preferred_time, mr.status, mr.created_at,
              mr.room_number, c.first_name, c.last_name, c.phone
       FROM MaintenanceRequest mr
       JOIN Customer c ON c.id = mr.customer_id
       WHERE mr.status IN ('pending', 'in_progress')
       ORDER BY mr.created_at ASC`,
    );

    return res.json({ tenantRequests, maintenanceRequests });
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

    const conditions = [`tr.status IN ('approved', 'rejected')`];
    const params = [];

    if (["approved", "rejected"].includes(req.query.status)) {
      conditions.push(`tr.status = ?`);
      params.push(req.query.status);
    }

    const search = parseSearch(req.query.search);
    if (search) {
      conditions.push(`(CAST(tr.room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR c.phone LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
              tr.accepted_at, tr.accepted_by_name, tr.completed_at, tr.completed_by_name,
              tr.room_number, c.first_name, c.last_name, c.phone
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
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

    return res.json({ requests, total, page, pageSize: REQUEST_HISTORY_PAGE_SIZE });
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
      `UPDATE TenantRequest SET status = 'in_progress', accepted_at = NOW(), accepted_by_name = ? WHERE id = ? AND status = 'pending'`,
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

router.post("/requests/:id/approve", async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    const staffName = await getActingStaffName(pool, req.user);

    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT id, customer_id, room_number, type, renew_duration_months, renew_payment_type, status
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

    if (tenantRequest.type === "renew") {
      const durationMonths = tenantRequest.renew_duration_months;
      const paymentType = tenantRequest.renew_payment_type;

      await connection.query(
        `UPDATE Room
         SET
           rental_end_date = DATE_ADD(rental_end_date, INTERVAL ? MONTH),
           rental_duration_months = TIMESTAMPDIFF(MONTH, rental_start_date, rental_end_date),
           pending_lump_sum_months = IF(? = 'lump_sum', ?, pending_lump_sum_months)
         WHERE room_number = ?`,
        [durationMonths, paymentType, durationMonths, tenantRequest.room_number],
      );
    }

    if (tenantRequest.type === "moveout") {
      const [roomBeforeReset] = await connection.query(
        `SELECT rental_start_date FROM Room WHERE room_number = ?`,
        [tenantRequest.room_number],
      );
      const moveInDate = roomBeforeReset[0]?.rental_start_date ?? null;

      await connection.query(`UPDATE TenantRequest SET move_in_date = ? WHERE id = ?`, [moveInDate, requestId]);

      await connection.query(`UPDATE Customer SET is_suspended = TRUE WHERE id = ?`, [tenantRequest.customer_id]);

      await connection.query(
        `UPDATE Room
         SET
           is_booked = FALSE,
           rental_start_date = NULL,
           rental_end_date = NULL,
           rental_duration_months = NULL,
           prepaid_until = NULL,
           pending_lump_sum_months = NULL
         WHERE room_number = ?`,
        [tenantRequest.room_number],
      );
    }

    await connection.query(
      `UPDATE TenantRequest SET status = 'approved', completed_at = NOW(), completed_by_name = ? WHERE id = ?`,
      [staffName, requestId],
    );

    await connection.commit();
    return res.json({ message: "อนุมัติคำขอสำเร็จ" });
  } catch (error) {
    await connection.rollback();
    console.error("Approve tenant request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection.release();
  }
});

router.post("/requests/:id/reject", async (req, res) => {
  try {
    const pool = getPool();
    const requestId = Number(req.params.id);
    if (!isPositiveId(requestId)) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    const staffName = await getActingStaffName(pool, req.user);
    const [result] = await pool.query(
      `UPDATE TenantRequest SET status = 'rejected', completed_at = NOW(), completed_by_name = ? WHERE id = ? AND status IN ('pending', 'in_progress')`,
      [staffName, requestId],
    );
    if (result.affectedRows === 0) {
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
    message: "บันทึกการซ่อมเสร็จสิ้นสำเร็จ",
  },
  reject: {
    from: ["pending", "in_progress"],
    to: "cancelled",
    timestampColumn: "completed_at",
    byNameColumn: "completed_by_name",
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
    const [result] = await pool.query(
      `UPDATE MaintenanceRequest SET status = ?, ${transition.timestampColumn} = NOW(), ${transition.byNameColumn} = ? WHERE id = ? AND status IN (?)`,
      [transition.to, staffName, requestId, transition.from],
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

export default router;
