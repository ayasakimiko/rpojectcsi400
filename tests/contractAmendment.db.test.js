import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureDatabaseService, getPool } from "../Database/connection.js";

configureDatabaseService("staff");

const { applyContractAmendment, ContractAmendmentError, parseAmendmentInput } = await import("../router/contractAmendments.js");
const { loadContractByBooking } = await import("../router/rentalContracts.js");

after(async () => {
  await getPool().end();
});

async function freeRoomNumber(db) {
  const [rows] = await db.query("SELECT room_number FROM Room WHERE room_number BETWEEN 900 AND 999");
  const used = new Set(rows.map((row) => Number(row.room_number)));
  for (let number = 999; number >= 900; number -= 1) if (!used.has(number)) return number;
  throw new Error("ไม่มีเลขห้องว่างสำหรับทดสอบ");
}

async function setupTenant(db, { archived = false } = {}) {
  const roomNumber = await freeRoomNumber(db);
  const [roomResult] = await db.query(
    `INSERT INTO Room (room_number, is_booked, price, rental_duration_months, rental_start_date, rental_end_date)
     VALUES (?, ?, 3000, 6, DATE_SUB(CURDATE(), INTERVAL 1 MONTH), DATE_ADD(CURDATE(), INTERVAL 5 MONTH))`,
    [roomNumber, !archived],
  );
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const [customerResult] = await db.query(
    `INSERT INTO Customer (idcard, password, phone, first_name, last_name, age, room_number, deposit_amount, is_suspended)
     VALUES (?, 'x', ?, 'สมชาย', 'ใจดี', 30, ?, 6000, ?)`,
    [`A${tag}`, `08${tag.slice(0, 8)}`, archived ? null : roomNumber, archived],
  );
  const customerId = customerResult.insertId;
  const [bookingResult] = await db.query(
    `INSERT INTO Booking (customer_id, room_id, rental_start_date, rental_end_date, contract_completed_at, contract_duration_months,
                          deposit_amount, ended_at)
     VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 1 MONTH), DATE_ADD(CURDATE(), INTERVAL 5 MONTH), NOW(), 6, 6000, IF(?, NOW(), NULL))`,
    [customerId, roomResult.insertId, archived],
  );
  const bookingId = bookingResult.insertId;
  await db.query(
    "INSERT INTO ContractImage (booking_id, customer_id, name, url) VALUES ?",
    [[1, 2, 3, 4, 5].map((index) => [bookingId, customerId, `old-${index}`, `/uploads/test-old-${tag}-${index}.png`])],
  );
  return { customerId, bookingId, tag };
}

const newImages = (tag, count = 5) =>
  Array.from({ length: count }, (_, index) => ({ name: `new-${index}`, url: `/uploads/test-new-${tag}-${index}-${randomUUID()}.png` }));

async function withRollback(run) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await run(connection);
  } finally {
    await connection.rollback();
    connection.release();
  }
}

test("ต้องมีเหตุผล คอมเมนต์อย่างน้อย 10 ตัวอักษร และถ้าแก้ชื่อชื่อต้องเปลี่ยนจริง", () => {
  const contract = { first_name: "สมชาย", last_name: "ใจดี" };
  assert.match(parseAmendmentInput({ note: "แก้ชื่อผิดตามบัตรประชาชน" }, contract).error, /เหตุผล/);
  assert.match(parseAmendmentInput({ reason: "typo", note: "สั้น" }, contract).error, /อย่างน้อย 10/);
  assert.match(parseAmendmentInput({ reason: "typo", note: "แก้ชื่อผิดตามบัตรประชาชน" }, contract).error, /ยังเหมือนเดิม/);
  assert.match(parseAmendmentInput({ reason: "typo", note: "แก้ชื่อผิดตามบัตรประชาชน", first_name: " " }, contract).error, /ชื่อ/);
  const ok = parseAmendmentInput({ reason: "legal_name_change", note: "เปลี่ยนชื่อตามใบเปลี่ยนชื่อ อ.3", first_name: "สมศักดิ์" }, contract);
  assert.equal(ok.value.nameChanged, true);
  assert.equal(ok.value.firstName, "สมศักดิ์");
  assert.equal(ok.value.lastName, "ใจดี");
  const doc = parseAmendmentInput({ reason: "document_update", note: "สัญญาฉบับเดิมเปียกน้ำอ่านไม่ออก" }, contract);
  assert.equal(doc.value.nameChanged, false);
});

