export const LOGIN_ROUTE = '#/login'

const PROTECTED = new Set([
  '#/dashboard',
  '#/setup',
  '#/settings',
  '#/accounts',
  '#/transactions',
  '#/categories',
  '#/budgets',
  '#/goals',
  '#/insights',
  '#/business',
])

export function normalizeHash(hash: string): string {
  if (!hash) return '#/'
  const withoutQuery = hash.split('?')[0]
  return withoutQuery || '#/'
}

export function isProtectedRoute(hash: string): boolean {
  return PROTECTED.has(normalizeHash(hash))
}

export function shouldRedirectToLogin(isAuthenticated: boolean, hash: string): boolean {
  return !isAuthenticated && isProtectedRoute(hash)
}
