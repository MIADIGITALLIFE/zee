/**
 * SIP evolution governance.
 * Pure and side-effect free: validates snapshots and creates reviewable proposals only.
 * No automatic learning, persistence, identity mutation or provider calls.
 */
const SYSTEMS = ["reasoning", "memory", "creative", "safety"];
const MAX_DELTA = 5;
const MAX_REFS = 12;

function nonEmpty(value, field, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TypeError(field + " must be a non-empty string up to " + max + " characters");
  }
  return value.trim();
}

function normalizeSip(config) {
  if (!config || typeof config !== "object" || Array.isArray(config) ||
      config.schema_version !== "1.0" || !config.profile || typeof config.profile !== "object" ||
      !Array.isArray(config.systems) || !config.weights || typeof config.weights !== "object" ||
      Array.isArray(config.weights)) {
    throw new TypeError("config must be a complete SIP 1.0 export");
  }
  const p = config.profile;
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 80 ||
      typeof p.goal !== "string" || p.goal.length > 1000 ||
      !Number.isInteger(p.risk) || p.risk < 0 || p.risk > 100 ||
      !Number.isInteger(p.initiative) || p.initiative < 0 || p.initiative > 100) {
    throw new TypeError("SIP profile is invalid");
  }
  if (config.systems.length !== SYSTEMS.length ||
      !SYSTEMS.every((id, index) => config.systems[index]?.id === id) ||
      Object.keys(config.weights).length !== SYSTEMS.length ||
      !SYSTEMS.every(id => Number.isInteger(config.weights[id]) && config.weights[id] >= 0 && config.weights[id] <= 100) ||
      SYSTEMS.reduce((sum, id) => sum + config.weights[id], 0) !== 100) {
    throw new TypeError("SIP systems or weights are invalid");
  }
  return {
    schema_version: "1.0",
    profile: { name: p.name.trim(), goal: p.goal.trim(), risk: p.risk, initiative: p.initiative },
    systems: SYSTEMS.map(id => ({ id })),
    weights: Object.fromEntries(SYSTEMS.map(id => [id, config.weights[id]]))
  };
}

function sourceRefs(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_REFS) {
    throw new TypeError("evidence_refs must contain 1 to " + MAX_REFS + " references");
  }
  const result = value.map(ref => nonEmpty(ref, "evidence_ref", 240));
  return [...new Set(result)];
}

/** Create a version-labelled snapshot. The caller is responsible for durable storage. */
export function createSipSnapshot(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("input must be an object");
  return {
    schema_version: "ZHI-SIP-Snapshot-V1.0",
    version_id: nonEmpty(input.version_id, "version_id"),
    parent_version_id: input.parent_version_id == null ? null : nonEmpty(input.parent_version_id, "parent_version_id"),
    created_at: typeof input.created_at === "string" && !Number.isNaN(Date.parse(input.created_at))
      ? new Date(input.created_at).toISOString()
      : null,
    config: normalizeSip(input.config),
    persisted: false
  };
}

/** Compare two snapshots without deciding which version is better. */
export function compareSipSnapshots(before, after) {
  if (!before || !after || before.schema_version !== "ZHI-SIP-Snapshot-V1.0" ||
      after.schema_version !== "ZHI-SIP-Snapshot-V1.0") {
    throw new TypeError("before and after must be SIP snapshot envelopes");
  }
  const a = normalizeSip(before.config);
  const b = normalizeSip(after.config);
  const changedSystems = SYSTEMS.filter(id => a.weights[id] !== b.weights[id]).map(id => ({
    system: id, before: a.weights[id], after: b.weights[id], delta: b.weights[id] - a.weights[id]
  }));
  const profileChanges = ["name", "goal", "risk", "initiative"].filter(key =>
    a.profile[key] !== b.profile[key]
  ).map(key => ({ field: key, before: a.profile[key], after: b.profile[key] }));
  return {
    schema_version: "ZHI-SIP-Diff-V1.0",
    from_version_id: nonEmpty(before.version_id, "before.version_id"),
    to_version_id: nonEmpty(after.version_id, "after.version_id"),
    weight_changes: changedSystems,
    profile_changes: profileChanges,
    unchanged: changedSystems.length === 0 && profileChanges.length === 0
  };
}

/**
 * Build a bounded proposal from explicit human-authored deltas.
 * Deltas must sum to zero; no adjustment is inferred from feedback or outcomes.
 */
export function proposeSipEvolution(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("input must be an object");
  const base = input.base_snapshot;
  if (!base || base.schema_version !== "ZHI-SIP-Snapshot-V1.0") throw new TypeError("base_snapshot is invalid");
  const config = normalizeSip(base.config);
  const deltas = input.proposed_deltas;
  if (!deltas || typeof deltas !== "object" || Array.isArray(deltas) ||
      Object.keys(deltas).some(key => !SYSTEMS.includes(key))) {
    throw new TypeError("proposed_deltas must use only SIP system IDs");
  }
  const normalizedDeltas = Object.fromEntries(SYSTEMS.map(id => {
    const delta = deltas[id] ?? 0;
    if (!Number.isInteger(delta) || Math.abs(delta) > MAX_DELTA) {
      throw new RangeError("each proposed delta must be an integer between -5 and 5");
    }
    return [id, delta];
  }));
  if (SYSTEMS.reduce((sum, id) => sum + normalizedDeltas[id], 0) !== 0) {
    throw new RangeError("proposed deltas must sum to zero");
  }
  const nextWeights = Object.fromEntries(SYSTEMS.map(id => [id, config.weights[id] + normalizedDeltas[id]]));
  if (SYSTEMS.some(id => nextWeights[id] < 0 || nextWeights[id] > 100) ||
      SYSTEMS.reduce((sum, id) => sum + nextWeights[id], 0) !== 100) {
    throw new RangeError("proposed weights must remain between 0 and 100 and total 100");
  }
  const evidenceRefs = sourceRefs(input.evidence_refs);
  return {
    schema_version: "ZHI-SIP-Evolution-Proposal-V1.0",
    proposal_id: nonEmpty(input.proposal_id, "proposal_id"),
    base_version_id: nonEmpty(base.version_id, "base_version_id"),
    rollback_to_version_id: nonEmpty(base.version_id, "rollback_to_version_id"),
    proposed_deltas: normalizedDeltas,
    proposed_weights: nextWeights,
    reason: nonEmpty(input.reason, "reason", 1000),
    evidence_refs: evidenceRefs,
    human_approval_required: true,
    approval_status: "pending",
    applied: false,
    persisted: false,
    automatic_learning: false,
    identity_mutation: false,
    max_absolute_delta: MAX_DELTA
  };
}
