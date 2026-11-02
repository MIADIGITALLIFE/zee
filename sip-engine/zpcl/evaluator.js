/**
 * ZHI-ZPCL-TECH-001 aligned evaluator.
 * Deterministic scoring only: no model, network, persistence, or agent mutation.
 * Missing values remain unavailable; they are never silently converted to zero.
 */
export const ZPCL_VERSION = "1.0.0";
export const DIMENSION_WEIGHTS = Object.freeze({
  grounding: 0.25, discovery: 0.15, agency: 0.15,
  continuity: 0.15, creativity: 0.10, evolution: 0.10
});
const WEIGHT_SUM = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
const clamp = (v) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
const mean = (xs) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const isScore = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const unavailable = (reason="missing_input") => ({ loss:null, confidence:null, status:"unavailable", reason });

function dimension(loss, confidence=1) {
  if (!Number.isFinite(loss)) return unavailable("critical_input_missing");
  return { loss:Number(clamp(loss).toFixed(6)), confidence:Number(clamp(confidence).toFixed(6)), status:"evaluated" };
}
function read(obj, key) {
  if (!obj || !Object.hasOwn(obj,key) || !isScore(obj[key])) return null;
  return obj[key];
}
function scoreDimension(inputs, formula, requiredKeys) {
  const vals = requiredKeys.map(k => read(inputs,k));
  if (vals.some(v => v === null)) return unavailable("required_score_unavailable");
  return dimension(formula(...vals));
}

