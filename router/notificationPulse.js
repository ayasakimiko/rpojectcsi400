import { getPool } from "../Database/connection.js";
import { clearPendingNotificationCache } from "./pendingNotifications.js";

// Live updates for the bell without a message bus: every service shares one MySQL server,
// so while somebody long-polls /notifications/wait this process re-reads a cheap fingerprint
// of everything the bells show and wakes the waiters when it moves.

const CHECK_MS = 2000;

const COUNT_MAX = (table, where) => `(SELECT CONCAT(COUNT(*), '-', COALESCE(MAX(id), 0)) FROM ${table} WHERE ${where})`;
const COUNT_MAX_PENDING = (table, where, pending) =>
  `(SELECT CONCAT(COUNT(*), '-', COALESCE(MAX(id), 0), '-', COALESCE(SUM(${pending}), 0)) FROM ${table} WHERE ${where})`;

const FINGERPRINT_SQL = `SELECT
  (SELECT COALESCE(MAX(id), 0) FROM Notification) AS notification,
  CONCAT_WS('|',
    ${COUNT_MAX("Payment", "status = 'pending'")},
    ${COUNT_MAX_PENDING("TenantRequest", "status IN ('pending', 'in_progress')", "status = 'pending'")},
    ${COUNT_MAX_PENDING("MaintenanceRequest", "status IN ('pending', 'in_progress')", "status = 'pending'")},
    ${COUNT_MAX("SafetyIncident", "status = 'pending'")},
    ${COUNT_MAX_PENDING("ResidentVisitRequest", "status = 'pending' OR fine_status IN ('pending_review', 'unpaid')", "fine_status = 'pending_review'")},
    ${COUNT_MAX("WaitingList", "status = 'waiting'")},
    ${COUNT_MAX("MoveOutInspection", "TRUE")}
  ) AS work,
  ${COUNT_MAX("Announcement", "TRUE")} AS announcement,
  ${COUNT_MAX("Parcel", "status = 'pending'")} AS parcel`;

const STAFF_SIDE = new Set(["Staff", "Admin", "Owner"]);

let state = null;
let loading = null;
let timer = null;
let ticking = false;
const listeners = new Set();

async function load() {
  const [[row]] = await getPool().query(FINGERPRINT_SQL);
  return {
    notification: Number(row.notification) || 0,
    work: row.work || "",
    announcement: row.announcement || "",
    parcel: row.parcel || "",
  };
}

const sameState = (a, b) =>
  a.notification === b.notification && a.work === b.work && a.announcement === b.announcement && a.parcel === b.parcel;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const next = await load();
    const changed = !state || !sameState(state, next);
    state = next;
    if (changed) {
      clearPendingNotificationCache();
      for (const listener of listeners) listener(next);
    }
  } catch (error) {
    console.error("Notification pulse error:", error);
  } finally {
    ticking = false;
  }
}

// While the timer runs `state` is at most CHECK_MS old; otherwise read it fresh.
export function currentPulse() {
  if (state && timer) return Promise.resolve(state);
  loading ||= load()
    .then((next) => (state = next))
    .finally(() => { loading = null; });
  return loading;
}

export function onPulse(listener) {
  listeners.add(listener);
  timer ||= setInterval(tick, CHECK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// The cursor is the fingerprint a client last saw; it only carries global values, so the
// per-user check below looks at the new Notification rows themselves.
export function formatCursor(pulse) {
  return [pulse.notification, pulse.work, pulse.announcement, pulse.parcel].join("~");
}

export function parseCursor(value) {
  if (typeof value !== "string" || value.length > 1000) return null;
  const [notification, work = "", announcement = "", parcel = ""] = value.split("~");
  const id = Number(notification);
  return Number.isSafeInteger(id) && id >= 0 ? { notification: id, work, announcement, parcel } : null;
}

// Same rule as the feed's visibility() SQL, applied to rows already in memory.
export function visibleTo(user, row) {
  const audience = String(row.audience || "").split(",");
  if (user.role === "Customer") return audience.includes("Customer") && Number(row.recipient_id) === Number(user.id);
  return audience.includes(user.role) && row.recipient_id == null
    && !(row.actor_role === user.role && Number(row.actor_id) === Number(user.id));
}

export async function changedFor(user, cursor, pulse, db = getPool()) {
  if (pulse.announcement !== cursor.announcement || pulse.parcel !== cursor.parcel) return true;
  if (STAFF_SIDE.has(user.role) && pulse.work !== cursor.work) return true;
  if (pulse.notification < cursor.notification) return true;
  if (pulse.notification === cursor.notification) return false;
  const [rows] = await db.query(
    "SELECT audience, recipient_id, actor_role, actor_id FROM Notification WHERE id > ? AND id <= ?",
    [cursor.notification, pulse.notification],
  );
  return rows.some((row) => visibleTo(user, row));
}
