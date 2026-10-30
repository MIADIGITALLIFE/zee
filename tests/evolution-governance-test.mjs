import assert from "node:assert/strict";
import { createSipSnapshot, compareSipSnapshots, proposeSipEvolution } from "../cognitive-fusion/evolution-governance.mjs";

const config = {
  schema_version: "1.0",
  profile: { name: "Careful explorer", goal: "Explore with evidence", risk: 40, initiative: 55 },
  systems: [{id:"reasoning"},{id:"memory"},{id:"creative"},{id:"safety"}],
  weights: { reasoning: 30, memory: 25, creative: 20, safety: 25 }
};
const base = createSipSnapshot({ version_id: "sip-v1", config, created_at: "2026-10-30T10:00:00Z" });
assert.equal(base.persisted, false);

const next = createSipSnapshot({
  version_id: "sip-v2", parent_version_id: "sip-v1",
  config: { ...config, weights: { reasoning: 32, memory: 25, creative: 18, safety: 25 } }
});
const diff = compareSipSnapshots(base, next);
assert.equal(diff.from_version_id, "sip-v1");
assert.deepEqual(diff.weight_changes.map(x => x.system), ["reasoning", "creative"]);
assert.equal(diff.unchanged, false);
assert.equal(compareSipSnapshots(base, base).unchanged, true);

const proposal = proposeSipEvolution({
  proposal_id: "evo-001",
  base_snapshot: base,
  proposed_deltas: { reasoning: 2, creative: -2 },
  reason: "Human reviewer proposes a small emphasis adjustment after reviewing the cited feedback.",
  evidence_refs: ["review:001", "conversation:12"]
});
assert.deepEqual(proposal.proposed_weights, { reasoning: 32, memory: 25, creative: 18, safety: 25 });
assert.equal(proposal.rollback_to_version_id, "sip-v1");
assert.equal(proposal.human_approval_required, true);
assert.equal(proposal.approval_status, "pending");
assert.equal(proposal.applied, false);
assert.equal(proposal.persisted, false);
assert.equal(proposal.automatic_learning, false);
assert.throws(() => proposeSipEvolution({
  proposal_id: "bad-1", base_snapshot: base,
  proposed_deltas: { reasoning: 6, creative: -6 },
  reason: "Too large", evidence_refs: ["review:1"]
}), /between -5 and 5/);
assert.throws(() => proposeSipEvolution({
  proposal_id: "bad-2", base_snapshot: base,
  proposed_deltas: { reasoning: 2 },
  reason: "Unbalanced", evidence_refs: ["review:1"]
}), /sum to zero/);
assert.throws(() => proposeSipEvolution({
  proposal_id: "bad-3", base_snapshot: base,
  proposed_deltas: { reasoning: 1, creative: -1 },
  reason: "No evidence", evidence_refs: []
}), /evidence_refs/);
assert.throws(() => createSipSnapshot({ version_id: "bad", config: { schema_version: "1.0" } }), /complete SIP 1.0/);

console.log("Evolution governance tests passed. No automatic adaptation or persistence is performed.");
