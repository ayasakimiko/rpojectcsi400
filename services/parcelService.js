import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import {
  authenticate,
  requireAdminRole,
  requireCustomerRole,
  requireStaffRole,
} from "../middleware/authMiddleware.js";
import { getActingAdminName } from "../router/AdminRouter.js";
import { getActingStaffName, requireActiveStaff } from "../router/StaffRouter.js";
import { requireActiveCustomer } from "../router/CustomerDashboardRouter.js";
import { createParcelRouter, customerParcelRouter } from "../router/ParcelRouter.js";

const app = express();
const PORT = process.env.PARCEL_PORT || 4007;

app.use(createCorsMiddleware());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "parcel" });
});

app.use("/api/admin/parcels", authenticate, requireAdminRole, createParcelRouter(getActingAdminName));
app.use("/api/staff/parcels", authenticate, requireStaffRole, requireActiveStaff, createParcelRouter(getActingStaffName));
app.use("/api/customer/parcels", authenticate, requireCustomerRole, requireActiveCustomer, customerParcelRouter);

app.listen(PORT, () => {
  console.log(`Parcel service is running on http://localhost:${PORT}`);
});
