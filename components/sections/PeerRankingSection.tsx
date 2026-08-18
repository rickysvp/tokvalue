'use client'

import { PeerRanking } from '@/types'
import { BarChart3, Trophy, TrendingUp, HelpCircle } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import { useState } from 'react'

interface Props {
  ranking: PeerRanking
}

/** 每项指标的人话解释：含义 + 对谈判/商业价值的意义 */
const METRIC_EXPLANATIONS: Record<string, { what: string; whyItMatters: string }> = {
  'Avg. Plays': {
    what: 'Average views per video on your recent, mature posts (new posts excluded, so spikes don\'t skew it).',
    whyItMatters: 'This is the #1 input for every brand\'s offer. 1M avg plays = 1M campaign impressions they can plan around. If this is strong, lead with it when pitching — it\'s the easiest number to defend.',
  },
  'Avg Views': {
    what: 'Average views per video on your recent, mature posts.',
    whyItMatters: 'Brands budget on reach — 1M views is 1M campaign impressions they can plan around. Strong averages let you anchor your rate higher from the first message.',
  },
  'Engagement Rate': {
    what: '(Likes + Comments + Shares + Saves) ÷ Plays, on your recent mature content. Benchmarked against accounts in your follower bucket.',
    whyItMatters: 'Engagement drives purchase intent. High ER tells brands \"your viewers actually react\" — it justifies a 1.5–2× rate over accounts with the same plays but lower interaction. Low ER is the most common reason rates get cut in the first round of negotiation.',
  },
  'ER': {
    what: 'Engagement rate — (likes + comments + shares + saves) ÷ plays on recent mature posts.',
    whyItMatters: 'High ER = \"your viewers actually act.\" This is the easiest way to justify 1.5–2× more than a same-reach account with low interaction.',
  },
  'Follower Count': {
    what: 'Current total followers on the profile. Compared only against creators in the same category + follower tier.',
    whyItMatters: 'Follower count is the headline number every brand sees first, and every media kit leads with it. Higher tier unlocks brands with bigger budgets — but only if engagement and play counts back it up.',
  },
  'Followers': {
    what: 'Total profile followers, compared only within your category and size bucket.',
    whyItMatters: 'The headline number every brand\'s media list gets sorted by. Higher size tier unlocks bigger-budget brands — but only if engagement backs it up.',
  },
  'Consistency Score': {
    what: 'How stable your posting cadence and play counts have been over the last 60–90 days. Penalises gaps, sudden stops, and extreme post-to-post view swings.',
    whyItMatters: 'Brands buy predictability. An account that reliably hits 500K/video every week beats one that alternates 100K and 3M. Consistency removes their biggest deal-risk (campaign flop) and gets you closer to flat-rate pricing instead of \"trial post\" offers.',
  },
  'Content Stability': {
    what: 'How steady your posting cadence and play counts have been.',
    whyItMatters: 'Brands pay a premium for predictability. Reliable performance removes their biggest deal-risk (campaign flop) and gets you flat-rate pricing instead of trial offers.',
  },
  'Growth Rate': {
    what: 'Follower and plays trajectory over the last 60 days, vs your own historical baseline.',
    whyItMatters: 'A growing account can pitch \"momentum pricing.\" Brands want to jump on rising creators before their rate goes up — so even if your current tier is modest, strong Growth Rate lets you frame yourself as an early, smart buy.',
  },
  'Recent Growth': {
    what: 'Follower & play momentum vs your own 60-day baseline.',
    whyItMatters: 'Brands jump on rising creators before rates go up. Even from a modest tier, strong momentum lets you pitch yourself as an \"early, smart buy.\"',
  },
  'Commercial Fit': {
    what: 'Blend of content category, audience geography, engagement quality, and profile completeness — how \"buyable\" the account looks to a brand manager skimming it for 10 seconds.',
    whyItMatters: 'This is the \"would we book them?\" flag. Top 20% on this metric usually get shortlisted first, skip the trial-post step, and can quote 20–40% above the same-tier median because you look like less work for the agency.',
  },
  'Brand Fit': {
    what: 'How \"buyable\" the account looks in a 10-second skim — category, region, audience, and profile polish.',
    whyItMatters: 'Top 20% here skip trial-post steps and usually get 20–40% above the same-tier median, because you look like less work for the agency.',
  },
  'Play Reach': {
    what: 'How many viewers your videos reach, beyond just your follower list — captures For-You-Page distribution.',
    whyItMatters: 'Strong FYP reach means your audience outgrows your follower count. This is the strongest defence against the \"too small for our budget\" objection.',
  },
  'Traffic Quality': {
    what: 'Follower-to-play ratio plus comment/share/save signals — measures whether your audience actually reacts, not just scrolls past.',
    whyItMatters: 'Brands convert reacting audiences, not passive ones. Strong traffic quality is your best evidence for a higher CPM or non-capped fee.',
  },
}

