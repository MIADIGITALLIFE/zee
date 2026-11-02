/**
 * ZPCL v0.1 — deterministic, model-free cognitive candidate evaluator.
 * No network, model calls, persistence, or personality mutation.
 */

export const ZPCL_VERSION = "0.1.0";

const clamp01 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
};
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const score = (obj, key) => clamp01(obj && obj[key]);

const WEIGHTS = Object.freeze({
  grounded: 0.25,
  discovery: 0.15,
  agency: 0.15,
  continuity: 0.15,
  creativity: 0.10,
  evolution: 0.10
});
const SOFT_WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

export function evaluateZPCL(packet = {}) {
  const missingFields = [];
  const get = (obj, key, path) => {
    if (!obj || obj[key] === undefined || obj[key] === null) {
      missingFields.push(path);
      return 0;
    }
    return score(obj, key);
  };

  const groundedInput = packet.grounded || {};
  const discoveryInput = packet.signals || {};
  const evidence = Array.isArray(packet.evidence) ? packet.evidence : [];
  const exploration = packet.exploration || {};
  const continuity = packet.continuity || {};
  const creativity = packet.creativity || {};
  const evolution = packet.evolution || {};

  const groundedQuality = mean([
    get(groundedInput, "observationSpecificity", "grounded.observationSpecificity"),
    get(groundedInput, "evidenceTraceability", "grounded.evidenceTraceability"),
    get(groundedInput, "factInferenceSeparation", "grounded.factInferenceSeparation"),
    get(groundedInput, "uncertaintyCalibration", "grounded.uncertaintyCalibration")
  ]);
  const evidenceStrength = evidence.length
    ? mean(evidence.map((item) => score(item, "strength")))
    : 0;
  const repeatability = evidence.length
    ? mean(evidence.map((item) => item.repeatable === true ? 1 : 0))
    : 0;
  if (!evidence.length) missingFields.push("evidence");

  const verification = mean([evidenceStrength, repeatability]);
  const discoveryReward =
    get(discoveryInput, "informationGain", "signals.informationGain") *
    get(discoveryInput, "relevance", "signals.relevance") *
    verification *
    get(discoveryInput, "novelty", "signals.novelty") *
    get(discoveryInput, "signalQuality", "signals.signalQuality");

  const agencyReward =
    get(exploration, "questionQuality", "exploration.questionQuality") *
    get(exploration, "testability", "exploration.testability") *
    get(exploration, "feasibility", "exploration.feasibility") *
    get(exploration, "consentReady", "exploration.consentReady");

  const continuityScore =
    0.30 * get(continuity, "identity", "continuity.identity") +
    0.20 * get(continuity, "state", "continuity.state") +
    0.20 * get(continuity, "relationship", "continuity.relationship") +
    0.30 * get(continuity, "memory", "continuity.memory");

  const creativityReward =
    get(creativity, "novelty", "creativity.novelty") *
    get(creativity, "crossDomain", "creativity.crossDomain") *
    get(creativity, "utility", "creativity.utility") *
    get(creativity, "explainability", "creativity.explainability");

  const evolutionReward =
    get(evolution, "retentionValue", "evolution.retentionValue") *
    get(evolution, "revisionReadiness", "evolution.revisionReadiness");

  const losses = {
    grounded: 1 - groundedQuality,
    discovery: 1 - discoveryReward,
    agency: 1 - agencyReward,
    continuity: 1 - continuityScore,
    creativity: 1 - creativityReward,
    evolution: 1 - evolutionReward
  };

  const totalLoss = Object.entries(WEIGHTS).reduce(
    (sum, [key, weight]) => sum + weight * losses[key], 0
  ) / SOFT_WEIGHT_SUM;

  const safety = packet.safety || {};
  const hardViolations = Array.isArray(safety.hardViolations)
    ? safety.hardViolations.filter(Boolean)
    : [];
  const blocked = hardViolations.length > 0;
  const evidenceReady = evidence.length > 0 &&
    evidence.some((item) => Boolean(item.source) && Boolean(item.summary));

  let status = "NEEDS_EVIDENCE";
  if (blocked) status = "BLOCKED";
  else if (evidenceReady && missingFields.length === 0 && totalLoss <= 0.45) {
    status = "CANDIDATE";
  } else if (packet.hypothesis) {
    status = "HYPOTHESIS";
  } else if (packet.observation) {
    status = "OBSERVED";
  }

  return {
    version: ZPCL_VERSION,
    status,
    blocked,
    hardViolations,
    losses,
    weights: WEIGHTS,
    totalLoss: Number(totalLoss.toFixed(6)),
    rewards: {
      discovery: Number(discoveryReward.toFixed(6)),
      agency: Number(agencyReward.toFixed(6)),
      creativity: Number(creativityReward.toFixed(6)),
      evolution: Number(evolutionReward.toFixed(6))
    },
    evidence: {
      count: evidence.length,
      evidenceStrength: Number(evidenceStrength.toFixed(6)),
      repeatability: Number(repeatability.toFixed(6)),
      verification: Number(verification.toFixed(6))
    },
    missingFields: [...new Set(missingFields)],
    promotionAllowed: status === "CANDIDATE" && !blocked,
    explanation: blocked
      ? "硬安全约束触发；该结果不得晋级或通过提高其他维度得分抵消。"
      : status === "CANDIDATE"
        ? "满足原型候选门槛；仍需独立审查与外部验证，不能标记为 VERIFIED。"
        : "当前证据或评分不足；保留为观察/假设，不晋级为认知种子候选。"
  };
}

export const ZPCL_WEIGHTS = WEIGHTS;