export function evaluateZPCL(event, config={}) {
  const errors=[];
  if (!event || typeof event !== "object") return {schema_version:"1.0", status:"INVALID", errors:["event must be an object"]};
  if (event.schema_version !== "1.0") errors.push("schema_version must be 1.0");
  if (!event.event_id) errors.push("event_id is required");
  if (!event.agent_id) errors.push("agent_id is required");
  if (!event.timestamp || !/(Z|[+-]\d{2}:?\d{2})$/.test(event.timestamp) || Number.isNaN(Date.parse(event.timestamp))) errors.push("timestamp must be ISO 8601 with an explicit timezone");
  if (!event.event_type) errors.push("event_type is required");
  if (!event.source || !event.source.type || !event.source.id) errors.push("source.type and source.id are required");
  if (!event.payload || typeof event.payload.observation !== "string") errors.push("payload.observation is required");
  if (!event.idempotency_key) errors.push("idempotency_key is required");
  if (errors.length) return {schema_version:"1.0", event_id:event.event_id??null, agent_id:event.agent_id??null, status:"INVALID", errors};

  // Ratings are supplied by a separately versioned feature/annotation stage.
  // This module does not pretend to extract semantic features by itself.
  const f=event.features || {};
  const groundingIn=f.grounding || {};
  const discoveryIn=f.discovery || {};
  const agencyIn=f.agency || {};
  const continuityIn=f.continuity || {};
  const creativityIn=f.creativity || {};
  const evolutionIn=f.evolution || {};

  const groundingKeys=["evidenceQualityLoss","factInferenceConfusionLoss","confidenceCalibrationLoss","correctionFailureLoss","memoryProvenanceLoss"];
  const groundingWeights=[0.30,0.25,0.20,0.15,0.10];
  const g=groundingKeys.map(k=>read(groundingIn,k));
  const grounding=g.some(v=>v===null)?unavailable("one_or_more_grounding_inputs_unavailable")
    :dimension(g.reduce((s,v,i)=>s+v*groundingWeights[i],0), read(groundingIn,"confidence") ?? 0.5);

  const ig=read(discoveryIn,"informationGain");
  const igRef=read(discoveryIn,"igReference");
  const relevance=read(discoveryIn,"relevance");
  const quality=read(discoveryIn,"evidenceQuality");
  const novelty=read(discoveryIn,"novelty");
  const discoveryVals=[ig,igRef,relevance,quality,novelty];
  const discovery=discoveryVals.some(v=>v===null)||igRef===0
    ? unavailable("information_gain_model_or_reference_unavailable")
    : dimension(1-Math.min(ig/igRef,1)*relevance*quality*novelty, read(discoveryIn,"confidence")??0.5);

  const agencyKeys=["problemDiscovery","planQuality","feedbackAdaptation","explorationEffectiveness"];
  const agencyWeights=[0.25,0.25,0.30,0.20];
  const av=agencyKeys.map(k=>read(agencyIn,k));
  const agency=av.some(v=>v===null)?unavailable("agency_evidence_unavailable")
    :dimension(1-av.reduce((s,v,i)=>s+v*agencyWeights[i],0),read(agencyIn,"confidence")??0.5);

  const continuityKeys=["identityLoss","stateTransitionLoss","relationshipContextLoss","memoryContinuityLoss"];
  const continuityWeights=[0.30,0.25,0.25,0.20];
  const cv=continuityKeys.map(k=>read(continuityIn,k));
  const continuity=cv.some(v=>v===null)?unavailable("continuity_evidence_unavailable")
    :dimension(cv.reduce((s,v,i)=>s+v*continuityWeights[i],0),read(continuityIn,"confidence")??0.5);

  const creativityKeys=["novelty","crossDimensionQuality","applicationValue","explainability"];
  const cr=creativityKeys.map(k=>read(creativityIn,k));
  const creativity=cr.some(v=>v===null)?unavailable("critical_creativity_input_unavailable")
    :dimension(1-cr.reduce((a,b)=>a*b,1),read(creativityIn,"confidence")??0.5);

  const evolutionKeys=["retention","transfer","reproducibility","correctionUpdate"];
  const ev=evolutionKeys.map(k=>read(evolutionIn,k));
  const evolution=ev.some(v=>v===null)?unavailable("longitudinal_evidence_unavailable")
    :dimension(1-(0.30*ev[0]+0.25*ev[1]+0.25*ev[2]+0.20*ev[3]),read(evolutionIn,"confidence")??0.5);

  const dimensions={grounding,discovery,agency,continuity,creativity,evolution};
  const criticalMissing=Object.entries(dimensions).filter(([,v])=>v.status!=="evaluated").map(([k])=>k);
  const weights=config.dimension_weights || DIMENSION_WEIGHTS;
  const configuredSum=Object.values(weights).reduce((a,b)=>a+b,0);
  const validWeights=Object.keys(DIMENSION_WEIGHTS).every(k=>Number.isFinite(weights[k])&&weights[k]>=0)
    && Math.abs(configuredSum-WEIGHT_SUM)<1e-9;
  const totalLoss=criticalMissing.length||!validWeights?null:
    Object.entries(weights).reduce((s,[k,w])=>s+w*dimensions[k].loss,0)/WEIGHT_SUM;

  const safetyInput=f.safety || {};
  const safetyChecks=["authorization","dataIntegrity","privacy","productionWriteRestrictions","resourceBudget","personalityBaselineProtection","rollbackCapability"];
  const checks=safetyInput.checks || {};
  const failedChecks=safetyChecks.filter(k=>checks[k]===false);
  const missingChecks=safetyChecks.filter(k=>checks[k]!==true && checks[k]!==false);
  const blocked=(Array.isArray(safetyInput.violations)&&safetyInput.violations.length>0)||failedChecks.length>0||safetyInput.status==="BLOCK";
  const warned=(Array.isArray(safetyInput.warnings)&&safetyInput.warnings.length>0)||missingChecks.length>0||safetyInput.status==="WARN"||!["PASS","WARN","BLOCK"].includes(safetyInput.status);
  const safetyGate=blocked?"BLOCK":warned?"WARN":"PASS";
  const decision=blocked?"REJECT":warned||criticalMissing.length?"OBSERVE":totalLoss<=0.20?"CREATE_SEED":"OBSERVE";

  return {
    schema_version:"1.0",
    evaluation_id:event.evaluation_id || null,
    event_id:event.event_id,
    agent_id:event.agent_id,
    evaluated_at:new Date().toISOString(),
    evaluator_version:"zpcl-1.0.0",
    dimensions,
    total_loss:totalLoss===null?null:Number(totalLoss.toFixed(6)),
    total_loss_status:criticalMissing.length?"incomplete":validWeights?"evaluated":"invalid_weights",
    safety_gate:safetyGate,
    decision,
    reason_codes:[
      ...criticalMissing.map(k=>"DIMENSION_UNAVAILABLE:"+k.toUpperCase()),
      ...(blocked?["SAFETY_HARD_BLOCK"]:[]),
      ...(warned?["SAFETY_WARNING"]:[]),
      ...failedChecks.map(k=>"SAFETY_CHECK_FAILED:"+k.toUpperCase()),
      ...missingChecks.map(k=>"SAFETY_CHECK_UNAVAILABLE:"+k.toUpperCase()),
      ...(totalLoss===null?["TOTAL_LOSS_NOT_COMPUTED"]:[])
    ],
    metadata:{
      dimension_weights:weights,
      normalized_soft_weight_sum:WEIGHT_SUM,
      missing_dimensions:criticalMissing,
      shadow_mode:config.shadow_mode!==false,
      personality_mutation:false,
      persistence:false
    }
  };
}

export function createCognitiveSeed(event, evaluation) {
  if (!event || !evaluation || evaluation.safety_gate!=="PASS" || evaluation.decision!=="CREATE_SEED" || evaluation.total_loss===null) {
    return {created:false, reason:"evaluation_incomplete_or_blocked"};
  }
  return {
    created:true,
    seed:{
      schema_version:"1.0",
      seed_id:null,
      agent_id:event.agent_id,
      created_at:event.timestamp,
      status:"hypothesized",
      stage:"S2",
      observation:{
        content:event.payload.observation,
        source_event_ids:[event.event_id],
        evidence_ids:event.provenance?.evidence_ids || []
      },
      hypothesis:{
        content:event.payload.hypothesis || null,
        confidence:read(event.features?.discovery||{},"confidence")
      },
      evaluation:{
        total_loss:evaluation.total_loss,
        dimensions:evaluation.dimensions,
        evaluator_version:evaluation.evaluator_version
      },
      verification:{method:"repeat_observation",status:"pending",results:[]},
      related_dimensions:[],
      resource_budget:{max_attempts:5,max_cost_units:10},
      history:[],
      version:1
    }
  };
}
