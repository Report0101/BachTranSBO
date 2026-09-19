# Deployment checklist

Use this checklist only after reviewing draft PR #2.

## Supabase project

- [ ] Create the personal Supabase project.
- [ ] Confirm a publishable key and secret key exist.
- [ ] Apply migrations `001` → `008` in numeric order.
- [ ] Confirm pgvector/Vector extension is enabled by migration `004`.

## Authentication

- [ ] Enable email Auth.
- [ ] Create/sign in with the single owner account.
- [ ] Copy the owner's Auth user UUID.
- [ ] Disable public new-user signup after the owner account exists.
- [ ] Add `https://report0101.github.io/BachTranSBO/` to allowed Auth redirects.

## Function secrets

Set:

```text
OPENAI_API_KEY=...
DEID_MODEL=gpt-5.6-luna
SUMMARY_MODEL=gpt-5.6-terra
EMBEDDING_MODEL=text-embedding-3-small
STYLE_MODEL=gpt-5.6-luna
SKILL_ANALYSIS_MODEL=gpt-5.6-luna
APP_ORIGIN=https://report0101.github.io
APP_OWNER_USER_ID=YOUR_SUPABASE_AUTH_USER_UUID
```

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS`.

## Edge Functions

Deploy:

```bash
supabase functions deploy clinical-store
supabase functions deploy generate-summary
supabase functions deploy analyze-style
supabase functions deploy analyze-skill
supabase functions deploy learning-admin
```

All functions have `verify_jwt = true` in `supabase/config.toml`.

## SBO Documentation Skill

- [ ] Insert the exact approved master Skill as `skill_versions.version = 1`.
- [ ] Set it active.
- [ ] Do not put Skill instructions in browser files.
- [ ] Verify AI Learning shows only Skill name/version, never instructions.

## Browser config

Update `config.js` with:

- [ ] Supabase project URL.
- [ ] publishable key.
- [ ] correct redirect URL.

The publishable key is expected to be public; security relies on Auth, grants, RLS, and the single-owner checks.

## End-to-end smoke test

- [ ] Sign in via magic link.
- [ ] Start Shift.
- [ ] Add a case.
- [ ] Paste a fake name + fake TAJ into free text.
- [ ] Save and confirm the visible form is returned sanitized.
- [ ] Save a Lab result.
- [ ] Refresh browser and confirm data reloads.
- [ ] Generate Summary and confirm Skill version appears.
- [ ] Edit Summary.
- [ ] Finalize and confirm clipboard contains sanitized final text.
- [ ] Confirm `summary_revisions` contains case snapshot + generated/finalized pair.
- [ ] After several finalized cases, confirm similar cases are reported on Generate.
- [ ] At 5 finalized cases, generate a style candidate and confirm it is inactive.
- [ ] Explicitly activate the reviewed style candidate.
- [ ] At 10 draft/final pairs, generate a Skill suggestion.
- [ ] Accept/reject the suggestion and confirm `skill_versions` is unchanged.
- [ ] End Shift and start a new one; local patient numbering restarts from 01.

## Before merging to main

- [ ] GitHub Actions Backend checks are green on the final head.
- [ ] No raw PII test strings remain in the real database.
- [ ] No secret key/API key is present in GitHub source.
- [ ] Draft PR #2 is reviewed.


> Auth redirect path and CORS origin are intentionally different:
> redirect = `https://report0101.github.io/BachTranSBO/`,
> origin = `https://report0101.github.io`.
