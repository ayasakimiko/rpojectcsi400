import { Router } from "express";
import { getPool } from "../Database/connection.js";

const FEED_DAYS = 30;
const FEED_LIMIT = 100;
const MAX_READ_IDS = 500;

// Rows a user may see: a Customer only their own; staff-side roles every broadcast for
// their role except the ones they caused themselves.
function visibility(user) {
  if (user.role === "Customer") {
    return { sql: "FIND_IN_SET('Customer', n.audience) AND n.recipient_id = ?", params: [user.id] };
  }
  return {
    sql: "FIND_IN_SET(?, n.audience) AND n.recipient_id IS NULL AND NOT (n.actor_role <=> ? AND n.actor_id <=> ?)",
    params: [user.role, user.role, user.id],
  };
}

function parseKinds(value, allowed) {
  if (typeof value !== "string" || !value) return [];
  const known = new Set(allowed);
  return value.split(",").map((kind) => kind.trim()).filter((kind) => known.has(kind));
}

/**
 * GET  /            → { notifications, pending }
 *                     ?pending=slip,visit,... picks which state-derived items to include.
 * POST /read        → { ids: [...] } or { all: true }
 */
export function createNotificationRoutes({ loadPending = null, pendingKinds = [] } = {}) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const pool = getPool();
      const { sql, params } = visibility(req.user);
      const [rows] = await pool.query(
        `SELECT n.id, n.type, n.tone, n.ref_table, n.ref_id, n.target, n.title, n.message, n.detail,
                n.actor_role, n.actor_name, n.created_at, (nr.notification_id IS NOT NULL) AS is_read
         FROM Notification n
         LEFT JOIN NotificationRead nr ON nr.notification_id = n.id AND nr.user_role = ? AND nr.user_id = ?
         WHERE ${sql} AND n.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY n.id DESC LIMIT ?`,
        [req.user.role, req.user.id, ...params, FEED_DAYS, FEED_LIMIT],
      );
      const kinds = loadPending ? parseKinds(req.query.pending, pendingKinds) : [];
      const pending = kinds.length ? await loadPending(pool, kinds) : [];
      return res.json({
        notifications: rows.map((row) => ({ ...row, is_read: Boolean(row.is_read) })),
        pending,
      });
    } catch (error) {
      console.error("Fetch notifications error:", error);
      return res.status(500).json({ message: "ไม่สามารถโหลดการแจ้งเตือนได้" });
    }
  });

  router.post("/read", async (req, res) => {
    try {
      const pool = getPool();
      const { sql, params } = visibility(req.user);
      if (req.body?.all === true) {
        await pool.query(
          `INSERT IGNORE INTO NotificationRead (notification_id, user_role, user_id)
           SELECT n.id, ?, ? FROM Notification n
           WHERE ${sql} AND n.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [req.user.role, req.user.id, ...params, FEED_DAYS],
        );
        return res.json({ message: "อ่านทั้งหมดแล้ว" });
      }
      const ids = Array.isArray(req.body?.ids)
        ? [...new Set(req.body.ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, MAX_READ_IDS)
        : [];
      if (ids.length === 0) return res.status(400).json({ message: "ไม่พบรายการแจ้งเตือน" });
      await pool.query(
        `INSERT IGNORE INTO NotificationRead (notification_id, user_role, user_id)
         SELECT n.id, ?, ? FROM Notification n WHERE n.id IN (?) AND ${sql}`,
        [req.user.role, req.user.id, ids, ...params],
      );
      return res.json({ message: "อ่านแล้ว" });
    } catch (error) {
      console.error("Mark notifications read error:", error);
      return res.status(500).json({ message: "ไม่สามารถบันทึกสถานะการอ่านได้" });
    }
  });

  return router;
}
