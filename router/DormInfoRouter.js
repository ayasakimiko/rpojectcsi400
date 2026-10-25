import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { requireAdminRole } from "../middleware/authMiddleware.js";
import { contractSystemRules } from "../middleware/validation.js";
import { dormRulesChanged } from "./notificationEvents.js";

const FIELDS = ["dorm_name", "dorm_rules", "contract_rules", "gate_close_time", "caretaker_phone", "technician_phone"];
const DEFAULT_INFO = {
  dorm_name: "หอพักใจ",
  dorm_rules: "",
  contract_rules: "",
  gate_close_time: "",
  caretaker_phone: "",
  technician_phone: "",
};

function parseDormInfo(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "ข้อมูลไม่ถูกต้อง" };
  const value = {};
  for (const field of FIELDS) {
    const raw = field === "contract_rules" && body[field] == null ? "" : body[field];
    if (typeof raw !== "string") return { error: "กรุณากรอกข้อมูลให้ครบถ้วน" };
    value[field] = raw.trim();
  }
  if (!value.dorm_name || value.dorm_name.length > 255) return { error: "ชื่อหอพักต้องมีความยาว 1–255 ตัวอักษร" };
  if (value.dorm_rules.length > 10000) return { error: "กฎระเบียบต้องไม่เกิน 10,000 ตัวอักษร" };
  if (value.contract_rules.length > 10000) return { error: "เงื่อนไขสัญญาเช่าต้องไม่เกิน 10,000 ตัวอักษร" };
  if (value.gate_close_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.gate_close_time)) {
    return { error: "เวลาปิดประตูไม่ถูกต้อง" };
  }
  for (const field of ["caretaker_phone", "technician_phone"]) {
    if (value[field].length > 20 || (value[field] && !/^(?:0\d{8,9}|\+66\d{8,9})$/.test(value[field].replace(/[\s()-]/g, "")))) {
      return { error: "กรุณาระบุเบอร์โทรศัพท์ให้ถูกต้อง เช่น 0812345678 หรือ 02-123-4567" };
    }
  }
  return { value };
}

export function createDormInfoRouter(poolProvider = getPool) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.get("/", async (_req, res) => {
    try {
      const [rows] = await poolProvider().query(`SELECT ${FIELDS.join(", ")} FROM DormConfig WHERE id = 1`);
      const config = Object.fromEntries(FIELDS.map((field) => [field, rows[0]?.[field] ?? DEFAULT_INFO[field]]));
      return res.json({ config: { ...config, contract_system: contractSystemRules() } });
    } catch (error) {
      console.error("Fetch dorm information error:", error.code);
      return res.status(500).json({ message: "ไม่สามารถโหลดกฎระเบียบและเบอร์ติดต่อได้" });
    }
  });

  router.put("/", requireAdminRole, async (req, res) => {
    const { value, error } = parseDormInfo(req.body);
    if (error) return res.status(400).json({ message: error });
    try {
      const [[before]] = await poolProvider().query("SELECT dorm_rules, contract_rules FROM DormConfig WHERE id = 1");
      await poolProvider().query(
        `INSERT INTO DormConfig (id, ${FIELDS.join(", ")}) VALUES (1, ${FIELDS.map(() => "?").join(", ")})
         ON DUPLICATE KEY UPDATE ${FIELDS.map((field) => `${field} = ?`).join(", ")}`,
        [...FIELDS.map((field) => value[field]), ...FIELDS.map((field) => value[field])],
      );
      if ((before?.dorm_rules ?? "") !== value.dorm_rules || (before?.contract_rules ?? "") !== value.contract_rules) {
        await dormRulesChanged(req.user);
      }
      return res.json({
        message: "บันทึกกฎระเบียบและเบอร์ติดต่อเรียบร้อยแล้ว",
        config: { ...value, contract_system: contractSystemRules() },
      });
    } catch (saveError) {
      console.error("Save dorm information error:", saveError.code);
      return res.status(500).json({ message: "ไม่สามารถบันทึกกฎระเบียบและเบอร์ติดต่อได้" });
    }
  });
  return router;
}

export default createDormInfoRouter();
