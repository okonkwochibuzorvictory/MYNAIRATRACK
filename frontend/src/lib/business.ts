import { apiFetch } from '../auth/client'

export interface CurrencyProfit {
  currency: string
  sales: string
  income: string
  expenses: string
  profit: string
}

export interface AccountProfit extends CurrencyProfit {
  account_id: number
  account_name: string
}

export interface BusinessBudget {
  id: number
  name: string
  amount: string
  currency: string
  period_start: string
  period_end: string
  total_spent: string
  remaining: string
  percent_used: number
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

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as T
}

export async function fetchBusinessStatus(): Promise<boolean> {
  const res = await handle<{ active: boolean }>(await apiFetch('/business/status'))
  return res.active
}

export async function activateBusiness(): Promise<void> {
  await handle(await apiFetch('/business/activate', { method: 'POST' }))
}

export async function deactivateBusiness(): Promise<void> {
  await handle(await apiFetch('/business/deactivate', { method: 'POST' }))
}

export async function fetchProfit(currency?: string): Promise<{
  per_currency: CurrencyProfit[]
  accounts: AccountProfit[]
}> {
  const params = currency ? `?currency=${currency}` : ''
  return handle<{ per_currency: CurrencyProfit[]; accounts: AccountProfit[] }>(
    await apiFetch(`/business/summary${params}`),
  )
}

export async function fetchBusinessBudgets(): Promise<BusinessBudget[]> {
  return handle(await apiFetch('/business/budgets'))
}

export function totalProfit(rows: CurrencyProfit[]): { perCurrency: CurrencyProfit[] } {
  return { perCurrency: rows }
}
