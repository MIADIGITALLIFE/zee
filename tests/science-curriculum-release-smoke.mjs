import assert from "node:assert/strict";
import fs from "node:fs";

const path = "supabase/migrations/20261116020000_science_p5_curriculum_release.sql";
const sql = fs.readFileSync(path, "utf8");
const match = sql.match(/\\$seed\\$([\\s\\S]*?)\\$seed\\$/);
assert.ok(match, "P5 curriculum migration must contain a delimited JSON seed");

const units = JSON.parse(match[1]);
assert.equal(units.length, 10, "P5 release must contain 10 units");
assert.equal(new Set(units.map(x => x.topic)).size, 5, "P5 release must cover five distinct topic areas");
assert.deepEqual([...new Set(units.map(x => x.track))].sort(), ["FOUNDATION", "STANDARD"]);
assert.equal(new Set(units.map(x => x.code)).size, 10, "Unit codes must be unique");

const sourceRefs = [];
for (const unit of units) {
  assert.ok(unit.outcome_text?.trim(), unit.code + ": outcome text is required");
  assert.ok(Array.isArray(unit.objectives) && unit.objectives.length >= 2, unit.code + ": learning objectives are required");
  assert.ok(unit.teaching_content?.sections?.length >= 3, unit.code + ": at least three teaching sections are required");
  assert.ok(unit.summary_blueprint?.key_takeaways?.length >= 2, unit.code + ": summary takeaways are required");
  assert.equal(unit.questions?.length, 6, unit.code + ": each unit must have six assessment items");
  for (const question of unit.questions) {
    assert.equal(question.question_type, "MCQ", unit.code + ": this release expects MCQs only");
    assert.ok(question.prompt?.question?.trim(), unit.code + ": question prompt is required");
    assert.equal(question.options?.length, 4, unit.code + ": each MCQ must have four options");
    const optionIds = question.options.map(x => x.id);
    assert.equal(new Set(optionIds).size, 4, unit.code + ": option IDs must be unique");
    assert.ok(optionIds.includes(String(question.answer_key?.correct_option)), unit.code + ": answer key must point to a valid option");
    assert.ok(question.source_reference, unit.code + ": source reference is required");
    sourceRefs.push(question.source_reference);
  }
}
assert.equal(sourceRefs.length, 60, "Release must contain 60 MCQs");
assert.equal(new Set(sourceRefs).size, 60, "Question source references must be unique");
console.log("P5 curriculum release gate passed: 10 units, 5 topics, 60 MCQs, both tracks.");
