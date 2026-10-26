import { getPool } from "../Database/connection.js";
import { actorOf, baht, byActor, notify, notifyCustomer, notifyStaffSide } from "../middleware/notifications.js";

// One function per business event. Each loads whatever context it needs, then writes the
// customer-facing result and the "done by X" peer notice for the other staff-side users.
// Callers fire these after their change succeeded; errors never reach the request.

const TENANT_TYPE_LABEL = { renew: "ต่อสัญญา", moveout: "ย้ายออก", move_room: "ย้ายห้อง" };
const PAYMENT_TYPE_LABEL = {
  rent: "ค่าเช่า", deposit: "เงินมัดจำ", water: "ค่าน้ำ", electricity: "ค่าไฟ", room_transfer: "ยอดย้ายห้อง",
};
const VISIT_TYPE_LABEL = { vehicle: "คำขอรถ", overnight_guest: "คำขอผู้มาพัก" };
const MAINTENANCE_ACTION = {
  accept: { label: "รับงานแจ้งซ่อม", tone: "info" },
  complete: { label: "ซ่อมเสร็จ", tone: "success" },
  reject: { label: "ปฏิเสธแจ้งซ่อม", tone: "danger" },
};
const thaiDate = (value) => (value ? new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "-");
const fullName = (row) => `${row?.first_name || ""} ${row?.last_name || ""}`.trim();

async function safely(name, run) {
  try {
    await run(getPool());
  } catch (error) {
    console.error(`Notification event ${name} error:`, error);
  }
}

export const tenantRequestAcknowledged = (requestId, actor) => safely("tenantRequestAcknowledged", async (db) => {
  const [[request]] = await db.query("SELECT type, room_number FROM TenantRequest WHERE id = ?", [requestId]);
  if (!request) return;
  await notify(notifyStaffSide({
    type: "tenant_request_acknowledged", tone: "info", target: `requests:${request.type}`, refTable: "TenantRequest", refId: requestId,
    title: `คำขอ${TENANT_TYPE_LABEL[request.type] || ""} ห้อง ${request.room_number}`, message: `รับเรื่องแล้ว${byActor(actor)}`, actor,
  }), db);
});

export const tenantRequestDecided = (requestId, actor, decision) => safely("tenantRequestDecided", async (db) => {
  const [[request]] = await db.query(
    `SELECT tr.customer_id, tr.type, tr.room_number, tr.target_room_number, tr.renew_duration_months, tr.reject_reason,
            r.rental_end_date, r.price
     FROM TenantRequest tr LEFT JOIN Room r ON r.room_number = tr.room_number WHERE tr.id = ?`,
    [requestId],
  );
  if (!request) return;
  const approved = decision === "approved";
  const label = TENANT_TYPE_LABEL[request.type] || "";
  await notify([
    notifyStaffSide({
      type: `tenant_request_${decision}`, tone: approved ? "success" : "danger", target: `requests:${request.type}`,
      refTable: "TenantRequest", refId: requestId, title: `คำขอ${label} ห้อง ${request.room_number}`,
      message: `${approved ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"}${byActor(actor)}`,
      detail: approved ? null : request.reject_reason, actor,
    }),
    // The customer feed already reports approve/reject for every type; renewals add the new terms.
    approved && request.type === "renew" && notifyCustomer(request.customer_id, {
      type: "renew_approved", tone: "success", target: "contract", refTable: "TenantRequest", refId: requestId,
      title: "ต่อสัญญาสำเร็จ",
      message: `ต่อสัญญาอีก ${request.renew_duration_months} เดือน สิ้นสุดสัญญาใหม่ ${thaiDate(request.rental_end_date)}`,
      detail: request.price != null ? `ค่าเช่า ${baht(request.price)} ต่อเดือน ชำระรายเดือนตามรอบบิล` : null, actor,
    }),
  ], db);
});

export const transferChargeSent = (connection, plan, amountCents) => notify([
  notifyCustomer(plan.request.customer_id, {
    type: "transfer_charge", tone: "pending", target: "due", refTable: "TenantRequest", refId: plan.request.id,
    title: "ยอดชำระย้ายห้องรอชำระ",
    message: `ย้ายห้อง ${plan.sourceRoom.room_number} → ${plan.targetRoom.room_number} ต้องชำระ ${baht(amountCents / 100)} ภายใน 3 วัน`,
    detail: "ถ้าไม่ชำระภายในกำหนด ระบบจะยกเลิกคำขอย้ายห้องอัตโนมัติ",
  }),
], connection);

