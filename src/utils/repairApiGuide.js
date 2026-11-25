import { fileStamp, saveBlob } from './marketApiGuide.js'

export const REPAIR_GUIDE_TITLE = 'คู่มือใช้งาน Repair API สำหรับช่างที่ทำสัญญาซ่อม'
export const REPAIR_GUIDE_VERSION = 'API v1'
export const REPAIR_GUIDE_FILE = 'repair-api-guide'

export const REPAIR_GUIDE_RULES = [
  '1 API key ผูกกับช่าง/บริษัทที่ทำสัญญาซ่อม 1 ราย และเห็นได้เฉพาะงานที่หอพักส่งให้รายนั้น',
  'ข้อมูลงานซ่อม (เลขห้อง รายละเอียดความเสียหาย เบอร์ติดต่อ) เป็นแบบอ่านอย่างเดียว หอพักแก้ไขได้ระหว่างที่งานยังไม่ปิด ดูเวลาแก้ล่าสุดได้จาก details_updated_at',
  'สิ่งที่ทำได้คือเปลี่ยนสถานะงาน พร้อมแนบหมายเหตุ ชื่อช่างที่ไปซ่อม และวันเวลานัดหมาย',
  'เมื่อสัญญาหมดอายุ ถูกปิดการใช้งาน หรือ key ถูกยกเลิก จะเรียก API ไม่ได้ทันที',
  'เรียกได้สูงสุด 120 ครั้งต่อนาทีต่อ key',
  'ส่ง key ใน header X-Repair-Api-Key หรือ X-API-Key ก็ได้ (ระบบภายนอกเช่น RenoCare ใช้ X-API-Key)',
]

export const REPAIR_GUIDE_ENDPOINTS = [
  { method: 'GET', path: '/vendor', access: 'อ่าน', detail: 'ข้อมูลช่าง สัญญาซ่อม ค่าสัญญาที่เรียกเก็บจากหอพัก และจำนวนงานแยกตามสถานะ' },
  { method: 'GET', path: '/jobs?status=', access: 'อ่าน', detail: 'รายการงานซ่อมที่ได้รับ กรองตามสถานะได้ (ล่าสุด 200 งาน)' },
  { method: 'GET', path: '/jobs/:id', access: 'อ่าน', detail: 'รายละเอียดงานซ่อม 1 งาน' },
  { method: 'GET', path: '/buildings/:ref/owner', access: 'อ่าน', detail: 'ชื่อ เบอร์ และอีเมลเจ้าของหอ ใช้ได้เฉพาะช่างที่หอพักตั้งรหัสอาคารให้แล้ว' },
  { method: 'PATCH', path: '/jobs/:id/status', access: 'แก้ไข', detail: 'เปลี่ยนสถานะงาน (ใช้ PUT ได้)' },
]

export const REPAIR_STATUS_FLOW = [
  { status: 'sent', label: 'รอช่างตอบรับ', by: 'หอพักส่งงาน', next: ['accepted', 'rejected'] },
  { status: 'accepted', label: 'รับงานแล้ว', by: 'ช่าง', next: ['in_progress', 'done'] },
  { status: 'in_progress', label: 'กำลังซ่อม', by: 'ช่าง', next: ['done'] },
  { status: 'done', label: 'ซ่อมเสร็จ', by: 'ช่าง', next: [] },
  { status: 'rejected', label: 'ปฏิเสธงาน', by: 'ช่าง (ต้องมี note)', next: [] },
  { status: 'cancelled', label: 'ยกเลิก', by: 'หอพัก', next: [] },
]

export const REPAIR_STATUS_FIELDS = [
  { name: 'status', type: 'accepted | rejected | in_progress | done', note: 'จำเป็น ต้องเป็นขั้นถัดไปที่ทำได้' },
  { name: 'note', type: 'ข้อความ ≤ 500', note: 'หมายเหตุถึงหอพัก จำเป็นเมื่อ status = rejected' },
  { name: 'technician_name', type: 'ข้อความ ≤ 150', note: 'ชื่อช่างที่จะเข้าไปซ่อม ส่ง null เพื่อล้าง' },
  { name: 'technician_phone', type: 'เบอร์โทร', note: 'เบอร์ช่างที่จะเข้าไปซ่อม รับ 081-234-5678 หรือ +6681... ได้ ส่ง null เพื่อล้าง' },
  { name: 'scheduled_at', type: 'YYYY-MM-DDTHH:mm', note: 'วันเวลานัดเข้าซ่อม ส่ง null เพื่อล้าง' },
]

