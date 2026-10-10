import { useState, type FormEvent } from 'react'
import { apiFetch } from '../auth/client'
import PasswordInput from '../components/PasswordInput'

async function readMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    return `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

function tokenFromHash(): string {
  const hash = window.location.hash || ''
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  return new URLSearchParams(query).get('token') ?? ''
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setDone(true)
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
        <h1>Forgot password</h1>
        {done ? (
          <p className="mt-auth-sub">
            If an account uses this email, a reset link is on its way. It expires in 1 hour.
          </p>
        ) : (
          <>
            <p className="mt-auth-sub">Enter your account email to receive a reset link.</p>
            <form onSubmit={onSubmit}>
              <div className="mt-field">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  className="mt-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button className="mt-btn" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
        <p className="mt-auth-foot">
          <a href="#/login">Back to login</a>
        </p>
      </main>
    </div>
  )
}

export function ResetPassword() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: tokenFromHash(), password }),
      })
      if (!res.ok) throw new Error(await readMessage(res))
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
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
        <h1>Set a new password</h1>
        {done ? (
          <>
            <p className="mt-auth-sub">Password updated. Log in with the new one.</p>
            <a className="mt-btn" style={{ textDecoration: 'none', textAlign: 'center' }} href="#/login">
              Log in
            </a>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <PasswordInput
              id="reset-password"
              label="New password (min 8 chars, letters + numbers)"
              value={password}
              onChange={setPassword}
              required
            />
            {error && <p className="mt-error">{error}</p>}
            <button className="mt-btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Reset password'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