export const maintenanceUpdated = (requestId, actor, action) => safely("maintenanceUpdated", async (db) => {
  const info = MAINTENANCE_ACTION[action];
  const [[request]] = await db.query("SELECT room_number FROM MaintenanceRequest WHERE id = ?", [requestId]);
  if (!info || !request) return;
  await notify(notifyStaffSide({
    type: `maintenance_${action}`, tone: info.tone, target: "maintenance", refTable: "MaintenanceRequest", refId: requestId,
    title: `แจ้งซ่อม ห้อง ${request.room_number}`, message: `${info.label}${byActor(actor)}`, actor,
  }), db);
});

export const maintenanceCancelledByCustomer = (requestId, actor) => safely("maintenanceCancelledByCustomer", async (db) => {
  const [[request]] = await db.query("SELECT room_number, description FROM MaintenanceRequest WHERE id = ?", [requestId]);
  if (!request) return;
  await notify(notifyStaffSide({
    type: "maintenance_cancelled", tone: "info", target: "maintenance", refTable: "MaintenanceRequest", refId: requestId,
    title: `แจ้งซ่อม ห้อง ${request.room_number}`, message: "ผู้เช่ายกเลิกแจ้งซ่อมแล้ว", detail: request.description, actor,
  }), db);
});

export const slipReviewed = ({ paymentId, bookingId, customerId, amount, types, approved, reason }, actor) => safely("slipReviewed", async (db) => {
  const [[booking]] = await db.query(
    "SELECT r.room_number FROM Booking b LEFT JOIN Room r ON r.id = b.room_id WHERE b.id = ?",
    [bookingId],
  );
  const typeLabel = [...new Set(types)].map((type) => PAYMENT_TYPE_LABEL[type] || type).join(", ");
  const room = booking?.room_number ? ` ห้อง ${booking.room_number}` : "";
  await notify([
    notifyCustomer(customerId, {
      type: approved ? "slip_approved" : "slip_rejected", tone: approved ? "success" : "danger",
      target: approved ? "history" : "due", refTable: "Payment", refId: paymentId,
      title: approved ? "สลิปผ่านการตรวจสอบ" : "สลิปไม่ผ่านการตรวจสอบ",
      message: approved ? `ชำระ${typeLabel} ${baht(amount)} เรียบร้อยแล้ว` : `สลิป${typeLabel} ${baht(amount)} ไม่ผ่าน กรุณาส่งสลิปใหม่`,
      detail: approved ? `ตรวจโดย ${actor.actor_name || "เจ้าหน้าที่"}` : `เหตุผล: ${reason}`, actor,
    }),
    notifyStaffSide({
      type: approved ? "slip_approved" : "slip_rejected", tone: approved ? "success" : "danger", target: "slips",
      refTable: "Payment", refId: paymentId, title: `สลิป${typeLabel}${room}`,
      message: `${approved ? "อนุมัติ" : "ปฏิเสธ"}สลิป ${baht(amount)}${byActor(actor)}`, actor,
    }),
  ], db);
});

export const paymentCollected = ({ customerId, roomNumber, amount }, actor) => safely("paymentCollected", async (db) => {
  await notify([
    notifyCustomer(customerId, {
      type: "payment_collected", tone: "success", target: "history", title: "บันทึกรับชำระเงินแล้ว",
      message: `เจ้าหน้าที่บันทึกรับชำระ ${baht(amount)}`, detail: `บันทึกโดย ${actor.actor_name || "เจ้าหน้าที่"}`, actor,
    }),
    notifyStaffSide({
      type: "payment_collected", tone: "success", target: "rooms", refTable: "Room", refId: roomNumber,
      title: `รับชำระเงิน ห้อง ${roomNumber}`, message: `${baht(amount)}${byActor(actor)}`, actor,
    }),
  ], db);
});

export const visitReviewed = (requestId, actor, status) => safely("visitReviewed", async (db) => {
  const [[request]] = await db.query(
    "SELECT customer_id, room_number, request_type, vehicle_plate, guest_name FROM ResidentVisitRequest WHERE id = ?",
    [requestId],
  );
  if (!request) return;
  const approved = status === "approved";
  const label = VISIT_TYPE_LABEL[request.request_type] || "คำขอ";
  const subject = request.request_type === "vehicle" ? request.vehicle_plate : request.guest_name;
  await notify([
    notifyCustomer(request.customer_id, {
      type: `visit_${status}`, tone: approved ? "success" : "danger", target: "visits", refTable: "ResidentVisitRequest", refId: requestId,
      title: `${label}${approved ? "ได้รับอนุมัติ" : "ถูกปฏิเสธ"}`, message: subject ? `${subject}` : label,
      detail: `ตรวจโดย ${actor.actor_name || "เจ้าหน้าที่"}`, actor,
    }),
    notifyStaffSide({
      type: `visit_${status}`, tone: approved ? "success" : "danger", target: "visits", refTable: "ResidentVisitRequest", refId: requestId,
      title: `${label}${request.room_number ? ` ห้อง ${request.room_number}` : ""}`,
      message: `${approved ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"}${byActor(actor)}`, detail: subject, actor,
    }),
  ], db);
});

