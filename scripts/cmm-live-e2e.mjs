import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const [name, value] of Object.entries({ SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey })) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runTag = `cmm-e2e-${process.env.GITHUB_RUN_ID ?? Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `CmmE2e!${crypto.randomUUID()}aA9`;
const agentId = crypto.randomUUID();
const evidenceA = ["fixture://cmm/e2e/supports/a", "fixture://cmm/e2e/supports/b"];
const evidenceB = ["fixture://cmm/e2e/rejected/a", "fixture://cmm/e2e/rejected/b"];
const createdUsers = [];
const createdSeeds = [];

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}
async function createTestUser(label) {
  const email = `${runTag}-${label}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Unable to create temporary ${label} user: ${error.message}`);
  createdUsers.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !session.session?.access_token) throw new Error(`Unable to sign in temporary ${label} user`);
  return { id: data.user.id, token: session.session.access_token };
}
async function callFunction(name, token, body) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }
  return { status: response.status, payload };
}
async function makeSeed(ownerId, observationId, refs) {
  const { data, error } = await admin.from("cognitive_seeds").insert({
    agent_id: agentId,
    owner_user_id: ownerId,
    observation_id: observationId,
    hypothesis: "Temporary CMM live acceptance fixture; not production knowledge.",
    stage: "S2",
    safety_status: "PASS",
    provenance: [{ kind: "test_fixture", ref: `fixture://${runTag}/${observationId}` }],
    evidence_refs: refs,
    version: 1,
  }).select("id,stage,version").single();
  if (error) throw new Error(`Unable to create temporary seed: ${error.message}`);
  createdSeeds.push(data.id);
  return data;
}
function checks(refs, outcome = "supports") {
  return refs.map((evidence_ref, index) => ({
    evidence_ref, outcome, notes: `Temporary acceptance check ${index + 1}`,
  }));
}

