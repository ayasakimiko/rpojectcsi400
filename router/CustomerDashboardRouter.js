import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

const GRACE_DAYS = 3;
const REQUEST_TYPES = new Set(["renew", "moveout"]);
const RENEW_DURATION_MONTHS = new Set([1, 3, 6, 12]);
const RENEW_PAYMENT_TYPES = new Set(["monthly", "lump_sum"]);

function computeCurrentDue(room, paymentsForBooking, depositAmount) {
  if (!room || !room.is_booked || !room.rental_start_date || !room.rental_end_date) return null;

  const start = new Date(room.rental_start_date);
  const end = new Date(room.rental_end_date);
  const now = new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (now < start || now > end) return null;

  const billingDay = start.getDate();
  let periodStart = new Date(now.getFullYear(), now.getMonth(), billingDay, start.getHours(), start.getMinutes());
  if (periodStart > now) {
    periodStart = new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, billingDay, start.getHours(), start.getMinutes());
  }
  const isFirstPeriod = periodStart <= start;
  if (periodStart < start) periodStart = start;

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const periodStartDay = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
  const periodEndDay = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());

  const isWithinPeriod = (value) => {
    const d = new Date(value);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return day >= periodStartDay && day < periodEndDay;
  };

  const paidThisPeriod = paymentsForBooking.some((p) => p.status === "paid" && isWithinPeriod(p.payment_date));
  const notifiedThisPeriod = paymentsForBooking.some((p) => p.status === "pending" && isWithinPeriod(p.payment_date));

  const dueDate = new Date(periodStart);
  dueDate.setDate(dueDate.getDate() + GRACE_DAYS);

  let status = "paid";
  if (!paidThisPeriod) {
    status = notifiedThisPeriod ? "pending" : now > dueDate ? "overdue" : "due";
  }

  const basePrice = Number(room.price);
  const depositApplied = isFirstPeriod ? Math.min(Number(depositAmount) || 0, basePrice) : 0;

  return {
    amount: basePrice - depositApplied,
    depositApplied,
    periodStart,
    periodEnd,
    dueDate,
    status,
  };
}

