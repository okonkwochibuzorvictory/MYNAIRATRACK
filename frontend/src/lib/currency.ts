import { apiFetch } from '../auth/client'

export const MVP_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP'] as const
export type MvpCurrency = (typeof MVP_CURRENCIES)[number]
export const ALL_CURRENCIES_VALUE = 'ALL'

export const CURRENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'NGN', label: 'NGN' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: ALL_CURRENCIES_VALUE, label: 'All Currencies' },
]

export const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

export function isSupportedCurrency(code: string): boolean {
  return (MVP_CURRENCIES as readonly string[]).includes(code)
}

export function formatOriginal(amount: string | number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? ''
  const num = typeof amount === 'string' ? Number(amount) : amount
  const formatted = Number.isFinite(num)
    ? num.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : String(amount)
  return `${symbol}${formatted} ${currency}`.trim()
}

export interface RateInfo {
  cached: boolean
  fetched_at: string | null
  provider: string | null
}

export function getRateLabel(info: RateInfo): string {
  if (!info.fetched_at) return 'no cached rate yet'
  const when = new Date(info.fetched_at).toLocaleString()
  const source = info.provider ? ` · source ${info.provider}` : ''
  if (info.cached) return `cached rate · updated ${when}${source}`
  return `rate updated ${when}${source}`
}

export interface CurrencyItem {
  code: string
  name: string
  symbol: string
}

export interface RatesStatus {
  base: string
  count: number
  rates: Array<{
    from_currency: string
    to_currency: string
    rate: string
    provider: string
    fetched_at: string
  }>
  last_updated: string | null
  providers: string[]
}

export interface ConvertResult {
  from_currency: string
  to_currency: string
  amount: string
  converted_amount: string | null
  rate: string | null
  provider: string | null
  fetched_at: string | null
  available: boolean
  cached: boolean
  message?: string
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

export async function fetchCurrencies(): Promise<CurrencyItem[]> {
  const res = await apiFetch('/currencies')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as CurrencyItem[]
}

export async function fetchRatesStatus(): Promise<RatesStatus> {
  const res = await apiFetch('/exchange-rates/status')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as RatesStatus
}

export async function refreshRates(): Promise<RatesStatus & { cached: boolean; ok: boolean }> {
  const res = await apiFetch('/exchange-rates/refresh', { method: 'POST' })
  if (!res.ok) throw new Error(await readError(res))
  const data = await res.json()
  if (Array.isArray(data?.rates)) return data as RatesStatus & { cached: boolean; ok: boolean }
  // Fresh-refresh shape has no rates array; re-read status for display.
  const status = await fetchRatesStatus()
  return { ...status, cached: Boolean(data?.cached), ok: Boolean(data?.ok) }
}

export async function convertAmount(
  from_currency: string,
  to_currency: string,
  amount: string,
): Promise<ConvertResult> {
  const params = new URLSearchParams({ from_currency, to_currency, amount })
  const res = await apiFetch(`/exchange-rates/convert?${params.toString()}`)
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as ConvertResult
}
