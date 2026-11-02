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
function isText(value: unknown, max = 4000): value is string {
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
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return json({ error: "Request body too large" }, 413);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: "Request body too large" }, 413);

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "JSON object required" }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body.action === "grant_verifier" || body.action === "revoke_verifier") {
    const { agent_id, verifier_user_id } = body;
    if (!isUuid(agent_id) || !isUuid(verifier_user_id)) return json({ error: "agent_id and verifier_user_id must be UUIDs" }, 400);
    if (verifier_user_id === user.id) return json({ error: "Owner cannot appoint themselves as independent verifier" }, 403);

    // Confirm the target is a real Auth user before creating an assignment.
    const { data: target, error: targetError } = await db.auth.admin.getUserById(verifier_user_id);
    if (targetError || !target.user) return json({ error: "Verifier account not found" }, 404);

    const { data, error } = await db.rpc("cmm_set_verifier_assignment", {
      p_actor_id: user.id,
      p_agent_id: agent_id,
      p_verifier_user_id: verifier_user_id,
      p_action: body.action === "grant_verifier" ? "grant" : "revoke",
    });
    if (error) {
      console.error("CMM verifier assignment failed", error.message);
      return json({ error: "Unable to update verifier assignment", code: error.code }, error.code === "42501" ? 403 : 409);
    }
    return json({ ok: true, assignment: data });
  }

  if (body.action === "verify_seed") {
    const { seed_id, evidence_checks, rationale } = body;
    if (!isUuid(seed_id) || !Array.isArray(evidence_checks) || evidence_checks.length < 1 ||
        !isText(rationale, 4000)) {
      return json({ error: "seed_id, evidence_checks and rationale are required" }, 400);
    }
    if (evidence_checks.length > 100) return json({ error: "Too many evidence checks" }, 413);

    const { data, error } = await db.rpc("cmm_record_seed_verification", {
      p_verifier_user_id: user.id,
      p_seed_id: seed_id,
      p_evidence_checks: evidence_checks,
      p_rationale: rationale.trim(),
    });
    if (error) {
      console.error("CMM seed verification rejected", error.message);
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
      return json({ error: "Verification could not be recorded", code: error.code }, status);
    }
    return json({ ok: true, verification: data });
  }

  return json({ error: "Unsupported action" }, 400);
});
