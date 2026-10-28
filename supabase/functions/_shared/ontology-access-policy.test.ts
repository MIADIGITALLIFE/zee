import { authorizeOntologyOperation } from "./ontology-access-policy.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("denies unauthenticated create and read", () => {
  assertEquals(
    authorizeOntologyOperation(
      { authenticatedSubjectId: null, recordOwnerId: null },
      "create",
    ).allowed,
    false,
  );
  assertEquals(
    authorizeOntologyOperation(
      { authenticatedSubjectId: "user-a", recordOwnerId: "user-a" },
      "read",
    ).allowed,
    true,
  );
  assertEquals(
    authorizeOntologyOperation(
      { authenticatedSubjectId: null, recordOwnerId: "user-a" },
      "read",
    ).reason,
    "AUTHENTICATION_REQUIRED",
  );
});

Deno.test("authenticated caller may create; server must assign ownership", () => {
  assertEquals(
    authorizeOntologyOperation(
      { authenticatedSubjectId: "user-a", recordOwnerId: null },
      "create",
    ),
    { allowed: true, reason: "OWNER_ALLOWED" },
  );
});

Deno.test("owner can read, update, delete and manage sharing", () => {
  for (const operation of ["read", "update", "delete", "manage_sharing"] as const) {
    assertEquals(
      authorizeOntologyOperation(
        { authenticatedSubjectId: "user-a", recordOwnerId: "user-a" },
        operation,
      ).allowed,
      true,
    );
  }
});

Deno.test("unrelated user is denied without an active grant", () => {
  for (const operation of ["read", "update", "delete", "manage_sharing"] as const) {
    assertEquals(
      authorizeOntologyOperation(
        {
          authenticatedSubjectId: "user-b",
          recordOwnerId: "user-a",
          grants: [{ subjectId: "user-b", permission: "edit", active: false }],
        },
        operation,
      ).allowed,
      false,
    );
  }
});

Deno.test("read grant permits read only", () => {
  const context = {
    authenticatedSubjectId: "user-b",
    recordOwnerId: "user-a",
    grants: [{ subjectId: "user-b", permission: "read" as const, active: true }],
  };
  assertEquals(authorizeOntologyOperation(context, "read").allowed, true);
  assertEquals(authorizeOntologyOperation(context, "update").allowed, false);
  assertEquals(authorizeOntologyOperation(context, "delete").allowed, false);
});

Deno.test("edit grant permits read and update but not delete or sharing changes", () => {
  const context = {
    authenticatedSubjectId: "user-b",
    recordOwnerId: "user-a",
    grants: [{ subjectId: "user-b", permission: "edit" as const, active: true }],
  };
  assertEquals(authorizeOntologyOperation(context, "read").allowed, true);
  assertEquals(authorizeOntologyOperation(context, "update").allowed, true);
  assertEquals(authorizeOntologyOperation(context, "delete").allowed, false);
  assertEquals(authorizeOntologyOperation(context, "manage_sharing").allowed, false);
});

Deno.test("ownership transfer is owner-only", () => {
  assertEquals(
    authorizeOntologyOperation(
      { authenticatedSubjectId: "user-a", recordOwnerId: "user-a" },
      "transfer_ownership",
    ).allowed,
    true,
  );
  assertEquals(
    authorizeOntologyOperation(
      {
        authenticatedSubjectId: "user-b",
        recordOwnerId: "user-a",
        grants: [{ subjectId: "user-b", permission: "edit", active: true }],
      },
      "transfer_ownership",
    ).allowed,
    false,
  );
});

Deno.test("no implicit admin bypass exists", () => {
  assertEquals(
    authorizeOntologyOperation(
      {
        authenticatedSubjectId: "admin",
        recordOwnerId: "user-a",
      },
      "read",
    ).allowed,
    false,
  );
});

Deno.test("empty or missing owner does not grant access to an existing record", () => {
  assertEquals(
    authorizeOntologyOperation(
      { authenticatedSubjectId: "user-a", recordOwnerId: null },
      "read",
    ).allowed,
    false,
  );
});
