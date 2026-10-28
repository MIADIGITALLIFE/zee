/**
 * Server-agnostic semantic checks for ZHI ontology draft records.
 *
 * This module does not validate JSON Schema, authenticate a caller, verify
 * evidence, authorize access, or persist data. Call it only after schema
 * validation and authentication in a future server endpoint.
 */
export type OntologyDraftIssue = {
  code: string;
  path: string;
  message: string;
};

type OntologyDraft = {
  id?: unknown;
  ontology_type?: unknown;
  epistemic_status?: unknown;
  source_refs?: unknown;
  evidence?: unknown;
  validity?: unknown;
  relations?: unknown;
};

function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateOntologyDraftSemantics(
  draft: OntologyDraft,
): OntologyDraftIssue[] {
  const issues: OntologyDraftIssue[] = [];

  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return [{
      code: "RECORD_NOT_OBJECT",
      path: "$",
      message: "Ontology draft must be an object.",
    }];
  }

  const validity = draft.validity as { from?: unknown; to?: unknown } | undefined;
  if (validity && validity.from != null && validity.to != null) {
    const from = parseDate(validity.from);
    const to = parseDate(validity.to);
    if (from !== null && to !== null && to < from) {
      issues.push({
        code: "INVALID_VALIDITY_RANGE",
        path: "$.validity.to",
        message: "Validity end must not precede validity start.",
      });
    }
  }

  const relations = Array.isArray(draft.relations) ? draft.relations : [];
  relations.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const relation = value as { source_entity?: unknown; target_entity?: unknown };
    if (
      typeof relation.source_entity === "string" &&
      typeof relation.target_entity === "string" &&
      relation.source_entity === relation.target_entity
    ) {
      issues.push({
        code: "SELF_RELATION_NOT_ALLOWED",
        path: `$.relations[${index}]`,
        message: "A relation cannot point from an entity to itself.",
      });
    }
  });

  if (draft.ontology_type === "Relation") {
    if (relations.length !== 1) {
      issues.push({
        code: "RELATION_RECORD_REQUIRES_EDGE",
        path: "$.relations",
        message: "A Relation ontology record must contain exactly one relation edge in V1.0.",
      });
    }
  }

  if (draft.epistemic_status === "verified") {
    const sourceRefs = Array.isArray(draft.source_refs) ? draft.source_refs : [];
    const evidence = Array.isArray(draft.evidence) ? draft.evidence : [];
    const hasSourceRef = sourceRefs.some(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
    const hasEvidenceRef = evidence.some((item) =>
      !!item &&
      typeof item === "object" &&
      typeof (item as { source_ref?: unknown }).source_ref === "string" &&
      ((item as { source_ref: string }).source_ref).trim().length > 0
    );

    if (!hasSourceRef && !hasEvidenceRef) {
      issues.push({
        code: "VERIFIED_REQUIRES_SOURCE_REFERENCE",
        path: "$.epistemic_status",
        message: "Verified status requires a source reference; this does not independently verify the claim.",
      });
    }
  }

  return issues;
}
