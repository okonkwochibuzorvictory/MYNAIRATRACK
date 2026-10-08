import { useEffect, useState } from 'react'
import { getMe, type User } from '../auth/client'
import AppShell from '../components/AppShell'
import RatesStatus from '../components/RatesStatus'
import { Card, EmptyState, SectionHead, SoonBadge } from '../components/ui'
import { ALL_CURRENCIES_VALUE, CURRENCY_SYMBOLS } from '../lib/currency'

const QUICK_ACTIONS = [
  { label: 'Add Income', sub: 'Record money in', icon: '+', href: '#/transactions' },
  { label: 'Add Expense', sub: 'Record money out', icon: '−', href: '#/transactions' },
  { label: 'Create Budget', sub: 'Plan your spending', icon: '◫', href: '#/budgets' },
  { label: 'Add Goal', sub: 'Save toward something', icon: '◎', href: '#/goals' },
]

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [filter, setFilter] = useState<string>('NGN')

  useEffect(() => {
    getMe()
      .then((me) => {
        setUser(me)
        if (me) setFilter(me.primary_currency)
      })
      .catch(() => {
        window.location.hash = '#/login'
      })
  }, [])

  const symbol = CURRENCY_SYMBOLS[filter] ?? ''
  const reportingNote =
    filter === ALL_CURRENCIES_VALUE
      ? `All Currencies consolidated view · converted to ${user?.primary_currency ?? 'NGN'}`
      : `Reporting in ${filter}`;

  return (
    <AppShell
      active="dashboard"
      title="Dashboard"
      subtitle="Here's your money overview."
      filter={filter}
      onFilterChange={setFilter}
    >
      <Card className="mt-balance">
        <p className="mt-card-label">Total Balance</p>
        <p className="mt-balance-amount">
          {symbol ? `${symbol} —` : '—'}
        </p>
        <p className="mt-balance-sub">
          Your balance will appear here once you add an account or transaction. · {reportingNote}
        </p>
      </Card>

      <div className="mt-grid-3">
        {[
          { label: 'Income', icon: '+', text: 'Income will appear here once you start tracking.' },
          { label: 'Expenses', icon: '−', text: 'Expenses will appear here once you start tracking.' },
          { label: 'Savings', icon: '◎', text: 'Savings will appear here once you set a target.' },
        ].map((s) => (
          <Card key={s.label}>
            <p className="mt-card-label">{s.label}</p>
            <EmptyState icon={s.icon} title={`No ${s.label.toLowerCase()} yet`} text={s.text} />
          </Card>
        ))}
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
              <SoonBadge />
            </strong>
            <small>{q.sub}</small>
          </a>
        ))}
      </div>

      <SectionHead title="Money Activity" />
      <Card>
        <EmptyState
          icon="◍"
          title="No activity yet"
          text="Your spending insights will appear here once you start tracking transactions."
        />
      </Card>

      <div className="mt-grid-2">
        <div>
          <SectionHead title="Budget Progress" action={<a href="#/budgets">View budgets</a>} />
          <Card>
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
          </Card>
        </div>
        <div>
          <SectionHead title="Savings & Goals" action={<a href="#/goals">View goals</a>} />
          <Card>
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
          </Card>
        </div>
      </div>

      <SectionHead title="Exchange Rates" />
      <Card>
        <RatesStatus />
      </Card>
      <p className="mt-note">
        Conversions are reporting-only; original amounts and currencies are never changed.
      </p>
    </AppShell>
  )
}
