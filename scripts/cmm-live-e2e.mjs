import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
// Prefer current Supabase key names; retain legacy aliases during migration.
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const [name, value] of Object.entries({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: anonKey, SUPABASE_SECRET_KEY: serviceKey })) {
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
  // Fail before creating any fixture users if either project key is invalid.
  const publicKeyCheck = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!publicKeyCheck.ok) {
    throw new Error(`Supabase publishable key rejected (HTTP ${publicKeyCheck.status}); check SUPABASE_PUBLISHABLE_KEY for project xeykndpirxfuozeunkku.`);
  }
  const { error: adminKeyError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (adminKeyError) {
    throw new Error(`Supabase secret key rejected by Auth Admin API: ${adminKeyError.message}. Set SUPABASE_SECRET_KEY to this project's server-side secret key (sb_secret_...) or its valid legacy service_role JWT. Do not use the project URL, anon/publishable key, JWT signing secret, or the displayed key label.`);
  }

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

  // A proposal is not trusted memory until the authenticated owner explicitly approves it.
  const { data: beforeApproval, error: beforeApprovalError } = await admin.from("cognitive_memories")
    .select("id").eq("owner_user_id", owner.id);
  if (beforeApprovalError) throw beforeApprovalError;
  assert(beforeApproval.length === 0, "proposal creation alone does not create trusted memory");

  const review = await callFunction("cognitive-memory-manager", owner.token, {
    action: "review_proposal",
    proposal_id: proposal.payload.proposal.id,
    decision: "approve",
    rationale: "Owner reviewed the verified fixture and approves durable admission.",
  });
  assert(review.status === 200 && review.payload.review?.status === "approved", "owner can explicitly approve a verified proposal");
  const memoryId = review.payload.review.memory_id;
  assert(typeof memoryId === "string", "approval returns the trusted memory ID");

  const replay = await callFunction("cognitive-memory-manager", owner.token, {
    action: "review_proposal",
    proposal_id: proposal.payload.proposal.id,
    decision: "approve",
    rationale: "Idempotent replay of the same owner approval.",
  });
  assert(replay.status === 200 && replay.payload.review?.idempotent_replay === true,
    "repeated approval is idempotent and does not create a duplicate memory");

  const { data: trustedMemory, error: trustedMemoryError } = await admin.from("cognitive_memories")
    .select("id,lifecycle_status,verification_status,current_version,source_seed_ids")
    .eq("id", memoryId).single();
  if (trustedMemoryError) throw trustedMemoryError;
  assert(trustedMemory.lifecycle_status === "trusted" && trustedMemory.verification_status === "verified",
    "approved memory is trusted and independently verified");
  assert(trustedMemory.current_version === 1 && trustedMemory.source_seed_ids.includes(promotedSeed.id),
    "trusted memory keeps its source seed lineage");

  const { data: evidenceRows, error: evidenceRowsError } = await admin.from("memory_evidence")
    .select("evidence_ref,verification_status,independently_verified,verifier_id")
    .eq("memory_id", memoryId);
  if (evidenceRowsError) throw evidenceRowsError;
  assert(evidenceRows.length === evidenceA.length &&
    evidenceRows.every(row => row.verification_status === "verified" &&
      row.independently_verified === true && row.verifier_id === verifier.id),
    "trusted memory inherits each independently reviewed evidence reference");

  const { data: reviewAudit, error: reviewAuditError } = await admin.from("memory_proposal_reviews")
    .select("decision,reviewer_id,resulting_memory_id")
    .eq("proposal_id", proposal.payload.proposal.id);
  if (reviewAuditError) throw reviewAuditError;
  assert(reviewAudit.length === 1 && reviewAudit[0].decision === "approve" &&
    reviewAudit[0].reviewer_id === owner.id && reviewAudit[0].resulting_memory_id === memoryId,
    "owner decision is captured in append-only proposal review audit");

  const { data: proposals, error: proposalsError } = await admin.from("memory_proposals")
    .select("status,source_seed_ids,resulting_memory_id").eq("owner_user_id", owner.id);
  if (proposalsError) throw proposalsError;
  assert(proposals.length === 1 && proposals[0].status === "approved" &&
    proposals[0].resulting_memory_id === memoryId,
    "approved proposal links to exactly one durable trusted memory");

  const { error: immutableError } = await admin.from("cognitive_seed_versions")
    .update({ transition_reason: "tamper attempt" })
    .eq("seed_id", promotedSeed.id).eq("version", 2);
  assert(Boolean(immutableError), "seed version history rejects UPDATE");

  result = "PASSED";
  console.log("CMM LIVE E2E: PASSED");
  console.log("Verified: independent assignment, self-review denial, unassigned denial, evidence mismatch denial, authenticated verifier identity, S2→S3 promotion, rejected branch, immutable snapshots, audit version binding, S3 pending proposal, S2 proposal denial, no automatic trusted memory.");
} finally {
  // Remove dependent CMM rows in FK-safe order before deleting temporary users.
  for (const userId of createdUsers) {
    const cleanupSteps = [
      ["memory_proposal_reviews", "owner_user_id"],
      ["memory_proposals", "owner_user_id"],
      ["memory_reviews", "owner_user_id"],
      ["memory_evidence", "owner_user_id"],
      ["memory_versions", "owner_user_id"],
      ["cognitive_memories", "owner_user_id"],
      ["cognitive_seed_versions", "owner_user_id"],
      ["cmm_verification_audit", "owner_user_id"],
      ["cmm_verifier_assignments", "owner_user_id"],
      ["cognitive_seeds", "owner_user_id"],
    ];
    for (const [table, column] of cleanupSteps) {
      const { error } = await admin.from(table).delete().eq(column, userId);
      if (error) console.error(`Temporary cleanup warning (${table}):`, error.message);
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("Temporary test-user cleanup warning:", error.message);
  }
  console.log(`CMM live acceptance result: ${result}`);
  if (result !== "PASSED") process.exitCode = 1;
}
