import { apiFetch } from '../auth/client'

export interface Allocation {
  id: number
  category_id: number
  category_name: string | null
  allocated_amount: string
  spent: string
  remaining: string
  percent_used: number
  status: string
}

export interface Budget {
  id: number
  name: string
  amount: string
  currency: string
  period_start: string
  period_end: string
  is_business: boolean
  total_allocated?: string
  total_spent: string
  remaining: string
  percent_used: number
  status: string
  unallocated_spending?: string
  allocations?: Allocation[]
}

export interface AllocationDraft {
  category_id: string
  allocated_amount: string
}

export interface BudgetForm {
  name: string
  amount: string
  currency: string
  period_start: string
  period_end: string
  is_business?: boolean
  allocations: AllocationDraft[]
}

export const EMPTY_BUDGET_FORM: BudgetForm = {
  name: '',
  amount: '',
  currency: 'NGN',
  period_start: new Date().toISOString().slice(0, 10),
  period_end: new Date().toISOString().slice(0, 10),
  is_business: false,
  allocations: [],
}

export function allocationTotals(form: BudgetForm): { allocated: number; remaining: number } {
  const allocated = form.allocations.reduce(
    (s, a) => s + (Number(a.allocated_amount) || 0),
    0,
  )
  return { allocated, remaining: (Number(form.amount) || 0) - allocated }
}

export function validateBudgetForm(form: BudgetForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Budget name is required'
  const amount = Number(form.amount)
  if (form.amount.trim() === '' || !Number.isFinite(amount))
    errors.amount = 'Enter a valid budget amount'
  else if (amount <= 0) errors.amount = 'Budget amount must be greater than zero'
  if (!['NGN', 'USD', 'EUR', 'GBP'].includes(form.currency))
    errors.currency = 'Currency must be one of NGN, USD, EUR, GBP'
  if (!form.period_start) errors.period_start = 'Choose a start date'
  if (!form.period_end) errors.period_end = 'Choose an end date'
  if (form.period_start && form.period_end && form.period_end < form.period_start)
    errors.period_end = 'End date cannot be before start date'
  const seen = new Set<string>()
  form.allocations.forEach((a, i) => {
    if (!a.category_id) errors[`alloc_${i}`] = 'Choose a category'
    else if (seen.has(a.category_id)) errors[`alloc_${i}`] = 'Category already allocated'
    else seen.add(a.category_id)
    const v = Number(a.allocated_amount)
    if (a.allocated_amount.trim() === '' || !Number.isFinite(v) || v <= 0)
      errors[`alloc_${i}`] = 'Allocation must be greater than zero'
  })
  const { remaining } = allocationTotals(form)
  if (Number.isFinite(Number(form.amount)) && remaining < 0)
    errors.allocations = 'Allocations exceed the budget amount'
  return errors
}

export function statusColor(status: string): string {
  if (status === 'Over Budget') return 'var(--mt-error)'
  if (status === 'Near Limit') return 'var(--mt-warning)'
  return 'var(--mt-success)'
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

export async function fetchBudgets(business = false): Promise<Budget[]> {
  const params = business ? '?business=true' : ''
  const res = await apiFetch(`/budgets${params}`)
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Budget[]
}

export async function fetchBudget(id: number): Promise<Budget> {
  const res = await apiFetch(`/budgets/${id}`)
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Budget
}

export async function createBudget(form: BudgetForm): Promise<Budget> {
  const res = await apiFetch('/budgets', {
    method: 'POST',
    body: JSON.stringify({
      name: form.name.trim(),
      amount: form.amount,
      currency: form.currency,
      period_start: form.period_start,
      period_end: form.period_end,
      is_business: form.is_business,
      allocations: form.allocations.map((a) => ({
        category_id: Number(a.category_id),
        allocated_amount: a.allocated_amount,
      })),
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Budget
}

export async function updateBudget(
  id: number,
  data: { name?: string; amount?: string; currency?: string; period_start?: string; period_end?: string },
): Promise<Budget> {
  const res = await apiFetch(`/budgets/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Budget
}

export async function deleteBudget(id: number): Promise<void> {
  const res = await apiFetch(`/budgets/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await readError(res))
}

export async function addAllocation(
  budgetId: number,
  category_id: number,
  allocated_amount: string,
): Promise<void> {
  const res = await apiFetch(`/budgets/${budgetId}/allocations`, {
    method: 'POST',
    body: JSON.stringify({ category_id, allocated_amount }),
  })
  if (!res.ok) throw new Error(await readError(res))
}

export async function removeAllocation(budgetId: number, allocationId: number): Promise<void> {
  const res = await apiFetch(`/budgets/${budgetId}/allocations/${allocationId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await readError(res))
}
