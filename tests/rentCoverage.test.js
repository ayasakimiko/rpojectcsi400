import { describe, test } from "node:test";
import assert from "node:assert/strict";

const { computeRentCoverage } = await import("../router/CustomerDashboardRouter.js");

const room = (overrides) => ({
  price: 32500,
  rental_start_date: new Date(2026, 9, 23, 0, 40),
  rental_end_date: new Date(2027, 0, 23, 0, 40),
  billing_start_date: null,
  prepaid_until: null,
  ...overrides,
});

describe("computeRentCoverage", () => {
  test("no rent paid on a fresh contract has no paid periods", () => {
    const coverage = computeRentCoverage(room(), [], new Date(2026, 9, 24));
    assert.equal(coverage.paidPeriodsFromCurrent, 0);
  });

  test("current period paid before an earlier transfer moved the billing start still counts", () => {
    const coverage = computeRentCoverage(room({ billing_start_date: new Date(2026, 10, 23, 0, 40) }), [], new Date(2026, 9, 24));
    assert.equal(coverage.paidPeriodsFromCurrent, 1);
  });

  test("prepaid months before the billing start all count", () => {
    const coverage = computeRentCoverage(room({ billing_start_date: new Date(2026, 11, 23, 0, 40) }), [], new Date(2026, 9, 24));
    assert.equal(coverage.paidPeriodsFromCurrent, 2);
  });

  test("once the billing start has passed only paid periods count", () => {
    const coverage = computeRentCoverage(room({ billing_start_date: new Date(2026, 10, 23, 0, 40) }), [], new Date(2026, 10, 25));
    assert.equal(coverage.paidPeriodsFromCurrent, 0);
  });
});
