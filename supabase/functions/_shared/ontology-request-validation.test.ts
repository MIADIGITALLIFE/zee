import { validateOntologyCreateRequest } from "./ontology-request-validation.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

const payload = {
  id: "claim_001",
  ontology_type: "EpistemicClaim",
  label: "A draft claim",
  epistemic_status: "reported",
};

Deno.test("accepts ordinary payload with trusted identity", () => {
  assertEquals(validateOntologyCreateRequest(payload, "user-a"), []);
});

Deno.test("rejects missing trusted identity", () => {
  assertEquals(
    validateOntologyCreateRequest(payload, " ").map((x) => x.code),
    ["AUTHENTICATION_REQUIRED"],
  );
});

Deno.test("rejects non-object payload", () => {
  assertEquals(
    validateOntologyCreateRequest("nope", "user-a").map((x) => x.code),
    ["REQUEST_NOT_OBJECT"],
  );
});

Deno.test("rejects client-supplied server-managed fields", () => {
  const issues = validateOntologyCreateRequest({
    ...payload,
    owner_id: "user-b",
    created_by: "user-b",
    share_grants: [],
  }, "user-a");
  assertEquals(
    issues.map((x) => x.path),
    ["$.owner_id", "$.created_by", "$.share_grants"],
  );
  assertEquals(
    issues.map((x) => x.code),
    [
      "SERVER_MANAGED_FIELD_FORBIDDEN",
      "SERVER_MANAGED_FIELD_FORBIDDEN",
      "SERVER_MANAGED_FIELD_FORBIDDEN",
    ],
  );
});

Deno.test("enforces serialized UTF-8 byte limit", () => {
  assertEquals(
    validateOntologyCreateRequest({ text: "你好" }, "user-a", 5).map((x) =>
      x.code
    ),
    ["REQUEST_TOO_LARGE"],
  );
});

Deno.test("rejects invalid size configuration", () => {
  assertEquals(
    validateOntologyCreateRequest(payload, "user-a", 0).map((x) => x.code),
    ["REQUEST_TOO_LARGE"],
  );
});
