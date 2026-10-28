import { authorizeOntologyOperation } from "./ontology-access-policy.ts";
import { validateOntologyCreateRequest } from "./ontology-request-validation.ts";
import { validateOntologyDraftSemantics } from "./ontology-semantic-validation.ts";

export type OntologyCreatePreparation =
  | { ok: true; candidate: Record<string, unknown> }
  | {
    ok: false;
    stage: "request" | "schema" | "semantics" | "authorization";
    issues: Array<{ code: string; path: string; message: string }>;
  };

export type SchemaIssue = { code: string; path: string; message: string };

/**
 * Validates and prepares a create candidate. It deliberately does not persist.
 * The caller must obtain authenticatedSubjectId from trusted server auth and
 * provide a real canonical-schema validator; this function does not authenticate.
 */
export function prepareOntologyCreate(
  payload: unknown,
  authenticatedSubjectId: string | null,
  validateSchema: (payload: unknown) => SchemaIssue[],
): OntologyCreatePreparation {
  const requestIssues = validateOntologyCreateRequest(payload, authenticatedSubjectId);
  if (requestIssues.length) {
    return { ok: false, stage: "request", issues: requestIssues };
  }

  const schemaIssues = validateSchema(payload);
  if (schemaIssues.length) {
    return { ok: false, stage: "schema", issues: schemaIssues };
  }

  const semanticIssues = validateOntologyDraftSemantics(
    payload as Record<string, unknown>,
  );
  if (semanticIssues.length) {
    return { ok: false, stage: "semantics", issues: semanticIssues };
  }

  const access = authorizeOntologyOperation({
    authenticatedSubjectId,
    recordOwnerId: null,
  }, "create");
  if (!access.allowed) {
    return {
      ok: false,
      stage: "authorization",
      issues: [{
        code: access.reason,
        path: "$",
        message: "The authenticated caller is not allowed to create this record.",
      }],
    };
  }

  // Ownership is derived here from the trusted server-auth context, never body data.
  return {
    ok: true,
    candidate: {
      ...(payload as Record<string, unknown>),
      owner_id: authenticatedSubjectId,
    },
  };
}
