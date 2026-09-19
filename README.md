# BachTranSBO

The v5 EN/HU frontend runs on GitHub Pages; a separate authenticated Python API generates Hungarian SBO summaries and stores reviewed final summaries in Google Drive. Status dots remain in test-card headers (orange waiting, grey not ordered, green saved result). Summary generation has no local rules-engine fallback.

## Deployment

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for server setup, Google Drive credentials, authoritative SBO rules, public frontend configuration and smoke tests. GitHub Pages cannot run the Python backend.

The source is ready for configuration and deployment. It does **not** contain your ChatGPT SBO Documentation AI skill, OpenAI key, Google credentials or a deployed API address. Generation deliberately fails until the exact exported master rules are mounted on the server. A ChatGPT skill's display name is not its API-project skill ID, and this app does not claim automatic synchronization with ChatGPT.

## Workflow

1. Start a shift and enter a case. Save individual test results before generation.
2. Configure the HTTPS backend address and enter the separate backend access token (memory only).
3. Test API, then generate a summary. Review and edit the text.
4. Finalize saves the reviewed reference to Drive. Only a successful server response updates the UI.
5. Close the finalized case. Reopen permits Undo Finalize; undo permanently deletes that Drive reference before returning the case to an editable draft.
6. To replace an existing reference: reopen if needed, undo, generate again, review, finalize.

The server verifies case revision, clinical fingerprint and finalized summary hash. Changed clinical data requires regeneration. A failed request never silently becomes a successful local finalization. Use **SYNC CASE STATE** after a timeout or revision conflict, then retry or undo a pending finalization.

## Storage and scope

This is a **single-clinician deployment**. One high-entropy access token authorizes the whole workspace. Do not share it among multiple clinicians; multi-user authentication and ownership isolation are not implemented. The backend keeps case state, hashes, expiry and Drive IDs in SQLite, not full patient drafts. Drafts live in the browser tab's `sessionStorage` and clear on End Shift; browser session restoration may retain them. Do not use a shared/untrusted browser profile. Old prototype `localStorage` is not imported; clear it manually if it contains patient data.

Reviewed summaries are stored in a dedicated private Drive folder, used as style examples for up to 15 days, and permanently deleted on undo or expiry. No local phrase-learning engine or automatic skill rewriting remains. Direct identifiers are not separate fields in the API, but free text may still contain identifying information: the clinician must remove it before generation/reference approval. The review confirmation is not an automated anonymization guarantee.

The existing 15-day retention policy remains in force, including gold references. The running backend checks expiry every minute and before generate/finalize/test. Expired references cannot be used even if a provider outage delays deletion. Keep the service running and alert on `Retention cleanup failed`; a stopped server cannot delete Drive files. Configure volume and Drive backup policies separately; this app cannot erase provider backups. `store:false` disables OpenAI Responses application-state storage, not every provider retention mechanism.

Cross-device draft/shift restoration, institutional SSO, audit integrations and clinical validation remain outside this implementation. It is not a complete hospital EHR or a certification of production clinical suitability.

## Tests

```sh
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m pytest backend/tests -q
node --check app.js
```

Tests use synthetic cases and fake provider adapters; no real patient data or paid generation is required. The browser smoke test is documented in `tests/README.md`.
