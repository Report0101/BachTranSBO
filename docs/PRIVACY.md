# Privacy and automatic de-identification

## Invariant

BachTranSBO does not intentionally collect direct patient identifiers.

If identifiers are accidentally pasted into clinical free text, they are treated as contamination and must be removed **before permanent storage** and before the case is used as an AI example.

## Permanent-write path

```text
Browser form
   |
   | authenticated HTTPS
   v
Supabase Edge Function: clinical-store
   |
   +--> deterministic scrub
   |      - TAJ
   |      - labelled full DOB
   |      - email
   |      - phone
   |      - labelled names
   |      - address
   |      - EHR/external IDs
   |
   +--> AI person-name / missed-identifier scrub
   |
   v
sanitized clinical state
   |
   v
PostgreSQL permanent corpus
```

The browser is intentionally denied direct INSERT/UPDATE/DELETE privileges on:

- `cases`
- `test_entries`
- `summaries`
- `summary_revisions`

so a normal frontend save cannot bypass the privacy filter.

## AI name scrub

The Edge Function uses an OpenAI model only after the deterministic pass has removed obvious structured identifiers.

Configure:

```text
OPENAI_API_KEY=...
DEID_MODEL=gpt-5.6-luna
```

If the AI name scrub is unavailable, malformed, or returns an invalid key set, the function **fails closed** and the clinical write is aborted.

The model is instructed to replace natural-person names with `[PERSON]` without rewriting the medical content.

## Date of birth

The application itself stores **year of birth**, because age is clinically useful.

A full DOB appearing in free text with a birth/DOB label is removed as `[DOB]`.

## Accepting physician

The current V1 permanent corpus replaces the explicit accepting-physician field with `[PERSON]`; the person's identity is not useful for future documentation style learning.

## No PII shadow database

The privacy filter stores only the sanitized case.

It must not store a reversible map such as:

```text
[PERSON] -> original name
[TAJ] -> original TAJ
```

Only aggregate removal counts may be retained or returned to the UI.
