/**
 * NPRM -> ZPCL event adapter.
 * Maps an explicit NPRM observation record into the TECH-001 event envelope.
 * It does not generate observations, infer meaning, score features, or execute exploration.
 */
const MODES = new Set(["direct","poetic","mirror","reverse","associative","pause"]);
const PATHS = new Set(["semantic","memory","poetic","logic"]);
const isoWithZone = (value) =>
  typeof value === "string" &&
  /(Z|[+-]\d{2}:?\d{2})$/.test(value) &&
  !Number.isNaN(Date.parse(value));

export function adaptNPRMToZPCL(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok:false, errors:["input must be an object"] };
  }
  const { observation, agent_id, event_id, timestamp, source, feedback, features, idempotency_key } = input;
  if (typeof observation !== "string" || !observation.trim()) errors.push("observation is required");
  if (!agent_id) errors.push("agent_id is required");
  if (!event_id) errors.push("event_id is required");
  if (!isoWithZone(timestamp)) errors.push("timestamp must be ISO 8601 with timezone");
  if (!source || !source.type || !source.id) errors.push("source.type and source.id are required");
  if (!idempotency_key) errors.push("idempotency_key is required");
  if (!feedback || !MODES.has(feedback.mode)) errors.push("feedback.mode must be a supported NPRM mode");
  if (!feedback || !Array.isArray(feedback.paths) || feedback.paths.some(p=>!PATHS.has(p))) {
    errors.push("feedback.paths must contain supported NPRM paths");
  }
  if (errors.length) return { ok:false, errors };

  const event = {
    schema_version:"1.0",
    event_id,
    agent_id,
    timestamp,
    event_type:"nprm.observation",
    source,
    payload:{
      observation:observation.trim(),
      hypothesis:typeof input.hypothesis==="string" ? input.hypothesis : null
    },
    provenance:{
      origin:"nprm",
      observation_id:input.observation_id || event_id,
      evidence_ids:Array.isArray(input.evidence_ids) ? input.evidence_ids : []
    },
    correlation_id:input.correlation_id || event_id,
    idempotency_key,
    features:features && typeof features==="object" ? features : {},
    extensions:{
      nprm:{
        mechanism_version:input.mechanism_version || "1.0",
        feedback_mode:feedback.mode,
        paths:[...feedback.paths],
        observation_cycle:input.observation_cycle || null,
        cadence:input.cadence || null,
        novelty_signal:feedback.novelty_signal ?? null,
        user_confirmation:feedback.user_confirmation ?? false
      }
    }
  };
  return { ok:true, event };
}
