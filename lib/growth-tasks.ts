// ── B6：Growth Plan 规则模板任务引擎（Spec §9）──
// 纯函数、零 LLM、零副作用：从 evaluation 派生 ≤5 条可执行任务。
// 数量/置信度按 Spec §9 数量表；每条 evidence 必须绑定具体数字或视频引用，禁泛化建议。

import type {
  ContentCadence, Evaluation, GrowthTask, GrowthPlanV2, PillarKey, Post, TaskConfidence,
} from '../types'
import { buildPillars, nicheClarityOf, riskDiscountPct } from './pillar'

const DAY_MS = 86_400_000

/** Spec §9 数量表：有效视频数 → 任务数上限 + 基准置信度 */
function tierOf(videoCount: number): { cap: number; band: TaskConfidence } {
  if (videoCount >= 30) return { cap: 5, band: 'medium_high' }
  if (videoCount >= 10) return { cap: 3, band: 'medium' }
  if (videoCount >= 5) return { cap: 2, band: 'medium_low' }
  return { cap: 1, band: 'low' }
}

const CONFIDENCE_ORDER: TaskConfidence[] = ['low', 'medium_low', 'medium', 'medium_high']

const kebabCase = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US')

// 与 pillar.ts nicheClarityOf 同口径的 hashtag 聚类补充统计：
// nicheClarityOf 未暴露 top3Share/distinct，评分与 topTags 仍以支柱层为准。
const HASHTAG_RE = /#[\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g

function hashtagShare(posts: Post[]): { top3Share: number; distinct: number; total: number } {
  const counts: Record<string, number> = {}
  let total = 0
  for (const post of posts) {
    for (const tag of (post.desc || '').match(HASHTAG_RE) || []) {
      const k = tag.toLowerCase()
      counts[k] = (counts[k] || 0) + 1
      total += 1
    }
  }
  if (!total) return { top3Share: 0, distinct: 0, total: 0 }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top3 = sorted.slice(0, 3).reduce((s, [, n]) => s + n, 0)
  return { top3Share: top3 / total, distinct: sorted.length, total }
}

interface Candidate {
  ruleIndex: number
  /** 修正弱度：正向支柱 = 分数；risk = 100 − 风险分（越小越优先截断保留） */
  weakness: number
  task: Omit<GrowthTask, 'key'>
}

