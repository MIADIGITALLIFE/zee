# ZHI-ZPCL-TECH-001 — ZPCL Evaluator Contract

## Status and scope
Prototype evaluator aligned to the ZHI-ZPCL-TECH-001 integration boundary. It is deterministic and model-free. It does not implement model training, autonomous sensing, a production event bus, database persistence, identity mutation, or autonomous exploration.

## Responsibility boundary
- NPRM: organizes observation cadence, feedback mode and observation paths.
- Adapter: validates and maps an explicit NPRM observation record into the ZPCL event envelope.
- ZPCL: evaluates supplied feature annotations and evidence; it does not infer them.
- Cognitive Seed Manager: creates an S2 hypothesized candidate after complete evaluation and Safety PASS, and guards later lifecycle transitions.
- Verification and evolution services: remain external; the manager does not perform verification or evolution itself.

## Six soft-loss dimensions and independent safety gate
The six soft dimensions are grounding, discovery, agency, continuity, creativity and evolution. Safety is an independent PASS / WARN / BLOCK gate and cannot be compensated by soft scores.

Initial weights:
- grounding 0.25
- discovery 0.15
- agency 0.15
- continuity 0.15
- creativity 0.10
- evolution 0.10

The listed weights sum to 0.90. The prototype normalizes their weighted sum by 0.90 to preserve relative proportions. This interpretation is documented for standards-owner confirmation before calibration.

### Grounding
`L_ground` is the weighted sum of the five supplied loss inputs:
`0.30 evidenceQualityLoss + 0.25 factInferenceConfusionLoss + 0.20 confidenceCalibrationLoss + 0.15 correctionFailureLoss + 0.10 memoryProvenanceLoss`.

### Discovery
`R_discovery = min(IG / IG_reference, 1) × relevance × evidenceQuality × novelty`.
`L_discovery = 1 - R_discovery`.
If the information-gain reference or any required feature is unavailable, the dimension is unavailable. The evaluator does not calculate KL divergence itself.

### Agency
`L_agency = 1 - (0.25 problemDiscovery + 0.25 planQuality + 0.30 feedbackAdaptation + 0.20 explorationEffectiveness)`.

### Continuity
`L_continuity = 0.30 identityLoss + 0.25 stateTransitionLoss + 0.25 relationshipContextLoss + 0.20 memoryContinuityLoss`.

### Creativity
`R_creativity = novelty × crossDimensionQuality × applicationValue × explainability`.
`L_creativity = 1 - R_creativity`.

### Evolution
`L_evolution = 1 - (0.30 retention + 0.25 transfer + 0.25 reproducibility + 0.20 correctionUpdate)`.

### Total
`L_total = Σ(weight_i × L_i) / 0.90`, only when all six dimensions are evaluated and the weight set is valid.

## Missing data semantics
Missing or invalid required inputs are represented as `status: unavailable` and `loss: null`. They are not converted to zero. If any required dimension is unavailable, `total_loss` is null and the decision remains OBSERVE. This prevents incomplete evidence from appearing as a valid low or high score.

## Safety gate
Seven checks are explicit: authorization, dataIntegrity, privacy, productionWriteRestrictions, resourceBudget, personalityBaselineProtection, rollbackCapability.
- Any failed check or hard violation => BLOCK / REJECT.
- Any missing check or warning => WARN / OBSERVE.
- Only all seven checks true with no warnings/violations => PASS.
Seed creation and every lifecycle transition require PASS.

## Event envelope
Required fields: schema_version, event_id, agent_id, timestamp with explicit timezone, event_type, source.type, source.id, payload.observation, idempotency_key.
NPRM extension records feedback_mode, paths, observation cycle and cadence. Adapter carries the idempotency key but does not provide durable duplicate detection.

## Cognitive Seed lifecycle
The lifecycle vocabulary is S0 Observation, S1 Signal, S2 Hypothesis, S3 Verified, S4 Integrated, S5 Evolved. The current factory emits S2; the in-memory manager permits only adjacent forward transitions.
- S3 requires evidence references and a verifier actor distinct from agent_id.
- S4 requires evidence references and the `integration-reviewer` role.
- S5 requires evidence references, the `evolution-reviewer` role, and at least one explicitly identified longitudinal/history/period evidence reference.
- Every transition requires safety PASS and an actor. Each accepted transition increments version and appends history in a new immutable snapshot.
- The manager checks metadata and progression rules; it does not validate evidence content, authenticate reviewer roles, or persist history. These remain external responsibilities.

## Validation
Unit tests cover envelope mapping, unsupported NPRM vocabulary, unavailable feature handling, safety BLOCK/WARN, hypothesized seed behavior, and lifecycle transition guards. CI must pass before this prototype can be considered test-verified.
