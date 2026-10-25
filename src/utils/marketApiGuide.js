export const GUIDE_TITLE = 'คู่มือใช้งาน Market API สำหรับผู้เช่าร้านค้า'
export const GUIDE_VERSION = 'API v1'

export const GUIDE_RULES = [
  '1 API key ผูกกับ 1 สัญญาเช่า และเห็นได้เฉพาะร้านที่ตัวเองเช่าอยู่',
  'ข้อมูลร้านและสัญญาเช่าเป็นแบบอ่านอย่างเดียว แก้ไขผ่าน API ไม่ได้',
  'แก้ไขได้เฉพาะสินค้าในร้านที่เช่า (เพิ่ม แก้ไข ลบ)',
  'เมื่อสัญญาหมดอายุ ถูกยกเลิก หรือ key ถูกยกเลิก จะเรียก API ไม่ได้ทันที',
  'เรียกได้สูงสุด 120 ครั้งต่อนาทีต่อ key',
]

export const GUIDE_ENDPOINTS = [
  { method: 'GET', path: '/shop', access: 'อ่าน', detail: 'ข้อมูลร้านที่เช่าอยู่ ผู้เช่า และสรุปสินค้า' },
  { method: 'GET', path: '/contract', access: 'อ่าน', detail: 'สัญญาเช่าของร้าน (อ่านอย่างเดียว)' },
  { method: 'GET', path: '/products?category=', access: 'อ่าน', detail: 'รายการสินค้าทั้งหมด กรองตามประเภทได้' },
  { method: 'GET', path: '/products/:id', access: 'อ่าน', detail: 'สินค้ารายการเดียว' },
  { method: 'POST', path: '/products', access: 'แก้ไข', detail: 'เพิ่มสินค้า (name, category, price จำเป็น)' },
  { method: 'PATCH', path: '/products/:id', access: 'แก้ไข', detail: 'แก้ไขบางฟิลด์ของสินค้า (ใช้ PUT ได้)' },
  { method: 'DELETE', path: '/products/:id', access: 'แก้ไข', detail: 'ลบสินค้า' },
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
  ['403 READ_ONLY', 'พยายามแก้ไขสัญญาหรือข้อมูลร้าน'],
  ['400 VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง เช่น ราคาติดลบ'],
  ['400 FIELD_NOT_ALLOWED', 'ส่งฟิลด์ที่แก้ไม่ได้ เช่น shop_id'],
  ['404 NOT_FOUND', 'ไม่พบสินค้า หรือเป็นสินค้าของร้านอื่น'],
  ['409 CONFLICT', 'SKU ซ้ำในร้าน'],
  ['429 RATE_LIMITED', 'เรียกเกิน 120 ครั้ง/นาที ต่อ key (ดู header Retry-After)'],
]

export function guideExamples(base) {
  return [
    {
      title: 'ดูสินค้าทั้งหมด (cURL)',
      code: `curl "${base}/products" \\\n  -H "X-Market-Api-Key: <API_KEY>"`,
    },
    {
      title: 'แก้ไขราคาและจำนวนคงเหลือ (cURL)',
      code: `curl -X PATCH "${base}/products/12" \\\n  -H "X-Market-Api-Key: <API_KEY>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"price": 25, "stock": 40, "is_available": true}'`,
    },
    {
      title: 'เพิ่มสินค้า (JavaScript)',
      code: `const response = await fetch("${base}/products", {\n  method: "POST",\n  headers: {\n    "X-Market-Api-Key": "<API_KEY>",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ name: "น้ำดื่ม 600 มล.", category: "เครื่องดื่ม", price: 7, stock: 120 }),\n})\nconst data = await response.json()`,
    },
  ]
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileStamp = () => {
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
        heading('4. ฟิลด์ของสินค้า'),
        table(['ฟิลด์', 'ชนิดข้อมูล', 'หมายเหตุ'], GUIDE_FIELDS.map((item) => [item.name, item.type, item.note]), [22, 30, 48], [0]),
        heading('5. ตัวอย่างการเรียกใช้งาน'),
        ...guideExamples(base).flatMap((example) => [para([text(example.title, { bold: true })]), ...codeBlock(example.code)]),
        heading('6. รหัสข้อผิดพลาด'),
        para('เมื่อเกิดข้อผิดพลาด API จะตอบกลับเป็น JSON รูปแบบ { "code": "...", "message": "..." }'),
        table(['รหัส', 'ความหมาย'], GUIDE_ERRORS, [35, 65], [0]),
      ],
    }],
  })
  saveBlob(await Packer.toBlob(doc), `market-api-guide-${fileStamp()}.docx`)
}

export async function downloadGuidePdf(node) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const pageHeightPx = Math.floor((pageHeight * canvas.width) / pageWidth)
  let rendered = 0
  while (rendered < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - rendered)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = sliceHeight
    slice.getContext('2d').drawImage(canvas, 0, rendered, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
    if (rendered > 0) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, (sliceHeight * pageWidth) / canvas.width)
    rendered += sliceHeight
  }
  pdf.save(`market-api-guide-${fileStamp()}.pdf`)
}
