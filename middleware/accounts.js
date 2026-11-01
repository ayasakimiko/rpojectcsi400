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

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function requireActiveCustomer(req, res, next) {
  try {
    const expiry = await import("../router/contractExpiry.js");
    const access = await expiry.loadCustomerAccess(getPool(), req.user.id);
    if (!access || access.isSuspended || access.roomNumber == null) {
      return res.status(401).json({ message: "ไม่พบบัญชีผู้ใช้นี้" });
    }
    if (access.contract.overdue) {
      await expiry.suspendExpiredCustomerNow(req.user.id);
      return res.status(401).json({ code: expiry.CONTRACT_SUSPENDED_CODE, message: expiry.CONTRACT_SUSPENDED_MESSAGE });
    }
    req.contractExpiry = access.contract;
    if (access.contract.expired && !READ_ONLY_METHODS.has(req.method)) {
      return res.status(403).json({ code: expiry.CONTRACT_EXPIRED_CODE, message: expiry.CONTRACT_EXPIRED_MESSAGE, contract: access.contract });
    }
    return next();
  } catch (error) {
    console.error("Check customer suspension error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
  }
}
