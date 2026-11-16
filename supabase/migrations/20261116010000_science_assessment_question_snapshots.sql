-- ZEE Science assessment continuity: persist the exact question set issued for each attempt.
alter table public.science_assessment_attempts
  add column if not exists question_ids uuid[] not null default '{}';

comment on column public.science_assessment_attempts.question_ids is
  'Immutable snapshot of question IDs issued for this attempt, enabling safe resume and reproducible marking.';
