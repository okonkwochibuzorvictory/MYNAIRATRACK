import { describe, expect, it } from 'vitest'
import { getDayPart, greetingChanged, greetingFor, msUntilNextGreetingChange } from './greeting'

function at(hour: number, minute = 0): Date {
  return new Date(2026, 0, 1, hour, minute, 0, 0)
}

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

  it('uses 12:00 AM – 11:59 AM for morning', () => {
    for (const hour of [0, 2, 4, 5, 8, 11]) {
      expect(getDayPart(hour)).toBe('morning')
    }
    expect(greetingFor('Victory', at(0, 30))).toBe('Good morning, Victory 👋')
    expect(greetingFor('Victory', at(4, 48))).toBe('Good morning, Victory 👋')
    expect(greetingFor('Victory', at(11, 59))).toBe('Good morning, Victory 👋')
  })

  it('uses 12:00 PM – 4:59 PM for afternoon', () => {
    expect(getDayPart(12)).toBe('afternoon')
    expect(greetingFor('Victory', at(12, 0))).toBe('Good afternoon, Victory 👋')
    expect(greetingFor('Victory', at(16, 59))).toBe('Good afternoon, Victory 👋')
    expect(getDayPart(17)).toBe('evening')
    expect(greetingFor('Victory', at(17, 0))).toBe('Good evening, Victory 👋')
  })

  it('uses 5:00 PM – 11:59 PM for evening', () => {
    for (const hour of [17, 19, 21, 23]) {
      expect(getDayPart(hour)).toBe('evening')
    }
    expect(greetingFor('Victory', at(19, 30))).toBe('Good evening, Victory 👋')
  })

  it('handles a missing profile name gracefully', () => {
    expect(greetingFor('', at(9))).toBe('Good morning, there 👋')
    expect(greetingFor('   ', at(21))).toBe('Good evening, there 👋')
  })

  it('schedules the next greeting change at period boundaries', () => {
    expect(msUntilNextGreetingChange(at(11, 59))).toBeGreaterThan(0)
    expect(msUntilNextGreetingChange(at(11, 59))).toBeLessThanOrEqual(60 * 1000)
    expect(msUntilNextGreetingChange(at(16, 59))).toBeLessThanOrEqual(60 * 1000)
    // Mid-period waits hours, not seconds.
    expect(msUntilNextGreetingChange(at(9, 0))).toBe(3 * 60 * 60 * 1000)
    expect(msUntilNextGreetingChange(at(20, 0))).toBe(4 * 60 * 60 * 1000)
  })

  it('detects when the greeting period changed, including clock corrections', () => {
    expect(greetingChanged(at(11, 59), at(12, 0))).toBe(true)
    expect(greetingChanged(at(16, 59), at(17, 0))).toBe(true)
    expect(greetingChanged(at(23, 59), at(0, 0))).toBe(true)
    expect(greetingChanged(at(9, 0), at(9, 30))).toBe(false)
    // OS clock jumping backward across periods (e.g. NTP correction).
    expect(greetingChanged(at(16, 42), at(4, 48))).toBe(true)
  })
})
