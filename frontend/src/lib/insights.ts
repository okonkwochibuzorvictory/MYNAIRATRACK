import { apiFetch } from '../auth/client'

export interface CategoryInsight {
  category_id: number | null
  category_name: string
  current: string
  previous: string
  difference: string
  percent_change: number | null
  note: string
}

export interface BudgetUsage {
  budget_id: number
  budget_name: string
  spent: string
  amount: string
  percent_used: number
}

export interface InsightsSummary {
  currency: string
  period: { start: string; end: string }
  previous_period: { start: string; end: string }
  by_category: CategoryInsight[]
  budgets: BudgetUsage[]
}

export interface AlertItem {
  id: number
  budget_id: number | null
  budget_name: string | null
  type: string
  message: string
  is_read: boolean
  created_at: string | null
}

export interface Prefs {
  alert_50: boolean
  alert_80: boolean
  alert_100: boolean
  alert_over: boolean
  alerts_enabled: boolean
  budget_id: number | null
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

export async function fetchSummary(
  currency: string,
  period_start: string,
  period_end: string,
): Promise<InsightsSummary> {
  const params = new URLSearchParams({ currency, period_start, period_end })
  return handle(await apiFetch(`/insights/summary?${params.toString()}`))
}

export async function fetchAlerts(): Promise<AlertItem[]> {
  return handle(await apiFetch('/alerts'))
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await handle<{ unread: number }>(await apiFetch('/alerts/unread-count'))
  return res.unread
}

export async function markAlertRead(id: number): Promise<AlertItem> {
  return handle(await apiFetch(`/alerts/${id}/read`, { method: 'PATCH' }))
}

export async function fetchPreferences(): Promise<{ master: Prefs; budgets: Prefs[] }> {
  return handle(await apiFetch('/alert-preferences'))
}

export async function updateMasterPrefs(data: Partial<Prefs>): Promise<{ master: Prefs }> {
  return handle(
    await apiFetch('/alert-preferences', { method: 'PATCH', body: JSON.stringify(data) }),
  )
}

export async function updateBudgetPrefs(budgetId: number, data: Partial<Prefs>): Promise<Prefs> {
  return handle(
    await apiFetch(`/alert-preferences/budgets/${budgetId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  )
}

export function alertLabel(type: string): string {
  if (type === 'threshold_50') return '50% reached'
  if (type === 'threshold_80') return '80% reached'
  if (type === 'threshold_100') return '100% reached'
  if (type === 'threshold_over') return 'Over budget'
  return type
}
