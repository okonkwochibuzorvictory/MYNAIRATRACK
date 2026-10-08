import { useState, type FormEvent } from 'react'
import { register } from '../auth/client'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(name, email, password)
      window.location.hash = '#/setup'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
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
        <h1>Create your account</h1>
        <p className="mt-auth-sub">Start tracking your money in less than a minute.</p>
        <form onSubmit={onSubmit}>
          <div className="mt-field">
            <label htmlFor="signup-name">Name</label>
            <input
              id="signup-name"
              className="mt-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mt-field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              className="mt-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mt-field">
            <label htmlFor="signup-password">Password (min 8 chars, letters + numbers)</label>
            <input
              id="signup-password"
              className="mt-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="mt-error">{error}</p>}
          <button className="mt-btn" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="mt-auth-foot">
          Have an account? <a href="#/login">Log in</a>
        </p>
      </main>
    </div>
  )
}
