# MYNAIRATRACK — Implementation Plan (MVP)

> Derived strictly from `MYNAIRATRACK 001-PRODUCT REQUIREMENTS DOCUMENT.docx` (finalized).
> Product decisions are taken from the PRD; anything not in the PRD is flagged as an open decision, not silently designed in.

---

## Guiding principles

- **Product-driven**: Every built feature maps to a PRD section (see §Mapping Checklist).
- **No tech specs in the PRD**: Any technical choice (stack, schema, architecture) is an implementation decision — see §Product vs Implementation Decisions.
- **Local first**: App and database run locally for now.
- **No silent guesses**: Open product questions are listed in §Decisions Needed.

---

## Phase 1 — Project setup and foundation

**Objective:** Establish a runnable, testable local project skeleton.

**What will be built:**
- Local dev repository layout (app + DB).
- Build, run, and lint scripts.
- Local configuration (dev).

**Key deliverables:**
- Working "hello world" of the app running locally.
- Dev database provisioning script.
- README update: how to run.

**Dependencies:** None.

**Verify:** App starts locally; DB connection check passes.

---

## Phase 2 — Data and application structure

**Objective:** Create the core local data model and application architecture that every later phase builds on.

**What will be built:**
- User entity.
- Currency reference data (NGN, USD, EUR, GBP).
- Account/wallet entity (name, currency, user, business/personal flag).
- Transaction entity (amount, currency, type income/expense, category, date, payment method, note, account, user, business flag — original currency preserved).
- Category entity (default categories + custom per user).
- Budget entity (amount, currency, period, categories, user).
- Savings target entity (amount, currency, user).
- Financial goal entity (name, target amount, current amount, currency, deadline, user).
- Business mode flag on user/account.
- Migration scripts.

**Key deliverables:**
- DB schema migrations that run locally.
- Seed data: the four MVP currencies and default categories.

**Dependencies:** Phase 1.

**Verify:** Migrations apply cleanly to a fresh local DB; seed data present.

---

## Phase 3 — Authentication and user setup

**Objective:** Let a user create an account and set onboarding basics.

**What will be built:**
- Local sign-up / sign-in (no external auth in MVP unless product decides otherwise — **[Flag]**).
- Onboarding step: choose primary currency (defaults to NGN; may change in settings).
- Settings screen for primary currency.

**Key deliverables:**
- User can register, log in, and set/change primary currency.

**Dependencies:** Phase 2.

**Verify:** Create user → primary currency is NGN by default → change to USD → dashboard currency changes (check in Phase 10).

> **Product decision needed:** Does changing primary currency affect historical records? PRD says **no** — historical currencies stay fixed. This phase must store primary currency separately from entity currencies.

---

## Phase 4 — Currency setup and multi-currency foundation

**Objective:** Enable the PRD's multi-currency rules everywhere.

**What will be built:**
- MVP supported currency list (NGN/USD/EUR/GBP) — no auto-adding beyond these.
- Every transaction, account, budget, savings target, and goal carries its own currency (already modeled in Phase 2; this phase enforces it in app logic).
- Currency filter dropdown on shared screens (NGN/USD/EUR/GBP/All Currencies).
- Conversion service for consolidated views only (no technical implementation assumed; product-level requirement: "All Currencies" view uses primary currency).

**Key deliverables:**
- Currency filter component.
- Consolidated-view conversion helper (MVP-level).

**Dependencies:** Phase 2, Phase 3.

**Verify:** Can record two transactions in different currencies; "All Currencies" shows values in primary currency.

> **Flag — Product decision:** What exchange rate is used for conversion? PRD is silent. Recommend confirming this with product before Phase 10.

---

## Phase 5 — Accounts/wallets

**Objective:** Introduce accounts/wallets with individual currencies.

**What will be built:**
- Create/view accounts (Main Bank Account — NGN, Dollar Account — USD, Euro Account — EUR).
- Account can be marked Business or Personal (Business Mode accounts).
- Account-scoped balance/overview.

**Key deliverables:**
- Account CRUD UI + DB writes.
- Each account belongs to exactly one currency (MVP).

**Dependencies:** Phase 4.

