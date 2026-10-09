import AppShell from '../components/AppShell'
import { EmptyState, SoonBadge } from '../components/ui'

const COPY: Record<string, { title: string; heading: string; text: string; icon: string }> = {
  business: {
    title: 'Business',
    heading: 'Business Mode is coming soon',
    text: 'Business accounts, sales, expenses and per-currency profit will live here, separate from personal money.',
    icon: '▣',
  },
}

export default function Placeholder({ page }: { page: string }) {
  const copy = COPY[page] ?? {
    title: 'Coming soon',
    heading: 'Coming soon',
    text: 'This section arrives in a later phase.',
    icon: '○',
  }
  return (
    <AppShell active={page} title={copy.title} subtitle="This section arrives in a later phase.">
      <section className="mt-card">
        <EmptyState
          icon={copy.icon}
          title={copy.heading}
          text={copy.text}
          action={
            <a className="mt-btn" style={{ width: 'auto', textDecoration: 'none' }} href="#/dashboard">
              Back to dashboard
            </a>
          }
        />
        <p style={{ textAlign: 'center' }}>
          <SoonBadge />
        </p>
      </section>
    </AppShell>
  )
}
