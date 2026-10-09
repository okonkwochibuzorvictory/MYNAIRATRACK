import { useEffect, useState, type ReactNode } from 'react'
import { getMe, logout, type User } from '../auth/client'
import CurrencySelector from '../components/CurrencySelector'
import { greetingChanged, greetingFor } from '../lib/greeting'
import { fetchUnreadCount } from '../lib/insights'

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '◉', href: '#/dashboard' },
  { key: 'accounts', label: 'Accounts', icon: '▤', href: '#/accounts' },
  { key: 'transactions', label: 'Transactions', icon: '⇄', href: '#/transactions' },
  { key: 'categories', label: 'Categories', icon: '▦', href: '#/categories' },
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
  const [unread, setUnread] = useState(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    getMe()
      .then((me) => {
        setUser(me)
        if (me) fetchUnreadCount().then(setUnread).catch(() => {})
      })
      .catch(() => {
        window.location.hash = '#/login'
      })
  }, [])

  useEffect(() => {
    // Re-check the clock regularly so the greeting follows period changes,
    // including OS clock corrections (NTP), manual changes, DST, and sleep.
    // State only updates when the day part actually changes.
    const id = window.setInterval(() => {
      setNow((prev) => {
        const next = new Date()
        return greetingChanged(prev, next) ? next : prev
      })
    }, 30000)
    return () => window.clearInterval(id)
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
            <h1>{user ? greetingFor(user.name, now) : title}</h1>
            <p>{subtitle ?? "Here's your money overview."}</p>
          </div>
          <div className="mt-header-side">
            {filter !== undefined && onFilterChange && (
              <CurrencySelector value={filter} onChange={onFilterChange} />
            )}
            {user && (
              <>
                <a
                  href="#/insights"
                  aria-label={unread > 0 ? `${unread} unread alerts` : 'No unread alerts'}
                  title="Alerts"
                  style={{
                    position: 'relative',
                    textDecoration: 'none',
                    fontSize: '1.2rem',
                    color: 'var(--mt-text)',
                  }}
                >
                  <span aria-hidden="true">🔔</span>
                  {unread > 0 && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: '-0.4rem',
                        right: '-0.5rem',
                        background: 'var(--mt-error)',
                        color: '#fff',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '0 0.35rem',
                      }}
                    >
                      {unread}
                    </span>
                  )}
                </a>
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
