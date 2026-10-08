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
