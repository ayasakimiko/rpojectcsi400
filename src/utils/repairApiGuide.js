import { fileStamp, saveBlob } from './marketApiGuide.js'

export const REPAIR_GUIDE_TITLE = 'คู่มือใช้งาน Repair API สำหรับช่างที่ทำสัญญาซ่อม'
export const REPAIR_GUIDE_VERSION = 'API v1'
export const REPAIR_GUIDE_FILE = 'repair-api-guide'

export const REPAIR_GUIDE_RULES = [
  '1 API key ผูกกับช่าง/บริษัทที่ทำสัญญาซ่อม 1 ราย และเห็นได้เฉพาะงานที่หอพักส่งให้รายนั้น',
  'ข้อมูลงานซ่อม (เลขห้อง รายละเอียดความเสียหาย เบอร์ติดต่อ) เป็นแบบอ่านอย่างเดียว หอพักแก้ไขได้ระหว่างที่งานยังไม่ปิด ดูเวลาแก้ล่าสุดได้จาก details_updated_at',
  'สิ่งที่ทำได้คือเปลี่ยนสถานะงาน พร้อมแนบหมายเหตุ ชื่อช่างที่ไปซ่อม และวันเวลานัดหมาย',
  'ข้อมูลช่างและสัญญา (ชื่อ เบอร์ อีเมล ประเภทงาน รูปแบบสัญญา วันเริ่ม-สิ้นสุด ค่าสัญญา) แก้โดยตรงไม่ได้ ให้ส่งคำขอแก้ไขแล้วรอหอพักอนุมัติ ข้อมูลจะเปลี่ยนหลังอนุมัติเท่านั้น',
  'เมื่อสัญญาหมดอายุ ถูกปิดการใช้งาน หรือ key ถูกยกเลิก จะเรียก API ไม่ได้ทันที',
  'เรียกได้สูงสุด 120 ครั้งต่อนาทีต่อ key',
  'ส่ง key ใน header X-Repair-Api-Key หรือ X-API-Key ก็ได้ (ระบบภายนอกเช่น RenoCare ใช้ X-API-Key)',
]

