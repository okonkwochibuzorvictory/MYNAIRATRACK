import { useEffect, useState } from 'react'
import { getMe } from '../auth/client'
import AppShell from '../components/AppShell'
import AccountForm from '../components/AccountForm'
import BalanceToggle from '../components/BalanceToggle'
import BudgetDetails from '../components/BudgetDetails'
import BudgetFormEditor from '../components/BudgetForm'
import TransactionForm from '../components/TransactionForm'
import { Card, EmptyState, SectionHead } from '../components/ui'
import { formatOriginal } from '../lib/currency'
import {
  activateBusiness,
  deactivateBusiness,
  fetchBusinessBudgets,
  fetchBusinessStatus,
  fetchProfit,
  type BusinessBudget,
  type AccountProfit,
  type CurrencyProfit,
} from '../lib/business'
import {
  EMPTY_ACCOUNT_FORM,
  createAccount,
  deleteAccount,
  fetchAccounts,
  updateAccount,
  validateAccountForm,
  type Account,
  type AccountForm as AccountFormData,
} from '../lib/accounts'
import {
  EMPTY_BUDGET_FORM,
  addAllocation,
  createBudget,
  deleteBudget,
  fetchBudget,
  removeAllocation,
  updateBudget,
  validateBudgetForm,
  type AllocationDraft,
  type Budget,
  type BudgetForm as BudgetFormData,
} from '../lib/budgets'
import { fetchCategories, type Category } from '../lib/categories'
import {
  createTransaction,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
  type Transaction,
  type TransactionForm as TxnForm,
} from '../lib/transactions'
import { DEFAULT_BALANCE_VISIBLE, displayBalance } from '../lib/privacy'

type Section = 'dashboard' | 'accounts' | 'transactions' | 'budgets'

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'dashboard', label: 'Business Dashboard' },
  { key: 'accounts', label: 'Business Accounts' },
  { key: 'transactions', label: 'Business Transactions' },
  { key: 'budgets', label: 'Business Budgets' },
]

