import { useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import AlertPrefs from '../components/AlertPrefs'
import { Card, EmptyState, SectionHead } from '../components/ui'
import { formatOriginal } from '../lib/currency'
import {
  alertLabel,
  fetchAlerts,
  fetchSummary,
  markAlertRead,
  type AlertItem,
  type InsightsSummary,
} from '../lib/insights'

function monthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

export default function Insights() {
  const [currency, setCurrency] = useState('NGN')
  const [range, setRange] = useState(monthRange)
  const [summary, setSummary] = useState<InsightsSummary | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function reload(cur: string, start: string, end: string) {
    setLoading(true)
    setError('')
    try {
      const [s, a] = await Promise.all([
        fetchSummary(cur, start, end),
        fetchAlerts(),
      ])
      setSummary(s)
      setAlerts(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load insights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload(currency, range.start, range.end).catch(() => {
      window.location.hash = '#/login'
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyFilters() {
    reload(currency, range.start, range.end)
  }

  async function onMarkRead(alert: AlertItem) {
    try {
      const updated = await markAlertRead(alert.id)
      setAlerts((list) => (list ?? []).map((a) => (a.id === alert.id ? updated : a)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update alert')
    }
  }

  const unread = (alerts ?? []).filter((a) => !a.is_read)

  return (
    <AppShell
      active="insights"
      title="Insights"
      subtitle="Understand your spending — totals, budget usage, and changes over time."
    >
      <SectionHead
        title="Spending overview"
        action={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              className="mt-select"
              style={{ width: 'auto', display: 'inline-block' }}
              value={currency}
              aria-label="Insight currency"
              onChange={(e) => setCurrency(e.target.value)}
            >
              {['NGN', 'USD', 'EUR', 'GBP'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className="mt-input"
              style={{ width: 'auto', display: 'inline-block' }}
              type="date"
              aria-label="Period start"
              value={range.start}
              onChange={(e) => setRange({ ...range, start: e.target.value })}
            />
            <input
              className="mt-input"
              style={{ width: 'auto', display: 'inline-block' }}
              type="date"
              aria-label="Period end"
              value={range.end}
              onChange={(e) => setRange({ ...range, end: e.target.value })}
            />
            <button type="button" className="mt-btn" style={{ width: 'auto' }} onClick={applyFilters}>
              Apply
            </button>
          </span>
        }
      />
      {error && <p className="mt-error">{error}</p>}
      {loading ? (
        <p className="mt-loading">Loading insights…</p>
      ) : summary && summary.by_category.length === 0 ? (
        <Card>
          <EmptyState
            icon="◍"
            title="No spending in this view"
            text={`No ${currency} expenses in this period. Record expenses or try another currency or period.`}
          />
        </Card>
      ) : (
        summary && (
          <>
            <p className="mt-stat-sub">
              {summary.period.start} → {summary.period.end} · compared with{' '}
              {summary.previous_period.start} → {summary.previous_period.end} · {currency} only.
            </p>
            <div className="mt-grid-2">
              {summary.by_category.map((c) => (
                <Card key={c.category_id ?? 'none'}>
                  <p className="mt-card-label">{c.category_name}</p>
                  <p className="mt-stat-value">{formatOriginal(c.current, currency)}</p>
                  <p className="mt-stat-sub">
                    Previous: {formatOriginal(c.previous, currency)} · Change:{' '}
                    {formatOriginal(c.difference, currency)}
                    {c.percent_change === null
                      ? ` · ${c.note}`
                      : ` (${c.percent_change >= 0 ? '+' : ''}${Math.round(c.percent_change)}%)`}
                  </p>
                </Card>
              ))}
            </div>
            {summary.budgets.length > 0 && (
              <>
                <SectionHead title="Budget usage" />
                <Card>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {summary.budgets.map((b) => (
                      <li key={b.budget_id} style={{ padding: '0.6rem 0', borderTop: '1px solid var(--mt-border)' }}>
                        <strong>{b.budget_name}</strong>
                        <div className="mt-stat-sub">
                          {formatOriginal(b.spent, currency)} of {formatOriginal(b.amount, currency)} ·{' '}
                          {Math.round(b.percent_used)}% used
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </>
        )
      )}

      <SectionHead title={`Alerts${unread.length > 0 ? ` (${unread.length} unread)` : ''}`} />
      <Card>
        <AlertPrefs />
      </Card>
      {alerts === null ? (
        <p className="mt-loading">Loading alerts…</p>
      ) : alerts.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔔"
            title="No alerts yet"
            text="When your spending crosses a budget threshold you enabled, you'll be notified here."
          />
        </Card>
      ) : (
        <Card>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {alerts.map((a) => (
              <li key={a.id} style={{ padding: '0.7rem 0', borderTop: '1px solid var(--mt-border)' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span
                    style={{
                      width: '0.6rem',
                      height: '0.6rem',
                      borderRadius: '50%',
                      background: a.is_read ? '#d6cfbc' : 'var(--mt-gold)',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  <div style={{ flex: 1 }}>
                    <strong>{alertLabel(a.type)}</strong>
                    {a.budget_name ? ` · ${a.budget_name}` : ''}
                    <div className="mt-stat-sub">{a.message}</div>
                  </div>
                  {!a.is_read && (
                    <button
                      type="button"
                      className="mt-btn mt-btn-secondary"
                      style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                      onClick={() => onMarkRead(a)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  )
}
