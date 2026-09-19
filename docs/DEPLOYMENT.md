# Deployment and operations

## 1. Export the authoritative skill

Export/copy the complete **SBO Documentation AI** rules from your ChatGPT Skills into a private UTF-8 file. If the skill depends on other instruction/resource files, produce a reviewed, self-contained master-rules file that includes those required rules. Do not point at a SKILL.md whose relative references have not been included. Mount this outside the public repository, e.g. `/run/secrets/sbo-master-rules.md`, and set `SBO_RULES_FILE` to its path.

The API reads this file for each generation and reports its SHA-256 in response metadata. Missing/empty rules fail with HTTP 503. No guessed master rules ship with the app. Changing a ChatGPT skill does not change the server file automatically: re-export and deploy the reviewed version. Hosted API skill retrieval is not implemented.

## 2. Prepare private Google Drive storage

Enable Google Drive API in a Google Cloud project. Use a dedicated folder and credentials restricted to this application:

- For a service account, use a **Google Workspace Shared Drive**, give the service account permission to add and permanently delete files, and mount its JSON credentials. Service accounts do not have personal My Drive storage quota.
- For personal My Drive, use authorized-user OAuth credentials with a refresh token from an offline consent flow. Authorize `https://www.googleapis.com/auth/drive.file` and grant the app access to the target folder using Google Picker or create the folder with that app. A pre-existing folder ID alone does not grant `drive.file` access.

Set `GOOGLE_APPLICATION_CREDENTIALS` to the mounted credentials JSON and `GOOGLE_DRIVE_FOLDER_ID` to the dedicated folder ID. Never publish either credential material or summaries. The server uploads JSON with opaque names and only `summary`, `expires_at`, `schema_version`. It does not enumerate unrelated Drive files. Future generations load only unexpired, finalized file IDs registered in the server database, at most five.

Keep `/data` durable: losing the SQLite registry loses case state and the retention index for existing Drive files. Before intentionally deleting a deployment/database, delete its associated reference files. Restore the registry if storage is lost; inspect and clean the dedicated folder before restarting a fresh database. Do not copy a live DB with pending operations without a coordinated backup.

## 3. Deploy the API

Use a persistent VM/container service behind HTTPS, with **one process / one replica**. This implementation serializes state transitions and upstream calls with an in-process lock. Do not enable multiple workers or horizontal scaling. Configure the proxy with a 200 KB body limit, request/header timeouts, IP rate limiting and no request-body/Authorization logging. Backend authenticated requests have an additional 30 requests/minute limit. Only liveness is public.

Build from the repository root:

```sh
docker build -f backend/Dockerfile -t bachtransbo-api .
```

Create a private environment file from `backend/.env.example`. Generate the access token securely (for example, `python -c 'import secrets; print(secrets.token_urlsafe(32))'`). Configure the following on the server only:

| Variable | Value |
| --- | --- |
| `SBO_ACCESS_TOKEN` | Unique random token, at least 32 characters; share only with the clinician |
| `OPENAI_API_KEY` | Key from the intended OpenAI API project |
| `OPENAI_MODEL` | Exact text-generation model ID accessible to that project |
| `SBO_RULES_FILE` | Absolute path to exported complete rules |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute credential-file path |
| `GOOGLE_DRIVE_FOLDER_ID` | Dedicated private folder ID |
| `SBO_DB_PATH` | `/data/sbo.sqlite3` on durable encrypted storage |
| `ALLOWED_ORIGINS` | `https://report0101.github.io` (comma-separated exact origins, no trailing slash) |

Provision a persistent `/data` volume writable by container UID 10001. Mount credentials/rules read-only and readable by that UID. Example (replace host paths):

```sh
docker run -d --name bachtransbo-api --restart unless-stopped \
  --env-file /srv/bachtransbo/server.env \
  --mount type=bind,src=/srv/bachtransbo/data,dst=/data \
  --mount type=bind,src=/srv/bachtransbo/secrets,dst=/run/secrets,readonly \
  -p 127.0.0.1:8080:8080 bachtransbo-api
```

Place an HTTPS reverse proxy in front of port 8080. Do not expose plain HTTP remotely. Ensure the backend process stays running for retention cleanup; monitor cleanup failures. Mount the rules, DB and Google secrets in encrypted storage with appropriate host access controls. Rotate the workspace token by changing the environment and restarting the server; existing browser tokens then fail.

