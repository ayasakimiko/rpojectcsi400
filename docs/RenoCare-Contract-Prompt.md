คุณคือ developer ของระบบ RenoCare (ระบบจัดการช่างซ่อม) ช่วยเขียนโค้ดฝั่ง RenoCare ให้เชื่อมกับ "Repair Contract API" ของระบบหอพัก ตามสเปกด้านล่างนี้ให้ครบและถูกต้อง ถ้าโค้ดเดิมของ RenoCare มีส่วนไหนอยู่แล้ว (เช่น client เรียก API หอพัก, ตารางสัญญา, ปุ่ม "ส่งสัญญาให้ลูกค้า") ให้ต่อยอดจากของเดิม ห้ามเขียนซ้ำ

## เป้าหมาย
1. เมื่อช่างกด "ส่งสัญญาให้ลูกค้า" ใน RenoCare ให้ส่งสัญญาซ่อมไปที่หอพัก
2. แก้สัญญาที่ยังรออนุมัติได้ แนบไฟล์ได้ ยกเลิกได้
3. ดึงผลอนุมัติ/ไม่อนุมัติกลับมาทุก 1 นาที แล้วอัปเดตสถานะใน RenoCare
4. (ไม่บังคับ) รับ webhook `contract.decided` ถ้า RenoCare มี URL สาธารณะ

## การเชื่อมต่อ
- Base URL: `https://backend.ayasakimioweb.com/api/repair/v1` (เก็บใน env `DORM_BASE_URL`)
- Header ทุกคำขอ: `X-API-Key: <API key ที่หอพักให้>` (เก็บใน env `DORM_API_KEY` ห้าม hardcode ห้าม log)
- ห้ามส่ง header `Authorization`
- JSON ใช้ `Content-Type: application/json`
- Rate limit 120 ครั้ง/นาที/key (รวมทุก endpoint) เกินได้ `429` พร้อม header `Retry-After` (วินาที)
- error ทุกตัวเป็น `{ "code": "...", "message": "..." }`
- เวลาใน response เป็น ISO 8601 UTC, วันที่ในสัญญาเป็น `YYYY-MM-DD`
- `:id` คือ `job_id` ของงานซ่อมที่หอพักส่งมาให้ (ได้มาจากระบบงานซ่อมเดิม)

## Endpoints
| Method | Path | ใช้ทำอะไร |
|---|---|---|
| PUT | `/jobs/:id/contracts/:contract_no` | ส่งสัญญาใหม่ (201) หรือแก้สัญญาที่ยัง pending (200) ตอบ object สัญญา |
| POST | `/jobs/:id/contracts/:contract_no/files` | แนบไฟล์เพิ่มแบบ multipart field ชื่อ `files` (ต่อท้ายไฟล์เดิม) ตอบ 201 + object สัญญา |
| GET | `/contracts?updated_since=&status=&job_id=` | สัญญาทุกงานที่เปลี่ยนหลังเวลาที่ระบุ ตอบ `{ contracts, server_time }` สูงสุด 200 รายการ |
| GET | `/jobs/:id/contracts` | สัญญาทั้งหมดของงาน ตอบ `{ contracts }` |
| GET | `/jobs/:id/contracts/:contract_no` | สัญญาฉบับเดียว |
| GET | `/jobs/:id/contracts/:contract_no/files/:file_id` | ดาวน์โหลดไฟล์แนบ (binary) |
| POST | `/jobs/:id/contracts/:contract_no/cancel` | ยกเลิกสัญญาที่ยัง pending body `{ "reason": "..." }` (จำเป็น ≤ 500 ตัวอักษร) |

## Body ของ PUT
```json
{
  "contract_type": "main",
  "parent_contract_no": null,
  "billing_type": "daily",
  "rate": 500,
  "period_qty": 1,
  "start_date": "2026-11-30",
  "end_date": "2026-11-30",
  "labor_amount": 500,
  "material_amount": 85,
  "total_amount": 585,
  "terms": "รับประกันงาน 30 วัน",
  "items": [
    { "description": "กระเบื้องพื้น 60x60 ซม.", "qty": 1, "unit": "แผ่น", "unit_price": 85 }
  ],
  "installments": [
    { "no": 1, "description": "มัดจำ 30%", "due_date": "2026-11-30", "amount": 175.5 },
    { "no": 2, "description": "ส่วนที่เหลือเมื่อเสร็จงาน", "due_date": "2026-11-30", "amount": 409.5 }
  ],
  "files": [
    { "file_name": "CT2611-0002.pdf", "mime_type": "application/pdf", "data_base64": "JVBERi0xLjQK..." }
  ]
}
```

