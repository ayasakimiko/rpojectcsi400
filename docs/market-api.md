# คู่มือใช้งาน Market API 1.3

สำหรับเพื่อนต่างโปรเจกต์ที่จะเชื่อมระบบ (เช่น แอป POS หรือหน้าเมนูร้าน) เข้ากับข้อมูลร้านและสินค้าในล็อกเช่าใต้ตึกของหอพัก
สเปกแบบเครื่องอ่านได้อยู่ที่ `docs/market-openapi.yaml` (นำเข้า Postman หรือ Swagger ได้) ตัวอย่างโค้ดอยู่ที่ `docs/examples/market-client.js`

## เปลี่ยนจาก 1.2

- สิทธิ์เป็น scope: `stalls:read`, `stalls:write`, `products:read`, `products:write` (แทน “อ่านอย่างเดียว / แก้ไขได้”)
- key มี 2 ชนิด: `mk_test_…` เห็นเฉพาะล็อกทดลอง ใช้ทดสอบก่อน และ `mk_live_…` สำหรับล็อกจริง
- เพิ่ม `GET /me` ไว้ทดสอบว่า key ใช้ได้
- เพิ่ม `POST /products/:id/adjust` ปรับจำนวนแบบบวก/ลบ เช่น `-1` ตอนขาย ปลอดภัยเมื่อขายพร้อมกันหลายเครื่อง
- `PATCH /products/:id` รับ header `If-Match` (เลข version) ถ้ามีคนแก้ก่อนจะได้ 409 `CONFLICT`
- ทุก response มี `X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`
- รหัส error `READ_ONLY_KEY` เปลี่ยนชื่อเป็น `SCOPE_REQUIRED` และเพิ่ม `CONFLICT` รวมเป็น 10 รหัส
- แก้ชื่อร้านได้เฉพาะล็อกที่มีสัญญาเช่ามีผลอยู่

## ขอสิทธิ์ใช้งาน

หอพักเป็นผู้ออก key และกำหนด domain ทั้งหมด คุณเพิ่มหรือแก้เองผ่านระบบไม่ได้

1. แจ้งหอพัก: ชื่อระบบ ชื่อโปรเจกต์ อีเมลผู้ติดต่อ ล็อกที่ต้องการ และสิทธิ์ที่ต้องใช้
2. ถ้าจะเรียกจากเบราว์เซอร์ แจ้ง domain แบบ `https://host` (ไม่มี path ไม่รับ `*`)
3. รับ key แบบ test ก่อน ทดสอบตาม checklist ด้านล่างให้ผ่าน แล้วค่อยขอ key แบบ live
4. key แสดงครั้งเดียว เก็บไว้ใน environment variable ทันที ถ้าหลุดให้แจ้งหอพักหมุน key (key เก่าใช้ต่อได้ช่วงสั้น ๆ ตามที่หอพักตั้ง)

## การเรียก API

| หัวข้อ | ค่า |
| --- | --- |
| Base URL | `https://<โดเมนหอพัก>/api/market/v1` |
| ยืนยันตัวตน | header `X-Market-Api-Key: <key>` ทุก request |
| รูปแบบ | JSON (UTF-8) ส่ง `Content-Type: application/json` เมื่อมี body |
| ห้ามส่ง | `Authorization`, cookie หรือ token ของเว็บหอพัก (ส่งมาจะได้ 401) |

| Method | Path | Scope | ใช้ทำอะไร |
| --- | --- | --- | --- |
| GET | `/me` | - | ข้อมูล key ชนิด สิทธิ์ โควตา วันหมดอายุ |
| GET | `/stalls` | stalls:read | ร้านที่ key เข้าถึงได้ (`?page=`) |
| PATCH | `/stalls/:id` | stalls:write | แก้ `shop_name` |
| GET | `/stalls/:id/products` | products:read | สินค้าทั้งหมดของร้าน |
| GET | `/products/:id` | products:read | สินค้าชิ้นเดียว (header `ETag` = version) |
| PATCH | `/products/:id` | products:write | แก้ `name`, `price`, `quantity` |
| POST | `/products/:id/adjust` | products:write | ปรับจำนวน `{ "delta": -1 }` |

