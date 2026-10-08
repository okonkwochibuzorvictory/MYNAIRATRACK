import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import BalanceToggle from './BalanceToggle'

describe('BalanceToggle', () => {
  it('offers to show the balance when hidden', () => {
    const html = renderToString(<BalanceToggle visible={false} onToggle={vi.fn()} />)
    expect(html).toContain('aria-label="Show balance"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('offers to hide the balance when visible', () => {
    const html = renderToString(<BalanceToggle visible={true} onToggle={vi.fn()} />)
    expect(html).toContain('aria-label="Hide balance"')
    expect(html).toContain('aria-pressed="true"')
  })
})
