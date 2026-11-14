import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeTrustedMemories } from "./continuity-context.ts";

Deno.test("only trusted and verified memories enter long-term context", () => {
  const memories = normalizeTrustedMemories([
    {
      id: "trusted-1", claim: "A durable fact", memory_type: "knowledge",
      lifecycle_status: "trusted", verification_status: "verified",
      evidence_summary: "Reviewed evidence", confidence: 0.92,
      confidence_basis: "Two independent sources", current_version: 3,
      updated_at: "2026-11-14T00:00:00Z",
    },
    {
      id: "pending-1", claim: "An unreviewed proposal",
      lifecycle_status: "pending_review", verification_status: "pending",
    },
    {
      id: "disputed-1", claim: "A disputed claim",
      lifecycle_status: "disputed", verification_status: "verified",
    },
  ]);
  assertEquals(memories.length, 1);
  assertEquals(memories[0].id, "trusted-1");
  assertEquals(memories[0].confidence, 0.92);
});

Deno.test("malformed rows are ignored and confidence is bounded", () => {
  const memories = normalizeTrustedMemories([
    null,
    { id: "missing-claim", lifecycle_status: "trusted", verification_status: "verified" },
    {
      id: "trusted-2", claim: "Bounded confidence",
      lifecycle_status: "trusted", verification_status: "verified",
      confidence: 5, current_version: -1,
    },
  ]);
  assertEquals(memories.length, 1);
  assertEquals(memories[0].confidence, 1);
  assertEquals(memories[0].current_version, 1);
});
