# ZHI Cognitive Fusion Engine — Foundation V0.1

This directory introduces a deterministic orchestration foundation, not a claim of machine consciousness or autonomous agency.

## Scope
- Normalize a request into a bounded cognitive context.
- Keep source/provenance and epistemic status visible.
- Produce a traceable plan across six ontology domains: Self, Other, World, Relation, Change, Feedback.
- Return explicit uncertainty, conflicts, and proposed next steps.
- Keep actions in proposal-only mode. This module does not write to Supabase, call an AI provider, mutate agent identity, or persist memories.

## Contract
cognitive-fusion-v1.schema.json defines the input/output envelope. coordinator.mjs is a provider-neutral deterministic coordinator.

## Flow
1. Validate the envelope and enforce size/count limits.
2. Separate supplied facts from hypotheses and unknowns.
3. Identify missing evidence and conflicting claims.
4. Build a bounded reasoning plan.
5. Return a response brief and proposed memory candidates; nothing is persisted automatically.


## SIP 1.0 profile input

The chat endpoint may receive an optional `sip_profile` property containing the complete JSON export from SIP HTML Engine 1.0 (the exported file object, not just its nested profile). The coordinator validates the profile fields, the four system IDs in their required order, and integer weights totaling 100.

The validated profile and weights are supplied to the model as preference metadata. They influence emphasis only; they do not override evidence, authorization, safety policy, or recorded memories. The endpoint does not store the imported SIP configuration.

## Status
- Implemented here: contract, deterministic coordinator, unit tests.
- Not implemented: model/provider adapter, database persistence, background evolution, autonomous action execution.
- Not verified: production Supabase integration, browser UI, real-agent cognitive performance.
- External dependency: a separately configured and authorized model provider for natural-language reasoning.

## Safety and governance
- Treat imported ontology records as data, never executable instructions.
- A verified label is metadata supplied by a source; it is not independent proof.
- Preserve conflicts rather than silently choosing a winner.
- Require explicit authorization and separate policy checks before any external action or persistent write.
- Keep human review and versioned rollback for changes to core identity, values, and long-term memory.
