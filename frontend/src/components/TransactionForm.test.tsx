import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TransactionForm from './TransactionForm'
import type { Account } from '../lib/accounts'
import type { TxnCategory } from '../lib/transactions'

const ACCOUNTS: Account[] = [
  {
    id: 10, name: 'Main', currency: 'NGN', account_type: 'Bank Account',
    is_business: false, opening_balance: '0', balance: '0',
  },
]

const CATS: TxnCategory[] = [
  { id: 1, name: 'Salary', type: 'income' },
  { id: 2, name: 'Food', type: 'expense' },
]

describe('TransactionForm', () => {
  it('renders quick-entry fields and an expandable details section', () => {
    const html = renderToString(
      <TransactionForm
        accounts={ACCOUNTS}
        categories={CATS}
        initial={null}
        defaultCurrency="NGN"
        busy={false}
        serverError=""
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(html).toContain('Income')
    expect(html).toContain('Expense')
    expect(html).toContain('Amount')
    expect(html).toContain('Account')
    expect(html).toContain('Category')
    expect(html).toContain('More details')
  })

  it('shows only expense categories when expense is selected by default', () => {
    const html = renderToString(
      <TransactionForm
        accounts={ACCOUNTS}
        categories={CATS}
        initial={null}
        defaultCurrency="NGN"
        busy={false}
        serverError=""
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(html).toContain('Food')
    expect(html).not.toContain('Salary')
  })
})