export const REPAIR_GUIDE_ERRORS = [
  ['401 INVALID_API_KEY', 'ไม่มี key, key ผิด, ถูกยกเลิก หรือสัญญาซ่อมไม่อยู่ในช่วงใช้งาน'],
  ['403 READ_ONLY', 'พยายามแก้ไขข้อมูลงานหรือข้อมูลช่างโดยตรง'],
  ['400 VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง เช่น status ไม่รู้จัก หรือปฏิเสธงานโดยไม่ใส่ note'],
  ['400 FIELD_NOT_ALLOWED', 'ส่งฟิลด์อื่นนอกจาก status, note, technician_name, technician_phone, scheduled_at'],
  ['404 NOT_FOUND', 'ไม่พบงาน หรือเป็นงานของช่างรายอื่น'],
  ['409 INVALID_TRANSITION', 'เปลี่ยนข้ามขั้นไม่ได้ เช่น จาก sent ไป done หรืองานถูกยกเลิกไปแล้ว'],
  ['429 RATE_LIMITED', 'เรียกเกิน 120 ครั้ง/นาที ต่อ key (ดู header Retry-After)'],
]

function curl(base, method, path, body) {
  const lines = [`curl${method === 'GET' ? '' : ` -X ${method}`} "${base}${path}"`, '  -H "X-Repair-Api-Key: <API_KEY>"']
  if (body) lines.push('  -H "Content-Type: application/json"', `  -d '${JSON.stringify(body)}'`)
  return lines.join(' \\\n')
}

const json = (value) => JSON.stringify(value, null, 2)

const SAMPLE_JOB = {
  id: 41, room_number: 305, category: 'aircon', urgency: 'urgent', description: 'แอร์ไม่เย็น มีน้ำหยดจากตัวเครื่อง',
  contact_phone: '0812345678', preferred_time: 'afternoon', status: 'sent', technician_name: null, technician_phone: null, external_ref: null, scheduled_at: null,
  vendor_note: null, cancel_reason: null, sent_by_name: 'สมชาย ใจดี', created_at: '2026-10-26T03:15:00.000Z',
  accepted_at: null, started_at: null, completed_at: null, cancelled_at: null, status_updated_at: '2026-10-26T03:15:00.000Z',
}

export const REPAIR_WEBHOOK_SAMPLE = json({ event: 'job.created', sent_at: '2026-10-26T03:15:01.000Z', job: SAMPLE_JOB })