export default function Business() {
  const [active, setActive] = useState<boolean | null>(null)
  const [section, setSection] = useState<Section>('dashboard')
  const [profit, setProfit] = useState<CurrencyProfit[]>([])
  const [profitByAccount, setProfitByAccount] = useState<AccountProfit[]>([])
  const [budgets, setBudgets] = useState<BusinessBudget[]>([])
  const [txns, setTxns] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [txnCategories, setTxnCategories] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAmounts, setShowAmounts] = useState<boolean>(DEFAULT_BALANCE_VISIBLE)

  async function load() {
    const on = await fetchBusinessStatus()
    setActive(on)
    if (!on) return
    const [p, b, t, a, c] = await Promise.all([
      fetchProfit(),
      fetchBusinessBudgets(),
      fetchTransactions({ business: 'true' }),
      fetchAccounts(true),
      fetchCategories(),
    ])
    setProfit(p.per_currency)
    setProfitByAccount(p.accounts)
    setBudgets(b)
    setTxns(t)
    setAccounts(a)
    setCategories(c.filter((x) => x.type === 'expense' && x.is_business))
    setTxnCategories(c.filter((x) => x.is_business))
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load business data')
    })
  }, [])

  async function onToggle() {
    setBusy(true)
    setError('')
    try {
      if (active) await deactivateBusiness()
      else await activateBusiness()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update Business Mode')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell active="business" title="Business" subtitle="A dedicated workspace for business money — separate from personal finance.">
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.25rem' }}>
        <span className="mt-soon" style={{ marginLeft: 0 }}>Business Mode</span>
        <a href="#/dashboard" style={{ fontSize: '0.88rem', fontWeight: 600 }}>← Back to Personal Finance</a>
        <span style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="mt-btn mt-btn-secondary"
            style={{ width: 'auto' }}
            disabled={busy || active === null}
            onClick={onToggle}
          >
            {active ? 'Turn off Business Mode' : 'Activate Business Mode'}
          </button>
        </span>
      </div>
      {active && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`mt-btn ${section === s.key ? '' : 'mt-btn-secondary'}`}
              style={{ width: 'auto' }}
              aria-pressed={section === s.key}
              onClick={() => setSection(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-error">{error}</p>}
      {message && <p className="mt-success-msg">{message}</p>}
      {active === null ? (
        <p className="mt-loading">Loading business mode…</p>
      ) : !active ? (
        <Card>
          <EmptyState
            icon="▣"
            title="Business Mode is off"
            text="Activate Business Mode to track sales, business income, expenses, profit, accounts, and budgets in their own currencies — without touching your personal records."
            action={
              <button type="button" className="mt-btn" disabled={busy} onClick={onToggle}>
                {busy ? 'Activating…' : 'Activate Business Mode'}
              </button>
            }
          />
        </Card>
      ) : (
        <>
          {section === 'dashboard' && (
            <BusinessOverview profit={profit} byAccount={profitByAccount} showAmounts={showAmounts} onToggleAmounts={() => setShowAmounts((v) => !v)} />
          )}
          {section === 'accounts' && (
            <BusinessAccounts
              accounts={accounts}
              showAmounts={showAmounts}
              onToggleAmounts={() => setShowAmounts((v) => !v)}
              reload={load}
              setError={setError}
              setMessage={setMessage}
            />
          )}
          {section === 'transactions' && (
            <BusinessTransactions
              txns={txns}
              accounts={accounts}
              categories={txnCategories}
              reload={load}
              setError={setError}
              setMessage={setMessage}
            />
          )}
          {section === 'budgets' && (
            <BusinessBudgets
              budgets={budgets}
              categories={categories}
              accounts={accounts}
              showAmounts={showAmounts}
              reload={load}
              setError={setError}
              setMessage={setMessage}
            />
          )}
        </>
      )}
    </AppShell>
  )
}

export function BusinessOverview({
  profit,
  byAccount,
  showAmounts,
  onToggleAmounts,
}: {
  profit: CurrencyProfit[]
  byAccount: AccountProfit[]
  showAmounts: boolean
  onToggleAmounts: () => void
}) {
  return (
    <>
      <SectionHead
        title="Overview"
        action={<BalanceToggle visible={showAmounts} onToggle={onToggleAmounts} />}
      />
      {byAccount.length === 0 ? (
        <Card>
          <EmptyState
            icon="▣"
            title="No business activity yet"
            text="Record a sale or business expense in a business account to see profit here."
          />
        </Card>
      ) : (
        <>
          <div className="mt-grid-2">
            {byAccount.map((row) => {
              const gain = Number(row.profit) >= 0
              return (
                <Card key={row.account_id}>
                  <p className="mt-card-label">{row.account_name} · {row.currency}</p>
                  <p
                    className="mt-stat-value"
                    style={{ color: gain ? 'var(--mt-success)' : 'var(--mt-error)' }}
                  >
                    {displayBalance(
                      `${gain ? '+' : ''}${formatOriginal(row.profit, row.currency)} profit`,
                      showAmounts,
                    )}
                  </p>
                  <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0 }}>
                    <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderTop: '1px solid var(--mt-border)' }}>
                      <span><span aria-hidden="true" style={{ color: 'var(--mt-success)', fontWeight: 800 }}>+ </span>Sales</span>
                      <strong>{displayBalance(formatOriginal(row.sales, row.currency), showAmounts)}</strong>
                    </li>
                    <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderTop: '1px solid var(--mt-border)' }}>
                      <span><span aria-hidden="true" style={{ color: 'var(--mt-success)', fontWeight: 800 }}>+ </span>Business income</span>
                      <strong>{displayBalance(formatOriginal(row.income, row.currency), showAmounts)}</strong>
                    </li>
                    <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderTop: '1px solid var(--mt-border)' }}>
                      <span><span aria-hidden="true" style={{ color: 'var(--mt-error)', fontWeight: 800 }}>− </span>Business expenses</span>
                      <strong>{displayBalance(formatOriginal(row.expenses, row.currency), showAmounts)}</strong>
                    </li>
                  </ul>
                </Card>
              )
            })}
          </div>
          {profit.length > 1 && (
            <Card>
              <p className="mt-card-label">Totals by currency</p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {profit.map((row) => (
                  <li key={row.currency} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderTop: '1px solid var(--mt-border)' }}>
                    <span>{row.currency} profit</span>
                    <strong>{displayBalance(formatOriginal(row.profit, row.currency), showAmounts)}</strong>
                  </li>
                ))}
              </ul>
              <p className="mt-stat-sub">Currencies are never combined into one total.</p>
            </Card>
          )}
        </>
      )}
    </>
  )
}

