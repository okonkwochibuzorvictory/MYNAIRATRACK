import { apiFetch } from '../auth/client'

export const TXN_TYPES = ['income', 'expense'] as const
export type TxnType = (typeof TXN_TYPES)[number]

export interface TxnCategory {
  id: number
  name: string
  type: string
  is_business: boolean
}

export interface Transaction {
  id: number
  account_id: number
  account_name: string | null
  type: string
  amount: string
  currency: string
  category_id: number | null
  category_name: string | null
  date: string
  payment_method: string | null
  note: string | null
}

export interface TransactionForm {
  type: string
  account_id: string
  amount: string
  currency: string
  category_id: string
  date: string
  payment_method: string
  note: string
  business_override: boolean
}

export const EMPTY_TXN_FORM: TransactionForm = {
  type: 'expense',
  account_id: '',
  amount: '',
  currency: 'NGN',
  category_id: '',
  date: new Date().toISOString().slice(0, 10),
  payment_method: '',
  note: '',
  business_override: false,
}

export function categoriesForType(categories: TxnCategory[], type: string): TxnCategory[] {
  return categories.filter((c) => c.type === type)
}

export function categoriesForScope(categories: TxnCategory[], business: boolean): TxnCategory[] {
  return categories.filter((c) => (c.is_business ?? false) === business)
}

export function validateTransactionForm(
  form: TransactionForm,
  accountCurrency: string | null,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (form.type !== 'income' && form.type !== 'expense' && form.type !== 'sale')
    errors.type = 'Choose income, expense, or sale'
  if (!form.account_id) errors.account_id = 'Choose an account'
  const amount = Number(form.amount)
  if (form.amount.trim() === '' || !Number.isFinite(amount))
    errors.amount = 'Enter a valid amount'
  else if (amount <= 0) errors.amount = 'Amount must be greater than zero'
  if (!['NGN', 'USD', 'EUR', 'GBP'].includes(form.currency))
    errors.currency = 'Currency must be one of NGN, USD, EUR, GBP'
  else if (accountCurrency !== null && form.currency !== accountCurrency)
    errors.currency =
      `Currency differs from the account currency (${accountCurrency}). ` +
      'The original transaction currency will be preserved as entered.'
  if (!form.category_id) errors.category_id = 'Choose a category'
  if (!form.date) errors.date = 'Choose a date'
  else if (Number.isNaN(Date.parse(form.date))) errors.date = 'Enter a valid date'
  if (form.payment_method.trim().length > 64) errors.payment_method = 'Payment method is too long'
  if (form.note.length > 2000) errors.note = 'Note is too long'
  return errors
}

export interface TxnFilters {
  type: string
  account_id: string
  currency: string
  date_from: string
  date_to: string
}

export const EMPTY_TXN_FILTERS: TxnFilters = {
  type: 'all',
  account_id: 'all',
  currency: 'all',
  date_from: '',
  date_to: '',
}

export function filterTransactions(list: Transaction[], filters: TxnFilters): Transaction[] {
  return list.filter((t) => {
    if (filters.type !== 'all' && t.type !== filters.type) return false
    if (filters.account_id !== 'all' && String(t.account_id) !== filters.account_id)
      return false
    if (filters.currency !== 'all' && t.currency !== filters.currency) return false
    if (filters.date_from && t.date < filters.date_from) return false
    if (filters.date_to && t.date > filters.date_to) return false
    return true
  })
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

export async function fetchTransactions(params?: Record<string, string>): Promise<Transaction[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : ''
  const res = await apiFetch(`/transactions${query}`)
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Transaction[]
}

export async function fetchCategories(): Promise<TxnCategory[]> {
  const res = await apiFetch('/categories')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as TxnCategory[]
}

export async function createTransaction(form: TransactionForm): Promise<Transaction> {
  const res = await apiFetch('/transactions', {
    method: 'POST',
    body: JSON.stringify({
      account_id: Number(form.account_id),
      type: form.type,
      amount: form.amount,
      currency: form.currency,
      category_id: form.category_id ? Number(form.category_id) : null,
      date: form.date,
      payment_method: form.payment_method.trim() || null,
      note: form.note.trim() || null,
      is_business: form.business_override ? true : undefined,
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Transaction
}

export async function updateTransaction(
  id: number,
  data: Partial<{
    account_id: number
    type: string
    amount: string
    currency: string
    category_id: number | null
    date: string
    payment_method: string | null
    note: string | null
  }>,
): Promise<Transaction> {
  const res = await apiFetch(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Transaction
}

export async function deleteTransaction(id: number): Promise<void> {
  const res = await apiFetch(`/transactions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await readError(res))
}