export const fineIssued = (requestId, amount) => safely("fineIssued", async (db) => {
  const [[request]] = await db.query("SELECT customer_id, vehicle_plate, fine_hours FROM ResidentVisitRequest WHERE id = ?", [requestId]);
  if (!request?.customer_id || !(amount > 0)) return;
  await notify(notifyCustomer(request.customer_id, {
    type: "fine_issued", tone: "danger", target: "visits", refTable: "ResidentVisitRequest", refId: requestId,
    title: "มีค่าปรับที่จอดรถ", message: `${request.vehicle_plate || "รถ"} จอดเกินเวลา ${request.fine_hours} ชม. ค่าปรับ ${baht(amount)}`,
    detail: "ชำระค่าปรับได้ที่เมนูคำขอรถ",
  }), db);
});

export const fineReviewed = (requestId, actor, approved) => safely("fineReviewed", async (db) => {
  const [[request]] = await db.query(
    "SELECT customer_id, room_number, vehicle_plate, fine_amount FROM ResidentVisitRequest WHERE id = ?",
    [requestId],
  );
  if (!request) return;
  await notify([
    notifyCustomer(request.customer_id, {
      type: approved ? "fine_paid" : "fine_slip_rejected", tone: approved ? "success" : "danger", target: "visits",
      refTable: "ResidentVisitRequest", refId: requestId,
      title: approved ? "ชำระค่าปรับเรียบร้อย" : "สลิปค่าปรับไม่ผ่าน",
      message: approved ? `ค่าปรับ ${baht(request.fine_amount)} (${request.vehicle_plate || "-"})` : "กรุณาชำระค่าปรับใหม่อีกครั้ง",
      detail: `ตรวจโดย ${actor.actor_name || "เจ้าหน้าที่"}`, actor,
    }),
    notifyStaffSide({
      type: approved ? "fine_paid" : "fine_slip_rejected", tone: approved ? "success" : "danger", target: "visits",
      refTable: "ResidentVisitRequest", refId: requestId,
      title: `ค่าปรับที่จอดรถ${request.room_number ? ` ห้อง ${request.room_number}` : ""}`,
      message: `${approved ? "ยืนยันชำระค่าปรับ" : "ปฏิเสธสลิปค่าปรับ"} ${baht(request.fine_amount)}${byActor(actor)}`,
      detail: request.vehicle_plate, actor,
    }),
  ], db);
});

// Tenants living in the room a staff-side report is about; a tenant's own report has no extra audience.
async function incidentRoomTenants(db, incident) {
  if (incident.reporter_role === "Customer" || !incident.room_number) return [];
  const [rows] = await db.query("SELECT id FROM Customer WHERE room_number = ? AND is_suspended = FALSE", [incident.room_number]);
  return rows.map((row) => row.id);
}

export const safetyReported = (incidentId, actor) => safely("safetyReported", async (db) => {
  const [[incident]] = await db.query(
    "SELECT reporter_role, room_number, incident_type, severity, description FROM SafetyIncident WHERE id = ?",
    [incidentId],
  );
  if (!incident) return;
  const urgent = incident.severity === "urgent";
  const tenants = await incidentRoomTenants(db, incident);
  await notify(tenants.map((customerId) => notifyCustomer(customerId, {
    type: "safety_reported", tone: urgent ? "danger" : "pending", target: "safety", refTable: "SafetyIncident", refId: incidentId,
    title: `แจ้งเหตุ ${incident.incident_type} ห้อง ${incident.room_number}`,
    message: urgent ? `เหตุด่วน: เจ้าหน้าที่แจ้งเหตุถึงห้องของคุณ${byActor(actor)}` : `เจ้าหน้าที่แจ้งเหตุถึงห้องของคุณ${byActor(actor)}`,
    detail: incident.description, actor,
  })), db);
});

