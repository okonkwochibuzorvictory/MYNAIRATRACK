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
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>Choose your primary currency</h1>
      <p>{user ? `Welcome, ${user.name}. ` : ''}Default is NGN. You can change it later in Settings.</p>
      <p>
        <label>
          Primary currency
          <br />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {MVP_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Continue to dashboard'}
      </button>
    </main>
  )
}
