# ZHI Ontology Dictionary V1.0 — Draft Contract

**Status:** implementation-aligned draft contract  
**Applies to:** `model.html` in `feat/ontology-dictionary-studio`  
**Purpose:** document what the offline prototype currently emits, and what a future backend must not assume.

## 1. Current behavior

The browser form creates a JSON draft in page memory. It does not call a model, write to Supabase, or persist records across refreshes. Downloading exports the current generated draft; it does not register the record in a shared dictionary.

Every generated ontology record includes:

- `schema_version`: `ZHI-Ontology-Dictionary-V1.0`
- `id`, `ontology_type`, `label`, `description`
- `state` (defaults to `unknown` when blank)
- `epistemic_status`
- `evidence` and `source_refs`
- `event_time`, `observed_at`, `recorded_at`
- `validity.from` and `validity.to`
- `revision`
- `access_policy: draft-local-only`
- `retention_policy: not-persisted`
- `relations` (zero or one relation in the current form)
- `lifecycle.transition: CREATE`, `lifecycle.status: candidate`, `lifecycle.requires_validation: true`
- `verification_status: not-validated`

The offline cognition loop is a separate in-memory experiment record; it is not an ontology record and is not evidence of model reasoning.

## 2. Validation rules implemented in the form

1. Stable ID is required and must match `^[A-Za-z][A-Za-z0-9_-]{1,99}$`.
2. Label is required.
3. Revision must be an integer greater than zero.
4. If a relation type is selected, both source and target entity IDs are required.
5. Self-relations are rejected by default.
6. An ontology record of type `Relation` requires a relation type and endpoints.
7. Selecting epistemic status `verified` requires a source reference, but a source reference alone does **not** prove that the claim was independently verified.
8. If both validity endpoints are supplied, the end cannot precede the start.

These are client-side draft guards, not a security boundary. Any backend must validate submitted JSON again.

## 3. Epistemic and time semantics

The UI distinguishes `observed`, `reported`, `verified`, `inferred`, `hypothesis`, `unknown`, and `conflicted`.

- `event_time`: when the described event occurred, if known.
- `observed_at`: when the observation occurred, if known.
- `recorded_at`: when this browser generated the draft.
- `validity.from/to`: the interval during which the assertion is intended to apply.

Empty optional time fields are exported as `null`. Times supplied by browser-local date/time controls are normalized to ISO timestamps.

## 4. Known limitations — do not infer more than implemented

- The form currently models at most one relation per record; `relation_id` is derived as `rel_` plus the record ID.
- The `verified` status is guarded by presence of a source reference only. There is no source resolver, provenance review, or independent verification service.
- The `lifecycle` values are draft metadata, not a running lifecycle engine.
- The `revision` field is user-entered metadata for an ontology draft; the cognition loop has its own in-memory revision sequence.
- There is no cross-session persistence, authentication, authorization, audit log, server-side schema enforcement, deduplication, or concurrency control.
- The prototype's tests cover selected behavior in Chromium; they are not a complete visual regression, security review, or production-readiness assessment.

## 5. Minimum requirements before backend integration

Before any service stores these records, define and test:

1. A canonical JSON Schema (or equivalent typed server contract), including allowed ontology types and epistemic statuses.
2. Server-side validation of IDs, relation endpoints, timestamps, validity ranges, and schema version.
3. An explicit stable identifier and uniqueness policy for relations, including whether multiple relations per record are supported.
4. Provenance rules that distinguish a supplied citation from a reviewed/verified source.
5. Authentication, authorization, retention/deletion, audit history, and conflict/merge behavior.
6. A migration/versioning policy for future schema versions.
7. Integration tests against a non-production environment before any production writes.

**Release boundary:** this document describes the current prototype and future integration requirements. It does not claim that the backend contract or any persistent data layer has been implemented.
