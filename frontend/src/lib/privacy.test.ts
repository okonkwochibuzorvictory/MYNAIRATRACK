import { describe, expect, it } from 'vitest'
import { BALANCE_MASK, DEFAULT_BALANCE_VISIBLE, displayBalance } from './privacy'

describe('balance privacy', () => {
  it('hides the balance by default', () => {
    expect(DEFAULT_BALANCE_VISIBLE).toBe(false)
  })

  it('shows a privacy placeholder when hidden', () => {
    expect(displayBalance('₦100,000.00 NGN', false)).toBe(BALANCE_MASK)
    expect(displayBalance('₦100,000.00 NGN', false)).toContain('•')
  })

  it('reveals the actual balance when visible', () => {
    expect(displayBalance('₦100,000.00 NGN', true)).toBe('₦100,000.00 NGN')
  })

  it('never alters the underlying balance text', () => {
    const actual = '$500.00 USD'
    expect(displayBalance(actual, true)).toBe(actual)
  })
})
