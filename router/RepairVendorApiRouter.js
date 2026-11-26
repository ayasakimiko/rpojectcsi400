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
import {
  CONTRACT_STATUSES,
  addContractFiles,
  cancelContract,
  listContracts,
  loadContract,
  loadContractFile,
  parseContractInput,
  parseContractNo,
  parseContractUpload,
  parseUpdatedSince,
  publicContract,
  sendContractFile,
  upsertContract,
} from "./repairContracts.js";
import { CHANGE_STATUSES, cancelVendorChange, createVendorChange, listVendorChanges, loadVendorChange } from "./repairVendorChanges.js";

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
      "GET /api/repair/v1/vendor/change-requests?status=&updated_since=",
      "POST /api/repair/v1/vendor/change-requests (changes, reason)",
      "GET /api/repair/v1/vendor/change-requests/:id",
      "POST /api/repair/v1/vendor/change-requests/:id/cancel",
      "GET /api/repair/v1/jobs?status=",
      "GET /api/repair/v1/jobs/:id",
      "PATCH|PUT /api/repair/v1/jobs/:id/status (status, note, technician_name, technician_phone, scheduled_at)",
      "GET /api/repair/v1/buildings/:ref/owner",
      "GET /api/repair/v1/contracts?status=&updated_since=&job_id=",
      "GET /api/repair/v1/jobs/:id/contracts",
      "PUT /api/repair/v1/jobs/:id/contracts/:contract_no",
      "POST /api/repair/v1/jobs/:id/contracts/:contract_no/files (multipart field files)",
      "GET /api/repair/v1/jobs/:id/contracts/:contract_no/files/:file_id",
      "POST /api/repair/v1/jobs/:id/contracts/:contract_no/cancel",
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
  const [pending] = await listVendorChanges(db, { vendorId: req.vendor.vendorId, status: "pending", limit: 1 });
  res.json({
    vendor: publicVendor(vendor),
    job_summary: Object.fromEntries(JOB_STATUSES.map((status) => [status, Number(counts.find((row) => row.status === status)?.count || 0)])),
    pending_change_request: pending || null,
  });
});
router.all("/vendor", (req, res) => res.status(403).json({
  code: "READ_ONLY",
  message: "แก้ข้อมูลช่างและสัญญาโดยตรงไม่ได้ ให้ส่งคำขอที่ POST /vendor/change-requests แล้วรอหอพักอนุมัติ",
}));

// ---------- change requests: the vendor proposes, the dorm approves or rejects ----------
router.get("/vendor/change-requests", async (req, res) => {
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : null;
  if (status && !CHANGE_STATUSES.includes(status)) throw fail(`status ต้องเป็นหนึ่งใน ${CHANGE_STATUSES.join(", ")}`);
  const serverTime = new Date().toISOString();
  const requests = await listVendorChanges(getPool(), {
    vendorId: req.vendor.vendorId, status, updatedSinceMs: parseUpdatedSince(req.query.updated_since),
  });
  res.json({ change_requests: requests, server_time: serverTime });
});

router.post("/vendor/change-requests", async (req, res) => {
  res.status(201).json(await createVendorChange(getPool(), { vendor: req.vendor, body: req.body }));
});

router.get("/vendor/change-requests/:changeId", async (req, res) => {
  res.json(await loadVendorChange(getPool(), parseId(req.params.changeId), req.vendor.vendorId));
});

router.post("/vendor/change-requests/:changeId/cancel", async (req, res) => {
  res.json(await cancelVendorChange(getPool(), {
    vendor: req.vendor, requestId: parseId(req.params.changeId), reason: req.body?.reason,
  }));
});

