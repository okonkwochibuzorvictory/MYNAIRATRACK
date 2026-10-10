import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PasswordInput from './PasswordInput'

describe('PasswordInput', () => {
  it('masks the password by default with a show option', () => {
    const html = renderToString(
      <PasswordInput id="pw" label="Password" value="" onChange={vi.fn()} required />,
    )
    expect(html).toContain('type="password"')
    expect(html).toContain('aria-label="Show password"')
    expect(html).toContain('Show')
  })
})
