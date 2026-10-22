import express from "express";
import "dotenv/config";
import { configureDatabaseService } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { auditDetailsMiddleware } from "../middleware/auditDetails.js";
import customerRouter from "../router/CustomerDashboardRouter.js";
import staffRouter from "../router/StaffRouter.js";
import adminRouter from "../router/AdminRouter.js";
import { domainRouter } from "./domainRoutes.js";

configureDatabaseService("maintenance");

const app = express();
const PORT = process.env.MAINTENANCE_PORT || 4008;

app.use(createCorsMiddleware());
app.use(express.json({ limit: "12mb" }));
app.use(auditDetailsMiddleware);

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "maintenance" }));
app.use("/api/customer", domainRouter(customerRouter, "customer", "maintenance"));
app.use("/api/staff", domainRouter(staffRouter, "staff", "maintenance"));
app.use("/api/admin", domainRouter(adminRouter, "admin", "maintenance"));

const server = app.listen(PORT, () => console.log(`Maintenance service is running on http://localhost:${PORT}`));
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
