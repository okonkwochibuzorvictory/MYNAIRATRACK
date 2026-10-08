# MYNAIRATRACK — Final Implementation Plan (MVP)

> Source of truth: `MYNAIRATRACK 001-PRODUCT REQUIREMENTS DOCUMENT.docx` (finalized).
> This plan is strictly derived from the PRD. No product features beyond the PRD are included.
> No application code has been written. This document is the build blueprint, to be executed one phase at a time after approval.

---

## 1. Final technology stack (approved)

| Area | Recommended Tool | MVP Required? | Free Option? | Reason |
|---|---|---|---|---|
| Frontend | React + Vite | Yes | Yes (OSS) | Component UI for dashboard/budgets/accounts; fast local dev; hostable anywhere later |
| Backend | Python + FastAPI | Yes | Yes (OSS) | Simple typed API server; good local dev; fits finance CRUD |
| Database | PostgreSQL | Yes | Yes (OSS, free locally) | Relational ACID store for structured financial data and relationships |
| Authentication | Email + password, Argon2/pwdlib hashing, JWT in secure httpOnly cookie | Yes | Yes (OSS) | Secure, simple, free; PRD only requires account creation |
| Currency conversion | External FX API → FastAPI → PostgreSQL cached rates → reporting/consolidation | Yes | Yes (free-tier provider) | Latest provider rates cached in DB; reporting-only conversion; missing rate shows unavailable |
| Notifications/alerts | In-app alerts only | Yes (in-app) | Yes | PRD requires optional budget alerts; no email/push needed |
| Testing | pytest (backend), Vitest (frontend) | Yes | Yes (OSS) | Standard, free; covers currency rules |
| Local dev environment | Local Vite dev server + local FastAPI server + local PostgreSQL; Docker optional | Yes | Yes | Zero-cost local development |
| Version control | Git + GitHub | Yes | Yes | Already in use |
| File storage | None | No | N/A | No PRD requirement |
| Email service | None | No | N/A | No PRD requirement |
| Payment platform | None | No | N/A | PRD has no payments |
| Real-time/WebSocket | None | No | N/A | No PRD requirement |
| External auth providers | None | No | N/A | Local auth is sufficient |
| Live FX APIs | None (explicitly excluded) | No | N/A | PRD excludes live/automatic rates from MVP |
| Redis / cache | None | No | N/A | Unnecessary complexity for local MVP |
| Cloud hosting | None during initial development (local only) | No | N/A | PRD: run locally for now |

**Explicitly excluded from MVP** (future only if a real product requirement emerges): payment processing, file storage, email infrastructure, real-time/WebSocket infrastructure, external authentication providers, Redis, cloud hosting.

### Currency architecture (final, corrected)

**Flow:** External FX API → FastAPI backend → PostgreSQL cached exchange rates → MYNAIRATRACK reporting/conversion.

- **FX provider (MVP recommendation): open.er-api.com (ExchangeRate-API free open endpoint).** Free, no API key required, supports NGN/USD/EUR/GBP, HTTP JSON. Fits the zero-cost MVP and the four-currency scope. If it requires a key later or is replaced, the key lives only in `FX_API_KEY` env, never in frontend code.
- **Why it fits:** Reporting-only conversion for the All Currencies view; no trading, no live streaming, no paid plan. Provider sits behind a backend adapter interface (`backend/app/fx_provider.py`) so it can be swapped later without architectural changes.
- **Rules:** React must NOT call the FX provider directly. FastAPI fetches rates, stores rate + timestamp + provider/source in `exchange_rates`, and serves conversions from cache. On provider failure, use the most recent valid cached rate and clearly show last-update time + "cached rate" label. With no valid rate, show conversion as unavailable. Historical transaction/account/budget/savings/goal amounts and currencies are never rewritten. FX is for reporting/consolidation only; MYNAIRATRACK performs no currency exchange or trading.
- **Rate-table editing:** NOT a normal user setting. Rates come from the provider via the backend. Manual correction is an administrative/future capability only.