export const REPAIR_GUIDE_ENDPOINTS = [
  { method: 'GET', path: '/vendor', access: 'อ่าน', detail: 'ข้อมูลช่าง สัญญาซ่อม ค่าสัญญาที่เรียกเก็บจากหอพัก และจำนวนงานแยกตามสถานะ' },
  { method: 'GET', path: '/vendor/change-requests?status=&updated_since=', access: 'อ่าน', detail: 'คำขอแก้ไขข้อมูลช่าง/สัญญาที่เคยส่ง พร้อมผลอนุมัติ ใช้ server_time เป็น updated_since รอบถัดไป' },
  { method: 'GET', path: '/vendor/change-requests/:id', access: 'อ่าน', detail: 'คำขอแก้ไข 1 รายการ' },
  { method: 'POST', path: '/vendor/change-requests', access: 'แก้ไข', detail: 'ขอแก้ข้อมูลช่างหรือสัญญา body { changes: {...}, reason } หอพักต้องอนุมัติก่อนจึงจะเปลี่ยนจริง (มีคำขอรออนุมัติได้ครั้งละ 1 รายการ)' },
  { method: 'POST', path: '/vendor/change-requests/:id/cancel', access: 'แก้ไข', detail: 'ยกเลิกคำขอที่ยังรออนุมัติ (reason ไม่บังคับ)' },
  { method: 'GET', path: '/jobs?status=', access: 'อ่าน', detail: 'รายการงานซ่อมที่ได้รับ กรองตามสถานะได้ (ล่าสุด 200 งาน)' },
  { method: 'GET', path: '/jobs/:id', access: 'อ่าน', detail: 'รายละเอียดงานซ่อม 1 งาน' },
  { method: 'GET', path: '/buildings/:ref/owner', access: 'อ่าน', detail: 'ชื่อ เบอร์ และอีเมลเจ้าของหอ ใช้ได้เฉพาะช่างที่หอพักตั้งรหัสอาคารให้แล้ว' },
  { method: 'PATCH', path: '/jobs/:id/status', access: 'แก้ไข', detail: 'เปลี่ยนสถานะงาน (ใช้ PUT ได้)' },
  { method: 'GET', path: '/contracts?updated_since=', access: 'อ่าน', detail: 'สัญญาซ่อมทุกงานที่เปลี่ยนหลังเวลาที่ระบุ ใช้ดึงผลอนุมัติครั้งเดียวแทนการวนทีละงาน (กรอง status, job_id ได้)' },
  { method: 'GET', path: '/jobs/:id/contracts', access: 'อ่าน', detail: 'สัญญาซ่อมทั้งหมดของงาน พร้อมผลอนุมัติ' },
  { method: 'GET', path: '/jobs/:id/contracts/:contract_no/files/:file_id', access: 'อ่าน', detail: 'ดาวน์โหลดไฟล์แนบของสัญญา (binary พร้อม Content-Type)' },
  { method: 'PUT', path: '/jobs/:id/contracts/:contract_no', access: 'แก้ไข', detail: 'ส่งสัญญาใหม่ (201) หรือแก้สัญญาที่ยังรออนุมัติ (200) body ไม่เกิน 16 MB' },
  { method: 'POST', path: '/jobs/:id/contracts/:contract_no/files', access: 'แก้ไข', detail: 'แนบไฟล์เพิ่มแบบ multipart (field files) PDF/PNG/JPEG ไฟล์ละ ≤ 5 MB รวม ≤ 5 ไฟล์' },
  { method: 'POST', path: '/jobs/:id/contracts/:contract_no/cancel', access: 'แก้ไข', detail: 'ยกเลิกสัญญาที่ยังรออนุมัติ ต้องส่ง reason' },
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
  ['403 READ_ONLY', 'พยายามแก้ไขข้อมูลงานหรือข้อมูลช่างโดยตรง (ข้อมูลช่างให้ส่งคำขอที่ POST /vendor/change-requests)'],
  ['400 VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง เช่น status ไม่รู้จัก หรือปฏิเสธงานโดยไม่ใส่ note'],
  ['400 FIELD_NOT_ALLOWED', 'ส่งฟิลด์อื่นนอกจาก status, note, technician_name, technician_phone, scheduled_at'],
  ['404 NOT_FOUND', 'ไม่พบงาน หรือเป็นงานของช่างรายอื่น'],
  ['409 INVALID_TRANSITION', 'เปลี่ยนข้ามขั้นไม่ได้ เช่น จาก sent ไป done หรืองานถูกยกเลิกไปแล้ว'],
  ['400 NO_CHANGES', 'คำขอแก้ไขมีค่าเท่ากับข้อมูลปัจจุบันทุกช่อง'],
  ['409 CHANGE_REQUEST_PENDING', 'มีคำขอแก้ไขรออนุมัติอยู่แล้ว ยกเลิกคำขอเดิมหรือรอผลก่อน'],
  ['409 CHANGE_LOCKED', 'คำขอแก้ไขนี้อนุมัติ ไม่อนุมัติ หรือยกเลิกไปแล้ว'],
  ['409 CONTRACT_LOCKED', 'สัญญาอนุมัติ ไม่อนุมัติ หรือยกเลิกไปแล้ว แก้ไข แนบไฟล์ หรือยกเลิกไม่ได้'],
  ['409 INVALID_JOB_STATUS', 'งานซ่อมปิดแล้ว (done, rejected, cancelled) ส่งหรือแก้สัญญาไม่ได้'],
  ['413 PAYLOAD_TOO_LARGE', 'body ของ PUT สัญญาเกิน 16 MB ให้ส่งไฟล์แยกผ่าน POST .../files'],
  ['429 RATE_LIMITED', 'เรียกเกิน 120 ครั้ง/นาที ต่อ key (ดู header Retry-After)'],
]

export const REPAIR_CONTRACT_STATUSES = [
  { status: 'pending', label: 'รอหอพักอนุมัติ', by: 'ช่างส่ง (PUT)', next: 'approved, rejected, cancelled' },
  { status: 'approved', label: 'อนุมัติแล้ว ช่างเริ่มงานได้', by: 'หอพัก', next: 'สิ้นสุด แก้ไม่ได้' },
  { status: 'rejected', label: 'ไม่อนุมัติ (มีเหตุผลใน decision_note)', by: 'หอพัก', next: 'สิ้นสุด ออกสัญญาเลขใหม่แทน' },
  { status: 'cancelled', label: 'ช่างยกเลิก', by: 'ช่าง (/cancel)', next: 'สิ้นสุด' },
]

