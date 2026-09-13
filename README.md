# projectcsi400 — ระบบจัดการหอพัก

React (Vite) + Express + MySQL สำหรับระบบจัดการหอพัก รองรับสมัครสมาชิก, เข้าสู่ระบบ, และจัดการห้องพัก

## Tech Stack

- **Frontend:** React 19, Vite, React Router, Bootstrap, Axios
- **Backend:** Express 5, mysql2, bcryptjs, jsonwebtoken
- **Database:** MySQL 8.0 (+ phpMyAdmin)
- **Infra:** Docker / docker-compose

## การรันโปรเจกต์

### รันผ่าน Docker (แนะนำ)

```bash
docker compose up -d --build
```

จะรัน 3 container พร้อมกัน:
| Service | Container | Port |
|---|---|---|
| MySQL | `projectcsi400-mysql` | 3306 |
| phpMyAdmin | `projectcsi400-phpmyadmin` | 8080 |
| Express server | `projectcsi400-server` | 4000 |

> หมายเหตุ: Dockerfile จะ copy source เข้า image ตอน build เท่านั้น (ไม่ใช่ live-reload) — แก้ `server.js` / `router/*` / `Database/*` แล้วต้องรัน `docker compose up -d --build` ใหม่ทุกครั้งถึงจะมีผล

### ตั้งค่าฐานข้อมูลครั้งแรก

```bash
npm run db:setup
```
สร้างฐานข้อมูล + ตารางทั้งหมดตาม [`Database/database.sql`](Database/database.sql)

### รัน frontend (dev)

```bash
npm run dev
```

## Database Schema

ตาราง: `Customer`, `Staff`, `Admin`, `Owner`, `Room`, `Booking`

ความสัมพันธ์หลัก:
- `Customer.room_number` → FK ไปที่ `Room.room_number` (ลูกค้า 1 คนผูกกับห้องปัจจุบัน 1 ห้องโดยตรง)
- `Booking` เก็บประวัติการจอง เชื่อม `Customer.id` ↔ `Room.id`
- คอลัมน์ที่เป็นตัวเลขไม่ติดลบ (`id`, `age`, `room_number`, `price` ฯลฯ) ใช้ `UNSIGNED`
- `idcard` และ `phone` ในตาราง `Customer` เป็น `UNIQUE`

## API Endpoints

### `POST /api/auth/register`
สมัครสมาชิก — ต้องเลือกห้องที่ยังว่าง (`is_booked = FALSE`) เท่านั้น เมื่อสมัครสำเร็จจะ:
1. สร้าง `Customer`
2. สร้าง `Booking` ผูกกับห้องที่เลือก
3. อัปเดต `Room.is_booked = TRUE`

ทั้งหมดอยู่ใน DB transaction เดียว (`FOR UPDATE` ล็อกแถวห้องกันจองซ้ำพร้อมกัน)

```json
{
  "idcard": "1234567890123",
  "password": "test1234",
  "phone": "0812345678",
  "first_name": "สมชาย",
  "last_name": "ใจดี",
  "age": 25,
  "room_number": 101
}
```

### `POST /api/auth/login`
เข้าสู่ระบบด้วย **เลขบัตรประชาชน (13 หลัก) หรือ เลขห้อง** ก็ได้ (ระบบตรวจจับอัตโนมัติจากความยาว)

```json
{ "username": "1234567890123", "password": "test1234" }
```
หรือ
```json
{ "username": "101", "password": "test1234" }
```

### `GET /api/rooms/available`
คืนรายการห้องที่ยังไม่ถูกจอง ใช้แสดงใน dropdown เลือกห้องตอนสมัครสมาชิก

### `POST /api/rooms/create`
สร้างห้องพักใหม่ (จำเป็น: `room_number`, `price` — ที่เหลือ optional มี default ตรงกับ schema)

## สรุปการทำงานที่ผ่านมา (เปลี่ยนแปลงสำคัญ)

- **Login** รองรับทั้งเลขบัตรประชาชนและเลขห้อง ผ่านฟิลด์ `username` เดียว
- **Register** เพิ่มการเลือกห้อง (dropdown ดึงจาก `/api/rooms/available`) และผูกข้อมูลกับ `Booking`/`Room` แบบ transaction-safe
- เพิ่ม **`RoomRouter.js`** สำหรับสร้างห้อง/ดูห้องว่าง
- Containerize backend ด้วย **Dockerfile + docker-compose** ให้รันพร้อมกับ MySQL/phpMyAdmin ได้ในคำสั่งเดียว
- แก้ schema ที่มีปัญหาใน `database.sql`:
  - `UNSIGNED` ต้องอยู่ติดกับ type (`INT UNSIGNED` ไม่ใช่ `INT ... UNSIGNED` หลัง `AUTO_INCREMENT`)
  - เปลี่ยน `phone` จาก `NUMBER(15)` (ไม่มีจริงใน MySQL) เป็น `VARCHAR(20)` กันปัญหาเลข 0 นำหน้าเบอร์โทรหาย
  - เพิ่ม `UNIQUE` ให้ `phone`, ปรับ `Booking.customer_id` เป็น `UNSIGNED` ให้ type ตรงกับ FK
