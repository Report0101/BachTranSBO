-- Store how the patient/case arrived to the SBO.
-- arrival_mode is one of the standard workflow options; arrival_other
-- stores free text when arrival_mode = 'other'.

alter table public.cases
  add column if not exists arrival_mode text not null default '',
  add column if not exists arrival_other text not null default '';
