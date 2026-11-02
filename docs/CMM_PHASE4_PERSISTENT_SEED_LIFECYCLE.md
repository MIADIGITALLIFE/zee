# CMM Phase 4 — Persistent S2 → S3 lifecycle

## Scope

This phase closes the persisted lifecycle gap between S2 seed capture and S3 eligibility for memory consolidation. It does not promote a seed directly into trusted memory and does not modify personality configuration.

## Lifecycle

1. An owner creates a seed in S2 with Safety PASS, provenance, and evidence references.
2. The owner assigns a distinct Supabase Auth user as verifier through the authenticated evidence-validator Edge Function.
3. The assigned verifier submits one review item for every evidence reference. The verifier identity is derived from the verified Supabase session by the Edge Function; it is not accepted from request JSON.
4. The database locks the S2 seed and validates assignment, evidence coverage, unique references, outcomes, and rationale.
5. If every outcome is `supports`, one transaction appends the verification audit, promotes the seed to S3, increments the seed version, and writes an immutable `cognitive_seed_versions` snapshot.
6. If any outcome is `contradicts` or `inconclusive`, the audit is appended with decision `rejected`; the seed remains S2 and its version does not change.
7. The memory manager accepts only S3 and matches the audit's `resulting_seed_version` to the current seed version before creating a pending memory proposal.

## Version semantics

- `cmm_verification_audit.seed_version`: version reviewed (before transition).
- `cmm_verification_audit.resulting_seed_version`: version after the review transaction.
- Successful S2 → S3: resulting version = reviewed version + 1.
- Rejected review: resulting version = reviewed version.
- The S3 version snapshot contains the reviewed evidence checks and audit reference.
- Legacy Phase 3 audit rows are not rewritten; the memory manager accepts a legacy row with a null resulting version only when its reviewed version equals the current seed version.
- Verification audit and seed-version rows are append-only. Client roles cannot write lifecycle or version records.

## Security boundary

The Edge Function validates the caller's Supabase Auth access token and passes the authenticated user's ID to the service-role-only database RPC. The RPC requires an active owner-appointed assignment and rejects self-review. The service-role key remains server-side. This is a human review attestation; it does not crawl URLs or independently prove that source material is authentic or true.

## Validation matrix

| Case | Expected result |
|---|---|
| Assigned verifier reviews S2; every item supports | Audit appended; S2 → S3; version increments once; S3 snapshot appended |
| Any item contradicts | Audit rejected; seed remains S2; version unchanged |
| Any item inconclusive | Audit rejected; seed remains S2; version unchanged |
| Owner attempts self-review | Rejected |
| User without active assignment attempts review | Rejected |
| Missing, duplicate, or foreign evidence reference | Rejected; no partial writes |
| Seed is not S2 or Safety is not PASS | Rejected |
| Client attempts direct update/insert/delete of version or audit rows | Denied |
| Memory manager receives S2 | Rejected |
| Memory manager receives promoted S3 with matching resulting version audit | Pending memory proposal may be created; trusted memory is not auto-created |

## Deployment and test status

This PR adds a new migration and updates the memory manager's audit/version matching. It is not deployed by this PR. After merge, the existing ordered CMM deployment workflow applies migrations and deploys both Edge Functions. Before production use, run the validation matrix with two real Supabase Auth accounts (owner and verifier), then verify the database rows and proposal behavior. CI type-checking alone does not prove the live database transaction path.
