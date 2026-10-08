import { describe, expect, it } from 'vitest'
import {
  ALL_CURRENCIES_VALUE,
  CURRENCY_OPTIONS,
  formatOriginal,
  getRateLabel,
  isSupportedCurrency,
} from './currency'

describe('currency lib', () => {
  it('supports only the four MVP currencies', () => {
    expect(isSupportedCurrency('NGN')).toBe(true)
    expect(isSupportedCurrency('USD')).toBe(true)
    expect(isSupportedCurrency('EUR')).toBe(true)
    expect(isSupportedCurrency('GBP')).toBe(true)
    expect(isSupportedCurrency('JPY')).toBe(false)
    expect(isSupportedCurrency(ALL_CURRENCIES_VALUE)).toBe(false)
  })

  it('selector offers four currencies plus All Currencies', () => {
    expect(CURRENCY_OPTIONS.map((o) => o.value)).toEqual(['NGN', 'USD', 'EUR', 'GBP', 'ALL'])
  })

  it('preserves original amount and currency in formatting', () => {
    expect(formatOriginal('500000', 'NGN')).toContain('NGN')
    expect(formatOriginal('500', 'USD')).toContain('USD')
  })

  it('renders a cached-rate label with last-update time', () => {
    const label = getRateLabel({
      cached: true,
      fetched_at: '2026-01-02T12:00:00+00:00',
      provider: 'open-er-api',
    })
    expect(label).toContain('cached rate')
    expect(label).toContain('open-er-api')
  })

  it('reports no rate when nothing is cached', () => {
    expect(getRateLabel({ cached: false, fetched_at: null, provider: null })).toContain(
      'no cached rate',
    )
  })
})