export const safetyHandled = (incidentId, actor, outcome, note) => safely("safetyHandled", async (db) => {
  const [[incident]] = await db.query(
    "SELECT reporter_role, reporter_id, room_number, incident_type FROM SafetyIncident WHERE id = ?",
    [incidentId],
  );
  if (!incident) return;
  const reviewed = outcome === "reviewed";
  const tenants = await incidentRoomTenants(db, incident);
  await notify([
    incident.reporter_role === "Customer" && notifyCustomer(incident.reporter_id, {
      type: `safety_${outcome}`, tone: reviewed ? "success" : "info", target: "safety", refTable: "SafetyIncident", refId: incidentId,
      title: `แจ้งเหตุ ${incident.incident_type}`,
      message: reviewed ? "เจ้าหน้าที่รับเรื่องและตรวจสอบแล้ว" : "รายงานเหตุถูกยกเลิก", detail: note || null, actor,
    }),
    ...tenants.map((customerId) => notifyCustomer(customerId, {
      type: `safety_${outcome}`, tone: reviewed ? "success" : "info", target: "safety", refTable: "SafetyIncident", refId: incidentId,
      title: `แจ้งเหตุ ${incident.incident_type} ห้อง ${incident.room_number}`,
      message: `${reviewed ? "รับเรื่องแล้ว" : "ยกเลิกรายงานเหตุแล้ว"}${byActor(actor)}`, detail: note || null, actor,
    })),
    notifyStaffSide({
      type: `safety_${outcome}`, tone: reviewed ? "success" : "info", target: "safety", refTable: "SafetyIncident", refId: incidentId,
      title: `แจ้งเหตุ ${incident.incident_type}${incident.room_number ? ` ห้อง ${incident.room_number}` : ""}`,
      message: `${reviewed ? "รับเรื่องแล้ว" : "ยกเลิกรายงานแล้ว"}${byActor(actor)}`, detail: note || null, actor,
    }),
  ], db);
});

export const moveOutInspectionSaved = (inspectionId, actor) => safely("moveOutInspectionSaved", async (db) => {
  const [[inspection]] = await db.query(
    `SELECT moi.room_number, moi.status, moi.damage_cost, moi.damage_note, tr.customer_id, tr.type
     FROM MoveOutInspection moi LEFT JOIN TenantRequest tr ON tr.id = moi.tenant_request_id WHERE moi.id = ?`,
    [inspectionId],
  );
  if (!inspection) return;
  const damage = Number(inspection.damage_cost || 0);
  const reviewed = inspection.status === "reviewed";
  await notify([
    reviewed && notifyCustomer(inspection.customer_id, {
      type: "move_out_inspection", tone: damage > 0 ? "pending" : "success", target: "inspection",
      refTable: "MoveOutInspection", refId: inspectionId, title: "ผลตรวจสภาพห้อง",
      message: damage > 0 ? `พบความเสียหาย ค่าซ่อม ${baht(damage)} (หักจากเงินมัดจำ)` : "ตรวจห้องแล้ว ไม่พบความเสียหาย",
      detail: inspection.damage_note || null, actor,
    }),
    notifyStaffSide({
      type: "move_out_inspection", tone: "info", target: inspection.type ? `requests:${inspection.type}` : "inspections",
      refTable: "MoveOutInspection", refId: inspectionId, title: `ผลตรวจห้อง ${inspection.room_number}`,
      message: `${reviewed ? "บันทึก/ยืนยันผลตรวจแล้ว" : "ส่งผลตรวจรอยืนยัน"}${byActor(actor)}`,
      detail: damage > 0 ? `ค่าเสียหาย ${baht(damage)}` : null, actor,
    }),
  ], db);
});

export const moveInInspectionSaved = (inspectionId, actor) => safely("moveInInspectionSaved", async (db) => {
  const [[inspection]] = await db.query("SELECT room_number, customer_id FROM MoveInInspection WHERE id = ?", [inspectionId]);
  if (!inspection) return;
  await notify([
    notifyCustomer(inspection.customer_id, {
      type: "move_in_inspection", tone: "info", target: "inspection", refTable: "MoveInInspection", refId: inspectionId,
      title: "ตรวจสภาพห้องก่อนเข้าอยู่แล้ว", message: `ห้อง ${inspection.room_number} กดดูรายงานสภาพห้องได้ที่หน้าสัญญา`, actor,
    }),
    notifyStaffSide({
      type: "move_in_inspection", tone: "info", target: "move-in", refTable: "MoveInInspection", refId: inspectionId,
      title: `ตรวจห้องก่อนเข้าอยู่ ห้อง ${inspection.room_number}`, message: `บันทึกผลแล้ว${byActor(actor)}`, actor,
    }),
  ], db);
});

