import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import loginRouter from "../router/LoginRouter.js";
import registerRouter from "../router/Register.js";

const app = express();
const PORT = process.env.AUTH_PORT || 4001;

app.use(createCorsMiddleware());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "auth" });
});

app.use("/api/auth", loginRouter);
app.use("/api/auth", registerRouter);

app.listen(PORT, () => {
  console.log(`Auth service is running on http://localhost:${PORT}`);
});
