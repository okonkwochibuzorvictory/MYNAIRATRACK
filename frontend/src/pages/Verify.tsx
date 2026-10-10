import { useEffect, useState } from 'react'
import { apiFetch } from '../auth/client'

function tokenFromHash(): string {
  const hash = window.location.hash || ''
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  return new URLSearchParams(query).get('token') ?? ''
}

export default function Verify() {
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working')

  useEffect(() => {
    const token = tokenFromHash()
    if (!token) {
      setState('bad')
      return
    }
    apiFetch(`/auth/verify?token=${encodeURIComponent(token)}`)
      .then((res) => setState(res.ok ? 'ok' : 'bad'))
      .catch(() => setState('bad'))
  }, [])

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
        {state === 'working' && (
          <>
            <h1>Verifying…</h1>
            <p className="mt-auth-sub">Confirming your email address.</p>
          </>
        )}
        {state === 'ok' && (
          <>
            <h1>Email verified</h1>
            <p className="mt-auth-sub">Your account is ready. Log in to continue.</p>
            <a className="mt-btn" style={{ textDecoration: 'none', textAlign: 'center' }} href="#/login">
              Log in
            </a>
          </>
        )}
        {state === 'bad' && (
          <>
            <h1>Link invalid or expired</h1>
            <p className="mt-auth-sub">Ask for a new verification email and try again.</p>
            <a className="mt-btn" style={{ textDecoration: 'none', textAlign: 'center' }} href="#/login">
              Back to login
            </a>
          </>
        )}
      </main>
    </div>
  )
}
