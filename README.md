# BachTranSBO - ER Command Center

Personal emergency-department command center for one active shift at a time, with permanent de-identified case storage and a future doctor-approved AI learning corpus.

## Current architecture

- Frontend: standalone HTML/CSS/JavaScript served by GitHub Pages.
- Backend foundation: Supabase Auth + PostgreSQL + Row Level Security.
- Persistence: shifts, cases, test entries, summaries, and finalized-summary revisions.
- Authentication: personal email magic-link / OTP.
- AI: the current **Generate Summary** button still uses deterministic mock generation; live GPT/SBO Documentation Skill integration is the next backend milestone.

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

This allows future retrieval/style learning to compare what the model generated with what the doctor actually approved.

## Privacy model

BachTranSBO does not intentionally model patient name, TAJ, full date of birth, address, phone, or email.

Free-text copied from another system may still accidentally contain identifiers. A dedicated automatic de-identification layer is the next required milestone before this branch should be used as a permanent real-world clinical corpus.

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
2. Run `supabase/migrations/001_backend_v1.sql`.
3. Put the project URL and **publishable key** in `config.js`.
4. Configure the GitHub Pages URL as an Auth redirect URL.
5. Sign in with your personal email account.

Never place a Supabase secret/service-role key in browser code.

## Next milestones

1. Automatic Hungarian-aware de-identification (TAJ, names, full DOB, phone, email, addresses, EHR identifiers).
2. Server-side `generate-summary` Edge Function.
3. SBO Documentation Skill + versioning.
4. Similar-case retrieval with embeddings/pgvector.
5. AI learning dashboard and Skill-change suggestions.
