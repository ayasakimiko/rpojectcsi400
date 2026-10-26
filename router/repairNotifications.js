import { byActor, notify, notifyCustomer, notifyStaffSide } from "../middleware/notifications.js";
import { MAINTENANCE_CATEGORY_LABEL, MAINTENANCE_TIME_LABEL } from "../src/utils/maintenanceCategories.js";

const OPERATORS = ["Staff", "Admin"];
const OWNER = ["Owner"];
const TARGET = "repair-vendors";
const REF = "RepairJob";

const categoryOf = (job) => MAINTENANCE_CATEGORY_LABEL[job.category] || "งานซ่อม";
const urgentTag = (job) => (job.urgency === "urgent" ? " (ด่วน)" : "");
const thaiDateTime = (value) => (value
  ? new Date(value).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })
  : null);
const appointment = (job) => [
  job.technician_name && `ช่าง ${job.technician_name}`,
  job.scheduled_at && `นัด ${thaiDateTime(job.scheduled_at)}`,
].filter(Boolean).join(" · ");

async function safely(name, run) {
  try {
    await run();
  } catch (error) {
    console.error(`Repair notification ${name} error:`, error);
  }
}

async function tenantOf(db, job) {
  if (job.maintenance_request_id) {
    const [[request]] = await db.query("SELECT customer_id FROM MaintenanceRequest WHERE id = ?", [job.maintenance_request_id]);
    if (request) return request.customer_id;
  }
  const [[customer]] = await db.query(
    "SELECT id FROM Customer WHERE room_number = ? AND is_suspended = FALSE ORDER BY id DESC LIMIT 1",
    [job.room_number],
  );
  return customer?.id || null;
}

const forOperators = (item) => notifyStaffSide({ target: TARGET, refTable: REF, ...item }, OPERATORS);
const forOwner = (item) => notifyStaffSide({ target: TARGET, refTable: REF, ...item }, OWNER);
const forTenant = (customerId, item) => notifyCustomer(customerId, { target: "maintenance", refTable: REF, ...item });

export const repairJobSent = (db, job, actor) => safely("repairJobSent", async () => {
  const customerId = await tenantOf(db, job);
  await notify([
    forOperators({
      type: "repair_job_sent", tone: job.urgency === "urgent" ? "danger" : "info", refId: job.id,
      title: `ส่งงานซ่อมห้อง ${job.room_number}${urgentTag(job)}`,
      message: `${categoryOf(job)} → ${job.vendor_name}${byActor(actor)}`, detail: job.description, actor,
    }),
    forOwner({
      type: "repair_job_sent", tone: "info", refId: job.id,
      title: `เรียกช่างซ่อมห้อง ${job.room_number}`, message: `${categoryOf(job)}${urgentTag(job)} ส่งให้ ${job.vendor_name} (สัญญาซ่อม)`, actor,
    }),
    customerId && forTenant(customerId, {
      type: "repair_job_sent", tone: "info", refId: job.id,
      title: "หอพักเรียกช่างมาซ่อมให้แล้ว",
      message: `${categoryOf(job)} ห้อง ${job.room_number} · รอช่างนัดเวลาเข้าซ่อม`,
      detail: `ช่วงเวลาที่แจ้งไว้: ${MAINTENANCE_TIME_LABEL[job.preferred_time] || "เวลาไหนก็ได้"}`,
    }),
  ], db);
});

export const repairJobEdited = (db, job, actor, changes) => safely("repairJobEdited", async () => {
  const customerId = changes.includes("preferred_time") ? await tenantOf(db, job) : null;
  await notify([
    forOperators({
      type: "repair_job_edited", tone: "info", refId: job.id,
      title: `แก้ไขงานซ่อมห้อง ${job.room_number}`, message: `แจ้ง ${job.vendor_name} แล้ว${byActor(actor)}`,
      detail: `แก้ไข: ${changes.map((key) => EDIT_LABEL[key]).join(", ")}`, actor,
    }),
    customerId && forTenant(customerId, {
      type: "repair_job_edited", tone: "info", refId: job.id,
      title: "ปรับช่วงเวลาเข้าซ่อม", message: `${categoryOf(job)} ห้อง ${job.room_number} · ${MAINTENANCE_TIME_LABEL[job.preferred_time] || "เวลาไหนก็ได้"}`,
    }),
  ], db);
});

const EDIT_LABEL = { category: "ประเภทงาน", urgency: "ความเร่งด่วน", description: "รายละเอียด", contact_phone: "เบอร์ติดต่อ", preferred_time: "ช่วงเวลา" };

