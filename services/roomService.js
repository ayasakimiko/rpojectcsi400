import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import roomRouter from "../router/RoomRouter.js";

const app = express();
const PORT = process.env.ROOM_PORT || 4002;

app.use(createCorsMiddleware());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "room" });
});

app.use("/api/rooms", roomRouter);

app.listen(PORT, () => {
  console.log(`Room service is running on http://localhost:${PORT}`);
});
