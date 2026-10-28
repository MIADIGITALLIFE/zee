import {
  MAX_ONTOLOGY_RECORDS,
  validateRuntimeOntologyRecords,
} from "./ontology-runtime-context.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const validRecord = {
  id: "claim_001",
  ontology_type: "EpistemicClaim",
  label: "Claim",
  description: "A test claim",
  state: "active",
  epistemic_status: "reported",
  evidence: [],
  source_refs: [],
  event_time: null,
  observed_at: null,
  recorded_at: "2026-10-28T10:00:00.000Z",
  validity: { from: null, to: null },
  revision: 1,
  access_policy: "draft-local-only",
  retention_policy: "not-persisted",
  relations: [],
  lifecycle: {
    transition: "CREATE",
    status: "candidate",
    requires_validation: true,
  },
  verification_status: "not-validated",
  schema_version: "ZHI-Ontology-Dictionary-V1.0",
};

const schemaValidator = (value: unknown) =>
  !!value && typeof value === "object" &&
  (value as Record<string, unknown>).schema_version ===
    "ZHI-Ontology-Dictionary-V1.0";

Deno.test("accepts one schema-valid ontology draft", () => {
  const result = validateRuntimeOntologyRecords(
    { ontology_record: validRecord },
    schemaValidator,
  );
  assert(!result.error, "expected valid record");
  assert(result.records.length === 1, "expected one record");
});

Deno.test("rejects schema-invalid ontology records", () => {
  const result = validateRuntimeOntologyRecords(
    { ontology_records: [{ id: "bad" }] },
    schemaValidator,
  );
  assert(!!result.error, "expected schema validation error");
  assert(
    result.records.length === 0,
    "invalid records must not be passed to runtime",
  );
});

Deno.test("rejects semantic conflicts before runtime use", () => {
  const result = validateRuntimeOntologyRecords(
    {
      ontology_records: [{
        ...validRecord,
        epistemic_status: "verified",
        source_refs: [],
        evidence: [],
      }],
    },
    schemaValidator,
  );
  assert(
    result.error?.includes("VERIFIED_REQUIRES_SOURCE_REFERENCE"),
    "expected provenance guard",
  );
});

Deno.test("rejects too many records", () => {
  const result = validateRuntimeOntologyRecords(
    {
      ontology_records: Array.from(
        { length: MAX_ONTOLOGY_RECORDS + 1 },
        () => validRecord,
      ),
    },
    schemaValidator,
  );
  assert(!!result.error, "expected record count limit");
});

Deno.test("rejects non-array ontology_records", () => {
  const result = validateRuntimeOntologyRecords(
    { ontology_records: validRecord },
    schemaValidator,
  );
  assert(!!result.error, "expected array type guard");
});

Deno.test("no ontology context is a valid empty context", () => {
  const result = validateRuntimeOntologyRecords({}, schemaValidator);
  assert(
    !result.error && result.records.length === 0,
    "expected empty context",
  );
});
