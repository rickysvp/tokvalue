// Marketplace 演示库存生成器 v2
// 运行：npx vite-node --config vitest.config.ts scripts/seed-marketplace-v2.mts
//
// 原则（见 docs/superpowers/specs/2026-11-17-marketplace-sell-optimization-design.md）：
//   1. 所有估值/评分字段由 lib/scoring.ts 的 scoreProfile() 真实计算，脚本不手写任何 snapshot 数值；
//      手写的只有账号画像（粉丝量级、赛道、互动倍率、发帖节奏）。
//   2. 决定论随机（mulberry32 + 固定 seed），任何机器重跑结果完全一致。
//   3. 所有插入行 is_sample = TRUE，且因联系方式为虚构，禁止买家解锁（见 unlock 路由拦截）。
//   4. 幂等：固定 8 位数字 id + ON CONFLICT (id) DO UPDATE。
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { scoreProfile } from '@/lib/scoring'
import type { Post, RawProfile } from '@/types'

const SEED = 20261117
const TOTAL = 42
const SOLD_COUNT = 8

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(SEED)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
const uni = (lo: number, hi: number) => lo + rnd() * (hi - lo)
const logUni = (lo: number, hi: number) => Math.exp(uni(Math.log(lo), Math.log(hi)))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ── 账号画像池：20 个赛道 × 2–3 个 handle ──────────────────────────────
interface Niche { key: string; label: string; bio: string; monetization: string; handles: string[] }
const NICHES: Niche[] = [
  { key: 'finance', label: 'Finance', bio: 'Personal finance, index investing, and side-income breakdowns for US/UK audiences.', monetization: 'two affiliate programs and a paid newsletter', handles: ['moneymindset.mike', 'dividenddad', 'theetfdesk'] },
  { key: 'beauty', label: 'Beauty', bio: 'Skincare routines, ingredient breakdowns, and TikTok Shop beauty hauls.', monetization: 'TikTok Shop commissions plus two retained brand deals', handles: ['glowbysofia', 'skinwithana', 'dermnotes'] },
  { key: 'fitness', label: 'Fitness', bio: 'Home workouts, fat-loss programs, and kettlebell coaching for busy parents.', monetization: 'a coaching waitlist and supplement affiliate links', handles: ['fitwithdana', 'coachkettlebell', 'mobilitydaily'] },
  { key: 'food', label: 'Food', bio: 'Quick 15-minute recipes, meal prep, and weekly grocery hauls.', monetization: 'cookware affiliate income and sponsored recipe integrations', handles: ['petitekitchen', 'paninathechef', 'midwestmeals'] },
  { key: 'travel', label: 'Travel', bio: 'Budget travel, mistake-fare alerts, and Southeast Asia itineraries.', monetization: 'booking affiliate links and destination sponsorships', handles: ['travelwiththeo', 'nomadnomvember', 'cheapflighthunter'] },
  { key: 'gaming', label: 'Gaming', bio: 'Gaming clips, indie launch coverage, and speedrun highlights.', monetization: 'indie game promo packages and Creator Fund', handles: ['gamingloops', 'clutchmoments', 'indiedevplays'] },
  { key: 'pets', label: 'Pets', bio: 'Dog training tips, rescue stories, and honest pet product reviews.', monetization: 'pet-gear affiliate links and one recurring sponsor', handles: ['dogdadlogan', 'rescuecatclub', 'pawtrickco'] },
  { key: 'home', label: 'Home', bio: 'Home hacks, small renovations, and tool comparisons on a budget.', monetization: 'tool affiliate commissions and shop links', handles: ['diyhomehacks', 'renovationreese', 'toolbeltdiaries'] },
  { key: 'parenting', label: 'Parenting', bio: 'Toddler activities, parenting hacks, and family budgeting.', monetization: 'activity-kit shop and a subscription box placement', handles: ['momofthree.tips', 'toddlerplaybook'] },
  { key: 'auto', label: 'Auto', bio: 'Car maintenance, EV ownership costs, and detailing demos.', monetization: 'parts affiliate income and local dealer collabs', handles: ['garagewithgraham', 'evcurious'] },
  { key: 'tech', label: 'Tech', bio: 'Gadget reviews, app teardowns, and productivity desk setups.', monetization: 'Amazon Associates and two hardware sponsors', handles: ['techwithtomo', 'gadgetbench', 'appsbyapp'] },
  { key: 'education', label: 'Education', bio: 'Study systems, exam prep, and note-taking workflows for students.', monetization: 'a paid study template pack and course referrals', handles: ['studysmarta', 'mathinminutes'] },
  { key: 'comedy', label: 'Comedy', bio: 'Sketch comedy, meme formats, and workplace bits.', monetization: 'Creator Fund plus brand skit placements', handles: ['comedyreelsdaily', 'deadpan.dan', 'officebits'] },
  { key: 'music', label: 'Music', bio: 'Beat making, dance choreography, and sound tutorials.', monetization: 'sample-pack sales and music-tool affiliates', handles: ['beatmakerbo', 'dancewithmina'] },
  { key: 'fashion', label: 'Fashion', bio: 'Thrift hauls, capsule wardrobes, and outfit formulas.', monetization: 'TikTok Shop fashion commissions and thrift collabs', handles: ['thriftedtheo', 'capsulewardrobe.club'] },
  { key: 'outdoor', label: 'Outdoor', bio: 'Wild camping, ultralight gear, and trail guides.', monetization: 'gear affiliate links and one seasonal sponsor', handles: ['wildcampwendy', 'trailheadtales'] },
  { key: 'health', label: 'Health', bio: 'Sleep hygiene, cortisol routines, and stress protocols.', monetization: 'supplement affiliates and a coaching intake funnel', handles: ['sleepdoctorlane', 'cortisolcoach'] },
  { key: 'business', label: 'Business', bio: 'Small-business marketing, DTC funnels, and ad breakdowns.', monetization: 'a paid community and agency referrals', handles: ['smbmarketingmike', 'dtcfounders'] },
  { key: 'art', label: 'Art', bio: 'Linocut printing, pottery demos, and craft market tips.', monetization: 'print sales and craft-supply affiliates', handles: ['linocutlina', 'potterywithpat'] },
  { key: 'motivation', label: 'Motivation', bio: 'Daily discipline quotes, faith reflections, and habit systems.', monetization: 'digital planner sales and book affiliates', handles: ['dailygrindnotes', 'quietprayers'] },
]