**Verify:** Create three accounts in different currencies; balances remain in their own currency.

---

## Phase 6 — Income and expense tracking

**Objective:** Record income and expenses quickly and accurately.

**What will be built:**
- Quick entry (amount + category like "₦5,000 - Food").
- Detailed entry (amount, category, date, payment method, note, account, currency — selected from supported currencies when needed).
- Original currency/amount always preserved.
- Transactions list filtered by currency.

**Key deliverables:**
- Transaction creation flows (income & expense).
- Transaction history always displays original currency/amount.

**Dependencies:** Phase 4, Phase 5.

**Verify:** Record `Salary: +₦500,000 NGN`, `Freelance income: +$500 USD`, `Software expense: -$20 USD`, `Food expense: -₦30,000 NGN` — all retain original currency; no auto-replacement.

---

## Phase 7 — Categories

**Objective:** Provide default categories and allow custom ones.

**What will be built:**
- Default expense categories (per PRD).
- Custom category creation.
- Category management.

**Key deliverables:**
- Category settings/management screen.

**Dependencies:** Phase 2.

**Verify:** Create custom category; use it in a transaction.

---

## Phase 8 — Budgets and guided budgeting

**Objective:** Flexible budgets in any supported currency with strict currency matching.

**What will be built:**
- Budget creation: any amount, any period, any supported currency (defaults to primary currency, user can change).
- Guided budgeting: category allocations in the budget's chosen currency.
- Budget monitoring: spent vs remaining per budget, in the budget's currency.
- **Rule (PRD):** expense counts toward a budget **only if** expense currency == budget currency.

**Key deliverables:**
- Budget CRUD with currency field.
- Guided budget suggestions.
- Monitoring view.

**Dependencies:** Phase 4, Phase 6, Phase 7.

**Verify:** Create NGN budget and a USD expense → no effect on NGN budget. Create USD budget and USD expense → budget updates.

> **Flag — Product decision:** Should a budget over 14 days be allowed in multiple currencies simultaneously? PRD says budgets have one currency; clarifying this before Phase 8.

---

## Phase 9 — Savings and financial goals

**Objective:** Savings targets and goals with their own currency.

**What will be built:**
- Savings tracking: amount saved, progress, history, remaining toward target (in the savings currency).
- Financial goals: name, target amount, current amount, deadline, suggested contribution (in goal currency).
- **PRD:** a savings goal or financial goal does **not** require an account/wallet in that currency.

**Key deliverables:**
- Savings target screen.
- Goal CRUD + progress.

**Dependencies:** Phase 4, Phase 6.

**Verify:** Create USD goal while having no USD account — allowed.

---

## Phase 10 — Dashboard and financial overview

**Objective:** One main dashboard; primary currency default; currency selector; All Currencies.

**What will be built:**
- Dashboard cards: total available money, income, expenses, current/remaining budget, savings, spending breakdown, recent transactions, budget status, alerts, progress.
- Primary currency as default view.
- Currency selector/filter (NGN/USD/EUR/GBP/All Currencies).
- All Currencies consolidates in primary currency using conversion.
- Changing primary currency must **not** rewrite historical transaction/account/budget/savings/goal currencies.

**Key deliverables:**
- Dashboard screen.
- Financial Overview section (income/expenses/savings/available/budget status/recent activity).

**Dependencies:** Phase 4, Phase 5, Phase 6, Phase 8, Phase 9, Phase 11 (optional alerts widget).

**Verify:** With mixed-currency records, "All Currencies" shows consolidated values in primary currency; changing primary currency updates the display without rewriting history.

---

## Phase 11 — Spending insights and alerts

**Objective:** Help users understand spending and get optional budget alerts.

**What will be built:**
- Spending insights: simple summaries, category percentages, increases vs prior period.
- Budget alerts: user-controlled thresholds (50/80/100%, over-budget, off).

**Key deliverables:**
- Insights panel.
- Alert preferences UI.

**Dependencies:** Phase 6, Phase 8.

**Verify:** Toggle alerts off → no alerts. Set 80% threshold → alert appears when 80% of that budget's currency is used.

> **Flag:** Insights percentages should be computed within the same currency. Confirm no cross-currency aggregation for insights in MVP.

