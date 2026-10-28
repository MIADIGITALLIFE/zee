# ZHI Ontology Ownership, Sharing, and Access Policy

**Status:** proposed product/security policy; not implemented by an API, database policy, or migration  
**Scope:** ZHI Ontology Dictionary V1.0 records, relation edges, evidence references, revisions, and future cognition-loop records  
**Decision gate:** confirm this policy before creating persistent ontology tables or enabling production writes.

## 1. Recommended default

**Private-by-default, explicit sharing, least privilege.**

1. A record belongs to the authenticated user who creates it unless it is explicitly created inside an authorized workspace.
2. A newly created record is private to its owner by default. The browser must not be able to set or override its owner.
3. A record is not public merely because it appears in a public GitHub repository, a front-end page, or an export file.
4. Sharing is an explicit action. The server must record who shared the record, with whom or which workspace, the granted permission, and when the grant was created or revoked.
5. A relation may be created only when the caller is authorized to access both endpoint records and the selected sharing scope permits the relation.
6. Administrative access is a separate, narrowly scoped permission; it must not silently make every record readable to every administrator-facing browser session.

This is a recommendation for the next implementation stage, not a statement about current production behavior.

A pure fail-closed policy helper and unit tests now exist at `../supabase/functions/_shared/ontology-access-policy.ts` and `../supabase/functions/_shared/ontology-access-policy.test.ts`. They exercise the proposed decision rules only. They are not connected to authentication, stored sharing grants, a database, an API endpoint, or production enforcement.

## 2. Proposed access levels

| Level | Meaning | Default |
|---|---|---|
| private | Owner can read and edit; other users cannot access it | Yes |
| workspace | Members of one explicitly selected workspace can access it according to role | No |
| shared_read | Named user(s) can read but not edit | No |
| shared_edit | Named user(s) can read and edit, subject to revision/concurrency rules | No |
| public_read | Anyone can read a deliberately published record | No; defer until a publication/revocation model exists |

Do not implement these labels as trusted client claims. They are policy concepts; the server derives effective permissions from authenticated identity and stored grants.

## 3. Ownership and authority

- owner_id, created_by, updated_by, server timestamps, server revision, and verification outcome are server-managed fields.
- A submitted owner_id, role, workspace membership, verification_status, or access policy is untrusted input.
- Creation requires an authenticated identity and an allowed operation.
- Updating or deleting a record requires the applicable owner/editor permission.
- Transfer of ownership is a distinct audited operation, not an ordinary update.
- Service-role credentials must remain server-side. They must never be placed in HTML, client JavaScript, exported JSON, or repository configuration.
- The existing zhi-agnes-chat administrator chat endpoint and ontology storage must remain separate permissions and workflows. Permission to chat with an agent does not imply permission to read or mutate ontology records.

## 4. Relation and evidence rules

- A relation is accessible only if the caller has the required permission for both endpoints and the relation itself.
- Do not leak the existence, labels, or metadata of an inaccessible endpoint through error messages.
- source_refs are pointers supplied by the client, not proof that a source exists or supports the claim.
- A client cannot promote a record to independently verified by setting a status field.
- If evidence review is later introduced, store review identity, time, outcome, and supporting provenance as separate server-controlled data.

## 5. Revisions, deletion, and export

- Use a server-assigned monotonically increasing revision or equivalent concurrency token. Reject stale updates rather than silently overwriting newer edits.
- Record security-relevant events such as sharing changes, ownership transfer, deletion, and verification decisions in a restricted audit trail.
- Define retention and backup deletion behavior before production persistence. A UI delete action must not claim complete erasure if backups or audit requirements retain data.
- Provide an owner-authorized export path. Exported JSON should clearly indicate that it is an export, include schema version and export time, and omit secrets and unrelated users' private data.
- Revocation should block future access promptly. Previously downloaded or copied exports cannot be remotely recalled; communicate that limitation.

## 6. Minimal server authorization matrix

| Operation | Owner | Explicit editor | Read-only share | Unrelated user |
|---|---:|---:|---:|---:|
| Read private record | Allow | Deny unless separately granted | Deny | Deny |
| Read shared record | Allow | Allow | Allow | Deny |
| Update record | Allow | Allow when grant includes edit | Deny | Deny |
| Delete record | Allow, subject to retention rules | Deny by default | Deny | Deny |
| Change sharing grants | Allow | Deny by default | Deny | Deny |
| Transfer ownership | Separate explicit audited flow | Deny by default | Deny | Deny |

Workspace roles, collaborative deletion, and administrator exceptions remain to be defined if workspace support is selected.

## 7. Required implementation gates

Do not enable persistent writes until all of the following exist and have tests:

- [ ] Authentication is verified server-side; no caller identity is accepted from the JSON body.
- [ ] Ownership and sharing grants are persisted and server-managed.
- [ ] Database row-level security (or an equivalent enforceable access boundary) is enabled and tested for every read/write path.
- [ ] The endpoint validates the canonical JSON Schema and semantic rules before writes.
- [ ] Record IDs, relation uniqueness, and revision concurrency are enforced by the database or transaction boundary.
- [ ] Cross-owner and cross-workspace access tests prove that unauthorized reads, updates, relation creation, and deletion are denied.
- [ ] Sharing revocation, deletion/retention, export, audit access, and error-message behavior are tested.
- [ ] A non-production environment is used for integration tests before production deployment.

## 8. Product decisions still needed

The proposed default does not settle these product choices:

1. Is the first persistent release strictly single-owner/private, or must it support workspaces immediately?
2. Should users be able to share individual records, or only whole workspaces?
3. Is public read-only publishing in scope, or should it be explicitly deferred?
4. What retention and deletion commitments should be promised to users?
5. Who, if anyone, may perform cross-owner support or moderation access, and what audit/reason is required?

Until these decisions are confirmed, implement only the private single-owner path in a non-production environment. Do not add public sharing, cross-user queries, or production migrations by assumption.
