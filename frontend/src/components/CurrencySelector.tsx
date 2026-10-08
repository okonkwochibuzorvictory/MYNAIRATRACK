import { CURRENCY_OPTIONS } from '../lib/currency'

interface Props {
  value: string
  onChange: (value: string) => void
  id?: string
}

export default function CurrencySelector({ value, onChange, id = 'currency-selector' }: Props) {
  return (
    <label htmlFor={id}>
      Currency{' '}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {CURRENCY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