- แก้ `Register.js` ให้ดักจับ error `ER_DUP_ENTRY` แยกกรณี `idcard` ซ้ำ กับ `phone` ซ้ำ ให้ตอบข้อความที่ถูกต้อง (409) แทน error 500 ทั่วไป

### ระบบต่อสัญญาแบบจ่ายทบยอด (lump sum renewal) — ยังไม่ commit

เพิ่มกลไกอนุมัติคำขอต่อสัญญา ทำให้การเลือก "จ่ายรายเดือน" หรือ "จ่ายทบก้อนเดียว" ตอนขอต่อสัญญามีผลจริงกับยอดชำระ ไม่ใช่แค่ข้อมูลที่บันทึกไว้เฉยๆ เหมือนเดิม

**พฤติกรรม:**
1. ลูกค้าส่งคำขอต่อสัญญา เลือกจำนวนเดือน + รูปแบบชำระ (เหมือนเดิม)
2. staff อนุมัติผ่าน API ใหม่ → สัญญาขยายวันหมดอายุทันทีทั้งสองแบบ
   - **จ่ายรายเดือน**: ไม่มีอะไรพิเศษ ยอดชำระรายเดือนขึ้นตามปกติต่อไป
   - **จ่ายทบก้อนเดียว**: รอบบิลถัดไป การ์ด "ยอดชำระเดือนนี้" ขึ้น **ยอดรวมทั้งก้อน** (ราคาห้อง × จำนวนเดือน) แทนราคาปกติ
3. ลูกค้าจ่ายยอดก้อนนั้นผ่าน QR สแกนจ่ายอันเดียวกับจ่ายค่าห้องปกติ ไม่มีระบบจ่ายเงินแยก
4. จ่ายสำเร็จแล้วระบบจะซ่อนการ์ดยอดชำระไปตลอดช่วงที่จ่ายทบไว้ พร้อมขึ้นข้อความอธิบายแทน
5. พอครบกำหนดที่จ่ายทบไว้ ระบบกลับมาขึ้นยอดชำระรายเดือนให้อัตโนมัติ

**ไฟล์ที่แก้:**
- `Database/database.sql`, `Database/connection.js` — เพิ่มคอลัมน์ `Room.prepaid_until` (วันที่จ่ายล่วงหน้าครอบคลุมถึง) และ `Room.pending_lump_sum_months` (จำนวนเดือนที่รอคูณยอดในรอบบิลถัดไป)
- `router/StaffRouter.js` (ใหม่) — mount ที่ `/api/staff`, มี `POST /tenant-requests/:id/approve` (ขยายสัญญา + ตั้ง `pending_lump_sum_months` ถ้าเป็น lump sum) และ `POST /tenant-requests/:id/reject` กันด้วย header `x-staff-key` ชั่วคราว (`STAFF_API_KEY` env) เพราะยังไม่มีระบบ login staff จริง — มี `TODO` ให้แทนที่ด้วย auth จริงทีหลัง
- `router/CustomerDashboardRouter.js` — `computeCurrentDue()` เช็ค `prepaid_until` (ซ่อนยอดถ้าอยู่ในช่วงจ่ายล่วงหน้า) และคำนวณ `lumpSumMonths` (คูณยอดถ้ามี `pending_lump_sum_months` ค้างอยู่); `POST /payments/confirm` ตั้ง `prepaid_until`/เคลียร์ `pending_lump_sum_months` หลังจ่ายยอดทบสำเร็จ
- `server.js` — mount `staffRouter`
- `src/page/CustomerDashbord.jsx`, `.css` — ข้อความ "ยอดนี้รวมค่าเช่าล่วงหน้า X เดือน" ในการ์ดยอดชำระและ modal QR, และข้อความ "ชำระค่าเช่าล่วงหน้าแบบทบยอดไว้แล้วถึงวันที่ X" ตอนซ่อนยอด

**ทดสอบแล้ว** (ผ่าน curl กับข้อมูลจริงแล้วล้างคืนสภาพเดิม): ขอต่อสัญญาจ่ายทบ 6 เดือน → อนุมัติ → ยอดขึ้น 21,000 (ราคาห้อง 3,500 × 6) ถูกต้อง → จ่ายสำเร็จ → ยอดหายไปพร้อม `prepaid_until` ถูกต้อง, เคสจ่ายรายเดือนขยายสัญญาอย่างเดียวไม่คูณ/ไม่ซ่อนยอด, และ guard การอนุมัติซ้ำ/reject คำขอที่อนุมัติแล้ว/staff key ผิด

**ยังไม่ได้ทำ:** ระบบ login/role staff จริง (ตอนนี้ใช้ shared key ชั่วคราว) และหน้า UI ฝั่ง staff สำหรับดู/อนุมัติคำขอ (ต้องเรียกผ่าน API ตรงๆ)