### Product decisions vs implementation decisions

**Product decisions (from PRD, not negotiable in implementation):**
- Nigerian-first positioning; NGN default primary currency; user-selectable primary currency.
- MVP currencies: NGN, USD, EUR, GBP. Additional currencies future only.
- Accounts/wallets, transactions, budgets, savings, goals each carry their own currency.
- Original transaction amount/currency always preserved; history never rewritten.
- One dashboard, primary-currency default, currency selector/filter, All Currencies consolidated view in primary currency.
- MVP budget rule: expense counts toward a budget only on same-currency match. No cross-currency budget conversion.
- Business profit within same currency. No raw addition of different currencies without conversion.
- In-app budget alerts only. Multiple income sources. Personal finance + Business Mode in one product.

**Implementation decisions (technical, chosen to serve the PRD at zero cost):**
- React + Vite / FastAPI / PostgreSQL / local JWT auth via secure httpOnly cookie / external FX API with PostgreSQL rate cache / pytest + Vitest / local-only run.
- Exact file layout, API shapes, and schema column names are implementation detail and may evolve within a phase, but must not change product behavior.

---

## 2. Local development setup

Keep setup as simple as reasonably possible. Docker is optional, not mandatory.

**Frontend (React + Vite):**
- Node.js LTS installed locally. `npm install`, then `npm run dev` starts Vite dev server (default `http://localhost:5173`).
- Env var: `VITE_API_URL` (e.g. `http://localhost:8000`) — how frontend reaches the backend. No other frontend env required for MVP.

**Backend (Python + FastAPI):**
- Python 3.11+ with virtualenv. `pip install -r requirements.txt`, then `uvicorn app.main:app --reload --port 8000`.
- Env vars (via local `.env`, never committed): `DATABASE_URL` (e.g. `postgresql://mynaira:mynaira@localhost:5432/mynairatrack`), `JWT_SECRET` (random local string), `JWT_EXPIRE_MINUTES` (e.g. 60), `CORS_ORIGINS` (e.g. `http://localhost:5173`), `COOKIE_SECURE` (false locally, true in HTTPS), `FX_PROVIDER` (e.g. `open-er-api`), `FX_BASE_URL` (provider base URL), `FX_API_KEY` (only if the provider requires one; empty for keyless providers).

**PostgreSQL (local):**
- Install PostgreSQL locally (or optionally `docker compose up db` if Docker is available).
- Create database `mynairatrack` and a dev user. Run migrations (Phase 2) to create tables and seed currencies/categories.
- Backend connects via `DATABASE_URL` using a standard Postgres driver (psycopg). No connection pooling service needed for local MVP.

**How pieces communicate:**
- Browser → Vite dev server (static + HMR) → `fetch(VITE_API_URL/...)` → FastAPI → PostgreSQL via `DATABASE_URL`.
- Auth: backend sets JWT in a secure httpOnly cookie on login; browser sends it automatically with `fetch(..., { credentials: "include" })`; backend validates and scopes every query to the authenticated user. CORS allows only `CORS_ORIGINS` with credentials enabled.

---

## 3. Database entities (PostgreSQL)

Only tables needed by the PRD. No extra tables for complexity.

- `users` — id, name, email (unique), password_hash (Argon2), primary_currency (default NGN), timestamps.
- `currencies` — code (NGN/USD/EUR/GBP), name, symbol. Seed table, read-only in normal use.
- `exchange_rates` — from_currency, to_currency, rate, provider/source, fetched_at. Populated by FastAPI from the external FX provider and cached in PostgreSQL. Used ONLY for consolidated reporting. If the provider is unavailable, use the most recent valid cached rate and label it as cached with its timestamp. If no valid rate exists, show "conversion unavailable," never an invented rate.
- `accounts` — id, user_id, name, currency, is_business (bool), timestamps. One currency per account (MVP).
- `categories` — id, user_id (nullable for defaults), name, type (income/expense), is_default. Defaults seeded from PRD; users can add custom.
- `transactions` — id, user_id, account_id, type (income/expense/sale), amount (numeric, never negative logic errors), currency (original, immutable), category_id, date, payment_method, note, is_business. Original amount+currency never updated by conversion or primary-currency change.
- `budgets` — id, user_id, name, amount, currency (own currency, defaults to primary at creation), period_start, period_end, timestamps.
- `budget_allocations` — id, budget_id, category_id, allocated_amount (in budget currency). Used by flexible + guided budgeting.
- `savings_targets` — id, user_id, name, target_amount, current_amount, currency (own currency; no account required), timestamps.
- `goals` — id, user_id, name, target_amount, current_amount, currency (own currency; no account required), deadline, suggested_contribution, timestamps.
- `alerts` — id, user_id, budget_id (nullable), type (threshold_50/80/100/over/insight), message, is_read, created_at. In-app only.

