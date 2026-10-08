import { useEffect, useState } from 'react'
import { getMe, type User } from '../auth/client'
import AppShell from '../components/AppShell'
import BalanceToggle from '../components/BalanceToggle'
import RatesStatus from '../components/RatesStatus'
import { Card, EmptyState, SectionHead, SoonBadge } from '../components/ui'
import { fetchAccounts, type Account } from '../lib/accounts'
import {
  ALL_CURRENCIES_VALUE,
  CURRENCY_SYMBOLS,
  convertAmount,
  formatOriginal,
} from '../lib/currency'
import { DEFAULT_BALANCE_VISIBLE, displayBalance } from '../lib/privacy'

const QUICK_ACTIONS = [
  { label: 'Add Income', sub: 'Record money in', icon: '+', href: '#/transactions' },
  { label: 'Add Expense', sub: 'Record money out', icon: '−', href: '#/transactions' },
  { label: 'Create Budget', sub: 'Plan your spending', icon: '◫', href: '#/budgets' },
  { label: 'Add Goal', sub: 'Save toward something', icon: '◎', href: '#/goals' },
]

interface TotalState {
  loading: boolean
  text: string
  sub: string
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [filter, setFilter] = useState<string>('NGN')
  const [showBalance, setShowBalance] = useState<boolean>(DEFAULT_BALANCE_VISIBLE)
  const [total, setTotal] = useState<TotalState>({
    loading: true,
    text: '—',
    sub: 'Your balance will appear here once you add an account or transaction.',
  })

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
  }, [])

  useEffect(() => {
    let cancelled = false
    if (accounts === null || !user) return

    async function compute() {
      const acctList = accounts
      const me = user
      if (acctList === null || !me) return

      if (acctList.length === 0) {
        if (!cancelled)
          setTotal({
            loading: false,
            text: '—',
            sub: 'Your balance will appear here once you add an account or transaction.',
          })
        return
      }
      if (filter !== ALL_CURRENCIES_VALUE) {
        const matching = acctList.filter((a) => a.currency === filter)
        if (matching.length === 0) {
          if (!cancelled)
            setTotal({
              loading: false,
              text: `${CURRENCY_SYMBOLS[filter] ?? ''} —`,
              sub: `No accounts in ${filter} yet.`,
            })
          return
        }
        const sum = matching.reduce((s, a) => s + Number(a.balance), 0)
        if (!cancelled)
          setTotal({
            loading: false,
            text: formatOriginal(sum.toFixed(2), filter),
            sub: `Across ${matching.length} account${matching.length === 1 ? '' : 's'} in ${filter}.`,
          })
        return
      }
      // All Currencies: convert every native balance to the primary currency
      // through the backend (React never calls the FX provider directly).
      const primary = me.primary_currency
      let sum = 0
      const missing: string[] = []
      for (const a of acctList) {
        if (a.currency === primary) {
          sum += Number(a.balance)
          continue
        }
        try {
          const r = await convertAmount(a.currency, primary, a.balance)
          if (cancelled) return
          if (r.available && r.converted_amount !== null) sum += Number(r.converted_amount)
          else if (!missing.includes(a.currency)) missing.push(a.currency)
        } catch {
          if (!cancelled && !missing.includes(a.currency)) missing.push(a.currency)
        }
      }
      if (cancelled) return
      setTotal({
        loading: false,
        text: formatOriginal(sum.toFixed(2), primary),
        sub:
          missing.length === 0
            ? `All Currencies consolidated view · converted to ${primary} using cached rates.`
            : `Converted to ${primary} using cached rates · conversion unavailable for ${missing.join(', ')} — not included.`,
      })
    }

    setTotal((t) => ({ ...t, loading: true }))
    void compute()
    return () => {
      cancelled = true
    }
  }, [accounts, user, filter])

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
          {total.loading ? `${symbol} …` : displayBalance(total.text, showBalance)}
        </p>
        <p className="mt-balance-sub">{total.sub}</p>
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
