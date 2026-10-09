import { useEffect, useState } from 'react'
import { getMe, type User } from '../auth/client'
import AppShell from '../components/AppShell'
import BalanceToggle from '../components/BalanceToggle'
import RatesStatus from '../components/RatesStatus'
import { Card, EmptyState, SectionHead, SoonBadge } from '../components/ui'
import { fetchAccounts, type Account } from '../lib/accounts'
import { fetchBudgets, statusColor, type Budget } from '../lib/budgets'
import { fetchAlerts, type AlertItem } from '../lib/insights'
import { fetchGoals, fetchSavings, statusColor as goalStatusColor, type Goal, type SavingsTarget } from '../lib/goals'
import {
  ALL_CURRENCIES_VALUE,
  CURRENCY_SYMBOLS,
  convertAmount,
  formatOriginal,
} from '../lib/currency'
import { DEFAULT_BALANCE_VISIBLE, displayBalance } from '../lib/privacy'
import { fetchTransactions, type Transaction } from '../lib/transactions'

const QUICK_ACTIONS = [
  { label: 'Add Income', sub: 'Record money in', icon: '+', href: '#/transactions', soon: false },
  { label: 'Add Expense', sub: 'Record money out', icon: '−', href: '#/transactions', soon: false },
  { label: 'Create Budget', sub: 'Plan your spending', icon: '◫', href: '#/budgets', soon: false },
  { label: 'Add Goal', sub: 'Save toward something', icon: '◎', href: '#/goals', soon: false },
]

interface MoneyState {
  loading: boolean
  totalText: string
  totalSub: string
  incomeText: string | null
  expensesText: string | null
  recent: Transaction[]
}

