# projectcsi400 — ระบบจัดการหอพัก

React (Vite) + Express + MySQL สำหรับระบบจัดการหอพัก รองรับสมัครสมาชิก, เข้าสู่ระบบ, และจัดการห้องพัก

## กฎระเบียบและเบอร์ติดต่อ
- Admin และ Owner เปิดเมนู **ข้อมูลหอพัก / กฎระเบียบและเบอร์ติดต่อ** เพื่อแก้ไขชื่อหอพัก กฎระเบียบ เวลาปิดประตู เบอร์ผู้ดูแล และเบอร์ช่าง พร้อมดูตัวอย่างก่อนบันทึก
- Staff และผู้เช่าเปิดแท็บ **กฎระเบียบและเบอร์ติดต่อ** เพื่อดูข้อมูลที่บันทึกแล้ว และกดอัปเดตข้อมูลล่าสุดได้
- ข้อมูลเก็บในตาราง `DormConfig` ร่วมกันทุกบทบาท; API ตรวจสอบการเข้าสู่ระบบและอนุญาตให้เฉพาะ Admin/Owner บันทึก
- ก่อนใช้งานรัน `npm run db:migrate` เพื่อเพิ่มตาราง/คอลัมน์ (รันซ้ำได้และเก็บข้อมูลเดิมไว้) แล้วเริ่ม backend ใหม่ หากใช้ Docker ให้รัน `docker compose up -d --build`

## ค่าน้ำตามหน่วยและรายงาน Owner

- Admin กำหนดราคาน้ำต่อหน่วยแยกห้องได้; Staff ส่งบิลค่าน้ำด้วยจำนวนหน่วยหรือระบุยอดเงินโดยตรง ระบบเก็บจำนวนหน่วยไว้ในรายการชำระ
- Owner ดูรายรับและหน่วยน้ำไฟจากรายการที่ชำระแล้วในแท็บการเงิน และกำหนดหมายเลข PromptPay/บัญชีธนาคารในแท็บข้อมูลหอพัก
- ผู้เช่าดูราคาน้ำต่อหน่วยและกราฟประวัติค่าน้ำค่าไฟที่ชำระแล้วในหน้าประวัติการเช่า
- รัน `npm run db:migrate` ก่อนเริ่ม backend เพื่อเพิ่มคอลัมน์โดยไม่เปลี่ยนรหัสผ่านหรือข้อมูลห้องเดิม

## สัญญาเช่า มัดจำ และรูปสัญญา

