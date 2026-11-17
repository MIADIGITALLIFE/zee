import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const teacher = readFileSync(new URL("../supabase/functions/science-teacher/index.ts", import.meta.url), "utf8");
const tutor = readFileSync(new URL("../supabase/functions/science-ai-tutor/index.ts", import.meta.url), "utf8");
const portal = readFileSync(new URL("../science/index.html", import.meta.url), "utf8");

assert.match(teacher, /evidenceBackedAverage < 60/, "Low supported mastery must select foundation practice");
assert.match(teacher, /evidenceBackedAverage < 80/, "Developing supported mastery must select guided practice");
assert.match(teacher, /target_band: "stretch"/, "Strong supported mastery must select stretch practice");
assert.match(teacher, /isTest \? 4 : adaptivePlan\.difficulty_min/, "Practice adapts while tests keep fixed difficulty");
assert.match(teacher, /mode: "independent_test"/, "Independent tests must remain standardised");
assert.match(tutor, /adaptive_guidance:/, "Tutor must receive an evidence-derived teaching strategy");
assert.match(tutor, /Never lower expectations permanently/, "Adaptation must be temporary and revisable");
assert.match(tutor, /const adaptation = \{ mode:/, "Tutor must report the selected teaching mode");
assert.match(portal, /Teaching approach:/, "Student portal must show the current teaching approach");
console.log("ZEE Science adaptive teaching V4 safeguards passed.");
