import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { configureDatabaseService, getPool } from "../Database/connection.js";
import { deletePublicImages } from "../middleware/publicUploads.js";

configureDatabaseService("staff");

const API = process.env.PARKING_API_URL || "http://localhost:4000";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TAG = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const PLATE = (suffix) => `PT${TAG}${suffix}`;
const fixture = {};
let originalConfig = null;

function pad(number) {
  return String(number).padStart(2, "0");
}

function sqlTime(offsetMinutes) {
  const date = new Date(Date.now() + offsetMinutes * 60000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

async function call(method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function freeSpaces(vehicleType, startAt, endAt, userCategory = "resident") {
  const query = new URLSearchParams({ userCategory, startAt, ...(endAt ? { endAt } : {}) });
  const { data } = await call("GET", `/api/staff/parking/options?${query}`, fixture.staffToken);
  return data.spaces.filter((space) => space.vehicle_type === vehicleType && space.available);
}

async function freeRoomNumber(db) {
  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  for (let number = 998; number >= 900; number -= 1) if (!used.has(number)) return number;
  throw new Error("no free test room");
}

before(async () => {
  const db = getPool();
  const [[staff]] = await db.query("SELECT id FROM Staff LIMIT 1");
  assert.ok(staff, "ต้องมีบัญชี Staff อย่างน้อย 1 บัญชี");
  fixture.staffToken = jwt.sign({ id: staff.id, role: "Staff" }, SECRET, { expiresIn: "10m" });
  fixture.roomNumber = await freeRoomNumber(db);
  const [room] = await db.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, TRUE, 3000)", [fixture.roomNumber]);
  fixture.roomId = room.insertId;
  const [customer] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount, is_suspended)
     VALUES (?, 'x', ?, 'ทดสอบ', 'ที่จอดรถ', 30, ?, 0, FALSE)`,
    [`P${TAG}${Date.now()}`.slice(0, 13), `09${String(Date.now()).slice(-8)}`, fixture.roomNumber],
  );
  fixture.customerId = customer.insertId;
  fixture.customerToken = jwt.sign({ id: customer.insertId, role: "Customer" }, SECRET, { expiresIn: "10m" });
  const [[config]] = await db.query("SELECT payment_test_mode, slip_verify_mode, parking_fine_per_hour FROM DormConfig WHERE id = 1");
  originalConfig = config;
  await db.query("UPDATE DormConfig SET payment_test_mode = TRUE, slip_verify_mode = 'auto', parking_fine_per_hour = 25 WHERE id = 1");
});

after(async () => {
  const db = getPool();
  try {
    if (originalConfig) {
      await db.query("UPDATE DormConfig SET payment_test_mode = ?, slip_verify_mode = ?, parking_fine_per_hour = ? WHERE id = 1", [
        originalConfig.payment_test_mode,
        originalConfig.slip_verify_mode,
        originalConfig.parking_fine_per_hour,
      ]);
    }
    const [slips] = await db.query("SELECT fine_slip_path FROM ResidentVisitRequest WHERE vehicle_plate LIKE ? AND fine_slip_path IS NOT NULL", [`PT${TAG}%`]);
    await deletePublicImages(slips.map((row) => row.fine_slip_path)).catch(() => {});
    await db.query("DELETE FROM ResidentVisitRequest WHERE vehicle_plate LIKE ?", [`PT${TAG}%`]);
    if (fixture.customerId) {
      await db.query("DELETE FROM ResidentVisitRequest WHERE customer_id = ?", [fixture.customerId]);
      await db.query("DELETE FROM Customer WHERE id = ?", [fixture.customerId]);
    }
    if (fixture.roomId) await db.query("DELETE FROM Room WHERE id = ?", [fixture.roomId]);
  } finally {
    await db.end();
  }
});

test("resident can register only one car and one motorcycle", async () => {
  const start = sqlTime(0);
  const [carSpace, secondCarSpace] = await freeSpaces("car", start, null);
  const [motoSpace] = await freeSpaces("motorcycle", start, null);
  assert.ok(carSpace && secondCarSpace && motoSpace, "ต้องมีช่องจอดว่างสำหรับทดสอบ");
  const base = { userCategory: "resident", roomNumber: fixture.roomNumber, startAt: start, endAt: null };

  const car = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    ...base, vehicleType: "car", parkingSpaceId: carSpace.id, vehiclePlate: PLATE("C1"),
  });
  assert.equal(car.status, 201, JSON.stringify(car.data));

  const secondCar = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    ...base, vehicleType: "car", parkingSpaceId: secondCarSpace.id, vehiclePlate: PLATE("C2"),
  });
  assert.equal(secondCar.status, 409);
  assert.equal(secondCar.data.code, "PARKING_VEHICLE_LIMIT");

  const viaCustomer = await call("POST", "/api/customer/resident-visit-requests", fixture.customerToken, {
    requestType: "vehicle", ...base, vehicleType: "car", parkingSpaceId: secondCarSpace.id, vehiclePlate: PLATE("C3"),
  });
  assert.equal(viaCustomer.status, 409, JSON.stringify(viaCustomer.data));
  assert.equal(viaCustomer.data.code, "PARKING_VEHICLE_LIMIT");

  const moto = await call("POST", "/api/customer/resident-visit-requests", fixture.customerToken, {
    requestType: "vehicle", ...base, vehicleType: "motorcycle", parkingSpaceId: motoSpace.id, vehiclePlate: PLATE("M1"),
  });
  assert.equal(moto.status, 201, JSON.stringify(moto.data));

  const { data } = await call("GET", "/api/customer/parking/options", fixture.customerToken);
  assert.deepEqual(data.usage.resident, { car: 1, motorcycle: 1 });

  const secondMoto = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    ...base, vehicleType: "motorcycle", parkingSpaceId: motoSpace.id, vehiclePlate: PLATE("M2"),
  });
  assert.equal(secondMoto.status, 409);
});

test("space must match the vehicle type", async () => {
  const start = sqlTime(0);
  const [motoSpace] = await freeSpaces("motorcycle", start, sqlTime(180), "visitor");
  const result = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    userCategory: "visitor", vehicleType: "car", parkingSpaceId: motoSpace.id, vehiclePlate: PLATE("X1"),
    guestName: "ผู้ทดสอบ", guestPhone: `08${TAG.length}1111111`, startAt: start,
  });
  assert.equal(result.status, 400);
  assert.match(result.data.message, /สำหรับรถจักรยานยนต์เท่านั้น/);
});

test("the same space cannot be booked twice, even concurrently", async () => {
  const start = sqlTime(60);
  const [space] = await freeSpaces("car", start, sqlTime(240), "visitor");
  const payload = (suffix, phone) => ({
    userCategory: "visitor", vehicleType: "car", parkingSpaceId: space.id, vehiclePlate: PLATE(suffix),
    guestName: `ผู้มาติดต่อ ${suffix}`, guestPhone: phone, startAt: start,
  });
  const results = await Promise.all([
    call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, payload("D1", "0811110001")),
    call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, payload("D2", "0811110002")),
  ]);
  const statuses = results.map((result) => result.status).sort();
  assert.deepEqual(statuses, [201, 409], JSON.stringify(results.map((result) => result.data)));
  assert.equal(results.find((result) => result.status === 409).data.code, "PARKING_SPACE_TAKEN");

  const overlapping = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    ...payload("D3", "0811110003"),
    startAt: sqlTime(120),
  });
  assert.equal(overlapping.status, 409);
  const later = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    ...payload("D4", "0811110004"),
    startAt: sqlTime(300),
  });
  assert.equal(later.status, 201, JSON.stringify(later.data));

  const spaces = await freeSpaces("car", sqlTime(90), sqlTime(270), "visitor");
  assert.ok(!spaces.some((entry) => entry.id === space.id), "ช่องที่ถูกจองต้องแสดงว่าไม่ว่าง");
});

test("visitor may register one car and one motorcycle per phone", async () => {
  const start = sqlTime(30);
  const [carA, carB] = await freeSpaces("car", start, sqlTime(210), "visitor");
  const [moto] = await freeSpaces("motorcycle", start, sqlTime(210), "visitor");
  const base = { userCategory: "visitor", guestName: "ผู้มาติดต่อจำกัดคัน", guestPhone: "0822223333", startAt: start };
  const first = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    ...base, vehicleType: "car", parkingSpaceId: carA.id, vehiclePlate: PLATE("V1"),
  });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const second = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    ...base, guestPhone: "082-222-3333", vehicleType: "car", parkingSpaceId: carB.id, vehiclePlate: PLATE("V2"),
  });
  assert.equal(second.status, 409);
  assert.equal(second.data.code, "PARKING_VEHICLE_LIMIT");
  const motorcycle = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    ...base, vehicleType: "motorcycle", parkingSpaceId: moto.id, vehiclePlate: PLATE("V3"),
  });
  assert.equal(motorcycle.status, 201, JSON.stringify(motorcycle.data));
});

async function createParkedVisitor(suffix, phone, minutesAgo) {
  const start = sqlTime(-minutesAgo);
  const [space] = await freeSpaces("motorcycle", start, sqlTime(-minutesAgo + 180), "visitor");
  const created = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    userCategory: "visitor", vehicleType: "motorcycle", parkingSpaceId: space.id, vehiclePlate: PLATE(suffix),
    guestName: `ผู้มาติดต่อ ${suffix}`, guestPhone: phone, startAt: start,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const [[row]] = await getPool().query("SELECT parked_at, start_at, end_at FROM ResidentVisitRequest WHERE id = ?", [created.data.id]);
  assert.ok(row.parked_at, "รถผู้มาติดต่อที่เริ่มจอดแล้วต้องถูกเช็คอินอัตโนมัติ");
  return created.data.id;
}

test("visitor session within 3 hours ends without a fine", async () => {
  const id = await createParkedVisitor("W1", "0833330001", 120);
  const ended = await call("DELETE", `/api/staff/resident-visit-requests/${id}`, fixture.staffToken);
  assert.equal(ended.status, 200, JSON.stringify(ended.data));
  assert.equal(ended.data.checkedOut, true);
  assert.equal(ended.data.amount, 0);
  const [[row]] = await getPool().query("SELECT status, fine_status, fine_amount, checked_out_at FROM ResidentVisitRequest WHERE id = ?", [id]);
  assert.equal(row.fine_status, "none");
  assert.ok(row.checked_out_at);
});

test("visitor exceeding 3 hours is fined per started hour and pays by QR slip", async () => {
  const id = await createParkedVisitor("F1", "0844440001", 4 * 60 + 30);
  const list = await call("GET", "/api/staff/resident-visit-requests", fixture.staffToken);
  const live = list.data.requests.find((request) => request.id === id);
  assert.equal(live.live_fine_hours, 2);
  assert.equal(live.live_fine_amount, 50);

  const otherType = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    userCategory: "visitor", vehicleType: "car", parkingSpaceId: (await freeSpaces("car", sqlTime(0), sqlTime(180), "visitor"))[0].id,
    vehiclePlate: PLATE("F2"), guestName: "ผู้มาติดต่อ F2", guestPhone: "0844440001", startAt: sqlTime(0),
  });
  assert.equal(otherType.status, 201, "ระหว่างที่ยังจอดอยู่ (ยังไม่สร้างค่าปรับ) ลงทะเบียนรถอีกประเภทได้");

  const ended = await call("DELETE", `/api/staff/resident-visit-requests/${id}`, fixture.staffToken);
  assert.equal(ended.status, 200, JSON.stringify(ended.data));
  assert.equal(ended.data.overtimeHours, 2);
  assert.equal(ended.data.amount, 50);

  const [[row]] = await getPool().query("SELECT fine_status, fine_amount, fine_hours, fine_rate FROM ResidentVisitRequest WHERE id = ?", [id]);
  assert.equal(row.fine_status, "unpaid");
  assert.equal(Number(row.fine_amount), 50);
  assert.equal(Number(row.fine_hours), 2);
  assert.equal(Number(row.fine_rate), 25);

  const unpaidBlock = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    userCategory: "visitor", vehicleType: "motorcycle", parkingSpaceId: (await freeSpaces("motorcycle", sqlTime(0), sqlTime(180), "visitor"))[0].id,
    vehiclePlate: PLATE("F3"), guestName: "ผู้มาติดต่อ F3", guestPhone: "0844440001", startAt: sqlTime(0),
  });
  assert.equal(unpaidBlock.status, 409);
  assert.equal(unpaidBlock.data.code, "PARKING_UNPAID_FINE");

  const missingSlip = await call("POST", `/api/staff/resident-visit-requests/${id}/fine-payment`, fixture.staffToken, new FormData());
  assert.equal(missingSlip.status, 400);

  const form = new FormData();
  form.append("payment_method", "promptpay");
  form.append("slip", new Blob([Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==", "base64")], { type: "image/jpeg" }), "slip.jpg");
  const paid = await call("POST", `/api/staff/resident-visit-requests/${id}/fine-payment`, fixture.staffToken, form);
  assert.equal(paid.status, 201, JSON.stringify(paid.data));
  assert.equal(paid.data.fineStatus, "paid");

  const [[afterPay]] = await getPool().query("SELECT fine_status, fine_trans_ref, fine_paid_at FROM ResidentVisitRequest WHERE id = ?", [id]);
  assert.equal(afterPay.fine_status, "paid");
  assert.match(afterPay.fine_trans_ref, /^TEST-/);
  assert.ok(afterPay.fine_paid_at);

  const again = await call("POST", `/api/staff/resident-visit-requests/${id}/fine-payment`, fixture.staffToken, form);
  assert.equal(again.status, 409);
});

test("staff can confirm a counter payment for an unpaid fine", async () => {
  const id = await createParkedVisitor("K1", "0855550001", 3 * 60 + 10);
  const ended = await call("DELETE", `/api/staff/resident-visit-requests/${id}`, fixture.staffToken);
  assert.equal(ended.data.amount, 25);
  const confirmed = await call("POST", `/api/staff/resident-visit-requests/${id}/fine-review`, fixture.staffToken, { decision: "approve" });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  const [[row]] = await getPool().query("SELECT fine_status, fine_payment_method FROM ResidentVisitRequest WHERE id = ?", [id]);
  assert.equal(row.fine_status, "paid");
  assert.equal(row.fine_payment_method, "counter");
});

test("checked-in visitors are not auto-expired and keep blocking their space", async () => {
  const id = await createParkedVisitor("E1", "0866660001", 5 * 60);
  const list = await call("GET", "/api/staff/resident-visit-requests", fixture.staffToken);
  const row = list.data.requests.find((request) => request.id === id);
  assert.equal(row.status, "approved");
  const spaces = await freeSpaces("motorcycle", sqlTime(0), sqlTime(60), "visitor");
  assert.ok(!spaces.some((space) => space.id === row.parking_space_id));
});

test("visitor check-in starts the 3 hour window from the actual time", async () => {
  const start = sqlTime(90);
  const [space] = await freeSpaces("car", start, sqlTime(270), "visitor");
  const created = await call("POST", "/api/staff/resident-visit-requests", fixture.staffToken, {
    userCategory: "visitor", vehicleType: "car", parkingSpaceId: space.id, vehiclePlate: PLATE("I1"),
    guestName: "ผู้มาติดต่อ I1", guestPhone: "0877770001", startAt: start,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const [[before]] = await getPool().query("SELECT parked_at FROM ResidentVisitRequest WHERE id = ?", [created.data.id]);
  assert.equal(before.parked_at, null);
  const checkedIn = await call("POST", `/api/staff/resident-visit-requests/${created.data.id}/check-in`, fixture.staffToken);
  assert.equal(checkedIn.status, 200, JSON.stringify(checkedIn.data));
  const [[after]] = await getPool().query(
    "SELECT TIMESTAMPDIFF(MINUTE, parked_at, end_at) AS minutes, TIMESTAMPDIFF(SECOND, parked_at, NOW()) AS age FROM ResidentVisitRequest WHERE id = ?",
    [created.data.id],
  );
  assert.equal(Number(after.minutes), 180);
  assert.ok(Number(after.age) < 60);
  const twice = await call("POST", `/api/staff/resident-visit-requests/${created.data.id}/check-in`, fixture.staffToken);
  assert.equal(twice.status, 409);
});

test("tenants can only register vehicles as the resident of their own room", async () => {
  const start = sqlTime(0);
  const [space] = await freeSpaces("car", start, sqlTime(180), "visitor");
  const result = await call("POST", "/api/customer/resident-visit-requests", fixture.customerToken, {
    requestType: "vehicle", userCategory: "visitor", vehicleType: "car", parkingSpaceId: space.id,
    vehiclePlate: PLATE("R1"), guestName: "แขกของผู้เช่า", guestPhone: "0899990001", startAt: start,
  });
  assert.equal(result.status, 403);
  assert.equal(result.data.code, "RESIDENT_ONLY");
});

test("tenant parking always runs from now until the contract ends, ignoring client times", async () => {
  const db = getPool();
  await db.query("UPDATE Room SET rental_end_date = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?", [fixture.roomId]);
  await db.query("DELETE FROM ResidentVisitRequest WHERE customer_id = ?", [fixture.customerId]);
  const { data: options } = await call("GET", "/api/customer/parking/options", fixture.customerToken);
  assert.ok(options.residentWindow?.endAt, "ต้องส่งวันสิ้นสุดสัญญากลับมา");
  const space = options.spaces.find((entry) => entry.vehicle_type === "car" && entry.available);
  const created = await call("POST", "/api/customer/resident-visit-requests", fixture.customerToken, {
    requestType: "vehicle", userCategory: "resident", vehicleType: "car", parkingSpaceId: space.id,
    vehiclePlate: PLATE("T1"), startAt: "2030-01-01 00:00:00", endAt: "2030-01-02 00:00:00",
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const [[row]] = await db.query(
    `SELECT ABS(TIMESTAMPDIFF(MINUTE, r.start_at, NOW())) AS startDrift, r.end_at = rm.rental_end_date AS endsWithContract
     FROM ResidentVisitRequest r JOIN Room rm ON rm.id = ? WHERE r.id = ?`,
    [fixture.roomId, created.data.id],
  );
  assert.ok(Number(row.startDrift) <= 1);
  assert.equal(Number(row.endsWithContract), 1);

  await db.query("UPDATE Room SET rental_end_date = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?", [fixture.roomId]);
  const expired = await call("POST", "/api/customer/resident-visit-requests", fixture.customerToken, {
    requestType: "vehicle", userCategory: "resident", vehicleType: "motorcycle", parkingSpaceId: space.id, vehiclePlate: PLATE("T2"),
  });
  assert.equal(expired.status, 409);
});
