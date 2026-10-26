import { DB_CONFIG, getPool, serviceDatabaseName } from "../Database/connection.js";
import { actorOf, baht, byActor } from "./notifications.js";

const NOTIFICATION_DB = serviceDatabaseName(DB_CONFIG.database, "owner");
const OPERATORS = ["Staff", "Admin"];
const EVERYONE = ["Staff", "Admin", "Owner"];
const TARGET = "market";

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

export const marketActor = (req) => (req.actor ? actorOf({ role: req.actor.role, id: req.actor.id }, req.actor.name) : actorOf(null, req.tenant ? `API: ${req.tenant.label}` : null));

async function write(items) {
  const list = items.filter(Boolean);
  if (!list.length) return;
  try {
    await getPool().query(
      `INSERT INTO ??.Notification
         (audience, recipient_id, type, tone, ref_table, ref_id, target, title, message, detail, actor_role, actor_id, actor_name, dedupe_key)
       VALUES ?`,
      [NOTIFICATION_DB, list.map((item) => [
        item.audience.join(","), null, clip(item.type, 40), clip(item.tone || "info", 10), clip(item.refTable, 40), item.refId ?? null,
        TARGET, clip(item.title, 160), clip(item.message, 500), clip(item.detail, 1000),
        item.actor?.actor_role ?? null, item.actor?.actor_id ?? null, clip(item.actor?.actor_name, 255), null,
      ])],
    );
  } catch (error) {
    console.error("Market notification write error:", error.message);
  }
}

const shopLabel = (shop) => `${shop.code ? `${shop.code} ` : ""}${shop.name || ""}`.trim();

export const shopChanged = (shop, actor, kind) => {
  const info = {
    created: { title: "เปิดร้านค้าใหม่", tone: "success" },
    updated: { title: "แก้ไขข้อมูลร้านค้า", tone: "info" },
    closed: { title: "ปิดร้านค้า", tone: "danger" },
    renamed: { title: "ผู้เช่าเปลี่ยนชื่อ/ประเภทร้าน", tone: "info" },
  }[kind];
  return write([{
    audience: EVERYONE, type: `market_shop_${kind}`, tone: info.tone, refTable: "Shop", refId: shop.id,
    title: info.title, message: `${shopLabel(shop)}${byActor(actor)}`, detail: shop.shop_type || null, actor,
  }]);
};

export const productChanged = (shop, product, actor, kind) => {
  const label = { created: "เพิ่มสินค้า", updated: "แก้ไขสินค้า", deleted: "ลบสินค้า" }[kind];
  return write([{
    audience: OPERATORS, type: `market_product_${kind}`, tone: kind === "deleted" ? "danger" : "info", refTable: "Shop", refId: shop.id,
    title: `${label} · ${shopLabel(shop)}`, message: `${product?.name || "สินค้า"}${byActor(actor)}`,
    detail: product?.price != null ? `ราคา ${baht(product.price)}` : null, actor,
  }]);
};

export const leaseCreated = (lease, amount, actor) => write([
  {
    audience: OPERATORS, type: "market_lease_created", tone: "success", refTable: "ShopLease", refId: lease.id,
    title: `ทำสัญญาเช่าร้าน ${lease.shop_code || ""}`.trim(),
    message: `${lease.tenant_name} · ${lease.contract_no}${byActor(actor)}`,
    detail: `${lease.start_date} ถึง ${lease.end_date} · ค่าเช่า ${baht(lease.monthly_rent)}/เดือน · รับชำระ ${baht(amount)}`, actor,
  },
  {
    audience: ["Owner"], type: "market_lease_created", tone: "success", refTable: "ShopLease", refId: lease.id,
    title: `รายได้ร้านค้าเช่า: สัญญาใหม่ ${lease.shop_code || ""}`.trim(),
    message: `รับชำระแรกเข้า ${baht(amount)} · ${lease.tenant_name}`,
    detail: `ค่าเช่า ${baht(lease.monthly_rent)}/เดือน ถึง ${lease.end_date}`, actor,
  },
]);

export const leaseRenewed = (lease, months, amount, actor) => write([
  {
    audience: OPERATORS, type: "market_lease_renewed", tone: "success", refTable: "ShopLease", refId: lease.id,
    title: `ต่อสัญญาร้าน ${lease.shop_code || ""}`.trim(),
    message: `${lease.tenant_name} ต่อ ${months} เดือน ถึง ${lease.end_date}${byActor(actor)}`, detail: `รับชำระ ${baht(amount)}`, actor,
  },
  {
    audience: ["Owner"], type: "market_lease_renewed", tone: "success", refTable: "ShopLease", refId: lease.id,
    title: `รายได้ร้านค้าเช่า: ต่อสัญญา ${lease.shop_code || ""}`.trim(),
    message: `รับชำระ ${baht(amount)} · ต่อ ${months} เดือน`, detail: `${lease.tenant_name} ถึง ${lease.end_date}`, actor,
  },
]);

export const leaseTerminated = (lease, reason, actor) => write([{
  audience: EVERYONE, type: "market_lease_terminated", tone: "danger", refTable: "ShopLease", refId: lease.id,
  title: `ยกเลิกสัญญาร้าน ${lease.shop_code || ""}`.trim(), message: `${lease.tenant_name} · ${lease.contract_no}${byActor(actor)}`, detail: reason, actor,
}]);

export const leaseImagesAdded = (lease, count, actor) => write([{
  audience: OPERATORS, type: "market_lease_images", tone: "info", refTable: "ShopLease", refId: lease.id,
  title: `แนบรูปสัญญาร้าน ${lease.shop_code || ""}`.trim(), message: `${count} รูป · ${lease.contract_no}${byActor(actor)}`, actor,
}]);

export const marketKeyChanged = (lease, actor, kind) => {
  const title = { issued: "ออก API key ให้ร้านค้า", rotated: "ออก API key ร้านค้าใหม่แทน", revoked: "ยกเลิก API key ร้านค้า" }[kind];
  return write([{
    audience: OPERATORS, type: `market_key_${kind}`, tone: kind === "revoked" ? "danger" : "info", refTable: "ShopLease", refId: lease.id,
    title, message: `${lease.shop_code || ""} ${lease.tenant_name || ""}${byActor(actor)}`.trim(), actor,
  }]);
};
