import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../science/index.html", import.meta.url), "utf8");
assert.match(html, /ZEE SCIENCE/);
assert.match(html, /Teaching|Let's learn/);
assert.match(html, /Let's practise/);
assert.match(html, /Independent test/);
assert.match(html, /Your lesson summary/);
assert.match(html, /learning evidence tells us/);
assert.match(html, /create_student/);
assert.match(html, /list_students/);
assert.match(html, /get_dashboard/);
assert.doesNotMatch(html, /SUPABASE_SERVICE_ROLE_KEY|AGNES_API_KEY/);

const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(moduleScript, "Expected a module script");
const javascript = moduleScript[1].replace(/^import .*;\s*/m, "");
new Function(javascript);

const curriculumSql = readFileSync(new URL("../supabase/migrations/20261116020000_science_p5_curriculum_release.sql", import.meta.url), "utf8");
const seedStartToken = "jsonb_array_elements($seed$";
const seedStart = curriculumSql.indexOf(seedStartToken);
const seedEnd = curriculumSql.indexOf("$seed$::jsonb)", seedStart + seedStartToken.length);
assert.ok(seedStart >= 0 && seedEnd > seedStart, "Expected embedded P5 curriculum seed");
const curriculum = JSON.parse(curriculumSql.slice(seedStart + seedStartToken.length, seedEnd));
assert.equal(curriculum.length, 10, "Expected five P5 topics for Standard and Foundation");
assert.equal(curriculum.reduce((n, lesson) => n + lesson.questions.length, 0), 60, "Expected 60 P5 assessment items");
assert.equal(new Set(curriculum.map(x => x.topic)).size, 5, "Expected all five official P5 topic areas");
for (const lesson of curriculum) {
  assert.ok(["STANDARD", "FOUNDATION"].includes(lesson.track));
  assert.ok(lesson.outcome_text.length > 40);
  assert.ok(lesson.source.includes("MOE 2023 syllabus"));
  assert.ok(lesson.teaching_content.sections.length >= 3);
  assert.ok(lesson.questions.some(q => q.difficulty <= 3), "Expected practice questions");
  assert.ok(lesson.questions.some(q => q.difficulty >= 4), "Expected independent-test questions");
  for (const question of lesson.questions) {
    assert.equal(question.question_type, "MCQ");
    assert.equal(question.options.length, 4);
    assert.ok(question.answer_key.correct_option !== undefined);
  }
}
assert.match(curriculumSql, /verification_status='verified'/);
assert.match(curriculumSql, /status='published'/);

console.log("ZEE Science portal and P5 curriculum smoke tests passed.");
