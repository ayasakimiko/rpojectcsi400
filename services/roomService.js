import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import { auditDetailsMiddleware } from "../middleware/auditDetails.js";
import roomRouter from "../router/RoomRouter.js";

const app = express();
const PORT = process.env.ROOM_PORT || 4002;

app.use(createCorsMiddleware());
app.use(express.json());
app.use(auditDetailsMiddleware);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "room" });
});

app.use("/api/rooms", roomRouter);

const server = app.listen(PORT, () => {
  console.log(`Room service is running on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
