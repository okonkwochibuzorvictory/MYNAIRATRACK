import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`mt-card ${className}`.trim()}>{children}</section>
}

export function SectionHead({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mt-section-head">
      <h2>{title}</h2>
      {action}
    </div>
  )
}

export function SoonBadge() {
  return <span className="mt-soon">Coming soon</span>
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: string
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="mt-empty">
      <div className="mt-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}
