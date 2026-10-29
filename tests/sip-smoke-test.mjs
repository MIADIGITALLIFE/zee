import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../sip-engine/index.html", import.meta.url), "utf8");
assert.match(html, /<!doctype html>/i, "SIP page should be a complete HTML document");
for (const id of [
  "weights", "weightTotal", "runAnalysis", "simulateTask",
  "exportJson", "chooseImport", "importFile", "saveProfile", "loadProfile"
]) {
  assert.ok(html.includes(`id="${id}"`), `Missing expected UI element: ${id}`);
}

const scripts = [...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/gi)];
assert.equal(scripts.length, 1, "Expected one inline application script");
new vm.Script(scripts[0][1], { filename: "sip-engine-inline.js" });

for (const symbol of [
  "function normalize(", "function runAnalysis(", "function simulateTask(",
  "function exportJSON(", "function importJSON(", "function validWeights(",
  "function saveLocalState("
]) {
  assert.ok(scripts[0][1].includes(symbol), `Missing expected engine function: ${symbol}`);
}
assert.match(html, /schema_version:'1\.0'/, "Export should include schema version 1.0");
assert.match(html, /localStorage/, "Prototype should explicitly use browser-local storage");
assert.doesNotMatch(scripts[0][1], /\\bfetch\\s*\\(|XMLHttpRequest|\\bWebSocket\\s*\\(/, "Offline prototype must not make network requests");

console.log("SIP static smoke checks passed. Browser interactions remain unverified.");
