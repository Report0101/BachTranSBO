# GitHub Pages + secure SBO API

This branch keeps the existing static app and replaces the mock generator with OpenAI Responses API calls through a Cloudflare Worker. No OpenAI key goes into browser code. No deployment is performed by committing this branch.

## 1. Deploy the backend

Use Node.js 22 or newer and a Cloudflare account. Check out this branch, then:

```sh
cd backend
npx wrangler@4 login
```

In `backend/wrangler.toml`, set `OPENAI_MODEL` to a Responses API model available in your OpenAI project. Set `ALLOWED_ORIGIN` to the exact frontend origin (normally `https://report0101.github.io`, without `/BachTranSBO` or a trailing slash). Choose an unused rate-limit namespace ID if `1001` is already used by another Worker in your account.

Create a separate high-entropy app access token using a password manager (at least 32 random bytes). This is NOT an OpenAI key. Store both values as Cloudflare secrets through the interactive prompts:

```sh
npx wrangler@4 secret put OPENAI_API_KEY
npx wrangler@4 secret put APP_ACCESS_TOKEN
npx wrangler@4 deploy
```

If Wrangler asks to create the Worker while adding the first secret, allow creation. Alternatively deploy the unconfigured Worker first; it rejects generation until all secrets and the model are set. Never paste either secret into GitHub, config.js, a URL, an issue, or a screenshot. OpenAI API billing is separate from ChatGPT access.

The endpoint is `https://bachtran-sbo-api.<your-subdomain>.workers.dev/api/sbo-summary`. Set this HTTPS URL in root `config.js` as `apiUrl`. Commit this public URL on the feature branch. Only this URL belongs in config.js.

## 2. Publish the frontend without merging main

In repository Settings → Pages, choose **Deploy from a branch**, select this feature branch and `/ (root)`, then Save. This changes the published Pages site, but does not modify main. The expected URL is `https://report0101.github.io/BachTranSBO/` unless Pages reports a custom domain. The current repo is private; GitHub Pages availability depends on the account plan. Do not make the repository public just to enable Pages without reviewing its contents.

For a custom domain, update `ALLOWED_ORIGIN` and redeploy the Worker. Do not use a wildcard. All frontend assets use relative paths, so the project subpath works. No GitHub Actions secret is needed. Only the static files are executed by Pages; backend source contains no credentials.

## 3. Verify with synthetic data

Open AI connection and enter the app access token. It stays only in the page's password field and clears on reload or Clear access token. Never enter the OpenAI API key here. Start a shift, add a synthetic patient, enter diagnoses, save test results, and Generate SBO Summary. Review/edit the Hungarian output, then Finalize. Generate another case to use the finalized example. Undo Finalize removes that case's example; re-finalizing replaces it. Close Case and Reopen Case are separate actions.

Check that a wrong token returns 401, another origin returns 403, and an unavailable backend leaves the old summary intact. The Worker admits at most 10 authorized calls per minute per Cloudflare location. This limiter is approximate, not a global billing cap; configure project spend controls and monitor usage. Missing backend configuration fails closed. No provider response bodies, tokens or patient data are logged by the application.

Run automated tests (no real API key or paid calls):

```sh
node --test tests/*.test.mjs
node --check app.js
```

## Rules and gold references

`backend/master-rules.mjs` reconstructs the rules visible in the referenced **SBO webapp** conversation: Latin diagnosis list; Hungarian flowing prose; preserve doses, routes, times, labs and uncertainty; no inferred diagnosis or invented negative; OMSz and accurate transfer wording. The original v4.4 attachment and standalone SBO Documentation AI skill were not available. This is an explicit recovery of the visible rules, not a claim of verbatim reuse of the unavailable file. Replace/reconcile this file with that authoritative prompt if recovered.

The backend uses `instructions` for the rules and sends current case JSON separately from at most five finalized summaries. References supply style only; they never authorize patient facts. This is request-time prompting, not model fine-tuning. References stay in the browser's existing localStorage with its 15-day retention and are included only during generation. Undo affects future requests, not requests already sent. Browser state is not shared across devices or origins. Earlier standalone HTML previews use a different origin and their localStorage is not automatically migrated. Preserve those files/data before switching.

## Data and operational limits

This retains the repository's browser-local patient storage. It is not an EHR or a multi-user authentication system. The separate app token is a single-operator access control; rotate it with `wrangler secret put APP_ACCESS_TOKEN` and distribute it privately. Add individual identity-based access before broader team use. User-entered notes and gold references can contain identifiers; both travel through Cloudflare to OpenAI. Do not assume automatic de-identification. `store: false` disables Responses application-state storage; it does not itself guarantee zero retention across providers. Establish approved data handling and clinician review before real patient use. Generated drafts can still be wrong despite instructions.

No live OpenAI quality test or deployment was performed without account configuration. Tests validate request handling, access control and failure behavior, not clinical correctness. To roll back, select the previous Pages branch; rotate the app token or remove the Worker to disable API access. main remains unchanged unless you separately merge.

Sources: [OpenAI Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Cloudflare rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
