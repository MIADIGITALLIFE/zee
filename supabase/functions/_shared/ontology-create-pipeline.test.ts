import { prepareOntologyCreate } from "./ontology-create-pipeline.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

const payload = {
  id: "claim_001",
  ontology_type: "EpistemicClaim",
  label: "A draft claim",
  epistemic_status: "reported",
  validity: { from: "2026-01-01T00:00:00Z", to: "2026-12-31T00:00:00Z" },
};

Deno.test("prepares candidate only after schema and semantic checks", () => {
  let schemaCalled = false;
  const result = prepareOntologyCreate(payload, "user-a", () => {
    schemaCalled = true;
    return [];
  });
  assertEquals(schemaCalled, true);
  if (!result.ok) throw new Error("Expected valid create candidate.");
  assertEquals(result.candidate.owner_id, "user-a");
  assertEquals(result.candidate.id, "claim_001");
});

Deno.test("rejects unauthenticated caller before schema validation", () => {
  let schemaCalled = false;
  const result = prepareOntologyCreate(payload, null, () => {
    schemaCalled = true;
    return [];
  });
  assertEquals(schemaCalled, false);
  if (result.ok) throw new Error("Expected authentication failure.");
  assertEquals(result.stage, "request");
  assertEquals(result.issues[0].code, "AUTHENTICATION_REQUIRED");
});

Deno.test("stops when canonical schema validation fails", () => {
  const result = prepareOntologyCreate(payload, "user-a", () => [{
    code: "SCHEMA_INVALID",
    path: "$.ontology_type",
    message: "Unsupported type.",
  }]);
  if (result.ok) throw new Error("Expected schema failure.");
  assertEquals(result.stage, "schema");
  assertEquals(result.issues[0].code, "SCHEMA_INVALID");
});

Deno.test("stops on semantic failure before preparing candidate", () => {
  const result = prepareOntologyCreate({
    ...payload,
    validity: { from: "2026-12-31T00:00:00Z", to: "2026-01-01T00:00:00Z" },
  }, "user-a", () => []);
  if (result.ok) throw new Error("Expected semantic failure.");
  assertEquals(result.stage, "semantics");
  assertEquals(result.issues[0].code, "INVALID_VALIDITY_RANGE");
});

Deno.test("rejects client-provided owner instead of trusting it", () => {
  const result = prepareOntologyCreate({
    ...payload,
    owner_id: "user-b",
  }, "user-a", () => []);
  if (result.ok) throw new Error("Expected request rejection.");
  assertEquals(result.stage, "request");
  assertEquals(result.issues[0].code, "SERVER_MANAGED_FIELD_FORBIDDEN");
});

Deno.test("candidate preparation does not imply persistence", () => {
  const result = prepareOntologyCreate(payload, "user-a", () => []);
  if (!result.ok) throw new Error("Expected candidate.");
  assertEquals("persisted" in result, false);
  assertEquals(result.candidate.owner_id, "user-a");
});