let result = "FAILED";
try {
  const owner = await createTestUser("owner");
  const verifier = await createTestUser("verifier");
  const outsider = await createTestUser("outsider");

  const promotedSeed = await makeSeed(owner.id, `${runTag}-promote`, evidenceA);
  const rejectedSeed = await makeSeed(owner.id, `${runTag}-reject`, evidenceB);

  const grant = await callFunction("cognitive-evidence-validator", owner.token, {
    action: "grant_verifier", agent_id: agentId, verifier_user_id: verifier.id,
  });
  assert(grant.status === 200 && grant.payload.ok === true, "owner can assign a distinct verifier");

  const selfReview = await callFunction("cognitive-evidence-validator", owner.token, {
    action: "verify_seed", seed_id: promotedSeed.id,
    evidence_checks: checks(evidenceA), rationale: "Must be rejected: owner self-review.",
  });
  assert(selfReview.status === 403, "owner self-review is blocked");

  const unassignedReview = await callFunction("cognitive-evidence-validator", outsider.token, {
    action: "verify_seed", seed_id: promotedSeed.id,
    evidence_checks: checks(evidenceA), rationale: "Must be rejected: no assignment.",
  });
  assert(unassignedReview.status === 403, "unassigned reviewer is blocked");

  const mismatch = await callFunction("cognitive-evidence-validator", verifier.token, {
    action: "verify_seed", seed_id: promotedSeed.id,
    evidence_checks: checks(["fixture://foreign/evidence"]), rationale: "Must be rejected: evidence mismatch.",
  });
  assert(mismatch.status === 409, "foreign or incomplete evidence set is rejected");

  const promote = await callFunction("cognitive-evidence-validator", verifier.token, {
    action: "verify_seed", seed_id: promotedSeed.id,
    evidence_checks: checks(evidenceA), rationale: "All fixture evidence items support the hypothesis.",
    verifier_user_id: owner.id,
  });
  assert(promote.status === 200 && promote.payload.verification?.decision === "verified", "assigned verifier completes all-supports review");

  const reject = await callFunction("cognitive-evidence-validator", verifier.token, {
    action: "verify_seed", seed_id: rejectedSeed.id,
    evidence_checks: checks(evidenceB, "inconclusive"), rationale: "Fixture evidence is inconclusive; do not promote.",
  });
  assert(reject.status === 200 && reject.payload.verification?.decision === "rejected", "inconclusive review is recorded as rejected");

  const { data: promoted, error: promotedError } = await admin.from("cognitive_seeds")
    .select("stage,version,independently_verified_by,independent_verification_ref")
    .eq("id", promotedSeed.id).single();
  if (promotedError) throw promotedError;
  assert(promoted.stage === "S3" && promoted.version === 2, "successful review atomically promotes S2 to S3 and increments version");
  assert(promoted.independently_verified_by === verifier.id, "verifier identity comes from authenticated session, not request body");

  const { data: rejected, error: rejectedError } = await admin.from("cognitive_seeds")
    .select("stage,version").eq("id", rejectedSeed.id).single();
  if (rejectedError) throw rejectedError;
  assert(rejected.stage === "S2" && rejected.version === 1, "rejected review leaves seed at S2 version 1");

  const { data: versions, error: versionsError } = await admin.from("cognitive_seed_versions")
    .select("version,stage").eq("seed_id", promotedSeed.id).order("version");
  if (versionsError) throw versionsError;
  assert(versions.length === 2 && versions[0].stage === "S2" && versions[1].stage === "S3", "immutable S2 baseline and S3 transition snapshots exist");

  const { data: auditRows, error: auditError } = await admin.from("cmm_verification_audit")
    .select("decision,verifier_user_id,seed_version,resulting_seed_version")
    .in("seed_id", [promotedSeed.id, rejectedSeed.id]);
  if (auditError) throw auditError;
  assert(auditRows.length === 2, "one append-only audit row exists per completed review");
  const verifiedAudit = auditRows.find(row => row.decision === "verified");
  const rejectedAudit = auditRows.find(row => row.decision === "rejected");
  assert(verifiedAudit?.verifier_user_id === verifier.id && verifiedAudit.seed_version === 1 && verifiedAudit.resulting_seed_version === 2, "verified audit binds reviewer and version transition");
  assert(rejectedAudit?.seed_version === 1 && rejectedAudit.resulting_seed_version === 1, "rejected audit preserves version");

  const proposal = await callFunction("cognitive-memory-manager", owner.token, {
    seed_id: promotedSeed.id,
    request_key: crypto.randomUUID(),
    claim: "Temporary acceptance proposal; not trusted memory.",
    evidence_summary: "Synthetic evidence used only to validate the CMM pipeline.",
    confidence_basis: "Live integration test fixture; no real-world assertion.",
  });
  assert(proposal.status === 201 && proposal.payload.proposal?.status === "pending_review", "S3 seed creates a pending memory proposal only");

  const rejectedProposal = await callFunction("cognitive-memory-manager", owner.token, {
    seed_id: rejectedSeed.id,
    request_key: crypto.randomUUID(),
    claim: "Must not be admitted from S2.",
    evidence_summary: "Rejected fixture.",
    confidence_basis: "Negative-path acceptance test.",
  });
  assert(rejectedProposal.status === 409, "S2 seed cannot create a memory proposal");

  const { data: proposals, error: proposalsError } = await admin.from("memory_proposals")
    .select("status,source_seed_ids").eq("owner_user_id", owner.id);
  if (proposalsError) throw proposalsError;
  assert(proposals.length === 1 && proposals[0].status === "pending_review", "exactly one pending proposal exists; no trusted memory is auto-created");

  const { error: immutableError } = await admin.from("cognitive_seed_versions")
    .update({ transition_reason: "tamper attempt" })
    .eq("seed_id", promotedSeed.id).eq("version", 2);
  assert(Boolean(immutableError), "seed version history rejects UPDATE");

  result = "PASSED";
  console.log("CMM LIVE E2E: PASSED");
  console.log("Verified: independent assignment, self-review denial, unassigned denial, evidence mismatch denial, authenticated verifier identity, S2→S3 promotion, rejected branch, immutable snapshots, audit version binding, S3 pending proposal, S2 proposal denial, no automatic trusted memory.");
} finally {
  // Owner deletion cascades the temporary seeds and owner-scoped audit rows.
  for (const userId of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("Temporary test-user cleanup warning:", error.message);
  }
  console.log(`CMM live acceptance result: ${result}`);
  if (result !== "PASSED") process.exitCode = 1;
}
