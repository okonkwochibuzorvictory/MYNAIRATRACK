import { useEffect, useState, type FormEvent } from 'react'
import type { Account } from '../lib/accounts'
import { formatOriginal } from '../lib/currency'
import {
  EMPTY_TXN_FORM,
  categoriesForScope,
  categoriesForType,
  validateTransactionForm,
  type Transaction,
  type TransactionForm,
  type TxnCategory,
} from '../lib/transactions'

interface Props {
  accounts: Account[]
  categories: TxnCategory[]
  initial?: Transaction | null
  defaultCurrency: string
  business: boolean
  busy: boolean
  serverError: string
  onSubmit: (form: TransactionForm) => void
  onCancel: () => void
}

export default function TransactionForm({
  accounts,
  categories,
  initial,
  defaultCurrency,
  business,
  busy,
  serverError,
  onSubmit,
  onCancel,
}: Props) {
  const [form, setForm] = useState<TransactionForm>({ ...EMPTY_TXN_FORM })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (initial) {
      setForm({
        type: initial.type,
        account_id: String(initial.account_id),
        amount: String(Number(initial.amount)),
        currency: initial.currency,
        category_id: initial.category_id ? String(initial.category_id) : '',
        date: initial.date,
        payment_method: initial.payment_method ?? '',
        note: initial.note ?? '',
        business_override: false,
      })
      setShowDetails(true)
    } else {
      setForm((f) => ({ ...f, currency: defaultCurrency }))
    }
  }, [initial, defaultCurrency])

  const account = accounts.find((a) => String(a.id) === form.account_id) ?? null
  const visibleCategories = categoriesForScope(
    categoriesForType(categories, form.type === 'sale' ? 'income' : form.type),
    business,
  )
  const typeOptions: Array<'income' | 'expense' | 'sale'> =
    account?.is_business === true ? ['income', 'expense', 'sale'] : ['income', 'expense']

  function set<K extends keyof TransactionForm>(key: K, value: TransactionForm[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'type') next.category_id = ''
      if (key === 'account_id') {
        const acct = accounts.find((a) => String(a.id) === String(value))
        if (acct && !initial) next.currency = acct.currency
      }
      return next
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateTransactionForm(form, account?.currency ?? null)
    // A cross-currency warning is informative, not blocking.
    if (errs.currency && account && form.currency !== account.currency) delete errs.currency
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mt-field">
        <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
          Type *
        </span>
        <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
          {typeOptions.map((t) => (
            <button
              key={t}
              type="button"
              className={`mt-btn ${form.type === t ? '' : 'mt-btn-secondary'}`}
              style={{ width: 'auto' }}
              aria-pressed={form.type === t}
              onClick={() => set('type', t)}
            >
              {t === 'income' ? '+ Income' : t === 'sale' ? '◈ Sale' : '− Expense'}
            </button>
          ))}
        </span>
      </div>
      <div className="mt-field">
        <label htmlFor="txn-amount">Amount *</label>
        <input
          id="txn-amount"
          className="mt-input"
          type="number"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(e) => set('amount', e.target.value)}
          required
        />
        {errors.amount && <p className="mt-error">{errors.amount}</p>}
      </div>
      <div className="mt-field">
        <label htmlFor="txn-account">Account *</label>
        <select
          id="txn-account"
          className="mt-select"
          value={form.account_id}
          onChange={(e) => set('account_id', e.target.value)}
          required
        >
          <option value="">Select an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
        {errors.account_id && <p className="mt-error">{errors.account_id}</p>}
      </div>
      <div className="mt-field">
        <label htmlFor="txn-category">Category *</label>
        <select
          id="txn-category"
          className="mt-select"
          value={form.category_id}
          onChange={(e) => set('category_id', e.target.value)}
          required
        >
          <option value="">Select a category</option>
          {visibleCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.category_id && <p className="mt-error">{errors.category_id}</p>}
      </div>
      <div className="mt-field">
        <button
          type="button"
          className="mt-btn mt-btn-secondary"
          style={{ width: 'auto' }}
          aria-expanded={showDetails}
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? 'Hide details' : 'More details'}
        </button>
      </div>
      {showDetails && (
        <>
          <div className="mt-field">
            <label htmlFor="txn-currency">Currency</label>
            <select
              id="txn-currency"
              className="mt-select"
              value={form.currency}
              onChange={(e) => set('currency', e.target.value)}
            >
              {['NGN', 'USD', 'EUR', 'GBP'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {account && form.currency !== account.currency && (
              <p className="mt-stat-sub">
                Differs from {account.name} ({account.currency}) — the original{' '}
                {formatOriginal(form.amount || '0', form.currency)} will be preserved as entered.
              </p>
            )}
          </div>
          <div className="mt-field">
            <label htmlFor="txn-date">Date *</label>
            <input
              id="txn-date"
              className="mt-input"
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              required
            />
            {errors.date && <p className="mt-error">{errors.date}</p>}
          </div>
          <div className="mt-field">
            <label htmlFor="txn-pay">Payment method (optional)</label>
            <input
              id="txn-pay"
              className="mt-input"
              value={form.payment_method}
              onChange={(e) => set('payment_method', e.target.value)}
              placeholder="Cash, transfer, card…"
            />
          </div>
          <div className="mt-field">
            <label htmlFor="txn-note">Note (optional)</label>
            <input
              id="txn-note"
              className="mt-input"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Dinner, salary…"
            />
          </div>
        </>
      )}
      {serverError && <p className="mt-error">{serverError}</p>}
      {!initial && account && !account.is_business && (form.type === 'income' || form.type === 'expense') && (
        <div className="mt-field">
          <label>
            <input
              type="checkbox"
              checked={form.business_override}
              onChange={(e) => set('business_override', e.target.checked)}
            />{' '}
            Business transaction — funded from this personal account, counted in business reports only
          </label>
        </div>
      )}
      <p style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="mt-btn" style={{ width: 'auto' }} type="submit" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Save'}
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