- ตอนลงทะเบียนผู้เช่า Staff/Admin เลือกระยะสัญญา 1, 3, 6 หรือ 12 เดือน ระบบคำนวณวันสิ้นสุดจากวันเริ่มเช่าเอง (ถ้าเดือนปลายทางไม่มีวันที่เดียวกัน จะใช้วันสุดท้ายของเดือนนั้น) และเก็บระยะสัญญาไว้ใน `Booking.contract_duration_months`
- ต้องแนบรูปสัญญาอย่างน้อย 3 รูป สูงสุด 10 รูป (JPG, PNG, WebP ไม่เกิน 5 MB ต่อรูป) ส่งเป็น `multipart/form-data` ที่ฟิลด์ `contract_images` ไปยัง `POST /api/auth/register` backend ใช้ multer ตรวจจำนวนรูปและชนิดไฟล์จริง (magic bytes) แล้วเก็บไฟล์ใน `uploads/contracts/customer-<id>` ส่วนฐานข้อมูลเก็บแค่ path ในตาราง `ContractImage` ที่ผูกกับ `booking_id` และ `customer_id` หากลงทะเบียนไม่สำเร็จ ไฟล์ที่อัปโหลดจะถูกลบทิ้ง
- ค่าเช่าเดือนแรก = `Room.price` ลบเงินมัดจำ (หักได้ไม่เกินราคาห้อง) ใช้สูตรเดียวกับ `computeRentDue` เดิม จึงหักมัดจำครั้งเดียวต่อสัญญา
- Admin ดูข้อมูลสัญญาและรูปได้ในตารางลูกค้าและหน้ารายละเอียดลูกค้า Staff ดูได้ที่เมนู **สัญญาที่เสร็จสมบูรณ์** (`GET /api/staff/contracts/completed`) ผู้เช่าดูของตัวเองได้ที่เมนู **สัญญาเช่าของฉัน** (`GET /api/customer/contract`)
- ระงับผู้เช่าหรืออนุมัติย้ายออกจะบันทึก `Booking.ended_at` และเก็บมัดจำของสัญญานั้นไว้ใน `Booking.deposit_amount` สัญญาเดิมไม่ถูกลบ ถ้าลงทะเบียนด้วยเลขบัตรเดิมที่ไม่มีห้องแล้ว ระบบจะใช้บัญชีเดิมทำสัญญาใหม่ (เปิดใช้งานบัญชีอีกครั้ง) ส่วนสัญญาเก่าแสดงป้าย **สัญญาเก่า** และนับยอดชำระ/มัดจำแยกตามสัญญา
- แจ้งย้ายออก: ผู้เช่าต้องเลือกวันที่ต้องการย้ายออก (ภายใน 60 วัน) และเห็นผลกระทบกับเงินมัดจำก่อนส่ง Staff ต้องตรวจสภาพห้อง และผู้เช่าต้องไม่มียอดค้างหรือสลิปรอตรวจ (`MOVEOUT_OUTSTANDING`) จึงจะอนุมัติได้ หลังอนุมัติ บัญชีถูกระงับทันทีและล็อกอินไม่ได้ ลูกค้าเข้าระบบได้เฉพาะเมื่อมีห้องเช่าอยู่จริง (`Customer.room_number` ไม่ว่าง) รหัสผ่านเดิมใช้ไม่ได้จนกว่าจะลงทะเบียนใหม่ด้วยเลขบัตรเดิม ซึ่งตั้งรหัสผ่านใหม่และผูกห้องให้
- คืน/ริบเงินมัดจำของสัญญาที่สิ้นสุดแล้วที่ `POST /api/staff/contracts/:bookingId/deposit-settlement` (`action: refund | forfeit`, `deduction`, `note`) บันทึกลง `Booking.deposit_*` และแสดงให้ผู้เช่าเห็นในสัญญาเช่าของฉัน
- รูปสัญญาเปิดได้ผ่าน `/api/files/contracts/...` เท่านั้น ผู้เช่าเปิดได้เฉพาะรูปของตนเอง ส่วน Vite dev server จะไม่เสิร์ฟ `/uploads/contracts` ตรงๆ
- รูปที่ผูกกับผู้เช่า (`payment-slips`, `parcels`, `contracts`, `vehicles`, `maintenance`, `incidents`, `move-in-inspections`, `move-out-inspections`) เก็บแยกโฟลเดอร์ย่อย `customer-<id>` ส่วนรูปที่ไม่มีผู้เช่า เช่น ผู้มาติดต่อ เก็บใน `guest` ฝั่ง multer ถ้ายังไม่รู้ผู้เช่าตอนอัปโหลดจะย้ายไฟล์ด้วย `moveUploadedFiles` หลังหาผู้เช่าได้ และ `npm run db:migrate` จะย้ายรูปเก่าที่ยังอยู่ชั้นนอกเข้าโฟลเดอร์ย่อยพร้อมแก้ path ในฐานข้อมูลและ AuditLog ให้อัตโนมัติ
- auth-service ใน Docker เมานต์ `./public/uploads` เพิ่มเพื่อบันทึกรูปสัญญา หลังอัปเดตให้รัน `npm run db:migrate` (หรือ `docker compose up -d --build`)

## Tech Stack

- **Frontend:** React 19, Vite, React Router, Bootstrap, Axios
- **Backend:** Express 5, mysql2, bcryptjs, jsonwebtoken
- **Database:** MySQL 8.0 (+ phpMyAdmin)
- **Infra:** Docker / docker-compose — backend เป็น microservice แยกต่อ role อยู่หลัง API Gateway (`server.js`)

## สถาปัตยกรรม Backend