export const repairJobCancelled = (db, job, actor) => safely("repairJobCancelled", async () => {
  const customerId = await tenantOf(db, job);
  await notify([
    forOperators({
      type: "repair_job_cancelled", tone: "danger", refId: job.id,
      title: `ยกเลิกงานซ่อมห้อง ${job.room_number}`, message: `${job.vendor_name}${byActor(actor)}`, detail: job.cancel_reason, actor,
    }),
    forOwner({
      type: "repair_job_cancelled", tone: "danger", refId: job.id,
      title: `ยกเลิกงานซ่อมห้อง ${job.room_number}`, message: `${categoryOf(job)} · ${job.vendor_name}`, detail: job.cancel_reason, actor,
    }),
    customerId && forTenant(customerId, {
      type: "repair_job_cancelled", tone: "info", refId: job.id,
      title: "ยกเลิกนัดช่างซ่อม", message: `${categoryOf(job)} ห้อง ${job.room_number} · ติดต่อหอพักหากยังมีปัญหา`,
    }),
  ], db);
});

const VENDOR_STATUS = {
  accepted: { tone: "info", staff: "รับงานแล้ว", tenantTitle: "ช่างรับงานซ่อมแล้ว", tenantMessage: "ช่างจะเข้ามาตามนัด" },
  in_progress: { tone: "info", staff: "เริ่มซ่อมแล้ว", tenantTitle: "ช่างกำลังซ่อม", tenantMessage: "ช่างเริ่มเข้าซ่อมแล้ว" },
  done: { tone: "success", staff: "ซ่อมเสร็จแล้ว", tenantTitle: "ซ่อมเสร็จแล้ว", tenantMessage: "หากยังพบปัญหา แจ้งซ่อมใหม่ได้" },
  rejected: { tone: "danger", staff: "ปฏิเสธงาน" },
};

export const repairVendorStatusChanged = (db, job, actor, { previousStatus, note, scheduleChanged }) => safely("repairVendorStatusChanged", async () => {
  const info = VENDOR_STATUS[job.status];
  if (!info) return;
  const statusChanged = previousStatus !== job.status;
  if (!statusChanged && !scheduleChanged) return;
  const details = appointment(job);
  const customerId = job.status !== "rejected" ? await tenantOf(db, job) : null;
  await notify([
    forOperators({
      type: `repair_job_${job.status}`, tone: info.tone, refId: job.id,
      title: `งานซ่อมห้อง ${job.room_number}`,
      message: statusChanged ? `${job.vendor_name} ${info.staff}` : `${job.vendor_name} อัปเดตนัดหมาย`,
      detail: [details, note].filter(Boolean).join(" · ") || null, actor,
    }),
    statusChanged && ["done", "rejected"].includes(job.status) && forOwner({
      type: `repair_job_${job.status}`, tone: info.tone, refId: job.id,
      title: `งานซ่อมห้อง ${job.room_number}`,
      message: job.status === "done" ? `${job.vendor_name} ซ่อม${categoryOf(job)}เสร็จแล้ว` : `${job.vendor_name} ปฏิเสธงาน ต้องส่งช่างรายอื่น`,
      detail: job.status === "rejected" ? note : null, actor,
    }),
    customerId && forTenant(customerId, {
      type: `repair_job_${job.status}`, tone: info.tone, refId: job.id,
      title: statusChanged ? info.tenantTitle : "ช่างอัปเดตนัดหมาย",
      message: `${categoryOf(job)} ห้อง ${job.room_number} · ${details || info.tenantMessage}`,
    }),
  ], db);
});

export const repairVendorChanged = (db, vendor, actor, kind) => safely("repairVendorChanged", async () => {
  const label = {
    created: { title: "เพิ่มช่างที่ทำสัญญาซ่อม", tone: "success" },
    updated: { title: "แก้ไขข้อมูลช่างซ่อม", tone: "info" },
    deactivated: { title: "ปิดการใช้งานช่างซ่อม", tone: "danger" },
  }[kind];
  const contract = `สัญญา${vendor.contract_type === "yearly" ? "รายปี" : "รายเดือน"} ถึง ${vendor.contract_end}`;
  await notify([
    forOperators({ type: `repair_vendor_${kind}`, tone: label.tone, refTable: "RepairVendor", refId: vendor.id, title: label.title, message: `${vendor.name}${byActor(actor)}`, detail: contract, actor }),
    kind !== "updated" && forOwner({ type: `repair_vendor_${kind}`, tone: label.tone, refTable: "RepairVendor", refId: vendor.id, title: label.title, message: vendor.name, detail: contract, actor }),
  ], db);
});

export const repairKeyChanged = (db, vendor, actor, kind) => safely("repairKeyChanged", async () => {
  const title = { issued: "ออก API key ให้ช่าง", rotated: "ออก API key ใหม่แทนให้ช่าง", revoked: "ยกเลิก API key ของช่าง" }[kind];
  await notify(forOperators({
    type: `repair_key_${kind}`, tone: kind === "revoked" ? "danger" : "info", refTable: "RepairVendor", refId: vendor.id,
    title, message: `${vendor.name}${byActor(actor)}`, actor,
  }), db);
});
