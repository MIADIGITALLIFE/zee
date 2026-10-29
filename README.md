# ZEE — AI Brain Integration

This repository contains the server-side source for the ZHI agent conversation brain, plus the SIP offline-first multi-system prototype.

## Online pages
- **SIP 多体系交叉演化引擎 V1.0**: https://miadigitallife.github.io/zee/sip-engine/
- Admin console: https://miadigitallife.github.io/zee/admin.html
- Model studio: https://miadigitallife.github.io/zee/model.html

The SIP page is a static browser prototype. Its profile storage is local to the current browser; it does not connect to an AI model, synchronize to a cloud database, or run background tasks.

## Current scope
- Agnes-compatible text generation through a Supabase Edge Function.
- Reads an agent's identity, traits, current mind, world position/activity, recorded memories, and recent conversation.
- Stores the generated reply and conversation in the existing Supabase tables.
- SIP offline HTML engine for multi-system weight normalization, deterministic candidate analysis, task-flow simulation, JSON import/export, and session audit logs.
- Keeps provider credentials on the server; never put `AGNES_API_KEY` or the service-role key in browser code.

## Deploy status
The GitHub Pages workflow publishes the SIP page at `/sip-engine/` when the change is merged to `main`. A GitHub Pages deployment does **not** deploy the Supabase Edge Function. After reviewing server source, deploy it to the intended Supabase project and configure its secrets there.

See [AI_BRAIN_INTEGRATION.md](AI_BRAIN_INTEGRATION.md) for setup notes and [sip-engine/README.md](sip-engine/README.md) for the SIP prototype's scope and limitations.
