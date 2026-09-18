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

## 4. Data retention

Clinical/patient information must not remain on the server for more than 15 days.

Production backend requirements:

- every patient/shift/reference record has created_at and expires_at,
- purge all related patient data and generated/finalized summaries when expired,
- no orphan clinical data may remain after purge,
- frontend/local caches must also be cleared appropriately.

The current prototype only demonstrates this with localStorage cleanup.

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
- each entry includes a type field, e.g. CT, CXR, Ultrasound
- each entry has its own status, result textarea, and Save Result

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

Future production behavior:

- sends patient data to the backend Summary Skill,
- receives generated summary text,
- inserts text into the editable summary textarea.

The current prototype uses deterministic mock generation.

### Summary textarea

- fully editable by the user,
- user can revise generated wording before finalization.

### Finalize Summary

Button:

- FINALIZE SUMMARY

On finalize:

1. save the current textarea text as the finalized summary,
2. copy the finalized text to the clipboard when browser permissions allow,
3. mark the patient Completed,
4. send/store the finalized summary as temporary backend reference material.

If the summary is edited after finalization, the UI shows that it changed and should be finalized again.

## 12. Backend Skill and writing style

Not visible in the operational frontend.

### Summary Skill

Defines:

- required summary structure,
- factual constraints,
- what information should be included,
- formatting and clinical-documentation rules.

Approved/finalized summaries do not automatically rewrite the Skill.

Skill changes require an explicit backend/admin update workflow.

### Writing style

Finalized summaries can be used to improve a compact admin writing-style profile.

The system should learn only stylistic patterns such as:

- preferred sentence length,
- terminology,
- concision,
- chronology,
- formatting,
- typical phrasing,
- abbreviation preferences.

It must not learn patient-specific facts as writing style.

Full patient reports/summaries remain subject to the 15-day retention rule.

A de-identified/abstract style profile can be retained separately if it contains no patient-specific information.

## 13. Current frontend prototype storage

Current static prototype uses browser localStorage only.

This is for UI testing, not production clinical use.

Production implementation still requires:

- authentication,
- authorization,
- server-side concurrency control for one active shift,
- persistent backend database,
- retention enforcement,
- audit strategy,
- security review,
- institutional/GDPR approval where applicable.

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

### Backend-only modules

- Summary Skill
- Writing-style profile
- finalized-summary reference pipeline
- Skill update workflow
- retention/purge service
