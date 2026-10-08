import { useEffect, useState, type FormEvent } from 'react'
import AppShell from '../components/AppShell'
import { Card, EmptyState, SectionHead } from '../components/ui'
import { formatOriginal } from '../lib/currency'
import {
  ACCOUNT_TYPES,
  EMPTY_ACCOUNT_FORM,
  createAccount,
  deleteAccount,
  fetchAccounts,
  updateAccount,
  validateAccountForm,
  type Account,
  type AccountForm,
} from '../lib/accounts'

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<AccountForm>({ ...EMPTY_ACCOUNT_FORM })
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
            <button
              type="button"
              className="mt-btn"
              style={{ width: 'auto' }}
              onClick={() => openAdd(accounts[0]?.currency ?? 'NGN')}
            >
              Add Account
            </button>
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
              <p className="mt-stat-value">{formatOriginal(a.balance, a.currency)}</p>
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
          <form onSubmit={onSubmit}>
            <div className="mt-field">
              <label htmlFor="acct-name">Account name</label>
              <input
                id="acct-name"
                className="mt-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              {formErrors.name && <p className="mt-error">{formErrors.name}</p>}
            </div>
            <div className="mt-field">
              <label htmlFor="acct-type">Account type</label>
              <select
                id="acct-type"
                className="mt-select"
                value={form.account_type}
                onChange={(e) => setForm({ ...form, account_type: e.target.value })}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {formErrors.account_type && <p className="mt-error">{formErrors.account_type}</p>}
            </div>
            <div className="mt-field">
              <label htmlFor="acct-currency">Currency</label>
              {editing ? (
                <p className="mt-stat-sub">
                  {form.currency} — currency cannot be changed after creation. Create another
                  account for a different currency.
                </p>
              ) : (
                <select
                  id="acct-currency"
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
            <div className="mt-field">
              <label htmlFor="acct-balance">Opening balance</label>
              <input
                id="acct-balance"
                className="mt-input"
                type="number"
                min="0"
                step="0.01"
                value={form.opening_balance}
                onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
              />
              {formErrors.opening_balance && (
                <p className="mt-error">{formErrors.opening_balance}</p>
              )}
            </div>
            <div className="mt-field">
              <label>
                <input
                  type="checkbox"
                  checked={form.is_business}
                  onChange={(e) => setForm({ ...form, is_business: e.target.checked })}
                />{' '}
                Business account
              </label>
            </div>
            <p style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="mt-btn" style={{ width: 'auto' }} type="submit" disabled={busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
              </button>
              <button
                className="mt-btn mt-btn-secondary"
                style={{ width: 'auto' }}
                type="button"
                onClick={() => setShowForm(false)}
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
