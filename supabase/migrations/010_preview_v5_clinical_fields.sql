-- Preview v5 compatible clinical fields.
-- Keeps the Supabase backend as source of truth while preserving newer UI structure.

alter table public.cases
  add column if not exists diagnoses text not null default '';

alter table public.test_entries
  add column if not exists body_part text not null default '',
  add column if not exists modality text not null default '',
  add column if not exists other_test text not null default '';

comment on column public.cases.diagnoses is
  'Doctor-entered diagnoses only; generation must not infer new diagnoses from tests.';

comment on column public.test_entries.body_part is
  'Structured radiology body part from the ER UI.';
comment on column public.test_entries.modality is
  'Structured radiology modality, e.g. RTG, ultrahang, CT, MR, other.';
comment on column public.test_entries.other_test is
  'Free-text specific radiology test when modality is other.';
