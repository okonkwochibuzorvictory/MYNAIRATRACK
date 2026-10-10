import type { FormEvent } from 'react'
import {
  ACCOUNT_TYPES,
  type AccountForm as AccountFormData,
} from '../lib/accounts'

interface Props {
  form: AccountFormData
  setForm: (form: AccountFormData) => void
  formErrors: Record<string, string>
  editing: boolean
  busy: boolean
  lockBusiness: boolean
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}

export default function AccountForm({
  form,
  setForm,
  formErrors,
  editing,
  busy,
  lockBusiness,
  onSubmit,
  onCancel,
}: Props) {
  return (
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
      {lockBusiness ? (
        <p className="mt-stat-sub">Business account — sales, business income and expenses.</p>
      ) : (
        <div className="mt-field">
          <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
            Account type
          </span>
          <label style={{ display: 'block', fontWeight: 400 }}>
            <input
              type="radio"
              name="acct-kind"
              checked={!form.is_business}
              onChange={() => setForm({ ...form, is_business: false })}
            />{' '}
            Personal — everyday spending and income
          </label>
          <label style={{ display: 'block', fontWeight: 400, marginTop: '0.35rem' }}>
            <input
              type="radio"
              name="acct-kind"
              checked={form.is_business}
              onChange={() => setForm({ ...form, is_business: true })}
            />{' '}
            Business — sales, business income and expenses
          </label>
        </div>
      )}
      <p style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="mt-btn" style={{ width: 'auto' }} type="submit" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
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
