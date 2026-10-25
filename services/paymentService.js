import express from "express";
import "dotenv/config";
import { configureDatabaseService } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { auditDetailsMiddleware } from "../middleware/auditDetails.js";
import customerRouter from "../router/CustomerDashboardRouter.js";
import staffRouter from "../router/StaffRouter.js";
import ownerRouter from "../router/OwnerRouter.js";
import { domainRouter } from "./domainRoutes.js";
import paymentChannelRouter from "../router/PaymentChannelRouter.js";
import { authenticate, requireStaffRole } from "../middleware/authMiddleware.js";
import { requireActiveStaff } from "../middleware/accounts.js";

configureDatabaseService("payment");

const app = express();
const PORT = process.env.PAYMENT_PORT || 4009;

app.use(createCorsMiddleware());
app.use(express.json({ limit: "12mb" }));
app.use(auditDetailsMiddleware);

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "payment" }));
app.use("/api/customer", domainRouter(customerRouter, "customer", "payment"));
app.use("/api/staff", domainRouter(staffRouter, "staff", "payment"));
app.use("/api/owner", domainRouter(ownerRouter, "owner", "payment"));
app.use("/api/payment", authenticate, requireStaffRole, requireActiveStaff, paymentChannelRouter);

const server = app.listen(PORT, () => console.log(`Payment service is running on http://localhost:${PORT}`));
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
