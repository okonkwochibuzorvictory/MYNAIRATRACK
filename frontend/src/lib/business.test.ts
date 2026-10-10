import { describe, expect, it } from 'vitest'
import { totalProfit, type CurrencyProfit } from './business'

describe('business profit', () => {
  it('keeps profit separated per currency', () => {
    const rows: CurrencyProfit[] = [
      { currency: 'USD', sales: '500.00', income: '0.00', expenses: '20.00', profit: '480.00' },
      { currency: 'NGN', sales: '0.00', income: '300000.00', expenses: '30000.00', profit: '270000.00' },
    ]
    const { perCurrency } = totalProfit(rows)
    expect(perCurrency).toHaveLength(2)
    expect(perCurrency.find((r) => r.currency === 'USD')?.profit).toBe('480.00')
    expect(perCurrency.find((r) => r.currency === 'NGN')?.profit).toBe('270000.00')
  })
})
