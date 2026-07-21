# TestSprite AI Testing Report (MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** coin-terminal
- **Project Type:** frontend (Next.js 16 App Router + React 19 + Better Auth + Drizzle ORM/TiDB)
- **Date:** 2026-07-14
- **Prepared by:** TestSprite AI (MCP) + Cline driver
- **Server Mode:** development (npm run dev, http://localhost:3000 via TestSprite tunnel proxy.tun.testsprite.com:9090)
- **Scope:** Public / unauthenticated surface only (no test login credentials were available)
- **Project ID:** 375c6514-4347-4e86-9aef-b2bedad84cc1

---

## 2️⃣ Requirement Validation Summary

### Requirement: User Registration
- **Description:** A guest can create a private workspace with email/password via Better Auth and is routed into the onboarding flow.

#### Test TC003 Register a new workspace and continue to onboarding
- **Test Code:** [TC003_Register_a_new_workspace_and_continue_to_onboarding.py](./TC003_Register_a_new_workspace_and_continue_to_onboarding.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/375c6514-4347-4e86-9aef-b2bedad84cc1/599310cd-a208-4479-8dcc-367dea34c7b4
- **Status:** ✅ Passed
- **Severity:** HIGH
- **Analysis / Findings:** From the landing redirect, the agent clicked the "Create account" link to /register, filled Full name / Email / Password, and clicked "Continue to setup". `POST /api/auth/sign-up/email` returned 200, the authenticated bootstrap ran (`GET /api/bootstrap` 200, creating the empty private ledger), and the browser landed on `/onboarding`. Registration + first-time workspace bootstrap work end-to-end.

#### Test TC007 Register and continue to onboarding
- **Test Code:** [TC007_Register_and_continue_to_onboarding.py](./TC007_Register_and_continue_to_onboarding.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/375c6514-4347-4e86-9aef-b2bedad84cc1/fa646533-8937-46ca-a4a0-1d80e84718a6
- **Status:** ✅ Passed
- **Severity:** HIGH
- **Analysis / Findings:** A second independent registration happy-path run from a fresh session. Account creation succeeded and the user was routed into onboarding, confirming the flow is consistent and repeatable.

#### Test TC028 Show validation errors for invalid registration input
- **Test Code:** [TC028_Show_validation_errors_for_invalid_registration_input.py](./TC028_Show_validation_errors_for_invalid_registration_input.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/375c6514-4347-4e86-9aef-b2bedad84cc1/bbd9b7ad-9afb-451f-903f-cf55dca802dc
- **Status:** ✅ Passed
- **Severity:** MEDIUM
- **Analysis / Findings:** Submitting the registration form with invalid input (invalid email / password shorter than 8 characters) surfaced inline client-side validation errors (zod: "Enter a valid email address" / "Use at least 8 characters") and did not create an account. Validation works as intended.

### Requirement: Authentication Gates & Session Routing
- **Description:** Unauthenticated users are blocked from protected routes and redirected to sign-in; public auth pages link to each other.

#### Test TC008 Block unauthenticated access to the onboarding flow
- **Test Code:** [TC008_Block_unauthenticated_access_to_the_onboarding_flow.py](./TC008_Block_unauthenticated_access_to_the_onboarding_flow.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/375c6514-4347-4e86-9aef-b2bedad84cc1/acd05d70-6733-4b1e-8853-41811a291c00
- **Status:** ✅ Passed
- **Severity:** HIGH
- **Analysis / Findings:** An unauthenticated request to `/onboarding` was redirected (`GET /onboarding → 307` to `/sign-in`), confirming the auth gate prevents access to the post-registration setup flow without a session.

#### Test TC031 Switch from registration to sign-in
- **Test Code:** [TC031_Switch_from_registration_to_sign_in.py](./TC031_Switch_from_registration_to_sign_in.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/375c6514-4347-4e86-9aef-b2bedad84cc1/9eac8064-a5ec-473b-bc9b-b5673fd0a8ec
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** From `/register`, clicking the "Sign in" link navigated to `/sign-in` without submitting the registration form. Cross-page navigation between the two public auth pages works.

### Requirement: User Sign-in
- **Description:** Sign-in rejects invalid credentials and surfaces a server error in the UI.

#### Test TC030 Show an error for invalid sign-in credentials
- **Test Code:** [TC030_Show_an_error_for_invalid_sign_in_credentials.py](./TC030_Show_an_error_for_invalid_sign_in_credentials.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/375c6514-4347-4e86-9aef-b2bedad84cc1/0220e65b-4cc6-465c-8064-0514a4e0a991
- **Status:** ✅ Passed
- **Severity:** MEDIUM
- **Analysis / Findings:** Submitting sign-in with an unknown email/wrong password returned `POST /api/auth/sign-in/email → 401` (Better Auth: "User not found") and the UI displayed the error message. Auth-failure handling works correctly.

---

## 3️⃣ Coverage & Matching Metrics

- **100% of executed tests passed (6/6).**
- **Scope note:** 6 of the 31 planned cases were executed — only the public/unauthenticated subset. The remaining 25 cases require an authenticated session and were skipped because no test login credentials were supplied.

| Requirement | Total Tests | ✅ Passed | ❌ Failed |
|---|---|---|---|
| User Registration | 3 | 3 | 0 |
| Authentication Gates & Session Routing | 2 | 2 | 0 |
| User Sign-in | 1 | 1 | 0 |
| **Total** | **6** | **6** | **0** |

---

## 4️⃣ Key Gaps / Risks

1. **Limited coverage — authenticated flows untested.** 25 of 31 planned cases cover authenticated features (portfolio ledger, spending analysis, BTC research, smart-money watch, Ask Portfolio AI assistant, settings). They were skipped because no test `LOGIN_USER`/`LOGIN_PASSWORD` were provided. **Recommendation:** register a dedicated test account, configure its credentials in the TestSprite configuration portal (or via `needLogin: true` with credentials), and rerun with the remaining `testIds` to validate the protected surface.
2. **Dev-mode DB strain under concurrent cloud load.** During exploration the single-threaded Next.js dev server's DB pool briefly returned `GET /api/health → 503` (database unreachable) before recovering after a dev-server restart. **Recommendation:** for load-bearing verification, run the app in production mode (`npm run build && npm run start`); the MCP already caps dev-mode runs to 15 tests to mitigate this.
3. **Test data created in the dev database.** TC003 and TC007 created real test workspaces (`POST /api/auth/sign-up/email 200` + `GET /api/bootstrap 200`) in the dev TiDB database. These test accounts/ledgers persist and should be cleaned up if not wanted.
4. **Slow authenticated bootstrap in dev.** `GET /api/bootstrap` took 15–18s during registration (DB-heavy first-run workspace setup). Acceptable for dev, but worth monitoring if it regresses.
5. **No public landing page.** The root route `/` performs a server-side redirect (unauthenticated → `/sign-in`), so there is no static marketing/landing content to assert against.

---

_Report generated by TestSprite MCP Server v0.0.19, driven via the installed `TestSprite` MCP server in Claude Code. Raw data: `tmp/test_results.json`, `tmp/raw_report.md`._
