import test from "node:test";
import assert from "node:assert/strict";
import {
  computeProratedRent,
  computeRoomTransferSettlement,
  depositBalanceAfterTransfers,
  transferRentPaidCents,
} from "../router/roomTransferFinance.js";
import { parseDamageCost } from "../middleware/validation.js";

const baht = (value) => Math.round(value * 100);

function settle({ oldPrice, newPrice, deposit, damage = 0, anchor, paidThrough, moveDate }) {
  const proration = computeProratedRent({
    anchor,
    paidThrough,
    moveDate,
    sourcePriceCents: baht(oldPrice),
    targetPriceCents: baht(newPrice),
  });
  return computeRoomTransferSettlement({
    sourcePriceCents: baht(oldPrice),
    targetPriceCents: baht(newPrice),
    depositBalanceCents: baht(deposit),
    damageCents: baht(damage),
    proration,
  });
}

const midCycle = { anchor: new Date(2026, 3, 1, 10, 0), paidThrough: new Date(2026, 4, 1, 10, 0), moveDate: new Date(2026, 3, 16) };

test("prorates 15 of 30 days in the current paid period", () => {
  const result = computeProratedRent({ ...midCycle, sourcePriceCents: baht(3500), targetPriceCents: baht(4500) });
  assert.equal(result.periodDays, 30);
  assert.equal(result.remainingDays, 15);
  assert.equal(result.oldUnusedCents, baht(1750));
  assert.equal(result.newProratedCents, baht(2250));
});

test("1. more expensive room collects only the deposit top-up before the move and the rent difference after it", () => {
  const result = settle({ oldPrice: 3500, newPrice: 4500, deposit: 7000, ...midCycle });
  assert.equal(result.rentChargeCents, baht(500));
  assert.equal(result.rentCreditCents, 0);
  assert.equal(result.rentCarryCents, 0);
  assert.equal(result.requiredCents, baht(9000));
  assert.equal(result.appliedCents, baht(7000));
  assert.equal(result.topupCents, baht(2000));
  assert.equal(result.surplusCents, 0);
  assert.equal(result.additionalChargeCents, baht(2000));
  assert.equal(result.depositAfterCents, baht(9000));
  assert.equal(result.nextPeriodStart.getTime(), midCycle.paidThrough.getTime());
});

test("2. more expensive room with a lower deposit requirement has nothing to pay before the move", () => {
  const result = settle({ oldPrice: 3500, newPrice: 4500, deposit: 10000, ...midCycle });
  assert.equal(result.rentChargeCents, baht(500));
  assert.equal(result.topupCents, 0);
  assert.equal(result.surplusCents, baht(1000));
  assert.equal(result.additionalChargeCents, 0);
  assert.equal(result.depositAfterCents, baht(10000));
});

test("2b. rent prepaid for several periods: all unused prepaid rent is deducted from the move-in month at once", () => {
  const result = settle({
    oldPrice: 3000,
    newPrice: 32500,
    deposit: 0,
    anchor: new Date(2026, 9, 24, 1, 19),
    paidThrough: new Date(2027, 0, 24, 1, 19),
    moveDate: new Date(2026, 9, 24),
  });
  assert.equal(result.chargeablePeriods, 3);
  assert.equal(result.rentDifferenceCents, baht(88500));
  assert.equal(result.firstOldCents, baht(3000));
  assert.equal(result.firstNewCents, baht(32500));
  assert.equal(result.rentChargeCents, baht(23500));
  assert.equal(result.rentCarryCents, 0);
  assert.equal(result.additionalChargeCents, baht(65000));
  assert.equal(result.nextPeriodStart.getTime(), new Date(2026, 10, 24, 1, 19).getTime());
});

