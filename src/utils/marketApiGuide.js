export const GUIDE_TITLE = 'คู่มือใช้งาน Market API สำหรับผู้เช่าร้านค้า'
export const GUIDE_VERSION = 'API v1'

export const GUIDE_RULES = [
  '1 API key ผูกกับ 1 สัญญาเช่า และเห็นได้เฉพาะร้านที่ตัวเองเช่าอยู่',
  'แก้ไขชื่อร้าน (name) และประเภทร้าน (shop_type) ได้ ข้อมูลร้านส่วนอื่นอ่านอย่างเดียว',
  'สัญญาเช่าเป็นแบบอ่านอย่างเดียว แก้ไขผ่าน API ไม่ได้',
  'จัดการสินค้าในร้านที่เช่าได้ (เพิ่ม แก้ไข ลบ)',
  'เมื่อสัญญาหมดอายุ ถูกยกเลิก หรือ key ถูกยกเลิก จะเรียก API ไม่ได้ทันที',
  'เรียกได้สูงสุด 120 ครั้งต่อนาทีต่อ key',
]

export const GUIDE_ENDPOINTS = [
  { method: 'GET', path: '/shop', access: 'อ่าน', detail: 'ข้อมูลร้านที่เช่าอยู่ ผู้เช่า และสรุปสินค้า' },
  { method: 'GET', path: '/contract', access: 'อ่าน', detail: 'สัญญาเช่าของร้าน (อ่านอย่างเดียว)' },
  { method: 'PATCH', path: '/shop', access: 'แก้ไข', detail: 'เปลี่ยนชื่อร้าน (name) และประเภทร้าน (shop_type) ใช้ PUT ได้' },
  { method: 'GET', path: '/products?category=', access: 'อ่าน', detail: 'รายการสินค้าทั้งหมด กรองตามประเภทได้' },
  { method: 'GET', path: '/products/:id', access: 'อ่าน', detail: 'สินค้ารายการเดียว' },
  { method: 'POST', path: '/products', access: 'แก้ไข', detail: 'เพิ่มสินค้า (name, category, price จำเป็น)' },
  { method: 'PATCH', path: '/products/:id', access: 'แก้ไข', detail: 'แก้ไขบางฟิลด์ของสินค้า (ใช้ PUT ได้)' },
  { method: 'DELETE', path: '/products/:id', access: 'แก้ไข', detail: 'ลบสินค้า' },
]

export const GUIDE_SHOP_FIELDS = [
  { name: 'name', type: 'ข้อความ 1 - 150 ตัวอักษร', note: 'ชื่อร้านที่แสดงในระบบหอพัก' },
  { name: 'shop_type', type: 'ข้อความ 1 - 100 ตัวอักษร', note: 'ประเภทร้าน เช่น ร้านสะดวกซื้อ, ร้านเครื่องดื่ม' },
]

export const GUIDE_FIELDS = [
  { name: 'name', type: 'ข้อความ ≤ 150', note: 'จำเป็นตอนเพิ่มสินค้า' },
  { name: 'category', type: 'ข้อความ ≤ 100', note: 'จำเป็นตอนเพิ่มสินค้า เช่น เครื่องดื่ม' },
  { name: 'price', type: 'ตัวเลข 0 - 1,000,000', note: 'จำเป็นตอนเพิ่มสินค้า ทศนิยมไม่เกิน 2 ตำแหน่ง' },
  { name: 'stock', type: 'จำนวนเต็ม 0 - 1,000,000', note: 'ค่าเริ่มต้น 0' },
  { name: 'unit', type: 'ข้อความ ≤ 30', note: 'ค่าเริ่มต้น "ชิ้น"' },
  { name: 'sku', type: 'ข้อความ ≤ 40', note: 'ห้ามซ้ำกันภายในร้าน' },
  { name: 'description', type: 'ข้อความ ≤ 500', note: 'ไม่บังคับ' },
  { name: 'is_available', type: 'true / false', note: 'สถานะพร้อมขาย ค่าเริ่มต้น true' },
]

