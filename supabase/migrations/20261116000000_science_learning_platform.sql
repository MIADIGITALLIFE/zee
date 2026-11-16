-- ZEE Science V1: additive learning platform foundation.
-- This migration does not modify ZHI identity, memory, or existing chat tables.
-- Curriculum content is versioned; student records are guardian-scoped.

create table if not exists public.science_syllabus_versions (
  id uuid primary key default gen_random_uuid(),
  syllabus_code text not null,
  title text not null,
  authority text not null default 'Singapore MOE',
  effective_from date,
  effective_to date,
  cohort_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(cohort_rule) = 'object'),
  source_url text,
  source_sha256 text,
  status text not null default 'draft' check (status in ('draft','reviewed','published','retired')),
  created_at timestamptz not null default now(),
  unique (syllabus_code)
);

create table if not exists public.science_learning_outcomes (
  id uuid primary key default gen_random_uuid(),
  syllabus_version_id uuid not null references public.science_syllabus_versions(id) on delete restrict,
  outcome_code text not null,
  level text not null check (level in ('P1','P2','P3','P4','P5','P6')),
  track text not null default 'ALL' check (track in ('ALL','STANDARD','FOUNDATION')),
  strand text not null,
  topic text not null,
  outcome_text text not null,
  science_practices text[] not null default '{}',
  values_attitudes text[] not null default '{}',
  source_page text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified','needs_review')),
  created_at timestamptz not null default now(),
  unique (syllabus_version_id, outcome_code, track)
);

create table if not exists public.science_lessons (
  id uuid primary key default gen_random_uuid(),
  syllabus_version_id uuid not null references public.science_syllabus_versions(id) on delete restrict,
  level text not null check (level in ('P1','P2','P3','P4','P5','P6')),
  track text not null default 'ALL' check (track in ('ALL','STANDARD','FOUNDATION')),
  title text not null,
  topic text not null,
  lesson_order integer not null default 1 check (lesson_order > 0),
  learning_objectives jsonb not null default '[]'::jsonb check (jsonb_typeof(learning_objectives) = 'array'),
  teaching_content jsonb not null default '{}'::jsonb check (jsonb_typeof(teaching_content) = 'object'),
  practice_blueprint jsonb not null default '{}'::jsonb check (jsonb_typeof(practice_blueprint) = 'object'),
  test_blueprint jsonb not null default '{}'::jsonb check (jsonb_typeof(test_blueprint) = 'object'),
  summary_blueprint jsonb not null default '{}'::jsonb check (jsonb_typeof(summary_blueprint) = 'object'),
  outcome_ids uuid[] not null default '{}',
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','reviewed','published','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists science_lessons_lookup_idx
  on public.science_lessons(level, track, status, lesson_order);

create table if not exists public.science_question_bank (
  id uuid primary key default gen_random_uuid(),
  syllabus_version_id uuid not null references public.science_syllabus_versions(id) on delete restrict,
  lesson_id uuid references public.science_lessons(id) on delete restrict,
  outcome_id uuid not null references public.science_learning_outcomes(id) on delete restrict,
  level text not null check (level in ('P1','P2','P3','P4','P5','P6')),
  track text not null default 'ALL' check (track in ('ALL','STANDARD','FOUNDATION')),
  question_type text not null check (question_type in ('MCQ','STRUCTURED','DATA_INTERPRETATION','EXPERIMENTAL','OPEN_RESPONSE')),
  difficulty smallint not null check (difficulty between 1 and 5),
  prompt jsonb not null check (jsonb_typeof(prompt) = 'object'),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  answer_key jsonb not null check (jsonb_typeof(answer_key) in ('object','array','string','number','boolean')),
  rubric jsonb not null default '{}'::jsonb check (jsonb_typeof(rubric) = 'object'),
  marks numeric(6,2) not null default 1 check (marks > 0),
  source_reference text,
  status text not null default 'draft' check (status in ('draft','reviewed','published','retired')),
  created_at timestamptz not null default now()
);
create index if not exists science_question_bank_selection_idx
  on public.science_question_bank(level, track, question_type, difficulty, status);

create table if not exists public.science_students (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  level text not null check (level in ('P1','P2','P3','P4','P5','P6')),
  track text not null default 'STANDARD' check (track in ('STANDARD','FOUNDATION','UNCONFIRMED')),
  cohort_year integer check (cohort_year between 2010 and 2100),
  active_syllabus_version_id uuid references public.science_syllabus_versions(id) on delete restrict,
  learning_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(learning_preferences) = 'object'),
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists science_students_guardian_idx
  on public.science_students(guardian_user_id, status);

create table if not exists public.science_lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  lesson_id uuid not null references public.science_lessons(id) on delete restrict,
  syllabus_version_id uuid not null references public.science_syllabus_versions(id) on delete restrict,
  current_stage text not null default 'TEACHING'
    check (current_stage in ('TEACHING','UNDERSTANDING_CHECK','PRACTICE','TESTING','SUMMARY','ANALYSIS','COMPLETED','PAUSED')),
  session_status text not null default 'in_progress'
    check (session_status in ('in_progress','completed','paused','needs_review')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check ((session_status = 'completed' and completed_at is not null) or session_status <> 'completed')
);
create index if not exists science_sessions_student_idx
  on public.science_lesson_sessions(student_id, last_activity_at desc);

create table if not exists public.science_learning_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  session_id uuid references public.science_lesson_sessions(id) on delete set null,
  lesson_id uuid references public.science_lessons(id) on delete set null,
  outcome_id uuid references public.science_learning_outcomes(id) on delete set null,
  event_type text not null check (event_type in (
    'lesson_started','teaching_completed','understanding_check','practice_attempt',
    'test_started','test_submitted','summary_generated','analysis_generated',
    'hint_used','revision_completed','teacher_intervention'
  )),
  stage text not null check (stage in ('TEACHING','UNDERSTANDING_CHECK','PRACTICE','TESTING','SUMMARY','ANALYSIS','REVISION')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz not null default now()
);
create index if not exists science_learning_events_student_idx
  on public.science_learning_events(student_id, occurred_at desc);

create table if not exists public.science_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  session_id uuid references public.science_lesson_sessions(id) on delete set null,
  assessment_type text not null check (assessment_type in ('PRACTICE','FORMATIVE_TEST','TOPIC_TEST','PSLE_STYLE')),
  status text not null default 'in_progress' check (status in ('in_progress','submitted','scored','review_required')),
  total_marks numeric(8,2),
  awarded_marks numeric(8,2),
  score_percent numeric(5,2) check (score_percent between 0 and 100),
  scoring_version text,
  submitted_at timestamptz,
  scored_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists science_attempts_student_idx
  on public.science_assessment_attempts(student_id, created_at desc);

create table if not exists public.science_assessment_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.science_assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.science_question_bank(id) on delete restrict,
  response jsonb not null,
  awarded_marks numeric(8,2),
  max_marks numeric(8,2) not null check (max_marks > 0),
  marking_method text check (marking_method in ('deterministic','rubric_ai','human_review')),
  marking_rationale text,
  confidence numeric(5,4) check (confidence between 0 and 1),
  misconception_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(attempt_id, question_id)
);

