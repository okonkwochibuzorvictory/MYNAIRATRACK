import { useEffect, useState, type FormEvent } from 'react'
import AppShell from '../components/AppShell'
import BalanceToggle from '../components/BalanceToggle'
import BudgetDetails, { Progress } from '../components/BudgetDetails'
import BudgetFormEditor from '../components/BudgetForm'
import { Card, EmptyState, SectionHead } from '../components/ui'
import { fetchAccounts } from '../lib/accounts'
import {
  EMPTY_BUDGET_FORM,
  addAllocation,
  createBudget,
  deleteBudget,
  fetchBudget,
  fetchBudgets,
  hasPeriodEnded,
  removeAllocation,
  updateBudget,
  validateBudgetForm,
  type AllocationDraft,
  type Budget,
  type BudgetForm,
} from '../lib/budgets'
import { fetchCategories, type Category } from '../lib/categories'
import { formatOriginal } from '../lib/currency'
import { DEFAULT_BALANCE_VISIBLE, displayBalance } from '../lib/privacy'

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
    setForm({ ...EMPTY_BUDGET_FORM, currency: primary || 'NGN', is_business: false, allocations: [] })
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
              {hasPeriodEnded(b.period_end) && (
                <span className="mt-status" style={{ marginLeft: '0.5rem' }}>
                  Ended
                </span>
              )}
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

      {selected && !selected.is_business && (
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
          <BudgetFormEditor
            form={form}
            setForm={setForm}
            formErrors={formErrors}
            editing={editing !== null}
            categories={categories}
            busy={busy}
            hasAccounts={hasAccounts}
            isBusinessLocked={false}
            onSubmit={onSubmit}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
          />
        </Card>
      )}
    </AppShell>
  )
}
