import test from "node:test";
import assert from "node:assert/strict";
import { createSeedRecord, transitionSeed } from "./seed-manager.js";

const base = () => createSeedRecord({
  seed_id: "seed-1", agent_id: "agent-1", observation_id: "obs-1",
  hypothesis: "A candidate hypothesis", provenance: ["event:evt-1"], safety_status: "PASS",
});

test("creates an immutable S2 hypothesis with provenance", () => {
  const seed = base();
  assert.equal(seed.stage, "S2");
  assert.equal(seed.version, 1);
  assert.equal(Object.isFrozen(seed), true);
});

test("rejects a stage skip", () => {
  const result = transitionSeed(base(), {
    to: "S4", safety_status: "PASS", evidence_ids: ["integration:1"], actor_id: "reviewer",
    review_role: "integration-reviewer",
  });
  assert.equal(result.accepted, false);
  assert.equal(result.code, "INVALID_TRANSITION");
});

test("requires safety PASS and evidence", () => {
  const seed = base();
  assert.equal(transitionSeed(seed, { to: "S3", safety_status: "WARN", evidence_ids: ["v1"], actor_id: "verifier" }).code, "SAFETY_NOT_PASS");
  assert.equal(transitionSeed(seed, { to: "S3", safety_status: "PASS", evidence_ids: [], actor_id: "verifier" }).code, "EVIDENCE_REQUIRED");
});

test("S3 requires an independent verifier", () => {
  const result = transitionSeed(base(), {
    to: "S3", safety_status: "PASS", evidence_ids: ["verification:report-1"], actor_id: "agent-1",
  });
  assert.equal(result.code, "INDEPENDENT_VERIFIER_REQUIRED");
});

test("valid adjacent transitions create new versions without mutating prior snapshots", () => {
  const original = base();
  const verified = transitionSeed(original, {
    to: "S3", safety_status: "PASS", evidence_ids: ["verification:report-1"], actor_id: "independent-verifier",
  });
  assert.equal(verified.accepted, true);
  assert.equal(verified.seed.version, 2);
  assert.equal(original.stage, "S2");
  const integrated = transitionSeed(verified.seed, {
    to: "S4", safety_status: "PASS", evidence_ids: ["integration:review-1"],
    actor_id: "reviewer-1", review_role: "integration-reviewer",
  });
  assert.equal(integrated.accepted, true);
  assert.equal(integrated.seed.version, 3);
  assert.equal(integrated.seed.history.length, 3);
});

test("S4 requires review role; S5 requires longitudinal evidence", () => {
  const s3 = transitionSeed(base(), {
    to: "S3", safety_status: "PASS", evidence_ids: ["verification:1"], actor_id: "verifier",
  }).seed;
  const s4 = transitionSeed(s3, {
    to: "S4", safety_status: "PASS", evidence_ids: ["integration:1"],
    actor_id: "reviewer", review_role: "integration-reviewer",
  }).seed;
  assert.equal(transitionSeed(s4, {
    to: "S5", safety_status: "PASS", evidence_ids: ["single-event:1"],
    actor_id: "evolver", review_role: "evolution-reviewer",
  }).code, "LONGITUDINAL_EVIDENCE_REQUIRED");
  assert.equal(transitionSeed(s4, {
    to: "S5", safety_status: "PASS", evidence_ids: ["longitudinal:window-1"],
    actor_id: "evolver", review_role: "evolution-reviewer",
  }).accepted, true);
});
