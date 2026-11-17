-- ZEE Science V5: server-owned spaced repetition schedule.
-- Only deterministically marked MCQ evidence schedules a review; uncertain written answers are excluded.
create table if not exists public.science_student_revision_schedule (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  outcome_id uuid not null references public.science_learning_outcomes(id) on delete restrict,
  lesson_id uuid references public.science_lessons(id) on delete set null,
  source_attempt_id uuid references public.science_assessment_attempts(id) on delete set null,
  interval_days integer not null default 1 check (interval_days between 1 and 365),
  repetitions integer not null default 0 check (repetitions >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  ease_factor numeric(3,2) not null default 2.30 check (ease_factor between 1.30 and 2.80),
  last_score numeric(5,2) check (last_score between 0 and 100),
  last_reviewed_at timestamptz not null default now(),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','completed','snoozed')),
  updated_at timestamptz not null default now(),
  unique(student_id, outcome_id)
);
create index if not exists science_revision_schedule_due_idx
  on public.science_student_revision_schedule(student_id, status, due_at);
alter table public.science_student_revision_schedule enable row level security;
drop policy if exists "guardians read own science revision schedule" on public.science_student_revision_schedule;
create policy "guardians read own science revision schedule"
  on public.science_student_revision_schedule for select to authenticated
  using (exists (select 1 from public.science_students s
    where s.id = student_id and s.guardian_user_id = auth.uid()));
revoke all on public.science_student_revision_schedule from anon, authenticated;
grant select on public.science_student_revision_schedule to authenticated;
comment on table public.science_student_revision_schedule is
  'Server-maintained outcome-level spaced repetition schedule. Browser clients are read-only; only deterministic marking can advance review intervals.';
