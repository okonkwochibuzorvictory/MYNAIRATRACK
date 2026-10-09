import { useEffect, useState, type FormEvent } from 'react'
import AppShell from '../components/AppShell'
import BalanceToggle from '../components/BalanceToggle'
import { Card, EmptyState, SectionHead } from '../components/ui'
import { formatOriginal } from '../lib/currency'
import {
  EMPTY_GOAL_FORM,
  createGoal,
  createSavings,
  deleteGoal,
  deleteSavings,
  fetchGoals,
  fetchSavings,
  statusColor,
  updateGoal,
  updateSavings,
  validateGoalForm,
  type Goal,
  type GoalForm,
  type SavingsTarget,
} from '../lib/goals'
import { DEFAULT_BALANCE_VISIBLE, displayBalance } from '../lib/privacy'

export default function Goals() {
  const [savings, setSavings] = useState<SavingsTarget[] | null>(null)
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [kind, setKind] = useState<'savings' | 'goal'>('goal')
  const [editing, setEditing] = useState<{ kind: 'savings' | 'goal'; id: number } | null>(null)
  const [form, setForm] = useState<GoalForm>({ ...EMPTY_GOAL_FORM })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [showAmounts, setShowAmounts] = useState<boolean>(DEFAULT_BALANCE_VISIBLE)

  async function reload() {
    const [s, g] = await Promise.all([fetchSavings(), fetchGoals()])
    setSavings(s)
    setGoals(g)
  }

  useEffect(() => {
    reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load goals')
    })
  }, [])

  function openCreate(k: 'savings' | 'goal') {
    setKind(k)
    setEditing(null)
    setForm({ ...EMPTY_GOAL_FORM })
    setFormErrors({})
    setError('')
    setMessage('')
    setShowForm(true)
  }

  function openEdit(k: 'savings' | 'goal', item: SavingsTarget | Goal) {
    setKind(k)
    setEditing({ kind: k, id: item.id })
    setForm({
      name: item.name,
      target_amount: String(Number(item.target_amount)),
      currency: item.currency,
      current_amount: String(Number(item.current_amount)),
      deadline: (item as Goal).deadline ?? '',
    })
    setFormErrors({})
    setError('')
    setMessage('')
    setShowForm(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateGoalForm(form)
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (editing) {
        if (editing.kind === 'savings') {
          await updateSavings(editing.id, {
            name: form.name.trim(),
            target_amount: form.target_amount,
            current_amount: form.current_amount,
          })
        } else {
          await updateGoal(editing.id, {
            name: form.name.trim(),
            target_amount: form.target_amount,
            current_amount: form.current_amount,
            deadline: form.deadline || null,
          })
        }
        setMessage('Updated.')
      } else if (kind === 'savings') {
        await createSavings(form)
        setMessage('Savings target created.')
      } else {
        await createGoal(form)
        setMessage('Goal created.')
      }
      setShowForm(false)
      setEditing(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(k: 'savings' | 'goal', item: SavingsTarget) {
    if (!window.confirm(`Delete "${item.name}"? Only this planning record is removed.`)) return
    setError('')
    try {
      if (k === 'savings') await deleteSavings(item.id)
      else await deleteGoal(item.id)
      setMessage('Deleted.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <AppShell
      active="goals"
      title="Goals"
      subtitle="Set targets, track your progress, and stay focused on what you're working toward."
    >
      <SectionHead
        title="Savings & goals"
        action={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <BalanceToggle visible={showAmounts} onToggle={() => setShowAmounts((v) => !v)} />
          </span>
        }
      />
      {error && <p className="mt-error">{error}</p>}
      {message && <p className="mt-success-msg">{message}</p>}

      <SectionHead
        title="Savings Targets"
        action={
          <button type="button" className="mt-btn" style={{ width: 'auto' }} onClick={() => openCreate('savings')}>
            Add Savings Target
          </button>
        }
      />
      {savings === null ? (
        <p className="mt-loading">Loading savings targets…</p>
      ) : savings.length === 0 ? (
        <Card>
          <EmptyState
            icon="◍"
            title="No savings targets yet"
            text="Set aside money for an emergency fund, a laptop, or a vacation. Amounts you record here are tracked manually — nothing moves automatically."
            action={
              <button type="button" className="mt-btn" onClick={() => openCreate('savings')}>
                Add Savings Target
              </button>
            }
          />
        </Card>
      ) : (
        <div className="mt-grid-2">
          {savings.map((s) => (
            <GoalCard
              key={s.id}
              name={s.name}
              target={s.target_amount}
              current={s.current_amount}
              currency={s.currency}
              remaining={s.remaining}
              pct={s.percent_complete}
              status={s.status}
              sub={Number(s.exceeded_by) > 0 ? `Exceeded by ${formatOriginal(s.exceeded_by, s.currency)}` : undefined}
              showAmounts={showAmounts}
              onEdit={() => openEdit('savings', s)}
              onDelete={() => onDelete('savings', s)}
            />
          ))}
        </div>
      )}

      <SectionHead
        title="Financial Goals"
        action={
          <button type="button" className="mt-btn" style={{ width: 'auto' }} onClick={() => openCreate('goal')}>
            Add Financial Goal
          </button>
        }
      />
      {goals === null ? (
        <p className="mt-loading">Loading goals…</p>
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon="◎"
            title="No financial goals yet"
            text="Define a bigger objective — a car, an emergency reserve, an investment target — each in its own currency, no account required."
            action={
              <button type="button" className="mt-btn" onClick={() => openCreate('goal')}>
                Add Financial Goal
              </button>
            }
          />
        </Card>
      ) : (
        <div className="mt-grid-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              name={g.name}
              target={g.target_amount}
              current={g.current_amount}
              currency={g.currency}
              remaining={g.remaining}
              pct={g.percent_complete}
              status={g.status}
              sub={[
                g.deadline ? `Target date: ${g.deadline}` : undefined,
                Number(g.exceeded_by) > 0 ? `Exceeded by ${formatOriginal(g.exceeded_by, g.currency)}` : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
              showAmounts={showAmounts}
              onEdit={() => openEdit('goal', g)}
              onDelete={() => onDelete('goal', g)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <Card>
          <h2 style={{ marginTop: 0 }}>
            {editing ? 'Edit' : kind === 'savings' ? 'Add savings target' : 'Add financial goal'}
          </h2>
          <form onSubmit={onSubmit}>
            <div className="mt-field">
              <label htmlFor="goal-name">Name *</label>
              <input
                id="goal-name"
                className="mt-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              {formErrors.name && <p className="mt-error">{formErrors.name}</p>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="mt-field">
                <label htmlFor="goal-target">Target amount *</label>
                <input
                  id="goal-target"
                  className="mt-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.target_amount}
                  onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                  required
                />
                {formErrors.target_amount && <p className="mt-error">{formErrors.target_amount}</p>}
              </div>
              <div className="mt-field">
                <label htmlFor="goal-currency">Currency *</label>
                {editing ? (
                  <p className="mt-stat-sub">
                    {form.currency} — currency cannot be changed once there is progress.
                  </p>
                ) : (
                  <select
                    id="goal-currency"
                    className="mt-select"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {['NGN', 'USD', 'EUR', 'GBP'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                {formErrors.currency && <p className="mt-error">{formErrors.currency}</p>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="mt-field">
                <label htmlFor="goal-current">Saved so far</label>
                <input
                  id="goal-current"
                  className="mt-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.current_amount}
                  onChange={(e) => setForm({ ...form, current_amount: e.target.value })}
                />
                {formErrors.current_amount && <p className="mt-error">{formErrors.current_amount}</p>}
              </div>
              {kind === 'goal' && (
                <div className="mt-field">
                  <label htmlFor="goal-deadline">Target date (optional)</label>
                  <input
                    id="goal-deadline"
                    className="mt-input"
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  />
                  {formErrors.deadline && <p className="mt-error">{formErrors.deadline}</p>}
                </div>
              )}
            </div>
            <p className="mt-stat-sub">
              Progress is tracked manually — recording an amount here moves no money.
            </p>
            <p style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="mt-btn" style={{ width: 'auto' }} type="submit" disabled={busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Create'}
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

function GoalCard({
  name,
  target,
  current,
  currency,
  remaining,
  pct,
  status,
  sub,
  showAmounts,
  onEdit,
  onDelete,
}: {
  name: string
  target: string
  current: string
  currency: string
  remaining: string
  pct: number
  status: string
  sub?: string
  showAmounts: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const width = Math.max(0, Math.min(100, pct))
  return (
    <Card>
      <p className="mt-card-label">{currency}</p>
      <h2 style={{ margin: '0 0 0.25rem' }}>{name}</h2>
      <p className="mt-stat-value">
        {displayBalance(`${formatOriginal(current, currency)} saved`, showAmounts)}
      </p>
      <p className="mt-stat-sub">
        of {formatOriginal(target, currency)} · {formatOriginal(remaining, currency)} left
        {sub ? ` · ${sub}` : ''}
      </p>
      <div className="mt-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${width}%`, background: statusColor(status) }} />
      </div>
      <span className="mt-status" style={{ color: statusColor(status) }}>
        {status} · {Math.round(pct)}%
      </span>
      <p style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
        <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={onDelete}>
          Delete
        </button>
      </p>
    </Card>
  )
}