function BusinessAccounts({
  accounts,
  showAmounts,
  onToggleAmounts,
  reload,
  setError,
  setMessage,
}: {
  accounts: Account[]
  showAmounts: boolean
  onToggleAmounts: () => void
  reload: () => Promise<void>
  setError: (m: string) => void
  setMessage: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<AccountFormData>({ ...EMPTY_ACCOUNT_FORM, is_business: true })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_ACCOUNT_FORM, is_business: true })
    setFormErrors({})
    setShowForm(true)
  }

  function openEdit(a: Account) {
    setEditing(a)
    setForm({
      name: a.name,
      currency: a.currency,
      account_type: a.account_type,
      is_business: true,
      opening_balance: a.opening_balance,
    })
    setFormErrors({})
    setShowForm(true)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validateAccountForm({ ...form, is_business: true })
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    try {
      if (editing) {
        await updateAccount(editing.id, {
          name: form.name.trim(),
          account_type: form.account_type,
          opening_balance: form.opening_balance,
        })
        setMessage('Business account updated.')
      } else {
        await createAccount({ ...form, is_business: true })
        setMessage('Business account created.')
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

  async function onDelete(a: Account) {
    if (!window.confirm(`Delete "${a.name}"? This cannot be undone.`)) return
    try {
      await deleteAccount(a.id)
      setMessage('Business account deleted.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <>
      <SectionHead
        title={`Business accounts (${accounts.length})`}
        action={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <BalanceToggle visible={showAmounts} onToggle={onToggleAmounts} />
            <button type="button" className="mt-btn" style={{ width: 'auto' }} onClick={openAdd}>
              Add Business Account
            </button>
          </span>
        }
      />
      {accounts.length === 0 && !showForm ? (
        <Card>
          <EmptyState
            icon="▤"
            title="No business accounts"
            text="Create a business wallet here. Each keeps its own currency and never mixes with personal money."
            action={
              <button type="button" className="mt-btn" onClick={openAdd}>
                Add Business Account
              </button>
            }
          />
        </Card>
      ) : (
        <div className="mt-grid-3">
          {accounts.map((a) => (
            <Card key={a.id}>
              <p className="mt-card-label">{a.account_type}</p>
              <h2 style={{ margin: '0 0 0.25rem' }}>{a.name}</h2>
              <p className="mt-stat-value">
                {displayBalance(formatOriginal(a.balance, a.currency), showAmounts)}
              </p>
              <p className="mt-stat-sub">Native balance · {a.currency}</p>
              <p style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={() => openEdit(a)}>
                  Edit
                </button>
                <button type="button" className="mt-btn mt-btn-secondary" style={{ width: 'auto' }} onClick={() => onDelete(a)}>
                  Delete
                </button>
              </p>
            </Card>
          ))}
        </div>
      )}
      {showForm && (
        <Card>
          <h2 style={{ marginTop: 0 }}>{editing ? 'Edit business account' : 'Add business account'}</h2>
          <AccountForm
            form={form}
            setForm={setForm}
            formErrors={formErrors}
            editing={editing !== null}
            busy={busy}
            lockBusiness={true}
            onSubmit={onSubmit}
            onCancel={() => {
              setShowForm(false)
              setEditing(null)
            }}
          />
        </Card>
      )}
    </>
  )
}

function BusinessTransactions({
  txns,
  accounts,
  categories,
  reload,
  setError,
  setMessage,
}: {
  txns: Transaction[]
  accounts: Account[]
  categories: Category[]
  reload: () => Promise<void>
  setError: (m: string) => void
  setMessage: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [primary, setPrimary] = useState('NGN')

  useEffect(() => {
    getMe().then((me) => {
      if (me) setPrimary(me.primary_currency)
    })
  }, [])

  async function handleSubmit(form: TxnForm) {
    setBusy(true)
    setFormError('')
    try {
      if (editing) {
        await updateTransaction(editing.id, {
          account_id: Number(form.account_id),
          type: form.type,
          amount: form.amount,
          currency: form.currency,
          category_id: form.category_id ? Number(form.category_id) : null,
          date: form.date,
          payment_method: form.payment_method.trim() || null,
          note: form.note.trim() || null,
        })
        setMessage('Business transaction updated.')
      } else {
        await createTransaction(form)
        setMessage('Business transaction saved.')
      }
      setShowForm(false)
      setEditing(null)
      await reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(t: Transaction) {
    if (!window.confirm(`Delete this ${t.type} of ${formatOriginal(t.amount, t.currency)}?`)) return
    try {
      await deleteTransaction(t.id)
      setMessage('Business transaction deleted.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <>
      <SectionHead
        title={`Business transactions (${txns.length})`}
        action={
          <button
            type="button"
            className="mt-btn"
            style={{ width: 'auto' }}
            onClick={() => {
              setEditing(null)
              setFormError('')
              setShowForm(true)
            }}
          >
            Record Business Transaction
          </button>
        }
      />
      {showForm && (
        <Card>
          <h2 style={{ marginTop: 0 }}>{editing ? 'Edit business transaction' : 'Record business transaction'}</h2>
          {accounts.length === 0 ? (
            <EmptyState
              icon="▤"
              title="Create a business account first"
              text="Business transactions live inside business accounts."
            />
          ) : (
            <TransactionForm
              accounts={accounts}
              categories={categories}
              initial={editing}
              defaultCurrency={primary}
              business={true}
              busy={busy}
              serverError={formError}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false)
                setEditing(null)
              }}
            />
          )}
        </Card>
      )}
      {txns.length === 0 && !showForm ? (
        <Card>
          <EmptyState
            icon="⇄"
            title="No business transactions"
            text="Record sales, business income, and business expenses here. Amounts keep their original currency."
            action={
              <button type="button" className="mt-btn" onClick={() => setShowForm(true)}>
                Record Business Transaction
              </button>
            }
          />
        </Card>
      ) : (
        txns.length > 0 && (
          <Card>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {txns.map((t) => (
                <li key={t.id} style={{ padding: '0.6rem 0', borderTop: '1px solid var(--mt-border)' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 800, color: t.type === 'expense' ? 'var(--mt-error)' : 'var(--mt-success)' }}>
                      {t.type === 'expense' ? '−' : '+'}
                    </span>
                    <span style={{ flex: 1 }}>
                      <strong>{t.type === 'sale' ? 'Sale' : (t.category_name ?? 'Uncategorized')}</strong>
                      <div className="mt-stat-sub">
                        {t.date} · {t.account_name ?? ''} · {t.currency}
                      </div>
                    </span>
                    <strong>{formatOriginal(t.amount, t.currency)}</strong>
                    <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="mt-btn mt-btn-secondary"
                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                        onClick={() => {
                          setEditing(t)
                          setFormError('')
                          setShowForm(true)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="mt-btn mt-btn-secondary"
                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                        onClick={() => onDelete(t)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )
      )}
    </>
  )
}

function BusinessBudgets({
  budgets,
  categories,
  accounts,
  showAmounts,
  reload,
  setError,
  setMessage,
}: {
  budgets: import('../lib/business').BusinessBudget[]
  categories: Category[]
  accounts: Account[]
  showAmounts: boolean
  reload: () => Promise<void>
  setError: (m: string) => void
  setMessage: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<BudgetFormData>({ ...EMPTY_BUDGET_FORM, is_business: true, allocations: [] })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Budget | null>(null)
  const [editing, setEditing] = useState<Budget | null>(null)
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validateBudgetForm({ ...form, is_business: true })
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    try {
      if (editing) {
        const updated = await updateBudget(editing.id, {
          name: form.name.trim(),
          amount: form.amount,
          period_start: form.period_start,
          period_end: form.period_end,
        })
        setMessage('Business budget updated.')
        setShowForm(false)
        setEditing(null)
        await reload()
        setSelected(await fetchBudget(updated.id))
      } else {
        await createBudget({ ...form, is_business: true })
        setMessage('Business budget created.')
        setShowForm(false)
        setForm({ ...EMPTY_BUDGET_FORM, is_business: true, allocations: [] })
        await reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function openEdit(b: Budget) {
    setEditing(b)
    setForm({
      name: b.name,
      amount: String(Number(b.amount)),
      currency: b.currency,
      period_start: b.period_start,
      period_end: b.period_end,
      is_business: true,
      allocations: [],
    })
    setFormErrors({})
    setShowForm(true)
  }

  async function onDelete(b: { id: number; name: string }) {
    if (!window.confirm(`Delete "${b.name}"? Transactions and categories are kept.`)) return
    try {
      await deleteBudget(b.id)
      setMessage('Business budget deleted.')
      setSelected(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function onAddAllocation(budget: Budget, draft: AllocationDraft) {
    try {
      await addAllocation(budget.id, Number(draft.category_id), draft.allocated_amount)
      setSelected(await fetchBudget(budget.id))
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add allocation')
    }
  }

  async function onRemoveAllocation(budget: Budget, allocationId: number) {
    try {
      await removeAllocation(budget.id, allocationId)
      setSelected(await fetchBudget(budget.id))
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove allocation')
    }
  }

  return (
    <>
      <SectionHead
        title={`Business budgets (${budgets.length})`}
        action={
          <button
            type="button"
            className="mt-btn"
            style={{ width: 'auto' }}
            onClick={() => {
              setForm({ ...EMPTY_BUDGET_FORM, is_business: true, allocations: [] })
              setFormErrors({})
              setShowForm((v) => !v)
            }}
          >
            New Business Budget
          </button>
        }
      />
      {showForm && (
        <Card>
          <h2 style={{ marginTop: 0 }}>{editing ? 'Edit business budget' : 'New business budget'}</h2>
          <BudgetFormEditor
            form={form}
            setForm={setForm}
            formErrors={formErrors}
            editing={false}
            categories={categories}
            busy={busy}
            hasAccounts={accounts.length > 0}
            isBusinessLocked={true}
            onSubmit={onSubmit}
            onCancel={() => setShowForm(false)}
          />
        </Card>
      )}
      {budgets.length === 0 && !showForm ? (
        <Card>
          <EmptyState
            icon="◫"
            title="No business budgets"
            text="Business budgets monitor business expenses only, in their own currency."
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
              <p className="mt-stat-sub">of {formatOriginal(b.amount, b.currency)}</p>
              <p style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="mt-btn mt-btn-secondary"
                  style={{ width: 'auto' }}
                  onClick={() => {
                    if (selected?.id === b.id) {
                      setSelected(null)
                    } else {
                      fetchBudget(b.id).then(setSelected).catch((err: unknown) => {
                        setError(err instanceof Error ? err.message : 'Could not load budget')
                      })
                    }
                  }}
                >
                  {selected?.id === b.id ? 'Hide details' : 'Details'}
                </button>
                <button
                  type="button"
                  className="mt-btn mt-btn-secondary"
                  style={{ width: 'auto' }}
                  onClick={() => onDelete(b)}
                >
                  Delete
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
    </>
  )
}