Income vs expenses are rows in `transactions` distinguished by `type` (PRD treats income sources and expense categories separately in UI but they share the transaction concept; separate tables would add complexity without product benefit). Business sales are `transactions` with `type=sale` + `is_business=true` linked to a business account.

---

## 4. Authentication requirements (core MVP)

**User flow:** Landing/Welcome page → Sign Up or Log In → Authentication → Basic user setup (choose primary currency, defaults NGN) → Main Dashboard.

- **Public (unauthenticated):** landing/welcome page, sign-up page, login page only.
- **Protected (authenticated):** dashboard and all financial data pages. Unauthenticated API calls return 401.
- **Registration:** name, email, password. Validate email format + uniqueness; validate password (minimum length 8, and require at least one letter and one number — simple, documented rule). Hash with Argon2 via pwdlib before storing. Never store or log plaintext passwords.
- **Login:** email + password → verify Argon2 hash → issue JWT set as secure httpOnly cookie. Generic error message ("Invalid email or password") to avoid user enumeration.
- **Password hashing:** Argon2id via pwdlib. No bcrypt, no plaintext, no reversible encryption.
- **JWT/session handling:** signed JWT containing user id + expiry, stored in a secure httpOnly cookie (`HttpOnly; SameSite=Lax; Secure` in HTTPS; `Secure` off only for local HTTP). Frontend uses `credentials: "include"` and never reads the token via JavaScript. Backend validates signature + expiry on every protected endpoint. CORS configured with explicit origins + `allow_credentials=true`.
- **Token/session expiration:** access token expiry (e.g. 60 minutes, configurable via `JWT_EXPIRE_MINUTES`). Expired cookie → 401 → frontend redirects to login.
- **Protected routes:** frontend route guard (redirect to login when a protected API returns 401 / no session) + backend dependency that rejects unauthenticated requests.
- **Logout:** backend clears the cookie (expired empty cookie) and frontend redirects to landing/login; logged-out user cannot access protected routes without logging in again.
- **Authentication errors:** consistent JSON errors (401 invalid/expired token, 400 validation, 409 email taken, 422 malformed input). No stack traces to client.
- **User-specific data access:** every financial query filtered by `user_id` from the token. Users can only access/modify their own records (enforced in backend, tested per phase). No cross-user reads/writes.

---

## 5. Implementation phases (final, 1–14)

### Phase 1 — Project setup and foundation

- **Objective:** Runnable local skeleton: frontend + backend + database wiring, no product features yet.
- **What will be built:** Repo layout (`frontend/`, `backend/`, docs); Vite React scaffold; FastAPI scaffold with `/health` and `/db-check`; env template files; run instructions in README.
- **Main user-facing functionality:** None yet (developer-facing only).
- **Backend/database work:** FastAPI app boots; connects to local PostgreSQL; `/db-check` confirms connectivity.
- **Files/modules expected:** `frontend/` (Vite scaffold, `src/App.tsx`), `backend/` (`app/main.py`, `requirements.txt`, `.env.example`), `README.md` run section.
- **Dependencies/prerequisites:** None. Requires Node LTS, Python 3.11+, local PostgreSQL.
- **Verification criteria:** `npm run dev` serves frontend; `uvicorn` serves backend; `/health` returns OK; `/db-check` returns OK.
- **Tests:** Smoke checks only (both servers respond). No pytest/Vitest suites required yet.
- **Gate to next phase:** Both servers run locally from documented commands; DB connectivity proven.

