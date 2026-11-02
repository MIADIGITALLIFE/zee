export function parsePersonaConfig(value: unknown): { config?: Record<string, unknown>; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "persona_config must be an object" };
  const input = value as Record<string, unknown>;
  if (input.product !== "ZEE" || input.model !== "digital-persona-profile" || input.schema_version !== "1.0") return { error: "unsupported persona config format" };
  if (typeof input.updated_at !== "string" || !Number.isFinite(Date.parse(input.updated_at))) return { error: "invalid updated_at" };
  const parameters = input.parameters;
  const weights = input.brain_weights;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return { error: "parameters must be an object" };
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) return { error: "brain_weights must be an object" };
  const p = parameters as Record<string, unknown>;
  const w = weights as Record<string, unknown>;
  const keys = ["gender", "age", "maturity", "empathy", "creation", "stability", "innovation", "metacognition"];
  const brain = ["empathy", "creation", "stability", "innovation", "metacognition"];
  if (Object.keys(p).length !== keys.length || keys.some(k => !(k in p))) return { error: "parameters has missing or unknown fields" };
  if (Object.keys(w).length !== brain.length || brain.some(k => !(k in w))) return { error: "brain_weights has missing or unknown fields" };
  for (const k of keys) if (typeof p[k] !== "number" || !Number.isInteger(p[k]) || Number(p[k]) < 0 || Number(p[k]) > 100) return { error: "invalid parameter: " + k };
  for (const k of brain) if (typeof w[k] !== "number" || w[k] !== p[k]) return { error: "brain weight mismatch: " + k };
  const total = brain.reduce((sum, k) => sum + Number(w[k]), 0);
  if (total !== 100 || input.brain_weights_total !== 100) return { error: "brain weights must total 100" };
  return { config: { schema_version: "1.0", product: "ZEE", model: "digital-persona-profile", updated_at: input.updated_at, parameters: p, brain_weights: w, brain_weights_total: total } };
}
