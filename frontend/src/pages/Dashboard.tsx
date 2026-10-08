import { useEffect, useState } from 'react'
import { getMe, logout, type User } from '../auth/client'
import CurrencySelector from '../components/CurrencySelector'
import RatesStatus from '../components/RatesStatus'
import { ALL_CURRENCIES_VALUE } from '../lib/currency'

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [filter, setFilter] = useState<string>('NGN')

  useEffect(() => {
    getMe()
      .then((me) => {
        setUser(me)
        if (me) setFilter(me.primary_currency)
      })
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
      <CurrencySelector value={filter} onChange={setFilter} />
      {filter === ALL_CURRENCIES_VALUE ? (
        <p>All Currencies consolidated view (converted to {user?.primary_currency ?? 'NGN'}).</p>
      ) : (
        <p>Showing records in {filter}.</p>
      )}
      <p>Your financial overview will appear here in later phases.</p>
      <RatesStatus />
      <p>Conversions are reporting-only; original amounts and currencies are never changed.</p>
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
