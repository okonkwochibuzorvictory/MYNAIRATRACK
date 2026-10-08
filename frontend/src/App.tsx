import RequireAuth from './auth/RequireAuth'
import { useHashRoute } from './auth/guard'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Placeholder from './pages/Placeholder'
import Settings from './pages/Settings'
import Setup from './pages/Setup'
import Signup from './pages/Signup'

const PLACEHOLDERS = new Set([
  '#/accounts',
  '#/transactions',
  '#/budgets',
  '#/goals',
  '#/insights',
  '#/business',
])

export default function App() {
  const hash = useHashRoute()
  const route = (hash || '#/').split('?')[0]

  if (route === '#/signup') return <Signup />
  if (route === '#/login') return <Login />
  if (route === '#/setup')
    return (
      <RequireAuth>
        <Setup />
      </RequireAuth>
    )
  if (route === '#/settings')
    return (
      <RequireAuth>
        <Settings />
      </RequireAuth>
    )
  if (route === '#/dashboard')
    return (
      <RequireAuth>
        <Dashboard />
      </RequireAuth>
    )
  if (PLACEHOLDERS.has(route))
    return (
      <RequireAuth>
        <Placeholder page={route.slice(2)} />
      </RequireAuth>
    )
  return <Landing />
}