กติกา (ผิดข้อไหนได้ `400 VALIDATION_ERROR` และ `message` บอกฟิลด์ที่ผิด):
- `contract_no` (ใน path): ≤ 20 ตัว ใช้ได้ `A-Z a-z 0-9 . - _` ขึ้นต้นด้วยตัวอักษรหรือตัวเลข ห้ามมี `/` ไม่ซ้ำภายในงาน ให้ encodeURIComponent เสมอ
- `contract_type`: `main` (ค่าเริ่มต้น) หรือ `addendum` — addendum ต้องส่ง `parent_contract_no` ที่เป็นสัญญาของงานเดียวกันและ **อนุมัติแล้ว**
- `billing_type`: `daily` หรือ `monthly` (จำเป็น)
- `rate` ≥ 0, `period_qty` จำนวนเต็ม > 0
- `start_date`, `end_date`: `YYYY-MM-DD` วันที่มีจริง และ end ≥ start
- `labor_amount` = `rate × period_qty`
- `material_amount` = ผลรวม `qty × unit_price` ของ items (ไม่มี items = 0)
- `total_amount` = `labor_amount + material_amount`
- ยอดเงินเทียบหลังปัดทศนิยม 2 ตำแหน่ง ให้คำนวณด้วย `round2 = n => Math.round((n + Number.EPSILON) * 100) / 100` ทุกบรรทัดก่อนรวม
- `terms`: ข้อความ ≤ 2000 หรือ null
- `items`: ≤ 100 รายการ, `description` ≤ 200, `qty` > 0, `unit` ≤ 20, `unit_price` ≥ 0 (ระบบคำนวณ `line_total` ให้)
- `installments`: ≤ 24 รายการ หรือไม่ส่ง, `description` จำเป็น ≤ 200, `due_date` ไม่บังคับ, ถ้าส่งมาผลรวม `amount` ต้อง = `total_amount` (งวดสุดท้ายให้ใช้ยอดที่เหลือ กันเศษสตางค์ไม่ตรง)
- `files`: ≤ 5 ไฟล์, ชนิด `application/pdf` `image/png` `image/jpeg` เท่านั้น, ไฟล์ละ ≤ 5 MB หลัง decode, เนื้อไฟล์ต้องตรงกับ `mime_type`
  - ส่ง `files` มา = แทนที่ไฟล์เดิมทั้งหมด
  - ไม่ส่ง `files` = คงไฟล์เดิมไว้
- body ทั้งก้อน ≤ 16 MB (เกินได้ `413 PAYLOAD_TOO_LARGE`) ถ้าไฟล์รวมเกินราว 10 MB ให้ PUT โดยไม่ส่ง `files` แล้วอัปโหลดผ่าน `POST .../files` แทน

Response มีฟิลด์: `job_id, contract_no, contract_type, parent_contract_no, status, billing_type, rate, period_qty, start_date, end_date, labor_amount, material_amount, total_amount, terms, items[] (มี line_total), installments[], files[] ({file_id, file_name, mime_type, size_bytes}), revision, submitted_at, updated_at, decided_at, decided_by_name, decision_note, cancelled_at, cancel_reason`
- `revision` เพิ่มขึ้นทุกครั้งที่แก้สัญญาที่ยัง pending

## สถานะสัญญา
- `pending` รอหอพักอนุมัติ → ไป `approved` / `rejected` / `cancelled` ได้
- `approved` อนุมัติแล้ว ช่างเริ่มงานได้ (แก้ไม่ได้อีก)
- `rejected` ไม่อนุมัติ เหตุผลอยู่ใน `decision_note` (ถ้าจะส่งใหม่ต้องใช้ `contract_no` ใหม่)
- `cancelled` ช่างยกเลิกเอง
- PUT / POST files / cancel ทำได้เฉพาะสัญญา `pending` หรือเลขที่ยังไม่มี ไม่งั้นได้ `409 CONTRACT_LOCKED`
- งานซ่อมที่ `done` / `rejected` / `cancelled` แล้ว ได้ `409 INVALID_JOB_STATUS`
- การอนุมัติ **ไม่เปลี่ยนสถานะงานซ่อม** — เมื่อเริ่มงานจริง ให้เรียก `PATCH /jobs/:id/status` เป็น `in_progress` ตามระบบเดิม

## ดึงผลอนุมัติ (ทำเป็นหลัก)
- เรียก `GET /contracts?updated_since=<ค่า>` ทุก 60 วินาที
- `updated_since` รับ ISO date-time หรือ unix milliseconds ไม่ส่ง = ทั้งหมด
- รอบถัดไปใช้ค่า `server_time` จาก response — **เก็บลง DB** ไม่ใช่ตัวแปรในหน่วยความจำ
- อาจได้รายการซ้ำบ้าง (เทียบระดับวินาที) ให้ upsert ด้วย key `job_id + contract_no` และอัปเดตเฉพาะเมื่อ `updated_at` ใหม่กว่าเดิม
- ถ้าได้ `429` ให้ข้ามรอบนั้น
- เมื่อสถานะเปลี่ยนเป็น `approved` / `rejected` ให้อัปเดตสัญญาใน RenoCare และแจ้งช่าง

