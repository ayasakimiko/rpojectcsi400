import bcrypt from "bcryptjs";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const { syncMoveOutDamageCharge } = await import("../router/moveOutDamage.js");

const ID_PREFIX = "99990000";
const PASSWORD = "123456";
const PRICE = 3500;
const DEPOSIT = PRICE * 2;
const CHECKLIST = { walls: "damaged", floor: "good", ceiling: "good", doors: "good", windows: "good", electrical: "good", bathroom: "good", furniture: "good" };

const ACTIVE_SCENARIOS = [
  { name: "เริ่มอีก20วัน", note: "เริ่มอีก 20 วัน ยังไม่จ่าย · ยังไม่มีแจ้งเตือน", startInDays: 20 },
  { name: "เริ่มอีก12วัน", note: "เริ่มอีก 12 วัน ยังไม่จ่าย · ได้แจ้งเตือนรอบ 15 วัน", startInDays: 12 },
  { name: "เริ่มอีก5วัน", note: "เริ่มอีก 5 วัน ยังไม่จ่าย · ได้แจ้งเตือนรอบ 7 วัน", startInDays: 5 },
  { name: "เริ่มวันนี้", note: "เริ่มวันนี้ ยังไม่จ่าย · แจ้งว่าเหลือ 7 วัน (ผู้เช่า+เจ้าหน้าที่)", startInDays: 0 },
  { name: "เริ่มมา3วัน", note: "เริ่มมาแล้ว 3 วัน ยังไม่จ่าย · เหลือ 4 วัน", startInDays: -3 },
  { name: "เลยกำหนด", note: "เลยกำหนดจ่ายแล้ว · จะถูกยกเลิกเมื่อระบบตรวจหรือผู้เช่าล็อกอิน", startInDays: -8, dueInDays: -1 },
  { name: "สลิปรอตรวจ", note: "เลยกำหนดแต่ส่งสลิปแล้ว รอเจ้าหน้าที่ตรวจ · ต้องไม่ถูกยกเลิก", startInDays: -8, dueInDays: -1, slipPending: true },
  { name: "จ่ายครบแล้ว", note: "จ่ายงวดแรกครบ · สัญญามีผลปกติ", startInDays: -3, paid: true },
  { name: "เสียหายเกินมัดจำ", note: "แจ้งย้ายออก ตรวจห้องแล้วเสียหาย 9,000 · มีบิลส่วนเกิน 2,000 ต้องจ่ายก่อนอนุมัติย้ายออก", startInDays: -60, paid: true, moveOutDamage: 9000 },
  { name: "รอตรวจห้องย้ายออก", note: "แจ้งย้ายออกแล้ว ยังไม่ตรวจห้อง · ให้เจ้าหน้าที่ตรวจห้องแล้วใส่ค่าเสียหายเกิน 7,000 เอง", startInDays: -60, paid: true, moveOutPending: true },
  { name: "ส่งสลิปส่วนเกิน", note: "ตรวจห้องเสียหาย 10,000 · ผู้เช่าส่งสลิปส่วนเกิน 3,000 แล้ว รอเจ้าหน้าที่ตรวจสลิป", startInDays: -60, paid: true, moveOutDamage: 10000, excessSlip: true },
  { name: "เสียหายพอดีมัดจำ", note: "ตรวจห้องเสียหาย 7,000 พอดีมัดจำ · ต้องไม่มีบิลส่วนเกิน และคืนมัดจำได้ ฿0", startInDays: -60, paid: true, moveOutDamage: 7000 },
];

const MOVED_OUT_SCENARIOS = [
  { name: "ออกก่อนครบ", note: "ย้ายออกก่อนครบสัญญา 30 วัน ค่าเสียหาย 500 · ต้องคืนมัดจำ (หักได้)", endOffsetDays: 30, damage: 500 },
  { name: "อยู่ครบ", note: "อยู่ครบสัญญา ไม่มีความเสียหาย · คืนมัดจำเต็ม", endOffsetDays: -1, damage: 0 },
  { name: "เกินมัดจำไม่มีบิล", note: "ย้ายออกแล้ว เสียหาย 9,000 ไม่มีบิลส่วนเกิน (ข้อมูลเก่า) · หน้าคืนมัดจำต้องเตือนสีแดง", endOffsetDays: -1, damage: 9000 },
  { name: "เกินมัดจำจ่ายแล้ว", note: "ย้ายออกแล้ว เสียหาย 9,000 จ่ายส่วนเกิน 2,000 แล้ว · หน้าคืนมัดจำขึ้นป้ายเขียว", endOffsetDays: -1, damage: 9000, excessPaid: true },
  { name: "คืนมัดจำแล้ว", note: "ย้ายออกแล้ว บันทึกคืนมัดจำแล้ว หัก 500 คืน 6,500 · ดูหน้าที่บันทึกแล้วและประวัติการคืน", endOffsetDays: 20, damage: 500, settledDeduction: 500 },
];

