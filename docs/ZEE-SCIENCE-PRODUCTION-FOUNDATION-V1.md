# ZEE Science — Production Foundation V1

## Product contract

Every lesson must implement the complete learning loop:

1. Teaching — explicit explanation mapped to verified MOE learning outcomes.
2. Practice — scaffolded exercises with adaptive difficulty and misconception feedback.
3. Testing — independent assessment with answer keys kept server-side.
4. Summary — a learner-specific recap grounded in the lesson and submitted work.
5. Analysis — evidence-based strengths, gaps, confidence, and next actions.
6. Memory — append learning events and mastery evidence; resume across sessions.
7. Adapt — schedule the next lesson or targeted revision.

A lesson is not complete merely because the student viewed content. The orchestrator must enforce stage transitions and route repeated misconceptions back to targeted teaching.

## Repository and runtime boundaries

- Existing ZEE brain and `zhi-agnes-chat` remain unchanged.
- Science data is isolated under `science_*` tables.
- Existing Cognitive Memory Manager remains the authoritative long-term agent-memory system. Science learning records are student learning data, not automatically trusted personality memories.
- Edge Functions must authenticate the guardian/student session, verify student ownership, and use service-role credentials only server-side.
- Never expose question answer keys, rubrics, provider API keys, or service-role keys to the browser.
- GitHub Pages publishes static assets only. Supabase migrations and Edge Functions require their own deployment workflow.

## Data model

The additive migration `20261116000000_science_learning_platform.sql` creates:
- Versioned syllabus and learning outcomes.
- Lesson definitions and a server-only question bank.
- Guardian-scoped student profiles.
- Lesson sessions and append-oriented learning events.
- Assessment attempts and server-only answer records.
- Per-session summaries and evidence-based analyses.
- Mastery evidence and revision queue.

An official MOE 2023 P3–P6 syllabus source has now been identified and registered as a draft version. Its P5 topic overview is documented in `ZEE-SCIENCE-CURRICULUM-GOVERNANCE.md`. The full outcome-by-outcome import, original PDF formatting for Foundation exclusions, and cohort mapping still require review before publication. Do not mark the draft syllabus as published or claim every topic applies to Foundation.

## Mastery policy

Mastery is not a raw percentage. Store evidence across independent testing, explanation, application, data interpretation, delayed recall, and transfer. A mastery decision must include confidence and evidence references. One answer or one lesson cannot permanently label a learner.

## Release plan

### Release 0 — database foundation
- Review migration.
- Apply to the intended Supabase project.
- Verify RLS using two guardian accounts.
- Verify question-bank answer keys are inaccessible to anon/authenticated roles.

### Release 1 — teaching orchestrator
- Add `science-teacher` Edge Function.
- Actions: `start_lesson`, `submit_understanding_check`, `get_practice`, `submit_practice`, `start_test`, `submit_test`, `get_summary`, `get_analysis`, `resume_session`.
- Validate every transition server-side.
- Route all writes through the service role after ownership checks.
- Integrate with ZEE/Agnes through a server-side provider adapter; do not loosen the admin-only access policy on `zhi-agnes-chat`.

### Release 2 — P5 classroom
- Populate only syllabus outcomes verified against the applicable official MOE syllabus PDF.
- Add Standard/Foundation scope only where the source specifies it.
- Build English-first student UI and the five lesson stages.
- Validate objective marking, rubric marking, and human-review escalation.

### Release 3 — family dashboard and P1–P6
- Add guardian progress view, revision planner, and family controls.
- Expand the curriculum only after source verification for each level and cohort.

## Acceptance gates

- [ ] Migration applies cleanly to the intended Supabase project.
- [ ] RLS blocks cross-family reads and all direct client writes.
- [ ] Browser cannot query answer keys or rubrics.
- [ ] A lesson can be resumed on another device under the same guardian account.
- [ ] All five lesson stages produce durable records.
- [ ] A low-confidence or inconsistent assessment is routed to review/diagnosis.
- [ ] Mastery requires multiple evidence types and delayed reassessment.
- [ ] The P5 lesson content is traceable to official MOE source pages.
- [ ] GitHub Pages and Supabase deployments are verified independently.
