# MYNAIRATRACK

**MYNAIRATRACK** (MY + NAIRA + TRACK) is a personal finance management app for Nigeria that helps users understand, organize, and manage their money more effectively.

## Purpose

Many people struggle to track expenses, stay within budgets, save consistently, and understand where their money goes. MYNAIRATRACK gives users a simple, clear view of their finances so they can plan their money, control spending, and build healthier financial habits.

**Core experience:** Earn → Plan → Spend → Track → Understand → Adjust

MYNAIRATRACK answers three key questions:
1. How much money do I have?
2. Where is my money going?
3. Am I managing my money according to my plan?

## Target Users

- **Working Professionals** — people with regular income who need to manage monthly budgets, expenses, and savings.
- **Business Owners** — people who need to track sales, business income, expenses, and profit.
- **Freelancers and Side-Hustlers** — people with irregular or multiple income sources.
- **General Money Managers** — anyone managing a specific amount of money over a set period.

## Main Features

- **Personalized Financial Dashboard** — overview of available money, income, expenses, budget, savings, alerts, and recent transactions.
- **Income Tracking** — record income from multiple sources (salary, business, freelance, side hustle, gifts, etc.).
- **Expense Tracking** — quick and detailed transaction entry by amount, category, date, payment method, and note.
- **Flexible Budgeting** — create budgets for any amount and any period, with custom categories.
- **Guided Budgeting** — suggested category-based budget allocations that users can adjust.
- **Budget Monitoring** — real-time updates on spent vs. remaining budget as expenses are recorded.
- **Spending Insights** — simple, understandable summaries of spending patterns.
- **Budget Alerts** — optional alerts at 50%, 80%, 100%, or over-budget thresholds.
- **Savings Tracking** — track savings separately, including progress toward targets.
- **Financial Goals** — create goals with target amounts, deadlines, and suggested contributions.
- **Business Mode** — track sales, expenses, and profit separately from personal finances.
- **Custom Categories** — common categories plus user-defined ones.

## Positioning

*Know your money. Track your money. Plan your money.*

## Status

Product Concept / Initial PRD — see `MYNAIRATRACK 001-PRODUCT REQUIREMENTS DOCUMENT.docx`.

## Local development (Phase 1 skeleton)

Prerequisites: Node.js LTS, Python 3.11+, local PostgreSQL.

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Backend:

```bash
cd backend
cp .env.example .env
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health checks:

- `GET http://localhost:8000/health` → `{"status": "ok", "phase": 1}`
- `GET http://localhost:8000/db-check` → `{"ok": true}` when PostgreSQL is reachable.
