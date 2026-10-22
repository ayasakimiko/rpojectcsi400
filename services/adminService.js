import express from "express";
import "dotenv/config";
import { configureDatabaseService } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { auditDetailsMiddleware } from "../middleware/auditDetails.js";
import adminRouter from "../router/AdminRouter.js";
import { withoutDomainRoutes } from "./domainRoutes.js";

configureDatabaseService("admin");

const app = express();
const PORT = process.env.ADMIN_PORT || 4005;

app.use(createCorsMiddleware());
app.use(express.json({ limit: "12mb" }));
app.use(auditDetailsMiddleware);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "admin" });
});

app.use("/api/admin", withoutDomainRoutes(adminRouter, "admin"));

const server = app.listen(PORT, () => {
  console.log(`Admin service is running on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
