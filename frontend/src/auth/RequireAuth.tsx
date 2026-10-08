import { useEffect, useState, type ReactNode } from 'react'
import { getMe, type User } from './client'
import { LOGIN_ROUTE, shouldRedirectToLogin } from './routes'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    getMe()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setChecking(false)
        if (shouldRedirectToLogin(me !== null, window.location.hash || '#/')) {
          window.location.hash = LOGIN_ROUTE
        }
      })
      .catch(() => {
        if (cancelled) return
        setChecking(false)
        window.location.hash = LOGIN_ROUTE
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (checking) return <p>Checking session…</p>
  if (!user) return null
  return <>{children}</>
}
