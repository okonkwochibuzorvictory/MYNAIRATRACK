import { describe, expect, it } from 'vitest'
import { EMPTY_GOAL_FORM, statusColor, suggestContribution, suggestMonthlyContribution, validateGoalForm } from './goals'

describe('goal form validation', () => {
  it('rejects blank names and bad targets', () => {
    expect(validateGoalForm({ ...EMPTY_GOAL_FORM, name: '  ' }).name).toBeTruthy()
    expect(
      validateGoalForm({ ...EMPTY_GOAL_FORM, name: 'Car', target_amount: '0' }).target_amount,
    ).toBeTruthy()
    expect(
      validateGoalForm({ ...EMPTY_GOAL_FORM, name: 'Car', target_amount: '-5' }).target_amount,
    ).toBeTruthy()
  })

  it('rejects unsupported currencies and negative progress', () => {
    const base = { ...EMPTY_GOAL_FORM, name: 'Car', target_amount: '1000' }
    expect(validateGoalForm({ ...base, currency: 'JPY' }).currency).toBeTruthy()
    expect(validateGoalForm({ ...base, current_amount: '-1' }).current_amount).toBeTruthy()
  })

  it('accepts a valid form with optional deadline', () => {
    expect(
      validateGoalForm({
        name: 'Car', target_amount: '2000000', currency: 'NGN',
        current_amount: '500000', deadline: '2027-01-01',
      }),
    ).toEqual({})
  })
})

describe('goal status colors', () => {
  it('maps statuses to theme colors', () => {
    expect(statusColor('Completed')).toContain('success')
    expect(statusColor('Overdue')).toContain('error')
    expect(statusColor('In Progress')).toContain('warning')
  })
})

describe('monthly contribution suggestion', () => {
  it('divides the remainder by whole months left', () => {
    // 500,000 remaining, 5 months left.
    const s = suggestMonthlyContribution('1000000', '500000', '2027-06-01', new Date(2027, 0, 15))
    expect(s.kind).toBe('periodic')
    expect(s.amount).toBe('100000.00')
  })

  it('needs no contribution once completed', () => {
    expect(suggestMonthlyContribution('1000', '1000', '2027-06-01').kind).toBe('completed')
    expect(suggestMonthlyContribution('1000', '1500', null).kind).toBe('completed')
  })

  it('asks for a target date when there is none', () => {
    expect(suggestMonthlyContribution('1000', '100', null).kind).toBe('no-deadline')
  })

  it('treats a passed deadline as due now', () => {
    const s = suggestMonthlyContribution('1000', '100', '2020-01-01', new Date(2026, 5, 1))
    expect(s.kind).toBe('periodic')
    expect(s.amount).toBe('900.00')
  })
})

describe('contribution frequencies', () => {
  it('divides by weeks and days as well as months', () => {
    // 700 remaining, 14 days left: 1 month, 2 weeks, 14 days.
    const day = new Date(2027, 0, 1)
    expect(suggestContribution('1000', '300', '2027-01-15', 'monthly', day).amount).toBe('700.00')
    expect(suggestContribution('1000', '300', '2027-01-15', 'weekly', day).amount).toBe('350.00')
    expect(suggestContribution('1000', '300', '2027-01-15', 'daily', day).amount).toBe('50.00')
  })

  it('shares completed and no-deadline handling across frequencies', () => {
    expect(suggestContribution('1000', '1000', '2027-06-01', 'weekly').kind).toBe('completed')
    expect(suggestContribution('1000', '100', null, 'daily').kind).toBe('no-deadline')
  })
})
