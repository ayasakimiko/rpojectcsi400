import express from "express";
import "dotenv/config";
import { configureDatabaseService } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { auditDetailsMiddleware } from "../middleware/auditDetails.js";
import { authenticate, requireStaffRole } from "../middleware/authMiddleware.js";
import { requireActiveStaff } from "../middleware/accounts.js";
import { sendApiError } from "../middleware/marketApiKey.js";
import { authenticateRepairApiKey, repairApiCors } from "../middleware/repairApiKey.js";
import customerRouter from "../router/CustomerDashboardRouter.js";
import staffRouter from "../router/StaffRouter.js";
import adminRouter from "../router/AdminRouter.js";
import repairVendorRouter from "../router/RepairVendorRouter.js";
import repairVendorApiRouter from "../router/RepairVendorApiRouter.js";
import { RepairError } from "../router/repairVendorShared.js";
import { domainRouter } from "./domainRoutes.js";

configureDatabaseService("maintenance");

const app = express();
const PORT = process.env.MAINTENANCE_PORT || 4008;
const REPAIR_API_PREFIX = "/api/repair/v1";
const REPAIR_STAFF_PREFIX = "/api/staff/repair-vendors";

app.set("trust proxy", "loopback, uniquelocal");
app.use(REPAIR_API_PREFIX, repairApiCors, express.json({ limit: "64kb" }), authenticateRepairApiKey, repairVendorApiRouter);

app.use(createCorsMiddleware());
app.use(express.json({ limit: "12mb" }));
app.use(auditDetailsMiddleware);

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "maintenance" }));
app.use(REPAIR_STAFF_PREFIX, authenticate, requireStaffRole, requireActiveStaff, repairVendorRouter);
app.use("/api/customer", domainRouter(customerRouter, "customer", "maintenance"));
app.use("/api/staff", domainRouter(staffRouter, "staff", "maintenance"));
app.use("/api/admin", domainRouter(adminRouter, "admin", "maintenance"));

app.use((req, res) => {
  if (req.originalUrl.startsWith(REPAIR_API_PREFIX)) return sendApiError(res, 404, "NOT_FOUND", "ไม่พบ endpoint นี้");
  return res.status(404).json({ message: "ไม่พบเส้นทาง API นี้" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const vendorApi = req.originalUrl.startsWith(REPAIR_API_PREFIX);
  if (error instanceof RepairError) {
    return vendorApi ? sendApiError(res, error.status, error.code, error.message) : res.status(error.status).json({ message: error.message, code: error.code });
  }
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return vendorApi
      ? sendApiError(res, 400, "VALIDATION_ERROR", "รูปแบบ JSON ไม่ถูกต้องหรือใหญ่เกินไป")
      : res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }
  if (error.message === "Not allowed by CORS") return res.status(403).json({ message: "ไม่อนุญาตให้เข้าถึงจาก origin นี้" });
  console.error("Maintenance service error:", error);
  return vendorApi
    ? sendApiError(res, 500, "SERVER_ERROR", "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง")
    : res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
});

const server = app.listen(PORT, () => console.log(`Maintenance service is running on http://localhost:${PORT}`));
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