const SPECIAL_SCENARIOS = [
  { name: "มีสัญญาใหม่", note: "เคยเช่าห้องเก่า ตอนนี้ทำสัญญาใหม่อีกห้อง · เปิดสัญญาเก่าต้องเห็นป้ายสีม่วง", rooms: 2, seed: seedSuperseded },
  { name: "ยกเลิกมีมัดจำ", note: "สัญญาถูกยกเลิกเพราะไม่จ่ายค่าเช่างวดแรก แต่จ่ายมัดจำไว้ 7,000 · ต้องคืนมัดจำเต็ม", seed: seedVoidedWithDeposit },
];

async function freeRoomNumbers(db, count) {
  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 800 AND 899");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  const free = [];
  for (let number = 899; number >= 800 && free.length < count; number -= 1) if (!used.has(number)) free.push(number);
  if (free.length < count) throw new Error("ห้องเลข 800-899 ว่างไม่พอสำหรับข้อมูลทดสอบ");
  return free;
}

async function createCustomer(db, index, scenario, roomNumber, hash, suspended) {
  const [result] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount, is_suspended, suspended_at)
     VALUES (?, ?, ?, ?, 'ทดสอบระบบ', 25, ?, ?, ?, IF(?, NOW(), NULL))`,
    [
      `${ID_PREFIX}${String(index).padStart(5, "0")}`,
      hash,
      `0999${String(index).padStart(6, "0")}`,
      scenario.name,
      suspended ? null : roomNumber,
      DEPOSIT,
      suspended,
      suspended,
    ],
  );
  return result.insertId;
}

async function seedActive(db, scenario, index, roomNumber, hash) {
  const [roomResult] = await db.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date)
     VALUES (?, TRUE, ?, 6, DATE_ADD(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY),
             DATE_ADD(DATE_ADD(CURDATE() + INTERVAL 10 HOUR, INTERVAL ? DAY), INTERVAL 6 MONTH))`,
    [roomNumber, PRICE, scenario.startInDays, scenario.startInDays],
  );
  const customerId = await createCustomer(db, index, scenario, roomNumber, hash, false);
  const [[room]] = await db.query("SELECT rental_start_date, rental_end_date FROM Room WHERE id = ?", [roomResult.insertId]);
  const dueInDays = scenario.dueInDays ?? Math.max(scenario.startInDays, 0) + 7;
  const [bookingResult] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_duration_months, contract_completed_at,
                          deposit_amount, first_payment_due_date)
     VALUES (?, ?, ?, ?, 6, NOW(), ?, IF(?, NULL, DATE_ADD(CURDATE(), INTERVAL ? DAY)))`,
    [customerId, roomResult.insertId, room.rental_start_date, room.rental_end_date, DEPOSIT, Boolean(scenario.paid), dueInDays],
  );
  const bookingId = bookingResult.insertId;
  if (scenario.paid) {
    await db.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note)
       VALUES (?, ?, CURDATE(), 'paid', 'rent', 'ข้อมูลทดสอบ: ค่าเช่าเดือนแรก'), (?, ?, CURDATE(), 'paid', 'deposit', 'ข้อมูลทดสอบ: มัดจำ')`,
      [bookingId, PRICE * (scenario.moveOutDamage ? 3 : 1), bookingId, DEPOSIT],
    );
  }
  if (scenario.moveOutDamage) {
    const [requestResult] = await db.query(
      `INSERT INTO TenantRequest (customer_id, room_number, type, status, preferred_move_date, note, accepted_at, accepted_by_name)
       VALUES (?, ?, 'moveout', 'in_progress', CURDATE(), 'ข้อมูลทดสอบ: แจ้งย้ายออก', NOW(), 'ข้อมูลทดสอบ')`,
      [customerId, roomNumber],
    );
    await db.query(
      `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, checklist, damage_note, damage_cost, photos, status, reviewed_at)
       VALUES (?, ?, ?, ?, 'ผนังเป็นรูหลายจุด ประตูห้องน้ำแตก', ?, '[]', 'reviewed', NOW())`,
      [roomNumber, requestResult.insertId, `${scenario.name} ทดสอบระบบ`, JSON.stringify(CHECKLIST), scenario.moveOutDamage],
    );
    await syncMoveOutDamageCharge(db, requestResult.insertId);
    if (scenario.excessSlip) {
      await db.query(
        `UPDATE Payment p JOIN TenantRequest tr ON tr.damage_charge_payment_id = p.id
         SET p.slip_path = '/uploads/demo-slip.png', p.note = LEFT(CONCAT(COALESCE(p.note, ''), ' (รอตรวจสอบสลิป · ข้อมูลทดสอบ)'), 255)
         WHERE tr.id = ?`,
        [requestResult.insertId],
      );
    }
  }
  if (scenario.moveOutPending) {
    await db.query(
      `INSERT INTO TenantRequest (customer_id, room_number, type, status, preferred_move_date, note)
       VALUES (?, ?, 'moveout', 'pending', DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'ข้อมูลทดสอบ: แจ้งย้ายออก รอตรวจห้อง')`,
      [customerId, roomNumber],
    );
  }
  if (scenario.slipPending) {
    await db.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note, slip_path)
       VALUES (?, ?, CURDATE(), 'pending', 'rent', 'ข้อมูลทดสอบ: รอตรวจสอบสลิปค่าเช่า', '/uploads/demo-slip.png'),
              (?, ?, CURDATE(), 'pending', 'deposit', 'ข้อมูลทดสอบ: รอตรวจสอบสลิปมัดจำ', '/uploads/demo-slip.png')`,
      [bookingId, PRICE, bookingId, DEPOSIT],
    );
  }
  return { roomNumber, idcard: `${ID_PREFIX}${String(index).padStart(5, "0")}`, note: scenario.note };
}

async function seedMovedOut(db, scenario, index, roomNumber, hash) {
  const [roomResult] = await db.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, ?)", [roomNumber, PRICE]);
  const customerId = await createCustomer(db, index, scenario, roomNumber, hash, true);
  const [bookingResult] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, deposit_amount,
                          contract_duration_months, created_at, ended_at)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), DATE_ADD(CURDATE(), INTERVAL ? DAY), DATE_SUB(CURDATE(), INTERVAL 6 MONTH),
             ?, 6, DATE_SUB(NOW(), INTERVAL 6 MONTH), NOW())`,
    [customerId, roomResult.insertId, scenario.endOffsetDays, DEPOSIT],
  );
  const bookingId = bookingResult.insertId;
  await db.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), 'paid', 'rent', 'ข้อมูลทดสอบ: ค่าเช่าเดือนแรก'),
            (?, ?, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), 'paid', 'deposit', 'ข้อมูลทดสอบ: มัดจำ')`,
    [bookingId, PRICE, bookingId, DEPOSIT],
  );
  const [requestResult] = await db.query(
    `INSERT INTO TenantRequest (customer_id, room_number, type, status, preferred_move_date, completed_at)
     VALUES (?, ?, 'moveout', 'approved', CURDATE(), NOW())`,
    [customerId, roomNumber],
  );
  await db.query(
    `INSERT INTO MoveOutInspection (room_number, tenant_request_id, tenant_name, checklist, damage_note, damage_cost, photos, status)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 'reviewed')`,
    [
      roomNumber,
      requestResult.insertId,
      `${scenario.name} ทดสอบระบบ`,
      JSON.stringify(scenario.damage > 0 ? CHECKLIST : { ...CHECKLIST, walls: "good" }),
      scenario.damage > 0 ? "ผนังเป็นรู 1 จุด" : null,
      scenario.damage,
    ],
  );
  if (scenario.excessPaid) {
    await db.query(
      `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note)
       VALUES (?, ?, CURDATE(), 'paid', 'damage', 'ข้อมูลทดสอบ: ค่าเสียหายส่วนเกินเงินมัดจำ')`,
      [bookingId, scenario.damage - DEPOSIT],
    );
  }
  if (scenario.settledDeduction != null) {
    const refunded = DEPOSIT - scenario.settledDeduction;
    await db.query(
      `UPDATE Booking SET deposit_settlement = 'refunded', deposit_deduction = ?, deposit_refunded_amount = ?,
                          deposit_settlement_note = 'ผนังเป็นรู 1 จุด ค่าซ่อม 500 บาท', deposit_settled_at = NOW(),
                          deposit_settled_by_name = 'ข้อมูลทดสอบ'
       WHERE id = ?`,
      [scenario.settledDeduction, refunded, bookingId],
    );
    await db.query(
      `INSERT INTO DepositSettlementLog (booking_id, customer_id, room_number, tenant_name, action, deposit_amount, deduction,
                                        refunded_amount, forfeited_amount, note, contract_status, left_at, contract_end_date,
                                        left_reason, settled_by_name)
       VALUES (?, ?, ?, ?, 'refunded', ?, ?, ?, 0, 'ผนังเป็นรู 1 จุด ค่าซ่อม 500 บาท', 'ended_early', NOW(),
               DATE_ADD(CURDATE(), INTERVAL ? DAY), 'moveout', 'ข้อมูลทดสอบ')`,
      [bookingId, customerId, roomNumber, `${scenario.name} ทดสอบระบบ`, DEPOSIT, scenario.settledDeduction, refunded, scenario.endOffsetDays],
    );
  }
  return { roomNumber, idcard: "-", note: scenario.note };
}

async function seedSuperseded(db, scenario, index, [oldRoom, newRoom], hash) {
  const [oldRoomResult] = await db.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, ?)", [oldRoom, PRICE]);
  const [newRoomResult] = await db.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date)
     VALUES (?, TRUE, ?, 6, DATE_SUB(CURDATE(), INTERVAL 1 MONTH), DATE_ADD(CURDATE(), INTERVAL 5 MONTH))`,
    [newRoom, PRICE],
  );
  const customerId = await createCustomer(db, index, scenario, newRoom, hash, false);
  const [oldBooking] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, contract_duration_months,
                          deposit_amount, created_at, ended_at, deposit_settlement, deposit_deduction, deposit_refunded_amount,
                          deposit_settlement_note, deposit_settled_at, deposit_settled_by_name)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 7 MONTH), DATE_SUB(CURDATE(), INTERVAL 1 MONTH), DATE_SUB(NOW(), INTERVAL 7 MONTH), 6,
             ?, DATE_SUB(NOW(), INTERVAL 7 MONTH), DATE_SUB(NOW(), INTERVAL 1 MONTH), 'refunded', 0, ?, 'อยู่ครบสัญญา ห้องสภาพดี',
             DATE_SUB(NOW(), INTERVAL 1 MONTH), 'ข้อมูลทดสอบ')`,
    [customerId, oldRoomResult.insertId, DEPOSIT, DEPOSIT],
  );
  await db.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 7 MONTH), 'paid', 'rent', 'ข้อมูลทดสอบ: ค่าเช่าสัญญาเก่า'),
            (?, ?, DATE_SUB(CURDATE(), INTERVAL 7 MONTH), 'paid', 'deposit', 'ข้อมูลทดสอบ: มัดจำสัญญาเก่า')`,
    [oldBooking.insertId, PRICE * 6, oldBooking.insertId, DEPOSIT],
  );
  const [[room]] = await db.query("SELECT rental_start_date, rental_end_date FROM Room WHERE id = ?", [newRoomResult.insertId]);
  const [newBooking] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, contract_duration_months, deposit_amount)
     VALUES (?, ?, ?, ?, NOW(), 6, ?)`,
    [customerId, newRoomResult.insertId, room.rental_start_date, room.rental_end_date, DEPOSIT],
  );
  await db.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note)
     VALUES (?, ?, CURDATE(), 'paid', 'rent', 'ข้อมูลทดสอบ: ค่าเช่าสัญญาใหม่'), (?, ?, CURDATE(), 'paid', 'deposit', 'ข้อมูลทดสอบ: มัดจำสัญญาใหม่')`,
    [newBooking.insertId, PRICE * 2, newBooking.insertId, DEPOSIT],
  );
  return { roomNumber: `${oldRoom} → ${newRoom}`, idcard: `${ID_PREFIX}${String(index).padStart(5, "0")}`, note: scenario.note };
}