export const REPAIR_CONTRACT_FIELDS = [
  { name: 'contract_no (ใน path)', type: 'ข้อความ ≤ 20 (A-Z 0-9 . _ -)', note: 'เลขสัญญาฝั่งช่าง ไม่ซ้ำภายในงาน' },
  { name: 'contract_type', type: 'main | addendum', note: 'addendum ต้องส่ง parent_contract_no ที่อนุมัติแล้วของงานเดียวกัน' },
  { name: 'billing_type', type: 'daily | monthly', note: 'คิดค่าแรงรายวันหรือรายเดือน' },
  { name: 'rate, period_qty', type: 'ตัวเลข ≥ 0, จำนวนเต็ม > 0', note: 'ค่าแรงต่อหน่วย × จำนวนวัน/เดือน' },
  { name: 'start_date, end_date', type: 'YYYY-MM-DD', note: 'end_date ต้องไม่ก่อน start_date' },
  { name: 'labor_amount', type: 'ตัวเลข', note: 'ต้องเท่ากับ rate × period_qty' },
  { name: 'material_amount', type: 'ตัวเลข ≥ 0', note: 'ต้องเท่ากับผลรวม qty × unit_price ของ items' },
  { name: 'total_amount', type: 'ตัวเลข', note: 'ต้องเท่ากับ labor_amount + material_amount (เทียบทศนิยม 2 ตำแหน่ง)' },
  { name: 'terms', type: 'ข้อความ ≤ 2000 / null', note: 'เงื่อนไขสัญญา' },
  { name: 'items', type: 'array ≤ 100', note: 'description ≤ 200, qty > 0, unit ≤ 20, unit_price ≥ 0' },
  { name: 'installments', type: 'array ≤ 24 / ไม่ส่ง', note: 'no, description, due_date (ไม่บังคับ), amount ผลรวมต้องเท่ากับ total_amount' },
  { name: 'files', type: 'array ≤ 5 / ไม่ส่ง', note: 'file_name, mime_type (application/pdf, image/png, image/jpeg), data_base64 ไฟล์ละ ≤ 5 MB ถ้าส่งมาจะแทนที่ไฟล์เดิมทั้งหมด ไม่ส่ง = คงไฟล์เดิม' },
]

export const VENDOR_CHANGE_SAMPLE = {
  changes: { phone: '0811111111', contract_end: '2026-12-31', contract_fee: 3500 },
  reason: 'ต่อสัญญาอีก 1 เดือน และเปลี่ยนเบอร์ติดต่อ',
}

export const VENDOR_CHANGE_FIELD_NOTE = 'ส่งเฉพาะฟิลด์ที่ต้องการแก้: name, contact_name, phone, email, specialties, specialty_other, contract_type (monthly|yearly), contract_start, contract_end (YYYY-MM-DD), contract_fee ระบบตรวจข้อมูลหลังรวมกับค่าปัจจุบัน (เช่น วันสิ้นสุดต้องไม่ก่อนวันเริ่ม) ฟิลด์อื่นได้ 400 FIELD_NOT_ALLOWED'

const VENDOR_CHANGE_RESULT = {
  id: 3, status: 'pending', changes: VENDOR_CHANGE_SAMPLE.changes,
  previous: { phone: '0927823727', contract_end: '2026-11-30', contract_fee: 3000 },
  reason: VENDOR_CHANGE_SAMPLE.reason, requested_by: 'API: RenoCare',
  created_at: '2026-11-26T04:00:00.000Z', updated_at: '2026-11-26T04:00:00.000Z',
  decided_at: null, decided_by_name: null, decision_note: null, cancelled_at: null, cancel_reason: null,
}

export const VENDOR_CHANGE_DECIDED_SAMPLE = JSON.stringify({
  event: 'vendor.change_decided', sent_at: '2026-11-26T05:00:01.000Z',
  change_request: { ...VENDOR_CHANGE_RESULT, status: 'approved', decided_at: '2026-11-26T05:00:00.000Z', decided_by_name: 'มานะ ทำงานดี' },
}, null, 2)