`server.js` เป็น **API Gateway** — รับ request ทั้งหมดที่ `/api/*` บน port เดียว (4000) แล้ว proxy ต่อไปยัง microservice ที่ถูก role ตาม path prefix (เขียนด้วย `node:http` ล้วน ไม่ใช้ Express เพื่อลดหน่วยความจำ) โดยแต่ละ service มี Express app + DB connection + CORS ของตัวเอง แยกรันคนละ process/container:

| Path prefix | Microservice | Port |
|---|---|---|
| `/api/auth` | `services/authService.js` | 4001 |
| `/api/rooms` | `services/roomService.js` | 4002 |
| `/api/customer` | `services/customerService.js` | 4003 |
| `/api/staff` | `services/staffService.js` | 4004 |
| `/api/admin` | `services/adminService.js` | 4005 |
| `/api/owner` | `services/ownerService.js` | 4006 |
| `/api/admin/parcels`, `/api/staff/parcels`, `/api/customer/parcels` | `services/parcelService.js` | 4007 |
| `/api/customer/maintenance`, `/api/staff/maintenance`, `/api/admin/rooms/:room/maintenance`, `/api/admin/logs/maintenance` | `services/maintenanceService.js` | 4008 |
| `/api/customer/payments`, `/api/customer/payment-channels`, `/api/staff/payment-*`, `/api/staff/rooms/:room/collect-payment`, `/api/staff/rooms/:room/utility-bill`, `/api/owner/income`, `/api/owner/utility-receipts`, `/api/owner/logs/payments` | `services/paymentService.js` | 4009 |

path ของพัสดุถูกจับก่อน prefix `/api/admin`, `/api/staff`, `/api/customer` ใน gateway จึงไปที่ parcel service แทน

Frontend ใช้ API Gateway เป็นปลายทางหลัก หาก gateway ติดต่อไม่ได้ จะเลือก service ที่รับ path นั้นโดยตรงตามพอร์ตในตาราง บน VPS ให้ Nginx รับ HTTPS และส่ง `/__api/direct/<service>/api/...` ไปยังพอร์ต 4001–4009 โดยไม่ผ่าน gateway

## การรันโปรเจกต์

### รันผ่าน Docker (แนะนำ)

```bash
docker compose up -d --build
```

รวม 12 container สำหรับบริการที่ทำงานต่อเนื่อง (และ `migrate` ที่ทำงานครั้งเดียว):
| Service | Container | Port |
|---|---|---|
| MySQL | `projectcsi400-mysql` | 3308 |
| phpMyAdmin | `projectcsi400-phpmyadmin` | 8080 |
| **API Gateway** | `projectcsi400-gateway` | **4000** |
| Auth service | `projectcsi400-auth` | 4001 |
| Room service | `projectcsi400-room` | 4002 |
| Customer service | `projectcsi400-customer` | 4003 |
| Staff service | `projectcsi400-staff` | 4004 |
| Admin service | `projectcsi400-admin` | 4005 |
| Owner service | `projectcsi400-owner` | 4006 |
| Parcel service | `projectcsi400-parcel` | 4007 |
| Maintenance service | `projectcsi400-maintenance` | 4008 |
| Payment service | `projectcsi400-payment` | 4009 |

Gateway คุยกับ service ย่อยผ่าน Docker network โดยตรง (เช่น `http://auth-service:4001`) ไม่ผ่าน `localhost`

MySQL เชื่อมจากเครื่องผ่าน `localhost:3308` ส่วน container เชื่อมผ่าน `db:3306` หากใช้ MySQL บนพอร์ตอื่น ให้กำหนด `DB_PORT` ในไฟล์ `.env`

phpMyAdmin เริ่มพร้อมบริการอื่นโดยอัตโนมัติ เข้าใช้งานที่ `http://localhost:8080` ด้วยชื่อผู้ใช้ `root` และรหัสผ่านจาก `DB_PASSWORD` ใน `.env` (ค่าเริ่มต้น `rootpass`) หากรันบนเซิร์ฟเวอร์ ให้เปลี่ยน `localhost` เป็น IP หรือโดเมนของเซิร์ฟเวอร์

หากต้องการเปิดเฉพาะ phpMyAdmin และ MySQL โดยไม่ build backend:

```bash
docker compose up -d phpmyadmin
```

