import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MAX_BODY_BYTES = 32 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nonEmpty(value: unknown, max = 4000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return json({ error: "Server authentication is not configured" }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const accessToken = authorization.slice(7).trim();
  if (!accessToken) return json({ error: "Authentication required" }, 401);

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !user) return json({ error: "Invalid or expired session" }, 401);

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: "Request body too large" }, 413);
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Request body too large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "JSON object required" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { seed_id, request_key, claim, evidence_summary, confidence_basis } = body;
  if (!isUuid(seed_id) || !isUuid(request_key)) {
    return json({ error: "seed_id and request_key must be UUIDs" }, 400);
  }
  if (!nonEmpty(claim, 4000) || !nonEmpty(evidence_summary, 4000) ||
      !nonEmpty(confidence_basis, 2000)) {
    return json({ error: "claim, evidence_summary and confidence_basis are required" }, 400);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The owner filter is mandatory even though the service-role client bypasses RLS.
  const { data: seed, error: seedError } = await db.from("cognitive_seeds")
    .select("id,agent_id,owner_user_id,stage,safety_status,version,provenance,evidence_refs,independently_verified_by,independently_verified_at,independent_verification_ref")
    .eq("id", seed_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (seedError) {
    console.error("CMM seed lookup failed", seedError.message);
    return json({ error: "Unable to validate source seed" }, 500);
  }
  if (!seed) return json({ error: "Source seed not found" }, 404);
  if (seed.stage !== "S3") return json({ error: "Only S3 seeds may request trusted-memory admission", code: "SEED_NOT_S3" }, 409);
  if (seed.safety_status !== "PASS") return json({ error: "Safety status must be PASS", code: "SAFETY_NOT_PASS" }, 409);
  if (!Array.isArray(seed.provenance) || seed.provenance.length === 0 ||
      !Array.isArray(seed.evidence_refs) || seed.evidence_refs.length === 0) {
    return json({ error: "Seed provenance and evidence references are required", code: "EVIDENCE_REQUIRED" }, 409);
  }
  if (!isUuid(seed.independently_verified_by) ||
      seed.independently_verified_by === user.id ||
      !seed.independently_verified_at ||
      !nonEmpty(seed.independent_verification_ref, 2000)) {
    return json({ error: "Independent verification is missing or invalid", code: "INDEPENDENT_VERIFICATION_REQUIRED" }, 409);
  }

  // Verification metadata is not sufficient by itself: require a matching,
  // append-only audit record whose decision is explicitly verified.
  const { data: verification, error: verificationError } = await db.from("cmm_verification_audit")
    .select("id,decision,verifier_user_id,seed_version,resulting_seed_version")
    .eq("verification_ref", seed.independent_verification_ref)
    .eq("seed_id", seed.id)
    .eq("owner_user_id", user.id)
    .eq("agent_id", seed.agent_id)
    .eq("verifier_user_id", seed.independently_verified_by)
    .or(`resulting_seed_version.eq.${seed.version},and(resulting_seed_version.is.null,seed_version.eq.${seed.version})`)
    .eq("decision", "verified")
    .maybeSingle();

  if (verificationError) {
    console.error("CMM verification audit lookup failed", verificationError.message);
    return json({ error: "Unable to validate independent verification" }, 500);
  }
  if (!verification) {
    return json({ error: "A matching successful independent verification audit is required", code: "VERIFICATION_AUDIT_REQUIRED" }, 409);
  }

  const proposalPayload = {
    claim: claim.trim(),
    evidence_summary: evidence_summary.trim(),
    confidence_basis: confidence_basis.trim(),
    source_seed_stage: seed.stage,
    source_seed_version: seed.version,
    independent_verification: {
      verifier_id: seed.independently_verified_by,
      verified_at: seed.independently_verified_at,
      evidence_ref: seed.independent_verification_ref,
    },
  };

  const { data: proposal, error: insertError } = await db.from("memory_proposals")
    .insert({
      agent_id: seed.agent_id,
      owner_user_id: user.id,
      proposal_type: "consolidate",
      source_seed_ids: [seed.id],
      payload: proposalPayload,
      evidence_refs: seed.evidence_refs,
      safety_status: "PASS",
      status: "pending_review",
      created_by: user.id,
      request_key,
    })
    .select("id,status,created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing } = await db.from("memory_proposals")
        .select("id,status,created_at")
        .eq("owner_user_id", user.id)
        .eq("request_key", request_key)
        .maybeSingle();
      if (existing) return json({ ok: true, idempotent_replay: true, proposal: existing });
    }
    console.error("CMM proposal insert failed", insertError.message);
    return json({ error: "Unable to create memory proposal" }, 500);
  }

  return json({ ok: true, proposal }, 201);
});
