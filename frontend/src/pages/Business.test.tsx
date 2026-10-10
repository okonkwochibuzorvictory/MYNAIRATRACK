import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Business, { BusinessOverview } from './Business'

describe('Business page', () => {
  it('renders the workspace header and loading state', () => {
    const html = renderToString(<Business />)
    expect(html).toContain('separate from personal finance')
    expect(html).toContain('Back to Personal Finance')
    expect(html).toContain('Loading business mode')
  })

  it('shows sales, income, expenses, and profit clearly per account', () => {
    const html = renderToString(
      <BusinessOverview
        profit={[
          { currency: 'USD', sales: '500.00', income: '100.00', expenses: '20.00', profit: '580.00' },
        ]}
        byAccount={[
          { account_id: 7, account_name: 'Shop USD', currency: 'USD', sales: '500.00', income: '100.00', expenses: '20.00', profit: '580.00' },
        ]}
        showAmounts={true}
        onToggleAmounts={() => {}}
      />,
    )
    expect(html).toContain('Shop USD')
    expect(html).toContain('Sales')
    expect(html).toContain('Business income')
    expect(html).toContain('Business expenses')
    expect(html).toContain('580')
  })
})
