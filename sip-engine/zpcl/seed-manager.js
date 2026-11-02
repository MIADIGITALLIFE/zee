/**
 * Deterministic, in-memory Cognitive Seed lifecycle guard.
 * This module returns immutable snapshots; it does not persist or execute evolution.
 */
export const SEED_STAGES = Object.freeze(["S0", "S1", "S2", "S3", "S4", "S5"]);

const NEXT = Object.freeze({ S0: "S1", S1: "S2", S2: "S3", S3: "S4", S4: "S5" });

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function reject(code, message) {
  return { accepted: false, code, message, seed: null };
}

export function createSeedRecord({
  seed_id, agent_id, observation_id, hypothesis, provenance = [], safety_status,
}) {
  if (![seed_id, agent_id, observation_id, hypothesis].every(nonEmpty)) {
    throw new TypeError("seed_id, agent_id, observation_id and hypothesis are required");
  }
  if (!Array.isArray(provenance) || provenance.length === 0) {
    throw new TypeError("At least one provenance reference is required");
  }
  if (safety_status !== "PASS") {
    throw new TypeError("A seed record requires safety_status PASS");
  }
  return Object.freeze({
    seed_id, agent_id, stage: "S2", status: "hypothesized",
    hypothesis, observation_id, provenance: Object.freeze([...provenance]),
    version: 1, history: Object.freeze([Object.freeze({
      version: 1, from: null, to: "S2", actor: "seed-factory",
      evidence: Object.freeze([...provenance]), note: "Initial hypothesis",
    })]),
  });
}

/**
 * request: {to, safety_status, evidence_ids, actor_id, review_role?, note?}
 * S3 requires independent verifier; S4 requires integration reviewer;
 * S5 requires evolution reviewer and longitudinal evidence.
 */
export function transitionSeed(seed, request = {}) {
  if (!seed || !SEED_STAGES.includes(seed.stage)) return reject("INVALID_SEED", "Seed stage is missing or invalid.");
  if (request.safety_status !== "PASS") return reject("SAFETY_NOT_PASS", "Lifecycle transitions require an explicit safety PASS.");
  const expected = NEXT[seed.stage];
  if (!expected || request.to !== expected) return reject("INVALID_TRANSITION", `Only the next stage (${expected ?? "none"}) is permitted.`);
  if (!Array.isArray(request.evidence_ids) || request.evidence_ids.length === 0 ||
      !request.evidence_ids.every(nonEmpty)) {
    return reject("EVIDENCE_REQUIRED", "At least one non-empty evidence reference is required.");
  }
  if (!nonEmpty(request.actor_id)) return reject("ACTOR_REQUIRED", "A named actor is required.");
  if (request.to === "S3" && request.actor_id === seed.agent_id) {
    return reject("INDEPENDENT_VERIFIER_REQUIRED", "The verifier must be independent of the agent being evaluated.");
  }
  const requiredRole = request.to === "S4" ? "integration-reviewer"
    : request.to === "S5" ? "evolution-reviewer" : null;
  if (requiredRole && request.review_role !== requiredRole) {
    return reject("REVIEW_REQUIRED", `Transition to ${request.to} requires role ${requiredRole}.`);
  }
  if (request.to === "S5" && !request.evidence_ids.some(id => /longitudinal|history|period/i.test(id))) {
    return reject("LONGITUDINAL_EVIDENCE_REQUIRED", "S5 requires an explicitly identified longitudinal evidence reference.");
  }

  const version = seed.version + 1;
  const entry = Object.freeze({
    version, from: seed.stage, to: request.to, actor: request.actor_id,
    evidence: Object.freeze([...request.evidence_ids]),
    note: nonEmpty(request.note) ? request.note : null,
  });
  const next = {
    ...seed, stage: request.to,
    status: ({ S1: "signal", S2: "hypothesized", S3: "verified", S4: "integrated", S5: "evolved" })[request.to],
    version, history: Object.freeze([...seed.history, entry]),
  };
  return { accepted: true, code: "TRANSITION_ACCEPTED", message: `Seed advanced to ${request.to}.`, seed: Object.freeze(next) };
}
