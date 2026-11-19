import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { changedFor, currentPulse, formatCursor, onPulse, parseCursor } from "./notificationPulse.js";

const FEED_DAYS = 30;
const FEED_LIMIT = 300;
const MAX_READ_IDS = 500;
const WAIT_MS = 25000;
const MAX_DISMISS_KEYS = 200;
const MAX_KEY_LENGTH = 255;
const DISMISS_LIMIT = 3000;

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

function parseDismissKeys(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((key) => typeof key === "string").map((key) => key.trim()))]
    .filter((key) => key.length > 0 && key.length <= MAX_KEY_LENGTH)
    .slice(0, MAX_DISMISS_KEYS);
}

export function createNotificationRoutes({ loadPending = null, pendingKinds = [] } = {}) {
  const router = Router();

  router.get("/wait", async (req, res) => {
    let cursor = parseCursor(req.query.cursor);
    let stop = () => {};
    let timeout = null;
    const finish = (changed, pulse) => {
      stop();
      clearTimeout(timeout);
      if (!res.headersSent) res.set("Cache-Control", "no-store").json({ cursor: formatCursor(pulse), changed });
    };
    try {
      const pulse = await currentPulse();
      if (!cursor) return finish(false, pulse);
      if (await changedFor(req.user, cursor, pulse)) return finish(true, pulse);
      cursor = pulse;
      let checking = Promise.resolve();
      stop = onPulse((next) => {
        checking = checking.then(async () => {
          if (res.headersSent) return;
          if (await changedFor(req.user, cursor, next)) return finish(true, next);
          cursor = next;
        }).catch((error) => console.error("Notification wait error:", error));
      });
      timeout = setTimeout(() => finish(false, cursor), WAIT_MS);
      res.on("close", () => {
        stop();
        clearTimeout(timeout);
      });
    } catch (error) {
      stop();
      clearTimeout(timeout);
      console.error("Notification wait error:", error);
      if (!res.headersSent) res.status(500).json({ message: "ไม่สามารถติดตามการแจ้งเตือนได้" });
    }
  });

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
      const [dismissedRows] = await pool.query(
        `SELECT item_key FROM NotificationDismiss WHERE user_role = ? AND user_id = ?
         ORDER BY dismissed_at DESC LIMIT ?`,
        [req.user.role, req.user.id, DISMISS_LIMIT],
      );
      return res.json({
        notifications: rows.map((row) => ({ ...row, is_read: Boolean(row.is_read) })),
        pending,
        dismissed: dismissedRows.map((row) => row.item_key),
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

  router.post("/dismiss", async (req, res) => {
    const keys = parseDismissKeys(req.body?.keys);
    if (keys.length === 0) return res.status(400).json({ message: "ไม่พบรายการแจ้งเตือน" });
    try {
      await getPool().query(
        `INSERT INTO NotificationDismiss (user_role, user_id, item_key) VALUES ?
         ON DUPLICATE KEY UPDATE dismissed_at = CURRENT_TIMESTAMP`,
        [keys.map((key) => [req.user.role, req.user.id, key])],
      );
      return res.json({ message: "ลบการแจ้งเตือนแล้ว", keys });
    } catch (error) {
      console.error("Dismiss notifications error:", error);
      return res.status(500).json({ message: "ไม่สามารถลบการแจ้งเตือนได้" });
    }
  });

  return router;
}
