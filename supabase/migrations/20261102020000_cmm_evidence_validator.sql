-- CMM Phase 3: authorized independent evidence review.
-- Verification is a human attestation by an owner-appointed, distinct Supabase user.
-- This migration does not fetch URLs or claim that a URL/hash alone proves truth.

create table if not exists public.cmm_verifier_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null,
  verifier_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(owner_user_id, agent_id, verifier_user_id),
  check (verifier_user_id <> owner_user_id),
  check ((status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);
create index if not exists cmm_verifier_assignments_lookup_idx
  on public.cmm_verifier_assignments(owner_user_id, agent_id, verifier_user_id, status);

create table if not exists public.cmm_verification_audit (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null,
  seed_id uuid not null references public.cognitive_seeds(id) on delete restrict,
  seed_version integer not null,
  verifier_user_id uuid not null references auth.users(id),
  assignment_id uuid not null references public.cmm_verifier_assignments(id),
  decision text not null check (decision in ('verified','rejected')),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'array'),
  rationale text not null,
  verification_ref text not null unique,
  created_at timestamptz not null default now(),
  check (verifier_user_id <> owner_user_id)
);
create index if not exists cmm_verification_audit_seed_idx
  on public.cmm_verification_audit(seed_id, created_at desc);

alter table public.cmm_verifier_assignments enable row level security;
alter table public.cmm_verification_audit enable row level security;

create policy "owners read verifier assignments" on public.cmm_verifier_assignments
  for select to authenticated using (owner_user_id = auth.uid());
create policy "owners read verification audit" on public.cmm_verification_audit
  for select to authenticated using (owner_user_id = auth.uid());

revoke insert, update, delete, truncate on public.cmm_verifier_assignments from anon, authenticated;
revoke insert, update, delete, truncate on public.cmm_verification_audit from anon, authenticated;

create or replace function public.cmm_block_verification_audit_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'CMM verification audit is append-only';
end;
$$;

drop trigger if exists cmm_verification_audit_immutable on public.cmm_verification_audit;
create trigger cmm_verification_audit_immutable
  before update or delete on public.cmm_verification_audit
  for each row execute function public.cmm_block_verification_audit_mutation();

create or replace function public.cmm_set_verifier_assignment(
  p_actor_id uuid,
  p_agent_id uuid,
  p_verifier_user_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_assignment public.cmm_verifier_assignments%rowtype;
begin
  if p_action not in ('grant','revoke') then
    raise exception 'action must be grant or revoke' using errcode = '22023';
  end if;
  if p_actor_id is null or p_verifier_user_id is null or p_agent_id is null
     or p_actor_id = p_verifier_user_id then
    raise exception 'invalid owner, verifier, or agent' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.cognitive_seeds s
    where s.owner_user_id = p_actor_id and s.agent_id = p_agent_id
  ) then
    raise exception 'owner has no seed for this agent' using errcode = '42501';
  end if;

  if p_action = 'grant' then
    insert into public.cmm_verifier_assignments
      (owner_user_id, agent_id, verifier_user_id, status, assigned_by, assigned_at, revoked_at)
    values (p_actor_id, p_agent_id, p_verifier_user_id, 'active', p_actor_id, now(), null)
    on conflict (owner_user_id, agent_id, verifier_user_id)
    do update set status = 'active', assigned_by = excluded.assigned_by,
                  assigned_at = now(), revoked_at = null
    returning * into v_assignment;
  else
    update public.cmm_verifier_assignments
      set status = 'revoked', revoked_at = now()
      where owner_user_id = p_actor_id and agent_id = p_agent_id
        and verifier_user_id = p_verifier_user_id
      returning * into v_assignment;
    if not found then
      raise exception 'verifier assignment not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('assignment_id', v_assignment.id, 'status', v_assignment.status,
    'owner_user_id', v_assignment.owner_user_id, 'agent_id', v_assignment.agent_id,
    'verifier_user_id', v_assignment.verifier_user_id);
end;
$$;

