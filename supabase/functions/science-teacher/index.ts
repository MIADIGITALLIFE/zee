import { createClient } from "npm:@supabase/supabase-js@2";
import { nextReview } from "../_shared/science-spaced-repetition.ts";

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
  passed?: boolean; revision_id?: string; answers?: Array<{ question_id: string; response: unknown }> };

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

  if (action === "list_students") {
    const { data, error } = await admin.from("science_students")
      .select("id,display_name,level,track,cohort_year,status,created_at")
      .eq("guardian_user_id", userData.user.id).eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) return reply({ error: "Could not load student profiles" }, 500);
    return reply({ ok: true, students: data ?? [] });
  }

  if (action === "create_student") {
    const name = String((body as any).display_name ?? "").trim().slice(0, 80);
    const level = String((body as any).level ?? "");
    const track = String((body as any).track ?? "STANDARD");
    const cohort = Number((body as any).cohort_year);
    if (!name || !["P1","P2","P3","P4","P5","P6"].includes(level) ||
        !["STANDARD","FOUNDATION","UNCONFIRMED"].includes(track)) {
      return reply({ error: "A display name, valid primary level, and track are required" }, 400);
    }
    if (Number.isFinite(cohort) && cohort > 0 && (cohort < 2010 || cohort > 2100)) {
      return reply({ error: "Invalid cohort year" }, 400);
    }
    const { data, error } = await admin.from("science_students").insert({
      guardian_user_id: userData.user.id, display_name: name, level, track,
      cohort_year: Number.isFinite(cohort) && cohort > 0 ? cohort : null,
    }).select("id,display_name,level,track,cohort_year,status").single();
    if (error) return reply({ error: "Could not create student profile" }, 500);
    return reply({ ok: true, student: data });
  }

  if (!studentId) return reply({ error: "student_id is required" }, 400);
  const { data: student, error: studentError } = await admin.from("science_students")
    .select("id,guardian_user_id,level,track,cohort_year,active_syllabus_version_id,status")
    .eq("id", studentId).eq("guardian_user_id", userData.user.id).eq("status", "active").maybeSingle();
  if (studentError || !student) return reply({ error: "Student not found" }, 404);

  const logEvent = async (event: Record<string, unknown>) => {
    const { error } = await admin.from("science_learning_events").insert({
      student_id: studentId, ...event,
    });
    if (error) throw error;
  };

  if (action === "list_lessons") {
    if (["P3","P4","P5","P6"].includes(student.level) && student.cohort_year === null) {
      return reply({ ok: true, lessons: [], curriculum_status: "cohort_year_required",
        message: "Enter the year the learner started Primary 1 so ZEE can resolve the applicable MOE syllabus cohort." });
    }
    if (["P3","P4","P5","P6"].includes(student.level) && Number(student.cohort_year) + 2 < 2023) {
      return reply({ ok: true, lessons: [], curriculum_status: "legacy_syllabus_not_loaded",
        message: "This learner belongs to an earlier syllabus cohort. The matching legacy syllabus has not yet been imported." });
    }
    if (["P1","P2"].includes(student.level)) {
      return reply({ ok: true, lessons: [], curriculum_status: "zee_explorers_pathway_pending",
        message: "P1–P2 Science Explorers is a ZEE-designed pathway, not the MOE P3–P6 Primary Science syllabus." });
    }
    const { data, error } = await admin.from("science_lessons")
      .select("id,level,track,title,topic,lesson_order,learning_objectives,syllabus_version_id")
      .eq("level", student.level).in("track", student.track === "UNCONFIRMED" ? ["ALL","STANDARD","FOUNDATION"] : ["ALL", student.track])
      .eq("status", "published").order("lesson_order");
    if (error) return reply({ error: "Could not load published lessons" }, 500);
    const visible = [];
    for (const lesson of data ?? []) {
      const { data: syllabus } = await admin.from("science_syllabus_versions")
        .select("id").eq("id", lesson.syllabus_version_id).eq("status", "published").maybeSingle();
      if (syllabus) visible.push(lesson);
    }
    return reply({ ok: true, lessons: visible, curriculum_status: visible.length ? "available" : "awaiting_verified_curriculum" });
  }

  if (action === "get_dashboard" || action === "get_revision_queue") {
    const { data: revisionSchedule, error: revisionError } = await admin.from("science_student_revision_schedule")
      .select("id,outcome_id,lesson_id,interval_days,repetitions,lapses,last_score,last_reviewed_at,due_at,status,outcome:science_learning_outcomes(outcome_code,outcome_text,topic)")
      .eq("student_id", studentId).eq("status", "pending").order("due_at").limit(30);
    if (revisionError) return reply({ error: "Could not load the revision schedule" }, 500);
    const now = Date.now();
    const revisionsDue = (revisionSchedule ?? []).map((item: any) => ({ ...item,
      is_due: new Date(item.due_at).getTime() <= now }));
    if (action === "get_revision_queue") return reply({ ok: true, revisions: revisionsDue });
    const [{ data: sessions }, { data: analyses }, { data: revisions }] = await Promise.all([
      admin.from("science_lesson_sessions").select("id,lesson_id,current_stage,session_status,started_at,last_activity_at,completed_at")
        .eq("student_id", studentId).order("last_activity_at", { ascending: false }).limit(10),
      admin.from("science_learning_analyses").select("id,analysis_type,strengths,learning_gaps,recommended_actions,confidence,created_at")
        .eq("student_id", studentId).order("created_at", { ascending: false }).limit(5),
      admin.from("science_revision_queue").select("id,outcome_id,due_at,reason,priority,status")
        .eq("student_id", studentId).eq("status", "pending").order("due_at").limit(10),
    ]);
    return reply({ ok: true, sessions: sessions ?? [], analyses: analyses ?? [],
      revisions: revisions ?? [], revision_schedule: revisionsDue });
  }
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
    if (action === "start_revision") {
      const revisionId = String(body.revision_id ?? "");
      if (!revisionId) return reply({ error: "revision_id is required" }, 400);
      const { data: revision, error: revisionError } = await admin.from("science_student_revision_schedule")
        .select("id,outcome_id,lesson_id,due_at,status,outcome:science_learning_outcomes(outcome_code,outcome_text,topic)")
        .eq("id", revisionId).eq("student_id", studentId).eq("status", "pending").maybeSingle();
      if (revisionError || !revision) return reply({ error: "Revision task not found" }, 404);
      if (new Date(revision.due_at).getTime() > Date.now()) return reply({ error: "This review is scheduled for a later date." }, 409);
      const { data: lesson, error: lessonError } = await admin.from("science_lessons")
        .select("id,syllabus_version_id,level,track,title,topic,learning_objectives,teaching_content")
        .eq("id", revision.lesson_id).eq("level", student.level).in("track", ["ALL", student.track])
        .eq("status", "published").maybeSingle();
      if (lessonError || !lesson) return reply({ error: "The original lesson is no longer available." }, 404);
      const { data: questions, error: questionError } = await admin.from("science_question_bank")
        .select("id,outcome_id,question_type,difficulty,prompt,options,marks")
        .eq("lesson_id", lesson.id).eq("outcome_id", revision.outcome_id)
        .eq("level", student.level).in("track", ["ALL", student.track])
        .eq("status", "published").eq("question_type", "MCQ").gte("difficulty", 1).lte("difficulty", 3).limit(5);
      if (questionError) throw questionError;
      if (!questions?.length) return reply({ error: "There are no multiple-choice review questions for this learning outcome yet." }, 409);
      const { data: session, error: sessionError } = await admin.from("science_lesson_sessions").insert({
        student_id: studentId, lesson_id: lesson.id, syllabus_version_id: lesson.syllabus_version_id,
        current_stage: "PRACTICE", session_status: "in_progress",
        metadata: { mode: "spaced_revision", revision_id: revision.id, outcome_id: revision.outcome_id },
      }).select("*").single();
      if (sessionError) throw sessionError;
      const { data: attempt, error: attemptError } = await admin.from("science_assessment_attempts").insert({
        student_id: studentId, session_id: session.id, assessment_type: "PRACTICE", status: "in_progress",
        question_ids: questions.map((q: any) => q.id),
        total_marks: questions.reduce((sum: number, q: any) => sum + Number(q.marks), 0),
      }).select("id,assessment_type,status,total_marks,question_ids").single();
      if (attemptError) throw attemptError;
      await logEvent({ session_id: session.id, lesson_id: lesson.id, outcome_id: revision.outcome_id,
        event_type: "practice_attempt", stage: "PRACTICE", evidence: { revision_id: revision.id, mode: "spaced_revision" } });
      return reply({ ok: true, session, lesson, attempt, questions: questions.map(publicQuestion),
        revision: { id: revision.id, outcome: revision.outcome } });
    }
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
    if (action === "get_saved_summary") {
      const { data, error } = await admin.from("science_lesson_summaries")
        .select("summary_content,created_at").eq("session_id", session.id)
        .eq("student_id", studentId).maybeSingle();
      if (error || !data) return reply({ error: "Saved lesson summary not found" }, 404);
      return reply({ ok: true, summary: data.summary_content, created_at: data.created_at });
    }

    if (action === "get_saved_analysis") {
      const { data, error } = await admin.from("science_learning_analyses")
        .select("dimensions,strengths,learning_gaps,recommended_actions,confidence,created_at")
        .eq("session_id", session.id).eq("student_id", studentId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error || !data) return reply({ error: "Saved learning analysis not found" }, 404);
      return reply({ ok: true, analysis: data });
    }

    if (action === "resume_assessment") {
      const { data: attempt } = await admin.from("science_assessment_attempts")
        .select("id,assessment_type,status,total_marks,question_ids")
        .eq("session_id", session.id).eq("student_id", studentId)
        .eq("status", "in_progress").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!attempt) return reply({ ok: true, attempt: null, questions: [] });
      const { data: questions, error } = await admin.from("science_question_bank")
        .select("id,question_type,difficulty,prompt,options,marks")
        .in("id", attempt.question_ids ?? []).eq("status", "published");
      if (error) throw error;
      return reply({ ok: true, attempt, questions: (questions ?? []).map(publicQuestion) });
    }

    if (action === "get_test_state") {
      const { data: attempt } = await admin.from("science_assessment_attempts")
        .select("id,status,score_percent,assessment_type")
        .eq("session_id", session.id).eq("student_id", studentId)
        .eq("assessment_type", "FORMATIVE_TEST")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return reply({ ok: true, submitted: !!attempt && attempt.status !== "in_progress",
        attempt: attempt ?? null });
    }

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
      const { data: questionPool, error: poolError } = await admin.from("science_question_bank")
        .select("id,outcome_id,question_type,difficulty,prompt,options,marks")
        .eq("lesson_id", session.lesson_id).eq("status", "published")
        .eq("level", student.level).in("track", ["ALL", student.track])
        .order("difficulty").limit(100);
      if (poolError) throw poolError;
      if (!questionPool?.length) return reply({ error: "No published questions are available for this lesson" }, 404);

      const relevantOutcomeIds = [...new Set(questionPool.map((q: any) => q.outcome_id).filter(Boolean))];
      let adaptivePlan = { mode: "baseline", target_band: "foundation", difficulty_min: 1, difficulty_max: 3,
        reason: "No reliable evidence for this lesson's learning outcomes is available yet." };
      if (!isTest && relevantOutcomeIds.length) {
        const { data: profileRow, error: profileError } = await admin.from("science_student_learning_profiles")
          .select("profile").eq("student_id", studentId).maybeSingle();
        if (profileError) throw profileError;
        const mastery = profileRow?.profile?.topic_mastery && typeof profileRow.profile.topic_mastery === "object"
          ? profileRow.profile.topic_mastery as Record<string, Record<string, unknown>> : {};
        const supported = relevantOutcomeIds.map((id) => mastery[id]).filter((m) =>
          m && m.state === "supported" && Number.isFinite(Number(m.average_performance)));
        const evidenceBackedAverage = supported.length
          ? supported.reduce((sum, m) => sum + Number(m.average_performance), 0) / supported.length : null;
        if (evidenceBackedAverage !== null && evidenceBackedAverage < 60) {
          adaptivePlan = { mode: "adaptive", target_band: "foundation", difficulty_min: 1, difficulty_max: 2,
            reason: "Evidence for this lesson suggests rebuilding core concepts before increasing challenge." };
        } else if (evidenceBackedAverage !== null && evidenceBackedAverage < 80) {
          adaptivePlan = { mode: "adaptive", target_band: "developing", difficulty_min: 2, difficulty_max: 3,
            reason: "Evidence for this lesson supports guided application with a gradual increase in challenge." };
        } else if (evidenceBackedAverage !== null) {
          adaptivePlan = { mode: "adaptive", target_band: "stretch", difficulty_min: 3, difficulty_max: 4,
            reason: "Repeated evidence for this lesson supports more demanding application questions." };
        }
      }
      let selectedQuestions = questionPool.filter((q: any) => Number(q.difficulty) >= (isTest ? 4 : adaptivePlan.difficulty_min) &&
        Number(q.difficulty) <= (isTest ? 5 : adaptivePlan.difficulty_max));
      if (!selectedQuestions.length && !isTest) {
        // Sparse banks should not block learning: widen to the safe baseline practice band.
        selectedQuestions = questionPool.filter((q: any) => Number(q.difficulty) >= 1 && Number(q.difficulty) <= 3);
        adaptivePlan = { mode: "baseline_fallback", target_band: "mixed", difficulty_min: 1, difficulty_max: 3,
          reason: "The lesson question bank has too few items in the personalised band; a mixed foundational set is used instead." };
      }
      const questions = selectedQuestions.slice(0, isTest ? 20 : 10);
      if (!questions.length) return reply({ error: "No published questions are available in the selected difficulty band. Please ask your teacher to add suitable questions." }, 404);
      if (isTest) await transition(session, "TESTING");
      const { data: attempt, error: attemptError } = await admin.from("science_assessment_attempts").insert({
        student_id: studentId, session_id: session.id,
        assessment_type: isTest ? "FORMATIVE_TEST" : "PRACTICE",
        status: "in_progress",
        question_ids: questions.map((q: any) => q.id),
        total_marks: questions.reduce((sum: number, q: any) => sum + Number(q.marks), 0),
      }).select("id,assessment_type,status,total_marks,question_ids").single();
      if (attemptError) throw attemptError;
      return reply({ ok: true, attempt, questions: questions.map(publicQuestion), stage: isTest ? "TESTING" : "PRACTICE",
        adaptive_plan: isTest ? { mode: "independent_test", target_band: "assessment", difficulty_min: 4, difficulty_max: 5,
          reason: "Independent test difficulty remains standardised and is not adjusted." } : adaptivePlan });
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
        .select("id,assessment_type,status,question_ids").eq("id", attemptId).eq("student_id", studentId)
        .eq("session_id", session.id).eq("assessment_type", attemptType).maybeSingle();
      if (aError || !attempt || attempt.status !== "in_progress") {
        return reply({ error: "Assessment attempt not found or already submitted" }, 404);
      }
      const rawIssuedIds: unknown[] = Array.isArray(attempt.question_ids) ? attempt.question_ids : [];
      const issuedIds: string[] = [...new Set<string>(rawIssuedIds.map((id: unknown) => String(id)))].sort();
      const submittedIds = [...ids].sort();
      if (issuedIds.length !== submittedIds.length ||
          issuedIds.some((id: string, index: number) => id !== submittedIds[index])) {
        return reply({ error: "Submitted answers must match the exact question set issued for this attempt" }, 400);
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
        if (method === "deterministic" && mark !== null && q.outcome_id) {
          const { error: memoryError } = await admin.from("science_student_memory_evidence").insert({
            student_id: studentId, session_id: session.id, lesson_id: session.lesson_id,
            outcome_id: q.outcome_id, source_attempt_id: attempt.id,
            evidence_kind: isTest ? "deterministic_test" : "deterministic_practice",
            evidence_status: "candidate", performance: Math.round((mark / max) * 10000) / 100,
            confidence: 1, observation: isTest ? "Independently answered a deterministic assessment item." : "Answered a deterministic practice item.",
            evidence_detail: { question_id: q.id, question_type: q.question_type, difficulty: q.difficulty,
              assessment_type: attemptType, marking_method: method },
          });
          if (memoryError) console.error("Science mastery evidence could not be persisted", memoryError.message);
        }
      }
      // V5: schedule outcome-level reviews from deterministic MCQ evidence only.
      // Unmarked written answers never influence a review interval.
      const outcomeScores = new Map<string, { awarded: number; maximum: number }>();
      for (const answer of answers) {
        const q = questions.find((item: any) => item.id === answer.question_id);
        if (!q?.outcome_id || q.question_type !== "MCQ" || !q.answer_key ||
            typeof q.answer_key !== "object" || !Object.hasOwn(q.answer_key, "correct_option")) continue;
        const max = Number(q.marks);
        const correct = String((answer.response as any)?.option_id ?? "") === String(q.answer_key.correct_option);
        const current = outcomeScores.get(q.outcome_id) ?? { awarded: 0, maximum: 0 };
        current.awarded += correct ? max : 0;
        current.maximum += max;
        outcomeScores.set(q.outcome_id, current);
      }
      for (const [outcomeId, score] of outcomeScores) {
        const { data: previous, error: previousError } = await admin.from("science_student_revision_schedule")
          .select("interval_days,repetitions,lapses,ease_factor")
          .eq("student_id", studentId).eq("outcome_id", outcomeId).maybeSingle();
        if (previousError) throw previousError;
        const next = nextReview(previous, score.maximum ? score.awarded / score.maximum * 100 : 0);
        const { error: scheduleError } = await admin.from("science_student_revision_schedule").upsert({
          student_id: studentId, outcome_id: outcomeId, lesson_id: session.lesson_id,
          source_attempt_id: attempt.id, ...next, last_reviewed_at: new Date().toISOString(),
          status: "pending", updated_at: new Date().toISOString(),
        }, { onConflict: "student_id,outcome_id" });
        if (scheduleError) throw scheduleError;
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

      // Rebuild outcome-level memory from the auditable evidence ledger.
      const outcomeIds = [...new Set(questions.map((q: any) => q.outcome_id).filter(Boolean))] as string[];
      for (const outcomeId of outcomeIds) {
        const { data: ledger, error: ledgerError } = await admin.from("science_student_memory_evidence")
          .select("source_attempt_id,evidence_kind,performance,observed_at")
          .eq("student_id", studentId).eq("outcome_id", outcomeId)
          .in("evidence_kind", ["deterministic_practice","deterministic_test"])
          .order("observed_at", { ascending: false }).limit(30);
        if (ledgerError) { console.error("Could not aggregate outcome evidence", ledgerError.message); continue; }
        const rows = ledger ?? [];
        const attemptSet = new Set(rows.map((row: any) => row.source_attempt_id).filter(Boolean));
        const testRows = rows.filter((row: any) => row.evidence_kind === "deterministic_test");
        const scoredRows = rows.filter((row: any) => row.performance !== null);
        const average = scoredRows.length
          ? scoredRows.reduce((sum: number, row: any) => sum + Number(row.performance), 0) / scoredRows.length : null;
        const testAverage = testRows.length
          ? testRows.reduce((sum: number, row: any) => sum + Number(row.performance), 0) / testRows.length : null;
        const distinctDays = new Set(scoredRows.map((row: any) => String(row.observed_at).slice(0, 10))).size;
        const supported = attemptSet.size >= 3 && distinctDays >= 2 && testRows.length >= 1 &&
          average !== null && average >= 80 && testAverage !== null && testAverage >= 80;
        if (supported) {
          await admin.from("science_student_memory_evidence").update({ evidence_status: "supported" })
            .eq("student_id", studentId).eq("outcome_id", outcomeId)
            .in("evidence_kind", ["deterministic_practice","deterministic_test"]);
        }
        const { data: profileRow } = await admin.from("science_student_learning_profiles")
          .select("profile,profile_version,evidence_count").eq("student_id", studentId).maybeSingle();
        const profile = profileRow?.profile && typeof profileRow.profile === "object"
          ? profileRow.profile as Record<string, any> : {};
        const mastery = profile.topic_mastery && typeof profile.topic_mastery === "object"
          ? { ...profile.topic_mastery } : {};
        mastery[outcomeId] = { state: supported ? "supported" : "candidate",
          evidence_count: rows.length, distinct_attempts: attemptSet.size,
          independent_test_evidence: testRows.length, average_performance: average === null ? null : Math.round(average),
          confidence: supported ? 0.85 : Math.min(0.7, 0.25 + attemptSet.size * 0.1),
          updated_at: new Date().toISOString() };
        const { count: totalMemoryCount } = await admin.from("science_student_memory_evidence")
          .select("id", { count: "exact", head: true }).eq("student_id", studentId);
        await admin.from("science_student_learning_profiles").upsert({
          student_id: studentId, profile_version: 1, profile: { ...profile, topic_mastery: mastery },
          evidence_count: totalMemoryCount ?? (profileRow?.evidence_count ?? 0),
          last_evidence_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: "student_id" });
      }
      const incorrectCount = answers.filter((answer) => {
        const q = questions.find((item: any) => item.id === answer.question_id);
        return q?.question_type === "MCQ" && q.answer_key && typeof q.answer_key === "object" &&
          Object.hasOwn(q.answer_key, "correct_option") &&
          String((answer.response as any)?.option_id ?? "") !== String(q.answer_key.correct_option);
      }).length;
      return reply({ ok: true, attempt_id: attemptId, status, score_percent: needsReview ? null : pct,
        awarded_marks: needsReview ? null : awarded, total_marks: total, incorrect_count: incorrectCount,
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
