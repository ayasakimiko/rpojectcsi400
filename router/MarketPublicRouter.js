import { Router } from "express";
import { getPool } from "../Database/connection.js";
import { MAX_MONEY, MAX_NAME_LENGTH, isPositiveId, parsePage } from "../middleware/validation.js";
import { requireScope, sendMarketError } from "../middleware/marketApiKey.js";
import { loadMarketConfig } from "./marketShared.js";

const PAGE_SIZE = 50;
const MAX_ADJUST_DELTA = 100_000;
const STALL_FIELDS = ["shop_name"];
const PRODUCT_FIELDS = ["name", "price", "quantity"];
const ADJUST_FIELDS = ["delta"];
const IF_MATCH_PATTERN = /^(?:W\/)?"?(\d+)"?$/;

const router = Router();

class MarketApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function sendError(res, error, context) {
  if (error instanceof MarketApiError) return sendMarketError(res, error.code, error.message || undefined);
  console.error(`${context}:`, error);
  return sendMarketError(res, "SERVER_ERROR");
}

function stallView(row) {
  return { id: row.id, code: row.code, zone: row.zone, shop_name: row.shop_name };
}

function productView(row) {
  return {
    id: row.id,
    stall_id: row.stall_id,
    name: row.name,
    unit: row.unit,
    price: Number(row.price),
    quantity: Number(row.quantity),
    quantity_limit: Number(row.quantity_limit),
    version: Number(row.version),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function requireBody(req, allowed) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new MarketApiError("VALIDATION_ERROR", "ต้องส่งข้อมูลเป็น JSON object");
  }
  const keys = Object.keys(body);
  if (keys.length === 0) throw new MarketApiError("VALIDATION_ERROR", `ต้องส่งอย่างน้อยหนึ่งฟิลด์: ${allowed.join(", ")}`);
  const extra = keys.filter((key) => !allowed.includes(key));
  if (extra.length > 0) throw new MarketApiError("FIELD_NOT_ALLOWED", `แก้ไขฟิลด์นี้ไม่ได้: ${extra.join(", ")}`);
  return body;
}

function readName(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new MarketApiError("VALIDATION_ERROR", `${label}ต้องเป็นข้อความที่ไม่ว่าง`);
  const name = value.trim();
  if (name.length > MAX_NAME_LENGTH) throw new MarketApiError("VALIDATION_ERROR", `${label}ยาวได้ไม่เกิน ${MAX_NAME_LENGTH} ตัวอักษร`);
  return name;
}

function readPrice(value) {
  const cents = value * 100;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_MONEY
    || Math.abs(cents - Math.round(cents)) > 1e-6) {
    throw new MarketApiError("VALIDATION_ERROR", "price ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป ทศนิยมไม่เกิน 2 ตำแหน่ง");
  }
  return Math.round(cents) / 100;
}

function readIfMatch(req) {
  const header = req.headers["if-match"];
  if (header === undefined) return null;
  const match = IF_MATCH_PATTERN.exec(String(header).trim());
  if (!match) throw new MarketApiError("VALIDATION_ERROR", "If-Match ต้องเป็นเลข version เช่น \"3\"");
  return Number(match[1]);
}

function ensureStallAccess(req, stallId) {
  if (!isPositiveId(stallId) || !req.marketClient.stallIds.includes(Number(stallId))) {
    throw new MarketApiError("NOT_FOUND");
  }
  return Number(stallId);
}

async function lockProduct(connection, req, productId) {
  if (!isPositiveId(productId)) throw new MarketApiError("NOT_FOUND");
  const [[product]] = await connection.query("SELECT * FROM MarketProduct WHERE id = ? FOR UPDATE", [Number(productId)]);
  if (!product || !req.marketClient.stallIds.includes(product.stall_id)) throw new MarketApiError("NOT_FOUND");
  return product;
}

