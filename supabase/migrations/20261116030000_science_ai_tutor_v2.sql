-- ZEE Science AI Tutor V2: guardian-scoped, durable tutoring dialogue.
-- Separate from ZHI agent identity and its trusted cognitive-memory lifecycle.
create table if not exists public.science_tutor_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.science_students(id) on delete cascade,
  session_id uuid not null references public.science_lesson_sessions(id) on delete cascade,
  role text not null check (role in ('student','tutor')),
  content text not null check (length(trim(content)) between 1 and 6000),
  teaching_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(teaching_metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists science_tutor_messages_session_idx
  on public.science_tutor_messages(student_id, session_id, created_at desc);

alter table public.science_tutor_messages enable row level security;
create policy "guardian reads own science tutor messages"
  on public.science_tutor_messages for select to authenticated
  using (exists (
    select 1 from public.science_students s
    where s.id = science_tutor_messages.student_id
      and s.guardian_user_id = auth.uid()
  ));
-- No client insert/update/delete policies: writes are performed by the Edge Function
-- after it verifies guardian ownership and lesson-session ownership.

comment on table public.science_tutor_messages is
  'Guardian-scoped student/tutor dialogue history for continuity across devices. Episodic learning context, not verified long-term memory.';