create table if not exists public.science_lesson_summaries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  session_id uuid not null references public.science_lesson_sessions(id) on delete cascade,
  summary_content jsonb not null check (jsonb_typeof(summary_content) = 'object'),
  generated_from_event_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(session_id)
);

create table if not exists public.science_learning_analyses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  session_id uuid references public.science_lesson_sessions(id) on delete set null,
  analysis_type text not null check (analysis_type in ('LESSON','TOPIC','PERIODIC')),
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions) = 'object'),
  strengths jsonb not null default '[]'::jsonb check (jsonb_typeof(strengths) = 'array'),
  learning_gaps jsonb not null default '[]'::jsonb check (jsonb_typeof(learning_gaps) = 'array'),
  recommended_actions jsonb not null default '[]'::jsonb check (jsonb_typeof(recommended_actions) = 'array'),
  confidence numeric(5,4) check (confidence between 0 and 1),
  evidence_event_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.science_mastery_evidence (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  outcome_id uuid not null references public.science_learning_outcomes(id) on delete restrict,
  evidence_type text not null check (evidence_type in (
    'practice','independent_test','explanation','application','data_interpretation','delayed_recall','transfer'
  )),
  source_attempt_id uuid references public.science_assessment_attempts(id) on delete set null,
  evidence_event_id uuid references public.science_learning_events(id) on delete set null,
  performance numeric(5,2) check (performance between 0 and 100),
  confidence numeric(5,4) check (confidence between 0 and 1),
  evidence_detail jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_detail) = 'object'),
  observed_at timestamptz not null default now()
);
create index if not exists science_mastery_student_outcome_idx
  on public.science_mastery_evidence(student_id, outcome_id, observed_at desc);

