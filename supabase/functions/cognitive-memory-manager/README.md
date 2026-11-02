# CMM Phase 2 — Consolidation Proposal API

## Endpoint

Deploy as the Supabase Edge Function `cognitive-memory-manager`.

POST body:

```json
{
  "seed_id": "UUID",
  "request_key": "UUID",
  "claim": "A concise knowledge claim",
  "evidence_summary": "What the cited evidence supports",
  "confidence_basis": "Why the confidence assessment is justified"
}
```

Requires a valid Supabase user access token. The function authenticates the caller with the anon key, then uses the service-role key only on the server. Every seed lookup is additionally filtered by `owner_user_id = authenticated user id`.

## Admission proposal gates

- Source seed exists and belongs to the authenticated owner.
- Source seed is exactly S3.
- Safety status is PASS.
- Provenance and evidence reference arrays are non-empty.
- Independent verifier metadata is complete and verifier differs from the owner.
- Successful request creates only a `pending_review` proposal; it does not create a trusted memory.

## Idempotency

`request_key` is unique per owner. Repeated submissions return the existing proposal when the unique constraint is hit.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never expose to browser code)

## Important limitations

This function does not authenticate the verifier's role or write the independent-verification fields. Those fields must be populated by a separately authorized server workflow. The current Seed Manager is an in-memory lifecycle guard and does not persist or authenticate reviewer actions. Do not treat a client-supplied stage or verification label as authoritative.

This endpoint does not approve proposals, create trusted memories, create graph relations, revise historical memories, or modify personality configuration. Those require separate audited workflows.
