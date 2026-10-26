import { Router } from "express";
import { getPool } from "../Database/connection.js";
import {
  JOB_STATUSES,
  applyVendorStatus,
  fail,
  loadJob,
  parseId,
  publicJob,
  serializeVendor,
  validateStatusInput,
} from "./repairVendorShared.js";

const router = Router();
const MAX_JOBS = 200;

function readOnly(resource) {
  return (req, res) => res.status(403).json({
    code: "READ_ONLY",
    message: `${resource}เป็นข้อมูลอ่านอย่างเดียว ติดต่อเจ้าหน้าที่หอพักหากต้องการแก้ไข`,
  });
}

function publicVendor(row) {
  const vendor = serializeVendor(row);
  return {
    name: vendor.name,
    contact_name: vendor.contact_name,
    phone: vendor.phone,
    email: vendor.email,
    specialties: vendor.specialties,
    specialty_other: vendor.specialty_other,
    contract_type: vendor.contract_type,
    contract_start: vendor.contract_start,
    contract_end: vendor.contract_end,
    contract_fee: vendor.contract_fee,
    contract_fee_period: vendor.contract_type === "yearly" ? "year" : "month",
  };
}

router.get("/", (req, res) => {
  res.json({
    service: "repair",
    version: "1",
    endpoints: [
      "GET /api/repair/v1/vendor",
      "GET /api/repair/v1/jobs?status=",
      "GET /api/repair/v1/jobs/:id",
      "PATCH|PUT /api/repair/v1/jobs/:id/status (status, note, technician_name, scheduled_at)",
    ],
    statuses: { accepted: "รับงาน", rejected: "ปฏิเสธงาน", in_progress: "กำลังซ่อม", done: "ซ่อมเสร็จ" },
  });
});

router.get("/vendor", async (req, res) => {
  const db = getPool();
  const [[vendor]] = await db.query(
    `SELECT v.*, DATE_FORMAT(v.contract_start, '%Y-%m-%d') AS contract_start, DATE_FORMAT(v.contract_end, '%Y-%m-%d') AS contract_end
     FROM RepairVendor v WHERE v.id = ?`,
    [req.vendor.vendorId],
  );
  const [counts] = await db.query("SELECT status, COUNT(*) AS count FROM RepairJob WHERE vendor_id = ? GROUP BY status", [req.vendor.vendorId]);
  res.json({
    vendor: publicVendor(vendor),
    job_summary: Object.fromEntries(JOB_STATUSES.map((status) => [status, Number(counts.find((row) => row.status === status)?.count || 0)])),
  });
});
router.all("/vendor", readOnly("ข้อมูลช่างและสัญญาซ่อม"));

router.get("/jobs", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  if (status && !JOB_STATUSES.includes(status)) throw fail(`status ต้องเป็นหนึ่งใน ${JOB_STATUSES.join(", ")}`);
  const [rows] = await getPool().query(
    `SELECT j.*, v.name AS vendor_name, v.phone AS vendor_phone, v.contract_type AS vendor_contract_type
     FROM RepairJob j
     JOIN RepairVendor v ON v.id = j.vendor_id
     WHERE j.vendor_id = ? AND (? = '' OR j.status = ?)
     ORDER BY j.created_at DESC
     LIMIT ?`,
    [req.vendor.vendorId, status, status, MAX_JOBS],
  );
  res.json({ jobs: rows.map(publicJob) });
});

router.get("/jobs/:id", async (req, res) => {
  const job = await loadJob(getPool(), parseId(req.params.id), req.vendor.vendorId);
  res.json({ job: publicJob(job) });
});

async function updateStatus(req, res) {
  const db = getPool();
  const input = validateStatusInput(req.body);
  const job = await loadJob(db, parseId(req.params.id), req.vendor.vendorId);
  const updated = await applyVendorStatus(db, job, input, req.vendor);
  res.json({ message: "อัปเดตสถานะงานซ่อมเรียบร้อยแล้ว", job: publicJob(updated) });
}

router.patch("/jobs/:id/status", updateStatus);
router.put("/jobs/:id/status", updateStatus);
router.all("/jobs/:id", readOnly("รายละเอียดงานซ่อม (เปลี่ยนได้เฉพาะสถานะผ่าน /jobs/:id/status)"));

export default router;
