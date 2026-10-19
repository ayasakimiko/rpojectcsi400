import http from "node:http";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { createCorsMiddleware } from "./middleware/cors.js";
import { getPool } from "./Database/connection.js";

const PORT = process.env.PORT || 4000;

const PARCEL_SERVICE_URL = process.env.PARCEL_SERVICE_URL || "http://localhost:4007";
const serviceAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 10000, maxSockets: 64, maxFreeSockets: 16, timeout: 60000 });

const ROUTES = Object.entries({
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
}).map(([prefix, target]) => [prefix, new URL(target)]);

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade"]);

const cors = createCorsMiddleware();

function getAuditActor(req) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return null;
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;

  let actor;
  try {
    actor = jwt.verify(authorization.slice(7), process.env.JWT_SECRET || "dev-secret-change-me");
  } catch {
    return null;
  }
  return Number.isSafeInteger(actor.id) && ["Customer", "Staff", "Admin", "Owner"].includes(actor.role) ? actor : null;
}

function findTarget(url) {
  const end = url.search(/[?#]/);
  const pathname = (end === -1 ? url : url.slice(0, end)).toLowerCase();
  for (const [prefix, target] of ROUTES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return target;
  }
  return null;
}

function stripHopByHop(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(name)) result[name] = value;
  }
  return result;
}

function sendJson(res, status, body) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function proxy(req, res, target, actor) {
  let clientClosed = false;
  const proxyReq = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: req.method,
    path: req.url,
    headers: { ...stripHopByHop(req.headers), host: target.host },
    agent: serviceAgent,
  });

  proxyReq.on("response", (proxyRes) => {
    if (actor && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
      const endpoint = req.url.split("?")[0].slice(0, 255);
      const ipAddress = (req.socket.remoteAddress || "").slice(0, 45);
      getPool().query(
        `INSERT INTO AuditLog (actor_id, actor_role, method, endpoint, status_code, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [actor.id, actor.role, req.method, endpoint, proxyRes.statusCode, ipAddress || null],
      ).catch((error) => console.error("Audit log write error:", error));
    }
    res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, stripHopByHop(proxyRes.headers));
    proxyRes.pipe(res);
  });
  proxyReq.on("timeout", () => proxyReq.destroy(Object.assign(new Error("Upstream timeout"), { code: "ETIMEDOUT" })));
  proxyReq.on("error", (error) => {
    if (clientClosed || res.writableEnded) return;
    console.error(`Gateway proxy error ${req.method} ${req.url} -> ${target.host}:`, error.code || error.message);
    sendJson(res, error.code === "ETIMEDOUT" ? 504 : 502, { message: "ไม่สามารถเชื่อมต่อบริการได้ กรุณาลองใหม่อีกครั้ง" });
  });
  res.on("close", () => {
    if (res.writableFinished) return;
    clientClosed = true;
    proxyReq.destroy();
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  cors(req, res, (corsError) => {
    if (corsError) return sendJson(res, 500, { message: corsError.message });

    if (req.method === "GET" && /^\/api\/health\/?(?:\?|$)/i.test(req.url)) {
      return sendJson(res, 200, { status: "ok", service: "gateway" });
    }

    const target = findTarget(req.url);
    if (!target) return sendJson(res, 404, { message: "ไม่พบเส้นทาง API นี้" });
    return proxy(req, res, target, getAuditActor(req));
  });
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(PORT, () => {
  console.log(`API gateway is running on http://localhost:${PORT}`);
});
