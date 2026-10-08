import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Categories from './Categories'

describe('Categories page', () => {
  it('renders the header, tabs and add action', () => {
    const html = renderToString(<Categories />)
    expect(html).toContain('Organize your income and expenses')
    expect(html).toContain('Expense Categories')
    expect(html).toContain('Income Categories')
    expect(html).toContain('Add Category')
  })
})
