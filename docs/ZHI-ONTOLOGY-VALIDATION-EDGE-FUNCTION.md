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


## Non-production smoke test

A repeatable smoke-test script is available at `scripts/smoke-test-zhi-ontology-validate.mjs`. It sends requests only to the URL supplied through environment variables and never prints the access token.

Run it locally only after deploying the function to an isolated non-production Supabase project and signing in as a test user:

```sh
SUPABASE_URL="https://YOUR-TEST-PROJECT.supabase.co" \
SUPABASE_ANON_KEY="YOUR_TEST_ANON_KEY" \
SUPABASE_ACCESS_TOKEN="TEST_USER_ACCESS_TOKEN" \
node scripts/smoke-test-zhi-ontology-validate.mjs
```

Expected checks: missing token returns 401, invalid token returns 401, invalid record returns 400, valid draft returns 200 with `persistence: "not-performed"`, and a request above 64 KiB returns 413. A passing script is evidence only for that test project and deployment. Do not use production credentials or paste tokens into chat, GitHub issues, commits, or logs. The script has not been run against a live endpoint because no test deployment/access token has been confirmed.


## Gateway JWT configuration

The repository configuration explicitly sets `[functions.zhi-ontology-validate]` to `verify_jwt = true`. This requests JWT verification at the Supabase Edge Functions gateway before the handler runs; the handler additionally calls `auth.getUser(token)` to resolve the user. Confirm the deployed project uses this configuration before treating gateway-level verification as live-environment verified.