test("แก้ชื่อในสัญญา ได้ฉบับใหม่ เก็บรูปฉบับเดิมไว้เป็นประวัติ", () =>
  withRollback(async (db) => {
    const tenant = await setupTenant(db);
    const contractBefore = await loadContractByBooking(db, tenant.bookingId);
    const input = parseAmendmentInput({ reason: "typo", note: "พิมพ์นามสกุลผิดตอนลงทะเบียน", last_name: "ใจงาม" }, contractBefore).value;
    const result = await applyContractAmendment(db, { bookingId: tenant.bookingId, input, images: newImages(tenant.tag, 6), staffName: "ทดสอบ" });
    assert.equal(result.versionNo, 1);
    assert.deepEqual(result.changes[0], { field: "name", label: "ชื่อ-นามสกุลผู้เช่า", before: "สมชาย ใจดี", after: "สมชาย ใจงาม" });

    const contract = await loadContractByBooking(db, tenant.bookingId);
    assert.equal(contract.last_name, "ใจงาม");
    assert.equal(contract.amendment_count, 1);
    assert.equal(contract.images.length, 6);
    assert.ok(contract.images.every((image) => image.name.startsWith("new-")));
    const [amendment] = contract.amendments;
    assert.equal(amendment.reason, "typo");
    assert.equal(amendment.note, "พิมพ์นามสกุลผิดตอนลงทะเบียน");
    assert.equal(amendment.previous_images.length, 5);
    assert.equal(amendment.new_images.length, 6);
  }));

test("แก้ครั้งที่สองได้ฉบับที่ 2 และรูปฉบับแรกยังอยู่ในประวัติ", () =>
  withRollback(async (db) => {
    const tenant = await setupTenant(db);
    let contract = await loadContractByBooking(db, tenant.bookingId);
    const first = parseAmendmentInput({ reason: "document_update", note: "สัญญาเดิมรูปไม่ชัด ถ่ายใหม่" }, contract).value;
    await applyContractAmendment(db, { bookingId: tenant.bookingId, input: first, images: newImages(`${tenant.tag}a`), staffName: "ทดสอบ" });
    contract = await loadContractByBooking(db, tenant.bookingId);
    const second = parseAmendmentInput({ reason: "legal_name_change", note: "ผู้เช่าเปลี่ยนชื่อตามทะเบียนราษฎร์", first_name: "สมหมาย" }, contract).value;
    const result = await applyContractAmendment(db, { bookingId: tenant.bookingId, input: second, images: newImages(`${tenant.tag}b`), staffName: "ทดสอบ" });
    assert.equal(result.versionNo, 2);
    contract = await loadContractByBooking(db, tenant.bookingId);
    assert.equal(contract.amendments.length, 2);
    assert.equal(contract.amendments[0].previous_images.length, 5);
    assert.equal(contract.amendments[1].previous_images.length, 5);
    assert.ok(contract.amendments[1].previous_images.every((image) => image.url.includes(`${tenant.tag}a`)));
  }));

test("สัญญาที่สิ้นสุดแล้วแก้ไม่ได้ และต้องแนบรูปฉบับแก้ไขอย่างน้อย 5 รูป", () =>
  withRollback(async (db) => {
    const archived = await setupTenant(db, { archived: true });
    const contract = await loadContractByBooking(db, archived.bookingId);
    const input = parseAmendmentInput({ reason: "document_update", note: "สัญญาเดิมรูปไม่ชัด ถ่ายใหม่" }, contract).value;
    await assert.rejects(
      applyContractAmendment(db, { bookingId: archived.bookingId, input, images: newImages(archived.tag), staffName: "ทดสอบ" }),
      (error) => error instanceof ContractAmendmentError && error.status === 409,
    );
    const active = await setupTenant(db);
    await assert.rejects(
      applyContractAmendment(db, { bookingId: active.bookingId, input, images: newImages(active.tag, 4), staffName: "ทดสอบ" }),
      (error) => error instanceof ContractAmendmentError && /อย่างน้อย 5/.test(error.message),
    );
  }));
