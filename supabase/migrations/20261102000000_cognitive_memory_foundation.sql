-- CMM Phase 1: durable memory foundation.
-- Storage and read/append policies only. Trusted-memory promotion and lifecycle
-- transitions remain server-side RPC responsibilities in a later phase.

create extension if not exists pgcrypto;

create table if not exists public.cognitive_seeds (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  observation_id text not null,
  hypothesis text not null,
  stage text not null default 'S2' check (stage in ('S0','S1','S2','S3','S4','S5')),
  safety_status text not null check (safety_status in ('PASS','WARN','BLOCK')),
  provenance jsonb not null default '[]'::jsonb check (jsonb_typeof(provenance) = 'array'),
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cognitive_seeds_agent_stage_idx on public.cognitive_seeds(agent_id, stage, created_at desc);

create table if not exists public.cognitive_seed_versions (
  id uuid primary key default gen_random_uuid(),
  seed_id uuid not null references public.cognitive_seeds(id) on delete restrict,
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  stage text not null check (stage in ('S0','S1','S2','S3','S4','S5')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  transition_reason text not null,
  evidence_refs jsonb not null check (jsonb_typeof(evidence_refs) = 'array'),
  safety_status text not null check (safety_status in ('PASS','WARN','BLOCK')),
  actor_id uuid not null,
  reviewer_role text,
  created_at timestamptz not null default now(),
  unique(seed_id, version)
);

create table if not exists public.cognitive_memories (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  claim text not null,
  memory_type text not null default 'knowledge',
  lifecycle_status text not null default 'pending_review'
    check (lifecycle_status in ('pending_review','trusted','disputed','superseded','revoked')),
  source_seed_ids uuid[] not null check (cardinality(source_seed_ids) > 0),
  evidence_summary text not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','unavailable')),
  confidence numeric(5,4) check (confidence between 0 and 1),
  confidence_basis text not null,
  current_version integer not null default 1 check (current_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cognitive_memories_agent_status_idx on public.cognitive_memories(agent_id, lifecycle_status, created_at desc);

create table if not exists public.memory_evidence (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.cognitive_memories(id) on delete restrict,
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  evidence_ref text not null,
  evidence_kind text not null,
  source_uri text,
  source_hash text,
  verification_status text not null default 'unavailable'
    check (verification_status in ('unavailable','pending','verified','rejected')),
  independently_verified boolean not null default false,
  verifier_id uuid,
  observed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique(memory_id, evidence_ref)
);

create table if not exists public.memory_relations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  from_memory_id uuid not null references public.cognitive_memories(id) on delete restrict,
  to_memory_id uuid not null references public.cognitive_memories(id) on delete restrict,
  relation_type text not null check (relation_type in ('CONCEPT','CAUSAL','EXPERIENTIAL','SUPPORTS','CONTRADICTS','DERIVED_FROM')),
  relation_status text not null default 'proposed'
    check (relation_status in ('proposed','evidence_supported','rejected','superseded')),
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  rationale text not null,
  created_at timestamptz not null default now(),
  check (from_memory_id <> to_memory_id)
);
create index if not exists memory_relations_from_idx on public.memory_relations(from_memory_id);
create index if not exists memory_relations_to_idx on public.memory_relations(to_memory_id);

create table if not exists public.memory_versions (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.cognitive_memories(id) on delete restrict,
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  claim text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  change_type text not null check (change_type in ('created','clarified','strengthened','corrected','disputed','superseded','revoked')),
  change_reason text not null,
  evidence_refs jsonb not null check (jsonb_typeof(evidence_refs) = 'array'),
  actor_id uuid not null,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(memory_id, version)
);

create table if not exists public.memory_reviews (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.cognitive_memories(id) on delete restrict,
  memory_version_id uuid references public.memory_versions(id) on delete restrict,
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  review_type text not null check (review_type in ('admission','periodic','evidence_update','conflict','revocation')),
  decision text not null check (decision in ('approve','reject','request_evidence','mark_disputed','revoke')),
  reviewer_id uuid not null,
  reviewer_role text not null,
  rationale text not null,
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  safety_status text not null check (safety_status in ('PASS','WARN','BLOCK')),
  created_at timestamptz not null default now()
);

create table if not exists public.memory_proposals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  proposal_type text not null check (proposal_type in ('consolidate','relate','revise','revoke')),
  source_seed_ids uuid[] not null default '{}',
  target_memory_id uuid references public.cognitive_memories(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  safety_status text not null check (safety_status in ('PASS','WARN','BLOCK')),
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','withdrawn')),
  created_by uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.personality_change_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_memory_ids uuid[] not null default '{}',
  source_seed_ids uuid[] not null default '{}',
  proposed_patch jsonb not null check (jsonb_typeof(proposed_patch) = 'object'),
  rationale text not null,
  status text not null default 'pending_authorization'
    check (status in ('pending_authorization','approved','rejected','applied','withdrawn')),
  created_by uuid not null,
  authorized_by uuid,
  authorized_at timestamptz,
  applied_personality_version text,
  created_at timestamptz not null default now()
);

alter table public.cognitive_seeds enable row level security;
alter table public.cognitive_seed_versions enable row level security;
alter table public.cognitive_memories enable row level security;
alter table public.memory_evidence enable row level security;
alter table public.memory_relations enable row level security;
alter table public.memory_versions enable row level security;
alter table public.memory_reviews enable row level security;
alter table public.memory_proposals enable row level security;
alter table public.personality_change_requests enable row level security;

create policy "owner reads cognitive seeds" on public.cognitive_seeds for select to authenticated using (owner_user_id = auth.uid());
create policy "owner inserts cognitive seeds" on public.cognitive_seeds for insert to authenticated with check (
  owner_user_id = auth.uid()
  and stage = 'S2'
  and safety_status = 'PASS'
  and jsonb_array_length(provenance) > 0
);
create policy "owner reads seed versions" on public.cognitive_seed_versions for select to authenticated using (owner_user_id = auth.uid());
create policy "owner reads memories" on public.cognitive_memories for select to authenticated using (owner_user_id = auth.uid());
create policy "owner reads memory evidence" on public.memory_evidence for select to authenticated using (owner_user_id = auth.uid());
create policy "owner reads memory relations" on public.memory_relations for select to authenticated using (owner_user_id = auth.uid());
create policy "owner reads memory versions" on public.memory_versions for select to authenticated using (owner_user_id = auth.uid());
create policy "owner reads memory reviews" on public.memory_reviews for select to authenticated using (owner_user_id = auth.uid());
create policy "owner reads memory proposals" on public.memory_proposals for select to authenticated using (owner_user_id = auth.uid());
create policy "owner submits memory proposals" on public.memory_proposals for insert to authenticated
  with check (owner_user_id = auth.uid() and created_by = auth.uid() and status = 'pending_review');
create policy "owner reads personality change requests" on public.personality_change_requests for select to authenticated using (owner_user_id = auth.uid());
create policy "owner submits personality change requests" on public.personality_change_requests for insert to authenticated
  with check (owner_user_id = auth.uid() and created_by = auth.uid()
    and status = 'pending_authorization' and authorized_by is null and applied_personality_version is null);

-- No client UPDATE/DELETE policies exist for lifecycle, evidence, relation,
-- review, or version tables. Trusted memory writes require future authenticated RPCs.
