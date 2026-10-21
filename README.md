# ZEE — AI Brain Integration

This repository contains the server-side source for the ZHI agent conversation brain.

## Current scope
- Agnes-compatible text generation through a Supabase Edge Function.
- Reads an agent's identity, traits, current mind, world position/activity, recorded memories, and recent conversation.
- Stores the generated reply and conversation in the existing Supabase tables.
- Keeps provider credentials on the server; never put `AGNES_API_KEY` or the service-role key in browser code.

## Deploy status
Pushing files to GitHub does **not** deploy the Supabase Edge Function. After reviewing the source, deploy it to the intended Supabase project and configure its secrets there.

See [AI_BRAIN_INTEGRATION.md](AI_BRAIN_INTEGRATION.md) for setup notes.
