import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SCIENCE_ALLOWED_ORIGIN") ?? "https://miadigitallife.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Body = { action?: string; student_id?: string; lesson_id?: string; session_id?: string; attempt_id?: string;
  passed?: boolean; answers?: Array<{ question_id: string; response: unknown }> };

const transitions: Record<string, string[]> = {
  TEACHING: ["UNDERSTANDING_CHECK"],
  UNDERSTANDING_CHECK: ["TEACHING", "PRACTICE"],
  PRACTICE: ["TEACHING", "TESTING"],
  TESTING: ["SUMMARY"],
  SUMMARY: ["ANALYSIS"],
  ANALYSIS: ["COMPLETED"],
  COMPLETED: [],
  PAUSED: ["TEACHING", "PRACTICE", "TESTING", "SUMMARY", "ANALYSIS"],
};

function publicQuestion(q: Record<string, unknown>) {
  return { id: q.id, question_type: q.question_type, difficulty: q.difficulty,
    prompt: q.prompt, options: q.options, marks: q.marks };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  if (!URL || !SERVICE) return reply({ error: "Science service is not configured" }, 503);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401);
  const token = auth.slice(7);
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData.user) return reply({ error: "Invalid session" }, 401);

  let body: Body;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 64 * 1024) return reply({ error: "Request too large" }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: "Invalid JSON body" }, 400); }

  const action = String(body.action ?? "");
  const studentId = String(body.student_id ?? "");
  if (!studentId) return reply({ error: "student_id is required" }, 400);
  const { data: student, error: studentError } = await admin.from("science_students")
    .select("id,guardian_user_id,level,track,active_syllabus_version_id,status")
    .eq("id", studentId).eq("guardian_user_id", userData.user.id).eq("status", "active").maybeSingle();
  if (studentError || !student) return reply({ error: "Student not found" }, 404);

  const logEvent = async (event: Record<string, unknown>) => {
    const { error } = await admin.from("science_learning_events").insert({
      student_id: studentId, ...event,
    });
    if (error) throw error;
  };
  const getSession = async () => {
    const sessionId = String(body.session_id ?? "");
    if (!sessionId) throw new Error("session_id is required");
    const { data, error } = await admin.from("science_lesson_sessions").select("*")
      .eq("id", sessionId).eq("student_id", studentId).maybeSingle();
    if (error || !data) throw new Error("Lesson session not found");
    return data;
  };
  const transition = async (session: Record<string, any>, next: string) => {
    const allowed = transitions[String(session.current_stage)] ?? [];
    if (!allowed.includes(next)) throw new Error(`Invalid stage transition: ${session.current_stage} -> ${next}`);
    const update: Record<string, unknown> = { current_stage: next, last_activity_at: new Date().toISOString() };
    if (next === "COMPLETED") {
      update.session_status = "completed";
      update.completed_at = new Date().toISOString();
    }
    const { error } = await admin.from("science_lesson_sessions").update(update).eq("id", session.id);
    if (error) throw error;
  };

  try {
    if (action === "start_lesson") {
      const lessonId = String(body.lesson_id ?? "");
      if (!lessonId) return reply({ error: "lesson_id is required" }, 400);
      const { data: lesson, error: lessonError } = await admin.from("science_lessons")
        .select("id,syllabus_version_id,level,track,title,topic,learning_objectives,teaching_content,practice_blueprint,test_blueprint,summary_blueprint")
        .eq("id", lessonId).eq("level", student.level).in("track", ["ALL", student.track])
        .eq("status", "published").maybeSingle();
      if (lessonError || !lesson) return reply({ error: "Published lesson not found for this learner" }, 404);
      const { data: syllabus } = await admin.from("science_syllabus_versions").select("id,status")
        .eq("id", lesson.syllabus_version_id).eq("status", "published").maybeSingle();
      if (!syllabus) return reply({ error: "The lesson syllabus version is not published" }, 409);
      const { data: session, error } = await admin.from("science_lesson_sessions").insert({
        student_id: studentId, lesson_id: lessonId, syllabus_version_id: lesson.syllabus_version_id,
        current_stage: "TEACHING", session_status: "in_progress",
      }).select("*").single();
      if (error) throw error;
      await logEvent({ session_id: session.id, lesson_id: lessonId, event_type: "lesson_started",
        stage: "TEACHING", evidence: { syllabus_version_id: lesson.syllabus_version_id } });
      return reply({ ok: true, session, lesson });
    }

    if (action === "resume_session") {
      const session = await getSession();
      const { data: lesson, error } = await admin.from("science_lessons").select(
        "id,title,topic,learning_objectives,teaching_content,practice_blueprint,test_blueprint,summary_blueprint"
      ).eq("id", session.lesson_id).maybeSingle();
      if (error || !lesson) return reply({ error: "Lesson not found" }, 404);
      return reply({ ok: true, session, lesson, resumed: true });
    }

    const session = await getSession();
    if (action === "complete_teaching") {
      if (session.current_stage !== "TEACHING") return reply({ error: "Teaching stage is not active" }, 409);
      await transition(session, "UNDERSTANDING_CHECK");
      await logEvent({ session_id: session.id, lesson_id: session.lesson_id, event_type: "teaching_completed",
        stage: "TEACHING", evidence: { completed: true } });
      return reply({ ok: true, next_stage: "UNDERSTANDING_CHECK" });
    }

    if (action === "submit_understanding_check") {
      if (session.current_stage !== "UNDERSTANDING_CHECK") return reply({ error: "Understanding check is not active" }, 409);
      const passed = body.passed === true;
      const next = passed ? "PRACTICE" : "TEACHING";
      await transition(session, next);
      await logEvent({ session_id: session.id, lesson_id: session.lesson_id, event_type: "understanding_check",
        stage: "UNDERSTANDING_CHECK", evidence: { passed } });
      return reply({ ok: true, passed, next_stage: next,
        feedback: passed ? "Good understanding. Continue to practice." : "Let's revisit the explanation before practising." });
    }

    if (action === "get_practice" || action === "start_test") {
      const isTest = action === "start_test";
      const expectedStage = isTest ? "PRACTICE" : "PRACTICE";
      if (session.current_stage !== expectedStage) return reply({ error: `Expected ${expectedStage} stage` }, 409);
      if (isTest) {
        const { count } = await admin.from("science_assessment_attempts").select("id", { count: "exact", head: true })
          .eq("session_id", session.id).eq("assessment_type", "PRACTICE").in("status", ["scored", "review_required"]);
        if (!count || count < 1) return reply({ error: "Complete at least one practice attempt before testing" }, 409);
      }
      const { data: questions, error } = await admin.from("science_question_bank")
        .select("id,question_type,difficulty,prompt,options,marks")
        .eq("lesson_id", session.lesson_id).eq("status", "published")
        .eq("level", student.level).in("track", ["ALL", student.track])
        .order("difficulty").limit(isTest ? 20 : 10);
      if (error) throw error;
      if (!questions?.length) return reply({ error: "No published questions are available for this lesson" }, 404);
      if (isTest) await transition(session, "TESTING");
      const { data: attempt, error: attemptError } = await admin.from("science_assessment_attempts").insert({
        student_id: studentId, session_id: session.id,
        assessment_type: isTest ? "FORMATIVE_TEST" : "PRACTICE",
        status: "in_progress",
        total_marks: questions.reduce((sum: number, q: any) => sum + Number(q.marks), 0),
      }).select("id,assessment_type,status,total_marks").single();
      if (attemptError) throw attemptError;
      return reply({ ok: true, attempt, questions: questions.map(publicQuestion), stage: isTest ? "TESTING" : "PRACTICE" });
    }

    if (action === "submit_practice" || action === "submit_test") {
      const isTest = action === "submit_test";
      const stage = isTest ? "TESTING" : "PRACTICE";
      if (session.current_stage !== stage) return reply({ error: `Expected ${stage} stage` }, 409);
      const answers = Array.isArray(body.answers) ? body.answers : [];
      if (!answers.length || answers.length > 30) return reply({ error: "Provide between 1 and 30 answers" }, 400);
      const ids = [...new Set(answers.map(a => String(a.question_id ?? "")))];
      if (ids.some(id => !id)) return reply({ error: "Every answer needs a question_id" }, 400);
      const { data: questions, error: qError } = await admin.from("science_question_bank").select("*")
        .in("id", ids).eq("lesson_id", session.lesson_id).eq("status", "published");
      if (qError) throw qError;
      if (!questions || questions.length !== ids.length) return reply({ error: "One or more questions are invalid" }, 400);
      let awarded = 0, total = 0, needsReview = false;
      const attemptType = isTest ? "FORMATIVE_TEST" : "PRACTICE";
      const attemptId = String(body.attempt_id ?? "");
      if (!attemptId) return reply({ error: "attempt_id from the practice/test question response is required" }, 400);
      const { data: attempt, error: aError } = await admin.from("science_assessment_attempts")
        .select("id,assessment_type,status").eq("id", attemptId).eq("student_id", studentId)
        .eq("session_id", session.id).eq("assessment_type", attemptType).maybeSingle();
      if (aError || !attempt || attempt.status !== "in_progress") {
        return reply({ error: "Assessment attempt not found or already submitted" }, 404);
      }
      for (const answer of answers) {
        const q = questions.find((item: any) => item.id === answer.question_id);
        const max = Number(q.marks);
        total += max;
        let mark: number | null = null;
        let method: string | null = null;
        let confidence: number | null = null;
        if (q.question_type === "MCQ" && q.answer_key && typeof q.answer_key === "object" &&
            Object.hasOwn(q.answer_key, "correct_option")) {
          mark = String((answer.response as any)?.option_id ?? "") === String(q.answer_key.correct_option) ? max : 0;
          method = "deterministic";
          confidence = 1;
          awarded += mark;
        } else {
          needsReview = true;
          method = "human_review";
        }
        const { error: insertError } = await admin.from("science_assessment_answers").insert({
          attempt_id: attempt.id, question_id: q.id, response: answer.response,
          awarded_marks: mark, max_marks: max, marking_method: method,
          confidence, marking_rationale: mark === null ? "Requires rubric-based review." : "Deterministic MCQ key comparison.",
        });
        if (insertError) throw insertError;
      }
      const status = needsReview ? "review_required" : "scored";
      const pct = total ? Math.round(awarded / total * 10000) / 100 : 0;
      const { error: updateError } = await admin.from("science_assessment_attempts").update({
        status, awarded_marks: needsReview ? null : awarded, score_percent: needsReview ? null : pct,
        scoring_version: "zee-science-marking-v1", submitted_at: new Date().toISOString(),
        scored_at: needsReview ? null : new Date().toISOString(),
      }).eq("id", attemptId);
      if (updateError) throw updateError;
      await logEvent({ session_id: session.id, lesson_id: session.lesson_id,
        event_type: isTest ? "test_submitted" : "practice_attempt", stage,
        evidence: { attempt_id: attempt.id, status, score_percent: needsReview ? null : pct } });
      return reply({ ok: true, attempt_id: attemptId, status, score_percent: needsReview ? null : pct,
        awarded_marks: needsReview ? null : awarded, total_marks: total,
        message: needsReview ? "Some answers require rubric or teacher review; no unverified AI score was assigned." : "Answers marked." });
    }

    if (action === "get_summary") {
      if (session.current_stage !== "TESTING") return reply({ error: "Complete the test before requesting a summary" }, 409);
      const { count: submittedTests } = await admin.from("science_assessment_attempts")
        .select("id", { count: "exact", head: true }).eq("session_id", session.id)
        .eq("assessment_type", "FORMATIVE_TEST").in("status", ["scored", "review_required"]);
      if (!submittedTests || submittedTests < 1) return reply({ error: "Submit the independent test before generating the summary" }, 409);
      const { data: attempts } = await admin.from("science_assessment_attempts")
        .select("assessment_type,status,score_percent,awarded_marks,total_marks")
        .eq("session_id", session.id);
      const { data: events } = await admin.from("science_learning_events")
        .select("event_type,stage,evidence,occurred_at").eq("session_id", session.id).order("occurred_at");
      const { data: lesson } = await admin.from("science_lessons")
        .select("title,topic,learning_objectives,summary_blueprint").eq("id", session.lesson_id).single();
      const summary = { lesson_title: lesson?.title, topic: lesson?.topic,
        learning_objectives: lesson?.learning_objectives ?? [],
        key_points: lesson?.summary_blueprint ?? {},
        assessment_results: attempts ?? [], learning_activity: events ?? [],
        note: "This summary reflects recorded lesson content and attempts. Items awaiting review are not treated as scored." };
      const { error } = await admin.from("science_lesson_summaries").upsert({
        student_id: studentId, session_id: session.id, summary_content: summary,
        generated_from_event_ids: [],
      }, { onConflict: "session_id" });
      if (error) throw error;
      await transition(session, "SUMMARY");
      await logEvent({ session_id: session.id, lesson_id: session.lesson_id, event_type: "summary_generated",
        stage: "SUMMARY", evidence: { generated: true } });
      return reply({ ok: true, summary, next_stage: "SUMMARY" });
    }

    if (action === "get_analysis") {
      if (session.current_stage !== "SUMMARY") return reply({ error: "Generate the summary before analysis" }, 409);
      const { data: attempts } = await admin.from("science_assessment_attempts")
        .select("id,assessment_type,status,score_percent").eq("session_id", session.id);
      const scored = (attempts ?? []).filter((a: any) => a.status === "scored" && a.score_percent !== null);
      const avg = scored.length ? scored.reduce((s: number,a: any)=>s+Number(a.score_percent),0)/scored.length : null;
      const analysis = { dimensions: { knowledge: avg, understanding: "requires evidence review",
          application: "requires transfer questions", scientific_thinking: "requires explanation and data questions",
          communication: "requires structured-response review" },
        strengths: avg !== null && avg >= 80 ? ["Strong performance on objectively marked questions"] : [],
        learning_gaps: (attempts ?? []).some((a: any)=>a.status === "review_required")
          ? ["Some written responses require rubric or teacher review"] : avg !== null && avg < 70 ? ["Revisit lesson concepts and practise again"] : [],
        recommended_actions: avg === null ? ["Complete reviewed written-answer marking before drawing a mastery conclusion"]
          : avg < 70 ? ["Return to targeted teaching and retry practice"] : ["Schedule a delayed-recall check before confirming mastery"],
        confidence: avg === null ? 0.2 : 0.55, evidence: attempts ?? [],
        disclaimer: "A single lesson score is not a mastery determination." };
      const { error } = await admin.from("science_learning_analyses").insert({
        student_id: studentId, session_id: session.id, analysis_type: "LESSON",
        dimensions: analysis.dimensions, strengths: analysis.strengths,
        learning_gaps: analysis.learning_gaps, recommended_actions: analysis.recommended_actions,
        confidence: analysis.confidence, evidence_event_ids: [],
      });
      if (error) throw error;
      await transition(session, "ANALYSIS");
      await logEvent({ session_id: session.id, lesson_id: session.lesson_id, event_type: "analysis_generated",
        stage: "ANALYSIS", evidence: { confidence: analysis.confidence } });
      return reply({ ok: true, analysis, next_stage: "ANALYSIS" });
    }

    if (action === "complete_lesson") {
      if (session.current_stage !== "ANALYSIS") return reply({ error: "Analysis must be completed first" }, 409);
      await transition(session, "COMPLETED");
      return reply({ ok: true, status: "completed" });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("science-teacher request failed", error instanceof Error ? error.message : "unknown");
    return reply({ error: error instanceof Error ? error.message : "Internal server error" }, 400);
  }
});
