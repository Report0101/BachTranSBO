-- Persist workflow skip state for narrative fields that must be resolved
-- before summary generation. Text presence implies "provided"; these flags
-- explicitly record "none / not applicable" across reloads.

alter table public.cases
  add column if not exists complaint_skipped boolean not null default false,
  add column if not exists history_skipped boolean not null default false,
  add column if not exists physical_exam_skipped boolean not null default false,
  add column if not exists therapy_skipped boolean not null default false,
  add column if not exists clinical_course_skipped boolean not null default false;