กติกาข้อมูล: ชื่อ 1–100 ตัวอักษร · `price` เป็นตัวเลข ≥ 0 ทศนิยมไม่เกิน 2 ตำแหน่ง (ห้ามส่งเป็นข้อความ) · `quantity` เป็นจำนวนเต็ม 0 ถึง `quantity_limit` และเป็นค่าตั้งทับ · `unit` และ `quantity_limit` แก้ไม่ได้ ส่งมาจะได้ 400 `FIELD_NOT_ALLOWED`

```bash
curl https://<โดเมนหอพัก>/api/market/v1/stalls -H "X-Market-Api-Key: $MARKET_API_KEY"

curl -X POST https://<โดเมนหอพัก>/api/market/v1/products/51/adjust \
  -H "X-Market-Api-Key: $MARKET_API_KEY" -H "Content-Type: application/json" -d '{ "delta": -1 }'
```

## Error

ทุก error ตอบเป็น `{ "code": "...", "message": "..." }` พร้อม header `X-Request-Id` (ส่งค่านี้ให้หอพักเวลาแจ้งปัญหา)

| HTTP | code | เกิดเมื่อ | ควรทำ |
| --- | --- | --- | --- |
| 400 | VALIDATION_ERROR | ข้อมูลผิดรูปแบบ JSON ผิด หรือเปลี่ยนราคาเกินที่หอพักกำหนด | แก้ข้อมูลแล้วส่งใหม่ |
| 400 | FIELD_NOT_ALLOWED | ส่งฟิลด์ที่แก้ไม่ได้ | ส่งเฉพาะฟิลด์ที่แก้ได้ |
| 400 | QUANTITY_OUT_OF_RANGE | จำนวนติดลบหรือเกิน limit | อ่าน limit ล่าสุดก่อนส่ง |
| 401 | INVALID_API_KEY | ไม่มี key, key ผิด, ถูกระงับ, หมดอายุ หรือส่ง Authorization มาด้วย | ตรวจ key หรือติดต่อหอพัก |
| 403 | SCOPE_REQUIRED | key ไม่มี scope ที่ endpoint ต้องใช้ | ขอเพิ่มสิทธิ์ |
| 403 | FORBIDDEN | เรียก path นอก `/api/market/v1`, IP หรือ domain ไม่ได้รับอนุญาต, แก้ชื่อร้านที่ไม่มีสัญญา | ตรวจ IP/domain หรือติดต่อหอพัก |
| 404 | NOT_FOUND | ไม่มีข้อมูล หรือ key ไม่มีสิทธิ์ล็อกนั้น | ตรวจ id |
| 409 | CONFLICT | `If-Match` ไม่ตรงกับ version ล่าสุด | อ่านค่าล่าสุดแล้วส่งใหม่ |
| 429 | RATE_LIMITED | เรียกเกินจำนวนต่อนาที | รอตาม `Retry-After` |
| 500 | SERVER_ERROR | ระบบขัดข้อง | ลองใหม่แบบเว้นระยะ |

## Checklist ก่อนขอ key แบบ live

- [ ] เก็บ key ใน environment variable ไม่อยู่ใน repository, log หรือโค้ดหน้าเว็บ
- [ ] `GET /me` ได้ 200 และเห็น `mode`, `scopes` ตรงที่ขอ
- [ ] `GET /stalls` และ `GET /stalls/:id/products` แสดงชื่อ จำนวน ราคา ถูกต้อง
- [ ] ขายสินค้าใช้ `adjust` และแสดงค่าจาก response เสมอ
- [ ] จัดการ 400 / 401 / 403 / 404 / 409 ด้วยข้อความที่ผู้ใช้เข้าใจ
- [ ] จัดการ 429 ด้วยการรอตาม `Retry-After` และ 5xx ด้วยการลองใหม่ไม่เกิน 3 ครั้ง
- [ ] ถ้าเรียกจากเบราว์เซอร์ domain ลงทะเบียนแล้ว และใช้ key ที่มีแค่ scope อ่าน