export const GUIDE_ERRORS = [
  ['401 INVALID_API_KEY', 'ไม่มี key, key ผิด, ถูกยกเลิก หรือสัญญาสิ้นสุดแล้ว'],
  ['403 READ_ONLY', 'พยายามแก้ไขสัญญา หรือใช้ method ที่ไม่รองรับกับ /shop'],
  ['400 VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง เช่น ราคาติดลบ'],
  ['400 FIELD_NOT_ALLOWED', 'ส่งฟิลด์ที่แก้ไม่ได้ เช่น shop_id ในสินค้า หรือ location ในร้าน'],
  ['404 NOT_FOUND', 'ไม่พบสินค้า หรือเป็นสินค้าของร้านอื่น'],
  ['409 CONFLICT', 'SKU ซ้ำในร้าน'],
  ['429 RATE_LIMITED', 'เรียกเกิน 120 ครั้ง/นาที ต่อ key (ดู header Retry-After)'],
]

function curl(base, method, path, body) {
  const lines = [`curl${method === 'GET' ? '' : ` -X ${method}`} "${base}${path}"`, '  -H "X-Market-Api-Key: <API_KEY>"']
  if (body) lines.push('  -H "Content-Type: application/json"', `  -d '${JSON.stringify(body)}'`)
  return lines.join(' \\\n')
}

const json = (value) => JSON.stringify(value, null, 2)

const SAMPLE_PRODUCT = {
  id: 12, sku: 'CF-001', name: 'อเมริกาโน่เย็น', category: 'กาแฟ', price: 45, stock: 99, unit: 'แก้ว',
  description: 'ชงสดตามสั่ง', is_available: true, updated_by: 'API: ระบบ POS', created_at: '2026-10-25T09:00:00.000Z', updated_at: '2026-10-25T09:00:00.000Z',
}

