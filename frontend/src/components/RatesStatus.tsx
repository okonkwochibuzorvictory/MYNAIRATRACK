import { useEffect, useState } from 'react'
import { fetchRatesStatus, getRateLabel, type RatesStatus } from '../lib/currency'

export default function RatesStatus() {
  const [status, setStatus] = useState<RatesStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchRatesStatus().then(setStatus).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load rates')
    })
  }, [])

  if (error) return <p className="mt-error">{error}</p>
  if (!status) return <p className="mt-stat-sub">Loading exchange rates…</p>
  if (status.count === 0) return <p className="mt-stat-sub">conversion unavailable — no cached rates yet.</p>

  const label = getRateLabel({
    cached: true,
    fetched_at: status.last_updated,
    provider: status.providers[0] ?? null,
  })

  return (
    <section aria-label="Exchange rates">
      <p className="mt-stat-sub">
        {label} ({status.count} cached pairs, base {status.base})
      </p>
      <ul className="mt-rates-list">
        {status.rates.slice(0, 6).map((r) => (
          <li key={`${r.from_currency}-${r.to_currency}`}>
            1 {r.from_currency} = {r.rate} {r.to_currency}
          </li>
        ))}
      </ul>
    </section>
  )
}
