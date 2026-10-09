import { useEffect, useState, type FormEvent } from 'react'
import AppShell from '../components/AppShell'
import AlertPrefs from '../components/AlertPrefs'
import BalanceToggle from '../components/BalanceToggle'
import { Card, EmptyState, SectionHead } from '../components/ui'
import { fetchAccounts } from '../lib/accounts'
import {
  EMPTY_BUDGET_FORM,
  addAllocation,
  allocationTotals,
  createBudget,
  deleteBudget,
  fetchBudget,
  fetchBudgets,
  removeAllocation,
  statusColor,
  updateBudget,
  validateBudgetForm,
  type AllocationDraft,
  type Budget,
  type BudgetForm,
} from '../lib/budgets'
import { fetchCategories, type Category } from '../lib/categories'
import { CURRENCY_SYMBOLS, formatOriginal } from '../lib/currency'
import { DEFAULT_BALANCE_VISIBLE, displayBalance } from '../lib/privacy'

function Progress({ pct, status }: { pct: number; status: string }) {
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

export default function Budgets() {
  const [budgets, setBudgets] = useState<Budget[] | null>(null)
  const [selected, setSelected] = useState<Budget | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [hasAccounts, setHasAccounts] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [form, setForm] = useState<BudgetForm>({ ...EMPTY_BUDGET_FORM })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [showAmounts, setShowAmounts] = useState<boolean>(DEFAULT_BALANCE_VISIBLE)

  async function reload(selectId?: number) {
    const list = await fetchBudgets()
    setBudgets(list)
    if (selectId !== undefined) {
      setSelected(await fetchBudget(selectId))
    } else if (selected) {
      try {
        setSelected(await fetchBudget(selected.id))
      } catch {
        setSelected(null)
      }
    }
  }

  useEffect(() => {
    Promise.all([fetchBudgets(), fetchCategories(), fetchAccounts()])
      .then(([b, c, a]) => {
        setBudgets(b)
        setCategories(c.filter((x) => x.type === 'expense'))
        setHasAccounts(a.length > 0)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load budgets')
      })
  }, [])

  function openCreate(primary: string) {
    setEditing(null)
    setForm({ ...EMPTY_BUDGET_FORM, currency: primary || 'NGN', allocations: [] })
    setFormErrors({})
    setError('')
    setMessage('')
    setShowForm(true)
  }

  function openEdit(budget: Budget) {
    setEditing(budget)
    setForm({
      name: budget.name,
      amount: String(Number(budget.amount)),
      currency: budget.currency,
      period_start: budget.period_start,
      period_end: budget.period_end,
      allocations: [],
    })
    setFormErrors({})
    setError('')
    setMessage('')
    setShowForm(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateBudgetForm(form)
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (editing) {
        const updated = await updateBudget(editing.id, {
          name: form.name.trim(),
          amount: form.amount,
          period_start: form.period_start,
          period_end: form.period_end,
        })
        setMessage('Budget updated.')
        setShowForm(false)
        setEditing(null)
        await reload(updated.id)
      } else {
        const created = await createBudget(form)
        setMessage('Budget created.')
        setShowForm(false)
        await reload(created.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(budget: Budget) {
    if (!window.confirm(`Delete "${budget.name}"? Transactions and categories are kept.`)) return
    setError('')
    try {
      await deleteBudget(budget.id)
      setMessage('Budget deleted.')
      setSelected(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function onAddAllocation(budget: Budget, draft: AllocationDraft) {
    setError('')
    try {
      await addAllocation(budget.id, Number(draft.category_id), draft.allocated_amount)
      await reload(budget.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add allocation')
    }
  }

  async function onRemoveAllocation(budget: Budget, allocationId: number) {
    setError('')
    try {
      await removeAllocation(budget.id, allocationId)
      await reload(budget.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove allocation')
    }
  }

  const { allocated, remaining } = allocationTotals(form)

  return (
    <AppShell active="budgets" title="Budgets" subtitle="Plan spending by category and watch it stay on track.">
      <SectionHead
        title={`Your budgets${budgets ? ` (${budgets.length})` : ''}`}
        action={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <BalanceToggle visible={showAmounts} onToggle={() => setShowAmounts((v) => !v)} />
            <button type="button" className="mt-btn" style={{ width: 'auto' }} onClick={() => openCreate('NGN')}>
              Create Budget
            </button>
          </span>
        }
      />
      {error && <p className="mt-error">{error}</p>}
      {message && <p className="mt-success-msg">{message}</p>}

      {budgets === null ? (
        <p className="mt-loading">Loading budgets…</p>
      ) : budgets.length === 0 && !showForm ? (
        <Card>
          <EmptyState
            icon="◫"
            title="No budgets yet"
            text="Create your first budget to start monitoring your spending. Each budget uses its own currency, and only same-currency expenses count toward it."
            action={
              <button type="button" className="mt-btn" onClick={() => openCreate('NGN')}>
                Create Budget
              </button>
            }
          />
        </Card>
      ) : (
        <div className="mt-grid-2">
          {budgets.map((b) => (
            <Card key={b.id}>
              <p className="mt-card-label">
                {b.currency} · {b.period_start} → {b.period_end}
              </p>
              <h2 style={{ margin: '0 0 0.25rem' }}>{b.name}</h2>
              <p className="mt-stat-value">
                {displayBalance(`${formatOriginal(b.total_spent, b.currency)} spent`, showAmounts)}
              </p>
              <p className="mt-stat-sub">
                of {formatOriginal(b.amount, b.currency)} ·{' '}
                {displayBalance(`${formatOriginal(b.remaining, b.currency)} left`, showAmounts)}
              </p>
              <Progress pct={b.percent_used} status={b.status} />
              <p style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="mt-btn mt-btn-secondary"
                  style={{ width: 'auto' }}
                  onClick={() => {
                    setSelected(b)
                    fetchBudget(b.id).then(setSelected).catch(() => {})
                  }}
                >
                  Details
                </button>
              </p>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <BudgetDetails
          budget={selected}
          categories={categories}
          onAddAllocation={onAddAllocation}
          onRemoveAllocation={onRemoveAllocation}
          onEdit={() => openEdit(selected)}
          onDelete={() => onDelete(selected)}
          onClose={() => setSelected(null)}
          showAmounts={showAmounts}
        />
      )}

      {showForm && (
        <Card>
          <h2 style={{ marginTop: 0 }}>{editing ? 'Edit budget' : 'Create budget'}</h2>
          {!hasAccounts && !editing && (
            <p className="mt-stat-sub">
              Tip: budgets work best with accounts and transactions. You can still set one up now.
            </p>
          )}
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
            {!editing && (
              <AllocationEditor
                allocations={form.allocations}
                categories={categories}
                currency={form.currency}
                onChange={(allocations) => setForm({ ...form, allocations })}
              />
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
                onClick={() => {
                  setShowForm(false)
                  setEditing(null)
                }}
              >
                Cancel
              </button>
            </p>
          </form>
        </Card>
      )}
    </AppShell>
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

function BudgetDetails({
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