export function guideExamples(base) {
  return [
    {
      id: 'shop', method: 'GET', path: '/shop', title: 'ดูข้อมูลร้าน', description: 'ข้อมูลร้านที่เช่าอยู่ ชื่อผู้เช่า และสรุปสินค้า',
      code: curl(base, 'GET', '/shop'),
      response: json({ shop: { code: 'SH-02', name: 'ร้านกาแฟและเครื่องดื่ม', shop_type: 'ร้านเครื่องดื่ม', location: 'ลานหน้าหอ ฝั่งที่จอดรถ', area_sqm: 15, open_time: '07:00', close_time: '20:00', description: 'กาแฟสด ชา นม ปั่น และเบเกอรี่', caretaker_name: null }, tenant: { name: 'มาลี รักกาแฟ', business_name: 'Malee Coffee' }, product_summary: { total: 5, available: 5, categories: ['กาแฟ', 'ชา / นม', 'เบเกอรี่'] } }),
    },
    {
      id: 'shop-update', method: 'PATCH', path: '/shop', title: 'เปลี่ยนชื่อร้านและประเภทร้าน', description: 'ส่งเฉพาะ name และ/หรือ shop_type',
      code: curl(base, 'PATCH', '/shop', { name: 'Malee Coffee หน้าหอ', shop_type: 'คาเฟ่' }),
      response: json({ message: 'บันทึกข้อมูลร้านเรียบร้อยแล้ว', shop: { code: 'SH-02', name: 'Malee Coffee หน้าหอ', shop_type: 'คาเฟ่' } }),
    },
    {
      id: 'contract', method: 'GET', path: '/contract', title: 'ดูสัญญาเช่า', description: 'อ่านอย่างเดียว เลขบัตรประชาชนถูกปิดบางส่วน',
      code: curl(base, 'GET', '/contract'),
      response: json({ contract: { contract_no: 'SL-2026-0004', status: 'active', tenant_name: 'มาลี รักกาแฟ', tenant_idcard: '1-XXXX-XXXXX-02-2', business_name: 'Malee Coffee', start_date: '2026-08-25', end_date: '2027-08-24', monthly_rent: 6000, deposit: 12000, payment_due_day: 5 } }),
    },
    {
      id: 'products', method: 'GET', path: '/products?category=กาแฟ', title: 'ดูรายการสินค้า', description: 'ไม่ใส่ category จะได้สินค้าทั้งหมดของร้าน',
      code: curl(base, 'GET', `/products?category=${encodeURIComponent('กาแฟ')}`),
      response: json({ products: [SAMPLE_PRODUCT] }),
    },
    {
      id: 'product', method: 'GET', path: '/products/:id', title: 'ดูสินค้ารายการเดียว', description: 'ใช้ id จากรายการสินค้า',
      code: curl(base, 'GET', '/products/12'),
      response: json({ product: SAMPLE_PRODUCT }),
    },
    {
      id: 'create', method: 'POST', path: '/products', title: 'เพิ่มสินค้า', description: 'name, category, price จำเป็น ฟิลด์อื่นไม่บังคับ',
      code: curl(base, 'POST', '/products', { name: 'ชาเขียวเย็น', category: 'ชา / นม', price: 45, stock: 30, unit: 'แก้ว', sku: 'CF-006' }),
      response: json({ message: 'เพิ่มสินค้าเรียบร้อยแล้ว', product: { ...SAMPLE_PRODUCT, id: 31, sku: 'CF-006', name: 'ชาเขียวเย็น', category: 'ชา / นม', stock: 30, description: null } }),
    },
    {
      id: 'update', method: 'PATCH', path: '/products/:id', title: 'แก้ไขราคา สต็อก หรือสถานะ', description: 'ส่งเฉพาะฟิลด์ที่ต้องการเปลี่ยน',
      code: curl(base, 'PATCH', '/products/12', { price: 49, stock: 40, is_available: true }),
      response: json({ message: 'บันทึกสินค้าเรียบร้อยแล้ว', product: { ...SAMPLE_PRODUCT, price: 49, stock: 40 } }),
    },
    {
      id: 'delete', method: 'DELETE', path: '/products/:id', title: 'ลบสินค้า', description: 'ลบได้เฉพาะสินค้าของร้านตัวเอง',
      code: curl(base, 'DELETE', '/products/31'),
      response: json({ message: 'ลบสินค้าเรียบร้อยแล้ว' }),
    },
    {
      id: 'error', method: 'PATCH', path: '/contract', title: 'ตัวอย่างข้อผิดพลาด', description: 'แก้สัญญาไม่ได้ จะได้ 403 พร้อม code',
      code: curl(base, 'PATCH', '/contract', { monthly_rent: 1 }),
      response: json({ code: 'READ_ONLY', message: 'สัญญาเช่าเป็นข้อมูลอ่านอย่างเดียว ติดต่อเจ้าหน้าที่หอพักหากต้องการแก้ไข' }),
    },
  ]
}

