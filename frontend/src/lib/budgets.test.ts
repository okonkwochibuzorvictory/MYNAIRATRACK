import { describe, expect, it } from 'vitest'
import {
  EMPTY_BUDGET_FORM,
  allocationTotals,
  statusColor,
  validateBudgetForm,
} from './budgets'

describe('budget allocation totals', () => {
  it('computes allocated and remaining live', () => {
    const t = allocationTotals({
      ...EMPTY_BUDGET_FORM,
      amount: '200000',
      allocations: [
        { category_id: '1', allocated_amount: '50000' },
        { category_id: '2', allocated_amount: '30000' },
      ],
    })
    expect(t.allocated).toBe(80000)
    expect(t.remaining).toBe(120000)
  })
})

describe('budget form validation', () => {
  it('rejects blank names, bad amounts and bad ranges', () => {
    expect(validateBudgetForm({ ...EMPTY_BUDGET_FORM, name: '  ' }).name).toBeTruthy()
    expect(validateBudgetForm({ ...EMPTY_BUDGET_FORM, name: 'B', amount: '0' }).amount).toBeTruthy()
    expect(
      validateBudgetForm({ ...EMPTY_BUDGET_FORM, name: 'B', amount: '10', currency: 'JPY' })
        .currency,
    ).toBeTruthy()
    expect(
      validateBudgetForm({
        ...EMPTY_BUDGET_FORM, name: 'B', amount: '10',
        period_start: '2026-10-31', period_end: '2026-10-01',
      }).period_end,
    ).toBeTruthy()
  })

  it('rejects duplicate categories and over-allocation', () => {
    const dup = validateBudgetForm({
      ...EMPTY_BUDGET_FORM, name: 'B', amount: '200000',
      allocations: [
        { category_id: '1', allocated_amount: '50000' },
        { category_id: '1', allocated_amount: '30000' },
      ],
    })
    expect(dup.alloc_1).toContain('already allocated')
    const over = validateBudgetForm({
      ...EMPTY_BUDGET_FORM, name: 'B', amount: '10000',
      allocations: [{ category_id: '1', allocated_amount: '20000' }],
    })
    expect(over.allocations).toContain('exceed')
  })

  it('accepts a valid guided form', () => {
    expect(
      validateBudgetForm({
        name: 'October', amount: '200000', currency: 'NGN',
        period_start: '2026-10-01', period_end: '2026-10-31',
        allocations: [{ category_id: '1', allocated_amount: '50000' }],
      }),
    ).toEqual({})
  })
})

describe('budget status colors', () => {
  it('maps statuses to theme colors', () => {
    expect(statusColor('On Track')).toContain('success')
    expect(statusColor('Near Limit')).toContain('warning')
    expect(statusColor('Over Budget')).toContain('error')
  })
})
