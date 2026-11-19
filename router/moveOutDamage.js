import { DAMAGE_PAYMENT_TYPE } from "./CustomerDashboardRouter.js";
import { loadCustomerContracts } from "./rentalContracts.js";
import { toCents } from "./roomTransferFinance.js";

const formatBaht = (cents) => `฿${(cents / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

async function loadMoveOutDamagePlan(db, requestId, { damageCents = null, lock = false } = {}) {
  const forUpdate = lock ? " FOR UPDATE" : "";
  const [requestRows] = await db.query(
    `SELECT id, customer_id, room_number, type, status, damage_charge_payment_id FROM TenantRequest WHERE id = ?${forUpdate}`,
    [requestId],
  );
  const request = requestRows[0];
  if (!request || request.type !== "moveout" || !["pending", "in_progress"].includes(request.status)) return null;
  const [inspectionRows] = await db.query(
    "SELECT damage_cost FROM MoveOutInspection WHERE tenant_request_id = ? AND hidden_at IS NULL",
    [requestId],
  );
  const contract = (await loadCustomerContracts(db, [request.customer_id], { currentOnly: true })).get(request.customer_id);
  const depositCents = toCents(contract?.deposit_remaining);
  const appliedDamageCents = damageCents ?? toCents(inspectionRows[0]?.damage_cost);
  const [chargeRows] = request.damage_charge_payment_id
    ? await db.query(`SELECT id, amount, status, slip_path FROM Payment WHERE id = ?${forUpdate}`, [request.damage_charge_payment_id])
    : [[]];
  const charge = chargeRows[0] && ["pending", "paid"].includes(chargeRows[0].status) ? chargeRows[0] : null;
  return {
    request,
    depositCents,
    damageCents: appliedDamageCents,
    excessCents: Math.max(0, appliedDamageCents - depositCents),
    charge,
    chargeLocked: Boolean(charge && (charge.status === "paid" || charge.slip_path)),
  };
}

export async function validateMoveOutDamage(db, requestId, damageCents) {
  const plan = await loadMoveOutDamagePlan(db, requestId, { damageCents });
  if (!plan?.chargeLocked) return null;
  if (toCents(plan.charge.amount) === plan.excessCents) return null;
  return "ผู้เช่าชำระหรือส่งสลิปค่าเสียหายส่วนเกินแล้ว จึงแก้ไขค่าเสียหายไม่ได้ กรุณาตรวจสอบยอดชำระกับผู้เช่าก่อน";
}

export async function syncMoveOutDamageCharge(connection, requestId) {
  const plan = await loadMoveOutDamagePlan(connection, requestId, { lock: true });
  if (!plan) return { excessCents: 0, sentCents: 0 };
  const { request, charge, excessCents } = plan;
  if (charge && toCents(charge.amount) === excessCents) return { excessCents, sentCents: 0 };
  if (plan.chargeLocked) return { excessCents, sentCents: 0 };
  if (charge) {
    await connection.query(
      `UPDATE Payment SET status = 'cancelled', note = LEFT(CONCAT(COALESCE(note, ''), ' (ยกเลิก: แก้ไขผลตรวจห้อง)'), 255)
       WHERE id = ? AND status = 'pending' AND slip_path IS NULL`,
      [charge.id],
    );
  }
  let paymentId = null;
  if (excessCents > 0) {
    const [bookingRows] = await connection.query(
      "SELECT id FROM Booking WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
      [request.customer_id],
    );
    if (bookingRows[0]) {
      const [result] = await connection.query(
        `INSERT INTO Payment (booking_id, amount, payment_date, status, type, note) VALUES (?, ?, CURDATE(), 'pending', ?, ?)`,
        [
          bookingRows[0].id,
          excessCents / 100,
          DAMAGE_PAYMENT_TYPE,
          `ค่าเสียหายส่วนเกินเงินมัดจำ ห้อง ${request.room_number}: ค่าเสียหาย ${formatBaht(plan.damageCents)} − มัดจำ ${formatBaht(plan.depositCents)}`.slice(0, 255),
        ],
      );
      paymentId = result.insertId;
    }
  }
  await connection.query("UPDATE TenantRequest SET damage_charge_payment_id = ? WHERE id = ?", [paymentId, request.id]);
  return { excessCents, sentCents: paymentId ? excessCents : 0 };
}

export const damageChargeMessage = (sentCents) =>
  sentCents > 0
    ? ` · ค่าเสียหายเกินเงินมัดจำ ส่งบิลส่วนเกิน ${formatBaht(sentCents)} ให้ผู้เช่าแล้ว ต้องชำระก่อนอนุมัติย้ายออก`
    : "";