export function guideClientSamples(base) {
  return [
    {
      id: 'javascript',
      title: 'JavaScript (fetch)',
      code: [
        `const BASE_URL = "${base}"`,
        'const API_KEY = process.env.MARKET_API_KEY',
        '',
        'async function marketApi(path, { method = "GET", body } = {}) {',
        '  const response = await fetch(`${BASE_URL}${path}`, {',
        '    method,',
        '    headers: {',
        '      "X-Market-Api-Key": API_KEY,',
        '      ...(body ? { "Content-Type": "application/json" } : {}),',
        '    },',
        '    body: body ? JSON.stringify(body) : undefined,',
        '  })',
        '  const data = await response.json()',
        '  if (!response.ok) throw new Error(`${response.status} ${data.code}: ${data.message}`)',
        '  return data',
        '}',
        '',
        'const { products } = await marketApi("/products")',
        'await marketApi("/products/12", { method: "PATCH", body: { stock: 40 } })',
      ].join('\n'),
    },
    {
      id: 'node',
      title: 'Node.js (axios)',
      setup: ['npm install axios', 'MARKET_API_KEY=<API_KEY> node market.mjs'],
      code: [
        'import axios from "axios"',
        '',
        'const market = axios.create({',
        `  baseURL: "${base}",`,
        '  headers: { "X-Market-Api-Key": process.env.MARKET_API_KEY },',
        '  timeout: 10000,',
        '})',
        '',
        'try {',
        '  const { data } = await market.get("/products")',
        '  console.log(data.products)',
        '',
        '  const { data: created } = await market.post("/products", {',
        '    name: "ชาเขียวเย็น",',
        '    category: "ชา / นม",',
        '    price: 45,',
        '    stock: 30,',
        '  })',
        '  await market.patch(`/products/${created.product.id}`, { stock: 40 })',
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
        'HEADERS = {"X-Market-Api-Key": os.environ["MARKET_API_KEY"]}',
        '',
        'products = requests.get(f"{BASE_URL}/products", headers=HEADERS, timeout=10).json()["products"]',
        '',
        'response = requests.post(',
        '    f"{BASE_URL}/products",',
        '    headers=HEADERS,',
        '    json={"name": "ชาเขียวเย็น", "category": "ชา / นม", "price": 45, "stock": 30},',
        '    timeout=10,',
        ')',
        'response.raise_for_status()',
        'print(response.json()["product"]["id"])',
      ].join('\n'),
    },
  ]
}

