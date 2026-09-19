-- Human-review-only Skill improvement suggestions.

create table if not exists public.skill_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  base_skill_version integer not null,
  source_revision_count integer not null default 0,
  suggestion_text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  model text,
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists skill_suggestions_owner_status_idx
  on public.skill_suggestions(owner_id, status, generated_at desc);

alter table public.skill_suggestions enable row level security;

revoke all on table public.skill_suggestions from anon, authenticated;
grant select on table public.skill_suggestions to authenticated;

drop policy if exists "skill_suggestions_select_own" on public.skill_suggestions;
create policy "skill_suggestions_select_own"
on public.skill_suggestions for select to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

-- Writes are intentionally server-only. Accepting a suggestion does not itself
-- alter skill_versions; a new Skill version requires a separate explicit workflow.
