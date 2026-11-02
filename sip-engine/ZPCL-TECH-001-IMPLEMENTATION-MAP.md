# ZPCL v1.0 — TECH-001 Implementation Map

This document maps the uploaded **ZHI-ZPCL-TECH-001 v1.0** contract to the current code. It does not claim that the full nine-module production architecture is deployed.

| TECH-001 area | Current implementation | Status |
|---|---|---|
| Seven-dimension evaluator | Six soft-loss dimensions plus independent safety gate | Prototype implemented |
| Missing values | `unavailable`; total loss withheld when a dimension is unavailable | Implemented |
| Event input envelope | Required envelope fields validated by evaluator | Partial schema validation |
| Safety Gate | PASS / WARN / BLOCK; WARN is observation-only; BLOCK rejects | Prototype implemented |
| Cognitive Seed factory | S2 hypothesized seed factory; no auto-persistence | Prototype implemented |
| Cognitive Seed lifecycle | Adjacent transition guard; evidence, actor, safety and reviewer-role metadata; immutable in-memory versions | Implemented as local guard; not durable |
| NPRM adapter | Validates NPRM modes/paths and maps explicit observation records into TECH-001 event envelope | Implemented as stateless mapper |
| NPRM runtime / sensing | No live observation loop, sensor connector, or automatic feedback selection | Not implemented |
| Event Collector / Observation Processor | Caller supplies normalized event and feature annotations | Not implemented as services |
| Prediction / Discovery engines | Information gain accepted only with an explicit reference scale; no probability model included | Interface-level only |
| Exploration Planner / Verification Engine | No autonomous action or independent verification service | Not implemented |
| Evolution Controller | No identity or personality mutation | Explicitly deferred |
| Audit & Rollback | In-memory seed history only; durable audit/rollback store absent | Not implemented |
| Idempotency | Event key required, but duplicate-key storage is absent | Contract field only |
| Shadow mode | Enabled by default; evaluator returns recommendations only | Prototype behavior |
| Persistence / APIs / database | None | Not implemented |

## Important contract decisions

1. TECH-001 says missing values must not be interpreted as zero. The evaluator returns a dimension with `loss: null` and `status: unavailable`; if any of the six soft dimensions is unavailable, `total_loss` is null.
2. The six listed soft weights sum to 0.90. The implementation normalizes the six-weight weighted sum by 0.90. This preserves relative proportions and yields a 0–1 result. If the standard owner intends a different normalization, revise the standard before calibration.
3. TECH-001 specifies L1 and L4 as losses, while L2, L3, L5 and L6 are defined first as rewards and then inverted. The implementation follows those directions.
4. `PASS`, `WARN`, and `BLOCK` are separate safety states. WARN permits observation only; BLOCK prevents seed creation and lifecycle transitions.
5. A seed created by this prototype remains S2 / hypothesized until an explicit evidence-backed transition is requested. The manager cannot self-assign S3–S5.
6. No threshold is treated as a validated measure of intelligence. Any decision threshold requires benchmark calibration.

## Current scope boundary

This is a local deterministic library. It does not implement the nine independent services, REST endpoints, database schemas, event queue, durable audit log, rollback execution, sensor integration, probability-model-based KL divergence, production authorization, or authenticated reviewer identities. It does not scan chat history, call an LLM, change an agent's identity/personality, or perform autonomous exploration.

## Validation

Unit tests are provided in `evaluator.test.js`, `nprm-adapter.test.js`, and `seed-manager.test.js`; the workflow runs `node --test *.test.js`. A successful CI result must be observed before marking this implementation VERIFIED.
