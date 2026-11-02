import test from "node:test";
import assert from "node:assert/strict";
import { adaptNPRMToZPCL } from "./nprm-adapter.js";
import { evaluateZPCL } from "./evaluator.js";

const sample = () => ({
  event_id:"nprm-evt-01",agent_id:"mia",
  timestamp:"2026-11-02T02:00:00Z",
  source:{type:"scene",id:"silent-corridor"},
  observation:"A low-amplitude waveform change appeared during the observation cycle.",
  hypothesis:"The change may correlate with a scene transition.",
  idempotency_key:"nprm-evt-01",
  feedback:{mode:"associative",paths:["semantic","poetic"],novelty_signal:0.4,user_confirmation:false},
  evidence_ids:["sensor-log-01"]
});

test("maps a valid NPRM observation into the ZPCL event envelope",()=>{
  const result=adaptNPRMToZPCL(sample());
  assert.equal(result.ok,true);
  assert.equal(result.event.event_type,"nprm.observation");
  assert.equal(result.event.extensions.nprm.feedback_mode,"associative");
  assert.deepEqual(result.event.extensions.nprm.paths,["semantic","poetic"]);
});

test("rejects unsupported feedback modes and paths",()=>{
  const input=sample();
  input.feedback.mode="invented";
  input.feedback.paths=["unbounded"];
  const result=adaptNPRMToZPCL(input);
  assert.equal(result.ok,false);
  assert.ok(result.errors.length>=2);
});

test("adapter does not invent evaluation features",()=>{
  const result=adaptNPRMToZPCL(sample());
  assert.deepEqual(result.event.features,{});
  const evaluated=evaluateZPCL(result.event);
  assert.equal(evaluated.total_loss,null);
  assert.equal(evaluated.decision,"OBSERVE");
});

test("missing confirmation is not interpreted as permission to explore",()=>{
  const result=adaptNPRMToZPCL(sample());
  assert.equal(result.event.extensions.nprm.user_confirmation,false);
});
