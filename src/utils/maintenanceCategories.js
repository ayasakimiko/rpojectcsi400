export const MAINTENANCE_CATEGORY_OPTIONS = [
  { value: 'electrical', label: 'ไฟฟ้า', hint: 'ปลั๊ก สวิตช์ หลอดไฟ เบรกเกอร์' },
  { value: 'plumbing', label: 'ประปา', hint: 'ท่อรั่ว ก๊อกน้ำ ชักโครก ท่อตัน' },
  { value: 'aircon', label: 'เครื่องปรับอากาศ', hint: 'แอร์ไม่เย็น น้ำหยด มีเสียงดัง' },
  { value: 'appliance', label: 'เครื่องใช้ไฟฟ้า', hint: 'เครื่องทำน้ำอุ่น ตู้เย็น ทีวี พัดลม' },
  { value: 'furniture', label: 'เฟอร์นิเจอร์', hint: 'เตียง ตู้ โต๊ะ เก้าอี้ ผ้าม่าน' },
  { value: 'door', label: 'ประตู/หน้าต่าง/กุญแจ', hint: 'ล็อกเสีย บานพับ มุ้งลวด คีย์การ์ด' },
  { value: 'building', label: 'ผนัง/เพดาน/พื้น', hint: 'รั่วซึม สีลอก กระเบื้องแตก' },
  { value: 'internet', label: 'อินเทอร์เน็ต/Wi-Fi', hint: 'เน็ตหลุด ช้า เชื่อมต่อไม่ได้' },
  { value: 'pest', label: 'แมลง/สัตว์รบกวน', hint: 'มด แมลงสาบ ปลวก หนู' },
  { value: 'other', label: 'อื่นๆ', hint: 'ปัญหาที่ไม่อยู่ในหมวดด้านบน' },
]

export const MAINTENANCE_TIME_OPTIONS = [
  { value: 'anytime', label: 'เวลาไหนก็ได้', hint: 'สะดวกทุกช่วง' },
  { value: 'morning', label: 'ช่วงเช้า', hint: '08:00-12:00' },
  { value: 'afternoon', label: 'ช่วงบ่าย', hint: '12:00-16:00' },
  { value: 'evening', label: 'ช่วงเย็น', hint: '16:00-19:00' },
  { value: 'night', label: 'ช่วงค่ำ', hint: '19:00-21:00' },
  { value: 'weekend', label: 'เสาร์-อาทิตย์', hint: 'วันหยุดสุดสัปดาห์' },
]

export const MAINTENANCE_CATEGORY_KEYS = MAINTENANCE_CATEGORY_OPTIONS.map((option) => option.value)
export const MAINTENANCE_TIME_KEYS = MAINTENANCE_TIME_OPTIONS.map((option) => option.value)

export const MAINTENANCE_CATEGORY_LABEL = Object.fromEntries(MAINTENANCE_CATEGORY_OPTIONS.map((option) => [option.value, option.label]))
export const MAINTENANCE_CATEGORY_HINT = Object.fromEntries(MAINTENANCE_CATEGORY_OPTIONS.map((option) => [option.value, option.hint]))
export const MAINTENANCE_TIME_LABEL = Object.fromEntries(MAINTENANCE_TIME_OPTIONS.map((option) => [
  option.value,
  option.value === 'anytime' || option.value === 'weekend' ? option.label : `${option.label} (${option.hint})`,
]))
