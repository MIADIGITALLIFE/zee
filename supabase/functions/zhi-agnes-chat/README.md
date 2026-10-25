# ZHI AI Brain — Agnes provider

This Supabase Edge Function generates a reply using the selected agent's stored identity, traits, current mind, world state, memories, and recent conversation.

## Current Supabase project

- Project ref: `xeykndpirxfuozeunkku`
- Function endpoint: `https://xeykndpirxfuozeunkku.supabase.co/functions/v1/zhi-agnes-chat`

## Required server secrets

- `AGNES_API_KEY`: private Agnes-compatible API key, stored only in Supabase Edge Function secrets.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: supplied to the Edge Function runtime by Supabase.

Optional:
- `AGNES_MODEL` (default: `agnes-3.0-flash`)
- `AGNES_BASE_URL` (default: `https://apihub.agnes-ai.com/v1`)

Never commit API keys, Supabase secret keys, service-role keys, passwords, or user access tokens to GitHub or browser code.

## Deploy

From a trusted checkout with Supabase CLI authenticated:

```sh
supabase functions deploy zhi-agnes-chat --project-ref xeykndpirxfuozeunkku
```

Set private provider keys through Supabase Dashboard > Edge Functions > Secrets, or with the Supabase CLI in a trusted environment. Do not put real key values in source files or chat messages.

## Request

Send a POST request to the function endpoint above.

Headers:
- `Authorization: Bearer <Supabase Auth access token for the authorized admin user>`
- `apikey: <project publishable key>`
- `Content-Type: application/json`

The admin user must have the UID configured in `index.ts`. A publishable key by itself is not a user login token and will not pass the function's admin check.

Body:

```json
{
  "agent_id": "<agent UUID>",
  "message": "你今天在想什么？"
}
```

A successful response returns the generated reply and a `saved` flag. A successful GitHub Actions deployment confirms deployment only; it does not prove that admin authentication, the Agnes API call, or database writes have passed an end-to-end test.
