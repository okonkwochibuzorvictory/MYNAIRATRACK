import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TransactionForm from './TransactionForm'
import type { Account } from '../lib/accounts'
import { categoriesForScope, categoriesForType, type TxnCategory } from '../lib/transactions'

const ACCOUNTS: Account[] = [
  {
    id: 10, name: 'Main', currency: 'NGN', account_type: 'Bank Account',
    is_business: false, opening_balance: '0', balance: '0',
  },
]

const CATS: TxnCategory[] = [
  { id: 1, name: 'Salary', type: 'income', is_business: false },
  { id: 2, name: 'Food', type: 'expense', is_business: false },
]

describe('TransactionForm', () => {
  it('renders quick-entry fields and an expandable details section', () => {
    const html = renderToString(
      <TransactionForm
        accounts={ACCOUNTS}
        categories={CATS}
        initial={null}
        defaultCurrency="NGN"
        business={false}
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
        business={false}
        busy={false}
        serverError=""
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(html).toContain('Food')
    expect(html).not.toContain('Salary')
  })

  it('shows business categories in business mode and personal ones otherwise', () => {
    const mixed = [
      ...CATS,
      { id: 3, name: 'Cost of Goods Sold', type: 'expense', is_business: true },
      { id: 4, name: 'Sales of Goods', type: 'income', is_business: true },
    ]
    const personal = renderToString(
      <TransactionForm
        accounts={ACCOUNTS}
        categories={mixed}
        initial={null}
        defaultCurrency="NGN"
        business={false}
        busy={false}
        serverError=""
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(personal).toContain('Food')
    expect(personal).not.toContain('Cost of Goods Sold')
    const business = renderToString(
      <TransactionForm
        accounts={ACCOUNTS}
        categories={mixed}
        initial={null}
        defaultCurrency="NGN"
        business={true}
        busy={false}
        serverError=""
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(business).toContain('Cost of Goods Sold')
    expect(business).not.toContain('Food')
  })

  it('offers business income categories when recording business income', () => {
    const mixed = [
      ...CATS,
      { id: 3, name: 'Cost of Goods Sold', type: 'expense', is_business: true },
      { id: 4, name: 'Sales of Goods', type: 'income', is_business: true },
    ]
    const scoped = categoriesForScope(
      categoriesForType(mixed, 'income'),
      true,
    )
    expect(scoped.map((c) => c.name)).toEqual(['Sales of Goods'])
    expect(
      categoriesForScope(categoriesForType(mixed, 'income'), false).map((c) => c.name),
    ).toEqual(['Salary'])
  })
})
