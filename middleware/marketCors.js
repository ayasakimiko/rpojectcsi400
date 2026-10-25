import { getPool } from "../Database/connection.js";

const ORIGIN_CACHE_MS = 60_000;
const ALLOWED_HEADERS = "Content-Type, X-Market-Api-Key, If-Match";
const ALLOWED_METHODS = "GET, PATCH, POST, OPTIONS";
const EXPOSED_HEADERS = "X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After, ETag";

let cache = { loadedAt: 0, origins: new Set() };

export function invalidateOriginCache() {
  cache = { loadedAt: 0, origins: new Set() };
}

async function activeOrigins() {
  if (Date.now() - cache.loadedAt < ORIGIN_CACHE_MS) return cache.origins;
  const [rows] = await getPool().query("SELECT origin FROM MarketAllowedOrigin WHERE is_active = TRUE");
  cache = { loadedAt: Date.now(), origins: new Set(rows.map((row) => row.origin)) };
  return cache.origins;
}

export function createMarketCorsMiddleware() {
  return async function marketCors(req, res, next) {
    res.setHeader("Vary", "Origin");
    const origin = req.headers.origin;
    if (!origin) return req.method === "OPTIONS" ? res.status(204).end() : next();
    try {
      const allowed = (await activeOrigins()).has(origin);
      if (allowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
        res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
        res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
        res.setHeader("Access-Control-Max-Age", "600");
      }
      if (req.method === "OPTIONS") return res.status(allowed ? 204 : 403).end();
      req.marketOriginAllowed = allowed;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
