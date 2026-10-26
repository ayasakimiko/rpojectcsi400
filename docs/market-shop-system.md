# ระบบร้านค้าเช่าข้างหอพัก (Market service)

จุดขายเล็ก ๆ ข้างหอพัก (แนวมินิมาร์ท) ที่หอเปิดให้เช่า แต่ละร้านมีสินค้า ประเภทสินค้า ราคา และผู้เช่าของตัวเอง สัญญาเช่าร้านแยกจากสัญญาเช่าห้องพักของลูกค้าโดยสิ้นเชิง

## โครงสร้าง

| ส่วน | ที่อยู่ |
|---|---|
| Service | `services/marketService.js` (port 4010, container `projectcsi400-market`) |
| API ภายใน (JWT) | `router/MarketRouter.js` → `/api/market/*` |
| API ผู้เช่า (API key) | `router/MarketTenantApiRouter.js` → `/api/market/v1/*` |
| ตรวจสิทธิ์ | `middleware/marketAuth.js` (JWT + ถาม auth-service), `middleware/marketApiKey.js` (API key) |
| ฐานข้อมูล | `Database/schema/market.sql` → `projectcsi400_market` |
| หน้าเว็บ | `src/components/MarketManager.jsx` แท็บ "ร้านค้าเช่าข้างหอ" ใน Admin / Staff / Owner |

### ฐานข้อมูลแยก

- `projectcsi400_market` ไม่มี view ข้ามไปยังฐานข้อมูลของ service อื่น และ service อื่นก็ไม่เห็นตารางของ market
- ใช้ MySQL user ของตัวเอง (`MARKET_DB_USER` / `MARKET_DB_PASSWORD` ใน `.env`) ซึ่งได้สิทธิ์ `SELECT, INSERT, UPDATE, DELETE` เฉพาะ `projectcsi400_market` เท่านั้น
- ข้อมูลบัญชีพนักงานไม่เก็บซ้ำ market-service ถาม auth-service ผ่าน `GET /api/auth/account` และ `GET /api/auth/staff-directory`
- ตาราง: `Shop`, `ShopLease`, `ShopProduct`, `ShopApiKey`, `ShopSeed` และ view `ShopInfo`, `ShopLeaseInfo` (คำนวณสถานะสัญญาจากวันที่)
- SQL ทั้งหมดเป็นข้อความคงที่ ส่งค่าผ่าน placeholder `?` เท่านั้น ไม่มีการต่อ string ด้วยตัวแปร

ข้อมูลตั้งต้น 3 ร้าน (SH-01 มินิมาร์ท, SH-02 ร้านกาแฟ, SH-03 เครื่องเขียน) พร้อมผู้เช่าและสินค้า ใส่ครั้งเดียวตอน migrate ครั้งแรก

## สิทธิ์แต่ละ role

| การทำงาน | Admin | Owner | Staff |
|---|---|---|---|
| ดูร้านค้า สินค้า สัญญา | ✔ | ✔ | ✔ |
| สร้าง / แก้ไข / ปิดร้านค้า | ✔ | ✔ | — |
| เพิ่ม / แก้ไข / ลบสินค้า | ✔ | — | ✔ |
| ทำสัญญา / ต่ออายุ / ยกเลิกสัญญา | ✔ | — | ✔ |
| ออก / ยกเลิก API key ให้ผู้เช่า | ✔ | — | ✔ |

ระยะสัญญาเช่าร้านค้าและการต่อสัญญาแต่ละครั้งยาวได้ไม่เกิน 12 เดือน

รูปสัญญา: ทำสัญญาและต่อสัญญาต้องแนบรูปอย่างน้อย 5 รูป (สูงสุด 10 รูปต่อครั้ง รวมไม่เกิน 20 รูปต่อสัญญา) แนบเพิ่มภายหลังได้ เก็บในโฟลเดอร์ส่วนตัว `storage/market-contracts` (ไม่อยู่ใต้ `public/`) และเปิดดูได้ผ่าน `GET /api/market/lease-images/:id` ที่ต้องล็อกอินเท่านั้น

