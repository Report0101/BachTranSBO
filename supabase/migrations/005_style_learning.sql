-- Style-learning metadata. Style profiles remain human-approved:
-- generated candidates are inserted inactive and must be explicitly activated.

alter table public.style_profiles
  add column if not exists source_revision_count integer not null default 0,
  add column if not exists model text,
  add column if not exists generated_at timestamptz;