create table if not exists public.science_revision_queue (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  outcome_id uuid not null references public.science_learning_outcomes(id) on delete restrict,
  source_analysis_id uuid references public.science_learning_analyses(id) on delete set null,
  due_at timestamptz not null,
  reason text not null,
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'pending' check (status in ('pending','completed','snoozed','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists science_revision_due_idx
  on public.science_revision_queue(student_id, status, due_at);

-- Enable RLS on all curriculum and student tables.
alter table public.science_syllabus_versions enable row level security;
alter table public.science_learning_outcomes enable row level security;
alter table public.science_lessons enable row level security;
alter table public.science_question_bank enable row level security;
alter table public.science_students enable row level security;
alter table public.science_lesson_sessions enable row level security;
alter table public.science_learning_events enable row level security;
alter table public.science_assessment_attempts enable row level security;
alter table public.science_assessment_answers enable row level security;
alter table public.science_lesson_summaries enable row level security;
alter table public.science_learning_analyses enable row level security;
alter table public.science_mastery_evidence enable row level security;
alter table public.science_revision_queue enable row level security;

-- Published curriculum metadata can be read by authenticated users.
drop policy if exists "read published science syllabus" on public.science_syllabus_versions;
create policy "read published science syllabus" on public.science_syllabus_versions
  for select to authenticated using (status = 'published');
drop policy if exists "read verified published science outcomes" on public.science_learning_outcomes;
create policy "read verified published science outcomes" on public.science_learning_outcomes
  for select to authenticated using (
    verification_status = 'verified'
    and exists (select 1 from public.science_syllabus_versions sv
      where sv.id = syllabus_version_id and sv.status = 'published')
  );
drop policy if exists "read published science lessons" on public.science_lessons;
create policy "read published science lessons" on public.science_lessons
  for select to authenticated using (
    status = 'published'
    and exists (select 1 from public.science_syllabus_versions sv
      where sv.id = syllabus_version_id and sv.status = 'published')
  );

-- Guardians can read only records belonging to their own students.
drop policy if exists "guardians read own science students" on public.science_students;
create policy "guardians read own science students" on public.science_students
  for select to authenticated using (guardian_user_id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array[
    'science_lesson_sessions','science_learning_events','science_assessment_attempts',
    'science_assessment_answers','science_lesson_summaries','science_learning_analyses',
    'science_mastery_evidence','science_revision_queue'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'guardians read own ' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (' ||
      'select 1 from public.science_students s where s.id = student_id and s.guardian_user_id = auth.uid()))',
      'guardians read own ' || t, t
    );
  end loop;
end $$;

-- Question keys and rubrics are server-only: never expose answers before a test.
revoke all on public.science_question_bank from anon, authenticated;
revoke all on public.science_assessment_answers from anon, authenticated;
grant select on public.science_syllabus_versions, public.science_learning_outcomes, public.science_lessons,
  public.science_students, public.science_lesson_sessions, public.science_learning_events,
  public.science_assessment_attempts, public.science_lesson_summaries, public.science_learning_analyses,
  public.science_mastery_evidence, public.science_revision_queue to authenticated;

-- All writes go through trusted Edge Functions using the service role.
revoke insert, update, delete, truncate on public.science_syllabus_versions,
  public.science_learning_outcomes, public.science_lessons, public.science_question_bank,
  public.science_students, public.science_lesson_sessions, public.science_learning_events,
  public.science_assessment_attempts, public.science_assessment_answers,
  public.science_lesson_summaries, public.science_learning_analyses,
  public.science_mastery_evidence, public.science_revision_queue
from anon, authenticated;

comment on table public.science_question_bank is
  'Server-only question bank. Answer keys and rubrics must never be returned to browser clients before assessment submission.';
comment on table public.science_mastery_evidence is
  'Evidence ledger. Mastery is inferred from multiple evidence types and delayed checks, never a single score.';
comment on table public.science_learning_events is
  'Append-oriented learning event stream used by the ZEE teaching loop and longitudinal analysis.';

-- Register the official source as a draft curriculum version.
-- It remains unpublished until learning outcomes and track scope are fully reviewed.
insert into public.science_syllabus_versions
  (syllabus_code, title, authority, effective_from, cohort_rule, source_url, status)
values
  (
    'MOE-PRIMARY-SCIENCE-2023',
    'Primary Science Teaching & Learning Syllabus — Primary Three to Six, Standard / Foundation (Updated May 2024)',
    'Singapore Ministry of Education',
    date '2023-01-01',
    jsonb_build_object(
      'implementation', 'Starting with 2023 Primary Three cohort',
      'levels', jsonb_build_array('P3','P4','P5','P6'),
      'resolution', 'Resolve by cohort and official transition guidance; do not infer solely from current level.'
    ),
    'https://www.moe.gov.sg/-/media/files/primary/syllabus/primary-science-syllabus-2023_may24.pdf',
    'draft'
  )
on conflict (syllabus_code) do nothing;