> หมายเหตุ: Dockerfile จะ copy source เข้า image ตอน build เท่านั้น (ไม่ใช่ live-reload) — แก้ `server.js` / `services/*` / `router/*` / `Database/*` แล้วต้องรัน `docker compose up -d --build` ใหม่ทุกครั้งถึงจะมีผล

### รัน backend แบบ dev (ไม่ผ่าน Docker)

```bash
npm run server:all   # รัน gateway + ทั้ง 9 service พร้อมกัน (ต้องเปิด MySQL ก่อน)
```
หรือรันทีละตัวด้วย `npm run server`, `server:auth`, `server:room`, `server:customer`, `server:staff`, `server:admin`, `server:owner`, `server:parcel`, `server:maintenance`, `server:payment`

### ตั้งค่าฐานข้อมูลครั้งแรก

รัน `npm run db:migrate` ก่อนเริ่ม backend (Docker มี container `migrate` ทำขั้นตอนนี้ให้) ตัวรัน [`Database/migrate.js`](Database/migrate.js) จะ `CREATE DATABASE IF NOT EXISTS` แยก 9 ฐานตามชื่อ `DB_NAME_room`, `DB_NAME_auth`, `DB_NAME_customer`, `DB_NAME_maintenance`, `DB_NAME_payment`, `DB_NAME_staff`, `DB_NAME_admin`, `DB_NAME_owner`, `DB_NAME_parcel` แล้วรัน SQL ใน [`Database/schema`](Database/schema) ตามลำดับนี้ภายใต้ MySQL lock เดียว

แต่ละ API service เชื่อมต่อฐานของตัวเอง ตารางจริงอยู่ในฐานของเจ้าของตาม [`Database/connection.js`](Database/connection.js) โดย `MaintenanceRequest`/`MaintenancePhoto` อยู่ในฐาน maintenance และ `Payment`/`PaymentSlip`/`PaymentSlipRejection` อยู่ในฐาน payment ส่วน query รวมข้อมูลของ API เดิมใช้ MySQL view ชี้ไปยังตารางจริง จึงยังใช้เส้นทาง API และ transaction เดิมได้ Foreign key ข้ามฐานถูกสร้างโดย migration บน MySQL server เดียวกัน ผู้ใช้ฐานข้อมูลที่ตั้งใน `DB_USER` ต้องมีสิทธิ์สร้างฐาน ตาราง view และเข้าถึงทั้ง 9 ฐาน

Connection pool เปิดสูงสุด `DB_POOL_SIZE` ต่อ service (ค่าเริ่มต้น 4) และเก็บ connection ว่างไว้สูงสุด 1 รายการเป็นเวลา 10 วินาที เพื่อลด RAM ของ MySQL เมื่อไม่มีคำขอ Schema ของ maintenance/payment มี index สำหรับรายการตามลูกค้า ห้อง สถานะ วันที่ และรายการชำระเงินตามประเภท/สัญญาเช่า; migration เพิ่ม index ให้ฐานเดิมโดยไม่ลบข้อมูล

ถ้ามีฐานเดิมชื่อ `DB_NAME` ให้หยุด backend รุ่นเก่าและสำรองฐานข้อมูลก่อน แล้วรัน migration เพื่อคัดลอกข้อมูลและ ID ไปยังฐานใหม่ ตัว migration ไม่ลบฐานเดิมเอง การคัดลอกจะบันทึกสถานะใน `DB_NAME_auth.SchemaCutover` และรันซ้ำได้ หากเริ่มจากระบบ 7 ฐานเดิม migration จะย้ายตาราง Maintenance และ Payment จาก `DB_NAME_customer` ไปยังสองฐานใหม่โดยรักษาข้อมูลและ foreign key ไว้ ต้องหยุด API รุ่นเก่าก่อนย้าย เพื่อไม่ให้มีการเขียนลงตารางระหว่างย้าย โครงสร้างฐานทั้งหมดเก็บเป็นโค้ดใน `Database/schema/` หลัง migration สำเร็จให้เริ่ม API ทั้ง 9 service ด้วยโค้ดรุ่นนี้พร้อมกัน หากรันโดยไม่ใช้ Docker ให้รัน `npm run db:migrate` ก่อนเริ่ม API

