# CMM Phase 3 — Cognitive Evidence Validator

## Scope

This phase adds a server-authorized human verification workflow. It does not automatically prove that a source is true, crawl external URLs, or treat a hash as proof of truth. An authorized independent reviewer records an evidence-by-evidence attestation and rationale.

## Actions

All requests are authenticated with a Supabase user access token.

### 1. Owner appoints an independent verifier

POST to `/functions/v1/cognitive-evidence-validator`:

```json
{
  "action": "grant_verifier",
  "agent_id": "AGENT_UUID",
  "verifier_user_id": "OTHER_AUTH_USER_UUID"
}
```

The owner must already have at least one cognitive seed for that agent. The target must be an existing Supabase Auth user and must differ from the owner. Use `revoke_verifier` with the same fields to revoke the assignment.

### 2. Assigned verifier reviews an S3 seed

```json
{
  "action": "verify_seed",
  "seed_id": "SEED_UUID",
  "rationale": "Why the source material was reviewed and how the decision was reached.",
  "evidence_checks": [
    {
      "evidence_ref": "exact reference from cognitive_seeds.evidence_refs",
      "outcome": "supports",
      "notes": "What this source was checked for and what it supports."
    }
  ]
}
```

Every seed evidence reference must appear exactly once. Outcomes are `supports`, `contradicts`, or `inconclusive`. Only an all-`supports` review produces `verified`; any contradictory or inconclusive item produces `rejected`. The database assigns the verifier identity from the authenticated session and timestamps the record.

## Security invariants

- Client-supplied verifier IDs are used only for owner appointment; they never identify the actor performing verification.
- The owner cannot appoint themselves or verify their own seed.
- Verification requires an active owner/agent/verifier assignment.
- Verification requires stage S3 and Safety PASS.
- The Edge Function authenticates the caller, validates the target Auth account, then calls restricted service-role-only database functions.
- The SQL function locks the seed row and writes the audit record and seed verification metadata in one transaction.
- Audit rows cannot be updated or deleted; clients have no insert/update/delete grants.
- A rejected review is still audited but does not satisfy the Phase 2 admission gate.
- No trusted memory is created, no lifecycle stage is advanced, and no personality configuration is modified.

## Deploy

Apply migrations in order:

1. `20261102000000_cognitive_memory_foundation.sql`
2. `20261102010000_cmm_independent_verification.sql`
3. `20261102020000_cmm_evidence_validator.sql`

Deploy function `cognitive-evidence-validator` with the existing Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

The Phase 2 `cognitive-memory-manager` proposal endpoint can then consume the resulting verification metadata.

## Validation status

This is a code proposal only until CI, migration review, and a controlled Supabase test are completed. No migration has been applied and no Edge Function has been deployed by this change.
