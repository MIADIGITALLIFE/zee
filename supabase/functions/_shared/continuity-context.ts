export type TrustedMemory = {
  id: string;
  claim: string;
  memory_type: string;
  evidence_summary: string;
  confidence: number | null;
  confidence_basis: string;
  current_version: number;
  updated_at: string;
};

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Defense-in-depth allow-list. The database query also filters these states;
 * this second check prevents an unexpected row from entering the prompt.
 */
export function normalizeTrustedMemories(rows: unknown): TrustedMemory[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> =>
      !!row && typeof row === "object" &&
      row.lifecycle_status === "trusted" &&
      row.verification_status === "verified"
    )
    .map((row) => ({
      id: boundedText(row.id, 80),
      claim: boundedText(row.claim, 1800),
      memory_type: boundedText(row.memory_type, 80) || "knowledge",
      evidence_summary: boundedText(row.evidence_summary, 1200),
      confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.max(0, Math.min(1, row.confidence))
        : null,
      confidence_basis: boundedText(row.confidence_basis, 1000),
      current_version: Number.isInteger(row.current_version) && Number(row.current_version) > 0
        ? Number(row.current_version)
        : 1,
      updated_at: boundedText(row.updated_at, 64),
    }))
    .filter((memory) => memory.id && memory.claim)
    .slice(0, 16);
}

/**
 * Load only explicitly trusted, independently verified memories belonging to
 * this agent and the authenticated ZHI admin/owner. Episodic chat logs remain
 * a separate context stream and are never promoted here automatically.
 */
export async function loadTrustedMemories(
  db: any,
  agentId: string,
  ownerUserId: string,
): Promise<{ memories: TrustedMemory[]; error: string | null }> {
  const { data, error } = await db
    .from("cognitive_memories")
    .select("id,claim,memory_type,lifecycle_status,verification_status,evidence_summary,confidence,confidence_basis,current_version,updated_at")
    .eq("agent_id", agentId)
    .eq("owner_user_id", ownerUserId)
    .eq("lifecycle_status", "trusted")
    .eq("verification_status", "verified")
    .order("updated_at", { ascending: false })
    .limit(16);

  if (error) {
    return { memories: [], error: String(error.message || "trusted memory query failed") };
  }
  return { memories: normalizeTrustedMemories(data), error: null };
}
