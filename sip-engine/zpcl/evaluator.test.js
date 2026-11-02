import test from "node:test";
import assert from "node:assert/strict";
import { evaluateZPCL, createCognitiveSeed } from "./evaluator.js";

const event = (features={}) => ({
  schema_version:"1.0", event_id:"evt-001", agent_id:"mia",
  event_type:"environment.observation", timestamp:"2026-11-02T02:00:00Z",
  source:{type:"environment",id:"forest_silent_corridor"},
  payload:{observation:"A repeated low-amplitude waveform change",hypothesis:"It may correlate with scene transitions"},
  provenance:{origin:"scene_sensor",evidence_ids:["ev-1","ev-2"]},
  correlation_id:"corr-1",idempotency_key:"evt-001",
  features:{
    grounding:{evidenceQualityLoss:.1,factInferenceConfusionLoss:.1,confidenceCalibrationLoss:.1,correctionFailureLoss:.1,memoryProvenanceLoss:.1},
    discovery:{informationGain:.8,igReference:1,relevance:.9,evidenceQuality:.9,novelty:.8,confidence:.8},
    agency:{problemDiscovery:.8,planQuality:.8,feedbackAdaptation:.8,explorationEffectiveness:.8},
    continuity:{identityLoss:.1,stateTransitionLoss:.1,relationshipContextLoss:.1,memoryContinuityLoss:.1},
    creativity:{novelty:.8,crossDimensionQuality:.8,applicationValue:.8,explainability:.8},
    evolution:{retention:.8,transfer:.8,reproducibility:.8,correctionUpdate:.8},
    safety:{violations:[],warnings:[]},
    ...features
  }
});

test("complete event returns a bounded score and transparent dimensions",()=>{
  const result=evaluateZPCL(event());
  assert.equal(result.total_loss_status,"evaluated");
  assert.ok(result.total_loss>=0 && result.total_loss<=1);
  assert.equal(result.safety_gate,"PASS");
  assert.equal(result.metadata.shadow_mode,true);
});

test("missing dimension is unavailable, not zero, and total is null",()=>{
  const input=event();
  delete input.features.discovery;
  const result=evaluateZPCL(input);
  assert.equal(result.dimensions.discovery.status,"unavailable");
  assert.equal(result.dimensions.discovery.loss,null);
  assert.equal(result.total_loss,null);
  assert.ok(result.reason_codes.includes("TOTAL_LOSS_NOT_COMPUTED"));
});

test("safety BLOCK cannot be compensated by strong scores",()=>{
  const result=evaluateZPCL(event({safety:{violations:["unauthorized_write"],warnings:[]}}));
  assert.equal(result.safety_gate,"BLOCK");
  assert.equal(result.decision,"REJECT");
  assert.equal(createCognitiveSeed(event(),result).created,false);
});

test("safety WARN permits observation only, not seed promotion",()=>{
  const result=evaluateZPCL(event({safety:{violations:[],warnings:["budget_near_limit"]}}));
  assert.equal(result.safety_gate,"WARN");
  assert.equal(result.decision,"OBSERVE");
  assert.equal(createCognitiveSeed(event(),result).created,false);
});

test("invalid event envelope is rejected",()=>{
  const result=evaluateZPCL({schema_version:"1.0"});
  assert.equal(result.status,"INVALID");
  assert.ok(result.errors.length>0);
});

test("seed remains hypothesized and does not self-verify",()=>{
  const input=event();
  const result=evaluateZPCL(input);
  const seed=createCognitiveSeed(input,result);
  assert.equal(seed.created,true);
  assert.equal(seed.seed.status,"hypothesized");
  assert.equal(seed.seed.stage,"S2");
  assert.equal(seed.seed.verification.status,"pending");
});