## Webhook `contract.decided` (ไม่บังคับ)
หอพักจะ POST มาที่ Webhook URL ของ RenoCare (ถ้าตั้งไว้):
```
X-Repair-Event: contract.decided
X-Signature: sha256=<hex HMAC-SHA256(webhookSecret, raw body)>
X-API-Key: <apiKey ที่ RenoCare ให้หอพัก>

{ "event": "contract.decided", "sent_at": "...", "job_id": 41,
  "contract": { "contract_no": "CT2611-0002", "status": "approved",
                "decided_at": "...", "decided_by_name": "...", "decision_note": null } }
```
- ตรวจลายเซ็นจาก **raw body** (อ่าน body ดิบก่อน parse JSON) เทียบด้วย `crypto.timingSafeEqual`
- ลายเซ็นไม่ตรงตอบ 401, ตรงให้ตอบ 2xx ภายใน 5 วินาที แล้วค่อยประมวลผล
- หอพักไม่ส่งซ้ำอัตโนมัติ ดังนั้นต้องมีการดึงผลตามหัวข้อก่อนหน้าไว้ด้วยเสมอ

## จัดการ error
| HTTP / code | ทำอย่างไร |
|---|---|
| 400 VALIDATION_ERROR | ไม่ส่งซ้ำ แสดง `message` ให้ช่างแก้ |
| 401 INVALID_API_KEY | ไม่ส่งซ้ำ แจ้งแอดมินให้ติดต่อหอพัก |
| 404 NOT_FOUND | ไม่ส่งซ้ำ (งาน/สัญญาไม่มี หรือไม่ใช่ของ RenoCare) |
| 409 CONTRACT_LOCKED | ไม่ส่งซ้ำ ต้องออกเลขสัญญาใหม่ |
| 409 INVALID_JOB_STATUS | ไม่ส่งซ้ำ งานปิดแล้ว |
| 409 CONFLICT | ลองใหม่ 1 ครั้ง |
| 413 PAYLOAD_TOO_LARGE | ส่งใหม่แบบแยกไฟล์ผ่าน `POST .../files` |
| 429 RATE_LIMITED | รอตาม `Retry-After` แล้วลองใหม่ |
| 5xx / timeout | ลองใหม่แบบ exponential backoff (PUT ข้อมูลเดิมซ้ำได้ปลอดภัย) |

## สิ่งที่ต้องส่งมอบ
1. client module เรียก API หอพัก: `submitContract`, `uploadContractFiles`, `getContract`, `listJobContracts`, `cancelContract`, `downloadContractFile`, `pollContractChanges`
2. ฟังก์ชันแปลงสัญญาของ RenoCare เป็น body ตามสเปก พร้อมคำนวณยอดเงินด้วย round2 และตรวจกติกาก่อนส่ง (จะได้ไม่โดน 400)
3. เก็บผลจากหอพักลง DB: `dorm_job_id`, `contract_no`, `status`, `revision`, `decided_at`, `decided_by_name`, `decision_note`, `synced_at` และเก็บ `updated_since` ล่าสุด
4. งานดึงผลทุก 60 วินาที (cron / setInterval / queue ตามที่ระบบใช้อยู่)
5. (ถ้ามี URL สาธารณะ) endpoint รับ webhook พร้อมตรวจลายเซ็น
6. เทสต์อัตโนมัติ: การคำนวณยอดเงิน, การ map error code, การตรวจลายเซ็น webhook, การ upsert ผลซ้ำ
7. สรุปไฟล์ที่แก้/สร้าง และ env ที่ต้องตั้ง (`DORM_BASE_URL`, `DORM_API_KEY`, `DORM_WEBHOOK_SECRET` ถ้ามี webhook)

## ทดสอบกับของจริงก่อนเปิดใช้
1. PUT สัญญาให้งานซ่อมจริง 1 งาน → ได้ 201, status `pending`, revision 1
2. PUT ซ้ำเลขเดิมโดยแก้ terms → ได้ 200, revision 2
3. อัปไฟล์ PDF ผ่าน `POST .../files` → ได้ 201, มีไฟล์ใน `files`
4. ให้หอพักกดอนุมัติ → รอบดึงผลถัดไปต้องเห็น `approved` และ RenoCare อัปเดตตาม
5. ลอง PUT สัญญาที่อนุมัติแล้ว → ต้องได้ 409 CONTRACT_LOCKED และระบบจัดการถูก