// 层级配额：nano 8 / micro 12 / mid 13 / macro 5 / mega 4
const TIER_PLAN: Array<'nano' | 'micro' | 'mid' | 'macro' | 'mega'> = [
  ...Array<'nano'>(8).fill('nano'), ...Array<'micro'>(12).fill('micro'), ...Array<'mid'>(13).fill('mid'),
  ...Array<'macro'>(5).fill('macro'), ...Array<'mega'>(4).fill('mega'),
]
const FOLLOWER_RANGE: Record<string, [number, number]> = {
  nano: [6_500, 9_900], micro: [12_000, 95_000], mid: [110_000, 480_000],
  macro: [520_000, 980_000], mega: [1_050_000, 1_400_000],
}
const BENCH: Record<string, number> = { nano: 5.0, micro: 3.5, mid: 2.5, macro: 1.8, mega: 1.2 }
// 互动倍率区间（相对层级基准）：大号整体更贴近基准，小号允许更高
const ER_MULT_RANGE: Record<string, [number, number]> = {
  nano: [0.9, 2.2], micro: [0.8, 1.8], mid: [0.7, 1.5], macro: [0.6, 1.2], mega: [0.6, 1.2],
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

// handle → 赛道/画像的扁平清单
const PERSONAS = NICHES.flatMap(n => n.handles.slice(0, 3).map(h => ({ handle: h, niche: n }))).slice(0, TOTAL)
if (PERSONAS.length !== TOTAL) throw new Error(`persona pool too small: ${PERSONAS.length}`)

// 「互动弱号」：固定 7 个位置（与层级无关），制造真实的分化而不是全员优秀
const WEAK_POSITIONS = new Set([3, 9, 16, 22, 28, 34, 39])

interface Generated {
  id: string; username: string; niche: string; followers: number; tier: string
  low: number; mid: number; high: number; er: number; avgPlays: number
  ask: number; status: 'active' | 'sold'; soldPrice: number | null
  prevPrice: number | null; priceChangedAt: Date | null
  createdAt: Date; soldAt: Date | null; evaluatedAt: Date; views: number; watchers: number
  description: string; socialType: string | null; socialHandle: string | null
  contact: string; seller: string
}

function buildPosts(followers: number, targetER: number, growthBias: number, postCount: number, nowSec: number, maxRatio: number): Post[] {
  // 播放/粉丝比：0.07x（稳定更新但触达弱）～ maxRatio（触达强）。该区间经标定：
  // 比值 >0.9 会让引擎估值脱离真实成交价（1.4M 粉算出 $1.5M，市场上并不成立）。
  const playFanRatio = rnd() < 0.12 && maxRatio >= 0.55 ? logUni(0.5, maxRatio) : logUni(0.07, Math.min(0.5, maxRatio))
  const medianPlays = followers * playFanRatio
  const posts: Post[] = []
  for (let i = 0; i < postCount; i++) {
    // i 越小越新；近期帖子按 growthBias 放大/缩小
    const ageDays = (i / postCount) * 190 + uni(0, 6)
    const growthMult = i < postCount / 3 ? growthBias : 1
    const plays = Math.max(400, Math.round(medianPlays * growthMult * Math.exp(uni(-0.9, 0.9))))
    const likes = Math.round(plays * (targetER / 100) * 0.93)
    posts.push({
      id: `${i}`,
      playCount: plays,
      likeCount: likes,
      commentCount: Math.round(likes * uni(0.03, 0.06)),
      shareCount: Math.round(likes * uni(0.015, 0.035)),
      createTime: Math.floor(nowSec - ageDays * 86_400),
      desc: '',
    })
  }
  return posts
}

const nowSec = Math.floor(Date.now() / 1000)
const nowMs = Date.now()
const shuffledTiers = shuffle(TIER_PLAN)
const soldPositions = new Set(shuffle(PERSONAS.map((_, i) => i)).slice(0, SOLD_COUNT))

const generated: Generated[] = []

for (let i = 0; i < TOTAL; i++) {
  const { handle, niche } = PERSONAS[i]
  const tier = shuffledTiers[i]
  const followers = Math.round(logUni(FOLLOWER_RANGE[tier][0], FOLLOWER_RANGE[tier][1]))
  const erMult = WEAK_POSITIONS.has(i) ? uni(0.72, 0.98) : uni(ER_MULT_RANGE[tier][0], ER_MULT_RANGE[tier][1])
  const targetER = BENCH[tier] * erMult
  const growthBias = uni(0.7, 1.9)
  const postCount = clamp(Math.round(logUni(14, 36)), 12, 40)
  const videoCount = Math.round(postCount * uni(1.6, 2.8))

  const posts = buildPosts(followers, targetER, growthBias, postCount, nowSec, tier === 'mega' ? 0.35 : tier === 'macro' ? 0.45 : 0.7)
  const profile: RawProfile = {
    username: handle,
    nickname: handle.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    followerCount: followers,
    followingCount: Math.round(followers * uni(0.004, 0.03)) + 40,
    totalLikes: posts.reduce((s, p) => s + p.likeCount, 0),
    videoCount,
    secUid: `sample-${i}`,
    region: pick(['US', 'US', 'US', 'GB', 'CA', 'AU']),
    bio: niche.bio,
    verified: followers > 500_000 || rnd() < 0.12,
    language: 'en',
    posts,
    dataQuality: 'full',
  }

  // ── 真实引擎：全部估值/评分字段来自这里 ──
  const evaluation = scoreProfile(profile, { now: nowSec })
  const total = evaluation.businessValue.totalValue
  const low = Math.round(total.low), mid = Math.round(total.mid), high = Math.round(total.high)
  const er = Number(evaluation.metrics.engagementRate.toFixed(2))
  const avgPlays = Math.round(evaluation.metrics.avgPlays)

  // 叫价：估值的 55%–85%，且不得低于估值下限的 90%（卖家不会挂得比产品自己给的区间还低）
  let ask = Math.round(mid * uni(0.55, 0.85))
  ask = Math.max(ask, Math.round(low * 0.9))
  ask = Math.max(roundAsk(ask), 99)
  // 卖家报价是"人话"数字，不是引擎直出的 6 位零头
  function roundAsk(v: number): number {
    const step = v < 1_000 ? 10 : v < 10_000 ? 100 : v < 50_000 ? 500 : v < 200_000 ? 1_000 : 5_000
    return Math.round(v / step) * step
  }

  const status: 'active' | 'sold' = soldPositions.has(i) ? 'sold' : 'active'
  const soldPrice = status === 'sold'
    ? roundAsk(clamp(ask * uni(0.88, 0.96), low * 0.75, high))
    : null

  // 降价历史：约 35% 有一次下调
  const hasDrop = rnd() < 0.35 && ask > 200
  const prevPrice = hasDrop ? Math.round(ask * uni(1.15, 1.45)) : null

  // 时间：幂律分散到 240 天，同日最多 2 条（同一赛道不撞车）
  const ageRoll = rnd()
  const ageDays = ageRoll < 0.35 ? uni(0, 30) : ageRoll < 0.75 ? uni(30, 90) : uni(90, 240)
  const createdAt = new Date(nowMs - Math.round(ageDays) * 86_400_000)
  // 估值早于挂牌 1–14 天；老挂牌有一半近期重估过，避免"全部陈旧"
  let evaluatedAt: Date
  const stale = (nowMs - createdAt.getTime()) / 86_400_000 > 60
  if (stale && rnd() < 0.5) evaluatedAt = new Date(nowMs - Math.round(uni(5, 40)) * 86_400_000)
  else evaluatedAt = new Date(createdAt.getTime() - Math.round(uni(1, 14)) * 86_400_000)
  const priceChangedAt = hasDrop
    ? new Date(Math.min(nowMs - 86_400_000, createdAt.getTime() + Math.round(uni(3, 20)) * 86_400_000))
    : null

  const daysOnMarket = Math.max(1, Math.round((nowMs - createdAt.getTime()) / 86_400_000))
  // 成交时间 = 挂牌后若干天（占挂牌期的 25–80%），让"成交周期"统计有真实分布
  const soldAt = status === 'sold'
    ? new Date(createdAt.getTime() + Math.max(1, Math.round(daysOnMarket * uni(0.25, 0.8))) * 86_400_000)
    : null
  const views = Math.round(clamp(uni(8, 40) * Math.pow(daysOnMarket, 0.8), 12, 2400))
  const watchers = Math.floor(views * uni(0.04, 0.09))

  // 描述：4 种语域，数字全部取自上面真实计算的结果
  const cash = `$${Math.round(mid / 1000)}K`
  const registers = [
    `${followers.toLocaleString()} followers, ${er.toFixed(1)}% engagement, ~${avgPlays.toLocaleString()} views per video. Monetized through ${niche.monetization}. Selling because I'm consolidating onto one account — happy to stay on for a 2-week handover.`,
    `${niche.label} account, valued at ${cash} mid. ${er.toFixed(1)}% ER against a ${(er / BENCH[tier]).toFixed(1)}x category benchmark, ${videoCount} videos live, no strikes. ${niche.monetization.charAt(0).toUpperCase() + niche.monetization.slice(1)}.`,
    `Built this ${niche.label.toLowerCase()} page from zero over ${Math.round(uni(8, 26))} months. ~${avgPlays.toLocaleString()} avg views, audience skews US/UK 25–34. Income: ${niche.monetization}. Escrow only, no lowballers.`,
    `Selling a ${niche.label.toLowerCase()} account with a clean history: ${followers.toLocaleString()} followers, ${er.toFixed(1)}% engagement, last 30 days ~${Math.round(avgPlays * 1.1).toLocaleString()} avg views. ${niche.monetization.charAt(0).toUpperCase() + niche.monetization.slice(1)}. Reason for selling: ${pick(['relocating and can no longer post daily', 'moving budget into a second channel', 'day job changed my posting schedule', 'shifting to a paid community instead'])}. Ask is flexible for a fast, clean close.`,
  ]
  const description = registers[Math.floor(rnd() * registers.length)]

  const socialType = rnd() < 0.55 ? pick(['discord', 'telegram', 'whatsapp']) : null
  const socialHandle = socialType === 'whatsapp' ? `+1 4${Math.floor(uni(10, 99))} 555 0${Math.floor(uni(100, 999))}`
    : socialType === 'telegram' ? `@${handle.replace(/[^a-z0-9]/g, '_')}`
    : socialType === 'discord' ? `${handle}#${Math.floor(uni(1000, 9999))}` : null
  const domain = handle.replace(/[^a-z0-9]/g, '')
  const contact = `deals@${domain}.co`
  const seller = `owner@${domain}.co`

  generated.push({
    id: String(21_000_000 + i * 137_011), username: handle, niche: niche.label,
    followers, tier: evaluation.tier, low, mid, high, er, avgPlays,
    ask, status, soldPrice, prevPrice, priceChangedAt, createdAt, soldAt, evaluatedAt,
    views, watchers, description, socialType, socialHandle, contact, seller,
  })
}

// 同一天最多 2 条挂牌：按日期分组，超过则顺延 +1 天
{
  const byDay = new Map<string, number>()
  for (const g of generated.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    let day = g.createdAt.toISOString().slice(0, 10)
    let n = byDay.get(day) ?? 0
    while (n >= 2) {
      g.createdAt = new Date(g.createdAt.getTime() + 86_400_000)
      day = g.createdAt.toISOString().slice(0, 10)
      n = byDay.get(day) ?? 0
    }
    byDay.set(day, n + 1)
  }
}

// ── 写库 ──────────────────────────────────────────────────────────────
const env = readFileSync('.env.local', 'utf8')
const url = env.match(/DATABASE_URL=("?)([^"\n]+)\1/)?.[2]
if (!url) throw new Error('DATABASE_URL not found in .env.local')
const sql = neon(url)

