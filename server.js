import express from "express";
import cors from "cors";
import "dotenv/config";
import loginRouter from "./router/LoginRouter.js";
import registerRouter from "./router/Register.js";
import roomRouter from "./router/RoomRouter.js";
import customerDashboardRouter from "./router/CustomerDashboardRouter.js";
import staffRouter from "./router/StaffRouter.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", loginRouter);
app.use("/api/auth", registerRouter);
app.use("/api/rooms", roomRouter);
app.use("/api/customer", customerDashboardRouter);
app.use("/api/staff", staffRouter);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
