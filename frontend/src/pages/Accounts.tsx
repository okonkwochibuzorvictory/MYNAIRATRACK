import { useEffect, useState, type FormEvent } from 'react'
import AppShell from '../components/AppShell'
import AccountForm from '../components/AccountForm'
import BalanceToggle from '../components/BalanceToggle'
import { Card, EmptyState, SectionHead } from '../components/ui'
import { formatOriginal } from '../lib/currency'
import { DEFAULT_BALANCE_VISIBLE, displayBalance } from '../lib/privacy'
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

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState('')
  const [showBalances, setShowBalances] = useState<boolean>(DEFAULT_BALANCE_VISIBLE)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<AccountFormData>({ ...EMPTY_ACCOUNT_FORM })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function reload() {
    try {
      setAccounts(await fetchAccounts())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts')
    }
  }

  useEffect(() => {
    reload().catch(() => {
      window.location.hash = '#/login'
    })
  }, [])

  function openAdd(primary: string) {
    setEditing(null)
    setForm({ ...EMPTY_ACCOUNT_FORM, currency: primary || 'NGN' })
    setFormErrors({})
    setError('')
    setShowForm(true)
  }

  function openEdit(account: Account) {
    setEditing(account)
    setForm({
      name: account.name,
      currency: account.currency,
      account_type: account.account_type,
      is_business: account.is_business,
      opening_balance: account.opening_balance,
    })
    setFormErrors({})
    setError('')
    setShowForm(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errors = validateAccountForm(form)
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return
    setBusy(true)
    setError('')
    try {
      if (editing) {
        await updateAccount(editing.id, {
          name: form.name.trim(),
          account_type: form.account_type,
          is_business: form.is_business,
          opening_balance: form.opening_balance,
        })
      } else {
        await createAccount(form)
      }
      setShowForm(false)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(account: Account) {
    if (!window.confirm(`Delete "${account.name}"? This cannot be undone.`)) return
    setError('')
    try {
      await deleteAccount(account.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <AppShell active="accounts" title="Accounts" subtitle="The wallets where your money lives.">
      <SectionHead
        title={`Your accounts${accounts ? ` (${accounts.length})` : ''}`}
        action={
          accounts &&
          accounts.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <BalanceToggle
                visible={showBalances}
                onToggle={() => setShowBalances((v) => !v)}
              />
              <button
                type="button"
                className="mt-btn"
                style={{ width: 'auto' }}
                onClick={() => openAdd(accounts[0]?.currency ?? 'NGN')}
              >
                Add Account
              </button>
            </span>
          )
        }
      />
      {error && <p className="mt-error">{error}</p>}
      {accounts === null ? (
        <p className="mt-loading">Loading accounts…</p>
      ) : accounts.length === 0 && !showForm ? (
        <Card>
          <EmptyState
            icon="▤"
            title="No accounts yet"
            text="Add your first account — a bank account, cash wallet, or mobile money — so your balances have a home. Each account keeps its own currency."
            action={
              <button type="button" className="mt-btn" onClick={() => openAdd('NGN')}>
                Add Account
              </button>
            }
          />
        </Card>
      ) : (
        <div className="mt-grid-3">
          {accounts.map((a) => (
            <Card key={a.id}>
              <p className="mt-card-label">
                {a.account_type}
                {a.is_business ? ' · Business' : ''}
              </p>
              <h2 style={{ margin: '0 0 0.25rem' }}>{a.name}</h2>
              <p className="mt-stat-value">
                {displayBalance(formatOriginal(a.balance, a.currency), showBalances)}
              </p>
              <p className="mt-stat-sub">Native balance · {a.currency}</p>
              <p style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="mt-btn mt-btn-secondary"
                  style={{ width: 'auto' }}
                  onClick={() => openEdit(a)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="mt-btn mt-btn-secondary"
                  style={{ width: 'auto' }}
                  onClick={() => onDelete(a)}
                >
                  Delete
                </button>
              </p>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Card>
          <h2 style={{ marginTop: 0 }}>{editing ? 'Edit account' : 'Add account'}</h2>
          <AccountForm
            form={form}
            setForm={setForm}
            formErrors={formErrors}
            editing={editing !== null}
            busy={busy}
            lockBusiness={false}
            onSubmit={onSubmit}
            onCancel={() => setShowForm(false)}
          />
        </Card>
      )}
    </AppShell>
  )
}
