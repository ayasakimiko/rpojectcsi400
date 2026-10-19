import express from "express";
import http from "node:http";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createCorsMiddleware } from "./middleware/cors.js";
import { getPool } from "./Database/connection.js";

const app = express();
const PORT = process.env.PORT || 4000;

const PARCEL_SERVICE_URL = process.env.PARCEL_SERVICE_URL || "http://localhost:4007";
const serviceAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 10000, maxSockets: 64, maxFreeSockets: 16, timeout: 60000 });

const ROUTES = {
  "/api/files": process.env.CUSTOMER_SERVICE_URL || "http://localhost:4003",
  "/api/admin/parcels": PARCEL_SERVICE_URL,
  "/api/staff/parcels": PARCEL_SERVICE_URL,
  "/api/customer/parcels": PARCEL_SERVICE_URL,
  "/api/auth": process.env.AUTH_SERVICE_URL || "http://localhost:4001",
  "/api/rooms": process.env.ROOM_SERVICE_URL || "http://localhost:4002",
  "/api/customer": process.env.CUSTOMER_SERVICE_URL || "http://localhost:4003",
  "/api/staff": process.env.STAFF_SERVICE_URL || "http://localhost:4004",
  "/api/admin": process.env.ADMIN_SERVICE_URL || "http://localhost:4005",
  "/api/owner": process.env.OWNER_SERVICE_URL || "http://localhost:4006",
};

app.use(createCorsMiddleware());

app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return next();

  let actor;
  try {
    actor = jwt.verify(authorization.slice(7), process.env.JWT_SECRET || "dev-secret-change-me");
  } catch {
    return next();
  }
  if (!Number.isSafeInteger(actor.id) || !["Customer", "Staff", "Admin", "Owner"].includes(actor.role)) return next();

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const endpoint = req.originalUrl.split("?")[0].slice(0, 255);
    const ipAddress = (req.socket.remoteAddress || "").slice(0, 45);
    getPool().query(
      `INSERT INTO AuditLog (actor_id, actor_role, method, endpoint, status_code, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actor.id, actor.role, req.method, endpoint, res.statusCode, ipAddress || null],
    ).catch((error) => console.error("Audit log write error:", error));
  });
  return next();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "gateway" });
});

for (const [path, target] of Object.entries(ROUTES)) {
  app.use(
    path,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      agent: serviceAgent,
      pathRewrite: (_path, req) => req.originalUrl,
    }),
  );
}

const server = app.listen(PORT, () => {
  console.log(`API gateway is running on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
