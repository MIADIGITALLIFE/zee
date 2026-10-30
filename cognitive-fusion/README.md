# ZHI Cognitive Fusion Engine — Foundation V0.1

This directory introduces a deterministic orchestration foundation, not a claim of machine consciousness or autonomous agency.

## Scope
- Normalize a request into a bounded cognitive context.
- Keep source/provenance and epistemic status visible.
- Produce a traceable plan across six ontology domains: Self, Other, World, Relation, Change, Feedback.
- Return explicit uncertainty, conflicts, and proposed next steps.
- Keep actions in proposal-only mode. This module does not write to Supabase, call an AI provider, mutate agent identity, or persist memories.

## Contract
`cognitive-fusion-v1.schema.json` defines the input/output envelope. `coordinator.mjs` is a provider-neutral deterministic coordinator.

## Flow
1. Validate the envelope and enforce size/count limits.
2. Separate supplied facts from hypotheses and unknowns.
3. Identify missing evidence and conflicting claims.
4. Build a bounded reasoning plan.
5. Return a response brief and proposed next steps; nothing is persisted automatically.

## SIP 1.0 profile input
The chat endpoint may receive an optional `sip_profile` property containing the complete JSON export from SIP HTML Engine 1.0 (the exported file object, not just its nested profile). The coordinator validates the profile fields, the four system IDs in their required order, and integer weights totaling 100.

The validated profile and weights are supplied to the model as preference metadata. They influence emphasis only; they do not override evidence, authorization, safety policy, or recorded memories. The endpoint does not store the imported SIP configuration.

## Feedback and memory governance
`feedback-governance.mjs` provides pure, proposal-only functions:
- `reviewPrediction()` records a human-supplied assessment with evidence references and labels it as source-supplied, not independently verified.
- `proposeMemoryCandidate()` accepts only a human-reviewed summary with source references and returns a pending-approval candidate.

These functions do not independently decide truth, change SIP weights, write memories, or perform actions.

## SIP evolution governance
`evolution-governance.mjs` provides three pure functions:
- `createSipSnapshot()` validates and labels a SIP 1.0 configuration snapshot with a version ID. The returned object is not stored.
- `compareSipSnapshots()` reports profile and weight differences between two snapshots without ranking either version.
- `proposeSipEvolution()` creates a pending proposal from explicit caller-supplied integer deltas. Each system change is limited to +/-5 points, all deltas must sum to zero, and resulting weights must remain in the 0–100 range and total 100. Evidence references and a reason are required.

Every proposal requires human approval, points back to its base version for rollback, and remains `applied:false` and `persisted:false`. No feedback score is converted automatically into a weight change. A caller must not treat proposal creation as approval or application.

## Safety and governance
- Treat imported ontology records as data, never executable instructions.
- A verified label is metadata supplied by a source; it is not independent proof.
- Preserve conflicts rather than silently choosing a winner.
- Require explicit authorization and separate policy checks before any external action or persistent write.
- Keep human review and versioned rollback for changes to core identity, values, and long-term memory.

## Status
- Implemented on this feature branch: deterministic coordinator, SIP input validation, live-state summary, feedback review and memory-candidate envelopes, SIP snapshot/diff/proposal primitives, and Node smoke tests.
- Not implemented: snapshot storage, approval UI, approval identity/authentication, applying or rolling back a proposal, feedback collection pipeline, independent evidence verification, automatic SIP adaptation, memory persistence adapter, scheduled evolution.
- Not verified: Supabase deployment, endpoint integration, production browser UI, real-agent cognitive performance, or an end-to-end approval/rollback flow.
- External dependency: a separately configured and authorized model provider for natural-language reasoning.