export const depositSettled = ({ bookingId, customerId, roomNumber, action, refund, deduction }, actor) => safely("depositSettled", async (db) => {
  const refunded = action === "refund";
  await notify([
    notifyCustomer(customerId, {
      type: "deposit_settled", tone: refunded ? "success" : "info", target: "contract", refTable: "Booking", refId: bookingId,
      title: refunded ? "คืนเงินมัดจำแล้ว" : "เงินมัดจำถูกริบตามเงื่อนไขสัญญา",
      message: refunded ? `คืน ${baht(refund)}${deduction > 0 ? ` (หักค่าเสียหาย ${baht(deduction)})` : ""}` : "ย้ายออกก่อนครบสัญญา", actor,
    }),
    notifyStaffSide({
      type: "deposit_settled", tone: "success", target: "contracts", refTable: "Booking", refId: bookingId,
      title: `เงินมัดจำ${roomNumber ? ` ห้อง ${roomNumber}` : ""}`,
      message: `${refunded ? `คืน ${baht(refund)}` : "ริบเงินมัดจำ"}${byActor(actor)}`, actor,
    }),
  ], db);
});

export const transferContractAttached = (transferId, actor) => safely("transferContractAttached", async (db) => {
  const [[transfer]] = await db.query("SELECT customer_id, from_room_number, to_room_number FROM RoomTransfer WHERE id = ?", [transferId]);
  if (!transfer) return;
  await notify([
    notifyCustomer(transfer.customer_id, {
      type: "transfer_contract", tone: "success", target: "contract", refTable: "RoomTransfer", refId: transferId,
      title: "แนบสัญญาห้องใหม่แล้ว", message: `สัญญาห้อง ${transfer.to_room_number} พร้อมให้ดูที่หน้าสัญญา`, actor,
    }),
    notifyStaffSide({
      type: "transfer_contract", tone: "success", target: "transfer-contracts", refTable: "RoomTransfer", refId: transferId,
      title: `สัญญาย้ายห้อง ${transfer.from_room_number} → ${transfer.to_room_number}`, message: `แนบรูปสัญญาแล้ว${byActor(actor)}`, actor,
    }),
  ], db);
});

export const tenantRegistered = (customerId, roomNumber, user) => safely("tenantRegistered", async (db) => {
  const actor = actorOf(user, await accountName(db, user?.role, user?.id));
  const [[customer]] = await db.query("SELECT first_name, last_name FROM Customer WHERE id = ?", [customerId]);
  await notify([
    notifyCustomer(customerId, {
      type: "contract_created", tone: "success", target: "contract", refTable: "Customer", refId: customerId,
      title: "ยินดีต้อนรับเข้าสู่หอพัก", message: `ห้อง ${roomNumber} · เจ้าหน้าที่แนบรูปสัญญาเช่าแล้ว ดูได้ที่หน้าสัญญา`, actor,
    }),
    notifyStaffSide({
      type: "tenant_registered", tone: "info", target: "rooms", refTable: "Customer", refId: customerId,
      title: `ผู้เช่าใหม่ ห้อง ${roomNumber}`, message: `${fullName(customer)} ลงทะเบียนแล้ว${byActor(actor)}`, actor,
    }),
  ], db);
});

export const waitingListAdded = (entry, actor) => notify(notifyStaffSide({
  type: "waiting_list_added", tone: "info", target: "waiting-list", refTable: "WaitingList", refId: entry.id,
  title: "มีรายชื่อรอห้องว่างใหม่", message: `${entry.fullName}${entry.roomPreference ? ` · ต้องการ ${entry.roomPreference}` : ""}`,
  detail: `เพิ่ม${byActor(actor)}`, actor,
}));

const STAFF_ACCOUNT_ACTION = { created: "เพิ่มบัญชีใหม่", updated: "แก้ไขข้อมูล", suspended: "ระงับบัญชี", unsuspended: "ยกเลิกการระงับบัญชี", deleted: "ลบบัญชี" };

const ACCOUNT_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };

async function accountName(db, role, id) {
  if (!ACCOUNT_TABLE[role] || !id) return null;
  const [[row]] = await db.query(`SELECT first_name, last_name FROM ${ACCOUNT_TABLE[role]} WHERE id = ?`, [id]);
  return row ? fullName(row) : null;
}

