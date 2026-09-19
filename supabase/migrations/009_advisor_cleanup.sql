-- Advisor cleanup and RLS hardening.

create index if not exists test_entries_owner_idx
  on public.test_entries(owner_id);

alter function public.match_finalized_cases(
  uuid,
  extensions.vector,
  uuid,
  integer
) security invoker;

drop policy if exists "skill_versions_deny_browser" on public.skill_versions;
create policy "skill_versions_deny_browser"
on public.skill_versions for select to authenticated
using (false);

drop policy if exists "shifts_select_own" on public.shifts;
create policy "shifts_select_own"
on public.shifts for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "shifts_insert_own" on public.shifts;
create policy "shifts_insert_own"
on public.shifts for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "shifts_update_own" on public.shifts;
create policy "shifts_update_own"
on public.shifts for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "shifts_delete_own" on public.shifts;
create policy "shifts_delete_own"
on public.shifts for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "cases_select_own" on public.cases;
create policy "cases_select_own"
on public.cases for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "cases_insert_own" on public.cases;
create policy "cases_insert_own"
on public.cases for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "cases_update_own" on public.cases;
create policy "cases_update_own"
on public.cases for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "cases_delete_own" on public.cases;
create policy "cases_delete_own"
on public.cases for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "tests_select_own" on public.test_entries;
create policy "tests_select_own"
on public.test_entries for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "tests_insert_own" on public.test_entries;
create policy "tests_insert_own"
on public.test_entries for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "tests_update_own" on public.test_entries;
create policy "tests_update_own"
on public.test_entries for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "tests_delete_own" on public.test_entries;
create policy "tests_delete_own"
on public.test_entries for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "summaries_select_own" on public.summaries;
create policy "summaries_select_own"
on public.summaries for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "summaries_insert_own" on public.summaries;
create policy "summaries_insert_own"
on public.summaries for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "summaries_update_own" on public.summaries;
create policy "summaries_update_own"
on public.summaries for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "summaries_delete_own" on public.summaries;
create policy "summaries_delete_own"
on public.summaries for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "revisions_select_own" on public.summary_revisions;
create policy "revisions_select_own"
on public.summary_revisions for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "revisions_insert_own" on public.summary_revisions;
create policy "revisions_insert_own"
on public.summary_revisions for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "revisions_update_own" on public.summary_revisions;
create policy "revisions_update_own"
on public.summary_revisions for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "revisions_delete_own" on public.summary_revisions;
create policy "revisions_delete_own"
on public.summary_revisions for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "style_profiles_select_own" on public.style_profiles;
create policy "style_profiles_select_own"
on public.style_profiles for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "skill_suggestions_select_own" on public.skill_suggestions;
create policy "skill_suggestions_select_own"
on public.skill_suggestions for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