### Phase 2 — Data and application structure

- **Objective:** Core data model + migrations + seed data everything later builds on.
- **What will be built:** All tables in §3; migration runner; seed of 4 currencies + PRD default categories.
- **Main user-facing functionality:** None directly (enables all later phases).
- **Backend/database work:** Migration scripts; currency/category seed; numeric amount columns with check constraints (non-negative); foreign keys user→everything.
- **Files/modules expected:** `backend/app/models.py`, `backend/app/db.py`, `backend/migrations/`, `backend/seed.py`.
- **Dependencies:** Phase 1 complete.
- **Verification criteria:** Fresh local DB → migrations apply cleanly → 4 currencies + default categories present.
- **Tests:** pytest: migration idempotency, seed correctness, currency codes limited to NGN/USD/EUR/GBP.
- **Gate:** Schema review approved; no product tables missing; no unnecessary tables added.

### Phase 3 — Authentication and user setup

- **Objective:** Secure local accounts + onboarding (primary currency, default NGN) + settings to change it.
- **What will be built:** Landing/welcome page; sign-up, login, logout; basic user setup screen (choose primary currency); settings screen to change primary currency; protected-route guard.
- **Main user-facing functionality:** Visitor sees landing → signs up / logs in → picks primary currency (NGN default) → reaches empty dashboard shell.
- **Backend/database work:** `users` CRUD; Argon2 hashing; JWT issue/validate via secure httpOnly cookie; expiry enforcement; CORS with credentials; auth error responses; per-user scoping helper used by all future endpoints.
- **Files/modules expected:** `frontend/src/pages/{Landing,Signup,Login,Setup,Settings}.tsx`, `frontend/src/auth/*` (guard, `credentials: "include"` API client); `backend/app/auth.py`, `backend/app/routers/auth.py`, `backend/app/routers/users.py`.
- **Dependencies:** Phase 2 (users table).
- **Verification criteria:** Register → login sets httpOnly cookie → protected endpoints reject anonymous calls → logout clears cookie → change primary currency persists → existing records untouched (no records exist yet; rule stored for later phases).
- **Tests:** pytest: registration validation, duplicate email rejected, wrong password rejected, expired cookie rejected, cookie flags (HttpOnly, SameSite) present, user A cannot read user B data. Vitest: route guard redirects unauthenticated users to login.
- **Gate:** Full auth flow works locally; per-user isolation proven; primary-currency default NGN confirmed.

### Phase 4 — Currency foundation

- **Objective:** Enforce PRD multi-currency rules app-wide and wire the corrected FX architecture (provider → backend → cached rates → reporting) before any money is recorded.
- **What will be built:** Supported-currency list (NGN/USD/EUR/GBP only); currency field on every money form; shared currency selector/filter component (NGN/USD/EUR/GBP/All Currencies); FastAPI FX adapter fetching latest rates from the provider; PostgreSQL `exchange_rates` cache (rate + timestamp + provider/source); conversion helper used ONLY for consolidated views; stale-cache fallback with visible last-update/cached labels; missing-rate behavior (show "unavailable," never guess). No user rate-editing screen.
- **Main user-facing functionality:** User sees currency codes on forms; can switch filter including All Currencies; sees last-update time and cached-rate indicators on consolidated views. No manual rate editing for normal users.
- **Backend/database work:** Currency validation on all writes (reject anything outside the 4); FX adapter (`fx_provider.py`) behind a replaceable interface; rate refresh job/endpoint (backend-only, keys in env); conversion function `convert(amount, from, to)` reading the latest valid cached rate, falling back to the most recent valid cached rate on provider failure, returning unavailable when no valid rate exists.
- **Files/modules expected:** `frontend/src/components/CurrencySelector.tsx`, `frontend/src/lib/currency.ts`; `backend/app/currency.py`, `backend/app/fx_provider.py`, `backend/app/routers/currencies.py`, `backend/app/routers/exchange_rates.py` (read-only status/last-update for the app; no user write endpoint).
- **Dependencies:** Phases 2, 3.
- **Verification criteria:** Unsupported currency (e.g. JPY) rejected; React makes zero direct FX calls (verified by code search); provider outage still serves clearly-labeled cached rates; conversion with no valid rate shows unavailable, not a number.
- **Tests:** pytest: reject unsupported currency; adapter mocked for fetch success/failure; stale-cache fallback; missing-rate path; rate timestamp + provider stored. Vitest: selector renders 4 + All; cached-rate label renders.
- **Gate:** Currency rules enforced at API level; no feature can save money without a valid MVP currency.

