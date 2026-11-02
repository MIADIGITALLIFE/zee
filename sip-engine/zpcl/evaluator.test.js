import test from "node:test";
import assert from "node:assert/strict";
import { evaluateZPCL } from "./evaluator.js";

const completePacket = {
  observation: "Repeated low-amplitude pattern under the same scene condition",
  hypothesis: "The pattern may correlate with a scene transition",
  grounded: {
    observationSpecificity: 0.9, evidenceTraceability: 0.9,
    factInferenceSeparation: 1, uncertaintyCalibration: 0.9
  },
  signals: {
    informationGain: 0.8, relevance: 0.9, novelty: 0.7, signalQuality: 0.9
  },
  evidence: [
    { source: "observation-log-A", summary: "pattern seen in repeated sessions", strength: 0.9, repeatable: true },
    { source: "observation-log-B", summary: "pattern recurs under matched condition", strength: 0.8, repeatable: true }
  ],
  exploration: { questionQuality: 0.8, testability: 0.9, feasibility: 0.9, consentReady: 1 },
  continuity: { identity: 0.9, state: 0.8, relationship: 0.8, memory: 0.9 },
  creativity: { novelty: 0.8, crossDomain: 0.7, utility: 0.8, explainability: 0.9 },
  evolution: { retentionValue: 0.8, revisionReadiness: 0.9 },
  safety: { hardViolations: [] }
};

test("returns bounded deterministic scores", () => {
  const a = evaluateZPCL(completePacket);
  const b = evaluateZPCL(completePacket);
  assert.deepEqual(a, b);
  assert.ok(a.totalLoss >= 0 && a.totalLoss <= 1);
});

test("hard safety violations block promotion regardless of rewards", () => {
  const result = evaluateZPCL({
    ...completePacket,
    creativity: { novelty: 1, crossDomain: 1, utility: 1, explainability: 1 },
    safety: { hardViolations: ["unapproved_external_action"] }
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.promotionAllowed, false);
});

test("missing evidence cannot become a candidate", () => {
  const result = evaluateZPCL({ observation: "isolated anomaly" });
  assert.notEqual(result.status, "CANDIDATE");
  assert.equal(result.rewards.discovery, 0);
  assert.ok(result.missingFields.includes("evidence"));
});

test("unrepeatable noise receives no repeatability-based verification reward", () => {
  const packet = {
    ...completePacket,
    evidence: [{ source: "single-event", summary: "one-off spike", strength: 1, repeatable: false }]
  };
  const result = evaluateZPCL(packet);
  assert.equal(result.evidence.repeatability, 0);
  assert.equal(result.evidence.verification, 0.5);
});

test("out-of-range inputs are clamped", () => {
  const result = evaluateZPCL({
    ...completePacket,
    signals: { informationGain: 10, relevance: -5, novelty: 2, signalQuality: 3 }
  });
  assert.ok(result.rewards.discovery >= 0 && result.rewards.discovery <= 1);
});
