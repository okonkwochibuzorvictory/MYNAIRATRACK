import { useEffect, useState } from 'react'
import {
  fetchPreferences,
  updateBudgetPrefs,
  updateMasterPrefs,
  type Prefs,
} from '../lib/insights'

const THRESHOLDS: Array<{ key: keyof Prefs; label: string }> = [
  { key: 'alert_50', label: '50%' },
  { key: 'alert_80', label: '80%' },
  { key: 'alert_100', label: '100%' },
  { key: 'alert_over', label: 'Over budget' },
]

export default function AlertPrefs({ budgetId }: { budgetId?: number }) {
  const [master, setMaster] = useState<Prefs | null>(null)
  const [local, setLocal] = useState<Prefs | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPreferences()
      .then((p) => {
        setMaster(p.master)
        setLocal(p.budgets.find((b) => b.budget_id === budgetId) ?? null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load preferences')
      })
  }, [budgetId])

  async function toggleMaster() {
    if (!master) return
    setError('')
    try {
      const updated = await updateMasterPrefs({ alerts_enabled: !master.alerts_enabled })
      setMaster(updated.master)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences')
    }
  }

  async function toggleThreshold(key: keyof Prefs) {
    if (budgetId === undefined) return
    setError('')
    try {
      const current = local?.[key] ?? master?.[key] ?? (key === 'alert_50' ? false : true)
      const updated = await updateBudgetPrefs(budgetId, { [key]: !current })
      setLocal(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences')
    }
  }

  if (!master) return null

  return (
    <div>
      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.9rem' }}>
        <input type="checkbox" checked={master.alerts_enabled} onChange={toggleMaster} />
        Budget alerts on
      </label>
      {budgetId !== undefined && master.alerts_enabled && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {THRESHOLDS.map((t) => {
            const checked =
              local !== null && typeof local[t.key] === 'boolean'
                ? Boolean(local[t.key])
                : Boolean(master[t.key]);
            return (
              <label key={t.key} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.88rem' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleThreshold(t.key)} />
                {t.label}
              </label>
            )
          })}
        </div>
      )}
      {error && <p className="mt-error">{error}</p>}
    </div>
  )
}
