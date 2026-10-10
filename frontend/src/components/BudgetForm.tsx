import type { FormEvent } from 'react'
import { allocationTotals, type AllocationDraft, type BudgetForm } from '../lib/budgets'
import type { Category } from '../lib/categories'
import { CURRENCY_SYMBOLS, formatOriginal } from '../lib/currency'

interface Props {
  form: BudgetForm
  setForm: (form: BudgetForm) => void
  formErrors: Record<string, string>
  editing: boolean
  categories: Category[]
  busy: boolean
  hasAccounts: boolean
  isBusinessLocked: boolean
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}

export default function BudgetForm({
  form,
  setForm,
  formErrors,
  editing,
  categories,
  busy,
  hasAccounts,
  isBusinessLocked,
  onSubmit,
  onCancel,
}: Props) {
  const { allocated, remaining } = allocationTotals(form)
  return (
    <form onSubmit={onSubmit}>
      <div className="mt-field">
        <label htmlFor="bud-name">Budget name *</label>
        <input
          id="bud-name"
          className="mt-input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        {formErrors.name && <p className="mt-error">{formErrors.name}</p>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="mt-field">
          <label htmlFor="bud-amount">Total amount *</label>
          <input
            id="bud-amount"
            className="mt-input"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          {formErrors.amount && <p className="mt-error">{formErrors.amount}</p>}
        </div>
        <div className="mt-field">
          <label htmlFor="bud-currency">Currency *</label>
          {editing ? (
            <p className="mt-stat-sub">
              {form.currency} — currency cannot be changed once the budget has spending.
            </p>
          ) : (
            <select
              id="bud-currency"
              className="mt-select"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {['NGN', 'USD', 'EUR', 'GBP'].map((c) => (
                <option key={c} value={c}>
                  {c} {CURRENCY_SYMBOLS[c] ?? ''}
                </option>
              ))}
            </select>
          )}
          {formErrors.currency && <p className="mt-error">{formErrors.currency}</p>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="mt-field">
          <label htmlFor="bud-start">Start date *</label>
          <input
            id="bud-start"
            className="mt-input"
            type="date"
            value={form.period_start}
            onChange={(e) => setForm({ ...form, period_start: e.target.value })}
            required
          />
        </div>
        <div className="mt-field">
          <label htmlFor="bud-end">End date *</label>
          <input
            id="bud-end"
            className="mt-input"
            type="date"
            value={form.period_end}
            onChange={(e) => setForm({ ...form, period_end: e.target.value })}
            required
          />
          {formErrors.period_end && <p className="mt-error">{formErrors.period_end}</p>}
        </div>
      </div>
      {!editing &&
        (isBusinessLocked ? (
          <p className="mt-stat-sub">This budget monitors business expenses only.</p>
        ) : (
          <p className="mt-stat-sub">This budget monitors personal expenses only.</p>
        ))}
      {!editing && (
        <AllocationEditor
          allocations={form.allocations}
          categories={categories}
          currency={form.currency}
          onChange={(allocations) => setForm({ ...form, allocations })}
        />
      )}
      {!hasAccounts && !editing && (
        <p className="mt-stat-sub">
          Tip: budgets work best with accounts and transactions. You can still set one up now.
        </p>
      )}
      <p className="mt-stat-sub">
        Allocated {formatOriginal(allocated.toFixed(2), form.currency)} ·{' '}
        {remaining >= 0
          ? `${formatOriginal(remaining.toFixed(2), form.currency)} unassigned`
          : 'Over-allocated — reduce an amount'}
      </p>
      {formErrors.allocations && <p className="mt-error">{formErrors.allocations}</p>}
      <p style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="mt-btn" style={{ width: 'auto' }} type="submit" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create budget'}
        </button>
        <button
          className="mt-btn mt-btn-secondary"
          style={{ width: 'auto' }}
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </p>
    </form>
  )
}

function AllocationEditor({
  allocations,
  categories,
  currency,
  onChange,
}: {
  allocations: AllocationDraft[]
  categories: Category[]
  currency: string
  onChange: (a: AllocationDraft[]) => void
}) {
  function add() {
    onChange([...allocations, { category_id: '', allocated_amount: '' }])
  }
  return (
    <div className="mt-field">
      <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
        Category allocations (expense categories only)
      </span>
      {allocations.length === 0 && (
        <p className="mt-stat-sub">None yet — the full amount stays unassigned until you allocate it.</p>
      )}
      {allocations.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <select
            className="mt-select"
            value={a.category_id}
            aria-label={`Allocation ${i + 1} category`}
            onChange={(e) => {
              const next = [...allocations]
              next[i] = { ...next[i], category_id: e.target.value }
              onChange(next)
            }}
          >
            <option value="">Select category</option>
            {categories.map((c) => (
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
            placeholder={currency}
            aria-label={`Allocation ${i + 1} amount`}
            value={a.allocated_amount}
            onChange={(e) => {
              const next = [...allocations]
              next[i] = { ...next[i], allocated_amount: e.target.value }
              onChange(next)
            }}
          />
          <button
            type="button"
            className="mt-btn mt-btn-secondary"
            style={{ width: 'auto' }}
            onClick={() => onChange(allocations.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={add}>
        + Add allocation
      </button>
    </div>
  )
}
