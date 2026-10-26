import test from "node:test";
import assert from "node:assert/strict";
import { sortNewestFirst } from "../src/utils/serverNotifications.js";

const NOW = new Date("2026-10-26T12:00:00Z").getTime();
const keys = (items) => sortNewestFirst(items, NOW).map((item) => item.key);

test("newest first, mixing ISO strings, Date objects and MySQL-style strings", () => {
  assert.deepEqual(keys([
    { key: "old", date: "2026-10-20T08:00:00Z" },
    { key: "mysql", date: "2026-10-26 10:00:00" },
    { key: "date-object", date: new Date("2026-10-25T09:00:00Z") },
    { key: "newest", date: "2026-10-26T11:59:00Z" },
  ]), ["newest", "mysql", "date-object", "old"]);
});

test("future reminders count as now and missing dates go last", () => {
  assert.deepEqual(keys([
    { key: "no-date", date: null },
    { key: "earlier", date: "2026-10-26T11:00:00Z" },
    { key: "due-next-week", date: "2026-11-02T00:00:00Z" },
    { key: "broken", date: "ไม่ระบุ" },
  ]), ["due-next-week", "earlier", "no-date", "broken"]);
});
