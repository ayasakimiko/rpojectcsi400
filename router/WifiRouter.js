import { randomBytes, randomInt } from "node:crypto";
import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { authenticate, createRequireActiveAccount, requireCustomerRole, requireStaffRole } from "../middleware/authMiddleware.js";
import { isPositiveId } from "../middleware/validation.js";
import { wifiChanged } from "./notificationEvents.js";

// Simulated Wi-Fi for testing: nothing here talks to a real router. Staff, admins
// and owners manage each room's network and add or disconnect devices by hand.
const router = Router();
const requireActiveAccount = createRequireActiveAccount(getPool);

const DEVICE_TYPES = new Set(["phone", "laptop", "tablet", "tv", "other"]);
const MAX_DEVICE_LIMIT = 20;
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const SERVER_ERROR = "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง";

function generatePassword(length = 10) {
  return Array.from({ length }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join("");
}

function generateMacAddress() {
  const bytes = randomBytes(6);
  bytes[0] = (bytes[0] | 0x02) & 0xfe; // locally administered, unicast
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(":").toUpperCase();
}

// Every room that exists gets Wi-Fi settings on first use, enabled when the room
// was created with the Wi-Fi amenity.
async function ensureRoomWifi(pool) {
  await pool.query(
    `INSERT IGNORE INTO RoomWifi (room_number, ssid, password, is_enabled)
     SELECT r.room_number, CONCAT('Dorm-', r.room_number), LEFT(MD5(CONCAT(RAND(), r.room_number)), 10), r.wifi
     FROM Room r
     LEFT JOIN RoomWifi w ON w.room_number = r.room_number
     WHERE w.room_number IS NULL`,
  );
}

async function loadRoomsWifi(pool, roomNumber = null) {
  await ensureRoomWifi(pool);
  const [rooms] = await pool.query(
    `SELECT w.room_number, w.ssid, w.password, w.max_devices, w.is_enabled, w.updated_at,
            r.is_booked, c.first_name, c.last_name
     FROM RoomWifi w
     JOIN Room r ON r.room_number = w.room_number
     LEFT JOIN Customer c ON c.id = (
       SELECT c2.id FROM Customer c2
       WHERE c2.room_number = w.room_number AND c2.is_suspended = FALSE
       ORDER BY c2.id DESC
       LIMIT 1
     )
     ${roomNumber == null ? "" : "WHERE w.room_number = ?"}
     ORDER BY w.room_number ASC`,
    roomNumber == null ? [] : [roomNumber],
  );
  const [devices] = await pool.query(
    `SELECT id, room_number, device_name, device_type, mac_address, is_online, connected_at
     FROM RoomWifiDevice
     ${roomNumber == null ? "" : "WHERE room_number = ?"}
     ORDER BY connected_at ASC, id ASC`,
    roomNumber == null ? [] : [roomNumber],
  );
  const byRoom = new Map();
  for (const device of devices) {
    const list = byRoom.get(device.room_number) || [];
    list.push({ ...device, is_online: Boolean(device.is_online) });
    byRoom.set(device.room_number, list);
  }
  return rooms.map((room) => ({
    room_number: room.room_number,
    ssid: room.ssid,
    password: room.password,
    max_devices: room.max_devices,
    is_enabled: Boolean(room.is_enabled),
    is_booked: Boolean(room.is_booked),
    tenant_name: room.first_name ? `${room.first_name} ${room.last_name || ""}`.trim() : null,
    updated_at: room.updated_at,
    devices: byRoom.get(room.room_number) || [],
  }));
}

async function sendRoom(res, pool, roomNumber, message, status = 200) {
  const [room] = await loadRoomsWifi(pool, roomNumber);
  if (!room) return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
  return res.status(status).json({ message, room });
}

// Shared by staff and the customer test button. Returns { status, message } when
// the device cannot be added, or null once it is saved.
async function addDevice(pool, roomNumber, body) {
  const name = typeof body?.device_name === "string" ? body.device_name.trim() : "";
  const type = body?.device_type ?? "other";
  if (!name || name.length > 60) return { status: 400, message: "ชื่ออุปกรณ์ต้องมี 1-60 ตัวอักษร" };
  if (!DEVICE_TYPES.has(type)) return { status: 400, message: "ประเภทอุปกรณ์ไม่ถูกต้อง" };

  await ensureRoomWifi(pool);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[wifi]] = await connection.query(
      "SELECT max_devices, is_enabled FROM RoomWifi WHERE room_number = ? FOR UPDATE",
      [roomNumber],
    );
    let failure = null;
    if (!wifi) {
      failure = { status: 404, message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" };
    } else if (!wifi.is_enabled) {
      failure = { status: 409, message: "Wi-Fi ของห้องนี้ปิดใช้งานอยู่" };
    } else {
      const [[{ count }]] = await connection.query("SELECT COUNT(*) AS count FROM RoomWifiDevice WHERE room_number = ?", [roomNumber]);
      if (count >= wifi.max_devices) failure = { status: 409, message: `เชื่อมต่อครบ ${wifi.max_devices} เครื่องแล้ว` };
    }
    if (failure) {
      await connection.rollback();
      return failure;
    }
    await connection.query(
      "INSERT INTO RoomWifiDevice (room_number, device_name, device_type, mac_address) VALUES (?, ?, ?, ?)",
      [roomNumber, name, type, generateMacAddress()],
    );
    await connection.commit();
    return null;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

function parseRoomNumber(req, res) {
  const roomNumber = Number(req.params.room_number);
  if (!isPositiveId(roomNumber)) {
    res.status(400).json({ message: "เลขห้องไม่ถูกต้อง" });
    return null;
  }
  return roomNumber;
}

router.get("/me", authenticate, requireCustomerRole, requireActiveAccount, async (req, res) => {
  try {
    const pool = getPool();
    const [[customer]] = await pool.query("SELECT room_number FROM Customer WHERE id = ?", [req.user.id]);
    if (customer?.room_number == null) return res.json({ room: null });
    const [room] = await loadRoomsWifi(pool, customer.room_number);
    return res.json({ room: room ? { ...room, tenant_name: undefined } : null });
  } catch (error) {
    console.error("Fetch customer Wi-Fi error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

// Test helper: lets a customer simulate connecting a device to their own room.
router.post("/me/devices", authenticate, requireCustomerRole, requireActiveAccount, async (req, res) => {
  try {
    const pool = getPool();
    const [[customer]] = await pool.query("SELECT room_number FROM Customer WHERE id = ?", [req.user.id]);
    if (customer?.room_number == null) return res.status(404).json({ message: "ไม่พบห้องพักของคุณ" });
    const failure = await addDevice(pool, customer.room_number, req.body);
    if (failure) return res.status(failure.status).json({ message: failure.message });
    const [room] = await loadRoomsWifi(pool, customer.room_number);
    return res.status(201).json({ message: "เชื่อมต่ออุปกรณ์แล้ว", room: room ? { ...room, tenant_name: undefined } : null });
  } catch (error) {
    console.error("Customer add Wi-Fi device error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

// Customers may disconnect devices on their own room's Wi-Fi only.
router.delete("/me/devices/:id", authenticate, requireCustomerRole, requireActiveAccount, async (req, res) => {
  const id = Number(req.params.id);
  if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสอุปกรณ์ไม่ถูกต้อง" });
  try {
    const pool = getPool();
    const [[customer]] = await pool.query("SELECT room_number FROM Customer WHERE id = ?", [req.user.id]);
    if (customer?.room_number == null) return res.status(404).json({ message: "ไม่พบห้องพักของคุณ" });
    const [result] = await pool.query(
      "DELETE FROM RoomWifiDevice WHERE id = ? AND room_number = ?",
      [id, customer.room_number],
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบอุปกรณ์นี้ในห้องของคุณ" });
    const [room] = await loadRoomsWifi(pool, customer.room_number);
    return res.json({ message: "ยกเลิกการเชื่อมต่ออุปกรณ์แล้ว", room: room ? { ...room, tenant_name: undefined } : null });
  } catch (error) {
    console.error("Customer disconnect Wi-Fi device error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

router.use(authenticate, requireStaffRole, requireActiveAccount);

router.get("/", async (req, res) => {
  try {
    return res.json({ rooms: await loadRoomsWifi(getPool()) });
  } catch (error) {
    console.error("Fetch Wi-Fi rooms error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

router.patch("/:room_number", async (req, res) => {
  const roomNumber = parseRoomNumber(req, res);
  if (roomNumber == null) return;
  const { ssid, max_devices, is_enabled } = req.body ?? {};
  const updates = [];
  const values = [];

  if (ssid !== undefined) {
    const value = typeof ssid === "string" ? ssid.trim() : "";
    if (!value || value.length > 32) return res.status(400).json({ message: "ชื่อ Wi-Fi ต้องมี 1-32 ตัวอักษร" });
    updates.push("ssid = ?");
    values.push(value);
  }
  if (max_devices !== undefined) {
    const value = Number(max_devices);
    if (!Number.isInteger(value) || value < 1 || value > MAX_DEVICE_LIMIT) {
      return res.status(400).json({ message: `จำนวนเครื่องต้องอยู่ระหว่าง 1-${MAX_DEVICE_LIMIT} เครื่อง` });
    }
    updates.push("max_devices = ?");
    values.push(value);
  }
  if (is_enabled !== undefined) {
    if (typeof is_enabled !== "boolean") return res.status(400).json({ message: "สถานะ Wi-Fi ไม่ถูกต้อง" });
    updates.push("is_enabled = ?");
    values.push(is_enabled);
  }
  if (updates.length === 0) return res.status(400).json({ message: "ไม่มีข้อมูลที่ต้องการแก้ไข" });

  try {
    const pool = getPool();
    await ensureRoomWifi(pool);
    if (max_devices !== undefined) {
      const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM RoomWifiDevice WHERE room_number = ?", [roomNumber]);
      if (count > Number(max_devices)) {
        return res.status(409).json({ message: `ห้องนี้เชื่อมต่ออยู่ ${count} เครื่อง กรุณาตัดการเชื่อมต่อก่อนลดจำนวนเครื่อง` });
      }
    }
    const [[before]] = await pool.query("SELECT ssid, max_devices, is_enabled FROM RoomWifi WHERE room_number = ?", [roomNumber]);
    const [result] = await pool.query(
      `UPDATE RoomWifi SET ${updates.join(", ")}, updated_at = NOW() WHERE room_number = ?`,
      [...values, roomNumber],
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    // Turning Wi-Fi off drops every device, like a real access point would.
    if (is_enabled === false) await pool.query("DELETE FROM RoomWifiDevice WHERE room_number = ?", [roomNumber]);
    const changes = [
      ssid !== undefined && ssid.trim() !== before?.ssid && `เปลี่ยนชื่อ Wi-Fi เป็น "${ssid.trim()}"`,
      max_devices !== undefined && Number(max_devices) !== Number(before?.max_devices) && `จำนวนเครื่องสูงสุดเป็น ${Number(max_devices)} เครื่อง`,
      is_enabled !== undefined && is_enabled !== Boolean(before?.is_enabled)
        && (is_enabled ? "เปิดใช้งาน Wi-Fi" : "ปิดใช้งาน Wi-Fi อุปกรณ์ทั้งหมดถูกตัดการเชื่อมต่อ"),
    ].filter(Boolean);
    if (changes.length > 0) await wifiChanged(roomNumber, req.user, changes.join(" · "));
    return sendRoom(res, pool, roomNumber, "บันทึกการตั้งค่า Wi-Fi แล้ว");
  } catch (error) {
    console.error("Update Wi-Fi error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

router.post("/:room_number/reset-password", async (req, res) => {
  const roomNumber = parseRoomNumber(req, res);
  if (roomNumber == null) return;
  try {
    const pool = getPool();
    await ensureRoomWifi(pool);
    const [result] = await pool.query(
      "UPDATE RoomWifi SET password = ?, updated_at = NOW() WHERE room_number = ?",
      [generatePassword(), roomNumber],
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบห้องพักตามเลขห้องที่ระบุ" });
    // A new password signs every device out.
    await pool.query("DELETE FROM RoomWifiDevice WHERE room_number = ?", [roomNumber]);
    await wifiChanged(roomNumber, req.user, "เปลี่ยนรหัส Wi-Fi แล้ว อุปกรณ์เดิมถูกตัดการเชื่อมต่อทั้งหมด", "ดูรหัสใหม่ได้ที่เมนู Wi-Fi");
    return sendRoom(res, pool, roomNumber, "เปลี่ยนรหัส Wi-Fi แล้ว อุปกรณ์เดิมถูกตัดการเชื่อมต่อทั้งหมด");
  } catch (error) {
    console.error("Reset Wi-Fi password error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

router.post("/:room_number/devices", async (req, res) => {
  const roomNumber = parseRoomNumber(req, res);
  if (roomNumber == null) return;
  try {
    const pool = getPool();
    const failure = await addDevice(pool, roomNumber, req.body);
    if (failure) return res.status(failure.status).json({ message: failure.message });
    await wifiChanged(roomNumber, req.user, `เพิ่มอุปกรณ์ "${req.body.device_name.trim()}"`);
    return await sendRoom(res, pool, roomNumber, "เพิ่มอุปกรณ์แล้ว", 201);
  } catch (error) {
    console.error("Add Wi-Fi device error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

router.patch("/:room_number/devices/:id", async (req, res) => {
  const roomNumber = parseRoomNumber(req, res);
  if (roomNumber == null) return;
  const id = Number(req.params.id);
  if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสอุปกรณ์ไม่ถูกต้อง" });
  if (typeof req.body?.is_online !== "boolean") return res.status(400).json({ message: "สถานะอุปกรณ์ไม่ถูกต้อง" });
  try {
    const pool = getPool();
    const [[device]] = await pool.query("SELECT device_name, is_online FROM RoomWifiDevice WHERE id = ? AND room_number = ?", [id, roomNumber]);
    const [result] = await pool.query(
      "UPDATE RoomWifiDevice SET is_online = ? WHERE id = ? AND room_number = ?",
      [req.body.is_online, id, roomNumber],
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบอุปกรณ์นี้" });
    if (Boolean(device?.is_online) !== req.body.is_online) {
      await wifiChanged(roomNumber, req.user, `อุปกรณ์ "${device.device_name}" ${req.body.is_online ? "ออนไลน์" : "ออฟไลน์"}แล้ว`);
    }
    return sendRoom(res, pool, roomNumber, req.body.is_online ? "อุปกรณ์ออนไลน์แล้ว" : "อุปกรณ์ออฟไลน์แล้ว");
  } catch (error) {
    console.error("Update Wi-Fi device error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

router.delete("/:room_number/devices/:id", async (req, res) => {
  const roomNumber = parseRoomNumber(req, res);
  if (roomNumber == null) return;
  const id = Number(req.params.id);
  if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสอุปกรณ์ไม่ถูกต้อง" });
  try {
    const pool = getPool();
    const [[device]] = await pool.query("SELECT device_name FROM RoomWifiDevice WHERE id = ? AND room_number = ?", [id, roomNumber]);
    const [result] = await pool.query("DELETE FROM RoomWifiDevice WHERE id = ? AND room_number = ?", [id, roomNumber]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบอุปกรณ์นี้" });
    await wifiChanged(roomNumber, req.user, `ตัดการเชื่อมต่ออุปกรณ์ "${device?.device_name || "-"}"`);
    return sendRoom(res, pool, roomNumber, "ตัดการเชื่อมต่ออุปกรณ์แล้ว");
  } catch (error) {
    console.error("Disconnect Wi-Fi device error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

router.delete("/:room_number/devices", async (req, res) => {
  const roomNumber = parseRoomNumber(req, res);
  if (roomNumber == null) return;
  try {
    const pool = getPool();
    const [result] = await pool.query("DELETE FROM RoomWifiDevice WHERE room_number = ?", [roomNumber]);
    if (result.affectedRows > 0) await wifiChanged(roomNumber, req.user, `ตัดการเชื่อมต่อทุกอุปกรณ์ (${result.affectedRows} เครื่อง)`);
    return sendRoom(res, pool, roomNumber, "ตัดการเชื่อมต่อทุกอุปกรณ์แล้ว");
  } catch (error) {
    console.error("Disconnect all Wi-Fi devices error:", error);
    return res.status(500).json({ message: SERVER_ERROR });
  }
});

export default router;
