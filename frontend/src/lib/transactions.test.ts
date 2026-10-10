import { describe, expect, it } from 'vitest'
import {
  EMPTY_TXN_FILTERS,
  EMPTY_TXN_FORM,
  categoriesForType,
  filterTransactions,
  validateTransactionForm,
  type Transaction,
  type TxnCategory,
} from './transactions'

const CATS: TxnCategory[] = [
  { id: 1, name: 'Salary', type: 'income', is_business: false },
  { id: 2, name: 'Food', type: 'expense', is_business: false },
]

const TXNS: Transaction[] = [
  {
    id: 1, account_id: 10, account_name: 'Main', type: 'expense', amount: '30000.00',
    currency: 'NGN', category_id: 2, category_name: 'Food', date: '2026-02-01',
    payment_method: null, note: null,
  },
  {
    id: 2, account_id: 11, account_name: 'Dollar', type: 'income', amount: '500.00',
    currency: 'USD', category_id: 1, category_name: 'Salary', date: '2026-02-05',
    payment_method: null, note: null,
  },
]

describe('transaction categories by type', () => {
  it('shows income categories for income and expense categories for expenses', () => {
    expect(categoriesForType(CATS, 'income').map((c) => c.name)).toEqual(['Salary'])
    expect(categoriesForType(CATS, 'expense').map((c) => c.name)).toEqual(['Food'])
  })
})

describe('transaction form validation', () => {
  it('rejects zero, negative and non-numeric amounts', () => {
    const base = { ...EMPTY_TXN_FORM, account_id: '10', category_id: '2' }
    expect(validateTransactionForm({ ...base, amount: '0' }, 'NGN').amount).toBeTruthy()
    expect(validateTransactionForm({ ...base, amount: '-5' }, 'NGN').amount).toBeTruthy()
    expect(validateTransactionForm({ ...base, amount: 'abc' }, 'NGN').amount).toBeTruthy()
  })

  it('rejects unsupported currencies and missing account/category', () => {
    const base = { ...EMPTY_TXN_FORM, account_id: '10', amount: '50', category_id: '2' }
    expect(validateTransactionForm({ ...base, currency: 'JPY' }, null).currency).toBeTruthy()
    expect(validateTransactionForm({ ...base, account_id: '' }, null).account_id).toBeTruthy()
    expect(validateTransactionForm({ ...base, category_id: '' }, null).category_id).toBeTruthy()
  })

  it('warns when currency differs from the account currency', () => {
    const errs = validateTransactionForm(
      { ...EMPTY_TXN_FORM, account_id: '10', amount: '20', category_id: '2', currency: 'USD' },
      'NGN',
    )
    expect(errs.currency).toContain('NGN')
  })

  it('accepts a valid quick-entry form', () => {
    expect(
      validateTransactionForm(
        { ...EMPTY_TXN_FORM, account_id: '10', amount: '5000', category_id: '2' },
        'NGN',
      ),
    ).toEqual({})
  })
})

describe('transaction filtering', () => {
  it('filters by type', () => {
    expect(filterTransactions(TXNS, { ...EMPTY_TXN_FILTERS, type: 'income' })).toHaveLength(1)
  })

  it('filters by account and currency', () => {
    expect(filterTransactions(TXNS, { ...EMPTY_TXN_FILTERS, account_id: '10' })).toHaveLength(1)
    expect(filterTransactions(TXNS, { ...EMPTY_TXN_FILTERS, currency: 'USD' })).toHaveLength(1)
  })

  it('filters by date range', () => {
    const rows = filterTransactions(
      TXNS,
      { ...EMPTY_TXN_FILTERS, date_from: '2026-02-03', date_to: '2026-02-06' },
    )
    expect(rows.map((t) => t.id)).toEqual([2])
  })
})
