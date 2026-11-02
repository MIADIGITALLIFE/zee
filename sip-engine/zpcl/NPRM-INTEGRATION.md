# NPRM–ZPCL Integration Contract v0.1

## Purpose
Define a narrow, auditable handoff from the Nonlinear Poetic Feedback Mechanism (NPRM) to the ZPCL evaluator. This is an interface contract, not a claim that a live sensing or autonomous cognition service exists.

## Responsibility boundary
- NPRM supplies an observation record, chosen feedback mode, observation paths, and optional cycle metadata.
- Adapter validates and maps the record into a TECH-001 event envelope.
- ZPCL evaluates only explicit feature annotations and evidence metadata.
- Cognitive Seed Manager may create a hypothesized candidate only after a complete evaluation and safety PASS.
- No component in this prototype performs autonomous exploration, personality mutation, or unreviewed long-term memory writes.

## NPRM vocabulary
Feedback modes: direct, poetic, mirror, reverse, associative, pause.
Observation paths: semantic, memory, poetic, logic.
The adapter rejects unknown values rather than silently translating them.

## Handoff fields
Required: event_id, agent_id, timestamp with timezone, source.type, source.id, observation, idempotency_key, feedback.mode, feedback.paths.
Optional: hypothesis, evidence_ids, observation_id, correlation_id, mechanism_version, observation_cycle, cadence, novelty_signal, user_confirmation, features.

## Critical semantics
1. The adapter does not infer or manufacture evidence or feature scores.
2. Empty features remain empty. ZPCL returns unavailable dimensions and withholds total loss.
3. `user_confirmation` defaults to false. It records an explicit flag; it does not grant broad authorization.
4. `pause` is an expression/interaction mode, not permission to suppress required factual or safety information.
5. `poetic` mode does not increase novelty, creativity, or evidence scores by itself.
6. Repeated observation and independent verification remain separate steps.
7. The adapter is stateless and does not implement idempotency storage; it only carries the key.

## Current implementation status
- NPRM event adapter: implemented as a deterministic mapper.
- ZPCL evaluator: implemented as a deterministic evaluator requiring upstream feature annotations.
- Seed factory: creates S2 / hypothesized output only; no persistence.
- NPRM runtime, environment sensors, feature extraction, Bayesian/KL estimator, event queue, durable idempotency, seed store, exploration planner, verifier, evolution controller, audit store, rollback: not implemented.
