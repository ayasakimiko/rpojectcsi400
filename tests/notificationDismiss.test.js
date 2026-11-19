import test from "node:test";
import assert from "node:assert/strict";
import { withoutDismissed } from "../src/utils/serverNotifications.js";

const items = [{ key: "server-1" }, { key: "pending-move-in-2-101" }, { key: "announcement-3" }];

test("ซ่อนเฉพาะรายการที่อยู่ใน dismissed", () => {
  const visible = withoutDismissed(items, new Set(["server-1", "announcement-3"]));
  assert.deepEqual(visible.map((item) => item.key), ["pending-move-in-2-101"]);
});

test("ไม่มี dismissed หรือเป็นชุดว่าง คืนรายการเดิมทั้งหมด", () => {
  assert.equal(withoutDismissed(items, new Set()), items);
  assert.equal(withoutDismissed(items, undefined), items);
});

test("key ที่ไม่ตรงกับรายการใดไม่มีผล", () => {
  assert.equal(withoutDismissed(items, new Set(["server-999"])).length, 3);
});
