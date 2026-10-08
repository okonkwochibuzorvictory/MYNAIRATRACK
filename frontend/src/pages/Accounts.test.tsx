import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Accounts from './Accounts'

describe('Accounts page', () => {
  it('renders the accounts heading and explainer', () => {
    const html = renderToString(<Accounts />)
    expect(html).toContain('Your accounts')
    expect(html).toContain('The wallets where your money lives')
  })
})