### Phase 5 — Accounts/wallets

- **Objective:** Accounts/wallets with exactly one currency each (personal or business flag).
- **What will be built:** Account list/create/edit; each account has name + currency + personal/business flag; per-account balance in its own currency.
- **Main user-facing functionality:** User creates e.g. Main Bank (NGN), Dollar Account (USD); sees balances per account in native currency.
- **Backend/database work:** `accounts` CRUD scoped to user; currency is immutable after creation (final decision: protects historical records; user creates another account for a different currency); balance computed from transactions in same currency only.
- **Files/modules expected:** `frontend/src/pages/Accounts.tsx`; `backend/app/routers/accounts.py`.
- **Dependencies:** Phase 4.
- **Verification criteria:** Three accounts in three currencies each show correct native-currency balance; mixed-currency transactions never merged into one balance.
- **Tests:** pytest: account requires valid currency; balance sums only same-currency transactions; cross-user access denied. Vitest: account form validates currency.
- **Gate:** Accounts work in multiple currencies with no silent merging.

### Phase 6 — Income and expense tracking

- **Objective:** Fast, correct recording of income (multiple sources) and expenses with original currency preserved.
- **What will be built:** Quick entry (amount + category); detailed entry (amount, currency selectable from supported list when necessary, category, date, payment method, note, account); transaction history always showing original currency/amount; currency filter on history.
- **Main user-facing functionality:** User records Salary +₦500,000 NGN, Freelance +$500 USD, Software −$20 USD, Food −₦30,000 NGN; history shows each in its original currency.
- **Backend/database work:** `transactions` CRUD; currency + amount immutable once created (no edit path that rewrites currency in MVP — new transaction + delete instead, documented); account must belong to user; category must belong to user or be default.
- **Files/modules expected:** `frontend/src/pages/Transactions.tsx`, `frontend/src/components/TransactionForm.tsx`; `backend/app/routers/transactions.py`.
- **Dependencies:** Phases 4, 5 (accounts), 7 may parallel-track categories but Phase 6 needs at least seeded defaults.
- **Verification criteria:** All four example transactions save with original currency; editing amount never changes another record; history filter by currency works.
- **Tests:** pytest: original currency preserved; invalid currency rejected; user isolation. Vitest: quick-entry and detailed-entry flows.
- **Gate:** Transaction recording is reliable and currency-faithful.

### Phase 7 — Categories

- **Objective:** PRD default categories + user custom categories.
- **What will be built:** Category list, create/edit custom categories, assign type income/expense.
- **Main user-facing functionality:** User adds custom category (e.g. "Airtime") and uses it in a transaction.
- **Backend/database work:** `categories` CRUD; defaults seeded and non-deletable; custom categories per user.
- **Files/modules expected:** `frontend/src/pages/Categories.tsx`; `backend/app/routers/categories.py`.
- **Dependencies:** Phase 2 (may run any time after Phase 2; needed by Phase 8).
- **Verification criteria:** Custom category usable in Phase 6 forms; defaults always present.
- **Tests:** pytest: defaults seeded; user cannot delete defaults; custom category scoped to user. Vitest: create-category flow.
- **Gate:** Category management complete and wired into transaction forms.

