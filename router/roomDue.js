import { computeCurrentDue, loadDepositPayments } from "./CustomerDashboardRouter.js";
import { loadHeldTransferRooms } from "./rentalContracts.js";

// Rooms with their current tenant and the amount due now; shared by the Staff room list
// and the rent-overdue notifications.
export async function loadRoomsWithDue(pool) {
  const [rooms] = await pool.query(
    `SELECT
       r.id, r.room_number, r.is_booked, r.price, r.room_size,
       r.rental_start_date, r.rental_end_date, r.prepaid_until, r.billing_start_date, r.pending_lump_sum_months, r.rent_credit,
       r.electricity_unit_price, r.water_unit_price, r.water_price,
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

  const [depositPaymentsByCustomer, heldRooms] = await Promise.all([
    loadDepositPayments(pool, rooms.map((room) => room.customer_id).filter(Boolean)),
    loadHeldTransferRooms(pool),
  ]);
  const result = rooms.map((room) => {
    const booking = latestBookingByRoomId.get(room.id);
    const payments = booking ? paymentsByBookingId.get(booking.id) || [] : [];
    const currentDue = booking
      ? computeCurrentDue(room, payments, room.deposit_amount, depositPaymentsByCustomer.get(room.customer_id) ?? [])
      : null;

    return {
      room_number: room.room_number,
      is_booked: room.is_booked,
      held_for_transfer: !room.is_booked && heldRooms.has(Number(room.room_number)),
      price: room.price,
      room_size: room.room_size,
      electricity_unit_price: room.electricity_unit_price,
      water_unit_price: room.water_unit_price,
      water_price: room.water_price,
      rental_start_date: room.rental_start_date,
      rental_end_date: room.rental_end_date,
      tenant: room.customer_id
        ? { id: room.customer_id, first_name: room.first_name, last_name: room.last_name, phone: room.phone }
        : null,
      currentDue,
    };
  });
  return result;
}
