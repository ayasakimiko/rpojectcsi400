import { getPool } from "../Database/connection.js";
import { createRequireActiveAccount } from "./authMiddleware.js";

const STAFF_ROLE_TABLE = { Staff: "Staff", Admin: "Admin", Owner: "Owner" };
const ADMIN_ROLE_TABLE = { Admin: "Admin", Owner: "Owner" };

async function getActingName(tables, pool, user) {
  const table = tables[user?.role];
  if (!table) return null;
  const [rows] = await pool.query(`SELECT first_name, last_name FROM ${table} WHERE id = ?`, [user.id]);
  const row = rows[0];
  return row ? `${row.first_name} ${row.last_name}` : null;
}

export function getActingStaffName(pool, user) {
  return getActingName(STAFF_ROLE_TABLE, pool, user);
}

export function getActingAdminName(pool, user) {
  return getActingName(ADMIN_ROLE_TABLE, pool, user);
}

export const requireActiveStaff = createRequireActiveAccount(getPool);

const FORMER_TENANT_WRITE_PATHS = [/^\/profile$/, /^\/dorm-info\/acknowledge$/, /^\/announcements\/\d+\/acknowledge$/];

export async function requireActiveCustomer(req, res, next) {
  try {
    const [rows] = await getPool().query("SELECT is_suspended, room_number FROM Customer WHERE id = ?", [req.user.id]);
    if (!rows[0] || rows[0].is_suspended) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้" });
    }
    if (
      rows[0].room_number == null
      && !["GET", "HEAD"].includes(req.method)
      && !FORMER_TENANT_WRITE_PATHS.some((pattern) => pattern.test(req.path))
    ) {
      return res.status(403).json({ code: "CUSTOMER_MOVED_OUT", message: "คุณย้ายออกจากหอพักแล้ว บัญชีนี้ใช้ดูประวัติได้อย่างเดียว" });
    }
    return next();
  } catch (error) {
    console.error("Check customer suspension error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
}