test("2c. prepaid rent larger than the move-in month rent carries only the leftover into later bills", () => {
  const result = settle({
    oldPrice: 3000,
    newPrice: 4000,
    deposit: 8000,
    anchor: new Date(2026, 9, 24, 10),
    paidThrough: new Date(2027, 0, 24, 10),
    moveDate: new Date(2026, 9, 24),
  });
  assert.equal(result.oldUnusedCents, baht(9000));
  assert.equal(result.rentChargeCents, 0);
  assert.equal(result.rentCreditCents, 0);
  assert.equal(result.rentCarryCents, baht(5000));
});

test("2d. cheaper room with several prepaid periods keeps the move-in month excess as deposit credit", () => {
  const result = settle({
    oldPrice: 5000,
    newPrice: 4000,
    deposit: 10000,
    anchor: new Date(2026, 9, 24, 10),
    paidThrough: new Date(2027, 0, 24, 10),
    moveDate: new Date(2026, 9, 24),
  });
  assert.equal(result.rentChargeCents, 0);
  assert.equal(result.rentCreditCents, baht(1000));
  assert.equal(result.rentCarryCents, baht(10000));
});

test("3. cheaper room with a higher deposit requirement turns rent credit into deposit and charges only the top-up", () => {
  const result = settle({ oldPrice: 5000, newPrice: 3500, deposit: 5000, ...midCycle });
  assert.equal(result.oldUnusedCents, baht(2500));
  assert.equal(result.newProratedCents, baht(1750));
  assert.equal(result.rentChargeCents, 0);
  assert.equal(result.rentCreditCents, baht(750));
  assert.equal(result.requiredCents, baht(7000));
  assert.equal(result.topupCents, baht(2000));
  assert.equal(result.additionalChargeCents, baht(2000));
  assert.equal(result.depositAfterCents, baht(7750));
});

test("4. cheaper room with a lower deposit combines both credits and keeps each origin", () => {
  const result = settle({ oldPrice: 5000, newPrice: 4000, deposit: 10000, ...midCycle });
  assert.equal(result.requiredCents, baht(8000));
  assert.equal(result.appliedCents, baht(8000));
  assert.equal(result.surplusCents, baht(2000));
  assert.equal(result.oldUnusedCents, baht(2500));
  assert.equal(result.newProratedCents, baht(2000));
  assert.equal(result.rentCreditCents, baht(500));
  assert.equal(result.rentChargeCents, 0);
  assert.equal(result.additionalChargeCents, 0);
  assert.equal(result.excessRefundCents, 0);
  assert.equal(result.depositAfterCents, baht(10500));
});

test("4b. spec example 5,000 deposit to a 3,500 requirement with 750 rent credit", () => {
  const result = computeRoomTransferSettlement({
    sourcePriceCents: baht(5000),
    targetPriceCents: baht(1750),
    depositBalanceCents: baht(5000),
    proration: { oldUnusedCents: baht(2500), newProratedCents: baht(1750), remainingDays: 15, periodDays: 30, periods: 1 },
  });
  assert.equal(result.requiredCents, baht(3500));
  assert.equal(result.appliedCents, baht(3500));
  assert.equal(result.surplusCents, baht(1500));
  assert.equal(result.rentCreditCents, baht(750));
  assert.equal(result.additionalChargeCents, 0);
  assert.equal(result.limitCents, baht(5250));
  assert.equal(result.excessRefundCents, baht(500));
  assert.equal(result.depositAfterCents, baht(5250));
});

test("5. equal rent and deposit moves the whole deposit with nothing to pay", () => {
  const result = settle({ oldPrice: 3500, newPrice: 3500, deposit: 7000, ...midCycle });
  assert.equal(result.rentChargeCents, 0);
  assert.equal(result.rentCreditCents, 0);
  assert.equal(result.topupCents, 0);
  assert.equal(result.surplusCents, 0);
  assert.equal(result.additionalChargeCents, 0);
  assert.equal(result.depositAfterCents, baht(7000));
});

