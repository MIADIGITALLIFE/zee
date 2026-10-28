import { createClient } from "npm:@supabase/supabase-js@2";
import Ajv2020 from "npm:ajv@8/dist/2020.js";
import addFormats from "npm:ajv-formats@3";
import schema from "../../../schemas/zhi-ontology-draft-v1.schema.json" with {
  type: "json",
};
import { prepareOntologyCreate } from "../_shared/ontology-create-pipeline.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MAX_BODY_BYTES = 64 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

const ajv = new Ajv2020.default({ allErrors: true, strict: true });
addFormats.default(ajv);
const validateSchema = ajv.compile(schema);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "AUTH_CONFIGURATION_MISSING" }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return json({ error: "AUTHENTICATION_REQUIRED" }, 401);

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(
    token,
  );
  if (authError || !user) return json({ error: "INVALID_AUTHENTICATION" }, 401);

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: "REQUEST_TOO_LARGE" }, 413);
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "INVALID_REQUEST_BODY" }, 400);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: "REQUEST_TOO_LARGE" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "REQUEST_NOT_OBJECT" }, 400);
  }
  const record = (body as Record<string, unknown>).record;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return json({
      ok: false,
      stage: "request",
      issues: [{
        code: "RECORD_REQUIRED",
        path: "$.record",
        message: "Provide a JSON object in the record field.",
      }],
    }, 400);
  }

  const result = prepareOntologyCreate(record, user.id, (payload) => {
    const valid = validateSchema(payload);
    if (valid) return [];
    return (validateSchema.errors ?? []).map((issue) => ({
      code: "SCHEMA_INVALID",
      path: issue.instancePath || "$",
      message: issue.message ?? "Schema validation failed.",
    }));
  });

  if (!result.ok) {
    const status = result.stage === "request" &&
        result.issues.some((issue) => issue.code === "AUTHENTICATION_REQUIRED")
      ? 401
      : 400;
    return json(
      { ok: false, stage: result.stage, issues: result.issues },
      status,
    );
  }

  // Validation-only endpoint: return status only; never return or persist a candidate.
  return json({
    ok: true,
    validation_status: "valid-for-review",
    persistence: "not-performed",
    owner_assignment: "server-derived-not-persisted",
    schema_version: "ZHI-Ontology-Dictionary-V1.0",
  });
});
