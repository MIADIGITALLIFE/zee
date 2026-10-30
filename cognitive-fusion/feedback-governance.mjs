/**
 * Feedback governance primitives.
 * Pure and side-effect free: no storage, provider calls, identity mutation or actions.
 */
const MAX_EVIDENCE_REFS = 12;

function cleanText(value, field, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TypeError(field + " must be a non-empty string up to " + max + " characters");
  }
  return value.trim();
}

function refs(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_REFS) {
    throw new TypeError("evidence_refs must contain 1 to " + MAX_EVIDENCE_REFS + " references");
  }
  const normalized = value.map((ref) => cleanText(ref, "evidence_ref", 240));
  return [...new Set(normalized)];
}

/**
 * Compare a recorded prediction with a supplied follow-up outcome.
 * This classifies the supplied review; it does not independently verify truth.
 */
export function reviewPrediction(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }
  const prediction = cleanText(input.prediction, "prediction", 2000);
  const outcome = cleanText(input.outcome, "outcome", 2000);
  const evidenceRefs = refs(input.evidence_refs);
  const assessment = ["supported", "contradicted", "mixed", "inconclusive"].includes(input.assessment)
    ? input.assessment
    : "inconclusive";
  return {
    schema_version: "ZHI-Feedback-Review-V1.0",
    review_id: cleanText(input.review_id, "review_id", 100),
    prediction,
    outcome,
    assessment,
    evidence_refs: evidenceRefs,
    reviewer: typeof input.reviewer === "string" && input.reviewer.trim()
      ? input.reviewer.trim().slice(0, 120)
      : null,
    reviewed_at: typeof input.reviewed_at === "string" && !Number.isNaN(Date.parse(input.reviewed_at))
      ? new Date(input.reviewed_at).toISOString()
      : null,
    verification_status: "source_supplied_not_independently_verified",
    learning_effect: "proposal_only",
    automatic_weight_change: false,
    automatic_memory_write: false
  };
}

/**
 * Create a pending memory candidate only from an explicitly supplied,
 * human-reviewed summary and source references.
 */
export function proposeMemoryCandidate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }
  if (input.human_reviewed !== true) {
    throw new TypeError("human_reviewed must be true before proposing a memory candidate");
  }
  const content = cleanText(input.content, "content", 1200);
  const sourceRefs = refs(input.source_refs);
  const category = ["fact", "preference", "goal", "relationship", "event", "reflection"].includes(input.category)
    ? input.category
    : "reflection";
  return {
    schema_version: "ZHI-Memory-Candidate-V1.0",
    candidate_id: cleanText(input.candidate_id, "candidate_id", 100),
    content,
    category,
    source_refs: sourceRefs,
    status: "pending_human_approval",
    approved_by: null,
    persisted: false,
    may_update_identity: false,
    created_at: typeof input.created_at === "string" && !Number.isNaN(Date.parse(input.created_at))
      ? new Date(input.created_at).toISOString()
      : null
  };
}
