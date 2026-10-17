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

export async function requireActiveCustomer(req, res, next) {
  try {
    const [rows] = await getPool().query("SELECT is_suspended FROM Customer WHERE id = ?", [req.user.id]);
    if (!rows[0] || rows[0].is_suspended) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้" });
    }
    return next();
  } catch (error) {
    console.error("Check customer suspension error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
}
