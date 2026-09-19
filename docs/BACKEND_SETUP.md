# BachTranSBO backend setup (Supabase)

This branch replaces clinical-data `localStorage` persistence with a Supabase backend while keeping the current HTML/CSS/JavaScript UI.

## 1. Create a Supabase project

Create a project in the Supabase dashboard. For a Hungary/EU deployment, choose an EU region that fits your requirements.

## 2. Run the migration

Open the Supabase SQL editor and run:

`supabase/migrations/001_backend_v1.sql`

It creates:

- `shifts`
- `cases`
- `test_entries`
- `summaries`
- `summary_revisions`

The schema keeps cases permanently. No 15-day deletion job is defined.

Every table has Row Level Security and ownership policies based on `auth.uid()`.

## 3. Configure browser credentials

Edit `config.js`:

```js
window.BACH_SBO_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "YOUR_PUBLISHABLE_KEY",
  authRedirectTo: window.location.origin + window.location.pathname
};
```

Use the browser-safe **publishable/anon key**, never a `service_role` key.

## 4. Configure Auth

The frontend uses Supabase email magic-link / OTP sign-in.

In Supabase Auth settings:

1. enable Email provider,
2. add the GitHub Pages site URL as an allowed redirect URL,
3. sign in with the email account you want to use for the personal app.

## 5. Data model

```text
User
 └─ Shift
     └─ Case
         ├─ Test entries
         └─ Summary
             └─ Summary revisions
```

`summary_revisions` is append-only from the application's point of view and preserves each doctor-approved finalized version. It will later become the AI retrieval/learning corpus.

## 6. Current milestone

This branch implements the persistence/authentication foundation only.

Next milestones:

1. automatic de-identification before permanent storage,
2. server-side Generate Summary Edge Function,
3. SBO Documentation Skill/version storage,
4. embeddings + similar-case retrieval,
5. AI-learning/admin dashboard.

## Privacy rule

BachTranSBO intentionally does not model patient name, TAJ, full date of birth, address, phone, or email. Free-text can still contain accidental identifiers; the planned privacy layer must remove them before permanent storage and before sending text to an external model.
