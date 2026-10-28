/**
 * Pure, fail-closed authorization policy for future ontology persistence.
 *
 * This module is not wired to an endpoint or database. Callers must supply
 * identity and grants obtained from trusted server-side authentication/storage,
 * never from an untrusted request body. It does not authenticate or persist.
 */
export type OntologyOperation =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "manage_sharing"
  | "transfer_ownership";

export type OntologyShareGrant = {
  subjectId: string;
  permission: "read" | "edit";
  active: boolean;
};

export type OntologyAccessContext = {
  authenticatedSubjectId: string | null;
  recordOwnerId: string | null;
  grants?: OntologyShareGrant[];
};

export type OntologyAccessDecision = {
  allowed: boolean;
  reason:
    | "AUTHENTICATION_REQUIRED"
    | "OWNER_ALLOWED"
    | "READ_GRANT_ALLOWED"
    | "EDIT_GRANT_ALLOWED"
    | "OWNER_ONLY_OPERATION"
    | "ACCESS_DENIED";
};

/**
 * Default-deny policy:
 * - creation requires an authenticated caller (ownership is assigned by server);
 * - owners can read/update/delete and manage sharing;
 * - explicit active read grants allow read only;
 * - explicit active edit grants allow read/update;
 * - ownership transfer remains a separate owner-only audited flow;
 * - there is no implicit administrator bypass.
 */
export function authorizeOntologyOperation(
  context: OntologyAccessContext,
  operation: OntologyOperation,
): OntologyAccessDecision {
  const subject = context.authenticatedSubjectId?.trim();
  if (!subject) {
    return { allowed: false, reason: "AUTHENTICATION_REQUIRED" };
  }

  if (operation === "create") {
    return { allowed: true, reason: "OWNER_ALLOWED" };
  }

  const ownerId = context.recordOwnerId?.trim();
  if (ownerId && subject === ownerId) {
    return operation === "transfer_ownership"
      ? { allowed: true, reason: "OWNER_ONLY_OPERATION" }
      : { allowed: true, reason: "OWNER_ALLOWED" };
  }

  if (operation === "transfer_ownership" || operation === "manage_sharing") {
    return { allowed: false, reason: "OWNER_ONLY_OPERATION" };
  }

  const grant = (context.grants ?? []).find(
    (candidate) => candidate.active && candidate.subjectId === subject,
  );
  if (
    grant?.permission === "edit" &&
    (operation === "read" || operation === "update")
  ) {
    return {
      allowed: true,
      reason: operation === "read"
        ? "READ_GRANT_ALLOWED"
        : "EDIT_GRANT_ALLOWED",
    };
  }
  if (grant?.permission === "read" && operation === "read") {
    return { allowed: true, reason: "READ_GRANT_ALLOWED" };
  }

  return { allowed: false, reason: "ACCESS_DENIED" };
}
