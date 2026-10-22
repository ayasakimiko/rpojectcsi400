import express from "express";
import "dotenv/config";
import { configureDatabaseService } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { auditDetailsMiddleware } from "../middleware/auditDetails.js";
import {
  authenticate,
  requireAdminRole,
  requireCustomerRole,
  requireStaffRole,
} from "../middleware/authMiddleware.js";
import {
  getActingAdminName,
  getActingStaffName,
  requireActiveCustomer,
  requireActiveStaff,
} from "../middleware/accounts.js";
import { createParcelRouter, customerParcelRouter } from "../router/ParcelRouter.js";

configureDatabaseService("parcel");

const app = express();
const PORT = process.env.PARCEL_PORT || 4007;

app.use(createCorsMiddleware());
app.use(express.json());
app.use(auditDetailsMiddleware);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "parcel" });
});

app.use("/api/admin/parcels", authenticate, requireAdminRole, requireActiveStaff, createParcelRouter(getActingAdminName));
app.use("/api/staff/parcels", authenticate, requireStaffRole, requireActiveStaff, createParcelRouter(getActingStaffName));
app.use("/api/customer/parcels", authenticate, requireCustomerRole, requireActiveCustomer, customerParcelRouter);

const server = app.listen(PORT, () => {
  console.log(`Parcel service is running on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