export function buildGrowthTasks(input: { evaluation: Evaluation }): GrowthPlanV2 {
  const { evaluation } = input
  const posts = evaluation.posts ?? []
  const metrics = evaluation.metrics
  const cadence: ContentCadence | undefined = evaluation.contentCadence
  const risks = evaluation.riskFlags ?? []

  // 有效视频数：账号总量优先（与 confidenceBandOf 口径一致），缺失时退回抓取样本
  const fetchedCount = posts.length
  const videoCount = evaluation.videoCount > 0 ? evaluation.videoCount : fetchedCount

  // 支柱分数：优先用已构建的 pillars（B5a）；旧数据缺省时纯函数重建
  const pillars = evaluation.pillars?.pillars?.length
    ? evaluation.pillars.pillars
    : buildPillars({ dims: evaluation.dimensions, metrics, posts, risks }).pillars
  const scoreOf = (key: PillarKey): number => pillars.find(p => p.key === key)?.score ?? 50

  // ── 降档校验信号 ──
  const times = posts.map(p => p.createTime)
  const spanDays = times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / DAY_MS : 0
  const shortSpan = spanDays < 14

  let avgPlays = metrics.effectiveAvgPlays || 0
  let peakPlays = metrics.effectivePeakPlays || 0
  if (fetchedCount > 0 && (!avgPlays || !peakPlays)) {
    const plays = posts.map(p => p.playCount)
    if (!avgPlays) avgPlays = plays.reduce((s, n) => s + n, 0) / plays.length
    if (!peakPlays) peakPlays = Math.max(...plays)
  }
  const outlier = avgPlays > 0 && peakPlays > avgPlays * 8

  // ── 数量/置信度（Spec §9 数量表 + 降档）──
  const tier = tierOf(videoCount)
  let bandIndex = CONFIDENCE_ORDER.indexOf(tier.band)
  if (shortSpan) bandIndex -= 1
  if (outlier) bandIndex -= 1
  const confidence = CONFIDENCE_ORDER[Math.max(0, bandIndex)]
  const cap = shortSpan ? Math.min(tier.cap, 2) : tier.cap

  const limitedData = fetchedCount < 5 || videoCount < 10

  // ── 规则模板候选（按最弱支柱优先截断）──
  const candidates: Candidate[] = []

  // 规则 1：niche_clarity < 45 → 主题聚焦
  if (scoreOf('niche_clarity') < 45) {
    const niche = nicheClarityOf(posts)
    const share = hashtagShare(posts)
    candidates.push({
      ruleIndex: 1,
      weakness: scoreOf('niche_clarity'),
      task: {
        title: 'Focus your next 10 videos on your top 3 hashtag themes',
        whyThisMatters: `Your recent hashtags spread across ${Math.max(share.distinct, 1)} different themes, so the recommendation system gets mixed signals about who your content is for. Concentrating on proven themes builds a recognizable content identity.`,
        evidence: niche.topTags.length
          ? `Top 3 hashtags (${niche.topTags.join(', ')}) cover only ${Math.round(share.top3Share * 100)}% of ${share.total} hashtags across ${fetchedCount} recent videos — Niche Clarity scored ${scoreOf('niche_clarity')}/100.`
          : `No hashtags detected across ${fetchedCount} recent videos — Niche Clarity scored ${scoreOf('niche_clarity')}/100 and no repeat theme can be confirmed.`,
        expectedImpact: 'Sharpens Niche Clarity — consistent themes help the algorithm match your videos to a stable audience pool.',
        measureTarget: ['niche_clarity'],
        confidence,
      },
    })
  }

  // 规则 2：content_consistency < 45 或断更 → 发布节奏
  const daysSince = typeof metrics.daysSinceLastPost === 'number' ? metrics.daysSinceLastPost : 0
  const cadenceBroken = daysSince > 7 || cadence?.postingRhythm === 'irregular'
  if (scoreOf('content_consistency') < 45 || cadenceBroken) {
    const bestDay = cadence?.bestWeekdays?.[0]
    const bestSlot = cadence?.bestTimeSlots?.[0]
    const rhythm = cadence?.postingRhythm ?? 'unknown'
    candidates.push({
      ruleIndex: 2,
      weakness: scoreOf('content_consistency'),
      task: {
        title: 'Lock a fixed publishing slot on your 2 highest-engagement weekdays',
        whyThisMatters: `Uploads currently arrive unpredictably (rhythm: ${rhythm}, last upload ${Math.round(daysSince)} day(s) ago), so viewers have no reason to check back. A fixed weekly slot turns sporadic views into a returning habit.`,
        evidence: bestDay
          ? `Last upload was ${Math.round(daysSince)} day(s) ago; ${bestDay.weekday} uploads${bestSlot ? ` around ${bestSlot.hour}:00` : ''} average ${bestDay.engagementRate}% engagement vs ${typeof metrics.engagementRate === 'number' ? metrics.engagementRate.toFixed(1) : 'n/a'}% account average — Content Consistency scored ${scoreOf('content_consistency')}/100.`
          : `Last upload was ${Math.round(daysSince)} day(s) ago and no slot pattern is detectable yet — Content Consistency scored ${scoreOf('content_consistency')}/100.`,
        expectedImpact: 'Stabilizes Content Consistency — regular slots reduce play volatility and rebuild the upload rhythm the algorithm rewards.',
        measureTarget: ['content_consistency'],
        confidence,
      },
    })
  }

  // 规则 3：audience_quality < 60 → 互动格式
  if (scoreOf('audience_quality') < 60) {
    const topPost = posts.length
      ? posts.reduce((a, b) => (b.likeCount + b.commentCount + b.shareCount) > (a.likeCount + a.commentCount + a.shareCount) ? b : a)
      : undefined
    const er = typeof metrics.engagementRate === 'number' ? metrics.engagementRate : 0
    candidates.push({
      ruleIndex: 3,
      weakness: scoreOf('audience_quality'),
      task: {
        title: 'Add a comment-prompt question to your next 5 videos',
        whyThisMatters: `Comments weigh more than passive likes in audience scoring, and your ${er.toFixed(1)}% engagement rate signals viewers watch without responding. A direct question in the first 3 seconds invites replies.`,
        evidence: topPost
          ? `Engagement rate is ${er.toFixed(1)}%; your most-engaged video pulled ${fmtInt(topPost.likeCount)} likes and ${fmtInt(topPost.commentCount)} comments — Audience Quality scored ${scoreOf('audience_quality')}/100, below the 60 bar sponsors screen for.`
          : `Engagement rate is ${er.toFixed(1)}% — Audience Quality scored ${scoreOf('audience_quality')}/100, below the 60 bar sponsors screen for.`,
        expectedImpact: 'Raises Audience Quality — comment activity lifts the engagement component of your pillar score.',
        measureTarget: ['audience_quality'],
        confidence,
      },
    })
  }

  // 规则 4：growth_momentum < 45 → 系列化复制爆款
  if (scoreOf('growth_momentum') < 45) {
    const topPost = posts.length ? posts.reduce((a, b) => (b.playCount > a.playCount ? b : a)) : undefined
    const topPlays = topPost?.playCount ?? peakPlays
    candidates.push({
      ruleIndex: 4,
      weakness: scoreOf('growth_momentum'),
      task: {
        title: 'Turn your top recent video into a 3-part series',
        whyThisMatters: 'One-off spikes fade within days, and sequels recapture the viewers your best video earned. Series content also trains new viewers to return to your profile.',
        evidence: topPlays > 0
          ? `Your top recent video reached ${fmtInt(topPlays)} plays vs your ${fmtInt(avgPlays)} average — Growth Momentum scored ${scoreOf('growth_momentum')}/100.`
          : `Growth Momentum scored ${scoreOf('growth_momentum')}/100 with no play data available to confirm a rising trend.`,
        expectedImpact: 'Boosts Growth Momentum — follow-up videos convert a one-time spike into a rising recent-vs-older play trend.',
        measureTarget: ['growth_momentum'],
        confidence,
      },
    })
  }

  // 规则 5：brand_readiness < 60 → 商业证据
  if (scoreOf('brand_readiness') < 60) {
    const brand = evaluation.brandPotential
    const cats = brand?.suitableCategories ?? []
    const cpm = brand?.estimatedCPM
    candidates.push({
      ruleIndex: 5,
      weakness: scoreOf('brand_readiness'),
      task: {
        title: 'Publish 3 proof videos for your top brand-fit category',
        whyThisMatters: `Brands buy proof, not potential — category fit${cats.length ? ` (${cats.slice(0, 2).join(', ')})` : ''} must be visible on-profile as review or demo content before sponsors can justify a rate.`,
        evidence: `Brand fit: ${cats.length ? cats.slice(0, 3).join(', ') : 'no category detected'}${cpm ? ` at an estimated CPM of $${cpm}` : ''} — Brand Readiness scored ${scoreOf('brand_readiness')}/100, below the 60 threshold sponsors screen for.`,
        expectedImpact: 'Lifts Brand Readiness — visible commerce content moves you from fit to proven in brand screenings.',
        measureTarget: ['brand_readiness'],
        confidence,
      },
    })
  }

  // 规则 6：risk > 0 → 风险修复（evidence 绑定最高级 riskFlag）
  const riskScore = scoreOf('risk')
  if (risks.length > 0 && riskScore > 0) {
    const weight = { high: 3, medium: 2, low: 1 } as const
    const top = [...risks].sort((a, b) => weight[b.level] - weight[a.level])[0]
    candidates.push({
      ruleIndex: 6,
      weakness: 100 - riskScore,
      task: {
        title: 'Resolve your highest-severity risk flag before scaling content',
        whyThisMatters: 'Active risk flags apply a direct discount to your estimated value — clearing them is the fastest way to stop losing worth you have already built.',
        evidence: `Highest-severity flag: "${top.label}" (${top.level}) — risk score ${riskScore}/100 currently discounts your estimated value by ${Math.round(riskDiscountPct(riskScore))}%.`,
        expectedImpact: 'Reduces Risk — each cleared flag directly narrows the risk discount applied to your valuation.',
        measureTarget: ['risk'],
        confidence,
      },
    })
  }

  // ── 最弱优先排序 → 截断 → 稳定 key ──
  candidates.sort((a, b) => (a.weakness - b.weakness) || (a.ruleIndex - b.ruleIndex))
  const tasks: GrowthTask[] = candidates.slice(0, cap).map(c => ({
    ...c.task,
    key: `${kebabCase(c.task.title)}-${c.ruleIndex}`,
  }))

  // 单条异常爆款（peak > 8× avg）→ 降一档已在上方生效，此处逐条 evidence 注明
  if (outlier) {
    const mult = (peakPlays / avgPlays).toFixed(1)
    for (const t of tasks) {
      t.evidence += ` Data note: your peak video (${fmtInt(peakPlays)} plays) is ${mult}x your average — a single outlier, so confidence is downgraded.`
    }
  }

  // 首评（Spec §8 Baseline 模式）→ 全部任务标注校准语义
  if (evaluation.baselineReview) {
    for (const t of tasks) {
      t.baseline = true
      t.whyThisMatters = `Baseline calibration: this is your first review, so this task sets the reference point. ${t.whyThisMatters}`
    }
  }

  return { tasks, limitedData }
}
