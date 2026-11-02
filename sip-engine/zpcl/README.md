# ZPCL v0.1 Evaluator

A deterministic, model-free evaluator for one explicitly supplied cognitive observation packet.

## Run tests

Requires Node.js with ES module support:

```bash
node --test *.test.js
```

## Use

```js
import { evaluateZPCL } from "./evaluator.js";
const result = evaluateZPCL(packet);
```

The caller supplies normalized 0–1 ratings and evidence metadata. Missing required ratings are reported as unavailable; they are never silently converted to zero. An incomplete dimension withholds the total loss.

## Cognitive Seed lifecycle

```js
import { createSeedRecord, transitionSeed } from "./seed-manager.js";
```

The in-memory lifecycle guard enforces adjacent transitions S2 → S3 → S4 → S5 (and defines the complete S0–S5 vocabulary). S3 requires independent verification evidence; S4 requires an integration reviewer; S5 requires an evolution reviewer and explicitly identified longitudinal evidence. Every transition requires safety PASS, evidence references, and an actor. Each accepted transition returns a new immutable version; the prior snapshot is unchanged.

This is a deterministic guard only: no database persistence, durable audit store, autonomous verification, or automatic evolution is implemented.

See [ZPCL-SPEC.md](../ZPCL-SPEC.md) and [NPRM-INTEGRATION.md](./NPRM-INTEGRATION.md). Weights and thresholds are experimental starting values, not validated optima.
