import { parsePersonaConfig } from "./persona-config-context.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const valid = {
  schema_version: "1.0",
  product: "ZEE",
  model: "digital-persona-profile",
  updated_at: "2026-11-02T10:00:00.000Z",
  parameters: { gender: 30, age: 30, maturity: 45, empathy: 45, creation: 25, stability: 15, innovation: 10, metacognition: 5 },
  brain_weights: { empathy: 45, creation: 25, stability: 15, innovation: 10, metacognition: 5 },
  brain_weights_total: 100,
};

Deno.test("accepts exported ZEE persona configuration", () => {
  const result = parsePersonaConfig(valid);
  assert(!result.error && !!result.config, "valid config should pass");
});

Deno.test("rejects unsupported config identity", () => {
  const result = parsePersonaConfig({ ...valid, model: "other" });
  assert(!!result.error, "unsupported model should fail");
});

Deno.test("rejects out-of-range parameter", () => {
  const result = parsePersonaConfig({ ...valid, parameters: { ...valid.parameters, empathy: 101 } });
  assert(!!result.error, "out-of-range parameter should fail");
});

Deno.test("rejects inconsistent brain weights", () => {
  const result = parsePersonaConfig({ ...valid, brain_weights: { ...valid.brain_weights, empathy: 40 } });
  assert(!!result.error, "mismatched weights should fail");
});

Deno.test("rejects weights that do not total 100", () => {
  const result = parsePersonaConfig({ ...valid, brain_weights_total: 99 });
  assert(!!result.error, "incorrect total should fail");
});
