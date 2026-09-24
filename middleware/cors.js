import cors from "cors";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173"];

export function createCorsMiddleware() {
  const allowedOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",").map((origin) => origin.trim())
    : DEFAULT_ALLOWED_ORIGINS;

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
