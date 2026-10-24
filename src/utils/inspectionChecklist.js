export const CHECKLIST_ITEMS = [
  { key: 'walls', label: 'ผนังและสี (รอยแตก คราบ สีลอก)' },
  { key: 'floor', label: 'พื้น (รอยแตก คราบ ความเสียหาย)' },
  { key: 'ceiling', label: 'เพดานและไฟ (คราบรั่วซึม หลอดไฟ)' },
  { key: 'doors', label: 'ประตูและกุญแจ (บาน ลูกบิด กลอน กุญแจ)' },
  { key: 'windows', label: 'หน้าต่าง (กระจก วงกบ ตัวล็อก)' },
  { key: 'electrical', label: 'ระบบไฟฟ้า (ปลั๊ก สวิตช์ ไฟส่องสว่าง)' },
  { key: 'bathroom', label: 'ห้องน้ำและสุขภัณฑ์ (ก๊อก ฝักบัว โถ ท่อระบาย)' },
  { key: 'furniture', label: 'เฟอร์นิเจอร์และอุปกรณ์ของห้อง' },
]

export const RESULT_OPTIONS = [
  { key: 'good', label: 'ปกติ', title: 'สภาพดี ใช้งานได้' },
  { key: 'wear', label: 'สึกหรอ', title: 'สึกหรอตามการใช้งานปกติ แต่ยังใช้งานได้' },
  { key: 'damaged', label: 'ชำรุด', title: 'เสียหายหรือใช้งานไม่ได้' },
  { key: 'missing', label: 'สูญหาย', title: 'อุปกรณ์หรือทรัพย์สินที่ควรมีสูญหาย' },
  { key: 'not_applicable', label: 'ไม่มี', title: 'ไม่มีหรือติดตั้งรายการนี้ในห้อง' },
]

export const ISSUE_RESULTS = ['damaged', 'missing']

export const RESULT_LABELS = Object.fromEntries(RESULT_OPTIONS.map((option) => [option.key, option.label]))

// Results that can carry a damage amount at move-out.
export const COSTED_RESULTS = ['wear', 'damaged', 'missing']

// An asset is charged at move-out only when it was fine at move-in but is now
// damaged or missing; problems recorded at move-in are not the tenant's fault.
export function isChargeableAsset(asset) {
  return ISSUE_RESULTS.includes(asset.result) && !ISSUE_RESULTS.includes(asset.move_in_result)
}

export const assetPriceValue = (price) => Number(String(price ?? '').replace(/,/g, '').trim()) || 0

export const isValidAssetPrice = (price) => /^\d+(\.\d{1,2})?$/.test(String(price ?? '').replace(/,/g, '').trim())

// Starting damage amount when an asset gets a result: its price if chargeable, otherwise 0.
export const defaultAssetCost = (asset) => (isChargeableAsset(asset) ? String(assetPriceValue(asset.price)) : '0')

// The damage charged for one asset. Inspections saved before per-asset amounts
// existed have no `cost`, so they fall back to the chargeable rule.
export function assetCost(asset) {
  if (!COSTED_RESULTS.includes(asset.result)) return 0
  if (asset.cost !== undefined && asset.cost !== null) return assetPriceValue(asset.cost)
  return isChargeableAsset(asset) ? assetPriceValue(asset.price) : 0
}

export function chargeableAssetCost(assets = []) {
  return assets.reduce((sum, asset) => sum + assetCost(asset), 0)
}

export function itemCostTotal(checklist = {}, itemCosts = {}) {
  return Object.entries(itemCosts || {}).reduce(
    (sum, [key, cost]) => sum + (COSTED_RESULTS.includes(checklist[key]) ? assetPriceValue(cost) : 0),
    0,
  )
}
