import { useEffect, useState } from 'react'
import { getMe } from '../auth/client'
import AppShell from '../components/AppShell'
import BalanceToggle from '../components/BalanceToggle'
import TransactionForm from '../components/TransactionForm'
import { Card, EmptyState, SectionHead } from '../components/ui'
import { fetchAccounts, type Account } from '../lib/accounts'
import { formatOriginal } from '../lib/currency'
import { DEFAULT_BALANCE_VISIBLE, displayBalance } from '../lib/privacy'
import {
  EMPTY_TXN_FILTERS,
  createTransaction,
  deleteTransaction,
  fetchCategories,
  fetchTransactions,
  filterTransactions,
  updateTransaction,
  type Transaction,
  type TransactionForm as TxnForm,
  type TxnCategory,
} from '../lib/transactions'

export default function Transactions() {
  const [txns, setTxns] = useState<Transaction[] | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<TxnCategory[]>([])
  const [filters, setFilters] = useState({ ...EMPTY_TXN_FILTERS })
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [showAmounts, setShowAmounts] = useState<boolean>(DEFAULT_BALANCE_VISIBLE)
  const [primary, setPrimary] = useState('NGN')

  async function reload() {
    const [t, a, c] = await Promise.all([fetchTransactions(), fetchAccounts(), fetchCategories()])
    setTxns(t)
    setAccounts(a)
    setCategories(c)
  }

  useEffect(() => {
    getMe().then((me) => {
      if (me) setPrimary(me.primary_currency)
    })
    reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load transactions')
    })
  }, [])

  async function handleSubmit(form: TxnForm) {
    setBusy(true)
    setFormError('')
    setMessage('')
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
        setMessage('Transaction updated.')
      } else {
        await createTransaction(form)
        setMessage('Transaction saved.')
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
    setError('')
    setMessage('')
    try {
      await deleteTransaction(t.id)
      setMessage('Transaction deleted.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const visible = txns ? filterTransactions(txns, filters) : null

  return (
    <AppShell active="transactions" title="Transactions" subtitle="Every naira, dollar and cent in and out.">
      <SectionHead
        title={`History${visible ? ` (${visible.length})` : ''}`}
        action={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <BalanceToggle visible={showAmounts} onToggle={() => setShowAmounts((v) => !v)} />
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
              Add Transaction
            </button>
          </span>
        }
      />
      {error && <p className="mt-error">{error}</p>}
      {message && <p className="mt-success-msg">{message}</p>}

      <Card>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Type{' '}
            <select
              className="mt-select"
              style={{ width: 'auto', display: 'inline-block' }}
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            >
              <option value="all">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </label>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Account{' '}
            <select
              className="mt-select"
              style={{ width: 'auto', display: 'inline-block' }}
              value={filters.account_id}
              onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}
            >
              <option value="all">All</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Currency{' '}
            <select
              className="mt-select"
              style={{ width: 'auto', display: 'inline-block' }}
              value={filters.currency}
              onChange={(e) => setFilters({ ...filters, currency: e.target.value })}
            >
              <option value="all">All</option>
              {['NGN', 'USD', 'EUR', 'GBP'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            From{' '}
            <input
              className="mt-input"
              style={{ width: 'auto', display: 'inline-block' }}
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            />
          </label>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            To{' '}
            <input
              className="mt-input"
              style={{ width: 'auto', display: 'inline-block' }}
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            />
          </label>
        </div>
      </Card>

      {showForm && (
        <Card>
          <h2 style={{ marginTop: 0 }}>{editing ? 'Edit transaction' : 'Add transaction'}</h2>
          {accounts.length === 0 ? (
            <EmptyState
              icon="▤"
              title="Create an account first"
              text="Transactions live inside accounts. Add an account, then record income and expenses against it."
              action={
                <a className="mt-btn" style={{ textDecoration: 'none' }} href="#/accounts">
                  Go to accounts
                </a>
              }
            />
          ) : (
            <TransactionForm
              accounts={accounts}
              categories={categories}
              initial={editing}
              defaultCurrency={primary}
              business={false}
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

      {visible === null ? (
        <p className="mt-loading">Loading transactions…</p>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="⇄"
            title={txns && txns.length > 0 ? 'No matching transactions' : 'No transactions yet'}
            text={
              txns && txns.length > 0
                ? 'Try a different filter.'
                : 'Record your first income or expense to start building your money history.'
            }
            action={
              !(txns && txns.length > 0) ? (
                <button
                  type="button"
                  className="mt-btn"
                  onClick={() => {
                    setEditing(null)
                    setShowForm(true)
                  }}
                >
                  Add Transaction
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {visible.map((t) => (
              <li
                key={t.id}
                style={{ padding: '0.75rem 0', borderTop: '1px solid var(--mt-border)' }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                  <span
                    aria-label={t.type}
                    style={{
                      fontWeight: 800,
                      color: t.type === 'income' ? 'var(--mt-success)' : 'var(--mt-error)',
                    }}
                  >
                    {t.type === 'income' ? '+' : '−'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{t.category_name ?? 'Uncategorized'}</strong>
                    <div className="mt-stat-sub">
                      {t.date} · {t.account_name ?? 'Unknown account'}
                      {t.payment_method ? ` · ${t.payment_method}` : ''}
                      {t.note ? ` · ${t.note}` : ''}
                    </div>
                  </div>
                  <strong>{displayBalance(formatOriginal(t.amount, t.currency), showAmounts)}</strong>
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
      )}
    </AppShell>
  )
}