export function repairGuideExamples(base) {
  return [
    {
      id: 'vendor', method: 'GET', path: '/vendor', title: 'ดูสัญญาและค่าสัญญา', status: 200,
      description: 'ข้อมูลสัญญาซ่อม และค่าสัญญาที่เรียกเก็บจากหอพัก (contract_fee ต่อ contract_fee_period)',
      code: curl(base, 'GET', '/vendor'),
      response: json({
        vendor: {
          name: 'ช่างแอร์บ้านสบาย', contact_name: 'คุณสมศักดิ์', phone: '0812345678', email: null,
          specialties: ['aircon', 'electrical'], specialty_other: null, contract_type: 'monthly',
          contract_start: '2026-10-01', contract_end: '2026-10-31', contract_fee: 3000, contract_fee_period: 'month',
        },
        job_summary: { sent: 1, accepted: 0, in_progress: 0, done: 4, rejected: 0, cancelled: 0 },
      }),
    },
    {
      id: 'jobs', method: 'GET', path: '/jobs?status=sent', title: 'ดึงงานใหม่ที่รอตอบรับ', status: 200,
      description: 'เรียกเป็นระยะ (เช่น ทุก 1-5 นาที) เพื่อดูงานที่หอพักส่งมา',
      code: curl(base, 'GET', '/jobs?status=sent'),
      response: json({ jobs: [SAMPLE_JOB] }),
    },
    {
      id: 'accept', method: 'PATCH', path: '/jobs/41/status', title: 'รับงานและนัดเวลา', status: 200,
      description: 'ตอบรับงาน พร้อมระบุชื่อช่างและวันเวลาเข้าซ่อม สถานะฝั่งหอพักจะเปลี่ยนทันที',
      code: curl(base, 'PATCH', '/jobs/41/status', { status: 'accepted', technician_name: 'ช่างเอ', scheduled_at: '2026-10-27T13:00', note: 'นำน้ำยาแอร์ไปด้วย' }),
      response: json({ message: 'อัปเดตสถานะงานซ่อมเรียบร้อยแล้ว', job: { ...SAMPLE_JOB, status: 'accepted', technician_name: 'ช่างเอ', scheduled_at: '2026-10-27T06:00:00.000Z', vendor_note: 'นำน้ำยาแอร์ไปด้วย', accepted_at: '2026-10-26T03:20:00.000Z' } }),
    },
    {
      id: 'start', method: 'PATCH', path: '/jobs/41/status', title: 'เริ่มซ่อม', status: 200,
      description: 'แจ้งว่าช่างเข้าหน้างานแล้ว',
      code: curl(base, 'PATCH', '/jobs/41/status', { status: 'in_progress' }),
      response: json({ message: 'อัปเดตสถานะงานซ่อมเรียบร้อยแล้ว', job: { ...SAMPLE_JOB, status: 'in_progress', started_at: '2026-10-27T06:05:00.000Z' } }),
    },
    {
      id: 'done', method: 'PATCH', path: '/jobs/41/status', title: 'ปิดงานซ่อมเสร็จ', status: 200,
      description: 'ถ้างานนี้มาจากแจ้งซ่อมของผู้เช่า รายการแจ้งซ่อมจะถูกปิดเป็นเสร็จสิ้นให้อัตโนมัติ',
      code: curl(base, 'PATCH', '/jobs/41/status', { status: 'done', note: 'เติมน้ำยาและล้างท่อน้ำทิ้งแล้ว' }),
      response: json({ message: 'อัปเดตสถานะงานซ่อมเรียบร้อยแล้ว', job: { ...SAMPLE_JOB, status: 'done', vendor_note: 'เติมน้ำยาและล้างท่อน้ำทิ้งแล้ว', completed_at: '2026-10-27T07:10:00.000Z' } }),
    },
    {
      id: 'reject', method: 'PATCH', path: '/jobs/41/status', title: 'ปฏิเสธงาน', status: 200,
      description: 'ต้องใส่เหตุผลใน note หอพักจะส่งงานให้ช่างรายอื่นแทน',
      code: curl(base, 'PATCH', '/jobs/41/status', { status: 'rejected', note: 'ช่างไม่ว่างจนถึงสิ้นเดือน' }),
      response: json({ message: 'อัปเดตสถานะงานซ่อมเรียบร้อยแล้ว', job: { ...SAMPLE_JOB, status: 'rejected', vendor_note: 'ช่างไม่ว่างจนถึงสิ้นเดือน' } }),
    },
    {
      id: 'error', method: 'PATCH', path: '/jobs/41/status', title: 'ตัวอย่างข้อผิดพลาด', status: 409,
      description: 'เปลี่ยนสถานะข้ามขั้น เช่น ปิดงานโดยยังไม่ได้รับงาน',
      code: curl(base, 'PATCH', '/jobs/41/status', { status: 'done' }),
      response: json({ code: 'INVALID_TRANSITION', message: 'เปลี่ยนสถานะจาก sent เป็น done ไม่ได้' }),
    },
  ]
}

export function repairClientSamples(base) {
  return [
    {
      id: 'node',
      title: 'Node.js (axios)',
      setup: ['npm install axios', 'REPAIR_API_KEY=<API_KEY> node repair.mjs'],
      code: [
        'import axios from "axios"',
        '',
        'const repair = axios.create({',
        `  baseURL: "${base}",`,
        '  headers: { "X-Repair-Api-Key": process.env.REPAIR_API_KEY },',
        '  timeout: 10000,',
        '})',
        '',
        'try {',
        '  const { data } = await repair.get("/jobs", { params: { status: "sent" } })',
        '  for (const job of data.jobs) {',
        '    console.log(`งานใหม่ห้อง ${job.room_number}: ${job.description}`)',
        '    await repair.patch(`/jobs/${job.id}/status`, {',
        '      status: "accepted",',
        '      technician_name: "ช่างเอ",',
        '      scheduled_at: "2026-12-01T13:00",',
        '    })',
        '  }',
        '} catch (error) {',
        '  const { status, data } = error.response ?? {}',
        '  console.error(status, data?.code, data?.message ?? error.message)',
        '  process.exitCode = 1',
        '}',
      ].join('\n'),
    },
    {
      id: 'python',
      title: 'Python (requests)',
      code: [
        'import os',
        'import requests',
        '',
        `BASE_URL = "${base}"`,
        'HEADERS = {"X-Repair-Api-Key": os.environ["REPAIR_API_KEY"]}',
        '',
        'jobs = requests.get(f"{BASE_URL}/jobs", params={"status": "sent"}, headers=HEADERS, timeout=10).json()["jobs"]',
        'for job in jobs:',
        '    print(f"งานใหม่ห้อง {job[\'room_number\']}: {job[\'description\']}")',
        '    response = requests.patch(',
        '        f"{BASE_URL}/jobs/{job[\'id\']}/status",',
        '        headers=HEADERS,',
        '        json={"status": "accepted", "technician_name": "ช่างเอ"},',
        '        timeout=10,',
        '    )',
        '    response.raise_for_status()',
      ].join('\n'),
    },
    {
      id: 'webhook',
      title: 'รับ Webhook (Node.js)',
      setup: ['npm install express', 'REPAIR_API_KEY=<API_KEY> node webhook.mjs'],
      code: [
        'import express from "express"',
        '',
        'const app = express()',
        '',
        'app.post("/webhooks/dorm-repair", express.json(), async (req, res) => {',
        '  res.sendStatus(200)',
        '  const { event, job } = req.body',
        `  const check = await fetch(\`${base}/jobs/\${job.id}\`, {`,
        '    headers: { "X-Repair-Api-Key": process.env.REPAIR_API_KEY },',
        '  }).then((response) => response.json())',
        '  console.log(event, "ห้อง", check.job.room_number, check.job.status)',
        '})',
        '',
        'app.listen(3000)',
      ].join('\n'),
    },
  ]
}