create or replace function public.cmm_record_seed_verification(
  p_verifier_user_id uuid,
  p_seed_id uuid,
  p_evidence_checks jsonb,
  p_rationale text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_seed public.cognitive_seeds%rowtype;
  v_assignment public.cmm_verifier_assignments%rowtype;
  v_audit_id uuid := gen_random_uuid();
  v_ref text;
  v_decision text;
  v_ref_count integer;
  v_check_count integer;
begin
  if p_verifier_user_id is null or p_seed_id is null
     or jsonb_typeof(p_evidence_checks) <> 'array'
     or jsonb_array_length(p_evidence_checks) = 0
     or p_rationale is null or length(trim(p_rationale)) = 0
     or length(p_rationale) > 4000 then
    raise exception 'invalid verification payload' using errcode = '22023';
  end if;

  select * into v_seed from public.cognitive_seeds where id = p_seed_id for update;
  if not found then raise exception 'seed not found' using errcode = 'P0002'; end if;
  if v_seed.stage <> 'S3' or v_seed.safety_status <> 'PASS' then
    raise exception 'only S3 seeds with Safety PASS can be independently reviewed' using errcode = '23514';
  end if;
  if v_seed.owner_user_id = p_verifier_user_id then
    raise exception 'seed owner cannot verify their own seed' using errcode = '42501';
  end if;

  select * into v_assignment
    from public.cmm_verifier_assignments a
    where a.owner_user_id = v_seed.owner_user_id
      and a.agent_id = v_seed.agent_id
      and a.verifier_user_id = p_verifier_user_id
      and a.status = 'active'
    for share;
  if not found then raise exception 'active verifier assignment required' using errcode = '42501'; end if;

  select jsonb_array_length(v_seed.evidence_refs), jsonb_array_length(p_evidence_checks)
    into v_ref_count, v_check_count;
  if v_ref_count = 0 or v_check_count <> v_ref_count then
    raise exception 'every source evidence reference must be reviewed exactly once' using errcode = '23514';
  end if;
  if (select count(distinct e.value->>'evidence_ref')
      from jsonb_array_elements(p_evidence_checks) as e(value)) <> v_check_count
     or (select count(distinct case when jsonb_typeof(r.value) = 'string'
        then trim(both '"' from r.value::text) else r.value->>'evidence_ref' end)
        from jsonb_array_elements(v_seed.evidence_refs) as r(value)) <> v_ref_count then
    raise exception 'duplicate evidence references are not allowed' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_evidence_checks) as e(value)
    where jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value->>'evidence_ref','') = ''
      or coalesce(e.value->>'outcome','') not in ('supports','contradicts','inconclusive')
      or coalesce(e.value->>'notes','') = ''
  ) then
    raise exception 'each evidence check requires evidence_ref, outcome, and notes' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_seed.evidence_refs) as r(value)
    where not exists (
      select 1 from jsonb_array_elements(p_evidence_checks) as e(value)
      where e.value->>'evidence_ref' = case when jsonb_typeof(r.value) = 'string' then trim(both '"' from r.value::text) else r.value->>'evidence_ref' end
    )
  ) or exists (
    select 1 from jsonb_array_elements(p_evidence_checks) as e(value)
    where not exists (
      select 1 from jsonb_array_elements(v_seed.evidence_refs) as r(value)
      where (case when jsonb_typeof(r.value) = 'string' then trim(both '"' from r.value::text) else r.value->>'evidence_ref' end) = e.value->>'evidence_ref'
    )
  ) then
    raise exception 'evidence checks must match the seed evidence references exactly' using errcode = '23514';
  end if;

  if exists (select 1 from jsonb_array_elements(p_evidence_checks) as e(value) where e.value->>'outcome' = 'contradicts') then
    v_decision := 'rejected';
  elsif exists (select 1 from jsonb_array_elements(p_evidence_checks) as e(value) where e.value->>'outcome' = 'inconclusive') then
    v_decision := 'rejected';
  else
    v_decision := 'verified';
  end if;

  v_ref := 'cmm-verification:' || v_audit_id::text;
  insert into public.cmm_verification_audit
    (id, owner_user_id, agent_id, seed_id, seed_version, verifier_user_id,
     assignment_id, decision, evidence_snapshot, rationale, verification_ref)
  values
    (v_audit_id, v_seed.owner_user_id, v_seed.agent_id, v_seed.id, v_seed.version,
     p_verifier_user_id, v_assignment.id, v_decision, p_evidence_checks,
     trim(p_rationale), v_ref);

  update public.cognitive_seeds
    set independently_verified_by = p_verifier_user_id,
        independently_verified_at = now(),
        independent_verification_ref = v_ref,
        updated_at = now()
    where id = v_seed.id and owner_user_id = v_seed.owner_user_id;

  return jsonb_build_object('audit_id', v_audit_id, 'decision', v_decision,
    'verification_ref', v_ref, 'seed_id', v_seed.id, 'seed_version', v_seed.version);
end;
$$;

revoke all on function public.cmm_set_verifier_assignment(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cmm_record_seed_verification(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.cmm_set_verifier_assignment(uuid, uuid, uuid, text) to service_role;
grant execute on function public.cmm_record_seed_verification(uuid, uuid, jsonb, text) to service_role;

comment on table public.cmm_verification_audit is
  'Append-only record of independent human evidence review; it records reviewer attestations, not automatic proof of source truth.';