### Phase 8 — Budgets and guided budgeting

- **Objective:** Flexible + guided budgets, each in one chosen currency, with strict same-currency matching.
- **What will be built:** Budget create (any amount, start date + end date period — final decision, any of the 4 currencies; defaults to primary, changeable); category allocations; guided-budget suggestions in the budget's currency; monitoring view (budgeted vs spent vs remaining, in budget currency).
- **Main user-facing functionality:** User creates ₦100,000 / 14-day budget with allocations; creates a guided budget in USD; watches spent/remaining update as same-currency expenses are recorded.
- **Backend/database work:** `budgets` + `budget_allocations`; spend computation counts ONLY expenses where `expense.currency == budget.currency`; cross-currency expenses ignored (no conversion) per PRD.
- **Files/modules expected:** `frontend/src/pages/Budgets.tsx`, `frontend/src/components/GuidedBudget.tsx`; `backend/app/routers/budgets.py`, `backend/app/budgeting.py`.
- **Dependencies:** Phases 4, 6, 7.
- **Verification criteria:** NGN expense updates NGN budget, leaves USD budget untouched; USD expense updates USD budget only.
- **Tests:** pytest: same-currency matching rule (core regression test); guided allocations sum to budget; period handling. Vitest: budget creation with currency picker; monitoring display.
- **Gate:** Budget currency rule proven by tests; no cross-currency leakage.

### Phase 9 — Savings and financial goals

- **Objective:** Savings targets and goals, each with own currency, no account required.
- **What will be built:** Savings tracker (saved, progress, history, remaining in savings currency); goals (name, target, current, deadline, suggested contribution in goal currency).
- **Main user-facing functionality:** User creates a $2,000 USD goal with no USD account — allowed; tracks progress in USD.
- **Backend/database work:** `savings_targets`, `goals` CRUD; currency required; no account-link requirement enforced (absence of requirement is the rule).
- **Files/modules expected:** `frontend/src/pages/{Savings,Goals}.tsx`; `backend/app/routers/{savings,goals}.py`.
- **Dependencies:** Phase 4 (Phase 6 history optional for progress entries).
- **Verification criteria:** Goal in a currency with no matching account saves and displays correctly.
- **Tests:** pytest: goal without matching account allowed; progress math in goal currency. Vitest: goal creation flow.
- **Gate:** Savings/goals fully currency-independent from accounts.

### Phase 10 — Dashboard and financial overview

- **Objective:** ONE dashboard, primary-currency default, selector/filter, All Currencies consolidated view. No separate per-currency dashboards.
- **What will be built:** Cards for available money, income, expenses, current/remaining budget, savings, spending breakdown, recent transactions, budget status, alerts, progress; Financial Overview section (income/expenses/savings/available/budget status/recent activity); currency selector; All Currencies view converting to primary currency via cached FX rates (with last-update/cached labels); primary-currency change updates display only, never rewrites history.
- **Main user-facing functionality:** User opens dashboard in NGN; switches to USD; switches to All Currencies and sees consolidated NGN-equivalent view; changes primary currency in settings and sees dashboard follow without history changes.
- **Backend/database work:** Dashboard aggregation endpoint honoring selected currency; All Currencies path uses conversion helper; missing-rate → "unavailable" label per metric, never fabricated totals.
- **Files/modules expected:** `frontend/src/pages/Dashboard.tsx`, `frontend/src/components/*` (cards, selector); `backend/app/routers/dashboard.py`, `backend/app/reporting.py`.
- **Dependencies:** Phases 4, 5, 6, 8, 9 (alerts widget reads Phase 11 data if present; dashboard reserves the slot even if Phase 11 lands after).
- **Verification criteria:** Mixed-currency data → single-currency view shows only matching records; All Currencies shows converted consolidated values; primary-currency switch changes display, history currencies unchanged in DB.
- **Tests:** pytest: no raw addition across currencies; All Currencies uses primary as target; history immutability after primary change. Vitest: selector behavior; All Currencies rendering.
- **Gate:** Dashboard is the single source of truth and obeys every currency rule.