ข้อมูลตัวอย่างใน `Database/seed.sql` เป็นทางเลือกเท่านั้น หากต้องใช้ให้รันหลัง migration โดยเลือกฐาน `DB_NAME_auth` ก่อน

### รัน Frontend โดยเลือก VPS ก่อน และใช้ Backend ในเครื่องเป็นสำรอง

ตั้งค่าใน `src/config/api.js`: VPS คือ `https://backend.ayasakimioweb.com` และ Local คือ `http://127.0.0.1:4000` ซึ่งเป็น gateway จาก `server.js` เดิม

```bash
npm run dev
```

Frontend ตรวจ `/api/health` ของ gateway ก่อน หากติดต่อไม่ได้ จะตรวจ `/api/health` ของ service ที่รับ API path นั้นบน VPS แล้วจึงลอง gateway/service ในเครื่อง การเลือกปลายทางแยกตาม service และตรวจ gateway ใหม่เมื่อ cache หมด (5 วินาที) โดยมี timeout ต่อการตรวจ 1.8 วินาที คำขออ่านที่ล้มระหว่างส่งจะลอง service ตรงอีกหนึ่งครั้ง ส่วนคำขอเขียนจะตรวจ gateway ก่อนส่งและจะไม่ส่งซ้ำหลังเกิดข้อผิดพลาดกลางคำขอ

ถ้าต้องการให้ Local พร้อมรับงานสำรอง ให้เปิดฐานข้อมูลเดิมในเครื่อง แล้วเปิดอีก Terminal รัน:

```bash
npm run server:all
```

`npm run server` เปิดเฉพาะ gateway ส่วน API ที่ใช้ฐานข้อมูลยังต้องมี service ย่อยทำงานด้วย

ตอนพัฒนา คำขอผ่าน Vite proxy โดยมีเส้นทางแยกสำหรับ service ในเครื่อง ตอน build เว็บจริง fallback ของ VPS ใช้ HTTPS origin เดียวกับ gateway ผ่าน Nginx แต่ละ Backend ต้องอนุญาตโดเมน Frontend ใน `CLIENT_URL` การเรียก Local จากเว็บจริงยังขึ้นกับสิทธิ์เข้าถึงเครือข่ายในเครื่องของเบราว์เซอร์

### เปิด fallback บน VPS

เพิ่ม location จาก [`docker/nginx/direct-services.conf`](docker/nginx/direct-services.conf) ภายใน `server {}` ของ HTTPS virtual host `backend.ayasakimioweb.com` แล้วทดสอบและ reload Nginx (`nginx -t && systemctl reload nginx`) ไฟล์นี้ส่งแต่ละเส้นทางไปพอร์ต service บน host โดยตรง จึงใช้ได้เมื่อ gateway 4000 หยุดทำงาน หาก Nginx รันใน container ให้เปลี่ยน upstream `127.0.0.1` เป็นชื่อ service ใน Docker network ตาม `docker-compose.yml` ก่อนติดตั้ง ตั้งค่า `client_max_body_size` ของ HTTPS virtual host ให้รองรับไฟล์อัปโหลดตามที่ gateway เดิมใช้ แล้วตรวจ `https://backend.ayasakimioweb.com/__api/direct/auth/api/health` ว่าตอบ `{"status":"ok","service":"auth"}` และตรวจครบทั้งเก้า service

ต้อง deploy backend และ frontend เวอร์ชันนี้พร้อมกันเพื่อให้ audit log ของคำขอผ่าน gateway และคำขอที่วิ่งตรงถูกบันทึกโดย service เพียงครั้งเดียว จากนั้นทดสอบหยุดเฉพาะ gateway แล้วเรียก login, รายการพัสดุ, และรูปอัปโหลดผ่าน frontend ก่อนเปิดใช้จริง

VPS และ Local ใช้ฐานข้อมูลและไฟล์ของตนเอง ไม่ได้ซิงก์กันอัตโนมัติ เมื่อสลับระหว่าง VPS กับ Local ระบบจะล้างเซสชันเดิมและให้เข้าสู่ระบบใหม่ จึงไม่ส่ง token ของอีกฐานข้อมูลข้ามไปใช้งาน

