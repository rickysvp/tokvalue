'use client'
import React, { useMemo } from 'react'
import { DashboardShell } from '@/components/dashboard-v2/DashboardShell'
import { GreetingBar } from '@/components/dashboard-v2/home/GreetingBar'
import { KPIRow } from '@/components/dashboard-v2/home/KPIRow'
import { BottleneckMilestone } from '@/components/dashboard-v2/home/BottleneckMilestone'
import { TodayTasks, type DashboardTask } from '@/components/dashboard-v2/home/TodayTasks'
import { PillarScorecard } from '@/components/dashboard-v2/home/PillarScorecard'
import { ProgressStrip, type HistoryNode } from '@/components/dashboard-v2/home/ProgressStrip'
import { useDashboardData } from '@/components/dashboard/dashboard-data'

const TIER_WORD: Record<string, string> = {
  S: 'Premium Value',
  A: 'Premium Value',
  B: 'Growth Value',
  C: 'Growth Value',
  D: 'Developing Value',
  E: 'Developing Value',
  F: 'Early Value',
}

export default function DashboardHomePage() {
  const data = useDashboardData()
  const latest = data.latest
  const balance = data.balance

  const email = balance?.email ?? ''
  const nickname = latest?.nickname ?? email.split('@')[0] ?? 'there'
  const user = { name: nickname, email }

  const username = latest?.username ?? nickname.toLowerCase().replace(/\s+/g, '') ?? 'account'
  const accounts = useMemo(() => [username], [username])

  const firstName = nickname.split(' ')[0] || 'there'

  const { today, tomorrow } = useMemo(() => {
    const t: DashboardTask[] = []
    const tom: DashboardTask[] = []
    if (!latest) {
      t.push({
        id: 'eval-first',
        title: 'Evaluate your first account',
        subtext: 'Start here to unlock your value snapshot',
        priority: 'p0',
        linkArrow: '↗ Start',
      })
    } else {
      t.push({
        id: 'h1',
        title: 'Review your latest report',
        subtext: 'Open report to see deal pricing and 30-day plan',
        priority: 'p0',
        linkArrow: '↗ Report',
        actions: [
          {
            type: 'link',
            label: 'Open report',
            href: `/evaluate/${encodeURIComponent(username)}`,
          },
        ],
      })
      t.push({
        id: 'h2',
        title: 'Check this week\'s focus tasks',
        subtext: 'Growth plan · Week 1',
        priority: 'p1',
        linkArrow: 'Growth →',
      })
    }
    return { today: t, tomorrow: tom }
  }, [latest, username])

  const pillars = useMemo(() => {
    const raw = latest?.pillars?.pillars ?? []
    return raw.map(p => ({
      name: p.name,
      score: Math.round(p.score),
      status: pillarStatusOf(p.status),
    }))
  }, [latest])

  const progress: HistoryNode[] = useMemo(() => {
    if (!latest) return []
    const nodes: HistoryNode[] = []
    if (latest.previousReview) {
      const prev = latest.previousReview as any
      const prevDate = prev.computedAt ? new Date(prev.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Prev'
      const prevMid = prev.totalValue?.mid ?? prev.businessValueMid ?? 0
      const prevTier = prev.tier ? TIER_WORD[prev.tier] : undefined
      nodes.push({
        dateLabel: prevDate,
        valueLabel: prevMid > 0 ? `$${Math.round(prevMid / 1000)}K` : '—',
        tier: prevTier,
      })
    }
    const currDate = latest.computedAt ? new Date(latest.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Now'
    const currMid = latest.totalValue?.mid ?? 0
    const currTier = latest.tier ? TIER_WORD[latest.tier] : undefined
    nodes.push({
      dateLabel: currDate,
      valueLabel: currMid > 0 ? `$${Math.round(currMid / 1000)}K` : '—',
      tier: currTier,
      isCurrent: true,
    })
    return nodes
  }, [latest])

  const blocker = latest?.primaryRateBlocker
    ? {
        label: (latest.primaryRateBlocker as any).label ?? String(latest.primaryRateBlocker),
        fix: (latest.primaryRateBlocker as any).fix ?? 'See growth plan for details.',
        pillarWeekAnchor: 'week1',
      }
    : {
        label: 'Run a new evaluation',
        fix: 'Evaluate an account to identify your specific bottleneck.',
        pillarWeekAnchor: '',
      }

  const milestone = {
    title: latest ? 'Review report & unlock deal pricing' : 'Land your first paid deal',
    description: latest ? 'Open the full report to see your negotiating numbers.' : 'Hit $500/mo minimum in brand deals before scaling.',
    suggestCta: latest
      ? {
          label: 'Open report',
          href: `/evaluate/${encodeURIComponent(username)}`,
        }
      : undefined,
  }

  const rankPercentile = latest?.score ? Math.max(1, Math.min(99, 100 - latest.score)) : 50
  const tierWord = latest?.tier ? TIER_WORD[latest.tier] ?? '' : ''
  const creditsRemaining = balance?.credits ?? 0
  const lastPurchase = balance?.purchases?.[0]
  const packLabel = lastPurchase
    ? lastPurchase.packageId === 'pack1'
      ? '$9 pack'
      : lastPurchase.packageId === 'pack6'
        ? '$29 Growth pack'
        : lastPurchase.packageId === 'pack30'
          ? '$99 Studio pack'
          : `${lastPurchase.credits}-pack`
    : ''
  const date = latest?.computedAt
    ? new Date(latest.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : undefined

  return (
    <DashboardShell page="home" user={user}>
      <div className="max-w-[720px] mx-auto flex flex-col gap-6">
        <GreetingBar
          firstName={firstName}
          currentUsername={username}
          accounts={accounts}
          latestEvaluationAvailable={!!latest}
        />
        <KPIRow
          value={{ mid: latest?.totalValue?.mid ?? 0 }}
          rank={{ percentile: rankPercentile, tierWord }}
          credits={{ remaining: creditsRemaining, packLabel }}
          date={date}
        />
        <BottleneckMilestone blocker={blocker} milestone={milestone} />
        <TodayTasks tasks={today} tomorrow={tomorrow} />
        {pillars.length >= 6 && (
          <PillarScorecard pillars={pillars as any} username={username} reportHref="#pillars" />
        )}
        {progress.length >= 2 && <ProgressStrip history={progress} />}
      </div>
    </DashboardShell>
  )
}

function pillarStatusOf(s: string): 'strong' | 'on-track' | 'needs-attention' | 'early' {
  if (!s) return 'on-track'
  const x = s.toLowerCase()
  if (x.includes('strong')) return 'strong'
  if (x.includes('attention') || x.includes('weak')) return 'needs-attention'
  if (x.includes('early')) return 'early'
  return 'on-track'
}