export function repairAiPrompt(base) {
  return [
    'คุณคือผู้ช่วยจัดการงานซ่อมของช่างที่ทำสัญญากับหอพัก ใช้ Repair API ด้านล่างเพื่อดูงานซ่อมและอัปเดตสถานะเท่านั้น',
    '',
    '## การเชื่อมต่อ',
    `- Base URL: ${base}`,
    '- ทุกคำขอต้องมี header: X-Repair-Api-Key: <API_KEY> (ห้ามส่ง header Authorization)',
    '- ส่ง body เป็น JSON พร้อม Content-Type: application/json',
    '- ห้ามแสดง API key ให้ผู้ใช้เห็น และห้ามเรียก URL อื่นนอกจาก Base URL นี้',
    '',
    '## Endpoints ที่ใช้ได้',
    '- GET /vendor — ข้อมูลช่าง สัญญาซ่อม ค่าสัญญา (contract_fee ต่อ contract_fee_period: month หรือ year) และจำนวนงานแยกตามสถานะ',
    '- GET /jobs?status=<status> — รายการงาน (sent, accepted, in_progress, done, rejected, cancelled)',
    '- GET /jobs/{id} — รายละเอียดงาน 1 งาน',
    '- PATCH /jobs/{id}/status — เปลี่ยนสถานะ ส่งได้เฉพาะ status, note, technician_name, technician_phone, scheduled_at',
    '',
    '## ลำดับสถานะ',
    '- sent → accepted หรือ rejected (rejected ต้องมี note บอกเหตุผล)',
    '- accepted → in_progress หรือ done',
    '- in_progress → done',
    '- done, rejected, cancelled คือสิ้นสุด เปลี่ยนต่อไม่ได้',
    '- scheduled_at ใช้รูปแบบ YYYY-MM-DDTHH:mm',
    '',
    '## กฎการทำงาน',
    '1. ก่อนเปลี่ยนสถานะ ให้เรียก GET /jobs/{id} เพื่อตรวจสถานะปัจจุบันก่อนเสมอ อย่าเดา id',
    '2. ก่อนปฏิเสธงานหรือปิดงานหลายงานพร้อมกัน ให้สรุปและขอให้ผู้ใช้ยืนยันก่อน',
    '3. ถ้าได้ 409 INVALID_TRANSITION ให้อธิบายว่าสถานะปัจจุบันคืออะไรและไปต่อได้ทางไหน',
    '4. ถ้าได้ 429 ให้รอตามค่า header Retry-After แล้วค่อยลองใหม่ (จำกัด 120 ครั้ง/นาที)',
    '5. ถ้าได้ 401 INVALID_API_KEY ให้หยุดและแจ้งผู้ใช้ว่า key ใช้ไม่ได้หรือสัญญาสิ้นสุดแล้ว',
    '6. ข้อมูลงาน (เลขห้อง รายละเอียด เบอร์ติดต่อ) แก้ผ่าน API ไม่ได้ ให้แนะนำผู้ใช้ติดต่อหอพัก',
    '',
    '## รูปแบบคำตอบ',
    '- ตอบเป็นภาษาไทย สรุปสั้น ๆ เช่น งาน #41 ห้อง 305 เปลี่ยนเป็น รับงานแล้ว นัด 1 ธ.ค. 13:00',
    '- แสดงรายการงานเป็นตาราง: id | ห้อง | ประเภท | ด่วน | สถานะ | นัดหมาย',
  ].join('\n')
}

