import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextReview } from "../supabase/functions/_shared/science-spaced-repetition.ts";

const day = 86400000;
const now = new Date("2026-11-17T00:00:00.000Z");
const firstWrong = nextReview(null, 40, now);
assert.equal(firstWrong.interval_days, 1);
assert.equal(firstWrong.repetitions, 0);
assert.equal(firstWrong.lapses, 1);
assert.equal(new Date(firstWrong.due_at).getTime(), now.getTime() + day);

const firstCorrect = nextReview(null, 100, now);
assert.equal(firstCorrect.interval_days, 1);
assert.equal(firstCorrect.repetitions, 1);
const secondCorrect = nextReview(firstCorrect, 90, now);
assert.equal(secondCorrect.interval_days, 3);
assert.equal(secondCorrect.repetitions, 2);
const weakRecall = nextReview(secondCorrect, 65, now);
assert.equal(weakRecall.interval_days, 1);
assert.equal(weakRecall.repetitions, 0);
assert.equal(weakRecall.lapses, 1);
assert.ok(weakRecall.ease_factor < secondCorrect.ease_factor);
const teacher = readFileSync(new URL("../supabase/functions/science-teacher/index.ts", import.meta.url), "utf8");
assert.match(teacher, /science_student_revision_schedule/, "Schedule writes and reads must be server-side");
assert.match(teacher, /deterministic_practice|deterministic_test/, "Only objectively marked evidence may schedule revision");
assert.match(teacher, /get_revision_queue/, "Learners need a due-review retrieval action");
console.log("ZEE Science spaced repetition V5 safeguards passed.");
