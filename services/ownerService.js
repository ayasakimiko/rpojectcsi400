import express from "express";
import "dotenv/config";
import { configureDatabaseService } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { auditDetailsMiddleware } from "../middleware/auditDetails.js";
import ownerRouter from "../router/OwnerRouter.js";

configureDatabaseService("owner");

const app = express();
const PORT = process.env.OWNER_PORT || 4006;

app.use(createCorsMiddleware());
app.use(express.json());
app.use(auditDetailsMiddleware);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "owner" });
});

app.use("/api/owner", ownerRouter);

const server = app.listen(PORT, () => {
  console.log(`Owner service is running on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
