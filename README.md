# Homework 8: group pre-order test automation

Direction 1: group pre-order. Approach: Playwright UI and API tests, organized
by feature; no browser credentials or email links are stored in the repository.

The deployed Level 3 journey has passed in GitHub Actions: two guests confirm
their orders by email, the owner removes one confirmed guest and submits the
remaining order, and the waiter sees only the remaining dish. Other checks cover
anonymous access, missing and foreign guests, the last guest, and public pages.
Some Level 1/2 edge cases are covered only by the application's in-memory .NET
suite, rather than by tests against the deployed API.

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

The project is a test environment. The owner deletion, owner-to-waiter and
email-backed confirmed-guest jobs have passed in GitHub Actions. They run on
explicit workflow dispatch; the email-backed job requires a dedicated test
mailbox and creates a submitted reservation that cannot be cancelled by API.

The email-backed journey in `confirmed-guests-live.spec.js`: two
guests each order a different dish and confirm it using a real email link;
the owner removes the first confirmed guest and submits the remainder, and the
waiter checks the receipt. It is opt-in (`run_confirmed_guests` in Actions),
requires secrets `GUEST_EMAIL` and `GMAIL_APP_PASSWORD` in addition to the role
credentials. Use a dedicated verified SES
test mailbox: a Gmail app password grants broad mailbox access even though the
test searches read-only for recent confirmation messages and selects the link by
unique order ID. Screenshots/traces are disabled for this scenario; do not commit or paste
confirmation links. As with the other submit scenario, a submitted reservation
remains in the test environment and no automatic retry is performed.