// Call before a delete so the account name can still be read.
export const staffAccountChanged = ({ role, id }, action, user) => safely("staffAccountChanged", async (db) => {
  const actor = actorOf(user, await accountName(db, user?.role, user?.id));
  const name = await accountName(db, role, id);
  if (!name) return;
  await notify(notifyStaffSide({
    type: `staff_${action}`, tone: action === "deleted" || action === "suspended" ? "danger" : "info", target: "staff",
    refTable: role, refId: id, title: `บัญชีพนักงาน ${name}`,
    message: `${STAFF_ACCOUNT_ACTION[action] || action} (${role})${byActor(actor)}`, actor,
  }, ["Admin", "Owner"]), db);
});

export const expenseRecorded = (expense, user) => safely("expenseRecorded", async (db) => {
  if (user?.role === "Owner") return;
  const actor = actorOf(user, await accountName(db, user?.role, user?.id));
  await notify(notifyStaffSide({
    type: "expense_recorded", tone: "info", target: "expenses", refTable: "Expense", refId: expense.id,
    title: "บันทึกรายจ่ายใหม่", message: `${expense.description || expense.category} ${baht(expense.amount)}`,
    detail: `บันทึก${byActor(actor)}`, actor,
  }, ["Owner"]), db);
});


// Staff-side changes to a room reach every active tenant living in it.
async function notifyRoomTenants(db, roomNumbers, build) {
  const rooms = [...new Set(roomNumbers.map(Number).filter((room) => Number.isSafeInteger(room) && room > 0))];
  if (rooms.length === 0) return;
  const [tenants] = await db.query(
    "SELECT id, room_number FROM Customer WHERE room_number IN (?) AND is_suspended = FALSE",
    [rooms],
  );
  await notify(tenants.map((tenant) => notifyCustomer(tenant.id, build(tenant.room_number))), db);
}

export const wifiChanged = (roomNumber, user, message, detail = null) => safely("wifiChanged", async (db) => {
  const actor = actorOf(user, await accountName(db, user?.role, user?.id));
  await notifyRoomTenants(db, [roomNumber], (room) => ({
    type: "wifi_changed", tone: "info", target: "wifi", refTable: "Room", refId: room,
    title: `Wi-Fi ห้อง ${room}`, message: `${message}${byActor(actor)}`, detail, actor,
  }));
});

export const roomDetailsChanged = (roomNumbers, user, message, detail = null) => safely("roomDetailsChanged", async (db) => {
  const actor = actorOf(user, await accountName(db, user?.role, user?.id));
  await notifyRoomTenants(db, roomNumbers, (room) => ({
    type: "room_updated", tone: "info", target: "room", refTable: "Room", refId: room,
    title: `ข้อมูลห้อง ${room} มีการแก้ไข`, message: `${message}${byActor(actor)}`, detail, actor,
  }));
});

export const announcementEdited = (announcementId, title, user) => safely("announcementEdited", async (db) => {
  const actor = actorOf(user, await accountName(db, user?.role, user?.id));
  const [customers] = await db.query("SELECT id FROM Customer WHERE room_number IS NOT NULL AND is_suspended = FALSE");
  await notify(customers.map((customer) => notifyCustomer(customer.id, {
    type: "announcement_edited", tone: "info", target: "announcements", refTable: "Announcement", refId: announcementId,
    title: `ประกาศมีการแก้ไข: ${title}`, message: `แก้ไขประกาศ${byActor(actor)}`, actor,
  })), db);
});

// Customers acknowledge the rules once; when the rules text changes they must read it again.
export const dormRulesChanged = (user) => safely("dormRulesChanged", async (db) => {
  const actor = actorOf(user, await accountName(db, user?.role, user?.id));
  const [customers] = await db.query("SELECT id FROM Customer WHERE room_number IS NOT NULL AND is_suspended = FALSE");
  await db.query("UPDATE Customer SET dorm_info_acknowledged_at = NULL WHERE room_number IS NOT NULL AND is_suspended = FALSE");
  const stamp = Date.now();
  await notify(customers.map((customer) => notifyCustomer(customer.id, {
    type: "dorm_rules_changed", tone: "pending", target: "dorm-info", title: "กฎหอพักมีการแก้ไข",
    message: "กรุณาอ่านกฎระเบียบและเงื่อนไขสัญญาฉบับใหม่ แล้วกดรับทราบอีกครั้ง", actor,
    dedupeKey: `dorm-rules-${stamp}-${customer.id}`,
  })), db);
});
