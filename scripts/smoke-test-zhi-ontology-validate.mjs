import assert from "node:assert/strict";

const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!baseUrl || !anonKey || !accessToken) {
  console.error("Set SUPABASE_URL, SUPABASE_ANON_KEY, and a non-production SUPABASE_ACCESS_TOKEN.");
  process.exit(2);
}

const endpoint = `${baseUrl}/functions/v1/zhi-ontology-validate`;
const headers = { "content-type": "application/json", apikey: anonKey };
const record = {
  id: "smokeTestRecord01",
  ontology_type: "Self",
  label: "Smoke test record",
  description: "Temporary validation-only smoke test; not persisted.",
  state: "draft",
  epistemic_status: "reported",
  evidence: [],
  source_refs: [],
  event_time: null,
  observed_at: null,
  recorded_at: new Date().toISOString(),
  validity: { from: null, to: null },
  revision: 1,
  access_policy: "draft-local-only",
  retention_policy: "not-persisted",
  relations: [],
  lifecycle: { transition: "CREATE", status: "candidate", requires_validation: true },
  verification_status: "not-validated",
  schema_version: "ZHI-Ontology-Dictionary-V1.0",
};

async function post(body, token) {
  const h = { ...headers };
  if (token !== undefined) h.authorization = `Bearer ${token}`;
  return fetch(endpoint, { method: "POST", headers: h, body });
}

const noAuth = await post(JSON.stringify({ record }));
assert.equal(noAuth.status, 401, `no-token request expected 401, got ${noAuth.status}`);
console.log("PASS missing bearer token -> 401");

const badAuth = await post(JSON.stringify({ record }), "invalid-non-production-token");
assert.equal(badAuth.status, 401, `invalid-token request expected 401, got ${badAuth.status}`);
console.log("PASS invalid bearer token -> 401");

const badRecord = await post(JSON.stringify({ record: { id: "bad" } }), accessToken);
assert.equal(badRecord.status, 400, `invalid record expected 400, got ${badRecord.status}`);
const badBody = await badRecord.json();
assert.equal(badBody.ok, false, "invalid record response should set ok=false");
console.log("PASS invalid schema -> 400");

const good = await post(JSON.stringify({ record }), accessToken);
assert.equal(good.status, 200, `valid record expected 200, got ${good.status}`);
const goodBody = await good.json();
assert.equal(goodBody.ok, true, "valid record should set ok=true");
assert.equal(goodBody.persistence, "not-performed", "endpoint must not persist data");
assert.equal(goodBody.validation_status, "valid-for-review");
console.log("PASS valid record -> 200, validation-only response");

const tooLarge = await post(JSON.stringify({ record, padding: "x".repeat(70 * 1024) }), accessToken);
assert.equal(tooLarge.status, 413, `oversized request expected 413, got ${tooLarge.status}`);
console.log("PASS oversized request -> 413");
console.log("All smoke tests passed. No record should have been persisted.");