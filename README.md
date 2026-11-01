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
Artifacts contain the HTML/JUnit and TRX reports; traces,
screenshots and videos are disabled because test pages may contain access links.

The project is a test environment. Authenticated E2E coverage must use isolated
fixtures and an approved way to obtain guest confirmations without publishing
credentials, tokens, or personal links. The two pipeline jobs completed
successfully on GitHub Actions: deployed smoke checks and the application's
backend test suite. The authenticated Level 3 UI journey remains unfinished.
