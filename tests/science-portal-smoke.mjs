import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../science/index.html", import.meta.url), "utf8");
assert.match(html, /ZEE SCIENCE/);
assert.match(html, /Teaching|Let's learn/);
assert.match(html, /Let's practise/);
assert.match(html, /Independent test/);
assert.match(html, /Your lesson summary/);
assert.match(html, /learning evidence tells us/);
assert.match(html, /create_student/);
assert.match(html, /list_students/);
assert.match(html, /get_dashboard/);
assert.doesNotMatch(html, /SUPABASE_SERVICE_ROLE_KEY|AGNES_API_KEY/);

const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(moduleScript, "Expected a module script");
const javascript = moduleScript[1].replace(/^import .*;\s*/m, "");
new Function(javascript);

console.log("ZEE Science portal smoke test passed.");
