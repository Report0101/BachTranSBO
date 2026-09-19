# AI Learning dashboard

The AI Learning screen is intentionally separate from the ER operational workflow.

## Metrics

It shows:

- finalized corpus count,
- active SBO Documentation Skill version,
- active writing-style profile.

## Writing style

After at least 5 finalized cases:

1. **Generate Candidate** calls `analyze-style`.
2. The backend creates a new inactive style profile.
3. The full candidate text is shown for review.
4. **Activate** is an explicit user action.
5. Only the active style profile is used by `generate-summary`.

## Skill suggestions

After at least 10 Generated → Finalized pairs:

1. **Analyze Edits** calls `analyze-skill`.
2. The backend creates a pending suggestion.
3. The user can Accept for follow-up or Reject.
4. Accepting only changes suggestion status.
5. It never updates `skill_versions` and never changes the active Skill.

## Data boundaries

The dashboard reads only the authenticated user's corpus metadata/candidates through RLS.

Permanent clinical writes continue to go exclusively through the privacy-gated backend.
