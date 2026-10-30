import assert from "node:assert/strict";
import { coordinateCognition, DOMAINS } from "../cognitive-fusion/coordinator.mjs";

const result = coordinateCognition({
  agent_id: "test-agent", request_id: "test-001", message: "Please assess this situation.",
  sip_profile: {
    schema_version: "1.0",
    profile: { name: "Test persona", goal: "Explore carefully", risk: 40, initiative: 60 },
    systems: [{ id: "reasoning" }, { id: "memory" }, { id: "creative" }, { id: "safety" }],
    weights: { reasoning: 35, memory: 25, creative: 20, safety: 20 }
  },
  agent_context: { current_mind: { current_goal: "Explore", energy: 70, stress: null }, memory_count: 5, conversation_count: 4, position_present: true, activity_present: false },
  ontology_records: [
    { id: "self-1", ontology_type: "Self", label: "Agent identity", epistemic_status: "observed", source_refs: ["profile"] },
    { id: "world-1", ontology_type: "WorldObject", label: "A place", epistemic_status: "reported", evidence: ["scene-log"] },
    { id: "claim-2", ontology_type: "EpistemicClaim", label: "Unconfirmed claim", epistemic_status: "hypothesis", source_refs: [] },
    { id: "conflict-3", ontology_type: "Relation", label: "Conflicting relation", epistemic_status: "conflicted", source_refs: ["memory-a", "memory-b"] }
  ]
});
assert.equal(result.schema_version, "ZHI-Cognitive-Fusion-V1.0");
assert.equal(result.mode, "proposal_only");
assert.equal(result.sip_profile.profile.name, "Test persona");
assert.equal(result.sip_profile.weights.safety, 20);
assert.equal(result.agent_state_summary.current_goal_present, true);
assert.equal(result.agent_state_summary.energy_present, true);
assert.equal(result.agent_state_summary.stress_present, false);
assert.equal(result.agent_state_summary.memory_count, 5);
assert.equal(result.agent_state_summary.conversation_count, 4);
assert.equal(result.agent_state_summary.position_present, true);
assert.equal(Object.hasOwn(result.agent_state_summary, "current_goal"), false, "state summary must not copy raw goal text");
assert.throws(() => coordinateCognition({ sip_profile: { schema_version: "1.0" } }), /complete SIP 1.0 export/);
assert.equal(result.input_summary.ontology_record_count, 4);
assert.equal(result.domain_coverage.Self, true);
assert.equal(result.domain_coverage.World, true, "The production ontology schema uses type: WorldObject");
assert.equal(result.domain_coverage.Relation, true);
assert.equal(result.epistemic_review.hypotheses.length, 1);
assert.equal(result.epistemic_review.conflicts.length, 1);
assert.equal(result.persistence, "not_performed");
assert.equal(result.model_reasoning_performed, false);
assert.equal(result.required_review, true);
assert.deepEqual(DOMAINS, ["Self", "Other", "World", "Relation", "Change", "Feedback"]);
assert.throws(() => coordinateCognition({ ontology_records: "bad" }), /must be an array/);
assert.throws(() => coordinateCognition({ ontology_records: Array(33).fill({}) }), /too many/);
assert.throws(() => coordinateCognition({ ontology_records: [null] }), /must be an object/);
console.log("Cognitive Fusion smoke tests passed. Provider reasoning and production persistence remain unverified.");
