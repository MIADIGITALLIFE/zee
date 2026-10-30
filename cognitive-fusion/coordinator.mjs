/**
 * Provider-neutral cognitive orchestration.
 * Deterministic and side-effect free: no network, database, model or storage access.
 */
export const DOMAINS = ["Self", "Other", "World", "Relation", "Change", "Feedback"];
export const MAX_RECORDS = 32;
export const MAX_BYTES = 64 * 1024;
const EPISTEMIC = new Set(["observed", "reported", "verified", "inferred", "hypothesis", "unknown", "conflicted"]);

export function coordinateCognition(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("input must be an object");
  const encoded = JSON.stringify(input);
  if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES) throw new RangeError("cognitive context exceeds size limit");
  const records = input.ontology_records ?? [];
  if (!Array.isArray(records)) throw new TypeError("ontology_records must be an array");
  if (records.length > MAX_RECORDS) throw new RangeError("too many ontology records");

  const normalized = records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("ontology_records[" + index + "] must be an object");
    }
    const status = EPISTEMIC.has(record.epistemic_status) ? record.epistemic_status : "unknown";
    return {
      id: String(record.id ?? "unidentified-" + (index + 1)),
      ontology_type: String(record.type ?? record.ontology_type ?? "Unknown"),
      label: String(record.label ?? "Unlabelled record"),
      description: String(record.description ?? ""),
      epistemic_status: status,
      source_refs: Array.isArray(record.source_refs) ? record.source_refs.map(String) :
        (Array.isArray(record.evidence) ? record.evidence.map(String) : []),
      relations: Array.isArray(record.relations) ? record.relations : []
    };
  });

  const conflicts = normalized.filter(r => r.epistemic_status === "conflicted");
  const unknowns = normalized.filter(r => r.epistemic_status === "unknown");
  const hypotheses = normalized.filter(r => ["hypothesis", "inferred"].includes(r.epistemic_status));
  const unsupported = normalized.filter(r => r.source_refs.length === 0 &&
    ["observed", "reported", "verified"].includes(r.epistemic_status));
  const typeForDomain = { Self: "Self", Other: "Other", World: "WorldObject", Relation: "Relation", Change: "Change", Feedback: "Feedback" };
  const domainCoverage = Object.fromEntries(DOMAINS.map(domain => [
    domain, normalized.some(r => r.ontology_type === domain || r.ontology_type === typeForDomain[domain])
  ]));

  return {
    schema_version: "ZHI-Cognitive-Fusion-V1.0",
    mode: "proposal_only",
    agent_id: String(input.agent_id ?? ""),
    request_id: String(input.request_id ?? ""),
    input_summary: { message_present: typeof input.message === "string" && input.message.trim().length > 0, ontology_record_count: normalized.length },
    domain_coverage: domainCoverage,
    epistemic_review: {
      conflicts: conflicts.map(({ id, label, source_refs }) => ({ id, label, source_refs })),
      unknowns: unknowns.map(({ id, label }) => ({ id, label })),
      hypotheses: hypotheses.map(({ id, label, epistemic_status }) => ({ id, label, epistemic_status })),
      claims_missing_sources: unsupported.map(({ id, label }) => ({ id, label }))
    },
    reasoning_plan: [
      { step: 1, operation: "interpret_input", purpose: "Identify the request, entities and constraints." },
      { step: 2, operation: "retrieve_context", purpose: "Associate relevant memories and ontology records with source references." },
      { step: 3, operation: "cross_examine", purpose: "Compare alternative explanations and inspect contradictions." },
      { step: 4, operation: "evaluate", purpose: "Assess goals, values, uncertainty and applicable permissions." },
      { step: 5, operation: "respond_or_propose", purpose: "Prepare a response or a reviewable action proposal." },
      { step: 6, operation: "feedback_candidate", purpose: "Identify what outcome evidence would improve a future revision." }
    ],
    memory_candidates: [],
    action_proposals: [],
    required_review: true,
    persistence: "not_performed",
    model_reasoning_performed: false
  };
}
