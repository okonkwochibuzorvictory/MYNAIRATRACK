import AppShell from '../components/AppShell'
import { EmptyState, SoonBadge } from '../components/ui'

const COPY: Record<string, { title: string; heading: string; text: string; icon: string }> = {
  transactions: {
    title: 'Transactions',
    heading: 'Transaction tracking is coming soon',
    text: 'Quick and detailed income and expense entries will live here, always shown in their original currency.',
    icon: '⇄',
  },
  budgets: {
    title: 'Budgets',
    heading: 'Budgets are coming soon',
    text: 'Flexible and guided budgets — each in its own currency — will be created and monitored here.',
    icon: '◫',
  },
  goals: {
    title: 'Goals',
    heading: 'Goals are coming soon',
    text: 'Savings targets and financial goals, each with its own currency, will be tracked here.',
    icon: '◎',
  },
  insights: {
    title: 'Insights',
    heading: 'Insights are coming soon',
    text: 'Spending summaries and in-app budget alerts will appear here once you start tracking transactions.',
    icon: '◍',
  },
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
