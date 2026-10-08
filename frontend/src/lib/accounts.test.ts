import { describe, expect, it } from 'vitest'
import { EMPTY_ACCOUNT_FORM, validateAccountForm } from './accounts'

describe('account form validation', () => {
  it('rejects a blank name', () => {
    expect(validateAccountForm({ ...EMPTY_ACCOUNT_FORM, name: '   ' }).name).toBeTruthy()
  })

  it('rejects unsupported currencies', () => {
    expect(
      validateAccountForm({ ...EMPTY_ACCOUNT_FORM, name: 'Main', currency: 'JPY' }).currency,
    ).toBeTruthy()
  })

  it('rejects unknown account types', () => {
    expect(
      validateAccountForm({ ...EMPTY_ACCOUNT_FORM, name: 'Main', account_type: 'Crypto' })
        .account_type,
    ).toBeTruthy()
  })

  it('rejects negative and non-numeric balances', () => {
    expect(
      validateAccountForm({ ...EMPTY_ACCOUNT_FORM, name: 'Main', opening_balance: '-5' })
        .opening_balance,
    ).toBeTruthy()
    expect(
      validateAccountForm({ ...EMPTY_ACCOUNT_FORM, name: 'Main', opening_balance: 'abc' })
        .opening_balance,
    ).toBeTruthy()
  })

  it('accepts a valid form', () => {
    expect(
      validateAccountForm({
        name: 'Main Bank',
        currency: 'NGN',
        account_type: 'Bank Account',
        is_business: false,
        opening_balance: '5000',
      }),
    ).toEqual({})
  })
})
