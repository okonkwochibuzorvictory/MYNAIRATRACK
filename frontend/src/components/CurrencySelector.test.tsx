import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CurrencySelector from './CurrencySelector'

describe('CurrencySelector', () => {
  it('renders NGN/USD/EUR/GBP plus All Currencies', () => {
    const html = renderToString(<CurrencySelector value="NGN" onChange={vi.fn()} />)
    for (const code of ['NGN', 'USD', 'EUR', 'GBP', 'All Currencies']) {
      expect(html).toContain(code)
    }
  })

  it('marks the selected currency', () => {
    const html = renderToString(<CurrencySelector value="USD" onChange={vi.fn()} />)
    expect(html).toContain('value="USD"')
  })
})
