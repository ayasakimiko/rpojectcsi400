import { DEPOSIT_MONTHS } from "../middleware/validation.js";

export const DEPOSIT_MAX_MONTHS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const toCents = (value) => Math.max(0, Math.round(Number(value) * 100) || 0);
export const signedCents = (value) => Math.round(Number(value) * 100) || 0;
const baht = (cents) => cents / 100;

const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayNumber = (date) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);

export function billingPeriodAt(start, offset) {
  const date = new Date(start.getFullYear(), start.getMonth() + offset, 1, start.getHours(), start.getMinutes(), start.getSeconds());
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(start.getDate(), lastDay));
  return date;
}

export const requiredDepositCents = (priceCents) => Math.max(0, priceCents) * DEPOSIT_MONTHS;
export const depositLimitCents = (priceCents) => Math.max(0, priceCents) * DEPOSIT_MAX_MONTHS;

export function computeProratedRent({ anchor, paidThrough, moveDate, sourcePriceCents, targetPriceCents }) {
  const start = validDate(anchor);
  const until = validDate(paidThrough);
  const move = validDate(moveDate);
  const result = {
    moveDate: move,
    paidThrough: until,
    remainingDays: 0,
    periodDays: 0,
    periods: 0,
    oldUnusedCents: 0,
    newProratedCents: 0,
    firstOldCents: 0,
    firstNewCents: 0,
    nextPeriodStart: null,
  };
  if (!start || !until || !move) return result;
  const moveDay = dayNumber(move);
  const untilDay = dayNumber(until);
  if (untilDay <= moveDay) return result;

  let offset = 0;
  while (offset > -600 && dayNumber(billingPeriodAt(start, offset)) > moveDay) offset -= 1;
  while (offset < 600 && dayNumber(billingPeriodAt(start, offset + 1)) <= moveDay) offset += 1;
  for (; offset < 600; offset += 1) {
    const periodStart = dayNumber(billingPeriodAt(start, offset));
    const periodEnd = dayNumber(billingPeriodAt(start, offset + 1));
    if (periodStart >= untilDay) break;
    const periodDays = periodEnd - periodStart;
    const usedDays = Math.min(periodEnd, untilDay) - Math.max(periodStart, moveDay);
    if (periodDays <= 0 || usedDays <= 0) continue;
    const oldCents = Math.round((sourcePriceCents * usedDays) / periodDays);
    const newCents = Math.round((targetPriceCents * usedDays) / periodDays);
    if (result.periods === 0) {
      result.periodDays = periodDays;
      result.firstOldCents = oldCents;
      result.firstNewCents = newCents;
      result.nextPeriodStart = billingPeriodAt(start, offset + 1);
    }
    result.oldUnusedCents += oldCents;
    result.newProratedCents += newCents;
    result.remainingDays += usedDays;
    result.periods += 1;
  }
  return result;
}

export function computeRoomTransferSettlement({
  sourcePriceCents,
  targetPriceCents,
  depositBalanceCents,
  damageCents = 0,
  proration,
}) {
  const balanceCents = Math.max(0, depositBalanceCents);
  const damageDeductionCents = Math.min(Math.max(0, damageCents), balanceCents);
  const transferableCents = balanceCents - damageDeductionCents;
  const requiredCents = requiredDepositCents(targetPriceCents);
  const appliedCents = Math.min(transferableCents, requiredCents);
  const topupCents = requiredCents - appliedCents;
  const surplusCents = transferableCents - appliedCents;

  const oldUnusedCents = Math.max(0, proration?.oldUnusedCents ?? 0);
  const newProratedCents = Math.max(0, proration?.newProratedCents ?? 0);
  const firstOldCents = Math.max(0, proration?.firstOldCents ?? oldUnusedCents);
  const firstNewCents = Math.max(0, proration?.firstNewCents ?? newProratedCents);
  const moveMonthDifferenceCents = firstNewCents - firstOldCents;
  const rentChargeCents = Math.max(0, firstNewCents - oldUnusedCents);
  const rentCreditCents = Math.max(0, -moveMonthDifferenceCents);
  const rentCarryCents = Math.max(0, oldUnusedCents - firstNewCents - rentCreditCents);

  const limitCents = Math.max(requiredCents, depositLimitCents(targetPriceCents));
  const heldCents = requiredCents + surplusCents + rentCreditCents;
  const excessRefundCents = Math.max(0, heldCents - limitCents);

  return {
    priceDifferenceCents: targetPriceCents - sourcePriceCents,
    moveDate: proration?.moveDate ?? null,
    paidThrough: proration?.paidThrough ?? null,
    remainingDays: proration?.remainingDays ?? 0,
    periodDays: proration?.periodDays ?? 0,
    chargeablePeriods: proration?.periods ?? 0,
    oldUnusedCents,
    newProratedCents,
    rentDifferenceCents: newProratedCents - oldUnusedCents,
    firstOldCents,
    firstNewCents,
    moveMonthDifferenceCents,
    nextPeriodStart: proration?.nextPeriodStart ?? null,
    rentChargeCents,
    rentCreditCents,
    rentCarryCents,
    depositBeforeCents: balanceCents,
    damageDeductionCents,
    transferableCents,
    requiredCents,
    appliedCents,
    topupCents,
    surplusCents,
    limitCents,
    excessRefundCents,
    depositAfterCents: heldCents - excessRefundCents,
    additionalChargeCents: topupCents,
  };
}

