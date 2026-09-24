import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import adminRouter from "../router/AdminRouter.js";

const app = express();
const PORT = process.env.ADMIN_PORT || 4005;

app.use(createCorsMiddleware());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "admin" });
});

app.use("/api/admin", adminRouter);

app.listen(PORT, () => {
  console.log(`Admin service is running on http://localhost:${PORT}`);
});