export const REPAIR_CONTRACT_SAMPLE = {
  contract_type: 'main', parent_contract_no: null, billing_type: 'daily', rate: 500, period_qty: 1,
  start_date: '2026-11-30', end_date: '2026-11-30', labor_amount: 500, material_amount: 85, total_amount: 585,
  terms: 'รับประกันงาน 30 วัน',
  items: [{ description: 'กระเบื้องพื้น 60x60 ซม.', qty: 1, unit: 'แผ่น', unit_price: 85 }],
  installments: [
    { no: 1, description: 'มัดจำ 30%', due_date: '2026-11-30', amount: 175.5 },
    { no: 2, description: 'ส่วนที่เหลือเมื่อเสร็จงาน', due_date: '2026-11-30', amount: 409.5 },
  ],
}

const CONTRACT_RESULT = {
  contract_no: 'CT2611-0002', job_id: 41, ...REPAIR_CONTRACT_SAMPLE, status: 'pending',
  items: [{ description: 'กระเบื้องพื้น 60x60 ซม.', qty: 1, unit: 'แผ่น', unit_price: 85, line_total: 85 }],
  files: [{ file_id: 12, file_name: 'CT2611-0002.pdf', mime_type: 'application/pdf', size_bytes: 48211 }],
  revision: 1, submitted_at: '2026-11-26T03:50:00.000Z', updated_at: '2026-11-26T03:50:00.000Z',
  decided_at: null, decided_by_name: null, decision_note: null, cancelled_at: null, cancel_reason: null,
}

