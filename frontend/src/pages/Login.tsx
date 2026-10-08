import { useState, type FormEvent } from 'react'
import { login } from '../auth/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      window.location.hash = '#/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
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
        <h1>Welcome back</h1>
        <p className="mt-auth-sub">Log in to see what is happening with your money.</p>
        <form onSubmit={onSubmit}>
          <div className="mt-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="mt-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mt-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="mt-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="mt-error">{error}</p>}
          <button className="mt-btn" type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="mt-auth-foot">
          No account? <a href="#/signup">Sign up</a>
        </p>
      </main>
    </div>
  )
}
