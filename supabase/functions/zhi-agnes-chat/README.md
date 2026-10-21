# ZHI AI Brain — Agnes provider

This Supabase Edge Function generates a reply using the selected agent's stored identity, traits, current mind, world state, memories, and recent conversation.

## Required server secrets

- `AGNES_API_KEY`: private Agnes-compatible API key.
- Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions.

Optional:
- `AGNES_MODEL` (default: `agnes-3.0-flash`)
- `AGNES_BASE_URL` (default: `https://apihub.agnes-ai.com/v1`)

Never commit API keys or the service-role key to GitHub or browser code.

## Deploy

From a trusted checkout with Supabase CLI authenticated:

```sh
supabase functions deploy zhi-agnes-chat --project-ref jozrslgdjreepxplicen
supabase secrets set AGNES_API_KEY=YOUR_PRIVATE_KEY --project-ref jozrslgdjreepxplicen
```

Set the secret through the Supabase dashboard instead if you prefer not to place it in a shell command.

## Request

POST to `https://jozrslgdjreepxplicen.supabase.co/functions/v1/zhi-agnes-chat`

Headers: `Authorization: Bearer <authorized Finance admin access token>`, `apikey: <Core publishable key>`, `Content-Type: application/json`.

Body:

```json
{"agent_id":"<agent UUID>","message":"你今天在想什么？"}
```

A successful response returns the generated reply and a `saved` flag. This source commit alone does not deploy or activate the function.