export function guideAiPrompt(base) {
  return [
    'คุณคือผู้ช่วยจัดการร้านค้าของผู้เช่าร้านข้างหอพัก ใช้ Market API ด้านล่างเพื่ออ่านข้อมูลร้านและจัดการสินค้าเท่านั้น',
    '',
    '## การเชื่อมต่อ',
    `- Base URL: ${base}`,
    '- ทุกคำขอต้องมี header: X-Market-Api-Key: <API_KEY> (ห้ามส่ง header Authorization)',
    '- ส่ง body เป็น JSON พร้อม Content-Type: application/json',
    '- ห้ามแสดง API key ให้ผู้ใช้เห็น และห้ามเรียก URL อื่นนอกจาก Base URL นี้',
    '',
    '## Endpoints ที่ใช้ได้',
    '- GET /shop — ข้อมูลร้าน ผู้เช่า และสรุปสินค้า',
    '- PATCH /shop — แก้ได้เฉพาะ {"name": string 1-150, "shop_type": string 1-100}',
    '- GET /contract — สัญญาเช่า (อ่านอย่างเดียว ห้ามพยายามแก้)',
    '- GET /products?category=<ประเภท> — รายการสินค้า (ไม่ใส่ category = ทั้งหมด)',
    '- GET /products/{id} — สินค้ารายการเดียว',
    '- POST /products — เพิ่มสินค้า ต้องมี name, category, price',
    '- PATCH /products/{id} — แก้เฉพาะฟิลด์ที่ส่ง',
    '- DELETE /products/{id} — ลบสินค้า',
    '',
    '## ฟิลด์สินค้า',
    '- name (≤150), category (≤100), price (0-1,000,000 ทศนิยม 2 ตำแหน่ง), stock (จำนวนเต็ม 0-1,000,000)',
    '- unit (≤30, ค่าเริ่มต้น "ชิ้น"), sku (≤40 ห้ามซ้ำในร้าน), description (≤500), is_available (true/false)',
    '- ห้ามส่งฟิลด์อื่น เช่น id หรือ shop_id',
    '',
    '## กฎการทำงาน',
    '1. ก่อนแก้หรือลบสินค้า ให้เรียก GET /products เพื่อหา id ที่ถูกต้องก่อนเสมอ อย่าเดา id',
    '2. ก่อน DELETE หรือแก้หลายรายการพร้อมกัน ให้สรุปสิ่งที่จะทำและขอให้ผู้ใช้ยืนยันก่อน',
    '3. ถ้าได้ 429 ให้รอตามค่า header Retry-After แล้วค่อยลองใหม่ (จำกัด 120 ครั้ง/นาที)',
    '4. ถ้าได้ 401 INVALID_API_KEY ให้หยุดและแจ้งผู้ใช้ว่า key ใช้ไม่ได้หรือสัญญาสิ้นสุดแล้ว',
    '5. ถ้าได้ 400/404/409 ให้อ่าน code และ message แล้วอธิบายให้ผู้ใช้เข้าใจ ไม่ลองซ้ำแบบเดิม',
    '6. ข้อมูลสัญญา ค่าเช่า และตำแหน่งร้าน แก้ผ่าน API ไม่ได้ ให้แนะนำผู้ใช้ติดต่อเจ้าหน้าที่หอพัก',
    '',
    '## รูปแบบคำตอบ',
    '- ตอบเป็นภาษาไทย สรุปผลลัพธ์สั้น ๆ เช่น สินค้าที่เปลี่ยน ราคาเดิม → ราคาใหม่',
    '- แสดงรายการสินค้าเป็นตาราง: ชื่อ | ประเภท | ราคา | คงเหลือ | สถานะ',
  ].join('\n')
}

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const fileStamp = () => {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

export async function downloadGuideDocx(base) {
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
    creator: 'ระบบร้านค้าเช่าข้างหอพัก',
    title: GUIDE_TITLE,
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children: [
        new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 60 }, children: [text(GUIDE_TITLE, { bold: true, size: 36, color: '14365C' })] }),
        para([text(`${GUIDE_VERSION} · ปรับปรุงล่าสุด ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`, { color: '6B859E', size: 19 })]),
        heading('1. ภาพรวมและสิทธิ์การเข้าถึง'),
        ...GUIDE_RULES.map((rule) => para(`• ${rule}`)),
        heading('2. การเชื่อมต่อ'),
        para([text('Base URL: ', { bold: true }), new TextRun({ text: base, font: MONO, size: 20, color: '1D4ED8' })]),
        para([text('Header: ', { bold: true }), new TextRun({ text: 'X-Market-Api-Key: <API_KEY>', font: MONO, size: 20, color: '1D4ED8' })]),
        para('แทน <API_KEY> ด้วย key ที่ได้รับจากเจ้าหน้าที่หอพัก (แสดงครั้งเดียวตอนออก key) ห้ามส่ง header Authorization มาด้วย ส่งข้อมูลเป็น JSON และใส่ Content-Type: application/json เมื่อมี body'),
        heading('3. Endpoints'),
        table(['Method', 'Path', 'สิทธิ์', 'รายละเอียด'], GUIDE_ENDPOINTS.map((item) => [item.method, item.path, item.access, item.detail]), [12, 28, 12, 48], [0, 1]),
        heading('4. ฟิลด์ข้อมูลร้านที่แก้ไขได้ (PATCH /shop)'),
        para('ส่งเฉพาะฟิลด์ที่ต้องการเปลี่ยน ถ้าส่งฟิลด์อื่น เช่น location หรือ monthly_rent จะได้ 400 FIELD_NOT_ALLOWED'),
        table(['ฟิลด์', 'ชนิดข้อมูล', 'หมายเหตุ'], GUIDE_SHOP_FIELDS.map((item) => [item.name, item.type, item.note]), [22, 30, 48], [0]),
        heading('5. ฟิลด์ของสินค้า'),
        table(['ฟิลด์', 'ชนิดข้อมูล', 'หมายเหตุ'], GUIDE_FIELDS.map((item) => [item.name, item.type, item.note]), [22, 30, 48], [0]),
        heading('6. ตัวอย่างการเรียกใช้งาน'),
        para('ทุกตัวอย่างใช้ cURL แทน <API_KEY> ด้วย key จริงของร้าน และแทน id สินค้าด้วยค่าที่ได้จาก GET /products'),
        ...guideExamples(base).flatMap((example) => [
          para([text(`${example.method} ${example.path} — ${example.title}`, { bold: true, color: '1D4ED8' })]),
          para([text(example.description, { color: '6B859E', size: 19 })]),
          para([text('Request', { bold: true, size: 19 })]),
          ...codeBlock(example.code),
          para([text('Response', { bold: true, size: 19 })]),
          ...codeBlock(example.response),
        ]),
        heading('ตัวอย่างโค้ดเรียกใช้งาน'),
        ...guideClientSamples(base).flatMap((sample) => [
          para([text(sample.title, { bold: true })]),
          ...(sample.setup ? [para(`ต้องใช้ Node.js 18 ขึ้นไป · ติดตั้ง ${sample.setup[0]} · บันทึกเป็น market.mjs แล้วรัน ${sample.setup[1]}`)] : []),
          ...codeBlock(sample.code),
        ]),
        heading('7. รหัสข้อผิดพลาด'),
        para('เมื่อเกิดข้อผิดพลาด API จะตอบกลับเป็น JSON รูปแบบ { "code": "...", "message": "..." }'),
        table(['รหัส', 'ความหมาย'], GUIDE_ERRORS, [35, 65], [0]),
        heading('8. Prompt สำหรับให้ AI ใช้งาน API'),
        para('คัดลอกข้อความด้านล่างไปใส่เป็น system prompt หรือคำสั่งเริ่มต้นของ AI (เช่น ChatGPT, Claude หรือ agent ของคุณ) แล้วให้ AI เรียก API แทนคุณ อย่าใส่ API key จริงลงใน prompt ให้เก็บไว้ในตัวแปรของระบบ'),
        ...codeBlock(guideAiPrompt(base)),
      ],
    }],
  })
  saveBlob(await Packer.toBlob(doc), `market-api-guide-${fileStamp()}.docx`)
}