### Phase 11 — Spending insights and alerts

- **Objective:** Simple spending understanding + user-controlled in-app budget alerts.
- **What will be built:** Insights panel (totals by category, % of budget used, increase vs prior period — computed within same currency); alert preferences (50/80/100%, over-budget, off); in-app alert list + dashboard badge (final decision).
- **Main user-facing functionality:** User enables 80% alert, receives in-app alert at 80% of that budget's currency; can turn alerts off entirely.
- **Backend/database work:** Insight computation (same-currency grouping); alert evaluation on transaction write; `alerts` table reads.
- **Files/modules expected:** `frontend/src/pages/Insights.tsx`, `frontend/src/components/Alerts.tsx`; `backend/app/routers/{insights,alerts}.py`, `backend/app/alerting.py`.
- **Dependencies:** Phases 6, 8.
- **Verification criteria:** Alerts fire at correct thresholds in budget currency; off means silent; insights never mix currencies in one percentage.
- **Tests:** pytest: threshold firing (50/80/100/over), off-state silence, same-currency grouping. Vitest: preferences UI + alert list.
- **Gate:** Insights/alerts correct and currency-safe.

### Phase 12 — Business Mode

- **Objective:** Business tracking inside the same product and dashboard shell. No separate product, no separate dashboard.
- **What will be built:** Business Mode toggle; business accounts with own currencies; business sales/income + expenses + profit views preserving transaction currency; personal vs business separation.
- **Main user-facing functionality:** User activates Business Mode → records USD sale and USD expense → sees USD profit; personal accounts unaffected.
- **Backend/database work:** `is_business` flag enforcement; profit = sales − expenses within same currency only (no cross-currency profit conversion in MVP).
- **Files/modules expected:** `frontend/src/pages/Business.tsx`; reuse of account/transaction routers with business scoping.
- **Dependencies:** Phases 5, 6.
- **Verification criteria:** Business and personal records never mix; profit shown per currency; mixed-currency business activity shows per-currency profits, not one merged number.
- **Tests:** pytest: personal/business isolation; same-currency profit math; mixed-currency separation. Vitest: Business Mode activation flow.
- **Gate:** Business Mode works multi-currency without forking the product.

### Phase 13 — Testing and validation

- **Objective:** Prove the MVP meets the PRD.
- **What will be built:** Full traceability checklist (PRD requirement → phase → test → result); bug triage; regression run of all currency-rule tests.
- **Main user-facing functionality:** None new; confidence in what exists.
- **Backend/database work:** Test fixtures with mixed-currency data; missing-rate scenarios.
- **Files/modules expected:** `backend/tests/`, `frontend/src/**/*.test.*`, `TEST_CHECKLIST.md` (results log).
- **Dependencies:** All phases 1–12.
- **Verification criteria:** Every checklist row passes; currency-rule tests green; auth isolation tests green.
- **Tests:** Full pytest + Vitest suites + scripted manual end-to-end (signup → accounts → transactions → budgets → goals → dashboard → Business Mode).
- **Gate:** Zero open PRD-blocking defects.

### Phase 14 — Final MVP review

- **Objective:** Confirm scope, alignment, and readiness; capture post-MVP backlog.
- **What will be built:** Scope-vs-PRD review; local performance sanity; open-decisions log; post-MVP backlog (extra currencies, shared budgets, etc. — all PRD-deferred; live FX is IN the MVP via the cached provider architecture, so it is not backlog).
- **Main user-facing functionality:** None new; go/no-go decision.
- **Backend/database work:** None except fixes for Phase 13 blockers.
- **Files/modules expected:** Updated `IMPLEMENTATION_PLAN.md` status notes; backlog list.
- **Dependencies:** Phase 13.
- **Verification criteria:** Product owner sign-off against MVP boundary (§6).
- **Tests:** Re-run of Phase 13 gate suite.
- **Gate:** Explicit approval to call the MVP complete.

---

## 6. MVP build boundary

