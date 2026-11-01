# Homework 8: test automation — work in progress

Direction 1: group pre-order. Approach: Playwright UI and API tests, organized
by feature; no browser credentials or email links are stored in the repository.

This suite is **not a completed Level 3 assignment**. It checks public catalog,
anonymous protection, table search, an invalid invitation and, when explicitly
enabled, owner deletion and submission with waiter receipt. Email confirmation
and deletion of a confirmed guest are not yet automated on the deployed app.

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

An additional opt-in owner scenario (`RUN_OWNER_LIVE=1 npm run test:owner-live`)
logs in through Cognito, creates two disposable reservations and draft guests,
checks cross-group (400), missing guest (404), anonymous deletion (401/403),
and removes the last guest in the real UI, then cancels both reservations in cleanup. An owner
participant remains in the group, so the guest list is empty and total is zero.
Set `GUEST_EMAIL` to an SES-verified test mailbox, and `OWNER_EMAIL` and
`OWNER_PASSWORD` to run unattended. For manual login,
omit both, run Playwright with `--headed`, and sign in within two minutes.
To use CI, configure those two values as GitHub Actions secrets and select
`run_owner_live` in the workflow dispatch. Never enable this on an untrusted
deployment; it creates real reservations. The test does not confirm guest
orders or replace the required full end-to-end UI scenario. The application may
send test notifications to the guest and organizer as part of the removal flow.

An experimental opt-in `RUN_SUBMIT_LIVE=1 npm run test:owner-waiter-live`
adds a confirmed owner dish and a separate unconfirmed guest dish, submits in
the owner UI, and checks the waiter receipt. Once submitted, the test
reservation cannot be automatically cancelled and remains in the test
environment. CI dispatch `run_owner_waiter_live` requires `OWNER_EMAIL`,
`OWNER_PASSWORD`, `WAITER_EMAIL`, and `WAITER_PASSWORD` secrets. This does not replace the required confirmed-guest
removal journey. A separate diagnostic `waiter-receipt-live.spec.js` may be run
manually with `EXISTING_TEST_RESERVATION` to inspect an existing test receipt.

The project is a test environment. Full E2E coverage must use isolated
fixtures and an approved way to obtain guest confirmations without publishing
credentials, tokens, or personal links. The owner deletion and owner-to-waiter
jobs have both passed in GitHub Actions, in separate workflow runs. The full
confirmed-guest Level 3 journey remains unfinished.

An email-backed journey is prepared in `confirmed-guests-live.spec.js`: two
guests each order a different dish and confirm it using a real email link;
the owner removes the first confirmed guest and submits the remainder, and the
waiter checks the receipt. It is opt-in (`run_confirmed_guests` in Actions),
requires secrets `GUEST_EMAIL` and `GMAIL_APP_PASSWORD` in addition to the role
credentials, and has not yet been run end to end. Use a dedicated verified SES
test mailbox: a Gmail app password grants broad mailbox access even though the
test searches read-only for recent confirmation messages and selects the link by
unique order ID. Screenshots/traces are disabled for this scenario; do not commit or paste
confirmation links. As with the other submit scenario, a submitted reservation
remains in the test environment and no automatic retry is performed.
