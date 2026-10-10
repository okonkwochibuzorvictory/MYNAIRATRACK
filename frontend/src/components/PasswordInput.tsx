import { useState } from 'react'

interface Props {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}

export default function PasswordInput({ id, label, value, onChange, required }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="mt-field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          id={id}
          className="mt-input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="mt-btn mt-btn-secondary"
          style={{ width: 'auto', whiteSpace: 'nowrap' }}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