---

## Phase 12 — Business Mode

**Objective:** Separate business tracking without a separate product or dashboard.

**What will be built:**
- Business mode activation.
- Business accounts/wallets with their own currencies.
- Business sales (income), expenses, profit tracking preserving transaction currency.
- Business dashboard inside the same app, same dashboard shell (no separate product).

**Key deliverables:**
- Business Mode UI + DB flag/account types.
- Sales/expenses/profit rollup per currency; profit = sales − expenses in the same currency (PRD does not require cross-currency profit conversion in MVP).

**Dependencies:** Phase 5, Phase 6.

**Verify:** Activate Business Mode → record business sale and expense in USD → profit shows in USD → personal accounts unaffected.

> **Flag — Product decision:** PRD does not say whether business profit should be convertible to primary currency. MVP recommendation: only same-currency profit.

---

## Phase 13 — Testing and validation

**Objective:** Verify the MVP against PRD acceptance criteria.

**What will be built:**
- Test checklist (manual + automated as practical).
- Traceability: each PRD requirement mapped to a verified behavior.

**Key deliverables:**
- Test results document.
- Bug list triaged against PRD.

**Dependencies:** All previous phases.

**Verify:** Full checklist passes.

---

## Phase 14 — Final MVP review

**Objective:** Confirm MVP scope, product alignment, and readiness for release or iteration.

**What will be built:**
- Scope review vs PRD.
- Performance threshold (local MVP).
- Remaining open decisions log.

**Key deliverables:**
- Go/no-go checklist.
- Post-MVP backlog (live FX, additional currencies, shared budgets, etc. — all deferred by PRD).

**Dependencies:** Phase 13.

**Verify:** Product owner signs off.

---

## Dependencies between phases

- P1 → P2 → P3 → P4
- P4 → P5 → P6
- P2/P7 can run in parallel after P2.
- P6 → P8, P9
- P8/P9/P10 → P10, P11
- P5 + P6 → P12
- P13 ← all
- P14 ← P13

## Important product decisions still needed before implementation

