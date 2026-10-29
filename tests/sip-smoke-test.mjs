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

const scriptStart = html.indexOf("<script>");
const scriptEnd = html.indexOf("</script>", scriptStart);
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "Expected one inline application script");
const script = html.slice(scriptStart + "<script>".length, scriptEnd);
assert.equal(html.indexOf("<script>", scriptEnd + 1), -1, "Expected only one inline application script");
new vm.Script(script, { filename: "sip-engine-inline.js" });

for (const symbol of [
  "function normalize(", "function runAnalysis(", "function simulateTask(",
  "function exportJSON(", "function importJSON(", "function validWeights(",
  "function saveLocalState("
]) {
  assert.ok(script.includes(symbol), `Missing expected engine function: ${symbol}`);
}
assert.ok(html.includes("schema_version:'1.0'"), "Export should include schema version 1.0");
assert.ok(script.includes("localStorage"), "Prototype should explicitly use browser-local storage");
assert.ok(!script.includes("fetch("), "Offline prototype must not call fetch()");
assert.ok(!script.includes("XMLHttpRequest"), "Offline prototype must not use XMLHttpRequest");
assert.ok(!script.includes("WebSocket("), "Offline prototype must not use WebSocket");

console.log("SIP static smoke checks passed. Browser interactions remain unverified.");
