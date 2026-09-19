-- AI summary infrastructure.
-- Skill/style content is backend/admin-managed and read-only to the operational browser.

create table if not exists public.skill_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  name text not null default 'SBO Documentation Skill',
  instructions text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, version)
);

create unique index if not exists one_active_skill_per_owner
  on public.skill_versions(owner_id)
  where is_active = true;

create table if not exists public.style_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  profile_text text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, version)
);

create unique index if not exists one_active_style_profile_per_owner
  on public.style_profiles(owner_id)
  where is_active = true;

alter table public.skill_versions enable row level security;
alter table public.style_profiles enable row level security;

revoke all on table public.skill_versions from anon, authenticated;
revoke all on table public.style_profiles from anon, authenticated;

grant select on table public.skill_versions to authenticated;
grant select on table public.style_profiles to authenticated;

drop policy if exists "skill_versions_select_own" on public.skill_versions;
create policy "skill_versions_select_own"
on public.skill_versions for select to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "style_profiles_select_own" on public.style_profiles;
create policy "style_profiles_select_own"
on public.style_profiles for select to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);