function lookup(metric: string) {
  if (METRIC_EXPLANATIONS[metric]) return METRIC_EXPLANATIONS[metric]
  // 去掉 [DEMO] / demo 前缀、前后缀空白，统一比较字形（点号 / 空格 / 大小写都忽略）
  const norm = (s: string) =>
    s
      .replace(/\[DEMO\]/gi, '')
      .replace(/demo/gi, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const m = norm(metric)
  if (!m) return null
  for (const key of Object.keys(METRIC_EXPLANATIONS)) {
    const k = norm(key)
    if (!k) continue
    if (m === k) return METRIC_EXPLANATIONS[key]
    if (m.includes(k) || k.includes(m)) return METRIC_EXPLANATIONS[key]
  }
  return null
}

export function PeerRankingSection({ ranking }: Props) {
  const { dict } = useI18n()
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="h-5 w-5 text-[#00F2EA]" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">{dict.evaluation.peerRanking.title}</h3>
      </div>

      {/* Overall Rank Hero */}
      <div className="rounded-xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00F2EA]/20 to-[#00F2EA]/5 flex items-center justify-center border border-[#00F2EA]/20">
              <Trophy className="h-7 w-7 text-[#00F2EA]" />
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">{ranking.peerGroupDescription}</div>
            <div className="text-3xl font-black text-[#00F2EA]">{ranking.tierLabel}</div>
            <div className="text-xs text-neutral-500 mt-1">{dict.evaluation.peerRanking.overallPercentile}</div>
          </div>
        </div>
      </div>

      {/* Ranking Breakdown with ? tooltips */}
      <div className="mb-4">
        <div className="text-xs text-neutral-500 mb-4 uppercase tracking-wider">{dict.evaluation.peerRanking.dimensionBreakdown}</div>
        <div className="space-y-3.5">
          {ranking.rankingBreakdown.map((item, idx) => {
            const info = lookup(item.metric)
            return (
              <MetricRow key={idx} metric={item.metric} value={item.value} percentile={item.percentile} barColor={item.barColor} info={info} />
            )
          })}
        </div>
      </div>

      {/* Insight */}
      <div className="flex items-start gap-2 pt-4 border-t border-neutral-800">
        <TrendingUp className="h-4 w-4 text-neutral-500 mt-0.5 shrink-0" />
        <p className="text-xs text-neutral-500">{ranking.insight}</p>
      </div>
    </div>
  )
}

function MetricRow({
  metric, value, percentile, barColor, info,
}: { metric: string; value: string; percentile: number; barColor: string; info: ReturnType<typeof lookup> }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5 items-start gap-3">
        <span className="inline-flex items-center gap-1.5 text-neutral-300 leading-tight pt-0.5">
          {metric}
          {info && (
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="text-neutral-500 hover:text-[#00F2EA] transition-colors"
              aria-label={`Explain ${metric}`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-neutral-500 tabular-nums">{value}</span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: barColor }}>
            Top {Math.round(percentile)}%
          </span>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${percentile}%`, backgroundColor: barColor }}
        />
      </div>
      {info && open && (
        <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/70 p-3 text-xs space-y-2 leading-relaxed">
          <p className="text-neutral-300">
            <span className="font-semibold text-neutral-200">What it measures: </span>
            {info.what}
          </p>
          <p className="text-[#00F2EA]/90">
            <span className="font-semibold text-[#00F2EA]">Why it matters for rates: </span>
            {info.whyItMatters}
          </p>
        </div>
      )}
    </div>
  )
}
