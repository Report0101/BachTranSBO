-- Backend v1 privacy hardening.
-- Clinical tables become browser read-only. All permanent clinical writes must
-- go through the clinical-store Edge Function, which de-identifies first.

alter table public.cases
  add column if not exists deidentified_at timestamptz,
  add column if not exists deidentification_version text;

alter table public.summary_revisions
  add column if not exists deidentification_version text;

-- Browser sessions can read their own rows through RLS, but cannot directly
-- persist clinical content. The Edge Function writes with service_role only
-- after successful de-identification.
revoke insert, update, delete on table public.cases from authenticated;
revoke insert, update, delete on table public.test_entries from authenticated;
revoke insert, update, delete on table public.summaries from authenticated;
revoke insert, update, delete on table public.summary_revisions from authenticated;

grant select on table public.cases to authenticated;
grant select on table public.test_entries to authenticated;
grant select on table public.summaries to authenticated;
grant select on table public.summary_revisions to authenticated;

-- Policies remain useful for SELECT and as defense-in-depth if grants change.
