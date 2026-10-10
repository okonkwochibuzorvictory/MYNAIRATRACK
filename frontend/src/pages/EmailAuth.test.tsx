import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Verify from './Verify'
import { ForgotPassword, ResetPassword } from './PasswordReset'

describe('email auth pages', () => {
  it('verify page renders a working state', () => {
    const html = renderToString(<Verify />)
    expect(html).toContain('Verifying')
  })

  it('forgot password page asks for email', () => {
    const html = renderToString(<ForgotPassword />)
    expect(html).toContain('Forgot password')
    expect(html).toContain('Send reset link')
  })

  it('reset page asks for a new password', () => {
    const html = renderToString(<ResetPassword />)
    expect(html).toContain('Set a new password')
    expect(html).toContain('Reset password')
  })
})
