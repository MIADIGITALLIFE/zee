import assert from "node:assert/strict";
import { reviewPrediction, proposeMemoryCandidate } from "../cognitive-fusion/feedback-governance.mjs";

const review = reviewPrediction({
  review_id: "review-001",
  prediction: "The agent will complete the planned task.",
  outcome: "The task was completed according to the activity record.",
  assessment: "supported",
  evidence_refs: ["activity-log:42"],
  reviewer: "human-reviewer",
  reviewed_at: "2026-10-30T10:00:00Z"
});
assert.equal(review.assessment, "supported");
assert.equal(review.verification_status, "source_supplied_not_independently_verified");
assert.equal(review.automatic_weight_change, false);
assert.equal(review.automatic_memory_write, false);
assert.throws(() => reviewPrediction({ review_id: "x", prediction: "p", outcome: "o", evidence_refs: [] }), /evidence_refs/);

const candidate = proposeMemoryCandidate({
  candidate_id: "memory-candidate-001",
  content: "The agent prefers written summaries.",
  category: "preference",
  source_refs: ["conversation:12"],
  human_reviewed: true,
  created_at: "2026-10-30T10:00:00Z"
});
assert.equal(candidate.status, "pending_human_approval");
assert.equal(candidate.persisted, false);
assert.equal(candidate.may_update_identity, false);
assert.throws(() => proposeMemoryCandidate({
  candidate_id: "x", content: "unreviewed", source_refs: ["source"], human_reviewed: false
}), /human_reviewed/);
assert.throws(() => proposeMemoryCandidate({
  candidate_id: "x", content: "missing source", source_refs: [], human_reviewed: true
}), /evidence_refs/);

console.log("Feedback governance tests passed. No persistence or automatic learning is performed.");