const PDF_MARGIN_PT = 28

function safeBreakPoints(node, scale) {
  const origin = node.getBoundingClientRect().top
  const points = new Set()
  node.querySelectorAll('header, p, li, tr, pre, .market-guide-print-conn > div, table').forEach((element) => {
    points.add(Math.round((element.getBoundingClientRect().bottom - origin) * scale))
  })
  node.querySelectorAll('h2, h3, table, pre, .market-guide-print-example').forEach((element) => {
    points.add(Math.round((element.getBoundingClientRect().top - origin) * scale) - 1)
  })
  return [...points].filter((point) => point > 0).sort((a, b) => a - b)
}

export async function downloadGuidePdf(node, filePrefix = 'market-api-guide') {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const pxPerPt = canvas.width / pageWidth
  const usableHeightPx = Math.floor((pageHeight - PDF_MARGIN_PT * 2) * pxPerPt)
  const breaks = safeBreakPoints(node, canvas.width / node.offsetWidth)
  let rendered = 0
  let page = 0
  while (rendered < canvas.height - 2) {
    const limit = rendered + usableHeightPx
    let end = Math.min(limit, canvas.height)
    if (limit < canvas.height) {
      const candidate = breaks.filter((point) => point > rendered + usableHeightPx * 0.4 && point <= limit).pop()
      if (candidate) end = candidate
    }
    const sliceHeight = end - rendered
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = sliceHeight
    const context = slice.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, slice.width, slice.height)
    context.drawImage(canvas, 0, rendered, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
    if (page > 0) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, page === 0 ? 0 : PDF_MARGIN_PT, pageWidth, sliceHeight / pxPerPt)
    page += 1
    pdf.setFontSize(9)
    pdf.setTextColor(148, 163, 184)
    pdf.text(`${page}`, pageWidth - PDF_MARGIN_PT, pageHeight - 14, { align: 'right' })
    rendered = end
  }
  pdf.save(`${filePrefix}-${fileStamp()}.pdf`)
}
