-- BachTranSBO backend v1
-- Permanent case storage. No automatic retention/deletion is defined here.
-- Raw patient identifiers are not part of the data model.

create extension if not exists pgcrypto;

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'closed')),
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_shift_per_owner
  on public.shifts(owner_id)
  where status = 'active';

create index if not exists shifts_owner_started_idx
  on public.shifts(owner_id, started_at desc);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  sex text,
  year_of_birth integer,
  main_complaint text not null default '',
  complaint text not null default '',
  history text not null default '',
  physical_exam text not null default '',
  others text not null default '',
  therapy text not null default '',
  clinical_course text not null default '',
  disposition text not null default '',
  recommendations jsonb not null default '[""]'::jsonb,
  hospital text not null default '',
  ward text not null default '',
  accepting_physician text not null default '',
  admission_note text not null default '',
  other_outcome text not null default '',
  other_details text not null default '',
  status text not null default 'active'
    check (status in ('active', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, local_id)
);

create index if not exists cases_shift_idx
  on public.cases(shift_id, created_at);

create index if not exists cases_owner_status_idx
  on public.cases(owner_id, status);

create table if not exists public.test_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null
    check (category in ('lab', 'ekg', 'gas', 'radiology', 'consultation')),
  sequence integer not null default 1,
  subtype text not null default '',
  mode text not null default 'waiting'
    check (mode in ('waiting', 'notordered')),
  result_text text not null default '',
  saved_result_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists test_entries_case_idx
  on public.test_entries(case_id, category, sequence);

create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  generated_text text not null default '',
  working_text text not null default '',
  finalized_text text not null default '',
  generated_at timestamptz,
  finalized_at timestamptz,
  model text,
  skill_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists summaries_owner_finalized_idx
  on public.summaries(owner_id, finalized_at desc);

-- Immutable snapshots of every finalized version. This is the future
-- doctor-approved AI learning corpus and preserves re-finalizations.
create table if not exists public.summary_revisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  generated_text text not null default '',
  finalized_text text not null,
  finalized_at timestamptz not null,
  model text,
  skill_version text,
  created_at timestamptz not null default now()
);

create index if not exists summary_revisions_case_idx
  on public.summary_revisions(case_id, finalized_at desc);

create index if not exists summary_revisions_owner_idx
  on public.summary_revisions(owner_id, finalized_at desc);

-- Row Level Security: this is a personal app, but ownership is still enforced
-- so browser credentials cannot read another user's rows.
alter table public.shifts enable row level security;
alter table public.cases enable row level security;
alter table public.test_entries enable row level security;
alter table public.summaries enable row level security;
alter table public.summary_revisions enable row level security;

revoke all on table public.shifts from anon, authenticated;
revoke all on table public.cases from anon, authenticated;
revoke all on table public.test_entries from anon, authenticated;
revoke all on table public.summaries from anon, authenticated;
revoke all on table public.summary_revisions from anon, authenticated;

grant select, insert, update, delete on table public.shifts to authenticated;
grant select, insert, update, delete on table public.cases to authenticated;
grant select, insert, update, delete on table public.test_entries to authenticated;
grant select, insert, update, delete on table public.summaries to authenticated;
grant select, insert, update, delete on table public.summary_revisions to authenticated;

drop policy if exists "shifts_select_own" on public.shifts;
create policy "shifts_select_own"
on public.shifts for select to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "shifts_insert_own" on public.shifts;
create policy "shifts_insert_own"
on public.shifts for insert to authenticated
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "shifts_update_own" on public.shifts;
create policy "shifts_update_own"
on public.shifts for update to authenticated
using (auth.uid() is not null and auth.uid() = owner_id)
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "shifts_delete_own" on public.shifts;
create policy "shifts_delete_own"
on public.shifts for delete to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "cases_select_own" on public.cases;
create policy "cases_select_own"
on public.cases for select to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "cases_insert_own" on public.cases;
create policy "cases_insert_own"
on public.cases for insert to authenticated
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "cases_update_own" on public.cases;
create policy "cases_update_own"
on public.cases for update to authenticated
using (auth.uid() is not null and auth.uid() = owner_id)
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "cases_delete_own" on public.cases;
create policy "cases_delete_own"
on public.cases for delete to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "tests_select_own" on public.test_entries;
create policy "tests_select_own"
on public.test_entries for select to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "tests_insert_own" on public.test_entries;
create policy "tests_insert_own"
on public.test_entries for insert to authenticated
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "tests_update_own" on public.test_entries;
create policy "tests_update_own"
on public.test_entries for update to authenticated
using (auth.uid() is not null and auth.uid() = owner_id)
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "tests_delete_own" on public.test_entries;
create policy "tests_delete_own"
on public.test_entries for delete to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "summaries_select_own" on public.summaries;
create policy "summaries_select_own"
on public.summaries for select to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "summaries_insert_own" on public.summaries;
create policy "summaries_insert_own"
on public.summaries for insert to authenticated
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "summaries_update_own" on public.summaries;
create policy "summaries_update_own"
on public.summaries for update to authenticated
using (auth.uid() is not null and auth.uid() = owner_id)
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "summaries_delete_own" on public.summaries;
create policy "summaries_delete_own"
on public.summaries for delete to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "revisions_select_own" on public.summary_revisions;
create policy "revisions_select_own"
on public.summary_revisions for select to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "revisions_insert_own" on public.summary_revisions;
create policy "revisions_insert_own"
on public.summary_revisions for insert to authenticated
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "revisions_update_own" on public.summary_revisions;
create policy "revisions_update_own"
on public.summary_revisions for update to authenticated
using (auth.uid() is not null and auth.uid() = owner_id)
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "revisions_delete_own" on public.summary_revisions;
create policy "revisions_delete_own"
on public.summary_revisions for delete to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);
