import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261117010000_science_longitudinal_memory_v3.sql", import.meta.url), "utf8");
const tutor = readFileSync(new URL("../supabase/functions/science-ai-tutor/index.ts", import.meta.url), "utf8");
const teacher = readFileSync(new URL("../supabase/functions/science-teacher/index.ts", import.meta.url), "utf8");

assert.match(migration, /science_student_learning_profiles/, "Longitudinal learner profile table must exist");
assert.match(migration, /science_student_memory_evidence/, "Evidence ledger must exist");
assert.match(migration, /enable row level security/gi, "Both memory tables must enable RLS");
assert.match(migration, /guardians read own science learning profiles/, "Profiles must be guardian scoped");
assert.match(migration, /guardians read own science memory evidence/, "Evidence must be guardian scoped");
assert.match(migration, /revoke all on public\.science_student_learning_profiles, public\.science_student_memory_evidence from anon, authenticated/i,
  "Clients must not write learner memory directly");
assert.match(tutor, /longitudinal_learning_profile/, "AI tutor must receive longitudinal learner context");
assert.match(tutor, /evidence_kind: "tutor_observation"/, "AI observations must enter the evidence ledger");
assert.match(tutor, /evidence_status: "candidate"/, "AI observations must remain tentative");
assert.match(teacher, /evidence_kind: isTest \? "deterministic_test" : "deterministic_practice"/,
  "Deterministically marked assessment answers must become traceable evidence");
assert.match(teacher, /attemptSet\.size >= 3 && distinctDays >= 2 && testRows\.length >= 1/,
  "Supported mastery must require repeated attempts across days and independent test evidence");
assert.match(teacher, /average !== null && average >= 80 && testAverage !== null && testAverage >= 80/,
  "Supported mastery must meet the performance threshold");
console.log("ZEE Science longitudinal memory security and evidence tests passed.");
