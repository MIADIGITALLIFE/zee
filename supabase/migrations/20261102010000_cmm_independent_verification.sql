-- CMM Phase 2: auditable independent verification metadata and proposal idempotency.
-- This migration does not grant clients permission to write verification metadata.

alter table public.cognitive_seeds
  add column if not exists independently_verified_by uuid,
  add column if not exists independently_verified_at timestamptz,
  add column if not exists independent_verification_ref text;

alter table public.cognitive_seeds
  add constraint cognitive_seeds_independent_verification_complete
  check (
    (independently_verified_by is null and independently_verified_at is null and independent_verification_ref is null)
    or
    (independently_verified_by is not null and independently_verified_at is not null
      and independent_verification_ref is not null and length(trim(independent_verification_ref)) > 0
      and independently_verified_by <> owner_user_id)
  );

alter table public.memory_proposals
  add column if not exists request_key text;

create unique index if not exists memory_proposals_owner_request_key_uidx
  on public.memory_proposals(owner_user_id, request_key)
  where request_key is not null;

comment on column public.cognitive_seeds.independently_verified_by is
  'Authenticated independent verifier; must differ from seed owner. Written only by trusted server workflow.';
comment on column public.cognitive_seeds.independently_verified_at is
  'Timestamp assigned by trusted server workflow after verifier authorization.';
comment on column public.cognitive_seeds.independent_verification_ref is
  'Auditable reference to the independent verification evidence.';
comment on column public.memory_proposals.request_key is
  'Client-supplied UUID idempotency key, unique within an owner account.';
