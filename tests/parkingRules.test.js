import test from "node:test";
import assert from "node:assert/strict";
import {
  VISITOR_MAX_HOURS,
  calculateParkingFine,
  fineForElapsed,
  parseParkingInput,
  validateVisitorContact,
  visitorKey,
} from "../router/parking.js";

const HOUR = 3600;

test("visitor parking within 3 hours has no fine", () => {
  assert.deepEqual(fineForElapsed(0, 20), { overtimeHours: 0, amount: 0 });
  assert.deepEqual(fineForElapsed(2.5 * HOUR, 20), { overtimeHours: 0, amount: 0 });
  assert.deepEqual(fineForElapsed(VISITOR_MAX_HOURS * HOUR, 20), { overtimeHours: 0, amount: 0 });
});

test("visitor overtime rounds partial hours up to a full hour", () => {
  assert.deepEqual(fineForElapsed(3 * HOUR + 1, 20), { overtimeHours: 1, amount: 20 });
  assert.deepEqual(fineForElapsed(4 * HOUR, 20), { overtimeHours: 1, amount: 20 });
  assert.deepEqual(fineForElapsed(4 * HOUR + 60, 20), { overtimeHours: 2, amount: 40 });
  assert.deepEqual(fineForElapsed(7.25 * HOUR, 35.5), { overtimeHours: 5, amount: 177.5 });
});

test("fine uses the configured rate and ignores invalid rates", () => {
  assert.equal(fineForElapsed(5 * HOUR, 50).amount, 100);
  assert.equal(fineForElapsed(5 * HOUR, 0).amount, 0);
  assert.equal(fineForElapsed(5 * HOUR, "abc").amount, 0);
});

test("calculateParkingFine measures from the actual parking start", () => {
  const parkedAt = new Date("2026-10-24T08:00:00+07:00");
  assert.deepEqual(calculateParkingFine(parkedAt, new Date("2026-10-24T10:59:00+07:00"), 20), { overtimeHours: 0, amount: 0 });
  assert.deepEqual(calculateParkingFine(parkedAt, new Date("2026-10-24T11:20:00+07:00"), 20), { overtimeHours: 1, amount: 20 });
  assert.deepEqual(calculateParkingFine(parkedAt, new Date("2026-10-24T13:00:01+07:00"), 20), { overtimeHours: 3, amount: 60 });
});

test("parking input requires category, vehicle type and a space", () => {
  const base = { userCategory: "resident", vehicleType: "car", parkingSpaceId: 3, startAt: "2026-10-24 09:00:00", endAt: null };
  assert.equal(parseParkingInput(base).error, undefined);
  assert.match(parseParkingInput({ ...base, userCategory: "guest" }).error, /ประเภทผู้ใช้/);
  assert.match(parseParkingInput({ ...base, vehicleType: "truck" }).error, /ประเภทรถ/);
  assert.match(parseParkingInput({ ...base, parkingSpaceId: null }).error, /ช่องจอด/);
  assert.match(parseParkingInput({ ...base, startAt: "bad" }).error, /วันเวลาเริ่ม/);
  assert.match(parseParkingInput({ ...base, endAt: "2026-10-24 08:00:00" }).error, /สิ้นสุด/);
});

test("visitor sessions always end 3 hours after the start time on the server", () => {
  const { value } = parseParkingInput({
    userCategory: "visitor",
    vehicleType: "motorcycle",
    parkingSpaceId: 15,
    startAt: "2026-10-24 09:15:00",
    endAt: "2026-10-30 09:15:00",
  });
  assert.equal(value.startAt, "2026-10-24 09:15:00");
  assert.equal(value.endAt, "2026-10-24 12:15:00");
});

test("resident sessions keep open-ended and custom durations", () => {
  assert.equal(parseParkingInput({ userCategory: "resident", vehicleType: "car", parkingSpaceId: 1, startAt: "2026-10-24 09:00:00", endAt: "" }).value.endAt, null);
  assert.equal(
    parseParkingInput({ userCategory: "resident", vehicleType: "car", parkingSpaceId: 1, startAt: "2026-10-24 09:00:00", endAt: "2026-11-24 09:00:00" }).value.endAt,
    "2026-11-24 09:00:00",
  );
});

test("visitor contact needs a name and a valid phone number", () => {
  assert.equal(validateVisitorContact("สมชาย", "081-234-5678"), null);
  assert.match(validateVisitorContact("", "0812345678"), /ชื่อ/);
  assert.match(validateVisitorContact("สมชาย", "1234"), /เบอร์/);
  assert.equal(visitorKey("081-234 5678"), "0812345678");
});
