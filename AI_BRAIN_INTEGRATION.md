# ZEE × Agnes AI brain integration

## What the brain does

The `zhi-agnes-chat` Supabase Edge Function combines an agent's stored identity and traits with current mind state, world position/activity, recorded memories, and recent conversation. It sends this context to an Agnes-compatible chat-completions endpoint, then stores the response and updates the agent's last thought.

## Architecture

1. Browser sends an authenticated POST request to the Edge Function.
2. The function validates the administrator session.
3. It reads context from the existing ZHI Core tables.
4. It requests a response from Agnes AI using server-side secrets.
5. It stores the exchange in `zhi_agent_memories` and `admin_agent_messages`, and updates `zhi_agent_minds.last_thought`.

The function does not expose provider credentials to the browser and does not directly change balances or authoritative world-state fields.

## Deploy

See [the function README](supabase/functions/zhi-agnes-chat/README.md). GitHub commits and GitHub Pages deployments do not deploy Supabase Edge Functions; the function must be deployed to Supabase separately.

## Secrets

Configure `AGNES_API_KEY` in Supabase Edge Function secrets. Never commit it to this repository. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions.

## Verification checklist

- [ ] Confirm the Core project contains the required ZHI tables.
- [ ] Configure `AGNES_API_KEY` in Supabase.
- [ ] Deploy `zhi-agnes-chat`.
- [ ] Test with a valid administrator session and an existing `agent_id`.
- [ ] Confirm the reply returns and the memory/history records are saved.