การชำระเงิน: สัญญาจะถูกสร้างหลังชำระเงินสำเร็จเท่านั้น ยอดแรกเข้า = ค่าเช่าเดือนแรก + มัดจำ ใช้ช่องทางและการตรวจสลิปเดียวกับของหอ (`DormConfig` ผ่าน `GET /api/payment/channels` ของ payment-service) เลือกได้ 3 แบบ คือ PromptPay / โอนเข้าบัญชี (แนบสลิป ตรวจกับ RDCW อัตโนมัติ หรือให้เจ้าหน้าที่ตรวจเองตาม `slip_verify_mode` หรือโหมดทดลอง) และเงินสดที่เคาน์เตอร์ สลิปที่เคยใช้กับค่าห้อง/ค่าปรับ/สัญญาร้านค้าแล้วใช้ซ้ำไม่ได้ (เช็กผ่าน `GET /api/payment/slip-usage`) บันทึกในตาราง `ShopLeasePayment`

ต่อสัญญา: `POST /api/market/leases/:id/renew` `{ months }` ขยายวันสิ้นสุดต่อจากวันสิ้นสุดเดิม (`DATE_ADD(end_date, INTERVAL n MONTH)`) แบบเดียวกับการต่อสัญญาห้องพัก ไม่ต้องชำระเงินตอนต่อ

กฎสัญญา: ร้านหนึ่งมีสัญญาที่ช่วงวันที่ซ้อนกันไม่ได้, ยกเลิกสัญญาแล้ว API key ของสัญญานั้นถูกปิดทั้งหมด, ปิดร้านได้เมื่อไม่มีสัญญาที่ยังใช้งาน

## API สำหรับผู้เช่าร้านค้า (ลิงก์ backend ที่ให้คนภายนอก)

- Base URL: `https://backend.ayasakimioweb.com/api/market/v1`
- Header: `X-Market-Api-Key: shk_xxxxxxxxxx_...` (ได้จากเจ้าหน้าที่ในหน้ารายละเอียดสัญญา แสดงครั้งเดียว)
- 1 key ผูกกับ 1 สัญญา เห็นเฉพาะร้านที่เช่า ใช้ได้จนกว่าสัญญาหมดอายุ/ถูกยกเลิก หรือ key ถูกยกเลิก
- จำกัด 120 ครั้ง/นาที ต่อ key, CORS เปิดให้ทุก origin (ไม่ใช้ cookie)

| Method | Path | สิทธิ์ |
|---|---|---|
| GET | `/shop` | อ่าน: ข้อมูลร้าน ผู้เช่า สรุปสินค้า |
| GET | `/contract` | อ่าน: สัญญาเช่า (เลขบัตรถูกปิดบางส่วน) |
| GET | `/products?category=` | อ่าน |
| GET | `/products/:id` | อ่าน |
| POST | `/products` | แก้ไข: `name`, `category`, `price` จำเป็น |
| PUT / PATCH | `/products/:id` | แก้ไข: `sku, name, category, price, stock, unit, description, is_available` |
| DELETE | `/products/:id` | แก้ไข |
| PUT/PATCH/POST/DELETE | `/contract`, `/shop` | ถูกปฏิเสธ `403 READ_ONLY` |

รหัสข้อผิดพลาด: `401 INVALID_API_KEY`, `403 READ_ONLY`, `400 VALIDATION_ERROR`, `400 FIELD_NOT_ALLOWED`, `404 NOT_FOUND`, `409 CONFLICT` (SKU ซ้ำ), `429 RATE_LIMITED`

```bash
curl -H "X-Market-Api-Key: <key>" https://backend.ayasakimioweb.com/api/market/v1/products
curl -X PATCH -H "X-Market-Api-Key: <key>" -H "Content-Type: application/json" \
  -d '{"price": 25, "stock": 40}' https://backend.ayasakimioweb.com/api/market/v1/products/12
```

## ทดสอบ

```bash
docker compose run --rm --no-deps -v "$PWD/tests:/app/tests" -v "$PWD/storage/market-contracts:/app/storage/market-contracts" \
  -e MARKET_TEST_API_URL=http://gateway:4000 staff-service node --test tests/market.db.test.js
```

ต้อง mount `storage/market-contracts` ด้วย เพื่อให้เทสต์ลบไฟล์รูปสัญญาที่สร้างระหว่างทดสอบได้

```bash
```
