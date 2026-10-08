import { apiFetch } from '../auth/client'

export const ACCOUNT_TYPES = ['Bank Account', 'Cash', 'Mobile Money', 'Savings', 'Other'] as const

export interface Account {
  id: number
  name: string
  currency: string
  account_type: string
  is_business: boolean
  opening_balance: string
  balance: string
}

export interface AccountForm {
  name: string
  currency: string
  account_type: string
  is_business: boolean
  opening_balance: string
}

export const EMPTY_ACCOUNT_FORM: AccountForm = {
  name: '',
  currency: 'NGN',
  account_type: 'Other',
  is_business: false,
  opening_balance: '0',
}

export function validateAccountForm(form: AccountForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Account name is required'
  else if (form.name.trim().length > 128) errors.name = 'Account name is too long'
  if (!['NGN', 'USD', 'EUR', 'GBP'].includes(form.currency))
    errors.currency = 'Currency must be one of NGN, USD, EUR, GBP'
  if (!(ACCOUNT_TYPES as readonly string[]).includes(form.account_type))
    errors.account_type = 'Choose a valid account type'
  const amount = Number(form.opening_balance)
  if (form.opening_balance.trim() === '' || !Number.isFinite(amount))
    errors.opening_balance = 'Enter a valid opening balance'
  else if (amount < 0) errors.opening_balance = 'Opening balance must be non-negative'
  return errors
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    return `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export async function fetchAccounts(): Promise<Account[]> {
  const res = await apiFetch('/accounts')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Account[]
}

export async function createAccount(form: AccountForm): Promise<Account> {
  const res = await apiFetch('/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: form.name.trim(),
      currency: form.currency,
      account_type: form.account_type,
      is_business: form.is_business,
      opening_balance: form.opening_balance,
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Account
}

export async function updateAccount(
  id: number,
  data: { name?: string; account_type?: string; is_business?: boolean; opening_balance?: string },
): Promise<Account> {
  const res = await apiFetch(`/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Account
}

export async function deleteAccount(id: number): Promise<void> {
  const res = await apiFetch(`/accounts/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await readError(res))
}