// owner contact for partner integrations; the ref must be the one this vendor's key is bound to
router.get("/buildings/:ref/owner", async (req, res) => {
  const db = getPool();
  const [[integration]] = await db.query(
    "SELECT building_ref, owner_email FROM RepairVendorIntegration WHERE vendor_id = ?",
    [req.vendor.vendorId],
  );
  if (!integration || integration.building_ref !== req.params.ref) throw fail("ไม่พบอาคารนี้", 404, "NOT_FOUND");
  const [[owner]] = await db.query(
    "SELECT first_name, last_name, phone FROM Owner WHERE is_suspended = FALSE ORDER BY id LIMIT 1",
  );
  if (!owner) throw fail("ยังไม่มีข้อมูลเจ้าของหอในระบบ", 404, "NOT_FOUND");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    name: `${owner.first_name} ${owner.last_name}`.trim(),
    phone: owner.phone,
    email: integration.owner_email || null,
  });
});
router.all("/buildings/:ref/owner", readOnly("ข้อมูลเจ้าของหอ"));

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

// ---------- repair contracts ----------
const vendorJob = (req) => loadJob(getPool(), parseId(req.params.id), req.vendor.vendorId);

router.get("/contracts", async (req, res) => {
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : null;
  if (status && !CONTRACT_STATUSES.includes(status)) throw fail(`status ต้องเป็นหนึ่งใน ${CONTRACT_STATUSES.join(", ")}`);
  const jobId = req.query.job_id ? parseId(String(req.query.job_id)) : null;
  const serverTime = new Date().toISOString();
  const contracts = await listContracts(getPool(), {
    vendorId: req.vendor.vendorId, status, jobId, updatedSinceMs: parseUpdatedSince(req.query.updated_since),
  });
  res.json({ contracts: contracts.map(publicContract), server_time: serverTime });
});

router.get("/jobs/:id/contracts", async (req, res) => {
  const job = await vendorJob(req);
  const contracts = await listContracts(getPool(), { jobId: job.id, vendorId: req.vendor.vendorId });
  res.json({ contracts: contracts.map(publicContract) });
});

router.get("/jobs/:id/contracts/:contractNo", async (req, res) => {
  const job = await vendorJob(req);
  const contract = await loadContract(getPool(), { jobId: job.id, vendorId: req.vendor.vendorId, contractNo: parseContractNo(req.params.contractNo) });
  res.json(publicContract(contract));
});

router.put("/jobs/:id/contracts/:contractNo", async (req, res) => {
  const jobId = parseId(req.params.id);
  const contractNo = parseContractNo(req.params.contractNo);
  const input = parseContractInput(req.body);
  const { contract, created } = await upsertContract(getPool(), { jobId, vendor: req.vendor, contractNo, input });
  res.status(created ? 201 : 200).json(publicContract(contract));
});

router.post("/jobs/:id/contracts/:contractNo/files", parseContractUpload, async (req, res) => {
  const contract = await addContractFiles(getPool(), {
    jobId: parseId(req.params.id), vendor: req.vendor, contractNo: parseContractNo(req.params.contractNo), files: req.contractFiles,
  });
  res.status(201).json(publicContract(contract));
});

router.get("/jobs/:id/contracts/:contractNo/files/:fileId", async (req, res) => {
  const job = await vendorJob(req);
  const file = await loadContractFile(getPool(), parseId(req.params.fileId), {
    vendorId: req.vendor.vendorId, jobId: job.id, contractNo: parseContractNo(req.params.contractNo),
  });
  sendContractFile(res, file);
});

router.post("/jobs/:id/contracts/:contractNo/cancel", async (req, res) => {
  const contract = await cancelContract(getPool(), {
    jobId: parseId(req.params.id), vendor: req.vendor, contractNo: parseContractNo(req.params.contractNo), reason: req.body?.reason,
  });
  res.json(publicContract(contract));
});

router.patch("/jobs/:id/status", updateStatus);
router.put("/jobs/:id/status", updateStatus);
router.all("/jobs/:id", readOnly("รายละเอียดงานซ่อม (เปลี่ยนได้เฉพาะสถานะผ่าน /jobs/:id/status)"));

export default router;
