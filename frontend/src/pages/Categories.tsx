import { useEffect, useState, type FormEvent } from 'react'
import AppShell from '../components/AppShell'
import { Card, EmptyState, SectionHead } from '../components/ui'
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
  validateCategoryForm,
  type Category,
} from '../lib/categories'

export default function Categories() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [tab, setTab] = useState<'expense' | 'income'>('expense')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [formType, setFormType] = useState('expense')
  const [formScope, setFormScope] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function reload() {
    setCategories(await fetchCategories())
  }

  useEffect(() => {
    reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load categories')
    })
  }, [])

  function openAdd() {
    setEditing(null)
    setName('')
    setFormType(tab)
    setFormScope(false)
    setFormErrors({})
    setError('')
    setMessage('')
    setShowForm(true)
  }

  function openEdit(category: Category) {
    setEditing(category)
    setName(category.name)
    setFormType(category.type)
    setFormErrors({})
    setError('')
    setMessage('')
    setShowForm(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateCategoryForm({ name, type: formType })
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (editing) {
        await updateCategory(editing.id, { name: name.trim() })
        setMessage('Category updated.')
      } else {
        await createCategory({ name: name.trim(), type: formType, is_business: formScope })
        setMessage('Category created.')
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

  async function onDelete(category: Category) {
    if (!window.confirm(`Delete "${category.name}"? Transactions using it are kept.`)) return
    setError('')
    setMessage('')
    try {
      await deleteCategory(category.id)
      setMessage('Category deleted.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const list = (categories ?? []).filter((c) => c.type === tab)
  const customCount = list.filter((c) => !c.is_default).length

  return (
    <AppShell
      active="categories"
      title="Categories"
      subtitle="Organize your income and expenses so you can understand where your money goes."
    >
      <SectionHead
        title="Your categories"
        action={
          <button type="button" className="mt-btn" style={{ width: 'auto' }} onClick={openAdd}>
            Add Category
          </button>
        }
      />
      {error && <p className="mt-error">{error}</p>}
      {message && <p className="mt-success-msg">{message}</p>}

      <div style={{ display: 'inline-flex', gap: '0.5rem', margin: '0.75rem 0' }}>
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`mt-btn ${tab === t ? '' : 'mt-btn-secondary'}`}
            style={{ width: 'auto' }}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {`${t === 'expense' ? 'Expense' : 'Income'} Categories`}
          </button>
        ))}
      </div>

      {categories === null ? (
        <p className="mt-loading">Loading categories…</p>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === 'expense' ? '◫' : '+'}
            title={tab === 'expense' ? 'No expense categories' : 'No income categories'}
            text="Default categories may still be on their way — add your first custom category to get started."
            action={
              <button type="button" className="mt-btn" onClick={openAdd}>
                Add Category
              </button>
            }
          />
        </Card>
      ) : (
        <Card>
          {customCount === 0 && (
            <p className="mt-stat-sub" style={{ marginTop: 0 }}>
              Showing default categories. Add your own custom {tab} categor
              {tab === 'expense' ? 'ies' : 'y'} any time.
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.map((c) => (
              <li
                key={c.id}
                style={{ padding: '0.7rem 0', borderTop: '1px solid var(--mt-border)' }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <strong>{c.name}</strong>{' '}
                    <span className="mt-soon" style={{ marginLeft: 0 }}>
                      {c.is_default ? 'Default' : 'Custom'}
                    </span>{' '}
                    {c.is_business && (
                      <span className="mt-soon" style={{ marginLeft: 0 }}>
                        Business
                      </span>
                    )}
                  </div>
                  {!c.is_default && (
                    <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="mt-btn mt-btn-secondary"
                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="mt-btn mt-btn-secondary"
                        style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
                        onClick={() => onDelete(c)}
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showForm && (
        <Card>
          <h2 style={{ marginTop: 0 }}>{editing ? 'Edit category' : 'Add category'}</h2>
          <form onSubmit={onSubmit}>
            <div className="mt-field">
              <label htmlFor="cat-name">Category name</label>
              <input
                id="cat-name"
                className="mt-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              {formErrors.name && <p className="mt-error">{formErrors.name}</p>}
            </div>
            <div className="mt-field">
              <label htmlFor="cat-type">Category type</label>
              {editing ? (
                <p className="mt-stat-sub">
                  {formType === 'expense' ? 'Expense' : 'Income'} — the type cannot be changed
                  after creation.
                </p>
              ) : (
                <select
                  id="cat-type"
                  className="mt-select"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              )}
              {formErrors.type && <p className="mt-error">{formErrors.type}</p>}
            </div>
            {!editing && (
              <div className="mt-field">
                <label>
                  <input
                    type="checkbox"
                    checked={formScope}
                    onChange={(e) => setFormScope(e.target.checked)}
                  />{' '}
                  Business category — shown in Business Mode forms instead of personal forms
                </label>
              </div>
            )}
            <p style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="mt-btn" style={{ width: 'auto' }} type="submit" disabled={busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Create category'}
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
