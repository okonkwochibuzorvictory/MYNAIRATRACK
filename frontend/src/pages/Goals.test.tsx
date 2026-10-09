import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Goals from './Goals'

describe('Goals page', () => {
  it('renders savings and goals sections with add actions', () => {
    const html = renderToString(<Goals />)
    expect(html).toContain('stay focused on what you')
    expect(html).toContain('Savings Targets')
    expect(html).toContain('Financial Goals')
    expect(html).toContain('Add Savings Target')
    expect(html).toContain('Add Financial Goal')
  })
})
