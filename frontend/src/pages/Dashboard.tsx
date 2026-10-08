import { useEffect, useState } from 'react'
import { getMe, logout, type User } from '../auth/client'

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {
        window.location.hash = '#/login'
      })
  }, [])

  async function onLogout() {
    await logout()
    window.location.hash = '#/'
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Dashboard</h1>
      {user && (
        <p>
          Welcome, {user.name} ({user.primary_currency})
        </p>
      )}
      <p>Your financial overview will appear here in later phases.</p>
      <p>
        <a href="#/settings">Settings</a>
        {' · '}
        <button type="button" onClick={onLogout}>
          Log out
        </button>
      </p>
    </main>
  )
}
