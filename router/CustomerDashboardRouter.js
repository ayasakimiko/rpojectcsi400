import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/me", authenticate, async (req, res) => {
  try {
    const pool = getPool();

    const [customerRows] = await pool.query(
      `SELECT id, idcard, first_name, last_name, phone, age, room_number
       FROM Customer WHERE id = ?`,
      [req.user.id],
    );
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const [roomRows] = await pool.query(
      `SELECT room_number, is_booked, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, rental_duration_months, rental_start_date, rental_end_date
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
        `SELECT id, booking_id, payment_date, status, note
         FROM Payment
         WHERE booking_id IN (?)
         ORDER BY payment_date DESC`,
        [bookingIds],
      );
    }

    const rentalHistory = bookings.map((booking) => ({
      ...booking,
      payments: payments.filter((payment) => payment.booking_id === booking.booking_id),
    }));

    return res.json({
      customer,
      room: roomRows[0] || null,
      rentalHistory,
    });
  } catch (error) {
    console.error("Customer dashboard error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