การล็อกอินผิด ข้อมูลไม่พบ หรือ API ตอบข้อผิดพลาดทั่วไปจะไม่ทำให้สลับ Backend อัตโนมัติ การสลับจาก gateway ไปยัง service ของ VPS เดียวกันยังใช้ session เดิม คำขอเพิ่ม แก้ไข ลบ และอัปโหลดจะไม่ถูกส่งซ้ำเมื่อเครือข่ายขาดกลางคำขอ เพราะฝั่งแรกอาจบันทึกข้อมูลสำเร็จไปแล้ว

ใช้ `npm run build` เพื่อสร้าง `dist` และเริ่ม dev server ใหม่หลังแก้ค่าปลายทาง

## Database Schema

ตาราง: `Customer`, `Staff`, `Admin`, `Owner`, `Room`, `Booking`

ความสัมพันธ์หลัก:
- `Customer.room_number` → FK ไปที่ `Room.room_number` (ลูกค้า 1 คนผูกกับห้องปัจจุบัน 1 ห้องโดยตรง)
- `Booking` เก็บประวัติการจอง เชื่อม `Customer.id` ↔ `Room.id` พร้อม snapshot วันเริ่ม/สิ้นสุดสัญญาของแต่ละรายการ
- `TenantRequest` เก็บคำขอต่อสัญญา, แจ้งย้ายออก และย้ายห้อง โดย `target_room_number` ใช้กับคำขอย้ายห้อง
- `RoomTransfer` เก็บประวัติการย้ายห้องที่อนุมัติแล้ว (ห้อง/ราคาเดิม-ใหม่ เงินมัดจำที่หัก ยอดที่เก็บเพิ่ม) ผูกกับ `Booking` เดิมและใหม่
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

### `POST /api/customer/requests`
ส่งคำขอย้ายห้องโดยระบุ `type: "move_room"` และเลขห้องปลายทางใน `target_room_number` ระบบตรวจสอบห้องว่างทั้งตอนส่งคำขอและตอนเจ้าหน้าที่อนุมัติ ก่อนย้ายจริง Staff ต้องตรวจห้องต้นทาง (ผลตรวจที่ผูกกับคำขอไม่ต้องรอ Admin) และผู้เช่าต้องไม่มียอดค้างชำระหรือสลิปรอตรวจ

ตอนกดอนุมัติ Staff จะเห็นหน้าสรุปจาก `GET /api/staff/requests/:id/transfer-preview` (ข้อมูลผู้เช่า สัญญา ห้องเดิม/ห้องใหม่ ส่วนต่างค่าเช่า เงินมัดจำคงเหลือ ยอดที่จะหัก และยอดที่ต้องเก็บเพิ่ม) แล้วจึงยืนยัน `POST /api/staff/requests/:id/approve` ทุกขั้นตอนอยู่ใน transaction เดียว:
- ถ้าห้องใหม่แพงกว่า คิดส่วนต่าง `ราคาห้องใหม่ − ราคาห้องเดิม` ต่อรอบบิลที่ผู้เช่าชำระไว้แล้ว (ปกติ 1 รอบ) หักจากเงินมัดจำคงเหลือก่อน ส่วนที่เหลือเพิ่มเป็นรายการ `room_transfer` ในยอดชำระเดือนนี้ (เก็บครั้งเดียว)
- ถ้าราคาเท่ากันหรือถูกกว่า ไม่หักมัดจำและไม่สร้างยอดเพิ่ม
- ห้องใหม่ใช้รอบบิลและวันสิ้นสุดสัญญาเดิม รอบที่ชำระแล้วถือว่าจ่ายครบ รอบถัดไปคิดราคาห้องใหม่
- ตาราง `RoomTransfer` บันทึกการย้ายแต่ละครั้งเป็นเอกสารแนบท้ายสัญญา (รูปสัญญาที่เซ็นไว้ไม่ถูกแก้ไข) และมี unique key ที่ `tenant_request_id` กันการอนุมัติซ้ำ
- หน้าสัญญาของ Staff, Admin และลูกค้า แสดงห้องและค่าเช่าปัจจุบัน พร้อมประวัติการย้ายห้องและผลต่อเงินมัดจำ/ยอดชำระ

