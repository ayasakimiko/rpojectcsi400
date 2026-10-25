import { baht } from "../middleware/notifications.js";
import { buildRoomTransferPlan, listPendingTransferContracts, loadCompletedContracts } from "./rentalContracts.js";
import { loadRoomsWithDue } from "./roomDue.js";

// Work that is still waiting for Staff/Admin/Owner, derived from current state. Unlike the
// Notification table these items vanish as soon as somebody handles them.

const TENANT_TYPE_LABEL = { renew: "ต่อสัญญา", moveout: "ย้ายออก", move_room: "ย้ายห้อง" };
const VISIT_TYPE_LABEL = { vehicle: "คำขอรถ", overnight_guest: "คำขอผู้มาพัก" };
const PARCEL_STALE_DAYS = 7;
const MOVE_IN_LOOKBACK_DAYS = 30;
const CACHE_MS = 15000;

const fullName = (row) => `${row.first_name || ""} ${row.last_name || ""}`.trim();
const roomLabel = (room) => (room ? ` ห้อง ${room}` : "");

const SOURCES = {
  async slip(db) {
    const [rows] = await db.query(
      `SELECT MIN(p.id) AS id, p.booking_id, p.slip_path, SUM(p.amount) AS amount, MAX(p.created_at) AS created_at,
              c.first_name, c.last_name, r.room_number
       FROM Payment p
       JOIN Booking b ON b.id = p.booking_id
       JOIN Customer c ON c.id = b.customer_id
       JOIN Room r ON r.id = b.room_id
       WHERE p.status = 'pending' AND p.slip_path IS NOT NULL
       GROUP BY p.booking_id, p.slip_path, c.first_name, c.last_name, r.room_number`,
    );
    return rows.map((row) => ({
      key: `slip-${row.booking_id}-${row.slip_path}`, kind: "slip", tone: "info", target: "slips", ref_id: row.id,
      title: `สลิปโอนเงิน${roomLabel(row.room_number)}`, message: "สลิปรอตรวจสอบ",
      detail: `${fullName(row)} · ${baht(row.amount)}`, created_at: row.created_at,
    }));
  },

  async visit(db) {
    const [rows] = await db.query(
      `SELECT id, room_number, request_type, vehicle_plate, guest_name, created_at
       FROM ResidentVisitRequest WHERE status = 'pending'`,
    );
    return rows.map((row) => ({
      key: `visit-${row.id}`, kind: "visit", tone: "pending", target: "visits", ref_id: row.id,
      title: `${VISIT_TYPE_LABEL[row.request_type] || "คำขอ"}${roomLabel(row.room_number)}`, message: "รออนุมัติ",
      detail: row.request_type === "vehicle" ? row.vehicle_plate : row.guest_name, created_at: row.created_at,
    }));
  },

  async safety(db) {
    const [rows] = await db.query(
      `SELECT id, room_number, incident_type, severity, description, created_at FROM SafetyIncident WHERE status = 'pending'`,
    );
    return rows.map((row) => ({
      key: `safety-${row.id}`, kind: "safety", tone: row.severity === "urgent" ? "danger" : "pending", target: "safety",
      ref_id: row.id, title: `แจ้งเหตุ ${row.incident_type}${roomLabel(row.room_number)}`,
      message: row.severity === "urgent" ? "เหตุด่วน รอรับเรื่อง" : "มีการแจ้งเหตุ รอรับเรื่อง",
      detail: row.description, created_at: row.created_at,
    }));
  },

  async tenant(db) {
    const [rows] = await db.query(
      `SELECT tr.id, tr.type, tr.status, tr.room_number, tr.target_room_number, tr.created_at, tr.accepted_at, tr.accepted_by_name,
              c.first_name, c.last_name
       FROM TenantRequest tr JOIN Customer c ON c.id = tr.customer_id AND c.room_number = tr.room_number
       WHERE tr.status IN ('pending', 'in_progress')`,
    );
    return rows.map((row) => ({
      key: `tenant-${row.id}-${row.status}`, kind: "tenant", tone: row.status === "pending" ? "pending" : "info",
      target: `requests:${row.type}`, ref_id: row.id,
      title: `คำขอ${TENANT_TYPE_LABEL[row.type] || row.type}${roomLabel(row.room_number)}`,
      message: row.status === "pending" ? "คำขอใหม่ รอดำเนินการ" : `รับเรื่องแล้ว${row.accepted_by_name ? ` โดย ${row.accepted_by_name}` : ""}`,
      detail: [fullName(row), row.type === "move_room" && row.target_room_number ? `ไปห้อง ${row.target_room_number}` : null].filter(Boolean).join(" · "),
      created_at: row.status === "pending" ? row.created_at : row.accepted_at || row.created_at,
    }));
  },

  async maintenance(db) {
    const [rows] = await db.query(
      `SELECT mr.id, mr.status, mr.room_number, mr.description, mr.created_at, mr.accepted_at, mr.accepted_by_name
       FROM MaintenanceRequest mr WHERE mr.status IN ('pending', 'in_progress')`,
    );
    return rows.map((row) => ({
      key: `maintenance-${row.id}-${row.status}`, kind: "maintenance", tone: row.status === "pending" ? "pending" : "info",
      target: "maintenance", ref_id: row.id, title: `แจ้งซ่อม${roomLabel(row.room_number)}`,
      message: row.status === "pending" ? "แจ้งซ่อมใหม่ รอรับงาน" : `กำลังซ่อม${row.accepted_by_name ? ` โดย ${row.accepted_by_name}` : ""}`,
      detail: row.description, created_at: row.status === "pending" ? row.created_at : row.accepted_at || row.created_at,
    }));
  },

  async fine_review(db) {
    const [rows] = await db.query(
      `SELECT id, room_number, vehicle_plate, fine_amount, COALESCE(updated_at, checked_out_at, created_at) AS created_at
       FROM ResidentVisitRequest WHERE fine_status = 'pending_review'`,
    );
    return rows.map((row) => ({
      key: `fine-review-${row.id}`, kind: "slip", tone: "info", target: "visits", ref_id: row.id,
      title: `สลิปค่าปรับที่จอดรถ${roomLabel(row.room_number)}`, message: "สลิปค่าปรับรอตรวจสอบ",
      detail: `${row.vehicle_plate || "-"} · ${baht(row.fine_amount)}`, created_at: row.created_at,
    }));
  },

  async fine_unpaid(db) {
    const [rows] = await db.query(
      `SELECT id, room_number, vehicle_plate, fine_amount, COALESCE(checked_out_at, created_at) AS created_at
       FROM ResidentVisitRequest WHERE fine_status = 'unpaid' AND fine_amount > 0`,
    );
    return rows.map((row) => ({
      key: `fine-unpaid-${row.id}`, kind: "visit", tone: "pending", target: "visits", ref_id: row.id,
      title: `ค่าปรับที่จอดรถยังไม่ชำระ${roomLabel(row.room_number)}`, message: `ค้าง ${baht(row.fine_amount)}`,
      detail: row.vehicle_plate, created_at: row.created_at,
    }));
  },

  async deposit(db) {
    const contracts = await loadCompletedContracts(db);
    return contracts
      .filter((contract) => contract.is_archived && !contract.deposit_settlement && contract.deposit_remaining > 0)
      .map((contract) => ({
        key: `deposit-${contract.booking_id}`, kind: "money", tone: "pending", target: "contracts", ref_id: contract.booking_id,
        title: `${contract.deposit_refund === "forfeit" ? "ริบ" : "คืน"}เงินมัดจำ${roomLabel(contract.room_number)}`,
        message: `รอบันทึกการ${contract.deposit_refund === "forfeit" ? "ริบ" : "คืน"}เงินมัดจำ ${baht(contract.deposit_remaining)}`,
        detail: fullName(contract), created_at: contract.moved_out_at || contract.ended_at || contract.rental_end_date,
      }));
  },

  async transfer_contract(db) {
    const rows = await listPendingTransferContracts(db);
    return rows.map((row) => ({
      key: `transfer-contract-${row.id}`, kind: "contract", tone: "pending", target: "transfer-contracts", ref_id: row.id,
      title: `สัญญาย้ายห้อง ${row.from_room_number} → ${row.to_room_number}`, message: "ย้ายห้องแล้ว รอแนบรูปสัญญาใหม่",
      detail: fullName(row), created_at: row.transferred_at,
    }));
  },

  async transfer_charge(db) {
    const [rows] = await db.query(
      `SELECT tr.id FROM TenantRequest tr
       WHERE tr.type = 'move_room' AND tr.status IN ('pending', 'in_progress') AND tr.transfer_charge_payment_id IS NULL
         AND EXISTS (SELECT 1 FROM MoveOutInspection moi WHERE moi.tenant_request_id = tr.id AND moi.status = 'reviewed' AND moi.hidden_at IS NULL)`,
    );
    const items = [];
    for (const row of rows) {
      const plan = await buildRoomTransferPlan(db, row.id);
      if (!plan?.customer || plan.stale || !plan.transferCharge.required || plan.transferCharge.status !== "not_sent") continue;
      items.push({
        key: `transfer-charge-${row.id}`, kind: "money", tone: "pending", target: "requests:move_room", ref_id: row.id,
        title: `ย้ายห้อง ${plan.sourceRoom.room_number} → ${plan.targetRoom.room_number}`,
        message: `ต้องส่งยอดเก็บเพิ่ม ${baht(plan.settlement.additionalChargeCents / 100)} ให้ผู้เช่าก่อนทำสัญญา`,
        detail: fullName(plan.customer), created_at: plan.request.accepted_at || plan.request.created_at,
      });
    }
    return items;
  },

  async move_in(db) {
    const [rows] = await db.query(
      `SELECT r.room_number, r.rental_start_date, c.id AS customer_id, c.first_name, c.last_name
       FROM Room r
       JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
       WHERE r.is_booked = TRUE AND r.rental_start_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND NOT EXISTS (SELECT 1 FROM MoveInInspection mi WHERE mi.customer_id = c.id AND mi.room_number = r.room_number)`,
      [MOVE_IN_LOOKBACK_DAYS],
    );
    return rows.map((row) => ({
      key: `move-in-${row.customer_id}-${row.room_number}`, kind: "inspection", tone: "pending", target: "move-in",
      ref_id: row.room_number, title: `ตรวจสภาพห้องก่อนเข้าอยู่${roomLabel(row.room_number)}`, message: "ยังไม่ได้ตรวจสภาพห้องก่อนเข้าอยู่",
      detail: fullName(row), created_at: row.rental_start_date,
    }));
  },

  async contract_expiry(db) {
    const [[config]] = await db.query("SELECT contract_warning_days FROM DormConfig WHERE id = 1");
    const warningDays = Number(config?.contract_warning_days ?? 10);
    const [rows] = await db.query(
      `SELECT r.room_number, r.rental_end_date, DATEDIFF(DATE(r.rental_end_date), CURDATE()) AS days_left,
              c.id AS customer_id, c.first_name, c.last_name,
              EXISTS (SELECT 1 FROM TenantRequest tr WHERE tr.customer_id = c.id AND tr.type IN ('renew', 'moveout')
                        AND tr.status IN ('pending', 'in_progress')) AS has_request
       FROM Room r
       JOIN Customer c ON c.room_number = r.room_number AND c.is_suspended = FALSE
       WHERE r.is_booked = TRUE AND r.rental_end_date IS NOT NULL AND r.rental_start_date <= NOW()
         AND DATEDIFF(DATE(r.rental_end_date), CURDATE()) <= ?`,
      [warningDays],
    );
    return rows.filter((row) => !row.has_request).map((row) => {
      const expired = Number(row.days_left) < 0;
      return {
        key: `contract-${expired ? "expired" : "expiring"}-${row.customer_id}-${row.room_number}-${new Date(row.rental_end_date).toISOString().slice(0, 10)}`,
        kind: "contract", tone: expired ? "danger" : "pending", target: "rooms", ref_id: row.room_number,
        title: `${expired ? "สัญญาหมดแล้ว" : "สัญญาใกล้หมด"}${roomLabel(row.room_number)}`,
        message: expired
          ? `หมดสัญญามาแล้ว ${Math.abs(Number(row.days_left))} วัน ผู้เช่ายังไม่ต่อสัญญาหรือแจ้งย้ายออก`
          : Number(row.days_left) === 0 ? "สัญญาหมดวันนี้" : `เหลืออีก ${row.days_left} วัน`,
        detail: fullName(row), created_at: row.rental_end_date,
      };
    });
  },

  async rent_overdue(db) {
    const rooms = await loadRoomsWithDue(db);
    return rooms
      .filter((room) => room.tenant && room.currentDue?.status === "overdue")
      .map((room) => ({
        key: `rent-overdue-${room.room_number}-${room.currentDue.dueDate ? new Date(room.currentDue.dueDate).toISOString().slice(0, 10) : "now"}`,
        kind: "money", tone: "danger", target: "rooms", ref_id: room.room_number,
        title: `ค่าเช่าค้างชำระ${roomLabel(room.room_number)}`,
        message: `ค้าง ${baht(room.currentDue.amount)}${Number(room.currentDue.overdueMonths) > 0 ? ` (ค้างสะสม ${Number(room.currentDue.overdueMonths) + 1} เดือน)` : ""}`,
        detail: fullName(room.tenant), created_at: room.currentDue.dueDate,
      }));
  },

  async waiting_list(db) {
    const [[row]] = await db.query(
      `SELECT (SELECT COUNT(*) FROM WaitingList WHERE status = 'waiting') AS waiting,
              (SELECT MAX(created_at) FROM WaitingList WHERE status = 'waiting') AS latest,
              (SELECT COUNT(*) FROM Room r WHERE r.is_booked = FALSE
                 AND NOT EXISTS (SELECT 1 FROM TenantRequest tr WHERE tr.type = 'move_room' AND tr.target_room_number = r.room_number
                                   AND tr.status IN ('pending', 'in_progress'))) AS free_rooms`,
    );
    if (!(Number(row.waiting) > 0 && Number(row.free_rooms) > 0)) return [];
    return [{
      key: `waiting-match-${row.waiting}-${row.free_rooms}`, kind: "staff", tone: "info", target: "waiting-list", ref_id: null,
      title: "มีห้องว่างสำหรับคนที่รอห้อง", message: `ห้องว่าง ${row.free_rooms} ห้อง · มีคนรอ ${row.waiting} คน`,
      detail: null, created_at: row.latest,
    }];
  },

  async parcel_stale(db) {
    const [rows] = await db.query(
      `SELECT id, room_number, sender_name, tracking_number, created_at FROM Parcel
       WHERE status = 'pending' AND created_at <= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [PARCEL_STALE_DAYS],
    );
    return rows.map((row) => ({
      key: `parcel-stale-${row.id}`, kind: "parcel", tone: "pending", target: "parcels", ref_id: row.id,
      title: `พัสดุค้างรับ${roomLabel(row.room_number)}`, message: `ไม่มีผู้มารับเกิน ${PARCEL_STALE_DAYS} วัน`,
      detail: [row.sender_name, row.tracking_number].filter(Boolean).join(" · "), created_at: row.created_at,
    }));
  },
};

export const PENDING_KINDS = Object.keys(SOURCES);

let cache = { at: 0, promise: null };

async function loadAll(db) {
  const results = await Promise.all(PENDING_KINDS.map(async (kind) => {
    try {
      return (await SOURCES[kind](db)).map((item) => ({ ...item, source: kind }));
    } catch (error) {
      console.error(`Pending notifications (${kind}) error:`, error);
      return [];
    }
  }));
  return results.flat();
}

export async function loadPendingNotifications(db, kinds = PENDING_KINDS) {
  if (!cache.promise || Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), promise: loadAll(db) };
    cache.promise.catch(() => { cache = { at: 0, promise: null }; });
  }
  const wanted = new Set(kinds);
  return (await cache.promise).filter((item) => wanted.has(item.source));
}

export function clearPendingNotificationCache() {
  cache = { at: 0, promise: null };
}