const EMPTY_MONEY: MoneyState = {
  loading: true,
  totalText: '—',
  totalSub: 'Your balance will appear here once you add an account or transaction.',
  incomeText: null,
  expensesText: null,
  recent: [],
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [txns, setTxns] = useState<Transaction[] | null>(null)
  const [budgets, setBudgets] = useState<Budget[] | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null)
  const [goalItems, setGoalItems] = useState<Array<SavingsTarget | Goal> | null>(null)
  const [filter, setFilter] = useState<string>('NGN')
  const [showBalance, setShowBalance] = useState<boolean>(DEFAULT_BALANCE_VISIBLE)
  const [money, setMoney] = useState<MoneyState>(EMPTY_MONEY)

  useEffect(() => {
    getMe()
      .then((me) => {
        setUser(me)
        if (me) setFilter(me.primary_currency)
      })
      .catch(() => {
        window.location.hash = '#/login'
      })
    fetchAccounts().then(setAccounts).catch(() => setAccounts([]))
    fetchTransactions().then(setTxns).catch(() => setTxns([]))
    fetchBudgets().then(setBudgets).catch(() => setBudgets([]))
    fetchAlerts().then(setAlerts).catch(() => setAlerts([]))
    Promise.all([fetchSavings(), fetchGoals()])
      .then(([s, g]) => setGoalItems([...s, ...g]))
      .catch(() => setGoalItems([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    if (accounts === null || txns === null || !user) return

    async function toPrimary(amount: string, currency: string, primary: string): Promise<number | null> {
      if (currency === primary) return Number(amount)
      try {
        const r = await convertAmount(currency, primary, amount)
        if (r.available && r.converted_amount !== null) return Number(r.converted_amount)
        return null
      } catch {
        return null
      }
    }

    async function compute() {
      const acctList = accounts ?? []
      const txnList = txns ?? []
      const me = user
      if (!me) return

      if (acctList.length === 0 && txnList.length === 0) {
        if (!cancelled) setMoney({ ...EMPTY_MONEY, loading: false })
        return
      }

      if (filter !== ALL_CURRENCIES_VALUE) {
        const matchingAccts = acctList.filter((a) => a.currency === filter)
        const matchingTxns = txnList.filter((t) => t.currency === filter)
        const income = matchingTxns
          .filter((t) => t.type === 'income')
          .reduce((s, t) => s + Number(t.amount), 0)
        const expenses = matchingTxns
          .filter((t) => t.type === 'expense')
          .reduce((s, t) => s + Number(t.amount), 0)
        const total = matchingAccts.reduce((s, a) => s + Number(a.balance), 0)
        if (cancelled) return
        const noneTracked = txnList.length === 0
        setMoney({
          loading: false,
          totalText:
            matchingAccts.length === 0
              ? `${CURRENCY_SYMBOLS[filter] ?? ''} —`
              : formatOriginal(total.toFixed(2), filter),
          totalSub:
            matchingAccts.length === 0
              ? `No accounts in ${filter} yet.`
              : `Across ${matchingAccts.length} account${matchingAccts.length === 1 ? '' : 's'} in ${filter}.`,
          incomeText: noneTracked ? null : formatOriginal(income.toFixed(2), filter),
          expensesText: noneTracked ? null : formatOriginal(expenses.toFixed(2), filter),
          recent: [...matchingTxns]
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
            .slice(0, 5),
        })
        return
      }

      // All Currencies: consolidate to the primary currency through the backend.
      const primary = me.primary_currency
      let total = 0
      let income = 0
      let expenses = 0
      let convertOk = true
      for (const a of acctList) {
        const v = await toPrimary(a.balance, a.currency, primary)
        if (cancelled) return
        if (v === null) convertOk = false
        else total += v
      }
      for (const t of txnList) {
        const v = await toPrimary(t.amount, t.currency, primary)
        if (cancelled) return
        if (v === null) convertOk = false
        else if (t.type === 'income') income += v
        else expenses += v
      }
      if (cancelled) return
      const recent = [...txnList]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
        .slice(0, 5)
      const noneTracked = txnList.length === 0
      setMoney({
        loading: false,
        totalText: formatOriginal(total.toFixed(2), primary),
        totalSub: convertOk
          ? `All Currencies consolidated view · converted to ${primary} using cached rates.`
          : `Converted to ${primary} using cached rates · some amounts unavailable — not included.`,
        incomeText: noneTracked ? null : formatOriginal(income.toFixed(2), primary),
        expensesText: noneTracked ? null : formatOriginal(expenses.toFixed(2), primary),
        recent,
      })
    }

    setMoney((m) => ({ ...m, loading: true }))
    void compute()
    return () => {
      cancelled = true
    }
  }, [accounts, txns, user, filter])

  const symbol = CURRENCY_SYMBOLS[filter] ?? ''

  return (
    <AppShell
      active="dashboard"
      title="Dashboard"
      subtitle="Here's your money overview."
      filter={filter}
      onFilterChange={setFilter}
    >
      <Card className="mt-balance">
        <div className="mt-balance-top">
          <p className="mt-card-label">Total Balance</p>
          <BalanceToggle visible={showBalance} onToggle={() => setShowBalance((v) => !v)} />
        </div>
        <p className="mt-balance-amount">
          {money.loading ? `${symbol} …` : displayBalance(money.totalText, showBalance)}
        </p>
        <p className="mt-balance-sub">{money.totalSub}</p>
      </Card>

      <div className="mt-grid-3">
        <Card>
          <p className="mt-card-label">Income</p>
          {money.loading ? (
            <p className="mt-stat-sub">Loading…</p>
          ) : money.incomeText === null ? (
            <EmptyState icon="+" title="No income yet" text="Income will appear here once you start tracking." />
          ) : (
            <>
              <p className="mt-stat-value">{displayBalance(money.incomeText, showBalance)}</p>
              <p className="mt-stat-sub">Recorded income{filter === ALL_CURRENCIES_VALUE ? ' · converted' : ` · in ${filter}`}</p>
            </>
          )}
        </Card>
        <Card>
          <p className="mt-card-label">Expenses</p>
          {money.loading ? (
            <p className="mt-stat-sub">Loading…</p>
          ) : money.expensesText === null ? (
            <EmptyState icon="−" title="No expenses yet" text="Expenses will appear here once you start tracking." />
          ) : (
            <>
              <p className="mt-stat-value">{displayBalance(money.expensesText, showBalance)}</p>
              <p className="mt-stat-sub">Recorded spending{filter === ALL_CURRENCIES_VALUE ? ' · converted' : ` · in ${filter}`}</p>
            </>
          )}
        </Card>
        <Card>
          <p className="mt-card-label">Savings</p>
          <EmptyState icon="◎" title="No savings yet" text="Savings will appear here once you set a target." />
        </Card>
      </div>

      <SectionHead title="Quick Actions" />
      <div className="mt-grid-4">
        {QUICK_ACTIONS.map((q) => (
          <a key={q.label} className="mt-quick" href={q.href}>
            <span className="mt-quick-icon" aria-hidden="true">
              {q.icon}
            </span>
            <strong>
              {q.label}
              {q.soon && <SoonBadge />}
            </strong>
            <small>{q.sub}</small>
          </a>
        ))}
      </div>

      <SectionHead title="Money Activity" action={<a href="#/transactions">View all</a>} />
      <Card>
        {money.loading ? (
          <p className="mt-stat-sub">Loading…</p>
        ) : money.recent.length === 0 ? (
          <EmptyState
            icon="◍"
            title="No activity yet"
            text="Your spending insights will appear here once you start tracking transactions."
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {money.recent.map((t) => (
              <li key={t.id} style={{ padding: '0.6rem 0', borderTop: '1px solid var(--mt-border)' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontWeight: 800,
                      color: t.type === 'income' ? 'var(--mt-success)' : 'var(--mt-error)',
                    }}
                  >
                    {t.type === 'income' ? '+' : '−'}
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong>{t.category_name ?? 'Uncategorized'}</strong>
                    <div className="mt-stat-sub">
                      {t.date} · {t.account_name ?? ''}
                    </div>
                  </span>
                  <strong>{displayBalance(formatOriginal(t.amount, t.currency), showBalance)}</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-grid-2">
        <div>
          <SectionHead title="Budget Progress" action={<a href="#/budgets">View budgets</a>} />
          <Card>
            {budgets === null ? (
              <p className="mt-stat-sub">Loading…</p>
            ) : budgets.length === 0 ? (
              <EmptyState
                icon="◫"
                title="No budgets yet"
                text="Create your first budget to start monitoring your spending."
                action={
                  <a className="mt-btn" style={{ textDecoration: 'none' }} href="#/budgets">
                    Create Budget
                  </a>
                }
              />
            ) : (
              <ActiveBudgetSummary budget={pickActiveBudget(budgets)} showAmounts={showBalance} />
            )}
          </Card>
        </div>
        <div>
          <SectionHead title="Savings & Goals" action={<a href="#/goals">View goals</a>} />
          <Card>
            {goalItems === null ? (
              <p className="mt-stat-sub">Loading…</p>
            ) : goalItems.length === 0 ? (
              <EmptyState
                icon="◎"
                title="No goals yet"
                text="Start working toward your financial goals."
                action={
                  <a className="mt-btn" style={{ textDecoration: 'none' }} href="#/goals">
                    Add Goal
                  </a>
                }
              />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {goalItems.slice(0, 3).map((g) => (
                  <li key={`${g.id}`} style={{ padding: '0.6rem 0', borderTop: '1px solid var(--mt-border)' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                      <span style={{ flex: 1 }}>
                        <strong>{g.name}</strong>
                        <div className="mt-stat-sub">
                          {displayBalance(
                            `${formatOriginal(g.current_amount, g.currency)} of ${formatOriginal(g.target_amount, g.currency)}`,
                            showBalance,
                          )}
                        </div>
                      </span>
                      <span className="mt-status" style={{ color: goalStatusColor(g.status) }}>
                        {g.status}
                      </span>
                    </div>
                    <div className="mt-progress" role="progressbar" aria-valuenow={Math.round(g.percent_complete)} aria-valuemin={0} aria-valuemax={100}>
                      <span
                        style={{
                          width: `${Math.max(0, Math.min(100, g.percent_complete))}%`,
                          background: goalStatusColor(g.status),
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <SectionHead title="Exchange Rates" />
      <Card>
        <RatesStatus />
      </Card>
      <SectionHead title="Alerts" action={<a href="#/insights">View all</a>} />
      <Card>
        {alerts === null ? (
          <p className="mt-stat-sub">Loading…</p>
        ) : alerts.filter((a) => !a.is_read).length === 0 ? (
          <EmptyState
            icon="🔔"
            title="You're all caught up"
            text="Budget alerts will appear here when your spending crosses a threshold you enabled."
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {alerts
              .filter((a) => !a.is_read)
              .slice(0, 3)
              .map((a) => (
                <li key={a.id} style={{ padding: '0.6rem 0', borderTop: '1px solid var(--mt-border)' }}>
                  <strong>{a.budget_name ?? 'Budget alert'}</strong>
                  <div className="mt-stat-sub">{a.message}</div>
                </li>
              ))}
          </ul>
        )}
      </Card>
      <p className="mt-note">
        Conversions are reporting-only; original amounts and currencies are never changed.
      </p>
    </AppShell>
  )
}

function pickActiveBudget(budgets: Budget[]): Budget {
  const today = new Date().toISOString().slice(0, 10)
  return (
    budgets.find((b) => b.period_start <= today && today <= b.period_end) ?? budgets[0]
  )
}

function ActiveBudgetSummary({
  budget,
  showAmounts,
}: {
  budget: Budget
  showAmounts: boolean
}) {
  const width = Math.max(0, Math.min(100, budget.percent_used))
  return (
    <div>
      <strong>{budget.name}</strong>
      <p className="mt-stat-sub" style={{ margin: '0.25rem 0' }}>
        {budget.period_start} → {budget.period_end} · {budget.currency}
      </p>
      <p className="mt-stat-value" style={{ fontSize: '1.2rem' }}>
        {displayBalance(
          `${formatOriginal(budget.total_spent, budget.currency)} of ${formatOriginal(budget.amount, budget.currency)}`,
          showAmounts,
        )}
      </p>
      <div className="mt-progress" role="progressbar" aria-valuenow={Math.round(budget.percent_used)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${width}%`, background: statusColor(budget.status) }} />
      </div>
      <span className="mt-status" style={{ color: statusColor(budget.status) }}>
        {budget.status}
      </span>
    </div>
  )
}
