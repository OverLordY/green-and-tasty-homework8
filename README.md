# Homework 8: test automation — work in progress

Direction 1: group pre-order. Approach: Playwright UI and API tests, organized
by feature; no browser credentials or email links are stored in the repository.

This initial suite is a **smoke test**, not a completed Level 3 assignment. It
checks the deployed public catalog, anonymous protection, table search and an
invalid invitation. It does not yet test authenticated owner and waiter flows,
guest confirmation, participant deletion, or group submission end to end.

Set `BASE_URL` and `API_BASE_URL` in your environment, then run `npm ci` and
`npm run test:smoke`. Install the Playwright browser with
`npx playwright install chromium`, or set `PLAYWRIGHT_EXECUTABLE_PATH` to an
existing compatible browser. The workflow requires GitHub repository variables
`BASE_URL` and `API_BASE_URL`, and `APP_REPOSITORY` containing the GitHub
`owner/repository` of the final application. The backend job checks out that
repository and runs its existing .NET integration/domain suite; those tests use
an in-memory backend and do not replace the required deployed UI E2E scenarios.
Artifacts contain the HTML/JUnit and TRX reports. Anonymous UI smoke tests also
attach a screenshot on failure; screenshots, traces and videos remain disabled
by default for future authenticated tests because pages may contain access links.

Run `npm run test:level3` for the deployed API check that rejects anonymous
participant deletion. It uses invented identifiers and cannot delete a real
guest. This single negative check does not constitute Level 3 completion.

An additional opt-in owner API scenario (`RUN_OWNER_LIVE=1 npm run test:owner-live`)
logs in through Cognito, creates two disposable reservations and draft guests,
checks cross-group (400), missing guest (404), anonymous deletion (401/403),
and last guest removal, and cancels both reservations in cleanup. An owner
participant remains in the group, so the guest list is empty and total is zero.
Set `OWNER_EMAIL` and `OWNER_PASSWORD` to run unattended. For manual login,
omit both, run Playwright with `--headed`, and sign in within two minutes.
To use CI, configure those two values as GitHub Actions secrets and select
`run_owner_live` in the workflow dispatch. Never enable this on an untrusted
deployment; it creates real reservations. The test does not confirm guest
orders or replace the required end-to-end UI scenario.

The project is a test environment. Authenticated E2E coverage must use isolated
fixtures and an approved way to obtain guest confirmations without publishing
credentials, tokens, or personal links. The two pipeline jobs completed
successfully on GitHub Actions: deployed smoke checks and the application's
backend test suite. The authenticated Level 3 UI journey remains unfinished.
