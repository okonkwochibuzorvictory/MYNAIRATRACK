export function getDayPart(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function greetingFor(name: string, now: Date = new Date()): string {
  const part = getDayPart(now.getHours())
  const first = name.trim().split(/\s+/)[0] || 'there'
  if (part === 'morning') return `Good morning, ${first} 👋`
  if (part === 'afternoon') return `Good afternoon, ${first} 👋`
  return `Good evening, ${first} 👋`
}

function nextBoundaryHour(hour: number): number {
  if (hour < 12) return 12
  if (hour < 17) return 17
  return 24 + 0
}

export function msUntilNextGreetingChange(now: Date = new Date()): number {
  const target = new Date(now)
  const next = nextBoundaryHour(now.getHours())
  if (next >= 24) {
    target.setDate(target.getDate() + 1)
    target.setHours(next - 24, 0, 0, 0)
  } else {
    target.setHours(next, 0, 0, 0)
  }
  return Math.max(0, target.getTime() - now.getTime())
}

export function greetingChanged(prev: Date, next: Date): boolean {
  return getDayPart(prev.getHours()) !== getDayPart(next.getHours())
}
