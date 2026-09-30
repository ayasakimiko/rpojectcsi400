import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { isPositiveId } from "../middleware/validation.js";

const router = Router();
const USER_TABLE = { Customer: "Customer", Staff: "Staff", Admin: "Admin", Owner: "Owner" };
const REVIEW_ROLES = new Set(["Admin", "Owner"]);

router.post("/", async (req, res) => {
  try {
    const { incidentType, severity = "normal", description, roomNumber } = req.body ?? {};
    if (!String(incidentType ?? "").trim() || !String(description ?? "").trim()) {
      return res.status(400).json({ message: "กรุณาระบุประเภทเหตุและรายละเอียด" });
    }
    if (!["normal", "urgent"].includes(severity)) return res.status(400).json({ message: "ระดับความเร่งด่วนไม่ถูกต้อง" });
    if (String(description).length > 1000) return res.status(400).json({ message: "รายละเอียดต้องไม่เกิน 1,000 ตัวอักษร" });

    const pool = getPool();
    const table = USER_TABLE[req.user?.role];
    const [users] = await pool.query(`SELECT first_name, last_name, ${req.user.role === "Customer" ? "room_number" : "NULL AS room_number"} FROM ${table} WHERE id = ?`, [req.user.id]);
    const user = users[0];
    if (!user) return res.status(404).json({ message: "ไม่พบข้อมูลผู้รายงาน" });
    const name = `${user.first_name} ${user.last_name}`.trim();
    const safeRoom = req.user.role === "Customer" ? user.room_number : (Number.isInteger(Number(roomNumber)) && Number(roomNumber) > 0 ? Number(roomNumber) : null);
    await pool.query(
      `INSERT INTO SafetyIncident (reporter_role, reporter_id, reporter_name, room_number, incident_type, severity, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.role, req.user.id, name, safeRoom, String(incidentType).trim().slice(0, 80), severity, String(description).trim()],
    );
    return res.status(201).json({ message: "ส่งรายงานเหตุให้ Admin และ Owner แล้ว" });
  } catch (error) {
    console.error("Create safety incident error:", error);
    return res.status(500).json({ message: "ไม่สามารถส่งรายงานเหตุได้" });
  }
});

router.get("/", async (req, res) => {
  if (!REVIEW_ROLES.has(req.user?.role)) return res.status(403).json({ message: "เฉพาะ Admin หรือ Owner เท่านั้น" });
  try {
    const [incidents] = await getPool().query("SELECT * FROM SafetyIncident ORDER BY (status = 'pending') DESC, created_at DESC");
    return res.json({ incidents });
  } catch (error) {
    console.error("Fetch safety incidents error:", error);
    return res.status(500).json({ message: "ไม่สามารถโหลดรายงานเหตุได้" });
  }
});

router.patch("/:id/review", async (req, res) => {
  if (!REVIEW_ROLES.has(req.user?.role)) return res.status(403).json({ message: "เฉพาะ Admin หรือ Owner เท่านั้น" });
  try {
    const id = Number(req.params.id);
    if (!isPositiveId(id)) return res.status(400).json({ message: "รหัสรายงานไม่ถูกต้อง" });
    const note = String(req.body?.reviewNote ?? "").trim();
    if (note.length > 500) return res.status(400).json({ message: "บันทึกผลต้องไม่เกิน 500 ตัวอักษร" });
    const table = USER_TABLE[req.user.role];
    const pool = getPool();
    const [users] = await pool.query(`SELECT first_name, last_name FROM ${table} WHERE id = ?`, [req.user.id]);
    const reviewerName = users[0] ? `${users[0].first_name} ${users[0].last_name}` : req.user.role;
    const [result] = await pool.query(
      "UPDATE SafetyIncident SET status = 'reviewed', reviewed_by_name = ?, reviewed_at = NOW(), review_note = ? WHERE id = ? AND status = 'pending'",
      [reviewerName, note || null, id],
    );
    if (!result.affectedRows) return res.status(409).json({ message: "รายงานนี้ถูกตรวจสอบแล้ว" });
    return res.json({ message: "บันทึกผลตรวจสอบแล้ว" });
  } catch (error) {
    console.error("Review safety incident error:", error);
    return res.status(500).json({ message: "ไม่สามารถบันทึกผลตรวจสอบได้" });
  }
});

export default router;
