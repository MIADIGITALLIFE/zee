-- CMM Phase 5: owner-reviewed admission of independently verified memories.
-- A verified S3 seed can become trusted memory only after an explicit owner decision.
alter table public.memory_proposals
  add column if not exists resulting_memory_id uuid
  references public.cognitive_memories(id) on delete restrict;

create table if not exists public.memory_proposal_reviews (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.memory_proposals(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null,
  reviewer_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approve','reject')),
  rationale text not null check (length(trim(rationale)) > 0),
  resulting_memory_id uuid references public.cognitive_memories(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((decision = 'approve' and resulting_memory_id is not null)
      or (decision = 'reject' and resulting_memory_id is null))
);
create index if not exists memory_proposal_reviews_owner_idx
  on public.memory_proposal_reviews(owner_user_id, created_at desc);
alter table public.memory_proposal_reviews enable row level security;
create policy "owners read memory proposal reviews" on public.memory_proposal_reviews
  for select to authenticated using (owner_user_id = auth.uid());
revoke insert, update, delete, truncate on public.memory_proposal_reviews from anon, authenticated;

create or replace function public.cmm_block_memory_proposal_review_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'CMM proposal review history is append-only';
end;
$$;
drop trigger if exists memory_proposal_reviews_immutable on public.memory_proposal_reviews;
create trigger memory_proposal_reviews_immutable
  before update or delete on public.memory_proposal_reviews
  for each row execute function public.cmm_block_memory_proposal_review_mutation();

create or replace function public.cmm_review_memory_proposal(
  p_actor_id uuid,
  p_proposal_id uuid,
  p_decision text,
  p_rationale text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $cmm$
declare
  v_proposal public.memory_proposals%rowtype;
  v_seed public.cognitive_seeds%rowtype;
  v_memory public.cognitive_memories%rowtype;
  v_memory_version_id uuid;
  v_seed_id uuid;
  v_ref jsonb;
  v_evidence_ref text;
  v_audit public.cmm_verification_audit%rowtype;
  v_claim text;
  v_evidence_summary text;
  v_confidence_basis text;
  v_memory_type text;
begin
  if p_actor_id is null or p_proposal_id is null
     or p_decision not in ('approve','reject')
     or p_rationale is null or length(trim(p_rationale)) = 0
     or length(p_rationale) > 4000 then
    raise exception 'invalid proposal review payload' using errcode = '22023';
  end if;

  select * into v_proposal
    from public.memory_proposals
    where id = p_proposal_id and owner_user_id = p_actor_id
    for update;
  if not found then raise exception 'proposal not found' using errcode = 'P0002'; end if;

  -- A repeated approval is idempotent and returns the already-created memory.
  if v_proposal.status = 'approved' and p_decision = 'approve'
     and v_proposal.resulting_memory_id is not null then
    return jsonb_build_object('proposal_id',v_proposal.id,'status','approved',
      'memory_id',v_proposal.resulting_memory_id,'idempotent_replay',true);
  end if;
  if v_proposal.status <> 'pending_review' then
    raise exception 'proposal is no longer pending review' using errcode = '23514';
  end if;
  if v_proposal.proposal_type <> 'consolidate'
     or v_proposal.safety_status <> 'PASS'
     or cardinality(v_proposal.source_seed_ids) = 0 then
    raise exception 'only safe consolidation proposals with source seeds can be reviewed' using errcode = '23514';
  end if;

  v_claim := nullif(trim(v_proposal.payload->>'claim'),'');
  v_evidence_summary := nullif(trim(v_proposal.payload->>'evidence_summary'),'');
  v_confidence_basis := nullif(trim(v_proposal.payload->>'confidence_basis'),'');
  v_memory_type := coalesce(nullif(trim(v_proposal.payload->>'memory_type'),''),'knowledge');
  if v_claim is null or v_evidence_summary is null or v_confidence_basis is null then
    raise exception 'proposal payload is incomplete' using errcode = '23514';
  end if;

  -- Revalidate every source at decision time; proposal creation is not a trust grant.
  foreach v_seed_id in array v_proposal.source_seed_ids loop
    select * into v_seed from public.cognitive_seeds
      where id = v_seed_id and owner_user_id = p_actor_id
        and agent_id = v_proposal.agent_id
      for share;
    if not found or v_seed.stage <> 'S3' or v_seed.safety_status <> 'PASS'
       or cardinality(v_seed.evidence_refs) = 0
       or jsonb_array_length(v_seed.provenance) = 0
       or v_seed.independently_verified_by is null
       or v_seed.independently_verified_by = p_actor_id
       or v_seed.independent_verification_ref is null then
      raise exception 'source seed is not eligible for trusted admission' using errcode = '23514';
    end if;

    select * into v_audit from public.cmm_verification_audit
      where verification_ref = v_seed.independent_verification_ref
        and seed_id = v_seed.id and owner_user_id = p_actor_id
        and agent_id = v_proposal.agent_id
        and verifier_user_id = v_seed.independently_verified_by
        and decision = 'verified'
        and resulting_seed_version = v_seed.version
      limit 1;
    if not found then
      raise exception 'matching independent verification audit is required' using errcode = '23514';
    end if;

    for v_ref in select value from jsonb_array_elements(v_seed.evidence_refs) loop
      v_evidence_ref := case when jsonb_typeof(v_ref) = 'string'
        then trim(both '"' from v_ref::text) else v_ref->>'evidence_ref' end;
      if v_evidence_ref is null or not exists (
        select 1 from jsonb_array_elements(v_audit.evidence_snapshot) e(value)
        where e.value->>'evidence_ref' = v_evidence_ref
          and e.value->>'outcome' = 'supports'
      ) then
        raise exception 'all source evidence must have a supporting verification result' using errcode = '23514';
      end if;
    end loop;
  end loop;

  if p_decision = 'reject' then
    insert into public.memory_proposal_reviews
      (proposal_id,owner_user_id,agent_id,reviewer_id,decision,rationale)
    values (v_proposal.id,p_actor_id,v_proposal.agent_id,p_actor_id,'reject',trim(p_rationale));
    update public.memory_proposals
      set status = 'rejected', reviewed_by = p_actor_id, reviewed_at = now()
      where id = v_proposal.id;
    return jsonb_build_object('proposal_id',v_proposal.id,'status','rejected');
  end if;

  insert into public.cognitive_memories
    (agent_id,owner_user_id,claim,memory_type,lifecycle_status,source_seed_ids,
     evidence_summary,verification_status,confidence,confidence_basis,current_version)
  values
    (v_proposal.agent_id,p_actor_id,v_claim,v_memory_type,'trusted',v_proposal.source_seed_ids,
     v_evidence_summary,'verified',null,v_confidence_basis,1)
  returning * into v_memory;

  insert into public.memory_versions
    (memory_id,agent_id,owner_user_id,version,claim,snapshot,change_type,
     change_reason,evidence_refs,actor_id,review_status)
  values
    (v_memory.id,v_memory.agent_id,p_actor_id,1,v_claim,
     jsonb_build_object('claim',v_claim,'memory_type',v_memory_type,
       'evidence_summary',v_evidence_summary,'confidence_basis',v_confidence_basis,
       'source_seed_ids',to_jsonb(v_proposal.source_seed_ids),
       'verification_status','verified'),
     'created',trim(p_rationale),v_proposal.evidence_refs,p_actor_id,'approved')
  returning id into v_memory_version_id;

  foreach v_seed_id in array v_proposal.source_seed_ids loop
    select * into v_seed from public.cognitive_seeds where id = v_seed_id;
    select * into v_audit from public.cmm_verification_audit
      where verification_ref = v_seed.independent_verification_ref
      and seed_id = v_seed.id and decision = 'verified'
      and resulting_seed_version = v_seed.version
      limit 1;

    for v_ref in select value from jsonb_array_elements(v_seed.evidence_refs) loop
      v_evidence_ref := case when jsonb_typeof(v_ref) = 'string'
        then trim(both '"' from v_ref::text) else v_ref->>'evidence_ref' end;
      insert into public.memory_evidence
        (memory_id,agent_id,owner_user_id,evidence_ref,evidence_kind,
         source_uri,source_hash,verification_status,independently_verified,
         verifier_id,metadata)
      values
        (v_memory.id,v_memory.agent_id,p_actor_id,v_evidence_ref,
         coalesce(nullif(v_ref->>'evidence_kind',''),'seed_evidence'),
         nullif(v_ref->>'source_uri',''),nullif(v_ref->>'source_hash',''),
         'verified',true,v_seed.independently_verified_by,
         jsonb_build_object('seed_id',v_seed.id,'verification_ref',v_audit.verification_ref,
           'audit_id',v_audit.id))
      on conflict (memory_id,evidence_ref) do nothing;
    end loop;
  end loop;

  insert into public.memory_reviews
    (memory_id,memory_version_id,agent_id,owner_user_id,review_type,decision,
     reviewer_id,reviewer_role,rationale,evidence_refs,safety_status)
  values
    (v_memory.id,v_memory_version_id,v_memory.agent_id,p_actor_id,'admission','approve',
     p_actor_id,'owner',trim(p_rationale),v_proposal.evidence_refs,'PASS');

  insert into public.memory_proposal_reviews
    (proposal_id,owner_user_id,agent_id,reviewer_id,decision,rationale,resulting_memory_id)
  values
    (v_proposal.id,p_actor_id,v_proposal.agent_id,p_actor_id,'approve',trim(p_rationale),v_memory.id);

  update public.memory_proposals
    set status = 'approved', reviewed_by = p_actor_id, reviewed_at = now(),
        resulting_memory_id = v_memory.id
    where id = v_proposal.id;

  return jsonb_build_object('proposal_id',v_proposal.id,'status','approved',
    'memory_id',v_memory.id,'memory_version_id',v_memory_version_id,
    'idempotent_replay',false);
end;
$cmm$;

revoke all on function public.cmm_review_memory_proposal(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.cmm_review_memory_proposal(uuid,uuid,text,text)
  to service_role;
comment on function public.cmm_review_memory_proposal(uuid,uuid,text,text) is
  'Owner approval/rejection for CMM consolidation proposals. Approval revalidates S3 evidence, creates a trusted verified memory, immutable version/evidence/review rows, and proposal audit in one transaction.';
