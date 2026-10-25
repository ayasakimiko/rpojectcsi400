import { getPool } from "../Database/connection.js";

export const STAFF_SIDE = ["Staff", "Admin", "Owner"];
export const ROLE_LABEL = { Customer: "ผู้เช่า", Staff: "เจ้าหน้าที่", Admin: "แอดมิน", Owner: "เจ้าของหอ" };

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

export function actorOf(user, name) {
  if (!user?.role) return { actor_role: null, actor_id: null, actor_name: name || null };
  return { actor_role: user.role, actor_id: Number.isSafeInteger(user.id) ? user.id : null, actor_name: name || null };
}

export function byActor(actor) {
  if (!actor?.actor_name) return "";
  return ` โดย ${actor.actor_name}${actor.actor_role && ROLE_LABEL[actor.actor_role] ? ` (${ROLE_LABEL[actor.actor_role]})` : ""}`;
}

export const baht = (value) => `฿${Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Notifications are a side effect: a failed insert is logged, never surfaced to the
// request that triggered it. INSERT IGNORE + dedupe_key makes scheduled jobs idempotent.
export async function notify(items, db = getPool()) {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (list.length === 0) return;
  try {
    await db.query(
      `INSERT IGNORE INTO Notification
         (audience, recipient_id, type, tone, ref_table, ref_id, target, title, message, detail,
          actor_role, actor_id, actor_name, dedupe_key)
       VALUES ?`,
      [list.map((item) => [
        (Array.isArray(item.audience) ? item.audience : [item.audience]).join(","),
        item.recipientId ?? null,
        clip(item.type, 40),
        clip(item.tone || "info", 10),
        clip(item.refTable, 40),
        item.refId ?? null,
        clip(item.target, 60),
        clip(item.title, 160),
        clip(item.message, 500),
        clip(item.detail, 1000),
        item.actor?.actor_role ?? null,
        item.actor?.actor_id ?? null,
        clip(item.actor?.actor_name, 255),
        clip(item.dedupeKey, 120),
      ])],
    );
  } catch (error) {
    console.error("Notification write error:", error);
  }
}

export function notifyCustomer(customerId, item) {
  if (!customerId) return null;
  return { ...item, audience: "Customer", recipientId: customerId };
}

export function notifyStaffSide(item, audience = STAFF_SIDE) {
  return { ...item, audience };
}
