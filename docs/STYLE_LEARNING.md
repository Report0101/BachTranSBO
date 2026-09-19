# Writing-style learning

BachTranSBO separates **clinical Skill rules** from **personal writing style**.

## What the system learns

The style learner analyzes pairs of:

```text
AI generated draft
        ↓ doctor edits
doctor-finalized summary
```

It may learn only abstract writing preferences, for example:

- sentence length,
- chronology,
- concision,
- terminology,
- abbreviation preferences,
- preferred/avoided phrasing,
- formatting,
- recurring editing transformations.

It must not retain patient-specific facts in the style profile.

## Approval model

Style learning does not silently change production behavior.

`analyze-style` creates a new **inactive candidate** in `style_profiles`.

A candidate becomes active only after an explicit `activate` action.

The master SBO Documentation Skill is never modified by this workflow.

## Minimum data

At least 5 finalized summaries are required.

The current implementation analyzes up to the 30 most recent finalized draft/final pairs.

## Edge Function

`supabase/functions/analyze-style/index.ts`

Actions:

```json
{"action":"analyze"}
```

creates an inactive candidate.

```json
{"action":"activate","profileId":"..."}
```

explicitly activates one profile and deactivates the previous active profile.

The future AI Learning dashboard will expose these actions in the UI.