ทดสอบด้วย `npm test` (ชุดทดสอบฐานข้อมูลจะสร้างและลบฐาน `projectcsi400_rtest_*` เอง ต้องตั้ง `DB_USER`/`DB_PASSWORD` ให้เข้า MySQL ได้)

แบบตรวจห้องใช้เกณฑ์ประเมินสภาพทั่วไป แยกเป็น `ปกติ`, `สึกหรอตามการใช้งาน`, `ชำรุด`, `สูญหาย` และ `ไม่มี/ไม่ได้ติดตั้ง` โดยไม่มีแบบฟอร์มสากลที่บังคับเหมือนกันทุกแห่ง กรณีชำรุดหรือสูญหายต้องระบุรายละเอียดและแนบภาพประกอบ ส่วนสึกหรอตามปกติให้แยกจากความเสียหายและไม่ถือเป็นการชำรุดโดยอัตโนมัติ

ศูนย์แจ้งเตือนจะแสดงคำขอใหม่และแจ้งซ่อมที่เจ้าหน้าที่ต้องดำเนินการ, แจ้ง Admin เมื่อมีผลตรวจย้ายห้องรอตรวจ และแจ้ง Staff เมื่อ Admin ตรวจแล้วหรือขอให้แก้ผลตรวจ รายการจะอัปเดตอัตโนมัติขณะหน้าแดชบอร์ดเปิดอยู่ (Staff ทุก 20 วินาที, Admin ทุก 60 วินาที) และเมื่อกลับมาเปิดหน้าอีกครั้ง จุดแจ้งเตือนแสดงรายการที่ยังไม่ได้เปิดดู โดยเก็บสถานะอ่านแล้วแยกตามบัญชีในเบราว์เซอร์

หากเจ้าหน้าที่อนุมัติหรือปฏิเสธคำขอโดยตรงก่อนกดรับเรื่อง ระบบจะบันทึกเจ้าหน้าที่ผู้ดำเนินการเป็นผู้รับเรื่องด้วย เพื่อให้ประวัติแสดงข้อมูล “รับเรื่องโดย” ครบถ้วน

หลังอัปเดตโปรเจกต์เดิม ให้รัน `npm run db:migrate` แล้วรีสตาร์ต backend (หากใช้ Docker ให้ build ใหม่) เพื่อเพิ่มคอลัมน์สำหรับคำขอย้ายห้อง, ผลตรวจที่เชื่อมกับคำขอ และเก็บประวัติสัญญาอัตโนมัติ

```json
{
  "type": "move_room",
  "target_room_number": 102,
  "note": "ต้องการย้ายไปห้องใกล้บันได"
}
```

## สรุปการทำงานที่ผ่านมา (เปลี่ยนแปลงสำคัญ)

