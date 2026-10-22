import express from "express";
import "dotenv/config";
import { configureDatabaseService } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { auditDetailsMiddleware } from "../middleware/auditDetails.js";
import staffRouter from "../router/StaffRouter.js";

configureDatabaseService("staff");

const app = express();
const PORT = process.env.STAFF_PORT || 4004;

app.use(createCorsMiddleware());
app.use(express.json({ limit: "12mb" }));
app.use(auditDetailsMiddleware);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "staff" });
});

app.use("/api/staff", staffRouter);

const server = app.listen(PORT, () => {
  console.log(`Staff service is running on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
