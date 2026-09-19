# Browser smoke test

Install Playwright 1.62.1 locally without committing `node_modules`, then its Chromium browser:

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
python -m http.server 8765 --bind 127.0.0.1
# In another terminal, from the repository root:
node tests/ui-smoke.cjs
```

The test intercepts only `https://backend.example` API calls and uses synthetic patient text. It verifies EN/HU Summary labels, authenticated requests, Generate → Finalize → Close → Reopen → Undo, no browser exceptions and absence of patient text/tokens from localStorage. It does not replace a real deployed provider smoke test. On a machine with Chrome instead of downloaded Chromium, use Playwright's `channel:'chrome'` launch option.
