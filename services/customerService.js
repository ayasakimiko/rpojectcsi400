import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import customerDashboardRouter from "../router/CustomerDashboardRouter.js";
import { createUploadRouter } from "../router/UploadRouter.js";
import { getPool } from "../Database/connection.js";

const app = express();
const PORT = process.env.CUSTOMER_PORT || 4003;

app.use(createCorsMiddleware());
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "customer" });
});

app.use("/api/files", createUploadRouter(getPool));
app.use("/api/customer", customerDashboardRouter);

app.listen(PORT, () => {
  console.log(`Customer service is running on http://localhost:${PORT}`);
});
