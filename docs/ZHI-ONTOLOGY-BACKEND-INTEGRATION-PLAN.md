# ZHI Ontology Backend Integration Plan

**Status:** proposed contract; not implemented or deployed  
**Applies to:** ZHI Ontology Dictionary V1.0 and the offline draft emitted by `model.html`  
**Goal:** define the smallest safe server-side persistence boundary before any database migration or production write.

## 1. Current state and boundary

The current Studio is a browser-only prototype. It creates downloadable JSON drafts and an in-memory cognition experiment. The canonical draft shape is documented in `../schemas/zhi-ontology-draft-v1.schema.json`.

This document is a design proposal only. It does not assert that any table, API endpoint, migration, permission policy, or integration test described below currently exists. Do not deploy or run write operations based only on this plan.

The ontology draft is distinct from the existing AI chat flow documented in `../AI_BRAIN_INTEGRATION.md`. Ontology persistence should not silently invoke a model or alter agent state, balances, or world-state fields.

## 2. Recommended architecture

1. Browser submits a draft to a dedicated server-side endpoint (recommended: a Supabase Edge Function or a narrowly scoped authenticated API).
2. The endpoint verifies the caller's identity and role using the caller's authenticated session. Never trust a role, owner ID, or permission claim supplied only in the JSON body.
3. The endpoint validates the request against the canonical schema and applies semantic checks that JSON Schema cannot express.
4. The endpoint derives owner/audit metadata from the authenticated context, then writes the record and its relations in one transaction or an equivalent all-or-nothing database operation.
5. The endpoint returns the canonical stored record, server revision, and stable record ID. The browser distinguishes “saved” from “draft only”.
6. Reads are scoped to records the caller is authorized to access; admin-only cross-user operations require a separate policy.

Do not expose a service-role key in browser JavaScript, HTML, public GitHub files, or client-side configuration. If privileged database access is required, keep it inside a trusted server environment and explicitly enforce authorization before every operation.

## 3. Proposed logical data model

These are logical entities, not approved SQL migrations.

### Ontology records

- `id`: stable application identifier; unique within the agreed namespace.
- `owner_id`: authenticated owner or workspace, assigned by the server.
- `ontology_type`, `label`, `description`, `state`, `epistemic_status`: schema-defined content.
- `event_time`, `observed_at`, `validity_from`, `validity_to`: nullable event/observation/validity timestamps.
- `revision`: server-managed positive integer; client revision is an input hint, not authority.
- `schema_version`: required contract version.
- `verification_status`: server-managed; never promote to verified merely because a client submits that string.
- `created_at`, `updated_at`, `created_by`, `updated_by`: server-managed audit fields.

### Relations

Use a separate relation entity/table if the system needs multiple relations, queryable graph edges, or independent revision history. Suggested fields: relation ID, owner/workspace, source record ID, target record ID, relation type, epistemic status, validity interval, revision, and audit timestamps.

- Both endpoints must exist and be readable/writable by the same authorized owner/workspace.
- Reject self-relations unless a future domain rule explicitly permits them.
- Use foreign keys and database constraints where possible.
- Do not use a client-generated `rel_<record-id>` as a universal relation key if multiple edges per record are supported. Define whether duplicate edges are allowed and the exact uniqueness key first.
- For an initial release, the product may deliberately support only one relation per draft; the server must enforce that limit if it is a business rule.

### Evidence and provenance

Treat `source_refs` as references supplied by a client, not proof that a source exists or supports a claim. If evidence becomes independently reviewable, store source identity, source type, reviewer, review time, review outcome, and provenance links separately. Only a trusted review workflow may change a claim to an independently verified state.

## 4. Server validation rules

Reject the request before writing if any of these fail:

1. Request body is valid JSON, within a documented size limit, and matches the supported `schema_version`.
2. Every enum and required field matches the canonical schema; unknown properties are rejected unless a versioned extension policy is adopted.
3. Stable IDs follow the documented format and the authenticated caller is authorized to create or update the target record.
4. Record ID uniqueness and relation uniqueness are enforced by the database, not only by a preflight query.
5. Relation endpoints exist, are in the allowed scope, and satisfy the chosen self-edge/duplicate-edge policy.
6. Time fields are valid timestamps; `validity.to` must not precede `validity.from`.
7. Client-supplied owner, audit, verification, lifecycle, access-policy, and retention-policy fields are ignored or rejected as authoritative values. Server policy controls these values.
8. Updating an existing record requires an expected server revision (optimistic concurrency). A stale revision returns a conflict instead of silently overwriting newer data.
9. All related writes succeed or none do. Partial record-without-relations states must not be possible.

