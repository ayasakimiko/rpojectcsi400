import { Router } from "express";
import { getPool } from "../Database/connection.js";

const router = Router();

function validateCreateRoomInput({ room_number, price }) {
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

router.post("/create", async (req, res) => {
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

    const validationError = validateCreateRoomInput({ room_number, price });
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
    console.error("Create room error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

router.get("/available", async (req, res) => {
  try {
    const pool = getPool();
    const [rooms] = await pool.query(
      `SELECT id, room_number, price FROM Room WHERE is_booked = FALSE ORDER BY room_number ASC`,
    );

    return res.json({ rooms });
  } catch (error) {
    console.error("Fetch available rooms error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

export default router;
