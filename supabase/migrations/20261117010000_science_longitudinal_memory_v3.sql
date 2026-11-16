-- ZEE Science V3: longitudinal learner memory and auditable evidence.
-- All records are server-written; guardians can read only their own learner's profile/evidence.
-- Candidate observations are never promoted to supported mastery from one answer or one AI turn.

create table if not exists public.science_student_learning_profiles (
  student_id uuid primary key references public.science_students(id) on delete cascade,
  profile_version integer not null default 1 check (profile_version > 0),
  profile jsonb not null default '{"topic_mastery":{},"learning_patterns":[],"revision_signals":[]}'::jsonb
    check (jsonb_typeof(profile) = 'object'),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  last_evidence_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.science_student_memory_evidence (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  session_id uuid references public.science_lesson_sessions(id) on delete set null,
  lesson_id uuid references public.science_lessons(id) on delete set null,
  outcome_id uuid references public.science_learning_outcomes(id) on delete set null,
  source_event_id uuid references public.science_learning_events(id) on delete set null,
  source_attempt_id uuid references public.science_assessment_attempts(id) on delete set null,
  evidence_kind text not null check (evidence_kind in (
    'deterministic_practice','deterministic_test','tutor_observation','understanding_check','delayed_recall','teacher_review'
  )),
  evidence_status text not null default 'candidate'
    check (evidence_status in ('candidate','supported','needs_review','superseded')),
  performance numeric(5,2) check (performance between 0 and 100),
  confidence numeric(5,4) check (confidence between 0 and 1),
  observation text not null default '',
  evidence_detail jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_detail) = 'object'),
  observed_at timestamptz not null default now()
);
create index if not exists science_memory_evidence_student_idx
  on public.science_student_memory_evidence(student_id, observed_at desc);
create index if not exists science_memory_evidence_outcome_idx
  on public.science_student_memory_evidence(student_id, outcome_id, observed_at desc);
create index if not exists science_memory_evidence_attempt_idx
  on public.science_student_memory_evidence(source_attempt_id);

alter table public.science_student_learning_profiles enable row level security;
alter table public.science_student_memory_evidence enable row level security;

drop policy if exists "guardians read own science learning profiles" on public.science_student_learning_profiles;
create policy "guardians read own science learning profiles"
  on public.science_student_learning_profiles for select to authenticated
  using (exists (select 1 from public.science_students s
    where s.id = student_id and s.guardian_user_id = auth.uid()));

drop policy if exists "guardians read own science memory evidence" on public.science_student_memory_evidence;
create policy "guardians read own science memory evidence"
  on public.science_student_memory_evidence for select to authenticated
  using (exists (select 1 from public.science_students s
    where s.id = student_id and s.guardian_user_id = auth.uid()));

revoke all on public.science_student_learning_profiles, public.science_student_memory_evidence from anon, authenticated;
grant select on public.science_student_learning_profiles, public.science_student_memory_evidence to authenticated;
comment on table public.science_student_learning_profiles is
  'Longitudinal, evidence-backed learner profile. Mastery states remain provisional until independent repeated evidence is available.';
comment on table public.science_student_memory_evidence is
  'Append-only evidence ledger. AI tutor observations are candidates, not verified misconceptions or mastery.';
