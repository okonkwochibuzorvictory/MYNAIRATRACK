import { useEffect, useState, type FormEvent } from 'react'
import { MVP_CURRENCIES, getMe, logout, updateMe, type User } from '../auth/client'

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
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>Settings</h1>
      {user && <p>{user.email}</p>}
      <form onSubmit={onSave}>
        <p>
          <label>
            Name
            <br />
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        </p>
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
        {message && <p style={{ color: 'green' }}>{message}</p>}
        <button type="submit">Save settings</button>
      </form>
      <p>
        <a href="#/dashboard">Back to dashboard</a>
        {' · '}
        <button type="button" onClick={onLogout}>
          Log out
        </button>
      </p>
    </main>
  )
}
