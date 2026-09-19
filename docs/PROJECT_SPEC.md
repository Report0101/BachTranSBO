# ER Command Center - Project Specification

## 1. Product goal

Build a lightweight emergency-department command center for one active clinical shift at a time.

The application is not intended to replace a hospital EHR. Its initial purpose is to:

- create and track patients during one ER shift,
- manually record clinical data,
- clearly show which ordered tests/consultations are still waiting,
- record the final disposition,
- generate an editable case summary through a future backend Skill,
- finalize the summary, copy it to the clipboard, and store it temporarily as backend reference material.

## 2. Development model

The project is designed as a modular monolith.

- One stable application shell.
- Features are implemented as independent modules.
- Future/unimplemented modules are visible as grey/disabled UI elements.
- Each module can be developed in a separate ChatGPT Project chat.
- Core contracts and shared state should not be redesigned by individual feature chats.
- Skill and writing-style management belongs to the backend and is not exposed in the operational UI.

## 3. Shift lifecycle

### Start Shift

- One click.
- No confirmation.
- At most one shift can be ACTIVE at any time.
- Patient numbering restarts from 01 for each new shift.
- If the browser is closed/reopened or refreshed, the active shift must be restored from the backend.

### Active shift header

Display:

- SHIFT ACTIVE
- start time
- Patients count
- Active count
- Completed count
- END SHIFT button

### End Shift

Requires two confirmations:

1. first confirmation shows patient counts and active/in-progress patients,
2. second confirmation requires typing END.

After ending a shift:

- the operational UI is cleared,
- browser/local draft state is cleared,
- the server-side shift becomes CLOSED,
- server data is not immediately deleted solely because the shift ended.

## 4. Permanent storage and privacy

Clinical cases and finalized summaries are retained permanently as the personal AI learning corpus.

There is no automatic 15-day deletion rule.

The application intentionally does not model direct patient identifiers such as:

- patient name,
- TAJ,
- full date of birth,
- address,
- phone number,
- email.

Free-text may nevertheless contain accidental identifiers when copied from another clinical system.

Before real clinical use with permanent storage, all text entering permanent storage must pass through an automatic de-identification layer. The same sanitized representation must be used before text is sent to external AI services.

The de-identification layer should detect at minimum:

- Hungarian TAJ,
- person names,
- full dates of birth,
- phone numbers,
- email addresses,
- postal addresses,
- external/EHR patient identifiers.

Full DOB should preferably be converted to clinically useful age where possible.

Detected raw identifiers must not be retained in a separate database.

## 5. Import new patient

Fields:

- ID: automatic, starting from 01 for each shift
- Sex
- Year of birth
- Main complaint

Age is calculated from year of birth.

## 6. Patient record table

Columns:

- ID
- Sex
- Age
- Main complaint
- Status

The Status column must show only items that are currently Waiting for result.

Examples:

- Lab 2
- CT
- Cardiology
- EKG

Tests that are Result available or Not ordered do not appear in the Status column.

## 7. Patient detail

### 7.1 Clinical

Fields:

- Main complaint
- Complaint
- Patient history

Complaint and Patient history are separate editable free-text boxes.

Both are entered manually or pasted from the clipboard.

No AI parsing is required.

## 8. Test results and status

### Core test status behavior

Every test entry has three effective states:

#### Waiting for result

- default state
- orange

#### Result available

- user types/pastes result text
- typing alone does not change the status
- user must click SAVE RESULT
- after Save Result the card becomes green

If a previously saved result is edited, it returns to Waiting for result until Save Result is pressed again.

#### Not ordered

- selected manually
- grey
- excluded from the Patient Record waiting-status column

### 8.1 Physical examination

Free-text field for main examination/status points.

### 8.2 Lab

- Lab 1 exists by default
- + ADD LAB creates Lab 2
- + ADD LAB can create Lab 3
- maximum in current V1: three lab entries

Each Lab has its own:

- status
- result textarea
- Save Result button

### 8.3 EKG

Single EKG entry with standard test status workflow.

### 8.4 AVG / VVG

- default label is AVG
- if VVG is written in the content, the entry displays VVG
- standard status workflow applies

### 8.5 Radiology

- one Radiology entry initially
- + ADD RADIOLOGY creates another entry
- each entry stores structured body part + modality (RTG / ultrahang / CT / MR)
- Other / specific permits a free-text test name
- the combined display type remains available to the AI payload
- each entry has its own status, result textarea, and Save Result
- extra radiology entries can be removed

### 8.6 Consultations

- one Consultation entry initially
- + ADD CONSULTATION creates another entry
- each entry includes a consultation type field, e.g. Cardiology, Neurology
- each entry has its own status, result textarea, and Save Result

### 8.7 Others

Free-text escape-hatch field for information not covered above.

## 9. What happens

Two free-text fields:

- Therapy
- Clinical course / patient status change