await sql`CREATE TABLE IF NOT EXISTS marketplace_listings (
  id TEXT PRIMARY KEY, username TEXT NOT NULL, seller_email TEXT NOT NULL,
  asking_price_usd INTEGER NOT NULL, description TEXT, contact_email TEXT NOT NULL,
  social_type TEXT, social_handle TEXT, snapshot_tier TEXT, snapshot_valuation_low INTEGER,
  snapshot_valuation_high INTEGER, snapshot_valuation_usd INTEGER, snapshot_followers INTEGER,
  snapshot_engagement_rate REAL, snapshot_evaluated_at TIMESTAMPTZ, refreshed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active', report_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
// 列名无法用参数化模板（会被引号化），因此逐条显式 DDL
await sql`ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT FALSE`
await sql`ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS sold_price_usd INTEGER`
await sql`ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS price_previous_usd INTEGER`
await sql`ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS price_changed_at TIMESTAMPTZ`
await sql`ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0`
await sql`ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS watcher_count INTEGER NOT NULL DEFAULT 0`
await sql`ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS niche TEXT`
await sql`ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS snapshot_avg_plays INTEGER`

// v1 手写种子（与旧脚本 DEMO 一一对应，且已被本脚本取代）
const LEGACY_DEMO_IDS = ['48213974', '15947263', '73628159', '29471836', '61839472', '84256317', '37592648', '52684193']
for (const id of LEGACY_DEMO_IDS) await sql`DELETE FROM marketplace_listings WHERE id = ${id}`

for (const g of generated) {
  await sql`
    INSERT INTO marketplace_listings (
      id, username, seller_email, asking_price_usd, description, contact_email, social_type, social_handle,
      snapshot_tier, snapshot_valuation_low, snapshot_valuation_high, snapshot_valuation_usd,
      snapshot_followers, snapshot_engagement_rate, snapshot_evaluated_at,
      status, report_count, created_at, updated_at,
      niche, snapshot_avg_plays, is_sample, sold_price_usd, price_previous_usd, price_changed_at,
      view_count, watcher_count
    ) VALUES (
      ${g.id}, ${g.username}, ${g.seller}, ${g.ask}, ${g.description}, ${g.contact}, ${g.socialType}, ${g.socialHandle},
      ${g.tier}, ${g.low}, ${g.high}, ${g.mid},
      ${g.followers}, ${g.er}, ${g.evaluatedAt},
      ${g.status}, 0, ${g.createdAt}, ${g.soldAt ?? g.createdAt},
      ${g.niche}, ${g.avgPlays}, TRUE, ${g.soldPrice}, ${g.prevPrice}, ${g.priceChangedAt},
      ${g.views}, ${g.watchers}
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username, seller_email = EXCLUDED.seller_email,
      asking_price_usd = EXCLUDED.asking_price_usd, description = EXCLUDED.description,
      contact_email = EXCLUDED.contact_email, social_type = EXCLUDED.social_type, social_handle = EXCLUDED.social_handle,
      snapshot_tier = EXCLUDED.snapshot_tier, snapshot_valuation_low = EXCLUDED.snapshot_valuation_low,
      snapshot_valuation_high = EXCLUDED.snapshot_valuation_high, snapshot_valuation_usd = EXCLUDED.snapshot_valuation_usd,
      snapshot_followers = EXCLUDED.snapshot_followers, snapshot_engagement_rate = EXCLUDED.snapshot_engagement_rate,
      snapshot_evaluated_at = EXCLUDED.snapshot_evaluated_at, status = EXCLUDED.status,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, niche = EXCLUDED.niche,
      snapshot_avg_plays = EXCLUDED.snapshot_avg_plays, is_sample = TRUE,
      sold_price_usd = EXCLUDED.sold_price_usd, price_previous_usd = EXCLUDED.price_previous_usd,
      price_changed_at = EXCLUDED.price_changed_at, view_count = EXCLUDED.view_count,
      watcher_count = EXCLUDED.watcher_count`
}

// ── 自检（对应 spec 第 7 节 1–8 条）────────────────────────────────────
const rows = await sql`SELECT * FROM marketplace_listings WHERE is_sample = TRUE ORDER BY created_at DESC` as Array<Record<string, unknown>>
const fail: string[] = []
const ages = rows.map(r => Math.round((nowMs - new Date(String(r.created_at)).getTime()) / 86_400_000))

console.log('\n=== 生成结果 ===')
for (const r of rows) {
  const f = Number(r.snapshot_followers), er = Number(r.snapshot_engagement_rate)
  const t = f < 10_000 ? 'nano' : f < 100_000 ? 'micro' : f < 500_000 ? 'mid' : f < 1_000_000 ? 'macro' : 'mega'
  console.log([
    String(r.id).padEnd(8), String(r.username).padEnd(22), String(r.status).padEnd(6),
    t.padEnd(5), String(r.snapshot_tier), `ER ${er.toFixed(1)}%/${BENCH[t]}(x${(er / BENCH[t]).toFixed(2)})`,
    `ask $${r.asking_price_usd}`, `mid $${r.snapshot_valuation_usd}`,
    `${Math.round((nowMs - new Date(String(r.created_at)).getTime()) / 86_400_000)}d`,
  ].join(' | '))
}

const tierCount: Record<string, number> = {}
for (const r of rows) {
  const f = Number(r.snapshot_followers)
  const t = f < 10_000 ? 'nano' : f < 100_000 ? 'micro' : f < 500_000 ? 'mid' : f < 1_000_000 ? 'macro' : 'mega'
  tierCount[t] = (tierCount[t] ?? 0) + 1
}
const ratios = rows.map(r => {
  const f = Number(r.snapshot_followers)
  const t = f < 10_000 ? 'nano' : f < 100_000 ? 'micro' : f < 500_000 ? 'mid' : f < 1_000_000 ? 'macro' : 'mega'
  return Number(r.snapshot_engagement_rate) / BENCH[t]
})
const below = ratios.filter(r => r < 1.0).length
const above = ratios.filter(r => r > 1.5).length
const sameDay = new Map<string, number>()
for (const r of rows) {
  const d = new Date(String(r.created_at)).toISOString().slice(0, 10)
  sameDay.set(d, (sameDay.get(d) ?? 0) + 1)
}
const activeBelowLow = rows.filter(r => r.status === 'active' && Number(r.asking_price_usd) < Number(r.snapshot_valuation_low) * 0.9)

if (rows.length !== TOTAL) fail.push(`count ${rows.length} != ${TOTAL}`)
if (Math.max(...ages) - Math.min(...ages) < 200) fail.push(`age span ${Math.max(...ages) - Math.min(...ages)} < 200`)
if ([...sameDay.values()].some(n => n > 2)) fail.push(`same-day clustering > 2: ${[...sameDay.entries()].filter(([, n]) => n > 2)}`)
// 真实的互动率分布：约 25–30% 高于赛道基准 1.5x（爆款/垂类强互动），多数落在 0.7–1.5x 之间。
// 阈值按比例而非绝对数，允许随机序列在合理区间内浮动。
if (below < Math.floor(TOTAL * 0.2)) fail.push(`below-benchmark count ${below} < 20% of rows`)
if (above > Math.ceil(TOTAL * 0.3)) fail.push(`above-1.5x count ${above} > 30% of rows`)
for (const t of ['nano', 'micro', 'mid', 'macro', 'mega']) if ((tierCount[t] ?? 0) < 4) fail.push(`tier ${t} only ${tierCount[t]}`)
if (activeBelowLow.length) fail.push(`ask < low*0.9: ${activeBelowLow.map(r => r.username).join(',')}`)
if (rows.filter(r => r.status === 'sold' && r.sold_price_usd == null).length) fail.push('sold rows missing sold_price_usd')

console.log('\n=== 自检 ===')
console.log('rows:', rows.length, '| age span:', `${Math.min(...ages)}–${Math.max(...ages)}d`)
console.log('tiers:', tierCount)
console.log('ER/benchmark: below 1.0x =', below, '| above 1.5x =', above)
console.log('max per day:', Math.max(...sameDay.values()))
console.log(fail.length ? `FAIL:\n - ${fail.join('\n - ')}` : 'PASS 全部断言通过')
if (fail.length) process.exitCode = 1
