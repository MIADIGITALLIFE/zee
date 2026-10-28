/**
 * Pure guard for a future ontology create endpoint; not authentication or persistence.
 */
export type OntologyRequestIssue = {
  code: string;
  path: string;
  message: string;
};

export const DEFAULT_MAX_ONTOLOGY_REQUEST_BYTES = 64 * 1024;

const SERVER_MANAGED_FIELDS = new Set([
  "owner_id",
  "owner_subject_id",
  "created_by",
  "updated_by",
  "server_created_at",
  "server_updated_at",
  "verified_by",
  "verification_result",
  "share_grants",
  "is_admin",
]);

/** authenticatedSubjectId must be supplied by trusted server-side authentication. */
export function validateOntologyCreateRequest(
  payload: unknown,
  authenticatedSubjectId: unknown,
  maxBytes = DEFAULT_MAX_ONTOLOGY_REQUEST_BYTES,
): OntologyRequestIssue[] {
  const issues: OntologyRequestIssue[] = [];
  if (
    typeof authenticatedSubjectId !== "string" ||
    !authenticatedSubjectId.trim()
  ) {
    issues.push({
      code: "AUTHENTICATION_REQUIRED",
      path: "$",
      message: "A trusted authenticated subject is required before create.",
    });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    issues.push({
      code: "REQUEST_NOT_OBJECT",
      path: "$",
      message: "Ontology create payload must be a JSON object.",
    });
    return issues;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    issues.push({
      code: "REQUEST_NOT_SERIALIZABLE",
      path: "$",
      message: "Ontology create payload must be JSON-serializable.",
    });
    return issues;
  }

  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || bytes > maxBytes) {
    issues.push({
      code: "REQUEST_TOO_LARGE",
      path: "$",
      message:
        `Serialized payload exceeds the configured ${maxBytes}-byte limit.`,
    });
  }

  for (const field of SERVER_MANAGED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      issues.push({
        code: "SERVER_MANAGED_FIELD_FORBIDDEN",
        path: `$.${field}`,
        message:
          `Field "${field}" must be assigned by the server, not the client.`,
      });
    }
  }

  return issues;
}
