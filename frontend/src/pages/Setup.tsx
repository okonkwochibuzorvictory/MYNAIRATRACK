import { useEffect, useState } from 'react'
import { MVP_CURRENCIES, getMe, updateMe, type User } from '../auth/client'

export default function Setup() {
  const [user, setUser] = useState<User | null>(null)
  const [currency, setCurrency] = useState<string>('NGN')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getMe()
      .then((me) => {
        setUser(me)
        if (me) setCurrency(me.primary_currency)
      })
      .catch(() => {
        window.location.hash = '#/login'
      })
  }, [])

  async function save() {
    setError('')
    setBusy(true)
    try {
      await updateMe({ primary_currency: currency })
      window.location.hash = '#/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-auth-wrap">
      <main className="mt-auth-card">
        <div className="mt-brand">
          <span className="mt-brand-mark" aria-hidden="true">
            ₦
          </span>
          <span className="mt-brand-name">
            MYNAIRA<span>TRACK</span>
          </span>
        </div>
        <h1>Choose your primary currency</h1>
        <p className="mt-auth-sub">
          {user ? `Welcome, ${user.name}. ` : ''}Reports default to this currency. NGN is the
          default — you can change it any time in Settings.
        </p>
        <div className="mt-field">
          <label htmlFor="setup-currency">Primary currency</label>
          <select
            id="setup-currency"
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
        <button className="mt-btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Continue to dashboard'}
        </button>
      </main>
    </div>
  )
}
