# BachTranSBO backend setup (Supabase)

This branch replaces clinical-data `localStorage` persistence with a Supabase backend while keeping the current HTML/CSS/JavaScript UI.

Clinical content is permanently stored only after automatic de-identification.

## 1. Create a Supabase project

Create a Supabase project. An EU region is appropriate if that matches your deployment/privacy requirements.

## 2. Apply database migrations

Apply all migrations in order:

1. `supabase/migrations/001_backend_v1.sql`
2. `supabase/migrations/002_privacy_hardening.sql`
3. `supabase/migrations/003_ai_summary.sql`

The first migration creates:

- `shifts`
- `cases`
- `test_entries`
- `summaries`
- `summary_revisions`

The second migration makes the permanent clinical tables browser read-only. Clinical writes are then accepted only through the `clinical-store` Edge Function.

The third migration adds backend-only versioned SBO Documentation Skill and writing-style profile tables.

Cases and finalized summaries are permanent. There is no 15-day deletion rule.

## 3. Configure browser credentials

Edit `config.js`:

```js
window.BACH_SBO_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "YOUR_PUBLISHABLE_KEY",
  authRedirectTo: window.location.origin + window.location.pathname
};
```

Use the browser-safe publishable key. Never put a secret/service-role key in browser code.

## 4. Configure Auth

The frontend uses Supabase email magic-link / OTP sign-in.

In Auth settings:

1. enable Email,
2. add the GitHub Pages URL as an allowed redirect URL,
3. use the personal email account intended for BachTranSBO.

## 5. Configure de-identification secrets

The `clinical-store` function performs deterministic identifier removal and then an AI pass for unlabelled names / missed identifiers.

Set:

```bash
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase secrets set DEID_MODEL=gpt-5.6-luna
supabase secrets set SUMMARY_MODEL=gpt-5.6-terra
```

The function fails closed when the AI privacy pass cannot complete successfully.

## 6. Deploy the Edge Function

With the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_ID
supabase functions deploy clinical-store
supabase functions deploy generate-summary
```

The function source is:

`supabase/functions/clinical-store/index.ts`

Shared privacy logic is:

`supabase/functions/_shared/deidentify.ts`

## 7. Configure the active SBO Documentation Skill

Follow `docs/SKILL_SETUP.md` and insert the exact approved Skill text as an active version in `skill_versions`.

`generate-summary` refuses to generate a clinical draft when no active Skill exists.

## 8. Privacy tests

Rule-level tests are in:

`supabase/functions/_shared/deidentify.test.ts`

They cover:

- TAJ,
- labelled full DOB,
- phone,
- email,
- labelled names,
- preservation of normal clinical dates,
- preservation of clinical numeric values.

## 9. Data model

```text
User
 └─ Shift
     └─ Case
         ├─ Test entries
         └─ Summary
             └─ Summary revisions
```

Every finalized revision is retained as a doctor-approved AI example.

The intended corpus unit is:

```text
de-identified clinical case
        +
original generated draft
        +
doctor-finalized summary
```

## 10. Current milestone

Implemented on `backend-v1`:

- Supabase Auth foundation,
- permanent PostgreSQL case storage,
- RLS,
- one active shift per owner,
- browser read-only clinical tables,
- privacy-gated Edge Function writes,
- deterministic PII rules,
- fail-closed AI person-name scrub,
- permanent finalized-summary revisions,
- versioned backend-only SBO Documentation Skill,
- optional versioned writing-style profile,
- live server-side GPT summary generation from de-identified DB state.

Still pending:

1. embeddings + similar-case retrieval,
2. automatic style-profile learning,
3. AI-learning/admin dashboard,
4. end-to-end deployment testing with the real Supabase project.

See `docs/PRIVACY.md` for the privacy architecture.
