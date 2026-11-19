import { ROOM_TRANSFER_MIN_CONTRACT_IMAGES } from "../middleware/validation.js";
import { validateName } from "../src/utils/validators.js";
import { contractImagesParser, loadContractByBooking } from "./rentalContracts.js";

export const AMENDMENT_REASONS = {
  typo: "แก้ไขข้อมูลที่บันทึกผิดพลาด",
  legal_name_change: "เปลี่ยนชื่อ-นามสกุลตามกฎหมาย",
  document_update: "ทำเอกสารสัญญาใหม่ (ฉบับเดิมชำรุด/ไม่ชัด/สูญหาย)",
};
export const AMENDMENT_NAME_REASONS = new Set(["typo", "legal_name_change"]);
export const AMENDMENT_MIN_IMAGES = ROOM_TRANSFER_MIN_CONTRACT_IMAGES;
export const AMENDMENT_NOTE_MIN = 10;

export class ContractAmendmentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fullName = (first, last) => `${first || ""} ${last || ""}`.trim();

export function parseAmendmentInput(body = {}, contract) {
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!AMENDMENT_REASONS[reason]) return { error: "กรุณาเลือกเหตุผลการแก้ไขสัญญา" };
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length < AMENDMENT_NOTE_MIN) {
    return { error: `กรุณาอธิบายเหตุผลที่แก้ไขสัญญาอย่างน้อย ${AMENDMENT_NOTE_MIN} ตัวอักษร` };
  }
  if (note.length > 500) return { error: "เหตุผลที่แก้ไขสัญญายาวเกิน 500 ตัวอักษร" };
  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : contract.first_name || "";
  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : contract.last_name || "";
  const nameError = validateName(firstName, "ชื่อ") || validateName(lastName, "นามสกุล");
  if (nameError) return { error: nameError };
  const nameChanged = firstName !== (contract.first_name || "") || lastName !== (contract.last_name || "");
  if (AMENDMENT_NAME_REASONS.has(reason) && !nameChanged) {
    return { error: "เหตุผลที่เลือกเป็นการแก้ชื่อ แต่ชื่อ-นามสกุลยังเหมือนเดิม" };
  }
  return { value: { reason, note, firstName, lastName, nameChanged } };
}

export async function applyContractAmendment(connection, { bookingId, input, images, staffName }) {
  if (images.length < AMENDMENT_MIN_IMAGES) {
    throw new ContractAmendmentError(400, `กรุณาแนบรูปสัญญาฉบับแก้ไขที่ลงนามทั้งสองฝ่ายอย่างน้อย ${AMENDMENT_MIN_IMAGES} รูป`);
  }
  const [bookingRows] = await connection.query(
    "SELECT id, customer_id FROM Booking WHERE id = ? AND contract_completed_at IS NOT NULL FOR UPDATE",
    [bookingId],
  );
  if (!bookingRows[0]) throw new ContractAmendmentError(404, "ไม่พบสัญญานี้");
  const contract = await loadContractByBooking(connection, bookingId);
  if (!contract) throw new ContractAmendmentError(404, "ไม่พบสัญญานี้");
  if (contract.is_archived) throw new ContractAmendmentError(409, "สัญญาที่สิ้นสุดแล้วแก้ไขไม่ได้ เก็บไว้เป็นประวัติเท่านั้น");

  const [[{ next }]] = await connection.query(
    "SELECT COALESCE(MAX(version_no), 0) + 1 AS next FROM ContractAmendment WHERE booking_id = ?",
    [bookingId],
  );
  const versionNo = Number(next);
  const changes = [];
  if (input.nameChanged) {
    changes.push({
      field: "name",
      label: "ชื่อ-นามสกุลผู้เช่า",
      before: fullName(contract.first_name, contract.last_name),
      after: fullName(input.firstName, input.lastName),
    });
    await connection.query("UPDATE Customer SET first_name = ?, last_name = ? WHERE id = ?", [
      input.firstName,
      input.lastName,
      contract.customer_id,
    ]);
  }
  changes.push({
    field: "images",
    label: "รูปสัญญา",
    before: `ฉบับเดิม ${contract.images.length} รูป`,
    after: `ฉบับแก้ไขลงนามทั้งสองฝ่าย ${images.length} รูป`,
  });

  const [result] = await connection.query(
    `INSERT INTO ContractAmendment (booking_id, customer_id, version_no, reason, changes, note, amended_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [bookingId, contract.customer_id, versionNo, input.reason, JSON.stringify(changes), input.note, staffName || null],
  );
  const amendmentId = result.insertId;
  await connection.query(
    "UPDATE ContractImage SET replaced_at = NOW(), replaced_by_amendment_id = ? WHERE booking_id = ? AND replaced_at IS NULL",
    [amendmentId, bookingId],
  );
  await connection.query(
    "INSERT INTO ContractImage (booking_id, customer_id, name, url, amendment_id) VALUES ?",
    [images.map((image) => [bookingId, contract.customer_id, image.name, image.url, amendmentId])],
  );
  return { amendmentId, versionNo, changes, contract };
}

export const amendmentSummary = (changes) =>
  changes.map((change) => (change.field === "name" ? `ชื่อ ${change.before} → ${change.after}` : `รูปสัญญา: ${change.after}`)).join(" · ");

export const parseAmendmentImages = contractImagesParser({ min: AMENDMENT_MIN_IMAGES });