export const REPAIR_CONTRACT_DECIDED_SAMPLE = JSON.stringify({
  event: 'contract.decided', sent_at: '2026-11-26T05:10:01.000Z', job_id: 41,
  contract: { contract_no: 'CT2611-0002', status: 'approved', decided_at: '2026-11-26T05:10:00.000Z', decided_by_name: 'มานะ ทำงานดี', decision_note: null },
}, null, 2)

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
      id: 'vendor-change', method: 'POST', path: '/vendor/change-requests', title: 'ขอแก้ข้อมูลช่างหรือสัญญา', status: 201,
      description: 'ส่งเฉพาะฟิลด์ที่ต้องการแก้ ข้อมูลยังไม่เปลี่ยนจนกว่าหอพักจะอนุมัติ ดูผลด้วย GET /vendor/change-requests หรือรับ webhook vendor.change_decided',
      code: curl(base, 'POST', '/vendor/change-requests', VENDOR_CHANGE_SAMPLE),
      response: json(VENDOR_CHANGE_RESULT),
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
      id: 'contract-put', method: 'PUT', path: '/jobs/41/contracts/CT2611-0002', title: 'ส่งสัญญาซ่อมให้หอพักอนุมัติ', status: 201,
      description: 'หลังประเมินหน้างาน ส่งราคา วัสดุ ระยะเวลา และงวดชำระ (แนบ PDF เป็น base64 ใน files ได้) ส่งซ้ำเลขเดิมตอนยังรออนุมัติ = แก้ไข (200)',
      code: curl(base, 'PUT', '/jobs/41/contracts/CT2611-0002', REPAIR_CONTRACT_SAMPLE),
      response: json(CONTRACT_RESULT),
    },
    {
      id: 'contract-poll', method: 'GET', path: '/contracts?updated_since=2026-11-26T03:00:00Z', title: 'ดึงผลอนุมัติสัญญา', status: 200,
      description: 'เรียกทุก 1-5 นาที แล้วใช้ server_time ที่ได้เป็น updated_since รอบถัดไป',
      code: curl(base, 'GET', '/contracts?updated_since=2026-11-26T03:00:00Z'),
      response: json({ contracts: [{ ...CONTRACT_RESULT, status: 'approved', decided_at: '2026-11-26T05:10:00.000Z', decided_by_name: 'มานะ ทำงานดี' }], server_time: '2026-11-26T05:11:00.000Z' }),
    },
    {
      id: 'contract-files', method: 'POST', path: '/jobs/41/contracts/CT2611-0002/files', title: 'แนบไฟล์ใหญ่แบบ multipart', status: 201,
      description: 'ใช้เมื่อไฟล์รวมใหญ่จน PUT เกิน 16 MB เพิ่มไฟล์ต่อจากของเดิม (รวมไม่เกิน 5 ไฟล์)',
      code: [`curl -X POST "${base}/jobs/41/contracts/CT2611-0002/files"`, '  -H "X-Repair-Api-Key: <API_KEY>"', '  -F "files=@CT2611-0002.pdf;type=application/pdf"'].join(' \\\n'),
      response: json({ ...CONTRACT_RESULT, files: [...CONTRACT_RESULT.files, { file_id: 13, file_name: 'CT2611-0002.pdf', mime_type: 'application/pdf', size_bytes: 4210000 }] }),
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
    '- POST /vendor/change-requests — ขอแก้ข้อมูลช่างหรือสัญญา body { "changes": { ฟิลด์ที่จะแก้ }, "reason": "..." } ต้องรอหอพักอนุมัติก่อนจึงจะเปลี่ยนจริง',
    '- GET /vendor/change-requests — ดูคำขอแก้ไขและผล (pending, approved, rejected, cancelled)',
    '- GET /jobs?status=<status> — รายการงาน (sent, accepted, in_progress, done, rejected, cancelled)',
    '- GET /jobs/{id} — รายละเอียดงาน 1 งาน',
    '- PATCH /jobs/{id}/status — เปลี่ยนสถานะ ส่งได้เฉพาะ status, note, technician_name, technician_phone, scheduled_at',
    '- PUT /jobs/{id}/contracts/{contract_no} — ส่งหรือแก้สัญญาซ่อม (ราคา วัสดุ ระยะเวลา งวดชำระ) ยอดเงินต้องบวกกันลงตัว: labor_amount = rate × period_qty, material_amount = ผลรวม qty × unit_price, total_amount = labor_amount + material_amount',
    '- GET /contracts?updated_since=<ISO> — ดูผลอนุมัติสัญญา (pending, approved, rejected, cancelled)',
    '- POST /jobs/{id}/contracts/{contract_no}/cancel — ยกเลิกสัญญาที่ยังรออนุมัติ ต้องมี reason',
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
    '6. ข้อมูลงาน (เลขห้อง รายละเอียด เบอร์ติดต่อ) แก้ผ่าน API ไม่ได้ ให้แนะนำผู้ใช้ติดต่อหอพัก ส่วนข้อมูลช่างและสัญญาให้ส่งคำขอแก้ไข แล้วบอกผู้ใช้ว่าต้องรอหอพักอนุมัติ',
    '7. ก่อนส่งสัญญา ให้คำนวณยอดเงินให้ตรงกันทุกจุด และสรุปยอดให้ผู้ใช้ยืนยันก่อนส่ง ห้ามเริ่มงานจนกว่าสัญญาเป็น approved',
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
    '## 4. ส่งสัญญาซ่อมให้หอพักอนุมัติ',
    '- PUT {DORM_BASE_URL}/jobs/{job_id}/contracts/{contract_no} พร้อม header X-API-Key (201 = สร้างใหม่, 200 = แก้ไขตอนยังรออนุมัติ)',
    '- body: contract_type (main|addendum), parent_contract_no, billing_type (daily|monthly), rate, period_qty, start_date, end_date, labor_amount, material_amount, total_amount, terms, items[{description, qty, unit, unit_price}], installments[{no, description, due_date, amount}], files[{file_name, mime_type, data_base64}]',
    '- ยอดต้องตรงกัน (ปัด 2 ตำแหน่ง): labor_amount = rate × period_qty, material_amount = ผลรวม qty × unit_price, total_amount = labor_amount + material_amount, ผลรวม installments = total_amount ไม่ตรงจะได้ 400 VALIDATION_ERROR',
    '- body ของ PUT ต้องไม่เกิน 16 MB (ไฟล์ละ ≤ 5 MB, ≤ 5 ไฟล์) ถ้าไฟล์ใหญ่ ให้ PUT โดยไม่ส่ง files แล้วอัปโหลดแยกที่ POST .../contracts/{contract_no}/files แบบ multipart field ชื่อ files',
    '- ดึงผลอนุมัติ: GET {DORM_BASE_URL}/contracts?updated_since=<server_time รอบก่อน> ทุก 1 นาที (ครั้งเดียวได้ทุกงาน) สถานะ: pending, approved, rejected (ดู decision_note), cancelled',
    '- ถ้ามี URL รับ webhook จะได้ X-Repair-Event: contract.decided พร้อม X-Signature ด้วย',
    '- ยกเลิกสัญญาที่ยังรออนุมัติ: POST .../contracts/{contract_no}/cancel body { "reason": "..." }',
    '- 409 CONTRACT_LOCKED = สัญญาปิดแล้ว ให้ออกเลขใหม่, 409 INVALID_JOB_STATUS = งานซ่อมปิดแล้ว, 413 PAYLOAD_TOO_LARGE = body ใหญ่เกิน',
    '',
    '## 5. ขอแก้ข้อมูลช่างและสัญญา (หอพักต้องอนุมัติก่อน)',
    '- POST {DORM_BASE_URL}/vendor/change-requests พร้อม header X-API-Key',
    '- body: { "changes": { ส่งเฉพาะฟิลด์ที่จะแก้ }, "reason": "เหตุผล (ไม่บังคับ ≤ 500)" }',
    '- ฟิลด์ที่ขอแก้ได้: name, contact_name, phone, email, specialties[], specialty_other, contract_type (monthly|yearly), contract_start, contract_end (YYYY-MM-DD), contract_fee',
    '- 201 = ส่งคำขอแล้ว status pending ข้อมูลยังไม่เปลี่ยน, 409 CHANGE_REQUEST_PENDING = มีคำขอรออยู่แล้ว (มีได้ครั้งละ 1), 400 NO_CHANGES = ค่าเหมือนเดิม, 400 FIELD_NOT_ALLOWED = ฟิลด์ที่ขอแก้ไม่ได้',
    '- ดึงผล: GET {DORM_BASE_URL}/vendor/change-requests?updated_since=<server_time รอบก่อน> หรือรับ webhook X-Repair-Event: vendor.change_decided',
    '- อนุมัติแล้วให้ดึง GET /vendor ใหม่เพื่ออัปเดตข้อมูลฝั่ง RenoCare, ไม่อนุมัติดูเหตุผลใน decision_note',
    '- ยกเลิกคำขอที่ยังรอ: POST .../vendor/change-requests/{id}/cancel body { "reason": "..." }',
    '',
    '## สิ่งที่ต้องส่งมอบ',
    '1. ฟังก์ชันเรียก owner endpoint',
    '2. endpoint รับ webhook จากหอพัก พร้อมตรวจลายเซ็นและ X-API-Key',
    '3. ฟังก์ชันส่งสถานะกลับ พร้อมเซ็นและ retry',
    '3.1 ฟังก์ชันส่งสัญญา (คำนวณยอดให้ตรง) และ job ดึงผลอนุมัติทุก 1 นาทีด้วย updated_since',
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
        heading('7.1 สัญญาซ่อม (ส่งให้หอพักอนุมัติก่อนเริ่มงาน)'),
        para('ส่งด้วย PUT /jobs/:id/contracts/:contract_no หอพัก (พนักงานหรือเจ้าของหอ) จะอนุมัติหรือไม่อนุมัติ ช่างดึงผลด้วย GET /contracts?updated_since= หรือรับ webhook contract.decided'),
        table(['status', 'ความหมาย', 'เปลี่ยนโดย', 'ไปต่อได้'], REPAIR_CONTRACT_STATUSES.map((row) => [row.status, row.label, row.by, row.next]), [16, 34, 20, 30], [0]),
        table(['ฟิลด์', 'ชนิดข้อมูล', 'กติกา'], REPAIR_CONTRACT_FIELDS.map((row) => [row.name, row.type, row.note]), [24, 28, 48], [0]),
        ...codeBlock(JSON.stringify(REPAIR_CONTRACT_SAMPLE, null, 2)),
        para('Webhook เมื่อหอพักตัดสินใจ (X-Repair-Event: contract.decided)'),
        ...codeBlock(REPAIR_CONTRACT_DECIDED_SAMPLE),
        heading('7.2 ขอแก้ข้อมูลช่างและสัญญา (หอพักต้องอนุมัติก่อน)'),
        para('ส่ง POST /vendor/change-requests ข้อมูลจะเปลี่ยนหลังพนักงานหรือเจ้าของหอกดอนุมัติเท่านั้น ดูผลด้วย GET /vendor/change-requests?updated_since= หรือรับ webhook vendor.change_decided'),
        para(VENDOR_CHANGE_FIELD_NOTE),
        ...codeBlock(JSON.stringify(VENDOR_CHANGE_SAMPLE, null, 2)),
        para('Webhook เมื่อหอพักตัดสินใจ (X-Repair-Event: vendor.change_decided)'),
        ...codeBlock(VENDOR_CHANGE_DECIDED_SAMPLE),
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
