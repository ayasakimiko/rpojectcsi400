import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { computeCurrentDue } from "./CustomerDashboardRouter.js";

const router = Router();

const STAFF_ROLES = new Set(["Staff", "Admin", "Owner"]);
const STAFF_ROLE_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };

function requireStaffRole(req, res, next) {
  if (!STAFF_ROLES.has(req.user?.role)) {
    return res.status(403).json({ message: "ไม่ได้รับอนุญาต (ต้องเป็นเจ้าหน้าที่)" });
  }
  next();
}

router.use(authenticate, requireStaffRole);

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
         c.id AS customer_id, c.first_name, c.last_name, c.phone, c.deposit_amount
       FROM Room r
       LEFT JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
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
          `SELECT booking_id, status, type, payment_date FROM Payment WHERE booking_id IN (?)`,
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
    if (!Number.isInteger(roomNumberValue) || roomNumberValue < 1) {
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
    if (!Number.isInteger(roomNumberValue) || roomNumberValue < 1) {
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
      `SELECT status, type, payment_date FROM Payment WHERE booking_id = ?`,
      [booking.id],
    );

    const currentDue = computeCurrentDue(room, paymentsForBooking, customer.deposit_amount);
    if (!currentDue) {
      return res.status(400).json({ message: "ไม่มียอดค่าเช่าที่ต้องเก็บในขณะนี้" });
    }
    if (currentDue.status === "paid") {
      return res.status(409).json({ message: "ห้องนี้ชำระค่าเช่าเดือนนี้เรียบร้อยแล้ว" });
    }

    const note = currentDue.lumpSumMonths
      ? `เจ้าหน้าที่เก็บเงินสด (จ่ายทบ ${currentDue.lumpSumMonths} เดือน)`
      : "เจ้าหน้าที่เก็บเงินสด";

    await pool.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, note) VALUES (?, ?, CURDATE(), 'paid', ?)`,
      [booking.id, currentDue.amount, note],
    );

    if (currentDue.lumpSumMonths) {
      await pool.query(
        `UPDATE Room
         SET prepaid_until = DATE_ADD(?, INTERVAL ? MONTH), pending_lump_sum_months = NULL
         WHERE room_number = ?`,
        [currentDue.periodEnd, currentDue.lumpSumMonths - 1, roomNumberValue],
      );
    }

    return res.status(201).json({ message: "บันทึกการเก็บเงินสำเร็จ" });
  } catch (error) {
    console.error("Staff collect payment error:", error);
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
       WHERE tr.status = 'pending'
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

router.post("/requests/:id/approve", async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

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
    if (tenantRequest.status !== "pending") {
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

    await connection.query(`UPDATE TenantRequest SET status = 'approved' WHERE id = ?`, [requestId]);

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
    if (!Number.isInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: "รหัสคำขอไม่ถูกต้อง" });
    }

    const [result] = await pool.query(
      `UPDATE TenantRequest SET status = 'rejected' WHERE id = ? AND status = 'pending'`,
      [requestId],
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
  accept: { from: ["pending"], to: "in_progress", message: "รับเรื่องแจ้งซ่อมสำเร็จ" },
  complete: { from: ["pending", "in_progress"], to: "done", message: "บันทึกการซ่อมเสร็จสิ้นสำเร็จ" },
  reject: { from: ["pending", "in_progress"], to: "cancelled", message: "ปฏิเสธรายการแจ้งซ่อมสำเร็จ" },
};

router.post("/maintenance/:id/:action", async (req, res) => {
  try {
    const transition = MAINTENANCE_TRANSITIONS[req.params.action];
    if (!transition) {
      return res.status(404).json({ message: "ไม่พบการดำเนินการนี้" });
    }

    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: "รหัสรายการแจ้งซ่อมไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `UPDATE MaintenanceRequest SET status = ? WHERE id = ? AND status IN (?)`,
      [transition.to, requestId, transition.from],
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