async function inTransaction(work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function saveProduct(connection, req, product, next) {
  await connection.query(
    `UPDATE MarketProduct
     SET name = ?, price = ?, quantity = ?, version = version + 1, updated_by_role = 'api',
         updated_by_client_id = ?, updated_by_name = NULL, updated_at = NOW()
     WHERE id = ?`,
    [next.name, next.price, next.quantity, req.marketClient.id, product.id],
  );
  const [[saved]] = await connection.query("SELECT * FROM MarketProduct WHERE id = ?", [product.id]);
  return saved;
}

function recordChanges(res, target, before, after) {
  const changes = {};
  for (const key of Object.keys(after)) {
    if (String(before[key]) !== String(after[key])) changes[key] = [before[key], after[key]];
  }
  res.locals.marketChanges = { target, ...changes };
}

function sendProduct(res, row) {
  res.setHeader("ETag", `"${row.version}"`);
  return res.json(productView(row));
}

router.get("/me", async (req, res) => {
  try {
    const [[client]] = await getPool().query(
      "SELECT name, project_name, mode, scopes, rate_limit_per_min, expires_at FROM MarketApiClient WHERE id = ?",
      [req.marketClient.id],
    );
    return res.json({
      name: client.name,
      project_name: client.project_name,
      mode: client.mode,
      scopes: [...req.marketClient.scopes],
      rate_limit_per_min: Number(client.rate_limit_per_min),
      expires_at: client.expires_at ? new Date(client.expires_at).toISOString() : null,
      stall_count: req.marketClient.stallIds.length,
    });
  } catch (error) {
    return sendError(res, error, "Market API me error");
  }
});

router.get("/stalls", requireScope("stalls:read"), async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const ids = req.marketClient.stallIds;
    if (ids.length === 0) return res.json({ stalls: [], page, total: 0 });
    const [rows] = await getPool().query(
      "SELECT id, code, zone, shop_name FROM MarketStall WHERE id IN (?) ORDER BY code ASC LIMIT ? OFFSET ?",
      [ids, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );
    return res.json({ stalls: rows.map(stallView), page, total: ids.length });
  } catch (error) {
    return sendError(res, error, "Market API stalls error");
  }
});

router.get("/stalls/:id/products", requireScope("products:read"), async (req, res) => {
  try {
    const stallId = ensureStallAccess(req, req.params.id);
    const db = getPool();
    const [[stall]] = await db.query("SELECT id, code, zone, shop_name FROM MarketStall WHERE id = ?", [stallId]);
    if (!stall) throw new MarketApiError("NOT_FOUND");
    const [products] = await db.query("SELECT * FROM MarketProduct WHERE stall_id = ? ORDER BY id ASC", [stallId]);
    return res.json({ stall: stallView(stall), products: products.map(productView) });
  } catch (error) {
    return sendError(res, error, "Market API stall products error");
  }
});

router.get("/products/:id", requireScope("products:read"), async (req, res) => {
  try {
    if (!isPositiveId(req.params.id)) throw new MarketApiError("NOT_FOUND");
    const [[product]] = await getPool().query("SELECT * FROM MarketProduct WHERE id = ?", [Number(req.params.id)]);
    if (!product || !req.marketClient.stallIds.includes(product.stall_id)) throw new MarketApiError("NOT_FOUND");
    return sendProduct(res, product);
  } catch (error) {
    return sendError(res, error, "Market API product error");
  }
});

router.patch("/stalls/:id", requireScope("stalls:write"), async (req, res) => {
  try {
    const stallId = ensureStallAccess(req, req.params.id);
    const body = requireBody(req, STALL_FIELDS);
    const shopName = readName(body.shop_name, "shop_name ");
    const stall = await inTransaction(async (connection) => {
      const [[current]] = await connection.query("SELECT * FROM MarketStall WHERE id = ? FOR UPDATE", [stallId]);
      if (!current) throw new MarketApiError("NOT_FOUND");
      if (!current.is_sandbox && current.status !== "occupied") {
        throw new MarketApiError("FORBIDDEN", "แก้ชื่อร้านได้เฉพาะล็อกที่มีสัญญาเช่ามีผลอยู่");
      }
      await connection.query("UPDATE MarketStall SET shop_name = ?, updated_at = NOW() WHERE id = ?", [shopName, stallId]);
      recordChanges(res, `stall:${stallId}`, { shop_name: current.shop_name }, { shop_name: shopName });
      return { ...current, shop_name: shopName };
    });
    return res.json(stallView(stall));
  } catch (error) {
    return sendError(res, error, "Market API stall update error");
  }
});

