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