- **Login** รองรับทั้งเลขบัตรประชาชนและเลขห้อง ผ่านฟิลด์ `username` เดียว
- **Register** เพิ่มการเลือกห้อง (dropdown ดึงจาก `/api/rooms/available`) และผูกข้อมูลกับ `Booking`/`Room` แบบ transaction-safe
- เพิ่มคำขอ **ย้ายห้อง** จากหน้าลูกค้า พร้อมให้เจ้าหน้าที่ตรวจสอบ/อนุมัติหรือปฏิเสธ โดยคงประวัติการเช่าเดิมไว้
- เพิ่ม **`RoomRouter.js`** สำหรับสร้างห้อง/ดูห้องว่าง
- Containerize backend ด้วย **Dockerfile + docker-compose** ให้รันพร้อมกับ MySQL/phpMyAdmin ได้ในคำสั่งเดียว
- แก้ schema ที่มีปัญหาในไฟล์ SQL ภายใต้ `Database/schema/`:
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
- `Database/schema/room.sql`, `Database/connection.js` — เพิ่มคอลัมน์ `Room.prepaid_until` (วันที่จ่ายล่วงหน้าครอบคลุมถึง) และ `Room.pending_lump_sum_months` (จำนวนเดือนที่รอคูณยอดในรอบบิลถัดไป)
- `router/StaffRouter.js` (ใหม่) — mount ที่ `/api/staff`, มี `POST /tenant-requests/:id/approve` (ขยายสัญญา + ตั้ง `pending_lump_sum_months` ถ้าเป็น lump sum) และ `POST /tenant-requests/:id/reject` กันด้วย header `x-staff-key` ชั่วคราว (`STAFF_API_KEY` env) เพราะยังไม่มีระบบ login staff จริง — มี `TODO` ให้แทนที่ด้วย auth จริงทีหลัง
- `router/CustomerDashboardRouter.js` — `computeCurrentDue()` เช็ค `prepaid_until` (ซ่อนยอดถ้าอยู่ในช่วงจ่ายล่วงหน้า) และคำนวณ `lumpSumMonths` (คูณยอดถ้ามี `pending_lump_sum_months` ค้างอยู่); `POST /payments/confirm` ตั้ง `prepaid_until`/เคลียร์ `pending_lump_sum_months` หลังจ่ายยอดทบสำเร็จ
- `server.js` — mount `staffRouter`
- `src/page/CustomerDashbord.jsx`, `.css` — ข้อความ "ยอดนี้รวมค่าเช่าล่วงหน้า X เดือน" ในการ์ดยอดชำระและ modal QR, และข้อความ "ชำระค่าเช่าล่วงหน้าแบบทบยอดไว้แล้วถึงวันที่ X" ตอนซ่อนยอด

**ทดสอบแล้ว** (ผ่าน curl กับข้อมูลจริงแล้วล้างคืนสภาพเดิม): ขอต่อสัญญาจ่ายทบ 6 เดือน → อนุมัติ → ยอดขึ้น 21,000 (ราคาห้อง 3,500 × 6) ถูกต้อง → จ่ายสำเร็จ → ยอดหายไปพร้อม `prepaid_until` ถูกต้อง, เคสจ่ายรายเดือนขยายสัญญาอย่างเดียวไม่คูณ/ไม่ซ่อนยอด, และ guard การอนุมัติซ้ำ/reject คำขอที่อนุมัติแล้ว/staff key ผิด

**ยังไม่ได้ทำ:** ระบบ login/role staff จริง (ตอนนี้ใช้ shared key ชั่วคราว) และหน้า UI ฝั่ง staff สำหรับดู/อนุมัติคำขอ (ต้องเรียกผ่าน API ตรงๆ)


## API รูปอัปโหลดและสลิป

- Backend รวมไว้ใน `router/UploadRouter.js` ไฟล์เดียว เปิด `/api/files/<folder>/<fileName>` ผ่าน customer service และ gateway
- Frontend รวม `UploadImage`, `UploadLink` และ hook ภายในไว้ใน `src/components/UploadMedia.jsx` ไฟล์เดียว แล้วแต่ละ Page นำไปใช้ โดยไม่เปลี่ยนพาธเดิมที่ใช้แก้ไขหรือลบรูป
- การอ่านรูปใช้ Bearer token และ Blob URL โดยไม่ใส่ token ลง URL ผู้เช่าดูสลิปของตนและพัสดุของตนในห้องปัจจุบันได้ เจ้าหน้าที่ดูตามสิทธิ์บัญชี รูปตรวจห้องจำกัดเฉพาะเจ้าหน้าที่
- ไฟล์อ่านจาก `public/uploads` ของ Backend ที่เลือก บน Docker ใช้ bind mount ของ customer service เดิม และไม่ต้องเพิ่ม Nginx alias หรือพอร์ต
- ตอน build Frontend จะไม่คัดลอก `public/uploads` ลง `dist` ส่วนไฟล์สาธารณะอื่น เช่น favicon ยังคงอยู่

หลังอัปเดต Backend ให้ส่ง `server.js`, `services/customerService.js`, `router/UploadRouter.js` และ `router/CustomerDashboardRouter.js` ไปตำแหน่งเดิมบน VPS แล้ว build และเริ่ม gateway กับ customer-service ใหม่ โดยใช้ `.env` และ Compose ที่ตั้งค่าบน VPS ไว้แล้ว