export function depositBalanceAfterTransfers(paidCents, transfers = []) {
  let balance = Math.max(0, paidCents);
  for (const transfer of transfers) {
    balance = transfer.deposit_after != null
      ? toCents(transfer.deposit_after)
      : Math.max(0, balance - toCents(transfer.deposit_deducted));
  }
  return balance;
}

export function transferDepositDeductedCents(transfers = []) {
  return transfers.reduce(
    (sum, transfer) => sum + toCents(transfer.deposit_deducted) + toCents(transfer.damage_deduction),
    0,
  );
}

export function transferRentPaidCents(transfer) {
  const chargePaid = transfer.charge_status === "paid" || toCents(transfer.amount_charged) === 0;
  if (transfer.deposit_after == null) {
    return toCents(transfer.deposit_deducted) + (transfer.charge_status === "paid" ? toCents(transfer.amount_charged) : 0);
  }
  const rentPaid = transfer.rent_charge_payment_id != null ? transfer.rent_charge_status === "paid" : chargePaid;
  return (rentPaid ? toCents(transfer.rent_charge) : 0) - toCents(transfer.rent_credit_to_deposit);
}

export function settlementView(settlement) {
  return {
    price_difference: baht(settlement.priceDifferenceCents),
    move_date: settlement.moveDate,
    paid_through: settlement.paidThrough,
    remaining_days: settlement.remainingDays,
    period_days: settlement.periodDays,
    chargeable_periods: settlement.chargeablePeriods,
    old_unused_rent: baht(settlement.oldUnusedCents),
    new_prorated_rent: baht(settlement.newProratedCents),
    rent_difference: baht(settlement.rentDifferenceCents),
    move_period_old_rent: baht(settlement.firstOldCents),
    move_period_new_rent: baht(settlement.firstNewCents),
    next_period_start: settlement.nextPeriodStart,
    rent_charge: baht(settlement.rentChargeCents),
    rent_credit_to_deposit: baht(settlement.rentCreditCents),
    rent_carry_credit: baht(settlement.rentCarryCents),
    deposit_before: baht(settlement.depositBeforeCents),
    damage_deduction: baht(settlement.damageDeductionCents),
    transferable_deposit: baht(settlement.transferableCents),
    required_deposit: baht(settlement.requiredCents),
    deposit_applied: baht(settlement.appliedCents),
    deposit_topup: baht(settlement.topupCents),
    deposit_surplus_credit: baht(settlement.surplusCents),
    deposit_limit: baht(settlement.limitCents),
    deposit_excess_refund: baht(settlement.excessRefundCents),
    deposit_after: baht(settlement.depositAfterCents),
    total_credit: baht(settlement.surplusCents + settlement.rentCreditCents),
    additional_charge: baht(settlement.additionalChargeCents),
  };
}

const optionalNumber = (value) => (value == null ? null : Number(value));

export function transferFinanceView(transfer) {
  if (transfer.deposit_after == null) return null;
  const rentCredit = Number(transfer.rent_credit_to_deposit) || 0;
  const surplus = Number(transfer.deposit_surplus_credit) || 0;
  const fromPrice = Number(transfer.from_price) || 0;
  const toPrice = Number(transfer.to_price) || 0;
  const oldUnused = Number(transfer.old_unused_rent) || 0;
  const newProrated = Number(transfer.new_prorated_rent) || 0;
  const periods = toPrice > 0 && newProrated > 0 ? Math.max(1, Math.ceil(newProrated / toPrice - 1e-9)) : Number(transfer.chargeable_periods) || 0;
  const later = Math.max(0, periods - 1);
  return {
    price_difference: toPrice - fromPrice,
    move_date: transfer.move_date ?? transfer.transferred_at ?? null,
    paid_through: transfer.paid_through ?? null,
    remaining_days: Number(transfer.remaining_days) || 0,
    period_days: Number(transfer.period_days) || 0,
    chargeable_periods: periods,
    old_unused_rent: oldUnused,
    new_prorated_rent: newProrated,
    rent_difference: transfer.new_prorated_rent != null ? newProrated - oldUnused : Number(transfer.price_difference_total) || 0,
    move_period_old_rent: Math.max(0, oldUnused - fromPrice * later),
    move_period_new_rent: Math.max(0, newProrated - toPrice * later),
    next_period_start: transfer.rent_charge_payment_id != null ? transfer.new_price_from ?? null : null,
    rent_charge: Number(transfer.rent_charge) || 0,
    rent_charge_after_move: transfer.rent_charge_payment_id != null,
    rent_charge_status: transfer.rent_charge_status ?? null,
    rent_credit_to_deposit: rentCredit,
    rent_carry_credit: Number(transfer.rent_carry_credit) || 0,
    deposit_before: Number(transfer.deposit_before) || 0,
    damage_deduction: Number(transfer.damage_deduction) || 0,
    transferable_deposit: Number(transfer.transferable_deposit) || 0,
    required_deposit: Number(transfer.required_deposit) || 0,
    deposit_applied: Number(transfer.deposit_applied) || 0,
    deposit_topup: Number(transfer.deposit_topup) || 0,
    deposit_surplus_credit: surplus,
    deposit_limit: optionalNumber(transfer.deposit_limit),
    deposit_excess_refund: Number(transfer.deposit_excess_refund) || 0,
    deposit_after: Number(transfer.deposit_after) || 0,
    total_credit: surplus + rentCredit,
    additional_charge: Number(transfer.amount_charged) || 0,
  };
}
