-- Similar-case retrieval for the doctor-approved corpus.

create extension if not exists vector with schema extensions;

alter table public.summary_revisions
  add column if not exists case_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists embedding extensions.vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_created_at timestamptz;

create or replace function public.match_finalized_cases(
  p_owner_id uuid,
  p_query_embedding extensions.vector(1536),
  p_exclude_case_id uuid default null,
  p_match_count integer default 4
)
returns table (
  revision_id uuid,
  case_id uuid,
  case_snapshot jsonb,
  finalized_text text,
  generated_text text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with latest as (
    select distinct on (r.case_id)
      r.id,
      r.case_id,
      r.case_snapshot,
      r.finalized_text,
      r.generated_text,
      r.embedding,
      r.finalized_at
    from public.summary_revisions r
    where r.owner_id = p_owner_id
      and r.embedding is not null
      and (p_exclude_case_id is null or r.case_id <> p_exclude_case_id)
    order by r.case_id, r.finalized_at desc
  )
  select
    l.id as revision_id,
    l.case_id,
    l.case_snapshot,
    l.finalized_text,
    l.generated_text,
    (1 - (l.embedding <=> p_query_embedding))::double precision as similarity
  from latest l
  order by l.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 8);
$$;

revoke all on function public.match_finalized_cases(
  uuid,
  extensions.vector,
  uuid,
  integer
) from public, anon, authenticated;

grant execute on function public.match_finalized_cases(
  uuid,
  extensions.vector,
  uuid,
  integer
) to service_role;
