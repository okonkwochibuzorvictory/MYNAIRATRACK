import { useState } from 'react'
import AlertPrefs from './AlertPrefs'
import { Card } from './ui'
import { statusColor, type AllocationDraft, type Budget } from '../lib/budgets'
import type { Category } from '../lib/categories'
import { formatOriginal } from '../lib/currency'
import { displayBalance } from '../lib/privacy'

export function Progress({ pct, status }: { pct: number; status: string }) {
  const width = Math.max(0, Math.min(100, pct))
  return (
    <>
      <div className="mt-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${width}%`, background: statusColor(status) }} />
      </div>
      <span className="mt-status" style={{ color: statusColor(status) }}>
        {status} · {Math.round(pct)}%
      </span>
    </>
  )
}

export default function BudgetDetails({
  budget,
  categories,
  onAddAllocation,
  onRemoveAllocation,
  onEdit,
  onDelete,
  onClose,
  showAmounts,
}: {
  budget: Budget
  categories: Category[]
  onAddAllocation: (b: Budget, d: AllocationDraft) => void
  onRemoveAllocation: (b: Budget, id: number) => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
  showAmounts: boolean
}) {
  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')
  const usedIds = new Set((budget.allocations ?? []).map((a) => String(a.category_id)))
  const available = categories.filter((c) => !usedIds.has(String(c.id)))

  return (
    <Card>
      <p className="mt-card-label">
        {budget.currency} · {budget.period_start} → {budget.period_end}
      </p>
      <h2 style={{ margin: '0 0 0.25rem' }}>{budget.name}</h2>
      <p className="mt-stat-value">
        {displayBalance(`${formatOriginal(budget.total_spent, budget.currency)} spent`, showAmounts)}
      </p>
      <p className="mt-stat-sub">
        of {formatOriginal(budget.amount, budget.currency)} · allocated{' '}
        {formatOriginal(budget.total_allocated ?? '0', budget.currency)} ·{' '}
        {displayBalance(`${formatOriginal(budget.remaining, budget.currency)} left`, showAmounts)}
      </p>
      <Progress pct={budget.percent_used} status={budget.status} />
      <h3 style={{ marginBottom: '0.25rem' }}>Category breakdown</h3>
      {(budget.allocations ?? []).length === 0 ? (
        <p className="mt-stat-sub">No allocations yet — the whole budget is unassigned.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(budget.allocations ?? []).map((a) => (
            <li key={a.id} style={{ padding: '0.6rem 0', borderTop: '1px solid var(--mt-border)' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                <span style={{ flex: 1 }}>
                  <strong>{a.category_name ?? 'Unknown'}</strong>
                  <div className="mt-stat-sub">
                    {displayBalance(formatOriginal(a.spent, budget.currency), showAmounts)} of{' '}
                    {formatOriginal(a.allocated_amount, budget.currency)}
                  </div>
                </span>
                <span className="mt-status" style={{ color: statusColor(a.status) }}>
                  {a.status}
                </span>
                <button
                  type="button"
                  className="mt-btn mt-btn-secondary"
                  style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                  onClick={() => onRemoveAllocation(budget, a.id)}
                >
                  Remove
                </button>
              </div>
              <div className="mt-progress" role="progressbar" aria-valuenow={Math.round(a.percent_used)} aria-valuemin={0} aria-valuemax={100}>
                <span
                  style={{
                    width: `${Math.max(0, Math.min(100, a.percent_used))}%`,
                    background: statusColor(a.status),
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {budget.unallocated_spending && Number(budget.unallocated_spending) > 0 && (
        <p className="mt-stat-sub">
          Unallocated spending:{' '}
          {displayBalance(formatOriginal(budget.unallocated_spending, budget.currency), showAmounts)}{' '}
          — expenses in {budget.currency} during this period in categories you did not allocate.
        </p>
      )}
      <p className="mt-stat-sub">
        Only {budget.currency} expenses in this period count. Other currencies are never converted
        into this budget.
      </p>
      <div className="mt-field">
        <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
          Alert preferences
        </span>
        <AlertPrefs budgetId={budget.id} />
      </div>
      <div className="mt-field" style={{ marginTop: '1rem' }}>
        <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
          Add allocation
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select className="mt-select" value={catId} aria-label="New allocation category" onChange={(e) => setCatId(e.target.value)}>
            <option value="">Select category</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="mt-input"
            type="number"
            min="0"
            step="0.01"
            style={{ maxWidth: 160 }}
            placeholder={budget.currency}
            aria-label="New allocation amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="mt-btn"
            style={{ width: 'auto' }}
            disabled={!catId || !amount}
            onClick={() => {
              onAddAllocation(budget, { category_id: catId, allocated_amount: amount })
              setCatId('')
              setAmount('')
            }}
          >
            Add
          </button>
        </div>
      </div>
      <p style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={onEdit}>
          Edit budget
        </button>
        <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={onDelete}>
          Delete budget
        </button>
        <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={onClose}>
          Close
        </button>
      </p>
    </Card>
  )
}
