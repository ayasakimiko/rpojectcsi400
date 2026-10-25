import express from "express";
import "dotenv/config";
import { configureDatabaseService } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { requireMarketAccount } from "../middleware/marketAuth.js";
import { authenticateApiKey, marketApiCors, sendApiError } from "../middleware/marketApiKey.js";
import { MarketError } from "../router/marketShared.js";
import marketRouter from "../router/MarketRouter.js";
import marketTenantApiRouter from "../router/MarketTenantApiRouter.js";

configureDatabaseService("market");

const app = express();
const PORT = process.env.MARKET_PORT || 4010;
const JSON_LIMIT = "64kb";
const TENANT_API_PREFIX = "/api/market/v1";

app.set("trust proxy", "loopback, uniquelocal");
app.disable("x-powered-by");

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "market" });
});

app.use(TENANT_API_PREFIX, marketApiCors, express.json({ limit: JSON_LIMIT }), authenticateApiKey, marketTenantApiRouter);
app.use("/api/market", createCorsMiddleware(), express.json({ limit: JSON_LIMIT }), ...requireMarketAccount, marketRouter);

app.use((req, res) => {
  if (req.path.startsWith(TENANT_API_PREFIX)) return sendApiError(res, 404, "NOT_FOUND", "ไม่พบ endpoint นี้");
  return res.status(404).json({ message: "ไม่พบเส้นทาง API นี้" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const tenantApi = req.originalUrl.startsWith(TENANT_API_PREFIX);
  if (error instanceof MarketError) {
    return tenantApi ? sendApiError(res, error.status, error.code, error.message) : res.status(error.status).json({ message: error.message });
  }
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return tenantApi
      ? sendApiError(res, 400, "VALIDATION_ERROR", "รูปแบบ JSON ไม่ถูกต้องหรือใหญ่เกินไป")
      : res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }
  if (error.message === "Not allowed by CORS") return res.status(403).json({ message: "ไม่อนุญาตให้เข้าถึงจาก origin นี้" });
  console.error("Market service error:", error);
  return tenantApi
    ? sendApiError(res, 500, "SERVER_ERROR", "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง")
    : res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
});

const server = app.listen(PORT, () => {
  console.log(`Market service is running on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
