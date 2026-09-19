-- Keep the master SBO Documentation Skill fully backend-only.
-- Operational browser sessions must not be able to fetch Skill instructions.

revoke select on table public.skill_versions from authenticated;

drop policy if exists "skill_versions_select_own" on public.skill_versions;

-- service_role used by Edge Functions retains backend access.
