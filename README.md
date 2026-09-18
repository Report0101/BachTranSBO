# BachTranSBO - ER Command Center

Prototype web application for managing an emergency-department shift and producing a finalized case summary.

## Current prototype

The current frontend is a standalone HTML/CSS/JavaScript prototype (index.html). No production backend or live AI integration is implemented yet.

### Implemented in the prototype

- One active shift at a time.
- One-click **Start Shift**.
- **End Shift** requires two confirmations and typing `END`.
- Patient IDs reset from `01` for each shift.
- Patient table: ID, Sex, Age, Main complaint, Status.
- Patient status column shows only tests currently **Waiting for result**.
- Manual entry/paste for Complaint and Patient history.
- Physical examination.
- Test/result workflow:
  - Lab with up to Lab 1 / Lab 2 / Lab 3.
  - EKG.
  - AVG by default; switches to VVG when VVG is written in the result.
  - Radiology with **+ Add Radiology**.
  - Consultations with **+ Add Consultation** and a consultation type field (e.g. Cardiology, Neurology).
  - Default test state: **Waiting for result** (orange).
  - **Not ordered**: grey.
  - A typed result becomes **Result available** (green) only after **Save Result**.
- Therapy and clinical course.
- Final decision/disposition:
  - Discharged with numbered home recommendations.
  - Admitted/submitted with hospital, ward/department, accepting physician, and additional note.
  - Other outcome.
- Case Summary:
  - **Generate Summary** placeholder for a future backend Summary Skill.
  - Editable summary textarea.
  - **Finalize Summary** saves the final text, copies it to the clipboard when browser permissions allow, and marks the patient completed.
- Prototype retention cleanup is set to 15 days in local browser storage.

## Planned architecture

- Frontend: modular ER command-center UI.
- Backend: to be implemented separately.
- AI/Skill logic remains backend-only and must not be exposed in the operational UI.
- Finalized summaries can be used by a backend reference pipeline to improve writing style and, when explicitly requested, update the Summary Skill.
- Clinical/patient data must not be retained longer than 15 days.

## Important

This repository currently contains a prototype, not a production medical information system. Security, authentication, authorization, audit logging, data-retention enforcement, and institutional/GDPR requirements must be addressed before real patient data is used.
