import express from "express";
import "dotenv/config";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createCorsMiddleware } from "./middleware/cors.js";

const app = express();
const PORT = process.env.PORT || 4000;

const ROUTES = {
  "/api/auth": process.env.AUTH_SERVICE_URL || "http://localhost:4001",
  "/api/rooms": process.env.ROOM_SERVICE_URL || "http://localhost:4002",
  "/api/customer": process.env.CUSTOMER_SERVICE_URL || "http://localhost:4003",
  "/api/staff": process.env.STAFF_SERVICE_URL || "http://localhost:4004",
  "/api/admin": process.env.ADMIN_SERVICE_URL || "http://localhost:4005",
  "/api/owner": process.env.OWNER_SERVICE_URL || "http://localhost:4006",
};

app.use(createCorsMiddleware());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "gateway" });
});

for (const [path, target] of Object.entries(ROUTES)) {
  app.use(
    path,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (_path, req) => req.originalUrl,
    }),
  );
}

app.listen(PORT, () => {
  console.log(`API gateway is running on http://localhost:${PORT}`);
});
