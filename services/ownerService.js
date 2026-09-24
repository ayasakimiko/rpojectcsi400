import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import ownerRouter from "../router/OwnerRouter.js";

const app = express();
const PORT = process.env.OWNER_PORT || 4006;

app.use(createCorsMiddleware());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "owner" });
});

app.use("/api/owner", ownerRouter);

app.listen(PORT, () => {
  console.log(`Owner service is running on http://localhost:${PORT}`);
});
