import { apiFetch } from '../auth/client'

export interface SavingsTarget {
  id: number
  name: string
  target_amount: string
  current_amount: string
  currency: string
  remaining: string
  percent_complete: number
  exceeded_by: string
  status: string
}

export interface Goal extends SavingsTarget {
  deadline: string | null
  suggested_contribution: string | null
}

export interface GoalForm {
  name: string
  target_amount: string
  currency: string
  current_amount: string
  deadline: string
}

export const EMPTY_GOAL_FORM: GoalForm = {
  name: '',
  target_amount: '',
  currency: 'NGN',
  current_amount: '0',
  deadline: '',
}

export function validateGoalForm(form: GoalForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  else if (form.name.trim().length > 128) errors.name = 'Name is too long'
  const target = Number(form.target_amount)
  if (form.target_amount.trim() === '' || !Number.isFinite(target))
    errors.target_amount = 'Enter a valid target amount'
  else if (target <= 0) errors.target_amount = 'Target amount must be greater than zero'
  if (!['NGN', 'USD', 'EUR', 'GBP'].includes(form.currency))
    errors.currency = 'Currency must be one of NGN, USD, EUR, GBP'
  const current = Number(form.current_amount)
  if (form.current_amount.trim() === '' || !Number.isFinite(current))
    errors.current_amount = 'Enter a valid saved amount'
  else if (current < 0) errors.current_amount = 'Saved amount cannot be negative'
  if (form.deadline && Number.isNaN(Date.parse(form.deadline)))
    errors.deadline = 'Enter a valid date'
  return errors
}

export function statusColor(status: string): string {
  if (status === 'Completed') return 'var(--mt-success)'
  if (status === 'Overdue') return 'var(--mt-error)'
  return 'var(--mt-warning)'
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

export async function fetchSavings(): Promise<SavingsTarget[]> {
  return handle(await apiFetch('/savings-targets'))
}

export async function createSavings(form: GoalForm): Promise<SavingsTarget> {
  return handle(
    await apiFetch('/savings-targets', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        target_amount: form.target_amount,
        currency: form.currency,
        current_amount: form.current_amount || '0',
      }),
    }),
  )
}

export async function updateSavings(
  id: number,
  data: { name?: string; target_amount?: string; current_amount?: string },
): Promise<SavingsTarget> {
  return handle(await apiFetch(`/savings-targets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }))
}

export async function deleteSavings(id: number): Promise<void> {
  const res = await apiFetch(`/savings-targets/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await readError(res))
}

export async function fetchGoals(): Promise<Goal[]> {
  return handle(await apiFetch('/goals'))
}

export async function createGoal(form: GoalForm): Promise<Goal> {
  return handle(
    await apiFetch('/goals', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        target_amount: form.target_amount,
        currency: form.currency,
        current_amount: form.current_amount || '0',
        deadline: form.deadline || null,
      }),
    }),
  )
}

export async function updateGoal(
  id: number,
  data: { name?: string; target_amount?: string; current_amount?: string; deadline?: string | null },
): Promise<Goal> {
  return handle(await apiFetch(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }))
}

export async function deleteGoal(id: number): Promise<void> {
  const res = await apiFetch(`/goals/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await readError(res))
}
