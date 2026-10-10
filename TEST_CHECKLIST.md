# MYNAIRATRACK — Phase 12 Test Traceability Checklist

Results log for Phase 12 (Testing and validation).
Backend: **145 passed** · Frontend: **64 passed** · `tsc && vite build`: **passed**
Health `/health`: ok · DB `/db-check`: ok:true
Scripted end-to-end (signup → accounts → transactions → budgets → goals → dashboard → Business Mode): **9/9 checks passed**, test data cleaned up.

| PRD requirement | Phase | Tests | Result |
|---|---|---|---|
| Project setup, runnable skeleton | 1 | smoke: `/health`, `/db-check` | pass |
| Data model, migrations, seed (4 currencies, default categories) | 2 | `test_phase2.py` (10) | pass |
| Register/login/logout, Argon2, JWT httpOnly cookie, expiry, per-user isolation, NGN default | 3 | `test_phase3.py` (18), `routes.test.ts` | pass |
| MVP currencies enforced; FX provider → backend → cached rates; cached fallback; unavailable state; React never calls provider | 4 | `test_phase4.py` (17), `currency.test.ts`, `CurrencySelector.test.tsx` | pass |
| Accounts CRUD, immutable currency, native balances, same-currency sums, isolation | 5 | `test_phase5.py` (14), `accounts.test.ts`, `Accounts.test.tsx` | pass |
| Income/expense CRUD, original currency preserved, quick+detailed entry, category compatibility, filters, edit/delete, account-delete protection | 6 | `test_phase6.py` (19), `transactions.test.ts`, `TransactionForm.test.tsx` | pass |
| Default + custom categories, type matching, ownership, delete protection | 7 | `test_phase7.py` (12), `categories.test.ts`, `Categories.test.tsx` | pass |
| Budgets with allocations, same-currency monitoring, statuses, unallocated spending, currency-change guard, guided allocation totals | 8 | `test_phase8.py` (14), `budgets.test.ts`, `Budgets.test.tsx` | pass |
| Savings targets + goals, manual progress, remaining/percent/status incl. overdue, currency guards | 9 | `test_phase9.py` (14), `goals.test.ts`, `Goals.test.tsx` | pass |
| Insights summaries + previous-period comparison, alert preferences/thresholds/dedup, in-app alerts + badge | 10 | `test_phase10.py` (15), `insights.test.ts`, `Insights.test.tsx` | pass |
| Business Mode activation, strict separation, `sale` on business accounts, per-currency/per-account profit, business budgets + categories, funding override without double-count | 11 | `test_phase11.py` (12), `business.test.ts`, `Business.test.tsx` | pass |
| Greeting follows time of day, correct boundaries, auto-update, real profile name | — | `greeting.test.ts` (8) | pass |
| Balance privacy hidden-by-default with eye toggle | — | `privacy.test.ts`, `BalanceToggle.test.tsx` | pass |

## Bug triage (Phase 12)

1. `_gated_budget` self-recursion from a bulk edit — caught by Phase 8 regression tests, fixed, full suite re-run green. Closed.
2. Categories list endpoint bypassed the shared serializer (missing `is_business`) — caught by new tests, fixed. Closed.
3. `GET /business/summary` `NameError` from a leftover variable — caught by tests, fixed. Closed.
4. Tool-shell wrapper exits (code 1, no traceback) after serving requests — environment/process-lifecycle behavior, not application code; backend relaunched detached and verified. No app defect. Monitoring only.
5. Library `StarletteDeprecationWarning`s (`HTTP_422_UNPROCESSABLE_ENTITY`, httpx TestClient) — upstream deprecations, no behavior impact. Deferred to post-MVP dependency upgrade.
6. Dev `JWT_SECRET` is short (triggers `InsecureKeyLengthWarning`) — local-dev only. Must be replaced with a long random value before any non-local use. Open, non-blocking for local MVP.

Zero open PRD-blocking defects.
