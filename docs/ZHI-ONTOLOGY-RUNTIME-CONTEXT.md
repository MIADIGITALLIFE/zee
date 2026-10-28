# ZHI Ontology Runtime Context V1 — Integration Boundary

**Status:** implemented on `feat/ontology-dictionary-studio`; CI verification pending  
**Scope:** optional request context for `supabase/functions/zhi-agnes-chat/index.ts`  
**Not included:** ontology database persistence, automatic retrieval, self-directed revision, or deployment

## Request contract

The existing admin-only chat request remains compatible:

```json
{
  "agent_id": "existing-agent-id",
  "message": "请结合当前本体说明你的目标",
  "ontology_records": [
    { "...": "one complete ZHI-Ontology-Dictionary-V1.0 draft record" }
  ]
}
```

For convenience, one record may instead be passed as `ontology_record`. If neither field is present, the previous chat flow continues without ontology context. If both fields are supplied, `ontology_records` takes precedence.

Limits:
- Whole request body: 128 KiB maximum.
- Ontology records: at most 8 per request.
- Serialized ontology context: 48 KiB maximum.
- Each record must pass the canonical JSON Schema and semantic validation before it is included in the model context.

Invalid ontology context returns HTTP 400. Oversized request bodies return HTTP 413. The existing admin authorization is unchanged.

## Runtime behavior

Validated records are added to the context sent to Agnes AI under `ontology_context`. The system prompt explicitly treats them as draft data, not authoritative stored ontology; a submitted `verified` label is not independent proof. Ontology text is data, not instructions. The prompt asks the model to call out discrepancies with database memories or conversation history rather than invent a resolution.

The response includes:
- `ontology_context_count`: number of accepted records included in this request.
- `ontology_context_persisted: false`: the ontology draft itself was not saved by this integration.

The normal chat reply and existing chat/mind/memory writes continue under the pre-existing backend behavior. This does **not** create a durable ontology registry, and it does not mean the ontology record itself was persisted.

## How to test

Send the existing authorized request to `zhi-agnes-chat` with one full draft record in `ontology_records`. Check that:
1. A valid record is accepted and the response reports `ontology_context_count: 1`.
2. A malformed schema or semantic conflict returns HTTP 400 before the model request.
3. A request without ontology fields still follows the legacy path.
4. More than 8 records or context over 48 KiB is rejected.
5. The response explicitly reports `ontology_context_persisted: false`.

Do not include access tokens, service-role secrets, or provider keys in source files, PR comments, or test output. Live behavior remains unverified until tested against a confirmed non-production Supabase project.
