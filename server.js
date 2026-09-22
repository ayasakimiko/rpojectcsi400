import express from "express";
import cors from "cors";
import "dotenv/config";
import loginRouter from "./router/LoginRouter.js";
import registerRouter from "./router/Register.js";
import roomRouter from "./router/RoomRouter.js";
import customerDashboardRouter from "./router/CustomerDashboardRouter.js";
import staffRouter from "./router/StaffRouter.js";
import adminRouter from "./router/AdminRouter.js";
import ownerRouter from "./router/OwnerRouter.js";

const app = express();
const PORT = process.env.PORT || 4000;

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173"];
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((origin) => origin.trim())
  : DEFAULT_ALLOWED_ORIGINS;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", loginRouter);
app.use("/api/auth", registerRouter);
app.use("/api/rooms", roomRouter);
app.use("/api/customer", customerDashboardRouter);
app.use("/api/staff", staffRouter);
app.use("/api/admin", adminRouter);
app.use("/api/owner", ownerRouter);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
