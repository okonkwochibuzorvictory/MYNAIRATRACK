import { describe, expect, it } from 'vitest'
import { isProtectedRoute, normalizeHash, shouldRedirectToLogin } from './routes'

describe('auth route guard', () => {
  it('marks dashboard/setup/settings as protected', () => {
    expect(isProtectedRoute('#/dashboard')).toBe(true)
    expect(isProtectedRoute('#/setup')).toBe(true)
    expect(isProtectedRoute('#/settings')).toBe(true)
  })

  it('leaves landing/login/signup public', () => {
    expect(isProtectedRoute('#/')).toBe(false)
    expect(isProtectedRoute('#/login')).toBe(false)
    expect(isProtectedRoute('#/signup')).toBe(false)
  })

  it('redirects unauthenticated users on protected routes to login', () => {
    expect(shouldRedirectToLogin(false, '#/dashboard')).toBe(true)
    expect(shouldRedirectToLogin(false, '#/settings')).toBe(true)
    expect(shouldRedirectToLogin(true, '#/dashboard')).toBe(false)
    expect(shouldRedirectToLogin(false, '#/login')).toBe(false)
  })

  it('normalizes empty and query hashes', () => {
    expect(normalizeHash('')).toBe('#/')
    expect(normalizeHash('#/dashboard?x=1')).toBe('#/dashboard')
  })
})
