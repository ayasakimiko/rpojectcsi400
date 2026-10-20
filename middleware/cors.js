import cors from "cors";

// อนุญาตเฉพาะ origin ที่ระบุใน CLIENT_URL (คั่นด้วย ,) ถ้าไม่ตั้งไว้จะไม่อนุญาต origin ใดเลย
export function createCorsMiddleware() {
  const allowedOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  });
}
