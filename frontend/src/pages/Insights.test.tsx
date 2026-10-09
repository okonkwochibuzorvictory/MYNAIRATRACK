import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Insights from './Insights'

describe('Insights page', () => {
  it('renders the header, filters and alerts section', () => {
    const html = renderToString(<Insights />)
    expect(html).toContain('Understand your spending')
    expect(html).toContain('Spending overview')
    expect(html).toContain('Alerts')
  })
})