router.get("/me", authenticate, async (req, res) => {
  try {
    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id, idcard, first_name, last_name, phone, age, room_number, deposit_amount
       FROM Customer WHERE id = ?`,
      [req.user.id],
    );
    
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const [roomRows] = await pool.query(
      `SELECT room_number, is_booked, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_price, rental_duration_months, rental_start_date, rental_end_date
       FROM Room WHERE room_number = ?`,
      [customer.room_number],
    );

    const [bookings] = await pool.query(
      `SELECT b.id AS booking_id, r.room_number, b.created_at, r.rental_start_date, r.rental_end_date
       FROM Booking b
       JOIN Room r ON r.id = b.room_id
       WHERE b.customer_id = ?
       ORDER BY b.created_at DESC`,
      [customer.id],
    );

    const bookingIds = bookings.map((booking) => booking.booking_id);
    let payments = [];
    if (bookingIds.length > 0) {
      [payments] = await pool.query(
        `SELECT id, booking_id, amount, payment_date, status, note, slip_path, created_at
         FROM Payment
         WHERE booking_id IN (?)
         ORDER BY payment_date DESC, created_at DESC`,
        [bookingIds],
      );
    }

    const rentalHistory = bookings.map((booking) => ({
      ...booking,
      payments: payments.filter((payment) => payment.booking_id === booking.booking_id),
    }));

    const [maintenanceRequests] = await pool.query(
      `SELECT id, description, status, created_at FROM MaintenanceRequest WHERE customer_id = ? ORDER BY created_at DESC`,
      [customer.id],
    );

    const [tenantRequests] = await pool.query(
      `SELECT id, type, note, renew_duration_months, renew_payment_type, status, created_at
       FROM TenantRequest WHERE customer_id = ? ORDER BY created_at DESC`,
      [customer.id],
    );

    const latestBookingId = bookings[0]?.booking_id;
    const paymentsForCurrentBooking = payments.filter((payment) => payment.booking_id === latestBookingId);
    const currentDue = computeCurrentDue(roomRows[0], paymentsForCurrentBooking, customer.deposit_amount);

    return res.json({
      customer,
      room: roomRows[0] || null,
      rentalHistory,
      maintenanceRequests,
      tenantRequests,
      currentDue,
    });
  } catch (error) {
    console.error("Customer dashboard error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/payments/confirm", authenticate, async (req, res) => {
  try {
    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id, room_number, deposit_amount FROM Customer WHERE id = ?`,
      [req.user.id],
    );
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const [roomRows] = await pool.query(
      `SELECT price, is_booked, rental_start_date, rental_end_date FROM Room WHERE room_number = ?`,
      [customer.room_number],
    );
    const room = roomRows[0];

    const [bookingRows] = await pool.query(
      `SELECT id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`,
      [customer.id],
    );
    const booking = bookingRows[0];
    if (!booking) {
      return res.status(404).json({ message: "ไม่พบสัญญาเช่าของคุณ" });
    }

    const [paymentsForBooking] = await pool.query(
      `SELECT status, payment_date FROM Payment WHERE booking_id = ?`,
      [booking.id],
    );

    const currentDue = computeCurrentDue(room, paymentsForBooking, customer.deposit_amount);
    if (!currentDue) {
      return res.status(400).json({ message: "ไม่มียอดค่าเช่าที่ต้องชำระในขณะนี้" });
    }
    if (currentDue.status === "paid") {
      return res.status(409).json({ message: "ชำระค่าเช่าเดือนนี้เรียบร้อยแล้ว" });
    }

    await pool.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, note) VALUES (?, ?, CURDATE(), 'paid', ?)`,
      [booking.id, currentDue.amount, "ชำระผ่าน PromptPay (จำลอง)"],
    );

    return res.status(201).json({ message: "ชำระเงินสำเร็จ" });
  } catch (error) {
    console.error("Confirm payment error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/maintenance", authenticate, async (req, res) => {
  try {
    const pool = getPool();

    const [customerRows] = await pool.query(`SELECT id, room_number FROM Customer WHERE id = ?`, [req.user.id]);
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    if (!description) {
      return res.status(400).json({ message: "กรุณากรอกรายละเอียดปัญหาที่ต้องการแจ้งซ่อม" });
    }
    if (description.length > 500) {
      return res.status(400).json({ message: "รายละเอียดยาวเกินไป (สูงสุด 500 ตัวอักษร)" });
    }

    await pool.query(
      `INSERT INTO MaintenanceRequest (customer_id, room_number, description) VALUES (?, ?, ?)`,
      [customer.id, customer.room_number, description],
    );

    return res.status(201).json({ message: "แจ้งซ่อมสำเร็จ ทางผู้ดูแลจะดำเนินการโดยเร็วที่สุด" });
  } catch (error) {
    console.error("Create maintenance request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/requests", authenticate, async (req, res) => {
  try {
    const pool = getPool();

    const [customerRows] = await pool.query(`SELECT id, room_number FROM Customer WHERE id = ?`, [req.user.id]);
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const type = req.body?.type;
    if (!REQUEST_TYPES.has(type)) {
      return res.status(400).json({ message: "ประเภทคำขอไม่ถูกต้อง" });
    }

    const [pendingRows] = await pool.query(
      `SELECT id FROM TenantRequest WHERE customer_id = ? AND type = ? AND status = 'pending'`,
      [customer.id, type],
    );
    if (pendingRows.length > 0) {
      return res.status(409).json({ message: "คุณมีคำขอประเภทนี้ที่รอดำเนินการอยู่แล้ว" });
    }

    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) || null : null;

    let renewDurationMonths = null;
    let renewPaymentType = null;
    if (type === "renew") {
      renewDurationMonths = Number(req.body?.renew_duration_months);
      if (!RENEW_DURATION_MONTHS.has(renewDurationMonths)) {
        return res.status(400).json({ message: "กรุณาเลือกระยะเวลาที่ต้องการต่อสัญญา" });
      }
      renewPaymentType = req.body?.renew_payment_type;
      if (!RENEW_PAYMENT_TYPES.has(renewPaymentType)) {
        return res.status(400).json({ message: "กรุณาเลือกรูปแบบการชำระเงิน" });
      }
      if (renewPaymentType === "lump_sum" && renewDurationMonths <= 1) {
        return res.status(400).json({ message: "จ่ายล่วงหน้าทั้งก้อนเลือกได้เฉพาะระยะเวลาต่อสัญญามากกว่า 1 เดือน" });
      }
    }

    await pool.query(
      `INSERT INTO TenantRequest (customer_id, room_number, type, note, renew_duration_months, renew_payment_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customer.id, customer.room_number, type, note, renewDurationMonths, renewPaymentType],
    );

    return res.status(201).json({ message: "ส่งคำขอสำเร็จ ทางผู้ดูแลจะติดต่อกลับโดยเร็วที่สุด" });
  } catch (error) {
    console.error("Create tenant request error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
