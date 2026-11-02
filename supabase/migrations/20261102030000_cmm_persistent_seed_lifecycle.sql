-- CMM Phase 4: persistent S2 -> S3 lifecycle closure.
-- All-supports review promotes atomically; any other outcome retains S2.
alter table public.cmm_verification_audit
  add column if not exists resulting_seed_version integer;

-- Existing Phase 3 audit rows remain unchanged to preserve append-only semantics.
comment on column public.cmm_verification_audit.seed_version is
  'The seed version reviewed by the verifier (pre-transition version).';
comment on column public.cmm_verification_audit.resulting_seed_version is
  'The seed version after review; increments only when the seed is promoted to S3.';

create or replace function public.cmm_block_seed_version_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'CMM seed versions are append-only';
end;
$$;
drop trigger if exists cmm_seed_versions_immutable on public.cognitive_seed_versions;
create trigger cmm_seed_versions_immutable
  before update or delete on public.cognitive_seed_versions
  for each row execute function public.cmm_block_seed_version_mutation();
revoke insert, update, delete, truncate on public.cognitive_seed_versions from anon, authenticated;

create or replace function public.cmm_record_seed_verification(
  p_verifier_user_id uuid, p_seed_id uuid, p_evidence_checks jsonb, p_rationale text
) returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  v_seed public.cognitive_seeds%rowtype;
  v_assignment public.cmm_verifier_assignments%rowtype;
  v_audit_id uuid := gen_random_uuid();
  v_ref text;
  v_decision text;
  v_resulting_version integer;
  v_ref_count integer;
  v_check_count integer;
  v_now timestamptz := now();
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
  if v_seed.stage <> 'S2' or v_seed.safety_status <> 'PASS' then
    raise exception 'only S2 seeds with Safety PASS can enter independent review' using errcode = '23514';
  end if;
  if v_seed.owner_user_id = p_verifier_user_id then
    raise exception 'seed owner cannot verify their own seed' using errcode = '42501';
  end if;
  if jsonb_array_length(v_seed.provenance) = 0 then
    raise exception 'seed provenance is required' using errcode = '23514';
  end if;

  select * into v_assignment from public.cmm_verifier_assignments a
    where a.owner_user_id = v_seed.owner_user_id and a.agent_id = v_seed.agent_id
      and a.verifier_user_id = p_verifier_user_id and a.status = 'active'
    for share;
  if not found then raise exception 'active verifier assignment required' using errcode = '42501'; end if;

  select jsonb_array_length(v_seed.evidence_refs), jsonb_array_length(p_evidence_checks)
    into v_ref_count, v_check_count;
  if v_ref_count = 0 or v_check_count <> v_ref_count then
    raise exception 'every source evidence reference must be reviewed exactly once' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_evidence_checks) e(value)
    where jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value->>'evidence_ref','') = ''
      or coalesce(e.value->>'outcome','') not in ('supports','contradicts','inconclusive')
      or coalesce(e.value->>'notes','') = ''
  ) then raise exception 'invalid evidence check item' using errcode = '22023'; end if;

  if (select count(distinct e.value->>'evidence_ref')
      from jsonb_array_elements(p_evidence_checks) e(value)) <> v_check_count
     or (select count(distinct case when jsonb_typeof(r.value) = 'string'
       then trim(both '"' from r.value::text) else r.value->>'evidence_ref' end)
       from jsonb_array_elements(v_seed.evidence_refs) r(value)) <> v_ref_count then
    raise exception 'duplicate evidence references are not allowed' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_seed.evidence_refs) r(value)
    where not exists (select 1 from jsonb_array_elements(p_evidence_checks) e(value)
      where e.value->>'evidence_ref' = case when jsonb_typeof(r.value) = 'string'
        then trim(both '"' from r.value::text) else r.value->>'evidence_ref' end)
  ) or exists (
    select 1 from jsonb_array_elements(p_evidence_checks) e(value)
    where not exists (select 1 from jsonb_array_elements(v_seed.evidence_refs) r(value)
      where (case when jsonb_typeof(r.value) = 'string'
        then trim(both '"' from r.value::text) else r.value->>'evidence_ref' end)
        = e.value->>'evidence_ref')
  ) then raise exception 'evidence checks must exactly match seed evidence references' using errcode = '23514'; end if;

  if exists (select 1 from jsonb_array_elements(p_evidence_checks) e(value)
    where e.value->>'outcome' in ('contradicts','inconclusive')) then
    v_decision := 'rejected';
    v_resulting_version := v_seed.version;
  else
    v_decision := 'verified';
    v_resulting_version := v_seed.version + 1;
  end if;

  v_ref := 'cmm-verification:' || v_audit_id::text;
  insert into public.cmm_verification_audit
    (id, owner_user_id, agent_id, seed_id, seed_version, resulting_seed_version,
     verifier_user_id, assignment_id, decision, evidence_snapshot, rationale, verification_ref, created_at)
  values
    (v_audit_id, v_seed.owner_user_id, v_seed.agent_id, v_seed.id, v_seed.version,
     v_resulting_version, p_verifier_user_id, v_assignment.id, v_decision,
     p_evidence_checks, trim(p_rationale), v_ref, v_now);

  if v_decision = 'verified' then
    update public.cognitive_seeds set stage = 'S3', version = v_resulting_version,
      independently_verified_by = p_verifier_user_id,
      independently_verified_at = v_now, independent_verification_ref = v_ref,
      updated_at = v_now
    where id = v_seed.id and owner_user_id = v_seed.owner_user_id
      and stage = 'S2' and version = v_seed.version;
    if not found then raise exception 'seed changed during lifecycle transition' using errcode = '40001'; end if;

    insert into public.cognitive_seed_versions
      (seed_id, agent_id, owner_user_id, version, stage, snapshot, transition_reason,
       evidence_refs, safety_status, actor_id, reviewer_role, created_at)
    values
      (v_seed.id, v_seed.agent_id, v_seed.owner_user_id, v_resulting_version, 'S3',
       jsonb_build_object('seed_id',v_seed.id,'agent_id',v_seed.agent_id,
         'owner_user_id',v_seed.owner_user_id,'observation_id',v_seed.observation_id,
         'hypothesis',v_seed.hypothesis,'stage','S3','safety_status',v_seed.safety_status,
         'provenance',v_seed.provenance,'evidence_refs',v_seed.evidence_refs,
         'version',v_resulting_version,'verification',jsonb_build_object(
           'audit_id',v_audit_id,'verification_ref',v_ref,'reviewed_version',v_seed.version,
           'verifier_user_id',p_verifier_user_id,'verified_at',v_now,
           'evidence_checks',p_evidence_checks)),
       'S2 -> S3: all evidence items independently supported',v_seed.evidence_refs,
       v_seed.safety_status,p_verifier_user_id,'independent_verifier',v_now);
  end if;

  return jsonb_build_object('audit_id',v_audit_id,'decision',v_decision,
    'verification_ref',v_ref,'seed_id',v_seed.id,'reviewed_seed_version',v_seed.version,
    'resulting_seed_version',v_resulting_version,
    'resulting_stage',case when v_decision = 'verified' then 'S3' else 'S2' end);
end;
$$;

revoke all on function public.cmm_record_seed_verification(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.cmm_record_seed_verification(uuid,uuid,jsonb,text) to service_role;
comment on function public.cmm_record_seed_verification(uuid,uuid,jsonb,text) is
  'Reviews S2. All-supports atomically promotes to S3 and appends a version snapshot; contradiction or inconclusive retains S2. Edge Function supplies authenticated verifier identity.';