// ---------- partner systems that push webhooks back to us (RenoCare) ----------
export const PARTNER_REF_PLACEHOLDER = '<BUILDING_REF>'

export function partnerWebhookUrl(origin, webhookPrefix, ref = PARTNER_REF_PLACEHOLDER) {
  return `${origin}${webhookPrefix}/renocare/${ref}`
}

export const PARTNER_EXCHANGE = [
  { from: 'หอพักส่งให้ RenoCare', items: ['Base URL', 'API Key (rpk_...) ออกจากหน้ารายละเอียดช่าง', 'Webhook URL ที่มีรหัสอาคารต่อท้าย'] },
  { from: 'RenoCare ส่งให้หอพัก', items: ['webhookSecret ใช้เซ็น X-Signature ทั้งสองทาง', 'apiKey ที่หอพักแนบไปใน X-API-Key ตอนส่ง webhook ให้ RenoCare', 'URL รับ webhook ของ RenoCare (ใส่ในช่อง Webhook URL ของข้อมูลช่าง)'] },
]

export const PARTNER_INBOUND_SAMPLE = json({
  event_id: 'rc-evt-000123',
  job_id: 41,
  external_ref: 'RC-2026-0042',
  status: 'in_progress',
  technician: { name: 'ช่างสมชาย', phone: '081-234-5678' },
  scheduled_at: '2026-10-27T13:00',
  note: 'ช่างกำลังเดินทาง',
})

export const PARTNER_INBOUND_FIELDS = [
  { name: 'job_id', type: 'ตัวเลข', note: 'id งานที่หอพักส่งไปใน job.created (หรือส่ง external_ref อย่างเดียวถ้าเคยส่งไปแล้ว)' },
  { name: 'event_id', type: 'ข้อความ ≤ 200', note: 'ไม่ซ้ำกันต่อเหตุการณ์ ส่งซ้ำด้วย id เดิมได้ปลอดภัย ระบบจะตอบ duplicate' },
  { name: 'status', type: 'accepted | in_progress | done | rejected', note: 'รับ assigned, started, completed, declined ได้ ถ้าไม่ส่งแต่มีข้อมูลช่าง งานที่ยัง sent จะเป็น accepted' },
  { name: 'technician.name / technician.phone', type: 'ข้อความ / เบอร์โทร', note: 'หรือส่ง technician_name, technician_phone ไว้ระดับบนก็ได้' },
  { name: 'external_ref', type: 'ข้อความ ≤ 100', note: 'เลขงานฝั่ง RenoCare หอพักเก็บไว้อ้างอิง' },
  { name: 'scheduled_at', type: 'YYYY-MM-DDTHH:mm', note: 'วันเวลานัดเข้าซ่อม' },
  { name: 'note', type: 'ข้อความ ≤ 500', note: 'หมายเหตุถึงหอพัก (ถ้า rejected แล้วไม่ใส่ ระบบเติมให้)' },
]

export const PARTNER_INBOUND_RESPONSES = [
  ['200', 'สำเร็จ { received, job_id, status, changed } หรือเคยรับ event_id นี้แล้ว { received, duplicate: true }'],
  ['400 VALIDATION_ERROR', 'JSON เสีย ไม่มี job_id/external_ref หรือ status/เบอร์ไม่ถูกต้อง แก้แล้วค่อยส่งใหม่'],
  ['401 INVALID_SIGNATURE', 'X-Signature ไม่ตรง ตรวจว่า HMAC คำนวณจาก body ชุดเดียวกับที่ส่งจริง'],
  ['404 NOT_FOUND', 'รหัสอาคารใน URL ผิด หรือ job_id ไม่ใช่งานของ RenoCare'],
  ['409 INVALID_TRANSITION', 'งานปิดไปแล้ว (done, rejected, cancelled) เปลี่ยนต่อไม่ได้'],
  ['5xx / timeout', 'ส่งใหม่ด้วย event_id เดิม'],
]

