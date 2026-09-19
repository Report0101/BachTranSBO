# BachTranSBO - ER Command Center

Personal emergency-department command center for one active shift at a time, with permanent de-identified case storage and a future doctor-approved AI learning corpus.

## Current architecture

- Frontend: standalone HTML/CSS/JavaScript served by GitHub Pages.
- Backend foundation: Supabase Auth + PostgreSQL + Row Level Security.
- Persistence: shifts, cases, test entries, summaries, and finalized-summary revisions.
- Authentication: personal email magic-link / OTP.
- Privacy gate: permanent clinical writes go through the `clinical-store` Edge Function.
- De-identification: deterministic Hungarian-aware rules plus a fail-closed AI person-name/missed-identifier pass.
- AI summary: **Generate Summary** now calls the server-side `generate-summary` Edge Function, which reads the de-identified case, active SBO Documentation Skill version, optional style profile, and calls GPT.

See `docs/BACKEND_SETUP.md` for setup.

## Current workflow

- One active shift at a time, enforced in the database.
- Patient IDs restart from `01` for every shift.
- Clinical free-text entry for complaint, history, examination, therapy, and course.
- Test/result workflow:
  - Lab 1-3.
  - EKG.
  - AVG / VVG.
  - Radiology.
  - Consultations.
  - Waiting for result / Result available / Not ordered states.
- Final disposition.
- Editable case summary.
- Finalize Summary:
  - stores the finalized text,
  - marks the case completed,
  - copies it to the clipboard when permitted,
  - stores an immutable finalized revision for the future AI corpus.

## Permanent case corpus

Cases are not automatically deleted after 15 days.

The intended long-term AI example is:

```text
de-identified clinical case
        +
AI generated draft
        +
doctor finalized summary
```

This allows retrieval/style learning to compare what the model generated with what the doctor actually approved. Finalized revisions store a de-identified case snapshot plus an embedding; Generate Summary retrieves similar approved cases as few-shot examples.

## Privacy model

BachTranSBO does not intentionally model patient name, TAJ, full date of birth, address, phone, or email.

Free-text copied from another system may still accidentally contain identifiers. Permanent clinical writes now pass through an automatic de-identification layer before they reach the corpus.

The target behavior is:

```text
raw free text
    ↓
automatic PII detection / de-identification
    ↓
permanent case database
    ↓
GPT / AI corpus
```

Raw identifiers must not be stored as a separate lookup table or training dataset.

## Repository layout

```text
index.html
styles.css
app.js
backend.js
config.js

supabase/
  migrations/
    001_backend_v1.sql

docs/
  PROJECT_SPEC.md
  BACKEND_SETUP.md
```

## Backend setup

1. Create a Supabase project.
2. Apply migrations `001_backend_v1.sql` through `006_skill_suggestions.sql` in order.
3. Put the project URL and **publishable key** in `config.js`.
4. Configure Auth and the GitHub Pages redirect URL.
5. Set `OPENAI_API_KEY`, `DEID_MODEL`, `SUMMARY_MODEL`, `EMBEDDING_MODEL`, `STYLE_MODEL`, and `SKILL_ANALYSIS_MODEL` as Supabase secrets.
6. Deploy `clinical-store`, `generate-summary`, `analyze-style`, and `analyze-skill`.
7. Insert the exact approved SBO Documentation Skill text as active Skill version 1.

Never place a Supabase secret/service-role key in browser code.

## Next milestones

1. AI learning dashboard for reviewing/activating style candidates and Skill suggestions.
2. End-to-end deployment/testing against the real Supabase project.