test("6. approved damage is deducted from the deposit before it is transferred", () => {
  const result = settle({ oldPrice: 3500, newPrice: 3500, deposit: 7000, damage: 1200, ...midCycle });
  assert.equal(result.damageDeductionCents, baht(1200));
  assert.equal(result.transferableCents, baht(5800));
  assert.equal(result.topupCents, baht(1200));
  assert.equal(result.additionalChargeCents, baht(1200));
  assert.equal(result.depositAfterCents, baht(7000));
});

test("7. unpaid or partially paid current period gives no rent credit", () => {
  const unpaid = settle({
    oldPrice: 5000,
    newPrice: 3500,
    deposit: 10000,
    anchor: midCycle.anchor,
    paidThrough: new Date(2026, 3, 1, 10, 0),
    moveDate: midCycle.moveDate,
  });
  assert.equal(unpaid.oldUnusedCents, 0);
  assert.equal(unpaid.rentCreditCents, 0);
  assert.equal(unpaid.rentChargeCents, 0);
  const none = settle({ oldPrice: 5000, newPrice: 3500, deposit: 10000, anchor: midCycle.anchor, paidThrough: null, moveDate: midCycle.moveDate });
  assert.equal(none.rentCreditCents, 0);
});

test("8. transfer on the billing date credits the full paid period", () => {
  const result = settle({
    oldPrice: 3500,
    newPrice: 4500,
    deposit: 7000,
    anchor: midCycle.anchor,
    paidThrough: new Date(2026, 4, 1, 10, 0),
    moveDate: new Date(2026, 3, 1),
  });
  assert.equal(result.remainingDays, 30);
  assert.equal(result.oldUnusedCents, baht(3500));
  assert.equal(result.newProratedCents, baht(4500));
  assert.equal(result.rentChargeCents, baht(1000));
});

test("8b. transfer on the day the paid period ends has nothing left to prorate", () => {
  const result = settle({
    oldPrice: 3500,
    newPrice: 4500,
    deposit: 7000,
    anchor: midCycle.anchor,
    paidThrough: new Date(2026, 4, 1, 10, 0),
    moveDate: new Date(2026, 4, 1),
  });
  assert.equal(result.remainingDays, 0);
  assert.equal(result.rentChargeCents, 0);
});

test("9. mid-cycle proration follows real month lengths", () => {
  const february = computeProratedRent({
    anchor: new Date(2026, 1, 1),
    paidThrough: new Date(2026, 2, 1),
    moveDate: new Date(2026, 1, 15),
    sourcePriceCents: baht(2800),
    targetPriceCents: baht(4200),
  });
  assert.equal(february.periodDays, 28);
  assert.equal(february.remainingDays, 14);
  assert.equal(february.oldUnusedCents, baht(1400));
  assert.equal(february.newProratedCents, baht(2100));

  const anchoredOn31st = computeProratedRent({
    anchor: new Date(2026, 0, 31),
    paidThrough: new Date(2026, 1, 28),
    moveDate: new Date(2026, 1, 10),
    sourcePriceCents: baht(3100),
    targetPriceCents: baht(3100),
  });
  assert.equal(anchoredOn31st.periodDays, 28);
  assert.equal(anchoredOn31st.remainingDays, 18);

  const prepaidTwoPeriods = computeProratedRent({
    anchor: new Date(2026, 3, 1),
    paidThrough: new Date(2026, 5, 1),
    moveDate: new Date(2026, 3, 16),
    sourcePriceCents: baht(3000),
    targetPriceCents: baht(3600),
  });
  assert.equal(prepaidTwoPeriods.periods, 2);
  assert.equal(prepaidTwoPeriods.remainingDays, 15 + 31);
  assert.equal(prepaidTwoPeriods.oldUnusedCents, baht(1500) + baht(3000));
  assert.equal(prepaidTwoPeriods.newProratedCents, baht(1800) + baht(3600));
});