export function partnerSignSample() {
  return [
    "import { createHmac } from 'node:crypto'",
    '',
    'const body = JSON.stringify(payload) // เซ็นจาก string นี้ แล้วส่ง string เดียวกันนี้',
    "const signature = 'sha256=' + createHmac('sha256', process.env.WEBHOOK_SECRET).update(body).digest('hex')",
    '',
    'await fetch(process.env.DORM_WEBHOOK_URL, {',
    "  method: 'POST',",
    "  headers: { 'Content-Type': 'application/json', 'X-Signature': signature },",
    '  body,',
    '})',
  ].join('\n')
}

export function partnerIntegrationPrompt(base, webhookUrl) {
  return [
    'คุณคือนักพัฒนาที่ต้องเชื่อมระบบ RenoCare (ระบบจัดการช่างซ่อม) เข้ากับระบบหอพัก ช่วยเขียนโค้ดฝั่ง RenoCare ให้ครบตามสเปกด้านล่าง ถ้าไม่รู้ว่าโปรเจกต์ใช้ภาษาหรือเฟรมเวิร์กอะไร ให้ถามฉันก่อน',
    '',
    '## ค่าที่ได้จากหอพัก (เก็บใน environment variable ห้าม hardcode)',
    `- DORM_BASE_URL = ${base}`,
    '- DORM_API_KEY = <API key ที่หอพักออกให้ ขึ้นต้นด้วย rpk_>',
    `- DORM_WEBHOOK_URL = ${webhookUrl}`,
    `- DORM_BUILDING_REF = ${PARTNER_REF_PLACEHOLDER} (รหัสอาคาร ตัวเดียวกับที่อยู่ท้าย DORM_WEBHOOK_URL)`,
    '- WEBHOOK_SECRET = <secret ที่ RenoCare สร้างเองแล้วส่งให้หอพัก ใช้เซ็นทั้งสองทาง>',
    '- RENOCARE_API_KEY = <key ที่ RenoCare ส่งให้หอพัก หอพักจะแนบมาใน X-API-Key ตอนส่ง webhook>',
    '',
    '## 1. ดึงข้อมูลเจ้าของหอ',
    '- GET {DORM_BASE_URL}/buildings/{DORM_BUILDING_REF}/owner',
    '- header: X-API-Key: {DORM_API_KEY}',
    '- ตอบกลับ 200: { "name": "...", "phone": "...", "email": "..." หรือ null }',
    '- 401 = key ผิดหรือสัญญาหมด, 404 = รหัสอาคารผิด, 429 = เรียกเกิน 120 ครั้ง/นาที (รอตาม header Retry-After)',
    '',
    '## 2. รับงานซ่อมจากหอพัก (webhook ขาเข้าของ RenoCare)',
    '- สร้าง endpoint POST เช่น /webhooks/dorm แล้วส่ง URL นี้ให้หอพัก',
    '- หอพักส่งมาเมื่อ X-Repair-Event เป็น job.created (งานใหม่หรือกดส่งซ้ำ), job.updated (แก้รายละเอียด), job.cancelled (ยกเลิกงาน)',
    '- header ที่มากับคำขอ: X-Signature: sha256=<hex> และ X-API-Key: {RENOCARE_API_KEY}',
    '- ต้องอ่าน raw body ก่อน parse JSON แล้วคำนวณ "sha256=" + HMAC-SHA256(WEBHOOK_SECRET, raw body) เป็น hex เทียบกับ X-Signature แบบ constant-time ถ้าไม่ตรง หรือ X-API-Key ไม่ตรง ให้ตอบ 401',
    '- ต้องตอบ 2xx ภายใน 5 วินาที (บันทึกงานก่อน แล้วค่อยประมวลผลต่อแบบ async)',
    '- body: { "event": "job.created", "sent_at": "ISO datetime", "job": { "id", "room_number", "category", "urgency", "description", "contact_phone", "preferred_time", "status", "technician_name", "technician_phone", "external_ref", "scheduled_at", "vendor_note", "cancel_reason", "created_at", ... } }',
    '- เก็บ job.id ไว้ เพราะต้องใช้เป็น job_id ตอนส่งสถานะกลับ งานเดียวกันอาจถูกส่งมาซ้ำได้ ให้ upsert ตาม job.id',
    '',
    '## 3. ส่งข้อมูลช่างและสถานะกลับไปหอพัก (webhook ขาออกของ RenoCare)',
    '- POST {DORM_WEBHOOK_URL}',
    '- header: Content-Type: application/json และ X-Signature: sha256=<hex HMAC-SHA256(WEBHOOK_SECRET, body)>',
    '- เซ็นจาก string ของ body ที่จะส่งจริง ห้าม stringify ใหม่หลังเซ็น ไม่งั้นลายเซ็นจะไม่ตรง',
    '- body:',
    '  { "event_id": "<id ไม่ซ้ำต่อเหตุการณ์>", "job_id": <job.id ที่ได้จากหอพัก>, "external_ref": "<เลขงานของ RenoCare>",',
    '    "status": "accepted | in_progress | done | rejected", "technician": { "name": "...", "phone": "0812345678" },',
    '    "scheduled_at": "YYYY-MM-DDTHH:mm", "note": "..." }',
    '- ส่งเมื่อ: มอบหมายช่าง (accepted พร้อม technician), ช่างเริ่มงาน (in_progress), ซ่อมเสร็จ (done), ไม่รับงาน (rejected พร้อม note)',
    '- ลำดับสถานะของหอพัก: sent → accepted → in_progress → done ถ้าส่ง in_progress หรือ done มาเลย ระบบหอพักจะผ่าน accepted ให้เอง',
    '- ผลตอบกลับ:',
    '  - 200 { received, job_id, status, changed } = สำเร็จ, 200 { received, duplicate: true } = เคยรับ event_id นี้แล้ว',
    '  - 400 = ข้อมูลผิด ห้ามส่งซ้ำ ให้ log ไว้แล้วแก้, 401 = ลายเซ็นผิด, 404 = job_id หรือรหัสอาคารผิด',
    '  - 409 = งานปิดไปแล้ว (done, rejected, cancelled) ห้ามส่งซ้ำ',
    '  - 5xx หรือ timeout = retry แบบ backoff (เช่น 1, 5, 30 นาที) ด้วย event_id เดิม',
    '',
    '## สิ่งที่ต้องส่งมอบ',
    '1. ฟังก์ชันเรียก owner endpoint',
    '2. endpoint รับ webhook จากหอพัก พร้อมตรวจลายเซ็นและ X-API-Key',
    '3. ฟังก์ชันส่งสถานะกลับ พร้อมเซ็นและ retry',
    '4. unit test: ลายเซ็นถูกและผิด, body ถูกแก้ระหว่างทาง, ส่งซ้ำด้วย event_id เดิม, การจัดการ 400/401/404/409/5xx',
    '5. วิธีทดสอบกับระบบจริง: ส่ง payload ตัวอย่างไปที่ DORM_WEBHOOK_URL แล้วให้หอพักดูผลในหน้าข้อมูลช่าง',
  ].join('\n')
}

