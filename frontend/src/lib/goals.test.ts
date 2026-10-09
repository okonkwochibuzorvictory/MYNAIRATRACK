import { describe, expect, it } from 'vitest'
import { EMPTY_GOAL_FORM, statusColor, validateGoalForm } from './goals'

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
