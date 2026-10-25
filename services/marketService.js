import express from "express";
import "dotenv/config";
import { configureDatabaseService, getPool } from "../Database/connection.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { createMarketCorsMiddleware } from "../middleware/marketCors.js";
import { authenticateMarketKey, sendMarketError } from "../middleware/marketApiKey.js";
import { requireMarketAdmin } from "../middleware/marketAccount.js";
import { MARKET_API_KEY_HEADER, MARKET_PUBLIC_PREFIX } from "../src/config/serviceRoutes.js";
import marketPublicRouter from "../router/MarketPublicRouter.js";
import marketAdminRouter from "../router/MarketAdminRouter.js";
import marketLeaseRouter from "../router/MarketLeaseRouter.js";
import { loadMarketConfig, refreshAllStallStatuses } from "../router/marketShared.js";

const REQUIRED_ENV = ["MARKET_DB_USER", "MARKET_DB_PASSWORD", "JWT_SECRET"];
const DAILY_JOB_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STALL_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const JSON_LIMIT = "32kb";
const API_VERSION = "1";
const SUNSET_DATE = /^\d{4}-\d{2}-\d{2}$/.test(process.env.MARKET_API_V1_SUNSET || "")
  ? new Date(`${process.env.MARKET_API_V1_SUNSET}T00:00:00+07:00`)
  : null;

const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Market service cannot start: missing environment variables ${missing.join(", ")}`);
  process.exit(1);
}

configureDatabaseService("market");

const app = express();
const PORT = process.env.MARKET_PORT || 4010;

app.set("trust proxy", process.env.MARKET_TRUST_PROXY || "loopback, uniquelocal");
app.disable("x-powered-by");

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "market" });
});

function apiVersionHeaders(req, res, next) {
  res.setHeader("X-Market-Api-Version", API_VERSION);
  if (SUNSET_DATE) {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", SUNSET_DATE.toUTCString());
  }
  next();
}

app.use(
  MARKET_PUBLIC_PREFIX,
  apiVersionHeaders,
  createMarketCorsMiddleware(),
  express.json({ limit: JSON_LIMIT }),
  authenticateMarketKey,
  marketPublicRouter,
);

app.use("/api/admin/market", createCorsMiddleware(), (req, res, next) => {
  if (req.headers[MARKET_API_KEY_HEADER] !== undefined) {
    return res.status(403).json({ code: "FORBIDDEN", message: "API key ใช้ได้เฉพาะ /api/market/v1" });
  }
  return next();
}, express.json({ limit: JSON_LIMIT }), ...requireMarketAdmin);
app.use("/api/admin/market/leases", marketLeaseRouter);
app.use("/api/admin/market", marketAdminRouter);

app.use((req, res) => {
  if (req.path.startsWith(MARKET_PUBLIC_PREFIX)) return sendMarketError(res, "NOT_FOUND", "ไม่พบ endpoint นี้");
  return res.status(404).json({ message: "ไม่พบเส้นทาง API นี้" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const isPublic = req.originalUrl.startsWith(MARKET_PUBLIC_PREFIX);
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return isPublic
      ? sendMarketError(res, "VALIDATION_ERROR", "รูปแบบ JSON ไม่ถูกต้องหรือใหญ่เกินไป")
      : res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }
  if (error.message === "Not allowed by CORS") return res.status(403).json({ message: "ไม่อนุญาตให้เข้าถึงจาก origin นี้" });
  console.error("Market service error:", error);
  return isPublic ? sendMarketError(res, "SERVER_ERROR") : res.status(500).json({ message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง" });
});

async function purgeOldApiLogs() {
  try {
    const db = getPool();
    const { log_retention_days: days } = await loadMarketConfig(db);
    const [result] = await db.query("DELETE FROM MarketApiLog WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [days]);
    if (result.affectedRows > 0) console.log(`Market API log cleanup removed ${result.affectedRows} rows older than ${days} days`);
  } catch (error) {
    console.error("Market API log cleanup error:", error.message);
  }
}

async function refreshStalls() {
  try {
    await refreshAllStallStatuses(getPool());
  } catch (error) {
    console.error("Market stall status refresh error:", error.message);
  }
}

const server = app.listen(PORT, () => {
  console.log(`Market service is running on http://localhost:${PORT}`);
  purgeOldApiLogs();
  refreshStalls();
  setInterval(purgeOldApiLogs, DAILY_JOB_INTERVAL_MS).unref();
  setInterval(refreshStalls, STALL_REFRESH_INTERVAL_MS).unref();
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
