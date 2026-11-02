# Cognitive Memory Manager (CMM) — Phase 1 Foundation

**Version:** 1.0.0-draft  
**Status:** Schema proposal committed for review; not deployed  
**Parent integration:** NPRM → ZPCL → Cognitive Seed Manager → CMM → Retrieval/Reasoning  
**Personality boundary:** Personality Configuration Manager remains independent.

## 1. Purpose

Provide durable, owner-scoped storage primitives for cognitive seeds, trusted-memory candidates, evidence, relations, immutable snapshots, review decisions, and personality-change proposals.

This phase is deliberately a storage foundation. It does not implement automatic memory promotion, evidence verification, reviewer authentication, retrieval ranking, graph inference, or personality mutation.

## 2. Existing integration contract

The current sip-engine/zpcl/seed-manager.js is an in-memory lifecycle guard. It creates S2 hypotheses and enforces adjacent S0–S5 transitions, evidence/safety metadata, independent S3 verification metadata, S4/S5 reviewer-role metadata, and immutable in-memory snapshots. It explicitly does not authenticate reviewers or verify evidence contents.

CMM does not replace that manager. The SQL schema provides durable records that a later server-side adapter can write after validating the existing lifecycle contract and authenticating the actor.

## 3. Seed lifecycle

| Stage | Meaning | CMM treatment |
|---|---|---|
| S0 | Observation | Staging only |
| S1 | Signal | Searchable signal; not trusted fact |
| S2 | Hypothesis | Quarantined hypothesis; cannot become trusted memory |
| S3 | Verified | May submit a consolidation proposal after independent verification |
| S4 | Integrated | Reviewed integrated knowledge |
| S5 | Evolved | Longitudinally supported evolution record; no personality write permission |

Stages are adjacent-only. No stage skip or rollback is allowed in the seed lifecycle. Corrections to knowledge are represented as new memory versions and review events, not by rewriting the seed's historical stage.

S3 is eligibility, not automatic admission. Promotion requires evidence references, Safety PASS, independent verification, and an authorized review decision. WARN is observation-only; BLOCK rejects the operation. Missing evidence is unavailable, never an implied pass.

## 4. Tables

- cognitive_seeds: durable seed identity and current stage metadata.
- cognitive_seed_versions: immutable stage snapshots and transition provenance.
- cognitive_memories: current memory record and lifecycle status.
- memory_evidence: evidence references, source hashes, verification state and verifier.
- memory_relations: typed edges; proposed relations are not treated as proven.
- memory_versions: immutable claim snapshots and correction lineage.
- memory_reviews: append-only admission and periodic review decisions.
- memory_proposals: pending requests to consolidate, relate, revise, or revoke.
- personality_change_requests: proposal-only handoff to the separate personality manager.

## 5. Relation semantics

CONCEPT, EXPERIENTIAL, and DERIVED_FROM describe semantic/lineage relationships. CAUSAL and SUPPORTS may only be marked evidence_supported after an authorized review with explicit evidence references. CONTRADICTS records a conflict and must not be silently resolved by choosing the newer row.

A relation's existence does not prove its assertion. The default state is proposed.

## 6. Immutable history

memory_versions, cognitive_seed_versions, memory_evidence, and memory_reviews are append-only at the client policy layer. A correction creates a new version and review event; it does not overwrite the prior snapshot. Revocation changes the current lifecycle status through a future audited server operation while preserving all historical rows.

## 7. Security and permissions

- RLS is enabled on every CMM table.
- Authenticated users can read only rows with their owner_user_id.
- Client inserts are limited to initial seed creation and pending proposals.
- Clients have no direct update/delete policies for lifecycle, evidence, review, relation, or version tables.
- No client policy allows direct insertion of trusted memories or evidence.
- Future write RPCs must authenticate the user, resolve agent ownership/membership, validate reviewer roles server-side, check evidence and safety gates, enforce idempotency, and write state + audit snapshots transactionally.
- The service_role key must never be exposed to browser code.

## 8. Personality isolation

CMM can create a personality_change_requests proposal only. It cannot write Personality Genome/configuration records. Approval and application must be implemented by the separate Personality Configuration Manager with explicit authorization, before/after diff, version increment, and rollback reference.

## 9. Phase 1 non-goals

No Edge Function changes, chat-history scanning, automatic extraction, model/API calls, embeddings, vector search, graph inference, automatic S3/S4/S5 transitions, direct memory promotion, personality mutation, or Supabase deployment.

## 10. Acceptance checks

1. S2 cannot be inserted as a trusted memory because no client insert policy exists.
2. A seed cannot be advanced by direct client update because no update policy exists.
3. Clients cannot edit or delete version/evidence/review rows.
4. A proposal insert is accepted only as pending_review and with created_by = auth.uid().
5. A personality change request can only be submitted as pending_authorization, without an authorizer or applied version.
6. Every table is RLS-enabled and owner-scoped.
7. A later RPC must enforce adjacent-only stages, Safety PASS, independent S3 verifier, S4/S5 reviewer role, and evidence presence before any transition.

## 11. Deployment status

This migration is a draft in GitHub only. It has not been applied to Supabase. No production behavior should be inferred from the presence of these files.