## 10. Final decision / disposition

This section records the clinical decision only.

It is not itself the action that marks a patient completed.

Default disposition is Active / in progress.

Before disposition, the doctor may enter one or more diagnoses as free text (Hungarian or Latin). These are doctor-supplied facts only; the summary model must not infer new diagnoses from test results.

### Discharged

Show numbered:

- recommendation and plan at home

User can add additional recommendation lines.

### Admitted / submitted

Fields:

- Hospital
- Ward / department
- Accepting physician
- Additional note

### Other

Fields:

- Outcome
- Details

Examples may include death, transfer, left against medical advice, etc.

## 11. Case Summary

This comes after Final decision / disposition.

### Generate Summary

Button:

- GENERATE SUMMARY

Current implementation:

- saves the current case through the privacy-gated backend,
- reads the de-identified case from PostgreSQL,
- loads the active backend SBO Documentation Skill version,
- loads an optional active writing-style profile,
- generates a draft with GPT in the `generate-summary` Edge Function,
- stores the original generated draft separately from later doctor edits,
- inserts the editable working text into the summary textarea.

Current retrieval behavior:

- finalized revisions store a de-identified clinical case snapshot,
- the snapshot is embedded with the configured embedding model,
- Generate Summary embeds the current de-identified case,
- up to four similar finalized cases are retrieved by cosine similarity,
- retrieved cases are supplied only as style/structure examples,
- the prompt explicitly forbids copying old patient facts into the current case.

### Summary textarea

- fully editable by the doctor,
- edits do not overwrite the original generated draft.

### Finalize Summary

Button:

- FINALIZE SUMMARY

On finalize:

1. save the latest sanitized clinical case,
2. save the original AI-generated draft,
3. save the doctor-finalized text,
4. mark the case Completed,
5. append an immutable finalized-summary revision,
6. copy the finalized text to the clipboard when browser permissions allow.

Every finalized revision becomes a doctor-approved example for the permanent AI corpus.

If the summary is edited after finalization, the UI shows that it changed and it should be finalized again.

## 12. Backend Skill and writing style

Skill and writing-style logic is backend-only and is never exposed as editable operational UI.

### Summary Skill

Defines:

- required summary structure,
- factual constraints,
- what information should be included,
- formatting and clinical-documentation rules.

The Skill is versioned.

Approved/finalized summaries do not automatically rewrite the Skill.

The system may analyze repeated doctor edits and create a pending Skill-improvement suggestion, but a new Skill version requires a separate explicit human workflow. Accepting a suggestion never mutates the master Skill automatically.

Writing-style learning is separate from Skill changes: the backend can generate an inactive style-profile candidate from recent Generated → Finalized pairs. A candidate affects generation only after explicit activation.

### Writing style and retrieval

The permanent corpus consists of:

- de-identified clinical case input,
- original generated draft,
- doctor-finalized summary,
- Skill/model metadata.

The system may use this corpus to:

- derive a compact writing-style profile,
- retrieve similar approved cases,
- compare generated text with finalized text,
- suggest Skill improvements.

Patient-specific facts must not be generalized into the writing-style profile.

## 13. Backend and persistence

The backend foundation uses Supabase:

- Supabase Auth,
- PostgreSQL,
- Row Level Security,
- browser-safe publishable key,
- permanent storage for shifts/cases/results/summaries.

The browser must never receive a Supabase secret/service-role key.

Current backend tables:

- shifts,
- cases,
- test_entries,
- summaries,
- summary_revisions,
- skill_versions,
- style_profiles.

The server database enforces at most one ACTIVE shift per owner.

The application restores the active shift and its cases from the backend after refresh or on another signed-in device.

The current branch implements backend persistence, de-identification, Skill versioning, server-side summary generation, similar-case retrieval, human-approved writing-style candidate generation, advisory Skill-improvement suggestions, and an AI Learning review dashboard. Deployment verification and broader production hardening remain.

## 14. Planned modules

### Core

- Application shell
- Shift Manager
- Patient Context
- Backend/API client
- Draft/local-state manager
- Module registry

### Clinical modules

- Patient Import / Patient Record
- Clinical
- Test Results
- What Happens
- Final Decision
- Case Summary
- Save / persistence

### AI Learning module

The operational sidebar includes an AI Learning dashboard that can:

- show finalized corpus size,
- show the active Skill version,
- show active/inactive writing-style profiles,
- generate a style candidate after the minimum finalized-case threshold,
- explicitly activate a reviewed style profile,
- generate pending Skill-improvement suggestions,
- explicitly accept/reject suggestions for human follow-up.

Accepting a Skill suggestion does not change `skill_versions`.

### Backend-only modules

- De-identification/privacy filter
- Summary Skill
- Skill versioning
- Writing-style profile
- Similar-case retrieval / embeddings
- Finalized-summary corpus
- Skill update suggestion workflow
