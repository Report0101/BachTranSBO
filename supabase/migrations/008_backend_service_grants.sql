-- Explicit backend grants.
-- Secret-key clients map to service_role and bypass RLS, but table grants are
-- still evaluated. Keep the required backend privileges explicit.

grant select, insert, update, delete on table public.shifts to service_role;
grant select, insert, update, delete on table public.cases to service_role;
grant select, insert, update, delete on table public.test_entries to service_role;
grant select, insert, update, delete on table public.summaries to service_role;
grant select, insert, update, delete on table public.summary_revisions to service_role;
grant select, insert, update, delete on table public.skill_versions to service_role;
grant select, insert, update, delete on table public.style_profiles to service_role;
grant select, insert, update, delete on table public.skill_suggestions to service_role;
