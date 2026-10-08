import { describe, expect, it } from 'vitest'
import { getDayPart, greetingFor } from './greeting'

describe('greeting', () => {
  it('splits the day into morning/afternoon/evening', () => {
    expect(getDayPart(8)).toBe('morning')
    expect(getDayPart(13)).toBe('afternoon')
    expect(getDayPart(20)).toBe('evening')
  })

  it('greets the user by first name', () => {
    expect(greetingFor('Chibuzor Okafor', new Date(2026, 0, 1, 9))).toBe(
      'Good morning, Chibuzor 👋',
    )
    expect(greetingFor('Ada', new Date(2026, 0, 1, 15))).toBe('Good afternoon, Ada 👋')
  })
})
