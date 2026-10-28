# ZHI ontology validation Edge Function (draft)

## Status

This branch-only, validation-only Edge Function lives at `supabase/functions/zhi-ontology-validate/index.ts`. It has not been deployed. It does not create, update, or read ontology records from a database and does not call an AI provider.

## Request

- Method: `POST`
- Route after a future deployment: `/functions/v1/zhi-ontology-validate`
- Authentication: a valid Supabase user access token in `Authorization: Bearer <access-token>`
- Body: `{ "record": <ZHI-Ontology-Dictionary-V1.0 draft record> }`
- Maximum body size: 64 KiB

The function verifies the token using Supabase Auth with the public/anon key, then applies the canonical JSON Schema, request-envelope rules, and semantic rules. Client-supplied server-managed fields are rejected.

## Responses

Successful validation returns `ok: true`, `validation_status: "valid-for-review"`, and `persistence: "not-performed"`. This does not verify factual truth, provenance, or permission to persist.

Invalid input returns a stage and structured issues. Missing/invalid authentication returns HTTP 401; oversized input returns HTTP 413; invalid request/schema/semantics returns HTTP 400; missing server auth configuration returns HTTP 503.

## Security and limits

- Uses `SUPABASE_URL` and `SUPABASE_ANON_KEY`; it does not require or use the service-role key.
- No database writes, schema migration, model calls, ownership transfer, sharing, or durable storage.
- The response intentionally does not return the prepared candidate.
- The 64 KiB guard checks declared and actual body size; a deployment-level request limit is still recommended.
- Wildcard CORS is currently suitable only for this non-mutating validation prototype; production deployment should restrict allowed origins to the intended front-end.
- A valid access token proves the authenticated Supabase user, not that the submitted claim is true.
- Deno/CI checks must pass before considering this branch implementation validated. The function remains unverified until the workflow result is observed and an isolated non-production endpoint is tested.

## Deployment gate

Do not deploy until the Deno workflow passes and the Supabase project reference, auth settings, allowed origins, and test environment are explicitly confirmed. Do not change `zhi-agnes-chat` or production data as part of this step.
