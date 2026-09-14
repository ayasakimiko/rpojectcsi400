import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../Database/connection.js";
import { authenticate, requireAdminRole } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authenticate, requireAdminRole);

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

function validateRoomInput({ room_number, price }) {
  const roomNumberValue = Number(room_number);
  if (!Number.isInteger(roomNumberValue) || roomNumberValue < 1) {
    return "เลขห้องไม่ถูกต้อง";
  }
  const priceValue = Number(price);
  if (!Number.isFinite(priceValue) || priceValue < 0) {
    return "ราคาไม่ถูกต้อง";
  }
  return null;
}

router.get("/rooms", async (req, res) => {
  try {
    const pool = getPool();
    const [rooms] = await pool.query(
      `SELECT
         r.id, r.room_number, r.is_booked, r.price,
         r.air_conditioner, r.wifi, r.refrigerator, r.bed, r.bathroom, r.cctv,
         r.electricity_unit_price, r.water_price,
         r.rental_duration_months, r.rental_start_date, r.rental_end_date,
         c.id AS customer_id, c.first_name, c.last_name, c.phone
       FROM Room r
       LEFT JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
       ORDER BY r.room_number ASC`,
    );
    return res.json({ rooms });
  } catch (error) {
    console.error("Admin fetch rooms error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/rooms", async (req, res) => {
  try {
    const {
      room_number,
      price,
      air_conditioner = false,
      wifi = false,
      refrigerator = false,
      bed = 0,
      bathroom = false,
      cctv = false,
      electricity_unit_price = 8.0,
      water_price = 100.0,
    } = req.body ?? {};

    const validationError = validateRoomInput({ room_number, price });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO Room (room_number, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(room_number),
        Number(price),
        Boolean(air_conditioner),
        Boolean(wifi),
        Boolean(refrigerator),
        Number(bed),
        Boolean(bathroom),
        Boolean(cctv),
        Number(electricity_unit_price),
        Number(water_price),
      ],
    );

    return res.status(201).json({ message: "สร้างห้องพักสำเร็จ", roomId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เลขห้องนี้มีอยู่แล้ว" });
    }
    console.error("Admin create room error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const ROOM_EDITABLE_COLUMNS = [
  "room_number",
  "price",
  "air_conditioner",
  "wifi",
  "refrigerator",
  "bed",
  "bathroom",
  "cctv",
  "electricity_unit_price",
  "water_price",
];

router.put("/rooms/:room_number", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!Number.isInteger(roomNumberValue) || roomNumberValue < 1) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const { columns, values } = buildUpdate(ROOM_EDITABLE_COLUMNS, req.body ?? {});
    if (columns.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE Room SET ${columns.join(", ")} WHERE room_number = ?`, [
      ...values,
      roomNumberValue,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    }

    return res.json({ message: "แก้ไขข้อมูลห้องพักสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เลขห้องนี้มีอยู่แล้ว" });
    }
    console.error("Admin update room error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/rooms/:room_number", async (req, res) => {
  try {
    const roomNumberValue = Number(req.params.room_number);
    if (!Number.isInteger(roomNumberValue) || roomNumberValue < 1) {
      return res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [roomRows] = await pool.query(`SELECT is_booked FROM Room WHERE room_number = ?`, [roomNumberValue]);
    const room = roomRows[0];
    if (!room) {
      return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    }
    if (room.is_booked) {
      return res.status(409).json({ message: "ไม่สามารถลบห้องพักที่มีผู้เช่าอยู่ได้" });
    }

    await pool.query(`DELETE FROM Room WHERE room_number = ?`, [roomNumberValue]);
    return res.json({ message: "ลบห้องพักสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED") {
      return res.status(409).json({ message: "ไม่สามารถลบห้องพักนี้ได้เนื่องจากมีประวัติผู้เช่าอ้างอิงอยู่" });
    }
    console.error("Admin delete room error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

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

router.get("/staff", async (req, res) => {
  try {
    const pool = getPool();
    const [staff] = await pool.query(
      `SELECT id, role, idcard, first_name, last_name, phone, age, is_suspended, created_at
       FROM Staff ORDER BY is_suspended ASC, id ASC`,
    );
    return res.json({ staff });
  } catch (error) {
    console.error("Admin fetch staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.post("/staff", async (req, res) => {
  try {
    const { idcard, password, phone, first_name, last_name, age } = req.body ?? {};

    const validationError = validateStaffInput({ idcard, password, phone, first_name, last_name, age });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO Staff (idcard, password, phone, first_name, last_name, age) VALUES (?, ?, ?, ?, ?, ?)`,
      [idcard.trim(), hashedPassword, phone.trim(), first_name.trim(), last_name.trim(), Number(age)],
    );

    return res.status(201).json({ message: "เพิ่มพนักงานสำเร็จ", staffId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      if (error.sqlMessage?.includes("idcard")) {
        return res.status(409).json({ message: "เลขบัตรประชาชนนี้มีอยู่แล้ว" });
      }
      if (error.sqlMessage?.includes("phone")) {
        return res.status(409).json({ message: "เบอร์โทรศัพท์นี้มีอยู่แล้ว" });
      }
    }
    console.error("Admin create staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const STAFF_EDITABLE_COLUMNS = ["first_name", "last_name", "phone", "age"];

router.put("/staff/:id", async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId) || staffId < 1) {
      return res.status(400).json({ message: "รหัสพนักงานไม่ถูกต้อง" });
    }

    const body = req.body ?? {};
    const { columns, values } = buildUpdate(STAFF_EDITABLE_COLUMNS, body);

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
    const [result] = await pool.query(`UPDATE Staff SET ${columns.join(", ")} WHERE id = ?`, [...values, staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    return res.json({ message: "แก้ไขข้อมูลพนักงานสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เบอร์โทรศัพท์นี้มีอยู่แล้ว" });
    }
    console.error("Admin update staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/staff/:id/suspend", async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId) || staffId < 1) {
      return res.status(400).json({ message: "รหัสพนักงานไม่ถูกต้อง" });
    }
    const { is_suspended } = req.body ?? {};
    if (typeof is_suspended !== "boolean") {
      return res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE Staff SET is_suspended = ? WHERE id = ?`, [is_suspended, staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    return res.json({ message: is_suspended ? "ระงับการใช้งานพนักงานสำเร็จ" : "เปิดการใช้งานพนักงานสำเร็จ" });
  } catch (error) {
    console.error("Admin suspend staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.delete("/staff/:id", async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId) || staffId < 1) {
      return res.status(400).json({ message: "รหัสพนักงานไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`DELETE FROM Staff WHERE id = ?`, [staffId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบพนักงานนี้" });
    }

    return res.json({ message: "ลบพนักงานสำเร็จ" });
  } catch (error) {
    console.error("Admin delete staff error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/customers", async (req, res) => {
  try {
    const pool = getPool();
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const conditions = [];
    const params = [];
    if (search) {
      conditions.push(
        `(CAST(c.room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR c.phone LIKE ? OR c.idcard LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [customers] = await pool.query(
      `SELECT c.id, c.idcard, c.first_name, c.last_name, c.phone, c.age, c.is_suspended,
              c.room_number, c.deposit_amount, c.created_at AS registered_at,
              r.rental_start_date, r.rental_end_date, r.price
       FROM Customer c
       LEFT JOIN Room r ON r.room_number = c.room_number
       ${whereClause}
       ORDER BY c.is_suspended ASC, c.room_number ASC`,
      params,
    );

    return res.json({ customers });
  } catch (error) {
    console.error("Admin fetch customers error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/customers/:id", async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId < 1) {
      return res.status(400).json({ message: "รหัสลูกค้าไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [customerRows] = await pool.query(
      `SELECT id, idcard, first_name, last_name, phone, age, is_suspended, room_number, deposit_amount, created_at AS registered_at
       FROM Customer WHERE id = ?`,
      [customerId],
    );
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ message: "ไม่พบลูกค้านี้" });
    }

    const [bookings] = await pool.query(
      `SELECT id AS booking_id, room_id, created_at FROM Booking WHERE customer_id = ? ORDER BY created_at DESC`,
      [customerId],
    );

    const bookingIds = bookings.map((booking) => booking.booking_id);
    let payments = [];
    if (bookingIds.length > 0) {
      [payments] = await pool.query(
        `SELECT id, booking_id, amount, payment_date, status, type, note, created_at
         FROM Payment WHERE booking_id IN (?) ORDER BY payment_date DESC, created_at DESC`,
        [bookingIds],
      );
    }

    const rentalHistory = bookings.map((booking) => ({
      ...booking,
      payments: payments.filter((payment) => payment.booking_id === booking.booking_id),
    }));

    return res.json({ customer, rentalHistory });
  } catch (error) {
    console.error("Admin fetch customer detail error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const CUSTOMER_EDITABLE_COLUMNS = ["first_name", "last_name", "phone", "age", "deposit_amount"];

router.put("/customers/:id", async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId < 1) {
      return res.status(400).json({ message: "รหัสลูกค้าไม่ถูกต้อง" });
    }

    const { columns, values } = buildUpdate(CUSTOMER_EDITABLE_COLUMNS, req.body ?? {});
    if (columns.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลที่ต้องการแก้ไข" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE Customer SET ${columns.join(", ")} WHERE id = ?`, [
      ...values,
      customerId,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบลูกค้านี้" });
    }

    return res.json({ message: "แก้ไขข้อมูลลูกค้าสำเร็จ" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "เบอร์โทรศัพท์นี้มีอยู่แล้ว" });
    }
    console.error("Admin update customer error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.patch("/customers/:id/suspend", async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId < 1) {
      return res.status(400).json({ message: "รหัสลูกค้าไม่ถูกต้อง" });
    }
    const { is_suspended } = req.body ?? {};
    if (typeof is_suspended !== "boolean") {
      return res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }

    const pool = getPool();
    const [result] = await pool.query(`UPDATE Customer SET is_suspended = ? WHERE id = ?`, [
      is_suspended,
      customerId,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "ไม่พบลูกค้านี้" });
    }

    return res.json({ message: is_suspended ? "ระงับการใช้งานลูกค้าสำเร็จ" : "เปิดการใช้งานลูกค้าสำเร็จ" });
  } catch (error) {
    console.error("Admin suspend customer error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

const LOG_PAGE_SIZE = 20;

router.get("/logs/requests", async (req, res) => {
  try {
    const pool = getPool();
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * LOG_PAGE_SIZE;

    const conditions = [];
    const params = [];

    if (["pending", "in_progress", "approved", "rejected"].includes(req.query.status)) {
      conditions.push(`tr.status = ?`);
      params.push(req.query.status);
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      conditions.push(
        `(CAST(tr.room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR tr.accepted_by_name LIKE ? OR tr.completed_by_name LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM TenantRequest tr JOIN Customer c ON c.id = tr.customer_id ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const [requests] = await pool.query(
      `SELECT tr.id, tr.type, tr.note, tr.renew_duration_months, tr.renew_payment_type, tr.status, tr.created_at,
              tr.accepted_at, tr.accepted_by_name, tr.completed_at, tr.completed_by_name,
              tr.room_number, c.first_name, c.last_name, c.phone
       FROM TenantRequest tr
       JOIN Customer c ON c.id = tr.customer_id
       ${whereClause}
       ORDER BY tr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, LOG_PAGE_SIZE, offset],
    );

    return res.json({ requests, total, page, pageSize: LOG_PAGE_SIZE });
  } catch (error) {
    console.error("Admin fetch tenant request log error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/logs/maintenance", async (req, res) => {
  try {
    const pool = getPool();
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * LOG_PAGE_SIZE;

    const conditions = [];
    const params = [];

    if (["pending", "in_progress", "done", "cancelled"].includes(req.query.status)) {
      conditions.push(`mr.status = ?`);
      params.push(req.query.status);
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      conditions.push(
        `(CAST(mr.room_number AS CHAR) LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR mr.accepted_by_name LIKE ? OR mr.completed_by_name LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM MaintenanceRequest mr JOIN Customer c ON c.id = mr.customer_id ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const [requests] = await pool.query(
      `SELECT mr.id, mr.description, mr.category, mr.contact_phone, mr.preferred_time, mr.status, mr.created_at,
              mr.accepted_at, mr.accepted_by_name, mr.completed_at, mr.completed_by_name,
              mr.room_number, c.first_name, c.last_name, c.phone
       FROM MaintenanceRequest mr
       JOIN Customer c ON c.id = mr.customer_id
       ${whereClause}
       ORDER BY mr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, LOG_PAGE_SIZE, offset],
    );

    return res.json({ requests, total, page, pageSize: LOG_PAGE_SIZE });
  } catch (error) {
    console.error("Admin fetch maintenance request log error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
