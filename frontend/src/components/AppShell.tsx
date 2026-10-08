import { useEffect, useState, type ReactNode } from 'react'
import { getMe, logout, type User } from '../auth/client'
import CurrencySelector from '../components/CurrencySelector'
import { greetingFor } from '../lib/greeting'

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '◉', href: '#/dashboard' },
  { key: 'accounts', label: 'Accounts', icon: '▤', href: '#/accounts' },
  { key: 'transactions', label: 'Transactions', icon: '⇄', href: '#/transactions' },
  { key: 'budgets', label: 'Budgets', icon: '◫', href: '#/budgets' },
  { key: 'goals', label: 'Goals', icon: '◎', href: '#/goals' },
  { key: 'insights', label: 'Insights', icon: '◍', href: '#/insights' },
  { key: 'business', label: 'Business', icon: '▣', href: '#/business' },
  { key: 'settings', label: 'Settings', icon: '⚙', href: '#/settings' },
]

interface Props {
  active: string
  title: string
  subtitle?: string
  filter?: string
  onFilterChange?: (value: string) => void
  children: ReactNode
}

export default function AppShell({ active, title, subtitle, filter, onFilterChange, children }: Props) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {
        window.location.hash = '#/login'
      })
  }, [])

  async function onLogout() {
    await logout()
    window.location.hash = '#/'
  }

  const initial = (user?.name.trim()[0] ?? '•').toUpperCase()

  return (
    <div className="mt-shell">
      <aside className="mt-sidebar" aria-label="Primary">
        <div className="mt-brand">
          <span className="mt-brand-mark" aria-hidden="true">
            ₦
          </span>
          <span className="mt-brand-name">
            MYNAIRA<span>TRACK</span>
          </span>
        </div>
        <nav className="mt-nav">
          {NAV.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={`mt-nav-link${active === item.key ? ' active' : ''}`}
              aria-current={active === item.key ? 'page' : undefined}
            >
              <span className="mt-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-side-foot">Know your money. Track your money. Plan your money.</div>
      </aside>
      <div className="mt-main">
        <header className="mt-header">
          <div className="mt-header-titles">
            <h1>{user ? greetingFor(user.name) : title}</h1>
            <p>{subtitle ?? "Here's your money overview."}</p>
          </div>
          <div className="mt-header-side">
            {filter !== undefined && onFilterChange && (
              <CurrencySelector value={filter} onChange={onFilterChange} />
            )}
            {user && (
              <>
                <div className="mt-profile">
                  <div className="mt-profile-name">{user.name}</div>
                  <div className="mt-profile-mail">{user.email}</div>
                </div>
                <span className="mt-avatar" aria-hidden="true">
                  {initial}
                </span>
                <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={onLogout}>
                  Log out
                </button>
              </>
            )}
          </div>
        </header>
        <div className="mt-content">{children}</div>
      </div>
    </div>
  )
}
