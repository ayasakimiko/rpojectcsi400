import http from "node:http";
import "dotenv/config";
import { createCorsMiddleware } from "./middleware/cors.js";
import { serviceForPath } from "./src/config/serviceRoutes.js";

const PORT = process.env.PORT || 4000;

const serviceAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 10000, maxSockets: 64, maxFreeSockets: 16, timeout: 60000 });

const SERVICE_TARGETS = Object.fromEntries(Object.entries({
  auth: [process.env.AUTH_SERVICE_URL, 4001],
  rooms: [process.env.ROOM_SERVICE_URL, 4002],
  customer: [process.env.CUSTOMER_SERVICE_URL, 4003],
  staff: [process.env.STAFF_SERVICE_URL, 4004],
  admin: [process.env.ADMIN_SERVICE_URL, 4005],
  owner: [process.env.OWNER_SERVICE_URL, 4006],
  parcels: [process.env.PARCEL_SERVICE_URL, 4007],
  maintenance: [process.env.MAINTENANCE_SERVICE_URL, 4008],
  payment: [process.env.PAYMENT_SERVICE_URL, 4009],
}).map(([service, [url, port]]) => [service, new URL(url || `http://localhost:${port}`)]));

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade"]);

const cors = createCorsMiddleware();

function findTarget(url) {
  return SERVICE_TARGETS[serviceForPath(url)] || null;
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

function proxy(req, res, target) {
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
    return proxy(req, res, target);
  });
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(PORT, () => {
  console.log(`API gateway is running on http://localhost:${PORT}`);
});