**IN:**
- Landing/welcome + signup/login/logout, JWT httpOnly-cookie auth, per-user isolation.
- NGN default primary currency, user-changeable, history never rewritten.
- NGN/USD/EUR/GBP only; external FX API (free-tier) → FastAPI → PostgreSQL cached rates; All Currencies in primary currency with last-update/cached labels; no valid rate → "unavailable."
- Accounts/wallets with own currency; transactions preserve original currency; currency selectable at entry.
- Budgets with own currency; same-currency matching only; guided budgeting in budget currency.
- Savings/goals with own currency; no account required.
- One dashboard + selector + financial overview; in-app insights/alerts (50/80/100/over/off).
- Business Mode in same product/shell; business accounts with own currency; same-currency profit.

**OUT (PRD-deferred, do not build):**
- Extra currencies, cross-currency budget conversion, merged multi-currency totals without conversion, separate business product/dashboard, email/push notifications, payments, file storage, real-time, Redis, cloud hosting, external auth. Manual user rate-editing is not a normal feature (administrative/future only).

---

## 7. Finalized decisions (approved, no longer open)

- **FX architecture:** External FX API → FastAPI → PostgreSQL cache → reporting. Provider replaceable via adapter. React never calls the provider; keys in env only.
- **Rate-table editing:** Not a normal user setting. Provider-sourced cached rates only; manual correction is administrative/future.
- **Budget period:** Start date + end date (final).
- **Alert surfacing:** In-app alert list + dashboard badge (final).
- **JWT storage:** Secure httpOnly cookie with appropriate Secure/SameSite/CORS/expiry handling (final).
- **Account currency:** Immutable after creation (final); create another account for a different currency.

## 8. Risks

- **Scope creep:** Any request for extra currencies or cross-currency budgets goes to post-MVP backlog, not silent inclusion.
- **Provider outage:** Handled by clearly-labeled cached rates; never invent rates.
- **Key exposure:** FX keys stay in backend env only; verify by code search that React never calls the provider.

---

## 9. PRD feature → phase mapping checklist

| PRD feature | Phase |
|---|---|
| Landing/welcome + account creation | P1, P3 |
| Auth (register/login/hash/validation/JWT/expiry/protected routes/logout/errors/isolation) | P3 |
| Primary currency select/change (NGN default) | P3, P4 |
| MVP currencies NGN/USD/EUR/GBP | P2, P4 |
| Currency Concepts + conversion for reporting only | P4 |
| Accounts/wallets with own currency | P5 |
| Income tracking, multiple sources, original currency | P6 |
| Expense tracking quick + detailed, original currency | P6 |
| Categories default + custom | P7 |
| Flexible budgets (own currency, any amount/period, same-currency rule) | P8 |
| Guided budgeting (budget currency) | P8 |
| Budget monitoring (budget currency) | P8 |
| Savings (own currency, no account required) | P9 |
| Financial goals (own currency, no account required) | P9 |
| Dashboard (one dashboard, primary default, selector, All Currencies) | P10 |
| Financial overview | P10 |
| Spending insights (same-currency) | P11 |
| Budget alerts in-app (50/80/100/over/off) | P11 |
| Business Mode (own-currency accounts, original-currency sales/expenses/profit) | P12 |
| Nigeria-first / NGN default positioning | P3, P4, P10 |
| User journey (account → currency → budget → track → monitor) | P3–P10 |
| Product rules (no history rewrite, no raw cross-currency addition) | P4, P6, P8, P10, P12 |
| Testing/validation + final review | P13, P14 |

---

## 10. Development workflow (mandatory)

1. Implement **only one phase at a time**, in order 1→14.
2. Run the phase's tests (pytest + Vitest as listed) plus all prior-phase regression tests.
3. Manually verify the phase's verification criteria locally.
4. Confirm no existing functionality broke.
5. Report what was completed (files changed, tests run, verification results).
6. **Wait for explicit approval before starting the next phase.**
7. Never skip phases, never bundle unrelated changes, never introduce a new technology without written justification and approval.
