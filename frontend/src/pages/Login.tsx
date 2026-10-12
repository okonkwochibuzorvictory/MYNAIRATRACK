import { useState, type FormEvent } from 'react'
import { apiFetch, login } from '../auth/client'
import PasswordInput from '../components/PasswordInput'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendFailed, setResendFailed] = useState(false)
  const [resending, setResending] = useState(false)

  const needsVerification =
    error === 'Please verify your email address before logging in'

  async function resend() {
    setResending(true)
    setResendFailed(false)
    try {
      const res = await apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      let emailed = true
      try {
        const data = await res.json()
        if (typeof data?.verification_emailed === 'boolean') emailed = data.verification_emailed
      } catch {
        // Unreadable response: keep previous behaviour and assume it was sent.
      }
      if (emailed) setResent(true)
      else setResendFailed(true)
    } finally {
      setResending(false)
    }
  }

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
          <PasswordInput
            id="login-password"
            label="Password"
            value={password}
            onChange={setPassword}
            required
          />
          {error && <p className="mt-error">{error}</p>}
          {needsVerification && (
            <p className="mt-auth-sub">
              {resent ? (
                'Verification email re-sent — check your inbox and spam folder.'
              ) : resendFailed ? (
                <span className="mt-error" style={{ display: 'block' }}>
                  We could not send the email right now. Please try again in a few minutes.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={resend}
                  disabled={resending}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--mt-primary)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {resending ? 'Sending…' : 'Re-send verification email'}
                </button>
              )}
            </p>
          )}
          <button className="mt-btn" type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="mt-auth-foot">
          No account? <a href="#/signup">Sign up</a>
          {' · '}
          <a href="#/forgot-password">Forgot password?</a>
        </p>
      </main>
    </div>
  )
}