router.patch("/products/:id", requireScope("products:write"), async (req, res) => {
  try {
    const body = requireBody(req, PRODUCT_FIELDS);
    const name = body.name === undefined ? undefined : readName(body.name, "name ");
    const price = body.price === undefined ? undefined : readPrice(body.price);
    if (body.quantity !== undefined && (!Number.isInteger(body.quantity) || body.quantity < 0)) {
      throw new MarketApiError("QUANTITY_OUT_OF_RANGE", "quantity ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    }
    const expectedVersion = readIfMatch(req);
    const config = price === undefined ? null : await loadMarketConfig(getPool());
    const saved = await inTransaction(async (connection) => {
      const product = await lockProduct(connection, req, req.params.id);
      if (expectedVersion !== null && expectedVersion !== Number(product.version)) throw new MarketApiError("CONFLICT");
      const limit = Number(product.quantity_limit);
      if (body.quantity !== undefined && body.quantity > limit) {
        throw new MarketApiError("QUANTITY_OUT_OF_RANGE", `จำนวนต้องอยู่ระหว่าง 0 ถึง ${limit}`);
      }
      const oldPrice = Number(product.price);
      const maxChange = config?.max_price_change_percent;
      if (price !== undefined && maxChange != null && oldPrice > 0 && (Math.abs(price - oldPrice) / oldPrice) * 100 > maxChange) {
        throw new MarketApiError("VALIDATION_ERROR", `เปลี่ยนราคาได้ไม่เกิน ${maxChange}% ต่อครั้ง`);
      }
      const before = { name: product.name, price: oldPrice, quantity: Number(product.quantity) };
      const after = { name: name ?? before.name, price: price ?? before.price, quantity: body.quantity ?? before.quantity };
      const row = await saveProduct(connection, req, product, after);
      recordChanges(res, `product:${product.id}`, before, after);
      return row;
    });
    return sendProduct(res, saved);
  } catch (error) {
    return sendError(res, error, "Market API product update error");
  }
});

router.post("/products/:id/adjust", requireScope("products:write"), async (req, res) => {
  try {
    const body = requireBody(req, ADJUST_FIELDS);
    const delta = body.delta;
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_ADJUST_DELTA) {
      throw new MarketApiError("VALIDATION_ERROR", `delta ต้องเป็นจำนวนเต็มที่ไม่ใช่ 0 และไม่เกิน ±${MAX_ADJUST_DELTA}`);
    }
    const saved = await inTransaction(async (connection) => {
      const product = await lockProduct(connection, req, req.params.id);
      const quantity = Number(product.quantity) + delta;
      const limit = Number(product.quantity_limit);
      if (quantity < 0 || quantity > limit) {
        throw new MarketApiError("QUANTITY_OUT_OF_RANGE", `จำนวนหลังปรับต้องอยู่ระหว่าง 0 ถึง ${limit} (ตอนนี้ ${product.quantity})`);
      }
      const before = { name: product.name, price: Number(product.price), quantity: Number(product.quantity) };
      const row = await saveProduct(connection, req, product, { ...before, quantity });
      recordChanges(res, `product:${product.id}`, before, { ...before, quantity });
      return row;
    });
    return sendProduct(res, saved);
  } catch (error) {
    return sendError(res, error, "Market API product adjust error");
  }
});

router.use((req, res) => sendMarketError(res, "NOT_FOUND", "ไม่พบ endpoint นี้"));

export default router;
