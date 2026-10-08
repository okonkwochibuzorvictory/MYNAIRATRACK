import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Budgets from './Budgets'

describe('Budgets page', () => {
  it('renders the header and create action', () => {
    const html = renderToString(<Budgets />)
    expect(html).toContain('Plan spending by category')
    expect(html).toContain('Create Budget')
    expect(html).toContain('Your budgets')
  })
})
