import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import staffRouter from "../router/StaffRouter.js";

const app = express();
const PORT = process.env.STAFF_PORT || 4004;

app.use(createCorsMiddleware());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "staff" });
});

app.use("/api/staff", staffRouter);

app.listen(PORT, () => {
  console.log(`Staff service is running on http://localhost:${PORT}`);
});
