import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateOntologyDraftSemantics } from "./ontology-semantic-validation.ts";

const base = {
  id: "claim_001",
  ontology_type: "EpistemicClaim",
  epistemic_status: "reported",
  source_refs: [],
  evidence: [],
  validity: { from: null, to: null },
  relations: [],
};

Deno.test("accepts a draft with no semantic conflicts", () => {
  assertEquals(validateOntologyDraftSemantics(base), []);
});

Deno.test("rejects validity end before start", () => {
  const issues = validateOntologyDraftSemantics({
    ...base,
    validity: {
      from: "2026-10-28T10:00:00Z",
      to: "2026-10-27T10:00:00Z",
    },
  });
  assertEquals(issues.map((issue) => issue.code), ["INVALID_VALIDITY_RANGE"]);
});

Deno.test("rejects self-relation", () => {
  const issues = validateOntologyDraftSemantics({
    ...base,
    relations: [{
      source_entity: "entity_a",
      target_entity: "entity_a",
    }],
  });
  assertEquals(issues.map((issue) => issue.code), ["SELF_RELATION_NOT_ALLOWED"]);
});

Deno.test("Relation ontology record requires exactly one edge", () => {
  const issues = validateOntologyDraftSemantics({
    ...base,
    ontology_type: "Relation",
    relations: [],
  });
  assertEquals(issues.map((issue) => issue.code), ["RELATION_RECORD_REQUIRES_EDGE"]);
});

Deno.test("verified status requires a source reference but does not certify truth", () => {
  const missing = validateOntologyDraftSemantics({
    ...base,
    epistemic_status: "verified",
  });
  assertEquals(missing.map((issue) => issue.code), ["VERIFIED_REQUIRES_SOURCE_REFERENCE"]);

  const withSource = validateOntologyDraftSemantics({
    ...base,
    epistemic_status: "verified",
    source_refs: ["source:review-17"],
  });
  assertEquals(withSource, []);
});

Deno.test("rejects non-object input", () => {
  const issues = validateOntologyDraftSemantics(null as never);
  assertEquals(issues.map((issue) => issue.code), ["RECORD_NOT_OBJECT"]);
});
