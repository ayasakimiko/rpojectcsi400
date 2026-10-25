import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import marketPublicRouter from "../router/MarketPublicRouter.js";
import { MARKET_ERRORS, normalizeOrigin } from "../middleware/marketApiKey.js";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

async function openApiOperations() {
  const text = await readFile(new URL("../docs/market-openapi.yaml", import.meta.url), "utf8");
  const operations = new Set();
  let inPaths = false;
  let currentPath = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^\S/.test(line)) break;
    const pathMatch = /^ {2}(\/\S*):\s*$/.exec(line);
    if (pathMatch) currentPath = pathMatch[1].replace(/\{(\w+)\}/g, ":$1");
    const methodMatch = /^ {4}(\w+):\s*$/.exec(line);
    if (currentPath && methodMatch && HTTP_METHODS.has(methodMatch[1])) operations.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
  }
  return operations;
}

function routerOperations() {
  const operations = new Set();
  for (const layer of marketPublicRouter.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) operations.add(`${method.toUpperCase()} ${layer.route.path}`);
  }
  return operations;
}

test("T41 route ที่ลงทะเบียนตรงกับ docs/market-openapi.yaml", async () => {
  assert.deepEqual([...routerOperations()].sort(), [...(await openApiOperations())].sort());
});

test("รหัส error ใน OpenAPI ตรงกับที่ระบบตอบ", async () => {
  const text = await readFile(new URL("../docs/market-openapi.yaml", import.meta.url), "utf8");
  const listed = /enum: \[(VALIDATION_ERROR[^\]]*)\]/.exec(text)[1].split(",").map((code) => code.trim());
  assert.deepEqual(listed.sort(), Object.keys(MARKET_ERRORS).sort());
});

test("domain ที่อนุญาตต้องเป็น https://host เท่านั้น", () => {
  assert.equal(normalizeOrigin("https://shop.example.com"), "https://shop.example.com");
  assert.equal(normalizeOrigin("https://shop.example.com/"), "https://shop.example.com");
  for (const value of ["http://shop.example.com", "https://*.example.com", "https://shop.example.com/path", "https://a:b@shop.example.com", "shop.example.com", ""]) {
    assert.equal(normalizeOrigin(value), null, value);
  }
});
