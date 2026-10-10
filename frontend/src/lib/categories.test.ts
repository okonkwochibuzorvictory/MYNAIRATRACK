import { describe, expect, it } from 'vitest'
import { splitByType, validateCategoryForm, type Category } from './categories'

const CATS: Category[] = [
  { id: 1, name: 'Food', type: 'expense', is_default: true, is_business: false },
  { id: 2, name: 'Salary', type: 'income', is_default: true, is_business: false },
  { id: 3, name: 'Airtime', type: 'expense', is_default: false, is_business: false },
]

describe('category splitting', () => {
  it('separates expense and income categories', () => {
    const { income, expense } = splitByType(CATS)
    expect(expense.map((c) => c.name).sort()).toEqual(['Airtime', 'Food'])
    expect(income.map((c) => c.name)).toEqual(['Salary'])
  })
})

describe('category form validation', () => {
  it('rejects blank and overlong names', () => {
    expect(validateCategoryForm({ name: '   ', type: 'expense' }).name).toBeTruthy()
    expect(validateCategoryForm({ name: 'x'.repeat(129), type: 'expense' }).name).toBeTruthy()
  })

  it('rejects unknown types', () => {
    expect(validateCategoryForm({ name: 'Airtime', type: 'bogus' }).type).toBeTruthy()
  })

  it('accepts a valid form', () => {
    expect(validateCategoryForm({ name: 'Airtime', type: 'expense' })).toEqual({})
  })
})
