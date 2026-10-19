import express from "express";
import "dotenv/config";
import { createCorsMiddleware } from "../middleware/cors.js";
import loginRouter from "../router/LoginRouter.js";
import registerRouter from "../router/Register.js";
import forgotPasswordRouter from "../router/ForgotPasswordRouter.js";

const app = express();
const PORT = process.env.AUTH_PORT || 4001;

app.use(createCorsMiddleware());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "auth" });
});

app.use("/api/auth", loginRouter);
app.use("/api/auth", registerRouter);
app.use("/api/auth", forgotPasswordRouter);

const server = app.listen(PORT, () => {
  console.log(`Auth service is running on http://localhost:${PORT}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