JSON Schema validates shape; it does not replace authorization, provenance review, uniqueness constraints, transactionality, or semantic validation.

## 5. API contract proposal

Exact route names can be selected during implementation. Keep read/write responsibilities explicit.

### Create draft

- Method: `POST`
- Request: ontology draft plus an optional idempotency key.
- Success: `201 Created`, canonical stored record, server revision, and a stable record URI/ID.
- Repeated request with the same idempotency key and same payload: return the original result; reuse with a different payload: `409 Conflict`.

### Read record

- Method: `GET`
- Success: `200 OK` only when the caller has permission.
- Unauthorized or inaccessible records should not leak existence details; use a consistent `403` or `404` policy.

### Update record

- Method: `PUT` or `PATCH`
- Requires expected server revision / ETag.
- Stale revision: `409 Conflict` (or `412 Precondition Failed` if using HTTP conditional requests).
- Return the new server revision and updated canonical representation.

### Error envelope

Use a stable machine-readable shape, for example:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The ontology draft did not pass validation.",
    "details": []
  },
  "request_id": "server-generated-correlation-id"
}
```

Never include secret values, service-role credentials, raw database credentials, or sensitive stack traces in client-facing errors.

## 6. Access, retention, and audit requirements

Before persistence, decide and document:

- Whether records are private to one user, shared in a workspace, or globally readable.
- Which role can create, read, update, archive, and delete records.
- Whether evidence references may contain personal or confidential data.
- Retention and deletion behavior, including relation cleanup and audit-record retention.
- Whether soft deletion is required and how deleted records appear in graph queries.
- Whether audit history is append-only and which changes must be recorded.
- How backups and export files are protected.

Enable database row-level security where applicable and test it using separate user identities. RLS is not a substitute for endpoint-level authorization when a privileged server key bypasses RLS.

## 7. Integration test matrix

Run against a dedicated non-production project with disposable fixtures. Do not use production data for these tests.

| Area | Scenario | Expected result |
|---|---|---|
| Authentication | No session | Request rejected; no row written |
| Authorization | User A reads/updates User B's private record | Rejected without leaking private content |
| Schema | Unknown ontology type or missing required field | Validation error; no write |
| Versioning | Unsupported schema version | Explicit version error; no write |
| ID uniqueness | Two creates with same stable ID | One succeeds; second gets deterministic conflict |
| Relations | Missing endpoint or out-of-scope endpoint | Rejected; no partial write |
| Relations | Self-edge or duplicate edge | Follows the explicitly chosen policy |
| Time | Validity end before start | Rejected |
| Provenance | Client sends `verified` without review evidence | Not marked independently verified |
| Concurrency | Two updates with same expected revision | One succeeds; stale update conflicts |
| Atomicity | Relation insert fails after record validation | No partial record/edge state remains |
| Idempotency | Same key and same payload retried | One logical create |
| Idempotency | Same key reused with different payload | Conflict |
| RLS | Direct client access outside owner scope | Denied |
| Secrets | Browser bundle and public repository scan | No privileged secret present |
| Regression | Existing chat function still behaves as before | No unintended changes to chat, agent mind, or memory tables |

## 8. Rollout gates

Do not begin persistent writes until all are true:

- [ ] Product owner confirms private/shared ownership model and relation cardinality.
- [ ] Schema and server semantic rules are versioned and reviewed.
- [ ] Migration is reviewed and tested on a disposable project.
- [ ] Authentication, authorization, and RLS tests pass for at least two distinct users.
- [ ] Transaction/atomicity and optimistic-concurrency tests pass.
- [ ] Secret handling and public-repository scans pass.
- [ ] Backup, export, retention, and deletion rules are documented.
- [ ] Non-production integration tests pass and rollback procedure is written.
- [ ] UI clearly distinguishes local draft, submitted, saved, rejected, and conflict states.

## 9. Implementation order

1. Confirm ownership and sharing policy.
2. Implement server-side schema/semantic validation as a pure testable module.
3. Add migration and constraints in a non-production environment.
4. Implement authenticated create/read/update endpoints with server-managed audit fields.
5. Add integration tests from the matrix above.
6. Add UI persistence only after endpoint tests pass.
7. Review and approve before any production deployment.

**Current verified state:** the offline Studio's static and Chromium tests pass. No ontology persistence endpoint or database migration is claimed by this plan.
