import test from "node:test";
import assert from "node:assert/strict";
import { changedFor, formatCursor, parseCursor, visibleTo } from "../router/notificationPulse.js";

const pulse = { notification: 10, work: "1-5|0-0", announcement: "2-7", parcel: "0-0" };
const fakeDb = (rows) => ({ query: async () => [rows] });

test("cursor round-trips and rejects junk", () => {
  assert.deepEqual(parseCursor(formatCursor(pulse)), pulse);
  assert.equal(parseCursor(undefined), null);
  assert.equal(parseCursor("abc~x"), null);
  assert.equal(parseCursor("-1~x"), null);
});

test("visibility matches the feed rules", () => {
  const customer = { role: "Customer", id: 5 };
  const staff = { role: "Staff", id: 3 };
  assert.equal(visibleTo(customer, { audience: "Customer", recipient_id: 5 }), true);
  assert.equal(visibleTo(customer, { audience: "Customer", recipient_id: 6 }), false);
  assert.equal(visibleTo(staff, { audience: "Staff,Admin,Owner", recipient_id: null }), true);
  assert.equal(visibleTo(staff, { audience: "Admin,Owner", recipient_id: null }), false);
  assert.equal(visibleTo(staff, { audience: "Staff", recipient_id: null, actor_role: "Staff", actor_id: 3 }), false);
  assert.equal(visibleTo(staff, { audience: "Staff", recipient_id: null, actor_role: "Staff", actor_id: 4 }), true);
});

test("only changes the user can see wake the bell", async () => {
  const customer = { role: "Customer", id: 5 };
  const staff = { role: "Staff", id: 3 };
  const unused = fakeDb([]);
  assert.equal(await changedFor(staff, pulse, pulse, unused), false);
  assert.equal(await changedFor(staff, pulse, { ...pulse, work: "2-6|0-0" }, unused), true);
  assert.equal(await changedFor(customer, pulse, { ...pulse, work: "2-6|0-0" }, unused), false);
  assert.equal(await changedFor(customer, pulse, { ...pulse, announcement: "3-8" }, unused), true);

  const newer = { ...pulse, notification: 12 };
  const rows = [{ audience: "Customer", recipient_id: 9 }, { audience: "Staff,Admin,Owner", recipient_id: null, actor_role: "Staff", actor_id: 3 }];
  assert.equal(await changedFor(customer, pulse, newer, fakeDb(rows)), false);
  assert.equal(await changedFor(staff, pulse, newer, fakeDb(rows)), false);
  assert.equal(await changedFor({ role: "Admin", id: 1 }, pulse, newer, fakeDb(rows)), true);
});