async function seedVoidedWithDeposit(db, scenario, index, roomNumber, hash) {
  const [roomResult] = await db.query("INSERT INTO Room (room_number, is_booked, price) VALUES (?, FALSE, ?)", [roomNumber, PRICE]);
  const customerId = await createCustomer(db, index, scenario, roomNumber, hash, true);
  const [bookingResult] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, contract_duration_months,
                          deposit_amount, created_at, ended_at, first_payment_due_date, first_payment_voided_at)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 10 DAY), INTERVAL 6 MONTH),
             DATE_SUB(NOW(), INTERVAL 18 DAY), 6, ?, DATE_SUB(NOW(), INTERVAL 18 DAY), NOW(),
             DATE_SUB(CURDATE(), INTERVAL 3 DAY), NOW())`,
    [customerId, roomResult.insertId, DEPOSIT],
  );
  await db.query(
    `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 15 DAY), 'paid', 'deposit', 'ข้อมูลทดสอบ: จ่ายมัดจำแต่ไม่จ่ายค่าเช่า')`,
    [bookingResult.insertId, DEPOSIT],
  );
  return { roomNumber, idcard: "-", note: scenario.note };
}

async function clean(db) {
  const [customers] = await db.query("SELECT id FROM Customer WHERE idcard LIKE ?", [`${ID_PREFIX}%`]);
  if (customers.length === 0) return 0;
  const customerIds = customers.map((row) => row.id);
  const [bookings] = await db.query("SELECT id, room_id FROM Booking WHERE customer_id IN (?)", [customerIds]);
  const bookingIds = bookings.map((row) => row.id);
  const roomIds = [...new Set(bookings.map((row) => row.room_id))];
  const [requests] = await db.query("SELECT id FROM TenantRequest WHERE customer_id IN (?)", [customerIds]);
  if (bookingIds.length) {
    await db.query("DELETE FROM DepositSettlementLog WHERE booking_id IN (?)", [bookingIds]);
    await db.query("DELETE FROM Payment WHERE booking_id IN (?)", [bookingIds]);
  }
  if (requests.length) await db.query("DELETE FROM MoveOutInspection WHERE tenant_request_id IN (?)", [requests.map((row) => row.id)]);
  await db.query("DELETE FROM TenantRequest WHERE customer_id IN (?)", [customerIds]);
  await db.query("DELETE FROM MaintenanceRequest WHERE customer_id IN (?)", [customerIds]);
  try {
    await db.query(
      `DELETE FROM Notification WHERE (audience = 'Customer' AND recipient_id IN (?))
         OR (ref_table = 'Booking' AND ref_id IN (?)) OR (ref_table = 'Customer' AND ref_id IN (?))`,
      [customerIds, bookingIds.length ? bookingIds : [0], customerIds],
    );
  } catch (error) {
    console.warn("ลบแจ้งเตือนทดสอบไม่สำเร็จ (ข้ามได้):", error.message);
  }
  await db.query("DELETE FROM Booking WHERE customer_id IN (?)", [customerIds]);
  await db.query("DELETE FROM Customer WHERE id IN (?)", [customerIds]);
  if (roomIds.length) await db.query("DELETE FROM Room WHERE id IN (?)", [roomIds]);
  return customerIds.length;
}

async function seed(db) {
  const removed = await clean(db);
  if (removed) console.log(`ลบข้อมูลทดสอบชุดเก่า ${removed} คน`);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const scenarios = [
    ...ACTIVE_SCENARIOS.map((scenario) => ({ ...scenario, seed: seedActive })),
    ...MOVED_OUT_SCENARIOS.map((scenario) => ({ ...scenario, seed: seedMovedOut })),
    ...SPECIAL_SCENARIOS,
  ];
  const rooms = await freeRoomNumbers(db, scenarios.reduce((total, scenario) => total + (scenario.rooms || 1), 0));
  const rows = [];
  for (const [index, scenario] of scenarios.entries()) {
    const taken = rooms.splice(0, scenario.rooms || 1);
    rows.push(await scenario.seed(db, scenario, index + 1, scenario.rooms ? taken : taken[0], hash));
  }
  console.log(`\nสร้างข้อมูลทดสอบแล้ว ${rows.length} สถานการณ์ · รหัสผ่านผู้เช่าทุกคน: ${PASSWORD}\n`);
  for (const row of rows) console.log(`ห้อง ${row.roomNumber} · เลขบัตร ${row.idcard} · ${row.note}`);
}

const command = process.argv[2];
const db = getPool();
try {
  if (command === "seed") await seed(db);
  else if (command === "clean") console.log(`ลบข้อมูลทดสอบแล้ว ${await clean(db)} คน`);
  else console.log("ใช้: node scripts/seedContractDemo.js seed | clean");
} finally {
  await db.end();
}
