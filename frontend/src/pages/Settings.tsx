import { useEffect, useState, type FormEvent } from 'react'
import { MVP_CURRENCIES, getMe, logout, updateMe, type User } from '../auth/client'
import AppShell from '../components/AppShell'

export default function Settings() {
  const [user, setUser] = useState<User | null>(null)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('NGN')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getMe()
      .then((me) => {
        setUser(me)
        if (me) {
          setName(me.name)
          setCurrency(me.primary_currency)
        }
      })
      .catch(() => {
        window.location.hash = '#/login'
      })
  }, [])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const updated = await updateMe({ name, primary_currency: currency })
      setUser(updated)
      setMessage('Settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function onLogout() {
    await logout()
    window.location.hash = '#/'
  }

  return (
    <AppShell active="settings" title="Settings" subtitle="Manage your profile and preferences.">
      <section className="mt-card" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Profile</h2>
        {user && <p className="mt-auth-sub">{user.email}</p>}
        <form onSubmit={onSave}>
          <div className="mt-field">
            <label htmlFor="settings-name">Name</label>
            <input
              id="settings-name"
              className="mt-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mt-field">
            <label htmlFor="settings-currency">Primary currency</label>
            <select
              id="settings-currency"
              className="mt-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {MVP_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="mt-error">{error}</p>}
          {message && <p className="mt-success-msg">{message}</p>}
          <button className="mt-btn" type="submit">
            Save settings
          </button>
        </form>
        <p className="mt-note">
          Changing the primary currency only changes how reports are displayed. Your saved amounts
          and their currencies are never rewritten. ·{' '}
          <button
            type="button"
            onClick={onLogout}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--mt-primary)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </p>
      </section>
    </AppShell>
  )
}