test("rounding stays at satang precision", () => {
  const result = computeProratedRent({
    anchor: new Date(2026, 6, 1),
    paidThrough: new Date(2026, 7, 1),
    moveDate: new Date(2026, 6, 11),
    sourcePriceCents: baht(3333),
    targetPriceCents: baht(4444),
  });
  assert.equal(result.periodDays, 31);
  assert.equal(result.remainingDays, 21);
  assert.equal(result.oldUnusedCents, Math.round((333300 * 21) / 31));
  assert.ok(Number.isInteger(result.newProratedCents));
});

test("retained deposit is capped at three months of the new rent and the excess is refunded", () => {
  const result = computeRoomTransferSettlement({
    sourcePriceCents: baht(6000),
    targetPriceCents: baht(2000),
    depositBalanceCents: baht(12000),
    proration: { oldUnusedCents: baht(3000), newProratedCents: baht(1000), remainingDays: 15, periodDays: 30, periods: 1 },
  });
  assert.equal(result.limitCents, baht(6000));
  assert.equal(result.depositAfterCents, baht(6000));
  assert.equal(result.excessRefundCents, baht(8000));
  assert.equal(result.additionalChargeCents, 0);
});

test("10. deposit ledger reads the stored balance so a repeated transfer cannot be applied twice", () => {
  assert.equal(depositBalanceAfterTransfers(baht(7000), []), baht(7000));
  assert.equal(depositBalanceAfterTransfers(baht(7000), [{ deposit_deducted: "1500.00", deposit_after: null }]), baht(5500));
  assert.equal(
    depositBalanceAfterTransfers(baht(7000), [
      { deposit_deducted: "1500.00", deposit_after: null },
      { deposit_deducted: "0.00", deposit_after: "5750.00" },
    ]),
    baht(5750),
  );
  assert.equal(
    depositBalanceAfterTransfers(baht(7000), [
      { deposit_deducted: "0.00", deposit_after: "5750.00" },
      { deposit_deducted: "0.00", deposit_after: "5750.00" },
    ]),
    baht(5750),
  );
});

test("rent ledger moves converted rent credit out of rent paid and keeps legacy rows", () => {
  assert.equal(transferRentPaidCents({ deposit_after: "5750", rent_charge: "0", rent_credit_to_deposit: "750", amount_charged: "0" }), -baht(750));
  assert.equal(
    transferRentPaidCents({ deposit_after: "9000", rent_charge: "500", rent_credit_to_deposit: "0", amount_charged: "2500", charge_status: "paid" }),
    baht(500),
  );
  assert.equal(
    transferRentPaidCents({ deposit_after: null, deposit_deducted: "1000", amount_charged: "500", charge_status: "paid" }),
    baht(1500),
  );
  const afterMove = { deposit_after: "9000", rent_charge: "500", rent_credit_to_deposit: "0", amount_charged: "2000", charge_status: "paid", rent_charge_payment_id: 7 };
  assert.equal(transferRentPaidCents({ ...afterMove, rent_charge_status: "pending" }), 0);
  assert.equal(transferRentPaidCents({ ...afterMove, rent_charge_status: "paid" }), baht(500));
});

test("damage cost input: blank means no deduction, invalid values are rejected", () => {
  assert.deepEqual(parseDamageCost(""), { value: 0 });
  assert.deepEqual(parseDamageCost(undefined), { value: 0 });
  assert.deepEqual(parseDamageCost("1,250.50"), { value: 125050 });
  assert.ok(parseDamageCost("-5").error);
  assert.ok(parseDamageCost("abc").error);
  assert.ok(parseDamageCost("10.555").error);
});

test("damage larger than the deposit is never taken from rent", () => {
  const result = settle({ oldPrice: 3500, newPrice: 3500, deposit: 1000, damage: 5000, ...midCycle });
  assert.equal(result.damageDeductionCents, baht(1000));
  assert.equal(result.rentChargeCents, 0);
});