For local synthetic testing, run `uvicorn backend.service:create_app --factory --port 8080 --no-access-log` with those environment variables set, and add `http://127.0.0.1:8765` to `ALLOWED_ORIGINS`. Serve the frontend over local HTTP. `file://`/null-origin access is intentionally rejected.

## 4. Publish frontend

Set the public `config.js` `apiBaseUrl` to your API's HTTPS origin, e.g. `https://sbo-api.example.org`. No secret belongs in this file. The address may also be entered in the UI; a saved browser override takes precedence. Clear that override when changing deployment hosts.

Review and merge the feature branch when ready. The existing Pages workflow runs on main and now publishes only `index.html`, `styles.css`, `app.js`, `config.js` and `.nojekyll`. In GitHub repository Settings → Pages, select GitHub Actions. This task preserves `main`; pushing a feature branch alone does not update an existing Pages deployment from main. Do not publish server secrets or patient fixtures on any branch.

Open Pages, create a synthetic patient, enter the backend access token and press **TEST API**. This authenticates and checks the rules file, model metadata access and Drive folder write capability. It does not charge for a generated summary or prove Drive upload/delete permissions; the lifecycle smoke test below does.

## 5. Smoke test with synthetic data

1. `GET /health` returns `{ "ok": true }`. It is liveness, not dependency readiness.
2. `GET /api/test` with `Authorization: Bearer <workspace token>` returns readiness checks. Missing token must return 401. A disallowed browser origin must return 403.
3. Generate a synthetic case, edit and finalize; verify exactly one JSON file appears in the folder.
4. Close, reload the page, sync server state, reopen, undo; verify the Drive file is permanently deleted.
5. Make a new case and confirm removed references are not used (`meta.goldReferencesUsed`).
6. Restart the backend with the same volume and verify case state remains.

If an upload response is lost, its reserved Drive ID is retained as pending. Retry the same finalize request, or sync and Undo Finalize to delete the pending upload. A successful upload with a lost HTTP response may require sync and undo before generating again. Do not manually delete the database to clear an error.

## API contract

All endpoints except health require the backend bearer token. Requests and responses are `Cache-Control: no-store`. Invalid request bodies produce a generic 422 without echoing clinical data; provider failures produce generic 502. Rules misconfiguration returns 503. Stale revisions/invalid state transitions return 409. Requests over 200 KB return 413.

| Endpoint | Request / purpose |
| --- | --- |
| `GET /health`, `GET /api/health` | Public liveness |
| `GET /api/test` | Authenticated configuration/provider checks, retention sweep |
| `GET /api/cases/{uuid}` | Authoritative revision/state/reference IDs |
| `POST /api/summary/generate` | `{case_id, revision, patient}` → `summary`, state/revision, rules hash/reference count |
| `POST /api/summary/finalize` | Same + `summary`, `reference_reviewed:true`; requires prior generation of same clinical data |
| `DELETE /api/summary/finalize/{case_uuid}?revision=N` | Delete finalized/pending Drive reference for this case (path is a **case UUID**, not a Drive file ID) |
| `POST /api/cases/{uuid}/close` | `{case_id, revision, patient, summary}`; requires matching finalized data/text |
| `POST /api/cases/{uuid}/reopen` | `{case_id, revision, patient}` |

Patient fields: `sex`, `age`, `mainComplaint`, `complaint`, `history`, `physical`, `diagnoses[]`, `tests` (`labs[]`, `ekg`, `gas`, `radiology[]`, `consultations[]`), `others`, `therapy`, `clinicalCourse`, `disposition`, `recommendations[]`, `admission`, `otherOutcome`, `otherDetails`. Test entries use `status` = `waiting`, `notordered` or `result`, with confirmed text in `result`. Browser-supplied instructions/gold references are not accepted. Unknown patient fields are rejected. See `backend/service.py` for limits and exact schema.

## Sources

- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create): server instructions and `store:false`.
- [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads): multipart upload and pre-generated file IDs.
- [Drive deletion](https://developers.google.com/workspace/drive/api/guides/delete): permanent file deletion.
