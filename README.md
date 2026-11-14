# ZEE — Digital Life Evolution Lab

This repository contains the ZHI agent conversation brain integration, the SIP multi-system prototype, and the Digital Life Evolution Lab interface.

## Online pages
- **Digital Life Evolution Lab**: https://miadigitallife.github.io/zee/
- **Evolution Lab dashboard**: https://miadigitallife.github.io/zee/model.html
- **Admin conversation console**: https://miadigitallife.github.io/zee/admin.html
- **SIP multi-system evolution engine**: https://miadigitallife.github.io/zee/sip-engine/
- **Archived v4.1 persona studio**: https://miadigitallife.github.io/zee/legacy/model-v4.1.html

The new dashboard organizes the product into five systems: Identity, Cognition, Memory, Evolution, and Agency. The former slider-first v4.1 interface is preserved under `legacy/` for compatibility and regression testing; it is no longer the primary landing experience.

## Current scope and capability boundaries
- Agnes-compatible text generation through the `zhi-agnes-chat` Supabase Edge Function.
- Reads an agent's identity, traits, current mind, world position/activity, recorded memories, and recent conversation.
- Stores generated replies and conversations in the existing Supabase tables.
- SIP remains an offline-first browser prototype for multi-system weight normalization, deterministic candidate analysis, task-flow simulation, JSON import/export, and session audit logs.
- The dashboard is a navigation and product overview. It does not claim that all five systems are fully implemented or independently autonomous.
- The archived v4.1 configuration and ontology tools remain local browser tools unless a separately documented backend integration is used.

## Deployment boundaries
GitHub Pages publishes the static dashboard, legacy studio, admin console, and SIP page. It does **not** deploy Supabase Edge Functions, database migrations, secrets, or server-side runtime changes.

The static deployment workflow validates the SIP smoke test and publishes the site from `main`. Pull requests run HTML/JavaScript validation for both the new dashboard and archived v4.1 page, plus Playwright regression tests for the dashboard and legacy ontology workflows.

Supabase functions must be reviewed and deployed to the intended Supabase project separately. Never put `AGNES_API_KEY` or the service-role key in browser code or the repository.

See [AI_BRAIN_INTEGRATION.md](AI_BRAIN_INTEGRATION.md) for the server integration and [sip-engine/README.md](sip-engine/README.md) for the SIP prototype's scope and limitations.
