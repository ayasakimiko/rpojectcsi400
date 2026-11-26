import test from "node:test";
import assert from "node:assert/strict";
import { applyVendorChange, buildVendorChange, publicChange } from "../router/repairVendorChanges.js";

// a RepairVendor row as the DB returns it (dates already DATE_FORMAT-ed, fee as DECIMAL string)
const ROW = {
  id: 7, name: "RenoCare", contact_name: "คุณเอ", phone: "0927823727", email: "a@renocare.co",
  specialties: "aircon,plumbing", specialty_other: null, contract_type: "monthly",
  contract_start: "2026-10-26", contract_end: "2026-11-30", contract_fee: "3000.00",
  webhook_url: "https://renocare.example/hook", note: "หมายเหตุภายในหอ", is_active: 1,
};

const expectError = (run, code, pattern) => assert.throws(run, (error) => {
  assert.equal(error.code, code);
  if (pattern) assert.match(error.message, pattern);
  return true;
});

test("keeps only the fields that really change, with their current values", () => {
  const result = buildVendorChange(ROW, {
    changes: { phone: "0811111111", contract_fee: 3500, contract_end: "2026-12-31", name: "RenoCare" },
    reason: "  ต่อสัญญาอีก 1 เดือน  ",
  });
  assert.deepEqual(result.changes, { phone: "0811111111", contract_end: "2026-12-31", contract_fee: 3500 });
  assert.deepEqual(result.previous, { phone: "0927823727", contract_end: "2026-11-30", contract_fee: 3000 });
  assert.equal(result.reason, "ต่อสัญญาอีก 1 เดือน");
});

test("specialties in another order is not a change; dropping 'other' clears its text", () => {
  expectError(() => buildVendorChange(ROW, { changes: { specialties: ["plumbing", "aircon"] } }), "NO_CHANGES");
  const withOther = { ...ROW, specialties: "aircon,other", specialty_other: "ทาสี" };
  const result = buildVendorChange(withOther, { changes: { specialties: ["aircon"] } });
  assert.deepEqual(result.changes, { specialties: ["aircon"], specialty_other: null });
  assert.deepEqual(result.previous, { specialties: ["aircon", "other"], specialty_other: "ทาสี" });
});

test("dorm-only and unknown fields are refused", () => {
  for (const field of ["webhook_url", "note", "is_active", "id"]) {
    expectError(() => buildVendorChange(ROW, { changes: { [field]: "x" } }), "FIELD_NOT_ALLOWED", new RegExp(field));
  }
  expectError(() => buildVendorChange(ROW, { changes: { phone: "0811111111" }, status: "approved" }), "FIELD_NOT_ALLOWED");
});

test("the merged result must still be a valid vendor", () => {
  expectError(() => buildVendorChange(ROW, { changes: { contract_end: "2026-10-01" } }), "VALIDATION_ERROR", /วันสิ้นสุดสัญญา/);
  expectError(() => buildVendorChange(ROW, { changes: { phone: "12345" } }), "VALIDATION_ERROR");
  expectError(() => buildVendorChange(ROW, { changes: { contract_fee: 0 } }), "VALIDATION_ERROR");
  expectError(() => buildVendorChange(ROW, { changes: {} }), "VALIDATION_ERROR");
  expectError(() => buildVendorChange(ROW, { changes: [] }), "VALIDATION_ERROR");
  expectError(() => buildVendorChange(ROW, null), "VALIDATION_ERROR");
});

test("approving re-validates against the row as it is now and keeps dorm-only fields", () => {
  const next = applyVendorChange(ROW, { contract_end: "2026-12-31", contract_fee: 3500, webhook_url: "https://evil.example" });
  assert.equal(next.contract_end, "2026-12-31");
  assert.equal(next.contract_fee, 3500);
  assert.equal(next.webhook_url, ROW.webhook_url);
  assert.equal(next.note, ROW.note);
  assert.equal(next.specialties, "aircon,plumbing");
  // staff moved the start date after the request was made: an end before it can no longer be approved
  expectError(() => applyVendorChange({ ...ROW, contract_start: "2027-01-15" }, { contract_end: "2026-12-31" }), "VALIDATION_ERROR");
});

test("publicChange parses stored JSON and survives a broken value", () => {
  const row = { id: 1, status: "pending", changes: '{"phone":"0811111111"}', previous: "not json" };
  const result = publicChange(row);
  assert.deepEqual(result.changes, { phone: "0811111111" });
  assert.deepEqual(result.previous, {});
});