1. **Exchange-rate source/value for "All Currencies" conversions** (e.g., fixed rate, user-editable rate, or none in MVP). PRD is silent.
2. **Auth model**: simple local sign-in vs external provider (PRD implies account creation but doesn't specify).
3. **Business profit currency handling**: same-currency only in MVP? (Recommended.)
4. **Budget insight percentages**: same-currency grouping for MVP?
5. **Exact wording of supported MVP currencies in UI** (labels/symbols).

## Areas where the PRD provides insufficient implementation guidance (flagged, not guessed)

- Conversion rate for consolidated reporting.
- Whether budgets can span multiple currencies (PRD: each budget has one currency; simultaneous multi-currency budgets is a UX choice).
- Alert delivery (in-app only, or also email/push — PRD only says "optional budget alerts").
- Offline/online requirement for conversion (local app for now).
- Default categories list is provided in PRD; confirm the exact English labels.

---

## Technology & Tooling Decisions (MVP)

> Context: MYNAIRATRACK MVP runs **locally** first. Where a tool has a free tier sufficient for MVP, that is what goes in the plan. Anything only needed at scale or after MVP is marked future.

### 1. Frontend framework
- **Recommended:** React (with Vite for local dev)
- **Purpose:** User interface for dashboard, budgeting, accounts, etc.
- **Why it fits:** Component-based, huge ecosystem, strong local dev experience with Vite, works later with any hosting.
- **Free/free-tier:** Fully free and open-source.
- **Would cost later:** Nothing by itself.
- **MVP required:** Yes (for the app UI).

### 2. Backend framework/runtime
- **Recommended:** Python + FastAPI
- **Purpose:** API server for accounts, transactions, budgets, savings, goals, business mode, users.
- **Why it fits:** Simple, typed, fast to build, free; good local development.
- **Free/free-tier:** Fully free.
- **Would cost later:** Server hosting only.
- **MVP required:** Yes.

### 3. Database
- **Recommended:** PostgreSQL
- **Purpose:** Relational store for structured financial data and relationships (users, accounts, transactions, budgets, goals, currencies).
- **Why it fits:** Open-source, robust ACID transactions, mature, excellent fit for finance-record relationships; free-tier hosted options exist when we move online.
- **Free/free-tier:** Fully free locally; free hosted tiers available later.
- **Would cost later:** Hosting/storage at scale.
- **MVP required:** Yes.

### 4. Authentication
- **Recommended:** Local email + password with hashed passwords (bcrypt) and JWT sessions, implemented in our own API.
- **Purpose:** Local user accounts.
- **Why it fits:** PRD only says "create an account." No external auth needed at MVP. Simple, free, works locally.
- **Free/free-tier:** Free.
- **Would cost later:** If we move to hosted auth (e.g., Supabase Auth / Firebase Auth free tiers suffice for long; paid tiers only at scale).
- **MVP required:** Yes.

### 5. File storage
- **Recommended:** None for MVP. Local disk only if receipts are ever added.
- **Purpose:** Potential future receipts/attachments.
- **Why it fits:** No storage requirement in PRD; adds cost/complexity to add early.
- **Free option:** Local disk storage (free).
- **Future option:** free-tier object storage (e.g., Supabase Storage / S3-compatible free tier).
- **MVP required:** No.

### 6. Email service
- **Recommended:** None for MVP.
- **Purpose:** Future account verification/password reset notifications.
- **Why it fits:** No email requirement in PRD for MVP.
- **Future free option:** Free-tier transactional email (e.g., Brevo free tier, Gmail SMTP for low volume).
- **MVP required:** No.

### 7. Payment platform
- **Recommended:** None.
- **Purpose:** MYNAIRATRACK does not process payments in the PRD.
- **Why it fits:** Keeping it out avoids Stripe/PayPal fees and complexity.
- **MVP required:** No.

### 8. Real-time functionality
- **Recommended:** None for MVP.
- **Purpose:** Live dashboard updates.
- **Why it fits:** PRD does not require real-time; a local web app with normal request/refresh is sufficient.
- **Future option (free):** WebSocket via FastAPI if needed.
- **MVP required:** No.

### 9. Currency conversion/exchange-rate source
- **Recommended (MVP):** A manually maintained exchange-rate table in the database (admin/user-editable rates for USD→NGN, EUR→NGN, GBP→NGN, etc.).
- **Purpose:** Only for the "All Currencies" consolidated view and consolidated financial overview (report-level conversion).
- **Why it fits:** PRD states conversion is needed for consolidated views but does NOT require live rates. A simple rate table avoids external APIs, cost, and complexity.
- **Free/free-tier:** Free.
- **Future option (free tier):** Free exchange-rate API tier (e.g., ExchangeRate.host / open.er-api.com) if live/auto rates are ever approved.
- **MVP required:** Yes — but only as a simple editable rate table, not a live FX integration.

### 10. Notifications/alerts
- **Recommended (MVP):** In-app alert display (dashboard/alert list) driven by thresholds.
- **Purpose:** Budget alerts at 50/80/100/over-budget, insight notices.
- **Why it fits:** PRD says optional budget alerts; in-app alerts satisfy it without free-tier email/push dependencies.
- **Future option:** Email/free-tier push notifications.
- **MVP required:** Yes (in-app only).

### 11. Hosting/deployment
- **Recommended (MVP):** Run everything locally on the developer machine (app + PostgreSQL). No paid hosting.
- **Why it fits:** PRD says "app and database should run locally for now."
- **Future free-tier options:** Vercel (frontend), Render/Railway free tier (backend/Postgres) for a later public demo.
- **Would cost later:** Hosting at public scale.
- **MVP required:** No (not needed until deployed).

### 12. Testing
- **Recommended:** pytest (backend, FastAPI), Vitest (frontend React), and a few manual end-to-end checks.
- **Why it fits:** All free/open-source, standard for this stack, covers the currency matching rules.
- **MVP required:** Yes.

### 13. Local development environment
- **Recommended:** Local dev with Vite dev server + FastAPI dev server + local PostgreSQL; optionally Docker Compose for one-command DB startup (Docker Desktop is free for personal dev).
- **Why it fits:** Matches "run locally now" and keeps zero costs.
- **MVP required:** Yes (this is how we run the app).

---

## Final recommended stack table

| Area | Recommended Tool | MVP Required? | Free Option? | Reason |
|---|---|---|---|---|
| Frontend | React + Vite | Yes | Yes (OSS) | Component UI, local dev, later hostable anywhere |
| Backend | Python + FastAPI | Yes | Yes (OSS) | Simple, typed, free API server |
| Database | PostgreSQL | Yes | Yes (OSS / free tier) | Structured financial data relationships, free |
| Authentication | Email + password, bcrypt + JWT | Yes | Yes | PRD just needs accounts; no external auth |
| File storage | None (local disk only if ever needed) | No | Yes | No storage requirement in PRD |
| Email service | None (future free tier: Brevo) | No | Yes | Not in PRD |
| Payment platform | None | No | N/A | Not in PRD |
| Real-time | None | No | N/A | Not in PRD; normal refresh is enough |
| Currency conversion | Editable rate table in DB (MVP) | Yes (basic) | Yes | Satisfies consolidated views without live FX |
| Notifications/alerts | In-app alerts | Yes (in-app) | Yes | Matches PRD's optional alert concept |
| Hosting/deployment | Local only for now | No | Yes | PRD: run locally |
| Testing | pytest + Vitest | Yes | Yes | Free, standard, covers currency rules |
| Local dev environment | Local dev servers + local Postgres (Docker optional) | Yes | Yes | Zero-cost local development |

---

## Recommended implementation order

1. Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 10 → 12 → 13 → 14
   (Phase 10 intentionally after Phase 9; Phase 11 before 10 so the dashboard can read alert state.)
2. Minimum viable verification per phase: unit/integration tests on the currency rules, one end-to-end scenario per phase.

## MVP build boundary

**IN MVP:**
- NGN/USD/EUR/GBP only.
- NGN default primary currency; user-changeable.
- One dashboard + currency selector + All Currencies view.
- Accounts/wallets with own currency.
- Transactions preserve original currency.
- Budgets with own currency; expense counts only on same-currency match.
- Savings/goals with own currency (no account required).
- Guided budgeting in chosen budget currency.
- Business Mode inside the same dashboard, business accounts with own currency; sales/expenses/profit in original currency.
- No live/automatic exchange rates.

**OUT OF MVP (deferred per PRD):**
- Live FX APIs / automatic rate updates.
- Currencies beyond NGN/USD/EUR/GBP.
- Cross-currency budget conversion.
- Shared budgets, family finance, debt tracking, subscriptions, advanced business reporting.

## Risks / clarifications

- **Scope creep**: "All Currencies" plus conversion can tempt FX features into MVP — keep the conversion simple and document it.
- **Data model**: decide once that every financial entity carries its own currency; avoid retrofits later.
- **UX confusion**: primary vs account vs transaction vs budget vs goal currency must be visible; the Currency Concepts block in the PRD should drive UI copy.
- **Currency matching rule** must be enforced in tests before Phase 10 dashboard totals are trusted.

## Feature → Phase mapping checklist

| PRD feature | Phase |
|---|---|
| Product overview / currency concept | P4 |
| Target users / business owners | P3, P12 |
| Core experience chain | All |
| Dashboard (one dashboard, selector, All Currencies) | P10 |
| Income tracking (multiple sources, original currency) | P6 |
| Expense tracking (quick + detailed, original currency) | P6 |
| Flexible budgeting (any amount/period, own currency, same-currency rule) | P8 |
| Guided budgeting (budget currency) | P8 |
| Budget monitoring (budget currency) | P8 |
| Spending insights | P11 |
| Budget alerts | P11 |
| Savings tracking (own currency, no account required) | P9 |
| Financial goals (own currency, no account required) | P9 |
| Business Mode (own currency accounts, original transaction currency) | P12 |
| Categories (default + custom) | P7 |
| Financial Overview | P10 |
| MVP supported currencies (NGN/USD/EUR/GBP) | P2, P4 |
| Nigeria-first positioning / NGN default | P3, P4 |
| Multi-currency support | P4 |
| User journey (account → currency → budget → track → monitor) | P3–P10 |