export async function downloadRepairGuideDocx(base) {
  const {
    AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  } = await import('docx')
  const FONT = 'Tahoma'
  const MONO = 'Consolas'
  const text = (value, options = {}) => new TextRun({ text: value, font: FONT, size: 21, ...options })
  const para = (children, options = {}) => new Paragraph({ spacing: { after: 120, line: 300 }, children: Array.isArray(children) ? children : [text(children)], ...options })
  const heading = (value) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [text(value, { bold: true, size: 28, color: '14365C' })] })
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'DCE9FB' }
  const cell = (value, { header = false, mono = false, width } = {}) => new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { type: ShadingType.CLEAR, fill: 'EFF6FF', color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    borders: { top: border, bottom: border, left: border, right: border },
    children: [new Paragraph({ children: [new TextRun({ text: value, font: mono ? MONO : FONT, size: 19, bold: header, color: header ? '1D4ED8' : '0F2B52' })] })],
  })
  const table = (headers, rows, widths, monoColumns = []) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((value, index) => cell(value, { header: true, width: widths[index] })) }),
      ...rows.map((row) => new TableRow({ children: row.map((value, index) => cell(value, { mono: monoColumns.includes(index), width: widths[index] })) })),
    ],
  })
  const codeBlock = (code) => code.split('\n').map((line, index, lines) => new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: 'F5F9FF', color: 'auto' },
    spacing: { after: index === lines.length - 1 ? 160 : 0 },
    children: [new TextRun({ text: line || ' ', font: MONO, size: 18, color: '0F2B52' })],
  }))

  const doc = new Document({
    creator: 'ระบบติดต่อช่างซ่อมของหอพัก',
    title: REPAIR_GUIDE_TITLE,
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children: [
        new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 60 }, children: [text(REPAIR_GUIDE_TITLE, { bold: true, size: 36, color: '14365C' })] }),
        para([text(`${REPAIR_GUIDE_VERSION} · ปรับปรุงล่าสุด ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`, { color: '6B859E', size: 19 })]),
        heading('1. ภาพรวมและสิทธิ์การเข้าถึง'),
        ...REPAIR_GUIDE_RULES.map((rule) => para(`• ${rule}`)),
        heading('2. การเชื่อมต่อ'),
        para([text('Base URL: ', { bold: true }), new TextRun({ text: base, font: MONO, size: 20, color: '1D4ED8' })]),
        para([text('Header: ', { bold: true }), new TextRun({ text: 'X-Repair-Api-Key: <API_KEY>', font: MONO, size: 20, color: '1D4ED8' })]),
        para('แทน <API_KEY> ด้วย key ที่ได้รับจากเจ้าหน้าที่หอพัก ห้ามส่ง header Authorization มาด้วย ส่งข้อมูลเป็น JSON และใส่ Content-Type: application/json เมื่อมี body'),
        heading('3. ลำดับสถานะงาน'),
        table(['status', 'ความหมาย', 'ผู้เปลี่ยน', 'ไปต่อได้'], REPAIR_STATUS_FLOW.map((step) => [step.status, step.label, step.by, step.next.length ? step.next.join(', ') : 'สิ้นสุด']), [18, 24, 24, 34], [0, 3]),
        heading('4. Endpoints'),
        table(['Method', 'Path', 'สิทธิ์', 'รายละเอียด'], REPAIR_GUIDE_ENDPOINTS.map((item) => [item.method, item.path, item.access, item.detail]), [12, 28, 12, 48], [0, 1]),
        heading('5. ฟิลด์ใน PATCH /jobs/:id/status'),
        para('ส่งได้เฉพาะฟิลด์ด้านล่าง ถ้าส่งฟิลด์อื่นจะได้ 400 FIELD_NOT_ALLOWED'),
        table(['ฟิลด์', 'ชนิดข้อมูล', 'หมายเหตุ'], REPAIR_STATUS_FIELDS.map((item) => [item.name, item.type, item.note]), [22, 34, 44], [0]),
        heading('6. ตัวอย่างการเรียกใช้งาน'),
        para('ทุกตัวอย่างใช้ cURL แทน <API_KEY> ด้วย key จริง และแทน id งานด้วยค่าที่ได้จาก GET /jobs'),
        ...repairGuideExamples(base).flatMap((example) => [
          para([text(`${example.method} ${example.path} — ${example.title}`, { bold: true, color: '1D4ED8' })]),
          para([text(example.description, { color: '6B859E', size: 19 })]),
          para([text('Request', { bold: true, size: 19 })]),
          ...codeBlock(example.code),
          para([text(`Response (${example.status})`, { bold: true, size: 19 })]),
          ...codeBlock(example.response),
        ]),
        heading('ตัวอย่างโค้ดเรียกใช้งาน'),
        ...repairClientSamples(base).flatMap((sample) => [
          para([text(sample.title, { bold: true })]),
          ...(sample.setup ? [para(`ต้องใช้ Node.js 18 ขึ้นไป · ติดตั้ง ${sample.setup[0]} · รัน ${sample.setup[1]}`)] : []),
          ...codeBlock(sample.code),
        ]),
        heading('7. Webhook (ไม่บังคับ)'),
        para('ถ้าหอพักตั้ง Webhook URL ให้ เมื่อหอพักส่งงาน แก้ไขงาน หรือยกเลิกงาน ระบบจะ POST JSON ไปที่ URL นั้น พร้อม header X-Repair-Event: job.created, job.updated หรือ job.cancelled ต้องตอบ HTTP 2xx ภายใน 5 วินาที แล้วยืนยันข้อมูลอีกครั้งด้วย GET /jobs/:id'),
        ...codeBlock(REPAIR_WEBHOOK_SAMPLE),
        heading('8. รหัสข้อผิดพลาด'),
        para('เมื่อเกิดข้อผิดพลาด API จะตอบกลับเป็น JSON รูปแบบ { "code": "...", "message": "..." }'),
        table(['รหัส', 'ความหมาย'], REPAIR_GUIDE_ERRORS, [35, 65], [0]),
        heading('9. Prompt สำหรับให้ AI ใช้งาน API'),
        para('คัดลอกข้อความด้านล่างไปใส่เป็น system prompt ของ AI แล้วให้ AI เรียก API แทนคุณ อย่าใส่ API key จริงลงใน prompt'),
        ...codeBlock(repairAiPrompt(base)),
      ],
    }],
  })
  saveBlob(await Packer.toBlob(doc), `${REPAIR_GUIDE_FILE}-${fileStamp()}.docx`)
}
