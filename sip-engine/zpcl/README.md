# ZPCL v0.1 Evaluator

A deterministic, model-free evaluator for one explicitly supplied cognitive observation packet.

## Run tests

Requires Node.js with ES module support:

```bash
node --test zpcl/evaluator.test.js
```

## Use

```js
import { evaluateZPCL } from "./evaluator.js";
const result = evaluateZPCL(packet);
```

The caller supplies normalized 0–1 ratings and evidence metadata. Missing ratings default to zero and are reported. A hard safety violation always returns `BLOCKED`. The evaluator does not persist data, call a model, inspect chat history, verify external facts, or mutate agent identity/personality/memory.

See [ZPCL-SPEC.md](ZPCL-SPEC.md) for formulas and lifecycle rules. All weights and thresholds are experimental starting values, not validated optima.

## NPRM integration

See [NPRM-INTEGRATION.md](NPRM-INTEGRATION.md). The stateless adapter maps explicit NPRM records into ZPCL events; it does not infer features or run exploration. Run all tests with `node --test *.test.js` from this directory.
