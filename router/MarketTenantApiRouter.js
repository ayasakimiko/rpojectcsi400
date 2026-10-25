import { Router } from "express";
import { getPool } from "../Database/connection.js";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  maskIdcard,
  parseId,
  serializeLease,
  serializeShop,
  updateProduct,
  validateProductInput,
} from "./marketShared.js";

const router = Router();

const SELECT_SHOP = "SELECT * FROM ShopInfo WHERE id = ?";
const SELECT_LEASE = "SELECT * FROM ShopLeaseInfo WHERE id = ?";

const actorName = (req) => `API: ${req.tenant.label}`;

function readOnly(resource) {
  return (req, res) => res.status(403).json({
    code: "READ_ONLY",
    message: `${resource}เป็นข้อมูลอ่านอย่างเดียว ติดต่อเจ้าหน้าที่หอพักหากต้องการแก้ไข`,
  });
}

function publicProduct(product) {
  const result = { ...product };
  delete result.shop_id;
  return result;
}

function publicLease(row) {
  const lease = serializeLease(row);
  return {
    contract_no: lease.contract_no,
    status: lease.status,
    tenant_name: lease.tenant_name,
    tenant_phone: lease.tenant_phone,
    tenant_idcard: maskIdcard(lease.tenant_idcard),
    tenant_email: lease.tenant_email,
    business_name: lease.business_name,
    start_date: lease.start_date,
    end_date: lease.end_date,
    monthly_rent: lease.monthly_rent,
    deposit: lease.deposit,
    payment_due_day: lease.payment_due_day,
    terms: lease.terms,
    created_at: lease.created_at,
  };
}

function publicShop(row) {
  const shop = serializeShop(row);
  return {
    code: shop.code,
    name: shop.name,
    shop_type: shop.shop_type,
    location: shop.location,
    area_sqm: shop.area_sqm,
    open_time: shop.open_time,
    close_time: shop.close_time,
    description: shop.description,
    caretaker_name: shop.caretaker_name,
  };
}

router.get("/", (req, res) => {
  res.json({
    service: "market",
    version: "1",
    endpoints: [
      "GET /api/market/v1/shop",
      "GET /api/market/v1/contract",
      "GET /api/market/v1/products",
      "GET /api/market/v1/products/:id",
      "POST /api/market/v1/products",
      "PUT|PATCH /api/market/v1/products/:id",
      "DELETE /api/market/v1/products/:id",
    ],
  });
});

router.get("/shop", async (req, res) => {
  const db = getPool();
  const [[shop]] = await db.query(SELECT_SHOP, [req.tenant.shopId]);
  const [[lease]] = await db.query(SELECT_LEASE, [req.tenant.leaseId]);
  const products = await listProducts(db, req.tenant.shopId);
  res.json({
    shop: publicShop(shop),
    tenant: { name: lease.tenant_name, business_name: lease.business_name },
    product_summary: {
      total: products.length,
      available: products.filter((product) => product.is_available).length,
      categories: [...new Set(products.map((product) => product.category))],
    },
  });
});
router.all("/shop", readOnly("ข้อมูลร้านค้า"));

router.get("/contract", async (req, res) => {
  const [[lease]] = await getPool().query(SELECT_LEASE, [req.tenant.leaseId]);
  res.json({ contract: publicLease(lease) });
});
router.all("/contract", readOnly("สัญญาเช่า"));
router.all("/contract/{*rest}", readOnly("สัญญาเช่า"));

router.get("/products", async (req, res) => {
  let products = await listProducts(getPool(), req.tenant.shopId);
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  if (category) products = products.filter((product) => product.category === category);
  res.json({ products: products.map(publicProduct) });
});

router.get("/products/:id", async (req, res) => {
  const product = await getProduct(getPool(), req.tenant.shopId, parseId(req.params.id));
  res.json({ product: publicProduct(product) });
});

router.post("/products", async (req, res) => {
  const product = await createProduct(getPool(), req.tenant.shopId, validateProductInput(req.body), actorName(req));
  res.status(201).json({ message: "เพิ่มสินค้าเรียบร้อยแล้ว", product: publicProduct(product) });
});

async function patchProduct(req, res) {
  const input = validateProductInput(req.body, { partial: true });
  const product = await updateProduct(getPool(), req.tenant.shopId, parseId(req.params.id), input, actorName(req));
  res.json({ message: "บันทึกสินค้าเรียบร้อยแล้ว", product: publicProduct(product) });
}

router.put("/products/:id", patchProduct);
router.patch("/products/:id", patchProduct);

router.delete("/products/:id", async (req, res) => {
  await deleteProduct(getPool(), req.tenant.shopId, parseId(req.params.id));
  res.json({ message: "ลบสินค้าเรียบร้อยแล้ว" });
});

export default router;
