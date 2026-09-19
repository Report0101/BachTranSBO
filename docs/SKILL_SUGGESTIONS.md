# Skill improvement suggestions

The master SBO Documentation Skill is versioned and is never automatically rewritten.

## Purpose

The Skill suggestion backend looks for repeated differences between:

```text
Generated draft
      ↓
Doctor-finalized summary
```

It tries to identify recurring **documentation-rule** problems that may belong in the master Skill.

Personal wording preferences belong in the separate writing-style profile and should not become Skill rules.

## Safety / approval

`analyze-skill` creates a `pending` suggestion only.

A review action can mark a suggestion:

- `accepted`
- `rejected`

Even an **accepted** suggestion does not modify `skill_versions`.

Creating a new Skill version remains a separate explicit human workflow.

## Minimum data

At least 10 Generated → Finalized pairs are required. Up to the 40 most recent pairs are analyzed.

## Function

`supabase/functions/analyze-skill/index.ts`

Generate a suggestion:

```json
{"action":"analyze"}
```

Review:

```json
{
  "action":"review",
  "suggestionId":"...",
  "decision":"accepted"
}
```

or use `rejected`.

The future AI Learning dashboard will expose these review actions.
